# Test Cases — Cleaning Task, Incident, Lost & Found, Warehouse

---

## 1. CLEANING TASK MODULE

### 1.1 Create Cleaning Task

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| CT-CREATE-001 | Create cleaning task with valid data | 1. Login as Admin/Manager on the management app.<br>2. Open Cleaning Tasks and tap Create Task.<br>3. Select a valid Pod and active Cleaner.<br>4. Set status to ASSIGNED and save. | The new task is created successfully and appears in task list with all key fields filled. Assignment timestamp is recorded automatically. | Admin/Manager authenticated. Pod, Cleaner (active) exist in DB |
| CT-CREATE-002 | Create cleaning task with booking and shift assignment | 1. Login as Admin/Manager.<br>2. Open Create Task form.<br>3. Select Pod, Cleaner, Booking, and Shift Assignment.<br>4. Save the task. | The task is created and correctly linked to both booking and shift assignment. | Booking and ShiftAssignment exist in DB |
| CT-CREATE-003 | Create cleaning task with non-existent pod | 1. Login as Admin.<br>2. Open Create Task form.<br>3. Enter/select a Pod that does not exist.<br>4. Tap Save. | The system blocks creation and shows that Pod is not found. No task is created. | Admin authenticated |
| CT-CREATE-004 | Create cleaning task with inactive cleaner | 1. Login as Admin/Manager.<br>2. Open Create Task form.<br>3. Select a cleaner account that is inactive.<br>4. Save the task. | The system blocks creation and shows cleaner is inactive or unavailable. | User exists but `isActive = false` |
| CT-CREATE-005 | Create cleaning task with non-existent booking | 1. Login as Admin.<br>2. Create a task and provide an invalid booking reference.<br>3. Save the form. | The task is not created. A booking-not-found validation message is shown. | Admin authenticated, pod and cleaner exist |
| CT-CREATE-006 | Create cleaning task with NOTIFIED status triggers notification | 1. Login as Admin/Manager.<br>2. Create task with valid Pod/Cleaner.<br>3. Set status to NOTIFIED and save.<br>4. Open cleaner app History/Notifications tab. | Task is created and a notification is delivered to the assigned cleaner. Notified time is tracked by system. | Cleaner has valid user account for notification |
| CT-CREATE-007 | Create cleaning task without required pod_id | 1. Login as Admin.<br>2. Open Create Task form.<br>3. Leave Pod empty and try to save. | The form shows validation error for missing Pod and prevents submission. | Admin authenticated |
| CT-CREATE-008 | Create cleaning task without required cleaner_id | 1. Login as Admin.<br>2. Open Create Task form.<br>3. Leave Cleaner empty and try to save. | The form shows validation error for missing Cleaner and prevents submission. | Admin authenticated |
| CT-CREATE-009 | Unauthorized user (customer role) creates task | 1. Login with customer role.<br>2. Try to access task creation screen or submit task creation action.<br>3. Confirm the result. | Customer cannot create cleaning tasks. Access/action is denied. | Customer authenticated |
| CT-CREATE-010 | Unauthenticated request creates task | 1. Open app/session without login.<br>2. Attempt to access cleaning task creation action.<br>3. Confirm response behavior. | User is redirected to login or shown unauthorized message. No task is created. | No authentication |

### 1.2 Get All Cleaning Tasks

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| CT-GETALL-001 | Get all cleaning tasks without filters | 1. Login as Admin/Manager.<br>2. Open Cleaning Task list screen with no filters.<br>3. Wait for data to load. | Task list is displayed with all available tasks and enriched labels (pod, location, booking guest). | Admin authenticated, at least one task exists |
| CT-GETALL-002 | Filter tasks by pod_id | 1. Open task list.<br>2. Apply Pod filter with a valid Pod.<br>3. Refresh list. | Only tasks belonging to selected Pod are shown. | Multiple tasks exist for different pods |
| CT-GETALL-003 | Filter tasks by multiple pod_ids | 1. Open task list.<br>2. Apply multiple Pod filters.<br>3. Refresh list. | Tasks from all selected Pods are shown; non-selected Pods are excluded. | Tasks exist for both pods |
| CT-GETALL-004 | Filter tasks by status | 1. Open task list.<br>2. Set status filter to IN_PROGRESS.<br>3. Refresh list. | Only tasks in IN_PROGRESS status are shown. | Tasks in various statuses exist |
| CT-GETALL-005 | Filter tasks by booking_id | 1. Open task list.<br>2. Enter/select specific booking reference.<br>3. Apply filter. | Only tasks linked to that booking are displayed. | Task linked to a booking exists |
| CT-GETALL-006 | Filter tasks by cleaner_id | 1. Open task list.<br>2. Filter by one cleaner.<br>3. Apply and review results. | Only tasks assigned to that cleaner appear in list. | Tasks assigned to multiple cleaners exist |
| CT-GETALL-007 | Filter tasks by request_source | 1. Open task list.<br>2. Apply source filter AUTO_AFTER_CHECKOUT.<br>3. Refresh list. | Only tasks created from AUTO_AFTER_CHECKOUT source are displayed. | Tasks with various request_sources exist |
| CT-GETALL-008 | Filter tasks by due date range | 1. Open task list.<br>2. Set due date from/to range.<br>3. Apply filter. | List only contains tasks with due time in selected range. | Tasks with various due dates exist |
| CT-GETALL-009 | Manager sees only tasks within pod scope | 1. Login as scoped Manager.<br>2. Open task list without filters.<br>3. Compare with known cross-pod data. | Manager only sees tasks belonging to scoped Pods. | Manager has scope limited to specific pods |
| CT-GETALL-010 | Cleaner can access the endpoint | 1. Login as Cleaner in mobile app.<br>2. Open Nhiệm vụ tab.<br>3. Pull to refresh. | Cleaner can load task list and view tasks allowed by role/scope. | Cleaner authenticated |

