import { gpuRenderPackets, type GpuColourTableResource, type GpuGlyphResource, type GpuIndexedSpriteResource, type GpuRenderPacket, type GpuRenderPacketSnapshot, type GpuSpriteResource, type GpuTextureResource } from '#/graphics/GpuRenderPackets.js';

type BrowserGpu = {
    requestAdapter(options?: { powerPreference?: 'high-performance' | 'low-power' }): Promise<GpuAdapter | null>;
    getPreferredCanvasFormat(): string;
};

export type WebGpuAdapterInfo = {
    vendor: string;
    architecture: string;
    device: string;
    description: string;
};

type GpuAdapter = {
    readonly info?: Partial<WebGpuAdapterInfo>;
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
    copyTextureToTexture(source: object, destination: object, size: object): void;
    copyTextureToBuffer(source: object, destination: object, size: object): void;
    finish(): object;
};

type GpuRenderPass = {
    setPipeline(pipeline: GpuRenderPipeline): void;
    setBindGroup(index: number, bindGroup: object): void;
    setVertexBuffer(slot: number, buffer: GpuBuffer, offset?: number, size?: number): void;
    draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number): void;
    end(): void;
};

type GpuCanvasContext = {
    configure(descriptor: object): void;
    getCurrentTexture(): GpuTexture;
};

