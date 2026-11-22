import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { extractFriendlyErrorMessage } from '../lib/firebase.ts';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: extractFriendlyErrorMessage(error, 'An unexpected application error occurred.'),
    };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Uncaught application error:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-6">
          <div className="max-w-[440px] w-full bg-white border border-[#E2E8F0] rounded-[12px] p-6 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
            <div className="w-10 h-10 rounded-[10px] bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center mb-4">
              <AlertCircle className="w-5 h-5 text-[#DC2626]" />
            </div>
            <h1 className="text-[18px] font-bold text-[#0F172A]">Something went wrong</h1>
            <p className="mt-2 text-[13.5px] text-[#475569] leading-relaxed">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-[13.5px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[8px] transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reload Workspace
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
