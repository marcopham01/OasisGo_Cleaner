import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { CleanerRealtimeNotification } from '@/types/cleaner-dashboard';

type NotificationTarget =
  | {
      type: 'TASK';
      taskId: string;
    }
  | {
      type: 'HISTORY';
    };

const DEFAULT_ANDROID_CHANNEL_ID = 'queanh_test_noti';
const EXPO_NOTIFICATION_CHANNEL_ID = String(
  process.env.EXPO_PUBLIC_NOTIFICATION_CHANNEL_ID || DEFAULT_ANDROID_CHANNEL_ID,
).trim();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function getProjectId() {
  const constantsAny = Constants as unknown as {
    expoConfig?: { extra?: { eas?: { projectId?: string } } };
    easConfig?: { projectId?: string };
  };

  return (
    constantsAny.expoConfig?.extra?.eas?.projectId ?? constantsAny.easConfig?.projectId ?? null
  );
}

function toText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function toObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function parseJsonString(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const raw = value.trim();
  if (!raw) {
    return value;
  }

  if (!(raw.startsWith('{') || raw.startsWith('['))) {
    return value;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return value;
  }
}

function parseTargetFromUrl(url: string): NotificationTarget | null {
  if (!url) {
    return null;
  }

  if (url === '/history' || url === '/(tabs)/history') {
    return { type: 'HISTORY' };
  }

  const taskMatch = url.match(/\/task\/([^/?#]+)/);
  if (taskMatch?.[1]) {
    return {
      type: 'TASK',
      taskId: taskMatch[1],
    };
  }

  return null;
}

function resolveTaskIdFromData(data: Record<string, unknown>) {
  const keys = ['cleaning_task_id', 'task_id', 'taskId', 'cleaningTaskId', 'entity_id', 'id'];

  for (const key of keys) {
    const value = toText(data[key]);
    if (value) {
      return value;
    }
  }

  return '';
}

export function resolveNotificationTargetFromData(dataValue: unknown): NotificationTarget {
  const data = toObject(parseJsonString(dataValue));

  const nestedData = toObject(parseJsonString(data.data));
  const payloadData = toObject(parseJsonString(data.payload));
  const targetData = toObject(parseJsonString(data.target));

  const mergedData: Record<string, unknown> = {
    ...data,
    ...nestedData,
    ...payloadData,
    ...targetData,
  };

  const url = toText(mergedData.url);
  if (url) {
    return parseTargetFromUrl(url) ?? { type: 'HISTORY' };
  }

  const targetType = toText(mergedData.type).toUpperCase();
  if (targetType === 'TASK') {
    const targetTaskId = toText(mergedData.taskId || mergedData.task_id || mergedData.cleaning_task_id);
    if (targetTaskId) {
      return { type: 'TASK', taskId: targetTaskId };
    }
  }

  const taskId = resolveTaskIdFromData(mergedData);

  if (taskId) {
    return {
      type: 'TASK',
      taskId,
    };
  }

  return { type: 'HISTORY' };
}

export async function configureNotificationChannelAsync() {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(EXPO_NOTIFICATION_CHANNEL_ID, {
    name: 'Thông báo chung',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#0ea5e9',
  });
}

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web' || !Device.isDevice) {
    return null;
  }

  await configureNotificationChannelAsync();

  const permissions = await Notifications.getPermissionsAsync();
  let finalStatus = permissions.status;

  if (permissions.status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    finalStatus = requested.status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  const projectId = getProjectId();
  if (!projectId) {
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}

export async function presentRealtimeNotificationAsync(event: CleanerRealtimeNotification) {
  if (Platform.OS === 'web') {
    return;
  }

  const payload = toObject(event.payload);
  const title = toText(payload.title) || 'Thông báo mới';
  const body = toText(payload.message) || 'Bạn có cập nhật mới cần xem.';
  const target = resolveNotificationTargetFromData({
    ...event,
    ...payload,
    payload,
  });

  const data: Record<string, unknown> = {
    target,
  };

  if (target.type === 'TASK') {
    data.url = `/task/${target.taskId}`;
  } else {
    data.url = '/(tabs)/history';
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
      data,
    },
    trigger:
      Platform.OS === 'android'
        ? {
            channelId: EXPO_NOTIFICATION_CHANNEL_ID,
          }
        : null,
  });
}

export function observeNotificationResponses(
  onTarget: (target: NotificationTarget) => void,
) {
  if (Platform.OS === 'web') {
    return () => {
      // No-op on web: expo-notifications response APIs are not available.
    };
  }

  const redirect = (dataValue: unknown) => {
    const target = resolveNotificationTargetFromData(dataValue);
    onTarget(target);
  };

  try {
    const initial = Notifications.getLastNotificationResponse();
    if (initial?.notification) {
      redirect(initial.notification.request.content.data);
      Notifications.clearLastNotificationResponseAsync().catch(() => null);
    }

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      redirect(response.notification.request.content.data);
      Notifications.clearLastNotificationResponseAsync().catch(() => null);
    });

    return () => {
      subscription.remove();
    };
  } catch {
    return () => {
      // Fallback no-op when notification response APIs are unavailable.
    };
  }
}
