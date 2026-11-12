export type StreamType = 'hls' | 'dash' | 'direct' | 'iframe' | 'web_link';

export type EventStatus = 'UPCOMING' | 'LIVE' | 'ENDED' | 'CANCELLED';

export type VerificationStatus = 'verified' | 'untested' | 'failing';

export interface Country {
  name: string;
  code: string; // ISO 2-letter uppercase, e.g. 'NP', 'IN', 'US'
  flag: string; // Emoji flag, e.g. '🇳🇵', '🇮🇳', '🇺🇸'
  languages?: string[];
  channelCount?: number;
}

export interface Channel {
  id: string;
  name: string;
  nepaliName?: string;
  logoUrl: string;
  streamUrl: string;
  streamType: StreamType;
  categoryId: string;
  categoryName: string;
  country: string;
  countryCode?: string; // e.g. 'NP', 'IN', 'US'
  language: string;
  description: string;
  isActive: boolean;
  isPublished: boolean;
  isFeatured: boolean;
  priority: number; // lower number = higher priority
  sourceType: 'manual' | 'iptv-org';
  verificationStatus: VerificationStatus;
  lastVerifiedAt: string | null;
  reportCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeaturedEvent {
  id: string;
  title: string;
  nepaliTitle?: string;
  subtitle: string;
  description: string;
  thumbnailUrl: string;
  bannerUrl: string;
  channelId: string;
  channelName?: string;
  streamUrlOverride?: string | null;
  status: EventStatus;
  startTime: string; // ISO 8601
  endTime?: string | null;
  priority: number; // 1 is highest priority
  isActive: boolean;
  isPublished: boolean;
  buttonLabel: string;
  createdAt: string;
  updatedAt: string;
  mediaSource?: EventMediaSource;
}

export interface Category {
  id: string;
  name: string;
  nepaliName: string;
  slug: string;
  icon?: string;
  isActive: boolean;
  displayOrder: number;
  channelCount?: number;
}

export type AnnouncementType = 'info' | 'warning' | 'live' | 'success';
export type AnnouncementDisplayLocation = 'banner' | 'toast' | 'both';
export type AnnouncementActionType = 'okay' | 'visit' | 'download' | 'custom';

export interface Announcement {
  id: string;
  title: string;
  message: string;
  nepaliMessage?: string;
  type?: AnnouncementType;
  displayLocation?: AnnouncementDisplayLocation;
  actionType?: AnnouncementActionType;
  actionLabel?: string;
  actionUrl?: string;
  imageUrl?: string;
  isActive: boolean;
  isPublished: boolean;
  startTime?: string | null;
  endTime?: string | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  appName: string;
  tagline: string;
  nepaliTagline: string;
  logoUrl: string;
  maintenanceMode: boolean;
  showFeaturedEvent: boolean;
  defaultTheme: 'dark' | 'light';
  updatedAt: string;
}

export interface AdminUser {
  email: string;
  name: string;
  role: 'admin' | 'superadmin';
  token?: string;
}

export interface StreamQualityLevel {
  id: number;
  height: number;
  width: number;
  bitrate: number;
  label: string;
}

// ----------------- DOMAIN-BASED SELECTIVE VPN ROUTING TYPES -----------------

export type VpnTunnelStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'degraded';

export type PatternType = 'wildcard' | 'exact' | 'regex' | 'cidr';

export type RouteAction = 'route_vpn' | 'bypass' | 'block';

export interface VpnCredentials {
  username?: string;
  password?: string; // Stored securely/encrypted or masked
}

export interface VpnProfile {
  id: string;
  name: string;
  serverAddress: string;
  port: number;
  proto: 'udp' | 'tcp';
  cipher?: string;
  authType: 'credentials' | 'certificate' | 'user_pass_and_cert';
  credentials?: VpnCredentials;
  caCert?: string;
  clientCert?: string;
  clientKey?: string;
  ovpnConfigRaw?: string;
  region: string; // e.g. 'India (IN)'
  countryCode: string; // 'IN'
  city?: string; // 'Mumbai', 'Bangalore', 'Delhi'
  egressIp?: string | null;
  isIndiaVerified: boolean;
  status: VpnTunnelStatus;
  lastHealthCheck?: string | null;
  latencyMs?: number | null;
  bytesTransferredIn?: number;
  bytesTransferredOut?: number;
  isActive: boolean;
  isDefault: boolean;
  interfaceName?: string; // e.g. 'tun0' or 'vpn-in-0'
  createdAt: string;
  updatedAt: string;
}

export interface RoutingRule {
  id: string;
  name: string;
  domainPattern: string; // e.g. '*.hotstar.com', 'live.sonyliv.com', '103.199.160.0/22'
  patternType: PatternType;
  vpnProfileId: string; // The India VPN Profile to route through
  vpnProfileName?: string;
  priority: number; // 1 = highest priority match
  isActive: boolean;
  action: RouteAction;
  stripHeaders?: string[];
  injectHeaders?: Record<string, string>;
  description?: string;
  matchCount?: number;
  lastMatchedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventPlaybackSettings {
  maxResolution?: string;
  audioLanguage?: string;
  lowLatency?: boolean;
  bufferTime?: number;
  userAgentOverride?: string;
  refererOverride?: string;
}

export interface EventMediaSource {
  id: string;
  eventId: string;
  eventTitle: string;
  title: string;
  primaryStreamUrl: string;
  streamType: StreamType;
  vpnProfileId?: string | null;
  forceVpnRoute: boolean;
  backupStreamUrls: string[];
  headers?: Record<string, string>;
  playbackSettings?: EventPlaybackSettings;
  isLive: boolean;
  healthStatus: 'healthy' | 'warning' | 'offline' | 'untested';
  lastCheckedAt?: string | null;
  latencyMs?: number | null;
  lastErrorMessage?: string | null;
  failoverCount?: number;
  activeStreamIndex?: number; // 0 = primary, 1+ = backups
  createdAt: string;
  updatedAt: string;
}

export interface VpnGatewayStatus {
  activeTunnelCount: number;
  connectedProfiles: Array<{
    id: string;
    name: string;
    city?: string;
    egressIp?: string | null;
    latencyMs?: number | null;
    isIndiaVerified: boolean;
    uptimeSeconds: number;
  }>;
  defaultInterface: string;
  vpnInterface: string;
  egressIndiaIp: string | null;
  isIndiaVerified: boolean;
  totalRulesActive: number;
  totalMediaSourcesActive: number;
  memoryUsageMb: number;
  uptimeSeconds: number;
  lastCycleAt: string;
}

export interface VpnRouteTestResult {
  url: string;
  targetDomain: string;
  resolvedIp?: string;
  matchedRule: RoutingRule | null;
  routedVia: 'vpn' | 'default_interface' | 'blocked';
  vpnProfileName: string | null;
  egressIp: string | null;
  isIndiaEgress: boolean;
  statusCode: number;
  latencyMs: number;
  success: boolean;
  contentType?: string;
  isManifestValid?: boolean;
  details: string;
  diagnosticLogs: string[];
}
