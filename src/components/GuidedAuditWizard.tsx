import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Briefcase,
  Building2,
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

const WIZARD_STEPS: Array<{ id: WizardStep; title: string; subtitle: string }> = [
  { id: 1, title: '1. 서비스 기본 정보', subtitle: '누구에게 서비스하나요?' },
  { id: 2, title: '2. 클라우드 & 외부 서비스', subtitle: '데이터가 어디로 가나요?' },
  { id: 3, title: '3. 처리방침 & 기본 보안', subtitle: '약속과 보호조치 점검' },
  { id: 4, title: '4. 최종 확인 & 심사', subtitle: '출국 신고서 확인 후 실행' },
];

const BUSINESS_COUNTRIES = [
  { code: 'KR', label: '대한민국', sub: '한국 법인 · 개인사업자' },
  { code: 'EU', label: '유럽연합 (EU)', sub: 'EU 역내 사업장' },
  { code: 'US', label: '미국 (US)', sub: '미국 본사 · 법인' },
  { code: 'JP', label: '일본 (JP)', sub: '일본 내 사업장' },
  { code: 'CN', label: '중국 (CN)', sub: '중국 본토 · 법인' },
];

const SUBJECT_COUNTRIES = [
  { code: 'KR', label: '한국 고객' },
  { code: 'EU', label: '유럽(EU) 고객' },
  { code: 'US', label: '미국 고객' },
  { code: 'JP', label: '일본 고객' },
  { code: 'CN', label: '중국 고객' },
  { code: 'GB', label: '영국 고객' },
  { code: 'SG', label: '싱가포르 고객' },
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
  const [isDragging, setIsDragging] = useState(false);
  const [lastScanNotice, setLastScanNotice] = useState<string | null>(null);
  const [advancedInfraOpen, setAdvancedInfraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const previewPackResolution = useMemo(() => {
    const activeVendors = detectedVendors.filter(
      (v) => (v.includes_pii ?? v.sends_pii) !== false,
    );
    const regionCountries = selectedRegions
      .map((id) => STACK_BUILDER_REGIONS.find((r) => r.id === id)?.countryCode)
      .filter((c): c is string => Boolean(c));
    const destCountries = Array.from(
      new Set(
        [
          ...regionCountries,
          ...activeVendors.map(
            (v) => v.data_residency_country || v.country || v.default_country,
          ),
        ].filter((c) => c.toUpperCase() !== businessCountry.toUpperCase()),
      ),
    );
    const previewFacts: CanonicalFactModel = {
      workspace: {
        business_country: businessCountry,
        data_subject_countries: dataSubjectCountries,
        industry_domain: industryDomain,
      },
      transfers: {
        has_cross_border: computeEffectiveHasCrossBorder(
          destCountries,
          activeVendors,
          businessCountry,
          virtualTransfer,
        ),
        destination_countries: destCountries,
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
    selectedRegions,
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

  const activeSdkSet = new Set(detectedVendors.map((v) => v.sdk));
  const activePiiVendors = detectedVendors.filter(
    (v) => (v.includes_pii ?? v.sends_pii) !== false,
  );
  const excludedVendors = detectedVendors.filter(
    (v) => (v.includes_pii ?? v.sends_pii) === false,
  );

  return (
    <div className="space-y-5">
      {/* 4-Step Progress Bar */}
      <nav aria-label="가이드 위저드 단계" className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {WIZARD_STEPS.map((item) => {
          const isCurrent = step === item.id;
          const isCompleted = step > item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setStep(item.id)}
              className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                isCurrent
                  ? 'border-sky-500 bg-sky-500/12 text-slate-100'
                  : isCompleted
                    ? 'border-emerald-800/70 bg-emerald-950/20 text-emerald-200 hover:border-emerald-700'
                    : 'border-slate-800 bg-[#060913] text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                <span className="truncate">{item.title}</span>
                {isCompleted && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
              </div>
              <div className="text-[11px] opacity-80 truncate mt-0.5">
                {item.subtitle}
              </div>
            </button>
          );
        })}
      </nav>

      {/* Step 1: Service Basics */}
      {step === 1 && (
        <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-5 space-y-5">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-100">
              Step 1. 서비스 기본 정보 — 누구에게 서비스하나요?
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              사업자가 있는 국가와 고객(이용자)이 거주하는 국가, 서비스 분야를 고르면 적용해야 할 국내외 법률이 자동으로 정해집니다.
            </p>
          </div>

          {/* Business Country */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-sky-400" />
              <span>우리 회사(사업자)는 어디에 있나요?</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {BUSINESS_COUNTRIES.map((c) => {
                const selected = businessCountry === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() =>
                      onUpdateWorkspaceMeta({ businessCountry: c.code })
                    }
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      selected
                        ? 'border-sky-500 bg-sky-500/15 text-slate-100'
                        : 'border-slate-800 bg-[#060913] text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-semibold flex items-center justify-between">
                      <span>{c.label}</span>
                      <span className="font-mono text-[11px] text-sky-300">
                        {c.code}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      {c.sub}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Data Subject Countries */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-sky-400" />
              <span>서비스를 이용하는 고객(정보주체)은 어느 나라에 있나요? (복수 선택 가능)</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {SUBJECT_COUNTRIES.map((c) => {
                const active = dataSubjectCountries.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => handleToggleSubjectCountry(c.code)}
                    className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      active
                        ? 'border-sky-500 bg-sky-500/15 text-sky-200'
                        : 'border-slate-800 bg-[#060913] text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-mono text-[11px] font-semibold">
                      {c.code}
                    </div>
                    <div className="text-xs mt-0.5 truncate">{c.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Industry Domain Cards */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-200">
              어떤 분야의 서비스를 운영 중인가요?
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {INDUSTRY_CARDS.map((card) => {
                const Icon = card.icon;
                const active = industryDomain === card.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() =>
                      onUpdateWorkspaceMeta({ industryDomain: card.id })
                    }
                    className={`rounded-lg border p-3.5 text-left transition-colors ${
                      active
                        ? 'border-sky-500 bg-sky-500/15 text-slate-100'
                        : 'border-slate-800 bg-[#060913] text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          active ? 'text-sky-300' : 'text-slate-400'
                        }`}
                      />
                      <span className="text-xs font-semibold">{card.label}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                      {card.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Real-time Applicable Policy Packs Preview */}
          <div className="rounded-lg border border-slate-800 bg-[#060913] p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-200">
                선택한 조건에 따라 자동 로드될 법률 팩 ({previewPackResolution.requiredPacks.length}종)
              </div>
              {previewPackResolution.standbyPacks.length > 0 && (
                <span className="font-mono text-[11px] text-slate-500">
                  미해당 {previewPackResolution.standbyPacks.length}종 자동 제외
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {previewPackResolution.requiredPacks.length === 0 ? (
                <span className="text-xs text-slate-400">
                  현재 조건에 자동 매칭되는 활성 법률 팩이 없습니다.
                </span>
              ) : (
                previewPackResolution.requiredPacks.map((pack, idx) => {
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
                      key={`${pack.pack_meta.id}-${rawVersion}-${idx}`}
                      className="inline-flex flex-wrap items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-mono border-sky-500/50 bg-sky-500/15 text-sky-200"
                    >
                      <span>
                        L{pack.pack_meta.layer} {lawName}
                        {versionTag ? ` ${versionTag}` : ''}
                      </span>
                      {isCustomPlugin && (
                        <span className="px-1.5 py-0.2 rounded bg-violet-500/20 border border-violet-400/40 text-violet-200 text-[10px] font-sans font-semibold">
                          플러그인
                        </span>
                      )}
                      <span>· 적용 예정</span>
                    </span>
                  );
                })
              )}
            </div>
          </div>
        </section>
      )}

      {/* Step 2: Cloud & External SaaS */}
      {step === 2 && (
        <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-5 space-y-5">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-100">
              Step 2. 사용 중인 클라우드 &amp; 외부 서비스 — 데이터가 어디로 가나요?
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              개발 파일(`package.json` 등)을 올리거나 아래 버튼에서 사용 중인 서버·외부 서비스를 클릭해 선택하세요.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* 1-Sec File Scanner */}
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <UploadCloud className="w-4 h-4 text-sky-400" />
                <span>프로젝트 파일이 있다면 1초 만에 자동 찾기</span>
              </div>

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
                    ? 'border-sky-400 bg-sky-500/10'
                    : 'border-slate-700 bg-[#060913] hover:border-slate-500'
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
                <FileCode2 className="w-6 h-6 text-sky-400 mx-auto mb-2" />
                <div className="text-xs font-medium text-slate-200">
                  `package.json`, `index.html`, `_document.tsx`, `.env` 파일 드롭
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  내장 SDK·&lt;script&gt; 트래커 목록과 비교해 해외 전송 서비스를 자동으로 찾아줍니다.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-slate-400">테스트용 샘플 파일:</span>
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
                      className="px-2.5 py-1 rounded bg-[#060913] border border-slate-800 hover:border-slate-600 text-[11px] font-mono text-slate-300 transition-colors"
                    >
                      {key}
                    </button>
                  ),
                )}
              </div>

              {lastScanNotice && (
                <div className="rounded-md bg-sky-950/30 border border-sky-800/60 px-3 py-2 text-[11px] text-sky-200">
                  {lastScanNotice}
                </div>
              )}
            </div>

            {/* 30-Sec Stack Builder */}
            <div className="lg:col-span-7 space-y-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-200 mb-2">
                  <Cloud className="w-4 h-4 text-sky-400" />
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
                            ? 'bg-sky-500/15 border-sky-500/50 text-sky-200'
                            : 'bg-[#060913] border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="text-xs font-medium truncate">
                          {region.label}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                          {region.countryCode} · {region.regionCode}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-200 mb-2">
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
                            ? 'bg-sky-500/15 border-sky-500/50 text-sky-200'
                            : 'bg-[#060913] border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        {active ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        ) : (
                          <Plus className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        )}
                        <span>{item.label}</span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {preview?.country ?? item.countryCode}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Beginner-friendly Question Cards per Detected Vendor */}
          <div className="pt-4 border-t border-slate-800 space-y-3">
            <div>
              <h4 className="text-xs font-semibold text-slate-100">
                탐지된 외부 서비스 확인 ({detectedVendors.length}종) — 오탐 방지 2문항
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                개인정보(이메일·이름·IP 등)를 보내지 않는 기능이라면 &ldquo;아니오&rdquo;를 눌러 바로 규제 대상에서 제외할 수 있습니다.
              </p>
            </div>

            {detectedVendors.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-800 py-6 text-center text-xs text-slate-400">
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
                      className="rounded-lg border border-slate-800 bg-[#060913] p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-100">
                            {vendor.name}
                          </div>
                          <div className="text-[11px] font-mono text-sky-300 mt-0.5">
                            {vendor.sdk} · 기본 소재국 {defaultCountry} → 저장 리전{' '}
                            {residencyCountry}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveVendor(vendor.sdk)}
                          aria-label={`${vendor.name} 삭제`}
                          className="p-1 text-slate-400 hover:text-rose-300 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Data Residency Override */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
                          <span>실제 데이터 저장 리전</span>
                          {isOverridden && (
                            <span className="font-mono text-[10px] text-emerald-300">
                              리전 오버라이드 적용됨
                            </span>
                          )}
                        </div>
                        <select
                          value={residencyCountry}
                          onChange={(e) =>
                            onChangeVendorResidency(vendor.sdk, e.target.value)
                          }
                          aria-label={`${vendor.name} 데이터 저장 리전`}
                          className="w-full rounded border border-slate-700 bg-[#0B1120] px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
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
                        <div className="text-xs text-slate-300">
                          1) 이 서비스로 고객의 이름·이메일 등 개인정보를 보내나요?
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (!includesPii) onToggleVendorPii(vendor.sdk);
                            }}
                            className={`px-2.5 py-1.5 rounded border text-xs font-medium transition-colors ${
                              includesPii
                                ? 'bg-sky-500/20 border-sky-500/60 text-sky-200'
                                : 'bg-[#0B1120] border-slate-800 text-slate-400 hover:border-slate-700'
                            }`}
                          >
                            예, 개인정보 전송함
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (includesPii) onToggleVendorPii(vendor.sdk);
                            }}
                            className={`px-2.5 py-1.5 rounded border text-xs font-medium transition-colors ${
                              !includesPii
                                ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-200'
                                : 'bg-[#0B1120] border-slate-800 text-slate-400 hover:border-slate-700'
                            }`}
                          >
                            아니오 (심사 제외)
                          </button>
                        </div>
                      </div>

                      {/* Q2: Purpose */}
                      {includesPii && (
                        <div className="space-y-1.5">
                          <div className="text-xs text-slate-300 flex items-center gap-1.5">
                            <span>2) 어떤 용도로 쓰시나요?</span>
                            <InfoTooltip term="entrustment_exemption" />
                          </div>
                          <div className="grid grid-cols-1 gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                onChangeVendorPurpose(vendor.sdk, 'ENTRUSTMENT')
                              }
                              className={`px-3 py-2 rounded border text-left text-xs transition-colors ${
                                vendor.transfer_purpose === 'ENTRUSTMENT'
                                  ? 'bg-sky-500/15 border-sky-500/50 text-sky-200'
                                  : 'bg-[#0B1120] border-slate-800 text-slate-300 hover:border-slate-700'
                              }`}
                            >
                              <div className="font-medium">
                                서비스 운영 위탁 (제3호 특례)
                              </div>
                              <div className="text-[11px] text-slate-400">
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
                                  ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
                                  : 'bg-[#0B1120] border-slate-800 text-slate-300 hover:border-slate-700'
                              }`}
                            >
                              <div className="font-medium">
                                광고·분석·외부 공유 (제3자 제공 / 분석)
                              </div>
                              <div className="text-[11px] text-slate-400">
                                마케팅 통계, 타겟 광고 또는 외부 파트너 공유 목적
                              </div>
                            </button>
                          </div>
                          {lookupSdkMetadata(vendor.sdk)?.purpose_guide_ko && (
                            <p className="text-[11px] text-sky-300/90 bg-sky-950/25 border border-sky-900/50 rounded px-2.5 py-1.5 leading-snug">
                              권장 가이드: {lookupSdkMetadata(vendor.sdk)?.purpose_guide_ko}
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
        <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-5 space-y-5">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-100">
              Step 3. 개인정보 처리방침 &amp; 기본 보안 점검
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              웹사이트에 올려둔 개인정보 처리방침 문구와 3가지 기본 보안 O/X 질문만 답하면 준비 끝입니다.
            </p>
          </div>

          {/* Privacy Policy Radio Branch */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-sky-400" />
              <span>현재 웹사이트에 게시된 개인정보 처리방침이 있나요?</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onToggleNoPolicyDoc(false)}
                className={`rounded-lg border p-3.5 text-left transition-colors ${
                  !noPolicyDoc
                    ? 'border-sky-500 bg-sky-500/15 text-slate-100'
                    : 'border-slate-800 bg-[#060913] text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-semibold">
                  예, 아래에 텍스트를 붙여넣겠습니다
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  실제 사용 중인 서비스·국가명이 빠짐없이 적혀 있는지 비교해 드립니다.
                </div>
              </button>

              <button
                type="button"
                onClick={() => onToggleNoPolicyDoc(true)}
                className={`rounded-lg border p-3.5 text-left transition-colors ${
                  noPolicyDoc
                    ? 'border-amber-500 bg-amber-500/15 text-slate-100'
                    : 'border-slate-800 bg-[#060913] text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-semibold">
                  아니오, 아직 작성된 처리방침이 없습니다
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  심사 완료 후 우리 서비스에 맞는 국외 이전 고지문 초안을 자동으로 만들어 드립니다.
                </div>
              </button>
            </div>

            {!noPolicyDoc && (
              <div>
                <textarea
                  value={policyText}
                  onChange={(e) => onChangePolicyText(e.target.value)}
                  rows={6}
                  placeholder="예: '당사는 이용자의 개인정보를 국내 서버에만 보관합니다.' 또는 기존 처리방침의 국외 이전 조항을 붙여넣으세요."
                  className="w-full rounded-lg bg-[#060913] border border-slate-800 p-3.5 text-xs leading-relaxed text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <div className="mt-1.5 text-[11px] text-slate-400 text-right tabular-nums">
                  {policyText.length}자 입력됨
                </div>
              </div>
            )}
          </div>

          {/* 3 Non-Expert O/X Security Questions */}
          <div className="pt-4 border-t border-slate-800 space-y-3">
            <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-sky-400" />
              <span>기본 보안 및 해외 접근 O/X 점검 (3문항)</span>
            </div>

            <div className="space-y-2.5">
              {/* O/X 1 */}
              <div className="rounded-lg border border-slate-800 bg-[#060913] p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-slate-100">
                    1. HTTPS 전송 암호화 및 DB 저장 암호화를 적용했나요?
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
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
                    className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors whitespace-nowrap ${
                      security.encryption_in_transit && security.encryption_at_rest
                        ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-200'
                        : 'bg-[#0B1120] border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    예 (O)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeSecurity({
                        encryption_in_transit: false,
                        encryption_at_rest: false,
                      })
                    }
                    className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors whitespace-nowrap ${
                      !security.encryption_in_transit || !security.encryption_at_rest
                        ? 'bg-rose-500/20 border-rose-500/60 text-rose-200'
                        : 'bg-[#0B1120] border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    아니오 (X)
                  </button>
                </div>
              </div>

              {/* O/X 2 */}
              <div className="rounded-lg border border-slate-800 bg-[#060913] p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-slate-100 flex items-center gap-1.5">
                    <span>
                      2. 해외 지사 직원이나 해외 외주 개발자가 DB/관리자 페이지에 접근하나요?
                    </span>
                    <InfoTooltip term="virtual_transfer" />
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    서버가 서울에 있어도 해외에서 원격 열람이 가능하면 가상 국외 이전으로 심사됩니다.
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      onChangeVirtualTransfer({ foreign_iam_access: true })
                    }
                    className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors whitespace-nowrap ${
                      virtualTransfer.foreign_iam_access
                        ? 'bg-rose-500/20 border-rose-500/60 text-rose-200'
                        : 'bg-[#0B1120] border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    예, 해외 접근 있음 (O)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeVirtualTransfer({ foreign_iam_access: false })
                    }
                    className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors whitespace-nowrap ${
                      !virtualTransfer.foreign_iam_access
                        ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-200'
                        : 'bg-[#0B1120] border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    아니오, 국내만 접근 (X)
                  </button>
                </div>
              </div>

              {/* O/X 3 */}
              <div className="rounded-lg border border-slate-800 bg-[#060913] p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-slate-100 flex items-center gap-1.5">
                    <span>
                      3. 암호화 키(KMS)를 해외 리전 또는 외부 벤더가 단독 관리하나요?
                    </span>
                    <InfoTooltip term="kms" />
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    보안 열쇠(KMS)를 우리 회사가 서울 리전에서 직접 통제하면 &ldquo;아니오(X)&rdquo;입니다.
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      onChangeVirtualTransfer({ foreign_kms_control: true })
                    }
                    className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors whitespace-nowrap ${
                      virtualTransfer.foreign_kms_control
                        ? 'bg-rose-500/20 border-rose-500/60 text-rose-200'
                        : 'bg-[#0B1120] border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    예, 해외 키 통제 (O)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeVirtualTransfer({ foreign_kms_control: false })
                    }
                    className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors whitespace-nowrap ${
                      !virtualTransfer.foreign_kms_control
                        ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-200'
                        : 'bg-[#0B1120] border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    아니오, 국내 자체 관리 (X)
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Optional Advanced Terraform/IAM Accordion */}
          <div className="rounded-lg border border-slate-800 bg-[#060913] overflow-hidden">
            <button
              type="button"
              onClick={() => setAdvancedInfraOpen((prev) => !prev)}
              className="w-full px-4 py-3 flex items-center justify-between text-xs text-slate-300 hover:bg-slate-800/30 transition-colors"
            >
              <span>
                (선택) 개발자용 Terraform / AWS IAM 코드 직접 입력
              </span>
              {advancedInfraOpen ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {advancedInfraOpen && (
              <div className="p-4 pt-2 border-t border-slate-800 space-y-2.5">
                <textarea
                  value={infraCode}
                  onChange={(e) => onChangeInfraCode(e.target.value)}
                  rows={5}
                  placeholder={'provider "aws" { region = "ap-northeast-2" }'}
                  className="w-full rounded-lg bg-[#0B1120] border border-slate-800 p-3 font-mono text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={security.pii_masked_before_transfer}
                    onChange={(e) =>
                      onChangeSecurity({
                        pii_masked_before_transfer: e.target.checked,
                      })
                    }
                    className="rounded border-slate-600 bg-[#0B1120] text-sky-500"
                  />
                  <span>해외 API 전송 전 이름·전화번호 등 개인정보 마스킹(가명처리) 적용됨</span>
                </label>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Step 4: Departure Declaration Summary & Run */}
      {step === 4 && (
        <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800 pb-4">
            <div>
              <div className="text-[11px] font-mono text-sky-300 uppercase tracking-wider">
                BORDER CHECKER · DEPARTURE DECLARATION
              </div>
              <h3 className="font-display text-base font-semibold text-slate-100 mt-0.5">
                Step 4. 데이터 출국 신고서 최종 확인
              </h3>
            </div>
            <span className="text-xs text-slate-400">
              입력 내용을 확인한 뒤 아래 출입국 심사 버튼을 눌러주세요.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* Summary 1 */}
            <div className="rounded-lg border border-slate-800 bg-[#060913] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-100">
                  1. 서비스 관할권
                </span>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-[11px] text-sky-400 hover:text-sky-300"
                >
                  수정
                </button>
              </div>
              <div className="space-y-1 text-slate-300">
                <div>사업자 소재국: {businessCountry}</div>
                <div>고객 국가: {dataSubjectCountries.join(', ')}</div>
                <div>산업 도메인: {industryDomain}</div>
              </div>
            </div>

            {/* Summary 2 */}
            <div className="rounded-lg border border-slate-800 bg-[#060913] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-100">
                  2. 클라우드 &amp; 외부 서비스
                </span>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-[11px] text-sky-400 hover:text-sky-300"
                >
                  수정
                </button>
              </div>
              <div className="space-y-1 text-slate-300">
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
                  <div className="text-slate-400">
                    심사 제외(비-PII): {excludedVendors.length}종
                  </div>
                )}
              </div>
            </div>

            {/* Summary 3 */}
            <div className="rounded-lg border border-slate-800 bg-[#060913] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-100">
                  3. 처리방침 &amp; 보안 점검
                </span>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="text-[11px] text-sky-400 hover:text-sky-300"
                >
                  수정
                </button>
              </div>
              <div className="space-y-1 text-slate-300">
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
                  {security.encryption_in_transit && security.encryption_at_rest
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
                <div className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-sky-500/15 border border-sky-500/40 text-sky-200 text-sm font-semibold whitespace-nowrap">
                  <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                  <span>AI 파싱 및 출입국 심사 진행 중...</span>
                </div>
                <button
                  type="button"
                  onClick={onCancelInspection}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 text-sm font-bold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>응답 중지</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onRunInspection}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
              >
                <Play className="w-4 h-4" />
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
                          ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300'
                          : current
                            ? 'bg-sky-950/40 border-sky-500/60 text-sky-200'
                            : 'bg-[#060913] border-slate-800 text-slate-500'
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

      {/* Wizard Prev / Next Footer */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          disabled={step === 1}
          onClick={() => setStep((prev) => Math.max(1, prev - 1) as WizardStep)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-800 bg-[#0B1120] hover:border-slate-700 disabled:opacity-40 text-xs font-medium text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>이전 단계</span>
        </button>

        <span className="font-mono text-xs text-slate-400 tabular-nums">
          Step {step} / 4
        </span>

        {step < 4 ? (
          <button
            type="button"
            onClick={() => setStep((prev) => Math.min(4, prev + 1) as WizardStep)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold transition-colors"
          >
            <span>다음 단계</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : inspectionState.running ? (
          <button
            type="button"
            onClick={onCancelInspection}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-slate-950 text-xs font-semibold transition-colors"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>응답 중지</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onRunInspection}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            <span>심사 실행</span>
          </button>
        )}
      </div>
    </div>
  );
}
