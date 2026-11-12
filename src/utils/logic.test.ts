import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectStreamType,
  calculateBackoffDelay,
  isValidStreamUrl,
  isWebLinkStream,
  shouldPreferStreamProxy,
  resolvePlayableStreamUrl,
} from './streaming.ts';
import { getEligibleFeaturedEvents, getPrimaryFeaturedEvent } from './events.ts';
import {
  filterChannels,
  sanitizeLogoUrl,
  isAdminEmailAuthorized,
  getChannelMonogram,
} from './channels.ts';
import { FeaturedEvent, Channel, Country } from '../types/index.ts';
import { groupCountriesAlphabetically, searchCountries } from './countryHelpers.ts';
import { isDebuggerShortcut } from './security.ts';

test('detectStreamType identifies HLS, DASH, direct formats, and web embed links', () => {
  assert.equal(detectStreamType('https://live.example.com/playlist.m3u8'), 'hls');
  assert.equal(detectStreamType('https://live.example.com/manifest.mpd'), 'dash');
  assert.equal(detectStreamType('https://live.example.com/stream.mp4?token=123'), 'direct');
  assert.equal(detectStreamType('https://live.example.com/unknown.m3u8'), 'hls');
  assert.equal(detectStreamType('https://sportlink-fancode10.pages.dev/ios?id=4250374'), 'iframe');
});

test('isWebLinkStream correctly identifies external web player pages', () => {
  assert.equal(isWebLinkStream('https://sportlink-fancode10.pages.dev/ios?id=4250374'), true);
  assert.equal(isWebLinkStream('https://stream.example.com/embed/player.html?ch=1'), true);
  assert.equal(isWebLinkStream('https://www.youtube.com/embed/live_stream?channel=xyz'), true);
  assert.equal(isWebLinkStream('https://test.com/stream.m3u8'), false);
  assert.equal(isWebLinkStream('https://test.com/video.mp4'), false);
});

test('resolvePlayableStreamUrl converts YouTube watch/live links to embed with autoplay and preserves direct streams', () => {
  // YouTube watch link
  const ytWatch = resolvePlayableStreamUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(ytWatch.streamType, 'iframe');
  assert.equal(ytWatch.isEmbed, true);
  assert.ok(ytWatch.playUrl.includes('youtube.com/embed/dQw4w9WgXcQ'));
  assert.ok(ytWatch.playUrl.includes('autoplay=1'));

  // YouTube live link
  const ytLive = resolvePlayableStreamUrl('https://www.youtube.com/live/dQw4w9WgXcQ');
  assert.equal(ytLive.streamType, 'iframe');
  assert.ok(ytLive.playUrl.includes('youtube.com/embed/dQw4w9WgXcQ'));

  // Direct HLS stream
  const hls = resolvePlayableStreamUrl('https://stream.server.com/live/playlist.m3u8');
  assert.equal(hls.streamType, 'hls');
  assert.equal(hls.isEmbed, false);
  assert.equal(hls.playUrl, 'https://stream.server.com/live/playlist.m3u8');

  // Generic web player link
  const webLink = resolvePlayableStreamUrl('https://sportlink-fancode10.pages.dev/ios?id=4250374');
  assert.equal(webLink.streamType, 'iframe');
  assert.equal(webLink.isEmbed, true);
  assert.ok(webLink.playUrl.includes('autoplay=1'));
});

test('calculateBackoffDelay respects exponential backoff and max cap', () => {
  assert.equal(calculateBackoffDelay(0, 1000, 8000), 1000);
  assert.equal(calculateBackoffDelay(1, 1000, 8000), 2000);
  assert.equal(calculateBackoffDelay(2, 1000, 8000), 4000);
  assert.equal(calculateBackoffDelay(3, 1000, 8000), 8000);
  assert.equal(calculateBackoffDelay(10, 1000, 8000), 8000); // capped
});

test('isValidStreamUrl correctly validates URLs', () => {
  assert.equal(isValidStreamUrl('https://stream.tv/live.m3u8'), true);
  assert.equal(isValidStreamUrl('http://stream.tv/live.m3u8'), true);
  assert.equal(isValidStreamUrl('ftp://stream.tv/live.m3u8'), false);
  assert.equal(isValidStreamUrl('not-a-url'), false);
  assert.equal(isValidStreamUrl(''), false);
});

