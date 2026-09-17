import type { ReactNode } from 'react';
import { useRovingFocus } from './hooks/useRovingFocus';

export interface ToolbarProps {
  /** Required: what the controls are for, e.g. "Viewport display". */
  label: string;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  children: ReactNode;
}

/** A row of controls with one tab stop; arrow keys move between them. */
export function Toolbar({ label, orientation = 'horizontal', className, children }: ToolbarProps) {
  const roving = useRovingFocus<HTMLDivElement>({ orientation });
  return (
    <div
      ref={roving.ref}
      role="toolbar"
      aria-label={label}
      aria-orientation={orientation}
      className={`ui-toolbar ui-toolbar--${orientation}${className ? ` ${className}` : ''}`}
      onKeyDown={roving.onKeyDown}
      onFocus={roving.onFocus}
    >
      {children}
    </div>
  );
}

/** A visual gap between groups of toolbar controls. */
export function ToolbarSeparator() {
  return <div className="ui-toolbar-sep" role="separator" />;
}

/** A small heading for a group of controls in a vertical toolbar or rail. */
export function ToolbarGroupLabel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <div className="ui-toolbar-group-label" id={id}>
      {children}
    </div>
  );
}
