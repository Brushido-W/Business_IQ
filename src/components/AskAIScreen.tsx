import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Folder,
  Info,
  Loader2,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Send,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { ChatMessage, Citation, KnowledgeLibrary } from '../types/knowledge.ts';
import { AssistantBadgeIcon } from './BrandIcons.tsx';

interface AskAIScreenProps {
  libraries: KnowledgeLibrary[];
  selectedLibraryIds: string[];
  onChangeSelectedLibraries: (libraryIds: string[]) => void;
  messages: ChatMessage[];
  isAsking: boolean;
  onSendQuestion: (question: string) => Promise<void>;
  onClearChat: () => void;
  onOpenCitation: (citation: Citation) => void;
  onOpenQuickUpload: () => void;
  onNavigateToLibraries: () => void;
  geminiConfigured: boolean;
  ragMode?: 'gemini-server' | 'static-browser' | 'unconfigured';
}

/**
 * Safe React renderer for structured grounded answers (numbered lists, bullets, bold, paragraphs).
 * Never uses dangerouslySetInnerHTML.
 */
function renderInlineTokens(
  text: string,
  citations?: Citation[],
  onOpenCitation?: (citation: Citation) => void
): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\[\d+\])/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-[#0F172A]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const citMatch = part.match(/^\[(\d+)\]$/);
    if (citMatch && citations && onOpenCitation) {
      const citIndex = Number(citMatch[1]) - 1;
      const target = citations[citIndex];
      if (target) {
        return (
          <button
            key={idx}
            type="button"
            onClick={() => onOpenCitation(target)}
            title={`View source: ${target.documentTitle} (${target.pageLabel})`}
            className="inline-flex items-center justify-center align-baseline mx-0.5 px-1.5 py-0.2 rounded-[4px] bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#BFDBFE] text-[11px] font-semibold text-[#1D4ED8] transition-colors tabular-nums"
          >
            [{citMatch[1]}]
          </button>
        );
      }
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function FormattedAnswer({
  content,
  citations,
  onOpenCitation,
}: {
  content: string;
  citations?: Citation[];
  onOpenCitation?: (citation: Citation) => void;
}) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: Array<{ ordered: boolean; text: string; num?: string }> = [];

  const flushList = (keyPrefix: number) => {
    if (listItems.length === 0) return;
    const isOrdered = listItems[0].ordered;
    if (isOrdered) {
      elements.push(
        <ol
          key={`list-${keyPrefix}`}
          className="list-decimal pl-5 space-y-1.5 my-2 text-[14px] text-[#0F172A] leading-[1.6]"
        >
          {listItems.map((item, idx) => (
            <li key={idx}>{renderInlineTokens(item.text, citations, onOpenCitation)}</li>
          ))}
        </ol>
      );
    } else {
      elements.push(
        <ul
          key={`list-${keyPrefix}`}
          className="list-disc pl-5 space-y-1.5 my-2 text-[14px] text-[#0F172A] leading-[1.6]"
        >
          {listItems.map((item, idx) => (
            <li key={idx}>{renderInlineTokens(item.text, citations, onOpenCitation)}</li>
          ))}
        </ul>
      );
    }
    listItems = [];
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      flushList(index);
      return;
    }

    const orderedMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      if (listItems.length > 0 && !listItems[0].ordered) flushList(index);
      listItems.push({ ordered: true, num: orderedMatch[1], text: orderedMatch[2] });
      return;
    }

    const bulletMatch = line.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      if (listItems.length > 0 && listItems[0].ordered) flushList(index);
      listItems.push({ ordered: false, text: bulletMatch[1] });
      return;
    }

    flushList(index);
    elements.push(
      <p key={`p-${index}`} className="text-[14px] text-[#0F172A] leading-[1.6] mb-2 last:mb-0">
        {renderInlineTokens(line, citations, onOpenCitation)}
      </p>
    );
  });

  flushList(lines.length);
  return <div>{elements}</div>;
}

