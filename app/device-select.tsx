import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, StatusBar, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useDevice } from '@/hooks/use-device';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { SimaColors } from '@/constants/theme';
import { useDeviceContext } from '@/lib/device-context';

const { height } = Dimensions.get('window');

export default function DeviceSelectScreen() {
  const router = useRouter();
  const device = useDevice();
  const insets = useSafeAreaInsets();
  const { setDeviceType } = useDeviceContext();
  const [selected, setSelected] = useState<'tv' | 'phone' | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  }, []);

  const handleConfirm = async () => {
    if (!selected) return;
    await setDeviceType(selected);
    // Orientation rule: TV = landscape only; Phone = free (user decides).
    try {
      if (selected === 'tv') {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } else {
        await ScreenOrientation.unlockAsync();
      }
    } catch {}
    router.replace('/(tabs)');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar hidden />
      <LinearGradient colors={['#080C18', '#0A0E1A', '#0D1225']} style={StyleSheet.absoluteFill} />
      
      <View style={styles.header}>
        <Text style={styles.appName}>SimaStream</Text>
        <Text style={styles.title}>Select Your Device Type</Text>
      </View>

      <View style={styles.optionsRow}>
        {/* TV Option - Blue Theme */}
        <Pressable
          focusable={true}
          hasTVPreferredFocus={device.isTV}
          onPress={() => setSelected('tv')}
          onFocus={() => setFocusedId('tv')}
          onBlur={() => setFocusedId(null)}
          style={[
            styles.card,
            selected === 'tv' && { borderColor: '#1A6FA8', borderWidth: 3 },
            device.isTV && focusedId === 'tv' && styles.tvFocused,
          ]}
        >
          <LinearGradient colors={selected === 'tv' ? ['#0F2340', '#1A3A5C'] : ['#1E2A45', '#141A2E']} style={StyleSheet.absoluteFill} />
          <Ionicons name="tv-outline" size={height * 0.25} color={selected === 'tv' ? '#fff' : '#444'} />
          <Text style={styles.label}>Smart TV</Text>
          <Text style={styles.sublabel}>Android TV / FireStick</Text>
        </Pressable>

        {/* Phone Option - Purple Theme */}
        <Pressable
          focusable={true}
          onPress={() => setSelected('phone')}
          onFocus={() => setFocusedId('phone')}
          onBlur={() => setFocusedId(null)}
          style={[
            styles.card,
            selected === 'phone' && { borderColor: '#7C3AED', borderWidth: 3 },
            device.isTV && focusedId === 'phone' && styles.tvFocused,
          ]}
        >
          <LinearGradient colors={selected === 'phone' ? ['#2E1065', '#4C1D95'] : ['#1E2A45', '#141A2E']} style={StyleSheet.absoluteFill} />
          <Ionicons name="phone-portrait-outline" size={height * 0.25} color={selected === 'phone' ? '#fff' : '#444'} />
          <Text style={styles.label}>Mobile Phone</Text>
          <Text style={styles.sublabel}>Smartphone / Tablet</Text>
        </Pressable>
      </View>

      <Pressable
        focusable={true}
        onPress={handleConfirm}
        onFocus={() => setFocusedId('confirm')}
        onBlur={() => setFocusedId(null)}
        style={[
          styles.btn,
          !selected && { opacity: 0.4 },
          device.isTV && focusedId === 'confirm' && styles.tvFocused,
        ]}
        disabled={!selected}
      >
        <Text style={styles.btnText}>{selected ? 'CONFIRM & CONTINUE' : 'SELECT DEVICE'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 20 },
  header: { alignItems: 'center' },
  appName: { color: '#fff', fontSize: 32, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#888', fontSize: 18, marginTop: 5 },
  optionsRow: { flexDirection: 'row', gap: 30, width: '85%', flex: 1, marginVertical: 25 },
  card: { flex: 1, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 10, elevation: 8 },
  tvFocused: { borderColor: '#F5A623', borderWidth: 4, backgroundColor: 'rgba(245,166,35,0.12)' },
  label: { color: '#fff', fontSize: 22, fontWeight: '800' },
  sublabel: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  btn: { width: '35%', height: 50, borderRadius: 25, backgroundColor: '#1A6FA8', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '800' }
});
