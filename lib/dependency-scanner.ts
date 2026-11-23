import { SDK_REGISTRY } from './sdk-registry';
import type { DetectedVendor, SdkCategory } from './types';

export type DependencyFileType =
  | 'package.json'
  | 'requirements.txt'
  | '.env.example'
  | 'html'
  | 'tsx'
  | 'unknown';

export interface DependencyScanResult {
  fileType: DependencyFileType;
  detectedVendors: DetectedVendor[];
  detectedRegions: string[];
  matchedPackages: string[];
  unknownPackages: string[];
}

export interface StackRegionPreset {
  id: string;
  label: string;
  provider: string;
  regionCode: string;
  countryCode: string;
}

export interface StackSaasPreset {
  sdk: string;
  label: string;
  countryCode: string;
  category: SdkCategory;
}

export const STACK_BUILDER_REGIONS: StackRegionPreset[] = [
  {
    id: 'aws-seoul',
    label: 'AWS 서울',
    provider: 'AWS',
    regionCode: 'ap-northeast-2',
    countryCode: 'KR',
  },
  {
    id: 'aws-virginia',
    label: 'AWS 버지니아',
    provider: 'AWS',
    regionCode: 'us-east-1',
    countryCode: 'US',
  },
  {
    id: 'aws-tokyo',
    label: 'AWS 도쿄',
    provider: 'AWS',
    regionCode: 'ap-northeast-1',
    countryCode: 'JP',
  },
  {
    id: 'vercel-us',
    label: 'Vercel US',
    provider: 'Vercel',
    regionCode: 'iad1',
    countryCode: 'US',
  },
  {
    id: 'supabase-us',
    label: 'Supabase',
    provider: 'Supabase',
    regionCode: 'us-east-1',
    countryCode: 'US',
  },
];

export const STACK_BUILDER_SAAS: StackSaasPreset[] = [
  { sdk: 'openai', label: 'OpenAI', countryCode: 'US', category: 'AI' },
  { sdk: '@anthropic-ai/sdk', label: 'Anthropic', countryCode: 'US', category: 'AI' },
  { sdk: '@google/genai', label: 'Gemini API', countryCode: 'US', category: 'AI' },
  { sdk: '@supabase/supabase-js', label: 'Supabase', countryCode: 'US', category: 'CLOUD_DB' },
  { sdk: 'stripe', label: 'Stripe', countryCode: 'US', category: 'PAYMENT' },
  { sdk: 'mixpanel', label: 'Mixpanel', countryCode: 'US', category: 'ANALYTICS' },
  { sdk: 'firebase', label: 'Firebase', countryCode: 'US', category: 'CLOUD_DB' },
  { sdk: 'resend', label: 'Resend', countryCode: 'US', category: 'MESSAGING' },
  { sdk: '@sentry/nextjs', label: 'Sentry', countryCode: 'US', category: 'INFRA' },
  { sdk: 'auth0', label: 'Auth0', countryCode: 'US', category: 'AUTH' },
];

const PYTHON_TO_REGISTRY_MAP: Record<string, string> = {
  openai: 'openai',
  anthropic: '@anthropic-ai/sdk',
  'google-genai': '@google/genai',
  'google-generativeai': '@google/genai',
  stripe: 'stripe',
  supabase: '@supabase/supabase-js',
  'firebase-admin': 'firebase-admin',
  mixpanel: 'mixpanel',
  amplitude: '@amplitude/analytics-browser',
  'sentry-sdk': '@sentry/nextjs',
  resend: 'resend',
  twilio: 'twilio',
  boto3: '@aws-sdk/client-s3',
  botocore: '@aws-sdk/client-s3',
  posthog: 'posthog-js',
  datadog: 'datadog-rum',
  algoliasearch: 'algoliasearch',
  cloudinary: 'cloudinary',
  authlib: 'auth0',
  'mailchimp-marketing': 'mailchimp',
  'python-intercom': 'intercom',
  'hubspot-api-client': 'hubspot',
  'segment-analytics-python': 'segment',
  paypalrestsdk: 'paypal',
  'slack-sdk': 'slack',
  'discord.py': 'discord.js',
  cloudflare: 'cloudflare',
  pymongo: 'mongodb',
  'line-bot-sdk': '@line/bot-sdk',
  oss2: '@alicloud/oss',
};

