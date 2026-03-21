export interface StaffShiftAssignment {
  id?: string;
  _id?: string;
  shift_assignment_id?: string;
  work_date?: string;
  status?: string;
  shift_id?: string;
  shift_name?: string;
  checkin_time?: string;
  checkout_time?: string;
  parent_location_id?: string;
  parent_location_name?: string;
  [key: string]: unknown;
}

export interface CleaningTask {
  id?: string;
  _id?: string;
  pod_id?: string;
  booking_id?: string;
  cleaner_id?: string;
  shift_assignment_id?: string;
  start_time?: string;
  end_time?: string;
  status?: string;
  [key: string]: unknown;
}
