import React, { useMemo, useState } from 'react';
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

interface GeoRegionNode {
  code: string;
  label: string;
  subLabel: string;
  x: number;
  y: number;
  labelDx: number;
  labelDy: number;
  labelAnchor: 'start' | 'middle' | 'end';
}

// 70x22 minimalist dot-matrix world map aligned to viewBox 1120x236
// x = 70 + col * 14, y = 24 + row * 9
const WORLD_DOT_MATRIX_ROWS = [
  '.....................#####............................................',
  '...................#######.........###................................',
  '..############....######.........######......##################.......',
  '.###############..####........###########..########################...',
  '..###############............############.##########################..',
  '...#############............#############.###########################.',
  '....###########.............########################################..',
  '.....#########...............############..#########################..',
  '......#######................###########....#######################...',
  '.......#####..................#########......################..#..#...',
  '........####...................#######........#########.#####..#..#...',
  '.........##....................########........#######...###..........',
  '..........##..####.............#########........#####....##...........',
  '.............#######...........##########........###......##..........',
  '.............########...........########..................###.#.......',
  '.............########...........#######....................##.###.....',
  '..............#######............#####.......................#........',
  '..............######.............#####....................######......',
  '...............####...............###....................########.....',
  '...............###.......................................########.....',
  '................#.........................................######......',
  '......................................................................',
];

const GEO_REGION_NODES: Record<string, GeoRegionNode> = {
  KR: {
    code: 'KR',
    label: 'KR (Seoul)',
    subLabel: 'ICN Core Hub',
    x: 938,
    y: 105,
    labelDx: 0,
    labelDy: 24,
    labelAnchor: 'middle',
  },
  US: {
    code: 'US',
    label: 'US',
    subLabel: 'US-East / SaaS',
    x: 238,
    y: 96,
    labelDx: 0,
    labelDy: 24,
    labelAnchor: 'middle',
  },
  EU: {
    code: 'EU',
    label: 'EU',
    subLabel: 'Frankfurt / EEA',
    x: 546,
    y: 78,
    labelDx: 0,
    labelDy: 24,
    labelAnchor: 'middle',
  },
  CN: {
    code: 'CN',
    label: 'CN',
    subLabel: 'Beijing / Shanghai',
    x: 840,
    y: 105,
    labelDx: -12,
    labelDy: 24,
    labelAnchor: 'end',
  },
  JP: {
    code: 'JP',
    label: 'JP',
    subLabel: 'Tokyo / AP-NE1',
    x: 1008,
    y: 105,
    labelDx: 10,
    labelDy: 24,
    labelAnchor: 'start',
  },
  GB: {
    code: 'GB',
    label: 'GB',
    subLabel: 'London / UK',
    x: 490,
    y: 69,
    labelDx: -10,
    labelDy: 22,
    labelAnchor: 'end',
  },
  SG: {
    code: 'SG',
    label: 'SG',
    subLabel: 'Singapore',
    x: 868,
    y: 159,
    labelDx: 0,
    labelDy: 22,
    labelAnchor: 'middle',
  },
};

function buildArcGeometry(origin: GeoRegionNode, dest: GeoRegionNode) {
  const dx = dest.x - origin.x;
  const dist = Math.abs(dx);
  const archHeight =
    origin.code === dest.code
      ? 24
      : Math.min(112, Math.max(40, dist * 0.175));
  const midX = (origin.x + dest.x) / 2;
  const minY = Math.min(origin.y, dest.y);
  const ctrlY = Math.max(-18, minY - archHeight);
  const path = `M ${origin.x} ${origin.y} Q ${midX} ${ctrlY}, ${dest.x} ${dest.y}`;
  // Exact quadratic Bezier midpoint at t = 0.5
  const shieldX = 0.25 * origin.x + 0.5 * midX + 0.25 * dest.x;
  const shieldY = 0.25 * origin.y + 0.5 * ctrlY + 0.25 * dest.y;
  return { path, shieldX, shieldY };
}

