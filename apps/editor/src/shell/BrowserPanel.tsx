import { Maximize2, Minimize2 } from 'lucide-react';
import { shortcutOf, useKeymap } from '../commands';
import { CommandButton } from '../commands/CommandButton';
import { AnimationBrowser } from '../panels/AnimationBrowser';
import { LocalisationBrowser } from '../panels/LocalisationBrowser';
import { MaterialBrowser } from '../panels/materials/MaterialBrowser';
import { ScriptBrowser } from '../panels/ScriptBrowser';
import { TextureBrowser } from '../panels/TextureBrowser';
import { setBrowserMaximised, showBrowser } from '../state/actions';
import { useEditor, type BrowserTab } from '../state/store';
import { BROWSER_TAB_PREFIX } from './layoutStore';
import { TabPanel, Tabs } from '../ui';

const TABS: [BrowserTab, string][] = [
  ['textures', 'Textures'],
  ['materials', 'Materials'],
  ['localisation', 'Localisation'],
  ['scripts', 'Scripts'],
  ['animations', 'Animations'],
];

/**
 * The browsers, as tabs in the panel under the viewport. Double-click a tab, or use the button at
 * the end of the tabs, to let the panel fill the viewport's space.
 */
export function BrowserPanel() {
  const browser = useEditor((s) => s.browser);
  const maximised = useEditor((s) => s.browserMaximised);
  const overrides = useKeymap((s) => s.overrides);
  const tabs = TABS.map(([id, label]) => ({
    id,
    label,
    shortcut: shortcutOf(`window.${id}`, overrides),
  }));

  return (
    <>
      <div className="browser-panel-head">
        <Tabs
          label="Browsers"
          idPrefix={BROWSER_TAB_PREFIX}
          tabs={tabs}
          value={browser}
          onChange={showBrowser}
          onTabDoubleClick={() => setBrowserMaximised(!maximised)}
          className="browser-panel-tabs"
        />
        <CommandButton
          command="window.maximiseBrowser"
          iconOnly
          icon={maximised ? Minimize2 : Maximize2}
        />
      </div>
      <TabPanel idPrefix={BROWSER_TAB_PREFIX} id={browser} className="browser-panel-page">
        {browser === 'textures' && <TextureBrowser />}
        {browser === 'materials' && <MaterialBrowser />}
        {browser === 'localisation' && <LocalisationBrowser />}
        {browser === 'scripts' && <ScriptBrowser />}
        {browser === 'animations' && <AnimationBrowser />}
      </TabPanel>
    </>
  );
}
