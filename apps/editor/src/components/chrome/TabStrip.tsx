import { useKeymap, shortcutOf } from '../../commands';
import { setTab } from '../../state/actions';
import { useEditor, type Tab } from '../../state/store';
import { Tabs } from '../../ui';

export const TAB_PREFIX = 'workspace';

const TABS: [Tab, string][] = [
  ['scene', 'Scene'],
  ['textures', 'Textures'],
  ['localisation', 'Localisation'],
  ['scripts', 'Scripts'],
  ['animations', 'Animations'],
];

export function TabStrip() {
  const tab = useEditor((s) => s.tab);
  const overrides = useKeymap((s) => s.overrides);
  const tabs = TABS.map(([id, label]) => ({ id, label, shortcut: shortcutOf(`window.${id}`, overrides) }));
  return <Tabs label="Workspace" idPrefix={TAB_PREFIX} tabs={tabs} value={tab} onChange={setTab} className="app-tabs" />;
}
