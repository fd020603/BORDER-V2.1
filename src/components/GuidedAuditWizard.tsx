import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Briefcase,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cloud,
  CreditCard,
  FileCode2,
  FileText,
  Globe,
  HeartPulse,
  Loader2,
  Play,
  Plus,
  Shield,
  Square,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { DEFAULT_POLICY_PACKS } from '@/lib/default-packs';
import {
  SAMPLE_DEPENDENCY_FILES,
  STACK_BUILDER_REGIONS,
  STACK_BUILDER_SAAS,
  buildVendorFromSdk,
  scanDependencyFile,
} from '@/lib/dependency-scanner';
import { resolveRequiredPacks } from '@/lib/pack-loader';
import { computeEffectiveHasCrossBorder } from '@/lib/rule-evaluator';
import { lookupSdkMetadata } from '@/lib/sdk-registry';
import {
  RESIDENCY_REGION_OPTIONS,
  type CanonicalFactModel,
  type DetectedVendor,
  type IndustryDomain,
  type PolicyPackV2,
  type TransferPurpose,
  type VirtualTransferFacts,
} from '@/lib/types';
import { InfoTooltip } from './InfoTooltip';
import type { InspectionStageState } from './InputStudio';
import type { ToastVariant } from './Toast';

interface GuidedAuditWizardProps {
  businessCountry: string;
  dataSubjectCountries: string[];
  industryDomain: IndustryDomain;
  selectedRegions: string[];
  detectedVendors: DetectedVendor[];
  policyText: string;
  noPolicyDoc: boolean;
  infraCode: string;
  virtualTransfer: VirtualTransferFacts;
  security: CanonicalFactModel['security'];
  activePacks: PolicyPackV2[];
  inspectionState: InspectionStageState;
  onUpdateWorkspaceMeta: (patch: {
    businessCountry?: string;
    dataSubjectCountries?: string[];
    industryDomain?: IndustryDomain;
  }) => void;
  onToggleRegion: (regionId: string) => void;
  onToggleSaasPreset: (sdk: string) => void;
  onApplyScannedVendors: (
    vendors: DetectedVendor[],
    regions: string[],
  ) => void;
  onToggleVendorPii: (sdk: string) => void;
  onChangeVendorPurpose: (sdk: string, purpose: TransferPurpose) => void;
  onChangeVendorResidency: (sdk: string, residencyCountry: string) => void;
  onRemoveVendor: (sdk: string) => void;
  onChangePolicyText: (text: string) => void;
  onToggleNoPolicyDoc: (val: boolean) => void;
  onChangeInfraCode: (code: string) => void;
  onChangeVirtualTransfer: (patch: Partial<VirtualTransferFacts>) => void;
  onChangeSecurity: (patch: Partial<CanonicalFactModel['security']>) => void;
  onRunInspection: () => void;
  onCancelInspection?: () => void;
  onShowToast?: (message: string, variant?: ToastVariant) => void;
}

type WizardStep = 1 | 2 | 3 | 4;

const WIZARD_STEPS: Array<{ id: WizardStep; title: string }> = [
  { id: 1, title: '1. 서비스 기본 정보' },
  { id: 2, title: '2. 클라우드 & 외부 서비스' },
  { id: 3, title: '3. 처리방침 & 기본 보안' },
  { id: 4, title: '4. 최종 확인 & 심사' },
];

const BUSINESS_COUNTRIES = [
  { code: 'KR', label: '한국' },
  { code: 'EU', label: '유럽' },
  { code: 'US', label: '미국' },
  { code: 'JP', label: '일본' },
  { code: 'CN', label: '중국' },
];

const SUBJECT_COUNTRIES = [
  { code: 'KR', label: '한국' },
  { code: 'EU', label: '유럽' },
  { code: 'US', label: '미국' },
  { code: 'JP', label: '일본' },
  { code: 'CN', label: '중국' },
  { code: 'GB', label: '영국' },
  { code: 'SG', label: '싱가포르' },
];

const INDUSTRY_CARDS: Array<{
  id: IndustryDomain;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'GENERAL',
    label: '일반 SaaS / 쇼핑몰',
    desc: '웹·앱 서비스, 커머스, B2B 툴',
    icon: Briefcase,
  },
  {
    id: 'AI_SAAS',
    label: 'AI 서비스',
    desc: 'OpenAI·Claude 등 생성형 AI 연동',
    icon: Bot,
  },
  {
    id: 'FINTECH',
    label: '핀테크 / 결제',
    desc: '금융, 송금, 결제, 자산관리',
    icon: CreditCard,
  },
  {
    id: 'HEALTHCARE',
    label: '헬스케어 / 의료',
    desc: '건강검진, 비대면 진료, 민감정보',
    icon: HeartPulse,
  },
];

const INSPECTION_STEPS = [
  '1. 처리방침 NLP 파싱',
  '2. 의존성 · 인프라 스캔',
  '3. 문서-인프라 Drift 대조',
  '4. 4계층 법률 팩 병렬 판정',
];

