import {
  Channel,
  FeaturedEvent,
  Category,
  Announcement,
  AppSettings,
  AdminUser,
  Country,
  VpnProfile,
  RoutingRule,
  EventMediaSource,
  VpnGatewayStatus,
  VpnRouteTestResult,
} from '../types/index.ts';
import { signInWithGoogleAdminPopup, signOutFirebaseAdmin, User } from './firebase.ts';
import {
  bootstrapFirestoreDatabase,
  syncChannelToFirestore,
  deleteChannelFromFirestore,
  syncEventToFirestore,
  deleteEventFromFirestore,
  syncCategoryToFirestore,
  syncAnnouncementToFirestore,
  syncSettingsToFirestore,
} from './firestoreData.ts';
import { INITIAL_EVENTS } from '../data/seedData.ts';
import {
  getLocalCustomEvents,
  saveLocalCustomEvent,
  deleteLocalCustomEvent,
  getDeletedEventIds,
  markEventDeleted,
  unmarkEventDeleted,
  getLocalVpnProfiles,
  saveLocalVpnProfile,
  deleteLocalVpnProfile,
  getDeletedVpnProfileIds,
  markVpnProfileDeleted,
  unmarkVpnProfileDeleted,
  getLocalEventMediaSources,
  saveLocalEventMediaSource,
  deleteLocalEventMediaSource,
  getDeletedEventMediaIds,
  markEventMediaDeleted,
  unmarkEventMediaDeleted,
} from '../utils/storage.ts';

const ADMIN_TOKEN_KEY = 'tapaiko_tv_admin_token';
const ADMIN_USER_KEY = 'tapaiko_tv_admin_user';

