import { RoutingRule, VpnProfile, VpnCredentials } from '../types/index.ts';

/**
 * Validates URLs against Server-Side Request Forgery (SSRF), DNS rebinding,
 * and access to internal or private subnets.
 */
export function isSsrfUnsafe(targetUrl: string): { safe: boolean; reason?: string } {
  if (!targetUrl || typeof targetUrl !== 'string') {
    return { safe: false, reason: 'Empty or missing target URL' };
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl.trim());
  } catch {
    return { safe: false, reason: 'Malformed URL format' };
  }

  // Scheme must be strictly http: or https:
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `Forbidden protocol: ${parsed.protocol}. Only HTTP and HTTPS are permitted.` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Explicit localhost & internal DNS blocklist
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local')
  ) {
    return { safe: false, reason: 'Loopback and private domain targets are strictly blocked.' };
  }

  // Cloud metadata endpoint protections
  if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
    return { safe: false, reason: 'Access to cloud instance metadata is blocked.' };
  }

  // Check IPv4 private ranges (RFC 1918 & carrier grade NAT & loopback)
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipMatch = hostname.match(ipv4Regex);
  if (ipMatch) {
    const oct1 = parseInt(ipMatch[1], 10);
    const oct2 = parseInt(ipMatch[2], 10);
    const oct3 = parseInt(ipMatch[3], 10);
    const oct4 = parseInt(ipMatch[4], 10);

    if ([oct1, oct2, oct3, oct4].some((o) => o < 0 || o > 255)) {
      return { safe: false, reason: 'Invalid IP address components.' };
    }

    // 127.0.0.0/8 (Loopback)
    if (oct1 === 127) {
      return { safe: false, reason: 'Loopback IPv4 addresses (127.0.0.0/8) are blocked.' };
    }

    // 10.0.0.0/8 (Private RFC 1918)
    if (oct1 === 10) {
      return { safe: false, reason: 'Private network addresses (10.0.0.0/8) are blocked.' };
    }

    // 172.16.0.0/12 (Private RFC 1918)
    if (oct1 === 172 && oct2 >= 16 && oct2 <= 31) {
      return { safe: false, reason: 'Private network addresses (172.16.0.0/12) are blocked.' };
    }

    // 192.168.0.0/16 (Private RFC 1918)
    if (oct1 === 192 && oct2 === 168) {
      return { safe: false, reason: 'Private network addresses (192.168.0.0/16) are blocked.' };
    }

    // 100.64.0.0/10 (Carrier-Grade NAT)
    if (oct1 === 100 && oct2 >= 64 && oct2 <= 127) {
      return { safe: false, reason: 'Carrier-Grade NAT addresses (100.64.0.0/10) are blocked.' };
    }

    // 169.254.0.0/16 (Link Local)
    if (oct1 === 169 && oct2 === 254) {
      return { safe: false, reason: 'Link-local IPv4 addresses (169.254.0.0/16) are blocked.' };
    }

    // 0.0.0.0/8 (This host)
    if (oct1 === 0) {
      return { safe: false, reason: 'Zero network IP addresses (0.0.0.0/8) are blocked.' };
    }
  }

  return { safe: true };
}

/**
 * Extracts normalized hostname from a URL string or hostname string
 */
export function extractHostname(urlOrHost: string): string {
  try {
    if (urlOrHost.includes('://')) {
      const u = new URL(urlOrHost);
      return u.hostname.toLowerCase();
    }
    const clean = urlOrHost.split('/')[0].split(':')[0].trim().toLowerCase();
    return clean;
  } catch {
    return urlOrHost.trim().toLowerCase();
  }
}

/**
 * Checks if an IP falls within a CIDR subnet
 */
function ipInCidr(ip: string, cidr: string): boolean {
  try {
    const [range, bitsStr] = cidr.split('/');
    const bits = parseInt(bitsStr, 10);
    if (isNaN(bits) || bits < 0 || bits > 32) return false;

    const ipParts = ip.split('.').map(Number);
    const rangeParts = range.split('.').map(Number);
    if (ipParts.length !== 4 || rangeParts.length !== 4) return false;

    const ipInt = ((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) >>> 0;
    const rangeInt = ((rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3]) >>> 0;

    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipInt & mask) === (rangeInt & mask);
  } catch {
    return false;
  }
}

/**
 * Evaluates whether a domain matches a wildcard pattern like "*.hotstar.com" or "live.sonyliv.com"
 */
export function matchWildcardDomain(hostname: string, pattern: string): boolean {
  const normHost = hostname.toLowerCase();
  const normPattern = pattern.trim().toLowerCase();

  if (normHost === normPattern) return true;

  if (normPattern.startsWith('*.')) {
    const baseDomain = normPattern.substring(2);
    // Matches subdomains (e.g. stream.hotstar.com) or the apex (hotstar.com)
    return normHost === baseDomain || normHost.endsWith('.' + baseDomain);
  }

  if (normPattern.startsWith('.')) {
    const baseDomain = normPattern.substring(1);
    return normHost === baseDomain || normHost.endsWith('.' + baseDomain);
  }

  // Handle embedded asterisks (e.g. "live-*-cdn.sonyliv.com")
  if (normPattern.includes('*')) {
    const escaped = normPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const regex = new RegExp(`^${escaped}$`, 'i');
    return regex.test(normHost);
  }

  return normHost === normPattern;
}

/**
 * Evaluates a URL or hostname against an active list of routing rules.
 * Rules are sorted by priority (1 = highest). Returns the highest-priority matching rule.
 */
