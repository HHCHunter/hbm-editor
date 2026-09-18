/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus, jsx-a11y/no-static-element-interactions -- focus stays in the search box, which handles the keys and points at the active option; a click outside closes, as Escape does */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Box, Camera, Folder, FolderTree, Lightbulb, Search, Shapes, TerminalSquare, type LucideIcon } from 'lucide-react';
import type { SceneNodeDTO } from '@hbm/protocol';
import { nodeLabel } from '../scene/sceneModel';
import { openDialog, selectNode, setTab, zoomSelected } from '../state/actions';
import { useEditor } from '../state/store';
import { useFocusTrap } from '../ui/hooks/useFocusTrap';
import { Kbd } from '../ui';
import { fuzzyMatch } from './fuzzy';
import { useKeymap, shortcutOf } from './keymap';
import { takePaletteSeed } from './palette';
import { allCommands, commandLabel, contextFor, disabledReason, executeCommand, getCommand, recentCommands } from './registry';

/** Most results listed at once; the rest are counted. */
const LIMIT = 100;

const KIND_ICONS: Record<SceneNodeDTO['kind'], LucideIcon> = {
  room: Folder,
  group: FolderTree,
  mesh: Box,
  light: Lightbulb,
  camera: Camera,
  other: Shapes,
};

interface Item {
  key: string;
  icon: LucideIcon;
  title: string;
  positions: number[];
  detail?: string;
  shortcut?: string;
  disabledReason?: string | null;
  group?: string;
  run: () => void;
}

function Highlight({ text, positions }: { text: string; positions: number[] }): ReactNode {
  if (!positions.length) return text;
  const marked = new Set(positions);
  const out: ReactNode[] = [];
  let run = '';
  let bold = false;
  const flush = (i: number) => {
    if (run) out.push(bold ? <mark key={i}>{run}</mark> : run);
    run = '';
  };
  [...text].forEach((ch, i) => {
    const hit = marked.has(i);
    if (hit !== bold) {
      flush(i);
      bold = hit;
    }
    run += ch;
  });
  flush(text.length);
  return out;
}

function showObject(index: number) {
  setTab('scene');
  selectNode(index, false, true);
  zoomSelected();
}

/**
 * Find and run any command by name, or with "@", find a scene object and frame it. Up and Down
 * move, Enter runs, Escape closes. A command that can't run says why instead of closing.
 */
