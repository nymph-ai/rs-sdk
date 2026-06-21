import { gpuRenderPackets } from '#/graphics/GpuRenderPackets.js';
import Pix2D from '#/graphics/Pix2D.js';
import WebGpuFramePresenter, { type WebGpuFrameValidationStats, type WebGpuPacketReplayStats } from '#/graphics/WebGpuFramePresenter.js';

type ValidationResult = {
    name: string;
    passed: boolean;
    stats: WebGpuFrameValidationStats | null;
    packetReplayStats: WebGpuPacketReplayStats | null;
};

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

function makePacketReplayFrame(width: number, height: number): ImageData {
    const pixels = new Int32Array(width * height);
    Pix2D.setPixels(pixels, width, height);
    gpuRenderPackets.reset();

    Pix2D.cls();
    Pix2D.fillRect(8, 6, 42, 21, 0x2448c8);
    Pix2D.hline(5, 54, 76, 0xffaa00);
    Pix2D.vline(96, 11, 72, 0x00dd88);
    Pix2D.setClipping(24, 20, 112, 82);
    Pix2D.fillRect(0, 0, 140, 104, 0x8a24a8);
    Pix2D.hline(18, 33, 108, 0xffffff);
    Pix2D.resetClipping();
    Pix2D.fillRect(width - 30, height - 18, 50, 30, 0x102030);

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
        packetReplay: result.packetReplayStats
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

    const previousSamples = packetPresenter.validationStats.samplesCompared;
    const previousReplayed = packetPresenter.packetReplayStats.framesReplayed;
    const packetFrame = makePacketReplayFrame(width, height);
    cpu.putImageData(packetFrame, 0, 0);
    packetPresenter.present(packetFrame, 0, 0);
    await waitForSample(packetPresenter.validationStats, previousSamples);

    const packetStats = { ...packetPresenter.validationStats };
    const packetReplayStats = { ...packetPresenter.packetReplayStats };
    const packetPassed =
        packetStats.lastError === '' &&
        packetStats.lastDiffPixels === 0 &&
        packetStats.mismatches === 0 &&
        packetReplayStats.framesReplayed > previousReplayed &&
        packetReplayStats.framesFailed === 0 &&
        packetReplayStats.lastError === '';
    const packetResult = {
        name: 'packet-replay-2d-primitives',
        passed: packetPassed,
        stats: packetStats,
        packetReplayStats
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
