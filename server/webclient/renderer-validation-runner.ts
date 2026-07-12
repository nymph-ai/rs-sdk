const DEFAULT_PORT = 8890;
const DEFAULT_CDP_PORT = 9223;

type ValidationResult = {
    name: string;
    passed: boolean;
    stats: {
        lastDiffPixels: number;
        lastMaxChannelDelta: number;
        lastError: string;
        mismatches: number;
        adapterInfo: {
            vendor: string;
            architecture: string;
            device: string;
            description: string;
        } | null;
        hardwareAdapter: boolean;
    } | null;
    packetReplayStats: {
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
    } | null;
};

type ValidationState = {
    done: boolean;
    passed: boolean;
    results: ValidationResult[];
    error?: string;
    artifacts?: {
        packetReplay?: {
            width: number;
            height: number;
            dynamicSeed: number;
            cpuImageData: number[];
            snapshot: unknown;
        };
    };
};

type BrowserPresentation = {
    env: Record<string, string>;
    args: string[];
};

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function stopProcess(proc: ReturnType<typeof Bun.spawn> | null | undefined): Promise<void> {
    if (!proc) {
        return;
    }

    proc.kill();
    await Promise.race([
        proc.exited.catch(() => undefined),
        sleep(1_000)
    ]);
}

function parsePort(name: string, fallback: number): number {
    const value = process.env[name];
    if (!value) {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function commandExists(command: string): Promise<boolean> {
    const proc = Bun.spawn(['sh', '-lc', `command -v ${command}`], {
        stdout: 'ignore',
        stderr: 'ignore'
    });
    return await proc.exited === 0;
}

function getBrowserPresentation(): BrowserPresentation {
    if (process.env.RENDERER_VALIDATION_DISPLAY) {
        return {
            env: { DISPLAY: process.env.RENDERER_VALIDATION_DISPLAY },
            args: ['--ozone-platform=x11']
        };
    }

    if (process.platform === 'linux') {
        return {
            env: {},
            args: ['--headless=new', '--ozone-platform=headless', '--disable-vulkan-surface']
        };
    }

    return { env: {}, args: ['--headless=new'] };
}

async function findChrome(): Promise<string | null> {
    if (process.env.CHROME_BIN) {
        return process.env.CHROME_BIN;
    }

    const candidates = [
        '/home/nymphai/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome',
        'google-chrome',
        'chromium',
        'chromium-browser'
    ];

    for (const candidate of candidates) {
        if (candidate.startsWith('/')) {
            if (await Bun.file(candidate).exists()) {
                return candidate;
            }
        } else if (await commandExists(candidate)) {
            return candidate;
        }
    }

    return null;
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError = '';
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                return;
            }
            lastError = `HTTP ${response.status}`;
        } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
        }

        await sleep(250);
    }

    throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

async function getValidationTarget(cdpPort: number, pageUrl: string): Promise<string> {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        try {
            const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(response => response.json()) as Array<{ type: string; url: string; webSocketDebuggerUrl: string }>;
            const page = targets.find(target => target.type === 'page' && target.url.startsWith(pageUrl));
            if (page) {
                return page.webSocketDebuggerUrl;
            }
        } catch (_err) {
            // Chrome may not have opened the CDP HTTP endpoint yet.
        }

        await sleep(250);
    }

    throw new Error(`Timed out waiting for Chrome page target at ${pageUrl}`);
}

