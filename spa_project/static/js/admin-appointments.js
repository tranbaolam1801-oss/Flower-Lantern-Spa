// ============================================================
// SECTION 1: SETTINGS & CONSTANTS
// ============================================================
console.log("ADMIN APPOINTMENTS JS LOADED v20260501-005");
const START_HOUR = 9;  // Giờ mở cửa (9:00 sáng)
const END_HOUR = 21;   // Giờ đóng cửa (21:00 tối)
const SLOT_MIN = 30; // 1 ô lịch = 30 phút
const DEFAULT_DURATION = 60; // Thời lượng mặc định cho pending block (phút)

// ===== API BASE URL- đường dẫn API để gọi BE =====
const API_BASE = '/api';

// Constant dùng chung cho tất cả lỗi tải lịch hẹn — UC 14.2 exception flow 5a
const MSG_LOAD_APPT_ERROR = 'Không thể tải lịch hẹn. Vui lòng thử lại sau.';

// ===== UC 14.3 — Messages chuẩn hóa =====
const MSG_APPROVE_SUCCESS  = 'Xác nhận yêu cầu thành công';
const MSG_REJECT_SUCCESS   = 'Từ chối yêu cầu thành công';
const MSG_REBOOK_SUCCESS   = 'Đặt lại lịch hẹn thành công';
const MSG_WEB_EMPTY        = 'Hiện chưa có yêu cầu đặt lịch nào.';
const MSG_WEB_GENERIC_ERR  = 'Không thể xử lý yêu cầu. Vui lòng thử lại sau.';
const MSG_WEB_CONFLICT     = 'Không thể xử lý do khung giờ hoặc giường không khả dụng.';
const MSG_APPROVE_CONFLICT = 'Không thể xác nhận do khung giờ hoặc giường không khả dụng.';

// ===== HELPER: format variant label — tránh lặp "90 phút — 90 phút" =====
function variantLabel(v) {
  const dur = `${v.duration_minutes} phút`;
  if (!v.label || v.label.trim() === dur) return dur;
  return `${v.label} — ${dur}`;
}

// ============================================================
// SECTION 2: STATE VARIABLES
// ============================================================
// PENDING BLOCKS STATE — Flow 2 bước tạo lịch hẹn
let pendingBlocks = [];
let _pendingIdCounter = 0;

// Dữ liệu ( lấy từ API) ==> lưu dữ liệu load từ DB để render giao diện, validate form, tính toán trùng lịch
let ROOMS = []; // danh sách phòng
let SERVICES = []; //dánh sách dịch vụ
let APPOINTMENTS = []; // danh sách lịch hẹn

// Biến theo dõi trạng thái đang submit để tránh submit lặp
let isSubmitting = false;

// State: đang ở chế độ "quay về grid để chọn thêm slot"
let _addingSlotMode = false;
let _savedBookerInfo = null;  // lưu tạm booker info khi quay về grid

// UC 14.3 — track rebook mode để hiển thị đúng message sau khi tạo lịch
let _isRebookMode = false;

// CREATE MODE — ACCORDION GUEST CARDS
let _guestCount = 0;
// Current time line interval
let _ctlInterval = null;

// ============================================================
// SECTION 3: API HELPERS
// ============================================================
// ===== CSRF HELPER ======
function getCSRFToken() {
  const cookieValue = document.cookie.split('; ').find(row => row.startsWith('csrftoken='));
  return cookieValue ? cookieValue.split('=')[1] : '';
}

async function apiGet(url) {
  try {
    const response = await fetch(url);
    const text = await response.text();
    if (!text) {
      if (!response.ok) return { success: false, ok: false, status: response.status, error: `HTTP error ${response.status}` };
      return { success: true, ok: true, status: response.status };
    }
    try {
      const data = JSON.parse(text);
      if (!response.ok && !data.error) data.error = `HTTP error ${response.status}`;
      data.ok = response.ok;
      data.status = response.status;
      return data;
    } catch (e) {
      return {
        success: false,
        ok: response.ok,
        status: response.status,
        error: !response.ok ? `HTTP error ${response.status}: Máy chủ trả về phản hồi không hợp lệ` : 'Invalid JSON response'
      };
    }
  } catch (error) {
    console.error('API GET error:', error);
    return { success: false, error: error.message };
  }
}

async function apiPost(url, payload) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    if (!text) {
      if (!response.ok) return { success: false, ok: false, status: response.status, error: `HTTP error ${response.status}` };
      return { success: true, ok: true, status: response.status };
    }
    try {
      const data = JSON.parse(text);
      if (!response.ok && !data.error) data.error = `HTTP error ${response.status}`;
      data.ok = response.ok;
      data.status = response.status;
      return data;
    } catch (e) {
      return {
        success: false,
        ok: response.ok,
        status: response.status,
        error: !response.ok ? `HTTP error ${response.status}: Máy chủ trả về phản hồi không hợp lệ` : 'Invalid JSON response'
      };
    }
  } catch (error) {
    console.error('API POST error:', error);
    return { success: false, error: error.message };
  }
}

// ===== LOAD DATA FROM API =====
async function loadRooms() {
  const result = await apiGet(`${API_BASE}/rooms/`);
  if (result.success && result.rooms) {
    ROOMS = result.rooms;
  } else {
    // Fallback data - CẬN NHẬP: Phải khớp với database!
    ROOMS = [
      { id: "P01", name: "1", capacity: 1 },
      { id: "P02", name: "2", capacity: 2 },
      { id: "P03", name: "3", capacity: 3 },
      { id: "P04", name: "4", capacity: 4 },
      { id: "P05", name: "5", capacity: 5 },
    ];
  }
}

async function loadServices() {
  const result = await apiGet(`${API_BASE}/services/`);
  if (result.services) {
    SERVICES = result.services;
  }
}

// _gridLoadError: true khi lần load gần nhất bị lỗi — dùng để renderGrid hiển thị error state
let _gridLoadError = false;

async function loadAppointments(date = '') {
  let url = `${API_BASE}/appointments/`;
  const params = [];
  if (date) params.push(`date=${date}`);

  const statusFilter  = (document.getElementById('statusFilter')  || {}).value || '';
  const serviceFilter = (document.getElementById('serviceFilter') || {}).value || '';
  const sourceFilter  = (document.getElementById('sourceFilter')  || {}).value || '';
  if (statusFilter)  params.push(`status=${encodeURIComponent(statusFilter)}`);
  if (serviceFilter) params.push(`service=${encodeURIComponent(serviceFilter)}`);
  if (sourceFilter)  params.push(`source=${encodeURIComponent(sourceFilter)}`);

  const searchInput = document.getElementById("searchInput");
  const searchTerm = (searchInput ? searchInput.value.trim() : '');
  if (searchTerm) params.push(`q=${encodeURIComponent(searchTerm)}`);

  if (params.length) url += '?' + params.join('&');

  const result = await apiGet(url);
  if (result.success && result.appointments) {
    APPOINTMENTS = result.appointments;
    _gridLoadError = false;
  } else {
    // API trả error hoặc network lỗi — UC 14.2 exception flow 5a
    APPOINTMENTS = [];
    _gridLoadError = true;
    showToast('error', 'Lỗi', result.error || MSG_LOAD_APPT_ERROR);
  }
}

async function loadBookingRequests(statusFilter = '', dateFilter = '', searchTerm = '', serviceFilter = '') {
  let url = `${API_BASE}/booking-requests/`;
  const queryParams = [];
  if (statusFilter)  queryParams.push(`status=${encodeURIComponent(statusFilter)}`);
  if (dateFilter)    queryParams.push(`date=${encodeURIComponent(dateFilter)}`);
  if (searchTerm)    queryParams.push(`q=${encodeURIComponent(searchTerm)}`);
  if (serviceFilter) queryParams.push(`service=${encodeURIComponent(serviceFilter)}`);
  if (queryParams.length > 0) url += '?' + queryParams.join('&');

  const result = await apiGet(url);
  if (result && result.success) {
    return result.appointments || [];
  }
  // UC 14.3 — lỗi tải không được im lặng
  showToast('error', 'Lỗi', MSG_WEB_GENERIC_ERR);
  return [];
}

// ============================================================
// SECTION 4: VALIDATION HELPERS
// ============================================================
function isValidPhone(v){ return /^0\d{9}$/.test(v.replace(/\D/g,"")); }
function isValidEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

/**
 * Hiển thị lỗi trong #modalError.
 * Thay thế pattern lặp: modalError.textContent = msg; modalError.classList.remove("d-none");
 */
function _showModalError(msg) {
  const el = document.getElementById('modalError');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('d-none');
}

/**
 * Tính discount_amount từ subtotal + type + value.
 * Kết quả được clamp về [0, subtotal].
 * @param {number} subtotal
 * @param {string} dtype  - 'NONE' | 'AMOUNT' | 'PERCENT'
 * @param {number} value
 * @returns {number}
 */
function _calcDiscountAmount(subtotal, dtype, value) {
  let amount = 0;
  if (dtype === 'PERCENT') {
    amount = Math.round(subtotal * value / 100);
  } else if (dtype === 'AMOUNT') {
    amount = Math.min(value, subtotal);
  }
  return Math.max(0, Math.min(amount, subtotal));
}

/**
 * Tính payment status từ final_amount và total_paid.
 * @param {number} finalAmount
 * @param {number} totalPaid
 * @returns {'UNPAID'|'PARTIAL'|'PAID'}
 */
function _calcPayStatus(finalAmount, totalPaid, hasAnyService = false) {
  if (finalAmount === 0 && hasAnyService) return 'PAID';  // discount 100% + có dịch vụ
  if (totalPaid <= 0) return 'UNPAID';
  if (totalPaid >= finalAmount && finalAmount > 0) return 'PAID';
  return 'PARTIAL';
}

/**
 * Validate điều kiện COMPLETED phải đi kèm PAID.
 * @param {string} apptStatus
 * @param {string} payStatus
 * @returns {{ ok: boolean, error: string }}
 */
function _validateCompletedStatus(apptStatus, payStatus) {
  if (apptStatus === 'COMPLETED' && payStatus !== 'PAID') {
    return { ok: false, error: 'Không thể hoàn thành lịch khi chưa thanh toán đủ' };
  }
  return { ok: true, error: '' };
}

/**
 * Validate thông tin người đặt lịch (booker).
 * Dùng chung cho cả CREATE và EDIT branch trong submit handler.
 *
 * @param {string} name   - họ tên người đặt
 * @param {string} phone  - số điện thoại (raw, chưa strip)
 * @param {string} email  - email (có thể rỗng)
 * @returns {{ ok: boolean, error: string }}
 */
function _validateBookerFields(name, phone, email) {
  if (!name) return { ok: false, error: 'Vui lòng nhập họ tên người đặt' };
  if (!phone) return { ok: false, error: 'Số điện thoại không hợp lệ' };
  if (!isValidPhone(phone)) return { ok: false, error: 'Số điện thoại không hợp lệ' };
  if (email && !isValidEmail(email)) return { ok: false, error: 'Email không hợp lệ' };
  return { ok: true, error: '' };
}

/**
 * Validate ghi chú lịch hẹn (max 1000 ký tự).
 * Giữ nguyên message động có số ký tự hiện tại.
 * @param {string} note
 * @returns {{ ok: boolean, error: string }}
 */
function _validateBookerNote(note) {
  if (note && note.length > 1000) {
    return { ok: false, error: `Ghi chú lịch hẹn quá dài (tối đa 1000 ký tự, hiện tại ${note.length})` };
  }
  return { ok: true, error: '' };
}

/**
 * Validate date / time / room của 1 guest card — logic giống nhau giữa CREATE và EDIT.
 * KHÔNG bao gồm: validate quá khứ, fallback apptId.dataset (khác nhau giữa 2 branch).
 *
 * @param {Object} g      - guest data từ _collectGuestCards()
 * @param {number} index  - 0-based index
 * @param {number} total  - tổng số cards
 * @returns {{ ok: boolean, error: string, type: 'date'|'time'|'room'|null }}
 *   type dùng để caller quyết định có gọi _markRowError không.
 */
function _validateGuestDateTimeRoom(g, index, total) {
  const label = total > 1 ? `Khách ${index + 1}: ` : '';
  if (!g.date)   return { ok: false, error: `${label}Vui lòng chọn ngày hẹn`, type: 'date' };
  if (!g.time)   return { ok: false, error: `${label}Vui lòng chọn giờ hẹn`,  type: 'time' };
  if (!g.roomId) return { ok: false, error: `${label}Vui lòng chọn giường`,   type: 'room' };
  return { ok: true, error: '', type: null };
}

/**
 * Validate các trường cơ bản của 1 guest card — giống nhau 100% giữa CREATE và EDIT.
 * Bao gồm: tên, phone, email, service+variant.
 * KHÔNG bao gồm: date, time, room, validate quá khứ (khác nhau giữa 2 branch).
 *
 * @param {Object} g      - guest data từ _collectGuestCards()
 * @param {number} index  - 0-based index
 * @param {number} total  - tổng số cards
 * @returns {{ ok: boolean, error: string }}
 */
function _validateGuestBasic(g, index, total) {
  const label = total > 1 ? `Khách ${index + 1}: ` : '';
  if (!g.name || !g.name.trim())          return { ok: false, error: `${label}Vui lòng nhập tên khách` };
  if (g.phone && !isValidPhone(g.phone))  return { ok: false, error: `${label}Số điện thoại khách không hợp lệ` };
  if (g.email && !isValidEmail(g.email))  return { ok: false, error: `${label}Email không hợp lệ` };
  if (g.serviceId && !g.variantId)        return { ok: false, error: `${label}Vui lòng chọn gói dịch vụ` };
  return { ok: true, error: '' };
}

/**
 * Validate thời điểm ARRIVED / COMPLETED cho từng card trong mảng.
 * Dùng chung cho EDIT và CREATE branch.
 *
 * @param {Array}    cards     - mảng guest card data từ _collectGuestCards()
 * @param {Function} getStatus - (g, i) => string — trả về apptStatus của card
 * @param {Function} getDate   - (g, i) => string — trả về date (YYYY-MM-DD)
 * @param {Function} getTime   - (g, i) => string — trả về time (HH:MM)
 * @param {Function} getDur    - (g, i) => number — trả về duration (phút)
 * @returns {{ ok: boolean, error: string }}
 */
function _validateAllCardsTiming(cards, getStatus, getDate, getTime, getDur) {
  for (let i = 0; i < cards.length; i++) {
    const g      = cards[i];
    const label  = cards.length > 1 ? `Khách ${i + 1}: ` : '';
    const status = getStatus(g, i);
    if (status !== 'ARRIVED' && status !== 'COMPLETED') continue;
    const timing = _validateStatusTiming(getDate(g, i), getTime(g, i), getDur(g, i), status);
    if (!timing.ok) return { ok: false, error: `${label}${timing.error}` };
  }
  return { ok: true, error: '' };
}

// ============================================================
// SECTION 5: TIME/DATE HELPERS
// ============================================================
function pad2(n){ return String(n).padStart(2,"0"); }

function minutesFromStart(t){ const [h,m]=t.split(":").map(Number); return (h-START_HOUR)*60 + m; }

function addMinutesToTime(t, add){
  const [h,m]=t.split(":").map(Number);
  const total = h*60+m+add;
  return `${pad2(Math.floor(total/60))}:${pad2(total%60)}`;
}

function overlaps(aStart,aEnd,bStart,bEnd){ return aStart < bEnd && bStart < aEnd; }

// Tổng số phút của toàn bộ timeline (9:00 → 21:00 = 720 phút)
function totalTimelineMinutes(){ return (END_HOUR - START_HOUR) * 60; }

// Chuyển số phút từ START_HOUR sang % chiều ngang của vùng slots
function minutesToPercent(minutes){ return (minutes / totalTimelineMinutes()) * 100; }

// ============================================================
// SECTION 6: UI HELPERS
// ============================================================
function showToast(type, title, message){
  const toastEl = document.getElementById("toast");
  if (!toastEl) return;
  const header = toastEl.querySelector(".toast-header");
  const icon = header ? header.querySelector("i") : null;
  const toastTitle = document.getElementById("toastTitle");
  const toastBody = document.getElementById("toastBody");

  if (header) {
    header.className = "toast-header";
    if(type==="success"){ header.classList.add("bg-success","text-white"); if(icon) icon.className="fas fa-check-circle me-2"; }
    else if(type==="warning"){ header.classList.add("bg-warning","text-dark"); if(icon) icon.className="fas fa-exclamation-triangle me-2"; }
    else if(type==="error"){ header.classList.add("bg-danger","text-white"); if(icon) icon.className="fas fa-times-circle me-2"; }
    else { header.classList.add("bg-info","text-white"); if(icon) icon.className="fas fa-info-circle me-2"; }
  }
  if (toastTitle) toastTitle.textContent = title;
  if (toastBody) toastBody.textContent = message;

  // Lấy instance Bootstrap Toast từ element, không dùng window.toast
  // (window.toast có thể bị ghi đè bởi extension hoặc code khác)
  const toast = bootstrap.Toast.getInstance(toastEl) || new bootstrap.Toast(toastEl);
  toast.show();
}

function statusClass(s){
  const sl = (s||'').toLowerCase();
  if(sl==="not_arrived") return "status-not_arrived";
  if(sl==="arrived") return "status-arrived";
  if(sl==="completed") return "status-completed";
  if(sl==="cancelled") return "status-cancelled";
  if(sl==="rejected") return "status-rejected";
  if(sl==="confirmed") return "status-not_arrived";
  return "status-pending";
}

function statusLabel(s){
  const sl = (s||'').toLowerCase();
  if(sl==="pending") return "Chờ xác nhận";
  if(sl==="confirmed") return "Đã xác nhận";
  if(sl==="not_arrived") return "Chưa đến";
  if(sl==="arrived") return "Đã đến";
  if(sl==="completed") return "Hoàn thành";
  if(sl==="cancelled") return "Đã hủy";
  if(sl==="rejected") return "Đã từ chối";
  return s;
}

// ===== BOOKING BADGES UPDATE =====
function updateBookingBadges(rows) {
  // Đếm Booking PENDING theo bookingCode (mỗi booking chỉ đếm 1 lần)
  const pendingBookings = new Set(
    rows
      .filter(r => (r.bookingStatus || '').toUpperCase() === 'PENDING')
      .map(r => r.bookingCode)
  );
  _setWebCountBadge(pendingBookings.size);
}

/**
 * Bật loading state cho button
 * @param {HTMLElement} btn - Button cần set loading
 * @param {string} loadingText - Text hiển thị khi loading
 * @param {string} originalText - Text gốc để restore sau này
 */
function setButtonLoading(btn, loadingText = 'Đang xử lý...', originalText = null) {
  if (!btn) return;

  // Lưu text gốc nếu chưa có
  if (!btn.dataset.originalText) {
    btn.dataset.originalText = originalText || btn.innerHTML;
  }

  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin me-2"></i>${loadingText}`;
}

/**
 * Tắt loading state và restore button về trạng thái ban đầu
 * @param {HTMLElement} btn - Button cần restore
 */
function resetButton(btn) {
  if (!btn) return;

  btn.disabled = false;
  if (btn.dataset.originalText) {
    btn.innerHTML = btn.dataset.originalText;
    delete btn.dataset.originalText;
  }
}

/**
 * Hiển thị modal xác nhận đồng bộ giao diện hệ thống
 * @param {string} title - Tiêu đề
 * @param {string} message - Nội dung xác nhận
 * @param {string} confirmText - Text nút xác nhận
 * @param {string} cancelText - Text nút hủy
 * @returns {Promise<boolean>} - true nếu người dùng xác nhận
 */
async function confirmAction(title, message, confirmText = 'Xác nhận', cancelText = 'Hủy') {
  if (window.showConfirm) {
    return window.showConfirm(message, { title, confirmText, cancelText });
  }
  return false;
}

function resetModalError(){
  const modalError = document.getElementById("modalError");
  modalError.classList.add("d-none");
  modalError.textContent = "";
}

// ===== SHARED HELPERS (TIER-1 REFACTOR) =====

/**
 * Đóng và cleanup TẤT CẢ modal Bootstrap đang mở.
 * Dùng chung cho approveWeb và openRebookAsCreate.
 */
function _forceCloseAllModals() {
  document.querySelectorAll('.modal.show').forEach(el => {
    const inst = bootstrap.Modal.getInstance(el);
    if (inst) inst.hide();
  });
  document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');
  document.body.removeAttribute('data-bs-overflow');
}

/**
 * Kiểm tra result API có phải lỗi conflict không.
 * Dùng chung cho edit-batch, online-confirm, create-batch.
 * @param {Object} result - API response object
 * @param {boolean} [checkFlag=false] - có kiểm tra result.conflict flag không
 * @returns {boolean}
 */
function _isConflictError(result, checkFlag = false) {
  const errLower = (result.error || '').toLowerCase();
  return (checkFlag && result.conflict === true) ||
    errLower.includes('trùng') ||
    errLower.includes('đầy') ||
    errLower.includes('đủ chỗ') ||
    errLower.includes('khả dụng') ||
    errLower.includes('capacity') ||
    errLower.includes('conflict');
}

/**
 * Lấy Bootstrap Modal instance hoặc tạo mới nếu chưa có.
 * @param {HTMLElement} el
 * @returns {bootstrap.Modal|null}
 */
function _getOrCreateModal(el) {
  if (!el) return null;
  return bootstrap.Modal.getInstance(el) || new bootstrap.Modal(el);
}

/**
 * Clone node để xóa tất cả event listener cũ, gắn lại vào DOM.
 * Trả về node mới đã được gắn vào DOM.
 * @param {HTMLElement} el
 * @returns {HTMLElement}
 */
function _replaceWithClone(el) {
  const clone = el.cloneNode(true);
  el.parentNode.replaceChild(clone, el);
  return clone;
}

/**
 * Điền thông tin người đặt lịch vào booker panel.
 * Dùng chung cho openCreateModal (rebook/online/pending) và openEditModalWithData.
 *
 * @param {Object} rb            - object chứa name, phone, email, source, note
 * @param {string} defaultSource - fallback khi rb.source rỗng (mặc định 'DIRECT')
 */
function _fillBookerFields(rb, defaultSource = 'DIRECT') {
  document.getElementById('bookerName').value   = rb.name   || '';
  document.getElementById('bookerPhone').value  = rb.phone  || '';
  document.getElementById('bookerEmail').value  = rb.email  || '';
  document.getElementById('bookerSource').value = rb.source || defaultSource;
  const bookerNoteEl = document.getElementById('bookerNote');
  if (bookerNoteEl) bookerNoteEl.value = rb.note || '';
}

/**
 * Cập nhật badge #webCount với số lượng pending.
 * @param {number} count
 */
