import { COUNTRY_RISK_PROFILES, GENERATIVE_AI_SDKS } from './sdk-registry';
import type {
  AppliedCountryRisk,
  AppliedPackSnapshot,
  CanonicalFactModel,
  ConditionDslNode,
  ConditionGroup,
  ConditionRule,
  DetectedDrift,
  DetectedVendor,
  DriftCheckSpec,
  DriftType,
  DslOperator,
  EvaluationResult,
  EvaluationVerdict,
  PolicyPackV2,
  PolicyRuleV2,
  TransferPurpose,
  TriggeredRuleResult,
} from './types';

interface DerivedFacts {
  active_vendor_names: string[];
  active_vendor_sdks: string[];
  active_transfer_purposes: TransferPurpose[];
  active_non_adequate_eu_countries: string[];
  has_generative_ai_sdk: boolean;
  has_any_virtual_transfer: boolean;
  has_non_zdr_ai_vendor: boolean;
  us_fisa_exposure: boolean;
}

export interface EvaluationContext {
  workspace: CanonicalFactModel['workspace'];
  transfers: CanonicalFactModel['transfers'];
  security: CanonicalFactModel['security'];
  legal_doc: CanonicalFactModel['legal_doc'];
  derived: DerivedFacts;
}

const EU_ADEQUACY_DEFAULT = new Set(['EU', 'KR', 'JP', 'GB', 'CH', 'CA']);

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items.filter((item) => item.trim().length > 0)));
}

export function normalizeVendor(vendor: DetectedVendor): DetectedVendor {
  const defaultCountry = (
    vendor.default_country ||
    vendor.country ||
    'US'
  ).toUpperCase();
  const residencyCountry = (
    vendor.data_residency_country ||
    vendor.country ||
    defaultCountry
  ).toUpperCase();
  const includesPii =
    vendor.includes_pii !== undefined
      ? vendor.includes_pii
      : vendor.sends_pii !== undefined
        ? vendor.sends_pii
        : true;

  return {
    ...vendor,
    default_country: defaultCountry,
    data_residency_country: residencyCountry,
    country: residencyCountry,
    includes_pii: includesPii,
  };
}

export function computeEffectiveHasCrossBorder(
  destinationCountries: string[],
  activeVendors: DetectedVendor[],
  businessCountry: string,
  virtualTransfer: CanonicalFactModel['transfers']['virtual_transfer'],
): boolean {
  const normalizedBusiness = businessCountry.toUpperCase();
  return (
    destinationCountries.length > 0 ||
    activeVendors.some(
      (v) =>
        (v.data_residency_country || v.country || v.default_country).toUpperCase() !==
        normalizedBusiness,
    ) ||
    Boolean(virtualTransfer.foreign_iam_access || virtualTransfer.foreign_kms_control)
  );
}

/**
 * Normalizes facts while automatically excluding vendors marked with `includes_pii === false`
 * from destination country extraction and violation matching to prevent false positives.
 */
