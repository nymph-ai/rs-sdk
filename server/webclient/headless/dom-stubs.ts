// Minimal DOM/browser stubs to let the rs-sdk web client load + run the
// game-logic path under bun with NO real DOM and NO renderer.
//
// Goal: get modules to import, the GameShell loop to tick, ClientStream to
// connect over bun's native WebSocket, and Pix2D/Pix3D to emit packets into
// gpuRenderPackets. We deliberately do NOT provide a real 2D raster context or
// WebGPU presenter — packet capture is decoupled from presentation.
//
// Install MUST run before importing any client module (Canvas.ts touches
// document.getElementById('canvas') at module-eval time).

const SERVER_HOST = process.env.RS_HOST ?? 'localhost:8899';

// A no-op 2D context. Returns sane defaults so progress-bar / title draws that
// hit canvas2d don't crash. We don't read pixels back from it.
function makeNullCtx(width: number, height: number): any {
    const ctx: any = {
        canvas: null as any,
        fillStyle: 'black',
        strokeStyle: 'black',
        font: '',
        textAlign: 'left',
        globalAlpha: 1,
        imageSmoothingEnabled: false,
        fillRect() {},
        strokeRect() {},
        clearRect() {},
        fillText() {},
        strokeText() {},
        beginPath() {},
        closePath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        fill() {},
        save() {},
        restore() {},
        translate() {},
        scale() {},
        rotate() {},
        setTransform() {},
        drawImage() {},
        putImageData() {},
        getImageData(_x: number, _y: number, w: number, h: number) {
            return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
        },
        createImageData(w: number, h: number) {
            return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
        },
        measureText(t: string) {
            return { width: (t?.length ?? 0) * 6 };
        }
    };
    return ctx;
}

class FakeCanvas {
    width = 765;
    height = 503;
    style: Record<string, any> = {};
    tabIndex = -1;
    // event handler slots GameShell assigns to
    onfocus: any = null;
    onblur: any = null;
    onkeydown: any = null;
    onkeyup: any = null;
    onmousedown: any = null;
    onpointerdown: any = null;
    onmouseup: any = null;
    onpointerup: any = null;
    onpointerenter: any = null;
    onpointerleave: any = null;
    onpointermove: any = null;
    oncontextmenu: any = null;
    private _ctx: any;

    getContext(_type: string): any {
        if (!this._ctx) {
            this._ctx = makeNullCtx(this.width, this.height);
            this._ctx.canvas = this;
        }
        return this._ctx;
    }
    addEventListener() {}
    removeEventListener() {}
    getBoundingClientRect() {
        return { left: 0, top: 0, width: this.width, height: this.height, right: this.width, bottom: this.height };
    }
    toDataURL() {
        return 'data:image/png;base64,';
    }
    requestFullscreen() {}
    setAttribute() {}
    appendChild() {}
    focus() {}
}

class FakeImage {
    onload: any = null;
    onerror: any = null;
    naturalWidth = 765;
    naturalHeight = 503;
    width = 765;
    height = 503;
    private _src = '';
    set src(v: string) {
        this._src = v ?? '';
        if (this._src) queueMicrotask(() => { if (this.onload) this.onload(); });
    }
    get src() { return this._src; }
}

class FakeElement {
    style: Record<string, any> = {};
    classList = { add() {}, remove() {}, contains() { return false; }, toggle() {} };
    textContent = '';
    value = '';
    href = '';
    download = '';
    children: any[] = [];
    addEventListener() {}
    removeEventListener() {}
    appendChild(c: any) { this.children.push(c); }
    removeChild() {}
    setAttribute() {}
    getAttribute() { return null; }
    click() {}
    focus() {}
    getContext() { return makeNullCtx(1, 1); }
}