function _setWebCountBadge(count) {
  const webCount = document.getElementById('webCount');
  if (!webCount) return;
  if (count === 0) {
    webCount.textContent = '';
    webCount.classList.add('d-none');
  } else {
    webCount.textContent = String(count);
    webCount.classList.remove('d-none');
  }
}

/**
 * Điền options vào một <select> từ mảng items.
 * Xóa toàn bộ options cũ (trừ placeholder nếu có) rồi append mới.
 *
 * @param {HTMLSelectElement} selectEl   - phần tử <select> cần điền
 * @param {Array}             items      - mảng dữ liệu
 * @param {string|Function}   valueKey   - tên field lấy value, hoặc hàm (item) => value
 * @param {string|Function}   labelFn    - tên field lấy label, hoặc hàm (item) => label
 * @param {string}            [placeholder] - text option đầu tiên (value=""), bỏ qua nếu null
 */
function _populateSelect(selectEl, items, valueKey, labelFn, placeholder = null) {
  if (!selectEl) return;
  selectEl.innerHTML = placeholder !== null
    ? `<option value="">${placeholder}</option>`
    : '';
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value       = typeof valueKey === 'function' ? valueKey(item) : item[valueKey];
    opt.textContent = typeof labelFn  === 'function' ? labelFn(item)  : item[labelFn];
    selectEl.appendChild(opt);
  });
}

/**
 * Refresh cả grid lịch và tab yêu cầu đặt lịch.
 * Dùng ở những nơi luôn cần cả 2 sau khi thay đổi dữ liệu.
 */
async function _refreshAll() {
  await refreshData();
  await renderWebRequests();
}

// ===== LOADING SKELETON CHO GRID =====
function showGridLoading(){
  const grid = document.getElementById("grid");
  if (!grid) return;
  // Hiện 5 dòng skeleton để layout không bị trống trong lúc fetch
  const rowH = getComputedStyle(document.documentElement).getPropertyValue('--rowH') || '72px';
  grid.innerHTML = Array.from({length: 5}, (_, i) => `
    <div class="lane-row" style="opacity:.45;">
      <div class="roomcell"><span class="dot"></span>—</div>
      <div class="slots" style="background: repeating-linear-gradient(90deg,#f3f4f6 0,#f3f4f6 40%,#e9eaec 40%,#e9eaec 100%) 0 0 / 120px 100%;"></div>
    </div>`).join('');
}

// ============================================================
// SECTION 7: PENDING BLOCKS STATE
// ============================================================
function _nextPendingId() {
  return ++_pendingIdCounter;
}

/**
 * Kiểm tra slot có nằm trong quá khứ không.
 * day: 'YYYY-MM-DD', time: 'HH:MM'
 */
function _isSlotInPast(day, time) {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  if (day > todayStr) return false;
  if (day < todayStr) return true;
  // Cùng ngày hôm nay — so sánh giờ
  const [h, m] = time.split(':').map(Number);
  const slotMinutes = h * 60 + m;
  const nowMinutes  = now.getHours() * 60 + now.getMinutes();
  return slotMinutes <= nowMinutes;
}

/**
 * Toggle slot: click ô trống → chọn, click lại block xanh → bỏ chọn.
 * Đây là hàm duy nhất xử lý add/remove pending block.
 */
function handleToggleSlot({ roomId, laneIndex, day, time, slotsEl }) {
  const duration = DEFAULT_DURATION;
  const endTime  = addMinutesToTime(time, duration);
  const startMin = minutesFromStart(time);
  const endMin   = minutesFromStart(endTime);

  // Kiểm tra ngoài giờ
  if (startMin < 0 || endMin > totalTimelineMinutes()) {
    showToast("warning", "Ngoài giờ hoạt động", `Spa hoạt động từ ${START_HOUR}:00 đến ${END_HOUR}:00`);
    return;
  }

  // Chặn slot trong quá khứ
  if (_isSlotInPast(day, time)) {
    showToast("warning", "Không thể chọn slot này", "Không thể tạo lịch hẹn trong quá khứ");
    return;
  }

  // Tìm pending block trùng slot này (cùng room + lane + day + time)
  const existing = pendingBlocks.find(pb =>
    pb.roomId === roomId &&
    pb.laneIndex === laneIndex &&
    pb.day === day &&
    pb.time === time
  );

  if (existing) {
    // ── TOGGLE OFF: bỏ chọn ──
    pendingBlocks = pendingBlocks.filter(pb => pb.id !== existing.id);
    document.querySelectorAll(`.appt-pending[data-pending-id="${existing.id}"]`).forEach(el => el.remove());
    _syncActionBar();
    return;
  }

  // ── TOGGLE ON: kiểm tra conflict rồi thêm ──

  // Conflict với appointment đã có
  const dayAppts = APPOINTMENTS.filter(a =>
    a.roomCode === roomId && a.date === day && !["CANCELLED", "REJECTED"].includes((a.apptStatus || "").toUpperCase())
  );
  const { placements } = allocateRoomLanes(roomId, day, dayAppts);
  const laneAppts = placements.filter(p => p.laneIndex === laneIndex).map(p => p.appt);
  const conflictAppt = laneAppts.find(a =>
    overlaps(startMin, endMin, minutesFromStart(a.start), minutesFromStart(a.end))
  );
  if (conflictAppt) {
    showToast("warning", "Slot đã có lịch", "Khung giờ đã có lịch, vui lòng chọn thời gian khác");
    if (slotsEl) {
      slotsEl.classList.add("conflict-flash");
      setTimeout(() => slotsEl.classList.remove("conflict-flash"), 450);
    }
    return;
  }

  // Conflict với pending block khác trong cùng lane
  const conflictPending = pendingBlocks.find(pb =>
    pb.roomId === roomId && pb.laneIndex === laneIndex && pb.day === day &&
    overlaps(startMin, endMin, minutesFromStart(pb.time), minutesFromStart(pb.endTime))
  );
  if (conflictPending) {
    showToast("warning", "Trùng với slot đang chọn", `Lane này đã có slot đang chọn lúc ${conflictPending.time}–${conflictPending.endTime}`);
    return;
  }

  const block = { id: _nextPendingId(), roomId, laneIndex, day, time, endTime, duration };
  pendingBlocks.push(block);
  _syncActionBar();
  if (slotsEl) _mountPendingBlock(block, slotsEl);
}

function clearPendingBlocks() {
  pendingBlocks = [];
  document.querySelectorAll(".appt-pending").forEach(el => el.remove());
  _syncActionBar();
}

function _syncActionBar() {
  const bar   = document.getElementById("pendingActionBar");
  const badge = document.getElementById("pbCountBadge");
  const label = document.getElementById("pbCountLabel");
  const btnContinue = document.getElementById("btnContinuePending");
  if (!bar) return;

  const count = pendingBlocks.length;
  if (badge) badge.textContent = String(count);
  if (label) label.textContent = count === 1 ? "1 khách đã chọn" : `${count} khách đã chọn`;

  // Khi đang ở chế độ thêm slot, đổi label nút Tiếp tục
  if (btnContinue) {
    if (_addingSlotMode) {
      btnContinue.innerHTML = '<i class="fas fa-arrow-right me-1"></i>Quay lại & thêm khách';
    } else {
      btnContinue.innerHTML = '<i class="fas fa-arrow-right me-1"></i>Tiếp tục';
    }
  }

  if (count > 0) {
    bar.style.display = "block";
    requestAnimationFrame(() => bar.classList.add("visible"));
  } else {
    bar.classList.remove("visible");
    setTimeout(() => { if (!pendingBlocks.length) bar.style.display = "none"; }, 180);
  }
}

function _mountPendingBlock(pb, slotsEl) {
  if (!slotsEl) return null;

  // Xóa block cũ nếu đã tồn tại
  slotsEl.querySelector(`.appt-pending[data-pending-id="${pb.id}"]`)?.remove();

  const block = document.createElement("div");
  block.className = "appt appt-pending";
  block.dataset.pendingId = String(pb.id);

  // Chỉ có top-bar xanh + hint giờ — không có nút X
  block.innerHTML = `
    <div class="pb-selection-bar"></div>
    <div class="pb-time-hint">${pb.time} – ${pb.endTime}</div>
  `;

  block.style.cssText = "position:absolute;top:0;height:var(--rowH);z-index:30;cursor:pointer;";

  const leftMin = minutesFromStart(pb.time);
  const durMin  = Math.max(SLOT_MIN, minutesFromStart(pb.endTime) - leftMin);
  block.style.left  = `calc(${minutesToPercent(leftMin)}% + 1px)`;
  block.style.width = `calc(${minutesToPercent(durMin)}% - 2px)`;

  // Click vào block xanh → toggle off (bỏ chọn)
  block.addEventListener("click", (e) => {
    e.stopPropagation();
    const sEl = block.closest(".slots");
    handleToggleSlot({
      roomId:     pb.roomId,
      laneIndex:  pb.laneIndex,
      day:        pb.day,
      time:       pb.time,
      slotsEl:    sEl,
    });
  });

  slotsEl.appendChild(block);
  return block;
}

function renderPendingBlocks(slotsEl, roomId, laneIndex, day) {
  if (!slotsEl) return;
  slotsEl.querySelectorAll(".appt-pending").forEach(el => el.remove());
  pendingBlocks
    .filter(pb => pb.roomId === roomId && pb.laneIndex === laneIndex && pb.day === day)
    .forEach(pb => _mountPendingBlock(pb, slotsEl));
}

// ============================================================
// SECTION 8: TAB 1 - LỊCH THEO PHÒNG (GRID)
// ============================================================
function renderHeader(){
  const timeHeader = document.getElementById("timeHeader");
  const totalSlots = ((END_HOUR-START_HOUR)*60)/SLOT_MIN;
  document.documentElement.style.setProperty("--totalSlots", totalSlots);
  let html = `<div class="leftcell">Giường</div><div class="slots">`;
  for(let i=0;i<totalSlots;i++){
    const mins = i*SLOT_MIN, hour = START_HOUR + Math.floor(mins/60), minute = mins%60;
    html += `<div class="slot ${minute===0?'major':''}">${minute===0?`${hour}:00`:''}</div>`;
  }
  html += `</div>`;
  timeHeader.innerHTML = html;
}

function allocateRoomLanes(roomId, day, appts){
  const cap = (ROOMS.find(r=>r.id===roomId)?.capacity) || 1;
  const laneIntervals = Array.from({length: cap}, ()=>[]);
  const sorted = [...appts].sort((a,b)=> minutesFromStart(a.start)-minutesFromStart(b.start));
  const placements = [];
  for(const a of sorted){
    const need = Math.max(1, Number(a.guests)||1);
    const s = minutesFromStart(a.start);
    // Tính end: ưu tiên a.end, fallback về durationMin
    const rawE = a.end ? minutesFromStart(a.end) : NaN;
    const e = (!isNaN(rawE) && rawE > s) ? rawE : s + Math.max(SLOT_MIN, Number(a.durationMin) || SLOT_MIN);
    // Đảm bảo end > start (tránh block width = 0)
    const eFixed = e > s ? e : s + SLOT_MIN;
    for(let g=0; g<need; g++){
      let foundLane = -1;
      for(let li=0; li<cap; li++){
        if(!laneIntervals[li].some(it => overlaps(s, eFixed, it.startMin, it.endMin))){ foundLane = li; break; }
      }
      if(foundLane === -1) foundLane = 0; // fallback: lane 0 nếu hết chỗ
      laneIntervals[foundLane].push({startMin:s, endMin:eFixed, apptId:a.id});
      placements.push({ appt: a, laneIndex: foundLane });
    }
  }
  return { cap, placements };
}

function renderGrid(){
  const grid = document.getElementById("grid");
  const dayPicker = document.getElementById("dayPicker");
  grid.innerHTML = "";
  const day = dayPicker.value;

  // UC 14.2 exception flow 5a — hiển thị error state thay vì grid rỗng im lặng
  if (_gridLoadError) {
    grid.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;padding:3rem 1rem;gap:.75rem;color:#b91c1c;">
        <i class="fas fa-exclamation-circle" style="font-size:1.25rem;flex-shrink:0;"></i>
        <span style="font-size:.9rem;font-weight:500;">${MSG_LOAD_APPT_ERROR}</span>
      </div>`;
    return;
  }

  ROOMS.forEach((r)=>{
    // Lọc lịch theo phòng — dùng roomCode (khớp với serializer)
    // Hiển thị tất cả trừ CANCELLED/REJECTED
    let appts = APPOINTMENTS.filter(a =>
      a.date === day &&
      a.roomCode === r.id &&
      !['CANCELLED', 'REJECTED'].includes((a.apptStatus || '').toUpperCase())
    );

    // Phân bổ Lane (dòng) cho từng khách
    const { cap, placements } = allocateRoomLanes(r.id, day, appts);
    for(let lane=0; lane<cap; lane++){
      const laneRow = document.createElement("div");
      laneRow.className = "lane-row";
      laneRow.dataset.roomId = r.id;
      laneRow.dataset.lane = lane;

      // tên phòng
      laneRow.innerHTML = `${lane===0?`<div class="roomcell"><span class="dot"></span>${r.name}</div>`:`<div class="roomcell muted"><span class="dot"></span>${r.name}</div>`}<div class="slots" data-room="${r.id}" data-lane="${lane}"></div>`;
      const slotsEl = laneRow.querySelector(".slots");

      // click vào ô trống → toggle slot (chọn hoặc bỏ chọn)
      slotsEl.addEventListener("click", (e) => {
        if (e.target.closest('.appt') || e.target.closest('.appt-pending')) return;

        const rect        = slotsEl.getBoundingClientRect();
        const ratio       = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const minutes     = Math.floor(ratio * totalTimelineMinutes() / SLOT_MIN) * SLOT_MIN;
        const clickedTime = `${pad2(START_HOUR + Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;

        handleToggleSlot({ roomId: r.id, laneIndex: lane, day: dayPicker.value, time: clickedTime, slotsEl });
      });

      // vẽ block lịch hẹn
      placements.filter(p => p.laneIndex === lane).forEach(p=>{
        const a = p.appt;
        const block = document.createElement("div");

        // BUG-07: ONLINE PENDING → hiển thị với class riêng, không cho click sửa
        const isOnlinePending = (a.source || '').toUpperCase() === 'ONLINE'
          && (a.bookingStatus || '').toUpperCase() === 'PENDING';

        block.className = isOnlinePending
          ? 'appt appt-online-pending'
          : `appt ${statusClass(a.apptStatus)}`;
        block.dataset.id = a.id;

        const leftMin = minutesFromStart(a.start);
        // Tính durMin: ưu tiên end - start, fallback về durationMin, tối thiểu SLOT_MIN
        const endMin  = a.end ? minutesFromStart(a.end) : NaN;
        const durMin  = (!isNaN(endMin) && endMin > leftMin)
          ? endMin - leftMin
          : Math.max(SLOT_MIN, Number(a.durationMin) || SLOT_MIN);
        const endLabel = a.end || addMinutesToTime(a.start, durMin);
        // Dùng % thay vì px → tự co giãn theo chiều rộng thực tế của vùng slots
        const leftPct  = minutesToPercent(leftMin);
        const widthPct = minutesToPercent(durMin);
        block.style.left  = `calc(${leftPct}% + 2px)`;
        block.style.width = `calc(${widthPct}% - 4px)`;

        const paidIcon = (a.payStatus || '').toUpperCase() === 'PAID'
          ? `<span class="appt-paid-icon" title="Đã thanh toán"><i class="fas fa-receipt"></i></span>`
          : '';
        const svcText   = a.serviceCode || a.service || '';
        const custText  = a.customerName || '';

        if (isOnlinePending) {
          // ONLINE PENDING: hiển thị icon web + tên khách, tooltip hướng dẫn
          const titleText = custText || svcText || 'Đặt online';
          block.title = `Yêu cầu online đang chờ xác nhận — ${a.start}–${endLabel}\nVào tab "Yêu cầu đặt lịch" để xử lý`;
          block.innerHTML = `<div class="appt-content"><div class="t1"><i class="fas fa-globe" style="font-size:.65rem;opacity:.8;margin-right:3px;"></i>${titleText}</div><div class="t2">${a.start}–${endLabel}</div></div>`;
          // Click → chuyển sang tab Yêu cầu đặt lịch thay vì mở edit modal
          block.addEventListener("click", (ev) => {
            ev.stopPropagation();
            const tabWeb = document.getElementById('tab-web');
            if (tabWeb) tabWeb.click();
          });
        } else {
          const titleText = svcText && custText ? `${svcText} · ${custText}` : (svcText || custText || 'Chưa chọn DV');
          block.innerHTML = `<div class="appt-content"><div class="t1">${titleText}</div><div class="t2">${a.start}–${endLabel}</div></div>${paidIcon}`;
          // click vào lịch ==> sửa
          block.addEventListener("click", (ev)=>{ ev.stopPropagation(); openEditModal(a.id); });
        }

        slotsEl.appendChild(block);
      });

      // Vẽ pending blocks đúng theo lane
      renderPendingBlocks(slotsEl, r.id, lane, day);

      grid.appendChild(laneRow);
    }
  });

  // Vẽ đường dọc thời điểm hiện tại — element được tạo 1 lần, cập nhật bởi updateCurrentTimeLine()
  updateCurrentTimeLine();
}

// ── Current time line — realtime, không phụ thuộc reload ──────────────────

/**
 * Tạo hoặc cập nhật vị trí đường đỏ thời gian hiện tại.
 * Gọi khi: renderGrid, đổi ngày, resize, setInterval.
 */
