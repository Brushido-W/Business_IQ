import React, { useState } from 'react';
import { AlertCircle, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase.ts';
import { BusinessIQLogo } from './BrandIcons.tsx';

export const AuthGate: React.FC = () => {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: string }).code)
          : '';
      if (code === 'auth/popup-closed-by-user') {
        setError('Sign-in was canceled before completion. Please try again.');
      } else if (code === 'auth/popup-blocked') {
        setError('Your browser blocked the Google sign-in popup. Allow popups for this site and try again.');
      } else if (code === 'auth/unauthorized-domain') {
        setError('This domain is not yet authorized in Firebase Authentication settings.');
      } else {
        setError(err instanceof Error ? err.message : 'Unable to sign in with Google.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8FAFC] px-4 py-10">
      <div className="w-full max-w-[420px] bg-white border border-[#E2E8F0] rounded-[14px] shadow-[0_12px_36px_rgba(15,23,42,0.08)] overflow-hidden">
        {/* Top Navy Header Strip matching Business IQ Sidebar */}
        <div className="bg-[#0F1829] px-6 py-6 text-white">
          <div className="flex items-center gap-3">
            <BusinessIQLogo className="w-8 h-8 shrink-0" />
            <div>
              <h1 className="text-[19px] font-bold tracking-[-0.02em] leading-tight">
                Business IQ
              </h1>
              <p className="text-[12px] text-[#94A3B8]">KnowledgeBase AI Workspace</p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-7">
          <h2 className="text-[18px] font-bold text-[#0F172A] tracking-[-0.015em]">
            Sign in to your workspace
          </h2>
          <p className="mt-1.5 text-[13.5px] text-[#475569] leading-relaxed">
            Access your private knowledge libraries, folders, uploaded documents, and citation-backed AI answers.
          </p>

          {error && (
            <div className="mt-4 flex items-start gap-2.5 p-3 rounded-[8px] bg-[#FEF2F2] border border-[#FECACA] text-[13px] text-[#B91C1C]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleGoogleSignIn()}
            disabled={signingIn}
            className="mt-6 w-full flex items-center justify-center gap-3 px-4 py-2.5 text-[14px] font-semibold text-[#0F172A] bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] hover:border-[#94A3B8] disabled:opacity-60 rounded-[8px] transition-colors shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          >
            {signingIn ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#2563EB]" />
            ) : (
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.37 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
            )}
            <span>{signingIn ? 'Signing in...' : 'Continue with Google'}</span>
          </button>

          <div className="mt-6 pt-5 border-t border-[#F1F5F9] space-y-2.5 text-[12px] text-[#64748B]">
            <div className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
              <span>Private data isolated per authenticated Google account</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
              <span>Backed by Cloud Firestore &amp; Firebase Security Rules</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
