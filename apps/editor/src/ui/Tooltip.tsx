import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { useMergedRef } from './hooks/useMergedRef';
import { usePopover } from './hooks/usePopover';
import { Kbd } from './Kbd';

const SHOW_DELAY_MS = 500;
const CARD_DELAY_MS = 350;
const CARD_HIDE_MS = 150;

type TriggerProps = {
  ref?: Ref<HTMLElement>;
  onPointerEnter?: (e: React.PointerEvent) => void;
  onPointerLeave?: (e: React.PointerEvent) => void;
  onFocus?: (e: React.FocusEvent) => void;
  onBlur?: (e: React.FocusEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  'aria-describedby'?: string;
};

export interface TooltipProps {
  /** What the control does, in a few words. */
  title: ReactNode;
  description?: ReactNode;
  /** A chord like "Ctrl+Shift+F". */
  shortcut?: string;
  children: ReactElement;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** Leave the trigger's accessible name alone and describe it instead. On by default. */
  describe?: boolean;
}

/**
 * A short explanation that appears after a moment's hover or at once on keyboard focus, and goes
 * away on Escape. The trigger must accept a ref, as every ui control does.
 */
export function Tooltip({ title, description, shortcut, children, placement = 'bottom', describe = true }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();
  const { refs, floatingStyles } = usePopover({ open, placement, gap: 6 });

  const show = useCallback((delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  }, []);
  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setOpen(false);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const child = children as ReactElement<TriggerProps> & { ref?: Ref<HTMLElement> };
  const props = child.props;
  const triggerRef = useMergedRef<HTMLElement>(refs.setReference, child.ref);
  const trigger = cloneElement(child, {
    ref: triggerRef,
    onPointerEnter: (e: React.PointerEvent) => {
      props.onPointerEnter?.(e);
      if (e.pointerType === 'mouse') show(SHOW_DELAY_MS);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      props.onPointerLeave?.(e);
      hide();
    },
    onPointerDown: (e: React.PointerEvent) => {
      props.onPointerDown?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      props.onFocus?.(e);
      if ((e.target as HTMLElement).matches?.(':focus-visible')) show(0);
    },
    onBlur: (e: React.FocusEvent) => {
      props.onBlur?.(e);
      hide();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        e.stopPropagation();
        hide();
      }
      props.onKeyDown?.(e);
    },
    'aria-describedby': describe && open ? [props['aria-describedby'], id].filter(Boolean).join(' ') : props['aria-describedby'],
  });

  return (
    <>
      {trigger}
      {open &&
        createPortal(
          <div ref={refs.setFloating} id={id} role="tooltip" className="ui-tooltip" style={floatingStyles}>
            <div className="ui-tooltip-title">
              <span>{title}</span>
              {shortcut && <Kbd chord={shortcut} />}
            </div>
            {description && <div className="ui-tooltip-description">{description}</div>}
          </div>,
          document.body,
        )}
    </>
  );
}

export interface HoverCardProps {
  /** Rich content, which may hold links; the card stays open while the pointer is over it. */
  content: ReactNode;
  children: ReactElement;
  label?: string;
}

/** A card of detail about a term, shown on hover or keyboard focus. */
export function HoverCard({ content, children, label }: HoverCardProps) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();
  const { refs, floatingStyles } = usePopover({ open, placement: 'bottom-start', gap: 4 });

  const later = (next: boolean, delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), delay);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const child = children as ReactElement<TriggerProps> & { ref?: Ref<HTMLElement> };
  const props = child.props;
  const triggerRef = useMergedRef<HTMLElement>(refs.setReference, child.ref);
  const trigger = cloneElement(child, {
    ref: triggerRef,
    onPointerEnter: (e: React.PointerEvent) => {
      props.onPointerEnter?.(e);
      if (e.pointerType === 'mouse') later(true, CARD_DELAY_MS);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      props.onPointerLeave?.(e);
      later(false, CARD_HIDE_MS);
    },
    onFocus: (e: React.FocusEvent) => {
      props.onFocus?.(e);
      later(true, 0);
    },
    onBlur: (e: React.FocusEvent) => {
      props.onBlur?.(e);
      later(false, CARD_HIDE_MS);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        e.stopPropagation();
        setOpen(false);
      }
      props.onKeyDown?.(e);
    },
    'aria-describedby': open ? [props['aria-describedby'], id].filter(Boolean).join(' ') : props['aria-describedby'],
  });

  return (
    <>
      {trigger}
      {open &&
        createPortal(
          <div
            ref={refs.setFloating}
            id={id}
            role="tooltip"
            aria-label={label}
            className="ui-hovercard"
            style={floatingStyles}
            onPointerEnter={() => clearTimeout(timer.current)}
            onPointerLeave={() => later(false, CARD_HIDE_MS)}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
