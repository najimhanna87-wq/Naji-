import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import xtreamAPI, { XtreamCredentials, XtreamUserInfo, XtreamServerInfo, XtreamPlaylist } from './xtream-api';
import { loadEpg, clearEpgCache } from './epg-service';

interface XtreamContextType {
  isAuthenticated: boolean;
  credentials: XtreamCredentials | null;
  userInfo: XtreamUserInfo | null;
  serverInfo: XtreamServerInfo | null;
  playlists: XtreamPlaylist[];
  activePlaylistId: string | null;
  isLoading: boolean;
  error: string | null;
  login: (creds: XtreamCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshPlaylists: () => Promise<void>;
  setActivePlaylist: (id: string) => Promise<void>;
  addPlaylist: (playlist: Omit<XtreamPlaylist, 'id' | 'addedAt'>) => Promise<void>;
  removePlaylist: (id: string) => Promise<void>;
}

const XtreamContext = createContext<XtreamContextType | null>(null);

const STORAGE_KEYS = {
  CREDENTIALS: 'simastream_credentials',
  USER_INFO: 'simastream_user_info',
  SERVER_INFO: 'simastream_server_info',
};

export function XtreamProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [credentials, setCredentials] = useState<XtreamCredentials | null>(null);
  const [userInfo, setUserInfo] = useState<XtreamUserInfo | null>(null);
  const [serverInfo, setServerInfo] = useState<XtreamServerInfo | null>(null);
  const [playlists, setPlaylists] = useState<XtreamPlaylist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSavedCredentials();
  }, []);

  const loadSavedCredentials = async () => {
    try {
      const savedCreds = await AsyncStorage.getItem(STORAGE_KEYS.CREDENTIALS);
      const savedUserInfo = await AsyncStorage.getItem(STORAGE_KEYS.USER_INFO);
      const savedServerInfo = await AsyncStorage.getItem(STORAGE_KEYS.SERVER_INFO);
      
      if (savedCreds) {
        try {
          const creds: XtreamCredentials = JSON.parse(savedCreds);
          xtreamAPI.setCredentials(creds);
          setCredentials(creds);
          setIsAuthenticated(true);
          
          // Use a small delay for EPG to avoid blocking the main thread during startup
          // and ensure it's only loaded if authenticated.
          setTimeout(() => {
            if (isAuthenticated) {
              loadEpg(creds.server, creds.username, creds.password).catch(() => {});
            }
          }, 2000);
          
          if (savedUserInfo) {
            try { setUserInfo(JSON.parse(savedUserInfo)); } catch (e) { console.warn("Failed to parse user info:", e); }
          }
          if (savedServerInfo) {
            try { setServerInfo(JSON.parse(savedServerInfo)); } catch (e) { console.warn("Failed to parse server info:", e); }
          }
        } catch (parseErr) {
          console.error('Failed to parse saved credentials:', parseErr);
          await logout(); // Clear corrupted data
        }
      }
      
      const savedPlaylists = await xtreamAPI.getPlaylists();
      setPlaylists(savedPlaylists);
      
      const activeId = await xtreamAPI.getActivePlaylist();
      setActivePlaylistId(activeId);
    } catch (err) {
      console.error('Error loading saved credentials:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (creds: XtreamCredentials) => {
    setIsLoading(true);
    setError(null);
    try {
      const { userInfo: ui, serverInfo: si } = await xtreamAPI.authenticate(creds);
      
      await AsyncStorage.setItem(STORAGE_KEYS.CREDENTIALS, JSON.stringify(creds));
      await AsyncStorage.setItem(STORAGE_KEYS.USER_INFO, JSON.stringify(ui));
      await AsyncStorage.setItem(STORAGE_KEYS.SERVER_INFO, JSON.stringify(si));
      
      setCredentials(creds);
      setUserInfo(ui);
      setServerInfo(si);
      setIsAuthenticated(true);
      // Load EPG in background
      loadEpg(creds.server, creds.username, creds.password).catch(() => {});
      
      // Auto-add as playlist
      const existingPlaylists = await xtreamAPI.getPlaylists();
      const exists = existingPlaylists.find(p => 
        p.type === 'xtream' && p.credentials?.server === creds.server && 
        p.credentials?.username === creds.username
      );
      
      if (!exists) {
        const newPlaylist = await xtreamAPI.addPlaylist({
          name: `${creds.username}@${new URL(creds.server).hostname}`,
          url: creds.server,
          type: 'xtream',
          credentials: creds,
        });
        setPlaylists(prev => [...prev, newPlaylist]);
        await xtreamAPI.setActivePlaylist(newPlaylist.id);
        setActivePlaylistId(newPlaylist.id);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.CREDENTIALS,
      STORAGE_KEYS.USER_INFO,
      STORAGE_KEYS.SERVER_INFO,
    ]);
    setCredentials(null);
    setUserInfo(null);
    setServerInfo(null);
    setIsAuthenticated(false);
  };

  const refreshPlaylists = async () => {
    const savedPlaylists = await xtreamAPI.getPlaylists();
    setPlaylists(savedPlaylists);
  };

  const handleSetActivePlaylist = async (id: string) => {
    await xtreamAPI.setActivePlaylist(id);
    setActivePlaylistId(id);
    
    // Load credentials for this playlist
    const playlist = playlists.find(p => p.id === id);
    if (playlist?.type === 'xtream' && playlist.credentials) {
      xtreamAPI.setCredentials(playlist.credentials);
      setCredentials(playlist.credentials);
      setIsAuthenticated(true);
    }
  };

  const handleAddPlaylist = async (playlist: Omit<XtreamPlaylist, 'id' | 'addedAt'>) => {
    const newPlaylist = await xtreamAPI.addPlaylist(playlist);
    setPlaylists(prev => [...prev, newPlaylist]);
  };

  const handleRemovePlaylist = async (id: string) => {
    await xtreamAPI.removePlaylist(id);
    setPlaylists(prev => prev.filter(p => p.id !== id));
    if (activePlaylistId === id) {
      setActivePlaylistId(null);
    }
  };

  return (
    <XtreamContext.Provider value={{
      isAuthenticated,
      credentials,
      userInfo,
      serverInfo,
      playlists,
      activePlaylistId,
      isLoading,
      error,
      login,
      logout,
      refreshPlaylists,
      setActivePlaylist: handleSetActivePlaylist,
      addPlaylist: handleAddPlaylist,
      removePlaylist: handleRemovePlaylist,
    }}>
      {children}
    </XtreamContext.Provider>
  );
}

export function useXtream() {
  const ctx = useContext(XtreamContext);
  if (!ctx) throw new Error('useXtream must be used within XtreamProvider');
  return ctx;
}
