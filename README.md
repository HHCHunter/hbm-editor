# Hitman: Blood Money Editor

A local web editor for Hitman: Blood Money, styled after IOI's internal Editor2.

## Running it

Double-click **`start.bat`**. The first run downloads what it needs (a portable Node.js if you
don't have version 22 or newer, then the editor's dependencies) and builds the editor. Later runs
start in a few seconds. The editor opens in your browser at http://127.0.0.1:4757 and stops when
you close the launcher window.

Options go after the script name, for example `start.bat --port 5000` or `start.bat --no-open`.

Deleting the `.runtime` folder forces a clean reinstall.

## Status

The Editor2 interface runs against a built-in mock scene, with a three.js viewport, outliner,
property grid and undo (M0).

The game file readers are done (M1a–b): scene archives, localisation, scene properties, geoms and
placements, textures, meshes and materials, joined into a scene graph with mesh parts and surfaces.
They're written from the HitmanBloodMoneyRecompilation project's reimplemented engine code and
format documentation. Serving real scenes to the interface comes next (M1c–d).

To check the readers against your own install (PowerShell):

```
$env:HBM_GAME_DIR = "D:\Games\Hitman Blood Money"
pnpm sweep
```

## Working on the editor

The project scripts call `pnpm` by name, so it has to be on PATH. After `start.bat` has run once,
the shims are in `.runtime\bin`. Alternatively, run `corepack enable` once (it may need an
administrator prompt).

```
pnpm dev         # Vite with hot reload plus the API server, at http://127.0.0.1:5173
pnpm test        # unit tests
pnpm typecheck
pnpm lint
```

The layout:

| Folder | Contents |
|---|---|
| `apps/editor` | The React + three.js interface |
| `packages/server` | Local Fastify server (loopback only) |
| `packages/protocol` | Types shared by server and editor |
| `packages/formats` | Game file readers and writers (from M1) |
| `packages/scene` | Joins the formats into a scene (from M1) |
| `design/` | The original Claude Design artboard the interface is ported from |
