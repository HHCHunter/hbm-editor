/* eslint-disable jsx-a11y/click-events-have-key-events -- the menu element handles every key and moves focus between items */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight } from 'lucide-react';
import { useMergedRef } from './hooks/useMergedRef';
import { usePopover } from './hooks/usePopover';
import { useTypeahead } from './hooks/useTypeahead';
import { Kbd } from './Kbd';

export type MenuEntry =
  | {
      kind?: 'item';
      id: string;
      label: string;
      shortcut?: string;
      disabled?: boolean;
      /** Why it's disabled, announced and shown as a hint. */
      disabledReason?: string;
      /** Makes the item a checkbox (or, with `radio`, a radio) item. */
      checked?: boolean;
      radio?: boolean;
      onSelect: () => void;
    }
  | { kind: 'separator'; id: string }
  | { kind: 'submenu'; id: string; label: string; disabled?: boolean; items: MenuEntry[] };

type Actionable = Exclude<MenuEntry, { kind: 'separator' }>;

const focusable = (entries: readonly MenuEntry[]) =>
  entries.map((e, i) => (e.kind !== 'separator' && !e.disabled ? i : -1)).filter((i) => i >= 0);

export interface MenuPopupProps {
  items: readonly MenuEntry[];
  label: string;
  /** The element or point the menu opens from. */
  anchor: HTMLElement | { x: number; y: number };
  placement?: 'bottom-start' | 'right-start';
  /** Which item gets focus when the menu opens. */
  initialFocus?: 'first' | 'last' | 'none';
  onClose: (reason: 'select' | 'escape' | 'outside' | 'tab') => void;
  /** Left and Right on a menu bar menu move to the neighbouring menu. */
  onNeighbour?: (direction: -1 | 1) => void;
  /** Set for submenus, so Left closes them. */
  isSubmenu?: boolean;
}

