/**
 * TVHomeScreen — Android TV landscape home, cloned from the phone Home
 * screen (app/(tabs)/index.tsx) almost line-for-line. The only
 * structural differences from phone are:
 *   1. A narrow left icon rail (width = 6% of real screen width, never
 *      less than 56px) instead of phone's bottom icon bar.
 *   2. The main content column has a maxWidth and is centered, so it
 *      makes good use of a wide TV screen without stretching everything
 *      to the edges.
 *   3. Font sizes / paddings are scaled up a bit for a 10-foot viewing
 *      distance.
 *
 * Everything else — header layout, top row (Live tile / 3 small tiles /
 * suggestion banner with plot overlay), the four 80%-width rows
 * (Recently Added Movies, Recently Added Series, Continue Watching,
 * Continue Watching Live) plus the 20%-width Favourite Live column — is
 * the same component structure as phone, just re-skinned for TV remote
 * focus (onFocus/onBlur/hasTVPreferredFocus) instead of touch.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Image,
  FlatList,
  Alert,
  Linking,
  ScrollView,
  Animated,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SimaColors, APP_INFO } from '@/constants/theme';
import xtreamAPI, { XtreamVOD, XtreamSeries, XtreamStream, isSportsChannelName } from '@/lib/xtream-api';
import { useXtream } from '@/lib/xtream-context';
import UserAvatar from '@/components/sima/UserAvatar';
import { historyService, HistoryRecord } from '@/lib/history-service';
import { getChannelEpg } from '@/lib/epg-service';

type BannerItem =
  | { kind: 'movie'; data: XtreamVOD }
  | { kind: 'series'; data: XtreamSeries };

type SideIcon = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  route?: string;
  onPress?: () => void;
  isWhatsApp?: boolean;
};

interface TVHomeScreenProps {
  recentMovies: XtreamVOD[];
  recentSeries: XtreamSeries[];
  expiryText: string;
  username?: string;
}

// ── Reusable poster card for horizontal rows (same as phone's PosterCard) ──
// Memoized: only the cards whose `isFocused` actually changes re-render on
// D-pad moves, instead of every card on the screen. Custom comparator
// ignores function/node props (onPress, badge, setFocusedId) which change
// identity each render but never affect this card's visuals per item.
const PosterCard = React.memo(function PosterCard({
  name, image, fallbackIcon, width, height, onPress, badge, focusKey, isFocused, setFocusedId,
}: {
  name: string; image?: string | null; fallbackIcon: keyof typeof Ionicons.glyphMap;
  width: number; height: number; onPress: () => void; badge?: React.ReactNode;
  focusKey: string; isFocused: boolean; setFocusedId: (id: string | null) => void;
}) {
  return (
    <Pressable
          focusable={true}
      onPress={onPress}
      onFocus={() => setFocusedId(focusKey)}
      onBlur={() => setFocusedId(null)}
      style={[styles.recentItem, { width }, isFocused && styles.tvFocused]}
    >
      <View style={{ width, height, borderRadius: 8, overflow: 'hidden' }}>
        {image ? (
          <ExpoImage source={image} style={{ width, height }} contentFit="cover" cachePolicy="memory-disk" recyclingKey={image} transition={0} />
        ) : (
          <View style={{ width, height, backgroundColor: SimaColors.bgCardDark, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={fallbackIcon} size={32} color={SimaColors.textMuted} />
          </View>
        )}
        {badge}
      </View>
      <Text style={styles.recentName} numberOfLines={1}>{name}</Text>
    </Pressable>
  );
}, (prev, next) =>
  prev.isFocused === next.isFocused &&
  prev.image === next.image &&
  prev.name === next.name &&
  prev.width === next.width &&
  prev.height === next.height &&
  prev.focusKey === next.focusKey
);


// Live channel card (same as phone's ChannelCard)
const ChannelCard = React.memo(function ChannelCard({
  item, width, onPress, focusKey, isFocused, setFocusedId,
}: { item: XtreamStream; width: number; onPress: () => void; focusKey: string; isFocused: boolean; setFocusedId: (id: string | null) => void }) {
  const epg = item.epg_channel_id ? getChannelEpg(item.epg_channel_id) : { current: null, next: null };
  return (
    <Pressable
          focusable={true}
      onPress={onPress}
      onFocus={() => setFocusedId(focusKey)}
      onBlur={() => setFocusedId(null)}
      style={[styles.channelCard, { width }, isFocused && styles.tvFocused]}
    >
      {item.stream_icon ? (
        <ExpoImage source={item.stream_icon} style={styles.channelCardIcon} contentFit="contain" cachePolicy="memory-disk" recyclingKey={String(item.stream_id)} transition={0} />
      ) : (
        <View style={[styles.channelCardIcon, styles.channelCardIconPlaceholder]}>
          <Ionicons name="tv-outline" size={28} color={SimaColors.textMuted} />
        </View>
      )}
      <Text style={styles.channelCardName} numberOfLines={1}>{item.name}</Text>
      {epg.current && (
        <Text style={styles.channelCardProgramme} numberOfLines={1}>{epg.current.title}</Text>
      )}
    </Pressable>
  );
}, (prev, next) =>
  prev.isFocused === next.isFocused &&
  prev.item === next.item &&
  prev.width === next.width &&
  prev.focusKey === next.focusKey
);

// Bottom horizontal icon bar — same shape as phone's bar. Per Naji's
// decision: after the side rail's design proved correct in isolation
// but coincided with a confusing tile-image loading issue, we're
// dropping the rail (phone and TV alike) for this proven layout, with
// the rail design kept in mind for a possible standalone redesign later.
function BottomIconBar({ items }: { items: SideIcon[] }) {
  const router = useRouter();
  const [focusedId, setFocusedId] = useState<string | null>(null);
  return (
    <View style={styles.bottomBar}>
      {items.map((item, i) => {
        const isFocused = focusedId === item.id;
        return (
          <Pressable
          focusable={true}
            key={item.id}
            onPress={() => {
              if (item.onPress) item.onPress();
              else if (item.route) router.push(item.route as any);
            }}
            onFocus={() => setFocusedId(item.id)}
            onBlur={() => setFocusedId(null)}
            style={[
              styles.bottomBarBtn,
              isFocused && styles.tvFocused,
            ]}
          >
            <Ionicons
              name={item.icon}
              size={17}
              color={item.isWhatsApp ? SimaColors.whatsapp : SimaColors.textPrimary}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

export function TVHomeScreen({ recentMovies, recentSeries, expiryText, username }: TVHomeScreenProps) {
  const router = useRouter();
  const { logout } = useXtream();

  // Main content area gets a sensible max width and is centered, so it
  // doesn't stretch edge-to-edge on very wide TV screens.
  const CONTENT_MAX_WIDTH = 1400;

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const playerOpeningRef = useRef(false);
  const [favouriteChannels, setFavouriteChannels] = useState<XtreamStream[]>([]);
  const [continueWatching, setContinueWatching] = useState<HistoryRecord[]>([]);
  const [liveHistoryChannels, setLiveHistoryChannels] = useState<XtreamStream[]>([]);
  const [favouriteSeries, setFavouriteSeries] = useState<XtreamSeries[]>([]);

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

  const loadFavouriteChannels = async () => {
    try {
      const favIds = await xtreamAPI.getFavorites('live');
      const allLive = await xtreamAPI.getLiveStreams();
      setLiveCount(allLive.length);
      setSportsCount(allLive.filter(ch => isSportsChannelName(ch.name)).length);
      if (favIds.length === 0) {
        setFavouriteChannels([]);
      } else {
        // Most-recently-favourited first (favIds is oldest→newest).
        const reversedIds = [...favIds].reverse();
        const ordered = reversedIds
          .map(id => allLive.find(ch => ch.stream_id === id))
          .filter((ch): ch is XtreamStream => !!ch);
        setFavouriteChannels(ordered);
      }
      const liveHistoryIds = await xtreamAPI.getHistory('live');
      if (liveHistoryIds.length > 0) {
        setLastChannel(allLive.find(ch => ch.stream_id === liveHistoryIds[0]) || null);
        const orderedHistory = liveHistoryIds
          .map(id => allLive.find(ch => ch.stream_id === id))
          .filter((ch): ch is XtreamStream => !!ch);
        setLiveHistoryChannels(orderedHistory.slice(0, 20));
      } else {
        setLastChannel(null);
        setLiveHistoryChannels([]);
      }
    } catch {
      setFavouriteChannels([]);
    }
  };

  const loadMovieSeriesCounts = async () => {
    try {
      const movies = await xtreamAPI.getVODStreams();
      setMoviesCount(movies.length);
    } catch {
      setMoviesCount(null);
    }
    try {
      const series = await xtreamAPI.getSeries();
      setSeriesCount(series.length);
    } catch {
      setSeriesCount(null);
    }
  };

  const loadContinueWatching = async () => {
    try {
      const all = await historyService.getAll();
      // Movies & series only — live channels have their own
      // "Continue Watching Live" row.
      const moviesAndSeries = all.filter(r => r.content_type === 'movie' || r.content_type === 'series');
      // Sort most-recent-first (defensive: supports number or ISO-string
      // timestamps under common field names; falls back to original order).
      const recency = (r: any) => {
        const v = r.updated_at ?? r.last_watched ?? r.watched_at ?? r.timestamp ?? r.updatedAt ?? 0;
        const n = typeof v === 'number' ? v : Date.parse(v);
        return isNaN(n) ? 0 : n;
      };
      const sorted = [...moviesAndSeries].sort((a, b) => recency(b) - recency(a));
      // Dedupe: ONE card per series (its most recent episode); movies kept
      // individually.
      const seen = new Set<string>();
      const deduped: HistoryRecord[] = [];
      for (const r of sorted) {
        const key =
          r.content_type === 'series' && r.series_id != null
            ? `series_${r.series_id}`
            : `movie_${r.content_id ?? r.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(r);
      }
      setContinueWatching(deduped.slice(0, 20));
    } catch {
      setContinueWatching([]);
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

  useFocusEffect(
    React.useCallback(() => {
      loadFavouriteChannels();
      loadMovieSeriesCounts();
      loadContinueWatching();
      loadFavouriteSeries();
      return () => {};
    }, [])
  );

  const navigateTo = (route: string) => router.push(route as any);

  const handleWhatsApp = () => {
    const phone = APP_INFO.phone.replace('+', '');
    Linking.openURL(`https://wa.me/${phone}`);
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const sideIcons: SideIcon[] = [
    { id: 'home', icon: 'home', onPress: () => {} },
    { id: 'live', icon: 'radio-outline', route: '/live' },
    { id: 'movies', icon: 'film-outline', route: '/movies' },
    { id: 'series', icon: 'play-circle-outline', route: '/series' },
    { id: 'favourites', icon: 'star-outline', route: '/live?filter=favourites' },
    { id: 'settings', icon: 'settings-outline', route: '/settings' },
    { id: 'logout', icon: 'log-out-outline', onPress: handleLogout },
    { id: 'whatsapp', icon: 'logo-whatsapp', isWhatsApp: true, onPress: handleWhatsApp },
  ];

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

      router.push({
        pathname: '/player',
        params: {
          url: xtreamAPI.getVODStreamUrl(item.stream_id, item.container_extension || 'mp4'),
          title: item.name,
          currentIndex: String(Math.max(0, idx)),
          totalCount: String(allMovies.length),
          contentType: 'movies',
        },
      } as any);
    } finally {
      setTimeout(() => { playerOpeningRef.current = false; }, 1000);
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

      router.push({
        pathname: '/player',
        params: {
          url: xtreamAPI.getLiveStreamUrl(item.stream_id),
          title: item.name,
          currentIndex: String(Math.max(0, idx)),
          totalCount: String(list.length),
          contentType: 'live',
        },
      } as any);
    } finally {
      setTimeout(() => { playerOpeningRef.current = false; }, 1000);
    }
  };

  const handleResumeWatching = async (record: HistoryRecord) => {
    if (record.content_type === 'series' && record.series_id) {
      router.push({ pathname: '/series-detail', params: { id: String(record.series_id), name: record.series_name || record.content_name } } as any);
    } else if (record.content_type === 'movie') {
      // Write a clean single-item playlist so the player's next/prev can't
      // fall back to a stale list (e.g. live channels) from a previous play.
      const url = xtreamAPI.getVODStreamUrl(record.content_id, 'mp4');
      await AsyncStorage.setItem('player_playlist', JSON.stringify([{ id: record.content_id, url, name: record.content_name }]));
      await AsyncStorage.setItem('player_current_index', '0');
      router.push({
        pathname: '/player',
        params: {
          url,
          title: record.content_name,
          currentIndex: '0',
          totalCount: '1',
          contentType: 'movies',
        },
      } as any);
    }
  };

  // ── Hero banner data: blend Recently Added Movies + Series ─────────────
  const bannerItems: BannerItem[] = [
    ...recentMovies.slice(0, 6).map((m): BannerItem => ({ kind: 'movie', data: m })),
    ...recentSeries.slice(0, 6).map((s): BannerItem => ({ kind: 'series', data: s })),
  ];

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

  const currentBannerItem = bannerItems[bannerIndex] || null;
  const formatCount = (n: number | null) => (n === null ? '—' : n.toLocaleString());

  const now = new Date();
  const timeText = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const dateText = now.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#080C18', '#0A0E1A', '#0D1225']} style={StyleSheet.absoluteFill} />

      <View style={{ flex: 1 }}>
          {/* Full header — single row: brand | clock+date (center) | avatar+name+expiry (right) */}
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
              <UserAvatar username={username || 'User'} size={32} />
              <View>
                <Text style={styles.headerUsername}>{username || 'User'}</Text>
                <Text style={styles.headerExpiry}>Expires: <Text style={styles.headerExpiryValue}>{expiryText}</Text></Text>
              </View>
              <Pressable
                focusable={true}
                onPress={() => router.push('/playlist' as any)}
                onFocus={() => setFocusedId('hdr_playlist')}
                onBlur={() => setFocusedId(null)}
                style={[styles.headerPlaylistBtn, focusedId === 'hdr_playlist' && styles.tvFocused]}
              >
                <Ionicons name="swap-horizontal" size={18} color={SimaColors.textPrimary} />
              </Pressable>
            </View>
          </View>

          {/* Icon bar moved to the top (under the header) per design. */}
          <BottomIconBar items={sideIcons} />

          {/* Vertical scroll ONLY — content stretches to fill available width
              right next to the rail, capped at a sensible max width. */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
            contentContainerStyle={{ width: '100%' }}
          >
            <View style={[styles.contentInner, { maxWidth: CONTENT_MAX_WIDTH }]}>
              {/* Top row: Live tile + 3 small tiles + rotating suggestion banner, all in one row */}
              <View style={styles.topGrid}>
                <View style={styles.topGridRow}>
                  <Pressable
          focusable={true}
                    onPress={() => navigateTo('/live')}
                    onFocus={() => setFocusedId('live_tile')}
                    onBlur={() => setFocusedId(null)}
                    hasTVPreferredFocus
                    style={[styles.liveTile, focusedId === 'live_tile' && styles.tvFocused]}
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
                  </Pressable>

                  <View style={styles.smallTilesCol}>
                    <Pressable
          focusable={true}
                      onPress={() => navigateTo('/series')}
                      onFocus={() => setFocusedId('series_tile')}
                      onBlur={() => setFocusedId(null)}
                      style={[styles.smallTile, focusedId === 'series_tile' && styles.tvFocused]}
                    >
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
                    </Pressable>
                    <Pressable
          focusable={true}
                      onPress={() => navigateTo('/movies')}
                      onFocus={() => setFocusedId('movies_tile')}
                      onBlur={() => setFocusedId(null)}
                      style={[styles.smallTile, focusedId === 'movies_tile' && styles.tvFocused]}
                    >
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
                    </Pressable>
                    <Pressable
          focusable={true}
                      onPress={() => navigateTo('/sports')}
                      onFocus={() => setFocusedId('sports_tile')}
                      onBlur={() => setFocusedId(null)}
                      style={[styles.smallTile, focusedId === 'sports_tile' && styles.tvFocused]}
                    >
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
                    </Pressable>
                  </View>

                  {/* Rotating suggestion banner — top-right, beside the tiles */}
                  {currentBannerItem ? (
                    <Animated.View style={[styles.suggestionBanner, { opacity: bannerFadeAnim }]}>
                      <Pressable
          focusable={true}
                        onPress={() => handlePlayBannerItem(currentBannerItem)}
                        onFocus={() => setFocusedId('banner')}
                        onBlur={() => setFocusedId(null)}
                        style={[StyleSheet.absoluteFill, focusedId === 'banner' && styles.tvFocused]}
                      >
                        {(() => {
                          const image = currentBannerItem.kind === 'movie'
                            ? (currentBannerItem.data as XtreamVOD).stream_icon
                            : (currentBannerItem.data as XtreamSeries).cover;
                          return image ? (
                            <ExpoImage source={image} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" recyclingKey={image} transition={0} />
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
                            <Ionicons name="play" size={14} color="#1A1300" />
                            <Text style={styles.suggestionPlayText}>Play</Text>
                          </View>
                        </View>
                      </Pressable>
                    </Animated.View>
                  ) : (
                    <View style={[styles.suggestionBanner, { backgroundColor: SimaColors.bgCardDark }]} />
                  )}
                </View>
              </View>

              {/* 6 stacked full-width rows — Favourite Live moved here as a
                  normal horizontal row at the top, per Naji's request. No
                  more narrow side column. */}
              <View style={styles.mainSplitRow}>
                <View style={styles.mainSplitFull}>
                  {/* Continue Watching — movies & series */}
                  <View style={styles.recentSection}>
                    <Text style={styles.recentTitleFlex}>Continue Watching</Text>
                    {continueWatching.length === 0 ? (
                      <Text style={styles.emptyHint}>Nothing in progress</Text>
                    ) : (
                      <FlatList
                        data={continueWatching}
                        extraData={focusedId}
                        keyExtractor={(item) => item.id}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={[styles.recentList, { marginTop: 10 }]}
                        renderItem={({ item }) => {
                          const progress = item.duration > 0 ? Math.min(100, (item.playback_position / item.duration) * 100) : 0;
                          return (
                            <PosterCard
                              name={item.series_name || item.content_name}
                              image={item.content_poster || (item as any).series_cover || (item as any).cover || (item as any).content_cover}
                              fallbackIcon="play-circle-outline"
                              width={150}
                              height={225}
                              onPress={() => handleResumeWatching(item)}
                              focusKey={`cw_${item.id}`}
                              isFocused={focusedId === `cw_${item.id}`}
                              setFocusedId={setFocusedId}
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

                  {/* Favourite Live */}
                  <View style={styles.recentSection}>
                    <Text style={styles.recentTitleFlex}>Favourite Live</Text>
                    {favouriteChannels.length === 0 ? (
                      <Text style={styles.emptyHint}>No favourites yet</Text>
                    ) : (
                      <FlatList
                        data={favouriteChannels}
                        extraData={focusedId}
                        keyExtractor={(item) => String(item.stream_id)}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={[styles.recentList, { marginTop: 10 }]}
                        renderItem={({ item }) => (
                          <ChannelCard
                            item={item}
                            width={150}
                            onPress={() => handlePlayChannel(item, favouriteChannels)}
                            focusKey={`favlive_${item.stream_id}`}
                            isFocused={focusedId === `favlive_${item.stream_id}`}
                            setFocusedId={setFocusedId}
                          />
                        )}
                      />
                    )}
                  </View>

                  {/* Favourite Series */}
                  <View style={styles.recentSection}>
                    <Text style={styles.recentTitleFlex}>Favourite Series</Text>
                    {favouriteSeries.length === 0 ? (
                      <Text style={styles.emptyHint}>No favourites yet</Text>
                    ) : (
                      <FlatList
                        data={favouriteSeries}
                        extraData={focusedId}
                        keyExtractor={(item) => String(item.series_id)}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={[styles.recentList, { marginTop: 10 }]}
                        renderItem={({ item }) => (
                          <PosterCard
                            name={item.name}
                            image={item.cover}
                            fallbackIcon="play-circle-outline"
                            width={150}
                            height={225}
                            onPress={() => handlePlaySeries(item)}
                            focusKey={`favseries_${item.series_id}`}
                            isFocused={focusedId === `favseries_${item.series_id}`}
                            setFocusedId={setFocusedId}
                          />
                        )}
                      />
                    )}
                  </View>

                  {/* Continue Watching Live — channel watch history */}
                  <View style={styles.recentSection}>
                    <Text style={styles.recentTitleFlex}>Continue Watching Live</Text>
                    {liveHistoryChannels.length === 0 ? (
                      <Text style={styles.emptyHint}>No live history yet</Text>
                    ) : (
                      <FlatList
                        data={liveHistoryChannels}
                        extraData={focusedId}
                        keyExtractor={(item) => String(item.stream_id)}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={[styles.recentList, { marginTop: 10 }]}
                        renderItem={({ item }) => (
                          <ChannelCard
                            item={item}
                            width={150}
                            onPress={() => handlePlayChannel(item, liveHistoryChannels)}
                            focusKey={`cwlive_${item.stream_id}`}
                            isFocused={focusedId === `cwlive_${item.stream_id}`}
                            setFocusedId={setFocusedId}
                          />
                        )}
                      />
                    )}
                  </View>

                  {/* Recently Added Movies */}
                  {recentMovies.length > 0 && (
                    <View style={styles.recentSection}>
                      <View style={styles.recentHeader}>
                        <Text style={styles.recentTitleFlex}>Recently Added Movies</Text>
                        <Pressable
                          focusable={true}
                          onPress={() => router.push({ pathname: '/movies', params: { filter: 'recently_added' } } as any)}
                        >
                          <Text style={styles.recentSeeAll}>See All</Text>
                        </Pressable>
                      </View>
                      <FlatList
                        data={recentMovies}
                        extraData={focusedId}
                        keyExtractor={(item) => String(item.stream_id)}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.recentList}
                        renderItem={({ item }) => (
                          <PosterCard
                            name={item.name}
                            image={item.stream_icon}
                            fallbackIcon="film-outline"
                            width={150}
                            height={225}
                            onPress={() => handlePlayMovie(item, recentMovies)}
                            focusKey={`movie_${item.stream_id}`}
                            isFocused={focusedId === `movie_${item.stream_id}`}
                            setFocusedId={setFocusedId}
                          />
                        )}
                      />
                    </View>
                  )}

                  {/* Recently Added Series */}
                  {recentSeries.length > 0 && (
                    <View style={styles.recentSection}>
                      <View style={styles.recentHeader}>
                        <Text style={styles.recentTitleFlex}>Recently Added Series</Text>
                        <Pressable
                          focusable={true}
                          onPress={() => router.push({ pathname: '/series', params: { filter: 'recently_added' } } as any)}
                        >
                          <Text style={styles.recentSeeAll}>See All</Text>
                        </Pressable>
                      </View>
                      <FlatList
                        data={recentSeries}
                        extraData={focusedId}
                        keyExtractor={(item) => String(item.series_id)}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.recentList}
                        renderItem={({ item }) => (
                          <PosterCard
                            name={item.name}
                            image={item.cover}
                            fallbackIcon="play-circle-outline"
                            width={150}
                            height={225}
                            onPress={() => handlePlaySeries(item)}
                            focusKey={`series_${item.series_id}`}
                            isFocused={focusedId === `series_${item.series_id}`}
                            setFocusedId={setFocusedId}
                          />
                        )}
                      />
                    </View>
                  )}
                </View>
              </View>

              <Text style={styles.versionText}>{APP_INFO.name}</Text>
            </View>
          </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SimaColors.bg, flexDirection: 'column' },

  // Amber focus indicator — unified with ContentScreen.tsx and the player screen.
  tvFocused: {
    // Low-end-TV safe focus ring: border only. No scale/zIndex/elevation —
    // those caused FlatList tiles to go black after the cursor passed and
    // added lag on low-RAM TVs. Base cards carry a transparent border of the
    // same width so focusing never shifts layout.
    borderColor: '#F5A623',
    backgroundColor: 'rgba(245,166,35,0.12)',
  },

  // Left vertical icon rail
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: SimaColors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  bottomBarBtn: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },

  contentInner: { paddingHorizontal: 24, paddingBottom: 24 },

  // Single-row header: brand | clock+date (center) | avatar+name+expiry (right)
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: SimaColors.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerLogoImage: { width: 48, height: 48 },
  headerBrand: { fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
  headerBrandSima: { color: '#E8332A' },
  headerBrandStream: { color: '#E5E7E9' },
  headerTagline: { fontSize: 8, fontWeight: '700', letterSpacing: 0.4, color: '#C9CCD1' },

  headerCenter: { alignItems: 'center', gap: 3 },
  headerTimeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  headerTime: { color: SimaColors.textPrimary, fontWeight: '700', fontSize: 21 },
  headerDateInline: { color: SimaColors.textMuted, fontSize: 10 },

  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerPlaylistBtn: { padding: 5, borderRadius: 7, borderWidth: 2, borderColor: 'transparent', backgroundColor: SimaColors.bgCard, marginLeft: 2 },
  headerUsername: { color: SimaColors.textPrimary, fontWeight: '700', fontSize: 14 },
  headerExpiry: { color: SimaColors.textSecondary, fontSize: 12 },
  headerExpiryValue: { color: SimaColors.textGreen, fontWeight: '700' },

  // Top row: Live tile + small tiles + suggestion banner — all one row,
  // banner sits top-right beside the tiles.
  topGrid: { marginTop: 16 },
  topGridRow: { flexDirection: 'row', gap: 14, height: 333 },
  liveTile: {
    flex: 30,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#141A2E',
  },
  liveTileLabel: { color: '#fff', fontWeight: '800', fontSize: 20 },
  liveTileCount: { color: '#FF8A8A', fontWeight: '700', fontSize: 16, marginTop: 2 },
  liveTileLastName: { color: 'rgba(255,255,255,0.85)', fontWeight: '600', fontSize: 14, marginTop: 2 },

  smallTilesCol: { flex: 20, gap: 10 },
  smallTile: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#141A2E',
  },
  smallTileLabel: { color: '#fff', fontWeight: '700', fontSize: 16 },
  smallTileCount: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },

  // Subtle background behind the contained (not cropped) tile image, so
  // the empty space around the now-fully-visible artwork doesn't look
  // like a transparent hole into the page background.
  tileImageBg: { backgroundColor: 'rgba(255,255,255,0.06)' },
  // Smaller, centered icon area (matches the phone Home screen's
  // approach) so the icon reads clearly within the tile instead of
  // looking cropped/too large.
  tileImageWrap: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    bottom: '38%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileImageContain: { width: '60%', height: '78%' },
  tileEmoji: { fontSize: 44 },

  // Text overlay sitting at the bottom of each image tile, over the
  // gradient fade — same pattern as the suggestion banner's overlay.
  tileOverlayContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
  },

  suggestionBanner: { flex: 50, borderRadius: 16, overflow: 'hidden' },
  suggestionContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 18,
    gap: 6,
  },
  suggestionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(74,144,217,0.85)',
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  suggestionBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  suggestionTitle: { color: SimaColors.textPrimary, fontSize: 22, fontWeight: '800' },
  suggestionPlot: { color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 19, marginTop: 2, maxWidth: '85%' },
  suggestionPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#F5C518',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 4,
  },
  suggestionPlayText: { color: '#1A1300', fontWeight: '800', fontSize: 14 },

  // All rows now full-width (Favourite Live moved into this stack as a
  // normal horizontal row, per Naji's request — no more narrow side column).
  mainSplitRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  mainSplitFull: { flex: 1 },

  recentSection: { marginTop: 24 },
  recentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recentTitleFlex: { flex: 1, color: SimaColors.textPrimary, fontWeight: '700', fontSize: 18 },
  recentSeeAll: { color: SimaColors.accent, fontWeight: '600', fontSize: 14 },
  recentList: { gap: 14 },
  recentItem: { gap: 8, borderRadius: 10, borderWidth: 3, borderColor: 'transparent' },
  recentName: { color: SimaColors.textSecondary, fontWeight: '500', fontSize: 13 },
  emptyHint: { color: SimaColors.textMuted, fontSize: 14, marginTop: 8 },

  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: 'rgba(0,0,0,0.4)' },
  progressFill: { height: 4, backgroundColor: SimaColors.accent },

  channelCard: { gap: 6, alignItems: 'center', borderRadius: 10, borderWidth: 3, borderColor: 'transparent' },
  channelCardIcon: { width: 64, height: 64, borderRadius: 10 },
  channelCardIconPlaceholder: { backgroundColor: SimaColors.bgCardDark, alignItems: 'center', justifyContent: 'center' },
  channelCardName: { color: SimaColors.textPrimary, fontWeight: '600', fontSize: 14, textAlign: 'center' },
  channelCardProgramme: { color: SimaColors.textMuted, fontSize: 12, textAlign: 'center' },

  versionText: { color: SimaColors.textMuted, fontSize: 13, marginTop: 20, alignSelf: 'flex-end' },
});
