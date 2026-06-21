type BrowserGpu = {
    requestAdapter(options?: { powerPreference?: 'high-performance' | 'low-power' }): Promise<GpuAdapter | null>;
    getPreferredCanvasFormat(): string;
};

type GpuAdapter = {
    requestDevice(): Promise<GpuDevice>;
};

type GpuDevice = {
    lost?: Promise<{ message?: string; reason?: string }>;
    queue: {
        writeTexture(destination: object, data: Uint8ClampedArray | Uint8Array, layout: object, size: object): void;
        submit(commandBuffers: object[]): void;
    };
    createBuffer(descriptor: object): GpuBuffer;
    createTexture(descriptor: object): GpuTexture;
    createSampler(descriptor: object): object;
    createShaderModule(descriptor: object): object;
    createRenderPipeline(descriptor: object): GpuRenderPipeline;
    createBindGroup(descriptor: object): object;
    createCommandEncoder(): GpuCommandEncoder;
};

type GpuTexture = {
    createView(): object;
    destroy(): void;
};

type GpuBuffer = {
    mapAsync(mode: number): Promise<void>;
    getMappedRange(): ArrayBuffer;
    unmap(): void;
    destroy(): void;
};

type GpuRenderPipeline = {
    getBindGroupLayout(index: number): object;
};

type GpuCommandEncoder = {
    beginRenderPass(descriptor: object): GpuRenderPass;
    copyTextureToBuffer(source: object, destination: object, size: object): void;
    finish(): object;
};

type GpuRenderPass = {
    setPipeline(pipeline: GpuRenderPipeline): void;
    setBindGroup(index: number, bindGroup: object): void;
    draw(vertexCount: number): void;
    end(): void;
};

type GpuCanvasContext = {
    configure(descriptor: object): void;
    getCurrentTexture(): GpuTexture;
};

const SHADER = `
struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    let positions = array<vec2f, 6>(
        vec2f(-1.0, -1.0),
        vec2f( 1.0, -1.0),
        vec2f(-1.0,  1.0),
        vec2f(-1.0,  1.0),
        vec2f( 1.0, -1.0),
        vec2f( 1.0,  1.0)
    );
    let uvs = array<vec2f, 6>(
        vec2f(0.0, 1.0),
        vec2f(1.0, 1.0),
        vec2f(0.0, 0.0),
        vec2f(0.0, 0.0),
        vec2f(1.0, 1.0),
        vec2f(1.0, 0.0)
    );

    var output: VertexOutput;
    output.position = vec4f(positions[vertexIndex], 0.0, 1.0);
    output.uv = uvs[vertexIndex];
    return output;
}

@group(0) @binding(0) var frameTexture: texture_2d<f32>;
@group(0) @binding(1) var frameSampler: sampler;

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
    return textureSample(frameTexture, frameSampler, input.uv);
}
`;

function getGpu(): BrowserGpu | null {
    return ((navigator as Navigator & { gpu?: BrowserGpu }).gpu) ?? null;
}

function getTextureUsage() {
    return (globalThis as typeof globalThis & {
        GPUTextureUsage?: {
            COPY_SRC: number;
            COPY_DST: number;
            RENDER_ATTACHMENT: number;
            TEXTURE_BINDING: number;
        };
    }).GPUTextureUsage;
}

function getBufferUsage() {
    return (globalThis as typeof globalThis & {
        GPUBufferUsage?: {
            COPY_DST: number;
            MAP_READ: number;
        };
    }).GPUBufferUsage;
}

function getMapMode() {
    return (globalThis as typeof globalThis & {
        GPUMapMode?: {
            READ: number;
        };
    }).GPUMapMode;
}

function alignTo(value: number, alignment: number): number {
    return Math.ceil(value / alignment) * alignment;
}

