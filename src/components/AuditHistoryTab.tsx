import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Eye,
  History,
  Printer,
  RotateCcw,
  Trash2,
  TrendingUp,
  Upload,
  X,
} from 'lucide-react';
import { storageRepository } from '@/lib/storage';
import type { AuditHistoryRecord, WorkspaceProfile } from '@/lib/types';
import type { ToastVariant } from './Toast';

interface AuditHistoryTabProps {
  activeProfile: WorkspaceProfile;
  history: AuditHistoryRecord[];
  onRestoreToStudio: (record: AuditHistoryRecord) => void;
  onDeleteRecord: (recordId: string) => void;
  onBackupImported?: () => void;
  onShowToast?: (message: string, variant?: ToastVariant) => void;
}

function getRecordPassMetrics(rec: AuditHistoryRecord): {
  passRate: number;
  passedCount: number | null;
  totalCount: number | null;
} {
  const stats = rec.result_snapshot?.stats;
  if (
    stats &&
    typeof stats.pass_rate_percent === 'number' &&
    typeof stats.total_evaluated_rules === 'number'
  ) {
    return {
      passRate: stats.pass_rate_percent,
      passedCount: stats.passed_rule_count,
      totalCount: stats.total_evaluated_rules,
    };
  }
  return {
    passRate: rec.compliance_score ?? 100,
    passedCount: null,
    totalCount: null,
  };
}