const ENV_KEY_TO_REGISTRY_MAP: Array<{ pattern: RegExp; sdk: string }> = [
  { pattern: /^OPENAI_API_KEY$/i, sdk: 'openai' },
  { pattern: /^ANTHROPIC_API_KEY$/i, sdk: '@anthropic-ai/sdk' },
  { pattern: /^GEMINI_API_KEY$|^GOOGLE_API_KEY$/i, sdk: '@google/genai' },
  { pattern: /^STRIPE_/i, sdk: 'stripe' },
  { pattern: /^SUPABASE_/i, sdk: '@supabase/supabase-js' },
  { pattern: /^FIREBASE_/i, sdk: 'firebase' },
  { pattern: /^MIXPANEL_/i, sdk: 'mixpanel' },
  { pattern: /^AMPLITUDE_/i, sdk: '@amplitude/analytics-browser' },
  { pattern: /^SENTRY_DSN$/i, sdk: '@sentry/nextjs' },
  { pattern: /^RESEND_/i, sdk: 'resend' },
  { pattern: /^TWILIO_/i, sdk: 'twilio' },
  { pattern: /^AWS_ACCESS_KEY_ID$|^AWS_S3_/i, sdk: '@aws-sdk/client-s3' },
  { pattern: /^VERCEL_ANALYTICS/i, sdk: '@vercel/analytics' },
  { pattern: /^POSTHOG_/i, sdk: 'posthog-js' },
  { pattern: /^DD_RUM|^DATADOG_/i, sdk: 'datadog-rum' },
  { pattern: /^ALGOLIA_/i, sdk: 'algoliasearch' },
  { pattern: /^CLOUDINARY_/i, sdk: 'cloudinary' },
  { pattern: /^AUTH0_/i, sdk: 'auth0' },
  { pattern: /^CLERK_/i, sdk: '@clerk/nextjs' },
  { pattern: /^MAILCHIMP_/i, sdk: 'mailchimp' },
  { pattern: /^INTERCOM_/i, sdk: 'intercom' },
  { pattern: /^HUBSPOT_/i, sdk: 'hubspot' },
  { pattern: /^SEGMENT_/i, sdk: 'segment' },
  { pattern: /^PAYPAL_/i, sdk: 'paypal' },
  { pattern: /^PADDLE_/i, sdk: 'paddle' },
  { pattern: /^SLACK_/i, sdk: 'slack' },
  { pattern: /^DISCORD_/i, sdk: 'discord.js' },
  { pattern: /^CLOUDFLARE_/i, sdk: 'cloudflare' },
  { pattern: /^MONGODB_URI$/i, sdk: 'mongodb' },
  { pattern: /^TOSS_?PAYMENTS_/i, sdk: '@tosspayments/payment-sdk' },
  { pattern: /^LINE_CHANNEL_/i, sdk: '@line/bot-sdk' },
  { pattern: /^ALICLOUD_|^OSS_ENDPOINT$/i, sdk: '@alicloud/oss' },
];

