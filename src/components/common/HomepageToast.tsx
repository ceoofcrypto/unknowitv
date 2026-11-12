import React, { useState } from 'react';
import { Announcement } from '../../types/index.ts';
import {
  Megaphone,
  Radio,
  AlertTriangle,
  Sparkles,
  X,
  Trash2,
  Check,
  Download,
  ExternalLink,
} from 'lucide-react';

interface HomepageToastProps {
  announcements: Announcement[];
  isAdmin?: boolean;
  onDeleteAnnouncement?: (id: string) => Promise<void>;
}

export const HomepageToast: React.FC<HomepageToastProps> = ({
  announcements,
  isAdmin = false,
  onDeleteAnnouncement,
}) => {
  const [dismissedMap, setDismissedMap] = useState<Record<string, boolean>>(() => {
    try {
      const stored = sessionStorage.getItem('tapaiko_dismissed_popups');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Filter announcements designated for toast/popup or both
  const activePopups = announcements.filter((a) => {
    if (!a.isActive || !a.isPublished) return false;
    if (dismissedMap[a.id]) return false;
    // Default to 'both' if displayLocation is not specified
    const loc = a.displayLocation || 'both';
    return loc === 'toast' || loc === 'both';
  });

  if (activePopups.length === 0) return null;

  // Show the primary active popup card
  const toast = activePopups[0];

  const handleDismiss = (id: string) => {
    const next = { ...dismissedMap, [id]: true };
    setDismissedMap(next);
    try {
      sessionStorage.setItem('tapaiko_dismissed_popups', JSON.stringify(next));
    } catch {
      // Ignore
    }
  };

  const handleDelete = async (id: string) => {
    if (!onDeleteAnnouncement) return;
    if (!window.confirm(`Are you sure you want to delete "${toast.title}" for everyone?`)) return;
    try {
      setIsDeleting(id);
      await onDeleteAnnouncement(id);
      handleDismiss(id);
    } finally {
      setIsDeleting(null);
    }
  };

  const type = toast.type || 'info';

  const typeConfig = {
    live: {
      badgeBg: 'bg-red-500/20 text-red-400 border-red-500/40',
      glow: 'shadow-red-950/40 border-red-500/30',
      ambientBg: 'from-red-600/10 via-transparent to-transparent',
      icon: <Radio className="w-4 h-4 text-red-400 animate-pulse" />,
      label: 'LIVE BROADCAST ALERT',
    },
    warning: {
      badgeBg: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      glow: 'shadow-amber-950/40 border-amber-500/30',
      ambientBg: 'from-amber-600/10 via-transparent to-transparent',
      icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
      label: 'IMPORTANT NOTICE',
    },
    success: {
      badgeBg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
      glow: 'shadow-emerald-950/40 border-emerald-500/30',
      ambientBg: 'from-emerald-600/10 via-transparent to-transparent',
      icon: <Sparkles className="w-4 h-4 text-emerald-400" />,
      label: 'SPECIAL ANNOUNCEMENT',
    },
    info: {
      badgeBg: 'bg-sky-500/20 text-sky-400 border-sky-500/40',
      glow: 'shadow-sky-950/40 border-sky-500/30',
      ambientBg: 'from-sky-600/10 via-transparent to-transparent',
      icon: <Megaphone className="w-4 h-4 text-sky-400" />,
      label: 'MAIN MESSAGE',
    },
  }[type];

  const actionType = toast.actionType || 'okay';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="popup-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        className={`relative bg-[#13151b] border border-neutral-700/80 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200 ${typeConfig.glow}`}
      >
        {/* Subtle Ambient Radial Glow */}
        <div
          className={`absolute -top-24 -right-24 w-64 h-64 bg-gradient-to-br ${typeConfig.ambientBg} rounded-full blur-3xl pointer-events-none`}
        />

        {/* Top Header Row: Badge & Dismiss/Delete Buttons */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase border ${typeConfig.badgeBg}`}
            >
              {typeConfig.icon}
              <span>{typeConfig.label}</span>
            </span>
          </div>

          <div className="flex items-center gap-1">
            {isAdmin && onDeleteAnnouncement && (
              <button
                onClick={() => handleDelete(toast.id)}
                disabled={isDeleting === toast.id}
                title="Delete Announcement for Everyone (Admin)"
                className="p-2 rounded-xl text-neutral-400 hover:text-red-400 hover:bg-red-950/50 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => handleDismiss(toast.id)}
              aria-label="Close notification"
              title="Close popup"
              className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Optional Postcard Image */}
        {toast.imageUrl && (
          <div className="relative w-full h-44 sm:h-52 rounded-2xl overflow-hidden mb-5 border border-neutral-800 shadow-inner bg-black">
            <img
              src={toast.imageUrl}
              alt={toast.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Main Content */}
        <div className="space-y-2 mb-6">
          <h3
            id="popup-title"
            className="text-xl sm:text-2xl font-extrabold text-white tracking-tight leading-snug"
          >
            {toast.title}
          </h3>
          <p className="text-sm text-neutral-300 leading-relaxed font-normal">
            {toast.message}
          </p>
          {toast.nepaliMessage && (
            <p className="text-xs sm:text-sm text-neutral-400 font-devanagari pt-1 leading-relaxed">
              {toast.nepaliMessage}
            </p>
          )}
        </div>

        {/* Action Buttons Row */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-4 border-t border-neutral-800/80">
          {/* 1. Download Action */}
          {actionType === 'download' && (
            <a
              href={toast.actionUrl || '#'}
              download
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleDismiss(toast.id)}
              className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-red-950/50 transition-all active:scale-[0.98] cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{toast.actionLabel || 'Download Now'}</span>
            </a>
          )}

          {/* 2. Visit Link Action */}
          {actionType === 'visit' && (
            <a
              href={toast.actionUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleDismiss(toast.id)}
              className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-red-950/50 transition-all active:scale-[0.98] cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
              <span>{toast.actionLabel || 'Visit Website'}</span>
            </a>
          )}

          {/* 3. Custom Action */}
          {actionType === 'custom' && (
            <a
              href={toast.actionUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleDismiss(toast.id)}
              className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-red-950/50 transition-all active:scale-[0.98] cursor-pointer"
            >
              <span>{toast.actionLabel || 'Learn More'}</span>
            </a>
          )}

          {/* 4. Okay Action */}
          {actionType === 'okay' && (
            <button
              onClick={() => handleDismiss(toast.id)}
              className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-red-950/50 transition-all active:scale-[0.98] cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{toast.actionLabel || 'Okay, Got It'}</span>
            </button>
          )}

          {/* Secondary Close Button */}
          <button
            onClick={() => handleDismiss(toast.id)}
            className="w-full sm:w-auto px-5 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs sm:text-sm font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