function updateCurrentTimeLine() {
  const grid = document.getElementById("grid");
  const dayPicker = document.getElementById("dayPicker");
  if (!grid) return;

  // Lấy hoặc tạo element (chỉ tạo 1 lần duy nhất)
  let line = grid.querySelector('.current-time-line');

  const viewDay  = dayPicker ? dayPicker.value : '';
  const now      = new Date();
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;

  // Chỉ hiện khi đang xem đúng ngày hôm nay
  if (viewDay !== todayStr) {
    if (line) line.style.display = 'none';
    return;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes() - START_HOUR * 60;
  const pct        = (nowMinutes / totalTimelineMinutes()) * 100;

  // Ngoài khung giờ → ẩn
  if (pct <= 0 || pct >= 100) {
    if (line) line.style.display = 'none';
    return;
  }

  const label = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

  if (!line) {
    line = document.createElement('div');
    line.className = 'current-time-line';
    line.style.cssText = 'position:absolute;top:0;bottom:0;width:2px;background:#ef4444;z-index:20;pointer-events:none;';
    line.innerHTML = '<span class="ctl-label" style="position:absolute;top:4px;left:50%;transform:translateX(-50%);background:#ef4444;color:#fff;font-size:.6rem;font-weight:700;padding:1px 5px;border-radius:4px;white-space:nowrap;line-height:1.5;"></span>';
    grid.appendChild(line);
  }

  // Cập nhật vị trí và label
  line.style.display = '';
  line.style.left    = `calc(var(--leftCol) + ${pct} * (100% - var(--leftCol)) / 100)`;
  const labelEl = line.querySelector('.ctl-label');
  if (labelEl) labelEl.textContent = label;
}

// Khởi động interval realtime — cập nhật mỗi 30 giây
function startCurrentTimeLineInterval() {
  if (_ctlInterval) clearInterval(_ctlInterval);
  _ctlInterval = setInterval(updateCurrentTimeLine, 30_000);
}

// ============================================================
// SECTION 9: TAB 2 - YÊU CẦU ĐẶT LỊCH (WEB REQUESTS)
// ============================================================
// vẽ bảng yêu cầu đặt lịch online
async function renderWebRequests(){
  const statusFilter  = (document.getElementById("webStatusFilter")  || {}).value || '';
  const dateFilter    = (document.getElementById("webDateFilter")     || {}).value || '';
  const searchTerm    = ((document.getElementById("webSearchInput")   || {}).value || '').trim();
  const serviceFilter = (document.getElementById("webServiceFilter")  || {}).value || '';

  // Tab "Yêu cầu đặt lịch" - truyền statusFilter để dropdown trạng thái hoạt động
  let rows = await loadBookingRequests(statusFilter, dateFilter, searchTerm, serviceFilter);

  updateBookingBadges(rows);
  window._webAppts = rows;

  const webTbody = document.getElementById("webTbody");
  if(rows.length === 0){
    webTbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">${MSG_WEB_EMPTY}</td></tr>`;
    return;
  }
  webTbody.innerHTML = rows.map(a => {
    // bookingStatus = Booking.status (PENDING, CONFIRMED, CANCELLED, REJECTED)
    const bkSt = (a.bookingStatus || '').toUpperCase();
    let actionBtn = '';
    if (bkSt === 'PENDING') {
      actionBtn = `<div class="action-buttons">
        <button type="button" class="web-action-btn web-action-btn-approve" data-id="${a.id}" onclick="approveWeb('${a.id}')"><i class="fas fa-check"></i><span>Xác nhận</span></button>
        <button type="button" class="web-action-btn web-action-btn-reject" data-id="${a.id}" onclick="rejectWeb('${a.id}')"><i class="fas fa-xmark"></i><span>Từ chối</span></button>
      </div>`;
    } else if (bkSt === 'CANCELLED' || bkSt === 'REJECTED') {
      actionBtn = `<div class="action-buttons"><button type="button" class="web-action-btn web-action-btn-rebook" data-id="${a.id}" onclick="rebookAppointment('${a.id}')"><i class="fas fa-redo"></i><span>Đặt lại</span></button></div>`;
    } else {
      actionBtn = `<div class="action-buttons"><button type="button" class="web-action-btn web-action-btn-edit" data-id="${a.id}" onclick="openEditModal('${a.id}')"><i class="fas fa-pen"></i><span>Xem/Sửa</span></button></div>`;
    }
    return `<tr>
      <td class="fw-semibold">${a.id}</td><td>${a.customerName}</td><td>${a.phone}</td><td>${a.service}</td>
      <td>${a.date}</td><td>${a.start} - ${a.end}</td><td>${a.durationMin||""} phút</td>
      <td class="action-cell">${actionBtn}</td>
    </tr>`;
  }).join("");
}

window.approveWeb = async function(id){
  // UC 14.3 — Xác nhận yêu cầu online: KHÔNG confirm trực tiếp.
  // Mở modal Tạo lịch hẹn với dữ liệu prefill từ request để staff chọn phòng/giờ.
  const appt = (window._webAppts || []).find(a => a.id === id);
  if (!appt) {
    showToast('error', 'Lỗi', MSG_WEB_GENERIC_ERR);
    return;
  }

  const prefill = {
    _fromOnlineRequest: true,
    _bookingRequestCode: appt.bookingCode || '',
    _bookingRequestApptId: id,
    _booker: {
      name:   appt.bookerName  || appt.customerName || '',
      phone:  appt.bookerPhone || appt.phone        || '',
      email:  appt.bookerEmail || appt.email        || '',
      source: 'ONLINE',
      note:   appt.bookerNotes || '',
    },
    _guest: {
      name:      appt.customerName || appt.bookerName || '',
      phone:     appt.phone        || appt.bookerPhone || '',
      email:     appt.email        || appt.bookerEmail || '',
      serviceId: appt.serviceId    || null,
      variantId: appt.variantId    || null,
      // Prefill ngày/giờ khách yêu cầu — staff có thể chỉnh
      date:      appt.date         || '',
      time:      appt.start        || '',
      // Không prefill roomId — staff phải chọn phòng
    },
  };

  const isAnyModalOpen = !!document.querySelector('.modal.show') || !!document.querySelector('.modal-backdrop');
  if (isAnyModalOpen) {
    _forceCloseAllModals();
    setTimeout(() => openCreateModal(prefill), 100);
  } else {
    openCreateModal(prefill);
  }
}

window.rejectWeb = async function(id){
  const appt = (window._webAppts || []).find(a => a.id === id);
  const info = appt ? `${appt.customerName || appt.bookerName || ''} — ${appt.date} ${appt.start}` : id;

  const infoEl = document.getElementById('rejectWebInfo');
  if (infoEl) infoEl.textContent = info;

  const modalEl = document.getElementById('rejectWebModal');
  modalEl.addEventListener('shown.bs.modal', () => {
    document.querySelectorAll('.modal-backdrop').forEach(el => el.classList.add('reject-web-backdrop'));
  }, { once: true });
  modalEl.addEventListener('hidden.bs.modal', () => {
    document.querySelectorAll('.modal-backdrop').forEach(el => el.classList.remove('reject-web-backdrop'));
  }, { once: true });
  const modal = new bootstrap.Modal(modalEl);

  // Gắn handler một lần, tránh duplicate
  const btn = document.getElementById('confirmRejectWebBtn');
  const newBtn = _replaceWithClone(btn);

  newBtn.addEventListener('click', async () => {
    modal.hide();
    try {
      const result = await apiPost(`${API_BASE}/appointments/${id}/status/`, { status: 'REJECTED' });
      if (result.success) {
        showToast("success", "Thành công", MSG_REJECT_SUCCESS);
        await renderWebRequests();
        await refreshData();
      } else {
        showToast("error", "Lỗi", MSG_WEB_GENERIC_ERR);
      }
    } catch (err) {
      showToast("error", "Lỗi", MSG_WEB_GENERIC_ERR);
    }
  });

  modal.show();
}

window.rebookAppointment = async function(id) {
  // Guard: tránh double-click mở nhiều modal trong khi đang fetch
  if (window._rebookInProgress) {
    console.warn('[Rebook] Đang xử lý, bỏ qua click thừa — nếu bị kẹt, reload trang');
    // Reset để không bị kẹt mãi
    window._rebookInProgress = false;
    return;
  }
  window._rebookInProgress = true;
  try {
    const result = await apiGet(`${API_BASE}/appointments/${id}/`);
    if (!result || !result.success || !result.appointment) {
      console.error('[Rebook] API thất bại:', result);
      showToast('error', 'Lỗi', MSG_WEB_GENERIC_ERR);
      return;
    }
    openRebookAsCreate(result.appointment);
  } catch (err) {
    console.error('[Rebook] Lỗi fetch:', err);
    showToast('error', 'Lỗi', MSG_WEB_GENERIC_ERR);
  } finally {
    window._rebookInProgress = false;
  }
};

/**
 * Mở modal TẠO lịch mới, pre-fill từ lịch cũ.
 * Không copy ngày/giờ/phòng — admin phải chọn lại.
 *
 * Strategy: force-cleanup mọi modal/backdrop đang mở, sau đó mở modal mới.
 * Dùng requestAnimationFrame để đảm bảo DOM đã cleanup trước khi Bootstrap
 * khởi tạo modal mới.
 */
function openRebookAsCreate(a) {
  const prefill = {
    _fromRebook: true,
    _booker: {
      name:   a.bookerName  || '',
      phone:  a.bookerPhone || '',
      email:  a.bookerEmail || '',
      // Rebook luôn là admin tạo trực tiếp → source DIRECT, không copy source cũ
      // (tránh trường hợp booking gốc là ONLINE → booking mới bị coi là online pending)
      source: 'DIRECT',
      note:   a.bookerNotes || '',
    },
    _guest: {
      name:      a.customerName || '',
      phone:     a.phone        || '',
      email:     a.email        || '',
      serviceId: a.serviceId    || null,
      variantId: a.variantId    || null,
      // Không copy: roomId, date, time, status, appointment_code, booking_code, invoice
    },
  };

  // Bước 2: Mở modal tạo mới
  const _doOpen = () => {
    openCreateModal(prefill);
  };

  const modalEl = document.getElementById('apptModal');
  const isAnyModalOpen = !!document.querySelector('.modal.show') || !!document.querySelector('.modal-backdrop');

  if (isAnyModalOpen) {
    // Có modal đang mở → đợi apptModal hidden rồi mở lại
    // Nếu apptModal đang show, đăng ký hidden event
    if (modalEl && modalEl.classList.contains('show')) {
      modalEl.addEventListener('hidden.bs.modal', () => {
        setTimeout(_doOpen, 50);
      }, { once: true });
      const inst = bootstrap.Modal.getInstance(modalEl);
      if (inst) inst.hide();
    } else {
      // Modal khác đang mở (không phải apptModal) → force close tất cả rồi mở ngay
      _forceCloseAllModals();
      setTimeout(_doOpen, 100);
    }
  } else {
    // Không có modal nào mở → mở ngay
    _doOpen();
  }
}

// Điền dropdown dịch vụ cho filter bar scheduler
function fillServiceFilter(){
  const sel = document.getElementById('serviceFilter');
  if (sel) {
    _populateSelect(sel, SERVICES, 'id', 'name', 'Tất cả dịch vụ');
  }
  // Điền dropdown dịch vụ cho tab Yêu cầu đặt lịch
  const webSel = document.getElementById('webServiceFilter');
  if (webSel) {
    _populateSelect(webSel, SERVICES, 'id', 'name', 'Tất cả dịch vụ');
  }
}

// ============================================================
// ============================================================
// SECTION 10: CUSTOMER LOOKUP
// ============================================================
// Autofill thông tin từ CustomerProfile khi nhập SĐT người đặt hoặc từng khách.
// Không tự fill ghi chú lịch hẹn (bookerNote).
// Không ghi đè dữ liệu user đã sửa tay, trừ khi SĐT thay đổi.

/**
 * Lookup CustomerProfile theo SĐT qua API /api/customers/search/?q=<phone>
 * Trả về customer object hoặc null nếu không tìm thấy.
 */
async function _lookupCustomerByPhone(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  try {
    const result = await apiGet(`${API_BASE}/customers/search/?q=${encodeURIComponent(digits)}`);
    if (!result.success || !result.customers?.length) return null;
    // Tìm exact match theo phone
    const exact = result.customers.find(c => (c.phone || '').replace(/\D/g, '') === digits);
    return exact || null;
  } catch (e) {
    return null;
  }
}

function initCustomerSearch() {
  // Bind blur trên bookerPhone → autofill booker info
  const bookerPhoneEl = document.getElementById('bookerPhone');
  if (!bookerPhoneEl) return;

  let _lastBookerPhone = '';

  bookerPhoneEl.addEventListener('blur', async function() {
    const phone = bookerPhoneEl.value.trim();
    const digits = phone.replace(/\D/g, '');
    // Không lookup nếu SĐT không đổi hoặc quá ngắn
    if (digits === _lastBookerPhone || digits.length < 10) return;
    _lastBookerPhone = digits;

    const customer = await _lookupCustomerByPhone(digits);
    if (!customer) {
      // Không tìm thấy → clear customerId, giữ nguyên dữ liệu user đang nhập
      document.getElementById('selectedCustomerId').value = '';
      return;
    }

    // Tìm thấy → autofill booker
    // Ghi đè nếu profile mới khác profile cũ (đổi SĐT sang khách khác)
    const nameEl    = document.getElementById('bookerName');
    const emailEl   = document.getElementById('bookerEmail');
    const prevCustId = document.getElementById('selectedCustomerId').value || '';
    const isNewProfile = String(customer.id) !== prevCustId;

    // Fill tên/email: ghi đè khi profile mới khác, hoặc ô đang trống
    if (nameEl  && (isNewProfile || !nameEl.value.trim()))  nameEl.value  = customer.fullName || '';
    if (emailEl && (isNewProfile || !emailEl.value.trim())) emailEl.value = customer.email    || '';

    // Lưu customerId của booker
    document.getElementById('selectedCustomerId').value = String(customer.id);

    // Nếu có guest card nào đang tick "= người đặt" → sync xuống + fill customer note
    _getGuestItems().forEach(item => {
      const chk = item.querySelector('.gc-same-as-booker');
      if (!chk || !chk.checked) return;
      const nameI   = item.querySelector('.gc-name');
      const emailI  = item.querySelector('.gc-email');
      const custIdI = item.querySelector('.gc-customer-id');
      const noteI   = item.querySelector('.gc-customer-note');
      const prevGuestCustId = (custIdI?.value || item.dataset.customerId || '');
      const isNewGuestProfile = String(customer.id) !== prevGuestCustId;
      if (nameI)  nameI.value  = customer.fullName || '';
      if (emailI) emailI.value = customer.email    || '';
      if (custIdI) custIdI.value = String(customer.id);
      item.dataset.customerId = String(customer.id);
      // Ghi đè ghi chú hồ sơ khách khi profile mới khác, hoặc ô đang trống
      if (noteI && (isNewGuestProfile || !noteI.value.trim())) {
        noteI.value = customer.notes || '';
        item.dataset.originalNote = (customer.notes || '').trim();
      }
    });
  });
}

// Customer lookup stubs đã xóa — chỉ giữ _resetAllCustomerState dùng trong modal reset
function _resetAllCustomerState() {
  document.getElementById('selectedCustomerId').value = '';
}

// ============================================================
// SECTION 11: MODAL & FORM HELPERS
// ============================================================
// Escape HTML để tránh XSS
function _esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function _roomShortLabel(room) {
  var raw = String(room?.id || room?.code || room?.name || '').trim();
  if (!raw) return 'P?';
  var pCode = raw.match(/^P0*(\d+)$/i);
  if (pCode) return 'P' + Number(pCode[1]);
  if (/^\d+$/.test(raw)) return 'P' + Number(raw);
  return raw;
}

// ── Helpers ──
function _getGuestItems() {
  return Array.from(document.querySelectorAll('#guestList .gc-item'));
}

function _getGuestItem(idx) {
  return document.querySelector(`#guestList .gc-item[data-idx="${idx}"]`);
}

/** Kiểm tra 1 guest row đã đủ trường bắt buộc chưa */
function _isGuestComplete(item) {
  if (!item) return false;
  const svc  = item.querySelector('.gc-service')?.value;
  const vari = item.querySelector('.gc-variant')?.value;
  const room = item.dataset.slotRoom || item.querySelector('.gc-room')?.value;
  const date = document.getElementById('bookingDate')?.value || item.dataset.slotDate || item.querySelector('.gc-date')?.value;
  const time = item.dataset.slotTime || item.querySelector('.gc-time')?.value;
  return !!(svc && vari && room && date && time);
}

/** Highlight ô thiếu trong 1 row */
function _markRowValidity(item) {
  if (!item) return;
  const row = item.querySelector('.gc-row');
  if (row) {
    const complete = _isGuestComplete(item);
    row.style.background      = '#fff';
    row.style.borderLeftColor = complete ? '#86efac' : '#fca5a5';
  }
}

/** Highlight lỗi khi submit — chỉ gọi khi user bấm Lưu */
function _markRowError(item) {
  if (!item) return;
  const svcSel = item.querySelector('.gc-service');
  const varSel = item.querySelector('.gc-variant');
  [svcSel, varSel].forEach(el => {
    if (!el) return;
    el.style.borderColor = el.value ? '#d1d5db' : '#ef4444';
    el.style.background  = el.value ? '#fff'    : '#fef2f2';
  });
  const nameInp = item.querySelector('.gc-name');
  if (nameInp) {
    nameInp.style.borderColor = nameInp.value.trim() ? '#d1d5db' : '#ef4444';
    nameInp.style.background  = nameInp.value.trim() ? '#fff'    : '#fef2f2';
  }
}

/** Cập nhật progress bar */
function _updateGuestProgress() {
  const items   = _getGuestItems();
  const total   = items.length;
  const done    = items.filter(it => _isGuestComplete(it)).length;
  const labelEl = document.getElementById('guestProgressLabel');
  const fillEl  = document.getElementById('guestProgressFill');
  if (labelEl) labelEl.textContent = `${done}/${total} đã đủ`;
  if (fillEl)  fillEl.style.width  = total ? `${Math.round(done / total * 100)}%` : '0%';
  _updateCreatePayBtn();
}

/** Load variants cho 1 guest card */
window.toggleGuestCard = function(idx) {
  const item = _getGuestItem(idx);
  if (!item) return;
  const wrap   = item.querySelector('.gc-detail-wrap');
  const detail = item.querySelector('.gc-detail');
  const icon   = item.querySelector('.gc-expand-btn i');
  if (!wrap || !detail) return;
  const isOpen = wrap.style.maxHeight && wrap.style.maxHeight !== '0px' && wrap.style.maxHeight !== '0';
  if (isOpen) {
    wrap.style.maxHeight = '0';
    detail.style.display = 'none';
    if (icon) icon.style.transform = '';
    item.classList.remove('open');
  } else {
    detail.style.display = 'flex';
    wrap.style.maxHeight = detail.scrollHeight + 'px';
    if (icon) icon.style.transform = 'rotate(90deg)';
    item.classList.add('open');
  }
};

/** Focus 1 row (scroll vào view) */
window.focusGuestCard = function(idx) {
  const item = _getGuestItem(idx);
  if (item) item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

/** Load variants cho 1 guest card */
function _loadGuestVariants(item, serviceId, selectedVariantId) {
  const varSel = item.querySelector('.gc-variant');
  if (!varSel) return;
  varSel.innerHTML = '<option value="">-- Chọn gói --</option>';
  varSel.disabled  = true;
  varSel.style.color      = '#9ca3af';
  varSel.style.background = '#f9fafb';

  const svc = SERVICES.find(s => s.id == serviceId);
  if (!svc || !svc.variants?.length) {
    // Không có variant → giữ disabled nhưng placeholder rõ ràng
    varSel.innerHTML = '<option value="">-- Chọn dịch vụ trước --</option>';
    return;
  }

  svc.variants.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = variantLabel(v);
    opt.dataset.duration = v.duration_minutes;
    if (selectedVariantId && v.id == selectedVariantId) opt.selected = true;
    varSel.appendChild(opt);
  });

  // Enable + reset style về bình thường
  varSel.disabled         = false;
  varSel.style.color      = '#111827';
  varSel.style.background = '#fff';
  varSel.style.opacity    = '1';

  if (!selectedVariantId && svc.variants.length === 1) {
    varSel.value = svc.variants[0].id;
  }
  _updateGuestEndTime(item);
  _updateGuestPayFinal(item);
  _updateCreatePayBtn();
}

/** Tính và lưu end_time vào dataset + cập nhật hiển thị (giờ kết thúc auto-tính) */
function _updateGuestEndTime(item) {
  const varSel = item.querySelector('.gc-variant');
  const timeVal = item.dataset.slotTime;
  if (!varSel || !timeVal) return;
  const opt = varSel.options[varSel.selectedIndex];
  const dur = opt?.dataset?.duration ? Number(opt.dataset.duration) : 60;
  const newEnd = addMinutesToTime(timeVal, dur);
  item.dataset.endTime = newEnd;
  // Cập nhật hidden input
  const endHidden = item.querySelector('.gc-time-end');
  if (endHidden) endHidden.value = newEnd;
  // Cập nhật time-range display (giờ kết thúc readonly)
  const disp = item.querySelector('.gc-time-range-display');
  if (disp) {
    const startVal = item.dataset.slotTime || '--:--';
    disp.innerHTML = startVal + '<span class="gc-time-range-sep"> – </span>' + newEnd;
  }
  // Cập nhật legacy gc-slot-time nếu còn
  const endEl = item.querySelector('.gc-slot-time');
  if (endEl && item.dataset.slotTime) {
    endEl.textContent = `${item.dataset.slotTime}–${newEnd}`;
  }
}

/** Cập nhật hiển thị "Số tiền thu" (readonly) khi variant thay đổi */
function _updateGuestPayFinal(item) {
  const finalEl = item.querySelector('.gc-pay-final');
  if (!finalEl) return;
  const varSel = item.querySelector('.gc-variant');
  const opt = varSel?.options[varSel.selectedIndex];
  // Lấy price từ SERVICES data
  const svcSel = item.querySelector('.gc-service');
  const svc = SERVICES.find(s => s.id == svcSel?.value);
  const variant = svc?.variants?.find(v => v.id == varSel?.value);
  const price = variant?.price || svc?.price || 0;
  finalEl.value = price ? Number(price).toLocaleString('vi-VN') + 'đ' : '—';
  // Lưu raw price vào dataset để dùng khi validate
  item.dataset.finalAmount = price || 0;
}

/** Hiện/ẩn payment detail fields khi thay đổi gc-pay */
function _onGuestPayChange(item) {
  const paySel    = item.querySelector('.gc-pay');
  const payFields = item.querySelector('.gc-pay-fields');
  const amountWrap = item.querySelector('.gc-pay-amount-wrap');
  const finalWrap  = item.querySelector('.gc-pay-final-wrap');
  if (!paySel || !payFields) return;

  const val = paySel.value;
  if (val === 'PAID') {
    payFields.style.display = 'flex';
    if (amountWrap) amountWrap.style.display = 'none';
    if (finalWrap)  finalWrap.style.display  = 'flex';
    _updateGuestPayFinal(item);
  } else {
    // UNPAID hoặc PARTIAL — ẩn toàn bộ payment fields
    payFields.style.display = 'none';
  }
}

/**
 * Validate thời điểm chuyển trạng thái ARRIVED / COMPLETED.
 *
 * @param {string} dateStr   - "YYYY-MM-DD"
 * @param {string} timeStr   - "HH:MM"
 * @param {number} durationMin - số phút (mặc định 60)
 * @param {string} newStatus - "ARRIVED" | "COMPLETED" | ...
 * @returns {{ ok: boolean, error: string }}
 */
function _validateStatusTiming(dateStr, timeStr, durationMin, newStatus) {
  if (newStatus !== 'ARRIVED' && newStatus !== 'COMPLETED') return { ok: true, error: '' };

  const dur = parseInt(durationMin, 10) || 60;

  // Parse start datetime (local)
  const [y, mo, d]  = (dateStr || '').split('-').map(Number);
  const [h, mi]     = (timeStr || '00:00').split(':').map(Number);
  if (!y || !mo || !d) return { ok: true, error: '' }; // không đủ data → bỏ qua

  const startMs = new Date(y, mo - 1, d, h, mi, 0).getTime();
  const endMs   = startMs + dur * 60 * 1000;
  const nowMs   = Date.now();

  if (newStatus === 'ARRIVED' && nowMs < startMs) {
    return { ok: false, error: 'Chưa đến giờ hẹn, không thể chuyển sang Đã đến' };
  }
  if (newStatus === 'COMPLETED' && nowMs < endMs) {
    return { ok: false, error: 'Chưa kết thúc giờ hẹn, không thể hoàn thành lịch' };
  }
  return { ok: true, error: '' };
}

/**
 * Cập nhật badge trạng thái thanh toán và label nút invoice trong edit modal.
 * Không còn hiển thị Tổng/Đã trả/Còn lại trong modal chỉnh lịch.
 */
function _updatePaymentSummary() {
  const apptId = document.getElementById('apptId');
  const isEdit = !!(apptId && apptId.value.trim());
  if (!isEdit) return;

  const payStatus = document.getElementById('sharedPayStatus')?.value || 'UNPAID';

  // Cập nhật badge
  _setPayStatusBadge(payStatus);

  // Cập nhật label + style nút invoice
  const btnLabel = document.getElementById('btnInvoiceLabel');
  const btn      = document.getElementById('btnOpenInvoice');
  if (payStatus === 'PAID') {
    if (btnLabel) btnLabel.textContent = 'Xem hóa đơn';
    if (btn) btn.className = 'btn-invoice-action btn-invoice-view';
  } else if (payStatus === 'REFUNDED') {
    if (btnLabel) btnLabel.textContent = 'Xem hóa đơn';
    if (btn) btn.className = 'btn-invoice-action btn-invoice-view';
  } else if (payStatus === 'PARTIAL') {
    if (btnLabel) btnLabel.textContent = 'Thu thêm';
    if (btn) btn.className = 'btn-invoice-action btn-invoice-more';
  } else {
    if (btnLabel) btnLabel.textContent = 'Thanh toán';
    if (btn) btn.className = 'btn-invoice-action';
  }
}

/**
 * Cập nhật badge hiển thị trạng thái thanh toán (readonly).
 */
function _setPayStatusBadge(payStatus) {
  const badge = document.getElementById('payStatusBadge');
  if (!badge) return;

  const MAP = {
    UNPAID:   { text: 'Chưa thanh toán', cls: 'pay-status-unpaid'   },
    PARTIAL:  { text: 'Một phần',         cls: 'pay-status-partial'  },
    PAID:     { text: 'Đã thanh toán',    cls: 'pay-status-paid'     },
    REFUNDED: { text: 'Đã hoàn tiền',     cls: 'pay-status-refunded' },
  };
  const info = MAP[payStatus] || MAP.UNPAID;
  badge.textContent = info.text;
  badge.className   = `pay-status-badge ${info.cls}`;
}

/** Format số tiền VNĐ */
function _fmtVND(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '—';
  return Number(amount).toLocaleString('vi-VN') + 'đ';
}

function _setSelectValue(sel, value, fallback) {
  if (!sel) return;
  const wanted = value || fallback || '';
  const hasOption = Array.from(sel.options).some(opt => opt.value === wanted);
  sel.value = hasOption ? wanted : (fallback || '');
}

/**
 * Áp dụng mode cho modal lịch hẹn — phải gọi TRƯỚC modal.show().
 *
 * mode = 'request' : ẩn block Trạng thái & Thanh toán (xác nhận online / đặt lại từ request)
 * mode = 'normal'  : hiện lại block Trạng thái & Thanh toán (tạo mới / chỉnh sửa bình thường)
 *
 * Reset hoàn toàn trạng thái ẩn/hiện cũ trước khi apply mode mới,
 * tránh trạng thái từ lần mở trước bị giữ lại.
 */
