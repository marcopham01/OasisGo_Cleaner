import { StyleSheet, Text, View } from 'react-native';

import ShiftsTab from '@/components/shifts-tab';
import { Colors, Fonts, spacingX, spacingY } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ShiftsScreen() {
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];
  const { token } = useAuth();

  if (!token) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: palette.background }]}>
        <Text style={[styles.centerText, { color: palette.error }]}>Bạn chưa đăng nhập</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <Text style={[styles.screenTitle, { color: palette.text }]}>Ca làm việc</Text>
      <ShiftsTab token={token} isDark={theme === 'dark'} palette={palette} />
    </View>
  );
}

const styles = StyleSheet.create({
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
    paddingTop: spacingY._10,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    paddingHorizontal: spacingX._20,
    paddingBottom: spacingY._5,
  },
});