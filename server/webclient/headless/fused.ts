// FUSED live pipeline: headless rs-sdk game-logic (bun, no browser) -> in-process
// FFI -> native wgpu renderer -> NVIDIA dma-buf -> PipeWire node ai.nymph.aurai.game.
//
// Loads the Rust cdylib (libwgpu_dmabuf_spike.so) via bun:ffi, runs the game
// loop, and each game frame packs gpuRenderPackets.snapshot() into the compact
// binary blob (typed arrays, NO JSON) and hands the pointer to the renderer.
//
// Env:
//   RS_HOST           game server (default host.docker.internal:8899)
//   AURAI_LIB         path to libwgpu_dmabuf_spike.so (default /tmp/libaurai.so)
//   RS_BOT / RS_PASS  bot login (default headlessbot / test)
//   FRAME_WIDTH/HEIGHT  dma-buf size (must match what publish negotiates; 1920x1080)
//   AURAI_FRAMES      stop after N submitted frames (0 = forever, default 0)
//   PW_FPS            PipeWire node nominal fps (default 30)
//   RS_TIMEOUT_MS     in-game wait timeout (default 90000)

import { dlopen, FFIType, ptr } from 'bun:ffi';
import { installDomStubs } from './dom-stubs.js';

installDomStubs();

process.env.ENABLE_BOT_SDK = process.env.ENABLE_BOT_SDK ?? 'true';
process.env.LOGIN_RSAE = process.env.LOGIN_RSAE ?? '58778699976184461502525193738213253649000149147835990136706041084440742975821';
process.env.LOGIN_RSAN = process.env.LOGIN_RSAN ?? '7162900525229798032761816791230527296329313291232324290237849263501208207972894053929065636522363163621000728841182238772712427862772219676577293600221789';
process.env.SECURE_ORIGIN = process.env.SECURE_ORIGIN ?? 'false';

const BOT = process.env.RS_BOT ?? 'headlessbot';
const PASS = process.env.RS_PASS ?? 'test';
const TIMEOUT_MS = Number(process.env.RS_TIMEOUT_MS ?? 90000);
const LIB = process.env.AURAI_LIB ?? '/tmp/libaurai.so';
const WIDTH = Number(process.env.FRAME_WIDTH ?? 1920);
const HEIGHT = Number(process.env.FRAME_HEIGHT ?? 1080);
const FRAME_LIMIT = Number(process.env.AURAI_FRAMES ?? 0);

function log(...a: unknown[]) {
    console.log('[fused]', ...a);
}

// --- load the cdylib ---
const lib = dlopen(LIB, {
    aurai_render_init: { args: [FFIType.u32, FFIType.u32], returns: FFIType.i32 },
    aurai_render_submit_frame: { args: [FFIType.ptr, FFIType.u64], returns: FFIType.i32 },
    aurai_render_frames_published: { args: [], returns: FFIType.u64 },
    aurai_render_last_render_us: { args: [], returns: FFIType.u64 },
    aurai_render_last_packets: { args: [], returns: FFIType.u64 },
    aurai_render_request_capture: { args: [FFIType.cstring], returns: FFIType.u64 },
    aurai_render_capture_done: { args: [], returns: FFIType.u64 },
    aurai_render_shutdown: { args: [], returns: FFIType.void }
});

// Request a GPU-side readback PNG and wait until it lands (the only correct
// proof path: the NVIDIA tiled dma-buf cannot be CPU-mmapped).
async function captureGpu(path: string, timeoutMs = 30000): Promise<boolean> {
    const cpath = Buffer.from(path + '\0');
    const before = lib.symbols.aurai_render_capture_done();
    lib.symbols.aurai_render_request_capture(ptr(cpath));
    const t0 = Date.now();
    while (lib.symbols.aurai_render_capture_done() <= before) {
        if (Date.now() - t0 > timeoutMs) return false;
        await Bun.sleep(20);
    }
    return true;
}

