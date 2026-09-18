import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEditor } from '../state/store';
import { MenuButton } from '../ui';
import { useKeymap } from './keymap';
import { menuEntries, type Layout } from './menus';

export interface CommandMenuButtonProps {
  label: string;
  layout: Layout;
  children?: ReactNode;
  icon?: LucideIcon;
  description?: string;
  className?: string;
}

/** A button that opens a menu of commands, current when it opens. */
export function CommandMenuButton({ label, layout, children, icon, description, className }: CommandMenuButtonProps) {
  return (
    <MenuButton
      label={label}
      icon={icon}
      description={description}
      className={className}
      items={() => menuEntries(layout, useEditor.getState(), useKeymap.getState().overrides, label)}
    >
      {children}
    </MenuButton>
  );
}
