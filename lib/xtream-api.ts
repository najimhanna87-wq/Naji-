import AsyncStorage from '@react-native-async-storage/async-storage';

// Helper: create a timeout signal compatible with React Native
function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export interface XtreamCredentials {
  server: string;
  username: string;
  password: string;
}

export interface XtreamUserInfo {
  username: string;
  password: string;
  message: string;
  auth: number;
  status: string;
  exp_date: string | null;
  is_trial: string;
  active_cons: string;
  created_at: string;
  max_connections: string;
  allowed_output_formats: string[];
}

export interface XtreamServerInfo {
  xui: boolean;
  version: string;
  revision: number;
  url: string;
  port: string;
  https_port: string;
  server_protocol: string;
  rtmp_port: string;
  timezone: string;
  timestamp_now: number;
  time_now: string;
  process: boolean;
}

export interface XtreamCategory {
  category_id: string;
  category_name: string;
  parent_id: number;
}

export interface XtreamStream {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  epg_channel_id: string | null;
  added: string;
  category_id: string;
  custom_sid: string;
  tv_archive: number;
  direct_source: string;
  tv_archive_duration: number;
}

export interface XtreamVOD {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  rating: string;
  rating_5based: number;
  added: string;
  category_id: string;
  container_extension: string;
  custom_sid: string;
  direct_source: string;
  // Optional description fields — some Xtream panels include these directly
  // in get_vod_streams; others only via get_vod_info. Reading them here is
  // purely additive (no new API calls) so the preview panel can show a
  // description whenever the server already provides one.
  plot?: string;
  description?: string;
  overview?: string;
}

export interface XtreamSeries {
  num: number;
  name: string;
  series_id: number;
  cover: string;
  plot: string;
  cast: string;
  director: string;
  genre: string;
  releaseDate: string;
  last_modified: string;
  rating: string;
  rating_5based: number;
  backdrop_path: string[];
  youtube_trailer: string;
  episode_run_time: string;
  category_id: string;
}

export interface XtreamPlaylist {
  id: string;
  name: string;
  url: string;
  type: 'xtream' | 'm3u';
  credentials?: XtreamCredentials;
  addedAt: number;
}

const STORAGE_KEYS = {
  PLAYLISTS: 'simastream_playlists',
  ACTIVE_PLAYLIST: 'simastream_active_playlist',
  FAVORITES_LIVE: 'simastream_favorites_live',
  FAVORITES_VOD: 'simastream_favorites_vod',
  FAVORITES_SERIES: 'simastream_favorites_series',
  HISTORY_LIVE: 'simastream_history_live',
  HISTORY_VOD: 'simastream_history_vod',
  HISTORY_SERIES: 'simastream_history_series',
};

class XtreamAPIService {
  private credentials: XtreamCredentials | null = null;

  setCredentials(creds: XtreamCredentials) {
    this.credentials = creds;
  }

  getCredentials(): XtreamCredentials | null {
    return this.credentials;
  }

