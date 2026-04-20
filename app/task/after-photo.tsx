import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TaskAfterPhotoTab from '@/components/task-after-photo-tab';
import { Colors, Fonts, spacingX } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

let completionNavigationLock = false;

export default function AfterPhotoScreen() {
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  const router = useRouter();
  const hasCompletedNavigationRef = useRef(false);
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

  const handleCompleted = useCallback(() => {
    if (hasCompletedNavigationRef.current) {
      return;
    }

    if (completionNavigationLock) {
      return;
    }

    hasCompletedNavigationRef.current = true;
    completionNavigationLock = true;

    if (resolvedTaskId) {
      router.replace(`/task/summary?taskId=${encodeURIComponent(resolvedTaskId)}`);
      setTimeout(() => {
        completionNavigationLock = false;
      }, 1200);
      return;
    }

    router.replace('/(tabs)');
    setTimeout(() => {
      completionNavigationLock = false;
    }, 1200);
  }, [resolvedTaskId, router]);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: palette.background }]}
      edges={['bottom']}>
      <TaskAfterPhotoTab
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
        onCompleted={handleCompleted}
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