const HTML_SCRIPT_TRACKER_RULES: Array<{
  sdk: string;
  label: string;
  pattern: RegExp;
}> = [
  {
    sdk: 'google-analytics-4',
    label: 'googletagmanager.com / gtag',
    pattern:
      /googletagmanager\.com|google-analytics\.com|\bgtag\s*\(|\bG-[A-Z0-9]{6,}\b|\bUA-\d+-\d+\b/i,
  },
  {
    sdk: 'meta-pixel',
    label: 'connect.facebook.net / fbq',
    pattern: /connect\.facebook\.net|fbevents\.js|\bfbq\s*\(/i,
  },
  {
    sdk: 'kakao-pixel',
    label: 't1.daumcdn.net/kas / kakaoPixel',
    pattern: /t1\.daumcdn\.net\/kas|\bkakaoPixel\s*\(/i,
  },
  {
    sdk: 'channel-io',
    label: 'cdn.channel.io / ChannelIO',
    pattern: /cdn\.channel\.io|\bChannelIO\s*\(/i,
  },
  {
    sdk: 'ms-clarity',
    label: 'clarity.ms / clarity',
    pattern: /clarity\.ms|\bclarity\s*\(\s*["']/i,
  },
  {
    sdk: 'mixpanel',
    label: 'cdn.mxpnl.com / mixpanel',
    pattern: /cdn\.mxpnl\.com|\bmixpanel\.(init|track)\s*\(/i,
  },
  {
    sdk: '@amplitude/analytics-browser',
    label: 'cdn.amplitude.com / amplitude',
    pattern: /cdn\.amplitude\.com|\bamplitude\.(init|track)\s*\(/i,
  },
  {
    sdk: 'posthog-js',
    label: 'app.posthog.com / posthog',
    pattern: /posthog\.com|\bposthog\.(init|capture)\s*\(/i,
  },
  {
    sdk: 'intercom',
    label: 'widget.intercom.io / Intercom',
    pattern: /widget\.intercom\.io|\bIntercom\s*\(/i,
  },
  {
    sdk: 'hubspot',
    label: 'js.hs-scripts.com / hubspot',
    pattern: /js\.hs-scripts\.com|hs-analytics\.net/i,
  },
  {
    sdk: 'segment',
    label: 'cdn.segment.com / analytics.js',
    pattern: /cdn\.segment\.com|\banalytics\.(load|track)\s*\(/i,
  },
  {
    sdk: '@tosspayments/payment-sdk',
    label: 'js.tosspayments.com / TossPayments',
    pattern: /js\.tosspayments\.com|\bTossPayments\s*\(/i,
  },
];

export function buildVendorFromSdk(sdk: string): DetectedVendor | null {
  const entry = SDK_REGISTRY[sdk];
  if (!entry) return null;
  return {
    name: entry.vendor_name,
    sdk: entry.sdk,
    country: entry.country,
    default_country: entry.country,
    data_residency_country: entry.country,
    transfer_purpose: entry.default_purpose,
    includes_pii: true,
    dpf_certified: entry.dpf_certified,
    baa_supported: entry.baa_supported,
    zero_data_retention: entry.zero_data_retention,
    category: entry.category,
  };
}

function detectFileType(fileName: string, content: string): DependencyFileType {
  const lowerName = fileName.toLowerCase();
  const trimmed = content.trim();
  if (lowerName.endsWith('.json') || trimmed.startsWith('{')) {
    return 'package.json';
  }
  if (
    lowerName.endsWith('.html') ||
    lowerName.endsWith('.htm') ||
    /^<!doctype\s+html/i.test(trimmed) ||
    /<html[\s>]/i.test(trimmed)
  ) {
    return 'html';
  }
  if (
    lowerName.endsWith('.tsx') ||
    lowerName.endsWith('.jsx') ||
    lowerName.endsWith('.ts') ||
    lowerName.endsWith('.js') ||
    /<Script[\s>]/.test(trimmed) ||
    /next\/script|next\/document/i.test(trimmed)
  ) {
    return 'tsx';
  }
  if (lowerName.includes('.env') || /^[A-Z0-9_]+\s*=/.test(trimmed)) {
    return '.env.example';
  }
  if (lowerName.endsWith('.txt') || lowerName.includes('requirements')) {
    return 'requirements.txt';
  }
  if (/<script[\s>]/i.test(trimmed)) {
    return 'html';
  }
  return 'unknown';
}

function detectRegionsFromEnv(content: string): string[] {
  const regions: string[] = [];
  if (/ap-northeast-2/i.test(content)) regions.push('aws-seoul');
  if (/us-east-1|us-west-2/i.test(content)) regions.push('aws-virginia');
  if (/ap-northeast-1/i.test(content)) regions.push('aws-tokyo');
  if (/vercel/i.test(content) && /iad1|us/i.test(content)) regions.push('vercel-us');
  if (/supabase/i.test(content)) regions.push('supabase-us');
  return Array.from(new Set(regions));
}

/**
 * Parses `package.json`, `requirements.txt`, or `.env.example` content
 * against the built-in 33-entry `SDK_REGISTRY`.
 */
export function scanDependencyFile(
  fileName: string,
  content: string,
): DependencyScanResult {
  const fileType = detectFileType(fileName, content);
  const vendorMap = new Map<string, DetectedVendor>();
  const matchedPackages: string[] = [];
  const unknownPackages: string[] = [];
  let detectedRegions: string[] = [];

  if (fileType === 'package.json') {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const sections = [
        parsed.dependencies,
        parsed.devDependencies,
        parsed.peerDependencies,
        parsed.optionalDependencies,
      ];
      const packageNames = new Set<string>();
      for (const section of sections) {
        if (section && typeof section === 'object') {
          for (const key of Object.keys(section as Record<string, unknown>)) {
            packageNames.add(key.trim());
          }
        }
      }

      for (const pkg of packageNames) {
        const vendor = buildVendorFromSdk(pkg);
        if (vendor) {
          vendorMap.set(vendor.sdk, vendor);
          matchedPackages.push(pkg);
        } else {
          unknownPackages.push(pkg);
        }
      }
    } catch {
      // Fallback line scan if JSON is malformed
      for (const sdk of Object.keys(SDK_REGISTRY)) {
        if (content.includes(`"${sdk}"`)) {
          const vendor = buildVendorFromSdk(sdk);
          if (vendor) {
            vendorMap.set(vendor.sdk, vendor);
            matchedPackages.push(sdk);
          }
        }
      }
    }
  } else if (fileType === 'requirements.txt') {
    const lines = content.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.split('#')[0].trim();
      if (!line) continue;
      const pkgName = line.split(/[=<>!~[\s;]/)[0].trim().toLowerCase();
      if (!pkgName) continue;

      const mappedSdk = PYTHON_TO_REGISTRY_MAP[pkgName] ?? (SDK_REGISTRY[pkgName] ? pkgName : undefined);
      if (mappedSdk) {
        const vendor = buildVendorFromSdk(mappedSdk);
        if (vendor) {
          vendorMap.set(vendor.sdk, vendor);
          matchedPackages.push(pkgName);
          continue;
        }
      }
      unknownPackages.push(pkgName);
    }
  } else if (fileType === 'html' || fileType === 'tsx') {
    for (const rule of HTML_SCRIPT_TRACKER_RULES) {
      if (rule.pattern.test(content)) {
        const vendor = buildVendorFromSdk(rule.sdk);
        if (vendor) {
          vendorMap.set(vendor.sdk, vendor);
          matchedPackages.push(rule.label);
        }
      }
    }

    // Also scan ES/CommonJS package imports inside .tsx/_document.tsx files
    const importMatches = content.matchAll(
      /(?:from\s+['"]|require\(\s*['"])([^'"]+)['"]/g,
    );
    for (const match of importMatches) {
      const pkg = match[1]?.trim();
      if (!pkg) continue;
      const vendor = buildVendorFromSdk(pkg);
      if (vendor) {
        vendorMap.set(vendor.sdk, vendor);
        matchedPackages.push(pkg);
      }
    }
  } else {
    // .env.example or generic key=value scan
    detectedRegions = detectRegionsFromEnv(content);
    const lines = content.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.split('#')[0].trim();
      if (!line || !line.includes('=')) continue;
      const key = line.split('=')[0].trim();
      if (!key) continue;

      let matched = false;
      for (const rule of ENV_KEY_TO_REGISTRY_MAP) {
        if (rule.pattern.test(key)) {
          const vendor = buildVendorFromSdk(rule.sdk);
          if (vendor) {
            vendorMap.set(vendor.sdk, vendor);
            matchedPackages.push(key);
            matched = true;
            break;
          }
        }
      }
      if (!matched) {
        unknownPackages.push(key);
      }
    }
  }

  return {
    fileType,
    detectedVendors: Array.from(vendorMap.values()),
    detectedRegions,
    matchedPackages,
    unknownPackages,
  };
}

export const SAMPLE_DEPENDENCY_FILES: Record<
  'package.json' | 'requirements.txt' | '.env.example' | 'index.html',
  { fileName: string; content: string }
> = {
  'package.json': {
    fileName: 'package.json',
    content: JSON.stringify(
      {
        name: 'border-commerce-app',
        version: '1.4.0',
        dependencies: {
          next: '^15.1.0',
          react: '^19.0.0',
          openai: '^4.70.0',
          stripe: '^17.3.0',
          mixpanel: '^2.55.0',
          resend: '^4.0.1',
          '@sentry/nextjs': '^8.38.0',
        },
      },
      null,
      2,
    ),
  },
  'requirements.txt': {
    fileName: 'requirements.txt',
    content: [
      'fastapi==0.115.0',
      'uvicorn==0.32.0',
      'openai>=1.55.0',
      'anthropic>=0.39.0',
      'supabase==2.9.0',
      'sentry-sdk>=2.18.0',
      'stripe==11.2.0',
    ].join('\n'),
  },
  '.env.example': {
    fileName: '.env.example',
    content: [
      'AWS_REGION="ap-northeast-1"',
      'OPENAI_API_KEY="sk-..."',
      'STRIPE_SECRET_KEY="sk_live_..."',
      'MIXPANEL_TOKEN="mp_..."',
      'AUTH0_DOMAIN="tenant.us.auth0.com"',
    ].join('\n'),
  },
  'index.html': {
    fileName: 'index.html',
    content: [
      '<!doctype html>',
      '<html lang="ko">',
      '  <head>',
      '    <meta charset="UTF-8" />',
      '    <script async src="https://www.googletagmanager.com/gtag/js?id=G-DEMO1234"></script>',
      '    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());</script>',
      '    <script async src="https://connect.facebook.net/en_US/fbevents.js"></script>',
      '    <script>fbq("init", "1234567890");</script>',
      '    <script src="https://t1.daumcdn.net/kas/static/kp.js"></script>',
      '    <script src="https://cdn.channel.io/plugin/ch-plugin-web.js"></script>',
      '    <script src="https://www.clarity.ms/tag/demo123"></script>',
      '  </head>',
      '  <body><div id="root"></div></body>',
      '</html>',
    ].join('\n'),
  },
};