// --- blob packer ---------------------------------------------------------
// Mirrors src/blob.rs. All ints little-endian. alpha encoded as i32: -1 == null.
const MAGIC = 0x41555231;

// Packet tags must match blob.rs.
const T_SURFACE = 0, T_CLIP = 1, T_CLEAR = 2, T_FILLRECT = 3, T_LINE = 4,
    T_FILLCIRCLE = 5, T_SPRITE = 6, T_GLYPH = 7, T_TRIANGLE = 8;

function alphaI32(a: number | null | undefined): number {
    return (a === null || a === undefined) ? -1 : (a | 0);
}

// Growable little-endian byte writer.
class Writer {
    buf: Uint8Array;
    view: DataView;
    pos = 0;
    constructor(cap = 1 << 20) {
        this.buf = new Uint8Array(cap);
        this.view = new DataView(this.buf.buffer);
    }
    private ensure(n: number) {
        if (this.pos + n <= this.buf.length) return;
        let cap = this.buf.length * 2;
        while (cap < this.pos + n) cap *= 2;
        const nb = new Uint8Array(cap);
        nb.set(this.buf.subarray(0, this.pos));
        this.buf = nb;
        this.view = new DataView(this.buf.buffer);
    }
    u8(v: number) { this.ensure(1); this.view.setUint8(this.pos, v & 0xff); this.pos += 1; }
    u32(v: number) { this.ensure(4); this.view.setUint32(this.pos, v >>> 0, true); this.pos += 4; }
    i32(v: number) { this.ensure(4); this.view.setInt32(this.pos, v | 0, true); this.pos += 4; }
    bytes(src: Uint8Array) { this.ensure(src.length); this.buf.set(src, this.pos); this.pos += src.length; }
    slice(): Uint8Array { return this.buf.subarray(0, this.pos); }
}

// Track which resource ids we've already shipped to the renderer.
const sentSpriteIds = new Set<number>();
const sentGlyphIds = new Set<number>();

type PackResult = { blob: Uint8Array; nPackets: number; nTris: number; resources: boolean };

