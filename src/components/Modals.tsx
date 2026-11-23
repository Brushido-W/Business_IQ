import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CloudUpload, FileText, Loader2, Trash2, X } from 'lucide-react';
import { Folder } from '../types/knowledge.ts';
import { formatFileSize } from '../lib/format.ts';

// --- Create / Rename Library Modal (matches Workflow A Step 2) ---
interface LibraryModalProps {
  open: boolean;
  mode: 'create' | 'rename';
  initialName?: string;
  initialDescription?: string;
  onClose: () => void;
  onSubmit: (name: string, description: string) => Promise<void>;
}

export const LibraryModal: React.FC<LibraryModalProps> = ({
  open,
  mode,
  initialName = '',
  initialDescription = '',
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setDescription(initialDescription);
      setError(null);
      setSubmitting(false);
    }
  }, [open, initialName, initialDescription]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Library name is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trimmed, description.trim());
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save knowledge library.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/45">
      <div
        className="w-full max-w-[440px] bg-white border border-[#E2E8F0] rounded-[12px] shadow-[0_12px_32px_rgba(15,23,42,0.14)] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-modal-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0]">
          <h2 id="library-modal-title" className="text-[16px] font-bold text-[#0F172A]">
            {mode === 'create' ? 'Create Knowledge Library' : 'Edit Knowledge Library'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[6px] text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-[8px] bg-[#FEF2F2] border border-[#FECACA] text-[13px] text-[#B91C1C]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="lib-name" className="block text-[13px] font-semibold text-[#0F172A] mb-1.5">
              Library Name
            </label>
            <input
              id="lib-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Operations"
              maxLength={120}
              autoFocus
              className="w-full px-3 py-2 text-[14px] text-[#0F172A] bg-white border border-[#CBD5E1] rounded-[8px] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 placeholder:text-[#94A3B8]"
            />
          </div>

          <div>
            <label htmlFor="lib-desc" className="block text-[13px] font-semibold text-[#0F172A] mb-1.5">
              Description <span className="font-normal text-[#64748B]">(optional)</span>
            </label>
            <textarea
              id="lib-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="SOPs, processes and team resources."
              rows={3}
              maxLength={400}
              className="w-full px-3 py-2 text-[14px] text-[#0F172A] bg-white border border-[#CBD5E1] rounded-[8px] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 placeholder:text-[#94A3B8] resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-[13.5px] font-medium text-[#334155] bg-white border border-[#CBD5E1] rounded-[8px] hover:bg-[#F8FAFC] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-[13.5px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 rounded-[8px] transition-colors"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'create' ? 'Create Library' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Create / Rename Folder Modal ---
interface FolderModalProps {
  open: boolean;
  mode: 'create' | 'rename';
  initialName?: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}

export const FolderModal: React.FC<FolderModalProps> = ({
  open,
  mode,
  initialName = '',
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState(initialName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setError(null);
      setSubmitting(false);
    }
  }, [open, initialName]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Folder name is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save folder.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/45">
      <div
        className="w-full max-w-[400px] bg-white border border-[#E2E8F0] rounded-[12px] shadow-[0_12px_32px_rgba(15,23,42,0.14)] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-[16px] font-bold text-[#0F172A]">
            {mode === 'create' ? 'New Folder' : 'Rename Folder'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[6px] text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-[8px] bg-[#FEF2F2] border border-[#FECACA] text-[13px] text-[#B91C1C]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="folder-name" className="block text-[13px] font-semibold text-[#0F172A] mb-1.5">
              Folder Name
            </label>
            <input
              id="folder-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Onboarding"
              maxLength={80}
              autoFocus
              className="w-full px-3 py-2 text-[14px] text-[#0F172A] bg-white border border-[#CBD5E1] rounded-[8px] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 placeholder:text-[#94A3B8]"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-[13.5px] font-medium text-[#334155] bg-white border border-[#CBD5E1] rounded-[8px] hover:bg-[#F8FAFC]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-[13.5px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 rounded-[8px]"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'create' ? 'Create Folder' : 'Save Name'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Confirmation Modal (replaces window.confirm) ---
interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  danger = true,
  onClose,
  onConfirm,
}) => {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setWorking(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const handleConfirm = async () => {
    setWorking(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed. Please try again.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/45">
      <div
        className="w-full max-w-[420px] bg-white border border-[#E2E8F0] rounded-[12px] shadow-[0_12px_32px_rgba(15,23,42,0.14)] p-5"
        role="dialog"
        aria-modal="true"
      >
        <h2 className="text-[16px] font-bold text-[#0F172A]">{title}</h2>
        <p className="mt-2 text-[13.5px] text-[#475569] leading-relaxed">{description}</p>
        {error && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-[8px] bg-[#FEF2F2] border border-[#FECACA] text-[13px] text-[#B91C1C]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex items-center justify-end gap-2.5 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={working}
            className="px-4 py-2 text-[13.5px] font-medium text-[#334155] bg-white border border-[#CBD5E1] rounded-[8px] hover:bg-[#F8FAFC]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={working}
            className={`inline-flex items-center gap-2 px-4 py-2 text-[13.5px] font-semibold text-white rounded-[8px] disabled:opacity-60 ${
              danger ? 'bg-[#DC2626] hover:bg-[#B91C1C]' : 'bg-[#2563EB] hover:bg-[#1D4ED8]'
            }`}
          >
            {working && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Rename Document Modal ---
interface DocumentRenameModalProps {
  open: boolean;
  initialName: string;
  onClose: () => void;
  onSubmit: (filename: string) => Promise<void>;
}

export const DocumentRenameModal: React.FC<DocumentRenameModalProps> = ({
  open,
  initialName,
  onClose,
  onSubmit,
}) => {
  const [filename, setFilename] = useState(initialName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFilename(initialName);
      setError(null);
      setSubmitting(false);
    }
  }, [open, initialName]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = filename.trim();
    if (!trimmed) {
      setError('Document name is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to rename document.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/45">
      <div
        className="w-full max-w-[420px] bg-white border border-[#E2E8F0] rounded-[12px] shadow-[0_12px_32px_rgba(15,23,42,0.14)] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-[16px] font-bold text-[#0F172A]">Rename Document</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[6px] text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-[8px] bg-[#FEF2F2] border border-[#FECACA] text-[13px] text-[#B91C1C]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="doc-rename-input" className="block text-[13px] font-semibold text-[#0F172A] mb-1.5">
              Document Name
            </label>
            <input
              id="doc-rename-input"
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              maxLength={180}
              autoFocus
              className="w-full px-3 py-2 text-[14px] text-[#0F172A] bg-white border border-[#CBD5E1] rounded-[8px] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 placeholder:text-[#94A3B8]"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-[13.5px] font-medium text-[#334155] bg-white border border-[#CBD5E1] rounded-[8px] hover:bg-[#F8FAFC]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-[13.5px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 rounded-[8px]"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Name
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Upload Documents Modal (matches Workflow A Step 4) ---
interface UploadDocumentsModalProps {
  open: boolean;
  libraryName: string;
  folders: Folder[];
  defaultFolderId: string | null;
  onClose: () => void;
  onUpload: (files: File[], folderId: string | null) => Promise<void>;
}

const ALLOWED_EXTS = ['.pdf', '.docx', '.txt', '.md'];
const MAX_BYTES = 25 * 1024 * 1024;

export const UploadDocumentsModal: React.FC<UploadDocumentsModalProps> = ({
  open,
  libraryName,
  folders,
  defaultFolderId,
  onClose,
  onUpload,
}) => {
  const [selectedFolderId, setSelectedFolderId] = useState<string>(defaultFolderId || '');
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSelectedFolderId(defaultFolderId || '');
      setQueuedFiles([]);
      setError(null);
      setUploading(false);
      setIsDragging(false);
    }
  }, [open, defaultFolderId]);

  if (!open) return null;

  const validateAndAddFiles = (incoming: FileList | File[]) => {
    setError(null);
    const valid: File[] = [];
    const errors: string[] = [];

    for (const file of Array.from(incoming)) {
      const lower = file.name.toLowerCase();
      const hasValidExt = ALLOWED_EXTS.some((ext) => lower.endsWith(ext));
      if (!hasValidExt) {
        errors.push(`"${file.name}" is not a supported format (PDF, DOCX, TXT, MD).`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        errors.push(`"${file.name}" exceeds the 25 MB file limit.`);
        continue;
      }
      if (file.size === 0) {
        errors.push(`"${file.name}" is empty.`);
        continue;
      }
      valid.push(file);
    }

    if (errors.length > 0) {
      setError(errors[0]);
    }
    if (valid.length > 0) {
      setQueuedFiles((prev) => [...prev, ...valid]);
    }
  };

  const handleSubmit = async () => {
    if (queuedFiles.length === 0) {
      setError('Select at least one file to upload.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await onUpload(queuedFiles, selectedFolderId || null);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/45">
      <div
        className="w-full max-w-[520px] bg-white border border-[#E2E8F0] rounded-[12px] shadow-[0_12px_32px_rgba(15,23,42,0.14)] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0]">
          <div>
            <h2 className="text-[16px] font-bold text-[#0F172A]">Upload Documents</h2>
            <p className="text-[12.5px] text-[#64748B] mt-0.5">
              Library: <span className="font-semibold text-[#0F172A]">{libraryName}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!uploading) onClose();
            }}
            disabled={uploading}
            className="p-1 rounded-[6px] text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] disabled:opacity-40 disabled:pointer-events-none"
            aria-label="Close upload modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-[8px] bg-[#FEF2F2] border border-[#FECACA] text-[13px] text-[#B91C1C]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Folder Selector */}
          <div>
            <label htmlFor="upload-folder" className="block text-[13px] font-semibold text-[#0F172A] mb-1.5">
              Destination Folder
            </label>
            <select
              id="upload-folder"
              value={selectedFolderId}
              onChange={(e) => setSelectedFolderId(e.target.value)}
              disabled={uploading}
              className="w-full px-3 py-2 text-[13.5px] text-[#0F172A] bg-white border border-[#CBD5E1] rounded-[8px] focus:outline-none focus:border-[#2563EB] disabled:opacity-60"
            >
              <option value="">Unfiled (Library Root)</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </div>

          {/* Drag & Drop Dashed Zone (Matches Screenshot 1 Workflow A Step 4) */}
          <div
            onDragOver={(e) => {
              if (uploading) return;
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              if (uploading) return;
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files) {
                validateAndAddFiles(e.dataTransfer.files);
              }
            }}
            onClick={() => {
              if (!uploading) fileInputRef.current?.click();
            }}
            className={`border-2 border-dashed rounded-[12px] p-7 text-center transition-colors ${
              uploading
                ? 'border-[#CBD5E1] bg-[#F8FAFC] opacity-60 cursor-not-allowed'
                : isDragging
                  ? 'border-[#2563EB] bg-[#EFF6FF] cursor-pointer'
                  : 'border-[#93C5FD] bg-[#F8FAFC] hover:bg-[#EFF6FF]/60 cursor-pointer'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md"
              disabled={uploading}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  validateAndAddFiles(e.target.files);
                  e.target.value = '';
                }
              }}
            />
            <CloudUpload className="w-9 h-9 text-[#2563EB] mx-auto mb-2.5" strokeWidth={1.75} />
            <p className="text-[14px] font-semibold text-[#0F172A]">
              Drag and drop files here or click to upload
            </p>
            <p className="text-[12px] text-[#64748B] mt-1">PDF, DOCX, TXT, MD (Max 25 MB)</p>
            <button
              type="button"
              disabled={uploading}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="mt-4 px-4 py-2 text-[13px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 rounded-[8px] transition-colors"
            >
              Select Files
            </button>
          </div>

          {/* Queued Files List */}
          {queuedFiles.length > 0 && (
            <div className="space-y-2 max-h-[160px] overflow-y-auto">
              {queuedFiles.map((file, idx) => (
                <div
                  key={`${file.name}-${idx}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-[8px] bg-[#F8FAFC] border border-[#E2E8F0]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="w-4 h-4 text-[#2563EB] shrink-0" />
                    <span className="text-[13px] font-medium text-[#0F172A] truncate">
                      {file.name}
                    </span>
                    <span className="text-[11.5px] text-[#64748B] shrink-0 tabular-nums">
                      {formatFileSize(file.size)}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() =>
                      setQueuedFiles((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="p-1 text-[#64748B] hover:text-[#DC2626] disabled:opacity-40 rounded"
                    aria-label={`Remove ${file.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#F1F5F9]">
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="px-4 py-2 text-[13.5px] font-medium text-[#334155] bg-white border border-[#CBD5E1] rounded-[8px] hover:bg-[#F8FAFC] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={uploading || queuedFiles.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-[13.5px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 rounded-[8px] transition-colors"
            >
              {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
              {uploading
                ? 'Uploading & Indexing...'
                : `Upload ${queuedFiles.length > 0 ? `(${queuedFiles.length})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
