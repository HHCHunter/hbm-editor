/* eslint-disable jsx-a11y/no-noninteractive-element-interactions -- Escape on the dialog window closes it */
import { useId, useRef, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useFocusTrap } from './hooks/useFocusTrap';

export interface DialogProps {
  title: string;
  /** Width in rem, so it follows the UI scale. */
  width?: number;
  /** Close on Escape and the title bar's close button. Leave out when the dialog must be answered. */
  onClose?: () => void;
  /** Makes Enter in the body run the default action; give that button type="submit". */
  onSubmit?: () => void;
  description?: ReactNode;
  children: ReactNode;
  buttons?: ReactNode;
  className?: string;
}

/**
 * A modal Editor2 window. Focus moves into it when it opens, stays inside while it's open, and
 * returns to where it was when it closes.
 */
export function Dialog({ title, width = 32, onClose, onSubmit, description, children, buttons, className }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useFocusTrap(ref);

  const body = (
    <>
      <div className="ui-dialog-body">
        {description && (
          <p id={descId} className="ui-dialog-description">
            {description}
          </p>
        )}
        {children}
      </div>
      {buttons && <div className="ui-dialog-buttons">{buttons}</div>}
    </>
  );

  return createPortal(
    <div className="ui-dialog-backdrop">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`ui-dialog${className ? ` ${className}` : ''}`}
        style={{ width: `${width}rem` }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && onClose) {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="ui-dialog-titlebar">
          <h2 id={titleId} className="ui-dialog-title">
            {title}
          </h2>
          {onClose && (
            <button type="button" className="ui-dialog-close" aria-label="Close" onClick={onClose}>
              <X className="ui-icon" aria-hidden="true" strokeWidth={2.5} />
            </button>
          )}
        </div>
        {onSubmit ? (
          <form
            className="ui-dialog-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            {body}
          </form>
        ) : (
          body
        )}
      </div>
    </div>,
    document.body,
  );
}
