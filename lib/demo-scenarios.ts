import type { CanonicalFactModel, WorkspaceProfile } from './types';

export interface DemoScenario {
  id: string;
  short_label: string;
  title: string;
  subtitle: string;
  expected_verdict_hint: string;
  sample_package_json: string;
  sample_privacy_policy: string;
  facts: CanonicalFactModel;
}

export const DEFAULT_WORKSPACE_PROFILES: WorkspaceProfile[] = [
  {
    id: 'profile-prod-ai-saas',
    profile_name: '운영 서버 — AI SaaS',
    description: '국내 B2B/B2C AI 문서 요약 서비스 (서울 리전 + LLM API)',
    business_country: 'KR',
    data_subject_countries: ['KR'],
    industry_domain: 'AI_SAAS',
    updated_at: '2026-11-20T09:30:00Z',
  },
  {
    id: 'profile-global-commerce',
    profile_name: '글로벌 커머스 베타',
    description: '한국·EU·미국 대상 결제 및 행동 분석 연동 스택',
    business_country: 'KR',
    data_subject_countries: ['KR', 'EU', 'US'],
    industry_domain: 'GENERAL',
    updated_at: '2026-11-18T14:15:00Z',
  },
  {
    id: 'profile-healthcare-ai',
    profile_name: 'AI 헬스케어 파일럿',
    description: '한국·EU 환자 데이터 분석 및 글로벌 팀 협업 환경',
    business_country: 'KR',
    data_subject_countries: ['KR', 'EU'],
    industry_domain: 'HEALTHCARE',
    updated_at: '2026-11-15T11:00:00Z',
  },
];

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'case-1-approved',
    short_label: 'Case 1 · 정상 승인',
    title: '정상 승인 — 처리위탁 특례(제28조의8 제1항 제3호) 준수',
    subtitle:
      '국내 AI SaaS + 서울 리전 + OpenAI 연동이지만 처리방침 5대 고지와 AI 학습 제외(ZDR) 안내가 완비되어 별도 동의 없이도 통과합니다.',
    expected_verdict_hint: 'APPROVED',
    sample_package_json: JSON.stringify(
      {
        name: 'seoul-ai-workspace',
        dependencies: {
          next: '^15.0.0',
          openai: '^4.70.0',
          '@tosspayments/payment-sdk': '^1.9.0',
        },
      },
      null,
      2,
    ),
    sample_privacy_policy:
      '당사는 계약 이행을 위한 개인정보 처리위탁 및 보관(개인정보 보호법 제28조의8 제1항 제3호)을 위해 OpenAI LLC(미국)에 가명·마스킹 처리된 프롬프트 데이터를 실시간 암호화 전송합니다. 보유기간은 위탁 계약 종료 시까지이며, 거부 시 AI 요약 기능 이용이 제한될 수 있습니다. 미국 FISA/CLOUD Act 리스크 완화를 위해 Zero Data Retention(AI 학습 제외) 계약 및 DPF 안전장치를 적용합니다.',
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
          {
            name: 'Toss Payments Co., Ltd.',
            sdk: '@tosspayments/payment-sdk',
            country: 'KR',
            default_country: 'KR',
            data_residency_country: 'KR',
            transfer_purpose: 'ENTRUSTMENT',
            includes_pii: false,
            dpf_certified: false,
            baa_supported: false,
            zero_data_retention: false,
            category: 'PAYMENT',
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
        disclosed_items: ['masked_prompt_text', 'account_identifier'],
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
  {
    id: 'case-2-drift',
    short_label: 'Case 2 · 위조 여권(Drift)',
    title: '위조 여권 탐지 — Policy-Infra Drift & Layer 3·4 동시 적발',
    subtitle:
      '처리방침에는 "국내 단독 보관"을 선언했으나, package.json에 openai·stripe·mixpanel이 포함되고 AWS 도쿄 리전(JP)으로 데이터를 전송 중입니다.',
    expected_verdict_hint: 'DRIFT_DETECTED',
    sample_package_json: JSON.stringify(
      {
        name: 'global-commerce-mvp',
        dependencies: {
          react: '^19.0.0',
          openai: '^4.70.0',
          stripe: '^17.0.0',
          mixpanel: '^2.55.0',
        },
      },
      null,
      2,
    ),
    sample_privacy_policy:
      '회사는 이용자의 모든 개인정보를 대한민국 국내 서버에 단독으로 보관하며, 어떠한 경우에도 제3자에게 제공하거나 국외로 이전하지 않습니다.',
    facts: {
      workspace: {
        business_country: 'KR',
        data_subject_countries: ['KR', 'US'],
        industry_domain: 'AI_SAAS',
      },
      transfers: {
        has_cross_border: true,
        destination_countries: ['US', 'JP'],
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
            name: 'Stripe, Inc.',
            sdk: 'stripe',
            country: 'US',
            default_country: 'US',
            data_residency_country: 'US',
            transfer_purpose: 'ENTRUSTMENT',
            includes_pii: true,
            dpf_certified: true,
            baa_supported: false,
            zero_data_retention: false,
            pii_items: ['email', 'billing_address'],
            category: 'PAYMENT',
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
            pii_items: ['user_id', 'device_id', 'behavior_events'],
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
    id: 'case-3-denied',
    short_label: 'Case 3 · 다중 규제 충돌',
    title: '가상 국외 이전 & 다중 규제 충돌 (PIPA · GDPR · FISA · AI Act)',
    subtitle:
      'AI 헬스케어 서비스 — DB는 서울 리전이지만 미국 본사 IAM 열람 권한과 해외 KMS 통제, EU 사용자 포함, 암호화 미적용이 동시 탐지되었습니다.',
    expected_verdict_hint: 'DENIED',
    sample_package_json: JSON.stringify(
      {
        name: 'medai-diagnostics-api',
        dependencies: {
          '@anthropic-ai/sdk': '^0.32.0',
          '@supabase/supabase-js': '^2.46.0',
          segment: '^6.0.0',
        },
      },
      null,
      2,
    ),
    sample_privacy_policy:
      '당사는 서비스 제공을 위해 필요한 최소한의 개인정보를 수집합니다. 해외 클라우드 인프라 및 파트너를 활용할 수 있습니다.',
    facts: {
      workspace: {
        business_country: 'KR',
        data_subject_countries: ['KR', 'EU'],
        industry_domain: 'HEALTHCARE',
      },
      transfers: {
        has_cross_border: true,
        destination_countries: ['US'],
        detected_vendors: [
          {
            name: 'Anthropic PBC',
            sdk: '@anthropic-ai/sdk',
            country: 'US',
            default_country: 'US',
            data_residency_country: 'US',
            transfer_purpose: 'ENTRUSTMENT',
            includes_pii: true,
            dpf_certified: false,
            baa_supported: true,
            zero_data_retention: true,
            pii_items: ['patient_symptom_notes'],
            category: 'AI',
          },
          {
            name: 'Twilio Segment',
            sdk: 'segment',
            country: 'US',
            default_country: 'US',
            data_residency_country: 'US',
            transfer_purpose: 'THIRD_PARTY_SHARING',
            includes_pii: true,
            dpf_certified: true,
            baa_supported: true,
            zero_data_retention: false,
            pii_items: ['email', 'clinical_event_tags'],
            category: 'ANALYTICS',
          },
        ],
        virtual_transfer: {
          foreign_iam_access: true,
          foreign_kms_control: true,
        },
      },
      security: {
        encryption_in_transit: false,
        encryption_at_rest: false,
        pii_masked_before_transfer: false,
      },
      legal_doc: {
        exists: true,
        claims_domestic_only: false,
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
    id: 'case-4-custom',
    short_label: 'Case 4 · 빈 템플릿',
    title: '커스텀 빈 템플릿 — 초기 진단 대기 상태',
    subtitle:
      '사용자가 직접 의존성 파일과 처리방침 텍스트를 입력해 검증할 수 있도록 초기화된 기본 CanonicalFactModel 상태입니다.',
    expected_verdict_hint: 'DENIED',
    sample_package_json: JSON.stringify(
      {
        name: 'custom-service',
        dependencies: {},
      },
      null,
      2,
    ),
    sample_privacy_policy: '',
    facts: {
      workspace: {
        business_country: 'KR',
        data_subject_countries: ['KR'],
        industry_domain: 'GENERAL',
      },
      transfers: {
        has_cross_border: false,
        destination_countries: [],
        detected_vendors: [],
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
        exists: false,
        claims_domestic_only: false,
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
];
