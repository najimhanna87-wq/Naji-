import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ContentScreen } from '@/components/sima/ContentScreen';

export default function MoviesScreen() {
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  return <ContentScreen type="movies" title="Movies" initialFilter={filter} />;
}