test('getEligibleFeaturedEvents filters unpublished events and orders by priority', () => {
  const mockEvents: FeaturedEvent[] = [
    {
      id: 'ev-3',
      title: 'Lower Priority Event',
      subtitle: 'Sub',
      description: 'Desc',
      thumbnailUrl: '',
      bannerUrl: '',
      channelId: 'ch-1',
      status: 'UPCOMING',
      startTime: '2026-11-06T10:00:00Z',
      priority: 3,
      isActive: true,
      isPublished: true,
      buttonLabel: 'Watch',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'ev-draft',
      title: 'Unpublished Draft',
      subtitle: 'Sub',
      description: 'Desc',
      thumbnailUrl: '',
      bannerUrl: '',
      channelId: 'ch-1',
      status: 'LIVE',
      startTime: '2026-11-06T10:00:00Z',
      priority: 1,
      isActive: true,
      isPublished: false, // draft
      buttonLabel: 'Watch',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'ev-1',
      title: 'Highest Priority Live Event',
      subtitle: 'Sub',
      description: 'Desc',
      thumbnailUrl: '',
      bannerUrl: '',
      channelId: 'ch-1',
      status: 'LIVE',
      startTime: '2026-11-06T10:00:00Z',
      priority: 1, // lowest number = highest priority
      isActive: true,
      isPublished: true,
      buttonLabel: 'Watch Live',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'ev-2',
      title: 'Second Priority Event',
      subtitle: 'Sub',
      description: 'Desc',
      thumbnailUrl: '',
      bannerUrl: '',
      channelId: 'ch-1',
      status: 'UPCOMING',
      startTime: '2026-11-06T12:00:00Z',
      priority: 2,
      isActive: true,
      isPublished: true,
      buttonLabel: 'View Schedule',
      createdAt: '',
      updatedAt: '',
    },
  ];

  const eligible = getEligibleFeaturedEvents(mockEvents);
  assert.equal(eligible.length, 3);
  assert.equal(eligible[0].id, 'ev-1');
  assert.equal(eligible[1].id, 'ev-2');
  assert.equal(eligible[2].id, 'ev-3');

  const primary = getPrimaryFeaturedEvent(mockEvents);
  assert.equal(primary?.id, 'ev-1');
});

test('filterChannels hides unpublished and failing channels from public viewers', () => {
  const mockChannels: Channel[] = [
    {
      id: 'ch-pub',
      name: 'Nepal TV HD',
      logoUrl: '',
      streamUrl: 'https://test.m3u8',
      streamType: 'hls',
      categoryId: 'nepali-tv',
      categoryName: 'Nepali TV',
      country: 'Nepal',
      language: 'Nepali',
      description: 'Public channel',
      isActive: true,
      isPublished: true,
      isFeatured: false,
      priority: 1,
      sourceType: 'manual',
      verificationStatus: 'verified',
      lastVerifiedAt: null,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'ch-failing',
      name: 'Dead Stream TV',
      logoUrl: '',
      streamUrl: 'https://dead.m3u8',
      streamType: 'hls',
      categoryId: 'nepali-tv',
      categoryName: 'Nepali TV',
      country: 'Nepal',
      language: 'Nepali',
      description: 'Failing stream',
      isActive: true,
      isPublished: true,
      isFeatured: false,
      priority: 1,
      sourceType: 'iptv-org',
      verificationStatus: 'failing',
      lastVerifiedAt: null,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'ch-draft',
      name: 'Secret Test Channel',
      logoUrl: '',
      streamUrl: 'https://test.m3u8',
      streamType: 'hls',
      categoryId: 'nepali-tv',
      categoryName: 'Nepali TV',
      country: 'Nepal',
      language: 'Nepali',
      description: 'Unpublished channel',
      isActive: true,
      isPublished: false,
      isFeatured: false,
      priority: 2,
      sourceType: 'manual',
      verificationStatus: 'untested',
      lastVerifiedAt: null,
      createdAt: '',
      updatedAt: '',
    },
  ];

  const publicResult = filterChannels(mockChannels, { publicOnly: true });
  assert.equal(publicResult.length, 1);
  assert.equal(publicResult[0].id, 'ch-pub');

  const adminResult = filterChannels(mockChannels, { publicOnly: false });
  assert.equal(adminResult.length, 3);
});

