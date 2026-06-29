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
//   AURAI_DUMP_BLOB_DIR optional .aur2 packet dump directory (renderer can be disabled)
//   AURAI_DUMP_BLOB_START first submitted frame index to dump (default 0)
//   AURAI_DUMP_BLOB_LIMIT max dumped frames (0 = unlimited, default 0)
//   AURAI_PACKET_DUMP_DIR legacy alias for AURAI_DUMP_BLOB_DIR
//   PW_FPS            PipeWire node nominal fps (default 30)
//   RS_TIMEOUT_MS     in-game wait timeout (default 90000)

import { dlopen, FFIType, ptr } from 'bun:ffi';
import { mkdir } from 'node:fs/promises';
import { installDomStubs } from './dom-stubs.js';

installDomStubs();

process.env.ENABLE_BOT_SDK = process.env.ENABLE_BOT_SDK ?? 'false';
process.env.LOGIN_RSAE = process.env.LOGIN_RSAE ?? '58778699976184461502525193738213253649000149147835990136706041084440742975821';
process.env.LOGIN_RSAN = process.env.LOGIN_RSAN ?? '7162900525229798032761816791230527296329313291232324290237849263501208207972894053929065636522363163621000728841182238772712427862772219676577293600221789';
process.env.SECURE_ORIGIN = process.env.SECURE_ORIGIN ?? 'false';
// Exact translucent Gouraud emulation is still available for offline parity
// runs, but the current fixed-slot path is not live-safe on dense scenes.
process.env.AURAI_EXACT_GOURAUD_ALPHA = process.env.AURAI_EXACT_GOURAUD_ALPHA ?? 'false';
// Let the native renderer replay stable retained UI surfaces. The headless
// client still sends warmup frames and fresh surface updates, but it should not
// source-replay unchanged UI packets forever.
process.env.AURAI_NATIVE_RETAINED_PRESENT_ONLY =
    process.env.AURAI_NATIVE_RETAINED_PRESENT_ONLY ?? 'true';
// Keep the native C API in the same retained-surface mode as this packer.
// Without these, Bun can send present-only UI surfaces while the renderer never
// feeds its retained UI draw/slot cache, forcing per-frame command rebuilds.
process.env.AURAI_RETAINED_SURFACE_DELTAS =
    process.env.AURAI_RETAINED_SURFACE_DELTAS ?? process.env.AURAI_PACK_RETAINED_SURFACE_DELTAS ?? 'true';
process.env.AURAI_RETAINED_SURFACE_DRAW_CACHE =
    process.env.AURAI_RETAINED_SURFACE_DRAW_CACHE ?? 'true';

const BOT = process.env.RS_BOT ?? 'headlessbot';
const PASS = process.env.RS_PASS ?? 'test';
const TIMEOUT_MS = Number(process.env.RS_TIMEOUT_MS ?? 90000);
const LIB = process.env.AURAI_LIB ?? '/tmp/libaurai.so';
const WIDTH = Number(process.env.FRAME_WIDTH ?? 1920);
const HEIGHT = Number(process.env.FRAME_HEIGHT ?? 1080);
const FRAME_LIMIT = Number(process.env.AURAI_FRAMES ?? 0);
const STATS_EVERY_MS = Number(process.env.AURAI_STATS_EVERY_MS ?? 2000);
const PUBLISH_STALL_MS = Number(process.env.AURAI_PUBLISH_STALL_MS ?? 10000);
const WAIT_PIPEWIRE_READY = envEnabled(process.env.AURAI_WAIT_PIPEWIRE_READY, true);
const PIPEWIRE_READY_TIMEOUT_MS = Number(process.env.AURAI_PIPEWIRE_READY_TIMEOUT_MS ?? 15000);
const MIN_FIRST_FRAME_PACKETS = Math.max(
    0,
    Number(process.env.AURAI_MIN_FIRST_FRAME_PACKETS ?? (WAIT_PIPEWIRE_READY ? 1024 : 0)) || 0
);
const FORCE_FULL_UI_REDRAW = (process.env.AURAI_FORCE_FULL_UI_REDRAW ?? 'false') !== 'false';
const FORCE_FULL_UI_REDRAW_WARMUP_FRAMES = Math.max(
    0,
    Number(process.env.AURAI_FORCE_FULL_UI_REDRAW_WARMUP_FRAMES ?? (FORCE_FULL_UI_REDRAW ? 0 : 12)) || 0
);
const SKIP_CPU_RASTER_WRITES = (process.env.AURAI_SKIP_CPU_RASTER_WRITES ?? 'true') !== 'false';
const MODEL_GOURAUD_PACKETS = envEnabled(process.env.AURAI_MODEL_GOURAUD_PACKETS, false);
// NYM-210: emit a GPU scene description (geometry cached by id + per-frame
// instances/camera) instead of pre-projected triangles; CPU skips projection.
const SCENE_INSTANCE_MODE = envEnabled(process.env.AURAI_SCENE_INSTANCE_MODE, false);
const PACKET_DUMP_DIR = process.env.AURAI_DUMP_BLOB_DIR ?? process.env.AURAI_PACKET_DUMP_DIR ?? '';
const PACKET_DUMP_START = Math.max(0, Number(process.env.AURAI_DUMP_BLOB_START ?? 0) || 0);
const PACKET_DUMP_LIMIT = Math.max(0, Number(process.env.AURAI_DUMP_BLOB_LIMIT ?? 0) || 0);
const CPU_REF_PPM = process.env.AURAI_CPU_REF_PPM ?? '';
const CPU_REF_FRAME = Number(process.env.AURAI_CPU_REF_FRAME ?? 5);
const INIT_RENDERER = (process.env.AURAI_INIT_RENDERER ?? 'true') !== 'false';
const INIT_RENDERER_AFTER_INGAME = (process.env.AURAI_INIT_RENDERER_AFTER_INGAME ?? 'false') === 'true';
const GAME_LOGIC_FPS = Number(process.env.AURAI_GAME_LOGIC_FPS ?? 50);
const TARGET_REDRAW_FPS = Number(process.env.AURAI_TARGET_REDRAW_FPS ?? process.env.PW_FPS ?? 30);
const TARGET_SUBMIT_INTERVAL_MS = Number.isFinite(TARGET_REDRAW_FPS) && TARGET_REDRAW_FPS > 0 ? 1000 / TARGET_REDRAW_FPS : 33.333;
const MAX_PACKET_BACKLOG_BEFORE_SUBMIT = Number(process.env.AURAI_MAX_PACKET_BACKLOG_BEFORE_SUBMIT ?? 20000);
const MAX_PACK_INPUT_PACKETS = Number(process.env.AURAI_MAX_PACK_INPUT_PACKETS ?? process.env.AURAI_LIVE_PACKET_LIMIT ?? 100000);
const RETAINED_SURFACE_DELTA_MAX_PACKETS = Math.max(
    0,
    Number(process.env.AURAI_RETAINED_SURFACE_DELTA_MAX_PACKETS ?? 2048) || 0
);
const PACK_RETAINED_SURFACE_DELTAS = envEnabled(
    process.env.AURAI_PACK_RETAINED_SURFACE_DELTAS ?? process.env.AURAI_RETAINED_SURFACE_DELTAS,
    true
);
const RETAINED_SURFACE_DEBUG = envEnabled(process.env.AURAI_RETAINED_SURFACE_DEBUG, false);
const PACK_RETAINED_WORLD_PACKET_REFS = envEnabled(
    process.env.AURAI_RETAINED_WORLD_PACKET_REFS,
    true
);
const RETAINED_WORLD_PACKET_MAX_CACHE = Math.max(
    0,
    Number(process.env.AURAI_RETAINED_WORLD_PACKET_MAX_CACHE ?? 131072) || 0
);
const RETAINED_WORLD_PACKET_TARGET_CACHE = Math.max(
    0,
    Number(process.env.AURAI_RETAINED_WORLD_PACKET_TARGET_CACHE ?? Math.min(RETAINED_WORLD_PACKET_MAX_CACHE || 65536, 65536)) || 0
);
const RETAINED_WORLD_PACKET_STALE_FRAMES = Math.max(
    1,
    Number(process.env.AURAI_RETAINED_WORLD_PACKET_STALE_FRAMES ?? 120) || 0
);
const RETAINED_WORLD_PACKET_EVICT_BUDGET = Math.max(
    0,
    Number(process.env.AURAI_RETAINED_WORLD_PACKET_EVICT_BUDGET ?? 2048) || 0
);

function envEnabled(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) return fallback;
    const normalized = value.trim().toLowerCase();
    if (normalized === '' || normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no') {
        return false;
    }
    return true;
}

function log(...a: unknown[]) {
    console.log('[fused]', ...a);
}

function forceFullUiRedraw(client: any, force = false): void {
    if ((!FORCE_FULL_UI_REDRAW && !force) || !client?.ingame) return;
    client.redrawFrame = true;
    client.redrawSide = true;
    client.redrawChat = true;
    client.redrawIcons = true;
    client.redrawChatMode = true;
}

function configureHeadlessTiming(client: any): void {
    if (Number.isFinite(GAME_LOGIC_FPS) && GAME_LOGIC_FPS > 0 && typeof client.setFramerate === 'function') {
        client.setFramerate(GAME_LOGIC_FPS);
    }
    if (Number.isFinite(TARGET_REDRAW_FPS) && TARGET_REDRAW_FPS > 0 && typeof client.setTargetedFramerate === 'function') {
        client.setTargetedFramerate(TARGET_REDRAW_FPS);
    }
    log(`timing logicFps=${GAME_LOGIC_FPS} targetRedrawFps=${TARGET_REDRAW_FPS} fullUiRedraw=${FORCE_FULL_UI_REDRAW} warmupUiFrames=${FORCE_FULL_UI_REDRAW_WARMUP_FRAMES}`);
}

