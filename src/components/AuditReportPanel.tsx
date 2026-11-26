import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileWarning,
  Printer,
  Scale,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { getRuleCategoryLabel } from '@/lib/category-labels';
import { DEFAULT_POLICY_PACKS } from '@/lib/default-packs';
import type {
  CanonicalFactModel,
  EvaluationResult,
  EvaluationVerdict,
  PolicyPackV2,
  TriggeredRuleResult,
} from '@/lib/types';
import { DataSovereigntySummaryCard } from './DataSovereigntySummaryCard';
import { InfoTooltip } from './InfoTooltip';
import { useCountUp } from '../hooks/useCountUp';

export type AuditReportSectionMode =
  | 'all'
  | 'banner'
  | 'overview-extras'
  | 'audit-list';

type SeverityFilter = 'ALL' | 'BLOCKER' | 'WARNING';

interface AuditReportPanelProps {
  scenarioTitle: string;
  facts: CanonicalFactModel;
  result: EvaluationResult;
  activePacks?: PolicyPackV2[];
  lastEngineUsed?: string | null;
  parserWarnings?: string[];
  isDirty?: boolean;
  onRunAudit?: () => void;
  sectionMode?: AuditReportSectionMode;
  onNavigateToRemediation?: () => void;
}

const PACK_SHORT_CODES: Record<string, string> = {
  KR_PIPA_v2: 'KR_PIPA',
  EU_GDPR_v2: 'EU_GDPR',
  JP_APPI_v2: 'JP_APPI',
  CN_PIPL_v2: 'CN_PIPL',
  US_CLOUD_ACT_v2: 'CLOUD_ACT',
  US_CCPA_CPRA_v2: 'CCPA',
  KR_AI_BASIC_ACT_v2: 'KR_AI_ACT',
  EU_AI_ACT_v2: 'EU_AI_ACT',
};

function toShortPackCode(packId: string): string {
  if (PACK_SHORT_CODES[packId]) return PACK_SHORT_CODES[packId];
  return packId
    .replace(/_v\d+$/i, '')
    .replace(/^US_/, '')
    .replace(/_BASIC_ACT$/i, '_ACT')
    .toUpperCase();
}

function getRuleRowKey(rule: TriggeredRuleResult, idx: number): string {
  return `${rule.pack_id}::${rule.pack_version ?? ''}::${rule.rule_id}::${idx}`;
}

const STAMP_META: Record<
  EvaluationVerdict,
  {
    stampText: string;
    subText: string;
    borderClass: string;
    textClass: string;
    barClass: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  APPROVED: {
    stampText: 'APPROVED',
    subText: 'BORDER CLEARANCE PASSED',
    borderClass: 'border-emerald-400/60 text-emerald-300 bg-emerald-500/[0.07]',
    textClass: 'text-emerald-300',
    barClass: 'bg-emerald-400',
    icon: CheckCircle2,
  },
  DRIFT_DETECTED: {
    stampText: 'DRIFT DETECTED',
    subText: 'POLICY-INFRA MISMATCH',
    borderClass: 'border-amber-400/60 text-amber-300 bg-amber-500/[0.08]',
    textClass: 'text-amber-300',
    barClass: 'bg-amber-400',
    icon: FileWarning,
  },
  CONDITIONAL: {
    stampText: 'CONDITIONAL',
    subText: 'ADVISORY REVIEW NEEDED',
    borderClass: 'border-cyan-400/60 text-cyan-300 bg-cyan-500/[0.08]',
    textClass: 'text-cyan-300',
    barClass: 'bg-cyan-400',
    icon: AlertTriangle,
  },
  DENIED: {
    stampText: 'DENIED',
    subText: 'EGRESS BLOCKED',
    borderClass: 'border-rose-400/65 text-rose-300 bg-rose-500/[0.08]',
    textClass: 'text-rose-300',
    barClass: 'bg-rose-400',
    icon: AlertOctagon,
  },
};

function getPenaltyContext(
  packId: string,
  result: EvaluationResult,
  activePacks: PolicyPackV2[],
): string {
  const pack =
    activePacks.find((p) => p.pack_meta.id === packId) ??
    DEFAULT_POLICY_PACKS.find((p) => p.pack_meta.id === packId);
  if (pack) {
    return pack.pack_meta.penalty_summary;
  }
  const firstRisk = result.applied_country_risks[0];
  if (firstRisk) {
    return `${firstRisk.profile.framework_name}: ${firstRisk.profile.summary}`;
  }
  return '해당 관할권 개인정보 감독기구 시정명령 및 법정 과징금·과태료 리스크 검토 대상';
}

