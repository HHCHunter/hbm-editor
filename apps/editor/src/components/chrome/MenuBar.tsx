import { useEffect, useRef } from 'react';
import { runMenuCommand } from '../../state/actions';
import { useEditor } from '../../state/store';
import { MENUS } from './menus';

function setMenuOpen(name: string | null) {
  useEditor.getState().update((s) => {
    s.menuOpen = name;
  });
}

export function MenuBar() {
  const open = useEditor((s) => s.menuOpen);
  const barRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setMenuOpen(null);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const items = open ? (MENUS[open] ?? []) : [];
  const panelLeft = open ? (labelRefs.current[open]?.offsetLeft ?? 0) : 0;

  return (
    <div className="menubar" ref={barRef}>
      {Object.keys(MENUS).map((name) => (
        <div
          key={name}
          ref={(el) => {
            labelRefs.current[name] = el;
          }}
          className={`menu-label${open === name ? ' open' : ''}`}
          onClick={() => setMenuOpen(open === name ? null : name)}
          onMouseEnter={() => {
            if (open && open !== name) setMenuOpen(name);
          }}
        >
          {name}
        </div>
      ))}
      {open && (
        <div className="menu-panel" style={{ left: panelLeft }}>
          {items.map((item) => (
            <div
              key={item.label}
              className="menu-item"
              onClick={() => {
                setMenuOpen(null);
                runMenuCommand(item.label);
              }}
            >
              <span>{item.label}</span>
              <span className="menu-key">{item.shortcut}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
