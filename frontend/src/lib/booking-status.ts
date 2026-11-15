/** Stored status 'Đã đến' is the "service in progress" step that must precede 'Hoàn thành'; staff see it as "Đang thực hiện". */
export const statusLabel = (status: string) => (status === 'Đã đến' ? 'Đang thực hiện' : status);