test('groupCountriesAlphabetically organizes countries by letter from A to Z', () => {
  const sampleCountries: Country[] = [
    { name: 'Nepal', code: 'NP', flag: '🇳🇵' },
    { name: 'India', code: 'IN', flag: '🇮🇳' },
    { name: 'Australia', code: 'AU', flag: '🇦🇺' },
    { name: 'Brazil', code: 'BR', flag: '🇧🇷' },
    { name: 'Argentina', code: 'AR', flag: '🇦🇷' },
    { name: 'United States', code: 'US', flag: '🇺🇸' },
    { name: 'United Kingdom', code: 'UK', flag: '🇬🇧' },
  ];

  const groups = groupCountriesAlphabetically(sampleCountries);
  assert.equal(groups.length, 5); // A, B, I, N, U
  assert.equal(groups[0].letter, 'A');
  assert.equal(groups[0].countries.length, 2);
  assert.equal(groups[0].countries[0].name, 'Argentina');
  assert.equal(groups[0].countries[1].name, 'Australia');

  assert.equal(groups[1].letter, 'B');
  assert.equal(groups[1].countries[0].name, 'Brazil');

  assert.equal(groups[2].letter, 'I');
  assert.equal(groups[2].countries[0].name, 'India');

  assert.equal(groups[3].letter, 'N');
  assert.equal(groups[3].countries[0].name, 'Nepal');

  assert.equal(groups[4].letter, 'U');
  assert.equal(groups[4].countries.length, 2);
});

test('searchCountries filters countries by name and ISO code', () => {
  const sampleCountries: Country[] = [
    { name: 'Nepal', code: 'NP', flag: '🇳🇵' },
    { name: 'India', code: 'IN', flag: '🇮🇳' },
    { name: 'United States', code: 'US', flag: '🇺🇸' },
  ];

  assert.equal(searchCountries(sampleCountries, 'ind').length, 1);
  assert.equal(searchCountries(sampleCountries, 'ind')[0].name, 'India');
  assert.equal(searchCountries(sampleCountries, 'np').length, 1);
  assert.equal(searchCountries(sampleCountries, 'np')[0].name, 'Nepal');
  assert.equal(searchCountries(sampleCountries, '').length, 3);
});

test('sanitizeLogoUrl strips unsplash and wikia CORP-blocked URLs', () => {
  assert.equal(
    sanitizeLogoUrl('https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=160'),
    ''
  );
  assert.equal(
    sanitizeLogoUrl('https://static.wikia.nocookie.net/logopedia/images/6/69/DD_Sports.svg'),
    ''
  );
  assert.equal(sanitizeLogoUrl('https://i.imgur.com/GzB9o1X.png'), 'https://i.imgur.com/GzB9o1X.png');
  assert.equal(sanitizeLogoUrl(''), '');
});

test('isAdminEmailAuthorized strictly permits only ceoofcrypto@gmail.com', () => {
  assert.equal(isAdminEmailAuthorized('ceoofcrypto@gmail.com'), true);
  assert.equal(isAdminEmailAuthorized('  CEOOFCRYPTO@GMAIL.COM '), true);
  assert.equal(isAdminEmailAuthorized('admin@tapaiko.tv'), false);
  assert.equal(isAdminEmailAuthorized('otheruser@gmail.com'), false);
  assert.equal(isAdminEmailAuthorized(''), false);
  assert.equal(isAdminEmailAuthorized(null), false);
});

test('getChannelMonogram generates deterministic callsign initials', () => {
  const mono1 = getChannelMonogram('Kantipur TV HD');
  assert.equal(mono1.initials, 'KT');
  const mono2 = getChannelMonogram('NDTV');
  assert.equal(mono2.initials, 'ND');
});

