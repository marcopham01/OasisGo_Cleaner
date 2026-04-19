import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { BackHandler, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TaskSummaryTab from '@/components/task-summary-tab';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TaskSummaryScreen() {
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];
  const { token } = useAuth();

  const goToTasks = () => {
    router.replace('/(tabs)');
  };

  // Override Android hardware back button
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goToTasks();
      return true;
    });
    return () => sub.remove();
  }, []);

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => null,
          headerBackVisible: false,
        }}
      />
      <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]} edges={['top', 'bottom']}>
        <TaskSummaryTab
          token={token ?? ''}
          taskId={taskId ? String(taskId) : null}
          palette={palette}
          onBack={goToTasks}
        />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
});