export function buildEvaluationContext(facts: CanonicalFactModel): {
  context: EvaluationContext;
  activeVendors: DetectedVendor[];
  excludedNonPiiVendors: DetectedVendor[];
} {
  const allVendors = (facts.transfers.detected_vendors ?? []).map(normalizeVendor);
  const activeVendors = allVendors.filter((vendor) => vendor.includes_pii !== false);
  const excludedNonPiiVendors = allVendors.filter(
    (vendor) => vendor.includes_pii === false,
  );

  const businessCountry = facts.workspace.business_country.toUpperCase();

  const excludedOnlyCountries = new Set(
    excludedNonPiiVendors
      .map((v) => v.data_residency_country.toUpperCase())
      .filter(
        (country) =>
          !activeVendors.some(
            (av) => av.data_residency_country.toUpperCase() === country,
          ),
      ),
  );

  const overriddenToDomesticOnlyCountries = new Set(
    activeVendors
      .filter((v) => v.data_residency_country.toUpperCase() === businessCountry)
      .map((v) => v.default_country.toUpperCase())
      .filter(
        (defaultCountry) =>
          defaultCountry !== businessCountry &&
          !activeVendors.some(
            (av) => av.data_residency_country.toUpperCase() === defaultCountry,
          ),
      ),
  );

  const effectiveDestinationCountries = uniqueStrings([
    ...facts.transfers.destination_countries
      .map((c) => c.toUpperCase())
      .filter(
        (c) =>
          c !== businessCountry &&
          !excludedOnlyCountries.has(c) &&
          !overriddenToDomesticOnlyCountries.has(c),
      ),
    ...activeVendors
      .map((v) => v.data_residency_country.toUpperCase())
      .filter((c) => c !== businessCountry),
  ]);

  const hasVirtualTransfer =
    facts.transfers.virtual_transfer.foreign_iam_access ||
    facts.transfers.virtual_transfer.foreign_kms_control;

  const effectiveHasCrossBorder = computeEffectiveHasCrossBorder(
    effectiveDestinationCountries,
    activeVendors,
    businessCountry,
    facts.transfers.virtual_transfer,
  );

  const activePurposes = Array.from(
    new Set(activeVendors.map((v) => v.transfer_purpose)),
  );

  const activeNonAdequateEuCountries = effectiveDestinationCountries.filter((country) => {
    if (EU_ADEQUACY_DEFAULT.has(country)) {
      return false;
    }
    if (country === 'US') {
      const usVendors = activeVendors.filter(
        (v) => v.data_residency_country.toUpperCase() === 'US',
      );
      if (usVendors.length === 0) {
        return true;
      }
      return usVendors.some((v) => !v.dpf_certified);
    }
    return true;
  });

  const hasGenerativeAiSdk = activeVendors.some(
    (v) => GENERATIVE_AI_SDKS.has(v.sdk) || v.category === 'AI',
  );

  const hasNonZdrAiVendor = activeVendors.some(
    (v) =>
      (GENERATIVE_AI_SDKS.has(v.sdk) || v.category === 'AI') &&
      v.zero_data_retention === false,
  );

  const usFisaExposure =
    effectiveDestinationCountries.includes('US') ||
    facts.transfers.virtual_transfer.foreign_iam_access ||
    facts.transfers.virtual_transfer.foreign_kms_control;

  const context: EvaluationContext = {
    workspace: {
      ...facts.workspace,
      business_country: businessCountry,
      data_subject_countries: facts.workspace.data_subject_countries.map((c) =>
        c.toUpperCase(),
      ),
    },
    transfers: {
      has_cross_border: effectiveHasCrossBorder,
      destination_countries: effectiveDestinationCountries,
      detected_vendors: allVendors,
      virtual_transfer: { ...facts.transfers.virtual_transfer },
    },
    security: { ...facts.security },
    legal_doc: {
      ...facts.legal_doc,
      disclosed_countries: facts.legal_doc.disclosed_countries.map((c) =>
        c.toUpperCase(),
      ),
      has_ai_training_opt_out_notice:
        facts.legal_doc.has_ai_training_opt_out_notice ?? false,
      has_ai_service_notice:
        facts.legal_doc.has_ai_service_notice ??
        facts.legal_doc.has_ai_training_opt_out_notice ??
        false,
      has_ai_output_label_notice:
        facts.legal_doc.has_ai_output_label_notice ??
        facts.legal_doc.has_ai_training_opt_out_notice ??
        false,
      has_do_not_sell_or_share_notice:
        facts.legal_doc.has_do_not_sell_or_share_notice ?? false,
    },
    derived: {
      active_vendor_names: uniqueStrings(activeVendors.map((v) => v.name)),
      active_vendor_sdks: uniqueStrings(activeVendors.map((v) => v.sdk)),
      active_transfer_purposes: activePurposes,
      active_non_adequate_eu_countries: activeNonAdequateEuCountries,
      has_generative_ai_sdk: hasGenerativeAiSdk,
      has_any_virtual_transfer: hasVirtualTransfer,
      has_non_zdr_ai_vendor: hasNonZdrAiVendor,
      us_fisa_exposure: usFisaExposure,
    },
  };

  return {
    context,
    activeVendors,
    excludedNonPiiVendors,
  };
}

