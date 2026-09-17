/* eslint-disable jsx-a11y/interactive-supports-focus -- the tabs inside the tablist are the focusable elements */
import type { ReactNode } from 'react';
import { useRovingFocus } from './hooks/useRovingFocus';

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  shortcut?: string;
}

export interface TabsProps<T extends string> {
  label: string;
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Prefix for tab and panel ids, so TabPanel can point back at its tab. */
  idPrefix: string;
  className?: string;
}

export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
export const panelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

/** A tab list: arrow keys move between tabs and select them (automatic activation). */
export function Tabs<T extends string>({ label, tabs, value, onChange, idPrefix, className }: TabsProps<T>) {
  const roving = useRovingFocus<HTMLDivElement>({ orientation: 'horizontal' });
  return (
    <div
      ref={roving.ref}
      role="tablist"
      aria-label={label}
      className={`ui-tabs${className ? ` ${className}` : ''}`}
      onKeyDown={roving.onKeyDown}
      onFocus={(e) => {
        roving.onFocus(e);
        const id = (e.target as HTMLElement).dataset.tab as T | undefined;
        if (id && id !== value) onChange(id);
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={tabId(idPrefix, tab.id)}
          data-tab={tab.id}
          aria-selected={tab.id === value}
          aria-controls={panelId(idPrefix, tab.id)}
          aria-keyshortcuts={tab.shortcut}
          className={`ui-tab${tab.id === value ? ' is-selected' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export interface TabPanelProps {
  idPrefix: string;
  id: string;
  hidden?: boolean;
  className?: string;
  children: ReactNode;
}

export function TabPanel({ idPrefix, id, hidden, className, children }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={panelId(idPrefix, id)}
      aria-labelledby={tabId(idPrefix, id)}
      hidden={hidden}
      className={className}
    >
      {children}
    </div>
  );
}
