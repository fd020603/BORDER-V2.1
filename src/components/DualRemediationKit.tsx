import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  FileText,
  RotateCcw,
  Sparkles,
  Terminal,
  Wrench,
} from 'lucide-react';
import { DEFAULT_POLICY_PACKS } from '@/lib/default-packs';
import { evaluateFacts } from '@/lib/rule-evaluator';
import type {
  CanonicalFactModel,
  EvaluationResult,
  PolicyPackV2,
} from '@/lib/types';
import { InfoTooltip } from './InfoTooltip';
import type { ToastVariant } from './Toast';

interface DualRemediationKitProps {
  facts: CanonicalFactModel;
  result: EvaluationResult;
  activePacks?: PolicyPackV2[];
  onApplyLegalDraft?: (markdownDraft: string) => void;
  onApplySecurityFixes?: () => void;
  onShowToast?: (message: string, variant?: ToastVariant) => void;
}

type KitTab = 'legal' | 'dev';
type DiffTab = 'terraform' | 'iam-json' | 'ai-middleware';

interface DiffLine {
  type: 'context' | 'remove' | 'add';
  text: string;
}

const COUNTRY_AWS_REGION_MAP: Record<string, { region: string; label: string }> = {
  KR: { region: 'ap-northeast-2', label: '서울' },
  US: { region: 'us-east-1', label: '버지니아(미국)' },
  JP: { region: 'ap-northeast-1', label: '도쿄(일본)' },
  EU: { region: 'eu-central-1', label: '프랑크푸르트(EU)' },
  SG: { region: 'ap-southeast-1', label: '싱가포르' },
  GB: { region: 'eu-west-2', label: '런던(영국)' },
  CN: { region: 'cn-north-1', label: '베이징(중국)' },
  IN: { region: 'ap-south-1', label: '뭄바이(인도)' },
};

function getAwsRegionForCountry(countryCode: string): {
  region: string;
  label: string;
} {
  const code = countryCode.trim().toUpperCase();
  return (
    COUNTRY_AWS_REGION_MAP[code] ?? {
      region: `${code.toLowerCase() || 'global'}-region-1`,
      label: code || '해외',
    }
  );
}

