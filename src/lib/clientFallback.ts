import {
  AskResponse,
  Citation,
  DocumentChunk,
  DocumentFileType,
  DocumentPage,
  SystemStatus,
} from '../types/knowledge.ts';
import { FIREBASE_PROJECT_ID } from './firebase.ts';

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
    geminiConfigured: false,
    openaiConfigured: false,
    supabaseConfigured: false,
    firebaseProjectId: FIREBASE_PROJECT_ID || 'configured',
    activeRagEngine: 'Browser Grounded Retrieval (Static Hosting Mode)',
    activePersistence: `Cloud Firestore (${FIREBASE_PROJECT_ID || 'configured'})`,
    activeStorage: 'Firebase Storage',
    maxUploadSizeMb: 25,
    supportedExtensions: ['PDF', 'DOCX', 'TXT', 'MD'],
  };
}

const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'for', 'to', 'of',
  'in', 'with', 'as', 'by', 'be', 'are', 'was', 'were', 'it', 'that', 'this',
  'from', 'what', 'how', 'when', 'where', 'who', 'why', 'do', 'does', 'can',
  'our', 'your', 'my', 'their', 'we', 'you', 'they', 'about', 'into', 'new',
  'mean', 'means', 'meaning', 'define', 'definition', 'explain', 'tell', 'describe',
]);

function stemToken(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('es') && token.length > 4) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 3) return token.slice(0, -1);
  if (token.endsWith('ing') && token.length > 5) return token.slice(0, -3);
  if (token.endsWith('ed') && token.length > 4) return token.slice(0, -2);
  return token;
}

function isOverviewQuery(question: string): boolean {
  return /\b(summarize|summary|overview|topics|contents|outline|what is in|what does this (?:library|document|file) cover|list (?:all|the) (?:terms|definitions|rules|policies|topics))\b/i.test(
    question
  );
}

function tokenizeQuestion(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

function splitChunkIntoUnits(content: string): string[] {
  const lines = content
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const units: string[] = [];
  for (const line of lines) {
    if (line.length <= 320) {
      units.push(line);
    } else {
      const sentences = line
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (sentences.length > 1) {
        units.push(...sentences);
      } else {
        units.push(line);
      }
    }
  }
  return units;
}

function scoreUnitAgainstQuestion(unit: string, qTokens: string[], baseScore: number): number {
  if (qTokens.length === 0) return baseScore;
  const lower = unit.toLowerCase();
  const unitTokens = tokenizeQuestion(unit);
  const unitTokenSet = new Set(unitTokens);
  const unitStemSet = new Set(unitTokens.map(stemToken));

  let matched = 0;
  let definitionBoost = 0;

  for (const token of qTokens) {
    const stem = stemToken(token);
    if (unitTokenSet.has(token) || unitStemSet.has(stem)) {
      matched += 1;
      // Boost glossary/definition entries like "Genuine: ..." or "**Genuine** - ..."
      const defPattern = new RegExp(`^(?:\\d+\\.\\s*)?(?:\\*\\*|__)?${token}(?:\\*\\*|__)?\\s*[:\\-–]`, 'i');
      if (defPattern.test(unit.trim())) {
        definitionBoost += 0.65;
      }
    } else if (stem.length >= 4 && lower.includes(stem)) {
      matched += 0.6;
    }
  }

  if (matched === 0) return 0;

  const overlapRatio = matched / qTokens.length;
  return overlapRatio * 0.7 + definitionBoost + baseScore * 0.3;
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

export function generateStaticGroundedAnswer(payload: StaticAnswerPayload): AskResponse {
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
    `Scoped retrieval to ${scopeLabel}`,
    `Searched ${readyDocumentsSearched} indexed document${readyDocumentsSearched === 1 ? '' : 's'}`,
    `Retrieved ${candidates.length} candidate passage${candidates.length === 1 ? '' : 's'} (Static Grounded Mode)`,
  ];

  const insufficientMessage =
    libraryNames.length > 1
      ? "I couldn't find sufficient information in the selected knowledge libraries to answer this question."
      : "I couldn't find sufficient information in the selected knowledge library to answer this question.";

  if (readyDocumentsSearched === 0 || candidates.length === 0) {
    const emptyMsg =
      processingDocumentsSkipped > 0
        ? `${insufficientMessage} (${processingDocumentsSkipped} recently uploaded document${processingDocumentsSkipped === 1 ? ' is' : 's are'} still processing and will become searchable once indexing completes.)`
        : insufficientMessage;

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
    };
  }

  const qTokens = tokenizeQuestion(question);
  const overviewMode = isOverviewQuery(question);

  interface ScoredExtract {
    text: string;
    score: number;
    candidate: StaticAnswerPayload['candidates'][number];
  }

  const extracts: ScoredExtract[] = [];
  for (const candidate of candidates) {
    const units = splitChunkIntoUnits(candidate.chunk.content);
    for (const unit of units) {
      const score = scoreUnitAgainstQuestion(unit, qTokens, candidate.score);
      if (score > 0) {
        extracts.push({ text: unit, score, candidate });
      }
    }
  }

  if (extracts.length === 0 && overviewMode) {
    for (const candidate of candidates.slice(0, 4)) {
      const units = splitChunkIntoUnits(candidate.chunk.content);
      const firstMeaningful = units.find((u) => u.length >= 16) || candidate.chunk.content.slice(0, 240);
      extracts.push({
        text: firstMeaningful,
        score: candidate.score || 0.35,
        candidate,
      });
    }
  }

  extracts.sort((a, b) => b.score - a.score);

  if (extracts.length === 0) {
    return {
      answer: insufficientMessage,
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
    };
  }

  const chosen: ScoredExtract[] = [];
  const seenTexts = new Set<string>();
  for (const item of extracts) {
    const key = item.text.toLowerCase();
    if (seenTexts.has(key)) continue;
    seenTexts.add(key);
    chosen.push(item);
    if (chosen.length >= 4) break;
  }

  const answerText =
    chosen.length === 1
      ? chosen[0].text
      : chosen.map((item, idx) => `${idx + 1}. ${item.text}`).join('\n');

  const verifiedCitations: Citation[] = [];
  const seenDocPage = new Set<string>();

  for (const item of chosen) {
    const matched = item.candidate;
    const matchedLibId = matched.libraryId || matched.chunk.libraryId || libraryId;
    const matchedLibName =
      matched.libraryName ||
      scopedLibraries.find((l) => l.libraryId === matchedLibId)?.libraryName ||
      libraryName;

    const dedupeKey = `${matchedLibId}:${matched.chunk.documentId}:${matched.chunk.pageNumber}`;
    if (seenDocPage.has(dedupeKey)) continue;
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
  }

  return {
    answer: answerText,
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
  };
}
