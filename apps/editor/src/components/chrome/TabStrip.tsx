import { setTab } from '../../state/actions';
import { useEditor, type Tab } from '../../state/store';

const TABS: [Tab, string][] = [
  ['scene', 'Scene'],
  ['textures', 'Textures'],
  ['localisation', 'Localisation'],
  ['scripts', 'Scripts'],
];

export function TabStrip() {
  const tab = useEditor((s) => s.tab);
  return (
    <div className="tabstrip" role="tablist">
      {TABS.map(([id, label]) => (
        <div key={id} role="tab" aria-selected={tab === id} className={`tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
          {label}
        </div>
      ))}
    </div>
  );
}
