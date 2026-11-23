/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_POLICY_PACKS } from '@/lib/default-packs';
import {
  STACK_BUILDER_REGIONS,
  buildVendorFromSdk,
} from '@/lib/dependency-scanner';
import { DEMO_SCENARIOS } from '@/lib/demo-scenarios';
import {
  LlmRequestCancelledError,
  extractHeuristicPayload,
  parseInputsToFacts,
} from '@/lib/llm-parser';
import { resolvePackCatalog } from '@/lib/pack-loader';
import { evaluateFacts } from '@/lib/rule-evaluator';
import {
  storageRepository,
  type ProfileWorkspaceState,
} from '@/lib/storage';
import type {
  AuditHistoryRecord,
  CanonicalFactModel,
  DetectedVendor,
  IndustryDomain,
  LlmConfig,
  PolicyPackV2,
  TransferPurpose,
  VirtualTransferFacts,
  WorkspaceProfile,
} from '@/lib/types';
import {
  ChevronDown,
  ChevronUp,
  Compass,
  Loader2,
  Play,
  SlidersHorizontal,
  Square,
} from 'lucide-react';
import { AppShell, type MainTabId } from './components/AppShell';
import { AuditHistoryTab } from './components/AuditHistoryTab';
import { AuditReportPanel } from './components/AuditReportPanel';
import { BorderTopologyMap } from './components/BorderTopologyMap';
import { CicdGateTab } from './components/CicdGateTab';
import { DriftComparisonCard } from './components/DriftComparisonCard';
import { DualRemediationKit } from './components/DualRemediationKit';
import { GuidedAuditWizard } from './components/GuidedAuditWizard';
import { InputStudio, type InspectionStageState } from './components/InputStudio';
import { LlmSettingsModal } from './components/LlmSettingsModal';
import { PolicyPacksTab } from './components/PolicyPacksTab';
import { ProfileModal } from './components/ProfileModal';
import {
  ToastContainer,
  type ToastItem,
  type ToastVariant,
} from './components/Toast';

type AuditStudioMode = 'guided' | 'pro';
const STUDIO_MODE_STORAGE_KEY = 'bc_v2_studio_mode';

function readInitialStudioMode(): AuditStudioMode {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(STUDIO_MODE_STORAGE_KEY);
      if (saved === 'guided' || saved === 'pro') return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'guided';
}

function cloneValue<T>(val: T): T {
  return JSON.parse(JSON.stringify(val)) as T;
}

function buildFallbackWorkspaceState(profile: WorkspaceProfile): ProfileWorkspaceState {
  return {
    profileId: profile.id,
    businessCountry: profile.business_country,
    dataSubjectCountries: [...profile.data_subject_countries],
    industryDomain: profile.industry_domain,
    selectedRegions: ['aws-seoul'],
    detectedVendors: [],
    policyText: '',
    noPolicyDoc: false,
    infraCode: 'provider "aws" {\n  region = "ap-northeast-2"\n}',
    virtualTransfer: {
      foreign_iam_access: false,
      foreign_kms_control: false,
    },
    security: {
      encryption_in_transit: true,
      encryption_at_rest: true,
      pii_masked_before_transfer: false,
    },
    lastResult: null,
    lastEngineUsed: null,
    lastWarnings: [],
    updatedAt: new Date().toISOString(),
  };
}

function regionIdsToCountryCodes(regionIds: string[]): string[] {
  return regionIds
    .map((id) => STACK_BUILDER_REGIONS.find((r) => r.id === id)?.countryCode)
    .filter((code): code is string => Boolean(code));
}

