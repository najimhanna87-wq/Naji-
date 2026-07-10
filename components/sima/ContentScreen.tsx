import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDevice } from '@/hooks/use-device';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  Image,
  Dimensions,
  useWindowDimensions,
  ScrollView,
  Alert,
  Keyboard,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { SimaColors } from '@/constants/theme';
import { useXtream } from '@/lib/xtream-context';
import xtreamAPI, { XtreamCategory, XtreamStream, XtreamVOD, XtreamSeries } from '@/lib/xtream-api';
import { VideoView, useVideoPlayer } from 'expo-video';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getChannelEpg, formatEpgTime, getEpgProgress, EpgChannelInfo } from '@/lib/epg-service';
import { historyService, HistoryRecord } from '@/lib/history-service';
import { openPlayerOnce } from '@/lib/player-navigation';

const { width, height } = Dimensions.get('window');

type ContentType = 'live' | 'movies' | 'series' | 'sports';

interface ContentScreenProps {
  type: ContentType;
  title: string;
  initialFilter?: string; // 'recently_added' to sort by recently added
}

type ContentItem = XtreamStream | XtreamVOD | XtreamSeries;

function getItemId(item: ContentItem): number {
  if ('stream_id' in item) return (item as XtreamStream | XtreamVOD).stream_id;
  return (item as XtreamSeries).series_id;
}

function getItemName(item: ContentItem): string {
  return item.name;
}

function getItemIcon(item: ContentItem): string {
  if ('stream_icon' in item) return (item as XtreamStream | XtreamVOD).stream_icon;
  return (item as XtreamSeries).cover;
}

function getItemDescription(item: ContentItem): string {
  const anyItem = item as any;
  return anyItem.plot || anyItem.overview || anyItem.description || '';
}

function getStreamUrl(item: ContentItem, type: ContentType): string {
  const id = getItemId(item);
  if (type === 'live' || type === 'sports') {
    return xtreamAPI.getLiveStreamUrl(id);
  } else if (type === 'movies') {
    const vod = item as XtreamVOD;
    return xtreamAPI.getVODStreamUrl(id, vod.container_extension || 'mp4');
  }
  return '';
}

// Mini video player component for preview

function MiniPlayer({ url, onStop, onTapFullscreen }: { url: string; onStop?: () => void; onTapFullscreen?: () => void }) {
  // useVideoPlayer is initialised with the current URL.
  // The parent passes a `key={url}` so this component fully remounts
  // whenever the URL changes — guaranteeing ExoPlayer starts a fresh session
  // with no stale state from a previous stream.
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.muted = false;  // Play with sound
    p.play();  // Auto-play when preview URL is set (single tap)
  });

  // Cleanup: fully stop player when component unmounts (stops audio overlap)
  useEffect(() => {
    return () => {
      try {
        player.pause();
        player.muted = true;
        player.currentTime = 0;
        // Force release to prevent background player instances
        if (player.release) {
          player.release();
        }
      } catch (e) {
        // Silently ignore release errors
      }
    };
  }, [player]);

  // Additional cleanup on URL change
  useEffect(() => {
    return () => {
      try {
        player.pause();
        player.muted = true;
        player.currentTime = 0;
      } catch {}
    };
  }, [url, player]);

  return (
    <View style={{ flex: 1 }}>
      <VideoView
        style={styles.miniPlayerVideo}
        player={player}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        contentFit="contain"
        nativeControls={false}
      />
      {/* Tap overlay: tapping the video area opens fullscreen */}
      {onTapFullscreen && (
        <Pressable
          focusable={true}
          style={StyleSheet.absoluteFill}
          onPress={onTapFullscreen}
        />
      )}
    </View>
  );
}

// ── Memoized content row ──────────────────────────────────────────────────
// Only re-renders when its own data props change (focus, selection, fav,...),
// not on every D-pad move across the whole list. The custom comparator
// ignores the callback props (their identity changes each render but they
// don't affect this row's visuals).
type ContentRowProps = {
  item: ContentItem; index: number; isTV: boolean; name: string;
  icon?: string | null; isFav: boolean; isSelected: boolean; isFocused: boolean;
  preferFocus: boolean;
  onTap: (item: ContentItem) => void;
  onFocusItem: (item: ContentItem) => void;
  onBlurItem: (item: ContentItem) => void;
  onLongPressItem: (item: ContentItem) => void;
};
const ContentRow = React.memo(function ContentRow({
  item, index, isTV, name, icon, isFav, isSelected, isFocused, preferFocus,
  onTap, onFocusItem, onBlurItem, onLongPressItem,
}: ContentRowProps) {
  return (
    <Pressable
      focusable={true}
      hasTVPreferredFocus={isTV && index === 0 && preferFocus}
      onPress={() => onTap(item)}
      onLongPress={() => onLongPressItem(item)}
      delayLongPress={2000}
      onFocus={() => onFocusItem(item)}
      onBlur={() => onBlurItem(item)}
      style={[
        isTV ? styles.tvCardItem : styles.listItem,
        isSelected && (isTV ? styles.tvCardItemActive : styles.listItemActive),
        isTV && isFocused && styles.tvFocused,
        isTV && isSelected && {
          borderLeftWidth: 4,
          borderLeftColor: '#F5A623',
          backgroundColor: 'rgba(245,166,35,0.15)',
        },
      ]}
    >
      {isTV ? (
        <>
          <Text style={styles.tvCardNum}>{index + 1}</Text>
          {icon ? (
            <ExpoImage source={icon} style={styles.tvCardIcon} contentFit="cover" cachePolicy="memory-disk" recyclingKey={icon} transition={0} />
          ) : (
            <View style={[styles.tvCardIcon, styles.listItemIconPlaceholder]}>
              <Ionicons name="tv-outline" size={24} color={SimaColors.textMuted} />
            </View>
          )}
          <View style={styles.tvCardInfo}>
            <Text style={[styles.tvCardName, isSelected && styles.tvCardNameActive]} numberOfLines={2}>{name}</Text>
            {isFav && <Ionicons name="heart" size={16} color="#E53935" style={{ marginTop: 4 }} />}
          </View>
        </>
      ) : (
        <>
          <Text style={styles.listItemNum}>{index + 1}</Text>
          {icon ? (
            <ExpoImage source={icon} style={styles.listItemIcon} contentFit="cover" cachePolicy="memory-disk" recyclingKey={icon} transition={0} />
          ) : (
            <View style={[styles.listItemIcon, styles.listItemIconPlaceholder]}>
              <Ionicons name="tv-outline" size={14} color={SimaColors.textMuted} />
            </View>
          )}
          <Text style={[styles.listItemName, isSelected && styles.listItemNameActive]} numberOfLines={1}>{name}</Text>
          {isFav && <Ionicons name="heart" size={12} color="#E53935" style={{ marginLeft: 4 }} />}
        </>
      )}
    </Pressable>
  );
}, (prev, next) =>
  prev.isFocused === next.isFocused &&
  prev.isSelected === next.isSelected &&
  prev.isFav === next.isFav &&
  prev.preferFocus === next.preferFocus &&
  prev.index === next.index &&
  prev.name === next.name &&
  prev.icon === next.icon &&
  prev.isTV === next.isTV &&
  prev.item === next.item
);