function initRenderer(label: string): void {
    if (!INIT_RENDERER) {
        log('renderer init skipped; CPU reference mode');
        return;
    }

    log(`init renderer cdylib (${label})`, LIB, `${WIDTH}x${HEIGHT}`);
    const rc = lib.symbols.aurai_render_init(WIDTH, HEIGHT);
    if (rc !== 0) {
        log('FATAL aurai_render_init returned', rc);
        process.exit(2);
    }
    log('renderer init OK; PipeWire node should be live now');
}

async function dumpHeadlessCanvasPpm(path: string): Promise<boolean> {
    const frame = (globalThis as any).__rsSdkHeadlessCanvas as { width: number; height: number; data: Uint8ClampedArray } | undefined;
    if (!frame?.data?.length || frame.width <= 0 || frame.height <= 0) return false;

    const header = new TextEncoder().encode(`P6\n${frame.width} ${frame.height}\n255\n`);
    const rgb = new Uint8Array(frame.width * frame.height * 3);
    for (let src = 0, dst = 0; src < frame.data.length; src += 4, dst += 3) {
        rgb[dst] = frame.data[src];
        rgb[dst + 1] = frame.data[src + 1];
        rgb[dst + 2] = frame.data[src + 2];
    }
    const out = new Uint8Array(header.length + rgb.length);
    out.set(header, 0);
    out.set(rgb, header.length);
    await Bun.write(path, out);
    return true;
}

