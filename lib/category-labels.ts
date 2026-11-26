import type { DriftType, SdkCategory } from './types';

/**
 * Exhaustive Korean label dictionary for Policy-Infra Drift category codes (`DriftType`).
 */
export const DRIFT_CATEGORY_LABELS: Record<DriftType, string> = {
  DOMESTIC_CLAIM_CONTRADICTION: '국내보관 모순',
  UNDISCLOSED_COUNTRY: '미공개 이전국가',
  UNDISCLOSED_VENDOR: '미공개 수탁사',
  VIRTUAL_TRANSFER_OMISSION: '제3자 제공 누락',
  SAFEGUARD_CLAIM_MISMATCH: '보호조치 불일치',
};

/**
 * Exhaustive Korean label dictionary for rule violation categories defined across
 * built-in policy packs (`lib/packs/*.json`), `types.ts`, and common extension packs.
 */
export const RULE_CATEGORY_LABELS: Record<string, string> = {
  // Core categories used in built-in policy packs
  CROSS_BORDER_TRANSFER: '국외 이전',
  VIRTUAL_TRANSFER: '가상 국외 이전',
  DISCLOSURE: '고지·동의 의무',
  SECURITY: '기술적 보호조치',
  TRACKER_SHARING: '행태정보·트래커 공유',
  AI_GOVERNANCE: 'AI 거버넌스',

  // Additional / extension categories (encryption, retention, consent, AI Act, etc.)
  ENCRYPTION: '암호화 조치',
  RETENTION: '보유·파기 기간',
  DATA_RETENTION: '데이터 보유 기간',
  CONSENT: '정보주체 동의',
  SEPARATE_CONSENT: '별도 동의',
  OPT_OUT: '수집·이용 거부권',
  AI_ACT: 'AI 기본법 의무',
  AI_TRANSPARENCY: 'AI 투명성 고지',
  AI_TRAINING_OPT_OUT: 'AI 학습 거부권',
  THIRD_PARTY_SHARING: '제3자 제공',
  ENTRUSTMENT: '처리 위탁',
  SAFEGUARDS: '보호조치 의무',
  DATA_MINIMIZATION: '최소 수집 원칙',
  LOCALIZATION: '데이터 현지화',
  ACCESS_CONTROL: '접근 통제',
  AUDIT_LOGGING: '감사·기록 보관',
  PRIVACY_NOTICE: '처리방침 고지',
  SURVEILLANCE_RISK: '정부 열람·감시 리스크',
  CHILDREN_PRIVACY: '아동 개인정보 보호',

  // SDK categories if referenced by custom packs
  AI: 'AI 모델 연동',
  PAYMENT: '결제 연동',
  CLOUD: '클라우드 인프라',
  CLOUD_DB: '클라우드 DB',
  ANALYTICS: '분석·트래커',
  MESSAGING: '메시징 연동',
  AUTH: '인증·계정 연동',
  INFRA: '인프라 구성',
  CDN: '콘텐츠 전송망',
};

const KEYWORD_FALLBACKS: Array<[RegExp, string]> = [
  [/DOMESTIC/i, '국내보관 모순'],
  [/COUNTRY|REGION/i, '이전 국가 관리'],
  [/VENDOR|PROCESSOR/i, '수탁사 관리'],
  [/VIRTUAL|IAM|KMS/i, '가상 국외 이전'],
  [/ENCRYPT|TLS|CIPHER/i, '암호화 조치'],
  [/RETENT|DELET|PURGE/i, '보유·파기 기간'],
  [/CONSENT|AGREE/i, '동의 관리'],
  [/OPT[_-]?OUT/i, '거부권 보장'],
  [/TRACKER|COOKIE|ANALYTIC/i, '행태정보·트래커'],
  [/DISCLOS|NOTICE|TRANSPARENCY/i, '고지 의무'],
  [/SAFEGUARD|SCC|DPF/i, '보호조치'],
  [/SECURITY|ACCESS|AUTH/i, '기술적 보호조치'],
  [/AI|LLM|GENAI|MODEL/i, 'AI 거버넌스'],
  [/TRANSFER|BORDER|EGRESS/i, '국외 이전'],
  [/SHARE|THIRD/i, '제3자 제공'],
  [/ENTRUST/i, '처리 위탁'],
];

function normalizeCategoryKey(rawCode: string): string {
  return rawCode.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function humanizeFallbackCode(rawCode: string): string {
  const cleaned = rawCode.trim().replace(/[_-]+/g, ' ');
  if (!cleaned) return '기타 항목';
  return cleaned
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * Resolves a DriftType code to its natural Korean badge label with safe fallback
 * for any future or custom drift types.
 */
export function getDriftCategoryLabel(driftType: DriftType | string): string {
  const normalized = normalizeCategoryKey(String(driftType ?? ''));
  if (normalized in DRIFT_CATEGORY_LABELS) {
    return DRIFT_CATEGORY_LABELS[normalized as DriftType];
  }
  for (const [pattern, label] of KEYWORD_FALLBACKS) {
    if (pattern.test(normalized)) {
      return label;
    }
  }
  return humanizeFallbackCode(String(driftType ?? ''));
}

/**
 * Resolves a policy rule category code (or SDK category) to its natural Korean
 * badge label with safe fallback for any future/custom policy pack categories.
 */
export function getRuleCategoryLabel(
  category: SdkCategory | string | undefined | null,
): string {
  if (!category) return '일반 규제';
  const normalized = normalizeCategoryKey(String(category));
  if (normalized in RULE_CATEGORY_LABELS) {
    return RULE_CATEGORY_LABELS[normalized];
  }
  for (const [pattern, label] of KEYWORD_FALLBACKS) {
    if (pattern.test(normalized)) {
      return label;
    }
  }
  return humanizeFallbackCode(String(category));
}
