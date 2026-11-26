import { computeEffectiveHasCrossBorder } from './rule-evaluator';
import { SDK_REGISTRY } from './sdk-registry';
import type {
  CanonicalFactModel,
  DetectedVendor,
  IndustryDomain,
  LegalDocManualOverrides,
  LlmConfig,
  ManualLegalDocToggleKey,
  VirtualTransferFacts,
} from './types';

export type ParserEngineUsed =
  | 'GEMINI_CLOUD'
  | 'LOCAL_OPENAI_COMPAT'
  | 'HEURISTIC_FALLBACK';

export class LlmRequestCancelledError extends Error {
  constructor(message = '사용자에 의해 LLM 요청이 중지되었습니다.') {
    super(message);
    this.name = 'LlmRequestCancelledError';
  }
}

export interface ParseInputsOptions {
  businessCountry?: string;
  dataSubjectCountries?: string[];
  industryDomain?: IndustryDomain;
  noPolicyDoc?: boolean;
  infraCountries?: string[];
  virtualTransferOverride?: Partial<VirtualTransferFacts>;
  securityOverride?: Partial<CanonicalFactModel['security']>;
  hasSeparateConsentUi?: boolean;
  manualLegalDocOverrides?: LegalDocManualOverrides;
  signal?: AbortSignal;
}

export interface ParsedFactsOutput {
  parsedFacts: CanonicalFactModel;
  engineUsed: ParserEngineUsed;
  attempts: number;
  warnings: string[];
  latencyMs: number;
}

interface ExtractedLlmPayload {
  legal_doc?: Partial<CanonicalFactModel['legal_doc']>;
  security?: Partial<CanonicalFactModel['security']>;
  virtual_transfer?: Partial<VirtualTransferFacts>;
  infra_countries?: string[];
}

const COUNTRY_KEYWORDS: Array<{ code: string; patterns: RegExp[] }> = [
  { code: 'KR', patterns: [/\bKR\b/i, /대한민국/, /한국/, /서울/, /Seoul/i, /Korea/i] },
  { code: 'US', patterns: [/\bUS\b/i, /\bUSA\b/i, /미국/, /United States/i, /캘리포니아/i] },
  { code: 'JP', patterns: [/\bJP\b/i, /일본/, /도쿄/, /Tokyo/i, /Japan/i] },
  { code: 'EU', patterns: [/\bEU\b/i, /\bEEA\b/i, /유럽/, /독일/, /아일랜드/, /Frankfurt/i, /Dublin/i] },
  { code: 'SG', patterns: [/\bSG\b/i, /싱가포르/, /Singapore/i] },
  { code: 'GB', patterns: [/\bGB\b/i, /\bUK\b/i, /영국/, /London/i, /United Kingdom/i] },
  { code: 'CN', patterns: [/\bCN\b/i, /중국/, /홍콩/, /China/i] },
  { code: 'IN', patterns: [/\bIN\b/i, /인도/, /Mumbai/i, /India/i] },
];

const REGION_TO_COUNTRY: Array<{ pattern: RegExp; code: string }> = [
  { pattern: /\bus-(east|west)-\d\b|\biad1\b|\bsfo1\b|\bpdx1\b/i, code: 'US' },
  { pattern: /\bap-northeast-1\b|\bap-northeast-3\b|\bhnd1\b|\bkix1\b/i, code: 'JP' },
  { pattern: /\bap-northeast-2\b|\bicn1\b/i, code: 'KR' },
  { pattern: /\beu-(central|west|north|south)-\d\b|\bfra1\b|\bdub1\b/i, code: 'EU' },
  { pattern: /\bap-southeast-1\b|\bsin1\b/i, code: 'SG' },
  { pattern: /\bap-south-1\b|\bbom1\b/i, code: 'IN' },
  { pattern: /\bcn-(north|northwest)-\d\b/i, code: 'CN' },
  { pattern: /\beu-west-2\b|\blhr1\b/i, code: 'GB' },
];

const ITEM_KEYWORDS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'email', pattern: /이메일|전자우편|e-?mail/i },
  { label: 'prompt_text', pattern: /프롬프트|입력\s*데이터|질의|대화\s*내용|prompt/i },
  { label: 'name', pattern: /성명|이름|full\s*name/i },
  { label: 'phone', pattern: /연락처|전화번호|휴대전화|phone/i },
  { label: 'payment_info', pattern: /결제|카드|청구|billing|payment/i },
  { label: 'user_id', pattern: /회원\s*아이디|식별자|user_?id|account_?id/i },
  { label: 'device_and_log', pattern: /기기\s*정보|IP|쿠키|행동\s*로그|device|cookie|analytics/i },
  { label: 'health_data', pattern: /진료|환자|건강|의료|patient|clinical|health/i },
];

function stripMarkdownAndThink(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<\|channel>thought[\s\S]*?<channel\|>/gi, '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
}

function extractBalancedJson(text: string, startSearchFrom = 0): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;

  for (let i = startSearchFrom; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start !== -1) {
          return text.slice(start, i + 1);
        }
      }
    }
  }
  return null;
}

