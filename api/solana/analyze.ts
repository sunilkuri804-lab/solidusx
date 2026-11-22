import {
  analyzeSolanaWalletOnChain,
  authenticateRequest,
  BASE58_REGEX,
  isVercelSupabaseConfigured,
  type ApiRequest,
  type ApiResponse,
} from '../_shared.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (isVercelSupabaseConfigured()) {
    const caller = await authenticateRequest(req);
    if (!caller) {
      res.status(401).json({ error: 'Authentication required. Please sign in to continue.' });
      return;
    }
  }

  const rawAddress = typeof req.body?.walletAddress === 'string' ? req.body.walletAddress.trim() : '';
  if (!BASE58_REGEX.test(rawAddress)) {
    res.status(400).json({
      error: 'Invalid Solana wallet address. Please enter a valid 32–44 character Base58 public address.',
    });
    return;
  }

  try {
    const analysis = await analyzeSolanaWalletOnChain(rawAddress);
    res.status(200).json({ analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to fetch Solana wallet data.';
    res.status(502).json({ error: message });
  }
}
