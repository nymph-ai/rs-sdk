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
};

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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

    const packetResult = state.results.find(result => result.name === 'packet-replay-2d-primitives');
    if (!packetResult?.packetReplayStats) {
        throw new Error('Renderer validation did not report packet replay stats');
    }

    const stats = packetResult.packetReplayStats;
    if (!stats.enabled || stats.framesFailed !== 0 || stats.cpuImageDataUploads !== 0 || stats.cpuRasterWriteBypasses <= 0 || stats.framesReplayed < 1 || stats.gpuRectInstancesReplayed <= 0 || stats.lastError !== '') {
        throw new Error(`Packet replay validation did not prove GPU-only presentation: ${JSON.stringify(stats, null, 2)}`);
    }
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

    const userDataDir = `/tmp/rs-sdk-renderer-validation-${process.pid}`;
    const chromeArgs = [
        chrome,
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu-sandbox',
        '--enable-unsafe-webgpu',
        '--ignore-gpu-blocklist',
        '--enable-features=UnsafeWebGPU,WebGPU,Vulkan',
        '--use-angle=vulkan',
        '--disable-dev-shm-usage',
        '--remote-debugging-address=127.0.0.1',
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${userDataDir}`,
        `http://localhost:${port}/`
    ];

    const chromeEnv = { ...process.env };
    if (process.env.RENDERER_VALIDATION_VK_DRIVER_FILES && !chromeEnv.VK_DRIVER_FILES) {
        chromeEnv.VK_DRIVER_FILES = process.env.RENDERER_VALIDATION_VK_DRIVER_FILES;
    }

    let chromeProc: ReturnType<typeof Bun.spawn> | null = null;
    try {
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
        const packetStats = state.results.find(result => result.name === 'packet-replay-2d-primitives')!.packetReplayStats!;
        console.log(`Renderer validation passed: packetsReplayed=${packetStats.packetsReplayed}, cpuImageDataUploads=${packetStats.cpuImageDataUploads}, cpuRasterWriteBypasses=${packetStats.cpuRasterWriteBypasses}, rectInstances=${packetStats.gpuRectInstancesReplayed}, nativeFlat=${packetStats.nativeFlatTrianglesReplayed}, nativeGouraud=${packetStats.nativeGouraudTrianglesReplayed}, nativeTexture=${packetStats.nativeTextureTrianglesReplayed}, framesFailed=${packetStats.framesFailed}`);
    } finally {
        chromeProc?.kill();
        server.kill();
        await sleep(250);
    }
}

main().catch(err => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
});
