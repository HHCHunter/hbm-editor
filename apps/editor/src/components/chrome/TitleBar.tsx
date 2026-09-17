import { useEditor } from '../../state/store';

export function TitleBar() {
  const scenePath = useEditor((s) => s.scenePath);
  const dirty = useEditor((s) => s.dirty);

  return (
    <div className="titlebar">
      <div className="titlebar-icon">E</div>
      <div className="titlebar-text">
        Editor2 - {scenePath}
        {dirty ? ' *' : ''}
      </div>
      {/* Window buttons are part of the Editor2 look; a browser tab has nothing for them to do. */}
      <div className="titlebar-buttons" aria-hidden="true">
        <div className="titlebar-button" style={{ alignItems: 'flex-end' }}>
          _
        </div>
        <div className="titlebar-button" style={{ fontSize: 8 }}>
          ❐
        </div>
        <div className="titlebar-button">✕</div>
      </div>
    </div>
  );
}
