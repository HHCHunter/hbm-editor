import { useEffect, type ReactNode } from 'react';
import { create } from 'zustand';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { Button } from './Button';

// ---------------------------------------------------------------- badge

export interface BadgeProps {
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';
  children: ReactNode;
  title?: string;
}

export function Badge({ tone = 'neutral', children, title }: BadgeProps) {
  return (
    <span className={`ui-badge ui-badge--${tone}`} title={title}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- progress

export interface ProgressBarProps {
  label: string;
  /** Leave out for work of unknown length. */
  value?: number;
  max?: number;
  /** Text beside the bar, e.g. "120 / 400". */
  detail?: ReactNode;
}

export function ProgressBar({ label, value, max = 100, detail }: ProgressBarProps) {
  const known = value !== undefined;
  const pct = known ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="ui-progress">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={known ? 0 : undefined}
        aria-valuemax={known ? max : undefined}
        aria-valuenow={known ? value : undefined}
        className={`ui-progress-track${known ? '' : ' is-indeterminate'}`}
      >
        <div className="ui-progress-fill" style={known ? { width: `${pct}%` } : undefined} />
      </div>
      {detail && <span className="ui-progress-detail">{detail}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- toasts

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ToastSpec {
  kind: ToastKind;
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
  /** How long it stays, in ms. Errors stay until dismissed unless set. */
  duration?: number;
}

interface ToastEntry extends ToastSpec {
  id: number;
}

interface ToastStore {
  toasts: ToastEntry[];
  show: (spec: ToastSpec) => number;
  dismiss: (id: number) => void;
}

let nextToast = 1;
const MAX_TOASTS = 4;

export const useToasts = create<ToastStore>()((set) => ({
  toasts: [],
  show: (spec) => {
    const id = nextToast++;
    set((s) => ({ toasts: [...s.toasts, { ...spec, id }].slice(-MAX_TOASTS) }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Show a transient notification. */
export const toast = (spec: ToastSpec) => useToasts.getState().show(spec);

const TOAST_ICONS: Record<ToastKind, LucideIcon> = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleAlert };

function ToastView({ entry }: { entry: ToastEntry }) {
  const dismiss = useToasts((s) => s.dismiss);
  const duration = entry.duration ?? (entry.kind === 'error' ? 0 : 6000);
  useEffect(() => {
    if (!duration) return;
    const timer = setTimeout(() => dismiss(entry.id), duration);
    return () => clearTimeout(timer);
  }, [duration, dismiss, entry.id]);
  const Icon = TOAST_ICONS[entry.kind];
  return (
    <div className={`ui-toast ui-toast--${entry.kind}`}>
      <Icon className="ui-toast-icon" aria-hidden="true" strokeWidth={1.75} />
      <div className="ui-toast-text">
        <div className="ui-toast-title">{entry.title}</div>
        {entry.message && <div className="ui-toast-message">{entry.message}</div>}
      </div>
      {entry.action && (
        <Button
          variant="link"
          onClick={() => {
            entry.action!.onClick();
            dismiss(entry.id);
          }}
        >
          {entry.action.label}
        </Button>
      )}
      <button type="button" className="ui-toast-close" aria-label={`Dismiss: ${entry.title}`} onClick={() => dismiss(entry.id)}>
        <X className="ui-icon" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Where toasts appear. Errors are announced at once; the rest politely. Render once per app. */
export function ToastRegion() {
  const toasts = useToasts((s) => s.toasts);
  const urgent = toasts.filter((t) => t.kind === 'error');
  const calm = toasts.filter((t) => t.kind !== 'error');
  return (
    <div className="ui-toasts">
      <div role="log" aria-live="polite" aria-label="Notifications" className="ui-toast-stack">
        {calm.map((t) => (
          <ToastView key={t.id} entry={t} />
        ))}
      </div>
      <div role="alert" aria-live="assertive" className="ui-toast-stack">
        {urgent.map((t) => (
          <ToastView key={t.id} entry={t} />
        ))}
      </div>
    </div>
  );
}
