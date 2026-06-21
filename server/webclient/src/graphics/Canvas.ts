import WebGpuFramePresenter from '#/graphics/WebGpuFramePresenter.js';
import { getGpuRenderSurfaceId, gpuRenderPackets } from '#/graphics/GpuRenderPackets.js';
import { isStreamClientProfileRequested, shouldUseGpuPacketReplay, shouldUseWebGpuRenderer } from '#/client/StreamClientProfile.js';

export const canvas: HTMLCanvasElement = document.getElementById('canvas') as HTMLCanvasElement;
export const canvas2d: CanvasRenderingContext2D = canvas?.getContext('2d', {
    desynchronized: false,
    alpha: false
})!;

let webGpuPresenter: WebGpuFramePresenter | null = null;

declare global {
    interface Window {
        __rsSdkRendererStats?: {
            backend: 'canvas' | 'webgpu' | 'failed';
            validation: WebGpuFramePresenter['validationStats'];
            packetReplay: WebGpuFramePresenter['packetReplayStats'] | null;
            error?: string;
        };
    }
}

let webGpuStartupError: Error | null = null;

function getRendererParam(name: string): string | null {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

function getRendererPreference(): string | null {
    try {
        return localStorage.getItem('rs-sdk.renderer');
    } catch (_err) {
        return null;
    }
}

function shouldUseWebGpu(): boolean {
    return shouldUseWebGpuRenderer(getRendererParam('renderer'), getRendererPreference(), isStreamClientProfileRequested());
}

function shouldValidateWebGpu(): boolean {
    return getRendererParam('rendererValidation') === '1' || getRendererParam('rendererValidate') === '1';
}

function parseRendererFlag(value: string | null): boolean | null {
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

function readPacketReplayPreference(): boolean | null {
    const queryValue = parseRendererFlag(getRendererParam('rendererPacketReplay'));
    if (queryValue !== null) {
        return queryValue;
    }

    try {
        return parseRendererFlag(localStorage.getItem('rs-sdk.rendererPacketReplay'));
    } catch (_err) {
        return null;
    }
}

const streamClientRequested = isStreamClientProfileRequested();
const webGpuRequested = Boolean(canvas && shouldUseWebGpu());
const packetReplayPreference = readPacketReplayPreference();
const packetReplayExplicitlyRequested = packetReplayPreference === true;
const packetReplayRequested = shouldUseGpuPacketReplay(webGpuRequested, packetReplayPreference, streamClientRequested);

if (webGpuRequested && !packetReplayRequested) {
    webGpuStartupError = new Error('WebGPU renderer requires packet replay; use renderer=canvas to disable GPU rendering');
    window.__rsSdkRendererStats = {
        backend: 'failed',
        validation: null,
        packetReplay: null,
        error: webGpuStartupError.message
    };
} else if (webGpuRequested) {
    void WebGpuFramePresenter.create(canvas, { validate: shouldValidateWebGpu(), packetReplay: packetReplayRequested })
        .then(presenter => {
            webGpuPresenter = presenter;
            if (!presenter) {
                webGpuStartupError = new Error('WebGPU presenter creation returned null');
            }
            window.__rsSdkRendererStats = {
                backend: presenter ? 'webgpu' : 'failed',
                validation: presenter?.validationStats ?? null,
                packetReplay: presenter?.packetReplayStats ?? null,
                error: webGpuStartupError?.message
            };
        })
        .catch(err => {
            webGpuStartupError = err instanceof Error ? err : new Error(String(err));
            window.__rsSdkRendererStats = {
                backend: 'failed',
                validation: null,
                packetReplay: null,
                error: webGpuStartupError.message
            };
            console.error('[WebGPU] renderer startup failed', err);
        });
} else {
    if (packetReplayExplicitlyRequested) {
        webGpuStartupError = new Error('packet replay requested but WebGPU renderer startup was disabled');
    }
    window.__rsSdkRendererStats = {
        backend: packetReplayExplicitlyRequested ? 'failed' : 'canvas',
        validation: null,
        packetReplay: null,
        error: webGpuStartupError?.message
    };
}

export function presentImageData(imageData: ImageData, x: number, y: number, ctx: CanvasRenderingContext2D): boolean {
    if (!webGpuRequested || ctx !== canvas2d) {
        return false;
    }

    if (webGpuStartupError) {
        throw webGpuStartupError;
    }

    if (!webGpuPresenter) {
        throw new Error('WebGPU presenter initialization has not completed');
    }

    if (!webGpuPresenter.present(imageData, x, y)) {
        throw new Error('WebGPU presenter failed to present frame');
    }

    return true;
}

export function presentGpuRenderPackets(width: number, height: number, x: number, y: number, ctx: CanvasRenderingContext2D, pixels?: Int32Array): boolean {
    if (!packetReplayRequested) {
        return false;
    }

    if (ctx !== canvas2d) {
        throw new Error('packet replay requested but PixMap is presenting to a non-primary canvas');
    }

    if (webGpuStartupError) {
        throw webGpuStartupError;
    }

    if (!webGpuPresenter) {
        throw new Error('WebGPU packet presenter initialization has not completed');
    }

    const surfaceId = pixels ? getGpuRenderSurfaceId(pixels, width, height) : undefined;
    if (!webGpuPresenter.presentPackets(width, height, x, y, null, surfaceId)) {
        throw new Error('WebGPU packet presenter failed to present frame');
    }

    if (pixels) {
        gpuRenderPackets.markSurfaceCpuRasterWritesSkippable(pixels, width, height);
    }

    return true;
}

export function isGpuPacketReplayRequested(): boolean {
    return packetReplayRequested;
}

export function isGpuPacketReplayPending(): boolean {
    return packetReplayRequested && !webGpuPresenter && !webGpuStartupError;
}

export function saveDataURL(dataURL: string, filename: string) {
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
