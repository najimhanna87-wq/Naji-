/**
 * DeviceContext — stores the user-selected device type.
 *
 * Values:
 *   'phone' — touch layout, no D-pad
 *   'tv'    — large layout, D-pad + remote navigation
 *   null    — not yet selected (triggers mandatory device-select screen)
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type DeviceType = 'phone' | 'tv';

const STORAGE_KEY = 'simastream_device_type';

interface DeviceContextValue {
  deviceType: DeviceType | null;
  isLoading: boolean;
  setDeviceType: (type: DeviceType) => Promise<void>;
}

const DeviceContext = createContext<DeviceContextValue>({
  deviceType: null,
  isLoading: true,
  setDeviceType: async () => {},
});

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [deviceType, setDeviceTypeState] = useState<DeviceType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(value => {
      if (value === 'phone' || value === 'tv') {
        setDeviceTypeState(value);
      }
      setIsLoading(false);
    });
  }, []);

  const setDeviceType = async (type: DeviceType) => {
    await AsyncStorage.setItem(STORAGE_KEY, type);
    setDeviceTypeState(type);
  };

  return (
    <DeviceContext.Provider value={{ deviceType, isLoading, setDeviceType }}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDeviceContext() {
  return useContext(DeviceContext);
}
