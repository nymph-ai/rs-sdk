import { gpuRenderPackets, recordDynamicIndexedSprite, recordModelFlatTriangle } from '#/graphics/GpuRenderPackets.js';
import Pix2D from '#/graphics/Pix2D.js';
import Pix8 from '#/graphics/Pix8.js';
import Pix32 from '#/graphics/Pix32.js';
import PixFont from '#/graphics/PixFont.js';
import Pix3D from '#/dash3d/Pix3D.js';
import WebGpuFramePresenter, { type WebGpuFrameValidationStats, type WebGpuPacketReplayStats } from '#/graphics/WebGpuFramePresenter.js';

type ValidationResult = {
    name: string;
    passed: boolean;
    stats: WebGpuFrameValidationStats | null;
    packetReplayStats: WebGpuPacketReplayStats | null;
    evidence?: Record<string, number>;
};

const validationDynamicSpriteKey = {};

declare global {
    interface Window {
        __rsSdkRendererValidation?: {
            done: boolean;
            passed: boolean;
            results: ValidationResult[];
            error?: string;
        };
    }
}

function makeCanvas(id: string, width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.id = id;
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.imageRendering = 'pixelated';
    return canvas;
}

function makeFrame(width: number, height: number, seed: number): ImageData {
    const imageData = new ImageData(width, height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const checker = ((x >> 4) ^ (y >> 4) ^ seed) & 1;
            imageData.data[i] = (x * 3 + seed * 17) & 0xff;
            imageData.data[i + 1] = checker ? 0xd0 : (y * 5 + seed * 29) & 0xff;
            imageData.data[i + 2] = checker ? (x + y + seed * 11) & 0xff : 0x30;
            imageData.data[i + 3] = 0xff;
        }
    }
    return imageData;
}

function pixelsToImageData(pixels: Int32Array, width: number, height: number): ImageData {
    const imageData = new ImageData(width, height);
    const paint = new Uint32Array(imageData.data.buffer);
    const len = pixels.length;

    for (let i = 0; i < len; i++) {
        const pixel = pixels[i];
        paint[i] = ((pixel & 0xff0000) >> 16) | (pixel & 0xff00) | ((pixel & 0xff) << 16) | 0xff000000;
    }

    return imageData;
}

function makeDynamicValidationSprite(seed: number): { intensities: Uint8Array; palette: Int32Array; lineOffsets: Int32Array } {
    const spriteWidth = 12;
    const spriteHeight = 10;
    const intensities = new Uint8Array(spriteWidth * spriteHeight);
    const palette = new Int32Array(256);
    const lineOffsets = new Int32Array(256);

    for (let i = 1; i < palette.length; i++) {
        palette[i] = (((0x30 + i * 3 + seed * 17) & 0xff) << 16) | (((0x70 + i * 5 + seed * 19) & 0xff) << 8) | ((0xc0 + i * 7 + seed * 23) & 0xff);
    }

    for (let y = 0; y < spriteHeight; y++) {
        for (let x = 0; x < spriteWidth; x++) {
            if (((x + y + seed) & 3) === 0) {
                continue;
            }

            intensities[x + y * spriteWidth] = (0x40 + x * 11 + y * 13 + seed * 17) & 0xff;
        }
    }

    return { intensities, palette, lineOffsets };
}

function blendRgb(src: number, dst: number, alpha: number): number {
    const invAlpha = 256 - alpha;
    return ((((src & 0xff00ff) * alpha + (dst & 0xff00ff) * invAlpha) & 0xff00ff00) + (((src & 0xff00) * alpha + (dst & 0xff00) * invAlpha) & 0xff0000)) >> 8;
}

