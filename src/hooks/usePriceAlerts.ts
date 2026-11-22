import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchTokenPrices } from '../lib/api';
import type {
  TokenPriceAlert,
  TokenPriceAlertCondition,
  TokenPriceQuote,
  TriggeredAlertNotification,
  WalletAnalysis,
} from '../types';

export const SOL_MINT = 'So11111111111111111111111111111111111111112';
const POLL_INTERVAL_MS = 15000;

function storageKey(userId: string): string {
  return `solidusx_price_alerts_${userId}`;
}

function loadSavedAlerts(userId: string): TokenPriceAlert[] {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as TokenPriceAlert[]) : [];
  } catch {
    return [];
  }
}

function saveAlerts(userId: string, alerts: TokenPriceAlert[]): void {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(alerts));
  } catch {
    // Ignore storage quota errors
  }
}

async function dispatchBrowserNotification(title: string, body: string): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: `solidusx-alert-${Date.now()}`,
        });
        return;
      }
    }
    new Notification(title, { body, icon: '/pwa-192x192.png' });
  } catch {
    // Browser notification unavailable in embedded context; in-app toast always renders
  }
}

export function usePriceAlerts(userId: string | null, analysis: WalletAnalysis | null) {
  const [alerts, setAlerts] = useState<TokenPriceAlert[]>(() =>
    userId ? loadSavedAlerts(userId) : []
  );
  const [prices, setPrices] = useState<Record<string, TokenPriceQuote>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<TriggeredAlertNotification[]>([]);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'denied';
  });

  const alertsRef = useRef(alerts);
  alertsRef.current = alerts;

  useEffect(() => {
    if (!userId) {
      setAlerts([]);
      return;
    }
    setAlerts(loadSavedAlerts(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    saveAlerts(userId, alerts);
  }, [userId, alerts]);

  // All mints to monitor: scanned portfolio tokens + SOL + any armed alert mints
  const trackedMints = useMemo(() => {
    const set = new Set<string>();
    if (analysis) {
      set.add(SOL_MINT);
      for (const tok of analysis.topTokens) {
        if (tok.mint) set.add(tok.mint);
      }
    }
    for (const a of alerts) {
      set.add(a.mint);
    }
    return Array.from(set).slice(0, 25);
  }, [analysis, alerts]);

  const evaluateAlertsAgainstPrices = useCallback(
    (latestPrices: Record<string, TokenPriceQuote>) => {
      const currentAlerts = alertsRef.current;
      const armed = currentAlerts.filter((a) => !a.triggeredAt);
      if (armed.length === 0) return;

      const newlyTriggered: TriggeredAlertNotification[] = [];
      const nowIso = new Date().toISOString();

      const nextAlerts = currentAlerts.map((alert) => {
        if (alert.triggeredAt) return alert;
        const quote = latestPrices[alert.mint];
        if (!quote || !(quote.priceUsd > 0)) return alert;

        const hit =
          (alert.condition === 'above' && quote.priceUsd >= alert.targetPriceUsd) ||
          (alert.condition === 'below' && quote.priceUsd <= alert.targetPriceUsd);

        if (!hit) return alert;

        newlyTriggered.push({
          alertId: alert.id,
          mint: alert.mint,
          symbol: alert.symbol,
          condition: alert.condition,
          targetPriceUsd: alert.targetPriceUsd,
          livePriceUsd: quote.priceUsd,
          triggeredAt: nowIso,
        });

        return {
          ...alert,
          triggeredAt: nowIso,
          triggeredPriceUsd: quote.priceUsd,
        };
      });

      if (newlyTriggered.length > 0) {
        setAlerts(nextAlerts);
        setNotifications((prev) => [...newlyTriggered, ...prev].slice(0, 5));

        for (const item of newlyTriggered) {
          const dirLabel = item.condition === 'above' ? 'rose above' : 'dropped below';
          void dispatchBrowserNotification(
            `SolidusX AI Alert: ${item.symbol}`,
            `${item.symbol} ${dirLabel} $${item.targetPriceUsd.toFixed(4)} — now $${item.livePriceUsd.toFixed(4)}`
          );
        }
      }
    },
    []
  );

  const refreshPrices = useCallback(async () => {
    if (trackedMints.length === 0) return;
    setRefreshing(true);
    try {
      const latest = await fetchTokenPrices(trackedMints);
      if (Object.keys(latest).length > 0) {
        setPrices((prev) => ({ ...prev, ...latest }));
        evaluateAlertsAgainstPrices(latest);
      }
    } catch {
      // Non-blocking price poll
    } finally {
      setRefreshing(false);
    }
  }, [trackedMints, evaluateAlertsAgainstPrices]);

  // Seed SOL spot price from wallet analysis immediately when scanned
  useEffect(() => {
    if (analysis && analysis.solPriceUsd > 0) {
      setPrices((prev) => ({
        ...prev,
        [SOL_MINT]: prev[SOL_MINT] || {
          mint: SOL_MINT,
          symbol: 'SOL',
          priceUsd: analysis.solPriceUsd,
          change24hPct: null,
        },
      }));
    }
  }, [analysis]);

  // Poll live prices whenever tracked mints exist
  useEffect(() => {
    if (trackedMints.length === 0) return;
    void refreshPrices();
    const timer = window.setInterval(() => {
      void refreshPrices();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [trackedMints.join(','), refreshPrices]);

  const addAlert = useCallback(
    (mint: string, symbol: string, condition: TokenPriceAlertCondition, targetPriceUsd: number) => {
      const newAlert: TokenPriceAlert = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        mint,
        symbol,
        condition,
        targetPriceUsd,
        createdAt: new Date().toISOString(),
        triggeredAt: null,
        triggeredPriceUsd: null,
      };
      setAlerts((prev) => {
        const next = [newAlert, ...prev];
        alertsRef.current = next;
        return next;
      });
      // Immediately evaluate if we already have a live quote for this mint
      const liveQuote = prices[mint];
      if (liveQuote && liveQuote.priceUsd > 0) {
        window.setTimeout(() => evaluateAlertsAgainstPrices({ [mint]: liveQuote }), 0);
      }
    },
    [prices, evaluateAlertsAgainstPrices]
  );

  const removeAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    setNotifications((prev) => prev.filter((n) => n.alertId !== id));
  }, []);

  const rearmAlert = useCallback((id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, triggeredAt: null, triggeredPriceUsd: null } : a))
    );
  }, []);

  const dismissNotification = useCallback((alertId: string) => {
    setNotifications((prev) => prev.filter((n) => n.alertId !== alertId));
  }, []);

  const requestBrowserPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const perm = await Notification.requestPermission();
      setBrowserPermission(perm);
    } catch {
      // Ignore permission rejection
    }
  }, []);

  return {
    alerts,
    prices,
    refreshing,
    notifications,
    browserPermission,
    refreshPrices,
    addAlert,
    removeAlert,
    rearmAlert,
    dismissNotification,
    requestBrowserPermission,
  };
}
