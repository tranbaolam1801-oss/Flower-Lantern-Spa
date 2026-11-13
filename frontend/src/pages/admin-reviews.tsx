import { useContinuousList, ContinuousListEnd } from '../components/continuous-list';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ManagementLayout } from '../components/management-layout';
import { Button } from '../components/ui/button';
import { useAuth } from '../contexts/auth-context';
import {
  getReviewDetail,
  listReviews,
  replyToReview,
  type ReviewItem,
} from '../lib/management-api';

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
  const query = useContinuousList({
    queryKey: ['admin-reviews', q, status],
    queryFn: (page) => listReviews({ q, status, page }),
    enabled: !!allowed,
  });

  const detailQuery = useQuery({
    queryKey: ['admin-review-detail', detailId],
    queryFn: () => getReviewDetail(detailId!),
    enabled: !!detailId,
  });

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
        {notice && <p role="status" className="spa-toast-success">{notice}</p>}

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
                <section className="admin-panel-card">
                  <h2 className="figma-card-title">Thông tin đánh giá</h2>
                  <div className="review-meta-grid">
                    <div><span>Khách hàng</span><strong>{detailQuery.data.customerName}</strong></div>
                    <div>
                      <span>Số sao</span>
                      <strong className="star-cell">
                        {'★'.repeat(detailQuery.data.rating)}{'☆'.repeat(Math.max(0, 5 - detailQuery.data.rating))} ({detailQuery.data.rating}/5)
                      </strong>
                    </div>
                    <div><span>Dịch vụ</span><strong>{detailQuery.data.serviceName}</strong></div>
                    <div><span>Gói dịch vụ</span><strong>{detailQuery.data.packageName || '—'}</strong></div>
                    <div><span>Ngày đánh giá</span><strong>{detailQuery.data.createdAt}</strong></div>
                    <div>
                      <span>Trạng thái phản hồi</span>
                      <span className={`pill-status ${detailQuery.data.status === 'Đã phản hồi' ? 'pill-ok' : 'pill-warn'}`}>
                        {detailQuery.data.status}
                      </span>
                    </div>
                  </div>
                </section>

                <section className="admin-panel-card">
                  <h2 className="figma-card-title">Nội dung đánh giá</h2>
                  <blockquote className="review-quote">
                    {detailQuery.data.comment || 'Không có bình luận.'}
                  </blockquote>
                </section>

                <section className="admin-panel-card">
                  <div className="review-reply-head">
                    <h2 className="figma-card-title" style={{ margin: 0 }}>Nội dung phản hồi</h2>
                    {!detailQuery.data.reply && (
                      <Button type="button" size="sm" onClick={() => openReply(detailQuery.data)}>
                        ↩ Phản hồi
                      </Button>
                    )}
                  </div>
                  {detailQuery.data.reply ? (
                    <div className="review-reply-box">
                      <p>{detailQuery.data.reply.content}</p>
                      <small>Phản hồi bởi {detailQuery.data.reply.staffName} · {detailQuery.data.reply.repliedAt}</small>
                    </div>
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
                    <table className="customer-search-table figma-admin-table">
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
                  <ContinuousListEnd query={query}/>
                </>
              )}
            </section>
          </>
        )}
      </div>

      {/* UC_4.2 Modal Phản hồi đánh giá khớp Figma 1:947 */}
      <dialog ref={replyDialog} className="spa-modal spa-modal-tinted" aria-labelledby="reply-modal-title">
        <div className="spa-modal-header">
          <h2 id="reply-modal-title">Phản hồi đánh giá</h2>
          <button type="button" className="spa-modal-close" onClick={() => replyDialog.current?.close()}>×</button>
        </div>
        <form onSubmit={submitReply} noValidate>
          <div className="spa-modal-body">
            {replyTarget && (
              <>
                <dl className="detail-kv-list">
                  <div><dt>Khách hàng</dt><dd>{replyTarget.customerName}</dd></div>
                  <div><dt>Dịch vụ</dt><dd>{replyTarget.serviceName}</dd></div>
                  <div><dt>Số sao</dt><dd className="star-cell">{'★'.repeat(replyTarget.rating)} ({replyTarget.rating}/5)</dd></div>
                </dl>
                <blockquote className="review-quote">
                  {replyTarget.comment || 'Không có nội dung bình luận.'}
                </blockquote>
              </>
            )}
            <label className={`spa-field${replyFieldError ? ' spa-field-invalid' : ''}`}>
              <span>Nội dung phản hồi <em>*</em></span>
              <textarea
                rows={4}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Nhập nội dung phản hồi..."
                aria-invalid={!!replyFieldError}
              />
              {replyFieldError && <p role="alert" className="spa-field-error-text">{replyFieldError}</p>}
            </label>
            {replyError && <p role="alert" className="spa-form-error">⚠ {replyError}</p>}
          </div>
          <div className="spa-modal-footer">
            <Button type="button" size="sm" variant="outline" onClick={() => replyDialog.current?.close()}>
              Hủy
            </Button>
            <Button type="submit" size="sm" disabled={replyMutation.isPending}>
              {replyMutation.isPending ? 'Đang gửi…' : 'Gửi phản hồi'}
            </Button>
          </div>
        </form>
      </dialog>
    </ManagementLayout>
  );
}
