import React, { useState } from 'react';
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
import { DEFAULT_POLICY_PACKS } from '@/lib/default-packs';
import type {
  CanonicalFactModel,
  EvaluationResult,
  EvaluationVerdict,
  PolicyPackV2,
} from '@/lib/types';
import { DataSovereigntySummaryCard } from './DataSovereigntySummaryCard';
import { InfoTooltip } from './InfoTooltip';

interface AuditReportPanelProps {
  scenarioTitle: string;
  facts: CanonicalFactModel;
  result: EvaluationResult;
  activePacks?: PolicyPackV2[];
  lastEngineUsed?: string | null;
  parserWarnings?: string[];
  isDirty?: boolean;
  onRunAudit?: () => void;
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
    borderClass: 'border-emerald-400/75 text-emerald-300 bg-emerald-950/30',
    textClass: 'text-emerald-300',
    barClass: 'bg-emerald-400',
    icon: CheckCircle2,
  },
  DRIFT_DETECTED: {
    stampText: 'DRIFT DETECTED',
    subText: 'POLICY-INFRA MISMATCH',
    borderClass: 'border-amber-400/75 text-amber-300 bg-amber-950/30',
    textClass: 'text-amber-300',
    barClass: 'bg-amber-400',
    icon: FileWarning,
  },
  CONDITIONAL: {
    stampText: 'CONDITIONAL',
    subText: 'ADVISORY REVIEW NEEDED',
    borderClass: 'border-sky-400/75 text-sky-300 bg-sky-950/30',
    textClass: 'text-sky-300',
    barClass: 'bg-sky-400',
    icon: AlertTriangle,
  },
  DENIED: {
    stampText: 'DENIED',
    subText: 'EGRESS BLOCKED',
    borderClass: 'border-rose-400/80 text-rose-300 bg-rose-950/35',
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
}: AuditReportPanelProps) {
  const [showRawFacts, setShowRawFacts] = useState(false);
  const [showStandbyPacks, setShowStandbyPacks] = useState(false);

  const stamp = STAMP_META[result.verdict];
  const StampIcon = stamp.icon;

  const activeVendors = facts.transfers.detected_vendors.filter(
    (v) => (v.includes_pii ?? v.sends_pii) !== false,
  );

  const topImmediateActions = [...result.triggered_rules]
    .sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === 'BLOCKER' ? -1 : 1;
      }
      if (a.has_drift !== b.has_drift) {
        return a.has_drift ? -1 : 1;
      }
      return a.layer - b.layer;
    })
    .slice(0, 3);

  const totalEvaluatedRules =
    result.stats.total_evaluated_rules ?? result.triggered_rules.length;
  const passedRuleCount =
    result.stats.passed_rule_count ??
    Math.max(0, totalEvaluatedRules - result.triggered_rules.length);
  const passRatePercent =
    result.stats.pass_rate_percent ?? result.compliance_score ?? 100;

  const applicablePacks = result.applied_pack_versions.filter(
    (p) => p.applicable,
  );
  const standbyPacks = result.applied_pack_versions.filter(
    (p) => !p.applicable,
  );

  return (
    <div className="space-y-6 print-report-surface">
      {/* Print-Only Formal Compliance Evidence Header */}
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
              충족률: {passedRuleCount} / {totalEvaluatedRules} ({passRatePercent}%)
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
            <strong>관할권:</strong> 사업자 {facts.workspace.business_country} · 정보주체{' '}
            {facts.workspace.data_subject_countries.join(', ')}
          </div>
          <div>
            <strong>PII 외부 벤더:</strong>{' '}
            {activeVendors.length > 0
              ? activeVendors
                  .map((v) => `${v.name}(${v.data_residency_country || v.country})`)
                  .join(', ')
              : '없음'}
          </div>
        </div>
      </div>

      {isDirty && (
        <div
          role="status"
          className="no-print rounded-xl border border-amber-500/60 bg-amber-950/35 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
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
              className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              지금 재심사 실행
            </button>
          )}
        </div>
      )}

      {parserWarnings.length > 0 && (
        <div className="no-print rounded-lg border border-amber-800/60 bg-amber-950/25 px-4 py-2.5 text-xs text-amber-200">
          {parserWarnings.join(' · ')}
        </div>
      )}

      {/* Passport Stamp Header + Pass Rate Progress Bar + Auto-Loaded Pack Badges */}
      <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Left: Passport Stamp + Verdict Headline */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-5 max-w-3xl">
            {/* Passport Checkpoint Stamp */}
            <div
              className={`shrink-0 px-4 py-3 rounded-lg border-2 border-dashed -rotate-3 select-none ${stamp.borderClass}`}
              aria-label={`출입국 심사 도장: ${stamp.stampText}`}
            >
              <div className="border border-current/40 rounded px-3 py-1.5 text-center">
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
              <h2 className="font-display text-xl sm:text-2xl font-semibold text-slate-100 leading-snug">
                {result.summary_headline}
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                {result.summary_detail}
              </p>
              <div className="pt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                <span>진단 대상: {scenarioTitle}</span>
                <span aria-hidden="true">·</span>
                <span>사업자: {facts.workspace.business_country}</span>
                <span aria-hidden="true">·</span>
                <span>정보주체: {facts.workspace.data_subject_countries.join(', ')}</span>
                {lastEngineUsed && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">파서: {lastEngineUsed}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right: 4 Key Metrics (BLOCKER / DRIFT / WARNING + Pass Rate Progress Bar) */}
          <div className="lg:w-72 shrink-0 lg:border-l lg:border-slate-800 lg:pl-6 space-y-3.5">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-slate-800 bg-[#060913] px-2 py-2">
                <div className="text-[10px] font-mono text-slate-400">BLOCKER</div>
                <div className="font-mono text-base font-bold text-rose-300 tabular-nums mt-0.5">
                  {result.stats.blocker_count}건
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#060913] px-2 py-2">
                <div className="text-[10px] font-mono text-slate-400 inline-flex items-center justify-center gap-0.5">
                  <span>DRIFT</span>
                  <InfoTooltip term="drift" align="right" />
                </div>
                <div className="font-mono text-base font-bold text-sky-300 tabular-nums mt-0.5">
                  {result.stats.drift_count}건
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#060913] px-2 py-2">
                <div className="text-[10px] font-mono text-slate-400">WARNING</div>
                <div className="font-mono text-base font-bold text-amber-300 tabular-nums mt-0.5">
                  {result.stats.warning_count}건
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-[#060913] p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-400 font-medium">점검 항목 충족률</span>
                <span className="font-mono font-semibold text-slate-100 tabular-nums">
                  {passedRuleCount} / {totalEvaluatedRules} ({passRatePercent}%)
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={passRatePercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="점검 항목 충족률"
                className="h-2 w-full rounded-full bg-slate-800 overflow-hidden"
              >
                <div
                  className={`h-full rounded-full transition-all duration-500 ${stamp.barClass}`}
                  style={{ width: `${Math.max(0, Math.min(100, passRatePercent))}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Auto-Loaded Applicable Policy Packs Summary */}
        <div className="pt-4 border-t border-slate-800 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 mr-1">
              자동 적용된 관할 법률 팩 ({applicablePacks.length}종):
            </span>
            {applicablePacks.length === 0 ? (
              <span className="text-xs text-slate-500">
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
                  DEFAULT_POLICY_PACKS.find((p) => p.pack_meta.id === pack.pack_id);
                const lawName =
                  pack.law_name ||
                  matchedActivePack?.pack_meta.law_name ||
                  pack.pack_id;
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

                const pillClass =
                  pack.triggered_rule_count === 0
                    ? 'border-emerald-800/60 bg-emerald-950/30 text-emerald-300'
                    : 'border-amber-700/60 bg-amber-950/30 text-amber-300';

                return (
                  <span
                    key={`${pack.pack_id}-${rawVersion}-${idx}`}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-mono tabular-nums ${pillClass}`}
                  >
                    <span>L{pack.layer}</span>
                    <span>{lawName}</span>
                    {versionTag && <span>{versionTag}</span>}
                    {isCustomPlugin && (
                      <span className="px-1.5 py-0.2 rounded bg-violet-500/20 border border-violet-400/40 text-violet-200 text-[10px] font-sans font-semibold">
                        플러그인
                      </span>
                    )}
                    <span>
                      {pack.triggered_rule_count === 0
                        ? '· PASS'
                        : `· ${pack.triggered_rule_count}건`}
                    </span>
                  </span>
                );
              })
            )}

            {standbyPacks.length > 0 && (
              <button
                type="button"
                onClick={() => setShowStandbyPacks((prev) => !prev)}
                className="no-print inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-800 bg-[#060913] hover:border-slate-700 text-[11px] font-mono text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap"
              >
                <span>
                  {showStandbyPacks
                    ? `미적용 ${standbyPacks.length}개 팩 접기`
                    : `+ 미적용 ${standbyPacks.length}개 팩 보기`}
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
            <div className="no-print flex flex-wrap items-center gap-2 pt-1">
              {standbyPacks.map((pack, idx) => {
                const lawName = pack.law_name || pack.pack_id;
                const rawVersion = pack.version || '';
                const versionTag = rawVersion
                  ? `v${rawVersion.replace(/^v/i, '')}`
                  : '';
                return (
                  <span
                    key={`standby-${pack.pack_id}-${rawVersion}-${idx}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-800 bg-[#060913] text-[11px] font-mono text-slate-500"
                  >
                    <span>L{pack.layer}</span>
                    <span>{lawName}</span>
                    {versionTag && <span>{versionTag}</span>}
                    <span>· 미해당</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Data Sovereignty Summary Card based on Pass Rate */}
      <DataSovereigntySummaryCard facts={facts} result={result} />

      {/* Top 3 Immediate Execution Checklist */}
      {topImmediateActions.length > 0 && (
        <section
          aria-label="실행 우선순위 패치 체크리스트"
          className="rounded-xl border border-sky-800/60 bg-[#0B1120] p-5 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-sky-400 shrink-0" />
              <h3 className="font-display text-sm font-semibold text-slate-100">
                지금 당장 실행할 패치 체크리스트 (TOP {topImmediateActions.length})
              </h3>
            </div>
            <button
              type="button"
              onClick={() => {
                document
                  .getElementById('dual-remediation-kit')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="no-print inline-flex items-center gap-1 text-xs font-medium text-sky-300 hover:text-sky-200 transition-colors whitespace-nowrap self-start sm:self-auto"
            >
              <span>자동 치유 키트로 이동</span>
              <ArrowDownRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {topImmediateActions.map((rule, idx) => {
              const isBlocker = rule.severity === 'BLOCKER';
              const hasInfraPatch = Boolean(rule.remediation.infra_patch_hint?.trim());
              return (
                <div
                  key={`${rule.pack_id}-${rule.rule_id}-${idx}`}
                  className="rounded-lg border border-slate-800 bg-[#060913] p-3.5 flex flex-col justify-between gap-2"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                      <span className="text-sky-300 font-semibold">
                        STEP #{idx + 1} · {hasInfraPatch ? '인프라/보안 패치' : '법무/문서 패치'}
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
                    <p className="text-xs font-medium text-slate-100 leading-relaxed">
                      {rule.remediation.infra_patch_hint || rule.remediation.legal_template}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-slate-800/70 font-mono text-[10px] text-slate-400 truncate">
                    근거: {rule.pack_name} · {rule.article_citation}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 3-Tier Traffic Light Rule Cards */}
      <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-sm font-semibold text-slate-100">
            비전문가용 3단 신호등 점검 리포트 ({result.triggered_rules.length}건)
          </h3>
          <div className="no-print flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-100 transition-colors whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>감사 증빙 리포트 PDF 출력</span>
            </button>
            <button
              type="button"
              onClick={() => setShowRawFacts((prev) => !prev)}
              className="text-xs text-slate-400 hover:text-slate-100 transition-colors whitespace-nowrap"
            >
              {showRawFacts ? '표준 팩트 JSON 숨기기' : '표준 팩트 JSON 보기'}
            </button>
          </div>
        </div>

        {result.triggered_rules.length === 0 ? (
          <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-5 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <div className="text-sm font-medium text-emerald-200">
                모든 적용 계층(Layer 1~4) 정합성 기준을 통과했습니다.
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                처리방침 고지 항목과 코드·인프라 설정 간 불일치 또는 누락이 탐지되지 않았습니다.
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {result.triggered_rules.map((rule, idx) => {
              const isBlocker = rule.severity === 'BLOCKER';
              const penaltyText = getPenaltyContext(rule.pack_id, result, activePacks);
              const appliedMeta =
                result.applied_pack_versions.find(
                  (p) =>
                    p.pack_id === rule.pack_id &&
                    (!rule.pack_version || p.version === rule.pack_version),
                ) ??
                result.applied_pack_versions.find(
                  (p) => p.pack_id === rule.pack_id,
                );
              const activeMeta =
                activePacks.find(
                  (p) =>
                    p.pack_meta.id === rule.pack_id &&
                    (!rule.pack_version || p.pack_meta.version === rule.pack_version),
                ) ??
                activePacks.find((p) => p.pack_meta.id === rule.pack_id) ??
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
                <article
                  key={`${rule.pack_id}-${rawVersion}-${rule.rule_id}-${idx}`}
                  className="rounded-lg border border-slate-800 bg-[#060913] p-4 space-y-3 print-avoid-break"
                >
                  {/* Tier 1: Plain Korean Summary */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-mono">
                        <span
                          className={`font-semibold ${
                            isBlocker ? 'text-rose-300' : 'text-amber-300'
                          }`}
                        >
                          {isBlocker ? '● RED · BLOCKER' : '▲ AMBER · WARNING'}
                        </span>
                        <span className="text-slate-600" aria-hidden="true">
                          |
                        </span>
                        <span className="text-slate-400">{rule.category}</span>
                      </div>
                      <h4 className="text-sm font-semibold text-slate-100">
                        {rule.plain_title}
                      </h4>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {rule.plain_explanation}
                      </p>
                    </div>
                  </div>

                  {/* Tier 2 & Tier 3: Legal Citation & Expected Statutory Risk */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-slate-800/80 text-xs">
                    <div>
                      <div className="text-[11px] font-medium text-sky-300 mb-1">
                        ② 정확한 법 조문 근거 · 계층
                      </div>
                      <div className="font-mono text-slate-200">
                        Layer {rule.layer} · {lawName}
                        {versionTag ? ` ${versionTag}` : ''} ({rule.pack_id}) ·{' '}
                        {rule.article_citation}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-amber-300 mb-1">
                        ③ 예상 규제 리스크 (참고 안내)
                      </div>
                      <div className="text-slate-300 leading-relaxed">
                        {penaltyText}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {showRawFacts && (
          <div className="no-print pt-3 border-t border-slate-800">
            <pre className="rounded-lg bg-[#060913] border border-slate-800 p-4 text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
              {JSON.stringify(facts, null, 2)}
            </pre>
          </div>
        )}

        {/* Legal Positioning Guardrail Banner */}
        <div className="rounded-lg border border-slate-800 bg-[#060913] px-4 py-3 flex items-start gap-2.5 text-xs text-slate-400 leading-relaxed">
          <Scale className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <p>
            본 결과는 개인정보 처리방침 문서와 실제 코드·인프라 설정 간의 정합성 불일치(Config &amp; Policy Drift) 및 법정 필수 고지 항목 누락을 기술적으로 탐지한 참고 리포트이며, 최종 법률 자문을 대체하지 않습니다.
          </p>
        </div>
      </section>
    </div>
  );
}
