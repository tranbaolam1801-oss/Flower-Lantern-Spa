import { Pagination } from '../components/pagination';
import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ManagementLayout } from '../components/management-layout';
import { Button } from '../components/ui/button';
import { useAuth } from '../contexts/auth-context';
import {
  getReviewDetail,
  listReviews,
  replyToReview,
  type ReviewItem,
} from '../lib/management-api';

const REVIEWS_PER_PAGE = 5; // Figma UC_4 shows 5 rows per page

const ico = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const IUser = () => <svg {...ico}><circle cx="12" cy="8" r="4" /><path d="M4.5 21c.7-4 3.5-6 7.5-6s6.8 2 7.5 6" /></svg>;
const IStar = () => <svg {...ico}><path d="m12 4 2.4 5 5.4.7-4 3.8 1 5.4L12 16.3 7.2 19l1-5.4-4-3.8 5.4-.7z" /></svg>;
const IBox = () => <svg {...ico}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12v9M4 7.5 12 12l8-4.5" /></svg>;
const ICal = () => <svg {...ico}><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>;
const IMsg = () => <svg {...ico}><path d="M20 4H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h3v4l5-4h8a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1Z" /></svg>;
const IReply = () => <svg {...ico}><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 6 6v3" /></svg>;
const IServ = () => <svg {...ico}><path d="M12 21v-8" /><path d="M12 13c-3 0-5-2-5-5 3 0 5 2 5 5Zm0 0c3 0 5-2 5-5-3 0-5 2-5 5Z" /></svg>;
/** Figma stars: filled in the rating colour, the rest grey. */
/** ISO / 'YYYY-MM-DD HH:mm' -> dd/mm/yyyy HH:mm (Figma). Instants without a zone are treated as already local. */
const fmtDateTime = (v: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(v ?? ''); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : v; };
const Stars = ({ n }: { n: number }) => <span className="rv-stars" aria-label={`${n} trên 5 sao`}>{[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= n ? 'on' : 'off'}>★</span>)}</span>;
const Quote = ({ children, tone = 'green' }: { children: React.ReactNode; tone?: 'green' | 'pink' }) => <div className={`rv-quote rv-quote-${tone}`}><span className="rv-quote-mark" aria-hidden="true">“</span><p>{children}</p></div>;

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

