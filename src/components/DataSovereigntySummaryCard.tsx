import React from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  Globe,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type { CanonicalFactModel, EvaluationResult } from '@/lib/types';

interface DataSovereigntySummaryCardProps {
  facts: CanonicalFactModel;
  result: EvaluationResult;
}

interface SovereigntyTier {
  label: string;
  gradeText: string;
  description: string;
  accentText: string;
  ringStroke: string;
  surfaceTint: string;
  borderTint: string;
  icon: React.ComponentType<{ className?: string }>;
}

function resolveSovereigntyTier(
  passRatePercent: number,
  result: EvaluationResult,
  facts: CanonicalFactModel,
): SovereigntyTier {
  const { blocker_count: blockers, warning_count: warnings, drift_count: drifts } =
    result.stats;
  const missingEncryption =
    !facts.security.encryption_in_transit || !facts.security.encryption_at_rest;

  if (
    passRatePercent === 100 &&
    blockers === 0 &&
    drifts === 0 &&
    warnings === 0
  ) {
    return {
      label: '주권 안전',
      gradeText: '정합성 완전 충족',
      description:
        '적용된 모든 관할 법률 팩 기준을 충족했으며 국외 이전 고지 누락이나 코드-문서 불일치가 없습니다.',
      accentText: 'text-emerald-300',
      ringStroke: 'stroke-emerald-400',
      surfaceTint: 'bg-emerald-950/20',
      borderTint: 'border-emerald-800/60',
      icon: ShieldCheck,
    };
  }

  if (passRatePercent >= 80 && blockers === 0 && drifts === 0 && !missingEncryption) {
    return {
      label: '조건부 양호',
      gradeText: '권고 항목 보완 권장',
      description:
        '치명적 차단 위반(BLOCKER)과 정책 불일치(Drift)는 없으나, 일부 권고 사항을 보완하면 완전 준수 상태가 됩니다.',
      accentText: 'text-sky-300',
      ringStroke: 'stroke-sky-400',
      surfaceTint: 'bg-sky-950/20',
      borderTint: 'border-sky-800/60',
      icon: CheckCircle2,
    };
  }

  if (passRatePercent >= 60 && blockers <= 1 && !missingEncryption) {
    return {
      label: '주의 필요',
      gradeText: '부분 주권 리스크 탐지',
      description:
        '국외 이전 고지 누락 또는 처리방침-인프라 간 불일치(Drift)가 확인되어 배포 전 수정이 필요합니다.',
      accentText: 'text-amber-300',
      ringStroke: 'stroke-amber-400',
      surfaceTint: 'bg-amber-950/20',
      borderTint: 'border-amber-700/60',
      icon: AlertTriangle,
    };
  }

  return {
    label: '위험 · 즉시 시정',
    gradeText: '핵심 데이터 주권 위반',
    description:
      '다수의 법정 필수 고지 누락, 가상이전 통제 미비 또는 암호화 미적용이 탐지되어 국외 데이터 반출 보류가 권고됩니다.',
    accentText: 'text-rose-300',
    ringStroke: 'stroke-rose-400',
    surfaceTint: 'bg-rose-950/25',
    borderTint: 'border-rose-700/60',
    icon: ShieldAlert,
  };
}

