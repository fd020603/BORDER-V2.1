import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Download,
  GitBranch,
  GitCommit,
  GitMerge,
  GitPullRequest,
  Lock,
  Terminal,
  XCircle,
} from 'lucide-react';
import { evaluateFacts } from '@/lib/rule-evaluator';
import type { CanonicalFactModel, PolicyPackV2 } from '@/lib/types';
import type { ToastVariant } from './Toast';

interface CicdGateTabProps {
  activePacks: PolicyPackV2[];
  workspaceFacts?: CanonicalFactModel;
  workspaceProfileName?: string;
  onShowToast?: (message: string, variant?: ToastVariant) => void;
}

interface PrDiffFile {
  filename: string;
  lines: Array<{ type: 'context' | 'remove' | 'add'; text: string }>;
}

type PrSelectionId = 'workspace' | 'pr-142-block' | 'pr-143-pass';

interface PrPreset {
  id: PrSelectionId;
  shortLabel: string;
  prNumber: number;
  title: string;
  author: string;
  branch: string;
  baseBranch: string;
  commitHash: string;
  timestamp: string;
  files: PrDiffFile[];
  facts: CanonicalFactModel;
}

const PR_PRESETS: PrPreset[] = [
  {
    id: 'pr-142-block',
    shortLabel: 'PR #142 [차단 케이스: 무단 해외 리전 + 고지 누락]',
    prNumber: 142,
    title: 'feat: Add OpenAI Assistant & switch S3 bucket to us-east-1',
    author: 'dev-alex',
    branch: 'feat/ai-assistant-us-east',
    baseBranch: 'main',
    commitHash: 'a8f31c9',
    timestamp: '12 minutes ago',
    files: [
      {
        filename: 'package.json',
        lines: [
          { type: 'context', text: '  "dependencies": {' },
          { type: 'context', text: '    "next": "^15.1.0",' },
          { type: 'add', text: '    "openai": "^4.70.0",' },
          { type: 'add', text: '    "mixpanel": "^2.55.0",' },
          { type: 'context', text: '    "react": "^19.0.1"' },
          { type: 'context', text: '  }' },
        ],
      },
      {
        filename: 'infra/main.tf',
        lines: [
          { type: 'context', text: 'provider "aws" {' },
          { type: 'remove', text: '  region = "ap-northeast-2"' },
          { type: 'add', text: '  region = "us-east-1"' },
          { type: 'context', text: '}' },
          { type: 'context', text: 'resource "aws_s3_bucket" "user_uploads" {' },
          { type: 'add', text: '  bucket = "prod-us-east-user-docs"' },
          { type: 'context', text: '}' },
        ],
      },
      {
        filename: 'docs/privacy-policy.md',
        lines: [
          { type: 'context', text: '## 개인정보 보관 및 처리' },
          { type: 'context', text: '당사는 이용자의 개인정보를 대한민국 국내 서버에 단독 보관합니다.' },
        ],
      },
    ],
    facts: {
      workspace: {
        business_country: 'KR',
        data_subject_countries: ['KR', 'US'],
        industry_domain: 'AI_SAAS',
      },
      transfers: {
        has_cross_border: true,
        destination_countries: ['US'],
        detected_vendors: [
          {
            name: 'OpenAI LLC',
            sdk: 'openai',
            country: 'US',
            default_country: 'US',
            data_residency_country: 'US',
            transfer_purpose: 'ENTRUSTMENT',
            includes_pii: true,
            dpf_certified: true,
            baa_supported: true,
            zero_data_retention: true,
            pii_items: ['email', 'prompt_text'],
            category: 'AI',
          },
          {
            name: 'Mixpanel, Inc.',
            sdk: 'mixpanel',
            country: 'US',
            default_country: 'US',
            data_residency_country: 'US',
            transfer_purpose: 'ANALYTICS',
            includes_pii: true,
            dpf_certified: true,
            baa_supported: false,
            zero_data_retention: false,
            pii_items: ['user_id', 'events'],
            category: 'ANALYTICS',
          },
        ],
        virtual_transfer: {
          foreign_iam_access: false,
          foreign_kms_control: false,
        },
      },
      security: {
        encryption_in_transit: true,
        encryption_at_rest: true,
        pii_masked_before_transfer: false,
      },
      legal_doc: {
        exists: true,
        claims_domestic_only: true,
        has_separate_consent: false,
        has_entrustment_disclosure: false,
        disclosed_countries: [],
        disclosed_vendors: [],
        disclosed_items: [],
        disclosed_method_and_time: false,
        disclosed_retention_period: false,
        disclosed_opt_out_method: false,
        disclosed_dest_country_law_info: false,
        has_scc_or_safeguard_notice: false,
        has_ai_training_opt_out_notice: false,
        has_do_not_sell_or_share_notice: false,
      },
    },
  },
  {
    id: 'pr-143-pass',
    shortLabel: 'PR #143 [통과 케이스: 서울 리전 + 처리방침 동시 업데이트]',
    prNumber: 143,
    title: 'chore: Keep ap-northeast-2 & sync OpenAI ZDR privacy notice',
    author: 'dev-alex',
    branch: 'fix/pipa-compliance-zdr',
    baseBranch: 'main',
    commitHash: '4e91b02',
    timestamp: '3 minutes ago',
    files: [
      {
        filename: 'package.json',
        lines: [
          { type: 'context', text: '  "dependencies": {' },
          { type: 'add', text: '    "openai": "^4.70.0",' },
          { type: 'context', text: '    "react": "^19.0.1"' },
          { type: 'context', text: '  }' },
        ],
      },
      {
        filename: 'infra/main.tf',
        lines: [
          { type: 'context', text: 'provider "aws" {' },
          { type: 'context', text: '  region = "ap-northeast-2"' },
          { type: 'context', text: '}' },
          { type: 'add', text: 'resource "aws_kms_key" "seoul_cmk" { enable_key_rotation = true }' },
        ],
      },
      {
        filename: 'docs/privacy-policy.md',
        lines: [
          { type: 'remove', text: '- 당사는 이용자의 개인정보를 대한민국 국내 서버에 단독 보관합니다.' },
          { type: 'add', text: '+ 제7조(국외 처리위탁) 개인정보 보호법 제28조의8 제1항 제3호에 따라 OpenAI LLC(US)에 마스킹된 프롬프트를 암호화 전송합니다.' },
          { type: 'add', text: '+ 보유기간: 위탁 종료 시까지 · 거부 시 AI 기능 제한 · ZDR(학습 제외) 및 미국 법제 안내 적용' },
        ],
      },
    ],
    facts: {
      workspace: {
        business_country: 'KR',
        data_subject_countries: ['KR'],
        industry_domain: 'AI_SAAS',
      },
      transfers: {
        has_cross_border: true,
        destination_countries: ['US'],
        detected_vendors: [
          {
            name: 'OpenAI LLC',
            sdk: 'openai',
            country: 'US',
            default_country: 'US',
            data_residency_country: 'US',
            transfer_purpose: 'ENTRUSTMENT',
            includes_pii: true,
            dpf_certified: true,
            baa_supported: true,
            zero_data_retention: true,
            pii_items: ['masked_prompt_text'],
            category: 'AI',
          },
        ],
        virtual_transfer: {
          foreign_iam_access: false,
          foreign_kms_control: false,
        },
      },
      security: {
        encryption_in_transit: true,
        encryption_at_rest: true,
        pii_masked_before_transfer: true,
      },
      legal_doc: {
        exists: true,
        claims_domestic_only: false,
        has_separate_consent: false,
        has_entrustment_disclosure: true,
        disclosed_countries: ['US'],
        disclosed_vendors: ['OpenAI LLC'],
        disclosed_items: ['masked_prompt_text'],
        disclosed_method_and_time: true,
        disclosed_retention_period: true,
        disclosed_opt_out_method: true,
        disclosed_dest_country_law_info: true,
        has_scc_or_safeguard_notice: true,
        has_ai_training_opt_out_notice: true,
        has_do_not_sell_or_share_notice: true,
      },
    },
  },
];

