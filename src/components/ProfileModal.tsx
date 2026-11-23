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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
        className="w-full max-w-md rounded-xl border border-slate-700 bg-[#0B1120] shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-4 h-4 text-sky-400" />
            <h2
              id="profile-modal-title"
              className="font-display text-sm font-semibold text-slate-100"
            >
              새 워크스페이스 프로필 추가
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="p-1 text-slate-400 hover:text-slate-100 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 mb-1.5">프로필 이름 *</label>
            <input
              type="text"
              required
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="예: 핀테크 결제 API - 도쿄 리전"
              className="w-full rounded-lg bg-[#060913] border border-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1.5">설명</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="서비스 스택 및 관할권 요약"
              className="w-full rounded-lg bg-[#060913] border border-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 mb-1.5">사업자 소재국</label>
              <select
                value={businessCountry}
                onChange={(e) => setBusinessCountry(e.target.value)}
                className="w-full rounded-lg bg-[#060913] border border-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="KR">KR (대한민국)</option>
                <option value="EU">EU (유럽연합)</option>
                <option value="US">US (미국)</option>
                <option value="JP">JP (일본)</option>
                <option value="CN">CN (중국)</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-300 mb-1.5">산업 도메인</label>
              <select
                value={industryDomain}
                onChange={(e) =>
                  setIndustryDomain(e.target.value as IndustryDomain)
                }
                className="w-full rounded-lg bg-[#060913] border border-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="GENERAL">GENERAL</option>
                <option value="AI_SAAS">AI_SAAS</option>
                <option value="FINTECH">FINTECH</option>
                <option value="HEALTHCARE">HEALTHCARE</option>
              </select>
            </div>
          </div>

          <div>
            <div className="text-slate-300 mb-1.5">대상 정보주체 국가</div>
            <div className="flex flex-wrap gap-1.5">
              {COUNTRY_CHOICES.map((code) => {
                const active = dataSubjectCountries.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => toggleSubject(code)}
                    className={`px-2.5 py-1 rounded font-mono transition-colors ${
                      active
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50'
                        : 'bg-[#060913] text-slate-400 border border-slate-800'
                    }`}
                  >
                    {code}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold"
            >
              프로필 생성
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