function copyExpectedRegion(imageData: ImageData, sourceX: number, sourceY: number, width: number, height: number): Uint8Array {
    const bytesPerRow = width * 4;
    if (sourceX === 0 && sourceY === 0 && width === imageData.width && height === imageData.height) {
        return new Uint8Array(imageData.data);
    }

    const expected = new Uint8Array(bytesPerRow * height);
    for (let y = 0; y < height; y++) {
        const srcStart = ((sourceY + y) * imageData.width + sourceX) * 4;
        const srcEnd = srcStart + bytesPerRow;
        expected.set(imageData.data.subarray(srcStart, srcEnd), y * bytesPerRow);
    }
    return expected;
}

function createOverlayCanvas(source: HTMLCanvasElement): HTMLCanvasElement | null {
    const overlay = document.createElement('canvas');
    overlay.id = `${source.id || 'game'}-webgpu`;
    overlay.width = source.width;
    overlay.height = source.height;
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '1';
    overlay.style.imageRendering = 'pixelated';
    return overlay;
}

function installOverlayCanvas(source: HTMLCanvasElement, overlay: HTMLCanvasElement): boolean {
    const parent = source.parentElement;
    if (!parent) {
        return false;
    }

    const wrapper = document.createElement('div');
    wrapper.dataset.rsSdkCanvasStack = 'webgpu';
    wrapper.style.position = 'relative';
    wrapper.style.display = window.getComputedStyle(source).display === 'block' ? 'block' : 'inline-block';
    wrapper.style.width = source.style.width || `${source.width}px`;
    wrapper.style.height = source.style.height || `${source.height}px`;

    parent.insertBefore(wrapper, source);
    wrapper.appendChild(source);
    wrapper.appendChild(overlay);

    source.style.display = 'block';
    source.style.position = 'relative';
    source.style.zIndex = '0';

    return true;
}

export type WebGpuFrameValidationStats = {
    enabled: boolean;
    framesPresented: number;
    samplesQueued: number;
    samplesCompared: number;
    mismatches: number;
    lastDiffPixels: number;
    lastMaxChannelDelta: number;
    lastError: string;
    inFlight: boolean;
};

type WebGpuFramePresenterOptions = {
    validate?: boolean;
    validationSampleInterval?: number;
};

class WebGpuFrameValidator {
    private readonly bufferUsage = getBufferUsage();
    private readonly mapMode = getMapMode();
    readonly stats: WebGpuFrameValidationStats = {
        enabled: false,
        framesPresented: 0,
        samplesQueued: 0,
        samplesCompared: 0,
        mismatches: 0,
        lastDiffPixels: 0,
        lastMaxChannelDelta: 0,
        lastError: '',
        inFlight: false
    };

    constructor(
        private readonly device: GpuDevice,
        private readonly sampleInterval: number
    ) {
        this.stats.enabled = Boolean(this.bufferUsage && this.mapMode);
        if (!this.stats.enabled) {
            this.stats.lastError = 'GPUBufferUsage/GPUMapMode unavailable';
        }
    }

