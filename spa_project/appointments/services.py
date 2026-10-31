"""
Services cho Appointment Validation

Tách logic nghiệp vụ ra khỏi views/api để dùng lại và dễ test.
"""

from datetime import datetime, timedelta, date, time as time_type
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.db.models import Q
from .models import Appointment, Booking, Room


# =====================================================
# CONSTANTS
# =====================================================

SPA_CLOSE_TIME = time_type(21, 0)       # 21:00
SPA_OPEN_TIME  = time_type(9, 0)        # 09:00
DEFAULT_APPOINTMENT_DURATION_MINUTES = 60


# =====================================================
# APPOINTMENT VALIDATION SERVICES
# =====================================================

def validate_appointment_date(appointment_date, is_staff_confirm=False):
    """
    Kiểm tra ngày hẹn hợp lệ.
    Staff xác nhận booking cũ được phép dùng ngày quá khứ.
    """
    if is_staff_confirm:
        return

    today = timezone.localtime(timezone.now()).date()
    if appointment_date < today:
        raise ValidationError('Ngày hẹn không được nhỏ hơn ngày hôm nay.')


def validate_appointment_time(appointment_time, appointment_date, duration_minutes=None, is_staff_confirm=False):
    """
    Kiểm tra giờ hẹn hợp lệ.
    - Phải trong 09:00 – 21:00.
    - Giờ kết thúc (start + duration) không được vượt quá 21:00.
    - Nếu là ngày hôm nay, giờ phải >= giờ hiện tại.
    - is_staff_confirm=True: bỏ qua check giờ đã qua (dùng khi staff edit lịch cũ không đổi giờ).
    """
    if duration_minutes is None:
        duration_minutes = DEFAULT_APPOINTMENT_DURATION_MINUTES

    if appointment_time < SPA_OPEN_TIME:
        raise ValidationError('Giờ làm việc từ 09:00 đến 21:00.')

    if appointment_time >= SPA_CLOSE_TIME:
        raise ValidationError('Giờ hẹn phải trước 21:00.')

    # Kiểm tra giờ kết thúc không vượt 21:00
    end_time = _calc_end_time(appointment_time, duration_minutes)
    if end_time > SPA_CLOSE_TIME:
        latest_start = _calc_end_time(SPA_CLOSE_TIME, -duration_minutes)
        raise ValidationError(
            f'Gói {duration_minutes} phút sẽ kết thúc sau 21:00. '
            f'Giờ trễ nhất có thể đặt: {latest_start.strftime("%H:%M")}.'
        )

    # Chặn giờ đã qua trong ngày hôm nay — bỏ qua khi staff confirm lịch cũ
    if not is_staff_confirm:
        now = timezone.localtime(timezone.now())
        if appointment_date == now.date() and appointment_time <= now.time():
            raise ValidationError(f'Giờ hẹn phải sau giờ hiện tại ({now.strftime("%H:%M")}).')


def check_room_availability(
    room_code,
    appointment_date,
    start_time,
    duration_minutes,
    exclude_appointment_code=None,
):
    """
    Kiểm tra phòng có trống trong khung giờ đã chọn không.

    Mỗi appointment = 1 khách = 1 slot.
    Phòng có capacity N → cho phép N lịch trùng giờ.

    Returns:
        (is_available: bool, conflict: Appointment|None, message: str)
        message phân biệt rõ 2 trường hợp:
        - 'CONFLICT': khung giờ đã có lịch (capacity = 1, bị trùng)
        - 'CAPACITY': phòng đã đủ chỗ (capacity > 1, vượt giới hạn)
    """
    if not room_code:
        return (True, None, '')

    try:
        room = Room.objects.get(code=room_code, is_active=True)
    except Room.DoesNotExist:
        return (False, None, f'Giường {room_code} không tồn tại.')

    end_time = _calc_end_time(start_time, duration_minutes)

    queryset = Appointment.objects.filter(
        room=room,
        appointment_date=appointment_date,
        deleted_at__isnull=True,
    ).exclude(
        status='CANCELLED'
    ).exclude(
        booking__status__in=['CANCELLED', 'REJECTED']
    )

    if exclude_appointment_code:
        queryset = queryset.exclude(appointment_code=exclude_appointment_code)

    # Đếm số lịch trùng giờ (mỗi lịch = 1 khách)
    overlapping_count = 0
    first_conflict = None

    for existing in queryset:
        dur = _get_appt_duration(existing)
        existing_end = _calc_end_time(existing.appointment_time, dur)

        if start_time < existing_end and end_time > existing.appointment_time:
            overlapping_count += 1
            if first_conflict is None:
                first_conflict = existing

    if overlapping_count >= room.capacity:
        # Phân biệt: capacity=1 → trùng lịch; capacity>1 → vượt sức chứa
        if room.capacity == 1:
            return (False, first_conflict, 'CONFLICT')
        return (False, first_conflict, 'CAPACITY')

    return (True, None, '')


def validate_appointment_create(
    appointment_date,
    appointment_time,
    duration_minutes,
    room_code=None,
    exclude_appointment_code=None,
    is_staff_confirm=False,
):
    """
    Validate toàn bộ trước khi tạo/sửa lịch hẹn.

    Returns:
        {'valid': bool, 'errors': list}
    """
    errors = []

    try:
        validate_appointment_date(appointment_date, is_staff_confirm=is_staff_confirm)
    except ValidationError as e:
        errors.append(str(e.message))

    try:
        validate_appointment_time(appointment_time, appointment_date, duration_minutes, is_staff_confirm=is_staff_confirm)
    except ValidationError as e:
        errors.append(str(e.message))

    if room_code:
        is_available, _, message = check_room_availability(
            room_code=room_code,
            appointment_date=appointment_date,
            start_time=appointment_time,
            duration_minutes=duration_minutes,
            exclude_appointment_code=exclude_appointment_code,
        )
        if not is_available:
            if message == 'CONFLICT':
                errors.append('Khung giờ đã có lịch, vui lòng chọn thời gian khác')
            elif message == 'CAPACITY':
                errors.append('Giường đã có lịch ở khung giờ này, vui lòng chọn giường hoặc thời gian khác')
            else:
                errors.append(message)

    return {'valid': len(errors) == 0, 'errors': errors}


# =====================================================
# HELPER FUNCTIONS
# =====================================================

def _calc_end_time(start_time, duration_minutes):
    """Tính giờ kết thúc từ giờ bắt đầu và thời lượng (có thể âm để tính ngược)."""
    base = date.today()
    start_dt = datetime.combine(base, start_time)
    return (start_dt + timedelta(minutes=duration_minutes)).time()


def _get_appt_duration(appointment):
    """
    Lấy thời lượng của 1 appointment.
    Ưu tiên service_variant.duration_minutes, fallback 60 phút.
    """
    try:
        if appointment.service_variant_id and appointment.service_variant:
            return appointment.service_variant.duration_minutes
    except Exception:
        pass
    return 60


def get_available_rooms_for_slot(appointment_date, start_time, duration_minutes):
    """Lấy danh sách phòng còn trống cho khung giờ đã chọn."""
    all_rooms = Room.objects.filter(is_active=True)
    available = []
    for room in all_rooms:
        is_available, _, _ = check_room_availability(
            room_code=room.code,
            appointment_date=appointment_date,
            start_time=start_time,
            duration_minutes=duration_minutes,
        )
        if is_available:
            available.append(room)
    return available


def get_today_str():
    return timezone.now().strftime('%Y-%m-%d')


def get_min_booking_date():
    return timezone.now().date()