export function resolveFactPath(obj: unknown, path: string): unknown {
  if (!path) return undefined;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function normalizeComparableString(val: unknown): string {
  return String(val ?? '').trim().toLowerCase();
}

function resolveDslTargetValue(rawValue: unknown, context: EvaluationContext): unknown {
  if (typeof rawValue === 'string' && rawValue.startsWith('@')) {
    return resolveFactPath(context, rawValue.slice(1));
  }
  return rawValue;
}

function matchesCategoryValue(actualCategory: unknown, expectedCategory: unknown): boolean {
  const actual = normalizeComparableString(actualCategory);
  const expected = normalizeComparableString(expectedCategory);
  if (!actual || !expected) return false;
  if (actual === expected) return true;
  if (expected === 'cloud') {
    return actual === 'cloud' || actual === 'cloud_db' || actual === 'infra';
  }
  if (expected === 'cloud_db') {
    return actual === 'cloud_db' || actual === 'cloud';
  }
  return false;
}

function matchesVendorCriteria(
  rawVendor: DetectedVendor,
  criteria: Record<string, unknown>,
): boolean {
  const vendor = normalizeVendor(rawVendor);
  const allowNonPii = criteria.includes_pii === false;

  if (!allowNonPii && vendor.includes_pii === false) {
    return false;
  }

  for (const [key, expected] of Object.entries(criteria)) {
    if (expected === undefined) continue;

    if (key === 'includes_pii' || key === 'sends_pii') {
      if (vendor.includes_pii !== Boolean(expected)) {
        return false;
      }
      continue;
    }

    if (key === 'country' || key === 'data_residency_country') {
      const effectiveCountry = vendor.data_residency_country || vendor.country;
      if (Array.isArray(expected)) {
        const matched = expected.some(
          (item) =>
            normalizeComparableString(item) ===
            normalizeComparableString(effectiveCountry),
        );
        if (!matched) return false;
      } else if (
        normalizeComparableString(effectiveCountry) !==
        normalizeComparableString(expected)
      ) {
        return false;
      }
      continue;
    }

    if (key === 'default_country') {
      const originCountry = vendor.default_country || vendor.country;
      if (Array.isArray(expected)) {
        const matched = expected.some(
          (item) =>
            normalizeComparableString(item) ===
            normalizeComparableString(originCountry),
        );
        if (!matched) return false;
      } else if (
        normalizeComparableString(originCountry) !==
        normalizeComparableString(expected)
      ) {
        return false;
      }
      continue;
    }

    if (key === 'category') {
      if (Array.isArray(expected)) {
        if (!expected.some((item) => matchesCategoryValue(vendor.category, item))) {
          return false;
        }
      } else if (!matchesCategoryValue(vendor.category, expected)) {
        return false;
      }
      continue;
    }

    if (key === 'pii_items') {
      const vendorItems = (vendor.pii_items ?? []).map(normalizeComparableString);
      if (Array.isArray(expected)) {
        const hasAll = expected.every((item) =>
          vendorItems.includes(normalizeComparableString(item)),
        );
        if (!hasAll) return false;
      } else if (!vendorItems.includes(normalizeComparableString(expected))) {
        return false;
      }
      continue;
    }

    const actual = (vendor as unknown as Record<string, unknown>)[key];
    if (typeof expected === 'string') {
      if (
        typeof actual !== 'string' ||
        normalizeComparableString(actual) !== normalizeComparableString(expected)
      ) {
        return false;
      }
    } else if (Array.isArray(expected)) {
      const matched = expected.some(
        (item) =>
          normalizeComparableString(item) === normalizeComparableString(actual),
      );
      if (!matched) return false;
    } else if (actual !== expected) {
      return false;
    }
  }

  return true;
}

export function evaluateOperator(
  left: unknown,
  operator: DslOperator,
  right: unknown,
): boolean {
  switch (operator) {
    case 'equals': {
      if (Array.isArray(left) && Array.isArray(right)) {
        return (
          left.length === right.length &&
          left.every((item, idx) => item === right[idx])
        );
      }
      return left === right;
    }
    case 'not_equals': {
      if (Array.isArray(left) && Array.isArray(right)) {
        return (
          left.length !== right.length ||
          left.some((item, idx) => item !== right[idx])
        );
      }
      return left !== right;
    }
    case 'includes': {
      if (Array.isArray(left)) {
        const target = normalizeComparableString(right);
        return left.some((item) => normalizeComparableString(item) === target);
      }
      if (typeof left === 'string') {
        return left.toLowerCase().includes(normalizeComparableString(right));
      }
      return false;
    }
    case 'not_includes': {
      if (Array.isArray(left)) {
        const target = normalizeComparableString(right);
        return !left.some((item) => normalizeComparableString(item) === target);
      }
      if (typeof left === 'string') {
        return !left.toLowerCase().includes(normalizeComparableString(right));
      }
      return true;
    }
    case 'subset_of': {
      if (!Array.isArray(left) || !Array.isArray(right)) {
        return false;
      }
      const rightSet = new Set(right.map((item) => normalizeComparableString(item)));
      return left.every((item) => rightSet.has(normalizeComparableString(item)));
    }
    case 'not_subset_of': {
      if (!Array.isArray(left) || !Array.isArray(right)) {
        return false;
      }
      if (left.length === 0) {
        return false;
      }
      const rightSet = new Set(right.map((item) => normalizeComparableString(item)));
      return left.some((item) => !rightSet.has(normalizeComparableString(item)));
    }
    case 'is_empty': {
      if (left === null || left === undefined) return true;
      if (typeof left === 'boolean') return left === false;
      if (Array.isArray(left)) return left.length === 0;
      if (typeof left === 'string') return left.trim().length === 0;
      if (typeof left === 'object') return Object.keys(left).length === 0;
      return false;
    }
    case 'any_vendor_matches': {
      if (!Array.isArray(left) || !right || typeof right !== 'object' || Array.isArray(right)) {
        return false;
      }
      const criteria = right as Record<string, unknown>;
      const allowNonPii = criteria.includes_pii === false;
      const candidates = (left as DetectedVendor[])
        .map(normalizeVendor)
        .filter((vendor) => allowNonPii || vendor.includes_pii !== false);

      return candidates.some((vendor) => matchesVendorCriteria(vendor, criteria));
    }
    case 'all_vendors_match': {
      if (!Array.isArray(left) || !right || typeof right !== 'object' || Array.isArray(right)) {
        return false;
      }
      const criteria = right as Record<string, unknown>;
      const allowNonPii = criteria.includes_pii === false;
      const candidates = (left as DetectedVendor[])
        .map(normalizeVendor)
        .filter((vendor) => allowNonPii || vendor.includes_pii !== false);

      if (candidates.length === 0) {
        return false;
      }
      return candidates.every((vendor) => matchesVendorCriteria(vendor, criteria));
    }
    default:
      return false;
  }
}

function isConditionGroup(node: ConditionDslNode): node is ConditionGroup {
  return (
    typeof node === 'object' &&
    node !== null &&
    ('all' in node || 'any' in node || 'not' in node)
  );
}

export function evaluateConditionDsl(
  node: ConditionDslNode,
  context: EvaluationContext,
): boolean {
  if (isConditionGroup(node)) {
    if (node.all) {
      return node.all.every((child) => evaluateConditionDsl(child, context));
    }
    if (node.any) {
      return node.any.some((child) => evaluateConditionDsl(child, context));
    }
    if (node.not) {
      return !evaluateConditionDsl(node.not, context);
    }
    return false;
  }

  const rule = node as ConditionRule;
  const leftValue = resolveFactPath(context, rule.fact);
  const rightValue = resolveDslTargetValue(rule.value, context);
  return evaluateOperator(leftValue, rule.operator, rightValue);
}

export function evaluatePackApplicability(
  pack: PolicyPackV2,
  context: EvaluationContext,
): boolean {
  const applicability = pack.applicability as unknown as Record<string, unknown>;
  if (
    applicability &&
    typeof applicability === 'object' &&
    typeof applicability.trigger_if === 'string' &&
    !('all' in applicability) &&
    !('any' in applicability) &&
    !('not' in applicability) &&
    !('fact' in applicability)
  ) {
    const packCountry = pack.pack_meta.country_code.trim().toUpperCase();
    if (!packCountry) return false;
    return (
      context.workspace.business_country === packCountry ||
      context.workspace.data_subject_countries.includes(packCountry)
    );
  }
  return evaluateConditionDsl(pack.applicability as ConditionDslNode, context);
}

export function isPackApplicable(
  pack: PolicyPackV2,
  facts: CanonicalFactModel,
): boolean {
  const { context } = buildEvaluationContext(facts);
  return evaluatePackApplicability(pack, context);
}

function parseVersionSegments(version: string): number[] {
  return version
    .replace(/^v/i, '')
    .split(/[^0-9]+/)
    .filter((s) => s.length > 0)
    .map((s) => Number(s));
}

function comparePackVersions(a: string, b: string): number {
  const segA = parseVersionSegments(a);
  const segB = parseVersionSegments(b);
  const maxLen = Math.max(segA.length, segB.length);
  for (let i = 0; i < maxLen; i += 1) {
    const numA = segA[i] ?? 0;
    const numB = segB[i] ?? 0;
    if (numA !== numB) {
      return numA > numB ? 1 : -1;
    }
  }
  return 0;
}

function deriveLawBaseStem(pack: PolicyPackV2): string {
  const strippedId = pack.pack_meta.id
    .trim()
    .toLowerCase()
    .replace(/(?:[_-]?v?\d+(?:[._-]\d+)*)+$/i, '')
    .replace(/[_-]+$/g, '');
  if (strippedId.length > 0) {
    return strippedId;
  }
  return pack.pack_meta.law_name.trim().toLowerCase();
}

export function dedupeEffectiveCatalog(packs: PolicyPackV2[]): {
  effectiveCatalog: PolicyPackV2[];
  supersededPackIds: string[];
} {
  const selectedByGroup = new Map<string, PolicyPackV2>();
  const orderedKeys: string[] = [];
  const supersededPackIds: string[] = [];

  for (const pack of packs) {
    const idKey = pack.pack_meta.id.trim().toLowerCase();
    const lawStem = deriveLawBaseStem(pack);
    const groupKey = `${pack.pack_meta.layer}::${pack.pack_meta.country_code.trim().toUpperCase()}::${lawStem}`;

    // First check exact ID match across groups, then same layer+country+lawStem
    const matchedKey =
      orderedKeys.find(
        (key) => selectedByGroup.get(key)?.pack_meta.id.trim().toLowerCase() === idKey,
      ) ?? (selectedByGroup.has(groupKey) ? groupKey : undefined);

    if (!matchedKey) {
      selectedByGroup.set(groupKey, pack);
      orderedKeys.push(groupKey);
      continue;
    }

    const existing = selectedByGroup.get(matchedKey)!;
    const cmp = comparePackVersions(
      pack.pack_meta.version || '',
      existing.pack_meta.version || '',
    );

    if (cmp >= 0) {
      supersededPackIds.push(existing.pack_meta.id);
      selectedByGroup.set(matchedKey, pack);
    } else {
      supersededPackIds.push(pack.pack_meta.id);
    }
  }

  return {
    effectiveCatalog: orderedKeys.map((key) => selectedByGroup.get(key)!),
    supersededPackIds: Array.from(new Set(supersededPackIds)),
  };
}

function isNonEmptyPlainObject(value: unknown): boolean {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length > 0
  );
}

