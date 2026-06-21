import { gpuRenderPackets, type GpuRenderPacket, type GpuRenderPacketSnapshot, type GpuSpriteResource } from '#/graphics/GpuRenderPackets.js';

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
        writeBuffer(buffer: GpuBuffer, bufferOffset: number, data: Float32Array | Int32Array): void;
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
    setVertexBuffer(slot: number, buffer: GpuBuffer): void;
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

const PRIMITIVE_SHADER = `
struct VertexInput {
    @location(0) position: vec2f,
    @location(1) colour: vec4f,
};

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) colour: vec4f,
};

@vertex
fn vs(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.position = vec4f(input.position, 0.0, 1.0);
    output.colour = input.colour;
    return output;
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
    return input.colour;
}
`;

const ALPHA_SHADER = `
struct VertexOutput {
    @builtin(position) position: vec4f,
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

    var output: VertexOutput;
    output.position = vec4f(positions[vertexIndex], 0.0, 1.0);
    return output;
}

struct AlphaParams {
    op: i32,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    centerX: i32,
    centerY: i32,
    radius: i32,
    rgb: i32,
    alpha: i32,
    clipMinX: i32,
    clipMinY: i32,
    clipMaxX: i32,
    clipMaxY: i32,
    _pad0: i32,
    _pad1: i32,
};

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: AlphaParams;

fn inAlphaShape(pixel: vec2<i32>) -> bool {
    if (pixel.x < params.clipMinX || pixel.x >= params.clipMaxX || pixel.y < params.clipMinY || pixel.y >= params.clipMaxY) {
        return false;
    }

    if (params.op == 0) {
        return pixel.x >= params.x && pixel.x < params.x + params.width && pixel.y >= params.y && pixel.y < params.y + params.height;
    }

    let dy = pixel.y - params.centerY;
    if (dy < -params.radius || dy > params.radius) {
        return false;
    }

    let radiusSquared = params.radius * params.radius;
    let xRadius = i32(sqrt(f32(radiusSquared - dy * dy)));
    return pixel.x >= params.centerX - xRadius && pixel.x <= params.centerX + xRadius;
}

fn toByte(channel: f32) -> u32 {
    return u32(round(clamp(channel, 0.0, 1.0) * 255.0));
}

fn blendChannel(src: u32, dst: u32, alpha: u32) -> u32 {
    return (src * alpha + dst * (256u - alpha)) >> 8u;
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
    let pixel = vec2<i32>(floor(input.position.xy));
    let base = textureLoad(sourceTexture, pixel, 0);

    if (!inAlphaShape(pixel)) {
        return vec4f(base.rgb, 1.0);
    }

    let rgb = u32(params.rgb);
    let alpha = u32(params.alpha);
    let srcR = (rgb >> 16u) & 255u;
    let srcG = (rgb >> 8u) & 255u;
    let srcB = rgb & 255u;
    let dstR = toByte(base.r);
    let dstG = toByte(base.g);
    let dstB = toByte(base.b);

    let outR = blendChannel(srcR, dstR, alpha);
    let outG = blendChannel(srcG, dstG, alpha);
    let outB = blendChannel(srcB, dstB, alpha);
    return vec4f(f32(outR) / 255.0, f32(outG) / 255.0, f32(outB) / 255.0, 1.0);
}
`;

const SPRITE_SHADER = `
struct VertexInput {
    @location(0) position: vec2f,
    @location(1) uv: vec2f,
};

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
};

@vertex
fn vs(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.position = vec4f(input.position, 0.0, 1.0);
    output.uv = input.uv;
    return output;
}

@group(0) @binding(0) var spriteTexture: texture_2d<f32>;
@group(0) @binding(1) var spriteSampler: sampler;

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
    return textureSample(spriteTexture, spriteSampler, input.uv);
}
`;