test('isDebuggerShortcut detects developer tools and inspection shortcuts', () => {
  // F12
  assert.equal(isDebuggerShortcut({ key: 'F12', keyCode: 123 }), true);
  // Ctrl+Shift+I / Cmd+Shift+I
  assert.equal(isDebuggerShortcut({ key: 'I', ctrlKey: true, shiftKey: true }), true);
  assert.equal(isDebuggerShortcut({ key: 'i', metaKey: true, shiftKey: true }), true);
  // Ctrl+Shift+J / C / K
  assert.equal(isDebuggerShortcut({ key: 'J', ctrlKey: true, shiftKey: true }), true);
  assert.equal(isDebuggerShortcut({ key: 'C', ctrlKey: true, shiftKey: true }), true);
  assert.equal(isDebuggerShortcut({ key: 'k', ctrlKey: true, shiftKey: true }), true);
  // Ctrl+U (view source)
  assert.equal(isDebuggerShortcut({ key: 'u', ctrlKey: true }), true);
  assert.equal(isDebuggerShortcut({ key: 'U', metaKey: true }), true);
  // Ctrl+S (save source)
  assert.equal(isDebuggerShortcut({ key: 's', ctrlKey: true }), true);
  // Normal typing should not be blocked
  assert.equal(isDebuggerShortcut({ key: 'Enter' }), false);
  assert.equal(isDebuggerShortcut({ key: 'a' }), false);
  assert.equal(isDebuggerShortcut({ key: 'c', ctrlKey: true }), false); // Ctrl+C copy
  assert.equal(isDebuggerShortcut({ key: 'v', ctrlKey: true }), false); // Ctrl+V paste
});

// ----------------- DOMAIN-BASED SELECTIVE VPN ROUTING TESTS -----------------

import {
  isSsrfUnsafe,
  matchWildcardDomain,
  matchDomainRule,
  parseOvpnConfig,
  maskSecret,
} from './vpnRouting.ts';
import { RoutingRule } from '../types/index.ts';

test('isSsrfUnsafe blocks loopback, private subnets, cloud metadata, and invalid protocols', () => {
  // Loopback
  assert.equal(isSsrfUnsafe('http://127.0.0.1/admin').safe, false);
  assert.equal(isSsrfUnsafe('http://localhost:8080/manifest.m3u8').safe, false);
  assert.equal(isSsrfUnsafe('http://127.0.0.2:3000').safe, false);
  assert.equal(isSsrfUnsafe('http://0.0.0.0:80').safe, false);

  // Private RFC 1918
  assert.equal(isSsrfUnsafe('http://10.0.0.1/stream.m3u8').safe, false);
  assert.equal(isSsrfUnsafe('http://172.16.0.1/video.ts').safe, false);
  assert.equal(isSsrfUnsafe('http://172.31.255.255/video.ts').safe, false);
  assert.equal(isSsrfUnsafe('http://192.168.1.1/cam.m3u8').safe, false);

  // Cloud metadata
  assert.equal(isSsrfUnsafe('http://169.254.169.254/latest/meta-data/').safe, false);

  // Non-HTTP/HTTPS
  assert.equal(isSsrfUnsafe('ftp://stream.example.com/live.m3u8').safe, false);
  assert.equal(isSsrfUnsafe('file:///etc/passwd').safe, false);

  // Valid public streaming targets
  assert.equal(isSsrfUnsafe('https://live.hotstar.com/stream.m3u8').safe, true);
  assert.equal(isSsrfUnsafe('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8').safe, true);
  assert.equal(isSsrfUnsafe('https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8').safe, true);
});

test('matchWildcardDomain correctly matches apex and subdomains', () => {
  assert.equal(matchWildcardDomain('live.hotstar.com', '*.hotstar.com'), true);
  assert.equal(matchWildcardDomain('hotstar.com', '*.hotstar.com'), true);
  assert.equal(matchWildcardDomain('cdn.live.hotstar.com', '*.hotstar.com'), true);
  assert.equal(matchWildcardDomain('other-stream.com', '*.hotstar.com'), false);
  assert.equal(matchWildcardDomain('fakehotstar.com', '*.hotstar.com'), false);

  assert.equal(matchWildcardDomain('sonyliv.com', '*.sonyliv.com'), true);
  assert.equal(matchWildcardDomain('live.sonyliv.com', '*.sonyliv.com'), true);
  assert.equal(matchWildcardDomain('example.sonyliv.net', '*.sonyliv.com'), false);
});

