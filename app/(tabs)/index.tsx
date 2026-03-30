import { useCallback, useState } from 'react';
import {
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';

import LostFoundTab from '@/components/lost-found-tab';
import ShiftsTab from '@/components/shifts-tab';
import TaskDetailTab from '@/components/task-detail-tab';
import TasksTab from '@/components/tasks-tab';
import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { CleaningTask } from '@/types/cleaner-dashboard';


export default function HomeScreen() {
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];

  const { token, user, signOut } = useAuth();

  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<'shifts' | 'tasks' | 'detail' | 'lostfound'>('shifts');
  const [selectedTask, setSelectedTask] = useState<CleaningTask | null>(null);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setRefreshing(false);
  }, []);

  const handleSelectTask = (task: CleaningTask) => {
    setSelectedTask(task);
    setSelectedTab('detail');
  };

  const handleTaskUpdated = (task: CleaningTask) => {
    setSelectedTask(task);
  };

  const handleCloseDetail = () => {
    setSelectedTab('tasks');
    setSelectedTask(null);
  };

  if (!token) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: palette.background }]}>
        <Text style={[styles.centerText, { color: palette.error }]}>Bạn chưa đăng nhập</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
      <View
        style={[
          styles.headerCard,
          {
            backgroundColor: palette.primary,
            borderColor: palette.primaryDark,
          },
        ]}>
        <Text style={[styles.headerTitle, { color: palette.white }]}>Xin chào, {user?.name || 'Cleaner'}</Text>
        <Text style={[styles.headerSubtitle, { color: palette.primaryLight }]}>Hôm nay: {new Date().toLocaleDateString('vi-VN')}</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={handleRefresh}
            style={[styles.headerButton, { backgroundColor: palette.secondary }]}>
            <Text style={[styles.headerButtonText, { color: palette.primaryDark }]}>Làm mới</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void signOut();
            }}
            style={[styles.headerButton, { backgroundColor: palette.primaryDark }]}> 
            <Text style={[styles.headerButtonText, { color: palette.white }]}>Đăng xuất</Text>
          </Pressable>
        </View>
      </View>

      {error && (
        <View style={[styles.errorBox, { backgroundColor: palette.card, borderColor: palette.error }]}>
          <Text style={[styles.errorText, { color: palette.error }]}>{error}</Text>
        </View>
      )}

      {/* Tab Switcher */}
      <View style={styles.tabSwitcher}>
        <Pressable
          style={[
            styles.tabButton,
            selectedTab === 'shifts' && { backgroundColor: palette.primary, borderColor: palette.primary },
            selectedTab !== 'shifts' && { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
          onPress={() => setSelectedTab('shifts')}>
          <Text
            style={[
              styles.tabButtonText,
              { color: selectedTab === 'shifts' ? palette.white : palette.text },
            ]}>
            Ca làm
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.tabButton,
            selectedTab === 'tasks' && { backgroundColor: palette.primary, borderColor: palette.primary },
            selectedTab !== 'tasks' && { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
          onPress={() => setSelectedTab('tasks')}>
          <Text
            style={[
              styles.tabButtonText,
              { color: selectedTab === 'tasks' ? palette.white : palette.text },
            ]}>
            Tasks
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.tabButton,
            selectedTab === 'lostfound' && {
              backgroundColor: palette.primary,
              borderColor: palette.primary,
            },
            selectedTab !== 'lostfound' && { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
          onPress={() => setSelectedTab('lostfound')}>
          <Text
            style={[
              styles.tabButtonText,
              { color: selectedTab === 'lostfound' ? palette.white : palette.text },
            ]}>
            Lost&Found
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.tabButton,
            selectedTab === 'detail' && { backgroundColor: palette.primary, borderColor: palette.primary },
            selectedTab !== 'detail' &&
              (!selectedTask ? { opacity: 0.5 } : {}),
            {
              backgroundColor:
                selectedTab === 'detail' ? palette.primary : selectedTask ? palette.surface : palette.neutral300,
              borderColor: selectedTab === 'detail' ? palette.primary : palette.border,
            },
          ]}
          onPress={() => selectedTask && setSelectedTab('detail')}
          disabled={!selectedTask}>
          <Text
            style={[
              styles.tabButtonText,
              {
                color:
                  selectedTab === 'detail'
                    ? palette.white
                    : selectedTask
                      ? palette.text
                      : palette.textMuted,
              },
            ]}>
            Chi tiết
          </Text>
        </Pressable>
      </View>

      {/* Tab Content */}
      {selectedTab === 'shifts' && (
        <ShiftsTab
          token={token}
          userId={user?.id || null}
          isDark={theme === 'dark'}
          palette={palette}
          onErrorChange={setError}
        />
      )}

      {selectedTab === 'tasks' && (
        <TasksTab
          token={token}
          isDark={theme === 'dark'}
          palette={palette}
          onSelectTask={handleSelectTask}
          onErrorChange={setError}
        />
      )}

      {selectedTab === 'detail' && (
        <TaskDetailTab
          token={token}
          taskId={selectedTask ? String(selectedTask.id || selectedTask._id || '') : null}
          isDark={theme === 'dark'}
          palette={palette}
          onClose={handleCloseDetail}
          onTaskUpdated={handleTaskUpdated}
          onErrorChange={setError}
        />
      )}

      {selectedTab === 'lostfound' && (
        <LostFoundTab
          token={token}
          isDark={theme === 'dark'}
          palette={palette}
          onErrorChange={setError}
        />
      )}
    </ScrollView>
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
  headerActions: {
    flexDirection: 'row',
    gap: spacingX._10,
    marginTop: spacingY._15,
  },
  headerButton: {
    borderRadius: radius._10,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
  },
  headerButtonText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  errorBox: {
    borderRadius: radius._12,
    borderWidth: 1,
    padding: spacingX._12,
  },
  errorText: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    fontWeight: '600',
  },
  tabSwitcher: {
    flexDirection: 'row',
    gap: spacingX._7,
    borderRadius: radius._12,
  },
  tabButton: {
    flex: 1,
    borderRadius: radius._10,
    borderWidth: 1,
    paddingVertical: spacingY._12,
    alignItems: 'center',
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
});
