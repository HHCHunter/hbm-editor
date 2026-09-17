import type { ReactNode } from 'react';
import { CircleAlert, Inbox, LoaderCircle, WifiOff, type LucideIcon } from 'lucide-react';
import { Button } from './Button';

const ICONS: Record<PanelStateProps['variant'], LucideIcon> = {
  loading: LoaderCircle,
  empty: Inbox,
  error: CircleAlert,
  offline: WifiOff,
};

export interface PanelStateProps {
  variant: 'loading' | 'empty' | 'error' | 'offline';
  title: ReactNode;
  message?: ReactNode;
  action?: { label: string; onClick: () => void };
  /** Fill the panel and centre, or sit inline at the top of a list. */
  layout?: 'fill' | 'inline';
}

/**
 * What a panel shows instead of its content: while loading, when there's nothing to show, or when
 * the content couldn't be read. Always says what happened and, where possible, what to do next.
 */
export function PanelState({ variant, title, message, action, layout = 'fill' }: PanelStateProps) {
  const Icon = ICONS[variant];
  const urgent = variant === 'error' || variant === 'offline';
  return (
    <div
      className={`ui-panel-state ui-panel-state--${variant} ui-panel-state--${layout}`}
      role={urgent ? 'alert' : 'status'}
      aria-busy={variant === 'loading' || undefined}
    >
      <Icon className={`ui-panel-state-icon${variant === 'loading' ? ' is-spinning' : ''}`} aria-hidden="true" strokeWidth={1.5} />
      <div className="ui-panel-state-text">
        <div className="ui-panel-state-title">{title}</div>
        {message && <div className="ui-panel-state-message">{message}</div>}
      </div>
      {action && <Button onClick={action.onClick}>{action.label}</Button>}
    </div>
  );
}
