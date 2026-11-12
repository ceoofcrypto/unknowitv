import { FeaturedEvent, VpnProfile, EventMediaSource } from '../types/index.ts';

const FAVORITES_KEY = 'tapaiko_tv_favorites';
const RECENT_KEY = 'tapaiko_tv_recent_history';
const THEME_KEY = 'tapaiko_tv_theme';
const CUSTOM_EVENTS_KEY = 'tapaiko_tv_custom_events';
const VPN_PROFILES_KEY = 'tapaiko_tv_vpn_profiles';
const EVENT_MEDIA_KEY = 'tapaiko_tv_event_media_sources';
const MAX_RECENT_CHANNELS = 10;

export function getLocalFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function toggleLocalFavorite(channelId: string): string[] {
  try {
    const current = getLocalFavorites();
    const index = current.indexOf(channelId);
    let updated: string[];
    if (index >= 0) {
      updated = current.filter((id) => id !== channelId);
    } else {
      updated = [channelId, ...current];
    }
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function isLocalFavorite(channelId: string): boolean {
  return getLocalFavorites().includes(channelId);
}

export function getLocalRecentChannelIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addLocalRecentChannel(channelId: string): string[] {
  try {
    const current = getLocalRecentChannelIds();
    const filtered = current.filter((id) => id !== channelId);
    const updated = [channelId, ...filtered].slice(0, MAX_RECENT_CHANNELS);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function clearLocalRecentChannels(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    // ignore
  }
}

export function getSavedTheme(): 'dark' | 'light' {
  try {
    const val = localStorage.getItem(THEME_KEY);
    if (val === 'light' || val === 'dark') return val;
    return 'dark';
  } catch {
    return 'dark';
  }
}

export function saveTheme(theme: 'dark' | 'light'): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
}

// ---------------- CUSTOM EVENTS PERSISTENCE ----------------

export function getLocalCustomEvents(): FeaturedEvent[] {
  try {
    const raw = localStorage.getItem(CUSTOM_EVENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalCustomEvent(event: FeaturedEvent): void {
  try {
    const current = getLocalCustomEvents();
    const index = current.findIndex((e) => e.id === event.id);
    let updated: FeaturedEvent[];
    if (index >= 0) {
      updated = [...current];
      updated[index] = event;
    } else {
      updated = [event, ...current];
    }
    localStorage.setItem(CUSTOM_EVENTS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save event to localStorage:', err);
  }
}

export function deleteLocalCustomEvent(id: string): void {
  try {
    const current = getLocalCustomEvents();
    const updated = current.filter((e) => e.id !== id);
    localStorage.setItem(CUSTOM_EVENTS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to delete event from localStorage:', err);
  }
}

// ---------------- VPN PROFILES PERSISTENCE ----------------

export function getLocalVpnProfiles(): VpnProfile[] {
  try {
    const raw = localStorage.getItem(VPN_PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalVpnProfile(profile: VpnProfile): void {
  try {
    const current = getLocalVpnProfiles();
    const index = current.findIndex((p) => p.id === profile.id);
    let updated: VpnProfile[];
    if (index >= 0) {
      updated = [...current];
      updated[index] = profile;
    } else {
      updated = [profile, ...current];
    }
    localStorage.setItem(VPN_PROFILES_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save VPN profile to localStorage:', err);
  }
}

export function deleteLocalVpnProfile(id: string): void {
  try {
    const current = getLocalVpnProfiles();
    const updated = current.filter((p) => p.id !== id);
    localStorage.setItem(VPN_PROFILES_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to delete VPN profile from localStorage:', err);
  }
}

// ---------------- EVENT MEDIA SOURCES PERSISTENCE ----------------

export function getLocalEventMediaSources(): EventMediaSource[] {
  try {
    const raw = localStorage.getItem(EVENT_MEDIA_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalEventMediaSource(source: EventMediaSource): void {
  try {
    const current = getLocalEventMediaSources();
    const index = current.findIndex((s) => s.id === source.id || (s.eventId && s.eventId === source.eventId));
    let updated: EventMediaSource[];
    if (index >= 0) {
      updated = [...current];
      updated[index] = source;
    } else {
      updated = [source, ...current];
    }
    localStorage.setItem(EVENT_MEDIA_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save EventMediaSource to localStorage:', err);
  }
}

export function deleteLocalEventMediaSource(id: string): void {
  try {
    const current = getLocalEventMediaSources();
    const updated = current.filter((s) => s.id !== id && s.eventId !== id);
    localStorage.setItem(EVENT_MEDIA_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to delete EventMediaSource from localStorage:', err);
  }
}
