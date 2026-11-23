import { DEFAULT_POLICY_PACKS, LEGACY_TEMP_PACK_IDS } from './default-packs';
import { DEMO_SCENARIOS } from './demo-scenarios';
import { resolvePackCatalog } from './pack-loader';
import { evaluateFacts } from './rule-evaluator';
import type {
  AuditHistoryRecord,
  CanonicalFactModel,
  DetectedVendor,
  EvaluationResult,
  IndustryDomain,
  LlmConfig,
  PolicyPackV2,
  VirtualTransferFacts,
  WorkspaceProfile,
} from './types';

export interface ProfileWorkspaceState {
  profileId: string;
  businessCountry: string;
  dataSubjectCountries: string[];
  industryDomain: IndustryDomain;
  selectedRegions: string[];
  detectedVendors: DetectedVendor[];
  policyText: string;
  noPolicyDoc: boolean;
  infraCode: string;
  virtualTransfer: VirtualTransferFacts;
  security: CanonicalFactModel['security'];
  lastResult: EvaluationResult | null;
  lastEngineUsed: string | null;
  lastWarnings: string[];
  updatedAt: string;
}

export interface StorageRepository {
  getProfiles(): WorkspaceProfile[];
  saveProfile(profile: WorkspaceProfile): void;
  deleteProfile(profileId: string): void;
  getActiveProfileId(): string;
  setActiveProfileId(profileId: string): void;
  getProfileState(profileId: string): ProfileWorkspaceState | null;
  saveProfileState(state: ProfileWorkspaceState): void;
  getAuditHistory(profileId?: string): AuditHistoryRecord[];
  appendAuditHistory(record: AuditHistoryRecord): void;
  deleteAuditHistoryRecord(recordId: string): void;
  getLlmConfig(): LlmConfig;
  saveLlmConfig(config: LlmConfig): void;
  getCustomPolicyPacks(): PolicyPackV2[];
  saveCustomPolicyPack(pack: PolicyPackV2): void;
  deleteCustomPolicyPack(packId: string): void;
  getDisabledPackIds(): string[];
  setDisabledPackIds(ids: string[]): void;
  exportWorkspaceBackup(): WorkspaceBackupPayload;
  importWorkspaceBackup(raw: unknown): { ok: true; profilesCount: number; historyCount: number } | { ok: false; error: string };
}

export interface WorkspaceBackupPayload {
  schema_version: '2.0';
  exported_at: string;
  profiles: WorkspaceProfile[];
  active_profile_id: string;
  profile_states: Record<string, ProfileWorkspaceState>;
  audit_history: AuditHistoryRecord[];
  custom_packs: PolicyPackV2[];
  disabled_pack_ids: string[];
  llm_config: LlmConfig;
}

const STORAGE_KEYS = {
  PROFILES: 'bc_v2_profiles',
  ACTIVE_PROFILE_ID: 'bc_v2_active_profile_id',
  PROFILE_STATES: 'bc_v2_profile_states',
  AUDIT_HISTORY: 'bc_v2_audit_history',
  LLM_CONFIG: 'bc_v2_llm_config',
  CUSTOM_PACKS: 'bc_v2_custom_packs',
  DISABLED_PACK_IDS: 'bc_v2_disabled_pack_ids',
};

const DEFAULT_LLM_CONFIG: LlmConfig = {
  provider: 'GEMINI_CLOUD',
  localEndpoint: 'http://127.0.0.1:1234/v1/chat/completions',
  modelName: 'gemini-4-hydrogen',
};

function cloneValue<T>(val: T): T {
  return JSON.parse(JSON.stringify(val)) as T;
}