async function pollValidation(webSocketDebuggerUrl: string): Promise<ValidationState> {
    const ws = new WebSocket(webSocketDebuggerUrl);
    let nextId = 1;
    const pending = new Map<number, { resolve: (value: unknown) => void; reject: (err: Error) => void }>();

    ws.onmessage = event => {
        const message = JSON.parse(String(event.data)) as { id?: number; error?: unknown };
        if (message.id && pending.has(message.id)) {
            const callbacks = pending.get(message.id)!;
            pending.delete(message.id);
            if (message.error) {
                callbacks.reject(new Error(JSON.stringify(message.error)));
            } else {
                callbacks.resolve(message);
            }
        }
    };

    await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error('CDP WebSocket failed to open'));
    });

    function send(method: string, params: Record<string, unknown> = {}): Promise<any> {
        const id = nextId++;
        ws.send(JSON.stringify({ id, method, params }));
        return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    }

    await send('Runtime.enable');

    const deadline = Date.now() + 45_000;
    let lastValue: ValidationState | null = null;
    while (Date.now() < deadline) {
        const response = await send('Runtime.evaluate', {
            expression: 'window.__rsSdkRendererValidation',
            returnByValue: true,
            awaitPromise: false
        });
        const value = response.result.result.value as ValidationState | undefined;
        if (value) {
            lastValue = value;
            if (value.done) {
                ws.close();
                return value;
            }
        }

        await sleep(250);
    }

    ws.close();
    throw new Error(`Timed out waiting for renderer validation: ${JSON.stringify(lastValue)}`);
}

function validateResult(state: ValidationState): void {
    if (!state.passed) {
        throw new Error(`Renderer validation failed: ${JSON.stringify(state, null, 2)}`);
    }

    for (const result of state.results) {
        if (!result.stats?.hardwareAdapter) {
            throw new Error(`Renderer validation did not prove a hardware WebGPU adapter for ${result.name}: ${JSON.stringify(result.stats?.adapterInfo ?? null)}`);
        }
    }

    const packetResult = state.results.find(result => result.name === 'packet-replay-2d-primitives');
    if (!packetResult?.packetReplayStats) {
        throw new Error('Renderer validation did not report packet replay stats');
    }

    const stats = packetResult.packetReplayStats;
    if (!stats.enabled || stats.framesFailed !== 0 || stats.cpuImageDataUploads !== 0 || stats.cpuRasterWriteBypasses <= 0 || stats.framesReplayed < 1 || stats.gpuRectInstancesReplayed <= 0 || stats.gpuRectBindGroupsReused <= 0 || stats.gpuDynamicIndexedSpritesReplayed <= 0 || stats.gpuGlyphSpritesReplayed <= 0 || stats.gpuModelFlatTrianglesReplayed <= 0 || stats.gpuRetainedDepthPassesReplayed <= 0 || stats.gpuFrameCommandSubmits !== stats.framesReplayed || stats.gpuRenderPassesEncoded <= stats.gpuFrameCommandSubmits || stats.gpuBindGroupsCreated <= 0 || stats.gpuBindGroupsCreated >= stats.gpuUniformBufferWrites || stats.gpuBufferWrites <= 0 || stats.gpuUniformBufferWrites <= 0 || stats.gpuTextureCopies <= 0 || stats.gpuFrameUniformBytesAllocated <= 0 || stats.gpuFrameVertexBytesAllocated <= 0 || stats.gpuDirectDrawsReplayed <= stats.gpuDirectRenderPassesReplayed || stats.gpuAlphaStorageDrawsReplayed <= 0 || stats.gpuAlphaBindGroupsReused <= 0 || stats.gpuGouraudStorageDrawsReplayed <= 0 || stats.gpuGouraudBindGroupsReused <= 0 || stats.gpuGlyphStorageDrawsReplayed <= 0 || stats.gpuGlyphBindGroupsReused <= 0 || stats.gpuSpriteFamilyStorageDrawsReplayed <= 0 || stats.gpuSpriteFamilyBindGroupsReused <= 0 || stats.gpuTriangleStorageDrawsReplayed <= 0 || stats.gpuTriangleBindGroupsReused <= 0 || stats.lastError !== '') {
        throw new Error(`Packet replay validation did not prove GPU-only presentation: ${JSON.stringify(stats, null, 2)}`);
    }
}

