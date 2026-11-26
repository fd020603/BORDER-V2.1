import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Play } from 'lucide-react';
import type { DemoScenario } from '@/lib/demo-scenarios';

interface ScenarioDropdownProps {
  scenarios: DemoScenario[];
  activeScenarioId: string | null;
  onSelectScenario: (scenarioId: string) => void;
  align?: 'left' | 'right';
}

const VERDICT_META: Record<
  DemoScenario['expected_verdict_hint'],
  { label: string; className: string }
> = {
  APPROVED: {
    label: '승인 · APPROVED',
    className:
      'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  },
  DRIFT_DETECTED: {
    label: '위조 여권 · DRIFT',
    className: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30',
  },
  DENIED: {
    label: '차단 · DENIED',
    className: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
  },
  CUSTOM: {
    label: '직접 입력',
    className: 'text-zinc-300 bg-white/[0.05] border-white/[0.12]',
  },
};

export function ScenarioDropdown({
  scenarios,
  activeScenarioId,
  onSelectScenario,
  align = 'right',
}: ScenarioDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const activeScenario = scenarios.find((s) => s.id === activeScenarioId);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]/60 ${
          activeScenario
            ? 'border-[#38BDF8]/60 bg-[#141419] text-zinc-100 hover:border-[#38BDF8]'
            : 'border-white/[0.08] bg-[#08080A] text-zinc-200 hover:border-white/[0.18] hover:bg-[#101014]'
        }`}
      >
        <Play className="w-3 h-3 text-cyan-400 shrink-0" />
        <span>
          {activeScenario
            ? `데모 프리셋 · ${activeScenario.short_label}`
            : `데모 프리셋 (${scenarios.length}종)`}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-150 shrink-0 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="데모 시나리오 목록"
          className={`absolute ${
            align === 'left' ? 'left-0' : 'right-0'
          } top-full mt-1.5 z-40 w-[440px] max-w-[calc(100vw-2rem)] rounded-xl border border-white/[0.1] bg-[#0C0C0F] shadow-[0_24px_64px_rgba(0,0,0,0.85)] overflow-hidden`}
        >
          <div className="px-4 py-2.5 border-b border-white/[0.07] flex items-center justify-between gap-2 bg-[#08080A]">
            <span className="text-[11px] font-semibold text-zinc-200">
              실전 시나리오 프리셋 ({scenarios.length}종)
            </span>
            <span className="text-[10px] text-zinc-400">
              클릭 시 설정·처리방침·심사 결과 즉시 반영
            </span>
          </div>

          <div className="max-h-[72vh] overflow-y-auto divide-y divide-white/[0.06]">
            {scenarios.map((sc) => {
              const selected = sc.id === activeScenarioId;
              const verdictMeta = VERDICT_META[sc.expected_verdict_hint];

              return (
                <button
                  key={sc.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSelectScenario(sc.id);
                    setOpen(false);
                  }}
                  className={`w-full px-4 py-3 text-left transition-colors flex items-start justify-between gap-3 ${
                    selected
                      ? 'bg-[#141419] text-zinc-100'
                      : 'hover:bg-white/[0.04] text-zinc-300'
                  }`}
                >
                  <div className="min-w-0 space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-zinc-100">
                        {sc.short_label}
                      </span>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded border font-mono text-[10px] font-medium whitespace-nowrap ${verdictMeta.className}`}
                      >
                        {verdictMeta.label}
                      </span>
                    </div>

                    <div className="text-[11px] font-medium text-cyan-300/90">
                      {sc.persona}
                    </div>

                    <p className="text-[11px] text-zinc-300/90 leading-relaxed">
                      {sc.story}
                    </p>

                    {sc.highlights.length > 0 && (
                      <div className="pt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono text-zinc-400">
                        {sc.highlights.map((item, idx) => (
                          <React.Fragment key={item}>
                            {idx > 0 && (
                              <span aria-hidden="true" className="text-zinc-600">
                                ·
                              </span>
                            )}
                            <span>{item}</span>
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </div>

                  {selected && (
                    <Check className="w-4 h-4 text-[#38BDF8] shrink-0 mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
