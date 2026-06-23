# Party Game Controller Spawner

Load this folder as an unpacked Chrome extension from `chrome://extensions`.

Hotkeys:

- `Command+Option+Shift+1` / `Ctrl+Alt+Shift+1`: spawn controllers
- `Command+Option+Shift+2` / `Ctrl+Alt+Shift+2`: tap a random visible option
- `Command+Option+Shift+3` / `Ctrl+Alt+Shift+3`: submit random text

These hotkeys are handled by `hotkeys.js` while a Party Game Template page is focused. Do not add these combinations as `commands.suggested_key` defaults in `manifest.json`; Chrome rejects some three-modifier digit combinations during manifest load.
