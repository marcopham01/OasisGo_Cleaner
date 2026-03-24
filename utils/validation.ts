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
    const msg = error.message;
    // Map common backend error messages to Vietnamese
    if (msg.includes('404')) {
      return 'Không tìm thấy dữ liệu';
    }
    if (msg.includes('401') || msg.includes('Unauthorized')) {
      return 'Phiên làm việc đã hết hạn, vui lòng đăng nhập lại';
    }
    if (msg.includes('403') || msg.includes('Forbidden')) {
      return 'Bạn không có quyền thực hiện hành động này';
    }
    if (msg.includes('Network') || msg.includes('Failed to fetch')) {
      return 'Lỗi kết nối, vui lòng kiểm tra internet';
    }
    if (msg.includes('timeout')) {
      return 'Yêu cầu quá lâu, vui lòng thử lại';
    }
    return msg;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Có lỗi xảy ra, vui lòng thử lại';
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