function _applyModalMode(mode) {
  const sharedStatusBlock = document.getElementById('sharedStatusBlock');
  if (!sharedStatusBlock) return;

  if (mode === 'request') {
    // request-mode: ẩn Trạng thái & Thanh toán
    sharedStatusBlock.style.display = 'none';
    sharedStatusBlock.classList.add('d-none');
  } else {
    // normal-mode: hiện lại — xóa mọi class/style ẩn từ lần trước
    sharedStatusBlock.style.display = 'block';
    sharedStatusBlock.classList.remove('d-none');
    sharedStatusBlock.classList.remove('hidden');
    sharedStatusBlock.removeAttribute('hidden');
  }
}

function _showSharedStatusBlock(statusValue, payValue, isEditMode) {
  const sharedStatusSel = document.getElementById('sharedApptStatus');
  const sharedPaySel    = document.getElementById('sharedPayStatus');
  _setSelectValue(sharedStatusSel, statusValue, 'NOT_ARRIVED');
  _setSelectValue(sharedPaySel,    payValue,    'UNPAID');

  const editableWrap  = document.getElementById('payStatusEditableWrap');
  const readonlyWrap  = document.getElementById('payStatusReadonlyWrap');
  const btnWrap       = document.getElementById('btnInvoiceWrap');
  const methodWrap    = document.getElementById('sharedPayMethodWrap');
  const amountWrap    = document.getElementById('sharedPayAmountWrap');

  // Shared status dropdown — hiện cả create và edit mode
  const apptStatusWrap = sharedStatusSel ? sharedStatusSel.closest('.status-form-group') : null;

  // 7 dòng DOM setup giống nhau cho cả create và edit mode
  if (apptStatusWrap) apptStatusWrap.style.display = '';
  if (editableWrap) editableWrap.classList.add('d-none');
  if (readonlyWrap) readonlyWrap.classList.remove('d-none');
  if (btnWrap)      btnWrap.classList.remove('d-none');
  if (methodWrap)   methodWrap.style.display = 'none';
  if (amountWrap)   amountWrap.style.display = 'none';
  if (sharedPaySel) sharedPaySel.onchange = null;

  if (isEditMode) {
    // EDIT MODE: đánh giá lại trạng thái nút dựa trên dịch vụ đã chọn
    _updateCreatePayBtn();
    _updatePaymentSummary();
  } else {
    // CREATE MODE: badge readonly + nút invoice
    // Không nhập thanh toán trực tiếp, dùng invoice modal sau khi tạo lịch
    // Badge luôn "Chưa thanh toán" khi tạo mới
    _setPayStatusBadge('UNPAID');
    // Đánh giá trạng thái nút dựa trên dịch vụ đã chọn
    _updateCreatePayBtn();
    const btnInvoiceLabel = document.getElementById('btnInvoiceLabel');
    if (btnInvoiceLabel) btnInvoiceLabel.textContent = 'Thanh toán';
  }
}

/** Build 1 compact guest row — detail panel ẩn mặc định, toggle bằng JS */
function _buildGuestItem(idx, prefill) {
  prefill = prefill || {};
  const dayPicker = document.getElementById("dayPicker");
  var dateVal  = prefill.date || document.getElementById('bookingDate')?.value || dayPicker.value;
  var timeVal  = prefill.time || '';
  var endTime  = (timeVal && prefill.pendingDuration) ? addMinutesToTime(timeVal, prefill.pendingDuration) : '';

  var svcOpts = '<option value="">Dịch vụ</option>' +
    SERVICES.map(function(s){ return '<option value="' + s.id + '">' + s.name + '</option>'; }).join('');

  var inp = 'width:100%;height:36px;padding:0 12px;font-size:14px;border:1px solid #d1d5db;border-radius:6px;outline:none;background:#fff;box-sizing:border-box;font-family:inherit;color:#111827;display:block;';
  var sel = 'width:100%;height:36px;padding:0 10px;font-size:14px;border:1px solid #d1d5db;border-radius:6px;outline:none;background:#fff;box-sizing:border-box;font-family:inherit;color:#111827;display:block;appearance:auto;';
  var roomSelectCss = sel.replace('width:100%;', 'width:112px;max-width:100%;');
  var sInp = 'width:100%;height:32px;padding:0 10px;font-size:13px;border:1px solid #e5e7eb;border-radius:5px;outline:none;background:#fff;box-sizing:border-box;font-family:inherit;color:#374151;display:block;';
  var lbl  = 'font-size:13px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;white-space:nowrap;';
  var selectedRoomId = prefill.roomId || '';

  // Slot badge: phòng dropdown + time-range field gọn đẹp
  var roomOpts = '<option value="" disabled' + (selectedRoomId ? '' : ' selected') + ' hidden>Chọn giường</option>' +
    ROOMS.map(function(r){
      var roomId = r.id || r.code || '';
      var isSel = (roomId == selectedRoomId) ? ' selected' : '';
      var label = _roomShortLabel(r);
      var capacity = r.capacity || '';
      var title = label + (capacity ? ' - ' + capacity + ' giường' : '');
      return '<option value="' + _esc(roomId) + '"' + isSel + ' data-capacity="' + _esc(capacity) + '" title="' + _esc(title) + '">' + _esc(label) + '</option>';
    }).join('');

  var slotBadge = '<div class="gc-slot-badge">'
    + '<select class="gc-room-select" required style="' + roomSelectCss + '">' + roomOpts + '</select>'
    + '<div class="gc-time-range-field" title="Click để chỉnh giờ">'
      + '<i class="far fa-clock gc-time-range-icon"></i>'
      + '<span class="gc-time-range-display">'
        + (timeVal ? _esc(timeVal) : '--:--')
        + '<span class="gc-time-range-sep"> – </span>'
        + (endTime ? _esc(endTime) : '--:--')
      + '</span>'
      + '<div class="gc-time-range-inputs">'
        + '<input type="time" class="gc-time-input" value="' + _esc(timeVal) + '" title="Giờ bắt đầu" />'
      + '</div>'
    + '</div>'
  + '</div>';

  var item = document.createElement('div');
  item.className = 'gc-item';
  item.dataset.idx      = idx;
  item.dataset.slotTime = timeVal;
  item.dataset.slotDate = dateVal;
  item.dataset.slotRoom = selectedRoomId;
  item.dataset.endTime  = endTime;
  item.dataset.detailOpen = '0';
  item.style.cssText = 'border-bottom:1px solid #eef0f3;';

  item.innerHTML =
    '<input type="hidden" class="gc-room" value="' + _esc(selectedRoomId) + '" />'
  + '<input type="hidden" class="gc-date" value="' + _esc(dateVal) + '" />'
  + '<input type="hidden" class="gc-time" value="' + _esc(timeVal) + '" />'
  + '<input type="hidden" class="gc-time-end" value="' + _esc(endTime) + '" />'
  + '<input type="hidden" class="gc-customer-id" value="' + _esc(prefill.customerId || '') + '" />'

  // ── DÒNG CHÍNH ──
  // Grid: # | Phòng·Giờ | Tên khách (+ checkbox) | SĐT | Dịch vụ | Gói | Actions
  + '<div class="gc-row gc-row-grid">'

    // Col 1 — số thứ tự
    + '<div class="gc-num" style="text-align:center;font-size:13px;font-weight:700;color:#94a3b8;">—</div>'

    // Col 2 — phòng · giờ
    + '<div class="gc-slot-cell">' + slotBadge + '</div>'

    // Col 3 — tên khách + checkbox "= người đặt"
    + '<div class="gc-name-cell">'
      + '<div class="gc-name-inline">'
        + '<input class="gc-name" style="' + inp + 'flex:1 1 220px;min-width:0;" placeholder="Tên khách *" value="' + _esc(prefill.name || '') + '" />'
        + '<label class="gc-same-booker-label" title="Điền từ người đặt">'
          + '<input type="checkbox" class="gc-same-as-booker" style="width:14px;height:14px;cursor:pointer;accent-color:#1d4ed8;margin:0;" />'
          + '<span>= người đặt</span>'
        + '</label>'
      + '</div>'
    + '</div>'

    // Col 4 — SĐT
    + '<div class="gc-phone-cell"><input class="gc-phone" style="' + inp + '" placeholder="SĐT" inputmode="numeric" value="' + _esc(prefill.phone || '') + '" /></div>'

    // Col 5 — dịch vụ
    + '<div class="gc-service-cell"><select class="gc-service" style="' + sel + '">' + svcOpts + '</select></div>'

    // Col 6 — gói
    + '<div class="gc-variant-cell"><select class="gc-variant" style="' + sel + '" disabled><option value="">-- Chọn dịch vụ trước --</option></select></div>'

    // Col 7 — actions
    + '<div class="gc-actions-cell" style="display:flex;align-items:center;justify-content:center;gap:6px;">'
      + '<button type="button" class="gc-expand-btn" onclick="toggleGuestCard(' + idx + ')" title="Email & ghi chú"'
      + ' style="height:36px;width:36px;padding:0;font-size:15px;background:#f1f5f9;border:1px solid #e2e8f0;color:#64748b;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s;">'
      + '<i class="fas fa-ellipsis-h"></i></button>'
      + '<button type="button" class="gc-delete-btn" onclick="removeGuestCard(' + idx + ')" title="Xóa khách"'
      + ' style="height:36px;width:36px;padding:0;font-size:15px;background:#fff5f5;border:1px solid #fecaca;color:#ef4444;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s,opacity .15s;">'
      + '<i class="fas fa-trash-alt"></i></button>'
    + '</div>'

  + '</div>'

  // gc-sub-row đã chuyển thành block chung ở footer — không render per-guest anymore

  // ── PHẦN MỞ RỘNG — Email + Ghi chú hồ sơ khách + Trạng thái (toggle bằng dấu 3 chấm) ──
  + '<div class="gc-detail-wrap">'
    + '<div class="gc-detail">'
      + '<div style="display:flex;flex-direction:column;gap:2px;min-width:150px;flex:1;">'
        + '<label style="' + lbl + '">Email</label>'
        + '<input type="email" class="gc-email" style="' + sInp + '" placeholder="Email (nếu có)" value="' + _esc(prefill.email || '') + '" />'
      + '</div>'
      // Dropdown trạng thái riêng từng khách — đã chuyển lên gc-row-grid (col 7) để hiện rõ trong edit mode
      // Trong create mode, trạng thái dùng sharedApptStatus ở footer
      + '<div style="display:flex;flex-direction:column;gap:2px;flex:3;min-width:180px;">'
        + '<label style="' + lbl + '">Ghi chú hồ sơ khách <span style="font-weight:400;color:#9ca3af;font-size:12px;">(lưu vào hồ sơ nếu khách có hồ sơ)</span></label>'
        + '<input class="gc-customer-note" style="' + sInp + '" placeholder="Ghi chú lâu dài từ hồ sơ khách..." value="' + _esc(prefill.customerNote || '') + '" title="Ghi chú lâu dài từ hồ sơ khách — sẽ được cập nhật vào hồ sơ khi lưu (nếu khách có hồ sơ)" />'
      + '</div>'
    + '</div>'
  + '</div>';

  // Bind events
  var roomSel = item.querySelector('.gc-room-select');
  if (roomSel) {
    roomSel.addEventListener('change', function() {
      item.dataset.slotRoom = roomSel.value;
      var roomInp = item.querySelector('.gc-room');
      if (roomInp) roomInp.value = roomSel.value;
      _markRowValidity(item);
      _updateGuestProgress();
    });
  }

  var svcSel = item.querySelector('.gc-service');
  var varSel = item.querySelector('.gc-variant');
  if (svcSel) {
    svcSel.addEventListener('change', function() {
      svcSel.style.borderColor = svcSel.value ? '#d1d5db' : '';
      svcSel.style.background  = '#fff';
      _loadGuestVariants(item, svcSel.value, null);
      _markRowValidity(item);
      _updateGuestProgress();
      _updateCreatePayBtn();
    });
  }
  if (varSel) {
    varSel.addEventListener('change', function() {
      varSel.style.borderColor = varSel.value ? '#d1d5db' : '';
      varSel.style.background  = '#fff';
      varSel.style.color       = varSel.value ? '#111827' : '#9ca3af';
      _updateGuestEndTime(item);
      _markRowValidity(item);
      _updateGuestProgress();
      _updateGuestPayFinal(item);
      _updateCreatePayBtn();
    });
  }
  var nameInp = item.querySelector('.gc-name');
  if (nameInp) nameInp.addEventListener('input', function() {
    nameInp.style.borderColor = nameInp.value.trim() ? '#d1d5db' : '';
    nameInp.style.background  = '#fff';
    _updateGuestProgress();
  });

  // ── Autofill từ CustomerProfile khi blur khỏi ô SĐT khách ──
  var phoneInp = item.querySelector('.gc-phone');
  if (phoneInp) {
    let _lastGuestPhone = '';
    phoneInp.addEventListener('blur', async function() {
      const phone  = phoneInp.value.trim();
      const digits = phone.replace(/\D/g, '');
      if (digits === _lastGuestPhone || digits.length < 10) return;
      _lastGuestPhone = digits;

      const customer = await _lookupCustomerByPhone(digits);
      if (!customer) {
        // Không tìm thấy → clear customerId, giữ nguyên dữ liệu user đang nhập
        const custIdI = item.querySelector('.gc-customer-id');
        if (custIdI) custIdI.value = '';
        item.dataset.customerId = '';
        return;
      }

      // Tìm thấy → autofill đúng dòng này
      // Ghi đè nếu profile mới khác profile cũ (đổi SĐT sang khách khác)
      const nameI   = item.querySelector('.gc-name');
      const emailI  = item.querySelector('.gc-email');
      const custIdI = item.querySelector('.gc-customer-id');
      const noteI   = item.querySelector('.gc-customer-note');
      const prevCustId = custIdI?.value || item.dataset.customerId || '';
      const isNewProfile = String(customer.id) !== prevCustId;

      if (nameI  && (isNewProfile || !nameI.value.trim()))  nameI.value  = customer.fullName || '';
      if (emailI && (isNewProfile || !emailI.value.trim())) emailI.value = customer.email    || '';

      // Lưu customerId vào hidden field và dataset
      if (custIdI) custIdI.value = String(customer.id);
      item.dataset.customerId = String(customer.id);

      // Ghi đè ghi chú hồ sơ khách khi profile mới khác, hoặc ô đang trống
      if (noteI && (isNewProfile || !noteI.value.trim())) {
        noteI.value = customer.notes || '';
        item.dataset.originalNote = (customer.notes || '').trim();
      }

      _updateGuestProgress();
    });
  }

  // Checkbox "= người đặt" — sync tên + SĐT + email từ booker khi tick
  var sameChk = item.querySelector('.gc-same-as-booker');
  if (sameChk) {
    sameChk.addEventListener('change', function() {
      var nameI  = item.querySelector('.gc-name');
      var phoneI = item.querySelector('.gc-phone');
      var emailI = item.querySelector('.gc-email');
      var custIdI = item.querySelector('.gc-customer-id');
      if (sameChk.checked) {
        if (nameI)  nameI.value  = document.getElementById('bookerName')?.value.trim()  || '';
        if (phoneI) phoneI.value = document.getElementById('bookerPhone')?.value.trim() || '';
        if (emailI) emailI.value = document.getElementById('bookerEmail')?.value.trim() || '';
        if (nameI)  nameI.readOnly  = true;
        if (phoneI) phoneI.readOnly = true;
        // Khi tick "= người đặt": copy customerId của booker vào guest
        // (booker customerId được lưu trong #selectedCustomerId)
        const bookerCustId = document.getElementById('selectedCustomerId')?.value || '';
        if (custIdI) custIdI.value = bookerCustId;
        item.dataset.customerId = bookerCustId;
        // Ghi chú hồ sơ khách: fill từ CustomerProfile của booker nếu có và ô đang trống
        if (bookerCustId) {
          const noteI = item.querySelector('.gc-customer-note');
          if (noteI && !noteI.value.trim()) {
            // Lookup async — không block UI
            _lookupCustomerByPhone(document.getElementById('bookerPhone')?.value || '').then(c => {
              if (c && noteI && !noteI.value.trim()) {
                noteI.value = c.notes || '';
                item.dataset.originalNote = (c.notes || '').trim();
              }
            });
          }
        }
      } else {
        if (nameI)  { nameI.value  = ''; nameI.readOnly  = false; }
        if (phoneI) { phoneI.value = ''; phoneI.readOnly = false; }
        if (emailI) emailI.readOnly = false;
        // Bỏ tick → khách là người khác, xóa customerId để tránh update nhầm profile người đặt
        if (custIdI) custIdI.value = '';
        item.dataset.customerId = '';
        // Xóa ghi chú hồ sơ vì chưa biết profile của khách này
        const noteI = item.querySelector('.gc-customer-note');
        if (noteI) noteI.value = '';
        item.dataset.originalNote = '';
      }
      _updateGuestProgress();
    });
  }

  // Bind gc-pay change → show/hide payment fields
  var paySel = item.querySelector('.gc-pay');
  if (paySel) {
    paySel.addEventListener('change', function() { _onGuestPayChange(item); });
  }

  // ── Bind time inputs — sync về hidden fields + dataset ──
  var startInp = item.querySelector('.gc-time-input');
  var timeHid  = item.querySelector('.gc-time');
  var endHid   = item.querySelector('.gc-time-end');

  function _syncTimeDisplay() {
    var disp = item.querySelector('.gc-time-range-display');
    if (!disp) return;
    var s = startInp ? startInp.value : '';
    // Giờ kết thúc luôn tính từ giờ bắt đầu + duration
    var varSel = item.querySelector('.gc-variant');
    var dur = 60;
    if (varSel && varSel.selectedIndex >= 0) {
      var opt = varSel.options[varSel.selectedIndex];
      dur = opt?.dataset?.duration ? Number(opt.dataset.duration) : 60;
    }
    var e = s ? addMinutesToTime(s, dur) : '--:--';
    disp.innerHTML = (s || '--:--') + '<span class="gc-time-range-sep"> – </span>' + e;
  }

  if (startInp) {
    startInp.addEventListener('change', function() {
      var v = startInp.value;
      item.dataset.slotTime = v;
      if (timeHid) timeHid.value = v;
      // Tính lại end từ variant duration (luôn luôn tính)
      var varSel2 = item.querySelector('.gc-variant');
      var dur2 = 60;
      if (varSel2 && varSel2.selectedIndex >= 0) {
        var opt2 = varSel2.options[varSel2.selectedIndex];
        dur2 = opt2?.dataset?.duration ? Number(opt2.dataset.duration) : 60;
      }
      var newEnd = addMinutesToTime(v, dur2);
      item.dataset.endTime = newEnd;
      if (endHid) endHid.value = newEnd;
      _syncTimeDisplay();
      _markRowValidity(item);
      _updateGuestProgress();
    });
  }

  // ── Click vào cụm time-range → toggle editing mode ──
  var timeRangeField = item.querySelector('.gc-time-range-field');
  if (timeRangeField) {
    timeRangeField.addEventListener('click', function(e) {
      if (e.target.tagName === 'INPUT') return; // đang trong input thì không toggle
      var isEditing = timeRangeField.classList.contains('is-editing');
      if (!isEditing) {
        timeRangeField.classList.add('is-editing');
        // Focus vào input giờ bắt đầu
        setTimeout(function() {
          var inp = timeRangeField.querySelector('.gc-time-input');
          if (inp) inp.focus();
        }, 30);
      }
    });
    // Click ra ngoài → đóng editing
    document.addEventListener('click', function _closeTimeRange(e) {
      if (!timeRangeField.contains(e.target)) {
        timeRangeField.classList.remove('is-editing');
      }
    });
    // Enter từ input → đóng editing
    var startTimeInp = timeRangeField.querySelector('.gc-time-input');
    if (startTimeInp) {
      startTimeInp.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          timeRangeField.classList.remove('is-editing');
        }
      });
    }
  }

  return item;
}

function addGuestCard(prefill = {}) {
  const list = document.getElementById('guestList');
  if (!list) return;
  const idx  = _guestCount++;
  const item = _buildGuestItem(idx, prefill);
  list.appendChild(item);

  // Lưu appointment_code vào dataset để submit handler biết update đúng appt
  if (prefill._apptId) {
    item.dataset.apptId = prefill._apptId;
  }

  // Lưu customerId và originalNote để so sánh khi update note
  if (prefill.customerId) {
    item.dataset.customerId = String(prefill.customerId);
  }
  // originalNote: lưu note gốc từ profile để so sánh trước khi gọi API
  item.dataset.originalNote = (prefill.customerNote || '').trim();

  // Lưu date/time/room gốc để edit submit chỉ gửi khi thực sự thay đổi
  if (prefill._editMode) {
    item.dataset.originalDate    = prefill.date    || '';
    item.dataset.originalTime    = prefill.time    || '';
    item.dataset.originalRoom    = prefill.roomId  || '';
    // Lưu variantId gốc để detect khi variant đổi → gửi kèm roomId cho BE validate overlap
    item.dataset.originalVariantId = prefill.variantId ? String(prefill.variantId) : '';
    // Lưu status gốc để _hasUnsavedGuestChanges detect thay đổi (so sánh với sharedApptStatus)
    item.dataset.originalApptStatus = prefill.apptStatus || 'NOT_ARRIVED';
  }

  if (prefill.serviceId) {
    const svcSel = item.querySelector('.gc-service');
    if (svcSel) {
      svcSel.value = prefill.serviceId;
      _loadGuestVariants(item, prefill.serviceId, prefill.variantId);
    }
  }

  // Set status / payStatus nếu có prefill
  // Trạng thái dùng sharedApptStatus chung — không set per-card nữa
  if (prefill.payStatus) {
    const paySel = item.querySelector('.gc-pay');
    if (paySel) {
      paySel.value = prefill.payStatus;
      _onGuestPayChange(item);
    }
  }

  // Set room/date/time từ prefill nếu có (edit mode)
  if (prefill.roomId) {
    item.dataset.slotRoom = prefill.roomId;
    const roomInp = item.querySelector('.gc-room');
    if (roomInp) roomInp.value = prefill.roomId;
    // Cập nhật select phòng
    const roomSel = item.querySelector('.gc-room-select');
    if (roomSel) roomSel.value = prefill.roomId;
  }
  if (prefill.date) {
    item.dataset.slotDate = prefill.date;
    const dateInp = item.querySelector('.gc-date');
    if (dateInp) dateInp.value = prefill.date;
  }
  if (prefill.time) {
    item.dataset.slotTime = prefill.time;
    const timeHid = item.querySelector('.gc-time');
    if (timeHid) timeHid.value = prefill.time;
    // Sync editable start input
    const startInp = item.querySelector('.gc-time-input');
    if (startInp) startInp.value = prefill.time;
  }

  _renumberGuests();
  _markRowValidity(item);
  _updateGuestProgress();
  _updateDeleteBtnState();
}

