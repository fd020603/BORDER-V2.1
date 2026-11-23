import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_POLICY_PACKS } from '../lib/default-packs';
import {
  STACK_BUILDER_REGIONS,
  scanDependencyFile,
} from '../lib/dependency-scanner';
import { extractHeuristicPayload } from '../lib/llm-parser';
import {
  computeEffectiveHasCrossBorder,
  evaluateFacts,
} from '../lib/rule-evaluator';
import type {
  CanonicalFactModel,
  DetectedVendor,
  IndustryDomain,
  PolicyPackV2,
} from '../lib/types';

interface CliArgs {
  depsPaths: string[];
  infraPaths: string[];
  policyPath?: string;
  businessCountry: string;
  subjectCountries: string[];
  industryDomain: IndustryDomain;
  packIds?: string[];
  outputPath?: string;
  failOn: Set<string>;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    depsPaths: [],
    infraPaths: [],
    businessCountry: process.env.BORDER_CHECKER_BUSINESS_COUNTRY || 'KR',
    subjectCountries: (process.env.BORDER_CHECKER_SUBJECT_COUNTRIES || 'KR')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
    industryDomain:
      (process.env.BORDER_CHECKER_INDUSTRY as IndustryDomain) || 'AI_SAAS',
    failOn: new Set(
      (process.env.BORDER_CHECKER_FAIL_ON || 'BLOCKER,DRIFT')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    ),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === 'scan') continue;
    if ((token === '--deps' || token === '-d') && next) {
      args.depsPaths.push(...next.split(',').map((s) => s.trim()).filter(Boolean));
      i += 1;
    } else if ((token === '--infra' || token === '-i') && next) {
      args.infraPaths.push(...next.split(',').map((s) => s.trim()).filter(Boolean));
      i += 1;
    } else if ((token === '--policy' || token === '-p') && next) {
      args.policyPath = next.trim();
      i += 1;
    } else if (token === '--business-country' && next) {
      args.businessCountry = next.trim().toUpperCase();
      i += 1;
    } else if (token === '--subjects' && next) {
      args.subjectCountries = next
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      i += 1;
    } else if (token === '--industry' && next) {
      args.industryDomain = next.trim().toUpperCase() as IndustryDomain;
      i += 1;
    } else if (token === '--packs' && next) {
      args.packIds = next
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      i += 1;
    } else if ((token === '--output' || token === '-o') && next) {
      args.outputPath = next.trim();
      i += 1;
    } else if (token === '--fail-on' && next) {
      args.failOn = new Set(
        next
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
      );
      i += 1;
    }
  }

  return args;
}

