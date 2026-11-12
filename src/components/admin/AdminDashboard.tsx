import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Channel,
  FeaturedEvent,
  Category,
  Announcement,
  AnnouncementType,
  AnnouncementDisplayLocation,
  AnnouncementActionType,
  AppSettings,
  AdminUser,
  VpnProfile,
  RoutingRule,
  EventMediaSource,
  StreamType,
} from '../../types/index.ts';
import {
  createChannel,
  updateChannel,
  deleteChannel,
  createEvent,
  updateEvent,
  deleteEvent,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  updateSettings,
  testStreamAvailability,
  resetDemoData,
  syncIptvChannels,
  fetchVpnProfiles,
  fetchRoutingRules,
  fetchEventMediaSources,
  createEventMediaSource,
  updateEventMediaSource,
  detectMediaFromWebUrl,
} from '../../services/api.ts';
import { VpnGatewayManager } from './VpnGatewayManager.tsx';
import { RoutingRulesManager } from './RoutingRulesManager.tsx';
import { EventMediaManager } from './EventMediaManager.tsx';
import { VpnSetupWizard } from './VpnSetupWizard.tsx';
import { ConfirmModal } from '../common/ConfirmModal.tsx';
import { detectStreamType, isWebLinkStream } from '../../utils/streaming.ts';
import {
  Tv,
  Calendar,
  Layers,
  Megaphone,
  Settings,
  LogOut,
  Plus,
  Trash2,
  Edit2,
  Check,
  AlertTriangle,
  Play,
  Activity,
  Radio,
  ExternalLink,
  RefreshCw,
  Search,
  Shield,
  GitFork,
  Sparkles,
  Wand2,
  Globe,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';

interface AdminDashboardProps {
  user: AdminUser;
  channels: Channel[];
  events: FeaturedEvent[];
  categories: Category[];
  announcements: Announcement[];
  settings: AppSettings;
  onRefreshData: () => Promise<void>;
  onLogout: () => void;
  onViewSite: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  user,
  channels,
  events,
  categories,
  announcements,
  settings,
  onRefreshData,
  onLogout,
  onViewSite,
}) => {
  const [activeTab, setActiveTab] = useState<
    | 'overview'
    | 'channels'
    | 'events'
    | 'vpn-gateway'
    | 'routing-rules'
    | 'event-media'
    | 'vpn-wizard'
    | 'categories'
    | 'announcements'
    | 'tester'
    | 'settings'
  >('overview');

  // VPN Gateway & Selective Routing State
  const [vpnProfiles, setVpnProfiles] = useState<VpnProfile[]>([]);
  const [routingRules, setRoutingRules] = useState<RoutingRule[]>([]);
  const [eventMediaSources, setEventMediaSources] = useState<EventMediaSource[]>([]);

  const loadVpnData = useCallback(async () => {
    try {
      const [profs, rls, media] = await Promise.all([
        fetchVpnProfiles().catch(() => []),
        fetchRoutingRules().catch(() => []),
        fetchEventMediaSources().catch(() => []),
      ]);
      setVpnProfiles(profs);
      setRoutingRules(rls);
      setEventMediaSources(media);
    } catch {
      // Ignore background fetch failure
    }
  }, []);

  useEffect(() => {
    loadVpnData();
  }, [loadVpnData]);

  const handleRefreshAll = async () => {
    await Promise.all([onRefreshData(), loadVpnData()]);
  };
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Partial<Channel> | null>(null);

  // Event Edit/New State
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Partial<FeaturedEvent> | null>(null);
  const [eventStreamUrl, setEventStreamUrl] = useState('');
  const [eventStreamType, setEventStreamType] = useState<StreamType>('hls');
  const [eventVpnProfileId, setEventVpnProfileId] = useState('');
  const [eventForceVpn, setEventForceVpn] = useState(true);
  const [eventBackupUrls, setEventBackupUrls] = useState<string[]>(['']);
  const [eventCustomChannel, setEventCustomChannel] = useState('');
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false);
  const [isDetectingEventMedia, setIsDetectingEventMedia] = useState(false);
  const [detectedMediaNotice, setDetectedMediaNotice] = useState<string | null>(null);

  // In-App Confirmation Modals (Replacing blocked window.confirm)
  const [eventToDelete, setEventToDelete] = useState<{ id: string; title: string } | null>(null);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [channelToDelete, setChannelToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingChannel, setIsDeletingChannel] = useState(false);
  const [confirmResetDemoOpen, setConfirmResetDemoOpen] = useState(false);
  const [isResettingDemo, setIsResettingDemo] = useState(false);

  // Category Edit/New State
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);

  // Navigation Tabs Ref
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  // Announcement Edit/New State
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Partial<Announcement> | null>(null);
  const [announcementToDelete, setAnnouncementToDelete] = useState<{ id: string; title: string } | null>(null);
  const [isDeletingAnnouncement, setIsDeletingAnnouncement] = useState(false);
  const [isSubmittingAnnouncement, setIsSubmittingAnnouncement] = useState(false);

  const scrollTabs = (direction: 'left' | 'right') => {
    if (tabsContainerRef.current) {
      const offset = direction === 'left' ? -260 : 260;
      tabsContainerRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  // Stream tester state
  const [testUrl, setTestUrl] = useState('https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8');
  const [testResult, setTestResult] = useState<{
    reachable: boolean;
    statusCode: number;
    contentType: string;
    corsHeader: string;
    hasHlsManifestHeader?: boolean;
    details: string;
  } | null>(null);
  const [isTestingStream, setIsTestingStream] = useState(false);

  // Search in admin channels
  const [channelSearch, setChannelSearch] = useState('');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 3000);
  };

  const showError = (msg: string) => {
    setActionError(msg);
    setTimeout(() => setActionError(null), 4000);
  };

  // Channel Form Actions
  const handleSaveChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChannel?.name || !editingChannel?.streamUrl || !editingChannel?.categoryId) {
      showError('Please fill in required fields: Name, Stream URL, and Category');
      return;
    }

    try {
      if (editingChannel.id) {
        await updateChannel(editingChannel.id, editingChannel);
        showSuccess(`Updated channel "${editingChannel.name}"`);
      } else {
        await createChannel(editingChannel);
        showSuccess(`Created channel "${editingChannel.name}"`);
      }
      setChannelModalOpen(false);
      setEditingChannel(null);
      await onRefreshData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to save channel');
    }
  };

  const handleDeleteChannel = (id: string, name: string) => {
    setChannelToDelete({ id, name });
  };

  const handleConfirmDeleteChannel = async () => {
    if (!channelToDelete) return;
    setIsDeletingChannel(true);
    try {
      await deleteChannel(channelToDelete.id);
      showSuccess(`Deleted channel "${channelToDelete.name}"`);
      setChannelToDelete(null);
      await handleRefreshAll();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to delete channel');
    } finally {
      setIsDeletingChannel(false);
    }
  };

  // Event Form Actions & Custom Event Logic
  const handleOpenAddCustomEvent = () => {
    setEditingEvent({
      title: '',
      nepaliTitle: '',
      subtitle: '',
      description: '',
      thumbnailUrl: '/images/event_nsl_stadium.jpg',
      bannerUrl: '/images/event_nsl_stadium.jpg',
      channelId: channels[0]?.id || 'custom-stream',
      channelName: channels[0]?.name || 'Live Sports Feed',
      streamUrlOverride: '',
      status: 'LIVE',
      startTime: new Date().toISOString(),
      priority: 1,
      isActive: true,
      isPublished: true,
      buttonLabel: 'Watch Live Now',
    });
    setEventStreamUrl('');
    setEventStreamType('hls');
    setEventVpnProfileId(vpnProfiles[0]?.id || '');
    setEventForceVpn(true);
    setEventBackupUrls(['']);
    setEventCustomChannel('Live Sports Feed');
    setDetectedMediaNotice(null);
    setEventModalOpen(true);
  };

  const handleOpenEditEvent = (ev: FeaturedEvent) => {
    setEditingEvent({ ...ev });
    const linkedMedia = eventMediaSources.find((m) => m.eventId === ev.id) || ev.mediaSource;
    const initialUrl = ev.streamUrlOverride || linkedMedia?.primaryStreamUrl || '';
    setEventStreamUrl(initialUrl);
    setEventStreamType(linkedMedia?.streamType || detectStreamType(initialUrl));
    setEventVpnProfileId(linkedMedia?.vpnProfileId || vpnProfiles[0]?.id || '');
    setEventForceVpn(linkedMedia?.forceVpnRoute ?? true);
    setEventBackupUrls(linkedMedia?.backupStreamUrls?.length ? [...linkedMedia.backupStreamUrls] : ['']);
    setEventCustomChannel(ev.channelName || '');
    setDetectedMediaNotice(null);
    setEventModalOpen(true);
  };

  const handleDetectEventMedia = async () => {
    const url = eventStreamUrl.trim();
    if (!url) {
      showError('Please enter a stream or web link first');
      return;
    }
    setIsDetectingEventMedia(true);
    setDetectedMediaNotice(null);
    try {
      const result = await detectMediaFromWebUrl(url);
      if (result && result.detected) {
        if (result.streamType) {
          setEventStreamType(result.streamType as StreamType);
        }
        if (result.streamUrl && result.streamUrl !== url) {
          setEventStreamUrl(result.streamUrl);
        }
        setDetectedMediaNotice(result.details || `Successfully detected ${result.streamType.toUpperCase()} stream!`);
        showSuccess(result.details || 'Detected video stream successfully');
      } else {
        const fallback = detectStreamType(url);
        setEventStreamType(fallback);
        setDetectedMediaNotice(`Detected stream format: ${fallback.toUpperCase()}`);
      }
    } catch {
      const fallback = detectStreamType(url);
      setEventStreamType(fallback);
    } finally {
      setIsDetectingEventMedia(false);
    }
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent?.title?.trim()) {
      showError('Please enter an Event Title');
      return;
    }

    setIsSubmittingEvent(true);
    try {
      const selectedChannel = channels.find((c) => c.id === editingEvent.channelId);
      const resolvedChannelName = selectedChannel
        ? selectedChannel.name
        : eventCustomChannel.trim() || editingEvent.channelName || 'Live Broadcast';
      const resolvedChannelId = selectedChannel
        ? selectedChannel.id
        : editingEvent.channelId || 'custom-stream';

      const cleanStreamUrl = eventStreamUrl.trim();
      const cleanBackups = eventBackupUrls.map((u) => u.trim()).filter(Boolean);
      const detectedFormat = eventStreamType || detectStreamType(cleanStreamUrl);

      const eventToSave: Partial<FeaturedEvent> = {
        ...editingEvent,
        title: editingEvent.title.trim(),
        channelId: resolvedChannelId,
        channelName: resolvedChannelName,
        streamUrlOverride: cleanStreamUrl || null,
        thumbnailUrl: editingEvent.thumbnailUrl || editingEvent.bannerUrl || '/images/event_nsl_stadium.jpg',
        bannerUrl: editingEvent.bannerUrl || editingEvent.thumbnailUrl || '/images/event_nsl_stadium.jpg',
      };

      let savedEvent: FeaturedEvent;
      if (editingEvent.id) {
        savedEvent = await updateEvent(editingEvent.id, eventToSave);
        showSuccess(`Updated event "${savedEvent.title}"`);
      } else {
        savedEvent = await createEvent(eventToSave);
        showSuccess(`Created custom event "${savedEvent.title}"`);
      }

      // Automatically sync / create associated EventMediaSource for VPN routing and failover
      if (cleanStreamUrl) {
        const existingMedia = eventMediaSources.find((m) => m.eventId === savedEvent.id);
        const mediaPayload: Partial<EventMediaSource> = {
          eventId: savedEvent.id,
          eventTitle: savedEvent.title,
          title: `${savedEvent.title} (Broadcast Feed)`,
          primaryStreamUrl: cleanStreamUrl,
          streamType: detectedFormat,
          vpnProfileId: eventVpnProfileId || null,
          forceVpnRoute: eventForceVpn,
          backupStreamUrls: cleanBackups,
          playbackSettings: {
            lowLatency: true,
            bufferTime: 4,
            maxResolution: '1080p',
          },
          isLive: savedEvent.status === 'LIVE',
        };

        if (existingMedia) {
          await updateEventMediaSource(existingMedia.id, mediaPayload);
        } else {
          await createEventMediaSource(mediaPayload);
        }
      }

      setEventModalOpen(false);
      setEditingEvent(null);
      await handleRefreshAll();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to save event');
    } finally {
      setIsSubmittingEvent(false);
    }
  };

  const handleDeleteEvent = (id: string, title: string) => {
    setEventToDelete({ id, title });
  };

  const handleConfirmDeleteEvent = async () => {
    if (!eventToDelete) return;
    setIsDeletingEvent(true);
    try {
      await deleteEvent(eventToDelete.id);
      showSuccess(`Deleted event "${eventToDelete.title}"`);
      setEventToDelete(null);
      await handleRefreshAll();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to delete event');
    } finally {
      setIsDeletingEvent(false);
    }
  };

  // Settings Actions
  const handleToggleMaintenance = async () => {
    try {
      const updated = await updateSettings({ maintenanceMode: !settings.maintenanceMode });
      showSuccess(`Maintenance mode ${updated.maintenanceMode ? 'enabled' : 'disabled'}`);
      await onRefreshData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to update settings');
    }
  };

  const handleToggleShowFeatured = async () => {
    try {
      const updated = await updateSettings({ showFeaturedEvent: !settings.showFeaturedEvent });
      showSuccess(`Featured event visibility ${updated.showFeaturedEvent ? 'enabled' : 'hidden'}`);
      await onRefreshData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to update settings');
    }
  };

  const handleRunStreamTest = async () => {
    if (!testUrl) return;
    setIsTestingStream(true);
    setTestResult(null);
    try {
      const res = await testStreamAvailability(testUrl);
      setTestResult(res);
    } catch (err: unknown) {
      setTestResult({
        reachable: false,
        statusCode: 0,
        contentType: 'error',
        corsHeader: 'none',
        details: err instanceof Error ? err.message : 'Probe failure',
      });
    } finally {
      setIsTestingStream(false);
    }
  };

  const [isSyncingIptv, setIsSyncingIptv] = useState(false);

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAnnouncement || !editingAnnouncement.title || !editingAnnouncement.message) {
      showError('Please provide both title and message for the announcement.');
      return;
    }

    setIsSubmittingAnnouncement(true);
    try {
      if (editingAnnouncement.id) {
        await updateAnnouncement(editingAnnouncement.id, editingAnnouncement);
        showSuccess(`Updated announcement "${editingAnnouncement.title}"`);
      } else {
        await createAnnouncement(editingAnnouncement);
        showSuccess(`Created announcement "${editingAnnouncement.title}"`);
      }
      setAnnouncementModalOpen(false);
      setEditingAnnouncement(null);
      await onRefreshData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to save announcement');
    } finally {
      setIsSubmittingAnnouncement(false);
    }
  };

  const handleConfirmDeleteAnnouncement = async () => {
    if (!announcementToDelete) return;
    setIsDeletingAnnouncement(true);
    try {
      await deleteAnnouncement(announcementToDelete.id);
      showSuccess(`Deleted announcement "${announcementToDelete.title}"`);
      setAnnouncementToDelete(null);
      await onRefreshData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to delete announcement');
    } finally {
      setIsDeletingAnnouncement(false);
    }
  };

  const handleSyncIptv = async () => {
    setIsSyncingIptv(true);
    try {
      const res = await syncIptvChannels();
      showSuccess(`GitHub IPTV sync complete: ${res.newlyAdded} new streams added (${res.totalChannels} total).`);
      await onRefreshData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'IPTV Sync failed');
    } finally {
      setIsSyncingIptv(false);
    }
  };

  const handleResetDemo = () => {
    setConfirmResetDemoOpen(true);
  };

  const handleConfirmResetDemo = async () => {
    setIsResettingDemo(true);
    try {
      await resetDemoData();
      showSuccess('Reset to default demonstration data.');
      setConfirmResetDemoOpen(false);
      await handleRefreshAll();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to reset data');
    } finally {
      setIsResettingDemo(false);
    }
  };

  // Derived Metrics
  const activeChannelsCount = channels.filter((c) => c.isActive && c.isPublished).length;
  const inactiveChannelsCount = channels.filter((c) => !c.isActive || !c.isPublished).length;
  const publishedEventsCount = events.filter((e) => e.isActive && e.isPublished).length;
  const upcomingEventsCount = events.filter((e) => e.status === 'UPCOMING' && e.isActive && e.isPublished).length;
  const liveEventsCount = events.filter((e) => e.status === 'LIVE' && e.isActive && e.isPublished).length;
  const priorityOneEvent = events
    .filter((e) => e.isActive && e.isPublished)
    .sort((a, b) => a.priority - b.priority)[0];

  const [channelPage, setChannelPage] = useState(1);
  const CHANNELS_PER_PAGE = 30;

  const filteredChannels = channels.filter((c) => {
    if (!channelSearch) return true;
    const q = channelSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.categoryName.toLowerCase().includes(q) ||
      (c.country && c.country.toLowerCase().includes(q))
    );
  });

  const totalChannelPages = Math.ceil(filteredChannels.length / CHANNELS_PER_PAGE) || 1;
  const pagedChannels = filteredChannels.slice(
    (channelPage - 1) * CHANNELS_PER_PAGE,
    channelPage * CHANNELS_PER_PAGE
  );

  return (
    <div className="space-y-8">
      {/* Admin Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-neutral-800">
        <div>
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="तपाईंको TV"
              className="w-8 h-8 rounded-lg object-cover ring-1 ring-white/10 shadow-sm"
            />
            <h1 className="text-xl font-bold text-white tracking-tight">तपाईंको TV — Control Room</h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800">
              Admin Session
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* VPN Gateway Status Indicator */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                vpnProfiles.some((p) => p.status === 'connected')
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : 'bg-neutral-500'
              }`}
            />
            {vpnProfiles.some((p) => p.status === 'connected') ? (
              <span className="text-[11px] text-neutral-300">
                VPN Gateway:{' '}
                <strong className="text-white">
                  {vpnProfiles.find((p) => p.status === 'connected')?.name} (
                  {vpnProfiles.find((p) => p.status === 'connected')?.egressIp ||
                    vpnProfiles.find((p) => p.status === 'connected')?.serverAddress})
                </strong>
              </span>
            ) : (
              <span className="text-[11px] text-neutral-400">
                Network: <strong className="text-neutral-200">Direct (No VPN Active)</strong>
              </span>
            )}
          </div>

          <button
            onClick={onViewSite}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-medium transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>View Public Site</span>
          </button>

          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-red-950/60 text-neutral-400 hover:text-red-400 border border-neutral-800 text-xs font-medium transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-red-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Navigation Tabs with Visible Scrollbar & Smooth Arrows */}
      <div className="relative group/nav border-b border-neutral-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => scrollTabs('left')}
            aria-label="Scroll tabs left"
            className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-white transition-colors shrink-0 shadow-sm cursor-pointer"
            title="Scroll tabs left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div
            ref={tabsContainerRef}
            className="flex-1 flex items-center gap-2 overflow-x-auto pb-2.5 pt-0.5 scroll-smooth [scrollbar-width:thin] [scrollbar-color:#52525b_#18181b] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-neutral-900/80 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-neutral-600 hover:[&::-webkit-scrollbar-thumb]:bg-red-500 [&::-webkit-scrollbar-thumb]:rounded-full"
          >
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === 'overview' ? 'bg-neutral-200 text-neutral-900 font-bold' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('vpn-gateway')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === 'vpn-gateway' ? 'bg-neutral-200 text-neutral-900 font-bold' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>VPN Gateway ({vpnProfiles.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('routing-rules')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === 'routing-rules' ? 'bg-neutral-200 text-neutral-900 font-bold' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
              }`}
            >
              <GitFork className="w-3.5 h-3.5 text-sky-400" />
              <span>Selective Routing ({routingRules.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('event-media')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === 'event-media' ? 'bg-neutral-200 text-neutral-900 font-bold' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-red-400" />
              <span>Event Media ({eventMediaSources.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('vpn-wizard')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === 'vpn-wizard' ? 'bg-neutral-200 text-neutral-900 font-bold' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Setup Wizard</span>
            </button>

            <button
              onClick={() => setActiveTab('channels')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === 'channels' ? 'bg-neutral-200 text-neutral-900 font-bold' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>Channels ({channels.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('events')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === 'events' ? 'bg-neutral-200 text-neutral-900 font-bold' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Featured Events ({events.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('categories')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === 'categories' ? 'bg-neutral-200 text-neutral-900 font-bold' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Categories ({categories.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('announcements')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === 'announcements' ? 'bg-neutral-200 text-neutral-900 font-bold' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
              }`}
            >
              <Megaphone className="w-3.5 h-3.5" />
              <span>Announcements ({announcements.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('tester')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === 'tester' ? 'bg-neutral-200 text-neutral-900 font-bold' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Stream Tester</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === 'settings' ? 'bg-neutral-200 text-neutral-900 font-bold' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => scrollTabs('right')}
            aria-label="Scroll tabs right"
            className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-white transition-colors shrink-0 shadow-sm cursor-pointer"
            title="Scroll tabs right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#181a20] border border-neutral-800 rounded-xl p-5 space-y-1">
              <p className="text-xs text-neutral-400">Active Live Channels</p>
              <p className="text-2xl font-bold text-white tabular-nums">{activeChannelsCount}</p>
              <p className="text-[11px] text-neutral-500">Publicly discoverable</p>
            </div>
            <div className="bg-[#181a20] border border-neutral-800 rounded-xl p-5 space-y-1">
              <p className="text-xs text-neutral-400">Inactive / Draft Channels</p>
              <p className="text-2xl font-bold text-amber-400 tabular-nums">{inactiveChannelsCount}</p>
              <p className="text-[11px] text-neutral-500">Hidden from public viewers</p>
            </div>
            <div className="bg-[#181a20] border border-neutral-800 rounded-xl p-5 space-y-1">
              <p className="text-xs text-neutral-400">Live & Upcoming Events</p>
              <p className="text-2xl font-bold text-red-500 tabular-nums">
                {liveEventsCount} <span className="text-xs text-neutral-400">Live</span> / {upcomingEventsCount} <span className="text-xs text-neutral-400">Upcoming</span>
              </p>
              <p className="text-[11px] text-neutral-500">{publishedEventsCount} total published</p>
            </div>
            <div className="bg-[#181a20] border border-neutral-800 rounded-xl p-5 space-y-1">
              <p className="text-xs text-neutral-400">Maintenance Status</p>
              <p className={`text-2xl font-bold ${settings.maintenanceMode ? 'text-amber-400' : 'text-emerald-400'}`}>
                {settings.maintenanceMode ? 'MAINTENANCE' : 'NORMAL'}
              </p>
              <p className="text-[11px] text-neutral-500">Public access open</p>
            </div>
          </div>

          {/* Current Hero Featured Priority Event */}
          <div className="bg-[#181a20] border border-neutral-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Current Priority #1 Homepage Event</h3>
              <button
                onClick={() => setActiveTab('events')}
                className="text-xs text-red-400 hover:text-red-300 font-medium"
              >
                Manage Events →
              </button>
            </div>

            {priorityOneEvent ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-neutral-900 border border-neutral-800">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-red-500 font-mono">Priority #{priorityOneEvent.priority}</span>
                    <span className="text-neutral-600">·</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 uppercase">
                      {priorityOneEvent.status}
                    </span>
                  </div>
                  <h4 className="text-base font-bold text-white">{priorityOneEvent.title}</h4>
                  <p className="text-xs text-neutral-400">{priorityOneEvent.subtitle}</p>
                </div>
                <div className="text-right text-xs text-neutral-400">
                  <p>Channel: <span className="text-white font-medium">{priorityOneEvent.channelName}</span></p>
                  <p className="text-[11px] font-mono text-neutral-500 mt-1">Button: {priorityOneEvent.buttonLabel}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-neutral-500 italic">No published featured events currently active.</p>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CHANNELS */}
      {activeTab === 'channels' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Filter channels by name..."
                value={channelSearch}
                onChange={(e) => {
                  setChannelSearch(e.target.value);
                  setChannelPage(1);
                }}
                className="w-full bg-[#181a20] border border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSyncIptv}
                disabled={isSyncingIptv}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-200 text-xs font-semibold border border-neutral-700 transition-colors"
                title="Fetch and verify working streams from iptv-org GitHub repository"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingIptv ? 'animate-spin text-red-400' : 'text-neutral-400'}`} />
                <span>{isSyncingIptv ? 'Syncing...' : 'Sync from GitHub iptv-org'}</span>
              </button>

              <button
                onClick={() => {
                  setEditingChannel({
                    name: '',
                    nepaliName: '',
                    streamUrl: '',
                    streamType: 'hls',
                    categoryId: 'nepali-tv',
                    categoryName: 'Nepali TV',
                    country: 'Nepal',
                    language: 'Nepali',
                    description: '',
                    isActive: true,
                    isPublished: true,
                    priority: 10,
                    sourceType: 'manual',
                    verificationStatus: 'untested',
                  });
                  setChannelModalOpen(true);
                }}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Add New Channel</span>
              </button>
            </div>
          </div>

          {/* Channels Table */}
          <div className="bg-[#181a20] border border-neutral-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-900/80 text-neutral-400 border-b border-neutral-800 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Priority</th>
                    <th className="py-3 px-4">Channel</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Format</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
                  {pagedChannels.map((ch) => (
                    <tr key={ch.id} className="hover:bg-neutral-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-neutral-400">
                        #{ch.priority}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-neutral-900 border border-neutral-800 flex items-center justify-center overflow-hidden shrink-0">
                            {ch.logoUrl ? (
                              <img src={ch.logoUrl} alt={ch.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                            ) : (
                              <Tv className="w-4 h-4 text-neutral-500" />
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-white">{ch.name}</p>
                            <p className="text-[11px] text-neutral-500">{ch.country} · {ch.language}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-neutral-400">{ch.categoryName}</td>
                      <td className="py-3 px-4 font-mono text-[11px] uppercase text-neutral-400">{ch.streamType}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              ch.isActive && ch.isPublished ? 'bg-emerald-500' : 'bg-neutral-600'
                            }`}
                          />
                          <span className="text-[11px]">
                            {ch.isActive && ch.isPublished ? 'Published' : 'Hidden'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setEditingChannel(ch);
                              setChannelModalOpen(true);
                            }}
                            className="p-1.5 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
                            aria-label={`Edit ${ch.name}`}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteChannel(ch.id, ch.name)}
                            className="p-1.5 rounded hover:bg-red-950 text-neutral-400 hover:text-red-400 transition-colors"
                            aria-label={`Delete ${ch.name}`}
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

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-neutral-900/60 border-t border-neutral-800 text-xs text-neutral-400">
              <div>
                Showing <span className="text-white font-medium">{filteredChannels.length === 0 ? 0 : (channelPage - 1) * CHANNELS_PER_PAGE + 1}</span> to <span className="text-white font-medium">{Math.min(channelPage * CHANNELS_PER_PAGE, filteredChannels.length)}</span> of <span className="text-white font-medium">{filteredChannels.length.toLocaleString()}</span> channels
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={channelPage <= 1}
                  onClick={() => setChannelPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-200 transition-colors text-xs font-medium"
                >
                  Previous
                </button>
                <span className="font-mono text-neutral-400 px-2 text-xs">
                  Page {channelPage} of {totalChannelPages}
                </span>
                <button
                  disabled={channelPage >= totalChannelPages}
                  onClick={() => setChannelPage((p) => Math.min(totalChannelPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-200 transition-colors text-xs font-medium"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: FEATURED EVENTS */}
      {activeTab === 'events' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Featured & Custom Events</h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Featured events determine the hero broadcast on the public homepage. Supports direct HLS streams, web player links, and India VPN routing.
              </p>
            </div>
            <button
              onClick={handleOpenAddCustomEvent}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors shrink-0 shadow-lg cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Custom Event</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {events.map((ev) => {
              const linkedMedia = eventMediaSources.find((m) => m.eventId === ev.id) || ev.mediaSource;
              const streamUrl = ev.streamUrlOverride || linkedMedia?.primaryStreamUrl;
              const isWeb = streamUrl ? isWebLinkStream(streamUrl) : false;

              return (
                <div
                  key={ev.id}
                  className="bg-[#181a20] border border-neutral-800 rounded-xl p-5 space-y-3 relative group hover:border-neutral-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono font-bold text-red-500 bg-red-950/60 px-2 py-0.5 rounded border border-red-900/60">
                        Priority #{ev.priority}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                        ev.status === 'LIVE' ? 'bg-red-600 text-white animate-pulse' : 'bg-neutral-800 text-neutral-300'
                      }`}>
                        {ev.status}
                      </span>
                      {(!ev.isActive || !ev.isPublished) && (
                        <span className="text-[10px] text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-900/40">
                          DRAFT
                        </span>
                      )}
                      {isWeb && (
                        <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-900/40 flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          <span>Web Player</span>
                        </span>
                      )}
                      {linkedMedia?.vpnProfileId && (
                        <span className="text-[10px] text-sky-400 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-900/40 flex items-center gap-1">
                          <Shield className="w-3 h-3" />
                          <span>🇮🇳 India VPN</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditEvent(ev)}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                        title="Edit event"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteEvent(ev.id, ev.title)}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-950/60 transition-colors"
                        title="Delete event"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-white line-clamp-1">{ev.title}</h4>
                    {ev.nepaliTitle && <p className="text-xs text-red-400">{ev.nepaliTitle}</p>}
                    <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{ev.subtitle || ev.description}</p>
                  </div>

                  {streamUrl && (
                    <div className="p-2 rounded-lg bg-neutral-900/80 border border-neutral-800/80 font-mono text-[11px] text-neutral-400 truncate flex items-center justify-between gap-2">
                      <span className="truncate">{streamUrl}</span>
                      <a
                        href={streamUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-neutral-400 hover:text-white shrink-0"
                        title="Open stream"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  <div className="pt-2 border-t border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400">
                    <span>Channel / Source: <strong className="text-neutral-200">{ev.channelName || ev.channelId}</strong></span>
                    <span className="font-mono">Button: "{ev.buttonLabel}"</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB: VPN GATEWAY MANAGEMENT */}
      {activeTab === 'vpn-gateway' && (
        <VpnGatewayManager
          profiles={vpnProfiles}
          onRefresh={handleRefreshAll}
          showSuccess={showSuccess}
          showError={showError}
        />
      )}

      {/* TAB: DOMAIN-BASED SELECTIVE ROUTING */}
      {activeTab === 'routing-rules' && (
        <RoutingRulesManager
          rules={routingRules}
          profiles={vpnProfiles}
          onRefresh={handleRefreshAll}
          showSuccess={showSuccess}
          showError={showError}
        />
      )}

      {/* TAB: MAIN EVENT MEDIA MANAGER */}
      {activeTab === 'event-media' && (
        <EventMediaManager
          mediaSources={eventMediaSources}
          events={events}
          profiles={vpnProfiles}
          onRefresh={handleRefreshAll}
          showSuccess={showSuccess}
          showError={showError}
        />
      )}

      {/* TAB: SETUP WIZARD */}
      {activeTab === 'vpn-wizard' && (
        <VpnSetupWizard
          profiles={vpnProfiles}
          rules={routingRules}
          events={events}
          onComplete={handleRefreshAll}
          showSuccess={showSuccess}
          showError={showError}
        />
      )}

      {/* TAB 4: CATEGORIES */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-neutral-400">Manage public genre classification tabs.</p>
            <button
              onClick={() => {
                setEditingCategory({
                  name: '',
                  nepaliName: '',
                  slug: '',
                  isActive: true,
                  displayOrder: categories.length + 1,
                });
                setCategoryModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>Add Category</span>
            </button>
          </div>

          <div className="bg-[#181a20] border border-neutral-800 rounded-xl divide-y divide-neutral-800">
            {categories.map((cat) => (
              <div key={cat.id} className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded bg-neutral-900 border border-neutral-800 flex items-center justify-center font-mono text-xs text-neutral-400">
                    {cat.displayOrder}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{cat.name}</p>
                    <p className="text-xs text-neutral-400">{cat.nepaliName} · slug: <code className="text-neutral-300">{cat.slug}</code></p>
                  </div>
                </div>

                <span className={`text-[11px] px-2 py-0.5 rounded ${cat.isActive ? 'bg-emerald-950 text-emerald-400' : 'bg-neutral-800 text-neutral-400'}`}>
                  {cat.isActive ? 'Active' : 'Disabled'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: ANNOUNCEMENTS & TOAST MESSAGES */}
      {activeTab === 'announcements' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white">Announcements & Homepage Toast Messages</h3>
              <p className="text-xs text-neutral-400">
                Broadcast live match alerts, urgent notices, or floating toast popups on the public homepage.
              </p>
            </div>
            <button
              onClick={() => {
                setEditingAnnouncement({
                  title: '',
                  message: '',
                  nepaliMessage: '',
                  type: 'info',
                  displayLocation: 'both',
                  actionType: 'okay',
                  actionLabel: 'Okay, Got It',
                  actionUrl: '',
                  imageUrl: '',
                  isActive: true,
                  isPublished: true,
                  displayOrder: announcements.length + 1,
                });
                setAnnouncementModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-md transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add Announcement / Toast</span>
            </button>
          </div>

          <div className="space-y-3">
            {announcements.length === 0 ? (
              <div className="p-8 rounded-xl bg-[#181a20] border border-neutral-800 text-center text-neutral-400 text-xs">
                No active announcements or toast messages. Click "+ Add Announcement / Toast" to create one.
              </div>
            ) : (
              announcements.map((ann) => (
                <div key={ann.id} className="p-4 rounded-xl bg-[#181a20] border border-neutral-800 hover:border-neutral-700 transition-colors space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-white">{ann.title}</h4>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                          ann.type === 'live'
                            ? 'bg-red-950/60 text-red-400 border-red-800/80'
                            : ann.type === 'warning'
                            ? 'bg-amber-950/60 text-amber-400 border-amber-800/80'
                            : ann.type === 'success'
                            ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/80'
                            : 'bg-sky-950/60 text-sky-400 border-sky-800/80'
                        }`}>
                          {ann.type === 'live' ? '🔴 Live Alert' : ann.type === 'warning' ? '⚠️ Warning' : ann.type === 'success' ? '✨ Special' : '📢 Notice'}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-300">
                          {ann.displayLocation === 'toast' ? 'Center Popup Only' : ann.displayLocation === 'banner' ? 'Top Banner Only' : 'Banner & Center Popup'}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-300">
                          {ann.actionType === 'download'
                            ? `📥 Download (${ann.actionLabel || 'Download'})`
                            : ann.actionType === 'visit'
                            ? `🔗 Visit (${ann.actionLabel || 'Visit'})`
                            : ann.actionType === 'custom'
                            ? `⚡ ${ann.actionLabel || 'Action'}`
                            : '✓ Okay Button'}
                        </span>
                        {ann.imageUrl && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800">
                            🖼️ Image Postcard
                          </span>
                        )}
                        <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${ann.isActive && ann.isPublished ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-neutral-800 text-neutral-400'}`}>
                          {ann.isActive && ann.isPublished ? 'ACTIVE' : 'DRAFT'}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-300 leading-relaxed">{ann.message}</p>
                      {ann.nepaliMessage && (
                        <p className="text-xs text-neutral-400 font-devanagari">{ann.nepaliMessage}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => {
                          setEditingAnnouncement(ann);
                          setAnnouncementModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 text-xs transition-colors cursor-pointer"
                        title="Edit Announcement"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setAnnouncementToDelete({ id: ann.id, title: ann.title })}
                        className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 border border-red-900/40 text-xs transition-colors cursor-pointer"
                        title="Delete Announcement"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 6: STREAM TESTER */}
      {activeTab === 'tester' && (
        <div className="space-y-6 max-w-2xl">
          <div className="bg-[#181a20] border border-neutral-800 rounded-2xl p-6 space-y-4">
            <div>
              <h3 className="text-base font-bold text-white">Live Stream Diagnostic Probe</h3>
              <p className="text-xs text-neutral-400 mt-1">
                Performs a real HTTP probe to test manifest headers, CORS accessibility, and content format.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-neutral-300">Stream URL to Validate</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testUrl}
                  onChange={(e) => setTestUrl(e.target.value)}
                  placeholder="https://example.com/playlist.m3u8"
                  className="flex-1 bg-[#101114] border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                />
                <button
                  onClick={handleRunStreamTest}
                  disabled={isTestingStream || !testUrl}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {isTestingStream ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  <span>Test Feed</span>
                </button>
              </div>
            </div>

            {testResult && (
              <div className={`p-4 rounded-xl border text-xs space-y-2 ${
                testResult.reachable ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300' : 'bg-red-950/40 border-red-800 text-red-300'
              }`}>
                <div className="flex items-center justify-between font-bold">
                  <span>Status: {testResult.reachable ? 'ONLINE & REACHABLE' : 'UNREACHABLE / RESTRICTED'}</span>
                  <span className="font-mono">HTTP {testResult.statusCode}</span>
                </div>
                <div className="text-[11px] text-neutral-300 space-y-1">
                  <p>Content-Type: <code className="font-mono">{testResult.contentType}</code></p>
                  <p>CORS Header: <code className="font-mono">{testResult.corsHeader}</code></p>
                  <p>HLS Playlist Manifest: <code className="font-mono">{testResult.hasHlsManifestHeader ? 'Verified' : 'No manifest tags'}</code></p>
                </div>
                <p className="text-xs border-t border-neutral-800/80 pt-2 font-medium">
                  {testResult.details}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 7: SETTINGS & MAINTENANCE */}
      {activeTab === 'settings' && (
        <div className="space-y-6 max-w-2xl">
          <div className="bg-[#181a20] border border-neutral-800 rounded-2xl p-6 space-y-6">
            <div>
              <h3 className="text-base font-bold text-white">Platform Settings</h3>
              <p className="text-xs text-neutral-400 mt-1">Configure homepage toggles and platform emergency states.</p>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-neutral-900 border border-neutral-800">
              <div>
                <p className="text-xs font-semibold text-white">Maintenance Mode</p>
                <p className="text-[11px] text-neutral-400">Shows temporary maintenance notice to public visitors while keeping admin portal accessible.</p>
              </div>
              <button
                onClick={handleToggleMaintenance}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  settings.maintenanceMode ? 'bg-amber-600 text-white' : 'bg-neutral-800 text-neutral-300'
                }`}
              >
                {settings.maintenanceMode ? 'ENABLED' : 'DISABLED'}
              </button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-neutral-900 border border-neutral-800">
              <div>
                <p className="text-xs font-semibold text-white">Show Featured Hero Event</p>
                <p className="text-[11px] text-neutral-400">Display prominent hero broadcast section on homepage.</p>
              </div>
              <button
                onClick={handleToggleShowFeatured}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  settings.showFeaturedEvent ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-neutral-300'
                }`}
              >
                {settings.showFeaturedEvent ? 'VISIBLE' : 'HIDDEN'}
              </button>
            </div>

            <div className="pt-4 border-t border-neutral-800 flex flex-wrap items-center gap-3">
              <button
                onClick={handleSyncIptv}
                disabled={isSyncingIptv}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white text-xs font-medium border border-neutral-700 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingIptv ? 'animate-spin text-red-400' : 'text-neutral-400'}`} />
                <span>{isSyncingIptv ? 'Syncing...' : 'Sync Live Channels from GitHub iptv-org'}</span>
              </button>

              <button
                onClick={handleResetDemo}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors"
              >
                Reset to Default Demo Channels & Matches
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CHANNEL EDIT / ADD MODAL */}
      {channelModalOpen && editingChannel && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#181a20] border border-neutral-800 rounded-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white">
              {editingChannel.id ? `Edit Channel: ${editingChannel.name}` : 'Add New Channel'}
            </h3>

            <form onSubmit={handleSaveChannel} className="space-y-3 text-xs">
              <div>
                <label className="block text-neutral-300 mb-1">Channel Name (Required)</label>
                <input
                  type="text"
                  required
                  value={editingChannel.name || ''}
                  onChange={(e) => setEditingChannel({ ...editingChannel, name: e.target.value })}
                  placeholder="e.g. Nepal Television HD"
                  className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="block text-neutral-300 mb-1">Nepali Name (Optional)</label>
                <input
                  type="text"
                  value={editingChannel.nepaliName || ''}
                  onChange={(e) => setEditingChannel({ ...editingChannel, nepaliName: e.target.value })}
                  placeholder="e.g. नेपाल टेलिभिजन"
                  className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="block text-neutral-300 mb-1">Stream URL (HLS / MP4 - Required)</label>
                <input
                  type="url"
                  required
                  value={editingChannel.streamUrl || ''}
                  onChange={(e) => setEditingChannel({ ...editingChannel, streamUrl: e.target.value })}
                  placeholder="https://.../master.m3u8"
                  className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-300 mb-1">Category</label>
                  <select
                    value={editingChannel.categoryId || 'nepali-tv'}
                    onChange={(e) => {
                      const cat = categories.find((c) => c.id === e.target.value);
                      setEditingChannel({
                        ...editingChannel,
                        categoryId: e.target.value,
                        categoryName: cat ? cat.name : 'General',
                      });
                    }}
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-300 mb-1">Priority (1 = Highest)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={editingChannel.priority || 10}
                    onChange={(e) => setEditingChannel({ ...editingChannel, priority: parseInt(e.target.value) || 10 })}
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-300 mb-1">Country</label>
                  <input
                    type="text"
                    value={editingChannel.country || 'Nepal'}
                    onChange={(e) => setEditingChannel({ ...editingChannel, country: e.target.value })}
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 mb-1">Language</label>
                  <input
                    type="text"
                    value={editingChannel.language || 'Nepali'}
                    onChange={(e) => setEditingChannel({ ...editingChannel, language: e.target.value })}
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-neutral-300 mb-1">Logo URL (Optional)</label>
                <input
                  type="url"
                  value={editingChannel.logoUrl || ''}
                  onChange={(e) => setEditingChannel({ ...editingChannel, logoUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="block text-neutral-300 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editingChannel.description || ''}
                  onChange={(e) => setEditingChannel({ ...editingChannel, description: e.target.value })}
                  className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                />
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingChannel.isActive ?? true}
                    onChange={(e) => setEditingChannel({ ...editingChannel, isActive: e.target.checked })}
                    className="accent-red-600 rounded"
                  />
                  <span>Active</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingChannel.isPublished ?? true}
                    onChange={(e) => setEditingChannel({ ...editingChannel, isPublished: e.target.checked })}
                    className="accent-red-600 rounded"
                  />
                  <span>Published to Public</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setChannelModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-neutral-800 text-neutral-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-500"
                >
                  Save Channel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EVENT EDIT / ADD MODAL */}
      {eventModalOpen && editingEvent && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#181a20] border border-neutral-800 rounded-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white">
              {editingEvent.id ? 'Edit Featured Event' : 'Create Featured Event'}
            </h3>

            <form onSubmit={handleSaveEvent} className="space-y-3 text-xs">
              <div>
                <label className="block text-neutral-300 mb-1">Event Title (Required)</label>
                <input
                  type="text"
                  required
                  value={editingEvent.title || ''}
                  onChange={(e) => setEditingEvent({ ...editingEvent, title: e.target.value })}
                  placeholder="e.g. Nepal Super League — Final Live"
                  className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="block text-neutral-300 mb-1">Nepali Title</label>
                <input
                  type="text"
                  value={editingEvent.nepaliTitle || ''}
                  onChange={(e) => setEditingEvent({ ...editingEvent, nepaliTitle: e.target.value })}
                  placeholder="e.g. नेपाल सुपर लिग — प्रत्यक्ष प्रसारण"
                  className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="block text-neutral-300 mb-1">Subtitle / Match Info</label>
                <input
                  type="text"
                  value={editingEvent.subtitle || ''}
                  onChange={(e) => setEditingEvent({ ...editingEvent, subtitle: e.target.value })}
                  placeholder="e.g. Kathmandu vs Lalitpur · Dasharath Stadium"
                  className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                />
              </div>

              {/* Stream URL / Web Link Input */}
              <div className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-white font-semibold flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-red-500" />
                      <span>Stream URL or Web Link</span>
                    </label>
                    <div className="flex items-center gap-2">
                      {isWebLinkStream(eventStreamUrl) && (
                        <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          <span>Web Player</span>
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleDetectEventMedia}
                        disabled={isDetectingEventMedia || !eventStreamUrl.trim()}
                        className="px-2.5 py-1 rounded-md bg-red-600/90 hover:bg-red-600 disabled:opacity-40 text-white text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                        title="Auto-detect underlying video streams or player embed"
                      >
                        {isDetectingEventMedia ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Radio className="w-3 h-3" />
                        )}
                        <span>{isDetectingEventMedia ? 'Detecting...' : 'Detect Stream'}</span>
                      </button>
                    </div>
                  </div>
                  <input
                    type="url"
                    value={eventStreamUrl}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEventStreamUrl(val);
                      setEventStreamType(detectStreamType(val));
                    }}
                    onBlur={() => {
                      if (eventStreamUrl.trim() && !detectedMediaNotice) {
                        handleDetectEventMedia();
                      }
                    }}
                    placeholder="e.g. https://sportlink-fancode10.pages.dev/ios?id=4250374 or https://.../master.m3u8"
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white font-mono placeholder-neutral-500 focus:outline-none focus:border-red-500"
                  />
                  {detectedMediaNotice ? (
                    <div className="mt-1.5 p-2 rounded-lg bg-emerald-950/60 border border-emerald-800/70 text-emerald-300 text-[11px] flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                      <span>{detectedMediaNotice}</span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-neutral-400 mt-1">
                      Paste an HLS (.m3u8) stream, YouTube, direct MP4, or an external web embed player link (e.g. Cloudflare Pages, FanCode, SportLink). Click "Detect Stream" to auto-sniff.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-neutral-300 mb-1 font-medium">Stream Format</label>
                    <select
                      value={eventStreamType}
                      onChange={(e) => setEventStreamType(e.target.value as StreamType)}
                      className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                    >
                      <option value="hls">HLS Stream (.m3u8)</option>
                      <option value="iframe">Web Stream Link / Embed Player (e.g. Pages.dev, FanCode)</option>
                      <option value="dash">MPEG-DASH (.mpd)</option>
                      <option value="direct">Direct MP4 / WebM</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-neutral-300 mb-1 font-medium">India VPN Gateway</label>
                    <select
                      value={eventVpnProfileId}
                      onChange={(e) => setEventVpnProfileId(e.target.value)}
                      className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                    >
                      <option value="">Default Host Network (No VPN)</option>
                      {vpnProfiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          🇮🇳 {p.name} ({p.city || 'India'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Backup Failover Stream URLs */}
                <div className="space-y-2 pt-2 border-t border-neutral-800/80">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-neutral-300 font-medium">Backup Failover Stream Links (Optional)</span>
                    <button
                      type="button"
                      onClick={() => setEventBackupUrls([...eventBackupUrls, ''])}
                      className="inline-flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Backup</span>
                    </button>
                  </div>
                  {eventBackupUrls.map((bUrl, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="url"
                        value={bUrl}
                        onChange={(e) => {
                          const updated = [...eventBackupUrls];
                          updated[idx] = e.target.value;
                          setEventBackupUrls(updated);
                        }}
                        placeholder={`Backup Stream #${idx + 1}`}
                        className="flex-1 bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white font-mono text-[11px]"
                      />
                      {eventBackupUrls.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setEventBackupUrls(eventBackupUrls.filter((_, i) => i !== idx))}
                          className="p-2 text-neutral-500 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Broadcast Channel / Source Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-300 mb-1">Pick Existing TV Channel</label>
                  <select
                    value={editingEvent.channelId || ''}
                    onChange={(e) => {
                      const sel = channels.find((c) => c.id === e.target.value);
                      setEditingEvent({
                        ...editingEvent,
                        channelId: e.target.value,
                        channelName: sel ? sel.name : editingEvent.channelName,
                      });
                      if (sel) setEventCustomChannel(sel.name);
                    }}
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                  >
                    <option value="">-- Custom Source / External Stream --</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-300 mb-1">Channel / Source Label</label>
                  <input
                    type="text"
                    value={eventCustomChannel}
                    onChange={(e) => {
                      setEventCustomChannel(e.target.value);
                      setEditingEvent({ ...editingEvent, channelName: e.target.value });
                    }}
                    placeholder="e.g. FanCode Live, SportLink HD"
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-neutral-300 mb-1">Priority (1 = Top Hero)</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={editingEvent.priority || 1}
                    onChange={(e) => setEditingEvent({ ...editingEvent, priority: parseInt(e.target.value) || 1 })}
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 mb-1">Event Status</label>
                  <select
                    value={editingEvent.status || 'LIVE'}
                    onChange={(e) => setEditingEvent({ ...editingEvent, status: e.target.value as any })}
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                  >
                    <option value="LIVE">LIVE NOW</option>
                    <option value="UPCOMING">UPCOMING</option>
                    <option value="ENDED">ENDED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-300 mb-1">Button Label</label>
                  <input
                    type="text"
                    value={editingEvent.buttonLabel || 'Watch Live'}
                    onChange={(e) => setEditingEvent({ ...editingEvent, buttonLabel: e.target.value })}
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                  />
                </div>
              </div>

              {/* Banner Artwork & Quick Presets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-neutral-300 font-medium">Banner Artwork URL</label>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-neutral-500">Presets:</span>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingEvent({
                          ...editingEvent,
                          bannerUrl: '/images/event_nsl_stadium.jpg',
                          thumbnailUrl: '/images/event_nsl_stadium.jpg',
                        })
                      }
                      className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                    >
                      🏟️ Stadium
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingEvent({
                          ...editingEvent,
                          bannerUrl: '/images/event_motorsport_race.jpg',
                          thumbnailUrl: '/images/event_motorsport_race.jpg',
                        })
                      }
                      className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                    >
                      🏎️ Motorsport
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={editingEvent.bannerUrl || ''}
                  onChange={(e) =>
                    setEditingEvent({
                      ...editingEvent,
                      bannerUrl: e.target.value,
                      thumbnailUrl: e.target.value,
                    })
                  }
                  placeholder="/images/event_nsl_stadium.jpg or https://..."
                  className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white font-mono"
                />
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingEvent.isActive ?? true}
                    onChange={(e) => setEditingEvent({ ...editingEvent, isActive: e.target.checked })}
                    className="accent-red-600 rounded"
                  />
                  <span>Active</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingEvent.isPublished ?? true}
                    onChange={(e) => setEditingEvent({ ...editingEvent, isPublished: e.target.checked })}
                    className="accent-red-600 rounded"
                  />
                  <span>Published on Homepage</span>
                </label>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-neutral-800">
                {editingEvent.id ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (editingEvent.id && editingEvent.title) {
                        handleDeleteEvent(editingEvent.id, editingEvent.title);
                        setEventModalOpen(false);
                      }
                    }}
                    className="px-3 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-900/40 text-red-400 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Event</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEventModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingEvent}
                    className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    {isSubmittingEvent && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>{editingEvent.id ? 'Save Changes' : 'Create Custom Event'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE EVENT MODAL */}
      <ConfirmModal
        isOpen={Boolean(eventToDelete)}
        title="Delete Featured Event?"
        message={`Are you sure you want to delete event "${eventToDelete?.title}"? This will remove the event from homepage broadcasting and purge its linked media streams.`}
        confirmText="Delete Event"
        isLoading={isDeletingEvent}
        onConfirm={handleConfirmDeleteEvent}
        onCancel={() => setEventToDelete(null)}
      />

      {/* CONFIRM DELETE CHANNEL MODAL */}
      <ConfirmModal
        isOpen={Boolean(channelToDelete)}
        title="Delete Channel?"
        message={`Are you sure you want to delete channel "${channelToDelete?.name}"?`}
        confirmText="Delete Channel"
        isLoading={isDeletingChannel}
        onConfirm={handleConfirmDeleteChannel}
        onCancel={() => setChannelToDelete(null)}
      />

      {/* CONFIRM RESET DEMO MODAL */}
      <ConfirmModal
        isOpen={confirmResetDemoOpen}
        title="Reset Demo Channels & Events?"
        message="Reset all channels, events, and categories to the default demonstration state? Custom channels and events will be restored to presets."
        confirmText="Reset All Data"
        isLoading={isResettingDemo}
        onConfirm={handleConfirmResetDemo}
        onCancel={() => setConfirmResetDemoOpen(false)}
      />

      {/* ANNOUNCEMENT & TOAST MODAL */}
      {announcementModalOpen && editingAnnouncement && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#14161b] border border-neutral-800 rounded-2xl p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <div>
                <h3 className="text-base font-bold text-white">
                  {editingAnnouncement.id ? 'Edit Announcement / Toast' : 'New Announcement / Toast Message'}
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Broadcast live alerts or toast notifications on the homepage.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAnnouncementModalOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAnnouncement} className="space-y-4 text-xs">
              <div>
                <label className="block text-neutral-300 mb-1 font-medium">Headline / Title *</label>
                <input
                  type="text"
                  required
                  value={editingAnnouncement.title || ''}
                  onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, title: e.target.value })}
                  placeholder="e.g. NPL Match Today, Welcome Notice"
                  className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-neutral-300 mb-1 font-medium">Message Body *</label>
                <textarea
                  required
                  rows={3}
                  value={editingAnnouncement.message || ''}
                  onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, message: e.target.value })}
                  placeholder="e.g. Karnali Yaks vs Lumbini Lions match is now live! Watch free on तपाईंको TV."
                  className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-neutral-300 mb-1 font-medium">Nepali Translation (Optional)</label>
                <input
                  type="text"
                  value={editingAnnouncement.nepaliMessage || ''}
                  onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, nepaliMessage: e.target.value })}
                  placeholder="e.g. तपाईंको TV मा स्वागत छ"
                  className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-300 mb-1 font-medium">Notice Style / Type</label>
                  <select
                    value={editingAnnouncement.type || 'info'}
                    onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, type: e.target.value as AnnouncementType })}
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                  >
                    <option value="live">🔴 Live Broadcast Alert</option>
                    <option value="info">📢 General Announcement</option>
                    <option value="warning">⚠️ Notice / Maintenance</option>
                    <option value="success">✨ Special Update</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-300 mb-1 font-medium">Display Location</label>
                  <select
                    value={editingAnnouncement.displayLocation || 'both'}
                    onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, displayLocation: e.target.value as AnnouncementDisplayLocation })}
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                  >
                    <option value="toast">Center Screen Popup / Postcard Card (Main Message)</option>
                    <option value="banner">Top Notice Banner Only</option>
                    <option value="both">Both (Banner & Center Popup)</option>
                  </select>
                </div>
              </div>

              {/* Popup Card Action Button Configuration */}
              <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-neutral-300 mb-1 font-medium">Main Action Button</label>
                    <select
                      value={editingAnnouncement.actionType || 'okay'}
                      onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, actionType: e.target.value as AnnouncementActionType })}
                      className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white"
                    >
                      <option value="okay">✓ "Okay / Got it" Button (Dismiss modal)</option>
                      <option value="visit">🔗 "Visit Link" Button (Open website/channel)</option>
                      <option value="download">📥 "Download" Button (Download APK/App/File)</option>
                      <option value="custom">⚡ Custom Action Button</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-neutral-300 mb-1 font-medium">Button Text Label (Optional)</label>
                    <input
                      type="text"
                      value={editingAnnouncement.actionLabel || ''}
                      onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, actionLabel: e.target.value })}
                      placeholder={
                        editingAnnouncement.actionType === 'download'
                          ? 'e.g. Download Android App'
                          : editingAnnouncement.actionType === 'visit'
                          ? 'e.g. Join Official Telegram'
                          : editingAnnouncement.actionType === 'custom'
                          ? 'e.g. Watch Match Live'
                          : 'e.g. Okay, Got It'
                      }
                      className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                {editingAnnouncement.actionType && editingAnnouncement.actionType !== 'okay' && (
                  <div>
                    <label className="block text-neutral-300 mb-1 font-medium">Destination Link / URL *</label>
                    <input
                      type="url"
                      value={editingAnnouncement.actionUrl || ''}
                      onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, actionUrl: e.target.value })}
                      placeholder="e.g. https://t.me/tapaikotv or https://example.com/app.apk"
                      className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white font-mono text-xs focus:outline-none focus:border-red-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-neutral-300 mb-1 font-medium">Postcard Image / Banner URL (Optional)</label>
                  <input
                    type="url"
                    value={editingAnnouncement.imageUrl || ''}
                    onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, imageUrl: e.target.value })}
                    placeholder="e.g. https://... or /images/banner.jpg"
                    className="w-full bg-[#101114] border border-neutral-800 rounded-lg p-2 text-white font-mono text-xs focus:outline-none focus:border-red-500"
                  />
                  {editingAnnouncement.imageUrl && (
                    <div className="mt-2 w-full h-28 rounded-xl overflow-hidden border border-neutral-800 bg-black">
                      <img
                        src={editingAnnouncement.imageUrl}
                        alt="Postcard Preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingAnnouncement.isActive ?? true}
                    onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, isActive: e.target.checked })}
                    className="accent-red-600 rounded"
                  />
                  <span>Active</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingAnnouncement.isPublished ?? true}
                    onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, isPublished: e.target.checked })}
                    className="accent-red-600 rounded"
                  />
                  <span>Published on Homepage</span>
                </label>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-neutral-800">
                {editingAnnouncement.id ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (editingAnnouncement.id && editingAnnouncement.title) {
                        setAnnouncementToDelete({ id: editingAnnouncement.id, title: editingAnnouncement.title });
                        setAnnouncementModalOpen(false);
                      }
                    }}
                    className="px-3 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-900/40 text-red-400 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAnnouncementModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingAnnouncement}
                    className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    {isSubmittingAnnouncement && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>{editingAnnouncement.id ? 'Save Changes' : 'Create Announcement / Toast'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE ANNOUNCEMENT MODAL */}
      <ConfirmModal
        isOpen={Boolean(announcementToDelete)}
        title="Delete Announcement / Toast Message?"
        message={`Are you sure you want to delete "${announcementToDelete?.title}"? This will remove the announcement and toast notification from the homepage for all users.`}
        confirmText="Delete Announcement"
        isLoading={isDeletingAnnouncement}
        onConfirm={handleConfirmDeleteAnnouncement}
        onCancel={() => setAnnouncementToDelete(null)}
      />
    </div>
  );
};
