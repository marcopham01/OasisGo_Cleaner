import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TaskChecklistTab from '@/components/task-checklist-tab';
import { Colors, Fonts, spacingX } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ChecklistScreen() {
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
      <TaskChecklistTab
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
        onWorkDone={() => {
          router.push(`/task/after-photo?taskId=${resolvedTaskId}`);
        }}
        onReportDamage={({ podId, bookingId, podName }) => {
          const params = new URLSearchParams();
          if (resolvedTaskId) params.set('cleaningTaskId', resolvedTaskId);
          if (podId) params.set('podId', podId);
          if (bookingId) params.set('bookingId', bookingId);
          if (podName) params.set('podName', podName);
          router.push(`/damage-report?${params.toString()}`);
        }}
        onReportLostFound={({ podId, bookingId, podName }) => {
          const params = new URLSearchParams();
          if (resolvedTaskId) params.set('cleaningTaskId', resolvedTaskId);
          if (podId) params.set('podId', podId);
          if (bookingId) params.set('bookingId', bookingId);
          if (podName) params.set('podName', podName);
          router.push(`/report-lost-found?${params.toString()}`);
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
