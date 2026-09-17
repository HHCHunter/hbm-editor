import { RotateCcw } from 'lucide-react';
import type { HiddenReasonDTO } from '@hbm/protocol';
import { DEFAULT_KEYMAP } from '../../commands/defaultKeymap';
import { resetViewAngle, setLod, toggleShown, toggleViewFlag, VIEW_ANGLES, viewFrom } from '../../state/actions';
import { VIEW_FLAGS, VIEW_FLAG_TITLES, useEditor, type ViewFlag } from '../../state/store';
import { Button, IconButton, Select, ToggleButton, Toolbar, ToolbarSeparator, Tooltip } from '../../ui';

const FLAG_SHORTCUTS: Partial<Record<ViewFlag, string>> = {
  W: DEFAULT_KEYMAP['view.wireframe'],
  G: DEFAULT_KEYMAP['view.grid'],
};

const SHOWN: [reason: HiddenReasonDTO, label: string, title: string][] = [
  ['collision', 'K', 'Collision geometry'],
  ['bounds', 'Bd', 'Bounds and trigger volumes'],
  ['shadow', 'Sh', 'Shadow geometry'],
  ['helper', 'Hl', 'Helper geometry'],
  ['placeholder', 'Ph', 'Placeholder geometry'],
];

const SIDES = Object.keys(VIEW_ANGLES) as (keyof typeof VIEW_ANGLES)[];

export function ViewFlagBar() {
  const view = useEditor((s) => s.view);
  const filters = useEditor((s) => s.filters);

  return (
    <Toolbar label="Viewport display" className="viewport-toolbar">
      <span className="viewport-label">Perspective</span>
      {VIEW_FLAGS.map((flag) => (
        <ToggleButton
          key={flag}
          className="viewflag"
          label={VIEW_FLAG_TITLES[flag]}
          shortcut={FLAG_SHORTCUTS[flag]}
          pressed={view[flag]}
          onPressedChange={() => toggleViewFlag(flag)}
        >
          {flag}
        </ToggleButton>
      ))}
      <ToolbarSeparator />
      {SHOWN.map(([reason, label, title]) => (
        <ToggleButton
          key={reason}
          className="viewflag"
          label={title}
          description="Special geometry the game doesn't draw"
          pressed={filters.show[reason]}
          onPressedChange={() => toggleShown(reason)}
        >
          {label}
        </ToggleButton>
      ))}
      <ToolbarSeparator />
      {SIDES.map((side) => (
        <Tooltip key={side} title={`Look from the ${side.toLowerCase()}`} describe={false}>
          <Button variant="tool" className="viewflag" aria-label={`Look from the ${side.toLowerCase()}`} onClick={() => viewFrom(side)}>
            {side[0]}
          </Button>
        </Tooltip>
      ))}
      <IconButton icon={RotateCcw} className="viewflag" label="Default view angle" onClick={resetViewAngle} />
      <ToolbarSeparator />
      <Select
        label="Level of detail"
        hideLabel
        compact
        value={filters.lod}
        options={[0, 1, 2, 3, 4, 5, 6, 7].map((level) => ({ value: level, label: `LOD ${level}` }))}
        onChange={setLod}
      />
    </Toolbar>
  );
}