export function installDomStubs(): { canvas: FakeCanvas } {
    const g = globalThis as any;
    const theCanvas = new FakeCanvas();

    // The client (and tinymidipcm) call fetch() with root-relative URLs like
    // '/crc' or '/client/foo.sf2'. Browsers resolve those against location;
    // bun's fetch requires absolute URLs. Wrap global fetch to resolve relative
    // URLs against the game server origin.
    const realFetch = g.fetch.bind(g);
    const origin = `http://${SERVER_HOST}`;
    g.fetch = (input: any, init?: any) => {
        if (typeof input === 'string' && input.startsWith('/')) {
            input = origin + input;
        } else if (input instanceof URL) {
            // leave as-is
        } else if (typeof input === 'string' && !/^[a-z]+:\/\//i.test(input)) {
            input = origin + '/' + input;
        }
        return realFetch(input, init);
    };

    const elements: Record<string, any> = {
        canvas: theCanvas
    };

    const documentStub: any = {
        getElementById(id: string) {
            if (id === 'canvas') return theCanvas;
            if (!elements[id]) elements[id] = new FakeElement();
            return elements[id];
        },
        createElement(tag: string) {
            if (tag === 'canvas') return new FakeCanvas();
            if (tag === 'img') return new FakeImage();
            return new FakeElement();
        },
        querySelector() { return new FakeElement(); },
        querySelectorAll() { return []; },
        addEventListener() {},
        removeEventListener() {},
        getElementsByTagName() { return []; },
        cookie: '',
        fullscreenElement: null,
        webkitFullscreenElement: null,
        body: new FakeElement(),
        head: new FakeElement(),
        documentElement: new FakeElement(),
        title: ''
    };

    // URL the client reads for host + flags. rendererPackets=1 turns on
    // gpuRenderPackets capture. renderer=canvas avoids WebGpuFramePresenter
    // (we have no GPU/presenter), but packet capture stays enabled because
    // GpuRenderPackets reads its own flag independently.
    const search = '?bot=headlessbot&password=test&tst=1&rendererPackets=1&renderer=canvas';
    const locationStub: any = {
        host: SERVER_HOST,
        hostname: SERVER_HOST.split(':')[0],
        protocol: 'http:',
        href: `http://${SERVER_HOST}/bot${search}`,
        search,
        pathname: '/bot',
        origin: `http://${SERVER_HOST}`,
        reload() {}
    };

    const localStore = new Map<string, string>();
    const localStorageStub: any = {
        getItem(k: string) { return localStore.has(k) ? localStore.get(k)! : null; },
        setItem(k: string, v: string) { localStore.set(k, String(v)); },
        removeItem(k: string) { localStore.delete(k); },
        clear() { localStore.clear(); }
    };

    const navigatorStub: any = {
        userAgent: 'bun-headless',
        maxTouchPoints: 0,
        platform: 'linux',
        hardwareConcurrency: 4,
        // no webgpu on purpose
    };

    const windowStub: any = g.window ?? {};
    windowStub.location = locationStub;
    windowStub.document = documentStub;
    windowStub.navigator = navigatorStub;
    windowStub.localStorage = localStorageStub;
    windowStub.innerWidth = 765;
    windowStub.innerHeight = 503;
    windowStub.devicePixelRatio = 1;
    windowStub.addEventListener = () => {};
    windowStub.removeEventListener = () => {};
    windowStub.requestAnimationFrame = (cb: (t: number) => void) => setTimeout(() => cb(performance.now()), 16) as unknown as number;
    windowStub.cancelAnimationFrame = (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    windowStub.setTimeout = setTimeout;
    windowStub.clearTimeout = clearTimeout;
    windowStub.setInterval = setInterval;
    windowStub.clearInterval = clearInterval;
    windowStub.fetch = g.fetch;
    windowStub.WebSocket = WebSocket;
    windowStub.Worker = g.Worker;
    windowStub.URL = URL;
    windowStub.URLSearchParams = URLSearchParams;
    windowStub.performance = performance;
    windowStub.onmouseup = null;
    windowStub.onmousemove = null;
    windowStub.oncontextmenu = null;
    // WebAudio: 3rdparty/tinymidipcm.js unconditionally uses window.audioContext
    // at module load (createGain/destination/currentTime). Provide a no-op stub
    // so audio init doesn't crash; we never play sound headless.
    // Full no-op AudioParam (tinymidipcm calls cancelScheduledValues,
    // setValueAtTime, linearRampToValueAtTime, etc.).
    const makeAudioParam = (): any => ({
        value: 0.1,
        setValueAtTime() { return this; },
        getValueAtTime() { return this.value; },
        cancelScheduledValues() { return this; },
        cancelAndHoldAtTime() { return this; },
        linearRampToValueAtTime() { return this; },
        exponentialRampToValueAtTime() { return this; },
        setTargetAtTime() { return this; },
        setValueCurveAtTime() { return this; }
    });
    const makeAudioNode = (): any => ({
        gain: makeAudioParam(),
        playbackRate: makeAudioParam(),
        connect() { return makeAudioNode(); },
        disconnect() {},
        start() {},
        stop() {},
        buffer: null,
        onended: null
    });
    const fakeAudioContext: any = {
        currentTime: 0,
        sampleRate: 22050,
        destination: {},
        state: 'running',
        createGain() { return makeAudioNode(); },
        createBuffer() { return { getChannelData() { return new Float32Array(1); }, duration: 0 }; },
        createBufferSource() { return makeAudioNode(); },
        decodeAudioData() { return Promise.resolve({ getChannelData() { return new Float32Array(1); }, duration: 0 }); },
        resume() { return Promise.resolve(); },
        suspend() { return Promise.resolve(); },
        close() { return Promise.resolve(); }
    };
    windowStub.AudioContext = function () { return fakeAudioContext; } as any;
    windowStub.webkitAudioContext = windowStub.AudioContext;
    windowStub.audioContext = fakeAudioContext;
    g.AudioContext = windowStub.AudioContext;
    windowStub.history = { replaceState() {}, pushState() {} };
    windowStub.setFaviconConnected = () => {};
    windowStub.setFaviconActive = () => {};

    g.window = windowStub;
    g.document = documentStub;
    g.navigator = g.navigator ?? navigatorStub;
    g.localStorage = localStorageStub;
    g.location = locationStub;
    g.HTMLCanvasElement = FakeCanvas;
    g.HTMLElement = FakeElement;
    // Image + Blob/object-URL: only used by Jpeg.ts to decode the cosmetic
    // title-screen background. Bun has no native image decode, and the title bg
    // is NOT on the in-game render path, so we fire onload synchronously and let
    // the fake 2D ctx return blank ImageData (black title bg).
    g.Image = FakeImage;
    if (!('Blob' in g)) {
        g.Blob = class FakeBlob { constructor(public parts: any[] = [], public opts: any = {}) {} };
    }
    // URL.createObjectURL / revokeObjectURL: bun's native impls validate args
    // strictly (revokeObjectURL throws on non-blob / empty strings). Jpeg.ts
    // calls them around the cosmetic title bg decode. Force no-op-ish shims.
    (URL as any).createObjectURL = (_b: any) => 'blob:headless/' + Math.random().toString(36).slice(2);
    (URL as any).revokeObjectURL = (_u: any) => {};
    g.ImageData = class FakeImageData {
        data: Uint8ClampedArray; width: number; height: number;
        constructor(a: any, b?: number, c?: number) {
            if (a instanceof Uint8ClampedArray) { this.data = a; this.width = b!; this.height = c ?? (a.length / 4 / b!); }
            else { this.width = a; this.height = b!; this.data = new Uint8ClampedArray(a * b! * 4); }
        }
    };
    // indexedDB undefined -> Database.openDatabase rejects -> client sets db=null
    if (!('indexedDB' in g)) g.indexedDB = undefined;

    return { canvas: theCanvas };
}