const LEGAL_DOC_BOOLEAN_FIELDS = [
  'exists',
  'claims_domestic_only',
  'has_separate_consent',
  'has_entrustment_disclosure',
  'disclosed_method_and_time',
  'disclosed_retention_period',
  'disclosed_opt_out_method',
  'disclosed_dest_country_law_info',
  'has_scc_or_safeguard_notice',
  'has_ai_training_opt_out_notice',
  'has_ai_service_notice',
  'has_ai_output_label_notice',
  'has_do_not_sell_or_share_notice',
] as const;

const LEGAL_DOC_STRING_ARRAY_FIELDS = [
  'disclosed_countries',
  'disclosed_vendors',
  'disclosed_items',
] as const;

const SECURITY_BOOLEAN_FIELDS = [
  'encryption_in_transit',
  'encryption_at_rest',
  'pii_masked_before_transfer',
] as const;

const VIRTUAL_TRANSFER_BOOLEAN_FIELDS = [
  'foreign_iam_access',
  'foreign_kms_control',
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function validateExtractedPayload(data: unknown): ExtractedLlmPayload {
  if (!isPlainObject(data)) {
    throw new Error('LLM response root must be a plain JSON object.');
  }

  const result: ExtractedLlmPayload = {};
  let validSectionCount = 0;

  if (data.legal_doc !== undefined) {
    if (!isPlainObject(data.legal_doc)) {
      throw new Error('Invalid "legal_doc": expected an object.');
    }
    const legalDoc: Partial<CanonicalFactModel['legal_doc']> = {};
    let recognizedFields = 0;

    for (const key of LEGAL_DOC_BOOLEAN_FIELDS) {
      const val = data.legal_doc[key];
      if (val !== undefined) {
        if (typeof val !== 'boolean') {
          throw new Error(`Invalid "legal_doc.${key}": expected boolean.`);
        }
        legalDoc[key] = val;
        recognizedFields += 1;
      }
    }

    for (const key of LEGAL_DOC_STRING_ARRAY_FIELDS) {
      const val = data.legal_doc[key];
      if (val !== undefined) {
        if (!isStringArray(val)) {
          throw new Error(`Invalid "legal_doc.${key}": expected string[].`);
        }
        legalDoc[key] = val;
        recognizedFields += 1;
      }
    }

    if (recognizedFields === 0) {
      throw new Error('Invalid "legal_doc": contains no valid schema fields.');
    }
    result.legal_doc = legalDoc;
    validSectionCount += 1;
  }

  if (data.security !== undefined) {
    if (!isPlainObject(data.security)) {
      throw new Error('Invalid "security": expected an object.');
    }
    const security: Partial<CanonicalFactModel['security']> = {};
    let recognizedFields = 0;

    for (const key of SECURITY_BOOLEAN_FIELDS) {
      const val = data.security[key];
      if (val !== undefined) {
        if (typeof val !== 'boolean') {
          throw new Error(`Invalid "security.${key}": expected boolean.`);
        }
        security[key] = val;
        recognizedFields += 1;
      }
    }

    if (recognizedFields === 0) {
      throw new Error('Invalid "security": contains no valid schema fields.');
    }
    result.security = security;
    validSectionCount += 1;
  }

  if (data.virtual_transfer !== undefined) {
    if (!isPlainObject(data.virtual_transfer)) {
      throw new Error('Invalid "virtual_transfer": expected an object.');
    }
    const virtualTransfer: Partial<VirtualTransferFacts> = {};
    let recognizedFields = 0;

    for (const key of VIRTUAL_TRANSFER_BOOLEAN_FIELDS) {
      const val = data.virtual_transfer[key];
      if (val !== undefined) {
        if (typeof val !== 'boolean') {
          throw new Error(`Invalid "virtual_transfer.${key}": expected boolean.`);
        }
        virtualTransfer[key] = val;
        recognizedFields += 1;
      }
    }

    if (recognizedFields === 0) {
      throw new Error('Invalid "virtual_transfer": contains no valid schema fields.');
    }
    result.virtual_transfer = virtualTransfer;
    validSectionCount += 1;
  }

  if (data.infra_countries !== undefined) {
    if (!isStringArray(data.infra_countries)) {
      throw new Error('Invalid "infra_countries": expected string[].');
    }
    result.infra_countries = data.infra_countries;
    validSectionCount += 1;
  }

  if (validSectionCount === 0) {
    throw new Error(
      'Response JSON is missing required compliance sections (legal_doc, security, virtual_transfer, infra_countries).',
    );
  }

  return result;
}

export function parseJsonWithRepair(raw: string): ExtractedLlmPayload {
  const cleaned = stripMarkdownAndThink(raw);
  let lastValidationError: Error | null = null;

  try {
    return validateExtractedPayload(JSON.parse(cleaned));
  } catch (err) {
    if (err instanceof Error && !err.message.includes('JSON')) {
      lastValidationError = err;
    }

    const legalDocIdx = cleaned.search(/"legal_doc"\s*:/);
    if (legalDocIdx !== -1) {
      const braceBefore = cleaned.lastIndexOf('{', legalDocIdx);
      if (braceBefore !== -1) {
        const balanced = extractBalancedJson(cleaned, braceBefore);
        if (balanced) {
          try {
            return validateExtractedPayload(JSON.parse(balanced));
          } catch (innerErr) {
            if (innerErr instanceof Error) {
              lastValidationError = innerErr;
            }
          }
        }
      }
    }

    let searchIdx = cleaned.indexOf('{');
    while (searchIdx !== -1) {
      const candidate = extractBalancedJson(cleaned, searchIdx);
      if (!candidate) break;
      try {
        return validateExtractedPayload(JSON.parse(candidate));
      } catch (innerErr) {
        if (innerErr instanceof Error) {
          lastValidationError = innerErr;
        }
        searchIdx = cleaned.indexOf('{', searchIdx + candidate.length);
      }
    }

    throw (
      lastValidationError ??
      new Error('Response does not contain a valid schema-compliant JSON object.')
    );
  }
}

export function extractHeuristicPayload(
  policyText: string,
  infraCode: string,
  detectedVendors: DetectedVendor[],
  noPolicyDoc = false,
): ExtractedLlmPayload {
  const text = policyText.trim();
  const exists = !noPolicyDoc && text.length > 0;

  const claimsDomesticOnly =
    exists &&
    /(국내\s*(서버|리전)?에만?\s*단독\s*(보관|저장|처리)|국외로?\s*(이전|반출|제공)하지\s*않|국외\s*이전\s*없음|stored\s+exclusively\s+in\s+(korea|domestic)|no\s+cross-?border\s+transfer)/i.test(
      text,
    );

  const hasSeparateConsent =
    exists &&
    /(국외\s*이전\s*별도\s*동의|제3자\s*국외\s*제공\s*동의|별도\s*동의를\s*(받|획득|요청)|separate\s+consent\s+for\s+cross-?border)/i.test(
      text,
    );

  const hasEntrustmentDisclosure =
    exists &&
    /(제28조의8\s*제1항\s*제3호|국외\s*(처리)?위탁|국외\s*보관|처리위탁\s*및\s*보관|cross-?border\s+entrustment|sub-?processor)/i.test(
      text,
    );

  const disclosedCountries: string[] = [];
  if (exists && !claimsDomesticOnly) {
    for (const item of COUNTRY_KEYWORDS) {
      if (item.patterns.some((p) => p.test(text))) {
        disclosedCountries.push(item.code);
      }
    }
  }

  const disclosedVendors: string[] = [];
  if (exists) {
    const candidateEntries = new Map<string, string>();
    for (const entry of Object.values(SDK_REGISTRY)) {
      candidateEntries.set(entry.vendor_name, entry.sdk);
    }
    for (const v of detectedVendors) {
      candidateEntries.set(v.name, v.sdk);
    }
    for (const [vendorName, sdk] of candidateEntries.entries()) {
      const shortBrand = vendorName.split(/[,\s(]/)[0];
      const escapedBrand = shortBrand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedSdk = sdk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const brandRegex = new RegExp(`\\b${escapedBrand}\\b|${escapedSdk}`, 'i');
      if (brandRegex.test(text)) {
        disclosedVendors.push(vendorName);
      }
    }
  }

  const disclosedItems: string[] = [];
  if (exists) {
    for (const kw of ITEM_KEYWORDS) {
      if (kw.pattern.test(text)) {
        disclosedItems.push(kw.label);
      }
    }
  }

  const disclosedMethodAndTime =
    exists &&
    /(실시간|네트워크|API|암호화\s*전송|이용\s*시|전송\s*일시|전송\s*방법|real-?time|network\s+transmission|encrypted\s+transfer)/i.test(
      text,
    );

  const disclosedRetentionPeriod =
    exists &&
    /(보유\s*기간|보유·?이용|탈퇴\s*시|계약\s*종료|파기|retention\s*period|until\s+termination)/i.test(
      text,
    );

  const disclosedOptOutMethod =
    exists &&
    /(거부\s*방법|거부할\s*수\s*있|제한될\s*수\s*있|동의\s*철회|개인정보\s*보호책임자|opt-?out|withdraw\s+consent)/i.test(
      text,
    );

  const disclosedDestCountryLawInfo =
    exists &&
    /(수신국|보호\s*제도|FISA|CLOUD\s*Act|정부\s*기관\s*접근|destination\s+country\s+law)/i.test(
      text,
    );

  const hasSccOrSafeguardNotice =
    exists &&
    /(SCC|표준계약조항|DPF|Data\s*Privacy\s*Framework|적절한\s*안전장치|safeguard)/i.test(
      text,
    );

  const hasAiTrainingOptOutNotice =
    exists &&
    /(학습\s*제외|학습에\s*활용하지|학습에\s*사용하지|Zero\s*Data\s*Retention|\bZDR\b|opt-?out\s+of\s+(ai|model)\s+training|not\s+used\s+for\s+training)/i.test(
      text,
    );

  const hasAiServiceNotice =
    exists &&
    /(생성형\s*인공지능|생성형\s*AI|인공지능\s*(기반|시스템)\s*(운용|제공|활용)|AI\s*(기반|시스템|기능)\s*(운용|제공|사전\s*고지)|powered\s+by\s+(generative\s+)?AI|generative\s+AI\s+(notice|disclosure))/i.test(
      text,
    );

  const hasAiOutputLabelNotice =
    exists &&
    /(AI\s*(생성|기반)\s*(결과물|콘텐츠)\s*(표시|배지|라벨)|워터마크|C2PA|watermark|AI-?generated\s+(content|output)\s+(label|notice|disclosure))/i.test(
      text,
    );

  const hasDoNotSellOrShareNotice =
    exists &&
    /(Do\s+Not\s+Sell\s+or\s+Share|판매\s*(또는|및)?\s*공유\s*거부|\bGPC\b|Global\s+Privacy\s+Control)/i.test(
      text,
    );

  const piiMaskedBeforeTransfer =
    /(마스킹|가명\s*처리|비식별|토큰화|익명\s*처리|redacted|masked|pseudonymized)/i.test(
      `${text}\n${infraCode}`,
    );

  const infra = infraCode.trim();
  const infraCountries: string[] = [];
  for (const rule of REGION_TO_COUNTRY) {
    if (rule.pattern.test(infra)) {
      infraCountries.push(rule.code);
    }
  }

  const encryptionInTransitDisabled =
    /(encryption_in_transit\s*[:=]\s*false|aws:SecureTransport["']?\s*[:=]\s*["']?false|http:\/\/(?!localhost))/i.test(
      infra,
    );
  const encryptionAtRestDisabled =
    /(encryption_at_rest\s*[:=]\s*false|storage_encrypted\s*[:=]\s*false|sse_enabled\s*[:=]\s*false)/i.test(
      infra,
    );

  const foreignIamAccess =
    /(foreign_iam_access\s*[:=]\s*true|us-hq|global-ops|arn:aws:iam::[0-9]{12}:(root|role\/(us|global|foreign|hq))|"Principal"\s*:\s*\{[^}]*arn:aws:iam)/i.test(
      infra,
    );

  const foreignKmsControl =
    /(foreign_kms_control\s*[:=]\s*true|arn:aws:kms:us-[a-z]+-\d:|kms_key_id\s*=\s*["']arn:aws:kms:(us|eu|ap-southeast)-)/i.test(
      infra,
    );

  return {
    legal_doc: {
      exists,
      claims_domestic_only: claimsDomesticOnly,
      has_separate_consent: hasSeparateConsent,
      has_entrustment_disclosure: hasEntrustmentDisclosure,
      disclosed_countries: Array.from(new Set(disclosedCountries)),
      disclosed_vendors: Array.from(new Set(disclosedVendors)),
      disclosed_items: Array.from(new Set(disclosedItems)),
      disclosed_method_and_time: disclosedMethodAndTime,
      disclosed_retention_period: disclosedRetentionPeriod,
      disclosed_opt_out_method: disclosedOptOutMethod,
      disclosed_dest_country_law_info: disclosedDestCountryLawInfo,
      has_scc_or_safeguard_notice: hasSccOrSafeguardNotice,
      has_ai_training_opt_out_notice: hasAiTrainingOptOutNotice,
      has_ai_service_notice: hasAiServiceNotice,
      has_ai_output_label_notice: hasAiOutputLabelNotice,
      has_do_not_sell_or_share_notice: hasDoNotSellOrShareNotice,
    },
    security: {
      encryption_in_transit: !encryptionInTransitDisabled,
      encryption_at_rest: !encryptionAtRestDisabled,
      pii_masked_before_transfer: piiMaskedBeforeTransfer,
    },
    virtual_transfer: {
      foreign_iam_access: foreignIamAccess,
      foreign_kms_control: foreignKmsControl,
    },
    infra_countries: Array.from(new Set(infraCountries)),
  };
}

export interface LegalDocOverrideOptions {
  noPolicyDoc?: boolean;
  hasSeparateConsentUi?: boolean;
  manualLegalDocOverrides?: LegalDocManualOverrides;
}

const MANUAL_LEGAL_DOC_KEYS: ManualLegalDocToggleKey[] = [
  'has_entrustment_disclosure',
  'has_scc_or_safeguard_notice',
  'has_separate_consent',
  'disclosed_retention_period',
  'disclosed_method_and_time',
  'disclosed_opt_out_method',
  'disclosed_dest_country_law_info',
  'has_ai_training_opt_out_notice',
  'has_do_not_sell_or_share_notice',
];

/**
 * Merges CanonicalFactModel['legal_doc'] with strict 3-tier priority:
 * 1. Highest: Step 4 manual toggle overrides (ignored when noPolicyDoc is true)
 * 2. Second: Step 3 Q4 separate consent checkbox UI (forces has_separate_consent = true when true)
 * 3. Third: Auto-parsed legal_doc fields from privacy policy text
 */
export function applyLegalDocOverrides(
  base: CanonicalFactModel['legal_doc'],
  options: LegalDocOverrideOptions = {},
): CanonicalFactModel['legal_doc'] {
  const merged: CanonicalFactModel['legal_doc'] = {
    ...base,
    disclosed_countries: [...(base.disclosed_countries ?? [])],
    disclosed_vendors: [...(base.disclosed_vendors ?? [])],
    disclosed_items: [...(base.disclosed_items ?? [])],
  };

  if (options.noPolicyDoc) {
    merged.exists = false;
    merged.claims_domestic_only = false;
    merged.has_separate_consent = false;
    merged.has_entrustment_disclosure = false;
    merged.disclosed_countries = [];
    merged.disclosed_vendors = [];
    merged.disclosed_items = [];
    merged.disclosed_method_and_time = false;
    merged.disclosed_retention_period = false;
    merged.disclosed_opt_out_method = false;
    merged.disclosed_dest_country_law_info = false;
    merged.has_scc_or_safeguard_notice = false;
    merged.has_ai_training_opt_out_notice = false;
    merged.has_ai_service_notice = false;
    merged.has_ai_output_label_notice = false;
    merged.has_do_not_sell_or_share_notice = false;
  }

  // Priority 2: Step 3 Q4 separate consent UI checkbox
  if (options.hasSeparateConsentUi === true) {
    merged.has_separate_consent = true;
  }

  // Priority 1: Step 4 manual Human-in-the-loop toggle overrides (only when policy doc exists/enabled)
  if (!options.noPolicyDoc && options.manualLegalDocOverrides) {
    for (const key of MANUAL_LEGAL_DOC_KEYS) {
      const overrideValue = options.manualLegalDocOverrides[key];
      if (typeof overrideValue === 'boolean') {
        merged[key] = overrideValue;
      }
    }
  }

  return merged;
}

function mergeParsedFacts(
  heuristic: ExtractedLlmPayload,
  llmPayload: ExtractedLlmPayload | null,
  detectedVendors: DetectedVendor[],
  options: ParseInputsOptions,
): CanonicalFactModel {
  const businessCountry = (options.businessCountry ?? 'KR').toUpperCase();
  const dataSubjectCountries = (
    options.dataSubjectCountries && options.dataSubjectCountries.length > 0
      ? options.dataSubjectCountries
      : [businessCountry]
  ).map((c) => c.toUpperCase());
  const industryDomain = options.industryDomain ?? 'GENERAL';

  const legalDoc = {
    exists: llmPayload?.legal_doc?.exists ?? heuristic.legal_doc?.exists ?? false,
    claims_domestic_only:
      llmPayload?.legal_doc?.claims_domestic_only ??
      heuristic.legal_doc?.claims_domestic_only ??
      false,
    has_separate_consent:
      llmPayload?.legal_doc?.has_separate_consent ??
      heuristic.legal_doc?.has_separate_consent ??
      false,
    has_entrustment_disclosure:
      llmPayload?.legal_doc?.has_entrustment_disclosure ??
      heuristic.legal_doc?.has_entrustment_disclosure ??
      false,
    disclosed_countries: Array.from(
      new Set([
        ...(llmPayload?.legal_doc?.disclosed_countries ??
          heuristic.legal_doc?.disclosed_countries ??
          []),
      ]),
    ).map((c) => c.toUpperCase()),
    disclosed_vendors: Array.from(
      new Set([
        ...(llmPayload?.legal_doc?.disclosed_vendors ??
          heuristic.legal_doc?.disclosed_vendors ??
          []),
      ]),
    ),
    disclosed_items: Array.from(
      new Set([
        ...(llmPayload?.legal_doc?.disclosed_items ??
          heuristic.legal_doc?.disclosed_items ??
          []),
      ]),
    ),
    disclosed_method_and_time:
      llmPayload?.legal_doc?.disclosed_method_and_time ??
      heuristic.legal_doc?.disclosed_method_and_time ??
      false,
    disclosed_retention_period:
      llmPayload?.legal_doc?.disclosed_retention_period ??
      heuristic.legal_doc?.disclosed_retention_period ??
      false,
    disclosed_opt_out_method:
      llmPayload?.legal_doc?.disclosed_opt_out_method ??
      heuristic.legal_doc?.disclosed_opt_out_method ??
      false,
    disclosed_dest_country_law_info:
      llmPayload?.legal_doc?.disclosed_dest_country_law_info ??
      heuristic.legal_doc?.disclosed_dest_country_law_info ??
      false,
    has_scc_or_safeguard_notice:
      llmPayload?.legal_doc?.has_scc_or_safeguard_notice ??
      heuristic.legal_doc?.has_scc_or_safeguard_notice ??
      false,
    has_ai_training_opt_out_notice:
      llmPayload?.legal_doc?.has_ai_training_opt_out_notice ??
      heuristic.legal_doc?.has_ai_training_opt_out_notice ??
      false,
    has_ai_service_notice:
      llmPayload?.legal_doc?.has_ai_service_notice ??
      heuristic.legal_doc?.has_ai_service_notice ??
      false,
    has_ai_output_label_notice:
      llmPayload?.legal_doc?.has_ai_output_label_notice ??
      heuristic.legal_doc?.has_ai_output_label_notice ??
      false,
    has_do_not_sell_or_share_notice:
      llmPayload?.legal_doc?.has_do_not_sell_or_share_notice ??
      heuristic.legal_doc?.has_do_not_sell_or_share_notice ??
      false,
  };

  if (options.noPolicyDoc) {
    legalDoc.exists = false;
    legalDoc.claims_domestic_only = false;
    legalDoc.has_separate_consent = false;
    legalDoc.has_entrustment_disclosure = false;
    legalDoc.disclosed_countries = [];
    legalDoc.disclosed_vendors = [];
    legalDoc.disclosed_items = [];
    legalDoc.disclosed_method_and_time = false;
    legalDoc.disclosed_retention_period = false;
    legalDoc.disclosed_opt_out_method = false;
    legalDoc.disclosed_dest_country_law_info = false;
    legalDoc.has_scc_or_safeguard_notice = false;
    legalDoc.has_ai_training_opt_out_notice = false;
    legalDoc.has_ai_service_notice = false;
    legalDoc.has_ai_output_label_notice = false;
    legalDoc.has_do_not_sell_or_share_notice = false;
  }

  const finalLegalDoc = applyLegalDocOverrides(legalDoc, {
    noPolicyDoc: options.noPolicyDoc,
    hasSeparateConsentUi: options.hasSeparateConsentUi,
    manualLegalDocOverrides: options.manualLegalDocOverrides,
  });

  const security = {
    encryption_in_transit:
      options.securityOverride?.encryption_in_transit ??
      llmPayload?.security?.encryption_in_transit ??
      heuristic.security?.encryption_in_transit ??
      true,
    encryption_at_rest:
      options.securityOverride?.encryption_at_rest ??
      llmPayload?.security?.encryption_at_rest ??
      heuristic.security?.encryption_at_rest ??
      true,
    pii_masked_before_transfer:
      options.securityOverride?.pii_masked_before_transfer ??
      llmPayload?.security?.pii_masked_before_transfer ??
      heuristic.security?.pii_masked_before_transfer ??
      false,
  };

  const virtualTransfer: VirtualTransferFacts = {
    foreign_iam_access:
      options.virtualTransferOverride?.foreign_iam_access ??
      llmPayload?.virtual_transfer?.foreign_iam_access ??
      heuristic.virtual_transfer?.foreign_iam_access ??
      false,
    foreign_kms_control:
      options.virtualTransferOverride?.foreign_kms_control ??
      llmPayload?.virtual_transfer?.foreign_kms_control ??
      heuristic.virtual_transfer?.foreign_kms_control ??
      false,
  };

  const normalizedVendors: DetectedVendor[] = detectedVendors.map((v) => {
    const defaultCountry = (v.default_country || v.country || 'US').toUpperCase();
    const residencyCountry = (
      v.data_residency_country ||
      v.country ||
      defaultCountry
    ).toUpperCase();
    const includesPii =
      v.includes_pii !== undefined
        ? v.includes_pii
        : v.sends_pii !== undefined
          ? v.sends_pii
          : true;
    return {
      ...v,
      default_country: defaultCountry,
      data_residency_country: residencyCountry,
      country: residencyCountry,
      includes_pii: includesPii,
    };
  });

  const activeVendors = normalizedVendors.filter((v) => v.includes_pii !== false);
  const infraCountries = Array.from(
    new Set(
      [
        ...(options.infraCountries ?? []),
        ...(llmPayload?.infra_countries ?? heuristic.infra_countries ?? []),
      ]
        .map((c) => c.toUpperCase())
        .filter((c) => c.length > 0 && c !== businessCountry),
    ),
  );

  const destinationSet = new Set<string>(
    [
      ...infraCountries,
      ...activeVendors.map((v) => v.data_residency_country),
    ]
      .map((c) => c.toUpperCase())
      .filter((c) => c.length > 0 && c !== businessCountry),
  );

  const destinationCountries = Array.from(destinationSet);
  const hasCrossBorder = computeEffectiveHasCrossBorder(
    destinationCountries,
    activeVendors,
    businessCountry,
    virtualTransfer,
  );

  return {
    workspace: {
      business_country: businessCountry,
      data_subject_countries: dataSubjectCountries,
      industry_domain: industryDomain,
    },
    transfers: {
      has_cross_border: hasCrossBorder,
      destination_countries: destinationCountries,
      infra_countries: infraCountries,
      detected_vendors: normalizedVendors,
      virtual_transfer: virtualTransfer,
    },
    security,
    legal_doc: finalLegalDoc,
  };
}

export function normalizeLocalEndpoints(rawUrl: string): {
  chatUrl: string;
  modelsUrl: string;
  isLoopback: boolean;
} {
  const cleaned = rawUrl.trim().replace(/\/+$/, '');
  const base = cleaned || 'http://127.0.0.1:1234';
  let chatUrl: string;
  let modelsUrl: string;

  if (/\/chat\/completions$/i.test(base)) {
    chatUrl = base;
    modelsUrl = base.replace(/\/chat\/completions$/i, '/models');
  } else if (/\/v1$/i.test(base)) {
    chatUrl = `${base}/chat/completions`;
    modelsUrl = `${base}/models`;
  } else {
    chatUrl = `${base}/v1/chat/completions`;
    modelsUrl = `${base}/v1/models`;
  }

  let isLoopback = false;
  try {
    const parsedChat = new URL(chatUrl);
    if (parsedChat.hostname === '0.0.0.0') {
      parsedChat.hostname = '127.0.0.1';
      chatUrl = parsedChat.toString();
      const parsedModels = new URL(modelsUrl);
      parsedModels.hostname = '127.0.0.1';
      modelsUrl = parsedModels.toString();
    }
    const hostname = parsedChat.hostname.toLowerCase();
    isLoopback =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]';
  } catch {
    isLoopback = false;
  }

  return { chatUrl, modelsUrl, isLoopback };
}

const LOCAL_FACT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['legal_doc', 'security', 'virtual_transfer', 'infra_countries'],
  properties: {
    legal_doc: {
      type: 'object',
      additionalProperties: false,
      required: [
        'exists',
        'claims_domestic_only',
        'has_separate_consent',
        'has_entrustment_disclosure',
        'disclosed_countries',
        'disclosed_vendors',
        'disclosed_items',
        'disclosed_method_and_time',
        'disclosed_retention_period',
        'disclosed_opt_out_method',
        'disclosed_dest_country_law_info',
        'has_scc_or_safeguard_notice',
        'has_ai_training_opt_out_notice',
        'has_do_not_sell_or_share_notice',
      ],
      properties: {
        exists: { type: 'boolean' },
        claims_domestic_only: { type: 'boolean' },
        has_separate_consent: { type: 'boolean' },
        has_entrustment_disclosure: { type: 'boolean' },
        disclosed_countries: { type: 'array', items: { type: 'string' } },
        disclosed_vendors: { type: 'array', items: { type: 'string' } },
        disclosed_items: { type: 'array', items: { type: 'string' } },
        disclosed_method_and_time: { type: 'boolean' },
        disclosed_retention_period: { type: 'boolean' },
        disclosed_opt_out_method: { type: 'boolean' },
        disclosed_dest_country_law_info: { type: 'boolean' },
        has_scc_or_safeguard_notice: { type: 'boolean' },
        has_ai_training_opt_out_notice: { type: 'boolean' },
        has_ai_service_notice: { type: 'boolean' },
        has_ai_output_label_notice: { type: 'boolean' },
        has_do_not_sell_or_share_notice: { type: 'boolean' },
      },
    },
    security: {
      type: 'object',
      additionalProperties: false,
      required: [
        'encryption_in_transit',
        'encryption_at_rest',
        'pii_masked_before_transfer',
      ],
      properties: {
        encryption_in_transit: { type: 'boolean' },
        encryption_at_rest: { type: 'boolean' },
        pii_masked_before_transfer: { type: 'boolean' },
      },
    },
    virtual_transfer: {
      type: 'object',
      additionalProperties: false,
      required: ['foreign_iam_access', 'foreign_kms_control'],
      properties: {
        foreign_iam_access: { type: 'boolean' },
        foreign_kms_control: { type: 'boolean' },
      },
    },
    infra_countries: {
      type: 'array',
      items: { type: 'string' },
    },
  },
};

async function callLocalOpenAiWithRetry(
  policyText: string,
  infraCode: string,
  detectedVendors: DetectedVendor[],
  llmConfig: LlmConfig,
  signal?: AbortSignal,
): Promise<{ payload: ExtractedLlmPayload; attempts: number }> {
  const { chatUrl: endpoint } = normalizeLocalEndpoints(
    llmConfig.localEndpoint || 'http://127.0.0.1:1234/v1/chat/completions',
  );
  const modelName = llmConfig.modelName?.trim() || 'google/gemma-4-12b-qat';

  const baseInstruction = `Extract structured privacy compliance facts from the privacy policy text and infrastructure code below.
Do NOT output reasoning, thinking steps, commentary, or markdown fences. Return ONLY a compact valid JSON object with keys:
{
  "legal_doc": { "exists": boolean, "claims_domestic_only": boolean, "has_separate_consent": boolean, "has_entrustment_disclosure": boolean, "disclosed_countries": string[], "disclosed_vendors": string[], "disclosed_items": string[], "disclosed_method_and_time": boolean, "disclosed_retention_period": boolean, "disclosed_opt_out_method": boolean, "disclosed_dest_country_law_info": boolean, "has_scc_or_safeguard_notice": boolean, "has_ai_training_opt_out_notice": boolean, "has_ai_service_notice": boolean, "has_ai_output_label_notice": boolean, "has_do_not_sell_or_share_notice": boolean },
  "security": { "encryption_in_transit": boolean, "encryption_at_rest": boolean, "pii_masked_before_transfer": boolean },
  "virtual_transfer": { "foreign_iam_access": boolean, "foreign_kms_control": boolean },
  "infra_countries": string[]
}`;

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: baseInstruction },
    {
      role: 'user',
      content: `Detected vendors: ${JSON.stringify(
        detectedVendors.map((v) => v.name),
      )}\n\nPolicy Text:\n${policyText}\n\nInfra Code:\n${infraCode}`,
    },
  ];

  const maxAttempts = 3; // initial + up to 2 retries on invalid JSON
  let lastError = 'Unknown local LLM error';
  let useJsonSchema = true;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new LlmRequestCancelledError();
    }

    const requestPayload: Record<string, unknown> = {
      model: modelName,
      messages,
      temperature: 0.1,
      max_tokens: 4096,
    };
    if (useJsonSchema) {
      requestPayload.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'privacy_compliance_facts',
          strict: true,
          schema: LOCAL_FACT_JSON_SCHEMA,
        },
      };
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
        signal,
      });

      if (useJsonSchema && (response.status === 400 || response.status === 422)) {
        useJsonSchema = false;
        attempt--;
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from local endpoint`);
      }

      const data = (await response.json()) as {
        choices?: Array<{
          finish_reason?: string;
          message?: {
            content?: string;
            reasoning_content?: string;
            reasoning?: string;
          };
        }>;
      };
      const choice = data.choices?.[0];
      const rawContent = choice?.message?.content ?? '';
      const rawReasoning =
        choice?.message?.reasoning_content ?? choice?.message?.reasoning ?? '';

      try {
        const parsed = parseJsonWithRepair(
          rawContent.trim().length > 0 ? rawContent : rawReasoning,
        );
        return { payload: parsed, attempts: attempt };
      } catch (parseErr) {
        const msg =
          parseErr instanceof Error ? parseErr.message : 'JSON parse error';
        const preview = (rawContent || rawReasoning)
          .replace(/\s+/g, ' ')
          .slice(0, 120);
        lastError = `${msg} [finish=${choice?.finish_reason ?? 'unknown'}, contentLen=${rawContent.length}, reasoningLen=${rawReasoning.length}${preview ? `, preview="${preview}"` : ''}]`;
        if (rawContent.trim().length > 0) {
          messages.push({ role: 'assistant', content: rawContent });
        }
        messages.push({
          role: 'user',
          content: `Your previous response could not be parsed or failed schema validation (${msg}). Output ONLY one raw JSON object with valid keys ("legal_doc", "security", "virtual_transfer", "infra_countries") using boolean and string[] values, starting with { and ending with }, with no thinking or prose.`,
        });
      }
    } catch (err) {
      if (signal?.aborted || err instanceof LlmRequestCancelledError) {
        throw new LlmRequestCancelledError();
      }
      throw err;
    }
  }

  throw new Error(lastError);
}

/**
 * 3-Tier Hybrid Fact Parser:
 * 1. Cloud Gemini Flash via server-side `/api/parse-facts` proxy
 * 2. Local OpenAI-compatible endpoint (e.g. LM Studio + Gemma 4 12B) with 2x JSON retry
 * 3. Deterministic Smart Heuristic Fallback (never crashes demo)
 */
export async function parseInputsToFacts(
  policyText: string,
  infraCode: string,
  detectedVendors: DetectedVendor[],
  llmConfig: LlmConfig,
  options: ParseInputsOptions = {},
): Promise<ParsedFactsOutput> {
  const startedAt = performance.now();
  const warnings: string[] = [];
  const heuristic = extractHeuristicPayload(
    policyText,
    infraCode,
    detectedVendors,
    Boolean(options.noPolicyDoc),
  );

  if (options.noPolicyDoc && infraCode.trim().length === 0) {
    return {
      parsedFacts: mergeParsedFacts(heuristic, null, detectedVendors, options),
      engineUsed: 'HEURISTIC_FALLBACK',
      attempts: 1,
      warnings,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }

  if (options.signal?.aborted) {
    throw new LlmRequestCancelledError();
  }

  if (llmConfig.provider !== 'LOCAL_OPENAI_COMPAT') {
    try {
      const response = await fetch('/api/parse-facts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policyText: options.noPolicyDoc ? '' : policyText,
          infraCode,
          vendorNames: detectedVendors.map((v) => v.name),
          modelName: llmConfig.modelName,
        }),
        signal: options.signal,
      });

      if (response.ok) {
        const json = (await response.json()) as { parsed?: unknown };
        if (json.parsed !== undefined) {
          const validatedPayload = validateExtractedPayload(json.parsed);
          return {
            parsedFacts: mergeParsedFacts(
              heuristic,
              validatedPayload,
              detectedVendors,
              options,
            ),
            engineUsed: 'GEMINI_CLOUD',
            attempts: 1,
            warnings,
            latencyMs: Math.round(performance.now() - startedAt),
          };
        }
      }

      const errPayload = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      warnings.push(
        errPayload.error
          ? `Cloud Gemini 응답 불가(${errPayload.error}) — 내장 스마트 휴리스틱 파서로 자동 전환되었습니다.`
          : 'Cloud Gemini 응답 불가 — 내장 스마트 휴리스틱 파서로 자동 전환되었습니다.',
      );
    } catch (err) {
      if (options.signal?.aborted || err instanceof LlmRequestCancelledError) {
        throw new LlmRequestCancelledError();
      }
      warnings.push(
        'Cloud Gemini 연결 실패 — 내장 스마트 휴리스틱 파서로 자동 전환되었습니다.',
      );
    }
  } else if (llmConfig.provider === 'LOCAL_OPENAI_COMPAT') {
    try {
      const { payload, attempts } = await callLocalOpenAiWithRetry(
        options.noPolicyDoc ? '' : policyText,
        infraCode,
        detectedVendors,
        llmConfig,
        options.signal,
      );
      return {
        parsedFacts: mergeParsedFacts(
          heuristic,
          payload,
          detectedVendors,
          options,
        ),
        engineUsed: 'LOCAL_OPENAI_COMPAT',
        attempts,
        warnings,
        latencyMs: Math.round(performance.now() - startedAt),
      };
    } catch (err) {
      if (options.signal?.aborted || err instanceof LlmRequestCancelledError) {
        throw new LlmRequestCancelledError();
      }
      const msg = err instanceof Error ? err.message : '로컬 엔드포인트 연결 실패';
      warnings.push(
        `On-Premise 로컬 LLM 호출 실패(${msg}) — 내장 스마트 휴리스틱 파서로 자동 폴백되었습니다.`,
      );
    }
  }

  return {
    parsedFacts: mergeParsedFacts(heuristic, null, detectedVendors, options),
    engineUsed: 'HEURISTIC_FALLBACK',
    attempts: 1,
    warnings,
    latencyMs: Math.round(performance.now() - startedAt),
  };
}
