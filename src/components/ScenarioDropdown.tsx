import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Play } from 'lucide-react';
import type { DemoScenario } from '@/lib/demo-scenarios';

interface ScenarioDropdownProps {
  scenarios: DemoScenario[];
  activeScenarioId: string | null;
  onSelectScenario: (scenarioId: string) => void;
  align?: 'left' | 'right';
}

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
            : '데모 프리셋'}
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
          } top-full mt-1.5 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-white/[0.1] bg-[#0C0C0F] shadow-[0_20px_48px_rgba(0,0,0,0.8)] overflow-hidden`}
        >
          <div className="px-3.5 py-2 border-b border-white/[0.06] text-[11px] font-medium text-zinc-400">
            원클릭 시나리오 프리셋 선택
          </div>
          <div className="divide-y divide-white/[0.05]">
            {scenarios.map((sc) => {
              const selected = sc.id === activeScenarioId;
              const verdictTone =
                sc.expected_verdict_hint === 'APPROVED'
                  ? 'text-emerald-300'
                  : sc.expected_verdict_hint === 'DRIFT_DETECTED'
                    ? 'text-cyan-300'
                    : 'text-rose-300';

              return (
                <button
                  key={sc.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSelectScenario(sc.id);
                    setOpen(false);
                  }}
                  className={`w-full px-3.5 py-2.5 text-left transition-colors flex items-start justify-between gap-3 ${
                    selected
                      ? 'bg-[#141419] text-zinc-100'
                      : 'hover:bg-white/[0.04] text-zinc-300'
                  }`}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
                      <span className="truncate">{sc.short_label}</span>
                      <span className={`font-mono text-[10px] ${verdictTone}`}>
                        {sc.expected_verdict_hint}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 line-clamp-2 leading-snug">
                      {sc.title}
                    </p>
                  </div>

                  {selected && (
                    <Check className="w-3.5 h-3.5 text-[#38BDF8] shrink-0 mt-0.5" />
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