function buildSeedData(): {
  profiles: WorkspaceProfile[];
  states: Record<string, ProfileWorkspaceState>;
  history: AuditHistoryRecord[];
} {
  const case1 = DEMO_SCENARIOS[0];
  const case2 = DEMO_SCENARIOS[1];

  const profile1: WorkspaceProfile = {
    id: 'profile-prod-seoul-openai',
    profile_name: '운영 서비스 - AWS 서울 + OpenAI',
    description: '국내 AI SaaS 운영 환경 (처리위탁 특례 및 ZDR 적용)',
    business_country: 'KR',
    data_subject_countries: ['KR'],
    industry_domain: 'AI_SAAS',
    updated_at: '2026-11-21T09:00:00Z',
  };

  const profile2: WorkspaceProfile = {
    id: 'profile-global-beta-vercel-stripe',
    profile_name: '글로벌 베타 앱 - Vercel + Stripe',
    description: '글로벌 커머스 베타 스택 (문서-인프라 정합성 점검 대상)',
    business_country: 'KR',
    data_subject_countries: ['KR', 'US'],
    industry_domain: 'AI_SAAS',
    updated_at: '2026-11-21T10:30:00Z',
  };

  const result1 = evaluateFacts(case1.facts, DEFAULT_POLICY_PACKS);
  const result2 = evaluateFacts(case2.facts, DEFAULT_POLICY_PACKS);

  const state1: ProfileWorkspaceState = {
    profileId: profile1.id,
    businessCountry: case1.facts.workspace.business_country,
    dataSubjectCountries: [...case1.facts.workspace.data_subject_countries],
    industryDomain: case1.facts.workspace.industry_domain,
    selectedRegions: ['aws-seoul'],
    detectedVendors: cloneValue(case1.facts.transfers.detected_vendors),
    policyText: case1.sample_privacy_policy,
    noPolicyDoc: false,
    infraCode: [
      'provider "aws" {',
      '  region = "ap-northeast-2"',
      '}',
      'resource "aws_s3_bucket_server_side_encryption_configuration" "app" {',
      '  rule { apply_server_side_encryption_by_default { sse_algorithm = "aws:kms" } }',
      '}',
    ].join('\n'),
    virtualTransfer: cloneValue(case1.facts.transfers.virtual_transfer),
    security: cloneValue(case1.facts.security),
    lastResult: result1,
    lastEngineUsed: 'HEURISTIC_FALLBACK',
    lastWarnings: [],
    updatedAt: profile1.updated_at,
  };

  const state2: ProfileWorkspaceState = {
    profileId: profile2.id,
    businessCountry: case2.facts.workspace.business_country,
    dataSubjectCountries: [...case2.facts.workspace.data_subject_countries],
    industryDomain: case2.facts.workspace.industry_domain,
    selectedRegions: ['vercel-us', 'aws-tokyo'],
    detectedVendors: cloneValue(case2.facts.transfers.detected_vendors),
    policyText: case2.sample_privacy_policy,
    noPolicyDoc: false,
    infraCode: [
      'provider "aws" {',
      '  region = "ap-northeast-1"',
      '}',
      '// Vercel iad1 + AWS Tokyo storage',
    ].join('\n'),
    virtualTransfer: cloneValue(case2.facts.transfers.virtual_transfer),
    security: cloneValue(case2.facts.security),
    lastResult: result2,
    lastEngineUsed: 'HEURISTIC_FALLBACK',
    lastWarnings: [],
    updatedAt: profile2.updated_at,
  };

  const history: AuditHistoryRecord[] = [
    {
      id: 'seed-audit-2',
      profile_id: profile2.id,
      profile_name: profile2.profile_name,
      scenario_label: '초기 스캔 · Vercel + Stripe + Mixpanel',
      verdict: result2.verdict,
      compliance_score: result2.compliance_score,
      drift_count: result2.stats.drift_count,
      blocker_count: result2.stats.blocker_count,
      warning_count: result2.stats.warning_count,
      applied_pack_versions: result2.applied_pack_versions,
      evaluated_at: profile2.updated_at,
      facts_snapshot: cloneValue(case2.facts),
      result_snapshot: result2,
      input_snapshot: {
        policyText: state2.policyText,
        noPolicyDoc: state2.noPolicyDoc,
        infraCode: state2.infraCode,
        selectedRegions: [...state2.selectedRegions],
      },
    },
    {
      id: 'seed-audit-1',
      profile_id: profile1.id,
      profile_name: profile1.profile_name,
      scenario_label: '초기 스캔 · AWS 서울 + OpenAI',
      verdict: result1.verdict,
      compliance_score: result1.compliance_score,
      drift_count: result1.stats.drift_count,
      blocker_count: result1.stats.blocker_count,
      warning_count: result1.stats.warning_count,
      applied_pack_versions: result1.applied_pack_versions,
      evaluated_at: profile1.updated_at,
      facts_snapshot: cloneValue(case1.facts),
      result_snapshot: result1,
      input_snapshot: {
        policyText: state1.policyText,
        noPolicyDoc: state1.noPolicyDoc,
        infraCode: state1.infraCode,
        selectedRegions: [...state1.selectedRegions],
      },
    },
  ];

  return {
    profiles: [profile1, profile2],
    states: {
      [profile1.id]: state1,
      [profile2.id]: state2,
    },
    history,
  };
}

