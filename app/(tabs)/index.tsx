import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TasksTab from '@/components/tasks-tab';
import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function HomeScreen() {
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];
  const { token, user } = useAuth();
  const [doneTodayCount, setDoneTodayCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

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
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.primaryDark }]} edges={['top']}>
      <View style={styles.container}>
        <View style={[styles.header, { backgroundColor: palette.primaryDark }]}>
          {/* Top row: greeting + avatar */}
          <View style={styles.headerTopRow}>
            <View style={styles.greetingBlock}>
              <Text style={[styles.greeting, { color: palette.primaryLight }]}>Xin chào,</Text>
              <Text style={[styles.userName, { color: palette.white }]} numberOfLines={1}>
                {user?.name ?? 'Bạn'}
              </Text>
              <Text style={[styles.userRole, { color: palette.primaryLight }]}>Nhân viên dọn dẹp</Text>
            </View>
            <View style={[styles.avatarCircle, { borderColor: 'rgba(255,255,255,0.4)', backgroundColor: 'rgba(255,255,255,0.15)' }]}>
              {user?.avatar ? (
                <Image source={{ uri: user.avatar }} style={styles.avatarImage} />
              ) : (
                <Text style={[styles.avatarInitial, { color: palette.white }]}>
                  {(user?.name ?? 'U')[0].toUpperCase()}
                </Text>
              )}
            </View>
          </View>

          {/* Stats bar */}
          <View style={[styles.statsBar, { backgroundColor: 'rgba(0,0,0,0.2)', borderColor: 'rgba(255,255,255,0.15)' }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: palette.white }]}>{doneTodayCount}</Text>
              <Text style={[styles.statLabel, { color: palette.primaryLight }]}>Đã xong</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: palette.white }]}>{pendingCount}</Text>
              <Text style={[styles.statLabel, { color: palette.primaryLight }]}>Cần làm</Text>
            </View>
          </View>
        </View>

        <TasksTab
          token={token}
          userId={user?.id}
          isDark={theme === 'dark'}
          palette={palette}
          onCountsChange={(done, pending) => {
            setDoneTodayCount(done);
            setPendingCount(pending);
          }}
        />
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
  },
  header: {
    paddingHorizontal: spacingX._15,
    paddingTop: spacingY._10,
    paddingBottom: spacingY._12,
    borderBottomLeftRadius: radius._20,
    borderBottomRightRadius: radius._20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
    zIndex: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacingY._10,
  },
  greetingBlock: {
    flex: 1,
  },
  greeting: {
    fontSize: 11,
    fontFamily: Fonts.sans,
    fontWeight: '500',
  },
  userName: {
    fontSize: 17,
    fontWeight: '800',
    fontFamily: Fonts.sans,
    marginTop: 1,
  },
  userRole: {
    fontSize: 10,
    fontFamily: Fonts.sans,
    fontWeight: '500',
    marginTop: 1,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginLeft: spacingX._10,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitial: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: Fonts.sans,
  },
  statsBar: {
    flexDirection: 'row',
    borderRadius: radius._12,
    borderWidth: 1,
    paddingVertical: spacingY._7,
    paddingHorizontal: spacingX._10,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
  },
  statNum: {
    fontSize: 20,
    fontWeight: '800',
    fontFamily: Fonts.sans,
    lineHeight: 24,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: Fonts.sans,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    marginHorizontal: spacingX._7,
    alignSelf: 'stretch',
  },
});