export function CommandPalette() {
  const [query, setQuery] = useState(takePaletteSeed);
  const [active, setActive] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const state = useEditor();
  const overrides = useKeymap((s) => s.overrides);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  useFocusTrap(ref);

  const mode = query.startsWith('@') ? 'objects' : 'commands';
  const text = mode === 'objects' ? query.slice(1) : query.replace(/^>/, '');

  const { items, total } = useMemo(() => {
    if (mode === 'objects') {
      const nodes = state.scene?.graph.nodes ?? [];
      const scored: (Item & { score: number })[] = [];
      for (const node of nodes) {
        const label = nodeLabel(node);
        const match = fuzzyMatch(text, label);
        if (!match) continue;
        scored.push({
          key: `@${node.index}`,
          icon: KIND_ICONS[node.kind],
          title: label,
          positions: match.positions,
          detail: node.className ?? node.kind,
          score: match.score,
          run: () => showObject(node.index),
        });
      }
      if (text) scored.sort((a, b) => b.score - a.score);
      return { items: scored.slice(0, LIMIT), total: scored.length };
    }

    const ctx = contextFor(state);
    const toItem = (id: string, positions: number[] = [], group?: string): Item | null => {
      const command = getCommand(id);
      if (!command) return null;
      return {
        key: command.id,
        icon: command.icon ?? TerminalSquare,
        title: commandLabel(command, ctx),
        positions,
        detail: command.category,
        shortcut: shortcutOf(command.id, overrides),
        disabledReason: disabledReason(command, ctx),
        group,
        run: () => executeCommand(command.id),
      };
    };

    if (!text.trim()) {
      const recent = recentCommands().filter((id) => getCommand(id));
      const rest = allCommands()
        .filter((c) => !recent.includes(c.id))
        .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
      const list = [
        ...recent.map((id) => toItem(id, [], 'Recently used')),
        ...rest.map((c) => toItem(c.id, [], recent.length ? 'All commands' : undefined)),
      ].filter((i): i is Item => !!i);
      return { items: list, total: list.length };
    }

    const scored: (Item & { score: number })[] = [];
    for (const command of allCommands()) {
      const title = commandLabel(command, ctx);
      const onTitle = fuzzyMatch(text, title);
      const onOther = onTitle ? null : fuzzyMatch(text, [command.category, ...(command.keywords ?? []), command.description ?? ''].join(' '));
      const match = onTitle ?? (onOther ? { score: onOther.score - 400, positions: [] } : null);
      if (!match) continue;
      const item = toItem(command.id, match.positions);
      // Commands that can't run now sort after those that can.
      if (item) scored.push({ ...item, score: match.score - (item.disabledReason ? 300 : 0) });
    }
    scored.sort((a, b) => b.score - a.score);
    return { items: scored, total: scored.length };
  }, [mode, text, state, overrides]);

  useEffect(() => {
    setActive(0);
    setNotice(null);
  }, [query]);
  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId]);

  const close = () => openDialog(null);
  const choose = (index: number) => {
    const item = items[index];
    if (!item) return;
    if (item.disabledReason) {
      setNotice(`${item.title}: ${item.disabledReason}`);
      return;
    }
    close();
    item.run();
  };

  let lastGroup: string | undefined;

  return createPortal(
    <div className="ui-dialog-backdrop palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Command palette" className="palette">
        <div className="palette-search">
          <Search className="ui-icon" aria-hidden="true" />
          <input
            className="palette-input"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
            aria-label={mode === 'objects' ? 'Find a scene object' : 'Find a command'}
            placeholder={mode === 'objects' ? 'Find an object by name' : 'Type a command, or @ to find an object'}
            value={query}
            data-autofocus
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') setActive((a) => Math.min(items.length - 1, a + 1));
              else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
              else if (e.key === 'PageDown') setActive((a) => Math.min(items.length - 1, a + 10));
              else if (e.key === 'PageUp') setActive((a) => Math.max(0, a - 10));
              else if (e.key === 'Enter') choose(active);
              else if (e.key === 'Escape') {
                e.stopPropagation();
                close();
              } else return;
              e.preventDefault();
            }}
          />
        </div>
        {notice && (
          <div className="palette-notice" role="alert">
            {notice}
          </div>
        )}
        <div id={listId} role="listbox" aria-label={mode === 'objects' ? 'Objects' : 'Commands'} className="palette-list">
          {items.map((item, i) => {
            const heading = item.group && item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            const Icon = item.icon;
            return (
              <div key={item.key} role="presentation">
                {heading && (
                  <div className="palette-group" role="presentation">
                    {heading}
                  </div>
                )}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  aria-disabled={item.disabledReason ? true : undefined}
                  className={`palette-item${i === active ? ' is-active' : ''}${item.disabledReason ? ' is-disabled' : ''}`}
                  onPointerMove={() => setActive(i)}
                  onClick={() => choose(i)}
                >
                  <Icon className="ui-icon palette-icon" aria-hidden="true" strokeWidth={1.75} />
                  <span className="palette-title">
                    <Highlight text={item.title} positions={item.positions} />
                  </span>
                  {item.disabledReason ? (
                    <span className="palette-detail">{item.disabledReason}</span>
                  ) : (
                    item.detail && <span className="palette-detail">{item.detail}</span>
                  )}
                  {item.shortcut && <Kbd chord={item.shortcut} />}
                </div>
              </div>
            );
          })}
          {!items.length && (
            <div className="palette-empty" role="presentation">
              {mode === 'objects' && !state.scene
                ? 'Open a scene to find its objects.'
                : `Nothing matches “${text}”.`}
            </div>
          )}
        </div>
        <div className="palette-footer" aria-hidden="true">
          <span>
            <Kbd chord="Up" />
            <Kbd chord="Down" /> move
          </span>
          <span>
            <Kbd chord="Enter" /> run
          </span>
          <span>
            <Kbd chord="Escape" /> close
          </span>
          <span className="palette-footer-mode">
            {mode === 'objects'
              ? total > items.length
                ? `First ${items.length} of ${total} objects`
                : `${total} objects`
              : 'Type @ to find a scene object'}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
