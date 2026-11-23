import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileJson,
  Layers,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { resolvePackCatalog } from '@/lib/pack-loader';
import {
  CANONICAL_FACT_KEYS,
  DSL_OPERATORS,
  VENDOR_MATCH_FIELDS,
  type DslOperator,
  type PolicyLayer,
  type PolicyPackV2,
} from '@/lib/types';
import type { ToastVariant } from './Toast';

interface PolicyPacksTabProps {
  builtInPacks: PolicyPackV2[];
  customPacks: PolicyPackV2[];
  disabledPackIds: string[];
  onTogglePackActive: (packId: string) => void;
  onInstallCustomPack: (pack: PolicyPackV2) => void;
  onDeleteCustomPack: (packId: string) => void;
  onShowToast?: (message: string, variant?: ToastVariant) => void;
}

const ALLOWED_OPERATORS = new Set<DslOperator>(DSL_OPERATORS);

interface PolicyPackTemplateWithSpec extends PolicyPackV2 {
  canonical_fact_dictionary_ssot: {
    canonical_fact_keys: readonly string[];
    allowed_operators: readonly string[];
    vendor_match_fields: readonly string[];
  };
}

const EMPTY_PACK_TEMPLATE: PolicyPackTemplateWithSpec = {
  canonical_fact_dictionary_ssot: {
    canonical_fact_keys: [...CANONICAL_FACT_KEYS],
    allowed_operators: [...DSL_OPERATORS],
    vendor_match_fields: [...VENDOR_MATCH_FIELDS],
  },
  pack_meta: {
    id: 'CUSTOM_LAW_V2',
    layer: 1,
    country_code: 'TW',
    law_name: '신규 국가 개인정보 보호법 예시',
    version: '2.0.0',
    effective_date: '2026-01-01',
    penalty_summary: '관련 법령상 시정명령 및 과태료·과징금 부과 가능 조항 요약',
    adequacy_countries: ['EU', 'KR'],
  },
  applicability: {
    any: [
      { fact: 'workspace.business_country', operator: 'equals', value: 'TW' },
      { fact: 'workspace.data_subject_countries', operator: 'includes', value: 'TW' },
    ],
  },
  rules: [
    {
      rule_id: 'CUSTOM_RULE_01',
      category: '국외 이전 고지 및 벤더 조건 점검',
      severity: 'BLOCKER',
      article_citation: '제21조',
      plain_title: '신규 법령 필수 고지 누락 또는 미인증 벤더 전송 점검',
      plain_explanation:
        '국외 이전 시 처리방침 공개 여부와 DPF 미인증 해외 벤더 전송 여부를 정형 AST로 검증합니다.',
      condition_dsl: {
        all: [
          { fact: 'transfers.has_cross_border', operator: 'equals', value: true },
          {
            any: [
              { fact: 'legal_doc.has_entrustment_disclosure', operator: 'equals', value: false },
              {
                fact: 'transfers.detected_vendors',
                operator: 'any_vendor_matches',
                value: {
                  country: 'US',
                  dpf_certified: false,
                  includes_pii: true,
                },
              },
            ],
          },
        ],
      },
      drift_check: {
        enabled: true,
        drift_type: 'UNDISCLOSED_COUNTRY',
        fact_path: 'transfers.destination_countries',
        doc_claim_path: 'legal_doc.disclosed_countries',
        condition: {
          all: [
            { fact: 'transfers.has_cross_border', operator: 'equals', value: true },
            {
              fact: 'transfers.destination_countries',
              operator: 'not_subset_of',
              value: '@legal_doc.disclosed_countries',
            },
          ],
        },
        alert_message: '실제 해외 전송 도착국이 처리방침 공개 국가 목록에 포함되지 않았습니다.',
        summary: '실제 해외 전송 도착국이 처리방침 공개 국가 목록에 포함되지 않았습니다.',
      },
      remediation: {
        legal_template: '국외 이전 고지 조항 및 이전받는 자/국가 목록을 추가하세요.',
        infra_patch_hint: '해외 전송 리전 또는 DPF 인증/보호조치를 확인하세요.',
      },
    },
  ],
};

const isEmptyPlainObject = (val: unknown): boolean =>
  Boolean(val) &&
  typeof val === 'object' &&
  !Array.isArray(val) &&
  Object.keys(val as Record<string, unknown>).length === 0;

