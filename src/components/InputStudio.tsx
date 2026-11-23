import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Code2,
  Cpu,
  FileCode2,
  FileText,
  Loader2,
  Play,
  Plus,
  Shield,
  Square,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import {
  SAMPLE_DEPENDENCY_FILES,
  STACK_BUILDER_REGIONS,
  STACK_BUILDER_SAAS,
  buildVendorFromSdk,
  scanDependencyFile,
} from '@/lib/dependency-scanner';
import type { DemoScenario } from '@/lib/demo-scenarios';
import {
  RESIDENCY_REGION_OPTIONS,
  type CanonicalFactModel,
  type DetectedVendor,
  type IndustryDomain,
  type TransferPurpose,
  type VirtualTransferFacts,
} from '@/lib/types';
import { InfoTooltip } from './InfoTooltip';
import type { ToastVariant } from './Toast';

export interface InspectionStageState {
  running: boolean;
  stepIndex: number; // 0..3
}

interface InputStudioProps {
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
  scenarios: DemoScenario[];
  activeScenarioId: string | null;
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
  onLoadScenario: (scenarioId: string) => void;
  onRunInspection: () => void;
  onCancelInspection?: () => void;
  hideScenarioBar?: boolean;
  onShowToast?: (message: string, variant?: ToastVariant) => void;
}

const INSPECTION_STEPS = [
  '1. 처리방침 NLP 파싱',
  '2. 의존성 · 인프라 스캔',
  '3. 문서-인프라 Drift 대조',
  '4. 4계층 법률 팩 병렬 판정',
];

const SUBJECT_COUNTRY_OPTIONS = ['KR', 'EU', 'US', 'JP', 'CN', 'GB', 'SG'];

