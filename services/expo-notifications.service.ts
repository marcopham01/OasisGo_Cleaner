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
    }
  | {
      type: 'INCIDENT';
      route: 'LIST' | 'REPORT_FORM';
    };

const DEFAULT_ANDROID_CHANNEL_ID = 'queanh_test_noti';
const EXPO_NOTIFICATION_CHANNEL_ID = String(
  process.env.EXPO_PUBLIC_NOTIFICATION_CHANNEL_ID || DEFAULT_ANDROID_CHANNEL_ID,
).trim();

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // Deduplicate INCIDENT notifications that arrive as remote push from the
    // backend (e.g. one push per damage-report detail line).  This check uses
    // the same in-memory cache as the socket pipeline so whichever channel
    // (socket or push) arrives first wins and the rest are suppressed within
    // the dedup TTL window.
    const rawData = notification.request.content.data as Record<string, unknown>;
    const targetObj = rawData?.target && typeof rawData.target === 'object'
      ? (rawData.target as Record<string, unknown>)
      : {};
    const targetType = String(targetObj.type ?? rawData.type ?? '').toUpperCase();
    const eventCode = String(rawData.event_code ?? rawData.event ?? '').toUpperCase();
    const url = String(rawData.url ?? '');

    // Local notifications scheduled by presentRealtimeNotificationAsync already
    // passed through the dedup gate; skip dedup here to avoid self-suppression.
    const isLocal = rawData?._local === true;

    const isIncident =
      !isLocal &&
      (
        targetType === 'INCIDENT' ||
        targetType === 'DAMAGE_REPORT' ||
        eventCode.startsWith('INCIDENT_') ||
        url.includes('lost-found') ||
        url === '/damage-report'
      );

    if (isIncident && isDuplicateRealtimeNotification('INCIDENT_NOTIFICATION')) {
      return {
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    }

    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
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

function normalizeToken(value: unknown) {
  return toText(value).toUpperCase();
}

function isInternalCodeText(value: unknown) {
  const text = toText(value);
  if (!text) {
    return false;
  }

  return /^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(normalizeToken(text));
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

  if (url === '/damage-report') {
    return { type: 'INCIDENT', route: 'REPORT_FORM' };
  }

  if (url.startsWith('/(tabs)/lost-found') || url.startsWith('/lost-found')) {
    return { type: 'INCIDENT', route: 'LIST' };
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

  const queryTaskIdMatch = url.match(/[?&](taskId|task_id|cleaningTaskId|cleaning_task_id)=([^&#]+)/i);
  if (queryTaskIdMatch?.[2]) {
    return {
      type: 'TASK',
      taskId: decodeURIComponent(queryTaskIdMatch[2]),
    };
  }

  return null;
}

function resolveTaskIdFromData(data: Record<string, unknown>) {
  const keys = [
    'cleaning_task_id',
    'task_id',
    'taskId',
    'cleaningTaskId',
    'cleaning_task',
    'task',
    'entity_id',
    'id',
  ];

  for (const key of keys) {
    const value = toText(data[key]);
    if (value) {
      return value;
    }
  }

  return '';
}

function isIncidentPayload(data: Record<string, unknown>) {
  const typeToken = toText(data.type || data.notification_type || data.category).toUpperCase();
  if (typeToken === 'INCIDENT' || typeToken === 'DAMAGE_REPORT') {
    return true;
  }

  const eventToken = toText(data.event_code || data.event || data.code).toUpperCase();
  return eventToken.startsWith('INCIDENT_') || eventToken.includes('DAMAGE_REPORT');
}

function resolveRealtimeEventCode(event: CleanerRealtimeNotification, payload: Record<string, unknown>) {
  const payloadData = toObject(parseJsonString(payload.data));

  return normalizeToken(
    payload.event_code ||
      payload.notification_event ||
      payload.event ||
      payload.code ||
      payloadData.event_code ||
      payloadData.event ||
      event.event ||
      (event as Record<string, unknown>).event_code ||
      (event as Record<string, unknown>).code,
  );
}

function resolveRealtimeTaskStatus(event: CleanerRealtimeNotification, payload: Record<string, unknown>) {
  const payloadData = toObject(parseJsonString(payload.data));

  return normalizeToken(
    payload.new_status ||
      payload.status ||
      payload.to_status ||
      payload.next_status ||
      payload.task_status ||
      payload.cleaning_task_status ||
      payloadData.new_status ||
      payloadData.status ||
      payloadData.to_status ||
      payloadData.next_status ||
      payloadData.task_status ||
      payloadData.cleaning_task_status ||
      (event as Record<string, unknown>).new_status ||
      (event as Record<string, unknown>).status,
  );
}

const SUPPRESSED_CLEANING_TASK_STATUSES = new Set(['ACCEPTED', 'IN_PROGRESS', 'DONE']);
const SUPPRESSED_CLEANING_TASK_EVENT_CODES = new Set([
  'CLEANING_TASK_ACCEPTED',
  'CLEANING_TASK_STARTED',
  'CLEANING_TASK_IN_PROGRESS',
  'CLEANING_TASK_DONE',
  'CLEANING_TASK_COMPLETED',
]);

// ── Notification deduplication ──────────────────────────────────────────────
// Prevents the same realtime event from firing multiple local notifications
// when the backend emits several socket events in quick succession (e.g. after
// a damage report is created) or when the socket briefly reconnects and
// re-delivers the event.

const recentNotificationDedup = new Map<string, number>();
const NOTIFICATION_DEDUP_TTL_MS = 10_000; // 10 seconds

function buildRealtimeDedupKey(
  event: CleanerRealtimeNotification,
  payload: Record<string, unknown>,
): string {
  const payloadData = toObject(parseJsonString(payload.data));
  const eventCode = resolveRealtimeEventCode(event, payload);

  // For INCIDENT events the backend can emit several notifications in rapid
  // succession for a single damage-report submission (e.g. INCIDENT_REPORTED,
  // INCIDENT_REVIEW_REQUIRED, INCIDENT_STATUS_CHANGED …) and each one may
  // carry a different entity / detail-line ID.  Collapse the entire burst into
  // one fixed category key so only the first notification is shown within the
  // dedup window, regardless of how many events arrive.
  if (eventCode.startsWith('INCIDENT_') || isIncidentPayload({ ...toObject(event), ...payload })) {
    return 'INCIDENT_NOTIFICATION';
  }

  // For all other event types prefer a stable entity / notification ID so that
  // genuinely different events (e.g. two task assignments) are not merged.
  const entityId = toText(
    (event as Record<string, unknown>).id ||
      (event as Record<string, unknown>).notification_id ||
      payload.id ||
      payload.notification_id ||
      payload.entity_id ||
      payloadData.id ||
      payloadData.notification_id ||
      payloadData.entity_id,
  );

  if (entityId) {
    return `${eventCode}:${entityId}`;
  }

  // Fallback: combine event code with server timestamp for uniqueness.
  const sentAt = toText(
    (event as Record<string, unknown>).sent_at ||
      payload.sent_at ||
      payloadData.sent_at,
  );
  if (sentAt) {
    return `${eventCode}:${sentAt}`;
  }

  return eventCode;
}

function isDuplicateRealtimeNotification(key: string): boolean {
  const now = Date.now();
  // Prune expired entries to avoid unbounded growth.
  for (const [k, ts] of recentNotificationDedup) {
    if (now - ts > NOTIFICATION_DEDUP_TTL_MS) {
      recentNotificationDedup.delete(k);
    }
  }

  if (recentNotificationDedup.has(key)) {
    return true;
  }

  recentNotificationDedup.set(key, now);
  return false;
}

export function shouldSuppressCleanerRealtimeNotification(event: CleanerRealtimeNotification) {
  const payload = toObject(event.payload);
  const eventCode = resolveRealtimeEventCode(event, payload);
  const taskStatus = resolveRealtimeTaskStatus(event, payload);

  if (SUPPRESSED_CLEANING_TASK_EVENT_CODES.has(eventCode)) {
    return true;
  }

  if (eventCode === 'CLEANING_TASK_STATUS_CHANGED' && SUPPRESSED_CLEANING_TASK_STATUSES.has(taskStatus)) {
    return true;
  }

  return false;
}

function defaultTitleByEventCode(eventCode: string) {
  if (eventCode === 'CLEANING_TASK_ASSIGNED') return 'Nhiệm vụ dọn dẹp mới';
  if (eventCode === 'CLEANING_TASK_STATUS_CHANGED') return 'Cập nhật nhiệm vụ dọn dẹp';
  if (eventCode === 'CLEANING_TASK_SLA_REMINDER') return 'Nhắc xử lý nhiệm vụ dọn dẹp';
  if (eventCode === 'CLEANING_TASK_CANCELLED_NO_SHOW') return 'Nhiệm vụ dọn dẹp đã hủy';
  if (eventCode === 'CLEANING_TASK_CANCELLED_BOOKING_CANCELLED') return 'Nhiệm vụ dọn dẹp đã hủy';
  if (eventCode === 'CLEANING_TASK_CANCENLLED_BOOKING_CANCELLED') return 'Nhiệm vụ dọn dẹp đã hủy';
  if (eventCode.startsWith('CLEANING_TASK_')) return 'Thông báo nhiệm vụ dọn dẹp';
  if (eventCode.startsWith('SHIFT_')) return 'Thông báo ca làm';
  if (eventCode.startsWith('INCIDENT_')) return 'Thông báo sự cố';
  if (eventCode.startsWith('INVENTORY_')) return 'Thông báo vật tư';
  return 'Thông báo mới';
}

function defaultBodyByEventCode(eventCode: string) {
  if (eventCode === 'CLEANING_TASK_ASSIGNED') {
    return 'Bạn vừa được phân công một nhiệm vụ dọn dẹp mới.';
  }
  if (eventCode === 'CLEANING_TASK_STATUS_CHANGED') {
    return 'Trạng thái nhiệm vụ dọn dẹp vừa được cập nhật.';
  }
  if (eventCode === 'CLEANING_TASK_SLA_REMINDER') {
    return 'Nhiệm vụ dọn dẹp sắp quá hạn, vui lòng xử lý sớm.';
  }
  if (eventCode === 'CLEANING_TASK_CANCELLED_NO_SHOW') {
    return 'Nhiệm vụ dọn dẹp đã bị hủy do khách không đến.';
  }
  if (eventCode === 'CLEANING_TASK_CANCELLED_BOOKING_CANCELLED') {
    return 'Nhiệm vụ dọn dẹp đã bị hủy do đặt phòng bị hủy.';
  }
  if (eventCode === 'CLEANING_TASK_CANCENLLED_BOOKING_CANCELLED') {
    return 'Nhiệm vụ dọn dẹp đã bị hủy do đặt phòng bị hủy.';
  }
  if (eventCode.startsWith('CLEANING_TASK_')) {
    return 'Bạn có cập nhật mới liên quan đến nhiệm vụ dọn dẹp.';
  }
  if (eventCode.startsWith('SHIFT_')) {
    return 'Bạn có cập nhật mới liên quan đến ca làm việc.';
  }
  if (eventCode.startsWith('INCIDENT_')) {
    return 'Bạn có cập nhật mới liên quan đến sự cố.';
  }
  if (eventCode.startsWith('INVENTORY_')) {
    return 'Bạn có cập nhật mới liên quan đến vật tư.';
  }
  return 'Bạn có cập nhật mới cần xem.';
}

function resolveRealtimeNotificationText(event: CleanerRealtimeNotification, payload: Record<string, unknown>) {
  const payloadData = toObject(parseJsonString(payload.data));

  const rawTitle =
    toText(payload.title) ||
    toText(payload.notification_title) ||
    toText(payload.subject) ||
    toText(payloadData.title) ||
    toText(payloadData.notification_title) ||
    toText((event as Record<string, unknown>).title) ||
    toText((event as Record<string, unknown>).notification_title);

  const rawBody =
    toText(payload.message) ||
    toText(payload.body) ||
    toText(payload.content) ||
    toText(payloadData.message) ||
    toText(payloadData.body) ||
    toText(payloadData.content) ||
    toText((event as Record<string, unknown>).message) ||
    toText((event as Record<string, unknown>).body) ||
    toText((event as Record<string, unknown>).content);

  const eventCode = resolveRealtimeEventCode(event, payload);
  const title =
    rawTitle && !isInternalCodeText(rawTitle)
      ? rawTitle
      : defaultTitleByEventCode(eventCode);
  const body =
    rawBody && !isInternalCodeText(rawBody)
      ? rawBody
      : defaultBodyByEventCode(eventCode);

  return {
    title,
    body,
  };
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

  if (
    targetType === 'INCIDENT' ||
    targetType === 'DAMAGE_REPORT' ||
    toText(mergedData.target_type).toUpperCase() === 'INCIDENT'
  ) {
    const openReportForm =
      toText(mergedData.route).toUpperCase() === 'REPORT_FORM' ||
      toText(mergedData.screen).toUpperCase() === 'DAMAGE_REPORT' ||
      toText(mergedData.pathname) === '/damage-report';
    return {
      type: 'INCIDENT',
      route: openReportForm ? 'REPORT_FORM' : 'LIST',
    };
  }

  if (isIncidentPayload(mergedData)) {
    return { type: 'INCIDENT', route: 'LIST' };
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
    return false;
  }

  if (shouldSuppressCleanerRealtimeNotification(event)) {
    return false;
  }

  const payload = toObject(event.payload);

  // Suppress duplicate events received within the dedup window (e.g. backend
  // emitting multiple INCIDENT_* events for one damage report submission, or
  // socket reconnect re-delivering the same event).
  const dedupKey = buildRealtimeDedupKey(event, payload);
  if (isDuplicateRealtimeNotification(dedupKey)) {
    return false;
  }

  const { title, body } = resolveRealtimeNotificationText(event, payload);
  const target = resolveNotificationTargetFromData({
    ...event,
    ...payload,
    payload,
  });

  const data: Record<string, unknown> = {
    target,
    // Marks this as a locally scheduled notification so handleNotification
    // skips the dedup gate (which was already applied above).
    _local: true,
  };

  if (target.type === 'TASK') {
    data.url = `/task/${target.taskId}`;
  } else if (target.type === 'INCIDENT') {
    data.url =
      target.route === 'REPORT_FORM'
        ? '/damage-report'
        : '/(tabs)/lost-found?listTab=DAMAGE';
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

  return true;
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
