import WebGpuFramePresenter from '#/graphics/WebGpuFramePresenter.js';

export const canvas: HTMLCanvasElement = document.getElementById('canvas') as HTMLCanvasElement;
export const canvas2d: CanvasRenderingContext2D = canvas?.getContext('2d', {
    desynchronized: false,
    alpha: false
})!;

let webGpuPresenter: WebGpuFramePresenter | null = null;
let webGpuUnavailable = false;

function shouldUseWebGpu(): boolean {
    const params = new URLSearchParams(window.location.search);
    return params.get('renderer') !== 'canvas' && localStorage.getItem('rs-sdk.renderer') !== 'canvas';
}

if (canvas && shouldUseWebGpu()) {
    void WebGpuFramePresenter.create(canvas)
        .then(presenter => {
            webGpuPresenter = presenter;
            webGpuUnavailable = !presenter;
        })
        .catch(err => {
            webGpuUnavailable = true;
            console.warn('[WebGPU] falling back to 2D canvas renderer', err);
        });
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