function collectDslFacts(node: unknown, out: string[]): void {
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (typeof obj.fact === 'string') {
    out.push(obj.fact);
  }
  if (Array.isArray(obj.all)) {
    obj.all.forEach((child) => collectDslFacts(child, out));
  }
  if (Array.isArray(obj.any)) {
    obj.any.forEach((child) => collectDslFacts(child, out));
  }
  if (obj.not) {
    collectDslFacts(obj.not, out);
  }
}

function inferDriftMetadata(
  rule: PolicyRuleV2,
  driftCheck: DriftCheckSpec,
): {
  driftType: DriftType;
  factPath: string;
  docClaimPath: string;
} {
  const referencedFacts: string[] = [];
  collectDslFacts(driftCheck.condition, referencedFacts);

  const hasFact = (prefix: string) =>
    referencedFacts.some((f) => f === prefix || f.startsWith(`${prefix}.`));

  let driftType: DriftType = driftCheck.drift_type ?? 'SAFEGUARD_CLAIM_MISMATCH';
  if (!driftCheck.drift_type) {
    if (hasFact('legal_doc.claims_domestic_only')) {
      driftType = 'DOMESTIC_CLAIM_CONTRADICTION';
    } else if (
      rule.category === 'VIRTUAL_TRANSFER' ||
      hasFact('transfers.virtual_transfer') ||
      hasFact('derived.has_any_virtual_transfer')
    ) {
      driftType = 'VIRTUAL_TRANSFER_OMISSION';
    } else if (
      hasFact('legal_doc.disclosed_vendors') ||
      hasFact('derived.active_vendor_names')
    ) {
      driftType = 'UNDISCLOSED_VENDOR';
    } else if (
      hasFact('legal_doc.disclosed_countries') ||
      hasFact('transfers.destination_countries')
    ) {
      driftType = 'UNDISCLOSED_COUNTRY';
    } else {
      driftType = 'SAFEGUARD_CLAIM_MISMATCH';
    }
  }

  const factPath =
    driftCheck.fact_path ??
    (hasFact('transfers.virtual_transfer')
      ? 'transfers.virtual_transfer'
      : hasFact('transfers.destination_countries')
        ? 'transfers.destination_countries'
        : hasFact('transfers.detected_vendors')
          ? 'derived.active_vendor_names'
          : 'transfers.destination_countries');

  const docClaimPath =
    driftCheck.doc_claim_path ??
    (referencedFacts.find((f) => f.startsWith('legal_doc.')) ??
      'legal_doc.claims_domestic_only');

  return { driftType, factPath, docClaimPath };
}

