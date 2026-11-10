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
    lower.includes('dailymotion.com')
  ) {
    return true;
  }
  return false;
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
