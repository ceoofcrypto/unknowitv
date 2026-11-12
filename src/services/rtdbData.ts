import {
  ref,
  get,
  set,
  remove,
  onValue,
  off,
} from 'firebase/database';
import { auth, rtdb } from './firebase.ts';
import {
  Channel,
  FeaturedEvent,
  Category,
  Announcement,
  AppSettings,
  VpnProfile,
  RoutingRule,
  EventMediaSource,
} from '../types/index.ts';
import {
  INITIAL_CHANNELS,
  INITIAL_EVENTS,
  INITIAL_CATEGORIES,
  INITIAL_ANNOUNCEMENTS,
  INITIAL_SETTINGS,
} from '../data/seedData.ts';
import { isAdminEmailAuthorized } from '../utils/channels.ts';

export function isFirebaseAdminReady(): boolean {
  return Boolean(auth.currentUser && isAdminEmailAuthorized(auth.currentUser.email));
}

// ==========================================
// FEATURED EVENTS
// ==========================================

export async function getRtdbEvents(): Promise<FeaturedEvent[] | null> {
  try {
    const snap = await get(ref(rtdb, 'events'));
    if (!snap.exists()) return null;
    const val = snap.val();
    if (!val || typeof val !== 'object') return null;
    return Object.values(val) as FeaturedEvent[];
  } catch (err) {
    console.warn('Realtime Database getEvents notice:', err);
    return null;
  }
}

export async function syncEventToRtdb(event: FeaturedEvent): Promise<void> {
  if (!isFirebaseAdminReady()) return;
  try {
    await set(ref(rtdb, `events/${event.id}`), event);
  } catch (err) {
    console.warn(`Failed to sync event ${event.id} to RTDB:`, err);
  }
}

export async function deleteEventFromRtdb(eventId: string): Promise<void> {
  if (!isFirebaseAdminReady()) return;
  try {
    await remove(ref(rtdb, `events/${eventId}`));
  } catch (err) {
    console.warn(`Failed to delete event ${eventId} from RTDB:`, err);
  }
}

export function subscribeToRtdbEvents(
  callback: (events: FeaturedEvent[]) => void
): () => void {
  const eventsRef = ref(rtdb, 'events');
  const unsubscribe = onValue(
    eventsRef,
    (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        if (val && typeof val === 'object') {
          callback(Object.values(val) as FeaturedEvent[]);
        }
      }
    },
    (err) => {
      console.warn('Realtime Database events listener warning:', err);
    }
  );

  return () => {
    try {
      off(eventsRef, 'value', unsubscribe);
    } catch {
      // Ignore unsubscribe error
    }
  };
}

// ==========================================
// CHANNELS
// ==========================================

export async function getRtdbChannels(): Promise<Channel[] | null> {
  try {
    const snap = await get(ref(rtdb, 'channels'));
    if (!snap.exists()) return null;
    const val = snap.val();
    if (!val || typeof val !== 'object') return null;
    return Object.values(val) as Channel[];
  } catch (err) {
    console.warn('Realtime Database getChannels notice:', err);
    return null;
  }
}

export async function syncChannelToRtdb(channel: Channel): Promise<void> {
  if (!isFirebaseAdminReady()) return;
  try {
    await set(ref(rtdb, `channels/${channel.id}`), channel);
  } catch (err) {
    console.warn(`Failed to sync channel ${channel.id} to RTDB:`, err);
  }
}

export async function deleteChannelFromRtdb(channelId: string): Promise<void> {
  if (!isFirebaseAdminReady()) return;
  try {
    await remove(ref(rtdb, `channels/${channelId}`));
  } catch (err) {
    console.warn(`Failed to delete channel ${channelId} from RTDB:`, err);
  }
}

// ==========================================
// CATEGORIES & ANNOUNCEMENTS & SETTINGS
// ==========================================

export async function getRtdbCategories(): Promise<Category[] | null> {
  try {
    const snap = await get(ref(rtdb, 'categories'));
    if (!snap.exists()) return null;
    const val = snap.val();
    if (!val || typeof val !== 'object') return null;
    return Object.values(val) as Category[];
  } catch {
    return null;
  }
}

export async function syncCategoryToRtdb(cat: Category): Promise<void> {
  if (!isFirebaseAdminReady()) return;
  try {
    await set(ref(rtdb, `categories/${cat.id}`), cat);
  } catch (err) {
    console.warn('Failed to sync category to RTDB:', err);
  }
}

export async function getRtdbAnnouncements(): Promise<Announcement[] | null> {
  try {
    const snap = await get(ref(rtdb, 'announcements'));
    if (!snap.exists()) return null;
    const val = snap.val();
    if (!val || typeof val !== 'object') return null;
    return Object.values(val) as Announcement[];
  } catch {
    return null;
  }
}

export async function syncAnnouncementToRtdb(ann: Announcement): Promise<void> {
  if (!isFirebaseAdminReady()) return;
  try {
    await set(ref(rtdb, `announcements/${ann.id}`), ann);
  } catch (err) {
    console.warn('Failed to sync announcement to RTDB:', err);
  }
}

export async function deleteAnnouncementFromRtdb(annId: string): Promise<void> {
  if (!isFirebaseAdminReady()) return;
  try {
    await remove(ref(rtdb, `announcements/${annId}`));
  } catch (err) {
    console.warn(`Failed to delete announcement ${annId} from RTDB:`, err);
  }
}

