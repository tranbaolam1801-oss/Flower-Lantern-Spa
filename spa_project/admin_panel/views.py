"""
Views cho Admin Panel

File này chứa các views cho:
- Đăng nhập/đăng xuất admin
- Profile admin

Author: Spa ANA Team
"""

from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.contrib.auth import logout, update_session_auth_hash
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth.models import User
from django.contrib import messages

# Forms
from accounts.forms import AdminLoginForm


# =====================================================
# ADMIN AUTHENTICATION VIEWS
# =====================================================

def admin_login(request):
    """
    Đăng nhập Admin

    Sử dụng AdminLoginForm để:
    - Validate username/password
    - Tự động xử lý remember_me
    - Kiểm tra user.is_staff

    NOTE: Route này đã bị xóa, function chỉ giữ lại để tránh lỗi.
    Tất cả login giờ redirect qua accounts:login
    """
    if request.user.is_authenticated and request.user.is_staff:
        return redirect('appointments:admin_appointments')

    if request.method == 'POST':
        form = AdminLoginForm(request, data=request.POST)

        if form.is_valid():
            user = form.get_user()

            # Kiểm tra xem user có phải staff không
            if user.is_staff or user.is_superuser:
                from django.contrib.auth import login
                login(request, user)

                # Xử lý remember_me
                remember_me = form.cleaned_data.get('remember_me')
                if remember_me:
                    request.session.set_expiry(1209600)  # 14 ngày
                else:
                    request.session.set_expiry(0)  # Session cookie

                return redirect('appointments:admin_appointments')
            else:
                messages.error(request, 'Tài khoản này không có quyền truy cập trang Admin.')
    else:
        form = AdminLoginForm(request)

    return render(request, 'manage/pages/admin_login.html', {'form': form})


def admin_logout(request):
    """Đăng xuất Admin"""
    logout(request)
    return render(request, 'manage/pages/admin_clear-login.html')



@login_required(login_url='accounts:login')
def admin_profile(request):
    """Tài khoản cá nhân"""
    if not (request.user.is_staff or request.user.is_superuser):
        messages.error(request, 'Bạn không có quyền truy cập trang này.')
        return redirect('pages:home')

    # Load StaffProfile if exists
    try:
        from staff.models import StaffProfile
        staff_profile = StaffProfile.objects.get(user=request.user)
    except Exception:
        staff_profile = None

    ctx = {'staff_profile': staff_profile}

    if request.method == 'POST':
        action = request.POST.get('action')

        if action == 'update_profile':
            full_name = request.POST.get('full_name', '').strip()
            email = request.POST.get('email', '').strip()
            phone = request.POST.get('phone', '').strip()
            gender = request.POST.get('gender', '').strip()
            dob = request.POST.get('dob', '').strip() or None
            address = request.POST.get('address', '').strip()
            username = request.POST.get('username', '').strip()

            errors = {}

            if not username:
                errors['username_error'] = 'Vui lòng nhập tên đăng nhập.'
            elif ' ' in username:
                errors['username_error'] = 'Tên đăng nhập không được chứa khoảng trắng.'
            elif not username.isascii():
                errors['username_error'] = 'Tên đăng nhập chỉ được dùng ký tự không dấu.'
            elif User.objects.filter(username=username).exclude(pk=request.user.pk).exists():
                errors['username_error'] = 'Tên đăng nhập này đã được sử dụng.'

            if not full_name:
                errors['profile_error'] = 'Vui lòng nhập họ tên.'

            if errors:
                ctx.update(errors)
                return render(request, 'admin_panel/admin_profile.html', ctx)

            # Update User
            parts = full_name.split(None, 1)
            request.user.username = username
            request.user.first_name = parts[0]
            request.user.last_name = parts[1] if len(parts) > 1 else ''
            if email:
                request.user.email = email
            request.user.save()

            # Update StaffProfile
            if staff_profile:
                staff_profile.full_name = full_name
                if phone:
                    staff_profile.phone = phone
                staff_profile.gender = gender or None
                staff_profile.dob = dob
                staff_profile.address = address
                staff_profile.save()

            messages.success(request, 'Cập nhật thông tin thành công.')
            return redirect('admin_panel:admin_profile')

        elif action == 'change_password':
            current_password = request.POST.get('current_password', '')
            new_password = request.POST.get('new_password', '')
            confirm_password = request.POST.get('confirm_password', '')

            pw_error = None
            if not request.user.check_password(current_password):
                pw_error = 'Mật khẩu hiện tại không đúng.'
            elif len(new_password) < 6:
                pw_error = 'Mật khẩu mới phải có ít nhất 6 ký tự.'
            elif new_password == current_password:
                # Không cho đặt mật khẩu mới trùng mật khẩu cũ
                pw_error = 'Mật khẩu mới không được trùng mật khẩu hiện tại.'
            elif new_password != confirm_password:
                pw_error = 'Xác nhận mật khẩu không khớp.'

            if pw_error:
                ctx['pw_error'] = pw_error
                return render(request, 'admin_panel/admin_profile.html', ctx)

            request.user.set_password(new_password)
            request.user.save()
            update_session_auth_hash(request, request.user)
            ctx['pw_success'] = 'Đổi mật khẩu thành công.'
            return render(request, 'admin_panel/admin_profile.html', ctx)

    return render(request, 'admin_panel/admin_profile.html', ctx)