export function ContentScreen({ type, title, initialFilter }: ContentScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useXtream();
  const device = useDevice();
  const { width: winW, height: winH } = useWindowDimensions();
  const isPortrait = winH > winW;

  const [categories, setCategories] = useState<XtreamCategory[]>([]);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [allItems, setAllItems] = useState<ContentItem[]>([]); // full list for history lookup
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    initialFilter === 'favourites' ? '__favourites__' : null
  );
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  // TV: when a category is chosen, move the gold focus into the content list.
  const [pendingContentFocus, setPendingContentFocus] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null); // URL for mini preview
  const [epgInfo, setEpgInfo] = useState<EpgChannelInfo>({ current: null, next: null });
  // Search field: the input shows what the user types immediately
  // (searchInput), but the actual filtering (searchQuery, used in the
  // heavy useMemo below) is debounced by 250ms. This avoids re-running
  // the filter — and the re-render it causes — on every single
  // keystroke, which was likely behind the field losing focus after a
  // character or two on some devices.
  const [searchInput, setSearchInput] = useState('');
  const searchRef = useRef<TextInput>(null);
  const categorySearchRef = useRef<TextInput>(null);
  const [searchQuery, setSearchQuery] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setSearchQuery(searchInput), 250);
    return () => clearTimeout(id);
  }, [searchInput]);
  // Category search: same instant-display / debounced-filter split as
  // the main search field above — the input shows what's typed
  // immediately (categorySearchInput), while the actual filtering
  // (categorySearchQuery, used in the categories useMemo below) is
  // debounced by 250ms. Fixes the same focus-loss-after-a-character
  // issue the main search field had.
  const [categorySearchInput, setCategorySearchInput] = useState('');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setCategorySearchQuery(categorySearchInput), 250);
    return () => clearTimeout(id);
  }, [categorySearchInput]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [continueWatchingRecords, setContinueWatchingRecords] = useState<HistoryRecord[]>([]);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [history, setHistory] = useState<number[]>([]);
  // TV focus tracking
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // Remember last selected item ID per content type
  const [lastSelectedId, setLastSelectedId] = useState<number | null>(null);
  // Track if fullscreen player is open - prevents preview from playing
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<number | null>(null);
  const [isPlayingLoading, setIsPlayingLoading] = useState(false);
  // Ref to prevent multiple simultaneous player opens
  const playerOpeningRef = useRef(false);

  // Track last tapped item for double-tap detection
  const lastTapRef = useRef<{ id: number; time: number } | null>(null);

  // Filter categories by search query - include special categories
  const filteredCategories = useMemo(() => {
    const favCat: XtreamCategory = { category_id: '__favourites__', category_name: '★ Favourite', parent_id: 0 };
    const allCat: XtreamCategory = { category_id: '__all__', category_name: 'All', parent_id: 0 };
    // Requirement #9: label only — Live TV & Sports show "Watch History",
    // Movies & Series keep "Continue Watching". No change to underlying logic/storage.
    const historyLabel = (type === 'live' || type === 'sports') ? '▶ Watch History' : '▶ Continue Watching';
    const historyCat: XtreamCategory = { category_id: '__history__', category_name: historyLabel, parent_id: 0 };
    const specialCategories = [historyCat, favCat, allCat];
    const regularCategories = categories.filter(cat =>
      cat.category_name.toLowerCase().includes(categorySearchQuery.toLowerCase())
    );
    return [...specialCategories, ...regularCategories];
  }, [categories, categorySearchQuery, type]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const source = allItems.length > 0 ? allItems : items;
    source.forEach(item => {
      const categoryId = 'category_id' in item ? String((item as any).category_id || '') : '';
      if (!categoryId) return;
      counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
    });
    return counts;
  }, [allItems, items]);

  const favoriteType = type === 'movies' ? 'vod' : type === 'series' ? 'series' : 'live';

  useEffect(() => {
    if (isAuthenticated) {
      loadCategories();
      loadFavorites();
      loadHistory();
      // Load Continue Watching filtered by content type
      const contentType = type === 'movies' ? 'movie' : type === 'series' ? 'series' : 'live';
      if (contentType === 'series') {
        // For series: use deduped method (one record per series)
        historyService.getContinueWatchingDeduped().then(records => {
          setContinueWatchingRecords(records);
        });
      } else {
        // For movies/live: use regular getByType
        historyService.getByType(contentType).then(records => {
          setContinueWatchingRecords(records);
        });
      }
      AsyncStorage.getItem(`last_category_${type}`).then(saved => {
        if (saved) {
          setSelectedCategory(saved);
        }
      });
      loadItems(undefined);
    }
  }, [isAuthenticated, type]);

  useEffect(() => {
    if (isAuthenticated) {
      // Only fetch from server for real categories
      // Virtual categories are filtered locally in filteredItems
      if (selectedCategory && !selectedCategory.startsWith('__')) {
        loadItems(selectedCategory);
      } else if (!selectedCategory) {
        loadItems(undefined);
      }
      // Reload Continue Watching when history category is selected
      if (selectedCategory === '__history__' && type === 'series') {
        historyService.getContinueWatchingDeduped().then(records => {
          setContinueWatchingRecords(records);
        });
      }
      setSelectedItem(null);
      setPreviewUrl(null);
      // Persist last selected category
      if (selectedCategory) {
        AsyncStorage.setItem(`last_category_${type}`, selectedCategory);
      } else {
        AsyncStorage.removeItem(`last_category_${type}`);
      }
    }
  }, [selectedCategory, isAuthenticated, type]);

  // Reload Continue Watching records when screen gains focus
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated && type === 'series') {
        const contentType = 'series';
        historyService.getContinueWatchingDeduped().then(records => {
          setContinueWatchingRecords(records);
        });
      }
      return () => {};
    }, [isAuthenticated, type])
  );

  // Cleanup: Stop preview player when component unmounts (onPause/onStop equivalent)
  useEffect(() => {
    return () => {
      // Stop preview when leaving this screen
      setPreviewUrl(null);
      setSelectedItem(null);
    };
  }, []);
  // Reset fullscreen flag when returning to this screen
  useFocusEffect(
    useCallback(() => {
      return () => {
        setIsFullscreenOpen(false);
      };
    }, [])
  );

  const loadCategories = async () => {
    setIsLoadingCategories(true);
    setError(null);
    try {
      let cats: XtreamCategory[] = [];
      if (type === 'live' || type === 'sports') {
        cats = await xtreamAPI.getLiveCategories();
        if (type === 'sports') {
          cats = cats.filter(c =>
            c.category_name.toLowerCase().includes('sport') ||
            c.category_name.toLowerCase().includes('football') ||
            c.category_name.toLowerCase().includes('soccer') ||
            c.category_name.toLowerCase().includes('world cup') ||
            c.category_name.toLowerCase().includes('كرة') ||
            c.category_name.toLowerCase().includes('رياض') ||
            c.category_name.toLowerCase().includes('كأس العالم')
          );
        }
      } else if (type === 'movies') {
        cats = await xtreamAPI.getVODCategories();
      } else if (type === 'series') {
        cats = await xtreamAPI.getSeriesCategories();
      }
      // Keep server order - no custom reordering
      
      setCategories(cats);
    } catch (err: any) {
      setError(err.message || 'Failed to load categories');
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const loadItems = async (categoryId?: string) => {
    setIsLoadingItems(true);
    setError(null);
    try {
      let data: ContentItem[] = [];
      if (type === 'live' || type === 'sports') {
        data = await xtreamAPI.getLiveStreams(categoryId);
        if (type === 'sports' && !categoryId) {
          data = data.filter(item => {
            const name = item.name.toLowerCase();
            return name.includes('sport') || name.includes('football') || name.includes('soccer') || name.includes('world cup') || name.includes('كرة') || name.includes('رياض') || name.includes('كأس العالم');
          });
        }
      } else if (type === 'movies') {
        data = await xtreamAPI.getVODStreams(categoryId);
      } else if (type === 'series') {
        data = await xtreamAPI.getSeries(categoryId);
      }
      setItems(data);
      // Cache all items (no category filter) for count display and history lookup
      // Always update allItems when loading without a category filter
      if (!categoryId) {
        setAllItems(data);
      }
      // DON'T auto-select any item - user must tap to select
      setSelectedItem(null);
      setPreviewUrl(null);
      setLastSelectedId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load content');
    } finally {
      setIsLoadingItems(false);
    }
  };

  const loadFavorites = async () => {
    const favs = await xtreamAPI.getFavorites(favoriteType);
    setFavorites(favs);
  };

  const loadHistory = async () => {
    const hist = await xtreamAPI.getHistory(favoriteType);
    setHistory(hist);
  };

  // Don't restore preview after returning from player
  useFocusEffect(
    useCallback(() => {
      return () => {};
    }, [])
  );

  const handleToggleFavorite = async (id: number) => {
    const isFav = await xtreamAPI.toggleFavorite(favoriteType, id);
    setFavorites(prev =>
      isFav ? [...prev, id] : prev.filter(f => f !== id)
    );
  };

  // Navigate to fullscreen player with a given list
  const handlePlayFullscreenWithList = async (item: ContentItem, list: ContentItem[]) => {
    const id = getItemId(item);

    // Save to global history service — Live/Sports channels need this too
    // (Watch History was always empty for them otherwise, since only movies
    // were being recorded here).
    if (type === 'movies') {
      await historyService.addRecord({
        content_type: 'movie',
        content_id: id,
        content_name: item.name,
        content_poster: getItemIcon(item),
        playback_position: 0,
        duration: 0,
      });
    } else if (type === 'live' || type === 'sports') {
      await historyService.addRecord({
        content_type: 'live',
        content_id: id,
        content_name: item.name,
        content_poster: getItemIcon(item),
        playback_position: 0,
        duration: 0,
      });
    }
    
    await xtreamAPI.addToHistory(favoriteType, id);
    setHistory(prev => [id, ...prev.filter(h => h !== id)].slice(0, 50));

    if (type === 'series') {
      router.push({
        pathname: '/series-detail',
        params: { id: String(id), name: item.name },
      } as any);
      return;
    }

    const streamUrl = getStreamUrl(item, type);
    const currentIndex = list.findIndex(i => getItemId(i) === id);

    const playlist = list.map(i => ({
      id: getItemId(i),
      url: getStreamUrl(i, type),
      name: getItemName(i),
    }));

    await AsyncStorage.setItem('player_playlist', JSON.stringify(playlist));
    await AsyncStorage.setItem('player_current_index', String(currentIndex));

    setIsFullscreenOpen(true);
    setPreviewUrl(null);
    if (type === 'movies') {
      setCurrentlyPlayingId(id);
    }
    openPlayerOnce(() => router.push({
      pathname: '/player',
      params: {
        url: streamUrl,
        title: item.name,
        currentIndex: String(currentIndex),
        totalCount: String(list.length),
        contentType: type,
        replaceContent: 'true',
      },
    } as any));
  };

  // Navigate to fullscreen player, passing the full channel list for Next/Prev
  // Uses filteredItems so CH+/CH- works correctly on phone
  const handlePlayFullscreen = async (item: ContentItem) => {
    if (playerOpeningRef.current) {
      return;
    }

    playerOpeningRef.current = true;

    try {
      setPreviewUrl(null);

      await new Promise(resolve =>
        setTimeout(resolve, 300)
      );

      await handlePlayFullscreenWithList(
        item,
        filteredItems
      );

    } finally {
      setTimeout(() => {
        playerOpeningRef.current = false;
      }, 1000);
    }
  };

  // Handle item tap: single tap = select + show in mini preview, double tap = play fullscreen
  const handleItemTap = useCallback((item: ContentItem, currentFilteredItems: ContentItem[]) => {
    const id = getItemId(item);
    // Series have no inline preview and the double-tap-to-open isn't
    // discoverable with a TV remote — so a single OK/press opens the
    // episodes screen directly.
    if (type === 'series') {
      setSelectedItem(item);
      AsyncStorage.setItem(`last_item_${type}`, String(id));
      router.push({
        pathname: '/series-detail',
        params: { id: String(id), name: item.name },
      } as any);
      return;
    }
    if (device.isTV && (type === 'live' || type === 'sports')) {
      const streamUrl = getStreamUrl(item, type);
      const sameSelectedItem = selectedItem ? getItemId(selectedItem) === id : false;
      if (sameSelectedItem && previewUrl === streamUrl) {
        setPreviewUrl(null);
        handlePlayFullscreenWithList(item, currentFilteredItems);
        return;
      }

      lastTapRef.current = null;
      setSelectedItem(item);
      setCurrentlyPlayingId(id);
      AsyncStorage.setItem(`last_item_${type}`, String(id));
      setPreviewUrl(streamUrl);

      const tvgId = (item as any).epg_channel_id || (item as any).tvg_id || (item as any).name || '';
      setEpgInfo(getChannelEpg(tvgId));
      return;
    }

    const now = Date.now();
    const last = lastTapRef.current;

    if (last && last.id === id && now - last.time < 400) {
      // Double tap → play fullscreen
      lastTapRef.current = null;
      // Clear preview first to stop mini player audio before opening fullscreen
      setPreviewUrl(null);
      handlePlayFullscreenWithList(item, currentFilteredItems);
    } else {
      // Single tap → select and play mini preview
      lastTapRef.current = { id, time: now };
      setSelectedItem(item);
      // Persist last selected item
      AsyncStorage.setItem(`last_item_${type}`, String(id));
      // PLAY preview on single tap (both phone and TV — this fires on an
      // explicit OK/press, not on D-pad focus move, so no unwanted autoplay).
      if (type !== 'series') {
        setCurrentlyPlayingId(id);
        setPreviewUrl(getStreamUrl(item, type));
      } else {
        setPreviewUrl(null);
      }
      // Update EPG for live channels
      if (type === 'live' || type === 'sports') {
        const tvgId = (item as any).epg_channel_id || (item as any).tvg_id || (item as any).name || '';
        setEpgInfo(getChannelEpg(tvgId));
      } else {
        setEpgInfo({ current: null, next: null });
      }
    }
  }, [type, device.isTV, selectedItem, previewUrl]);

  const filteredItems = useMemo(() => {
    let result = items;
    if (selectedCategory === '__favourites__') {
      result = items.filter(item => favorites.includes(getItemId(item)));
    } else if (selectedCategory === '__history__') {
      const historyItems = continueWatchingRecords.map(record => {
        // For series: use series_id; for movies: use content_id
        const itemId = record.content_type === 'series' ? record.series_id : record.content_id;
        return {
          ...record,
          stream_id: itemId,
          name: record.series_name || record.content_name,
          icon: record.content_poster,
          category_id: '__history__',
        };
      }) as any as ContentItem[];
      return historyItems;
    }
    // Apply recently_added filter: sort by added/last_modified descending
    if (initialFilter === 'recently_added' && selectedCategory === null) {
      result = [...result].sort((a, b) => {
        const aTime = parseInt((a as any).added || (a as any).last_modified || '0');
        const bTime = parseInt((b as any).added || (b as any).last_modified || '0');
        return bTime - aTime;
      });
    }
    if (!searchQuery.trim()) return result;
    const q = searchQuery.toLowerCase();
    return result.filter(item => item.name.toLowerCase().includes(q));
  }, [items, searchQuery, selectedCategory, favorites, initialFilter, continueWatchingRecords, type]);

  // allCategories is now only used for TV - keep for compatibility
  const allCategories = useMemo(() => {
    const favCat: XtreamCategory = { category_id: '__favourites__', category_name: '★ Favourite', parent_id: 0 };
    const allCat: XtreamCategory = { category_id: '__all__', category_name: 'All', parent_id: 0 };
    const historyLabel = (type === 'live' || type === 'sports') ? '▶ Watch History' : '▶ Continue Watching';
    const historyCat: XtreamCategory = { category_id: '__history__', category_name: historyLabel, parent_id: 0 };
    return [historyCat, favCat, allCat, ...categories];
  }, [categories, type]);

  const renderCategoryItem = ({ item }: { item: XtreamCategory }) => {
    const isActive = (selectedCategory === null && item.category_id === '__all__') ||
                     selectedCategory === item.category_id;
    const focusKey = `cat_${item.category_id}`;
    const isFocused = focusedId === focusKey;
    return (
      <Pressable
          focusable={true}
        onPress={() => {
          if (item.category_id === '__all__') {
            setSelectedCategory(null);
          } else if (item.category_id === '__history__') {
            setSelectedCategory('__history__');
          } else {
            setSelectedCategory(item.category_id);
          }
          // Move focus into the content list after it loads (TV remote UX).
          if (device.isTV) setPendingContentFocus(true);
        }}
        onFocus={() => setFocusedId(focusKey)}
        onBlur={() => setFocusedId(null)}
        style={[
          device.isTV ? styles.tvCategoryItem : styles.categoryItem,
          isActive && styles.categoryItemActive,
          device.isTV && isFocused && styles.tvFocused,
          // Always-visible active indicator on TV
          device.isTV && isActive && {
            borderLeftWidth: 5,
            borderLeftColor: '#F5A623',
            backgroundColor: 'rgba(245,166,35,0.2)',
          },
        ]}
        hasTVPreferredFocus={false}
      >
        <Text
          style={[device.isTV ? styles.tvCategoryText : styles.categoryText, isActive && styles.categoryTextActive]}
          numberOfLines={2}
        >
          {item.category_name}
        </Text>
        {item.category_id !== '__favourites__' && item.category_id !== '__all__' && item.category_id !== '__history__' && (
          <Text style={[device.isTV ? styles.tvCategoryCount : styles.categoryCount, isActive && styles.categoryCountActive]}>
            {categoryCounts.get(item.category_id) ?? 0}
          </Text>
        )}
        {item.category_id === '__favourites__' && (
          <Text style={[device.isTV ? styles.tvCategoryCount : styles.categoryCount, isActive && styles.categoryCountActive]}>
            {favorites.length}
          </Text>
        )}
      </Pressable>
    );
  };

  // Clear the "jump to content" flag shortly after the list loads, so item 0
  // doesn't re-grab focus on later re-renders (e.g. while scrolling).
  useEffect(() => {
    if (!pendingContentFocus) return;
    const t = setTimeout(() => setPendingContentFocus(false), 180);
    return () => clearTimeout(t);
  }, [pendingContentFocus, filteredItems]);

  const renderContentItem = ({ item, index }: { item: ContentItem; index: number }) => {
    const id = getItemId(item);
    const name = getItemName(item);
    const icon = getItemIcon(item);
    const isFav = favorites.includes(id);
    const isSelected = selectedItem ? getItemId(selectedItem) === id : false;
    const isFocused = focusedId === `item_${id}`;
    // First item grabs focus ONLY right after a category is chosen (cleared
    // shortly after). Using `!lastSelectedId` here caused item 0 to re-grab
    // focus on every re-render → the chaotic focus loop. So: pendingContentFocus only.
    const preferFocus = pendingContentFocus;

    return (
      <ContentRow
        item={item}
        index={index}
        isTV={device.isTV}
        name={name}
        icon={icon}
        isFav={isFav}
        isSelected={isSelected}
        isFocused={isFocused}
        preferFocus={preferFocus}
        onTap={(it) => handleItemTap(it, filteredItems)}
        onFocusItem={(it) => {
          setFocusedId(`item_${getItemId(it)}`);
          setSelectedItem(it);
          if (!device.isTV && type !== 'series') {
            setPreviewUrl(getStreamUrl(it, type));
          }
        }}
        onBlurItem={(it) => {
          const blurId = `item_${getItemId(it)}`;
          setFocusedId(prev => (prev === blurId ? null : prev));
        }}
        onLongPressItem={(it) => {
          const fid = getItemId(it);
          handleToggleFavorite(fid);
          Alert.alert(favorites.includes(fid) ? 'Removed from Favourites' : 'Added to Favourites', getItemName(it));
        }}
      />
    );
  };

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient colors={['#0A0E1A', '#0D1225']} style={StyleSheet.absoluteFill} />
        <View style={styles.noAuthContainer}>
          <Ionicons name="lock-closed-outline" size={64} color={SimaColors.textMuted} />
          <Text style={styles.noAuthTitle}>No Playlist Added</Text>
          <Text style={styles.noAuthSubtitle}>Add a playlist to access content</Text>
          <Pressable
          focusable={true}
            onPress={() => router.push('/login' as any)}
            style={styles.addPlaylistButton}
          >
            <LinearGradient
              colors={['#2A6DB5', '#4A90D9']}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            />
            <Ionicons name="add-circle-outline" size={20} color={SimaColors.textPrimary} />
            <Text style={styles.addPlaylistText}>Add Playlist</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const selectedId = selectedItem ? getItemId(selectedItem) : null;
  const selectedIcon = selectedItem ? getItemIcon(selectedItem) : null;
  const selectedName = selectedItem ? getItemName(selectedItem) : null;
  const selectedDesc = selectedItem ? getItemDescription(selectedItem) : null;
  const selectedIsFav = selectedId ? favorites.includes(selectedId) : false;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0A0E1A', '#0D1225']} style={StyleSheet.absoluteFill} />

      {/* Header — single row: Home/tabs + page icon+name (left), logo (center), search (right) */}
      <View style={[styles.header, device.isTV && { paddingVertical: 12, paddingHorizontal: 16 }]}>
        <View style={styles.headerLeftGroup}>
          <Pressable
          focusable={true} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          onFocus={() => setFocusedId('btn_back')}
          onBlur={() => setFocusedId(null)}
          style={[styles.backButton, device.isTV && focusedId === 'btn_back' && styles.tvFocused]}>
            <Ionicons name="arrow-back" size={device.isTV ? 28 : 20} color={SimaColors.textPrimary} />
          </Pressable>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.navTabs} contentContainerStyle={styles.navTabsContent}>
            <Pressable
          focusable={true} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          onFocus={() => setFocusedId('nav_home')}
          onBlur={() => setFocusedId(null)}
          style={[styles.navTab, device.isTV && focusedId === 'nav_home' && styles.tvFocused]}>
              <Text style={styles.navTabText}>Home</Text>
            </Pressable>
            <View style={[styles.navTab, styles.navTabActive, styles.navTabWithIcon]}>
              {type === 'live' ? (
                <Image source={require('@/assets/images/icon-tile-live.png')} style={styles.navTabIcon} resizeMode="contain" />
              ) : type === 'movies' ? (
                <Image source={require('@/assets/images/icon-tile-movies.png')} style={styles.navTabIcon} resizeMode="contain" />
              ) : type === 'series' ? (
                <Image source={require('@/assets/images/icon-tile-series.png')} style={styles.navTabIcon} resizeMode="contain" />
              ) : type === 'sports' ? (
                <Text style={styles.navTabEmoji}>⚽</Text>
              ) : null}
              <Text style={[styles.navTabText, styles.navTabTextActive]}>{title}</Text>
            </View>
          </ScrollView>
        </View>

        <View style={styles.headerBrandInline}>
          <Image
            source={require('@/assets/images/logo-symbol.png')}
            style={styles.headerBrandLogo}
            resizeMode="contain"
          />
          <Text style={styles.headerBrandText}>
            <Text style={styles.headerBrandSima}>Sima</Text>
            <Text style={styles.headerBrandStream}>Stream</Text>
          </Text>
        </View>

        <Pressable
          focusable={true}
          onPress={() => searchRef.current?.focus()}
          onFocus={() => setFocusedId('search_content')}
          onBlur={() => setFocusedId(null)}
          style={[styles.headerSearch, device.isTV && focusedId === 'search_content' && styles.tvFocused]}
        >
          <Ionicons name="search-outline" size={16} color={SimaColors.textMuted} />
          <TextInput
            ref={searchRef}
            focusable={!device.isTV}
            style={styles.headerSearchInput}
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Search..."
            placeholderTextColor={SimaColors.textMuted}
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          {searchInput.length > 0 && (
            <Pressable
          focusable={true} onPress={() => setSearchInput('')}
          onFocus={() => setFocusedId('btn_clear_search')}
          onBlur={() => setFocusedId(null)}
          style={[device.isTV && focusedId === 'btn_clear_search' && styles.tvFocused]}>
              <Ionicons name="close-circle" size={14} color={SimaColors.textMuted} />
            </Pressable>
          )}
        </Pressable>
      </View>

      {/* 3-Column Layout */}
      <View style={styles.threeCol}>
        {/* LEFT: Categories */}
        <View style={styles.colLeft}>
          {isLoadingCategories ? (
            <ActivityIndicator color={SimaColors.accent} style={{ marginTop: 20 }} />
          ) : (
            <>
              {/* Category Search */}
              <Pressable
                focusable={true}
                onPress={() => categorySearchRef.current?.focus()}
                onFocus={() => setFocusedId('search_category')}
                onBlur={() => setFocusedId(null)}
                style={[styles.categorySearchContainer, device.isTV && focusedId === 'search_category' && styles.tvFocused]}
              >
                <Ionicons name="search-outline" size={14} color={SimaColors.textMuted} />
                <TextInput
                  ref={categorySearchRef}
                  focusable={!device.isTV}
                  style={styles.categorySearchInput}
                  value={categorySearchInput}
                  onChangeText={setCategorySearchInput}
                  placeholder="Search categories..."
                  placeholderTextColor={SimaColors.textMuted}
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
                {categorySearchInput.length > 0 && (
                  <Pressable
          focusable={true} onPress={() => setCategorySearchInput('')}
          onFocus={() => setFocusedId('btn_clear_catsearch')}
          onBlur={() => setFocusedId(null)}
          style={[device.isTV && focusedId === 'btn_clear_catsearch' && styles.tvFocused]}>
                    <Ionicons name="close-circle" size={14} color={SimaColors.textMuted} />
                  </Pressable>
                )}
              </Pressable>
              <FlatList
                key={`cat-${String(device.isTV)}`}
                data={filteredCategories}
                renderItem={renderCategoryItem}
                keyExtractor={item => item.category_id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingVertical: 4 }}
                extraData={focusedId}
                windowSize={5}
                maxToRenderPerBatch={10}
                initialNumToRender={12}
                removeClippedSubviews={true}
              />
            </>
          )}
        </View>

        {/* MIDDLE: Item list */}
        <View style={styles.colMiddle}>
          {isLoadingItems ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={SimaColors.accent} />
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle-outline" size={32} color={SimaColors.error} />
              <Text style={styles.errorText}>{error}</Text>
              <Pressable
          focusable={true} onPress={() => loadItems(selectedCategory ?? undefined)}
          onFocus={() => setFocusedId('btn_retry')}
          onBlur={() => setFocusedId(null)}
          style={[styles.retryButton, device.isTV && focusedId === 'btn_retry' && styles.tvFocused]}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              key={`items-${String(device.isTV)}-${selectedCategory ?? 'all'}`}
              data={filteredItems}
              renderItem={renderContentItem}
              keyExtractor={(item) => String(getItemId(item))}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 4 }}
              extraData={focusedId}
              windowSize={5}
              maxToRenderPerBatch={10}
              initialNumToRender={12}
              removeClippedSubviews={true}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No content</Text>
                </View>
              }
            />
          )}
        </View>

        {/* RIGHT: Preview panel — hidden in portrait to de-clutter; tapping an
            item plays it directly, so the preview isn't needed there. */}
        {!isPortrait && (
        <View style={styles.colRight}>
          {selectedItem ? (
            <View style={styles.previewContainer}>
              {/* The whole right column scrolls — poster/player included — so
                  Play/Favourite, the full description, and (for series) the
                  episode list always stay reachable regardless of content length. */}
              <ScrollView
                style={styles.previewScroll}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.previewScrollContent}
              >
                {/* Mini video player (Live/Movies only) - shown above channel logo */}
                {previewUrl && !isFullscreenOpen && (type === 'live' || type === 'sports') ? (
                  <View style={styles.miniPlayerContainer}>
                    <MiniPlayer
                      key={previewUrl}
                      url={previewUrl}
                      onTapFullscreen={() => selectedItem && handlePlayFullscreen(selectedItem)}
                    />
                    {/* Fullscreen expand button (bottom-right corner) */}
                    <Pressable
          focusable={true}
                      onFocus={() => setFocusedId('btn_fullscreen')}
                      onBlur={() => setFocusedId(null)}
                      style={[styles.miniPlayerFullscreenBtn, device.isTV && focusedId === 'btn_fullscreen' && styles.tvFocused]}
                      onPress={() => selectedItem && handlePlayFullscreen(selectedItem)}
                    >
                      <Ionicons name="expand-outline" size={16} color="#fff" />
                    </Pressable>
                  </View>
                ) : (
                  /* Channel logo / thumbnail */
                  <View style={styles.previewThumb}>
                    {selectedIcon ? (
                      <ExpoImage source={selectedIcon} style={styles.previewImage} contentFit="contain" cachePolicy="memory-disk" transition={0} />
                    ) : (
                      <View style={styles.previewImagePlaceholder}>
                        <Ionicons
                          name={type === 'live' || type === 'sports' ? 'tv-outline' : type === 'movies' ? 'film-outline' : 'play-circle-outline'}
                          size={36}
                          color={SimaColors.textMuted}
                        />
                      </View>
                    )}
                  </View>
                )}

                {/* Title */}
                <Text style={[styles.previewTitle, device.isTV && { fontSize: 22, fontWeight: '700', lineHeight: 28 }]}>{selectedName}</Text>
                {selectedDesc ? (
                  <Text style={[styles.previewDesc, device.isTV && { fontSize: 15, lineHeight: 22 }]}>{selectedDesc}</Text>
                ) : null}

                {/* EPG: current & next programme (Live/Sports only) */}
                {(type === 'live' || type === 'sports') && epgInfo.current && (
                  <View style={styles.epgContainer}>
                    <View style={styles.epgRow}>
                      <View style={styles.epgNowBadge}>
                        <Text style={styles.epgNowText}>NOW</Text>
                      </View>
                      <View style={styles.epgInfo}>
                        <Text style={styles.epgTitle} numberOfLines={1}>{epgInfo.current.title}</Text>
                        <Text style={styles.epgTime}>
                          {formatEpgTime(epgInfo.current.start)} – {formatEpgTime(epgInfo.current.stop)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.epgProgressTrack}>
                      <View style={[styles.epgProgressFill, { width: `${getEpgProgress(epgInfo.current)}%` as any }]} />
                    </View>
                    {epgInfo.next && (
                      <View style={[styles.epgRow, { marginTop: 6 }]}>
                        <View style={[styles.epgNowBadge, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                          <Text style={[styles.epgNowText, { color: 'rgba(255,255,255,0.5)' }]}>NEXT</Text>
                        </View>
                        <View style={styles.epgInfo}>
                          <Text style={[styles.epgTitle, { color: 'rgba(255,255,255,0.6)' }]} numberOfLines={1}>{epgInfo.next.title}</Text>
                          <Text style={styles.epgTime}>{formatEpgTime(epgInfo.next.start)}</Text>
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {/* Hint text for double tap */}
                {type !== 'series' && !previewUrl && (
                  <Text style={styles.doubleTapHint}>Tap once to preview{'\n'}Tap twice to play</Text>
                )}

                {/* Action buttons */}
                <View style={styles.previewActions}>
                  {type !== 'series' && (
                    <Pressable
          focusable={true}
                      style={[styles.previewPlayBtn, focusedId === 'btn_play' && styles.tvFocused]}
                      onFocus={() => setFocusedId('btn_play')}
                      onBlur={() => setFocusedId(null)}
                      onPress={() => selectedItem && handlePlayFullscreen(selectedItem)}
                    >
                      <LinearGradient
                        colors={['#2A6DB5', '#4A90D9']}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      />
                      <Ionicons name="play" size={device.isTV ? 20 : 14} color="#fff" />
                      <Text style={[styles.previewPlayText, device.isTV && { fontSize: 18, paddingVertical: 4 }]}>Play</Text>
                    </Pressable>
                  )}
                  {type === 'series' && (
                    <Pressable
          focusable={true}
                      style={[styles.previewPlayBtn, focusedId === 'btn_play' && styles.tvFocused]}
                      onFocus={() => setFocusedId('btn_play')}
                      onBlur={() => setFocusedId(null)}
                      onPress={() => selectedItem && handlePlayFullscreen(selectedItem)}
                    >
                      <LinearGradient
                        colors={['#2A6DB5', '#4A90D9']}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      />
                      <Ionicons name="list" size={device.isTV ? 20 : 14} color="#fff" />
                      <Text style={[styles.previewPlayText, device.isTV && { fontSize: 18, paddingVertical: 4 }]}>Episodes</Text>
                    </Pressable>
                  )}
                  <Pressable
          focusable={true}
                    style={[styles.previewFavBtn, selectedIsFav && styles.previewFavBtnActive, focusedId === 'btn_fav' && styles.tvFocused]}
                    onFocus={() => setFocusedId('btn_fav')}
                    onBlur={() => setFocusedId(null)}
                    onPress={() => selectedId && handleToggleFavorite(selectedId)}
                  >
                    <Ionicons name={selectedIsFav ? 'heart' : 'heart-outline'} size={device.isTV ? 20 : 14} color={selectedIsFav ? '#E53935' : SimaColors.textMuted} />
                    <Text style={[styles.previewFavText, selectedIsFav && { color: '#E53935' }, device.isTV && { fontSize: 18, paddingVertical: 4 }]}>
                      {selectedIsFav ? 'Saved' : 'Favourite'}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          ) : (
            <View style={styles.previewEmpty}>
              <Ionicons name="play-circle-outline" size={40} color={SimaColors.textMuted} />
              <Text style={styles.previewEmptyText}>Select an item</Text>
            </View>
          )}
        </View>
        )}

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SimaColors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: SimaColors.border,
    gap: 8,
  },
  headerLeftGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backButton: {
    padding: 4,
  },
  navTabs: {
    flex: 1,
  },
  navTabsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  navTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRightWidth: 1,
    borderRightColor: SimaColors.border,
  },
  navTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#F5A623',
  },
  navTabWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navTabIcon: { width: 28, height: 28, marginRight: 2 },
  navTabEmoji: { fontSize: 16 },
  navTabText: {
    color: SimaColors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  navTabTextActive: {
    color: '#F5A623',
    fontWeight: '700',
  },
  // Logo — centered between the Home/tabs group and the search field,
  // all three sharing the same row and vertical alignment. Symbol image
  // + real text (so the brand text's font/color stay easy to adjust).
  headerBrandInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  headerBrandLogo: {
    width: 38,
    height: 38,
  },
  headerBrandText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  headerBrandSima: {
    color: '#E8332A',
  },
  headerBrandStream: {
    color: '#E5E7E9',
  },
  headerSearch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SimaColors.bgCard,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: SimaColors.border,
  },
  headerSearchInput: {
    flex: 1,
    color: SimaColors.textPrimary,
    fontSize: 14,
    padding: 0,
  },
  threeCol: {
    flex: 1,
    flexDirection: 'row',
  },
  colLeft: {
    flex: 25,
    borderRightWidth: 1,
    borderRightColor: SimaColors.border,
    backgroundColor: 'rgba(10,14,26,0.95)',
  },
  colMiddle: {
    flex: 40,
    borderRightWidth: 1,
    borderRightColor: SimaColors.border,
  },
  colRight: {
    flex: 35,
    backgroundColor: 'rgba(10,14,26,0.9)',
  },
  // TV-specific category item overrides
  tvCategoryItem: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(42,53,80,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
  },
  tvCategoryText: {
    color: SimaColors.textSecondary,
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  tvCategoryCount: {
    color: SimaColors.textMuted,
    fontSize: 14,
    marginLeft: 6,
    fontWeight: '500',
  },
  categoryItem: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(42,53,80,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryItemActive: {
    backgroundColor: 'rgba(74,144,217,0.15)',
    borderLeftWidth: 3,
    borderLeftColor: SimaColors.accent,
  },
  categoryText: {
    color: SimaColors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  categoryTextActive: {
    color: '#F5A623',
    fontWeight: '700',
  },
  categoryCount: {
    color: SimaColors.textMuted,
    fontSize: 10,
    marginLeft: 4,
  },
  categoryCountActive: {
    color: '#F5A623',
  },
  categorySearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SimaColors.bgCard,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
    marginHorizontal: 8,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: SimaColors.border,
  },
  categorySearchInput: {
    flex: 1,
    color: SimaColors.textPrimary,
    fontSize: 12,
    padding: 0,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(42,53,80,0.3)',
    gap: 6,
  },
  listItemActive: {
    backgroundColor: 'rgba(74,144,217,0.2)',
  },
  listItemNum: {
    color: SimaColors.textMuted,
    fontSize: 11,
    width: 18,
    textAlign: 'right',
  },
  listItemIcon: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: SimaColors.bgCardDark,
  },
  listItemIconPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  listItemName: {
    flex: 1,
    color: SimaColors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  listItemNameActive: {
    color: '#F5A623',
    fontWeight: '700',
  },
  previewContainer: {
    flex: 1,
    padding: 8,
  },
  // The entire right column scrolls (poster/player + title + description +
  // EPG + actions), so everything stays reachable regardless of content
  // length (Requirement: full right-panel scroll).
  previewScroll: {
    flex: 1,
  },
  previewScrollContent: {
    gap: 8,
    paddingBottom: 12,
  },
  // Mini video player styles
  miniPlayerContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
  },
  miniPlayerVideo: {
    width: '100%',
    height: '100%',
  },
  miniPlayerFullscreenBtn: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewThumb: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: SimaColors.bgCardDark,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SimaColors.bgCard,
  },
  previewTitle: {
    color: SimaColors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  previewDesc: {
    color: SimaColors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  epgContainer: {
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    padding: 8,
    gap: 4,
  },
  epgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  epgNowBadge: {
    backgroundColor: 'rgba(220,38,38,0.8)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    minWidth: 36,
    alignItems: 'center',
  },
  epgNowText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  epgInfo: {
    flex: 1,
  },
  epgTitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '600',
  },
  epgTime: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    marginTop: 1,
  },
  epgProgressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    marginTop: 4,
    overflow: 'hidden',
  },
  epgProgressFill: {
    height: 3,
    backgroundColor: '#F5A623',
    borderRadius: 2,
  },
  doubleTapHint: {
    color: SimaColors.textMuted,
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 14,
  },
  previewActions: {
    gap: 5,
  },
  previewPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    overflow: 'hidden',
    gap: 4,
  },
  previewPlayText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  previewFavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
    backgroundColor: SimaColors.bgCard,
    borderWidth: 1,
    borderColor: SimaColors.border,
  },
  previewFavBtnActive: {
    borderColor: '#E53935',
    backgroundColor: 'rgba(229,57,53,0.1)',
  },
  previewFavText: {
    color: SimaColors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },

  previewEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  previewEmptyText: {
    color: SimaColors.textMuted,
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
  },
  errorText: {
    color: SimaColors.error,
    fontSize: 12,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: SimaColors.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  retryText: {
    color: SimaColors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: SimaColors.textMuted,
    fontSize: 13,
  },
  noAuthContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
  },
  noAuthTitle: {
    color: SimaColors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
  noAuthSubtitle: {
    color: SimaColors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
  },
  addPlaylistButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    overflow: 'hidden',
    gap: 8,
    marginTop: 8,
  },
  addPlaylistText: {
    color: SimaColors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  // TV focus indicator: amber/yellow border + highlight + scale + strong glow
  // (unified with the player screen's channel-list focus color)
  tvFocused: {
    borderWidth: 4,
    borderColor: '#F5A623',
    backgroundColor: 'rgba(245,166,35,0.35)',
    transform: [{ scale: 1.12 }],
    zIndex: 10,
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 16,
  },
  // TV horizontal card styles
  tvCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(42,53,80,0.3)',
    gap: 14,
    minHeight: 72,
    borderRadius: 4,
    marginHorizontal: 4,
    marginVertical: 2,
  },
  tvCardItemActive: {
    backgroundColor: 'rgba(74,144,217,0.25)',
    borderLeftWidth: 4,
    borderLeftColor: SimaColors.accent,
  },
  tvCardNum: {
    color: SimaColors.textMuted,
    fontSize: 14,
    width: 30,
    textAlign: 'right',
    fontWeight: '600',
  },
  tvCardIcon: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: SimaColors.bgCardDark,
  },
  tvCardInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  tvCardName: {
    color: SimaColors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 21,
  },
  tvCardNameActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
