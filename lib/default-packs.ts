import krPipaPack from './packs/kr_pipa.json';
import euGdprPack from './packs/eu_gdpr.json';
import jpAppiPack from './packs/jp_appi.json';
import cnPiplPack from './packs/cn_pipl.json';
import usCloudActPack from './packs/us_cloud_act.json';
import usCcpaCpraPack from './packs/us_ccpa_cpra.json';
import krAiActPack from './packs/kr_ai_act.json';
import euAiActPack from './packs/eu_ai_act.json';
import type { PolicyPackV2 } from './types';

/**
 * Official 8-Pack Built-in Policy Catalog (JSON-backed, Layers 1–4):
 * - Layer 1: KR_PIPA_v2 (대한민국 개인정보 보호법)
 * - Layer 1: EU_GDPR_v2 (유럽연합 일반 개인정보보호법)
 * - Layer 1: JP_APPI_v2 (일본 개인정보보호법)
 * - Layer 1: CN_PIPL_v2 (중국 개인정보보호법)
 * - Layer 2: US_CLOUD_ACT_v2 (미국 CLOUD Act)
 * - Layer 3: US_CCPA_CPRA_v2 (미국 캘리포니아 CCPA/CPRA)
 * - Layer 4: KR_AI_BASIC_ACT_v2 (대한민국 인공지능 기본법)
 * - Layer 4: EU_AI_ACT_v2 (유럽연합 인공지능법)
 *
 * Legal Guardrail:
 * All descriptions evaluate technical Policy-Infra Drift and statutory disclosure
 * checklist completeness rather than rendering formal legal advice.
 */
export const DEFAULT_POLICY_PACKS: PolicyPackV2[] = [
  krPipaPack as PolicyPackV2,
  euGdprPack as PolicyPackV2,
  jpAppiPack as PolicyPackV2,
  cnPiplPack as PolicyPackV2,
  usCloudActPack as PolicyPackV2,
  usCcpaCpraPack as PolicyPackV2,
  krAiActPack as PolicyPackV2,
  euAiActPack as PolicyPackV2,
];

export const LEGACY_TEMP_PACK_IDS = [
  'KR_PIPA_V2',
  'EU_GDPR_V2',
  'JP_APPI_V2',
  'US_FISA_702_V2',
  'US_CCPA_CPRA_V2',
  'EU_AI_ACT_V2',
] as const;
