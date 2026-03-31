import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ProfileScreen() {
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];
  const { user, signOut } = useAuth();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={styles.container}>
      <View
        style={[
          styles.profileCard,
          {
            backgroundColor: palette.card,
            borderColor: palette.border,
          },
        ]}>
        <Text style={[styles.title, { color: palette.text }]}>Profile</Text>
        <Text style={[styles.name, { color: palette.text }]}>{user?.name || 'Cleaner'}</Text>
        <Text style={[styles.meta, { color: palette.textMuted }]}>{user?.email || 'No email'}</Text>
      </View>

      <Pressable
        onPress={() => {
          void signOut();
        }}
        style={[styles.signOutButton, { backgroundColor: palette.primaryDark }]}>
        <Text style={[styles.signOutText, { color: palette.white }]}>Dang xuat</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacingX._20,
    paddingVertical: spacingY._15,
    gap: spacingY._15,
  },
  profileCard: {
    borderRadius: radius._20,
    borderWidth: 1,
    padding: spacingX._20,
    gap: spacingY._7,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  meta: {
    fontSize: 14,
    fontFamily: Fonts.sans,
  },
  signOutButton: {
    borderRadius: radius._12,
    paddingVertical: spacingY._12,
    alignItems: 'center',
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
});
