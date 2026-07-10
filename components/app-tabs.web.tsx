import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Link, usePathname } from 'expo-router';

export default function AppTabsWeb() {
  const pathname = usePathname();

  const tabs = [
    { name: 'index', label: 'Home', href: '/' },
    { name: 'explore', label: 'Explore', href: '/explore' },
    { name: 'playlist', label: 'Playlist', href: '/playlist' },
    { name: 'settings', label: 'Settings', href: '/settings' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.innerContainer}>
        <Text style={[styles.brandText, { color: '#4A90D9', fontSize: 18, fontWeight: 'bold' }]}>
          SimaStream
        </Text>

        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link key={tab.name} href={tab.href as any} asChild>
              <Pressable
                style={({ pressed }) => [
                  styles.tabButton,
                  isActive && styles.tabButtonActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            </Link>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: '#161b26',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  innerContainer: {
    width: '100%',
    maxWidth: 1200,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandText: {
    marginRight: 'auto',
  },
  tabButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  tabButtonActive: {
    backgroundColor: 'rgba(74,144,217,0.15)',
  },
  tabText: {
    color: '#8e9aa8',
    fontSize: 14,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#4A90D9',
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});