import React from 'react';
import { Loader2 } from 'lucide-react';
import { DocumentFileType, DocumentStatus } from '../types/knowledge.ts';

/**
 * Exact 3-layer isometric blue stacked diamond emblem from the Business IQ reference.
 */
export const BusinessIQLogo: React.FC<{ className?: string }> = ({ className = 'w-7 h-7' }) => (
  <svg
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M16 3L29 10.2L16 17.4L3 10.2L16 3Z"
      fill="#3B82F6"
    />
    <path
      d="M3 16.2L16 23.4L29 16.2"
      stroke="#2563EB"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3 22.2L16 29.4L29 22.2"
      stroke="#1D4ED8"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Electric blue square avatar with white stacked layers mark shown next to assistant replies.
 */
export const AssistantBadgeIcon: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <div
    className={`${className} rounded-[8px] bg-[#2563EB] flex items-center justify-center shrink-0 shadow-[0_1px_2px_rgba(37,99,235,0.2)]`}
    aria-hidden="true"
  >
    <svg viewBox="0 0 24 24" fill="none" className="w-[18px] h-[18px]">
      <path d="M12 3.5L21 8.5L12 13.5L3 8.5L12 3.5Z" fill="#FFFFFF" />
      <path
        d="M3.5 13L12 17.8L20.5 13"
        stroke="#FFFFFF"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 17.2L12 22L20.5 17.2"
        stroke="#DBEAFE"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </div>
);

/**
 * Crisp document file-type badge matching Screenshot 2 (PDF red, DOCX blue, TXT/MD slate).
 */
export const FileTypeIcon: React.FC<{
  type: DocumentFileType;
  size?: 'sm' | 'md' | 'lg';
}> = ({ type, size = 'sm' }) => {
  const styles: Record<
    DocumentFileType,
    { bg: string; border: string; labelBg: string; text: string; label: string }
  > = {
    pdf: {
      bg: '#FEF2F2',
      border: '#FECACA',
      labelBg: '#EF4444',
      text: '#DC2626',
      label: 'PDF',
    },
    docx: {
      bg: '#EFF6FF',
      border: '#BFDBFE',
      labelBg: '#2563EB',
      text: '#1D4ED8',
      label: 'DOCX',
    },
    txt: {
      bg: '#F8FAFC',
      border: '#CBD5E1',
      labelBg: '#64748B',
      text: '#475569',
      label: 'TXT',
    },
    md: {
      bg: '#F1F5F9',
      border: '#CBD5E1',
      labelBg: '#334155',
      text: '#334155',
      label: 'MD',
    },
  };

  const s = styles[type] || styles.txt;
  const dims =
    size === 'lg'
      ? 'w-9 h-10 text-[9px] rounded-[6px]'
      : size === 'md'
      ? 'w-7 h-8 text-[7.5px] rounded-[5px]'
      : 'w-6 h-7 text-[6.5px] rounded-[4px]';

  return (
    <div
      className={`${dims} relative flex flex-col items-center justify-end pb-1 shrink-0 select-none font-bold tracking-tight`}
      style={{ backgroundColor: s.bg, border: `1px solid ${s.border}`, color: s.text }}
      aria-label={s.label}
    >
      <div
        className="absolute top-0 right-0 w-2 h-2 rounded-bl-[2px]"
        style={{ backgroundColor: s.border }}
      />
      <span
        className="px-1 py-[1px] rounded-[2px] text-white leading-none"
        style={{ backgroundColor: s.labelBg }}
      >
        {s.label}
      </span>
    </div>
  );
};

/**
 * Exact status badge matching Screen 3 (Ready green, Processing blue, Failed red).
 */
export const StatusPill: React.FC<{ status: DocumentStatus }> = ({ status }) => {
  if (status === 'ready') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold bg-[#DCFCE7] text-[#15803D] whitespace-nowrap">
        Ready
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold bg-[#FEE2E2] text-[#B91C1C] whitespace-nowrap">
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold bg-[#DBEAFE] text-[#1D4ED8] whitespace-nowrap">
      <Loader2 className="w-3 h-3 animate-spin" />
      {status === 'uploading' ? 'Uploading' : 'Processing'}
    </span>
  );
};
