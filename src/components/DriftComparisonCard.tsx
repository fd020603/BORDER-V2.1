import React, { useState } from 'react';
import {
  AlertOctagon,
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileWarning,
  ServerCrash,
  ShieldCheck,
} from 'lucide-react';
import { getDriftCategoryLabel } from '@/lib/category-labels';
import type { CanonicalFactModel, EvaluationResult } from '@/lib/types';
import { useCountUp } from '../hooks/useCountUp';
import { InfoTooltip } from './InfoTooltip';

interface DriftComparisonCardProps {
  facts: CanonicalFactModel;
  result: EvaluationResult;
  onNavigateToRemediation?: () => void;
}

export function DriftComparisonCard({
  facts,
  result,
  onNavigateToRemediation,
}: DriftComparisonCardProps) {
  const [showAllDrifts, setShowAllDrifts] = useState(false);
  const [previewRemediated, setPreviewRemediated] = useState(false);

  const currentScore = Math.max(
    0,
    Math.min(
      100,
      result.stats.pass_rate_percent ?? result.compliance_score ?? 100,
    ),
  );
  const targetScore = previewRemediated ? 100 : currentScore;
  const animatedScore = useCountUp(
    targetScore,
    `${result.evaluated_at}-${previewRemediated ? 'remediated' : 'current'}`,
  );

  if (result.detected_drifts.length === 0) {
    return null;
  }

  const activeVendors = facts.transfers.detected_vendors.filter(
    (v) => (v.includes_pii ?? v.sends_pii) !== false,
  );
  const hasVirtualTransfer =
    facts.transfers.virtual_transfer.foreign_iam_access ||
    facts.transfers.virtual_transfer.foreign_kms_control;

  const businessCountry = facts.workspace.business_country.toUpperCase();

  // Compute Declared vs. Detected metadata tags (localized Korean labels)
  const declaredTag = !facts.legal_doc.exists
    ? '처리방침 명시: 문서 없음'
    : facts.legal_doc.claims_domestic_only
      ? businessCountry === 'KR'
        ? '처리방침 명시: 국내 전용'
        : `처리방침 명시: ${businessCountry} 전용`
      : facts.legal_doc.disclosed_countries.length > 0
        ? `처리방침 명시: ${facts.legal_doc.disclosed_countries.join(' / ')}`
        : '처리방침 명시: 이전 국가 미기재';

  const detectedCountryList = Array.from(
    new Set([
      ...result.stats.active_destination_countries.map((c) => c.toUpperCase()),
      ...(hasVirtualTransfer && businessCountry !== 'US' ? ['US'] : []),
    ]),
  );

  const detectedTag =
    detectedCountryList.length > 0
      ? `실제 탐지: ${detectedCountryList.join(' / ')}`
      : `실제 탐지: ${businessCountry} 인프라`;

  const syncedTargetTag =
    detectedCountryList.length > 0
      ? detectedCountryList.join(' / ')
      : businessCountry;

  const promisedText = !facts.legal_doc.exists
    ? '공개된 개인정보 처리방침 문서가 존재하지 않습니다.'
    : facts.legal_doc.claims_domestic_only
      ? '"개인정보를 대한민국 국내 서버에만 단독 보관하며, 국외로 이전하지 않습니다."'
      : `공개 국가: ${
          facts.legal_doc.disclosed_countries.length > 0
            ? facts.legal_doc.disclosed_countries.join(', ')
            : '미기재'
        } · 공개 벤더: ${
          facts.legal_doc.disclosed_vendors.length > 0
            ? facts.legal_doc.disclosed_vendors.join(', ')
            : '미기재'
        }`;

  const remediatedPromisePreviewText = `개정 처리방침 자동 반영: 국외 이전 국가(${
    detectedCountryList.join(', ') || businessCountry
  }), 수탁사(${
    activeVendors.map((v) => v.name).join(', ') || '인프라 리전'
  }), 5대 법정 고지 및 AI ZDR·SCC 안전조치 동기화 완료`;

  const actualItems: string[] = [
    ...activeVendors.map(
      (v) => `${v.sdk} (${v.data_residency_country || v.country})`,
    ),
    ...result.stats.active_destination_countries
      .filter(
        (c) =>
          !activeVendors.some(
            (v) => (v.data_residency_country || v.country) === c,
          ),
      )
      .map((c) => `Cloud Region (${c})`),
  ];

  if (facts.transfers.virtual_transfer.foreign_iam_access) {
    actualItems.push('해외 본사 IAM 원격 열람 권한');
  }
  if (facts.transfers.virtual_transfer.foreign_kms_control) {
    actualItems.push('해외 KMS 키 통제권');
  }

  const prioritizedDrifts = [...result.detected_drifts].sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'BLOCKER' ? -1 : 1;
    }
    return 0;
  });

  const visibleDrifts = showAllDrifts
    ? prioritizedDrifts
    : prioritizedDrifts.slice(0, 2);
  const hiddenDriftCount = Math.max(0, prioritizedDrifts.length - 2);
  const scoreDelta = Math.max(0, 100 - currentScore);

  return (
    <section
      className={`rounded-xl border bg-[#0C0C0F] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] p-5 space-y-4 transition-colors duration-200 ${
        previewRemediated
          ? 'border-emerald-500/45'
          : 'border-amber-500/35'
      }`}
      aria-label="위조 여권 탐지기 — 문서-인프라 모순 비교"
    >
      {/* Header Row with Remediation Preview Switch */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {previewRemediated ? (
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <FileWarning className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          )}
          <div>
            <h3 className="font-display text-base font-semibold text-zinc-100 flex items-center gap-1.5">
              <span>위조 여권 탐지기 · Policy-Infra Drift 감지</span>
              <InfoTooltip term="drift" />
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              {previewRemediated
                ? `치유 패치 적용 시 ${result.detected_drifts.length}건의 모순이 해소되고 전체 준수율이 100% (APPROVED)로 전환됩니다.`
                : `처리방침에 약속된 내용과 실제 코드·인프라 설정 사이에 ${result.detected_drifts.length}건의 정합성 모순이 발견되었습니다.`}
            </p>
          </div>
        </div>

        {/* Toggle Switch + Live Score Jump Indicator */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div
            className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border font-mono text-xs tabular-nums transition-colors ${
              previewRemediated
                ? 'border-emerald-500/40 bg-emerald-500/[0.1] text-emerald-300'
                : 'border-rose-500/35 bg-rose-500/[0.08] text-rose-300'
            }`}
          >
            <span>준수율</span>
            <span className="font-bold">{animatedScore}%</span>
            {previewRemediated && scoreDelta > 0 && (
              <span className="text-[11px] text-emerald-200">
                (+{scoreDelta}%p)
              </span>
            )}
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={previewRemediated}
            onClick={() => setPreviewRemediated((prev) => !prev)}
            className={`inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${
              previewRemediated
                ? 'border-emerald-500/45 bg-emerald-500/[0.1] text-emerald-200'
                : 'border-white/[0.1] bg-[#08080A] hover:border-white/[0.18] text-zinc-200'
            }`}
          >
            <span>치유 적용 시 예상 결과 미리보기</span>
            <span
              aria-hidden="true"
              className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                previewRemediated ? 'bg-emerald-500' : 'bg-white/[0.16]'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-[#FAFAFA] shadow transition-transform ${
                  previewRemediated ? 'translate-x-3.5' : 'translate-x-0.5'
                }`}
              />
            </span>
          </button>
        </div>
      </div>

      {/* Visual Passport Diff Bridge Bar (Declared vs. Mismatch Badge vs. Detected) */}
      <div
        className={`rounded-lg border px-4 py-3 transition-colors duration-200 ${
          previewRemediated
            ? 'border-emerald-500/30 bg-emerald-500/[0.05]'
            : 'border-white/[0.07] bg-[#08080A]'
        }`}
      >
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Declared Metadata Tag */}
          <div className="flex flex-wrap items-center gap-2">
            {previewRemediated ? (
              <>
                <span className="inline-flex items-center px-2.5 py-1 rounded-md border border-white/[0.08] bg-white/[0.02] font-mono text-[11px] text-zinc-500 line-through whitespace-nowrap">
                  {declaredTag}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-emerald-400/45 bg-emerald-500/[0.12] font-mono text-[11px] font-semibold text-emerald-300 whitespace-nowrap">
                  치유 반영: {syncedTargetTag}
                </span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-400/40 bg-amber-500/[0.1] font-mono text-[11px] font-semibold text-amber-300 whitespace-nowrap">
                {declaredTag}
              </span>
            )}
          </div>

          {/* Visual Connector Line + Mismatch / Synced Indicator Badge */}
          <div className="flex items-center gap-2 w-full md:flex-1 justify-center">
            <div
              className={`hidden md:block flex-1 h-px border-t ${
                previewRemediated
                  ? 'border-solid border-emerald-400/50'
                  : 'border-dashed border-rose-500/55'
              }`}
            />
            {previewRemediated ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-400/50 bg-[#081510] font-mono text-[11px] font-semibold text-emerald-300 whitespace-nowrap">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>정합성 일치 · 100% 준수</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-rose-500/55 bg-[#180B10] font-mono text-[11px] font-semibold text-rose-300 whitespace-nowrap tabular-nums">
                <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
                <span>≠ 불일치 · {result.detected_drifts.length}건 충돌</span>
              </span>
            )}
            <div
              className={`hidden md:block flex-1 h-px border-t ${
                previewRemediated
                  ? 'border-solid border-emerald-400/50'
                  : 'border-dashed border-rose-500/55'
              }`}
            />
          </div>

          {/* Detected Metadata Tag */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-mono text-[11px] font-semibold whitespace-nowrap ${
                previewRemediated
                  ? 'border-emerald-400/45 bg-emerald-500/[0.12] text-emerald-300'
                  : 'border-rose-500/45 bg-rose-500/[0.12] text-rose-300'
              }`}
            >
              {detectedTag}
            </span>
            {hasVirtualTransfer && (
              <span
                className={`inline-flex items-center px-2 py-1 rounded-md border font-mono text-[10px] font-semibold whitespace-nowrap ${
                  previewRemediated
                    ? 'border-emerald-400/35 bg-emerald-500/[0.08] text-emerald-300'
                    : 'border-rose-500/40 bg-rose-500/[0.1] text-rose-300'
                }`}
              >
                {previewRemediated ? 'IAM/KMS: 국내 격리' : '가상이전: IAM/KMS'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Side-by-Side Promised vs Actual Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-11 gap-3 items-stretch">
        {/* Left: Promised State */}
        <div
          className={`lg:col-span-5 rounded-lg border p-4 flex flex-col justify-between transition-colors ${
            previewRemediated
              ? 'border-emerald-500/35 bg-[#07130E]'
              : 'border-white/[0.07] bg-[#08080A]'
          }`}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span
                className={`text-[11px] font-mono ${
                  previewRemediated ? 'text-emerald-300' : 'text-cyan-300'
                }`}
              >
                {previewRemediated
                  ? '치유된 처리방침 · 개정 초안 미리보기'
                  : '약속된 상태 · 처리방침 문서 명시 내용'}
              </span>
            </div>
            <p
              className={`text-sm font-medium leading-relaxed ${
                previewRemediated ? 'text-emerald-100' : 'text-zinc-100'
              }`}
            >
              {previewRemediated ? remediatedPromisePreviewText : promisedText}
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-white/[0.06] text-[11px] text-zinc-400 font-mono">
            {previewRemediated
              ? '국내 단독 명시: 아니오 · 보호조치 고지: 예 · 5대 고지: 완료'
              : `국내 단독 명시: ${facts.legal_doc.claims_domestic_only ? '예' : '아니오'} · 보호조치 고지: ${facts.legal_doc.has_scc_or_safeguard_notice ? '예' : '아니오'}`}
          </div>
        </div>

        {/* Center: Contradiction / Synced Connector */}
        <div className="lg:col-span-1 flex lg:flex-col items-center justify-center gap-1.5 py-2">
          <div
            className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
              previewRemediated
                ? 'border-emerald-400/55 bg-emerald-500/15'
                : 'border-rose-500/45 bg-rose-500/10'
            }`}
          >
            {previewRemediated ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            ) : (
              <ArrowLeftRight className="w-4 h-4 text-rose-300" />
            )}
          </div>
          <span
            className={`font-mono text-[10px] font-semibold text-center ${
              previewRemediated ? 'text-emerald-300' : 'text-rose-300'
            }`}
          >
            {previewRemediated ? '정합성 일치' : '모순 충돌'}
          </span>
        </div>

        {/* Right: Actual Code & Infra State */}
        <div
          className={`lg:col-span-5 rounded-lg border p-4 flex flex-col justify-between transition-colors ${
            previewRemediated
              ? 'border-emerald-500/35 bg-[#07130E]'
              : 'border-rose-500/35 bg-[#12090D]'
          }`}
        >
          <div className="space-y-2">
            <div
              className={`text-[11px] font-mono flex items-center gap-1.5 ${
                previewRemediated ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              {previewRemediated ? (
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ServerCrash className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>
                {previewRemediated
                  ? '강화된 인프라 · 보안·가상이전 치유 적용 후'
                  : '실제 상태 · 코드·인프라 탐지 결과'}
              </span>
            </div>
            <div
              className={`text-sm font-medium leading-relaxed ${
                previewRemediated ? 'text-emerald-100' : 'text-rose-100'
              }`}
            >
              {actualItems.length > 0
                ? actualItems.join(' · ')
                : '해외 전송 또는 보호조치 불일치 탐지'}
            </div>
          </div>
          <div
            className={`mt-3 pt-2.5 border-t text-[11px] font-mono ${
              previewRemediated
                ? 'border-emerald-500/20 text-emerald-200/85'
                : 'border-rose-500/20 text-rose-200/80'
            }`}
          >
            {previewRemediated
              ? 'TLS: ON · AES/KMS: ON · PII Masking: ON · AI ZDR: ON'
              : `도착국: ${result.stats.active_destination_countries.join(', ') || '없음'} · 활성 SDK: ${result.stats.active_vendor_count}종`}
          </div>
        </div>
      </div>

      {/* Preview Score Jump Bar when toggle is ON */}
      {previewRemediated && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-panel-enter">
          <div className="flex-1 space-y-1.5 min-w-0">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-emerald-200">
                치유 적용 시 컴플라이언스 점수 시뮬레이션
              </span>
              <span className="font-mono font-bold text-emerald-300 tabular-nums">
                {currentScore}% → 100% (APPROVED)
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                style={{ width: `${animatedScore}%` }}
              />
            </div>
          </div>
          {onNavigateToRemediation && (
            <button
              type="button"
              onClick={onNavigateToRemediation}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAFAFA] hover:bg-white text-[#050507] text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <span>자동 치유 키트에서 실제 적용</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Condensed Drift Contradiction List (Top 2 + Expand Toggle) */}
      <div className="border-t border-white/[0.06] pt-2">
        <div className="divide-y divide-white/[0.06]">
          {visibleDrifts.map((drift) => (
            <div
              key={drift.rule_id}
              className="py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs"
            >
              <div className="min-w-0 flex items-center gap-2">
                {previewRemediated && (
                  <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
                    해소됨
                  </span>
                )}
                <span
                  title={drift.drift_type}
                  className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium shrink-0 whitespace-nowrap ${
                    previewRemediated
                      ? 'border-white/[0.06] bg-white/[0.02] text-zinc-500'
                      : 'border-amber-500/30 bg-amber-500/[0.08] text-amber-300'
                  }`}
                >
                  {getDriftCategoryLabel(drift.drift_type)}
                </span>
                <span
                  className={`font-medium truncate ${
                    previewRemediated
                      ? 'text-zinc-500 line-through'
                      : 'text-zinc-200'
                  }`}
                >
                  {drift.summary}
                </span>
              </div>
              <span className="font-mono text-[11px] text-zinc-400 shrink-0 tabular-nums">
                {drift.pack_id} · {previewRemediated ? '해소됨' : drift.severity}
              </span>
            </div>
          ))}
        </div>

        {hiddenDriftCount > 0 && (
          <div className="pt-2 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={() => setShowAllDrifts((prev) => !prev)}
              aria-expanded={showAllDrifts}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 transition-colors py-1"
            >
              <span>
                {showAllDrifts
                  ? '모순 내역 접기'
                  : `+ ${hiddenDriftCount}건의 모순 내역 더보기`}
              </span>
              {showAllDrifts ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