const PACK_SHORT_CODES: Record<string, string> = {
  KR_PIPA_v2: 'KR_PIPA',
  EU_GDPR_v2: 'EU_GDPR',
  JP_APPI_v2: 'JP_APPI',
  CN_PIPL_v2: 'CN_PIPL',
  US_CLOUD_ACT_v2: 'CLOUD_ACT',
  US_CCPA_CPRA_v2: 'CCPA_CPRA',
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

export function GuidedAuditWizard({
  businessCountry,
  dataSubjectCountries,
  industryDomain,
  selectedRegions,
  detectedVendors,
  policyText,
  noPolicyDoc,
  infraCode,
  virtualTransfer,
  security,
  activePacks,
  inspectionState,
  onUpdateWorkspaceMeta,
  onToggleRegion,
  onToggleSaasPreset,
  onApplyScannedVendors,
  onToggleVendorPii,
  onChangeVendorPurpose,
  onChangeVendorResidency,
  onRemoveVendor,
  onChangePolicyText,
  onToggleNoPolicyDoc,
  onChangeInfraCode,
  onChangeVirtualTransfer,
  onChangeSecurity,
  onRunInspection,
  onCancelInspection,
  onShowToast,
}: GuidedAuditWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [fileScannerOpen, setFileScannerOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [lastScanNotice, setLastScanNotice] = useState<string | null>(null);
  const [advancedInfraOpen, setAdvancedInfraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const infraFileInputRef = useRef<HTMLInputElement | null>(null);
  const policyFileInputRef = useRef<HTMLInputElement | null>(null);

  const previewDestinationCountries = useMemo(() => {
    const activeVendors = detectedVendors.filter(
      (v) => (v.includes_pii ?? v.sends_pii) !== false,
    );
    const regionCountries = selectedRegions
      .map((id) => STACK_BUILDER_REGIONS.find((r) => r.id === id)?.countryCode)
      .filter((c): c is string => Boolean(c));
    return Array.from(
      new Set(
        [
          ...regionCountries,
          ...activeVendors.map(
            (v) => v.data_residency_country || v.country || v.default_country,
          ),
        ].filter((c) => c.toUpperCase() !== businessCountry.toUpperCase()),
      ),
    );
  }, [businessCountry, detectedVendors, selectedRegions]);

  const previewHasCrossBorder = useMemo(() => {
    const activeVendors = detectedVendors.filter(
      (v) => (v.includes_pii ?? v.sends_pii) !== false,
    );
    return computeEffectiveHasCrossBorder(
      previewDestinationCountries,
      activeVendors,
      businessCountry,
      virtualTransfer,
    );
  }, [
    businessCountry,
    detectedVendors,
    previewDestinationCountries,
    virtualTransfer,
  ]);

  const previewPackResolution = useMemo(() => {
    const previewFacts: CanonicalFactModel = {
      workspace: {
        business_country: businessCountry,
        data_subject_countries: dataSubjectCountries,
        industry_domain: industryDomain,
      },
      transfers: {
        has_cross_border: previewHasCrossBorder,
        destination_countries: previewDestinationCountries,
        detected_vendors: detectedVendors,
        virtual_transfer: virtualTransfer,
      },
      security,
      legal_doc: {
        exists: !noPolicyDoc && policyText.trim().length > 0,
        claims_domestic_only: false,
        has_separate_consent: false,
        has_entrustment_disclosure: false,
        disclosed_countries: [],
        disclosed_vendors: [],
        disclosed_items: [],
        disclosed_method_and_time: false,
        disclosed_retention_period: false,
        disclosed_opt_out_method: false,
        disclosed_dest_country_law_info: false,
        has_scc_or_safeguard_notice: false,
        has_ai_training_opt_out_notice: false,
        has_ai_service_notice: false,
        has_ai_output_label_notice: false,
        has_do_not_sell_or_share_notice: false,
      },
    };
    return resolveRequiredPacks(previewFacts, activePacks, []);
  }, [
    businessCountry,
    dataSubjectCountries,
    industryDomain,
    previewHasCrossBorder,
    previewDestinationCountries,
    detectedVendors,
    virtualTransfer,
    security,
    noPolicyDoc,
    policyText,
    activePacks,
  ]);

  const handleToggleSubjectCountry = (code: string) => {
    const exists = dataSubjectCountries.includes(code);
    if (exists && dataSubjectCountries.length === 1) return;
    const next = exists
      ? dataSubjectCountries.filter((c) => c !== code)
      : [...dataSubjectCountries, code];
    onUpdateWorkspaceMeta({ dataSubjectCountries: next });
  };

  const handleScanText = (fileName: string, content: string) => {
    const scan = scanDependencyFile(fileName, content);
    onApplyScannedVendors(scan.detectedVendors, scan.detectedRegions);
    const msg = `${fileName} 스캔 완료 · 탐지된 외부 서비스 ${scan.detectedVendors.length}종 (기존 목록과 병합됨)`;
    setLastScanNotice(msg);
    onShowToast?.(msg, 'success');
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      handleScanText(file.name, content);
    };
    reader.readAsText(file);
  };

  const handleTextFileUpload = (
    file: File,
    onLoaded: (content: string) => void,
    label: string,
  ) => {
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      onLoaded(content);
      onShowToast?.(`${file.name} (${label}) 불러오기 완료`, 'success');
    };
    reader.readAsText(file);
  };

  const activeSdkSet = new Set(detectedVendors.map((v) => v.sdk));
  const activePiiVendors = detectedVendors.filter(
    (v) => (v.includes_pii ?? v.sends_pii) !== false,
  );
  const excludedVendors = detectedVendors.filter(
    (v) => (v.includes_pii ?? v.sends_pii) === false,
  );

  const selectedIndustryCard = INDUSTRY_CARDS.find(
    (c) => c.id === industryDomain,
  );

  return (
    <div className="space-y-5">
      {/* Slim h-10 Underline Stepper */}
      <nav
        aria-label="가이드 위저드 단계"
        className="grid grid-cols-2 lg:grid-cols-4 border-b border-white/[0.07]"
      >
        {WIZARD_STEPS.map((item) => {
          const isCurrent = step === item.id;
          const isCompleted = step > item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setStep(item.id)}
              aria-current={isCurrent ? 'step' : undefined}
              className={`relative h-10 px-3 flex items-center justify-between gap-2 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#38BDF8]/60 ${
                isCurrent
                  ? 'text-zinc-50 font-semibold'
                  : isCompleted
                    ? 'text-emerald-300/90 hover:text-emerald-200'
                    : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span className="truncate">{item.title}</span>
              {isCompleted && (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              )}
              {isCurrent && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 -bottom-px h-[2px] bg-[#38BDF8]"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* 2-Column Split Layout: Left (68%) Inputs / Right (32%) Sticky Live Policy Preview */}
      <div className="lg:grid lg:grid-cols-[minmax(0,68fr)_minmax(0,32fr)] gap-6 items-start">
        {/* Left Column (68%) */}
        <div className="min-w-0 space-y-6">
          {/* Step 1: Service Basics */}
          {step === 1 && (
            <section key="wizard-step-1" className="animate-panel-enter space-y-6">
              <div>
                <h3 className="font-display text-base font-semibold text-zinc-100">
                  서비스 기본 정보 — 누구에게 서비스하나요?
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  사업자 위치와 고객 국가, 서비스 분야를 고르면 오른쪽 패널에 적용 법률이 즉시 반영됩니다.
                </p>
              </div>

              {/* 1. Business Location (Single Select Segmented Pill Bar) */}
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>우리 회사(사업자) 위치 (단일 선택)</span>
                </div>
                <div
                  role="radiogroup"
                  aria-label="우리 회사(사업자) 위치"
                  className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#08080A] border border-white/[0.07]"
                >
                  {BUSINESS_COUNTRIES.map((c) => {
                    const selected = businessCountry === c.code;
                    return (
                      <button
                        key={c.code}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() =>
                          onUpdateWorkspaceMeta({ businessCountry: c.code })
                        }
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]/60 ${
                          selected
                            ? 'bg-[#FAFAFA] text-[#050507] font-semibold shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]'
                        }`}
                      >
                        <span
                          className={`font-mono text-[11px] font-semibold ${
                            selected ? 'text-[#050507]' : 'text-zinc-500'
                          }`}
                        >
                          {c.code}
                        </span>
                        <span>{c.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Target Customer Regions (Multi Select Wrapping Filter Chips with Checkmark Animation) */}
              <div className="space-y-2.5 pt-5 border-t border-white/[0.06]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>서비스 이용 고객 국가 (복수 선택)</span>
                  </div>
                  <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
                    {dataSubjectCountries.length}개국 선택됨
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {SUBJECT_COUNTRIES.map((c) => {
                    const active = dataSubjectCountries.includes(c.code);
                    return (
                      <button
                        key={c.code}
                        type="button"
                        aria-pressed={active}
                        onClick={() => handleToggleSubjectCountry(c.code)}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]/60 ${
                          active
                            ? 'border-[#38BDF8] bg-[#141419] text-zinc-100 shadow-[inset_0_1px_0_0_rgba(56,189,248,0.14)]'
                            : 'border-white/[0.08] bg-[#08080A] text-zinc-400 hover:border-white/[0.18] hover:text-zinc-200'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-all duration-150 shrink-0 ${
                            active
                              ? 'bg-[#38BDF8] text-[#050507] scale-100 opacity-100'
                              : 'border border-white/20 bg-transparent scale-90 opacity-60'
                          }`}
                        >
                          <Check
                            className={`w-2.5 h-2.5 stroke-[3] transition-all duration-150 ${
                              active
                                ? 'scale-100 opacity-100'
                                : 'scale-50 opacity-0'
                            }`}
                          />
                        </span>
                        <span
                          className={`font-mono text-[11px] font-semibold ${
                            active ? 'text-[#38BDF8]' : 'text-zinc-500'
                          }`}
                        >
                          {c.code}
                        </span>
                        <span>{c.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Service Domain (4-Column Visual Focal Cards) */}
              <div className="space-y-2.5 pt-5 border-t border-white/[0.06]">
                <div className="text-xs font-semibold text-zinc-200">
                  서비스 운영 분야
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
                  {INDUSTRY_CARDS.map((card) => {
                    const Icon = card.icon;
                    const active = industryDomain === card.id;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          onUpdateWorkspaceMeta({ industryDomain: card.id })
                        }
                        className={`rounded-lg border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]/60 ${
                          active
                            ? 'border-[#38BDF8] bg-[#141419] text-zinc-100 shadow-[inset_0_1px_0_0_rgba(56,189,248,0.14)]'
                            : 'border-white/[0.07] bg-[#08080A] text-zinc-300 hover:border-white/[0.16] hover:bg-[#101014]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-colors ${
                              active
                                ? 'bg-[#38BDF8]/12 border-[#38BDF8]/40 text-[#38BDF8]'
                                : 'bg-white/[0.03] border-white/[0.07] text-zinc-400'
                            }`}
                          >
                            <Icon className="w-4 h-4 shrink-0" />
                          </div>
                          {active && (
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] shrink-0"
                              aria-hidden="true"
                            />
                          )}
                        </div>
                        <div className="text-xs font-semibold mt-3 truncate">
                          {card.label}
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                          {card.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* Step 2: Cloud & External SaaS */}
          {step === 2 && (
            <section key="wizard-step-2" className="animate-panel-enter space-y-5">
              <div>
                <h3 className="font-display text-base font-semibold text-zinc-100">
                  사용 중인 클라우드 &amp; 외부 서비스 — 데이터가 어디로 가나요?
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  개발 파일(`package.json` 등)을 올리거나 아래 버튼에서 사용 중인 서버·외부 서비스를 클릭해 선택하세요.
                </p>
              </div>

              {/* 30-Sec Stack Builder (Full Left-Column Width) */}
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200 mb-2">
                    <Cloud className="w-4 h-4 text-cyan-400" />
                    <span>데이터가 저장되는 서버(클라우드) 위치</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {STACK_BUILDER_REGIONS.map((region) => {
                      const active = selectedRegions.includes(region.id);
                      return (
                        <button
                          key={region.id}
                          type="button"
                          onClick={() => onToggleRegion(region.id)}
                          className={`px-2.5 py-2 rounded-lg border text-left transition-colors ${
                            active
                              ? 'bg-[#141419] border-[#38BDF8] text-zinc-100 shadow-[inset_0_1px_0_0_rgba(56,189,248,0.12)]'
                              : 'bg-[#08080A] border-white/[0.07] text-zinc-300 hover:border-white/[0.15] hover:bg-[#101014]'
                          }`}
                        >
                          <div className="text-xs font-medium truncate flex items-center justify-between gap-1">
                            <span className="truncate">{region.label}</span>
                            {active && (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] shrink-0"
                                aria-hidden="true"
                              />
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-zinc-400 truncate mt-0.5">
                            {region.countryCode} · {region.regionCode}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-zinc-200 mb-2">
                    사용 중인 AI · 결제 · 분석 · 메일 서비스 클릭 추가
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {STACK_BUILDER_SAAS.map((item) => {
                      const active = activeSdkSet.has(item.sdk);
                      const preview = buildVendorFromSdk(item.sdk);
                      return (
                        <button
                          key={item.sdk}
                          type="button"
                          onClick={() => onToggleSaasPreset(item.sdk)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                            active
                              ? 'bg-[#141419] border-[#38BDF8] text-zinc-100 shadow-[inset_0_1px_0_0_rgba(56,189,248,0.12)]'
                              : 'bg-[#08080A] border-white/[0.07] text-zinc-300 hover:border-white/[0.15] hover:bg-[#101014]'
                          }`}
                        >
                          {active ? (
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] shrink-0"
                              aria-hidden="true"
                            />
                          ) : (
                            <Plus className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                          )}
                          <span>{item.label}</span>
                          <span className="font-mono text-[10px] text-zinc-400">
                            {preview?.country ?? item.countryCode}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Optional Collapsible Direct File Upload Dropzone */}
              <div className="rounded-lg border border-white/[0.07] bg-[#08080A] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setFileScannerOpen((prev) => !prev)}
                  aria-expanded={fileScannerOpen}
                  className="w-full px-4 py-2.5 flex items-center justify-between gap-2 text-xs text-zinc-300 hover:bg-white/[0.03] transition-colors"
                >
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <UploadCloud className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="truncate">
                      (선택) 프로젝트 파일 업로드로 외부 서비스 자동 탐지 (package.json · .env · index.html)
                    </span>
                  </span>
                  {fileScannerOpen ? (
                    <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                  )}
                </button>

                {fileScannerOpen && (
                  <div className="p-4 pt-3 border-t border-white/[0.06] space-y-3">
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          fileInputRef.current?.click();
                        }
                      }}
                      className={`rounded-lg border border-dashed p-4 text-center cursor-pointer transition-colors ${
                        isDragging
                          ? 'border-[#38BDF8] bg-[#141419]'
                          : 'border-white/[0.12] bg-[#0C0C0F] hover:border-white/[0.22]'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json,.txt,.env,.example,.html,.htm,.tsx,.jsx"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file);
                          e.target.value = '';
                        }}
                      />
                      <FileCode2 className="w-5 h-5 text-cyan-400 mx-auto mb-1.5" />
                      <div className="text-xs font-medium text-zinc-200">
                        `package.json`, `index.html`, `_document.tsx`, `.env` 파일을 드롭하거나 클릭해 업로드
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-1">
                        내장 SDK·&lt;script&gt; 트래커 목록과 비교해 해외 전송 서비스를 자동으로 병합합니다.
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-zinc-400">
                        테스트용 샘플:
                      </span>
                      {(['package.json', 'requirements.txt', '.env.example', 'index.html'] as const).map(
                        (key) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() =>
                              handleScanText(
                                SAMPLE_DEPENDENCY_FILES[key].fileName,
                                SAMPLE_DEPENDENCY_FILES[key].content,
                              )
                            }
                            className="px-2.5 py-1 rounded bg-[#0C0C0F] border border-white/[0.08] hover:border-white/[0.18] text-[11px] font-mono text-zinc-300 transition-colors"
                          >
                            {key}
                          </button>
                        ),
                      )}
                    </div>

                    {lastScanNotice && (
                      <div className="rounded-md bg-[#141419] border border-[#38BDF8]/40 px-3 py-2 text-[11px] text-zinc-200">
                        {lastScanNotice}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Beginner-friendly Question Cards per Detected Vendor */}
              <div className="pt-4 border-t border-white/[0.06] space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-zinc-100">
                    탐지된 외부 서비스 확인 ({detectedVendors.length}종) — 오탐 방지 2문항
                  </h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    개인정보(이메일·이름·IP 등)를 보내지 않는 기능이라면 &ldquo;아니오&rdquo;를 눌러 바로 규제 대상에서 제외할 수 있습니다.
                  </p>
                </div>

                {detectedVendors.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/[0.1] py-6 text-center text-xs text-zinc-400">
                    아직 선택된 외부 서비스가 없습니다. 위에서 사용 중인 서비스를 클릭하거나 파일을 올려주세요.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {detectedVendors.map((vendor) => {
                      const includesPii =
                        (vendor.includes_pii ?? vendor.sends_pii) !== false;
                      const defaultCountry = (
                        vendor.default_country ||
                        vendor.country ||
                        'US'
                      ).toUpperCase();
                      const residencyCountry = (
                        vendor.data_residency_country ||
                        vendor.country ||
                        defaultCountry
                      ).toUpperCase();
                      const isOverridden = residencyCountry !== defaultCountry;
                      const hasCustomOption = !RESIDENCY_REGION_OPTIONS.some(
                        (opt) => opt.code === residencyCountry,
                      );

                      return (
                        <div
                          key={vendor.sdk}
                          className="rounded-lg border border-white/[0.07] bg-[#08080A] p-4 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-zinc-100">
                                {vendor.name}
                              </div>
                              <div className="text-[11px] font-mono text-cyan-300 mt-0.5">
                                {vendor.sdk} · 기본 {defaultCountry} → 저장{' '}
                                {residencyCountry}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => onRemoveVendor(vendor.sdk)}
                              aria-label={`${vendor.name} 삭제`}
                              className="p-1 text-zinc-400 hover:text-rose-300 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Data Residency Override */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2 text-xs text-zinc-300">
                              <span>실제 데이터 저장 리전</span>
                              {isOverridden && (
                                <span className="font-mono text-[10px] text-emerald-300">
                                  리전 오버라이드
                                </span>
                              )}
                            </div>
                            <select
                              value={residencyCountry}
                              onChange={(e) =>
                                onChangeVendorResidency(
                                  vendor.sdk,
                                  e.target.value,
                                )
                              }
                              aria-label={`${vendor.name} 데이터 저장 리전`}
                              className="w-full rounded border border-white/[0.1] bg-[#0C0C0F] px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-[#38BDF8]"
                            >
                              {hasCustomOption && (
                                <option value={residencyCountry}>
                                  {residencyCountry} (기본 리전)
                                </option>
                              )}
                              {RESIDENCY_REGION_OPTIONS.map((opt) => (
                                <option key={opt.code} value={opt.code}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Q1: Includes PII? */}
                          <div className="space-y-1.5">
                            <div className="text-xs text-zinc-300">
                              1) 이 서비스로 고객의 이름·이메일 등 개인정보를 보내나요?
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (!includesPii) onToggleVendorPii(vendor.sdk);
                                }}
                                className={`px-2.5 py-1.5 rounded border text-xs font-medium transition-colors inline-flex items-center justify-center gap-1.5 ${
                                  includesPii
                                    ? 'bg-[#141419] border-[#38BDF8] text-zinc-100'
                                    : 'bg-[#0C0C0F] border-white/[0.07] text-zinc-400 hover:border-white/[0.15]'
                                }`}
                              >
                                {includesPii && (
                                  <span
                                    className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] shrink-0"
                                    aria-hidden="true"
                                  />
                                )}
                                <span>예, 개인정보 전송</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (includesPii) onToggleVendorPii(vendor.sdk);
                                }}
                                className={`px-2.5 py-1.5 rounded border text-xs font-medium transition-colors inline-flex items-center justify-center gap-1.5 ${
                                  !includesPii
                                    ? 'bg-[#141419] border-emerald-400/70 text-emerald-200'
                                    : 'bg-[#0C0C0F] border-white/[0.07] text-zinc-400 hover:border-white/[0.15]'
                                }`}
                              >
                                {!includesPii && (
                                  <span
                                    className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
                                    aria-hidden="true"
                                  />
                                )}
                                <span>아니오 (제외)</span>
                              </button>
                            </div>
                          </div>

                          {/* Q2: Purpose */}
                          {includesPii && (
                            <div className="space-y-1.5">
                              <div className="text-xs text-zinc-300 flex items-center gap-1.5">
                                <span>2) 어떤 용도로 쓰시나요?</span>
                                <InfoTooltip term="entrustment_exemption" />
                              </div>
                              <div className="grid grid-cols-1 gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    onChangeVendorPurpose(
                                      vendor.sdk,
                                      'ENTRUSTMENT',
                                    )
                                  }
                                  className={`px-3 py-2 rounded border text-left text-xs transition-colors ${
                                    vendor.transfer_purpose === 'ENTRUSTMENT'
                                      ? 'bg-[#141419] border-[#38BDF8] text-zinc-100'
                                      : 'bg-[#0C0C0F] border-white/[0.07] text-zinc-300 hover:border-white/[0.15]'
                                  }`}
                                >
                                  <div className="font-medium flex items-center justify-between gap-2">
                                    <span>서비스 운영 위탁 (제3호 특례)</span>
                                    {vendor.transfer_purpose === 'ENTRUSTMENT' && (
                                      <span
                                        className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] shrink-0"
                                        aria-hidden="true"
                                      />
                                    )}
                                  </div>
                                  <div className="text-[11px] text-zinc-400">
                                    결제·AI 응답·이메일 발송 등 서비스 기능 수행 목적
                                  </div>
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    onChangeVendorPurpose(
                                      vendor.sdk,
                                      vendor.category === 'ANALYTICS'
                                        ? 'ANALYTICS'
                                        : 'THIRD_PARTY_SHARING',
                                    )
                                  }
                                  className={`px-3 py-2 rounded border text-left text-xs transition-colors ${
                                    vendor.transfer_purpose !== 'ENTRUSTMENT'
                                      ? 'bg-[#141419] border-amber-400/70 text-amber-200'
                                      : 'bg-[#0C0C0F] border-white/[0.07] text-zinc-300 hover:border-white/[0.15]'
                                  }`}
                                >
                                  <div className="font-medium flex items-center justify-between gap-2">
                                    <span>광고·분석·외부 공유 (제3자 제공 / 분석)</span>
                                    {vendor.transfer_purpose !== 'ENTRUSTMENT' && (
                                      <span
                                        className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
                                        aria-hidden="true"
                                      />
                                    )}
                                  </div>
                                  <div className="text-[11px] text-zinc-400">
                                    마케팅 통계, 타겟 광고 또는 외부 파트너 공유 목적
                                  </div>
                                </button>
                              </div>
                              {lookupSdkMetadata(vendor.sdk)?.purpose_guide_ko && (
                                <p className="text-[11px] text-cyan-200/90 bg-white/[0.03] border border-white/[0.07] rounded px-2.5 py-1.5 leading-snug">
                                  권장 가이드:{' '}
                                  {lookupSdkMetadata(vendor.sdk)?.purpose_guide_ko}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Step 3: Privacy Policy & Simple Security O/X */}
          {step === 3 && (
            <section key="wizard-step-3" className="animate-panel-enter space-y-5">
              <div>
                <h3 className="font-display text-base font-semibold text-zinc-100">
                  개인정보 처리방침 &amp; 기본 보안 점검
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  웹사이트에 올려둔 개인정보 처리방침 문구와 3가지 기본 보안 O/X 질문만 답하면 준비 끝입니다.
                </p>
              </div>

              {/* Privacy Policy Radio Branch */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-cyan-400" />
                  <span>현재 웹사이트에 게시된 개인정보 처리방침이 있나요?</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => onToggleNoPolicyDoc(false)}
                    className={`rounded-lg border p-3.5 text-left transition-colors ${
                      !noPolicyDoc
                        ? 'border-[#38BDF8] bg-[#141419] text-zinc-100 shadow-[inset_0_1px_0_0_rgba(56,189,248,0.12)]'
                        : 'border-white/[0.07] bg-[#08080A] text-zinc-300 hover:border-white/[0.15] hover:bg-[#101014]'
                    }`}
                  >
                    <div className="text-xs font-semibold flex items-center justify-between gap-2">
                      <span>예, 아래에 텍스트를 붙여넣겠습니다</span>
                      {!noPolicyDoc && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] shrink-0"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      실제 사용 중인 서비스·국가명이 빠짐없이 적혀 있는지 비교해 드립니다.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleNoPolicyDoc(true)}
                    className={`rounded-lg border p-3.5 text-left transition-colors ${
                      noPolicyDoc
                        ? 'border-amber-400/70 bg-[#141419] text-zinc-100'
                        : 'border-white/[0.07] bg-[#08080A] text-zinc-300 hover:border-white/[0.15] hover:bg-[#101014]'
                    }`}
                  >
                    <div className="text-xs font-semibold flex items-center justify-between gap-2">
                      <span>아니오, 아직 작성된 처리방침이 없습니다</span>
                      {noPolicyDoc && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      심사 완료 후 우리 서비스에 맞는 국외 이전 고지문 초안을 자동으로 만들어 드립니다.
                    </div>
                  </button>
                </div>

                {!noPolicyDoc && (
                  <div className="space-y-1.5">
                    <textarea
                      value={policyText}
                      onChange={(e) => onChangePolicyText(e.target.value)}
                      rows={6}
                      placeholder="예: '당사는 이용자의 개인정보를 국내 서버에만 보관합니다.' 또는 기존 처리방침의 국외 이전 조항을 붙여넣으세요."
                      className="w-full rounded-lg bg-[#08080A] border border-white/[0.08] p-3.5 text-xs leading-relaxed text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-[#38BDF8]"
                    />
                    <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                      <div>
                        <input
                          ref={policyFileInputRef}
                          type="file"
                          accept=".txt,.md,.html,.htm"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleTextFileUpload(
                                file,
                                onChangePolicyText,
                                '처리방침 문서',
                              );
                            }
                            e.target.value = '';
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => policyFileInputRef.current?.click()}
                          className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors"
                        >
                          <UploadCloud className="w-3.5 h-3.5 text-cyan-400" />
                          <span>텍스트/문서 파일(.txt, .md) 불러오기</span>
                        </button>
                      </div>
                      <span className="tabular-nums">
                        {policyText.length}자 입력됨
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 3 Non-Expert O/X Security Questions */}
              <div className="pt-4 border-t border-white/[0.06] space-y-3">
                <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <span>기본 보안 및 해외 접근 O/X 점검 (3문항)</span>
                </div>

                <div className="space-y-2.5">
                  {/* O/X 1 */}
                  <div className="rounded-lg border border-white/[0.07] bg-[#08080A] p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium text-zinc-100">
                        1. HTTPS 전송 암호화 및 DB 저장 암호화를 적용했나요?
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        웹사이트 주소가 `https://`로 시작하고 클라우드 DB 암호화가 켜져 있으면 &ldquo;예(O)&rdquo;입니다.
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          onChangeSecurity({
                            encryption_in_transit: true,
                            encryption_at_rest: true,
                          })
                        }
                        className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
                          security.encryption_in_transit &&
                          security.encryption_at_rest
                            ? 'bg-[#141419] border-emerald-400/70 text-emerald-200'
                            : 'bg-[#0C0C0F] border-white/[0.07] text-zinc-400 hover:border-white/[0.15]'
                        }`}
                      >
                        {security.encryption_in_transit &&
                          security.encryption_at_rest && (
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
                              aria-hidden="true"
                            />
                          )}
                        <span>예 (O)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onChangeSecurity({
                            encryption_in_transit: false,
                            encryption_at_rest: false,
                          })
                        }
                        className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
                          !security.encryption_in_transit ||
                          !security.encryption_at_rest
                            ? 'bg-[#141419] border-rose-400/70 text-rose-200'
                            : 'bg-[#0C0C0F] border-white/[0.07] text-zinc-400 hover:border-white/[0.15]'
                        }`}
                      >
                        {(!security.encryption_in_transit ||
                          !security.encryption_at_rest) && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <span>아니오 (X)</span>
                      </button>
                    </div>
                  </div>

                  {/* O/X 2 */}
                  <div className="rounded-lg border border-white/[0.07] bg-[#08080A] p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium text-zinc-100 flex items-center gap-1.5">
                        <span>
                          2. 해외 지사 직원이나 해외 외주 개발자가 DB/관리자 페이지에 접근하나요?
                        </span>
                        <InfoTooltip term="virtual_transfer" />
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        서버가 서울에 있어도 해외에서 원격 열람이 가능하면 가상 국외 이전으로 심사됩니다.
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          onChangeVirtualTransfer({ foreign_iam_access: true })
                        }
                        className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
                          virtualTransfer.foreign_iam_access
                            ? 'bg-[#141419] border-rose-400/70 text-rose-200'
                            : 'bg-[#0C0C0F] border-white/[0.07] text-zinc-400 hover:border-white/[0.15]'
                        }`}
                      >
                        {virtualTransfer.foreign_iam_access && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <span>예 (O)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onChangeVirtualTransfer({ foreign_iam_access: false })
                        }
                        className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
                          !virtualTransfer.foreign_iam_access
                            ? 'bg-[#141419] border-emerald-400/70 text-emerald-200'
                            : 'bg-[#0C0C0F] border-white/[0.07] text-zinc-400 hover:border-white/[0.15]'
                        }`}
                      >
                        {!virtualTransfer.foreign_iam_access && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <span>아니오 (X)</span>
                      </button>
                    </div>
                  </div>

                  {/* O/X 3 */}
                  <div className="rounded-lg border border-white/[0.07] bg-[#08080A] p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium text-zinc-100 flex items-center gap-1.5">
                        <span>
                          3. 암호화 키(KMS)를 해외 리전 또는 외부 벤더가 단독 관리하나요?
                        </span>
                        <InfoTooltip term="kms" />
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        보안 열쇠(KMS)를 우리 회사가 서울 리전에서 직접 통제하면 &ldquo;아니오(X)&rdquo;입니다.
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          onChangeVirtualTransfer({ foreign_kms_control: true })
                        }
                        className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
                          virtualTransfer.foreign_kms_control
                            ? 'bg-[#141419] border-rose-400/70 text-rose-200'
                            : 'bg-[#0C0C0F] border-white/[0.07] text-zinc-400 hover:border-white/[0.15]'
                        }`}
                      >
                        {virtualTransfer.foreign_kms_control && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <span>예 (O)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onChangeVirtualTransfer({ foreign_kms_control: false })
                        }
                        className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
                          !virtualTransfer.foreign_kms_control
                            ? 'bg-[#141419] border-emerald-400/70 text-emerald-200'
                            : 'bg-[#0C0C0F] border-white/[0.07] text-zinc-400 hover:border-white/[0.15]'
                        }`}
                      >
                        {!virtualTransfer.foreign_kms_control && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <span>아니오 (X)</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Optional Advanced Terraform/IAM Accordion */}
              <div className="rounded-lg border border-white/[0.07] bg-[#08080A] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setAdvancedInfraOpen((prev) => !prev)}
                  aria-expanded={advancedInfraOpen}
                  className="w-full px-4 py-3 flex items-center justify-between text-xs text-zinc-300 hover:bg-white/[0.03] transition-colors"
                >
                  <span>(선택) 개발자용 Terraform / AWS IAM 코드 직접 입력·업로드</span>
                  {advancedInfraOpen ? (
                    <ChevronUp className="w-4 h-4 text-zinc-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-400" />
                  )}
                </button>

                {advancedInfraOpen && (
                  <div className="p-4 pt-2 border-t border-white/[0.06] space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                      <span>`.tf` 또는 AWS IAM `.json` 정책 파일/코드를 입력하세요.</span>
                      <div>
                        <input
                          ref={infraFileInputRef}
                          type="file"
                          accept=".tf,.json,.hcl,.txt"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleTextFileUpload(
                                file,
                                onChangeInfraCode,
                                '인프라 코드',
                              );
                            }
                            e.target.value = '';
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => infraFileInputRef.current?.click()}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-white/[0.08] bg-[#0C0C0F] hover:border-white/[0.16] text-zinc-300 transition-colors"
                        >
                          <UploadCloud className="w-3 h-3 text-cyan-400" />
                          <span>.tf / .json 업로드</span>
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={infraCode}
                      onChange={(e) => onChangeInfraCode(e.target.value)}
                      rows={5}
                      placeholder={'provider "aws" { region = "ap-northeast-2" }'}
                      className="w-full rounded-lg bg-[#0C0C0F] border border-white/[0.08] p-3 font-mono text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-[#38BDF8]"
                    />
                    <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={security.pii_masked_before_transfer}
                        onChange={(e) =>
                          onChangeSecurity({
                            pii_masked_before_transfer: e.target.checked,
                          })
                        }
                        className="rounded border-white/20 bg-[#0C0C0F] text-cyan-400"
                      />
                      <span>
                        해외 API 전송 전 이름·전화번호 등 개인정보 마스킹(가명처리) 적용됨
                      </span>
                    </label>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Step 4: Departure Declaration Summary & Run */}
          {step === 4 && (
            <section key="wizard-step-4" className="animate-panel-enter space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-white/[0.06] pb-4">
                <div>
                  <h3 className="font-display text-base font-semibold text-zinc-100">
                    데이터 출국 신고서 최종 확인
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    입력 내용을 확인한 뒤 아래 출입국 심사 버튼을 눌러주세요.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* Summary 1 */}
                <div className="rounded-lg border border-white/[0.07] bg-[#08080A] p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-100">
                      1. 서비스 관할권
                    </span>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300"
                    >
                      수정
                    </button>
                  </div>
                  <div className="space-y-1 text-zinc-300">
                    <div>사업자 소재국: {businessCountry}</div>
                    <div>고객 국가: {dataSubjectCountries.join(', ')}</div>
                    <div>산업 도메인: {industryDomain}</div>
                  </div>
                </div>

                {/* Summary 2 */}
                <div className="rounded-lg border border-white/[0.07] bg-[#08080A] p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-100">
                      2. 클라우드 &amp; 외부 서비스
                    </span>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300"
                    >
                      수정
                    </button>
                  </div>
                  <div className="space-y-1 text-zinc-300">
                    <div>
                      서버 리전:{' '}
                      {selectedRegions.length > 0
                        ? selectedRegions
                            .map(
                              (id) =>
                                STACK_BUILDER_REGIONS.find((r) => r.id === id)
                                  ?.label ?? id,
                            )
                            .join(', ')
                        : '미선택'}
                    </div>
                    <div>
                      PII 전송 서비스:{' '}
                      {activePiiVendors.length > 0
                        ? activePiiVendors.map((v) => v.name).join(', ')
                        : '없음'}
                    </div>
                    {excludedVendors.length > 0 && (
                      <div className="text-zinc-400">
                        심사 제외(비-PII): {excludedVendors.length}종
                      </div>
                    )}
                  </div>
                </div>

                {/* Summary 3 */}
                <div className="rounded-lg border border-white/[0.07] bg-[#08080A] p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-100">
                      3. 처리방침 &amp; 보안 점검
                    </span>
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300"
                    >
                      수정
                    </button>
                  </div>
                  <div className="space-y-1 text-zinc-300">
                    <div>
                      처리방침:{' '}
                      {noPolicyDoc
                        ? '없음 (작성 예정)'
                        : policyText.trim().length > 0
                          ? `입력됨 (${policyText.length}자)`
                          : '미입력'}
                    </div>
                    <div>
                      전송·저장 암호화:{' '}
                      {security.encryption_in_transit &&
                      security.encryption_at_rest
                        ? '적용 (O)'
                        : '미적용 (X)'}
                    </div>
                    <div>
                      해외 열람 / 해외 KMS:{' '}
                      {virtualTransfer.foreign_iam_access ||
                      virtualTransfer.foreign_kms_control
                        ? '해당 있음 (위험)'
                        : '해당 없음 (안전)'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex flex-col items-center gap-3">
                {inspectionState.running ? (
                  <div className="w-full sm:w-auto flex flex-wrap items-center justify-center gap-2.5">
                    <div className="inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl bg-[#141419] border border-[#38BDF8]/60 text-zinc-100 text-sm font-semibold whitespace-nowrap">
                      <Loader2 className="w-4 h-4 animate-spin text-[#38BDF8]" />
                      <span>AI 파싱 및 출입국 심사 진행 중...</span>
                    </div>
                    <button
                      type="button"
                      onClick={onCancelInspection}
                      className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-rose-500/90 hover:bg-rose-500 text-white text-sm font-bold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                    >
                      <Square className="w-4 h-4 fill-current" />
                      <span>응답 중지</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={onRunInspection}
                    className="btn-shimmer w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3 rounded-xl bg-[#FAFAFA] hover:bg-white text-[#050507] text-sm font-bold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>출입국 심사 실행 (Run Border Inspection)</span>
                  </button>
                )}

                {inspectionState.running && (
                  <div className="w-full grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    {INSPECTION_STEPS.map((label, idx) => {
                      const completed = idx < inspectionState.stepIndex;
                      const current = idx === inspectionState.stepIndex;
                      return (
                        <div
                          key={label}
                          className={`rounded-lg border px-3 py-2 text-xs flex items-center gap-2 ${
                            completed
                              ? 'bg-emerald-500/[0.08] border-emerald-500/35 text-emerald-300'
                              : current
                                ? 'bg-[#141419] border-[#38BDF8] text-zinc-100'
                                : 'bg-[#08080A] border-white/[0.07] text-zinc-500'
                          }`}
                        >
                          {completed ? (
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <Shield className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span className="truncate">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Clean Borderless Bottom Navigation Bar */}
          <div className="flex items-center justify-between gap-3 pt-4 border-t border-white/[0.06]">
            <button
              type="button"
              disabled={step === 1}
              onClick={() => setStep((prev) => Math.max(1, prev - 1) as WizardStep)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] disabled:opacity-35 disabled:pointer-events-none transition-colors whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>이전 단계</span>
            </button>

            <span className="font-mono text-xs text-zinc-500 tabular-nums">
              {step} / 4
            </span>

            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep((prev) => Math.min(4, prev + 1) as WizardStep)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FAFAFA] hover:bg-white text-[#050507] text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <span>다음 단계</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : inspectionState.running ? (
              <button
                type="button"
                onClick={onCancelInspection}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-500/90 hover:bg-rose-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>응답 중지</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onRunInspection}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FAFAFA] hover:bg-white text-[#050507] text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>심사 실행</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Column (32%): Sticky Live Policy Preview */}
        <aside
          aria-label="실시간 매칭 규제 프리뷰"
          className="mt-6 lg:mt-0 lg:sticky lg:top-20 rounded-xl border border-white/[0.07] bg-[#08080A] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] p-4 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-display text-xs font-semibold text-zinc-100">
              실시간 매칭 규제 프리뷰
            </h4>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-[#38BDF8]/35 bg-[#38BDF8]/10 font-mono text-[11px] font-semibold text-[#38BDF8] tabular-nums">
              {previewPackResolution.requiredPacks.length}종 적용
            </span>
          </div>

          {/* Unboxed Context Metadata */}
          <div className="text-[11px] text-zinc-400 flex flex-wrap items-center gap-x-1.5 gap-y-1 leading-relaxed">
            <span>사업자 {businessCountry}</span>
            <span aria-hidden="true" className="text-zinc-600">
              ·
            </span>
            <span>고객 {dataSubjectCountries.join(', ')}</span>
            <span aria-hidden="true" className="text-zinc-600">
              ·
            </span>
            <span>{selectedIndustryCard?.label ?? industryDomain}</span>
          </div>

          {/* Animated Matched Policy Pack Pills */}
          <div className="space-y-2">
            {previewPackResolution.requiredPacks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/[0.08] p-3 text-xs text-zinc-400">
                현재 조건에 자동 매칭되는 활성 법률 팩이 없습니다.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {previewPackResolution.requiredPacks.map((pack, idx) => {
                  const shortCode = toShortPackCode(pack.pack_meta.id);
                  const lawName = pack.pack_meta.law_name || pack.pack_meta.id;
                  const rawVersion = pack.pack_meta.version || '';
                  const versionTag = rawVersion
                    ? `v${rawVersion.replace(/^v/i, '')}`
                    : '';
                  const isCustomPlugin = !DEFAULT_POLICY_PACKS.some(
                    (builtIn) =>
                      builtIn.pack_meta.id === pack.pack_meta.id &&
                      builtIn.pack_meta.version === rawVersion &&
                      builtIn.pack_meta.law_name === lawName,
                  );

                  return (
                    <span
                      key={`${pack.pack_meta.id}-${rawVersion}`}
                      title={`Layer ${pack.pack_meta.layer} · ${lawName}${versionTag ? ` (${versionTag})` : ''}`}
                      style={{ animationDelay: `${Math.min(idx, 6) * 28}ms` }}
                      className="animate-pack-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/[0.1] bg-[#141419] font-mono text-[11px] font-medium text-zinc-100"
                    >
                      <span className="text-[#38BDF8] text-[10px]">
                        L{pack.pack_meta.layer}
                      </span>
                      <span>{shortCode}</span>
                      {isCustomPlugin && (
                        <span className="text-[10px] text-violet-300 font-sans font-semibold">
                          플러그인
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Matched Pack Details List */}
          {previewPackResolution.requiredPacks.length > 0 && (
            <ul className="divide-y divide-white/[0.05] border-t border-white/[0.06] pt-1">
              {previewPackResolution.requiredPacks.map((pack) => {
                const lawName = pack.pack_meta.law_name || pack.pack_meta.id;
                const shortCode = toShortPackCode(pack.pack_meta.id);
                return (
                  <li
                    key={`detail-${pack.pack_meta.id}`}
                    className="py-2 first:pt-2 last:pb-0 flex items-center justify-between gap-2 text-[11px]"
                  >
                    <span className="text-zinc-300 truncate">{lawName}</span>
                    <span className="font-mono text-[10px] text-zinc-500 shrink-0 tabular-nums">
                      {shortCode} · {pack.rules.length}규칙
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Cross-border & Standby Footer */}
          <div className="pt-3 border-t border-white/[0.06] space-y-1 text-[11px] text-zinc-400">
            <div className="flex items-center justify-between gap-2">
              <span>이전 범위</span>
              <span
                className={`font-mono font-medium ${
                  previewHasCrossBorder ? 'text-cyan-300' : 'text-zinc-300'
                }`}
              >
                {previewDestinationCountries.length > 0
                  ? `국외 (${previewDestinationCountries.join(', ')})`
                  : previewHasCrossBorder
                    ? '가상 국외 이전'
                    : `${businessCountry} 국내`}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>미해당 팩 제외</span>
              <span className="font-mono tabular-nums text-zinc-500">
                {previewPackResolution.standbyPacks.length}종 대기
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
