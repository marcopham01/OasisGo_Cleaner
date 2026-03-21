import { AxiosError } from 'axios';

import { apiClient } from '@/services/api';
import type { CleaningTask, StaffShiftAssignment } from '@/types/cleaner-dashboard';

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T | { data?: T };
  assignments?: T;
  tasks?: T;
};

function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;

    if (Array.isArray(record.data)) {
      return record.data as T[];
    }

    if (Array.isArray(record.assignments)) {
      return record.assignments as T[];
    }

    if (Array.isArray(record.tasks)) {
      return record.tasks as T[];
    }

    if (Array.isArray(record.items)) {
      return record.items as T[];
    }
  }

  return [];
}

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ message?: string }>;
  return axiosError.response?.data?.message || 'Không thể tải dữ liệu dashboard';
}

function authHeader(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function getMyShiftAssignments(token: string) {
  try {
    const response = await apiClient.get<ApiEnvelope<StaffShiftAssignment[]>>(
      '/staff-shift-assignments/me',
      {
        headers: authHeader(token),
      },
    );

    return toArray<StaffShiftAssignment>(response.data?.data ?? response.data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function getMyCleaningTasks(token: string) {
  try {
    const response = await apiClient.get<ApiEnvelope<CleaningTask[]>>('/cleaning-tasks/me', {
      headers: authHeader(token),
    });

    return toArray<CleaningTask>(response.data?.data ?? response.data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
