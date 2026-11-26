import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ChevronDown,
  ChevronRight,
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
import type {
  EvaluationVerdict,
  LlmConfig,
  WorkspaceProfile,
} from '@/lib/types';

export type MainTabId =
  | 'live-audit'
  | 'cicd-gate'
  | 'policy-packs'
  | 'audit-history';

export interface SidebarCompliancePosture {
  complianceScore: number;
  verdict: EvaluationVerdict;
  blockerCount: number;
  driftCount: number;
  activePackCount: number;
  totalPackCount: number;
}

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
  compliancePosture?: SidebarCompliancePosture;
  children: React.ReactNode;
}

interface NavItem {
  id: MainTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_SECTIONS: Array<{
  title: string;
  items: NavItem[];
}> = [
  {
    title: 'ANALYSIS & GATES',
    items: [
      { id: 'live-audit', label: 'Live Audit Studio', icon: Activity },
      { id: 'cicd-gate', label: 'CI/CD Gate', icon: GitPullRequest },
    ],
  },
  {
    title: 'GOVERNANCE',
    items: [
      { id: 'policy-packs', label: 'Policy Packs', icon: Layers },
      { id: 'audit-history', label: 'Audit History', icon: History },
    ],
  },
];

const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

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
  compliancePosture,
  children,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target as Node)
      ) {
        setProfileMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [profileMenuOpen]);

  const activeProfile =
    profiles.find((p) => p.id === activeProfileId) ?? profiles[0];
  const activeTabMeta =
    ALL_NAV_ITEMS.find((t) => t.id === activeTab) ?? ALL_NAV_ITEMS[0];

  const providerShortName: Record<string, string> = {
    GEMINI_CLOUD: 'Gemini',
    OPENAI_CLOUD: 'OpenAI',
    ANTHROPIC_CLOUD: 'Claude',
    OPENROUTER_CLOUD: 'OpenRouter',
    CUSTOM_CLOUD: 'Custom',
    LOCAL_OPENAI_COMPAT: 'Local',
  };
  const llmBadgeText = `${
    providerShortName[llmConfig.provider] ?? 'Cloud'
  } · ${llmConfig.modelName || (llmConfig.provider === 'LOCAL_OPENAI_COMPAT' ? 'gemma-4-12b' : 'gemini-4-hydrogen')}`;

  const postureScore = Math.max(
    0,
    Math.min(100, compliancePosture?.complianceScore ?? 100),
  );
  const postureBarClass =
    postureScore >= 90 && (compliancePosture?.blockerCount ?? 0) === 0
      ? 'bg-emerald-400'
      : postureScore >= 70 && (compliancePosture?.blockerCount ?? 0) <= 1
        ? 'bg-amber-400'
        : 'bg-rose-500';
  const postureTextClass =
    postureScore >= 90 && (compliancePosture?.blockerCount ?? 0) === 0
      ? 'text-emerald-300'
      : postureScore >= 70 && (compliancePosture?.blockerCount ?? 0) <= 1
        ? 'text-amber-300'
        : 'text-rose-300';

  return (
    <div className="min-h-screen bg-transparent text-zinc-100 flex">
      {/* Desktop Left Sidebar */}
      <aside className="no-print hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[#08080A] border-r border-white/[0.07] z-30">
        {/* Brand Block */}
        <div className="h-16 px-5 flex items-center gap-3 border-b border-white/[0.07] shrink-0">
          <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.09] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-sm font-semibold tracking-tight text-zinc-100 truncate">
              Border Checker
            </div>
            <div className="text-[11px] text-zinc-500 truncate">
              출입국관리소 · v2.0
            </div>
          </div>
        </div>

        {/* Middle Navigation + Live Compliance Posture */}
        <div className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-5">
          {/* Grouped Navigation Links */}
          <nav className="space-y-5" aria-label="Primary">
            {NAV_SECTIONS.map((section) => (
              <div key={section.title} className="space-y-1.5">
                <div className="px-3 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                  {section.title}
                </div>
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onTabChange(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 ${
                          isActive
                            ? 'bg-white/[0.06] text-zinc-50 border border-white/[0.09] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]'
                            : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.03] border border-transparent'
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 shrink-0 transition-colors ${
                            isActive ? 'text-cyan-400' : 'text-zinc-500'
                          }`}
                        />
                        <span className="truncate flex-1 text-left">
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Compact Live Compliance Posture Mini-Card */}
          {compliancePosture && (
            <div className="bg-[#111114] border border-white/[0.07] rounded-xl p-3.5 space-y-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                  Live Compliance Posture
                </span>
                <span
                  className={`font-mono text-xs font-bold tabular-nums ${postureTextClass}`}
                >
                  {postureScore}%
                </span>
              </div>

              {/* Mini Horizontal Progress Bar */}
              <div
                role="progressbar"
                aria-valuenow={postureScore}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="현재 컴플라이언스 준수율"
                className="h-1.5 w-full rounded-full bg-white/[0.07] overflow-hidden"
              >
                <div
                  className={`h-full rounded-full transition-all duration-300 ${postureBarClass}`}
                  style={{ width: `${postureScore}%` }}
                />
              </div>

              {/* Compact BLOCKER / DRIFT Count Pills */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onTabChange('live-audit')}
                  className={`flex-1 inline-flex items-center justify-between px-2 py-1 rounded-md border font-mono text-[10px] tabular-nums transition-colors ${
                    compliancePosture.blockerCount > 0
                      ? 'border-rose-500/35 bg-rose-500/[0.09] text-rose-300 hover:border-rose-400/55'
                      : 'border-white/[0.07] bg-white/[0.02] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span>BLOCKER</span>
                  <span className="font-bold">
                    {compliancePosture.blockerCount}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onTabChange('live-audit')}
                  className={`flex-1 inline-flex items-center justify-between px-2 py-1 rounded-md border font-mono text-[10px] tabular-nums transition-colors ${
                    compliancePosture.driftCount > 0
                      ? 'border-amber-500/35 bg-amber-500/[0.09] text-amber-300 hover:border-amber-400/55'
                      : 'border-white/[0.07] bg-white/[0.02] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span>DRIFT</span>
                  <span className="font-bold">
                    {compliancePosture.driftCount}
                  </span>
                </button>
              </div>

              {/* Active Policy Pack Count */}
              <button
                type="button"
                onClick={() => onTabChange('policy-packs')}
                className="w-full pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                <span>적용 법률 팩</span>
                <span className="font-mono text-zinc-200 tabular-nums">
                  {compliancePosture.activePackCount} /{' '}
                  {compliancePosture.totalPackCount} Active Packs
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Bottom Elevated Active Profile Card + 1-Line Engine Status Footer */}
        <div className="shrink-0 p-3 pt-2 border-t border-white/[0.07] space-y-2.5">
          {activeProfile && (
            <button
              type="button"
              onClick={onOpenNewProfileModal}
              title="새 워크스페이스 프로필 추가 및 설정"
              className="w-full text-left bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] rounded-xl p-3 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 group"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[10px] font-medium text-zinc-500">
                  현재 활성 프로필
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" />
              </div>
              <div className="text-xs font-semibold text-zinc-100 truncate">
                {activeProfile.profile_name}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/[0.08] font-mono text-[10px] font-semibold text-cyan-300 whitespace-nowrap">
                  {activeProfile.business_country}
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-white/[0.08] bg-white/[0.04] font-mono text-[10px] text-zinc-300 whitespace-nowrap">
                  {activeProfile.industry_domain}
                </span>
              </div>
            </button>
          )}

          {/* Clean 1-Line Engine Status Footer */}
          <div className="px-1.5 pb-0.5 flex items-center gap-2 text-[11px] font-mono text-zinc-400 whitespace-nowrap truncate">
            <span
              aria-hidden="true"
              className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
            />
            <span className="truncate">Deterministic Rule Engine v2.0</span>
          </div>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-full bg-[#08080A] border-r border-white/[0.07] flex flex-col z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-white/[0.07] shrink-0">
              <span className="font-display text-sm font-semibold text-zinc-100">
                Border Checker v2.0
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-zinc-400 hover:text-zinc-100 rounded-lg transition-colors"
                aria-label="메뉴 닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
              <nav className="space-y-5" aria-label="Mobile Primary">
                {NAV_SECTIONS.map((section) => (
                  <div key={section.title} className="space-y-1.5">
                    <div className="px-3 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                      {section.title}
                    </div>
                    <div className="space-y-1">
                      {section.items.map((item) => {
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
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                              isActive
                                ? 'bg-white/[0.06] text-zinc-50 border border-white/[0.09] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]'
                                : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.03] border border-transparent'
                            }`}
                          >
                            <Icon
                              className={`w-4 h-4 shrink-0 ${
                                isActive ? 'text-cyan-400' : 'text-zinc-500'
                              }`}
                            />
                            <span className="flex-1 text-left truncate">
                              {item.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>

              {/* Mobile Live Compliance Posture Mini-Card */}
              {compliancePosture && (
                <div className="bg-[#111114] border border-white/[0.07] rounded-xl p-3.5 space-y-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                      Live Compliance Posture
                    </span>
                    <span
                      className={`font-mono text-xs font-bold tabular-nums ${postureTextClass}`}
                    >
                      {postureScore}%
                    </span>
                  </div>

                  <div
                    role="progressbar"
                    aria-valuenow={postureScore}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="현재 컴플라이언스 준수율"
                    className="h-1.5 w-full rounded-full bg-white/[0.07] overflow-hidden"
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${postureBarClass}`}
                      style={{ width: `${postureScore}%` }}
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onTabChange('live-audit');
                        setMobileMenuOpen(false);
                      }}
                      className={`flex-1 inline-flex items-center justify-between px-2 py-1 rounded-md border font-mono text-[10px] tabular-nums transition-colors ${
                        compliancePosture.blockerCount > 0
                          ? 'border-rose-500/35 bg-rose-500/[0.09] text-rose-300 hover:border-rose-400/55'
                          : 'border-white/[0.07] bg-white/[0.02] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <span>BLOCKER</span>
                      <span className="font-bold">
                        {compliancePosture.blockerCount}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onTabChange('live-audit');
                        setMobileMenuOpen(false);
                      }}
                      className={`flex-1 inline-flex items-center justify-between px-2 py-1 rounded-md border font-mono text-[10px] tabular-nums transition-colors ${
                        compliancePosture.driftCount > 0
                          ? 'border-amber-500/35 bg-amber-500/[0.09] text-amber-300 hover:border-amber-400/55'
                          : 'border-white/[0.07] bg-white/[0.02] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <span>DRIFT</span>
                      <span className="font-bold">
                        {compliancePosture.driftCount}
                      </span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onTabChange('policy-packs');
                      setMobileMenuOpen(false);
                    }}
                    className="w-full pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-400 hover:text-zinc-100 transition-colors"
                  >
                    <span>적용 법률 팩</span>
                    <span className="font-mono text-zinc-200 tabular-nums">
                      {compliancePosture.activePackCount} /{' '}
                      {compliancePosture.totalPackCount} Active Packs
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Bottom Active Profile Card + 1-Line Engine Status Footer */}
            <div className="shrink-0 p-3 pt-2 border-t border-white/[0.07] space-y-2.5">
              {activeProfile && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenNewProfileModal();
                  }}
                  title="새 워크스페이스 프로필 추가 및 설정"
                  className="w-full text-left bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] rounded-xl p-3 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 group"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-medium text-zinc-500">
                      현재 활성 프로필
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" />
                  </div>
                  <div className="text-xs font-semibold text-zinc-100 truncate">
                    {activeProfile.profile_name}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/[0.08] font-mono text-[10px] font-semibold text-cyan-300 whitespace-nowrap">
                      {activeProfile.business_country}
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-white/[0.08] bg-white/[0.04] font-mono text-[10px] text-zinc-300 whitespace-nowrap">
                      {activeProfile.industry_domain}
                    </span>
                  </div>
                </button>
              )}

              <div className="px-1.5 pb-0.5 flex items-center gap-2 text-[11px] font-mono text-zinc-400 whitespace-nowrap truncate">
                <span
                  aria-hidden="true"
                  className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
                />
                <span className="truncate">Deterministic Rule Engine v2.0</span>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0 print-full-width">
        {/* Top Header */}
        <header className="no-print h-16 px-4 sm:px-6 border-b border-white/[0.07] bg-[#050507]/80 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between gap-4">
          {/* Header Left: Multi-Profile Switcher + Tab Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-zinc-400 hover:text-zinc-100 rounded-lg transition-colors"
              aria-label="내비게이션 열기"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div ref={profileMenuRef} className="relative">
              <button
                type="button"
                aria-expanded={profileMenuOpen}
                aria-haspopup="menu"
                onClick={() => setProfileMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0C0C0F] border border-white/[0.08] hover:border-white/[0.16] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] text-xs font-medium text-zinc-100 transition-colors whitespace-nowrap max-w-[240px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60"
              >
                <span className="truncate">
                  {activeProfile?.profile_name ?? '프로필 선택'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              </button>

              {profileMenuOpen && (
                <div
                  role="menu"
                  aria-label="워크스페이스 프로필 목록"
                  className="absolute left-0 mt-1.5 w-80 rounded-lg bg-[#0C0C0F] border border-white/[0.1] shadow-[0_20px_48px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.06)] py-1.5 z-40"
                >
                  <div className="px-3 py-1.5 text-[11px] font-medium text-zinc-400 border-b border-white/[0.07]">
                    워크스페이스 프로필 전환 ({profiles.length})
                  </div>
                  <div className="max-h-60 overflow-y-auto py-1">
                    {profiles.map((profile) => {
                      const selected = profile.id === activeProfile?.id;
                      return (
                        <div
                          key={profile.id}
                          className={`flex items-center justify-between gap-2 px-3 py-2 transition-colors ${
                            selected
                              ? 'bg-white/[0.06] text-zinc-50'
                              : 'text-zinc-300 hover:bg-white/[0.04]'
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
                            <div
                              className={`text-xs font-medium truncate ${selected ? 'text-cyan-300' : ''}`}
                            >
                              {profile.profile_name}
                            </div>
                            <div className="text-[11px] text-zinc-400 truncate mt-0.5 tabular-nums">
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
                              className="p-1 text-zinc-500 hover:text-rose-300 rounded transition-colors shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="pt-1 border-t border-white/[0.07] px-2">
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        onOpenNewProfileModal();
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-medium text-cyan-300 hover:bg-white/[0.05] transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>새 프로필 추가</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <span className="hidden md:inline text-zinc-700" aria-hidden="true">
              /
            </span>
            <h1 className="hidden md:block font-display text-sm font-semibold text-zinc-200 truncate">
              {activeTabMeta.label}
            </h1>
          </div>

          {/* Header Right: AI Engine Config Button + Run Audit */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onOpenLlmSettings}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0C0C0F] border border-white/[0.08] hover:border-white/[0.16] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] text-xs text-zinc-200 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60"
            >
              <Cpu className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="hidden sm:inline">AI 엔진 설정</span>
              <span className="text-zinc-600" aria-hidden="true">
                ·
              </span>
              <span className="font-mono text-[11px] text-zinc-400">
                {llmBadgeText}
              </span>
            </button>

            {isDirty && !isAuditing && (
              <span
                className="hidden xl:inline-flex items-center px-2.5 py-1 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-300 text-[11px] font-medium whitespace-nowrap shrink-0"
                role="status"
              >
                입력 변경됨 · 재심사 필요
              </span>
            )}

            {isAuditing ? (
              <button
                type="button"
                onClick={onCancelAudit}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-rose-500/90 hover:bg-rose-500 text-white border border-rose-400/30 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>심사 중지</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onRunAudit}
                className={`group relative overflow-hidden inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[#FAFAFA] hover:bg-white text-[#050507] text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                  isDirty ? 'ring-2 ring-amber-400/70' : ''
                }`}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-black/10 to-transparent -translate-x-[150%] group-hover:animate-[shimmerSweep_0.75s_cubic-bezier(0.16,1,0.3,1)]"
                />
                <Play className="w-3.5 h-3.5 fill-current relative z-10" />
                <span className="relative z-10">
                  {isDirty ? '재심사 실행' : '심사 실행'}
                </span>
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