class LocalStorageRepository implements StorageRepository {
  private memoryFallback = new Map<string, string>();
  private initialized = false;

  private readRaw(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // ignore storage errors
    }
    return this.memoryFallback.get(key) ?? null;
  }

  private writeRaw(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {
      // ignore storage errors
    }
    this.memoryFallback.set(key, value);
  }

  private migrateLegacyPackReferences(): void {
    const legacyIdSet = new Set<string>(LEGACY_TEMP_PACK_IDS);
    let cleanedDisabledIds: string[] = [];
    let cleanedCustomPacks: PolicyPackV2[] = [];

    // 1. Remove legacy hardcoded pack IDs from disabled pack IDs
    const rawDisabled = this.readRaw(STORAGE_KEYS.DISABLED_PACK_IDS);
    if (rawDisabled) {
      try {
        const parsed = JSON.parse(rawDisabled) as unknown;
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter(
            (id): id is string => typeof id === 'string' && !legacyIdSet.has(id),
          );
          cleanedDisabledIds = cleaned;
          if (cleaned.length !== parsed.length) {
            this.writeRaw(STORAGE_KEYS.DISABLED_PACK_IDS, JSON.stringify(cleaned));
          }
        }
      } catch {
        cleanedDisabledIds = [];
        this.writeRaw(STORAGE_KEYS.DISABLED_PACK_IDS, JSON.stringify([]));
      }
    }

    // 2. Remove legacy hardcoded packs if somehow saved in custom packs while preserving user plugins
    const rawCustom = this.readRaw(STORAGE_KEYS.CUSTOM_PACKS);
    if (rawCustom) {
      try {
        const parsed = JSON.parse(rawCustom) as unknown;
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter((pack): pack is PolicyPackV2 => {
            const id = (pack as PolicyPackV2)?.pack_meta?.id;
            return typeof id === 'string' && !legacyIdSet.has(id);
          });
          cleanedCustomPacks = cleaned;
          if (cleaned.length !== parsed.length) {
            this.writeRaw(STORAGE_KEYS.CUSTOM_PACKS, JSON.stringify(cleaned));
          }
        }
      } catch {
        // leave malformed custom packs untouched or reset safely
      }
    }

    const { enabledCatalog } = resolvePackCatalog(
      [...DEFAULT_POLICY_PACKS, ...cleanedCustomPacks],
      cleanedDisabledIds,
    );

    // 3. Invalidate stale cached lastResult in workspace states referencing legacy pack IDs,
    // missing pass-rate stats, or outdated built-in pack catalogs (e.g., 4-pack -> 8-pack upgrade).
    const rawStates = this.readRaw(STORAGE_KEYS.PROFILE_STATES);
    if (rawStates) {
      try {
        const states = JSON.parse(rawStates) as Record<string, ProfileWorkspaceState>;
        let changed = false;
        for (const key of Object.keys(states)) {
          const st = states[key];
          if (!st?.lastResult) continue;
          const hasLegacySnapshot = st.lastResult.applied_pack_versions?.some((p) =>
            legacyIdSet.has(p.pack_id),
          );
          const missingPassRateStats =
            typeof st.lastResult.stats?.total_evaluated_rules !== 'number';
          const snapshotPackIds = new Set(
            (st.lastResult.applied_pack_versions ?? []).map((p) => p.pack_id),
          );
          const missingCatalogPack = enabledCatalog.some(
            (pack) => !snapshotPackIds.has(pack.pack_meta.id),
          );
          if (hasLegacySnapshot || missingPassRateStats || missingCatalogPack) {
            states[key] = { ...st, lastResult: null };
            changed = true;
          }
        }
        if (changed) {
          this.writeRaw(STORAGE_KEYS.PROFILE_STATES, JSON.stringify(states));
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  private ensureSeeded(): void {
    if (this.initialized) return;
    this.initialized = true;

    const existingProfiles = this.readRaw(STORAGE_KEYS.PROFILES);
    if (existingProfiles) {
      this.migrateLegacyPackReferences();
      return;
    }

    const seed = buildSeedData();
    this.writeRaw(STORAGE_KEYS.PROFILES, JSON.stringify(seed.profiles));
    this.writeRaw(STORAGE_KEYS.ACTIVE_PROFILE_ID, seed.profiles[0].id);
    this.writeRaw(STORAGE_KEYS.PROFILE_STATES, JSON.stringify(seed.states));
    this.writeRaw(STORAGE_KEYS.AUDIT_HISTORY, JSON.stringify(seed.history));
    this.writeRaw(STORAGE_KEYS.LLM_CONFIG, JSON.stringify(DEFAULT_LLM_CONFIG));
  }

  getProfiles(): WorkspaceProfile[] {
    this.ensureSeeded();
    const raw = this.readRaw(STORAGE_KEYS.PROFILES);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as WorkspaceProfile[];
    } catch {
      return [];
    }
  }

  saveProfile(profile: WorkspaceProfile): void {
    this.ensureSeeded();
    const profiles = this.getProfiles();
    const idx = profiles.findIndex((p) => p.id === profile.id);
    if (idx >= 0) {
      profiles[idx] = profile;
    } else {
      profiles.push(profile);
    }
    this.writeRaw(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
  }

  deleteProfile(profileId: string): void {
    this.ensureSeeded();
    const profiles = this.getProfiles().filter((p) => p.id !== profileId);
    if (profiles.length === 0) return;

    this.writeRaw(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));

    const states = this.readAllStates();
    delete states[profileId];
    this.writeRaw(STORAGE_KEYS.PROFILE_STATES, JSON.stringify(states));

    if (this.getActiveProfileId() === profileId) {
      this.setActiveProfileId(profiles[0].id);
    }
  }

  getActiveProfileId(): string {
    this.ensureSeeded();
    const saved = this.readRaw(STORAGE_KEYS.ACTIVE_PROFILE_ID);
    const profiles = this.getProfiles();
    if (saved && profiles.some((p) => p.id === saved)) {
      return saved;
    }
    return profiles[0]?.id ?? '';
  }

  setActiveProfileId(profileId: string): void {
    this.ensureSeeded();
    this.writeRaw(STORAGE_KEYS.ACTIVE_PROFILE_ID, profileId);
  }

  private readAllStates(): Record<string, ProfileWorkspaceState> {
    const raw = this.readRaw(STORAGE_KEYS.PROFILE_STATES);
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<string, ProfileWorkspaceState>;
    } catch {
      return {};
    }
  }

  getProfileState(profileId: string): ProfileWorkspaceState | null {
    this.ensureSeeded();
    const allStates = this.readAllStates();
    const state = allStates[profileId];
    if (!state) return null;
    return {
      ...state,
      detectedVendors: (state.detectedVendors ?? []).map((v) => {
        const defaultCountry = (
          v.default_country ||
          v.country ||
          'US'
        ).toUpperCase();
        const residencyCountry = (
          v.data_residency_country ||
          v.country ||
          defaultCountry
        ).toUpperCase();
        return {
          ...v,
          default_country: defaultCountry,
          data_residency_country: residencyCountry,
          country: residencyCountry,
          includes_pii:
            v.includes_pii !== undefined
              ? v.includes_pii
              : v.sends_pii !== undefined
                ? v.sends_pii
                : true,
        };
      }),
    };
  }

  saveProfileState(state: ProfileWorkspaceState): void {
    this.ensureSeeded();
    const allStates = this.readAllStates();
    allStates[state.profileId] = state;
    this.writeRaw(STORAGE_KEYS.PROFILE_STATES, JSON.stringify(allStates));
  }

  getAuditHistory(profileId?: string): AuditHistoryRecord[] {
    this.ensureSeeded();
    const raw = this.readRaw(STORAGE_KEYS.AUDIT_HISTORY);
    if (!raw) return [];
    try {
      const records = (JSON.parse(raw) as AuditHistoryRecord[]).map((rec) => ({
        ...rec,
        facts_snapshot: {
          ...rec.facts_snapshot,
          transfers: {
            ...rec.facts_snapshot.transfers,
            detected_vendors: (
              rec.facts_snapshot.transfers.detected_vendors ?? []
            ).map((v) => {
              const defaultCountry = (
                v.default_country ||
                v.country ||
                'US'
              ).toUpperCase();
              const residencyCountry = (
                v.data_residency_country ||
                v.country ||
                defaultCountry
              ).toUpperCase();
              return {
                ...v,
                default_country: defaultCountry,
                data_residency_country: residencyCountry,
                country: residencyCountry,
                includes_pii:
                  v.includes_pii !== undefined
                    ? v.includes_pii
                    : v.sends_pii !== undefined
                      ? v.sends_pii
                      : true,
              };
            }),
          },
        },
      }));
      if (profileId) {
        return records.filter((r) => r.profile_id === profileId);
      }
      return records;
    } catch {
      return [];
    }
  }

  appendAuditHistory(record: AuditHistoryRecord): void {
    this.ensureSeeded();
    const current = this.getAuditHistory();
    const next = [record, ...current].slice(0, 50);
    this.writeRaw(STORAGE_KEYS.AUDIT_HISTORY, JSON.stringify(next));
  }

  deleteAuditHistoryRecord(recordId: string): void {
    this.ensureSeeded();
    const next = this.getAuditHistory().filter((r) => r.id !== recordId);
    this.writeRaw(STORAGE_KEYS.AUDIT_HISTORY, JSON.stringify(next));
  }

  getLlmConfig(): LlmConfig {
    this.ensureSeeded();
    const raw = this.readRaw(STORAGE_KEYS.LLM_CONFIG);
    if (!raw) return DEFAULT_LLM_CONFIG;
    try {
      return { ...DEFAULT_LLM_CONFIG, ...(JSON.parse(raw) as Partial<LlmConfig>) };
    } catch {
      return DEFAULT_LLM_CONFIG;
    }
  }

  saveLlmConfig(config: LlmConfig): void {
    this.ensureSeeded();
    this.writeRaw(STORAGE_KEYS.LLM_CONFIG, JSON.stringify(config));
  }

  getCustomPolicyPacks(): PolicyPackV2[] {
    this.ensureSeeded();
    const raw = this.readRaw(STORAGE_KEYS.CUSTOM_PACKS);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as PolicyPackV2[];
    } catch {
      return [];
    }
  }

  saveCustomPolicyPack(pack: PolicyPackV2): void {
    this.ensureSeeded();
    const current = this.getCustomPolicyPacks();
    const idx = current.findIndex((p) => p.pack_meta.id === pack.pack_meta.id);
    if (idx >= 0) {
      current[idx] = pack;
    } else {
      current.push(pack);
    }
    this.writeRaw(STORAGE_KEYS.CUSTOM_PACKS, JSON.stringify(current));
  }

  deleteCustomPolicyPack(packId: string): void {
    this.ensureSeeded();
    const next = this.getCustomPolicyPacks().filter(
      (p) => p.pack_meta.id !== packId,
    );
    this.writeRaw(STORAGE_KEYS.CUSTOM_PACKS, JSON.stringify(next));
  }

  getDisabledPackIds(): string[] {
    this.ensureSeeded();
    const raw = this.readRaw(STORAGE_KEYS.DISABLED_PACK_IDS);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }

  setDisabledPackIds(ids: string[]): void {
    this.ensureSeeded();
    this.writeRaw(STORAGE_KEYS.DISABLED_PACK_IDS, JSON.stringify(ids));
  }

  exportWorkspaceBackup(): WorkspaceBackupPayload {
    this.ensureSeeded();
    return {
      schema_version: '2.0',
      exported_at: new Date().toISOString(),
      profiles: this.getProfiles(),
      active_profile_id: this.getActiveProfileId(),
      profile_states: this.readAllStates(),
      audit_history: this.getAuditHistory(),
      custom_packs: this.getCustomPolicyPacks(),
      disabled_pack_ids: this.getDisabledPackIds(),
      llm_config: this.getLlmConfig(),
    };
  }

  importWorkspaceBackup(
    raw: unknown,
  ):
    | { ok: true; profilesCount: number; historyCount: number }
    | { ok: false; error: string } {
    this.ensureSeeded();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: '유효한 JSON 백업 객체가 아닙니다.' };
    }
    const obj = raw as Partial<WorkspaceBackupPayload>;
    if (obj.schema_version !== '2.0' || !Array.isArray(obj.profiles) || obj.profiles.length === 0) {
      return { ok: false, error: '지원되는 Border Checker v2.0 백업 형식이 아니거나 프로필이 비어 있습니다.' };
    }

    const validProfiles = obj.profiles.filter(
      (p): p is WorkspaceProfile =>
        Boolean(p && typeof p.id === 'string' && typeof p.profile_name === 'string'),
    );
    if (validProfiles.length === 0) {
      return { ok: false, error: '가져올 수 있는 유효한 워크스페이스 프로필이 없습니다.' };
    }

    const states =
      obj.profile_states && typeof obj.profile_states === 'object' && !Array.isArray(obj.profile_states)
        ? obj.profile_states
        : {};
    const auditHistory = Array.isArray(obj.audit_history)
      ? obj.audit_history.slice(0, 50)
      : [];
    const customPacks = Array.isArray(obj.custom_packs) ? obj.custom_packs : [];
    const disabledIds = Array.isArray(obj.disabled_pack_ids)
      ? obj.disabled_pack_ids.filter((id): id is string => typeof id === 'string')
      : [];
    const activeId =
      typeof obj.active_profile_id === 'string' &&
      validProfiles.some((p) => p.id === obj.active_profile_id)
        ? obj.active_profile_id
        : validProfiles[0].id;

    this.writeRaw(STORAGE_KEYS.PROFILES, JSON.stringify(validProfiles));
    this.writeRaw(STORAGE_KEYS.ACTIVE_PROFILE_ID, activeId);
    this.writeRaw(STORAGE_KEYS.PROFILE_STATES, JSON.stringify(states));
    this.writeRaw(STORAGE_KEYS.AUDIT_HISTORY, JSON.stringify(auditHistory));
    this.writeRaw(STORAGE_KEYS.CUSTOM_PACKS, JSON.stringify(customPacks));
    this.writeRaw(STORAGE_KEYS.DISABLED_PACK_IDS, JSON.stringify(disabledIds));
    if (obj.llm_config && typeof obj.llm_config === 'object') {
      this.writeRaw(
        STORAGE_KEYS.LLM_CONFIG,
        JSON.stringify({ ...DEFAULT_LLM_CONFIG, ...obj.llm_config }),
      );
    }

    this.migrateLegacyPackReferences();
    return {
      ok: true,
      profilesCount: validProfiles.length,
      historyCount: auditHistory.length,
    };
  }
}

export const storageRepository: StorageRepository = new LocalStorageRepository();
