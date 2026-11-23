import React, { useState } from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  Cloud,
  Globe,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { STACK_BUILDER_REGIONS } from '@/lib/dependency-scanner';
import type { CanonicalFactModel, EvaluationResult } from '@/lib/types';

interface BorderTopologyMapProps {
  facts: CanonicalFactModel;
  result: EvaluationResult;
  selectedRegionIds?: string[];
}

type StageKey = 'subjects' | 'security' | 'storage' | 'egress';

export function BorderTopologyMap({
  facts,
  result,
  selectedRegionIds = [],
}: BorderTopologyMapProps) {
  const [selectedStage, setSelectedStage] = useState<StageKey>('egress');

  const activeVendors = facts.transfers.detected_vendors.filter(
    (v) => (v.includes_pii ?? v.sends_pii) !== false,
  );
  const excludedCount = facts.transfers.detected_vendors.filter(
    (v) => (v.includes_pii ?? v.sends_pii) === false,
  ).length;

  const hasVirtualTransfer =
    facts.transfers.virtual_transfer.foreign_iam_access ||
    facts.transfers.virtual_transfer.foreign_kms_control;
  const encryptionWeak =
    !facts.security.encryption_in_transit || !facts.security.encryption_at_rest;
  const hasCrossBorder =
    result.stats.active_destination_countries.length > 0 || hasVirtualTransfer;

  const isDenied = result.verdict === 'DENIED';
  const isDriftOrWarn =
    result.verdict === 'DRIFT_DETECTED' || result.verdict === 'CONDITIONAL';

  const crossBorderStroke =
    isDenied || hasVirtualTransfer
      ? '#f43f5e'
      : isDriftOrWarn
        ? '#fbbf24'
        : '#34d399';

  const domesticStroke = encryptionWeak ? '#f43f5e' : '#38bdf8';

  const regionLabels =
    selectedRegionIds.length > 0
      ? selectedRegionIds
          .map((id) => STACK_BUILDER_REGIONS.find((r) => r.id === id))
          .filter((r): r is NonNullable<typeof r> => Boolean(r))
          .map((r) => `${r.provider} ${r.regionCode} (${r.countryCode})`)
      : [
          facts.workspace.business_country === 'KR'
            ? 'ap-northeast-2 (KR)'
            : `${facts.workspace.business_country} Primary`,
        ];

  const foreignRegions = result.stats.active_destination_countries.filter(
    (c) => c !== facts.workspace.business_country,
  );

  return (
    <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-slate-100">
            출입국 데이터 이동 경로 토폴로지 맵 (4-Stage Border Map)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            정보주체 → 암호화 게이트 → 클라우드 스토리지 → 외부 SaaS·해외 IAM 열람 경로를 추적합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-emerald-400 inline-block" />
            정상 경로
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-amber-400 inline-block" />
            Drift · 주의
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-rose-500 inline-block" />
            차단 · 가상 국외 이전
          </span>
        </div>
      </div>

      {/* Pure SVG Interactive Topology Graph */}
      <div className="rounded-xl border border-slate-800 bg-[#060913] p-4 overflow-x-auto">
        <svg
          viewBox="0 0 1120 320"
          className="w-full min-w-[820px] h-auto select-none"
          role="img"
          aria-label="4단계 데이터 주권 출입국 이동 경로 토폴로지 그래프"
        >
          <defs>
            <marker
              id="arrow-domestic"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill={domesticStroke} />
            </marker>
            <marker
              id="arrow-border"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill={crossBorderStroke} />
            </marker>
          </defs>

          {/* Subtle Background Grid */}
          <rect x="0" y="0" width="1120" height="320" fill="#060913" rx="8" />

          {/* National Border Zone Divider centered in the 144px gap between Stage 3 (x=670) and Stage 4 (x=814) */}
          <line
            x1="742"
            y1="22"
            x2="742"
            y2="296"
            stroke={hasCrossBorder ? crossBorderStroke : '#334155'}
            strokeWidth="1.5"
            strokeDasharray="5 5"
            opacity="0.7"
          />
          <rect
            x="676"
            y="14"
            width="132"
            height="24"
            rx="4"
            fill="#0B1120"
            stroke={hasCrossBorder ? crossBorderStroke : '#334155'}
            strokeWidth="1"
          />
          <text
            x="742"
            y="30"
            textAnchor="middle"
            fill={hasCrossBorder ? crossBorderStroke : '#94a3b8'}
            fontSize="10"
            fontFamily="JetBrains Mono, monospace"
            fontWeight="600"
          >
            출입국 심사 게이트
          </text>

          {/* Connector 1 -> 2 */}
          <path
            id="path-1-2"
            d="M 204 135 L 254 135"
            fill="none"
            stroke={domesticStroke}
            strokeWidth="2"
            markerEnd="url(#arrow-domestic)"
          />
          <circle r="3.5" fill={domesticStroke} className="motion-reduce-hidden">
            <animateMotion dur="2s" repeatCount="indefinite" path="M 204 135 L 252 135" />
          </circle>

          {/* Connector 2 -> 3 */}
          <path
            id="path-2-3"
            d="M 434 135 L 484 135"
            fill="none"
            stroke={domesticStroke}
            strokeWidth="2"
            markerEnd="url(#arrow-domestic)"
          />
          <circle r="3.5" fill={domesticStroke} className="motion-reduce-hidden">
            <animateMotion dur="2s" repeatCount="indefinite" path="M 434 135 L 482 135" />
          </circle>

          {/* Connector 3 -> 4 (Cross-border API / Storage Egress) */}
          <path
            id="path-3-4-top"
            d="M 670 118 C 706 118, 778 96, 814 96"
            fill="none"
            stroke={hasCrossBorder ? crossBorderStroke : '#334155'}
            strokeWidth="2.2"
            strokeDasharray={hasCrossBorder ? '6 4' : undefined}
            markerEnd="url(#arrow-border)"
          />
          {hasCrossBorder && (
            <circle r="4" fill={crossBorderStroke} className="motion-reduce-hidden">
              <animateMotion
                dur="1.8s"
                repeatCount="indefinite"
                path="M 670 118 C 706 118, 778 96, 812 96"
              />
            </circle>
          )}

          {/* Virtual Transfer Path (IAM / KMS remote access from abroad) */}
          <path
            id="path-3-4-virtual"
            d="M 670 158 C 712 158, 772 224, 814 224"
            fill="none"
            stroke={hasVirtualTransfer ? '#f43f5e' : '#1e293b'}
            strokeWidth={hasVirtualTransfer ? '2.2' : '1.5'}
            strokeDasharray="4 4"
            markerEnd="url(#arrow-border)"
          />
          {hasVirtualTransfer && (
            <circle r="4" fill="#f43f5e" className="motion-reduce-hidden">
              <animateMotion
                dur="1.4s"
                repeatCount="indefinite"
                path="M 670 158 C 712 158, 772 224, 812 224"
              />
            </circle>
          )}

          {/* Stage 1 Node: Data Subjects */}
          <g
            onClick={() => setSelectedStage('subjects')}
            className="cursor-pointer"
          >
            <rect
              x="24"
              y="72"
              width="180"
              height="126"
              rx="10"
              fill={selectedStage === 'subjects' ? '#0F1B33' : '#0B1120'}
              stroke={selectedStage === 'subjects' ? '#38bdf8' : '#1e293b'}
              strokeWidth="1.5"
            />
            <text
              x="40"
              y="97"
              fill="#94a3b8"
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
            >
              01 · 정보주체
            </text>
            <text
              x="40"
              y="120"
              fill="#f1f5f9"
              fontSize="13"
              fontWeight="600"
            >
              Data Subjects
            </text>
            <text
              x="40"
              y="146"
              fill="#38bdf8"
              fontSize="12"
              fontFamily="JetBrains Mono, monospace"
              fontWeight="600"
            >
              {facts.workspace.data_subject_countries.join(' · ')}
            </text>
            <text x="40" y="170" fill="#94a3b8" fontSize="10.5">
              사업자: {facts.workspace.business_country} ({facts.workspace.industry_domain})
            </text>
          </g>

          {/* Stage 2 Node: Security & Encryption Gate */}
          <g
            onClick={() => setSelectedStage('security')}
            className="cursor-pointer"
          >
            <rect
              x="254"
              y="72"
              width="180"
              height="126"
              rx="10"
              fill={selectedStage === 'security' ? '#0F1B33' : '#0B1120'}
              stroke={
                encryptionWeak
                  ? '#f43f5e'
                  : selectedStage === 'security'
                    ? '#38bdf8'
                    : '#1e293b'
              }
              strokeWidth="1.5"
            />
            <text
              x="270"
              y="97"
              fill="#94a3b8"
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
            >
              02 · 보안·암호화 게이트
            </text>
            <text
              x="270"
              y="120"
              fill="#f1f5f9"
              fontSize="13"
              fontWeight="600"
            >
              TLS / KMS Gate
            </text>
            <text
              x="270"
              y="145"
              fill={facts.security.encryption_in_transit ? '#34d399' : '#fb7185'}
              fontSize="10.5"
              fontFamily="JetBrains Mono, monospace"
            >
              TLS: {facts.security.encryption_in_transit ? 'ON' : 'OFF (BLOCKER)'}
            </text>
            <text
              x="270"
              y="163"
              fill={facts.security.encryption_at_rest ? '#34d399' : '#fb7185'}
              fontSize="10.5"
              fontFamily="JetBrains Mono, monospace"
            >
              AES/KMS: {facts.security.encryption_at_rest ? 'ON' : 'OFF (BLOCKER)'}
            </text>
            <text
              x="270"
              y="181"
              fill={facts.security.pii_masked_before_transfer ? '#34d399' : '#fbbf24'}
              fontSize="10.5"
              fontFamily="JetBrains Mono, monospace"
            >
              PII Masking: {facts.security.pii_masked_before_transfer ? 'YES' : 'NO'}
            </text>
          </g>

          {/* Stage 3 Node: Cloud Storage */}
          <g
            onClick={() => setSelectedStage('storage')}
            className="cursor-pointer"
          >
            <rect
              x="484"
              y="72"
              width="186"
              height="126"
              rx="10"
              fill={selectedStage === 'storage' ? '#0F1B33' : '#0B1120'}
              stroke={selectedStage === 'storage' ? '#38bdf8' : '#1e293b'}
              strokeWidth="1.5"
            />
            <text
              x="498"
              y="97"
              fill="#94a3b8"
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
            >
              03 · 클라우드 스토리지
            </text>
            <text
              x="498"
              y="120"
              fill="#f1f5f9"
              fontSize="13"
              fontWeight="600"
            >
              Primary Infra
            </text>
            <text
              x="498"
              y="144"
              fill="#cbd5e1"
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
            >
              {regionLabels[0] || 'ap-northeast-2'}
            </text>
            {regionLabels.length > 1 && (
              <text
                x="498"
                y="161"
                fill="#fbbf24"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                <title>{regionLabels.join(', ')}</title>
                {(() => {
                  const extra = regionLabels
                    .slice(1)
                    .map((l) => l.split(' ')[0])
                    .join(', ');
                  const text = `+${regionLabels.length - 1} (${extra})`;
                  return text.length > 26 ? `${text.slice(0, 25)}…` : text;
                })()}
              </text>
            )}
            <text x="498" y="182" fill="#94a3b8" fontSize="10.5">
              {foreignRegions.length > 0
                ? `해외 리전 포함 (${foreignRegions.join(', ')})`
                : '국내 리전 중심 구성'}
            </text>
          </g>

          {/* Checkpoint Gate Badge centered cleanly on the Border Line (x=742, y=107) */}
          <circle
            cx="742"
            cy="107"
            r="13"
            fill="#0B1120"
            stroke={hasCrossBorder ? crossBorderStroke : '#334155'}
            strokeWidth="2"
          />
          <text
            x="742"
            y="111"
            textAnchor="middle"
            fill={hasCrossBorder ? crossBorderStroke : '#94a3b8'}
            fontSize="10"
            fontFamily="JetBrains Mono, monospace"
            fontWeight="700"
          >
            {isDenied ? 'X' : isDriftOrWarn ? '!' : 'OK'}
          </text>

          {/* Stage 4A Node: External SaaS API */}
          <g
            onClick={() => setSelectedStage('egress')}
            className="cursor-pointer"
          >
            <rect
              x="814"
              y="42"
              width="282"
              height="122"
              rx="10"
              fill={selectedStage === 'egress' ? '#0F1B33' : '#0B1120'}
              stroke={
                activeVendors.length > 0 ? crossBorderStroke : '#1e293b'
              }
              strokeWidth="1.5"
            />
            <text
              x="830"
              y="64"
              fill="#94a3b8"
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
            >
              04A · 외부 SaaS API (PII)
            </text>
            <text
              x="830"
              y="86"
              fill="#f1f5f9"
              fontSize="13"
              fontWeight="600"
            >
              {activeVendors.length > 0
                ? `${activeVendors.length}개 벤더 활성`
                : '외부 PII 전송 없음'}
            </text>
            <text
              x="830"
              y="107"
              fill="#cbd5e1"
              fontSize="10.5"
              fontFamily="JetBrains Mono, monospace"
            >
              {activeVendors.length > 0
                ? `${activeVendors[0].sdk} (${activeVendors[0].data_residency_country || activeVendors[0].country})`.slice(0, 34)
                : '국내 단독 처리'}
            </text>
            {activeVendors.length > 1 && (
              <text
                x="830"
                y="124"
                fill="#cbd5e1"
                fontSize="10.5"
                fontFamily="JetBrains Mono, monospace"
              >
                {`${activeVendors[1].sdk} (${activeVendors[1].data_residency_country || activeVendors[1].country})`.slice(0, 34)}
              </text>
            )}
            <text x="830" y="148" fill="#94a3b8" fontSize="10">
              {activeVendors.length > 2
                ? `외 +${activeVendors.length - 2}종 · 비PII 제외 ${excludedCount}종`
                : `비PII 제외 벤더: ${excludedCount}종`}
            </text>
          </g>

          {/* Stage 4B Node: Virtual Cross-Border Transfer (Foreign IAM / KMS) */}
          <g
            onClick={() => setSelectedStage('egress')}
            className="cursor-pointer"
          >
            <rect
              x="814"
              y="180"
              width="282"
              height="94"
              rx="10"
              fill={hasVirtualTransfer ? '#240b15' : '#0B1120'}
              stroke={hasVirtualTransfer ? '#f43f5e' : '#1e293b'}
              strokeWidth="1.5"
            />
            <text
              x="830"
              y="203"
              fill={hasVirtualTransfer ? '#fda4af' : '#94a3b8'}
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
            >
              04B · 가상 국외 이전 노드
            </text>
            <text
              x="830"
              y="225"
              fill={hasVirtualTransfer ? '#fecdd3' : '#cbd5e1'}
              fontSize="12"
              fontWeight="600"
            >
              {hasVirtualTransfer
                ? '해외 원격 열람 · KMS 통제 적발'
                : '가상 국외 이전 없음'}
            </text>
            <text
              x="830"
              y="247"
              fill={hasVirtualTransfer ? '#fda4af' : '#64748b'}
              fontSize="10.5"
              fontFamily="JetBrains Mono, monospace"
            >
              IAM: {facts.transfers.virtual_transfer.foreign_iam_access ? 'FOREIGN' : 'LOCAL'} · KMS:{' '}
              {facts.transfers.virtual_transfer.foreign_kms_control ? 'FOREIGN' : 'LOCAL'}
            </text>
          </g>
        </svg>
      </div>

      {/* Layer 2 Destination Country Risk Badges */}
      {result.applied_country_risks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {result.applied_country_risks.map((risk) => {
            const isHighOrCrit =
              risk.profile.risk_level === 'CRITICAL' ||
              risk.profile.risk_level === 'HIGH';
            return (
              <div
                key={risk.country_code}
                className={`rounded-lg border px-3.5 py-2.5 text-xs ${
                  isHighOrCrit
                    ? 'border-amber-800/70 bg-amber-950/20'
                    : 'border-slate-800 bg-[#060913]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-slate-100 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-sky-400" />
                    {risk.country_code}: {risk.profile.framework_id}
                  </span>
                  <span
                    className={`font-mono font-semibold ${
                      risk.profile.risk_level === 'CRITICAL'
                        ? 'text-rose-300'
                        : risk.profile.risk_level === 'HIGH'
                          ? 'text-amber-300'
                          : 'text-emerald-300'
                    }`}
                  >
                    {risk.profile.risk_level}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 truncate">
                  {risk.profile.framework_name}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected Node Inspector Strip */}
      <div className="rounded-lg border border-slate-800 bg-[#060913] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
        {selectedStage === 'subjects' && (
          <div className="flex items-center gap-2.5 text-slate-300">
            <Users className="w-4 h-4 text-sky-400 shrink-0" />
            <span>
              <strong>정보주체 관할권:</strong> {facts.workspace.data_subject_countries.join(', ')} ·{' '}
              사업자 소재지 {facts.workspace.business_country} 기준 Layer 1 본체 법률이 적용됩니다.
            </span>
          </div>
        )}
        {selectedStage === 'security' && (
          <div className="flex items-center gap-2.5 text-slate-300">
            <Lock className="w-4 h-4 text-sky-400 shrink-0" />
            <span>
              <strong>기술적 보호조치:</strong> 전송 암호화(
              {facts.security.encryption_in_transit ? '적용' : '미적용'}), 저장 암호화(
              {facts.security.encryption_at_rest ? '적용' : '미적용'}), 사전 PII 마스킹(
              {facts.security.pii_masked_before_transfer ? '적용' : '미적용'}).
            </span>
          </div>
        )}
        {selectedStage === 'storage' && (
          <div className="flex items-center gap-2.5 text-slate-300">
            <Cloud className="w-4 h-4 text-sky-400 shrink-0" />
            <span>
              <strong>스토리지 리전:</strong> {regionLabels.join(' · ')}
            </span>
          </div>
        )}
        {selectedStage === 'egress' && (
          <div className="flex items-center gap-2.5 text-slate-300">
            {hasVirtualTransfer || isDenied ? (
              <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
            ) : isDriftOrWarn ? (
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>
              <strong>외부 반출 경로:</strong> 활성 PII 벤더 {activeVendors.length}종 (
              {activeVendors.map((v) => `${v.name} [${v.transfer_purpose}]`).join(', ') || '없음'})
              {hasVirtualTransfer
                ? ' · 물리적 리전과 무관하게 해외 IAM/KMS 가상 국외 이전이 감지되었습니다.'
                : ''}
            </span>
          </div>
        )}
        <span className="text-[11px] text-slate-500 whitespace-nowrap shrink-0 flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          노드를 클릭해 단계별 상세 확인
        </span>
      </div>
    </section>
  );
}