### 1.3 Get My Cleaning Tasks

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| CT-GETMY-001 | Cleaner gets own tasks | 1. Login as Cleaner.<br>2. Open Nhiệm vụ tab.<br>3. Review loaded task cards. | Only tasks assigned to current cleaner account are shown. | Cleaner has assigned tasks |
| CT-GETMY-002 | Cleaner gets tasks with status filter | 1. Open Nhiệm vụ tab.<br>2. Open Filter and choose ASSIGNED.<br>3. Apply filter. | Only ASSIGNED tasks of current cleaner are displayed. | Cleaner has tasks in various statuses |
| CT-GETMY-003 | Cleaner with no tasks | 1. Login with cleaner account that has no assignments.<br>2. Open Nhiệm vụ tab.<br>3. Refresh list. | Empty state is shown with zero tasks and no crash. | Cleaner exists but has no tasks |

### 1.4 Get Cleaning Task By ID

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| CT-GETID-001 | Get existing task by ID | 1. Login as authorized user.<br>2. Open task list and tap a valid task card.<br>3. Open task detail screen. | Task detail page loads with full enriched information and timeline/status controls. | Task exists |
| CT-GETID-002 | Get non-existent task | 1. Navigate to task detail using invalid/deleted task link.<br>2. Wait for load result.<br>3. Observe UI state. | App shows not-found/error state and does not render invalid task data. | No task with that ID |
| CT-GETID-003 | Manager outside pod scope gets task | 1. Login as manager outside target pod scope.<br>2. Try to open task detail from deep link or direct selection.<br>3. Observe result. | Access is blocked or task is hidden due to scope restriction. | Manager with limited scope |

### 1.5 Update Cleaning Task

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| CT-UPDATE-001 | Update task status from ASSIGNED to ACCEPTED | 1. Login as assigned cleaner.<br>2. Open task detail in Nhiệm vụ tab.<br>3. Tap Nhận việc (Accept). | Task status changes to ACCEPTED and accepted timestamp is set. | Cleaner is checked-in at location. Task in ASSIGNED status |
| CT-UPDATE-002 | Update task status from ACCEPTED to IN_PROGRESS | 1. Open ACCEPTED task detail.<br>2. Tap Bắt đầu dọn (Start).<br>3. Confirm action. | Task moves to IN_PROGRESS and start time is recorded. | Cleaner checked-in. Task in ACCEPTED status |
| CT-UPDATE-003 | Update task status to DONE with AFTER photo | 1. In task detail, ensure at least one AFTER photo is uploaded.<br>2. Tap Hoàn thành (Complete).<br>3. Confirm completion. | Task changes to DONE and end time is recorded. Deposit handling flow is triggered when business conditions are met. | At least 1 AFTER photo exists for the task. Cleaner checked-in |
| CT-UPDATE-004 | Update task status to DONE without AFTER photo | 1. Open IN_PROGRESS task with no AFTER photos.<br>2. Tap Hoàn thành.<br>3. Observe validation. | Completion is blocked and app informs cleaner that AFTER photo is required. | No AFTER photo exists for the task |
| CT-UPDATE-005 | Cleaner updates another cleaner's task | 1. Login as cleaner A.<br>2. Open task assigned to cleaner B (if visible by link/list).<br>3. Try changing status. | System denies status update because task is not owned by current cleaner. | Task assigned to a different cleaner |
| CT-UPDATE-006 | Cleaner not checked-in tries to set ACCEPTED | 1. Login as cleaner not checked in at task location.<br>2. Open ASSIGNED task.<br>3. Tap Accept. | Action is rejected with message requiring valid check-in/location condition. | Cleaner not checked-in at the task's location |
| CT-UPDATE-007 | Reassign task to different cleaner | 1. Login as admin on management app.<br>2. Open task and change assigned cleaner.<br>3. Save reassignment. | Task is reassigned, previous cleaner is tracked in reassignment metadata, and both cleaners receive updated notification/event. | Admin authenticated. Old and new cleaners exist |
| CT-UPDATE-008 | Update task to CANCELLED | 1. Login as admin/manager.<br>2. Open target task.<br>3. Change status to CANCELLED and save. | Task is cancelled successfully and appears as cancelled in all related views. | Task exists, admin authenticated |
| CT-UPDATE-009 | DONE task triggers auto-refund of deposit | 1. Prepare booking/order meeting refund conditions.<br>2. Cleaner completes the last required cleaning task.<br>3. Monitor booking/payment summary. | Deposit is settled by refund flow and wallet transaction is created with success notification. | Order.deposit_settlement_status = PENDING_INSPECTION, deposit_total > 0, no other active tasks, no incidents |
| CT-UPDATE-010 | DONE task with existing incident skips simple refund | 1. Prepare task with active incident on booking.<br>2. Mark task DONE from cleaner app.<br>3. Review settlement behavior. | Task completes, but final deposit settlement is delegated to incident resolution flow instead of direct refund. | Incident exists for booking. Order deposit pending |
| CT-UPDATE-011 | Update task note field | 1. Open task detail as authorized role.<br>2. Enter/edit note text.<br>3. Save changes. | Note text is updated and visible on subsequent reload. | Task exists, authorized user |
| CT-UPDATE-012 | Realtime event emitted on status change | 1. Open cleaner app on device A and observer/admin app on device B.<br>2. Change task status on device A.<br>3. Watch task feed/history on device B. | Realtime event is received and UI updates quickly without full manual refresh. | WebSocket listeners connected |

### 1.6 Delete Cleaning Task

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| CT-DELETE-001 | Admin deletes cleaning task | 1. Login as Admin.<br>2. Open task list and select target task.<br>3. Tap Delete and confirm. | Task is removed and no longer appears in list/detail. | Admin authenticated, task exists |
| CT-DELETE-002 | Non-admin tries to delete task | 1. Login as Manager or Cleaner.<br>2. Open task actions.<br>3. Attempt delete. | Delete action is hidden or denied by permission control. | Manager/Cleaner authenticated |
| CT-DELETE-003 | Delete non-existent task | 1. Login as Admin.<br>2. Attempt delete on stale/deleted task link.<br>3. Confirm response. | System returns not-found behavior and keeps current data intact. | Admin authenticated |

