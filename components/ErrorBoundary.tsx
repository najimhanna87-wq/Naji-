/**
 * ErrorBoundary.tsx
 *
 * Global catch-all for render-time crashes (bad imports, undefined
 * components, theme/context failures, etc).
 *
 * Without this, a single undefined component (like the UserAvatar
 * import mismatch) white-screens the entire app on both phone and TV.
 * With this, the user sees a themed fallback screen with a retry
 * button, and you get the actual error + component stack logged.
 *
 * WIRE-UP:
 *   Wrap the outermost provider stack in _layout.tsx:
 *
 *   <ErrorBoundary>
 *     <GestureHandlerRootView style={{ flex: 1 }}>
 *       <SafeAreaProvider>
 *         <ThemeProvider>
 *           ...
 *         </ThemeProvider>
 *       </SafeAreaProvider>
 *     </GestureHandlerRootView>
 *   </ErrorBoundary>
 *
 * Optionally also wrap individual risky subtrees (e.g. the player,
 * or TVHomeScreen) with their own <ErrorBoundary> so one broken
 * screen doesn't take down the whole app shell.
 *
 * NOTE: Verify the color keys below against your actual theme.ts
 * (SimaColors). This file intentionally does NOT import from your
 * theme module, so it can never itself become a crash point if
 * theme.ts is mid-broken — colors are hardcoded as safe fallbacks.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';

// Hardcoded fallback palette — deliberately not imported from theme.ts.
// If theme.ts is the thing that's broken, this screen must still render.
const FALLBACK_COLORS = {
  background: '#0A0A0A',
  surface: '#1A1A1A',
  gold: '#F5A623',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0A0',
  border: '#2A2A2A',
};

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional label to identify which subtree crashed, shown in logs and (dev only) on screen. */
  boundaryName?: string;
  /** Called after the user presses "Try Again", in addition to internal state reset. */
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Centralized log point. Swap console.error for your crash reporter
    // (Sentry, Bugsnag, etc.) if/when SimaStream adds one.
    console.error(
      `[ErrorBoundary${this.props.boundaryName ? `:${this.props.boundaryName}` : ''}]`,
      error,
      errorInfo.componentStack
    );
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>
              {this.props.boundaryName
                ? `The ${this.props.boundaryName} screen hit an unexpected error.`
                : 'SimaStream hit an unexpected error.'}
            </Text>

            {__DEV__ && this.state.error && (
              <View style={styles.devBox}>
                <Text style={styles.devLabel}>{this.state.error.toString()}</Text>
                {this.state.errorInfo?.componentStack && (
                  <Text style={styles.devStack} numberOfLines={8}>
                    {this.state.errorInfo.componentStack}
                  </Text>
                )}
              </View>
            )}

            <Pressable
              onPress={this.handleRetry}
              focusable={true}
              style={({ focused, pressed }) => [
                styles.retryButton,
                focused && styles.retryButtonFocused, // gold D-pad focus ring
                pressed && styles.retryButtonPressed,
              ]}
            >
              <Text style={styles.retryText}>Try Again</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: FALLBACK_COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: FALLBACK_COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: FALLBACK_COLORS.border,
    padding: 24,
    alignItems: 'center',
  },
  title: {
    color: FALLBACK_COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    color: FALLBACK_COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  devBox: {
    width: '100%',
    backgroundColor: '#000000',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  devLabel: {
    color: '#FF6B6B',
    fontSize: 12,
    fontFamily: Platform.select({ default: 'monospace' }),
    marginBottom: 6,
  },
  devStack: {
    color: '#888888',
    fontSize: 10,
    fontFamily: Platform.select({ default: 'monospace' }),
  },
  retryButton: {
    backgroundColor: FALLBACK_COLORS.border,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  retryButtonFocused: {
    borderColor: FALLBACK_COLORS.gold,
    backgroundColor: '#2A2A2A',
  },
  retryButtonPressed: {
    opacity: 0.7,
  },
  retryText: {
    color: FALLBACK_COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});
