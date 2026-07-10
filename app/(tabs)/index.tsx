import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
  Alert,
  FlatList,
  Image,
  ScrollView,
  Linking,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SimaColors, APP_INFO } from '@/constants/theme';
import { useXtream } from '@/lib/xtream-context';
import xtreamAPI, { XtreamVOD, XtreamSeries, XtreamStream, isSportsChannelName } from '@/lib/xtream-api';
import { useDevice } from '@/hooks/use-device';
import { TVHomeScreen } from '@/components/sima/TVHomeScreen';
import { historyService, HistoryRecord } from '@/lib/history-service';
import { openPlayerOnce } from '@/lib/player-navigation';
import { getChannelEpg } from '@/lib/epg-service';
import UserAvatar from '@/components/sima/UserAvatar';

// ── Types ────────────────────────────────────────────────────────────────────
type BannerItem =
  | { kind: 'movie'; data: XtreamVOD }
  | { kind: 'series'; data: XtreamSeries };

type BottomIcon = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  route?: string;
  onPress?: () => void;
  isWhatsApp?: boolean;
};

// ── Reusable poster card for horizontal rows ────────────────────────────────
function PosterCard({
  name, image, fallbackIcon, width, height, fontSm, onPress, badge,
}: {
  name: string; image?: string | null; fallbackIcon: keyof typeof Ionicons.glyphMap;
  width: number; height: number; fontSm: number; onPress: () => void; badge?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <TouchableOpacity
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.recentItem, { width }, focused && styles.recentItemFocused]}
      activeOpacity={0.8}
    >
      <View style={{ width, height, borderRadius: 8, overflow: 'hidden' }}>
        {image ? (
          <Image source={{ uri: image }} style={{ width, height }} resizeMode="cover" />
        ) : (
          <View style={{ width, height, backgroundColor: SimaColors.bgCardDark, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={fallbackIcon} size={24} color={SimaColors.textMuted} />
          </View>
        )}
        {badge}
      </View>
      <Text style={[styles.recentName, { fontSize: fontSm }]} numberOfLines={1}>{name}</Text>
    </TouchableOpacity>
  );
}

// Live channel row (used in the horizontal "Live Channels" section)
function ChannelCard({
  item, width, onPress,
}: { item: XtreamStream; width: number; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const epg = item.epg_channel_id ? getChannelEpg(item.epg_channel_id) : { current: null, next: null };
  return (
    <TouchableOpacity
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.channelCard, { width }, focused && styles.recentItemFocused]}
      activeOpacity={0.8}
    >
      {item.stream_icon ? (
        <Image source={{ uri: item.stream_icon }} style={styles.channelCardIcon} resizeMode="contain" />
      ) : (
        <View style={[styles.channelCardIcon, styles.channelCardIconPlaceholder]}>
          <Ionicons name="tv-outline" size={20} color={SimaColors.textMuted} />
        </View>
      )}
      <Text style={styles.channelCardName} numberOfLines={1}>{item.name}</Text>
      {epg.current && (
        <Text style={styles.channelCardProgramme} numberOfLines={1}>{epg.current.title}</Text>
      )}
    </TouchableOpacity>
  );
}

