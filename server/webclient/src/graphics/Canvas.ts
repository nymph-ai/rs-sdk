import WebGpuFramePresenter from '#/graphics/WebGpuFramePresenter.js';

export const canvas: HTMLCanvasElement = document.getElementById('canvas') as HTMLCanvasElement;
export const canvas2d: CanvasRenderingContext2D = canvas?.getContext('2d', {
    desynchronized: false,
    alpha: false
})!;

let webGpuPresenter: WebGpuFramePresenter | null = null;
let webGpuUnavailable = false;

declare global {
    interface Window {
        __rsSdkRendererStats?: {
            backend: 'canvas' | 'webgpu';
            validation: WebGpuFramePresenter['validationStats'];
        };
    }
}

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
    return getRendererParam('renderer') !== 'canvas' && getRendererPreference() !== 'canvas';
}

function shouldValidateWebGpu(): boolean {
    return getRendererParam('rendererValidation') === '1' || getRendererParam('rendererValidate') === '1';
}

if (canvas && shouldUseWebGpu()) {
    void WebGpuFramePresenter.create(canvas, { validate: shouldValidateWebGpu() })
        .then(presenter => {
            webGpuPresenter = presenter;
            webGpuUnavailable = !presenter;
            window.__rsSdkRendererStats = {
                backend: presenter ? 'webgpu' : 'canvas',
                validation: presenter?.validationStats ?? null
            };
        })
        .catch(err => {
            webGpuUnavailable = true;
            window.__rsSdkRendererStats = {
                backend: 'canvas',
                validation: null
            };
            console.warn('[WebGPU] falling back to 2D canvas renderer', err);
        });
} else {
    window.__rsSdkRendererStats = {
        backend: 'canvas',
        validation: null
    };
}

export function presentImageData(imageData: ImageData, x: number, y: number, ctx: CanvasRenderingContext2D): boolean {
    if (webGpuUnavailable || ctx !== canvas2d || !webGpuPresenter) {
        return false;
    }

    return webGpuPresenter.present(imageData, x, y);
}

export function saveDataURL(dataURL: string, filename: string) {
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