type OverlayCanvasStack = {
    wrapper: HTMLDivElement;
    sourceDisplay: string;
    sourcePosition: string;
    sourceZIndex: string;
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

const RECT_INSTANCE_SHADER = `
struct VertexInput {
    @location(0) rect: vec4f,
    @location(1) colour: vec4f,
};

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) colour: vec4f,
};

struct RectInstanceParams {
    targetWidth: f32,
    targetHeight: f32,
    _pad0: f32,
    _pad1: f32,
};

@group(0) @binding(0) var<uniform> params: RectInstanceParams;

@vertex
fn vs(input: VertexInput, @builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    let local = array<vec2f, 6>(
        vec2f(0.0, 0.0),
        vec2f(1.0, 0.0),
        vec2f(0.0, 1.0),
        vec2f(0.0, 1.0),
        vec2f(1.0, 0.0),
        vec2f(1.0, 1.0)
    );
    let pixel = input.rect.xy + local[vertexIndex] * input.rect.zw;

    var output: VertexOutput;
    output.position = vec4f((pixel.x / params.targetWidth) * 2.0 - 1.0, 1.0 - (pixel.y / params.targetHeight) * 2.0, 0.0, 1.0);
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
    @location(0) @interpolate(flat) paramBase: u32,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
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
    output.paramBase = instanceIndex;
    return output;
}

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var<storage, read> alphaParams: array<i32>;

fn param(base: u32, index: u32) -> i32 {
    return alphaParams[base + index];
}

fn edgeStep(x0: i32, y0: i32, x1: i32, y1: i32) -> i32 {
    if (y0 == y1) {
        return 0;
    }

    return ((x1 - x0) * 65536) / (y1 - y0);
}

fn edgeX(x0: i32, y0: i32, step: i32, y: i32) -> i32 {
    return (x0 * 65536 + step * (y - y0)) >> 16;
}

fn shortEdgeX(xTop: i32, yTop: i32, xMid: i32, yMid: i32, xBot: i32, yBot: i32, upperStep: i32, lowerStep: i32, y: i32) -> i32 {
    if (y < yMid) {
        return edgeX(xTop, yTop, upperStep, y);
    }

    return edgeX(xMid, yMid, lowerStep, y);
}

fn inOrderedTriangle(pixel: vec2<i32>, base: u32, xTop: i32, yTop: i32, xMid: i32, yMid: i32, xBot: i32, yBot: i32) -> bool {
    if (yTop >= yBot || pixel.y < yTop || pixel.y >= yBot) {
        return false;
    }

    let longStep = edgeStep(xTop, yTop, xBot, yBot);
    let upperStep = edgeStep(xTop, yTop, xMid, yMid);
    let lowerStep = edgeStep(xMid, yMid, xBot, yBot);
    let longX = edgeX(xTop, yTop, longStep, pixel.y);
    let shortX = shortEdgeX(xTop, yTop, xMid, yMid, xBot, yBot, upperStep, lowerStep, pixel.y);

    var sampleY = max(yTop, param(base, 10u));
    if (sampleY >= yBot) {
        sampleY = yTop;
    }
    let sampleLong = edgeX(xTop, yTop, longStep, sampleY);
    let sampleShort = shortEdgeX(xTop, yTop, xMid, yMid, xBot, yBot, upperStep, lowerStep, sampleY);
    var longLeft = sampleLong < sampleShort;
    if (sampleLong == sampleShort) {
        if (yTop == yMid) {
            longLeft = xTop < xMid;
        } else {
            longLeft = longStep < upperStep;
        }
    }

    var startX: i32;
    var endX: i32;
    if (longLeft) {
        startX = longX;
        endX = shortX;
    } else {
        startX = shortX;
        endX = longX;
    }

    return pixel.x >= startX && pixel.x < endX;
}

fn inFlatTriangle(pixel: vec2<i32>, base: u32) -> bool {
    let xA = param(base, 1u);
    let yA = param(base, 2u);
    let xB = param(base, 3u);
    let yB = param(base, 4u);
    let xC = param(base, 5u);
    let yC = param(base, 6u);

    if (yA <= yB && yA <= yC) {
        if (yB < yC) {
            return inOrderedTriangle(pixel, base, xA, yA, xB, yB, xC, yC);
        }
        return inOrderedTriangle(pixel, base, xA, yA, xC, yC, xB, yB);
    }

    if (yB <= yC) {
        if (yC < yA) {
            return inOrderedTriangle(pixel, base, xB, yB, xC, yC, xA, yA);
        }
        return inOrderedTriangle(pixel, base, xB, yB, xA, yA, xC, yC);
    }

    if (yA < yB) {
        return inOrderedTriangle(pixel, base, xC, yC, xA, yA, xB, yB);
    }
    return inOrderedTriangle(pixel, base, xC, yC, xB, yB, xA, yA);
}

fn inAlphaShape(pixel: vec2<i32>, base: u32) -> bool {
    if (pixel.x < param(base, 10u) || pixel.x >= param(base, 12u) || pixel.y < param(base, 11u) || pixel.y >= param(base, 13u)) {
        return false;
    }

    if (param(base, 0u) == 0) {
        return pixel.x >= param(base, 1u) && pixel.x < param(base, 1u) + param(base, 3u) && pixel.y >= param(base, 2u) && pixel.y < param(base, 2u) + param(base, 4u);
    }

    if (param(base, 0u) == 2) {
        return inFlatTriangle(pixel, base);
    }

    let dy = pixel.y - param(base, 6u);
    if (dy < -param(base, 7u) || dy > param(base, 7u)) {
        return false;
    }

    let radiusSquared = param(base, 7u) * param(base, 7u);
    let xRadius = i32(sqrt(f32(radiusSquared - dy * dy)));
    return pixel.x >= param(base, 5u) - xRadius && pixel.x <= param(base, 5u) + xRadius;
}

fn toByte(channel: f32) -> u32 {
    return u32(round(clamp(channel, 0.0, 1.0) * 255.0));
}

fn blendChannel(src: u32, dst: u32, alpha: u32) -> u32 {
    return ((src * alpha) >> 8u) + ((dst * (256u - alpha)) >> 8u);
}

fn nextPixel(pixel: vec2<i32>) -> vec2<i32> {
    let size = textureDimensions(sourceTexture);
    let index = min(pixel.x + pixel.y * i32(size.x) + 1, i32(size.x * size.y) - 1);
    return vec2<i32>(index % i32(size.x), index / i32(size.x));
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
    let pixel = vec2<i32>(floor(input.position.xy));
    let base = textureLoad(sourceTexture, pixel, 0);

    if (!inAlphaShape(pixel, input.paramBase)) {
        return vec4f(base.rgb, 1.0);
    }

    let rgb = u32(param(input.paramBase, 8u));
    let alpha = u32(param(input.paramBase, 9u));
    let srcR = (rgb >> 16u) & 255u;
    let srcG = (rgb >> 8u) & 255u;
    let srcB = rgb & 255u;
    var blendBase = base;
    if (param(input.paramBase, 0u) == 2 && alpha < 256u) {
        blendBase = textureLoad(sourceTexture, nextPixel(pixel), 0);
    }
    let dstR = toByte(blendBase.r);
    let dstG = toByte(blendBase.g);
    let dstB = toByte(blendBase.b);

    let outR = blendChannel(srcR, dstR, alpha);
    let outG = blendChannel(srcG, dstG, alpha);
    let outB = blendChannel(srcB, dstB, alpha);
    return vec4f(f32(outR) / 255.0, f32(outG) / 255.0, f32(outB) / 255.0, 1.0);
}
`;

const MODEL_FLAT_SHADER = `
struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) @interpolate(flat) paramBase: u32,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
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
    output.paramBase = instanceIndex;
    return output;
}

struct ModelFlatParams {
    xA: i32,
    yA: i32,
    zA: i32,
    xB: i32,
    yB: i32,
    zB: i32,
    xC: i32,
    yC: i32,
    zC: i32,
    sinYaw: i32,
    cosYaw: i32,
    sinEyePitch: i32,
    cosEyePitch: i32,
    sinEyeYaw: i32,
    cosEyeYaw: i32,
    relativeX: i32,
    relativeY: i32,
    relativeZ: i32,
    originX: i32,
    originY: i32,
    rgb: i32,
    alpha: i32,
    clipMinX: i32,
    clipMinY: i32,
    clipMaxX: i32,
    clipMaxY: i32,
    _pad0: i32,
    _pad1: i32,
    _pad2: i32,
    _pad3: i32,
    _pad4: i32,
    _pad5: i32,
};

struct ProjectedVertex {
    x: i32,
    y: i32,
    z: i32,
    valid: i32,
};

struct FragmentOutput {
    @location(0) colour: vec4f,
    @builtin(frag_depth) depth: f32,
};

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var<storage, read> modelFlatParams: array<i32>;

fn modelFlatParam(base: u32, index: u32) -> i32 {
    return modelFlatParams[base + index];
}

fn projectLocal(base: u32, localX: i32, localY: i32, localZ: i32) -> ProjectedVertex {
    var x = localX;
    var y = localY;
    var z = localZ;
    var tmp = (z * modelFlatParam(base, 9u) + x * modelFlatParam(base, 10u)) >> 16;
    z = (z * modelFlatParam(base, 10u) - x * modelFlatParam(base, 9u)) >> 16;
    x = tmp;

    x = x + modelFlatParam(base, 15u);
    y = y + modelFlatParam(base, 16u);
    z = z + modelFlatParam(base, 17u);

    tmp = (z * modelFlatParam(base, 13u) + x * modelFlatParam(base, 14u)) >> 16;
    z = (z * modelFlatParam(base, 14u) - x * modelFlatParam(base, 13u)) >> 16;
    x = tmp;

    tmp = (y * modelFlatParam(base, 12u) - z * modelFlatParam(base, 11u)) >> 16;
    z = (y * modelFlatParam(base, 11u) + z * modelFlatParam(base, 12u)) >> 16;
    y = tmp;

    if (z < 50) {
        return ProjectedVertex(0, 0, z, 0);
    }

    return ProjectedVertex(modelFlatParam(base, 18u) + ((x << 9) / z), modelFlatParam(base, 19u) + ((y << 9) / z), z, 1);
}

fn edgeStep(x0: i32, y0: i32, x1: i32, y1: i32) -> i32 {
    if (y0 == y1) {
        return 0;
    }

    return ((x1 - x0) * 65536) / (y1 - y0);
}

fn edgeX(x0: i32, y0: i32, step: i32, y: i32) -> i32 {
    return (x0 * 65536 + step * (y - y0)) >> 16;
}

fn shortEdgeX(xTop: i32, yTop: i32, xMid: i32, yMid: i32, xBot: i32, yBot: i32, upperStep: i32, lowerStep: i32, y: i32) -> i32 {
    if (y < yMid) {
        return edgeX(xTop, yTop, upperStep, y);
    }

    return edgeX(xMid, yMid, lowerStep, y);
}

fn inOrderedTriangle(base: u32, pixel: vec2<i32>, xTop: i32, yTop: i32, xMid: i32, yMid: i32, xBot: i32, yBot: i32) -> bool {
    if (yTop >= yBot || pixel.y < yTop || pixel.y >= yBot) {
        return false;
    }

    let longStep = edgeStep(xTop, yTop, xBot, yBot);
    let upperStep = edgeStep(xTop, yTop, xMid, yMid);
    let lowerStep = edgeStep(xMid, yMid, xBot, yBot);
    let longX = edgeX(xTop, yTop, longStep, pixel.y);
    let shortX = shortEdgeX(xTop, yTop, xMid, yMid, xBot, yBot, upperStep, lowerStep, pixel.y);

    var sampleY = max(yTop, modelFlatParam(base, 23u));
    if (sampleY >= yBot) {
        sampleY = yTop;
    }
    let sampleLong = edgeX(xTop, yTop, longStep, sampleY);
    let sampleShort = shortEdgeX(xTop, yTop, xMid, yMid, xBot, yBot, upperStep, lowerStep, sampleY);
    var longLeft = sampleLong < sampleShort;
    if (sampleLong == sampleShort) {
        if (yTop == yMid) {
            longLeft = xTop < xMid;
        } else {
            longLeft = longStep < upperStep;
        }
    }

    var startX: i32;
    var endX: i32;
    if (longLeft) {
        startX = longX;
        endX = shortX;
    } else {
        startX = shortX;
        endX = longX;
    }

    return pixel.x >= startX && pixel.x < endX;
}

fn inProjectedTriangle(base: u32, pixel: vec2<i32>) -> bool {
    if (pixel.x < modelFlatParam(base, 22u) || pixel.x >= modelFlatParam(base, 24u) || pixel.y < modelFlatParam(base, 23u) || pixel.y >= modelFlatParam(base, 25u)) {
        return false;
    }

    let a = projectLocal(base, modelFlatParam(base, 0u), modelFlatParam(base, 1u), modelFlatParam(base, 2u));
    let b = projectLocal(base, modelFlatParam(base, 3u), modelFlatParam(base, 4u), modelFlatParam(base, 5u));
    let c = projectLocal(base, modelFlatParam(base, 6u), modelFlatParam(base, 7u), modelFlatParam(base, 8u));
    if (a.valid == 0 || b.valid == 0 || c.valid == 0) {
        return false;
    }

    if (a.y <= b.y && a.y <= c.y) {
        if (b.y < c.y) {
            return inOrderedTriangle(base, pixel, a.x, a.y, b.x, b.y, c.x, c.y);
        }
        return inOrderedTriangle(base, pixel, a.x, a.y, c.x, c.y, b.x, b.y);
    }

    if (b.y <= c.y) {
        if (c.y < a.y) {
            return inOrderedTriangle(base, pixel, b.x, b.y, c.x, c.y, a.x, a.y);
        }
        return inOrderedTriangle(base, pixel, b.x, b.y, a.x, a.y, c.x, c.y);
    }

    if (a.y < b.y) {
        return inOrderedTriangle(base, pixel, c.x, c.y, a.x, a.y, b.x, b.y);
    }
    return inOrderedTriangle(base, pixel, c.x, c.y, b.x, b.y, a.x, a.y);
}

fn toByte(channel: f32) -> u32 {
    return u32(round(clamp(channel, 0.0, 1.0) * 255.0));
}

fn blendChannel(src: u32, dst: u32, alpha: u32) -> u32 {
    return ((src * alpha) >> 8u) + ((dst * (256u - alpha)) >> 8u);
}

fn nextPixel(pixel: vec2<i32>) -> vec2<i32> {
    let size = textureDimensions(sourceTexture);
    let index = min(pixel.x + pixel.y * i32(size.x) + 1, i32(size.x * size.y) - 1);
    return vec2<i32>(index % i32(size.x), index / i32(size.x));
}

@fragment
fn fs(input: VertexOutput) -> FragmentOutput {
    let pixel = vec2<i32>(floor(input.position.xy));
    let paramBase = input.paramBase;
    if (!inProjectedTriangle(paramBase, pixel)) {
        discard;
    }

    let a = projectLocal(paramBase, modelFlatParam(paramBase, 0u), modelFlatParam(paramBase, 1u), modelFlatParam(paramBase, 2u));
    let b = projectLocal(paramBase, modelFlatParam(paramBase, 3u), modelFlatParam(paramBase, 4u), modelFlatParam(paramBase, 5u));
    let c = projectLocal(paramBase, modelFlatParam(paramBase, 6u), modelFlatParam(paramBase, 7u), modelFlatParam(paramBase, 8u));
    let faceDepth = clamp(f32((a.z + b.z + c.z) / 3) / 3500.0, 0.0, 1.0);
    let base = textureLoad(sourceTexture, pixel, 0);
    let rgb = u32(modelFlatParam(paramBase, 20u));
    let alpha = u32(modelFlatParam(paramBase, 21u));
    let srcR = (rgb >> 16u) & 255u;
    let srcG = (rgb >> 8u) & 255u;
    let srcB = rgb & 255u;
    var blendBase = base;
    if (alpha < 256u) {
        blendBase = textureLoad(sourceTexture, nextPixel(pixel), 0);
    }
    let outR = blendChannel(srcR, toByte(blendBase.r), alpha);
    let outG = blendChannel(srcG, toByte(blendBase.g), alpha);
    let outB = blendChannel(srcB, toByte(blendBase.b), alpha);
    return FragmentOutput(vec4f(f32(outR) / 255.0, f32(outG) / 255.0, f32(outB) / 255.0, 1.0), faceDepth);
}
`;

const GOURAUD_SHADER = `
struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) @interpolate(flat) paramBase: u32,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
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
    output.paramBase = instanceIndex;
    return output;
}

struct GouraudParams {
    xA: i32,
    yA: i32,
    xB: i32,
    yB: i32,
    xC: i32,
    yC: i32,
    colourA: i32,
    colourB: i32,
    colourC: i32,
    alpha: i32,
    lowDetail: i32,
    hclip: i32,
    clipMinX: i32,
    clipMinY: i32,
    clipMaxX: i32,
    clipMaxY: i32,
};

struct GouraudSpan {
    startX: i32,
    endX: i32,
    startShade: i32,
    endShade: i32,
    valid: i32,
};

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var colourTableTexture: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> gouraudParams: array<i32>;

fn gouraudParam(base: u32, index: u32) -> i32 {
    return gouraudParams[base + index];
}

fn edgeStep(x0: i32, y0: i32, x1: i32, y1: i32) -> i32 {
    if (y0 == y1) {
        return 0;
    }

    return ((x1 - x0) * 65536) / (y1 - y0);
}

fn colourStep(colour0: i32, y0: i32, colour1: i32, y1: i32) -> i32 {
    if (y0 == y1) {
        return 0;
    }

    return ((colour1 - colour0) * 32768) / (y1 - y0);
}

fn edgeX(x0: i32, y0: i32, step: i32, y: i32) -> i32 {
    return (x0 * 65536 + step * (y - y0)) >> 16;
}

fn edgeShade(colour0: i32, y0: i32, step: i32, y: i32) -> i32 {
    return ((colour0 << 15) + step * (y - y0)) >> 7;
}

fn emptySpan() -> GouraudSpan {
    return GouraudSpan(0, 0, 0, 0, 0);
}

fn shortEdgeX(xTop: i32, yTop: i32, xMid: i32, yMid: i32, xBot: i32, yBot: i32, upperStep: i32, lowerStep: i32, y: i32) -> i32 {
    if (y < yMid) {
        return edgeX(xTop, yTop, upperStep, y);
    }

    return edgeX(xMid, yMid, lowerStep, y);
}

fn shortEdgeShade(colourTop: i32, yTop: i32, colourMid: i32, yMid: i32, colourBot: i32, yBot: i32, upperStep: i32, lowerStep: i32, y: i32) -> i32 {
    if (y < yMid) {
        return edgeShade(colourTop, yTop, upperStep, y);
    }

    return edgeShade(colourMid, yMid, lowerStep, y);
}

fn orderedGouraudSpan(pixelY: i32, base: u32, xTop: i32, yTop: i32, colourTop: i32, xMid: i32, yMid: i32, colourMid: i32, xBot: i32, yBot: i32, colourBot: i32) -> GouraudSpan {
    if (yTop >= yBot || pixelY < yTop || pixelY >= yBot) {
        return emptySpan();
    }

    let longXStep = edgeStep(xTop, yTop, xBot, yBot);
    let upperXStep = edgeStep(xTop, yTop, xMid, yMid);
    let lowerXStep = edgeStep(xMid, yMid, xBot, yBot);
    let longColourStep = colourStep(colourTop, yTop, colourBot, yBot);
    let upperColourStep = colourStep(colourTop, yTop, colourMid, yMid);
    let lowerColourStep = colourStep(colourMid, yMid, colourBot, yBot);

    let longX = edgeX(xTop, yTop, longXStep, pixelY);
    let shortX = shortEdgeX(xTop, yTop, xMid, yMid, xBot, yBot, upperXStep, lowerXStep, pixelY);
    let longShade = edgeShade(colourTop, yTop, longColourStep, pixelY);
    let shortShade = shortEdgeShade(colourTop, yTop, colourMid, yMid, colourBot, yBot, upperColourStep, lowerColourStep, pixelY);

    var sampleY = max(yTop, gouraudParam(base, 13u));
    if (sampleY >= yBot) {
        sampleY = yTop;
    }
    let sampleLong = edgeX(xTop, yTop, longXStep, sampleY);
    let sampleShort = shortEdgeX(xTop, yTop, xMid, yMid, xBot, yBot, upperXStep, lowerXStep, sampleY);
    var longLeft = sampleLong < sampleShort;
    if (sampleLong == sampleShort) {
        if (yTop == yMid) {
            longLeft = xTop < xMid;
        } else {
            longLeft = longXStep < upperXStep;
        }
    }

    if (longLeft) {
        return GouraudSpan(longX, shortX, longShade, shortShade, 1);
    }
    return GouraudSpan(shortX, longX, shortShade, longShade, 1);
}

fn gouraudSpan(pixelY: i32, base: u32) -> GouraudSpan {
    if (gouraudParam(base, 1u) <= gouraudParam(base, 3u) && gouraudParam(base, 1u) <= gouraudParam(base, 5u)) {
        if (gouraudParam(base, 3u) < gouraudParam(base, 5u)) {
            return orderedGouraudSpan(pixelY, base, gouraudParam(base, 0u), gouraudParam(base, 1u), gouraudParam(base, 6u), gouraudParam(base, 2u), gouraudParam(base, 3u), gouraudParam(base, 7u), gouraudParam(base, 4u), gouraudParam(base, 5u), gouraudParam(base, 8u));
        }
        return orderedGouraudSpan(pixelY, base, gouraudParam(base, 0u), gouraudParam(base, 1u), gouraudParam(base, 6u), gouraudParam(base, 4u), gouraudParam(base, 5u), gouraudParam(base, 8u), gouraudParam(base, 2u), gouraudParam(base, 3u), gouraudParam(base, 7u));
    }

    if (gouraudParam(base, 3u) <= gouraudParam(base, 5u)) {
        if (gouraudParam(base, 5u) < gouraudParam(base, 1u)) {
            return orderedGouraudSpan(pixelY, base, gouraudParam(base, 2u), gouraudParam(base, 3u), gouraudParam(base, 7u), gouraudParam(base, 4u), gouraudParam(base, 5u), gouraudParam(base, 8u), gouraudParam(base, 0u), gouraudParam(base, 1u), gouraudParam(base, 6u));
        }
        return orderedGouraudSpan(pixelY, base, gouraudParam(base, 2u), gouraudParam(base, 3u), gouraudParam(base, 7u), gouraudParam(base, 0u), gouraudParam(base, 1u), gouraudParam(base, 6u), gouraudParam(base, 4u), gouraudParam(base, 5u), gouraudParam(base, 8u));
    }

    if (gouraudParam(base, 1u) < gouraudParam(base, 3u)) {
        return orderedGouraudSpan(pixelY, base, gouraudParam(base, 4u), gouraudParam(base, 5u), gouraudParam(base, 8u), gouraudParam(base, 0u), gouraudParam(base, 1u), gouraudParam(base, 6u), gouraudParam(base, 2u), gouraudParam(base, 3u), gouraudParam(base, 7u));
    }
    return orderedGouraudSpan(pixelY, base, gouraudParam(base, 4u), gouraudParam(base, 5u), gouraudParam(base, 8u), gouraudParam(base, 2u), gouraudParam(base, 3u), gouraudParam(base, 7u), gouraudParam(base, 0u), gouraudParam(base, 1u), gouraudParam(base, 6u));
}

fn colourTableIndex(span: GouraudSpan, pixelX: i32, base: u32) -> i32 {
    if (span.valid == 0 || span.startX >= span.endX || pixelX < span.startX || pixelX >= span.endX) {
        return -1;
    }

    if (gouraudParam(base, 10u) != 0) {
        var startX = span.startX;
        var endX = span.endX;
        var startShade = span.startShade;
        var step: i32;
        if (gouraudParam(base, 11u) != 0) {
            if (span.endX - span.startX > 3) {
                step = (span.endShade - span.startShade) / (span.endX - span.startX);
            } else {
                step = 0;
            }

            if (endX > gouraudParam(base, 14u) - 1) {
                endX = gouraudParam(base, 14u) - 1;
            }
            if (startX < gouraudParam(base, 12u)) {
                startShade -= (startX - gouraudParam(base, 12u)) * step;
                startX = gouraudParam(base, 12u);
            }
            if (startX >= endX || pixelX < startX || pixelX >= endX) {
                return -1;
            }

            step = step << 2;
        } else {
            let groups = (span.endX - span.startX) >> 2;
            if (groups > 0) {
                step = ((span.endShade - span.startShade) * (32768 / groups)) >> 15;
            } else {
                step = 0;
            }
        }

        let group = (pixelX - startX) >> 2;
        return (startShade + group * step) >> 8;
    }

    let step = (span.endShade - span.startShade) / (span.endX - span.startX);
    if (gouraudParam(base, 11u) != 0) {
        let endX = min(span.endX, gouraudParam(base, 14u) - 1);
        if (pixelX >= endX) {
            return -1;
        }
    }
    return (span.startShade + (pixelX - span.startX) * step) >> 8;
}

fn toByte(channel: f32) -> u32 {
    return u32(round(clamp(channel, 0.0, 1.0) * 255.0));
}

fn blendChannel(src: u32, dst: u32, alpha: u32) -> u32 {
    return ((src * alpha) >> 8u) + ((dst * (256u - alpha)) >> 8u);
}

fn nextPixel(pixel: vec2<i32>) -> vec2<i32> {
    let size = textureDimensions(sourceTexture);
    let index = min(pixel.x + pixel.y * i32(size.x) + 1, i32(size.x * size.y) - 1);
    return vec2<i32>(index % i32(size.x), index / i32(size.x));
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
    let pixel = vec2<i32>(floor(input.position.xy));
    let base = textureLoad(sourceTexture, pixel, 0);

    if (pixel.x < gouraudParam(input.paramBase, 12u) || pixel.x >= gouraudParam(input.paramBase, 14u) || pixel.y < gouraudParam(input.paramBase, 13u) || pixel.y >= gouraudParam(input.paramBase, 15u)) {
        return vec4f(base.rgb, 1.0);
    }

    let span = gouraudSpan(pixel.y, input.paramBase);
    let tableIndex = colourTableIndex(span, pixel.x, input.paramBase);
    if (tableIndex < 0) {
        return vec4f(base.rgb, 1.0);
    }

    let clampedIndex = clamp(tableIndex, 0, 65535);
    let colour = textureLoad(colourTableTexture, vec2<i32>(clampedIndex & 255, clampedIndex >> 8), 0);
    let alpha = u32(gouraudParam(input.paramBase, 9u));
    if (alpha >= 256u) {
        return vec4f(colour.rgb, 1.0);
    }

    let blendBase = textureLoad(sourceTexture, nextPixel(pixel), 0);
    let outR = blendChannel(toByte(colour.r), toByte(blendBase.r), alpha);
    let outG = blendChannel(toByte(colour.g), toByte(blendBase.g), alpha);
    let outB = blendChannel(toByte(colour.b), toByte(blendBase.b), alpha);
    return vec4f(f32(outR) / 255.0, f32(outG) / 255.0, f32(outB) / 255.0, 1.0);
}
`;

const TEXTURE_TRIANGLE_SHADER = `
struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) @interpolate(flat) paramBase: u32,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
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
    output.paramBase = instanceIndex;
    return output;
}

struct TextureTriangleParams {
    xA: i32,
    yA: i32,
    xB: i32,
    yB: i32,
    xC: i32,
    yC: i32,
    shadeA: i32,
    shadeB: i32,
    shadeC: i32,
    texOriginX: i32,
    texOriginY: i32,
    texOriginZ: i32,
    txB: i32,
    txC: i32,
    tyB: i32,
    tyC: i32,
    tzB: i32,
    tzC: i32,
    lowMem: i32,
    opaque: i32,
    hclip: i32,
    screenOriginX: i32,
    screenOriginY: i32,
    clipMinX: i32,
    clipMinY: i32,
    clipMaxX: i32,
    clipMaxY: i32,
    textureWidth: i32,
    textureHeight: i32,
    _pad0: i32,
    _pad1: i32,
};

struct TextureSpan {
    startX: i32,
    endX: i32,
    startShade: i32,
    endShade: i32,
    valid: i32,
};

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var textureIndices: texture_2d<u32>;
@group(0) @binding(2) var texturePalette: texture_2d<u32>;
@group(0) @binding(3) var<storage, read> textureTriangleParams: array<i32>;

fn textureParam(base: u32, index: u32) -> i32 {
    return textureTriangleParams[base + index];
}

fn edgeStep(x0: i32, y0: i32, x1: i32, y1: i32) -> i32 {
    if (y0 == y1) {
        return 0;
    }

    return ((x1 - x0) * 65536) / (y1 - y0);
}

fn shadeStep(shade0: i32, y0: i32, shade1: i32, y1: i32) -> i32 {
    if (y0 == y1) {
        return 0;
    }

    return ((shade1 - shade0) * 65536) / (y1 - y0);
}

fn edgeX(x0: i32, y0: i32, step: i32, y: i32) -> i32 {
    return (x0 * 65536 + step * (y - y0)) >> 16;
}

fn edgeShade(shade0: i32, y0: i32, step: i32, y: i32) -> i32 {
    return ((shade0 << 16) + step * (y - y0)) >> 8;
}

fn emptyTextureSpan() -> TextureSpan {
    return TextureSpan(0, 0, 0, 0, 0);
}

fn shortEdgeX(xTop: i32, yTop: i32, xMid: i32, yMid: i32, xBot: i32, yBot: i32, upperStep: i32, lowerStep: i32, y: i32) -> i32 {
    if (y < yMid) {
        return edgeX(xTop, yTop, upperStep, y);
    }

    return edgeX(xMid, yMid, lowerStep, y);
}

fn shortEdgeShade(shadeTop: i32, yTop: i32, shadeMid: i32, yMid: i32, shadeBot: i32, yBot: i32, upperStep: i32, lowerStep: i32, y: i32) -> i32 {
    if (y < yMid) {
        return edgeShade(shadeTop, yTop, upperStep, y);
    }

    return edgeShade(shadeMid, yMid, lowerStep, y);
}

fn orderedTextureSpan(base: u32, pixelY: i32, xTop: i32, yTop: i32, shadeTop: i32, xMid: i32, yMid: i32, shadeMid: i32, xBot: i32, yBot: i32, shadeBot: i32) -> TextureSpan {
    if (yTop >= yBot || pixelY < yTop || pixelY >= yBot) {
        return emptyTextureSpan();
    }

    let longXStep = edgeStep(xTop, yTop, xBot, yBot);
    let upperXStep = edgeStep(xTop, yTop, xMid, yMid);
    let lowerXStep = edgeStep(xMid, yMid, xBot, yBot);
    let longShadeStep = shadeStep(shadeTop, yTop, shadeBot, yBot);
    let upperShadeStep = shadeStep(shadeTop, yTop, shadeMid, yMid);
    let lowerShadeStep = shadeStep(shadeMid, yMid, shadeBot, yBot);

    let longX = edgeX(xTop, yTop, longXStep, pixelY);
    let shortX = shortEdgeX(xTop, yTop, xMid, yMid, xBot, yBot, upperXStep, lowerXStep, pixelY);
    let longShade = edgeShade(shadeTop, yTop, longShadeStep, pixelY);
    let shortShade = shortEdgeShade(shadeTop, yTop, shadeMid, yMid, shadeBot, yBot, upperShadeStep, lowerShadeStep, pixelY);

    var sampleY = max(yTop, textureParam(base, 24u));
    if (sampleY >= yBot) {
        sampleY = yTop;
    }
    let sampleLong = edgeX(xTop, yTop, longXStep, sampleY);
    let sampleShort = shortEdgeX(xTop, yTop, xMid, yMid, xBot, yBot, upperXStep, lowerXStep, sampleY);
    var longLeft = sampleLong < sampleShort;
    if (sampleLong == sampleShort) {
        if (yTop == yMid) {
            longLeft = xTop < xMid;
        } else {
            longLeft = longXStep < upperXStep;
        }
    }

    if (longLeft) {
        return TextureSpan(longX, shortX, longShade, shortShade, 1);
    }
    return TextureSpan(shortX, longX, shortShade, longShade, 1);
}

fn textureSpan(base: u32, pixelY: i32) -> TextureSpan {
    if (textureParam(base, 1u) <= textureParam(base, 3u) && textureParam(base, 1u) <= textureParam(base, 5u)) {
        if (textureParam(base, 3u) < textureParam(base, 5u)) {
            return orderedTextureSpan(base, pixelY, textureParam(base, 0u), textureParam(base, 1u), textureParam(base, 6u), textureParam(base, 2u), textureParam(base, 3u), textureParam(base, 7u), textureParam(base, 4u), textureParam(base, 5u), textureParam(base, 8u));
        }
        return orderedTextureSpan(base, pixelY, textureParam(base, 0u), textureParam(base, 1u), textureParam(base, 6u), textureParam(base, 4u), textureParam(base, 5u), textureParam(base, 8u), textureParam(base, 2u), textureParam(base, 3u), textureParam(base, 7u));
    }

    if (textureParam(base, 3u) <= textureParam(base, 5u)) {
        if (textureParam(base, 5u) < textureParam(base, 1u)) {
            return orderedTextureSpan(base, pixelY, textureParam(base, 2u), textureParam(base, 3u), textureParam(base, 7u), textureParam(base, 4u), textureParam(base, 5u), textureParam(base, 8u), textureParam(base, 0u), textureParam(base, 1u), textureParam(base, 6u));
        }
        return orderedTextureSpan(base, pixelY, textureParam(base, 2u), textureParam(base, 3u), textureParam(base, 7u), textureParam(base, 0u), textureParam(base, 1u), textureParam(base, 6u), textureParam(base, 4u), textureParam(base, 5u), textureParam(base, 8u));
    }

    if (textureParam(base, 1u) < textureParam(base, 3u)) {
        return orderedTextureSpan(base, pixelY, textureParam(base, 4u), textureParam(base, 5u), textureParam(base, 8u), textureParam(base, 0u), textureParam(base, 1u), textureParam(base, 6u), textureParam(base, 2u), textureParam(base, 3u), textureParam(base, 7u));
    }
    return orderedTextureSpan(base, pixelY, textureParam(base, 4u), textureParam(base, 5u), textureParam(base, 8u), textureParam(base, 2u), textureParam(base, 3u), textureParam(base, 7u), textureParam(base, 0u), textureParam(base, 1u), textureParam(base, 6u));
}

fn shadePaletteRgb(index: u32, shadePlane: i32, shadeShift: i32) -> u32 {
    let palette = textureLoad(texturePalette, vec2<i32>(i32(index), 0), 0);
    var rgb = ((palette.r << 16u) | (palette.g << 8u) | palette.b) & 0xf8f8ffu;
    if (shadePlane == 1) {
        rgb = (rgb - (rgb >> 3u)) & 0xf8f8ffu;
    } else if (shadePlane == 2) {
        rgb = (rgb - (rgb >> 2u)) & 0xf8f8ffu;
    } else if (shadePlane == 3) {
        rgb = (rgb - (rgb >> 2u) - (rgb >> 3u)) & 0xf8f8ffu;
    }

    return rgb >> u32(shadeShift);
}

fn textureIndexAt(base: u32, x: i32, y: i32) -> u32 {
    let clampedX = clamp(x, 0, max(textureParam(base, 27u) - 1, 0));
    let clampedY = clamp(y, 0, max(textureParam(base, 28u) - 1, 0));
    return textureLoad(textureIndices, vec2<i32>(clampedX, clampedY), 0).r;
}

fn textureRawRgb(base: u32, span: TextureSpan, pixel: vec2<i32>) -> u32 {
    if (span.valid == 0 || span.startX >= span.endX || pixel.x < span.startX || pixel.x >= span.endX) {
        return 0xffffffffu;
    }

    var startX = span.startX;
    var endX = span.endX;
    var startShade = span.startShade;
    var shadeStride: i32;
    if (textureParam(base, 20u) != 0) {
        shadeStride = (span.endShade - span.startShade) / (span.endX - span.startX);
        if (endX > textureParam(base, 25u) - 1) {
            endX = textureParam(base, 25u) - 1;
        }
        if (startX < textureParam(base, 23u)) {
            startShade -= (startX - textureParam(base, 23u)) * shadeStride;
            startX = textureParam(base, 23u);
        }
        if (startX >= endX || pixel.x < startX || pixel.x >= endX) {
            return 0xffffffffu;
        }
        shadeStride = shadeStride << 12;
    } else {
        if (span.endX - span.startX > 7) {
            let groups = (span.endX - span.startX) >> 3;
            shadeStride = ((span.endShade - span.startShade) * (32768 / groups)) >> 6;
        } else {
            shadeStride = 0;
        }
    }

    let localX = pixel.x - startX;
    let group = localX >> 3;
    let groupPixel = localX & 7;
    let shadeBase = (startShade << 9) + shadeStride * group;

    let verticalX = textureParam(base, 9u) - textureParam(base, 12u);
    let verticalY = textureParam(base, 10u) - textureParam(base, 14u);
    let verticalZ = textureParam(base, 11u) - textureParam(base, 16u);
    let horizontalX = textureParam(base, 13u) - textureParam(base, 9u);
    let horizontalY = textureParam(base, 15u) - textureParam(base, 10u);
    let horizontalZ = textureParam(base, 17u) - textureParam(base, 11u);

    let baseU = (horizontalX * textureParam(base, 10u) - horizontalY * textureParam(base, 9u)) << 14;
    let uStride = (horizontalY * textureParam(base, 11u) - horizontalZ * textureParam(base, 10u)) << 8;
    let uStepVertical = (horizontalZ * textureParam(base, 9u) - horizontalX * textureParam(base, 11u)) << 5;
    let baseV = (verticalX * textureParam(base, 10u) - verticalY * textureParam(base, 9u)) << 14;
    let vStride = (verticalY * textureParam(base, 11u) - verticalZ * textureParam(base, 10u)) << 8;
    let vStepVertical = (verticalZ * textureParam(base, 9u) - verticalX * textureParam(base, 11u)) << 5;
    let baseW = (verticalY * horizontalX - verticalX * horizontalY) << 14;
    let wStride = (verticalZ * horizontalY - verticalY * horizontalZ) << 8;
    let wStepVertical = (verticalX * horizontalZ - verticalZ * horizontalX) << 5;

    let rowDelta = pixel.y - textureParam(base, 22u);
    let dx = startX - textureParam(base, 21u);
    let uStart = baseU + uStepVertical * rowDelta + (uStride >> 3) * dx;
    let vStart = baseV + vStepVertical * rowDelta + (vStride >> 3) * dx;
    let wStart = baseW + wStepVertical * rowDelta + (wStride >> 3) * dx;
    let uGroup = uStart + uStride * group;
    let vGroup = vStart + vStride * group;
    let wGroup = wStart + wStride * group;
    let uNextGroup = uGroup + uStride;
    let vNextGroup = vGroup + vStride;
    let wNextGroup = wGroup + wStride;

    var curU = 0;
    var curV = 0;
    var nextU = 0;
    var nextV = 0;
    if (textureParam(base, 18u) != 0) {
        let curW = wGroup >> 12;
        if (curW != 0) {
            curU = uGroup / curW;
            curV = vGroup / curW;
            if (curU < 0) {
                curU = 0;
            } else if (curU > 4032) {
                curU = 4032;
            }
        }

        let nextW = wNextGroup >> 12;
        if (nextW != 0) {
            nextU = uNextGroup / nextW;
            nextV = vNextGroup / nextW;
            if (nextU < 7) {
                nextU = 7;
            } else if (nextU > 4032) {
                nextU = 4032;
            }
        }

        let stepU = (nextU - curU) >> 3;
        let stepV = (nextV - curV) >> 3;
        let shadePlane = ((shadeBase >> 3) & 0xc0000) >> 18;
        let shadeShift = shadeBase >> 23;
        let sampleU = curU + stepU * groupPixel;
        let sampleV = curV + stepV * groupPixel;
        let index = textureIndexAt(base, sampleU >> 6, (sampleV & 0xfc0) >> 6);
        return shadePaletteRgb(index, shadePlane, shadeShift);
    }

    let curW = wGroup >> 14;
    if (curW != 0) {
        curU = uGroup / curW;
        curV = vGroup / curW;
        if (curU < 0) {
            curU = 0;
        } else if (curU > 16256) {
            curU = 16256;
        }
    }

    let nextW = wNextGroup >> 14;
    if (nextW != 0) {
        nextU = uNextGroup / nextW;
        nextV = vNextGroup / nextW;
        if (nextU < 7) {
            nextU = 7;
        } else if (nextU > 16256) {
            nextU = 16256;
        }
    }

    let stepU = (nextU - curU) >> 3;
    let stepV = (nextV - curV) >> 3;
    let shadePlane = (shadeBase & 0x600000) >> 21;
    let shadeShift = shadeBase >> 23;
    let sampleU = curU + stepU * groupPixel;
    let sampleV = curV + stepV * groupPixel;
    var texX = sampleU >> 7;
    var texY = (sampleV & 0x3f80) >> 7;
    if (textureParam(base, 27u) == 64) {
        texX = texX >> 1;
        texY = texY >> 1;
    }
    let index = textureIndexAt(base, texX, texY);
    return shadePaletteRgb(index, shadePlane, shadeShift);
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
    let pixel = vec2<i32>(floor(input.position.xy));
    let base = textureLoad(sourceTexture, pixel, 0);
    let paramBase = input.paramBase;
    if (pixel.x < textureParam(paramBase, 23u) || pixel.x >= textureParam(paramBase, 25u) || pixel.y < textureParam(paramBase, 24u) || pixel.y >= textureParam(paramBase, 26u)) {
        return vec4f(base.rgb, 1.0);
    }

    let span = textureSpan(paramBase, pixel.y);
    let rgb = textureRawRgb(paramBase, span, pixel);
    if (rgb == 0xffffffffu || (textureParam(paramBase, 19u) == 0 && rgb == 0u)) {
        return vec4f(base.rgb, 1.0);
    }

    let r = (rgb >> 16u) & 255u;
    let g = (rgb >> 8u) & 255u;
    let b = rgb & 255u;
    return vec4f(f32(r) / 255.0, f32(g) / 255.0, f32(b) / 255.0, 1.0);
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
    @location(0) @interpolate(flat) paramBase: u32,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
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
    output.paramBase = instanceIndex;
    return output;
}

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var spriteTexture: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> spriteAlphaParams: array<i32>;

fn spriteAlphaParam(base: u32, index: u32) -> i32 {
    return spriteAlphaParams[base + index];
}

fn toByte(channel: f32) -> u32 {
    return u32(round(clamp(channel, 0.0, 1.0) * 255.0));
}

fn blendChannel(src: u32, dst: u32, alpha: u32) -> u32 {
    return ((src * alpha) >> 8u) + ((dst * (256u - alpha)) >> 8u);
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
    let pixel = vec2<i32>(floor(input.position.xy));
    let base = textureLoad(sourceTexture, pixel, 0);
    let paramBase = input.paramBase;

    if (pixel.x < spriteAlphaParam(paramBase, 0u) || pixel.x >= spriteAlphaParam(paramBase, 0u) + spriteAlphaParam(paramBase, 2u) || pixel.y < spriteAlphaParam(paramBase, 1u) || pixel.y >= spriteAlphaParam(paramBase, 1u) + spriteAlphaParam(paramBase, 3u)) {
        return vec4f(base.rgb, 1.0);
    }

    let spritePixel = vec2<i32>(
        (spriteAlphaParam(paramBase, 4u) + (pixel.x - spriteAlphaParam(paramBase, 0u)) * spriteAlphaParam(paramBase, 7u)) / 65536,
        (spriteAlphaParam(paramBase, 5u) + (pixel.y - spriteAlphaParam(paramBase, 1u)) * spriteAlphaParam(paramBase, 8u)) / 65536
    );
    let sprite = textureLoad(spriteTexture, spritePixel, 0);
    if (sprite.a < 0.5) {
        return vec4f(base.rgb, 1.0);
    }

    let alpha = u32(spriteAlphaParam(paramBase, 6u));
    if (alpha >= 256u) {
        return vec4f(sprite.rgb, 1.0);
    }

    let outR = blendChannel(toByte(sprite.r), toByte(base.r), alpha);
    let outG = blendChannel(toByte(sprite.g), toByte(base.g), alpha);
    let outB = blendChannel(toByte(sprite.b), toByte(base.b), alpha);
    return vec4f(f32(outR) / 255.0, f32(outG) / 255.0, f32(outB) / 255.0, 1.0);
}
`;

const GLYPH_SHADER = `
struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) @interpolate(flat) paramBase: u32,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
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
    output.paramBase = instanceIndex;
    return output;
}

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var glyphTexture: texture_2d<u32>;
@group(0) @binding(2) var<storage, read> glyphParams: array<i32>;

fn glyphParam(base: u32, index: u32) -> i32 {
    return glyphParams[base + index];
}

fn toByte(channel: f32) -> u32 {
    return u32(round(clamp(channel, 0.0, 1.0) * 255.0));
}

fn blendGlyphChannel(src: u32, dst: u32, alpha: u32) -> u32 {
    return ((src * alpha) >> 8u) + ((dst * (256u - alpha)) >> 8u);
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
    let pixel = vec2<i32>(floor(input.position.xy));
    let base = textureLoad(sourceTexture, pixel, 0);

    if (pixel.x < glyphParam(input.paramBase, 0u) || pixel.x >= glyphParam(input.paramBase, 0u) + glyphParam(input.paramBase, 2u) || pixel.y < glyphParam(input.paramBase, 1u) || pixel.y >= glyphParam(input.paramBase, 1u) + glyphParam(input.paramBase, 3u)) {
        return vec4f(base.rgb, 1.0);
    }

    let glyphPixel = vec2<i32>(glyphParam(input.paramBase, 4u) + pixel.x - glyphParam(input.paramBase, 0u), glyphParam(input.paramBase, 5u) + pixel.y - glyphParam(input.paramBase, 1u));
    let glyphSize = textureDimensions(glyphTexture);
    if (glyphPixel.x < 0 || glyphPixel.y < 0 || glyphPixel.x >= i32(glyphSize.x) || glyphPixel.y >= i32(glyphSize.y)) {
        return vec4f(base.rgb, 1.0);
    }

    if (textureLoad(glyphTexture, glyphPixel, 0).r == 0u) {
        return vec4f(base.rgb, 1.0);
    }

    let srcR = u32((glyphParam(input.paramBase, 6u) >> 16) & 255);
    let srcG = u32((glyphParam(input.paramBase, 6u) >> 8) & 255);
    let srcB = u32(glyphParam(input.paramBase, 6u) & 255);
    let alpha = u32(glyphParam(input.paramBase, 7u));
    if (alpha >= 256u) {
        return vec4f(f32(srcR) / 255.0, f32(srcG) / 255.0, f32(srcB) / 255.0, 1.0);
    }

    let outR = blendGlyphChannel(srcR, toByte(base.r), alpha);
    let outG = blendGlyphChannel(srcG, toByte(base.g), alpha);
    let outB = blendGlyphChannel(srcB, toByte(base.b), alpha);
    return vec4f(f32(outR) / 255.0, f32(outG) / 255.0, f32(outB) / 255.0, 1.0);
}
`;

const INDEXED_SPRITE_SHADER = `
struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) @interpolate(flat) paramBase: u32,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
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
    output.paramBase = instanceIndex;
    return output;
}

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var intensityTexture: texture_2d<u32>;
@group(0) @binding(2) var paletteTexture: texture_2d<u32>;
@group(0) @binding(3) var lineOffsetTexture: texture_2d<u32>;
@group(0) @binding(4) var<storage, read> indexedSpriteParams: array<i32>;

fn indexedSpriteParam(base: u32, index: u32) -> i32 {
    return indexedSpriteParams[base + index];
}

fn toByte(channel: f32) -> u32 {
    return u32(round(clamp(channel, 0.0, 1.0) * 255.0));
}

fn blendChannel(src: u32, dst: u32, alpha: u32) -> u32 {
    return (src * alpha + dst * (256u - alpha)) >> 8u;
}

fn intensityAt(src: vec2<i32>) -> u32 {
    let size = textureDimensions(intensityTexture);
    if (src.x < 0 || src.y < 0 || src.x >= i32(size.x) || src.y >= i32(size.y)) {
        return 0u;
    }

    return textureLoad(intensityTexture, src, 0).r;
}

fn titleFlameIntensity(pixel: vec2<i32>, mode: i32, paramBase: u32) -> u32 {
    let localX = pixel.x - indexedSpriteParam(paramBase, 4u);
    let localY = pixel.y - indexedSpriteParam(paramBase, 5u);
    let flameY = localY - 8;
    let size = textureDimensions(intensityTexture);
    if (localX < 0 || localX >= i32(size.x) || flameY < 1 || flameY >= i32(size.y) - 1) {
        return 0u;
    }

    let lineOffset = i32(textureLoad(lineOffsetTexture, vec2<i32>(flameY, 0), 0).r) - 128;
    let offset = (lineOffset * (i32(size.y) - flameY)) / i32(size.y);
    var srcX = 0;
    if (mode == 1) {
        let step = max(offset + 22, 0);
        if (localX >= i32(size.x) - step) {
            return 0u;
        }
        srcX = localX + step;
    } else {
        let step = 103 - offset;
        let startX = 24 + offset;
        if (localX < startX || localX >= startX + step) {
            return 0u;
        }
        srcX = localX - startX;
    }

    return intensityAt(vec2<i32>(srcX, flameY));
}

fn spriteIntensity(pixel: vec2<i32>, paramBase: u32) -> u32 {
    if (pixel.x < indexedSpriteParam(paramBase, 0u) || pixel.x >= indexedSpriteParam(paramBase, 0u) + indexedSpriteParam(paramBase, 2u) || pixel.y < indexedSpriteParam(paramBase, 1u) || pixel.y >= indexedSpriteParam(paramBase, 1u) + indexedSpriteParam(paramBase, 3u)) {
        return 0u;
    }

    let mode = indexedSpriteParam(paramBase, 8u);
    if (mode == 1 || mode == 2) {
        return titleFlameIntensity(pixel, mode, paramBase);
    }

    return intensityAt(vec2<i32>(
        indexedSpriteParam(paramBase, 6u) + pixel.x - indexedSpriteParam(paramBase, 0u),
        indexedSpriteParam(paramBase, 7u) + pixel.y - indexedSpriteParam(paramBase, 1u)
    ));
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
    let pixel = vec2<i32>(floor(input.position.xy));
    let base = textureLoad(sourceTexture, pixel, 0);
    let alpha = spriteIntensity(pixel, input.paramBase);
    if (alpha == 0u) {
        return vec4f(base.rgb, 1.0);
    }

    let palette = textureLoad(paletteTexture, vec2<i32>(i32(alpha), 0), 0);
    let outR = blendChannel(palette.r, toByte(base.r), alpha);
    let outG = blendChannel(palette.g, toByte(base.g), alpha);
    let outB = blendChannel(palette.b, toByte(base.b), alpha);
    return vec4f(f32(outR) / 255.0, f32(outG) / 255.0, f32(outB) / 255.0, 1.0);
}
`;

const TRANSFORM_SPRITE_SHADER = `
struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) @interpolate(flat) paramBase: u32,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
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
    output.paramBase = instanceIndex;
    return output;
}

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var spriteTexture: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> transformSpriteParams: array<i32>;

fn transformSpriteParam(base: u32, index: u32) -> i32 {
    return transformSpriteParams[base + index];
}

fn fixedToInt(value: i32) -> i32 {
    if (value >= 0) {
        return value / 65536;
    }

    return -(((-value) + 65535) / 65536);
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
    let pixel = vec2<i32>(floor(input.position.xy));
    let base = textureLoad(sourceTexture, pixel, 0);
    let paramBase = input.paramBase;

    if (pixel.x < transformSpriteParam(paramBase, 0u) || pixel.x >= transformSpriteParam(paramBase, 0u) + transformSpriteParam(paramBase, 2u) || pixel.y < transformSpriteParam(paramBase, 1u) || pixel.y >= transformSpriteParam(paramBase, 1u) + transformSpriteParam(paramBase, 3u)) {
        return vec4f(base.rgb, 1.0);
    }

    let localX = pixel.x - transformSpriteParam(paramBase, 0u);
    let localY = pixel.y - transformSpriteParam(paramBase, 1u);
    let src = vec2<i32>(
        fixedToInt(transformSpriteParam(paramBase, 4u) + localY * transformSpriteParam(paramBase, 8u) + localX * transformSpriteParam(paramBase, 6u)),
        fixedToInt(transformSpriteParam(paramBase, 5u) + localY * transformSpriteParam(paramBase, 9u) + localX * transformSpriteParam(paramBase, 7u))
    );
    let spriteSize = textureDimensions(spriteTexture);
    let spriteIndex = src.x + src.y * transformSpriteParam(paramBase, 11u);
    if (spriteIndex < 0 || spriteIndex >= i32(spriteSize.x * spriteSize.y)) {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }

    let spriteCoord = vec2<i32>(spriteIndex % i32(spriteSize.x), spriteIndex / i32(spriteSize.x));
    let sprite = textureLoad(spriteTexture, spriteCoord, 0);
    if (transformSpriteParam(paramBase, 10u) != 0 && sprite.a < 0.5) {
        return vec4f(base.rgb, 1.0);
    }

    return vec4f(sprite.rgb, 1.0);
}
`;

const MASKED_SPRITE_SHADER = `
struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) @interpolate(flat) paramBase: u32,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
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
    output.paramBase = instanceIndex;
    return output;
}

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var spriteTexture: texture_2d<f32>;
@group(0) @binding(2) var maskTexture: texture_2d<f32>;
@group(0) @binding(3) var<storage, read> maskedSpriteParams: array<i32>;

fn maskedSpriteParam(base: u32, index: u32) -> i32 {
    return maskedSpriteParams[base + index];
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
    let pixel = vec2<i32>(floor(input.position.xy));
    let base = textureLoad(sourceTexture, pixel, 0);
    let paramBase = input.paramBase;

    if (pixel.x < maskedSpriteParam(paramBase, 0u) || pixel.x >= maskedSpriteParam(paramBase, 0u) + maskedSpriteParam(paramBase, 2u) || pixel.y < maskedSpriteParam(paramBase, 1u) || pixel.y >= maskedSpriteParam(paramBase, 1u) + maskedSpriteParam(paramBase, 3u)) {
        return vec4f(base.rgb, 1.0);
    }

    let localX = pixel.x - maskedSpriteParam(paramBase, 0u);
    let localY = pixel.y - maskedSpriteParam(paramBase, 1u);
    let maskSize = textureDimensions(maskTexture);
    let maskIndex = maskedSpriteParam(paramBase, 6u) + localX + (maskedSpriteParam(paramBase, 7u) + localY) * maskedSpriteParam(paramBase, 8u);
    if (maskIndex < 0 || maskIndex >= i32(maskSize.x * maskSize.y)) {
        return vec4f(base.rgb, 1.0);
    }

    let maskCoord = vec2<i32>(maskIndex % i32(maskSize.x), maskIndex / i32(maskSize.x));
    let mask = textureLoad(maskTexture, maskCoord, 0);
    if (mask.r >= 0.5) {
        return vec4f(base.rgb, 1.0);
    }

    let spriteCoord = vec2<i32>(maskedSpriteParam(paramBase, 4u) + localX, maskedSpriteParam(paramBase, 5u) + localY);
    let spriteSize = textureDimensions(spriteTexture);
    if (spriteCoord.x < 0 || spriteCoord.y < 0 || spriteCoord.x >= i32(spriteSize.x) || spriteCoord.y >= i32(spriteSize.y)) {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }

    let sprite = textureLoad(spriteTexture, spriteCoord, 0);
    if (sprite.a < 0.5) {
        return vec4f(base.rgb, 1.0);
    }

    return vec4f(sprite.rgb, 1.0);
}
`;

const FRAME_TEXTURE_FORMAT = 'rgba8unorm';
const FLOATS_PER_PRIMITIVE_VERTEX = 6;
const FLOATS_PER_RECT_INSTANCE = 8;
const FLOATS_PER_SPRITE_VERTEX = 4;
const UNIFORM_BUFFER_ALIGNMENT = 256;
const RECT_INSTANCE_UNIFORM_FLOATS = 4;
const ALPHA_UNIFORM_INTS = 16;
const MODEL_FLAT_UNIFORM_INTS = 32;
const GOURAUD_UNIFORM_INTS = 16;
const TEXTURE_TRIANGLE_UNIFORM_INTS = 32;
const SPRITE_ALPHA_UNIFORM_INTS = 16;
const GLYPH_UNIFORM_INTS = 16;
const INDEXED_SPRITE_UNIFORM_INTS = 16;
const TRANSFORM_SPRITE_UNIFORM_INTS = 16;
const MASKED_SPRITE_UNIFORM_INTS = 16;

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
    nativeFlatTriangleCount: number;
    nativeGouraudTriangleCount: number;
    nativeTextureTriangleCount: number;
};

