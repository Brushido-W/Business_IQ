import {
  ApiErrorCategory,
  AskResponse,
  ConnectionTestResult,
  DocumentChunk,
  DocumentFileType,
  DocumentPage,
  QuestionIntent,
  SystemStatus,
} from '../types/knowledge.ts';
import {
  extractDocumentInBrowser,
  generateStaticGroundedAnswer,
  getStaticSystemStatus,
} from './clientFallback.ts';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

function resolveApiUrl(path: string): string {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

class StaticHostApiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaticHostApiUnavailableError';
  }
}

let cachedStaticMode = false;

function isLikelyStaticHostOrigin(): boolean {
  if (API_BASE_URL) return false;
  if (typeof window === 'undefined') return false;
  return window.location.hostname.endsWith('github.io');
}

interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

async function request<T>(path: string, options?: RequestOptions): Promise<T> {
  if (cachedStaticMode && !API_BASE_URL) {
    throw new StaticHostApiUnavailableError('Running in static hosting mode.');
  }

  const { timeoutMs = 20000, signal: externalSignal, ...fetchOptions } = options || {};
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  try {
    const res = await fetch(resolveApiUrl(path), {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        ...(fetchOptions.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(fetchOptions.headers || {}),
      },
    });

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const isJson = contentType.includes('application/json');

    // Static web servers (like GitHub Pages) return 404, 405, or HTML index fallback for /api/*
    if (res.status === 405 || res.status === 404 || (res.ok && !isJson)) {
      cachedStaticMode = true;
      throw new StaticHostApiUnavailableError(
        `Static host returned HTTP ${res.status} for ${path}`
      );
    }

    const data = isJson ? await res.json().catch(() => ({})) : {};
    if (!res.ok) {
      throw new Error(data?.error || `Request failed with status ${res.status}`);
    }
    return data as T;
  } catch (err: unknown) {
    if (err instanceof StaticHostApiUnavailableError) {
      throw err;
    }
    if (timedOut) {
      throw new Error(
        'The server request timed out while processing your request. Please try again.'
      );
    }
    if (isLikelyStaticHostOrigin()) {
      cachedStaticMode = true;
      throw new StaticHostApiUnavailableError('No backend API server detected on GitHub Pages.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

export const api = {
  getSystemStatus: async (): Promise<SystemStatus> => {
    try {
      return await request<SystemStatus>('/api/system/status', { timeoutMs: 8000 });
    } catch (err) {
      if (err instanceof StaticHostApiUnavailableError) {
        return getStaticSystemStatus();
      }
      throw err;
    }
  },

  testConnection: async (): Promise<ConnectionTestResult> => {
    try {
      return await request<ConnectionTestResult>('/api/system/test-connection', {
        method: 'POST',
        timeoutMs: 18000,
      });
    } catch (err) {
      if (err instanceof StaticHostApiUnavailableError) {
        return {
          testedAt: new Date().toISOString(),
          overallOk: false,
          operatingMode: 'evidence-only',
          activeGenerationModel: null,
          activeEmbeddingModel: 'gemini-embedding-2 (server required)',
          embeddingProbe: {
            model: 'gemini-embedding-2',
            ok: false,
            statusCode: 0,
            durationMs: 0,
            category: 'backend-connectivity',
            detail: 'No Express backend reachable on this static host (set VITE_API_BASE_URL).',
          },
          generationProbes: [],
        };
      }
      throw err;
    }
  },

  extractDocument: async (params: {
    file: File;
    documentId: string;
    libraryId: string;
  }): Promise<{
    filename: string;
    fileType: DocumentFileType;
    mimeType: string;
    sizeBytes: number;
    pages: DocumentPage[];
    chunks: DocumentChunk[];
  }> => {
    const formData = new FormData();
    formData.append('documentId', params.documentId);
    formData.append('libraryId', params.libraryId);
    formData.append('file', params.file);
    try {
      return await request<{
        filename: string;
        fileType: DocumentFileType;
        mimeType: string;
        sizeBytes: number;
        pages: DocumentPage[];
        chunks: DocumentChunk[];
      }>('/api/documents/extract', {
        method: 'POST',
        body: formData,
        timeoutMs: 25000,
      });
    } catch (err) {
      if (err instanceof StaticHostApiUnavailableError) {
        return extractDocumentInBrowser(params);
      }
      throw err;
    }
  },

  embedTexts: async (
    texts: string[]
  ): Promise<{
    embeddings: Array<number[] | null>;
    statusCode?: number;
    errorCategory?: ApiErrorCategory;
  }> => {
    try {
      return await request<{
        embeddings: Array<number[] | null>;
        statusCode?: number;
        errorCategory?: ApiErrorCategory;
      }>('/api/rag/embed', {
        method: 'POST',
        body: JSON.stringify({ texts }),
        timeoutMs: 10000,
      });
    } catch (err) {
      if (err instanceof StaticHostApiUnavailableError) {
        return {
          embeddings: texts.map(() => null),
          statusCode: 0,
          errorCategory: 'backend-connectivity',
        };
      }
      throw err;
    }
  },

  answerFromCandidates: async (payload: {
    libraryId: string;
    libraryName: string;
    vectorStoreId: string;
    libraries?: Array<{
      libraryId: string;
      libraryName: string;
      vectorStoreId: string;
    }>;
    readyDocumentsSearched: number;
    processingDocumentsSkipped: number;
    question: string;
    questionIntent?: QuestionIntent;
    retrievalMode?: 'full-rag' | 'lightweight-rag';
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    candidates: Array<{
      chunk: DocumentChunk;
      documentTitle: string;
      fileType: DocumentFileType;
      libraryId?: string;
      libraryName?: string;
      folderName: string | null;
      score: number;
    }>;
  }): Promise<AskResponse> => {
    try {
      return await request<AskResponse>('/api/rag/answer', {
        method: 'POST',
        body: JSON.stringify(payload),
        timeoutMs: 30000,
      });
    } catch (err) {
      if (err instanceof StaticHostApiUnavailableError) {
        return generateStaticGroundedAnswer(payload);
      }
      throw err;
    }
  },
};
