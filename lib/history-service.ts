import AsyncStorage from '@react-native-async-storage/async-storage';

export interface HistoryRecord {
  id: string;
  content_type: 'movie' | 'series' | 'live';
  content_id: number;
  content_name: string;
  content_poster?: string;
  series_id?: number;
  series_name?: string;
  season_number?: number;
  episode_number?: number;
  episode_name?: string;
  playback_position: number;
  duration: number;
  last_watched_at: number;
}

const STORAGE_KEY = 'playback_history';
const MAX_HISTORY_ITEMS = 100;

class HistoryService {
  async addRecord(record: Omit<HistoryRecord, 'id' | 'last_watched_at'>): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      let history: HistoryRecord[] = data ? JSON.parse(data) : [];

      const id = `${record.content_type}-${record.content_id}-${record.series_id || 0}-${record.season_number || 0}-${record.episode_number || 0}`;
      history = history.filter(h => h.id !== id);

      const newRecord: HistoryRecord = {
        ...record,
        id,
        last_watched_at: Date.now(),
      };
      history.unshift(newRecord);

      if (history.length > MAX_HISTORY_ITEMS) {
        history = history.slice(0, MAX_HISTORY_ITEMS);
      }

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (err) {
      console.error('Failed to add history record:', err);
    }
  }

  async getAll(): Promise<HistoryRecord[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      try {
        const history: HistoryRecord[] = JSON.parse(data);
        if (!Array.isArray(history)) return [];
        return history.sort((a, b) => b.last_watched_at - a.last_watched_at);
      } catch (parseErr) {
        console.error('Failed to parse history data:', parseErr);
        return [];
      }
    } catch (err) {
      console.error('Failed to get history from storage:', err);
      return [];
    }
  }

  async getContinueWatching(): Promise<HistoryRecord[]> {
    try {
      const all = await this.getAll();
      const series = all.filter(h => h.content_type === 'series').slice(0, 20);
      console.log('[HistoryService] Total records:', all.length);
      console.log('[HistoryService] Series records:', series.length);
      console.log('[HistoryService] Continue Watching:', series.map(s => ({ id: s.id, name: s.series_name, season: s.season_number, episode: s.episode_number, position: s.playback_position })));
      return series;
    } catch (err) {
      console.error('Failed to get continue watching:', err);
      return [];
    }
  }

  /**
   * Get one record per series (latest episode watched).
   * Deduplicates by series_id, keeping only the most recent episode.
   */
  async getContinueWatchingDeduped(): Promise<HistoryRecord[]> {
    try {
      const all = await this.getAll();
      const seriesMap = new Map<number, HistoryRecord>();
      
      // Filter for series records and keep only the latest per series_id
      for (const record of all) {
        if (record.content_type === 'series' && record.series_id) {
          if (!seriesMap.has(record.series_id) || 
              (record.last_watched_at > (seriesMap.get(record.series_id)?.last_watched_at || 0))) {
            seriesMap.set(record.series_id, record);
          }
        }
      }
      
      // Convert to array and limit to 20
      const result = Array.from(seriesMap.values())
        .sort((a, b) => b.last_watched_at - a.last_watched_at)
        .slice(0, 20);
      
      console.log('[HistoryService] Continue Watching (deduped):', result.map(s => ({ 
        series_id: s.series_id, 
        name: s.series_name, 
        season: s.season_number, 
        episode: s.episode_number, 
        position: s.playback_position 
      })));
      
      return result;
    } catch (err) {
      console.error('Failed to get deduped continue watching:', err);
      return [];
    }
  }

  async getByType(contentType: 'movie' | 'series' | 'live'): Promise<HistoryRecord[]> {
    try {
      const all = await this.getAll();
      return all.filter(h => h.content_type === contentType);
    } catch (err) {
      console.error('Failed to get history by type:', err);
      return [];
    }
  }

  async getRecord(contentType: string, contentId: number, seriesId?: number, season?: number, episode?: number): Promise<HistoryRecord | null> {
    try {
      const id = `${contentType}-${contentId}-${seriesId || 0}-${season || 0}-${episode || 0}`;
      const all = await this.getAll();
      return all.find(h => h.id === id) || null;
    } catch (err) {
      console.error('Failed to get record:', err);
      return null;
    }
  }

  async updatePosition(contentType: string, contentId: number, position: number, duration: number, seriesId?: number, season?: number, episode?: number): Promise<void> {
    try {
      const record = await this.getRecord(contentType, contentId, seriesId, season, episode);
      if (record) {
        await this.addRecord({
          ...record,
          playback_position: position,
          duration,
        });
      }
    } catch (err) {
      console.error('Failed to update position:', err);
    }
  }

  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error('Failed to clear history:', err);
    }
  }

  async deleteRecord(contentType: string, contentId: number, seriesId?: number, season?: number, episode?: number): Promise<void> {
    try {
      const id = `${contentType}-${contentId}-${seriesId || 0}-${season || 0}-${episode || 0}`;
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (!data) return;
      let history: HistoryRecord[] = JSON.parse(data);
      history = history.filter(h => h.id !== id);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (err) {
      console.error('Failed to delete record:', err);
    }
  }
}

export const historyService = new HistoryService();
