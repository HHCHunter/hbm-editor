/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- a focusable separator is the ARIA window splitter pattern */
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

// ---------------------------------------------------------------- splitter

export interface SplitterProps {
  label: string;
  orientation: 'vertical' | 'horizontal';
  /** Size in px of the pane the splitter resizes. */
  value: number;
  min: number;
  max: number;
  /** The pane is after the splitter, so moving the splitter towards it makes it smaller. */
  invert?: boolean;
  onChange: (value: number) => void;
  /** Double-click: back to the default size. */
  onReset?: () => void;
}

/** A draggable divider between two panes; arrow keys resize by 16px, Home and End go to the limits. */
export function Splitter({
  label,
  orientation,
  value,
  min,
  max,
  invert,
  onChange,
  onReset,
}: SplitterProps) {
  const drag = useRef<{ start: number; value: number } | null>(null);
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v)));
  const vertical = orientation === 'vertical';
  const sign = invert ? -1 : 1;
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      className={`ui-splitter ui-splitter--${orientation}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { start: vertical ? e.clientX : e.clientY, value };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        onChange(
          clamp(
            drag.current.value + sign * ((vertical ? e.clientX : e.clientY) - drag.current.start),
          ),
        );
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const less = vertical ? 'ArrowLeft' : 'ArrowUp';
        const more = vertical ? 'ArrowRight' : 'ArrowDown';
        if (e.key === less) onChange(clamp(value - 16 * sign));
        else if (e.key === more) onChange(clamp(value + 16 * sign));
        else if (e.key === 'Home') onChange(min);
        else if (e.key === 'End') onChange(max);
        else return;
        e.preventDefault();
      }}
    />
  );
}

// ---------------------------------------------------------------- split pane

/** Width of a splitter bar, in px; matches .ui-splitter. */
const BAR = 5;

function remPx(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

export interface SplitPaneProps {
  /** Names the splitter, e.g. "Resize the outliner". */
  label: string;
  /** Row: panes side by side. Column: one above the other. */
  direction: 'row' | 'column';
  /** The pane that keeps its size; the other takes what is left. */
  fixed: 'start' | 'end';
  /** The fixed pane's size in px, or null for the default. */
  size: number | null;
  /** The fixed pane's default size, as a CSS length (rem or %). */
  defaultSize: string;
  /** Smallest size of the fixed pane, in rem. */
  min: number;
  /** Smallest size left for the other pane, in rem. */
  minOther: number;
  onSize: (px: number | null) => void;
  /** Hide one pane and give the other all the room, keeping both mounted. */
  hide?: 'start' | 'end';
  start: ReactNode;
  end: ReactNode;
  className?: string;
  startProps?: PaneProps;
  endProps?: PaneProps;
}

type PaneProps = { className?: string; 'aria-label'?: string; 'data-area'?: string; role?: string };

/**
 * Two panes and a splitter between them. The fixed pane's size is clamped by CSS as well, so
 * shrinking the window never pushes the other pane below its minimum.
 */
export function SplitPane({
  label,
  direction,
  fixed,
  size,
  defaultSize,
  min,
  minOther,
  onSize,
  hide,
  start,
  end,
  className,
  startProps,
  endProps,
}: SplitPaneProps) {
  const box = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState({ box: 0, pane: 0 });
  const row = direction === 'row';

  useLayoutEffect(() => {
    const el = box.current;
    const fixedEl = pane.current;
    if (!el || !fixedEl) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const p = fixedEl.getBoundingClientRect();
      setMeasured({ box: row ? r.width : r.height, pane: row ? p.width : p.height });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(fixedEl);
    return () => observer.disconnect();
  }, [row]);

  const rem = typeof document === 'undefined' ? 16 : remPx();
  const minPx = min * rem;
  const maxPx = Math.max(minPx, measured.box - minOther * rem - BAR);
  const fixedStyle: CSSProperties = {
    flex: `0 0 ${size !== null ? `${size}px` : defaultSize}`,
    [row ? 'minWidth' : 'minHeight']: `${min}rem`,
    [row ? 'maxWidth' : 'maxHeight']: `calc(100% - ${minOther}rem - ${BAR}px)`,
  };
  const fluidStyle: CSSProperties = { flex: '1 1 0', [row ? 'minWidth' : 'minHeight']: 0 };
  // With one pane hidden the other takes everything, fixed or not.
  const startStyle = fixed === 'start' && !hide ? fixedStyle : fluidStyle;
  const endStyle = fixed === 'end' && !hide ? fixedStyle : fluidStyle;

  return (
    <div ref={box} className={`ui-split ui-split--${direction}${className ? ` ${className}` : ''}`}>
      <div
        ref={fixed === 'start' ? pane : undefined}
        {...startProps}
        className={`ui-split-pane${startProps?.className ? ` ${startProps.className}` : ''}`}
        style={startStyle}
        hidden={hide === 'start'}
      >
        {start}
      </div>
      {!hide && (
        <Splitter
          label={label}
          orientation={row ? 'vertical' : 'horizontal'}
          value={size !== null ? Math.max(minPx, Math.min(size, maxPx)) : measured.pane}
          min={minPx}
          max={maxPx}
          invert={fixed === 'end'}
          onChange={onSize}
          onReset={() => onSize(null)}
        />
      )}
      <div
        ref={fixed === 'end' ? pane : undefined}
        {...endProps}
        className={`ui-split-pane${endProps?.className ? ` ${endProps.className}` : ''}`}
        style={endStyle}
        hidden={hide === 'end'}
      >
        {end}
      </div>
    </div>
  );
}
