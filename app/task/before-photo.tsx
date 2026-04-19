import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TaskBeforePhotoTab from '@/components/task-before-photo-tab';
import { Colors, Fonts, spacingX } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function BeforePhotoScreen() {
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];
  const { token } = useAuth();

  if (!token) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: palette.background }]}
        edges={['bottom']}>
        <View style={styles.centerContainer}>
          <Text style={[styles.centerText, { color: palette.error }]}>Bạn chưa đăng nhập</Text>
        </View>
      </SafeAreaView>
    );
  }

  const resolvedTaskId = String(taskId || '').trim() || null;

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: palette.background }]}
      edges={['bottom']}>
      <TaskBeforePhotoTab
        token={token}
        taskId={resolvedTaskId}
        isDark={theme === 'dark'}
        palette={palette}
        onClose={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/(tabs)');
          }
        }}
        onPhotosDone={() => {
          router.push(`/task/checklist?taskId=${resolvedTaskId}`);
        }}
      />
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
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
});