async function writeArtifacts(state: ValidationState): Promise<void> {
    const artifactDir = process.env.RENDERER_VALIDATION_ARTIFACT_DIR;
    if (!artifactDir) {
        return;
    }

    const packetReplay = state.artifacts?.packetReplay;
    if (!packetReplay) {
        throw new Error('Renderer validation did not expose packet replay artifacts');
    }

    const mkdir = Bun.spawn(['mkdir', '-p', artifactDir]);
    if (await mkdir.exited !== 0) {
        throw new Error(`Failed to create artifact dir ${artifactDir}`);
    }

    await Bun.write(`${artifactDir}/packet-replay-snapshot.json`, JSON.stringify(packetReplay.snapshot));
    await Bun.write(`${artifactDir}/packet-replay-meta.json`, JSON.stringify({
        width: packetReplay.width,
        height: packetReplay.height,
        dynamicSeed: packetReplay.dynamicSeed
    }, null, 2));

    const rgba = packetReplay.cpuImageData;
    const rgb = new Uint8Array(packetReplay.width * packetReplay.height * 3);
    for (let src = 0, dst = 0; src < rgba.length; src += 4, dst += 3) {
        rgb[dst] = rgba[src] & 0xff;
        rgb[dst + 1] = rgba[src + 1] & 0xff;
        rgb[dst + 2] = rgba[src + 2] & 0xff;
    }

    const header = new TextEncoder().encode(`P6\n${packetReplay.width} ${packetReplay.height}\n255\n`);
    const ppm = new Uint8Array(header.length + rgb.length);
    ppm.set(header);
    ppm.set(rgb, header.length);
    await Bun.write(`${artifactDir}/packet-replay-cpu.ppm`, ppm);
    console.log(`Renderer validation artifacts wrote ${artifactDir}`);
}

