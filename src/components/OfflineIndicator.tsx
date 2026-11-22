import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-16 md:bottom-4 left-4 right-4 sm:right-auto z-40 bg-[#13151B] border border-amber-500/40 rounded-xl px-3.5 py-2.5 flex items-center gap-2.5 text-xs font-medium text-amber-200 shadow-lg"
    >
      <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
      <span>Offline Mode — Cached shell loaded. Reconnect for live Solana &amp; AI updates.</span>
    </div>
  );
};
