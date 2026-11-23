import React from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="no-print fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-[calc(100vw-2.5rem)] sm:w-auto pointer-events-none"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => {
        const icon =
          toast.variant === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : toast.variant === 'warning' ? (
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-sky-400 shrink-0" />
          );

        const borderClass =
          toast.variant === 'success'
            ? 'border-emerald-800/70'
            : toast.variant === 'warning'
              ? 'border-amber-800/70'
              : 'border-slate-700';

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto rounded-lg border ${borderClass} bg-[#0E1528] text-slate-100 px-3.5 py-2.5 shadow-2xl flex items-center justify-between gap-3 text-xs transition-all duration-200`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {icon}
              <span className="leading-snug">{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="알림 닫기"
              className="p-0.5 text-slate-400 hover:text-slate-100 rounded shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