function plotDynamicValidationSprite(seed: number, x: number, y: number): void {
    const spriteWidth = 12;
    const spriteHeight = 10;
    const { intensities, palette, lineOffsets } = makeDynamicValidationSprite(seed);
    recordDynamicIndexedSprite(
        validationDynamicSpriteKey,
        'validation-dynamic-indexed-sprite',
        spriteWidth,
        spriteHeight,
        intensities,
        palette,
        lineOffsets,
        'direct',
        x,
        y,
        spriteWidth,
        spriteHeight,
        0,
        0,
        Pix2D.clipMinX,
        Pix2D.clipMinY,
        Pix2D.clipMaxX,
        Pix2D.clipMaxY
    );
    if (gpuRenderPackets.shouldSkipCpuRasterWrites()) {
        gpuRenderPackets.recordCpuRasterWriteBypass();
        return;
    }

    for (let yy = 0; yy < spriteHeight; yy++) {
        const dstY = y + yy;
        if (dstY < Pix2D.clipMinY || dstY >= Pix2D.clipMaxY) {
            continue;
        }

        for (let xx = 0; xx < spriteWidth; xx++) {
            const dstX = x + xx;
            if (dstX < Pix2D.clipMinX || dstX >= Pix2D.clipMaxX) {
                continue;
            }

            const alpha = intensities[xx + yy * spriteWidth];
            if (alpha === 0) {
                continue;
            }

            const dstOffset = dstX + dstY * Pix2D.width;
            Pix2D.pixels[dstOffset] = blendRgb(palette[alpha], Pix2D.pixels[dstOffset], alpha);
        }
    }
}

function projectModelPoint(x: number, y: number, z: number, relativeX: number, relativeY: number, relativeZ: number): { x: number; y: number } {
    const viewX = x + relativeX;
    const viewY = y + relativeY;
    const viewZ = z + relativeZ;
    return {
        x: Pix3D.originX + (((viewX << 9) / viewZ) | 0),
        y: Pix3D.originY + (((viewY << 9) / viewZ) | 0)
    };
}

function plotModelFlatValidationTriangle(): void {
    const relativeX = 20;
    const relativeY = 8;
    const relativeZ = 320;
    const xA = -24;
    const yA = -16;
    const zA = 0;
    const xB = 26;
    const yB = -10;
    const zB = 0;
    const xC = 0;
    const yC = 28;
    const zC = 0;
    const rgb = 0x30e0a0;
    if (gpuRenderPackets.shouldSkipCpuRasterWrites()) {
        recordModelFlatTriangle(
            xA, yA, zA,
            xB, yB, zB,
            xC, yC, zC,
            0,
            65536,
            0,
            65536,
            0,
            65536,
            relativeX,
            relativeY,
            relativeZ,
            Pix3D.originX,
            Pix3D.originY,
            rgb,
            256,
            Pix2D.clipMinX,
            Pix2D.clipMinY,
            Pix2D.clipMaxX,
            Pix2D.clipMaxY
        );
        gpuRenderPackets.recordCpuRasterWriteBypass();
        return;
    }

    const a = projectModelPoint(xA, yA, zA, relativeX, relativeY, relativeZ);
    const b = projectModelPoint(xB, yB, zB, relativeX, relativeY, relativeZ);
    const c = projectModelPoint(xC, yC, zC, relativeX, relativeY, relativeZ);
    Pix3D.flatTriangle(a.x, b.x, c.x, a.y, b.y, c.y, rgb);
}

