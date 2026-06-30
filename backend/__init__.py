"""FastAPI backend for Collective Memory City.

Absorbs the Python ``pipeline`` package (SHARP reconstruction runs inline here) and
serves the explorer's manifest, the memory store, uploads, asset delivery, and the
real-time joystick control channel — all same-origin behind Caddy on the ki-pc box.

This replaces the Next.js Route Handlers (``web/src/app/api/**``) and the standalone
``pipeline.watch`` watcher. The pure logic mirrors the former TypeScript modules
(``web/src/server/**`` + ``web/src/lib/{geo,upload,exif,manifest}``) and is unit-tested
with pytest; SHARP, EXIF parsing, and the filesystem/WebSocket are the seams.
"""