export function validatePolicyPackV2(
  raw: unknown,
): { ok: true; pack: PolicyPackV2 } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: '유효한 JSON 객체가 아닙니다.' };
  }
  const obj = raw as Record<string, unknown>;
  const meta = obj.pack_meta as Record<string, unknown> | undefined;
  if (!meta || typeof meta !== 'object') {
    return { ok: false, error: '`pack_meta` 필드가 누락되었습니다.' };
  }
  if (typeof meta.id !== 'string' || !meta.id.trim()) {
    return { ok: false, error: '`pack_meta.id` 문자열이 필요합니다.' };
  }
  if (![1, 2, 3, 4].includes(Number(meta.layer))) {
    return { ok: false, error: '`pack_meta.layer`는 1~4 중 하나여야 합니다.' };
  }
  if (typeof meta.country_code !== 'string' || typeof meta.law_name !== 'string') {
    return { ok: false, error: '`pack_meta.country_code` 및 `law_name`이 필요합니다.' };
  }
  if (!obj.applicability || typeof obj.applicability !== 'object' || Array.isArray(obj.applicability)) {
    return { ok: false, error: '`applicability` 조건 트리가 필요합니다.' };
  }
  if (!Array.isArray(obj.rules) || obj.rules.length === 0) {
    return { ok: false, error: '`rules` 배열에 최소 1개 이상의 룰이 필요합니다.' };
  }

  const checkDslOperators = (node: unknown): string | null => {
    if (!node || typeof node !== 'object') return '잘못된 condition_dsl 노드입니다.';
    const n = node as Record<string, unknown>;
    if (Array.isArray(n.all)) {
      for (const child of n.all) {
        const err = checkDslOperators(child);
        if (err) return err;
      }
      return null;
    }
    if (Array.isArray(n.any)) {
      for (const child of n.any) {
        const err = checkDslOperators(child);
        if (err) return err;
      }
      return null;
    }
    if (n.not) return checkDslOperators(n.not);
    if (typeof n.fact !== 'string' || !ALLOWED_OPERATORS.has(n.operator as DslOperator)) {
      return `허용되지 않은 DSL 연산자(${String(n.operator)}) 또는 fact 누락이 발견되었습니다.`;
    }
    return null;
  };

  const appObj = obj.applicability as Record<string, unknown>;
  const isTriggerIfFallback =
    typeof appObj.trigger_if === 'string' &&
    appObj.trigger_if.trim().length > 0 &&
    !('all' in appObj) &&
    !('any' in appObj) &&
    !('not' in appObj) &&
    !('fact' in appObj);

  if (!isTriggerIfFallback) {
    const appErr = checkDslOperators(obj.applicability);
    if (appErr) return { ok: false, error: `applicability: ${appErr}` };
  }

  for (const rule of obj.rules) {
    const r = rule as Record<string, unknown>;
    if (typeof r.rule_id !== 'string' || typeof r.plain_title !== 'string') {
      return { ok: false, error: '각 룰에는 `rule_id`와 `plain_title`이 필요합니다.' };
    }
    if (r.severity !== 'BLOCKER' && r.severity !== 'WARNING') {
      return { ok: false, error: `룰 ${r.rule_id}의 severity는 BLOCKER 또는 WARNING이어야 합니다.` };
    }
    const dslErr = checkDslOperators(r.condition_dsl);
    if (dslErr) return { ok: false, error: `룰 ${r.rule_id}: ${dslErr}` };

    if (r.drift_check !== undefined && r.drift_check !== null) {
      if (typeof r.drift_check !== 'object' || Array.isArray(r.drift_check)) {
        return { ok: false, error: `룰 ${r.rule_id}: drift_check는 객체여야 합니다.` };
      }
      const driftObj = r.drift_check as Record<string, unknown>;
      if (
        driftObj.enabled !== false &&
        driftObj.condition !== undefined &&
        !isEmptyPlainObject(driftObj.condition)
      ) {
        const driftCondErr = checkDslOperators(driftObj.condition);
        if (driftCondErr) {
          return {
            ok: false,
            error: `룰 ${r.rule_id}의 drift_check.condition: ${driftCondErr}`,
          };
        }
      }
    }
  }

  return { ok: true, pack: raw as PolicyPackV2 };
}

const LAYER_TABS: Array<{ id: 'ALL' | PolicyLayer; label: string }> = [
  { id: 'ALL', label: '전체 계층' },
  { id: 1, label: 'Layer 1 (출발국 반출 규제)' },
  { id: 2, label: 'Layer 2 (도착국 리스크 프로필)' },
  { id: 3, label: 'Layer 3 (SDK·트래커 부수 규제)' },
  { id: 4, label: 'Layer 4 (산업·AI 특화 규제)' },
];

