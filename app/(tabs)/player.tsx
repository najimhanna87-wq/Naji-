/**
 * SimaStream Player — expo-video (ExoPlayer/AVPlayer backend)
 *
 * Modes:
 *  • LIVE  (contentType = 'live' | 'sports')
 *      - No progress bar (live streams have no seekable duration)
 *      - LIVE badge shown
 *      - CH+ / CH- navigation
 *      - Instant channel switch: player is replaced immediately
 *
 *  • VOD   (contentType = 'movies')
 *      - Full interactive progress bar with drag-to-seek
 *      - ±10 s skip buttons
 *      - Duration / current time display
 *      - Next / Prev episode navigation
 *
 *  • SERIES (contentType = 'series')
 *      - Same as VOD + auto-advance to next episode on playToEnd
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDevice } from '@/hooks/use-device';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StatusBar,
  Alert,
  FlatList,
  TextInput,
  BackHandler,
  Platform,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import type { VideoView as VideoViewType } from 'expo-video';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SimaColors } from '@/constants/theme';
import { historyService } from '@/lib/history-service';
import { releasePlayerLock } from '@/lib/player-navigation';

// Extracts the numeric Xtream stream_id from a VOD/series stream URL
// (e.g. ".../movie/user/pass/12345.mp4" -> 12345). This is the same id
// already used as content_id/content_id when the record was first
// created in ContentScreen.tsx, so updating by this id keeps both in
// sync without changing how that record is created.
function extractStreamIdFromUrl(url?: string): number | null {
  if (!url) return null;
  const match = url.match(/\/(\d+)\.\w+(?:\?.*)?$/);
  if (!match) return null;
  const id = parseInt(match[1], 10);
  return isFinite(id) ? id : null;
}

// ─── Types ──────────────────────────────────────────────────────────────────
interface PlaylistItem {
  id: number;
  url: string;
  name: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function isLiveType(contentType: string): boolean {
  return contentType === 'live' || contentType === 'sports';
}

// ─── Progress Bar Component ──────────────────────────────────────────────────
interface ProgressBarProps {
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  isTV: boolean;
}

function ProgressBar({ currentTime, duration, onSeek, isTV }: ProgressBarProps) {
  const barRef = useRef<View>(null);
  const [barWidth, setBarWidth] = useState(1);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
  const displayProgress = isSeeking ? seekPosition : progress;

  const getSeekFromX = (x: number) => {
    const clamped = Math.max(0, Math.min(x, barWidth));
    return (clamped / barWidth) * duration;
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => duration > 0,
    onMoveShouldSetPanResponder: () => duration > 0,
    onPanResponderGrant: (e: GestureResponderEvent) => {
      setIsSeeking(true);
      barRef.current?.measure((_x, _y, width, _h, pageX) => {
        const relX = e.nativeEvent.pageX - pageX;
        setSeekPosition(Math.max(0, Math.min(relX / width, 1)));
      });
    },
    onPanResponderMove: (e: GestureResponderEvent, gs: PanResponderGestureState) => {
      barRef.current?.measure((_x, _y, width, _h, pageX) => {
        const relX = e.nativeEvent.pageX - pageX;
        setSeekPosition(Math.max(0, Math.min(relX / width, 1)));
      });
    },
    onPanResponderRelease: (e: GestureResponderEvent) => {
      barRef.current?.measure((_x, _y, width, _h, pageX) => {
        const relX = e.nativeEvent.pageX - pageX;
        const ratio = Math.max(0, Math.min(relX / width, 1));
        const seekTo = ratio * duration;
        onSeek(seekTo);
        setIsSeeking(false);
      });
    },
    onPanResponderTerminate: () => setIsSeeking(false),
  });

  return (
    <View style={styles.progressWrapper}>
      {/* Time labels */}
      <Text style={[styles.timeLabel, isTV && { fontSize: 16 }]}>{formatTime(currentTime)}</Text>

      {/* Bar track */}
      <View
        ref={barRef}
        style={[styles.progressTrack, isTV && { height: 6 }]}
        onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        {/* Buffered (subtle) */}
        <View style={[styles.progressBuffered, { width: `${displayProgress * 100}%` }]} />
        {/* Played */}
        <View style={[styles.progressPlayed, { width: `${displayProgress * 100}%` }]} />
        {/* Thumb */}
        <View
          style={[
            styles.progressThumb,
            { left: `${displayProgress * 100}%` as any },
            isTV && { width: 20, height: 20, marginLeft: -10, marginTop: -8 },
            isSeeking && { transform: [{ scale: 1.4 }] },
          ]}
        />
      </View>

      <Text style={[styles.timeLabel, isTV && { fontSize: 16 }]}>{formatTime(duration)}</Text>
    </View>
  );
}

// ─── Channel Panel Component ──────────────────────────────────────────────────
interface FilteredItem { item: PlaylistItem; i: number; }
interface ChannelPanelProps {
  playlist: PlaylistItem[];
  currentIndex: number;
  focusedChannelIndex: number;
  isLive: boolean;
  contentType: string;
  insetTop: number;
  channelListRef: React.RefObject<FlatList<FilteredItem> | null>;
  onSelect: (index: number) => void;
  onClose: () => void;
}

