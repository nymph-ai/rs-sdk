# GPU Acceleration And Native Client Plan

This fork treats the current browser client as the compatibility path and introduces GPU work in stages. The existing client is a TypeScript refactor of the 2004-era software renderer: scene traversal, model transforms, triangle rasterization, texture sampling, sprite blending, font drawing, and final canvas upload are all CPU-side.

## Current Branch Scope

The first implementation slice adds a feature-detected WebGPU presentation backend:

- `server/webclient/src/graphics/WebGpuFramePresenter.ts`
- `server/webclient/src/graphics/Canvas.ts`
- `server/webclient/src/graphics/PixMap.ts`

When the WebGPU renderer is selected, `PixMap.draw()` uploads each prepared `ImageData` region into a GPU texture and presents it through a full-screen WGSL shader. WebGPU startup and presentation failures are treated as renderer bugs, not automatic CPU renderer recoveries. The 2D canvas renderer remains available only as an explicit mode:

```text
?renderer=canvas
```

or:

```js
localStorage.setItem('rs-sdk.renderer', 'canvas')
```

This does not yet make the client "fully GPU rendered." It removes the browser 2D canvas `putImageData` presentation path from the hot path when WebGPU is available, but the software rasterizer still produces the source pixels on the CPU.

## CPU Oracle Validation

The WebGPU presentation path has an opt-in readback validator. It copies sampled GPU texture regions back into a mapped buffer and compares them byte-for-byte against the classical CPU renderer's `ImageData`.

Enable validation in the live client with:

```text
?rendererValidation=1
```

Runtime stats are exposed at:

```js
window.__rsSdkRendererStats
```

There is also a standalone deterministic validation page:

```sh
cd server/webclient
bun run serve:renderer-validation
```

Then open:

```text
http://localhost:8890/
```

This page exercises full-frame uploads, offset uploads, negative-origin clipping, and right/bottom clipping against the CPU canvas oracle. It reports final status through:

```js
window.__rsSdkRendererValidation
```

## Render Packet Boundary

The branch also records the current software renderer's draw intent behind an opt-in packet stream. This is the handoff format for replacing CPU `Pix2D` primitives and `Pix3D` triangle scan conversion with WebGPU render passes while the CPU renderer remains available as the oracle.

Enable packet capture with:

```text
?rendererPackets=1
```

or:

```js
localStorage.setItem('rs-sdk.rendererPackets', '1')
```

Captured packets and counters are exposed at:

```js
window.__rsSdkGpuRenderPackets
```

The stream currently covers surface targets, clipping, clears, filled rectangles, alpha rectangles, horizontal/vertical lines, filled circles, flat triangles, Gouraud triangles, and textured triangles. When packet capture is disabled, hot-path hooks return before allocating packet objects.

An experimental packet replay backend can be enabled with:

```text
?rendererPacketReplay=1
```

or:

```js
localStorage.setItem('rs-sdk.rendererPacketReplay', '1')
```

Packet replay currently consumes 2D clears, opaque and alpha filled rectangles, opaque and alpha horizontal/vertical lines, filled circles, Pix8/Pix32 opaque sprites, and opaque font glyphs. It rasterizes those packets into the WebGPU frame texture. In replay mode, `PixMap.draw()` presents directly from packets and does not prepare or upload the CPU `ImageData` framebuffer. The existing CPU renderer remains the oracle for validation only. Unsupported packets, dropped packets, packet stream resets, or packet/image surface mismatches are hard replay failures to fix, not CPU renderer recovery paths. Replay counters and failures are exposed at:

```js
window.__rsSdkRendererStats.packetReplay
```

The standalone validation page asserts `packetReplay.cpuImageDataUploads === 0` for the packet replay case.

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
