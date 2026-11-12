import React, { useState, useEffect } from 'react';
import { Announcement } from '../../types/index.ts';
import { Megaphone, Radio, AlertTriangle, Sparkles, X, Trash2 } from 'lucide-react';

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
      const stored = sessionStorage.getItem('tapaiko_dismissed_toasts');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Filter announcements designated for toast or both
  const activeToasts = announcements.filter((a) => {
    if (!a.isActive || !a.isPublished) return false;
    if (dismissedMap[a.id]) return false;
    // Default to 'both' if displayLocation is not specified
    const loc = a.displayLocation || 'both';
    return loc === 'toast' || loc === 'both';
  });

  if (activeToasts.length === 0) return null;

  // Show the most recent or highest priority toast
  const toast = activeToasts[0];

  const handleDismiss = (id: string) => {
    const next = { ...dismissedMap, [id]: true };
    setDismissedMap(next);
    try {
      sessionStorage.setItem('tapaiko_dismissed_toasts', JSON.stringify(next));
    } catch {
      // Ignore
    }
  };

  const handleDelete = async (id: string) => {
    if (!onDeleteAnnouncement) return;
    if (!window.confirm('Are you sure you want to delete this announcement / toast message?')) return;
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
      icon: <Radio className="w-4 h-4 text-red-400 animate-pulse" />,
      label: 'LIVE BROADCAST',
    },
    warning: {
      badgeBg: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      glow: 'shadow-amber-950/40 border-amber-500/30',
      icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
      label: 'IMPORTANT NOTICE',
    },
    success: {
      badgeBg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
      glow: 'shadow-emerald-950/40 border-emerald-500/30',
      icon: <Sparkles className="w-4 h-4 text-emerald-400" />,
      label: 'SPECIAL UPDATE',
    },
    info: {
      badgeBg: 'bg-sky-500/20 text-sky-400 border-sky-500/40',
      glow: 'shadow-sky-950/40 border-sky-500/30',
      icon: <Megaphone className="w-4 h-4 text-sky-400" />,
      label: 'ANNOUNCEMENT',
    },
  }[type];

  return (
    <aside
      aria-label="Homepage notification"
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 max-w-sm sm:max-w-md w-[calc(100vw-2rem)] animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div
        className={`relative bg-[#12141a]/95 backdrop-blur-xl border rounded-2xl p-4 shadow-2xl transition-all ${typeConfig.glow}`}
      >
        <div className="flex items-start justify-between gap-3">
          {/* Badge & Icon */}
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border ${typeConfig.badgeBg}`}
            >
              {typeConfig.icon}
              <span>{typeConfig.label}</span>
            </span>
          </div>

          {/* Action Buttons: Delete (Admin) & Dismiss */}
          <div className="flex items-center gap-1 shrink-0 -mt-1 -mr-1">
            {isAdmin && onDeleteAnnouncement && (
              <button
                onClick={() => handleDelete(toast.id)}
                disabled={isDeleting === toast.id}
                title="Delete Announcement for Everyone (Admin)"
                className="p-1.5 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-950/50 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => handleDismiss(toast.id)}
              aria-label="Close notification"
              title="Dismiss toast"
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="mt-2.5 space-y-1">
          <h4 className="text-sm font-bold text-white tracking-tight leading-snug">
            {toast.title}
          </h4>
          <p className="text-xs text-neutral-300 leading-relaxed">
            {toast.message}
          </p>
          {toast.nepaliMessage && (
            <p className="text-xs text-neutral-400 font-devanagari pt-0.5">
              {toast.nepaliMessage}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
};

