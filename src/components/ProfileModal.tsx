import React, { useEffect, useState } from 'react';
import { FolderPlus, X } from 'lucide-react';
import type { IndustryDomain, WorkspaceProfile } from '@/lib/types';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (profile: WorkspaceProfile) => void;
}

const COUNTRY_CHOICES = ['KR', 'EU', 'US', 'JP', 'CN', 'GB', 'SG'];

export function ProfileModal({ open, onClose, onCreate }: ProfileModalProps) {
  const [profileName, setProfileName] = useState('');
  const [description, setDescription] = useState('');
  const [businessCountry, setBusinessCountry] = useState('KR');
  const [dataSubjectCountries, setDataSubjectCountries] = useState<string[]>(['KR']);
  const [industryDomain, setIndustryDomain] = useState<IndustryDomain>('AI_SAAS');

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

  const toggleSubject = (code: string) => {
    setDataSubjectCountries((prev) => {
      if (prev.includes(code)) {
        return prev.length === 1 ? prev : prev.filter((c) => c !== code);
      }
      return [...prev, code];
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = profileName.trim();
    if (!trimmed) return;

    onCreate({
      id: `profile-${Date.now()}`,
      profile_name: trimmed,
      description:
        description.trim() || `${businessCountry} · ${industryDomain} 워크스페이스`,
      business_country: businessCountry,
      data_subject_countries: dataSubjectCountries,
      industry_domain: industryDomain,
      updated_at: new Date().toISOString(),
    });
    setProfileName('');
    setDescription('');
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
        aria-labelledby="profile-modal-title"
        className="w-full max-w-md rounded-xl border border-white/[0.08] bg-[#0C0C0F] shadow-[0_24px_64px_rgba(0,0,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.06)] overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-4 h-4 text-cyan-400" />
            <h2
              id="profile-modal-title"
              className="font-display text-sm font-semibold text-zinc-100"
            >
              새 워크스페이스 프로필 추가
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05] rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div>
            <label className="block text-zinc-300 font-medium mb-1.5">
              프로필 이름 *
            </label>
            <input
              type="text"
              required
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="예: 핀테크 결제 API - 도쿄 리전"
              className="w-full rounded-lg bg-[#08080A] border border-white/[0.08] px-3 py-2 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 focus:border-cyan-400/50 transition-colors"
            />
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1.5">
              설명
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="서비스 스택 및 관할권 요약"
              className="w-full rounded-lg bg-[#08080A] border border-white/[0.08] px-3 py-2 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 focus:border-cyan-400/50 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-300 font-medium mb-1.5">
                사업자 소재국
              </label>
              <select
                value={businessCountry}
                onChange={(e) => setBusinessCountry(e.target.value)}
                className="w-full rounded-lg bg-[#08080A] border border-white/[0.08] px-3 py-2 text-zinc-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 focus:border-cyan-400/50 transition-colors"
              >
                <option value="KR">KR (대한민국)</option>
                <option value="EU">EU (유럽연합)</option>
                <option value="US">US (미국)</option>
                <option value="JP">JP (일본)</option>
                <option value="CN">CN (중국)</option>
              </select>
            </div>
            <div>
              <label className="block text-zinc-300 font-medium mb-1.5">
                산업 도메인
              </label>
              <select
                value={industryDomain}
                onChange={(e) =>
                  setIndustryDomain(e.target.value as IndustryDomain)
                }
                className="w-full rounded-lg bg-[#08080A] border border-white/[0.08] px-3 py-2 text-zinc-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 focus:border-cyan-400/50 transition-colors"
              >
                <option value="GENERAL">GENERAL</option>
                <option value="AI_SAAS">AI_SAAS</option>
                <option value="FINTECH">FINTECH</option>
                <option value="HEALTHCARE">HEALTHCARE</option>
              </select>
            </div>
          </div>

          <div>
            <div className="text-zinc-300 font-medium mb-1.5">
              대상 정보주체 국가
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COUNTRY_CHOICES.map((code) => {
                const active = dataSubjectCountries.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => toggleSubject(code)}
                    className={`px-2.5 py-1 rounded-md font-mono transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 ${
                      active
                        ? 'bg-[#141419] text-zinc-100 border border-[#38BDF8] shadow-[0_0_0_1px_rgba(56,189,248,0.18)]'
                        : 'bg-[#08080A] text-zinc-400 border border-white/[0.08] hover:border-white/[0.16] hover:text-zinc-200'
                    }`}
                  >
                    {code}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.07]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-white/[0.09] bg-white/[0.03] hover:bg-white/[0.07] text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#FAFAFA] hover:bg-white text-[#050507] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60"
            >
              프로필 생성
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
