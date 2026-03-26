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

export interface ShiftInfo {
  id?: string;
  name?: string;
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

export interface CleaningTask {
  id?: string;
  _id?: string;
  pod_id?: string;
  booking_id?: string | null;
  cleaner_id?: string;
  shift_assignment_id?: string | null;
  request_source?: CleaningRequestSource | string;
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

export interface CleaningPhoto {
  id?: string;
  cleaning_task_id: string;
  photo_url: string;
  type: CleaningPhotoType;
  created_at?: string;
  [key: string]: unknown;
}

export interface CreateCleaningPhotoPayload {
  cleaning_task_id: string;
  photo_url: string;
  type: CleaningPhotoType;
}

export interface CreateCleaningPhotoUploadPayload {
  cleaning_task_id: string;
  local_uri: string;
  type: CleaningPhotoType;
}

export interface UpdateCleaningPhotoPayload {
  cleaning_task_id?: string;
  photo_url?: string;
  type?: CleaningPhotoType;
}

export interface PodDetails {
  id?: string;
  code?: string;
  name?: string;
  status?: string;
  cluster_id?: string;
  [key: string]: unknown;
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

export type CleanerTaskAction = 'accept' | 'start' | 'complete' | 'reject';
