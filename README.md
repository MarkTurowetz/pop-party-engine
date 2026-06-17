# Pop Party

A tiny Jackbox-style stage/controller app.

## Local

```bash
node server.js
```

Open the stage:

```text
http://localhost:3000/?role=stage
```

Open a controller:

```text
http://localhost:3000/?role=controller
```

## Deploy

This app is ready for Render as a Node web service.

- Build command: leave blank
- Start command: `node server.js`
- Health check path: `/api/health`

The included `render.yaml` defines the same settings as a Render Blueprint.