export function InputStudio({
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
  scenarios,
  activeScenarioId,
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
  onLoadScenario,
  onRunInspection,
  onCancelInspection,
  hideScenarioBar = false,
  onShowToast,
}: InputStudioProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lastScanNotice, setLastScanNotice] = useState<string | null>(null);

  const handleScanText = (fileName: string, content: string) => {
    const scan = scanDependencyFile(fileName, content);
    onApplyScannedVendors(scan.detectedVendors, scan.detectedRegions);
    const msg =
      `${fileName} (${scan.fileType}) 스캔 완료 · 탐지된 SDK ${scan.detectedVendors.length}종` +
      (scan.unknownPackages.length > 0
        ? ` · 미등록 패키지 ${scan.unknownPackages.length}개`
        : '');
    setLastScanNotice(msg);
    onShowToast?.(`${fileName} 스캔 완료 (SDK ${scan.detectedVendors.length}종 탐지)`, 'success');
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      handleScanText(file.name, content);
    };
    reader.readAsText(file);
  };

  const handleToggleSubjectCountry = (code: string) => {
    const exists = dataSubjectCountries.includes(code);
    if (exists && dataSubjectCountries.length === 1) return;
    const next = exists
      ? dataSubjectCountries.filter((c) => c !== code)
      : [...dataSubjectCountries, code];
    onUpdateWorkspaceMeta({ dataSubjectCountries: next });
  };

  const activeSdkSet = new Set(detectedVendors.map((v) => v.sdk));

  return (
    <div className="space-y-5">
      {/* Top Demo Preset Bar & Workspace Jurisdiction Context */}
      <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-4 space-y-4">
        {!hideScenarioBar && (
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-100">
                실시간 입력 스튜디오 · 3-Way 정합성 대조
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                의존성 파일·스택, 개인정보 처리방침, 인프라 코드를 입력하고 출입국 심사를 실행하세요.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {scenarios.map((sc) => {
                const isSelected = sc.id === activeScenarioId;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => onLoadScenario(sc.id)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      isSelected
                        ? 'bg-sky-500 text-slate-950 font-semibold'
                        : 'bg-[#060913] text-slate-300 border border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {sc.short_label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Workspace Context Row */}
        <div
          className={`${
            hideScenarioBar ? '' : 'pt-3 border-t border-slate-800'
          } flex flex-wrap items-center gap-4 text-xs`}
        >
          <div className="flex items-center gap-2">
            <span className="text-slate-400">사업자 소재국</span>
            <select
              value={businessCountry}
              onChange={(e) =>
                onUpdateWorkspaceMeta({ businessCountry: e.target.value })
              }
              aria-label="사업자 소재국"
              className="rounded-md bg-[#060913] border border-slate-700 px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="KR">KR (대한민국)</option>
              <option value="EU">EU (유럽연합)</option>
              <option value="US">US (미국)</option>
              <option value="JP">JP (일본)</option>
              <option value="CN">CN (중국)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">산업 도메인</span>
            <select
              value={industryDomain}
              onChange={(e) =>
                onUpdateWorkspaceMeta({
                  industryDomain: e.target.value as IndustryDomain,
                })
              }
              aria-label="산업 도메인"
              className="rounded-md bg-[#060913] border border-slate-700 px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="GENERAL">GENERAL (일반 SaaS)</option>
              <option value="AI_SAAS">AI_SAAS (생성형 AI)</option>
              <option value="FINTECH">FINTECH (핀테크)</option>
              <option value="HEALTHCARE">HEALTHCARE (헬스케어)</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-400 mr-1">정보주체 국가:</span>
            {SUBJECT_COUNTRY_OPTIONS.map((code) => {
              const active = dataSubjectCountries.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => handleToggleSubjectCountry(code)}
                  className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${
                    active
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      : 'bg-[#060913] text-slate-400 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {code}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Step 1: 1-Sec Dependency Scanner & 30-Sec Stack Builder */}
      <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-5 space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Drag & Drop Dependency File Scanner */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-sky-400" />
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  1초 의존성 파일 스캐너
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                package.json · index.html · _document.tsx · .env
              </span>
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
                  : 'border-slate-700 bg-[#060913] hover:border-slate-600'
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
                의존성·HTML 스크립트 파일을 드래그 앤 드롭하거나 클릭해 업로드
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                내장 SDK·&lt;script&gt; 트래커 DB와 대조해 해외 전송 엔드포인트를 즉시 추출합니다.
              </div>
            </div>

            {/* Instant Sample File Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-slate-400">샘플 즉시 로드:</span>
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
                    className="px-2.5 py-1 rounded bg-[#060913] border border-slate-800 hover:border-slate-600 text-[11px] font-mono text-slate-300 transition-colors whitespace-nowrap"
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

          {/* 30-Sec Icon Stack Builder */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-sky-400" />
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  30초 아이콘 스택 빌더
                </h3>
              </div>
              <span className="text-[11px] text-slate-400">
                파일 없이 클릭만으로 리전 및 SaaS 스택 구성
              </span>
            </div>

            <div>
              <div className="text-[11px] font-medium text-slate-400 mb-1.5">
                클라우드 리전 · 호스팅
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
                        {region.regionCode} · {region.countryCode}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-medium text-slate-400 mb-1.5">
                주요 외부 SaaS · AI · 결제 SDK
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

        {/* 1-Click PII & Transfer Purpose Table */}
        <div className="pt-4 border-t border-slate-800">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <h4 className="text-xs font-semibold text-slate-200">
                탐지된 SDK · 1클릭 오탐 방지 확인 테이블 ({detectedVendors.length}종)
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                개인정보를 보내지 않는 익명 SDK는 스위치를 끄면 즉시 위반 대상에서 제외됩니다.
              </p>
            </div>
          </div>

          {detectedVendors.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-800 py-5 text-center text-xs text-slate-400">
              탐지된 SDK가 없습니다. 위에서 파일을 드롭하거나 SaaS 스택 버튼을 클릭해 추가하세요.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-3 font-medium">벤더 / SDK</th>
                    <th className="py-2 pr-3 font-medium">데이터 저장 리전</th>
                    <th className="py-2 pr-3 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <span>인증</span>
                        <InfoTooltip term="dpf_scc" />
                      </span>
                    </th>
                    <th className="py-2 pr-3 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <span>이전 목적</span>
                        <InfoTooltip term="entrustment_exemption" />
                      </span>
                    </th>
                    <th className="py-2 pr-3 font-medium">PII 전송 여부</th>
                    <th className="py-2 text-right font-medium">삭제</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
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
                      <tr key={vendor.sdk} className="hover:bg-slate-800/25">
                        <td className="py-2.5 pr-3">
                          <div className="font-medium text-slate-100">
                            {vendor.name}
                          </div>
                          <div className="font-mono text-[11px] text-sky-300">
                            {vendor.sdk}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3">
                          <select
                            value={residencyCountry}
                            onChange={(e) =>
                              onChangeVendorResidency(vendor.sdk, e.target.value)
                            }
                            aria-label={`${vendor.name} 데이터 저장 리전`}
                            className="rounded bg-[#060913] border border-slate-700 px-2 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
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
                          {isOverridden && (
                            <div className="mt-1 font-mono text-[10px] text-emerald-300">
                              기본 {defaultCountry} → {residencyCountry} 오버라이드
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                          DPF {vendor.dpf_certified ? 'Y' : 'N'} · ZDR{' '}
                          {vendor.zero_data_retention ? 'Y' : 'N'}
                        </td>
                        <td className="py-2.5 pr-3">
                          <select
                            value={vendor.transfer_purpose}
                            onChange={(e) =>
                              onChangeVendorPurpose(
                                vendor.sdk,
                                e.target.value as TransferPurpose,
                              )
                            }
                            aria-label={`${vendor.name} 이전 목적`}
                            className="rounded bg-[#060913] border border-slate-700 px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                          >
                            <option value="ENTRUSTMENT">처리위탁·보관 (ENTRUSTMENT)</option>
                            <option value="THIRD_PARTY_SHARING">
                              제3자 제공 (THIRD_PARTY_SHARING)
                            </option>
                            <option value="ANALYTICS">분석·마케팅 (ANALYTICS)</option>
                          </select>
                        </td>
                        <td className="py-2.5 pr-3">
                          <button
                            type="button"
                            onClick={() => onToggleVendorPii(vendor.sdk)}
                            className={`px-2.5 py-1 rounded border text-[11px] font-medium transition-colors whitespace-nowrap ${
                              includesPii
                                ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                                : 'bg-slate-800/80 border-slate-700 text-slate-400'
                            }`}
                          >
                            {includesPii ? 'PII 전송 (심사 포함)' : 'PII 미전송 (제외)'}
                          </button>
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => onRemoveVendor(vendor.sdk)}
                            aria-label={`${vendor.name} 제거`}
                            className="p-1.5 text-slate-400 hover:text-rose-300 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Step 2: Dual Editor (Privacy Policy Text + Infra/Terraform/IAM Code) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        {/* Left Editor: Privacy Policy Text */}
        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-5 flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-sky-400" />
              <h3 className="font-display text-sm font-semibold text-slate-100">
                개인정보 처리방침 및 국외 이전 고지문
              </h3>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={noPolicyDoc}
                onChange={(e) => onToggleNoPolicyDoc(e.target.checked)}
                className="rounded border-slate-600 bg-[#060913] text-sky-500 focus:ring-sky-500"
              />
              <span>처리방침 없음</span>
            </label>
          </div>

          <textarea
            value={noPolicyDoc ? '' : policyText}
            disabled={noPolicyDoc}
            onChange={(e) => onChangePolicyText(e.target.value)}
            rows={8}
            placeholder="개인정보 처리방침 또는 국외 이전 고지 조항을 붙여넣으세요. (예: '국내 서버에만 단독 보관' 또는 'OpenAI LLC(미국) 위탁 및 AI 학습 제외...')"
            className="w-full flex-1 rounded-lg bg-[#060913] border border-slate-800 p-3.5 text-xs leading-relaxed text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-40 resize-y"
          />
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400 tabular-nums">
            <span>한국어 / 영어 처리방침 하이브리드 NLP 파싱 지원</span>
            <span>{noPolicyDoc ? '0자 (문서 없음)' : `${policyText.length}자`}</span>
          </div>
        </div>

        {/* Right Editor: Infra / Terraform / IAM Code + Virtual Transfer Toggles */}
        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-5 flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-sky-400" />
              <h3 className="font-display text-sm font-semibold text-slate-100">
                인프라 코드 (Terraform / AWS IAM JSON)
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              .tf · iam.json
            </span>
          </div>

          <textarea
            value={infraCode}
            onChange={(e) => onChangeInfraCode(e.target.value)}
            rows={6}
            placeholder={'provider "aws" { region = "ap-northeast-2" }\n// 또는 IAM Policy JSON을 입력하세요.'}
            className="w-full flex-1 rounded-lg bg-[#060913] border border-slate-800 p-3.5 font-mono text-xs leading-relaxed text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-y"
          />

          {/* Virtual Transfer & Technical Security Toggles */}
          <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <label className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 cursor-pointer">
              <span className="text-slate-300 inline-flex items-center gap-1.5">
                <span>해외 지사 IAM 열람 권한</span>
                <InfoTooltip term="virtual_transfer" />
              </span>
              <input
                type="checkbox"
                checked={virtualTransfer.foreign_iam_access}
                onChange={(e) =>
                  onChangeVirtualTransfer({ foreign_iam_access: e.target.checked })
                }
                className="rounded border-slate-600 bg-[#0B1120] text-rose-500 focus:ring-rose-500"
              />
            </label>

            <label className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 cursor-pointer">
              <span className="text-slate-300 inline-flex items-center gap-1.5">
                <span>해외 KMS 키 관리 통제</span>
                <InfoTooltip term="kms" />
              </span>
              <input
                type="checkbox"
                checked={virtualTransfer.foreign_kms_control}
                onChange={(e) =>
                  onChangeVirtualTransfer({ foreign_kms_control: e.target.checked })
                }
                className="rounded border-slate-600 bg-[#0B1120] text-rose-500 focus:ring-rose-500"
              />
            </label>

            <label className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 cursor-pointer">
              <span className="text-slate-300">전송 · 저장 암호화 (TLS/KMS)</span>
              <input
                type="checkbox"
                checked={
                  security.encryption_in_transit && security.encryption_at_rest
                }
                onChange={(e) =>
                  onChangeSecurity({
                    encryption_in_transit: e.target.checked,
                    encryption_at_rest: e.target.checked,
                  })
                }
                className="rounded border-slate-600 bg-[#0B1120] text-sky-500 focus:ring-sky-500"
              />
            </label>

            <label className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 cursor-pointer">
              <span className="text-slate-300">전송 전 PII 마스킹 적용</span>
              <input
                type="checkbox"
                checked={security.pii_masked_before_transfer}
                onChange={(e) =>
                  onChangeSecurity({
                    pii_masked_before_transfer: e.target.checked,
                  })
                }
                className="rounded border-slate-600 bg-[#0B1120] text-sky-500 focus:ring-sky-500"
              />
            </label>
          </div>
        </div>
      </section>

      {/* Run Border Inspection CTA + 4-Step Real-Time Scan Progress */}
      <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-sky-400 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-slate-100">
                4계층 정합성 출입국 심사 실행
              </div>
              <div className="text-xs text-slate-400">
                처리방침과 코드·인프라 설정 간 Drift 및 4계층 법정 고지 누락 여부를 대조합니다.
              </div>
            </div>
          </div>

          {inspectionState.running ? (
            <div className="flex items-center gap-2 shrink-0">
              <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sky-500/15 border border-sky-500/40 text-sky-200 text-xs font-semibold whitespace-nowrap">
                <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                <span>심사 진행 중...</span>
              </div>
              <button
                type="button"
                onClick={onCancelInspection}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>응답 중지</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onRunInspection}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
            >
              <Play className="w-4 h-4" />
              <span>출입국 심사 실행 (Run Border Inspection)</span>
            </button>
          )}
        </div>

        {inspectionState.running && (
          <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-4 gap-2.5">
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
                  ) : current ? (
                    <Cpu className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full border border-slate-700 shrink-0" />
                  )}
                  <span className="truncate">{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