export function subscribeToRtdbAnnouncements(
  callback: (announcements: Announcement[]) => void
): () => void {
  const annRef = ref(rtdb, 'announcements');
  const unsubscribe = onValue(
    annRef,
    (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        if (val && typeof val === 'object') {
          callback(Object.values(val) as Announcement[]);
        }
      } else {
        callback([]);
      }
    },
    (err) => {
      console.warn('Realtime Database announcements listener warning:', err);
    }
  );

  return () => {
    try {
      off(annRef, 'value', unsubscribe);
    } catch {
      // Ignore unsubscribe error
    }
  };
}

export async function getRtdbSettings(): Promise<AppSettings | null> {
  try {
    const snap = await get(ref(rtdb, 'settings'));
    if (!snap.exists()) return null;
    return snap.val() as AppSettings;
  } catch {
    return null;
  }
}

export async function syncSettingsToRtdb(settings: AppSettings): Promise<void> {
  if (!isFirebaseAdminReady()) return;
  try {
    await set(ref(rtdb, 'settings'), settings);
  } catch (err) {
    console.warn('Failed to sync settings to RTDB:', err);
  }
}

// ==========================================
// VPN PROFILES & EVENT MEDIA SOURCES
// ==========================================

export async function getRtdbVpnProfiles(): Promise<VpnProfile[] | null> {
  try {
    const snap = await get(ref(rtdb, 'vpnProfiles'));
    if (!snap.exists()) return null;
    const val = snap.val();
    if (!val || typeof val !== 'object') return null;
    return Object.values(val) as VpnProfile[];
  } catch {
    return null;
  }
}

export async function syncVpnProfileToRtdb(profile: VpnProfile): Promise<void> {
  if (!isFirebaseAdminReady()) return;
  try {
    await set(ref(rtdb, `vpnProfiles/${profile.id}`), profile);
  } catch (err) {
    console.warn('Failed to sync VPN profile to RTDB:', err);
  }
}

export async function deleteVpnProfileFromRtdb(profileId: string): Promise<void> {
  if (!isFirebaseAdminReady()) return;
  try {
    await remove(ref(rtdb, `vpnProfiles/${profileId}`));
  } catch (err) {
    console.warn('Failed to delete VPN profile from RTDB:', err);
  }
}

export async function getRtdbEventMediaSources(): Promise<EventMediaSource[] | null> {
  try {
    const snap = await get(ref(rtdb, 'eventMediaSources'));
    if (!snap.exists()) return null;
    const val = snap.val();
    if (!val || typeof val !== 'object') return null;
    return Object.values(val) as EventMediaSource[];
  } catch {
    return null;
  }
}

export async function syncEventMediaSourceToRtdb(media: EventMediaSource): Promise<void> {
  if (!isFirebaseAdminReady()) return;
  try {
    await set(ref(rtdb, `eventMediaSources/${media.id}`), media);
  } catch (err) {
    console.warn('Failed to sync event media source to RTDB:', err);
  }
}

export async function deleteEventMediaSourceFromRtdb(mediaId: string): Promise<void> {
  if (!isFirebaseAdminReady()) return;
  try {
    await remove(ref(rtdb, `eventMediaSources/${mediaId}`));
  } catch (err) {
    console.warn('Failed to delete event media source from RTDB:', err);
  }
}

// ==========================================
// BOOTSTRAP / INITIALIZATION
// ==========================================

/**
 * Automatically seeds Realtime Database when an authorized administrator logs in.
 * In addition to initial defaults, if the admin has custom events/profiles stored
 * in their local storage (like that 'NPL' event), this function syncs them up to the cloud!
 */
export async function bootstrapRtdbDatabase(
  localEvents: FeaturedEvent[] = [],
  localVpn: VpnProfile[] = []
): Promise<void> {
  if (!isFirebaseAdminReady()) return;

  try {
    // 1. Settings
    const settingsSnap = await get(ref(rtdb, 'settings'));
    if (!settingsSnap.exists()) {
      await set(ref(rtdb, 'settings'), INITIAL_SETTINGS);
    }

    // 2. Events: Check existing
    const eventsSnap = await get(ref(rtdb, 'events'));
    if (!eventsSnap.exists()) {
      // Seed initial defaults
      for (const ev of INITIAL_EVENTS) {
        await set(ref(rtdb, `events/${ev.id}`), ev);
      }
    }

    // Always upload any locally created custom events (e.g. user's 'NPL' event!)
    for (const ev of localEvents) {
      if (ev && ev.id) {
        await set(ref(rtdb, `events/${ev.id}`), ev);
      }
    }

    // 3. Categories
    const catSnap = await get(ref(rtdb, 'categories'));
    if (!catSnap.exists()) {
      for (const cat of INITIAL_CATEGORIES) {
        await set(ref(rtdb, `categories/${cat.id}`), cat);
      }
    }

    // 4. Announcements
    const annSnap = await get(ref(rtdb, 'announcements'));
    if (!annSnap.exists()) {
      for (const ann of INITIAL_ANNOUNCEMENTS) {
        await set(ref(rtdb, `announcements/${ann.id}`), ann);
      }
    }

    // 5. Local VPN profiles
    for (const vpn of localVpn) {
      if (vpn && vpn.id) {
        await set(ref(rtdb, `vpnProfiles/${vpn.id}`), vpn);
      }
    }
  } catch (err) {
    console.warn('Realtime Database bootstrap notice:', err);
  }
}

