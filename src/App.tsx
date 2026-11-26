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
  applyLegalDocOverrides,
  extractHeuristicPayload,
  parseInputsToFacts,
} from '@/lib/llm-parser';
import { resolvePackCatalog } from '@/lib/pack-loader';
import {
  computeEffectiveHasCrossBorder,
  evaluateFacts,
} from '@/lib/rule-evaluator';
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
  ManualLegalDocToggleKey,
  PolicyPackV2,
  TransferPurpose,
  VirtualTransferFacts,
  WorkspaceProfile,
} from '@/lib/types';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Loader2,
  SlidersHorizontal,
  Square,
  X,
} from 'lucide-react';
import { AppShell, type MainTabId } from './components/AppShell';
import { AuditHistoryTab } from './components/AuditHistoryTab';
import { AuditReportPanel } from './components/AuditReportPanel';
import { BorderTopologyMap } from './components/BorderTopologyMap';
import { CicdGateTab } from './components/CicdGateTab';
import { DriftComparisonCard } from './components/DriftComparisonCard';
import { DualRemediationKit } from './components/DualRemediationKit';
import { GuidedAuditWizard } from './components/GuidedAuditWizard';
import type { InspectionStageState } from './components/InputStudio';
import { LlmSettingsModal } from './components/LlmSettingsModal';
import { PolicyPacksTab } from './components/PolicyPacksTab';
import { ProfileModal } from './components/ProfileModal';
import { ScenarioDropdown } from './components/ScenarioDropdown';
import {
  ToastContainer,
  type ToastItem,
  type ToastVariant,
} from './components/Toast';

