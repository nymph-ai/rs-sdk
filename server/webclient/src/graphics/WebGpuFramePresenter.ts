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

type GpuRenderPipeline = {
    getBindGroupLayout(index: number): object;
};

type GpuCommandEncoder = {
    beginRenderPass(descriptor: object): GpuRenderPass;
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
            COPY_DST: number;
            RENDER_ATTACHMENT: number;
            TEXTURE_BINDING: number;
        };
    }).GPUTextureUsage;
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

export default class WebGpuFramePresenter {
    private frameTexture: GpuTexture | null = null;
    private bindGroup: object | null = null;
    private width: number = 0;
    private height: number = 0;

    private constructor(
        private readonly sourceCanvas: HTMLCanvasElement,
        private readonly overlayCanvas: HTMLCanvasElement,
        private readonly device: GpuDevice,
        private readonly context: GpuCanvasContext,
        private readonly textureFormat: string,
        private readonly sampler: object,
        private readonly pipeline: GpuRenderPipeline
    ) {
        this.recreateFrameTexture();
    }

    static async create(sourceCanvas: HTMLCanvasElement): Promise<WebGpuFramePresenter | null> {
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

        const presenter = new WebGpuFramePresenter(sourceCanvas, overlayCanvas, device, context, textureFormat, sampler, pipeline);
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

        const dstX = Math.max(0, x | 0);
        const dstY = Math.max(0, y | 0);
        const copyWidth = Math.min(imageData.width, this.width - dstX);
        const copyHeight = Math.min(imageData.height, this.height - dstY);
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
                offset: 0,
                bytesPerRow: imageData.width * 4,
                rowsPerImage: imageData.height
            },
            {
                width: copyWidth,
                height: copyHeight,
                depthOrArrayLayers: 1
            }
        );

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
            usage: getTextureUsage()!.COPY_DST | getTextureUsage()!.TEXTURE_BINDING
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
