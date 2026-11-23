import { extractText } from 'unpdf';
import mammoth from 'mammoth';
import type { DocumentFileType, DocumentPage } from '../src/types/knowledge.ts';

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

  // Respect explicit form-feed page breaks if present
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

export async function extractDocumentPages(
  buffer: Buffer,
  fileType: DocumentFileType
): Promise<DocumentPage[]> {
  if (fileType === 'pdf') {
    const result = await extractText(new Uint8Array(buffer), { mergePages: false });
    const rawPages = Array.isArray(result.text) ? result.text : [String(result.text || '')];
    const pages: DocumentPage[] = rawPages
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
    return pages;
  }

  if (fileType === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    const pages = splitLongTextIntoPages(result.value || '');
    if (pages.length === 0) {
      throw new Error('The uploaded DOCX file appears to be empty or contains no extractable text.');
    }
    return pages;
  }

  // TXT or MD
  const decoded = buffer.toString('utf8');
  const pages = splitLongTextIntoPages(decoded);
  if (pages.length === 0) {
    throw new Error('The uploaded text file is empty.');
  }
  return pages;
}
