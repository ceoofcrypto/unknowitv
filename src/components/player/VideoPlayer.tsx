import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { Channel, StreamQualityLevel } from '../../types/index.ts';
import {
  detectStreamType,
  getFriendlyStreamError,
  calculateBackoffDelay,
  getProxiedStreamUrl,
  shouldPreferStreamProxy,
  resolvePlayableStreamUrl,
} from '../../utils/streaming.ts';
import { sanitizeLogoUrl, getChannelMonogram } from '../../utils/channels.ts';
import { reportBrokenChannel, detectMediaFromWebUrl } from '../../services/api.ts';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RefreshCw,
  Settings,
  Share2,
  Star,
  Check,
  AlertTriangle,
  Radio,
  ArrowLeft,
  PictureInPicture,
  SkipForward,
} from 'lucide-react';

interface VideoPlayerProps {
  channel: Channel;
  streamUrlOverride?: string | null;
  backupStreamUrls?: string[];
  forceVpnGateway?: boolean;
  vpnProfileId?: string | null;
  eventName?: string;
  onBack: () => void;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  relatedChannels: Channel[];
  onSelectChannel: (channel: Channel) => void;
  onChannelBroken?: (channelId: string) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  channel,
  streamUrlOverride,
  backupStreamUrls = [],
  forceVpnGateway = false,
  vpnProfileId,
  eventName,
  onBack,
  isFavorite,
  onToggleFavorite,
  relatedChannels,
  onSelectChannel,
  onChannelBroken,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoSkipIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef<number>(0);
  const usingProxyRef = useRef<boolean>(false);
  const reportedBrokenRef = useRef<boolean>(false);
  const playSessionIdRef = useRef<number>(0);

  const [activeBackupIndex, setActiveBackupIndex] = useState<number>(-1);
  const [failoverNotice, setFailoverNotice] = useState<string | null>(null);
  const [autoSkipSeconds, setAutoSkipSeconds] = useState<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const isMutedRef = useRef<boolean>(true);
  const [volume, setVolume] = useState(0.8);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [availableQualities, setAvailableQualities] = useState<StreamQualityLevel[]>([]);
  const [selectedQuality, setSelectedQuality] = useState<number>(-1);
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const rawStreamUrl =
    activeBackupIndex >= 0 && backupStreamUrls[activeBackupIndex]
      ? backupStreamUrls[activeBackupIndex]
      : streamUrlOverride || channel.streamUrl;

  const resolvedInitial = resolvePlayableStreamUrl(rawStreamUrl);
  const [detectedStream, setDetectedStream] = useState<{ url: string; format: string } | null>(null);

  // Auto-detect underlying stream from web links if available
  useEffect(() => {
    setDetectedStream(null);
    const resolved = resolvePlayableStreamUrl(rawStreamUrl);

    // If it is an external web link (not a standard YouTube/Vimeo embed), try sniffing for native video/HLS stream
    if (
      resolved.streamType === 'iframe' &&
      !rawStreamUrl.includes('youtube.com') &&
      !rawStreamUrl.includes('youtu.be') &&
      !rawStreamUrl.includes('vimeo.com') &&
      !rawStreamUrl.includes('twitch.tv')
    ) {
      detectMediaFromWebUrl(rawStreamUrl).then((result) => {
        if (result && result.detected && result.streamUrl && result.streamType !== 'iframe') {
          setDetectedStream({
            url: result.streamUrl,
            format: result.streamType,
          });
        }
      }).catch(() => {});
    }
  }, [rawStreamUrl]);

  const effectiveStreamUrl = detectedStream?.url || resolvedInitial.playUrl;
  const streamFormat = detectedStream?.format || resolvedInitial.streamType;
  const isWebMode = streamFormat === 'iframe' || streamFormat === 'web_link';
  const cleanLogo = sanitizeLogoUrl(channel.logoUrl);
  const { initials, paletteClass } = getChannelMonogram(channel.name);