### 1.7 Auto-Assign Cleaning Task

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| CT-AUTO-001 | Auto-assign triggers on booking order creation | 1. Create a booking checkout/order event in backoffice.<br>2. Wait for automation cycle.<br>3. Open cleaner task list. | A new turnover cleaning task is auto-created and assigned to the best available cleaner. | Active cleaners with checked-in shift assignments exist at pod's location |
| CT-AUTO-002 | Auto-assign with load balancing selects least-loaded cleaner | 1. Prepare multiple available cleaners with different active-task counts.<br>2. Trigger auto-assign event.<br>3. Compare assigned cleaner. | System assigns task to least-loaded cleaner (tie-breaker follows policy, e.g., latest check-in). | Multiple cleaners checked-in with varying task loads |
| CT-AUTO-003 | Auto-assign skips when NO_SHOW booking | 1. Mark booking as NO_SHOW.<br>2. Trigger/observe auto-assign flow.<br>3. Check task list. | No new turnover task is created; existing open tasks are cancelled as per policy. | Booking exists with NO_SHOW state |
| CT-AUTO-004 | Auto-assign skips when no cleaner shifts exist | 1. Ensure no cleaner shift is active for target location.<br>2. Trigger auto-assign.<br>3. Check task queue. | No task is created due to no available cleaner shift. | Location has no CLEANER role shifts |
| CT-AUTO-005 | Auto-assign skips when active task already exists | 1. Ensure booking already has active turnover task.<br>2. Trigger auto-assign again.<br>3. Verify queue. | Duplicate turnover task is not created. | Active AUTO_AFTER_CHECKOUT or SYSTEM_RETRY task exists for booking |
| CT-AUTO-006 | Auto-assign allows USER_REQUEST alongside turnover task | 1. Keep existing turnover task active.<br>2. Trigger cleaner-access/user-request flow.<br>3. Check created tasks. | Additional USER_REQUEST task is created while existing turnover task remains. | Active turnover task exists, trigger is SET_CLEANER_ACCESS_TRUE |
| CT-AUTO-007 | Auto-assign applies buffer policy from pod level | 1. Configure pod-level buffer to 45 minutes.<br>2. Trigger auto-assign for a booking at that pod.<br>3. Open task detail and verify due time. | Due time follows pod-level buffer rule (booking end + 45 minutes). | Pod-level CleaningBufferPolicy with buffer_minutes=45 |
| CT-AUTO-008 | Auto-assign falls back to location-level buffer | 1. Remove pod-level policy and keep location-level policy.<br>2. Trigger auto-assign.<br>3. Verify due time. | Due time is calculated using location-level policy. | Location-level buffer policy exists, no pod/cluster policy |
| CT-AUTO-009 | Auto-assign uses default 30-minute buffer | 1. Remove all active buffer policies.<br>2. Trigger auto-assign.<br>3. Verify due time in task detail. | Due time uses default buffer (30 minutes) defined by system. | No CleaningBufferPolicy exists at any level |
| CT-AUTO-010 | Auto-assign respects due-time spacing | 1. Prepare cleaner A with nearby due-time conflict.<br>2. Keep cleaner B available without conflict.<br>3. Trigger auto-assign. | System avoids conflict and assigns task to a cleaner with safer schedule spacing. | Multiple cleaners, one has due-time conflict |

### 1.8 Backfill Cleaning Tasks

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| CT-BACKFILL-001 | Backfill creates tasks for bookings without SYSTEM_RETRY tasks | 1. Login as admin in backoffice.<br>2. Run backfill action from maintenance tool.<br>3. Review summary and cleaner queue. | Backfill creates missing tasks and returns creation summary. | Completed bookings exist without SYSTEM_RETRY tasks |
| CT-BACKFILL-002 | Backfill dry run does not create tasks | 1. Run backfill in dry-run mode.<br>2. Read preview summary.<br>3. Re-open task list for verification. | Preview is shown, but no new tasks are actually created. | Same as CT-BACKFILL-001 |
| CT-BACKFILL-003 | Backfill skips bookings already having SYSTEM_RETRY task | 1. Run backfill with mixed eligible/ineligible bookings.<br>2. Inspect skipped section.<br>3. Verify no duplicates. | Existing SYSTEM_RETRY bookings are skipped and reported in summary. | Bookings with existing SYSTEM_RETRY tasks |
| CT-BACKFILL-004 | Backfill respects from_date and to_date filters | 1. Run backfill with specific date range.<br>2. Inspect processed bookings.<br>3. Compare with out-of-range records. | Only bookings in selected range are processed. | Bookings in and out of date range |
| CT-BACKFILL-005 | Backfill respects limit parameter | 1. Run backfill with small limit (e.g., 5).<br>2. Check created count.<br>3. Confirm remaining bookings are untouched. | Created tasks do not exceed configured limit. | More than 5 eligible bookings |

### 1.9 Debug Auto-Assign

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| CT-DEBUG-001 | Debug auto-assign returns diagnostic info | 1. Open admin debug tool for auto-assign.<br>2. Input valid booking ID.<br>3. Run diagnostic preview. | Debug output shows booking context, cleaner candidates, policies, and predicted decision/skip reason. | Booking exists |
| CT-DEBUG-002 | Debug does not mutate data | 1. Run debug preview multiple times.<br>2. Compare task count before/after.<br>3. Verify no side effects. | No task is created or modified by debug mode. | Booking exists, eligible cleaners |