function ChannelPanel({
  playlist, currentIndex, focusedChannelIndex, isLive, contentType,
  insetTop, channelListRef, onSelect, onClose,
}: ChannelPanelProps) {
  const [query, setQuery] = React.useState('');
  const filtered = query.trim()
    ? playlist.map((item, i) => ({ item, i })).filter(({ item }) => item.name.toLowerCase().includes(query.toLowerCase()))
    : playlist.map((item, i) => ({ item, i }));

  return (
    <View style={[styles.channelPanel, { paddingTop: insetTop }]}>
      {/* Title + close */}
      <View style={styles.channelPanelHeader}>
        <Text style={styles.channelPanelTitle}>
          {isLive ? 'Channels' : contentType === 'series' ? 'Episodes' : 'Playlist'}
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}> ({filtered.length})</Text>
        </Text>
        <Pressable
          focusable={true} onPress={onClose} style={styles.channelPanelClose}>
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.6)" />
        </Pressable>
      </View>

      {/* Search bar */}
      <View style={styles.channelSearchBar}>
        <Ionicons name="search-outline" size={14} color="rgba(255,255,255,0.4)" />
        <TextInput
          style={styles.channelSearchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search..."
          placeholderTextColor="rgba(255,255,255,0.3)"
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable
          focusable={true} onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={14} color="rgba(255,255,255,0.4)" />
          </Pressable>
        )}
      </View>

      {/* List */}
      <FlatList<FilteredItem>
        ref={channelListRef as any}
        data={filtered}
        keyExtractor={({ i }) => String(i)}
        renderItem={({ item: { item, i } }) => {
          const isActive = i === currentIndex;
          const isFocused = i === focusedChannelIndex;
          return (
            <Pressable
          focusable={true}
              onPress={() => onSelect(i)}
              style={[
                styles.channelItem,
                isActive && styles.channelItemActive,
                isFocused && styles.channelItemFocused,
              ]}
            >
              <Text style={[styles.channelNum, isFocused && { color: '#F5A623' }]}>{i + 1}</Text>
              <Text
                style={[styles.channelName, isActive && styles.channelNameActive, isFocused && { color: '#fff', fontWeight: '700' }]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              {isActive && <Ionicons name="radio-button-on" size={12} color={SimaColors.accent} />}
              {isFocused && !isActive && <Ionicons name="chevron-forward" size={12} color="#F5A623" />}
            </Pressable>
          );
        }}
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, index) => ({ length: 44, offset: 44 * index, index })}
        initialScrollIndex={Math.max(0, currentIndex - 3)}
      />
    </View>
  );
}