type FrameUniformBinding = {
    buffer: GpuBuffer;
    offset: number;
    size: number;
};

type FrameVertexBinding = {
    buffer: GpuBuffer;
    offset: number;
    size: number;
};

type PacketReplayContext = {
    encoder: GpuCommandEncoder;
    directPass: GpuRenderPass | null;
    alphaBindGroups: Map<GpuTexture, object>;
    gouraudBindGroups: Map<GpuTexture, object>;
};

type PacketReplayStep = {
    kind: 'vertices';
    vertices: Float32Array;
} | {
    kind: 'alpha';
    op: AlphaReplayOp;
} | {
    kind: 'rectInstances';
    instances: Float32Array;
} | {
    kind: 'gouraud';
    op: GouraudReplayOp;
} | {
    kind: 'textureTriangle';
    op: TextureTriangleReplayOp;
} | {
    kind: 'sprite';
    op: SpriteReplayOp;
} | {
    kind: 'indexedSprite';
    op: IndexedSpriteReplayOp;
} | {
    kind: 'glyphSprite';
    op: GlyphReplayOp;
} | {
    kind: 'modelFlatTriangle';
    op: ModelFlatReplayOp;
} | {
    kind: 'transformSprite';
    op: TransformSpriteReplayOp;
} | {
    kind: 'maskedSprite';
    op: MaskedSpriteReplayOp;
};

