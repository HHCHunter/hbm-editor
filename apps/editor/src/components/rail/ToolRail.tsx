import { CommandButton } from '../../commands/CommandButton';
import { executeCommand, useCommandState } from '../../commands';
import { RadioGroup, Toolbar, ToolbarGroupLabel } from '../../ui';

export function ToolRail() {
  const pickGroups = useCommandState('selection.pickGroups').checked;

  return (
    <div className="rail">
      <Toolbar label="Scene tools" orientation="vertical">
        <ToolbarGroupLabel>Scene</ToolbarGroupLabel>
        <CommandButton command="file.openScene">Open…</CommandButton>
        <CommandButton command="file.chooseGame">Game…</CommandButton>

        <ToolbarGroupLabel>Frame</ToolbarGroupLabel>
        <CommandButton command="camera.frameAll">All</CommandButton>
        <CommandButton command="camera.frameSelected">Selected</CommandButton>

        <ToolbarGroupLabel>History</ToolbarGroupLabel>
        <CommandButton command="edit.undo">Undo</CommandButton>
        <CommandButton command="edit.redo">Redo</CommandButton>
      </Toolbar>

      <div className="rail-group">
        <ToolbarGroupLabel>Click selects</ToolbarGroupLabel>
        <RadioGroup
          label="Click selects"
          value={pickGroups ? 'group' : 'object'}
          options={[
            { value: 'object', label: 'Object' },
            { value: 'group', label: 'Group' },
          ]}
          onChange={(value) => executeCommand(value === 'group' ? 'selection.pickGroups' : 'selection.pickObjects')}
        />
        <CommandButton command="selection.invert" icon={null} />
      </div>
    </div>
  );
}
