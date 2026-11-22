import { Type } from '@google/genai';
import {
  authenticateRequest,
  formatWalletContextForPrompt,
  getGeminiClient,
  type ApiRequest,
  type ApiResponse,
} from '../_shared.js';
import type { WalletAnalysis } from '../../src/types';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const caller = await authenticateRequest(req);
  if (!caller) {
    res.status(401).json({ error: 'Authentication required. Please sign in to continue.' });
    return;
  }
  if (caller.tier === 'Free') {
    res.status(403).json({
      error: 'PRO_REQUIRED',
      message: 'All 4 AI tools require a Pro or Super subscription. Upgrade to unlock.',
    });
    return;
  }

  const analysis = (req.body?.walletContext || null) as Partial<WalletAnalysis> | null;

  try {
    const ai = getGeminiClient();
    const prompt = [
      'Run a What-If Time Machine simulation strictly in English for this Solana wallet.',
      'Estimate realistic missed profits on tokens sold too early (or if 0 trades, simulate what disciplined entries in core Solana assets like SOL, JUP, and BONK would have yielded).',
      'Ground the numbers sensibly in the wallet metrics below.',
      '',
      formatWalletContextForPrompt(analysis),
    ].join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'You are SolidusX AI Time Machine. Provide realistic, clearly framed hypothetical holding simulations strictly in English.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            totalMissedUsd: { type: Type.NUMBER },
            scenarios: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  token: { type: Type.STRING },
                  action: { type: Type.STRING },
                  actualOutcome: { type: Type.STRING },
                  simulatedOutcome: { type: Type.STRING },
                  missedGainUsd: { type: Type.NUMBER },
                },
                required: ['token', 'action', 'actualOutcome', 'simulatedOutcome', 'missedGainUsd'],
              },
            },
          },
          required: ['summary', 'totalMissedUsd', 'scenarios'],
        },
      },
    });

    const parsed = JSON.parse((response.text || '{}').trim()) as {
      summary?: string;
      totalMissedUsd?: number;
      scenarios?: Array<{
        token: string;
        action: string;
        actualOutcome: string;
        simulatedOutcome: string;
        missedGainUsd: number;
      }>;
    };

    res.status(200).json({
      summary:
        parsed.summary ||
        'Holding conviction often outperforms rapid rotation on high-beta Solana assets.',
      totalMissedUsd: Number(parsed.totalMissedUsd || 0),
      scenarios: (parsed.scenarios || []).slice(0, 3),
      cached: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini AI request failed.';
    res.status(502).json({ error: message });
  }
}
