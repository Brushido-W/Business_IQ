import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Database,
  Loader2,
  LogOut,
  RefreshCw,
  Server,
  Shield,
  ShieldCheck,
  User,
} from 'lucide-react';
import { ConnectionTestResult, RagOperatingMode, SystemStatus } from '../types/knowledge.ts';
import { FIREBASE_PROJECT_ID, FIREBASE_STORAGE_BUCKET } from '../lib/firebase.ts';

interface SettingsScreenProps {
  operatorName: string;
  userEmail: string | null;
  onUpdateOperatorName: (name: string) => Promise<void>;
  onSignOut: () => void;
  systemStatus: SystemStatus | null;
  onTestConnection: () => Promise<ConnectionTestResult>;
  onRefreshStatus: () => Promise<void>;
}

function formatOperatingModeLabel(mode?: RagOperatingMode): string {
  switch (mode) {
    case 'full-rag':
      return 'Mode A — Full RAG (Semantic + LLM)';
    case 'lightweight-rag':
      return 'Mode B — Lightweight RAG (Keyword + LLM)';
    case 'evidence-only':
      return 'Mode C — Evidence-only (No LLM)';
    default:
      return 'Checking...';
  }
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  operatorName,
  userEmail,
  onUpdateOperatorName,
  onSignOut,
  systemStatus,
  onTestConnection,
  onRefreshStatus,
}) => {
  const [nameInput, setNameInput] = useState(operatorName);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [testingConn, setTestingConn] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    setNameInput(operatorName);
  }, [operatorName]);

  useEffect(() => {
    void onRefreshStatus();
  }, [onRefreshStatus]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = nameInput.trim();
    if (!cleaned || saving) return;
    setSaving(true);
    try {
      await onUpdateOperatorName(cleaned);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleRunConnectionTest = async () => {
    if (testingConn) return;
    setTestingConn(true);
    setTestError(null);
    try {
      const res = await onTestConnection();
      setTestResult(res);
    } catch (err: unknown) {
      setTestError(err instanceof Error ? err.message : 'Unable to complete connection test.');
    } finally {
      setTestingConn(false);
    }
  };

  const connStatus = systemStatus?.backendConnectionStatus || 'connected';

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="max-w-[820px] mx-auto px-5 sm:px-9 py-6 sm:py-8 space-y-6">
        <div>
          <h1 className="text-[26px] sm:text-[28px] font-bold tracking-[-0.025em] text-[#0F172A] leading-tight">
            Settings
          </h1>
          <p className="text-[14.5px] text-[#475569] mt-1">
            Manage your authenticated profile, cloud persistence, and retrieval configuration.
          </p>
        </div>

        {/* Authenticated Workspace Notice */}
        <div className="flex items-start justify-between gap-4 p-4 rounded-[12px] bg-[#EFF6FF] border border-[#BFDBFE]">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-[#2563EB] shrink-0 mt-0.5" />
            <div className="text-[13.5px] text-[#1E3A8A] leading-relaxed">
              <strong className="font-semibold text-[#0F172A]">
                Authenticated Firebase Workspace
              </strong>
              <p className="mt-0.5 text-[#334155]">
                Signed in as <strong className="text-[#0F172A]">{userEmail || operatorName}</strong>.
                All knowledge libraries, folders, and documents are isolated to your account and
                enforced by Firestore Security Rules.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium text-[#334155] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-[8px] transition-colors whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5 text-[#64748B]" />
            Sign out
          </button>
        </div>

        {/* User Profile */}
        <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <User className="w-4 h-4 text-[#2563EB]" />
            <h2 className="text-[15px] font-bold text-[#0F172A]">Account Profile</h2>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4 max-w-[420px]">
            <div>
              <label
                htmlFor="operator-name"
                className="block text-[13px] font-semibold text-[#0F172A] mb-1.5"
              >
                Display Name
              </label>
              <input
                id="operator-name"
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                maxLength={60}
                className="w-full px-3 py-2 text-[14px] text-[#0F172A] bg-white border border-[#CBD5E1] rounded-[8px] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
              />
            </div>

            {userEmail && (
              <div>
                <div className="block text-[13px] font-semibold text-[#0F172A] mb-1">
                  Google Account Email
                </div>
                <div className="text-[13.5px] text-[#475569]">{userEmail}</div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-[13.5px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 rounded-[8px] transition-colors"
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
              {savedNotice && (
                <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#15803D]">
                  <CheckCircle2 className="w-4 h-4" />
                  Saved to Firestore
                </span>
              )}
            </div>
          </form>
        </section>

        {/* Compact System Diagnostics */}
        <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <Activity className="w-4 h-4 text-[#2563EB]" />
              <h2 className="text-[15px] font-bold text-[#0F172A]">System Diagnostics</h2>
            </div>

            <button
              type="button"
              onClick={() => void handleRunConnectionTest()}
              disabled={testingConn}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[12.5px] font-semibold text-[#1D4ED8] bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#BFDBFE] disabled:opacity-60 rounded-[8px] transition-colors shrink-0"
            >
              {testingConn ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {testingConn ? 'Testing API...' : 'Test API Connection'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
            <div className="flex items-center justify-between py-2 border-b border-[#F1F5F9]">
              <span className="text-[#64748B]">Operating Mode</span>
              <span className="font-semibold text-[#0F172A] text-right">
                {formatOperatingModeLabel(systemStatus?.operatingMode)}
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-[#F1F5F9]">
              <span className="text-[#64748B]">Backend Connection</span>
              <span
                className={`inline-flex items-center gap-1.5 font-semibold ${
                  connStatus === 'connected'
                    ? 'text-[#15803D]'
                    : connStatus === 'degraded'
                    ? 'text-[#B45309]'
                    : 'text-[#B91C1C]'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    connStatus === 'connected'
                      ? 'bg-[#16A34A]'
                      : connStatus === 'degraded'
                      ? 'bg-[#D97706]'
                      : 'bg-[#DC2626]'
                  }`}
                />
                {connStatus === 'connected'
                  ? 'Connected'
                  : connStatus === 'degraded'
                  ? 'Degraded'
                  : 'Unavailable'}
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-[#F1F5F9]">
              <span className="text-[#64748B]">Active Generation Model</span>
              <span className="font-medium text-[#0F172A] font-mono text-[12px]">
                {systemStatus?.activeGenerationModel || 'None available'}
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-[#F1F5F9]">
              <span className="text-[#64748B]">Active Embedding Model</span>
              <span className="font-medium text-[#0F172A] font-mono text-[12px]">
                {systemStatus?.activeEmbeddingModel || 'gemini-embedding-2'}
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-[#F1F5F9]">
              <span className="text-[#64748B]">Last API Status Code</span>
              <span className="font-medium text-[#0F172A] tabular-nums">
                {systemStatus?.lastApiStatusCode !== null &&
                systemStatus?.lastApiStatusCode !== undefined
                  ? `HTTP ${systemStatus.lastApiStatusCode}`
                  : 'No requests yet'}
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-[#F1F5F9]">
              <span className="text-[#64748B]">Last Request Duration</span>
              <span className="font-medium text-[#0F172A] tabular-nums">
                {systemStatus?.lastRequestDurationMs !== null &&
                systemStatus?.lastRequestDurationMs !== undefined
                  ? `${systemStatus.lastRequestDurationMs} ms`
                  : '—'}
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-[#F1F5F9] sm:col-span-2">
              <span className="text-[#64748B]">Last Retrieved Passages</span>
              <span className="font-medium text-[#0F172A] tabular-nums">
                {systemStatus?.lastRetrievedPassagesCount !== null &&
                systemStatus?.lastRetrievedPassagesCount !== undefined
                  ? `${systemStatus.lastRetrievedPassagesCount} passage${
                      systemStatus.lastRetrievedPassagesCount === 1 ? '' : 's'
                    }`
                  : '—'}
              </span>
            </div>
          </div>

          {systemStatus?.lastErrorDetail && (
            <div className="mt-3 px-3 py-2 rounded-[8px] bg-[#FEF2F2] border border-[#FECACA] text-[12.5px] text-[#991B1B] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#DC2626]" />
              <span>{systemStatus.lastErrorDetail}</span>
            </div>
          )}

          {testError && (
            <div className="mt-3 px-3 py-2 rounded-[8px] bg-[#FEF2F2] border border-[#FECACA] text-[12.5px] text-[#991B1B]">
              {testError}
            </div>
          )}

          {testResult && (
            <div className="mt-4 p-3.5 rounded-[8px] bg-[#F8FAFC] border border-[#E2E8F0] space-y-2 text-[12.5px]">
              <div className="flex items-center justify-between font-semibold text-[#0F172A]">
                <span>Connection Probe Results</span>
                <span className="text-[11.5px] font-normal text-[#64748B] tabular-nums">
                  {new Date(testResult.testedAt).toLocaleTimeString()}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[12px] text-[#334155]">
                    {testResult.embeddingProbe.model} (embedding)
                  </span>
                  <span
                    className={`font-medium tabular-nums ${
                      testResult.embeddingProbe.ok ? 'text-[#15803D]' : 'text-[#B91C1C]'
                    }`}
                  >
                    HTTP {testResult.embeddingProbe.statusCode} · {testResult.embeddingProbe.durationMs} ms
                  </span>
                </div>

                {testResult.generationProbes.map((probe) => (
                  <div key={probe.model} className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[12px] text-[#334155]">
                      {probe.model} (generation)
                    </span>
                    <span
                      className={`font-medium tabular-nums ${
                        probe.ok ? 'text-[#15803D]' : 'text-[#B91C1C]'
                      }`}
                    >
                      HTTP {probe.statusCode} ({probe.category}) · {probe.durationMs} ms
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* RAG & Security Guardrails */}
        <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <Shield className="w-4 h-4 text-[#2563EB]" />
            <h2 className="text-[15px] font-bold text-[#0F172A]">
              Retrieval &amp; Grounding Guardrails
            </h2>
          </div>

          <div className="divide-y divide-[#F1F5F9] text-[13.5px]">
            <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="font-medium text-[#0F172A]">Active RAG Engine</span>
              <span className="text-[#475569]">
                {systemStatus?.activeRagEngine || 'Server-side Gemini RAG'}
              </span>
            </div>
            <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="font-medium text-[#0F172A]">Library &amp; Tenant Isolation</span>
              <span className="inline-flex items-center gap-1.5 text-[#15803D] font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Enforced via Firestore Security Rules &amp; library scope
              </span>
            </div>
            <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="font-medium text-[#0F172A]">Untrusted Document Defense</span>
              <span className="inline-flex items-center gap-1.5 text-[#15803D] font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Evidence-first prompt isolation active
              </span>
            </div>
            <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="font-medium text-[#0F172A]">Supported File Types</span>
              <span className="text-[#475569]">
                {(systemStatus?.supportedExtensions || ['PDF', 'DOCX', 'TXT', 'MD']).join(', ')} (Max{' '}
                {systemStatus?.maxUploadSizeMb || 25} MB)
              </span>
            </div>
          </div>
        </section>

        {/* Cloud Persistence & Storage */}
        <section className="bg-white border border-[#E2E8F0] rounded-[12px] p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <Database className="w-4 h-4 text-[#2563EB]" />
            <h2 className="text-[15px] font-bold text-[#0F172A]">
              Cloud Firestore &amp; Firebase Storage
            </h2>
          </div>

          <div className="flex items-start gap-2.5 text-[13.5px] text-[#475569] leading-relaxed">
            <Server className="w-4 h-4 text-[#64748B] shrink-0 mt-1" />
            <p>
              Libraries, folders, extracted document pages, and indexed chunks are persisted in{' '}
              <strong className="text-[#0F172A]">
                Cloud Firestore ({FIREBASE_PROJECT_ID})
              </strong>
              , and uploaded document binaries are stored in{' '}
              <strong className="text-[#0F172A]">
                Firebase Storage ({FIREBASE_STORAGE_BUCKET})
              </strong>
              . Your data syncs automatically across sessions and devices when signed in with the
              same Google account.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};
