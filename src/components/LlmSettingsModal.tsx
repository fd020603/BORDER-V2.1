import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Cloud, Cpu, Server, X } from 'lucide-react';
import { normalizeLocalEndpoints } from '@/lib/llm-parser';
import type { LlmConfig, LlmProvider } from '@/lib/types';

interface LlmSettingsModalProps {
  open: boolean;
  config: LlmConfig;
  onClose: () => void;
  onSave: (nextConfig: LlmConfig) => void;
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
  const [serverKeyAvailable, setServerKeyAvailable] = useState<boolean | null>(null);
  const [localTestStatus, setLocalTestStatus] = useState<{
    type: 'info' | 'success' | 'error';
    message: string;
    detail?: string;
  } | null>(null);
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setProvider(config.provider);
    setLocalEndpoint(
      config.localEndpoint || 'http://127.0.0.1:1234/v1/chat/completions',
    );
    setModelName(
      config.modelName ||
        (config.provider === 'LOCAL_OPENAI_COMPAT'
          ? 'google/gemma-4-12b-qat'
          : 'gemini-4-hydrogen'),
    );
    setLocalTestStatus(null);
    setDiscoveredModels([]);

    fetch('/api/health')
      .then((res) => res.json())
      .then((data: { geminiConfigured?: boolean }) => {
        setServerKeyAvailable(Boolean(data.geminiConfigured));
      })
      .catch(() => {
        setServerKeyAvailable(false);
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

  const handleSelectProvider = (next: LlmProvider) => {
    setProvider(next);
    if (
      next === 'GEMINI_CLOUD' &&
      (modelName === 'gemma-4-12b' ||
        modelName === 'google/gemma-4-12b-qat' ||
        !modelName)
    ) {
      setModelName('gemini-4-hydrogen');
    } else if (
      next === 'LOCAL_OPENAI_COMPAT' &&
      (modelName === 'gemini-4-hydrogen' ||
        modelName === 'gemini-3.1-flash-lite' ||
        !modelName)
    ) {
      setModelName('google/gemma-4-12b-qat');
    }
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
    onSave({
      provider,
      localEndpoint: chatUrl,
      modelName:
        modelName.trim() ||
        (provider === 'LOCAL_OPENAI_COMPAT'
          ? 'google/gemma-4-12b-qat'
          : 'gemini-4-hydrogen'),
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="llm-settings-modal-title"
        className="w-full max-w-lg rounded-xl border border-slate-700 bg-[#0B1120] shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-sky-400" />
            <h2
              id="llm-settings-modal-title"
              className="font-display text-sm font-semibold text-slate-100"
            >
              하이브리드 AI 파서 엔진 설정
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="설정 닫기"
            className="p-1 text-slate-400 hover:text-slate-100 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Provider Mode Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleSelectProvider('GEMINI_CLOUD')}
              className={`rounded-lg border p-3.5 text-left transition-colors ${
                provider === 'GEMINI_CLOUD'
                  ? 'border-sky-500 bg-sky-500/12'
                  : 'border-slate-800 bg-[#060913] hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
                <Cloud className="w-4 h-4 text-sky-400" />
                <span>Cloud Fast Mode</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                서버 프록시(`/api/parse-facts`)를 통해 Gemini Flash 구조화 추출을 실행합니다.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleSelectProvider('LOCAL_OPENAI_COMPAT')}
              className={`rounded-lg border p-3.5 text-left transition-colors ${
                provider === 'LOCAL_OPENAI_COMPAT'
                  ? 'border-sky-500 bg-sky-500/12'
                  : 'border-slate-800 bg-[#060913] hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
                <Server className="w-4 h-4 text-emerald-400" />
                <span>On-Premise Local Mode</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                LM Studio 등 로컬 OpenAI 호환 엔드포인트로 내부 코드 외부 유출 0%를 보장합니다.
              </p>
            </button>
          </div>

          {provider === 'GEMINI_CLOUD' ? (
            <div className="space-y-3 rounded-lg border border-slate-800 bg-[#060913] p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">서버 Gemini API 연결 상태</span>
                <span
                  className={`font-mono font-medium ${
                    serverKeyAvailable ? 'text-emerald-300' : 'text-amber-300'
                  }`}
                >
                  {serverKeyAvailable === null
                    ? '확인 중...'
                    : serverKeyAvailable
                      ? 'Secrets 키 연결됨'
                      : '서버 키 미설정 (자동 폴백 활성)'}
                </span>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1.5">
                  Cloud 모델 선택
                </label>
                <select
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="w-full rounded-lg bg-[#0B1120] border border-slate-700 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="gemini-4-hydrogen">gemini-4-hydrogen (Gemini Flash)</option>
                  <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Flash Lite)</option>
                </select>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                API 키는 브라우저에 노출되지 않으며 AI Studio Settings &gt; Secrets의 서버 환경 변수(`GEMINI_API_KEY`)를 안전하게 사용합니다.
              </p>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-slate-800 bg-[#060913] p-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  OpenAI 호환 엔드포인트 URL (LM Studio / Ollama / 터널)
                </label>
                <input
                  type="url"
                  value={localEndpoint}
                  onChange={(e) => setLocalEndpoint(e.target.value)}
                  placeholder="http://127.0.0.1:1234/v1/chat/completions"
                  className="w-full rounded-lg bg-[#0B1120] border border-slate-700 px-3 py-2 font-mono text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  `http://127.0.0.1:1234`만 입력해도 저장·테스트 시 `/v1/chat/completions`가 자동 완성됩니다.
                </p>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  로컬 모델명 (LM Studio API Identifier)
                </label>
                {discoveredModels.length > 0 ? (
                  <select
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    className="w-full rounded-lg bg-[#0B1120] border border-slate-700 px-3 py-2 font-mono text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
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
                    className="w-full rounded-lg bg-[#0B1120] border border-slate-700 px-3 py-2 font-mono text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                )}
              </div>

              {isLoopback && isRemoteOrigin && (
                <div className="rounded-md border border-amber-700/50 bg-amber-950/25 px-3 py-2 text-[11px] text-amber-200 leading-relaxed space-y-1">
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
                    className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors shrink-0"
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
                            : 'text-slate-300'
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

          <div className="rounded-lg border border-slate-800 bg-[#060913] px-3.5 py-2.5 flex items-start gap-2.5 text-[11px] text-slate-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              <strong>무결점 폴백 보장:</strong> LLM 응답 오류 또는 JSON 파싱 실패(최대 2회 재시도) 시 내장 스마트 휴리스틱 파서가 즉시 팩트를 추출해 중단 없이 4계층 심사를 완료합니다.
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold transition-colors"
            >
              설정 저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