export function DataSovereigntySummaryCard({
  facts,
  result,
}: DataSovereigntySummaryCardProps) {
  const totalEvaluatedRules =
    result.stats.total_evaluated_rules ?? result.triggered_rules.length;
  const passedRuleCount =
    result.stats.passed_rule_count ??
    Math.max(0, totalEvaluatedRules - result.triggered_rules.length);
  const passRatePercent = Math.max(
    0,
    Math.min(
      100,
      result.stats.pass_rate_percent ?? result.compliance_score ?? 100,
    ),
  );

  const tier = resolveSovereigntyTier(passRatePercent, result, facts);
  const TierIcon = tier.icon;

  // SVG circular gauge geometry
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (passRatePercent / 100) * circumference;

  const prioritizedViolations = [...result.triggered_rules]
    .sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === 'BLOCKER' ? -1 : 1;
      }
      if (a.has_drift !== b.has_drift) {
        return a.has_drift ? -1 : 1;
      }
      return a.layer - b.layer;
    })
    .slice(0, 4);

  const remainingViolationCount = Math.max(
    0,
    result.triggered_rules.length - prioritizedViolations.length,
  );

  const destinationCountries = result.stats.active_destination_countries;
  const hasForeignIam = facts.transfers.virtual_transfer.foreign_iam_access;
  const hasForeignKms = facts.transfers.virtual_transfer.foreign_kms_control;
  const hasVirtualTransfer = hasForeignIam || hasForeignKms;
  const missingTransitEnc = !facts.security.encryption_in_transit;
  const missingRestEnc = !facts.security.encryption_at_rest;
  const isPiiMasked = facts.security.pii_masked_before_transfer;

  const highestCountryRisk = result.applied_country_risks[0];

  const pillars = [
    {
      id: 'cross-border',
      icon: Globe,
      label: '물리적 국외 이전',
      statusText:
        destinationCountries.length > 0
          ? `${destinationCountries.join(', ')} · ${result.stats.active_vendor_count}개 PII 벤더`
          : `${facts.workspace.business_country} 국내 한정`,
      alertLevel:
        destinationCountries.length > 0 && result.stats.blocker_count > 0
          ? 'critical'
          : destinationCountries.length > 0
            ? 'warn'
            : 'ok',
      subText: highestCountryRisk
        ? `최고 수신국 리스크: ${highestCountryRisk.country_code} (${highestCountryRisk.profile.risk_level})`
        : '국외 반출 벤더/리전 미탐지',
    },
    {
      id: 'virtual-transfer',
      icon: KeyRound,
      label: '원격 통제 · 가상이전',
      statusText: hasVirtualTransfer
        ? [
            hasForeignIam ? '해외 IAM 열람' : null,
            hasForeignKms ? '해외 KMS 통제' : null,
          ]
            .filter(Boolean)
            .join(' + ')
        : '국내 접근·키 통제 격리',
      alertLevel: hasVirtualTransfer ? 'critical' : 'ok',
      subText: hasVirtualTransfer
        ? '국내 저장 시에도 법상 국외 이전 해당'
        : '해외 원격 열람 및 키 통제 없음',
    },
    {
      id: 'policy-drift',
      icon: FileWarning,
      label: '문서-인프라 정합성',
      statusText:
        result.stats.drift_count > 0
          ? `불일치(Drift) ${result.stats.drift_count}건`
          : facts.legal_doc.exists
            ? '정합성 일치'
            : '처리방침 미확인',
      alertLevel:
        result.stats.drift_count > 0 || !facts.legal_doc.exists
          ? 'critical'
          : 'ok',
      subText: facts.legal_doc.claims_domestic_only && result.stats.drift_count > 0
        ? '"국내 단독 보관" 선언과 실제 설정 충돌'
        : facts.legal_doc.exists
          ? '처리방침 기재 내용 대조 완료'
          : '법정 고지 문서 입력 필요',
    },
    {
      id: 'safeguards',
      icon: Lock,
      label: '기술적 보호조치',
      statusText:
        missingTransitEnc || missingRestEnc
          ? '암호화 설정 누락'
          : isPiiMasked
            ? '암호화 · PII 마스킹 적용'
            : '전송·저장 암호화 적용',
      alertLevel:
        missingTransitEnc || missingRestEnc
          ? 'critical'
          : !isPiiMasked && (destinationCountries.length > 0 || hasVirtualTransfer)
            ? 'warn'
            : 'ok',
      subText:
        missingTransitEnc || missingRestEnc
          ? [
              missingTransitEnc ? '전송(TLS) 미적용' : null,
              missingRestEnc ? '저장(KMS) 미적용' : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : isPiiMasked
            ? '이전 전 직접 식별자 비식별화 활성'
            : '국외 전송 전 PII 마스킹 미적용',
    },
  ] as const;

  return (
    <section
      aria-label="데이터 주권 요약 카드"
      className={`rounded-xl border bg-[#0B1120] p-6 space-y-5 ${tier.borderTint}`}
    >
      {/* Top Row: Circular Fulfillment Gauge + Sovereignty Status + Violation Counts */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5 min-w-0">
          {/* Fulfillment Rate Radial Gauge */}
          <div
            className={`shrink-0 w-24 h-24 rounded-xl border ${tier.borderTint} ${tier.surfaceTint} flex items-center justify-center relative`}
            aria-label={`데이터 주권 충족률 ${passRatePercent}%`}
          >
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 96 96">
              <circle
                cx="48"
                cy="48"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="7"
                className="text-slate-800"
              />
              <circle
                cx="48"
                cy="48"
                r={radius}
                fill="none"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className={`${tier.ringStroke} transition-all duration-500`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span
                className={`font-mono text-lg font-bold tabular-nums leading-none ${tier.accentText}`}
              >
                {passRatePercent}%
              </span>
              <span className="text-[10px] font-mono text-slate-400 mt-1 tabular-nums">
                {passedRuleCount}/{totalEvaluatedRules}
              </span>
            </div>
          </div>

          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`inline-flex items-center gap-1.5 font-semibold ${tier.accentText}`}
              >
                <TierIcon className="w-4 h-4 shrink-0" />
                <span>데이터 주권 요약 · {tier.label}</span>
              </span>
              <span className="text-slate-600" aria-hidden="true">
                /
              </span>
              <span className="text-slate-300 font-medium">{tier.gradeText}</span>
            </div>

            <h3 className="font-display text-base sm:text-lg font-semibold text-slate-100 leading-snug">
              {result.stats.blocker_count > 0
                ? `핵심 차단 위반 ${result.stats.blocker_count}건을 포함해 총 ${result.triggered_rules.length}건의 주권 리스크가 탐지되었습니다.`
                : result.triggered_rules.length > 0
                  ? `차단 위반은 없으나 ${result.triggered_rules.length}건의 권고·정합성 보완 항목이 확인되었습니다.`
                  : `전체 ${totalEvaluatedRules}개 점검 항목을 모두 충족하여 데이터 주권 정합성이 확보되었습니다.`}
            </h3>

            <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
              {tier.description}
            </p>
          </div>
        </div>

        {/* Right: Concise Violation Summary Strip */}
        <div className="shrink-0 flex sm:grid sm:grid-cols-3 gap-4 lg:gap-5 border-t lg:border-t-0 lg:border-l border-slate-800 pt-4 lg:pt-0 lg:pl-6">
          <div>
            <div className="text-[11px] text-slate-400">핵심 차단</div>
            <div className="font-mono text-lg font-bold text-rose-300 tabular-nums mt-0.5">
              {result.stats.blocker_count}건
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">정책 불일치</div>
            <div className="font-mono text-lg font-bold text-sky-300 tabular-nums mt-0.5">
              {result.stats.drift_count}건
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">주의 권고</div>
            <div className="font-mono text-lg font-bold text-amber-300 tabular-nums mt-0.5">
              {result.stats.warning_count}건
            </div>
          </div>
        </div>
      </div>

      {/* 4-Pillar Sovereignty Posture Grid (Hairline separated, no nested cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-800">
        {pillars.map((pillar) => {
          const PillarIcon = pillar.icon;
          const statusColor =
            pillar.alertLevel === 'critical'
              ? 'text-rose-300'
              : pillar.alertLevel === 'warn'
                ? 'text-amber-300'
                : 'text-emerald-300';
          return (
            <div key={pillar.id} className="space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <PillarIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{pillar.label}</span>
              </div>
              <div className={`text-xs font-semibold ${statusColor}`}>
                {pillar.statusText}
              </div>
              <div className="text-[11px] text-slate-400 leading-snug">
                {pillar.subText}
              </div>
            </div>
          );
        })}
      </div>

      {/* Highlighted Core Violations */}
      {prioritizedViolations.length > 0 && (
        <div className="pt-4 border-t border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-slate-200">
              핵심 위반 사항 하이라이트
            </h4>
            <span className="font-mono text-[11px] text-slate-400 tabular-nums">
              전체 {result.triggered_rules.length}건 중 주요 {prioritizedViolations.length}건
              {remainingViolationCount > 0 ? ` (+${remainingViolationCount}건 아래 상세)` : ''}
            </span>
          </div>

          <ul className="divide-y divide-slate-800/80 border border-slate-800 rounded-lg bg-[#060913]">
            {prioritizedViolations.map((rule, idx) => {
              const isBlocker = rule.severity === 'BLOCKER';
              return (
                <li
                  key={`${rule.pack_id}-${rule.rule_id}-${idx}`}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`inline-flex items-center gap-1 font-mono font-semibold ${
                          isBlocker ? 'text-rose-300' : 'text-amber-300'
                        }`}
                      >
                        {isBlocker ? (
                          <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>{rule.severity}</span>
                      </span>
                      {rule.has_drift && (
                        <>
                          <span className="text-slate-600" aria-hidden="true">
                            ·
                          </span>
                          <span className="font-mono text-[11px] font-semibold text-sky-300">
                            POLICY-INFRA DRIFT
                          </span>
                        </>
                      )}
                      <span className="text-slate-600" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        Layer {rule.layer} · {rule.article_citation}
                      </span>
                    </div>

                    <div className="text-xs sm:text-sm font-medium text-slate-100 leading-snug">
                      {rule.plain_title}
                    </div>

                    {rule.has_drift && rule.drift_summary && (
                      <div className="text-[11px] text-sky-200/90 leading-relaxed">
                        {rule.drift_summary}
                      </div>
                    )}
                  </div>

                  <span className="shrink-0 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                    {rule.pack_name}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
