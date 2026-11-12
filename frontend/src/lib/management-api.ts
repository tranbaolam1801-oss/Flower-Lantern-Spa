import { apiFetch } from './api-client';

// ================= UC_3 Customers =================
export interface CustomerSummary {
  id: string;
  name: string;
  phone: string;
  channel: string | null;
  bookingCount: number;
}

export interface CustomerDetail extends CustomerSummary {
  gender: string | null;
  birthDate: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string | null;
  recentBookings?: {
    id: string;
    date: string;
    time: string;
    status: string;
    serviceSummary: string;
  }[];
}

export interface CustomerWritePayload {
  name: string;
  phone: string;
  channel?: string;
  gender?: string;
  birthDate?: string;
  address?: string;
  notes?: string;
}

export const getCustomerDetail = (id: string) =>
  apiFetch<CustomerDetail>(`customers/${encodeURIComponent(id)}`);

export const createCustomer = (payload: CustomerWritePayload) =>
  apiFetch<{ id: string; message: string }>('customers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateCustomer = (id: string, payload: CustomerWritePayload) =>
  apiFetch<{ id: string; message: string }>(`customers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

// ================= UC_4 Reviews & Replies =================
export interface ReviewItem {
  id: string;
  bookingId: string;
  customerName: string;
  customerPhone?: string;
  serviceName: string;
  packageName?: string;
  rating: number;
  comment: string;
  createdAt: string;
  status: 'Chưa phản hồi' | 'Đã phản hồi';
  reply?: {
    id: string;
    content: string;
    staffName: string;
    repliedAt: string;
  } | null;
}

export const listReviews = (params: { q?: string; status?: string; page?: number } = {}) => {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.status) qs.set('status', params.status);
  if (params.page) qs.set('page', String(params.page));
  return apiFetch<{ items: ReviewItem[]; page: number; hasNext: boolean }>(`reviews?${qs.toString()}`);
};

export const getReviewDetail = (id: string) =>
  apiFetch<ReviewItem>(`reviews/${encodeURIComponent(id)}`);

export const replyToReview = (id: string, content: string) =>
  apiFetch<{ message: string }>(`reviews/${encodeURIComponent(id)}/reply`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });

// ================= UC_8 Employees & Permissions =================
export interface EmployeeItem {
  id: string;
  accountId: string | null;
  username: string;
  fullName: string;
  phone: string;
  email: string | null;
  gender?: string | null;
  birthDate?: string | null;
  address?: string | null;
  notes?: string | null;
  role: 'Chủ Spa' | 'Quản lý' | 'Nhân viên';
  workStatus: string;
  accountStatus: 'Hoạt động' | 'Đã khóa' | 'Vô hiệu hóa';
  permissions: string[];
}

export interface CreateEmployeePayload {
  username: string;
  fullName: string;
  password: string;
  confirmPassword: string;
  phone: string;
  email: string;
  gender?: string;
  birthDate?: string;
  address?: string;
  notes?: string;
}

export interface UpdateEmployeePayload {
  fullName: string;
  phone: string;
  email: string;
  gender?: string;
  birthDate?: string;
  address?: string;
  notes?: string;
}

export const listEmployees = (params: { q?: string; status?: string; page?: number } = {}) => {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.status) qs.set('status', params.status);
  if (params.page) qs.set('page', String(params.page));
  return apiFetch<{ items: EmployeeItem[]; page: number; hasNext: boolean }>(`employees?${qs.toString()}`);
};

export const getEmployeeDetail = (id: string) =>
  apiFetch<EmployeeItem>(`employees/${encodeURIComponent(id)}`);

export const createEmployee = (payload: CreateEmployeePayload) =>
  apiFetch<{ id: string; message: string }>('employees', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateEmployee = (id: string, payload: UpdateEmployeePayload) =>
  apiFetch<{ id: string; message: string }>(`employees/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const softDeleteEmployee = (id: string) =>
  apiFetch<{ message: string }>(`employees/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

export const updateEmployeePermissions = (
  id: string,
  payload: { role: 'Quản lý' | 'Nhân viên'; permissions: string[] },
) =>
  apiFetch<{ message: string }>(`employees/${encodeURIComponent(id)}/permissions`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

export const updateEmployeeAccountStatus = (id: string, status: 'Hoạt động' | 'Đã khóa') =>
  apiFetch<{ message: string }>(`employees/${encodeURIComponent(id)}/account-status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

// ================= UC_9 Admin Services =================
export interface AdminServiceItem {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  description: string | null;
  details?: string | null;
  image: string | null;
  status: 'Hoạt động' | 'Ngừng hoạt động';
  packages: { id?: string; name: string; durationMinutes: number; price: number }[];
}

export interface AdminServiceWritePayload {
  id?: string;
  name: string;
  categoryId: string;
  status: 'Hoạt động' | 'Ngừng hoạt động';
  description?: string;
  details?: string;
  image?: string;
  packages: { id?: string; name: string; durationMinutes: number; price: number }[];
}

export const listAdminServices = (params: { q?: string; category?: string; status?: string; page?: number } = {}) => {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.category) qs.set('category', params.category);
  if (params.status) qs.set('status', params.status);
  if (params.page) qs.set('page', String(params.page));
  return apiFetch<{
    items: AdminServiceItem[];
    categories: { id: string; name: string }[];
    page: number;
    hasNext: boolean;
  }>(`admin/services?${qs.toString()}`);
};

export const createAdminService = (payload: AdminServiceWritePayload) =>
  apiFetch<{ id: string; message: string }>('admin/services', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateAdminService = (id: string, payload: AdminServiceWritePayload) =>
  apiFetch<{ id: string; message: string }>(`admin/services/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const stopAdminService = (id: string) =>
  apiFetch<{ message: string }>(`admin/services/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

// ================= UC_10 Reports =================
export interface ServiceReportData {
  totalUsage: number;
  items: { serviceId: string; serviceName: string; usageCount: number }[];
}

export interface CustomerReportData {
  newCustomers: number;
  returningCustomers: number;
  topCustomers: { customerId: string; fullName: string; phone: string; bookingCount: number }[];
}

export interface RevenueReportData {
  totalRevenue: number;
  series: { label: string; amount: number }[];
}

export const getServiceReport = (from: string, to: string) =>
  apiFetch<ServiceReportData>(`reports/services?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

export const getCustomerReport = (from: string, to: string) =>
  apiFetch<CustomerReportData>(`reports/customers?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

export const getRevenueReport = (from: string, to: string, groupBy: 'day' | 'week' | 'month' | 'year' = 'day') =>
  apiFetch<RevenueReportData>(
    `reports/revenue?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&groupBy=${groupBy}`,
  );
