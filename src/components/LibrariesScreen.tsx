import React, { useState } from 'react';
import {
  Calendar,
  ChevronRight,
  FileText,
  Folder,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { KnowledgeLibrary } from '../types/knowledge.ts';
import { formatRelativeTime } from '../lib/format.ts';

interface LibrariesScreenProps {
  libraries: KnowledgeLibrary[];
  loading: boolean;
  onOpenLibrary: (libraryId: string) => void;
  onCreateClick: () => void;
  onRenameClick: (library: KnowledgeLibrary) => void;
  onDeleteClick: (library: KnowledgeLibrary) => void;
}

export const LibrariesScreen: React.FC<LibrariesScreenProps> = ({
  libraries,
  loading,
  onOpenLibrary,
  onCreateClick,
  onRenameClick,
  onDeleteClick,
}) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="max-w-[1120px] mx-auto px-5 sm:px-9 py-6 sm:py-8">
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] sm:text-[28px] font-bold tracking-[-0.025em] text-[#0F172A] leading-tight">
              Knowledge Libraries
            </h1>
            <p className="text-[14.5px] text-[#475569] mt-1">
              Create and manage your knowledge libraries, folders, and documents.
            </p>
          </div>
          <button
            type="button"
            onClick={onCreateClick}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[13.5px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[8px] transition-colors shadow-[0_1px_2px_rgba(37,99,235,0.2)] whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" strokeWidth={2.25} />
            Create Library
          </button>
        </div>

        {/* Loading Skeleton */}
        {loading && libraries.length === 0 ? (
          <div className="mt-7 grid grid-cols-1 md:grid-cols-2 gap-5">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-[156px] rounded-[12px] border border-[#E2E8F0] bg-[#F8FAFC] animate-pulse"
              />
            ))}
          </div>
        ) : libraries.length === 0 ? (
          /* Empty State */
          <div className="mt-10 border border-dashed border-[#CBD5E1] rounded-[12px] p-12 text-center bg-[#F8FAFC]">
            <div className="w-12 h-12 rounded-[10px] bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center mx-auto mb-4">
              <Folder className="w-6 h-6 text-[#2563EB]" />
            </div>
            <h2 className="text-[16px] font-bold text-[#0F172A]">No knowledge libraries yet</h2>
            <p className="text-[13.5px] text-[#475569] max-w-[400px] mx-auto mt-1.5">
              Create your first isolated knowledge library to organize folders and upload SOPs,
              policies, or technical documentation.
            </p>
            <button
              type="button"
              onClick={onCreateClick}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 text-[13.5px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[8px]"
            >
              <Plus className="w-4 h-4" />
              Create Library
            </button>
          </div>
        ) : (
          /* 2-Column Library Cards Grid (1:1 Match with Screenshot 2 Screen 2) */
          <div className="mt-7 grid grid-cols-1 md:grid-cols-2 gap-5">
            {libraries.map((lib) => {
              const docCount = lib.documentCount ?? 0;
              return (
                <div
                  key={lib.id}
                  onClick={() => onOpenLibrary(lib.id)}
                  className="group relative bg-white border border-[#E2E8F0] hover:border-[#BFDBFE] hover:shadow-[0_3px_12px_rgba(15,23,42,0.05)] rounded-[12px] p-5 cursor-pointer transition-all flex flex-col justify-between min-h-[152px]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div className="mt-0.5 shrink-0">
                        <Folder className="w-6 h-6 text-[#2563EB]" strokeWidth={1.9} />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-[16px] font-bold text-[#0F172A] group-hover:text-[#1D4ED8] transition-colors truncate">
                          {lib.name}
                        </h2>
                        <p className="mt-1 text-[13px] text-[#475569] leading-[1.45] line-clamp-2">
                          {lib.description || 'Isolated knowledge library for structured documentation.'}
                        </p>
                      </div>
                    </div>

                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenMenuId(openMenuId === lib.id ? null : lib.id)
                          }
                          className="p-1.5 rounded-[6px] text-[#94A3B8] hover:text-[#0F172A] hover:bg-[#F1F5F9] opacity-75 group-hover:opacity-100 transition-colors"
                          aria-label={`Actions for ${lib.name}`}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {openMenuId === lib.id && (
                          <div className="absolute right-0 mt-1 w-40 bg-white border border-[#E2E8F0] rounded-[8px] shadow-[0_8px_20px_rgba(15,23,42,0.1)] py-1 z-20">
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                onRenameClick(lib);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[#334155] hover:bg-[#F8FAFC] text-left"
                            >
                              <Pencil className="w-3.5 h-3.5 text-[#64748B]" />
                              Edit Library
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                onDeleteClick(lib);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[#DC2626] hover:bg-[#FEF2F2] text-left"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>

                      <ChevronRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#2563EB] transition-colors" />
                    </div>
                  </div>

                  {/* Bottom Metadata Row */}
                  <div className="mt-5 pt-3.5 border-t border-[#F1F5F9] flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px] text-[#64748B]">
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      <FileText className="w-3.5 h-3.5 text-[#64748B]" />
                      {docCount} {docCount === 1 ? 'document' : 'documents'}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#64748B]" />
                      Updated {formatRelativeTime(lib.updatedAt)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
