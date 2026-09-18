/* eslint-disable jsx-a11y/interactive-supports-focus -- in the segmented control the radios inside the group take focus */
import { forwardRef, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { MenuPopup, type MenuEntry } from './Menu';
import { Tooltip } from './Tooltip';

export interface MenuButtonProps {
  /** Accessible name and tooltip. */
  label: string;
  /** Visible text; leave out for an icon-only button. */
  children?: ReactNode;
  icon?: LucideIcon;
  /** The menu's items, built when it opens so they're current. */
  items: () => MenuEntry[];
  description?: string;
  className?: string;
}

/** A toolbar button that opens a menu. Down, Enter or Space opens it with the first item focused. */
export function MenuButton({ label, children, icon: Icon, items, description, className }: MenuButtonProps) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState<'first' | 'last' | 'none' | null>(null);
  return (
    <>
      <Tooltip title={label} description={description} describe={false}>
        <button
          ref={ref}
          type="button"
          className={`ui-btn ui-btn--tool ui-menu-button${className ? ` ${className}` : ''}`}
          aria-haspopup="menu"
          aria-expanded={open !== null}
          // A button showing a current value ("Lit") is named for what it sets: "View mode: Lit".
          aria-label={children === undefined ? label : typeof children === 'string' && children !== label ? `${label}: ${children}` : undefined}
          onClick={() => setOpen(open ? null : 'none')}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') setOpen('first');
            else if (e.key === 'ArrowUp') setOpen('last');
            else return;
            e.preventDefault();
          }}
        >
          {Icon && <Icon className="ui-icon" aria-hidden="true" strokeWidth={1.75} />}
          {children !== undefined && <span className="ui-btn-label">{children}</span>}
          <ChevronDown className="ui-icon ui-menu-button-chevron" aria-hidden="true" />
        </button>
      </Tooltip>
      {open !== null && ref.current && (
        <MenuPopup
          items={items()}
          label={label}
          anchor={ref.current}
          initialFocus={open}
          onClose={(reason) => {
            setOpen(null);
            if (reason === 'escape') ref.current?.focus();
          }}
        />
      )}
    </>
  );
}

export interface SplitButtonProps {
  /** The main button: its own element, usually a Button or ToggleButton. */
  main: ReactNode;
  /** Accessible name of the arrow, e.g. "More visibility options". */
  menuLabel: string;
  items: () => MenuEntry[];
  className?: string;
}

/** A button with a separate arrow that opens related actions. */
export const SplitButton = forwardRef<HTMLDivElement, SplitButtonProps>(function SplitButton({ main, menuLabel, items, className }, ref) {
  const arrowRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState<'first' | 'last' | 'none' | null>(null);
  return (
    <div ref={ref} className={`ui-split${className ? ` ${className}` : ''}`}>
      {main}
      <button
        ref={arrowRef}
        type="button"
        className="ui-btn ui-btn--tool ui-split-arrow"
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={open !== null}
        onClick={() => setOpen(open ? null : 'none')}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') setOpen('first');
          else return;
          e.preventDefault();
        }}
      >
        <ChevronDown className="ui-icon" aria-hidden="true" />
      </button>
      {open !== null && arrowRef.current && (
        <MenuPopup
          items={items()}
          label={menuLabel}
          anchor={arrowRef.current}
          initialFocus={open}
          onClose={(reason) => {
            setOpen(null);
            if (reason === 'escape') arrowRef.current?.focus();
          }}
        />
      )}
    </div>
  );
});

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  description?: string;
}

export interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  disabledReason?: string | null;
  className?: string;
}

/** Joined buttons for one choice of a few: a radio group, so arrow keys move and choose. */
export function Segmented<T extends string>({ label, value, options, onChange, disabledReason, className }: SegmentedProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null);
  const at = Math.max(0, options.findIndex((o) => o.value === value));
  const choose = (index: number) => {
    const option = options[(index + options.length) % options.length]!;
    if (!disabledReason) onChange(option.value);
    groupRef.current?.querySelector<HTMLElement>(`[data-value="${option.value}"]`)?.focus();
  };
  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={label}
      className={`ui-segmented${className ? ` ${className}` : ''}`}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') choose(at + 1);
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') choose(at - 1);
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const checked = option.value === value;
        return (
          <Tooltip key={option.value} title={option.label} description={disabledReason ?? option.description} describe={false}>
            <button
              type="button"
              role="radio"
              aria-checked={checked}
              aria-disabled={disabledReason ? true : undefined}
              // One tab stop: the chosen option, as in a native radio group.
              tabIndex={checked ? 0 : -1}
              data-value={option.value}
              data-roving
              className={`ui-btn ui-btn--tool ui-segment${checked ? ' is-checked' : ''}`}
              onClick={() => !disabledReason && onChange(option.value)}
            >
              {Icon && <Icon className="ui-icon" aria-hidden="true" strokeWidth={1.75} />}
              <span className="ui-btn-label">{option.label}</span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
