/**
 * PlayerSettingsContext
 *
 * Stores the user's preferred player for each content type:
 *   live | movies | series
 *
 * Options:
 *   'builtin'  — expo-video (ExoPlayer / AVPlayer)
 *   'external' — opens the stream URL in an external app (MX Player, VLC, etc.)
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Alert } from 'react-native';

export type PlayerOption = 'builtin' | 'external';

export interface PlayerSettings {
  live: PlayerOption;
  movies: PlayerOption;
  series: PlayerOption;
}

interface PlayerSettingsContextValue {
  settings: PlayerSettings;
  setPlayerForType: (type: keyof PlayerSettings, option: PlayerOption) => void;
  /** Open a stream URL with the configured player for the given content type.
   *  Returns true if external player was used (caller should NOT navigate to /player).
   *  Returns false if built-in player should be used (caller navigates normally). */
  openWithPlayer: (type: keyof PlayerSettings, url: string, title?: string) => boolean;
}

const STORAGE_KEY = 'simastream_player_settings';

const DEFAULT_SETTINGS: PlayerSettings = {
  live: 'builtin',
  movies: 'builtin',
  series: 'builtin',
};

const PlayerSettingsContext = createContext<PlayerSettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  setPlayerForType: () => {},
  openWithPlayer: () => false,
});

export function PlayerSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<PlayerSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val) {
        try {
          const parsed = JSON.parse(val) as Partial<PlayerSettings>;
          setSettings(prev => ({ ...prev, ...parsed }));
        } catch {}
      }
    });
  }, []);

  const setPlayerForType = (type: keyof PlayerSettings, option: PlayerOption) => {
    setSettings(prev => {
      const next = { ...prev, [type]: option };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const openWithPlayer = (type: keyof PlayerSettings, url: string, title?: string): boolean => {
    const option = settings[type];
    if (option === 'external') {
      // Try to open with intent:// (Android) or vlc:// (iOS)
      const intentUrl = `intent:${url}#Intent;type=video/*;end`;
      Linking.canOpenURL(intentUrl)
        .then(supported => {
          if (supported) {
            Linking.openURL(intentUrl);
          } else {
            // Fallback: try vlc:// scheme
            const vlcUrl = `vlc://${url}`;
            Linking.canOpenURL(vlcUrl).then(vlcSupported => {
              if (vlcSupported) {
                Linking.openURL(vlcUrl);
              } else {
                Alert.alert(
                  'External Player Not Found',
                  'No external video player found. Install VLC or MX Player, or switch to Built-in player in Settings.',
                  [{ text: 'OK' }]
                );
              }
            });
          }
        })
        .catch(() => {
          Alert.alert('Error', 'Could not open external player.');
        });
      return true; // caller should NOT navigate to /player
    }
    return false; // use built-in player
  };

  return (
    <PlayerSettingsContext.Provider value={{ settings, setPlayerForType, openWithPlayer }}>
      {children}
    </PlayerSettingsContext.Provider>
  );
}

export function usePlayerSettings() {
  return useContext(PlayerSettingsContext);
}
