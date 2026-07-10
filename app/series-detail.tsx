import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SimaColors } from '@/constants/theme';
import { useDevice } from '@/hooks/use-device';
import xtreamAPI from '@/lib/xtream-api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { historyService } from '@/lib/history-service';
import { openPlayerOnce } from '@/lib/player-navigation';

export default function SeriesDetailScreen() {
  const router = useRouter();
  const device = useDevice();
  const insets = useSafeAreaInsets();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [seriesInfo, setSeriesInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string>('1');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [savedProgress, setSavedProgress] = useState<any>(null);

  const loadSeriesInfo = useCallback(async () => {
    if (!id) return;
    console.log('[SERIES-DETAIL] Received series_id:', id);
    setIsLoading(true);
    setError(null);
    try {
      console.log('[SERIES-DETAIL] Fetching series info with id:', id);
      const info = await xtreamAPI.getSeriesInfo(parseInt(id));
      console.log('[SERIES-DETAIL] Series info loaded:', info.name, 'series_id:', info.series_id);
      setSeriesInfo(info);
      const episodesObj = info.episodes || {};
      const episodeSeasonKeys = Object.keys(episodesObj).sort((a, b) => parseInt(a) - parseInt(b));
      if (episodeSeasonKeys.length > 0) {
        setSelectedSeason(episodeSeasonKeys[0]);
      } else if (info.seasons && Object.keys(info.seasons).length > 0) {
        const sortedSeasonKeys = Object.keys(info.seasons).sort((a, b) => parseInt(a) - parseInt(b));
        setSelectedSeason(sortedSeasonKeys[0]);
      }
      setHasLoaded(true);
    } catch (err: any) {
      setError(err.message || 'Failed to load series info');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadSeriesInfo();
  }, [loadSeriesInfo]);

  // Load saved progress on focus
  useFocusEffect(
    useCallback(() => {
      const loadProgress = async () => {
        try {
          const saved = await AsyncStorage.getItem(`series_last_watched_${id}`);
          if (saved) {
            setSavedProgress(JSON.parse(saved));
          } else {
            setSavedProgress(null);
          }
        } catch {}
      };
      loadProgress();
      return () => {};
    }, [id])
  );

  const handlePlayContinue = async () => {
    if (!savedProgress || !seriesInfo) return;
    const allEpisodes = Object.values(seriesInfo.episodes || {}).flat() as any[];
    if (allEpisodes.length === 0) return;
    const episode = allEpisodes[savedProgress.episodeIndex];
    if (!episode) return;
    const url = xtreamAPI.getSeriesEpisodeUrl(episode.id, episode.container_extension || 'mkv');
    const playlist = allEpisodes.map((e: any) => ({
      id: e.id,
      url: xtreamAPI.getSeriesEpisodeUrl(e.id, e.container_extension || 'mkv'),
      name: `${name} - ${e.title || 'Episode ' + e.episode_num}`,
    }));
    await AsyncStorage.setItem('player_playlist', JSON.stringify(playlist));
    await AsyncStorage.setItem('player_current_index', String(savedProgress.episodeIndex));
    openPlayerOnce(() => router.push({
      pathname: '/player',
      params: {
        url,
        title: `${name} - ${episode.title || 'Episode ' + episode.episode_num}`,
        currentIndex: String(savedProgress.episodeIndex),
        totalCount: String(allEpisodes.length),
        contentType: 'series',
        seriesId: id,
        replaceContent: 'true',
      },
    } as any));
  };

  const handleEpisodePress = async (episode: any, allEpisodes: any[]) => {
    console.log('[SERIES-DETAIL] Playing episode with series_id:', id, 'episode:', episode.episode_num);
    const url = xtreamAPI.getSeriesEpisodeUrl(episode.id, episode.container_extension || 'mkv');
    const currentIndex = allEpisodes.findIndex(e => e.id === episode.id);
    const playlist = allEpisodes.map(e => ({
      id: e.id,
      url: xtreamAPI.getSeriesEpisodeUrl(e.id, e.container_extension || 'mkv'),
      name: `${name} - ${e.title || 'Episode ' + e.episode_num}`,
    }));
    await AsyncStorage.setItem('player_playlist', JSON.stringify(playlist));
    await AsyncStorage.setItem('player_current_index', String(currentIndex));
    
    const seasonNum = Object.keys(seriesInfo?.episodes || {}).find(s => 
      (seriesInfo?.episodes[s] || []).some((e: any) => e.id === episode.id)
    ) || '1';
    await historyService.addRecord({
      content_type: 'series',
      content_id: episode.id,
      series_id: parseInt(id || '0'),
      series_name: name || 'Unknown',
      season_number: parseInt(seasonNum),
      episode_number: episode.episode_num || 0,
      playback_position: 0,
      duration: 0,
      content_poster: seriesInfo?.info?.cover || '',
      content_name: name || 'Unknown',
    });
    
    openPlayerOnce(() => router.push({
      pathname: '/player',
      params: {
        url,
        title: `${name} - ${episode.title || 'Episode ' + episode.episode_num}`,
        currentIndex: String(currentIndex),
        totalCount: String(allEpisodes.length),
        contentType: 'series',
        seriesId: id,
        replaceContent: 'true',
      },
    } as any));
  };

  const episodesObj: Record<string, any[]> = seriesInfo?.episodes || {};
  const seasons: string[] = Object.keys(episodesObj).sort((a, b) => parseInt(a) - parseInt(b));
  const episodes: any[] = episodesObj[selectedSeason] || episodesObj[parseInt(selectedSeason)] || [];
  const sortedEpisodes = [...episodes].sort((a, b) => {
    const aNum = parseInt(String(a.episode_num || a.id || 0));
    const bNum = parseInt(String(b.episode_num || b.id || 0));
    return aNum - bNum;
  });

  // Continue Playing button needs the real season/episode number for the
  // saved progress — but the saved record only stores a flat
  // `episodeIndex` (position across all seasons concatenated), not
  // season_number/episode_number directly. Resolve them here by walking
  // the same season order used to build that flat list in player.tsx
  // (Object.values(seriesInfo.episodes).flat()).
  let continueSeasonNumber: number | null = null;
  let continueEpisodeNumber: number | null = null;
  if (savedProgress && seriesInfo?.episodes) {
    let remaining = savedProgress.episodeIndex;
    for (const seasonKey of seasons) {
      const seasonEpisodes = episodesObj[seasonKey] || [];
      if (remaining < seasonEpisodes.length) {
        continueSeasonNumber = parseInt(seasonKey);
        const ep = seasonEpisodes[remaining];
        continueEpisodeNumber = ep?.episode_num ?? (remaining + 1);
        break;
      }
      remaining -= seasonEpisodes.length;
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0A0E1A', '#0D1225']} style={StyleSheet.absoluteFill} />

      {/* Header — logo+brand inline with back button and series title, no WhatsApp */}
      <View style={styles.header}>
        <View style={styles.headerBrandInline}>
          <Image source={require('@/assets/images/logo-symbol.png')} style={styles.headerBrandLogo} resizeMode="contain" />
          <Text style={styles.headerBrandText}>
            <Text style={styles.headerBrandSima}>Sima</Text>
            <Text style={styles.headerBrandStream}>Stream</Text>
          </Text>
        </View>
        <Pressable
          focusable={true}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          onFocus={() => setFocusedId('back')}
          onBlur={() => setFocusedId(null)}
          style={[styles.backButton, device.isTV && focusedId === 'back' && styles.tvFocused]}>
          <Ionicons name="arrow-back" size={22} color={SimaColors.textPrimary} />
        </Pressable>
        <View style={styles.headerLogoRow}>
          <Text style={styles.headerTitle} numberOfLines={1}>{name}</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={SimaColors.accent} />
          <Text style={styles.loadingText}>Loading series...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={40} color={SimaColors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            focusable={true}
            hasTVPreferredFocus={device.isTV}
            onPress={loadSeriesInfo}
            onFocus={() => setFocusedId('retry')}
            onBlur={() => setFocusedId(null)}
            style={[styles.retryButton, device.isTV && focusedId === 'retry' && styles.tvFocused]}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Series Info */}
          {seriesInfo?.info && (
            <View style={styles.seriesInfoContainer}>
              {seriesInfo.info.cover && (
                <ExpoImage
                  source={{ uri: seriesInfo.info.cover }}
                  style={styles.seriesCover}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              )}
              <View style={styles.seriesDetails}>
                <Text style={styles.seriesTitle}>{name}</Text>
                {seriesInfo.info.genre && (
                  <Text style={styles.seriesGenre}>{seriesInfo.info.genre}</Text>
                )}
                {seriesInfo.info.rating && (
                  <View style={styles.ratingRow}>
                    <Ionicons name="star" size={14} color={SimaColors.warning} />
                    <Text style={styles.ratingText}>{seriesInfo.info.rating}</Text>
                  </View>
                )}
                {seriesInfo.info.plot && (
                  <Text style={styles.seriesPlot} numberOfLines={3}>{seriesInfo.info.plot}</Text>
                )}
              </View>
            </View>
          )}

          {/* Play/Continue Button */}
          {savedProgress && (
            <Pressable
              focusable={true}
              hasTVPreferredFocus={device.isTV}
              onPress={handlePlayContinue}
              onFocus={() => setFocusedId('continue')}
              onBlur={() => setFocusedId(null)}
              style={[styles.continueButton, device.isTV && focusedId === 'continue' && styles.tvFocused]}>
              <LinearGradient
                colors={[SimaColors.accent, '#3B8FD9']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Ionicons name="play" size={20} color={SimaColors.textPrimary} />
              <View style={styles.continueButtonText}>
                <Text style={styles.continueButtonLabel}>Continue Playing</Text>
                <Text style={styles.continueButtonEpisode}>
                  {continueSeasonNumber !== null && continueEpisodeNumber !== null
                    ? `S${continueSeasonNumber}:E${continueEpisodeNumber} • `
                    : ''}
                  {formatTime(savedProgress.position)}
                </Text>
              </View>
            </Pressable>
          )}

          {/* Season Selector */}
          {seasons.length > 0 && (
            <View style={styles.seasonContainer}>
              <Text style={styles.sectionTitle}>Seasons</Text>
              <FlatList
                data={seasons}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={item => item}
                contentContainerStyle={styles.seasonsList}
                extraData={focusedId}
                renderItem={({ item }) => (
                  <Pressable
                    focusable={true}
                    onPress={() => setSelectedSeason(item)}
                    onFocus={() => setFocusedId(`season_${item}`)}
                    onBlur={() => setFocusedId(null)}
                    style={[
                      styles.seasonItem,
                      selectedSeason === item && styles.seasonItemActive,
                      device.isTV && focusedId === `season_${item}` && styles.tvFocused,
                    ]}
                  >
                    <Text style={[
                      styles.seasonText,
                      selectedSeason === item && styles.seasonTextActive,
                    ]}>
                      Season {item}
                    </Text>
                  </Pressable>
                )}
              />
            </View>
          )}

          {/* Episodes */}
          <View style={styles.episodesContainer}>
            <Text style={styles.sectionTitle}>Episodes ({sortedEpisodes.length})</Text>
            {sortedEpisodes.map((episode: any, epIndex: number) => (
              <Pressable
                key={String(episode.id)}
                focusable={true}
                hasTVPreferredFocus={device.isTV && epIndex === 0 && !savedProgress}
                onPress={() => handleEpisodePress(episode, sortedEpisodes)}
                onFocus={() => setFocusedId(`ep_${episode.id}`)}
                onBlur={() => setFocusedId(null)}
                style={[
                  styles.episodeItem,
                  device.isTV && focusedId === `ep_${episode.id}` && styles.tvFocused,
                ]}
              >
                <LinearGradient
                  colors={['#1E2A45', '#141A2E']}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                />
                <View style={styles.episodeNumber}>
                  <Text style={styles.episodeNumberText}>{episode.episode_num}</Text>
                </View>
                <View style={styles.episodeInfo}>
                  <Text style={styles.episodeTitle} numberOfLines={1}>
                    {episode.title || `Episode ${episode.episode_num}`}
                  </Text>
                  {episode.info?.plot && (
                    <Text style={styles.episodePlot} numberOfLines={2}>{episode.info.plot}</Text>
                  )}
                  {episode.info?.duration && (
                    <Text style={styles.episodeDuration}>{episode.info.duration}</Text>
                  )}
                </View>
                <Ionicons name="play-circle-outline" size={28} color={SimaColors.accent} />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SimaColors.bg,
  },
  tvFocused: {
    borderColor: '#F5A623',
    borderWidth: 3,
    backgroundColor: 'rgba(245,166,35,0.12)',
  },
  headerBrandInline: {
    flexDirection: 'row',
    alignItems: 'center',
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  backButton: { padding: 4 },
  headerLogoRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: SimaColors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: SimaColors.textSecondary,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 20,
  },
  errorText: {
    color: SimaColors.error,
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: SimaColors.accent,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryText: {
    color: SimaColors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  seriesInfoContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 14,
  },
  seriesCover: {
    width: 100,
    height: 140,
    borderRadius: 10,
  },
  seriesDetails: {
    flex: 1,
    gap: 6,
  },
  seriesTitle: {
    color: SimaColors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  seriesGenre: {
    color: SimaColors.accent,
    fontSize: 13,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    color: SimaColors.warning,
    fontSize: 13,
  },
  seriesPlot: {
    color: SimaColors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    overflow: 'hidden',
    gap: 12,
  },
  continueButtonText: {
    flex: 1,
  },
  continueButtonLabel: {
    color: SimaColors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  continueButtonEpisode: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 2,
  },
  seasonContainer: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    color: SimaColors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  seasonsList: {
    gap: 8,
  },
  seasonItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: SimaColors.bgCard,
    borderWidth: 1,
    borderColor: SimaColors.border,
    marginRight: 8,
  },
  seasonItemActive: {
    backgroundColor: SimaColors.accent,
    borderColor: SimaColors.accent,
  },
  seasonText: {
    color: SimaColors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  seasonTextActive: {
    color: SimaColors.textPrimary,
    fontWeight: '700',
  },
  episodesContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  episodeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: SimaColors.border,
    padding: 12,
    gap: 12,
    marginBottom: 8,
  },
  episodeNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(74,144,217,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodeNumberText: {
    color: SimaColors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  episodeInfo: {
    flex: 1,
    gap: 3,
  },
  episodeTitle: {
    color: SimaColors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  episodePlot: {
    color: SimaColors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  episodeDuration: {
    color: SimaColors.textMuted,
    fontSize: 11,
  },
});
