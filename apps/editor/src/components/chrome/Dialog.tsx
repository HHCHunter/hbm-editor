import type { ReactNode } from 'react';

interface DialogProps {
  title: string;
  width?: number;
  onClose?: () => void;
  children: ReactNode;
  buttons?: ReactNode;
}

/** A Windows 2000 style modal window. */
export function Dialog({ title, width = 520, onClose, children, buttons }: DialogProps) {
  return (
    <div className="dialog-backdrop">
      <div className="dialog bevel-out" style={{ width }} role="dialog" aria-label={title}>
        <div className="titlebar">
          <div className="titlebar-text">{title}</div>
          {onClose && (
            <div className="titlebar-buttons">
              <div className="titlebar-button" onClick={onClose} title="Close">
                ✕
              </div>
            </div>
          )}
        </div>
        <div className="dialog-body">{children}</div>
        {buttons && <div className="dialog-buttons">{buttons}</div>}
      </div>
    </div>
  );
}

interface PushButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}

export function PushButton({ label, onClick, disabled, primary }: PushButtonProps) {
  return (
    <button type="button" className={`push-btn${primary ? ' primary' : ''}`} onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}
