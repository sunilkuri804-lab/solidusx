import { fetchSol7DayHistory, type ApiRequest, type ApiResponse } from '../_shared.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const history = await fetchSol7DayHistory();
    res.status(200).json(history);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to fetch SOL history.';
    res.status(502).json({ error: message });
  }
}
