import { CommandButton } from '../../commands/CommandButton';
import { setLod } from '../../state/actions';
import { useEditor } from '../../state/store';
import { Select, Toolbar, ToolbarSeparator } from '../../ui';

/** Short codes for the flags; the commands' titles and descriptions are in the tooltips. */
const FLAGS: [command: string, code: string][] = [
  ['view.wireframe', 'W'],
  ['view.markers', 'P'],
  ['view.lighting', 'Li'],
  ['view.textures', 'Tx'],
  ['view.fog', 'F'],
  ['view.grid', 'G'],
  ['view.skeletons', 'Bn'],
];

const SHOWN: [command: string, code: string][] = [
  ['view.show.collision', 'K'],
  ['view.show.bounds', 'Bd'],
  ['view.show.shadow', 'Sh'],
  ['view.show.helper', 'Hl'],
  ['view.show.placeholder', 'Ph'],
];

const SIDES: [command: string, code: string][] = [
  ['camera.viewTop', 'T'],
  ['camera.viewBottom', 'B'],
  ['camera.viewLeft', 'L'],
  ['camera.viewRight', 'R'],
];

export function ViewFlagBar() {
  const lod = useEditor((s) => s.filters.lod);

  return (
    <Toolbar label="Viewport display" className="viewport-toolbar">
      <span className="viewport-label">Perspective</span>
      {FLAGS.map(([command, code]) => (
        <CommandButton key={command} command={command} className="viewflag" icon={null}>
          {code}
        </CommandButton>
      ))}
      <ToolbarSeparator />
      {SHOWN.map(([command, code]) => (
        <CommandButton key={command} command={command} className="viewflag" icon={null}>
          {code}
        </CommandButton>
      ))}
      <ToolbarSeparator />
      {SIDES.map(([command, code]) => (
        <CommandButton key={command} command={command} className="viewflag" icon={null}>
          {code}
        </CommandButton>
      ))}
      <CommandButton command="camera.resetAngle" className="viewflag" iconOnly />
      <ToolbarSeparator />
      <Select
        label="Level of detail"
        hideLabel
        compact
        value={lod}
        options={[0, 1, 2, 3, 4, 5, 6, 7].map((level) => ({ value: level, label: `LOD ${level}` }))}
        onChange={setLod}
      />
    </Toolbar>
  );
}