export function AdminReviewsPage() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [notice, setNotice] = useState('');

  const [detailId, setDetailId] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<ReviewItem | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyError, setReplyError] = useState('');
  const [replyFieldError, setReplyFieldError] = useState('');

  const replyDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(text.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [text]);

  const allowed = user?.role === 'Chủ Spa' || user?.permissions.includes('Q03');
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [q, status]); // a new search/filter always starts at page 1
  const query = useQuery({
    queryKey: ['admin-reviews', q, status, page],
    queryFn: () => listReviews({ q, status, page, limit: REVIEWS_PER_PAGE }),
    enabled: !!allowed,
    placeholderData: keepPreviousData,
  });

  const detailQuery = useQuery({
    queryKey: ['admin-review-detail', detailId],
    queryFn: () => getReviewDetail(detailId!),
    enabled: !!detailId,
  });

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const replyMutation = useMutation({
    mutationFn: () => replyToReview(replyTarget!.id, replyContent.trim()),
    onSuccess: async () => {
      replyDialog.current?.close();
      setReplyTarget(null);
      setReplyContent('');
      setNotice('Gửi phản hồi thành công!');
      await cache.invalidateQueries({ queryKey: ['admin-reviews'] });
      if (detailId) await cache.invalidateQueries({ queryKey: ['admin-review-detail', detailId] });
    },
    onError: (err: { message?: string }) => {
      setReplyError(err?.message ?? 'Không thể gửi phản hồi. Vui lòng thử lại!');
    },
  });

  const openReply = (item: ReviewItem) => {
    setReplyTarget(item);
    setReplyContent(item.reply?.content ?? '');
    setReplyError('');
    setReplyFieldError('');
    replyDialog.current?.showModal();
  };

  const submitReply = (e: React.FormEvent) => {
    e.preventDefault();
    setReplyError('');
    setReplyFieldError('');
    if (!replyContent.trim()) {
      setReplyFieldError('Vui lòng nhập nội dung phản hồi!');
      return;
    }
    replyMutation.mutate();
  };

  return (
    <ManagementLayout active="Q03">
      <div className="figma-admin-stack" aria-label="Quản lý đánh giá và phản hồi">
        <h1 className="sr-only">Quản lý đánh giá &amp; phản hồi</h1>
        {notice && (
          <p role="status" className="rv-toast">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16 9.6" /></svg>
            {notice}
          </p>
        )}

        {!allowed ? (
          <p role="alert" className="admin-panel-card">Bạn không có quyền quản lý đánh giá và phản hồi.</p>
        ) : detailId ? (
          /* UC_4.1 Chi tiết đánh giá full-panel theo Figma 1:478 / 1:573 */
          <div className="figma-admin-stack">
            <div>
              <button
                type="button"
                className="figma-back-pill"
                onClick={() => setDetailId(null)}
              >
                ← Quay lại danh sách
              </button>
            </div>
            {detailQuery.isPending ? (
              <p role="status" className="admin-panel-card">Đang tải chi tiết đánh giá…</p>
            ) : detailQuery.isError ? (
              <div role="alert" className="admin-panel-card review-state-error">
                <p>
                  {(detailQuery.error as { status?: number })?.status === 404
                    ? 'Không tìm thấy thông tin đánh giá!'
                    : 'Không thể tải thông tin đánh giá. Vui lòng thử lại!'}
                </p>
                <Button type="button" size="sm" variant="outline" onClick={() => void detailQuery.refetch()}>
                  Thử lại
                </Button>
              </div>
            ) : detailQuery.data ? (
              <>
                <section className="rv-card" aria-labelledby="rv-info-title">
                  <h2 id="rv-info-title" className="rv-card-title"><span className="rv-card-icon"><IMsg /></span>Thông tin đánh giá</h2>
                  <div className="rv-grid">
                    <div className="rv-row"><span className="rv-label"><IUser />Khách hàng</span><strong className="rv-value">{detailQuery.data.customerName}</strong></div>
                    <div className="rv-row"><span className="rv-label"><IStar />Số sao</span><span className="rv-value rv-value-stars"><Stars n={detailQuery.data.rating} /><span className="rv-score">{detailQuery.data.rating}/5</span></span></div>
                    <div className="rv-row"><span className="rv-label"><IServ />Dịch vụ</span><span className="rv-value">{detailQuery.data.serviceName}</span></div>
                    <div className="rv-row"><span className="rv-label"><IBox />Gói dịch vụ</span><span className="rv-value">{detailQuery.data.packageName || '—'}</span></div>
                    <div className="rv-row"><span className="rv-label"><ICal />Ngày đánh giá</span><span className="rv-value">{fmtDateTime(detailQuery.data.createdAt)}</span></div>
                    <div className="rv-row"><span className="rv-label"><IMsg />Trạng thái phản hồi</span>
                      <span className={`pill-status ${detailQuery.data.status === 'Đã phản hồi' ? 'pill-ok' : 'pill-warn'}`}>{detailQuery.data.status}</span></div>
                  </div>
                </section>

                <section className="rv-card" aria-labelledby="rv-comment-title">
                  <h2 id="rv-comment-title" className="rv-card-title"><span className="rv-card-icon"><IMsg /></span>Nội dung đánh giá</h2>
                  <Quote>{detailQuery.data.comment || 'Không có bình luận.'}</Quote>
                </section>

                <section className="rv-card" aria-labelledby="rv-reply-title">
                  <div className="rv-card-head">
                    <h2 id="rv-reply-title" className="rv-card-title"><span className="rv-card-icon"><IReply /></span>Nội dung phản hồi</h2>
                    {!detailQuery.data.reply && (
                      <button type="button" className="rv-reply-btn" onClick={() => openReply(detailQuery.data)}><IReply />Phản hồi</button>
                    )}
                  </div>
                  {detailQuery.data.reply ? (
                    <>
                      <Quote tone="pink">{detailQuery.data.reply.content}</Quote>
                    </>
                  ) : (
                    <p className="review-no-reply">Chưa có phản hồi cho đánh giá này.</p>
                  )}
                </section>
              </>
            ) : null}
          </div>
        ) : (
          /* UC_4 Danh sách đánh giá khớp Figma 1:1441 (2 card tách rời) */
          <>
            <section className="figma-toolbar-card">
              <label className="customer-search-input">
                <img src="/assets/customer-imgGroup.svg" alt="" />
                <input
                  aria-label="Tìm theo mã, tên khách hàng hoặc dịch vụ"
                  placeholder="Tìm theo mã, tên khách hàng hoặc dịch vụ..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <select
                className="spa-select-toolbar"
                aria-label="Lọc trạng thái phản hồi"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                }}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="Chưa phản hồi">Chưa phản hồi</option>
                <option value="Đã phản hồi">Đã phản hồi</option>
              </select>
              <Button type="button" className="figma-filter-submit" onClick={() => void query.refetch()}>
                <FilterIcon />
                Lọc
              </Button>
            </section>

            <section className="admin-panel-card">
              {query.isPending ? (
                <p role="status">Đang tải danh sách đánh giá…</p>
              ) : query.isError ? (
                <div role="alert" className="review-state-error">
                  <p>Không thể tải kết quả tìm kiếm. Vui lòng thử lại!</p>
                  <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>
                    Thử lại
                  </Button>
                </div>
              ) : (
                <>
                  <div className="customer-search-scroll">
                    <table className="customer-search-table figma-admin-table rv-list">
                      <thead>
                        <tr>
                          <th>Mã đánh giá</th>
                          <th>Khách hàng</th>
                          <th>Dịch vụ</th>
                          <th>Số sao</th>
                          <th>Trạng thái</th>
                          <th>Hành động</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(query.data?.items ?? []).map((r) => (
                          <tr key={r.id}>
                            <td>{r.id}</td>
                            <td><strong>{r.customerName}</strong></td>
                            <td>{r.serviceName}</td>
                            <td className="star-cell">{'★'.repeat(r.rating)}{'☆'.repeat(Math.max(0, 5 - r.rating))}</td>
                            <td>
                              <span className={`pill-status ${r.status === 'Đã phản hồi' ? 'pill-ok' : 'pill-warn'}`}>
                                {r.status}
                              </span>
                            </td>
                            <td>
                              <div className="figma-row-actions">
                                <button
                                  type="button"
                                  className="figma-icon-btn figma-icon-view"
                                  aria-label={`Xem đánh giá ${r.id}`}
                                  title="Xem chi tiết"
                                  onClick={() => setDetailId(r.id)}
                                >
                                  <EyeIcon />
                                </button>
                                <button
                                  type="button"
                                  className={`figma-reply-pill ${r.status === 'Đã phản hồi' ? 'replied' : ''}`}
                                  onClick={() => openReply(r)}
                                >
                                  ↩ Phản hồi
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {(query.data?.items.length ?? 0) === 0 && (
                    <p className="customer-search-empty" role="status">
                      Không tìm thấy đánh giá phù hợp!
                    </p>
                  )}
                  <Pagination page={query.data?.page ?? page} totalPages={query.data?.totalPages ?? 1} busy={query.isFetching} onChange={(next) => { setPage(next); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
                </>
              )}
            </section>
          </>
        )}
      </div>

      {/* UC_4.2 Modal Phản hồi đánh giá khớp Figma 1:947 */}
      <dialog ref={replyDialog} className="rv-modal" aria-labelledby="reply-modal-title">
        <form onSubmit={submitReply} noValidate>
          <div className="rv-modal-body">
            <h2 id="reply-modal-title">Phản hồi đánh giá</h2>
            {replyTarget && (
              <>
                <dl className="rv-modal-info">
                  <div><dt><IUser />Khách hàng</dt><dd>{replyTarget.customerName}</dd></div>
                  <div><dt><IServ />Dịch vụ</dt><dd>{replyTarget.serviceName}</dd></div>
                  <div><dt><IStar />Số sao</dt><dd className="rv-value-stars rv-stars-gold"><Stars n={replyTarget.rating} /><span className="rv-score">{replyTarget.rating}/5</span></dd></div>
                </dl>
                <Quote>{replyTarget.comment || 'Không có nội dung bình luận.'}</Quote>
              </>
            )}
            <label className={`rv-reply-field${replyFieldError ? ' is-invalid' : ''}`}>
              <span className="sr-only">Nội dung phản hồi</span>
              <textarea
                rows={5}
                value={replyContent}
                onChange={(e) => { setReplyContent(e.target.value); if (replyFieldError) setReplyFieldError(''); }}
                placeholder="Nhập nội dung phản hồi..."
                aria-invalid={!!replyFieldError}
              />
              {replyFieldError && <small role="alert" className="rv-field-error">{replyFieldError}</small>}
            </label>
            {replyError && <p role="alert" className="rv-save-error"><svg {...ico} width={18} height={18}><path d="M12 3 2 20h20Z" /><path d="M12 10v5M12 18h.01" /></svg>{replyError}</p>}
          </div>
          <div className="rv-modal-foot">
            <button type="button" className="rv-btn-outline" onClick={() => replyDialog.current?.close()}>Hủy</button>
            <button type="submit" className="rv-btn-primary" disabled={replyMutation.isPending}>{replyMutation.isPending ? 'Đang gửi…' : 'Gửi phản hồi'}</button>
          </div>
        </form>
      </dialog>
    </ManagementLayout>
  );
}
