import React from 'react';
import { Folder, LogOut, MessageSquareMore, Settings, X } from 'lucide-react';
import { BusinessIQLogo } from './BrandIcons.tsx';
import { getInitials } from '../lib/format.ts';

export type NavSection = 'ask' | 'libraries' | 'settings';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  operatorName: string;
  userEmail: string | null;
  onSignOut: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  operatorName,
  userEmail,
  onSignOut,
  mobileOpen,
  onCloseMobile,
}) => {
  const navItems: Array<{
    id: NavSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'ask', label: 'Ask BIQ', icon: MessageSquareMore },
    { id: 'libraries', label: 'Knowledge Libraries', icon: Folder },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleNav = (id: NavSection) => {
    onSelectSection(id);
    onCloseMobile();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0F1829] text-white select-none">
      {/* Brand Lockup */}
      <div className="flex items-center justify-between px-4 pt-5 pb-6">
        <button
          type="button"
          onClick={() => handleNav('ask')}
          className="flex items-center gap-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] rounded-[8px] py-0.5 pr-2"
        >
          <BusinessIQLogo className="w-7 h-7 shrink-0" />
          <span className="text-[17px] font-bold tracking-[-0.02em] text-white whitespace-nowrap">
            Business IQ
          </span>
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          className="md:hidden p-1.5 rounded-[8px] text-[#94A3B8] hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close navigation menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Primary Navigation */}
      <nav className="flex-1 px-3 space-y-1.5" aria-label="Main navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNav(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-[13.5px] font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-[#2563EB] text-white shadow-[0_1px_2px_rgba(37,99,235,0.35)]'
                  : 'text-[#CBD5E1] hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <Icon
                className={`w-[17px] h-[17px] shrink-0 ${
                  isActive ? 'text-white' : 'text-[#94A3B8]'
                }`}
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Authenticated User Footer */}
      <div className="px-4 py-4 border-t border-white/[0.08] flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => handleNav('settings')}
          className="flex-1 min-w-0 flex items-center gap-3 text-left rounded-[8px] p-1 -m-1 hover:bg-white/[0.05] transition-colors"
        >
          <div className="w-[34px] h-[34px] rounded-full bg-[#CBD5E1] text-[#0F1829] flex items-center justify-center text-[12px] font-semibold shrink-0">
            {getInitials(operatorName)}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-white truncate leading-tight">
              {operatorName}
            </div>
            <div className="text-[11px] text-[#94A3B8] truncate leading-tight mt-0.5">
              {userEmail || 'Signed in'}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            onCloseMobile();
            onSignOut();
          }}
          title="Sign out"
          aria-label="Sign out"
          className="p-1.5 rounded-[7px] text-[#94A3B8] hover:text-white hover:bg-white/10 transition-colors shrink-0"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden md:flex md:w-[228px] md:shrink-0 md:flex-col h-screen sticky top-0">
        {sidebarContent}
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-[#0F172A]/50 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-[256px] max-w-[82vw] h-full shadow-2xl z-10">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};