window.removeGuestCard = async function(idx) {
  const items = _getGuestItems();
  const item  = _getGuestItem(idx);
  if (!item) return;

  const apptId  = item.dataset.apptId || item.querySelector('.gc-customer-id')?.dataset?.apptId || '';
  // Lấy _apptId từ dataset (được set khi build guest card trong edit mode)
  const targetApptId = item.dataset.apptId || '';

  // Nếu chỉ còn 1 dòng → không cho xóa, yêu cầu dùng nút Xóa lịch
  if (items.length <= 1) {
    showToast('warning', 'Không thể xóa', 'Booking chỉ còn 1 khách. Dùng nút "Xóa" để xóa toàn bộ lịch hẹn.');
    return;
  }

  // Nếu card chưa có appointment_id (card mới thêm chưa lưu) → chỉ remove DOM
  if (!targetApptId) {
    item.remove();
    _renumberGuests();
    _updateGuestProgress();
    _updateDeleteBtnState();
    return;
  }

  // Card đã có appointment_id → hỏi confirm rồi gọi API delete
  const customerName = item.querySelector('.gc-name')?.value.trim() || 'khách này';
  const confirmed = await confirmAction(
    'Xóa khách khỏi booking?',
    `Xóa "${customerName}" khỏi booking này? Hành động không thể hoàn tác.`,
    'Xóa',
    'Hủy'
  );
  if (!confirmed) return;

  // Disable nút xóa trong lúc đang gọi API
  const deleteBtn = item.querySelector('.gc-delete-btn');
  if (deleteBtn) { deleteBtn.disabled = true; deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

  try {
    const result = await apiPost(`${API_BASE}/appointments/${targetApptId}/delete/`, {});
    if (result.success) {
      item.remove();
      _renumberGuests();
      _updateGuestProgress();
      _updateDeleteBtnState();
      showToast('success', 'Đã xóa', `Đã xóa ${customerName} khỏi booking`);
    } else {
      // Restore nút nếu thất bại
      if (deleteBtn) { deleteBtn.disabled = false; deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>'; }
      showToast('error', 'Không thể xóa', result.error || 'Xóa thất bại, vui lòng thử lại.');
    }
  } catch (err) {
    if (deleteBtn) { deleteBtn.disabled = false; deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>'; }
    showToast('error', 'Lỗi', 'Xóa thất bại, vui lòng thử lại.');
  }
};

/** Điền thông tin từ người đặt vào 1 guest row */
window.fillGuestFromBooker = function(idx) {
  const item = _getGuestItem(idx);
  if (!item) return;
  const bookerName  = document.getElementById('bookerName')?.value.trim() || '';
  const bookerPhone = document.getElementById('bookerPhone')?.value.trim() || '';
  const bookerEmail = document.getElementById('bookerEmail')?.value.trim() || '';
  const nameInp  = item.querySelector('.gc-name');
  const phoneInp = item.querySelector('.gc-phone');
  const emailInp = item.querySelector('.gc-email');
  if (nameInp)  nameInp.value  = bookerName;
  if (phoneInp) phoneInp.value = bookerPhone;
  if (emailInp) emailInp.value = bookerEmail;
};

/** Xóa thông tin cá nhân của 1 guest row */
window.clearGuestInfo = function(idx) {
  const item = _getGuestItem(idx);
  if (!item) return;
  const nameInp  = item.querySelector('.gc-name');
  const phoneInp = item.querySelector('.gc-phone');
  const emailInp = item.querySelector('.gc-email');
  if (nameInp)  nameInp.value  = '';
  if (phoneInp) phoneInp.value = '';
  if (emailInp) emailInp.value = '';
};

function _renumberGuests() {
  _getGuestItems().forEach((item, i) => {
    const numEl = item.querySelector('.gc-num');
    if (numEl) numEl.textContent = i + 1;
  });
}

/** Disable nút xóa khi chỉ còn 1 dòng, enable lại khi có nhiều hơn */
function _updateDeleteBtnState() {
  const items = _getGuestItems();
  const onlyOne = items.length <= 1;
  items.forEach(item => {
    const btn = item.querySelector('.gc-delete-btn');
    if (!btn) return;
    btn.disabled = onlyOne;
    btn.style.opacity  = onlyOne ? '0.3' : '1';
    btn.style.cursor   = onlyOne ? 'not-allowed' : 'pointer';
  });
}

// Deprecated — kept for compatibility, now handled by event listeners on each item
window.onGuestServiceChange = function(sel, idx) {
  const item = _getGuestItem(idx);
  if (!item) return;
  _loadGuestVariants(item, sel.value, null);
  _updateGuestProgress();
};

function _collectGuestCards() {
  const bookerNote = document.getElementById('bookerNote')?.value.trim() || '';
  // Ngày hẹn chung cho toàn booking — đọc từ field #bookingDate ở booker section
  const sharedDate = document.getElementById('bookingDate')?.value || '';
  // Đọc trạng thái từ block footer (dùng cho CREATE mode)
  const sharedStatus  = document.getElementById('sharedApptStatus')?.value  || 'NOT_ARRIVED';
  const sharedPay     = 'UNPAID';  // Create mode luôn UNPAID — thanh toán qua invoice modal sau khi tạo
  return _getGuestItems().map(item => {
    const variantSel = item.querySelector('.gc-variant');
    const selectedVariantOpt = variantSel?.options[variantSel.selectedIndex];
    // Trạng thái lấy từ sharedApptStatus chung — áp dụng cho tất cả guests (cả create và edit mode)
    const perCardDate = item.dataset.slotDate || item.querySelector('.gc-date')?.value || '';
    // BUG-006 FIX: Cả edit mode và create mode đều ưu tiên per-card date.
    // sharedDate chỉ dùng làm fallback khi per-card date rỗng.
    const resolvedDate = perCardDate || sharedDate;
    return {
      name:               item.querySelector('.gc-name')?.value.trim() || '',
      phone:              item.querySelector('.gc-phone')?.value.trim() || '',
      email:              item.querySelector('.gc-email')?.value.trim() || '',
      serviceId:          item.querySelector('.gc-service')?.value || '',
      variantId:          variantSel?.value || '',
      roomId:             item.dataset.slotRoom || item.querySelector('.gc-room')?.value || '',
      date:               resolvedDate,
      time:               item.querySelector('.gc-time-input')?.value || item.dataset.slotTime || item.querySelector('.gc-time')?.value || '',
      apptStatus:         sharedStatus,
      payStatus:          sharedPay,
      paymentMethod:      '',
      paymentAmount:      0,
      paymentRecordedNo:  '',
      paymentNote:        '',
      note:               bookerNote,
      customerNote:       item.querySelector('.gc-customer-note')?.value.trim() || '',
      customerId:         item.querySelector('.gc-customer-id')?.value || item.dataset.customerId || '',
      originalNote:       item.dataset.originalNote || '',
      originalDate:       item.dataset.originalDate || '',
      originalTime:       item.dataset.originalTime || '',
      originalRoom:       item.dataset.originalRoom || '',
      _originalVariantId: item.dataset.originalVariantId || '',
      _duration:          selectedVariantOpt?.dataset?.duration || 60,
      _finalAmount:       item.dataset.finalAmount || 0,
      _apptId:            item.dataset.apptId || '',   // appointment_code nếu là edit mode
    };
  });
}

/**
 * Cập nhật ghi chú hồ sơ khách cho từng guest có thay đổi note.
 *
 * Quy tắc:
 * 1. Chỉ update khi guest có customerId — không dùng phone để xác định profile
 * 2. Không có customerId → bỏ qua (toast nhẹ nếu note có thay đổi)
 * 3. Chỉ gọi API khi note thực sự thay đổi (so sánh originalNote vs newNote)
 * 4. Nếu xóa note (originalNote ≠ '' và newNote = '') → hỏi confirm trước
 * 5. API lỗi → hiển thị toast cảnh báo (không silent fail)
 *
 * @param {Array} cards - mảng guest card data từ _collectGuestCards()
 * @param {boolean} [skipConfirm=false] - bỏ qua confirm xóa note (dùng khi đã confirm trước)
 */
async function _updateCustomerNotes(cards, skipConfirm = false) {
  for (const g of cards) {
    const newNote      = (g.customerNote || '').trim();
    const originalNote = (g.originalNote || '').trim();
    const customerId   = (g.customerId || '').toString().trim();
    const guestLabel   = g.name ? ` (${g.name})` : '';

    // Không thay đổi → không gọi API
    if (newNote === originalNote) continue;

    // Không có customerId → không update, toast nhẹ nếu người dùng đã nhập note
    if (!customerId) {
      if (newNote) {
        showToast('warning', 'Lưu ý', `Khách${guestLabel} chưa có hồ sơ nên ghi chú chưa được lưu vào hồ sơ khách.`);
      }
      continue;
    }

    // Xóa note (originalNote có giá trị, newNote rỗng) → hỏi confirm
    if (!skipConfirm && originalNote !== '' && newNote === '') {
      const nameLabel = g.name ? `"${g.name}"` : 'khách này';
      const confirmed = await confirmAction(
        'Xóa ghi chú hồ sơ khách',
        `Bạn có chắc muốn xóa ghi chú hồ sơ khách của ${nameLabel}?`,
        'Xóa ghi chú',
        'Giữ lại'
      );
      if (!confirmed) continue;
    }

    // Có customerId → update theo ID
    try {
      const result = await apiPost(`${API_BASE}/customers/id/${customerId}/note/`, { note: newNote });
      if (!result.success) {
        showToast('warning', 'Cảnh báo', `Không cập nhật được ghi chú hồ sơ khách${guestLabel}`);
      }
    } catch (e) {
      console.warn('_updateCustomerNotes: failed for customerId', customerId, e);
      showToast('warning', 'Cảnh báo', `Không cập nhật được ghi chú hồ sơ khách${guestLabel}`);
    }
  }
}

/** Áp dụng service/variant cho tất cả guest rows */
function _initApplyAllBar() {
  const applyAllSvc = document.getElementById('applyAllService');
  if (applyAllSvc) {
    _populateSelect(applyAllSvc, SERVICES, 'id', 'name', 'Dịch vụ');
  }

  if (applyAllSvc) {
    applyAllSvc.onchange = function() {
      const varSel = document.getElementById('applyAllVariant');
      if (!varSel) return;
      varSel.innerHTML = '<option value="">-- Gói --</option>';
      varSel.disabled  = true;
      varSel.style.color      = '#9ca3af';
      varSel.style.background = '#f9fafb';
      const svc = SERVICES.find(s => s.id == this.value);
      if (!svc || !svc.variants?.length) return;
      svc.variants.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = variantLabel(v);
        opt.dataset.duration = v.duration_minutes;
        varSel.appendChild(opt);
      });
      varSel.disabled         = false;
      varSel.style.color      = '#111827';
      varSel.style.background = '#fff';
      varSel.style.opacity    = '1';
      if (svc.variants.length === 1) varSel.value = svc.variants[0].id;
    };
  }

  const btnApply = document.getElementById('btnApplyAll');
  if (btnApply) {
    btnApply.onclick = function() {
      const svcVal = document.getElementById('applyAllService')?.value;
      const varVal = document.getElementById('applyAllVariant')?.value;
      if (!svcVal) return;
      _getGuestItems().forEach(item => {
        const svcSel = item.querySelector('.gc-service');
        if (svcSel) {
          svcSel.value = svcVal;
          _loadGuestVariants(item, svcVal, varVal || null);
        }
        _markRowValidity(item);
      });
      _updateGuestProgress();
    };
  }

  const btnAdd = document.getElementById('btnAddGuest');
  if (btnAdd) {
    btnAdd.onclick = function() {
      _savedBookerInfo = {
        name:   document.getElementById('bookerName')?.value  || '',
        phone:  document.getElementById('bookerPhone')?.value || '',
        email:  document.getElementById('bookerEmail')?.value || '',
        source: document.getElementById('bookerSource')?.value || 'DIRECT',
        note:   document.getElementById('bookerNote')?.value  || '',
        bookingDate: document.getElementById('bookingDate')?.value || '',
      };
      _addingSlotMode = true;
      const modalEl = document.getElementById("apptModal");
      let modal = null;
      if (modalEl) {
        const existing = bootstrap.Modal.getInstance(modalEl);
        modal = existing || new bootstrap.Modal(modalEl);
      }
      if (modal) modal.hide();
      showToast('info', 'Chọn thêm slot', 'Hãy chọn thêm 1 slot trên lịch để thêm khách mới, rồi bấm "Tiếp tục"');
    };
  }

  // Không auto-fill booker → guest: dữ liệu khách và người đặt hoàn toàn độc lập
}

// ── Helpers để show/hide shared form ──
function _showSharedForm() {
  const f = document.getElementById('apptForm');
  if (f) { f.style.display = 'flex'; }
}
function _hideSharedForm() {
  const f = document.getElementById('apptForm');
  if (f) { f.style.display = 'none'; }
}
function _setCreateOnlyVisible(visible) {
  const bar = document.getElementById('createOnlyBar');
  if (bar) bar.style.display = visible ? 'flex' : 'none';
  const progress = document.getElementById('guestProgressLabel')?.closest('div[style*="margin-left:auto"]');
  // progress bar nằm trong createOnlyBar nên tự ẩn theo
}

function openCreateModal(prefill={}){
  try {
  const modalEl = document.getElementById("apptModal");
  const modalTitle = document.getElementById("modalTitle");
  const apptId = document.getElementById("apptId");
  const btnDelete = document.getElementById("btnDelete");
  const dayPicker = document.getElementById("dayPicker");

  resetModalError();
  modalTitle.textContent = "Tạo lịch hẹn";
  apptId.value = "";
  btnDelete.classList.add("d-none");
  document.getElementById('btnRebook')?.classList.add('d-none');
  // Reset online request state
  window._pendingOnlineRequestCode = '';

  const btnSaveText = document.getElementById("btnSaveText");
  if (btnSaveText) btnSaveText.textContent = "Tạo lịch hẹn";

  // Hiện shared form, bật create-only bar
  _showSharedForm();
  _setCreateOnlyVisible(true);

  // Label panel
  const lbl = document.getElementById('bookerPanelLabel');
  if (lbl) lbl.textContent = 'Người đặt lịch';

  // Reset người đặt
  document.getElementById('bookerName').value   = '';
  document.getElementById('bookerPhone').value  = '';
  document.getElementById('bookerEmail').value  = '';
  document.getElementById('bookerSource').value = 'DIRECT';
  const bookerNoteEl = document.getElementById('bookerNote');
  if (bookerNoteEl) bookerNoteEl.value = '';
  // Set ngày hẹn chung — mặc định là ngày đang xem trên grid
  const bookingDateEl = document.getElementById('bookingDate');
  if (bookingDateEl) bookingDateEl.value = prefill.day || dayPicker.value || '';

  // Reset danh sách khách
  _guestCount = 0;
  document.getElementById('guestList').innerHTML = '';

  if (prefill._fromRebook && prefill._booker) {
    _isRebookMode = true;
    const rb = prefill._booker;
    _fillBookerFields(rb);
    addGuestCard({
      name:        prefill._guest?.name      || '',
      phone:       prefill._guest?.phone     || '',
      email:       prefill._guest?.email     || '',
      serviceId:   prefill._guest?.serviceId || null,
      variantId:   prefill._guest?.variantId || null,
      date:        dayPicker.value,
    });
    modalTitle.textContent = 'Đặt lại lịch hẹn';
    _setCreateOnlyVisible(false);
    showToast('info', 'Đặt lại', 'Vui lòng chọn ngày, giờ và giường mới');
  } else if (prefill._fromOnlineRequest && prefill._booker) {
    _isRebookMode = false;
    // Lưu booking request code để submit sau
    window._pendingOnlineRequestCode = prefill._bookingRequestCode || '';
    const rb = prefill._booker;
    _fillBookerFields(rb, 'ONLINE');
    // Set ngày hẹn từ request
    const reqDate = prefill._guest?.date || '';
    if (reqDate && bookingDateEl) bookingDateEl.value = reqDate;
    addGuestCard({
      name:        prefill._guest?.name      || '',
      phone:       prefill._guest?.phone     || '',
      email:       prefill._guest?.email     || '',
      serviceId:   prefill._guest?.serviceId || null,
      variantId:   prefill._guest?.variantId || null,
      date:        reqDate || dayPicker.value || '',
      time:        prefill._guest?.time      || '',
      // roomId sẽ để trống — staff phải chọn
    });
    modalTitle.textContent = 'Xác nhận yêu cầu đặt lịch';
    if (btnSaveText) btnSaveText.textContent = 'Xác nhận & Tạo lịch';
    _setCreateOnlyVisible(false);
    showToast('info', 'Xác nhận yêu cầu', 'Vui lòng chọn giường và kiểm tra thông tin trước khi lưu');
  } else if (prefill._fromPending && prefill._blocks && prefill._blocks.length > 0) {
    _isRebookMode = false;
    if (prefill._restoreBooker) {
      const rb = prefill._restoreBooker;
      _fillBookerFields(rb);
      // Khôi phục ngày hẹn đã lưu
      const bookingDateEl3 = document.getElementById('bookingDate');
      if (bookingDateEl3 && rb.bookingDate) bookingDateEl3.value = rb.bookingDate;
    }
    // Set ngày hẹn chung từ block đầu tiên
    const bookingDateEl2 = document.getElementById('bookingDate');
    if (bookingDateEl2 && prefill._blocks[0]?.day) bookingDateEl2.value = prefill._blocks[0].day;
    prefill._blocks.forEach(pb => {
      addGuestCard({ date: pb.day, time: pb.time, roomId: pb.roomId, pendingDuration: pb.duration });
    });
  } else {
    _isRebookMode = false;
    addGuestCard({
      date: prefill.day || dayPicker.value,
      time: prefill.time || '',
      roomId: prefill.roomId || ''
    });
  }

  _initApplyAllBar();
  _updateGuestProgress();
  _resetAllCustomerState();

  // Xác định mode và apply TRƯỚC KHI show modal — không bị nhá UI
  const _isOnlineRequestMode = !!(prefill._fromOnlineRequest);
  const _isRebookModeLocal   = !!(prefill._fromRebook);
  const _shouldHideStatus    = _isOnlineRequestMode || _isRebookModeLocal;

  if (_shouldHideStatus) {
    _applyModalMode('request');
  } else {
    _applyModalMode('normal');
    _showSharedStatusBlock('NOT_ARRIVED', 'UNPAID', false);
  }
  // Reset payment tạm mỗi lần mở modal tạo mới
  _createModePayment = { payStatus: 'UNPAID', paymentMethod: '', paymentAmount: 0 };

  let modal = null;
  if (modalEl) {
    const existing = bootstrap.Modal.getInstance(modalEl);
    modal = existing || new bootstrap.Modal(modalEl);
  }
  if (!modal) {
    console.error('[openCreateModal] Không khởi tạo được Bootstrap Modal instance');
    return;
  }
  modalEl.addEventListener('shown.bs.modal', () => {

    // XÓA nút ba chấm và XÓA HOÀN TOÀN Email + Ghi chú trong form "Xác nhận" và "Đặt lại"
    if (_shouldHideStatus) {
      const guestItems = document.querySelectorAll('.gc-item');
      guestItems.forEach(item => {
        const expandBtn = item.querySelector('.gc-expand-btn');
        if (expandBtn) expandBtn.remove();
        const detailWrap = item.querySelector('.gc-detail-wrap');
        if (detailWrap) detailWrap.remove();
      });
    }
  }, { once: true });
  modal.show();
  } catch (err) {
    console.error('[openCreateModal] LỖI EXCEPTION:', err);
  }
}

/** Mở modal tạo lịch từ pending blocks đã chọn trên grid */
function openCreateModalFromPending() {
  if (!pendingBlocks.length) return;

  if (_addingSlotMode && _savedBookerInfo) {
    // Quay lại modal sau khi user chọn thêm slot — khôi phục booker info
    _addingSlotMode = false;
    openCreateModal({ _fromPending: true, _blocks: [...pendingBlocks], _restoreBooker: _savedBookerInfo });
    _savedBookerInfo = null;
  } else {
    openCreateModal({ _fromPending: true, _blocks: [...pendingBlocks] });
  }
}

async function openEditModal(id){
  const modalError = document.getElementById("modalError");
  resetModalError();

  // Bước 1: fetch appointment đơn để lấy bookingCode
  const result = await apiGet(`${API_BASE}/appointments/${id}/`);
  if (!result.success || !result.appointment) {
    // Fallback: tìm trong APPOINTMENTS cache
    const cached = APPOINTMENTS.find(x => x.id === id);
    if (cached) {
      await _openEditModalByBooking(cached.bookingCode, id);
    } else {
      _showModalError("Không tìm thấy lịch hẹn");
    }
    return;
  }

  const bookingCode = result.appointment.bookingCode;
  await _openEditModalByBooking(bookingCode, id);
}

/**
 * Fetch toàn bộ appointments trong booking rồi mở modal edit.
 * @param {string} bookingCode - mã booking
 * @param {string} clickedApptId - appointment_code được click (để set apptId)
 */
async function _openEditModalByBooking(bookingCode, clickedApptId) {
  const modalError = document.getElementById("modalError");

  if (!bookingCode) {
    // Không có bookingCode → fallback edit đơn lẻ
    const result = await apiGet(`${API_BASE}/appointments/${clickedApptId}/`);
    if (result.success && result.appointment) openEditModalWithData([result.appointment], clickedApptId);
    else { _showModalError("Không tìm thấy lịch hẹn"); }
    return;
  }

  const bkResult = await apiGet(`${API_BASE}/bookings/${bookingCode}/`);
  if (bkResult.success && bkResult.appointments && bkResult.appointments.length > 0) {
    openEditModalWithData(bkResult.appointments, clickedApptId);
  } else {
    // Fallback: chỉ load appointment được click
    const result = await apiGet(`${API_BASE}/appointments/${clickedApptId}/`);
    if (result.success && result.appointment) openEditModalWithData([result.appointment], clickedApptId);
    else { _showModalError("Không tìm thấy lịch hẹn"); }
  }
}

/**
 * Mở modal chỉnh sửa với danh sách appointments thuộc cùng 1 booking.
 * @param {Array} appointments - mảng appointment objects (từ API)
 * @param {string} clickedApptId - appointment_code được click (dùng để set apptId chính)
 */
function openEditModalWithData(appointments, clickedApptId) {
  // Lấy appointment đầu tiên làm "primary" để lấy booker info
  const primary = appointments.find(a => a.id === clickedApptId) || appointments[0];
  if (!primary) return;

  const modalEl    = document.getElementById("apptModal");
  const modalTitle = document.getElementById("modalTitle");
  const apptId     = document.getElementById("apptId");
  const btnDelete  = document.getElementById("btnDelete");

  resetModalError();

  // Title hiển thị booking code nếu có nhiều khách
  if (appointments.length > 1) {
    modalTitle.textContent = `Chỉnh sửa • ${primary.bookingCode || primary.id} (${appointments.length} khách)`;
  } else {
    modalTitle.textContent = `Chỉnh sửa • ${primary.id}`;
  }

  // apptId lưu appointment_code được click (dùng khi submit 1 appt)
  // Với multi-appt, lưu thêm bookingCode để submit handler biết
  apptId.value = primary.id;
  apptId.dataset.bookingCode  = primary.bookingCode || '';
  apptId.dataset.allApptIds   = JSON.stringify(appointments.map(a => a.id));
  // Lưu date/time/duration để validate timing khi submit
  apptId.dataset.apptDate     = primary.date  || '';
  apptId.dataset.apptTime     = primary.start || '';
  apptId.dataset.apptDuration = primary.durationMin || '60';

  // Nút Rebook / Xóa — dựa trên primary
  const btnRebook = document.getElementById('btnRebook');
  const st   = (primary.apptStatus  || '').toUpperCase();
  const bkSt = (primary.bookingStatus || '').toUpperCase();

  if (st === 'COMPLETED') {
    btnDelete.classList.add("d-none");
  } else {
    btnDelete.classList.remove("d-none");
  }
  if (btnRebook) {
    if (st === 'CANCELLED' || bkSt === 'CANCELLED' || bkSt === 'REJECTED') {
      btnRebook.classList.remove('d-none');
    } else {
      btnRebook.classList.add('d-none');
    }
  }

  const btnSaveText = document.getElementById("btnSaveText");
  if (btnSaveText) btnSaveText.textContent = "Lưu lịch hẹn";

  _showSharedForm();
  _setCreateOnlyVisible(false);

  // Trạng thái & thanh toán dùng của primary (hoặc appointment được click)
  // Luôn apply normal-mode trước để reset mọi trạng thái ẩn từ request-mode
  _applyModalMode('normal');
  _showSharedStatusBlock(primary.apptStatus || 'NOT_ARRIVED', primary.payStatus || 'UNPAID', true);

  const lbl = document.getElementById('bookerPanelLabel');
  if (lbl) lbl.textContent = 'Người đặt lịch';

  // Reset guest list
  _guestCount = 0;
  document.getElementById('guestList').innerHTML = '';
  _resetAllCustomerState();
  document.getElementById('selectedCustomerId').value = primary.customerId || '';

  // Điền booker panel từ primary (booker info chung cho cả booking)
  _fillBookerFields({
    name:   primary.bookerName  || '',
    phone:  primary.bookerPhone || '',
    email:  primary.bookerEmail || '',
    source: primary.source      || 'DIRECT',
    note:   primary.bookerNotes || '',
  });
  // Set ngày hẹn chung — lấy từ appointment đầu tiên
  const bookingDateEl = document.getElementById('bookingDate');
  if (bookingDateEl) bookingDateEl.value = primary.date || appointments[0]?.date || '';

  // Thêm 1 guest card cho MỖI appointment trong booking
  appointments.forEach(a => {
    addGuestCard({
      name:         a.customerName || '',
      phone:        a.phone || '',
      email:        a.email || '',
      serviceId:    a.serviceId,
      variantId:    a.variantId,
      roomId:       a.roomCode || a.roomId || '',
      date:         a.date || '',
      time:         a.start || '',
      apptStatus:   a.apptStatus || 'NOT_ARRIVED',
      payStatus:    a.payStatus || 'UNPAID',
      note:         a.bookerNotes || '',
      customerNote: a.customerNote || '',
      customerId:   a.customerId || '',
      _editMode:    true,
      _apptId:      a.id,   // lưu appointment_code vào card để submit đúng
    });
  });

  let modal = null;
  if (modalEl) {
    const existing = bootstrap.Modal.getInstance(modalEl);
    modal = existing || new bootstrap.Modal(modalEl);
  }
  if (modal) modal.show();

  // Load invoice summary sau khi modal mở (để cập nhật paid amount)
  if (primary.bookingCode) {
    _loadInvoiceSummary(primary.bookingCode);
  }
}

/**
 * Load invoice summary từ API và cập nhật payment summary trong edit modal.
 * Disable nút Xóa và Thanh toán trong lúc load để tránh race condition.
 */
async function _loadInvoiceSummary(bookingCode) {
  if (!bookingCode) return;

  // Disable các nút nhạy cảm trong lúc load
  const btnDelete   = document.getElementById('btnDelete');
  const btnInvoice  = document.getElementById('btnOpenInvoice');
  if (btnDelete)  { btnDelete._invoiceLoading  = true; btnDelete.disabled  = true; }
  if (btnInvoice) { btnInvoice._invoiceLoading = true; btnInvoice.disabled = true; }

  try {
    const result = await apiGet(`${API_BASE}/bookings/${bookingCode}/invoice/`);
    if (result.success && result.invoice) {
      const inv = result.invoice;
      // Cập nhật hidden select (dùng khi submit) và badge hiển thị
      const payStatusSel = document.getElementById('sharedPayStatus');
      if (payStatusSel && inv.paymentStatus) {
        _setSelectValue(payStatusSel, inv.paymentStatus, 'UNPAID');
      }
      _updatePaymentSummary();
    }
  } catch (e) {
    // Không có invoice → giữ nguyên trạng thái mặc định
  } finally {
    // Re-enable nút sau khi load xong (chỉ nếu chính hàm này đã disable)
    if (btnDelete  && btnDelete._invoiceLoading)  { btnDelete.disabled  = false; delete btnDelete._invoiceLoading; }
    if (btnInvoice && btnInvoice._invoiceLoading) {
      // Gọi lại _updateCreatePayBtn để set đúng trạng thái enable/disable theo dịch vụ
      _updateCreatePayBtn();
      delete btnInvoice._invoiceLoading;
    }
  }
}

const btnSave = document.getElementById("btnSave");
btnSave.addEventListener("click", ()=> {
  // Trigger submit trên form
  const f = document.getElementById('apptForm');
  if (f) f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
});

// Validate Form
document.getElementById('apptForm').addEventListener("submit", async (e)=>{
  e.preventDefault();
  const modalError = document.getElementById("modalError");
  const dayPicker = document.getElementById("dayPicker");

  if (isSubmitting) return;
  resetModalError();

  const apptId = document.getElementById("apptId");
  const id = apptId.value.trim();

  // ── Validate booker — chung cho cả CREATE và EDIT ──
  const nameVal  = document.getElementById('bookerName')?.value.trim() || '';
  const phoneVal = document.getElementById('bookerPhone')?.value.trim() || '';
  const emailVal = document.getElementById('bookerEmail')?.value.trim() || '';
  const bookerCheck = _validateBookerFields(nameVal, phoneVal, emailVal);
  if (!bookerCheck.ok) { _showModalError(bookerCheck.error); return; }

  // ── EDIT MODE — gửi 1 request batch atomic thay vì loop ──
  if (id) {
    const cards = _collectGuestCards();
    if (!cards.length) { _showModalError("Lỗi: không tìm thấy dữ liệu"); return; }

    // Validate từng guest card (FE-side, trước khi gửi)
    for (let i = 0; i < cards.length; i++) {
      const g = cards[i];
      const label = cards.length > 1 ? `Khách ${i + 1}: ` : '';
      const gItem = _getGuestItems()[i];
      // Validate date / time / room
      const dtrCheck = _validateGuestDateTimeRoom(g, i, cards.length);
      if (!dtrCheck.ok) {
        if (gItem && (dtrCheck.type === 'time' || dtrCheck.type === 'room')) _markRowError(gItem);
        _showModalError(dtrCheck.error); return;
      }
      // Kiểm tra thời gian quá khứ — chỉ chặn khi ngày/giờ thực sự thay đổi
      if (g.time && (g.date !== g.originalDate || g.time !== g.originalTime) && _isSlotInPast(g.date, g.time)) {
        _showModalError(`${label}Không thể tạo lịch hẹn vào thời gian này (giờ đã qua)`); return;
      }
      const basicCheck = _validateGuestBasic(g, i, cards.length);
      if (!basicCheck.ok) { _showModalError(basicCheck.error); return; }
    }
    const editNoteVal = document.getElementById('bookerNote')?.value || '';
    const noteCheck = _validateBookerNote(editNoteVal);
    if (!noteCheck.ok) { _showModalError(noteCheck.error); return; }

    const bookingCode = apptId.dataset.bookingCode || '';
    if (!bookingCode) {
      _showModalError("Không tìm thấy mã booking. Vui lòng đóng và mở lại."); return;
    }

    // BUG-007 FIX: Validate COMPLETED + PAID cho từng guest card riêng lẻ
    // (không dùng sharedApptStatus nữa — mỗi khách có trạng thái riêng)
    const editPayStatus = document.getElementById('sharedPayStatus')?.value || '';
    for (let i = 0; i < cards.length; i++) {
      const g = cards[i];
      const label = cards.length > 1 ? `Khách ${i + 1}: ` : '';
      const completedCheck = _validateCompletedStatus(g.apptStatus, editPayStatus);
      if (!completedCheck.ok) { _showModalError(`${label}${completedCheck.error}`); return; }
    }

    // BUG-007 FIX: Validate thời điểm ARRIVED / COMPLETED cho từng card
    const editTimingCheck = _validateAllCardsTiming(
      cards,
      (g)    => g.apptStatus,
      (g)    => g.date || apptId.dataset.apptDate || '',
      (g)    => g.time || apptId.dataset.apptTime || '',
      (g)    => Number(g._duration || apptId.dataset.apptDuration || 60),
    );
    if (!editTimingCheck.ok) { _showModalError(editTimingCheck.error); return; }

    // Xây dựng payload batch — BUG-02: 1 request duy nhất, atomic
    const batchPayload = {
      bookerName:  nameVal,
      bookerPhone: phoneVal.replace(/\D/g, ''),
      bookerEmail: emailVal,
      bookerNotes: document.getElementById('bookerNote')?.value.trim() || '',
      guests: cards.map(g => {
        const guest = {
          appointmentCode: g._apptId || '',
          customerName:    g.name || '',
          phone:           (g.phone || '').replace(/\D/g, ''),
          email:           g.email || '',
          variantId:       g.variantId || null,
          serviceId:       g.serviceId || null,
          customerId:      g.customerId || null,
          apptStatus:      g.apptStatus || 'NOT_ARRIVED',
        };
        // Chỉ gửi date/time/roomId khi thực sự thay đổi
        // Ngoại lệ: nếu variantId thay đổi, luôn gửi roomId hiện tại để backend
        // validate overlap với duration mới (dù room không đổi)
        const variantChanged = (g.variantId || null) !== (g._originalVariantId || null);
        if (g.date !== g.originalDate) guest.date = g.date;
        if (g.time !== g.originalTime) guest.time = g.time;
        if (g.roomId !== g.originalRoom || variantChanged) guest.roomId = g.roomId;
        return guest;
      }),
    };

    isSubmitting = true;
    setButtonLoading(btnSave, 'Đang cập nhật...');

    try {
      // BUG-02: 1 request duy nhất → atomic trên backend
      const result = await apiPost(`${API_BASE}/bookings/${bookingCode}/update-batch/`, batchPayload);

      if (!result.success) {
        _showModalError(_isConflictError(result) ? (result.error || MSG_APPROVE_CONFLICT) : (result.error || MSG_WEB_GENERIC_ERR));
        return;
      }

      // Thành công — cập nhật ghi chú hồ sơ khách
      await _updateCustomerNotes(cards);

      const modalEl = document.getElementById("apptModal");
      let modal = null;
      if (modalEl) {
        const existing = bootstrap.Modal.getInstance(modalEl);
        modal = existing || new bootstrap.Modal(modalEl);
      }
      if (modal) modal.hide();
      const firstDate = cards[0]?.date;
      if (firstDate && dayPicker.value !== firstDate) dayPicker.value = firstDate;
      await _refreshAll();
      showToast("success", "Thành công", "Cập nhật lịch hẹn thành công");

    } catch(err) {
      _showModalError(MSG_WEB_GENERIC_ERR);
    } finally {
      isSubmitting = false;
      resetButton(btnSave);
    }
    return;
  }

  // ── CREATE MODE (batch) ──
  const bookerName  = nameVal;
  const bookerPhone = phoneVal;
  const bookerEmail = emailVal;

  const guestCards = _collectGuestCards();
  if (!guestCards.length) {
    _showModalError("Vui lòng thêm ít nhất 1 khách");
    return;
  }

  // UC 14.3 — khi xác nhận request online, bắt buộc phải chọn phòng
  if (window._pendingOnlineRequestCode) {
    const missingRoom = guestCards.some(g => !g.roomId);
    if (missingRoom) {
      _showModalError('Vui lòng chọn giường trước khi xác nhận yêu cầu đặt lịch');
      return;
    }
  }

  // Validate thanh toán đã bị bỏ khỏi create mode — thanh toán qua invoice modal sau khi tạo lịch

  // Validate ghi chú lịch hẹn (max 1000 ký tự theo DB)
  const bookerNoteVal = document.getElementById('bookerNote')?.value || '';
  const noteCheck = _validateBookerNote(bookerNoteVal);
  if (!noteCheck.ok) { _showModalError(noteCheck.error); return; }

  // Lấy ngày hôm nay để check quá khứ
  const _todayStr = (() => { const t = new Date(); return `${t.getFullYear()}-${pad2(t.getMonth()+1)}-${pad2(t.getDate())}`; })();

  for (let i = 0; i < guestCards.length; i++) {
    const g = guestCards[i];
    const label = `Khách ${i + 1}`;
    const gItem = _getGuestItems()[i];

    // Validate date / time / room
    const dtrCheck = _validateGuestDateTimeRoom(g, i, guestCards.length);
    if (!dtrCheck.ok) {
      if (gItem && (dtrCheck.type === 'time' || dtrCheck.type === 'room')) _markRowError(gItem);
      _showModalError(dtrCheck.error); return;
    }
    // Validate ngày quá khứ (CREATE mode)
    if (g.date < _todayStr) {
      const prefix = guestCards.length > 1 ? `${label}: ` : '';
      _showModalError(`${prefix}Ngày hẹn không được nhỏ hơn ngày hôm nay`); return;
    }
    // Kiểm tra thời gian quá khứ — chặn tạo lịch vào giờ đã qua
    if (_isSlotInPast(g.date, g.time)) {
      const prefix = guestCards.length > 1 ? `${label}: ` : '';
      _showModalError(`${prefix}Không thể tạo lịch hẹn vào thời gian này (giờ đã qua)`); return;
    }
    const basicCheck = _validateGuestBasic(g, i, guestCards.length);
    if (!basicCheck.ok) {
      if (gItem) _markRowError(gItem);
      _showModalError(basicCheck.error); return;
    }
  }

  // V-11: Check cross-guest conflict — 2 khách cùng phòng cùng giờ overlap
  if (guestCards.length > 1) {
    for (let i = 0; i < guestCards.length; i++) {
      for (let j = i + 1; j < guestCards.length; j++) {
        const a = guestCards[i], b = guestCards[j];
        if (!a.roomId || !b.roomId || a.roomId !== b.roomId) continue;
        if (!a.time || !b.time) continue;
        // Tính duration từ variant (fallback 60)
        const durA = Number(a._duration) || 60;
        const durB = Number(b._duration) || 60;
        const aStart = minutesFromStart(a.time);
        const aEnd   = aStart + durA;
        const bStart = minutesFromStart(b.time);
        const bEnd   = bStart + durB;
        if (overlaps(aStart, aEnd, bStart, bEnd)) {
          _showModalError(`Khách ${i+1} và Khách ${j+1} trùng giường và thời gian. Vui lòng chọn giường hoặc giờ khác.`); return;
        }
      }
    }
  }

  // Validate trạng thái "Hoàn thành"
  const createApptStatus = document.getElementById('sharedApptStatus')?.value || '';
  if (createApptStatus === 'COMPLETED') {
    const hasService = guestCards.some(g => g.serviceId);
    if (!hasService) {
      _showModalError("Không thể hoàn thành lịch hẹn khi chưa có dịch vụ"); return;
    }
    // BUG-001: COMPLETED phải đi kèm PAID — kiểm tra _createModePayment trước khi submit
    const completedCheck = _validateCompletedStatus('COMPLETED', _createModePayment.payStatus);
    if (!completedCheck.ok) {
      _showModalError(completedCheck.error + '. Vui lòng thanh toán trước.'); return;
    }
  }

  // Validate thời điểm chuyển trạng thái ARRIVED / COMPLETED (create mode)
  // Loop tất cả guestCards — mỗi khách có thể khác giờ/duration
  if (createApptStatus === 'ARRIVED' || createApptStatus === 'COMPLETED') {
    const createTimingCheck = _validateAllCardsTiming(
      guestCards,
      ()     => createApptStatus,
      (g)    => g.date,
      (g)    => g.time,
      (g)    => Number(g._duration) || 60,
    );
    if (!createTimingCheck.ok) { _showModalError(createTimingCheck.error); return; }
  }

  // UC 14.3 — Tách luồng: xác nhận request online vs tạo lịch thường
  const _onlineRequestCode = window._pendingOnlineRequestCode || '';

  if (_onlineRequestCode) {
    // ── LUỒNG XÁC NHẬN REQUEST ONLINE ──
    // Gọi endpoint riêng: update appointment gốc + confirm booking gốc (không tạo booking mới)
    const confirmPayload = {
      guests: guestCards.map(g => ({
        name:      g.name,
        phone:     g.phone,
        email:     g.email,
        serviceId: g.serviceId || null,
        variantId: g.variantId || null,
        roomId:    g.roomId,
        date:      g.date,
        time:      g.time,
        customerId: g.customerId || null,
      })),
    };

    isSubmitting = true;
    setButtonLoading(btnSave, 'Đang xác nhận...');
    try {
      const result = await apiPost(`${API_BASE}/booking-requests/${_onlineRequestCode}/confirm/`, confirmPayload);
      if (result.success) {
        await _updateCustomerNotes(guestCards);
        const modalEl = document.getElementById("apptModal");
        const existing = modalEl ? bootstrap.Modal.getInstance(modalEl) : null;
        const modal = existing || (modalEl ? new bootstrap.Modal(modalEl) : null);
        if (modal) modal.hide();
        _addingSlotMode = false;
        _savedBookerInfo = null;
        window._pendingOnlineRequestCode = '';
        _isRebookMode = false;
        const firstDate = guestCards[0]?.date;
        if (firstDate && dayPicker.value !== firstDate) dayPicker.value = firstDate;
        clearPendingBlocks();
        await _refreshAll();
        showToast('success', 'Thành công', MSG_APPROVE_SUCCESS);
      } else {
        _showModalError(_isConflictError(result, true) ? (result.error || MSG_WEB_CONFLICT) : (result.error || MSG_WEB_GENERIC_ERR));
      }
    } catch (err) {
      _showModalError(MSG_WEB_GENERIC_ERR);
    } finally {
      isSubmitting = false;
      resetButton(btnSave);
    }
    return;
  }

  // ── LUỒNG TẠO LỊCH THƯỜNG ──
  const batchPayload = {
    booker: {
      name:          bookerName,
      phone:         bookerPhone.replace(/\D/g, ''),
      email:         bookerEmail,
      source:        document.getElementById('bookerSource')?.value || 'DIRECT',
      notes:         document.getElementById('bookerNote')?.value.trim() || '',
      payStatus:     _createModePayment.payStatus     || 'UNPAID',
      paymentMethod: _createModePayment.paymentMethod || '',
      paymentAmount: _createModePayment.paymentAmount || 0,
      // BUG-001 FIX: Gửi discount để backend áp dụng khi tạo invoice
      discountType:  _createModePayment.discountType  || 'NONE',
      discountValue: _createModePayment.discountValue || 0,
      fromAdmin:     true,  // Admin tạo/rebook → backend set CONFIRMED, không cần xác nhận
    },
    guests: guestCards,
  };

  isSubmitting = true;
  setButtonLoading(btnSave, 'Đang tạo lịch...');
  try {
    const result = await apiPost(`${API_BASE}/appointments/create-batch/`, batchPayload);
    if (result.success) {
      // Cập nhật ghi chú hồ sơ khách (await để xử lý confirm xóa note)
      await _updateCustomerNotes(guestCards);

      const modalEl = document.getElementById("apptModal");
      let modal = null;
      if (modalEl) {
        const existing = bootstrap.Modal.getInstance(modalEl);
        modal = existing || new bootstrap.Modal(modalEl);
      }
      if (modal) modal.hide();      _addingSlotMode = false;
      _savedBookerInfo = null;
      const firstDate = guestCards[0]?.date;
      if (firstDate && dayPicker.value !== firstDate) dayPicker.value = firstDate;
      clearPendingBlocks();
      await _refreshAll();
      const successMsg = _isRebookMode ? MSG_REBOOK_SUCCESS : (result.message || 'Tạo lịch hẹn thành công');
      _isRebookMode = false;
      showToast("success", "Thành công", successMsg);
      if (result.errors?.length) {
        setTimeout(() => showToast("warning", "Một số lỗi", result.errors.join(' | ')), 1500);
      }
    } else {
      _showModalError(_isConflictError(result) ? (result.error || MSG_WEB_CONFLICT) : (result.error || MSG_WEB_GENERIC_ERR));
    }
    } catch(err) {
      _showModalError(MSG_WEB_GENERIC_ERR);
  } finally {
    isSubmitting = false;
    resetButton(btnSave);
  }
});

// ===== NÚT ĐẶT LẠI trong modal =====
document.getElementById('btnRebook')?.addEventListener('click', async () => {
  const apptId = document.getElementById("apptId");
  const id = apptId.value.trim();
  if (!id) return;
  await rebookAppointment(id);
});

const btnDelete = document.getElementById("btnDelete");
btnDelete.addEventListener("click", async ()=>{
  const apptId = document.getElementById("apptId");
  const id = apptId.value.trim();
  if (isSubmitting || !id) return;

  // Kiểm tra hóa đơn đã thanh toán hoặc đã hoàn tiền — không cho phép xóa
  const payStatus = document.getElementById('sharedPayStatus')?.value || '';
  if (payStatus === 'PAID' || payStatus === 'PARTIAL' || payStatus === 'REFUNDED') {
    const payMsg = payStatus === 'PARTIAL'
      ? 'Lịch hẹn đang có thanh toán một phần, không thể xóa.'
      : 'Lịch hẹn đã thanh toán, không thể xóa.';
    showToast('error', 'Không thể xóa', payMsg);
    return;
  }

  // Đọc info từ guest card duy nhất (edit mode)
  const firstCard = _getGuestItems()[0];
  const customerNameVal = firstCard?.querySelector('.gc-name')?.value.trim()
    || document.getElementById('bookerName')?.value.trim() || '';
  const timeVal = firstCard?.dataset.slotTime || '';

  const infoEl = document.getElementById('deleteAppointmentInfo');
  if (infoEl) {
    const parts = [];
    if (customerNameVal) parts.push(customerNameVal);
    if (timeVal) parts.push(timeVal);
    infoEl.textContent = parts.join(' · ');
    infoEl.style.display = parts.length ? '' : 'none';
  }

  // Dùng instance đã khởi tạo sẵn — tránh lỗi Bootstrap tạo nhiều instance
  const deleteModal = window.deleteAppointmentModal
    || new bootstrap.Modal(document.getElementById('deleteAppointmentModal'));

  const confirmDeleteBtn = document.getElementById('confirmDeleteAppointmentBtn');
  if (confirmDeleteBtn) {
    // Xóa listener cũ bằng cách clone node để tránh duplicate
    const newBtn = _replaceWithClone(confirmDeleteBtn);

    newBtn.addEventListener('click', async () => {
      deleteModal.hide();

      isSubmitting = true;
      setButtonLoading(btnDelete, 'Đang xóa...');

      try {
        const result = await apiPost(`${API_BASE}/appointments/${id}/delete/`, {});
        if (result.success) {
          const modalEl = document.getElementById("apptModal");
          if (modalEl) {
            const existing = bootstrap.Modal.getInstance(modalEl);
            if (existing) existing.hide();
          }
          await _refreshAll();
          showToast("success", "Thành công", result.message || "Đã xóa lịch hẹn");
        } else {
          showToast("error", "Lỗi", result.error || "Không thể xóa lịch hẹn");
        }
      } catch (err) {
        console.error('Delete error:', err);
        showToast("error", "Lỗi", "Xóa thất bại, vui lòng thử lại sau.");
      } finally {
        isSubmitting = false;
        resetButton(btnDelete);
      }
    });
  }

  deleteModal.show();
});

// ============================================================
// SECTION 12: DATE NAVIGATION
// ============================================================
const dayPicker = document.getElementById("dayPicker");
const btnPrev = document.getElementById("btnPrev");
const btnNext = document.getElementById("btnNext");
const btnToday = document.getElementById("btnToday");

function setDay(d){ dayPicker.value = d; refreshData(); }
function todayISO(){ const t = new Date(); return `${t.getFullYear()}-${pad2(t.getMonth()+1)}-${pad2(t.getDate())}`; }
function shiftDay(delta){ const d = new Date(dayPicker.value + "T00:00:00"); d.setDate(d.getDate()+delta); setDay(`${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`); }

// ===== REFRESH DATA =====
async function refreshData(){
  try {
    await loadAppointments(dayPicker.value);
  } catch (err) {
    // Network lỗi hoàn toàn (offline, DNS fail...) — UC 14.2 exception flow 5a
    console.error('refreshData error:', err);
    APPOINTMENTS = [];
    _gridLoadError = true;
    showToast('error', 'Lỗi', MSG_LOAD_APPT_ERROR);
  }
  renderGrid();
}

// ============================================================
// SECTION 13: SEARCH MODAL
// ============================================================
function initSearchModal() {
  const searchModalEl = document.getElementById('searchModal');
  if (!searchModalEl) return;

  const searchModal = new bootstrap.Modal(searchModalEl);
  const resetSearchModal = () => _resetSearchModalState(searchModalEl);

  searchModalEl.addEventListener('hidden.bs.modal', resetSearchModal);

  // Nút mở modal
  const btnOpen = document.getElementById('btnOpenSearch');
  if (btnOpen) {
    btnOpen.addEventListener('click', () => {
      _fillSearchDropdowns();
      searchModal.show();
    });
  }

  // Nút Tìm kiếm
  const btnDo = document.getElementById('btnDoSearch');
  if (btnDo) btnDo.addEventListener('click', () => _doSearch());

  // Nút Đặt lại
  const btnReset = document.getElementById('btnResetSearch');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      _resetSearchModalState(searchModalEl);
      refreshData();        // Refresh grid lịch theo phòng về toàn bộ danh sách
      renderWebRequests();  // Refresh tab Yêu cầu đặt lịch
    });
  }

  // Enter trong các input → trigger search
  ['srchName','srchPhone','srchEmail','srchCode','srchDateFrom','srchDateTo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') _doSearch(); });
  });
}