function collectAppliedCountryRisks(
  context: EvaluationContext,
  activeVendors: DetectedVendor[],
): AppliedCountryRisk[] {
  const destinations = new Set(context.transfers.destination_countries);
  if (
    context.transfers.virtual_transfer.foreign_iam_access ||
    context.transfers.virtual_transfer.foreign_kms_control
  ) {
    if (
      destinations.size === 0 &&
      context.workspace.business_country.toUpperCase() !== 'US'
    ) {
      destinations.add('US');
    }
  }

  const results: AppliedCountryRisk[] = [];
  for (const countryCode of destinations) {
    const profile = COUNTRY_RISK_PROFILES[countryCode];
    if (!profile) continue;

    const triggeredByVendors = activeVendors
      .filter((v) => v.data_residency_country.toUpperCase() === countryCode)
      .map((v) => `${v.name} (${v.sdk})`);

    results.push({
      country_code: countryCode,
      profile,
      triggered_by_vendors: triggeredByVendors,
      triggered_by_virtual_transfer:
        context.derived.has_any_virtual_transfer &&
        (countryCode === 'US' || triggeredByVendors.length === 0),
    });
  }

  const severityOrder = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };
  return results.sort(
    (a, b) =>
      severityOrder[a.profile.risk_level] - severityOrder[b.profile.risk_level],
  );
}