function normalizeVendorItem(vendor: DetectedVendor): DetectedVendor {
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

function buildTransfersFromWorkspace(state: ProfileWorkspaceState): CanonicalFactModel['transfers'] {
  const businessCountry = state.businessCountry.toUpperCase();
  const heuristic = extractHeuristicPayload(
    state.policyText,
    state.infraCode,
    state.detectedVendors,
    state.noPolicyDoc,
  );
  const regionCountries = regionIdsToCountryCodes(state.selectedRegions);
  const normalizedVendors = state.detectedVendors.map(normalizeVendorItem);
  const activeVendors = normalizedVendors.filter((v) => v.includes_pii !== false);

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

  const hasCrossBorder =
    destinationCountries.length > 0 ||
    activeVendors.some(
      (v) => v.data_residency_country.toUpperCase() !== businessCountry,
    );

  return {
    has_cross_border: hasCrossBorder,
    destination_countries: destinationCountries,
    detected_vendors: normalizedVendors,
    virtual_transfer: state.virtualTransfer,
  };
}

function buildFactsFromWorkspace(state: ProfileWorkspaceState): CanonicalFactModel {
  const heuristic = extractHeuristicPayload(
    state.policyText,
    state.infraCode,
    state.detectedVendors,
    state.noPolicyDoc,
  );
  const transfers = buildTransfersFromWorkspace(state);

  return {
    workspace: {
      business_country: state.businessCountry.toUpperCase(),
      data_subject_countries: state.dataSubjectCountries.map((c) =>
        c.toUpperCase(),
      ),
      industry_domain: state.industryDomain,
    },
    transfers,
    security: state.security,
    legal_doc: {
      exists: heuristic.legal_doc?.exists ?? false,
      claims_domestic_only: heuristic.legal_doc?.claims_domestic_only ?? false,
      has_separate_consent: heuristic.legal_doc?.has_separate_consent ?? false,
      has_entrustment_disclosure:
        heuristic.legal_doc?.has_entrustment_disclosure ?? false,
      disclosed_countries: heuristic.legal_doc?.disclosed_countries ?? [],
      disclosed_vendors: heuristic.legal_doc?.disclosed_vendors ?? [],
      disclosed_items: heuristic.legal_doc?.disclosed_items ?? [],
      disclosed_method_and_time:
        heuristic.legal_doc?.disclosed_method_and_time ?? false,
      disclosed_retention_period:
        heuristic.legal_doc?.disclosed_retention_period ?? false,
      disclosed_opt_out_method:
        heuristic.legal_doc?.disclosed_opt_out_method ?? false,
      disclosed_dest_country_law_info:
        heuristic.legal_doc?.disclosed_dest_country_law_info ?? false,
      has_scc_or_safeguard_notice:
        heuristic.legal_doc?.has_scc_or_safeguard_notice ?? false,
      has_ai_training_opt_out_notice:
        heuristic.legal_doc?.has_ai_training_opt_out_notice ?? false,
      has_do_not_sell_or_share_notice:
        heuristic.legal_doc?.has_do_not_sell_or_share_notice ?? false,
    },
  };
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function App() {
  const [activeTab, setActiveTab] = useState<MainTabId>('live-audit');
  const [profiles, setProfiles] = useState<WorkspaceProfile[]>(() =>
    storageRepository.getProfiles(),
  );
  const [activeProfileId, setActiveProfileId] = useState<string>(() =>
    storageRepository.getActiveProfileId(),
  );
  const [workspaceState, setWorkspaceState] = useState<ProfileWorkspaceState>(
    () => {
      const pid = storageRepository.getActiveProfileId();
      const loaded = storageRepository.getProfileState(pid);
      if (loaded) return loaded;
      const fallbackProfile = storageRepository.getProfiles()[0];
      return buildFallbackWorkspaceState(fallbackProfile);
    },
  );
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [overrideFacts, setOverrideFacts] = useState<CanonicalFactModel | null>(
    null,
  );
  const [history, setHistory] = useState<AuditHistoryRecord[]>(() =>
    storageRepository.getAuditHistory(),
  );
  const [llmConfig, setLlmConfig] = useState<LlmConfig>(() =>
    storageRepository.getLlmConfig(),
  );
  const [customPacks, setCustomPacks] = useState<PolicyPackV2[]>(() =>
    storageRepository.getCustomPolicyPacks(),
  );
  const [disabledPackIds, setDisabledPackIds] = useState<string[]>(() =>
    storageRepository.getDisabledPackIds(),
  );
  const [llmModalOpen, setLlmModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [studioMode, setStudioMode] = useState<AuditStudioMode>(() =>
    readInitialStudioMode(),
  );
  const [inputStudioOpen, setInputStudioOpen] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [inspectionState, setInspectionState] = useState<InspectionStageState>({
    running: false,
    stepIndex: 0,
  });

  const reportSectionRef = useRef<HTMLDivElement | null>(null);
  const inspectionAbortRef = useRef<AbortController | null>(null);
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const dismissToast = useCallback((id: string) => {
    const existing = toastTimersRef.current.get(id);
    if (existing) {
      clearTimeout(existing);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, message, variant }]);
      const timer = setTimeout(() => {
        dismissToast(id);
      }, 2500);
      toastTimersRef.current.set(id, timer);
    },
    [dismissToast],
  );

  const handleChangeStudioMode = (nextMode: AuditStudioMode) => {
    setStudioMode(nextMode);
    setInputStudioOpen(true);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STUDIO_MODE_STORAGE_KEY, nextMode);
      }
    } catch {
      // ignore storage errors
    }
  };

  const activePacks = useMemo(() => {
    return resolvePackCatalog(
      [...DEFAULT_POLICY_PACKS, ...customPacks],
      disabledPackIds,
    ).enabledCatalog;
  }, [customPacks, disabledPackIds]);

  const activeProfile =
    profiles.find((p) => p.id === activeProfileId) ?? profiles[0];

  const effectiveFacts = useMemo(() => {
    if (overrideFacts) {
      return {
        ...overrideFacts,
        workspace: {
          business_country: workspaceState.businessCountry.toUpperCase(),
          data_subject_countries: workspaceState.dataSubjectCountries.map((c) =>
            c.toUpperCase(),
          ),
          industry_domain: workspaceState.industryDomain,
        },
        transfers: buildTransfersFromWorkspace(workspaceState),
        security: workspaceState.security,
      };
    }
    return buildFactsFromWorkspace(workspaceState);
  }, [overrideFacts, workspaceState]);

  const currentResult = useMemo(() => {
    return (
      workspaceState.lastResult ??
      evaluateFacts(effectiveFacts, activePacks)
    );
  }, [workspaceState.lastResult, effectiveFacts, activePacks]);

  const persistWorkspace = (
    nextState: ProfileWorkspaceState,
    recomputeNow = false,
  ) => {
    let finalState = {
      ...nextState,
      updatedAt: new Date().toISOString(),
    };
    if (recomputeNow) {
      const nextFacts = overrideFacts
        ? {
            ...overrideFacts,
            workspace: {
              business_country: finalState.businessCountry.toUpperCase(),
              data_subject_countries: finalState.dataSubjectCountries.map((c) =>
                c.toUpperCase(),
              ),
              industry_domain: finalState.industryDomain,
            },
            transfers: buildTransfersFromWorkspace(finalState),
            security: finalState.security,
          }
        : buildFactsFromWorkspace(finalState);
      finalState = {
        ...finalState,
        lastResult: evaluateFacts(nextFacts, activePacks),
      };
    }
    setWorkspaceState(finalState);
    storageRepository.saveProfileState(finalState);
  };

  const recomputeWorkspaceWithPacks = (nextActivePacks: PolicyPackV2[]) => {
    const nextResult = evaluateFacts(effectiveFacts, nextActivePacks);
    setWorkspaceState((prev) => {
      const updated: ProfileWorkspaceState = {
        ...prev,
        lastResult: nextResult,
        updatedAt: new Date().toISOString(),
      };
      storageRepository.saveProfileState(updated);
      return updated;
    });
  };

  const handleTogglePackActive = (packId: string) => {
    const nextDisabled = disabledPackIds.includes(packId)
      ? disabledPackIds.filter((id) => id !== packId)
      : [...disabledPackIds, packId];
    storageRepository.setDisabledPackIds(nextDisabled);
    setDisabledPackIds(nextDisabled);

    const nextActive = resolvePackCatalog(
      [...DEFAULT_POLICY_PACKS, ...customPacks],
      nextDisabled,
    ).enabledCatalog;
    recomputeWorkspaceWithPacks(nextActive);
    setIsDirty(false);
    showToast(
      `${packId} 법률 팩이 ${nextDisabled.includes(packId) ? '제외(OFF)' : '자동 매칭(AUTO)'} 상태로 전환되었습니다.`,
      'info',
    );
  };

  const handleInstallCustomPack = (pack: PolicyPackV2) => {
    storageRepository.saveCustomPolicyPack(pack);
    const nextCustom = storageRepository.getCustomPolicyPacks();
    setCustomPacks(nextCustom);

    const nextDisabled = disabledPackIds.filter((id) => id !== pack.pack_meta.id);
    if (nextDisabled.length !== disabledPackIds.length) {
      storageRepository.setDisabledPackIds(nextDisabled);
      setDisabledPackIds(nextDisabled);
    }

    const nextActive = resolvePackCatalog(
      [...DEFAULT_POLICY_PACKS, ...nextCustom],
      nextDisabled,
    ).enabledCatalog;
    recomputeWorkspaceWithPacks(nextActive);
    setIsDirty(false);
    showToast(
      `${pack.pack_meta.id} (${pack.pack_meta.law_name}) 팩이 장착되었습니다.`,
      'success',
    );
  };

  const handleDeleteCustomPack = (packId: string) => {
    storageRepository.deleteCustomPolicyPack(packId);
    const nextCustom = storageRepository.getCustomPolicyPacks();
    setCustomPacks(nextCustom);

    const nextDisabled = disabledPackIds.filter((id) => id !== packId);
    if (nextDisabled.length !== disabledPackIds.length) {
      storageRepository.setDisabledPackIds(nextDisabled);
      setDisabledPackIds(nextDisabled);
    }

    const nextActive = resolvePackCatalog(
      [...DEFAULT_POLICY_PACKS, ...nextCustom],
      nextDisabled,
    ).enabledCatalog;
    recomputeWorkspaceWithPacks(nextActive);
    setIsDirty(false);
    showToast(`${packId} 확장 팩이 제거되었습니다.`, 'info');
  };

  const handleProfileChange = (profileId: string) => {
    const target = profiles.find((p) => p.id === profileId);
    if (!target) return;

    storageRepository.saveProfileState(workspaceState);
    storageRepository.setActiveProfileId(profileId);
    setActiveProfileId(profileId);
    setActiveScenarioId(null);
    setOverrideFacts(null);
    setIsDirty(false);

    const saved = storageRepository.getProfileState(profileId);
    setWorkspaceState(saved ?? buildFallbackWorkspaceState(target));
    showToast(`프로필 전환: ${target.profile_name}`, 'info');
  };

  const handleCreateProfile = (newProfile: WorkspaceProfile) => {
    storageRepository.saveProfile(newProfile);
    const freshState = buildFallbackWorkspaceState(newProfile);
    freshState.lastResult = evaluateFacts(
      buildFactsFromWorkspace(freshState),
      activePacks,
    );
    storageRepository.saveProfileState(freshState);
    storageRepository.setActiveProfileId(newProfile.id);

    setProfiles(storageRepository.getProfiles());
    setActiveProfileId(newProfile.id);
    setWorkspaceState(freshState);
    setOverrideFacts(null);
    setActiveScenarioId(null);
    setIsDirty(false);
    showToast(`새 프로필 생성 완료: ${newProfile.profile_name}`, 'success');
  };

  const handleDeleteProfile = (profileId: string) => {
    storageRepository.deleteProfile(profileId);
    const nextProfiles = storageRepository.getProfiles();
    const nextActiveId = storageRepository.getActiveProfileId();
    const nextProfile =
      nextProfiles.find((p) => p.id === nextActiveId) ?? nextProfiles[0];

    setProfiles(nextProfiles);
    setActiveProfileId(nextActiveId);
    setOverrideFacts(null);
    setActiveScenarioId(null);
    setIsDirty(false);
    setWorkspaceState(
      storageRepository.getProfileState(nextActiveId) ??
        buildFallbackWorkspaceState(nextProfile),
    );
    showToast('프로필이 삭제되었습니다.', 'info');
  };

  const handleLoadScenario = (scenarioId: string) => {
    const scenario = DEMO_SCENARIOS.find((s) => s.id === scenarioId);
    if (!scenario) return;

    const clonedFacts = cloneValue(scenario.facts);
    const scenarioRegions: string[] = [];
    if (clonedFacts.transfers.destination_countries.includes('JP')) {
      scenarioRegions.push('aws-tokyo');
    } else if (clonedFacts.workspace.business_country === 'KR') {
      scenarioRegions.push('aws-seoul');
    }

    const result = evaluateFacts(clonedFacts, activePacks);
    const nextState: ProfileWorkspaceState = {
      profileId: activeProfile.id,
      businessCountry: clonedFacts.workspace.business_country,
      dataSubjectCountries: [...clonedFacts.workspace.data_subject_countries],
      industryDomain: clonedFacts.workspace.industry_domain,
      selectedRegions: scenarioRegions,
      detectedVendors: clonedFacts.transfers.detected_vendors,
      policyText: scenario.sample_privacy_policy,
      noPolicyDoc: !clonedFacts.legal_doc.exists,
      infraCode: clonedFacts.transfers.virtual_transfer.foreign_iam_access
        ? [
            'provider "aws" {',
            '  region = "ap-northeast-2"',
            '}',
            'resource "aws_iam_role_policy" "us_hq_access" {',
            '  foreign_iam_access = true',
            '  kms_key_id = "arn:aws:kms:us-east-1:123456789012:key/hq-key"',
            '}',
          ].join('\n')
        : clonedFacts.transfers.destination_countries.includes('JP')
          ? 'provider "aws" {\n  region = "ap-northeast-1"\n}'
          : 'provider "aws" {\n  region = "ap-northeast-2"\n}',
      virtualTransfer: clonedFacts.transfers.virtual_transfer,
      security: clonedFacts.security,
      lastResult: result,
      lastEngineUsed: 'DEMO_PRESET',
      lastWarnings: [],
      updatedAt: new Date().toISOString(),
    };

    setActiveScenarioId(scenarioId);
    setOverrideFacts(clonedFacts);
    setIsDirty(false);
    setWorkspaceState(nextState);
    storageRepository.saveProfileState(nextState);

    const record: AuditHistoryRecord = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      profile_id: activeProfile.id,
      profile_name: activeProfile.profile_name,
      scenario_label: scenario.short_label,
      verdict: result.verdict,
      compliance_score: result.compliance_score,
      drift_count: result.stats.drift_count,
      blocker_count: result.stats.blocker_count,
      warning_count: result.stats.warning_count,
      applied_pack_versions: result.applied_pack_versions,
      evaluated_at: result.evaluated_at,
      facts_snapshot: clonedFacts,
      result_snapshot: result,
    };
    storageRepository.appendAuditHistory(record);
    setHistory(storageRepository.getAuditHistory());
    showToast(`데모 프리셋 로드됨: ${scenario.short_label}`, 'success');
  };

  const handleCancelInspection = useCallback(() => {
    if (!inspectionAbortRef.current) return;
    inspectionAbortRef.current.abort();
    inspectionAbortRef.current = null;
    setInspectionState({ running: false, stepIndex: 0 });
    showToast('AI 파싱 및 심사가 사용자에 의해 중지되었습니다.', 'info');
  }, [showToast]);

  const handleRunInspection = async () => {
    if (inspectionState.running) return;
    const controller = new AbortController();
    inspectionAbortRef.current = controller;
    setActiveTab('live-audit');
    setInspectionState({ running: true, stepIndex: 0 });

    try {
      const parserPromise = parseInputsToFacts(
        workspaceState.policyText,
        workspaceState.infraCode,
        workspaceState.detectedVendors,
        llmConfig,
        {
          businessCountry: workspaceState.businessCountry,
          dataSubjectCountries: workspaceState.dataSubjectCountries,
          industryDomain: workspaceState.industryDomain,
          noPolicyDoc: workspaceState.noPolicyDoc,
          infraCountries: regionIdsToCountryCodes(workspaceState.selectedRegions),
          virtualTransferOverride: workspaceState.virtualTransfer,
          securityOverride: workspaceState.security,
          signal: controller.signal,
        },
      );

      await waitMs(280);
      if (controller.signal.aborted) return;
      setInspectionState({ running: true, stepIndex: 1 });
      await waitMs(280);
      if (controller.signal.aborted) return;
      setInspectionState({ running: true, stepIndex: 2 });
      await waitMs(280);
      if (controller.signal.aborted) return;
      setInspectionState({ running: true, stepIndex: 3 });

      const parsedOutput = await parserPromise;
      if (controller.signal.aborted) return;
      await waitMs(260);
      if (controller.signal.aborted) return;

      const result = evaluateFacts(parsedOutput.parsedFacts, activePacks);
      const nextState: ProfileWorkspaceState = {
        ...workspaceState,
        lastResult: result,
        lastEngineUsed: parsedOutput.engineUsed,
        lastWarnings: parsedOutput.warnings,
        updatedAt: new Date().toISOString(),
      };

      setOverrideFacts(parsedOutput.parsedFacts);
      setWorkspaceState(nextState);
      storageRepository.saveProfileState(nextState);

      const record: AuditHistoryRecord = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        profile_id: activeProfile.id,
        profile_name: activeProfile.profile_name,
        scenario_label: `${activeProfile.profile_name} · 실시간 심사`,
        verdict: result.verdict,
        compliance_score: result.compliance_score,
        drift_count: result.stats.drift_count,
        blocker_count: result.stats.blocker_count,
        warning_count: result.stats.warning_count,
        applied_pack_versions: result.applied_pack_versions,
        evaluated_at: result.evaluated_at,
        facts_snapshot: parsedOutput.parsedFacts,
        result_snapshot: result,
      };
      storageRepository.appendAuditHistory(record);
      setHistory(storageRepository.getAuditHistory());
      setInspectionState({ running: false, stepIndex: 0 });
      setIsDirty(false);
      setInputStudioOpen(false);
      showToast(
        `출입국 심사 완료 · 판정 ${result.verdict} (충족률 ${result.stats.pass_rate_percent}% · ${result.stats.passed_rule_count}/${result.stats.total_evaluated_rules})`,
        result.verdict === 'APPROVED' ? 'success' : 'warning',
      );
      setTimeout(() => {
        reportSectionRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 80);
    } catch (err) {
      if (err instanceof LlmRequestCancelledError || controller.signal.aborted) {
        setInspectionState({ running: false, stepIndex: 0 });
        return;
      }
      setInspectionState({ running: false, stepIndex: 0 });
      const msg = err instanceof Error ? err.message : '심사 실행 중 오류가 발생했습니다.';
      showToast(msg, 'warning');
    } finally {
      if (inspectionAbortRef.current === controller) {
        inspectionAbortRef.current = null;
      }
    }
  };

  const handleUpdateWorkspaceMeta = (patch: {
    businessCountry?: string;
    dataSubjectCountries?: string[];
    industryDomain?: IndustryDomain;
  }) => {
    setIsDirty(true);
    const nextState: ProfileWorkspaceState = {
      ...workspaceState,
      businessCountry: patch.businessCountry ?? workspaceState.businessCountry,
      dataSubjectCountries:
        patch.dataSubjectCountries ?? workspaceState.dataSubjectCountries,
      industryDomain: patch.industryDomain ?? workspaceState.industryDomain,
    };
    persistWorkspace(nextState, true);
    if (activeProfile) {
      const updatedProfile: WorkspaceProfile = {
        ...activeProfile,
        business_country: nextState.businessCountry,
        data_subject_countries: nextState.dataSubjectCountries,
        industry_domain: nextState.industryDomain,
        updated_at: new Date().toISOString(),
      };
      storageRepository.saveProfile(updatedProfile);
      setProfiles(storageRepository.getProfiles());
    }
  };

  const handleToggleRegion = (regionId: string) => {
    setOverrideFacts(null);
    setIsDirty(true);
    const exists = workspaceState.selectedRegions.includes(regionId);
    const nextRegions = exists
      ? workspaceState.selectedRegions.filter((id) => id !== regionId)
      : [...workspaceState.selectedRegions, regionId];
    persistWorkspace({ ...workspaceState, selectedRegions: nextRegions }, true);
  };

  const handleToggleSaasPreset = (sdk: string) => {
    setOverrideFacts(null);
    setIsDirty(true);
    const exists = workspaceState.detectedVendors.some((v) => v.sdk === sdk);
    let nextVendors: DetectedVendor[];
    if (exists) {
      nextVendors = workspaceState.detectedVendors.filter((v) => v.sdk !== sdk);
    } else {
      const built = buildVendorFromSdk(sdk);
      if (!built) return;
      nextVendors = [...workspaceState.detectedVendors, built];
    }
    persistWorkspace({ ...workspaceState, detectedVendors: nextVendors }, true);
  };

  const handleApplyScannedVendors = (
    scannedVendors: DetectedVendor[],
    scannedRegions: string[],
  ) => {
    setOverrideFacts(null);
    setIsDirty(true);
    const mergedRegions = Array.from(
      new Set([...workspaceState.selectedRegions, ...scannedRegions]),
    );
    persistWorkspace(
      {
        ...workspaceState,
        detectedVendors: scannedVendors,
        selectedRegions: mergedRegions,
      },
      true,
    );
  };

  const handleToggleVendorPii = (sdk: string) => {
    setIsDirty(true);
    const nextVendors = workspaceState.detectedVendors.map((v) => {
      if (v.sdk !== sdk) return v;
      const current = (v.includes_pii ?? v.sends_pii) !== false;
      const nextPii = !current;
      return { ...v, includes_pii: nextPii, sends_pii: undefined };
    });
    persistWorkspace({ ...workspaceState, detectedVendors: nextVendors }, true);
  };

  const handleChangeVendorPurpose = (sdk: string, purpose: TransferPurpose) => {
    setIsDirty(true);
    const nextVendors = workspaceState.detectedVendors.map((v) =>
      v.sdk === sdk ? { ...v, transfer_purpose: purpose } : v,
    );
    persistWorkspace({ ...workspaceState, detectedVendors: nextVendors }, true);
  };

  const handleChangeVendorResidency = (sdk: string, residencyCountry: string) => {
    const normalized = residencyCountry.trim().toUpperCase();
    if (!normalized) return;
    setIsDirty(true);
    const nextVendors = workspaceState.detectedVendors.map((v) => {
      if (v.sdk !== sdk) return v;
      const defaultCountry = (v.default_country || v.country || 'US').toUpperCase();
      return {
        ...v,
        default_country: defaultCountry,
        data_residency_country: normalized,
        country: normalized,
      };
    });
    persistWorkspace({ ...workspaceState, detectedVendors: nextVendors }, true);
  };

  const handleRemoveVendor = (sdk: string) => {
    setIsDirty(true);
    const nextVendors = workspaceState.detectedVendors.filter(
      (v) => v.sdk !== sdk,
    );
    persistWorkspace({ ...workspaceState, detectedVendors: nextVendors }, true);
  };

  const handleChangePolicyText = (text: string) => {
    setOverrideFacts(null);
    setIsDirty(true);
    persistWorkspace({ ...workspaceState, policyText: text }, false);
  };

  const handleToggleNoPolicyDoc = (val: boolean) => {
    setOverrideFacts(null);
    setIsDirty(true);
    persistWorkspace({ ...workspaceState, noPolicyDoc: val }, false);
  };

  const handleChangeInfraCode = (code: string) => {
    setOverrideFacts(null);
    setIsDirty(true);
    persistWorkspace({ ...workspaceState, infraCode: code }, false);
  };

  const handleChangeVirtualTransfer = (patch: Partial<VirtualTransferFacts>) => {
    setIsDirty(true);
    persistWorkspace(
      {
        ...workspaceState,
        virtualTransfer: {
          ...workspaceState.virtualTransfer,
          ...patch,
        },
      },
      true,
    );
  };

  const handleChangeSecurity = (
    patch: Partial<CanonicalFactModel['security']>,
  ) => {
    setIsDirty(true);
    persistWorkspace(
      {
        ...workspaceState,
        security: { ...workspaceState.security, ...patch },
      },
      true,
    );
  };

  const handleRestoreHistoryRecord = (record: AuditHistoryRecord) => {
    const targetProfile = profiles.find((p) => p.id === record.profile_id);
    if (targetProfile) {
      storageRepository.setActiveProfileId(targetProfile.id);
      setActiveProfileId(targetProfile.id);
    }
    setOverrideFacts(cloneValue(record.facts_snapshot));
    setIsDirty(false);
    setWorkspaceState((prev) => ({
      ...prev,
      profileId: record.profile_id,
      businessCountry: record.facts_snapshot.workspace.business_country,
      dataSubjectCountries: [
        ...record.facts_snapshot.workspace.data_subject_countries,
      ],
      industryDomain: record.facts_snapshot.workspace.industry_domain,
      detectedVendors: cloneValue(
        record.facts_snapshot.transfers.detected_vendors,
      ),
      virtualTransfer: cloneValue(
        record.facts_snapshot.transfers.virtual_transfer,
      ),
      security: cloneValue(record.facts_snapshot.security),
      lastResult: record.result_snapshot,
    }));
    setActiveTab('live-audit');
    showToast(`이력 스냅샷 복원됨: ${record.scenario_label}`, 'info');
  };

  const handleDeleteHistoryRecord = (recordId: string) => {
    storageRepository.deleteAuditHistoryRecord(recordId);
    setHistory(storageRepository.getAuditHistory());
    showToast('평가 이력이 삭제되었습니다.', 'info');
  };

  const activeScenario =
    DEMO_SCENARIOS.find((s) => s.id === activeScenarioId) ?? DEMO_SCENARIOS[0];

  return (
    <>
      <AppShell
        activeTab={activeTab}
        onTabChange={setActiveTab}
        profiles={profiles}
        activeProfileId={activeProfileId}
        onProfileChange={handleProfileChange}
        onOpenNewProfileModal={() => setProfileModalOpen(true)}
        onDeleteProfile={handleDeleteProfile}
        llmConfig={llmConfig}
        onOpenLlmSettings={() => setLlmModalOpen(true)}
        onRunAudit={handleRunInspection}
        onCancelAudit={handleCancelInspection}
        isAuditing={inspectionState.running}
        isDirty={isDirty}
      >
        {activeTab === 'live-audit' && (
          <div className="space-y-6">
            {/* Independent Always-Visible Quick Demo Preset Bar */}
            <section
              aria-label="시연용 원클릭 데모 프리셋"
              className="no-print rounded-xl border border-slate-800 bg-[#0B1120] px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3"
            >
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Play className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="font-semibold text-slate-100">
                  원클릭 데모 시나리오
                </span>
                <span className="hidden sm:inline text-slate-400">
                  · 입력창이 접혀 있어도 클릭 한 번으로 즉시 결과를 비교할 수 있습니다
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {DEMO_SCENARIOS.map((sc) => {
                  const isSelected = sc.id === activeScenarioId;
                  return (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => handleLoadScenario(sc.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        isSelected
                          ? 'bg-sky-500 text-slate-950 font-semibold'
                          : 'bg-[#060913] text-slate-300 border border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {sc.short_label}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Collapsible Input Studio + Beginner/Pro Mode Segmented Switch */}
            <div className="no-print rounded-xl border border-slate-800 bg-[#0B1120] overflow-hidden">
              <div className="px-5 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {studioMode === 'guided' ? (
                    <Compass className="w-4 h-4 text-sky-400 shrink-0" />
                  ) : (
                    <SlidersHorizontal className="w-4 h-4 text-sky-400 shrink-0" />
                  )}
                  <span className="font-display text-sm font-semibold text-slate-100 truncate">
                    {studioMode === 'guided'
                      ? '초보자 가이드 모드 (Step-by-Step)'
                      : '전문가 자유 모드 (Pro Studio)'}
                  </span>
                  <span className="hidden sm:inline font-mono text-xs text-slate-400 tabular-nums whitespace-nowrap">
                    · SDK {workspaceState.detectedVendors.length}종 · 리전{' '}
                    {workspaceState.selectedRegions.length}개
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2.5 shrink-0">
                  {/* Guided <-> Pro Segmented Switch */}
                  <div
                    role="group"
                    aria-label="입력 모드 전환"
                    className="flex items-center gap-1 p-1 rounded-lg bg-[#060913] border border-slate-800"
                  >
                    <button
                      type="button"
                      onClick={() => handleChangeStudioMode('guided')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                        studioMode === 'guided'
                          ? 'bg-sky-500 text-slate-950 font-semibold'
                          : 'text-slate-300 hover:text-slate-100'
                      }`}
                    >
                      초보자 가이드 모드 (Step-by-Step)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChangeStudioMode('pro')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                        studioMode === 'pro'
                          ? 'bg-sky-500 text-slate-950 font-semibold'
                          : 'text-slate-300 hover:text-slate-100'
                      }`}
                    >
                      전문가 자유 모드 (Pro Studio)
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setInputStudioOpen((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-[#060913] hover:border-slate-700 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                  >
                    <span>{inputStudioOpen ? '입력창 접기' : '입력 수정하기'}</span>
                    {inputStudioOpen ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {inputStudioOpen && (
                <div className="p-5 pt-4 border-t border-slate-800">
                  {studioMode === 'guided' ? (
                    <GuidedAuditWizard
                      businessCountry={workspaceState.businessCountry}
                      dataSubjectCountries={workspaceState.dataSubjectCountries}
                      industryDomain={workspaceState.industryDomain}
                      selectedRegions={workspaceState.selectedRegions}
                      detectedVendors={workspaceState.detectedVendors}
                      policyText={workspaceState.policyText}
                      noPolicyDoc={workspaceState.noPolicyDoc}
                      infraCode={workspaceState.infraCode}
                      virtualTransfer={workspaceState.virtualTransfer}
                      security={workspaceState.security}
                      activePacks={activePacks}
                      inspectionState={inspectionState}
                      onUpdateWorkspaceMeta={handleUpdateWorkspaceMeta}
                      onToggleRegion={handleToggleRegion}
                      onToggleSaasPreset={handleToggleSaasPreset}
                      onApplyScannedVendors={handleApplyScannedVendors}
                      onToggleVendorPii={handleToggleVendorPii}
                      onChangeVendorPurpose={handleChangeVendorPurpose}
                      onChangeVendorResidency={handleChangeVendorResidency}
                      onRemoveVendor={handleRemoveVendor}
                      onChangePolicyText={handleChangePolicyText}
                      onToggleNoPolicyDoc={handleToggleNoPolicyDoc}
                      onChangeInfraCode={handleChangeInfraCode}
                      onChangeVirtualTransfer={handleChangeVirtualTransfer}
                      onChangeSecurity={handleChangeSecurity}
                      onRunInspection={handleRunInspection}
                      onCancelInspection={handleCancelInspection}
                      onShowToast={showToast}
                    />
                  ) : (
                    <InputStudio
                      businessCountry={workspaceState.businessCountry}
                      dataSubjectCountries={workspaceState.dataSubjectCountries}
                      industryDomain={workspaceState.industryDomain}
                      selectedRegions={workspaceState.selectedRegions}
                      detectedVendors={workspaceState.detectedVendors}
                      policyText={workspaceState.policyText}
                      noPolicyDoc={workspaceState.noPolicyDoc}
                      infraCode={workspaceState.infraCode}
                      virtualTransfer={workspaceState.virtualTransfer}
                      security={workspaceState.security}
                      scenarios={DEMO_SCENARIOS}
                      activeScenarioId={activeScenarioId}
                      inspectionState={inspectionState}
                      hideScenarioBar
                      onUpdateWorkspaceMeta={handleUpdateWorkspaceMeta}
                      onToggleRegion={handleToggleRegion}
                      onToggleSaasPreset={handleToggleSaasPreset}
                      onApplyScannedVendors={handleApplyScannedVendors}
                      onToggleVendorPii={handleToggleVendorPii}
                      onChangeVendorPurpose={handleChangeVendorPurpose}
                      onChangeVendorResidency={handleChangeVendorResidency}
                      onRemoveVendor={handleRemoveVendor}
                      onChangePolicyText={handleChangePolicyText}
                      onToggleNoPolicyDoc={handleToggleNoPolicyDoc}
                      onChangeInfraCode={handleChangeInfraCode}
                      onChangeVirtualTransfer={handleChangeVirtualTransfer}
                      onChangeSecurity={handleChangeSecurity}
                      onLoadScenario={handleLoadScenario}
                      onRunInspection={handleRunInspection}
                      onCancelInspection={handleCancelInspection}
                      onShowToast={showToast}
                    />
                  )}
                </div>
              )}
            </div>

            {inspectionState.running && (
              <div
                role="status"
                className="no-print rounded-xl border border-sky-500/40 bg-sky-950/25 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 text-xs text-sky-100">
                  <Loader2 className="w-4 h-4 animate-spin text-sky-400 shrink-0" />
                  <span>
                    <strong className="font-semibold">
                      {llmConfig.provider === 'LOCAL_OPENAI_COMPAT'
                        ? `로컬 LLM(${llmConfig.modelName || 'Local'}) 응답 대기 및 심사 진행 중`
                        : 'AI 파싱 및 4계층 법률 심사 진행 중'}
                    </strong>
                    <span className="text-sky-300/80 ml-2">
                      시간 제한 없이 응답을 기다립니다. 필요 시 우측 버튼으로 즉시 중지할 수 있습니다.
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCancelInspection}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>응답 중지</span>
                </button>
              </div>
            )}

            {/* Phase 3 Full Enterprise Compliance Report Dashboard */}
            <div ref={reportSectionRef} className="space-y-6 scroll-mt-20">
              <div className="no-print">
                <DriftComparisonCard facts={effectiveFacts} result={currentResult} />
              </div>

              <AuditReportPanel
                scenarioTitle={
                  activeScenarioId
                    ? activeScenario.title
                    : activeProfile?.profile_name ?? '현재 워크스페이스'
                }
                facts={effectiveFacts}
                result={currentResult}
                activePacks={activePacks}
                lastEngineUsed={workspaceState.lastEngineUsed}
                parserWarnings={workspaceState.lastWarnings}
                isDirty={isDirty}
                onRunAudit={handleRunInspection}
              />

              <div className="no-print">
                <BorderTopologyMap
                  facts={effectiveFacts}
                  result={currentResult}
                  selectedRegionIds={workspaceState.selectedRegions}
                />
              </div>

              <div className="no-print">
                <DualRemediationKit
                  facts={effectiveFacts}
                  result={currentResult}
                  activePacks={activePacks}
                  onShowToast={showToast}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'cicd-gate' && (
          <CicdGateTab activePacks={activePacks} onShowToast={showToast} />
        )}

        {activeTab === 'policy-packs' && (
          <PolicyPacksTab
            builtInPacks={DEFAULT_POLICY_PACKS}
            customPacks={customPacks}
            disabledPackIds={disabledPackIds}
            onTogglePackActive={handleTogglePackActive}
            onInstallCustomPack={handleInstallCustomPack}
            onDeleteCustomPack={handleDeleteCustomPack}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'audit-history' && (
          <AuditHistoryTab
            activeProfile={activeProfile}
            history={history}
            onRestoreToStudio={handleRestoreHistoryRecord}
            onDeleteRecord={handleDeleteHistoryRecord}
          />
        )}

        <LlmSettingsModal
          open={llmModalOpen}
          config={llmConfig}
          onClose={() => setLlmModalOpen(false)}
          onSave={(nextConfig) => {
            storageRepository.saveLlmConfig(nextConfig);
            setLlmConfig(nextConfig);
            showToast(
              `AI 엔진 설정 저장됨 (${
                nextConfig.provider === 'GEMINI_CLOUD'
                  ? 'Gemini Cloud'
                  : 'Local LLM'
              })`,
              'success',
            );
          }}
        />

        <ProfileModal
          open={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          onCreate={handleCreateProfile}
        />
      </AppShell>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
