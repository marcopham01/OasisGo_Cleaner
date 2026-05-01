import { apiClient } from '@/services/api';
import { getMyCleaningTasks } from '@/services/cleaner-dashboard.service';
import type {
    CleanerCheckinReportData,
    CleanerIncident,
    UpdateCleanerIncidentStatusPayload,
} from '@/types/cleaner-dashboard';
import { getErrorMessage } from '@/utils/validation';

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * GET /incidents/cleaner/replenishment-requests?cleaning_task_id=<id>
 * Trả về danh sách REPLENISHMENT_REQUEST incidents của 1 cleaning task.
 */
export async function getReplenishmentRequestsByCleaningTask(
  token: string,
  cleaningTaskId: string,
): Promise<CleanerCheckinReportData> {
  try {
    const response = await apiClient.get('/incidents/cleaner/replenishment-requests', {
      headers: authHeader(token),
      params: { cleaning_task_id: cleaningTaskId },
    });
    const body = response.data as { success?: boolean; data?: unknown };
    const raw = (body?.data ?? body) as CleanerCheckinReportData;
    return {
      cleaning_task: raw?.cleaning_task ?? null,
      booking: raw?.booking ?? null,
      incidents: Array.isArray(raw?.incidents) ? raw.incidents : [],
    };
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Tổng hợp tất cả REPLENISHMENT_REQUEST incidents qua mọi task
 * đang IN_PROGRESS hoặc ACCEPTED của cleaner hiện tại.
 *
 * Vì BE bắt buộc cleaning_task_id nên phải:
 *  1. Lấy danh sách task (2 call parallel)
 *  2. Gọi replenishment-requests 1 lần mỗi task (tất cả parallel)
 */
export async function getCleanerReplenishmentIncidents(
  token: string,
): Promise<CleanerCheckinReportData[]> {
  try {
    const [inProgress, accepted] = await Promise.allSettled([
      getMyCleaningTasks(token, { status: 'IN_PROGRESS' }),
      getMyCleaningTasks(token, { status: 'ACCEPTED' }),
    ]);

    const tasks = [
      ...(inProgress.status === 'fulfilled' ? inProgress.value : []),
      ...(accepted.status === 'fulfilled' ? accepted.value : []),
    ].filter((t) => t.booking_id);

    if (tasks.length === 0) return [];

    // Build a map of task id → enriched task (getMyCleaningTasks returns pod_name,
    // but getCheckinReportsByCleaningTask only selects raw task fields without pod_name)
    const taskMap = new Map(tasks.map((t) => [String(t.id || ''), t]));

    const results = await Promise.allSettled(
      tasks.map((t) => getReplenishmentRequestsByCleaningTask(token, String(t.id || ''))),
    );

    return results
      .filter(
        (r): r is PromiseFulfilledResult<CleanerCheckinReportData> => r.status === 'fulfilled',
      )
      .map((r) => {
        const taskId = String(
          r.value.cleaning_task?.['id'] ?? r.value.cleaning_task?.['_id'] ?? '',
        );
        const enrichedTask = taskMap.get(taskId);
        // Inject pod_name from the enriched task since the incident endpoint
        // only selects raw task fields (pod_id, not pod_name)
        if (enrichedTask && r.value.cleaning_task) {
          (r.value.cleaning_task as Record<string, unknown>)['pod_name'] =
            enrichedTask.pod_name ?? null;
        }
        return r.value;
      });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * GET /incidents/cleaner/:id
 * Lấy chi tiết một incident của cleaner, được làm giàu với cleaning_task và booking.
 */
export async function getCleanerIncidentDetail(
  token: string,
  incidentId: string,
): Promise<CleanerIncident> {
  try {
    const response = await apiClient.get(
      `/incidents/cleaner/${encodeURIComponent(incidentId)}`,
      { headers: authHeader(token) },
    );
    const body = response.data as { success?: boolean; data?: unknown };
    return (body?.data ?? body) as CleanerIncident;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * GET /incidents/cleaner/my-incidents
 * Trả về tất cả incidents của cleaner đang đăng nhập (reported_by hoặc linked cleaning task).
 * Mỗi incident được làm giàu với cleaning_task và booking.
 */
export async function getMyCleanerIncidents(
  token: string,
  filters: { status?: string; incident_type?: string } = {},
): Promise<CleanerIncident[]> {
  try {
    const params: Record<string, string> = {};
    if (filters.status) params['status'] = filters.status;
    if (filters.incident_type) params['incident_type'] = filters.incident_type;

    const response = await apiClient.get('/incidents/cleaner/my-incidents', {
      headers: authHeader(token),
      params,
    });
    const body = response.data as { success?: boolean; data?: unknown };
    const items = body?.data ?? body;
    return Array.isArray(items) ? (items as CleanerIncident[]) : [];
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * PATCH /incidents/:id/resolve-replenishment
 * Đánh dấu incident hoàn thành sửa chữa/thay thế vật tư.
 */
export async function resolveReplenishment(
  token: string,
  incidentId: string,
  items: Array<{ item_id: string; quantity: number }>,
): Promise<CleanerIncident> {
  try {
    const response = await apiClient.patch(
      `/incidents/${encodeURIComponent(incidentId)}/resolve-replenishment`,
      { items },
      { headers: authHeader(token) },
    );
    const body = response.data as { success?: boolean; data?: unknown };
    return (body?.data ?? body) as CleanerIncident;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * PATCH /incidents/cleaner/:id/status
 * Chuyển trạng thái incident: PENDING → PROCESSING hoặc PROCESSING → COMPLETED.
 */
export async function updateCleanerIncidentStatus(
  token: string,
  incidentId: string,
  payload: UpdateCleanerIncidentStatusPayload,
): Promise<CleanerIncident> {
  try {
    const response = await apiClient.patch(
      `/incidents/cleaner/${encodeURIComponent(incidentId)}/status`,
      payload,
      { headers: authHeader(token) },
    );
    const body = response.data as { success?: boolean; data?: unknown };
    return (body?.data ?? body) as CleanerIncident;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
