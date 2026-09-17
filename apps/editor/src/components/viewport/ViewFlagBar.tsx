import { toggleViewFlag } from '../../state/actions';
import { VIEW_FLAGS, VIEW_FLAG_TITLES, useEditor } from '../../state/store';

export function ViewFlagBar() {
  const view = useEditor((s) => s.view);

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
    </div>
  );
}