### 1.10 Get Cleaner Online Key

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| CT-KEY-001 | Cleaner gets online key for assigned task | 1. Login as assigned cleaner.<br>2. Open task detail.<br>3. Tap action to load cleaner key.<br>4. Review key status block. | Cleaner receives valid key information for the task booking window, and invalid old keys are revoked. | Task in ASSIGNED/NOTIFIED/ACCEPTED/IN_PROGRESS, booking is IN_USE or COMPLETED |
| CT-KEY-002 | Cleaner tries to get key for another's task | 1. Login as different cleaner.<br>2. Open task not assigned to current account.<br>3. Request key. | Access is denied and key data is not exposed. | Task assigned to different cleaner |
| CT-KEY-003 | Get key for task with NO_SHOW booking | 1. Open task linked to NO_SHOW booking.<br>2. Request key in task detail.<br>3. Observe message. | Key retrieval is blocked due to NO_SHOW policy. | Booking has checkin_state=NO_SHOW |
| CT-KEY-004 | Get key when booking is IN_USE but cleaner_access_allowed=false | 1. Open task linked to IN_USE booking with cleaner access off.<br>2. Request key.<br>3. Observe result. | Key retrieval is blocked and app explains cleaner access is not allowed yet. | Booking IN_USE, cleaner_access_allowed=false |
| CT-KEY-005 | Non-cleaner role tries to get key | 1. Login as Admin/Manager.<br>2. Attempt to request cleaner key for task.<br>3. Confirm access outcome. | Endpoint/action is restricted to cleaner role; access denied for non-cleaners. | Admin authenticated |

---

## 2. CLEANING PHOTO MODULE

### 2.1 Create Cleaning Photo

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| CP-CREATE-001 | Upload BEFORE photo for cleaning task | 1. Login as cleaner.<br>2. Open task detail and tap camera/upload in cleaning flow.<br>3. Select type BEFORE and submit photo. | BEFORE photo is uploaded and visible in task photo gallery. | Valid cleaning task exists |
| CP-CREATE-002 | Upload AFTER photo for cleaning task | 1. Open task detail in active cleaning flow.<br>2. Capture/select image.<br>3. Set type AFTER and upload. | AFTER photo is saved successfully and appears in gallery. | Valid cleaning task exists |
| CP-CREATE-003 | Upload photo with base64 data URI | 1. Trigger upload from a source producing base64 URI.<br>2. Submit in photo form.<br>3. Verify upload result. | Image is accepted, processed, and shown as standard photo record. | Valid cleaning task exists |
| CP-CREATE-004 | Upload photo exceeding 12MB | 1. Choose an image larger than 12MB.<br>2. Attempt upload in task detail.<br>3. Observe validation message. | Upload is rejected with file-size error. | Valid cleaning task exists |
| CP-CREATE-005 | Upload photo with invalid image format | 1. Attempt to upload a non-image file from picker/tool.<br>2. Submit photo form.<br>3. Observe error. | System rejects invalid format and does not create photo record. | Valid cleaning task exists |
| CP-CREATE-006 | Create photo without cleaning_task_id | 1. Open photo flow without valid selected task (invalid path/state).<br>2. Try submitting image.<br>3. Observe response. | Submission is blocked because cleaning task reference is required. | Authenticated user |
| CP-CREATE-007 | Create photo with invalid type | 1. Use tampered payload/UI state to set unsupported type.<br>2. Submit upload.<br>3. Observe result. | System rejects type and allows only BEFORE/AFTER values. | Valid cleaning task exists |
| CP-CREATE-008 | Create photo for non-existent task | 1. Open stale/deleted task reference.<br>2. Attempt upload.<br>3. Observe error state. | Upload fails because target task does not exist. | Authenticated user |
| CP-CREATE-009 | Image is preprocessed (resized to 1920px, compressed) | 1. Upload high-resolution image from mobile camera.<br>2. Wait for upload completion.<br>3. Inspect stored output metadata/quality. | Stored image is resized/compressed according to configured optimization rule while preserving usability. | Valid cleaning task exists |

### 2.2 Get Cleaning Photos

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| CP-GETALL-001 | Get all photos for a cleaning task | 1. Open task detail with existing photos.<br>2. Navigate to photo section.<br>3. Scroll through items. | All photos linked to the task are displayed with image content and metadata. | Photos exist for the task |
| CP-GETALL-002 | Filter photos by type BEFORE | 1. In task detail photo section, apply BEFORE filter.<br>2. Refresh list if needed.<br>3. Review output. | Only BEFORE photos are shown. | BEFORE and AFTER photos exist |
| CP-GETALL-003 | Filter photos by type AFTER | 1. In task detail photo section, apply AFTER filter.<br>2. Refresh list.<br>3. Review output. | Only AFTER photos are shown. | BEFORE and AFTER photos exist |
| CP-GETALL-004 | Get photo by ID | 1. Tap one photo item from list.<br>2. Open photo detail/preview.<br>3. Verify record information. | Selected photo opens correctly with its associated details. | Photo exists |
| CP-GETALL-005 | Get non-existent photo | 1. Open invalid photo deep link/id.<br>2. Wait for loader to finish.<br>3. Check screen state. | Not-found/error state is shown, no broken photo data rendered. | No photo with that ID |

### 2.3 Update Cleaning Photo

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| CP-UPDATE-001 | Update photo type from BEFORE to AFTER | 1. Open editable photo record.<br>2. Change type from BEFORE to AFTER.<br>3. Save changes. | Photo type is updated and reflected in filtered lists. | Photo exists |
| CP-UPDATE-002 | Replace photo image with new upload | 1. Open photo edit action.<br>2. Pick a new image and save.<br>3. Reload photo section. | Old asset is replaced and new image is displayed for same photo record. | Photo with Cloudinary asset exists |
| CP-UPDATE-003 | Update non-existent photo | 1. Attempt edit on deleted/non-existent photo id.<br>2. Submit update.<br>3. Observe result. | System returns not-found behavior and no record is modified. | No photo with that ID |

### 2.4 Delete Cleaning Photo

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| CP-DELETE-001 | Delete photo | 1. Login as Admin/Manager.<br>2. Open photo record in task context.<br>3. Tap Delete and confirm. | Photo is removed from storage and no longer appears in task gallery. | Photo exists. Admin/Manager authenticated |
| CP-DELETE-002 | Cleaner cannot delete photo | 1. Login as Cleaner.<br>2. Open photo actions.<br>3. Attempt delete. | Delete action is blocked for cleaner role. | Cleaner authenticated |
| CP-DELETE-003 | Delete non-existent photo | 1. Login as Admin.<br>2. Attempt delete on invalid photo record.<br>3. Observe message. | System reports not found and remains stable. | Admin authenticated |

---

## 4. INCIDENT / DAMAGE REPORT MODULE

