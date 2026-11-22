import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Folder,
  FolderInput,
  MessageSquareMore,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { DocumentRecord, Folder as FolderType, KnowledgeLibrary } from '../types/knowledge.ts';
import { FileTypeIcon, StatusPill } from './BrandIcons.tsx';
import { formatShortDate } from '../lib/format.ts';

interface LibraryDetailScreenProps {
  library: KnowledgeLibrary;
  folders: FolderType[];
  documents: DocumentRecord[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onBack: () => void;
  onRenameLibrary: () => void;
  onDeleteLibrary: () => void;
  onAskAboutLibrary: () => void;
  onCreateFolder: () => void;
  onRenameFolder: (folder: FolderType) => void;
  onDeleteFolder: (folder: FolderType) => void;
  onUploadClick: () => void;
  onOpenDocument: (documentId: string) => void;
  onRenameDocument: (doc: DocumentRecord) => void;
  onDeleteDocument: (doc: DocumentRecord) => void;
  onMoveDocument: (docId: string, folderId: string | null) => Promise<void>;
  onReindexDocument: (docId: string) => Promise<void>;
}

export const LibraryDetailScreen: React.FC<LibraryDetailScreenProps> = ({
  library,
  folders,
  documents,
  selectedFolderId,
  onSelectFolder,
  onBack,
  onRenameLibrary,
  onDeleteLibrary,
  onAskAboutLibrary,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onUploadClick,
  onOpenDocument,
  onRenameDocument,
  onDeleteDocument,
  onMoveDocument,
  onReindexDocument,
}) => {
  const [activeTab, setActiveTab] = useState<'documents' | 'details'>('documents');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [libMenuOpen, setLibMenuOpen] = useState(false);
  const [docMenuId, setDocMenuId] = useState<string | null>(null);
  const [moveMenuDocId, setMoveMenuDocId] = useState<string | null>(null);

  const filteredDocuments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return documents.filter((doc) => {
      if (selectedFolderId !== null && doc.folderId !== selectedFolderId) {
        return false;
      }
      if (q) {
        const matchName = doc.filename.toLowerCase().includes(q);
        const matchFolder = (doc.folderName || '').toLowerCase().includes(q);
        if (!matchName && !matchFolder) return false;
      }
      return true;
    });
  }, [documents, selectedFolderId, searchQuery]);

  const allSelected =
    filteredDocuments.length > 0 &&
    filteredDocuments.every((d) => selectedDocIds.includes(d.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedDocIds([]);
    } else {
      setSelectedDocIds(filteredDocuments.map((d) => d.id));
    }
  };

  const toggleOne = (docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  const readyCount = documents.filter((d) => d.status === 'ready').length;
  const processingCount = documents.filter(
    (d) => d.status === 'processing' || d.status === 'uploading'
  ).length;
  const failedCount = documents.filter((d) => d.status === 'failed').length;
  const totalChunks = documents.reduce((acc, d) => acc + (d.chunkCount || 0), 0);

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="max-w-[1160px] mx-auto px-5 sm:px-9 py-6">
        {/* Top Breadcrumb (Matches Screenshot 2 Screen 3) */}
        <div className="flex items-center gap-1.5 text-[13px] text-[#64748B]">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 hover:text-[#0F172A] transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Knowledge Libraries
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8]" />
          <span className="font-semibold text-[#0F172A] truncate">{library.name}</span>
        </div>

        {/* Library Header Row */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <Folder className="w-9 h-9 text-[#2563EB] shrink-0 mt-0.5" strokeWidth={1.75} />
            <div className="min-w-0">
              <h1 className="text-[24px] sm:text-[26px] font-bold tracking-[-0.025em] text-[#0F172A] leading-tight truncate">
                {library.name}
              </h1>
              <p className="text-[14px] text-[#475569] mt-0.5">
                {library.description || 'Standard operating procedures and process documentation.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <button
              type="button"
              onClick={onRenameLibrary}
              title="Rename Library"
              className="w-[38px] h-[38px] flex items-center justify-center bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] hover:border-[#CBD5E1] rounded-[8px] text-[#475569] hover:text-[#0F172A] transition-colors"
              aria-label="Rename library"
            >
              <Pencil className="w-4 h-4" />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setLibMenuOpen((o) => !o)}
                className="w-[38px] h-[38px] flex items-center justify-center bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] hover:border-[#CBD5E1] rounded-[8px] text-[#475569] hover:text-[#0F172A] transition-colors"
                aria-label="More library options"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {libMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-52 bg-white border border-[#E2E8F0] rounded-[8px] shadow-[0_8px_20px_rgba(15,23,42,0.1)] py-1 z-30">
                  <button
                    type="button"
                    onClick={() => {
                      setLibMenuOpen(false);
                      onAskAboutLibrary();
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-[#0F172A] hover:bg-[#F8FAFC] text-left"
                  >
                    <MessageSquareMore className="w-4 h-4 text-[#2563EB]" />
                    Ask AI about this library
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLibMenuOpen(false);
                      onRenameLibrary();
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-[#334155] hover:bg-[#F8FAFC] text-left"
                  >
                    <Pencil className="w-4 h-4 text-[#64748B]" />
                    Rename Library
                  </button>
                  <div className="my-1 border-t border-[#F1F5F9]" />
                  <button
                    type="button"
                    onClick={() => {
                      setLibMenuOpen(false);
                      onDeleteLibrary();
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-[#DC2626] hover:bg-[#FEF2F2] text-left"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Library
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="mt-5 border-b border-[#E2E8F0] flex items-center gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('documents')}
            className={`pb-2.5 text-[13.5px] font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'documents'
                ? 'border-[#2563EB] text-[#2563EB]'
                : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            Folders &amp; Documents
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`pb-2.5 text-[13.5px] font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'details'
                ? 'border-[#2563EB] text-[#2563EB]'
                : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            Details
          </button>
        </div>

        {activeTab === 'documents' ? (
          /* Split Panel: Left Folders + Right Documents Table (1:1 Screenshot 2 Screen 3) */
          <div className="mt-5 flex flex-col lg:flex-row gap-6">
            {/* Left Folder Sidebar */}
            <div className="w-full lg:w-[235px] shrink-0">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-[14px] font-bold text-[#0F172A]">Folders</h2>
                <button
                  type="button"
                  onClick={onCreateFolder}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-medium text-[#334155] bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] hover:border-[#CBD5E1] rounded-[7px] transition-colors whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Folder
                </button>
              </div>

              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => onSelectFolder(null)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-[8px] text-[13.5px] font-medium transition-colors ${
                    selectedFolderId === null
                      ? 'bg-[#EFF6FF] text-[#1D4ED8]'
                      : 'text-[#334155] hover:bg-[#F8FAFC]'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Folder className="w-4 h-4 text-[#2563EB] shrink-0" />
                    <span className="truncate">All Documents</span>
                  </span>
                  <span className="text-[12px] text-[#64748B] tabular-nums">
                    ({documents.length})
                  </span>
                </button>

                {folders.map((folder) => {
                  const isActive = selectedFolderId === folder.id;
                  return (
                    <div
                      key={folder.id}
                      className={`group flex items-center justify-between gap-1 px-3 py-2 rounded-[8px] transition-colors ${
                        isActive
                          ? 'bg-[#EFF6FF] text-[#1D4ED8]'
                          : 'text-[#334155] hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectFolder(folder.id)}
                        className="flex-1 flex items-center gap-2.5 text-left min-w-0 text-[13.5px] font-medium"
                      >
                        <Folder className="w-4 h-4 text-[#2563EB] shrink-0" />
                        <span className="truncate">{folder.name}</span>
                      </button>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <span className="text-[12px] text-[#64748B] tabular-nums group-hover:hidden">
                          ({folder.documentCount ?? 0})
                        </span>
                        <div className="hidden group-hover:flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => onRenameFolder(folder)}
                            title="Rename folder"
                            className="p-1 rounded text-[#64748B] hover:text-[#0F172A] hover:bg-white"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteFolder(folder)}
                            title="Delete folder"
                            className="p-1 rounded text-[#64748B] hover:text-[#DC2626] hover:bg-white"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Documents Panel */}
            <div className="flex-1 min-w-0">
              {/* Search & Upload Toolbar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-[380px]">
                  <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search documents..."
                    className="w-full pl-9 pr-3 py-2 text-[13.5px] text-[#0F172A] bg-white border border-[#E2E8F0] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 rounded-[8px] focus:outline-none placeholder:text-[#94A3B8]"
                  />
                </div>

                <button
                  type="button"
                  onClick={onUploadClick}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-[13.5px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[8px] transition-colors shadow-[0_1px_2px_rgba(37,99,235,0.2)] whitespace-nowrap shrink-0"
                >
                  <Upload className="w-4 h-4" />
                  Upload Documents
                </button>
              </div>

              {/* Bulk Selection Bar */}
              {selectedDocIds.length > 0 && (
                <div className="mt-3 flex items-center justify-between px-3.5 py-2 rounded-[8px] bg-[#EFF6FF] border border-[#BFDBFE] text-[12.5px] text-[#1D4ED8]">
                  <span className="font-semibold">
                    {selectedDocIds.length} document{selectedDocIds.length === 1 ? '' : 's'} selected
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedDocIds([])}
                    className="font-medium hover:underline"
                  >
                    Clear selection
                  </button>
                </div>
              )}

              {/* Documents Table */}
              <div className="mt-4 bg-white border border-[#E2E8F0] rounded-[10px] overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]/60">
                      <th className="py-3 pl-4 pr-2 w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          aria-label="Select all documents"
                          className="w-4 h-4 rounded border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB]"
                        />
                      </th>
                      <th className="py-3 px-2 text-[12.5px] font-semibold text-[#475569]">Name</th>
                      <th className="py-3 px-3 text-[12.5px] font-semibold text-[#475569]">Folder</th>
                      <th className="py-3 px-3 text-[12.5px] font-semibold text-[#475569]">Status</th>
                      <th className="py-3 px-3 text-[12.5px] font-semibold text-[#475569]">
                        Uploaded
                      </th>
                      <th className="py-3 pl-2 pr-4 w-12 text-right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {filteredDocuments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 px-4 text-center">
                          <p className="text-[14px] font-semibold text-[#0F172A]">
                            {documents.length === 0
                              ? 'No documents uploaded yet'
                              : 'No matching documents in this view'}
                          </p>
                          <p className="text-[13px] text-[#64748B] mt-1">
                            {documents.length === 0
                              ? 'Upload PDF, DOCX, TXT, or Markdown files to make them searchable in this library.'
                              : 'Try clearing the search query or selecting All Documents.'}
                          </p>
                          {documents.length === 0 && (
                            <button
                              type="button"
                              onClick={onUploadClick}
                              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-[13px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[8px]"
                            >
                              <Upload className="w-4 h-4" />
                              Upload Documents
                            </button>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredDocuments.map((doc) => (
                        <tr
                          key={doc.id}
                          className="hover:bg-[#F8FAFC] transition-colors group"
                        >
                          <td className="py-3 pl-4 pr-2">
                            <input
                              type="checkbox"
                              checked={selectedDocIds.includes(doc.id)}
                              onChange={() => toggleOne(doc.id)}
                              aria-label={`Select ${doc.filename}`}
                              className="w-4 h-4 rounded border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB]"
                            />
                          </td>
                          <td className="py-3 px-2">
                            <button
                              type="button"
                              onClick={() => onOpenDocument(doc.id)}
                              className="flex items-center gap-2.5 text-left group/name max-w-[300px]"
                            >
                              <FileTypeIcon type={doc.fileType} size="sm" />
                              <div className="min-w-0">
                                <div className="text-[13.5px] font-medium text-[#0F172A] group-hover/name:text-[#2563EB] transition-colors truncate">
                                  {doc.filename}
                                </div>
                                {doc.status === 'failed' && doc.errorMessage && (
                                  <div className="flex items-center gap-1 text-[11.5px] text-[#DC2626] mt-0.5 truncate">
                                    <AlertCircle className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{doc.errorMessage}</span>
                                  </div>
                                )}
                              </div>
                            </button>
                          </td>
                          <td className="py-3 px-3 text-[13px] text-[#475569] whitespace-nowrap">
                            {doc.folderName || 'Unfiled'}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <StatusPill status={doc.status} />
                          </td>
                          <td className="py-3 px-3 text-[13px] text-[#64748B] whitespace-nowrap tabular-nums">
                            {formatShortDate(doc.createdAt)}
                          </td>
                          <td className="py-3 pl-2 pr-4 text-right relative">
                            <button
                              type="button"
                              onClick={() => {
                                setMoveMenuDocId(null);
                                setDocMenuId(docMenuId === doc.id ? null : doc.id);
                              }}
                              className="p-1.5 rounded-[6px] text-[#64748B] hover:text-[#0F172A] hover:bg-[#EEF2F6]"
                              aria-label={`Actions for ${doc.filename}`}
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>

                            {docMenuId === doc.id && (
                              <div className="absolute right-4 mt-1 w-48 bg-white border border-[#E2E8F0] rounded-[8px] shadow-[0_8px_20px_rgba(15,23,42,0.1)] py-1 z-30 text-left">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDocMenuId(null);
                                    onOpenDocument(doc.id);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[#0F172A] hover:bg-[#F8FAFC]"
                                >
                                  <Eye className="w-3.5 h-3.5 text-[#64748B]" />
                                  Open Document
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDocMenuId(null);
                                    onRenameDocument(doc);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[#334155] hover:bg-[#F8FAFC]"
                                >
                                  <Pencil className="w-3.5 h-3.5 text-[#64748B]" />
                                  Rename Document
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setMoveMenuDocId(moveMenuDocId === doc.id ? null : doc.id)
                                  }
                                  className="w-full flex items-center justify-between px-3 py-2 text-[13px] text-[#334155] hover:bg-[#F8FAFC]"
                                >
                                  <span className="flex items-center gap-2">
                                    <FolderInput className="w-3.5 h-3.5 text-[#64748B]" />
                                    Move to Folder
                                  </span>
                                  <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8]" />
                                </button>

                                {moveMenuDocId === doc.id && (
                                  <div className="border-t border-b border-[#F1F5F9] bg-[#F8FAFC] py-1">
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        setDocMenuId(null);
                                        setMoveMenuDocId(null);
                                        await onMoveDocument(doc.id, null);
                                      }}
                                      className="w-full text-left px-6 py-1.5 text-[12.5px] text-[#334155] hover:bg-[#EFF6FF] hover:text-[#1D4ED8]"
                                    >
                                      Unfiled
                                    </button>
                                    {folders.map((f) => (
                                      <button
                                        key={f.id}
                                        type="button"
                                        onClick={async () => {
                                          setDocMenuId(null);
                                          setMoveMenuDocId(null);
                                          await onMoveDocument(doc.id, f.id);
                                        }}
                                        className="w-full text-left px-6 py-1.5 text-[12.5px] text-[#334155] hover:bg-[#EFF6FF] hover:text-[#1D4ED8] truncate"
                                      >
                                        {f.name}
                                      </button>
                                    ))}
                                  </div>
                                )}

                                {doc.status === 'failed' && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      setDocMenuId(null);
                                      await onReindexDocument(doc.id);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[#2563EB] hover:bg-[#EFF6FF]"
                                  >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    Retry Indexing
                                  </button>
                                )}

                                <div className="my-1 border-t border-[#F1F5F9]" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDocMenuId(null);
                                    onDeleteDocument(doc);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[#DC2626] hover:bg-[#FEF2F2]"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Delete Document
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          /* Library Details Tab */
          <div className="mt-6 max-w-[760px] space-y-5">
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[12px] p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <ShieldCheck className="w-5 h-5 text-[#2563EB]" />
                <h2 className="text-[15px] font-bold text-[#0F172A]">
                  Isolated Retrieval Scope
                </h2>
              </div>
              <p className="text-[13.5px] text-[#475569] leading-relaxed">
                This library is bound to its own dedicated vector store identifier on the server.
                When selected in Ask AI, retrieval is strictly isolated to Ready documents inside{' '}
                <span className="font-semibold text-[#0F172A]">{library.name}</span>.
              </p>

              <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-[#E2E8F0]">
                <div>
                  <dt className="text-[12px] font-medium text-[#64748B]">Library ID</dt>
                  <dd className="mt-0.5 text-[13px] font-mono text-[#0F172A]">{library.id}</dd>
                </div>
                <div>
                  <dt className="text-[12px] font-medium text-[#64748B]">Vector Store Binding</dt>
                  <dd className="mt-0.5 text-[13px] font-mono text-[#0F172A]">
                    {library.vectorStoreId}
                  </dd>
                </div>
                <div>
                  <dt className="text-[12px] font-medium text-[#64748B]">Indexing Status</dt>
                  <dd className="mt-0.5 text-[13px] text-[#0F172A] tabular-nums">
                    {readyCount} Ready · {processingCount} Processing · {failedCount} Failed
                  </dd>
                </div>
                <div>
                  <dt className="text-[12px] font-medium text-[#64748B]">Indexed Text Chunks</dt>
                  <dd className="mt-0.5 text-[13px] text-[#0F172A] tabular-nums">
                    {totalChunks} searchable passages
                  </dd>
                </div>
              </dl>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onAskAboutLibrary}
                className="inline-flex items-center gap-2 px-4 py-2 text-[13.5px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[8px]"
              >
                <MessageSquareMore className="w-4 h-4" />
                Ask AI about {library.name}
              </button>
              <button
                type="button"
                onClick={onDeleteLibrary}
                className="inline-flex items-center gap-2 px-4 py-2 text-[13.5px] font-medium text-[#DC2626] bg-white border border-[#FECACA] hover:bg-[#FEF2F2] rounded-[8px]"
              >
                <Trash2 className="w-4 h-4" />
                Delete Library
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
