import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Cpu,
  Server,
  Sparkles,
  X,
} from 'lucide-react';
import { normalizeLocalEndpoints } from '@/lib/llm-parser';
import type { LlmConfig, LlmProvider } from '@/lib/types';

interface LlmSettingsModalProps {
  open: boolean;
  config: LlmConfig;
  onClose: () => void;
  onSave: (nextConfig: LlmConfig) => void;
}

const GEMINI_MODEL_PRESETS = [
  { value: 'gemini-4-hydrogen', label: 'gemini-4-hydrogen (기본 · 빠름)' },
  { value: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite (경량)' },
  { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
];

export function LlmSettingsModal({
  open,
  config,
  onClose,
  onSave,
}: LlmSettingsModalProps) {
  const [provider, setProvider] = useState<LlmProvider>(config.provider);
  const [localEndpoint, setLocalEndpoint] = useState<string>(
    config.localEndpoint || 'http://127.0.0.1:1234/v1/chat/completions',
  );
  const [modelName, setModelName] = useState<string>(config.modelName);
  const [geminiReady, setGeminiReady] = useState<boolean | null>(null);
  const [localTestStatus, setLocalTestStatus] = useState<{
    type: 'info' | 'success' | 'error';
    message: string;
    detail?: string;
  } | null>(null);
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    const initialProvider: LlmProvider =
      config.provider === 'LOCAL_OPENAI_COMPAT'
        ? 'LOCAL_OPENAI_COMPAT'
        : 'GEMINI_CLOUD';
    setProvider(initialProvider);
    setLocalEndpoint(
      config.localEndpoint || 'http://127.0.0.1:1234/v1/chat/completions',
    );
    if (initialProvider === 'LOCAL_OPENAI_COMPAT') {
      setModelName(config.modelName || 'google/gemma-4-12b-qat');
    } else {
      const validPreset = GEMINI_MODEL_PRESETS.some(
        (p) => p.value === config.modelName,
      );
      setModelName(validPreset ? config.modelName : 'gemini-4-hydrogen');
    }
    setLocalTestStatus(null);
    setDiscoveredModels([]);

    fetch('/api/health')
      .then((res) => res.json())
      .then((data: { geminiConfigured?: boolean }) => {
        setGeminiReady(Boolean(data.geminiConfigured));
      })
      .catch(() => {
        setGeminiReady(false);
      });
  }, [open, config]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const isLocalMode = provider === 'LOCAL_OPENAI_COMPAT';

  const handleSelectProvider = (next: LlmProvider) => {
    setProvider(next);
    if (next === 'LOCAL_OPENAI_COMPAT') {
      if (GEMINI_MODEL_PRESETS.some((p) => p.value === modelName) || !modelName.trim()) {
        setModelName('google/gemma-4-12b-qat');
      }
      return;
    }
    if (!GEMINI_MODEL_PRESETS.some((p) => p.value === modelName)) {
      setModelName('gemini-4-hydrogen');
    }
  };

  const handleTestLocalEndpoint = async () => {
    const { chatUrl, modelsUrl } = normalizeLocalEndpoints(localEndpoint);
    setLocalEndpoint(chatUrl);
    setLocalTestStatus({ type: 'info', message: '연결 확인 중...' });

    try {
      const res = await fetch(modelsUrl, { method: 'GET' });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          data?: Array<{ id?: string }>;
        };
        const modelIds = (data.data ?? [])
          .map((m) => m.id)
          .filter((id): id is string => Boolean(id));
        setDiscoveredModels(modelIds);
        if (modelIds.length > 0 && !modelIds.includes(modelName)) {
          setModelName(modelIds[0]);
        }
        setLocalTestStatus({
          type: 'success',
          message:
            modelIds.length > 0
              ? `연결 성공 · 로드된 모델 ${modelIds.length}개 (${modelIds[0]})`
              : '로컬 추론 서버 연결 성공',
        });
      } else {
        setLocalTestStatus({
          type: 'error',
          message: `응답 코드 HTTP ${res.status}`,
        });
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : '';
      setLocalTestStatus({
        type: 'error',
        message: reason
          ? `로컬 엔드포인트 연결 실패 (${reason})`
          : '로컬 엔드포인트 연결 실패',
        detail:
          '로컬 서버(LM Studio/Ollama)가 실행 중이고 CORS가 활성화되어 있는지 확인해 주세요. 연결이 안 되어도 내장 스마트 휴리스틱 파서로 자동 폴백됩니다.',
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { chatUrl } = normalizeLocalEndpoints(localEndpoint);
    const fallbackModel = isLocalMode
      ? 'google/gemma-4-12b-qat'
      : 'gemini-4-hydrogen';

    onSave({
      provider,
      localEndpoint: chatUrl,
      modelName: modelName.trim() || fallbackModel,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="llm-settings-modal-title"
        className="w-full max-w-lg rounded-xl border border-white/[0.08] bg-[#0C0C0F] shadow-[0_24px_64px_rgba(0,0,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.06)] overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <h2
              id="llm-settings-modal-title"
              className="font-display text-sm font-semibold text-zinc-100"
            >
              AI 파서 엔진 설정
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="설정 닫기"
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05] rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Simple 2-Mode Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleSelectProvider('GEMINI_CLOUD')}
              className={`rounded-lg border p-3.5 text-left transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 ${
                !isLocalMode
                  ? 'border-[#38BDF8] bg-[#141419] shadow-[0_0_0_1px_rgba(56,189,248,0.18)]'
                  : 'border-white/[0.08] bg-[#08080A] hover:border-white/[0.16]'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
                <Cloud className="w-4 h-4 text-cyan-400" />
                <span>Gemini Cloud (자동 연동)</span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                별도 설정 없이 접속 즉시 내장 Gemini API로 처리방침과 코드를 자동 분석합니다.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleSelectProvider('LOCAL_OPENAI_COMPAT')}
              className={`rounded-lg border p-3.5 text-left transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 ${
                isLocalMode
                  ? 'border-[#38BDF8] bg-[#141419] shadow-[0_0_0_1px_rgba(56,189,248,0.18)]'
                  : 'border-white/[0.08] bg-[#08080A] hover:border-white/[0.16]'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
                <Server className="w-4 h-4 text-emerald-400" />
                <span>On-Premise Local Mode</span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                LM Studio · Ollama 등 로컬 OpenAI 호환 서버를 직접 연결해 분석합니다.
              </p>
            </button>
          </div>

          {!isLocalMode ? (
            <div className="space-y-3.5 rounded-lg border border-white/[0.07] bg-[#08080A] p-4">
              <div className="rounded-md border border-white/[0.06] bg-[#0C0C0F] px-3 py-2 flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 text-zinc-300">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>기본 내장 Gemini API</span>
                </span>
                <span
                  className={`font-mono text-[11px] font-medium whitespace-nowrap shrink-0 ${
                    geminiReady === null
                      ? 'text-zinc-400'
                      : geminiReady
                        ? 'text-emerald-300'
                        : 'text-amber-300'
                  }`}
                >
                  {geminiReady === null
                    ? '확인 중...'
                    : geminiReady
                      ? '자동 연동됨'
                      : '휴리스틱 폴백 대기'}
                </span>
              </div>

              <div className="space-y-2">
                <label className="block text-xs text-zinc-300 font-medium">
                  Gemini 모델 선택
                </label>
                <select
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="w-full rounded-lg bg-[#0C0C0F] border border-white/[0.08] px-3 py-2 text-xs text-zinc-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 focus:border-cyan-400/50 transition-colors"
                >
                  {GEMINI_MODEL_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-white/[0.07] bg-[#08080A] p-4">
              <div>
                <label className="block text-xs text-zinc-300 font-medium mb-1">
                  OpenAI 호환 엔드포인트 URL (LM Studio / Ollama)
                </label>
                <input
                  type="url"
                  value={localEndpoint}
                  onChange={(e) => setLocalEndpoint(e.target.value)}
                  placeholder="http://127.0.0.1:1234/v1/chat/completions"
                  className="w-full rounded-lg bg-[#0C0C0F] border border-white/[0.08] px-3 py-2 font-mono text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 focus:border-cyan-400/50 transition-colors"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  `http://127.0.0.1:1234`만 입력해도 저장·테스트 시 `/v1/chat/completions`가 자동 완성됩니다.
                </p>
              </div>

              <div>
                <label className="block text-xs text-zinc-300 font-medium mb-1">
                  로컬 모델명
                </label>
                {discoveredModels.length > 0 ? (
                  <select
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    className="w-full rounded-lg bg-[#0C0C0F] border border-white/[0.08] px-3 py-2 font-mono text-xs text-zinc-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 focus:border-cyan-400/50 transition-colors"
                  >
                    {discoveredModels.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="google/gemma-4-12b-qat"
                    className="w-full rounded-lg bg-[#0C0C0F] border border-white/[0.08] px-3 py-2 font-mono text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 focus:border-cyan-400/50 transition-colors"
                  />
                )}
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleTestLocalEndpoint}
                    className="px-3 py-1.5 rounded-md border border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.09] text-xs text-zinc-200 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60"
                  >
                    엔드포인트 연결 테스트
                  </button>
                  {localTestStatus && (
                    <span
                      className={`text-[11px] truncate ${
                        localTestStatus.type === 'success'
                          ? 'text-emerald-300'
                          : localTestStatus.type === 'error'
                            ? 'text-rose-300'
                            : 'text-zinc-300'
                      }`}
                    >
                      {localTestStatus.message}
                    </span>
                  )}
                </div>
                {localTestStatus?.detail && (
                  <p className="text-[11px] text-rose-200/90 leading-relaxed">
                    {localTestStatus.detail}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-white/[0.07] bg-[#08080A] px-3.5 py-2.5 flex items-start gap-2.5 text-[11px] text-zinc-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              <strong className="text-zinc-100">무결점 폴백 보장:</strong> AI 응답 지연이나 오류 시 내장 스마트 휴리스틱 파서가 즉시 팩트를 추출해 중단 없이 심사를 완료합니다.
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.07]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-white/[0.09] bg-white/[0.03] hover:bg-white/[0.07] text-xs font-medium text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#FAFAFA] hover:bg-white text-[#050507] text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60"
            >
              설정 저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
