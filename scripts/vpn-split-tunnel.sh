#!/usr/bin/env bash
# scripts/vpn-split-tunnel.sh
# Configures Linux policy routing and iptables for domain-based selective split tunneling.
# Ensures application default traffic uses eth0 while selectively marked media egresses via tun0.

set -euo pipefail

VPN_INTERFACE="tun0"
TABLE_ID=200
TABLE_NAME="vpn_india"
FWMARK="0x100"

echo "[Tapaiko TV] Initializing Domain-Based Selective VPN Split Tunnel Routing..."

# 1. Ensure tun interface is present
if ! ip link show "${VPN_INTERFACE}" >/dev/null 2>&1; then
  echo "[Warning] ${VPN_INTERFACE} not yet active. Setting up routing table in advance."
fi

# 2. Add custom routing table if missing from /etc/iproute2/rt_tables
if ! grep -q "${TABLE_NAME}" /etc/iproute2/rt_tables 2>/dev/null; then
  echo "${TABLE_ID} ${TABLE_NAME}" >> /etc/iproute2/rt_tables
  echo "[OK] Registered ${TABLE_NAME} (Table ${TABLE_ID}) in /etc/iproute2/rt_tables"
fi

# 3. Enable IP forwarding
sysctl -w net.ipv4.ip_forward=1 >/dev/null

# 4. Flush existing rules for this table and mark
ip rule del fwmark "${FWMARK}" table "${TABLE_NAME}" 2>/dev/null || true
ip route flush table "${TABLE_NAME}" 2>/dev/null || true

# 5. Add default route through VPN tunnel interface to dedicated table
ip route add default dev "${VPN_INTERFACE}" table "${TABLE_NAME}" 2>/dev/null || true

# 6. Add policy routing rule matching packet fwmark
ip rule add fwmark "${FWMARK}" table "${TABLE_NAME}" priority 1000

# 7. Add NAT POSTROUTING masquerade on VPN tunnel interface
iptables -t nat -C POSTROUTING -o "${VPN_INTERFACE}" -j MASQUERADE 2>/dev/null || \
  iptables -t nat -A POSTROUTING -o "${VPN_INTERFACE}" -j MASQUERADE

# 8. Flush kernel route cache
ip route flush cache

echo "[Tapaiko TV] Selective VPN Routing configured successfully."
echo "Normal traffic: eth0 (Default)"
echo "Selective media traffic (marked ${FWMARK}): ${VPN_INTERFACE} (${TABLE_NAME})"
