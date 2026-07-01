type ClipBounds = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};

type SurfaceInfo = {
    id: number;
    width: number;
    height: number;
};

type RetainedPresent = {
    key: string;
    surface: number;
    x: number;
    y: number;
    width: number;
    height: number;
};

export type GpuSpriteResource = {
    id: number;
    width: number;
    height: number;
    rgba: Uint8Array;
    version: number;
};

export type GpuColourTableResource = {
    width: number;
    height: number;
    rgba: Uint8Array;
    version: number;
};

export type GpuTextureResource = {
    id: number;
    width: number;
    height: number;
    indexRgba: Uint8Array;
    paletteRgba: Uint8Array;
    version: number;
};

export type GpuIndexedSpriteResource = {
    id: number;
    width: number;
    height: number;
    intensityRgba: Uint8Array;
    paletteRgba: Uint8Array;
    lineOffsetRgba: Uint8Array;
    version: number;
};

export type GpuGlyphResource = {
    id: number;
    width: number;
    height: number;
    maskRgba: Uint8Array;
    version: number;
};

export const SCENE_DRAW_SOURCE_MODEL = 0;
export const SCENE_DRAW_SOURCE_TERRAIN_QUICK = 1;
export const SCENE_DRAW_SOURCE_TERRAIN_COMPLEX = 2;
export const SCENE_DRAW_SOURCE_WALL = 3;
export const SCENE_DRAW_SOURCE_DECOR = 4;
export const SCENE_DRAW_SOURCE_GROUND_DECOR = 5;
export const SCENE_DRAW_SOURCE_OBJ = 6;
export const SCENE_DRAW_SOURCE_ENTITY = 7;

export type SceneDrawSource =
    | typeof SCENE_DRAW_SOURCE_MODEL
    | typeof SCENE_DRAW_SOURCE_TERRAIN_QUICK
    | typeof SCENE_DRAW_SOURCE_TERRAIN_COMPLEX
    | typeof SCENE_DRAW_SOURCE_WALL
    | typeof SCENE_DRAW_SOURCE_DECOR
    | typeof SCENE_DRAW_SOURCE_GROUND_DECOR
    | typeof SCENE_DRAW_SOURCE_OBJ
    | typeof SCENE_DRAW_SOURCE_ENTITY;

export type SceneDrawRecord = {
    frameId: number;
    drawId: number;
    instanceId: number;
    geomId: number;
    face: number;
    kind: number;
    source: SceneDrawSource;
    screen: [[number, number], [number, number], [number, number]];
    colours: [number, number, number];
    textureId: number;
    alpha: number;
    nearClipped: boolean;
};

type PacketBase = {
    surface: number;
    retainedKey?: string;
};

export type GpuRenderPacket =
    | (PacketBase & { kind: 'surface'; width: number; height: number })
    | (PacketBase & { kind: 'presentSurface'; x: number; y: number; width: number; height: number })
    | (PacketBase & { kind: 'unsupported'; reason: string })
    | (PacketBase & { kind: 'clip'; clip: ClipBounds })
    | (PacketBase & { kind: 'clear' })
    | (PacketBase & { kind: 'fillRect'; x: number; y: number; width: number; height: number; rgb: number; alpha: number | null })
    | (PacketBase & { kind: 'line'; axis: 'h' | 'v'; x: number; y: number; length: number; rgb: number; alpha: number | null })
    | (PacketBase & { kind: 'fillCircle'; xCenter: number; yCenter: number; yRadius: number; rgb: number; alpha: number })
    | (PacketBase & {
          kind: 'rgbaSprite';
          resource: number;
          x: number;
          y: number;
          width: number;
          height: number;
          srcX: number;
          srcY: number;
          srcWidth: number;
          srcHeight: number;
          alpha: number | null;
          clip: ClipBounds;
      })
    | (PacketBase & {
          kind: 'indexedSprite';
          resource: number;
          x: number;
          y: number;
          width: number;
          height: number;
          srcX: number;
          srcY: number;
          mode: 'direct' | 'titleFlameLeft' | 'titleFlameRight';
          clip: ClipBounds;
      })
    | (PacketBase & {
          kind: 'glyphSprite';
          resource: number;
          x: number;
          y: number;
          width: number;
          height: number;
          srcX: number;
          srcY: number;
          rgb: number;
          alpha: number | null;
          clip: ClipBounds;
      })
    | (PacketBase & {
          kind: 'transformSprite';
          resource: number;
          x: number;
          y: number;
          width: number;
          height: number;
          startX: number;
          startY: number;
          stepX: number;
          stepY: number;
          rowStepX: number;
          rowStepY: number;
          sourceStride: number;
          transparentZero: boolean;
          clip: ClipBounds;
      })
    | (PacketBase & {
          kind: 'maskedSprite';
          resource: number;
          maskResource: number;
          x: number;
          y: number;
          width: number;
          height: number;
          srcX: number;
          srcY: number;
          maskStride: number;
          clip: ClipBounds;
      })
    | (PacketBase & {
          kind: 'triangleGouraud';
          xA: number;
          xB: number;
          xC: number;
          yA: number;
          yB: number;
          yC: number;
          colourA: number;
          colourB: number;
          colourC: number;
          gpuRasterize: boolean;
          lowDetail: boolean;
          hclip: boolean;
          alpha: number;
          clip: ClipBounds;
      })
    | (PacketBase & {
          kind: 'triangleFlat';
          xA: number;
          xB: number;
          xC: number;
          yA: number;
          yB: number;
          yC: number;
          colour: number;
          gpuRasterize: boolean;
          alpha: number;
          clip: ClipBounds;
      })
    | (PacketBase & {
          kind: 'triangleTexture';
          xA: number;
          xB: number;
          xC: number;
          yA: number;
          yB: number;
          yC: number;
          shadeA: number;
          shadeB: number;
          shadeC: number;
          originX: number;
          originY: number;
          originZ: number;
          txB: number;
          txC: number;
          tyB: number;
          tyC: number;
          tzB: number;
          tzC: number;
          texture: number;
          hasTexels: boolean;
          lowDetail: boolean;
          lowMem: boolean;
          opaque: boolean;
          gpuRasterize: boolean;
          hclip: boolean;
          screenOriginX: number;
          screenOriginY: number;
          clip: ClipBounds;
      })
    | (PacketBase & {
          kind: 'modelFlatTriangle';
          xA: number;
          yA: number;
          zA: number;
          xB: number;
          yB: number;
          zB: number;
          xC: number;
          yC: number;
          zC: number;
          sinYaw: number;
          cosYaw: number;
          sinEyePitch: number;
          cosEyePitch: number;
          sinEyeYaw: number;
          cosEyeYaw: number;
          relativeX: number;
          relativeY: number;
          relativeZ: number;
          originX: number;
          originY: number;
          rgb: number;
          alpha: number;
          clip: ClipBounds;
      })
    | (PacketBase & {
          kind: 'modelGouraudTriangle';
          xA: number;
          yA: number;
          zA: number;
          xB: number;
          yB: number;
          zB: number;
          xC: number;
          yC: number;
          zC: number;
          sinYaw: number;
          cosYaw: number;
          sinEyePitch: number;
          cosEyePitch: number;
          sinEyeYaw: number;
          cosEyeYaw: number;
          relativeX: number;
          relativeY: number;
          relativeZ: number;
          originX: number;
          originY: number;
          colourA: number;
          colourB: number;
          colourC: number;
          alpha: number;
          lowDetail: boolean;
          hclip: boolean;
          clip: ClipBounds;
      });

export type GpuRenderPacketSnapshot = {
    enabled: boolean;
    skipCpuRasterWrites: boolean;
    cpuRasterWriteBypasses: number;
    packets: GpuRenderPacket[];
    packetCount: number;
    dropped: number;
    currentSurface: number;
    surfaces: SurfaceInfo[];
    recordableSurfaces: number[];
    cpuRasterWriteSkipSurfaces: number[];
    spriteResources: GpuSpriteResource[];
    colourTableResource: GpuColourTableResource | null;
    textureResources: GpuTextureResource[];
    indexedSpriteResources: GpuIndexedSpriteResource[];
    glyphResources: GpuGlyphResource[];
    sceneCpuDrawRecords: SceneDrawRecord[];
    sceneGpuDrawRecords: SceneDrawRecord[];
};

export type GpuRenderPacketState = {
    enabled: boolean;
    skipCpuRasterWrites: boolean;
    modelGouraudTriangles: boolean;
    cpuRasterWriteBypasses: number;
    readonly packets: GpuRenderPacket[];
    maxPackets: number;
    dropped: number;
    readonly currentSurface: number;
    readonly surfaces: SurfaceInfo[];
    reset(): void;
    discard(count: number): void;
    discardSurface(surface: number): void;
    setEnabled(enabled: boolean): void;
    markCurrentSurfaceRecordable(): void;
    markSurfaceRecordable(pixels: Int32Array, width: number, height: number): number;
    setSkipCpuRasterWrites(enabled: boolean): void;
    markCurrentSurfaceCpuRasterWritesSkippable(): void;
    markSurfaceCpuRasterWritesSkippable(pixels: Int32Array, width: number, height: number): number;
    recordSurfacePresent(pixels: Int32Array, width: number, height: number, x: number, y: number): void;
    setModelGouraudTriangles(enabled: boolean): void;
    clearCpuRasterWriteSkipSurfaces(): void;
    shouldSkipCpuRasterWrites(): boolean;
    shouldRecordModelGouraudTriangles(): boolean;
    recordCpuRasterWriteBypass(): void;
    snapshot(): GpuRenderPacketSnapshot;
    // NYM-210 GPU-native scene renderer: emit a scene description (geometry
    // cached by id + per-frame instances/camera/light) instead of pre-projected
    // triangles, so the CPU skips projection/lighting entirely.
    sceneInstanceMode: boolean;
    setSceneInstanceMode(enabled: boolean): void;
    shouldEmitSceneInstances(): boolean;
};

declare global {
    interface Window {
        __rsSdkGpuRenderPackets?: GpuRenderPacketState;
    }
}