function makePacketReplayFrame(width: number, height: number, skipCpuRasterWrites: boolean = false, dynamicSeed: number = 0): ImageData {
    const pixels = new Int32Array(width * height);
    Pix2D.setPixels(pixels, width, height);
    if (skipCpuRasterWrites) {
        gpuRenderPackets.markCurrentSurfaceCpuRasterWritesSkippable();
    }

    Pix2D.cls();
    Pix2D.fillRect(8, 6, 42, 21, 0x2448c8);
    Pix2D.hline(5, 54, 76, 0xffaa00);
    Pix2D.vline(96, 11, 72, 0x00dd88);
    Pix2D.setClipping(24, 20, 112, 82);
    Pix2D.fillRect(0, 0, 140, 104, 0x8a24a8);
    Pix2D.hline(18, 33, 108, 0xffffff);
    Pix2D.fillRectTrans(36, 28, 52, 24, 0x004080, 128);
    Pix2D.hlineTrans(26, 46, 84, 0x80c000, 128);
    Pix2D.vlineTrans(76, 24, 54, 0xc04000, 128);
    Pix2D.resetClipping();
    Pix2D.fillCircle(124, 38, 18, 0x2080e0, 128);
    Pix2D.fillRect(width - 30, height - 18, 50, 30, 0x102030);

    Pix3D.setRenderClipping();
    Pix3D.hclip = false;
    Pix3D.lowDetail = true;
    Pix3D.trans = 0;
    for (let i = 0; i < 256; i++) {
        Pix3D.colourTable[i] = ((i * 3) & 0xff) << 16 | ((i * 5) & 0xff) << 8 | ((i * 7) & 0xff);
    }
    Pix3D.flatTriangle(114, 146, 128, 58, 62, 78, 0x50b0e0);
    Pix3D.gouraudTriangle(18, 48, 34, 62, 66, 82, 24, 96, 168);

    const texturePalette = new Int32Array(64);
    for (let i = 1; i < texturePalette.length; i++) {
        texturePalette[i] = ((i * 29) & 0xff) << 16 | ((i * 47) & 0xff) << 8 | ((i * 71) & 0xff);
    }
    const texture = new Pix8(128, 128, texturePalette);
    for (let yy = 0; yy < texture.hi; yy++) {
        for (let xx = 0; xx < texture.wi; xx++) {
            texture.data[xx + yy * texture.wi] = (((xx >> 4) + (yy >> 4)) % 63) + 1;
        }
    }
    Pix3D.clearTexels();
    Pix3D.initPool(1);
    Pix3D.textures[0] = texture;
    Pix3D.texPal[0] = texturePalette;
    Pix3D.numTextures = Math.max(Pix3D.numTextures, 1);
    Pix3D.textureTriangle(
        82, 118, 98,
        84, 88, 106,
        96, 160, 224,
        64, 64, 96,
        128, 64,
        64, 128,
        96, 96,
        0
    );

    const transparentPalette = new Int32Array(16);
    for (let i = 1; i < transparentPalette.length; i++) {
        transparentPalette[i] = ((0x20 + i * 17) & 0xff) << 16 | ((0x60 + i * 31) & 0xff) << 8 | ((0xa0 + i * 13) & 0xff);
    }
    const transparentTexture = new Pix8(128, 128, transparentPalette);
    for (let yy = 0; yy < transparentTexture.hi; yy++) {
        for (let xx = 0; xx < transparentTexture.wi; xx++) {
            transparentTexture.data[xx + yy * transparentTexture.wi] = ((xx + yy) & 7) === 0 ? 0 : (((xx >> 3) + (yy >> 3)) % 15) + 1;
        }
    }
    Pix3D.textures[1] = transparentTexture;
    Pix3D.texPal[1] = transparentPalette;
    Pix3D.numTextures = Math.max(Pix3D.numTextures, 2);
    Pix3D.textureTriangle(
        8, 42, 24,
        14, 20, 48,
        80, 144, 208,
        64, 64, 96,
        128, 64,
        64, 128,
        96, 96,
        1
    );

    const indexedSprite = new Pix8(8, 8, Int32Array.of(0, 0xff2020, 0x20ff20, 0x2020ff));
    for (let i = 0; i < indexedSprite.data.length; i++) {
        indexedSprite.data[i] = i % 3 === 0 ? 0 : ((i % 3) + 1);
    }
    indexedSprite.plotSprite(14, 86);
    indexedSprite.scalePlotSprite(102, 84, 16, 12);

    const rgbSprite = new Pix32(10, 8);
    for (let y = 0; y < rgbSprite.hi; y++) {
        for (let x = 0; x < rgbSprite.wi; x++) {
            rgbSprite.data[x + y * rgbSprite.wi] = (x + y) % 4 === 0 ? 0 : ((x * 24) << 16) | ((y * 28) << 8) | 0x90;
        }
    }
    rgbSprite.plotSprite(36, 84);
    rgbSprite.quickPlotSprite(52, 84);
    rgbSprite.transPlotSprite(68, 84, 128);
    rgbSprite.rotatePlotSprite(122, 84, 10, 8, 5, 4, 0.35, 256);

    const mask = new Pix8(width, height, Int32Array.of(0, 0xffffff));
    for (let yy = 98; yy < 106; yy++) {
        for (let xx = 118; xx < 128; xx++) {
            if (((xx + yy) % 3) === 0) {
                mask.data[xx + yy * width] = 1;
            }
        }
    }
    rgbSprite.scanlinePlotSprite(mask, 118, 98);

    rgbSprite.scanlineRotatePlotSprite(
        140,
        98,
        10,
        8,
        5,
        4,
        120,
        256,
        Int32Array.of(1, 0, 0, 1, 2, 1, 0, 3),
        Int32Array.of(6, 8, 7, 6, 5, 7, 8, 4)
    );

    plotDynamicValidationSprite(dynamicSeed, 18, 68);

    const font = new PixFont();
    const glyph = new Int8Array([
        1, 1, 1, 0, 1,
        1, 0, 0, 0, 1,
        1, 1, 1, 0, 1,
        1, 0, 0, 0, 1,
        1, 0, 0, 0, 1
    ]);
    font.plotLetter(glyph, 76, 84, 5, 5, 0xfff080);
    font.plotLetterTrans(glyph, 88, 84, 5, 5, 0x80f0ff, 128);

    Pix3D.setRenderClipping();
    Pix3D.hclip = false;
    Pix3D.lowDetail = true;
    Pix3D.trans = 0;
    Pix3D.flatTriangle(126, 154, 140, 10, 16, 42, 0xff40c0);
    Pix3D.gouraudTriangle(106, 126, 112, 12, 42, 24, 16, 96, 220);
    Pix3D.textureTriangle(
        18, 46, 32,
        18, 24, 52,
        96, 176, 240,
        64, 64, 96,
        128, 64,
        64, 128,
        96, 96,
        0
    );

    Pix3D.hclip = true;
    Pix3D.lowDetail = false;
    Pix3D.trans = 96;
    Pix3D.flatTriangle(158, 136, 148, 70, 92, 58, 0x40ffc0);
    Pix3D.gouraudTriangle(140, 176, 154, 94, 100, 110, 48, 128, 240);
    Pix3D.trans = 0;

    Pix3D.lowMem = true;
    Pix3D.hclip = false;
    Pix3D.clearTexels();
    Pix3D.initPool(1);
    const lowMemPalette = new Int32Array(32);
    for (let i = 1; i < lowMemPalette.length; i++) {
        lowMemPalette[i] = ((i * 37) & 0xff) << 16 | ((i * 19) & 0xff) << 8 | ((0xe0 - i * 5) & 0xff);
    }
    const lowMemTexture = new Pix8(64, 64, lowMemPalette);
    for (let yy = 0; yy < lowMemTexture.hi; yy++) {
        for (let xx = 0; xx < lowMemTexture.wi; xx++) {
            lowMemTexture.data[xx + yy * lowMemTexture.wi] = (((xx >> 2) ^ (yy >> 2)) % 31) + 1;
        }
    }
    Pix3D.textures[2] = lowMemTexture;
    Pix3D.texPal[2] = lowMemPalette;
    Pix3D.numTextures = Math.max(Pix3D.numTextures, 3);
    Pix3D.textureTriangle(
        52, 78, 62,
        18, 30, 56,
        128, 192, 240,
        64, 64, 96,
        128, 64,
        64, 128,
        96, 96,
        2
    );
    Pix3D.lowMem = false;
    Pix3D.clearTexels();
    Pix3D.trans = 0;
    plotModelFlatValidationTriangle();

    return pixelsToImageData(pixels, width, height);
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForSample(stats: WebGpuFrameValidationStats, previousSamples: number): Promise<void> {
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline) {
        if (stats.samplesCompared > previousSamples || stats.lastError) {
            return;
        }
        await sleep(16);
    }
    stats.lastError = 'validation timed out waiting for WebGPU readback';
}