type ReportTabId = 'overview' | 'audit' | 'remediation';

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
    hasSeparateConsentUi: false,
    manualLegalDocOverrides: {},
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

  const infraCountries = Array.from(
    new Set(
      [...regionCountries, ...(heuristic.infra_countries ?? [])]
        .map((c) => c.toUpperCase())
        .filter((c) => c.length > 0 && c !== businessCountry),
    ),
  );

  const destinationCountries = Array.from(
    new Set(
      [
        ...infraCountries,
        ...activeVendors.map((v) => v.data_residency_country),
      ]
        .map((c) => c.toUpperCase())
        .filter((c) => c.length > 0 && c !== businessCountry),
    ),
  );

  const hasCrossBorder = computeEffectiveHasCrossBorder(
    destinationCountries,
    activeVendors,
    businessCountry,
    state.virtualTransfer,
  );

  return {
    has_cross_border: hasCrossBorder,
    destination_countries: destinationCountries,
    infra_countries: infraCountries,
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

  const rawLegalDoc: CanonicalFactModel['legal_doc'] = {
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
    has_ai_service_notice: heuristic.legal_doc?.has_ai_service_notice ?? false,
    has_ai_output_label_notice:
      heuristic.legal_doc?.has_ai_output_label_notice ?? false,
    has_do_not_sell_or_share_notice:
      heuristic.legal_doc?.has_do_not_sell_or_share_notice ?? false,
  };

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
    legal_doc: applyLegalDocOverrides(rawLegalDoc, {
      noPolicyDoc: state.noPolicyDoc,
      hasSeparateConsentUi: state.hasSeparateConsentUi,
      manualLegalDocOverrides: state.manualLegalDocOverrides,
    }),
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
  const [inputStudioOpen, setInputStudioOpen] = useState(true);
  const [reportTab, setReportTab] = useState<ReportTabId>('overview');
  const [isDirty, setIsDirty] = useState(false);
  const [scanPulseKey, setScanPulseKey] = useState(0);
  const [showLaserScan, setShowLaserScan] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [inspectionState, setInspectionState] = useState<InspectionStageState>({
    running: false,
    stepIndex: 0,
  });

  const reportSectionRef = useRef<HTMLDivElement | null>(null);
  const inspectionAbortRef = useRef<AbortController | null>(null);
  const laserTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      if (laserTimerRef.current) {
        clearTimeout(laserTimerRef.current);
      }
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
        legal_doc: applyLegalDocOverrides(overrideFacts.legal_doc, {
          noPolicyDoc: workspaceState.noPolicyDoc,
          hasSeparateConsentUi: workspaceState.hasSeparateConsentUi,
          manualLegalDocOverrides: workspaceState.manualLegalDocOverrides,
        }),
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
    forceRebuildFacts = false,
  ) => {
    let finalState = {
      ...nextState,
      updatedAt: new Date().toISOString(),
    };
    if (recomputeNow) {
      const nextFacts =
        overrideFacts && !forceRebuildFacts
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
              legal_doc: applyLegalDocOverrides(overrideFacts.legal_doc, {
                noPolicyDoc: finalState.noPolicyDoc,
                hasSeparateConsentUi: finalState.hasSeparateConsentUi,
                manualLegalDocOverrides: finalState.manualLegalDocOverrides,
              }),
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
    const scenarioRegions: string[] =
      scenario.selected_regions && scenario.selected_regions.length > 0
        ? [...scenario.selected_regions]
        : [];

    if (scenarioRegions.length === 0) {
      if (clonedFacts.transfers.destination_countries.includes('JP')) {
        scenarioRegions.push('aws-tokyo');
      }
      if (clonedFacts.transfers.destination_countries.includes('US')) {
        scenarioRegions.push('aws-virginia');
      }
      if (
        clonedFacts.transfers.destination_countries.includes('KR') ||
        clonedFacts.workspace.business_country === 'KR'
      ) {
        scenarioRegions.push('aws-seoul');
      }
      if (scenarioRegions.length === 0) {
        scenarioRegions.push('aws-seoul');
      }
    }

    let resolvedInfraCode = scenario.sample_infra_code ?? '';
    if (!resolvedInfraCode) {
      const infraLines: string[] = [];
      if (clonedFacts.transfers.destination_countries.includes('US')) {
        infraLines.push('provider "aws" {', '  region = "us-east-1"', '}');
      } else if (clonedFacts.transfers.destination_countries.includes('JP')) {
        infraLines.push('provider "aws" {', '  region = "ap-northeast-1"', '}');
      } else {
        infraLines.push('provider "aws" {', '  region = "ap-northeast-2"', '}');
      }
      if (
        clonedFacts.transfers.virtual_transfer.foreign_iam_access ||
        clonedFacts.transfers.virtual_transfer.foreign_kms_control
      ) {
        infraLines.push(
          'resource "aws_iam_role_policy" "us_hq_access" {',
          `  foreign_iam_access = ${clonedFacts.transfers.virtual_transfer.foreign_iam_access}`,
          clonedFacts.transfers.virtual_transfer.foreign_kms_control
            ? '  kms_key_id = "arn:aws:kms:us-east-1:123456789012:key/hq-key"'
            : '  kms_key_id = "arn:aws:kms:ap-northeast-2:123456789012:key/local-key"',
          '}',
        );
      }
      if (!clonedFacts.security.encryption_in_transit || !clonedFacts.security.encryption_at_rest) {
        infraLines.push(
          '# Security check flags',
          `# encryption_in_transit=${clonedFacts.security.encryption_in_transit}`,
          `# encryption_at_rest=${clonedFacts.security.encryption_at_rest}`,
        );
      }
      resolvedInfraCode = infraLines.join('\n');
    }

    const hasSeparateConsentUi = Boolean(scenario.has_separate_consent_ui);
    const manualLegalDocOverrides = scenario.manual_legal_doc_overrides
      ? { ...scenario.manual_legal_doc_overrides }
      : {};

    const result = evaluateFacts(clonedFacts, activePacks);
    const nextState: ProfileWorkspaceState = {
      profileId: activeProfile.id,
      businessCountry: clonedFacts.workspace.business_country,
      dataSubjectCountries: [...clonedFacts.workspace.data_subject_countries],
      industryDomain: clonedFacts.workspace.industry_domain,
      selectedRegions: Array.from(new Set(scenarioRegions)),
      detectedVendors: clonedFacts.transfers.detected_vendors,
      policyText: scenario.sample_privacy_policy,
      noPolicyDoc: !clonedFacts.legal_doc.exists,
      infraCode: resolvedInfraCode,
      virtualTransfer: clonedFacts.transfers.virtual_transfer,
      security: clonedFacts.security,
      hasSeparateConsentUi,
      manualLegalDocOverrides,
      lastResult: result,
      lastEngineUsed: 'DEMO_PRESET',
      lastWarnings: [],
      updatedAt: new Date().toISOString(),
    };

    setActiveScenarioId(scenarioId);
    setOverrideFacts(clonedFacts);
    setIsDirty(false);
    setWorkspaceState(nextState);
    if (scenario.expected_verdict_hint === 'CUSTOM') {
      setInputStudioOpen(true);
    }
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
      input_snapshot: {
        policyText: nextState.policyText,
        noPolicyDoc: nextState.noPolicyDoc,
        infraCode: nextState.infraCode,
        selectedRegions: [...nextState.selectedRegions],
        hasSeparateConsentUi,
        manualLegalDocOverrides: { ...manualLegalDocOverrides },
      },
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
    if (laserTimerRef.current) {
      clearTimeout(laserTimerRef.current);
    }
    setScanPulseKey((prev) => prev + 1);
    setShowLaserScan(true);
    laserTimerRef.current = setTimeout(() => {
      setShowLaserScan(false);
      laserTimerRef.current = null;
    }, 640);

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
          hasSeparateConsentUi: workspaceState.hasSeparateConsentUi,
          manualLegalDocOverrides: workspaceState.manualLegalDocOverrides,
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
        input_snapshot: {
          policyText: nextState.policyText,
          noPolicyDoc: nextState.noPolicyDoc,
          infraCode: nextState.infraCode,
          selectedRegions: [...nextState.selectedRegions],
          hasSeparateConsentUi: Boolean(nextState.hasSeparateConsentUi),
          manualLegalDocOverrides: {
            ...(nextState.manualLegalDocOverrides ?? {}),
          },
        },
      };
      storageRepository.appendAuditHistory(record);
      setHistory(storageRepository.getAuditHistory());
      setInspectionState({ running: false, stepIndex: 0 });
      setIsDirty(false);
      setInputStudioOpen(false);
      setReportTab('overview');
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
    const exists = workspaceState.selectedRegions.includes(regionId);
    const nextRegions = exists
      ? workspaceState.selectedRegions.filter((id) => id !== regionId)
      : [...workspaceState.selectedRegions, regionId];
    persistWorkspace({ ...workspaceState, selectedRegions: nextRegions }, true);
  };

  const handleToggleSaasPreset = (sdk: string) => {
    setOverrideFacts(null);
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
    const mergedRegions = Array.from(
      new Set([...workspaceState.selectedRegions, ...scannedRegions]),
    );
    const existingBySdk = new Map(
      workspaceState.detectedVendors.map((v) => [v.sdk, v]),
    );
    const mergedVendors: DetectedVendor[] = [...workspaceState.detectedVendors];
    for (const scanned of scannedVendors) {
      if (!existingBySdk.has(scanned.sdk)) {
        mergedVendors.push(scanned);
        existingBySdk.set(scanned.sdk, scanned);
      }
    }
    persistWorkspace(
      {
        ...workspaceState,
        detectedVendors: mergedVendors,
        selectedRegions: mergedRegions,
      },
      true,
    );
  };

  const handleToggleVendorPii = (sdk: string) => {
    const nextVendors = workspaceState.detectedVendors.map((v) => {
      if (v.sdk !== sdk) return v;
      const current = (v.includes_pii ?? v.sends_pii) !== false;
      const nextPii = !current;
      return { ...v, includes_pii: nextPii, sends_pii: undefined };
    });
    persistWorkspace({ ...workspaceState, detectedVendors: nextVendors }, true);
  };

  const handleChangeVendorPurpose = (sdk: string, purpose: TransferPurpose) => {
    const nextVendors = workspaceState.detectedVendors.map((v) =>
      v.sdk === sdk ? { ...v, transfer_purpose: purpose } : v,
    );
    persistWorkspace({ ...workspaceState, detectedVendors: nextVendors }, true);
  };

  const handleChangeVendorResidency = (sdk: string, residencyCountry: string) => {
    const normalized = residencyCountry.trim().toUpperCase();
    if (!normalized) return;
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
    persistWorkspace(
      {
        ...workspaceState,
        security: { ...workspaceState.security, ...patch },
      },
      true,
    );
  };

  const handleChangeHasSeparateConsentUi = (val: boolean) => {
    setOverrideFacts(null);
    setIsDirty(true);
    persistWorkspace(
      {
        ...workspaceState,
        hasSeparateConsentUi: val,
      },
      true,
      true,
    );
  };

  const handleToggleManualLegalDocOverride = (
    key: ManualLegalDocToggleKey,
    nextVal: boolean | undefined,
  ) => {
    setOverrideFacts(null);
    setIsDirty(true);
    const nextOverrides = { ...(workspaceState.manualLegalDocOverrides ?? {}) };
    if (nextVal === undefined) {
      delete nextOverrides[key];
    } else {
      nextOverrides[key] = nextVal;
    }
    persistWorkspace(
      {
        ...workspaceState,
        manualLegalDocOverrides: nextOverrides,
      },
      true,
      true,
    );
  };

  const handleResetManualLegalDocOverrides = () => {
    setOverrideFacts(null);
    setIsDirty(true);
    persistWorkspace(
      {
        ...workspaceState,
        manualLegalDocOverrides: {},
      },
      true,
      true,
    );
    showToast('수동 보정 항목이 자동 분석 결과로 초기화되었습니다.', 'info');
  };

  const handleRestoreHistoryRecord = (record: AuditHistoryRecord) => {
    const targetProfile = profiles.find((p) => p.id === record.profile_id);
    if (targetProfile) {
      storageRepository.setActiveProfileId(targetProfile.id);
      setActiveProfileId(targetProfile.id);
    }

    const snapshot = record.input_snapshot;
    const derivedRegions = (() => {
      if (snapshot?.selectedRegions?.length) {
        return [...snapshot.selectedRegions];
      }
      const next: string[] = [];
      if (record.facts_snapshot.transfers.destination_countries.includes('JP')) {
        next.push('aws-tokyo');
      }
      if (record.facts_snapshot.transfers.destination_countries.includes('US')) {
        next.push('aws-virginia');
      }
      if (
        record.facts_snapshot.workspace.business_country === 'KR' ||
        next.length === 0
      ) {
        next.push('aws-seoul');
      }
      return Array.from(new Set(next));
    })();

    const nextState: ProfileWorkspaceState = {
      ...workspaceState,
      profileId: record.profile_id,
      businessCountry: record.facts_snapshot.workspace.business_country,
      dataSubjectCountries: [
        ...record.facts_snapshot.workspace.data_subject_countries,
      ],
      industryDomain: record.facts_snapshot.workspace.industry_domain,
      selectedRegions: derivedRegions,
      detectedVendors: cloneValue(
        record.facts_snapshot.transfers.detected_vendors,
      ),
      policyText:
        snapshot?.policyText ??
        (record.facts_snapshot.legal_doc.exists
          ? workspaceState.policyText
          : ''),
      noPolicyDoc:
        snapshot?.noPolicyDoc ?? !record.facts_snapshot.legal_doc.exists,
      infraCode: snapshot?.infraCode ?? workspaceState.infraCode,
      virtualTransfer: cloneValue(
        record.facts_snapshot.transfers.virtual_transfer,
      ),
      security: cloneValue(record.facts_snapshot.security),
      hasSeparateConsentUi: snapshot?.hasSeparateConsentUi ?? false,
      manualLegalDocOverrides: snapshot?.manualLegalDocOverrides
        ? { ...snapshot.manualLegalDocOverrides }
        : {},
      lastResult: record.result_snapshot,
      updatedAt: new Date().toISOString(),
    };

    setOverrideFacts(cloneValue(record.facts_snapshot));
    setActiveScenarioId(null);
    setIsDirty(false);
    setWorkspaceState(nextState);
    storageRepository.saveProfileState(nextState);
    setActiveTab('live-audit');
    showToast(`이력 스냅샷 복원됨: ${record.scenario_label}`, 'info');
  };

  const handleApplyLegalDraft = (markdownDraft: string) => {
    setOverrideFacts(null);
    const trimmedExisting = workspaceState.policyText.trim();
    const marker = '### 제○조 (개인정보의 국외 이전에 관한 사항)';
    let nextPolicyText = markdownDraft;
    if (trimmedExisting.length > 0) {
      const markerIdx = trimmedExisting.indexOf(marker);
      if (markerIdx >= 0) {
        nextPolicyText = `${trimmedExisting.slice(0, markerIdx).trimEnd()}\n\n${markdownDraft}`.trim();
      } else {
        nextPolicyText = `${trimmedExisting}\n\n${markdownDraft}`;
      }
    }

    const nextState: ProfileWorkspaceState = {
      ...workspaceState,
      policyText: nextPolicyText,
      noPolicyDoc: false,
      lastEngineUsed: 'HEURISTIC_FALLBACK',
    };
    const nextFacts = buildFactsFromWorkspace(nextState);
    const finalState: ProfileWorkspaceState = {
      ...nextState,
      lastResult: evaluateFacts(nextFacts, activePacks),
      updatedAt: new Date().toISOString(),
    };
    setWorkspaceState(finalState);
    storageRepository.saveProfileState(finalState);
    setIsDirty(false);
    showToast(
      '개정 처리방침 초안이 워크스페이스에 반영되어 재심사되었습니다.',
      'success',
    );
  };

  const handleApplySecurityFixes = () => {
    setOverrideFacts(null);
    const nextVendors = workspaceState.detectedVendors.map((v) =>
      v.category === 'AI' ? { ...v, zero_data_retention: true } : v,
    );
    const nextState: ProfileWorkspaceState = {
      ...workspaceState,
      detectedVendors: nextVendors,
      security: {
        encryption_in_transit: true,
        encryption_at_rest: true,
        pii_masked_before_transfer: true,
      },
    };
    const nextFacts = buildFactsFromWorkspace(nextState);
    const finalState: ProfileWorkspaceState = {
      ...nextState,
      lastResult: evaluateFacts(nextFacts, activePacks),
      updatedAt: new Date().toISOString(),
    };
    setWorkspaceState(finalState);
    storageRepository.saveProfileState(finalState);
    setIsDirty(false);
    showToast(
      '전송·저장 암호화, PII 마스킹 및 AI ZDR 설정이 워크스페이스에 반영되었습니다.',
      'success',
    );
  };

  const handleWorkspaceBackupImported = () => {
    const nextProfiles = storageRepository.getProfiles();
    const nextActiveId = storageRepository.getActiveProfileId();
    const fallbackProfile =
      nextProfiles.find((p) => p.id === nextActiveId) ?? nextProfiles[0];
    setProfiles(nextProfiles);
    setActiveProfileId(nextActiveId);
    setWorkspaceState(
      storageRepository.getProfileState(nextActiveId) ??
        buildFallbackWorkspaceState(fallbackProfile),
    );
    setHistory(storageRepository.getAuditHistory());
    setCustomPacks(storageRepository.getCustomPolicyPacks());
    setDisabledPackIds(storageRepository.getDisabledPackIds());
    setLlmConfig(storageRepository.getLlmConfig());
    setOverrideFacts(null);
    setActiveScenarioId(null);
    setIsDirty(false);
  };

  const handleDeleteHistoryRecord = (recordId: string) => {
    storageRepository.deleteAuditHistoryRecord(recordId);
    setHistory(storageRepository.getAuditHistory());
    showToast('평가 이력이 삭제되었습니다.', 'info');
  };

  const activeScenario =
    DEMO_SCENARIOS.find((s) => s.id === activeScenarioId) ?? null;

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
        compliancePosture={{
          complianceScore:
            currentResult.stats.pass_rate_percent ??
            currentResult.compliance_score ??
            100,
          verdict: currentResult.verdict,
          blockerCount: currentResult.stats.blocker_count,
          driftCount: currentResult.stats.drift_count,
          activePackCount: currentResult.applied_pack_versions.filter(
            (p) => p.applicable,
          ).length,
          totalPackCount:
            currentResult.applied_pack_versions.length || activePacks.length,
        }}
      >
        {activeTab === 'live-audit' && (
          <div key="tab-live-audit" className="space-y-6 animate-panel-enter">
            {/* Progressive Disclosure: 1-line Glassmorphic Summary Bar when collapsed, Obsidian Configuration Wizard when open */}
            {!inputStudioOpen ? (
              <div className="no-print rounded-xl bg-white/[0.03] backdrop-blur-md border border-white/[0.08] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0 text-xs">
                  <SlidersHorizontal className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="font-display font-semibold text-zinc-100 whitespace-nowrap">
                    심사 대상 설정 (Audit Configuration)
                  </span>
                  <span className="text-zinc-600">·</span>
                  <span className="font-mono text-[11px] text-zinc-400 truncate tabular-nums">
                    {workspaceState.businessCountry} · 대상{' '}
                    {workspaceState.dataSubjectCountries.join(', ')} · SDK{' '}
                    {workspaceState.detectedVendors.length}종 · 리전{' '}
                    {workspaceState.selectedRegions.length}개 · 처리방침{' '}
                    {workspaceState.noPolicyDoc
                      ? '없음'
                      : workspaceState.policyText.trim().length > 0
                        ? `${workspaceState.policyText.trim().length}자`
                        : '미입력'}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <ScenarioDropdown
                    scenarios={DEMO_SCENARIOS}
                    activeScenarioId={activeScenarioId}
                    onSelectScenario={handleLoadScenario}
                  />
                  <button
                    type="button"
                    onClick={() => setInputStudioOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.09] text-xs font-medium text-zinc-100 transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>입력 설정 수정</span>
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="no-print rounded-xl border border-white/[0.07] bg-[#0C0C0F] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
                <div className="px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <SlidersHorizontal className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="font-display text-sm font-semibold text-zinc-100 truncate">
                      심사 대상 설정 (Audit Configuration)
                    </span>
                    <span className="hidden sm:inline font-mono text-xs text-zinc-500 tabular-nums whitespace-nowrap">
                      · SDK {workspaceState.detectedVendors.length}종 · 리전{' '}
                      {workspaceState.selectedRegions.length}개
                    </span>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                    <ScenarioDropdown
                      scenarios={DEMO_SCENARIOS}
                      activeScenarioId={activeScenarioId}
                      onSelectScenario={handleLoadScenario}
                    />

                    <button
                      type="button"
                      onClick={() => setInputStudioOpen(false)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-[#08080A] hover:border-white/[0.16] text-xs font-medium text-zinc-200 transition-colors whitespace-nowrap"
                    >
                      <span>입력창 접기</span>
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="p-5 pt-4 border-t border-white/[0.06] animate-panel-enter">
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
                    hasSeparateConsentUi={Boolean(
                      workspaceState.hasSeparateConsentUi,
                    )}
                    manualLegalDocOverrides={
                      workspaceState.manualLegalDocOverrides ?? {}
                    }
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
                    onChangeHasSeparateConsentUi={
                      handleChangeHasSeparateConsentUi
                    }
                    onToggleManualLegalDocOverride={
                      handleToggleManualLegalDocOverride
                    }
                    onResetManualLegalDocOverrides={
                      handleResetManualLegalDocOverrides
                    }
                    onRunInspection={handleRunInspection}
                    onCancelInspection={handleCancelInspection}
                    onShowToast={showToast}
                  />
                </div>
              </div>
            )}

            {activeScenario && (
              <div className="no-print rounded-xl border border-white/[0.08] bg-[#0C0C0F] px-4 py-3.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] animate-panel-enter">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <BookOpen className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="text-xs font-semibold text-zinc-100">
                        {activeScenario.short_label}
                      </span>
                      <span
                        className={`font-mono text-[10px] font-medium px-1.5 py-0.5 rounded border whitespace-nowrap ${
                          activeScenario.expected_verdict_hint === 'APPROVED'
                            ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
                            : activeScenario.expected_verdict_hint === 'DRIFT_DETECTED'
                              ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
                              : activeScenario.expected_verdict_hint === 'DENIED'
                                ? 'text-rose-300 border-rose-500/30 bg-rose-500/10'
                                : 'text-zinc-300 border-white/[0.12] bg-white/[0.04]'
                        }`}
                      >
                        {activeScenario.expected_verdict_hint === 'APPROVED'
                          ? '예상 결과: 승인 (APPROVED)'
                          : activeScenario.expected_verdict_hint === 'DRIFT_DETECTED'
                            ? '예상 결과: 위조 여권 (DRIFT)'
                            : activeScenario.expected_verdict_hint === 'DENIED'
                              ? '예상 결과: 차단 (DENIED)'
                              : '직접 입력 모드'}
                      </span>
                      <span className="font-mono text-[11px] text-cyan-400/90">
                        {activeScenario.persona}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-300 leading-relaxed">
                      {activeScenario.story}
                    </p>

                    {activeScenario.highlights.length > 0 && (
                      <div className="pt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-zinc-400">
                        <span className="text-zinc-500">핵심 관전 포인트:</span>
                        {activeScenario.highlights.map((point, index) => (
                          <span key={point} className="inline-flex items-center gap-2">
                            {index > 0 && <span className="text-zinc-600">·</span>}
                            <span className="text-zinc-300">{point}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveScenarioId(null)}
                    aria-label="시나리오 설명 닫기"
                    title="시나리오 설명 닫기"
                    className="p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {inspectionState.running && (
              <div
                role="status"
                className="no-print rounded-xl border border-[#38BDF8]/40 bg-[#141419] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 text-xs text-zinc-100">
                  <Loader2 className="w-4 h-4 animate-spin text-[#38BDF8] shrink-0" />
                  <span>
                    <strong className="font-semibold">
                      {llmConfig.provider === 'LOCAL_OPENAI_COMPAT'
                        ? `로컬 LLM(${llmConfig.modelName || 'Local'}) 응답 대기 및 심사 진행 중`
                        : 'AI 파싱 및 4계층 법률 심사 진행 중'}
                    </strong>
                    <span className="text-zinc-400 ml-2">
                      시간 제한 없이 응답을 기다립니다. 필요 시 우측 버튼으로 즉시 중지할 수 있습니다.
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCancelInspection}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-500/90 hover:bg-rose-400 text-[#050507] text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>응답 중지</span>
                </button>
              </div>
            )}

            {/* Phase 3 Full Enterprise Compliance Report Dashboard */}
            <div ref={reportSectionRef} className="space-y-5 scroll-mt-20">
              <div className="no-print">
                <DriftComparisonCard
                  facts={effectiveFacts}
                  result={currentResult}
                  onNavigateToRemediation={() => setReportTab('remediation')}
                />
              </div>

              {/* Executive Passport Stamp Banner */}
              <AuditReportPanel
                sectionMode="banner"
                scenarioTitle={
                  activeScenario
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

              {/* 3-Tab Segmented Pill Bar */}
              <div className="no-print flex items-center justify-between gap-3 overflow-x-auto">
                <div
                  role="tablist"
                  aria-label="심사 리포트 섹션"
                  className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#0C0C0F] border border-white/[0.07] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={reportTab === 'overview'}
                    onClick={() => setReportTab('overview')}
                    className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                      reportTab === 'overview'
                        ? 'bg-[#141419] border-[#38BDF8]/70 text-zinc-50 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]'
                        : 'border-transparent text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span>Overview &amp; Topology</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={reportTab === 'audit'}
                    onClick={() => setReportTab('audit')}
                    className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                      reportTab === 'audit'
                        ? 'bg-[#141419] border-[#38BDF8]/70 text-zinc-50 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]'
                        : 'border-transparent text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span>Compliance Audit (3단 신호등 리포트)</span>
                    <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
                      ({currentResult.triggered_rules.length})
                    </span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={reportTab === 'remediation'}
                    onClick={() => setReportTab('remediation')}
                    className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                      reportTab === 'remediation'
                        ? 'bg-[#141419] border-[#38BDF8]/70 text-zinc-50 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]'
                        : 'border-transparent text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span>Auto-Remediation Kit (치유 코드)</span>
                  </button>
                </div>
              </div>

              {/* Tab 1: Overview & Topology */}
              {reportTab === 'overview' && (
                <div
                  key="report-tab-overview"
                  role="tabpanel"
                  className="space-y-5 animate-panel-enter"
                >
                  <AuditReportPanel
                    sectionMode="overview-extras"
                    scenarioTitle={
                      activeScenario
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
                    onNavigateToRemediation={() => setReportTab('remediation')}
                  />

                  <div className="no-print">
                    <BorderTopologyMap
                      facts={effectiveFacts}
                      result={currentResult}
                      selectedRegionIds={workspaceState.selectedRegions}
                    />
                  </div>
                </div>
              )}

              {/* Tab 2: Compliance Audit (always mounted for print integrity) */}
              <div
                role="tabpanel"
                className={
                  reportTab === 'audit'
                    ? 'animate-panel-enter'
                    : 'hidden print:block'
                }
              >
                <AuditReportPanel
                  sectionMode="audit-list"
                  scenarioTitle={
                    activeScenario
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
              </div>

              {/* Tab 3: Auto-Remediation Kit */}
              {reportTab === 'remediation' && (
                <div
                  key="report-tab-remediation"
                  role="tabpanel"
                  className="no-print animate-panel-enter"
                >
                  <DualRemediationKit
                    facts={effectiveFacts}
                    result={currentResult}
                    activePacks={activePacks}
                    onApplyLegalDraft={handleApplyLegalDraft}
                    onApplySecurityFixes={handleApplySecurityFixes}
                    onShowToast={showToast}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'cicd-gate' && (
          <div key="tab-cicd-gate" className="animate-panel-enter">
            <CicdGateTab
              activePacks={activePacks}
              workspaceFacts={effectiveFacts}
              workspaceProfileName={activeProfile?.profile_name ?? '현재 워크스페이스'}
              onShowToast={showToast}
            />
          </div>
        )}

        {activeTab === 'policy-packs' && (
          <div key="tab-policy-packs" className="animate-panel-enter">
            <PolicyPacksTab
              builtInPacks={DEFAULT_POLICY_PACKS}
              customPacks={customPacks}
              disabledPackIds={disabledPackIds}
              onTogglePackActive={handleTogglePackActive}
              onInstallCustomPack={handleInstallCustomPack}
              onDeleteCustomPack={handleDeleteCustomPack}
              onShowToast={showToast}
            />
          </div>
        )}

        {activeTab === 'audit-history' && (
          <div key="tab-audit-history" className="animate-panel-enter">
            <AuditHistoryTab
              activeProfile={activeProfile}
              history={history}
              onRestoreToStudio={handleRestoreHistoryRecord}
              onDeleteRecord={handleDeleteHistoryRecord}
              onBackupImported={handleWorkspaceBackupImported}
              onShowToast={showToast}
            />
          </div>
        )}

        <LlmSettingsModal
          open={llmModalOpen}
          config={llmConfig}
          onClose={() => setLlmModalOpen(false)}
          onSave={(nextConfig) => {
            storageRepository.saveLlmConfig(nextConfig);
            setLlmConfig(nextConfig);
            showToast(
              `AI 엔진 설정 저장됨 (${nextConfig.provider === 'LOCAL_OPENAI_COMPAT' ? 'Local LLM' : 'Gemini Cloud'})`,
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

      {showLaserScan && (
        <div
          key={scanPulseKey}
          aria-hidden="true"
          className="no-print motion-reduce-hidden pointer-events-none fixed inset-0 z-50 overflow-hidden"
        >
          <div className="animate-laser-scan-once relative w-full">
            <div className="h-14 w-full bg-gradient-to-b from-transparent via-[#38BDF8]/[0.06] to-[#38BDF8]/20" />
            <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[#38BDF8] to-transparent shadow-[0_0_20px_2px_rgba(56,189,248,0.75)]" />
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