export function BorderTopologyMap({
  facts,
  result,
  selectedRegionIds = [],
}: BorderTopologyMapProps) {
  const [selectedStage, setSelectedStage] = useState<StageKey>('egress');
  const [selectedCorridor, setSelectedCorridor] = useState<string | null>(null);

  const worldMapDotPath = useMemo(() => {
    const segments: string[] = [];
    for (let r = 0; r < WORLD_DOT_MATRIX_ROWS.length; r += 1) {
      const row = WORLD_DOT_MATRIX_ROWS[r];
      const cy = 24 + r * 9;
      for (let c = 0; c < row.length; c += 1) {
        if (row[c] === '#') {
          const cx = 70 + c * 14;
          segments.push(
            `M ${cx} ${cy} m -1.45,0 a 1.45,1.45 0 1,0 2.9,0 a 1.45,1.45 0 1,0 -2.9,0`,
          );
        }
      }
    }
    return segments.join(' ');
  }, []);

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

  const businessCountry = facts.workspace.business_country.toUpperCase();
  const originCountry = GEO_REGION_NODES[businessCountry]
    ? businessCountry
    : 'KR';
  const originNode = GEO_REGION_NODES[originCountry];

  const regionCountries = selectedRegionIds
    .map((id) => STACK_BUILDER_REGIONS.find((r) => r.id === id)?.countryCode)
    .filter((code): code is string => Boolean(code))
    .map((c) => c.toUpperCase());

  const activeDestSet = new Set<string>(
    [
      ...result.stats.active_destination_countries,
      ...activeVendors.map((v) =>
        (v.data_residency_country || v.country).toUpperCase(),
      ),
      ...regionCountries,
    ].filter((c) => c && c !== originCountry),
  );

  if (hasVirtualTransfer && originCountry !== 'US') {
    activeDestSet.add('US');
  }

  const baseCorridorCodes = ['US', 'EU', 'JP', 'CN'].filter(
    (c) => c !== originCountry,
  );
  const extraCorridorCodes = Array.from(activeDestSet).filter(
    (c) => !baseCorridorCodes.includes(c) && Boolean(GEO_REGION_NODES[c]),
  );
  const geoCorridorCodes = [...baseCorridorCodes, ...extraCorridorCodes];

  const disclosedCountriesUpper = facts.legal_doc.disclosed_countries.map((c) =>
    c.toUpperCase(),
  );

  const isDenied = result.verdict === 'DENIED';

  const corridorEvaluations = geoCorridorCodes.map((code) => {
    const destNode = GEO_REGION_NODES[code];
    const vendorsInCountry = activeVendors.filter(
      (v) => (v.data_residency_country || v.country).toUpperCase() === code,
    );
    const hasRegionInCountry = regionCountries.includes(code);
    const isVirtualUsCorridor = code === 'US' && hasVirtualTransfer;
    const isActive =
      activeDestSet.has(code) ||
      vendorsInCountry.length > 0 ||
      hasRegionInCountry ||
      isVirtualUsCorridor;

    const undisclosedCountry =
      isActive &&
      (!facts.legal_doc.exists ||
        facts.legal_doc.claims_domestic_only ||
        !disclosedCountriesUpper.includes(code));

    const hasDriftForCountry =
      isActive &&
      result.detected_drifts.some((drift) => {
        if (
          drift.drift_type === 'DOMESTIC_CLAIM_CONTRADICTION' ||
          drift.drift_type === 'UNDISCLOSED_COUNTRY'
        ) {
          return true;
        }
        if (
          drift.drift_type === 'VIRTUAL_TRANSFER_OMISSION' &&
          isVirtualUsCorridor
        ) {
          return true;
        }
        if (Array.isArray(drift.fact_value)) {
          return drift.fact_value.some(
            (v) => String(v).toUpperCase() === code,
          );
        }
        return false;
      });

    const hasCountryBlocker =
      isActive &&
      (encryptionWeak ||
        isVirtualUsCorridor ||
        undisclosedCountry ||
        hasDriftForCountry ||
        (isDenied &&
          result.triggered_rules.some(
            (r) =>
              r.severity === 'BLOCKER' &&
              (r.country_code === code ||
                r.country_code === businessCountry ||
                r.pack_id.includes(code)),
          )));

    const status: 'VIOLATING' | 'COMPLIANT' | 'STANDBY' = !isActive
      ? 'STANDBY'
      : hasCountryBlocker
        ? 'VIOLATING'
        : 'COMPLIANT';

    const { path, shieldX, shieldY } = buildArcGeometry(originNode, destNode);

    return {
      code,
      node: destNode,
      status,
      isActive,
      vendorsInCountry,
      isVirtualUsCorridor,
      undisclosedCountry,
      path,
      shieldX,
      shieldY,
    };
  });

  const activeCorridorList = corridorEvaluations.filter((c) => c.isActive);
  const violatingCorridorCount = corridorEvaluations.filter(
    (c) => c.status === 'VIOLATING',
  ).length;
  const selectedCorridorInfo = corridorEvaluations.find(
    (c) => c.code === selectedCorridor,
  );

  const isGateBlocked =
    isDenied ||
    hasVirtualTransfer ||
    result.stats.blocker_count > 0 ||
    violatingCorridorCount > 0;
  const isDriftOrWarn =
    !isGateBlocked &&
    (result.verdict === 'DRIFT_DETECTED' ||
      result.verdict === 'CONDITIONAL' ||
      result.stats.warning_count > 0);

  const crossBorderStroke = isGateBlocked
    ? '#F43F5E'
    : isDriftOrWarn
      ? '#FBBF24'
      : '#34D399';

  const domesticStroke = encryptionWeak ? '#F43F5E' : '#38BDF8';
  const stage3to4Compliant = hasCrossBorder && !isGateBlocked && !isDriftOrWarn;

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
  const storageHasViolation = regionCountries.some(
    (c) =>
      c !== originCountry &&
      corridorEvaluations.some(
        (ce) => ce.code === c && ce.status === 'VIOLATING',
      ),
  );

  // Status pills for 04A & 04B
  const hasVendorCorridorViolation = activeVendors.some((v) => {
    const dest = (v.data_residency_country || v.country).toUpperCase();
    return corridorEvaluations.some(
      (ce) => ce.code === dest && ce.status === 'VIOLATING',
    );
  });
  const hasVendorDrift =
    isDriftOrWarn ||
    result.detected_drifts.some((d) => d.drift_type === 'UNDISCLOSED_VENDOR');
  const node04ABlocked =
    activeVendors.length > 0 &&
    (isDenied || result.stats.blocker_count > 0 || hasVendorCorridorViolation);
  const node04ADrift =
    !node04ABlocked && activeVendors.length > 0 && hasVendorDrift;
  const node04APill = node04ABlocked
    ? {
        label: 'BLOCKED',
        fill: 'rgba(244, 63, 94, 0.14)',
        stroke: 'rgba(244, 63, 94, 0.55)',
        text: '#FDA4AF',
      }
    : node04ADrift
      ? {
          label: 'DRIFT',
          fill: 'rgba(251, 191, 36, 0.12)',
          stroke: 'rgba(251, 191, 36, 0.5)',
          text: '#FCD34D',
        }
      : {
          label: activeVendors.length > 0 ? 'VERIFIED' : 'DOMESTIC',
          fill: 'rgba(52, 211, 153, 0.12)',
          stroke: 'rgba(52, 211, 153, 0.4)',
          text: '#6EE7B7',
        };

  const node04BPill = hasVirtualTransfer
    ? {
        label: 'BLOCKED',
        fill: 'rgba(244, 63, 94, 0.14)',
        stroke: 'rgba(244, 63, 94, 0.55)',
        text: '#FDA4AF',
      }
    : {
        label: 'ISOLATED',
        fill: 'rgba(52, 211, 153, 0.1)',
        stroke: 'rgba(52, 211, 153, 0.35)',
        text: '#6EE7B7',
      };

  const getCardStroke = (stage: StageKey, isAlert: boolean) => {
    if (isAlert) return '#F43F5E';
    if (selectedStage === stage && !selectedCorridor) return '#38BDF8';
    return 'rgba(255, 255, 255, 0.1)';
  };

  return (
    <section className="rounded-xl border border-white/[0.07] bg-[#0C0C0F] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-zinc-100">
            글로벌 데이터 이전 경로 &amp; 출입국 토폴로지 맵 (Geo-Arc &amp; 4-Stage Border Map)
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            {originNode.label} 출발 국외 데이터 아크(US · EU · JP · CN)와 4단계 보안·출입국 심사 게이트를 실시간 추적합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-gradient-to-r from-cyan-400 to-emerald-400 inline-block" />
            적법·승인 이전 아크
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t border-dashed border-rose-500 inline-block" />
            위반·차단 아크 (Shield X)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-amber-400 inline-block" />
            Drift · 주의
          </span>
        </div>
      </div>

      {/* Unified Geo-Arc World Map + Interactive Topology Canvas */}
      <div
        className="rounded-xl border border-white/[0.07] bg-[#06080D] p-4 overflow-x-auto relative"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      >
        <svg
          viewBox="0 0 1120 556"
          className="w-full min-w-[820px] h-auto select-none"
          role="img"
          aria-label="글로벌 Geo-Arc 국외 이전 지도 및 4단계 데이터 주권 출입국 토폴로지 그래프"
        >
          <defs>
            <linearGradient id="geo-arc-compliant" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="100%" stopColor="#34D399" />
            </linearGradient>
            <radialGradient id="geo-hub-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
            </radialGradient>
            <filter id="cyan-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2.8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="rose-glow" x="-25%" y="-25%" width="150%" height="150%">
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="5"
                floodColor="#F43F5E"
                floodOpacity="0.48"
              />
            </filter>
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
              <path
                d="M 0 1 L 10 5 L 0 9 z"
                fill={hasCrossBorder ? crossBorderStroke : '#52525B'}
              />
            </marker>
          </defs>

          {/* ================= LAYER A: DOT-MATRIX WORLD MAP & GEO-ARCS ================= */}
          <g aria-label="글로벌 Geo-Arc 국외 이전 지도">
            {/* Minimalist Dot-Matrix World Map Backdrop */}
            <path d={worldMapDotPath} fill="rgba(255, 255, 255, 0.2)" />

            {/* Subtle Latitude Reference Lines */}
            <line
              x1="48"
              y1="105"
              x2="1072"
              y2="105"
              stroke="rgba(255,255,255,0.04)"
              strokeDasharray="3 6"
            />
            <line
              x1="48"
              y1="159"
              x2="1072"
              y2="159"
              stroke="rgba(255,255,255,0.035)"
              strokeDasharray="3 6"
            />

            {/* Top-left Geo-Corridor Summary Readout */}
            <g transform="translate(26, 18)">
              <rect
                x="0"
                y="0"
                width="264"
                height="24"
                rx="6"
                fill="#0C0C0F"
                fillOpacity="0.88"
                stroke="rgba(255,255,255,0.09)"
              />
              <text
                x="11"
                y="15.5"
                fill="#A1A1AA"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                GEO CORRIDOR · {originNode.label}
              </text>
              <text
                x="253"
                y="15.5"
                textAnchor="end"
                fill={
                  violatingCorridorCount > 0
                    ? '#FDA4AF'
                    : activeCorridorList.length > 0
                      ? '#6EE7B7'
                      : '#71717A'
                }
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="600"
              >
                {violatingCorridorCount > 0
                  ? `${violatingCorridorCount} BLOCKED`
                  : activeCorridorList.length > 0
                    ? `${activeCorridorList.length} VERIFIED`
                    : 'DOMESTIC'}
              </text>
            </g>

            {/* Curved Geo-Arcs: Standby -> Compliant -> Violating */}
            {corridorEvaluations.map((corridor) => {
              if (corridor.status === 'STANDBY') {
                return (
                  <path
                    key={`arc-standby-${corridor.code}`}
                    d={corridor.path}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.08)"
                    strokeWidth="1.2"
                    strokeDasharray="3 5"
                  />
                );
              }

              if (corridor.status === 'COMPLIANT') {
                return (
                  <g key={`arc-compliant-${corridor.code}`}>
                    <path
                      d={corridor.path}
                      fill="none"
                      stroke="#34D399"
                      strokeOpacity="0.22"
                      strokeWidth="4.5"
                      filter="url(#cyan-glow)"
                    />
                    <path
                      d={corridor.path}
                      fill="none"
                      stroke="url(#geo-arc-compliant)"
                      strokeWidth="2.1"
                      strokeDasharray="7 5"
                      className="animate-data-flow"
                      filter="url(#cyan-glow)"
                    />
                    <circle
                      r="3.4"
                      fill="#6EE7B7"
                      filter="url(#cyan-glow)"
                      className="motion-reduce-hidden"
                    >
                      <animateMotion
                        dur="2.1s"
                        repeatCount="indefinite"
                        path={corridor.path}
                      />
                    </circle>
                  </g>
                );
              }

              // Violating Arc: pulsing dashed crimson + glowing border shield X at midpoint
              return (
                <g key={`arc-violating-${corridor.code}`}>
                  <path
                    d={corridor.path}
                    fill="none"
                    stroke="#F43F5E"
                    strokeOpacity="0.24"
                    strokeWidth="5"
                    filter="url(#rose-glow)"
                  />
                  <path
                    d={corridor.path}
                    fill="none"
                    stroke="#F43F5E"
                    strokeWidth="2.2"
                    strokeDasharray="6 5"
                    className="animate-crimson-flow"
                    filter="url(#rose-glow)"
                  />
                  {/* Shield Intercept Radar Ring */}
                  <circle
                    cx={corridor.shieldX}
                    cy={corridor.shieldY}
                    r="14"
                    fill="none"
                    stroke="#F43F5E"
                    strokeWidth="1.5"
                    className="animate-ping motion-reduce-hidden"
                    style={{
                      transformBox: 'fill-box',
                      transformOrigin: 'center',
                    }}
                  />
                  {/* Glowing Border Shield Icon with (X) */}
                  <g
                    transform={`translate(${corridor.shieldX}, ${corridor.shieldY})`}
                    filter="url(#rose-glow)"
                    onClick={() => setSelectedCorridor(corridor.code)}
                    className="cursor-pointer"
                  >
                    <path
                      d="M 0 -13 L 11 -8.5 V 0.5 C 11 7.2 6.2 12.2 0 14.2 C -6.2 12.2 -11 7.2 -11 0.5 V -8.5 Z"
                      fill="#16090E"
                      stroke="#F43F5E"
                      strokeWidth="1.75"
                    />
                    <path
                      d="M -3.8 -3.4 L 3.8 4.2 M 3.8 -3.4 L -3.8 4.2"
                      stroke="#FDA4AF"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </g>
                </g>
              );
            })}

            {/* Origin Node Pin: KR (Seoul) */}
            <g
              onClick={() => setSelectedCorridor(originNode.code)}
              className="cursor-pointer"
            >
              <circle cx={originNode.x} cy={originNode.y} r="20" fill="url(#geo-hub-glow)" />
              <circle
                cx={originNode.x}
                cy={originNode.y}
                r="10"
                fill="none"
                stroke="#38BDF8"
                strokeOpacity="0.45"
                strokeWidth="1.25"
                className="animate-ping motion-reduce-hidden"
                style={{
                  transformBox: 'fill-box',
                  transformOrigin: 'center',
                }}
              />
              <circle
                cx={originNode.x}
                cy={originNode.y}
                r="5.5"
                fill="#0C0C0F"
                stroke="#38BDF8"
                strokeWidth="2.2"
                filter="url(#cyan-glow)"
              />
              <circle cx={originNode.x} cy={originNode.y} r="2.2" fill="#38BDF8" />
              <rect
                x={originNode.x - 40}
                y={originNode.y + 12}
                width="80"
                height="18"
                rx="4"
                fill="#0C0C0F"
                fillOpacity="0.92"
                stroke={
                  selectedCorridor === originNode.code
                    ? '#38BDF8'
                    : 'rgba(56, 189, 248, 0.45)'
                }
                strokeWidth="1"
              />
              <text
                x={originNode.x}
                y={originNode.y + 24}
                textAnchor="middle"
                fill="#E0F2FE"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="700"
              >
                {originNode.label}
              </text>
            </g>

            {/* Destination Region Pins (US, EU, JP, CN + active extras) */}
            {corridorEvaluations.map((corridor) => {
              const { node, status } = corridor;
              const isSelected = selectedCorridor === corridor.code;
              const pinStroke =
                status === 'VIOLATING'
                  ? '#F43F5E'
                  : status === 'COMPLIANT'
                    ? '#34D399'
                    : 'rgba(255,255,255,0.28)';
              const pinFill =
                status === 'VIOLATING'
                  ? '#FB7185'
                  : status === 'COMPLIANT'
                    ? '#34D399'
                    : '#52525B';
              const badgeText =
                status === 'VIOLATING'
                  ? `${node.label} · BLOCKED`
                  : status === 'COMPLIANT'
                    ? `${node.label} · PASS`
                    : node.label;
              const badgeWidth = status === 'STANDBY' ? 36 : 84;
              const badgeX =
                node.labelAnchor === 'middle'
                  ? node.x - badgeWidth / 2
                  : node.labelAnchor === 'end'
                    ? node.x + node.labelDx - badgeWidth + 8
                    : node.x + node.labelDx - 8;

              return (
                <g
                  key={`pin-${corridor.code}`}
                  onClick={() => setSelectedCorridor(corridor.code)}
                  className="cursor-pointer"
                >
                  {status !== 'STANDBY' && (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r="11"
                      fill={
                        status === 'VIOLATING'
                          ? 'rgba(244,63,94,0.16)'
                          : 'rgba(52,211,153,0.16)'
                      }
                    />
                  )}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={status === 'STANDBY' ? '4' : '5.5'}
                    fill="#0C0C0F"
                    stroke={isSelected ? '#FAFAFA' : pinStroke}
                    strokeWidth={status === 'STANDBY' ? '1.4' : '2'}
                    filter={
                      status === 'VIOLATING'
                        ? 'url(#rose-glow)'
                        : status === 'COMPLIANT'
                          ? 'url(#cyan-glow)'
                          : undefined
                    }
                  />
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={status === 'STANDBY' ? '1.6' : '2.2'}
                    fill={pinFill}
                  />

                  <rect
                    x={badgeX}
                    y={node.y + node.labelDy - 12}
                    width={badgeWidth}
                    height="17"
                    rx="4"
                    fill="#0C0C0F"
                    fillOpacity="0.92"
                    stroke={
                      isSelected
                        ? '#38BDF8'
                        : status === 'VIOLATING'
                          ? 'rgba(244,63,94,0.5)'
                          : status === 'COMPLIANT'
                            ? 'rgba(52,211,153,0.45)'
                            : 'rgba(255,255,255,0.1)'
                    }
                    strokeWidth="1"
                  />
                  <text
                    x={badgeX + badgeWidth / 2}
                    y={node.y + node.labelDy - 0.5}
                    textAnchor="middle"
                    fill={
                      status === 'VIOLATING'
                        ? '#FDA4AF'
                        : status === 'COMPLIANT'
                          ? '#6EE7B7'
                          : '#71717A'
                    }
                    fontSize="9.5"
                    fontFamily="JetBrains Mono, monospace"
                    fontWeight="600"
                  >
                    {badgeText}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Hairline Separator between Geo-Arc Overlay and 4-Stage Pipeline */}
          <line
            x1="24"
            y1="234"
            x2="1096"
            y2="234"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="1"
          />

          {/* ================= LAYER B: 4-STAGE BORDER TOPOLOGY PIPELINE ================= */}
          <g transform="translate(0, 240)">
            {/* National Border Zone Divider centered between Stage 3 (x=670) and Stage 4 (x=814) */}
            <line
              x1="742"
              y1="22"
              x2="742"
              y2="296"
              stroke={
                isGateBlocked
                  ? '#F43F5E'
                  : hasCrossBorder
                    ? crossBorderStroke
                    : 'rgba(255,255,255,0.16)'
              }
              strokeWidth={isGateBlocked ? '1.75' : '1.25'}
              strokeDasharray="5 5"
              opacity={isGateBlocked ? '0.85' : '0.65'}
            />
            <rect
              x="676"
              y="14"
              width="132"
              height="24"
              rx="5"
              fill="#0C0C0F"
              stroke={
                isGateBlocked
                  ? '#F43F5E'
                  : hasCrossBorder
                    ? crossBorderStroke
                    : 'rgba(255,255,255,0.14)'
              }
              strokeWidth="1"
            />
            <text
              x="742"
              y="30"
              textAnchor="middle"
              fill={
                isGateBlocked
                  ? '#FDA4AF'
                  : hasCrossBorder
                    ? crossBorderStroke
                    : '#A1A1AA'
              }
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
              fontWeight="600"
            >
              출입국 심사 게이트
            </text>

            {/* Connector 1 -> 2 */}
            <path
              d="M 204 135 L 254 135"
              fill="none"
              stroke={domesticStroke}
              strokeOpacity="0.22"
              strokeWidth="2"
            />
            <path
              id="path-1-2"
              d="M 204 135 L 254 135"
              fill="none"
              stroke={domesticStroke}
              strokeWidth="2"
              strokeDasharray={encryptionWeak ? '5 4' : '6 6'}
              className={!encryptionWeak ? 'animate-data-flow' : undefined}
              filter={!encryptionWeak ? 'url(#cyan-glow)' : undefined}
              markerEnd="url(#arrow-domestic)"
            />
            {!encryptionWeak && (
              <circle
                r="3.2"
                fill="#38BDF8"
                filter="url(#cyan-glow)"
                className="motion-reduce-hidden"
              >
                <animateMotion
                  dur="1.6s"
                  repeatCount="indefinite"
                  path="M 204 135 L 250 135"
                />
              </circle>
            )}

            {/* Connector 2 -> 3 */}
            <path
              d="M 434 135 L 484 135"
              fill="none"
              stroke={domesticStroke}
              strokeOpacity="0.22"
              strokeWidth="2"
            />
            <path
              id="path-2-3"
              d="M 434 135 L 484 135"
              fill="none"
              stroke={domesticStroke}
              strokeWidth="2"
              strokeDasharray={encryptionWeak ? '5 4' : '6 6'}
              className={!encryptionWeak ? 'animate-data-flow' : undefined}
              filter={!encryptionWeak ? 'url(#cyan-glow)' : undefined}
              markerEnd="url(#arrow-domestic)"
            />
            {!encryptionWeak && (
              <circle
                r="3.2"
                fill="#38BDF8"
                filter="url(#cyan-glow)"
                className="motion-reduce-hidden"
              >
                <animateMotion
                  dur="1.6s"
                  repeatCount="indefinite"
                  path="M 434 135 L 480 135"
                />
              </circle>
            )}

            {/* Connector 3 -> 4 (Cross-border API / Storage Egress) */}
            <path
              d="M 670 118 C 706 118, 778 96, 814 96"
              fill="none"
              stroke={
                hasCrossBorder ? crossBorderStroke : 'rgba(255,255,255,0.12)'
              }
              strokeOpacity={hasCrossBorder ? '0.24' : '1'}
              strokeWidth="2"
            />
            <path
              id="path-3-4-top"
              d="M 670 118 C 706 118, 778 96, 814 96"
              fill="none"
              stroke={hasCrossBorder ? crossBorderStroke : '#52525B'}
              strokeWidth="2.2"
              strokeDasharray={
                isGateBlocked || isDriftOrWarn
                  ? '5 5'
                  : stage3to4Compliant
                    ? '6 6'
                    : undefined
              }
              className={stage3to4Compliant ? 'animate-data-flow' : undefined}
              filter={stage3to4Compliant ? 'url(#cyan-glow)' : undefined}
              markerEnd="url(#arrow-border)"
            />
            {hasCrossBorder && !isGateBlocked && (
              <circle
                r="3.5"
                fill={stage3to4Compliant ? '#38BDF8' : crossBorderStroke}
                filter={stage3to4Compliant ? 'url(#cyan-glow)' : undefined}
                className="motion-reduce-hidden"
              >
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
              stroke={hasVirtualTransfer ? '#F43F5E' : 'rgba(255,255,255,0.1)'}
              strokeWidth={hasVirtualTransfer ? '2.2' : '1.4'}
              strokeDasharray="5 5"
              markerEnd={hasVirtualTransfer ? 'url(#arrow-border)' : undefined}
            />
            {hasVirtualTransfer && (
              <circle
                r="3.5"
                fill="#F43F5E"
                filter="url(#rose-glow)"
                className="motion-reduce-hidden"
              >
                <animateMotion
                  dur="1.4s"
                  repeatCount="indefinite"
                  path="M 670 158 C 712 158, 772 224, 812 224"
                />
              </circle>
            )}

            {/* Stage 1 Node: Data Subjects */}
            <g
              onClick={() => {
                setSelectedCorridor(null);
                setSelectedStage('subjects');
              }}
              className="cursor-pointer"
            >
              <rect
                x="24"
                y="72"
                width="180"
                height="126"
                rx="10"
                fill="#0C0C0F"
                fillOpacity="0.92"
                stroke={getCardStroke('subjects', false)}
                strokeWidth="1.25"
              />
              <line
                x1="34"
                y1="73"
                x2="194"
                y2="73"
                stroke="rgba(255,255,255,0.09)"
                strokeWidth="1"
              />
              <text
                x="40"
                y="97"
                fill="#A1A1AA"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                01 · 정보주체
              </text>
              <text
                x="40"
                y="120"
                fill="#F4F4F5"
                fontSize="13"
                fontWeight="600"
              >
                Data Subjects
              </text>
              <text
                x="40"
                y="146"
                fill="#38BDF8"
                fontSize="12"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="600"
              >
                {facts.workspace.data_subject_countries.join(' · ')}
              </text>
              <text x="40" y="170" fill="#A1A1AA" fontSize="10.5">
                사업자: {facts.workspace.business_country} ({facts.workspace.industry_domain})
              </text>
            </g>

            {/* Stage 2 Node: Security & Encryption Gate */}
            <g
              onClick={() => {
                setSelectedCorridor(null);
                setSelectedStage('security');
              }}
              className="cursor-pointer"
            >
              <rect
                x="254"
                y="72"
                width="180"
                height="126"
                rx="10"
                fill="#0C0C0F"
                fillOpacity="0.92"
                stroke={getCardStroke('security', encryptionWeak)}
                strokeWidth="1.25"
                filter={encryptionWeak ? 'url(#rose-glow)' : undefined}
              />
              <line
                x1="264"
                y1="73"
                x2="424"
                y2="73"
                stroke="rgba(255,255,255,0.09)"
                strokeWidth="1"
              />
              <text
                x="270"
                y="97"
                fill="#A1A1AA"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                02 · 보안·암호화 게이트
              </text>
              <text
                x="270"
                y="120"
                fill="#F4F4F5"
                fontSize="13"
                fontWeight="600"
              >
                TLS / KMS Gate
              </text>
              <text
                x="270"
                y="145"
                fill={facts.security.encryption_in_transit ? '#34D399' : '#FDA4AF'}
                fontSize="10.5"
                fontFamily="JetBrains Mono, monospace"
              >
                TLS: {facts.security.encryption_in_transit ? 'ON' : 'OFF (BLOCKER)'}
              </text>
              <text
                x="270"
                y="163"
                fill={facts.security.encryption_at_rest ? '#34D399' : '#FDA4AF'}
                fontSize="10.5"
                fontFamily="JetBrains Mono, monospace"
              >
                AES/KMS: {facts.security.encryption_at_rest ? 'ON' : 'OFF (BLOCKER)'}
              </text>
              <text
                x="270"
                y="181"
                fill={
                  facts.security.pii_masked_before_transfer
                    ? '#34D399'
                    : '#FCD34D'
                }
                fontSize="10.5"
                fontFamily="JetBrains Mono, monospace"
              >
                PII Masking: {facts.security.pii_masked_before_transfer ? 'YES' : 'NO'}
              </text>
            </g>

            {/* Stage 3 Node: Cloud Storage */}
            <g
              onClick={() => {
                setSelectedCorridor(null);
                setSelectedStage('storage');
              }}
              className="cursor-pointer"
            >
              <rect
                x="484"
                y="72"
                width="186"
                height="126"
                rx="10"
                fill="#0C0C0F"
                fillOpacity="0.92"
                stroke={getCardStroke('storage', storageHasViolation)}
                strokeWidth="1.25"
                filter={storageHasViolation ? 'url(#rose-glow)' : undefined}
              />
              <line
                x1="494"
                y1="73"
                x2="660"
                y2="73"
                stroke="rgba(255,255,255,0.09)"
                strokeWidth="1"
              />
              <text
                x="498"
                y="97"
                fill="#A1A1AA"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                03 · 클라우드 스토리지
              </text>
              <text
                x="498"
                y="120"
                fill="#F4F4F5"
                fontSize="13"
                fontWeight="600"
              >
                Primary Infra
              </text>
              <text
                x="498"
                y="144"
                fill="#E4E4E7"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                {regionLabels[0] || 'ap-northeast-2'}
              </text>
              {regionLabels.length > 1 && (
                <text
                  x="498"
                  y="161"
                  fill="#FCD34D"
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
              <text x="498" y="182" fill="#A1A1AA" fontSize="10.5">
                {foreignRegions.length > 0
                  ? `해외 리전 포함 (${foreignRegions.join(', ')})`
                  : '국내 리전 중심 구성'}
              </text>
            </g>

            {/* Checkpoint Gate Badge centered cleanly on the Border Line (x=742, y=107) */}
            {(isDenied || isGateBlocked) && (
              <circle
                cx="742"
                cy="107"
                r="16"
                fill="none"
                stroke="#F43F5E"
                strokeWidth="1.75"
                className="animate-ping motion-reduce-hidden"
                style={{
                  transformBox: 'fill-box',
                  transformOrigin: 'center',
                }}
              />
            )}
            <circle
              cx="742"
              cy="107"
              r="14"
              fill="#0C0C0F"
              stroke={
                isGateBlocked
                  ? '#F43F5E'
                  : hasCrossBorder
                    ? crossBorderStroke
                    : 'rgba(255,255,255,0.2)'
              }
              strokeWidth="2"
              filter={isGateBlocked ? 'url(#rose-glow)' : undefined}
            />
            <text
              x="742"
              y="111"
              textAnchor="middle"
              fill={
                isGateBlocked
                  ? '#FDA4AF'
                  : hasCrossBorder
                    ? crossBorderStroke
                    : '#A1A1AA'
              }
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
              fontWeight="700"
            >
              {isDenied || isGateBlocked ? 'X' : isDriftOrWarn ? '!' : 'OK'}
            </text>

            {/* Stage 4A Node: External SaaS API */}
            <g
              onClick={() => {
                setSelectedCorridor(null);
                setSelectedStage('egress');
              }}
              className="cursor-pointer"
            >
              <rect
                x="814"
                y="42"
                width="282"
                height="122"
                rx="10"
                fill="#0C0C0F"
                fillOpacity="0.94"
                stroke={
                  node04ABlocked
                    ? '#F43F5E'
                    : node04ADrift
                      ? '#FBBF24'
                      : selectedStage === 'egress' && !selectedCorridor
                        ? '#38BDF8'
                        : 'rgba(255,255,255,0.1)'
                }
                strokeWidth={node04ABlocked ? '1.5' : '1.25'}
                filter={node04ABlocked ? 'url(#rose-glow)' : undefined}
              />
              <line
                x1="824"
                y1="43"
                x2="1086"
                y2="43"
                stroke="rgba(255,255,255,0.09)"
                strokeWidth="1"
              />
              <text
                x="830"
                y="64"
                fill="#A1A1AA"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                04A · 외부 SaaS API (PII)
              </text>
              <rect
                x="1016"
                y="51"
                width="66"
                height="18"
                rx="9"
                fill={node04APill.fill}
                stroke={node04APill.stroke}
                strokeWidth="1"
              />
              <text
                x="1049"
                y="63"
                textAnchor="middle"
                fill={node04APill.text}
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="600"
              >
                {node04APill.label}
              </text>
              <text
                x="830"
                y="88"
                fill="#F4F4F5"
                fontSize="13"
                fontWeight="600"
              >
                {activeVendors.length > 0
                  ? `${activeVendors.length}개 벤더 활성`
                  : '외부 PII 전송 없음'}
              </text>
              <text
                x="830"
                y="109"
                fill="#E4E4E7"
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
                  y="126"
                  fill="#E4E4E7"
                  fontSize="10.5"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {`${activeVendors[1].sdk} (${activeVendors[1].data_residency_country || activeVendors[1].country})`.slice(0, 34)}
                </text>
              )}
              <text x="830" y="149" fill="#A1A1AA" fontSize="10">
                {activeVendors.length > 2
                  ? `외 +${activeVendors.length - 2}종 · 비PII 제외 ${excludedCount}종`
                  : `비PII 제외 벤더: ${excludedCount}종`}
              </text>
            </g>

            {/* Stage 4B Node: Virtual Cross-Border Transfer */}
            <g
              onClick={() => {
                setSelectedCorridor(null);
                setSelectedStage('egress');
              }}
              className="cursor-pointer"
            >
              <rect
                x="814"
                y="180"
                width="282"
                height="94"
                rx="10"
                fill="#0C0C0F"
                fillOpacity="0.94"
                stroke={
                  hasVirtualTransfer
                    ? '#F43F5E'
                    : selectedStage === 'egress' && !selectedCorridor
                      ? '#38BDF8'
                      : 'rgba(255,255,255,0.1)'
                }
                strokeWidth={hasVirtualTransfer ? '1.5' : '1.25'}
                filter={hasVirtualTransfer ? 'url(#rose-glow)' : undefined}
              />
              <line
                x1="824"
                y1="181"
                x2="1086"
                y2="181"
                stroke="rgba(255,255,255,0.09)"
                strokeWidth="1"
              />
              <text
                x="830"
                y="203"
                fill={hasVirtualTransfer ? '#FDA4AF' : '#A1A1AA'}
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                04B · 가상 국외 이전 노드
              </text>
              <rect
                x="1016"
                y="190"
                width="66"
                height="18"
                rx="9"
                fill={node04BPill.fill}
                stroke={node04BPill.stroke}
                strokeWidth="1"
              />
              <text
                x="1049"
                y="202"
                textAnchor="middle"
                fill={node04BPill.text}
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="600"
              >
                {node04BPill.label}
              </text>
              <text
                x="830"
                y="227"
                fill={hasVirtualTransfer ? '#FFE4E6' : '#E4E4E7'}
                fontSize="12"
                fontWeight="600"
              >
                {hasVirtualTransfer
                  ? '해외 원격 열람 · KMS 통제 적발'
                  : '가상 국외 이전 없음'}
              </text>
              <text
                x="830"
                y="249"
                fill={hasVirtualTransfer ? '#FDA4AF' : '#71717A'}
                fontSize="10.5"
                fontFamily="JetBrains Mono, monospace"
              >
                IAM: {facts.transfers.virtual_transfer.foreign_iam_access ? 'FOREIGN' : 'LOCAL'} · KMS:{' '}
                {facts.transfers.virtual_transfer.foreign_kms_control ? 'FOREIGN' : 'LOCAL'}
              </text>
            </g>
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
                    ? 'border-amber-500/35 bg-amber-500/[0.06]'
                    : 'border-white/[0.07] bg-[#08080A]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-zinc-100 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-cyan-400" />
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
                <div className="text-[11px] text-zinc-400 mt-1 truncate">
                  {risk.profile.framework_name}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected Geo-Corridor or Stage Inspector Strip */}
      <div className="rounded-lg border border-white/[0.07] bg-[#08080A] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
        {selectedCorridor && selectedCorridor === originNode.code ? (
          <div className="flex items-center gap-2.5 text-zinc-300">
            <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>
              <strong>출발 거점 ({originNode.label}):</strong> 활성 국외 아크 {activeCorridorList.length}개 ·{' '}
              차단/위반 경로 {violatingCorridorCount}개 ({activeCorridorList.map((c) => c.code).join(', ') || '국내 단독'})
            </span>
          </div>
        ) : selectedCorridorInfo ? (
          <div className="flex items-center gap-2.5 text-zinc-300">
            {selectedCorridorInfo.status === 'VIOLATING' ? (
              <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
            ) : selectedCorridorInfo.status === 'COMPLIANT' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Globe className="w-4 h-4 text-zinc-500 shrink-0" />
            )}
            <span>
              <strong>
                {originNode.label} → {selectedCorridorInfo.node.label} ({selectedCorridorInfo.node.subLabel}):
              </strong>{' '}
              {selectedCorridorInfo.status === 'STANDBY'
                ? '현재 활성화된 PII 전송 또는 클라우드 리전이 없습니다.'
                : selectedCorridorInfo.status === 'VIOLATING'
                  ? `위반/차단 탐지 — ${
                      selectedCorridorInfo.undisclosedCountry
                        ? '처리방침 수신국 고지 누락/모순'
                        : selectedCorridorInfo.isVirtualUsCorridor
                          ? '해외 IAM/KMS 가상이전 탐지'
                          : '보안 또는 법적 보호조치 미충족'
                    } (${
                      selectedCorridorInfo.vendorsInCountry.map((v) => v.sdk).join(', ') ||
                      'Infra/Virtual'
                    })`
                  : `적법·승인 이전 경로 (${
                      selectedCorridorInfo.vendorsInCountry.map((v) => v.sdk).join(', ') ||
                      'Region'
                    })`}
            </span>
          </div>
        ) : (
          <>
            {selectedStage === 'subjects' && (
              <div className="flex items-center gap-2.5 text-zinc-300">
                <Users className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>
                  <strong>정보주체 관할권:</strong> {facts.workspace.data_subject_countries.join(', ')} ·{' '}
                  사업자 소재지 {facts.workspace.business_country} 기준 Layer 1 본체 법률이 적용됩니다.
                </span>
              </div>
            )}
            {selectedStage === 'security' && (
              <div className="flex items-center gap-2.5 text-zinc-300">
                <Lock className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>
                  <strong>기술적 보호조치:</strong> 전송 암호화(
                  {facts.security.encryption_in_transit ? '적용' : '미적용'}), 저장 암호화(
                  {facts.security.encryption_at_rest ? '적용' : '미적용'}), 사전 PII 마스킹(
                  {facts.security.pii_masked_before_transfer ? '적용' : '미적용'}).
                </span>
              </div>
            )}
            {selectedStage === 'storage' && (
              <div className="flex items-center gap-2.5 text-zinc-300">
                <Cloud className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>
                  <strong>스토리지 리전:</strong> {regionLabels.join(' · ')}
                </span>
              </div>
            )}
            {selectedStage === 'egress' && (
              <div className="flex items-center gap-2.5 text-zinc-300">
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
          </>
        )}
        <span className="text-[11px] text-zinc-500 whitespace-nowrap shrink-0 flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          국가 핀 또는 노드를 클릭해 상세 확인
        </span>
      </div>
    </section>
  );
}