  private buildUrl(action: string, params?: Record<string, string>): string {
    if (!this.credentials) throw new Error('No credentials set');
    const { server, username, password } = this.credentials;
    let url = `${server}/player_api.php?username=${username}&password=${password}&action=${action}`;
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url += `&${key}=${value}`;
      });
    }
    return url;
  }

  async authenticate(creds: XtreamCredentials): Promise<{ userInfo: XtreamUserInfo; serverInfo: XtreamServerInfo }> {
    const url = `${creds.server}/player_api.php?username=${creds.username}&password=${creds.password}`;
    const response = await fetch(url, { signal: timeoutSignal(15000) });
    if (!response.ok) throw new Error('Authentication failed');
    const data = await response.json();
    if (!data.user_info || data.user_info.auth === 0) {
      throw new Error('Invalid credentials');
    }
    this.credentials = creds;
    return { userInfo: data.user_info, serverInfo: data.server_info };
  }

  async getLiveCategories(): Promise<XtreamCategory[]> {
    const url = this.buildUrl('get_live_categories');
    const response = await fetch(url, { signal: timeoutSignal(15000) });
    if (!response.ok) throw new Error('Failed to fetch live categories');
    return response.json();
  }

  async getLiveStreams(categoryId?: string): Promise<XtreamStream[]> {
    const params: Record<string, string> | undefined = categoryId ? { category_id: categoryId } : undefined;
    const url = this.buildUrl('get_live_streams', params);
    const response = await fetch(url, { signal: timeoutSignal(30000) });
    if (!response.ok) throw new Error('Failed to fetch live streams');
    return response.json();
  }

  async getVODCategories(): Promise<XtreamCategory[]> {
    const url = this.buildUrl('get_vod_categories');
    const response = await fetch(url, { signal: timeoutSignal(15000) });
    if (!response.ok) throw new Error('Failed to fetch VOD categories');
    return response.json();
  }

  async getVODStreams(categoryId?: string): Promise<XtreamVOD[]> {
    const params: Record<string, string> | undefined = categoryId ? { category_id: categoryId } : undefined;
    const url = this.buildUrl('get_vod_streams', params);
    const response = await fetch(url, { signal: timeoutSignal(30000) });
    if (!response.ok) throw new Error('Failed to fetch VOD streams');
    return response.json();
  }

  async getSeriesCategories(): Promise<XtreamCategory[]> {
    const url = this.buildUrl('get_series_categories');
    const response = await fetch(url, { signal: timeoutSignal(15000) });
    if (!response.ok) throw new Error('Failed to fetch series categories');
    return response.json();
  }

  async getSeries(categoryId?: string): Promise<XtreamSeries[]> {
    const params: Record<string, string> | undefined = categoryId ? { category_id: categoryId } : undefined;
    const url = this.buildUrl('get_series', params);
    const response = await fetch(url, { signal: timeoutSignal(30000) });
    if (!response.ok) throw new Error('Failed to fetch series');
    return response.json();
  }

  async getSeriesInfo(seriesId: number): Promise<any> {
    const url = this.buildUrl('get_series_info', { series_id: String(seriesId) });
    const response = await fetch(url, { signal: timeoutSignal(15000) });
    if (!response.ok) throw new Error('Failed to fetch series info');
    return response.json();
  }

  getLiveStreamUrl(streamId: number, format: string = 'ts'): string {
    if (!this.credentials) throw new Error('No credentials set');
    const { server, username, password } = this.credentials;
    return `${server}/live/${username}/${password}/${streamId}.${format}`;
  }

  getVODStreamUrl(streamId: number, containerExtension: string = 'mp4'): string {
    if (!this.credentials) throw new Error('No credentials set');
    const { server, username, password } = this.credentials;
    return `${server}/movie/${username}/${password}/${streamId}.${containerExtension}`;
  }

  getSeriesEpisodeUrl(streamId: number, containerExtension: string = 'mkv'): string {
    if (!this.credentials) throw new Error('No credentials set');
    const { server, username, password } = this.credentials;
    return `${server}/series/${username}/${password}/${streamId}.${containerExtension}`;
  }

  // Playlist management
  async getPlaylists(): Promise<XtreamPlaylist[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.PLAYLISTS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  async addPlaylist(playlist: Omit<XtreamPlaylist, 'id' | 'addedAt'>): Promise<XtreamPlaylist> {
    const playlists = await this.getPlaylists();
    const newPlaylist: XtreamPlaylist = {
      ...playlist,
      id: Date.now().toString(),
      addedAt: Date.now(),
    };
    playlists.push(newPlaylist);
    await AsyncStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(playlists));
    return newPlaylist;
  }

  async removePlaylist(id: string): Promise<void> {
    const playlists = await this.getPlaylists();
    const filtered = playlists.filter(p => p.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(filtered));
  }

  async getActivePlaylist(): Promise<string | null> {
    return AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_PLAYLIST);
  }

  async setActivePlaylist(id: string): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_PLAYLIST, id);
  }

  // Favorites management
  async getFavorites(type: 'live' | 'vod' | 'series'): Promise<number[]> {
    try {
      const key = type === 'live' ? STORAGE_KEYS.FAVORITES_LIVE 
                : type === 'vod' ? STORAGE_KEYS.FAVORITES_VOD 
                : STORAGE_KEYS.FAVORITES_SERIES;
      const data = await AsyncStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  async toggleFavorite(type: 'live' | 'vod' | 'series', id: number): Promise<boolean> {
    const favorites = await this.getFavorites(type);
    const key = type === 'live' ? STORAGE_KEYS.FAVORITES_LIVE 
              : type === 'vod' ? STORAGE_KEYS.FAVORITES_VOD 
              : STORAGE_KEYS.FAVORITES_SERIES;
    const index = favorites.indexOf(id);
    if (index >= 0) {
      favorites.splice(index, 1);
      await AsyncStorage.setItem(key, JSON.stringify(favorites));
      return false;
    } else {
      favorites.push(id);
      await AsyncStorage.setItem(key, JSON.stringify(favorites));
      return true;
    }
  }

  // History management
  async addToHistory(type: 'live' | 'vod' | 'series', id: number): Promise<void> {
    const key = type === 'live' ? STORAGE_KEYS.HISTORY_LIVE 
              : type === 'vod' ? STORAGE_KEYS.HISTORY_VOD 
              : STORAGE_KEYS.HISTORY_SERIES;
    try {
      const data = await AsyncStorage.getItem(key);
      let history: number[] = data ? JSON.parse(data) : [];
      history = history.filter(h => h !== id);
      history.unshift(id);
      if (history.length > 50) history = history.slice(0, 50);
      await AsyncStorage.setItem(key, JSON.stringify(history));
    } catch {}
  }

  async getHistory(type: 'live' | 'vod' | 'series'): Promise<number[]> {
    try {
      const key = type === 'live' ? STORAGE_KEYS.HISTORY_LIVE 
                : type === 'vod' ? STORAGE_KEYS.HISTORY_VOD 
                : STORAGE_KEYS.HISTORY_SERIES;
      const data = await AsyncStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  async clearHistory(type: 'live' | 'vod' | 'series'): Promise<void> {
    const key = type === 'live' ? STORAGE_KEYS.HISTORY_LIVE 
              : type === 'vod' ? STORAGE_KEYS.HISTORY_VOD 
              : STORAGE_KEYS.HISTORY_SERIES;
    await AsyncStorage.removeItem(key);
  }
}

export const xtreamAPI = new XtreamAPIService();
export default xtreamAPI;

// Shared "Sports" keyword filter — mirrors the inline filter used in
// ContentScreen.tsx for type==='sports' (Live channels whose name matches
// sports-related keywords). Exported so Home screens can compute an
// accurate sports title count without duplicating the keyword list.
export function isSportsChannelName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes('sport') ||
    n.includes('football') ||
    n.includes('soccer') ||
    n.includes('world cup') ||
    n.includes('كرة') ||
    n.includes('رياض') ||
    n.includes('كأس العالم')
  );
}