function computeVerdict(
  context: EvaluationContext,
  triggeredRules: TriggeredRuleResult[],
  detectedDrifts: DetectedDrift[],
): EvaluationVerdict {
  const blockerCount = triggeredRules.filter((r) => r.severity === 'BLOCKER').length;
  const warningCount = triggeredRules.filter((r) => r.severity === 'WARNING').length;
  const driftCount = detectedDrifts.length;

  const missingEncryption =
    !context.security.encryption_in_transit || !context.security.encryption_at_rest;
  const nonDriftBlockers = triggeredRules.filter(
    (r) => r.severity === 'BLOCKER' && !r.has_drift,
  ).length;

  if (blockerCount === 0 && warningCount === 0 && driftCount === 0) {
    return 'APPROVED';
  }

  if (
    missingEncryption ||
    (nonDriftBlockers >= 3 && !context.legal_doc.claims_domestic_only)
  ) {
    return 'DENIED';
  }

  if (driftCount > 0) {
    return 'DRIFT_DETECTED';
  }

  if (blockerCount > 0) {
    return 'DENIED';
  }

  return 'CONDITIONAL';
}

function buildSummaryCopy(
  verdict: EvaluationVerdict,
  blockerCount: number,
  warningCount: number,
  driftCount: number,
  passedRuleCount: number,
  totalEvaluatedRules: number,
  passRatePercent: number,
): { headline: string; detail: string } {
  switch (verdict) {
    case 'APPROVED':
      return {
        headline: '문서-인프라 정합성 통과 (출입국 승인)',
        detail: `적용된 관할 법률 팩의 전체 점검 항목 ${totalEvaluatedRules}개 중 ${passedRuleCount}개를 충족(${passRatePercent}%)했으며, 누락 또는 불일치가 탐지되지 않았습니다.`,
      };
    case 'DRIFT_DETECTED':
      return {
        headline: '문서-인프라 정합성 불일치 탐지 (Policy-Infra Drift)',
        detail: `처리방침 기재 내용과 실제 코드·인프라 설정 간 ${driftCount}건의 불일치(Drift) 및 ${blockerCount + warningCount}건의 확인 필요 항목이 탐지되었습니다 (충족률 ${passedRuleCount}/${totalEvaluatedRules}, ${passRatePercent}%).`,
      };
    case 'DENIED':
      return {
        headline: '다중 규제 고지 누락 또는 기술적 보호조치 미충족 (반출 보류)',
        detail: `총 ${blockerCount}건의 핵심 차단 항목(BLOCKER) 및 ${warningCount}건의 주의 항목(WARNING)이 탐지되어 배포 전 처리방침·인프라 정합성 보완이 필요합니다 (충족률 ${passedRuleCount}/${totalEvaluatedRules}, ${passRatePercent}%).`,
      };
    case 'CONDITIONAL':
      return {
        headline: '조건부 정합성 충족 (보완 권고 항목 존재)',
        detail: `치명적 차단 항목(BLOCKER)은 없으나 ${warningCount}건의 권고 항목(WARNING)이 탐지되었습니다 (충족률 ${passedRuleCount}/${totalEvaluatedRules}, ${passRatePercent}%).`,
      };
  }
}

