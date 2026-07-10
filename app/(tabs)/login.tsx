import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useDevice } from '@/hooks/use-device';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SimaColors, APP_INFO } from '@/constants/theme';
import { useXtream } from '@/lib/xtream-context';

export default function LoginScreen() {
  const router = useRouter();
  const device = useDevice();
  const insets = useSafeAreaInsets();
  const { login, isLoading } = useXtream();

  const [focusedId, setFocusedId] = useState<string | null>(null);

  // Server URL is fixed and hidden from user
  const server = APP_INFO.server;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const usernameRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter your username and password');
      return;
    }

    try {
      await login({
        server: server,
        username: username.trim(),
        password: password.trim(),
      });

      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Login Failed', err.message || 'Invalid credentials. Please check your username and password.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={['#0A0E1A', '#0D1225', '#0A0E1A']}
        style={[styles.container, { paddingTop: insets.top }]}
      >
        <View style={styles.scrollContent}>
          {/* Logo */}
          <View style={styles.logoSection}>
            <Image
              source={require('@/assets/images/logo-symbol.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.logoBrandText}>
              <Text style={styles.logoBrandSima}>Sima</Text>
              <Text style={styles.logoBrandStream}>Stream</Text>
            </Text>
            <Text style={styles.logoSubtitle}>Add Your Playlist</Text>
          </View>

          {/* Form */}
          <View style={styles.formContainer}>
            {/* Username */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Username</Text>
              <View style={[styles.inputWrapper, device.isTV && focusedId === 'username' && styles.tvFocusedInput]}>
                <Ionicons name="person-outline" size={18} color={SimaColors.textMuted} style={styles.inputIcon} />
                <TextInput
                  ref={usernameRef}
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  onFocus={() => setFocusedId('username')}
                  onBlur={() => setFocusedId(null)}
                  placeholder="Enter username"
                  placeholderTextColor={SimaColors.textMuted}
                  autoCapitalize="none"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.inputWrapper, { flex: 1 }, device.isTV && focusedId === 'password' && styles.tvFocusedInput]}>
                  <Ionicons name="lock-closed-outline" size={18} color={SimaColors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    ref={passwordRef}
                    style={[styles.input, { flex: 1 }]}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setFocusedId('password')}
                    onBlur={() => setFocusedId(null)}
                    placeholder="Enter password"
                    placeholderTextColor={SimaColors.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                </View>
                <Pressable
                  focusable={true}
                  onPress={() => setShowPassword(!showPassword)}
                  onFocus={() => setFocusedId('eye')}
                  onBlur={() => setFocusedId(null)}
                  style={[styles.eyeButtonStandalone, device.isTV && focusedId === 'eye' && styles.tvFocusedInput]}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={SimaColors.textMuted}
                  />
                </Pressable>
              </View>
            </View>

            {/* Connect Button */}
            <Pressable
          focusable={true}
              onPress={handleLogin}
              disabled={isLoading}
              onFocus={() => setFocusedId('connect')}
              onBlur={() => setFocusedId(null)}
              style={[styles.loginButton, device.isTV && focusedId === 'connect' && styles.tvFocused]}
            >
              <LinearGradient
                colors={['#2A6DB5', '#4A90D9']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              />
              {isLoading ? (
                <ActivityIndicator color={SimaColors.textPrimary} />
              ) : (
                <>
                  <Ionicons name="log-in-outline" size={20} color={SimaColors.textPrimary} />
                  <Text style={styles.loginButtonText}>Connect</Text>
                </>
              )}
            </Pressable>
          </View>

          {/* Back button */}
          <Pressable
          focusable={true}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            onFocus={() => setFocusedId('back')}
            onBlur={() => setFocusedId(null)}
            style={[styles.backButton, device.isTV && focusedId === 'back' && styles.tvFocused]}
          >
            <Ionicons name="arrow-back-outline" size={18} color={SimaColors.textSecondary} />
            <Text style={styles.backButtonText}>Back to Home</Text>
          </Pressable>
        </View>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tvFocused: {
    borderWidth: 4,
    borderColor: '#F5A623',
    backgroundColor: 'rgba(245,166,35,0.25)',
    transform: [{ scale: 1.05 }],
    zIndex: 10,
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 16,
  },
  // Lighter ring for TextInput wrappers: border + glow only, NO scale/zIndex
  // (scaling a wrapper that contains a TextInput breaks typing on Android TV).
  tvFocusedInput: {
    borderColor: '#F5A623',
    borderWidth: 2,
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 10,
  },
  scrollContent: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 24,
    padding: 20,
  },
  logoSection: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  logoImage: {
    width: 120,
    height: 120,
  },
  logoBrandText: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  logoBrandSima: {
    color: '#E8332A',
  },
  logoBrandStream: {
    color: '#E5E7E9',
  },
  logoSubtitle: {
    color: SimaColors.textSecondary,
    fontSize: 16,
    fontWeight: '500',
    marginTop: 8,
  },
  formContainer: {
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    color: SimaColors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SimaColors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SimaColors.border,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: SimaColors.textPrimary,
    fontSize: 15,
    paddingVertical: 14,
  },
  eyeButton: {
    padding: 4,
  },
  eyeButtonStandalone: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SimaColors.bgCard,
    borderWidth: 1,
    borderColor: SimaColors.border,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    overflow: 'hidden',
    gap: 8,
    marginTop: 8,
  },
  loginButtonText: {
    color: SimaColors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
    padding: 12,
  },
  backButtonText: {
    color: SimaColors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
});
