import { DEFAULT_POLICY_PACKS } from './default-packs';
import { DEMO_SCENARIOS } from './demo-scenarios';
import { scanDependencyFile } from './dependency-scanner';
import { extractHeuristicPayload, validateExtractedPayload } from './llm-parser';
import { resolvePackCatalog, resolveRequiredPacks } from './pack-loader';
import {
  buildEvaluationContext,
  computeEffectiveHasCrossBorder,
  evaluateFacts,
} from './rule-evaluator';
import { storageRepository } from './storage';
import type { CanonicalFactModel, PolicyPackV2 } from './types';
import { validatePolicyPackV2 } from '../src/components/PolicyPacksTab';

let passed = 0;
let failed = 0;

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message} (expected=${JSON.stringify(expected)}, actual=${JSON.stringify(actual)})`,
    );
  }
}

function assertThrows(fn: () => unknown, message: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error(`${message} (expected function to throw, but it returned)`);
  }
}

function runTest(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (err) {
    failed += 1;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`FAIL: ${name} -> ${msg}`);
  }
}

function cloneFacts(facts: CanonicalFactModel): CanonicalFactModel {
  return JSON.parse(JSON.stringify(facts)) as CanonicalFactModel;
}

function makeBaseFacts(overrides: Partial<CanonicalFactModel> = {}): CanonicalFactModel {
  return {
    workspace: {
      business_country: 'KR',
      data_subject_countries: ['KR'],
      industry_domain: 'GENERAL',
      ...overrides.workspace,
    },
    transfers: {
      has_cross_border: false,
      destination_countries: [],
      detected_vendors: [],
      virtual_transfer: {
        foreign_iam_access: false,
        foreign_kms_control: false,
        ...overrides.transfers?.virtual_transfer,
      },
      ...overrides.transfers,
    },
    security: {
      encryption_in_transit: true,
      encryption_at_rest: true,
      pii_masked_before_transfer: false,
      ...overrides.security,
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
      has_ai_service_notice: false,
      has_ai_output_label_notice: false,
      has_do_not_sell_or_share_notice: false,
      ...overrides.legal_doc,
    },
  };
}

runTest('1. DEMO_SCENARIOS[0] (Case 1 정상 처리위탁 특례) -> APPROVED, blocker_count === 0', () => {
  const scenario = DEMO_SCENARIOS[0];
  const result = evaluateFacts(cloneFacts(scenario.facts), DEFAULT_POLICY_PACKS);
  assertEqual(result.verdict, 'APPROVED', 'Case 1 verdict must be APPROVED');
  assertEqual(result.stats.blocker_count, 0, 'Case 1 blocker_count must be 0');
  const entrustmentRule = result.triggered_rules.find(
    (r) => r.rule_id === 'KR-PIPA-28-8-3-ENTRUSTMENT',
  );
  assert(
    !entrustmentRule,
    'Case 1 must not trigger KR-PIPA-28-8-3-ENTRUSTMENT false positive',
  );
});

runTest('2. DEMO_SCENARIOS[1] (Case 2 위조 여권 Drift) -> DRIFT_DETECTED, drift_count > 0', () => {
  const scenario = DEMO_SCENARIOS[1];
  const result = evaluateFacts(cloneFacts(scenario.facts), DEFAULT_POLICY_PACKS);
  assertEqual(
    result.verdict,
    'DRIFT_DETECTED',
    'Case 2 verdict must be DRIFT_DETECTED',
  );
  assert(result.stats.drift_count > 0, 'Case 2 drift_count must be > 0');
});

runTest('3. DEMO_SCENARIOS[2] (Case 3 가상 국외 이전 + 다중 충돌) -> DENIED, blocker_count > 0', () => {
  const scenario = DEMO_SCENARIOS[2];
  const result = evaluateFacts(cloneFacts(scenario.facts), DEFAULT_POLICY_PACKS);
  assertEqual(result.verdict, 'DENIED', 'Case 3 verdict must be DENIED');
  assert(result.stats.blocker_count > 0, 'Case 3 blocker_count must be > 0');
});

runTest('4. includes_pii: false 토글 시 벤더 위반 및 도착국 집계에서 제외', () => {
  const facts = makeBaseFacts({
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
          includes_pii: false,
          dpf_certified: true,
          baa_supported: true,
          zero_data_retention: false,
          category: 'AI',
        },
      ],
      virtual_transfer: {
        foreign_iam_access: false,
        foreign_kms_control: false,
      },
    },
    legal_doc: {
      exists: true,
      claims_domestic_only: false,
      has_separate_consent: false,
      has_entrustment_disclosure: false,
      disclosed_countries: [],
      disclosed_vendors: [],
      disclosed_items: ['email'],
      disclosed_method_and_time: false,
      disclosed_retention_period: true,
      disclosed_opt_out_method: false,
      disclosed_dest_country_law_info: false,
      has_scc_or_safeguard_notice: false,
      has_ai_training_opt_out_notice: false,
      has_do_not_sell_or_share_notice: false,
    },
  });

  const result = evaluateFacts(facts, DEFAULT_POLICY_PACKS);
  assertEqual(
    result.stats.active_vendor_count,
    0,
    'Non-PII vendor must not count as active vendor',
  );
  assertEqual(
    result.stats.excluded_non_pii_vendor_count,
    1,
    'Excluded non-PII vendor count must be 1',
  );
  assertEqual(
    result.stats.active_destination_countries.length,
    0,
    'Country of non-PII vendor only must be excluded from active_destination_countries',
  );
  assert(
    !result.triggered_rules.some(
      (r) =>
        r.rule_id === 'KR-PIPA-28-8-3-ENTRUSTMENT' ||
        r.rule_id === 'KR-PIPA-37-2-AI-NOTICE',
    ),
    'Non-PII vendor must not trigger cross-border entrustment or AI vendor rules',
  );
});

runTest('5. 해외 벤더 없이 foreign_iam_access: true 순수 가상 국외 이전 시 has_cross_border 및 관련 룰 발동', () => {
  const pureVirtualFacts = makeBaseFacts({
    transfers: {
      has_cross_border: false,
      destination_countries: [],
      detected_vendors: [],
      virtual_transfer: {
        foreign_iam_access: true,
        foreign_kms_control: false,
      },
    },
  });

  assertEqual(
    computeEffectiveHasCrossBorder([], [], 'KR', {
      foreign_iam_access: true,
      foreign_kms_control: false,
    }),
    true,
    'computeEffectiveHasCrossBorder must return true for pure virtual transfer',
  );

  const { context } = buildEvaluationContext(pureVirtualFacts);
  assertEqual(
    context.transfers.has_cross_border,
    true,
    'Pure virtual transfer must evaluate transfers.has_cross_border as true',
  );
  assertEqual(
    context.derived.has_any_virtual_transfer,
    true,
    'derived.has_any_virtual_transfer must be true',
  );

  const result = evaluateFacts(pureVirtualFacts, DEFAULT_POLICY_PACKS);
  assert(
    result.triggered_rules.some((r) => r.rule_id === 'KR-PIPA-28-8-VIRTUAL-ACCESS'),
    'Pure virtual transfer must trigger KR-PIPA-28-8-VIRTUAL-ACCESS',
  );
  assert(
    result.triggered_rules.some((r) => r.rule_id === 'KR-PIPA-28-8-4-SAFEGUARD'),
    'Pure virtual transfer with missing safeguard notice must trigger KR-PIPA-28-8-4-SAFEGUARD',
  );
});

runTest('6. validateExtractedPayload 런타임 스키마 검증 동작 확인', () => {
  assertThrows(
    () => validateExtractedPayload({ result: 'ok' }),
    'Unrelated JSON object must be rejected',
  );
  assertThrows(
    () => validateExtractedPayload([]),
    'Array root must be rejected',
  );
  assertThrows(
    () => validateExtractedPayload({ legal_doc: { exists: 'true' } }),
    'Wrong primitive type inside legal_doc must be rejected',
  );
  const valid = validateExtractedPayload({
    legal_doc: { exists: true, disclosed_countries: ['US'] },
    security: { encryption_in_transit: true },
  });
  assertEqual(valid.legal_doc?.exists, true, 'Valid payload must be accepted');
});

runTest('7. KR_AI_BASIC_ACT_v2 제31조 AI 서비스·결과물 표시 팩트가 학습 opt-out과 독립 평가됨', () => {
  const aiFacts = makeBaseFacts({
    workspace: {
      business_country: 'KR',
      data_subject_countries: ['KR'],
      industry_domain: 'AI_SAAS',
    },
    legal_doc: {
      exists: true,
      claims_domestic_only: false,
      has_separate_consent: false,
      has_entrustment_disclosure: true,
      disclosed_countries: [],
      disclosed_vendors: [],
      disclosed_items: [],
      disclosed_method_and_time: true,
      disclosed_retention_period: true,
      disclosed_opt_out_method: true,
      disclosed_dest_country_law_info: true,
      has_scc_or_safeguard_notice: true,
      has_ai_training_opt_out_notice: true,
      has_ai_service_notice: false,
      has_ai_output_label_notice: false,
      has_do_not_sell_or_share_notice: false,
    },
  });

  const missingResult = evaluateFacts(aiFacts, DEFAULT_POLICY_PACKS);
  assert(
    missingResult.triggered_rules.some((r) => r.rule_id === 'KR-AI-31-1'),
    'KR-AI-31-1 must trigger when has_ai_service_notice is false even if training opt-out is true',
  );
  assert(
    missingResult.triggered_rules.some((r) => r.rule_id === 'KR-AI-31-2-3'),
    'KR-AI-31-2-3 must trigger when has_ai_output_label_notice is false',
  );

  const heuristic = extractHeuristicPayload(
    '본 서비스는 생성형 인공지능(AI) 기반 서비스를 운영하며 AI 생성 결과물 워터마크 표시를 제공합니다.',
    '',
    [],
    false,
  );
  assertEqual(
    heuristic.legal_doc?.has_ai_service_notice,
    true,
    'Heuristic parser must detect AI service notice',
  );
  assertEqual(
    heuristic.legal_doc?.has_ai_output_label_notice,
    true,
    'Heuristic parser must detect AI output label notice',
  );
});

runTest('8. EU_GDPR_v2 및 EU_AI_ACT_v2, US_CCPA_CPRA_v2, JP_APPI_v2, CN_PIPL_v2 적용 및 규칙 검증', () => {
  // EU GDPR + EU AI Act + Healthcare unmasked PII -> EU-GDPR-9-1 and EU-AI-50-1
  const euHealthcareFacts = makeBaseFacts({
    workspace: {
      business_country: 'EU',
      data_subject_countries: ['EU'],
      industry_domain: 'HEALTHCARE',
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
          dpf_certified: false,
          baa_supported: true,
          zero_data_retention: false,
          category: 'AI',
        },
      ],
      virtual_transfer: { foreign_iam_access: false, foreign_kms_control: false },
    },
    security: {
      encryption_in_transit: true,
      encryption_at_rest: true,
      pii_masked_before_transfer: false,
    },
  });

  const euRes = evaluateFacts(euHealthcareFacts, DEFAULT_POLICY_PACKS);
  assert(
    euRes.triggered_rules.some((r) => r.rule_id === 'EU-GDPR-9-1'),
    'EU-GDPR-9-1 must trigger for unmasked healthcare PII without separate consent/disclosures',
  );
  assert(
    euRes.triggered_rules.some((r) => r.rule_id === 'EU-GDPR-45-US-DPF'),
    'EU-GDPR-45-US-DPF must trigger for non-DPF US vendor',
  );
  assert(
    euRes.triggered_rules.some((r) => r.rule_id === 'EU-AI-50-TRANSPARENCY'),
    'EU-AI-50-TRANSPARENCY must trigger for EU AI vendor without AI notice',
  );

  // JP APPI + CN PIPL + US CCPA checks
  const multiFacts = makeBaseFacts({
    workspace: {
      business_country: 'JP',
      data_subject_countries: ['JP', 'CN', 'US'],
      industry_domain: 'GENERAL',
    },
    transfers: {
      has_cross_border: true,
      destination_countries: ['US'],
      detected_vendors: [
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
          category: 'ANALYTICS',
        },
      ],
      virtual_transfer: { foreign_iam_access: false, foreign_kms_control: false },
    },
  });
  const multiRes = evaluateFacts(multiFacts, DEFAULT_POLICY_PACKS);
  assert(
    multiRes.triggered_rules.some((r) => r.pack_id === 'JP_APPI_v2'),
    'JP_APPI_v2 must evaluate and trigger when JP disclosures are missing',
  );
  assert(
    multiRes.triggered_rules.some((r) => r.pack_id === 'CN_PIPL_v2'),
    'CN_PIPL_v2 must evaluate when CN data subjects are present',
  );
  assert(
    multiRes.triggered_rules.some((r) => r.pack_id === 'US_CCPA_CPRA_v2'),
    'US_CCPA_CPRA_v2 must evaluate when US subjects + ANALYTICS vendor lack opt-out link',
  );
});

runTest('9. collectAppliedCountryRisks: US 사업자의 순수 가상 이전 시 US를 해외 리스크 국가로 오인하지 않음', () => {
  const usBusinessPureVirtual = makeBaseFacts({
    workspace: {
      business_country: 'US',
      data_subject_countries: ['US'],
      industry_domain: 'GENERAL',
    },
    transfers: {
      has_cross_border: true,
      destination_countries: [],
      detected_vendors: [],
      virtual_transfer: {
        foreign_iam_access: true,
        foreign_kms_control: false,
      },
    },
  });
  const res = evaluateFacts(usBusinessPureVirtual, DEFAULT_POLICY_PACKS);
  assertEqual(
    res.applied_country_risks.some((r) => r.country_code === 'US'),
    false,
    'US business with pure virtual transfer must not flag US as foreign destination risk',
  );
});

runTest('10. dependency-scanner 다중 파일 스캔 및 AWS 리전 탐지 동작 확인', () => {
  const pkgScan = scanDependencyFile(
    'package.json',
    JSON.stringify({ dependencies: { openai: '^4.0.0', stripe: '^16.0.0', 'unknown-pkg': '1.0.0' } }),
  );
  assertEqual(pkgScan.fileType, 'package.json', 'Must detect package.json');
  assertEqual(pkgScan.detectedVendors.length, 2, 'Must detect openai and stripe');
  assertEqual(pkgScan.unknownPackages.length, 1, 'Must list unknown-pkg');

  const envScan = scanDependencyFile(
    '.env.example',
    'OPENAI_API_KEY=sk-test\nAWS_REGION=ap-northeast-1\n',
  );
  assert(
    envScan.detectedVendors.some((v) => v.sdk === 'openai'),
    '.env.example must detect openai from OPENAI_API_KEY',
  );
  assert(
    envScan.detectedRegions.includes('aws-tokyo'),
    '.env.example must detect aws-tokyo from ap-northeast-1',
  );
});

runTest('11. pack-loader 버전 대체(superseding) 및 disabledPackIds 필터 검증', () => {
  const basePack = DEFAULT_POLICY_PACKS[0];
  const newerPlugin: PolicyPackV2 = {
    ...cloneFacts(basePack as unknown as CanonicalFactModel) as unknown as PolicyPackV2,
    pack_meta: {
      ...basePack.pack_meta,
      version: '2.9.0',
    },
  };
  const catalog = resolvePackCatalog([...DEFAULT_POLICY_PACKS, newerPlugin], ['EU_AI_ACT_v2']);
  assert(
    catalog.supersededPackIds.includes(basePack.pack_meta.id),
    'Older pack version must be superseded by newer plugin pack',
  );
  assert(
    !catalog.enabledCatalog.some((p) => p.pack_meta.id === 'EU_AI_ACT_v2'),
    'Disabled pack must be excluded from enabledCatalog',
  );
  const req = resolveRequiredPacks(DEMO_SCENARIOS[0].facts, DEFAULT_POLICY_PACKS, []);
  assert(
    req.requiredPacks.some((p) => p.pack_meta.id === 'KR_PIPA_v2'),
    'KR_PIPA_v2 must be resolved as required for Case 1',
  );
});

runTest('12. validatePolicyPackV2 빈 combinator(all/any: []) 및 잘못된 drift_type 거부 검증', () => {
  const samplePack = JSON.parse(JSON.stringify(DEFAULT_POLICY_PACKS[0])) as Record<string, unknown>;
  const emptyAllPack = JSON.parse(JSON.stringify(samplePack)) as PolicyPackV2;
  emptyAllPack.rules[0].condition_dsl = { all: [] };
  assertEqual(
    validatePolicyPackV2(emptyAllPack).ok,
    false,
    'Empty all: [] combinator must be rejected',
  );

  const badDriftPack = JSON.parse(JSON.stringify(samplePack)) as Record<string, unknown>;
  ((badDriftPack.rules as Array<Record<string, unknown>>)[0].drift_check as Record<string, unknown>).drift_type =
    'INVALID_DRIFT_TYPE';
  assertEqual(
    validatePolicyPackV2(badDriftPack).ok,
    false,
    'Invalid drift_type must be rejected',
  );

  assertEqual(
    validatePolicyPackV2(samplePack).ok,
    true,
    'Valid PolicyPackV2 must pass validation',
  );
});

runTest('13. storageRepository 워크스페이스 JSON 백업 내보내기/가져오기 라운드트립 검증', () => {
  const exported = storageRepository.exportWorkspaceBackup();
  assertEqual(exported.schema_version, '2.0', 'Backup schema_version must be 2.0');
  assert(exported.profiles.length >= 1, 'Backup must include at least 1 profile');
  const imported = storageRepository.importWorkspaceBackup(exported);
  assertEqual(imported.ok, true, 'Valid backup payload must import cleanly');
  const invalid = storageRepository.importWorkspaceBackup({ schema_version: '1.0' });
  assertEqual(invalid.ok, false, 'Unsupported backup schema must be rejected');
});

console.log(`\nSummary: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  throw new Error(`${failed} test(s) failed`);
}

