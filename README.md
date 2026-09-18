# Ninja Engine v0.11 — Connected Runtime

Standalone 2D RPG editor/runtime for desktop, web/PWA and Android packaging.

## New in v0.11
- Secure Electron preload bridge.
- AI Assistant integration through the OpenAI Responses API.
- Notion connection health check.
- GitHub connection health check.
- Connections panel inside the editor.
- Secrets are read from the desktop environment rather than exposed to the renderer.
- `.env.example` documents the required integration variables.

The application does not magically inherit the user's ChatGPT conversation. The AI integration is an API connection and requires an OpenAI API key. Notion and GitHub similarly require their respective credentials.

## Desktop
```bash
npm install
npm start
```

Set environment variables from `.env.example` before starting Electron.

## Android
The Android project remains available through the existing Capacitor preparation/build scripts. Desktop-only credential bridges are intentionally not exposed directly to an Android WebView; Android should use a separately authenticated backend in a later secure integration stage.

## APK pelo GitHub Actions

Cada envio para a branch `main` executa o workflow **Build Android APK**. Ao terminar, o APK de teste fica disponível na aba **Actions**, dentro do artefato `NinjaEngine-debug-apk`.
