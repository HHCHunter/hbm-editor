import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Tooltip } from './Tooltip';

type NativeButton = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'>;

export interface ButtonProps extends NativeButton {
  /**
   * push: a dialog button, 75px wide at least.
   * tool: a compact toolbar or rail button.
   * link: text that looks like a link but acts as a button.
   */
  variant?: 'push' | 'tool' | 'link';
  /** The dialog's default button: drawn with a dark frame. */
  primary?: boolean;
  icon?: LucideIcon;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'push', primary, icon: Icon, children, className, type = 'button', ...rest },
  ref,
) {
  const classes = ['ui-btn', `ui-btn--${variant}`];
  if (primary) classes.push('ui-btn--primary');
  if (className) classes.push(className);
  return (
    <button ref={ref} type={type} className={classes.join(' ')} {...rest}>
      {Icon && <Icon className="ui-icon" aria-hidden="true" strokeWidth={1.75} />}
      {children !== undefined && <span className="ui-btn-label">{children}</span>}
    </button>
  );
});

export interface IconButtonProps extends Omit<NativeButton, 'children'> {
  icon: LucideIcon;
  /** Required: the accessible name and the tooltip. */
  label: string;
  shortcut?: string;
  description?: string;
  variant?: 'tool' | 'flat';
}

/** A button with only an icon. Its label is its accessible name and shows as a tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, shortcut, description, variant = 'tool', className, type = 'button', ...rest },
  ref,
) {
  return (
    <Tooltip title={label} shortcut={shortcut} description={description} describe={false}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={`ui-btn ui-btn--${variant} ui-btn--icon${className ? ` ${className}` : ''}`}
        {...rest}
      >
        <Icon className="ui-icon" aria-hidden="true" strokeWidth={1.75} />
      </button>
    </Tooltip>
  );
});

export interface ToggleButtonProps extends Omit<NativeButton, 'onChange'> {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  icon?: LucideIcon;
  /** The accessible name when the button shows only an icon or a short code. */
  label?: string;
  shortcut?: string;
  description?: string;
  children?: ReactNode;
}

/** An on/off button, announced as pressed or not. */
export const ToggleButton = forwardRef<HTMLButtonElement, ToggleButtonProps>(function ToggleButton(
  { pressed, onPressedChange, icon: Icon, label, shortcut, description, children, className, onClick, ...rest },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type="button"
      aria-pressed={pressed}
      aria-label={children === undefined || label ? label : undefined}
      className={`ui-btn ui-btn--tool ui-btn--toggle${Icon && children === undefined ? ' ui-btn--icon' : ''}${className ? ` ${className}` : ''}`}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) onPressedChange(!pressed);
      }}
      {...rest}
    >
      {Icon && <Icon className="ui-icon" aria-hidden="true" strokeWidth={1.75} />}
      {children !== undefined && <span className="ui-btn-label">{children}</span>}
    </button>
  );
  return label ? (
    <Tooltip title={label} shortcut={shortcut} description={description} describe={false}>
      {button}
    </Tooltip>
  ) : (
    button
  );
});