export function AuditHistoryTab({
  activeProfile,
  history,
  onRestoreToStudio,
  onDeleteRecord,
  onBackupImported,
  onShowToast,
}: AuditHistoryTabProps) {
  const [scope, setScope] = useState<'profile' | 'all'>('profile');
  const [selectedSnapshot, setSelectedSnapshot] =
    useState<AuditHistoryRecord | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!selectedSnapshot) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedSnapshot(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSnapshot]);

  const handleExportBackup = () => {
    const payload = storageRepository.exportWorkspaceBackup();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `border-checker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    onShowToast?.(
      `워크스페이스 전체 백업(${payload.profiles.length}개 프로필, 이력 ${payload.audit_history.length}건)을 내보냈습니다.`,
      'success',
    );
  };

  const handleImportBackupFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        const parsed = JSON.parse(text) as unknown;
        const res = storageRepository.importWorkspaceBackup(parsed);
        if (!res.ok) {
          onShowToast?.(res.error, 'warning');
          return;
        }
        onBackupImported?.();
        onShowToast?.(
          `백업 복원 완료 (${res.profilesCount}개 프로필, 이력 ${res.historyCount}건)`,
          'success',
        );
      } catch {
        onShowToast?.('백업 JSON 파일을 읽을 수 없습니다.', 'warning');
      }
    };
    reader.readAsText(file);
  };

  const visibleRecords = useMemo(() => {
    const base =
      scope === 'profile'
        ? history.filter((h) => h.profile_id === activeProfile.id)
        : history;
    return [...base].sort(
      (a, b) =>
        new Date(b.evaluated_at).getTime() - new Date(a.evaluated_at).getTime(),
    );
  }, [history, scope, activeProfile.id]);

  // Chronological order (oldest -> newest) for trend SVG line chart
  const chartPoints = useMemo(() => {
    const chrono = [...visibleRecords].slice(0, 12).reverse();
    const width = 680;
    const height = 160;
    const padX = 36;
    const padY = 20;
    const plotW = width - padX * 2;
    const plotH = height - padY * 2;

    return chrono.map((rec, idx) => {
      const { passRate } = getRecordPassMetrics(rec);
      const x =
        chrono.length === 1
          ? padX + plotW / 2
          : padX + (idx / (chrono.length - 1)) * plotW;
      const y = padY + ((100 - passRate) / 100) * plotH;
      return {
        x,
        y,
        passRate,
        rec,
      };
    });
  }, [visibleRecords]);

  const polylinePoints = chartPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="space-y-6">
      {/* Header + Scope Switch */}
      <section className="no-print rounded-xl border border-white/[0.07] bg-[#0C0C0F] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-cyan-400" />
            <h2 className="font-display text-base font-semibold text-zinc-100">
              평가 이력 대시보드 &amp; 감사 증빙 리포트
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            프로필별 점검 항목 충족률(%) 추이와 적용된 4계층 법률 팩 스냅샷을 조회하고 PDF 증빙 문서로 출력합니다.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#08080A] border border-white/[0.07] shrink-0">
          <button
            type="button"
            onClick={() => setScope('profile')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
              scope === 'profile'
                ? 'bg-[#FAFAFA] border-[#FAFAFA] text-[#050507] font-semibold'
                : 'bg-transparent border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            현재 프로필 ({activeProfile.profile_name})
          </button>
          <button
            type="button"
            onClick={() => setScope('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
              scope === 'all'
                ? 'bg-[#FAFAFA] border-[#FAFAFA] text-[#050507] font-semibold'
                : 'bg-transparent border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            전체 프로필
          </button>
        </div>
      </section>

      {/* Pure SVG Pass Rate Trend Line Chart */}
      <section className="no-print rounded-xl border border-white/[0.07] bg-[#0C0C0F] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] p-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <h3 className="font-display text-sm font-semibold text-zinc-100">
              최근 점검 항목 충족률(%) 변화 추이
            </h3>
          </div>
          <span className="font-mono text-xs text-zinc-400 tabular-nums">
            최근 {chartPoints.length}회 심사
          </span>
        </div>

        {chartPoints.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/[0.1] py-8 text-center text-xs text-zinc-400">
            표시할 심사 이력이 없습니다. `Live Audit Studio`에서 출입국 심사를 실행해 주세요.
          </div>
        ) : (
          <div className="rounded-lg border border-white/[0.07] bg-[#08080A] p-3 overflow-x-auto">
            <svg viewBox="0 0 680 175" className="w-full min-w-[520px] h-44">
              {[0, 50, 100].map((val) => {
                const y = 20 + ((100 - val) / 100) * 120;
                return (
                  <g key={val}>
                    <line
                      x1="36"
                      y1={y}
                      x2="644"
                      y2={y}
                      stroke="rgba(255,255,255,0.08)"
                      strokeDasharray="4 4"
                    />
                    <text
                      x="30"
                      y={y + 4}
                      textAnchor="end"
                      fill="#71717A"
                      fontSize="10"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {val}%
                    </text>
                  </g>
                );
              })}

              {chartPoints.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth="2.5"
                  points={polylinePoints}
                />
              )}

              {chartPoints.map(({ x, y, passRate, rec }) => {
                const dotColor =
                  rec.verdict === 'APPROVED'
                    ? '#34D399'
                    : rec.verdict === 'DRIFT_DETECTED'
                      ? '#FBBF24'
                      : '#F43F5E';
                return (
                  <g
                    key={rec.id}
                    onClick={() => setSelectedSnapshot(rec)}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={x}
                      cy={y}
                      r="5"
                      fill={dotColor}
                      stroke="#08080A"
                      strokeWidth="2"
                    />
                    <text
                      x={x}
                      y={y - 10}
                      textAnchor="middle"
                      fill="#E4E4E7"
                      fontSize="10"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {passRate}%
                    </text>
                    <text
                      x={x}
                      y="162"
                      textAnchor="middle"
                      fill="#71717A"
                      fontSize="9"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {new Date(rec.evaluated_at).toLocaleTimeString('ko-KR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </section>

      {/* Audit History Table */}
      <section className="no-print rounded-xl border border-white/[0.07] bg-[#0C0C0F] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h3 className="font-display text-sm font-semibold text-zinc-100">
            심사 스냅샷 기록 ({visibleRecords.length}건)
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={backupInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportBackupFile(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={handleExportBackup}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#08080A] border border-white/[0.1] hover:border-white/[0.2] text-xs font-medium text-zinc-200 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>워크스페이스 JSON 내보내기</span>
            </button>
            <button
              type="button"
              onClick={() => backupInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#08080A] border border-white/[0.1] hover:border-white/[0.2] text-xs font-medium text-zinc-200 transition-colors whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              <span>백업 가져오기</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAFAFA] hover:bg-white text-xs font-semibold text-[#050507] transition-colors whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>감사 증빙 리포트 PDF 출력</span>
            </button>
          </div>
        </div>

        {visibleRecords.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/[0.1] py-10 text-center text-xs text-zinc-400">
            선택된 프로필에 기록된 심사 스냅샷이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/[0.07] text-zinc-500">
                  <th className="py-2.5 pr-4 font-medium">검사 일시</th>
                  <th className="py-2.5 pr-4 font-medium">프로필 · 대상</th>
                  <th className="py-2.5 pr-4 font-medium">판정 스탬프</th>
                  <th className="py-2.5 pr-4 font-medium text-right">충족률(%)</th>
                  <th className="py-2.5 pr-4 font-medium text-right">BLOCKER / DRIFT</th>
                  <th className="py-2.5 pr-4 font-medium">적용 팩 스냅샷</th>
                  <th className="py-2.5 font-medium text-right">동작</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {visibleRecords.map((rec) => {
                  const verdictColor =
                    rec.verdict === 'APPROVED'
                      ? 'border-emerald-500/35 text-emerald-300 bg-emerald-500/[0.08]'
                      : rec.verdict === 'DRIFT_DETECTED'
                        ? 'border-amber-500/35 text-amber-300 bg-amber-500/[0.08]'
                        : 'border-rose-500/35 text-rose-300 bg-rose-500/[0.08]';

                  const applicablePacks = rec.applied_pack_versions.filter(
                    (p) => p.applicable,
                  );
                  const { passRate, passedCount, totalCount } =
                    getRecordPassMetrics(rec);

                  return (
                    <tr key={rec.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 pr-4 font-mono text-zinc-400 tabular-nums whitespace-nowrap">
                        {new Date(rec.evaluated_at).toLocaleString('ko-KR')}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="text-zinc-100 font-medium">
                          {rec.scenario_label}
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          {rec.profile_name}
                        </div>
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded border font-mono text-[11px] font-semibold ${verdictColor}`}
                        >
                          {rec.verdict}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-mono text-right text-zinc-100 tabular-nums whitespace-nowrap">
                        {passedCount !== null && totalCount !== null
                          ? `${passRate}% (${passedCount}/${totalCount})`
                          : `${passRate}%`}
                      </td>
                      <td className="py-3 pr-4 font-mono text-right tabular-nums whitespace-nowrap">
                        <span className="text-rose-300">{rec.blocker_count}</span>
                        <span className="text-zinc-600"> / </span>
                        <span className="text-amber-300">{rec.drift_count}</span>
                      </td>
                      <td className="py-3 pr-4 font-mono text-[11px] text-zinc-300">
                        {applicablePacks.length === 0 ? (
                          <span className="text-zinc-500">적용 팩 없음</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {applicablePacks.map((p, idx) => {
                              const versionTag = p.version
                                ? `v${p.version.replace(/^v/i, '')}`
                                : '';
                              const label = p.law_name || p.pack_id;
                              return (
                                <span
                                  key={`${p.pack_id}-${p.version}-${idx}`}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#08080A] border border-white/[0.08] text-[10px] text-zinc-200"
                                >
                                  L{p.layer} {label}
                                  {versionTag ? ` ${versionTag}` : ''}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedSnapshot(rec)}
                            className="inline-flex items-center gap-1 text-zinc-300 hover:text-zinc-100 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>상세 보기</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onRestoreToStudio(rec)}
                            className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>스튜디오 복원</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteRecord(rec.id)}
                            aria-label="이력 삭제"
                            className="p-1 text-zinc-500 hover:text-rose-300 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Print-Only Formal Audit Evidence Summary (for active or selected snapshot) */}
      <PrintableEvidenceDocument
        record={selectedSnapshot ?? visibleRecords[0] ?? null}
        activeProfile={activeProfile}
      />

      {/* Snapshot Detail Modal */}
      {selectedSnapshot && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedSnapshot(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="snapshot-detail-modal-title"
            className="w-full max-w-3xl max-h-[88vh] rounded-xl border border-white/[0.1] bg-[#0C0C0F] shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between gap-4">
              <div>
                <div className="font-mono text-xs text-cyan-300">
                  {new Date(selectedSnapshot.evaluated_at).toLocaleString('ko-KR')} ·{' '}
                  {selectedSnapshot.verdict} · 충족률{' '}
                  {(() => {
                    const m = getRecordPassMetrics(selectedSnapshot);
                    return m.passedCount !== null && m.totalCount !== null
                      ? `${m.passedCount}/${m.totalCount} (${m.passRate}%)`
                      : `${m.passRate}%`;
                  })()}
                </div>
                <h3
                  id="snapshot-detail-modal-title"
                  className="font-display text-base font-semibold text-zinc-100 mt-0.5"
                >
                  {selectedSnapshot.scenario_label}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAFAFA] hover:bg-white text-[#050507] text-xs font-semibold transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>감사 증빙 리포트 PDF 출력</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSnapshot(null)}
                  aria-label="닫기"
                  className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="rounded-lg border border-white/[0.07] bg-[#08080A] p-4 space-y-2">
                <div className="font-semibold text-zinc-100">
                  {selectedSnapshot.result_snapshot.summary_headline}
                </div>
                <p className="text-zinc-300">
                  {selectedSnapshot.result_snapshot.summary_detail}
                </p>
                <div className="font-mono text-[11px] text-zinc-400 pt-1">
                  적용 팩:{' '}
                  {selectedSnapshot.applied_pack_versions
                    .filter((p) => p.applicable)
                    .map((p) => {
                      const versionTag = p.version
                        ? `v${p.version.replace(/^v/i, '')}`
                        : '';
                      return `L${p.layer} ${p.law_name || p.pack_id}${versionTag ? ` ${versionTag}` : ''}`;
                    })
                    .join(', ') || '적용 팩 없음'}
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-semibold text-zinc-200">
                  조항별 점검 결과 ({selectedSnapshot.result_snapshot.triggered_rules.length}건)
                </div>
                {selectedSnapshot.result_snapshot.triggered_rules.length === 0 ? (
                  <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/[0.06] p-3 text-emerald-200">
                    위반 또는 누락 항목 없음 (전 계층 정합성 통과)
                  </div>
                ) : (
                  <div className="rounded-lg border border-white/[0.07] bg-[#08080A] divide-y divide-white/[0.06]">
                    {selectedSnapshot.result_snapshot.triggered_rules.map((r, idx) => {
                      const matchedPack = selectedSnapshot.applied_pack_versions.find(
                        (p) => p.pack_id === r.pack_id,
                      );
                      const rawVer = r.pack_version || matchedPack?.version || '';
                      const versionTag = rawVer
                        ? `v${rawVer.replace(/^v/i, '')}`
                        : '';
                      const lawName = r.pack_name || matchedPack?.law_name || r.pack_id;

                      return (
                        <div
                          key={`${r.pack_id}-${rawVer}-${r.rule_id}-${idx}`}
                          className="p-3.5 space-y-1"
                        >
                          <div className="font-mono text-[11px] text-zinc-400">
                            [{r.severity}] Layer {r.layer} · {lawName}
                            {versionTag ? ` ${versionTag}` : ''} ({r.pack_id}) ·{' '}
                            {r.article_citation}
                          </div>
                          <div className="font-semibold text-zinc-100">{r.plain_title}</div>
                          <div className="text-zinc-300">{r.plain_explanation}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PrintableEvidenceDocument({
  record,
  activeProfile,
}: {
  record: AuditHistoryRecord | null;
  activeProfile: WorkspaceProfile;
}) {
  if (!record) return null;

  const activeVendors = record.facts_snapshot.transfers.detected_vendors.filter(
    (v) => (v.includes_pii ?? v.sends_pii) !== false,
  );

  return (
    <div className="print-only print-report-surface p-2 space-y-5">
      <div className="border-b-2 border-slate-900 pb-3 flex items-start justify-between">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider">
            Border Checker v2.0 · Data Sovereignty Compliance Evidence
          </div>
          <h1 className="text-xl font-bold mt-1">
            국외 이전 및 개인정보 처리방침 정합성 감사 증빙 리포트
          </h1>
        </div>
        <div className="text-right text-xs font-mono">
          <div>판정: {record.verdict}</div>
          <div>
            충족률:{' '}
            {(() => {
              const m = getRecordPassMetrics(record);
              return m.passedCount !== null && m.totalCount !== null
                ? `${m.passedCount} / ${m.totalCount} (${m.passRate}%)`
                : `${m.passRate}%`;
            })()}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs border border-slate-300 p-3">
        <div>
          <strong>검사 일시:</strong>{' '}
          {new Date(record.evaluated_at).toLocaleString('ko-KR')}
        </div>
        <div>
          <strong>워크스페이스:</strong> {activeProfile.profile_name}
        </div>
        <div>
          <strong>사업자/정보주체 관할권:</strong>{' '}
          {record.facts_snapshot.workspace.business_country} /{' '}
          {record.facts_snapshot.workspace.data_subject_countries.join(', ')}
        </div>
        <div>
          <strong>산업 도메인:</strong>{' '}
          {record.facts_snapshot.workspace.industry_domain}
        </div>
      </div>

      <div className="space-y-2 text-xs">
        <h2 className="font-bold text-sm border-b border-slate-300 pb-1">
          1. 적용 4계층 법률 팩 버전 스냅샷
        </h2>
        <ul className="list-disc pl-5 space-y-0.5">
          {record.applied_pack_versions.map((p, idx) => {
            const versionTag = p.version ? `v${p.version.replace(/^v/i, '')}` : '';
            return (
              <li key={`${p.pack_id}-${p.version}-${idx}`}>
                Layer {p.layer} · {p.law_name || p.pack_id}
                {versionTag ? ` ${versionTag}` : ''} ({p.pack_id}) —{' '}
                {p.applicable ? `적용됨 (${p.triggered_rule_count}건 탐지)` : '비적용'}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-2 text-xs">
        <h2 className="font-bold text-sm border-b border-slate-300 pb-1">
          2. 데이터 이동 경로 및 가상 국외 이전 요약
        </h2>
        <div>
          활성 PII 외부 벤더:{' '}
          {activeVendors.length > 0
            ? activeVendors
                .map(
                  (v) =>
                    `${v.name} (${v.sdk}, ${v.data_residency_country || v.country}, ${v.transfer_purpose})`,
                )
                .join(' / ')
            : '없음'}
        </div>
        <div>
          해외 IAM 열람:{' '}
          {record.facts_snapshot.transfers.virtual_transfer.foreign_iam_access
            ? '예'
            : '아니오'}{' '}
          | 해외 KMS 통제:{' '}
          {record.facts_snapshot.transfers.virtual_transfer.foreign_kms_control
            ? '예'
            : '아니오'}{' '}
          | 전송·저장 암호화:{' '}
          {record.facts_snapshot.security.encryption_in_transit &&
          record.facts_snapshot.security.encryption_at_rest
            ? '적용'
            : '미적용'}
        </div>
      </div>

      <div className="space-y-2 text-xs">
        <h2 className="font-bold text-sm border-b border-slate-300 pb-1">
          3. 조항별 점검 결과 ({record.result_snapshot.triggered_rules.length}건)
        </h2>
        {record.result_snapshot.triggered_rules.length === 0 ? (
          <p>탐지된 불일치 또는 필수 고지 누락 항목이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {record.result_snapshot.triggered_rules.map((r, idx) => {
              const matchedPack = record.applied_pack_versions.find(
                (p) => p.pack_id === r.pack_id,
              );
              const rawVer = r.pack_version || matchedPack?.version || '';
              const versionTag = rawVer ? `v${rawVer.replace(/^v/i, '')}` : '';
              const lawName = r.pack_name || matchedPack?.law_name || r.pack_id;

              return (
                <div
                  key={`${r.pack_id}-${rawVer}-${r.rule_id}-${idx}`}
                  className="border border-slate-300 p-2.5 print-avoid-break"
                >
                  <div className="font-mono font-bold">
                    [{r.severity}] Layer {r.layer} · {lawName}
                    {versionTag ? ` ${versionTag}` : ''} ({r.pack_id}) ·{' '}
                    {r.article_citation}
                  </div>
                  <div className="font-semibold mt-0.5">{r.plain_title}</div>
                  <div className="mt-0.5">{r.plain_explanation}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-slate-400 pt-3 text-[10px]">
        면책 문구: 본 리포트는 개인정보 처리방침 문서와 실제 코드·인프라 설정 간의 정합성 불일치(Config &amp; Policy Drift) 및 법정 필수 고지 항목 누락을 기술적으로 탐지한 참고 증빙 문서이며, 최종 법률 자문을 대체하지 않습니다.
      </div>
    </div>
  );
}
