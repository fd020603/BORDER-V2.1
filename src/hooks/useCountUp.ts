import { useEffect, useState } from 'react';

export function useCountUp(
  target: number,
  resetKey: string | number,
  durationMs = 550,
): number {
  const [value, setValue] = useState<number>(target);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setValue(target);
      return;
    }

    const prefersReduced =
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced || target === 0) {
      setValue(target);
      return;
    }

    let rafId = 0;
    const startTime = performance.now();
    setValue(0);

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        setValue(target);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [target, resetKey, durationMs]);

  return value;
}
