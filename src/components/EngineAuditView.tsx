import React, { useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileWarning,
  Globe,
  Layers,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type {
  CanonicalFactModel,
  EvaluationResult,
  EvaluationVerdict,
  TransferPurpose,
} from '@/lib/types';

interface EngineAuditViewProps {
  scenarioTitle: string;
  facts: CanonicalFactModel;
  result: EvaluationResult;
  lastEngineUsed?: string | null;
  parserWarnings?: string[];
  hideVendorTable?: boolean;
  onToggleVendorPii?: (sdk: string) => void;
  onChangeVendorPurpose?: (sdk: string, purpose: TransferPurpose) => void;
}

const VERDICT_META: Record<
  EvaluationVerdict,
  {
    label: string;
    containerClass: string;
    textClass: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  APPROVED: {
    label: 'APPROVED · 정합성 통과',
    containerClass: 'bg-emerald-950/35 border-emerald-800/70',
    textClass: 'text-emerald-300',
    icon: CheckCircle2,
  },
  DRIFT_DETECTED: {
    label: 'DRIFT_DETECTED · 위조 여권(불일치) 탐지',
    containerClass: 'bg-amber-950/35 border-amber-700/70',
    textClass: 'text-amber-300',
    icon: FileWarning,
  },
  CONDITIONAL: {
    label: 'CONDITIONAL · 조건부 충족',
    containerClass: 'bg-sky-950/35 border-sky-800/70',
    textClass: 'text-sky-300',
    icon: AlertTriangle,
  },
  DENIED: {
    label: 'DENIED · 반출 보류 (조치 필요)',
    containerClass: 'bg-rose-950/40 border-rose-800/70',
    textClass: 'text-rose-300',
    icon: AlertOctagon,
  },
};

const RISK_LEVEL_STYLES: Record<string, string> = {
  CRITICAL: 'text-rose-300',
  HIGH: 'text-amber-300',
  MODERATE: 'text-sky-300',
  LOW: 'text-emerald-300',
};

export function EngineAuditView({
  scenarioTitle,
  facts,
  result,
  lastEngineUsed,
  parserWarnings = [],
  hideVendorTable = false,
  onToggleVendorPii,
  onChangeVendorPurpose,
}: EngineAuditViewProps) {
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [showRawFacts, setShowRawFacts] = useState(false);

  const verdictStyle = VERDICT_META[result.verdict];
  const VerdictIcon = verdictStyle.icon;

  return (
    <div className="space-y-6">
      {parserWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/25 px-4 py-2.5 text-xs text-amber-200">
          {parserWarnings.join(' · ')}
        </div>
      )}

      {/* Top Verdict + Score Summary */}
      <section
        className={`rounded-xl border p-6 ${verdictStyle.containerClass}`}
        aria-label="평가 판정 요약"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center gap-2.5">
              <VerdictIcon className={`w-5 h-5 shrink-0 ${verdictStyle.textClass}`} />
              <span
                className={`font-mono text-xs font-semibold tracking-wide ${verdictStyle.textClass}`}
              >
                {verdictStyle.label}
              </span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-semibold text-slate-100 leading-snug">
              {result.summary_headline}
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              {result.summary_detail}
            </p>
            <div className="pt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span>대상: {scenarioTitle}</span>
              <span aria-hidden="true">·</span>
              <span>사업자 소재: {facts.workspace.business_country}</span>
              <span aria-hidden="true">·</span>
              <span>정보주체: {facts.workspace.data_subject_countries.join(', ')}</span>
              <span aria-hidden="true">·</span>
              <span>도메인: {facts.workspace.industry_domain}</span>
              {lastEngineUsed && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">파서: {lastEngineUsed}</span>
                </>
              )}
            </div>
          </div>

          {/* Pass Rate & Counters */}
          <div className="flex items-center gap-6 lg:border-l lg:border-slate-800/80 lg:pl-6 shrink-0">
            <div>
              <div className="text-xs text-slate-400 mb-1">점검 항목 충족률</div>
              <div className="font-mono text-3xl font-semibold text-slate-100 tabular-nums">
                {result.stats.pass_rate_percent ?? result.compliance_score}%
                <span className="text-sm text-slate-400 font-normal ml-1.5">
                  ({result.stats.passed_rule_count ?? 0}/{result.stats.total_evaluated_rules ?? 0})
                </span>
              </div>
            </div>
            <div className="space-y-1.5 text-xs tabular-nums">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-400">BLOCKER</span>
                <span className="font-mono font-semibold text-rose-300">
                  {result.stats.blocker_count}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-400">WARNING</span>
                <span className="font-mono font-semibold text-amber-300">
                  {result.stats.warning_count}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-400">Policy Drift</span>
                <span className="font-mono font-semibold text-sky-300">
                  {result.stats.drift_count}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4-Layer Pack Execution Strip */}
      <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-5">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <h3 className="font-display text-sm font-semibold text-slate-100">
              4계층 법률 팩 평가 현황
            </h3>
          </div>
          <span className="text-xs text-slate-400 tabular-nums">
            적용 대상 팩 {result.applied_pack_versions.filter((p) => p.applicable).length} /{' '}
            {result.applied_pack_versions.length}종
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          {result.applied_pack_versions.map((pack) => {
            const statusText = !pack.applicable
              ? '비적용'
              : pack.triggered_rule_count === 0
                ? '통과 (0건)'
                : `${pack.triggered_rule_count}건 탐지`;

            const statusColor = !pack.applicable
              ? 'text-slate-500'
              : pack.triggered_rule_count === 0
                ? 'text-emerald-300'
                : 'text-amber-300';

            return (
              <div
                key={pack.pack_id}
                className={`rounded-lg border p-3.5 ${
                  pack.applicable
                    ? 'border-slate-800 bg-[#0F172A]/80'
                    : 'border-slate-800/60 bg-[#080C17] opacity-65'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 mb-1">
                  <span className="font-mono">Layer {pack.layer}</span>
                  <span className="font-mono">v{pack.version}</span>
                </div>
                <div className="text-xs font-semibold text-slate-100 truncate">
                  {pack.pack_id}
                </div>
                <div className="text-[11px] text-slate-400 truncate mt-0.5">
                  {pack.law_name}
                </div>
                <div className={`mt-2.5 text-xs font-medium tabular-nums ${statusColor}`}>
                  {statusText}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Policy-Infra Drift Detection Section */}
      {result.detected_drifts.length > 0 && (
        <section className="rounded-xl border border-amber-800/60 bg-[#0B1120] p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <FileWarning className="w-4 h-4 text-amber-400" />
              <h3 className="font-display text-sm font-semibold text-slate-100">
                감지된 문서-인프라 불일치 (Policy-Infra Drift)
              </h3>
            </div>
            <span className="font-mono text-xs text-amber-300 tabular-nums">
              {result.detected_drifts.length}건
            </span>
          </div>

          <div className="divide-y divide-slate-800">
            {result.detected_drifts.map((drift) => (
              <div key={drift.rule_id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-1">
                  <span className="font-mono text-amber-300">{drift.drift_type}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{drift.pack_id}</span>
                  <span aria-hidden="true">·</span>
                  <span>{drift.severity}</span>
                </div>
                <div className="text-sm font-semibold text-slate-100">{drift.title}</div>
                <p className="text-xs text-slate-300 mt-1">{drift.summary}</p>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                  <div className="rounded-lg bg-[#060913] border border-slate-800 px-3 py-2">
                    <div className="text-[11px] text-slate-400 mb-1">
                      처리방침 선언 ({drift.doc_claim_path})
                    </div>
                    <div className="text-slate-200 break-all">
                      {JSON.stringify(drift.doc_claim_value)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#060913] border border-slate-800 px-3 py-2">
                    <div className="text-[11px] text-slate-400 mb-1">
                      실제 코드·인프라 ({drift.fact_path})
                    </div>
                    <div className="text-amber-200 break-all">
                      {JSON.stringify(drift.fact_value)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Optional Vendor Table + Layer 2 Country Risks */}
      <div
        className={
          hideVendorTable
            ? 'space-y-6'
            : 'grid grid-cols-1 lg:grid-cols-12 gap-6 items-start'
        }
      >
        {!hideVendorTable && onToggleVendorPii && onChangeVendorPurpose && (
          <section className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#0B1120] p-5">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  탐지된 외부 SaaS · SDK 벤더
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  개인정보 전송 여부를 끄면(includes_pii = false) 국외 이전 위반 대상에서 자동 제외됩니다.
                </p>
              </div>
              <span className="font-mono text-xs text-slate-400 tabular-nums shrink-0">
                활성 {result.stats.active_vendor_count} · 제외{' '}
                {result.stats.excluded_non_pii_vendor_count}
              </span>
            </div>

            {facts.transfers.detected_vendors.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-800 py-8 px-4 text-center text-xs text-slate-400">
                탐지된 외부 SDK 벤더가 없습니다.
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {facts.transfers.detected_vendors.map((vendor) => {
                  const includesPii =
                    (vendor.includes_pii ?? vendor.sends_pii) !== false;
                  const residencyCountry =
                    vendor.data_residency_country || vendor.country;
                  return (
                    <div
                      key={vendor.sdk}
                      className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                          <span className="truncate">{vendor.name}</span>
                          <span className="font-mono text-xs text-slate-400">
                            ({residencyCountry})
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400 mt-1">
                          <span className="font-mono text-sky-300">{vendor.sdk}</span>
                          <span aria-hidden="true">·</span>
                          <span>DPF: {vendor.dpf_certified ? '인증' : '미인증'}</span>
                          <span aria-hidden="true">·</span>
                          <span>ZDR: {vendor.zero_data_retention ? '지원' : '미확인'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          value={vendor.transfer_purpose}
                          onChange={(e) =>
                            onChangeVendorPurpose(
                              vendor.sdk,
                              e.target.value as TransferPurpose,
                            )
                          }
                          aria-label={`${vendor.name} 이전 목적`}
                          className="rounded-md bg-[#060913] border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        >
                          <option value="ENTRUSTMENT">ENTRUSTMENT (처리위탁)</option>
                          <option value="ANALYTICS">ANALYTICS (행동분석)</option>
                          <option value="THIRD_PARTY_SHARING">
                            THIRD_PARTY_SHARING (제3자 제공)
                          </option>
                        </select>

                        <button
                          type="button"
                          onClick={() => onToggleVendorPii(vendor.sdk)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                            includesPii
                              ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                              : 'bg-slate-800/70 border-slate-700 text-slate-400'
                          }`}
                        >
                          {includesPii ? 'PII 전송함' : 'PII 미전송(제외)'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Layer 2 Country Risk Profiles */}
        <section
          className={`${
            hideVendorTable ? '' : 'lg:col-span-5'
          } rounded-xl border border-slate-800 bg-[#0B1120] p-5`}
        >
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-sky-400" />
              <h3 className="font-display text-sm font-semibold text-slate-100">
                Layer 2 · 도착국 감시·현지화 리스크
              </h3>
            </div>
            <span className="font-mono text-xs text-slate-400 tabular-nums">
              {result.applied_country_risks.length}개국
            </span>
          </div>

          {result.applied_country_risks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-800 py-8 px-4 text-center text-xs text-slate-400">
              해외 도착국 전송이 탐지되지 않았습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {result.applied_country_risks.map((item) => (
                <div
                  key={item.country_code}
                  className="rounded-lg border border-slate-800 bg-[#060913] p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-100">
                      {item.profile.country_name}
                    </div>
                    <span
                      className={`font-mono text-xs font-semibold ${
                        RISK_LEVEL_STYLES[item.profile.risk_level]
                      }`}
                    >
                      {item.profile.risk_level}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {item.profile.framework_name} · {item.profile.adequacy_status}
                  </div>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                    {item.profile.summary}
                  </p>
                  {item.triggered_by_vendors.length > 0 && (
                    <div className="text-[11px] font-mono text-slate-400 mt-2">
                      연동 벤더: {item.triggered_by_vendors.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Triggered Rules List */}
      <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-5">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-sky-400" />
            <h3 className="font-display text-sm font-semibold text-slate-100">
              발동된 점검 룰 및 시정 가이드 ({result.triggered_rules.length}건)
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setShowRawFacts((prev) => !prev)}
            className="text-xs text-slate-400 hover:text-slate-100 transition-colors whitespace-nowrap"
          >
            {showRawFacts ? 'CanonicalFact JSON 숨기기' : 'CanonicalFact JSON 보기'}
          </button>
        </div>

        {result.triggered_rules.length === 0 ? (
          <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-5 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <div className="text-sm font-medium text-emerald-200">
                탐지된 위반 또는 누락 항목이 없습니다.
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                적용된 모든 계층(Layer 1~4) 룰셋의 정합성 검증을 통과했습니다.
              </div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {result.triggered_rules.map((rule) => {
              const isExpanded = expandedRuleId === rule.rule_id;
              const isBlocker = rule.severity === 'BLOCKER';
              return (
                <div key={rule.rule_id} className="py-4 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedRuleId(isExpanded ? null : rule.rule_id)
                    }
                    className="w-full text-left flex items-start justify-between gap-4 focus-visible:outline-none"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-1">
                        <span
                          className={`font-mono font-semibold ${
                            isBlocker ? 'text-rose-300' : 'text-amber-300'
                          }`}
                        >
                          {rule.severity}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">Layer {rule.layer}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{rule.pack_id}</span>
                        <span aria-hidden="true">·</span>
                        <span>{rule.article_citation}</span>
                      </div>
                      <div className="text-sm font-semibold text-slate-100">
                        {rule.plain_title}
                      </div>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        {rule.plain_explanation}
                      </p>
                    </div>
                    <span className="p-1 text-slate-400 shrink-0">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-800/70 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg bg-[#060913] border border-slate-800 p-3">
                        <div className="font-medium text-sky-300 mb-1">
                          처리방침 보완 템플릿 (Legal Draft Hint)
                        </div>
                        <p className="text-slate-300 leading-relaxed">
                          {rule.remediation.legal_template}
                        </p>
                      </div>
                      <div className="rounded-lg bg-[#060913] border border-slate-800 p-3">
                        <div className="font-medium text-emerald-300 mb-1">
                          코드 · 인프라 수정 가이드 (Infra Patch Hint)
                        </div>
                        <p className="text-slate-300 leading-relaxed">
                          {rule.remediation.infra_patch_hint}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {showRawFacts && (
          <div className="mt-4 pt-4 border-t border-slate-800">
            <div className="text-xs font-medium text-slate-400 mb-2">
              표준 팩트 모델 (CanonicalFactModel)
            </div>
            <pre className="rounded-lg bg-[#060913] border border-slate-800 p-4 text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
              {JSON.stringify(facts, null, 2)}
            </pre>
          </div>
        )}
      </section>
    </div>
  );
}
