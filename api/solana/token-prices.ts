import { fetchSolanaTokenPrices, type ApiRequest, type ApiResponse } from '../_shared.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const rawMints = req.query?.mints;
  const mintsCsv = Array.isArray(rawMints) ? rawMints.join(',') : rawMints || '';
  const mints = mintsCsv
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  if (mints.length === 0) {
    res.status(400).json({ error: 'Provide at least one Solana token mint.' });
    return;
  }

  try {
    const prices = await fetchSolanaTokenPrices(mints);
    res.status(200).json({ prices });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to fetch token prices.';
    res.status(502).json({ error: message });
  }
}
