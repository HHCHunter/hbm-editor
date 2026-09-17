import type { HiddenReasonDTO } from '@hbm/protocol';
import { setLod, toggleShown, toggleViewFlag } from '../../state/actions';
import { VIEW_FLAGS, VIEW_FLAG_TITLES, useEditor } from '../../state/store';

const SHOWN: [reason: HiddenReasonDTO, label: string, title: string][] = [
  ['bounds', 'Bd', 'Bounds and trigger volumes'],
  ['shadow', 'Sh', 'Shadow geometry'],
  ['helper', 'Hl', 'Helper geometry'],
  ['placeholder', 'Ph', 'Placeholder geometry'],
];

export function ViewFlagBar() {
  const view = useEditor((s) => s.view);
  const filters = useEditor((s) => s.filters);

  return (
    <div className="viewport-toolbar">
      <div className="viewport-label">Perspective</div>
      {VIEW_FLAGS.map((flag) => (
        <div
          key={flag}
          className={`viewflag${view[flag] ? ' on' : ''}`}
          title={VIEW_FLAG_TITLES[flag]}
          onClick={() => toggleViewFlag(flag)}
        >
          {flag}
        </div>
      ))}
      <div className="viewflag-sep" />
      {SHOWN.map(([reason, label, title]) => (
        <div
          key={reason}
          className={`viewflag${filters.show[reason] ? ' on' : ''}`}
          title={title}
          onClick={() => toggleShown(reason)}
        >
          {label}
        </div>
      ))}
      <div className="viewflag-sep" />
      <select
        className="viewport-lod"
        title="Level of detail"
        value={filters.lod}
        onChange={(e) => setLod(Number(e.target.value))}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7].map((level) => (
          <option key={level} value={level}>
            LOD {level}
          </option>
        ))}
      </select>
    </div>
  );
}