const DEFAULT_MAX_PACKETS = 0;
const surfaceIds = new WeakMap<Int32Array, number>();
const spriteResourceIds = new WeakMap<object, Map<string, number>>();
const indexedSpriteResourceIds = new WeakMap<object, Map<string, number>>();
const glyphResourceIds = new WeakMap<object, Map<string, number>>();
const packets: GpuRenderPacket[] = [];
const surfaces: SurfaceInfo[] = [];
const spriteResources: GpuSpriteResource[] = [];
let colourTableResource: GpuColourTableResource | null = null;
const textureResources: GpuTextureResource[] = [];
const indexedSpriteResources: GpuIndexedSpriteResource[] = [];
const glyphResources: GpuGlyphResource[] = [];
const recordableSurfaces = new Set<number>();
const cpuRasterWriteSkipSurfaces = new Set<number>();
const retainedSurfacePackets = new Map<number, GpuRenderPacket[]>();
const retainedSurfaceBasePackets = new Map<number, GpuRenderPacket[]>();
const frameSurfacePacketCounts = new Map<number, number>();
const deferredSurfacePackets: GpuRenderPacket[] = [];
const deferredSurfaceIds = new Set<number>();
const nativeRetainedReadySurfaces = new Set<number>();
const nativeRetainedWarmupSurfaces = new Set<number>();
const retainedPresents = new Map<string, RetainedPresent>();
const retainedPresentOrder: string[] = [];
const framePresentKeys = new Set<string>();
let retainedFullFramePresentKey: string | null = null;
const MAX_RETAINED_BASE_PACKETS = 16;
const MAX_SOURCE_REPLAY_PACKETS = 4096;
const NATIVE_RETAINED_PRESENT_ONLY = readNativeRetainedPresentOnly();
const SCENE_DRAWSET_MANIFEST_ENABLED = readSceneDrawsetManifestEnabled();
let nextSurface = 1;
let nextSpriteResource = 1;
let nextIndexedSpriteResource = 1;
let nextGlyphResource = 1;
let currentSurface = 0;

function readNativeRetainedPresentOnly(): boolean {
    const env = typeof process !== 'undefined' ? process.env : undefined;
    const value = env?.AURAI_NATIVE_RETAINED_PRESENT_ONLY;
    if (!value) {
        return false;
    }
    const normalized = value.trim().toLowerCase();
    return normalized !== '' && normalized !== '0' && normalized !== 'false' && normalized !== 'off' && normalized !== 'no';
}

function readEnvFlag(name: string): boolean {
    const env = typeof process !== 'undefined' ? process.env : undefined;
    const value = env?.[name];
    if (!value) {
        return false;
    }
    const normalized = value.trim().toLowerCase();
    return normalized !== '' && normalized !== '0' && normalized !== 'false' && normalized !== 'off' && normalized !== 'no';
}

function readSceneDrawsetManifestEnabled(): boolean {
    return readEnvFlag('AURAI_SCENE_DRAWSET_MANIFEST');
}

function parseFlag(value: string | null): boolean | null {
    if (value === null) {
        return null;
    }

    if (value === '1' || value === 'true' || value === 'on') {
        return true;
    }

    if (value === '0' || value === 'false' || value === 'off') {
        return false;
    }

    return null;
}

function getQueryParam(name: string): string | null {
    if (typeof window === 'undefined') {
        return null;
    }

    return new URLSearchParams(window.location.search).get(name);
}

function getLocalStorageItem(name: string): string | null {
    if (typeof localStorage === 'undefined') {
        return null;
    }

    try {
        return localStorage.getItem(name);
    } catch (_err) {
        return null;
    }
}

function readInitialEnabled(): boolean {
    const replayQuery = parseFlag(getQueryParam('rendererPacketReplay'));
    const packetQuery = parseFlag(getQueryParam('rendererPackets')) ?? parseFlag(getQueryParam('gpuPackets'));
    if (replayQuery === true || packetQuery === true) {
        return true;
    }
    if (packetQuery !== null) {
        return packetQuery;
    }
    if (replayQuery !== null) {
        return replayQuery;
    }

    const replayPreference = parseFlag(getLocalStorageItem('rs-sdk.rendererPacketReplay'));
    const packetPreference = parseFlag(getLocalStorageItem('rs-sdk.rendererPackets'));
    if (replayPreference === true || packetPreference === true) {
        return true;
    }
    if (packetPreference !== null) {
        return packetPreference;
    }

    return replayPreference ?? false;
}

function readInitialMaxPackets(): number {
    const value = getQueryParam('rendererPacketLimit') ?? getLocalStorageItem('rs-sdk.rendererPacketLimit');
    if (!value) {
        return DEFAULT_MAX_PACKETS;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return DEFAULT_MAX_PACKETS;
    }

    return parsed;
}

function makeClip(minX: number, minY: number, maxX: number, maxY: number): ClipBounds {
    return { minX, minY, maxX, maxY };
}

type RetainedPacketKeySignature = {
    len: number;
    hashA: number;
    hashB: number;
};

const RETAINED_TAG_TRIANGLE = 8;
const RETAINED_TAG_GOURAUD_TRIANGLE = RETAINED_TAG_TRIANGLE + 100;
const RETAINED_TAG_TEXTURE_TRIANGLE = 12;
const RETAINED_TAG_MODEL_FLAT_TRIANGLE = 13;
const RETAINED_TAG_MODEL_GOURAUD_TRIANGLE = 20;

function mixRetainedKey32(hash: number, value: number): number {
    hash ^= value >>> 0;
    return Math.imul(hash, 0x01000193) >>> 0;
}

function retainedPacketKeySignature(tag: number, surface: number): RetainedPacketKeySignature {
    const sig = { len: 0, hashA: 0x811c9dc5, hashB: 0x7f4a7c15 };
    mixRetainedKey(sig, tag);
    mixRetainedKey(sig, surface);
    return sig;
}

function mixRetainedKey(sig: RetainedPacketKeySignature, value: number): void {
    const word = value >>> 0;
    sig.hashA = mixRetainedKey32(sig.hashA, word);
    sig.hashB = mixRetainedKey32(sig.hashB, (word ^ 0x9e3779b9 ^ (word >>> 16)) >>> 0);
    sig.len++;
}

function mixRetainedBool(sig: RetainedPacketKeySignature, value: boolean): void {
    mixRetainedKey(sig, value ? 1 : 0);
}

function mixRetainedAlpha(sig: RetainedPacketKeySignature, value: number | null | undefined): void {
    mixRetainedKey(sig, value === null || value === undefined ? -1 : value);
}

function mixRetainedClip(sig: RetainedPacketKeySignature, minX: number, minY: number, maxX: number, maxY: number): void {
    mixRetainedKey(sig, 1);
    mixRetainedKey(sig, minX);
    mixRetainedKey(sig, minY);
    mixRetainedKey(sig, maxX);
    mixRetainedKey(sig, maxY);
}

function retainedPacketKey(tag: number, sig: RetainedPacketKeySignature): string {
    return `${tag}:0:${sig.hashA >>> 0}:${sig.hashB >>> 0}`;
}

function retainedFlatTriangleKey(
    surface: number,
    xA: number, xB: number, xC: number,
    yA: number, yB: number, yC: number,
    colour: number,
    gpuRasterize: boolean,
    alpha: number,
    minX: number, minY: number, maxX: number, maxY: number
): string {
    const sig = retainedPacketKeySignature(RETAINED_TAG_TRIANGLE, surface);
    mixRetainedBool(sig, gpuRasterize);
    mixRetainedKey(sig, xA); mixRetainedKey(sig, yA); mixRetainedKey(sig, xB); mixRetainedKey(sig, yB); mixRetainedKey(sig, xC); mixRetainedKey(sig, yC);
    mixRetainedKey(sig, colour);
    mixRetainedKey(sig, colour);
    mixRetainedKey(sig, colour);
    mixRetainedAlpha(sig, alpha);
    mixRetainedBool(sig, false);
    mixRetainedBool(sig, false);
    mixRetainedClip(sig, minX, minY, maxX, maxY);
    return retainedPacketKey(RETAINED_TAG_TRIANGLE, sig);
}

function retainedGouraudTriangleKey(
    surface: number,
    xA: number, xB: number, xC: number,
    yA: number, yB: number, yC: number,
    colourA: number, colourB: number, colourC: number,
    gpuRasterize: boolean,
    lowDetail: boolean,
    hclip: boolean,
    alpha: number,
    minX: number, minY: number, maxX: number, maxY: number
): string {
    const sig = retainedPacketKeySignature(RETAINED_TAG_GOURAUD_TRIANGLE, surface);
    mixRetainedBool(sig, gpuRasterize);
    mixRetainedKey(sig, xA); mixRetainedKey(sig, yA); mixRetainedKey(sig, xB); mixRetainedKey(sig, yB); mixRetainedKey(sig, xC); mixRetainedKey(sig, yC);
    mixRetainedKey(sig, colourA);
    mixRetainedKey(sig, colourB);
    mixRetainedKey(sig, colourC);
    mixRetainedAlpha(sig, alpha);
    mixRetainedBool(sig, lowDetail);
    mixRetainedBool(sig, hclip);
    mixRetainedClip(sig, minX, minY, maxX, maxY);
    return retainedPacketKey(RETAINED_TAG_GOURAUD_TRIANGLE, sig);
}