export interface AutoUpdateStatus {
  isRunning: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  verifiedCount: number;
  activeCount: number;
  removedDeadCount: number;
  newlyAddedCount: number;
  lastBatchChecked: number;
}

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredAdminUser(): AdminUser | null {
  try {
    const raw = localStorage.getItem(ADMIN_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setAdminSession(token: string, user: AdminUser): void {
  try {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
  } catch (e) {
    console.warn('Unable to store admin session:', e);
  }
}

export function clearAdminSession(): void {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_USER_KEY);
    signOutFirebaseAdmin();
  } catch (e) {
    console.warn('Unable to clear admin session:', e);
  }
}

function getHeaders(requireAdmin = false): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (requireAdmin) {
    const token = getAdminToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return headers;
}

// ---------------- PUBLIC & ADMIN API CALLS ----------------

export async function fetchCountries(): Promise<Country[]> {
  const res = await fetch('/api/countries');
  if (!res.ok) throw new Error('Failed to load countries');
  return res.json();
}

export async function fetchCountryChannels(countryCode: string): Promise<{
  country: string;
  code: string;
  newlyAdded?: number;
  channels: Channel[];
}> {
  const res = await fetch(`/api/iptv/country/${encodeURIComponent(countryCode)}`);
  if (!res.ok) throw new Error(`Failed to fetch channels for country ${countryCode}`);
  return res.json();
}

export async function fetchChannels(
  includeHidden = false,
  country?: string,
  category?: string
): Promise<Channel[]> {
  const params = new URLSearchParams();
  if (country && country !== 'all') params.set('country', country);
  if (category && category !== 'all') params.set('category', category);
  const query = params.toString() ? `?${params.toString()}` : '';

  const res = await fetch(`/api/channels${query}`, {
    headers: getHeaders(includeHidden),
  });
  if (!res.ok) throw new Error('Failed to load channels');
  return res.json();
}

export async function reportBrokenChannel(channelId: string): Promise<{
  deactivated: boolean;
  channelId: string;
  message: string;
}> {
  const res = await fetch(`/api/channels/${encodeURIComponent(channelId)}/report-broken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to report broken channel');
  return res.json();
}

export async function fetchAutoUpdateStatus(): Promise<AutoUpdateStatus> {
  const res = await fetch('/api/iptv/status');
  if (!res.ok) throw new Error('Failed to load auto-update status');
  return res.json();
}

export async function triggerAutoVerifySweep(): Promise<AutoUpdateStatus> {
  const res = await fetch('/api/iptv/auto-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to trigger verification sweep');
  return res.json();
}

export async function createChannel(data: Partial<Channel>): Promise<Channel> {
  const res = await fetch('/api/channels', {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create channel');
  }
  const created: Channel = await res.json();
  syncChannelToFirestore(created).catch(() => {});
  return created;
}

export async function updateChannel(id: string, data: Partial<Channel>): Promise<Channel> {
  const res = await fetch(`/api/channels/${id}`, {
    method: 'PUT',
    headers: getHeaders(true),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update channel');
  const updated: Channel = await res.json();
  syncChannelToFirestore(updated).catch(() => {});
  return updated;
}

export async function deleteChannel(id: string): Promise<void> {
  const res = await fetch(`/api/channels/${id}`, {
    method: 'DELETE',
    headers: getHeaders(true),
  });
  if (!res.ok) throw new Error('Failed to delete channel');
  deleteChannelFromFirestore(id).catch(() => {});
}

export async function fetchEvents(includeHidden = false): Promise<FeaturedEvent[]> {
  const localEvents = getLocalCustomEvents();
  const deletedEventIds = new Set(getDeletedEventIds());
  try {
    const res = await fetch('/api/events', {
      headers: getHeaders(includeHidden),
    });
    if (res.ok) {
      const serverEvents: FeaturedEvent[] = await res.json();
      const map = new Map<string, FeaturedEvent>();

      // Seed / server events (omitting explicitly deleted events)
      for (const ev of serverEvents) {
        if (!deletedEventIds.has(ev.id)) {
          map.set(ev.id, ev);
        }
      }
      // Local custom events override/augment
      for (const ev of localEvents) {
        if (!deletedEventIds.has(ev.id)) {
          map.set(ev.id, ev);
        }
      }

      const merged = Array.from(map.values());
      // Only fall back to INITIAL_EVENTS if no events exist AND user has not deleted events
      if (merged.length === 0 && deletedEventIds.size === 0) {
        return INITIAL_EVENTS;
      }
      return merged;
    }
  } catch (err) {
    console.warn('Failed to load events from server, using local store:', err);
  }

  const filteredLocal = localEvents.filter((ev) => !deletedEventIds.has(ev.id));
  if (filteredLocal.length === 0 && deletedEventIds.size === 0) {
    return INITIAL_EVENTS;
  }
  return filteredLocal;
}

export async function createEvent(data: Partial<FeaturedEvent>): Promise<FeaturedEvent> {
  const id = data.id || 'event-' + Date.now().toString(36);
  unmarkEventDeleted(id);
  const now = new Date().toISOString();
  const candidate: FeaturedEvent = {
    id,
    title: (data.title || '').trim(),
    nepaliTitle: data.nepaliTitle?.trim() || '',
    subtitle: data.subtitle?.trim() || '',
    description: data.description?.trim() || '',
    thumbnailUrl: data.thumbnailUrl?.trim() || '/images/event_nsl_stadium.jpg',
    bannerUrl: data.bannerUrl?.trim() || '/images/event_nsl_stadium.jpg',
    channelId: data.channelId || 'custom-stream',
    channelName: data.channelName || 'Live Stream',
    streamUrlOverride: data.streamUrlOverride?.trim() || null,
    status: data.status || 'LIVE',
    startTime: data.startTime || now,
    endTime: data.endTime || null,
    priority: Number(data.priority) || 1,
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    isPublished: data.isPublished !== undefined ? Boolean(data.isPublished) : true,
    buttonLabel: data.buttonLabel?.trim() || 'Watch Live Now',
    createdAt: data.createdAt || now,
    updatedAt: now,
    mediaSource: data.mediaSource,
  };

  // Immediate local persistence
  saveLocalCustomEvent(candidate);

  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const created: FeaturedEvent = await res.json();
      saveLocalCustomEvent(created);
      syncEventToFirestore(created).catch(() => {});
      return created;
    }
  } catch (err) {
    console.warn('Server event creation failed, relying on local storage:', err);
  }

  syncEventToFirestore(candidate).catch(() => {});
  return candidate;
}

export async function updateEvent(id: string, data: Partial<FeaturedEvent>): Promise<FeaturedEvent> {
  unmarkEventDeleted(id);
  const existingLocal = getLocalCustomEvents().find((e) => e.id === id);
  const updatedCandidate: FeaturedEvent = {
    ...(existingLocal || ({} as any)),
    ...data,
    id,
    updatedAt: new Date().toISOString(),
  };
  saveLocalCustomEvent(updatedCandidate);

  try {
    const res = await fetch(`/api/events/${id}`, {
      method: 'PUT',
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const updated: FeaturedEvent = await res.json();
      saveLocalCustomEvent(updated);
      syncEventToFirestore(updated).catch(() => {});
      return updated;
    }
  } catch (err) {
    console.warn('Server event update failed, relying on local storage:', err);
  }

  syncEventToFirestore(updatedCandidate).catch(() => {});
  return updatedCandidate;
}

export async function deleteEvent(id: string): Promise<void> {
  markEventDeleted(id);
  deleteLocalCustomEvent(id);
  try {
    await fetch(`/api/events/${id}`, {
      method: 'DELETE',
      headers: getHeaders(true),
    });
  } catch {
    // Ignore network error
  }
  deleteEventFromFirestore(id).catch(() => {});
}

export async function fetchCategories(includeHidden = false): Promise<Category[]> {
  const res = await fetch('/api/categories', {
    headers: getHeaders(includeHidden),
  });
  if (!res.ok) throw new Error('Failed to load categories');
  return res.json();
}

export async function createCategory(data: Partial<Category>): Promise<Category> {
  const res = await fetch('/api/categories', {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create category');
  const created: Category = await res.json();
  syncCategoryToFirestore(created).catch(() => {});
  return created;
}

export async function updateCategory(id: string, data: Partial<Category>): Promise<Category> {
  const res = await fetch(`/api/categories/${id}`, {
    method: 'PUT',
    headers: getHeaders(true),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update category');
  const updated: Category = await res.json();
  syncCategoryToFirestore(updated).catch(() => {});
  return updated;
}

export async function fetchAnnouncements(includeHidden = false): Promise<Announcement[]> {
  const res = await fetch('/api/announcements', {
    headers: getHeaders(includeHidden),
  });
  if (!res.ok) throw new Error('Failed to load announcements');
  return res.json();
}

export async function createAnnouncement(data: Partial<Announcement>): Promise<Announcement> {
  const res = await fetch('/api/announcements', {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create announcement');
  const created: Announcement = await res.json();
  syncAnnouncementToFirestore(created).catch(() => {});
  return created;
}

export async function updateAnnouncement(id: string, data: Partial<Announcement>): Promise<Announcement> {
  const res = await fetch(`/api/announcements/${id}`, {
    method: 'PUT',
    headers: getHeaders(true),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update announcement');
  const updated: Announcement = await res.json();
  syncAnnouncementToFirestore(updated).catch(() => {});
  return updated;
}

export async function fetchSettings(): Promise<AppSettings> {
  const res = await fetch('/api/settings');
  if (!res.ok) throw new Error('Failed to load settings');
  return res.json();
}

export async function updateSettings(data: Partial<AppSettings>): Promise<AppSettings> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: getHeaders(true),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update settings');
  const updated: AppSettings = await res.json();
  syncSettingsToFirestore(updated).catch(() => {});
  return updated;
}

export async function loginAdminWithGoogle(): Promise<{ token: string; user: AdminUser }> {
  const googlePayload = await signInWithGoogleAdminPopup();

  const res = await fetch('/api/admin/google-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(googlePayload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Google Administrator verification failed');
  }

  const data = await res.json();
  setAdminSession(data.token, data.user);
  bootstrapFirestoreDatabase().catch(() => {});
  return data;
}

export async function restoreAdminSessionFromFirebaseUser(
  firebaseUser: User
): Promise<{ token: string; user: AdminUser } | null> {
  try {
    const idToken = await firebaseUser.getIdToken();
    const res = await fetch('/api/admin/google-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: firebaseUser.email,
        name: firebaseUser.displayName || 'Tapaiko TV Administrator',
        uid: firebaseUser.uid,
        idToken,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    setAdminSession(data.token, data.user);
    bootstrapFirestoreDatabase().catch(() => {});
    return data;
  } catch {
    return null;
  }
}

export async function testStreamOnServer(url: string): Promise<{
  reachable: boolean;
  statusCode: number;
  contentType: string;
  corsHeader: string;
  hasHlsManifestHeader?: boolean;
  details: string;
}> {
  const res = await fetch('/api/admin/stream-test', {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error('Stream test request failed');
  return res.json();
}

export const testStreamAvailability = testStreamOnServer;

export async function resetToDemoData(): Promise<void> {
  const res = await fetch('/api/admin/reset-demo', {
    method: 'POST',
    headers: getHeaders(true),
  });
  if (!res.ok) throw new Error('Failed to reset demo data');
}

export const resetDemoData = resetToDemoData;

export async function syncIptvChannels(): Promise<{
  success: boolean;
  totalChannels: number;
  newlyAdded: number;
  message: string;
}> {
  const res = await fetch('/api/iptv/sync', {
    method: 'POST',
    headers: getHeaders(true),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to sync IPTV channels');
  }
  return res.json();
}

// ----------------- VPN GATEWAY MANAGEMENT API -----------------

export async function fetchVpnProfiles(): Promise<VpnProfile[]> {
  const local = getLocalVpnProfiles();
  const deletedVpnIds = new Set(getDeletedVpnProfileIds());
  try {
    const res = await fetch('/api/admin/vpn/profiles', {
      headers: getHeaders(true),
    });
    if (res.ok) {
      const serverProfiles: VpnProfile[] = await res.json();
      const map = new Map<string, VpnProfile>();
      for (const p of serverProfiles) {
        if (!deletedVpnIds.has(p.id)) {
          map.set(p.id, p);
        }
      }
      for (const p of local) {
        if (!deletedVpnIds.has(p.id)) {
          map.set(p.id, p);
        }
      }
      return Array.from(map.values());
    }
  } catch (err) {
    console.warn('Failed to load VPN profiles from server, using local store:', err);
  }
  return local.filter((p) => !deletedVpnIds.has(p.id));
}

export async function createVpnProfile(data: Partial<VpnProfile>): Promise<VpnProfile> {
  const id = data.id || 'vpn-profile-' + Date.now().toString(36);
  unmarkVpnProfileDeleted(id);
  const now = new Date().toISOString();
  const candidate: VpnProfile = {
    id,
    name: (data.name || 'India Gateway').trim(),
    serverAddress: data.serverAddress || '103.189.24.12',
    port: data.port || 1194,
    proto: data.proto || 'udp',
    cipher: data.cipher || 'AES-256-GCM',
    authType: data.authType || 'credentials',
    credentials: data.credentials,
    ovpnConfigRaw: data.ovpnConfigRaw,
    region: data.region || 'India (IN)',
    countryCode: 'IN',
    city: data.city || 'Mumbai',
    egressIp: data.egressIp || data.serverAddress || '103.189.24.12',
    isIndiaVerified: true,
    status: 'connected',
    lastHealthCheck: now,
    latencyMs: data.latencyMs || 38,
    bytesTransferredIn: 0,
    bytesTransferredOut: 0,
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    isDefault: Boolean(data.isDefault),
    createdAt: now,
    updatedAt: now,
  };

  saveLocalVpnProfile(candidate);

  try {
    const res = await fetch('/api/admin/vpn/profiles', {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const created: VpnProfile = await res.json();
      saveLocalVpnProfile(created);
      return created;
    }
  } catch (err) {
    console.warn('Server create VPN profile failed, saved locally:', err);
  }
  return candidate;
}

export async function updateVpnProfile(id: string, data: Partial<VpnProfile>): Promise<VpnProfile> {
  unmarkVpnProfileDeleted(id);
  const local = getLocalVpnProfiles().find((p) => p.id === id);
  const updatedCandidate: VpnProfile = {
    ...(local || ({} as any)),
    ...data,
    id,
    updatedAt: new Date().toISOString(),
  };
  saveLocalVpnProfile(updatedCandidate);

  try {
    const res = await fetch(`/api/admin/vpn/profiles/${id}`, {
      method: 'PUT',
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const updated: VpnProfile = await res.json();
      saveLocalVpnProfile(updated);
      return updated;
    }
  } catch (err) {
    console.warn('Server update VPN profile failed, saved locally:', err);
  }
  return updatedCandidate;
}

export async function deleteVpnProfile(id: string): Promise<void> {
  markVpnProfileDeleted(id);
  deleteLocalVpnProfile(id);
  try {
    await fetch(`/api/admin/vpn/profiles/${id}`, {
      method: 'DELETE',
      headers: getHeaders(true),
    });
  } catch {
    // Ignore
  }
}

export async function connectVpnProfile(id: string): Promise<{ success: boolean; message: string; profile: VpnProfile }> {
  const res = await fetch(`/api/admin/vpn/profiles/${id}/connect`, {
    method: 'POST',
    headers: getHeaders(true),
  });
  if (!res.ok) throw new Error('Failed to connect to VPN Gateway');
  return res.json();
}

export async function disconnectVpnProfile(id: string): Promise<{ success: boolean; message: string; profile: VpnProfile }> {
  const res = await fetch(`/api/admin/vpn/profiles/${id}/disconnect`, {
    method: 'POST',
    headers: getHeaders(true),
  });
  if (!res.ok) throw new Error('Failed to disconnect VPN Gateway');
  return res.json();
}

export async function testVpnConnection(options?: {
  serverAddress?: string;
  port?: number;
  proto?: string;
  profileId?: string;
}): Promise<{
  success: boolean;
  reachable: boolean;
  serverAddress: string;
  port: number;
  proto: string;
  latencyMs: number;
  egressIp: string;
  country: string;
  countryCode: string;
  region: string;
  isp: string;
  isIndiaVerified: boolean;
  handshakeStatus: string;
  details: string;
}> {
  const res = await fetch('/api/admin/vpn/test-connection', {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify(options || {}),
  });
  if (!res.ok) throw new Error('VPN connection probe failed');
  return res.json();
}

export async function fetchVpnGatewayStatus(): Promise<VpnGatewayStatus> {
  const res = await fetch('/api/admin/vpn/status', {
    headers: getHeaders(true),
  });
  if (!res.ok) throw new Error('Failed to fetch VPN gateway status');
  return res.json();
}

// ----------------- DOMAIN-BASED SELECTIVE ROUTING RULES API -----------------

export async function fetchRoutingRules(): Promise<RoutingRule[]> {
  const res = await fetch('/api/admin/routing/rules', {
    headers: getHeaders(true),
  });
  if (!res.ok) throw new Error('Failed to fetch routing rules');
  return res.json();
}

export async function createRoutingRule(data: Partial<RoutingRule>): Promise<RoutingRule> {
  const res = await fetch('/api/admin/routing/rules', {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create routing rule');
  }
  return res.json();
}

export async function updateRoutingRule(id: string, data: Partial<RoutingRule>): Promise<RoutingRule> {
  const res = await fetch(`/api/admin/routing/rules/${id}`, {
    method: 'PUT',
    headers: getHeaders(true),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update routing rule');
  return res.json();
}

export async function deleteRoutingRule(id: string): Promise<void> {
  const res = await fetch(`/api/admin/routing/rules/${id}`, {
    method: 'DELETE',
    headers: getHeaders(true),
  });
  if (!res.ok) throw new Error('Failed to delete routing rule');
}

export async function testUrlRouting(url: string): Promise<VpnRouteTestResult> {
  const res = await fetch('/api/admin/routing/test-url', {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error('Route simulation request failed');
  return res.json();
}

export async function applyRoutingPresets(): Promise<{
  success: boolean;
  added: number;
  totalRules: number;
  message: string;
}> {
  const res = await fetch('/api/admin/routing/presets/apply', {
    method: 'POST',
    headers: getHeaders(true),
  });
  if (!res.ok) throw new Error('Failed to apply routing presets');
  return res.json();
}

// ----------------- EVENT MEDIA SOURCES API -----------------

export async function fetchEventMediaSources(): Promise<EventMediaSource[]> {
  const local = getLocalEventMediaSources();
  const deletedMediaIds = new Set(getDeletedEventMediaIds());
  const deletedEventIds = new Set(getDeletedEventIds());
  try {
    const res = await fetch('/api/admin/events/media', {
      headers: getHeaders(true),
    });
    if (res.ok) {
      const serverMedia: EventMediaSource[] = await res.json();
      const map = new Map<string, EventMediaSource>();
      for (const m of serverMedia) {
        if (!deletedMediaIds.has(m.id) && (!m.eventId || !deletedEventIds.has(m.eventId))) {
          map.set(m.id, m);
        }
      }
      for (const m of local) {
        if (!deletedMediaIds.has(m.id) && (!m.eventId || !deletedEventIds.has(m.eventId))) {
          map.set(m.id, m);
        }
      }
      return Array.from(map.values());
    }
  } catch (err) {
    console.warn('Failed to load event media sources from server, using local store:', err);
  }
  return local.filter((m) => !deletedMediaIds.has(m.id) && (!m.eventId || !deletedEventIds.has(m.eventId)));
}

export async function createEventMediaSource(data: Partial<EventMediaSource>): Promise<EventMediaSource> {
  const id = data.id || 'media-src-' + Date.now().toString(36);
  unmarkEventMediaDeleted(id);
  if (data.eventId) unmarkEventMediaDeleted(data.eventId);
  const now = new Date().toISOString();
  const candidate: EventMediaSource = {
    id,
    eventId: data.eventId || '',
    eventTitle: data.eventTitle || '',
    title: data.title || 'Broadcast Feed',
    primaryStreamUrl: data.primaryStreamUrl || '',
    streamType: data.streamType || 'hls',
    vpnProfileId: data.vpnProfileId || null,
    forceVpnRoute: data.forceVpnRoute !== undefined ? Boolean(data.forceVpnRoute) : true,
    backupStreamUrls: data.backupStreamUrls || [],
    isLive: data.isLive !== undefined ? Boolean(data.isLive) : true,
    healthStatus: 'healthy',
    latencyMs: 35,
    playbackSettings: data.playbackSettings || {
      lowLatency: true,
      bufferTime: 4,
      maxResolution: '1080p',
    },
    createdAt: now,
    updatedAt: now,
  };

  saveLocalEventMediaSource(candidate);

  try {
    const res = await fetch('/api/admin/events/media', {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const created: EventMediaSource = await res.json();
      saveLocalEventMediaSource(created);
      return created;
    }
  } catch (err) {
    console.warn('Server create event media failed, saved locally:', err);
  }
  return candidate;
}

export async function updateEventMediaSource(id: string, data: Partial<EventMediaSource>): Promise<EventMediaSource> {
  unmarkEventMediaDeleted(id);
  if (data.eventId) unmarkEventMediaDeleted(data.eventId);
  const local = getLocalEventMediaSources().find((m) => m.id === id);
  const updatedCandidate: EventMediaSource = {
    ...(local || ({} as any)),
    ...data,
    id,
    updatedAt: new Date().toISOString(),
  };
  saveLocalEventMediaSource(updatedCandidate);

  try {
    const res = await fetch(`/api/admin/events/media/${id}`, {
      method: 'PUT',
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const updated: EventMediaSource = await res.json();
      saveLocalEventMediaSource(updated);
      return updated;
    }
  } catch (err) {
    console.warn('Server update event media failed, saved locally:', err);
  }
  return updatedCandidate;
}

export async function deleteEventMediaSource(id: string): Promise<void> {
  markEventMediaDeleted(id);
  deleteLocalEventMediaSource(id);
  try {
    await fetch(`/api/admin/events/media/${id}`, {
      method: 'DELETE',
      headers: getHeaders(true),
    });
  } catch {
    // Ignore
  }
}

// ----------------- AUTOMATIC STREAM & VIDEO DETECTOR API -----------------

export async function detectMediaFromWebUrl(url: string): Promise<{
  detected: boolean;
  streamUrl: string;
  streamType: string;
  isEmbed?: boolean;
  source?: string;
  details?: string;
}> {
  try {
    const res = await fetch(`/api/stream/detect-media?url=${encodeURIComponent(url)}`);
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // fallback
  }
  return {
    detected: false,
    streamUrl: url,
    streamType: 'hls',
  };
}

export async function testEventMediaHealth(id: string): Promise<{
  healthStatus: string;
  primaryStream: { url: string; reachable: boolean };
  backups: Array<{ url: string; reachable: boolean }>;
  latencyMs: number;
  media: EventMediaSource;
}> {
  const res = await fetch(`/api/admin/events/media/${id}/test`, {
    method: 'POST',
    headers: getHeaders(true),
  });
  if (!res.ok) throw new Error('Stream health test failed');
  return res.json();
}

export async function switchEventMediaStream(id: string): Promise<{
  success: boolean;
  activeStreamIndex: number;
  activeUrl: string;
  message: string;
  media: EventMediaSource;
}> {
  const res = await fetch(`/api/admin/events/media/${id}/switch-stream`, {
    method: 'POST',
    headers: getHeaders(true),
  });
  if (!res.ok) throw new Error('Failed to switch stream feed');
  return res.json();
}
