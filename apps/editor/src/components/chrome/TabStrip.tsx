import { DEFAULT_KEYMAP } from '../../commands/defaultKeymap';
import { setTab } from '../../state/actions';
import { useEditor, type Tab } from '../../state/store';
import { Tabs, type TabItem } from '../../ui';

export const TAB_PREFIX = 'workspace';

const TABS: TabItem<Tab>[] = [
  { id: 'scene', label: 'Scene', shortcut: DEFAULT_KEYMAP['window.scene'] },
  { id: 'textures', label: 'Textures', shortcut: DEFAULT_KEYMAP['window.textures'] },
  { id: 'localisation', label: 'Localisation', shortcut: DEFAULT_KEYMAP['window.localisation'] },
  { id: 'scripts', label: 'Scripts', shortcut: DEFAULT_KEYMAP['window.scripts'] },
  { id: 'animations', label: 'Animations', shortcut: DEFAULT_KEYMAP['window.animations'] },
];

export function TabStrip() {
  const tab = useEditor((s) => s.tab);
  return <Tabs label="Workspace" idPrefix={TAB_PREFIX} tabs={TABS} value={tab} onChange={setTab} className="app-tabs" />;
}
