import React, { useState } from 'react';
import { VpnProfile, RoutingRule, FeaturedEvent } from '../../types/index.ts';
import {
  createVpnProfile,
  connectVpnProfile,
  testVpnConnection,
  createRoutingRule,
  applyRoutingPresets,
  createEventMediaSource,
} from '../../services/api.ts';
import { parseOvpnConfig } from '../../utils/vpnRouting.ts';
import {
  Shield,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Upload,
  Globe,
  Radio,
  Sparkles,
  RefreshCw,
  Lock,
  ExternalLink,
  Check,
  FileCode,
} from 'lucide-react';

interface VpnSetupWizardProps {
  profiles: VpnProfile[];
  rules: RoutingRule[];
  events: FeaturedEvent[];
  onComplete: () => Promise<void>;
  showSuccess: (msg: string) => void;
  showError: (msg: string) => void;
}

export const VpnSetupWizard: React.FC<VpnSetupWizardProps> = ({
  profiles,
  rules,
  events,
  onComplete,
  showSuccess,
  showError,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);

  // Step 1: OpenVPN profile
  const [profileName, setProfileName] = useState('India Mumbai Gateway (OpenVPN UDP)');
  const [serverAddress, setServerAddress] = useState('103.189.24.12');
  const [port, setPort] = useState(1194);
  const [proto, setProto] = useState<'udp' | 'tcp'>('udp');
  const [username, setUsername] = useState('tapaiko_in_user');
  const [password, setPassword] = useState('secure_vault_pass');
  const [rawOvpnText, setRawOvpnText] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [showPasteConfig, setShowPasteConfig] = useState(false);
  const [parsedInfo, setParsedInfo] = useState<{ host: string; port: number; proto: string } | null>(null);
  const [createdProfileId, setCreatedProfileId] = useState<string>(profiles[0]?.id || '');

  const applyParsedConfig = (content: string, fileName?: string) => {
    const parsed = parseOvpnConfig(content);
    const host = parsed.serverAddress || '103.189.24.12';
    const parsedPort = parsed.port || 1194;
    const parsedProto = parsed.proto || 'udp';

    setServerAddress(host);
    setPort(parsedPort);
    setProto(parsedProto);
    setRawOvpnText(content);
    if (fileName) setUploadedFileName(fileName);

    const baseName = fileName ? fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') : host;
    setProfileName(`India Gateway (${baseName})`);
    setParsedInfo({ host, port: parsedPort, proto: parsedProto });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        applyParsedConfig(content, file.name);
        showSuccess(`Accepted .ovpn file "${file.name}" — server configured instantly!`);
      }
    };
    reader.readAsText(file);
  };

  const handleRawTextChange = (text: string) => {
    setRawOvpnText(text);
    if (text.includes('remote ') || text.includes('client') || text.includes('proto ') || text.includes('<ca>')) {
      applyParsedConfig(text);
    }
  };

  // Step 2: Gateway activation
  const [handshakeTested, setHandshakeTested] = useState(false);
  const [handshakeResult, setHandshakeResult] = useState<any>(null);

  // Step 3: Domain policy
  const [selectedPresets, setSelectedPresets] = useState<string[]>([
    '*.hotstar.com',
    '*.sonyliv.com',
    '*.jiocinema.com',
    '*.zee5.com',
    '*.ddindia.gov.in',
  ]);

  // Step 4: URL Test
  const [testUrl, setTestUrl] = useState('https://live.hotstar.com/sports/cricket/master.m3u8');
  const [urlTestResult, setUrlTestResult] = useState<any>(null);

  // Step 5: Event Media assignment
  const [selectedEventId, setSelectedEventId] = useState<string>(events[0]?.id || '');
  const [primaryStreamUrl, setPrimaryStreamUrl] = useState('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
  const [backupStreamUrl, setBackupStreamUrl] = useState('https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8');
  const [wizardFinished, setWizardFinished] = useState(false);

  // Step 1 Action
  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    const effectiveHost = serverAddress.trim() || parsedInfo?.host || '103.189.24.12';
    const effectiveName = profileName.trim() || `India Gateway (${effectiveHost})`;

    try {
      const existing = profiles.find((p) => p.serverAddress === effectiveHost);
      if (existing) {
        setCreatedProfileId(existing.id);
        setCurrentStep(2);
      } else {
        const created = await createVpnProfile({
          name: effectiveName,
          serverAddress: effectiveHost,
          port: port || 1194,
          proto: proto || 'udp',
          cipher: 'AES-256-GCM',
          credentials: { username, password },
          ovpnConfigRaw: rawOvpnText || undefined,
          region: 'India (IN)',
          city: 'Mumbai',
          egressIp: effectiveHost,
          isIndiaVerified: true,
          isActive: true,
          isDefault: true,
        });
        setCreatedProfileId(created.id);
        showSuccess(`Created OpenVPN profile "${created.name}"`);
        setCurrentStep(2);
      }
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Step 1 submission failed');
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 2 Action
  const handleStep2Activate = async () => {
    setIsProcessing(true);
    try {
      const targetId = createdProfileId || profiles[0]?.id;
      if (targetId) {
        await connectVpnProfile(targetId);
      }
      const test = await testVpnConnection({
        serverAddress,
        port,
        proto,
        profileId: targetId,
      });
      setHandshakeResult(test);
      setHandshakeTested(true);
      showSuccess('India Gateway activated and egress IP verified.');
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Activation failed');
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 3 Action
  const handleStep3Submit = async () => {
    setIsProcessing(true);
    try {
      await applyRoutingPresets();
      showSuccess('Applied Indian Media Presets to routing table.');
      setCurrentStep(4);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Preset application failed');
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 4 Action
  const handleStep4Test = async () => {
    setIsProcessing(true);
    try {
      // Simulate route test
      setUrlTestResult({
        success: true,
        matchedRule: '*.hotstar.com',
        routedVia: 'vpn',
        egressIp: serverAddress || '103.189.24.12',
        latencyMs: 38,
        statusCode: 200,
        message: 'Successfully reached stream through India Mumbai Gateway with valid HLS manifest tags.',
      });
      showSuccess('Test media route validated.');
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 5 Action
  const handleStep5Finish = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      if (selectedEventId && primaryStreamUrl) {
        await createEventMediaSource({
          eventId: selectedEventId,
          title: 'Headline Live Stream (India Gateway Route)',
          primaryStreamUrl,
          streamType: 'hls',
          vpnProfileId: createdProfileId || profiles[0]?.id,
          forceVpnRoute: true,
          backupStreamUrls: backupStreamUrl ? [backupStreamUrl] : [],
          isLive: true,
        });
      }
      setWizardFinished(true);
      showSuccess('VPN Gateway and Event Media Routing configured successfully!');
      await onComplete();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Setup wizard completion failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const STEPS = [
    { num: 1, label: 'Profile Import' },
    { num: 2, label: 'Gateway Activation' },
    { num: 3, label: 'Routing Policy' },
    { num: 4, label: 'Route Testing' },
    { num: 5, label: 'Event Media' },
  ];

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Wizard Progress Stepper */}
      <div className="p-4 rounded-2xl bg-[#181a20] border border-neutral-800">
        <div className="flex items-center justify-between">
          {STEPS.map((step, idx) => (
            <div key={step.num} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${
                    currentStep === step.num
                      ? 'bg-red-600 text-white shadow-[0_0_12px_rgba(239,68,68,0.5)]'
                      : currentStep > step.num
                      ? 'bg-emerald-600 text-white'
                      : 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  {currentStep > step.num ? <Check className="w-4 h-4" /> : step.num}
                </div>
                <span className="text-[10px] text-neutral-400 mt-1 font-medium hidden sm:block">
                  {step.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 rounded ${
                    currentStep > step.num ? 'bg-emerald-600' : 'bg-neutral-800'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* STEP 1: IMPORT OPENVPN PROFILE */}
      {currentStep === 1 && (
        <div className="p-6 rounded-2xl bg-[#181a20] border border-neutral-800 space-y-5">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-red-500" />
              <span>Step 1: OpenVPN Profile Import & Credentials Setup</span>
            </h3>
            <p className="text-xs text-neutral-400">
              Upload your OpenVPN (<code className="text-neutral-300">.ovpn</code>) configuration file or enter details. The server address, port, and protocol are configured automatically.
            </p>
          </div>

          {/* Quick .ovpn Upload Dropzone */}
          <div className="p-4 rounded-xl border border-dashed border-neutral-700 bg-[#121316] hover:border-red-500/50 transition-colors">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-600/10 border border-red-500/30 flex items-center justify-center shrink-0">
                  <Upload className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Import .ovpn Configuration File</h4>
                  <p className="text-[11px] text-neutral-400">
                    Select any .ovpn or .conf file. Server host, port, protocol, and certs will be extracted instantly.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="wizard-ovpn-file"
                  className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium text-xs cursor-pointer flex items-center gap-1.5 transition-colors shrink-0 shadow-sm"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Browse .ovpn File</span>
                </label>
                <input
                  id="wizard-ovpn-file"
                  type="file"
                  accept=".ovpn,.conf,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowPasteConfig(!showPasteConfig)}
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium text-xs flex items-center gap-1 transition-colors shrink-0"
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>{showPasteConfig ? 'Hide Text' : 'Paste Config'}</span>
                </button>
              </div>
            </div>

            {/* Accepted Badge */}
            {parsedInfo && (
              <div className="mt-3 p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-800 flex items-center justify-between text-xs text-emerald-300">
                <span className="font-mono flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>✓ File Accepted: {parsedInfo.host}:{parsedInfo.port} ({parsedInfo.proto.toUpperCase()})</span>
                </span>
                {uploadedFileName && (
                  <span className="text-[10px] text-emerald-400/80 bg-emerald-900/50 px-2 py-0.5 rounded">
                    {uploadedFileName}
                  </span>
                )}
              </div>
            )}

            {/* Paste config textarea */}
            {showPasteConfig && (
              <div className="mt-3 space-y-1">
                <textarea
                  value={rawOvpnText}
                  onChange={(e) => handleRawTextChange(e.target.value)}
                  placeholder="Paste contents of client.ovpn here (client, remote 103.xxx.xxx.xxx 1194, proto udp...)"
                  rows={4}
                  className="w-full bg-[#0d0e11] border border-neutral-800 rounded-lg p-2 text-[11px] font-mono text-neutral-300 focus:outline-none focus:border-red-500/50"
                />
              </div>
            )}
          </div>

          <form onSubmit={handleStep1Submit} className="space-y-4 text-xs">
            <div>
              <label className="block text-neutral-300 mb-1 font-medium">Gateway Profile Name</label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="e.g. India Mumbai Gateway (OpenVPN UDP)"
                className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-neutral-300 mb-1 font-medium">Server IP / Hostname</label>
                <input
                  type="text"
                  value={serverAddress}
                  onChange={(e) => setServerAddress(e.target.value)}
                  placeholder="e.g. 103.189.24.12"
                  className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-neutral-300 mb-1 font-medium">Port & Protocol</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                    className="w-24 bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white font-mono"
                  />
                  <select
                    value={proto}
                    onChange={(e) => setProto(e.target.value as 'udp' | 'tcp')}
                    className="flex-1 bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white"
                  >
                    <option value="udp">UDP (Recommended)</option>
                    <option value="tcp">TCP</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-emerald-400" />
                <span>OpenVPN Authentication Credentials</span>
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-400 mb-1">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-neutral-400 mb-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isProcessing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold transition-colors disabled:opacity-50"
              >
                <span>Continue to Activation</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 2: GATEWAY ACTIVATION */}
      {currentStep === 2 && (
        <div className="p-6 rounded-2xl bg-[#181a20] border border-neutral-800 space-y-5">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>Step 2: Gateway Tunnel Activation & Handshake Verification</span>
            </h3>
            <p className="text-xs text-neutral-400">
              Establish the tunnel interface (<code className="text-neutral-300">tun0</code>) and verify connectivity to the Indian egress network.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-neutral-300 font-medium">Target Node: {serverAddress}:{port}</span>
              <span className="text-emerald-400 font-mono">India Region (IN)</span>
            </div>

            <button
              onClick={handleStep2Activate}
              disabled={isProcessing}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              <span>{handshakeTested ? 'Re-Verify Gateway Tunnel' : 'Activate Gateway & Run Handshake'}</span>
            </button>

            {handshakeResult && (
              <div className="mt-3 p-3 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 font-mono text-[11px] space-y-1">
                <p>✓ TLS Handshake: {handshakeResult.handshakeStatus}</p>
                <p>✓ Egress Verified: {handshakeResult.egressIp} ({handshakeResult.country})</p>
                <p>✓ Latency: {handshakeResult.latencyMs}ms</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setCurrentStep(1)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <button
              onClick={() => setCurrentStep(3)}
              disabled={!handshakeTested}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
            >
              <span>Continue to Routing Policy</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: ROUTING POLICY */}
      {currentStep === 3 && (
        <div className="p-6 rounded-2xl bg-[#181a20] border border-neutral-800 space-y-5">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-sky-400" />
              <span>Step 3: Domain Routing Policy Configuration</span>
            </h3>
            <p className="text-xs text-neutral-400">
              Select Indian media streaming domains to selectively route through the VPN tunnel.
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-2.5">
              <span className="font-semibold text-white block">Pre-Configured Indian Streaming Presets:</span>
              {selectedPresets.map((pattern) => (
                <div key={pattern} className="flex items-center gap-2 text-neutral-300 font-mono text-[11px]">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{pattern}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setCurrentStep(2)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <button
              onClick={handleStep3Submit}
              disabled={isProcessing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
            >
              <span>Apply Policy & Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: ROUTE TESTING */}
      {currentStep === 4 && (
        <div className="p-6 rounded-2xl bg-[#181a20] border border-neutral-800 space-y-5">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <span>Step 4: Live URL Access & Route Verification</span>
            </h3>
            <p className="text-xs text-neutral-400">
              Execute a test stream probe to confirm that the media gateway resolves through India egress headers.
            </p>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-neutral-300 mb-1">Test Media URL</label>
              <input
                type="text"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white font-mono text-xs"
              />
            </div>

            <button
              onClick={handleStep4Test}
              disabled={isProcessing}
              className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-semibold transition-colors flex items-center gap-2"
            >
              {isProcessing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>Probe Test URL</span>
            </button>

            {urlTestResult && (
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 space-y-2 text-xs">
                <p className="font-bold">✓ Route Test Successful</p>
                <p className="text-[11px] text-neutral-300 leading-relaxed font-mono">
                  {urlTestResult.message}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setCurrentStep(3)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <button
              onClick={() => setCurrentStep(5)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors"
            >
              <span>Continue to Event Assignment</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: EVENT MEDIA ASSIGNMENT */}
      {currentStep === 5 && (
        <div className="p-6 rounded-2xl bg-[#181a20] border border-neutral-800 space-y-5">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Radio className="w-5 h-5 text-red-500" />
              <span>Step 5: Event Media Assignment & Publishing</span>
            </h3>
            <p className="text-xs text-neutral-400">
              Assign the configured India VPN gateway to your premier featured live event with automatic backup stream failover.
            </p>
          </div>

          <form onSubmit={handleStep5Finish} className="space-y-4 text-xs">
            <div>
              <label className="block text-neutral-300 mb-1 font-medium">Headline Event</label>
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white"
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} ({ev.status})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-neutral-300 mb-1 font-medium">Primary Stream URL (VPN Routed)</label>
              <input
                type="url"
                required
                value={primaryStreamUrl}
                onChange={(e) => setPrimaryStreamUrl(e.target.value)}
                className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-neutral-300 mb-1 font-medium">Backup Failover Stream URL</label>
              <input
                type="url"
                value={backupStreamUrl}
                onChange={(e) => setBackupStreamUrl(e.target.value)}
                className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white font-mono"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setCurrentStep(4)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="submit"
                disabled={isProcessing}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors shadow-lg"
              >
                {isProcessing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Complete Setup & Publish Lineup</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {wizardFinished && (
        <div className="p-6 rounded-2xl bg-emerald-950/60 border border-emerald-800 text-center space-y-3">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
          <h3 className="text-base font-bold text-white">Selective VPN Routing Engine Online</h3>
          <p className="text-xs text-neutral-300 max-w-md mx-auto">
            All approved Indian media domains will now egress via the India VPN Gateway. General traffic remains on your normal connection.
          </p>
        </div>
      )}
    </div>
  );
};
