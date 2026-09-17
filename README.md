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

Milestone M0: the Editor2 interface running against a built-in mock scene, with a three.js
viewport, outliner, property grid and undo. Reading real game files comes next (M1).

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