function retainedTextureTriangleKey(
    surface: number,
    xA: number, xB: number, xC: number,
    yA: number, yB: number, yC: number,
    shadeA: number, shadeB: number, shadeC: number,
    originX: number, originY: number, originZ: number,
    txB: number, txC: number,
    tyB: number, tyC: number,
    tzB: number, tzC: number,
    texture: number,
    hasTexels: boolean,
    lowDetail: boolean,
    lowMem: boolean,
    opaque: boolean,
    gpuRasterize: boolean,
    hclip: boolean,
    screenOriginX: number,
    screenOriginY: number,
    minX: number, minY: number, maxX: number, maxY: number
): string {
    const sig = retainedPacketKeySignature(RETAINED_TAG_TEXTURE_TRIANGLE, surface);
    mixRetainedBool(sig, gpuRasterize);
    mixRetainedKey(sig, xA); mixRetainedKey(sig, yA); mixRetainedKey(sig, xB); mixRetainedKey(sig, yB); mixRetainedKey(sig, xC); mixRetainedKey(sig, yC);
    mixRetainedKey(sig, shadeA); mixRetainedKey(sig, shadeB); mixRetainedKey(sig, shadeC);
    mixRetainedKey(sig, originX); mixRetainedKey(sig, originY); mixRetainedKey(sig, originZ);
    mixRetainedKey(sig, txB); mixRetainedKey(sig, txC); mixRetainedKey(sig, tyB); mixRetainedKey(sig, tyC); mixRetainedKey(sig, tzB); mixRetainedKey(sig, tzC);
    mixRetainedKey(sig, texture);
    mixRetainedBool(sig, hasTexels); mixRetainedBool(sig, lowDetail); mixRetainedBool(sig, lowMem);
    mixRetainedBool(sig, opaque); mixRetainedBool(sig, hclip);
    mixRetainedKey(sig, screenOriginX); mixRetainedKey(sig, screenOriginY);
    mixRetainedClip(sig, minX, minY, maxX, maxY);
    return retainedPacketKey(RETAINED_TAG_TEXTURE_TRIANGLE, sig);
}

function retainedModelFlatTriangleKey(
    surface: number,
    xA: number, yA: number, zA: number,
    xB: number, yB: number, zB: number,
    xC: number, yC: number, zC: number,
    sinYaw: number,
    cosYaw: number,
    sinEyePitch: number,
    cosEyePitch: number,
    sinEyeYaw: number,
    cosEyeYaw: number,
    relativeX: number,
    relativeY: number,
    relativeZ: number,
    originX: number,
    originY: number,
    rgb: number,
    alpha: number,
    minX: number, minY: number, maxX: number, maxY: number
): string {
    const sig = retainedPacketKeySignature(RETAINED_TAG_MODEL_FLAT_TRIANGLE, surface);
    mixRetainedKey(sig, xA); mixRetainedKey(sig, yA); mixRetainedKey(sig, zA);
    mixRetainedKey(sig, xB); mixRetainedKey(sig, yB); mixRetainedKey(sig, zB);
    mixRetainedKey(sig, xC); mixRetainedKey(sig, yC); mixRetainedKey(sig, zC);
    mixRetainedKey(sig, sinYaw); mixRetainedKey(sig, cosYaw); mixRetainedKey(sig, sinEyePitch); mixRetainedKey(sig, cosEyePitch);
    mixRetainedKey(sig, sinEyeYaw); mixRetainedKey(sig, cosEyeYaw);
    mixRetainedKey(sig, relativeX); mixRetainedKey(sig, relativeY); mixRetainedKey(sig, relativeZ);
    mixRetainedKey(sig, originX); mixRetainedKey(sig, originY);
    mixRetainedKey(sig, rgb);
    mixRetainedKey(sig, alpha);
    mixRetainedClip(sig, minX, minY, maxX, maxY);
    return retainedPacketKey(RETAINED_TAG_MODEL_FLAT_TRIANGLE, sig);
}

function retainedModelGouraudTriangleKey(
    surface: number,
    xA: number, yA: number, zA: number,
    xB: number, yB: number, zB: number,
    xC: number, yC: number, zC: number,
    sinYaw: number,
    cosYaw: number,
    sinEyePitch: number,
    cosEyePitch: number,
    sinEyeYaw: number,
    cosEyeYaw: number,
    relativeX: number,
    relativeY: number,
    relativeZ: number,
    originX: number,
    originY: number,
    colourA: number,
    colourB: number,
    colourC: number,
    alpha: number,
    lowDetail: boolean,
    hclip: boolean,
    minX: number, minY: number, maxX: number, maxY: number
): string {
    const sig = retainedPacketKeySignature(RETAINED_TAG_MODEL_GOURAUD_TRIANGLE, surface);
    mixRetainedKey(sig, xA); mixRetainedKey(sig, yA); mixRetainedKey(sig, zA);
    mixRetainedKey(sig, xB); mixRetainedKey(sig, yB); mixRetainedKey(sig, zB);
    mixRetainedKey(sig, xC); mixRetainedKey(sig, yC); mixRetainedKey(sig, zC);
    mixRetainedKey(sig, sinYaw); mixRetainedKey(sig, cosYaw); mixRetainedKey(sig, sinEyePitch); mixRetainedKey(sig, cosEyePitch);
    mixRetainedKey(sig, sinEyeYaw); mixRetainedKey(sig, cosEyeYaw);
    mixRetainedKey(sig, relativeX); mixRetainedKey(sig, relativeY); mixRetainedKey(sig, relativeZ);
    mixRetainedKey(sig, originX); mixRetainedKey(sig, originY);
    mixRetainedKey(sig, colourA);
    mixRetainedKey(sig, colourB);
    mixRetainedKey(sig, colourC);
    mixRetainedKey(sig, alpha);
    mixRetainedBool(sig, lowDetail);
    mixRetainedBool(sig, hclip);
    mixRetainedClip(sig, minX, minY, maxX, maxY);
    return retainedPacketKey(RETAINED_TAG_MODEL_GOURAUD_TRIANGLE, sig);
}

function getSurfaceId(pixels: Int32Array, width: number, height: number): number {
    let surface = surfaceIds.get(pixels);
    if (!surface) {
        surface = nextSurface++;
        surfaceIds.set(pixels, surface);
        surfaces.push({ id: surface, width, height });
    } else {
        const info = surfaces.find(item => item.id === surface);
        if (info) {
            info.width = width;
            info.height = height;
        }
    }

    return surface;
}

function invalidateNativeRetainedReadySurfaces(): void {
    nativeRetainedReadySurfaces.clear();
    nativeRetainedWarmupSurfaces.clear();
}

function isRetainedSurfacePacket(packet: GpuRenderPacket): boolean {
    return packet.kind !== 'presentSurface' && packet.kind !== 'unsupported';
}

function noteFrameSurfacePacket(packet: GpuRenderPacket): void {
    if (!isRetainedSurfacePacket(packet)) {
        return;
    }

    frameSurfacePacketCounts.set(packet.surface, (frameSurfacePacketCounts.get(packet.surface) ?? 0) + 1);
}

function noteNativeRetainedSurfaceWarmup(surface: number): void {
    nativeRetainedWarmupSurfaces.add(surface);
}

function cacheSurfacePacket(packet: GpuRenderPacket): void {
    if (!isRetainedSurfacePacket(packet)) {
        return;
    }

    nativeRetainedReadySurfaces.delete(packet.surface);

    if (packet.kind === 'clear') {
        retainedSurfacePackets.set(packet.surface, [packet]);
        retainedSurfaceBasePackets.delete(packet.surface);
        return;
    }

    if (packet.kind === 'surface') {
        const base = retainedSurfaceBasePackets.get(packet.surface);
        if (base) {
            retainedSurfacePackets.set(packet.surface, [
                packet,
                ...base.filter(basePacket => basePacket.kind !== 'surface')
            ]);
            return;
        }

        retainedSurfacePackets.set(packet.surface, [packet]);
        return;
    }

    const retained = retainedSurfacePackets.get(packet.surface);
    if (retained) {
        retained.push(packet);
    } else {
        retainedSurfacePackets.set(packet.surface, [packet]);
    }
}

function appendRetainedSurfaceStream(target: GpuRenderPacket[], surface: number, width: number, height: number, retained: GpuRenderPacket[]): void {
    if (!retained.some(packet => packet.kind === 'surface')) {
        target.push({ kind: 'surface', surface, width, height });
    }
    target.push(...retained);
}

function retainedPresentKey(surface: number, x: number, y: number, width: number, height: number): string {
    return `${surface}:${x}:${y}:${width}:${height}`;
}

function isRetainablePresent(x: number, y: number, width: number, height: number): boolean {
    return x >= 512 || y >= 334 || isMinimapChromePresent(x, y, width, height);
}

function isFullFramePresent(x: number, y: number, width: number, height: number): boolean {
    return x === 0 && y === 0 && width >= 700 && height >= 450;
}

function noteRetainedPresent(surface: number, x: number, y: number, width: number, height: number): void {
    const fullFrame = isFullFramePresent(x, y, width, height);
    if (!fullFrame && !isRetainablePresent(x, y, width, height)) {
        return;
    }
    const key = retainedPresentKey(surface, x, y, width, height);
    if (!retainedPresents.has(key)) {
        retainedPresentOrder.push(key);
    }
    if (fullFrame) {
        retainedFullFramePresentKey = key;
    }
    retainedPresents.set(key, { key, surface, x, y, width, height });
    framePresentKeys.add(key);
}

function retainedPresentPacket(present: RetainedPresent): GpuRenderPacket {
    return {
        kind: 'presentSurface',
        surface: present.surface,
        x: present.x,
        y: present.y,
        width: present.width,
        height: present.height
    };
}

function appendMissingRetainedPresents(target: GpuRenderPacket[]): void {
    if (!NATIVE_RETAINED_PRESENT_ONLY) {
        return;
    }
    if (retainedFullFramePresentKey && !framePresentKeys.has(retainedFullFramePresentKey)) {
        const present = retainedPresents.get(retainedFullFramePresentKey);
        if (present && nativeRetainedReadySurfaces.has(present.surface)) {
            target.unshift(retainedPresentPacket(present));
        }
    }
    for (const key of retainedPresentOrder) {
        if (key === retainedFullFramePresentKey) {
            continue;
        }
        if (framePresentKeys.has(key)) {
            continue;
        }
        const present = retainedPresents.get(key);
        if (!present || !nativeRetainedReadySurfaces.has(present.surface)) {
            continue;
        }
        target.push(retainedPresentPacket(present));
    }
}

