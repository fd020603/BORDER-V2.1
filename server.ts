import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import dns from 'node:dns/promises';
import http from 'node:http';
import net from 'node:net';
import https from 'node:https';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { DEFAULT_POLICY_PACKS } from './lib/default-packs';
import {
  STACK_BUILDER_REGIONS,
  scanDependencyFile,
} from './lib/dependency-scanner';
import {
  extractHeuristicPayload,
  parseJsonWithRepair,
} from './lib/llm-parser';
import {
  computeEffectiveHasCrossBorder,
  evaluateFacts,
} from './lib/rule-evaluator';
import type { CanonicalFactModel, IndustryDomain } from './lib/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const MAX_LLM_PROXY_RESPONSE_BYTES = 4 * 1024 * 1024; // 4MB
const LLM_PROXY_TIMEOUT_MS = 120_000; // 120s
const MAX_POLICY_CHARS = 100_000;
const MAX_INFRA_CHARS = 100_000;
const MAX_VENDOR_NAMES = 100;

const PLACEHOLDER_SECRETS = new Set([
  'MY_GEMINI_API_KEY',
  'YOUR_GEMINI_API_KEY',
  'YOUR_OPENAI_API_KEY',
  'YOUR_ANTHROPIC_API_KEY',
  'YOUR_OPENROUTER_API_KEY',
  'YOUR_API_KEY',
]);

function isConfiguredSecret(value?: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && !PLACEHOLDER_SECRETS.has(trimmed);
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!isConfiguredSecret(apiKey)) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey!.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

type CloudLlmProvider =
  | 'GEMINI_CLOUD'
  | 'OPENAI_CLOUD'
  | 'ANTHROPIC_CLOUD'
  | 'OPENROUTER_CLOUD'
  | 'CUSTOM_CLOUD';

const CLOUD_DEFAULT_MODELS: Record<CloudLlmProvider, string> = {
  GEMINI_CLOUD: 'gemini-4-hydrogen',
  OPENAI_CLOUD: 'gpt-4o-mini',
  ANTHROPIC_CLOUD: 'claude-3-5-haiku-latest',
  OPENROUTER_CLOUD: 'openai/gpt-4o-mini',
  CUSTOM_CLOUD: 'gpt-4o-mini',
};

function sanitizeCloudModelName(
  provider: CloudLlmProvider,
  rawModel?: string,
): string {
  const trimmed = (rawModel ?? '').trim();
  if (/^[a-zA-Z0-9._:/-]{2,120}$/.test(trimmed)) {
    return trimmed;
  }
  return CLOUD_DEFAULT_MODELS[provider];
}

function normalizeCustomChatUrl(rawUrl: string): URL {
  const parsed = new URL(rawUrl.trim());
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('CUSTOM_LLM_BASE_URL must use http:// or https://');
  }
  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  if (!cleanPath || cleanPath === '') {
    parsed.pathname = '/v1/chat/completions';
  } else if (cleanPath.endsWith('/v1')) {
    parsed.pathname = `${cleanPath}/chat/completions`;
  } else if (!cleanPath.endsWith('/chat/completions')) {
    parsed.pathname = `${cleanPath}/chat/completions`;
  }
  return parsed;
}

const DEFAULT_ALLOWED_LLM_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  'host.docker.internal',
]);

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
}

function getAllowedLlmProxyHosts(): Set<string> {
  const allowed = new Set(DEFAULT_ALLOWED_LLM_HOSTS);
  const extraHosts = process.env.ALLOWED_LLM_PROXY_HOSTS;
  if (extraHosts) {
    for (const rawHost of extraHosts.split(',')) {
      const normalized = normalizeHost(rawHost);
      if (normalized) {
        allowed.add(normalized);
      }
    }
  }
  return allowed;
}

function isAllowedLlmProxyHost(hostname: string): boolean {
  const normalized = normalizeHost(hostname);
  if (!normalized) return false;
  return getAllowedLlmProxyHosts().has(normalized);
}

function isPrivateOrMetadataIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 169 && b === 254) return true; // Link-local / Cloud metadata
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 0) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) {
      return true;
    }
    if (lower.startsWith('::ffff:')) {
      return isPrivateOrMetadataIp(lower.slice(7));
    }
    return false;
  }
  return true;
}

async function assertSafeProxyTarget(targetUrl: URL): Promise<void> {
  const host = normalizeHost(targetUrl.hostname);
  if (!isAllowedLlmProxyHost(host)) {
    throw new Error('FORBIDDEN_ENDPOINT');
  }
  if (DEFAULT_ALLOWED_LLM_HOSTS.has(host)) {
    return;
  }
  if (net.isIP(host)) {
    if (isPrivateOrMetadataIp(host)) {
      throw new Error('FORBIDDEN_PRIVATE_IP');
    }
    return;
  }
  const resolved = await dns.lookup(host, { all: true }).catch(() => []);
  if (resolved.length === 0 || resolved.some((entry) => isPrivateOrMetadataIp(entry.address))) {
    throw new Error('FORBIDDEN_PRIVATE_IP');
  }
}

function createRateLimiter(maxRequests: number, windowMs: number) {
  const buckets = new Map<string, number[]>();
  return (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const recent = (buckets.get(key) ?? []).filter((ts) => now - ts < windowMs);
    if (recent.length >= maxRequests) {
      res.status(429).json({
        error: '요청 횟수 제한을 초과했습니다. 잠시 후 다시 시도해 주세요.',
        code: 'RATE_LIMIT_EXCEEDED',
      });
      return;
    }
    recent.push(now);
    buckets.set(key, recent);
    if (buckets.size > 500) {
      for (const [k, list] of buckets.entries()) {
        if (list.every((ts) => now - ts >= windowMs)) {
          buckets.delete(k);
        }
      }
    }
    next();
  };
}

