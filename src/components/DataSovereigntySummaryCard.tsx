import React, { useMemo } from 'react';
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
import { DEFAULT_POLICY_PACKS } from '@/lib/default-packs';
import type {
  CanonicalFactModel,
  EvaluationResult,
  PolicyPackV2,
} from '@/lib/types';
import { useCountUp } from '../hooks/useCountUp';

interface DataSovereigntySummaryCardProps {
  facts: CanonicalFactModel;
  result: EvaluationResult;
  activePacks?: PolicyPackV2[];
}

interface SovereigntyTier {
  label: string;
  gradeText: string;
  description: string;
  accentText: string;
  ringStroke: string;
  ringGlow: string;
  surfaceTint: string;
  borderTint: string;
  icon: React.ComponentType<{ className?: string }>;
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

function resolveSovereigntyTier(
  passRatePercent: number,
  result: EvaluationResult,
  facts: CanonicalFactModel,
): SovereigntyTier {
  const {
    blocker_count: blockers,
    warning_count: warnings,
    drift_count: drifts,
  } = result.stats;
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
      ringGlow: 'drop-shadow(0 0 10px rgba(52, 211, 153, 0.38))',
      surfaceTint: 'bg-emerald-500/[0.06]',
      borderTint: 'border-emerald-500/30',
      icon: ShieldCheck,
    };
  }

  if (
    passRatePercent >= 80 &&
    blockers === 0 &&
    drifts === 0 &&
    !missingEncryption
  ) {
    return {
      label: '조건부 양호',
      gradeText: '권고 항목 보완 권장',
      description:
        '치명적 차단 위반(BLOCKER)과 정책 불일치(Drift)는 없으나, 일부 권고 사항을 보완하면 완전 준수 상태가 됩니다.',
      accentText: 'text-cyan-300',
      ringStroke: 'stroke-cyan-400',
      ringGlow: 'drop-shadow(0 0 10px rgba(56, 189, 248, 0.38))',
      surfaceTint: 'bg-cyan-500/[0.06]',
      borderTint: 'border-cyan-500/30',
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
      ringGlow: 'drop-shadow(0 0 10px rgba(251, 191, 36, 0.35))',
      surfaceTint: 'bg-amber-500/[0.06]',
      borderTint: 'border-amber-500/30',
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
    ringGlow: 'drop-shadow(0 0 10px rgba(244, 63, 94, 0.4))',
    surfaceTint: 'bg-rose-500/[0.06]',
    borderTint: 'border-rose-500/30',
    icon: ShieldAlert,
  };
}

