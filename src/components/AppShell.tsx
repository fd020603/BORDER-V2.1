import React, { useState } from 'react';
import {
  Activity,
  ChevronDown,
  Cpu,
  GitPullRequest,
  History,
  Layers,
  Menu,
  Play,
  Plus,
  ShieldCheck,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type { LlmConfig, WorkspaceProfile } from '@/lib/types';

export type MainTabId = 'live-audit' | 'cicd-gate' | 'policy-packs' | 'audit-history';

interface AppShellProps {
  activeTab: MainTabId;
  onTabChange: (tab: MainTabId) => void;
  profiles: WorkspaceProfile[];
  activeProfileId: string;
  onProfileChange: (profileId: string) => void;
  onOpenNewProfileModal: () => void;
  onDeleteProfile: (profileId: string) => void;
  llmConfig: LlmConfig;
  onOpenLlmSettings: () => void;
  onRunAudit: () => void;
  onCancelAudit?: () => void;
  isAuditing: boolean;
  isDirty?: boolean;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{
  id: MainTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'live-audit', label: 'Live Audit Studio', icon: Activity },
  { id: 'cicd-gate', label: 'CI/CD Gate', icon: GitPullRequest },
  { id: 'policy-packs', label: 'Policy Packs', icon: Layers },
  { id: 'audit-history', label: 'Audit History', icon: History },
];

export function AppShell({
  activeTab,
  onTabChange,
  profiles,
  activeProfileId,
  onProfileChange,
  onOpenNewProfileModal,
  onDeleteProfile,
  llmConfig,
  onOpenLlmSettings,
  onRunAudit,
  onCancelAudit,
  isAuditing,
  isDirty = false,
  children,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const activeProfile =
    profiles.find((p) => p.id === activeProfileId) ?? profiles[0];
  const activeTabMeta = NAV_ITEMS.find((t) => t.id === activeTab) ?? NAV_ITEMS[0];

  const llmBadgeText =
    llmConfig.provider === 'GEMINI_CLOUD'
      ? `Cloud · ${llmConfig.modelName || 'gemini-4-hydrogen'}`
      : `Local · ${llmConfig.modelName || 'gemma-4-12b'}`;

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 flex">
      {/* Desktop Left Sidebar */}
      <aside className="no-print hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[#090E1C] border-r border-slate-800 z-30">
        {/* Brand Block */}
        <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-800 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-sky-400" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-sm font-semibold tracking-tight text-slate-100 truncate">
              Border Checker
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              출입국관리소 · v2.0
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex-1 p-3 space-y-1" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                  isActive
                    ? 'bg-sky-500/12 text-sky-300 border border-sky-500/25'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Active Profile Meta */}
        {activeProfile && (
          <div className="px-4 py-3 border-t border-slate-800 text-xs">
            <div className="text-[11px] text-slate-400 mb-1">현재 활성 프로필</div>
            <div className="font-medium text-slate-200 truncate">
              {activeProfile.profile_name}
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-0.5 truncate">
              {activeProfile.business_country} · {activeProfile.industry_domain}
            </div>
          </div>
        )}

        {/* Guardrail Positioning Footnote */}
        <div className="p-4 border-t border-slate-800 text-[11px] leading-relaxed text-slate-400">
          Policy-Infra Drift Linter
          <br />
          문서-인프라 정합성 및 법정 필수 고지 대조 도구 (법률 자문 아님)
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-full bg-[#090E1C] border-r border-slate-800 flex flex-col z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800">
              <span className="font-display text-sm font-semibold text-slate-100">
                Border Checker v2.0
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-100 rounded-lg"
                aria-label="메뉴 닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onTabChange(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      isActive
                        ? 'bg-sky-500/15 text-sky-300'
                        : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0 print-full-width">
        {/* Top Header */}
        <header className="no-print h-16 px-4 sm:px-6 border-b border-slate-800 bg-[#060913]/95 backdrop-blur-sm sticky top-0 z-20 flex items-center justify-between gap-4">
          {/* Header Left: Multi-Profile Switcher + Tab Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-slate-100 rounded-lg"
              aria-label="내비게이션 열기"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0B1120] border border-slate-800 hover:border-slate-700 text-xs font-medium text-slate-100 whitespace-nowrap max-w-[240px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                <span className="truncate">
                  {activeProfile?.profile_name ?? '프로필 선택'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>

              {profileMenuOpen && (
                <div className="absolute left-0 mt-1.5 w-80 rounded-lg bg-[#0E1528] border border-slate-700 shadow-2xl py-1.5 z-40">
                  <div className="px-3 py-1.5 text-[11px] font-medium text-slate-400 border-b border-slate-800">
                    워크스페이스 프로필 전환 ({profiles.length})
                  </div>
                  <div className="max-h-60 overflow-y-auto py-1">
                    {profiles.map((profile) => {
                      const selected = profile.id === activeProfile?.id;
                      return (
                        <div
                          key={profile.id}
                          className={`flex items-center justify-between gap-2 px-3 py-2 ${
                            selected
                              ? 'bg-sky-500/12 text-sky-300'
                              : 'text-slate-300 hover:bg-slate-800/70'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onProfileChange(profile.id);
                              setProfileMenuOpen(false);
                            }}
                            className="flex-1 text-left min-w-0"
                          >
                            <div className="text-xs font-medium truncate">
                              {profile.profile_name}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {profile.business_country} ·{' '}
                              {profile.data_subject_countries.join(', ')} ·{' '}
                              {profile.industry_domain}
                            </div>
                          </button>

                          {profiles.length > 1 && (
                            <button
                              type="button"
                              onClick={() => onDeleteProfile(profile.id)}
                              aria-label={`${profile.profile_name} 삭제`}
                              className="p-1 text-slate-500 hover:text-rose-300 rounded shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="pt-1 border-t border-slate-800 px-2">
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        onOpenNewProfileModal();
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-medium text-sky-300 hover:bg-sky-500/10 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>새 프로필 추가</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <span className="hidden md:inline text-slate-700" aria-hidden="true">
              /
            </span>
            <h1 className="hidden md:block font-display text-sm font-semibold text-slate-200 truncate">
              {activeTabMeta.label}
            </h1>
          </div>

          {/* Header Right: AI Engine Config Button + Run Audit */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onOpenLlmSettings}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0B1120] border border-slate-800 hover:border-slate-700 text-xs text-slate-200 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <Cpu className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="hidden sm:inline">AI 엔진 설정</span>
              <span className="text-slate-500" aria-hidden="true">
                ·
              </span>
              <span className="font-mono text-[11px] text-slate-300">
                {llmBadgeText}
              </span>
            </button>

            {isDirty && !isAuditing && (
              <span
                className="hidden xl:inline-flex items-center px-2.5 py-1 rounded-md border border-amber-500/50 bg-amber-950/40 text-amber-300 text-[11px] font-medium whitespace-nowrap shrink-0"
                role="status"
              >
                입력 변경됨 · 재심사 필요
              </span>
            )}

            {isAuditing ? (
              <button
                type="button"
                onClick={onCancelAudit}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>심사 중지</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onRunAudit}
                className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 ${
                  isDirty
                    ? 'bg-amber-400 hover:bg-amber-300 ring-2 ring-amber-400/50 focus-visible:ring-amber-300'
                    : 'bg-sky-500 hover:bg-sky-400 focus-visible:ring-sky-300'
                }`}
              >
                <Play className="w-3.5 h-3.5" />
                <span>{isDirty ? '재심사 실행' : '심사 실행'}</span>
              </button>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 px-4 sm:px-6 py-6 max-w-[1360px] w-full mx-auto print-full-width">
          {children}
        </main>
      </div>
    </div>
  );
}