function packSnapshot(snap: any): PackResult {
    const surfaces = snap.surfaces as Array<{ id: number; width: number; height: number }>;
    const sprites = snap.spriteResources as Array<{ id: number; width: number; height: number; rgba: Uint8Array }>;
    const glyphs = snap.glyphResources as Array<{ id: number; width: number; height: number; maskRgba: Uint8Array }>;
    const packets = snap.packets as any[];

    // Resources are sent the first time any new id appears.
    const newSprites = sprites.filter(s => !sentSpriteIds.has(s.id));
    const newGlyphs = glyphs.filter(g => !sentGlyphIds.has(g.id));
    const sendResources = newSprites.length > 0 || newGlyphs.length > 0;

    const w = new Writer(1 << 22);
    w.u32(MAGIC);
    w.u32(WIDTH);
    w.u32(HEIGHT);
    w.u32(sendResources ? 1 : 0);
    w.u32(surfaces.length);
    w.u32(sendResources ? newSprites.length : 0);
    w.u32(sendResources ? newGlyphs.length : 0);
    const nPacketsPos = w.pos;
    w.u32(0); // n_packets, backpatched

    for (const s of surfaces) {
        w.i32(s.id); w.i32(s.width); w.i32(s.height);
    }

    if (sendResources) {
        for (const s of newSprites) {
            w.i32(s.id); w.i32(s.width); w.i32(s.height);
            w.u32(s.rgba.length); w.bytes(s.rgba);
            sentSpriteIds.add(s.id);
        }
        for (const g of newGlyphs) {
            w.i32(g.id); w.i32(g.width); w.i32(g.height);
            w.u32(g.maskRgba.length); w.bytes(g.maskRgba);
            sentGlyphIds.add(g.id);
        }
    }

    let nPackets = 0;
    let nTris = 0;
    for (const p of packets) {
        const surface = p.surface | 0;
        switch (p.kind) {
            case 'surface':
                w.u8(T_SURFACE); w.i32(surface); w.i32(p.width | 0); w.i32(p.height | 0);
                nPackets++; break;
            case 'clip':
                w.u8(T_CLIP); w.i32(surface);
                w.i32(p.clip.minX | 0); w.i32(p.clip.minY | 0); w.i32(p.clip.maxX | 0); w.i32(p.clip.maxY | 0);
                nPackets++; break;
            case 'clear':
                w.u8(T_CLEAR); w.i32(surface); nPackets++; break;
            case 'fillRect': {
                const fw = p.width | 0, fh = p.height | 0;
                // span-skip: drop per-scanline triangle spans.
                if (fw <= 2 || fh <= 2) break;
                w.u8(T_FILLRECT); w.i32(surface); w.i32(p.x | 0); w.i32(p.y | 0);
                w.i32(fw); w.i32(fh); w.u32(p.rgb >>> 0); w.i32(alphaI32(p.alpha));
                nPackets++; break;
            }
            case 'line':
                w.u8(T_LINE); w.i32(surface); w.i32(p.axis === 'h' ? 1 : 0);
                w.i32(p.x | 0); w.i32(p.y | 0); w.i32(p.length | 0);
                w.u32(p.rgb >>> 0); w.i32(alphaI32(p.alpha));
                nPackets++; break;
            case 'fillCircle':
                w.u8(T_FILLCIRCLE); w.i32(surface);
                w.i32(p.xCenter | 0); w.i32(p.yCenter | 0); w.i32(p.yRadius | 0);
                w.u32(p.rgb >>> 0); w.i32(alphaI32(p.alpha));
                nPackets++; break;
            case 'rgbaSprite':
            case 'indexedSprite':
            case 'transformSprite':
            case 'maskedSprite': {
                w.u8(T_SPRITE); w.i32(surface); w.i32((p.resource ?? -1) | 0);
                w.i32(p.x | 0); w.i32(p.y | 0); w.i32(p.width | 0); w.i32(p.height | 0);
                w.i32((p.srcX ?? 0) | 0); w.i32((p.srcY ?? 0) | 0);
                w.i32((p.srcWidth ?? p.width) | 0); w.i32((p.srcHeight ?? p.height) | 0);
                w.i32(alphaI32(p.alpha));
                if (p.clip) { w.i32(1); w.i32(p.clip.minX | 0); w.i32(p.clip.minY | 0); w.i32(p.clip.maxX | 0); w.i32(p.clip.maxY | 0); }
                else { w.i32(0); }
                nPackets++; break;
            }
            case 'glyphSprite': {
                w.u8(T_GLYPH); w.i32(surface); w.i32((p.resource ?? -1) | 0);
                w.i32(p.x | 0); w.i32(p.y | 0); w.i32(p.width | 0); w.i32(p.height | 0);
                w.i32((p.srcX ?? 0) | 0); w.i32((p.srcY ?? 0) | 0);
                w.u32((p.rgb ?? 0xffffff) >>> 0); w.i32(alphaI32(p.alpha));
                if (p.clip) { w.i32(1); w.i32(p.clip.minX | 0); w.i32(p.clip.minY | 0); w.i32(p.clip.maxX | 0); w.i32(p.clip.maxY | 0); }
                else { w.i32(0); }
                nPackets++; break;
            }
            case 'triangleGouraud':
            case 'triangleFlat':
            case 'triangleTexture': {
                let ca: number, cb: number, cc: number;
                if (p.kind === 'triangleGouraud') { ca = p.colourA >>> 0; cb = p.colourB >>> 0; cc = p.colourC >>> 0; }
                else if (p.kind === 'triangleFlat') { ca = cb = cc = p.colour >>> 0; }
                else { ca = cb = cc = (p.shadeA >>> 0); }
                w.u8(T_TRIANGLE); w.i32(surface);
                w.i32(p.xA | 0); w.i32(p.yA | 0); w.i32(p.xB | 0); w.i32(p.yB | 0); w.i32(p.xC | 0); w.i32(p.yC | 0);
                w.u32(ca); w.u32(cb); w.u32(cc); w.i32(alphaI32(p.alpha));
                nPackets++; nTris++; break;
            }
            default:
                break; // unsupported / modelFlatTriangle -> skipped
        }
    }
    // backpatch n_packets
    w.view.setUint32(nPacketsPos, nPackets >>> 0, true);
    return { blob: w.slice(), nPackets, nTris, resources: sendResources };
}

