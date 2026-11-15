/** Numbered pager as in Figma (‹ 1 2 3 4 5 … 26 ›): current page filled green, prev/next arrows, "…" collapses the middle. */
export function pageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const start = Math.max(2, Math.min(current - 1, total - 4));
  const end = Math.min(total - 1, Math.max(current + 1, 5));
  if (start > 2) out.push('…');
  for (let p = start; p <= end; p++) out.push(p);
  if (end < total - 1) out.push('…');
  out.push(total);
  return out;
}

export function Pagination({ page, totalPages, onChange, busy = false }: { page: number; totalPages: number; onChange: (page: number) => void; busy?: boolean }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="pager" aria-label="Phân trang">
      <button type="button" className="pager-btn pager-arrow" aria-label="Trang trước" disabled={page <= 1 || busy} onClick={() => onChange(page - 1)}>‹</button>
      {pageWindow(page, totalPages).map((p, i) => p === '…'
        ? <span key={`gap${i}`} className="pager-gap" aria-hidden="true">…</span>
        : <button key={p} type="button" className={`pager-btn${p === page ? ' is-current' : ''}`} aria-label={`Trang ${p}`} aria-current={p === page ? 'page' : undefined} disabled={busy && p !== page} onClick={() => p !== page && onChange(p)}>{p}</button>)}
      <button type="button" className="pager-btn pager-arrow" aria-label="Trang sau" disabled={page >= totalPages || busy} onClick={() => onChange(page + 1)}>›</button>
    </nav>
  );
}
