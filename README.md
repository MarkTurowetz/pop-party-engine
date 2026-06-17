# Flip 7 Party

A server-backed Flip 7-style stage/controller party game.

## Local

```bash
node server.js
```

Open the stage:

```text
http://localhost:3000/stage
```

Open a controller:

```text
http://localhost:3000/controller
```

Short aliases:

```text
http://localhost:3000/s
http://localhost:3000/c
http://localhost:3000/l
```

## Deploy

This app is ready for Render as a Node web service.

- Build command: leave blank
- Start command: `node server.js`
- Health check path: `/api/health`

The included `render.yaml` defines the same settings as a Render Blueprint.

## Chrome Controller Spawner

An unpacked Chrome extension lives in `chrome-extension/`.

To install it locally:

1. Open `chrome://extensions`
2. Turn on Developer mode
3. Click Load unpacked
4. Select the `chrome-extension` folder

Use it from an open Flip 7 Party stage or controller page. Enter a stage code, player names, and controller count, then spawn controllers.
