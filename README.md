# Hitman: Blood Money Editor

A local web editor for Hitman: Blood Money, styled after IOI's internal Editor2.

## Running it

Double-click **`start.bat`**. The first run downloads what it needs (a portable Node.js if you
don't have version 22 or newer, then the editor's dependencies) and builds the editor. Later runs
start in a few seconds. The editor opens in your browser at http://127.0.0.1:4757 and stops when
you close the launcher window.

Options go after the script name, for example `start.bat --port 5000` or `start.bat --no-open`.

Deleting the `.runtime` folder forces a clean reinstall. Your settings, such as which game install
you chose, are kept separately in the `data` folder, so a reinstall doesn't lose them.

## Status

The viewer is done (M1). On first run the editor asks where the game is installed, then lists
its scenes. An open scene shows:

- a three.js viewport of the level, textured and instanced, with toggles for collision, bounds,
  shadow, helper and placeholder geometry and a choice of LOD
- the outliner, and a property grid with each object's transform, GMS record, materials and
  scene properties
- texture and localisation browsers

Hiding and freezing objects are editor-only and undoable; nothing is written to the game yet.
Safe edits (texture replacement and localisation text, into a mod folder) come next (M2).

The readers are written from the HitmanBloodMoneyRecompilation project's reimplemented engine
code and format documentation.

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
pnpm e2e         # builds, then drives the editor in Edge against a generated game
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