    maybeValidate(texture: GpuTexture, imageData: ImageData, sourceX: number, sourceY: number, x: number, y: number, width: number, height: number): void {
        this.stats.framesPresented++;
        if (!this.stats.enabled || this.stats.inFlight) {
            return;
        }

        if (this.stats.framesPresented > 5 && this.stats.framesPresented % this.sampleInterval !== 0) {
            return;
        }

        this.stats.inFlight = true;
        this.stats.samplesQueued++;

        const bytesPerRow = width * 4;
        const paddedBytesPerRow = alignTo(bytesPerRow, 256);
        const bufferSize = paddedBytesPerRow * height;
        const expected = copyExpectedRegion(imageData, sourceX, sourceY, width, height);
        const readback = this.device.createBuffer({
            size: bufferSize,
            usage: this.bufferUsage!.COPY_DST | this.bufferUsage!.MAP_READ
        });
        const encoder = this.device.createCommandEncoder();

        encoder.copyTextureToBuffer(
            {
                texture,
                origin: { x, y, z: 0 }
            },
            {
                buffer: readback,
                bytesPerRow: paddedBytesPerRow,
                rowsPerImage: height
            },
            {
                width,
                height,
                depthOrArrayLayers: 1
            }
        );
        this.device.queue.submit([encoder.finish()]);

        void readback.mapAsync(this.mapMode!.READ)
            .then(() => {
                const actual = new Uint8Array(readback.getMappedRange());
                let diffPixels = 0;
                let maxChannelDelta = 0;

                for (let row = 0; row < height; row++) {
                    const expectedRow = row * bytesPerRow;
                    const actualRow = row * paddedBytesPerRow;
                    for (let column = 0; column < bytesPerRow; column += 4) {
                        let pixelDiff = false;
                        for (let channel = 0; channel < 4; channel++) {
                            const delta = Math.abs(actual[actualRow + column + channel] - expected[expectedRow + column + channel]);
                            if (delta !== 0) {
                                pixelDiff = true;
                                maxChannelDelta = Math.max(maxChannelDelta, delta);
                            }
                        }
                        if (pixelDiff) {
                            diffPixels++;
                        }
                    }
                }

                this.stats.samplesCompared++;
                this.stats.lastDiffPixels = diffPixels;
                this.stats.lastMaxChannelDelta = maxChannelDelta;
                this.stats.lastError = '';
                if (diffPixels > 0) {
                    this.stats.mismatches++;
                    console.warn(`[WebGPU] CPU validation mismatch: ${diffPixels}/${width * height} pixels, max delta ${maxChannelDelta}`);
                }
            })
            .catch(err => {
                this.stats.lastError = err instanceof Error ? err.message : String(err);
                console.warn('[WebGPU] CPU validation readback failed', err);
            })
            .finally(() => {
                try {
                    readback.unmap();
                } catch (_err) {
                    // The buffer may not be mapped when mapAsync fails.
                }
                readback.destroy();
                this.stats.inFlight = false;
            });
    }
}

export default class WebGpuFramePresenter {
    private frameTexture: GpuTexture | null = null;
    private bindGroup: object | null = null;
    private width: number = 0;
    private height: number = 0;
    private readonly validator: WebGpuFrameValidator | null;
    readonly validationStats: WebGpuFrameValidationStats | null;

    private constructor(
        private readonly sourceCanvas: HTMLCanvasElement,
        private readonly overlayCanvas: HTMLCanvasElement,
        private readonly device: GpuDevice,
        private readonly context: GpuCanvasContext,
        private readonly textureFormat: string,
        private readonly sampler: object,
        private readonly pipeline: GpuRenderPipeline,
        options: WebGpuFramePresenterOptions
    ) {
        this.validator = options.validate ? new WebGpuFrameValidator(device, options.validationSampleInterval || 120) : null;
        this.validationStats = this.validator?.stats ?? null;
        this.recreateFrameTexture();
    }

    static async create(sourceCanvas: HTMLCanvasElement, options: WebGpuFramePresenterOptions = {}): Promise<WebGpuFramePresenter | null> {
        const gpu = getGpu();
        const textureUsage = getTextureUsage();
        if (!gpu || !textureUsage) {
            return null;
        }

        const overlayCanvas = createOverlayCanvas(sourceCanvas);
        if (!overlayCanvas) {
            return null;
        }

        const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter) {
            overlayCanvas.remove();
            return null;
        }

        const device = await adapter.requestDevice();
        const context = overlayCanvas.getContext('webgpu') as unknown as GpuCanvasContext | null;
        if (!context) {
            overlayCanvas.remove();
            return null;
        }

        const textureFormat = gpu.getPreferredCanvasFormat();
        context.configure({
            device,
            format: textureFormat,
            alphaMode: 'opaque'
        });