function readOptionalFile(filePath: string): string {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) return '';
  return fs.readFileSync(resolved, 'utf8');
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const vendorMap = new Map<string, DetectedVendor>();
  const regionIdSet = new Set<string>();

  for (const depPath of args.depsPaths) {
    const content = readOptionalFile(depPath);
    if (!content) continue;
    const scan = scanDependencyFile(path.basename(depPath), content);
    for (const v of scan.detectedVendors) {
      if (!vendorMap.has(v.sdk)) {
        vendorMap.set(v.sdk, v);
      }
    }
    for (const reg of scan.detectedRegions) {
      regionIdSet.add(reg);
    }
  }

  const infraCode = args.infraPaths
    .map((p) => readOptionalFile(p))
    .filter(Boolean)
    .join('\n\n');
  const policyText = args.policyPath ? readOptionalFile(args.policyPath) : '';
  const noPolicyDoc = policyText.trim().length === 0;
  const detectedVendors = Array.from(vendorMap.values());

  const heuristic = extractHeuristicPayload(
    policyText,
    infraCode,
    detectedVendors,
    noPolicyDoc,
  );

  const regionCountries = Array.from(regionIdSet)
    .map((id) => STACK_BUILDER_REGIONS.find((r) => r.id === id)?.countryCode)
    .filter((c): c is string => Boolean(c));

  const businessCountry = args.businessCountry.toUpperCase();
  const activeVendors = detectedVendors.filter((v) => v.includes_pii !== false);
  const destinationCountries = Array.from(
    new Set(
      [
        ...regionCountries,
        ...(heuristic.infra_countries ?? []),
        ...activeVendors.map((v) => v.data_residency_country),
      ]
        .map((c) => c.toUpperCase())
        .filter((c) => c.length > 0 && c !== businessCountry),
    ),
  );

  const virtualTransfer = {
    foreign_iam_access: heuristic.virtual_transfer?.foreign_iam_access ?? false,
    foreign_kms_control: heuristic.virtual_transfer?.foreign_kms_control ?? false,
  };

  const facts: CanonicalFactModel = {
    workspace: {
      business_country: businessCountry,
      data_subject_countries:
        args.subjectCountries.length > 0 ? args.subjectCountries : [businessCountry],
      industry_domain: args.industryDomain,
    },
    transfers: {
      has_cross_border: computeEffectiveHasCrossBorder(
        destinationCountries,
        activeVendors,
        businessCountry,
        virtualTransfer,
      ),
      destination_countries: destinationCountries,
      detected_vendors: detectedVendors,
      virtual_transfer: virtualTransfer,
    },
    security: {
      encryption_in_transit: heuristic.security?.encryption_in_transit ?? true,
      encryption_at_rest: heuristic.security?.encryption_at_rest ?? true,
      pii_masked_before_transfer: heuristic.security?.pii_masked_before_transfer ?? false,
    },
    legal_doc: {
      exists: heuristic.legal_doc?.exists ?? false,
      claims_domestic_only: heuristic.legal_doc?.claims_domestic_only ?? false,
      has_separate_consent: heuristic.legal_doc?.has_separate_consent ?? false,
      has_entrustment_disclosure: heuristic.legal_doc?.has_entrustment_disclosure ?? false,
      disclosed_countries: heuristic.legal_doc?.disclosed_countries ?? [],
      disclosed_vendors: heuristic.legal_doc?.disclosed_vendors ?? [],
      disclosed_items: heuristic.legal_doc?.disclosed_items ?? [],
      disclosed_method_and_time: heuristic.legal_doc?.disclosed_method_and_time ?? false,
      disclosed_retention_period: heuristic.legal_doc?.disclosed_retention_period ?? false,
      disclosed_opt_out_method: heuristic.legal_doc?.disclosed_opt_out_method ?? false,
      disclosed_dest_country_law_info:
        heuristic.legal_doc?.disclosed_dest_country_law_info ?? false,
      has_scc_or_safeguard_notice: heuristic.legal_doc?.has_scc_or_safeguard_notice ?? false,
      has_ai_training_opt_out_notice:
        heuristic.legal_doc?.has_ai_training_opt_out_notice ?? false,
      has_ai_service_notice: heuristic.legal_doc?.has_ai_service_notice ?? false,
      has_ai_output_label_notice: heuristic.legal_doc?.has_ai_output_label_notice ?? false,
      has_do_not_sell_or_share_notice:
        heuristic.legal_doc?.has_do_not_sell_or_share_notice ?? false,
    },
  };

  let packs: PolicyPackV2[] = DEFAULT_POLICY_PACKS;
  if (args.packIds && args.packIds.length > 0) {
    const requested = new Set(args.packIds);
    const filtered = DEFAULT_POLICY_PACKS.filter((p) => requested.has(p.pack_meta.id));
    if (filtered.length > 0) {
      packs = filtered;
    }
  }

  const result = evaluateFacts(facts, packs);
  const statusBadge =
    result.verdict === 'APPROVED'
      ? 'PASSED'
      : result.verdict === 'CONDITIONAL'
        ? 'CONDITIONAL'
        : 'BLOCKED';

  const lines: string[] = [
    `## Border Checker Data Sovereignty Gate — ${statusBadge} (${result.verdict})`,
    '',
    `- **충족률**: ${result.stats.passed_rule_count}/${result.stats.total_evaluated_rules} (${result.stats.pass_rate_percent}%)`,
    `- **BLOCKER**: ${result.stats.blocker_count}건 | **DRIFT**: ${result.stats.drift_count}건 | **WARNING**: ${result.stats.warning_count}건`,
    `- **탐지된 외부 PII 벤더**: ${activeVendors.map((v) => `${v.name} (${v.data_residency_country})`).join(', ') || '없음'}`,
    '',
  ];

  if (result.detected_drifts.length > 0) {
    lines.push('### Policy-Infra Drift');
    for (const drift of result.detected_drifts) {
      lines.push(`- **[${drift.severity}] ${drift.rule_id}**: ${drift.summary}`);
    }
    lines.push('');
  }

  if (result.triggered_rules.length > 0) {
    lines.push('### 탐지된 점검 항목');
    for (const r of result.triggered_rules) {
      lines.push(
        `- **[${r.severity}] ${r.pack_id} · ${r.article_citation}**: ${r.plain_title}`,
      );
    }
    lines.push('');
  } else {
    lines.push('모든 적용 법률 팩 정합성 기준을 통과했습니다.');
    lines.push('');
  }

  const markdown = lines.join('\n');
  if (args.outputPath) {
    const outResolved = path.resolve(process.cwd(), args.outputPath);
    fs.writeFileSync(outResolved, markdown, 'utf8');
  }
  console.log(markdown);

  const shouldFail =
    (args.failOn.has('BLOCKER') && result.stats.blocker_count > 0) ||
    (args.failOn.has('DRIFT') && result.stats.drift_count > 0) ||
    (args.failOn.has('WARNING') && result.stats.warning_count > 0);

  if (shouldFail) {
    process.exitCode = 1;
  }
}

main();
