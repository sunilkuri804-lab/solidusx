import { Type } from '@google/genai';
import {
  analyzeSolanaWalletOnChain,
  authenticateRequest,
  BASE58_REGEX,
  formatWalletContextForPrompt,
  getGeminiClient,
  type ApiRequest,
  type ApiResponse,
} from '../_shared.js';

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

  const targetAddress =
    typeof req.body?.targetWalletAddress === 'string' ? req.body.targetWalletAddress.trim() : '';

  if (!BASE58_REGEX.test(targetAddress)) {
    res.status(400).json({ error: 'Enter a valid Solana wallet address to decode.' });
    return;
  }

  try {
    const whaleAnalysis = await analyzeSolanaWalletOnChain(targetAddress);
    const ai = getGeminiClient();
    const prompt = [
      'Analyze this Solana wallet as a Copy-Whale Decoder strictly in English.',
      'Explain its entry/exit strategy, risk profile, conviction score (0-100), and one actionable takeaway for copy-traders.',
      '',
      formatWalletContextForPrompt(whaleAnalysis),
    ].join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'You are SolidusX AI Copy-Whale Decoder. Deliver concise, objective strategy analysis strictly in English.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            archetype: { type: Type.STRING },
            convictionScore: { type: Type.NUMBER },
            entryStyle: { type: Type.STRING },
            exitDiscipline: { type: Type.STRING },
            riskProfile: { type: Type.STRING },
            actionableTakeaway: { type: Type.STRING },
          },
          required: [
            'archetype',
            'convictionScore',
            'entryStyle',
            'exitDiscipline',
            'riskProfile',
            'actionableTakeaway',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text || '{}').trim()) as {
      archetype?: string;
      convictionScore?: number;
      entryStyle?: string;
      exitDiscipline?: string;
      riskProfile?: string;
      actionableTakeaway?: string;
    };

    res.status(200).json({
      walletAddress: targetAddress,
      archetype: parsed.archetype || 'Solana Market Participant',
      convictionScore: Math.max(0, Math.min(100, Math.round(Number(parsed.convictionScore ?? 50)))),
      entryStyle: parsed.entryStyle || 'Selective accumulation around liquid Solana pairs.',
      exitDiscipline: parsed.exitDiscipline || 'Staged exits into momentum.',
      riskProfile: parsed.riskProfile || 'Moderate on-chain exposure.',
      actionableTakeaway:
        parsed.actionableTakeaway || 'Wait for confirmed on-chain volume before mirroring entries.',
      metrics: {
        tradesCount: whaleAnalysis.tradesCount,
        winRate: whaleAnalysis.winRate,
        totalNetPnlUsd: whaleAnalysis.totalNetPnlUsd,
        solBalance: whaleAnalysis.solBalance,
      },
      cached: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to decode wallet.';
    res.status(502).json({ error: message });
  }
}
