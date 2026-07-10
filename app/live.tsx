import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ContentScreen } from '@/components/sima/ContentScreen';

export default function LiveScreen() {
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  return <ContentScreen type="live" title="Live TV" initialFilter={filter} />;
}