function pushPacket(packet: GpuRenderPacket, updateRetainedSurface = true): void {
    if (gpuRenderPackets.maxPackets <= 0 || packets.length < gpuRenderPackets.maxPackets) {
        packets.push(packet);
        noteFrameSurfacePacket(packet);
        if (updateRetainedSurface) {
            cacheSurfacePacket(packet);
        }
    } else {
        gpuRenderPackets.dropped++;
    }
}

function isMinimapChromePresent(x: number, y: number, width: number, height: number): boolean {
    return (
        (x === 516 && y === 4 && width === 34 && height === 156) ||
        (x === 722 && y === 4 && width === 43 && height === 156) ||
        (x === 516 && y === 160 && width === 249 && height === 45)
    );
}

function replayRetainedSurface(target: GpuRenderPacket[], surface: number, width: number, height: number, retained: GpuRenderPacket[]): void {
    appendRetainedSurfaceStream(target, surface, width, height, retained);
}

function replayRetainedSurfacePresent(
    target: GpuRenderPacket[],
    surface: number,
    width: number,
    height: number,
    x: number,
    y: number,
    retained: GpuRenderPacket[]
): void {
    replayRetainedSurface(target, surface, width, height, retained);
    target.push({ kind: 'presentSurface', surface, x, y, width, height });
}

function shouldRecordCurrentSurface(): boolean {
    return currentSurface !== 0 && recordableSurfaces.has(currentSurface);
}

