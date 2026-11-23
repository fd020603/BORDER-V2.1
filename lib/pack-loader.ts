import {
  buildEvaluationContext,
  dedupeEffectiveCatalog,
  evaluatePackApplicability,
} from './rule-evaluator';
import type { CanonicalFactModel, PolicyPackV2 } from './types';

export interface ResolvedPackLoaderResult {
  /** Deduplicated catalog after superseding older packs with newer versions */
  effectiveCatalog: PolicyPackV2[];
  /** Packs automatically matched as applicable for the given facts */
  requiredPacks: PolicyPackV2[];
  /** Packs in the effective catalog that are currently not applicable (standby) */
  standbyPacks: PolicyPackV2[];
  /** Pack IDs replaced by a newer plugin pack or matching-law version */
  supersededPackIds: string[];
}

/**
 * Resolves the effective catalog (deduplicating same-ID or same-law newer plugin packs)
 * without filtering by `facts`.
 */
export function resolvePackCatalog(
  catalogPacks: PolicyPackV2[],
  disabledPackIds: string[] = [],
): {
  effectiveCatalog: PolicyPackV2[];
  enabledCatalog: PolicyPackV2[];
  supersededPackIds: string[];
} {
  const { effectiveCatalog, supersededPackIds } = dedupeEffectiveCatalog(catalogPacks);
  const disabledSet = new Set(disabledPackIds);
  const enabledCatalog = effectiveCatalog
    .filter((pack) => !disabledSet.has(pack.pack_meta.id))
    .sort((a, b) => a.pack_meta.layer - b.pack_meta.layer);

  return {
    effectiveCatalog: [...effectiveCatalog].sort(
      (a, b) => a.pack_meta.layer - b.pack_meta.layer,
    ),
    enabledCatalog,
    supersededPackIds,
  };
}

/**
 * Smart Auto-Loader:
 * Evaluates each enabled pack's `applicability` DSL against `CanonicalFactModel`
 * (`workspace.business_country`, `workspace.data_subject_countries`,
 * `transfers.destination_countries`, `transfers.detected_vendors`, `workspace.industry_domain`)
 * and returns only the required applicable packs alongside standby packs.
 */
export function resolveRequiredPacks(
  facts: CanonicalFactModel,
  catalogPacks: PolicyPackV2[],
  disabledPackIds: string[] = [],
): ResolvedPackLoaderResult {
  const { effectiveCatalog, enabledCatalog, supersededPackIds } = resolvePackCatalog(
    catalogPacks,
    disabledPackIds,
  );
  const { context } = buildEvaluationContext(facts);

  const requiredPacks: PolicyPackV2[] = [];
  const standbyPacks: PolicyPackV2[] = [];

  for (const pack of enabledCatalog) {
    if (evaluatePackApplicability(pack, context)) {
      requiredPacks.push(pack);
    } else {
      standbyPacks.push(pack);
    }
  }

  return {
    effectiveCatalog,
    requiredPacks,
    standbyPacks,
    supersededPackIds,
  };
}
