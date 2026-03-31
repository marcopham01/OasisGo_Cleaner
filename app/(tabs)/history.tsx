import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function HistoryScreen() {
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];
  const { user } = useAuth();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={styles.container}>
      <View
        style={[
          styles.headerCard,
          {
            backgroundColor: palette.card,
            borderColor: palette.border,
          },
        ]}>
        <Text style={[styles.headerTitle, { color: palette.text }]}>History</Text>
        <Text style={[styles.headerSubtitle, { color: palette.textMuted }]}>Xin chao, {user?.name || 'Cleaner'}.</Text>
      </View>

      <View
        style={[
          styles.infoCard,
          {
            backgroundColor: palette.surface,
            borderColor: palette.border,
          },
        ]}>
        <Text style={[styles.infoTitle, { color: palette.text }]}>Chua co du lieu lich su</Text>
        <Text style={[styles.infoDescription, { color: palette.textMuted }]}>Man hinh nay san sang cho API lich su nhiem vu sau nay.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacingX._20,
    paddingVertical: spacingY._15,
    gap: spacingY._15,
  },
  headerCard: {
    borderRadius: radius._20,
    borderWidth: 1,
    padding: spacingX._20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  headerSubtitle: {
    marginTop: spacingY._7,
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  infoCard: {
    borderRadius: radius._15,
    borderWidth: 1,
    padding: spacingX._15,
    gap: spacingY._7,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  infoDescription: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: Fonts.sans,
  },
});
