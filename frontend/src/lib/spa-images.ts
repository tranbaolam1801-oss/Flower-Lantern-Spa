/** Real photos supplied by the spa owner (frontend/public/assets/images/spa). Used where a service has no image of its own. */
export const SPA_IMAGES = {
  hotStone: '/assets/images/spa/service-hot-stone.jpg',
  lounge: '/assets/images/spa/gallery-lounge.jpg',
  storefront: '/assets/images/spa/gallery-storefront.jpg',
  interior: '/assets/images/spa/gallery-interior.jpg',
} as const;

/** Picks a fitting real photo for a service without an uploaded image (never the generic lotus artwork). */
export function serviceFallbackImage(name: string | undefined): string {
  const n = (name ?? '').toLowerCase();
  if (/đá nóng|da nong|hot stone/.test(n)) return SPA_IMAGES.hotStone;
  return SPA_IMAGES.interior;
}
