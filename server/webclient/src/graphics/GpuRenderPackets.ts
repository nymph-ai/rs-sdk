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
          opaque: boolean;
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
const packets: GpuRenderPacket[] = [];
const surfaces: SurfaceInfo[] = [];
const spriteResources: GpuSpriteResource[] = [];
const recordableSurfaces = new Set<number>();
const cpuRasterWriteSkipSurfaces = new Set<number>();
let nextSurface = 1;
let nextSpriteResource = 1;
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
            spriteResources: spriteResources.slice()
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

export function recordDynamicRgbaSprite(
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
    maxY: number
): void {
    if (!gpuRenderPackets.enabled || !shouldRecordCurrentSurface()) {
        return;
    }

    const rgba = makeRgba().slice();
    const resource = setSpriteResource(key, variant, width, height, rgba, true);

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
        alpha: null,
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

export function recordGouraudTriangle(
    xA: number, xB: number, xC: number,
    yA: number, yB: number, yC: number,
    colourA: number, colourB: number, colourC: number,
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
        clip: makeClip(minX, minY, maxX, maxY)
    });
}

export function recordFlatTriangle(
    xA: number, xB: number, xC: number,
    yA: number, yB: number, yC: number,
    colour: number,
    gpuRasterize: boolean,
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
    opaque: boolean,
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
        opaque,
        clip: makeClip(minX, minY, maxX, maxY)
    });
}
