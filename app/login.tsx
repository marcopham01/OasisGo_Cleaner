import { Redirect, router } from 'expo-router';
import { Lock, UserRound } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { loginWithEmail } from '@/services/auth.service';

const SKY = '#0284c7';
const SKY_DARK = '#0369a1';
const SKY_100 = '#e0f2fe';

export default function LoginScreen() {
  const { isAuthenticated, isHydrating, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isFormValid = useMemo(() => {
    return email.trim().length > 0 && password.trim().length > 0;
  }, [email, password]);

  if (isHydrating) {
    return (
      <View style={styles.hydratingScreen}>
        <ActivityIndicator color={SKY} size="large" />
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  const handleLogin = async () => {
    if (!isFormValid || isLoading) {
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const result = await loginWithEmail({
        email: email.trim(),
        password: password.trim(),
      });

      const role = String(result.user.role || '').toLowerCase();
      if (role !== 'cleaner') {
        setError('Tài khoản này không có quyền Cleaner để đăng nhập ứng dụng.');
        return;
      }

      await signIn(result);
      router.replace('/(tabs)');
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : 'Đăng nhập thất bại';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={SKY} />
      <SafeAreaView style={styles.root} edges={['top']}>
        <KeyboardAvoidingView
          style={styles.root}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

          {/* Sky blue background section */}
          <View style={styles.topSection}>
            {/* Decorative circles */}
            <View style={styles.circleTopRight} />
            <View style={styles.circleMiddleLeft} />

            {/* Logo card */}
            <View style={styles.logoCard}>
              <Image
                source={require('@/assets/images/OasisGo_Logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.tagline}>
              Hệ thống quản lý công việc{'\n'}dọn dẹp pod ngủ
            </Text>
          </View>

          {/* White bottom form card */}
          <ScrollView
            style={styles.formSheet}
            contentContainerStyle={styles.formSheetContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>

            <Text style={styles.formTitle}>Đăng nhập</Text>
            <Text style={styles.formSubtitle}>Vui lòng nhập mã nhân viên để tiếp tục</Text>

            {/* Employee code field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>TÀI KHOẢN (EMAIL)</Text>
              <View style={styles.inputWrap}>
                <View style={styles.inputIcon}>
                  <UserRound size={20} color="#94a3b8" />
                </View>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder=""
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                />
              </View>
            </View>

            {/* Password field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>MẬT KHẨU</Text>
              <View style={styles.inputWrap}>
                <View style={styles.inputIcon}>
                  <Lock size={20} color="#94a3b8" />
                </View>
                <TextInput
                  secureTextEntry
                  placeholder="••••••••"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                />
              </View>
            </View>

            {/* Forgot password */}
            <View style={styles.forgotRow}>
              <Pressable>
                <Text style={styles.forgotText}>Quên mật khẩu?</Text>
              </Pressable>
            </View>

            {/* Error message */}
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Submit button */}
            <Pressable
              style={[styles.submitBtn, (!isFormValid || isLoading) && styles.submitBtnDisabled]}
              onPress={handleLogin}
              disabled={!isFormValid || isLoading}>
              {isLoading ? (
                <View style={styles.submitBtnInner}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.submitBtnText}>Đang xác thực...</Text>
                </View>
              ) : (
                <Text style={styles.submitBtnText}>Bắt đầu ca làm việc</Text>
              )}
            </Pressable>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SKY,
  },
  hydratingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f3f3',
  },

  /* ── Top blue section ── */
  topSection: {
    height: 300,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 36,
    overflow: 'hidden',
  },
  circleTopRight: {
    position: 'absolute',
    top: -80,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  circleMiddleLeft: {
    position: 'absolute',
    top: 120,
    left: -80,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  logoCard: {
    width: 160,
    height: 120,
    backgroundColor: '#ffffff',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 16 },
      android: { elevation: 10 },
      web: { boxShadow: '0 8px 24px rgba(0,0,0,0.18)' } as any,
    }),
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  tagline: {
    color: SKY_100,
    fontSize: 13,
    fontFamily: Fonts.sans,
    textAlign: 'center',
    lineHeight: 20,
  },

  /* ── White form sheet ── */
  formSheet: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.10, shadowRadius: 20 },
      android: { elevation: 12 },
      web: { boxShadow: '0 -10px 40px rgba(0,0,0,0.10)' } as any,
    }),
  },
  formSheetContent: {
    paddingHorizontal: 32,
    paddingTop: 36,
    paddingBottom: 48,
  },
  formTitle: {
    fontSize: 26,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    color: '#1e293b',
    marginBottom: 4,
  },
  formSubtitle: {
    fontSize: 14,
    fontFamily: Fonts.sans,
    color: '#64748b',
    marginBottom: 28,
  },

  /* ── Fields ── */
  fieldGroup: {
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: Fonts.sans,
    color: '#64748b',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginLeft: 4,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 18,
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: 15,
    fontFamily: Fonts.sans,
    color: '#334155',
  },

  /* ── Forgot password ── */
  forgotRow: {
    alignItems: 'flex-end',
    marginBottom: 20,
  },
  forgotText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: Fonts.sans,
    color: SKY,
  },

  /* ── Error ── */
  errorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    color: '#dc2626',
  },

  /* ── Submit button ── */
  submitBtn: {
    backgroundColor: SKY,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: SKY, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12 },
      android: { elevation: 6 },
      web: { boxShadow: '0 6px 20px rgba(2,132,199,0.35)' } as any,
    }),
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
});
