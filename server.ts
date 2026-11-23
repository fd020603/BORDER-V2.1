import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'node:http';
import https from 'node:https';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim().length === 0) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    const geminiConfigured = Boolean(getGeminiClient());
    res.json({
      ok: true,
      geminiConfigured,
      defaultModel: 'gemini-4-hydrogen',
    });
  });

  app.post('/api/llm-proxy', async (req, res) => {
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

    req.socket?.setTimeout(0);
    res.socket?.setTimeout(0);

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

    const relayOnce = (
      targetUrl: URL,
      redirectsLeft: number,
    ): Promise<{ status: number; contentType: string; rawText: string }> =>
      new Promise((resolve, reject) => {
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
            timeout: 0,
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
            upstreamRes.on('data', (chunk: Buffer) => {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
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
        upstreamReq.setTimeout(0);
        upstreamReq.on('error', reject);
        if (bodyString !== undefined) {
          upstreamReq.write(bodyString);
        }
        upstreamReq.end();
      });

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

  app.post('/api/parse-facts', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured on the server.',
        code: 'MISSING_SERVER_KEY',
      });
      return;
    }

    const { policyText = '', infraCode = '', vendorNames = [], modelName = 'gemini-4-hydrogen' } =
      (req.body ?? {}) as {
        policyText?: string;
        infraCode?: string;
        vendorNames?: string[];
        modelName?: string;
      };

    const allowedModel =
      modelName === 'gemini-3.1-flash-lite' || modelName === 'gemini-4-hydrogen'
        ? modelName
        : 'gemini-4-hydrogen';

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
      '- has_do_not_sell_or_share_notice: true if Do Not Sell or Share / GPC opt-out notice is stated.',
      '- encryption_in_transit / encryption_at_rest: default true unless infra code explicitly disables encryption or uses unencrypted http.',
      '- pii_masked_before_transfer: true if masking/redaction/pseudonymization before transfer is described.',
      '- foreign_iam_access / foreign_kms_control: true if infra code grants remote/foreign IAM access or foreign KMS key control.',
      '- infra_countries: ISO 2-letter uppercase country codes from cloud regions in infraCode (e.g., us-east-1 -> US, ap-northeast-1 -> JP, ap-northeast-2 -> KR, eu-central-1 -> EU).',
      '',
      `Detected SDK Vendors context: ${JSON.stringify(vendorNames)}`,
      '',
      '=== PRIVACY POLICY TEXT ===',
      policyText || '(empty)',
      '',
      '=== INFRASTRUCTURE CODE (TERRAFORM / IAM JSON) ===',
      infraCode || '(empty)',
    ].join('\n');

    try {
      const response = await ai.models.generateContent({
        model: allowedModel,
        contents: prompt,
        config: {
          systemInstruction:
            'You are a strict compliance fact extraction parser. Output ONLY valid JSON conforming to the schema. Never invent undisclosed vendors or countries.',
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
      const parsed = JSON.parse(rawText);
      res.json({ parsed, model: allowedModel });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gemini API error';
      res.status(502).json({ error: message, code: 'UPSTREAM_GEMINI_ERROR' });
    }
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
