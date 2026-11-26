import React from 'react';
import { DEFAULT_POLICY_PACKS } from '@/lib/default-packs';
import type { DemoScenario } from '@/lib/demo-scenarios';
import type {
  CanonicalFactModel,
  DetectedVendor,
  IndustryDomain,
  PolicyPackV2,
  TransferPurpose,
  VirtualTransferFacts,
} from '@/lib/types';
import { GuidedAuditWizard } from './GuidedAuditWizard';
import { ScenarioDropdown } from './ScenarioDropdown';
import type { ToastVariant } from './Toast';

export interface InspectionStageState {
  running: boolean;
  stepIndex: number; // 0..3
}

interface InputStudioProps {
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
  scenarios: DemoScenario[];
  activeScenarioId: string | null;
  activePacks?: PolicyPackV2[];
  inspectionState: InspectionStageState;
  onUpdateWorkspaceMeta: (patch: {
    businessCountry?: string;
    dataSubjectCountries?: string[];
    industryDomain?: IndustryDomain;
  }) => void;
  onToggleRegion: (regionId: string) => void;
  onToggleSaasPreset: (sdk: string) => void;
  onApplyScannedVendors: (
    vendors: DetectedVendor[],
    regions: string[],
  ) => void;
  onToggleVendorPii: (sdk: string) => void;
  onChangeVendorPurpose: (sdk: string, purpose: TransferPurpose) => void;
  onChangeVendorResidency: (sdk: string, residencyCountry: string) => void;
  onRemoveVendor: (sdk: string) => void;
  onChangePolicyText: (text: string) => void;
  onToggleNoPolicyDoc: (val: boolean) => void;
  onChangeInfraCode: (code: string) => void;
  onChangeVirtualTransfer: (patch: Partial<VirtualTransferFacts>) => void;
  onChangeSecurity: (patch: Partial<CanonicalFactModel['security']>) => void;
  onLoadScenario: (scenarioId: string) => void;
  onRunInspection: () => void;
  onCancelInspection?: () => void;
  hideScenarioBar?: boolean;
  onShowToast?: (message: string, variant?: ToastVariant) => void;
}

export function InputStudio({
  businessCountry,
  dataSubjectCountries,
  industryDomain,
  selectedRegions,
  detectedVendors,
  policyText,
  noPolicyDoc,
  infraCode,
  virtualTransfer,
  security,
  scenarios,
  activeScenarioId,
  activePacks = DEFAULT_POLICY_PACKS,
  inspectionState,
  onUpdateWorkspaceMeta,
  onToggleRegion,
  onToggleSaasPreset,
  onApplyScannedVendors,
  onToggleVendorPii,
  onChangeVendorPurpose,
  onChangeVendorResidency,
  onRemoveVendor,
  onChangePolicyText,
  onToggleNoPolicyDoc,
  onChangeInfraCode,
  onChangeVirtualTransfer,
  onChangeSecurity,
  onLoadScenario,
  onRunInspection,
  onCancelInspection,
  hideScenarioBar = false,
  onShowToast,
}: InputStudioProps) {
  return (
    <div className="space-y-5">
      {!hideScenarioBar && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-white/[0.06]">
          <div>
            <h2 className="font-display text-sm font-semibold text-zinc-100">
              심사 대상 설정 (Audit Configuration)
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              단계별 입력과 실시간 규제 매칭을 확인하고 출입국 심사를 실행하세요.
            </p>
          </div>

          <ScenarioDropdown
            scenarios={scenarios}
            activeScenarioId={activeScenarioId}
            onSelectScenario={onLoadScenario}
          />
        </div>
      )}

      <GuidedAuditWizard
        businessCountry={businessCountry}
        dataSubjectCountries={dataSubjectCountries}
        industryDomain={industryDomain}
        selectedRegions={selectedRegions}
        detectedVendors={detectedVendors}
        policyText={policyText}
        noPolicyDoc={noPolicyDoc}
        infraCode={infraCode}
        virtualTransfer={virtualTransfer}
        security={security}
        activePacks={activePacks}
        inspectionState={inspectionState}
        onUpdateWorkspaceMeta={onUpdateWorkspaceMeta}
        onToggleRegion={onToggleRegion}
        onToggleSaasPreset={onToggleSaasPreset}
        onApplyScannedVendors={onApplyScannedVendors}
        onToggleVendorPii={onToggleVendorPii}
        onChangeVendorPurpose={onChangeVendorPurpose}
        onChangeVendorResidency={onChangeVendorResidency}
        onRemoveVendor={onRemoveVendor}
        onChangePolicyText={onChangePolicyText}
        onToggleNoPolicyDoc={onToggleNoPolicyDoc}
        onChangeInfraCode={onChangeInfraCode}
        onChangeVirtualTransfer={onChangeVirtualTransfer}
        onChangeSecurity={onChangeSecurity}
        onRunInspection={onRunInspection}
        onCancelInspection={onCancelInspection}
        onShowToast={onShowToast}
      />
    </div>
  );
}