function getSpriteResource(key: object, variant: string): number | null {
    return spriteResourceIds.get(key)?.get(variant) ?? null;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

function setSpriteResource(key: object, variant: string, width: number, height: number, rgba: Uint8Array, dynamic: boolean): number {
    let variants = spriteResourceIds.get(key);
    if (!variants) {
        variants = new Map();
        spriteResourceIds.set(key, variants);
    }

    let resource = variants.get(variant);
    if (!resource) {
        resource = nextSpriteResource++;
        variants.set(variant, resource);
        spriteResources.push({ id: resource, width, height, rgba, version: 0 });
        return resource;
    }

    if (dynamic) {
        const existing = spriteResources.find(item => item.id === resource);
        if (existing) {
            if (existing.width === width && existing.height === height && bytesEqual(existing.rgba, rgba)) {
                return resource;
            }
            existing.width = width;
            existing.height = height;
            existing.rgba = rgba;
            existing.version++;
            invalidateNativeRetainedReadySurfaces();
        }
    }

    return resource;
}

function getIndexedSpriteResource(key: object, variant: string): number | null {
    return indexedSpriteResourceIds.get(key)?.get(variant) ?? null;
}

function setIndexedSpriteResource(
    key: object,
    variant: string,
    width: number,
    height: number,
    intensityRgba: Uint8Array,
    paletteRgba: Uint8Array,
    lineOffsetRgba: Uint8Array
): number {
    let variants = indexedSpriteResourceIds.get(key);
    if (!variants) {
        variants = new Map();
        indexedSpriteResourceIds.set(key, variants);
    }

    let resource = variants.get(variant);
    if (!resource) {
        resource = nextIndexedSpriteResource++;
        variants.set(variant, resource);
        indexedSpriteResources.push({ id: resource, width, height, intensityRgba, paletteRgba, lineOffsetRgba, version: 0 });
        return resource;
    }

    const existing = indexedSpriteResources.find(item => item.id === resource);
    if (existing) {
        if (
            existing.width === width &&
            existing.height === height &&
            bytesEqual(existing.intensityRgba, intensityRgba) &&
            bytesEqual(existing.paletteRgba, paletteRgba) &&
            bytesEqual(existing.lineOffsetRgba, lineOffsetRgba)
        ) {
            return resource;
        }
        existing.width = width;
        existing.height = height;
        existing.intensityRgba = intensityRgba;
        existing.paletteRgba = paletteRgba;
        existing.lineOffsetRgba = lineOffsetRgba;
        existing.version++;
        invalidateNativeRetainedReadySurfaces();
    }

    return resource;
}

function getGlyphResource(key: object, variant: string): number | null {
    return glyphResourceIds.get(key)?.get(variant) ?? null;
}

function setGlyphResource(key: object, variant: string, width: number, height: number, maskRgba: Uint8Array): number {
    let variants = glyphResourceIds.get(key);
    if (!variants) {
        variants = new Map();
        glyphResourceIds.set(key, variants);
    }

    let resource = variants.get(variant);
    if (!resource) {
        resource = nextGlyphResource++;
        variants.set(variant, resource);
        glyphResources.push({ id: resource, width, height, maskRgba, version: 0 });
        return resource;
    }

    return resource;
}

function makeColourTableRgba(colourTable: Int32Array): Uint8Array {
    const rgba = new Uint8Array(256 * 256 * 4);
    const length = Math.min(colourTable.length, 256 * 256);
    for (let i = 0; i < length; i++) {
        const rgb = colourTable[i];
        const offset = i * 4;
        rgba[offset] = (rgb >> 16) & 0xff;
        rgba[offset + 1] = (rgb >> 8) & 0xff;
        rgba[offset + 2] = rgb & 0xff;
        rgba[offset + 3] = 0xff;
    }
    return rgba;
}

function makeGlyphMaskRgba(mask: Int8Array, width: number, height: number): Uint8Array {
    const rgba = new Uint8Array(width * height * 4);
    const length = Math.min(mask.length, width * height);
    for (let i = 0; i < length; i++) {
        if (mask[i] === 0) {
            continue;
        }

        const offset = i * 4;
        rgba[offset] = 0xff;
        rgba[offset + 3] = 0xff;
    }
    return rgba;
}

function makeIntensityRgba(intensities: ArrayLike<number>, width: number, height: number): Uint8Array {
    const rgba = new Uint8Array(width * height * 4);
    const length = Math.min(intensities.length, width * height);
    for (let i = 0; i < length; i++) {
        const offset = i * 4;
        rgba[offset] = intensities[i] & 0xff;
        rgba[offset + 3] = 0xff;
    }
    return rgba;
}

function makeLineOffsetRgba(lineOffsets: ArrayLike<number>): Uint8Array {
    const rgba = new Uint8Array(256 * 4);
    const length = Math.min(lineOffsets.length, 256);
    for (let i = 0; i < length; i++) {
        const offset = i * 4;
        rgba[offset] = Math.max(0, Math.min(255, (lineOffsets[i] | 0) + 128));
        rgba[offset + 3] = 0xff;
    }
    return rgba;
}

function makeTextureIndexRgba(indices: Int8Array, width: number, height: number): Uint8Array {
    const rgba = new Uint8Array(width * height * 4);
    const length = Math.min(indices.length, width * height);
    for (let i = 0; i < length; i++) {
        const offset = i * 4;
        rgba[offset] = indices[i] & 0xff;
        rgba[offset + 3] = 0xff;
    }
    return rgba;
}

function makePaletteRgba(palette: Int32Array): Uint8Array {
    const rgba = new Uint8Array(256 * 4);
    const length = Math.min(palette.length, 256);
    for (let i = 0; i < length; i++) {
        const rgb = palette[i];
        const offset = i * 4;
        rgba[offset] = (rgb >> 16) & 0xff;
        rgba[offset + 1] = (rgb >> 8) & 0xff;
        rgba[offset + 2] = rgb & 0xff;
        rgba[offset + 3] = 0xff;
    }
    return rgba;
}

// ----- NYM-210 GPU-native scene renderer emission -----
function readInitialSceneInstanceMode(): boolean {
    const v = (globalThis as any).process?.env?.AURAI_SCENE_INSTANCE_MODE;
    return v != null && v !== '' && v !== 'false' && v !== '0';
}

type SceneManifestGeometry = {
    numFaces: number;
    faceColourA: ArrayLike<number> | null;
    faceColourB: ArrayLike<number> | null;
    faceColourC: ArrayLike<number> | null;
    faceType: ArrayLike<number> | null;
    faceAlpha: ArrayLike<number> | null;
    faceTexture: ArrayLike<number> | null;
};

const SCENE_FACE_KIND_GOURAUD = 0;
const SCENE_FACE_KIND_FLAT = 1;
const SCENE_FACE_KIND_TEXTURED_GOURAUD = 2;
const SCENE_FACE_KIND_TEXTURED_FLAT = 3;

// GPU-resident geometry: ids uploaded this session (mirrors the native cache).
// Not cleared by reset() — geometry persists across frames on the GPU.
const sceneGeometryUploaded = new Set<number>();
const sceneLabelMapUploaded = new Set<number>();
const sceneSkeletonUploaded = new Set<number>();
const sceneAnimFrameUploaded = new Set<number>();
const sceneManifestGeometry = new Map<number, SceneManifestGeometry>();
const sceneCpuDrawRecords: SceneDrawRecord[] = [];
const sceneGpuDrawRecords: SceneDrawRecord[] = [];
let sceneFrameId = -1;
let sceneNextCpuDrawId = 0;
let sceneNextCpuInstanceId = 0;
let sceneNextGpuDrawId = 0;
let sceneNextGpuInstanceId = 0;
// NYM-210/#239: scene geometry is uploaded once (deduped here) to keep per-frame
// blobs small. But the native renderer only parses the LATEST submitted blob, so
// if the OBS consumer connects AFTER the one-time geometry frame, that geometry is
// never cached on the GPU — every instance then references uncached geometry and is
// skipped, leaving a black 3D viewport (UI/minimap still render). Re-emit all scene
// geometry as a periodic keyframe so a consumer connecting at any time gets a
// complete scene within the interval. The native side dedups re-uploads by geom id
// (upload_geometry is a no-op for cached ids), so this only costs blob bandwidth on
// keyframe frames, not GPU work.
let sceneKeyframeCounter = 0;
const SCENE_GEOMETRY_KEYFRAME_INTERVAL = Math.max(
    1,
    Number((globalThis as any).process?.env?.AURAI_SCENE_GEOMETRY_KEYFRAME ?? 60) || 60,
);
function maybeResetSceneGeometryKeyframe(): void {
    sceneKeyframeCounter++;
    if (sceneKeyframeCounter % SCENE_GEOMETRY_KEYFRAME_INTERVAL === 0) {
        sceneGeometryUploaded.clear();
        sceneLabelMapUploaded.clear();
        sceneSkeletonUploaded.clear();
        sceneAnimFrameUploaded.clear();
    }
}

export function sceneDrawFaceKind(renderType: number, textureId: number): number {
    const type = renderType & 0x3;
    if (textureId >= 0 || type === 2 || type === 3) {
        return type === 3 ? SCENE_FACE_KIND_TEXTURED_FLAT : SCENE_FACE_KIND_TEXTURED_GOURAUD;
    }
    return type === 1 ? SCENE_FACE_KIND_FLAT : SCENE_FACE_KIND_GOURAUD;
}

function sceneDrawAlpha(faceAlpha: ArrayLike<number> | null, face: number, instanceAlpha: number): number {
    const rawFaceAlpha = faceAlpha ? faceAlpha[face] | 0 : 0;
    const faceEffectiveAlpha = rawFaceAlpha > 0 ? 256 - rawFaceAlpha : 256;
    return Math.max(0, Math.min(256, Math.min(instanceAlpha | 0, faceEffectiveAlpha)));
}

export type SceneDrawInstanceIdentity = {
    drawId: number;
    instanceId: number;
};

export function shouldRecordSceneCpuDrawset(): boolean {
    return SCENE_DRAWSET_MANIFEST_ENABLED;
}

export function beginSceneDrawsetFrame(): void {
    if (!SCENE_DRAWSET_MANIFEST_ENABLED) {
        return;
    }
    sceneFrameId++;
    sceneNextCpuDrawId = 0;
    sceneNextCpuInstanceId = 0;
    sceneNextGpuDrawId = 0;
    sceneNextGpuInstanceId = 0;
    sceneCpuDrawRecords.length = 0;
    sceneGpuDrawRecords.length = 0;
}

export function beginSceneCpuDrawInstance(): SceneDrawInstanceIdentity | null {
    if (!SCENE_DRAWSET_MANIFEST_ENABLED) {
        return null;
    }
    return {
        drawId: sceneNextCpuDrawId++,
        instanceId: sceneNextCpuInstanceId++,
    };
}

export function recordSceneCpuDrawRecord(record: Omit<SceneDrawRecord, 'frameId'>): void {
    if (!SCENE_DRAWSET_MANIFEST_ENABLED) {
        return;
    }
    sceneCpuDrawRecords.push({
        frameId: sceneFrameId >= 0 ? sceneFrameId : 0,
        ...record,
    });
}

function rememberSceneManifestGeometry(
    geomId: number,
    numFaces: number,
    faceColourA: ArrayLike<number> | null,
    faceColourB: ArrayLike<number> | null,
    faceColourC: ArrayLike<number> | null,
    faceType: ArrayLike<number> | null,
    faceAlpha: ArrayLike<number> | null,
    faceTexture: ArrayLike<number> | null,
): void {
    if (!SCENE_DRAWSET_MANIFEST_ENABLED) {
        return;
    }
    sceneManifestGeometry.set(geomId, {
        numFaces,
        faceColourA,
        faceColourB,
        faceColourC,
        faceType,
        faceAlpha,
        faceTexture,
    });
}

function emitSceneGpuDrawRecords(geomId: number, instanceAlpha: number, source: SceneDrawSource): void {
    if (!SCENE_DRAWSET_MANIFEST_ENABLED) {
        return;
    }

    const geom = sceneManifestGeometry.get(geomId);
    if (!geom) {
        return;
    }

    const drawId = sceneNextGpuDrawId++;
    const instanceId = sceneNextGpuInstanceId++;
    const frameId = sceneFrameId >= 0 ? sceneFrameId : 0;
    for (let face = 0; face < geom.numFaces; face++) {
        const textureId = geom.faceTexture ? geom.faceTexture[face] | 0 : -1;
        const renderType = geom.faceType ? geom.faceType[face] | 0 : 0;
        const colourA = geom.faceColourA ? geom.faceColourA[face] | 0 : 0;
        const colourB = geom.faceColourB ? geom.faceColourB[face] | 0 : colourA;
        const colourC = geom.faceColourC ? geom.faceColourC[face] | 0 : colourA;
        sceneGpuDrawRecords.push({
            frameId,
            drawId,
            instanceId,
            geomId,
            face,
            kind: sceneDrawFaceKind(renderType, textureId),
            source,
            // NYM-220 first producer: descriptor coverage. The GPU-side
            // post-projection transcript will fill these once readback lands.
            screen: [[0, 0], [0, 0], [0, 0]],
            colours: [colourA, colourB, colourC],
            textureId,
            alpha: sceneDrawAlpha(geom.faceAlpha, face, instanceAlpha),
            nearClipped: false,
        });
    }
}

function buildModelSceneVertexLabels(model: any): Int32Array | null {
    if (model.vertexLabel) {
        return model.vertexLabel;
    }
    if (!model.labelVertices) {
        return null;
    }

    const labels = new Int32Array(model.numPoints);
    for (let label = 0; label < model.labelVertices.length; label++) {
        const vertices: Int32Array | null = model.labelVertices[label];
        if (!vertices) {
            continue;
        }
        for (let i = 0; i < vertices.length; i++) {
            labels[vertices[i]] = label;
        }
    }
    return labels;
}

function buildModelSceneTextureMetadata(model: any): {
    faceTexture: Int32Array;
    faceTextureA: Int32Array;
    faceTextureB: Int32Array;
    faceTextureC: Int32Array;
} | null {
    if (!model.faceRenderType || !model.faceColour || !model.faceTextureP || !model.faceTextureM || !model.faceTextureN) {
        return null;
    }

    const faceTexture = new Int32Array(model.numFaces);
    const faceTextureA = new Int32Array(model.numFaces);
    const faceTextureB = new Int32Array(model.numFaces);
    const faceTextureC = new Int32Array(model.numFaces);
    faceTexture.fill(-1);

    let anyTextured = false;
    for (let f = 0; f < model.numFaces; f++) {
        const renderType = model.faceRenderType[f] | 0;
        const type = renderType & 0x3;
        if (type !== 2 && type !== 3) {
            continue;
        }

        const texturedFace = renderType >> 2;
        faceTexture[f] = model.faceColour[f] | 0;
        faceTextureA[f] = model.faceTextureP[texturedFace] | 0;
        faceTextureB[f] = model.faceTextureM[texturedFace] | 0;
        faceTextureC[f] = model.faceTextureN[texturedFace] | 0;
        anyTextured = true;
    }

    return anyTextured ? { faceTexture, faceTextureA, faceTextureB, faceTextureC } : null;
}

function sceneGeometryField<T extends ArrayLike<number> | null>(values: T, count: number, copy: boolean): T | number[] {
    if (!values || !copy) {
        return values;
    }

    const slicer = (values as unknown as { slice?: (start?: number, end?: number) => T }).slice;
    if (slicer) {
        return slicer.call(values, 0, count);
    }

    const copied: number[] = new Array(count);
    for (let i = 0; i < count; i++) {
        copied[i] = values[i] | 0;
    }
    return copied;
}

/// Upload a model's raw geometry once (cached by id). No-op on cache hit. The
/// payload references the model's typed arrays directly (no copy); valid for
/// static geometry. `model` is structural to avoid a Model import cycle.
export function recordModelGeometryUpload(geomId: number, model: any, force: boolean = false): void {
    if (!gpuRenderPackets.enabled || (!force && sceneGeometryUploaded.has(geomId))) {
        return;
    }
    if (!force) {
        sceneGeometryUploaded.add(geomId);
    }
    const textureMetadata = buildModelSceneTextureMetadata(model);
    const faceColourA = model.faceColourA ?? model.faceColour;
    const faceColourB = model.faceColourB ?? faceColourA;
    const faceColourC = model.faceColourC ?? faceColourA;
    rememberSceneManifestGeometry(
        geomId,
        model.numFaces,
        faceColourA,
        faceColourB,
        faceColourC,
        model.faceRenderType,
        model.faceAlpha,
        textureMetadata?.faceTexture ?? null,
    );
    pushPacket(
        {
            kind: 'modelGeometryUpload',
            geomId,
            numPoints: model.numPoints,
            pointX: sceneGeometryField(model.pointX, model.numPoints, force),
            pointY: sceneGeometryField(model.pointY, model.numPoints, force),
            pointZ: sceneGeometryField(model.pointZ, model.numPoints, force),
            numFaces: model.numFaces,
            faceA: sceneGeometryField(model.faceVertexA, model.numFaces, force),
            faceB: sceneGeometryField(model.faceVertexB, model.numFaces, force),
            faceC: sceneGeometryField(model.faceVertexC, model.numFaces, force),
            faceColourA: sceneGeometryField(faceColourA, model.numFaces, force),
            faceColourB: sceneGeometryField(faceColourB, model.numFaces, force),
            faceColourC: sceneGeometryField(faceColourC, model.numFaces, force),
            faceType: sceneGeometryField(model.faceRenderType, model.numFaces, force),
            faceAlpha: sceneGeometryField(model.faceAlpha, model.numFaces, force),
            facePriority: sceneGeometryField(model.facePriority, model.numFaces, force),
            faceTexture: textureMetadata?.faceTexture ?? null,
            faceTextureA: textureMetadata?.faceTextureA ?? null,
            faceTextureB: textureMetadata?.faceTextureB ?? null,
            faceTextureC: textureMetadata?.faceTextureC ?? null,
        } as any,
        false,
    );
}

export function recordModelLabelMapUpload(geomId: number, model: any, force: boolean = false): void {
    if (!gpuRenderPackets.enabled || (!force && sceneLabelMapUploaded.has(geomId))) {
        return;
    }
    const labels = buildModelSceneVertexLabels(model);
    if (!labels) {
        return;
    }
    if (!force) {
        sceneLabelMapUploaded.add(geomId);
    }
    pushPacket(
        {
            kind: 'modelLabelMapUpload',
            geomId,
            labels: sceneGeometryField(labels, model.numPoints, force),
        } as any,
        false,
    );
}

export function recordModelSkeletonUpload(skeletonId: number, skeleton: any, force: boolean = false): void {
    if (!gpuRenderPackets.enabled || skeletonId <= 0 || !skeleton || (!force && sceneSkeletonUploaded.has(skeletonId))) {
        return;
    }
    if (!skeleton.type || !skeleton.labels) {
        return;
    }
    if (!force) {
        sceneSkeletonUploaded.add(skeletonId);
    }
    pushPacket(
        {
            kind: 'modelSkeletonUpload',
            skeletonId,
            types: skeleton.type,
            labels: skeleton.labels,
        } as any,
        false,
    );
}

export type SceneAnimOpPacket = {
    type: number;
    x: number;
    y: number;
    z: number;
    labels: Uint8Array | number[] | null;
};

export function recordModelAnimFrameUpload(
    animFrameId: number,
    skeletonId: number,
    ops: SceneAnimOpPacket[],
    force: boolean = false,
): void {
    if (!gpuRenderPackets.enabled || animFrameId <= 0 || (!force && sceneAnimFrameUploaded.has(animFrameId))) {
        return;
    }
    if (!force) {
        sceneAnimFrameUploaded.add(animFrameId);
    }
    pushPacket(
        {
            kind: 'modelAnimFrameUpload',
            animFrameId,
            skeletonId,
            ops,
        } as any,
        false,
    );
}

export function isSceneGeometryUploaded(geomId: number): boolean {
    return sceneGeometryUploaded.has(geomId);
}

/// NYM-210 Slice 2: upload a ground tile's world-space mesh once (cached by id).
/// Ground terrain mesh. Hidden faces (12345678) are dropped; the three face
/// colour arrays are preserved so WGSL can interpolate RuneScape Gouraud.
/// The instance projects it with yaw=0 + rel=-camera (world verts → camera-rel).
export function recordGroundGeometryUpload(geomId: number, ground: any): void {
    if (!gpuRenderPackets.enabled || sceneGeometryUploaded.has(geomId)) {
        return;
    }
    sceneGeometryUploaded.add(geomId);
    const nf: number = ground.faceVertexA.length;
    const faceA: number[] = [];
    const faceB: number[] = [];
    const faceC: number[] = [];
    const faceColourA: number[] = [];
    const faceColourB: number[] = [];
    const faceColourC: number[] = [];
    const faceType: number[] = [];
    const faceTexture: number[] = [];
    const faceTextureA: number[] = [];
    const faceTextureB: number[] = [];
    const faceTextureC: number[] = [];
    for (let v = 0; v < nf; v++) {
        const colour = ground.faceColourA[v];
        if (colour === 12345678) {
            continue; // hidden tile face
        }
        faceA.push(ground.faceVertexA[v]);
        faceB.push(ground.faceVertexB[v]);
        faceC.push(ground.faceVertexC[v]);
        faceColourA.push(colour);
        faceColourB.push(ground.faceColourB[v]);
        faceColourC.push(ground.faceColourC[v]);
        const texture = ground.faceTexture && ground.faceTexture[v] !== -1 ? ground.faceTexture[v] | 0 : -1;
        faceType.push(texture >= 0 ? 2 : 0);
        faceTexture.push(texture);
        if (texture >= 0) {
            faceTextureA.push(ground.flat ? 0 : ground.faceVertexA[v]);
            faceTextureB.push(ground.flat ? 1 : ground.faceVertexB[v]);
            faceTextureC.push(ground.flat ? 3 : ground.faceVertexC[v]);
        } else {
            faceTextureA.push(0);
            faceTextureB.push(0);
            faceTextureC.push(0);
        }
    }
    rememberSceneManifestGeometry(
        geomId,
        faceA.length,
        faceColourA,
        faceColourB,
        faceColourC,
        faceType,
        null,
        faceTexture,
    );
    pushPacket(
        {
            kind: 'modelGeometryUpload',
            geomId,
            numPoints: ground.vertexX.length,
            pointX: ground.vertexX,
            pointY: ground.vertexY,
            pointZ: ground.vertexZ,
            numFaces: faceA.length,
            faceA,
            faceB,
            faceC,
            faceColourA,
            faceColourB,
            faceColourC,
            faceType,
            faceAlpha: null,
            facePriority: null,
            faceTexture,
            faceTextureA,
            faceTextureB,
            faceTextureC,
        } as any,
        false,
    );
}

export function recordQuickGroundRegionGeometryUpload(
    geomId: number,
    pointX: number[],
    pointY: number[],
    pointZ: number[],
    faceA: number[],
    faceB: number[],
    faceC: number[],
    faceColourA: number[],
    faceColourB: number[],
    faceColourC: number[],
    faceType?: number[] | null,
    faceTexture?: number[] | null,
    faceTextureA?: number[] | null,
    faceTextureB?: number[] | null,
    faceTextureC?: number[] | null,
): void {
    if (!gpuRenderPackets.enabled || sceneGeometryUploaded.has(geomId)) {
        return;
    }
    sceneGeometryUploaded.add(geomId);
    rememberSceneManifestGeometry(
        geomId,
        faceA.length,
        faceColourA,
        faceColourB,
        faceColourC,
        faceType ?? null,
        null,
        faceTexture ?? null,
    );
    pushPacket(
        {
            kind: 'modelGeometryUpload',
            geomId,
            numPoints: pointX.length,
            pointX,
            pointY,
            pointZ,
            numFaces: faceA.length,
            faceA,
            faceB,
            faceC,
            faceColourA,
            faceColourB,
            faceColourC,
            faceType: faceType ?? null,
            faceAlpha: null,
            facePriority: null,
            faceTexture: faceTexture ?? null,
            faceTextureA: faceTextureA ?? null,
            faceTextureB: faceTextureB ?? null,
            faceTextureC: faceTextureC ?? null,
        } as any,
        false,
    );
}

/// Per-frame instance referencing cached geometry (yaw + world position only).
export function recordSceneInstance(
    geomId: number,
    sinYaw: number,
    cosYaw: number,
    relativeX: number,
    relativeY: number,
    relativeZ: number,
    alpha: number,
    animFrameId: number = 0,
    source: SceneDrawSource = SCENE_DRAW_SOURCE_MODEL,
): void {
    if (!gpuRenderPackets.enabled) {
        return;
    }
    emitSceneGpuDrawRecords(geomId, alpha, source);
    pushPacket(
        {
            kind: 'sceneInstance',
            geomId,
            sinYaw,
            cosYaw,
            relativeX,
            relativeY,
            relativeZ,
            alpha,
            flags: animFrameId > 0 ? 1 : 0,
            animFrameId,
        } as any,
        false,
    );
}

/// Per-frame camera shared by all instances.
export function recordSceneCamera(
    sinEyePitch: number,
    cosEyePitch: number,
    sinEyeYaw: number,
    cosEyeYaw: number,
    originX: number,
    originY: number,
): void {
    if (!gpuRenderPackets.enabled) {
        return;
    }
    // Camera is emitted once per frame at the start of the scene pass, before the
    // per-model geometry/instance emission — so reset the geometry keyframe here so
    // this frame's models re-upload when a keyframe is due.
    maybeResetSceneGeometryKeyframe();
    pushPacket(
        { kind: 'sceneCamera', sinEyePitch, cosEyePitch, sinEyeYaw, cosEyeYaw, originX, originY } as any,
        false,
    );
}

/// Global light for GPU gouraud lighting (consumed once GPU lighting lands).
export function recordSceneLight(
    ambient: number,
    contrast: number,
    lightX: number,
    lightY: number,
    lightZ: number,
): void {
    if (!gpuRenderPackets.enabled) {
        return;
    }
    pushPacket({ kind: 'sceneLight', ambient, contrast, lightX, lightY, lightZ } as any, false);
}

export const gpuRenderPackets: GpuRenderPacketState = {
    enabled: readInitialEnabled(),
    skipCpuRasterWrites: false,
    modelGouraudTriangles: false,
    sceneInstanceMode: readInitialSceneInstanceMode(),
    cpuRasterWriteBypasses: 0,
    packets,
    maxPackets: readInitialMaxPackets(),
    dropped: 0,
    get currentSurface(): number {
        return currentSurface;
    },
    get surfaces(): SurfaceInfo[] {
        return surfaces;
    },
    reset(): void {
        for (const surface of nativeRetainedWarmupSurfaces) {
            nativeRetainedReadySurfaces.add(surface);
        }
        nativeRetainedWarmupSurfaces.clear();
        packets.length = 0;
        deferredSurfacePackets.length = 0;
        deferredSurfaceIds.clear();
        sceneCpuDrawRecords.length = 0;
        sceneGpuDrawRecords.length = 0;
        frameSurfacePacketCounts.clear();
        framePresentKeys.clear();
        this.dropped = 0;
        this.cpuRasterWriteBypasses = 0;
    },
    discard(count: number): void {
        if (count <= 0) {
            return;
        }

        if (count >= packets.length) {
            packets.length = 0;
            for (const surface of nativeRetainedWarmupSurfaces) {
                nativeRetainedReadySurfaces.add(surface);
            }
            nativeRetainedWarmupSurfaces.clear();
            return;
        }

        packets.splice(0, count);
    },
    discardSurface(surface: number): void {
        for (let i = packets.length - 1; i >= 0; i--) {
            if (packets[i].surface === surface) {
                packets.splice(i, 1);
            }
        }
    },
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    },
    setSceneInstanceMode(enabled: boolean): void {
        this.sceneInstanceMode = enabled;
    },
    shouldEmitSceneInstances(): boolean {
        return this.enabled && this.sceneInstanceMode;
    },
    markCurrentSurfaceRecordable(): void {
        if (currentSurface !== 0) {
            recordableSurfaces.add(currentSurface);
        }
    },
    markSurfaceRecordable(pixels: Int32Array, width: number, height: number): number {
        const surface = getSurfaceId(pixels, width, height);
        recordableSurfaces.add(surface);
        return surface;
    },
    setSkipCpuRasterWrites(enabled: boolean): void {
        this.skipCpuRasterWrites = enabled;
    },
    markCurrentSurfaceCpuRasterWritesSkippable(): void {
        if (currentSurface !== 0) {
            recordableSurfaces.add(currentSurface);
            cpuRasterWriteSkipSurfaces.add(currentSurface);
        }
    },
    markSurfaceCpuRasterWritesSkippable(pixels: Int32Array, width: number, height: number): number {
        const surface = getSurfaceId(pixels, width, height);
        recordableSurfaces.add(surface);
        cpuRasterWriteSkipSurfaces.add(surface);
        return surface;
    },
    recordSurfacePresent(pixels: Int32Array, width: number, height: number, x: number, y: number): void {
        if (!this.enabled) {
            return;
        }
        const surface = getSurfaceId(pixels, width, height);
        recordableSurfaces.add(surface);
        const hasFreshSurfacePackets = (frameSurfacePacketCounts.get(surface) ?? 0) > 0;
        const retained = retainedSurfacePackets.get(surface);
        if (retained && retained.length > 0) {
            const canReplaySmallBase = retained.length <= MAX_RETAINED_BASE_PACKETS;
            const canSourceReplay = !NATIVE_RETAINED_PRESENT_ONLY && retained.length <= MAX_SOURCE_REPLAY_PACKETS;
            if (!retainedSurfaceBasePackets.has(surface) && canReplaySmallBase) {
                retainedSurfaceBasePackets.set(surface, retained.slice());
            }
            if (isMinimapChromePresent(x, y, width, height)) {
                if (canReplaySmallBase && !deferredSurfaceIds.has(surface)) {
                    replayRetainedSurfacePresent(deferredSurfacePackets, surface, width, height, x, y, retained);
                    deferredSurfaceIds.add(surface);
                }
            } else if (NATIVE_RETAINED_PRESENT_ONLY && !hasFreshSurfacePackets && !nativeRetainedReadySurfaces.has(surface) && retained.length <= MAX_SOURCE_REPLAY_PACKETS) {
                replayRetainedSurface(packets, surface, width, height, retained);
                noteNativeRetainedSurfaceWarmup(surface);
            } else if (canSourceReplay && !hasFreshSurfacePackets) {
                const replay: GpuRenderPacket[] = [];
                replayRetainedSurface(replay, surface, width, height, retained);
                for (const packet of replay) {
                    pushPacket(packet, false);
                }
            }
        }
        if (hasFreshSurfacePackets) {
            noteNativeRetainedSurfaceWarmup(surface);
        }
        noteRetainedPresent(surface, x, y, width, height);
        pushPacket({ kind: 'presentSurface', surface, x, y, width, height });
    },
    setModelGouraudTriangles(enabled: boolean): void {
        this.modelGouraudTriangles = enabled;
    },
    clearCpuRasterWriteSkipSurfaces(): void {
        cpuRasterWriteSkipSurfaces.clear();
    },
    shouldSkipCpuRasterWrites(): boolean {
        return this.enabled && this.skipCpuRasterWrites && currentSurface !== 0 && cpuRasterWriteSkipSurfaces.has(currentSurface);
    },
    shouldRecordModelGouraudTriangles(): boolean {
        return this.shouldSkipCpuRasterWrites() && this.modelGouraudTriangles;
    },
    recordCpuRasterWriteBypass(): void {
        this.cpuRasterWriteBypasses++;
    },
    snapshot(): GpuRenderPacketSnapshot {
        const snapshotPackets = deferredSurfacePackets.length > 0 ? packets.concat(deferredSurfacePackets) : packets.slice();
        appendMissingRetainedPresents(snapshotPackets);
        return {
            enabled: this.enabled,
            skipCpuRasterWrites: this.skipCpuRasterWrites,
            cpuRasterWriteBypasses: this.cpuRasterWriteBypasses,
            packets: snapshotPackets,
            packetCount: snapshotPackets.length,
            dropped: this.dropped,
            currentSurface,
            surfaces: surfaces.slice(),
            recordableSurfaces: Array.from(recordableSurfaces),
            cpuRasterWriteSkipSurfaces: Array.from(cpuRasterWriteSkipSurfaces),
            spriteResources: spriteResources.slice(),
            colourTableResource,
            textureResources: textureResources.slice(),
            indexedSpriteResources: indexedSpriteResources.slice(),
            glyphResources: glyphResources.slice(),
            sceneCpuDrawRecords: sceneCpuDrawRecords.slice(),
            sceneGpuDrawRecords: sceneGpuDrawRecords.slice()
        };
    }
};

