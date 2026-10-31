from django.db import transaction


class CodeGeneratorMixin:
    """
    Sinh mã định danh tự tăng dạng "<code_prefix><số>" (vd: BK0001, INV00001),
    an toàn với race condition nhờ select_for_update() bên trong transaction.

    Model con khai báo:
        code_prefix = 'BK'            # tiền tố bắt buộc
        code_field = 'booking_code'   # tên field lưu mã (mặc định 'code')
        code_digits = 4               # số chữ số đệm 0 (mặc định 4)

    và gọi `self.<code_field> = self._generate_code()` trong save() khi field rỗng.
    """
    code_prefix = None
    code_field = 'code'
    code_digits = 4

    @classmethod
    def _generate_code(cls):
        prefix = cls.code_prefix
        field = cls.code_field
        digits = cls.code_digits

        for attempt in range(100):
            with transaction.atomic():
                last = cls.objects.select_for_update().filter(
                    **{f'{field}__startswith': prefix}
                ).order_by(f'-{field}').first()
                last_code = getattr(last, field, None) if last else None
                if last_code:
                    try:
                        new_number = int(last_code[len(prefix):]) + 1 + attempt
                    except (ValueError, IndexError):
                        new_number = 1 + attempt
                else:
                    new_number = 1 + attempt
                new_code = f'{prefix}{new_number:0{digits}d}'
                if not cls.objects.filter(**{field: new_code}).exists():
                    return new_code
                # Code đã tồn tại (race condition) → thử lại với số tiếp theo

        import time
        return f'{prefix}{int(time.time()) % (10 ** digits):0{digits}d}'