  const nextAvailableChannel = relatedChannels.find(
    (c) => c.id !== channel.id && c.isActive && c.verificationStatus !== 'failing'
  );

  const cancelAutoSkip = useCallback(() => {
    if (autoSkipIntervalRef.current) {
      clearInterval(autoSkipIntervalRef.current);
      autoSkipIntervalRef.current = null;
    }
    setAutoSkipSeconds(null);
  }, []);

  const cleanupPlayer = useCallback(() => {
    cancelAutoSkip();
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
  }, [cancelAutoSkip]);

  const handleFatalStreamFailure = useCallback(
    (friendlyMessage: string) => {
      // Check if backup failover streams are available
      if (backupStreamUrls && backupStreamUrls.length > 0 && activeBackupIndex + 1 < backupStreamUrls.length) {
        const nextIndex = activeBackupIndex + 1;
        setActiveBackupIndex(nextIndex);
        setFailoverNotice(`Primary stream offline. Switched to Backup Failover Feed #${nextIndex + 1}`);
        setTimeout(() => setFailoverNotice(null), 6000);
        return;
      }

      setErrorDetails(friendlyMessage);
      setIsLoading(false);
      cleanupPlayer();

      if (!streamUrlOverride && !reportedBrokenRef.current) {
        reportedBrokenRef.current = true;
        if (onChannelBroken) {
          onChannelBroken(channel.id);
        }
        reportBrokenChannel(channel.id).catch(() => {});
      }

      // Start Gazibo-TV 5-second auto-skip countdown if a next channel is available
      if (nextAvailableChannel) {
        const sessionAtError = playSessionIdRef.current;
        let remaining = 5;
        setAutoSkipSeconds(remaining);
        autoSkipIntervalRef.current = setInterval(() => {
          if (playSessionIdRef.current !== sessionAtError) {
            cancelAutoSkip();
            return;
          }
          remaining -= 1;
          setAutoSkipSeconds(remaining);
          if (remaining <= 0) {
            cancelAutoSkip();
            onSelectChannel(nextAvailableChannel);
          }
        }, 1000);
      }
    },
    [
      channel.id,
      streamUrlOverride,
      cleanupPlayer,
      cancelAutoSkip,
      onChannelBroken,
      backupStreamUrls,
      activeBackupIndex,
      nextAvailableChannel,
      onSelectChannel,
    ]
  );

