/**
 * Form validation helpers for cleaner app
 */

export function validatePhotoUrl(url: string): { valid: boolean; error?: string } {
  const trimmed = url.trim();

  if (!trimmed) {
    return { valid: false, error: 'Photo URL không được để trống' };
  }

  try {
    const parsed = new URL(trimmed);
    if (!['http', 'https'].includes(parsed.protocol)) {
      return { valid: false, error: 'URL phải là HTTP hoặc HTTPS' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'URL không hợp lệ (ví dụ: https://example.com/photo.jpg)' };
  }
}

export function validateRejectionReason(reason: string): { valid: boolean; error?: string } {
  const trimmed = reason.trim();

  if (!trimmed) {
    return { valid: false, error: 'Lý do từ chối không được để trống' };
  }

  if (trimmed.length < 5) {
    return { valid: false, error: 'Lý do từ chối phải có ít nhất 5 ký tự' };
  }

  if (trimmed.length > 200) {
    return { valid: false, error: 'Lý do từ chối không được vượt quá 200 ký tự' };
  }

  return { valid: true };
}

export function validateDateRange(
  fromDate: string,
  toDate: string,
): { valid: boolean; error?: string } {
  if (!fromDate || !toDate) {
    return { valid: true }; // Both optional
  }

  try {
    const from = new Date(fromDate);
    const to = new Date(toDate);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return { valid: false, error: 'Định dạng ngày tháng không hợp lệ' };
    }

    if (from > to) {
      return { valid: false, error: 'Ngày bắt đầu không được sau ngày kết thúc' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Định dạng ngày tháng không hợp lệ' };
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return normalizeBackendMessage(error.message);
  }

  if (typeof error === 'string') {
    return normalizeBackendMessage(error);
  }

  return 'Có lỗi xảy ra, vui lòng thử lại';
}

const EXACT_MESSAGE_MAP: Record<string, string> = {
  'Khong xac dinh duoc dia chi socket. Vui long cau hinh EXPO_PUBLIC_API_URL hoac EXPO_PUBLIC_SOCKET_URL.':
    'Không xác định được địa chỉ socket. Vui lòng cấu hình EXPO_PUBLIC_API_URL hoặc EXPO_PUBLIC_SOCKET_URL.',
  'Danh dau thong bao da doc that bai': 'Đánh dấu thông báo đã đọc thất bại',
};

export function normalizeBackendMessage(rawMessage: string): string {
  const message = String(rawMessage || '').trim();
  if (!message) {
    return 'Có lỗi xảy ra, vui lòng thử lại';
  }

  if (EXACT_MESSAGE_MAP[message]) {
    return EXACT_MESSAGE_MAP[message];
  }

  const lower = message.toLowerCase();

  if (message.includes('404') || lower.includes('not found')) {
    return 'Không tìm thấy dữ liệu';
  }

  if (
    message.includes('401') ||
    lower.includes('unauthorized') ||
    lower.includes('token expired') ||
    lower.includes('jwt expired') ||
    lower.includes('invalid token')
  ) {
    return 'Phiên làm việc đã hết hạn, vui lòng đăng nhập lại';
  }

  if (
    message.includes('403') ||
    lower.includes('forbidden') ||
    lower.includes('permission denied') ||
    lower.includes('not allowed') ||
    lower.includes('khong co quyen')
  ) {
    return 'Bạn không có quyền thực hiện hành động này';
  }

  if (
    lower.includes('must be checked_in at this location before handling task') ||
    (lower.includes('checked_in') && lower.includes('before handling task'))
  ) {
    return 'Bạn phải CHECK-IN tại địa điểm này trước khi xử lý nhiệm vụ';
  }

  if (
    lower.includes('after') && lower.includes('photo') &&
    (lower.includes('required') || lower.includes('missing') || lower.includes('must'))
  ) {
    return 'Vui lòng chụp và lưu ít nhất một ảnh sau khi dọn trước khi hoàn thành nhiệm vụ.';
  }

  if (
    lower.includes('before') && lower.includes('photo') &&
    (lower.includes('required') || lower.includes('missing') || lower.includes('must'))
  ) {
    return 'Vui lòng chụp và lưu ít nhất một ảnh trước khi dọn.';
  }

  if (
    lower.includes('photo') &&
    (lower.includes('required') || lower.includes('missing') || lower.includes('must upload'))
  ) {
    return 'Vui lòng chụp và lưu ảnh trước khi thực hiện thao tác này.';
  }

  if (
    lower.includes('network') ||
    lower.includes('failed to fetch') ||
    lower.includes('econnaborted') ||
    lower.includes('timeout') ||
    lower.includes('socket hang up')
  ) {
    return 'Lỗi kết nối, vui lòng kiểm tra internet và thử lại';
  }

  if (
    message.includes('500') ||
    lower.includes('internal server error') ||
    lower.includes('service unavailable')
  ) {
    return 'Hệ thống đang bận, vui lòng thử lại sau';
  }

  if (lower === 'socket error') {
    return 'Lỗi kết nối thời gian thực';
  }

  return message
    .replace(/khong/gi, 'không')
    .replace(/duoc/gi, 'được')
    .replace(/vui long/gi, 'vui lòng')
    .replace(/dang nhap/gi, 'đăng nhập')
    .replace(/that bai/gi, 'thất bại')
    .replace(/thanh cong/gi, 'thành công')
    .replace(/xac dinh/gi, 'xác định')
    .replace(/dia chi/gi, 'địa chỉ')
    .replace(/thong bao/gi, 'thông báo')
    .replace(/da doc/gi, 'đã đọc')
    .replace(/khong the/gi, 'không thể');
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('network') ||
      msg.includes('fetch') ||
      msg.includes('connect') ||
      msg.includes('timeout')
    );
  }
  return false;
}