function _resetSearchModalState(searchModalEl) {
  const root = searchModalEl || document.getElementById('searchModal');
  if (!root) return;

  root.querySelectorAll('input').forEach(input => {
    if (input.type === 'checkbox' || input.type === 'radio') input.checked = false;
    else input.value = '';
  });

  root.querySelectorAll('select').forEach(select => {
    select.selectedIndex = 0;
  });

  delete root.dataset.currentFilters;
  _setSearchWarning(false);

  const results = root.querySelector('#srchResults');
  if (results) {
    results.innerHTML = `
      <div class="text-center text-muted py-5" id="srchPlaceholder">
        <i class="fas fa-search fa-2x mb-2 d-block opacity-25"></i>
        Nhập điều kiện và bấm Tìm kiếm
      </div>`;
  }
}

function _fillSearchDropdowns() {
  // Điền dropdown dịch vụ
  const srchSvc = document.getElementById('srchService');
  if (srchSvc && srchSvc.options.length <= 1 && SERVICES.length) {
    _populateSelect(srchSvc, SERVICES, 'id', 'name', null);
  }
  // Điền dropdown giường
  const srchRoom = document.getElementById('srchRoom');
  if (srchRoom && srchRoom.options.length <= 1 && ROOMS.length) {
    _populateSelect(srchRoom, ROOMS, 'id', 'name', null);
  }
}