if (typeof window !== 'undefined') {
    window.__rsSdkGpuRenderPackets = gpuRenderPackets;
}

export function recordSurfaceTarget(pixels: Int32Array, width: number, height: number): void {
    if (!gpuRenderPackets.enabled) {
        currentSurface = getSurfaceId(pixels, width, height);
        return;
    }

    currentSurface = getSurfaceId(pixels, width, height);
    if (!shouldRecordCurrentSurface()) {
        return;
    }

    pushPacket({ kind: 'surface', surface: currentSurface, width, height });
}

export function getGpuRenderSurfaceId(pixels: Int32Array, width: number, height: number): number {
    return getSurfaceId(pixels, width, height);
}

export function recordClip(minX: number, minY: number, maxX: number, maxY: number): void {
    if (!gpuRenderPackets.enabled || !shouldRecordCurrentSurface()) {
        return;
    }

    pushPacket({ kind: 'clip', surface: currentSurface, clip: makeClip(minX, minY, maxX, maxY) });
}

export function recordClear(): void {
    if (!gpuRenderPackets.enabled || !shouldRecordCurrentSurface()) {
        return;
    }

    pushPacket({ kind: 'clear', surface: currentSurface });
}

export function recordUnsupported(reason: string): void {
    if (!gpuRenderPackets.enabled || !shouldRecordCurrentSurface()) {
        return;
    }

    pushPacket({ kind: 'unsupported', surface: currentSurface, reason });
}