export function PolicyPacksTab({
  builtInPacks,
  customPacks,
  disabledPackIds,
  onTogglePackActive,
  onInstallCustomPack,
  onDeleteCustomPack,
  onShowToast,
}: PolicyPacksTabProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [layerFilter, setLayerFilter] = useState<'ALL' | PolicyLayer>('ALL');
  const [inspectedPack, setInspectedPack] = useState<PolicyPackV2 | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const [uploadStatus, setUploadStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const builtInRefSet = new Set(builtInPacks);
  const { supersededPackIds } = resolvePackCatalog(
    [...builtInPacks, ...customPacks],
    disabledPackIds,
  );
  const supersededSet = new Set(supersededPackIds);
  const allPacks = [...builtInPacks, ...customPacks];
  const filteredPacks =
    layerFilter === 'ALL'
      ? allPacks
      : allPacks.filter((p) => p.pack_meta.layer === layerFilter);

  const handleInstallJsonText = (rawText: string) => {
    try {
      const parsed = JSON.parse(rawText);
      const validation = validatePolicyPackV2(parsed);
      if (!validation.ok) {
        setUploadStatus({ type: 'error', message: validation.error });
        onShowToast?.(validation.error, 'warning');
        return;
      }
      onInstallCustomPack(validation.pack);
      setUploadStatus({
        type: 'success',
        message: `${validation.pack.pack_meta.id} (${validation.pack.pack_meta.law_name}) 팩이 엔진에 장착되었습니다.`,
      });
      setJsonInput('');
    } catch {
      const errMsg = 'JSON 파싱에 실패했습니다. 문법 오류를 확인하세요.';
      setUploadStatus({
        type: 'error',
        message: errMsg,
      });
      onShowToast?.(errMsg, 'warning');
    }
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      handleInstallJsonText(content);
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([JSON.stringify(EMPTY_PACK_TEMPLATE, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'policy_pack_v2_template.json';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    onShowToast?.('PolicyPackV2 JSON 템플릿을 다운로드했습니다.', 'info');
  };

  return (
    <div className="space-y-6">
      {/* Header + 4-Layer Filter Tabs */}
      <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-sky-400" />
              <h2 className="font-display text-base font-semibold text-slate-100">
                4계층 플러그인 법률 팩 관리 &amp; JSON 업로더
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              팩을 켜고 끄거나 신규 국가 `PolicyPackV2` JSON을 장착하면 `Live Audit Studio` 및 `CI/CD Gate` 판정에 즉시 반영됩니다.
            </p>
          </div>
          <div className="font-mono text-xs text-slate-300 tabular-nums">
            활성 팩 {allPacks.filter((p) => !disabledPackIds.includes(p.pack_meta.id)).length} /{' '}
            {allPacks.length}종
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800">
          {LAYER_TABS.map((tab) => {
            const active = layerFilter === tab.id;
            return (
              <button
                key={String(tab.id)}
                type="button"
                onClick={() => setLayerFilter(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-sky-500 text-slate-950 font-semibold'
                    : 'bg-[#060913] text-slate-300 border border-slate-800 hover:border-slate-700'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Pack Card Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredPacks.map((pack, idx) => {
          const isCustom = !builtInRefSet.has(pack);
          const isActive = !disabledPackIds.includes(pack.pack_meta.id);
          const isSupersededBuiltIn =
            !isCustom && supersededSet.has(pack.pack_meta.id);
          return (
            <article
              key={`${pack.pack_meta.id}-${pack.pack_meta.version}-${isCustom ? 'custom' : 'builtin'}-${idx}`}
              className={`rounded-xl border p-5 flex flex-col justify-between gap-4 transition-colors ${
                isActive && !isSupersededBuiltIn
                  ? 'border-slate-800 bg-[#0B1120]'
                  : 'border-slate-800/60 bg-[#080C17] opacity-65'
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-sky-300">
                    Layer {pack.pack_meta.layer} · {pack.pack_meta.country_code} · v
                    {pack.pack_meta.version}
                  </span>

                  <div className="flex items-center gap-2 shrink-0">
                    {isCustom && (
                      <button
                        type="button"
                        onClick={() => onDeleteCustomPack(pack.pack_meta.id)}
                        aria-label={`${pack.pack_meta.id} 삭제`}
                        className="p-1 text-slate-400 hover:text-rose-300 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onTogglePackActive(pack.pack_meta.id)}
                      className={`px-2.5 py-1 rounded border font-mono text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        isActive
                          ? 'bg-emerald-950/50 border-emerald-700 text-emerald-300'
                          : 'bg-slate-900 border-slate-700 text-slate-400'
                      }`}
                    >
                      {isActive ? '자동 매칭 (AUTO)' : '제외 (OFF)'}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setInspectedPack(pack)}
                  className="text-left w-full group"
                >
                  <div className="font-mono text-xs text-slate-400 flex flex-wrap items-center gap-1.5">
                    <span>
                      {pack.pack_meta.id} {isCustom ? '· 플러그인' : '· 공식 기본 팩'}
                    </span>
                    {isSupersededBuiltIn && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] font-sans">
                        신규 플러그인으로 대체됨
                      </span>
                    )}
                  </div>
                  <h3 className="font-display text-sm font-semibold text-slate-100 group-hover:text-sky-300 transition-colors mt-0.5">
                    {pack.pack_meta.law_name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed line-clamp-2">
                    {pack.pack_meta.penalty_summary}
                  </p>
                </button>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="font-mono text-slate-300 tabular-nums">
                  규칙 {pack.rules.length}개 · 시행 {pack.pack_meta.effective_date}
                </span>
                <button
                  type="button"
                  onClick={() => setInspectedPack(pack)}
                  className="text-sky-400 hover:text-sky-300 font-medium whitespace-nowrap"
                >
                  룰셋 상세 보기
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {/* Plugin JSON Uploader */}
      <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FileJson className="w-4 h-4 text-sky-400" />
              <h3 className="font-display text-sm font-semibold text-slate-100">
                신규 법률 팩 JSON 플러그인 업로더
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              표준 `PolicyPackV2` JSON 파일을 업로드하거나 붙여넣어 엔진에 즉시 장착(또는 기존 팩 상위 버전 덮어쓰기)할 수 있습니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#060913] border border-slate-700 hover:border-slate-600 text-xs text-slate-200 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>빈 PolicyPackV2 JSON 템플릿 다운로드</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
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
            className="lg:col-span-4 rounded-lg border border-dashed border-slate-700 bg-[#060913] hover:border-slate-500 p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
                e.target.value = '';
              }}
            />
            <UploadCloud className="w-6 h-6 text-sky-400 mb-2" />
            <div className="text-xs font-medium text-slate-200">
              `.json` 법률 팩 파일 드래그 &amp; 드롭
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              스키마 및 9종 DSL 연산자 유효성 자동 검증
            </div>
          </div>

          <div className="lg:col-span-8 space-y-2.5">
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              rows={5}
              placeholder='{"pack_meta": { "id": "TW_PDPA_V2", "layer": 1, ... }, "applicability": ..., "rules": [...] }'
              className="w-full rounded-lg bg-[#060913] border border-slate-800 p-3 font-mono text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <div className="flex items-center justify-between gap-3">
              {uploadStatus ? (
                <div
                  className={`inline-flex items-center gap-1.5 text-xs ${
                    uploadStatus.type === 'success'
                      ? 'text-emerald-300'
                      : 'text-rose-300'
                  }`}
                >
                  {uploadStatus.type === 'success' && (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>{uploadStatus.message}</span>
                </div>
              ) : (
                <span className="text-[11px] text-slate-400">
                  업로드된 팩은 브라우저 저장소(`storageRepository`)에 영구 보관됩니다.
                </span>
              )}

              <button
                type="button"
                disabled={!jsonInput.trim()}
                onClick={() => handleInstallJsonText(jsonInput)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium text-slate-100 transition-colors whitespace-nowrap shrink-0"
              >
                JSON 검증 및 장착
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Ruleset Inspector Modal */}
      {inspectedPack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
          <div className="w-full max-w-3xl max-h-[85vh] rounded-xl border border-slate-700 bg-[#0B1120] shadow-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-4">
              <div>
                <div className="font-mono text-xs text-sky-300">
                  Layer {inspectedPack.pack_meta.layer} · {inspectedPack.pack_meta.id} · v
                  {inspectedPack.pack_meta.version}
                </div>
                <h3 className="font-display text-base font-semibold text-slate-100 mt-0.5">
                  {inspectedPack.pack_meta.law_name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectedPack(null)}
                aria-label="인스펙터 닫기"
                className="p-1.5 text-slate-400 hover:text-slate-100 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="rounded-lg border border-slate-800 bg-[#060913] p-3.5 text-xs space-y-1.5">
                <div className="text-slate-400 font-medium">발동 조건 (Applicability DSL)</div>
                <pre className="font-mono text-[11px] text-slate-200 overflow-x-auto">
                  {JSON.stringify(inspectedPack.applicability, null, 2)}
                </pre>
              </div>

              <div className="space-y-3">
                {inspectedPack.rules.map((rule) => (
                  <div
                    key={rule.rule_id}
                    className="rounded-lg border border-slate-800 bg-[#060913] p-4 space-y-2"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                      <span
                        className={
                          rule.severity === 'BLOCKER'
                            ? 'text-rose-300 font-semibold'
                            : 'text-amber-300 font-semibold'
                        }
                      >
                        {rule.severity}
                      </span>
                      <span className="text-slate-600">·</span>
                      <span className="text-slate-200">{rule.rule_id}</span>
                      <span className="text-slate-600">·</span>
                      <span className="text-slate-400">{rule.article_citation}</span>
                    </div>
                    <div className="text-sm font-semibold text-slate-100">
                      {rule.plain_title}
                    </div>
                    <p className="text-xs text-slate-300">{rule.plain_explanation}</p>
                    <pre className="rounded bg-[#0B1120] border border-slate-800 p-2.5 text-[11px] font-mono text-sky-200 overflow-x-auto">
                      {JSON.stringify(rule.condition_dsl, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
