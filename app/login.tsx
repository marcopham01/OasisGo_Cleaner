import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loginWithEmail } from '@/services/auth.service';

export default function LoginScreen() {
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];
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
      <View style={[styles.screen, { backgroundColor: palette.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={palette.primary} />
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
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: palette.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: palette.card,
            borderColor: palette.border,
            ...Platform.select({
              web: {
                boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.08)',
              },
              default: {
                shadowColor: palette.black,
              },
            }),
          },
        ]}>
        <Text style={[styles.title, { color: palette.primary }]}>Đăng nhập Cleaner</Text>
        <Text style={[styles.subtitle, { color: palette.textMuted }]}>Chỉ tài khoản có role Cleaner mới được phép đăng nhập ứng dụng.</Text>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: palette.text }]}>Email</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="cleaner@example.com"
            placeholderTextColor={palette.neutral500}
            style={[
              styles.input,
              {
                borderColor: palette.border,
                color: palette.text,
                backgroundColor: palette.surface,
              },
            ]}
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: palette.text }]}>Mật khẩu</Text>
          <TextInput
            secureTextEntry
            placeholder="Nhập mật khẩu"
            placeholderTextColor={palette.neutral500}
            style={[
              styles.input,
              {
                borderColor: palette.border,
                color: palette.text,
                backgroundColor: palette.surface,
              },
            ]}
            value={password}
            onChangeText={setPassword}
          />
        </View>

        {error ? <Text style={[styles.errorText, { color: palette.error }]}>{error}</Text> : null}

        <Pressable
          style={[
            styles.button,
            { backgroundColor: palette.primary },
            (!isFormValid || isLoading) && styles.buttonDisabled,
          ]}
          onPress={handleLogin}
          disabled={!isFormValid || isLoading}>
          {isLoading ? (
            <ActivityIndicator color={palette.white} />
          ) : (
            <Text style={[styles.buttonText, { color: palette.white }]}>Đăng nhập</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacingX._20,
  },
  card: {
    borderRadius: radius._17,
    borderWidth: 1,
    padding: spacingX._20,
    ...Platform.select({
      web: {
        boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.08)',
      },
      default: {
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
      },
    }),
    elevation: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    marginBottom: spacingY._7,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: Fonts.sans,
    marginBottom: spacingY._20,
    lineHeight: 20,
  },
  formGroup: {
    marginBottom: spacingY._15,
  },
  label: {
    marginBottom: spacingY._7,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius._12,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._12,
    fontSize: 15,
    fontFamily: Fonts.sans,
  },
  errorText: {
    marginBottom: spacingY._12,
    fontSize: 14,
    fontFamily: Fonts.sans,
  },
  button: {
    borderRadius: radius._12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
});
