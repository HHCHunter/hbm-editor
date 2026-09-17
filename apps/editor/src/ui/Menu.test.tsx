// @vitest-environment jsdom
import './testing';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MenuBar, type MenuBarMenu } from './Menu';

// jsdom has no layout: every rect is zero, and positioning never settles. Keyboard behaviour doesn't need it.
vi.mock('./hooks/usePopover', () => ({
  usePopover: () => ({ refs: { setReference: () => {}, setFloating: () => {} }, floatingStyles: {} }),
}));

function setup() {
  const open = vi.fn();
  const redo = vi.fn();
  const grid = vi.fn();
  const menus: MenuBarMenu[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'open', label: 'Open Scene…', shortcut: 'Ctrl+O', onSelect: open },
        { kind: 'separator', id: 's' },
        { id: 'exit', label: 'Exit', onSelect: () => {} },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { id: 'undo', label: 'Undo', onSelect: () => {} },
        { id: 'redo', label: 'Redo', disabled: true, onSelect: redo },
      ],
    },
    { id: 'view', label: 'View', items: [{ id: 'grid', label: 'Grid', checked: true, onSelect: grid }] },
  ];
  render(
    <>
      <button type="button">elsewhere</button>
      <MenuBar label="Main menu" menus={menus} />
    </>,
  );
  return { open, redo, grid, user: userEvent.setup() };
}

describe('menu bar', () => {
  it('focuses on F10 and moves between menus with the arrow keys', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));
    await user.keyboard('{F10}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'File' }));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Edit' }));
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'View' }));
  });

  it('opens with ArrowDown, skips separators, and runs the item on Enter', async () => {
    const { user, open } = setup();
    screen.getByRole('menuitem', { name: 'File' }).focus();
    await user.keyboard('{ArrowDown}');
    const menu = screen.getByRole('menu', { name: 'File' });
    expect(menu).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: /Open Scene/ }));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Exit' }));
    await user.keyboard('{ArrowUp}{Enter}');
    expect(open).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('never focuses or runs a disabled item', async () => {
    const { user, redo } = setup();
    screen.getByRole('menuitem', { name: 'Edit' }).focus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Undo' }));
    await user.click(screen.getByRole('menuitem', { name: 'Redo' }));
    expect(redo).not.toHaveBeenCalled();
  });

  it('moves to the neighbouring menu with Right and closes on Escape, returning focus', async () => {
    const { user } = setup();
    screen.getByRole('menuitem', { name: 'File' }).focus();
    await user.keyboard('{ArrowDown}{ArrowRight}');
    expect(screen.getByRole('menu', { name: 'Edit' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Edit' }));
  });

  it('announces checkbox items as checked and jumps by typing', async () => {
    const { user, grid } = setup();
    screen.getByRole('menuitem', { name: 'View' }).focus();
    await user.keyboard('{ArrowDown}');
    const item = screen.getByRole('menuitemcheckbox', { name: 'Grid' });
    expect(item.getAttribute('aria-checked')).toBe('true');
    await user.keyboard('g{Enter}');
    expect(grid).toHaveBeenCalledOnce();
  });
});
