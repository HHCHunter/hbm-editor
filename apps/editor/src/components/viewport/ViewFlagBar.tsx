import { Eye, Palette, Video } from 'lucide-react';
import { CommandMenuButton } from '../../commands/CommandMenuButton';
import { setLod } from '../../state/actions';
import { useEditor } from '../../state/store';
import { Select, Toolbar } from '../../ui';

/**
 * The viewport's own bar: camera angles, how models are drawn, what's shown and the level of
 * detail, each as a menu of commands with their names and check marks.
 */
export function ViewFlagBar() {
  const lod = useEditor((s) => s.filters.lod);

  return (
    <Toolbar label="Viewport display" className="viewport-toolbar">
      <span className="viewport-label">Perspective</span>
      <CommandMenuButton
        label="Camera"
        icon={Video}
        layout={['camera.frameSelected', 'camera.frameAll', '-', 'camera.resetAngle', 'camera.viewTop', 'camera.viewBottom', 'camera.viewLeft', 'camera.viewRight']}
      >
        Camera
      </CommandMenuButton>
      <CommandMenuButton
        label="Drawing"
        icon={Palette}
        layout={['view.modeLit', 'view.modeUnlit', 'view.modeWireframe', '-', 'view.textures', 'view.fog']}
      >
        Drawing
      </CommandMenuButton>
      <CommandMenuButton
        label="Show"
        icon={Eye}
        layout={[
          'view.grid',
          'view.markers',
          'view.skeletons',
          { submenu: 'Hidden Geometry', items: ['view.show.collision', 'view.show.bounds', 'view.show.shadow', 'view.show.helper', 'view.show.placeholder'] },
        ]}
      >
        Show
      </CommandMenuButton>
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
