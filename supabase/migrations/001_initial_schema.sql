-- Business IQ / KnowledgeBase AI — Supabase PostgreSQL Production Schema
-- Run this migration when transitioning from the pitch prototype store to Supabase PostgreSQL.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Knowledge Libraries (Each library maps 1:1 to an isolated vector store)
CREATE TABLE IF NOT EXISTS knowledge_libraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '',
  vector_store_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Folders (Scoped strictly inside a single knowledge library)
CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id UUID NOT NULL REFERENCES knowledge_libraries(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (library_id, name)
);

-- 3. Documents (Tracks file metadata, provider file ID, and indexing lifecycle)
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id UUID NOT NULL REFERENCES knowledge_libraries(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'docx', 'txt', 'md')),
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  page_count INTEGER NOT NULL DEFAULT 1,
  storage_path TEXT,
  provider_file_id TEXT,
  vector_store_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('uploading', 'processing', 'ready', 'failed')) DEFAULT 'uploading',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Document Pages / Extracted Text (Supports in-app Document Viewer & passage highlighting)
CREATE TABLE IF NOT EXISTS document_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  library_id UUID NOT NULL REFERENCES knowledge_libraries(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL CHECK (page_number >= 1),
  content TEXT NOT NULL,
  UNIQUE (document_id, page_number)
);

-- 5. Indexed Chunks (Library-isolated retrieval records)
CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  library_id UUID NOT NULL REFERENCES knowledge_libraries(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL DEFAULT 1,
  section_title TEXT,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_folders_library ON folders(library_id);
CREATE INDEX IF NOT EXISTS idx_documents_library_status ON documents(library_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_chunks_library_doc ON document_chunks(library_id, document_id);