const RETRIEVAL_STAGES = [
  'Searching selected libraries...',
  'Retrieving relevant content',
  'Analyzing supporting evidence',
  'Preparing grounded answer',
];

function getSuggestedQuestionsForLibrary(library: KnowledgeLibrary): string[] {
  const name = library.name.toLowerCase();
  if (name.includes('sop') || name.includes('procedure')) {
    return [
      'What is the procedure for onboarding a new employee?',
      'What are the Priority 1 SLA escalation timelines?',
      'What are the approval thresholds for vendor purchase orders?',
    ];
  }
  if (name.includes('polic')) {
    return [
      'What is our home office stipend and remote work schedule?',
      'What are the daily meal and lodging reimbursement limits?',
      'How is Confidential vs Restricted data classified?',
    ];
  }
  if (name.includes('hr')) {
    return [
      'How many days of PTO and parental leave do employees receive?',
      'What is the company 401(k) employer match and vesting schedule?',
    ];
  }
  if (name.includes('it')) {
    return [
      'How do I set up SSO MFA and connect to the corporate VPN?',
      'What is the Severity 1 security incident response procedure?',
    ];
  }
  return [`Summarize the key guidelines documented in ${library.name}.`];
}

function getSuggestedQuestions(selectedLibraries: KnowledgeLibrary[]): string[] {
  if (selectedLibraries.length === 0) return [];
  const seen = new Set<string>();
  const combined: string[] = [];
  for (const lib of selectedLibraries) {
    for (const q of getSuggestedQuestionsForLibrary(lib)) {
      if (!seen.has(q)) {
        seen.add(q);
        combined.push(q);
      }
      if (combined.length >= 4) return combined;
    }
  }
  return combined;
}

