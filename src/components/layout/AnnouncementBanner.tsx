import React, { useState } from 'react';
import { Announcement } from '../../types/index.ts';
import { Megaphone, X, Trash2 } from 'lucide-react';

interface AnnouncementBannerProps {
  announcements: Announcement[];
  isAdmin?: boolean;
  onDeleteAnnouncement?: (id: string) => Promise<void>;
}

export const AnnouncementBanner: React.FC<AnnouncementBannerProps> = ({
  announcements,
  isAdmin = false,
  onDeleteAnnouncement,
}) => {
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  const activeAnnouncements = announcements.filter(
    (a) => a.isActive && a.isPublished && !dismissed[a.id] && (a.displayLocation !== 'toast')
  );

  if (activeAnnouncements.length === 0) return null;
  const current = activeAnnouncements[0];

  const handleDelete = async (id: string) => {
    if (!onDeleteAnnouncement) return;
    if (!window.confirm('Are you sure you want to delete this announcement?')) return;
    await onDeleteAnnouncement(id);
    setDismissed((prev) => ({ ...prev, [id]: true }));
  };

  return (
    <div
      role="region"
      aria-label="Site announcement"
      className="bg-neutral-900 border-b border-neutral-800 text-neutral-200 px-4 py-2 text-xs md:text-sm"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-hidden">
          <Megaphone className="w-4 h-4 text-red-500 shrink-0" aria-hidden="true" />
          <span className="font-medium text-white shrink-0">{current.title}:</span>
          <span className="text-neutral-300 truncate">{current.message}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && onDeleteAnnouncement && (
            <button
              onClick={() => handleDelete(current.id)}
              title="Delete announcement for everyone"
              className="text-neutral-400 hover:text-red-400 transition-colors p-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => setDismissed((prev) => ({ ...prev, [current.id]: true }))}
            aria-label="Dismiss announcement"
            className="text-neutral-400 hover:text-white transition-colors p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