### 4.1 Create Incident (Damage Report)

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| INC-CREATE-001 | Cleaner creates damage report during IN_PROGRESS task | 1. Login as cleaner and open an IN_PROGRESS task detail.<br>2. Open Damage Report form.<br>3. Fill description, severity, add ITEM details, attach photos.<br>4. Submit report. | Incident report is created successfully with pending status, detail lines, photos, and notifications to related roles. | Cleaner has IN_PROGRESS cleaning task. Items exist in DB |
| INC-CREATE-002 | Create damage report with SERVICE type detail | 1. Open damage report form.<br>2. Add SERVICE line with valid service catalog and quantity.<br>3. Submit report. | Report is created with SERVICE detail and service price snapshot captured from catalog. | Active DamageServiceCatalog exists |
| INC-CREATE-003 | Create damage report with ITEM type detail | 1. Open damage report form.<br>2. Add ITEM line with item and quantity.<br>3. Submit report. | Report stores ITEM detail with item cost snapshot and correct line total. | Item exists in DB |
| INC-CREATE-004 | Create damage report with multiple details | 1. Add multiple ITEM/SERVICE lines in one report.<br>2. Submit form.<br>3. Open created incident detail. | All selected detail lines are persisted and total estimate is aggregated correctly. | Multiple items/services exist |
| INC-CREATE-005 | Create damage report with photos via multipart upload | 1. In task detail, open report camera flow.<br>2. Capture/upload up to allowed photos.<br>3. Submit incident. | Incident is created and all uploaded photos are linked and viewable. | Cleaner has IN_PROGRESS task |
| INC-CREATE-006 | Create damage report with photo URLs in body | 1. Use report flow that sends photo URLs.<br>2. Submit valid URL list with incident data.<br>3. Open report detail. | Incident is created and each URL appears as attached incident photo. | Cleaner has IN_PROGRESS task |
| INC-CREATE-007 | Create damage report exceeding 8 photo limit | 1. Attach 9 photos in damage report form.<br>2. Submit report.<br>3. Observe validation. | Submission is blocked with max-photo-limit message. | Cleaner has IN_PROGRESS task |
| INC-CREATE-008 | Create report without description | 1. Open damage report form.<br>2. Leave description empty.<br>3. Submit. | Form validation prevents submit and asks for description. | Cleaner authenticated |
| INC-CREATE-009 | Create report without details array | 1. Open report form.<br>2. Enter description but do not select any item/service detail.<br>3. Submit. | Submission is blocked with message requiring at least one detail line. | Cleaner authenticated |
| INC-CREATE-010 | Create report with empty details array | 1. Open report form with no selected details.<br>2. Submit.<br>3. Observe validation. | System rejects report because detail list cannot be empty. | Cleaner authenticated |
| INC-CREATE-011 | Cleaner reports on task not in IN_PROGRESS | 1. Open task in ASSIGNED status.<br>2. Try to submit damage report from task flow.<br>3. Observe response. | Reporting is blocked because task is not in allowed status. | Task exists in ASSIGNED status |
| INC-CREATE-012 | Cleaner reports on another cleaner's task | 1. Login as cleaner A.<br>2. Open task assigned to cleaner B.<br>3. Try to create report. | Access is denied; cleaner can report only on own task context. | Task assigned to different cleaner |
| INC-CREATE-013 | Create report with inactive service catalog | 1. Select inactive service entry through stale/tampered option.<br>2. Submit report.<br>3. Observe validation. | Report is rejected because selected service catalog is inactive. | Inactive catalog exists |
| INC-CREATE-014 | Create report with custom estimated_service_fee | 1. Create report with valid details.<br>2. Enter custom service-fee estimate.<br>3. Submit and open created report. | Incident stores custom estimated service fee and updates total estimate accordingly. | Cleaner has IN_PROGRESS task |
| INC-CREATE-015 | Create report with pod_id directly (no task) | 1. Login as Admin/Manager in management app.<br>2. Open incident form outside task context.<br>3. Select Pod and submit report. | Incident is created and linked to pod even without task association. | Admin/Manager authenticated, pod exists |
| INC-CREATE-016 | Pricing source is set to ITEM_SUMMARY_SNAPSHOT | 1. Create standard damage report with detail lines.<br>2. Open incident detail metadata.<br>3. Verify pricing source field. | Pricing source is recorded as item-summary snapshot for audit consistency. | Cleaner has IN_PROGRESS task |

### 4.2 Get Incidents / Damage Reports

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| INC-GETALL-001 | Get all damage reports | 1. Login with authorized role.<br>2. Open incident/damage report list screen.<br>3. Load first page. | List is displayed with incident context, details, pricing summary, and attached photos. | Incidents exist |
| INC-GETALL-002 | Filter by pod_id | 1. Open incident list filters.<br>2. Select one pod.<br>3. Apply filter. | Only reports for selected pod are shown. | Reports for multiple pods exist |
| INC-GETALL-003 | Filter by status PENDING | 1. Open filters and choose status PENDING.<br>2. Apply filter.<br>3. Review rows. | Only pending incidents are displayed. | Reports in various statuses |
| INC-GETALL-004 | Filter by severity | 1. Open filters and choose HIGH severity.<br>2. Apply filter.<br>3. Review results. | Only incidents with selected severity are listed. | Reports with various severities |
| INC-GETALL-005 | Filter by date range | 1. Set from/to date in report filter panel.<br>2. Apply.<br>3. Compare records. | List only includes incidents created in selected date range. | Reports across date ranges |
| INC-GETALL-006 | Filter by cleaning_task_id | 1. Enter or select task reference in filters.<br>2. Apply.<br>3. Open results. | Only incidents linked to that task are shown. | Reports for multiple tasks |
| INC-GETALL-007 | Paginated results | 1. Open incident list with page size 10.<br>2. Navigate page 1 -> page 2.<br>3. Compare counts. | Pagination metadata and page navigation behave correctly. | More than 10 reports exist |
| INC-GETALL-008 | Cleaner sees only own reports | 1. Login as cleaner.<br>2. Open damage report history in cleaner app.<br>3. Review all rows. | Cleaner only sees reports created by current account (or scope allowed by policy). | Cleaner has reported some incidents |
| INC-GETALL-009 | Manager sees reports in pod scope | 1. Login as manager with limited scope.<br>2. Open report list.<br>3. Verify pod coverage. | Only reports in manager's scope are shown. | Manager with limited scope |
| INC-GETALL-010 | Get pending reviews for manager | 1. Login as manager.<br>2. Open Pending Reviews screen.<br>3. Load list. | Only pending incidents requiring manager review in scope are shown. | PENDING incidents exist in manager's scope |