export function recordFillRect(x: number, y: number, width: number, height: number, rgb: number, alpha: number | null = null): void {
    if (!gpuRenderPackets.enabled || !shouldRecordCurrentSurface()) {
        return;
    }

    pushPacket({ kind: 'fillRect', surface: currentSurface, x, y, width, height, rgb, alpha });
}

export function recordLine(axis: 'h' | 'v', x: number, y: number, length: number, rgb: number, alpha: number | null = null): void {
    if (!gpuRenderPackets.enabled || !shouldRecordCurrentSurface()) {
        return;
    }

    pushPacket({ kind: 'line', surface: currentSurface, axis, x, y, length, rgb, alpha });
}

export function recordFillCircle(xCenter: number, yCenter: number, yRadius: number, rgb: number, alpha: number): void {
    if (!gpuRenderPackets.enabled || !shouldRecordCurrentSurface()) {
        return;
    }

    pushPacket({ kind: 'fillCircle', surface: currentSurface, xCenter, yCenter, yRadius, rgb, alpha });
}

export function recordRgbaSprite(
    key: object,
    variant: string,
    width: number,
    height: number,
    makeRgba: () => Uint8Array,
    x: number,
    y: number,
    drawWidth: number,
    drawHeight: number,
    srcX: number,
    srcY: number,
    srcWidth: number,
    srcHeight: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    alpha: number | null = null
): void {
    if (!gpuRenderPackets.enabled || !shouldRecordCurrentSurface()) {
        return;
    }

    const resource = getSpriteResource(key, variant) ?? setSpriteResource(key, variant, width, height, makeRgba(), false);

    pushPacket({
        kind: 'rgbaSprite',
        surface: currentSurface,
        resource,
        x,
        y,
        width: drawWidth,
        height: drawHeight,
        srcX,
        srcY,
        srcWidth,
        srcHeight,
        alpha,
        clip: makeClip(minX, minY, maxX, maxY)
    });
}

export function recordDynamicIndexedSprite(
    key: object,
    variant: string,
    width: number,
    height: number,
    intensities: ArrayLike<number>,
    palette: Int32Array,
    lineOffsets: ArrayLike<number>,
    mode: 'direct' | 'titleFlameLeft' | 'titleFlameRight',
    x: number,
    y: number,
    drawWidth: number,
    drawHeight: number,
    srcX: number,
    srcY: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
): void {
    if (!gpuRenderPackets.enabled || !shouldRecordCurrentSurface()) {
        return;
    }

    const resource = setIndexedSpriteResource(
        key,
        variant,
        width,
        height,
        makeIntensityRgba(intensities, width, height),
        makePaletteRgba(palette),
        makeLineOffsetRgba(lineOffsets)
    );

    pushPacket({
        kind: 'indexedSprite',
        surface: currentSurface,
        resource,
        x,
        y,
        width: drawWidth,
        height: drawHeight,
        srcX,
        srcY,
        mode,
        clip: makeClip(minX, minY, maxX, maxY)
    });
}

export function recordGlyphSprite(
    key: object,
    variant: string,
    width: number,
    height: number,
    mask: Int8Array,
    x: number,
    y: number,
    drawWidth: number,
    drawHeight: number,
    srcX: number,
    srcY: number,
    rgb: number,
    alpha: number | null,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
): void {
    if (!gpuRenderPackets.enabled || !shouldRecordCurrentSurface()) {
        return;
    }

    const resource = getGlyphResource(key, variant) ?? setGlyphResource(key, variant, width, height, makeGlyphMaskRgba(mask, width, height));

    pushPacket({
        kind: 'glyphSprite',
        surface: currentSurface,
        resource,
        x,
        y,
        width: drawWidth,
        height: drawHeight,
        srcX,
        srcY,
        rgb,
        alpha,
        clip: makeClip(minX, minY, maxX, maxY)
    });
}