/** A popup menu: the WAI-ARIA menu pattern, with checkbox and radio items and submenus. */
export function MenuPopup({
  items,
  label,
  anchor,
  placement = 'bottom-start',
  initialFocus = 'first',
  onClose,
  onNeighbour,
  isSubmenu,
}: MenuPopupProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(-1);
  const [submenu, setSubmenu] = useState<{ index: number; focus: 'first' | 'none' } | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const { refs, floatingStyles } = usePopover({ open: true, placement, gap: placement === 'right-start' ? -2 : 0 });

  useLayoutEffect(() => {
    if (anchor instanceof HTMLElement) refs.setReference(anchor);
    else
      refs.setReference({
        getBoundingClientRect: () => new DOMRect(anchor.x, anchor.y, 0, 0),
      });
  }, [anchor, refs]);

  const order = focusable(items);
  const typeahead = useTypeahead(useCallback(() => items.map((e) => (e.kind === 'separator' ? '' : e.label)), [items]));

  useLayoutEffect(() => {
    const first = initialFocus === 'last' ? order[order.length - 1] : initialFocus === 'first' ? order[0] : undefined;
    if (first !== undefined) setActive(first);
    else menuRef.current?.focus();
    // Only when the menu opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (active >= 0) itemRefs.current[active]?.focus();
  }, [active]);

  // A click anywhere outside the menu (and its submenus) closes it.
  useEffect(() => {
    if (isSubmenu) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (document.querySelector('[data-submenu-of]')?.contains(target)) return;
      if (anchor instanceof HTMLElement && anchor.contains(target)) return;
      onClose('outside');
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [anchor, onClose, isSubmenu]);

  const activate = (index: number) => {
    const entry = items[index] as Actionable | undefined;
    if (!entry || entry.disabled) return;
    if (entry.kind === 'submenu') {
      setSubmenu({ index, focus: 'first' });
      return;
    }
    onClose('select');
    entry.onSelect();
  };

  const move = (delta: 1 | -1) => {
    if (!order.length) return;
    const at = order.indexOf(active);
    const next = at < 0 ? (delta > 0 ? 0 : order.length - 1) : (at + delta + order.length) % order.length;
    setActive(order[next]!);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const entry = items[active] as Actionable | undefined;
    switch (e.key) {
      case 'ArrowDown':
        move(1);
        break;
      case 'ArrowUp':
        move(-1);
        break;
      case 'Home':
        setActive(order[0] ?? -1);
        break;
      case 'End':
        setActive(order[order.length - 1] ?? -1);
        break;
      case 'Enter':
      case ' ':
        activate(active);
        break;
      case 'ArrowRight':
        if (entry?.kind === 'submenu' && !entry.disabled) setSubmenu({ index: active, focus: 'first' });
        else if (onNeighbour) onNeighbour(1);
        else return;
        break;
      case 'ArrowLeft':
        if (isSubmenu) onClose('escape');
        else if (onNeighbour) onNeighbour(-1);
        else return;
        break;
      case 'Escape':
        onClose('escape');
        break;
      case 'Tab':
        onClose('tab');
        return;
      default: {
        if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
        const at = typeahead(e.key, active);
        if (at >= 0 && order.includes(at)) setActive(at);
      }
    }
    e.preventDefault();
    e.stopPropagation();
  };

  const menuElementRef = useMergedRef(menuRef, refs.setFloating);
  const openSub = submenu ? (items[submenu.index] as Extract<MenuEntry, { kind: 'submenu' }>) : null;

  return createPortal(
    <>
      <div
        ref={menuElementRef}
        role="menu"
        aria-label={label}
        tabIndex={-1}
        className="ui-popup ui-menu"
        style={floatingStyles}
        data-submenu-of={isSubmenu ? label : undefined}
        onKeyDown={onKeyDown}
      >
        {items.map((entry, i) => {
          if (entry.kind === 'separator') return <div key={entry.id} role="separator" className="ui-menu-sep" />;
          const isCheck = entry.kind !== 'submenu' && entry.checked !== undefined;
          const role = entry.kind === 'submenu' ? 'menuitem' : isCheck ? (entry.radio ? 'menuitemradio' : 'menuitemcheckbox') : 'menuitem';
          return (
            <div
              key={entry.id}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              role={role}
              tabIndex={-1}
              aria-disabled={entry.disabled || undefined}
              aria-checked={isCheck ? entry.checked : undefined}
              aria-haspopup={entry.kind === 'submenu' ? 'menu' : undefined}
              aria-expanded={entry.kind === 'submenu' ? submenu?.index === i : undefined}
              aria-keyshortcuts={entry.kind !== 'submenu' && entry.shortcut ? entry.shortcut : undefined}
              title={entry.kind !== 'submenu' && entry.disabled ? entry.disabledReason : undefined}
              className={`ui-menu-item${i === active ? ' is-active' : ''}${entry.disabled ? ' is-disabled' : ''}`}
              data-command={entry.id}
              onPointerMove={() => {
                if (entry.disabled || active === i) return;
                setActive(i);
                setSubmenu(entry.kind === 'submenu' ? { index: i, focus: 'none' } : null);
              }}
              onClick={() => activate(i)}
            >
              <span className="ui-menu-check" aria-hidden="true">
                {isCheck && entry.checked && (entry.radio ? <span className="ui-menu-radio" /> : <Check className="ui-icon" strokeWidth={2.5} />)}
              </span>
              <span className="ui-menu-label">{entry.label}</span>
              {entry.kind === 'submenu' ? (
                <ChevronRight className="ui-icon ui-menu-sub" aria-hidden="true" />
              ) : (
                entry.shortcut && <Kbd chord={entry.shortcut} />
              )}
            </div>
          );
        })}
      </div>
      {openSub && itemRefs.current[submenu!.index] && (
        <MenuPopup
          items={openSub.items}
          label={openSub.label}
          anchor={itemRefs.current[submenu!.index]!}
          placement="right-start"
          initialFocus={submenu!.focus}
          isSubmenu
          onClose={(reason) => {
            setSubmenu(null);
            if (reason === 'escape') itemRefs.current[submenu!.index]?.focus();
            else onClose(reason);
          }}
        />
      )}
    </>,
    document.body,
  );
}

export interface MenuBarMenu {
  id: string;
  label: string;
  items: MenuEntry[];
}

export interface MenuBarProps {
  label: string;
  menus: readonly MenuBarMenu[];
  className?: string;
  /** Rendered after the menus, e.g. the open scene's name. */
  children?: React.ReactNode;
}

/**
 * The application menu bar: the WAI-ARIA menubar pattern. F10 or Alt alone moves focus to it;
 * arrow keys move between menus, and hovering switches menus once one is open.
 */
export function MenuBar({ label, menus, className, children }: MenuBarProps) {
  const [open, setOpen] = useState<{ index: number; focus: 'first' | 'last' | 'none' } | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const labelRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const returnFocus = useRef<HTMLElement | null>(null);

  const focusLabel = (index: number) => {
    const at = (index + menus.length) % menus.length;
    setFocusIndex(at);
    labelRefs.current[at]?.focus();
    return at;
  };

  // F10, or Alt pressed and released alone, focuses the menu bar, as in Windows applications.
  useEffect(() => {
    let altAlone = false;
    const enter = () => {
      if (!labelRefs.current.includes(document.activeElement as HTMLButtonElement)) {
        returnFocus.current = document.activeElement as HTMLElement | null;
      }
      focusLabel(0);
    };
    const onDown = (e: KeyboardEvent) => {
      altAlone = e.key === 'Alt' && !e.ctrlKey && !e.shiftKey && !e.metaKey;
      if (e.key === 'F10' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        enter();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt' && altAlone) {
        e.preventDefault();
        if (labelRefs.current.includes(document.activeElement as HTMLButtonElement) && !open) returnFocus.current?.focus();
        else enter();
      }
      altAlone = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
    // The handlers only read refs and `open` for the Alt toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openMenu = (index: number, focus: 'first' | 'last' | 'none') => {
    const at = (index + menus.length) % menus.length;
    setFocusIndex(at);
    setOpen({ index: at, focus });
  };

  const menu = open ? menus[open.index] : null;
  const anchor = open ? labelRefs.current[open.index] : null;

  return (
    <div role="menubar" aria-label={label} className={`ui-menubar${className ? ` ${className}` : ''}`}>
      {menus.map((m, i) => (
        <button
          key={m.id}
          ref={(el) => {
            labelRefs.current[i] = el;
          }}
          type="button"
          role="menuitem"
          tabIndex={i === focusIndex ? 0 : -1}
          aria-haspopup="menu"
          aria-expanded={open?.index === i}
          className={`ui-menubar-item${open?.index === i ? ' is-open' : ''}`}
          onClick={() => (open?.index === i ? setOpen(null) : openMenu(i, 'none'))}
          onPointerEnter={() => {
            if (open && open.index !== i) openMenu(i, 'none');
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') focusLabel(i + 1);
            else if (e.key === 'ArrowLeft') focusLabel(i - 1);
            else if (e.key === 'Home') focusLabel(0);
            else if (e.key === 'End') focusLabel(menus.length - 1);
            else if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') openMenu(i, 'first');
            else if (e.key === 'ArrowUp') openMenu(i, 'last');
            else if (e.key === 'Escape') returnFocus.current?.focus();
            else return;
            e.preventDefault();
          }}
        >
          {m.label}
        </button>
      ))}
      {children}
      {menu && anchor && (
        <MenuPopup
          key={menu.id}
          items={menu.items}
          label={menu.label}
          anchor={anchor}
          initialFocus={open!.focus}
          onNeighbour={(direction) => openMenu(open!.index + direction, 'first')}
          onClose={(reason) => {
            setOpen(null);
            if (reason === 'escape') labelRefs.current[open!.index]?.focus();
            else if (reason === 'select' && returnFocus.current && document.contains(returnFocus.current)) {
              returnFocus.current.focus();
            }
          }}
        />
      )}
    </div>
  );
}

/**
 * A context menu: `open(items)` handles a right-click, `openAt(items, x, y)` opens it from the
 * keyboard (the Menu key or Shift+F10). Escape gives focus back to where it was.
 */
export function useContextMenu(label = 'Context menu') {
  const [state, setState] = useState<{ items: MenuEntry[]; x: number; y: number } | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const openAt = useCallback((items: MenuEntry[], x: number, y: number) => {
    returnTo.current = document.activeElement as HTMLElement | null;
    setState({ items, x, y });
  }, []);
  const open = useCallback(
    (items: MenuEntry[]) => (e: React.MouseEvent) => {
      e.preventDefault();
      openAt(items, e.clientX, e.clientY);
    },
    [openAt],
  );
  const element = state ? (
    <MenuPopup
      items={state.items}
      label={label}
      anchor={{ x: state.x, y: state.y }}
      onClose={(reason) => {
        setState(null);
        if (reason === 'escape') returnTo.current?.focus();
      }}
    />
  ) : null;
  return { open, openAt, element };
}