### 4.3 Get Incident By ID

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| INC-GETID-001 | Get incident with full details | 1. Open incident list.<br>2. Tap one valid incident row.<br>3. View detail page. | Incident detail shows complete information: metadata, photos, details, and pricing. | Incident exists with photos and details |
| INC-GETID-002 | Get non-existent incident | 1. Open invalid/deleted incident link.<br>2. Wait for loading to finish.<br>3. Observe screen. | Not-found/error state is shown and no invalid incident data is rendered. | No incident with that ID |
| INC-GETID-003 | Manager out of scope tries to get incident | 1. Login as out-of-scope manager.<br>2. Try to access incident detail by direct link.<br>3. Observe access result. | Access is denied due to scope policy. | Manager scope excludes incident's pod |

### 4.4 Update Incident Status

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| INC-STATUS-001 | Manager resolves incident | 1. Login as in-scope manager.<br>2. Open a pending incident.<br>3. Choose Resolve and enter resolution note.<br>4. Submit review. | Incident status changes to RESOLVED, reviewer is recorded, settlement workflow starts, and cleaner is notified. | Incident in PENDING status. Manager authenticated in scope |
| INC-STATUS-002 | Manager dismisses incident | 1. Login as in-scope manager.<br>2. Open a pending incident.<br>3. Choose Dismiss and provide reason.<br>4. Submit. | Incident status changes to DISMISSED and settlement/refund logic runs according to policy. Cleaner receives status update notification. | Incident in PENDING. Manager in scope |
| INC-STATUS-003 | Try to resolve already RESOLVED incident | 1. Open already resolved incident.<br>2. Attempt to apply Resolve again.<br>3. Confirm behavior. | System blocks duplicate review and shows validation that only pending incidents can be reviewed. | Incident already RESOLVED |
| INC-STATUS-004 | Cleaner tries to update incident status | 1. Login as cleaner.<br>2. Open incident detail.<br>3. Try to access review action. | Review actions are hidden/denied for cleaner role. | Cleaner authenticated |
| INC-STATUS-005 | Update with invalid status value | 1. Submit tampered/invalid status in review flow.<br>2. Confirm submission result.<br>3. Check incident status. | Invalid status is rejected; incident remains unchanged. | Incident in PENDING |
| INC-STATUS-006 | Manager outside scope tries to resolve | 1. Login as manager outside incident pod scope.<br>2. Open incident review page via direct link.<br>3. Try resolve action. | Action is denied due to scope restriction. | Manager scope excludes incident's pod |

### 4.5 Deposit Settlement via Incident

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| INC-SETTLE-001 | Full deposit covers all damage | 1. Resolve incident where total damage is less than deposit.<br>2. Wait for settlement to complete.<br>3. Check wallet/order ledger. | Deposit is partially forfeited and remaining amount is refunded to user wallet with proper transaction record. | Order deposit > total damage. All bookings terminal. No blocking tasks. No pending incidents |
| INC-SETTLE-002 | Damage exceeds deposit, wallet debited | 1. Resolve incident with damage greater than deposit.<br>2. Ensure user wallet has enough balance for difference.<br>3. Verify settlement entries. | Deposit is fully forfeited and extra amount is debited from wallet as penalty transaction. | User wallet has sufficient balance |
| INC-SETTLE-003 | Damage exceeds deposit + wallet, debt created | 1. Resolve high-damage incident with low wallet balance.<br>2. Wait for settlement.<br>3. Inspect debt and wallet records. | Deposit is forfeited, wallet is drained to zero, and debt record is created for outstanding amount. | User wallet has insufficient balance |
| INC-SETTLE-004 | No damage (dismissed), full refund | 1. Dismiss all incidents for same order.<br>2. Trigger final settlement check.<br>3. Inspect wallet result. | Full deposit is refunded to user because no payable damage remains. | All incidents dismissed. No resolved incidents with damage |
| INC-SETTLE-005 | Settlement blocked by active cleaning tasks | 1. Resolve incident while another related cleaning task is still active.<br>2. Check settlement output.<br>3. Verify order status. | Settlement is deferred with warning that active cleaning task still exists. | Active cleaning task exists for one of the bookings in order |
| INC-SETTLE-006 | Settlement blocked by other PENDING incidents | 1. Resolve one incident while another incident is still pending.<br>2. Check settlement response.<br>3. Verify no wallet move yet. | Settlement is deferred until all related incidents are no longer pending. | Multiple incidents for same order, only one resolved |
| INC-SETTLE-007 | Settlement blocked: order already settled | 1. Resolve incident on already-settled order.<br>2. Check settlement logs.<br>3. Confirm no duplicate financial action. | Settlement step is skipped because order settlement was already completed before this review. | Order deposit already REFUNDED or FORFEITED |

---

## 6. LOST AND FOUND MODULE

