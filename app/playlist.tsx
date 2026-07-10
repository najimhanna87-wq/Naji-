import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SimaColors } from '@/constants/theme';
import { useXtream } from '@/lib/xtream-context';
import { XtreamPlaylist } from '@/lib/xtream-api';

export default function PlaylistScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { playlists, activePlaylistId, setActivePlaylist, removePlaylist } = useXtream();

  const handleAddPlaylist = () => {
    router.push('/login' as any);
  };

  const handleDeletePlaylist = (playlist: XtreamPlaylist) => {
    Alert.alert(
      'Delete Playlist',
      `Are you sure you want to delete "${playlist.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => removePlaylist(playlist.id),
        },
      ]
    );
  };

  const renderPlaylistItem = ({ item }: { item: XtreamPlaylist }) => {
    const isActive = item.id === activePlaylistId;
    return (
      <TouchableOpacity
        onPress={() => setActivePlaylist(item.id)}
        style={[styles.playlistItem, isActive && styles.playlistItemActive]}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={isActive ? ['#2A3A5A', '#1E2A45'] : ['#1E2A45', '#141A2E']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <View style={styles.playlistIconContainer}>
          <Ionicons
            name={item.type === 'xtream' ? 'server-outline' : 'list-outline'}
            size={24}
            color={isActive ? SimaColors.accent : SimaColors.textSecondary}
          />
        </View>
        <View style={styles.playlistInfo}>
          <Text style={[styles.playlistName, isActive && styles.playlistNameActive]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.playlistType}>
            {item.type === 'xtream' ? 'Xtream API' : 'M3U Playlist'}
          </Text>
          {item.credentials && (
            <Text style={styles.playlistServer} numberOfLines={1}>
              User: {item.credentials.username}
            </Text>
          )}
        </View>
        {isActive && (
          <View style={styles.activeIndicator}>
            <Ionicons name="checkmark-circle" size={20} color={SimaColors.success} />
          </View>
        )}
        <TouchableOpacity
          onPress={() => handleDeletePlaylist(item)}
          style={styles.deleteButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="trash-outline" size={18} color={SimaColors.error} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0A0E1A', '#0D1225']} style={StyleSheet.absoluteFill} />

      {/* Header — logo+brand inline with back button and page title, no WhatsApp */}
      <View style={styles.header}>
        <View style={styles.headerBrandInline}>
          <Image source={require('@/assets/images/logo-symbol.png')} style={styles.headerBrandLogo} resizeMode="contain" />
          <Text style={styles.headerBrandText}>
            <Text style={styles.headerBrandSima}>Sima</Text>
            <Text style={styles.headerBrandStream}>Stream</Text>
          </Text>
        </View>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={SimaColors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerLogoRow}>
          <Text style={styles.headerTitle}>Playlists</Text>
        </View>
      </View>

      {/* Add Playlist Button */}
      <View style={styles.addContainer}>
        <TouchableOpacity
          onPress={handleAddPlaylist}
          style={styles.addButton}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#2A6DB5', '#4A90D9']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          />
          <Ionicons name="add-circle-outline" size={22} color={SimaColors.textPrimary} />
          <Text style={styles.addButtonText}>Add Playlist</Text>
        </TouchableOpacity>
      </View>

      {/* Playlists — fixed view, no scrolling, always fits the screen */}
      {playlists.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="list-outline" size={64} color={SimaColors.textMuted} />
          <Text style={styles.emptyTitle}>No Playlists</Text>
          <Text style={styles.emptySubtitle}>Add your first playlist to start watching</Text>
        </View>
      ) : (
        <View style={styles.playlistsList}>
          {playlists.map((item) => (
            <View key={item.id} style={{ flex: 1 }}>
              {renderPlaylistItem({ item })}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SimaColors.bg,
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
  addContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    overflow: 'hidden',
    gap: 8,
  },
  addButtonText: {
    color: SimaColors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  playlistsList: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 10,
  },
  playlistItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: SimaColors.border,
    padding: 14,
    gap: 12,
  },
  playlistItemActive: {
    borderColor: SimaColors.accent,
  },
  playlistIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistInfo: {
    flex: 1,
    gap: 2,
  },
  playlistName: {
    color: SimaColors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  playlistNameActive: {
    color: SimaColors.accentLight,
  },
  playlistType: {
    color: SimaColors.accent,
    fontSize: 12,
    fontWeight: '500',
  },
  playlistServer: {
    color: SimaColors.textMuted,
    fontSize: 11,
  },
  activeIndicator: {
    marginRight: 4,
  },
  deleteButton: {
    padding: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
  },
  emptyTitle: {
    color: SimaColors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: SimaColors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
  },
});
