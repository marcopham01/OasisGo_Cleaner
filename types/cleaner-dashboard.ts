export const CLEANING_TASK_STATUSES = [
  'ASSIGNED',
  'NOTIFIED',
  'ACCEPTED',
  'ARRIVED',
  'IN_PROGRESS',
  'DONE',
  'CANCELLED',
  'MISSED',
] as const;

export type CleaningTaskStatus = (typeof CLEANING_TASK_STATUSES)[number];

export const CLEANING_REQUEST_SOURCES = [
  'USER_REQUEST',
  'AUTO_AFTER_CHECKOUT',
  'SYSTEM_RETRY',
] as const;

export type CleaningRequestSource = (typeof CLEANING_REQUEST_SOURCES)[number];

export type ShiftAssignmentStatus = 'ASSIGNED' | 'CHECKED_IN' | 'COMPLETED' | 'ABSENT';
export type CleaningPhotoType = 'BEFORE' | 'AFTER';
export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentStatus = 'PENDING' | 'RESOLVED' | 'DISMISSED' | 'INVESTIGATING' | 'CLOSED';
export type IncidentType = 'OPERATIONAL' | 'DAMAGE_REPORT';
export type IncidentDetailType = 'ITEM' | 'SERVICE';
export type DamageType = 'BROKEN' | 'SCRATCHED' | 'LOST' | 'STAINED';
export type LostFoundStatus = 'FOUND' | 'IN_STORAGE' | 'CLAIM_PENDING' | 'RETURNED' | 'DISPOSED';

export const CLEANER_NOTIFICATION_TYPES = [
  'BOOKING',
  'PAYMENT',
  'PROMOTION',
  'SYSTEM',
  'IDENTITY',
  'CLEANING',
  'SHIFT',
  'INVENTORY',
  'SUPPORT',
  'INCIDENT',
] as const;

export type CleanerNotificationType = (typeof CLEANER_NOTIFICATION_TYPES)[number];

export const CLEANER_NOTIFICATION_EVENT_CODES = [
  'BOOKING_CANCELLED',
  'BOOKING_CHECKIN',
  'BOOKING_CHECKOUT',
  'BOOKING_AUTO_CHECKIN',
  'BOOKING_AUTO_CHECKOUT',
  'BOOKING_NO_SHOW',
  'BOOKING_REMINDER',
  'PAYMENT_SUCCESS',
  'PAYMENT_PENDING_REMAINING',
  'PAYMENT_REFUND_SUCCESS',
  'PROMOTION_BROADCAST',
  'SYSTEM_TEST',
  'SYSTEM_GENERAL',
  'IDENTITY_VERIFIED',
  'CLEANING_TASK_ASSIGNED',
  'CLEANING_TASK_SLA_REMINDER',
  'CLEANING_TASK_CANCELLED_NO_SHOW',
  'CLEANING_TASK_CANCELLED_BOOKING_CANCELLED',
  'CLEANING_TASK_STATUS_CHANGED',
  'SUPPORT_CLEANING_REQUEST',
  'SHIFT_ASSIGNED',
  'SHIFT_START_REMINDER',
  'INVENTORY_CHECKOUT_CONFIRMED',
  'INCIDENT_REPORTED',
  'INCIDENT_REVIEW_REQUIRED',
  'INCIDENT_RESOLVED',
  'POD_AUTO_MIGRATION_ALERT',
  'BOOKING_AUTO_MIGRATED',
  'SUPPORT_ESCALATED',
  'SUPPORT_ROOM_CHANGED',
] as const;

export type CleanerNotificationEventCode = (typeof CLEANER_NOTIFICATION_EVENT_CODES)[number];

export const CLEANER_NOTIFICATION_DELIVERY_STATUSES = [
  'PENDING',
  'SENT',
  'FAILED',
  'SKIPPED_NO_TOKEN',
] as const;

export type CleanerNotificationDeliveryStatus =
  (typeof CLEANER_NOTIFICATION_DELIVERY_STATUSES)[number];

export interface CleanerNotification {
  id?: string;
  _id?: string;
  user_id?: string;
  title: string;
  message: string;
  type?: CleanerNotificationType | string;
  event_code?: CleanerNotificationEventCode | string;
  delivery_status?: CleanerNotificationDeliveryStatus | string;
  is_read?: boolean;
  read_at?: string | null;
  data?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  sent_at?: string | null;
  [key: string]: unknown;
}