const apiRateLimiter = createRateLimiter(30, 60_000);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    const geminiConfigured = Boolean(getGeminiClient());
    res.json({
      ok: true,
      geminiConfigured,
      providers: {
        GEMINI_CLOUD: geminiConfigured,
        OPENAI_CLOUD: isConfiguredSecret(process.env.OPENAI_API_KEY),
        ANTHROPIC_CLOUD: isConfiguredSecret(process.env.ANTHROPIC_API_KEY),
        OPENROUTER_CLOUD: isConfiguredSecret(process.env.OPENROUTER_API_KEY),
        CUSTOM_CLOUD:
          isConfiguredSecret(process.env.CUSTOM_LLM_BASE_URL) &&
          isConfiguredSecret(process.env.CUSTOM_LLM_API_KEY),
      },
      defaultModel: 'gemini-4-hydrogen',
    });
  });

  app.post('/api/llm-proxy', apiRateLimiter, async (req, res) => {
    const {
      endpoint,
      payload,
      method = 'POST',
    } = (req.body ?? {}) as {
      endpoint?: string;
      payload?: unknown;
      method?: 'GET' | 'POST';
    };

    if (!endpoint || typeof endpoint !== 'string') {
      res.status(400).json({
        error: 'endpoint URL is required.',
        code: 'INVALID_ENDPOINT',
      });
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(endpoint.trim());
    } catch {
      res.status(400).json({
        error: 'Invalid endpoint URL format.',
        code: 'INVALID_ENDPOINT',
      });
      return;
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      res.status(400).json({
        error: 'Only http:// and https:// endpoints are supported.',
        code: 'INVALID_PROTOCOL',
      });
      return;
    }

    try {
      await assertSafeProxyTarget(parsedUrl);
    } catch {
      res.status(403).json({
        error: 'Only allowed local or approved LLM endpoints are permitted.',
        code: 'FORBIDDEN_ENDPOINT',
      });
      return;
    }

    req.socket?.setTimeout(LLM_PROXY_TIMEOUT_MS);
    res.socket?.setTimeout(LLM_PROXY_TIMEOUT_MS);

    const normalizedMethod = method === 'GET' ? 'GET' : 'POST';
    const upstreamHeaders: Record<string, string> = {
      'ngrok-skip-browser-warning': '1',
    };
    const bodyString =
      normalizedMethod === 'GET' ? undefined : JSON.stringify(payload ?? {});
    if (bodyString !== undefined) {
      upstreamHeaders['Content-Type'] = 'application/json';
      upstreamHeaders['Content-Length'] = String(Buffer.byteLength(bodyString));
    }

    let activeUpstreamReq: http.ClientRequest | null = null;
    let clientCancelled = false;

    const handleClientClose = () => {
      if (!res.writableEnded) {
        clientCancelled = true;
        activeUpstreamReq?.destroy();
      }
    };
    res.on('close', handleClientClose);

    const relayOnce = async (
      targetUrl: URL,
      redirectsLeft: number,
    ): Promise<{ status: number; contentType: string; rawText: string }> => {
      await assertSafeProxyTarget(targetUrl);
      return new Promise((resolve, reject) => {
        if (clientCancelled) {
          reject(new Error('CLIENT_CANCELLED'));
          return;
        }
        const transport = targetUrl.protocol === 'https:' ? https : http;
        const upstreamReq = transport.request(
          targetUrl,
          {
            method: normalizedMethod,
            headers: upstreamHeaders,
            timeout: LLM_PROXY_TIMEOUT_MS,
          },
          (upstreamRes) => {
            const status = upstreamRes.statusCode ?? 502;
            const location = upstreamRes.headers.location;
            if (
              location &&
              redirectsLeft > 0 &&
              [301, 302, 303, 307, 308].includes(status)
            ) {
              upstreamRes.resume();
              try {
                const nextUrl = new URL(location, targetUrl);
                relayOnce(nextUrl, redirectsLeft - 1).then(resolve, reject);
              } catch (err) {
                reject(err);
              }
              return;
            }

            const chunks: Buffer[] = [];
            let totalBytes = 0;
            upstreamRes.on('data', (chunk: Buffer) => {
              const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
              totalBytes += buf.length;
              if (totalBytes > MAX_LLM_PROXY_RESPONSE_BYTES) {
                upstreamRes.destroy();
                reject(new Error('Upstream LLM response exceeded 4MB size limit.'));
                return;
              }
              chunks.push(buf);
            });
            upstreamRes.on('end', () => {
              resolve({
                status,
                contentType: String(upstreamRes.headers['content-type'] ?? ''),
                rawText: Buffer.concat(chunks).toString('utf8'),
              });
            });
            upstreamRes.on('error', reject);
          },
        );

        activeUpstreamReq = upstreamReq;
        upstreamReq.setTimeout(LLM_PROXY_TIMEOUT_MS, () => {
          upstreamReq.destroy(new Error('Local LLM request timed out (120s).'));
        });
        upstreamReq.on('error', reject);
        if (bodyString !== undefined) {
          upstreamReq.write(bodyString);
        }
        upstreamReq.end();
      });
    };

    try {
      const upstream = await relayOnce(parsedUrl, 3);
      if (clientCancelled || res.writableEnded) {
        return;
      }

      res.status(upstream.status);
      if (upstream.contentType.includes('application/json')) {
        res.type('application/json').send(upstream.rawText);
      } else {
        try {
          const parsed = JSON.parse(upstream.rawText);
          res.json(parsed);
        } catch {
          res.send(upstream.rawText);
        }
      }
    } catch (error) {
      if (clientCancelled || res.writableEnded) {
        return;
      }
      const message =
        error instanceof Error ? error.message : 'Local LLM proxy relay failed';
      res.status(502).json({
        error: message,
        code: 'LLM_PROXY_ERROR',
      });
    } finally {
      res.off('close', handleClientClose);
    }
  });

  app.post('/api/parse-facts', apiRateLimiter, async (req, res) => {
    const {
      provider: rawProvider = 'GEMINI_CLOUD',
      policyText = '',
      infraCode = '',
      vendorNames = [],
      modelName = '',
    } = (req.body ?? {}) as {
      provider?: string;
      policyText?: string;
      infraCode?: string;
      vendorNames?: string[];
      modelName?: string;
    };

    const validProviders: CloudLlmProvider[] = [
      'GEMINI_CLOUD',
      'OPENAI_CLOUD',
      'ANTHROPIC_CLOUD',
      'OPENROUTER_CLOUD',
      'CUSTOM_CLOUD',
    ];
    const provider: CloudLlmProvider = validProviders.includes(
      rawProvider as CloudLlmProvider,
    )
      ? (rawProvider as CloudLlmProvider)
      : 'GEMINI_CLOUD';

    if (
      typeof policyText !== 'string' ||
      typeof infraCode !== 'string' ||
      !Array.isArray(vendorNames)
    ) {
      res.status(400).json({
        error: 'Invalid request payload types.',
        code: 'INVALID_PAYLOAD',
      });
      return;
    }

    if (
      policyText.length > MAX_POLICY_CHARS ||
      infraCode.length > MAX_INFRA_CHARS ||
      vendorNames.length > MAX_VENDOR_NAMES
    ) {
      res.status(413).json({
        error:
          'Input exceeds maximum allowed length (100,000 chars per field / 100 vendors).',
        code: 'PAYLOAD_TOO_LARGE',
      });
      return;
    }

    const resolvedModel = sanitizeCloudModelName(provider, modelName);

    const systemInstruction =
      'You are a strict compliance fact extraction parser. Output ONLY valid JSON conforming to the schema. Never invent undisclosed vendors or countries.';

    const prompt = [
      'Analyze the provided Privacy Policy text and Infrastructure/Terraform/IAM code.',
      'Extract exact structured compliance facts into JSON.',
      'Rules:',
      '- claims_domestic_only: true ONLY if the privacy policy explicitly states personal data is stored/processed exclusively domestically or never transferred abroad.',
      '- has_entrustment_disclosure: true if the privacy policy discloses cross-border processing entrustment (처리위탁/보관) or sub-processors.',
      '- has_separate_consent: true ONLY if explicit separate consent for cross-border third-party sharing is indicated.',
      '- disclosed_countries: ISO 2-letter uppercase country codes explicitly named as transfer destinations (US, JP, EU, SG, GB, CN, IN, KR).',
      '- disclosed_vendors: vendor/company names explicitly mentioned in the privacy policy.',
      '- disclosed_items: personal data items mentioned as transferred (e.g., email, prompt_text, user_id).',
      '- disclosed_method_and_time: true if transfer timing and method (e.g., real-time encrypted API/network) are disclosed.',
      '- disclosed_retention_period: true if retention period for transferred data is disclosed.',
      '- disclosed_opt_out_method: true if refusal/opt-out method and consequences are disclosed.',
      '- disclosed_dest_country_law_info: true if recipient country privacy law/surveillance regime (e.g., US FISA/CLOUD Act) is explained.',
      '- has_scc_or_safeguard_notice: true if SCC, DPF, or transfer safeguards are mentioned.',
      '- has_ai_training_opt_out_notice: true if AI model training opt-out or Zero Data Retention (ZDR) is stated.',
      '- has_ai_service_notice: true if the policy or notice explicitly discloses that generative AI / AI-based features are used.',
      '- has_ai_output_label_notice: true if AI-generated content labeling, badge, or watermark notice is stated.',
      '- has_do_not_sell_or_share_notice: true if Do Not Sell or Share / GPC opt-out notice is stated.',
      '- encryption_in_transit / encryption_at_rest: default true unless infra code explicitly disables encryption or uses unencrypted http.',
      '- pii_masked_before_transfer: true if masking/redaction/pseudonymization before transfer is described.',
      '- foreign_iam_access / foreign_kms_control: true if infra code grants remote/foreign IAM access or foreign KMS key control.',
      '- infra_countries: ISO 2-letter uppercase country codes from cloud regions in infraCode (e.g., us-east-1 -> US, ap-northeast-1 -> JP, ap-northeast-2 -> KR, eu-central-1 -> EU).',
      '',
      'Required JSON shape:',
      '{',
      '  "legal_doc": { "exists": boolean, "claims_domestic_only": boolean, "has_separate_consent": boolean, "has_entrustment_disclosure": boolean, "disclosed_countries": string[], "disclosed_vendors": string[], "disclosed_items": string[], "disclosed_method_and_time": boolean, "disclosed_retention_period": boolean, "disclosed_opt_out_method": boolean, "disclosed_dest_country_law_info": boolean, "has_scc_or_safeguard_notice": boolean, "has_ai_training_opt_out_notice": boolean, "has_ai_service_notice": boolean, "has_ai_output_label_notice": boolean, "has_do_not_sell_or_share_notice": boolean },',
      '  "security": { "encryption_in_transit": boolean, "encryption_at_rest": boolean, "pii_masked_before_transfer": boolean },',
      '  "virtual_transfer": { "foreign_iam_access": boolean, "foreign_kms_control": boolean },',
      '  "infra_countries": string[]',
      '}',
      '',
      `Detected SDK Vendors context: ${JSON.stringify(vendorNames)}`,
      '',
      '=== PRIVACY POLICY TEXT ===',
      policyText || '(empty)',
      '',
      '=== INFRASTRUCTURE CODE (TERRAFORM / IAM JSON) ===',
      infraCode || '(empty)',
    ].join('\n');

    if (provider === 'GEMINI_CLOUD') {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'GEMINI_API_KEY is not configured on the server.',
          code: 'MISSING_SERVER_KEY',
        });
        return;
      }

      try {
        const response = await ai.models.generateContent({
          model: resolvedModel,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                legal_doc: {
                  type: Type.OBJECT,
                  properties: {
                    exists: { type: Type.BOOLEAN },
                    claims_domestic_only: { type: Type.BOOLEAN },
                    has_separate_consent: { type: Type.BOOLEAN },
                    has_entrustment_disclosure: { type: Type.BOOLEAN },
                    disclosed_countries: { type: Type.ARRAY, items: { type: Type.STRING } },
                    disclosed_vendors: { type: Type.ARRAY, items: { type: Type.STRING } },
                    disclosed_items: { type: Type.ARRAY, items: { type: Type.STRING } },
                    disclosed_method_and_time: { type: Type.BOOLEAN },
                    disclosed_retention_period: { type: Type.BOOLEAN },
                    disclosed_opt_out_method: { type: Type.BOOLEAN },
                    disclosed_dest_country_law_info: { type: Type.BOOLEAN },
                    has_scc_or_safeguard_notice: { type: Type.BOOLEAN },
                    has_ai_training_opt_out_notice: { type: Type.BOOLEAN },
                    has_ai_service_notice: { type: Type.BOOLEAN },
                    has_ai_output_label_notice: { type: Type.BOOLEAN },
                    has_do_not_sell_or_share_notice: { type: Type.BOOLEAN },
                  },
                },
                security: {
                  type: Type.OBJECT,
                  properties: {
                    encryption_in_transit: { type: Type.BOOLEAN },
                    encryption_at_rest: { type: Type.BOOLEAN },
                    pii_masked_before_transfer: { type: Type.BOOLEAN },
                  },
                },
                virtual_transfer: {
                  type: Type.OBJECT,
                  properties: {
                    foreign_iam_access: { type: Type.BOOLEAN },
                    foreign_kms_control: { type: Type.BOOLEAN },
                  },
                },
                infra_countries: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
            },
          },
        });

        const rawText = (response.text ?? '').trim();
        const parsed = parseJsonWithRepair(rawText);
        res.json({ parsed, provider, model: resolvedModel });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Gemini API error';
        res.status(502).json({ error: message, code: 'UPSTREAM_GEMINI_ERROR' });
      }
      return;
    }

    if (provider === 'ANTHROPIC_CLOUD') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!isConfiguredSecret(apiKey)) {
        res.status(503).json({
          error: 'ANTHROPIC_API_KEY is not configured on the server.',
          code: 'MISSING_SERVER_KEY',
        });
        return;
      }

      try {
        const upstreamRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey!.trim(),
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: resolvedModel,
            max_tokens: 4096,
            temperature: 0.1,
            system: systemInstruction,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (!upstreamRes.ok) {
          const errText = await upstreamRes.text().catch(() => '');
          res.status(502).json({
            error: `Anthropic HTTP ${upstreamRes.status}${errText ? `: ${errText.slice(0, 200)}` : ''}`,
            code: 'UPSTREAM_ANTHROPIC_ERROR',
          });
          return;
        }

        const data = (await upstreamRes.json()) as {
          content?: Array<{ type?: string; text?: string }>;
        };
        const rawText = (data.content ?? [])
          .filter((c) => c.type === 'text' && typeof c.text === 'string')
          .map((c) => c.text)
          .join('\n')
          .trim();

        const parsed = parseJsonWithRepair(rawText);
        res.json({ parsed, provider, model: resolvedModel });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Anthropic API error';
        res.status(502).json({
          error: message,
          code: 'UPSTREAM_ANTHROPIC_ERROR',
        });
      }
      return;
    }

    // OpenAI, OpenRouter, or Custom OpenAI-compatible Cloud Endpoint
    let targetUrl: string;
    let bearerKey: string | undefined;
    const extraHeaders: Record<string, string> = {};

    if (provider === 'OPENAI_CLOUD') {
      bearerKey = process.env.OPENAI_API_KEY;
      if (!isConfiguredSecret(bearerKey)) {
        res.status(503).json({
          error: 'OPENAI_API_KEY is not configured on the server.',
          code: 'MISSING_SERVER_KEY',
        });
        return;
      }
      targetUrl = 'https://api.openai.com/v1/chat/completions';
    } else if (provider === 'OPENROUTER_CLOUD') {
      bearerKey = process.env.OPENROUTER_API_KEY;
      if (!isConfiguredSecret(bearerKey)) {
        res.status(503).json({
          error: 'OPENROUTER_API_KEY is not configured on the server.',
          code: 'MISSING_SERVER_KEY',
        });
        return;
      }
      targetUrl = 'https://openrouter.ai/api/v1/chat/completions';
      extraHeaders['X-Title'] = 'Border Checker';
    } else {
      const baseUrl = process.env.CUSTOM_LLM_BASE_URL;
      bearerKey = process.env.CUSTOM_LLM_API_KEY;
      if (!isConfiguredSecret(baseUrl) || !isConfiguredSecret(bearerKey)) {
        res.status(503).json({
          error:
            'CUSTOM_LLM_BASE_URL or CUSTOM_LLM_API_KEY is not configured on the server.',
          code: 'MISSING_SERVER_KEY',
        });
        return;
      }
      try {
        targetUrl = normalizeCustomChatUrl(baseUrl!).toString();
      } catch (err) {
        res.status(500).json({
          error:
            err instanceof Error
              ? err.message
              : 'Invalid CUSTOM_LLM_BASE_URL configuration.',
          code: 'INVALID_CUSTOM_ENDPOINT',
        });
        return;
      }
    }

    try {
      const requestBody: Record<string, unknown> = {
        model: resolvedModel,
        temperature: 0.1,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: prompt },
        ],
      };
      if (provider === 'OPENAI_CLOUD') {
        requestBody.response_format = { type: 'json_object' };
      }

      const upstreamRes = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerKey!.trim()}`,
          ...extraHeaders,
        },
        body: JSON.stringify(requestBody),
      });

      if (!upstreamRes.ok) {
        const errText = await upstreamRes.text().catch(() => '');
        res.status(502).json({
          error: `Upstream HTTP ${upstreamRes.status}${errText ? `: ${errText.slice(0, 200)}` : ''}`,
          code: 'UPSTREAM_LLM_ERROR',
        });
        return;
      }

      const data = (await upstreamRes.json()) as {
        choices?: Array<{
          message?: { content?: string; reasoning_content?: string };
        }>;
      };
      const rawText =
        data.choices?.[0]?.message?.content ??
        data.choices?.[0]?.message?.reasoning_content ??
        '';
      const parsed = parseJsonWithRepair(rawText);
      res.json({ parsed, provider, model: resolvedModel });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Upstream LLM API error';
      res.status(502).json({ error: message, code: 'UPSTREAM_LLM_ERROR' });
    }
  });

  app.post('/api/evaluate', apiRateLimiter, (req, res) => {
    const body = (req.body ?? {}) as {
      facts?: CanonicalFactModel;
      policyText?: string;
      infraCode?: string;
      depsContent?: string;
      depsFileName?: string;
      businessCountry?: string;
      dataSubjectCountries?: string[];
      industryDomain?: IndustryDomain;
    };

    if (body.facts && typeof body.facts === 'object') {
      const result = evaluateFacts(body.facts, DEFAULT_POLICY_PACKS);
      res.json({ facts: body.facts, result });
      return;
    }

    const policyText = typeof body.policyText === 'string' ? body.policyText.slice(0, MAX_POLICY_CHARS) : '';
    const infraCode = typeof body.infraCode === 'string' ? body.infraCode.slice(0, MAX_INFRA_CHARS) : '';
    const depsContent = typeof body.depsContent === 'string' ? body.depsContent.slice(0, MAX_INFRA_CHARS) : '';
    const depsFileName = typeof body.depsFileName === 'string' ? body.depsFileName : 'package.json';
    const businessCountry = (typeof body.businessCountry === 'string' ? body.businessCountry : 'KR').toUpperCase();
    const subjectCountries =
      Array.isArray(body.dataSubjectCountries) && body.dataSubjectCountries.length > 0
        ? body.dataSubjectCountries.map((c) => String(c).toUpperCase())
        : [businessCountry];
    const industryDomain: IndustryDomain = body.industryDomain ?? 'AI_SAAS';

    const scan = depsContent ? scanDependencyFile(depsFileName, depsContent) : null;
    const detectedVendors = scan?.detectedVendors ?? [];
    const heuristic = extractHeuristicPayload(
      policyText,
      infraCode,
      detectedVendors,
      policyText.trim().length === 0,
    );

    const regionCountries = (scan?.detectedRegions ?? [])
      .map((id) => STACK_BUILDER_REGIONS.find((r) => r.id === id)?.countryCode)
      .filter((c): c is string => Boolean(c));
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
        data_subject_countries: subjectCountries,
        industry_domain: industryDomain,
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
        disclosed_dest_country_law_info: heuristic.legal_doc?.disclosed_dest_country_law_info ?? false,
        has_scc_or_safeguard_notice: heuristic.legal_doc?.has_scc_or_safeguard_notice ?? false,
        has_ai_training_opt_out_notice: heuristic.legal_doc?.has_ai_training_opt_out_notice ?? false,
        has_ai_service_notice: heuristic.legal_doc?.has_ai_service_notice ?? false,
        has_ai_output_label_notice: heuristic.legal_doc?.has_ai_output_label_notice ?? false,
        has_do_not_sell_or_share_notice: heuristic.legal_doc?.has_do_not_sell_or_share_notice ?? false,
      },
    };

    const result = evaluateFacts(facts, DEFAULT_POLICY_PACKS);
    res.json({ facts, result });
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Border Checker server listening on http://0.0.0.0:${PORT}`);
  });
  httpServer.requestTimeout = 0;
  httpServer.timeout = 0;
}

startServer();
