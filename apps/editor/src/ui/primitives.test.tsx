// @vitest-environment jsdom
import './testing';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, ToggleButton } from './Button';
import { Dialog } from './Dialog';
import { Select } from './Select';
import { Tabs } from './Tabs';
import { TextField } from './TextField';
import { Toolbar } from './Toolbar';
import { Tree, type SelectModifiers, type TreeItem } from './Tree';

// jsdom has no layout: every rect is zero, and positioning never settles. Keyboard behaviour doesn't need it.
vi.mock('./hooks/usePopover', () => ({
  usePopover: () => ({ refs: { setReference: () => {}, setFloating: () => {} }, floatingStyles: {} }),
}));

describe('dialog', () => {
  it('moves focus in, keeps Tab inside, closes on Escape and gives focus back', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open Settings</Button>
          {open && (
            <Dialog title="Settings" onClose={() => setOpen(false)} buttons={<Button onClick={() => setOpen(false)}>Done</Button>}>
              <TextField label="Name" value="" onChange={() => {}} />
            </Dialog>
          )}
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open Settings' });
    await user.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Done' }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('runs the default action on Enter', async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(
      <Dialog title="Open Scene" onSubmit={submit} buttons={<Button type="submit">Open</Button>}>
        <TextField label="Filter" value="" onChange={() => {}} />
      </Dialog>,
    );
    await user.click(screen.getByRole('textbox', { name: 'Filter' }));
    await user.keyboard('{Enter}');
    expect(submit).toHaveBeenCalledOnce();
  });
});

describe('text field', () => {
  it('commits on Enter and reverts on Escape', async () => {
    const user = userEvent.setup();
    const commit = vi.fn();
    render(<TextField label="Name" value="Table_01" onCommit={commit} />);
    const box = screen.getByRole('textbox', { name: 'Name' });
    await user.clear(box);
    await user.type(box, 'Chair{Escape}');
    expect((box as HTMLInputElement).value).toBe('Table_01');
    expect(commit).not.toHaveBeenCalled();
    await user.clear(box);
    await user.type(box, 'Chair{Enter}');
    expect(commit).toHaveBeenCalledWith('Chair');
  });
});

describe('toolbar', () => {
  it('has one tab stop and moves with the arrow keys', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Toolbar label="Display">
          <Button variant="tool">Frame</Button>
          <Button variant="tool" disabled>
            Undo
          </Button>
          <ToggleButton pressed={false} onPressedChange={() => {}}>
            Grid
          </ToggleButton>
        </Toolbar>
        <Button>After</Button>
      </>,
    );
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Frame' }));
    await user.keyboard('{ArrowRight}');
    const grid = screen.getByRole('button', { name: 'Grid' });
    expect(document.activeElement).toBe(grid);
    expect(grid.getAttribute('aria-pressed')).toBe('false');
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'After' }));
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(grid);
  });
});

describe('tabs', () => {
  it('selects tabs with the arrow keys', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [tab, setTab] = useState<'a' | 'b' | 'c'>('a');
      return (
        <Tabs
          label="Workspace"
          idPrefix="t"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'a', label: 'Scene' },
            { id: 'b', label: 'Textures' },
            { id: 'c', label: 'Scripts' },
          ]}
        />
      );
    }
    render(<Harness />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Scene' }));
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Scripts', selected: true }));
  });
});

describe('select', () => {
  it('opens with the keyboard, skips disabled options, and chooses with Enter', async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(
      <Select
        label="Level of detail"
        value={0}
        onChange={change}
        options={[
          { value: 0, label: 'LOD 0' },
          { value: 1, label: 'LOD 1', disabled: true },
          { value: 2, label: 'LOD 2' },
        ]}
      />,
    );
    const combo = screen.getByRole('combobox', { name: /Level of detail/ });
    combo.focus();
    await user.keyboard('{ArrowDown}');
    const list = screen.getByRole('listbox');
    expect(document.activeElement).toBe(list);
    await user.keyboard('{ArrowDown}');
    expect(list.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'LOD 2' }).id);
    await user.keyboard('{Enter}');
    expect(change).toHaveBeenCalledWith(2);
    expect(document.activeElement).toBe(combo);
  });
});

describe('tree', () => {
  type Row = TreeItem<number>;
  const all: (Row & { parent: number })[] = [
    { key: 0, parent: -1, depth: 0, label: 'Ballroom', hasChildren: true, expanded: false },
    { key: 1, parent: 0, depth: 1, label: 'Chandelier', hasChildren: false, expanded: false },
    { key: 2, parent: 0, depth: 1, label: 'Table', hasChildren: false, expanded: false },
    { key: 3, parent: -1, depth: 0, label: 'Kitchen', hasChildren: false, expanded: false },
  ];

  function Harness({ onSelect }: { onSelect: (key: number, m: SelectModifiers) => void }) {
    const [open, setOpen] = useState(false);
    const [focus, setFocus] = useState<number | null>(null);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const items = all.filter((r) => r.parent < 0 || open).map((r) => ({ ...r, expanded: r.key === 0 ? open : false }));
    return (
      <Tree<number, Row>
        label="Objects"
        items={items}
        selected={selected}
        focusKey={focus}
        onFocusChange={setFocus}
        onToggle={() => setOpen((o) => !o)}
        onSelect={(key, m) => {
          onSelect(key, m);
          setSelected(new Set([key]));
        }}
      />
    );
  }

  it('selects the clicked row without first moving the cursor to the top', async () => {
    const user = userEvent.setup();
    const select = vi.fn();
    render(
      <Tree<number, Row>
        label="Objects"
        items={all.filter((r) => r.parent < 0)}
        selected={new Set()}
        focusKey={null}
        onFocusChange={(key) => select('focus', key)}
        onToggle={() => {}}
        onSelect={(key) => select('select', key)}
      />,
    );
    // Moving the cursor to the first row would scroll a long list away from under the pointer.
    await user.click(screen.getByRole('treeitem', { name: 'Kitchen' }));
    expect(select.mock.calls).toEqual([
      ['focus', 3],
      ['select', 3],
    ]);
  });

  it('moves, opens, goes to the parent, and jumps by typing', async () => {
    const user = userEvent.setup();
    const select = vi.fn();
    render(<Harness onSelect={select} />);
    const tree = screen.getByRole('tree', { name: 'Objects' });
    await user.tab();
    expect(document.activeElement).toBe(tree);

    const active = () => document.getElementById(tree.getAttribute('aria-activedescendant')!)?.textContent;
    expect(active()).toBe('Ballroom');

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('treeitem', { name: 'Ballroom' }).getAttribute('aria-expanded')).toBe('true');
    await user.keyboard('{ArrowRight}');
    expect(active()).toBe('Chandelier');
    await user.keyboard('{ArrowDown}');
    expect(active()).toBe('Table');
    expect(select).toHaveBeenLastCalledWith(2, { toggle: false, range: false });
    await user.keyboard('{ArrowLeft}');
    expect(active()).toBe('Ballroom');
    await user.keyboard('k');
    expect(active()).toBe('Kitchen');
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(select).toHaveBeenLastCalledWith(2, { toggle: false, range: true });
  });
});