  const loadStream = useCallback(
    (forceProxy: boolean = false) => {
      playSessionIdRef.current += 1;
      const sessionId = playSessionIdRef.current;

      cleanupPlayer();
      setErrorDetails(null);
      setIsLoading(true);

      // For external web links and iframe embed players, bypass native video tag and hls.js
      if (streamFormat === 'iframe' || streamFormat === 'web_link') {
        setIsLoading(false);
        setIsPlaying(true);
        setErrorDetails(null);
        return;
      }

      const video = videoRef.current;
      if (!video || !effectiveStreamUrl) return;

      video.muted = isMutedRef.current;

      // Only route via /api/gateway/stream if an administrator explicitly enabled VPN routing with a specific VPN profile
      let sourceToLoad: string;
      if (forceVpnGateway && vpnProfileId) {
        sourceToLoad = `/api/gateway/stream?url=${encodeURIComponent(effectiveStreamUrl)}&profileId=${encodeURIComponent(vpnProfileId)}`;
        usingProxyRef.current = true;
      } else {
        const useProxy = forceProxy || usingProxyRef.current || shouldPreferStreamProxy(effectiveStreamUrl);
        usingProxyRef.current = useProxy;
        sourceToLoad = useProxy ? getProxiedStreamUrl(effectiveStreamUrl) : effectiveStreamUrl;
      }

      // 50ms teardown delay to ensure old stream is fully torn down before starting new one (Gazibo-TV player.js pattern)
      retryTimeoutRef.current = setTimeout(() => {
        if (playSessionIdRef.current !== sessionId) return;

        if (streamFormat === 'hls') {
          if (Hls.isSupported()) {
            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: false,
              maxBufferLength: 30,
              maxMaxBufferLength: 60,
              startFragPrefetch: true,
              manifestLoadingTimeOut: 10000,
              levelLoadingTimeOut: 10000,
              fragLoadingTimeOut: 15000,
            });

            hlsRef.current = hls;
            hls.loadSource(sourceToLoad);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
              if (playSessionIdRef.current !== sessionId) return;
              setIsLoading(false);
              setErrorDetails(null);
              retryCountRef.current = 0;
              const levels: StreamQualityLevel[] = data.levels.map((lvl, index) => ({
                id: index,
                height: lvl.height,
                width: lvl.width,
                bitrate: lvl.bitrate,
                label: lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)}k`,
              }));
              setAvailableQualities(levels);

              video
                .play()
                .then(() => {
                  if (playSessionIdRef.current === sessionId) setIsPlaying(true);
                })
                .catch(() => {
                  video.muted = true;
                  isMutedRef.current = true;
                  setIsMuted(true);
                  video
                    .play()
                    .then(() => {
                      if (playSessionIdRef.current === sessionId) setIsPlaying(true);
                    })
                    .catch(() => setIsPlaying(false));
                });
            });

            hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
              if (playSessionIdRef.current !== sessionId) return;
              setSelectedQuality(hls.autoLevelEnabled ? -1 : data.level);
            });

            hls.on(Hls.Events.ERROR, (_, data) => {
              if (playSessionIdRef.current !== sessionId) return;
              if (data.fatal) {
                switch (data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    // First retry directly in browser up to 2 times (Gazibo-TV player.js pattern)
                    if (retryCountRef.current < 2) {
                      retryCountRef.current += 1;
                      hls.startLoad();
                    } else if (!usingProxyRef.current) {
                      // Fallback once to stream proxy if direct browser loading failed due to CORS/mixed-content
                      usingProxyRef.current = true;
                      retryCountRef.current = 0;
                      loadStream(true);
                    } else {
                      handleFatalStreamFailure(getFriendlyStreamError('network', data.details));
                    }
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    hls.recoverMediaError();
                    break;
                  default:
                    handleFatalStreamFailure(getFriendlyStreamError(data.type, data.details));
                    break;
                }
              }
            });
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = sourceToLoad;
            video.onloadedmetadata = () => {
              if (playSessionIdRef.current !== sessionId) return;
              setIsLoading(false);
              video.play().catch(() => {
                video.muted = true;
                isMutedRef.current = true;
                setIsMuted(true);
                video.play().catch(() => setIsPlaying(false));
              });
            };
            video.onerror = () => {
              if (playSessionIdRef.current !== sessionId) return;
              if (!usingProxyRef.current) {
                usingProxyRef.current = true;
                loadStream(true);
              } else {
                handleFatalStreamFailure('Native player encountered a playback error for this stream.');
              }
            };
          } else {
            handleFatalStreamFailure('HLS playback is not supported by your current browser.');
          }
        } else {
          video.src = sourceToLoad;
          video.onloadeddata = () => {
            if (playSessionIdRef.current !== sessionId) return;
            setIsLoading(false);
            video.play().catch(() => {
              video.muted = true;
              isMutedRef.current = true;
              setIsMuted(true);
              video.play().catch(() => setIsPlaying(false));
            });
          };
          video.onerror = () => {
            if (playSessionIdRef.current !== sessionId) return;
            handleFatalStreamFailure('Direct video source could not be played.');
          };
        }
      }, 50);
    },
    [effectiveStreamUrl, streamFormat, forceVpnGateway, vpnProfileId, cleanupPlayer, handleFatalStreamFailure]
  );

  useEffect(() => {
    retryCountRef.current = 0;
    usingProxyRef.current = false;
    reportedBrokenRef.current = false;
    loadStream(false);
    return () => {
      playSessionIdRef.current += 1;
      cleanupPlayer();
    };
  }, [channel.id, effectiveStreamUrl]);

  // Dispatches media playback commands (play, pause, mute, unmute, setVolume)
  // to iframes via DOM (same-origin), YouTube Player API, Vimeo API, and generic HTML5 postMessage conventions
  const dispatchIframeMediaCommand = useCallback(
    (command: 'play' | 'pause' | 'mute' | 'unmute' | 'setVolume', value?: number) => {
      const iframe = iframeRef.current;
      if (!iframe) return;

      // 1. Same-Origin direct DOM manipulation
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) {
          const mediaElements = doc.querySelectorAll<HTMLMediaElement>('video, audio');
          mediaElements.forEach((media) => {
            try {
              if (command === 'play') media.play().catch(() => {});
              if (command === 'pause') media.pause();
              if (command === 'mute') media.muted = true;
              if (command === 'unmute') {
                media.muted = false;
                if (value !== undefined) media.volume = value;
                else if (media.volume === 0) media.volume = 0.8;
              }
              if (command === 'setVolume' && value !== undefined) {
                media.volume = value;
                media.muted = value === 0;
              }
            } catch {
              // Ignore single media element error
            }
          });
        }
      } catch {
        // Cross-origin restriction expected
      }

      const win = iframe.contentWindow;
      if (!win) return;

      // Focus the iframe so browser audio/keyboard can route to it
      try {
        iframe.focus();
      } catch {
        // ignore
      }

      // 2. YouTube IFrame Player API
      try {
        const ytFunc =
          command === 'play'
            ? 'playVideo'
            : command === 'pause'
            ? 'pauseVideo'
            : command === 'mute'
            ? 'mute'
            : command === 'unmute'
            ? 'unMute'
            : 'setVolume';
        const ytArgs = command === 'setVolume' ? [(value ?? 1) * 100] : [];
        win.postMessage(
          JSON.stringify({ event: 'command', func: ytFunc, args: ytArgs }),
          '*'
        );
        if (command === 'unmute') {
          const volTarget = ((value ?? volume) || 0.8) * 100;
          win.postMessage(
            JSON.stringify({ event: 'command', func: 'setVolume', args: [volTarget] }),
            '*'
          );
        }
      } catch {
        // ignore
      }

      // 3. Vimeo Player API
      try {
        if (command === 'play') {
          win.postMessage(JSON.stringify({ method: 'play' }), '*');
        } else if (command === 'pause') {
          win.postMessage(JSON.stringify({ method: 'pause' }), '*');
        } else if (command === 'mute') {
          win.postMessage(JSON.stringify({ method: 'setVolume', value: 0 }), '*');
        } else if (command === 'unmute') {
          win.postMessage(JSON.stringify({ method: 'setVolume', value: (value ?? volume) || 0.8 }), '*');
        } else if (command === 'setVolume' && value !== undefined) {
          win.postMessage(JSON.stringify({ method: 'setVolume', value }), '*');
        }
      } catch {
        // ignore
      }

      // 4. Universal HTML5 / VideoJS / JWPlayer / Clappr / Plyr postMessage conventions
      try {
        win.postMessage({ type: `player:${command}`, action: command, command, value }, '*');
        win.postMessage({ type: command, value }, '*');
        win.postMessage({ action: command, value }, '*');
        win.postMessage({ event: command, data: value }, '*');
        win.postMessage(command, '*');
      } catch {
        // ignore
      }
    },
    [volume]
  );

  const handlePlayPause = () => {
    // A. Native Video Element
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
      return;
    }

    // B. Web Stream / IFrame Mode
    if (isWebMode) {
      const nextPlaying = !isPlaying;
      setIsPlaying(nextPlaying);
      dispatchIframeMediaCommand(nextPlaying ? 'play' : 'pause');
    }
  };

  const handleToggleMute = () => {
    const newMuted = !isMuted;
    isMutedRef.current = newMuted;
    setIsMuted(newMuted);

    const effectiveVol = (!newMuted && volume === 0) ? 0.8 : volume;
    if (!newMuted && volume === 0) {
      setVolume(0.8);
    }

    // A. Native Video Element
    if (videoRef.current) {
      videoRef.current.muted = newMuted;
      if (!newMuted && videoRef.current.volume === 0) {
        videoRef.current.volume = 0.8;
      }
      return;
    }

    // B. Web Stream / IFrame Mode
    if (isWebMode) {
      dispatchIframeMediaCommand(newMuted ? 'mute' : 'unmute', effectiveVol);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);

    const shouldUnmute = newVol > 0 && isMuted;
    if (shouldUnmute) {
      isMutedRef.current = false;
      setIsMuted(false);
    }

    // A. Native Video Element
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      if (shouldUnmute) {
        videoRef.current.muted = false;
      }
      return;
    }

    // B. Web Stream / IFrame Mode
    if (isWebMode) {
      dispatchIframeMediaCommand('setVolume', newVol);
      if (shouldUnmute) {
        dispatchIframeMediaCommand('unmute', newVol);
      }
    }
  };

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handlePictureInPicture = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch {
      // Ignore PiP unsupported
    }
  };

  const handleSelectQuality = (levelId: number) => {
    if (!hlsRef.current) return;
    hlsRef.current.currentLevel = levelId;
    setSelectedQuality(levelId);
    setQualityMenuOpen(false);
  };

  const handleCopyLink = () => {
    const url = window.location.origin + `?channel=${channel.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3500);
  };

  return (
    <div className="space-y-6">
      {/* Top navigation & actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Channels</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLink}
            aria-label="Share channel link"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{copiedLink ? 'Link Copied!' : 'Share'}</span>
          </button>

          <button
            onClick={() => onToggleFavorite(channel.id)}
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
          >
            <Star className={`w-3.5 h-3.5 ${isFavorite ? 'text-amber-400 fill-amber-400' : 'text-neutral-500'}`} />
            <span>{isFavorite ? 'Saved' : 'Favorite'}</span>
          </button>
        </div>
      </div>

      {/* Video Container */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => isPlaying && setShowControls(false)}
        className="relative aspect-video w-full rounded-2xl bg-black overflow-hidden shadow-2xl border border-neutral-800 group"
      >
        {streamFormat === 'iframe' || streamFormat === 'web_link' ? (
          <div className="relative w-full h-full bg-black">
            <iframe
              ref={iframeRef}
              src={effectiveStreamUrl}
              title={eventName || channel.name}
              allow="accelerometer; autoplay *; clipboard-write; encrypted-media *; gyroscope; picture-in-picture; web-share; fullscreen *"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              className="w-full h-full border-0"
              onLoad={() => {
                setIsLoading(false);
                setIsPlaying(true);
              }}
            />
          </div>
        ) : (
          <video
            ref={videoRef}
            playsInline
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onWaiting={() => setIsLoading(true)}
            onPlaying={() => setIsLoading(false)}
            onClick={handlePlayPause}
            className="w-full h-full object-contain cursor-pointer"
          />
        )}

        {/* Top-Left Broadcast Logo Mark (TapaikoTv) */}
        <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 pointer-events-none select-none flex items-center gap-2">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-black/55 backdrop-blur-md border border-white/10 shadow-lg shadow-black/40">
            <img
              src="/logo.png"
              alt="तपाईंको TV"
              className="w-6 h-6 rounded-lg object-cover shadow ring-1 ring-white/15"
            />
            <span className="text-xs font-bold text-white tracking-tight drop-shadow-sm">
              तपाईंको TV
            </span>
          </div>
        </div>

        {/* Bottom-Center Broadcast Watermark (tapaikotv) */}
        <div className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none select-none">
          <div className="px-3 py-1 rounded-full bg-black/40 backdrop-blur-[3px] border border-white/10 text-white/50 text-[10px] sm:text-[11px] font-mono font-medium tracking-[0.25em] uppercase shadow-sm">
            tapaikotv
          </div>
        </div>

        {/* Loading Overlay */}
        {isLoading && !errorDetails && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 pointer-events-none">
            <RefreshCw className="w-8 h-8 text-red-500 animate-spin mb-3" />
            <p className="text-xs font-medium text-neutral-300 tracking-wide uppercase">
              Connecting Live Broadcast...
            </p>
          </div>
        )}

        {/* Center Play Button Overlay when paused */}
        {!isPlaying && !isLoading && !errorDetails && (
          <div
            onClick={handlePlayPause}
            className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/30 transition-colors cursor-pointer z-20 group"
          >
            <div className="w-16 h-16 rounded-full bg-red-600/90 group-hover:bg-red-600 flex items-center justify-center text-white shadow-2xl transition-transform group-hover:scale-110 active:scale-95">
              <Play className="w-7 h-7 fill-white translate-x-0.5" />
            </div>
          </div>
        )}

        {/* Unmute Overlay Notice when autoplay muted */}
        {isMuted && isPlaying && !errorDetails && (
          <div className="absolute top-14 left-3 sm:top-16 sm:left-4 z-20">
            <button
              onClick={handleToggleMute}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-600 text-white text-xs font-semibold shadow-lg backdrop-blur-sm transition-transform active:scale-95 cursor-pointer"
            >
              <VolumeX className="w-3.5 h-3.5" />
              <span>Tap to Unmute</span>
            </button>
          </div>
        )}

        {/* Failover Backup Source Active Notice */}
        {failoverNotice && (
          <div className="absolute top-4 right-4 z-20 bg-amber-950/90 border border-amber-700 text-amber-200 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-lg backdrop-blur-sm flex items-center gap-2 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{failoverNotice}</span>
          </div>
        )}

        {/* Playback Error Overlay with Gazibo-TV Auto-Skip Countdown */}
        {errorDetails && (
          <div className="absolute inset-0 bg-neutral-950/95 flex flex-col items-center justify-center p-6 text-center z-30">
            <AlertTriangle className="w-10 h-10 text-amber-500 mb-3" />
            <h3 className="text-base font-semibold text-white mb-2">
              Stream Unavailable
            </h3>
            <p className="text-xs text-neutral-400 max-w-md mb-2 leading-relaxed">
              {errorDetails}
            </p>
            {autoSkipSeconds !== null && nextAvailableChannel && (
              <p className="text-xs font-mono text-amber-400 mb-4">
                Skipping to {nextAvailableChannel.name} in {autoSkipSeconds}s…
              </p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-3">
              {nextAvailableChannel && (
                <button
                  onClick={() => {
                    cancelAutoSkip();
                    onSelectChannel(nextAvailableChannel);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  <span>Skip Now ({nextAvailableChannel.name})</span>
                </button>
              )}
              <button
                onClick={() => {
                  cancelAutoSkip();
                  retryCountRef.current = 0;
                  usingProxyRef.current = false;
                  loadStream(false);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-medium transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Stream</span>
              </button>
              <button
                onClick={() => {
                  cancelAutoSkip();
                  onBack();
                }}
                className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 text-xs font-medium transition-colors cursor-pointer"
              >
                Return to Directory
              </button>
            </div>
          </div>
        )}

        {/* Custom Player Controls Bar */}
        <div
          className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-4 transition-opacity duration-300 flex items-center justify-between gap-4 z-20 ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={handlePlayPause}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="p-2 rounded-lg text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
            </button>

            <div className="flex items-center gap-2 group/vol">
              <button
                onClick={handleToggleMute}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
                className="p-2 rounded-lg text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                aria-label="Volume slider"
                className="w-16 sm:w-20 accent-red-600 cursor-pointer h-1.5 rounded-lg bg-neutral-700"
              />
            </div>

            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-bold text-red-400 uppercase tracking-wider">
              <Radio className="w-3.5 h-3.5 text-red-500" />
              <span>LIVE</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {availableQualities.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setQualityMenuOpen(!qualityMenuOpen)}
                  aria-label="Stream quality selector"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono text-neutral-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>
                    {selectedQuality === -1 ? 'Auto' : availableQualities[selectedQuality]?.label || 'Quality'}
                  </span>
                </button>

                {qualityMenuOpen && (
                  <div className="absolute bottom-10 right-0 bg-neutral-900 border border-neutral-800 rounded-xl py-1 shadow-xl min-w-[120px] text-xs z-30">
                    <button
                      onClick={() => handleSelectQuality(-1)}
                      className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-neutral-800 ${
                        selectedQuality === -1 ? 'text-red-400 font-bold' : 'text-neutral-300'
                      }`}
                    >
                      <span>Auto</span>
                      {selectedQuality === -1 && <Check className="w-3 h-3" />}
                    </button>
                    {availableQualities.map((lvl) => (
                      <button
                        key={lvl.id}
                        onClick={() => handleSelectQuality(lvl.id)}
                        className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-neutral-800 ${
                          selectedQuality === lvl.id ? 'text-red-400 font-bold' : 'text-neutral-300'
                        }`}
                      >
                        <span>{lvl.label}</span>
                        {selectedQuality === lvl.id && <Check className="w-3 h-3" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handlePictureInPicture}
              aria-label="Picture in Picture"
              className="p-2 rounded-lg text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <PictureInPicture className="w-4 h-4" />
            </button>

            <button
              onClick={handleToggleFullscreen}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              className="p-2 rounded-lg text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Channel Information Details */}
      <div className="bg-[#13151b] border border-neutral-800/80 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div
            className={`w-14 h-14 rounded-xl border flex items-center justify-center overflow-hidden shrink-0 ${
              cleanLogo ? 'bg-neutral-900 border-neutral-800' : `bg-gradient-to-br ${paletteClass}`
            }`}
          >
            {cleanLogo ? (
              <img
                src={cleanLogo}
                alt={channel.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain p-1.5"
              />
            ) : (
              <span className="text-lg font-extrabold font-mono tracking-wider">{initials}</span>
            )}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-tight">{channel.name}</h2>
              {channel.nepaliName && (
                <span className="text-sm text-neutral-400 font-normal">· {channel.nepaliName}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
              <span>{channel.categoryName}</span>
              <span>·</span>
              <span>{channel.country}</span>
              <span>·</span>
              <span>Language: {channel.language}</span>
              <span>·</span>
              <span className="font-mono text-neutral-500 uppercase">{channel.streamType}</span>
            </div>
          </div>
        </div>

        {channel.description && (
          <p className="text-xs text-neutral-400 max-w-md leading-relaxed">
            {channel.description}
          </p>
        )}
      </div>

      {/* Related / Next Channels Row */}
      {relatedChannels.length > 0 && (
        <div className="space-y-3 pt-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            More in {channel.categoryName}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {relatedChannels
              .filter((c) => c.id !== channel.id && c.isActive && c.verificationStatus !== 'failing')
              .slice(0, 4)
              .map((rel) => {
                const relLogo = sanitizeLogoUrl(rel.logoUrl);
                const relMono = getChannelMonogram(rel.name);
                return (
                  <button
                    key={rel.id}
                    onClick={() => onSelectChannel(rel)}
                    className="flex items-center gap-3 p-3 rounded-xl bg-[#13151b] hover:bg-[#191c24] border border-neutral-800 transition-colors text-left cursor-pointer"
                  >
                    <div
                      className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 overflow-hidden ${
                        relLogo ? 'bg-neutral-900 border-neutral-800' : `bg-gradient-to-br ${relMono.paletteClass}`
                      }`}
                    >
                      {relLogo ? (
                        <img
                          src={relLogo}
                          alt={rel.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain p-1"
                        />
                      ) : (
                        <span className="text-[11px] font-bold font-mono">{relMono.initials}</span>
                      )}
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-xs font-semibold text-white truncate">{rel.name}</p>
                      <p className="text-[10px] text-neutral-400 truncate">{rel.categoryName}</p>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};
