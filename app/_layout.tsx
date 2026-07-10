import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/lib/theme-provider';
import { XtreamProvider } from '@/lib/xtream-context';
import { DeviceProvider, useDeviceContext } from '@/lib/device-context';
import { PlayerSettingsProvider } from '@/lib/player-settings-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';

/**
 * Gate component: if no device type has been selected yet,
 * redirect to the device-select screen immediately.
 * This runs inside the Stack so the router is available.
 */
function DeviceGate() {
  const { deviceType, isLoading } = useDeviceContext();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;
    
    // Add a small delay to ensure the navigation stack is ready
    const timer = setTimeout(() => {
      const onDeviceSelect = segments[0] === 'device-select';
      if (!deviceType && !onDeviceSelect) {
        try {
          router.replace('/device-select');
        } catch (e) {
          console.warn('Navigation to device-select failed:', e);
        }
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [deviceType, isLoading, segments, router]);

  return null;
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <DeviceProvider>
            <XtreamProvider>
              <PlayerSettingsProvider>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: '#0A0E1A' },
                  animation: 'slide_from_right',
                }}
              >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="device-select"
                  options={{
                    headerShown: false,
                    animation: 'fade',
                    // Prevent going back to device-select once confirmed
                    gestureEnabled: false,
                  }}
                />
                <Stack.Screen name="login" options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }} />
                <Stack.Screen name="live" options={{ headerShown: false }} />
                <Stack.Screen name="movies" options={{ headerShown: false }} />
                <Stack.Screen name="series" options={{ headerShown: false }} />
                <Stack.Screen name="series-detail" options={{ headerShown: false }} />
                <Stack.Screen name="sports" options={{ headerShown: false }} />
                <Stack.Screen name="playlist" options={{ headerShown: false }} />
                <Stack.Screen name="settings" options={{ headerShown: false }} />
                <Stack.Screen name="player" options={{ headerShown: false }} />
              </Stack>
              <DeviceGate />
              </PlayerSettingsProvider>
            </XtreamProvider>
          </DeviceProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
