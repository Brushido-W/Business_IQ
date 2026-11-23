import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Folder,
  HardDrive,
  Layers,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Citation, DocumentDetail } from '../types/knowledge.ts';
import { FileTypeIcon, StatusPill } from './BrandIcons.tsx';
import { formatFileSize, formatShortDate } from '../lib/format.ts';

interface DocumentViewerScreenProps {
  document: DocumentDetail;
  activeCitation: Citation | null;
  openedFromAsk: boolean;
  onBackToLibrary: () => void;
  onBackToAsk: () => void;
  onRenameDocument: () => void;
  onDeleteDocument: () => void;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Renders text with optional yellow highlight (#FEF08A) matching Screenshot 2 Screen 4.
 * Strictly builds React nodes (no raw HTML injection).
 */
function HighlightedText({
  text,
  citationExcerpt,
  searchTerm,
}: {
  text: string;
  citationExcerpt: string | null;
  searchTerm: string;
}) {
  const highlightTargets = useMemo(() => {
    const targets: string[] = [];
    if (searchTerm.trim().length >= 2) {
      targets.push(searchTerm.trim());
    }
    if (citationExcerpt && citationExcerpt.trim().length >= 12) {
      // Split excerpt into individual non-empty lines/sentences for accurate matching
      const parts = citationExcerpt
        .split(/\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 12);
      if (parts.length > 0) {
        targets.push(...parts);
      } else {
        targets.push(citationExcerpt.trim());
      }
    }
    return targets;
  }, [citationExcerpt, searchTerm]);

  if (highlightTargets.length === 0) {
    return <>{text}</>;
  }

  // Try matching longest targets first
  const sorted = [...highlightTargets].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(${sorted.map(escapeRegExp).join('|')})`, 'gi');
  const pieces = text.split(pattern);

  if (pieces.length === 1) {
    return <>{text}</>;
  }

  return (
    <>
      {pieces.map((piece, idx) => {
        const isMatch = sorted.some((t) => t.toLowerCase() === piece.toLowerCase());
        if (isMatch) {
          return (
            <mark
              key={idx}
              className="bg-[#FEF08A] text-[#0F172A] rounded-[3px] px-1 py-0.5 box-decoration-clone"
            >
              {piece}
            </mark>
          );
        }
        return <React.Fragment key={idx}>{piece}</React.Fragment>;
      })}
    </>
  );
}

export const DocumentViewerScreen: React.FC<DocumentViewerScreenProps> = ({
  document: doc,
  activeCitation,
  openedFromAsk,
  onBackToLibrary,
  onBackToAsk,
  onRenameDocument,
  onDeleteDocument,
}) => {
  const totalPages = Math.max(1, doc.pages.length);
  const initialPage =
    activeCitation && activeCitation.pageNumber >= 1 && activeCitation.pageNumber <= totalPages
      ? activeCitation.pageNumber
      : 1;

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setCurrentPage(initialPage);
  }, [doc.id, initialPage]);

  const activePageData =
    doc.pages.find((p) => p.pageNumber === currentPage) || doc.pages[0] || null;

  const citationOnCurrentPage =
    activeCitation && activeCitation.pageNumber === currentPage ? activeCitation.excerpt : null;

  const renderStructuredPage = (content: string) => {
    const blocks = content.split(/\n{2,}/);
    return blocks.map((block, bIdx) => {
      const lines = block.split('\n');
      const firstLine = lines[0].trim();

      // Heading style matching Screenshot 2 Screen 4 ("2. Onboarding Procedure", "3. Responsibilities")
      const isHeading =
        lines.length === 1 &&
        (/^(\d+\.\s+[A-Z]|#{1,4}\s+)/.test(firstLine) && firstLine.length <= 90);

      if (isHeading) {
        const cleanHeading = firstLine.replace(/^#+\s*/, '');
        return (
          <h3
            key={bIdx}
            className="font-bold text-[#0F172A] mt-6 first:mt-0 mb-2.5 leading-snug"
            style={{ fontSize: `${Math.round(17 * (zoomPercent / 100))}px` }}
          >
            <HighlightedText
              text={cleanHeading}
              citationExcerpt={citationOnCurrentPage}
              searchTerm={searchTerm}
            />
          </h3>
        );
      }

      // Check if lines are a numbered or bulleted list
      const allList = lines.every((l) => /^(\d+\.\s+|[-*•]\s+)/.test(l.trim()));
      if (allList) {
        return (
          <div key={bIdx} className="space-y-2 my-3 pl-2">
            {lines.map((line, lIdx) => (
              <div
                key={lIdx}
                className="text-[#1E293B] leading-[1.65]"
                style={{ fontSize: `${Math.round(14.5 * (zoomPercent / 100))}px` }}
              >
                <HighlightedText
                  text={line.trim()}
                  citationExcerpt={citationOnCurrentPage}
                  searchTerm={searchTerm}
                />
              </div>
            ))}
          </div>
        );
      }

      return (
        <p
          key={bIdx}
          className="text-[#1E293B] leading-[1.7] mb-3.5 last:mb-0 whitespace-pre-wrap"
          style={{ fontSize: `${Math.round(14.5 * (zoomPercent / 100))}px` }}
        >
          <HighlightedText
            text={block}
            citationExcerpt={citationOnCurrentPage}
            searchTerm={searchTerm}
          />
        </p>
      );
    });
  };

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* Top Breadcrumb & Document Header */}
      <div className="px-5 sm:px-9 pt-5 pb-4 border-b border-[#E2E8F0] shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-[#64748B]">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              onClick={onBackToLibrary}
              className="hover:text-[#0F172A] transition-colors truncate"
            >
              {doc.libraryName || 'Knowledge Library'}
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
            <span className="font-semibold text-[#0F172A] truncate">{doc.filename}</span>
          </div>

          {openedFromAsk && (
            <button
              type="button"
              onClick={onBackToAsk}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#2563EB] hover:underline whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Ask BIQ
            </button>
          )}
        </div>

        {/* Title & Actions Row */}
        <div className="mt-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <FileTypeIcon type={doc.fileType} size="lg" />
            <div className="min-w-0">
              <h1 className="text-[20px] sm:text-[22px] font-bold tracking-[-0.02em] text-[#0F172A] truncate">
                {doc.filename}
              </h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[#64748B]">
                <span>
                  Library: <strong className="font-medium text-[#334155]">{doc.libraryName}</strong>
                </span>
                <span className="text-[#CBD5E1]">|</span>
                <span>
                  Folder:{' '}
                  <strong className="font-medium text-[#334155]">
                    {doc.folderName || 'Unfiled'}
                  </strong>
                </span>
                <span className="text-[#CBD5E1]">|</span>
                <span className="tabular-nums">Uploaded: {formatShortDate(doc.createdAt)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            {doc.storageUploaded && doc.downloadUrl ? (
              <a
                href={doc.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={doc.filename}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-[#0F172A] bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] hover:border-[#CBD5E1] rounded-[8px] transition-colors whitespace-nowrap"
              >
                <Download className="w-4 h-4 text-[#475569]" />
                Download
              </a>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const text = doc.pages
                    .map((p) => `--- Page ${p.pageNumber} ---\n\n${p.content}`)
                    .join('\n\n');
                  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = window.document.createElement('a');
                  a.href = url;
                  a.download = `${doc.filename.replace(/\.(pdf|docx)$/i, '')}.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                disabled={doc.pages.length === 0}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-[#0F172A] bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] hover:border-[#CBD5E1] disabled:opacity-50 rounded-[8px] transition-colors whitespace-nowrap"
              >
                <Download className="w-4 h-4 text-[#475569]" />
                Export Text
              </button>
            )}

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="w-[38px] h-[38px] flex items-center justify-center bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] rounded-[8px] text-[#475569]"
                aria-label="More document options"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1.5 w-48 bg-white border border-[#E2E8F0] rounded-[8px] shadow-[0_8px_20px_rgba(15,23,42,0.1)] py-1 z-30">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onRenameDocument();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[#334155] hover:bg-[#F8FAFC] text-left"
                  >
                    <Pencil className="w-4 h-4 text-[#64748B]" />
                    Rename Document
                  </button>
                  <div className="my-1 border-t border-[#F1F5F9]" />
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onDeleteDocument();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[#DC2626] hover:bg-[#FEF2F2] text-left"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Document
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main 2-Pane Reader + Context Sidebar (1:1 Match with Screenshot 2 Screen 4) */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-9 py-5 bg-[#F8FAFC]/50">
        <div className="max-w-[1160px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_290px] gap-6 items-start">
          {/* Left Document Reader Card */}
          <div className="bg-white border border-[#E2E8F0] rounded-[12px] overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            {/* Reader Toolbar */}
            <div className="px-4 py-2.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
              {/* Page Pagination */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="p-1.5 rounded-[6px] text-[#475569] hover:bg-[#E2E8F0]/60 disabled:opacity-35"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2.5 py-0.5 text-[12.5px] font-semibold text-[#0F172A] bg-white border border-[#CBD5E1] rounded-[6px] tabular-nums">
                  {currentPage}
                </span>
                <span className="text-[12.5px] text-[#64748B] tabular-nums">/ {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="p-1.5 rounded-[6px] text-[#475569] hover:bg-[#E2E8F0]/60 disabled:opacity-35"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setZoomPercent((z) => Math.max(80, z - 10))}
                  className="p-1.5 rounded-[6px] text-[#475569] hover:bg-[#E2E8F0]/60"
                  aria-label="Zoom out"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="px-2.5 py-0.5 text-[12.5px] font-semibold text-[#0F172A] bg-white border border-[#CBD5E1] rounded-[6px] tabular-nums min-w-[54px] text-center">
                  {zoomPercent}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoomPercent((z) => Math.min(140, z + 10))}
                  className="p-1.5 rounded-[6px] text-[#475569] hover:bg-[#E2E8F0]/60"
                  aria-label="Zoom in"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Search & Reset */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setSearchOpen((o) => !o);
                    if (searchOpen) setSearchTerm('');
                  }}
                  className={`p-1.5 rounded-[6px] transition-colors ${
                    searchOpen
                      ? 'bg-[#EFF6FF] text-[#2563EB]'
                      : 'text-[#475569] hover:bg-[#E2E8F0]/60'
                  }`}
                  aria-label="Search inside document"
                >
                  <Search className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomPercent(100)}
                  title="Reset zoom"
                  className="p-1.5 rounded-[6px] text-[#475569] hover:bg-[#E2E8F0]/60"
                  aria-label="Reset zoom"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {searchOpen && (
              <div className="px-4 py-2 bg-white border-b border-[#E2E8F0] flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-[#94A3B8]" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Find text on this page..."
                  autoFocus
                  className="flex-1 text-[13px] text-[#0F172A] focus:outline-none placeholder:text-[#94A3B8]"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="p-0.5 text-[#94A3B8] hover:text-[#475569]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Document Content Body */}
            <div className="p-6 sm:p-8 min-h-[460px]">
              {activePageData ? (
                renderStructuredPage(activePageData.content)
              ) : (
                <div className="py-16 text-center text-[13.5px] text-[#64748B] max-w-md mx-auto">
                  {doc.status === 'processing' || doc.status === 'uploading' ? (
                    Date.now() - Date.parse(doc.updatedAt) > 45_000 ? (
                      <div className="space-y-3">
                        <p className="text-[#0F172A] font-medium">
                          Indexing for this document appears to have been interrupted during an earlier upload.
                        </p>
                        <p>
                          Please delete this document entry and upload the file again to complete indexing.
                        </p>
                      </div>
                    ) : (
                      'This document is currently being extracted and indexed. Preview will appear once Ready.'
                    )
                  ) : (
                    doc.errorMessage || 'No extracted text preview is available for this document.'
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Context Sidebar */}
          <div className="space-y-4">
            {/* Referenced in answer card (Exact match to Screenshot 2 Screen 4) */}
            {activeCitation && (
              <div className="bg-white border border-[#E2E8F0] rounded-[12px] p-4">
                <h2 className="text-[14px] font-bold text-[#0F172A]">Referenced in answer</h2>
                <button
                  type="button"
                  onClick={() => setCurrentPage(activeCitation.pageNumber)}
                  className="mt-3 w-full text-left bg-[#EFF6FF] hover:bg-[#DBEAFE]/70 border border-[#DBEAFE] rounded-[10px] p-3.5 transition-colors"
                >
                  <p className="text-[13px] font-medium text-[#1D4ED8] leading-[1.55]">
                    &ldquo;{activeCitation.excerpt}&rdquo;
                  </p>
                  <div className="mt-2 flex items-center justify-between text-[11.5px] text-[#3B82F6] font-semibold">
                    <span>{activeCitation.pageLabel}</span>
                    {currentPage !== activeCitation.pageNumber && <span>Jump to page</span>}
                  </div>
                </button>
              </div>
            )}

            {/* Document details card (Exact match to Screenshot 2 Screen 4) */}
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[12px] p-4">
              <h2 className="text-[14px] font-bold text-[#0F172A] mb-3.5">Document details</h2>
              <dl className="space-y-2.5 text-[13px]">
                <div className="flex items-start gap-2.5 text-[#334155]">
                  <FileText className="w-4 h-4 text-[#64748B] shrink-0 mt-0.5" />
                  <span className="break-all font-medium text-[#0F172A]">{doc.filename}</span>
                </div>
                <div className="flex items-center gap-2.5 text-[#334155] tabular-nums">
                  <Layers className="w-4 h-4 text-[#64748B] shrink-0" />
                  <span>Pages: {doc.pageCount || totalPages}</span>
                </div>
                <div className="flex items-center gap-2.5 text-[#334155] tabular-nums">
                  <HardDrive className="w-4 h-4 text-[#64748B] shrink-0" />
                  <span>Size: {formatFileSize(doc.sizeBytes)}</span>
                </div>
                <div className="flex items-center gap-2.5 text-[#334155] tabular-nums">
                  <Calendar className="w-4 h-4 text-[#64748B] shrink-0" />
                  <span>Uploaded: {formatShortDate(doc.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2.5 text-[#334155]">
                  <Folder className="w-4 h-4 text-[#64748B] shrink-0" />
                  <span>Folder: {doc.folderName || 'Unfiled'}</span>
                </div>
              </dl>

              <div className="mt-4 pt-3.5 border-t border-[#E2E8F0] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-[#64748B]">Indexing Status</span>
                  <StatusPill status={doc.status} />
                </div>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-medium text-[#64748B]">File Storage</span>
                  <span className="font-medium text-[#334155]">
                    {doc.storageUploaded ? 'Firebase Storage' : 'Text-indexed only'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