// --- load the cdylib ---
const lib = dlopen(LIB, {
    aurai_render_init: { args: [FFIType.u32, FFIType.u32], returns: FFIType.i32 },
    aurai_render_submit_frame: { args: [FFIType.ptr, FFIType.u64], returns: FFIType.i32 },
    aurai_render_frames_published: { args: [], returns: FFIType.u64 },
    aurai_render_pipewire_slots: { args: [], returns: FFIType.u64 },
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

async function waitForPipewireReady(client: any, gpuRenderPackets: any): Promise<boolean> {
    if (!INIT_RENDERER || !WAIT_PIPEWIRE_READY) {
        return true;
    }

    const start = Date.now();
    let lastLog = 0;
    let droppedPackets = 0;
    while (true) {
        const slots = Number(lib.symbols.aurai_render_pipewire_slots());
        if (slots > 0) {
            gpuRenderPackets.reset();
            forceFullUiRedraw(client, true);
            log(`PipeWire ready slots=${slots} droppedPreReadyPackets=${droppedPackets}`);
            return true;
        }

        const backlog = Array.isArray(gpuRenderPackets.packets) ? gpuRenderPackets.packets.length : 0;
        if (backlog > 0) {
            droppedPackets += backlog;
            gpuRenderPackets.reset();
        }
        forceFullUiRedraw(client, true);

        const now = Date.now();
        const elapsed = now - start;
        if (PIPEWIRE_READY_TIMEOUT_MS > 0 && elapsed >= PIPEWIRE_READY_TIMEOUT_MS) {
            log(`PipeWire readiness timeout after ${elapsed}ms; slots=0 droppedPreReadyPackets=${droppedPackets}`);
            return false;
        }
        if (now - lastLog >= 1000) {
            log(`waiting for PipeWire consumer slots elapsed=${elapsed}ms droppedPreReadyPackets=${droppedPackets}`);
            lastLog = now;
        }
        await Bun.sleep(50);
    }
}

// --- blob packer ---------------------------------------------------------
// Mirrors src/blob.rs. All ints little-endian. alpha encoded as i32: -1 == null.
const MAGIC = 0x41555232;

// Packet tags must match blob.rs.
const T_SURFACE = 0, T_CLIP = 1, T_CLEAR = 2, T_FILLRECT = 3, T_LINE = 4,
    T_FILLCIRCLE = 5, T_RGBA_SPRITE = 6, T_GLYPH = 7, T_TRIANGLE = 8,
    T_INDEXED_SPRITE = 9, T_TRANSFORM_SPRITE = 10, T_MASKED_SPRITE = 11,
    T_TEXTURE_TRIANGLE = 12, T_MODEL_FLAT_TRIANGLE = 13, T_PRESENT_SURFACE = 14,
    T_RETAINED_PACKET_REF = 15, T_RETAINED_PACKET_SET = 16, T_RETAINED_PACKET_CACHE_CLEAR = 17,
    T_RETAINED_PACKET_EVICT = 18, T_RETAINED_PACKET_REF_RUN = 19,
    T_MODEL_GOURAUD_TRIANGLE = 20,
    // NYM-210 GPU-native scene renderer
    T_MODEL_GEOMETRY_UPLOAD = 21, T_MODEL_SKELETON_UPLOAD = 22, T_MODEL_LABELMAP_UPLOAD = 23,
    T_MODEL_ANIM_FRAME_UPLOAD = 24, T_SCENE_INSTANCE = 25, T_SCENE_CAMERA = 26, T_SCENE_LIGHT = 27,
    T_MODEL_GEOMETRY_UPLOAD_TEXTURED = 30;

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
    f32(v: number) { this.ensure(4); this.view.setFloat32(this.pos, Number(v) || 0, true); this.pos += 4; }
    bytes(src: Uint8Array) { this.ensure(src.length); this.buf.set(src, this.pos); this.pos += src.length; }
    bytesWithLen(src: Uint8Array) { this.u32(src.length); this.bytes(src); }
    slice(): Uint8Array { return this.buf.subarray(0, this.pos); }
}

// Track resource versions already shipped to the renderer.
const sentSpriteVersions = new Map<number, number>();
const sentGlyphVersions = new Map<number, number>();
const sentTextureVersions = new Map<number, number>();
const sentIndexedSpriteVersions = new Map<number, number>();
let sentColourTableVersion: number | null = null;

function resetSentResources(): void {
    sentSpriteVersions.clear();
    sentGlyphVersions.clear();
    sentTextureVersions.clear();
    sentIndexedSpriteVersions.clear();
    sentColourTableVersion = null;
}

type PackResult = {
    blob: Uint8Array;
    inputPackets: number;
    nPackets: number;
    nTris: number;
    nTextureTris: number;
    nModelFlat: number;
    nModelGouraud: number;
    nCpuSpanRects: number;
    nSkippedNonGpuTris: number;
    retainedDeltaSurfaces: number;
    retainedDeltaPacketsSkipped: number;
    retainedCacheableSurfaces: number;
    retainedHashSkippedSurfaces: number;
    retainedHashSkippedPackets: number;
    retainedWorldRefs: number;
    retainedWorldRefRuns: number;
    retainedWorldSets: number;
    retainedWorldClears: number;
    retainedWorldEvicts: number;
    retainedWorldCacheSize: number;
    resources: boolean;
    commitResources: () => void;
};

function resourceChanged(item: { id: number; version: number }, sent: Map<number, number>): boolean {
    return sent.get(item.id) !== item.version;
}

function markResource(item: { id: number; version: number }, sent: Map<number, number>): void {
    sent.set(item.id, item.version);
}

function writeClip(w: Writer, clip: any | null | undefined): void {
    if (!clip) {
        w.i32(0);
        return;
    }
    w.i32(1);
    w.i32(clip.minX | 0);
    w.i32(clip.minY | 0);
    w.i32(clip.maxX | 0);
    w.i32(clip.maxY | 0);
}

function indexedMode(mode: string | undefined): number {
    if (mode === 'titleFlameLeft') return 1;
    if (mode === 'titleFlameRight') return 2;
    return 0;
}

type RetainedSurfaceSignature = {
    len: number;
    hashA: number;
    hashB: number;
    cacheable: boolean;
    present: boolean;
};

type RetainedDeltaResult = {
    packets: any[];
    inputPackets: number;
    deltaSurfaces: number;
    packetsSkipped: number;
    cacheableSurfaces: number;
    hashSkippedSurfaces: number;
    hashSkippedPackets: number;
};

const retainedSurfaceSignatures = new Map<number, RetainedSurfaceSignature>();
let retainedSurfaceDebugFrame = 0;
type RetainedWorldPacketEntry = {
    id: number;
    lastSeenFrame: number;
};
type RetainedWorldPacketWrite =
    | { kind: 'none' }
    | { kind: 'set'; flushedPackets: number }
    | { kind: 'ref'; id: number };
type RetainedWorldRefRun = {
    startId: number;
    nextId: number;
    count: number;
};

const retainedWorldPacketIds = new Map<string, RetainedWorldPacketEntry>();
let retainedWorldPacketFrame = 0;
let nextRetainedWorldPacketId = 1;
const floatBits = new DataView(new ArrayBuffer(4));

function mix32(hash: number, value: number): number {
    hash ^= value >>> 0;
    return Math.imul(hash, 0x01000193) >>> 0;
}

function mixSignature(sig: RetainedSurfaceSignature, value: number): void {
    const word = value >>> 0;
    sig.hashA = mix32(sig.hashA, word);
    sig.hashB = mix32(sig.hashB, (word ^ 0x9e3779b9 ^ (word >>> 16)) >>> 0);
}

function mixBool(sig: RetainedSurfaceSignature, value: unknown): void {
    mixSignature(sig, value ? 1 : 0);
}

function mixI32(sig: RetainedSurfaceSignature, value: unknown): void {
    mixSignature(sig, Number(value) | 0);
}

function mixU32(sig: RetainedSurfaceSignature, value: unknown): void {
    mixSignature(sig, Number(value) >>> 0);
}

function mixF32(sig: RetainedSurfaceSignature, value: unknown): void {
    floatBits.setFloat32(0, Number(value) || 0, true);
    mixSignature(sig, floatBits.getUint32(0, true));
}

function mixAlpha(sig: RetainedSurfaceSignature, value: unknown): void {
    mixI32(sig, value === null || value === undefined ? -1 : value);
}

function mixClip(sig: RetainedSurfaceSignature, clip: any | null | undefined): void {
    if (!clip) {
        mixI32(sig, 0);
        return;
    }
    mixI32(sig, 1);
    mixI32(sig, clip.minX);
    mixI32(sig, clip.minY);
    mixI32(sig, clip.maxX);
    mixI32(sig, clip.maxY);
}

function retainedPacketKindTag(kind: string): number {
    switch (kind) {
        case 'surface': return T_SURFACE;
        case 'clip': return T_CLIP;
        case 'clear': return T_CLEAR;
        case 'fillRect': return T_FILLRECT;
        case 'line': return T_LINE;
        case 'fillCircle': return T_FILLCIRCLE;
        case 'rgbaSprite': return T_RGBA_SPRITE;
        case 'glyphSprite': return T_GLYPH;
        case 'triangleFlat': return T_TRIANGLE;
        case 'triangleGouraud': return T_TRIANGLE + 100;
        case 'indexedSprite': return T_INDEXED_SPRITE;
        case 'transformSprite': return T_TRANSFORM_SPRITE;
        case 'maskedSprite': return T_MASKED_SPRITE;
        case 'triangleTexture': return T_TEXTURE_TRIANGLE;
        case 'modelFlatTriangle': return T_MODEL_FLAT_TRIANGLE;
        case 'modelGouraudTriangle': return T_MODEL_GOURAUD_TRIANGLE;
        default: return -1;
    }
}

function hashRetainedPacket(sig: RetainedSurfaceSignature, p: any): boolean {
    const tag = retainedPacketKindTag(p.kind);
    if (tag < 0) return false;
    mixI32(sig, tag);
    mixI32(sig, p.surface);

    switch (p.kind) {
        case 'surface':
            mixI32(sig, p.width); mixI32(sig, p.height);
            return true;
        case 'clip':
            mixClip(sig, p.clip);
            return true;
        case 'clear':
            return true;
        case 'fillRect':
            mixI32(sig, p.x); mixI32(sig, p.y); mixI32(sig, p.width); mixI32(sig, p.height);
            mixU32(sig, p.rgb); mixAlpha(sig, p.alpha);
            return true;
        case 'line':
            mixI32(sig, p.axis === 'h' ? 1 : 0);
            mixI32(sig, p.x); mixI32(sig, p.y); mixI32(sig, p.length);
            mixU32(sig, p.rgb); mixAlpha(sig, p.alpha);
            return true;
        case 'fillCircle':
            mixI32(sig, p.xCenter); mixI32(sig, p.yCenter); mixI32(sig, p.yRadius);
            mixU32(sig, p.rgb); mixAlpha(sig, p.alpha);
            return true;
        case 'rgbaSprite':
            mixI32(sig, p.resource ?? -1);
            mixI32(sig, p.x); mixI32(sig, p.y); mixI32(sig, p.width); mixI32(sig, p.height);
            mixF32(sig, p.srcX ?? 0); mixF32(sig, p.srcY ?? 0);
            mixF32(sig, p.srcWidth ?? p.width); mixF32(sig, p.srcHeight ?? p.height);
            mixAlpha(sig, p.alpha); mixClip(sig, p.clip);
            return true;
        case 'indexedSprite':
            mixI32(sig, p.resource ?? -1);
            mixI32(sig, p.x); mixI32(sig, p.y); mixI32(sig, p.width); mixI32(sig, p.height);
            mixI32(sig, p.srcX ?? 0); mixI32(sig, p.srcY ?? 0); mixI32(sig, indexedMode(p.mode));
            mixClip(sig, p.clip);
            return true;
        case 'transformSprite':
            mixI32(sig, p.resource ?? -1);
            mixI32(sig, p.x); mixI32(sig, p.y); mixI32(sig, p.width); mixI32(sig, p.height);
            mixI32(sig, p.startX); mixI32(sig, p.startY); mixI32(sig, p.stepX); mixI32(sig, p.stepY);
            mixI32(sig, p.rowStepX); mixI32(sig, p.rowStepY); mixI32(sig, p.sourceStride);
            mixBool(sig, p.transparentZero); mixClip(sig, p.clip);
            return true;
        case 'maskedSprite':
            mixI32(sig, p.resource ?? -1); mixI32(sig, p.maskResource ?? -1);
            mixI32(sig, p.x); mixI32(sig, p.y); mixI32(sig, p.width); mixI32(sig, p.height);
            mixI32(sig, p.srcX ?? 0); mixI32(sig, p.srcY ?? 0); mixI32(sig, p.maskStride ?? 0);
            mixClip(sig, p.clip);
            return true;
        case 'glyphSprite':
            mixI32(sig, p.resource ?? -1);
            mixI32(sig, p.x); mixI32(sig, p.y); mixI32(sig, p.width); mixI32(sig, p.height);
            mixI32(sig, p.srcX ?? 0); mixI32(sig, p.srcY ?? 0);
            mixU32(sig, p.rgb ?? 0xffffff); mixAlpha(sig, p.alpha); mixClip(sig, p.clip);
            return true;
        case 'triangleFlat':
        case 'triangleGouraud': {
            const isGouraud = p.kind === 'triangleGouraud';
            mixBool(sig, p.gpuRasterize === true);
            mixI32(sig, p.xA); mixI32(sig, p.yA); mixI32(sig, p.xB); mixI32(sig, p.yB); mixI32(sig, p.xC); mixI32(sig, p.yC);
            mixU32(sig, isGouraud ? p.colourA : p.colour);
            mixU32(sig, isGouraud ? p.colourB : p.colour);
            mixU32(sig, isGouraud ? p.colourC : p.colour);
            mixAlpha(sig, p.alpha); mixBool(sig, p.lowDetail); mixBool(sig, p.hclip); mixClip(sig, p.clip);
            return true;
        }
        case 'triangleTexture':
            mixBool(sig, p.gpuRasterize === true);
            mixI32(sig, p.xA); mixI32(sig, p.yA); mixI32(sig, p.xB); mixI32(sig, p.yB); mixI32(sig, p.xC); mixI32(sig, p.yC);
            mixI32(sig, p.shadeA); mixI32(sig, p.shadeB); mixI32(sig, p.shadeC);
            mixI32(sig, p.originX); mixI32(sig, p.originY); mixI32(sig, p.originZ);
            mixI32(sig, p.txB); mixI32(sig, p.txC); mixI32(sig, p.tyB); mixI32(sig, p.tyC); mixI32(sig, p.tzB); mixI32(sig, p.tzC);
            mixI32(sig, p.texture ?? -1);
            mixBool(sig, p.hasTexels); mixBool(sig, p.lowDetail); mixBool(sig, p.lowMem);
            mixBool(sig, p.opaque); mixBool(sig, p.hclip);
            mixI32(sig, p.screenOriginX); mixI32(sig, p.screenOriginY); mixClip(sig, p.clip);
            return true;
        case 'modelFlatTriangle':
        case 'modelGouraudTriangle':
            mixI32(sig, p.xA); mixI32(sig, p.yA); mixI32(sig, p.zA);
            mixI32(sig, p.xB); mixI32(sig, p.yB); mixI32(sig, p.zB);
            mixI32(sig, p.xC); mixI32(sig, p.yC); mixI32(sig, p.zC);
            mixI32(sig, p.sinYaw); mixI32(sig, p.cosYaw); mixI32(sig, p.sinEyePitch); mixI32(sig, p.cosEyePitch);
            mixI32(sig, p.sinEyeYaw); mixI32(sig, p.cosEyeYaw);
            mixI32(sig, p.relativeX); mixI32(sig, p.relativeY); mixI32(sig, p.relativeZ);
            mixI32(sig, p.originX); mixI32(sig, p.originY);
            if (p.kind === 'modelGouraudTriangle') {
                mixU32(sig, p.colourA ?? 0); mixU32(sig, p.colourB ?? 0); mixU32(sig, p.colourC ?? 0);
                mixI32(sig, p.alpha ?? 256); mixBool(sig, p.lowDetail); mixBool(sig, p.hclip); mixClip(sig, p.clip);
            } else {
                mixU32(sig, p.rgb ?? 0); mixI32(sig, p.alpha ?? 256); mixClip(sig, p.clip);
            }
            return true;
        default:
            return false;
    }
}

function signaturesEqual(a: RetainedSurfaceSignature | undefined, b: RetainedSurfaceSignature): boolean {
    return !!a && a.cacheable && b.cacheable && a.len === b.len && a.hashA === b.hashA && a.hashB === b.hashB;
}

type RetainedSurfaceSignatureResult = {
    signatures: Map<number, RetainedSurfaceSignature>;
    hashSkippedSurfaces: number;
    hashSkippedPackets: number;
};

function collectRetainedSurfaceSignatures(packets: any[]): RetainedSurfaceSignatureResult {
    const packetCounts = new Map<number, number>();
    for (const p of packets) {
        if (p.kind === 'presentSurface') continue;
        const surface = p.surface | 0;
        packetCounts.set(surface, (packetCounts.get(surface) ?? 0) + 1);
    }

    const signatures = new Map<number, RetainedSurfaceSignature>();
    const hashSkipped = new Set<number>();
    let hashSkippedSurfaces = 0;
    let hashSkippedPackets = 0;
    for (const p of packets) {
        const surface = p.surface | 0;
        let sig = signatures.get(surface);
        if (!sig) {
            sig = { len: 0, hashA: 0x811c9dc5, hashB: 0x7f4a7c15, cacheable: true, present: false };
            signatures.set(surface, sig);
        }
        if (p.kind === 'presentSurface') {
            sig.present = true;
            continue;
        }
        const packetCount = packetCounts.get(surface) ?? 0;
        if (RETAINED_SURFACE_DELTA_MAX_PACKETS > 0 && packetCount > RETAINED_SURFACE_DELTA_MAX_PACKETS) {
            if (!hashSkipped.has(surface)) {
                hashSkipped.add(surface);
                hashSkippedSurfaces++;
                hashSkippedPackets += packetCount;
            }
            sig.cacheable = false;
            continue;
        }
        if (!hashRetainedPacket(sig, p)) {
            sig.cacheable = false;
            continue;
        }
        sig.len++;
    }
    return { signatures, hashSkippedSurfaces, hashSkippedPackets };
}

function updateRetainedSurfaceSignatures(signatures: Map<number, RetainedSurfaceSignature>): number {
    let cacheable = 0;
    const previous = new Map(retainedSurfaceSignatures);
    retainedSurfaceSignatures.clear();
    for (const [surface, sig] of signatures) {
        if (sig.cacheable && sig.len > 0) {
            retainedSurfaceSignatures.set(surface, sig);
            cacheable++;
        } else if (sig.cacheable && sig.present && sig.len === 0) {
            const retained = previous.get(surface);
            if (retained?.cacheable) {
                retainedSurfaceSignatures.set(surface, retained);
                cacheable++;
            }
        }
    }
    return cacheable;
}

function debugRetainedSurfaceSignatures(
    signatures: Map<number, RetainedSurfaceSignature>,
    deltaSurfaces: Set<number>,
    resourcesChanged: boolean
): void {
    if (!RETAINED_SURFACE_DEBUG) return;
    retainedSurfaceDebugFrame++;
    if (retainedSurfaceDebugFrame > 12 && retainedSurfaceDebugFrame % 20 !== 0) return;

    const rows = Array.from(signatures.entries())
        .sort((a, b) => b[1].len - a[1].len)
        .slice(0, 10)
        .map(([surface, sig]) =>
            `s${surface}:p=${sig.present ? 1 : 0}:len=${sig.len}:c=${sig.cacheable ? 1 : 0}:prev=${retainedSurfaceSignatures.has(surface) ? 1 : 0}:d=${deltaSurfaces.has(surface) ? 1 : 0}`
        );
    log(`retainedSurfaceDebug frame=${retainedSurfaceDebugFrame} resources=${resourcesChanged ? 1 : 0} signatures=${signatures.size} retained=${retainedSurfaceSignatures.size} deltas=${deltaSurfaces.size} ${rows.join(' ')}`);
}

function retainedSurfaceDeltaPackets(input: any[], resourcesChanged: boolean): RetainedDeltaResult {
    if (!PACK_RETAINED_SURFACE_DELTAS) {
        retainedSurfaceSignatures.clear();
        return { packets: input, inputPackets: input.length, deltaSurfaces: 0, packetsSkipped: 0, cacheableSurfaces: 0, hashSkippedSurfaces: 0, hashSkippedPackets: 0 };
    }
    const {
        signatures,
        hashSkippedSurfaces,
        hashSkippedPackets,
    } = collectRetainedSurfaceSignatures(input);
    const deltaSurfaces = new Set<number>();
    for (const [surface, sig] of signatures) {
        if (!sig.present) {
            continue;
        }
        const retained = retainedSurfaceSignatures.get(surface);
        if (signaturesEqual(retained, sig) || (sig.cacheable && sig.len === 0 && retained?.cacheable)) {
            deltaSurfaces.add(surface);
        }
    }

    debugRetainedSurfaceSignatures(signatures, deltaSurfaces, resourcesChanged);
    const cacheableSurfaces = updateRetainedSurfaceSignatures(signatures);
    if (deltaSurfaces.size === 0) {
        return { packets: input, inputPackets: input.length, deltaSurfaces: 0, packetsSkipped: 0, cacheableSurfaces, hashSkippedSurfaces, hashSkippedPackets };
    }

    const packets: any[] = [];
    let packetsSkipped = 0;
    for (const p of input) {
        if (deltaSurfaces.has(p.surface | 0) && p.kind !== 'presentSurface') {
            packetsSkipped++;
            continue;
        }
        packets.push(p);
    }
    return { packets, inputPackets: input.length, deltaSurfaces: deltaSurfaces.size, packetsSkipped, cacheableSurfaces, hashSkippedSurfaces, hashSkippedPackets };
}

type RetainedWorldWriteStats = {
    refs: number;
    refRuns: number;
    sets: number;
    clears: number;
    evicts: number;
};

function retainedWorldPacketEligible(kind: string): boolean {
    return kind === 'triangleFlat' ||
        kind === 'triangleGouraud' ||
        kind === 'triangleTexture' ||
        kind === 'modelFlatTriangle' ||
        kind === 'modelGouraudTriangle';
}

function retainedWorldPacketKey(p: any): string | null {
    if (!retainedWorldPacketEligible(p.kind)) return null;
    if (typeof p.retainedKey === 'string' && p.retainedKey.length > 0) {
        return p.retainedKey;
    }
    const sig: RetainedSurfaceSignature = {
        len: 0,
        hashA: 0x811c9dc5,
        hashB: 0x7f4a7c15,
        cacheable: true,
        present: false
    };
    if (!hashRetainedPacket(sig, p)) return null;
    return `${retainedPacketKindTag(p.kind)}:${sig.len}:${sig.hashA >>> 0}:${sig.hashB >>> 0}`;
}

function resetRetainedWorldPacketCache(): void {
    retainedWorldPacketIds.clear();
    nextRetainedWorldPacketId = 1;
}

function evictRetainedWorldPacket(w: Writer, key: string, entry: RetainedWorldPacketEntry, stats: RetainedWorldWriteStats): void {
    retainedWorldPacketIds.delete(key);
    w.u8(T_RETAINED_PACKET_EVICT);
    w.u32(entry.id >>> 0);
    stats.evicts++;
}

function flushRetainedWorldRefRun(w: Writer, run: RetainedWorldRefRun, stats: RetainedWorldWriteStats): number {
    if (run.count <= 0) return 0;
    if (run.count === 1) {
        w.u8(T_RETAINED_PACKET_REF);
        w.u32(run.startId >>> 0);
    } else {
        w.u8(T_RETAINED_PACKET_REF_RUN);
        w.u32(run.startId >>> 0);
        w.u32(run.count >>> 0);
        stats.refRuns++;
    }
    run.startId = 0;
    run.nextId = 0;
    run.count = 0;
    return 1;
}

function queueRetainedWorldRef(w: Writer, run: RetainedWorldRefRun, id: number, stats: RetainedWorldWriteStats): number {
    const refId = id >>> 0;
    if (run.count <= 0) {
        run.startId = refId;
        run.nextId = (refId + 1) >>> 0;
        run.count = 1;
        return 0;
    }
    if (refId === run.nextId && run.count < 0xffff_ffff) {
        run.nextId = (run.nextId + 1) >>> 0;
        run.count++;
        return 0;
    }
    const flushed = flushRetainedWorldRefRun(w, run, stats);
    run.startId = refId;
    run.nextId = (refId + 1) >>> 0;
    run.count = 1;
    return flushed;
}

function maintainRetainedWorldPacketCacheForFrame(w: Writer, stats: RetainedWorldWriteStats): number {
    if (!PACK_RETAINED_WORLD_PACKET_REFS) return 0;
    retainedWorldPacketFrame++;

    const target = RETAINED_WORLD_PACKET_TARGET_CACHE > 0
        ? RETAINED_WORLD_PACKET_TARGET_CACHE
        : RETAINED_WORLD_PACKET_MAX_CACHE;
    if (target <= 0 || retainedWorldPacketIds.size <= target || RETAINED_WORLD_PACKET_EVICT_BUDGET <= 0) {
        return 0;
    }

    const staleBefore = retainedWorldPacketFrame - RETAINED_WORLD_PACKET_STALE_FRAMES;
    const before = stats.evicts;
    for (const [key, entry] of retainedWorldPacketIds) {
        if (entry.lastSeenFrame > staleBefore) continue;
        evictRetainedWorldPacket(w, key, entry, stats);
        if (retainedWorldPacketIds.size <= target || stats.evicts - before >= RETAINED_WORLD_PACKET_EVICT_BUDGET) {
            return stats.evicts - before;
        }
    }

    if (RETAINED_WORLD_PACKET_MAX_CACHE <= 0 || retainedWorldPacketIds.size <= RETAINED_WORLD_PACKET_MAX_CACHE) {
        return stats.evicts - before;
    }

    for (const [key, entry] of retainedWorldPacketIds) {
        evictRetainedWorldPacket(w, key, entry, stats);
        if (retainedWorldPacketIds.size <= target || stats.evicts - before >= RETAINED_WORLD_PACKET_EVICT_BUDGET) {
            return stats.evicts - before;
        }
    }

    if (RETAINED_WORLD_PACKET_MAX_CACHE > 0 && retainedWorldPacketIds.size > RETAINED_WORLD_PACKET_MAX_CACHE) {
        resetRetainedWorldPacketCache();
        w.u8(T_RETAINED_PACKET_CACHE_CLEAR);
        stats.clears++;
        return stats.evicts - before + 1;
    }
    return stats.evicts - before;
}

function beginRetainedWorldPacket(w: Writer, p: any, stats: RetainedWorldWriteStats, pendingRefs: RetainedWorldRefRun): RetainedWorldPacketWrite {
    if (!PACK_RETAINED_WORLD_PACKET_REFS) return { kind: 'none' };
    const key = retainedWorldPacketKey(p);
    if (!key) return { kind: 'none' };

    const existing = retainedWorldPacketIds.get(key);
    if (existing !== undefined) {
        existing.lastSeenFrame = retainedWorldPacketFrame;
        stats.refs++;
        return { kind: 'ref', id: existing.id };
    }

    if (nextRetainedWorldPacketId > 0xffff_ffff) {
        return { kind: 'none' };
    }
    const flushedPackets = flushRetainedWorldRefRun(w, pendingRefs, stats);
    const id = nextRetainedWorldPacketId++;
    retainedWorldPacketIds.set(key, { id, lastSeenFrame: retainedWorldPacketFrame });
    w.u8(T_RETAINED_PACKET_SET);
    w.u32(id >>> 0);
    stats.sets++;
    return { kind: 'set', flushedPackets };
}

function packSnapshot(snap: any): PackResult {
    const surfaces = snap.surfaces as Array<{ id: number; width: number; height: number }>;
    const sprites = snap.spriteResources as Array<{ id: number; width: number; height: number; rgba: Uint8Array; version: number }>;
    const glyphs = snap.glyphResources as Array<{ id: number; width: number; height: number; maskRgba: Uint8Array; version: number }>;
    const colourTable = snap.colourTableResource as { width: number; height: number; rgba: Uint8Array; version: number } | null;
    const textures = snap.textureResources as Array<{ id: number; width: number; height: number; indexRgba: Uint8Array; paletteRgba: Uint8Array; version: number }>;
    const indexedSprites = snap.indexedSpriteResources as Array<{ id: number; width: number; height: number; intensityRgba: Uint8Array; paletteRgba: Uint8Array; lineOffsetRgba: Uint8Array; version: number }>;
    const inputPackets = snap.packets as any[];

    const changedSprites = sprites.filter(s => resourceChanged(s, sentSpriteVersions));
    const changedGlyphs = glyphs.filter(g => resourceChanged(g, sentGlyphVersions));
    const changedTextures = textures.filter(t => resourceChanged(t, sentTextureVersions));
    const changedIndexedSprites = indexedSprites.filter(s => resourceChanged(s, sentIndexedSpriteVersions));
    const sendColourTable = colourTable !== null && sentColourTableVersion !== colourTable.version;
    const sendResources =
        changedSprites.length > 0 ||
        changedGlyphs.length > 0 ||
        changedTextures.length > 0 ||
        changedIndexedSprites.length > 0 ||
        sendColourTable;
    const commitResources = () => {
        for (const s of changedSprites) markResource(s, sentSpriteVersions);
        for (const g of changedGlyphs) markResource(g, sentGlyphVersions);
        if (sendColourTable && colourTable) sentColourTableVersion = colourTable.version;
        for (const t of changedTextures) markResource(t, sentTextureVersions);
        for (const s of changedIndexedSprites) markResource(s, sentIndexedSpriteVersions);
    };
    const retainedDelta = retainedSurfaceDeltaPackets(inputPackets, sendResources);
    const packets = retainedDelta.packets;

    const w = new Writer(1 << 22);
    w.u32(MAGIC);
    w.u32(WIDTH);
    w.u32(HEIGHT);
    w.u32(sendResources ? 1 : 0);
    w.u32(surfaces.length);
    w.u32(sendResources ? changedSprites.length : 0);
    w.u32(sendResources ? changedGlyphs.length : 0);
    w.u32(sendResources ? changedTextures.length : 0);
    w.u32(sendResources ? changedIndexedSprites.length : 0);
    w.u32(sendResources && sendColourTable ? 1 : 0);
    const nPacketsPos = w.pos;
    w.u32(0); // n_packets, backpatched

    for (const s of surfaces) {
        w.i32(s.id); w.i32(s.width); w.i32(s.height);
    }

    if (sendResources) {
        for (const s of changedSprites) {
            w.i32(s.id); w.i32(s.width); w.i32(s.height);
            w.bytesWithLen(s.rgba);
        }
        for (const g of changedGlyphs) {
            w.i32(g.id); w.i32(g.width); w.i32(g.height);
            w.bytesWithLen(g.maskRgba);
        }
        if (sendColourTable && colourTable) {
            w.i32(colourTable.width); w.i32(colourTable.height);
            w.bytesWithLen(colourTable.rgba);
        }
        for (const t of changedTextures) {
            w.i32(t.id); w.i32(t.width); w.i32(t.height);
            w.bytesWithLen(t.indexRgba);
            w.bytesWithLen(t.paletteRgba);
        }
        for (const s of changedIndexedSprites) {
            w.i32(s.id); w.i32(s.width); w.i32(s.height);
            w.bytesWithLen(s.intensityRgba);
            w.bytesWithLen(s.paletteRgba);
            w.bytesWithLen(s.lineOffsetRgba);
        }
    }

    let nPackets = 0;
    let nTris = 0;
    let nTextureTris = 0;
    let nModelFlat = 0;
    let nModelGouraud = 0;
    let nSceneGeometryUploads = 0;
    let nSceneInstances = 0;
    let nSceneCameras = 0;
    let nSceneLights = 0;
    let nCpuSpanRects = 0;
    let nSkippedNonGpuTris = 0;
    const retainedWorldStats: RetainedWorldWriteStats = { refs: 0, refRuns: 0, sets: 0, clears: 0, evicts: 0 };
    const retainedWorldRefRun: RetainedWorldRefRun = { startId: 0, nextId: 0, count: 0 };
    const flushRetainedRefs = (): void => {
        nPackets += flushRetainedWorldRefRun(w, retainedWorldRefRun, retainedWorldStats);
    };
    const writePacketTag = (tag: number): void => {
        flushRetainedRefs();
        w.u8(tag);
    };
    nPackets += maintainRetainedWorldPacketCacheForFrame(w, retainedWorldStats);
    for (const p of packets) {
        const surface = p.surface | 0;
        switch (p.kind) {
            case 'surface':
                writePacketTag(T_SURFACE); w.i32(surface); w.i32(p.width | 0); w.i32(p.height | 0);
                nPackets++; break;
            case 'presentSurface':
                writePacketTag(T_PRESENT_SURFACE); w.i32(surface);
                w.i32(p.x | 0); w.i32(p.y | 0); w.i32(p.width | 0); w.i32(p.height | 0);
                nPackets++; break;
            case 'clip':
                writePacketTag(T_CLIP); w.i32(surface);
                w.i32(p.clip.minX | 0); w.i32(p.clip.minY | 0); w.i32(p.clip.maxX | 0); w.i32(p.clip.maxY | 0);
                nPackets++; break;
            case 'clear':
                writePacketTag(T_CLEAR); w.i32(surface); nPackets++; break;
            case 'fillRect': {
                const fw = p.width | 0, fh = p.height | 0;
                if (fw <= 2 || fh <= 2) nCpuSpanRects++;
                writePacketTag(T_FILLRECT); w.i32(surface); w.i32(p.x | 0); w.i32(p.y | 0);
                w.i32(fw); w.i32(fh); w.u32(p.rgb >>> 0); w.i32(alphaI32(p.alpha));
                nPackets++; break;
            }
            case 'line':
                writePacketTag(T_LINE); w.i32(surface); w.i32(p.axis === 'h' ? 1 : 0);
                w.i32(p.x | 0); w.i32(p.y | 0); w.i32(p.length | 0);
                w.u32(p.rgb >>> 0); w.i32(alphaI32(p.alpha));
                nPackets++; break;
            case 'fillCircle':
                writePacketTag(T_FILLCIRCLE); w.i32(surface);
                w.i32(p.xCenter | 0); w.i32(p.yCenter | 0); w.i32(p.yRadius | 0);
                w.u32(p.rgb >>> 0); w.i32(alphaI32(p.alpha));
                nPackets++; break;
            case 'rgbaSprite':
                writePacketTag(T_RGBA_SPRITE); w.i32(surface); w.i32((p.resource ?? -1) | 0);
                w.i32(p.x | 0); w.i32(p.y | 0); w.i32(p.width | 0); w.i32(p.height | 0);
                w.f32(p.srcX ?? 0); w.f32(p.srcY ?? 0);
                w.f32(p.srcWidth ?? p.width); w.f32(p.srcHeight ?? p.height);
                w.i32(alphaI32(p.alpha));
                writeClip(w, p.clip);
                nPackets++; break;
            case 'indexedSprite':
                writePacketTag(T_INDEXED_SPRITE); w.i32(surface); w.i32((p.resource ?? -1) | 0);
                w.i32(p.x | 0); w.i32(p.y | 0); w.i32(p.width | 0); w.i32(p.height | 0);
                w.i32((p.srcX ?? 0) | 0); w.i32((p.srcY ?? 0) | 0); w.i32(indexedMode(p.mode));
                writeClip(w, p.clip);
                nPackets++; break;
            case 'transformSprite':
                writePacketTag(T_TRANSFORM_SPRITE); w.i32(surface); w.i32((p.resource ?? -1) | 0);
                w.i32(p.x | 0); w.i32(p.y | 0); w.i32(p.width | 0); w.i32(p.height | 0);
                w.i32(p.startX | 0); w.i32(p.startY | 0); w.i32(p.stepX | 0); w.i32(p.stepY | 0);
                w.i32(p.rowStepX | 0); w.i32(p.rowStepY | 0); w.i32(p.sourceStride | 0);
                w.i32(p.transparentZero ? 1 : 0);
                writeClip(w, p.clip);
                nPackets++; break;
            case 'maskedSprite':
                writePacketTag(T_MASKED_SPRITE); w.i32(surface); w.i32((p.resource ?? -1) | 0); w.i32((p.maskResource ?? -1) | 0);
                w.i32(p.x | 0); w.i32(p.y | 0); w.i32(p.width | 0); w.i32(p.height | 0);
                w.i32((p.srcX ?? 0) | 0); w.i32((p.srcY ?? 0) | 0); w.i32(p.maskStride | 0);
                writeClip(w, p.clip);
                nPackets++; break;
            case 'glyphSprite': {
                writePacketTag(T_GLYPH); w.i32(surface); w.i32((p.resource ?? -1) | 0);
                w.i32(p.x | 0); w.i32(p.y | 0); w.i32(p.width | 0); w.i32(p.height | 0);
                w.i32((p.srcX ?? 0) | 0); w.i32((p.srcY ?? 0) | 0);
                w.u32((p.rgb ?? 0xffffff) >>> 0); w.i32(alphaI32(p.alpha));
                writeClip(w, p.clip);
                nPackets++; break;
            }
            case 'triangleGouraud':
            case 'triangleFlat': {
                if (p.gpuRasterize !== true) {
                    nSkippedNonGpuTris++;
                }
                const retained = beginRetainedWorldPacket(w, p, retainedWorldStats, retainedWorldRefRun);
                if (retained.kind === 'ref') {
                    nPackets += queueRetainedWorldRef(w, retainedWorldRefRun, retained.id, retainedWorldStats);
                    nTris++; break;
                }
                if (retained.kind === 'set') nPackets += retained.flushedPackets;
                const isGouraud = p.kind === 'triangleGouraud';
                const ca = isGouraud ? p.colourA >>> 0 : p.colour >>> 0;
                const cb = isGouraud ? p.colourB >>> 0 : p.colour >>> 0;
                const cc = isGouraud ? p.colourC >>> 0 : p.colour >>> 0;
                if (retained.kind === 'none') writePacketTag(T_TRIANGLE);
                else w.u8(T_TRIANGLE);
                w.i32(isGouraud ? 1 : 0); w.i32(p.gpuRasterize === true ? 1 : 0); w.i32(surface);
                w.i32(p.xA | 0); w.i32(p.yA | 0); w.i32(p.xB | 0); w.i32(p.yB | 0); w.i32(p.xC | 0); w.i32(p.yC | 0);
                w.u32(ca); w.u32(cb); w.u32(cc); w.i32(alphaI32(p.alpha));
                w.i32(p.lowDetail ? 1 : 0); w.i32(p.hclip ? 1 : 0);
                writeClip(w, p.clip);
                nPackets++; nTris++; break;
            }
            case 'triangleTexture':
                if (p.gpuRasterize !== true) {
                    nSkippedNonGpuTris++;
                }
                {
                    const retained = beginRetainedWorldPacket(w, p, retainedWorldStats, retainedWorldRefRun);
                    if (retained.kind === 'ref') {
                        nPackets += queueRetainedWorldRef(w, retainedWorldRefRun, retained.id, retainedWorldStats);
                        nTextureTris++; break;
                    }
                    if (retained.kind === 'set') nPackets += retained.flushedPackets;
                    if (retained.kind === 'none') writePacketTag(T_TEXTURE_TRIANGLE);
                    else w.u8(T_TEXTURE_TRIANGLE);
                }
                w.i32(p.gpuRasterize === true ? 1 : 0); w.i32(surface);
                w.i32(p.xA | 0); w.i32(p.yA | 0); w.i32(p.xB | 0); w.i32(p.yB | 0); w.i32(p.xC | 0); w.i32(p.yC | 0);
                w.i32(p.shadeA | 0); w.i32(p.shadeB | 0); w.i32(p.shadeC | 0);
                w.i32(p.originX | 0); w.i32(p.originY | 0); w.i32(p.originZ | 0);
                w.i32(p.txB | 0); w.i32(p.txC | 0); w.i32(p.tyB | 0); w.i32(p.tyC | 0); w.i32(p.tzB | 0); w.i32(p.tzC | 0);
                w.i32((p.texture ?? -1) | 0);
                w.i32(p.hasTexels ? 1 : 0); w.i32(p.lowDetail ? 1 : 0); w.i32(p.lowMem ? 1 : 0);
                w.i32(p.opaque ? 1 : 0); w.i32(p.hclip ? 1 : 0);
                w.i32(p.screenOriginX | 0); w.i32(p.screenOriginY | 0);
                writeClip(w, p.clip);
                nPackets++; nTextureTris++; break;
            case 'modelFlatTriangle':
                {
                    const retained = beginRetainedWorldPacket(w, p, retainedWorldStats, retainedWorldRefRun);
                    if (retained.kind === 'ref') {
                        nPackets += queueRetainedWorldRef(w, retainedWorldRefRun, retained.id, retainedWorldStats);
                        nModelFlat++; break;
                    }
                    if (retained.kind === 'set') nPackets += retained.flushedPackets;
                    if (retained.kind === 'none') writePacketTag(T_MODEL_FLAT_TRIANGLE);
                    else w.u8(T_MODEL_FLAT_TRIANGLE);
                }
                w.i32(surface);
                w.i32(p.xA | 0); w.i32(p.yA | 0); w.i32(p.zA | 0);
                w.i32(p.xB | 0); w.i32(p.yB | 0); w.i32(p.zB | 0);
                w.i32(p.xC | 0); w.i32(p.yC | 0); w.i32(p.zC | 0);
                w.i32(p.sinYaw | 0); w.i32(p.cosYaw | 0); w.i32(p.sinEyePitch | 0); w.i32(p.cosEyePitch | 0);
                w.i32(p.sinEyeYaw | 0); w.i32(p.cosEyeYaw | 0);
                w.i32(p.relativeX | 0); w.i32(p.relativeY | 0); w.i32(p.relativeZ | 0);
                w.i32(p.originX | 0); w.i32(p.originY | 0);
                w.u32((p.rgb ?? 0) >>> 0); w.i32((p.alpha ?? 256) | 0);
                writeClip(w, p.clip);
                nPackets++; nModelFlat++; break;
            case 'modelGouraudTriangle':
                {
                    const retained = beginRetainedWorldPacket(w, p, retainedWorldStats, retainedWorldRefRun);
                    if (retained.kind === 'ref') {
                        nPackets += queueRetainedWorldRef(w, retainedWorldRefRun, retained.id, retainedWorldStats);
                        nModelGouraud++; break;
                    }
                    if (retained.kind === 'set') nPackets += retained.flushedPackets;
                    if (retained.kind === 'none') writePacketTag(T_MODEL_GOURAUD_TRIANGLE);
                    else w.u8(T_MODEL_GOURAUD_TRIANGLE);
                }
                w.i32(surface);
                w.i32(p.xA | 0); w.i32(p.yA | 0); w.i32(p.zA | 0);
                w.i32(p.xB | 0); w.i32(p.yB | 0); w.i32(p.zB | 0);
                w.i32(p.xC | 0); w.i32(p.yC | 0); w.i32(p.zC | 0);
                w.i32(p.sinYaw | 0); w.i32(p.cosYaw | 0); w.i32(p.sinEyePitch | 0); w.i32(p.cosEyePitch | 0);
                w.i32(p.sinEyeYaw | 0); w.i32(p.cosEyeYaw | 0);
                w.i32(p.relativeX | 0); w.i32(p.relativeY | 0); w.i32(p.relativeZ | 0);
                w.i32(p.originX | 0); w.i32(p.originY | 0);
                w.u32((p.colourA ?? 0) >>> 0); w.u32((p.colourB ?? 0) >>> 0); w.u32((p.colourC ?? 0) >>> 0);
                w.i32((p.alpha ?? 256) | 0); w.i32(p.lowDetail ? 1 : 0); w.i32(p.hclip ? 1 : 0);
                writeClip(w, p.clip);
                nPackets++; nModelGouraud++; break;
            // ----- NYM-210 GPU-native scene description -----
            case 'modelGeometryUpload': {
                writePacketTag(T_MODEL_GEOMETRY_UPLOAD_TEXTURED);
                w.u32(p.geomId >>> 0);
                const np = p.numPoints | 0;
                w.u32(np >>> 0);
                for (let i = 0; i < np; i++) { w.i32(p.pointX[i] | 0); w.i32(p.pointY[i] | 0); w.i32(p.pointZ[i] | 0); }
                const nf = p.numFaces | 0;
                w.u32(nf >>> 0);
                for (let i = 0; i < nf; i++) {
                    w.u32(p.faceA[i] >>> 0); w.u32(p.faceB[i] >>> 0); w.u32(p.faceC[i] >>> 0);
                    const ca = p.faceColourA ? p.faceColourA[i] : (p.faceColour ? p.faceColour[i] : 0);
                    const cb = p.faceColourB ? p.faceColourB[i] : ca;
                    const cc = p.faceColourC ? p.faceColourC[i] : ca;
                    w.u32(ca >>> 0); w.u32(cb >>> 0); w.u32(cc >>> 0);
                    w.i32(p.faceType ? (p.faceType[i] | 0) : 0);
                    w.i32(p.faceAlpha ? (p.faceAlpha[i] | 0) : 0);
                    w.i32(p.facePriority ? (p.facePriority[i] | 0) : 0);
                    w.i32(p.faceTexture ? (p.faceTexture[i] | 0) : -1);
                    w.u32(p.faceTextureA ? (p.faceTextureA[i] >>> 0) : 0);
                    w.u32(p.faceTextureB ? (p.faceTextureB[i] >>> 0) : 0);
                    w.u32(p.faceTextureC ? (p.faceTextureC[i] >>> 0) : 0);
                }
                nPackets++; nSceneGeometryUploads++; break;
            }
            case 'modelSkeletonUpload':
                writePacketTag(T_MODEL_SKELETON_UPLOAD);
                w.u32(p.skeletonId >>> 0);
                w.u32((p.types?.length ?? 0) >>> 0);
                for (let i = 0; i < (p.types?.length ?? 0); i++) {
                    const labels = p.labels?.[i] ?? null;
                    w.i32(p.types[i] | 0);
                    w.u32((labels?.length ?? 0) >>> 0);
                    for (let j = 0; j < (labels?.length ?? 0); j++) {
                        w.i32(labels[j] | 0);
                    }
                }
                nPackets++; break;
            case 'modelLabelMapUpload':
                writePacketTag(T_MODEL_LABELMAP_UPLOAD);
                w.u32(p.geomId >>> 0);
                w.u32((p.labels?.length ?? 0) >>> 0);
                for (let i = 0; i < (p.labels?.length ?? 0); i++) {
                    w.i32(p.labels[i] | 0);
                }
                nPackets++; break;
            case 'modelAnimFrameUpload':
                writePacketTag(T_MODEL_ANIM_FRAME_UPLOAD);
                w.u32(p.animFrameId >>> 0);
                w.u32((p.skeletonId ?? 0) >>> 0);
                w.u32((p.ops?.length ?? 0) >>> 0);
                for (const op of p.ops ?? []) {
                    const labels = op.labels ?? null;
                    w.i32(op.type | 0); w.i32(op.x | 0); w.i32(op.y | 0); w.i32(op.z | 0);
                    w.u32((labels?.length ?? 0) >>> 0);
                    for (let j = 0; j < (labels?.length ?? 0); j++) {
                        w.i32(labels[j] | 0);
                    }
                }
                nPackets++; break;
            case 'sceneInstance':
                writePacketTag(T_SCENE_INSTANCE);
                w.u32(p.geomId >>> 0); w.i32(p.sinYaw | 0); w.i32(p.cosYaw | 0);
                w.i32(p.relativeX | 0); w.i32(p.relativeY | 0); w.i32(p.relativeZ | 0);
                w.i32((p.alpha ?? 256) | 0); w.u32((p.flags ?? 0) >>> 0);
                w.u32((p.animFrameId ?? 0) >>> 0);
                nPackets++; nSceneInstances++; break;
            case 'sceneCamera':
                writePacketTag(T_SCENE_CAMERA);
                w.i32(p.sinEyePitch | 0); w.i32(p.cosEyePitch | 0);
                w.i32(p.sinEyeYaw | 0); w.i32(p.cosEyeYaw | 0);
                w.i32(p.originX | 0); w.i32(p.originY | 0);
                nPackets++; nSceneCameras++; break;
            case 'sceneLight':
                writePacketTag(T_SCENE_LIGHT);
                w.i32(p.ambient | 0); w.i32(p.contrast | 0);
                w.i32(p.lightX | 0); w.i32(p.lightY | 0); w.i32(p.lightZ | 0);
                nPackets++; nSceneLights++; break;
            default:
                break;
        }
    }
    flushRetainedRefs();
    // backpatch n_packets
    w.view.setUint32(nPacketsPos, nPackets >>> 0, true);
    return {
        blob: w.slice(),
        inputPackets: retainedDelta.inputPackets,
        nPackets,
        nTris,
        nTextureTris,
        nModelFlat,
        nModelGouraud,
        nSceneGeometryUploads,
        nSceneInstances,
        nSceneCameras,
        nSceneLights,
        nCpuSpanRects,
        nSkippedNonGpuTris,
        retainedDeltaSurfaces: retainedDelta.deltaSurfaces,
        retainedDeltaPacketsSkipped: retainedDelta.packetsSkipped,
        retainedCacheableSurfaces: retainedDelta.cacheableSurfaces,
        retainedHashSkippedSurfaces: retainedDelta.hashSkippedSurfaces,
        retainedHashSkippedPackets: retainedDelta.hashSkippedPackets,
        retainedWorldRefs: retainedWorldStats.refs,
        retainedWorldRefRuns: retainedWorldStats.refRuns,
        retainedWorldSets: retainedWorldStats.sets,
        retainedWorldClears: retainedWorldStats.clears,
        retainedWorldEvicts: retainedWorldStats.evicts,
        retainedWorldCacheSize: retainedWorldPacketIds.size,
        resources: sendResources,
        commitResources
    };
}

async function main() {
    if (PACKET_DUMP_DIR) {
        await mkdir(PACKET_DUMP_DIR, { recursive: true });
        log(`packet dump enabled -> ${PACKET_DUMP_DIR} start=${PACKET_DUMP_START} limit=${PACKET_DUMP_LIMIT}`);
    }

    if (!INIT_RENDERER_AFTER_INGAME) {
        initRenderer('startup');
    }

    log('importing client modules…');
    const { Client } = await import('#/client/Client.js');
    const { gpuRenderPackets } = await import('#/graphics/GpuRenderPackets.js');
    const { default: Pix3D } = await import('#/dash3d/Pix3D.js');
    gpuRenderPackets.setEnabled(true);
    gpuRenderPackets.setSkipCpuRasterWrites(SKIP_CPU_RASTER_WRITES);
    gpuRenderPackets.setModelGouraudTriangles(MODEL_GOURAUD_PACKETS);
    gpuRenderPackets.setSceneInstanceMode(SCENE_INSTANCE_MODE);
    log(`scene-instance mode: ${SCENE_INSTANCE_MODE}`);

    log('constructing Client…');
    const client: any = new Client(10, false, true);
    (globalThis as any).gameClient = client;
    configureHeadlessTiming(client);

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
    forceFullUiRedraw(client, FORCE_FULL_UI_REDRAW_WARMUP_FRAMES > 0);
    if (INIT_RENDERER_AFTER_INGAME) {
        initRenderer('after-ingame');
    }
    await waitForPipewireReady(client, gpuRenderPackets);

    // --- live frame loop ---
    let frame = 0;
    let packTotalUs = 0;
    let submitTotalUs = 0;
    let snapTotalUs = 0;
    let retainedDeltaSurfacesTotal = 0;
    let retainedDeltaPacketsSkippedTotal = 0;
    let retainedHashSkippedSurfacesTotal = 0;
    let retainedHashSkippedPacketsTotal = 0;
    let retainedWorldRefsTotal = 0;
    let retainedWorldRefRunsTotal = 0;
    let retainedWorldSetsTotal = 0;
    let oversizedSnapshotsDropped = 0;
    let warmupSnapshotsSkipped = 0;
    const loopT0 = Date.now();
    let lastReport = Date.now();
    let lastReportFrame = 0;
    let lastPublishedFrames = 0;
    let lastPublishedAt = Date.now();
    let didCpuRef = false;

    // Time-based GPU-readback captures (seconds after ingame) for live proof.
    const CAP_T0_S = Number(process.env.AURAI_CAP_T0_S ?? 0);
    const CAP_T1_S = Number(process.env.AURAI_CAP_T1_S ?? 0);
    const CAP_T0_PATH = process.env.AURAI_CAP_T0_PATH ?? '/tmp/live_t0.png';
    const CAP_T1_PATH = process.env.AURAI_CAP_T1_PATH ?? '/tmp/live_t1.png';
    let didCap0 = false, didCap1 = false;

    // The game's mainredraw bumps Client.drawCycle once per produced frame. Only
    // snapshot + submit when a NEW redraw happened or when packet recording
    // has pending work. Some rs-sdk paths record packets without bumping
    // drawCycle, so packet backlog is also a frame boundary; otherwise stale
    // work accumulates into enormous batches seconds later.
    const ClientClass: any = (client as any).constructor;
    let lastDrawCycle = -1;
    let lastSubmitAt = 0;
    let dumpResourceKeyframeDone = false;

    while (FRAME_LIMIT === 0 || frame < FRAME_LIMIT) {
        // Wait for either a game redraw or enough pending packet work to submit.
        const dc = ClientClass?.drawCycle ?? frame;
        const packetBacklog = Array.isArray(gpuRenderPackets.packets) ? gpuRenderPackets.packets.length : 0;
        const nowLoop = Date.now();
        const drawCycleChanged = dc !== lastDrawCycle;
        const packetBacklogReady =
            packetBacklog > 0 &&
            (nowLoop - lastSubmitAt >= TARGET_SUBMIT_INTERVAL_MS || packetBacklog >= MAX_PACKET_BACKLOG_BEFORE_SUBMIT);
        if (!drawCycleChanged && !packetBacklogReady) {
            await Bun.sleep(0);
            // Still service time-based captures while idling between frames.
            const elapsedIdleS = (Date.now() - loopT0) / 1000;
            if (!didCap0 && CAP_T0_S > 0 && elapsedIdleS >= CAP_T0_S) {
                didCap0 = true;
                const ok = await captureGpu(CAP_T0_PATH);
                log(`capture t0 (${elapsedIdleS.toFixed(1)}s) -> ${CAP_T0_PATH} ok=${ok}`);
            }
            if (!didCap1 && CAP_T1_S > 0 && elapsedIdleS >= CAP_T1_S) {
                didCap1 = true;
                const ok = await captureGpu(CAP_T1_PATH);
                log(`capture t1 (${elapsedIdleS.toFixed(1)}s) -> ${CAP_T1_PATH} ok=${ok}`);
            }
            continue;
        }
        if (drawCycleChanged) {
            lastDrawCycle = dc;
        }

        const dumpingThisFrame = PACKET_DUMP_DIR && frame >= PACKET_DUMP_START && (PACKET_DUMP_LIMIT === 0 || frame < PACKET_DUMP_START + PACKET_DUMP_LIMIT);
        if (dumpingThisFrame && !dumpResourceKeyframeDone) {
            resetSentResources();
            Pix3D.recordGpuColourTable();
            dumpResourceKeyframeDone = true;
        }
        const tSnap = performance.now();
        const snap = gpuRenderPackets.snapshot();
        const tPack = performance.now();
        const inputPacketCount = Number(snap.packetCount ?? snap.packets?.length ?? 0);
        if (frame === 0 && MIN_FIRST_FRAME_PACKETS > 0 && inputPacketCount < MIN_FIRST_FRAME_PACKETS) {
            warmupSnapshotsSkipped++;
            if (warmupSnapshotsSkipped <= 5 || warmupSnapshotsSkipped % 30 === 0) {
                log(`skip warmup first snapshot packets=${inputPacketCount} min=${MIN_FIRST_FRAME_PACKETS} skipped=${warmupSnapshotsSkipped}`);
            }
            gpuRenderPackets.reset();
            forceFullUiRedraw(client, true);
            lastSubmitAt = Date.now();
            continue;
        }
        if (inputPacketCount > MAX_PACK_INPUT_PACKETS) {
            oversizedSnapshotsDropped++;
            log(`drop oversized packet snapshot before pack packets=${inputPacketCount} limit=${MAX_PACK_INPUT_PACKETS} drops=${oversizedSnapshotsDropped}`);
            gpuRenderPackets.reset();
            forceFullUiRedraw(client);
            lastSubmitAt = Date.now();
            continue;
        }
        const {
            blob,
            inputPackets,
            nPackets,
            nTris,
            nTextureTris,
            nModelFlat,
            nModelGouraud,
            nSceneGeometryUploads,
            nSceneInstances,
            nSceneCameras,
            nSceneLights,
            nCpuSpanRects,
            nSkippedNonGpuTris,
            retainedDeltaSurfaces,
            retainedDeltaPacketsSkipped,
            retainedCacheableSurfaces,
            retainedHashSkippedSurfaces,
            retainedHashSkippedPackets,
            retainedWorldRefs,
            retainedWorldRefRuns,
            retainedWorldSets,
            retainedWorldClears,
            retainedWorldEvicts,
            retainedWorldCacheSize,
            resources,
            commitResources
        } = packSnapshot(snap);
        if (dumpingThisFrame) {
            const frameName = `frame-${String(frame).padStart(6, '0')}.aur2`;
            await Bun.write(`${PACKET_DUMP_DIR}/${frameName}`, blob);
        }
        const tSubmit = performance.now();
        const rcs = INIT_RENDERER ? lib.symbols.aurai_render_submit_frame(ptr(blob), BigInt(blob.length)) : 0;
        const tEnd = performance.now();
        if (rcs === 0) commitResources();
        else log('submit_frame rc', rcs);

        // Fresh packet list for the next frame.
        gpuRenderPackets.reset();
        forceFullUiRedraw(client, frame < FORCE_FULL_UI_REDRAW_WARMUP_FRAMES);

        snapTotalUs += (tPack - tSnap) * 1000;
        packTotalUs += (tSubmit - tPack) * 1000;
        submitTotalUs += (tEnd - tSubmit) * 1000;
        retainedDeltaSurfacesTotal += retainedDeltaSurfaces;
        retainedDeltaPacketsSkippedTotal += retainedDeltaPacketsSkipped;
        retainedHashSkippedSurfacesTotal += retainedHashSkippedSurfaces;
        retainedHashSkippedPacketsTotal += retainedHashSkippedPackets;
        retainedWorldRefsTotal += retainedWorldRefs;
        retainedWorldRefRunsTotal += retainedWorldRefRuns;
        retainedWorldSetsTotal += retainedWorldSets;
        frame++;
        lastSubmitAt = Date.now();

        if (frame === 1) {
            log(`frame 0: packets=${nPackets}/${inputPackets} tris=${nTris} textureTris=${nTextureTris} modelFlat=${nModelFlat} modelGouraud=${nModelGouraud} cpuSpanRects=${nCpuSpanRects} ` +
                `sceneGeom=${nSceneGeometryUploads} sceneInstances=${nSceneInstances} sceneCameras=${nSceneCameras} sceneLights=${nSceneLights} ` +
                `skippedNonGpuTris=${nSkippedNonGpuTris} ` +
                `retainedDeltaSurfaces=${retainedDeltaSurfaces} retainedDeltaSkipped=${retainedDeltaPacketsSkipped} ` +
                `retainedCacheableSurfaces=${retainedCacheableSurfaces} retainedHashSkipped=${retainedHashSkippedSurfaces}/${retainedHashSkippedPackets} ` +
                `retainedWorldRefs=${retainedWorldRefs} retainedWorldRefRuns=${retainedWorldRefRuns} retainedWorldSets=${retainedWorldSets} retainedWorldEvicts=${retainedWorldEvicts} retainedWorldClears=${retainedWorldClears} retainedWorldCache=${retainedWorldCacheSize} ` +
                `resources=${resources} blobBytes=${blob.length}`);
        }
        if (!didCpuRef && CPU_REF_PPM && frame >= CPU_REF_FRAME) {
            didCpuRef = true;
            const ok = await dumpHeadlessCanvasPpm(CPU_REF_PPM);
            log(`cpu reference frame ${frame} -> ${CPU_REF_PPM} ok=${ok}`);
        }
        const now = Date.now();
        if (STATS_EVERY_MS > 0 && now - lastReport >= STATS_EVERY_MS) {
            const df = frame - lastReportFrame;
            const fps = (df * 1000) / (now - lastReport);
            const published = lib.symbols.aurai_render_frames_published();
            const publishedFrames = Number(published);
            const rUs = lib.symbols.aurai_render_last_render_us();
            const rPkts = lib.symbols.aurai_render_last_packets();
            if (publishedFrames > lastPublishedFrames) {
                lastPublishedFrames = publishedFrames;
                lastPublishedAt = now;
            } else if (INIT_RENDERER && PUBLISH_STALL_MS > 0 && frame > 20 && now - lastPublishedAt > PUBLISH_STALL_MS) {
                log(`publisher stalled for ${now - lastPublishedAt}ms at gpuPublished=${publishedFrames}; exiting for supervisor restart`);
                process.exit(132);
            }
            log(`frame ${frame} gameFps=${fps.toFixed(1)} packets=${nPackets}/${inputPackets} tris=${nTris} textureTris=${nTextureTris} modelFlat=${nModelFlat} modelGouraud=${nModelGouraud} ` +
                `sceneGeom=${nSceneGeometryUploads} sceneInstances=${nSceneInstances} sceneCameras=${nSceneCameras} sceneLights=${nSceneLights} ` +
                `cpuSpanRects=${nCpuSpanRects} skippedNonGpuTris=${nSkippedNonGpuTris} ` +
                `retainedDeltaSurfaces=${retainedDeltaSurfaces} avgRetainedDeltaSurfaces=${(retainedDeltaSurfacesTotal / frame).toFixed(1)} ` +
                `retainedDeltaSkipped=${retainedDeltaPacketsSkipped} avgRetainedDeltaSkipped=${(retainedDeltaPacketsSkippedTotal / frame).toFixed(1)} ` +
                `retainedCacheableSurfaces=${retainedCacheableSurfaces} retainedHashSkipped=${retainedHashSkippedSurfaces}/${retainedHashSkippedPackets} ` +
                `avgRetainedHashSkipped=${(retainedHashSkippedSurfacesTotal / frame).toFixed(1)}/${(retainedHashSkippedPacketsTotal / frame).toFixed(0)} ` +
                `retainedWorldRefs=${retainedWorldRefs} avgRetainedWorldRefs=${(retainedWorldRefsTotal / frame).toFixed(0)} retainedWorldRefRuns=${retainedWorldRefRuns} avgRetainedWorldRefRuns=${(retainedWorldRefRunsTotal / frame).toFixed(0)} ` +
                `retainedWorldSets=${retainedWorldSets} avgRetainedWorldSets=${(retainedWorldSetsTotal / frame).toFixed(0)} retainedWorldEvicts=${retainedWorldEvicts} retainedWorldCache=${retainedWorldCacheSize} clears=${retainedWorldClears} ` +
                `oversizedDrops=${oversizedSnapshotsDropped} ` +
                `snap=${(snapTotalUs / frame / 1000).toFixed(2)}ms pack=${(packTotalUs / frame / 1000).toFixed(2)}ms ` +
                `submit=${(submitTotalUs / frame / 1000).toFixed(3)}ms | gpuRenderLast=${(Number(rUs) / 1000).toFixed(2)}ms ` +
                `gpuPublished=${published} gpuLastPkts=${rPkts}`);
            lastReport = now;
            lastReportFrame = frame;
        }

        const elapsedS = (Date.now() - loopT0) / 1000;
        if (!didCap0 && CAP_T0_S > 0 && elapsedS >= CAP_T0_S) {
            didCap0 = true;
            const ok = await captureGpu(CAP_T0_PATH);
            log(`capture t0 (${elapsedS.toFixed(1)}s) -> ${CAP_T0_PATH} ok=${ok}`);
        }
        if (!didCap1 && CAP_T1_S > 0 && elapsedS >= CAP_T1_S) {
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
