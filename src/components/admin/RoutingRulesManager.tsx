import React, { useState } from 'react';
import { RoutingRule, VpnProfile, VpnRouteTestResult, PatternType, RouteAction } from '../../types/index.ts';
import {
  createRoutingRule,
  updateRoutingRule,
  deleteRoutingRule,
  testUrlRouting,
  applyRoutingPresets,
} from '../../services/api.ts';
import {
  GitFork,
  Plus,
  Trash2,
  Edit2,
  ArrowUp,
  ArrowDown,
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Sparkles,
  Search,
  Sliders,
  ShieldAlert,
  ArrowRight,
  Terminal,
} from 'lucide-react';
import { ConfirmModal } from '../common/ConfirmModal.tsx';

interface RoutingRulesManagerProps {
  rules: RoutingRule[];
  profiles: VpnProfile[];
  onRefresh: () => Promise<void>;
  showSuccess: (msg: string) => void;
  showError: (msg: string) => void;
}

export const RoutingRulesManager: React.FC<RoutingRulesManagerProps> = ({
  rules,
  profiles,
  onRefresh,
  showSuccess,
  showError,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Partial<RoutingRule> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isApplyingPresets, setIsApplyingPresets] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingRule, setIsDeletingRule] = useState(false);

  // URL Simulator & Tester state
  const [testUrlInput, setTestUrlInput] = useState('https://live.hotstar.com/sports/cricket/master.m3u8');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<VpnRouteTestResult | null>(null);

  const handleOpenAddModal = () => {
    setEditingRule({
      name: '',
      domainPattern: '',
      patternType: 'wildcard',
      vpnProfileId: profiles[0]?.id || 'vpn-profile-mumbai-express',
      vpnProfileName: profiles[0]?.name || 'India Mumbai Gateway (OpenVPN UDP)',
      priority: rules.length + 1,
      isActive: true,
      action: 'route_vpn',
      description: '',
    });
    setModalOpen(true);
  };

  const handleOpenEditModal = (rule: RoutingRule) => {
    setEditingRule({ ...rule });
    setModalOpen(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule?.name || !editingRule?.domainPattern) {
      showError('Rule name and domain pattern are required');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingRule.id) {
        await updateRoutingRule(editingRule.id, editingRule);
        showSuccess(`Updated routing rule "${editingRule.name}"`);
      } else {
        await createRoutingRule(editingRule);
        showSuccess(`Created routing rule "${editingRule.name}"`);
      }
      setModalOpen(false);
      setEditingRule(null);
      await onRefresh();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to save rule');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRule = (id: string, name: string) => {
    setRuleToDelete({ id, name });
  };

  const handleConfirmDelete = async () => {
    if (!ruleToDelete) return;
    setIsDeletingRule(true);
    try {
      await deleteRoutingRule(ruleToDelete.id);
      showSuccess(`Deleted routing rule "${ruleToDelete.name}"`);
      if (editingRule?.id === ruleToDelete.id) {
        setModalOpen(false);
        setEditingRule(null);
      }
      setRuleToDelete(null);
      await onRefresh();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to delete rule');
    } finally {
      setIsDeletingRule(false);
    }
  };

  const handlePriorityShift = async (rule: RoutingRule, delta: number) => {
    const sorted = [...rules].sort((a, b) => a.priority - b.priority);
    const currentIndex = sorted.findIndex((r) => r.id === rule.id);
    const targetIndex = currentIndex + delta;

    if (targetIndex < 0 || targetIndex >= sorted.length) return;

    const targetRule = sorted[targetIndex];
    try {
      await updateRoutingRule(rule.id, { priority: targetRule.priority });
      await updateRoutingRule(targetRule.id, { priority: rule.priority });
      await onRefresh();
    } catch {
      showError('Failed to adjust rule priority');
    }
  };

  const handleToggleRuleActive = async (rule: RoutingRule) => {
    try {
      await updateRoutingRule(rule.id, { isActive: !rule.isActive });
      showSuccess(`Rule "${rule.name}" ${!rule.isActive ? 'enabled' : 'disabled'}`);
      await onRefresh();
    } catch {
      showError('Failed to toggle rule');
    }
  };

  const handleApplyPresets = async () => {
    setIsApplyingPresets(true);
    try {
      const res = await applyRoutingPresets();
      showSuccess(res.message);
      await onRefresh();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to apply presets');
    } finally {
      setIsApplyingPresets(false);
    }
  };

  const handleRunUrlSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testUrlInput) return;

    setIsSimulating(true);
    setSimResult(null);
    try {
      const res = await testUrlRouting(testUrlInput.trim());
      setSimResult(res);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Route test failed');
    } finally {
      setIsSimulating(false);
    }
  };

  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

  return (
    <div className="space-y-8">
      {/* Overview Banner */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#181a20] border border-neutral-800">
        <div>
          <div className="flex items-center gap-2">
            <GitFork className="w-5 h-5 text-red-500" />
            <h3 className="text-sm font-bold text-white tracking-tight">
              Domain-Based Selective Routing Engine
            </h3>
          </div>
          <p className="text-xs text-neutral-400 mt-1 max-w-2xl leading-relaxed">
            Traffic matching these domain patterns will egress strictly through the assigned India VPN gateway. All normal requests (auth, APIs, non-Indian channels) continue using the default host network.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleApplyPresets}
            disabled={isApplyingPresets}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs font-semibold transition-colors disabled:opacity-50"
            title="Auto-load Indian streaming network rules"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isApplyingPresets ? 'animate-spin text-red-400' : 'text-amber-400'}`} />
            <span>Load Indian Presets</span>
          </button>

          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors shadow-lg"
          >
            <Plus className="w-4 h-4" />
            <span>Add Routing Rule</span>
          </button>
        </div>
      </div>

      {/* Rules Table */}
      <div className="bg-[#181a20] border border-neutral-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-900/80 text-neutral-400 border-b border-neutral-800 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4 w-16">Priority</th>
                <th className="py-3 px-4">Rule Name</th>
                <th className="py-3 px-4">Domain Pattern</th>
                <th className="py-3 px-4">Pattern Type</th>
                <th className="py-3 px-4">Assigned VPN Gateway</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Matches</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
              {sortedRules.map((rule, idx) => (
                <tr key={rule.id} className="hover:bg-neutral-800/30 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-neutral-400">
                    #{rule.priority}
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-semibold text-white">{rule.name}</p>
                    {rule.description && (
                      <p className="text-[11px] text-neutral-500 truncate max-w-xs">{rule.description}</p>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-red-400 font-semibold">
                    {rule.domainPattern}
                  </td>
                  <td className="py-3 px-4 uppercase text-[10px] font-mono text-neutral-400">
                    <span className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800">
                      {rule.patternType}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-white flex items-center gap-1.5">
                      <span>🇮🇳</span>
                      <span>{rule.vpnProfileName || 'India Mumbai Gateway'}</span>
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase font-bold ${
                        rule.action === 'route_vpn'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : rule.action === 'block'
                          ? 'bg-red-950 text-red-400 border border-red-800'
                          : 'bg-neutral-800 text-neutral-300'
                      }`}
                    >
                      {rule.action.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-neutral-400 tabular-nums">
                    {(rule.matchCount || 0).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleToggleRuleActive(rule)}
                        className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                          rule.isActive ? 'bg-emerald-950 text-emerald-300' : 'bg-neutral-800 text-neutral-500'
                        }`}
                      >
                        {rule.isActive ? 'Active' : 'Disabled'}
                      </button>

                      <button
                        disabled={idx === 0}
                        onClick={() => handlePriorityShift(rule, -1)}
                        className="p-1 rounded text-neutral-400 hover:text-white disabled:opacity-30"
                        title="Move Up in Priority"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>

                      <button
                        disabled={idx === sortedRules.length - 1}
                        onClick={() => handlePriorityShift(rule, 1)}
                        className="p-1 rounded text-neutral-400 hover:text-white disabled:opacity-30"
                        title="Move Down in Priority"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleOpenEditModal(rule)}
                        className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                        title="Edit Rule"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeleteRule(rule.id, rule.name)}
                        className="p-1.5 rounded hover:bg-red-950/60 text-neutral-400 hover:text-red-400 transition-colors"
                        title="Delete Rule"
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

      {/* URL ROUTE SIMULATOR & TESTER */}
      <div className="bg-[#181a20] border border-neutral-800 rounded-2xl p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Search className="w-4 h-4 text-sky-400" />
            <span>URL Route Simulator & India Gateway Probe</span>
          </h3>
          <p className="text-xs text-neutral-400 mt-1">
            Test whether a specific Indian broadcast URL or manifest will route through the India VPN gateway, match active rules, and pass security validation.
          </p>
        </div>

        <form onSubmit={handleRunUrlSimulation} className="flex flex-col sm:flex-row gap-3">
          <input
            type="url"
            required
            value={testUrlInput}
            onChange={(e) => setTestUrlInput(e.target.value)}
            placeholder="https://live.hotstar.com/sports/event.m3u8"
            className="flex-1 bg-[#101114] border border-neutral-800 rounded-xl px-4 py-2.5 text-xs text-white font-mono placeholder-neutral-500 focus:outline-none focus:border-red-500"
          />
          <button
            type="submit"
            disabled={isSimulating || !testUrlInput}
            className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors shrink-0"
          >
            {isSimulating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            <span>Simulate & Probe Route</span>
          </button>
        </form>

        {/* Quick Test Links */}
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
          <span className="font-medium text-neutral-500">Test Presets:</span>
          <button
            type="button"
            onClick={() => setTestUrlInput('https://live.hotstar.com/sports/cricket/master.m3u8')}
            className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 hover:text-white"
          >
            Hotstar Live Feed
          </button>
          <button
            type="button"
            onClick={() => setTestUrlInput('https://live.sonyliv.com/cricket/manifest.m3u8')}
            className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 hover:text-white"
          >
            SonyLIV Sports
          </button>
          <button
            type="button"
            onClick={() => setTestUrlInput('https://live.jiocinema.com/sports/ipl-stream.m3u8')}
            className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 hover:text-white"
          >
            JioCinema CDN
          </button>
          <button
            type="button"
            onClick={() => setTestUrlInput('http://192.168.1.1/internal-camera.m3u8')}
            className="px-2 py-0.5 rounded bg-red-950/40 text-red-300 border border-red-900 hover:text-red-200"
          >
            Private Subnet (SSRF Test)
          </button>
        </div>

        {/* Diagnostic Simulator Output */}
        {simResult && (
          <div className="mt-4 p-5 rounded-xl bg-[#12141a] border border-neutral-800 space-y-4 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                {simResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                )}
                <div>
                  <h4 className="font-bold text-white text-sm">
                    {simResult.routedVia === 'vpn'
                      ? 'Routed Through India VPN Gateway'
                      : simResult.routedVia === 'blocked'
                      ? 'Target Blocked by Security Policy'
                      : 'Bypassed to Default Host Interface'}
                  </h4>
                  <p className="text-[11px] text-neutral-400 font-mono mt-0.5">{simResult.url}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-300">
                  HTTP {simResult.statusCode}
                </span>
                <span className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-300">
                  {simResult.latencyMs}ms
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-neutral-900/60 border border-neutral-800 space-y-1">
                <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Matched Rule</span>
                <p className="font-semibold text-white truncate">
                  {simResult.matchedRule ? simResult.matchedRule.name : 'No Rule Matched (Default Direct)'}
                </p>
                {simResult.matchedRule && (
                  <p className="text-[11px] font-mono text-red-400">
                    Pattern: {simResult.matchedRule.domainPattern}
                  </p>
                )}
              </div>

              <div className="p-3 rounded-lg bg-neutral-900/60 border border-neutral-800 space-y-1">
                <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Egress Routing Path</span>
                <p className="font-semibold text-white">
                  {simResult.routedVia === 'vpn' ? `🇮🇳 ${simResult.vpnProfileName}` : 'Default Host Interface'}
                </p>
                <p className="text-[11px] font-mono text-neutral-400">
                  Egress IP: {simResult.egressIp || 'Direct'}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-neutral-900/60 border border-neutral-800 space-y-1">
                <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Format & Verification</span>
                <p className="font-semibold text-white truncate">
                  {simResult.contentType || 'application/vnd.apple.mpegurl'}
                </p>
                <p className="text-[11px] text-emerald-400">
                  {simResult.isIndiaEgress ? '✓ India Region Header Verified' : 'Standard Network Path'}
                </p>
              </div>
            </div>

            {/* Diagnostic Logs Breakdown */}
            <div className="space-y-1.5 pt-2">
              <span className="text-[11px] font-semibold text-neutral-400 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-neutral-500" />
                <span>Diagnostic Routing Trace</span>
              </span>
              <div className="p-3 rounded-lg bg-black/60 border border-neutral-800/80 font-mono text-[11px] text-neutral-300 space-y-1 max-h-40 overflow-y-auto">
                {simResult.diagnosticLogs?.map((log, i) => (
                  <p key={i} className="leading-relaxed">
                    {log}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ADD / EDIT RULE MODAL */}
      {modalOpen && editingRule && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181a20] border border-neutral-800 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <GitFork className="w-4 h-4 text-red-500" />
                <span>{editingRule.id ? 'Edit Routing Rule' : 'New Domain Routing Rule'}</span>
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-neutral-400 hover:text-white text-xs"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleSaveRule} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-neutral-300 mb-1 font-medium">Rule Name</label>
                <input
                  type="text"
                  required
                  value={editingRule.name || ''}
                  onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                  placeholder="e.g. Disney+ Hotstar India Relay"
                  className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-300 mb-1 font-medium">Domain Pattern</label>
                  <input
                    type="text"
                    required
                    value={editingRule.domainPattern || ''}
                    onChange={(e) => setEditingRule({ ...editingRule, domainPattern: e.target.value })}
                    placeholder="*.hotstar.com"
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 mb-1 font-medium">Pattern Type</label>
                  <select
                    value={editingRule.patternType || 'wildcard'}
                    onChange={(e) =>
                      setEditingRule({ ...editingRule, patternType: e.target.value as PatternType })
                    }
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white"
                  >
                    <option value="wildcard">Wildcard (*.example.com)</option>
                    <option value="exact">Exact (stream.example.com)</option>
                    <option value="regex">RegEx Pattern</option>
                    <option value="cidr">CIDR Subnet (IP Range)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-neutral-300 mb-1 font-medium">Assigned India VPN Profile</label>
                <select
                  value={editingRule.vpnProfileId || profiles[0]?.id || ''}
                  onChange={(e) => {
                    const prof = profiles.find((p) => p.id === e.target.value);
                    setEditingRule({
                      ...editingRule,
                      vpnProfileId: e.target.value,
                      vpnProfileName: prof ? prof.name : undefined,
                    });
                  }}
                  className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.city || 'India'}, {p.egressIp})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-300 mb-1 font-medium">Action</label>
                  <select
                    value={editingRule.action || 'route_vpn'}
                    onChange={(e) =>
                      setEditingRule({ ...editingRule, action: e.target.value as RouteAction })
                    }
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white"
                  >
                    <option value="route_vpn">Route through India VPN</option>
                    <option value="bypass">Bypass VPN (Default Interface)</option>
                    <option value="block">Block Access (Forbidden)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-300 mb-1 font-medium">Priority (1 = Highest)</label>
                  <input
                    type="number"
                    min="1"
                    value={editingRule.priority || 1}
                    onChange={(e) => setEditingRule({ ...editingRule, priority: Number(e.target.value) })}
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-neutral-300 mb-1 font-medium">Description</label>
                <input
                  type="text"
                  value={editingRule.description || ''}
                  onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
                  placeholder="Notes on where this rule applies..."
                  className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="ruleActiveCheck"
                  checked={editingRule.isActive !== false}
                  onChange={(e) => setEditingRule({ ...editingRule, isActive: e.target.checked })}
                  className="accent-red-600 rounded"
                />
                <label htmlFor="ruleActiveCheck" className="text-neutral-300 cursor-pointer">
                  Rule is active and evaluated by media gateway
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold flex items-center gap-2"
                >
                  {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingRule.id ? 'Save Changes' : 'Create Rule'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      <ConfirmModal
        isOpen={Boolean(ruleToDelete)}
        title="Delete Routing Rule?"
        message={`Are you sure you want to delete routing rule "${ruleToDelete?.name}"? Traffic matching this domain pattern will revert to default routing policy.`}
        confirmText="Delete Rule"
        isLoading={isDeletingRule}
        onConfirm={handleConfirmDelete}
        onCancel={() => setRuleToDelete(null)}
      />
    </div>
  );
};
