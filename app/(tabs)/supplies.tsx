import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import SuppliesTab from '@/components/supplies-tab';
import { Colors, Fonts, spacingX, spacingY } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function SuppliesScreen() {
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];
  const { token, user } = useAuth();

  if (!token) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]} edges={['top']}>
        <View style={styles.centerContainer}>
          <Text style={[styles.centerText, { color: palette.error }]}>Bạn chưa đăng nhập</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]} edges={['top']}>
      <View style={styles.container}>
        <Text style={[styles.screenTitle, { color: palette.primary }]}>Vật tư trong kho</Text>
        <SuppliesTab token={token} userId={user?.id} isDark={theme === 'dark'} palette={palette} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacingX._20,
  },
  centerText: {
    fontSize: 16,
    fontFamily: Fonts.sans,
    fontWeight: '600',
  },
  container: {
    flex: 1,
    paddingTop: spacingY._12,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    paddingHorizontal: spacingX._20,
    paddingBottom: spacingY._7,
    textAlign: 'center',
  },
});
