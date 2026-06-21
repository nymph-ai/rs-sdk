# GPU Acceleration And Native Client Plan

This fork treats the current browser client as the compatibility path and introduces GPU work in stages. The existing client is a TypeScript refactor of the 2004-era software renderer: scene traversal, model transforms, triangle rasterization, texture sampling, sprite blending, font drawing, and final canvas upload are all CPU-side.

## Current Branch Scope

The first implementation slice adds a feature-detected WebGPU presentation backend:

- `server/webclient/src/graphics/WebGpuFramePresenter.ts`
- `server/webclient/src/graphics/Canvas.ts`
- `server/webclient/src/graphics/PixMap.ts`

When WebGPU is available, `PixMap.draw()` uploads each prepared `ImageData` region into a GPU texture and presents it through a full-screen WGSL shader. The existing 2D canvas path remains the fallback and can be forced with:

```text
?renderer=canvas
```

or:

```js
localStorage.setItem('rs-sdk.renderer', 'canvas')
```

This does not yet make the client "fully GPU rendered." It removes the browser 2D canvas `putImageData` presentation path from the hot path when WebGPU is available, but the software rasterizer still produces the source pixels on the CPU.

## Full WebGPU Renderer Target

The real performance target is to replace the `Pix2D`/`Pix3D` software renderer with GPU-native passes:

1. **Scene extraction**
   - Convert map squares, ground faces, loc models, NPC models, player models, projectiles, spot animations, sprites, and UI widgets into stable render packets.
   - Keep game simulation and render extraction separate so the renderer can run ahead/interpolate independently.

2. **GPU resource model**
   - Static vertex/index buffers for cache/model geometry.
   - Texture arrays or atlases for 64x64 and 128x128 game textures.
   - Dynamic instance buffers for animated entities, locs, projectiles, overhead icons, and billboards.
   - Uniform/storage buffers for camera, lighting tables, animation frame transforms, and clip state.

3. **3D world pass**
   - WebGPU render pipeline with depth buffer.
   - Hardware triangle rasterization replacing `Pix3D.gouraudTriangle`, `flatTriangle`, `textureTriangle`, and `textureRaster`.
   - WGSL shaders reproducing the original fixed-point color table, low-detail modes, alpha rules, and texture darkening.

4. **2D/UI pass**
   - Sprite atlas pipeline replacing `Pix8`, `Pix32`, and most `Pix2D` per-pixel loops.
   - Font glyph atlas and signed-distance-field option for high-DPI native clients.
   - Scissor rectangles for interface clipping.

5. **Compute-assisted work**
   - Optional compute pipelines for software-compatible lighting table generation, minimap raster/cache updates, visibility masks, and coarse culling.
   - Do not move branchy game logic to GPU unless profiling proves it is a bottleneck; GPU transfer overhead can lose against CPU for small stateful workloads.

6. **Compatibility harness**
   - Golden-frame comparison between current CPU renderer and WebGPU renderer.
   - Pixel tolerance per pass, because browser color management and GPU interpolation can differ slightly.
   - Benchmark harness for CPU time, GPU frame time, JS heap, and bot-client throughput.

## Server CPU Boundary

The LostCity engine is still a server simulation. GPU acceleration should not target normal server gameplay logic first. Server hot spots worth profiling before GPU work:

- pathfinding and route expansion
- NPC processing
- player update packet building
- script execution
- collision/map queries

Most of those are branch-heavy, stateful, and latency-sensitive. They are usually better served by data layout changes, workers, WASM, or native code before GPU compute. WebGPU compute is a candidate only for wide, regular batches such as bulk path queries or visibility/collision preprocessing.

## Browser-Independent Client Target

A fully browser-independent high-performance client should share the game protocol and cache decoders with the web client, but not the DOM:

1. **Core package split**
   - `client-core`: protocol, cache decoding, scene graph extraction, input actions, bot-state collection.
   - `client-web`: DOM canvas/WebGPU shell.
   - `client-native`: native window, WebGPU/wgpu renderer, audio, input, screenshots.

2. **Native runtime options**
   - Rust + `wgpu` + `winit` is the strongest fit if the goal is maximum client performance and no browser runtime.
   - Tauri can reuse TypeScript but still embeds a webview, so it is not the cleanest answer for avoiding browser bottlenecks.
   - Electron is the least attractive for this goal because it preserves Chromium overhead.

3. **Bot mode**
   - A native bot client can expose the same gateway protocol as the browser botclient.
   - Headless native mode should run renderless by default, with optional GPU frames for screenshots/debugging.
   - The SDK should be able to attach to either browser or native clients through the same gateway messages.

4. **Migration order**
   - Build render packets in TypeScript first, still rendered by the browser.
   - Add a WebGPU renderer consuming those packets.
   - Move packet generation and protocol handling into a shared core package.
   - Implement Rust/wgpu native shell consuming the same packet schema.

## Non-Goals

- Do not claim all CPU work is bad. Game simulation, scripting, and network packet routing remain CPU-owned unless profiling proves a GPU batch is faster end-to-end.
- Do not delete the canvas renderer until golden-frame parity and bot-client stability are proven.
- Do not make browser-only APIs part of the shared client core.