async function main(): Promise<void> {
    const port = parsePort('RENDERER_VALIDATION_PORT', DEFAULT_PORT);
    const cdpPort = parsePort('RENDERER_VALIDATION_CDP_PORT', DEFAULT_CDP_PORT);
    const chrome = await findChrome();
    if (!chrome) {
        throw new Error('Chrome/Chromium not found. Set CHROME_BIN to a WebGPU-capable Chromium executable.');
    }

    const server = Bun.spawn([process.execPath, 'run', 'serve:renderer-validation'], {
        stdout: 'inherit',
        stderr: 'inherit',
        env: {
            ...process.env,
            PORT: String(port)
        }
    });

    let chromeProc: ReturnType<typeof Bun.spawn> | null = null;
    try {
        const userDataDir = `/tmp/rs-sdk-renderer-validation-${process.pid}`;
        const presentation = getBrowserPresentation();
        const chromeArgs = [
            chrome,
            ...presentation.args,
            '--no-sandbox',
            '--disable-gpu-sandbox',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-search-engine-choice-screen',
            '--disable-extensions',
            '--disable-background-networking',
            '--enable-unsafe-webgpu',
            '--ignore-gpu-blocklist',
            '--enable-features=UnsafeWebGPU,WebGPU,Vulkan,VulkanFromANGLE,DefaultANGLEVulkan',
            '--use-angle=vulkan',
            '--use-vulkan=native',
            '--disable-software-rasterizer',
            '--disable-dev-shm-usage',
            '--remote-debugging-address=127.0.0.1',
            `--remote-debugging-port=${cdpPort}`,
            `--user-data-dir=${userDataDir}`,
            `http://localhost:${port}/`
        ];

        const chromeEnv = { ...process.env, ...presentation.env };
        if (process.env.RENDERER_VALIDATION_CHROME_LD_LIBRARY_PATH) {
            // `nix develop` supplies the native renderer toolchain, but a
            // downloaded Chrome-for-Testing must use the host graphics stack
            // that owns the selected Vulkan ICD. Keep that override scoped to
            // Chrome instead of replacing the validation runner's libraries.
            chromeEnv.LD_LIBRARY_PATH = process.env.RENDERER_VALIDATION_CHROME_LD_LIBRARY_PATH;
        }
        if (process.env.RENDERER_VALIDATION_VK_DRIVER_FILES && !chromeEnv.VK_DRIVER_FILES) {
            chromeEnv.VK_DRIVER_FILES = process.env.RENDERER_VALIDATION_VK_DRIVER_FILES;
        }

        await waitForHttp(`http://localhost:${port}/`, 30_000);
        chromeProc = Bun.spawn(chromeArgs, {
            stdout: 'inherit',
            stderr: 'inherit',
            env: chromeEnv
        });

        const pageUrl = `http://localhost:${port}/`;
        const target = await getValidationTarget(cdpPort, pageUrl);
        const state = await pollValidation(target);
        validateResult(state);
        await writeArtifacts(state);
        const packetStats = state.results.find(result => result.name === 'packet-replay-2d-primitives')!.packetReplayStats!;
        const adapterInfo = state.results.find(result => result.name === 'packet-replay-2d-primitives')!.stats!.adapterInfo!;
        const adapterLabel = [adapterInfo.vendor, adapterInfo.architecture, adapterInfo.device, adapterInfo.description].filter(Boolean).join('/');
        console.log(`Renderer validation passed: adapter=${adapterLabel}, packetsReplayed=${packetStats.packetsReplayed}, cpuImageDataUploads=${packetStats.cpuImageDataUploads}, cpuRasterWriteBypasses=${packetStats.cpuRasterWriteBypasses}, rectInstances=${packetStats.gpuRectInstancesReplayed}, rectBindGroupReuses=${packetStats.gpuRectBindGroupsReused}, dynamicIndexed=${packetStats.gpuDynamicIndexedSpritesReplayed}, glyphs=${packetStats.gpuGlyphSpritesReplayed}, modelFlat=${packetStats.gpuModelFlatTrianglesReplayed}, retainedDepth=${packetStats.gpuRetainedDepthPassesReplayed}, frameSubmits=${packetStats.gpuFrameCommandSubmits}, renderPasses=${packetStats.gpuRenderPassesEncoded}, bindGroups=${packetStats.gpuBindGroupsCreated}, bufferWrites=${packetStats.gpuBufferWrites}, uniformWrites=${packetStats.gpuUniformBufferWrites}, textureCopies=${packetStats.gpuTextureCopies}, frameUniformBytes=${packetStats.gpuFrameUniformBytesAllocated}, frameVertexBytes=${packetStats.gpuFrameVertexBytesAllocated}, directDraws=${packetStats.gpuDirectDrawsReplayed}, directPasses=${packetStats.gpuDirectRenderPassesReplayed}, alphaStorageDraws=${packetStats.gpuAlphaStorageDrawsReplayed}, alphaBindGroupReuses=${packetStats.gpuAlphaBindGroupsReused}, gouraudStorageDraws=${packetStats.gpuGouraudStorageDrawsReplayed}, gouraudBindGroupReuses=${packetStats.gpuGouraudBindGroupsReused}, glyphStorageDraws=${packetStats.gpuGlyphStorageDrawsReplayed}, glyphBindGroupReuses=${packetStats.gpuGlyphBindGroupsReused}, spriteFamilyStorageDraws=${packetStats.gpuSpriteFamilyStorageDrawsReplayed}, spriteFamilyBindGroupReuses=${packetStats.gpuSpriteFamilyBindGroupsReused}, triangleStorageDraws=${packetStats.gpuTriangleStorageDrawsReplayed}, triangleBindGroupReuses=${packetStats.gpuTriangleBindGroupsReused}, nativeFlat=${packetStats.nativeFlatTrianglesReplayed}, nativeGouraud=${packetStats.nativeGouraudTrianglesReplayed}, nativeTexture=${packetStats.nativeTextureTrianglesReplayed}, framesFailed=${packetStats.framesFailed}`);
    } finally {
        await stopProcess(chromeProc);
        await stopProcess(server);
    }
}

main().catch(err => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
});
