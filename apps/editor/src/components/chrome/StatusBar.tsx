import { useEditor } from '../../state/store';

export function StatusBar() {
  const statusMsg = useEditor((s) => s.statusMsg);
  const selCount = useEditor((s) => s.sel.length);
  const cam = useEditor((s) => s.cam);

  return (
    <div className="statusbar">
      <div className="status-cell status-main bevel-in">{statusMsg}</div>
      <div className="status-cell status-sel bevel-in">
        {selCount ? `${selCount} object(s) selected` : 'Nothing selected'}
      </div>
      <div className="status-cell status-cam bevel-in">
        y{cam.yaw.toFixed(2)} p{cam.pitch.toFixed(2)} d{cam.dist.toFixed(0)}
      </div>
    </div>
  );
}
