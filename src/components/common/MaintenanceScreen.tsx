import React from 'react';
import { AlertTriangle, Wrench, Shield, RefreshCw } from 'lucide-react';
import { AppSettings } from '../../types/index.ts';

interface MaintenanceScreenProps {
  settings?: AppSettings | null;
  onAdminLogin: () => void;
}

export const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({
  settings,
  onAdminLogin,
}) => {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-12 text-center animate-fade-in">
      <div className="max-w-xl w-full bg-[#13151b] border border-amber-900/40 rounded-3xl p-8 sm:p-12 shadow-2xl shadow-amber-950/20 relative overflow-hidden">
        {/* Glow backdrop */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Brand Icon */}
        <div className="relative mx-auto w-24 h-24 mb-6">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-amber-500/30 to-red-600/30 blur-lg animate-pulse" />
          <img
            src="/apple-touch-icon.png"
            alt="तपाईंको TV Logo"
            className="relative w-24 h-24 rounded-2xl object-cover shadow-xl border border-neutral-800"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/logo.svg';
            }}
          />
          <div className="absolute -bottom-2 -right-2 p-1.5 rounded-full bg-amber-500 text-neutral-950 shadow-md">
            <Wrench className="w-4 h-4" />
          </div>
        </div>

        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          </span>
          <span>प्रणाली मर्मत कार्य जारी / Maintenance In Progress</span>
        </div>

        {/* Headings */}
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-2">
          हामी छिट्टै फर्कनेछौं
        </h1>
        <h2 className="text-sm sm:text-base font-semibold text-neutral-400 mb-5">
          {settings?.appName || 'तपाईंको TV'} — System Upgrades in Progress
        </h2>

        {/* Description */}
        <div className="space-y-3 text-neutral-300 text-xs sm:text-sm leading-relaxed mb-8 bg-neutral-900/60 p-4 rounded-2xl border border-neutral-800/80">
          <p className="font-medium text-amber-200/90">
            तपाईंको TV मा सर्भर स्तरोन्नति, स्ट्रिम शुद्धिकरण तथा डाटाबेस अनुकूलन कार्य भइरहेको छ।
          </p>
          <p className="text-neutral-400 text-xs">
            We are performing scheduled maintenance to upgrade streaming capacity and enhance performance. Live channels and broadcasts will automatically resume shortly.
          </p>
        </div>

        {/* Live sync indicator */}
        <div className="flex items-center justify-center gap-2 text-[11px] text-neutral-400 mb-8">
          <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
          <span>Real-time sync active — this page will automatically unlock once live.</span>
        </div>

        {/* Admin Login portal */}
        <div className="pt-4 border-t border-neutral-800/80 flex items-center justify-center">
          <button
            onClick={onAdminLogin}
            className="inline-flex items-center gap-2 text-xs font-medium text-neutral-400 hover:text-amber-400 transition-colors py-1.5 px-3 rounded-lg hover:bg-neutral-900 cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5 text-neutral-400" />
            <span>Authorized Administrator Access</span>
          </button>
        </div>
      </div>
    </div>
  );
};
