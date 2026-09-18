import { forwardRef, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button, IconButton, ToggleButton, Tooltip } from '../ui';
import { useShortcut } from './keymap';
import { executeCommand, getCommand, useCommandState } from './registry';

export interface CommandButtonProps {
  command: string;
  /** Shorter text than the command's title, for tight toolbars. */
  children?: ReactNode;
  /** Show only the icon; the title becomes the accessible name. */
  iconOnly?: boolean;
  icon?: LucideIcon | null;
  variant?: 'tool' | 'push';
  className?: string;
}

/**
 * A toolbar or rail button for a command: its title, icon, shortcut and description in the
 * tooltip, pressed state for on/off commands, and disabled (with the reason) when it can't run.
 */
export const CommandButton = forwardRef<HTMLButtonElement, CommandButtonProps>(function CommandButton(
  { command: id, children, iconOnly, icon, variant = 'tool', className },
  ref,
) {
  const command = getCommand(id);
  const { label, disabledReason, checked } = useCommandState(id);
  const shortcut = useShortcut(id);
  const Icon = icon === null ? undefined : (icon ?? command?.icon);
  const description = disabledReason ?? command?.description;
  const run = () => executeCommand(id);

  if (checked !== undefined) {
    return (
      <ToggleButton
        ref={ref}
        className={className}
        pressed={checked}
        onPressedChange={run}
        icon={Icon}
        label={label}
        shortcut={shortcut}
        description={description}
        aria-disabled={disabledReason ? true : undefined}
        aria-keyshortcuts={shortcut}
      >
        {iconOnly ? undefined : (children ?? label)}
      </ToggleButton>
    );
  }
  if (iconOnly && Icon) {
    return (
      <IconButton
        ref={ref}
        className={className}
        icon={Icon}
        label={label}
        shortcut={shortcut}
        description={description}
        aria-disabled={disabledReason ? true : undefined}
        onClick={run}
        aria-keyshortcuts={shortcut}
      />
    );
  }
  return (
    <Tooltip title={label} shortcut={shortcut} description={description} describe={!!children}>
      <Button
        ref={ref}
        variant={variant}
        className={className}
        icon={Icon}
        aria-disabled={disabledReason ? true : undefined}
        onClick={run}
        aria-keyshortcuts={shortcut}
        aria-label={children ? label : undefined}
      >
        {children ?? label}
      </Button>
    </Tooltip>
  );
});
