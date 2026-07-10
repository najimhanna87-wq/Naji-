import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { SimaColors } from '@/constants/theme';

interface SimaHeaderProps {
  /** Title for the current secondary screen (e.g. "Movies", "Series"). Omit on Home. */
  title?: string;
  /** Account expiry date string. Pass userInfo?.exp_date (unix seconds as string) or null/undefined. */
  expiryDate?: string | null;
  /** Compact mode reduces paddings for screens with tight headers (e.g. inside ContentScreen's top bar). */
  compact?: boolean;
}

function formatExpiry(expiryDate?: string | null): string {
  if (!expiryDate || expiryDate === '0') return 'Unlimited';
  try {
    const date = new Date(parseInt(expiryDate, 10) * 1000);
    if (isNaN(date.getTime())) return 'Unlimited';
    return date.toLocaleDateString();
  } catch {
    return 'Unlimited';
  }
}

/**
 * SimaHeader — the shared branded header used across Home and every
 * secondary screen (Movies, Series, Live TV, Sports, Settings, Search,
 * Favorites, Continue Watching/Watch History, etc).
 *
 * Shows: logo, "SimaStream" / "by Naji", live clock, live date, and
 * account expiry date. Does not touch auth, navigation, or playback —
 * purely presentational.
 */
export function SimaHeader({ title, expiryDate, compact = false }: SimaHeaderProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000 * 30); // refresh every 30s, no need for per-second re-render
    return () => clearInterval(id);
  }, []);

  const timeText = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const dateText = now.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <View style={styles.left}>
        <View style={styles.logoIconWrap}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>
        <View>
          <View style={styles.brandRow}>
            <Text style={[styles.brandText, compact && styles.brandTextCompact]}>SimaStream</Text>
          </View>
          <Text style={[styles.byNaji, compact && styles.byNajiCompact]}>by Naji</Text>
        </View>
      </View>

      {title ? (
        <Text style={styles.pageTitle} numberOfLines={1}>{title}</Text>
      ) : null}

      <View style={styles.right}>
        <Text style={[styles.timeText, compact && styles.timeTextCompact]}>{timeText}</Text>
        <Text style={[styles.dateText, compact && styles.dateTextCompact]}>{dateText}</Text>
        <View style={styles.expiryRow}>
          <Text style={[styles.expiryLabel, compact && styles.expiryLabelCompact]}>Expires </Text>
          <Text style={[styles.expiryValue, compact && styles.expiryValueCompact]}>{formatExpiry(expiryDate)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 10,
  },
  containerCompact: {
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 4,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SimaColors.bgCard,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandText: {
    color: SimaColors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  brandTextCompact: {
    fontSize: 13,
  },
  byNaji: {
    color: SimaColors.accentLight,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  byNajiCompact: {
    fontSize: 9,
  },
  pageTitle: {
    flex: 1,
    textAlign: 'center',
    color: SimaColors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  right: {
    alignItems: 'flex-end',
    gap: 1,
  },
  timeText: {
    color: SimaColors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  timeTextCompact: {
    fontSize: 11,
  },
  dateText: {
    color: SimaColors.textMuted,
    fontSize: 10,
    fontWeight: '500',
  },
  dateTextCompact: {
    fontSize: 9,
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  expiryLabel: {
    color: SimaColors.textSecondary,
    fontSize: 10,
    fontWeight: '500',
  },
  expiryLabelCompact: {
    fontSize: 9,
  },
  expiryValue: {
    color: SimaColors.textGreen,
    fontSize: 10,
    fontWeight: '700',
  },
  expiryValueCompact: {
    fontSize: 9,
  },
});