        const sampler = device.createSampler({
            magFilter: 'nearest',
            minFilter: 'nearest'
        });
        const shaderModule = device.createShaderModule({ code: SHADER });
        const pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vs'
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs',
                targets: [{ format: textureFormat }]
            },
            primitive: {
                topology: 'triangle-list'
            }
        });

        if (!installOverlayCanvas(sourceCanvas, overlayCanvas)) {
            overlayCanvas.remove();
            return null;
        }

        const presenter = new WebGpuFramePresenter(sourceCanvas, overlayCanvas, device, context, textureFormat, sampler, pipeline, options);
        device.lost?.then(info => {
            console.warn(`[WebGPU] device lost: ${info.reason || 'unknown'} ${info.message || ''}`.trim());
            presenter.disable();
        });

        return presenter;
    }

    present(imageData: ImageData, x: number, y: number): boolean {
        if (!this.frameTexture || !this.bindGroup) {
            return false;
        }

        this.syncCanvasSize();

        const sourceX = Math.max(0, -(x | 0));
        const sourceY = Math.max(0, -(y | 0));
        const dstX = Math.max(0, x | 0);
        const dstY = Math.max(0, y | 0);
        const copyWidth = Math.min(imageData.width - sourceX, this.width - dstX);
        const copyHeight = Math.min(imageData.height - sourceY, this.height - dstY);
        if (copyWidth <= 0 || copyHeight <= 0) {
            return true;
        }

        this.device.queue.writeTexture(
            {
                texture: this.frameTexture,
                origin: { x: dstX, y: dstY, z: 0 }
            },
            imageData.data,
            {
                offset: (sourceY * imageData.width + sourceX) * 4,
                bytesPerRow: imageData.width * 4,
                rowsPerImage: imageData.height
            },
            {
                width: copyWidth,
                height: copyHeight,
                depthOrArrayLayers: 1
            }
        );
        this.validator?.maybeValidate(this.frameTexture, imageData, sourceX, sourceY, dstX, dstY, copyWidth, copyHeight);

        this.draw();
        return true;
    }

    private syncCanvasSize(): void {
        if (this.width === this.sourceCanvas.width && this.height === this.sourceCanvas.height) {
            return;
        }

        this.overlayCanvas.width = this.sourceCanvas.width;
        this.overlayCanvas.height = this.sourceCanvas.height;
        this.context.configure({
            device: this.device,
            format: this.textureFormat,
            alphaMode: 'opaque'
        });
        this.recreateFrameTexture();
    }

    private recreateFrameTexture(): void {
        this.frameTexture?.destroy();
        this.width = Math.max(1, this.sourceCanvas.width);
        this.height = Math.max(1, this.sourceCanvas.height);

        this.frameTexture = this.device.createTexture({
            size: {
                width: this.width,
                height: this.height,
                depthOrArrayLayers: 1
            },
            format: 'rgba8unorm',
            usage: getTextureUsage()!.COPY_SRC | getTextureUsage()!.COPY_DST | getTextureUsage()!.TEXTURE_BINDING
        });
        this.bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: this.frameTexture.createView()
                },
                {
                    binding: 1,
                    resource: this.sampler
                }
            ]
        });

        this.device.queue.writeTexture(
            { texture: this.frameTexture },
            new Uint8Array(this.width * this.height * 4),
            {
                offset: 0,
                bytesPerRow: this.width * 4,
                rowsPerImage: this.height
            },
            {
                width: this.width,
                height: this.height,
                depthOrArrayLayers: 1
            }
        );
    }

    private draw(): void {
        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.context.getCurrentTexture().createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: 'clear',
                    storeOp: 'store'
                }
            ]
        });

        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup!);
        pass.draw(6);
        pass.end();
        this.device.queue.submit([encoder.finish()]);
    }

    private disable(): void {
        this.frameTexture?.destroy();
        this.frameTexture = null;
        this.bindGroup = null;
        this.overlayCanvas.remove();
    }
}