function printResult(result: ValidationResult): void {
    const line = document.createElement('div');
    line.textContent = `${result.passed ? 'PASS' : 'FAIL'} ${result.name}: ${JSON.stringify({
        validation: result.stats,
        packetReplay: result.packetReplayStats,
        evidence: result.evidence
    })}`;
    line.style.font = '12px monospace';
    line.style.color = result.passed ? '#1b7f37' : '#b42318';
    document.body.appendChild(line);
}

async function runValidation(): Promise<void> {
    const width = 160;
    const height = 112;
    const cpuCanvas = makeCanvas('cpu', width, height);
    const gpuCanvas = makeCanvas('gpu-source', width, height);
    const packetGpuCanvas = makeCanvas('gpu-packet-source', width, height);
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.gap = '16px';
    container.appendChild(cpuCanvas);
    container.appendChild(gpuCanvas);
    container.appendChild(packetGpuCanvas);
    document.body.appendChild(container);

    const cpu = cpuCanvas.getContext('2d', { alpha: false });
    if (!cpu) {
        throw new Error('2D canvas context unavailable');
    }

    const presenter = await WebGpuFramePresenter.create(gpuCanvas, {
        validate: true,
        validationSampleInterval: 1
    });
    if (!presenter || !presenter.validationStats?.enabled) {
        throw new Error(`WebGPU unavailable: ${presenter?.validationStats?.lastError || 'no presenter'}`);
    }

    const cases = [
        { name: 'full-frame-gradient', frame: makeFrame(width, height, 1), x: 0, y: 0 },
        { name: 'offset-region', frame: makeFrame(96, 64, 2), x: 17, y: 23 },
        { name: 'negative-origin-clip', frame: makeFrame(96, 64, 3), x: -13, y: -9 },
        { name: 'right-bottom-clip', frame: makeFrame(96, 64, 4), x: width - 40, y: height - 31 }
    ];

    const results: ValidationResult[] = [];
    for (const testCase of cases) {
        const previousSamples = presenter.validationStats.samplesCompared;
        cpu.putImageData(testCase.frame, testCase.x, testCase.y);
        presenter.present(testCase.frame, testCase.x, testCase.y);
        await waitForSample(presenter.validationStats, previousSamples);

        const stats = { ...presenter.validationStats };
        const passed = stats.lastError === '' && stats.lastDiffPixels === 0 && stats.mismatches === 0;
        const result = { name: testCase.name, passed, stats, packetReplayStats: null };
        results.push(result);
        printResult(result);
    }

    const packetPresenter = await WebGpuFramePresenter.create(packetGpuCanvas, {
        validate: true,
        validationSampleInterval: 1,
        packetReplay: true
    });
    if (!packetPresenter || !packetPresenter.validationStats?.enabled || !packetPresenter.packetReplayStats.enabled) {
        throw new Error(`WebGPU packet replay unavailable: ${packetPresenter?.validationStats?.lastError || packetPresenter?.packetReplayStats.lastError || 'no presenter'}`);
    }

    let previousSamples = packetPresenter.validationStats.samplesCompared;
    const previousReplayed = packetPresenter.packetReplayStats.framesReplayed;
    let nativeFlatTrianglePackets = 0;
    let nativeGouraudTrianglePackets = 0;
    let nativeTextureTrianglePackets = 0;
    gpuRenderPackets.clearCpuRasterWriteSkipSurfaces();
    gpuRenderPackets.setEnabled(false);
    gpuRenderPackets.setSkipCpuRasterWrites(false);
    const packetFrame = makePacketReplayFrame(width, height, false, 1);
    gpuRenderPackets.reset();
    gpuRenderPackets.setEnabled(true);
    gpuRenderPackets.setSkipCpuRasterWrites(true);
    makePacketReplayFrame(width, height, true, 1);
    nativeFlatTrianglePackets += gpuRenderPackets.snapshot().packets.filter(packet => packet.kind === 'triangleFlat' && packet.gpuRasterize).length;
    nativeGouraudTrianglePackets += gpuRenderPackets.snapshot().packets.filter(packet => packet.kind === 'triangleGouraud' && packet.gpuRasterize).length;
    nativeTextureTrianglePackets += gpuRenderPackets.snapshot().packets.filter(packet => packet.kind === 'triangleTexture' && packet.gpuRasterize).length;
    cpu.putImageData(packetFrame, 0, 0);
    packetPresenter.presentPackets(width, height, 0, 0, packetFrame);
    await waitForSample(packetPresenter.validationStats, previousSamples);

    previousSamples = packetPresenter.validationStats.samplesCompared;
    gpuRenderPackets.setEnabled(false);
    gpuRenderPackets.setSkipCpuRasterWrites(false);
    const packetFrameUpdated = makePacketReplayFrame(width, height, false, 2);
    gpuRenderPackets.reset();
    gpuRenderPackets.setEnabled(true);
    gpuRenderPackets.setSkipCpuRasterWrites(true);
    makePacketReplayFrame(width, height, true, 2);
    nativeFlatTrianglePackets += gpuRenderPackets.snapshot().packets.filter(packet => packet.kind === 'triangleFlat' && packet.gpuRasterize).length;
    nativeGouraudTrianglePackets += gpuRenderPackets.snapshot().packets.filter(packet => packet.kind === 'triangleGouraud' && packet.gpuRasterize).length;
    nativeTextureTrianglePackets += gpuRenderPackets.snapshot().packets.filter(packet => packet.kind === 'triangleTexture' && packet.gpuRasterize).length;
    cpu.putImageData(packetFrameUpdated, 0, 0);
    packetPresenter.presentPackets(width, height, 0, 0, packetFrameUpdated);
    await waitForSample(packetPresenter.validationStats, previousSamples);

    const packetStats = { ...packetPresenter.validationStats };
    const packetReplayStats = { ...packetPresenter.packetReplayStats };
    const packetPassed =
        packetStats.lastError === '' &&
        packetStats.lastDiffPixels === 0 &&
        packetStats.mismatches === 0 &&
        packetReplayStats.framesReplayed >= previousReplayed + 2 &&
        packetReplayStats.framesFailed === 0 &&
        packetReplayStats.cpuImageDataUploads === 0 &&
        packetReplayStats.cpuRasterWriteBypasses > 0 &&
        packetReplayStats.nativeFlatTrianglesReplayed >= nativeFlatTrianglePackets &&
        packetReplayStats.nativeGouraudTrianglesReplayed >= nativeGouraudTrianglePackets &&
        packetReplayStats.nativeTextureTrianglesReplayed >= nativeTextureTrianglePackets &&
        packetReplayStats.gpuRectInstancesReplayed > 0 &&
        packetReplayStats.gpuDynamicIndexedSpritesReplayed > 0 &&
        packetReplayStats.gpuGlyphSpritesReplayed > 0 &&
        packetReplayStats.gpuModelFlatTrianglesReplayed > 0 &&
        nativeFlatTrianglePackets > 0 &&
        nativeGouraudTrianglePackets > 0 &&
        nativeTextureTrianglePackets > 0 &&
        packetReplayStats.lastError === '';
    const packetResult = {
        name: 'packet-replay-2d-primitives',
        passed: packetPassed,
        stats: packetStats,
        packetReplayStats,
        evidence: { nativeFlatTrianglePackets, nativeGouraudTrianglePackets, nativeTextureTrianglePackets }
    };
    results.push(packetResult);
    printResult(packetResult);

    window.__rsSdkRendererValidation = {
        done: true,
        passed: results.every(result => result.passed),
        results
    };
}

window.__rsSdkRendererValidation = {
    done: false,
    passed: false,
    results: []
};

runValidation().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    window.__rsSdkRendererValidation = {
        done: true,
        passed: false,
        results: [],
        error: message
    };
    const line = document.createElement('pre');
    line.textContent = message;
    line.style.color = '#b42318';
    document.body.appendChild(line);
});