function _setSearchWarning(show, text) {
  const warn = document.getElementById('srchWarning');
  const warnText = document.getElementById('srchWarningText');
  if (!warn) return;
  if (show) {
    if (warnText && text) warnText.textContent = text;
    warn.classList.remove('d-none');
  } else {
    warn.classList.add('d-none');
  }
}

async function _doSearch() {
  const name      = (document.getElementById('srchName')     || {}).value?.trim() || '';
  const phone     = (document.getElementById('srchPhone')    || {}).value?.trim() || '';
  const email     = (document.getElementById('srchEmail')    || {}).value?.trim() || '';
  const code      = (document.getElementById('srchCode')     || {}).value?.trim() || '';
  const service   = (document.getElementById('srchService')  || {}).value || '';
  const status    = (document.getElementById('srchStatus')   || {}).value || '';
  const source    = (document.getElementById('srchSource')   || {}).value || '';
  const room      = (document.getElementById('srchRoom')     || {}).value || '';
  const dateFrom  = (document.getElementById('srchDateFrom') || {}).value || '';
  const dateTo    = (document.getElementById('srchDateTo')   || {}).value || '';

  const hasCondition = name || phone || email || code || service || status || source || room || dateFrom || dateTo;
  if (!hasCondition) {
    _setSearchWarning(true, 'Vui lòng nhập điều kiện tìm kiếm');
    return;
  }

  if (dateFrom && dateTo && dateFrom > dateTo) {
    _setSearchWarning(true, 'Khoảng ngày tìm kiếm không hợp lệ.');
    return;
  }

  _setSearchWarning(false);

  const resultsEl = document.getElementById('srchResults');
  if (resultsEl) {
    resultsEl.innerHTML = `<div class="text-center text-muted py-5"><i class="fas fa-spinner fa-spin fa-2x mb-2 d-block"></i>Đang tìm kiếm...</div>`;
  }

  const params = new URLSearchParams();
  if (name)     params.append('name', name);
  if (phone)    params.append('phone', phone);
  if (email)    params.append('email', email);
  if (code)     params.append('code', code);
  if (service)  params.append('service', service);
  if (status)   params.append('status', status);
  if (source)   params.append('source', source);
  if (room)     params.append('room', room);
  if (dateFrom) params.append('date_from', dateFrom);
  if (dateTo)   params.append('date_to', dateTo);

  const searchModalEl = document.getElementById('searchModal');
  if (searchModalEl) searchModalEl.dataset.currentFilters = params.toString();

  const result = await apiGet(`${API_BASE}/appointments/search/?${params.toString()}`);

  if (!result.success) {
    if (resultsEl) resultsEl.innerHTML = `<div class="alert alert-danger m-3"><i class="fas fa-exclamation-circle me-2"></i>Không thể tìm kiếm lịch hẹn. Vui lòng thử lại sau.</div>`;
    return;
  }

  const appts = result.appointments || [];
  if (!appts.length) {
    if (resultsEl) resultsEl.innerHTML = `<div class="text-center text-muted py-5"><i class="fas fa-inbox fa-2x mb-2 d-block opacity-25"></i>Không tìm thấy lịch hẹn phù hợp.</div>`;
    return;
  }

  const rows = appts.map(a => {
    const statusBadge = `<span class="badge ${_srchStatusBadgeClass(a.apptStatus)}">${statusLabel(a.apptStatus)}</span>`;
    const svcDisplay = a.serviceCode
      ? `<span class="fw-semibold">${_esc(a.serviceCode)}</span>${a.service ? ` <span class="text-muted small">— ${_esc(a.service)}</span>` : ''}`
      : (a.service ? _esc(a.service) : '<span class="text-muted fst-italic">Chưa chọn DV</span>');
    return `
      <div class="srch-result-item d-flex align-items-center gap-3 px-3 py-2 border-bottom"
           style="cursor:pointer;transition:background .15s;"
           onmouseenter="this.style.background='#f0f7ff'" onmouseleave="this.style.background=''"
           onclick="window._srchGoToAppt('${_esc(a.id)}', '${_esc(a.date)}')">
        <div style="min-width:80px;">
          <div class="fw-semibold small">${_esc(a.date)}</div>
          <div class="text-muted small">${_esc(a.start)}${a.end ? '–'+_esc(a.end) : ''}</div>
        </div>
        <div style="min-width:70px;" class="text-muted small">
          <i class="fas fa-bed me-1"></i>${_esc(a.roomName || a.roomCode || '—')}
        </div>
        <div style="flex:1;min-width:0;">
          <div class="fw-semibold text-truncate">${_esc(a.customerName || a.bookerName || '—')}</div>
          <div class="text-muted small text-truncate">${svcDisplay}</div>
        </div>
        <div style="min-width:90px;text-align:right;">${statusBadge}</div>
        <div class="text-muted" style="font-size:.75rem;min-width:60px;text-align:right;">
          <span class="text-primary small fw-semibold">${_esc(a.id)}</span>
        </div>
      </div>`;
  }).join('');

  if (resultsEl) {
    resultsEl.innerHTML = `
      <div class="px-3 py-2 border-bottom bg-light d-flex align-items-center justify-content-between">
        <span class="small text-muted"><i class="fas fa-list me-1"></i>Tìm thấy <strong>${appts.length}</strong> kết quả${appts.length === 100 ? ' (hiển thị tối đa 100)' : ''}</span>
        <span class="small text-muted">Click vào kết quả để xem trên lịch</span>
      </div>
      ${rows}`;
  }
}

function _srchStatusBadgeClass(s) {
  const sl = (s || '').toLowerCase();
  if (sl === 'pending')   return 'bg-warning text-dark';
  if (sl === 'confirmed') return 'bg-info text-dark';
  if (sl === 'not_arrived') return 'bg-secondary';
  if (sl === 'arrived')   return 'bg-info text-dark';
  if (sl === 'completed') return 'bg-success';
  if (sl === 'cancelled') return 'bg-secondary';
  if (sl === 'rejected')  return 'bg-danger';
  return 'bg-secondary';
}

window._srchGoToAppt = async function(apptId, apptDate) {
  // Đóng modal tìm kiếm
  const searchModalEl = document.getElementById('searchModal');
  if (searchModalEl) {
    const searchModal = bootstrap.Modal.getInstance(searchModalEl);
    if (searchModal) searchModal.hide();
  }

  // Chuyển grid sang đúng ngày
  if (apptDate && dayPicker) {
    dayPicker.value = apptDate;
    await refreshData();
  }

  // Highlight block trên grid
  setTimeout(() => {
    const block = document.querySelector(`.appt[data-id="${CSS.escape(apptId)}"]`);
    if (block) {
      block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      block.classList.add('appt-highlight');
      setTimeout(() => block.classList.remove('appt-highlight'), 2500);
    }
  }, 350);
};

