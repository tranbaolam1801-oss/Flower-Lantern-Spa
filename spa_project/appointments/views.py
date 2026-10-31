"""
Views cho Appointments module.

- booking(): Trang đặt lịch online cho khách hàng → tạo Booking + Appointment
- my_appointments(): Khách xem lịch hẹn của mình
- cancel_appointment(): Khách hủy lịch hẹn
- admin_appointments(): Trang quản lý lịch hẹn (staff/admin)

Author: Spa ANA Team
"""

from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.contrib.auth.decorators import login_required

from .models import Appointment, Booking, Room
from spa_services.models import Service, ServiceVariant
from .forms import BookingOnlineForm
from core.decorators import customer_required
from .services import get_available_rooms_for_slot


# =====================================================
# TRANG ĐẶT LỊCH (Public — khách hàng)
# =====================================================

@customer_required()
def booking(request):
    """Trang đặt lịch hẹn cho khách hàng (online booking)."""
    customer_profile = request.user.customer_profile

    if request.method == 'POST':
        form = BookingOnlineForm(request.POST, customer_profile=customer_profile)
        if form.is_valid():
            booker_name  = form.cleaned_data['booker_name']
            booker_phone = form.cleaned_data['booker_phone']
            booker_email = customer_profile.user.email if customer_profile.user else ''
            booker_notes = form.cleaned_data.get('booker_notes', '')

            # Customer snapshot — khách sử dụng dịch vụ
            customer_name_snapshot  = request.POST.get('customer_name_snapshot', '').strip() or booker_name
            _raw_phone              = request.POST.get('customer_phone_snapshot', '').strip()
            customer_phone_snapshot = ''.join(filter(str.isdigit, _raw_phone)) or None
            customer_email_snapshot = request.POST.get('customer_email_snapshot', '').strip() or None

            # Resolve customer profile
            from .api import _resolve_or_create_customer
            try:
                customer = _resolve_or_create_customer(
                    phone=booker_phone,
                    email=booker_email,
                    customer_name=booker_name,
                )
            except Exception:
                customer = None

            # Chọn phòng trống
            service_variant = form.cleaned_data.get('service_variant')
            duration_min    = service_variant.duration_minutes if service_variant else 60
            available_rooms = get_available_rooms_for_slot(
                appointment_date=form.cleaned_data['appointment_date'],
                start_time=form.cleaned_data['appointment_time'],
                duration_minutes=duration_min,
            )
            if not available_rooms:
                messages.error(request, 'Không còn giường trống cho khung giờ này. Vui lòng chọn giờ khác hoặc liên hệ trực tiếp.')
                return _render_booking_form(request, form, customer_profile)

            try:
                from django.db import transaction
                with transaction.atomic():
                    # Tạo Booking
                    bk = Booking.objects.create(
                        booker_name=booker_name,
                        booker_phone=booker_phone,
                        booker_email=booker_email or None,
                        booker_notes=booker_notes or None,
                        status='PENDING',
                        payment_status='UNPAID',
                        source='ONLINE',
                        created_by=request.user,
                    )
                    # Tạo Appointment
                    appt = Appointment.objects.create(
                        booking=bk,
                        customer=customer,
                        service_variant=service_variant,
                        room=available_rooms[0],
                        customer_name_snapshot=customer_name_snapshot,
                        customer_phone_snapshot=customer_phone_snapshot,
                        customer_email_snapshot=customer_email_snapshot,
                        appointment_date=form.cleaned_data['appointment_date'],
                        appointment_time=form.cleaned_data['appointment_time'],
                        status='NOT_ARRIVED',
                    )
            except Exception:
                import logging
                logging.getLogger(__name__).exception('Booking save failed')
                messages.error(request, 'Đặt lịch thất bại. Vui lòng thử lại hoặc liên hệ trực tiếp.')
                return _render_booking_form(request, form, customer_profile)

            messages.success(request, f'Đặt lịch thành công! Mã đặt lịch: {bk.booking_code}. Vui lòng chờ xác nhận.')
            return redirect('appointments:my_appointments')
    else:
        form = BookingOnlineForm(customer_profile=customer_profile)

    return _render_booking_form(request, form, customer_profile)


