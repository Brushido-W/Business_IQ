import {
  AskResponse,
  DocumentChunk,
  DocumentFileType,
  DocumentPage,
  SystemStatus,
} from '../types/knowledge.ts';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options?.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }
  return data as T;
}

export const api = {
  getSystemStatus: () => request<SystemStatus>('/api/system/status'),

  extractDocument: (params: { file: File; documentId: string; libraryId: string }) => {
    const formData = new FormData();
    formData.append('documentId', params.documentId);
    formData.append('libraryId', params.libraryId);
    formData.append('file', params.file);
    return request<{
      filename: string;
      fileType: DocumentFileType;
      mimeType: string;
      sizeBytes: number;
      pages: DocumentPage[];
      chunks: DocumentChunk[];
    }>('/api/documents/extract', {
      method: 'POST',
      body: formData,
    });
  },

  embedTexts: (texts: string[]) =>
    request<{ embeddings: Array<number[] | null> }>('/api/rag/embed', {
      method: 'POST',
      body: JSON.stringify({ texts }),
    }),

  answerFromCandidates: (payload: {
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
  }) =>
    request<AskResponse>('/api/rag/answer', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