const GITHUB_WORKFLOW_YAML = `name: Border Checker Data Sovereignty Gate

on:
  pull_request:
    paths:
      - 'package.json'
      - 'requirements.txt'
      - 'infra/**'
      - '**/*.tf'
      - 'docs/privacy-policy.md'

jobs:
  border-gate:
    name: Policy-Infra Drift & Cross-Border Check
    runs-on: ubuntu-latest
    steps:
      - name: Checkout PR Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install Dependencies
        run: npm ci

      - name: Run Border Checker Linter Gate
        env:
          BORDER_CHECKER_FAIL_ON: 'BLOCKER,DRIFT'
        run: |
          npm run lint:border -- \\
            --deps package.json \\
            --infra infra/main.tf \\
            --policy docs/privacy-policy.md \\
            --packs KR_PIPA_v2,EU_GDPR_v2,JP_APPI_v2,CN_PIPL_v2,US_CLOUD_ACT_v2,US_CCPA_CPRA_v2,KR_AI_BASIC_ACT_v2,EU_AI_ACT_v2 \\
            --fail-on BLOCKER,DRIFT \\
            --output pr-comment.md

      - name: Post PR Review Comment
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const body = fs.readFileSync('pr-comment.md', 'utf8');
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body
            });
`;

export function CicdGateTab({
  activePacks,
  workspaceFacts,
  workspaceProfileName = '현재 워크스페이스',
  onShowToast,
}: CicdGateTabProps) {
  const [selectedPrId, setSelectedPrId] = useState<PrSelectionId>(
    workspaceFacts ? 'workspace' : 'pr-142-block',
  );
  const [mergedSuccess, setMergedSuccess] = useState(false);
  const [copiedYaml, setCopiedYaml] = useState(false);

  const allPrOptions = useMemo<PrPreset[]>(() => {
    if (!workspaceFacts) return PR_PRESETS;

    const activeVendors = workspaceFacts.transfers.detected_vendors.filter(
      (v) => (v.includes_pii ?? v.sends_pii) !== false,
    );
    const workspacePreset: PrPreset = {
      id: 'workspace',
      shortLabel: `현재 워크스페이스 실시간 검증 (${workspaceProfileName})`,
      prNumber: 144,
      title: `audit: Verify ${workspaceProfileName} sovereignty & policy drift`,
      author: 'workspace-live',
      branch: 'feat/live-workspace-audit',
      baseBranch: 'main',
      commitHash: 'live-head',
      timestamp: 'just now',
      files: [
        {
          filename: 'package.json',
          lines: [
            { type: 'context', text: '  "dependencies": {' },
            ...(activeVendors.length > 0
              ? activeVendors.map((v) => ({
                  type: 'add' as const,
                  text: `    "${v.sdk}": "active", // ${v.data_residency_country || v.country} (${v.transfer_purpose})`,
                }))
              : [{ type: 'context' as const, text: '    // 외부 PII 전송 SDK 없음' }]),
            { type: 'context', text: '  }' },
          ],
        },
        {
          filename: 'infra/main.tf',
          lines: [
            {
              type: 'context',
              text: `// business_country = "${workspaceFacts.workspace.business_country}"`,
            },
            {
              type: workspaceFacts.transfers.destination_countries.length > 0 ? 'add' : 'context',
              text: `// destination_countries = [${workspaceFacts.transfers.destination_countries.join(', ') || 'DOMESTIC_ONLY'}]`,
            },
            {
              type:
                workspaceFacts.transfers.virtual_transfer.foreign_iam_access ||
                workspaceFacts.transfers.virtual_transfer.foreign_kms_control
                  ? 'add'
                  : 'context',
              text: `// foreign_iam=${workspaceFacts.transfers.virtual_transfer.foreign_iam_access}, foreign_kms=${workspaceFacts.transfers.virtual_transfer.foreign_kms_control}`,
            },
            {
              type:
                workspaceFacts.security.encryption_in_transit &&
                workspaceFacts.security.encryption_at_rest
                  ? 'context'
                  : 'remove',
              text: `// tls=${workspaceFacts.security.encryption_in_transit}, at_rest=${workspaceFacts.security.encryption_at_rest}, pii_masked=${workspaceFacts.security.pii_masked_before_transfer}`,
            },
          ],
        },
        {
          filename: 'docs/privacy-policy.md',
          lines: [
            {
              type: workspaceFacts.legal_doc.exists ? 'context' : 'remove',
              text: workspaceFacts.legal_doc.exists
                ? `// 처리방침 존재 · 위탁고지=${workspaceFacts.legal_doc.has_entrustment_disclosure} · 공개국가=[${workspaceFacts.legal_doc.disclosed_countries.join(', ')}]`
                : '// 개인정보 처리방침 문서 미등록 상태',
            },
          ],
        },
      ],
      facts: workspaceFacts,
    };

    return [workspacePreset, ...PR_PRESETS];
  }, [workspaceFacts, workspaceProfileName]);

  const selectedPr =
    allPrOptions.find((p) => p.id === selectedPrId) ?? allPrOptions[0];

  const evaluation = useMemo(() => {
    return evaluateFacts(selectedPr.facts, activePacks);
  }, [selectedPr, activePacks]);

  const isBlocked =
    evaluation.verdict === 'DENIED' ||
    evaluation.verdict === 'DRIFT_DETECTED' ||
    evaluation.stats.blocker_count > 0;

  const handleSelectPr = (id: PrSelectionId) => {
    setSelectedPrId(id);
    setMergedSuccess(false);
  };

  const handleCopyYaml = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(GITHUB_WORKFLOW_YAML);
      }
      setCopiedYaml(true);
      onShowToast?.('GitHub Actions YAML이 클립보드에 복사되었습니다.', 'success');
      setTimeout(() => setCopiedYaml(false), 2000);
    } catch {
      setCopiedYaml(true);
      onShowToast?.('GitHub Actions YAML이 클립보드에 복사되었습니다.', 'success');
      setTimeout(() => setCopiedYaml(false), 2000);
    }
  };

  const handleDownloadYaml = () => {
    const blob = new Blob([GITHUB_WORKFLOW_YAML], {
      type: 'text/yaml;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'border-checker.yml';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    onShowToast?.('border-checker.yml 파일 다운로드가 시작되었습니다.', 'info');
  };

  return (
    <div className="space-y-6">
      {/* PR Preset Selector Header */}
      <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <GitPullRequest className="w-5 h-5 text-sky-400" />
            <h2 className="font-display text-base font-semibold text-slate-100">
              Shift-Left CI/CD 배포 게이트 시뮬레이터 (GitHub Pull Request)
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            배포 이후 탐지가 아닌 PR 머지 직전 단계에서 `evaluateFacts()` 엔진이 코드·인프라 변경분을 검증하고 무단 반출을 차단합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {allPrOptions.map((pr) => {
            const active = pr.id === selectedPr.id;
            return (
              <button
                key={pr.id}
                type="button"
                onClick={() => handleSelectPr(pr.id)}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-sky-500 border-sky-400 text-slate-950 font-semibold'
                    : 'bg-[#060913] border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                {pr.shortLabel}
              </button>
            );
          })}
        </div>
      </section>

      {/* GitHub PR Main Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: PR Metadata & Git Diff Viewer */}
        <section className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#0B1120] overflow-hidden">
          <div className="p-5 border-b border-slate-800 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs text-slate-400">
                acme-corp/border-commerce · Pull Request #{selectedPr.prNumber}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 font-mono text-xs font-semibold ${
                  mergedSuccess
                    ? 'text-purple-300'
                    : isBlocked
                      ? 'text-rose-300'
                      : 'text-emerald-300'
                }`}
              >
                {mergedSuccess ? (
                  <>
                    <GitMerge className="w-3.5 h-3.5" />
                    <span>Merged</span>
                  </>
                ) : (
                  <>
                    <GitPullRequest className="w-3.5 h-3.5" />
                    <span>Open · {isBlocked ? 'Checks Failing' : 'Ready to Merge'}</span>
                  </>
                )}
              </span>
            </div>

            <h3 className="font-display text-base font-semibold text-slate-100">
              {selectedPr.title}
            </h3>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 font-mono">
              <span className="inline-flex items-center gap-1 text-sky-300">
                <GitBranch className="w-3.5 h-3.5" />
                {selectedPr.baseBranch} ← {selectedPr.branch}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <GitCommit className="w-3.5 h-3.5" />
                {selectedPr.commitHash}
              </span>
              <span aria-hidden="true">·</span>
              <span>@{selectedPr.author} · {selectedPr.timestamp}</span>
            </div>
          </div>

          {/* Changed Files Git Diff */}
          <div className="p-5 space-y-4">
            {selectedPr.files.map((file) => (
              <div
                key={file.filename}
                className="rounded-lg border border-slate-800 bg-[#060913] overflow-hidden"
              >
                <div className="px-3.5 py-2 border-b border-slate-800 bg-[#090E1C] font-mono text-xs text-slate-300">
                  {file.filename}
                </div>
                <div className="p-2.5 font-mono text-xs overflow-x-auto space-y-0.5">
                  {file.lines.map((line, idx) => {
                    const cls =
                      line.type === 'add'
                        ? 'bg-emerald-950/50 text-emerald-300'
                        : line.type === 'remove'
                          ? 'bg-rose-950/50 text-rose-300'
                          : 'text-slate-400';
                    const prefix =
                      line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
                    return (
                      <div
                        key={idx}
                        className={`px-2 py-0.5 rounded whitespace-pre ${cls}`}
                      >
                        {prefix} {line.text}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Right: Border Checker Bot Comment + Merge Gate Box */}
        <section className="lg:col-span-5 space-y-5">
          {/* GitHub Actions Check Status + Merge Box */}
          <div
            className={`rounded-xl border p-5 space-y-4 ${
              isBlocked
                ? 'border-rose-800/70 bg-rose-950/20'
                : 'border-emerald-800/70 bg-emerald-950/20'
            }`}
          >
            <div className="flex items-start gap-3">
              {isBlocked ? (
                <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-mono text-xs font-semibold text-slate-100">
                  {isBlocked
                    ? '❌ Border Checker Gate — Deployment Blocked'
                    : '✅ Border Checker Gate — Passed'}
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  {isBlocked
                    ? `판정 ${evaluation.verdict} (충족률 ${evaluation.stats.pass_rate_percent}% · ${evaluation.stats.passed_rule_count}/${evaluation.stats.total_evaluated_rules}): BLOCKER ${evaluation.stats.blocker_count}건 · Drift ${evaluation.stats.drift_count}건이 해소되기 전까지 머지가 잠금 처리됩니다.`
                    : `판정 ${evaluation.verdict} (충족률 ${evaluation.stats.pass_rate_percent}% · ${evaluation.stats.passed_rule_count}/${evaluation.stats.total_evaluated_rules}): 자동 매칭 법률 팩(${evaluation.applied_pack_versions.filter((p) => p.applicable).length}종) 검증을 통과했습니다.`}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-3">
              <div className="text-[11px] font-mono text-slate-400">
                활성 팩 {activePacks.length}종 적용됨
              </div>

              {isBlocked ? (
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-500 text-xs font-semibold cursor-not-allowed whitespace-nowrap"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Merge pull request (Locked)</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setMergedSuccess(true)}
                  disabled={mergedSuccess}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-70 text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  <GitMerge className="w-3.5 h-3.5" />
                  <span>
                    {mergedSuccess ? 'Merged to main' : 'Merge pull request'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Border Checker Bot Automated Review Comment */}
          <div className="rounded-xl border border-slate-800 bg-[#0B1120] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 bg-[#090E1C] flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <Bot className="w-4 h-4 text-sky-400" />
                <span className="font-semibold text-slate-100">
                  border-checker-bot
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  commented just now
                </span>
              </div>
              <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                충족률 {evaluation.stats.passed_rule_count}/
                {evaluation.stats.total_evaluated_rules} ({evaluation.stats.pass_rate_percent}%)
              </span>
            </div>

            <div className="p-4 space-y-3 text-xs leading-relaxed">
              <div className="font-semibold text-slate-100">
                {evaluation.summary_headline}
              </div>
              <p className="text-slate-300">{evaluation.summary_detail}</p>

              {evaluation.detected_drifts.length > 0 && (
                <div className="rounded-lg border border-amber-800/60 bg-amber-950/25 p-3 space-y-1">
                  <div className="font-mono text-[11px] font-semibold text-amber-300">
                    Policy-Infra Drift ({evaluation.detected_drifts.length}건)
                  </div>
                  {evaluation.detected_drifts.map((d) => (
                    <div key={d.rule_id} className="text-[11px] text-slate-200">
                      • {d.summary}
                    </div>
                  ))}
                </div>
              )}

              {evaluation.triggered_rules.length > 0 ? (
                <div className="space-y-1.5">
                  <div className="font-medium text-slate-300">
                    탐지된 점검 항목 ({evaluation.triggered_rules.length}건):
                  </div>
                  {evaluation.triggered_rules.slice(0, 5).map((r) => (
                    <div
                      key={r.rule_id}
                      className="rounded border border-slate-800 bg-[#060913] px-3 py-2 flex items-start gap-2"
                    >
                      <AlertOctagon
                        className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                          r.severity === 'BLOCKER'
                            ? 'text-rose-400'
                            : 'text-amber-400'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="font-mono text-[10px] text-slate-400">
                          [{r.severity}] {r.pack_id} · {r.article_citation}
                        </div>
                        <div className="text-slate-200 font-medium">
                          {r.plain_title}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/20 p-3 text-emerald-200">
                  처리방침 고지문과 코드·인프라 변경분이 100% 일치합니다.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* GitHub Actions Workflow Generator */}
      <section className="rounded-xl border border-slate-800 bg-[#0B1120] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-sky-400" />
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-100">
                레포지토리 즉시 도입용 GitHub Actions 워크플로우
              </h3>
              <p className="text-[11px] font-mono text-slate-400">
                .github/workflows/border-checker.yml
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyYaml}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-100 transition-colors whitespace-nowrap"
            >
              {copiedYaml ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">복사됨!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>YAML 복사</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadYaml}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>.yml 다운로드</span>
            </button>
          </div>
        </div>

        <pre className="p-4 text-xs font-mono text-slate-200 bg-[#060913] overflow-x-auto leading-relaxed">
          {GITHUB_WORKFLOW_YAML}
        </pre>
      </section>
    </div>
  );
}
