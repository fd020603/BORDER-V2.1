import React from 'react';
import { ArrowLeftRight, FileWarning, ServerCrash } from 'lucide-react';
import type { CanonicalFactModel, EvaluationResult } from '@/lib/types';
import { InfoTooltip } from './InfoTooltip';

interface DriftComparisonCardProps {
  facts: CanonicalFactModel;
  result: EvaluationResult;
}

export function DriftComparisonCard({
  facts,
  result,
}: DriftComparisonCardProps) {
  if (result.detected_drifts.length === 0) {
    return null;
  }

  const activeVendors = facts.transfers.detected_vendors.filter(
    (v) => (v.includes_pii ?? v.sends_pii) !== false,
  );

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

  return (
    <section
      className="rounded-xl border border-amber-700/70 bg-[#0B1120] p-5 space-y-4"
      aria-label="위조 여권 탐지기 — 문서-인프라 모순 비교"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <FileWarning className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <h3 className="font-display text-base font-semibold text-slate-100 flex items-center gap-1.5">
              <span>위조 여권 탐지기 · Policy-Infra Drift 감지</span>
              <InfoTooltip term="drift" />
            </h3>
            <p className="text-xs text-slate-400">
              처리방침에 약속된 내용과 실제 코드·인프라 설정 사이에 {result.detected_drifts.length}건의 정합성 모순이 발견되었습니다.
            </p>
          </div>
        </div>
        <span className="font-mono text-xs font-semibold text-rose-300 tabular-nums whitespace-nowrap">
          DRIFT DETECTED · {result.detected_drifts.length}건
        </span>
      </div>

      {/* Side-by-Side Promised vs Actual Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-11 gap-3 items-stretch">
        {/* Left: Promised State */}
        <div className="lg:col-span-5 rounded-lg border border-slate-800 bg-[#060913] p-4 flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-mono text-sky-300 mb-1.5">
              PROMISED STATE · 처리방침 문서의 약속
            </div>
            <p className="text-sm font-medium text-slate-100 leading-relaxed">
              {promisedText}
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400 font-mono">
            claims_domestic_only: {String(facts.legal_doc.claims_domestic_only)} ·
            scc_notice: {String(facts.legal_doc.has_scc_or_safeguard_notice)}
          </div>
        </div>

        {/* Center: Contradiction Connector */}
        <div className="lg:col-span-1 flex lg:flex-col items-center justify-center gap-1.5 py-2">
          <div className="w-9 h-9 rounded-full border border-rose-500/60 bg-rose-950/50 flex items-center justify-center shrink-0">
            <ArrowLeftRight className="w-4 h-4 text-rose-300" />
          </div>
          <span className="font-mono text-[10px] font-semibold text-rose-300 text-center">
            모순 충돌
          </span>
        </div>

        {/* Right: Actual Code & Infra State */}
        <div className="lg:col-span-5 rounded-lg border border-rose-900/60 bg-[#140910] p-4 flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-mono text-rose-300 mb-1.5 flex items-center gap-1.5">
              <ServerCrash className="w-3.5 h-3.5" />
              ACTUAL STATE · 실제 코드·인프라 탐지 결과
            </div>
            <div className="text-sm font-medium text-rose-100 leading-relaxed">
              {actualItems.length > 0
                ? actualItems.join(' · ')
                : '해외 전송 또는 보호조치 불일치 탐지'}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-rose-900/40 text-[11px] text-rose-200/80 font-mono">
            도착국: {result.stats.active_destination_countries.join(', ') || '없음'} ·
            활성 SDK: {result.stats.active_vendor_count}종
          </div>
        </div>
      </div>

      {/* Detailed Drift List */}
      <div className="divide-y divide-slate-800 border-t border-slate-800 pt-2">
        {result.detected_drifts.map((drift) => (
          <div
            key={drift.rule_id}
            className="py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs"
          >
            <div>
              <span className="font-mono text-amber-300 mr-2">
                [{drift.drift_type}]
              </span>
              <span className="text-slate-200 font-medium">{drift.summary}</span>
            </div>
            <span className="font-mono text-[11px] text-slate-400 shrink-0">
              {drift.pack_id} · {drift.severity}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
