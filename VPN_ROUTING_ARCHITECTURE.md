# Domain-Based Selective VPN Routing Architecture
**Project**: तपाईंको TV (Tapaiko TV)  
**Module**: Backend Selective India VPN Media Gateway & Routing Engine  
**Target Environment**: Linux (Debian / Ubuntu / Alpine / Containerized with `NET_ADMIN`)

---

## 1. System Overview & Objective

The **Domain-Based Selective VPN Routing System** allows selected Indian-region media URLs and streaming domains (e.g., Disney+ Hotstar, SonyLIV, JioCinema, Zee5, DD Sports) to route through an India-based OpenVPN gateway connection, while keeping all normal application traffic (Google Firebase Auth, Firestore database operations, admin authentication, general APIs, and non-Indian TV channels) on the default network interface.

### Core Architecture Diagram
```
                     +---------------------------------------+
                     |    तपाईंको TV Application Client      |
                     +---------------------------------------+
                                         |
                                         | HTTP/HTTPS
                                         v
                     +---------------------------------------+
                     |      Express Media Gateway Server     |
                     |         (/api/gateway/stream)         |
                     +---------------------------------------+
                                         |
                       [SSRF Security & URL Validation]
                       - RFC 1918 private subnets blocked
                       - 127.0.0.0/8 & 169.254.169.254 blocked
                       - DNS Rebinding defense enforced
                                         |
                     +---------------------------------------+
                     |     Domain-Based Routing Engine       |
                     |    Evaluates Rules by Priority (1..N) |
                     +---------------------------------------+
                                    /         \
                      Matches India Rule       Normal Traffic / No Match
                                  /             \
                                 v               v
                +---------------------+    +---------------------------+
                | India VPN Interface |    | Default Host Interface    |
                |  (tun0 / Egress IN) |    |  (eth0 / Standard Egress) |
                +---------------------+    +---------------------------+
                           |                             |
                           v                             v
                [Indian Media CDNs]        [Google Auth, Firestore, APIs]
                - Hotstar, SonyLIV         - Firebase Auth, Firestore
                - JioCinema, Zee5          - IPTv-org, Open Channels
```

---

## 2. Split-Tunneling Routing Engine

### 2.1 Egress Separation
1. **Normal Traffic (eth0 / default gateway)**:
   - Firebase Authentication (`*.googleapis.com`, `*.firebaseio.com`)
   - Firestore database document sync
   - Public TV directory queries (`/api/channels`, `/api/countries`)
   - Admin JWT authentication (`ceoofcrypto@gmail.com`)
   - General external requests

2. **Selective Media Traffic (tun0 / India Gateway)**:
   - Streams and manifests matching administrative domain rules (e.g. `*.hotstar.com`, `*.sonyliv.com`)
   - Child playlists (`.m3u8`, `.mpd`)
   - Media segments (`.ts`, `.m4s`, `.mp4`)
   - DRM license and encryption key URIs (`#EXT-X-KEY`)

### 2.2 Linux Policy Routing & `iproute2` Configuration
When deploying the OpenVPN client on a Linux host or Docker container with `cap_add: [NET_ADMIN]`, standard OpenVPN pushes `redirect-gateway def1` which breaks normal server connectivity. Our configuration strips `redirect-gateway` and uses custom policy routing tables:

```bash
# 1. Define custom routing table in /etc/iproute2/rt_tables
echo "200 vpn_india" >> /etc/iproute2/rt_tables

# 2. Add default route through VPN tunnel to custom table ONLY
ip route add default dev tun0 table vpn_india

# 3. Mark packets originating from Media Gateway selective proxy
iptables -t mangle -A OUTPUT -m owner --uid-owner tapaiko-gateway -j MARK --set-mark 0x100
iptables -t nat -A POSTROUTING -o tun0 -j MASQUERADE

# 4. Route marked packets through the India VPN table
ip rule add fwmark 0x100 table vpn_india
ip route flush cache
```

---

## 3. Manifest Rewriting Engine (HLS & DASH)

To ensure that nested segment requests and sub-playlists preserve the selective VPN routing policy:
- **HLS (`.m3u8`)**: All `#EXT-X-STREAM-INF` playlist URLs, `#EXTINF` segment chunks, and `#EXT-X-KEY:METHOD=...,URI="..."` key endpoints are dynamically rewritten from upstream origins into local `/api/gateway/stream?url=<ENCODED_RESOLVED_URL>&profileId=<PROFILE_ID>` endpoints.
- **MPEG-DASH (`.mpd`)**: All `<BaseURL>` and relative SegmentTemplate nodes are rewritten to point through `/api/gateway/stream`.

---

## 4. Security & Hardening Controls

### 4.1 Server-Side Request Forgery (SSRF) Protection
All URLs passing through `/api/gateway/stream` and `/api/stream-proxy` are verified by `isSsrfUnsafe()`:
- Rejects loopback (`127.0.0.0/8`, `localhost`, `::1`).
- Rejects RFC 1918 private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
- Rejects link-local & cloud metadata (`169.254.169.254`, `metadata.google.internal`).
- Rejects carrier-grade NAT (`100.64.0.0/10`) and zero addresses (`0.0.0.0/8`).
- Restricts protocols strictly to `http:` and `https:`.

### 4.2 Open-Relay Mitigation & Rate Limiting
- The media gateway strictly matches administrator-approved domains or profiles.
- Unapproved arbitrary host proxies return `403 Forbidden`.
- Bandwidth and connection timeouts (15 seconds abort signal) prevent hung sockets.

### 4.3 Administrator Access Control
- All VPN profile manipulation, route configuration, and connection probes require Google Sign-In with verified email matching `ceoofcrypto@gmail.com`.
- Secrets (OpenVPN passwords, private keys) are never transmitted in cleartext or logged to console logs.

---

## 5. API Reference

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/gateway/stream` | GET | Public | Streaming media gateway with India selective VPN routing & manifest rewrite |
| `/api/stream-proxy` | GET | Public | Standard HLS proxy with SSRF protection |
| `/api/admin/vpn/profiles` | GET / POST | Admin | Manage OpenVPN gateway profiles & parse `.ovpn` files |
| `/api/admin/vpn/profiles/:id` | PUT / DELETE | Admin | Update / delete VPN gateway profiles |
| `/api/admin/vpn/profiles/:id/connect` | POST | Admin | Activate gateway tunnel and verify India egress |
| `/api/admin/vpn/profiles/:id/disconnect` | POST | Admin | Deactivate gateway tunnel |
| `/api/admin/vpn/test-connection` | POST | Admin | Run real-time TLS handshake & latency probe to India server |
| `/api/admin/vpn/status` | GET | Admin | Retrieve gateway health, active tunnels, and bandwidth metrics |
| `/api/admin/routing/rules` | GET / POST | Admin | Manage domain selective routing rules |
| `/api/admin/routing/rules/:id` | PUT / DELETE | Admin | Update / delete routing rules |
| `/api/admin/routing/test-url` | POST | Admin | Run route simulator with step-by-step diagnostic trace |
| `/api/admin/routing/presets/apply` | POST | Admin | Load presets for Hotstar, SonyLIV, JioCinema, Zee5, DD Sports |
| `/api/admin/events/media` | GET / POST | Admin | Manage headline event primary streams and backup failover sources |
| `/api/admin/events/media/:id/test` | POST | Admin | Probe primary & backup streams in parallel |
| `/api/admin/events/media/:id/switch-stream` | POST | Admin | Switch active event stream to backup failover feed |
