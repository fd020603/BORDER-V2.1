/**
 * Border Checker v2.0 — Core Domain Types & Canonical Fact Dictionary (SSOT)
 *
 * Legal Positioning Guardrail:
 * All types, evaluations, and findings represent automated technical consistency checks
 * ("Policy-Infra Drift" and statutory disclosure checklist verification) between
 * published privacy notices and actual code/infrastructure configurations.
 * They do NOT constitute legal advice or definitive determinations of illegality.
 */

export type IndustryDomain = 'GENERAL' | 'FINTECH' | 'HEALTHCARE' | 'AI_SAAS';

export type TransferPurpose = 'ENTRUSTMENT' | 'THIRD_PARTY_SHARING' | 'ANALYTICS';

export type SdkCategory =
  | 'AI'
  | 'PAYMENT'
  | 'CLOUD'
  | 'CLOUD_DB'
  | 'ANALYTICS'
  | 'MESSAGING'
  | 'AUTH'
  | 'INFRA'
  | 'CDN';

export const RESIDENCY_REGION_OPTIONS = [
  { code: 'KR', label: 'KR (대한민국 · 서울)' },
  { code: 'US', label: 'US (미국)' },
  { code: 'EU', label: 'EU (유럽연합)' },
  { code: 'JP', label: 'JP (일본 · 도쿄)' },
  { code: 'CN', label: 'CN (중국 · 베이징/상하이)' },
  { code: 'SG', label: 'SG (싱가포르)' },
] as const;

export const CANONICAL_FACT_KEYS = [
  'workspace.business_country',
  'workspace.data_subject_countries',
  'workspace.industry_domain',
  'transfers.has_cross_border',
  'transfers.destination_countries',
  'transfers.detected_vendors',
  'transfers.virtual_transfer.foreign_iam_access',
  'transfers.virtual_transfer.foreign_kms_control',
  'security.encryption_in_transit',
  'security.encryption_at_rest',
  'security.pii_masked_before_transfer',
  'legal_doc.exists',
  'legal_doc.claims_domestic_only',
  'legal_doc.has_separate_consent',
  'legal_doc.has_entrustment_disclosure',
  'legal_doc.disclosed_countries',
  'legal_doc.disclosed_vendors',
  'legal_doc.disclosed_items',
  'legal_doc.disclosed_method_and_time',
  'legal_doc.disclosed_retention_period',
  'legal_doc.disclosed_opt_out_method',
  'legal_doc.disclosed_dest_country_law_info',
  'legal_doc.has_scc_or_safeguard_notice',
  'legal_doc.has_ai_training_opt_out_notice',
  'legal_doc.has_ai_service_notice',
  'legal_doc.has_ai_output_label_notice',
  'legal_doc.has_do_not_sell_or_share_notice',
  'derived.active_vendor_names',
  'derived.active_vendor_sdks',
  'derived.active_transfer_purposes',
  'derived.active_non_adequate_eu_countries',
  'derived.has_generative_ai_sdk',
  'derived.has_any_virtual_transfer',
  'derived.has_non_zdr_ai_vendor',
  'derived.us_fisa_exposure',
] as const;

export type CanonicalFactKey = (typeof CANONICAL_FACT_KEYS)[number];

export const VENDOR_MATCH_FIELDS = [
  'name',
  'sdk',
  'country',
  'default_country',
  'data_residency_country',
  'transfer_purpose',
  'includes_pii',
  'pii_items',
  'dpf_certified',
  'baa_supported',
  'zero_data_retention',
  'category',
] as const;

export interface DetectedVendor {
  name: string;
  sdk: string;
  /** Effective residency country (synchronized with `data_residency_country`). */
  country: string;
  /** Vendor headquarters / default SDK country from registry. */
  default_country: string;
  /** User-overridable actual storage/processing region country code. */
  data_residency_country: string;
  transfer_purpose: TransferPurpose;
  includes_pii: boolean;
  /** @deprecated Legacy alias retained optional for backward-compatible snapshot reading */
  sends_pii?: boolean;
  pii_items?: string[];
  dpf_certified: boolean;
  baa_supported: boolean;
  zero_data_retention: boolean;
  category?: SdkCategory;
}

export interface VendorMatchCriteria {
  name?: string;
  sdk?: string;
  country?: string;
  default_country?: string;
  data_residency_country?: string;
  transfer_purpose?: TransferPurpose;
  includes_pii?: boolean;
  pii_items?: string[];
  dpf_certified?: boolean;
  baa_supported?: boolean;
  zero_data_retention?: boolean;
  category?: SdkCategory;
}

export interface VirtualTransferFacts {
  foreign_iam_access: boolean;
  foreign_kms_control: boolean;
}

export interface CanonicalFactModel {
  workspace: {
    business_country: string;
    data_subject_countries: string[];
    industry_domain: IndustryDomain;
  };
  transfers: {
    has_cross_border: boolean;
    destination_countries: string[];
    detected_vendors: DetectedVendor[];
    virtual_transfer: VirtualTransferFacts;
  };
  security: {
    encryption_in_transit: boolean;
    encryption_at_rest: boolean;
    pii_masked_before_transfer: boolean;
  };
  legal_doc: {
    exists: boolean;
    claims_domestic_only: boolean;
    has_separate_consent: boolean;
    has_entrustment_disclosure: boolean;
    disclosed_countries: string[];
    disclosed_vendors: string[];
    disclosed_items: string[];
    disclosed_method_and_time: boolean;
    disclosed_retention_period: boolean;
    disclosed_opt_out_method: boolean;
    disclosed_dest_country_law_info: boolean;
    has_scc_or_safeguard_notice: boolean;
    has_ai_training_opt_out_notice: boolean;
    has_ai_service_notice?: boolean;
    has_ai_output_label_notice?: boolean;
    has_do_not_sell_or_share_notice: boolean;
  };
}

