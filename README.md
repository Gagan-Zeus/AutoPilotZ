# AutoPilotX

AutoPilotX is a Manifest V3 Chrome Extension built with TypeScript, React, Vite,
Tailwind, Zustand, IndexedDB, Chrome Storage, ESLint, Prettier, and Vitest.

## Structure

- `src/core`: entities, ports, and use cases with no browser dependencies.
- `src/infra`: Chrome Storage, IndexedDB vault, WebCrypto, and AI mapping adapters.
- `src/background`: service worker composition root and message handling.
- `src/content`: page field extraction and mapping application.
- `src/popup`: popup React app and Zustand state.
- `src/options`: options React app and Zustand state.
- `src/shared`: typed runtime and content messaging contracts.
- `tests`: focused unit tests for core behavior and adapters.

## Commands

```sh
npm install
npm run lint
npm test
npm run build
npm run format:check
```

## Load The Extension

Run `npm run build`, then load `/Users/gagandeeps/Documents/AutoPilotZ/dist`
from `chrome://extensions` with Developer mode enabled.