const SPRITE_ALPHA_SHADER = `
struct VertexOutput {
    @builtin(position) position: vec4f,
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

    var output: VertexOutput;
    output.position = vec4f(positions[vertexIndex], 0.0, 1.0);
    return output;
}

struct SpriteAlphaParams {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    srcXFixed: i32,
    srcYFixed: i32,
    alpha: i32,
    stepX: i32,
    stepY: i32,
    _pad2: i32,
    _pad3: i32,
    _pad4: i32,
    _pad5: i32,
    _pad6: i32,
    _pad7: i32,
    _pad8: i32,
};

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var spriteTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> params: SpriteAlphaParams;

fn toByte(channel: f32) -> u32 {
    return u32(round(clamp(channel, 0.0, 1.0) * 255.0));
}

fn blendChannel(src: u32, dst: u32, alpha: u32) -> u32 {
    return (src * alpha + dst * (256u - alpha)) >> 8u;
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
    let pixel = vec2<i32>(floor(input.position.xy));
    let base = textureLoad(sourceTexture, pixel, 0);

    if (pixel.x < params.x || pixel.x >= params.x + params.width || pixel.y < params.y || pixel.y >= params.y + params.height) {
        return vec4f(base.rgb, 1.0);
    }

    let spritePixel = vec2<i32>(
        (params.srcXFixed + (pixel.x - params.x) * params.stepX) / 65536,
        (params.srcYFixed + (pixel.y - params.y) * params.stepY) / 65536
    );
    let sprite = textureLoad(spriteTexture, spritePixel, 0);
    if (sprite.a < 0.5) {
        return vec4f(base.rgb, 1.0);
    }

    let alpha = u32(params.alpha);
    if (alpha >= 256u) {
        return vec4f(sprite.rgb, 1.0);
    }

    let outR = blendChannel(toByte(sprite.r), toByte(base.r), alpha);
    let outG = blendChannel(toByte(sprite.g), toByte(base.g), alpha);
    let outB = blendChannel(toByte(sprite.b), toByte(base.b), alpha);
    return vec4f(f32(outR) / 255.0, f32(outG) / 255.0, f32(outB) / 255.0, 1.0);
}
`;

const FRAME_TEXTURE_FORMAT = 'rgba8unorm';
const FLOATS_PER_PRIMITIVE_VERTEX = 6;
const FLOATS_PER_SPRITE_VERTEX = 4;
const ALPHA_UNIFORM_INTS = 16;
const SPRITE_ALPHA_UNIFORM_INTS = 16;

type PacketClip = Extract<GpuRenderPacket, { kind: 'clip' }>['clip'];

type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type PacketReplayBuildResult = {
    steps: PacketReplayStep[];
    packetCount: number;
};

type PacketReplayStep = {
    kind: 'vertices';
    vertices: Float32Array;
} | {
    kind: 'alpha';
    op: AlphaReplayOp;
} | {
    kind: 'sprite';
    op: SpriteReplayOp;
};

type AlphaReplayOp = {
    kind: 'rect';
    rect: Rect;
    rgb: number;
    alpha: number;
} | {
    kind: 'circle';
    xCenter: number;
    yCenter: number;
    yRadius: number;
    clip: Rect;
    rgb: number;
    alpha: number;
};

type SpriteReplayOp = {
    resource: number;
    rect: Rect;
    srcX: number;
    srcY: number;
    srcWidth: number;
    srcHeight: number;
    alpha: number | null;
};

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
            VERTEX: number;
            UNIFORM: number;
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

function clipRect(rect: Rect, clip: PacketClip): Rect | null {
    const x0 = Math.max(rect.x, clip.minX);
    const y0 = Math.max(rect.y, clip.minY);
    const x1 = Math.min(rect.x + rect.width, clip.maxX);
    const y1 = Math.min(rect.y + rect.height, clip.maxY);
    const width = x1 - x0;
    const height = y1 - y0;

    if (width <= 0 || height <= 0) {
        return null;
    }

    return { x: x0, y: y0, width, height };
}

function clipSurfaceRectToTarget(
    rect: Rect,
    surfaceClip: PacketClip,
    offsetX: number,
    offsetY: number,
    targetWidth: number,
    targetHeight: number
): Rect | null {
    const clippedSurfaceRect = clipRect(rect, surfaceClip);
    if (!clippedSurfaceRect) {
        return null;
    }

    return clipRect(
        {
            x: clippedSurfaceRect.x + offsetX,
            y: clippedSurfaceRect.y + offsetY,
            width: clippedSurfaceRect.width,
            height: clippedSurfaceRect.height
        },
        { minX: 0, minY: 0, maxX: targetWidth, maxY: targetHeight }
    );
}

function pushVertex(vertices: number[], x: number, y: number, r: number, g: number, b: number, a: number): void {
    vertices.push(x, y, r, g, b, a);
}

function pushRectVertices(vertices: number[], rect: Rect, rgb: number, targetWidth: number, targetHeight: number, alpha: number = 1): void {
    const x0 = (rect.x / targetWidth) * 2 - 1;
    const x1 = ((rect.x + rect.width) / targetWidth) * 2 - 1;
    const y0 = 1 - (rect.y / targetHeight) * 2;
    const y1 = 1 - ((rect.y + rect.height) / targetHeight) * 2;
    const r = ((rgb >> 16) & 0xff) / 255;
    const g = ((rgb >> 8) & 0xff) / 255;
    const b = (rgb & 0xff) / 255;
    const a = alpha;

    pushVertex(vertices, x0, y0, r, g, b, a);
    pushVertex(vertices, x1, y0, r, g, b, a);
    pushVertex(vertices, x0, y1, r, g, b, a);
    pushVertex(vertices, x0, y1, r, g, b, a);
    pushVertex(vertices, x1, y0, r, g, b, a);
    pushVertex(vertices, x1, y1, r, g, b, a);
}

