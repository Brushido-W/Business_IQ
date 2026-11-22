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
  citations?: Citation[];
  insufficientEvidence?: boolean;
  processingWarning?: string | null;
  isError?: boolean;
}

export interface AskResponse {
  answer: string;
  insufficientEvidence: boolean;
  citations: Citation[];
  libraryId: string;
  libraryName: string;
  vectorStoreId: string;
  readyDocumentsSearched: number;
  processingDocumentsSkipped: number;
  processingWarning: string | null;
  retrievalSteps: string[];
}

export interface SystemStatus {
  appMode: 'firebase-authenticated';
  geminiConfigured: boolean;
  openaiConfigured: boolean;
  supabaseConfigured: boolean;
  firebaseProjectId: string;
  activeRagEngine: string;
  activePersistence: string;
  activeStorage: string;
  maxUploadSizeMb: number;
  supportedExtensions: string[];
}
