import { drawsVariant } from '@hbm/scene';
import { showMaterial, showTexture } from '../state/actions';
import type { EditorStore } from '../state/store';
import type { MenuEntry } from '../ui';
import { meshPartsOf } from '../viewport/meshStore';
import { useKeymap } from './keymap';
import { menuEntries } from './menus';

/** The materials the first selected object draws with, by slot, in part order. */
export function materialsOfSelection(state: EditorStore): number[] {
  const scene = state.scene;
  const node = scene && state.sel.length ? scene.graph.nodes[state.sel[0]!] : undefined;
  if (!scene || !node?.meshRoot) return [];
  const parts = meshPartsOf(scene.id, node.meshRoot) ?? [];
  return [...new Set(parts.filter((p) => drawsVariant(node.variantId, p.variantId)).map((p) => p.materialSlot))];
}

/** The right-click menu for scene objects: acts on the selection. */
export function objectMenu(state: EditorStore): MenuEntry[] {
  const overrides = useKeymap.getState().overrides;
  const common = menuEntries(
    [
      'camera.frameSelected',
      'edit.hide',
      'edit.freeze',
      'edit.isolate',
      '-',
      'selection.children',
      'selection.parent',
      'selection.sameClass',
      '-',
      'edit.copyName',
      'edit.copyPath',
      'edit.copyIndex',
    ],
    state,
    overrides,
    'object',
  );

  const slots = materialsOfSelection(state);
  const surfaces = state.scene?.surfaces ?? {};
  const name = (slot: number) => surfaces[slot]?.name ?? `Material ${slot}`;
  const noModel = state.sel.length ? 'This object has no model, or it hasn’t loaded yet' : 'Select an object first';
  const materials: MenuEntry = slots.length
    ? { kind: 'submenu', id: 'object.materials', label: 'Show Material', items: slots.map((slot) => ({ id: `object.material.${slot}`, label: name(slot), onSelect: () => showMaterial(slot) })) }
    : { id: 'object.materials', label: 'Show Material', disabled: true, disabledReason: noModel, onSelect: () => {} };
  // Each material's colour texture, named after the material since the menu has no texture names.
  const colourTextures = new Map<number, string>();
  for (const slot of slots) {
    const id = surfaces[slot]?.diffuseTextureId;
    if (id != null && !colourTextures.has(id)) colourTextures.set(id, name(slot).split('/').pop()!);
  }
  const textureIds = [...colourTextures.keys()];
  const textures: MenuEntry = textureIds.length
    ? {
        kind: 'submenu',
        id: 'object.textures',
        label: 'Show Texture',
        items: textureIds.map((id) => ({ id: `object.texture.${id}`, label: `Colour texture of ${colourTextures.get(id)}`, onSelect: () => showTexture(id) })),
      }
    : { id: 'object.textures', label: 'Show Texture', disabled: true, disabledReason: noModel, onSelect: () => {} };

  return [...common, { kind: 'separator', id: 'object.sep.show' }, materials, textures];
}
