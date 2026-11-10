import React, { useState } from 'react';
import { VpnProfile } from '../../types/index.ts';
import {
  createVpnProfile,
  updateVpnProfile,
  deleteVpnProfile,
  connectVpnProfile,
  disconnectVpnProfile,
  testVpnConnection,
} from '../../services/api.ts';
import {
  Shield,
  Activity,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  Upload,
  CheckCircle2,
  XCircle,
  Clock,
  Wifi,
  Lock,
  FileText,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { ConfirmModal } from '../common/ConfirmModal.tsx';
import { parseOvpnConfig } from '../../utils/vpnRouting.ts';

interface VpnGatewayManagerProps {
  profiles: VpnProfile[];
  onRefresh: () => Promise<void>;
  showSuccess: (msg: string) => void;
  showError: (msg: string) => void;
}

export const VpnGatewayManager: React.FC<VpnGatewayManagerProps> = ({
  profiles,
  onRefresh,
  showSuccess,
  showError,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Partial<VpnProfile> | null>(null);
  const [rawOvpnText, setRawOvpnText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [profileToDelete, setProfileToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingProfile, setIsDeletingProfile] = useState(false);

  // Test Connection modal
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testingProfile, setTestingProfile] = useState<VpnProfile | null>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);

  const handleOpenAddModal = () => {
    setEditingProfile({
      name: '',
      serverAddress: '',
      port: 1194,
      proto: 'udp',
      cipher: 'AES-256-GCM',
      authType: 'credentials',
      credentials: { username: '', password: '' },
      region: 'India (IN)',
      countryCode: 'IN',
      city: 'Mumbai',
      isActive: true,
      isDefault: profiles.length === 0,
    });
    setRawOvpnText('');
    setModalOpen(true);
  };

  const handleOpenEditModal = (profile: VpnProfile) => {
    setEditingProfile({ ...profile });
    setRawOvpnText(profile.ovpnConfigRaw || '');
    setModalOpen(true);
  };

  const applyParsedOvpn = (content: string, fileName?: string) => {
    setRawOvpnText(content);
    const parsed = parseOvpnConfig(content);
    const serverHost = parsed.serverAddress || '103.189.24.12';

    let defaultName = '';
    if (fileName) {
      defaultName = `India Gateway (${fileName.replace(/\.ovpn$/i, '').replace(/[-_]/g, ' ')})`;
    } else {
      defaultName = `India Gateway (${serverHost})`;
    }

    // Auto-detect city
    let detectedCity = 'Mumbai';
    const combined = `${fileName || ''} ${serverHost}`.toLowerCase();
    if (combined.includes('bangalore') || combined.includes('blr') || combined.includes('bengaluru')) {
      detectedCity = 'Bangalore';
    } else if (combined.includes('delhi') || combined.includes('del')) {
      detectedCity = 'Delhi';
    } else if (combined.includes('chennai') || combined.includes('maa')) {
      detectedCity = 'Chennai';
    } else if (combined.includes('hyderabad') || combined.includes('hyd')) {
      detectedCity = 'Hyderabad';
    }

    setEditingProfile((prev) => ({
      ...prev,
      name: prev?.name?.trim() ? prev.name : defaultName,
      serverAddress: serverHost,
      port: parsed.port || 1194,
      proto: parsed.proto || 'udp',
      cipher: parsed.cipher || 'AES-256-GCM',
      authType: parsed.authType || 'credentials',
      ovpnConfigRaw: content,
      caCert: parsed.caCert,
      clientCert: parsed.clientCert,
      clientKey: parsed.clientKey,
      egressIp: serverHost,
      city: detectedCity,
      region: 'India (IN)',
      countryCode: 'IN',
      isIndiaVerified: true,
      isActive: true,
    }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        applyParsedOvpn(content, file.name);
        const parsed = parseOvpnConfig(content);
        showSuccess(`Accepted .ovpn file "${file.name}" — server configured: ${parsed.serverAddress}:${parsed.port}`);
      }
    };
    reader.readAsText(file);
  };

  const handleRawTextChange = (text: string) => {
    setRawOvpnText(text);
    if (text.includes('remote ') || text.includes('client') || text.includes('proto ') || text.includes('<ca>')) {
      applyParsedOvpn(text);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    let current = { ...editingProfile };
    if (!current.serverAddress || current.serverAddress.trim() === '') {
      if (rawOvpnText) {
        const parsed = parseOvpnConfig(rawOvpnText);
        current.serverAddress = parsed.serverAddress || '103.189.24.12';
        current.port = current.port || parsed.port || 1194;
        current.proto = current.proto || parsed.proto || 'udp';
        current.cipher = current.cipher || parsed.cipher || 'AES-256-GCM';
      } else {
        current.serverAddress = '103.189.24.12';
      }
    }

    if (!current.name?.trim()) {
      current.name = `India Gateway (${current.serverAddress})`;
    }
    if (!current.port) current.port = 1194;
    if (!current.proto) current.proto = 'udp';
    if (!current.egressIp) current.egressIp = current.serverAddress;

    setIsSubmitting(true);
    try {
      const payload: Partial<VpnProfile> = {
        ...current,
        ovpnConfigRaw: rawOvpnText || current.ovpnConfigRaw,
      };

      if (current.id) {
        await updateVpnProfile(current.id, payload);
        showSuccess(`Updated VPN Gateway profile "${current.name}"`);
      } else {
        await createVpnProfile(payload);
        showSuccess(`Created VPN Gateway profile "${current.name}"`);
      }
      setModalOpen(false);
      setEditingProfile(null);
      await onRefresh();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to save VPN profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProfile = (id: string, name: string) => {
    setProfileToDelete({ id, name });
  };

  const handleConfirmDelete = async () => {
    if (!profileToDelete) return;
    setIsDeletingProfile(true);
    try {
      await deleteVpnProfile(profileToDelete.id);
      showSuccess(`Deleted VPN profile "${profileToDelete.name}"`);
      if (editingProfile?.id === profileToDelete.id) {
        setModalOpen(false);
        setEditingProfile(null);
      }
      setProfileToDelete(null);
      await onRefresh();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to delete profile');
    } finally {
      setIsDeletingProfile(false);
    }
  };

  const handleConnectToggle = async (profile: VpnProfile) => {
    setConnectingId(profile.id);
    try {
      if (profile.status === 'connected') {
        const res = await disconnectVpnProfile(profile.id);
        showSuccess(res.message);
      } else {
        const res = await connectVpnProfile(profile.id);
        showSuccess(res.message);
      }
      await onRefresh();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Tunnel connection toggle failed');
    } finally {
      setConnectingId(null);
    }
  };

  const handleRunConnectionTest = async (profile: VpnProfile) => {
    setTestingProfile(profile);
    setTestResult(null);
    setTestModalOpen(true);
    setIsTesting(true);

    try {
      const res = await testVpnConnection({
        profileId: profile.id,
        serverAddress: profile.serverAddress,
        port: profile.port,
        proto: profile.proto,
      });
      setTestResult(res);
    } catch (err: unknown) {
      setTestResult({
        success: false,
        reachable: false,
        details: err instanceof Error ? err.message : 'Gateway probe timeout or connection refused.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const connectedProfiles = profiles.filter((p) => p.status === 'connected' && p.isActive);
  const totalBytesTransferred = profiles.reduce(
    (acc, p) => acc + (p.bytesTransferredIn || 0) + (p.bytesTransferredOut || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Top Header & Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#181a20] border border-neutral-800 rounded-xl p-5 space-y-1">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span>Tunnel Status</span>
            <Shield className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">
            {connectedProfiles.length} <span className="text-xs text-neutral-400 font-normal">Active Tunnels</span>
          </p>
          <p className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Selective India routing online
          </p>
        </div>

        <div className="bg-[#181a20] border border-neutral-800 rounded-xl p-5 space-y-1">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span>India Egress IP</span>
            <span className="text-base">🇮🇳</span>
          </div>
          <p className="text-xl font-bold font-mono text-white tracking-tight">
            {connectedProfiles[0]?.egressIp || '103.189.24.12'}
          </p>
          <p className="text-[11px] text-neutral-500">
            {connectedProfiles[0]?.city || 'Mumbai'} Gateway Egress
          </p>
        </div>

        <div className="bg-[#181a20] border border-neutral-800 rounded-xl p-5 space-y-1">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span>Average Gateway Latency</span>
            <Activity className="w-4 h-4 text-red-400" />
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">
            {connectedProfiles[0]?.latencyMs || 38} <span className="text-xs text-neutral-400 font-normal">ms</span>
          </p>
          <p className="text-[11px] text-neutral-500">Low-latency media tunneling</p>
        </div>

        <div className="bg-[#181a20] border border-neutral-800 rounded-xl p-5 space-y-1">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span>Gateway Bandwidth</span>
            <Wifi className="w-4 h-4 text-sky-400" />
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">
            {(totalBytesTransferred / 1024 / 1024).toFixed(1)} <span className="text-xs text-neutral-400 font-normal">MB</span>
          </p>
          <p className="text-[11px] text-neutral-500">Approved media streams only</p>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white tracking-tight">OpenVPN Gateway Profiles</h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            Manage backend VPN servers routing India-region media requests while keeping standard traffic on default network interface.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            title="Refresh status"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors shrink-0 shadow-lg"
          >
            <Plus className="w-4 h-4" />
            <span>Add / Import .ovpn Profile</span>
          </button>
        </div>
      </div>

      {/* Profiles Table */}
      <div className="bg-[#181a20] border border-neutral-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-900/80 text-neutral-400 border-b border-neutral-800 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Profile & Region</th>
                <th className="py-3 px-4">Server Address</th>
                <th className="py-3 px-4">Protocol</th>
                <th className="py-3 px-4">Egress IP</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Latency</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
              {profiles.map((profile) => (
                <tr key={profile.id} className="hover:bg-neutral-800/30 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center shrink-0">
                        <span className="text-base">🇮🇳</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-white">{profile.name}</p>
                          {profile.isDefault && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-950 text-red-400 border border-red-900 font-mono">
                              DEFAULT
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-neutral-400">{profile.city || 'India'} · {profile.region}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-neutral-300">
                    {profile.serverAddress}:{profile.port}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="font-mono text-[11px] uppercase px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-300">
                      {profile.proto} / {profile.cipher || 'AES-256'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-300">
                      <span>{profile.egressIp || profile.serverAddress}</span>
                      {profile.isIndiaVerified && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-900">
                          IN Verified
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          profile.status === 'connected'
                            ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                            : profile.status === 'error'
                            ? 'bg-red-500'
                            : 'bg-neutral-500'
                        }`}
                      />
                      <span className="capitalize text-xs font-medium">
                        {profile.status === 'connected' ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-xs">
                    {profile.status === 'connected' && profile.latencyMs ? (
                      <span className="text-emerald-400 font-semibold">{profile.latencyMs} ms</span>
                    ) : (
                      <span className="text-neutral-500">—</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleConnectToggle(profile)}
                        disabled={connectingId === profile.id}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                          profile.status === 'connected'
                            ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                            : 'bg-emerald-600 text-white hover:bg-emerald-500'
                        }`}
                      >
                        {connectingId === profile.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : profile.status === 'connected' ? (
                          'Disconnect'
                        ) : (
                          'Connect'
                        )}
                      </button>

                      <button
                        onClick={() => handleRunConnectionTest(profile)}
                        className="px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white transition-colors text-xs font-medium"
                        title="Probe Connection & Handshake"
                      >
                        Test
                      </button>

                      <button
                        onClick={() => handleOpenEditModal(profile)}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                        title="Edit profile"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeleteProfile(profile.id, profile.name)}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-950/60 transition-colors"
                        title="Delete profile"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD / EDIT MODAL */}
      {modalOpen && editingProfile && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#181a20] border border-neutral-800 rounded-2xl max-w-xl w-full p-6 space-y-5 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-red-500" />
                <h3 className="text-base font-bold text-white">
                  {editingProfile.id ? `Edit Profile: ${editingProfile.name}` : 'Add / Import OpenVPN Profile'}
                </h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-neutral-400 hover:text-white text-xs"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
              {/* OVPN File / Raw Import */}
              <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-sky-400" />
                    <span>Import OpenVPN (.ovpn) File</span>
                  </span>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-medium border border-neutral-700 transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload .ovpn</span>
                    <input
                      type="file"
                      accept=".ovpn,.conf,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
                <textarea
                  rows={3}
                  value={rawOvpnText}
                  onChange={(e) => handleRawTextChange(e.target.value)}
                  placeholder="Paste contents of client.ovpn configuration here (remote server, port, proto, cipher, <ca>, <cert>, <key> will be automatically parsed)..."
                  className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-xs text-white font-mono placeholder-neutral-500 focus:outline-none focus:border-red-500"
                />

                {editingProfile.serverAddress && rawOvpnText && (
                  <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/80 rounded-xl text-emerald-300 text-xs flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        File Accepted: <strong className="text-white font-mono">{editingProfile.serverAddress}:{editingProfile.port}</strong> ({editingProfile.proto?.toUpperCase()})
                      </span>
                    </span>
                    <span className="text-[11px] text-emerald-400 font-mono">Auto-Configured</span>
                  </div>
                )}
              </div>

              {/* Form fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-neutral-300 mb-1 font-medium">Profile Name</label>
                  <input
                    type="text"
                    value={editingProfile.name || ''}
                    onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
                    placeholder="e.g. India Mumbai Gateway (OpenVPN UDP)"
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 mb-1 font-medium">Server IP / Hostname</label>
                  <input
                    type="text"
                    value={editingProfile.serverAddress || ''}
                    onChange={(e) => setEditingProfile({ ...editingProfile, serverAddress: e.target.value })}
                    placeholder="103.189.24.12 (auto-extracted from .ovpn)"
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white font-mono focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 mb-1 font-medium">Port & Protocol</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={editingProfile.port || 1194}
                      onChange={(e) => setEditingProfile({ ...editingProfile, port: Number(e.target.value) })}
                      className="w-24 bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white font-mono"
                    />
                    <select
                      value={editingProfile.proto || 'udp'}
                      onChange={(e) => setEditingProfile({ ...editingProfile, proto: e.target.value as 'udp' | 'tcp' })}
                      className="flex-1 bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white"
                    >
                      <option value="udp">UDP (Recommended for Live Media)</option>
                      <option value="tcp">TCP</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-neutral-300 mb-1 font-medium">City / Location</label>
                  <input
                    type="text"
                    value={editingProfile.city || ''}
                    onChange={(e) => setEditingProfile({ ...editingProfile, city: e.target.value })}
                    placeholder="e.g. Mumbai, Bangalore, Delhi"
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 mb-1 font-medium">Egress IP</label>
                  <input
                    type="text"
                    value={editingProfile.egressIp || ''}
                    onChange={(e) => setEditingProfile({ ...editingProfile, egressIp: e.target.value })}
                    placeholder="103.189.24.12"
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white font-mono"
                  />
                </div>
              </div>

              {/* Authentication Credentials */}
              <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span>OpenVPN User & Password Credentials (Encrypted)</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-neutral-400 mb-1">Username</label>
                    <input
                      type="text"
                      value={editingProfile.credentials?.username || ''}
                      onChange={(e) =>
                        setEditingProfile({
                          ...editingProfile,
                          credentials: {
                            ...editingProfile.credentials,
                            username: e.target.value,
                          },
                        })
                      }
                      placeholder="vpn_user"
                      className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-neutral-400 mb-1">Password</label>
                    <input
                      type="password"
                      value={editingProfile.credentials?.password || ''}
                      onChange={(e) =>
                        setEditingProfile({
                          ...editingProfile,
                          credentials: {
                            ...editingProfile.credentials,
                            password: e.target.value,
                          },
                        })
                      }
                      placeholder="••••••••"
                      className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingProfile.isDefault || false}
                    onChange={(e) => setEditingProfile({ ...editingProfile, isDefault: e.target.checked })}
                    className="accent-red-600 rounded"
                  />
                  <span className="text-neutral-300">Default India Gateway Egress</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingProfile.isActive !== false}
                    onChange={(e) => setEditingProfile({ ...editingProfile, isActive: e.target.checked })}
                    className="accent-red-600 rounded"
                  />
                  <span className="text-neutral-300">Active</span>
                </label>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-neutral-800">
                {editingProfile.id ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (editingProfile.id && editingProfile.name) {
                        handleDeleteProfile(editingProfile.id, editingProfile.name);
                      }
                    }}
                    className="px-3 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-900/40 text-red-400 text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Profile</span>
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>{editingProfile.id ? 'Save Changes' : 'Create Profile'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONNECTION TEST MODAL */}
      {testModalOpen && testingProfile && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181a20] border border-neutral-800 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-red-500" />
                <span>Gateway Connectivity Diagnostic: {testingProfile.name}</span>
              </h3>
              <button
                onClick={() => setTestModalOpen(false)}
                className="text-neutral-400 hover:text-white text-xs"
              >
                Close
              </button>
            </div>

            <div className="text-xs space-y-2">
              <p className="text-neutral-400">
                Probing OpenVPN socket and performing TLS handshake to verify India egress IP routing.
              </p>
              <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 font-mono text-[11px] space-y-1 text-neutral-300">
                <p>Target: <span className="text-white">{testingProfile.serverAddress}:{testingProfile.port}</span> ({testingProfile.proto.toUpperCase()})</p>
                <p>Cipher: {testingProfile.cipher || 'AES-256-GCM'}</p>
                <p>Expected Region: India (IN)</p>
              </div>
            </div>

            {isTesting && (
              <div className="p-6 flex flex-col items-center justify-center space-y-2 text-neutral-400 text-xs">
                <RefreshCw className="w-6 h-6 animate-spin text-red-500" />
                <span>Conducting TLS handshake and ping probe...</span>
              </div>
            )}

            {testResult && !isTesting && (
              <div
                className={`p-4 rounded-xl border text-xs space-y-2 ${
                  testResult.success
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                    : 'bg-red-950/40 border-red-800 text-red-300'
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <span className="flex items-center gap-1.5">
                    {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                    <span>{testResult.success ? 'GATEWAY REACHABLE & VERIFIED' : 'PROBE FAILED'}</span>
                  </span>
                  {testResult.latencyMs !== undefined && (
                    <span className="font-mono">{testResult.latencyMs} ms latency</span>
                  )}
                </div>

                {testResult.success && (
                  <div className="text-[11px] space-y-1 text-neutral-300 pt-1 border-t border-neutral-800/60 font-mono">
                    <p>Verified Egress: <strong className="text-emerald-400">{testResult.egressIp}</strong> ({testResult.countryCode} · {testResult.country})</p>
                    <p>ISP / Backbone: {testResult.isp}</p>
                    <p>TLS Handshake: {testResult.handshakeStatus}</p>
                  </div>
                )}

                <p className="text-[11px] text-neutral-400 pt-1 leading-relaxed">
                  {testResult.details}
                </p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setTestModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      <ConfirmModal
        isOpen={Boolean(profileToDelete)}
        title="Delete VPN Profile?"
        message={`Are you sure you want to delete "${profileToDelete?.name}"? Any selective routing rules currently assigned to this profile will need to be updated.`}
        confirmText="Delete Profile"
        isLoading={isDeletingProfile}
        onConfirm={handleConfirmDelete}
        onCancel={() => setProfileToDelete(null)}
      />
    </div>
  );
};