export function DualRemediationKit({
  facts,
  result,
  activePacks = DEFAULT_POLICY_PACKS,
  onApplyLegalDraft,
  onApplySecurityFixes,
  onShowToast,
}: DualRemediationKitProps) {
  const [activeTab, setActiveTab] = useState<KitTab>('legal');
  const [activeDiffTab, setActiveDiffTab] = useState<DiffTab>('terraform');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [simulatedResult, setSimulatedResult] =
    useState<EvaluationResult | null>(null);
  const [expandedWhenApproved, setExpandedWhenApproved] = useState(false);

  const isCleanApproved =
    result.verdict === 'APPROVED' && result.triggered_rules.length === 0;
  const showSimulationButton =
    result.verdict !== 'APPROVED' &&
    (result.triggered_rules.length > 0 || result.detected_drifts.length > 0);
  const showKitBody = !isCleanApproved || expandedWhenApproved;

  useEffect(() => {
    setSimulatedResult(null);
    setExpandedWhenApproved(false);
  }, [result]);

  const activeVendors = facts.transfers.detected_vendors.filter(
    (v) => (v.includes_pii ?? v.sends_pii) !== false,
  );
  const hasThirdPartySharing = activeVendors.some(
    (v) => v.transfer_purpose === 'THIRD_PARTY_SHARING',
  );
  const hasAiVendor = activeVendors.some((v) => v.category === 'AI');
  const hasVirtualTransfer =
    facts.transfers.virtual_transfer.foreign_iam_access ||
    facts.transfers.virtual_transfer.foreign_kms_control;

  const copyText = async (id: string, text: string, label?: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      }
      setCopiedId(id);
      onShowToast?.(label ? `${label} 복사 완료` : '클립보드에 복사되었습니다.', 'success');
      setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 2000);
    } catch {
      setCopiedId(id);
      onShowToast?.(label ? `${label} 복사 완료` : '클립보드에 복사되었습니다.', 'success');
      setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 2000);
    }
  };

  const handleRunSimulation = () => {
    const cloned = JSON.parse(JSON.stringify(facts)) as CanonicalFactModel;
    const businessCountry = cloned.workspace.business_country.toUpperCase();

    // Apply Dev Fix Kit remediations on cloned copy only
    cloned.security.encryption_in_transit = true;
    cloned.security.encryption_at_rest = true;
    cloned.security.pii_masked_before_transfer = true;
    cloned.transfers.virtual_transfer.foreign_iam_access = false;
    cloned.transfers.virtual_transfer.foreign_kms_control = false;

    // Enable Zero Data Retention (ZDR) on AI vendors as guided in Dev Fix Kit
    cloned.transfers.detected_vendors = cloned.transfers.detected_vendors.map(
      (v) =>
        v.category === 'AI'
          ? { ...v, zero_data_retention: true }
          : v,
    );

    const activeSimVendors = cloned.transfers.detected_vendors.filter(
      (v) => (v.includes_pii ?? v.sends_pii) !== false,
    );
    const activeVendorCountries = Array.from(
      new Set(
        activeSimVendors
          .map((v) => (v.data_residency_country || v.country).toUpperCase())
          .filter((c) => c.length > 0 && c !== businessCountry),
      ),
    );
    // Dev Fix Kit Terraform moves cloud infra region back to domestic (e.g. ap-northeast-2)
    cloned.transfers.destination_countries = activeVendorCountries;
    cloned.transfers.has_cross_border = activeVendorCountries.length > 0;

    // Apply Legal Fix Kit disclosures on cloned copy
    const vendorPiiItems = activeSimVendors.flatMap((v) => v.pii_items ?? []);
    const hasCnJurisdiction =
      businessCountry === 'CN' ||
      cloned.workspace.data_subject_countries.some(
        (c) => c.toUpperCase() === 'CN',
      );
    const requiresSeparateConsent =
      activeSimVendors.some(
        (v) => v.transfer_purpose === 'THIRD_PARTY_SHARING',
      ) ||
      (hasCnJurisdiction &&
        (cloned.transfers.has_cross_border ||
          cloned.workspace.industry_domain === 'HEALTHCARE' ||
          cloned.workspace.industry_domain === 'FINTECH'));
    cloned.legal_doc = {
      ...cloned.legal_doc,
      exists: true,
      claims_domestic_only: false,
      has_entrustment_disclosure: true,
      has_separate_consent: requiresSeparateConsent
        ? true
        : cloned.legal_doc.has_separate_consent,
      disclosed_countries: Array.from(
        new Set([
          ...cloned.legal_doc.disclosed_countries,
          ...activeVendorCountries,
        ]),
      ),
      disclosed_vendors: Array.from(
        new Set([
          ...cloned.legal_doc.disclosed_vendors,
          ...activeSimVendors.map((v) => v.name),
        ]),
      ),
      disclosed_items: Array.from(
        new Set([
          ...cloned.legal_doc.disclosed_items,
          ...(vendorPiiItems.length > 0
            ? vendorPiiItems
            : ['email', 'user_id']),
        ]),
      ),
      disclosed_method_and_time: true,
      disclosed_retention_period: true,
      disclosed_opt_out_method: true,
      disclosed_dest_country_law_info: true,
      has_scc_or_safeguard_notice: true,
      has_ai_training_opt_out_notice: true,
      has_do_not_sell_or_share_notice: true,
    };

    const nextSimResult = evaluateFacts(cloned, activePacks);
    setSimulatedResult(nextSimResult);
    const curTotal =
      result.stats.total_evaluated_rules ?? result.triggered_rules.length;
    const curPassed =
      result.stats.passed_rule_count ??
      Math.max(0, curTotal - result.triggered_rules.length);
    const simTotal =
      nextSimResult.stats.total_evaluated_rules ??
      nextSimResult.triggered_rules.length;
    const simPassed =
      nextSimResult.stats.passed_rule_count ??
      Math.max(0, simTotal - nextSimResult.triggered_rules.length);
    onShowToast?.(
      `시뮬레이션 완료: BLOCKER ${result.stats.blocker_count}건 → ${nextSimResult.stats.blocker_count}건 · ${nextSimResult.verdict} 전환 (충족률 ${curPassed}/${curTotal} → ${simPassed}/${simTotal})`,
      nextSimResult.verdict === 'APPROVED' ? 'success' : 'info',
    );
  };

  // Build Markdown Legal Fix Draft with explicit placeholders for statically unknown specifics
  const vendorTableRows =
    activeVendors.length > 0
      ? activeVendors
          .map((v) => {
            const piiCol =
              v.pii_items && v.pii_items.length > 0
                ? `${v.pii_items.join(', ')} [입력 필요: 실제 전송 PII 항목 검수]`
                : '[입력 필요: 실제 전송 PII 항목]';
            const purposeLabel =
              v.transfer_purpose === 'ENTRUSTMENT'
                ? '계약 이행을 위한 처리위탁·보관'
                : v.transfer_purpose === 'THIRD_PARTY_SHARING'
                  ? '제3자 제공 (별도 동의 대상)'
                  : '서비스 이용 행태 분석';
            return `| ${v.name} (\`${v.sdk}\`) | ${v.data_residency_country || v.country} | ${piiCol} | ${purposeLabel} | [입력 필요: 구체적 보유 및 이용기간] |`;
          })
          .join('\n')
      : '| [입력 필요: 국외 수탁 벤더명] | [입력 필요: 국가] | [입력 필요: 실제 전송 PII 항목] | 처리위탁·보관 | [입력 필요: 구체적 보유 및 이용기간] |';

  const legalMarkdownDraft = [
    '### 제○조 (개인정보의 국외 이전에 관한 사항)',
    '',
    '당사는 개인정보 보호법 제28조의8 제1항 제3호(계약 이행을 위한 국외 처리위탁·보관) 및 관계 법령에 따라 아래와 같이 개인정보를 국외로 이전·처리하고 있습니다.',
    '',
    '| 이전받는 자 (법인명 / SDK) | 이전 국가 | 이전 항목 | 이전 목적 | 보유 및 이용기간 |',
    '| :--- | :--- | :--- | :--- | :--- |',
    vendorTableRows,
    '',
    '- **이전 일시 및 방법**: 서비스 이용 시점에 TLS 1.3 암호화 네트워크를 통해 실시간 API 전송',
    '- **이전 거부 방법·절차 및 효과**: [입력 필요: 개인정보 보호책임자 이메일 또는 고객센터 연락처]를 통해 국외 이전을 거부할 수 있으며, 거부 시 해당 외부 연동 기능의 이용이 제한될 수 있습니다.',
    hasAiVendor
      ? '- **생성형 AI 처리 및 학습 제외 안내**: 외부 LLM API는 Zero Data Retention(ZDR) 기업용 정책 또는 모델 학습 제외(Opt-out) 설정을 적용하여 AI 모델 학습에 활용되지 않습니다.'
      : '',
    activeVendors.some((v) => (v.data_residency_country || v.country) === 'US')
      ? '- **수신국 법제 및 안전장치(DPF/SCC)**: 미국 수신 벤더는 EU-US Data Privacy Framework(DPF) 또는 표준계약조항(SCC)을 준수하며, 전송 전 직접 식별자 마스킹 등 보충적 기술 보호조치를 적용합니다.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const consentUiSnippet = `<label className="flex items-start gap-2.5 text-sm">
  <input type="checkbox" name="cross_border_consent" required />
  <span>
    [필수/선택] 개인정보 국외 제3자 제공 동의 —{' '}
    ${
      activeVendors
        .filter((v) => v.transfer_purpose === 'THIRD_PARTY_SHARING')
        .map((v) => `${v.name}(${v.data_residency_country || v.country})`)
        .join(', ') || '[입력 필요: 제3자 제공 벤더명(국가)]'
    }에{' '}
    [입력 필요: 실제 전송 PII 항목]을 제공합니다. (보유기간: [입력 필요: 구체적 보유 및 이용기간])
  </span>
</label>`;

  const businessCountry = facts.workspace.business_country.toUpperCase() || 'KR';
  const domesticRegion = getAwsRegionForCountry(businessCountry);
  const foreignDestinations = Array.from(
    new Set(
      facts.transfers.destination_countries
        .map((c) => c.toUpperCase())
        .filter((c) => c.length > 0 && c !== businessCountry),
    ),
  );
  const primaryForeignCountry = foreignDestinations[0] ?? 'US';
  const primaryForeignRegion = getAwsRegionForCountry(primaryForeignCountry);
  const hasForeignIam = facts.transfers.virtual_transfer.foreign_iam_access;
  const hasForeignKms = facts.transfers.virtual_transfer.foreign_kms_control;
  const redactFnName =
    businessCountry === 'KR' ? 'redactKoreanPii' : 'redactPii';

  const terraformDiff: DiffLine[] = [
    { type: 'context', text: 'provider "aws" {' },
    ...(foreignDestinations.length > 0
      ? ([
          ...foreignDestinations.map((countryCode): DiffLine => {
            const foreignRegion = getAwsRegionForCountry(countryCode);
            return {
              type: 'remove',
              text: `  region = "${foreignRegion.region}" # 해외 리전(${foreignRegion.label}) 저장·이전 탐지`,
            };
          }),
          {
            type: 'add',
            text: `  region = "${domesticRegion.region}" # 국내 리전(${domesticRegion.label}) 고정`,
          },
        ] as DiffLine[])
      : ([
          {
            type: 'context',
            text: `  region = "${domesticRegion.region}" # 현재 국내 리전(${domesticRegion.label}) 유지 중`,
          },
        ] as DiffLine[])),
    { type: 'context', text: '}' },
    { type: 'context', text: '' },
    ...(hasForeignKms
      ? ([
          {
            type: 'context',
            text: `# [BLOCKER 치유 강조] 해외 KMS 키 통제 탐지 (${primaryForeignRegion.region}) → ${businessCountry} 국내 CMK 교체`,
          },
        ] as DiffLine[])
      : ([] as DiffLine[])),
    { type: 'context', text: 'resource "aws_kms_key" "domestic_cmk" {' },
    ...(hasForeignKms
      ? ([
          {
            type: 'remove',
            text: `  kms_key_id              = "arn:aws:kms:${primaryForeignRegion.region}:123456789012:key/foreign-cmk" # 탐지된 해외 KMS 통제 제거`,
          },
          {
            type: 'add',
            text: `  description             = "${businessCountry}-only Customer Managed KMS Key (${domesticRegion.region})"`,
          },
          {
            type: 'add',
            text: '  enable_key_rotation     = true',
          },
          {
            type: 'add',
            text: '  policy                  = data.aws_iam_policy_document.domestic_kms_only.json',
          },
        ] as DiffLine[])
      : ([
          {
            type: 'add',
            text: `  description             = "${businessCountry}-only Customer Managed KMS Key (${domesticRegion.region})"`,
          },
          {
            type: 'add',
            text: '  enable_key_rotation     = true',
          },
        ] as DiffLine[])),
    { type: 'context', text: '}' },
    { type: 'context', text: '' },
    {
      type: 'context',
      text: 'resource "aws_s3_bucket_server_side_encryption_configuration" "pii_sse" {',
    },
    { type: 'add', text: '  rule {' },
    { type: 'add', text: '    apply_server_side_encryption_by_default {' },
    { type: 'add', text: '      kms_master_key_id = aws_kms_key.domestic_cmk.arn' },
    { type: 'add', text: '      sse_algorithm     = "aws:kms"' },
    { type: 'add', text: '    }' },
    { type: 'add', text: '  }' },
    { type: 'context', text: '}' },
  ];

  const iamJsonDiff: DiffLine[] = [
    ...(hasForeignIam
      ? [
          {
            type: 'context' as const,
            text: `// [BLOCKER 치유 강조] 해외 IAM 원격 열람 탐지 — ${domesticRegion.region}(${businessCountry}) 외 접근 및 비암호화 전송 즉시 차단`,
          },
        ]
      : [
          {
            type: 'context' as const,
            text: `// ${businessCountry} 국내 리전(${domesticRegion.region}) 한정 및 TLS 강제 버킷 정책`,
          },
        ]),
    { type: 'context', text: '{' },
    { type: 'context', text: '  "Version": "2012-10-17",' },
    { type: 'context', text: '  "Statement": [' },
    ...(hasForeignIam
      ? [
          {
            type: 'remove' as const,
            text: `    { "Effect": "Allow", "Principal": { "AWS": "arn:aws:iam::999988887777:role/${primaryForeignCountry.toLowerCase()}-hq-admin" }, "Action": "s3:GetObject", "Resource": "arn:aws:s3:::prod-pii/*" },`,
          },
        ]
      : []),
    { type: 'add', text: '    {' },
    {
      type: 'add',
      text: hasForeignIam
        ? '      "Sid": "DenyForeignIamAccessAndEnforceDomesticRegion",'
        : '      "Sid": "DenyCrossBorderAndInsecureTransport",',
    },
    { type: 'add', text: '      "Effect": "Deny",' },
    { type: 'add', text: '      "Principal": "*",' },
    { type: 'add', text: '      "Action": ["s3:*", "rds:*"],' },
    { type: 'add', text: '      "Resource": "arn:aws:s3:::prod-pii/*",' },
    { type: 'add', text: '      "Condition": {' },
    { type: 'add', text: '        "Bool": { "aws:SecureTransport": "false" },' },
    {
      type: 'add',
      text: `        "StringNotEquals": { "aws:RequestedRegion": "${domesticRegion.region}" }`,
    },
    { type: 'add', text: '      }' },
    { type: 'add', text: '    }' },
    { type: 'context', text: '  ]' },
    { type: 'context', text: '}' },
  ];

  const aiVendors = activeVendors.filter((v) => v.category === 'AI');
  const hasOpenAi = aiVendors.some((v) => v.sdk === 'openai');
  const hasAnthropic = aiVendors.some((v) => v.sdk === '@anthropic-ai/sdk');
  const hasGemini = aiVendors.some((v) => v.sdk === '@google/genai');
  const otherAiVendors = aiVendors.filter(
    (v) =>
      v.sdk !== 'openai' &&
      v.sdk !== '@anthropic-ai/sdk' &&
      v.sdk !== '@google/genai',
  );

  const aiMiddlewareDiff: DiffLine[] = [
    {
      type: 'context',
      text:
        aiVendors.length > 0
          ? `// 탐지된 AI SDK(${aiVendors.map((v) => v.sdk).join(', ')}) 대상 PII 마스킹 및 학습 제외(ZDR) 패치`
          : '// 외부 LLM API 연동 시 적용할 표준 PII 마스킹 및 학습 제외(ZDR) 미들웨어 예시',
    },
  ];

  if (hasOpenAi) {
    aiMiddlewareDiff.push(
      { type: 'context', text: '' },
      { type: 'context', text: '// 1) OpenAI SDK (`openai`) — store: false (ZDR) + PII 마스킹' },
      {
        type: 'remove',
        text: 'const res = await openai.chat.completions.create({ model: "gpt-4o", messages: [{ role: "user", content: rawUserText }] });',
      },
      {
        type: 'add',
        text: `const maskedText = ${redactFnName}(rawUserText); // 이메일·전화번호·고유식별자 치환`,
      },
      { type: 'add', text: 'const res = await openai.chat.completions.create({' },
      { type: 'add', text: '  model: "gpt-4o",' },
      { type: 'add', text: '  store: false, // Zero Data Retention (API 학습·저장 제외)' },
      { type: 'add', text: '  messages: [{ role: "user", content: maskedText }],' },
      { type: 'add', text: '});' },
    );
  }

  if (hasAnthropic) {
    aiMiddlewareDiff.push(
      { type: 'context', text: '' },
      { type: 'context', text: '// 2) Anthropic SDK (`@anthropic-ai/sdk`) — ZDR 정책 + PII 마스킹' },
      {
        type: 'remove',
        text: 'const msg = await anthropic.messages.create({ model: "claude-3-7-sonnet-latest", max_tokens: 1024, messages: [{ role: "user", content: rawUserText }] });',
      },
      {
        type: 'add',
        text: `const maskedText = ${redactFnName}(rawUserText); // 전송 전 직접 식별자 마스킹`,
      },
      { type: 'add', text: 'const msg = await anthropic.messages.create(' },
      {
        type: 'add',
        text: '  { model: "claude-3-7-sonnet-latest", max_tokens: 1024, messages: [{ role: "user", content: maskedText }] },',
      },
      {
        type: 'add',
        text: '  { headers: { "anthropic-beta": "zero-data-retention-2024-11-01" } }, // Enterprise ZDR 계약 적용',
      },
      { type: 'add', text: ');' },
    );
  }

  if (hasGemini) {
    aiMiddlewareDiff.push(
      { type: 'context', text: '' },
      { type: 'context', text: '// 3) Google GenAI SDK (`@google/genai`) — 유료/Vertex ZDR 티어 + PII 마스킹' },
      {
        type: 'remove',
        text: 'const res = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: rawUserText });',
      },
      {
        type: 'add',
        text: `const maskedText = ${redactFnName}(rawUserText); // 프롬프트 내 개인정보 마스킹`,
      },
      {
        type: 'add',
        text: '// Vertex AI 또는 Paid Tier(Zero Data Retention / 모델 학습 미사용) API 키 사용',
      },
      { type: 'add', text: 'const res = await ai.models.generateContent({' },
      { type: 'add', text: '  model: "gemini-2.5-flash",' },
      { type: 'add', text: '  contents: maskedText,' },
      { type: 'add', text: '});' },
    );
  }

  if (otherAiVendors.length > 0 || (!hasOpenAi && !hasAnthropic && !hasGemini)) {
    const targetLabel =
      otherAiVendors.length > 0
        ? otherAiVendors.map((v) => `${v.name} (${v.sdk})`).join(', ')
        : 'AI SDK';
    aiMiddlewareDiff.push(
      { type: 'context', text: '' },
      { type: 'context', text: `// ${targetLabel} — 공통 PII 마스킹 및 Zero Data Retention 래퍼` },
      {
        type: 'remove',
        text: 'const aiResponse = await aiClient.generate({ prompt: rawUserText });',
      },
      {
        type: 'add',
        text: `const maskedText = ${redactFnName}(rawUserText); // 이메일·전화번호·식별자 마스킹`,
      },
      {
        type: 'add',
        text: 'const aiResponse = await aiClient.generate({ prompt: maskedText, store: false }); // ZDR 옵션 활성화',
      },
    );
  }

  const activeDiffLines =
    activeDiffTab === 'terraform'
      ? terraformDiff
      : activeDiffTab === 'iam-json'
        ? iamJsonDiff
        : aiMiddlewareDiff;

  const activeDiffPlainText = activeDiffLines
    .filter((l) => l.type !== 'remove')
    .map((l) => l.text)
    .join('\n');

  const consoleChecklist = [
    {
      title: `1. AWS S3 · RDS 리전 격리 확인 (${domesticRegion.region})`,
      detail: `AWS Console → S3 / RDS → 리전 선택기가 \`${domesticRegion.label} (${domesticRegion.region})\`인지 확인하고, 타 리전 버킷 복제(CRR) 규칙을 해제합니다.`,
    },
    {
      title: hasForeignKms
        ? '2. [긴급] 해외 KMS 키 통제 해제 및 국내 CMK 교체'
        : '2. 고객 관리형 KMS 키(CMK) 분리 적용',
      detail: `AWS KMS → 고객 관리형 키 생성(${domesticRegion.region}) 후 S3 기본 암호화 및 RDS 스토리지 암호화에 연결해 해외 계정 복호화 권한을 제거합니다.`,
    },
    ...(hasVirtualTransfer
      ? [
          {
            title: '3. [긴급] 해외 지사 IAM Role 열람 권한 차단',
            detail: `AWS IAM → 역할(Roles)에서 해외 본사/외부 계정 신뢰 관계(Trust Policy)의 프로덕션 DB·S3 읽기 권한을 제거하고 ${domesticRegion.region} 리전 외 접근을 Deny 처리합니다.`,
          },
        ]
      : []),
    ...(hasAiVendor
      ? [
          {
            title: `4. LLM 플랫폼 Zero Data Retention(ZDR) 활성화 (${aiVendors.map((v) => v.name).join(', ')})`,
            detail:
              '사용 중인 LLM 플랫폼 콘솔(Data Controls / Enterprise ZDR)에서 API 학습 활용 비활성화(Opt-out) 및 Zero Data Retention 설정을 적용합니다.',
          },
        ]
      : []),
  ];

  const renderHighlightedTemplate = (text: string) => {
    const parts = text.split(/(\[입력 필요:[^\]]+\])/g);
    return parts.map((part, idx) =>
      part.startsWith('[입력 필요:') ? (
        <span
          key={idx}
          className="inline-block whitespace-nowrap align-baseline bg-amber-500/15 text-amber-200 border border-amber-500/35 rounded px-1.5 py-0.5 font-medium"
        >
          {part}
        </span>
      ) : (
        <React.Fragment key={idx}>{part}</React.Fragment>
      ),
    );
  };

  return (
    <section
      id="dual-remediation-kit"
      className={`scroll-mt-20 rounded-xl border bg-[#0C0C0F] p-5 space-y-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] ${
        isCleanApproved && !expandedWhenApproved
          ? 'border-emerald-500/30'
          : 'border-white/[0.07]'
      }`}
    >
      {isCleanApproved ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="text-xs sm:text-sm font-medium text-emerald-100">
              현재 적용된 모든 법률 팩 기준을 통과하여 긴급 치유가 필요하지 않습니다.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {expandedWhenApproved && (
              <div className="flex items-center gap-1 p-1 rounded-lg bg-[#08080A] border border-white/[0.07] shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('legal')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap ${
                    activeTab === 'legal'
                      ? 'bg-[#141419] border-[#38BDF8] text-zinc-100'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Legal Fix Kit (법무 치유)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('dev')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap ${
                    activeTab === 'dev'
                      ? 'bg-[#141419] border-[#38BDF8] text-zinc-100'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Dev Fix Kit (기술 치유)</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setExpandedWhenApproved((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.1] bg-[#08080A] hover:border-white/[0.2] text-xs font-medium text-zinc-200 transition-colors whitespace-nowrap shrink-0"
            >
              <span>
                {expandedWhenApproved ? '접기' : '참고용 표준 템플릿 펼쳐보기'}
              </span>
              {expandedWhenApproved ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Wrench className="w-5 h-5 text-cyan-400 shrink-0" />
            <div>
              <h3 className="font-display text-base font-semibold text-zinc-100">
                원클릭 Dual 자동 치유 키트 (Auto-Remediation Kit)
              </h3>
              <p className="text-xs text-zinc-400">
                탐지된 Drift와 누락 항목을 즉시 해결하기 위한 처리방침 초안 및 인프라 패치 코드를 생성했습니다.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {showSimulationButton && (
              <button
                type="button"
                onClick={handleRunSimulation}
                className="btn-shimmer inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#FAFAFA] hover:bg-white text-[#050507] text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>이 수정 초안을 적용해 재심사 시뮬레이션</span>
              </button>
            )}

            {/* 2-Tab Switcher */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#08080A] border border-white/[0.07] shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('legal')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'legal'
                    ? 'bg-[#141419] border-[#38BDF8] text-zinc-100'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                <span>Legal Fix Kit (법무 치유)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('dev')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap ${
                  activeTab === 'dev'
                    ? 'bg-[#141419] border-[#38BDF8] text-zinc-100'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Code2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Dev Fix Kit (기술 치유)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showKitBody && simulatedResult && (() => {
        const curTotal =
          result.stats.total_evaluated_rules ?? result.triggered_rules.length;
        const curPassed =
          result.stats.passed_rule_count ??
          Math.max(0, curTotal - result.triggered_rules.length);
        const simTotal =
          simulatedResult.stats.total_evaluated_rules ??
          simulatedResult.triggered_rules.length;
        const simPassed =
          simulatedResult.stats.passed_rule_count ??
          Math.max(0, simTotal - simulatedResult.triggered_rules.length);
        const simVerdictLabel =
          simulatedResult.verdict === 'APPROVED'
            ? '승인(APPROVED)'
            : simulatedResult.verdict === 'CONDITIONAL'
              ? '조건부(CONDITIONAL)'
              : simulatedResult.verdict;

        return (
          <div
            role="status"
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/[0.07] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-semibold text-zinc-100 tabular-nums">
                <span className="font-mono text-rose-300">
                  BLOCKER {result.stats.blocker_count}건 →{' '}
                  {simulatedResult.stats.blocker_count}건
                </span>
                <ArrowRight className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-mono text-emerald-300">
                  {simVerdictLabel} 전환
                </span>
                <span className="font-mono text-xs text-emerald-200 bg-emerald-500/15 border border-emerald-500/35 rounded px-2 py-0.5 tabular-nums">
                  충족률 {curPassed}/{curTotal} → {simPassed}/{simTotal} (
                  {simulatedResult.stats.pass_rate_percent}%)
                </span>
              </div>
              <div className="text-[11px] text-zinc-300">
                원본 입력 상태를 변경하지 않은 가상 시뮬레이션입니다 · 판정{' '}
                {result.verdict} → {simulatedResult.verdict} · Drift{' '}
                {result.stats.drift_count}건 → {simulatedResult.stats.drift_count}건
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSimulatedResult(null)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-white/[0.1] bg-[#08080A] hover:border-white/[0.2] text-xs text-zinc-300 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              <span>시뮬레이션 닫기</span>
            </button>
          </div>
        );
      })()}

      {showKitBody && (activeTab === 'legal' ? (
        <div key="kit-legal" className="space-y-4 animate-panel-enter">
          {/* Privacy Policy Draft */}
          <div className="rounded-lg border border-white/[0.07] bg-[#08080A] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                  <span>개정 개인정보 처리방침 · 국외 이전 고지 초안 (Markdown)</span>
                  <InfoTooltip term="entrustment_exemption" />
                </div>
                <div className="text-[11px] text-zinc-500">
                  코드 스캔으로 알 수 없는 보유기간·세부 컬럼은 노란색 [입력 필요] 플레이스홀더로 표시됩니다.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {onApplyLegalDraft && (
                  <button
                    type="button"
                    onClick={() => onApplyLegalDraft(legalMarkdownDraft)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#FAFAFA] hover:bg-white text-[#050507] text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>처리방침에 초안 반영</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    copyText('legal-md', legalMarkdownDraft, '처리방침 국외 이전 초안')
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-zinc-200 transition-colors whitespace-nowrap"
                >
                  {copiedId === 'legal-md' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-300">복사됨!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>초안 복사</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            <pre className="p-4 text-xs font-mono text-zinc-200 whitespace-pre-wrap leading-relaxed overflow-x-auto">
              {renderHighlightedTemplate(legalMarkdownDraft)}
            </pre>
          </div>

          {/* Separate Consent UI Snippet */}
          <div className="rounded-lg border border-white/[0.07] bg-[#08080A] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-zinc-100">
                  회원가입 / 결제 국외 제3자 제공 별도 동의 UI 스니펫 (React JSX)
                </div>
                <div className="text-[11px] text-zinc-500">
                  {hasThirdPartySharing
                    ? 'THIRD_PARTY_SHARING 목적이 탐지되어 별도 동의 체크박스 UI 반영이 필요합니다.'
                    : '제3자 제공(THIRD_PARTY_SHARING) 목적 추가 시 사용할 수 있는 표준 동의 UI입니다.'}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  copyText('consent-ui', consentUiSnippet, '별도 동의 UI 코드')
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-zinc-200 transition-colors whitespace-nowrap shrink-0"
              >
                {copiedId === 'consent-ui' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300">복사됨!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>UI 코드 복사</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-4 text-xs font-mono text-zinc-200 overflow-x-auto leading-relaxed">
              {renderHighlightedTemplate(consentUiSnippet)}
            </pre>
          </div>
        </div>
      ) : (
        <div key="kit-dev" className="space-y-4 animate-panel-enter">
          {/* Non-expert Cloud Console Checklist */}
          <div className="rounded-lg border border-white/[0.07] bg-[#08080A] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] text-xs font-semibold text-zinc-100">
              비전문가용 클라우드 콘솔 클릭 체크리스트
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/[0.06]">
              {consoleChecklist.map((step) => (
                <div key={step.title} className="p-4 border-b border-white/[0.06] last:border-b-0">
                  <div className="text-xs font-semibold text-cyan-300">
                    {step.title}
                  </div>
                  <p className="text-[11px] text-zinc-300 mt-1.5 leading-relaxed">
                    {step.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Code Diff Viewer (Before vs After) */}
          <div className="rounded-lg border border-white/[0.07] bg-[#08080A] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Terminal className="w-4 h-4 text-cyan-400 mr-1" />
                <button
                  type="button"
                  onClick={() => setActiveDiffTab('terraform')}
                  className={`px-2.5 py-1 rounded border text-xs font-mono transition-colors ${
                    activeDiffTab === 'terraform'
                      ? 'bg-[#141419] text-zinc-100 border-[#38BDF8]'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Terraform HCL
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDiffTab('iam-json')}
                  className={`px-2.5 py-1 rounded border text-xs font-mono transition-colors ${
                    activeDiffTab === 'iam-json'
                      ? 'bg-[#141419] text-zinc-100 border-[#38BDF8]'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  AWS S3 / IAM Policy
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDiffTab('ai-middleware')}
                  className={`px-2.5 py-1 rounded border text-xs font-mono transition-colors ${
                    activeDiffTab === 'ai-middleware'
                      ? 'bg-[#141419] text-zinc-100 border-[#38BDF8]'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  LLM PII Masking
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {onApplySecurityFixes && (
                  <button
                    type="button"
                    onClick={onApplySecurityFixes}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/50 text-emerald-200 text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>보안·ZDR 설정 반영</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    copyText(
                      `diff-${activeDiffTab}`,
                      activeDiffPlainText,
                      '인프라 패치 코드',
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-zinc-200 transition-colors whitespace-nowrap"
                >
                  {copiedId === `diff-${activeDiffTab}` ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-300">복사됨!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>패치 코드 복사</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="p-3 font-mono text-xs overflow-x-auto space-y-0.5">
              {activeDiffLines.map((line, idx) => {
                const lineClass =
                  line.type === 'remove'
                    ? 'bg-rose-500/[0.12] text-rose-300'
                    : line.type === 'add'
                      ? 'bg-emerald-500/[0.12] text-emerald-300'
                      : 'text-zinc-400';
                const prefix =
                  line.type === 'remove' ? '- ' : line.type === 'add' ? '+ ' : '  ';
                return (
                  <div
                    key={idx}
                    className={`px-2.5 py-0.5 rounded whitespace-pre ${lineClass}`}
                  >
                    {prefix}
                    {line.text}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
