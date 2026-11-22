import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { DocumentFileType, SystemStatus } from './src/types/knowledge.ts';
import {
  CandidatePassageInput,
  embedTexts,
  extractAndChunkBuffer,
  generateGroundedAnswer,
  isGeminiConfigured,
} from './server/rag.ts';

const PORT = 3000;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md']);

function readFirebaseProjectId(): string {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { projectId?: string };
      return parsed.projectId || 'configured';
    }
  } catch {
    // ignore
  }
  return 'configured';
}

function detectFileType(filename: string): DocumentFileType | null {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext === '.docx') return 'docx';
  if (ext === '.txt') return 'txt';
  if (ext === '.md') return 'md';
  return null;
}

function sanitizeFilename(filename: string): string {
  const base = path.basename(filename).replace(/[\u0000-\u001f\u007f]/g, '');
  const cleaned = base.replace(/[^a-zA-Z0-9._\-\s()]/g, '_').trim();
  return cleaned.slice(0, 180) || 'document.txt';
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      cb(new Error('Unsupported file type. Allowed formats: PDF, DOCX, TXT, MD.'));
      return;
    }
    cb(null, true);
  },
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '6mb' }));

  // --- System & Health ---
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/system/status', (_req: Request, res: Response) => {
    const geminiReady = isGeminiConfigured();
    const openaiReady = Boolean(process.env.OPENAI_API_KEY?.trim());
    const supabaseReady = Boolean(
      process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    );
    const projectId = readFirebaseProjectId();

    const status: SystemStatus = {
      appMode: 'firebase-authenticated',
      geminiConfigured: geminiReady,
      openaiConfigured: openaiReady,
      supabaseConfigured: supabaseReady,
      firebaseProjectId: projectId,
      activeRagEngine: geminiReady
        ? 'Gemini RAG (gemini-4-hydrogen + gemini-embedding-2)'
        : 'Not Configured',
      activePersistence: `Cloud Firestore (${projectId})`,
      activeStorage: 'Firebase Storage',
      maxUploadSizeMb: 25,
      supportedExtensions: ['PDF', 'DOCX', 'TXT', 'MD'],
    };
    res.json(status);
  });

  // --- Stateless Document Text Extraction & Chunking ---
  app.post(
    '/api/documents/extract',
    upload.single('file'),
    async (req: Request, res: Response) => {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No file provided for extraction.' });
      }

      const safeName = sanitizeFilename(file.originalname);
      const fileType = detectFileType(safeName);
      if (!fileType) {
        return res.status(400).json({
          error: `Unsupported file format for "${safeName}". Supported formats: PDF, DOCX, TXT, MD.`,
        });
      }

      const documentId =
        typeof req.body?.documentId === 'string' && req.body.documentId.trim()
          ? req.body.documentId.trim()
          : `doc_${Date.now()}`;
      const libraryId =
        typeof req.body?.libraryId === 'string' && req.body.libraryId.trim()
          ? req.body.libraryId.trim()
          : 'lib_default';

      try {
        const { pages, chunks } = await extractAndChunkBuffer({
          buffer: file.buffer,
          fileType,
          documentId,
          libraryId,
        });

        return res.json({
          filename: safeName,
          fileType,
          mimeType: file.mimetype || 'application/octet-stream',
          sizeBytes: file.size,
          pages,
          chunks,
        });
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Failed to extract text from document.';
        return res.status(400).json({ error: msg });
      }
    }
  );

  // --- Stateless Embedding Helper (keeps GEMINI_API_KEY server-side) ---
  app.post('/api/rag/embed', async (req: Request, res: Response) => {
    const rawTexts = Array.isArray(req.body?.texts) ? req.body.texts : [];
    const texts = rawTexts
      .filter((t: unknown): t is string => typeof t === 'string' && t.trim().length > 0)
      .slice(0, 24)
      .map((t: string) => t.slice(0, 2000));

    if (texts.length === 0) {
      return res.json({ embeddings: [] });
    }

    try {
      const embeddings = await embedTexts(texts);
      return res.json({ embeddings });
    } catch {
      return res.json({ embeddings: texts.map(() => null) });
    }
  });

  // --- Stateless Grounded RAG Generation ---
  app.post('/api/rag/answer', async (req: Request, res: Response) => {
    const libraryId = typeof req.body?.libraryId === 'string' ? req.body.libraryId.trim() : '';
    const libraryName = typeof req.body?.libraryName === 'string' ? req.body.libraryName.trim() : '';
    const vectorStoreId =
      typeof req.body?.vectorStoreId === 'string' ? req.body.vectorStoreId.trim() : '';
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    const readyDocumentsSearched =
      typeof req.body?.readyDocumentsSearched === 'number' ? req.body.readyDocumentsSearched : 0;
    const processingDocumentsSkipped =
      typeof req.body?.processingDocumentsSkipped === 'number'
        ? req.body.processingDocumentsSkipped
        : 0;
    const candidates = Array.isArray(req.body?.candidates)
      ? (req.body.candidates as CandidatePassageInput[]).slice(0, 8)
      : [];
    const history = Array.isArray(req.body?.history)
      ? req.body.history
          .filter(
            (m: unknown): m is { role: 'user' | 'assistant'; content: string } =>
              typeof m === 'object' &&
              m !== null &&
              ((m as { role?: string }).role === 'user' ||
                (m as { role?: string }).role === 'assistant') &&
              typeof (m as { content?: string }).content === 'string'
          )
          .slice(-6)
      : [];

    if (!libraryId || !libraryName) {
      return res.status(400).json({ error: 'Selected knowledge library metadata is required.' });
    }
    if (!question || question.length > 2000) {
      return res.status(400).json({ error: 'Question must be between 1 and 2000 characters.' });
    }

    try {
      const result = await generateGroundedAnswer({
        libraryId,
        libraryName,
        vectorStoreId: vectorStoreId || `vs_biq_${libraryId}`,
        readyDocumentsSearched,
        processingDocumentsSkipped,
        question,
        candidates,
        conversationHistory: history,
      });
      return res.json(result);
    } catch (err: unknown) {
      console.error('RAG query failed:', err);
      const message =
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred while searching the selected knowledge library.';
      return res.status(500).json({ error: message });
    }
  });

  // Multer & API error handler
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File exceeds the 25 MB maximum size limit.' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  });

  // Frontend serving: Vite middleware in development, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Business IQ — KnowledgeBase AI server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