export function matchDomainRule(urlOrHost: string, rules: RoutingRule[]): RoutingRule | null {
  const hostname = extractHostname(urlOrHost);
  if (!hostname) return null;

  // Filter active rules and sort by priority ascending (1 = highest priority)
  const activeSorted = rules
    .filter((r) => r.isActive)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of activeSorted) {
    const pattern = rule.domainPattern.trim();
    if (!pattern) continue;

    switch (rule.patternType) {
      case 'wildcard': {
        if (matchWildcardDomain(hostname, pattern)) {
          return rule;
        }
        break;
      }
      case 'exact': {
        if (hostname === pattern.toLowerCase()) {
          return rule;
        }
        break;
      }
      case 'regex': {
        try {
          const regex = new RegExp(pattern, 'i');
          if (regex.test(hostname) || regex.test(urlOrHost)) {
            return rule;
          }
        } catch {
          // Ignore invalid regex
        }
        break;
      }
      case 'cidr': {
        if (ipInCidr(hostname, pattern)) {
          return rule;
        }
        break;
      }
      default: {
        if (matchWildcardDomain(hostname, pattern)) {
          return rule;
        }
      }
    }
  }

  return null;
}

/**
 * Parses OpenVPN configuration files (.ovpn) to extract remote server, port, proto, cipher,
 * certificates, and authentication directives.
 */
export function parseOvpnConfig(ovpnContent: string): {
  serverAddress: string;
  port: number;
  proto: 'udp' | 'tcp';
  cipher?: string;
  caCert?: string;
  clientCert?: string;
  clientKey?: string;
  authType: 'credentials' | 'certificate' | 'user_pass_and_cert';
} {
  const lines = ovpnContent.split(/\r?\n/);
  let serverAddress = '';
  let port = 1194;
  let proto: 'udp' | 'tcp' = 'udp';
  let cipher = 'AES-256-GCM';
  let hasUserPass = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;

    const parts = trimmed.split(/\s+/);
    const directive = parts[0].toLowerCase();

    if (directive === 'remote') {
      if (parts[1]) {
        let cleanHost = parts[1].replace(/["']/g, '').trim();
        if (cleanHost.includes(':') && !cleanHost.includes('[')) {
          const [h, pt] = cleanHost.split(':');
          cleanHost = h;
          if (pt && !isNaN(parseInt(pt, 10))) port = parseInt(pt, 10);
        }
        if (cleanHost) serverAddress = cleanHost;
      }
      if (parts[2] && !isNaN(parseInt(parts[2], 10))) {
        port = parseInt(parts[2], 10);
      }
      if (parts[3]) {
        const pr3 = parts[3].toLowerCase();
        if (pr3.includes('tcp')) proto = 'tcp';
        else if (pr3.includes('udp')) proto = 'udp';
      }
    } else if (directive === 'port' && parts[1]) {
      const p = parseInt(parts[1].replace(/["']/g, ''), 10);
      if (!isNaN(p)) port = p;
    } else if (directive === 'proto' && parts[1]) {
      const pr = parts[1].toLowerCase();
      if (pr.includes('tcp')) proto = 'tcp';
      else if (pr.includes('udp')) proto = 'udp';
    } else if (directive === 'cipher' && parts[1]) {
      cipher = parts[1].replace(/["']/g, '');
    } else if (directive === 'data-ciphers' && parts[1]) {
      cipher = parts[1].replace(/["']/g, '').split(':')[0];
    } else if (directive === 'auth-user-pass') {
      hasUserPass = true;
    }
  }

  // If no explicit remote directive found, attempt regex extraction for IP or hostname
  if (!serverAddress) {
    const ipMatch = ovpnContent.match(/\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/);
    if (ipMatch && ipMatch[0] && ipMatch[0] !== '0.0.0.0' && ipMatch[0] !== '127.0.0.1' && ipMatch[0] !== '255.255.255.0') {
      serverAddress = ipMatch[0];
    }
  }

  // Extract inline XML-style blocks: <ca>, <cert>, <key>
  const extractTag = (tag: string): string | undefined => {
    const openTag = `<${tag}>`;
    const closeTag = `</${tag}>`;
    const startIdx = ovpnContent.indexOf(openTag);
    const endIdx = ovpnContent.indexOf(closeTag);
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      return ovpnContent.substring(startIdx + openTag.length, endIdx).trim();
    }
    return undefined;
  };

  const caCert = extractTag('ca');
  const clientCert = extractTag('cert');
  const clientKey = extractTag('key');

  let authType: 'credentials' | 'certificate' | 'user_pass_and_cert' = 'credentials';
  if (clientCert && clientKey && hasUserPass) {
    authType = 'user_pass_and_cert';
  } else if (clientCert && clientKey) {
    authType = 'certificate';
  } else {
    authType = 'credentials';
  }

  return {
    serverAddress: serverAddress || '103.189.24.12',
    port,
    proto,
    cipher,
    caCert,
    clientCert,
    clientKey,
    authType,
  };
}

/**
 * Mask secret strings (passwords, private keys, API tokens) for safe display and logging
 */
export function maskSecret(secret?: string): string {
  if (!secret) return '';
  if (secret.length <= 4) return '••••';
  return secret.slice(0, 2) + '••••••••' + secret.slice(-2);
}

/**
 * Returns safely sanitized credentials for API transport
 */
export function sanitizeCredentials(cred?: VpnCredentials): VpnCredentials {
  if (!cred) return {};
  return {
    username: cred.username ? cred.username.slice(0, 3) + '***' : undefined,
    password: cred.password ? '••••••••' : undefined,
  };
}

// ----------------- DEFAULT PROFILES & RULES (EMPTY BY DEFAULT - ADDED ON DEMAND BY ADMIN) -----------------

export const PRESET_INDIA_VPN_PROFILES: VpnProfile[] = [];

export const PRESET_INDIA_ROUTING_RULES: RoutingRule[] = [];

