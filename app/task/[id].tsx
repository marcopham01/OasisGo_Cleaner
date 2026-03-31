import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import TaskDetailTab from '@/components/task-detail-tab';
import { Colors, Fonts, spacingX } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];
  const { token } = useAuth();

  if (!token) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: palette.background }]}>
        <Text style={[styles.centerText, { color: palette.error }]}>Ban chua dang nhap</Text>
      </View>
    );
  }

  return (
    <TaskDetailTab
      token={token}
      taskId={String(id || '') || null}
      isDark={theme === 'dark'}
      palette={palette}
      onClose={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(tabs)');
        }
      }}
    />
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
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
});
