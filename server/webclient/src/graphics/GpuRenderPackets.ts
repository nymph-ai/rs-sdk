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

type PacketBase = {
    surface: number;
};

export type GpuRenderPacket =
    | (PacketBase & { kind: 'surface'; width: number; height: number })
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
};

export type GpuRenderPacketState = {
    enabled: boolean;
    skipCpuRasterWrites: boolean;
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
    clearCpuRasterWriteSkipSurfaces(): void;
    shouldSkipCpuRasterWrites(): boolean;
    recordCpuRasterWriteBypass(): void;
    snapshot(): GpuRenderPacketSnapshot;
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
let nextSurface = 1;
let nextSpriteResource = 1;
let nextIndexedSpriteResource = 1;
let nextGlyphResource = 1;
let currentSurface = 0;

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

function pushPacket(packet: GpuRenderPacket): void {
    if (gpuRenderPackets.maxPackets <= 0 || packets.length < gpuRenderPackets.maxPackets) {
        packets.push(packet);
    } else {
        gpuRenderPackets.dropped++;
    }
}

function shouldRecordCurrentSurface(): boolean {
    return currentSurface !== 0 && recordableSurfaces.has(currentSurface);
}

function getSpriteResource(key: object, variant: string): number | null {
    return spriteResourceIds.get(key)?.get(variant) ?? null;
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
            existing.width = width;
            existing.height = height;
            existing.rgba = rgba;
            existing.version++;
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
        existing.width = width;
        existing.height = height;
        existing.intensityRgba = intensityRgba;
        existing.paletteRgba = paletteRgba;
        existing.lineOffsetRgba = lineOffsetRgba;
        existing.version++;
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

export const gpuRenderPackets: GpuRenderPacketState = {
    enabled: readInitialEnabled(),
    skipCpuRasterWrites: false,
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
        packets.length = 0;
        this.dropped = 0;
        this.cpuRasterWriteBypasses = 0;
    },
    discard(count: number): void {
        if (count <= 0) {
            return;
        }

        if (count >= packets.length) {
            packets.length = 0;
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
    clearCpuRasterWriteSkipSurfaces(): void {
        cpuRasterWriteSkipSurfaces.clear();
    },
    shouldSkipCpuRasterWrites(): boolean {
        return this.enabled && this.skipCpuRasterWrites && currentSurface !== 0 && cpuRasterWriteSkipSurfaces.has(currentSurface);
    },
    recordCpuRasterWriteBypass(): void {
        this.cpuRasterWriteBypasses++;
    },
    snapshot(): GpuRenderPacketSnapshot {
        return {
            enabled: this.enabled,
            skipCpuRasterWrites: this.skipCpuRasterWrites,
            cpuRasterWriteBypasses: this.cpuRasterWriteBypasses,
            packets: packets.slice(),
            packetCount: packets.length,
            dropped: this.dropped,
            currentSurface,
            surfaces: surfaces.slice(),
            recordableSurfaces: Array.from(recordableSurfaces),
            cpuRasterWriteSkipSurfaces: Array.from(cpuRasterWriteSkipSurfaces),
            spriteResources: spriteResources.slice(),
            colourTableResource,
            textureResources: textureResources.slice(),
            indexedSpriteResources: indexedSpriteResources.slice(),
            glyphResources: glyphResources.slice()
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
