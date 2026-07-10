import React, { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDeviceContext } from '@/lib/device-context';
import { usePlayerSettings, PlayerOption } from '@/lib/player-settings-context';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
  Switch,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useDevice } from '@/hooks/use-device';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SimaColors, APP_INFO } from '@/constants/theme';
import { useXtream } from '@/lib/xtream-context';
import xtreamAPI from '@/lib/xtream-api';

interface SettingItem {
  id: string;
  label: string;
  subtitle?: string;
  icon: string;
  iconLib?: 'ionicons' | 'material';
  action: () => void;
  destructive?: boolean;
  comingSoon?: boolean;
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { credentials, userInfo, logout, playlists } = useXtream();
  const [streamFormat, setStreamFormat] = useState('AUTO');
  const [timeFormat, setTimeFormat] = useState('12h');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [videoQuality, setVideoQuality] = useState('Auto');
  const { deviceType, setDeviceType } = useDeviceContext();
  const device = useDevice();
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const { settings: playerSettings, setPlayerForType } = usePlayerSettings();

  const handleChangePlayer = () => {
    Alert.alert(
      'Change Player',
      'Select player for each content type',
      [
        {
          text: `Live: ${playerSettings.live === 'builtin' ? 'Built-in ✓' : 'External ✓'}`,
          onPress: () => Alert.alert(
            'Live Player',
            'Select player for Live channels',
            [
              { text: 'Built-in Player', onPress: () => setPlayerForType('live', 'builtin') },
              { text: 'External Player (VLC/MX)', onPress: () => setPlayerForType('live', 'external') },
              { text: 'Cancel', style: 'cancel' },
            ]
          ),
        },
        {
          text: `Movies: ${playerSettings.movies === 'builtin' ? 'Built-in ✓' : 'External ✓'}`,
          onPress: () => Alert.alert(
            'Movies Player',
            'Select player for Movies',
            [
              { text: 'Built-in Player', onPress: () => setPlayerForType('movies', 'builtin') },
              { text: 'External Player (VLC/MX)', onPress: () => setPlayerForType('movies', 'external') },
              { text: 'Cancel', style: 'cancel' },
            ]
          ),
        },
        {
          text: `Series: ${playerSettings.series === 'builtin' ? 'Built-in ✓' : 'External ✓'}`,
          onPress: () => Alert.alert(
            'Series Player',
            'Select player for Series episodes',
            [
              { text: 'Built-in Player', onPress: () => setPlayerForType('series', 'builtin') },
              { text: 'External Player (VLC/MX)', onPress: () => setPlayerForType('series', 'external') },
              { text: 'Cancel', style: 'cancel' },
            ]
          ),
        },
        { text: 'Close', style: 'cancel' },
      ]
    );
  };

  useEffect(() => {
    AsyncStorage.getItem('simastream_layout').then(v => { if (v) setLayout(v as 'grid' | 'list'); });
    AsyncStorage.getItem('simastream_video_quality').then(v => { if (v) setVideoQuality(v); });
  }, []);

  const handleWhatsApp = () => {
    const phone = APP_INFO.phone.replace('+', '');
    Linking.openURL(`https://wa.me/${phone}`);
  };

