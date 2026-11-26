import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  Cpu,
  KeyRound,
  Server,
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

type CloudProviderId = Exclude<LlmProvider, 'LOCAL_OPENAI_COMPAT'>;

interface CloudProviderMeta {
  id: CloudProviderId;
  label: string;
  envHint: string;
  defaultModel: string;
  presets: Array<{ value: string; label: string }>;
}

const CLOUD_PROVIDERS: CloudProviderMeta[] = [
  {
    id: 'GEMINI_CLOUD',
    label: 'Gemini',
    envHint: 'GEMINI_API_KEY',
    defaultModel: 'gemini-4-hydrogen',
    presets: [
      { value: 'gemini-4-hydrogen', label: 'gemini-4-hydrogen (Gemini Flash)' },
      { value: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite (Flash Lite)' },
      { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
    ],
  },
  {
    id: 'OPENAI_CLOUD',
    label: 'OpenAI',
    envHint: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini',
    presets: [
      { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
      { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
      { value: 'gpt-4o', label: 'gpt-4o' },
    ],
  },
  {
    id: 'ANTHROPIC_CLOUD',
    label: 'Claude',
    envHint: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-3-5-haiku-latest',
    presets: [
      { value: 'claude-3-5-haiku-latest', label: 'claude-3-5-haiku-latest' },
      { value: 'claude-sonnet-4-20250514', label: 'claude-sonnet-4-20250514' },
    ],
  },
  {
    id: 'OPENROUTER_CLOUD',
    label: 'OpenRouter',
    envHint: 'OPENROUTER_API_KEY',
    defaultModel: 'openai/gpt-4o-mini',
    presets: [
      { value: 'openai/gpt-4o-mini', label: 'openai/gpt-4o-mini' },
      { value: 'anthropic/claude-3.5-sonnet', label: 'anthropic/claude-3.5-sonnet' },
      { value: 'google/gemini-2.5-flash', label: 'google/gemini-2.5-flash' },
    ],
  },
  {
    id: 'CUSTOM_CLOUD',
    label: 'Custom API',
    envHint: 'CUSTOM_LLM_BASE_URL + CUSTOM_LLM_API_KEY',
    defaultModel: 'gpt-4o-mini',
    presets: [{ value: 'gpt-4o-mini', label: 'gpt-4o-mini (기본값)' }],
  },
];

const CUSTOM_MODEL_OPTION = '__custom__';

function getProviderMeta(provider: LlmProvider): CloudProviderMeta {
  return (
    CLOUD_PROVIDERS.find((p) => p.id === provider) ?? CLOUD_PROVIDERS[0]
  );
}

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
  const [useCustomCloudModel, setUseCustomCloudModel] = useState(false);
  const [providerStatus, setProviderStatus] = useState<
    Partial<Record<CloudProviderId, boolean>> | null
  >(null);
  const [localTestStatus, setLocalTestStatus] = useState<{
    type: 'info' | 'success' | 'error';
    message: string;
    detail?: string;
  } | null>(null);
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    const initialProvider = config.provider;
    setProvider(initialProvider);
    setLocalEndpoint(
      config.localEndpoint || 'http://127.0.0.1:1234/v1/chat/completions',
    );

    if (initialProvider === 'LOCAL_OPENAI_COMPAT') {
      setModelName(config.modelName || 'google/gemma-4-12b-qat');
      setUseCustomCloudModel(false);
    } else {
      const meta = getProviderMeta(initialProvider);
      const resolved = config.modelName || meta.defaultModel;
      setModelName(resolved);
      setUseCustomCloudModel(
        !meta.presets.some((preset) => preset.value === resolved),
      );
    }

    setLocalTestStatus(null);
    setDiscoveredModels([]);

    fetch('/api/health')
      .then((res) => res.json())
      .then(
        (data: {
          geminiConfigured?: boolean;
          providers?: Partial<Record<CloudProviderId, boolean>>;
        }) => {
          if (data.providers) {
            setProviderStatus(data.providers);
          } else {
            setProviderStatus({
              GEMINI_CLOUD: Boolean(data.geminiConfigured),
            });
          }
        },
      )
      .catch(() => {
        setProviderStatus({});
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

  const { isLoopback } = normalizeLocalEndpoints(localEndpoint);
  const isRemoteOrigin =
    typeof window !== 'undefined' &&
    !['localhost', '127.0.0.1', '::1'].includes(
      window.location.hostname.toLowerCase(),
    );

  const isLocalMode = provider === 'LOCAL_OPENAI_COMPAT';
  const activeCloudMeta = getProviderMeta(
    isLocalMode ? 'GEMINI_CLOUD' : provider,
  );
  const activeSecretReady =
    providerStatus === null
      ? null
      : Boolean(providerStatus[activeCloudMeta.id]);

  const handleSelectProvider = (next: LlmProvider) => {
    setProvider(next);
    if (next === 'LOCAL_OPENAI_COMPAT') {
      const isCloudModel = CLOUD_PROVIDERS.some((p) =>
        p.presets.some((preset) => preset.value === modelName),
      );
      if (isCloudModel || !modelName.trim()) {
        setModelName('google/gemma-4-12b-qat');
      }
      setUseCustomCloudModel(false);
      return;
    }

    const nextMeta = getProviderMeta(next);
    setModelName(nextMeta.defaultModel);
    setUseCustomCloudModel(false);
  };

  const handleTestLocalEndpoint = async () => {
    const { chatUrl, modelsUrl, isLoopback: endpointIsLoopback } =
      normalizeLocalEndpoints(localEndpoint);
    setLocalEndpoint(chatUrl);
    setLocalTestStatus({ type: 'info', message: '연결 확인 중...' });

    try {
      let res: Response;
      if (endpointIsLoopback && isRemoteOrigin) {
        // Remote server (Cloud Run) cannot reach user's own PC loopback; call directly from browser.
        res = await fetch(modelsUrl, { method: 'GET' });
      } else {
        try {
          res = await fetch('/api/llm-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: modelsUrl, method: 'GET' }),
          });
          if (!res.ok) {
            throw new Error(`Proxy HTTP ${res.status}`);
          }
        } catch {
          res = await fetch(modelsUrl, { method: 'GET' });
        }
      }

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
          endpointIsLoopback && isRemoteOrigin
            ? '입력값과 LM Studio 설정(CORS ON)은 정상입니다. 다만 현재 웹앱이 원격 HTTPS(Cloud Run / AI Studio iframe)에서 열려 있어 Chrome의 사설망 접근 차단(PNA · Access-Control-Allow-Private-Network) 정책이 http://127.0.0.1 요청을 브라우저 단계에서 차단합니다. PC에서 `cloudflared tunnel --url http://127.0.0.1:1234` 또는 `ngrok http 1234`로 발급된 HTTPS 주소를 입력해 주세요.'
            : 'LM Studio 서버가 실행 중인지, 주소와 포트가 맞는지 확인해 주세요. (심사 실행 시 내장 휴리스틱 파서로 자동 폴백됩니다)',
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { chatUrl } = normalizeLocalEndpoints(localEndpoint);
    const fallbackModel = isLocalMode
      ? 'google/gemma-4-12b-qat'
      : activeCloudMeta.defaultModel;

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
              하이브리드 AI 파서 엔진 설정
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
          {/* Top Mode Selector: Cloud Server Secrets vs On-Premise Local */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                if (isLocalMode) handleSelectProvider('GEMINI_CLOUD');
              }}
              className={`rounded-lg border p-3.5 text-left transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 ${
                !isLocalMode
                  ? 'border-[#38BDF8] bg-[#141419] shadow-[0_0_0_1px_rgba(56,189,248,0.18)]'
                  : 'border-white/[0.08] bg-[#08080A] hover:border-white/[0.16]'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
                <Cloud className="w-4 h-4 text-cyan-400" />
                <span>Cloud API (서버 Secrets)</span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                Gemini · OpenAI · Claude · OpenRouter 등 서버 환경 변수 키를 프록시로 불러옵니다.
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
                LM Studio 등 로컬 OpenAI 호환 엔드포인트로 내부 코드 외부 유출 0%를 보장합니다.
              </p>
            </button>
          </div>

          {!isLocalMode ? (
            <div className="space-y-3.5 rounded-lg border border-white/[0.07] bg-[#08080A] p-4">
              {/* Cloud Provider Selector */}
              <div>
                <div className="text-[11px] font-medium text-zinc-300 mb-2">
                  외부 AI 모델 프로바이더 선택
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                  {CLOUD_PROVIDERS.map((item) => {
                    const active = provider === item.id;
                    const configured = providerStatus?.[item.id] ?? false;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectProvider(item.id)}
                        className={`px-2.5 py-2 rounded-md border text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 ${
                          active
                            ? 'border-[#38BDF8] bg-[#141419] text-zinc-100 shadow-[0_0_0_1px_rgba(56,189,248,0.18)]'
                            : 'border-white/[0.08] bg-[#0C0C0F] text-zinc-400 hover:text-zinc-200 hover:border-white/[0.16]'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            providerStatus === null
                              ? 'bg-zinc-600'
                              : configured
                                ? 'bg-emerald-400'
                                : 'bg-zinc-600'
                          }`}
                        />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Secret Status Row */}
              <div className="rounded-md border border-white/[0.06] bg-[#0C0C0F] px-3 py-2 flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 text-zinc-400 min-w-0">
                  <KeyRound className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <code className="font-mono text-[11px] text-zinc-300 truncate">
                    {activeCloudMeta.envHint}
                  </code>
                </span>
                <span
                  className={`font-mono text-[11px] font-medium whitespace-nowrap shrink-0 ${
                    activeSecretReady === null
                      ? 'text-zinc-400'
                      : activeSecretReady
                        ? 'text-emerald-300'
                        : 'text-amber-300'
                  }`}
                >
                  {activeSecretReady === null
                    ? '확인 중...'
                    : activeSecretReady
                      ? 'Secrets 키 연결됨'
                      : '환경 변수 미설정 (폴백 활성)'}
                </span>
              </div>

              {/* Model Selector */}
              <div className="space-y-2">
                <label className="block text-xs text-zinc-300 font-medium">
                  {activeCloudMeta.label} 모델 선택
                </label>
                <select
                  value={
                    useCustomCloudModel
                      ? CUSTOM_MODEL_OPTION
                      : activeCloudMeta.presets.some((p) => p.value === modelName)
                        ? modelName
                        : CUSTOM_MODEL_OPTION
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === CUSTOM_MODEL_OPTION) {
                      setUseCustomCloudModel(true);
                    } else {
                      setUseCustomCloudModel(false);
                      setModelName(val);
                    }
                  }}
                  className="w-full rounded-lg bg-[#0C0C0F] border border-white/[0.08] px-3 py-2 text-xs text-zinc-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 focus:border-cyan-400/50 transition-colors"
                >
                  {activeCloudMeta.presets.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                  <option value={CUSTOM_MODEL_OPTION}>
                    직접 모델명 입력...
                  </option>
                </select>

                {(useCustomCloudModel ||
                  !activeCloudMeta.presets.some(
                    (p) => p.value === modelName,
                  )) && (
                  <input
                    type="text"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder={`예: ${activeCloudMeta.defaultModel}`}
                    className="w-full rounded-lg bg-[#0C0C0F] border border-white/[0.08] px-3 py-2 font-mono text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 focus:border-cyan-400/50 transition-colors"
                  />
                )}
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed">
                보안을 위해 API 키는 브라우저 UI에 입력·저장하지 않으며,{' '}
                <strong className="text-zinc-300">
                  AI Studio Settings &gt; Secrets
                </strong>{' '}
                또는 서버 <code className="font-mono text-zinc-300">.env</code>
                에 등록한 <code className="font-mono text-zinc-300">{activeCloudMeta.envHint}</code>
                를 서버 프록시(<code className="font-mono text-zinc-300">/api/parse-facts</code>)로만 안전하게 호출합니다.
              </p>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-white/[0.07] bg-[#08080A] p-4">
              <div>
                <label className="block text-xs text-zinc-300 font-medium mb-1">
                  OpenAI 호환 엔드포인트 URL (LM Studio / Ollama / 터널)
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
                  로컬 모델명 (LM Studio API Identifier)
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

              {isLoopback && isRemoteOrigin && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2 text-[11px] text-amber-200 leading-relaxed space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>원격 HTTPS 호스팅 환경 ↔ 내 PC(127.0.0.1) 연결 안내</span>
                  </div>
                  <p className="text-amber-100/90">
                    1) LM Studio <strong>Server Settings → Enable CORS</strong> 켜기 (브라우저 직접 호출) 또는<br />
                    2) 브라우저 사설망 차단 시 터널(<code className="font-mono">cloudflared tunnel --url http://127.0.0.1:1234</code> / <code className="font-mono">ngrok</code>)의 HTTPS 주소를 입력하세요.
                  </p>
                </div>
              )}

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
              <strong className="text-zinc-100">무결점 폴백 보장:</strong> LLM 응답 오류 또는 JSON 파싱 실패(최대 2회 재시도) 시 내장 스마트 휴리스틱 파서가 즉시 팩트를 추출해 중단 없이 4계층 심사를 완료합니다.
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
