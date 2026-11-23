import React, { useEffect, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';

export type GlossaryTermKey =
  | 'drift'
  | 'virtual_transfer'
  | 'entrustment_exemption'
  | 'kms'
  | 'dpf_scc'
  | 'zdr';

interface GlossaryEntry {
  title: string;
  description: string;
}

export const GLOSSARY_TERMS: Record<GlossaryTermKey, GlossaryEntry> = {
  drift: {
    title: 'Policy-Infra Drift (문서-인프라 불일치)',
    description:
      '개인정보 처리방침에는 "국내 서버에만 보관"이라고 적혀 있는데, 실제 코드나 클라우드는 해외 서버·외부 AI API로 데이터를 보내고 있는 앞뒤 모순 상태를 뜻합니다.',
  },
  virtual_transfer: {
    title: '가상 국외 이전 (원격 열람·통제)',
    description:
      '서버 자체가 한국(서울)에 있어도, 해외 지사 직원·해외 외주 개발자가 관리자 화면이나 DB를 원격으로 조회·접근할 수 있으면 법적으로 국외 이전에 해당할 수 있습니다.',
  },
  entrustment_exemption: {
    title: '국외 처리위탁 특례 (제28조의8 제1항 제3호)',
    description:
      '서비스 제공에 꼭 필요한 결제·메일·AI 처리 등을 외부 업체에 위탁할 때, 일일이 국외 이전 별도 동의를 받지 않고 처리방침에 6가지 법정 항목을 상세히 공개하면 적법하게 이전할 수 있는 예외 조항입니다.',
  },
  kms: {
    title: 'KMS (암호화 키 관리 시스템)',
    description:
      '고객 데이터를 잠그고 푸는 열쇠(암호화 키)를 보관하는 금고입니다. 이 열쇠를 해외 리전이나 본사가 단독 통제하면 해외에서 데이터를 복호화·열람할 수 있는 것으로 간주됩니다.',
  },
  dpf_scc: {
    title: 'EU-US DPF / SCC (해외 이전 안전장치)',
    description:
      '미국·유럽 간 개인정보 이동 시 정보 보호 수준을 보장하기 위해 기업이 가입하는 국제 인증(DPF)이나 유럽연합 표준계약조항(SCC)을 의미합니다.',
  },
  zdr: {
    title: 'ZDR (Zero Data Retention · 학습 제외)',
    description:
      'OpenAI·Anthropic 등 AI API 호출 시 보낸 고객 프롬프트 데이터를 공급사 서버에 저장하거나 AI 모델 학습에 재사용하지 않도록 막는 기업용 보안 설정입니다.',
  },
};

interface InfoTooltipProps {
  term?: GlossaryTermKey;
  title?: string;
  description?: string;
  align?: 'left' | 'right';
}

export function InfoTooltip({
  term,
  title,
  description,
  align = 'left',
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement | null>(null);

  const entry = term ? GLOSSARY_TERMS[term] : null;
  const resolvedTitle = title ?? entry?.title ?? '용어 설명';
  const resolvedDescription = description ?? entry?.description ?? '';

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  if (!resolvedDescription) return null;

  return (
    <span
      ref={containerRef}
      className="no-print relative inline-flex items-center align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label={`${resolvedTitle} 설명 보기`}
        aria-expanded={open}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-slate-400 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 transition-colors"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {open && (
        <span
          role="tooltip"
          className={`absolute bottom-full mb-2 w-72 max-w-[85vw] rounded-lg border border-slate-700 bg-[#0E1528] p-3 text-left shadow-2xl z-50 ${
            align === 'right' ? 'right-0' : 'left-0 sm:left-1/2 sm:-translate-x-1/2'
          }`}
        >
          <span className="block text-[11px] font-semibold text-sky-300 mb-1">
            {resolvedTitle}
          </span>
          <span className="block text-[11px] font-normal text-slate-200 leading-relaxed whitespace-normal">
            {resolvedDescription}
          </span>
        </span>
      )}
    </span>
  );
}