export function recordTransformSprite(
    key: object,
    variant: string,
    width: number,
    height: number,
    makeRgba: () => Uint8Array,
    x: number,
    y: number,
    drawWidth: number,
    drawHeight: number,
    startX: number,
    startY: number,
    stepX: number,
    stepY: number,
    rowStepX: number,
    rowStepY: number,
    sourceStride: number,
    transparentZero: boolean,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
): void {
    if (!gpuRenderPackets.enabled || !shouldRecordCurrentSurface()) {
        return;
    }

    const resource = getSpriteResource(key, variant) ?? setSpriteResource(key, variant, width, height, makeRgba(), false);

    pushPacket({
        kind: 'transformSprite',
        surface: currentSurface,
        resource,
        x,
        y,
        width: drawWidth,
        height: drawHeight,
        startX,
        startY,
        stepX,
        stepY,
        rowStepX,
        rowStepY,
        sourceStride,
        transparentZero,
        clip: makeClip(minX, minY, maxX, maxY)
    });
}

export function recordMaskedSprite(
    key: object,
    variant: string,
    width: number,
    height: number,
    makeRgba: () => Uint8Array,
    maskKey: object,
    maskVariant: string,
    maskWidth: number,
    maskHeight: number,
    makeMaskRgba: () => Uint8Array,
    x: number,
    y: number,
    drawWidth: number,
    drawHeight: number,
    srcX: number,
    srcY: number,
    maskStride: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
): void {
    if (!gpuRenderPackets.enabled || !shouldRecordCurrentSurface()) {
        return;
    }

    const resource = getSpriteResource(key, variant) ?? setSpriteResource(key, variant, width, height, makeRgba(), false);
    const maskResource = getSpriteResource(maskKey, maskVariant) ?? setSpriteResource(maskKey, maskVariant, maskWidth, maskHeight, makeMaskRgba(), false);

    pushPacket({
        kind: 'maskedSprite',
        surface: currentSurface,
        resource,
        maskResource,
        x,
        y,
        width: drawWidth,
        height: drawHeight,
        srcX,
        srcY,
        maskStride,
        clip: makeClip(minX, minY, maxX, maxY)
    });
}

export function recordColourTable(colourTable: Int32Array, version: number): void {
    if (colourTableResource?.version === version) {
        return;
    }

    colourTableResource = {
        width: 256,
        height: 256,
        rgba: makeColourTableRgba(colourTable),
        version
    };
    invalidateNativeRetainedReadySurfaces();
}

export function recordTextureResource(id: number, indices: Int8Array, width: number, height: number, palette: Int32Array, version: number): void {
    const existing = textureResources.find(item => item.id === id);
    if (existing) {
        if (existing.version !== version) {
            existing.width = width;
            existing.height = height;
            existing.indexRgba = makeTextureIndexRgba(indices, width, height);
            existing.paletteRgba = makePaletteRgba(palette);
            existing.version = version;
            invalidateNativeRetainedReadySurfaces();
        }
        return;
    }

    textureResources.push({
        id,
        width,
        height,
        indexRgba: makeTextureIndexRgba(indices, width, height),
        paletteRgba: makePaletteRgba(palette),
        version
    });
}

export function recordGouraudTriangle(
    xA: number, xB: number, xC: number,
    yA: number, yB: number, yC: number,
    colourA: number, colourB: number, colourC: number,
    gpuRasterize: boolean,
    lowDetail: boolean,
    hclip: boolean,
    alpha: number,
    minX: number, minY: number, maxX: number, maxY: number
): void {
    if (!gpuRenderPackets.enabled || !shouldRecordCurrentSurface()) {
        return;
    }

    pushPacket({
        kind: 'triangleGouraud',
        surface: currentSurface,
        retainedKey: retainedGouraudTriangleKey(
            currentSurface,
            xA, xB, xC,
            yA, yB, yC,
            colourA, colourB, colourC,
            gpuRasterize,
            lowDetail,
            hclip,
            alpha,
            minX, minY, maxX, maxY
        ),
        xA,
        xB,
        xC,
        yA,
        yB,
        yC,
        colourA,
        colourB,
        colourC,
        gpuRasterize,
        lowDetail,
        hclip,
        alpha,
        clip: makeClip(minX, minY, maxX, maxY)
    });
}

export function recordFlatTriangle(
    xA: number, xB: number, xC: number,
    yA: number, yB: number, yC: number,
    colour: number,
    gpuRasterize: boolean,
    alpha: number,
    minX: number, minY: number, maxX: number, maxY: number
): void {
    if (!gpuRenderPackets.enabled || !shouldRecordCurrentSurface()) {
        return;
    }

    pushPacket({
        kind: 'triangleFlat',
        surface: currentSurface,
        retainedKey: retainedFlatTriangleKey(
            currentSurface,
            xA, xB, xC,
            yA, yB, yC,
            colour,
            gpuRasterize,
            alpha,
            minX, minY, maxX, maxY
        ),
        xA,
        xB,
        xC,
        yA,
        yB,
        yC,
        colour,
        gpuRasterize,
        alpha,
        clip: makeClip(minX, minY, maxX, maxY)
    });
}

export function recordTextureTriangle(
    xA: number, xB: number, xC: number,
    yA: number, yB: number, yC: number,
    shadeA: number, shadeB: number, shadeC: number,
    originX: number, originY: number, originZ: number,
    txB: number, txC: number,
    tyB: number, tyC: number,
    tzB: number, tzC: number,
    texture: number,
    hasTexels: boolean,
    lowDetail: boolean,
    lowMem: boolean,
    opaque: boolean,
    gpuRasterize: boolean,
    hclip: boolean,
    screenOriginX: number,
    screenOriginY: number,
    minX: number, minY: number, maxX: number, maxY: number
): void {
    if (!gpuRenderPackets.enabled || !shouldRecordCurrentSurface()) {
        return;
    }

    pushPacket({
        kind: 'triangleTexture',
        surface: currentSurface,
        retainedKey: retainedTextureTriangleKey(
            currentSurface,
            xA, xB, xC,
            yA, yB, yC,
            shadeA, shadeB, shadeC,
            originX, originY, originZ,
            txB, txC,
            tyB, tyC,
            tzB, tzC,
            texture,
            hasTexels,
            lowDetail,
            lowMem,
            opaque,
            gpuRasterize,
            hclip,
            screenOriginX,
            screenOriginY,
            minX, minY, maxX, maxY
        ),
        xA,
        xB,
        xC,
        yA,
        yB,
        yC,
        shadeA,
        shadeB,
        shadeC,
        originX,
        originY,
        originZ,
        txB,
        txC,
        tyB,
        tyC,
        tzB,
        tzC,
        texture,
        hasTexels,
        lowDetail,
        lowMem,
        opaque,
        gpuRasterize,
        hclip,
        screenOriginX,
        screenOriginY,
        clip: makeClip(minX, minY, maxX, maxY)
    });
}

export function recordModelFlatTriangle(
    xA: number, yA: number, zA: number,
    xB: number, yB: number, zB: number,
    xC: number, yC: number, zC: number,
    sinYaw: number,
    cosYaw: number,
    sinEyePitch: number,
    cosEyePitch: number,
    sinEyeYaw: number,
    cosEyeYaw: number,
    relativeX: number,
    relativeY: number,
    relativeZ: number,
    originX: number,
    originY: number,
    rgb: number,
    alpha: number,
    minX: number, minY: number, maxX: number, maxY: number
): void {
    if (!gpuRenderPackets.enabled || !shouldRecordCurrentSurface()) {
        return;
    }

    pushPacket({
        kind: 'modelFlatTriangle',
        surface: currentSurface,
        retainedKey: retainedModelFlatTriangleKey(
            currentSurface,
            xA, yA, zA,
            xB, yB, zB,
            xC, yC, zC,
            sinYaw,
            cosYaw,
            sinEyePitch,
            cosEyePitch,
            sinEyeYaw,
            cosEyeYaw,
            relativeX,
            relativeY,
            relativeZ,
            originX,
            originY,
            rgb,
            alpha,
            minX, minY, maxX, maxY
        ),
        xA,
        yA,
        zA,
        xB,
        yB,
        zB,
        xC,
        yC,
        zC,
        sinYaw,
        cosYaw,
        sinEyePitch,
        cosEyePitch,
        sinEyeYaw,
        cosEyeYaw,
        relativeX,
        relativeY,
        relativeZ,
        originX,
        originY,
        rgb,
        alpha,
        clip: makeClip(minX, minY, maxX, maxY)
    });
}

export function recordModelGouraudTriangle(
    xA: number, yA: number, zA: number,
    xB: number, yB: number, zB: number,
    xC: number, yC: number, zC: number,
    sinYaw: number,
    cosYaw: number,
    sinEyePitch: number,
    cosEyePitch: number,
    sinEyeYaw: number,
    cosEyeYaw: number,
    relativeX: number,
    relativeY: number,
    relativeZ: number,
    originX: number,
    originY: number,
    colourA: number,
    colourB: number,
    colourC: number,
    alpha: number,
    lowDetail: boolean,
    hclip: boolean,
    minX: number, minY: number, maxX: number, maxY: number
): void {
    if (!gpuRenderPackets.enabled || !shouldRecordCurrentSurface()) {
        return;
    }

    pushPacket({
        kind: 'modelGouraudTriangle',
        surface: currentSurface,
        retainedKey: retainedModelGouraudTriangleKey(
            currentSurface,
            xA, yA, zA,
            xB, yB, zB,
            xC, yC, zC,
            sinYaw,
            cosYaw,
            sinEyePitch,
            cosEyePitch,
            sinEyeYaw,
            cosEyeYaw,
            relativeX,
            relativeY,
            relativeZ,
            originX,
            originY,
            colourA,
            colourB,
            colourC,
            alpha,
            lowDetail,
            hclip,
            minX, minY, maxX, maxY
        ),
        xA,
        yA,
        zA,
        xB,
        yB,
        zB,
        xC,
        yC,
        zC,
        sinYaw,
        cosYaw,
        sinEyePitch,
        cosEyePitch,
        sinEyeYaw,
        cosEyeYaw,
        relativeX,
        relativeY,
        relativeZ,
        originX,
        originY,
        colourA,
        colourB,
        colourC,
        alpha,
        lowDetail,
        hclip,
        clip: makeClip(minX, minY, maxX, maxY)
    });
}
