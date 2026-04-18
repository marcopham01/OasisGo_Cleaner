import { Redirect, Tabs, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { updateDevicePushToken } from '@/services/auth.service';
import { getMyUnreadNotificationCount } from '@/services/cleaner-dashboard.service';
import { connectCleanerNotificationSocket } from '@/services/cleaner-notification-socket';
import {
    observeNotificationResponses,
    presentRealtimeNotificationAsync,
    registerForPushNotificationsAsync,
} from '@/services/expo-notifications.service';
import {
    getNotificationBadgeCount,
    incrementNotificationBadge,
    setNotificationBadgeCount,
    subscribeNotificationBadge,
} from '@/services/notification-badge-bus';

export default function TabLayout() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { isAuthenticated, isHydrating, token, user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(() => getNotificationBadgeCount());
  const tabBarBottomPadding = Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + tabBarBottomPadding;
  const tabIconSize = width <= 360 ? 24 : 28;

  useEffect(() => {
    const unsubscribe = subscribeNotificationBadge(setUnreadCount);
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      return;
    }

    const unsubscribeResponses = observeNotificationResponses((target) => {
      if (target.type === 'TASK') {
        router.push({
          pathname: '/task/[id]',
          params: {
            id: target.taskId,
          },
        });
        return;
      }

      router.push('/(tabs)/history');
    });

    registerForPushNotificationsAsync()
      .then((expoPushToken) => {
        if (!expoPushToken) {
          return;
        }

        updateDevicePushToken(token, expoPushToken).catch(() => null);
      })
      .catch(() => null);

    return () => {
      unsubscribeResponses();
    };
  }, [isAuthenticated, router, token]);

  const loadUnreadCount = useCallback(async () => {
    if (!token) {
      setNotificationBadgeCount(0);
      return;
    }

    try {
      const count = await getMyUnreadNotificationCount(token);
      setNotificationBadgeCount(Math.max(0, count));
    } catch {
      // Keep previous badge state if unread endpoint temporarily fails.
    }
  }, [token]);

  useEffect(() => {
    if (!isAuthenticated) {
      setNotificationBadgeCount(0);
      return;
    }

    loadUnreadCount().catch(() => null);
  }, [isAuthenticated, loadUnreadCount]);

  useEffect(() => {
    if (!token || !user?.id || !isAuthenticated) {
      return;
    }

    const disconnect = connectCleanerNotificationSocket({
      token,
      cleanerId: user.id,
      onNotification: (event) => {
        incrementNotificationBadge(1);
        presentRealtimeNotificationAsync(event).catch(() => null);
      },
    });

    return () => {
      disconnect();
    };
  }, [isAuthenticated, token, user?.id]);

  const inboxBadge = useMemo(() => {
    if (unreadCount <= 0) return null;
    if (unreadCount > 99) return '99+';
    return String(unreadCount);
  }, [unreadCount]);

  if (isHydrating) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: Colors[colorScheme ?? 'light'].background,
        }}>
        <ActivityIndicator color={palette.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: palette.tint,
        tabBarInactiveTintColor: palette.tabIconDefault,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          height: tabBarHeight,
          paddingTop: 8,
          paddingBottom: tabBarBottomPadding,
          backgroundColor: palette.card,
          borderTopColor: palette.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        tabBarItemStyle: {
          paddingVertical: 2,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Nhiệm vụ',
          tabBarIcon: ({ color }) => <IconSymbol size={tabIconSize} name="list.bullet.rectangle.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="shifts"
        options={{
          title: 'Ca làm',
          tabBarIcon: ({ color }) => <IconSymbol size={tabIconSize} name="calendar.badge.clock" color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Thông báo',
          tabBarIcon: ({ color }) => (
            <View>
              <IconSymbol size={tabIconSize} name="clock.arrow.circlepath" color={color} />
              {inboxBadge ? (
                <View
                  style={{
                    position: 'absolute',
                    right: -10,
                    top: -6,
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    paddingHorizontal: 4,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: palette.error,
                    borderWidth: 1,
                    borderColor: palette.card,
                  }}>
                  <Text style={{ color: palette.white, fontSize: 10, fontWeight: '700' }}>
                    {inboxBadge}
                  </Text>
                </View>
              ) : null}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="supplies"
        options={{
          title: 'Vật tư',
          tabBarIcon: ({ color }) => <IconSymbol size={tabIconSize} name="archivebox.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="lost-found"
        options={{
          title: 'Sự cố',
          tabBarIcon: ({ color }) => <IconSymbol size={tabIconSize} name="bag.fill.badge.questionmark" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Tài khoản',
          tabBarIcon: ({ color }) => <IconSymbol size={tabIconSize} name="person.crop.circle.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