export function AuditReportPanel({
  scenarioTitle,
  facts,
  result,
  activePacks = DEFAULT_POLICY_PACKS,
  lastEngineUsed,
  parserWarnings = [],
  isDirty = false,
  onRunAudit,
  sectionMode = 'all',
  onNavigateToRemediation,
}: AuditReportPanelProps) {
  const [showRawFacts, setShowRawFacts] = useState(false);
  const [showStandbyPacks, setShowStandbyPacks] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL');
  const [packFilter, setPackFilter] = useState<string>('ALL');

  const sortedRules = useMemo(() => {
    return [...result.triggered_rules].sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === 'BLOCKER' ? -1 : 1;
      }
      if (a.has_drift !== b.has_drift) {
        return a.has_drift ? -1 : 1;
      }
      return a.layer - b.layer;
    });
  }, [result.triggered_rules]);

  const [expandedRuleKeys, setExpandedRuleKeys] = useState<
    Record<string, boolean>
  >(() => {
    const first = sortedRules[0];
    if (first && first.severity === 'BLOCKER') {
      return { [getRuleRowKey(first, 0)]: true };
    }
    return {};
  });

  useEffect(() => {
    const first = sortedRules[0];
    if (first && first.severity === 'BLOCKER') {
      setExpandedRuleKeys({ [getRuleRowKey(first, 0)]: true });
    } else {
      setExpandedRuleKeys({});
    }
    setSeverityFilter('ALL');
    setPackFilter('ALL');
  }, [result.evaluated_at, sortedRules]);

  const stamp = STAMP_META[result.verdict];
  const StampIcon = stamp.icon;

  const activeVendors = facts.transfers.detected_vendors.filter(
    (v) => (v.includes_pii ?? v.sends_pii) !== false,
  );

  const topImmediateActions = sortedRules.slice(0, 3);

  const totalEvaluatedRules =
    result.stats.total_evaluated_rules ?? result.triggered_rules.length;
  const passedRuleCount =
    result.stats.passed_rule_count ??
    Math.max(0, totalEvaluatedRules - result.triggered_rules.length);
  const passRatePercent =
    result.stats.pass_rate_percent ?? result.compliance_score ?? 100;

  const animKey = `${result.evaluated_at}-${passRatePercent}-${result.stats.blocker_count}-${result.stats.drift_count}`;
  const animatedBlockerCount = useCountUp(result.stats.blocker_count, animKey);
  const animatedDriftCount = useCountUp(result.stats.drift_count, animKey);
  const animatedWarningCount = useCountUp(result.stats.warning_count, animKey);
  const animatedPassedRules = useCountUp(passedRuleCount, animKey);
  const animatedPassRate = useCountUp(passRatePercent, animKey);

  const applicablePacks = result.applied_pack_versions.filter(
    (p) => p.applicable,
  );
  const standbyPacks = result.applied_pack_versions.filter(
    (p) => !p.applicable,
  );

  const blockerCount = sortedRules.filter(
    (r) => r.severity === 'BLOCKER',
  ).length;
  const warningCount = sortedRules.length - blockerCount;

  const packFilterOptions = useMemo(() => {
    const map = new Map<
      string,
      { packId: string; shortCode: string; lawName: string; count: number }
    >();
    for (const rule of sortedRules) {
      const existing = map.get(rule.pack_id);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(rule.pack_id, {
          packId: rule.pack_id,
          shortCode: toShortPackCode(rule.pack_id),
          lawName: rule.pack_name || rule.pack_id,
          count: 1,
        });
      }
    }
    return Array.from(map.values());
  }, [sortedRules]);

  const filteredRulesWithIndex = useMemo(() => {
    return sortedRules
      .map((rule, idx) => ({ rule, idx, key: getRuleRowKey(rule, idx) }))
      .filter(({ rule }) => {
        if (severityFilter === 'BLOCKER' && rule.severity !== 'BLOCKER') {
          return false;
        }
        if (severityFilter === 'WARNING' && rule.severity === 'BLOCKER') {
          return false;
        }
        if (packFilter !== 'ALL' && rule.pack_id !== packFilter) {
          return false;
        }
        return true;
      });
  }, [sortedRules, severityFilter, packFilter]);

  const allFilteredExpanded =
    filteredRulesWithIndex.length > 0 &&
    filteredRulesWithIndex.every(({ key }) => Boolean(expandedRuleKeys[key]));

  const handleToggleRule = (key: string) => {
    setExpandedRuleKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleToggleAllFiltered = () => {
    if (allFilteredExpanded) {
      setExpandedRuleKeys((prev) => {
        const next = { ...prev };
        for (const { key } of filteredRulesWithIndex) {
          delete next[key];
        }
        return next;
      });
    } else {
      setExpandedRuleKeys((prev) => {
        const next = { ...prev };
        for (const { key } of filteredRulesWithIndex) {
          next[key] = true;
        }
        return next;
      });
    }
  };

  const showBanner = sectionMode === 'all' || sectionMode === 'banner';
  const showOverviewExtras =
    sectionMode === 'all' || sectionMode === 'overview-extras';
  const showAuditList = sectionMode === 'all' || sectionMode === 'audit-list';

  return (
    <div className="space-y-6 print-report-surface">
      {/* Print-Only Formal Compliance Evidence Header */}
      {showBanner && (
        <div className="print-only border-b-2 border-slate-900 pb-3 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-mono uppercase tracking-wider">
                Border Checker v2.0 · Data Sovereignty Compliance Evidence
              </div>
              <h1 className="text-xl font-bold mt-1">
                국외 이전 및 개인정보 처리방침 정합성 감사 증빙 리포트
              </h1>
            </div>
            <div className="text-right text-xs font-mono">
              <div>판정: {result.verdict}</div>
              <div>
                충족률: {passedRuleCount} / {totalEvaluatedRules} (
                {passRatePercent}%)
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs border border-slate-300 p-2.5">
            <div>
              <strong>진단 대상:</strong> {scenarioTitle}
            </div>
            <div>
              <strong>평가 일시:</strong>{' '}
              {new Date(result.evaluated_at).toLocaleString('ko-KR')}
            </div>
            <div>
              <strong>관할권:</strong> 사업자 {facts.workspace.business_country}{' '}
              · 정보주체 {facts.workspace.data_subject_countries.join(', ')}
            </div>
            <div>
              <strong>PII 외부 벤더:</strong>{' '}
              {activeVendors.length > 0
                ? activeVendors
                    .map(
                      (v) =>
                        `${v.name}(${v.data_residency_country || v.country})`,
                    )
                    .join(', ')
                : '없음'}
            </div>
          </div>
        </div>
      )}

      {showBanner && isDirty && (
        <div
          role="status"
          className="no-print rounded-xl border border-amber-500/35 bg-amber-500/[0.07] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <span className="font-semibold text-amber-300">
                입력 변경됨 · 재심사 필요
              </span>
              <span className="text-amber-100/80 ml-2">
                입력값이 수정되었으며 아래 리포트는 직전 심사 기준 결과입니다.
              </span>
            </div>
          </div>
          {onRunAudit && (
            <button
              type="button"
              onClick={onRunAudit}
              className="px-3 py-1.5 rounded-lg bg-[#FAFAFA] hover:bg-white text-[#050507] text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              지금 재심사 실행
            </button>
          )}
        </div>
      )}

      {showBanner && parserWarnings.length > 0 && (
        <div className="no-print rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-4 py-2.5 text-xs text-amber-200">
          {parserWarnings.join(' · ')}
        </div>
      )}

      {/* Executive Banner: Passport Stamp Header + Pass Rate + Compact Law Pack Pills */}
      {showBanner && (
        <section className="rounded-xl bg-[#0C0C0F] border border-white/[0.07] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            {/* Left: Passport Stamp + Verdict Headline */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-5 max-w-3xl">
              <div
                className={`shrink-0 px-4 py-3 rounded-lg border-2 border-dashed -rotate-2 select-none ${stamp.borderClass}`}
                aria-label={`출입국 심사 도장: ${stamp.stampText}`}
              >
                <div className="border border-current/35 rounded px-3 py-1.5 text-center">
                  <div className="text-[9px] font-mono tracking-widest opacity-80">
                    BORDER CHECKER · {facts.workspace.business_country}
                  </div>
                  <div className="font-mono text-base font-bold tracking-wider mt-0.5 flex items-center justify-center gap-1.5 whitespace-nowrap">
                    <StampIcon className="w-4 h-4 shrink-0" />
                    <span>{stamp.stampText}</span>
                  </div>
                  <div className="text-[9px] font-mono tracking-wider opacity-85 mt-0.5">
                    {stamp.subText}
                  </div>
                </div>
              </div>

              <div className="space-y-2 min-w-0">
                <h2 className="font-display text-xl sm:text-2xl font-semibold text-zinc-100 leading-snug">
                  {result.summary_headline}
                </h2>
                <p className="text-sm text-zinc-300 leading-relaxed">
                  {result.summary_detail}
                </p>
                <div className="pt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                  <span>진단 대상: {scenarioTitle}</span>
                  <span aria-hidden="true">·</span>
                  <span>사업자: {facts.workspace.business_country}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    정보주체: {facts.workspace.data_subject_countries.join(', ')}
                  </span>
                  {lastEngineUsed && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">파서: {lastEngineUsed}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Hairline-separated Key Metrics + Pass Rate Progress Bar */}
            <div className="lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l border-white/[0.06] pt-4 lg:pt-0 lg:pl-6 space-y-4">
              <div className="grid grid-cols-3 divide-x divide-white/[0.06] text-center">
                <div className="px-2">
                  <div className="text-[10px] font-mono text-zinc-400">
                    BLOCKER
                  </div>
                  <div className="font-mono text-base font-bold text-rose-300 tabular-nums mt-0.5">
                    {animatedBlockerCount}건
                  </div>
                </div>
                <div className="px-2">
                  <div className="text-[10px] font-mono text-zinc-400 inline-flex items-center justify-center gap-0.5">
                    <span>DRIFT</span>
                    <InfoTooltip term="drift" align="right" />
                  </div>
                  <div className="font-mono text-base font-bold text-cyan-300 tabular-nums mt-0.5">
                    {animatedDriftCount}건
                  </div>
                </div>
                <div className="px-2">
                  <div className="text-[10px] font-mono text-zinc-400">
                    WARNING
                  </div>
                  <div className="font-mono text-base font-bold text-amber-300 tabular-nums mt-0.5">
                    {animatedWarningCount}건
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-white/[0.06] space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-zinc-400 font-medium">
                    점검 항목 충족률
                  </span>
                  <span className="font-mono font-semibold text-zinc-100 tabular-nums">
                    {animatedPassedRules} / {totalEvaluatedRules} (
                    {animatedPassRate}%)
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={passRatePercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="점검 항목 충족률"
                  className="h-1.5 w-full rounded-full bg-white/[0.07] overflow-hidden"
                >
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${stamp.barClass}`}
                    style={{
                      width: `${Math.max(0, Math.min(100, animatedPassRate))}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Slim Compact Inline Law Pack Pills with Hover Tooltips */}
          <div className="pt-4 border-t border-white/[0.06] space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-zinc-400 mr-1 whitespace-nowrap">
                적용 법률 팩 ({applicablePacks.length}종)
              </span>
              {applicablePacks.length === 0 ? (
                <span className="text-xs text-zinc-500">
                  현재 입력 조건에 매칭된 법률 팩이 없습니다.
                </span>
              ) : (
                applicablePacks.map((pack, idx) => {
                  const matchedActivePack =
                    activePacks.find(
                      (p) =>
                        p.pack_meta.id === pack.pack_id &&
                        p.pack_meta.version === pack.version,
                    ) ??
                    activePacks.find((p) => p.pack_meta.id === pack.pack_id) ??
                    DEFAULT_POLICY_PACKS.find(
                      (p) => p.pack_meta.id === pack.pack_id,
                    );
                  const lawName =
                    pack.law_name ||
                    matchedActivePack?.pack_meta.law_name ||
                    pack.pack_id;
                  const shortCode = toShortPackCode(pack.pack_id);
                  const rawVersion =
                    pack.version || matchedActivePack?.pack_meta.version || '';
                  const versionTag = rawVersion
                    ? `v${rawVersion.replace(/^v/i, '')}`
                    : '';
                  const isCustomPlugin = !DEFAULT_POLICY_PACKS.some(
                    (builtIn) =>
                      builtIn.pack_meta.id === pack.pack_id &&
                      builtIn.pack_meta.version === rawVersion &&
                      builtIn.pack_meta.law_name === lawName,
                  );

                  const isClean = pack.triggered_rule_count === 0;
                  const pillClass = isClean
                    ? 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-300 hover:border-emerald-400/50'
                    : 'border-amber-500/30 bg-amber-500/[0.08] text-amber-300 hover:border-amber-400/55';
                  const tooltipText = `L${pack.layer} · ${lawName}${versionTag ? ` (${versionTag})` : ''}`;

                  return (
                    <div
                      key={`${pack.pack_id}-${rawVersion}-${idx}`}
                      className="relative group inline-flex"
                    >
                      <span
                        tabIndex={0}
                        title={tooltipText}
                        aria-label={`${tooltipText} · ${isClean ? 'PASS' : `${pack.triggered_rule_count}건`}`}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-[11px] font-mono tabular-nums whitespace-nowrap cursor-default transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 ${pillClass}`}
                      >
                        <span>{shortCode}</span>
                        <span className="text-zinc-500" aria-hidden="true">
                          ·
                        </span>
                        <span>
                          {isClean ? 'PASS' : `${pack.triggered_rule_count}건`}
                        </span>
                        {isCustomPlugin && (
                          <span className="text-[10px] text-violet-300 font-sans font-semibold">
                            플러그인
                          </span>
                        )}
                      </span>

                      <div
                        role="tooltip"
                        className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute left-0 bottom-full mb-2 z-30 w-max max-w-xs rounded-lg bg-[#141419] border border-white/[0.12] px-3 py-2 shadow-[0_12px_32px_rgba(0,0,0,0.75)] text-[11px] text-zinc-200"
                      >
                        <div className="font-semibold text-zinc-100">
                          {lawName}
                        </div>
                        <div className="font-mono text-[10px] text-zinc-400 mt-0.5 tabular-nums">
                          Layer {pack.layer} · {pack.pack_id}
                          {versionTag ? ` ${versionTag}` : ''} ·{' '}
                          {isClean
                            ? 'PASS'
                            : `${pack.triggered_rule_count}건 위반/권고`}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {standbyPacks.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowStandbyPacks((prev) => !prev)}
                  className="no-print inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md border border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14] text-[11px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors whitespace-nowrap"
                >
                  <span>
                    {showStandbyPacks
                      ? `미적용 ${standbyPacks.length}종 접기`
                      : `+ 미적용 ${standbyPacks.length}종`}
                  </span>
                  {showStandbyPacks ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              )}
            </div>

            {showStandbyPacks && standbyPacks.length > 0 && (
              <div className="no-print flex flex-wrap items-center gap-1.5 pt-1">
                {standbyPacks.map((pack, idx) => {
                  const lawName = pack.law_name || pack.pack_id;
                  const shortCode = toShortPackCode(pack.pack_id);
                  const rawVersion = pack.version || '';
                  const versionTag = rawVersion
                    ? `v${rawVersion.replace(/^v/i, '')}`
                    : '';
                  return (
                    <span
                      key={`standby-${pack.pack_id}-${rawVersion}-${idx}`}
                      title={`Layer ${pack.layer} · ${lawName}${versionTag ? ` (${versionTag})` : ''}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border border-white/[0.06] bg-white/[0.02] text-[11px] font-mono text-zinc-500 whitespace-nowrap"
                    >
                      <span>{shortCode}</span>
                      <span>·</span>
                      <span>미해당</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Overview Extras: Data Sovereignty KPI Bento Card + Top 3 Action Items */}
      {showOverviewExtras && (
        <>
          <DataSovereigntySummaryCard
            facts={facts}
            result={result}
            activePacks={activePacks}
          />

          {topImmediateActions.length > 0 && (
            <section
              aria-label="실행 우선순위 패치 체크리스트"
              className="rounded-xl bg-[#0C0C0F] border border-white/[0.07] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] p-5 space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-cyan-400 shrink-0" />
                  <h3 className="font-display text-sm font-semibold text-zinc-100">
                    지금 당장 실행할 패치 체크리스트 (TOP{' '}
                    {topImmediateActions.length})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (onNavigateToRemediation) {
                      onNavigateToRemediation();
                    } else {
                      document
                        .getElementById('dual-remediation-kit')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }}
                  className="no-print inline-flex items-center gap-1 text-xs font-medium text-cyan-300 hover:text-cyan-200 transition-colors whitespace-nowrap self-start sm:self-auto"
                >
                  <span>자동 치유 키트로 이동</span>
                  <ArrowDownRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-0 md:divide-x divide-white/[0.06]">
                {topImmediateActions.map((rule, idx) => {
                  const isBlocker = rule.severity === 'BLOCKER';
                  const hasInfraPatch = Boolean(
                    rule.remediation.infra_patch_hint?.trim(),
                  );
                  return (
                    <div
                      key={`${rule.pack_id}-${rule.rule_id}-${idx}`}
                      className="md:px-5 md:first:pl-0 md:last:pr-0 flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                          <span className="text-cyan-300 font-semibold">
                            STEP #{idx + 1} ·{' '}
                            {hasInfraPatch
                              ? '인프라/보안 패치'
                              : '법무/문서 패치'}
                          </span>
                          <span
                            className={
                              isBlocker
                                ? 'text-rose-300 font-semibold'
                                : 'text-amber-300 font-semibold'
                            }
                          >
                            {rule.severity}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-zinc-100 leading-relaxed">
                          {rule.remediation.infra_patch_hint ||
                            rule.remediation.legal_template}
                        </p>
                      </div>
                      <div className="pt-2 border-t border-white/[0.06] font-mono text-[10px] text-zinc-400 truncate">
                        근거: {rule.pack_name} · {rule.article_citation}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {/* 3-Tier Traffic Light Collapsible Accordion Report with Filter Bar */}
      {showAuditList && (
        <section className="rounded-xl bg-[#0C0C0F] border border-white/[0.07] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] p-6 space-y-4">
          {/* Header Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.06]">
            <div>
              <h3 className="font-display text-sm font-semibold text-zinc-100">
                비전문가용 3단 신호등 점검 리포트 ({result.triggered_rules.length}
                건)
              </h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                각 항목을 클릭해 상세 해설, 법 조문 근거 및 예상 규제 리스크를 확인하세요.
              </p>
            </div>
            <div className="no-print flex items-center gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-xs font-medium text-zinc-100 transition-colors whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>감사 증빙 리포트 PDF 출력</span>
              </button>
              <button
                type="button"
                onClick={() => setShowRawFacts((prev) => !prev)}
                className="text-xs text-zinc-400 hover:text-zinc-100 transition-colors whitespace-nowrap"
              >
                {showRawFacts ? '표준 팩트 JSON 숨기기' : '표준 팩트 JSON 보기'}
              </button>
            </div>
          </div>

          {sortedRules.length === 0 ? (
            <div className="py-4 flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <div className="text-sm font-medium text-emerald-200">
                  모든 적용 계층(Layer 1~4) 정합성 기준을 통과했습니다.
                </div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  처리방침 고지 항목과 코드·인프라 설정 간 불일치 또는 누락이
                  탐지되지 않았습니다.
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Sleek Filter Bar: Severity Pills + Law-Pack Filter Chips */}
              <div className="no-print flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3 border-b border-white/[0.06]">
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Severity Segmented Filter */}
                  <div
                    role="group"
                    aria-label="심각도 필터"
                    className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#08080A] border border-white/[0.07]"
                  >
                    <button
                      type="button"
                      onClick={() => setSeverityFilter('ALL')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap tabular-nums ${
                        severityFilter === 'ALL'
                          ? 'bg-[#FAFAFA] text-[#050507] font-semibold'
                          : 'text-zinc-400 hover:text-zinc-100'
                      }`}
                    >
                      All ({sortedRules.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSeverityFilter('BLOCKER')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap tabular-nums ${
                        severityFilter === 'BLOCKER'
                          ? 'bg-[#FAFAFA] text-[#050507] font-semibold'
                          : 'text-zinc-400 hover:text-zinc-100'
                      }`}
                    >
                      Blocker ({blockerCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSeverityFilter('WARNING')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap tabular-nums ${
                        severityFilter === 'WARNING'
                          ? 'bg-[#FAFAFA] text-[#050507] font-semibold'
                          : 'text-zinc-400 hover:text-zinc-100'
                      }`}
                    >
                      Warning ({warningCount})
                    </button>
                  </div>

                  {/* Law-Pack Filter Chips */}
                  {packFilterOptions.length > 1 && (
                    <div
                      role="group"
                      aria-label="법령 팩 필터"
                      className="flex flex-wrap items-center gap-1.5"
                    >
                      <button
                        type="button"
                        onClick={() => setPackFilter('ALL')}
                        className={`px-2.5 py-1 rounded-full border text-[11px] font-mono transition-colors whitespace-nowrap ${
                          packFilter === 'ALL'
                            ? 'border-[#38BDF8] bg-[#141419] text-zinc-100'
                            : 'border-white/[0.07] bg-[#08080A] text-zinc-400 hover:border-white/[0.15] hover:text-zinc-200'
                        }`}
                      >
                        전체 법령
                      </button>
                      {packFilterOptions.map((opt) => {
                        const active = packFilter === opt.packId;
                        return (
                          <button
                            key={opt.packId}
                            type="button"
                            title={opt.lawName}
                            onClick={() =>
                              setPackFilter((prev) =>
                                prev === opt.packId ? 'ALL' : opt.packId,
                              )
                            }
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-mono tabular-nums transition-colors whitespace-nowrap ${
                              active
                                ? 'border-[#38BDF8] bg-[#141419] text-zinc-100'
                                : 'border-white/[0.07] bg-[#08080A] text-zinc-400 hover:border-white/[0.15] hover:text-zinc-200'
                            }`}
                          >
                            <span>{opt.shortCode}</span>
                            <span className="text-zinc-500">·</span>
                            <span>{opt.count}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {filteredRulesWithIndex.length > 0 && (
                  <button
                    type="button"
                    onClick={handleToggleAllFiltered}
                    className="text-[11px] text-zinc-400 hover:text-zinc-100 transition-colors whitespace-nowrap self-start lg:self-auto"
                  >
                    {allFilteredExpanded ? '모두 접기' : '모두 펼치기'}
                  </button>
                )}
              </div>

              {/* Filtered Empty State */}
              {filteredRulesWithIndex.length === 0 ? (
                <div className="py-6 text-center space-y-2">
                  <div className="text-xs text-zinc-400">
                    선택한 필터 조건에 해당하는 점검 항목이 없습니다.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSeverityFilter('ALL');
                      setPackFilter('ALL');
                    }}
                    className="text-xs font-medium text-cyan-300 hover:text-cyan-200 transition-colors"
                  >
                    필터 초기화
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {filteredRulesWithIndex.map(({ rule, key }) => {
                    const isBlocker = rule.severity === 'BLOCKER';
                    const isExpanded = Boolean(expandedRuleKeys[key]);
                    const penaltyText = getPenaltyContext(
                      rule.pack_id,
                      result,
                      activePacks,
                    );
                    const appliedMeta =
                      result.applied_pack_versions.find(
                        (p) =>
                          p.pack_id === rule.pack_id &&
                          (!rule.pack_version ||
                            p.version === rule.pack_version),
                      ) ??
                      result.applied_pack_versions.find(
                        (p) => p.pack_id === rule.pack_id,
                      );
                    const activeMeta =
                      activePacks.find(
                        (p) =>
                          p.pack_meta.id === rule.pack_id &&
                          (!rule.pack_version ||
                            p.pack_meta.version === rule.pack_version),
                      ) ??
                      activePacks.find(
                        (p) => p.pack_meta.id === rule.pack_id,
                      ) ??
                      DEFAULT_POLICY_PACKS.find(
                        (p) => p.pack_meta.id === rule.pack_id,
                      );
                    const lawName =
                      rule.pack_name ||
                      appliedMeta?.law_name ||
                      activeMeta?.pack_meta.law_name ||
                      rule.pack_id;
                    const rawVersion =
                      rule.pack_version ||
                      appliedMeta?.version ||
                      activeMeta?.pack_meta.version ||
                      '';
                    const versionTag = rawVersion
                      ? `v${rawVersion.replace(/^v/i, '')}`
                      : '';

                    return (
                      <article key={key} className="print-avoid-break">
                        {/* Compact Single-Line Accordion Trigger Row */}
                        <button
                          type="button"
                          onClick={() => handleToggleRule(key)}
                          aria-expanded={isExpanded}
                          className="w-full py-3 px-2 -mx-2 rounded-lg hover:bg-white/[0.03] transition-colors flex items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]/60"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {/* Severity Dot/Pill */}
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border font-mono text-[10px] font-semibold whitespace-nowrap shrink-0 ${
                                isBlocker
                                  ? 'border-rose-500/35 bg-rose-500/[0.08] text-rose-300'
                                  : 'border-amber-500/35 bg-amber-500/[0.08] text-amber-300'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  isBlocker ? 'bg-rose-400' : 'bg-amber-400'
                                }`}
                                aria-hidden="true"
                              />
                              <span>{isBlocker ? 'BLOCKER' : 'WARNING'}</span>
                            </span>

                            {/* Single-Line Rule Title */}
                            <span className="text-xs sm:text-sm font-medium text-zinc-100 truncate min-w-0">
                              {rule.plain_title}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {rule.has_drift && (
                              <span className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/[0.08] font-mono text-[10px] font-semibold text-cyan-300 whitespace-nowrap">
                                DRIFT
                              </span>
                            )}
                            {/* Korean Rule Category Badge */}
                            <span
                              title={rule.category}
                              className="hidden md:inline-flex items-center px-2 py-0.5 rounded border border-white/[0.08] bg-[#0C0C0F] text-[11px] font-medium text-zinc-300 whitespace-nowrap"
                            >
                              {getRuleCategoryLabel(rule.category)}
                            </span>
                            {/* Law Code Pill */}
                            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded border border-white/[0.08] bg-[#08080A] font-mono text-[11px] text-zinc-300 whitespace-nowrap">
                              {rule.pack_id}
                            </span>
                            <ChevronDown
                              className={`w-4 h-4 transition-transform duration-150 shrink-0 ${
                                isExpanded
                                  ? 'rotate-180 text-zinc-200'
                                  : 'text-zinc-500'
                              }`}
                            />
                          </div>
                        </button>

                        {/* Expanded Detail Body (also printed in print mode) */}
                        <div
                          className={
                            isExpanded
                              ? 'pb-4 pt-1 pl-1 animate-panel-enter'
                              : 'hidden print:block print:pb-4 print:pt-1'
                          }
                        >
                          <div className="rounded-lg border border-white/[0.06] bg-[#08080A] p-4 space-y-3">
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400 md:hidden">
                              <span className="font-mono">{rule.pack_id}</span>
                              <span>·</span>
                              <span title={rule.category}>
                                {getRuleCategoryLabel(rule.category)}
                              </span>
                            </div>

                            <p className="text-xs text-zinc-300 leading-relaxed">
                              {rule.plain_explanation}
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-white/[0.06] text-xs">
                              <div>
                                <div className="text-[11px] font-medium text-cyan-300 mb-1">
                                  ② 정확한 법 조문 근거 · 계층
                                </div>
                                <div className="font-mono text-zinc-200 leading-relaxed">
                                  Layer {rule.layer} · {lawName}
                                  {versionTag ? ` ${versionTag}` : ''} (
                                  {rule.pack_id}) · {rule.article_citation}
                                </div>
                              </div>
                              <div>
                                <div className="text-[11px] font-medium text-amber-300 mb-1">
                                  ③ 예상 규제 리스크 (참고 안내)
                                </div>
                                <div className="text-zinc-300 leading-relaxed">
                                  {penaltyText}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {showRawFacts && (
            <div className="no-print pt-4 border-t border-white/[0.06]">
              <pre className="rounded-lg bg-[#08080A] border border-white/[0.07] p-4 text-[11px] font-mono text-zinc-300 overflow-x-auto leading-relaxed">
                {JSON.stringify(facts, null, 2)}
              </pre>
            </div>
          )}

          {/* Legal Positioning Guardrail Banner */}
          <div className="pt-4 border-t border-white/[0.06] flex items-start gap-2.5 text-xs text-zinc-400 leading-relaxed">
            <Scale className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
            <p>
              본 결과는 개인정보 처리방침 문서와 실제 코드·인프라 설정 간의
              정합성 불일치(Config &amp; Policy Drift) 및 법정 필수 고지 항목
              누락을 기술적으로 탐지한 참고 리포트이며, 최종 법률 자문을
              대체하지 않습니다.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