export const AskAIScreen: React.FC<AskAIScreenProps> = ({
  libraries,
  selectedLibraryIds,
  onChangeSelectedLibraries,
  messages,
  isAsking,
  onSendQuestion,
  onClearChat,
  onOpenCitation,
  onOpenQuickUpload,
  onNavigateToLibraries,
  geminiConfigured,
  ragMode = geminiConfigured ? 'gemini-server' : 'unconfigured',
}) => {
  const [input, setInput] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [activeStage, setActiveStage] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedLibraries = libraries.filter((l) => selectedLibraryIds.includes(l.id));
  const hasSelection = selectedLibraries.length > 0;
  const allSelected = libraries.length > 0 && selectedLibraries.length === libraries.length;

  const totalReadyDocs = selectedLibraries.reduce(
    (sum, lib) => sum + (lib.readyDocumentCount ?? 0),
    0
  );
  const totalProcessingDocs = selectedLibraries.reduce(
    (sum, lib) => sum + (lib.processingDocumentCount ?? 0),
    0
  );
  const emptySelectedLibraries = selectedLibraries.filter(
    (lib) => (lib.documentCount ?? 0) === 0
  );

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAsking]);

  useEffect(() => {
    if (!isAsking) {
      setActiveStage(0);
      return;
    }
    setActiveStage(0);
    const t1 = setTimeout(() => setActiveStage(1), 450);
    const t2 = setTimeout(() => setActiveStage(2), 1100);
    const t3 = setTimeout(() => setActiveStage(3), 1850);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [isAsking]);

  const toggleLibraryId = (libraryId: string) => {
    if (selectedLibraryIds.includes(libraryId)) {
      onChangeSelectedLibraries(selectedLibraryIds.filter((id) => id !== libraryId));
    } else {
      onChangeSelectedLibraries([...selectedLibraryIds, libraryId]);
    }
  };

  const handleSelectAll = () => {
    onChangeSelectedLibraries(libraries.map((l) => l.id));
  };

  const handleClearSelection = () => {
    onChangeSelectedLibraries([]);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !hasSelection || isAsking) return;
    setInput('');
    await onSendQuestion(trimmed);
  };

  const toggleSources = (msgId: string) => {
    setExpandedSources((prev) => ({
      ...prev,
      [msgId]: prev[msgId] === false ? true : false,
    }));
  };

  const getSelectorLabel = () => {
    if (selectedLibraries.length === 0) return 'Select knowledge libraries';
    if (selectedLibraries.length === 1) return selectedLibraries[0].name;
    if (allSelected && libraries.length > 1) {
      return `All libraries (${selectedLibraries.length})`;
    }
    return `${selectedLibraries[0].name} + ${selectedLibraries.length - 1} more`;
  };

  const suggestions = getSuggestedQuestions(selectedLibraries);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Top Header & Multi-Library Selector */}
      <div className="px-5 sm:px-9 pt-6 sm:pt-8 pb-4 border-b border-[#F1F5F9]">
        <h1 className="text-[26px] sm:text-[28px] font-bold tracking-[-0.025em] text-[#0F172A] leading-tight">
          Ask BIQ.
        </h1>
        <p className="text-[14.5px] text-[#475569] mt-1">
          Get reliable, citation-backed answers grounded in one or more of your knowledge libraries.
        </p>

        {/* Library Multi-Selector + Clear Chat Row */}
        <div className="mt-5 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="relative" ref={dropdownRef}>
            <label className="block text-[12.5px] font-semibold text-[#334155] mb-1.5">
              Knowledge Libraries
            </label>
            <button
              type="button"
              onClick={() => setDropdownOpen((o) => !o)}
              className="w-full sm:w-[380px] flex items-center justify-between gap-2 px-3 py-2 bg-white border border-[#CBD5E1] hover:border-[#94A3B8] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 rounded-[8px] transition-colors"
              aria-haspopup="listbox"
              aria-expanded={dropdownOpen}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Folder className="w-[17px] h-[17px] text-[#2563EB] shrink-0" strokeWidth={2} />
                <span
                  className={`text-[13.5px] font-semibold truncate ${
                    hasSelection ? 'text-[#0F172A]' : 'text-[#64748B]'
                  }`}
                >
                  {getSelectorLabel()}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {selectedLibraries.length > 0 && (
                  <span className="px-2 py-0.5 rounded-[5px] text-[11px] font-semibold bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] tabular-nums">
                    {selectedLibraries.length} selected
                  </span>
                )}
                <ChevronDown
                  className={`w-4 h-4 text-[#64748B] transition-transform ${
                    dropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </button>

            {/* Multi-Select Dropdown Menu */}
            {dropdownOpen && (
              <div
                className="absolute left-0 mt-1.5 w-full sm:w-[400px] bg-white border border-[#E2E8F0] rounded-[10px] shadow-[0_8px_24px_rgba(15,23,42,0.1)] z-30 overflow-hidden"
                role="listbox"
                aria-multiselectable="true"
              >
                <div className="px-3 py-2 border-b border-[#F1F5F9] flex items-center justify-between gap-2 bg-[#F8FAFC]/70">
                  <span className="text-[11.5px] font-semibold text-[#64748B]">
                    Select one or more libraries
                  </span>
                  {libraries.length > 0 && (
                    <div className="flex items-center gap-2.5 text-[11.5px] font-semibold">
                      {!allSelected && (
                        <button
                          type="button"
                          onClick={handleSelectAll}
                          className="text-[#2563EB] hover:underline"
                        >
                          Select all
                        </button>
                      )}
                      {selectedLibraries.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearSelection}
                          className="text-[#64748B] hover:text-[#0F172A] hover:underline"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {libraries.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="text-[13px] text-[#475569]">No knowledge libraries yet.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        onNavigateToLibraries();
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#2563EB] hover:underline"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Create your first library
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="max-h-[260px] overflow-y-auto py-1">
                      {libraries.map((lib) => {
                        const isChecked = selectedLibraryIds.includes(lib.id);
                        return (
                          <button
                            key={lib.id}
                            type="button"
                            onClick={() => toggleLibraryId(lib.id)}
                            className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors ${
                              isChecked ? 'bg-[#EFF6FF]/75 hover:bg-[#EFF6FF]' : 'hover:bg-[#F8FAFC]'
                            }`}
                            role="option"
                            aria-selected={isChecked}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors ${
                                  isChecked
                                    ? 'bg-[#2563EB] border-[#2563EB] text-white'
                                    : 'bg-white border-[#CBD5E1]'
                                }`}
                              >
                                {isChecked && <Check className="w-3 h-3" strokeWidth={3} />}
                              </span>
                              <Folder
                                className="w-4 h-4 text-[#2563EB] shrink-0"
                                strokeWidth={2}
                              />
                              <div className="min-w-0">
                                <div className="text-[13.5px] font-semibold text-[#0F172A] truncate">
                                  {lib.name}
                                </div>
                                <div className="text-[11.5px] text-[#64748B] tabular-nums">
                                  {lib.readyDocumentCount ?? 0} ready · {lib.documentCount ?? 0} total docs
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="px-3 py-2 border-t border-[#F1F5F9] bg-[#F8FAFC]/70 flex items-center justify-between">
                      <span className="text-[11.5px] text-[#64748B] tabular-nums">
                        {selectedLibraries.length} of {libraries.length} selected
                      </span>
                      <button
                        type="button"
                        onClick={() => setDropdownOpen(false)}
                        className="px-3 py-1 rounded-[6px] text-[12px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] transition-colors"
                      >
                        Done
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClearChat}
            disabled={messages.length === 0}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-[13px] font-medium text-[#334155] bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] hover:border-[#CBD5E1] disabled:opacity-45 disabled:cursor-not-allowed rounded-[8px] transition-colors whitespace-nowrap shrink-0"
          >
            <Trash2 className="w-4 h-4 text-[#64748B]" />
            Clear chat
          </button>
        </div>

        {/* Active Multi-Library Scope Tags */}
        {selectedLibraries.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11.5px] font-medium text-[#64748B] mr-1">
              Searching in:
            </span>
            {selectedLibraries.map((lib) => (
              <span
                key={lib.id}
                className="inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-[6px] bg-[#EFF6FF] border border-[#BFDBFE] text-[12px] font-medium text-[#1D4ED8]"
              >
                <Folder className="w-3 h-3 shrink-0" />
                <span className="max-w-[180px] truncate">{lib.name}</span>
                <button
                  type="button"
                  onClick={() => toggleLibraryId(lib.id)}
                  aria-label={`Remove ${lib.name} from search scope`}
                  className="p-0.5 rounded-[4px] text-[#3B82F6] hover:text-[#1E3A8A] hover:bg-[#DBEAFE] transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Contextual Status Notices */}
        {ragMode === 'unconfigured' && (
          <div className="mt-3.5 flex items-start gap-2.5 px-3.5 py-2.5 rounded-[8px] bg-[#FEF2F2] border border-[#FECACA] text-[13px] text-[#991B1B]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#DC2626]" />
            <span>
              AI model service is not yet configured on the server. Ensure <strong>GEMINI_API_KEY</strong> is set in Settings &gt; Secrets.
            </span>
          </div>
        )}

        {hasSelection && totalProcessingDocs > 0 && (
          <div className="mt-3 flex items-center gap-2 px-3.5 py-2 rounded-[8px] bg-[#EFF6FF] border border-[#BFDBFE] text-[12.5px] text-[#1D4ED8]">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span>
              {totalProcessingDocs} document
              {totalProcessingDocs === 1 ? ' is' : 's are'} currently indexing across your
              selected {selectedLibraries.length === 1 ? 'library' : 'libraries'} and will become
              searchable once Ready.
            </span>
          </div>
        )}

        {hasSelection && emptySelectedLibraries.length > 0 && totalReadyDocs === 0 && (
          <div className="mt-3 flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-[8px] bg-[#F8FAFC] border border-[#E2E8F0] text-[13px] text-[#475569]">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-[#2563EB] shrink-0" />
              <span>
                {selectedLibraries.length === 1 ? (
                  <>
                    <strong>{selectedLibraries[0].name}</strong> has no uploaded documents yet.
                    Upload files before asking questions.
                  </>
                ) : (
                  <>
                    The selected libraries have no uploaded documents yet. Upload files before asking
                    questions.
                  </>
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={onOpenQuickUpload}
              className="text-[12.5px] font-semibold text-[#2563EB] hover:underline whitespace-nowrap shrink-0"
            >
              Upload files
            </button>
          </div>
        )}
      </div>

      {/* Conversation Viewport */}
      <div className="flex-1 overflow-y-auto px-5 sm:px-9 py-6">
        <div className="max-w-[920px] mx-auto space-y-6">
          {messages.length === 0 && !isAsking && (
            <div className="py-10 sm:py-14 flex flex-col items-center text-center">
              <AssistantBadgeIcon className="w-11 h-11 mb-4" />
              <h2 className="text-[17px] font-bold text-[#0F172A]">
                {selectedLibraries.length === 0
                  ? 'Select Knowledge Libraries to begin'
                  : selectedLibraries.length === 1
                  ? `Ask BIQ about "${selectedLibraries[0].name}"`
                  : `Ask BIQ across ${selectedLibraries.length} libraries`}
              </h2>
              <p className="text-[13.5px] text-[#64748B] max-w-[500px] mt-1.5 leading-relaxed">
                {selectedLibraries.length === 0
                  ? 'Choose one or more knowledge libraries above or create a new library to upload documentation.'
                  : selectedLibraries.length === 1
                  ? `Answers are strictly retrieved from the ${totalReadyDocs} indexed documents in this library. Unselected libraries are never searched.`
                  : `Answers are synthesized strictly from the ${totalReadyDocs} indexed documents across ${selectedLibraries
                      .map((l) => l.name)
                      .join(', ')}. Unselected libraries are never searched.`}
              </p>

              {hasSelection && suggestions.length > 0 && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2 max-w-[680px]">
                  {suggestions.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => void onSendQuestion(q)}
                      disabled={isAsking || ragMode === 'unconfigured'}
                      className="px-3.5 py-2 text-[13px] text-[#334155] bg-[#F8FAFC] hover:bg-[#EFF6FF] hover:text-[#1D4ED8] disabled:opacity-50 disabled:cursor-not-allowed border border-[#E2E8F0] hover:border-[#BFDBFE] rounded-[8px] transition-colors text-left"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((msg, msgIndex) => {
            if (msg.role === 'user') {
              return (
                <div key={msg.id} className="flex flex-col items-end">
                  <div className="max-w-[82%] sm:max-w-[72%] bg-[#EBF3FF] text-[#0F172A] px-4 py-2.5 rounded-[12px] text-[14px] leading-[1.55]">
                    {msg.content}
                  </div>
                  <span className="mt-1.5 text-[11px] text-[#64748B] tabular-nums">
                    {msg.timestamp}
                  </span>
                </div>
              );
            }

            const isExpanded = expandedSources[msg.id] !== false;
            const citations = msg.citations || [];
            const isMultiLibMsg = (msg.libraryIds?.length ?? 1) > 1;
            const isEvidenceOnly = msg.operatingMode === 'evidence-only';
            const precedingUserQuestion =
              msg.isError || isEvidenceOnly
                ? [...messages.slice(0, msgIndex)].reverse().find((m) => m.role === 'user')?.content
                : undefined;

            return (
              <div key={msg.id} className="flex items-start gap-3">
                <AssistantBadgeIcon className="w-8 h-8 mt-0.5" />
                <div className="flex-1 min-w-0 max-w-[88%] sm:max-w-[82%]">
                  <div
                    className={`rounded-[12px] p-4 border ${
                      msg.isError
                        ? 'bg-[#FEF2F2] border-[#FECACA]'
                        : msg.insufficientEvidence
                        ? 'bg-[#FFFBFB] border-[#FECACA]'
                        : isEvidenceOnly
                        ? 'bg-[#FFFBEB]/60 border-[#FDE68A]'
                        : 'bg-[#F8FAFC] border-[#E2E8F0]'
                    }`}
                  >
                    {isEvidenceOnly && !msg.isError && (
                      <div className="mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 rounded-[8px] bg-[#FEF3C7] border border-[#FCD34D] text-[12px] text-[#92400E]">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#D97706]" />
                          <div>
                            <strong className="font-semibold">Evidence-Only Mode:</strong>{' '}
                            <span>
                              {msg.generationNotice ||
                                'AI answer synthesis is temporarily unavailable. Displaying verified matching source extracts only.'}
                            </span>
                          </div>
                        </div>
                        {precedingUserQuestion && (
                          <button
                            type="button"
                            onClick={() => void onSendQuestion(precedingUserQuestion)}
                            disabled={isAsking || !hasSelection}
                            className="inline-flex items-center gap-1 self-start sm:self-center px-2.5 py-1 rounded-[6px] bg-white hover:bg-[#FFFBEB] border border-[#F59E0B]/50 text-[11.5px] font-semibold text-[#92400E] disabled:opacity-50 shrink-0"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Retry AI
                          </button>
                        )}
                      </div>
                    )}

                    {msg.isError ? (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[14px] text-[#B91C1C]">
                        <div className="flex items-start gap-2.5">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>{msg.content}</span>
                        </div>
                        {precedingUserQuestion && (
                          <button
                            type="button"
                            onClick={() => void onSendQuestion(precedingUserQuestion)}
                            disabled={isAsking || !hasSelection}
                            className="inline-flex items-center gap-1.5 self-start sm:self-center px-3 py-1.5 rounded-[7px] bg-white hover:bg-[#FEF2F2] border border-[#FECACA] text-[12.5px] font-semibold text-[#B91C1C] disabled:opacity-50 transition-colors shrink-0"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Try again
                          </button>
                        )}
                      </div>
                    ) : msg.insufficientEvidence ? (
                      <div className="flex items-start gap-2.5">
                        <XCircle className="w-[18px] h-[18px] text-[#DC2626] shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[14px] font-medium text-[#0F172A] leading-[1.6]">
                            {msg.content}
                          </p>
                          <p className="text-[12px] text-[#64748B] mt-1.5">
                            Searched exclusively inside{' '}
                            <span className="font-semibold text-[#334155]">{msg.libraryName}</span>.
                            No external knowledge or unselected libraries were used.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <FormattedAnswer
                        content={msg.content}
                        citations={citations}
                        onOpenCitation={onOpenCitation}
                      />
                    )}

                    {msg.processingWarning && (
                      <div className="mt-3 px-3 py-2 rounded-[6px] bg-[#EFF6FF] border border-[#DBEAFE] text-[12px] text-[#1D4ED8]">
                        {msg.processingWarning}
                      </div>
                    )}

                    {/* Sources Accordion Card */}
                    {citations.length > 0 && (
                      <div className="mt-3.5 bg-[#EFF4FA] border border-[#E2E8F0] rounded-[8px] px-3.5 py-2.5">
                        <button
                          type="button"
                          onClick={() => toggleSources(msg.id)}
                          className="w-full flex items-center gap-1.5 text-[12.5px] font-bold text-[#0F172A] focus:outline-none"
                        >
                          <span>Sources ({citations.length})</span>
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-[#475569]" />
                          ) : (
                            <ChevronUp className="w-3.5 h-3.5 text-[#475569]" />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="mt-2 pt-2 border-t border-[#E2E8F0] space-y-1.5">
                            {citations.map((cit, idx) => (
                              <button
                                key={cit.id}
                                type="button"
                                onClick={() => onOpenCitation(cit)}
                                className="w-full flex items-center justify-between gap-3 py-1 px-1.5 -mx-1.5 rounded-[6px] hover:bg-white/80 transition-colors text-left group"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[11px] font-semibold text-[#475569] tabular-nums shrink-0">
                                    [{idx + 1}]
                                  </span>
                                  <FileText className="w-4 h-4 text-[#2563EB] shrink-0" />
                                  <span className="text-[13px] font-medium text-[#2563EB] group-hover:underline truncate">
                                    {cit.documentTitle}
                                  </span>
                                </div>
                                <span className="text-[12px] text-[#475569] shrink-0 tabular-nums">
                                  {cit.libraryName && isMultiLibMsg
                                    ? `${cit.libraryName} · ${cit.pageLabel}${cit.sectionTitle ? ` · ${cit.sectionTitle}` : ''}`
                                    : `${cit.pageLabel}${cit.sectionTitle ? ` · ${cit.sectionTitle}` : ''}`}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-[#64748B] px-0.5">
                    <span className="truncate">
                      {isMultiLibMsg ? 'Libraries' : 'Library'}: {msg.libraryName}
                    </span>
                    <span className="tabular-nums shrink-0">{msg.timestamp}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Live Retrieval Progress Card */}
          {isAsking && (
            <div className="flex items-start gap-3">
              <AssistantBadgeIcon className="w-8 h-8 mt-0.5" />
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[12px] p-4 w-full max-w-[360px]">
                <div className="space-y-2.5">
                  {RETRIEVAL_STAGES.map((label, idx) => {
                    const done = idx < activeStage;
                    const current = idx === activeStage;
                    return (
                      <div key={label} className="flex items-center gap-2.5 text-[13px]">
                        {done ? (
                          <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                        ) : current ? (
                          idx === 0 ? (
                            <Search className="w-4 h-4 text-[#2563EB] animate-pulse shrink-0" />
                          ) : (
                            <Loader2 className="w-4 h-4 text-[#2563EB] animate-spin shrink-0" />
                          )
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-[#CBD5E1] shrink-0" />
                        )}
                        <span
                          className={
                            done || current
                              ? 'text-[#0F172A] font-medium'
                              : 'text-[#94A3B8]'
                          }
                        >
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Bottom Question Composer Dock */}
      <div className="px-5 sm:px-9 py-4 border-t border-[#E2E8F0] bg-white">
        <form
          onSubmit={handleSubmit}
          className="max-w-[920px] mx-auto flex items-center gap-2.5"
        >
          <div className="flex-1 flex items-center gap-2 bg-white border border-[#CBD5E1] focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]/15 rounded-[10px] px-3 py-2 transition-shadow">
            <button
              type="button"
              onClick={onOpenQuickUpload}
              disabled={!hasSelection}
              title={
                selectedLibraries.length === 1
                  ? `Upload documents to ${selectedLibraries[0].name}`
                  : selectedLibraries.length > 1
                  ? `Upload documents to ${selectedLibraries[0].name}`
                  : 'Select a library first'
              }
              className="p-1.5 rounded-[6px] text-[#64748B] hover:text-[#2563EB] hover:bg-[#EFF6FF] disabled:opacity-40 transition-colors shrink-0"
              aria-label="Upload document to selected library"
            >
              <Paperclip className="w-[18px] h-[18px]" />
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!hasSelection || isAsking}
              placeholder={
                selectedLibraries.length === 0
                  ? 'Select one or more knowledge libraries above to ask BIQ...'
                  : selectedLibraries.length === 1
                  ? `Ask BIQ about ${selectedLibraries[0].name}...`
                  : `Ask BIQ across ${selectedLibraries.length} selected libraries...`
              }
              className="flex-1 bg-transparent text-[14px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none py-1 disabled:cursor-not-allowed"
            />
          </div>

          <button
            type="submit"
            disabled={!hasSelection || !input.trim() || isAsking}
            aria-label="Send question"
            className="w-[44px] h-[44px] flex items-center justify-center rounded-[10px] bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-[#94A3B8] disabled:cursor-not-allowed text-white transition-colors shrink-0 shadow-[0_1px_2px_rgba(37,99,235,0.25)]"
          >
            {isAsking ? (
              <Loader2 className="w-[18px] h-[18px] animate-spin" />
            ) : (
              <Send className="w-[18px] h-[18px]" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
