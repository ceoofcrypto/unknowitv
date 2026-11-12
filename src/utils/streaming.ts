import { StreamType } from '../types/index.ts';

/**
 * Checks whether a URL is an external web player / web stream link rather than a raw video container
 */
export function isWebLinkStream(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase().trim();
  if (lower.includes('.m3u8') || lower.includes('.mpd')) return false;
  if (lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.ogg')) return false;
  if (
    lower.includes('pages.dev') ||
    lower.includes('/embed') ||
    lower.includes('/player') ||
    lower.includes('.html') ||
    lower.includes('ios?id=') ||
    lower.includes('sportlink') ||
    lower.includes('fancode') ||
    lower.includes('youtube.com') ||
    lower.includes('youtu.be') ||
    lower.includes('twitch.tv') ||
    lower.includes('vimeo.com') ||
    lower.includes('dailymotion.com') ||
    lower.includes('facebook.com') ||
    lower.includes('tamashaweb.com') ||
    lower.includes('crichd') ||
    lower.includes('streamed') ||
    !lower.match(/\.(m3u8|mpd|mp4|webm|ts|mkv)(\?.*)?$/)
  ) {
    return true;
  }
  return false;
}

export interface PlayableStreamResolution {
  playUrl: string;
  streamType: StreamType;
  isEmbed: boolean;
  requiresProxy?: boolean;
}

/**
 * Resolves any custom web link into an autoplay-ready stream or embed player URL.
 * Automatically transforms YouTube, Vimeo, Twitch, DailyMotion, and web embeds to
 * their native embeddable counterparts with autoplay enabled.
 */
export function resolvePlayableStreamUrl(rawUrl: string): PlayableStreamResolution {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { playUrl: '', streamType: 'hls', isEmbed: false };
  }

  const trimmed = rawUrl.trim();
  const lower = trimmed.toLowerCase();

  // 1. Direct HLS (.m3u8) Streams
  if (lower.includes('.m3u8')) {
    return { playUrl: trimmed, streamType: 'hls', isEmbed: false };
  }

  // 2. Direct MPEG-DASH (.mpd) Streams
  if (lower.includes('.mpd')) {
    return { playUrl: trimmed, streamType: 'dash', isEmbed: false };
  }

  // 3. Direct Video Containers (.mp4, .webm, .ogg)
  const cleanPath = lower.split('?')[0];
  if (cleanPath.endsWith('.mp4') || cleanPath.endsWith('.webm') || cleanPath.endsWith('.ogg')) {
    return { playUrl: trimmed, streamType: 'direct', isEmbed: false };
  }

  // 4. YouTube Watch / Live / Shorts / Share URLs -> Embed with Autoplay
  const ytWatchMatch = trimmed.match(/(?:youtube\.com\/(?:watch\?v=|live\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  if (ytWatchMatch && ytWatchMatch[1]) {
    const videoId = ytWatchMatch[1];
    return {
      playUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&playsinline=1&controls=1&rel=0`,
      streamType: 'iframe',
      isEmbed: true,
    };
  }
  if (lower.includes('youtube.com/embed/')) {
    const hasQuery = trimmed.includes('?');
    const autoParam = hasQuery ? '&autoplay=1&mute=0&playsinline=1' : '?autoplay=1&mute=0&playsinline=1';
    return {
      playUrl: trimmed.includes('autoplay=') ? trimmed : `${trimmed}${autoParam}`,
      streamType: 'iframe',
      isEmbed: true,
    };
  }

  // 5. Vimeo URLs -> Embed with Autoplay
  const vimeoMatch = trimmed.match(/vimeo\.com\/(?:video\/)?([0-9]+)/i);
  if (vimeoMatch && vimeoMatch[1]) {
    return {
      playUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1&muted=0`,
      streamType: 'iframe',
      isEmbed: true,
    };
  }

  // 6. DailyMotion URLs -> Embed with Autoplay
  const dmMatch = trimmed.match(/dailymotion\.com\/(?:video\/|embed\/video\/)([a-zA-Z0-9]+)/i);
  if (dmMatch && dmMatch[1]) {
    return {
      playUrl: `https://www.dailymotion.com/embed/video/${dmMatch[1]}?autoplay=1`,
      streamType: 'iframe',
      isEmbed: true,
    };
  }

  // 7. Twitch Stream URLs -> Player with Autoplay
  const twitchMatch = trimmed.match(/twitch\.tv\/([a-zA-Z0-9_]+)/i);
  if (twitchMatch && twitchMatch[1]) {
    const channel = twitchMatch[1];
    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    return {
      playUrl: `https://player.twitch.tv/?channel=${channel}&parent=${host}&autoplay=true&muted=false`,
      streamType: 'iframe',
      isEmbed: true,
    };
  }

  // 8. General Web Stream Links (pages.dev, crichd, sportlink, custom embeds)
  // Ensure autoplay=1 is present in the URL query string
  let finalEmbedUrl = trimmed;
  if (!finalEmbedUrl.includes('autoplay=')) {
    finalEmbedUrl = finalEmbedUrl.includes('?')
      ? `${finalEmbedUrl}&autoplay=1`
      : `${finalEmbedUrl}?autoplay=1`;
  }

  return {
    playUrl: finalEmbedUrl,
    streamType: 'iframe',
    isEmbed: true,
  };
}

/**
 * Detect stream container or format from URL
 */
export function detectStreamType(url: string): StreamType {
  if (!url) return 'hls';
  const lower = url.toLowerCase().trim();
  const cleanUrl = lower.split('?')[0];

  if (cleanUrl.endsWith('.m3u8') || lower.includes('.m3u8')) return 'hls';
  if (cleanUrl.endsWith('.mpd') || lower.includes('.mpd')) return 'dash';
  if (cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.webm') || cleanUrl.endsWith('.ogg')) {
    return 'direct';
  }
  if (isWebLinkStream(url)) {
    return 'iframe';
  }
  return 'hls';
}

/**
 * Validates whether a URL is a syntactically valid HTTP/HTTPS URL
 */
export function isValidStreamUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Human-readable friendly error description for player diagnostics
 */
export function getFriendlyStreamError(errorCode: string | number, details?: string): string {
  const detailStr = String(details || '').toLowerCase();
  
  if (detailStr.includes('cors') || detailStr.includes('access-control-allow-origin')) {
    return 'The broadcaster’s streaming server restricts web browser playback with cross-origin (CORS) security policies.';
  }
  if (detailStr.includes('manifestloaderror') || detailStr.includes('404')) {
    return 'Stream manifest could not be retrieved. The live broadcast feed may currently be offline or geo-restricted.';
  }
  if (detailStr.includes('keyloaderror') || detailStr.includes('drm')) {
    return 'This broadcast is protected by digital rights encryption (DRM) or requires subscriber tokens.';
  }
  if (detailStr.includes('bufferappenderror') || detailStr.includes('codec')) {
    return 'The video encoding format is not natively decoded by this browser.';
  }
  return 'Unable to establish a stable connection with this live stream. Please check your internet or retry.';
}

/**
 * Exponential backoff calculation for player retries with strict caps
 */
export function calculateBackoffDelay(retryAttempt: number, baseMs: number = 1000, maxMs: number = 8000): number {
  const delay = baseMs * Math.pow(2, Math.min(retryAttempt, 3));
  return Math.min(delay, maxMs);
}

/**
 * Returns the server-side proxied HLS stream URL to bypass CORS, HTTP mixed-content, and Referer checks
 */
export function getProxiedStreamUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('/api/stream-proxy')) return rawUrl;
  return `/api/stream-proxy?url=${encodeURIComponent(rawUrl.trim())}`;
}

/**
 * Determines whether a stream URL should immediately use the server stream proxy.
 * Plain HTTP (http://) URLs must use the proxy on an HTTPS origin to avoid mixed-content blocking.
 * HTTPS (https://) streams are loaded directly by the browser first (since most IPTV feeds
 * serve Access-Control-Allow-Origin: *) and automatically fall back to the proxy only if a CORS/network error occurs.
 */
export function shouldPreferStreamProxy(rawUrl: string): boolean {
  if (!rawUrl) return false;
  const trimmed = rawUrl.trim().toLowerCase();
  if (isWebLinkStream(trimmed)) return false;
  if (trimmed.startsWith('http://')) return true;
  return false;
}