type AlphaReplayOp = {
    kind: 'rect';
    rect: Rect;
    rgb: number;
    alpha: number;
} | {
    kind: 'flatTriangle';
    xA: number;
    yA: number;
    xB: number;
    yB: number;
    xC: number;
    yC: number;
    clip: Rect;
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

type GouraudReplayOp = {
    xA: number;
    yA: number;
    xB: number;
    yB: number;
    xC: number;
    yC: number;
    colourA: number;
    colourB: number;
    colourC: number;
    alpha: number;
    lowDetail: boolean;
    hclip: boolean;
    clip: Rect;
};

type TextureTriangleReplayOp = {
    texture: number;
    xA: number;
    yA: number;
    xB: number;
    yB: number;
    xC: number;
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
    lowMem: boolean;
    opaque: boolean;
    hclip: boolean;
    screenOriginX: number;
    screenOriginY: number;
    clip: Rect;
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

type IndexedSpriteReplayOp = {
    resource: number;
    rect: Rect;
    originX: number;
    originY: number;
    srcX: number;
    srcY: number;
    mode: number;
};

type GlyphReplayOp = {
    resource: number;
    rect: Rect;
    srcX: number;
    srcY: number;
    rgb: number;
    alpha: number | null;
};

type ModelFlatReplayOp = {
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
    clip: Rect;
};

type TransformSpriteReplayOp = {
    resource: number;
    rect: Rect;
    startX: number;
    startY: number;
    stepX: number;
    stepY: number;
    rowStepX: number;
    rowStepY: number;
    sourceStride: number;
    transparentZero: boolean;
};

type MaskedSpriteReplayOp = {
    resource: number;
    maskResource: number;
    rect: Rect;
    srcX: number;
    srcY: number;
    surfaceX: number;
    surfaceY: number;
    maskStride: number;
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
            STORAGE: number;
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

function byteToStableUnorm(byte: number): number {
    if (byte <= 0) {
        return 0;
    }

    if (byte >= 255) {
        return 1;
    }

    return (byte - 0.25) / 255;
}

function pushRectVertices(vertices: number[], rect: Rect, rgb: number, targetWidth: number, targetHeight: number, alpha: number = 1): void {
    const x0 = (rect.x / targetWidth) * 2 - 1;
    const x1 = ((rect.x + rect.width) / targetWidth) * 2 - 1;
    const y0 = 1 - (rect.y / targetHeight) * 2;
    const y1 = 1 - ((rect.y + rect.height) / targetHeight) * 2;
    const r = byteToStableUnorm((rgb >> 16) & 0xff);
    const g = byteToStableUnorm((rgb >> 8) & 0xff);
    const b = byteToStableUnorm(rgb & 0xff);
    const a = alpha;

    pushVertex(vertices, x0, y0, r, g, b, a);
    pushVertex(vertices, x1, y0, r, g, b, a);
    pushVertex(vertices, x0, y1, r, g, b, a);
    pushVertex(vertices, x0, y1, r, g, b, a);
    pushVertex(vertices, x1, y0, r, g, b, a);
    pushVertex(vertices, x1, y1, r, g, b, a);
}

function pushRectInstance(instances: number[], rect: Rect, rgb: number, alpha: number = 1): void {
    instances.push(
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        byteToStableUnorm((rgb >> 16) & 0xff),
        byteToStableUnorm((rgb >> 8) & 0xff),
        byteToStableUnorm(rgb & 0xff),
        alpha
    );
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

function pushSurfaceRectInstance(
    instances: number[],
    rect: Rect,
    rgb: number,
    surfaceClip: PacketClip,
    offsetX: number,
    offsetY: number,
    targetWidth: number,
    targetHeight: number
): void {
    const targetRect = clipSurfaceRectToTarget(rect, surfaceClip, offsetX, offsetY, targetWidth, targetHeight);
    if (!targetRect) {
        return;
    }

    pushRectInstance(instances, targetRect, rgb);
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

function installOverlayCanvas(source: HTMLCanvasElement, overlay: HTMLCanvasElement): OverlayCanvasStack | null {
    const parent = source.parentElement;
    if (!parent) {
        return null;
    }

    const wrapper = document.createElement('div');
    wrapper.dataset.rsSdkCanvasStack = 'webgpu';
    wrapper.style.position = 'relative';
    wrapper.style.display = window.getComputedStyle(source).display === 'block' ? 'block' : 'inline-block';
    wrapper.style.width = source.style.width || `${source.width}px`;
    wrapper.style.height = source.style.height || `${source.height}px`;

    const stack = {
        wrapper,
        sourceDisplay: source.style.display,
        sourcePosition: source.style.position,
        sourceZIndex: source.style.zIndex
    };

    parent.insertBefore(wrapper, source);
    wrapper.appendChild(source);
    wrapper.appendChild(overlay);

    source.style.display = 'block';
    source.style.position = 'relative';
    source.style.zIndex = '0';

    return stack;
}

function uninstallOverlayCanvas(stack: OverlayCanvasStack, source: HTMLCanvasElement, overlay: HTMLCanvasElement): void {
    const parent = stack.wrapper.parentElement;
    if (parent) {
        parent.insertBefore(source, stack.wrapper);
    }
    overlay.remove();
    stack.wrapper.remove();
    source.style.display = stack.sourceDisplay;
    source.style.position = stack.sourcePosition;
    source.style.zIndex = stack.sourceZIndex;
}

export type WebGpuFrameValidationStats = {
    enabled: boolean;
    adapterInfo: WebGpuAdapterInfo | null;
    hardwareAdapter: boolean;
    framesPresented: number;
    samplesQueued: number;
    samplesCompared: number;
    mismatches: number;
    lastDiffPixels: number;
    lastMaxChannelDelta: number;
    lastFirstDiff: { x: number; y: number; expected: number[]; actual: number[] } | null;
    lastError: string;
    inFlight: boolean;
};

export type WebGpuPacketReplayStats = {
    enabled: boolean;
    framesAttempted: number;
    framesReplayed: number;
    framesFailed: number;
    cpuImageDataUploads: number;
    cpuRasterWriteBypasses: number;
    nativeFlatTrianglesReplayed: number;
    nativeGouraudTrianglesReplayed: number;
    nativeTextureTrianglesReplayed: number;
    gpuRectInstancesReplayed: number;
    gpuRectBindGroupsReused: number;
    gpuDynamicIndexedSpritesReplayed: number;
    gpuGlyphSpritesReplayed: number;
    gpuModelFlatTrianglesReplayed: number;
    gpuRetainedDepthPassesReplayed: number;
    gpuFrameCommandSubmits: number;
    gpuRenderPassesEncoded: number;
    gpuBindGroupsCreated: number;
    gpuBufferWrites: number;
    gpuUniformBufferWrites: number;
    gpuTextureCopies: number;
    gpuFrameUniformBytesAllocated: number;
    gpuFrameVertexBytesAllocated: number;
    gpuDirectDrawsReplayed: number;
    gpuDirectRenderPassesReplayed: number;
    gpuAlphaStorageDrawsReplayed: number;
    gpuAlphaBindGroupsReused: number;
    gpuGouraudStorageDrawsReplayed: number;
    gpuGouraudBindGroupsReused: number;
    gpuGlyphStorageDrawsReplayed: number;
    gpuGlyphBindGroupsReused: number;
    gpuSpriteFamilyStorageDrawsReplayed: number;
    gpuSpriteFamilyBindGroupsReused: number;
    gpuTriangleStorageDrawsReplayed: number;
    gpuTriangleBindGroupsReused: number;
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

const SOFTWARE_ADAPTER_PATTERNS = ['swiftshader', 'llvmpipe', 'lavapipe', 'softpipe', 'software rasterizer'];

function normalizeAdapterInfo(info: Partial<WebGpuAdapterInfo> | undefined): WebGpuAdapterInfo | null {
    if (!info) {
        return null;
    }

    return {
        vendor: info.vendor || '',
        architecture: info.architecture || '',
        device: info.device || '',
        description: info.description || ''
    };
}

function isHardwareAdapter(info: WebGpuAdapterInfo | null): boolean {
    if (!info) {
        return false;
    }

    const label = `${info.vendor} ${info.architecture} ${info.device} ${info.description}`.trim().toLowerCase();
    return label !== '' && !SOFTWARE_ADAPTER_PATTERNS.some(pattern => label.includes(pattern));
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestHighPerformanceAdapter(gpu: BrowserGpu, timeoutMs: number = 3_000): Promise<GpuAdapter | null> {
    const deadline = Date.now() + timeoutMs;
    do {
        const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (adapter) {
            return adapter;
        }
        await sleep(100);
    } while (Date.now() < deadline);

    return null;
}

class WebGpuFrameValidator {
    private readonly bufferUsage = getBufferUsage();
    private readonly mapMode = getMapMode();
    readonly stats: WebGpuFrameValidationStats = {
        enabled: false,
        adapterInfo: null,
        hardwareAdapter: false,
        framesPresented: 0,
        samplesQueued: 0,
        samplesCompared: 0,
        mismatches: 0,
        lastDiffPixels: 0,
        lastMaxChannelDelta: 0,
        lastFirstDiff: null,
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
                let firstDiff: WebGpuFrameValidationStats['lastFirstDiff'] = null;

                for (let row = 0; row < height; row++) {
                    const expectedRow = row * bytesPerRow;
                    const actualRow = row * paddedBytesPerRow;
                    for (let column = 0; column < bytesPerRow; column += 4) {
                        let pixelDiff = false;
                        const expectedPixel: number[] = [];
                        const actualPixel: number[] = [];
                        for (let channel = 0; channel < 4; channel++) {
                            const delta = Math.abs(actual[actualRow + column + channel] - expected[expectedRow + column + channel]);
                            expectedPixel[channel] = expected[expectedRow + column + channel];
                            actualPixel[channel] = actual[actualRow + column + channel];
                            if (delta !== 0) {
                                pixelDiff = true;
                                maxChannelDelta = Math.max(maxChannelDelta, delta);
                            }
                        }
                        if (pixelDiff) {
                            firstDiff ??= {
                                x: column / 4,
                                y: row,
                                expected: expectedPixel,
                                actual: actualPixel
                            };
                            diffPixels++;
                        }
                    }
                }

                this.stats.samplesCompared++;
                this.stats.lastDiffPixels = diffPixels;
                this.stats.lastMaxChannelDelta = maxChannelDelta;
                this.stats.lastFirstDiff = firstDiff;
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
    static lastCreateError: string = '';
    private frameTexture: GpuTexture | null = null;
    private scratchFrameTexture: GpuTexture | null = null;
    private modelDepthTexture: GpuTexture | null = null;
    private bindGroup: object | null = null;
    private alphaUniformBuffer: GpuBuffer | null = null;
    private gouraudUniformBuffer: GpuBuffer | null = null;
    private textureTriangleUniformBuffer: GpuBuffer | null = null;
    private rectInstanceUniformBuffer: GpuBuffer | null = null;
    private rectInstanceBindGroup: object | null = null;
    private rectInstanceUniformWidth: number = 0;
    private rectInstanceUniformHeight: number = 0;
    private spriteAlphaUniformBuffer: GpuBuffer | null = null;
    private glyphUniformBuffer: GpuBuffer | null = null;
    private indexedSpriteUniformBuffer: GpuBuffer | null = null;
    private transformSpriteUniformBuffer: GpuBuffer | null = null;
    private maskedSpriteUniformBuffer: GpuBuffer | null = null;
    private frameUniformBuffer: GpuBuffer | null = null;
    private frameUniformBufferBytes: number = 0;
    private frameUniformOffset: number = 0;
    private primitiveVertexBuffer: GpuBuffer | null = null;
    private primitiveVertexBufferBytes: number = 0;
    private primitiveVertexFrameOffset: number = 0;
    private rectInstanceBuffer: GpuBuffer | null = null;
    private rectInstanceBufferBytes: number = 0;
    private rectInstanceFrameOffset: number = 0;
    private modelFlatUniformBuffer: GpuBuffer | null = null;
    private spriteVertexBuffer: GpuBuffer | null = null;
    private spriteVertexBufferBytes: number = 0;
    private spriteVertexFrameOffset: number = 0;
    private readonly spriteTextures = new Map<number, { texture: GpuTexture; bindGroup: object; width: number; height: number; version: number }>();
    private readonly glyphTextures = new Map<number, { texture: GpuTexture; width: number; height: number; version: number }>();
    private readonly glyphReplayBindGroups = new Map<GpuTexture, Map<GpuTexture, object>>();
    private readonly spriteAlphaReplayBindGroups = new Map<GpuTexture, Map<GpuTexture, object>>();
    private readonly indexedSpriteReplayBindGroups = new Map<GpuTexture, Map<GpuTexture, object>>();
    private readonly transformSpriteReplayBindGroups = new Map<GpuTexture, Map<GpuTexture, object>>();
    private readonly maskedSpriteReplayBindGroups = new Map<GpuTexture, Map<GpuTexture, Map<GpuTexture, object>>>();
    private readonly modelFlatReplayBindGroups = new Map<GpuTexture, object>();
    private readonly textureTriangleReplayBindGroups = new Map<GpuTexture, Map<GpuTexture, object>>();
    private colourTableTexture: { texture: GpuTexture; width: number; height: number; version: number } | null = null;
    private readonly texelTextures = new Map<number, { indexTexture: GpuTexture; paletteTexture: GpuTexture; width: number; height: number; version: number }>();
    private readonly indexedSpriteTextures = new Map<number, { intensityTexture: GpuTexture; paletteTexture: GpuTexture; lineOffsetTexture: GpuTexture; width: number; height: number; version: number }>();
    private packetCursor: number = 0;
    private packetDropped: number = 0;
    private modelDepthClearPending: boolean = true;
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
        private readonly rectInstancePipeline: GpuRenderPipeline,
        private readonly spritePipeline: GpuRenderPipeline,
        private readonly spriteAlphaPipeline: GpuRenderPipeline,
        private readonly glyphPipeline: GpuRenderPipeline,
        private readonly indexedSpritePipeline: GpuRenderPipeline,
        private readonly transformSpritePipeline: GpuRenderPipeline,
        private readonly maskedSpritePipeline: GpuRenderPipeline,
        private readonly alphaPipeline: GpuRenderPipeline,
        private readonly modelFlatPipeline: GpuRenderPipeline,
        private readonly gouraudPipeline: GpuRenderPipeline,
        private readonly textureTrianglePipeline: GpuRenderPipeline,
        adapterInfo: WebGpuAdapterInfo | null,
        options: WebGpuFramePresenterOptions
    ) {
        this.validator = options.validate ? new WebGpuFrameValidator(device, options.validationSampleInterval || 120) : null;
        this.validationStats = this.validator?.stats ?? null;
        if (this.validationStats) {
            this.validationStats.adapterInfo = adapterInfo;
            this.validationStats.hardwareAdapter = isHardwareAdapter(adapterInfo);
        }
        this.packetReplayEnabled = options.packetReplay ?? false;
        this.packetReplayStats = {
            enabled: this.packetReplayEnabled && Boolean(this.bufferUsage?.COPY_DST && this.bufferUsage?.STORAGE && this.bufferUsage?.VERTEX && this.bufferUsage?.UNIFORM),
            framesAttempted: 0,
            framesReplayed: 0,
            framesFailed: 0,
            cpuImageDataUploads: 0,
            cpuRasterWriteBypasses: 0,
            nativeFlatTrianglesReplayed: 0,
            nativeGouraudTrianglesReplayed: 0,
            nativeTextureTrianglesReplayed: 0,
            gpuRectInstancesReplayed: 0,
            gpuRectBindGroupsReused: 0,
            gpuDynamicIndexedSpritesReplayed: 0,
            gpuGlyphSpritesReplayed: 0,
            gpuModelFlatTrianglesReplayed: 0,
            gpuRetainedDepthPassesReplayed: 0,
            gpuFrameCommandSubmits: 0,
            gpuRenderPassesEncoded: 0,
            gpuBindGroupsCreated: 0,
            gpuBufferWrites: 0,
            gpuUniformBufferWrites: 0,
            gpuTextureCopies: 0,
            gpuFrameUniformBytesAllocated: 0,
            gpuFrameVertexBytesAllocated: 0,
            gpuDirectDrawsReplayed: 0,
            gpuDirectRenderPassesReplayed: 0,
            gpuAlphaStorageDrawsReplayed: 0,
            gpuAlphaBindGroupsReused: 0,
            gpuGouraudStorageDrawsReplayed: 0,
            gpuGouraudBindGroupsReused: 0,
            gpuGlyphStorageDrawsReplayed: 0,
            gpuGlyphBindGroupsReused: 0,
            gpuSpriteFamilyStorageDrawsReplayed: 0,
            gpuSpriteFamilyBindGroupsReused: 0,
            gpuTriangleStorageDrawsReplayed: 0,
            gpuTriangleBindGroupsReused: 0,
            packetsReplayed: 0,
            lastPacketCount: 0,
            lastVertexCount: 0,
            lastError: ''
        };
        if (this.packetReplayEnabled) {
            gpuRenderPackets.setEnabled(true);
            gpuRenderPackets.setSkipCpuRasterWrites(true);
            if (!this.packetReplayStats.enabled) {
                this.packetReplayStats.lastError = 'GPUBufferUsage COPY_DST/STORAGE/UNIFORM/VERTEX unavailable';
            }
        }
        this.recreateFrameTexture();
    }

    static async create(sourceCanvas: HTMLCanvasElement, options: WebGpuFramePresenterOptions = {}): Promise<WebGpuFramePresenter | null> {
        WebGpuFramePresenter.lastCreateError = '';
        const gpu = getGpu();
        const textureUsage = getTextureUsage();
        if (!gpu || !textureUsage) {
            WebGpuFramePresenter.lastCreateError = 'navigator.gpu/GPUTextureUsage unavailable';
            return null;
        }

        const overlayCanvas = createOverlayCanvas(sourceCanvas);
        if (!overlayCanvas) {
            WebGpuFramePresenter.lastCreateError = 'overlay canvas creation failed';
            return null;
        }

        const adapter = await requestHighPerformanceAdapter(gpu);
        if (!adapter) {
            WebGpuFramePresenter.lastCreateError = 'requestAdapter returned null';
            overlayCanvas.remove();
            return null;
        }

        const adapterInfo = normalizeAdapterInfo(adapter.info);
        const device = await adapter.requestDevice();
        const overlayStack = installOverlayCanvas(sourceCanvas, overlayCanvas);
        if (!overlayStack) {
            WebGpuFramePresenter.lastCreateError = 'overlay canvas installation failed';
            overlayCanvas.remove();
            return null;
        }

        try {
            const context = overlayCanvas.getContext('webgpu') as unknown as GpuCanvasContext | null;
            if (!context) {
                WebGpuFramePresenter.lastCreateError = 'overlay canvas WebGPU context unavailable';
                uninstallOverlayCanvas(overlayStack, sourceCanvas, overlayCanvas);
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
            const rectInstanceShaderModule = device.createShaderModule({ code: RECT_INSTANCE_SHADER });
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
            const rectInstancePipeline = device.createRenderPipeline({
                layout: 'auto',
                vertex: {
                    module: rectInstanceShaderModule,
                    entryPoint: 'vs',
                    buffers: [
                        {
                            arrayStride: FLOATS_PER_RECT_INSTANCE * 4,
                            stepMode: 'instance',
                            attributes: [
                                {
                                    shaderLocation: 0,
                                    offset: 0,
                                    format: 'float32x4'
                                },
                                {
                                    shaderLocation: 1,
                                    offset: 4 * 4,
                                    format: 'float32x4'
                                }
                            ]
                        }
                    ]
                },
                fragment: {
                    module: rectInstanceShaderModule,
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
            const gouraudShaderModule = device.createShaderModule({ code: GOURAUD_SHADER });
            const textureTriangleShaderModule = device.createShaderModule({ code: TEXTURE_TRIANGLE_SHADER });
            const spriteAlphaShaderModule = device.createShaderModule({ code: SPRITE_ALPHA_SHADER });
            const glyphShaderModule = device.createShaderModule({ code: GLYPH_SHADER });
            const indexedSpriteShaderModule = device.createShaderModule({ code: INDEXED_SPRITE_SHADER });
            const transformSpriteShaderModule = device.createShaderModule({ code: TRANSFORM_SPRITE_SHADER });
            const maskedSpriteShaderModule = device.createShaderModule({ code: MASKED_SPRITE_SHADER });
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
            const modelFlatShaderModule = device.createShaderModule({ code: MODEL_FLAT_SHADER });
            const modelFlatPipeline = device.createRenderPipeline({
                layout: 'auto',
                vertex: {
                    module: modelFlatShaderModule,
                    entryPoint: 'vs'
                },
                fragment: {
                    module: modelFlatShaderModule,
                    entryPoint: 'fs',
                    targets: [{ format: FRAME_TEXTURE_FORMAT }]
                },
                primitive: {
                    topology: 'triangle-list'
                },
                depthStencil: {
                    format: 'depth24plus',
                    depthWriteEnabled: true,
                    depthCompare: 'less'
                }
            });
            const gouraudPipeline = device.createRenderPipeline({
                layout: 'auto',
                vertex: {
                    module: gouraudShaderModule,
                    entryPoint: 'vs'
                },
                fragment: {
                    module: gouraudShaderModule,
                    entryPoint: 'fs',
                    targets: [{ format: FRAME_TEXTURE_FORMAT }]
                },
                primitive: {
                    topology: 'triangle-list'
                }
            });
            const textureTrianglePipeline = device.createRenderPipeline({
                layout: 'auto',
                vertex: {
                    module: textureTriangleShaderModule,
                    entryPoint: 'vs'
                },
                fragment: {
                    module: textureTriangleShaderModule,
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
            const glyphPipeline = device.createRenderPipeline({
                layout: 'auto',
                vertex: {
                    module: glyphShaderModule,
                    entryPoint: 'vs'
                },
                fragment: {
                    module: glyphShaderModule,
                    entryPoint: 'fs',
                    targets: [{ format: FRAME_TEXTURE_FORMAT }]
                },
                primitive: {
                    topology: 'triangle-list'
                }
            });
            const indexedSpritePipeline = device.createRenderPipeline({
                layout: 'auto',
                vertex: {
                    module: indexedSpriteShaderModule,
                    entryPoint: 'vs'
                },
                fragment: {
                    module: indexedSpriteShaderModule,
                    entryPoint: 'fs',
                    targets: [{ format: FRAME_TEXTURE_FORMAT }]
                },
                primitive: {
                    topology: 'triangle-list'
                }
            });
            const transformSpritePipeline = device.createRenderPipeline({
                layout: 'auto',
                vertex: {
                    module: transformSpriteShaderModule,
                    entryPoint: 'vs'
                },
                fragment: {
                    module: transformSpriteShaderModule,
                    entryPoint: 'fs',
                    targets: [{ format: FRAME_TEXTURE_FORMAT }]
                },
                primitive: {
                    topology: 'triangle-list'
                }
            });
            const maskedSpritePipeline = device.createRenderPipeline({
                layout: 'auto',
                vertex: {
                    module: maskedSpriteShaderModule,
                    entryPoint: 'vs'
                },
                fragment: {
                    module: maskedSpriteShaderModule,
                    entryPoint: 'fs',
                    targets: [{ format: FRAME_TEXTURE_FORMAT }]
                },
                primitive: {
                    topology: 'triangle-list'
                }
            });

            const presenter = new WebGpuFramePresenter(sourceCanvas, overlayCanvas, device, context, textureFormat, sampler, pipeline, primitivePipeline, rectInstancePipeline, spritePipeline, spriteAlphaPipeline, glyphPipeline, indexedSpritePipeline, transformSpritePipeline, maskedSpritePipeline, alphaPipeline, modelFlatPipeline, gouraudPipeline, textureTrianglePipeline, adapterInfo, options);
            device.lost?.then(info => {
                console.warn(`[WebGPU] device lost: ${info.reason || 'unknown'} ${info.message || ''}`.trim());
                presenter.disable();
            });

            return presenter;
        } catch (err) {
            uninstallOverlayCanvas(overlayStack, sourceCanvas, overlayCanvas);
            throw err;
        }
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

    presentPackets(surfaceWidth: number, surfaceHeight: number, x: number, y: number, expectedImageData: ImageData | null = null, surfaceId?: number): boolean {
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

        this.replayPacketsOrThrow(surfaceWidth, surfaceHeight, x, y, surfaceId);
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
        this.modelDepthTexture?.destroy();
        this.glyphReplayBindGroups.clear();
        this.clearSpriteFamilyReplayBindGroups();
        this.clearTriangleReplayBindGroups();
        this.width = Math.max(1, this.sourceCanvas.width);
        this.height = Math.max(1, this.sourceCanvas.height);

        this.frameTexture = this.createFrameTexture();
        this.scratchFrameTexture = this.createFrameTexture();
        this.modelDepthTexture = this.createDepthTexture();
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

    private createDepthTexture(): GpuTexture {
        return this.device.createTexture({
            size: {
                width: this.width,
                height: this.height,
                depthOrArrayLayers: 1
            },
            format: 'depth24plus',
            usage: getTextureUsage()!.RENDER_ATTACHMENT
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

    private replayPacketsOrThrow(surfaceWidth: number, surfaceHeight: number, x: number, y: number, surfaceId?: number): void {
        if (!this.packetReplayStats.enabled || !this.frameTexture) {
            this.failPacketReplay(this.packetReplayStats.lastError || 'packet replay requested but WebGPU vertex replay is unavailable');
        }

        const snapshot = gpuRenderPackets.snapshot();
        if (!snapshot.enabled) {
            this.failPacketReplay('packet replay requested but packet recording is disabled');
        }

        if (snapshot.packets.length === this.packetCursor && snapshot.dropped === this.packetDropped) {
            if (this.packetReplayStats.framesReplayed > 0) {
                return;
            }

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

        const targetSurfaceId = surfaceId ?? snapshot.currentSurface;
        const surface = snapshot.surfaces.find(item => item.id === targetSurfaceId);
        if (!surface || surface.width !== surfaceWidth || surface.height !== surfaceHeight) {
            this.failPacketReplay('current packet surface does not match presentation surface');
        }

        const result = this.buildPacketReplayVertices(snapshot, x | 0, y | 0, surface.width, surface.height, surface.id);
        this.packetReplayStats.lastPacketCount = result.packetCount;
        this.packetReplayStats.cpuRasterWriteBypasses = snapshot.cpuRasterWriteBypasses;
        const vertexCount = result.steps.reduce((total, step) => {
            if (step.kind === 'vertices') {
                return total + step.vertices.length / FLOATS_PER_PRIMITIVE_VERTEX;
            }
            if (step.kind === 'rectInstances') {
                return total + (step.instances.length / FLOATS_PER_RECT_INSTANCE) * 6;
            }
            return total + 6;
        }, 0);
        if (result.steps.length === 0) {
            if (this.packetReplayStats.framesReplayed > 0) {
                return;
            }

            this.failPacketReplay('no drawable 2D packets');
        }

        this.modelDepthClearPending = true;
        this.replayPrimitiveSteps(result.steps);
        this.packetDropped = snapshot.dropped;
        this.packetReplayStats.framesReplayed++;
        this.packetReplayStats.packetsReplayed += result.packetCount;
        this.packetReplayStats.nativeFlatTrianglesReplayed += result.nativeFlatTriangleCount;
        this.packetReplayStats.nativeGouraudTrianglesReplayed += result.nativeGouraudTriangleCount;
        this.packetReplayStats.nativeTextureTrianglesReplayed += result.nativeTextureTriangleCount;
        this.packetReplayStats.lastVertexCount = vertexCount;
        this.packetReplayStats.lastError = '';
        gpuRenderPackets.discardSurface(surface.id);
        this.packetCursor = 0;
    }

    private buildPacketReplayVertices(
        snapshot: GpuRenderPacketSnapshot,
        offsetX: number,
        offsetY: number,
        surfaceWidth: number,
        surfaceHeight: number,
        targetSurface: number
    ): PacketReplayBuildResult {
        const steps: PacketReplayStep[] = [];
        let vertices: number[] = [];
        let rectInstances: number[] = [];
        let packetCount = 0;
        let nativeFlatTriangleCount = 0;
        let nativeGouraudTriangleCount = 0;
        let nativeTextureTriangleCount = 0;
        let clip: PacketClip = { minX: 0, minY: 0, maxX: surfaceWidth, maxY: surfaceHeight };
        const packets = snapshot.packets.slice(this.packetCursor);

        const flushVertices = (): void => {
            if (vertices.length === 0) {
                return;
            }

            steps.push({ kind: 'vertices', vertices: new Float32Array(vertices) });
            vertices = [];
        };
        const flushRectInstances = (): void => {
            if (rectInstances.length === 0) {
                return;
            }

            steps.push({ kind: 'rectInstances', instances: new Float32Array(rectInstances) });
            rectInstances = [];
        };
        const flushBatches = (): void => {
            flushRectInstances();
            flushVertices();
        };
        const pushAlphaRect = (rect: Rect, rgb: number, packetClip: PacketClip, alpha: number): void => {
            const targetRect = clipSurfaceRectToTarget(rect, packetClip, offsetX, offsetY, this.width, this.height);
            if (!targetRect) {
                return;
            }

            flushBatches();
            steps.push({ kind: 'alpha', op: { kind: 'rect', rect: targetRect, rgb, alpha } });
        };
        const pushPacketRect = (rect: Rect, rgb: number, packetClip: PacketClip, alpha: number | null = null): void => {
            if (alpha !== null) {
                pushAlphaRect(rect, rgb, packetClip, alpha);
                return;
            }

            pushSurfaceRectInstance(rectInstances, rect, rgb, packetClip, offsetX, offsetY, this.width, this.height);
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
                        flushBatches();
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

                    flushBatches();
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
                case 'indexedSprite': {
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

                    flushBatches();
                    steps.push({
                        kind: 'indexedSprite',
                        op: {
                            resource: packet.resource,
                            rect: targetRect,
                            originX: packet.x + offsetX,
                            originY: packet.y + offsetY,
                            srcX: packet.srcX + (clippedSurfaceRect.x - packet.x) + (targetRect.x - unclippedTargetRect.x),
                            srcY: packet.srcY + (clippedSurfaceRect.y - packet.y) + (targetRect.y - unclippedTargetRect.y),
                            mode: packet.mode === 'titleFlameLeft' ? 1 : packet.mode === 'titleFlameRight' ? 2 : 0
                        }
                    });
                    break;
                }
                case 'glyphSprite': {
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

                    flushBatches();
                    steps.push({
                        kind: 'glyphSprite',
                        op: {
                            resource: packet.resource,
                            rect: targetRect,
                            srcX: packet.srcX + (clippedSurfaceRect.x - packet.x) + (targetRect.x - unclippedTargetRect.x),
                            srcY: packet.srcY + (clippedSurfaceRect.y - packet.y) + (targetRect.y - unclippedTargetRect.y),
                            rgb: packet.rgb,
                            alpha: packet.alpha
                        }
                    });
                    break;
                }
                case 'transformSprite': {
                    const targetRect = clipSurfaceRectToTarget(
                        { x: packet.x, y: packet.y, width: packet.width, height: packet.height },
                        packet.clip,
                        offsetX,
                        offsetY,
                        this.width,
                        this.height
                    );
                    if (!targetRect) {
                        break;
                    }

                    const skippedX = targetRect.x - (packet.x + offsetX);
                    const skippedY = targetRect.y - (packet.y + offsetY);
                    flushBatches();
                    steps.push({
                        kind: 'transformSprite',
                        op: {
                            resource: packet.resource,
                            rect: targetRect,
                            startX: packet.startX + skippedY * packet.rowStepX + skippedX * packet.stepX,
                            startY: packet.startY + skippedY * packet.rowStepY + skippedX * packet.stepY,
                            stepX: packet.stepX,
                            stepY: packet.stepY,
                            rowStepX: packet.rowStepX,
                            rowStepY: packet.rowStepY,
                            sourceStride: packet.sourceStride,
                            transparentZero: packet.transparentZero
                        }
                    });
                    break;
                }
                case 'maskedSprite': {
                    const targetRect = clipSurfaceRectToTarget(
                        { x: packet.x, y: packet.y, width: packet.width, height: packet.height },
                        packet.clip,
                        offsetX,
                        offsetY,
                        this.width,
                        this.height
                    );
                    if (!targetRect) {
                        break;
                    }

                    const skippedX = targetRect.x - (packet.x + offsetX);
                    const skippedY = targetRect.y - (packet.y + offsetY);
                    flushBatches();
                    steps.push({
                        kind: 'maskedSprite',
                        op: {
                            resource: packet.resource,
                            maskResource: packet.maskResource,
                            rect: targetRect,
                            srcX: packet.srcX + skippedX,
                            srcY: packet.srcY + skippedY,
                            surfaceX: packet.x + skippedX,
                            surfaceY: packet.y + skippedY,
                            maskStride: packet.maskStride
                        }
                    });
                    break;
                }
                case 'triangleFlat':
                    if (packet.gpuRasterize) {
                        nativeFlatTriangleCount++;
                        flushBatches();
                        steps.push({
                            kind: 'alpha',
                            op: {
                                kind: 'flatTriangle',
                                xA: packet.xA + offsetX,
                                yA: packet.yA + offsetY,
                                xB: packet.xB + offsetX,
                                yB: packet.yB + offsetY,
                                xC: packet.xC + offsetX,
                                yC: packet.yC + offsetY,
                                clip: {
                                    x: packet.clip.minX + offsetX,
                                    y: packet.clip.minY + offsetY,
                                    width: packet.clip.maxX - packet.clip.minX,
                                    height: packet.clip.maxY - packet.clip.minY
                                },
                                rgb: packet.colour,
                                alpha: packet.alpha
                            }
                        });
                    }
                    break;
                case 'triangleGouraud':
                    if (packet.gpuRasterize) {
                        nativeGouraudTriangleCount++;
                        flushBatches();
                        steps.push({
                            kind: 'gouraud',
                            op: {
                                xA: packet.xA + offsetX,
                                yA: packet.yA + offsetY,
                                xB: packet.xB + offsetX,
                                yB: packet.yB + offsetY,
                                xC: packet.xC + offsetX,
                                yC: packet.yC + offsetY,
                                colourA: packet.colourA,
                                colourB: packet.colourB,
                                colourC: packet.colourC,
                                alpha: packet.alpha,
                                lowDetail: packet.lowDetail,
                                hclip: packet.hclip,
                                clip: {
                                    x: packet.clip.minX + offsetX,
                                    y: packet.clip.minY + offsetY,
                                    width: packet.clip.maxX - packet.clip.minX,
                                    height: packet.clip.maxY - packet.clip.minY
                                }
                            }
                        });
                    }
                    break;
                case 'triangleTexture':
                    if (packet.gpuRasterize && packet.hasTexels) {
                        nativeTextureTriangleCount++;
                        flushBatches();
                        steps.push({
                            kind: 'textureTriangle',
                            op: {
                                texture: packet.texture,
                                xA: packet.xA + offsetX,
                                yA: packet.yA + offsetY,
                                xB: packet.xB + offsetX,
                                yB: packet.yB + offsetY,
                                xC: packet.xC + offsetX,
                                yC: packet.yC + offsetY,
                                shadeA: packet.shadeA,
                                shadeB: packet.shadeB,
                                shadeC: packet.shadeC,
                                originX: packet.originX,
                                originY: packet.originY,
                                originZ: packet.originZ,
                                txB: packet.txB,
                                txC: packet.txC,
                                tyB: packet.tyB,
                                tyC: packet.tyC,
                                tzB: packet.tzB,
                                tzC: packet.tzC,
                                lowMem: packet.lowMem,
                                opaque: packet.opaque,
                                hclip: packet.hclip,
                                screenOriginX: packet.screenOriginX + offsetX,
                                screenOriginY: packet.screenOriginY + offsetY,
                                clip: {
                                    x: packet.clip.minX + offsetX,
                                    y: packet.clip.minY + offsetY,
                                    width: packet.clip.maxX - packet.clip.minX,
                                    height: packet.clip.maxY - packet.clip.minY
                                }
                            }
                        });
                    }
                    break;
                case 'modelFlatTriangle':
                    flushBatches();
                    steps.push({
                        kind: 'modelFlatTriangle',
                        op: {
                            xA: packet.xA,
                            yA: packet.yA,
                            zA: packet.zA,
                            xB: packet.xB,
                            yB: packet.yB,
                            zB: packet.zB,
                            xC: packet.xC,
                            yC: packet.yC,
                            zC: packet.zC,
                            sinYaw: packet.sinYaw,
                            cosYaw: packet.cosYaw,
                            sinEyePitch: packet.sinEyePitch,
                            cosEyePitch: packet.cosEyePitch,
                            sinEyeYaw: packet.sinEyeYaw,
                            cosEyeYaw: packet.cosEyeYaw,
                            relativeX: packet.relativeX,
                            relativeY: packet.relativeY,
                            relativeZ: packet.relativeZ,
                            originX: packet.originX + offsetX,
                            originY: packet.originY + offsetY,
                            rgb: packet.rgb,
                            alpha: packet.alpha,
                            clip: {
                                x: packet.clip.minX + offsetX,
                                y: packet.clip.minY + offsetY,
                                width: packet.clip.maxX - packet.clip.minX,
                                height: packet.clip.maxY - packet.clip.minY
                            }
                        }
                    });
                    break;
                default:
                    this.failPacketReplay('unknown packet kind');
            }
        }

        flushBatches();
        return { steps, packetCount, nativeFlatTriangleCount, nativeGouraudTriangleCount, nativeTextureTriangleCount };
    }

    private replayPrimitiveSteps(steps: PacketReplayStep[]): void {
        this.prepareFrameUniformArena(steps);
        this.prepareFrameVertexArenas(steps);
        const context: PacketReplayContext = {
            encoder: this.device.createCommandEncoder(),
            directPass: null,
            alphaBindGroups: new Map<GpuTexture, object>(),
            gouraudBindGroups: new Map<GpuTexture, object>()
        };

        for (const step of steps) {
            if (step.kind === 'vertices') {
                this.replayPrimitiveVertices(step.vertices, context);
            } else if (step.kind === 'alpha') {
                this.replayAlphaOp(step.op, context);
            } else if (step.kind === 'rectInstances') {
                this.replayRectInstances(step.instances, context);
            } else if (step.kind === 'gouraud') {
                const resource = gpuRenderPackets.snapshot().colourTableResource;
                if (!resource) {
                    this.failPacketReplay('colour table resource is missing');
                }

                this.replayGouraudOp(step.op, resource, context);
            } else if (step.kind === 'modelFlatTriangle') {
                this.replayModelFlatOp(step.op, context);
            } else if (step.kind === 'textureTriangle') {
                const resource = gpuRenderPackets.snapshot().textureResources.find(item => item.id === step.op.texture);
                if (!resource) {
                    this.failPacketReplay(`texture resource ${step.op.texture} is missing`);
                }

                this.replayTextureTriangleOp(step.op, resource, context);
            } else if (step.kind === 'indexedSprite') {
                const resource = gpuRenderPackets.snapshot().indexedSpriteResources.find(item => item.id === step.op.resource);
                if (!resource) {
                    this.failPacketReplay(`indexed sprite resource ${step.op.resource} is missing`);
                }

                this.replayIndexedSpriteOp(step.op, resource, context);
            } else if (step.kind === 'glyphSprite') {
                const resource = gpuRenderPackets.snapshot().glyphResources.find(item => item.id === step.op.resource);
                if (!resource) {
                    this.failPacketReplay(`glyph resource ${step.op.resource} is missing`);
                }

                this.replayGlyphOp(step.op, resource, context);
            } else if (step.kind === 'maskedSprite') {
                const resources = gpuRenderPackets.snapshot().spriteResources;
                const resource = resources.find(item => item.id === step.op.resource);
                if (!resource) {
                    this.failPacketReplay(`sprite resource ${step.op.resource} is missing`);
                }

                const maskResource = resources.find(item => item.id === step.op.maskResource);
                if (!maskResource) {
                    this.failPacketReplay(`mask resource ${step.op.maskResource} is missing`);
                }

                this.replayMaskedSpriteOp(step.op, resource, maskResource, context);
            } else {
                const resource = gpuRenderPackets.snapshot().spriteResources.find(item => item.id === step.op.resource);
                if (!resource) {
                    this.failPacketReplay(`sprite resource ${step.op.resource} is missing`);
                }
                if (step.kind === 'transformSprite') {
                    this.replayTransformSpriteOp(step.op, resource, context);
                } else if (this.canReplaySpriteDirectly(step.op)) {
                    this.replaySpriteOp(step.op, resource, context);
                } else {
                    this.replayAlphaSpriteOp(step.op, resource, context);
                }
            }
        }

        this.endDirectReplayPass(context);
        this.submitReplayCommands(context);
        this.recreateDisplayBindGroup();
    }

    private replayPrimitiveVertices(vertices: Float32Array, context: PacketReplayContext): void {
        const vertexBinding = this.allocatePrimitiveVertices(vertices);

        const pass = this.beginDirectReplayPass(context);

        pass.setPipeline(this.primitivePipeline);
        pass.setVertexBuffer(0, vertexBinding.buffer, vertexBinding.offset, vertexBinding.size);
        pass.draw(vertices.length / FLOATS_PER_PRIMITIVE_VERTEX);
        this.packetReplayStats.gpuDirectDrawsReplayed++;
    }

    private replayRectInstances(instances: Float32Array, context: PacketReplayContext): void {
        const instanceCount = instances.length / FLOATS_PER_RECT_INSTANCE;
        if (instanceCount <= 0) {
            return;
        }

        const instanceBinding = this.allocateRectInstances(instances);
        const bindGroup = this.getRectInstanceBindGroup();
        const pass = this.beginDirectReplayPass(context);

        pass.setPipeline(this.rectInstancePipeline);
        pass.setBindGroup(0, bindGroup);
        pass.setVertexBuffer(0, instanceBinding.buffer, instanceBinding.offset, instanceBinding.size);
        pass.draw(6, instanceCount);
        this.packetReplayStats.gpuDirectDrawsReplayed++;
        this.packetReplayStats.gpuRectInstancesReplayed += instanceCount;
    }

    private replayAlphaOp(op: AlphaReplayOp, context: PacketReplayContext): void {
        if (!this.frameTexture || !this.scratchFrameTexture) {
            this.failPacketReplay('alpha replay requested before frame textures exist');
        }

        this.endDirectReplayPass(context);
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
        } else if (op.kind === 'circle') {
            params[0] = 1;
            params[5] = op.xCenter;
            params[6] = op.yCenter;
            params[7] = op.yRadius;
            params[10] = op.clip.x;
            params[11] = op.clip.y;
            params[12] = op.clip.x + op.clip.width;
            params[13] = op.clip.y + op.clip.height;
        } else {
            params[0] = 2;
            params[1] = op.xA;
            params[2] = op.yA;
            params[3] = op.xB;
            params[4] = op.yB;
            params[5] = op.xC;
            params[6] = op.yC;
            params[10] = op.clip.x;
            params[11] = op.clip.y;
            params[12] = op.clip.x + op.clip.width;
            params[13] = op.clip.y + op.clip.height;
        }
        params[8] = op.rgb;
        params[9] = op.alpha;
        const uniform = this.allocateFrameUniform(params);

        const bindGroup = this.getAlphaBindGroup(context, this.frameTexture);
        const pass = this.beginReplayRenderPass(context, {
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
        pass.draw(6, 1, 0, uniform.offset / 4);
        pass.end();
        this.packetReplayStats.gpuAlphaStorageDrawsReplayed++;

        const oldFrameTexture = this.frameTexture;
        this.frameTexture = this.scratchFrameTexture;
        this.scratchFrameTexture = oldFrameTexture;
    }

    private replayModelFlatOp(op: ModelFlatReplayOp, context: PacketReplayContext): void {
        if (!this.frameTexture || !this.scratchFrameTexture || !this.modelDepthTexture) {
            this.failPacketReplay('model flat replay requested before frame textures exist');
        }

        this.endDirectReplayPass(context);
        const params = new Int32Array(MODEL_FLAT_UNIFORM_INTS);
        params[0] = op.xA;
        params[1] = op.yA;
        params[2] = op.zA;
        params[3] = op.xB;
        params[4] = op.yB;
        params[5] = op.zB;
        params[6] = op.xC;
        params[7] = op.yC;
        params[8] = op.zC;
        params[9] = op.sinYaw;
        params[10] = op.cosYaw;
        params[11] = op.sinEyePitch;
        params[12] = op.cosEyePitch;
        params[13] = op.sinEyeYaw;
        params[14] = op.cosEyeYaw;
        params[15] = op.relativeX;
        params[16] = op.relativeY;
        params[17] = op.relativeZ;
        params[18] = op.originX;
        params[19] = op.originY;
        params[20] = op.rgb;
        params[21] = op.alpha;
        params[22] = op.clip.x;
        params[23] = op.clip.y;
        params[24] = op.clip.x + op.clip.width;
        params[25] = op.clip.y + op.clip.height;
        const uniform = this.allocateFrameUniform(params);

        const bindGroup = this.getModelFlatBindGroup(this.frameTexture);
        const clearDepth = this.modelDepthClearPending;
        this.modelDepthClearPending = false;
        this.copyReplayTextureToTexture(
            context,
            { texture: this.frameTexture },
            { texture: this.scratchFrameTexture },
            {
                width: this.width,
                height: this.height,
                depthOrArrayLayers: 1
            }
        );
        const pass = this.beginReplayRenderPass(context, {
            colorAttachments: [
                {
                    view: this.scratchFrameTexture.createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: 'load',
                    storeOp: 'store'
                }
            ],
            depthStencilAttachment: {
                view: this.modelDepthTexture.createView(),
                depthClearValue: 1,
                depthLoadOp: clearDepth ? 'clear' : 'load',
                depthStoreOp: 'store'
            }
        });

        pass.setPipeline(this.modelFlatPipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(6, 1, 0, uniform.offset / 4);
        pass.end();

        const oldFrameTexture = this.frameTexture;
        this.frameTexture = this.scratchFrameTexture;
        this.scratchFrameTexture = oldFrameTexture;
        this.packetReplayStats.gpuModelFlatTrianglesReplayed++;
        this.packetReplayStats.gpuRetainedDepthPassesReplayed++;
        this.packetReplayStats.gpuTriangleStorageDrawsReplayed++;
    }

    private replayGouraudOp(op: GouraudReplayOp, resource: GpuColourTableResource, context: PacketReplayContext): void {
        if (!this.frameTexture || !this.scratchFrameTexture) {
            this.failPacketReplay('gouraud replay requested before frame textures exist');
        }

        this.endDirectReplayPass(context);
        const colourTable = this.getColourTableTexture(resource);
        const params = new Int32Array(GOURAUD_UNIFORM_INTS);
        params[0] = op.xA;
        params[1] = op.yA;
        params[2] = op.xB;
        params[3] = op.yB;
        params[4] = op.xC;
        params[5] = op.yC;
        params[6] = op.colourA;
        params[7] = op.colourB;
        params[8] = op.colourC;
        params[9] = op.alpha;
        params[10] = op.lowDetail ? 1 : 0;
        params[11] = op.hclip ? 1 : 0;
        params[12] = op.clip.x;
        params[13] = op.clip.y;
        params[14] = op.clip.x + op.clip.width;
        params[15] = op.clip.y + op.clip.height;
        const uniform = this.allocateFrameUniform(params);

        const bindGroup = this.getGouraudBindGroup(context, this.frameTexture, colourTable.texture);
        const pass = this.beginReplayRenderPass(context, {
            colorAttachments: [
                {
                    view: this.scratchFrameTexture.createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: 'clear',
                    storeOp: 'store'
                }
            ]
        });

        pass.setPipeline(this.gouraudPipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(6, 1, 0, uniform.offset / 4);
        pass.end();
        this.packetReplayStats.gpuGouraudStorageDrawsReplayed++;

        const oldFrameTexture = this.frameTexture;
        this.frameTexture = this.scratchFrameTexture;
        this.scratchFrameTexture = oldFrameTexture;
    }

    private replayTextureTriangleOp(op: TextureTriangleReplayOp, resource: GpuTextureResource, context: PacketReplayContext): void {
        if (!this.frameTexture || !this.scratchFrameTexture) {
            this.failPacketReplay('texture triangle replay requested before frame textures exist');
        }

        this.endDirectReplayPass(context);
        const texels = this.getTexelTexture(resource);
        const params = new Int32Array(TEXTURE_TRIANGLE_UNIFORM_INTS);
        params[0] = op.xA;
        params[1] = op.yA;
        params[2] = op.xB;
        params[3] = op.yB;
        params[4] = op.xC;
        params[5] = op.yC;
        params[6] = op.shadeA;
        params[7] = op.shadeB;
        params[8] = op.shadeC;
        params[9] = op.originX;
        params[10] = op.originY;
        params[11] = op.originZ;
        params[12] = op.txB;
        params[13] = op.txC;
        params[14] = op.tyB;
        params[15] = op.tyC;
        params[16] = op.tzB;
        params[17] = op.tzC;
        params[18] = op.lowMem ? 1 : 0;
        params[19] = op.opaque ? 1 : 0;
        params[20] = op.hclip ? 1 : 0;
        params[21] = op.screenOriginX;
        params[22] = op.screenOriginY;
        params[23] = op.clip.x;
        params[24] = op.clip.y;
        params[25] = op.clip.x + op.clip.width;
        params[26] = op.clip.y + op.clip.height;
        params[27] = resource.width;
        params[28] = resource.height;
        const uniform = this.allocateFrameUniform(params);

        const bindGroup = this.getTextureTriangleBindGroup(this.frameTexture, texels.indexTexture, texels.paletteTexture);
        const pass = this.beginReplayRenderPass(context, {
            colorAttachments: [
                {
                    view: this.scratchFrameTexture.createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: 'clear',
                    storeOp: 'store'
                }
            ]
        });

        pass.setPipeline(this.textureTrianglePipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(6, 1, 0, uniform.offset / 4);
        pass.end();
        this.packetReplayStats.gpuTriangleStorageDrawsReplayed++;

        const oldFrameTexture = this.frameTexture;
        this.frameTexture = this.scratchFrameTexture;
        this.scratchFrameTexture = oldFrameTexture;
    }

    private replaySpriteOp(op: SpriteReplayOp, resource: GpuSpriteResource, context: PacketReplayContext): void {
        const cached = this.getSpriteTexture(resource);
        const vertices = this.buildSpriteVertices(op, resource);
        const vertexBinding = this.allocateSpriteVertices(vertices);

        const pass = this.beginDirectReplayPass(context);

        pass.setPipeline(this.spritePipeline);
        pass.setBindGroup(0, cached.bindGroup);
        pass.setVertexBuffer(0, vertexBinding.buffer, vertexBinding.offset, vertexBinding.size);
        pass.draw(6);
        this.packetReplayStats.gpuDirectDrawsReplayed++;
    }

    private replayAlphaSpriteOp(op: SpriteReplayOp, resource: GpuSpriteResource, context: PacketReplayContext): void {
        if (!this.frameTexture || !this.scratchFrameTexture) {
            this.failPacketReplay('alpha sprite replay requested before frame textures exist');
        }

        this.endDirectReplayPass(context);
        const cached = this.getSpriteTexture(resource);
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
        const uniform = this.allocateFrameUniform(params);

        const bindGroup = this.getSpriteAlphaBindGroup(this.frameTexture, cached.texture);
        const pass = this.beginReplayRenderPass(context, {
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
        pass.draw(6, 1, 0, uniform.offset / 4);
        pass.end();
        this.packetReplayStats.gpuSpriteFamilyStorageDrawsReplayed++;

        const oldFrameTexture = this.frameTexture;
        this.frameTexture = this.scratchFrameTexture;
        this.scratchFrameTexture = oldFrameTexture;
    }

    private replayGlyphOp(op: GlyphReplayOp, resource: GpuGlyphResource, context: PacketReplayContext): void {
        if (!this.frameTexture || !this.scratchFrameTexture) {
            this.failPacketReplay('glyph replay requested before frame textures exist');
        }

        this.endDirectReplayPass(context);
        const cached = this.getGlyphTexture(resource);
        const params = new Int32Array(GLYPH_UNIFORM_INTS);
        params[0] = op.rect.x;
        params[1] = op.rect.y;
        params[2] = op.rect.width;
        params[3] = op.rect.height;
        params[4] = op.srcX;
        params[5] = op.srcY;
        params[6] = op.rgb;
        params[7] = op.alpha ?? 256;
        const uniform = this.allocateFrameUniform(params);

        const bindGroup = this.getGlyphBindGroup(this.frameTexture, cached.texture);
        const pass = this.beginReplayRenderPass(context, {
            colorAttachments: [
                {
                    view: this.scratchFrameTexture.createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: 'clear',
                    storeOp: 'store'
                }
            ]
        });

        pass.setPipeline(this.glyphPipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(6, 1, 0, uniform.offset / 4);
        pass.end();
        this.packetReplayStats.gpuGlyphStorageDrawsReplayed++;

        const oldFrameTexture = this.frameTexture;
        this.frameTexture = this.scratchFrameTexture;
        this.scratchFrameTexture = oldFrameTexture;
        this.packetReplayStats.gpuGlyphSpritesReplayed++;
    }

    private replayIndexedSpriteOp(op: IndexedSpriteReplayOp, resource: GpuIndexedSpriteResource, context: PacketReplayContext): void {
        if (!this.frameTexture || !this.scratchFrameTexture) {
            this.failPacketReplay('indexed sprite replay requested before frame textures exist');
        }

        this.endDirectReplayPass(context);
        const cached = this.getIndexedSpriteTexture(resource);
        const params = new Int32Array(INDEXED_SPRITE_UNIFORM_INTS);
        params[0] = op.rect.x;
        params[1] = op.rect.y;
        params[2] = op.rect.width;
        params[3] = op.rect.height;
        params[4] = op.originX;
        params[5] = op.originY;
        params[6] = op.srcX;
        params[7] = op.srcY;
        params[8] = op.mode;
        const uniform = this.allocateFrameUniform(params);

        const bindGroup = this.getIndexedSpriteBindGroup(this.frameTexture, cached.intensityTexture, cached.paletteTexture, cached.lineOffsetTexture);
        const pass = this.beginReplayRenderPass(context, {
            colorAttachments: [
                {
                    view: this.scratchFrameTexture.createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: 'clear',
                    storeOp: 'store'
                }
            ]
        });

        pass.setPipeline(this.indexedSpritePipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(6, 1, 0, uniform.offset / 4);
        pass.end();
        this.packetReplayStats.gpuSpriteFamilyStorageDrawsReplayed++;

        const oldFrameTexture = this.frameTexture;
        this.frameTexture = this.scratchFrameTexture;
        this.scratchFrameTexture = oldFrameTexture;
        this.packetReplayStats.gpuDynamicIndexedSpritesReplayed++;
    }

    private replayTransformSpriteOp(op: TransformSpriteReplayOp, resource: GpuSpriteResource, context: PacketReplayContext): void {
        if (!this.frameTexture || !this.scratchFrameTexture) {
            this.failPacketReplay('transform sprite replay requested before frame textures exist');
        }

        this.endDirectReplayPass(context);
        const cached = this.getSpriteTexture(resource);
        const params = new Int32Array(TRANSFORM_SPRITE_UNIFORM_INTS);
        params[0] = op.rect.x;
        params[1] = op.rect.y;
        params[2] = op.rect.width;
        params[3] = op.rect.height;
        params[4] = op.startX;
        params[5] = op.startY;
        params[6] = op.stepX;
        params[7] = op.stepY;
        params[8] = op.rowStepX;
        params[9] = op.rowStepY;
        params[10] = op.transparentZero ? 1 : 0;
        params[11] = op.sourceStride;
        const uniform = this.allocateFrameUniform(params);

        const bindGroup = this.getTransformSpriteBindGroup(this.frameTexture, cached.texture);
        const pass = this.beginReplayRenderPass(context, {
            colorAttachments: [
                {
                    view: this.scratchFrameTexture.createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: 'clear',
                    storeOp: 'store'
                }
            ]
        });

        pass.setPipeline(this.transformSpritePipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(6, 1, 0, uniform.offset / 4);
        pass.end();
        this.packetReplayStats.gpuSpriteFamilyStorageDrawsReplayed++;

        const oldFrameTexture = this.frameTexture;
        this.frameTexture = this.scratchFrameTexture;
        this.scratchFrameTexture = oldFrameTexture;
    }

    private replayMaskedSpriteOp(op: MaskedSpriteReplayOp, resource: GpuSpriteResource, maskResource: GpuSpriteResource, context: PacketReplayContext): void {
        if (!this.frameTexture || !this.scratchFrameTexture) {
            this.failPacketReplay('masked sprite replay requested before frame textures exist');
        }

        this.endDirectReplayPass(context);
        const cached = this.getSpriteTexture(resource);
        const cachedMask = this.getSpriteTexture(maskResource);
        const params = new Int32Array(MASKED_SPRITE_UNIFORM_INTS);
        params[0] = op.rect.x;
        params[1] = op.rect.y;
        params[2] = op.rect.width;
        params[3] = op.rect.height;
        params[4] = op.srcX;
        params[5] = op.srcY;
        params[6] = op.surfaceX;
        params[7] = op.surfaceY;
        params[8] = op.maskStride;
        const uniform = this.allocateFrameUniform(params);

        const bindGroup = this.getMaskedSpriteBindGroup(this.frameTexture, cached.texture, cachedMask.texture);
        const pass = this.beginReplayRenderPass(context, {
            colorAttachments: [
                {
                    view: this.scratchFrameTexture.createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: 'clear',
                    storeOp: 'store'
                }
            ]
        });

        pass.setPipeline(this.maskedSpritePipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(6, 1, 0, uniform.offset / 4);
        pass.end();
        this.packetReplayStats.gpuSpriteFamilyStorageDrawsReplayed++;

        const oldFrameTexture = this.frameTexture;
        this.frameTexture = this.scratchFrameTexture;
        this.scratchFrameTexture = oldFrameTexture;
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

    private getSpriteTexture(resource: GpuSpriteResource): { texture: GpuTexture; bindGroup: object; width: number; height: number; version: number } {
        const cached = this.spriteTextures.get(resource.id);
        if (cached && cached.width === resource.width && cached.height === resource.height) {
            if (cached.version !== resource.version) {
                this.writeSpriteTexture(cached.texture, resource);
                cached.version = resource.version;
            }
            return cached;
        }
        if (cached) {
            cached.texture.destroy();
            this.clearSpriteFamilyReplayBindGroups();
            this.spriteTextures.delete(resource.id);
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
        this.writeSpriteTexture(texture, resource);
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
        const value = { texture, bindGroup, width: resource.width, height: resource.height, version: resource.version };
        this.spriteTextures.set(resource.id, value);
        return value;
    }

    private writeSpriteTexture(texture: GpuTexture, resource: GpuSpriteResource): void {
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
    }

    private getGlyphTexture(resource: GpuGlyphResource): { texture: GpuTexture; width: number; height: number; version: number } {
        const cached = this.glyphTextures.get(resource.id);
        if (cached && cached.width === resource.width && cached.height === resource.height) {
            if (cached.version !== resource.version) {
                this.writeGlyphTexture(cached.texture, resource);
                cached.version = resource.version;
            }
            return cached;
        }
        if (cached) {
            cached.texture.destroy();
            this.glyphReplayBindGroups.clear();
            this.glyphTextures.delete(resource.id);
        }

        const texture = this.device.createTexture({
            size: {
                width: resource.width,
                height: resource.height,
                depthOrArrayLayers: 1
            },
            format: 'rgba8uint',
            usage: getTextureUsage()!.COPY_DST | getTextureUsage()!.TEXTURE_BINDING
        });
        this.writeGlyphTexture(texture, resource);
        const value = { texture, width: resource.width, height: resource.height, version: resource.version };
        this.glyphTextures.set(resource.id, value);
        return value;
    }

    private writeGlyphTexture(texture: GpuTexture, resource: GpuGlyphResource): void {
        this.device.queue.writeTexture(
            { texture },
            resource.maskRgba,
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
    }

    private getIndexedSpriteTexture(resource: GpuIndexedSpriteResource): { intensityTexture: GpuTexture; paletteTexture: GpuTexture; lineOffsetTexture: GpuTexture; width: number; height: number; version: number } {
        const cached = this.indexedSpriteTextures.get(resource.id);
        if (cached && cached.width === resource.width && cached.height === resource.height) {
            if (cached.version !== resource.version) {
                this.writeIndexedSpriteIntensityTexture(cached.intensityTexture, resource);
                this.writeIndexedSpritePaletteTexture(cached.paletteTexture, resource);
                this.writeIndexedSpriteLineOffsetTexture(cached.lineOffsetTexture, resource);
                cached.version = resource.version;
            }
            return cached;
        }
        if (cached) {
            cached.intensityTexture.destroy();
            cached.paletteTexture.destroy();
            cached.lineOffsetTexture.destroy();
            this.indexedSpriteReplayBindGroups.clear();
            this.indexedSpriteTextures.delete(resource.id);
        }

        const intensityTexture = this.device.createTexture({
            size: {
                width: resource.width,
                height: resource.height,
                depthOrArrayLayers: 1
            },
            format: 'rgba8uint',
            usage: getTextureUsage()!.COPY_DST | getTextureUsage()!.TEXTURE_BINDING
        });
        const paletteTexture = this.device.createTexture({
            size: {
                width: 256,
                height: 1,
                depthOrArrayLayers: 1
            },
            format: 'rgba8uint',
            usage: getTextureUsage()!.COPY_DST | getTextureUsage()!.TEXTURE_BINDING
        });
        const lineOffsetTexture = this.device.createTexture({
            size: {
                width: 256,
                height: 1,
                depthOrArrayLayers: 1
            },
            format: 'rgba8uint',
            usage: getTextureUsage()!.COPY_DST | getTextureUsage()!.TEXTURE_BINDING
        });
        this.writeIndexedSpriteIntensityTexture(intensityTexture, resource);
        this.writeIndexedSpritePaletteTexture(paletteTexture, resource);
        this.writeIndexedSpriteLineOffsetTexture(lineOffsetTexture, resource);
        const value = { intensityTexture, paletteTexture, lineOffsetTexture, width: resource.width, height: resource.height, version: resource.version };
        this.indexedSpriteTextures.set(resource.id, value);
        return value;
    }

    private writeIndexedSpriteIntensityTexture(texture: GpuTexture, resource: GpuIndexedSpriteResource): void {
        this.device.queue.writeTexture(
            { texture },
            resource.intensityRgba,
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
    }

    private writeIndexedSpritePaletteTexture(texture: GpuTexture, resource: GpuIndexedSpriteResource): void {
        this.device.queue.writeTexture(
            { texture },
            resource.paletteRgba,
            {
                offset: 0,
                bytesPerRow: 256 * 4,
                rowsPerImage: 1
            },
            {
                width: 256,
                height: 1,
                depthOrArrayLayers: 1
            }
        );
    }

    private writeIndexedSpriteLineOffsetTexture(texture: GpuTexture, resource: GpuIndexedSpriteResource): void {
        this.device.queue.writeTexture(
            { texture },
            resource.lineOffsetRgba,
            {
                offset: 0,
                bytesPerRow: 256 * 4,
                rowsPerImage: 1
            },
            {
                width: 256,
                height: 1,
                depthOrArrayLayers: 1
            }
        );
    }

    private getColourTableTexture(resource: GpuColourTableResource): { texture: GpuTexture; width: number; height: number; version: number } {
        if (this.colourTableTexture && this.colourTableTexture.width === resource.width && this.colourTableTexture.height === resource.height) {
            if (this.colourTableTexture.version !== resource.version) {
                this.writeColourTableTexture(this.colourTableTexture.texture, resource);
                this.colourTableTexture.version = resource.version;
            }
            return this.colourTableTexture;
        }

        this.colourTableTexture?.texture.destroy();
        const texture = this.device.createTexture({
            size: {
                width: resource.width,
                height: resource.height,
                depthOrArrayLayers: 1
            },
            format: 'rgba8unorm',
            usage: getTextureUsage()!.COPY_DST | getTextureUsage()!.TEXTURE_BINDING
        });
        this.writeColourTableTexture(texture, resource);
        this.colourTableTexture = { texture, width: resource.width, height: resource.height, version: resource.version };
        return this.colourTableTexture;
    }

    private writeColourTableTexture(texture: GpuTexture, resource: GpuColourTableResource): void {
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
    }

    private getTexelTexture(resource: GpuTextureResource): { indexTexture: GpuTexture; paletteTexture: GpuTexture; width: number; height: number; version: number } {
        const cached = this.texelTextures.get(resource.id);
        if (cached && cached.width === resource.width && cached.height === resource.height) {
            if (cached.version !== resource.version) {
                this.writeTextureIndexTexture(cached.indexTexture, resource);
                this.writeTexturePaletteTexture(cached.paletteTexture, resource);
                cached.version = resource.version;
            }
            return cached;
        }
        if (cached) {
            cached.indexTexture.destroy();
            cached.paletteTexture.destroy();
            this.textureTriangleReplayBindGroups.clear();
            this.texelTextures.delete(resource.id);
        }

        const indexTexture = this.device.createTexture({
            size: {
                width: resource.width,
                height: resource.height,
                depthOrArrayLayers: 1
            },
            format: 'rgba8uint',
            usage: getTextureUsage()!.COPY_DST | getTextureUsage()!.TEXTURE_BINDING
        });
        const paletteTexture = this.device.createTexture({
            size: {
                width: 256,
                height: 1,
                depthOrArrayLayers: 1
            },
            format: 'rgba8uint',
            usage: getTextureUsage()!.COPY_DST | getTextureUsage()!.TEXTURE_BINDING
        });
        this.writeTextureIndexTexture(indexTexture, resource);
        this.writeTexturePaletteTexture(paletteTexture, resource);
        const value = { indexTexture, paletteTexture, width: resource.width, height: resource.height, version: resource.version };
        this.texelTextures.set(resource.id, value);
        return value;
    }

    private writeTextureIndexTexture(texture: GpuTexture, resource: GpuTextureResource): void {
        this.device.queue.writeTexture(
            { texture },
            resource.indexRgba,
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
    }

    private writeTexturePaletteTexture(texture: GpuTexture, resource: GpuTextureResource): void {
        this.device.queue.writeTexture(
            { texture },
            resource.paletteRgba,
            {
                offset: 0,
                bytesPerRow: 256 * 4,
                rowsPerImage: 1
            },
            {
                width: 256,
                height: 1,
                depthOrArrayLayers: 1
            }
        );
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

    private ensureRectInstanceBuffer(byteLength: number): void {
        if (this.rectInstanceBuffer && this.rectInstanceBufferBytes >= byteLength) {
            return;
        }

        this.rectInstanceBuffer?.destroy();
        this.rectInstanceBufferBytes = alignTo(Math.max(byteLength, 4), 4);
        this.rectInstanceBuffer = this.device.createBuffer({
            size: this.rectInstanceBufferBytes,
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

    private ensureModelFlatUniformBuffer(): void {
        if (this.modelFlatUniformBuffer) {
            return;
        }

        this.modelFlatUniformBuffer = this.device.createBuffer({
            size: MODEL_FLAT_UNIFORM_INTS * 4,
            usage: this.bufferUsage!.COPY_DST | this.bufferUsage!.UNIFORM
        });
    }

    private ensureRectInstanceUniformBuffer(): void {
        if (this.rectInstanceUniformBuffer) {
            return;
        }

        this.rectInstanceUniformBuffer = this.device.createBuffer({
            size: RECT_INSTANCE_UNIFORM_FLOATS * 4,
            usage: this.bufferUsage!.COPY_DST | this.bufferUsage!.UNIFORM
        });
    }

    private ensureGouraudUniformBuffer(): void {
        if (this.gouraudUniformBuffer) {
            return;
        }

        this.gouraudUniformBuffer = this.device.createBuffer({
            size: GOURAUD_UNIFORM_INTS * 4,
            usage: this.bufferUsage!.COPY_DST | this.bufferUsage!.UNIFORM
        });
    }

    private ensureTextureTriangleUniformBuffer(): void {
        if (this.textureTriangleUniformBuffer) {
            return;
        }

        this.textureTriangleUniformBuffer = this.device.createBuffer({
            size: TEXTURE_TRIANGLE_UNIFORM_INTS * 4,
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

    private ensureGlyphUniformBuffer(): void {
        if (this.glyphUniformBuffer) {
            return;
        }

        this.glyphUniformBuffer = this.device.createBuffer({
            size: GLYPH_UNIFORM_INTS * 4,
            usage: this.bufferUsage!.COPY_DST | this.bufferUsage!.UNIFORM
        });
    }

    private ensureIndexedSpriteUniformBuffer(): void {
        if (this.indexedSpriteUniformBuffer) {
            return;
        }

        this.indexedSpriteUniformBuffer = this.device.createBuffer({
            size: INDEXED_SPRITE_UNIFORM_INTS * 4,
            usage: this.bufferUsage!.COPY_DST | this.bufferUsage!.UNIFORM
        });
    }

    private ensureTransformSpriteUniformBuffer(): void {
        if (this.transformSpriteUniformBuffer) {
            return;
        }

        this.transformSpriteUniformBuffer = this.device.createBuffer({
            size: TRANSFORM_SPRITE_UNIFORM_INTS * 4,
            usage: this.bufferUsage!.COPY_DST | this.bufferUsage!.UNIFORM
        });
    }

    private ensureMaskedSpriteUniformBuffer(): void {
        if (this.maskedSpriteUniformBuffer) {
            return;
        }

        this.maskedSpriteUniformBuffer = this.device.createBuffer({
            size: MASKED_SPRITE_UNIFORM_INTS * 4,
            usage: this.bufferUsage!.COPY_DST | this.bufferUsage!.UNIFORM
        });
    }

    private estimateFrameUniformBytes(steps: PacketReplayStep[]): number {
        let slots = 0;
        for (const step of steps) {
            if (step.kind === 'vertices') {
                continue;
            }

            if (step.kind === 'sprite' && this.canReplaySpriteDirectly(step.op)) {
                continue;
            }

            slots++;
        }

        return Math.max(UNIFORM_BUFFER_ALIGNMENT, slots * UNIFORM_BUFFER_ALIGNMENT);
    }

    private prepareFrameUniformArena(steps: PacketReplayStep[]): void {
        const byteLength = this.estimateFrameUniformBytes(steps);
        this.frameUniformOffset = 0;
        if (this.frameUniformBuffer && this.frameUniformBufferBytes >= byteLength) {
            return;
        }

        this.frameUniformBuffer?.destroy();
        this.glyphReplayBindGroups.clear();
        this.clearSpriteFamilyReplayBindGroups();
        this.clearTriangleReplayBindGroups();
        this.frameUniformBufferBytes = alignTo(byteLength, UNIFORM_BUFFER_ALIGNMENT);
        this.frameUniformBuffer = this.device.createBuffer({
            size: this.frameUniformBufferBytes,
            usage: this.bufferUsage!.COPY_DST | this.bufferUsage!.STORAGE | this.bufferUsage!.UNIFORM
        });
    }

    private prepareFrameVertexArenas(steps: PacketReplayStep[]): void {
        let primitiveBytes = 0;
        let rectInstanceBytes = 0;
        let spriteBytes = 0;
        for (const step of steps) {
            if (step.kind === 'vertices') {
                primitiveBytes += alignTo(step.vertices.byteLength, 4);
            } else if (step.kind === 'rectInstances') {
                rectInstanceBytes += alignTo(step.instances.byteLength, 4);
            } else if (step.kind === 'sprite' && this.canReplaySpriteDirectly(step.op)) {
                spriteBytes += alignTo(6 * FLOATS_PER_SPRITE_VERTEX * 4, 4);
            }
        }

        this.primitiveVertexFrameOffset = 0;
        this.rectInstanceFrameOffset = 0;
        this.spriteVertexFrameOffset = 0;
        if (primitiveBytes > 0) {
            this.ensurePrimitiveVertexBuffer(primitiveBytes);
        }
        if (rectInstanceBytes > 0) {
            this.ensureRectInstanceBuffer(rectInstanceBytes);
        }
        if (spriteBytes > 0) {
            this.ensureSpriteVertexBuffer(spriteBytes);
        }
    }

    private allocateFrameUniform(data: Float32Array | Int32Array): FrameUniformBinding {
        if (!this.frameUniformBuffer) {
            this.failPacketReplay('frame uniform arena is unavailable');
        }

        const offset = alignTo(this.frameUniformOffset, UNIFORM_BUFFER_ALIGNMENT);
        const size = data.byteLength;
        if (offset + size > this.frameUniformBufferBytes) {
            this.failPacketReplay('frame uniform arena capacity was underestimated');
        }

        this.device.queue.writeBuffer(this.frameUniformBuffer, offset, data);
        this.packetReplayStats.gpuUniformBufferWrites++;
        this.frameUniformOffset = offset + size;
        this.packetReplayStats.gpuFrameUniformBytesAllocated += alignTo(size, UNIFORM_BUFFER_ALIGNMENT);
        return {
            buffer: this.frameUniformBuffer,
            offset,
            size
        };
    }

    private allocatePrimitiveVertices(data: Float32Array): FrameVertexBinding {
        if (!this.primitiveVertexBuffer) {
            this.failPacketReplay('primitive vertex arena is unavailable');
        }

        const offset = alignTo(this.primitiveVertexFrameOffset, 4);
        if (offset + data.byteLength > this.primitiveVertexBufferBytes) {
            this.failPacketReplay('primitive vertex arena capacity was underestimated');
        }

        this.writeReplayBuffer(this.primitiveVertexBuffer, offset, data);
        this.primitiveVertexFrameOffset = offset + data.byteLength;
        this.packetReplayStats.gpuFrameVertexBytesAllocated += alignTo(data.byteLength, 4);
        return {
            buffer: this.primitiveVertexBuffer,
            offset,
            size: data.byteLength
        };
    }

    private allocateRectInstances(data: Float32Array): FrameVertexBinding {
        if (!this.rectInstanceBuffer) {
            this.failPacketReplay('rect instance arena is unavailable');
        }

        const offset = alignTo(this.rectInstanceFrameOffset, 4);
        if (offset + data.byteLength > this.rectInstanceBufferBytes) {
            this.failPacketReplay('rect instance arena capacity was underestimated');
        }

        this.writeReplayBuffer(this.rectInstanceBuffer, offset, data);
        this.rectInstanceFrameOffset = offset + data.byteLength;
        this.packetReplayStats.gpuFrameVertexBytesAllocated += alignTo(data.byteLength, 4);
        return {
            buffer: this.rectInstanceBuffer,
            offset,
            size: data.byteLength
        };
    }

    private allocateSpriteVertices(data: Float32Array): FrameVertexBinding {
        if (!this.spriteVertexBuffer) {
            this.failPacketReplay('sprite vertex arena is unavailable');
        }

        const offset = alignTo(this.spriteVertexFrameOffset, 4);
        if (offset + data.byteLength > this.spriteVertexBufferBytes) {
            this.failPacketReplay('sprite vertex arena capacity was underestimated');
        }

        this.writeReplayBuffer(this.spriteVertexBuffer, offset, data);
        this.spriteVertexFrameOffset = offset + data.byteLength;
        this.packetReplayStats.gpuFrameVertexBytesAllocated += alignTo(data.byteLength, 4);
        return {
            buffer: this.spriteVertexBuffer,
            offset,
            size: data.byteLength
        };
    }

    private writeReplayBuffer(buffer: GpuBuffer, bufferOffset: number, data: Float32Array | Int32Array): void {
        this.device.queue.writeBuffer(buffer, bufferOffset, data);
        this.packetReplayStats.gpuBufferWrites++;
    }

    private createReplayBindGroup(descriptor: object): object {
        this.packetReplayStats.gpuBindGroupsCreated++;
        return this.device.createBindGroup(descriptor);
    }

    private getRectInstanceBindGroup(): object {
        if (!this.rectInstanceUniformBuffer) {
            this.rectInstanceUniformBuffer = this.device.createBuffer({
                size: RECT_INSTANCE_UNIFORM_FLOATS * 4,
                usage: this.bufferUsage!.COPY_DST | this.bufferUsage!.UNIFORM
            });
        }

        if (this.rectInstanceUniformWidth !== this.width || this.rectInstanceUniformHeight !== this.height) {
            this.writeReplayBuffer(this.rectInstanceUniformBuffer, 0, new Float32Array([this.width, this.height, 0, 0]));
            this.rectInstanceUniformWidth = this.width;
            this.rectInstanceUniformHeight = this.height;
        }

        if (this.rectInstanceBindGroup) {
            this.packetReplayStats.gpuRectBindGroupsReused++;
            return this.rectInstanceBindGroup;
        }

        this.rectInstanceBindGroup = this.createReplayBindGroup({
            layout: this.rectInstancePipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.rectInstanceUniformBuffer
                    }
                }
            ]
        });
        return this.rectInstanceBindGroup;
    }

    private getAlphaBindGroup(context: PacketReplayContext, sourceTexture: GpuTexture): object {
        const cached = context.alphaBindGroups.get(sourceTexture);
        if (cached) {
            this.packetReplayStats.gpuAlphaBindGroupsReused++;
            return cached;
        }

        if (!this.frameUniformBuffer) {
            this.failPacketReplay('alpha parameter storage buffer is unavailable');
        }

        const bindGroup = this.createReplayBindGroup({
            layout: this.alphaPipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: sourceTexture.createView()
                },
                {
                    binding: 1,
                    resource: {
                        buffer: this.frameUniformBuffer
                    }
                }
            ]
        });
        context.alphaBindGroups.set(sourceTexture, bindGroup);
        return bindGroup;
    }

    private getGouraudBindGroup(context: PacketReplayContext, sourceTexture: GpuTexture, colourTableTexture: GpuTexture): object {
        const cached = context.gouraudBindGroups.get(sourceTexture);
        if (cached) {
            this.packetReplayStats.gpuGouraudBindGroupsReused++;
            return cached;
        }

        if (!this.frameUniformBuffer) {
            this.failPacketReplay('gouraud parameter storage buffer is unavailable');
        }

        const bindGroup = this.createReplayBindGroup({
            layout: this.gouraudPipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: sourceTexture.createView()
                },
                {
                    binding: 1,
                    resource: colourTableTexture.createView()
                },
                {
                    binding: 2,
                    resource: {
                        buffer: this.frameUniformBuffer
                    }
                }
            ]
        });
        context.gouraudBindGroups.set(sourceTexture, bindGroup);
        return bindGroup;
    }

    private getGlyphBindGroup(sourceTexture: GpuTexture, glyphTexture: GpuTexture): object {
        let sourceBindGroups = this.glyphReplayBindGroups.get(sourceTexture);
        if (!sourceBindGroups) {
            sourceBindGroups = new Map<GpuTexture, object>();
            this.glyphReplayBindGroups.set(sourceTexture, sourceBindGroups);
        }

        const cached = sourceBindGroups.get(glyphTexture);
        if (cached) {
            this.packetReplayStats.gpuGlyphBindGroupsReused++;
            return cached;
        }

        if (!this.frameUniformBuffer) {
            this.failPacketReplay('glyph parameter storage buffer is unavailable');
        }

        const bindGroup = this.createReplayBindGroup({
            layout: this.glyphPipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: sourceTexture.createView()
                },
                {
                    binding: 1,
                    resource: glyphTexture.createView()
                },
                {
                    binding: 2,
                    resource: {
                        buffer: this.frameUniformBuffer
                    }
                }
            ]
        });
        sourceBindGroups.set(glyphTexture, bindGroup);
        return bindGroup;
    }

    private clearSpriteFamilyReplayBindGroups(): void {
        this.spriteAlphaReplayBindGroups.clear();
        this.indexedSpriteReplayBindGroups.clear();
        this.transformSpriteReplayBindGroups.clear();
        this.maskedSpriteReplayBindGroups.clear();
    }

    private getSpriteAlphaBindGroup(sourceTexture: GpuTexture, spriteTexture: GpuTexture): object {
        let sourceBindGroups = this.spriteAlphaReplayBindGroups.get(sourceTexture);
        if (!sourceBindGroups) {
            sourceBindGroups = new Map<GpuTexture, object>();
            this.spriteAlphaReplayBindGroups.set(sourceTexture, sourceBindGroups);
        }

        const cached = sourceBindGroups.get(spriteTexture);
        if (cached) {
            this.packetReplayStats.gpuSpriteFamilyBindGroupsReused++;
            return cached;
        }

        if (!this.frameUniformBuffer) {
            this.failPacketReplay('sprite alpha parameter storage buffer is unavailable');
        }

        const bindGroup = this.createReplayBindGroup({
            layout: this.spriteAlphaPipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: sourceTexture.createView()
                },
                {
                    binding: 1,
                    resource: spriteTexture.createView()
                },
                {
                    binding: 2,
                    resource: {
                        buffer: this.frameUniformBuffer
                    }
                }
            ]
        });
        sourceBindGroups.set(spriteTexture, bindGroup);
        return bindGroup;
    }

    private getIndexedSpriteBindGroup(sourceTexture: GpuTexture, intensityTexture: GpuTexture, paletteTexture: GpuTexture, lineOffsetTexture: GpuTexture): object {
        let sourceBindGroups = this.indexedSpriteReplayBindGroups.get(sourceTexture);
        if (!sourceBindGroups) {
            sourceBindGroups = new Map<GpuTexture, object>();
            this.indexedSpriteReplayBindGroups.set(sourceTexture, sourceBindGroups);
        }

        const cached = sourceBindGroups.get(intensityTexture);
        if (cached) {
            this.packetReplayStats.gpuSpriteFamilyBindGroupsReused++;
            return cached;
        }

        if (!this.frameUniformBuffer) {
            this.failPacketReplay('indexed sprite parameter storage buffer is unavailable');
        }

        const bindGroup = this.createReplayBindGroup({
            layout: this.indexedSpritePipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: sourceTexture.createView()
                },
                {
                    binding: 1,
                    resource: intensityTexture.createView()
                },
                {
                    binding: 2,
                    resource: paletteTexture.createView()
                },
                {
                    binding: 3,
                    resource: lineOffsetTexture.createView()
                },
                {
                    binding: 4,
                    resource: {
                        buffer: this.frameUniformBuffer
                    }
                }
            ]
        });
        sourceBindGroups.set(intensityTexture, bindGroup);
        return bindGroup;
    }

    private getTransformSpriteBindGroup(sourceTexture: GpuTexture, spriteTexture: GpuTexture): object {
        let sourceBindGroups = this.transformSpriteReplayBindGroups.get(sourceTexture);
        if (!sourceBindGroups) {
            sourceBindGroups = new Map<GpuTexture, object>();
            this.transformSpriteReplayBindGroups.set(sourceTexture, sourceBindGroups);
        }

        const cached = sourceBindGroups.get(spriteTexture);
        if (cached) {
            this.packetReplayStats.gpuSpriteFamilyBindGroupsReused++;
            return cached;
        }

        if (!this.frameUniformBuffer) {
            this.failPacketReplay('transform sprite parameter storage buffer is unavailable');
        }

        const bindGroup = this.createReplayBindGroup({
            layout: this.transformSpritePipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: sourceTexture.createView()
                },
                {
                    binding: 1,
                    resource: spriteTexture.createView()
                },
                {
                    binding: 2,
                    resource: {
                        buffer: this.frameUniformBuffer
                    }
                }
            ]
        });
        sourceBindGroups.set(spriteTexture, bindGroup);
        return bindGroup;
    }

    private getMaskedSpriteBindGroup(sourceTexture: GpuTexture, spriteTexture: GpuTexture, maskTexture: GpuTexture): object {
        let sourceBindGroups = this.maskedSpriteReplayBindGroups.get(sourceTexture);
        if (!sourceBindGroups) {
            sourceBindGroups = new Map<GpuTexture, Map<GpuTexture, object>>();
            this.maskedSpriteReplayBindGroups.set(sourceTexture, sourceBindGroups);
        }

        let spriteBindGroups = sourceBindGroups.get(spriteTexture);
        if (!spriteBindGroups) {
            spriteBindGroups = new Map<GpuTexture, object>();
            sourceBindGroups.set(spriteTexture, spriteBindGroups);
        }

        const cached = spriteBindGroups.get(maskTexture);
        if (cached) {
            this.packetReplayStats.gpuSpriteFamilyBindGroupsReused++;
            return cached;
        }

        if (!this.frameUniformBuffer) {
            this.failPacketReplay('masked sprite parameter storage buffer is unavailable');
        }

        const bindGroup = this.createReplayBindGroup({
            layout: this.maskedSpritePipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: sourceTexture.createView()
                },
                {
                    binding: 1,
                    resource: spriteTexture.createView()
                },
                {
                    binding: 2,
                    resource: maskTexture.createView()
                },
                {
                    binding: 3,
                    resource: {
                        buffer: this.frameUniformBuffer
                    }
                }
            ]
        });
        spriteBindGroups.set(maskTexture, bindGroup);
        return bindGroup;
    }

    private clearTriangleReplayBindGroups(): void {
        this.modelFlatReplayBindGroups.clear();
        this.textureTriangleReplayBindGroups.clear();
    }

    private getModelFlatBindGroup(sourceTexture: GpuTexture): object {
        const cached = this.modelFlatReplayBindGroups.get(sourceTexture);
        if (cached) {
            this.packetReplayStats.gpuTriangleBindGroupsReused++;
            return cached;
        }

        if (!this.frameUniformBuffer) {
            this.failPacketReplay('model flat parameter storage buffer is unavailable');
        }

        const bindGroup = this.createReplayBindGroup({
            layout: this.modelFlatPipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: sourceTexture.createView()
                },
                {
                    binding: 1,
                    resource: {
                        buffer: this.frameUniformBuffer
                    }
                }
            ]
        });
        this.modelFlatReplayBindGroups.set(sourceTexture, bindGroup);
        return bindGroup;
    }

    private getTextureTriangleBindGroup(sourceTexture: GpuTexture, indexTexture: GpuTexture, paletteTexture: GpuTexture): object {
        let sourceBindGroups = this.textureTriangleReplayBindGroups.get(sourceTexture);
        if (!sourceBindGroups) {
            sourceBindGroups = new Map<GpuTexture, object>();
            this.textureTriangleReplayBindGroups.set(sourceTexture, sourceBindGroups);
        }

        const cached = sourceBindGroups.get(indexTexture);
        if (cached) {
            this.packetReplayStats.gpuTriangleBindGroupsReused++;
            return cached;
        }

        if (!this.frameUniformBuffer) {
            this.failPacketReplay('texture triangle parameter storage buffer is unavailable');
        }

        const bindGroup = this.createReplayBindGroup({
            layout: this.textureTrianglePipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: sourceTexture.createView()
                },
                {
                    binding: 1,
                    resource: indexTexture.createView()
                },
                {
                    binding: 2,
                    resource: paletteTexture.createView()
                },
                {
                    binding: 3,
                    resource: {
                        buffer: this.frameUniformBuffer
                    }
                }
            ]
        });
        sourceBindGroups.set(indexTexture, bindGroup);
        return bindGroup;
    }

    private beginReplayRenderPass(context: PacketReplayContext, descriptor: object): GpuRenderPass {
        this.packetReplayStats.gpuRenderPassesEncoded++;
        return context.encoder.beginRenderPass(descriptor);
    }

    private beginDirectReplayPass(context: PacketReplayContext): GpuRenderPass {
        if (context.directPass) {
            return context.directPass;
        }

        context.directPass = this.beginReplayRenderPass(context, {
            colorAttachments: [
                {
                    view: this.frameTexture!.createView(),
                    loadOp: 'load',
                    storeOp: 'store'
                }
            ]
        });
        this.packetReplayStats.gpuDirectRenderPassesReplayed++;
        return context.directPass;
    }

    private endDirectReplayPass(context: PacketReplayContext): void {
        if (!context.directPass) {
            return;
        }

        context.directPass.end();
        context.directPass = null;
    }

    private copyReplayTextureToTexture(context: PacketReplayContext, source: object, destination: object, size: object): void {
        context.encoder.copyTextureToTexture(source, destination, size);
        this.packetReplayStats.gpuTextureCopies++;
    }

    private submitReplayCommands(context: PacketReplayContext): void {
        this.device.queue.submit([context.encoder.finish()]);
        this.packetReplayStats.gpuFrameCommandSubmits++;
    }

    private canReplaySpriteDirectly(op: SpriteReplayOp): boolean {
        return op.alpha === null && op.srcX === Math.trunc(op.srcX) && op.srcY === Math.trunc(op.srcY) && op.srcWidth === op.rect.width && op.srcHeight === op.rect.height;
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
        this.modelDepthTexture?.destroy();
        this.primitiveVertexBuffer?.destroy();
        this.rectInstanceBuffer?.destroy();
        this.frameUniformBuffer?.destroy();
        this.modelFlatUniformBuffer?.destroy();
        this.spriteVertexBuffer?.destroy();
        this.alphaUniformBuffer?.destroy();
        this.gouraudUniformBuffer?.destroy();
        this.textureTriangleUniformBuffer?.destroy();
        this.rectInstanceUniformBuffer?.destroy();
        this.spriteAlphaUniformBuffer?.destroy();
        this.glyphUniformBuffer?.destroy();
        this.indexedSpriteUniformBuffer?.destroy();
        this.transformSpriteUniformBuffer?.destroy();
        this.maskedSpriteUniformBuffer?.destroy();
        this.colourTableTexture?.texture.destroy();
        for (const cached of this.spriteTextures.values()) {
            cached.texture.destroy();
        }
        for (const cached of this.glyphTextures.values()) {
            cached.texture.destroy();
        }
        for (const cached of this.texelTextures.values()) {
            cached.indexTexture.destroy();
            cached.paletteTexture.destroy();
        }
        for (const cached of this.indexedSpriteTextures.values()) {
            cached.intensityTexture.destroy();
            cached.paletteTexture.destroy();
            cached.lineOffsetTexture.destroy();
        }
        this.spriteTextures.clear();
        this.glyphTextures.clear();
        this.glyphReplayBindGroups.clear();
        this.clearSpriteFamilyReplayBindGroups();
        this.clearTriangleReplayBindGroups();
        this.texelTextures.clear();
        this.indexedSpriteTextures.clear();
        this.frameTexture = null;
        this.scratchFrameTexture = null;
        this.modelDepthTexture = null;
        this.bindGroup = null;
        this.primitiveVertexBuffer = null;
        this.primitiveVertexBufferBytes = 0;
        this.primitiveVertexFrameOffset = 0;
        this.rectInstanceBuffer = null;
        this.rectInstanceBufferBytes = 0;
        this.rectInstanceFrameOffset = 0;
        this.frameUniformBuffer = null;
        this.frameUniformBufferBytes = 0;
        this.frameUniformOffset = 0;
        this.modelFlatUniformBuffer = null;
        this.spriteVertexBuffer = null;
        this.spriteVertexBufferBytes = 0;
        this.spriteVertexFrameOffset = 0;
        this.alphaUniformBuffer = null;
        this.gouraudUniformBuffer = null;
        this.textureTriangleUniformBuffer = null;
        this.rectInstanceUniformBuffer = null;
        this.rectInstanceBindGroup = null;
        this.rectInstanceUniformWidth = 0;
        this.rectInstanceUniformHeight = 0;
        this.spriteAlphaUniformBuffer = null;
        this.glyphUniformBuffer = null;
        this.indexedSpriteUniformBuffer = null;
        this.transformSpriteUniformBuffer = null;
        this.maskedSpriteUniformBuffer = null;
        this.colourTableTexture = null;
        this.overlayCanvas.remove();
    }
}
