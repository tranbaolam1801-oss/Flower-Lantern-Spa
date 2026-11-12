import { apiFetch } from './api-client';

export interface PublicServiceItem {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  categoryId: string;
  categoryName?: string;
  priceFrom: number | null;
  minDuration?: number | null;
  maxDuration?: number | null;
}

export interface ServicePackage {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
}

export interface PublicServiceDetail {
  id: string;
  name: string;
  description: string | null;
  details: string | null;
  image: string | null;
  benefits: string | null;
  procedureSteps: string | null;
  suitableFor: string | null;
  notes: string | null;
  categoryId?: string;
  categoryName?: string;
  packages: ServicePackage[];
}

export interface PublicCategory {
  id: string;
  name: string;
}

export interface PublicReview {
  id: string;
  customerName: string;
  serviceName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export async function getPublicServices(params: {
  q?: string;
  category?: string;
  page?: number;
  limit?: number;
} = {}): Promise<{ items: PublicServiceItem[]; page: number; limit: number }> {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.category) qs.set('category', params.category);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`services${suffix}`);
}

export async function getPublicServiceDetail(id: string): Promise<PublicServiceDetail> {
  return apiFetch(`services/${encodeURIComponent(id)}`);
}

export async function getPublicReviews(): Promise<{ items: PublicReview[] }> {
  try {
    return await apiFetch<{ items: PublicReview[] }>('reviews/public');
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404 || status === 501) return { items: [] };
    throw err;
  }
}