function pushSurfaceRect(
    vertices: number[],
    rect: Rect,
    rgb: number,
    surfaceClip: PacketClip,
    offsetX: number,
    offsetY: number,
    targetWidth: number,
    targetHeight: number,
    alpha: number = 1
): void {
    const targetRect = clipSurfaceRectToTarget(rect, surfaceClip, offsetX, offsetY, targetWidth, targetHeight);
    if (!targetRect) {
        return;
    }

    pushRectVertices(vertices, targetRect, rgb, targetWidth, targetHeight, alpha);
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

export type WebGpuPacketReplayStats = {
    enabled: boolean;
    framesAttempted: number;
    framesReplayed: number;
    framesFailed: number;
    cpuImageDataUploads: number;
    packetsReplayed: number;
    lastPacketCount: number;
    lastVertexCount: number;
    lastError: string;
};

type WebGpuFramePresenterOptions = {
    validate?: boolean;
    validationSampleInterval?: number;
    packetReplay?: boolean;
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
    private scratchFrameTexture: GpuTexture | null = null;
    private bindGroup: object | null = null;
    private alphaUniformBuffer: GpuBuffer | null = null;
    private spriteAlphaUniformBuffer: GpuBuffer | null = null;
    private primitiveVertexBuffer: GpuBuffer | null = null;
    private primitiveVertexBufferBytes: number = 0;
    private spriteVertexBuffer: GpuBuffer | null = null;
    private spriteVertexBufferBytes: number = 0;
    private readonly spriteTextures = new Map<number, { texture: GpuTexture; bindGroup: object }>();
    private packetCursor: number = 0;
    private packetDropped: number = 0;
    private readonly bufferUsage = getBufferUsage();
    private width: number = 0;
    private height: number = 0;
    private readonly validator: WebGpuFrameValidator | null;
    private readonly packetReplayEnabled: boolean;
    readonly validationStats: WebGpuFrameValidationStats | null;
    readonly packetReplayStats: WebGpuPacketReplayStats;

    private constructor(
        private readonly sourceCanvas: HTMLCanvasElement,
        private readonly overlayCanvas: HTMLCanvasElement,
        private readonly device: GpuDevice,
        private readonly context: GpuCanvasContext,
        private readonly textureFormat: string,
        private readonly sampler: object,
        private readonly pipeline: GpuRenderPipeline,
        private readonly primitivePipeline: GpuRenderPipeline,
        private readonly spritePipeline: GpuRenderPipeline,
        private readonly spriteAlphaPipeline: GpuRenderPipeline,
        private readonly alphaPipeline: GpuRenderPipeline,
        options: WebGpuFramePresenterOptions
    ) {
        this.validator = options.validate ? new WebGpuFrameValidator(device, options.validationSampleInterval || 120) : null;
        this.validationStats = this.validator?.stats ?? null;
        this.packetReplayEnabled = options.packetReplay ?? false;
        this.packetReplayStats = {
            enabled: this.packetReplayEnabled && Boolean(this.bufferUsage?.COPY_DST && this.bufferUsage?.VERTEX && this.bufferUsage?.UNIFORM),
            framesAttempted: 0,
            framesReplayed: 0,
            framesFailed: 0,
            cpuImageDataUploads: 0,
            packetsReplayed: 0,
            lastPacketCount: 0,
            lastVertexCount: 0,
            lastError: ''
        };
        if (this.packetReplayEnabled) {
            gpuRenderPackets.setEnabled(true);
            if (!this.packetReplayStats.enabled) {
                this.packetReplayStats.lastError = 'GPUBufferUsage COPY_DST/VERTEX unavailable';
            }
        }
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
        const primitiveShaderModule = device.createShaderModule({ code: PRIMITIVE_SHADER });
        const primitivePipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: primitiveShaderModule,
                entryPoint: 'vs',
                buffers: [
                    {
                        arrayStride: FLOATS_PER_PRIMITIVE_VERTEX * 4,
                        attributes: [
                            {
                                shaderLocation: 0,
                                offset: 0,
                                format: 'float32x2'
                            },
                            {
                                shaderLocation: 1,
                                offset: 2 * 4,
                                format: 'float32x4'
                            }
                        ]
                    }
                ]
            },
            fragment: {
                module: primitiveShaderModule,
                entryPoint: 'fs',
                targets: [{ format: FRAME_TEXTURE_FORMAT }]
            },
            primitive: {
                topology: 'triangle-list'
            }
        });
        const spriteShaderModule = device.createShaderModule({ code: SPRITE_SHADER });
        const spritePipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: spriteShaderModule,
                entryPoint: 'vs',
                buffers: [
                    {
                        arrayStride: FLOATS_PER_SPRITE_VERTEX * 4,
                        attributes: [
                            {
                                shaderLocation: 0,
                                offset: 0,
                                format: 'float32x2'
                            },
                            {
                                shaderLocation: 1,
                                offset: 2 * 4,
                                format: 'float32x2'
                            }
                        ]
                    }
                ]
            },
            fragment: {
                module: spriteShaderModule,
                entryPoint: 'fs',
                targets: [
                    {
                        format: FRAME_TEXTURE_FORMAT,
                        blend: {
                            color: {
                                operation: 'add',
                                srcFactor: 'src-alpha',
                                dstFactor: 'one-minus-src-alpha'
                            },
                            alpha: {
                                operation: 'add',
                                srcFactor: 'one',
                                dstFactor: 'one-minus-src-alpha'
                            }
                        }
                    }
                ]
            },
            primitive: {
                topology: 'triangle-list'
            }
        });
        const alphaShaderModule = device.createShaderModule({ code: ALPHA_SHADER });
        const spriteAlphaShaderModule = device.createShaderModule({ code: SPRITE_ALPHA_SHADER });
        const alphaPipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: alphaShaderModule,
                entryPoint: 'vs'
            },
            fragment: {
                module: alphaShaderModule,
                entryPoint: 'fs',
                targets: [{ format: FRAME_TEXTURE_FORMAT }]
            },
            primitive: {
                topology: 'triangle-list'
            }
        });
        const spriteAlphaPipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: spriteAlphaShaderModule,
                entryPoint: 'vs'
            },
            fragment: {
                module: spriteAlphaShaderModule,
                entryPoint: 'fs',
                targets: [{ format: FRAME_TEXTURE_FORMAT }]
            },
            primitive: {
                topology: 'triangle-list'
            }
        });

        if (!installOverlayCanvas(sourceCanvas, overlayCanvas)) {
            overlayCanvas.remove();
            return null;
        }

        const presenter = new WebGpuFramePresenter(sourceCanvas, overlayCanvas, device, context, textureFormat, sampler, pipeline, primitivePipeline, spritePipeline, spriteAlphaPipeline, alphaPipeline, options);
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

        if (this.packetReplayEnabled) {
            this.replayPacketsOrThrow(imageData.width, imageData.height, x, y);
            this.validator?.maybeValidate(this.frameTexture, imageData, sourceX, sourceY, dstX, dstY, copyWidth, copyHeight);
            this.draw();
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
        this.packetReplayStats.cpuImageDataUploads++;
        this.validator?.maybeValidate(this.frameTexture, imageData, sourceX, sourceY, dstX, dstY, copyWidth, copyHeight);

        this.draw();
        return true;
    }

    presentPackets(surfaceWidth: number, surfaceHeight: number, x: number, y: number, expectedImageData: ImageData | null = null): boolean {
        if (!this.frameTexture || !this.bindGroup) {
            return false;
        }

        if (!this.packetReplayEnabled) {
            throw new Error('WebGPU packet presentation requested but packet replay is disabled');
        }

        this.syncCanvasSize();

        const sourceX = Math.max(0, -(x | 0));
        const sourceY = Math.max(0, -(y | 0));
        const dstX = Math.max(0, x | 0);
        const dstY = Math.max(0, y | 0);
        const copyWidth = Math.min(surfaceWidth - sourceX, this.width - dstX);
        const copyHeight = Math.min(surfaceHeight - sourceY, this.height - dstY);
        if (copyWidth <= 0 || copyHeight <= 0) {
            return true;
        }

        this.replayPacketsOrThrow(surfaceWidth, surfaceHeight, x, y);
        if (expectedImageData) {
            this.validator?.maybeValidate(this.frameTexture, expectedImageData, sourceX, sourceY, dstX, dstY, copyWidth, copyHeight);
        }

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
        this.scratchFrameTexture?.destroy();
        this.width = Math.max(1, this.sourceCanvas.width);
        this.height = Math.max(1, this.sourceCanvas.height);

        this.frameTexture = this.createFrameTexture();
        this.scratchFrameTexture = this.createFrameTexture();
        this.recreateDisplayBindGroup();

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

    private createFrameTexture(): GpuTexture {
        return this.device.createTexture({
            size: {
                width: this.width,
                height: this.height,
                depthOrArrayLayers: 1
            },
            format: 'rgba8unorm',
            usage: getTextureUsage()!.COPY_SRC | getTextureUsage()!.COPY_DST | getTextureUsage()!.TEXTURE_BINDING | getTextureUsage()!.RENDER_ATTACHMENT
        });
    }

    private recreateDisplayBindGroup(): void {
        if (!this.frameTexture) {
            this.bindGroup = null;
            return;
        }

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
    }

    private replayPacketsOrThrow(surfaceWidth: number, surfaceHeight: number, x: number, y: number): void {
        if (!this.packetReplayStats.enabled || !this.frameTexture) {
            this.failPacketReplay(this.packetReplayStats.lastError || 'packet replay requested but WebGPU vertex replay is unavailable');
        }

        const snapshot = gpuRenderPackets.snapshot();
        if (!snapshot.enabled) {
            this.failPacketReplay('packet replay requested but packet recording is disabled');
        }

        if (snapshot.packets.length === this.packetCursor && snapshot.dropped === this.packetDropped) {
            this.failPacketReplay('packet replay requested but no new packets were recorded');
        }

        this.packetReplayStats.framesAttempted++;

        if (snapshot.packets.length < this.packetCursor) {
            this.packetCursor = 0;
            this.failPacketReplay('packet stream reset');
        }

        if (snapshot.dropped !== this.packetDropped) {
            this.failPacketReplay('packet stream dropped packets');
        }

        const surface = snapshot.surfaces.find(item => item.id === snapshot.currentSurface);
        if (!surface || surface.width !== surfaceWidth || surface.height !== surfaceHeight) {
            this.failPacketReplay('current packet surface does not match presentation surface');
        }

        const result = this.buildPacketReplayVertices(snapshot, x | 0, y | 0, surface.width, surface.height);
        this.packetReplayStats.lastPacketCount = result.packetCount;
        const vertexCount = result.steps.reduce((total, step) => total + (step.kind === 'vertices' ? step.vertices.length / FLOATS_PER_PRIMITIVE_VERTEX : 6), 0);
        if (result.steps.length === 0) {
            this.failPacketReplay('no drawable 2D packets');
        }

        this.replayPrimitiveSteps(result.steps);
        this.packetCursor = snapshot.packets.length;
        this.packetDropped = snapshot.dropped;
        this.packetReplayStats.framesReplayed++;
        this.packetReplayStats.packetsReplayed += result.packetCount;
        this.packetReplayStats.lastVertexCount = vertexCount;
        this.packetReplayStats.lastError = '';
    }

    private buildPacketReplayVertices(
        snapshot: GpuRenderPacketSnapshot,
        offsetX: number,
        offsetY: number,
        surfaceWidth: number,
        surfaceHeight: number
    ): PacketReplayBuildResult {
        const steps: PacketReplayStep[] = [];
        let vertices: number[] = [];
        let packetCount = 0;
        let clip: PacketClip = { minX: 0, minY: 0, maxX: surfaceWidth, maxY: surfaceHeight };
        const targetSurface = snapshot.currentSurface;
        const packets = snapshot.packets.slice(this.packetCursor);

        const flushVertices = (): void => {
            if (vertices.length === 0) {
                return;
            }

            steps.push({ kind: 'vertices', vertices: new Float32Array(vertices) });
            vertices = [];
        };
        const pushAlphaRect = (rect: Rect, rgb: number, packetClip: PacketClip, alpha: number): void => {
            const targetRect = clipSurfaceRectToTarget(rect, packetClip, offsetX, offsetY, this.width, this.height);
            if (!targetRect) {
                return;
            }

            flushVertices();
            steps.push({ kind: 'alpha', op: { kind: 'rect', rect: targetRect, rgb, alpha } });
        };
        const pushPacketRect = (rect: Rect, rgb: number, packetClip: PacketClip, alpha: number | null = null): void => {
            if (alpha !== null) {
                pushAlphaRect(rect, rgb, packetClip, alpha);
                return;
            }

            pushSurfaceRect(vertices, rect, rgb, packetClip, offsetX, offsetY, this.width, this.height);
        };

        for (const packet of packets) {
            if (packet.kind === 'surface') {
                continue;
            }

            if (packet.surface !== targetSurface) {
                continue;
            }

            packetCount++;
            switch (packet.kind) {
                case 'unsupported':
                    this.failPacketReplay(packet.reason);
                    break;
                case 'clip':
                    clip = packet.clip;
                    break;
                case 'clear':
                    pushPacketRect(
                        { x: 0, y: 0, width: surfaceWidth, height: surfaceHeight },
                        0,
                        { minX: 0, minY: 0, maxX: surfaceWidth, maxY: surfaceHeight }
                    );
                    break;
                case 'fillRect':
                    pushPacketRect(packet, packet.rgb, clip, packet.alpha);
                    break;
                case 'line':
                    pushPacketRect(
                        {
                            x: packet.x,
                            y: packet.y,
                            width: packet.axis === 'h' ? packet.length : 1,
                            height: packet.axis === 'h' ? 1 : packet.length
                        },
                        packet.rgb,
                        clip,
                        packet.alpha
                    );
                    break;
                case 'fillCircle': {
                    const clipTarget = clipSurfaceRectToTarget(
                        { x: 0, y: 0, width: surfaceWidth, height: surfaceHeight },
                        { minX: 0, minY: 0, maxX: surfaceWidth, maxY: surfaceHeight },
                        offsetX,
                        offsetY,
                        this.width,
                        this.height
                    );
                    if (clipTarget) {
                        flushVertices();
                        steps.push({
                            kind: 'alpha',
                            op: {
                                kind: 'circle',
                                xCenter: packet.xCenter + offsetX,
                                yCenter: packet.yCenter + offsetY,
                                yRadius: packet.yRadius,
                                clip: clipTarget,
                                rgb: packet.rgb,
                                alpha: packet.alpha
                            }
                        });
                    }
                    break;
                }
                case 'rgbaSprite': {
                    const sourceRect = { x: packet.x, y: packet.y, width: packet.width, height: packet.height };
                    const clippedSurfaceRect = clipRect(sourceRect, packet.clip);
                    if (!clippedSurfaceRect) {
                        break;
                    }

                    const unclippedTargetRect = {
                        x: clippedSurfaceRect.x + offsetX,
                        y: clippedSurfaceRect.y + offsetY,
                        width: clippedSurfaceRect.width,
                        height: clippedSurfaceRect.height
                    };
                    const targetRect = clipRect(unclippedTargetRect, { minX: 0, minY: 0, maxX: this.width, maxY: this.height });
                    if (!targetRect) {
                        break;
                    }

                    flushVertices();
                    steps.push({
                        kind: 'sprite',
                        op: {
                            resource: packet.resource,
                            rect: targetRect,
                            srcX: packet.srcX + ((clippedSurfaceRect.x - packet.x) + (targetRect.x - unclippedTargetRect.x)) * (packet.srcWidth / packet.width),
                            srcY: packet.srcY + ((clippedSurfaceRect.y - packet.y) + (targetRect.y - unclippedTargetRect.y)) * (packet.srcHeight / packet.height),
                            srcWidth: targetRect.width * (packet.srcWidth / packet.width),
                            srcHeight: targetRect.height * (packet.srcHeight / packet.height),
                            alpha: packet.alpha
                        }
                    });
                    break;
                }
                default:
                    this.failPacketReplay(`${packet.kind} packets are not replayed yet`);
            }
        }

        flushVertices();
        return { steps, packetCount };
    }

    private replayPrimitiveSteps(steps: PacketReplayStep[]): void {
        for (const step of steps) {
            if (step.kind === 'vertices') {
                this.replayPrimitiveVertices(step.vertices);
            } else if (step.kind === 'alpha') {
                this.replayAlphaOp(step.op);
            } else {
                const resource = gpuRenderPackets.snapshot().spriteResources.find(item => item.id === step.op.resource);
                if (!resource) {
                    this.failPacketReplay(`sprite resource ${step.op.resource} is missing`);
                }
                if (step.op.alpha === null && step.op.srcX === Math.trunc(step.op.srcX) && step.op.srcY === Math.trunc(step.op.srcY) && step.op.srcWidth === step.op.rect.width && step.op.srcHeight === step.op.rect.height) {
                    this.replaySpriteOp(step.op, resource);
                } else {
                    this.replayAlphaSpriteOp(step.op, resource);
                }
            }
        }
    }

    private replayPrimitiveVertices(vertices: Float32Array): void {
        this.ensurePrimitiveVertexBuffer(vertices.byteLength);
        this.device.queue.writeBuffer(this.primitiveVertexBuffer!, 0, vertices);

        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.frameTexture!.createView(),
                    loadOp: 'load',
                    storeOp: 'store'
                }
            ]
        });

        pass.setPipeline(this.primitivePipeline);
        pass.setVertexBuffer(0, this.primitiveVertexBuffer!);
        pass.draw(vertices.length / FLOATS_PER_PRIMITIVE_VERTEX);
        pass.end();
        this.device.queue.submit([encoder.finish()]);
    }

    private replayAlphaOp(op: AlphaReplayOp): void {
        if (!this.frameTexture || !this.scratchFrameTexture) {
            this.failPacketReplay('alpha replay requested before frame textures exist');
        }

        this.ensureAlphaUniformBuffer();
        const params = new Int32Array(ALPHA_UNIFORM_INTS);
        if (op.kind === 'rect') {
            params[0] = 0;
            params[1] = op.rect.x;
            params[2] = op.rect.y;
            params[3] = op.rect.width;
            params[4] = op.rect.height;
            params[10] = op.rect.x;
            params[11] = op.rect.y;
            params[12] = op.rect.x + op.rect.width;
            params[13] = op.rect.y + op.rect.height;
        } else {
            params[0] = 1;
            params[5] = op.xCenter;
            params[6] = op.yCenter;
            params[7] = op.yRadius;
            params[10] = op.clip.x;
            params[11] = op.clip.y;
            params[12] = op.clip.x + op.clip.width;
            params[13] = op.clip.y + op.clip.height;
        }
        params[8] = op.rgb;
        params[9] = op.alpha;
        this.device.queue.writeBuffer(this.alphaUniformBuffer!, 0, params);

        const bindGroup = this.device.createBindGroup({
            layout: this.alphaPipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: this.frameTexture.createView()
                },
                {
                    binding: 1,
                    resource: {
                        buffer: this.alphaUniformBuffer
                    }
                }
            ]
        });
        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.scratchFrameTexture.createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: 'clear',
                    storeOp: 'store'
                }
            ]
        });

        pass.setPipeline(this.alphaPipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(6);
        pass.end();
        this.device.queue.submit([encoder.finish()]);

        const oldFrameTexture = this.frameTexture;
        this.frameTexture = this.scratchFrameTexture;
        this.scratchFrameTexture = oldFrameTexture;
        this.recreateDisplayBindGroup();
    }

    private replaySpriteOp(op: SpriteReplayOp, resource: GpuSpriteResource): void {
        const cached = this.getSpriteTexture(resource);
        const vertices = this.buildSpriteVertices(op, resource);
        this.ensureSpriteVertexBuffer(vertices.byteLength);
        this.device.queue.writeBuffer(this.spriteVertexBuffer!, 0, vertices);

        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.frameTexture!.createView(),
                    loadOp: 'load',
                    storeOp: 'store'
                }
            ]
        });

        pass.setPipeline(this.spritePipeline);
        pass.setBindGroup(0, cached.bindGroup);
        pass.setVertexBuffer(0, this.spriteVertexBuffer!);
        pass.draw(6);
        pass.end();
        this.device.queue.submit([encoder.finish()]);
    }

    private replayAlphaSpriteOp(op: SpriteReplayOp, resource: GpuSpriteResource): void {
        if (!this.frameTexture || !this.scratchFrameTexture) {
            this.failPacketReplay('alpha sprite replay requested before frame textures exist');
        }

        const cached = this.getSpriteTexture(resource);
        this.ensureSpriteAlphaUniformBuffer();
        const params = new Int32Array(SPRITE_ALPHA_UNIFORM_INTS);
        params[0] = op.rect.x;
        params[1] = op.rect.y;
        params[2] = op.rect.width;
        params[3] = op.rect.height;
        params[4] = Math.trunc(op.srcX * 65536);
        params[5] = Math.trunc(op.srcY * 65536);
        params[6] = op.alpha ?? 256;
        params[7] = Math.trunc((op.srcWidth * 65536) / op.rect.width);
        params[8] = Math.trunc((op.srcHeight * 65536) / op.rect.height);
        this.device.queue.writeBuffer(this.spriteAlphaUniformBuffer!, 0, params);

        const bindGroup = this.device.createBindGroup({
            layout: this.spriteAlphaPipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: this.frameTexture.createView()
                },
                {
                    binding: 1,
                    resource: cached.texture.createView()
                },
                {
                    binding: 2,
                    resource: {
                        buffer: this.spriteAlphaUniformBuffer
                    }
                }
            ]
        });
        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.scratchFrameTexture.createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: 'clear',
                    storeOp: 'store'
                }
            ]
        });

        pass.setPipeline(this.spriteAlphaPipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(6);
        pass.end();
        this.device.queue.submit([encoder.finish()]);

        const oldFrameTexture = this.frameTexture;
        this.frameTexture = this.scratchFrameTexture;
        this.scratchFrameTexture = oldFrameTexture;
        this.recreateDisplayBindGroup();
    }

    private buildSpriteVertices(op: SpriteReplayOp, resource: GpuSpriteResource): Float32Array {
        const x0 = (op.rect.x / this.width) * 2 - 1;
        const x1 = ((op.rect.x + op.rect.width) / this.width) * 2 - 1;
        const y0 = 1 - (op.rect.y / this.height) * 2;
        const y1 = 1 - ((op.rect.y + op.rect.height) / this.height) * 2;
        const u0 = op.srcX / resource.width;
        const u1 = (op.srcX + op.srcWidth) / resource.width;
        const v0 = op.srcY / resource.height;
        const v1 = (op.srcY + op.srcHeight) / resource.height;

        return new Float32Array([
            x0, y0, u0, v0,
            x1, y0, u1, v0,
            x0, y1, u0, v1,
            x0, y1, u0, v1,
            x1, y0, u1, v0,
            x1, y1, u1, v1
        ]);
    }

    private getSpriteTexture(resource: GpuSpriteResource): { texture: GpuTexture; bindGroup: object } {
        const cached = this.spriteTextures.get(resource.id);
        if (cached) {
            return cached;
        }

        const texture = this.device.createTexture({
            size: {
                width: resource.width,
                height: resource.height,
                depthOrArrayLayers: 1
            },
            format: 'rgba8unorm',
            usage: getTextureUsage()!.COPY_DST | getTextureUsage()!.TEXTURE_BINDING
        });
        this.device.queue.writeTexture(
            { texture },
            resource.rgba,
            {
                offset: 0,
                bytesPerRow: resource.width * 4,
                rowsPerImage: resource.height
            },
            {
                width: resource.width,
                height: resource.height,
                depthOrArrayLayers: 1
            }
        );
        const bindGroup = this.device.createBindGroup({
            layout: this.spritePipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: texture.createView()
                },
                {
                    binding: 1,
                    resource: this.sampler
                }
            ]
        });
        const value = { texture, bindGroup };
        this.spriteTextures.set(resource.id, value);
        return value;
    }

    private ensurePrimitiveVertexBuffer(byteLength: number): void {
        if (this.primitiveVertexBuffer && this.primitiveVertexBufferBytes >= byteLength) {
            return;
        }

        this.primitiveVertexBuffer?.destroy();
        this.primitiveVertexBufferBytes = alignTo(Math.max(byteLength, 4), 4);
        this.primitiveVertexBuffer = this.device.createBuffer({
            size: this.primitiveVertexBufferBytes,
            usage: this.bufferUsage!.COPY_DST | this.bufferUsage!.VERTEX
        });
    }

    private ensureSpriteVertexBuffer(byteLength: number): void {
        if (this.spriteVertexBuffer && this.spriteVertexBufferBytes >= byteLength) {
            return;
        }

        this.spriteVertexBuffer?.destroy();
        this.spriteVertexBufferBytes = alignTo(Math.max(byteLength, 4), 4);
        this.spriteVertexBuffer = this.device.createBuffer({
            size: this.spriteVertexBufferBytes,
            usage: this.bufferUsage!.COPY_DST | this.bufferUsage!.VERTEX
        });
    }

    private ensureAlphaUniformBuffer(): void {
        if (this.alphaUniformBuffer) {
            return;
        }

        this.alphaUniformBuffer = this.device.createBuffer({
            size: ALPHA_UNIFORM_INTS * 4,
            usage: this.bufferUsage!.COPY_DST | this.bufferUsage!.UNIFORM
        });
    }

    private ensureSpriteAlphaUniformBuffer(): void {
        if (this.spriteAlphaUniformBuffer) {
            return;
        }

        this.spriteAlphaUniformBuffer = this.device.createBuffer({
            size: SPRITE_ALPHA_UNIFORM_INTS * 4,
            usage: this.bufferUsage!.COPY_DST | this.bufferUsage!.UNIFORM
        });
    }

    private failPacketReplay(reason: string): never {
        this.packetReplayStats.framesFailed++;
        this.packetReplayStats.lastError = reason;
        throw new Error(`[WebGPU packet replay] ${reason}`);
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
        this.scratchFrameTexture?.destroy();
        this.primitiveVertexBuffer?.destroy();
        this.spriteVertexBuffer?.destroy();
        this.alphaUniformBuffer?.destroy();
        this.spriteAlphaUniformBuffer?.destroy();
        for (const cached of this.spriteTextures.values()) {
            cached.texture.destroy();
        }
        this.spriteTextures.clear();
        this.frameTexture = null;
        this.scratchFrameTexture = null;
        this.bindGroup = null;
        this.primitiveVertexBuffer = null;
        this.spriteVertexBuffer = null;
        this.alphaUniformBuffer = null;
        this.spriteAlphaUniformBuffer = null;
        this.overlayCanvas.remove();
    }
}
