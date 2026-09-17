import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { isDefined, sceneIndex } from '../../scene/sceneIndex';
import { useEditor } from '../../state/store';
import { CommitInput } from '../chrome/widgets';
import { buildPropRows, type PropRow } from './rows';

function PropRowView({ row }: { row: PropRow }) {
  if (row.kind === 'group') {
    return (
      <div className="prop-row group">
        <div className="prop-label">{row.label}</div>
      </div>
    );
  }

  let control;
  switch (row.kind) {
    case 'text':
      control = (
        <CommitInput className="prop-input" value={row.value} readOnly={!row.onCommit} onCommit={row.onCommit} />
      );
      break;
    case 'check':
      control = (
        <input
          type="checkbox"
          className="prop-check"
          checked={row.checked}
          disabled={!row.onToggle}
          onChange={() => row.onToggle?.()}
        />
      );
      break;
    case 'select':
      control = (
        <select
          className="prop-select"
          value={row.value}
          disabled={!row.onSelect}
          onChange={(e) => row.onSelect?.(e.target.value)}
        >
          {row.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
      break;
  }

  return (
    <div className="prop-row">
      <div className="prop-label">{row.label}</div>
      <div className="prop-value">{control}</div>
    </div>
  );
}

export function PropertyGrid() {
  const { objects, sel } = useEditor(useShallow((s) => ({ objects: s.objects, sel: s.sel })));
  const rows = useMemo(() => {
    const index = sceneIndex(objects);
    return buildPropRows(sel.map((id) => index.byId.get(id)).filter(isDefined));
  }, [objects, sel]);

  // Keyed by selection so a half-typed value never carries over to another object.
  const selectionKey = sel.join(',');

  return (
    <div className="prop-panel bevel-in">
      <div className="prop-header">
        <div className="prop-header-name">Name</div>
        <div className="prop-header-value">Value</div>
      </div>
      <div className="prop-list">
        {rows.map((row, i) => (
          <PropRowView key={`${selectionKey}:${i}:${row.label}`} row={row} />
        ))}
      </div>
    </div>
  );
}