export const DSL_OPERATORS = [
  'equals',
  'not_equals',
  'includes',
  'not_includes',
  'subset_of',
  'not_subset_of',
  'is_empty',
  'any_vendor_matches',
  'all_vendors_match',
] as const;

export type DslOperator = (typeof DSL_OPERATORS)[number];

export interface ConditionRule {
  fact: string;
  operator: DslOperator;
  value?:
    | string
    | number
    | boolean
    | string[]
    | VendorMatchCriteria;
}

export type ConditionLeaf = ConditionRule;

export interface ConditionGroup {
  all?: ConditionDslNode[];
  any?: ConditionDslNode[];
  not?: ConditionDslNode;
}

export type ConditionDslNode = ConditionRule | ConditionGroup;

export type RuleSeverity = 'BLOCKER' | 'WARNING';

export type DriftType =
  | 'DOMESTIC_CLAIM_CONTRADICTION'
  | 'UNDISCLOSED_COUNTRY'
  | 'UNDISCLOSED_VENDOR'
  | 'VIRTUAL_TRANSFER_OMISSION'
  | 'SAFEGUARD_CLAIM_MISMATCH';

export interface DriftCheckSpec {
  enabled?: boolean;
  drift_type?: DriftType;
  fact_path?: string;
  doc_claim_path?: string;
  condition?: ConditionDslNode | Record<string, never>;
  summary?: string;
  alert_message?: string;
}

export interface RuleRemediation {
  legal_template: string;
  infra_patch_hint: string;
}

export interface PolicyRuleV2 {
  rule_id: string;
  category: string;
  severity: RuleSeverity;
  article_citation: string;
  plain_title: string;
  plain_explanation: string;
  condition_dsl: ConditionDslNode;
  drift_check?: DriftCheckSpec;
  remediation: RuleRemediation;
}

export type PolicyLayer = 1 | 2 | 3 | 4;

export interface PolicyPackMeta {
  id: string;
  layer: PolicyLayer;
  country_code: string;
  law_name: string;
  version: string;
  effective_date: string;
  penalty_summary: string;
  adequacy_countries: string[];
}

export interface TriggerIfApplicability {
  trigger_if: string;
}

export interface PolicyPackV2 {
  pack_meta: PolicyPackMeta;
  applicability: ConditionDslNode | TriggerIfApplicability;
  rules: PolicyRuleV2[];
}

export type CountryRiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface CountryRiskProfile {
  country_code: string;
  country_name: string;
  framework_id: string;
  framework_name: string;
  risk_level: CountryRiskLevel;
  adequacy_status: string;
  surveillance_laws: string[];
  summary: string;
  recommended_safeguards: string[];
}

export type EvaluationVerdict = 'APPROVED' | 'DRIFT_DETECTED' | 'CONDITIONAL' | 'DENIED';

export interface TriggeredRuleResult {
  pack_id: string;
  pack_name: string;
  pack_version?: string;
  layer: PolicyLayer;
  country_code: string;
  rule_id: string;
  category: string;
  severity: RuleSeverity;
  article_citation: string;
  plain_title: string;
  plain_explanation: string;
  remediation: RuleRemediation;
  has_drift: boolean;
  drift_summary?: string;
}

export interface DetectedDrift {
  rule_id: string;
  pack_id: string;
  layer: PolicyLayer;
  drift_type: DriftType;
  severity: RuleSeverity;
  title: string;
  summary: string;
  fact_path: string;
  fact_value: unknown;
  doc_claim_path: string;
  doc_claim_value: unknown;
}

export interface AppliedCountryRisk {
  country_code: string;
  profile: CountryRiskProfile;
  triggered_by_vendors: string[];
  triggered_by_virtual_transfer: boolean;
}

export interface AppliedPackSnapshot {
  pack_id: string;
  layer: PolicyLayer;
  law_name: string;
  version: string;
  applicable: boolean;
  triggered_rule_count: number;
}

export interface EvaluationResult {
  verdict: EvaluationVerdict;
  compliance_score: number;
  summary_headline: string;
  summary_detail: string;
  evaluated_at: string;
  triggered_rules: TriggeredRuleResult[];
  detected_drifts: DetectedDrift[];
  applied_country_risks: AppliedCountryRisk[];
  applied_pack_versions: AppliedPackSnapshot[];
  stats: {
    blocker_count: number;
    warning_count: number;
    drift_count: number;
    total_evaluated_rules: number;
    passed_rule_count: number;
    pass_rate_percent: number;
    active_vendor_count: number;
    excluded_non_pii_vendor_count: number;
    active_destination_countries: string[];
  };
}

export interface WorkspaceProfile {
  id: string;
  profile_name: string;
  description: string;
  business_country: string;
  data_subject_countries: string[];
  industry_domain: IndustryDomain;
  updated_at: string;
}

export interface AuditHistoryRecord {
  id: string;
  profile_id: string;
  profile_name: string;
  scenario_label: string;
  verdict: EvaluationVerdict;
  compliance_score: number;
  drift_count: number;
  blocker_count: number;
  warning_count: number;
  applied_pack_versions: AppliedPackSnapshot[];
  evaluated_at: string;
  facts_snapshot: CanonicalFactModel;
  result_snapshot: EvaluationResult;
  input_snapshot?: {
    policyText: string;
    noPolicyDoc: boolean;
    infraCode: string;
    selectedRegions: string[];
  };
}

export type LlmProvider = 'GEMINI_CLOUD' | 'LOCAL_OPENAI_COMPAT';

export interface LlmConfig {
  provider: LlmProvider;
  localEndpoint?: string;
  modelName: string;
}
