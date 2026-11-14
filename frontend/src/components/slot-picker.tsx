import { useMemo, useState } from 'react';

/** Asia/Ho_Chi_Minh helpers (the spa's wall clock; never the browser's time zone). */
export const vnToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
export const vnNowMinutes = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return Number(p.hour) * 60 + Number(p.minute);
};
export const toMinutes = (time: string) => { const [h, m] = time.slice(0, 5).split(':').map(Number); return h * 60 + m; };
export const fromMinutes = (total: number) => `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
export const OPEN_MIN = 8 * 60;
export const CLOSE_MIN = 22 * 60;
export const ALL_SLOTS = Array.from({ length: (CLOSE_MIN - OPEN_MIN) / 30 }, (_, i) => fromMinutes(OPEN_MIN + i * 30));

/**
 * Slot state for one day: a slot is unavailable when it is in the past (today only, Vietnam time) or when the service (duration minutes) would end after the 22:00 closing time.
 * The backend still decides bed conflicts; this only prevents picking something that can never be valid.
 */
export function slotState(date: string, slot: string, durationMin: number): 'ok' | 'past' | 'late' {
  const start = toMinutes(slot);
  if (date < vnToday() || (date === vnToday() && start <= vnNowMinutes())) return 'past';
  if (start + durationMin > CLOSE_MIN) return 'late';
  return 'ok';
}

/** Figma UC_5 time picker: 4-column grid of 30-minute chips, the chosen one filled green, unavailable ones disabled. */
export function TimeSlotGrid({ date, value, onChange, durationMin, invalid = false, label = 'Giờ hẹn' }: {
  date: string; value: string; onChange: (slot: string) => void; durationMin: number; invalid?: boolean; label?: string;
}) {
  return (
    <div className={`slot-grid${invalid ? ' slot-grid-invalid' : ''}`} role="radiogroup" aria-label={label}>
      {ALL_SLOTS.map((slot) => {
        const state = date ? slotState(date, slot, durationMin) : 'ok';
        const chosen = value === slot;
        return (
          <button key={slot} type="button" role="radio" aria-checked={chosen} disabled={state !== 'ok'} className={`slot-chip${chosen ? ' is-selected' : ''}`}
            title={state === 'past' ? 'Khung giờ đã qua' : state === 'late' ? 'Dịch vụ phải kết thúc trước 22:00' : undefined} onClick={() => onChange(slot)}>
            {slot}
          </button>
        );
      })}
    </div>
  );
}

const WEEK = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Figma UC_5.3 month calendar: Monday-first grid, past days disabled, the chosen day filled, the booking's current day ringed. */
export function MonthCalendar({ value, onChange, currentDate }: { value: string; onChange: (iso: string) => void; currentDate?: string }) {
  const today = vnToday();
  const base = value || today;
  const [view, setView] = useState({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) });
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(view.y, view.m - 1, 1));
    const lead = (first.getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(view.y, view.m, 0)).getUTCDate();
    const prevDays = new Date(Date.UTC(view.y, view.m - 1, 0)).getUTCDate();
    const out: { iso: string; day: number; other: boolean }[] = [];
    for (let i = lead; i > 0; i--) { const d = prevDays - i + 1; const pm = view.m === 1 ? 12 : view.m - 1; const py = view.m === 1 ? view.y - 1 : view.y; out.push({ iso: `${py}-${pad(pm)}-${pad(d)}`, day: d, other: true }); }
    for (let d = 1; d <= days; d++) out.push({ iso: `${view.y}-${pad(view.m)}-${pad(d)}`, day: d, other: false });
    while (out.length % 7) { const d = out.length - lead - days + 1; const nm = view.m === 12 ? 1 : view.m + 1; const ny = view.m === 12 ? view.y + 1 : view.y; out.push({ iso: `${ny}-${pad(nm)}-${pad(d)}`, day: d, other: true }); }
    return out;
  }, [view]);
  const step = (delta: number) => setView((v) => { const t = v.m - 1 + delta; return { y: v.y + Math.floor(t / 12), m: ((t % 12) + 12) % 12 + 1 }; });
  const minMonth = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7));
  return (
    <div className="month-cal" role="group" aria-label={`Lịch tháng ${view.m} năm ${view.y}`}>
      <div className="month-cal-head">
        <button type="button" aria-label="Tháng trước" disabled={view.y * 12 + view.m <= minMonth} onClick={() => step(-1)}>‹</button>
        <strong>Tháng {view.m}, {view.y}</strong>
        <button type="button" aria-label="Tháng sau" onClick={() => step(1)}>›</button>
      </div>
      <div className="month-cal-grid">
        {WEEK.map((w) => <span key={w} className="month-cal-dow">{w}</span>)}
        {cells.map((c) => {
          const past = c.iso < today;
          return (
            <button key={c.iso} type="button" disabled={past} aria-pressed={value === c.iso} aria-label={`${pad(c.day)}/${c.iso.slice(5, 7)}/${c.iso.slice(0, 4)}`}
              className={`month-cal-day${c.other ? ' is-other' : ''}${value === c.iso ? ' is-selected' : ''}${currentDate === c.iso ? ' is-current' : ''}`}
              onClick={() => { onChange(c.iso); if (c.other) setView({ y: Number(c.iso.slice(0, 4)), m: Number(c.iso.slice(5, 7)) }); }}>
              {c.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const formatDateVn = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');

/** Date field that always shows dd/mm/yyyy (Vietnamese order; the native input followed the browser locale and showed mm/dd/yyyy) and opens the month calendar. */
export function DateField({ value, onChange, invalid = false, id, currentDate }: { value: string; onChange: (iso: string) => void; invalid?: boolean; id?: string; currentDate?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="date-field">
      <button id={id} type="button" className={`date-field-button${invalid ? ' is-invalid' : ''}`} aria-haspopup="dialog" aria-expanded={open} aria-invalid={invalid} onClick={() => setOpen((v) => !v)}>
        <span>{value ? formatDateVn(value) : 'dd/mm/yyyy'}</span>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>
      </button>
      {open && <MonthCalendar value={value} currentDate={currentDate} onChange={(iso) => { onChange(iso); setOpen(false); }} />}
    </div>
  );
}
