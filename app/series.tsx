import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ContentScreen } from '@/components/sima/ContentScreen';

export default function SeriesScreen() {
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  return <ContentScreen type="series" title="Series" initialFilter={filter} />;
}