### 6.1 Create Lost & Found Item

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| LF-CREATE-001 | Create lost item with all fields | 1. Login as cleaner/manager/admin.<br>2. Open Lost & Found tab and tap Create.<br>3. Enter item name, description, pod, warehouse and upload photo.<br>4. Submit. | New Lost & Found item is created in FOUND status with creator info and photo attached. | Pod and Warehouse exist. Authenticated as admin/manager/cleaner |
| LF-CREATE-002 | Create lost item with minimal fields | 1. Open Create Lost & Found form.<br>2. Enter only item name.<br>3. Submit. | Item is created successfully with default FOUND status and optional fields left empty. | Authenticated user |
| LF-CREATE-003 | Create lost item with base64 photo | 1. Add image via base64 source in create form.<br>2. Submit item.<br>3. Open created record. | Photo is accepted/processed and appears in created item. | Authenticated user |
| LF-CREATE-004 | Create item without item_name | 1. Open create form.<br>2. Leave item name blank.<br>3. Submit. | Validation blocks submission and requests item name. | Authenticated user |
| LF-CREATE-005 | Create item with non-existent pod_id | 1. Select an invalid pod (tampered/stale option).<br>2. Submit form.<br>3. Observe result. | Creation fails with pod-not-found validation message. | Authenticated user |
| LF-CREATE-006 | Create item with non-existent warehouse_id | 1. Select invalid warehouse value.<br>2. Submit create form.<br>3. Observe response. | Creation fails with warehouse-not-found message. | Authenticated user |
| LF-CREATE-007 | Create item with photo > 12MB | 1. Choose oversized image in create form.<br>2. Submit.<br>3. Observe validation. | Upload is rejected due to file size limit. | Authenticated user |
| LF-CREATE-008 | Create item with invalid image format | 1. Attempt to attach non-image file.<br>2. Submit.<br>3. Observe message. | Invalid file format is rejected and item is not created with that file. | Authenticated user |
| LF-CREATE-009 | Create item with booking_id | 1. Open create form.<br>2. Enter valid booking reference with item data.<br>3. Submit. | Item is created and linked to specified booking. | Authenticated user, booking exists |
| LF-CREATE-010 | Unauthenticated user creates item | 1. Open app without login.<br>2. Try to access Lost & Found create flow.<br>3. Observe behavior. | User is redirected/blocked by authentication guard. | No authentication |
| LF-CREATE-011 | Customer role creates item | 1. Login as customer role.<br>2. Try to open/create Lost & Found item.<br>3. Submit attempt. | Action is denied by role permission. | Customer authenticated |

### 6.2 Get Lost & Found Items

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| LF-GETALL-001 | Get all items without filters | 1. Login and open Lost & Found list.<br>2. Keep filters empty.<br>3. Pull to refresh. | List displays all available records sorted by newest and enriched display fields. | Items exist. Authenticated user |
| LF-GETALL-002 | Filter by pod_id | 1. Open list filters.<br>2. Select one pod.<br>3. Apply filter. | Only items from selected pod are shown. | Items from multiple pods |
| LF-GETALL-003 | Filter by status FOUND | 1. Set status filter to FOUND.<br>2. Apply.<br>3. Review results. | Only items in FOUND status are listed. | Items in various statuses |
| LF-GETALL-004 | Filter by warehouse_id | 1. Select warehouse filter.<br>2. Apply.<br>3. Review list. | Only items stored in selected warehouse are displayed. | Items in multiple warehouses |
| LF-GETALL-005 | Filter by invalid status | 1. Submit invalid status value from tampered request/UI.<br>2. Refresh list.<br>3. Observe response. | Invalid status input is rejected with validation error. | Authenticated user |
| LF-GETALL-006 | Paginated results | 1. Open list with page/limit controls.<br>2. Navigate between pages.<br>3. Verify metadata. | Pagination works correctly with expected page counters and item count. | More than 10 items exist |
| LF-GETALL-007 | Paginated with max limit 100 | 1. Request list with limit > 100.<br>2. Load data.<br>3. Check returned item count. | Returned page is capped at system maximum limit. | More than 100 items exist |
| LF-GETALL-008 | Filter by booking_id | 1. Apply booking filter with valid booking.<br>2. Refresh list.<br>3. Verify rows. | Only items linked to selected booking are shown. | Items with booking associations |
| LF-GETALL-009 | Filter by found_by_user_id | 1. Apply finder filter by user.<br>2. Refresh list.<br>3. Verify ownership. | Only items found by selected user are displayed. | Items found by multiple users |

### 6.3 Get My Lost & Found Items

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| LF-GETMY-001 | Get items I found | 1. Login as cleaner.<br>2. Open My Lost & Found screen.<br>3. Refresh data. | List includes only items created/found by current user. | Cleaner has recorded found items |
| LF-GETMY-002 | Get my items with no results | 1. Login as user with no found items.<br>2. Open My Lost & Found screen.<br>3. Review empty state. | Empty list state is shown correctly with no error. | User has no found items |

### 6.4 Get Lost & Found Item By ID

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| LF-GETID-001 | Get existing item by ID | 1. Open Lost & Found list.<br>2. Tap a valid item row.<br>3. View detail screen. | Full item detail is displayed with enriched labels and status history. | Item exists |
| LF-GETID-002 | Get non-existent item | 1. Open invalid item detail link/id.<br>2. Wait for load.<br>3. Observe output. | Not-found message/state is displayed; app remains stable. | No item with that ID |