// ─── Main Player Screen ───────────────────────────────────────────────────────
export default function PlayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const device = useDevice();
  const params = useLocalSearchParams<{
    url: string;
    title: string;
    currentIndex: string;
    totalCount: string;
    contentType: string;
    replaceContent?: string;
    seriesId?: string;
  }>();

  const contentType = params.contentType || 'live';
  const isLive = isLiveType(contentType);

  // ── State ──────────────────────────────────────────────────────────────────
  const [quality, setQuality] = useState('Auto');
  const [currentIndex, setCurrentIndex] = useState(parseInt(params.currentIndex || '0', 10));
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [currentItem, setCurrentItem] = useState<{ url: string; title: string }>({
    url: params.url || '',
    title: params.title || 'Now Playing',
  });
  const [showChannelList, setShowChannelList] = useState(false);
  const [showControls, setShowControls] = useState(true);
  // Visual focus highlight for the control buttons (Prev/-10s/Play-Pause/
  // +10s/Next) — was completely missing before, which is why D-pad
  // navigation worked (could reach and press the buttons) but gave no
  // visual indication of which button was currently selected.
  const [focusedControlId, setFocusedControlId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);

  // VOD-only state
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Screen lock
  const [isLocked, setIsLocked] = useState(false);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // TV: focused channel index in the side panel
  const [focusedChannelIndex, setFocusedChannelIndex] = useState<number>(-1);
  const channelListRef = useRef<FlatList<FilteredItem> | null>(null);

  // Audio / subtitle tracks
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showSubMenu, setShowSubMenu] = useState(false);
  const [audioTracks, setAudioTracks] = useState<Array<{id: string; label: string; language: string}>>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<Array<{id: string; label: string; language: string}>>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  // Refs (stable across renders, safe in callbacks)
  const playlistRef = useRef<PlaylistItem[]>([]);
  const currentIndexRef = useRef<number>(parseInt(params.currentIndex || '0', 10));
  const qualityRef = useRef<string>('Auto');
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timePollerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track the URL we last told the player to load — prevents stale replace calls
  const loadedUrlRef = useRef<string>('');
  // Incremented on every navigateTo() call. A switch only completes if its
  // token still matches the latest one when the new source becomes ready —
  // this is what prevents audio overlap when the user taps channels quickly.
  const switchTokenRef = useRef<number>(0);
  // VideoView ref for PiP
  const videoViewRef = useRef<VideoViewType>(null);
  // Navigation lock - prevent multiple player activities from opening
  const isPlayerOpenRef = useRef<boolean>(true); // This player is open

  // Whether the built-in (ExoPlayer / AVPlayer) backend can enter
  // Picture-in-Picture on this device. Computed once. PiP is a feature of
  // the built-in "exo" engine only — the external player (VLC / MX Player,
  // used as the fallback) runs in its own app and manages its own PiP.
  const [pipSupported, setPipSupported] = useState(false);

  // ── Player ─────────────────────────────────────────────────────────────────
  // We initialise with the URL from params; on mount we may replace it with
  // the playlist item, but we do NOT re-create the player on every render.
  const player = useVideoPlayer(params.url || '', (p) => {
    p.loop = false;
    p.play();
  });

  // Detect PiP support once. On web there is no PiP; on native we ask
  // expo-video whether the current device/manifest actually supports it.
  // If the check itself is unavailable we stay conservative (false) so we
  // never render a button that would throw a native exception on press.
  useEffect(() => {
    if (Platform.OS === 'web') { setPipSupported(false); return; }
    try {
      const check = (VideoView as any)?.isPictureInPictureSupported;
      setPipSupported(typeof check === 'function' ? !!check() : false);
    } catch {
      setPipSupported(false);
    }
  }, []);

  // Keep refs in sync
  useEffect(() => { playlistRef.current = playlist; }, [playlist]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { qualityRef.current = quality; }, [quality]);

  // Cleanup on unmount: release player lock
  useEffect(() => {
    return () => {
      isPlayerOpenRef.current = false;
      releasePlayerLock();
      if (timePollerRef.current) clearInterval(timePollerRef.current);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      try { player.pause(); } catch {}
    };
  }, [player]);

  // ── Load saved watch position for VOD/Series ─────────────────────────────
  useEffect(() => {
    if (!isLiveType(contentType) && params.url) {
      const posKey = `watch_position_${params.url}`;
      AsyncStorage.getItem(posKey).then(saved => {
        if (saved) {
          const position = parseFloat(saved);
          if (isFinite(position) && position > 0) {
            setTimeout(() => {
              if (player.currentTime !== undefined) {
                player.currentTime = position;
                setCurrentTime(position);
              }
            }, 500);
          }
        }
      });
    }
  }, [params.url, contentType, player]);

  // ── Save watch position periodically for VOD/Series ──────────────────────────
  useEffect(() => {
    if (isLiveType(contentType) || !params.url) return;
    
    const posKey = `watch_position_${params.url}`;
    const interval = setInterval(() => {
      const ct = player.currentTime ?? 0;
      if (ct > 0 && isFinite(ct)) {
        AsyncStorage.setItem(posKey, String(ct));
        // Also mirror the position into historyService so "Continue Watching"
        // progress bars reflect real playback progress, not just "watched: yes".
        // Movies only here — series progress is mirrored separately below
        // alongside the existing series_last_watched_* save.
        if (contentType === 'movies') {
          const streamId = extractStreamIdFromUrl(params.url);
          const dur = player.duration ?? 0;
          if (streamId !== null && dur > 0) {
            historyService.updatePosition('movie', streamId, ct, dur).catch(() => {});
          }
        }
      }
    }, 5000); // Save every 5 seconds
    
    return () => clearInterval(interval);
  }, [params.url, contentType, player]);

  // ── Save series progress (UPDATE last episode only, not INSERT new) ────────────
  useEffect(() => {
    if (contentType !== 'series' || !params.seriesId) return;
    
    const saveSeriesProgress = async () => {
      try {
        const ct = player.currentTime ?? 0;
        if (ct > 0 && isFinite(ct)) {
          console.log('[PLAYER] Saving series progress with seriesId:', params.seriesId, 'position:', ct);
          const seriesKey = `series_last_watched_${params.seriesId}`;
          await AsyncStorage.setItem(seriesKey, JSON.stringify({
            seriesId: params.seriesId,
            title: params.title,
            url: params.url,
            position: ct,
            episodeIndex: currentIndex,
            totalEpisodes: playlist.length,
            timestamp: Date.now(),
          }));
        }
      } catch {}
    };
    
    const interval = setInterval(saveSeriesProgress, 5000);
    return () => clearInterval(interval);
  }, [params.seriesId, params.title, params.url, contentType, player, currentIndex, playlist.length]);

  // ── Replace content when params change (single player window mode) ────────
  useEffect(() => {
    if (params.replaceContent === 'true' && params.url && params.url !== loadedUrlRef.current) {
      loadedUrlRef.current = params.url;
      try {
        player.pause();
        player.muted = true;
      } catch {}
      player.replace(params.url);
      setCurrentItem({ url: params.url, title: params.title || 'Now Playing' });
      setCurrentTime(0);
      setDuration(0);
      const idx = parseInt(params.currentIndex || '0', 10);
      setCurrentIndex(idx);
      currentIndexRef.current = idx;
      setTimeout(() => {
        if (!isPlayerOpenRef.current) return;
        try {
          player.muted = false;
          player.play();
          setIsPlaying(true);
        } catch {}
      }, 100);
    }
  }, [params.replaceContent, params.url, params.title, params.currentIndex, player]);

  // ── Load playlist from AsyncStorage on mount ───────────────────────────────
  useEffect(() => {
    const init = async () => {
      const savedQuality = await AsyncStorage.getItem('simastream_video_quality');
      if (savedQuality) {
        setQuality(savedQuality);
        qualityRef.current = savedQuality;
      }

      const playlistStr = await AsyncStorage.getItem('player_playlist');
      const indexStr = await AsyncStorage.getItem('player_current_index');

      if (playlistStr) {
        const pl: PlaylistItem[] = JSON.parse(playlistStr);
        setPlaylist(pl);
        playlistRef.current = pl;

        const idx = indexStr ? parseInt(indexStr, 10) : parseInt(params.currentIndex || '0', 10);
        setCurrentIndex(idx);
        currentIndexRef.current = idx;

        if (pl[idx]) {
          const url = pl[idx].url;
          // Only replace if different from what was passed in params
          if (url !== params.url) {
            loadedUrlRef.current = url;
            try { player.pause(); } catch {}
            player.replace(url);
          } else {
            loadedUrlRef.current = url;
          }
          setCurrentItem({ url, title: pl[idx].name });
          if (isPlayerOpenRef.current) {
            try { player.play(); } catch {}
            setIsPlaying(true);
          }
        }
      } else {
        loadedUrlRef.current = params.url || '';
      }
    };
    init();
  }, []);

  // ── Listen for available audio/subtitle tracks ───────────────────────────
  useEffect(() => {
    const sub = player.addListener('availableAudioTracksChange', (payload: any) => {
      const tracks = payload?.availableAudioTracks ?? [];
      setAudioTracks(tracks);
      if (tracks.length > 0 && !selectedAudioId) {
        setSelectedAudioId(tracks[0].id);
      }
    });
    const sub2 = player.addListener('availableSubtitleTracksChange', (payload: any) => {
      const tracks = payload?.availableSubtitleTracks ?? [];
      setSubtitleTracks(tracks);
    });
    return () => { sub.remove(); sub2.remove(); };
  }, [player]);

  const handleSelectAudioTrack = (track: {id: string; label: string; language: string}) => {
    try {
      player.audioTrack = track as any;
      setSelectedAudioId(track.id);
    } catch {}
    setShowAudioMenu(false);
    setShowControls(true);
    resetControlsTimer();
  };

  const handleSelectSubtitleTrack = (track: {id: string; label: string; language: string} | null) => {
    try {
      player.subtitleTrack = track as any;
      setSelectedSubId(track?.id ?? null);
    } catch {}
    setShowSubMenu(false);
    setShowControls(true);
    resetControlsTimer();
  };

  // ── Poll current time for VOD progress bar ─────────────────────────────────
  useEffect(() => {
    if (isLive) return; // No progress bar for live

    timePollerRef.current = setInterval(() => {
      try {
        const ct = player.currentTime ?? 0;
        const dur = player.duration ?? 0;
        setCurrentTime(ct);
        if (dur > 0) setDuration(dur);
        setIsPlaying(player.playing);
      } catch {}
    }, 500);

    return () => {
      if (timePollerRef.current) clearInterval(timePollerRef.current);
    };
  }, [isLive, player]);

  // ── Auto-hide controls ─────────────────────────────────────────────────────
  // On TV, give a much longer window before auto-hiding — the user is
  // navigating between buttons with D-pad arrows (a few presses to get
  // from Play/Pause to the +10s button, for example), which takes
  // noticeably longer than a single tap on phone.
  const resetControlsTimer = useCallback(() => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), device.isTV ? 12000 : 5000);
  }, [device.isTV]);

  useEffect(() => {
    if (showControls) resetControlsTimer();
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [showControls, resetControlsTimer]);

  // ── Android back button ────────────────────────────────────────────────────
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showChannelList) { setShowChannelList(false); return true; }
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [showChannelList]);

  // ── Core navigation: replace stream instantly, no audio overlap ────────────
  // Guards against the rapid-tap race condition: if the user selects channel
  // B while channel A is still mid-replace(), the stale A callback must not
  // unmute/play over B. We do this with a token instead of a fixed delay,
  // because requestAnimationFrame only waits one JS frame — it does not wait
  // for the native ExoPlayer source swap to actually finish.
  const navigateTo = useCallback((index: number) => {
    const pl = playlistRef.current;
    if (!pl.length || index < 0 || index >= pl.length) return;
    const item = pl[index];
    const url = item.url;

    // Prevent double-loading the same URL
    if (loadedUrlRef.current === url) return;
    loadedUrlRef.current = url;

    // Invalidate any in-flight switch from a previous tap
    const myToken = ++switchTokenRef.current;

    setCurrentIndex(index);
    currentIndexRef.current = index;
    setCurrentItem({ url, title: item.name });

    // Reset VOD progress
    setCurrentTime(0);
    setDuration(0);

    // Mute + pause the old source immediately so it can never be heard
    // again, regardless of how the swap below resolves.
    try {
      player.pause();
      player.muted = true;
    } catch {}

    // Wait for the new source to actually report ready before unmuting and
    // playing. If another navigateTo() call happened in the meantime
    // (myToken no longer matches), skip play/unmute entirely — the newer
    // call owns playback now.
    let settled = false;
    const finish = (statusSub: { remove: () => void } | null) => {
      if (settled) return;
      settled = true;
      statusSub?.remove();
      if (switchTokenRef.current !== myToken) return; // a newer switch took over
      if (!isPlayerOpenRef.current) return;
      try {
        player.muted = false;
        player.play();
        setIsPlaying(true);
        setShowControls(true);
        resetControlsTimer();
      } catch {}
    };

    try {
      player.replace(url);
    } catch {
      finish(null);
      return;
    }

    const statusSub = player.addListener('statusChange', (payload: any) => {
      const status = payload?.status ?? payload;
      if (status === 'readyToPlay' || status === 'error') {
        finish(statusSub);
      }
    });

    // Safety fallback in case statusChange never fires on this platform/SDK
    // build — don't leave the new channel silent forever.
    setTimeout(() => finish(statusSub), 4000);
  }, [player, resetControlsTimer]);

  const handleNext = useCallback(() => {
    const idx = currentIndexRef.current;
    const pl = playlistRef.current;
    if (pl.length > 0 && idx < pl.length - 1) navigateTo(idx + 1);
  }, [navigateTo]);

  const handlePrev = useCallback(() => {
    const idx = currentIndexRef.current;
    const pl = playlistRef.current;
    if (pl.length > 0 && idx > 0) navigateTo(idx - 1);
  }, [navigateTo]);

  // ── Auto-advance for series ────────────────────────────────────────────────
  useEffect(() => {
    if (contentType !== 'series') return;
    const sub = player.addListener('playToEnd', () => handleNext());
    return () => sub.remove();
  }, [player, contentType, handleNext]);

  // ── Seek (VOD only) ────────────────────────────────────────────────────────
  const handleSeek = useCallback((seconds: number) => {
    if (isLive) return;
    try {
      player.seekBy(seconds - (player.currentTime ?? 0));
      setCurrentTime(seconds);
    } catch {}
  }, [player, isLive]);

  const handleSkip = useCallback((delta: number) => {
    if (isLive) return;
    try {
      player.seekBy(delta);
      setCurrentTime(prev => Math.max(0, Math.min(prev + delta, duration)));
    } catch {}
    setShowControls(true);
    resetControlsTimer();
  }, [player, isLive, duration, resetControlsTimer]);

  // ── Play / Pause toggle ────────────────────────────────────────────────────
  const handlePlayPause = useCallback(() => {
    if (player.playing) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
    setShowControls(true);
    resetControlsTimer();
  }, [player, resetControlsTimer]);

  // ── TV remote key handler ──────────────────────────────────────────────────
  // Scroll channel list to keep focused item visible
  const scrollToFocused = useCallback((idx: number) => {
    if (idx >= 0) {
      (channelListRef.current as any)?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    }
  }, []);

  // ── Android TV native remote handler via BackHandler ─────────────────────
  // Android TV sends key events as BackHandler events for BACK key,
  // and as onFocus/onPress for D-pad. For CH+/CH- and MENU we use
  // a BackHandler override + web keydown fallback for web preview.
  useEffect(() => {
    if (!device.isTV) return;

    // BackHandler handles the hardware BACK key on Android TV
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showChannelList) {
        setShowChannelList(false);
        setFocusedChannelIndex(-1);
        return true; // consumed
      }
      if (isLocked) {
        // Back key does nothing when screen is locked
        return true;
      }
      return false; // let default back navigation happen
    });

    // Web / TV emulator fallback: keydown events
    const handleKeyDown = (e: any) => {
      const kc = e.keyCode;

      if (showChannelList) {
        const pl = playlistRef.current;
        if (kc === 40 || kc === 228) { // Down / CH+
          const next = Math.min((focusedChannelIndex < 0 ? currentIndexRef.current : focusedChannelIndex) + 1, pl.length - 1);
          setFocusedChannelIndex(next);
          scrollToFocused(next);
          e.preventDefault?.();
          return;
        }
        if (kc === 38 || kc === 227) { // Up / CH-
          const prev = Math.max((focusedChannelIndex < 0 ? currentIndexRef.current : focusedChannelIndex) - 1, 0);
          setFocusedChannelIndex(prev);
          scrollToFocused(prev);
          e.preventDefault?.();
          return;
        }
        if (kc === 13 || kc === 23 || kc === 85) { // Enter / DPAD_CENTER / OK
          const idx = focusedChannelIndex >= 0 ? focusedChannelIndex : currentIndexRef.current;
          navigateTo(idx);
          setShowChannelList(false);
          setFocusedChannelIndex(-1);
          return;
        }
        if (kc === 8 || kc === 4) { // Back
          setShowChannelList(false);
          setFocusedChannelIndex(-1);
          return;
        }
      }

      // Normal playback controls
      if (kc === 166 || kc === 33) { handleNext(); setShowControls(true); }        // CH+ / PgUp
      else if (kc === 167 || kc === 34) { handlePrev(); setShowControls(true); }   // CH- / PgDn
      else if (kc === 164 || kc === 82) {                                           // Menu / Guide
        setShowChannelList(prev => {
          const opening = !prev;
          if (opening) setFocusedChannelIndex(currentIndexRef.current);
          else setFocusedChannelIndex(-1);
          return opening;
        });
        setShowControls(true);
      }
      else if (kc === 85 || kc === 179 || kc === 13 || kc === 23) { handlePlayPause(); }
      else if (kc === 89 || kc === 228) { handleSkip(10); }
      else if (kc === 88 || kc === 227) { handleSkip(-10); }
      else if (kc === 40) { handleNext(); setShowControls(true); }
      else if (kc === 38) { handlePrev(); setShowControls(true); }
    };

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      backSub.remove();
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('keydown', handleKeyDown);
      }
    };
  }, [device.isTV, showChannelList, focusedChannelIndex, isLocked, handleNext, handlePrev, handlePlayPause, handleSkip, navigateTo, scrollToFocused]);

  // ── Native Android TV remote keys (CH+/CH-/Play/Menu) ──────────────────────
  // Hardware remote keys (channel +/-, media play/pause) are NOT delivered to
  // window.keydown on a real Android TV build — they need a native key-event
  // bridge. We load `react-native-keyevent` DEFENSIVELY: if it's installed the
  // native shortcuts work on a real remote; if not, this is a safe no-op and
  // the web keydown handler above still covers the browser/emulator preview.
  useEffect(() => {
    if (!device.isTV || Platform.OS !== 'android') return;
    let KeyEvent: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('react-native-keyevent');
      KeyEvent = mod?.default ?? mod;
    } catch {
      return; // module not installed — native shortcuts unavailable (web handler still works)
    }
    if (!KeyEvent?.onKeyDownListener) return;

    KeyEvent.onKeyDownListener((e: any) => {
      const kc = e?.keyCode;
      if (kc == null || isLocked) return;
      if (kc === 166 || kc === 33) { handleNext(); setShowControls(true); }          // CH+
      else if (kc === 167 || kc === 34) { handlePrev(); setShowControls(true); }     // CH-
      else if (kc === 85 || kc === 179 || kc === 126 || kc === 127) { handlePlayPause(); } // Play / Pause / Media
      else if (kc === 164 || kc === 82) {                                            // Menu / Guide
        setShowChannelList(prev => {
          const opening = !prev;
          setFocusedChannelIndex(opening ? currentIndexRef.current : -1);
          return opening;
        });
        setShowControls(true);
      }
      else if (kc === 89) { handleSkip(-10); }                                       // Rewind
      else if (kc === 90) { handleSkip(10); }                                        // Fast-forward
    });

    return () => {
      try { KeyEvent.removeKeyDownListener?.(); } catch {}
    };
  }, [device.isTV, isLocked, handleNext, handlePrev, handlePlayPause, handleSkip]);

  // ── Quality ────────────────────────────────────────────────────────────────
  const changeQuality = (q: string) => {
    setQuality(q);
    qualityRef.current = q;
    AsyncStorage.setItem('simastream_video_quality', q);
  };

  const handleQualityPress = () => {
    Alert.alert('Video Quality', 'Select quality', [
      { text: 'Auto (Recommended)', onPress: () => changeQuality('Auto') },
      { text: 'HD (1080p)', onPress: () => changeQuality('HD') },
      { text: 'SD (720p)', onPress: () => changeQuality('SD') },
      { text: 'Low (480p)', onPress: () => changeQuality('Low') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ── Screen lock ────────────────────────────────────────────────────────────
  const handleLock = useCallback(() => {
    setIsLocked(true);
    setShowControls(false);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
  }, []);

  const handleUnlock = useCallback(() => {
    setIsLocked(false);
    setShowControls(true);
    resetControlsTimer();
  }, [resetControlsTimer]);

  // ── PiP (built-in "exo" engine only) ───────────────────────────────────────
  // Guarded so it can NEVER crash the app: we bail out early if PiP is not
  // supported, and we swallow any native rejection. Previously an unguarded
  // startPictureInPicture() call on a build whose manifest lacked PiP support
  // threw a native exception that killed the whole app.
  const handlePiP = useCallback(async () => {
    if (!pipSupported) return;
    try {
      await videoViewRef.current?.startPictureInPicture();
    } catch (e) {
      // PiP unavailable right now — degrade gracefully, don't crash.
    }
  }, [pipSupported]);

  // ── Back ───────────────────────────────────────────────────────────────────
  // Never throw out of the back handler — a raw router.back() with an empty
  // history stack was surfacing the ErrorBoundary ("Something went wrong").
  const handleBack = () => {
    try { player.pause(); } catch {}
    if (timePollerRef.current) clearInterval(timePollerRef.current);
    try {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch {}
  };

  // ── Screen tap ────────────────────────────────────────────────────────────
  // Toggle controls visibility. When showing, always restart the auto-hide
  // timer so controls disappear after 5 s of inactivity.
  // When locked, taps do nothing (lock icon handles unlock via long press).
  const handleScreenTap = useCallback(() => {
    if (isLocked) return;
    setShowControls(prev => {
      const next = !prev;
      if (next) {
        // Restart timer every time controls become visible
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = setTimeout(() => setShowControls(false), 5000);
      }
      return next;
    });
  }, [isLocked]);

  // ── Guard ──────────────────────────────────────────────────────────────────
  if (!params.url && !currentItem.url) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={SimaColors.error} />
          <Text style={styles.errorText}>No stream URL provided</Text>
          <Pressable
          focusable={true} onPress={() => router.back()}
            onFocus={() => setFocusedControlId('errBack')}
            onBlur={() => setFocusedControlId(null)}
            style={[styles.backBtnError, focusedControlId === 'errBack' && styles.controlBtnFocused]}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const hasPrev = playlist.length > 0 && currentIndex > 0;
  const hasNext = playlist.length > 0 && currentIndex < playlist.length - 1;
  const navLabel = isLive ? { prev: 'CH-', next: 'CH+' } : { prev: 'Prev', next: 'Next' };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* ── Video surface ── */}
      <VideoView
        ref={videoViewRef}
        style={styles.video}
        player={player}
        allowsFullscreen
        allowsPictureInPicture
        contentFit="contain"
        nativeControls={false}
      />

      {/* ── Tap overlay (above video, below controls) ── */}
      {/* Separate from VideoView so Android native surface never swallows taps */}
      <Pressable
          focusable={true}
        style={[StyleSheet.absoluteFill, { zIndex: 1, pointerEvents: showAudioMenu || showSubMenu ? 'none' : 'auto' }] as any}
        onPress={handleScreenTap}
      />

      {/* ── Controls overlay ── */}
      {showControls && (
        <>
          {/* Top header */}
          <View style={[styles.headerOverlay, { paddingTop: insets.top + 8 }]}>
            <Pressable
          focusable={true}
              onPress={handleBack}
              onFocus={() => setFocusedControlId('topBack')}
              onBlur={() => setFocusedControlId(null)}
              style={[styles.controlBtn, device.isTV && styles.controlBtnTV, focusedControlId === 'topBack' && styles.controlBtnFocused]}
              hasTVPreferredFocus={device.isTV}
            >
              <Ionicons name="arrow-back" size={device.isTV ? 32 : 22} color="#fff" />
            </Pressable>

            <Text style={[styles.headerTitle, device.isTV && { fontSize: 22, fontWeight: '700' }]} numberOfLines={1}>
              {currentItem.title}
            </Text>

            {/* LIVE badge */}
            {isLive && (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            )}

            {/* Channel counter */}
            {playlist.length > 0 && (
              <Text style={[styles.channelCounter, device.isTV && { fontSize: 18 }]}>
                {currentIndex + 1}/{playlist.length}
              </Text>
            )}

            {/* Quality */}
            <Pressable
          focusable={true}
              onPress={handleQualityPress}
              onFocus={() => setFocusedControlId('quality')}
              onBlur={() => setFocusedControlId(null)}
              style={[styles.qualityButton, device.isTV && { paddingHorizontal: 14, paddingVertical: 8 }, focusedControlId === 'quality' && styles.controlBtnFocused]}
            >
              <Ionicons name="speedometer-outline" size={device.isTV ? 20 : 14} color="#fff" />
              <Text style={[styles.qualityText, device.isTV && { fontSize: 16 }]}>{quality}</Text>
            </Pressable>

            {/* Audio track button */}
            {audioTracks.length > 1 && (
              <Pressable
          focusable={true}
                onPress={() => { setShowAudioMenu(prev => !prev); setShowSubMenu(false); setShowControls(true); resetControlsTimer(); }}
                onFocus={() => setFocusedControlId('audio')}
                onBlur={() => setFocusedControlId(null)}
                style={[styles.qualityButton, showAudioMenu && { backgroundColor: 'rgba(74,144,217,0.5)' }, device.isTV && { paddingHorizontal: 14, paddingVertical: 8 }, focusedControlId === 'audio' && styles.controlBtnFocused]}
              >
                <Ionicons name="musical-notes-outline" size={device.isTV ? 20 : 14} color="#fff" />
                <Text style={[styles.qualityText, device.isTV && { fontSize: 16 }]}>Audio</Text>
              </Pressable>
            )}

            {/* Subtitle track button */}
            {subtitleTracks.length > 0 && (
              <Pressable
          focusable={true}
                onPress={() => { setShowSubMenu(prev => !prev); setShowAudioMenu(false); setShowControls(true); resetControlsTimer(); }}
                onFocus={() => setFocusedControlId('sub')}
                onBlur={() => setFocusedControlId(null)}
                style={[styles.qualityButton, showSubMenu && { backgroundColor: 'rgba(74,144,217,0.5)' }, device.isTV && { paddingHorizontal: 14, paddingVertical: 8 }, focusedControlId === 'sub' && styles.controlBtnFocused]}
              >
                <Ionicons name="text-outline" size={device.isTV ? 20 : 14} color={selectedSubId ? '#F5A623' : '#fff'} />
                <Text style={[styles.qualityText, device.isTV && { fontSize: 16 }, selectedSubId && { color: '#F5A623' }]}>CC</Text>
              </Pressable>
            )}

            {/* Channel list toggle */}
            {playlist.length > 0 && (
              <Pressable
          focusable={true}
                onPress={() => setShowChannelList(prev => !prev)}
                onFocus={() => setFocusedControlId('chlist')}
                onBlur={() => setFocusedControlId(null)}
                style={[styles.controlBtn, device.isTV && styles.controlBtnTV, focusedControlId === 'chlist' && styles.controlBtnFocused]}
              >
                <Ionicons name="list" size={device.isTV ? 32 : 22} color={showChannelList ? SimaColors.accent : '#fff'} />
              </Pressable>
            )}

            {/* PiP button — only when the built-in engine actually supports PiP.
                Hidden on TV (no PiP there) and when unsupported, so the user
                never sees a dead/crashing button. */}
            {Platform.OS !== 'web' && pipSupported && !device.isTV && (
              <Pressable
          focusable={true}
                onPress={handlePiP}
                onFocus={() => setFocusedControlId('pip')}
                onBlur={() => setFocusedControlId(null)}
                style={[styles.controlBtn, focusedControlId === 'pip' && styles.controlBtnFocused]}
              >
                <MaterialIcons name="picture-in-picture-alt" size={20} color="#fff" />
              </Pressable>
            )}

            {/* Lock button */}
            <Pressable
          focusable={true}
              onPress={handleLock}
              onFocus={() => setFocusedControlId('lock')}
              onBlur={() => setFocusedControlId(null)}
              style={[styles.controlBtn, device.isTV && styles.controlBtnTV, focusedControlId === 'lock' && styles.controlBtnFocused]}
            >
              <Ionicons name="lock-open-outline" size={device.isTV ? 28 : 20} color="#fff" />
            </Pressable>
          </View>

          {/* ── VOD: Progress bar + skip buttons ── */}
          {!isLive && (
            <View style={[styles.vodControls, { paddingBottom: insets.bottom + (device.isTV ? 24 : 12) }]}>
              {/* Skip -10s / Play-Pause / Skip +10s */}
              <View style={styles.vodCenterRow}>
                {/* Prev episode */}
                {hasPrev && (
                  <Pressable
          focusable={true}
                    onPress={handlePrev}
                    onFocus={() => setFocusedControlId('prev')}
                    onBlur={() => setFocusedControlId(null)}
                    style={[styles.skipBtn, focusedControlId === 'prev' && styles.controlBtnFocused]}>
                    <Ionicons name="play-skip-back" size={device.isTV ? 36 : 24} color="#fff" />
                    <Text style={styles.skipLabel}>{navLabel.prev}</Text>
                  </Pressable>
                )}

                {/* -10s */}
                <Pressable
          focusable={true}
                  onPress={() => handleSkip(-10)}
                  onFocus={() => setFocusedControlId('skipBack')}
                  onBlur={() => setFocusedControlId(null)}
                  style={[styles.skipBtn, focusedControlId === 'skipBack' && styles.controlBtnFocused]}>
                  <Ionicons name="play-back" size={device.isTV ? 36 : 28} color="#fff" />
                  <Text style={styles.skipLabel}>10s</Text>
                </Pressable>

                {/* Play / Pause */}
                <Pressable
          focusable={true}
                  onPress={handlePlayPause}
                  onFocus={() => setFocusedControlId('playPause')}
                  onBlur={() => setFocusedControlId(null)}
                  style={[
                    styles.playPauseBtn,
                    device.isTV && { width: 80, height: 80, borderRadius: 40 },
                    focusedControlId === 'playPause' && styles.controlBtnFocused,
                  ]}
                  hasTVPreferredFocus={device.isTV}
                >
                  <Ionicons name={isPlaying ? 'pause' : 'play'} size={device.isTV ? 48 : 36} color="#fff" />
                </Pressable>

                {/* +10s */}
                <Pressable
          focusable={true}
                  onPress={() => handleSkip(10)}
                  onFocus={() => setFocusedControlId('skipFwd')}
                  onBlur={() => setFocusedControlId(null)}
                  style={[styles.skipBtn, focusedControlId === 'skipFwd' && styles.controlBtnFocused]}>
                  <Ionicons name="play-forward" size={device.isTV ? 36 : 28} color="#fff" />
                  <Text style={styles.skipLabel}>10s</Text>
                </Pressable>

                {/* Next episode */}
                {hasNext && (
                  <Pressable
          focusable={true}
                    onPress={handleNext}
                    onFocus={() => setFocusedControlId('next')}
                    onBlur={() => setFocusedControlId(null)}
                    style={[styles.skipBtn, focusedControlId === 'next' && styles.controlBtnFocused]}>
                    <Ionicons name="play-skip-forward" size={device.isTV ? 36 : 24} color="#fff" />
                    <Text style={styles.skipLabel}>{navLabel.next}</Text>
                  </Pressable>
                )}
              </View>

              {/* Progress bar */}
              <ProgressBar
                currentTime={currentTime}
                duration={duration}
                onSeek={handleSeek}
                isTV={device.isTV}
              />
            </View>
          )}

          {/* ── LIVE: Bottom CH- / Play-Pause / CH+ ── */}
          {isLive && (
            <View style={[styles.bottomControls, { paddingBottom: insets.bottom + (device.isTV ? 32 : 16) }]}>
              <Pressable
          focusable={true}
                onPress={handlePrev}
                onFocus={() => setFocusedControlId('chDown')}
                onBlur={() => setFocusedControlId(null)}
                style={[styles.navBtn, !hasPrev && styles.navBtnDisabled, device.isTV && styles.navBtnTV, focusedControlId === 'chDown' && styles.controlBtnFocused]}
                disabled={!hasPrev}
              >
                <Ionicons name="play-skip-back" size={device.isTV ? 36 : 22} color={hasPrev ? '#fff' : 'rgba(255,255,255,0.3)'} />
                <Text style={[styles.navBtnText, !hasPrev && styles.navBtnTextDisabled, device.isTV && { fontSize: 18 }]}>
                  CH-
                </Text>
              </Pressable>

              <Pressable
          focusable={true}
                onPress={handlePlayPause}
                onFocus={() => setFocusedControlId('playPauseLive')}
                onBlur={() => setFocusedControlId(null)}
                style={[styles.playPauseBtn, device.isTV && { width: 80, height: 80, borderRadius: 40 }, focusedControlId === 'playPauseLive' && styles.controlBtnFocused]}
                hasTVPreferredFocus={device.isTV}
              >
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={device.isTV ? 48 : 32} color="#fff" />
              </Pressable>

              <Pressable
          focusable={true}
                onPress={handleNext}
                onFocus={() => setFocusedControlId('chUp')}
                onBlur={() => setFocusedControlId(null)}
                style={[styles.navBtn, !hasNext && styles.navBtnDisabled, device.isTV && styles.navBtnTV, focusedControlId === 'chUp' && styles.controlBtnFocused]}
                disabled={!hasNext}
              >
                <Text style={[styles.navBtnText, !hasNext && styles.navBtnTextDisabled, device.isTV && { fontSize: 18 }]}>
                  CH+
                </Text>
                <Ionicons name="play-skip-forward" size={device.isTV ? 36 : 22} color={hasNext ? '#fff' : 'rgba(255,255,255,0.3)'} />
              </Pressable>
            </View>
          )}
        </>
      )}

      {/* ── Screen lock overlay — always rendered when locked ── */}
      {isLocked && (
        <Pressable
          focusable={true}
          style={styles.lockOverlay}
          onLongPress={handleUnlock}
          delayLongPress={1500}
        >
          <View style={styles.lockIconContainer}>
            <Ionicons name="lock-closed" size={28} color="#fff" />
            <Text style={styles.lockHint}>Hold to unlock</Text>
          </View>
        </Pressable>
      )}

      {/* ── Audio track menu ── */}
      {showAudioMenu && audioTracks.length > 1 && (
        <View style={styles.trackMenu}>
          <Text style={styles.trackMenuTitle}>Audio Track</Text>
          {audioTracks.map(track => (
            <Pressable
          focusable={true}
              key={track.id}
              onPress={() => handleSelectAudioTrack(track)}
              onFocus={() => setFocusedControlId('audio_' + track.id)}
              onBlur={() => setFocusedControlId(null)}
              style={[styles.trackItem, selectedAudioId === track.id && styles.trackItemActive, focusedControlId === 'audio_' + track.id && styles.controlBtnFocused]}
            >
              <Ionicons
                name={selectedAudioId === track.id ? 'radio-button-on' : 'radio-button-off'}
                size={16}
                color={selectedAudioId === track.id ? '#F5A623' : 'rgba(255,255,255,0.6)'}
              />
              <Text style={[styles.trackItemText, selectedAudioId === track.id && { color: '#F5A623', fontWeight: '700' }]}>
                {track.label || track.language || `Track ${track.id}`}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* ── Subtitle track menu ── */}
      {showSubMenu && subtitleTracks.length > 0 && (
        <View style={styles.trackMenu}>
          <Text style={styles.trackMenuTitle}>Subtitles</Text>
          <Pressable
          focusable={true}
            onPress={() => handleSelectSubtitleTrack(null)}
            onFocus={() => setFocusedControlId('sub_off')}
            onBlur={() => setFocusedControlId(null)}
            style={[styles.trackItem, !selectedSubId && styles.trackItemActive, focusedControlId === 'sub_off' && styles.controlBtnFocused]}
          >
            <Ionicons
              name={!selectedSubId ? 'radio-button-on' : 'radio-button-off'}
              size={16}
              color={!selectedSubId ? '#F5A623' : 'rgba(255,255,255,0.6)'}
            />
            <Text style={[styles.trackItemText, !selectedSubId && { color: '#F5A623', fontWeight: '700' }]}>Off</Text>
          </Pressable>
          {subtitleTracks.map(track => (
            <Pressable
          focusable={true}
              key={track.id}
              onPress={() => handleSelectSubtitleTrack(track)}
              onFocus={() => setFocusedControlId('sub_' + track.id)}
              onBlur={() => setFocusedControlId(null)}
              style={[styles.trackItem, selectedSubId === track.id && styles.trackItemActive, focusedControlId === 'sub_' + track.id && styles.controlBtnFocused]}
            >
              <Ionicons
                name={selectedSubId === track.id ? 'radio-button-on' : 'radio-button-off'}
                size={16}
                color={selectedSubId === track.id ? '#F5A623' : 'rgba(255,255,255,0.6)'}
              />
              <Text style={[styles.trackItemText, selectedSubId === track.id && { color: '#F5A623', fontWeight: '700' }]}>
                {track.label || track.language || `Track ${track.id}`}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* ── Channel list side panel ── */}
      {showChannelList && playlist.length > 0 && (
        <ChannelPanel
          playlist={playlist}
          currentIndex={currentIndex}
          focusedChannelIndex={focusedChannelIndex}
          isLive={isLive}
          contentType={contentType}
          insetTop={insets.top + 60}
          channelListRef={channelListRef}
          onSelect={(index) => { navigateTo(index); setShowChannelList(false); setFocusedChannelIndex(-1); }}
          onClose={() => { setShowChannelList(false); setFocusedChannelIndex(-1); }}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  video: { flex: 1, width: '100%', height: '100%' },

  // ── Header ──
  headerOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    zIndex: 2,
  },
  controlBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  controlBtnTV: { width: 56, height: 56, borderRadius: 28 },
  headerTitle: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  channelCounter: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  qualityButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 12,
  },
  qualityText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  // ── LIVE badge ──
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(220,38,38,0.9)',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  // ── LIVE bottom controls ──
  bottomControls: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.75)',
    zIndex: 2,
  },
  navBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 12,
  },
  navBtnTV: { paddingHorizontal: 24, paddingVertical: 16, borderRadius: 16, gap: 10 },
  navBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.05)' },
  navBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  navBtnTextDisabled: { color: 'rgba(255,255,255,0.3)' },

  // ── Play/Pause button ──
  playPauseBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
  },

  // ── VOD controls ──
  vodControls: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.75)',
    gap: 12,
    zIndex: 2,
  },
  vodCenterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  skipBtn: {
    alignItems: 'center', justifyContent: 'center', gap: 2,
    minWidth: 44,
  },
  skipLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '600' },
  // Visual focus highlight for D-pad navigation — same gold-glow look
  // used for focus elsewhere in the app (TV Home screen tiles, etc.),
  // applied here on top of whatever the button's own style already is.
  controlBtnFocused: {
    borderWidth: 3,
    borderColor: '#F5A623',
    borderRadius: 12,
    backgroundColor: 'rgba(245,166,35,0.25)',
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 12,
  },

  // ── Progress bar ──
  progressWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  timeLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '500', minWidth: 42, textAlign: 'center' },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    position: 'relative',
    justifyContent: 'center',
  },
  progressBuffered: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
  },
  progressPlayed: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    backgroundColor: '#F5A623',
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    width: 14, height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    marginLeft: -7,
    marginTop: -5,
    top: '50%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
    elevation: 3,
  },

  // ── Channel list panel ──
  channelPanel: {
    position: 'absolute',
    top: 0, right: 0, bottom: 0,
    width: 240,
    backgroundColor: 'rgba(10,14,26,0.96)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.1)',
  },
  channelPanelTitle: {
    color: '#fff', fontSize: 14, fontWeight: '700',
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  channelItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
    gap: 8, height: 44,
  },
  channelItemActive: { backgroundColor: 'rgba(74,144,217,0.25)' },
  channelItemFocused: {
    backgroundColor: 'rgba(245,166,35,0.2)',
    borderLeftWidth: 3,
    borderLeftColor: '#F5A623',
    transform: [{ scaleX: 1.02 }],
  },
  channelNum: { color: 'rgba(255,255,255,0.4)', fontSize: 11, width: 24, textAlign: 'right' },
  channelName: { flex: 1, color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '500' },
  channelNameActive: { color: '#F5A623', fontWeight: '700' },
  channelPanelHeader: {
    flexDirection: 'row' as const, alignItems: 'center' as const,
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  channelPanelClose: { padding: 4, marginLeft: 4 },
  channelSearchBar: {
    flexDirection: 'row' as const, alignItems: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 8, marginVertical: 6,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
    gap: 6,
  },
  channelSearchInput: {
    flex: 1, color: '#fff', fontSize: 12,
    paddingVertical: 0,
  },

  // ── Track menus ──
  trackMenu: {
    position: 'absolute',
    top: 60,
    right: 12,
    minWidth: 200,
    backgroundColor: 'rgba(10,14,26,0.97)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
    zIndex: 100,
  },
  trackMenuTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    textTransform: 'uppercase',
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  trackItemActive: { backgroundColor: 'rgba(245,166,35,0.1)' },
  trackItemText: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },

  // ── Lock overlay ──
  lockOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 10,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    paddingTop: 40,
    paddingRight: 16,
  },
  lockIconContainer: {
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  lockHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    fontWeight: '500',
  },

  // ── Error ──
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: SimaColors.bg },
  errorText: { color: SimaColors.error, fontSize: 16, textAlign: 'center' },
  backBtnError: { backgroundColor: SimaColors.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 },
  backButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
