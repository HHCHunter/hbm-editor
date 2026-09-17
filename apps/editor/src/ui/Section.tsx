import { useId, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

const STORAGE_PREFIX = 'hbm-editor:section:';

function remembered(key: string | undefined, fallback: boolean): boolean {
  if (!key) return fallback;
  try {
    const saved = localStorage.getItem(STORAGE_PREFIX + key);
    return saved === null ? fallback : saved === '1';
  } catch {
    return fallback;
  }
}

function remember(key: string | undefined, open: boolean): void {
  if (!key) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, open ? '1' : '0');
  } catch {
    // Storage can be unavailable; the section just won't remember.
  }
}

export interface SectionProps {
  title: ReactNode;
  /** Shown muted after the title, e.g. a count. */
  meta?: ReactNode;
  defaultOpen?: boolean;
  /** Remember open or closed under this key. */
  persistKey?: string;
  /** Controls in the header, e.g. a filter toggle; clicks on them don't toggle the section. */
  actions?: ReactNode;
  /** A quieter style for raw or advanced detail. */
  tone?: 'default' | 'raw';
  children: ReactNode;
}

/** A collapsible group: a disclosure button heading its content. */
export function Section({ title, meta, defaultOpen = true, persistKey, actions, tone = 'default', children }: SectionProps) {
  const [open, setOpen] = useState(() => remembered(persistKey, defaultOpen));
  const contentId = useId();
  const toggle = () => {
    setOpen(!open);
    remember(persistKey, !open);
  };
  return (
    <section className={`ui-section ui-section--${tone}${open ? ' is-open' : ''}`}>
      <div className="ui-section-header">
        <button type="button" className="ui-section-toggle" aria-expanded={open} aria-controls={contentId} onClick={toggle}>
          <ChevronRight className="ui-icon ui-section-chevron" aria-hidden="true" strokeWidth={2} />
          <span className="ui-section-title">{title}</span>
          {meta !== undefined && <span className="ui-section-meta">{meta}</span>}
        </button>
        {actions && <div className="ui-section-actions">{actions}</div>}
      </div>
      <div id={contentId} className="ui-section-content" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