// Bottom horizontal icon bar — full screen width, easy to tap on phone.
// Per Naji's final decision: staying with this layout permanently, no
// more switching back to the side rail.
function BottomIconBar({ items }: { items: BottomIcon[] }) {
  const router = useRouter();
  const [focusedId, setFocusedId] = useState<string | null>(null);

  return (
    <View style={styles.bottomBar}>
      {items.map((item) => {
        const isFocused = focusedId === item.id;
        return (
          <TouchableOpacity
            key={item.id}
            onPress={() => {
              if (item.onPress) item.onPress();
              else if (item.route) router.push(item.route as any);
            }}
            onFocus={() => setFocusedId(item.id)}
            onBlur={() => setFocusedId(null)}
            style={[
              styles.bottomBarBtn,
              isFocused && styles.bottomBarBtnFocused,
            ]}
            activeOpacity={0.8}
          >
            <Ionicons
              name={item.icon}
              size={18}
              color={item.isWhatsApp ? SimaColors.whatsapp : SimaColors.textPrimary}
            />
          </TouchableOpacity>
        );

      })}
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userInfo, credentials, isAuthenticated, logout } = useXtream();
  const device = useDevice();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [recentMovies, setRecentMovies] = useState<XtreamVOD[]>([]);
  const [recentSeries, setRecentSeries] = useState<XtreamSeries[]>([]);
  const [favouriteChannels, setFavouriteChannels] = useState<XtreamStream[]>([]);
  const [continueWatching, setContinueWatching] = useState<HistoryRecord[]>([]);
  const [favouriteSeries, setFavouriteSeries] = useState<XtreamSeries[]>([]);
  const [liveHistoryChannels, setLiveHistoryChannels] = useState<XtreamStream[]>([]);
  const playerOpeningRef = useRef(false);

  // Real counts for Live/Movies/Series/Sports tiles + last watched channel
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [moviesCount, setMoviesCount] = useState<number | null>(null);
  const [seriesCount, setSeriesCount] = useState<number | null>(null);
  const [sportsCount, setSportsCount] = useState<number | null>(null);
  const [lastChannel, setLastChannel] = useState<XtreamStream | null>(null);

  // ── Hero banner state: a single rotating "suggestion" card, no manual
  // arrows/dots — it simply swaps to a new poster every few seconds. ──────
  const [bannerIndex, setBannerIndex] = useState(0);
  const bannerAutoplayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bannerFadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadRecentContent();
    }
  }, [isAuthenticated]);

  const loadRecentContent = async () => {
    try {
      const movies = await xtreamAPI.getVODStreams();
      setMoviesCount(movies.length);
      const sorted = [...movies].sort((a, b) => parseInt(b.added || '0') - parseInt(a.added || '0'));
      setRecentMovies(sorted.slice(0, 20));
    } catch {}
    try {
      const series = await xtreamAPI.getSeries();
      setSeriesCount(series.length);
      const sorted = [...series].sort((a, b) => parseInt(b.last_modified || '0') - parseInt(a.last_modified || '0'));
      setRecentSeries(sorted.slice(0, 20));
    } catch {}
  };

  const loadFavouriteChannels = async () => {
    try {
      const favIds = await xtreamAPI.getFavorites('live');
      const allLive = await xtreamAPI.getLiveStreams();
      setLiveCount(allLive.length);
      setSportsCount(allLive.filter(ch => isSportsChannelName(ch.name)).length);
      if (favIds.length === 0) {
        setFavouriteChannels([]);
      } else {
        // Order by most-recently-favourited first (favIds is oldest→newest
        // since toggleFavorite pushes new ids to the end), not by the
        // server's original channel list order.
        const reversedIds = [...favIds].reverse();
        const ordered = reversedIds
          .map(id => allLive.find(ch => ch.stream_id === id))
          .filter((ch): ch is XtreamStream => !!ch);
        setFavouriteChannels(ordered);
      }
      const liveHistoryIds = await xtreamAPI.getHistory('live');
      if (liveHistoryIds.length > 0) {
        setLastChannel(allLive.find(ch => ch.stream_id === liveHistoryIds[0]) || null);
        // Continue Watching Live: same history list, matched to full channel data
        const ordered = liveHistoryIds
          .map(id => allLive.find(ch => ch.stream_id === id))
          .filter((ch): ch is XtreamStream => !!ch);
        setLiveHistoryChannels(ordered.slice(0, 20));
      } else {
        setLastChannel(null);
        setLiveHistoryChannels([]);
      }
    } catch {
      setFavouriteChannels([]);
    }
  };

  const loadFavouriteSeries = async () => {
    try {
      const favIds = await xtreamAPI.getFavorites('series');
      if (favIds.length === 0) {
        setFavouriteSeries([]);
        return;
      }
      const allSeries = await xtreamAPI.getSeries();
      const favSet = new Set(favIds);
      setFavouriteSeries(allSeries.filter(s => favSet.has(s.series_id)));
    } catch {
      setFavouriteSeries([]);
    }
  };

  const loadContinueWatching = async () => {
    try {
      const all = await historyService.getAll();
      // Movies & series only — live channels have their own
      // "Continue Watching Live" row (sourced from xtreamAPI.getHistory),
      // so they must not leak into this list even though they're now also
      // recorded in historyService (fixed for Watch History last round).
      const moviesAndSeries = all.filter(r => r.content_type === 'movie' || r.content_type === 'series');
      // Dedupe by series — keep only the most-recently-watched record
      // per series_id (getAll() already returns newest-first), so a
      // show with several watched episodes shows as one card, not
      // several confusing duplicates. Movies (no series_id) are never
      // deduped.
      const seenSeries = new Set<number>();
      const deduped: HistoryRecord[] = [];
      for (const record of moviesAndSeries) {
        if (record.series_id == null) {
          deduped.push(record);
          continue;
        }
        if (seenSeries.has(record.series_id)) continue;
        seenSeries.add(record.series_id);
        deduped.push(record);
      }
      setContinueWatching(deduped.slice(0, 20));
    } catch {
      setContinueWatching([]);
    }
  };

  // Refresh whenever Home regains focus (e.g. user favourited a channel
  // on the Live TV screen, then navigated back).
  useFocusEffect(
    React.useCallback(() => {
      if (isAuthenticated) {
        loadFavouriteChannels();
        loadFavouriteSeries();
        loadContinueWatching();
      }
      return () => {};
    }, [isAuthenticated])
  );

  const handleRefresh = () => {
    if (isAuthenticated) {
      loadRecentContent();
      loadFavouriteChannels();
      loadFavouriteSeries();
      loadContinueWatching();
    }
    Alert.alert('Refresh', 'Content refreshed!');
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const formatExpiry = () => {
    if (!userInfo?.exp_date || userInfo.exp_date === '0' || userInfo.exp_date === null) return 'unlimited';
    try {
      const date = new Date(parseInt(userInfo.exp_date) * 1000);
      return date.toLocaleDateString();
    } catch { return 'unlimited'; }
  };

  const navigateTo = (route: string) => router.push(route as any);

  // Responsive dimensions
  const PADDING = 10;
  const GAP = 10;

  // Bottom icon bar: Home, Live, Movies, Series, Favourites, Settings, Logout, WhatsApp
  const bottomIcons: BottomIcon[] = [
    { id: 'home', icon: 'home', onPress: () => {} },
    { id: 'live', icon: 'radio-outline', route: '/live' },
    { id: 'movies', icon: 'film-outline', route: '/movies' },
    { id: 'series', icon: 'play-circle-outline', route: '/series' },
    { id: 'favourites', icon: 'star-outline', route: '/live?filter=favourites' },
    { id: 'settings', icon: 'settings-outline', route: '/settings' },
    { id: 'logout', icon: 'log-out-outline', onPress: handleLogout },
    { id: 'whatsapp', icon: 'logo-whatsapp', isWhatsApp: true, onPress: () => {
      const phone = APP_INFO.phone.replace('+', '');
      Linking.openURL(`https://wa.me/${phone}`);
    } },
  ];

  // Play a movie: write a fresh playlist so the player opens exactly this item.
  const handlePlayMovie = async (item: XtreamVOD, allMovies: XtreamVOD[]) => {
    if (playerOpeningRef.current) return;
    playerOpeningRef.current = true;

    try {
      const playlist = allMovies.map(m => ({
        id: m.stream_id,
        url: xtreamAPI.getVODStreamUrl(m.stream_id, m.container_extension || 'mp4'),
        name: m.name,
      }));
      const idx = allMovies.findIndex(m => m.stream_id === item.stream_id);
      await AsyncStorage.setItem('player_playlist', JSON.stringify(playlist));
      await AsyncStorage.setItem('player_current_index', String(Math.max(0, idx)));
      await historyService.addRecord({
        content_type: 'movie',
        content_id: item.stream_id,
        content_name: item.name,
        content_poster: item.stream_icon,
        playback_position: 0,
        duration: 0,
      });
      await xtreamAPI.addToHistory('vod', item.stream_id);

      openPlayerOnce(() => router.push({
        pathname: '/player',
        params: {
          url: xtreamAPI.getVODStreamUrl(item.stream_id, item.container_extension || 'mp4'),
          title: item.name,
          currentIndex: String(Math.max(0, idx)),
          totalCount: String(allMovies.length),
          contentType: 'movies',
        },
      } as any));
    } finally {
      setTimeout(() => {
        playerOpeningRef.current = false;
      }, 1000);
    }
  };

  const handlePlaySeries = (item: XtreamSeries) => {
    router.push({ pathname: '/series-detail', params: { id: String(item.series_id), name: item.name } } as any);
  };

  const handlePlayChannel = async (item: XtreamStream, list: XtreamStream[]) => {
    if (playerOpeningRef.current) return;
    playerOpeningRef.current = true;
    try {
      const playlist = list.map(ch => ({
        id: ch.stream_id,
        url: xtreamAPI.getLiveStreamUrl(ch.stream_id),
        name: ch.name,
      }));
      const idx = list.findIndex(ch => ch.stream_id === item.stream_id);
      await AsyncStorage.setItem('player_playlist', JSON.stringify(playlist));
      await AsyncStorage.setItem('player_current_index', String(Math.max(0, idx)));
      await xtreamAPI.addToHistory('live', item.stream_id);

      openPlayerOnce(() => router.push({
        pathname: '/player',
        params: {
          url: xtreamAPI.getLiveStreamUrl(item.stream_id),
          title: item.name,
          currentIndex: String(Math.max(0, idx)),
          totalCount: String(list.length),
          contentType: 'live',
        },
      } as any));
    } finally {
      setTimeout(() => { playerOpeningRef.current = false; }, 1000);
    }
  };

  const handleResumeWatching = (record: HistoryRecord) => {
    if (record.content_type === 'series' && record.series_id) {
      router.push({ pathname: '/series-detail', params: { id: String(record.series_id), name: record.series_name || record.content_name } } as any);
    } else if (record.content_type === 'movie') {
      openPlayerOnce(() => router.push({
        pathname: '/player',
        params: {
          url: xtreamAPI.getVODStreamUrl(record.content_id, 'mp4'),
          title: record.content_name,
          currentIndex: '0',
          totalCount: '1',
          contentType: 'movies',
        },
      } as any));
    }
  };

  // ── Hero banner data: blend Recently Added Movies + Series ─────────────
  const bannerItems: BannerItem[] = [
    ...recentMovies.slice(0, 6).map((m): BannerItem => ({ kind: 'movie', data: m })),
    ...recentSeries.slice(0, 6).map((s): BannerItem => ({ kind: 'series', data: s })),
  ];

  // Auto-swap to a new "suggestion" poster every 6 seconds — no manual
  // arrows or dot indicators, just a soft crossfade to the next item.
  useEffect(() => {
    if (bannerAutoplayRef.current) {
      clearInterval(bannerAutoplayRef.current);
      bannerAutoplayRef.current = null;
    }
    if (bannerItems.length <= 1) return;
    bannerAutoplayRef.current = setInterval(() => {
      Animated.timing(bannerFadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        setBannerIndex(prev => (prev + 1) % bannerItems.length);
        Animated.timing(bannerFadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
      });
    }, 6000);
    return () => {
      if (bannerAutoplayRef.current) clearInterval(bannerAutoplayRef.current);
    };
  }, [bannerItems.length]);

  useEffect(() => {
    if (bannerIndex >= bannerItems.length && bannerItems.length > 0) {
      setBannerIndex(0);
    }
  }, [bannerItems.length]);

  const handlePlayBannerItem = (item: BannerItem) => {
    if (item.kind === 'movie') handlePlayMovie(item.data, recentMovies);
    else handlePlaySeries(item.data);
  };

  // ── Android TV: dedicated landscape layout, structurally different from
  // the phone layout below (not just a scaled-up version of it). ──────────
  if (device.isTV) {
    return (
      <TVHomeScreen
        recentMovies={recentMovies}
        recentSeries={recentSeries}
        expiryText={formatExpiry()}
        username={credentials?.username}
      />
    );
  }

  const currentBannerItem = bannerItems[bannerIndex] || null;
  const formatCount = (n: number | null) => (n === null ? '—' : n.toLocaleString());

  const now = new Date();
  const timeText = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const dateText = now.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <View style={styles.container}>
      <StatusBar hidden barStyle="light-content" backgroundColor={SimaColors.bg} />
      <LinearGradient colors={['#080C18', '#0A0E1A', '#0D1225']} style={StyleSheet.absoluteFill} />

      <View style={{ flex: 1 }}>
        {/* Full header — single row: brand | clock+date (center) | avatar+name+expiry (right). */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image
              source={require('@/assets/images/logo-symbol.png')}
              style={styles.headerLogoImage}
              resizeMode="contain"
            />
            <View>
              <Text style={styles.headerBrand}>
                <Text style={styles.headerBrandSima}>Sima</Text>
                <Text style={styles.headerBrandStream}>Stream</Text>
              </Text>
              <Text style={styles.headerTagline}>IPTV PLAYER - BY NAJI</Text>
            </View>
          </View>

          <View style={styles.headerCenter}>
            <View style={styles.headerTimeRow}>
              <Text style={styles.headerTime}>{timeText}</Text>
              <Text style={styles.headerDateInline}>{dateText}</Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <UserAvatar name={credentials?.username || 'User'} size={22} />
            <View>
              <Text style={styles.headerUsername}>{credentials?.username || 'User'}</Text>
              <Text style={styles.headerExpiry}>Expires: <Text style={styles.headerExpiryValue}>{formatExpiry()}</Text></Text>
            </View>
          </View>
        </View>

        {/* Icon bar sits directly under the header. */}
        <BottomIconBar items={bottomIcons} />

        {/* Vertical scroll ONLY — no horizontal ScrollView wraps the page itself. */}
        <Animated.ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 10 }}
            bounces={false}
            style={{ flex: 1, opacity: fadeAnim }}
          >
        {/* Top row: Live tile + 3 small tiles + rotating suggestion banner, all in one row */}
        <View style={[styles.topGrid, { paddingHorizontal: PADDING, gap: GAP }]}>
          <View style={styles.topGridRow}>
            <TouchableOpacity
              onPress={() => navigateTo('/live')}
              activeOpacity={0.85}
              style={styles.liveTile}
            >
              <View style={[StyleSheet.absoluteFill, styles.tileImageBg]} />
              <View style={styles.tileImageWrap}>
                <Image
                  source={require('@/assets/images/icon-tile-live.png')}
                  style={styles.tileImageContain}
                  resizeMode="contain"
                />
              </View>
              <LinearGradient
                colors={['transparent', 'rgba(8,12,24,0.92)']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0.4 }}
                end={{ x: 0, y: 1 }}
              />
              <View style={styles.tileOverlayContent}>
                <Text style={styles.liveTileLabel}>Live TV</Text>
                <Text style={styles.liveTileCount}>{formatCount(liveCount)} Channels</Text>
                {lastChannel && (
                  <Text style={styles.liveTileLastName} numberOfLines={1}>{lastChannel.name}</Text>
                )}
              </View>
            </TouchableOpacity>

            <View style={styles.smallTilesCol}>
              <TouchableOpacity onPress={() => navigateTo('/series')} activeOpacity={0.85} style={styles.smallTile}>
                <View style={[StyleSheet.absoluteFill, styles.tileImageBg]} />
                <View style={styles.tileImageWrap}>
                  <Image source={require('@/assets/images/icon-tile-series.png')} style={styles.tileImageContain} resizeMode="contain" />
                </View>
                <LinearGradient
                  colors={['transparent', 'rgba(8,12,24,0.92)']}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0.4 }}
                  end={{ x: 0, y: 1 }}
                />
                <View style={styles.tileOverlayContent}>
                  <Text style={styles.smallTileLabel}>Series</Text>
                  <Text style={styles.smallTileCount}>{formatCount(seriesCount)}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigateTo('/movies')} activeOpacity={0.85} style={styles.smallTile}>
                <View style={[StyleSheet.absoluteFill, styles.tileImageBg]} />
                <View style={styles.tileImageWrap}>
                  <Image source={require('@/assets/images/icon-tile-movies.png')} style={styles.tileImageContain} resizeMode="contain" />
                </View>
                <LinearGradient
                  colors={['transparent', 'rgba(8,12,24,0.92)']}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0.4 }}
                  end={{ x: 0, y: 1 }}
                />
                <View style={styles.tileOverlayContent}>
                  <Text style={styles.smallTileLabel}>Movies</Text>
                  <Text style={styles.smallTileCount}>{formatCount(moviesCount)}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigateTo('/sports')} activeOpacity={0.85} style={styles.smallTile}>
                <View style={[StyleSheet.absoluteFill, styles.tileImageBg]} />
                <View style={styles.tileImageWrap}>
                  <Text style={styles.tileEmoji}>⚽</Text>
                </View>
                <LinearGradient
                  colors={['transparent', 'rgba(8,12,24,0.92)']}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0.4 }}
                  end={{ x: 0, y: 1 }}
                />
                <View style={styles.tileOverlayContent}>
                  <Text style={styles.smallTileLabel}>Sports</Text>
                  <Text style={styles.smallTileCount}>{formatCount(sportsCount)}</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Rotating suggestion banner — top-right, beside the tiles, not stacked below them */}
            {currentBannerItem ? (
              <Animated.View style={[styles.suggestionBanner, { opacity: bannerFadeAnim }]}>
                <TouchableOpacity
                  activeOpacity={0.92}
                  onPress={() => handlePlayBannerItem(currentBannerItem)}
                  style={StyleSheet.absoluteFill}
                >
                  {(() => {
                    const image = currentBannerItem.kind === 'movie'
                      ? (currentBannerItem.data as XtreamVOD).stream_icon
                      : (currentBannerItem.data as XtreamSeries).cover;
                    return image ? (
                      <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, { backgroundColor: SimaColors.bgCardDark }]} />
                    );
                  })()}
                  <LinearGradient
                    colors={['rgba(8,12,24,0.05)', 'rgba(8,12,24,0.85)']}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                  />
                  <View style={styles.suggestionContent}>
                    <View style={styles.suggestionBadge}>
                      <Text style={styles.suggestionBadgeText}>RECENTLY ADDED</Text>
                    </View>
                    <Text style={styles.suggestionTitle} numberOfLines={1}>{currentBannerItem.data.name}</Text>
                    {(() => {
                      const plot = (currentBannerItem.data as any).plot
                        || (currentBannerItem.data as any).overview
                        || (currentBannerItem.data as any).description;
                      return plot ? (
                        <Text style={styles.suggestionPlot} numberOfLines={2}>{plot}</Text>
                      ) : null;
                    })()}
                    <View style={styles.suggestionPlayBtn}>
                      <Ionicons name="play" size={11} color="#1A1300" />
                      <Text style={styles.suggestionPlayText}>Play</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            ) : (
              <View style={[styles.suggestionBanner, { backgroundColor: SimaColors.bgCardDark }]} />
            )}
          </View>
        </View>

        {/* 5 stacked 80%-width rows (left) + Favourite Live column (right, 20%) */}
        <View style={[styles.mainSplitRow, { paddingHorizontal: PADDING }]}>
          <View style={styles.mainSplitFull}>
            {/* Continue Watching — movies & series */}
            <View style={styles.recentSection}>
              <Text style={[styles.recentTitle, { fontSize: device.fontMd }]}>Continue Watching</Text>
              {continueWatching.length === 0 ? (
                <Text style={styles.emptyHint}>Nothing in progress</Text>
              ) : (
                <FlatList
                  data={continueWatching}
                  keyExtractor={(item) => item.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[styles.recentList, { marginTop: 10 }]}
                  renderItem={({ item }) => {
                    const progress = item.duration > 0 ? Math.min(100, (item.playback_position / item.duration) * 100) : 0;
                    return (
                      <PosterCard
                        name={item.series_name || item.content_name}
                        image={item.content_poster}
                        fallbackIcon="play-circle-outline"
                        width={122}
                        height={162}
                        fontSm={device.fontSm}
                        onPress={() => handleResumeWatching(item)}
                        badge={
                          <View style={styles.progressTrack}>
                            <View style={[styles.progressFill, { width: `${progress}%` as any }]} />

                          </View>
                        }
                      />
                    );
                  }}
                />
              )}
            </View>

            {/* Favourite Live — second row, right after Continue Watching,
                per Naji's request. Normal horizontal row (same ChannelCard
                used in Continue Watching Live below). */}
            <View style={styles.recentSection}>
              <Text style={[styles.recentTitle, { fontSize: device.fontMd }]}>Favourite Live</Text>
              {favouriteChannels.length === 0 ? (
                <Text style={styles.emptyHint}>No favourites yet</Text>
              ) : (
                <FlatList
                  data={favouriteChannels}
                  keyExtractor={(item) => String(item.stream_id)}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[styles.recentList, { marginTop: 10 }]}
                  renderItem={({ item }) => (
                    <ChannelCard item={item} width={122} onPress={() => handlePlayChannel(item, favouriteChannels)} />
                  )}
                />
              )}
            </View>

            {/* Favourite Series */}
            <View style={styles.recentSection}>
              <Text style={[styles.recentTitle, { fontSize: device.fontMd }]}>Favourite Series</Text>
              {favouriteSeries.length === 0 ? (
                <Text style={styles.emptyHint}>No favourites yet</Text>
              ) : (
                <FlatList
                  data={favouriteSeries}
                  keyExtractor={(item) => String(item.series_id)}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[styles.recentList, { marginTop: 10 }]}
                  renderItem={({ item }) => (
                    <PosterCard
                      name={item.name}
                      image={item.cover}
                      fallbackIcon="play-circle-outline"
                      width={122}
                      height={162}
                      fontSm={device.fontSm}
                      onPress={() => handlePlaySeries(item)}
                    />
                  )}
                />
              )}
            </View>

            {/* Continue Watching Live — channel watch history */}
            <View style={styles.recentSection}>
              <Text style={[styles.recentTitle, { fontSize: device.fontMd }]}>Continue Watching Live</Text>
              {liveHistoryChannels.length === 0 ? (
                <Text style={styles.emptyHint}>No live history yet</Text>
              ) : (
                <FlatList
                  data={liveHistoryChannels}
                  keyExtractor={(item) => String(item.stream_id)}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[styles.recentList, { marginTop: 10 }]}
                  renderItem={({ item }) => (
                    <ChannelCard item={item} width={122} onPress={() => handlePlayChannel(item, liveHistoryChannels)} />
                  )}
                />
              )}
            </View>

            {/* Recently Added Movies */}
            {isAuthenticated && recentMovies.length > 0 && (
              <View style={styles.recentSection}>
                <View style={styles.recentHeader}>
                  <Text style={[styles.recentTitle, { fontSize: device.fontMd }]}>Recently Added Movies</Text>
                  <TouchableOpacity onPress={() => router.push({ pathname: '/movies', params: { filter: 'recently_added' } } as any)}>
                    <Text style={[styles.recentSeeAll, { fontSize: device.fontSm }]}>See All</Text>
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={recentMovies}
                  keyExtractor={(item) => String(item.stream_id)}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.recentList}
                  renderItem={({ item }) => (
                    <PosterCard
                      name={item.name}
                      image={item.stream_icon}
                      fallbackIcon="film-outline"
                      width={122}
                      height={162}
                      fontSm={device.fontSm}
                      onPress={() => handlePlayMovie(item, recentMovies)}
                    />
                  )}
                />
              </View>
            )}

            {/* Recently Added Series */}
            {isAuthenticated && recentSeries.length > 0 && (
              <View style={styles.recentSection}>
                <View style={styles.recentHeader}>
                  <Text style={[styles.recentTitle, { fontSize: device.fontMd }]}>Recently Added Series</Text>
                  <TouchableOpacity onPress={() => router.push({ pathname: '/series', params: { filter: 'recently_added' } } as any)}>
                    <Text style={[styles.recentSeeAll, { fontSize: device.fontSm }]}>See All</Text>
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={recentSeries}
                  keyExtractor={(item) => String(item.series_id)}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.recentList}
                  renderItem={({ item }) => (
                    <PosterCard
                      name={item.name}
                      image={item.cover}
                      fallbackIcon="play-circle-outline"
                      width={122}
                      height={162}
                      fontSm={device.fontSm}
                      onPress={() => handlePlaySeries(item)}
                    />
                  )}
                />
              </View>
            )}
          </View>
        </View>

        {/* Version */}
        <View style={styles.versionRow}>
          <Text style={[styles.versionText, { fontSize: device.fontSm }]}>{APP_INFO.version}</Text>
        </View>
        </Animated.ScrollView>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SimaColors.bg },

  // Single-row header: brand | avatar+name+expiry | clock+date.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: SimaColors.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerLogoImage: { width: 44, height: 44 },
  headerBrand: { fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
  headerBrandSima: { color: '#E8332A' },
  headerBrandStream: { color: '#E5E7E9' },
  headerTagline: { fontSize: 7, fontWeight: '700', letterSpacing: 0.3, color: '#C9CCD1' },

  // Center: clock + date side-by-side on one line.
  headerCenter: { alignItems: 'center', gap: 2 },
  headerTimeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  headerTime: { color: SimaColors.textPrimary, fontWeight: '700', fontSize: 16 },
  headerDateInline: { color: SimaColors.textMuted, fontSize: 8 },

  // Right: avatar + username + expiry
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerUsername: { color: SimaColors.textPrimary, fontWeight: '700', fontSize: 10 },
  headerExpiry: { color: SimaColors.textSecondary, fontSize: 9 },
  headerExpiryValue: { color: SimaColors.textGreen, fontWeight: '700' },

  // Top grid: Live tile + small tiles + suggestion banner — all one row,
  // banner sits top-right beside the tiles (not stacked below them).
  // Height increased (130→210) per Naji's request — same column widths
  // (flex 30/20/50), just taller, so all three stay level with each other.
  topGrid: { marginTop: 12 },
  topGridRow: { flexDirection: 'row', gap: 8, height: 256 },
  liveTile: {
    flex: 30,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  liveTileLabel: { color: '#fff', fontWeight: '800', fontSize: 11 },
  liveTileCount: { color: '#FF8A8A', fontWeight: '700', fontSize: 9, marginTop: 1 },
  liveTileLastName: { color: 'rgba(255,255,255,0.85)', fontWeight: '600', fontSize: 8, marginTop: 1 },

  smallTilesCol: { flex: 20, gap: 4 },
  smallTile: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  smallTileLabel: { color: '#fff', fontWeight: '700', fontSize: 9 },
  smallTileCount: { color: 'rgba(255,255,255,0.8)', fontSize: 8 },

  // Subtle background behind the contained (not cropped) tile image, so
  // the empty space around the now-fully-visible artwork doesn't look
  // like a transparent hole into the page background.
  tileImageBg: { backgroundColor: 'rgba(255,255,255,0.06)' },
  // Smaller, centered icon area (not edge-to-edge) so the icon reads
  // clearly within the tile instead of looking cropped/too large.
  tileImageWrap: {
    position: 'absolute',
    top: 6,
    left: 0,
    right: 0,
    bottom: '38%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileImageContain: { width: '60%', height: '78%' },
  tileEmoji: { fontSize: 34 },

  // Text overlay sitting at the bottom of each image tile, over the
  // gradient fade — same pattern as the suggestion banner's overlay.
  tileOverlayContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 6,
  },

  suggestionBanner: {
    flex: 50,
    borderRadius: 12,
    overflow: 'hidden',
  },
  suggestionContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 10,
    gap: 3,
  },
  suggestionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(74,144,217,0.85)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  suggestionBadgeText: { color: '#fff', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  suggestionTitle: { color: SimaColors.textPrimary, fontSize: 14, fontWeight: '800' },
  suggestionPlot: { color: 'rgba(255,255,255,0.8)', fontSize: 9, lineHeight: 12, marginTop: 1 },
  suggestionPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#F5C518',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 2,
  },
  suggestionPlayText: { color: '#1A1300', fontWeight: '800', fontSize: 10 },

  // All rows now full-width (Favourite Live moved into this stack as a
  // normal horizontal row, per Naji's request — no more narrow side column).
  mainSplitRow: { flexDirection: 'row', gap: 8 },
  mainSplitFull: { flex: 1 },

  recentSection: { marginTop: 18 },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recentTitle: { flex: 1, color: SimaColors.textPrimary, fontWeight: '700' },
  recentSeeAll: { color: SimaColors.accent, fontWeight: '600' },
  recentList: { gap: 10 },
  recentItem: { gap: 6 },
  recentItemFocused: {
    borderWidth: 2,
    borderColor: SimaColors.accent,
    borderRadius: 10,
    padding: 2,
  },
  recentName: { color: SimaColors.textSecondary, fontWeight: '500' },
  emptyHint: { color: SimaColors.textMuted, fontSize: 12, marginTop: 8 },

  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(0,0,0,0.4)' },
  progressFill: { height: 3, backgroundColor: SimaColors.accent },

  channelCard: { gap: 4, alignItems: 'center' },
  channelCardIcon: { width: 44, height: 44, borderRadius: 8 },
  channelCardIconPlaceholder: { backgroundColor: SimaColors.bgCardDark, alignItems: 'center', justifyContent: 'center' },
  channelCardName: { color: SimaColors.textPrimary, fontWeight: '600', fontSize: 12, textAlign: 'center' },
  channelCardProgramme: { color: SimaColors.textMuted, fontSize: 10, textAlign: 'center' },

  versionRow: { alignItems: 'flex-end', paddingHorizontal: 16, marginTop: 16, marginBottom: 8 },
  versionText: { color: SimaColors.textMuted },

  // Top icon bar — full screen width, directly under the header.
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: SimaColors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  bottomBarBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBarBtnFocused: {
    backgroundColor: 'rgba(245,166,35,0.25)',
  },
});
