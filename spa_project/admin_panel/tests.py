from django.contrib.auth.models import User
from django.test import Client, TestCase
from django.urls import reverse

from staff.models import StaffProfile


class AdminProfileUpdateTests(TestCase):
    """admin_profile() từng NameError vì thiếu import User (đã fix)."""

    def setUp(self):
        self.user = User.objects.create_user(
            username='letan1', password='pass1234', is_staff=True,
        )
        StaffProfile.objects.create(user=self.user, full_name='Le Tan Mot', phone='0900000000')
        self.client = Client()
        self.client.login(username='letan1', password='pass1234')
        self.url = reverse('admin_panel:admin_profile')

    def test_update_profile_with_username_change_succeeds(self):
        resp = self.client.post(self.url, {
            'action': 'update_profile',
            'username': 'letan1_moi',
            'full_name': 'Le Tan Mot Moi',
            'email': 'letan1@example.com',
            'phone': '0911111111',
            'gender': '',
            'dob': '',
            'address': '',
        })
        self.assertEqual(resp.status_code, 302)
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, 'letan1_moi')
        self.assertEqual(self.user.email, 'letan1@example.com')