async function main() {
    log('init renderer cdylib', LIB, `${WIDTH}x${HEIGHT}`);
    const rc = lib.symbols.aurai_render_init(WIDTH, HEIGHT);
    if (rc !== 0) {
        log('FATAL aurai_render_init returned', rc);
        process.exit(2);
    }
    log('renderer init OK; PipeWire node should be live now');

    log('importing client modules…');
    const { Client } = await import('#/client/Client.js');
    const { gpuRenderPackets } = await import('#/graphics/GpuRenderPackets.js');
    gpuRenderPackets.setEnabled(true);
    gpuRenderPackets.setSkipCpuRasterWrites(true);

    log('constructing Client…');
    const client: any = new Client(10, false, true);
    (globalThis as any).gameClient = client;

    const t0 = Date.now();
    while ((client.lastProgressPercent ?? 0) < 100) {
        if (Date.now() - t0 > TIMEOUT_MS) { log('TIMEOUT loading'); break; }
        await Bun.sleep(150);
    }
    log('load done', client.lastProgressPercent);

    if (typeof client.autoLogin === 'function') {
        log('autoLogin as', BOT);
        try { await client.autoLogin(BOT, PASS); } catch (e) { log('autoLogin threw', (e as Error)?.message); }
    }
    const tLogin = Date.now();
    while (!client.ingame) {
        if (Date.now() - tLogin > TIMEOUT_MS) { log('TIMEOUT waiting ingame'); break; }
        await Bun.sleep(150);
    }
    log('ingame =', client.ingame);

    // --- live frame loop ---
    let frame = 0;
    let packTotalUs = 0;
    let submitTotalUs = 0;
    let snapTotalUs = 0;
    const loopT0 = Date.now();
    let lastReport = Date.now();
    let lastReportFrame = 0;

    // Time-based GPU-readback captures (seconds after ingame) for live proof.
    const CAP_T0_S = Number(process.env.AURAI_CAP_T0_S ?? 3);
    const CAP_T1_S = Number(process.env.AURAI_CAP_T1_S ?? 9);
    const CAP_T0_PATH = process.env.AURAI_CAP_T0_PATH ?? '/tmp/live_t0.png';
    const CAP_T1_PATH = process.env.AURAI_CAP_T1_PATH ?? '/tmp/live_t1.png';
    let didCap0 = false, didCap1 = false;

    // The game's mainredraw bumps Client.drawCycle once per produced frame. Only
    // snapshot + submit when a NEW redraw happened, so we never re-pack/re-submit
    // an identical frame and we hand the JS thread back to the game loop as fast
    // as possible. The PipeWire node still publishes at PW_FPS (it redraws the
    // last submitted frame when the game hasn't produced a new one), so OBS sees
    // a smooth nominal-fps stream while content refreshes at the real game rate.
    const ClientClass: any = (client as any).constructor;
    let lastDrawCycle = -1;

    while (FRAME_LIMIT === 0 || frame < FRAME_LIMIT) {
        // Wait for the game to produce a new redraw before doing GPU work.
        const dc = ClientClass?.drawCycle ?? frame;
        if (dc === lastDrawCycle) {
            await Bun.sleep(0);
            // Still service time-based captures while idling between frames.
            const elapsedIdleS = (Date.now() - loopT0) / 1000;
            if (!didCap0 && elapsedIdleS >= CAP_T0_S) {
                didCap0 = true;
                const ok = await captureGpu(CAP_T0_PATH);
                log(`capture t0 (${elapsedIdleS.toFixed(1)}s) -> ${CAP_T0_PATH} ok=${ok}`);
            }
            if (!didCap1 && elapsedIdleS >= CAP_T1_S) {
                didCap1 = true;
                const ok = await captureGpu(CAP_T1_PATH);
                log(`capture t1 (${elapsedIdleS.toFixed(1)}s) -> ${CAP_T1_PATH} ok=${ok}`);
            }
            continue;
        }
        lastDrawCycle = dc;

        const tSnap = performance.now();
        const snap = gpuRenderPackets.snapshot();
        const tPack = performance.now();
        const { blob, nPackets, nTris, resources } = packSnapshot(snap);
        const tSubmit = performance.now();
        const rcs = lib.symbols.aurai_render_submit_frame(ptr(blob), BigInt(blob.length));
        const tEnd = performance.now();
        if (rcs !== 0) log('submit_frame rc', rcs);

        // Fresh packet list for the next frame.
        gpuRenderPackets.reset();

        snapTotalUs += (tPack - tSnap) * 1000;
        packTotalUs += (tSubmit - tPack) * 1000;
        submitTotalUs += (tEnd - tSubmit) * 1000;
        frame++;

        if (frame === 1) {
            log(`frame 0: packets=${nPackets} tris=${nTris} resources=${resources} blobBytes=${blob.length}`);
        }
        const now = Date.now();
        if (now - lastReport >= 2000) {
            const df = frame - lastReportFrame;
            const fps = (df * 1000) / (now - lastReport);
            const published = lib.symbols.aurai_render_frames_published();
            const rUs = lib.symbols.aurai_render_last_render_us();
            const rPkts = lib.symbols.aurai_render_last_packets();
            log(`frame ${frame} gameFps=${fps.toFixed(1)} packets=${nPackets} tris=${nTris} ` +
                `snap=${(snapTotalUs / frame / 1000).toFixed(2)}ms pack=${(packTotalUs / frame / 1000).toFixed(2)}ms ` +
                `submit=${(submitTotalUs / frame / 1000).toFixed(3)}ms | gpuRenderLast=${(Number(rUs) / 1000).toFixed(2)}ms ` +
                `gpuPublished=${published} gpuLastPkts=${rPkts}`);
            lastReport = now;
            lastReportFrame = frame;
        }

        const elapsedS = (Date.now() - loopT0) / 1000;
        if (!didCap0 && elapsedS >= CAP_T0_S) {
            didCap0 = true;
            const ok = await captureGpu(CAP_T0_PATH);
            log(`capture t0 (${elapsedS.toFixed(1)}s) -> ${CAP_T0_PATH} ok=${ok}`);
        }
        if (!didCap1 && elapsedS >= CAP_T1_S) {
            didCap1 = true;
            const ok = await captureGpu(CAP_T1_PATH);
            log(`capture t1 (${elapsedS.toFixed(1)}s) -> ${CAP_T1_PATH} ok=${ok}`);
        }

        // Yield so the game's own loop (websocket ticks etc.) can run.
        await Bun.sleep(0);
    }

    const elapsed = (Date.now() - loopT0) / 1000;
    log(`DONE frames=${frame} elapsed=${elapsed.toFixed(1)}s avgGameFps=${(frame / elapsed).toFixed(1)} ` +
        `avgSnap=${(snapTotalUs / frame / 1000).toFixed(2)}ms avgPack=${(packTotalUs / frame / 1000).toFixed(2)}ms ` +
        `avgSubmit=${(submitTotalUs / frame / 1000).toFixed(3)}ms gpuPublished=${lib.symbols.aurai_render_frames_published()}`);
    lib.symbols.aurai_render_shutdown();
    process.exit(0);
}

main().catch(e => { console.error('[fused] FATAL', e); process.exit(1); });
