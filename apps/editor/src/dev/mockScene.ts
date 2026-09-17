import { ROOT_ID, type LightParams, type ObjectClass, type SceneObject } from '../scene/types';

export interface MockScene {
  objects: SceneObject[];
  /** Groups the outliner starts collapsed. */
  collapsed: Record<string, boolean>;
}

type V3 = [number, number, number];

interface AddOptions {
  tint?: string;
  wire?: string;
  light?: LightParams;
  collapsed?: boolean;
}

/** The design artboard's sample M06 lobby. Stands in for a real scene until scene loading lands in M1. */
export function buildMockScene(): MockScene {
  const objects: SceneObject[] = [];
  const collapsed: Record<string, boolean> = {};

  const add = (
    id: string,
    name: string,
    cls: ObjectClass,
    parent: string,
    pos: V3,
    size: V3 | null,
    opt: AddOptions = {},
  ) => {
    objects.push({
      id,
      name,
      cls,
      parent,
      pos: { x: pos[0], y: pos[1], z: pos[2] },
      size: size ? { x: size[0], y: size[1], z: size[2] } : null,
      tint: opt.tint ?? '#8b7a5c',
      wire: opt.wire ?? null,
      light: opt.light ?? null,
      hidden: false,
      frozen: false,
      inactive: false,
    });
    if (opt.collapsed) collapsed[id] = true;
  };

  add(ROOT_ID, 'Objects', '', '', [0, 0, 0], null);
  add('inside', 'M06MOB_LOC_Inside.zip', 'ZGROUP', ROOT_ID, [0, 0, 0], null);
  add('lobby', 'M06_LO_Lobby_101', 'ZGROUP', 'inside', [0, 0, 0], null);
  add('f1', 'S06G_Floor_Hex_2x4m_01', 'ZGEOM', 'lobby', [0, -0.35, 0], [42, 0.7, 28], { tint: '#7b6a4b' });
  add('c1', 'S06G_Ceiling_Panel_01', 'ZGEOM', 'lobby', [0, 13.2, 0], [42, 0.6, 28], { tint: '#5e5a4e' });
  add('w1', 'S06G_WallA_4m_01', 'ZGEOM', 'lobby', [0, 6.3, -14], [42, 12.6, 0.8], { tint: '#6f6a52' });
  add('w2', 'S06G_WallA_4m_02', 'ZGEOM', 'lobby', [0, 6.3, 14], [42, 12.6, 0.8], { tint: '#6f6a52' });
  add('w3', 'S06G_WallA_4m_03', 'ZGEOM', 'lobby', [21, 6.3, 0], [0.8, 12.6, 28], { tint: '#6a6550' });
  add('w4', 'S06G_WallA_Door_4m_04', 'ZGEOM', 'lobby', [-21, 6.3, 0], [0.8, 12.6, 28], { tint: '#6a6550' });
  add('bal', 'S06G_SidePartA_03', 'ZGEOM', 'lobby', [-5, 7.4, -9.5], [28, 0.7, 8], { tint: '#6b5a40' });
  add('rail', 'S06G_Rail_4m_01', 'ZGEOM', 'lobby', [-5, 8.7, -5.4], [28, 1.5, 0.3], {
    tint: '#4c3e2c',
    wire: '#66ffff',
  });

  add('stairs', 'M06_LO_Staircase_101', 'ZGROUP', 'lobby', [0, 0, 0], null, { collapsed: true });
  for (let i = 0; i < 7; i++) {
    add(`st${i}`, `S06G_StepA_0${i + 1}`, 'ZGEOM', 'stairs', [14.5, 0.7 + i * 1.15, 8 - i * 1.7], [6.4, 0.7, 1.7], {
      tint: '#6e5c42',
    });
  }

  const tables: [number, number][] = [
    [-10, 6],
    [2, 8.5],
    [10.5, -2],
    [-12.5, -4],
  ];
  tables.forEach(([tx, tz], i) => {
    const gid = `tbl${i}`;
    add(gid, `TableSetup_0${i + 1}`, 'ZGROUP', 'lobby', [tx, 0, tz], null, { collapsed: true });
    add(`${gid}top`, `Pc06F_TableA_0${i + 1}`, 'ZGEOM', gid, [tx, 2.7, tz], [3.2, 0.25, 3.2], {
      tint: '#cdc4ae',
      wire: '#66ffff',
    });
    add(`${gid}ped`, `Pc06F_TableLegA_0${i + 1}`, 'ZGEOM', gid, [tx, 1.35, tz], [0.5, 2.7, 0.5], {
      tint: '#3f3528',
      wire: '#66ffff',
    });
    const chairs: [number, number][] = [
      [2.4, 0],
      [-2.4, 0.6],
      [0.4, 2.5],
    ];
    chairs.forEach(([cx, cz], j) => {
      add(`${gid}c${j}`, `Pc06F_ChairA_0${j + 1}`, 'ZGEOM', gid, [tx + cx, 1.5, tz + cz], [1.5, 0.22, 1.5], {
        tint: '#5a4632',
        wire: '#66ffff',
      });
      add(
        `${gid}b${j}`,
        `Pc06F_ChairBackA_0${j + 1}`,
        'ZGEOM',
        gid,
        [tx + cx * 1.35, 2.3, tz + cz * 1.35],
        [1.4, 1.8, 0.2],
        { tint: '#4e3d2b', wire: '#66ffff' },
      );
    });
  });

  add('cab', 'M06_LO_Cabinets_101', 'ZGROUP', 'lobby', [0, 0, 0], null, { collapsed: true });
  for (let i = 0; i < 5; i++) {
    add(`cb${i}`, `Pc06F_CabinetA_0${i + 1}`, 'ZGEOM', 'cab', [-19, 3.1, -9 + i * 4.5], [2.4, 6.2, 3.4], {
      tint: '#43331f',
      wire: '#ff9a3c',
    });
  }
  add('globe', 'Pc06F_Globe_01', 'ZGEOM', 'lobby', [16.5, 2, 10.5], [2.4, 3.6, 2.4], {
    tint: '#6d6350',
    wire: '#ff9a3c',
  });

  add('lgrp', 'M06_LO_Lights_101', 'ZGROUP', 'inside', [0, 0, 0], null);
  const omnis: V3[] = [
    [-10, 9.2, 6],
    [2, 9.2, 8.5],
    [10.5, 9.2, -2],
    [-12.5, 9.2, -4],
  ];
  omnis.forEach((p, i) => {
    add(`om${i}`, `Omni0${i + 1}`, 'ZLIGHT', 'lgrp', p, null, { light: { intensity: 1.15, radius: 15 } });
  });
  add('chand', 'ChandelierSetup', 'ZLIGHT', 'lgrp', [0, 10, 0], null, {
    light: { intensity: 2.1, radius: 26 },
  });
  add('omc', 'Omni02_character', 'ZLIGHT', 'lgrp', [14, 5.5, 4], null, {
    light: { intensity: 0.8, radius: 12 },
  });

  add('outside', 'M06MOB_LOC_Outside.zip', 'ZGROUP', ROOT_ID, [0, 0, 0], null, { collapsed: true });
  add('street', 'S06G_StreetA_01', 'ZGEOM', 'outside', [0, -1.4, 40], [64, 1, 22], {
    tint: '#33323a',
    wire: '#ff9a3c',
  });
  add('car', 'Pc06F_CarA_01', 'ZGEOM', 'outside', [-14, 0.8, 36], [4.8, 2.6, 10], {
    tint: '#2c3138',
    wire: '#ff9a3c',
  });

  return { objects, collapsed };
}
