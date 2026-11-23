import {
  AskResponse,
  Citation,
  DocumentChunk,
  DocumentFileType,
  DocumentPage,
  QuestionIntent,
  SystemStatus,
} from '../types/knowledge.ts';
import { FIREBASE_PROJECT_ID } from './firebase.ts';
import {
  detectQuestionIntent,
  extractFocusedEvidenceSnippets,
} from './retrieval.ts';

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitLongTextIntoPages(fullText: string, charsPerPage = 2200): DocumentPage[] {
  const cleaned = normalizeText(fullText);
  if (!cleaned) return [];

  if (cleaned.includes('\f')) {
    return cleaned
      .split('\f')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((content, idx) => ({ pageNumber: idx + 1, content }));
  }

  const paragraphs = cleaned.split(/\n{2,}/);
  const pages: DocumentPage[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (current.length > 0 && current.length + para.length > charsPerPage) {
      pages.push({ pageNumber: pages.length + 1, content: current.trim() });
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }

  if (current.trim()) {
    pages.push({ pageNumber: pages.length + 1, content: current.trim() });
  }

  return pages;
}

function detectClientFileType(filename: string): DocumentFileType | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.txt')) return 'txt';
  if (lower.endsWith('.md')) return 'md';
  return null;
}

function chunkDocumentPages(
  documentId: string,
  libraryId: string,
  pages: DocumentPage[]
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const rawBlocks = page.content
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter((b) => b.length > 0);

    let currentSection: string | null = null;
    let buffer = '';

    const flush = () => {
      const cleaned = buffer.trim();
      if (!cleaned) return;
      chunks.push({
        id: `chk_${documentId}_${chunkIndex}`,
        documentId,
        libraryId,
        pageNumber: page.pageNumber,
        sectionTitle: currentSection,
        chunkIndex,
        content: cleaned,
      });
      chunkIndex += 1;
      buffer = '';
    };

    for (const block of rawBlocks) {
      const firstLine = block.split('\n')[0].trim();
      const looksLikeHeading =
        /^(\d+\.\s+[A-Z]|#{1,4}\s+)/.test(firstLine) && firstLine.length <= 90;

      if (looksLikeHeading) {
        if (buffer.length > 180) {
          flush();
        }
        currentSection = firstLine.replace(/^#+\s*/, '');
      }

      if (buffer.length + block.length > 900 && buffer.length > 0) {
        flush();
      }

      buffer = buffer ? `${buffer}\n\n${block}` : block;
    }

    flush();
  }

  return chunks;
}

export async function extractDocumentInBrowser(params: {
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
}> {
  const { file, documentId, libraryId } = params;
  const fileType = detectClientFileType(file.name);
  if (!fileType) {
    throw new Error('Unsupported file type. Allowed formats: PDF, DOCX, TXT, MD.');
  }

  let pages: DocumentPage[] = [];

  if (fileType === 'pdf') {
    const { extractText } = await import('unpdf');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await extractText(bytes, { mergePages: false });
    const rawPages = Array.isArray(result.text) ? result.text : [String(result.text || '')];
    pages = rawPages
      .map((pageText, index) => ({
        pageNumber: index + 1,
        content: normalizeText(pageText),
      }))
      .filter((p) => p.content.length > 0);

    if (pages.length === 0) {
      throw new Error(
        'No selectable text could be extracted from this PDF. Scanned image-only PDFs require OCR before upload.'
      );
    }
  } else if (fileType === 'docx') {
    const mammothModule = await import('mammoth');
    const mammoth = mammothModule.default ?? mammothModule;
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    pages = splitLongTextIntoPages(result.value || '');
    if (pages.length === 0) {
      throw new Error(
        'The uploaded DOCX file appears to be empty or contains no extractable text.'
      );
    }
  } else {
    const decoded = await file.text();
    pages = splitLongTextIntoPages(decoded);
    if (pages.length === 0) {
      throw new Error('The uploaded text file is empty.');
    }
  }

  const chunks = chunkDocumentPages(documentId, libraryId, pages);
  if (chunks.length === 0) {
    throw new Error('No indexable text chunks could be produced from this file.');
  }

  return {
    filename: file.name,
    fileType,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    pages,
    chunks,
  };
}

export function getStaticSystemStatus(): SystemStatus {
  return {
    appMode: 'firebase-authenticated',
    ragMode: 'static-browser',
    operatingMode: 'evidence-only',
    geminiConfigured: false,
    openaiConfigured: false,
    supabaseConfigured: false,
    firebaseProjectId: FIREBASE_PROJECT_ID || 'configured',
    activeRagEngine: 'Evidence-Only Mode (Static Host — Connect Node Backend for AI Synthesis)',
    activeGenerationModel: null,
    configuredGenerationModels: [],
    activeEmbeddingModel: 'gemini-embedding-2 (server required)',
    backendConnectionStatus: 'unavailable',
    lastApiStatusCode: null,
    lastRequestDurationMs: null,
    lastRetrievedPassagesCount: null,
    lastErrorCategory: 'backend-connectivity',
    lastErrorDetail:
      'Static hosting (such as GitHub Pages) cannot run Node.js or store server API keys. Set VITE_API_BASE_URL to connect an external backend.',
    activePersistence: `Cloud Firestore (${FIREBASE_PROJECT_ID || 'configured'})`,
    activeStorage: 'Firebase Storage',
    maxUploadSizeMb: 25,
    supportedExtensions: ['PDF', 'DOCX', 'TXT', 'MD'],
  };
}

export interface StaticAnswerPayload {
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
  candidates: Array<{
    chunk: DocumentChunk;
    documentTitle: string;
    fileType: DocumentFileType;
    libraryId?: string;
    libraryName?: string;
    folderName: string | null;
    score: number;
  }>;
}

const STATIC_INSUFFICIENT_MESSAGE =
  'I cannot answer this question based on the information available in your selected knowledge libraries.';

export function generateStaticGroundedAnswer(payload: StaticAnswerPayload): AskResponse {
  const startedAt = Date.now();
  const {
    libraryId,
    libraryName,
    vectorStoreId,
    libraries,
    readyDocumentsSearched,
    processingDocumentsSkipped,
    question,
    candidates,
  } = payload;

  const questionIntent = payload.questionIntent || detectQuestionIntent(question);

  const scopedLibraries =
    libraries && libraries.length > 0
      ? libraries
      : [{ libraryId, libraryName, vectorStoreId }];

  const libraryIds = scopedLibraries.map((l) => l.libraryId);
  const libraryNames = scopedLibraries.map((l) => l.libraryName);
  const scopeDisplayName = libraryNames.length > 1 ? libraryNames.join(', ') : libraryName;
  const scopeLabel =
    libraryNames.length > 1
      ? `${libraryNames.length} knowledge libraries (${scopeDisplayName})`
      : `knowledge library "${libraryName}"`;

  const processingWarning =
    processingDocumentsSkipped > 0
      ? `${processingDocumentsSkipped} document${processingDocumentsSkipped === 1 ? ' is' : 's are'} still indexing and excluded from search until Ready.`
      : null;

  const retrievalSteps = [
    `Intent classified: ${questionIntent}`,
    `Scoped retrieval to ${scopeLabel}`,
    `Searched ${readyDocumentsSearched} indexed document${readyDocumentsSearched === 1 ? '' : 's'}`,
    `Retrieved ${candidates.length} candidate passage${candidates.length === 1 ? '' : 's'} (Evidence-Only Mode)`,
  ];

  const notice =
    'AI answer synthesis requires a connected Node.js backend server with GEMINI_API_KEY (unavailable on static GitHub Pages without VITE_API_BASE_URL). Showing verified matching source extracts only.';

  if (readyDocumentsSearched === 0 || candidates.length === 0) {
    const emptyMsg =
      processingDocumentsSkipped > 0
        ? `${STATIC_INSUFFICIENT_MESSAGE} (${processingDocumentsSkipped} recently uploaded document${processingDocumentsSkipped === 1 ? ' is' : 's are'} still processing and will become searchable once indexing completes.)`
        : STATIC_INSUFFICIENT_MESSAGE;

    return {
      answer: emptyMsg,
      insufficientEvidence: true,
      citations: [],
      libraryId,
      libraryName: scopeDisplayName,
      libraryIds,
      libraryNames,
      vectorStoreId,
      readyDocumentsSearched,
      processingDocumentsSkipped,
      processingWarning,
      retrievalSteps,
      operatingMode: 'evidence-only',
      activeModel: null,
      questionIntent,
      retrievedPassageCount: candidates.length,
      durationMs: Date.now() - startedAt,
      cached: false,
      generationNotice: notice,
    };
  }

  const chosen = extractFocusedEvidenceSnippets({
    question,
    intent: questionIntent,
    candidates,
  });

  if (chosen.length === 0) {
    return {
      answer: STATIC_INSUFFICIENT_MESSAGE,
      insufficientEvidence: true,
      citations: [],
      libraryId,
      libraryName: scopeDisplayName,
      libraryIds,
      libraryNames,
      vectorStoreId,
      readyDocumentsSearched,
      processingDocumentsSkipped,
      processingWarning,
      retrievalSteps,
      operatingMode: 'evidence-only',
      activeModel: null,
      questionIntent,
      retrievedPassageCount: candidates.length,
      durationMs: Date.now() - startedAt,
      cached: false,
      generationNotice: notice,
    };
  }

  const verifiedCitations: Citation[] = [];
  const seenDocPage = new Set<string>();
  const lines: string[] = [];

  for (const item of chosen) {
    const matched = item.candidate;
    const matchedLibId = matched.libraryId || matched.chunk.libraryId || libraryId;
    const matchedLibName =
      matched.libraryName ||
      scopedLibraries.find((l) => l.libraryId === matchedLibId)?.libraryName ||
      libraryName;

    const dedupeKey = `${matchedLibId}:${matched.chunk.documentId}:${matched.chunk.pageNumber}`;
    let markerNum = verifiedCitations.length + 1;

    if (!seenDocPage.has(dedupeKey)) {
      seenDocPage.add(dedupeKey);
      const excerpt = item.text.slice(0, 220).trim() || matched.chunk.content.slice(0, 200).trim();
      verifiedCitations.push({
        id: `cit_${matched.chunk.id}`,
        chunkId: matched.chunk.id,
        documentId: matched.chunk.documentId,
        documentTitle: matched.documentTitle,
        fileType: matched.fileType,
        libraryId: matchedLibId,
        libraryName: matchedLibName,
        folderName: matched.folderName,
        pageNumber: matched.chunk.pageNumber,
        pageLabel: `p. ${matched.chunk.pageNumber}`,
        sectionTitle: matched.chunk.sectionTitle,
        excerpt,
        relevanceScore: Number(matched.score.toFixed(3)),
      });
    } else {
      const idx = verifiedCitations.findIndex(
        (c) => `${c.libraryId}:${c.documentId}:${c.pageNumber}` === dedupeKey
      );
      if (idx >= 0) markerNum = idx + 1;
    }

    lines.push(`• "${item.text}" [${markerNum}]`);
  }

  return {
    answer: lines.join('\n'),
    insufficientEvidence: false,
    citations: verifiedCitations,
    libraryId,
    libraryName: scopeDisplayName,
    libraryIds,
    libraryNames,
    vectorStoreId,
    readyDocumentsSearched,
    processingDocumentsSkipped,
    processingWarning,
    retrievalSteps,
    operatingMode: 'evidence-only',
    activeModel: null,
    questionIntent,
    retrievedPassageCount: candidates.length,
    durationMs: Date.now() - startedAt,
    cached: false,
    generationNotice: notice,
  };
}
