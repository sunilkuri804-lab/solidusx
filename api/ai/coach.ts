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
  const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const userMessage = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

  if (!userMessage) {
    res.status(400).json({ error: 'Please enter a message for your AI Coach.' });
    return;
  }

  try {
    const ai = getGeminiClient();
    const history = rawMessages
      .slice(-10)
      .filter((m: unknown): m is { role: 'user' | 'assistant'; content: string } => {
        return (
          Boolean(m) &&
          typeof (m as { content?: unknown }).content === 'string' &&
          ((m as { role?: unknown }).role === 'user' ||
            (m as { role?: unknown }).role === 'assistant')
        );
      })
      .map((m: { role: 'user' | 'assistant'; content: string }) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const chat = ai.chats.create({
      model: 'gemini-4-hydrogen',
      history,
      config: {
        systemInstruction: [
          'You are SolidusX AI Coach, a disciplined, pragmatic Solana portfolio and trading coach.',
          'Always respond strictly in clear English (never Hindi or other languages).',
          'Keep answers concise, actionable, and grounded in the scanned wallet metrics below.',
          'Do not give guaranteed financial advice; frame recommendations around risk management, fee efficiency, and execution.',
          '',
          'Scanned Wallet Context:',
          formatWalletContextForPrompt(analysis),
        ].join('\n'),
      },
    });

    const response = await chat.sendMessage({ message: userMessage });
    const reply = (
      response.text || 'I could not generate advice right now. Please try again.'
    ).trim();

    res.status(200).json({ reply, cached: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI Coach failed to respond.';
    res.status(502).json({ error: message });
  }
}
