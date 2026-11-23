export type DocumentFileType = 'pdf' | 'docx' | 'txt' | 'md';

export type DocumentStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export interface UserProfile {
  userId: string;
  displayName: string;
  email: string | null;
  photoURL: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeLibrary {
  id: string;
  libraryId: string;
  userId: string;
  name: string;
  description: string;
  vectorStoreId: string;
  createdAt: string;
  updatedAt: string;
  documentCount?: number;
  readyDocumentCount?: number;
  processingDocumentCount?: number;
  folderCount?: number;
}

export interface Folder {
  id: string;
  folderId: string;
  libraryId: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  documentCount?: number;
}

export interface DocumentPage {
  pageNumber: number;
  content: string;
}

export interface DocumentRecord {
  id: string;
  documentId: string;
  libraryId: string;
  folderId: string | null;
  userId: string;
  folderName?: string;
  libraryName?: string;
  filename: string;
  fileType: DocumentFileType;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
  storagePath: string | null;
  downloadUrl: string | null;
  storageUploaded: boolean;
  providerFileId: string;
  vectorStoreId: string;
  status: DocumentStatus;
  errorMessage: string | null;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentDetail extends DocumentRecord {
  pages: DocumentPage[];
}

export interface DocumentChunk {
  id: string;
  chunkId?: string;
  documentId: string;
  libraryId: string;
  userId?: string;
  pageNumber: number;
  sectionTitle: string | null;
  chunkIndex: number;
  content: string;
  embedding?: number[];
}

export interface Citation {
  id: string;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  fileType: DocumentFileType;
  libraryId: string;
  libraryName?: string;
  folderName: string | null;
  pageNumber: number;
  pageLabel: string;
  sectionTitle: string | null;
  excerpt: string;
  relevanceScore: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  libraryId: string;
  libraryName: string;
  libraryIds?: string[];
  libraryNames?: string[];
  citations?: Citation[];
  insufficientEvidence?: boolean;
  processingWarning?: string | null;
  isError?: boolean;
  operatingMode?: RagOperatingMode;
  activeModel?: string | null;
  generationNotice?: string | null;
  cached?: boolean;
}

export type RagOperatingMode = 'full-rag' | 'lightweight-rag' | 'evidence-only';

export type QuestionIntent =
  | 'definition'
  | 'procedure'
  | 'comparison'
  | 'summary'
  | 'general';

export type ApiErrorCategory =
  | 'none'
  | 'rate-limit'
  | 'quota-exhausted'
  | 'model-overload'
  | 'invalid-model'
  | 'auth-failure'
  | 'embedding-failure'
  | 'generation-failure'
  | 'backend-connectivity';

export interface AskResponse {
  answer: string;
  insufficientEvidence: boolean;
  citations: Citation[];
  libraryId: string;
  libraryName: string;
  libraryIds?: string[];
  libraryNames?: string[];
  vectorStoreId: string;
  readyDocumentsSearched: number;
  processingDocumentsSkipped: number;
  processingWarning: string | null;
  retrievalSteps: string[];
  operatingMode?: RagOperatingMode;
  activeModel?: string | null;
  questionIntent?: QuestionIntent;
  retrievedPassageCount?: number;
  durationMs?: number;
  cached?: boolean;
  apiStatusCode?: number;
  errorCategory?: ApiErrorCategory;
  generationNotice?: string | null;
}

export interface ModelProbeResult {
  model: string;
  ok: boolean;
  statusCode: number;
  durationMs: number;
  category: ApiErrorCategory;
  detail: string;
}

export interface ConnectionTestResult {
  testedAt: string;
  overallOk: boolean;
  operatingMode: RagOperatingMode;
  activeGenerationModel: string | null;
  activeEmbeddingModel: string;
  embeddingProbe: ModelProbeResult;
  generationProbes: ModelProbeResult[];
}

export interface SystemStatus {
  appMode: 'firebase-authenticated';
  ragMode?: 'gemini-server' | 'static-browser' | 'unconfigured';
  operatingMode: RagOperatingMode;
  geminiConfigured: boolean;
  openaiConfigured: boolean;
  supabaseConfigured: boolean;
  firebaseProjectId: string;
  activeRagEngine: string;
  activeGenerationModel: string | null;
  configuredGenerationModels?: string[];
  activeEmbeddingModel: string;
  backendConnectionStatus: 'connected' | 'degraded' | 'unavailable';
  lastApiStatusCode: number | null;
  lastRequestDurationMs: number | null;
  lastRetrievedPassagesCount: number | null;
  lastErrorCategory?: ApiErrorCategory;
  lastErrorDetail?: string | null;
  activePersistence: string;
  activeStorage: string;
  maxUploadSizeMb: number;
  supportedExtensions: string[];
}