### 6.5 Update Lost & Found Status

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| LF-STATUS-001 | Update FOUND to CLAIMED | 1. Login as Manager/Admin.<br>2. Open item in FOUND status.<br>3. Tap status action and set CLAIMED.<br>4. Confirm. | Status changes to CLAIMED and claim metadata (who/when) is recorded. | Item in FOUND status. Manager/Admin authenticated |
| LF-STATUS-002 | Update FOUND to DISPOSED | 1. Open FOUND item.<br>2. Set status to DISPOSED.<br>3. Confirm update. | Item moves to DISPOSED terminal state. | Item in FOUND status. Manager/Admin authenticated |
| LF-STATUS-003 | Update FOUND to RETURNED_TO_USER | 1. Open FOUND item.<br>2. Set status to RETURNED_TO_USER.<br>3. Save changes. | Item moves to RETURNED_TO_USER and claim metadata is set. | Item in FOUND status |
| LF-STATUS-004 | Update CLAIMED to RETURNED_TO_USER | 1. Open CLAIMED item.<br>2. Choose RETURNED_TO_USER.<br>3. Confirm. | Transition succeeds and item reaches terminal returned state. | Item in CLAIMED status |
| LF-STATUS-005 | Invalid transition: DISPOSED to CLAIMED | 1. Open DISPOSED item.<br>2. Attempt to set CLAIMED.<br>3. Observe result. | Transition is blocked because DISPOSED is terminal. | Item in DISPOSED status (terminal) |
| LF-STATUS-006 | Invalid transition: RETURNED_TO_USER to FOUND | 1. Open RETURNED_TO_USER item.<br>2. Attempt status rollback to FOUND.<br>3. Submit. | System rejects invalid rollback from terminal state. | Item in RETURNED_TO_USER status (terminal) |
| LF-STATUS-007 | Invalid transition: CLAIMED to FOUND | 1. Open CLAIMED item.<br>2. Attempt to set FOUND.<br>3. Save action. | System rejects unsupported status transition. | Item in CLAIMED status |
| LF-STATUS-008 | Cleaner updates own item status | 1. Login as cleaner who created the item.<br>2. Open item detail.<br>3. Update to allowed next status.<br>4. Confirm. | Status update succeeds for own item within allowed transition rules. | Item found by this cleaner |
| LF-STATUS-009 | Cleaner tries to update another's item | 1. Login as different cleaner.<br>2. Open item created by another cleaner.<br>3. Attempt status update. | Permission is denied for non-owner cleaner. | Item found by different cleaner |
| LF-STATUS-010 | Update non-existent item status | 1. Attempt status update on invalid item id.<br>2. Submit action.<br>3. Observe response. | System returns not-found behavior and no data changes occur. | No item with that ID |
| LF-STATUS-011 | Update with invalid status value | 1. Submit unsupported status value via tampered action.<br>2. Confirm result.<br>3. Reload item detail. | Invalid status is rejected and current item status remains unchanged. | Item exists |
| LF-STATUS-012 | claimed_by_user_id not overwritten on second transition | 1. Item is already CLAIMED by user A.<br>2. Another admin transitions item to RETURNED_TO_USER.<br>3. Inspect claim metadata. | Original claimer information remains intact and is not overwritten by later transition actor. | Item claimed_by_user_id already set |

---

## 7. WAREHOUSE MODULE

Note: This section is not cleaner-specific, so Test Case Procedure and Expected Results are intentionally kept in API style as requested.

### 7.1 Create Warehouse

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| WH-CREATE-001 | Create warehouse with valid data | POST `/api/warehouses` with `name: "Main Warehouse"`, `address: "123 Street"` | 201 Created. Warehouse returned with id, name, address, created_at | Admin/Manager authenticated |
| WH-CREATE-002 | Create warehouse without address | POST `/api/warehouses` with only `name` | 201 Created. Address is null | Admin/Manager authenticated |
| WH-CREATE-003 | Create warehouse without name | POST `/api/warehouses` without `name` | 400 Bad Request. Name required | Admin/Manager authenticated |
| WH-CREATE-004 | Create warehouse with duplicate name | POST `/api/warehouses` with name matching existing warehouse (case-insensitive) | 409 Conflict. Warehouse name already exists | Warehouse with same name exists |
| WH-CREATE-005 | Unauthenticated request | POST `/api/warehouses` without auth | 401 Unauthorized | No authentication |
| WH-CREATE-006 | Cleaner tries to create warehouse | POST `/api/warehouses` as cleaner | 403 Forbidden | Cleaner authenticated |

### 7.2 Get Warehouses

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| WH-GETALL-001 | Get all warehouses (public) | GET `/api/warehouses` | 200 OK. All warehouses returned sorted by created_at DESC | Warehouses exist |
| WH-GETALL-002 | Search warehouses by name | GET `/api/warehouses?name=main` | 200 OK. Warehouses matching "main" (regex, case-insensitive) | Warehouses with "main" in name |
| WH-GETID-001 | Get warehouse by ID | GET `/api/warehouses/<id>` | 200 OK. Warehouse returned | Warehouse exists |
| WH-GETID-002 | Get non-existent warehouse | GET `/api/warehouses/<non_existent_id>` | 404 Not Found | No warehouse with that ID |

### 7.3 Update Warehouse

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| WH-UPDATE-001 | Update warehouse name and address | PUT `/api/warehouses/<id>` with new `name` and `address` | 200 OK. Both fields updated | Admin/Manager authenticated. Warehouse exists |
| WH-UPDATE-002 | Update to duplicate name | PUT `/api/warehouses/<id>` with name used by another warehouse | 409 Conflict. Duplicate name | Another warehouse has that name |
| WH-UPDATE-003 | Update non-existent warehouse | PUT `/api/warehouses/<non_existent_id>` | 404 Not Found | Admin/Manager authenticated |

### 7.4 Delete Warehouse

| Test Case ID | Test Case Description | Test Case Procedure | Expected Results | Pre-conditions |
|---|---|---|---|---|
| WH-DELETE-001 | Delete warehouse with no dependencies | DELETE `/api/warehouses/<id>` as admin | 200 OK. Warehouse deleted | Admin authenticated. No LocationWarehouse or InventoryStock reference this warehouse |
| WH-DELETE-002 | Delete warehouse with location mappings | DELETE `/api/warehouses/<id>` as admin | 409 Conflict. Cannot delete: has location-warehouse mappings | LocationWarehouse records exist for this warehouse |
| WH-DELETE-003 | Delete warehouse with inventory stocks | DELETE `/api/warehouses/<id>` as admin | 409 Conflict. Cannot delete: has inventory stocks | InventoryStock records exist for this warehouse |
| WH-DELETE-004 | Non-admin tries to delete | DELETE `/api/warehouses/<id>` as manager | 403 Forbidden | Manager authenticated |
| WH-DELETE-005 | Delete non-existent warehouse | DELETE `/api/warehouses/<non_existent_id>` as admin | 404 Not Found | Admin authenticated |

---

## Notes For QA Team

- Cleaner mobile app screens referenced in this document:
  - Nhiệm vụ (Task list)
  - Task Detail (accept/start/complete, photos, incidents)
  - Thông báo (notifications/history)
  - Vật tư (supplies checkout + daily summary)
  - Lost & Found
- For any test requiring manager/admin actions, execute from backoffice/admin app while validating cleaner-side effects in mobile app.
