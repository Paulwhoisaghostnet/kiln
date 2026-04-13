# WASM Runtime Checks

Use when package is hosted (not strictly local file playback):

- Serve `.wasm` with `application/wasm` MIME type.
- Ensure required CORS and SharedArrayBuffer-related headers are configured.
- Confirm SPA redirect behavior does not break static asset paths.
- Verify deployment base directory and publish directory are correct.
- Re-test FFmpeg/WASM initialization after deploy using browser console logs.