/**
 * Deterministic 4-Layer Rule Evaluator with Auto-Deduplicated Catalog & Pass/Block Metrics
 */
export function evaluateFacts(
  facts: CanonicalFactModel,
  activePacks: PolicyPackV2[],
): EvaluationResult {
  const { context, activeVendors, excludedNonPiiVendors } =
    buildEvaluationContext(facts);

  const { effectiveCatalog } = dedupeEffectiveCatalog(activePacks);
  const sortedPacks = [...effectiveCatalog].sort(
    (a, b) => a.pack_meta.layer - b.pack_meta.layer,
  );

  const triggeredRules: TriggeredRuleResult[] = [];
  const detectedDrifts: DetectedDrift[] = [];
  const appliedPackSnapshots: AppliedPackSnapshot[] = [];
  let totalEvaluatedRules = 0;

  for (const pack of sortedPacks) {
    const isApplicable = evaluatePackApplicability(pack, context);
    let packTriggeredCount = 0;

    if (isApplicable) {
      totalEvaluatedRules += pack.rules.length;

      for (const rule of pack.rules) {
        const matched = evaluateConditionDsl(rule.condition_dsl, context);
        if (!matched) continue;

        packTriggeredCount += 1;
        const driftCheck = rule.drift_check;
        const hasDrift = Boolean(
          driftCheck &&
            driftCheck.enabled === true &&
            isNonEmptyPlainObject(driftCheck.condition) &&
            evaluateConditionDsl(driftCheck.condition as ConditionDslNode, context),
        );

        const driftSummary = hasDrift
          ? driftCheck?.alert_message?.trim() ||
            driftCheck?.summary?.trim() ||
            rule.plain_title
          : undefined;

        triggeredRules.push({
          pack_id: pack.pack_meta.id,
          pack_name: pack.pack_meta.law_name,
          pack_version: pack.pack_meta.version,
          layer: pack.pack_meta.layer,
          country_code: pack.pack_meta.country_code,
          rule_id: rule.rule_id,
          category: rule.category,
          severity: rule.severity,
          article_citation: rule.article_citation,
          plain_title: rule.plain_title,
          plain_explanation: rule.plain_explanation,
          remediation: rule.remediation ?? {
            legal_template: '',
            infra_patch_hint: '',
          },
          has_drift: hasDrift,
          drift_summary: driftSummary,
        });

        if (driftCheck && hasDrift) {
          const inferred = inferDriftMetadata(rule, driftCheck);
          detectedDrifts.push({
            rule_id: rule.rule_id,
            pack_id: pack.pack_meta.id,
            layer: pack.pack_meta.layer,
            drift_type: inferred.driftType,
            severity: rule.severity,
            title: rule.plain_title,
            summary: driftSummary ?? rule.plain_title,
            fact_path: inferred.factPath,
            fact_value: resolveFactPath(context, inferred.factPath),
            doc_claim_path: inferred.docClaimPath,
            doc_claim_value: resolveFactPath(context, inferred.docClaimPath),
          });
        }
      }
    }

    appliedPackSnapshots.push({
      pack_id: pack.pack_meta.id,
      layer: pack.pack_meta.layer,
      law_name: pack.pack_meta.law_name,
      version: pack.pack_meta.version,
      applicable: isApplicable,
      triggered_rule_count: packTriggeredCount,
    });
  }

  const appliedCountryRisks = collectAppliedCountryRisks(context, activeVendors);
  const blockerCount = triggeredRules.filter(
    (r) => r.severity === 'BLOCKER',
  ).length;
  const warningCount = triggeredRules.filter(
    (r) => r.severity === 'WARNING',
  ).length;
  const driftCount = detectedDrifts.length;

  const passedRuleCount = Math.max(0, totalEvaluatedRules - triggeredRules.length);
  const passRatePercent =
    totalEvaluatedRules === 0
      ? 100
      : Math.round((passedRuleCount / totalEvaluatedRules) * 100);

  const verdict = computeVerdict(context, triggeredRules, detectedDrifts);
  const summary = buildSummaryCopy(
    verdict,
    blockerCount,
    warningCount,
    driftCount,
    passedRuleCount,
    totalEvaluatedRules,
    passRatePercent,
  );

  return {
    verdict,
    compliance_score: passRatePercent,
    summary_headline: summary.headline,
    summary_detail: summary.detail,
    evaluated_at: new Date().toISOString(),
    triggered_rules: triggeredRules,
    detected_drifts: detectedDrifts,
    applied_country_risks: appliedCountryRisks,
    applied_pack_versions: appliedPackSnapshots,
    stats: {
      blocker_count: blockerCount,
      warning_count: warningCount,
      drift_count: driftCount,
      total_evaluated_rules: totalEvaluatedRules,
      passed_rule_count: passedRuleCount,
      pass_rate_percent: passRatePercent,
      active_vendor_count: activeVendors.length,
      excluded_non_pii_vendor_count: excludedNonPiiVendors.length,
      active_destination_countries: context.transfers.destination_countries,
    },
  };
}
