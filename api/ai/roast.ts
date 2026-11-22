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
      'Write a witty, honest, sharp 4-line trading roast strictly in English for this Solana wallet.',
      'If Trades Count is 0, playfully roast them for sitting on the sidelines or holding an untouched wallet.',
      'Do not use emojis or markdown. Keep each of the 4 lines punchy and grounded in the numbers.',
      '',
      formatWalletContextForPrompt(analysis),
    ].join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'You are SolidusX AI, a sharp Solana portfolio analyst. Respond strictly in English.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            roastTitle: { type: Type.STRING },
            lines: { type: Type.ARRAY, items: { type: Type.STRING } },
            verdict: { type: Type.STRING },
          },
          required: ['roastTitle', 'lines', 'verdict'],
        },
      },
    });

    const parsed = JSON.parse((response.text || '{}').trim()) as {
      roastTitle?: string;
      lines?: string[];
      verdict?: string;
    };
    res.status(200).json({
      roastTitle: parsed.roastTitle || 'Wallet Reality Check',
      lines: (parsed.lines || []).slice(0, 4),
      verdict: parsed.verdict || 'Keep your risk tight and your entries deliberate.',
      cached: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini AI request failed.';
    res.status(502).json({ error: message });
  }
}
