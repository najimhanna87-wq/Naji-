import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
  ScrollView,
  Image,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useXtream } from '../lib/xtream-context';
import UserAvatar from '@/components/sima/UserAvatar';
import { useDevice } from '../hooks/use-device';
import { TVHomeScreen } from '../components/sima/TVHomeScreen';

import xtreamAPI, {
  XtreamVOD,
  XtreamSeries,
} from '../lib/xtream-api';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

function RecentMovieCard({ item, width, height, fontSm, onPress }: any) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.recentItem, { width }]} activeOpacity={0.8}>
      {item.stream_icon ? (
        <Image source={{ uri: item.stream_icon }} style={{ width, height, borderRadius: 12 }} resizeMode="cover" />
      ) : (
        <View style={{ width, height, borderRadius: 12, backgroundColor: '#1E2A45', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="film-outline" size={32} color="#666" />
        </View>
      )}
      <Text style={[styles.recentName, { fontSize: fontSm }]} numberOfLines={1}>{item.name}</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { credentials, isAuthenticated } = useXtream();
  const device = useDevice();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [recentMovies, setRecentMovies] = useState<XtreamVOD[]>([]);
  const [recentSeries, setRecentSeries] = useState<XtreamSeries[]>([]);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
    if (isAuthenticated) loadData();
  }, [isAuthenticated]);

  const loadData = async () => {
    try {
      const movies = await xtreamAPI.getVODStreams();
      setRecentMovies(movies.slice(0, 15));
      const series = await xtreamAPI.getSeries();
      setRecentSeries(series.slice(0, 15));
    } catch (e) {
        console.error("Error loading data:", e);
    }
  };

  const navigateTo = (route: string) => router.push(route as any);

  const PADDING = 24;
  const GAP = 15;
  const contentWidth = SCREEN_WIDTH - (PADDING * 2);
  const liveWidth = contentWidth * 0.45;
  const gridWidth = contentWidth - liveWidth - GAP;
  const cardSize = (gridWidth - GAP) / 2;

  if (device.isTV) {
    return <TVHomeScreen recentMovies={recentMovies} recentSeries={recentSeries} expiryText="" username={credentials?.username} />;
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <LinearGradient colors={['#080C18', '#0A0E1A', '#0D1225']} style={StyleSheet.absoluteFill} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 15, paddingBottom: 40, paddingHorizontal: PADDING }}>
        <View style={styles.header}>
          <View>
            <Text style={styles.welcome}>Welcome back,</Text>
            <Text style={styles.username}>{credentials?.username || 'User'}</Text>
          </View>
          <TouchableOpacity onPress={() => navigateTo('/settings')}>
            <UserAvatar name={credentials?.username || 'U'} size={40} />
          </TouchableOpacity>
        </View>

        <View style={styles.mainGrid}>
          <TouchableOpacity onPress={() => navigateTo('/live')} style={[styles.liveCard, { width: liveWidth, height: cardSize * 2 + GAP }]}>
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={StyleSheet.absoluteFill} />
            <View style={styles.liveContent}>
              <Ionicons name="tv-outline" size={40} color="#fff" />
              <Text style={styles.liveTitle}>LIVE TV</Text>
            </View>
          </TouchableOpacity>

          <View style={[styles.rightGrid, { width: gridWidth, gap: GAP }]}>
            {[
              { id: 'movies', label: 'Movies', icon: 'film-outline', route: '/movies', color: '#1A6FA8' },
              { id: 'series', label: 'Series', icon: 'play-circle-outline', route: '/series', color: '#7C3AED' },
              { id: 'sports', label: 'Sports', icon: 'trophy-outline', route: '/sports', color: '#EA580C' },
              { id: 'playlist', label: 'Playlist', icon: 'list-outline', route: '/playlist', color: '#059669' },
            ].map(item => (
              <TouchableOpacity key={item.id} onPress={() => navigateTo(item.route)} style={[styles.menuCard, { width: cardSize, height: cardSize }]}>
                <LinearGradient colors={['#1E2A45', '#141A2E']} style={StyleSheet.absoluteFill} />
                <Ionicons name={item.icon as any} size={28} color={item.color} />
                <Text style={styles.menuLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recently Added Movies</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 15 }}>
            {recentMovies.map(movie => (
              <RecentMovieCard key={movie.stream_id} item={movie} width={130} height={180} fontSm={12} onPress={() => {}} />
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080C18' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  welcome: { color: '#666', fontSize: 14 },
  username: { color: '#fff', fontSize: 22, fontWeight: '800' },
  mainGrid: { flexDirection: 'row', gap: 15, marginBottom: 25 },
  liveCard: { borderRadius: 20, overflow: 'hidden', justifyContent: 'flex-end', padding: 20, backgroundColor: '#1E2A45' },
  liveContent: { gap: 5 },
  liveTitle: { color: '#fff', fontSize: 24, fontWeight: '900' },
  rightGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  menuCard: { borderRadius: 18, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', gap: 8 },
  menuLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  section: { marginTop: 10 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  recentItem: { gap: 8 },
  recentName: { color: '#aaa', fontWeight: '600', marginTop: 4 }
});