test('matchDomainRule selects highest priority active rule and ignores disabled rules', () => {
  const sampleRules: RoutingRule[] = [
    {
      id: 'rule-low-priority',
      name: 'General Indian Media',
      domainPattern: '*.hotstar.com',
      patternType: 'wildcard',
      vpnProfileId: 'vpn-profile-bangalore',
      priority: 10,
      isActive: true,
      action: 'route_vpn',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'rule-disabled-high-priority',
      name: 'Disabled Rule',
      domainPattern: '*.hotstar.com',
      patternType: 'wildcard',
      vpnProfileId: 'vpn-profile-delhi',
      priority: 1,
      isActive: false, // Disabled
      action: 'route_vpn',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'rule-active-high-priority',
      name: 'Priority #2 Mumbai Hotstar',
      domainPattern: '*.hotstar.com',
      patternType: 'wildcard',
      vpnProfileId: 'vpn-profile-mumbai-express',
      priority: 2,
      isActive: true,
      action: 'route_vpn',
      createdAt: '',
      updatedAt: '',
    },
  ];

  const matched = matchDomainRule('https://live.hotstar.com/cricket.m3u8', sampleRules);
  assert.ok(matched);
  assert.equal(matched?.id, 'rule-active-high-priority');
  assert.equal(matched?.vpnProfileId, 'vpn-profile-mumbai-express');

  // No match returns null
  assert.equal(matchDomainRule('https://unrelated.bbc.co.uk/news.m3u8', sampleRules), null);
});

test('parseOvpnConfig correctly parses remote, port, protocol, cipher, and inline certificates', () => {
  const sampleOvpn = `
# OpenVPN Client Configuration for India Mumbai Gateway
client
dev tun
proto udp
remote 103.189.24.12 1194
cipher AES-256-GCM
auth-user-pass

<ca>
-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAP...
-----END CERTIFICATE-----
</ca>
`;

  const parsed = parseOvpnConfig(sampleOvpn);
  assert.equal(parsed.serverAddress, '103.189.24.12');
  assert.equal(parsed.port, 1194);
  assert.equal(parsed.proto, 'udp');
  assert.equal(parsed.cipher, 'AES-256-GCM');
  assert.ok(parsed.caCert?.includes('BEGIN CERTIFICATE'));
});

test('maskSecret masks passwords and credentials safely without cleartext exposure', () => {
  assert.equal(maskSecret('secretPassword123'), 'se••••••••23');
  assert.equal(maskSecret('pass'), '••••');
  assert.equal(maskSecret(''), '');
});

test('shouldPreferStreamProxy routes insecure HTTP streams via proxy and plays HTTPS streams directly', () => {
  // HTTPS IPTV HLS streams should play directly in browser first (fallback to proxy only on error)
  assert.equal(shouldPreferStreamProxy('https://ktvhdsg.ekantipur.com:8443/hd/playlist.m3u8'), false);
  assert.equal(shouldPreferStreamProxy('https://d35j504z0x2vu2.cloudfront.net/out/v1/master.m3u8'), false);
  assert.equal(shouldPreferStreamProxy('https://cdn.pishow.tv/ott/live/1490/master.m3u8'), false);

  // Plain HTTP streams must be proxied to avoid mixed-content errors on HTTPS pages
  assert.equal(shouldPreferStreamProxy('http://insecure-stream.org/live.m3u8'), true);

  // Web link embeds should NOT be proxied as video
  assert.equal(shouldPreferStreamProxy('https://sportlink-fancode10.pages.dev/ios?id=4250374'), false);
  assert.equal(shouldPreferStreamProxy('https://www.youtube.com/embed/live_stream'), false);

  // Local/relative paths
  assert.equal(shouldPreferStreamProxy('/api/stream-proxy?url=xyz'), false);
});