export function DataSovereigntySummaryCard({
  facts,
  result,
  activePacks = DEFAULT_POLICY_PACKS,
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

  const animKey = `${result.evaluated_at}-${passRatePercent}-${result.stats.blocker_count}-${result.stats.drift_count}`;
  const animatedPassRate = useCountUp(passRatePercent, animKey);
  const animatedPassedRules = useCountUp(passedRuleCount, animKey);
  const animatedBlockerCount = useCountUp(result.stats.blocker_count, animKey);
  const animatedDriftCount = useCountUp(result.stats.drift_count, animKey);
  const animatedWarningCount = useCountUp(result.stats.warning_count, animKey);

  // SVG circular radial progress ring geometry (112x112 viewBox)
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (animatedPassRate / 100) * circumference;

  const applicablePacks = result.applied_pack_versions.filter(
    (p) => p.applicable,
  );

  const packSeverityBreakdowns = useMemo(() => {
    return applicablePacks.map((pack) => {
      const matchedDef =
        activePacks.find(
          (p) =>
            p.pack_meta.id === pack.pack_id &&
            (!pack.version || p.pack_meta.version === pack.version),
        ) ??
        activePacks.find((p) => p.pack_meta.id === pack.pack_id) ??
        DEFAULT_POLICY_PACKS.find((p) => p.pack_meta.id === pack.pack_id);

      const rulesForPack = result.triggered_rules.filter(
        (r) => r.pack_id === pack.pack_id,
      );
      const blockerCount = rulesForPack.filter(
        (r) => r.severity === 'BLOCKER',
      ).length;
      const warningCount = rulesForPack.filter(
        (r) => r.severity === 'WARNING',
      ).length;
      const totalRules = Math.max(
        matchedDef?.rules.length ?? 0,
        blockerCount + warningCount,
        pack.triggered_rule_count,
      );
      const passCount = Math.max(0, totalRules - blockerCount - warningCount);
      const safeDenominator = Math.max(1, totalRules);

      return {
        packId: pack.pack_id,
        shortCode: toShortPackCode(pack.pack_id),
        lawName: pack.law_name || matchedDef?.pack_meta.law_name || pack.pack_id,
        versionTag: pack.version
          ? `v${pack.version.replace(/^v/i, '')}`
          : '',
        layer: pack.layer,
        totalRules,
        passCount,
        warningCount,
        blockerCount,
        passPct: (passCount / safeDenominator) * 100,
        warnPct: (warningCount / safeDenominator) * 100,
        blockerPct: (blockerCount / safeDenominator) * 100,
      };
    });
  }, [applicablePacks, activePacks, result.triggered_rules]);

  const totalDenominator = Math.max(
    1,
    passedRuleCount + result.stats.warning_count + result.stats.blocker_count,
  );
  const overallPassPct = Math.round((passedRuleCount / totalDenominator) * 100);
  const overallWarnPct = Math.round(
    (result.stats.warning_count / totalDenominator) * 100,
  );
  const overallBlockerPct = Math.max(
    0,
    100 - overallPassPct - overallWarnPct,
  );

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
      subText:
        facts.legal_doc.claims_domestic_only && result.stats.drift_count > 0
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
          : !isPiiMasked &&
              (destinationCountries.length > 0 || hasVirtualTransfer)
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
      className="rounded-xl bg-[#0C0C0F] border border-white/[0.07] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] p-6 space-y-5"
    >
      {/* Top Visual Storytelling Grid: Animated Circular Score Ring + Stacked Severity Breakdown */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-6">
        {/* Left: Animated Circular Radial Progress Ring */}
        <div
          className={`shrink-0 w-32 h-32 mx-auto sm:mx-0 rounded-2xl border ${tier.borderTint} ${tier.surfaceTint} flex items-center justify-center relative`}
          role="img"
          aria-label={`데이터 주권 컴플라이언스 점수 ${passRatePercent}% (${passedRuleCount}/${totalEvaluatedRules})`}
        >
          <svg className="w-28 h-28 -rotate-90" viewBox="0 0 112 112">
            {/* Subtle outer orbital track */}
            <circle
              cx="56"
              cy="56"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-white/[0.08]"
            />
            {/* Animated radial score arc */}
            <circle
              cx="56"
              cy="56"
              r={radius}
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{ filter: tier.ringGlow }}
              className={`${tier.ringStroke} transition-[stroke-dashoffset] duration-500 ease-out`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-400">
              SCORE
            </span>
            <span
              className={`font-mono text-2xl font-bold tabular-nums leading-none mt-0.5 ${tier.accentText}`}
            >
              {animatedPassRate}%
            </span>
            <span className="text-[10px] font-mono text-zinc-400 mt-1 tabular-nums">
              {animatedPassedRules}/{totalEvaluatedRules} PASS
            </span>
          </div>
        </div>

        {/* Right: Sovereignty Status + Horizontal Stacked Severity Bar Across Active Packs */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 font-semibold ${tier.accentText}`}
                >
                  <TierIcon className="w-4 h-4 shrink-0" />
                  <span>데이터 주권 요약 · {tier.label}</span>
                </span>
                <span className="text-zinc-600" aria-hidden="true">
                  /
                </span>
                <span className="text-zinc-300 font-medium">{tier.gradeText}</span>
              </div>

              {result.stats.drift_count > 0 && (
                <span className="font-mono text-[11px] font-semibold text-cyan-300 tabular-nums">
                  DRIFT {animatedDriftCount}건
                </span>
              )}
            </div>

            <h3 className="font-display text-base sm:text-lg font-semibold text-zinc-100 leading-snug">
              {result.stats.blocker_count > 0
                ? `핵심 차단 위반 ${result.stats.blocker_count}건을 포함해 총 ${result.triggered_rules.length}건의 주권 리스크가 탐지되었습니다.`
                : result.triggered_rules.length > 0
                  ? `차단 위반은 없으나 ${result.triggered_rules.length}건의 권고·정합성 보완 항목이 확인되었습니다.`
                  : `전체 ${totalEvaluatedRules}개 점검 항목을 모두 충족하여 데이터 주권 정합성이 확보되었습니다.`}
            </h3>
          </div>

          {/* Overall Horizontal Stacked Severity Bar */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-zinc-400 font-medium">
                활성 법률 팩 통합 심각도 분포 ({applicablePacks.length}개 팩 · {totalEvaluatedRules}개 규칙)
              </span>
              <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums">
                <span className="inline-flex items-center gap-1 text-emerald-300">
                  <span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block" />
                  PASS {animatedPassedRules} ({overallPassPct}%)
                </span>
                <span className="inline-flex items-center gap-1 text-amber-300">
                  <span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" />
                  WARNING {animatedWarningCount} ({overallWarnPct}%)
                </span>
                <span className="inline-flex items-center gap-1 text-rose-300">
                  <span className="w-2 h-2 rounded-sm bg-rose-500 inline-block" />
                  BLOCKER {animatedBlockerCount} ({overallBlockerPct}%)
                </span>
              </div>
            </div>

            <div
              role="img"
              aria-label={`통합 규칙 분포: PASS ${passedRuleCount}건, WARNING ${result.stats.warning_count}건, BLOCKER ${result.stats.blocker_count}건`}
              className="h-2.5 w-full rounded-full bg-white/[0.06] overflow-hidden flex gap-px"
            >
              {passedRuleCount > 0 && (
                <div
                  className="h-full bg-emerald-400 transition-all duration-500"
                  style={{
                    width: `${(passedRuleCount / totalDenominator) * 100}%`,
                  }}
                />
              )}
              {result.stats.warning_count > 0 && (
                <div
                  className="h-full bg-amber-400 transition-all duration-500"
                  style={{
                    width: `${(result.stats.warning_count / totalDenominator) * 100}%`,
                  }}
                />
              )}
              {result.stats.blocker_count > 0 && (
                <div
                  className="h-full bg-rose-500 transition-all duration-500"
                  style={{
                    width: `${(result.stats.blocker_count / totalDenominator) * 100}%`,
                  }}
                />
              )}
            </div>
          </div>

          {/* Per-Pack Compact Horizontal Stacked Severity Breakdown */}
          {packSeverityBreakdowns.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-2 pt-1">
              {packSeverityBreakdowns.map((pack, idx) => {
                const tooltipText = `L${pack.layer} · ${pack.lawName}${pack.versionTag ? ` (${pack.versionTag})` : ''} — PASS ${pack.passCount}, WARNING ${pack.warningCount}, BLOCKER ${pack.blockerCount}`;
                return (
                  <div
                    key={`${pack.packId}-${pack.versionTag}-${idx}`}
                    className="relative group flex items-center gap-2.5 min-w-0"
                    tabIndex={0}
                    title={tooltipText}
                    aria-label={tooltipText}
                  >
                    <span className="font-mono text-[11px] font-medium text-zinc-300 w-20 shrink-0 truncate">
                      {pack.shortCode}
                    </span>

                    <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden flex gap-px min-w-[60px]">
                      {pack.passCount > 0 && (
                        <div
                          className="h-full bg-emerald-400/90 transition-all duration-500"
                          style={{ width: `${pack.passPct}%` }}
                        />
                      )}
                      {pack.warningCount > 0 && (
                        <div
                          className="h-full bg-amber-400/95 transition-all duration-500"
                          style={{ width: `${pack.warnPct}%` }}
                        />
                      )}
                      {pack.blockerCount > 0 && (
                        <div
                          className="h-full bg-rose-500 transition-all duration-500"
                          style={{ width: `${pack.blockerPct}%` }}
                        />
                      )}
                    </div>

                    <span className="font-mono text-[10px] tabular-nums shrink-0 whitespace-nowrap text-right">
                      {pack.blockerCount === 0 && pack.warningCount === 0 ? (
                        <span className="text-emerald-300">
                          PASS {pack.passCount}/{pack.totalRules}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-emerald-300">
                            {pack.passCount}P
                          </span>
                          {pack.warningCount > 0 && (
                            <span className="text-amber-300">
                              {pack.warningCount}W
                            </span>
                          )}
                          {pack.blockerCount > 0 && (
                            <span className="text-rose-300 font-semibold">
                              {pack.blockerCount}B
                            </span>
                          )}
                        </span>
                      )}
                    </span>

                    <div
                      role="tooltip"
                      className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute left-0 bottom-full mb-2 z-30 w-max max-w-xs rounded-lg bg-[#141419] border border-white/[0.12] px-3 py-2 shadow-[0_12px_32px_rgba(0,0,0,0.75)] text-[11px] text-zinc-200"
                    >
                      <div className="font-semibold text-zinc-100">
                        {pack.lawName}
                      </div>
                      <div className="font-mono text-[10px] text-zinc-400 mt-0.5 tabular-nums">
                        L{pack.layer} · {pack.packId} · PASS {pack.passCount} ·
                        WARN {pack.warningCount} · BLOCKER {pack.blockerCount}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 4-Pillar Sovereignty Posture Grid (Hairline separated, no nested cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-white/[0.06]">
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
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                <PillarIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span>{pillar.label}</span>
              </div>
              <div className={`text-xs font-semibold ${statusColor}`}>
                {pillar.statusText}
              </div>
              <div className="text-[11px] text-zinc-500 leading-snug">
                {pillar.subText}
              </div>
            </div>
          );
        })}
      </div>

      {/* Highlighted Core Violations */}
      {prioritizedViolations.length > 0 && (
        <div className="pt-4 border-t border-white/[0.06] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-zinc-200">
              핵심 위반 사항 하이라이트
            </h4>
            <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
              전체 {result.triggered_rules.length}건 중 주요{' '}
              {prioritizedViolations.length}건
              {remainingViolationCount > 0
                ? ` (+${remainingViolationCount}건 Compliance Audit 탭)`
                : ''}
            </span>
          </div>

          <ul className="divide-y divide-white/[0.06]">
            {prioritizedViolations.map((rule, idx) => {
              const isBlocker = rule.severity === 'BLOCKER';
              return (
                <li
                  key={`${rule.pack_id}-${rule.rule_id}-${idx}`}
                  className="py-3 first:pt-1 last:pb-0 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2"
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
                          <span className="text-zinc-600" aria-hidden="true">
                            ·
                          </span>
                          <span className="font-mono text-[11px] font-semibold text-cyan-300">
                            POLICY-INFRA DRIFT
                          </span>
                        </>
                      )}
                      <span className="text-zinc-600" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-mono text-[11px] text-zinc-400">
                        Layer {rule.layer} · {rule.article_citation}
                      </span>
                    </div>

                    <div className="text-xs sm:text-sm font-medium text-zinc-100 leading-snug">
                      {rule.plain_title}
                    </div>

                    {rule.has_drift && rule.drift_summary && (
                      <div className="text-[11px] text-cyan-200/85 leading-relaxed">
                        {rule.drift_summary}
                      </div>
                    )}
                  </div>

                  <span className="shrink-0 font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                    {toShortPackCode(rule.pack_id)}
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