  const handleClearHistory = (type: 'live' | 'vod' | 'series') => {
    Alert.alert(
      'Clear History',
      `Clear ${type} watch history?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await xtreamAPI.clearHistory(type);
            Alert.alert('Done', 'History cleared successfully');
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(tabs)');
          },
        },
      ]
    );
  };

  const handleStreamFormat = () => {
    Alert.alert(
      'Live Stream Format',
      'Select stream format',
      [
        { text: 'AUTO', onPress: () => setStreamFormat('AUTO') },
        { text: 'TS', onPress: () => setStreamFormat('TS') },
        { text: 'M3U8', onPress: () => setStreamFormat('M3U8') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleTimeFormat = () => {
    Alert.alert(
      'Time Format',
      'Select time format',
      [
        { text: '12h', onPress: () => setTimeFormat('12h') },
        { text: '24h', onPress: () => setTimeFormat('24h') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleChangeLayout = () => {
    Alert.alert(
      'Change Layout',
      'Select display layout for content lists',
      [
        {
          text: 'Grid View',
          onPress: () => {
            setLayout('grid');
            AsyncStorage.setItem('simastream_layout', 'grid');
          },
        },
        {
          text: 'List View',
          onPress: () => {
            setLayout('list');
            AsyncStorage.setItem('simastream_layout', 'list');
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleVideoQuality = () => {
    Alert.alert(
      'Video Quality',
      'Select preferred video quality (Auto = best available based on network speed)',
      [
        {
          text: 'Auto (Recommended)',
          onPress: () => {
            setVideoQuality('Auto');
            AsyncStorage.setItem('simastream_video_quality', 'Auto');
          },
        },
        {
          text: 'HD (1080p)',
          onPress: () => {
            setVideoQuality('HD');
            AsyncStorage.setItem('simastream_video_quality', 'HD');
          },
        },
        {
          text: 'SD (720p)',
          onPress: () => {
            setVideoQuality('SD');
            AsyncStorage.setItem('simastream_video_quality', 'SD');
          },
        },
        {
          text: 'Low (480p)',
          onPress: () => {
            setVideoQuality('Low');
            AsyncStorage.setItem('simastream_video_quality', 'Low');
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const settingsItems: SettingItem[] = [
    {
      id: 'playlists',
      label: 'Playlists',
      subtitle: `${playlists.length} playlist(s)`,
      icon: 'albums-outline',
      action: () => router.push('/playlist' as any),
    },
    {
      id: 'change_language',
      label: 'Change Language',
      subtitle: 'English',
      icon: 'language-outline',
      action: () => Alert.alert('Info', 'Language settings coming soon'),
      comingSoon: true,
    },
    {
      id: 'change_player',
      label: 'Change Player',
      subtitle: `Live: ${playerSettings.live === 'builtin' ? 'Built-in' : 'External'} · Movies: ${playerSettings.movies === 'builtin' ? 'Built-in' : 'External'}`,
      icon: 'play-circle-outline',
      action: handleChangePlayer,
    },
    {
      id: 'parental_control',
      label: 'Parental Control',
      icon: 'shield-outline',
      action: () => Alert.alert('Info', 'Parental control coming soon'),
      comingSoon: true,
    },
    {
      id: 'change_layout',
      label: 'Change Layout',
      subtitle: layout === 'grid' ? 'Grid View' : 'List View',
      icon: 'grid-outline',
      action: handleChangeLayout,
    },
    {
      id: 'video_quality',
      label: 'Video Quality',
      subtitle: videoQuality,
      icon: 'speedometer-outline',
      action: handleVideoQuality,
    },
    {
      id: 'hide_live',
      label: 'Hide Live Categories',
      icon: 'eye-off-outline',
      action: () => Alert.alert('Info', 'Coming soon'),
      comingSoon: true,
    },
    {
      id: 'hide_vod',
      label: 'Hide VOD Categories',
      icon: 'eye-off-outline',
      action: () => Alert.alert('Info', 'Coming soon'),
      comingSoon: true,
    },
    {
      id: 'hide_series',
      label: 'Hide Series Categories',
      icon: 'eye-off-outline',
      action: () => Alert.alert('Info', 'Coming soon'),
      comingSoon: true,
    },
    {
      id: 'live_sort',
      label: 'Live Channel Sort',
      icon: 'swap-vertical-outline',
      action: () => Alert.alert('Info', 'Coming soon'),
      comingSoon: true,
    },
    {
      id: 'stream_format',
      label: 'Live Stream Format',
      subtitle: streamFormat,
      icon: 'film-outline',
      action: handleStreamFormat,
    },
    {
      id: 'time_format',
      label: 'Time Format',
      subtitle: timeFormat,
      icon: 'time-outline',
      action: handleTimeFormat,
    },
    {
      id: 'subtitle',
      label: 'Subtitle Settings',
      icon: 'text-outline',
      action: () => Alert.alert('Info', 'Subtitle settings coming soon'),
      comingSoon: true,
    },
    {
      id: 'clear_live',
      label: 'Clear History Channels',
      icon: 'trash-outline',
      action: () => handleClearHistory('live'),
      destructive: true,
    },
    {
      id: 'clear_movies',
      label: 'Clear History Movies',
      icon: 'trash-outline',
      action: () => handleClearHistory('vod'),
      destructive: true,
    },
    {
      id: 'clear_series',
      label: 'Clear History Series',
      icon: 'trash-outline',
      action: () => handleClearHistory('series'),
      destructive: true,
    },
    {
      id: 'select_device',
      label: 'Select Device Type',
      subtitle: deviceType === 'tv' ? 'TV / Smart TV' : deviceType === 'phone' ? 'Phone / Tablet' : 'Not set',
      icon: 'phone-portrait-outline',
      action: () => {
        Alert.alert(
          'Select Device Type',
          'Choose your device type to optimise the layout and controls.',
          [
            {
              text: 'TV / Smart TV',
              onPress: () => setDeviceType('tv'),
            },
            {
              text: 'Phone / Tablet',
              onPress: () => setDeviceType('phone'),
            },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      },
    },
    {
      id: 'update',
      label: 'Update Now',
      icon: 'download-outline',
      action: () => Alert.alert('SimaStream', `${APP_INFO.name}\nYou are using the latest version.`),
    },
  ];

  const renderSettingItem = (item: SettingItem, index: number) => (
    <Pressable
          focusable={true}
      key={item.id}
      hasTVPreferredFocus={device.isTV && index === 0}
      onPress={item.action}
      onFocus={() => setFocusedId(item.id)}
      onBlur={() => setFocusedId(null)}
      style={[styles.settingItem, device.isTV && focusedId === item.id && styles.tvFocused]}
    >
      <LinearGradient
        colors={['#1E2A45', '#141A2E']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <View style={[
        styles.settingIconContainer,
        item.destructive && styles.settingIconDestructive,
      ]}>
        <Ionicons
          name={item.icon as any}
          size={14}
          color={item.destructive ? SimaColors.error : SimaColors.accent}
        />
      </View>
      <View style={styles.settingInfo}>
        <Text style={[
          styles.settingLabel,
          item.destructive && styles.settingLabelDestructive,
        ]}>
          {item.label}
        </Text>
        {item.subtitle && (
          <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
        )}
      </View>
      {item.comingSoon && (
        <View style={styles.comingSoonBadge}>
          <Text style={styles.comingSoonText}>Soon</Text>
        </View>
      )}
    </Pressable>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0A0E1A', '#0D1225']} style={StyleSheet.absoluteFill} />

      {/* Header — logo+brand inline with back button and page title; WhatsApp stays here */}
      <View style={styles.header}>
        <View style={styles.headerBrandInline}>
          <Image source={require('@/assets/images/logo-symbol.png')} style={styles.headerBrandLogo} resizeMode="contain" />
          <Text style={styles.headerBrandText}>
            <Text style={styles.headerBrandSima}>Sima</Text>
            <Text style={styles.headerBrandStream}>Stream</Text>
          </Text>
        </View>
        <Pressable
          focusable={true} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          onFocus={() => setFocusedId('btn_back')}
          onBlur={() => setFocusedId(null)}
          style={[styles.backButton, device.isTV && focusedId === 'btn_back' && styles.tvFocused]}>
          <Ionicons name="arrow-back" size={22} color={SimaColors.textPrimary} />
        </Pressable>
        <View style={styles.headerLogoRow}>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>
        <Pressable
          focusable={true} onPress={handleWhatsApp}
          onFocus={() => setFocusedId('btn_whatsapp')}
          onBlur={() => setFocusedId(null)}
          style={[styles.headerPhone, device.isTV && focusedId === 'btn_whatsapp' && styles.tvFocused]}>
          <Ionicons name="logo-whatsapp" size={14} color={SimaColors.whatsapp} />
          <Text style={styles.headerPhoneText}>{APP_INFO.phone}</Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Settings Grid */}
        <View style={styles.settingsGrid}>
          {settingsItems.map(renderSettingItem)}
        </View>

        {/* Device Info */}
        <View style={styles.deviceInfo}>
          {credentials && (
            <Text style={styles.deviceInfoText}>
              Username: {credentials.username}
            </Text>
          )}
          {userInfo && (
            <Text style={styles.deviceInfoText}>
              Status: {userInfo.status || 'Active'}
            </Text>
          )}
          {userInfo?.exp_date && userInfo.exp_date !== '0' && userInfo.exp_date !== null && (
            <Text style={styles.deviceInfoText}>
              Expires: {new Date(parseInt(userInfo.exp_date) * 1000).toLocaleDateString()}
            </Text>
          )}
          <Text style={styles.deviceInfoText}>
            {APP_INFO.name}
          </Text>
        </View>

        {/* Logout */}
        {credentials && (
          <Pressable
          focusable={true} onPress={handleLogout}
          onFocus={() => setFocusedId('btn_logout')}
          onBlur={() => setFocusedId(null)}
          style={[styles.logoutButton, device.isTV && focusedId === 'btn_logout' && styles.tvFocused]}>
            <LinearGradient
              colors={['rgba(244,67,54,0.2)', 'rgba(244,67,54,0.1)']}
              style={StyleSheet.absoluteFill}
            />
            <Ionicons name="exit-outline" size={20} color={SimaColors.error} />
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SimaColors.bg,
  },
  tvFocused: {
    borderWidth: 4,
    borderColor: '#F5A623',
    backgroundColor: 'rgba(245,166,35,0.25)',
    transform: [{ scale: 1.05 }],
    zIndex: 10,
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 16,
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
  backButton: {
    padding: 4,
  },
  headerLogoRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: SimaColors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  headerPhone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerPhoneText: {
    color: SimaColors.textPrimary,
    fontSize: 10,
    fontWeight: '600',
  },
  scrollContent: {
    paddingBottom: 30,
  },
  settingsGrid: {
    paddingHorizontal: 12,
    paddingTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  settingItem: {
    width: '31%',
    flexDirection: 'column',
    alignItems: 'flex-start',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: SimaColors.border,
    padding: 8,
    gap: 4,
    minHeight: 72,
  },
  settingIconContainer: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: 'rgba(74,144,217,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingIconDestructive: {
    backgroundColor: 'rgba(244,67,54,0.15)',
  },
  settingInfo: {
    gap: 1,
  },
  settingLabel: {
    color: SimaColors.textPrimary,
    fontSize: 10,
    fontWeight: '600',
  },
  settingLabelDestructive: {
    color: SimaColors.error,
  },
  settingSubtitle: {
    color: SimaColors.accent,
    fontSize: 8,
    fontWeight: '500',
  },
  comingSoonBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(74,144,217,0.2)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  comingSoonText: {
    color: SimaColors.accent,
    fontSize: 10,
    fontWeight: '600',
  },
  deviceInfo: {
    marginHorizontal: 16,
    marginTop: 20,
    padding: 16,
    backgroundColor: SimaColors.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SimaColors.border,
    gap: 4,
    alignItems: 'center',
  },
  deviceInfoText: {
    color: SimaColors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 14,
    overflow: 'hidden',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(244,67,54,0.3)',
  },
  logoutText: {
    color: SimaColors.error,
    fontSize: 16,
    fontWeight: '700',
  },
});