// ============================================================
// SECTION 14: CUSTOMER CANCEL POLLING
// ============================================================
(function initCustomerCancelPolling() {
  // Lưu các mã lịch đã toast để không hiện lại
  const _seenCodes = new Set();

  function _showCancelToast(customerName, code) {
    const container = document.getElementById('cancelToastContainer') || _createToastContainer();
    const id = `ct_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const el = document.createElement('div');
    el.id = id;
    el.style.cssText = `
      display:flex;align-items:flex-start;gap:10px;
      background:#fff;border:1px solid #fecdd3;border-left:4px solid #ef4444;
      border-radius:10px;padding:12px 14px;box-shadow:0 4px 16px rgba(0,0,0,.12);
      min-width:280px;max-width:360px;animation:slideInToast .3s ease;
    `;
    el.innerHTML = `
      <div style="flex-shrink:0;width:32px;height:32px;border-radius:50%;background:#fee2e2;
                  display:flex;align-items:center;justify-content:center;color:#ef4444;">
        <i class="fas fa-user-times" style="font-size:13px;"></i>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:2px;">Khách vừa hủy lịch</div>
        <div style="font-size:12px;color:#6b7280;">
          <span style="font-weight:600;color:#374151;">${customerName}</span>
          đã hủy lịch <span style="font-weight:600;color:#ef4444;">${code}</span>
        </div>
      </div>
      <button onclick="document.getElementById('${id}').remove()"
              style="flex-shrink:0;background:none;border:none;cursor:pointer;color:#9ca3af;font-size:16px;line-height:1;padding:0;">×</button>
    `;
    container.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 8000);
  }

  function _createToastContainer() {
    const c = document.createElement('div');
    c.id = 'cancelToastContainer';
    c.style.cssText = `
      position:fixed;bottom:24px;right:24px;z-index:9999;
      display:flex;flex-direction:column;gap:8px;align-items:flex-end;
    `;
    // Inject animation keyframe once
    if (!document.getElementById('cancelToastStyle')) {
      const s = document.createElement('style');
      s.id = 'cancelToastStyle';
      s.textContent = `@keyframes slideInToast{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}`;
      document.head.appendChild(s);
    }
    document.body.appendChild(c);
    return c;
  }

  async function _pollCancelledByCustomer() {
    try {
      const res = await fetch('/api/appointments/customer-cancelled-recent/?minutes=10', {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !data.appointments) return;
      data.appointments.forEach(a => {
        if (!_seenCodes.has(a.code)) {
          _seenCodes.add(a.code);
          _showCancelToast(a.customerName, a.code);
        }
      });
    } catch (e) { /* silent */ }
  }

  // Chạy lần đầu sau 5s (tránh spam khi mới load), sau đó mỗi 30s
  setTimeout(() => {
    _pollCancelledByCustomer();
    setInterval(_pollCancelledByCustomer, 30000);
  }, 5000);
})();

// ============================================================
// SECTION 15: INITIALIZATION
// ============================================================
document.addEventListener("DOMContentLoaded", async ()=>{
  const modalEl = document.getElementById("apptModal");
  const toastEl = document.getElementById("toast");
  const webCount = document.getElementById("webCount");
  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const grid = document.getElementById("grid");

  // Initialize customer search (stub — badges đã bỏ)
  initCustomerSearch();

  // Initialize delete modal
  const deleteModalEl = document.getElementById('deleteAppointmentModal');
  if (deleteModalEl) {
    window.deleteAppointmentModal = new bootstrap.Modal(deleteModalEl);
  }

  if(sidebarToggle) sidebarToggle.addEventListener("click", ()=> sidebar.classList.toggle("show"));

  // ── Render header timeline NGAY LẬP TỨC trước khi fetch ──
  // Để layout ổn định, không bị trống trong lúc chờ API
  dayPicker.value = todayISO();
  renderHeader();
  showGridLoading();   // hiện skeleton trong vùng grid

  // ── Fetch song song rooms + services để giảm thời gian chờ ──
  await Promise.all([loadRooms(), loadServices()]);

  fillServiceFilter();

  // ── Fetch appointments + web requests song song ──
  await Promise.all([
    refreshData(),
    renderWebRequests(),
  ]);

  // ===== POLLING: cập nhật badge pending count mỗi 15 giây =====
  // Track count lần trước để phát hiện thay đổi
  let _lastPendingCount = -1;

  setInterval(async () => {
    try {
      const res = await apiGet(`${API_BASE}/booking/pending-count/`);
      if (res.success && typeof res.count === 'number') {
        // Cập nhật badge
        _setWebCountBadge(res.count);

        // Nếu count thay đổi so với lần trước → reload danh sách yêu cầu
        // (không reset filter, chỉ gọi lại renderWebRequests với filter hiện tại)
        if (_lastPendingCount !== -1 && res.count !== _lastPendingCount) {
          renderWebRequests();
        }
        _lastPendingCount = res.count;
      }
    } catch(e) { /* silent */ }
  }, 15000);

  if(btnToday) btnToday.addEventListener("click", ()=> setDay(todayISO()));
  if(btnPrev) btnPrev.addEventListener("click", ()=> shiftDay(-1));
  if(btnNext) btnNext.addEventListener("click", ()=> shiftDay(1));
  if(dayPicker) dayPicker.addEventListener("change", ()=> { clearPendingBlocks(); refreshData(); updateCurrentTimeLine(); });

  // ── Current time line: interval realtime + resize ──
  startCurrentTimeLineInterval();
  window.addEventListener('resize', updateCurrentTimeLine);

  // ===== ACTION BAR — Pending blocks =====
  const btnCancelPending   = document.getElementById('btnCancelPending');
  const btnContinuePending = document.getElementById('btnContinuePending');

  if (btnCancelPending) {
    btnCancelPending.addEventListener('click', () => {
      _addingSlotMode = false;
      _savedBookerInfo = null;
      clearPendingBlocks();
      showToast('info', 'Đã hủy', 'Đã xóa toàn bộ slot đang chọn');
    });
  }

  if (btnContinuePending) {
    btnContinuePending.addEventListener('click', () => {
      if (!pendingBlocks.length) return;
      openCreateModalFromPending();
    });
  }

  if (modalEl) {
    modalEl.addEventListener('hidden.bs.modal', () => {
      if (!isSubmitting && !_addingSlotMode) {
        clearPendingBlocks();
      }
      // Reset online request state khi modal đóng (kể cả khi cancel)
      window._pendingOnlineRequestCode = '';
    });
  }

  // Filter bar — tab Yêu cầu đặt lịch (dùng FilterManager chung)
  const webFM = new FilterManager({
    fields:   ['webSearchInput', 'webServiceFilter', 'webDateFilter'],
    btnId:    'webFilterBtn',
    searchId: 'webSearchInput',
    onApply:  () => renderWebRequests(),
  });

  // ===== SEARCH MODAL =====
  initSearchModal();

  // ===== INVOICE MODAL =====
  _initInvoiceModal();

  window.openEditModal = openEditModal;
  window.renderWebRequests = renderWebRequests;
});

// ============================================================
// SECTION 14: INVOICE MODAL
// ============================================================

/** State của invoice modal */
let _invoiceData = null; // dữ liệu invoice hiện tại

/**
 * Lưu trạng thái thanh toán tạm thời cho create mode.
 * Được set khi user xác nhận trong _openCreatePayModal(),
 * được đọc khi submit batchPayload.
 */
let _createModePayment = {
  payStatus:     'UNPAID',
  paymentMethod: '',
  paymentAmount: 0,
};

/**
 * Cập nhật trạng thái enable/disable nút "Thanh toán" trong create mode.
 * Chỉ enable khi ít nhất 1 khách đã chọn đủ dịch vụ + gói.
 * Gọi mỗi khi variant thay đổi hoặc guest card thêm/xóa.
 */
function _updateCreatePayBtn() {
  const btnOpen = document.getElementById('btnOpenInvoice');
  if (!btnOpen) return;

  const items = _getGuestItems();
  const hasReadyGuest = items.some(item => {
    const svcVal = item.querySelector('.gc-service')?.value || '';
    const varVal = item.querySelector('.gc-variant')?.value || '';
    return svcVal && varVal;
  });

  btnOpen.disabled = !hasReadyGuest;
  btnOpen.title    = hasReadyGuest
    ? 'Nhập thông tin thanh toán'
    : 'Vui lòng chọn dịch vụ và gói dịch vụ trước khi thanh toán';

  // Hiển thị rõ trạng thái disabled/enabled
  if (hasReadyGuest) {
    btnOpen.style.opacity        = '';
    btnOpen.style.filter         = '';
    btnOpen.style.cursor         = '';
    btnOpen.style.pointerEvents  = '';
  } else {
    btnOpen.style.opacity        = '0.5';
    btnOpen.style.filter         = '';
    btnOpen.style.cursor         = 'not-allowed';
    btnOpen.style.pointerEvents  = 'none';
  }
}

/**
 * Mở modal thanh toán tạm cho create mode.
 * Tính tiền từ guestCards hiện tại (dựa trên SERVICES data),
 * cho phép nhập phương thức + số tiền, lưu vào _createModePayment.
 */
function _openCreatePayModal() {
  // Kiểm tra lại — phải có ít nhất 1 khách đủ dịch vụ + gói
  const liveData = _buildLinesFromGuestCards();
  if (!liveData || !liveData.lines.length) {
    showToast('warning', 'Chưa đủ thông tin', 'Vui lòng chọn dịch vụ và gói dịch vụ trước khi thanh toán.');
    return;
  }

  const { lines, subtotal } = liveData;

  // Dùng lại invoiceModal với data tạm — không cần bookingCode
  _invoiceData = {
    _bookingCode:   '',   // rỗng = create mode
    _createMode:    true,
    invoiceCode:    '',
    bookingCode:    '',
    bookerName:     document.getElementById('bookerName')?.value.trim() || '',
    bookerPhone:    document.getElementById('bookerPhone')?.value.trim() || '',
    lines,
    subtotal:       String(subtotal),
    discountType:   'NONE',
    discountValue:  '0',
    discountAmount: '0',
    finalAmount:    String(subtotal),
    paidAmount:     String(_createModePayment.paymentAmount || 0),
    remaining:      String(Math.max(subtotal - (_createModePayment.paymentAmount || 0), 0)),
    paymentStatus:  _createModePayment.payStatus || 'UNPAID',
  };

  _renderInvoiceModal(_invoiceData);

  // Đổi label nút xác nhận cho create mode
  const btnLbl = document.getElementById('btnConfirmPaymentLabel');
  if (btnLbl) btnLbl.textContent = 'Xác nhận';

  const invoiceModalEl = document.getElementById('invoiceModal');
  const invoiceModal   = bootstrap.Modal.getInstance(invoiceModalEl) || new bootstrap.Modal(invoiceModalEl);
  invoiceModal.show();
}

/**
 * Khởi tạo Invoice Modal — bind events.
 */
/**
 * BUG-008 FIX: Kiểm tra xem có guest card nào trong edit mode có thay đổi chưa lưu không.
 *
 * So sánh giá trị hiện tại của variant, room, date, time với giá trị gốc
 * được lưu trong dataset khi modal mở (originalVariantId, originalRoom,
 * originalDate, originalTime).
 *
 * Cũng kiểm tra booker info (name, phone, email, notes) so với giá trị
 * được load từ API khi mở modal.
 *
 * @returns {boolean} true nếu có thay đổi chưa lưu
 */
function _hasUnsavedGuestChanges() {
  const apptIdEl = document.getElementById('apptId');
  // Chỉ áp dụng trong edit mode (có bookingCode)
  if (!apptIdEl?.dataset.bookingCode) return false;

  const items = _getGuestItems();
  for (const item of items) {
    const currentVariant = item.querySelector('.gc-variant')?.value || '';
    const originalVariant = item.dataset.originalVariantId || '';
    if (currentVariant !== originalVariant) return true;

    const currentRoom = item.dataset.slotRoom || item.querySelector('.gc-room')?.value || '';
    const originalRoom = item.dataset.originalRoom || '';
    if (currentRoom !== originalRoom) return true;

    // Ngày hẹn — BUG-A08 FIX: ưu tiên per-card slotDate thay vì bookingDate (shared).
    // bookingDate chỉ phản ánh ngày khách đầu tiên — dùng nó cho tất cả cards
    // sẽ luôn trả true cho các khách có ngày khác nhau dù không có thay đổi thực sự.
    const currentDate = item.dataset.slotDate
      || item.querySelector('.gc-date')?.value
      || document.getElementById('bookingDate')?.value
      || '';
    const originalDate = item.dataset.originalDate || '';
    if (originalDate && currentDate !== originalDate) return true;

    const currentTime = item.querySelector('.gc-time-input')?.value
      || item.dataset.slotTime
      || item.querySelector('.gc-time')?.value
      || '';
    const originalTime = item.dataset.originalTime || '';
    if (originalTime && currentTime !== originalTime) return true;

    // Check trạng thái chung — so sánh sharedApptStatus với originalApptStatus của card đầu tiên
    const currentStatus = document.getElementById('sharedApptStatus')?.value || '';
    const originalStatus = item.dataset.originalApptStatus || '';
    if (originalStatus && currentStatus !== originalStatus) return true;
  }

  return false;
}

function _initInvoiceModal() {
  // Nút mở invoice modal — phân biệt create mode và edit mode
  const btnOpen = document.getElementById('btnOpenInvoice');
  if (btnOpen) {
    btnOpen.addEventListener('click', async () => {
      const apptIdEl    = document.getElementById('apptId');
      const bookingCode = apptIdEl?.dataset.bookingCode || '';

      if (bookingCode) {
        // EDIT MODE: BUG-008 FIX — kiểm tra form có thay đổi chưa lưu không
        // Nếu có → yêu cầu lưu trước để BE và FE dùng cùng 1 nguồn dữ liệu
        const unsavedChanges = _hasUnsavedGuestChanges();
        if (unsavedChanges) {
          _showModalError('Vui lòng lưu lịch hẹn trước khi mở hóa đơn (có thay đổi chưa được lưu).');
          // Scroll lên để user thấy thông báo
          document.getElementById('modalError')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return;
        }
        await _openInvoiceModal(bookingCode);
      } else {
        // CREATE MODE: mở modal thanh toán tạm dựa trên guestCards hiện tại
        _openCreatePayModal();
      }
    });
  }

  // Tự động tính lại khi thay đổi discount
  const discountInput = document.getElementById('invDiscountValue');
  const discountType  = document.getElementById('invDiscountType');
  if (discountInput) discountInput.addEventListener('input', () => _recalcInvoiceTotals());
  if (discountType)  discountType.addEventListener('change', () => _recalcInvoiceTotals());

  // Nút xác nhận thanh toán
  const btnConfirm = document.getElementById('btnConfirmPayment');
  if (btnConfirm) {
    btnConfirm.addEventListener('click', async () => {
      await _submitInvoicePayment();
    });
  }

  // Nút hoàn tiền
  const btnRefundInit = document.getElementById('btnRefundPayment');
  if (btnRefundInit) {
    btnRefundInit.addEventListener('click', async () => {
      await _submitInvoiceRefund();
    });
  }
}

/**
 * Build danh sách lines từ guest cards hiện tại trên form.
 * Trả về { lines, subtotal } hoặc null nếu không có guest nào hợp lệ.
 */
function _buildLinesFromGuestCards() {
  const items = _getGuestItems();
  const readyGuests = items.filter(item => {
    return (item.querySelector('.gc-service')?.value || '') &&
           (item.querySelector('.gc-variant')?.value || '');
  });
  if (!readyGuests.length) return null;

  let subtotal = 0;
  const lines = [];
  readyGuests.forEach(item => {
    const svcSel  = item.querySelector('.gc-service');
    const varSel  = item.querySelector('.gc-variant');
    const svc     = SERVICES.find(s => s.id == svcSel?.value);
    const variant = svc?.variants?.find(v => v.id == varSel?.value);
    const price   = parseFloat(variant?.price || svc?.price || 0);
    const name    = item.querySelector('.gc-name')?.value.trim() || '—';
    subtotal += price;
    lines.push({
      customerName: name,
      serviceName:  svc?.name || '',
      variantLabel: variant?.label || '',
      durationMin:  variant?.duration_minutes || null,
      unitPrice:    String(price),
      quantity:     1,
      lineTotal:    String(price),
    });
  });
  return { lines, subtotal };
}

/**
 * Mở Invoice Modal và load dữ liệu hóa đơn.
 */
async function _openInvoiceModal(bookingCode) {
  const invoiceModalEl = document.getElementById('invoiceModal');
  if (!invoiceModalEl) return;

  // Reset error
  const errEl = document.getElementById('invoiceModalError');
  if (errEl) { errEl.textContent = ''; errEl.classList.add('d-none'); }

  // Show loading state
  const btnConfirm = document.getElementById('btnConfirmPayment');
  if (btnConfirm) btnConfirm.disabled = true;

  // Load invoice data
  const result = await apiGet(`${API_BASE}/bookings/${bookingCode}/invoice/`);
  if (!result.success || !result.invoice) {
    showToast('error', 'Lỗi', 'Không thể tải dữ liệu hóa đơn');
    return;
  }

  _invoiceData = result.invoice;
  _invoiceData._bookingCode = bookingCode;

  // BUG-008 FIX: Không override lines/subtotal từ form chưa lưu nữa.
  // Caller (_initInvoiceModal) đã đảm bảo không có unsaved changes trước khi gọi hàm này.
  // Dùng hoàn toàn dữ liệu từ API (đã phản ánh đúng DB sau khi lưu).

  // Render modal
  _renderInvoiceModal(_invoiceData);

  // Mở modal
  const invoiceModal = bootstrap.Modal.getInstance(invoiceModalEl) || new bootstrap.Modal(invoiceModalEl);
  invoiceModal.show();

  if (btnConfirm) btnConfirm.disabled = false;
}

/**
 * Render nội dung Invoice Modal từ dữ liệu invoice.
 */
function _renderInvoiceModal(inv) {
  // Header
  const titleEl = document.getElementById('invoiceModalTitle');
  if (titleEl) {
    titleEl.textContent = inv.invoiceCode ? `Hóa đơn ${inv.invoiceCode}` : `Hóa đơn — ${inv.bookingCode}`;
  }

  // Booking info
  const bcEl = document.getElementById('invBookingCode');
  const bnEl = document.getElementById('invBookerName');
  const bpEl = document.getElementById('invBookerPhone');
  if (bcEl) bcEl.textContent = inv.bookingCode || '';
  if (bnEl) bnEl.textContent = inv.bookerName  || '';
  if (bpEl) bpEl.textContent = inv.bookerPhone || '';

  // Lines
  const tbody = document.getElementById('invLinesTbody');
  if (tbody) {
    if (!inv.lines || inv.lines.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">Chưa có dịch vụ</td></tr>';
    } else {
      tbody.innerHTML = inv.lines.map(line => {
        const hasService = line.serviceName || line.variantLabel;
        const svcCell = hasService
          ? `<td>${_esc(line.serviceName || '')}</td>`
          : `<td class="invoice-no-service">Chưa chọn dịch vụ</td>`;
        const variantCell = hasService
          ? `<td>${_esc(line.variantLabel || '')}${line.durationMin ? ` — ${line.durationMin} phút` : ''}</td>`
          : `<td class="invoice-no-service">—</td>`;
        const priceCell = hasService
          ? `<td class="text-end">${_fmtVND(parseFloat(line.unitPrice))}</td>`
          : `<td class="text-end invoice-no-service">0đ</td>`;
        const totalCell = hasService
          ? `<td class="text-end">${_fmtVND(parseFloat(line.lineTotal))}</td>`
          : `<td class="text-end invoice-no-service">0đ</td>`;
        return `<tr>
          <td>${_esc(line.customerName || '')}</td>
          ${svcCell}
          ${variantCell}
          ${priceCell}
          <td class="text-center">${line.quantity || 1}</td>
          ${totalCell}
        </tr>`;
      }).join('');
    }
  }

  // Reset discount fields — khôi phục từ invoice đã lưu
  const discountInput = document.getElementById('invDiscountValue');
  const discountType  = document.getElementById('invDiscountType');
  if (discountInput) {
    const dv = parseFloat(inv.discountValue) || 0;
    discountInput.value = dv > 0 ? dv : '';
  }
  if (discountType) {
    // Map model value → select option: NONE/AMOUNT/PERCENT
    const dtMap = { NONE: 'NONE', AMOUNT: 'AMOUNT', PERCENT: 'PERCENT' };
    discountType.value = dtMap[inv.discountType] || 'NONE';
  }

  // Totals
  _updateInvoiceTotalsDisplay(
    parseFloat(inv.subtotal)       || 0,
    parseFloat(inv.discountAmount) || 0,
    parseFloat(inv.finalAmount)    || 0,
    parseFloat(inv.paidAmount)     || 0,
    parseFloat(inv.remaining)      || 0,
  );

  // Pay input section
  const payStatus  = inv.paymentStatus || 'UNPAID';
  const paidAmount = parseFloat(inv.paidAmount) || 0;
  const payInputWrap = document.getElementById('invPayInputWrap');
  const btnConfirm   = document.getElementById('btnConfirmPayment');
  const btnLabel     = document.getElementById('btnConfirmPaymentLabel');
  const btnRefund    = document.getElementById('btnRefundPayment');
  const refundedMsg  = document.getElementById('invRefundedMsg');

  // Reset trạng thái trước
  if (payInputWrap) payInputWrap.style.display = 'none';
  if (btnConfirm)   btnConfirm.style.display   = 'none';
  if (btnRefund)    btnRefund.style.display     = 'none';
  if (refundedMsg)  refundedMsg.style.display   = 'none';

  if (payStatus === 'REFUNDED') {
    // Đã hoàn tiền → chỉ hiện thông báo, ẩn tất cả nút
    if (refundedMsg) refundedMsg.style.display = '';
  } else if (payStatus === 'PAID') {
    // Đã thanh toán đủ → hiện nút Hoàn tiền chỉ khi paidAmount > 0
    if (paidAmount > 0) {
      if (btnRefund) btnRefund.style.display = '';
    }
  } else {
    // UNPAID / PARTIAL → hiện form nhập thanh toán
    // BUG-002 FIX: PARTIAL có tiền đã thu → hiện thêm nút Hoàn tiền
    const finalAmount = parseFloat(inv.finalAmount) || 0;
    const remaining   = parseFloat(inv.remaining)   || 0;

    // Nếu final = 0 (chưa có dịch vụ) → ẩn form, hiện thông báo
    if (finalAmount === 0 && payStatus === 'UNPAID') {
      const errEl = document.getElementById('invoiceModalError');
      if (errEl) {
        errEl.textContent = 'Chưa có dịch vụ nào được chọn. Vui lòng lưu lịch hẹn với dịch vụ trước khi thanh toán.';
        errEl.classList.remove('d-none');
      }
      // Ẩn nút xác nhận — không thể thanh toán 0đ
      if (btnConfirm) btnConfirm.style.display = 'none';
    } else {
      if (payInputWrap) payInputWrap.style.display = 'block';
      if (btnConfirm)   btnConfirm.style.display   = '';
      if (payStatus === 'PARTIAL' && paidAmount > 0) {
        if (btnRefund) btnRefund.style.display = '';
      }
      const payAmountInput = document.getElementById('invPayAmount');
      if (payAmountInput) {
        payAmountInput.value = remaining > 0 ? Math.round(remaining) : '';
      }
      if (btnLabel) {
        btnLabel.textContent = payStatus === 'PARTIAL' ? 'Thu thêm' : 'Xác nhận thanh toán';
      }
    }
  }
}

/**
 * Tính lại tổng tiền khi thay đổi chiết khấu.
 */
function _recalcInvoiceTotals() {
  if (!_invoiceData) return;

  const subtotal      = parseFloat(_invoiceData.subtotal) || 0;
  const discountInput = document.getElementById('invDiscountValue');
  const discountType  = document.getElementById('invDiscountType');
  const paidAmount    = parseFloat(_invoiceData.paidAmount) || 0;

  let discountValue = parseFloat(discountInput?.value || 0) || 0;
  const dtype = discountType?.value || 'NONE';  // NONE | AMOUNT | PERCENT

  // Clamp: 0 ≤ discount ≤ subtotal
  const discountAmount = _calcDiscountAmount(subtotal, dtype, discountValue);
  const finalAmount = subtotal - discountAmount;
  const remaining   = Math.max(finalAmount - paidAmount, 0);

  _updateInvoiceTotalsDisplay(subtotal, discountAmount, finalAmount, paidAmount, remaining);

  // Cập nhật pre-fill số tiền
  const payAmountInput = document.getElementById('invPayAmount');
  if (payAmountInput && remaining > 0) {
    payAmountInput.value = Math.round(remaining);
  }
}

/**
 * Cập nhật hiển thị các dòng tổng trong invoice modal.
 */
function _updateInvoiceTotalsDisplay(subtotal, discount, final, paid, remaining) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = _fmtVND(val);
  };
  set('invSubtotal',  subtotal);
  set('invDiscount',  discount);
  set('invFinal',     final);
  set('invPaid',      paid);
  set('invRemaining', remaining);
}

/**
 * Submit thanh toán từ Invoice Modal.
 */
async function _submitInvoicePayment() {
  if (!_invoiceData) return;

  const errEl = document.getElementById('invoiceModalError');
  if (errEl) { errEl.textContent = ''; errEl.classList.add('d-none'); }

  const discountInput = document.getElementById('invDiscountValue');
  const discountType  = document.getElementById('invDiscountType');
  const payAmountInput = document.getElementById('invPayAmount');
  const payMethodSel   = document.getElementById('invPayMethod');
  const btnConfirm     = document.getElementById('btnConfirmPayment');

  const discountValue = parseFloat(discountInput?.value || 0) || 0;
  const dtype         = discountType?.value || 'NONE';  // NONE | AMOUNT | PERCENT
  const payAmount     = parseFloat(payAmountInput?.value || 0) || 0;
  const payMethod     = payMethodSel?.value || '';

  // Validate
  if (payAmount > 0 && !payMethod) {
    if (errEl) { errEl.textContent = 'Vui lòng chọn phương thức thanh toán'; errEl.classList.remove('d-none'); }
    return;
  }
  if (payAmount < 0) {
    if (errEl) { errEl.textContent = 'Số tiền không được âm'; errEl.classList.remove('d-none'); }
    return;
  }
  if (dtype === 'PERCENT' && discountValue > 100) {
    if (errEl) { errEl.textContent = 'Chiết khấu % không được vượt quá 100'; errEl.classList.remove('d-none'); }
    return;
  }

  // Validate remaining (tính từ _invoiceData + discount hiện tại)
  if (payAmount > 0 && !(_invoiceData._createMode)) {
    const subtotalCheck = parseFloat(_invoiceData.subtotal) || 0;
    const paidCheck     = parseFloat(_invoiceData.paidAmount) || 0;
    const discountAmountCheck = _calcDiscountAmount(subtotalCheck, dtype, discountValue);
    const finalCheck     = Math.max(subtotalCheck - discountAmountCheck, 0);
    const remainingCheck = Math.max(finalCheck - paidCheck, 0);
    if (finalCheck === 0) {
      if (errEl) { errEl.textContent = 'Chưa có dịch vụ nào được chọn. Vui lòng lưu lịch hẹn với dịch vụ trước khi thanh toán.'; errEl.classList.remove('d-none'); }
      return;
    }
    if (payAmount > remainingCheck) {
      if (errEl) { errEl.textContent = `Số tiền thanh toán (${_fmtVND(payAmount)}) vượt quá số tiền còn lại (${_fmtVND(remainingCheck)}). Vui lòng kiểm tra lại.`; errEl.classList.remove('d-none'); }
      return;
    }
  }

  const bookingCode = _invoiceData._bookingCode;

  // ── CREATE MODE: lưu payment data tạm, không gọi API ────────────────────
  if (_invoiceData._createMode || !bookingCode) {
    // Tính final sau discount
    const subtotal = parseFloat(_invoiceData.subtotal) || 0;
    const discountAmount = _calcDiscountAmount(subtotal, dtype, discountValue);
    const finalAmount = subtotal - discountAmount;

    // Xác định payStatus
    const hasAnyService = ((_invoiceData.lines || []).some(l => parseFloat(l.unitPrice) > 0));
    const payStatus = _calcPayStatus(finalAmount, payAmount, hasAnyService);

    // Lưu vào state tạm
    _createModePayment = {
      payStatus,
      paymentMethod: payMethod,
      paymentAmount: payAmount,
      discountType:  dtype,
      discountValue,
      discountAmount,
      finalAmount,
    };

    // Cập nhật badge trong create modal
    _setPayStatusBadge(payStatus);
    const btnInvoiceLabel = document.getElementById('btnInvoiceLabel');
    if (btnInvoiceLabel) {
      if (payStatus === 'PAID')         btnInvoiceLabel.textContent = 'Xem hóa đơn';
      else if (payStatus === 'PARTIAL') btnInvoiceLabel.textContent = 'Thu thêm';
      else                              btnInvoiceLabel.textContent = 'Thanh toán';
    }

    // Đóng invoice modal
    const invoiceModalEl = document.getElementById('invoiceModal');
    const invoiceModal   = bootstrap.Modal.getInstance(invoiceModalEl);
    if (invoiceModal) invoiceModal.hide();

    showToast('success', 'Đã ghi nhận', `Thanh toán: ${_fmtVND(payAmount)} — sẽ lưu khi tạo lịch`);
    return;
  }

  // ── EDIT MODE: gọi API như cũ ────────────────────────────────────────────

  // Loading state — chỉ đổi text trong span, không ghi đè innerHTML nút
  const btnLbl = document.getElementById('btnConfirmPaymentLabel');
  if (btnConfirm) btnConfirm.disabled = true;
  if (btnLbl) btnLbl.textContent = 'Đang xử lý...';

  try {
    const result = await apiPost(`${API_BASE}/bookings/${bookingCode}/invoice/pay/`, {
      discountType:  dtype,
      discountValue: discountValue,
      payAmount:     payAmount,
      paymentMethod: payMethod,
    });

    if (!result.success) {
      if (errEl) { errEl.textContent = result.error || 'Có lỗi xảy ra'; errEl.classList.remove('d-none'); }
      return;
    }

    // Đóng invoice modal
    const invoiceModalEl = document.getElementById('invoiceModal');
    const invoiceModal = bootstrap.Modal.getInstance(invoiceModalEl);
    if (invoiceModal) invoiceModal.hide();

    // Cập nhật hidden select + badge trong edit modal
    const payStatusSel = document.getElementById('sharedPayStatus');
    if (payStatusSel) _setSelectValue(payStatusSel, result.paymentStatus, 'UNPAID');
    _updatePaymentSummary();

    // Refresh grid
    await _refreshAll();

    const statusLabels = { UNPAID: 'Chưa thanh toán', PARTIAL: 'Thanh toán một phần', PAID: 'Đã thanh toán' };
    showToast('success', 'Thanh toán thành công', statusLabels[result.paymentStatus] || result.paymentStatus);

  } catch (e) {
    if (errEl) { errEl.textContent = 'Có lỗi xảy ra, vui lòng thử lại'; errEl.classList.remove('d-none'); }
  } finally {
    if (btnConfirm) {
      btnConfirm.disabled = false;
      const lbl = document.getElementById('btnConfirmPaymentLabel');
      if (lbl) lbl.textContent = 'Xác nhận thanh toán';
    }
  }
}

/**
 * Hoàn tiền hóa đơn — đổi tất cả InvoicePayment SUCCESS → REFUNDED.
 */
async function _submitInvoiceRefund() {
  if (!_invoiceData) return;

  const bookingCode = _invoiceData._bookingCode;
  if (!bookingCode) return;

  const errEl    = document.getElementById('invoiceModalError');
  const btnRefund = document.getElementById('btnRefundPayment');
  const btnLbl    = document.getElementById('btnRefundPaymentLabel');

  if (errEl) { errEl.textContent = ''; errEl.classList.add('d-none'); }

  // Confirm trước khi hoàn tiền
  const confirmed = await confirmAction(
    'Xác nhận hoàn tiền',
    'Bạn có chắc muốn hoàn tiền hóa đơn này? Tất cả giao dịch thanh toán sẽ bị đánh dấu là đã hoàn.',
    'Hoàn tiền',
    'Hủy'
  );
  if (!confirmed) return;

  if (btnRefund) btnRefund.disabled = true;
  if (btnLbl)    btnLbl.textContent = 'Đang xử lý...';

  try {
    const result = await apiPost(`${API_BASE}/bookings/${bookingCode}/invoice/refund/`, {});

    if (!result.success) {
      if (errEl) { errEl.textContent = result.error || 'Có lỗi xảy ra'; errEl.classList.remove('d-none'); }
      return;
    }

    // Đóng invoice modal
    const invoiceModalEl = document.getElementById('invoiceModal');
    const invoiceModal = bootstrap.Modal.getInstance(invoiceModalEl);
    if (invoiceModal) invoiceModal.hide();

    // Cập nhật trạng thái thanh toán trong edit modal
    const payStatusSel = document.getElementById('sharedPayStatus');
    if (payStatusSel) _setSelectValue(payStatusSel, 'REFUNDED', 'UNPAID');
    _updatePaymentSummary();

    // Refresh grid
    await _refreshAll();

    showToast('success', 'Hoàn tiền thành công', 'Đã hoàn tiền hóa đơn');

  } catch (e) {
    if (errEl) { errEl.textContent = 'Có lỗi xảy ra, vui lòng thử lại'; errEl.classList.remove('d-none'); }
  } finally {
    if (btnRefund) btnRefund.disabled = false;
    if (btnLbl)    btnLbl.textContent = 'Hoàn tiền';
  }
}