def _render_booking_form(request, form, customer_profile):
    """Helper render booking form với services data."""
    services = Service.objects.filter(status='ACTIVE').prefetch_related('variants')

    import json as _json
    services_with_variants = {
        str(s.id): [
            {'id': v.id, 'label': v.label, 'duration_minutes': v.duration_minutes, 'price': float(v.price)}
            for v in s.variants.order_by('sort_order', 'duration_minutes')
        ]
        for s in services
    }

    return render(request, 'appointments/booking.html', {
        'form': form,
        'services': services,
        'services_variants_json': _json.dumps(services_with_variants),
        'customer_profile': customer_profile,
    })


# =====================================================
# TRANG LỊCH HẸN CỦA TÔI
# =====================================================

@customer_required()
def my_appointments(request):
    """Trang xem lịch hẹn của khách hàng."""
    customer_profile = request.user.customer_profile
    status_filter    = request.GET.get('status', 'all')

    # Lấy tất cả appointment của khách (qua customer FK)
    appointments = Appointment.objects.filter(
        customer=customer_profile,
        deleted_at__isnull=True,
    ).select_related('booking', 'service_variant__service', 'room')

    # Map filter → Booking status + Appointment status
    FILTER_MAP = {
        'pending':   {'booking__status': 'PENDING'},
        'confirmed': {'booking__status': 'CONFIRMED'},
        'completed': {'status': 'COMPLETED'},
        'cancelled': {'booking__status': 'CANCELLED'},
        'rejected':  {'booking__status': 'REJECTED'},
    }

    if status_filter != 'all' and status_filter in FILTER_MAP:
        flt = FILTER_MAP[status_filter]
        if 'booking__status__in' in flt:
            appointments = appointments.filter(booking__status__in=flt['booking__status__in'])
        elif 'booking__status' in flt:
            appointments = appointments.filter(booking__status=flt['booking__status'])
        elif 'status' in flt:
            appointments = appointments.filter(status=flt['status'])

    appointments = appointments.order_by('-booking__created_at')

    base_qs = Appointment.objects.filter(customer=customer_profile, deleted_at__isnull=True)
    status_counts = {
        'pending':   base_qs.filter(booking__status='PENDING').count(),
        'confirmed': base_qs.filter(booking__status='CONFIRMED').count(),
        'completed': base_qs.filter(status='COMPLETED').count(),
        'cancelled': base_qs.filter(booking__status='CANCELLED').count(),
        'rejected':  base_qs.filter(booking__status='REJECTED').count(),
    }
    status_counts['all'] = base_qs.count()

    return render(request, 'appointments/my_appointments.html', {
        'appointments': appointments,
        'status_filter': status_filter,
        'status_counts': status_counts,
    })


# =====================================================
# HỦY LỊCH HẸN (khách hàng)
# =====================================================

@customer_required()
def cancel_appointment(request, appointment_id):
    """Hủy lịch hẹn (khách hàng tự hủy)."""
    appointment = get_object_or_404(
        Appointment, id=appointment_id, customer=request.user.customer_profile, deleted_at__isnull=True
    )
    booking = appointment.booking

    if appointment.status == 'COMPLETED':
        messages.warning(request, 'Không thể hủy lịch đã hoàn thành.')
        return redirect('appointments:my_appointments')

    if booking and booking.status not in ('PENDING', 'CONFIRMED'):
        messages.warning(request, 'Hủy lịch thất bại, vui lòng thử lại.')
        return redirect('appointments:my_appointments')

    try:
        from django.utils import timezone
        from django.db import transaction
        with transaction.atomic():
            appointment.status = 'CANCELLED'
            appointment.save(update_fields=['status', 'updated_at'])
            if booking:
                booking.status      = 'CANCELLED'
                booking.cancelled_at = timezone.now()
                booking.save(update_fields=['status', 'cancelled_at', 'updated_at'])
        messages.success(request, f'Đã hủy lịch hẹn {appointment.appointment_code}.')
    except Exception:
        messages.error(request, 'Hủy lịch thất bại, vui lòng thử lại.')

    return redirect('appointments:my_appointments')


# =====================================================
# TRANG QUẢN LÝ LỊCH HẸN (Admin)
# =====================================================

@login_required(login_url='accounts:login')
def admin_appointments(request):
    """Trang quản lý lịch hẹn (staff/admin)."""
    if not (request.user.is_staff or request.user.is_superuser):
        messages.error(request, 'Bạn không có quyền truy cập trang này.')
        return redirect('pages:home')
    return render(request, 'manage/pages/admin_appointments.html')
