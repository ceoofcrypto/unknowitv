import React, { useState } from 'react';
import { EventMediaSource, FeaturedEvent, VpnProfile, StreamType } from '../../types/index.ts';
import {
  createEventMediaSource,
  updateEventMediaSource,
  deleteEventMediaSource,
  testEventMediaHealth,
  switchEventMediaStream,
} from '../../services/api.ts';
import {
  Radio,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Shield,
  Layers,
  ArrowRight,
  Globe,
} from 'lucide-react';
import { ConfirmModal } from '../common/ConfirmModal.tsx';
import { createEvent } from '../../services/api.ts';
import { detectStreamType, isWebLinkStream } from '../../utils/streaming.ts';

interface EventMediaManagerProps {
  mediaSources: EventMediaSource[];
  events: FeaturedEvent[];
  profiles: VpnProfile[];
  onRefresh: () => Promise<void>;
  showSuccess: (msg: string) => void;
  showError: (msg: string) => void;
}

export const EventMediaManager: React.FC<EventMediaManagerProps> = ({
  mediaSources,
  events,
  profiles,
  onRefresh,
  showSuccess,
  showError,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<Partial<EventMediaSource> | null>(null);
  const [backupInputs, setBackupInputs] = useState<string[]>(['']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [sourceToDelete, setSourceToDelete] = useState<{ id: string; title: string } | null>(null);
  const [isDeletingSource, setIsDeletingSource] = useState(false);

  // Quick custom event creation from media manager
  const [isCreatingNewEvent, setIsCreatingNewEvent] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventChannelName, setNewEventChannelName] = useState('Custom Stream');

  const handleOpenAddModal = () => {
    const firstEvent = events[0];
    setIsCreatingNewEvent(events.length === 0);
    setNewEventTitle('');
    setNewEventChannelName('Custom Stream');
    setEditingSource({
      eventId: firstEvent ? firstEvent.id : '__new__',
      eventTitle: firstEvent ? firstEvent.title : '',
      title: 'Primary Broadcast Stream (HD)',
      primaryStreamUrl: '',
      streamType: 'hls',
      vpnProfileId: profiles[0]?.id || null,
      forceVpnRoute: true,
      backupStreamUrls: [],
      playbackSettings: {
        lowLatency: true,
        bufferTime: 4,
        maxResolution: '1080p',
      },
      isLive: true,
    });
    setBackupInputs(['']);
    setModalOpen(true);
  };

  const handleOpenEditModal = (source: EventMediaSource) => {
    setIsCreatingNewEvent(false);
    setEditingSource({ ...source });
    setBackupInputs(source.backupStreamUrls.length > 0 ? [...source.backupStreamUrls] : ['']);
    setModalOpen(true);
  };

  const handleAddBackupField = () => {
    setBackupInputs([...backupInputs, '']);
  };

  const handleRemoveBackupField = (index: number) => {
    setBackupInputs(backupInputs.filter((_, i) => i !== index));
  };

  const handleBackupChange = (index: number, val: string) => {
    const updated = [...backupInputs];
    updated[index] = val;
    setBackupInputs(updated);
  };

  const handlePrimaryUrlChange = (val: string) => {
    const autoType = detectStreamType(val);
    setEditingSource((prev) => (prev ? { ...prev, primaryStreamUrl: val, streamType: autoType } : null));
  };

  const handleSaveSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSource?.primaryStreamUrl) {
      showError('Primary stream URL or web link is required');
      return;
    }

    setIsSubmitting(true);
    try {
      let resolvedEventId = editingSource.eventId;
      let resolvedEventTitle = editingSource.eventTitle;

      // If user chose to create a new custom event on the fly
      if (isCreatingNewEvent || resolvedEventId === '__new__') {
        const titleToUse = newEventTitle.trim() || 'Custom Live Event';
        const createdEvent = await createEvent({
          title: titleToUse,
          subtitle: 'Live Custom Broadcast Feed',
          description: 'Custom sports and streaming broadcast.',
          thumbnailUrl: '/images/event_nsl_stadium.jpg',
          bannerUrl: '/images/event_nsl_stadium.jpg',
          channelId: 'custom-stream',
          channelName: newEventChannelName.trim() || 'Custom Stream',
          streamUrlOverride: editingSource.primaryStreamUrl.trim(),
          status: 'LIVE',
          startTime: new Date().toISOString(),
          priority: 1,
          isActive: true,
          isPublished: true,
          buttonLabel: 'Watch Live Now',
        });
        resolvedEventId = createdEvent.id;
        resolvedEventTitle = createdEvent.title;
      }

      if (!resolvedEventId) {
        showError('Please select or create an event to link this media source');
        setIsSubmitting(false);
        return;
      }

      const cleanBackups = backupInputs.map((u) => u.trim()).filter(Boolean);
      const linkedEvent = events.find((ev) => ev.id === resolvedEventId);
      const payload: Partial<EventMediaSource> = {
        ...editingSource,
        eventId: resolvedEventId,
        eventTitle: linkedEvent ? linkedEvent.title : resolvedEventTitle,
        backupStreamUrls: cleanBackups,
      };

      if (editingSource.id) {
        await updateEventMediaSource(editingSource.id, payload);
        showSuccess(`Updated event media source "${editingSource.title}"`);
      } else {
        await createEventMediaSource(payload);
        showSuccess(`Created event media source "${editingSource.title}"`);
      }
      setModalOpen(false);
      setEditingSource(null);
      await onRefresh();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to save event media source');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSource = (id: string, title: string) => {
    setSourceToDelete({ id, title });
  };

  const handleConfirmDelete = async () => {
    if (!sourceToDelete) return;
    setIsDeletingSource(true);
    try {
      await deleteEventMediaSource(sourceToDelete.id);
      showSuccess(`Deleted media source "${sourceToDelete.title}"`);
      setSourceToDelete(null);
      await onRefresh();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to delete media source');
    } finally {
      setIsDeletingSource(false);
    }
  };

  const handleTestHealth = async (id: string) => {
    setTestingId(id);
    try {
      const res = await testEventMediaHealth(id);
      showSuccess(
        `Tested "${res.media.title}": Status is ${res.healthStatus.toUpperCase()} (Primary: ${
          res.primaryStream.reachable ? 'Online' : 'Offline'
        }, Latency: ${res.latencyMs}ms)`
      );
      await onRefresh();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Stream health test failed');
    } finally {
      setTestingId(null);
    }
  };

  const handleSwitchStream = async (id: string) => {
    setSwitchingId(id);
    try {
      const res = await switchEventMediaStream(id);
      showSuccess(res.message);
      await onRefresh();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to switch stream');
    } finally {
      setSwitchingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#181a20] border border-neutral-800">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-red-500" />
            <h3 className="text-sm font-bold text-white tracking-tight">Main Event Media Manager</h3>
          </div>
          <p className="text-xs text-neutral-400 mt-1 max-w-2xl leading-relaxed">
            Register media streams for featured headline events. Configure primary and multi-source backup failovers, assign India VPN routing gateways, and manage live playback health.
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors shrink-0 shadow-lg"
        >
          <Plus className="w-4 h-4" />
          <span>Register Event Media Source</span>
        </button>
      </div>

      {/* Media Sources Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {mediaSources.map((source) => {
          const linkedEvent = events.find((e) => e.id === source.eventId);
          const vpnProfile = profiles.find((p) => p.id === source.vpnProfileId);
          const activeIndex = source.activeStreamIndex || 0;
          const currentUrl =
            activeIndex === 0 ? source.primaryStreamUrl : source.backupStreamUrls[activeIndex - 1] || source.primaryStreamUrl;

          return (
            <div
              key={source.id}
              className="p-5 rounded-2xl bg-[#181a20] border border-neutral-800 space-y-4 relative group"
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded border ${
                        source.healthStatus === 'healthy'
                          ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                          : source.healthStatus === 'warning'
                          ? 'bg-amber-950/80 text-amber-400 border-amber-800'
                          : source.healthStatus === 'offline'
                          ? 'bg-red-950/80 text-red-400 border-red-800'
                          : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                      }`}
                    >
                      ● {source.healthStatus.toUpperCase()}
                    </span>

                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-300">
                      {source.streamType}
                    </span>

                    {source.vpnProfileId && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-red-950/60 text-red-300 border border-red-900 font-medium flex items-center gap-1">
                        <span>🇮🇳</span>
                        <span>VPN Routed</span>
                      </span>
                    )}
                  </div>

                  <h4 className="text-base font-bold text-white tracking-tight">{source.title}</h4>
                  <p className="text-xs text-red-400 font-medium">Event: {linkedEvent?.title || source.eventTitle}</p>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleTestHealth(source.id)}
                    disabled={testingId === source.id}
                    className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white transition-colors"
                    title="Probe stream health"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testingId === source.id ? 'animate-spin text-red-400' : ''}`} />
                  </button>

                  <button
                    onClick={() => handleOpenEditModal(source)}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                    title="Edit source"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDeleteSource(source.id, source.title)}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-950/60 transition-colors"
                    title="Delete source"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Active Stream Feed Box */}
              <div className="p-3.5 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-2 text-xs">
                <div className="flex items-center justify-between text-neutral-400 text-[11px]">
                  <span>Active Live Feed ({activeIndex === 0 ? 'Primary Source' : `Backup #${activeIndex}`})</span>
                  {source.backupStreamUrls.length > 0 && (
                    <button
                      onClick={() => handleSwitchStream(source.id)}
                      disabled={switchingId === source.id}
                      className="text-red-400 hover:text-red-300 font-semibold flex items-center gap-1"
                    >
                      <RefreshCw className={`w-3 h-3 ${switchingId === source.id ? 'animate-spin' : ''}`} />
                      <span>Failover Switch</span>
                    </button>
                  )}
                </div>

                <p className="font-mono text-white text-[11px] truncate bg-black/40 p-2 rounded border border-neutral-800/80">
                  {currentUrl}
                </p>

                {source.backupStreamUrls.length > 0 && (
                  <div className="text-[11px] text-neutral-400 flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-neutral-500" />
                    <span>{source.backupStreamUrls.length} backup failover source(s) configured</span>
                  </div>
                )}
              </div>

              {/* Gateway & Failover details */}
              <div className="pt-2 border-t border-neutral-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-400">
                <span className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Gateway: <strong className="text-neutral-200">{vpnProfile ? vpnProfile.name : 'Default Host Interface'}</strong></span>
                </span>

                {source.latencyMs && (
                  <span className="font-mono text-emerald-400">{source.latencyMs}ms latency</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ADD / EDIT MODAL */}
      {modalOpen && editingSource && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#181a20] border border-neutral-800 rounded-2xl max-w-xl w-full p-6 space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-red-500" />
                <span>{editingSource.id ? 'Edit Event Media Source' : 'Register Main Event Media Source'}</span>
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-neutral-400 hover:text-white text-xs"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleSaveSource} className="space-y-4 text-xs">
              <div>
                <label className="block text-neutral-300 mb-1 font-medium">Link to Featured Event</label>
                <select
                  required
                  value={editingSource.eventId || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__new__') {
                      setIsCreatingNewEvent(true);
                      setEditingSource({
                        ...editingSource,
                        eventId: '__new__',
                        eventTitle: newEventTitle || 'Custom Live Event',
                      });
                    } else {
                      setIsCreatingNewEvent(false);
                      const ev = events.find((item) => item.id === val);
                      setEditingSource({
                        ...editingSource,
                        eventId: val,
                        eventTitle: ev ? ev.title : '',
                      });
                    }
                  }}
                  className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white"
                >
                  <option value="">-- Select Event --</option>
                  <option value="__new__">✨ + Create New Custom Event...</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title} (Priority #{ev.priority})
                    </option>
                  ))}
                </select>
              </div>

              {/* If creating a new custom event */}
              {(isCreatingNewEvent || editingSource.eventId === '__new__') && (
                <div className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
                  <div className="flex items-center gap-1.5 text-red-400 font-semibold text-xs">
                    <Radio className="w-3.5 h-3.5" />
                    <span>New Custom Event Details</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-neutral-400 mb-1">Event Title</label>
                      <input
                        type="text"
                        required
                        value={newEventTitle}
                        onChange={(e) => setNewEventTitle(e.target.value)}
                        placeholder="e.g. FanCode Live Sports Match"
                        className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-neutral-400 mb-1">Channel / Source Label</label>
                      <input
                        type="text"
                        value={newEventChannelName}
                        onChange={(e) => setNewEventChannelName(e.target.value)}
                        placeholder="e.g. FanCode HD, Live Stream"
                        className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-neutral-300 mb-1 font-medium">Media Source Title</label>
                <input
                  type="text"
                  required
                  value={editingSource.title || ''}
                  onChange={(e) => setEditingSource({ ...editingSource, title: e.target.value })}
                  placeholder="e.g. Official 4K Broadcast Feed (India Relay)"
                  className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-neutral-300 font-medium">
                    Stream URL or Web Link (HLS, DASH, Direct MP4, or Web Player Page)
                  </label>
                  {isWebLinkStream(editingSource.primaryStreamUrl || '') && (
                    <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
                      <Globe className="w-3 h-3" />
                      <span>Web Player Detected</span>
                    </span>
                  )}
                </div>
                <input
                  type="url"
                  required
                  value={editingSource.primaryStreamUrl || ''}
                  onChange={(e) => handlePrimaryUrlChange(e.target.value)}
                  placeholder="e.g. https://sportlink-fancode10.pages.dev/ios?id=4250374 or https://.../master.m3u8"
                  className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-300 mb-1 font-medium">Stream Format</label>
                  <select
                    value={editingSource.streamType || 'hls'}
                    onChange={(e) =>
                      setEditingSource({ ...editingSource, streamType: e.target.value as StreamType })
                    }
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white"
                  >
                    <option value="hls">HLS Stream (.m3u8)</option>
                    <option value="iframe">Web Stream Link / Embed Player (e.g. Pages.dev, FanCode, HTML)</option>
                    <option value="dash">MPEG-DASH (.mpd)</option>
                    <option value="direct">Direct MP4 / WebM</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-300 mb-1 font-medium">India VPN Gateway Profile</label>
                  <select
                    value={editingSource.vpnProfileId || ''}
                    onChange={(e) =>
                      setEditingSource({
                        ...editingSource,
                        vpnProfileId: e.target.value || null,
                      })
                    }
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white"
                  >
                    <option value="">Default Host Network (No VPN)</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        🇮🇳 {p.name} ({p.city || 'India'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Backup Stream Failover URLs */}
              <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-sky-400" />
                    <span>Backup Failover Media URLs</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleAddBackupField}
                    className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Backup</span>
                  </button>
                </div>

                {backupInputs.map((val, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="url"
                      value={val}
                      onChange={(e) => handleBackupChange(idx, e.target.value)}
                      placeholder={`Backup stream #${idx + 1} URL`}
                      className="flex-1 bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white font-mono text-xs"
                    />
                    {backupInputs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveBackupField(idx)}
                        className="p-2 text-neutral-400 hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Playback Settings */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-300 mb-1">Max Resolution</label>
                  <select
                    value={editingSource.playbackSettings?.maxResolution || '1080p'}
                    onChange={(e) =>
                      setEditingSource({
                        ...editingSource,
                        playbackSettings: {
                          ...editingSource.playbackSettings,
                          maxResolution: e.target.value,
                        },
                      })
                    }
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                  >
                    <option value="1080p">1080p Full HD</option>
                    <option value="720p">720p HD</option>
                    <option value="4k">4K Ultra HD</option>
                  </select>
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingSource.playbackSettings?.lowLatency !== false}
                      onChange={(e) =>
                        setEditingSource({
                          ...editingSource,
                          playbackSettings: {
                            ...editingSource.playbackSettings,
                            lowLatency: e.target.checked,
                          },
                        })
                      }
                      className="accent-red-600 rounded"
                    />
                    <span className="text-neutral-300">Low Latency Mode</span>
                  </label>
                </div>
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
                  <span>{editingSource.id ? 'Save Changes' : 'Register Source'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      <ConfirmModal
        isOpen={Boolean(sourceToDelete)}
        title="Delete Event Media Source?"
        message={`Are you sure you want to delete media source "${sourceToDelete?.title}"? Event playback will fall back to channel default streams.`}
        confirmText="Delete Media Source"
        isLoading={isDeletingSource}
        onConfirm={handleConfirmDelete}
        onCancel={() => setSourceToDelete(null)}
      />
    </div>
  );
};
