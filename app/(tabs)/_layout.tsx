import { Redirect, Tabs } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { connectCleanerNotificationSocket } from '@/services/cleaner-notification-socket';
import { getMyUnreadNotificationCount } from '@/services/cleaner-dashboard.service';
import {
  getNotificationBadgeCount,
  incrementNotificationBadge,
  setNotificationBadgeCount,
  subscribeNotificationBadge,
} from '@/services/notification-badge-bus';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { isAuthenticated, isHydrating, token, user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(() => getNotificationBadgeCount());

  useEffect(() => {
    const unsubscribe = subscribeNotificationBadge(setUnreadCount);
    return () => {
      unsubscribe();
    };
  }, []);

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
      onNotification: () => {
        incrementNotificationBadge(1);
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
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Nhiệm vụ',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="list.bullet.rectangle.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="shifts"
        options={{
          title: 'Ca làm',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="calendar.badge.clock" color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Thông báo',
          tabBarIcon: ({ color }) => (
            <View>
              <IconSymbol size={28} name="clock.arrow.circlepath" color={color} />
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
        name="profile"
        options={{
          title: 'Tài khoản',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.crop.circle.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