export interface CleanerNotificationQuery {
  page?: number;
  limit?: number;
  is_read?: boolean;
  type?: CleanerNotificationType | string;
  event_code?: CleanerNotificationEventCode | string;
}

export interface CleanerNotificationListResponse {
  data: CleanerNotification[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface CleanerUnreadCountResponse {
  unread_count: number;
}

export interface CleanerMarkAllReadResponse {
  matched_count: number;
  modified_count: number;
}

export interface CleanerRealtimeNotification {
  user_id?: string;
  sent_at?: string;
  event?: CleanerNotificationEventCode | string;
  payload?: {
    title?: string;
    message?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface IncidentDamagedItem {
  incident_id?: string;
  item_id: string;
  item_name_snapshot?: string | null;
  unit_cost_snapshot?: number | null;
  quantity_damaged?: number;
  total_damage_cost?: number | null;
  damage_type?: DamageType | string;
  note?: string | null;
  [key: string]: unknown;
}

export interface IncidentDetailLine {
  type: IncidentDetailType | string;
  item_id?: string | null;
  service_catalog_id?: string | null;
  name_snapshot?: string | null;
  unit_cost_snapshot?: number | null;
  quantity?: number;
  total_cost?: number | null;
  note?: string | null;
  [key: string]: unknown;
}

export interface ShiftInfo {
  id?: string;
  name?: string;
  shift_name?: string;
  role?: string;
  start_time?: string;
  end_time?: string;
  [key: string]: unknown;
}

export interface LocationInfo {
  id?: string;
  name?: string;
  type?: string;
  parent_id?: string | null;
  [key: string]: unknown;
}

export interface StaffShiftAssignment {
  id?: string;
  _id?: string;
  assignment_id?: string;
  shift_assignment_id?: string;
  work_date?: string;
  start_date?: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  status?: ShiftAssignmentStatus | string;
  checkin_at?: string | null;
  checkout_at?: string | null;
  location_shift_id?: string;
  shift?: ShiftInfo | null;
  location?: LocationInfo | null;
  [key: string]: unknown;
}

export interface StaffShiftAssignmentQuery {
  work_date?: string;
  from_date?: string;
  to_date?: string;
  status?: string;
}

export type StaffAttendanceAction = 'CHECKIN' | 'CHECKOUT';

export interface StaffAttendanceLog {
  id?: string;
  _id?: string;
  staff_id?: string;
  shift_id?: string;
  location_id?: string;
  cluster_id?: string;
  work_date?: string;
  action?: StaffAttendanceAction | string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface StaffAttendanceLogQuery {
  action?: StaffAttendanceAction | string;
  from_date?: string;
  to_date?: string;
  date?: string;
  work_date?: string;
  shift_id?: string;
  page?: number;
  limit?: number;
}

export interface StaffAssignmentAttendanceStatus {
  shift_assignment_id: string;
  date: string;
  checked_in: boolean;
  checked_out: boolean;
  checkin_at: string | null;
  checkout_at: string | null;
}

export interface StaffTodayAttendanceStatus {
  date: string;
  checked_in_today: boolean;
  checked_out_today: boolean;
  can_checkin: boolean;
  checkin_count: number;
  checkout_count: number;
  latest_checkin_at: string | null;
  latest_checkout_at: string | null;
  shift_ids: string[];
  has_handover?: boolean;
}

export interface StaffAttendanceLogListResponse {
  data: StaffAttendanceLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  } | null;
}

export interface StaffWorkRoster {
  id?: string;
  _id?: string;
  staff_id: string;
  location_shift_id: string;
  day_of_week: number;
  is_active?: boolean;
  created_at?: string;
  [key: string]: unknown;
}

export interface StaffWorkRosterQuery {
  staff_id?: string;
  location_shift_id?: string;
  day_of_week?: number;
  is_active?: boolean | string;
}

export interface CleaningTask {
  id?: string;
  _id?: string;
  pod_id?: string;
  booking_id?: string | null;
  cleaner_id?: string;
  shift_assignment_id?: string | null;
  request_source?: CleaningRequestSource | string;
  estimated_start_time?: string | null;
  due_at?: string | null;
  assigned_at?: string | null;
  notified_at?: string | null;
  accepted_at?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: CleaningTaskStatus | string;
  note?: string | null;
  rejection_reason?: string | null;
  reassigned_from_cleaner_id?: string | null;
  created_at?: string;
  updated_at?: string;
  // Enriched fields returned from API
  pod_name?: string | null;
  pod_cluster_id?: string | null;
  pod_cluster_name?: string | null;
  location_id?: string | null;
  location_name?: string | null;
  booking_order_id?: string | null;
  booking_guest_id?: string | null;
  booking_guest_name?: string | null;
  booking_user_name?: string | null;
  booking_start_time?: string | null;
  booking_end_time?: string | null;
  booking_actual_end_time?: string | null;
  booking_checked_in_at?: string | null;
  booking_checkin_state?: string | null;
  booking_status?: string | null;
  pod_status?: string | null;
  actual_start_time?: string | null;
  actual_end_time?: string | null;
  action_label?: string | null;
  [key: string]: unknown;
}

export interface CleaningTaskQuery {
  status?: CleaningTaskStatus | string;
  request_source?: CleaningRequestSource | string;
  due_from?: string;
  due_to?: string;
  shift_assignment_id?: string;
  pod_id?: string;
  booking_id?: string;
}

export interface UpdateCleaningTaskPayload {
  pod_id?: string;
  booking_id?: string | null;
  cleaner_id?: string;
  shift_assignment_id?: string | null;
  request_source?: CleaningRequestSource | string;
  estimated_start_time?: string | null;
  due_at?: string | null;
  assigned_at?: string | null;
  notified_at?: string | null;
  accepted_at?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: CleaningTaskStatus | string;
  note?: string | null;
  rejection_reason?: string | null;
  reassigned_from_cleaner_id?: string | null;
}

export interface CleaningMediaAsset {
  url: string | null;
  public_id: string | null;
  file_type: 'IMAGE' | 'VIDEO' | string;
}

export interface CleaningPhoto {
  id?: string;
  cleaning_task_id: string;
  /** New shape: preferred URL source */
  media_url?: string | null;
  media_public_id?: string | null;
  /** Serialized media object returned by backend */
  media?: CleaningMediaAsset;
  media_type: CleaningPhotoType;
  file_type?: 'IMAGE' | 'VIDEO' | string;
  /** @deprecated use media_type */
  type?: CleaningPhotoType;
  /** @deprecated use media_url or media.url */
  photo_url?: string | null;
  created_at?: string;
  [key: string]: unknown;
}

export interface CreateCleaningPhotoPayload {
  cleaning_task_id: string;
  media_url: string;
  media_type: CleaningPhotoType;
}

export interface CreateCleaningPhotoUploadPayload {
  cleaning_task_id: string;
  local_uri: string;
  type: CleaningPhotoType;
  /** 'IMAGE' | 'VIDEO' — nếu không truyền sẽ tự detect qua mime type của local_uri */
  file_type?: 'IMAGE' | 'VIDEO';
}

export interface UpdateCleaningPhotoPayload {
  cleaning_task_id?: string;
  media_url?: string;
  media_type?: CleaningPhotoType;
}

export interface Incident {
  id?: string;
  pod_id?: string;
  booking_id?: string | null;
  cleaning_task_id?: string | null;
  shift_assignment_id?: string | null;
  reported_by?: string;
  description: string;
  severity?: IncidentSeverity | string;
  status?: IncidentStatus | string;
  incident_type?: IncidentType | string;
  details?: IncidentDetailLine[];
  damaged_items?: IncidentDamagedItem[];
  item_id?: string | null;
  item_name_snapshot?: string | null;
  unit_cost_snapshot?: number | null;
  quantity_affected?: number | null;
  estimated_item_value?: number | null;
  estimated_service_fee?: number | null;
  estimated_total_value?: number | null;
  pricing_source?: string | null;
  has_lost_found?: boolean;
  photo_urls?: string[];
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface CreateOperationalIncidentPayload {
  cleaning_task_id?: string;
  pod_id?: string;
  booking_id?: string;
  description: string;
  severity?: IncidentSeverity;
  local_uris: string[];
}

export interface CreateIncidentFromCleaningTaskPayload extends CreateOperationalIncidentPayload {}

/**
 * Deprecated: Use CreateOperationalIncidentPayload instead.
 * Kept for backward compatibility.
 */

export interface DamageReportItem {
  id?: string;
  name?: string;
  unit_cost?: number;
  is_active?: boolean;
  [key: string]: unknown;
}

export interface DamageServiceCatalogItem {
  id?: string;
  name?: string;
  category?: 'CONSTRUCTION' | 'CLEANING' | 'PENALTY' | string | null;
  base_price?: number;
  unit_name?: string | null;
  description?: string | null;
  is_active?: boolean;
  created_at?: string;
  [key: string]: unknown;
}

export interface CreateDamageReportPayload {
  cleaning_task_id?: string;
  pod_id?: string;
  booking_id?: string;
  description: string;
  details?: IncidentDetailLine[];
  // Legacy fallback fields retained for older payload mapping.
  damaged_items?: Array<{
    item_id: string;
    quantity_damaged?: number;
    damage_type?: DamageType;
    note?: string;
  }>;
  item_id?: string;
  quantity_damaged?: number;
  quantity_affected?: number;
  damage_type?: DamageType;
  note?: string;
  estimated_service_fee?: number;
  severity?: IncidentSeverity;
  local_uris: string[];
  /** Preferred over local_uris — carries per-file media type for video support. */
  local_media?: Array<{ uri: string; mediaType: 'IMAGE' | 'VIDEO' }>;
}

export interface DamageReportResponse {
  report_id?: string;
  incident_type?: 'DAMAGE_REPORT' | string;
  status?: IncidentStatus | string;
  severity?: IncidentSeverity | string;
  description?: string;
  context?: {
    pod_id?: string | null;
    pod_name?: string | null;
    booking_id?: string | null;
    cleaning_task_id?: string | null;
    reported_by?: string | null;
    user_id?: string | null;
    user_name?: string | null;
    cleaner_name?: string | null;
    [key: string]: unknown;
  };
  details?: IncidentDetailLine[];
  damaged_items?: IncidentDamagedItem[];
  pricing?: {
    estimated_item_value?: number;
    estimated_service_fee?: number;
    estimated_total_value?: number;
    currency?: string;
    pricing_source?: string | null;
    [key: string]: unknown;
  };
  photo_urls?: string[];
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface IncidentQuery {
  pod_id?: string;
  pod_ids?: string;
  cleaning_task_id?: string;
  booking_id?: string;
  reported_by?: string;
  incident_type?: IncidentType | string;
  item_id?: string;
  severity?: IncidentSeverity | string;
  status?: IncidentStatus | string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface PaginationInfo {
  current_page: number;
  total_pages: number;
  total_items: number;
  items_per_page: number;
}

export interface DamageReportListResponse {
  items: DamageReportResponse[];
  pagination: PaginationInfo | null;
}

export interface LostFoundMediaItem {
  id?: string;
  lost_found_item_id?: string;
  media_url: string;
  media_public_id?: string | null;
  file_type?: 'IMAGE' | 'VIDEO' | string;
  created_at?: string;
  [key: string]: unknown;
}

export interface LostFoundItem {
  id?: string;
  _id?: string;
  pod_id?: string | null;
  booking_id?: string | null;
  found_by_user_id?: string;
  warehouse_id?: string | null;
  item_name: string;
  description?: string | null;
  serial_number?: string | null;
  /** @deprecated replaced by photo_urls array */
  photo_url?: string | null;
  /** URLs returned from backend toLostFoundItemView (from LostFoundMedia records) */
  photo_urls?: string[];
  /** Cleaning task IDs linked via booking_id — returned by backend getLostFoundItems/getLostFoundItemById */
  cleaning_task_ids?: string[];
  found_at?: string;
  status?: LostFoundStatus | string;
  claimed_by_user_id?: string | null;
  claimed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  // Populated fields from backend
  pod_name?: string | null;
  warehouse_name?: string | null;
  found_by_user_name?: string | null;
  claimed_by_user_name?: string | null;
  [key: string]: unknown;
}

export interface LostFoundQuery {
  pod_id?: string;
  booking_id?: string;
  found_by_user_id?: string;
  warehouse_id?: string;
  serial_number?: string;
  status?: LostFoundStatus | string;
  page?: number;
  limit?: number;
}

export interface CreateLostFoundItemPayload {
  pod_id?: string | null;
  booking_id?: string | null;
  warehouse_id?: string | null;
  item_name: string;
  description?: string;
  found_at?: string;
  /** Multiple media files — up to 5 (matches BE limit) */
  media_local_uris?: Array<{ uri: string; fileType: 'IMAGE' | 'VIDEO' }>;
  /** @deprecated use media_local_uris */
  photo_local_uri?: string | null;
  /** @deprecated use media_local_uris */
  media_local_uri?: string | null;
  /** @deprecated use media_local_uris */
  media_file_type?: 'IMAGE' | 'VIDEO';
}

export interface WarehouseListItem {
  id?: string;
  name?: string;
  address?: string | null;
  [key: string]: unknown;
}

export interface UpdateLostFoundStatusPayload {
  status: LostFoundStatus;
}

export interface PodCluster {
  id?: string;
  name?: string;
  location_id?: string;
  description?: string | null;
  [key: string]: unknown;
}

export interface PodDetails {
  id?: string;
  code?: string;
  name?: string;
  status?: string;
  cluster_id?: string;
  [key: string]: unknown;
}

export interface PodItemEntry {
  id?: string;
  pod_id?: string;
  item_id?: string;
  item_name?: string | null;
  item_type?: string | null;
  expected_quantity?: number;
  current_quantity?: number;
  status?: 'IN_STOCK' | 'MISSING' | 'OVERSTOCKED' | string;
  message?: string;
  difference?: number;
  item?: {
    id?: string;
    name?: string;
    item_type?: string;
    unit_price?: number;
  } | null;
  [key: string]: unknown;
}

export interface PodItemsByPodData {
  pod_id?: string;
  pod_name?: string;
  pod_code?: string;
  count?: number;
  items: PodItemEntry[];
  [key: string]: unknown;
}

export interface PodItemQuery {
  pod_id?: string;
  item_id?: string;
}

export interface BookingDetails {
  id?: string;
  pod_id?: string;
  order_id?: string;
  start_time?: string;
  end_time?: string;
  status?: string;
  cleaner_access_allowed?: boolean;
  checkin_state?: string;
  [key: string]: unknown;
}

export interface CleanerOnlineKey {
  id?: string;
  booking_id?: string;
  pod_id?: string;
  user_id?: string;
  key_type?: string;
  key_token?: string;
  valid_from?: string;
  valid_to?: string;
  is_revoked?: boolean;
  role?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface MyCleanerKeyByBookingData {
  booking_id?: string;
  booking_status?: string;
  booking_checkin_state?: string;
  online_key?: CleanerOnlineKey;
  [key: string]: unknown;
}

export interface MyCleanerKeyByTaskData extends MyCleanerKeyByBookingData {
  task_id?: string;
  cleaner_id?: string;
}

export type CleanerTaskAction = 'accept' | 'start' | 'complete' | 'reject';

export type CheckoutChecklistStatus = 'MATCHED' | 'DAMAGED' | 'MISSING';

export interface CheckoutChecklistItem {
  item_id: string;
  item_name: string;
  expected_quantity: number;
  user_reported_status: string | null;
  user_reported_quantity: number | null;
}

export interface CheckoutChecklistData {
  booking_id: string;
  pod_id: string;
  items: CheckoutChecklistItem[];
}

export interface CheckoutChecklistSubmitItem {
  item_id: string;
  status: CheckoutChecklistStatus;
  quantity?: number;
}

export interface CheckoutChecklistResult {
  booking_id: string;
  pod_id: string;
  total_items: number;
  matched_count: number;
  issue_count: number;
  incidents: Array<{
    incident_id: string;
    item_name: string;
    status: string;
    quantity: number;
  }>;
  message: string;
}

// ─── Cleaner Incident Flow ───────────────────────────────────────

export type CleanerIncidentStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED';

export interface CleanerIncident {
  id?: string;
  pod_id?: string;
  booking_id?: string | null;
  cleaning_task_id?: string | null;
  reported_by?: string;
  description?: string;
  severity?: IncidentSeverity | string;
  status?: CleanerIncidentStatus | string;
  incident_type?: string;
  resolution_note?: string | null;
  handled_by?: string | null;
  details?: IncidentDetailLine[];
  photo_urls?: string[];
  booking?: Record<string, unknown> | null;
  cleaning_task?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface CleanerCheckinReportData {
  cleaning_task?: Record<string, unknown> | null;
  booking?: Record<string, unknown> | null;
  incidents: CleanerIncident[];
}

export interface UpdateCleanerIncidentStatusPayload {
  status: 'PROCESSING' | 'COMPLETED';
  resolution_note?: string;
}
