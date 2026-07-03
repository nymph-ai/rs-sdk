export type StreamAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type StreamUiClusterName = 'minimap' | 'inventory' | 'chat';

export interface StreamRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface StreamUiClusterProfile {
    anchor: StreamAnchor;
    visible: boolean;
    width: number;
    height: number;
    margin: number;
}

export interface StreamAvatarSafeZone {
    anchor: StreamAnchor;
    widthRatio: number;
    heightRatio: number;
}

export interface StreamClientProfile {
    enabled: boolean;
    name: string;
    logicalWidth: number;
    logicalHeight: number;
    devicePixelRatio: number;
    backingWidth: number;
    backingHeight: number;
    fov: number;
    drawDistance: number;
    avatarSafeZone: StreamAvatarSafeZone;
    ui: Record<StreamUiClusterName, StreamUiClusterProfile>;
}

export type StreamClientLayout = Partial<Record<StreamUiClusterName | 'avatarSafeZone' | 'game', StreamRect>>;

export interface ParseStreamClientProfileOptions {
    devicePixelRatio?: number;
}

declare global {
    interface Window {
        __rsSdkStreamClient?: {
            profile: StreamClientProfile;
            canvas: {
                logicalWidth: number;
                logicalHeight: number;
                backingWidth: number;
                backingHeight: number;
                devicePixelRatio: number;
            };
            layout?: StreamClientLayout;
        };
    }
}

const DEFAULT_LEGACY_WIDTH = 765;
const DEFAULT_LEGACY_HEIGHT = 503;
const DEFAULT_STREAM_WIDTH = 1920;
const DEFAULT_STREAM_HEIGHT = 1080;
const DEFAULT_STREAM_DRAWDISTANCE = 1200;
const DEFAULT_LEGACY_DRAWDISTANCE = 800;
const DEFAULT_FOV = 512;

const DEFAULT_UI: Record<StreamUiClusterName, StreamUiClusterProfile> = {
    minimap: {
        anchor: 'top-right',
        visible: true,
        width: 220,
        height: 250,
        margin: 16
    },
    inventory: {
        anchor: 'bottom-right',
        visible: true,
        width: 200,
        height: 330,
        margin: 16
    },
    chat: {
        anchor: 'bottom-left',
        visible: false,
        width: 479,
        height: 96,
        margin: 16
    }
};

const DEFAULT_AVATAR_SAFE_ZONE: StreamAvatarSafeZone = {
    anchor: 'bottom-left',
    widthRatio: 0.4,
    heightRatio: 0.65
};

let cachedProfile: StreamClientProfile | null = null;

function clampInt(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, Math.round(value)));
}

function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}

function parseFlag(value: string | null): boolean | null {
    if (value === null) {
        return null;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes') {
        return true;
    }

    if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no') {
        return false;
    }

    return null;
}

function firstParam(params: URLSearchParams, names: string[]): string | null {
    for (const name of names) {
        const value = params.get(name);
        if (value !== null && value !== '') {
            return value;
        }
    }
    return null;
}

function parsePositiveInt(value: string | null, fallback: number, min: number, max: number): number {
    if (value === null) {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return clampInt(parsed, min, max);
}

function parsePositiveNumber(value: string | null, fallback: number, min: number, max: number): number {
    if (value === null) {
        return fallback;
    }

    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return clampNumber(parsed, min, max);
}

function parseRenderSize(value: string | null): { width: number; height: number } | null {
    if (value === null) {
        return null;
    }

    const match = value.trim().match(/^(\d{2,5})\s*[x,:]\s*(\d{2,5})$/i);
    if (!match) {
        return null;
    }

    return {
        width: clampInt(Number.parseInt(match[1], 10), 320, 8192),
        height: clampInt(Number.parseInt(match[2], 10), 240, 8192)
    };
}

function parseAnchor(value: string | null, fallback: StreamAnchor): StreamAnchor {
    if (value === 'top-left' || value === 'top-right' || value === 'bottom-left' || value === 'bottom-right') {
        return value;
    }
    return fallback;
}

function parseCluster(params: URLSearchParams, name: StreamUiClusterName, defaults: StreamUiClusterProfile): StreamUiClusterProfile {
    const anchor = parseAnchor(firstParam(params, [`${name}Anchor`, `${name}UiAnchor`, `ui.${name}.anchor`]), defaults.anchor);
    const visible = parseFlag(firstParam(params, [`${name}Visible`, `ui.${name}.visible`])) ?? defaults.visible;
    const width = parsePositiveInt(firstParam(params, [`${name}Width`, `ui.${name}.width`]), defaults.width, 1, 4096);
    const height = parsePositiveInt(firstParam(params, [`${name}Height`, `ui.${name}.height`]), defaults.height, 1, 4096);
    const margin = parsePositiveInt(firstParam(params, [`${name}Margin`, `ui.${name}.margin`, 'uiMargin']), defaults.margin, 0, 512);

    return { anchor, visible, width, height, margin };
}

function parseAvatarSafeZone(params: URLSearchParams): StreamAvatarSafeZone {
    const compact = firstParam(params, ['avatarSafeZone']);
    if (compact !== null) {
        const parts = compact.split(',').map(part => part.trim());
        if (parts.length === 3) {
            return {
                anchor: parseAnchor(parts[0], DEFAULT_AVATAR_SAFE_ZONE.anchor),
                widthRatio: parsePositiveNumber(parts[1], DEFAULT_AVATAR_SAFE_ZONE.widthRatio, 0, 1),
                heightRatio: parsePositiveNumber(parts[2], DEFAULT_AVATAR_SAFE_ZONE.heightRatio, 0, 1)
            };
        }
    }

    return {
        anchor: parseAnchor(firstParam(params, ['avatarAnchor', 'avatarCorner']), DEFAULT_AVATAR_SAFE_ZONE.anchor),
        widthRatio: parsePositiveNumber(firstParam(params, ['avatarWidthRatio', 'avatarWidth']), DEFAULT_AVATAR_SAFE_ZONE.widthRatio, 0, 1),
        heightRatio: parsePositiveNumber(firstParam(params, ['avatarHeightRatio', 'avatarHeight']), DEFAULT_AVATAR_SAFE_ZONE.heightRatio, 0, 1)
    };
}

function isExplicitStreamRequest(params: URLSearchParams): boolean {
    const explicit = parseFlag(firstParam(params, ['streamClient', 'stream']));
    if (explicit !== null) {
        return explicit;
    }

    const profile = firstParam(params, ['streamProfile', 'profile']);
    return profile === 'stream-1080p' || params.has('renderSize');
}

export function isStreamClientProfileRequested(params: URLSearchParams = readBrowserSearchParams()): boolean {
    return isExplicitStreamRequest(params);
}

export function shouldUseWebGpuRenderer(rendererParam: string | null, rendererPreference: string | null, streamClientRequested: boolean): boolean {
    if (streamClientRequested) {
        return true;
    }

    return rendererParam !== 'canvas' && rendererPreference !== 'canvas';
}

export function shouldUseGpuPacketReplay(webGpuRequested: boolean, packetReplayPreference: boolean | null, streamClientRequested: boolean): boolean {
    return webGpuRequested && (streamClientRequested || (packetReplayPreference ?? true));
}

export function parseStreamClientProfile(params: URLSearchParams, options: ParseStreamClientProfileOptions = {}): StreamClientProfile {
    const enabled = isExplicitStreamRequest(params);
    const name = firstParam(params, ['streamProfile', 'profile']) ?? (enabled ? 'stream-1080p' : 'legacy');
    const size = parseRenderSize(firstParam(params, ['renderSize']));
    const logicalWidth = parsePositiveInt(firstParam(params, ['renderWidth']), size?.width ?? (enabled ? DEFAULT_STREAM_WIDTH : DEFAULT_LEGACY_WIDTH), 320, 8192);
    const logicalHeight = parsePositiveInt(firstParam(params, ['renderHeight']), size?.height ?? (enabled ? DEFAULT_STREAM_HEIGHT : DEFAULT_LEGACY_HEIGHT), 240, 8192);
    const requestedDpr = parsePositiveNumber(firstParam(params, ['renderDpr', 'dpr', 'devicePixelRatio']), options.devicePixelRatio ?? 1, 0.25, 4);
    const devicePixelRatio = enabled ? requestedDpr : 1;
    const backingWidth = clampInt(logicalWidth * devicePixelRatio, 320, 16384);
    const backingHeight = clampInt(logicalHeight * devicePixelRatio, 240, 16384);

    return {
        enabled,
        name,
        logicalWidth,
        logicalHeight,
        devicePixelRatio,
        backingWidth,
        backingHeight,
        fov: parsePositiveInt(firstParam(params, ['fov']), DEFAULT_FOV, 128, 2048),
        drawDistance: parsePositiveInt(firstParam(params, ['drawDistance']), enabled ? DEFAULT_STREAM_DRAWDISTANCE : DEFAULT_LEGACY_DRAWDISTANCE, 256, 3500),
        avatarSafeZone: parseAvatarSafeZone(params),
        ui: {
            minimap: parseCluster(params, 'minimap', DEFAULT_UI.minimap),
            inventory: parseCluster(params, 'inventory', DEFAULT_UI.inventory),
            chat: parseCluster(params, 'chat', DEFAULT_UI.chat)
        }
    };
}

export function resolveAnchoredRect(width: number, height: number, anchor: StreamAnchor, viewportWidth: number, viewportHeight: number, margin: number): StreamRect {
    const x = anchor.endsWith('right') ? viewportWidth - margin - width : margin;
    const y = anchor.startsWith('bottom') ? viewportHeight - margin - height : margin;
    return {
        x: Math.max(0, x | 0),
        y: Math.max(0, y | 0),
        width,
        height
    };
}

export function resolveAvatarSafeZone(profile: StreamClientProfile): StreamRect {
    return resolveAnchoredRect(
        Math.round(profile.backingWidth * profile.avatarSafeZone.widthRatio),
        Math.round(profile.backingHeight * profile.avatarSafeZone.heightRatio),
        profile.avatarSafeZone.anchor,
        profile.backingWidth,
        profile.backingHeight,
        0
    );
}

function rectsOverlap(a: StreamRect, b: StreamRect): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function mirrorHorizontal(anchor: StreamAnchor): StreamAnchor {
    return anchor.endsWith('right') ? anchor.replace('right', 'left') as StreamAnchor : anchor.replace('left', 'right') as StreamAnchor;
}

function alignSurfaceInCluster(clusterRect: StreamRect, surfaceWidth: number, surfaceHeight: number): StreamRect {
    return {
        x: clusterRect.x + Math.max(0, ((clusterRect.width - surfaceWidth) / 2) | 0),
        y: clusterRect.y + Math.max(0, ((clusterRect.height - surfaceHeight) / 2) | 0),
        width: surfaceWidth,
        height: surfaceHeight
    };
}

export function resolveStreamUiSurfaceRect(profile: StreamClientProfile, clusterName: StreamUiClusterName, surfaceWidth: number, surfaceHeight: number): StreamRect {
    const cluster = profile.ui[clusterName];
    const clusterWidth = Math.max(cluster.width, surfaceWidth);
    const clusterHeight = Math.max(cluster.height, surfaceHeight);
    const safeZone = resolveAvatarSafeZone(profile);

    const anchors: StreamAnchor[] = [
        cluster.anchor,
        mirrorHorizontal(cluster.anchor),
        'top-right',
        'top-left',
        'bottom-right',
        'bottom-left'
    ];

    let chosen = resolveAnchoredRect(clusterWidth, clusterHeight, cluster.anchor, profile.backingWidth, profile.backingHeight, cluster.margin);
    for (const anchor of anchors) {
        const candidate = resolveAnchoredRect(clusterWidth, clusterHeight, anchor, profile.backingWidth, profile.backingHeight, cluster.margin);
        if (!rectsOverlap(candidate, safeZone)) {
            chosen = candidate;
            break;
        }
    }

    return alignSurfaceInCluster(chosen, surfaceWidth, surfaceHeight);
}

export function publishStreamClientProfile(profile: StreamClientProfile, layout?: StreamClientLayout): void {
    if (typeof window === 'undefined') {
        return;
    }

    window.__rsSdkStreamClient = {
        profile,
        canvas: {
            logicalWidth: profile.logicalWidth,
            logicalHeight: profile.logicalHeight,
            backingWidth: profile.backingWidth,
            backingHeight: profile.backingHeight,
            devicePixelRatio: profile.devicePixelRatio
        },
        layout
    };
}

export function resetStreamClientProfileCache(): void {
    cachedProfile = null;
}

export function getStreamClientProfile(): StreamClientProfile {
    if (cachedProfile) {
        return cachedProfile;
    }

    const devicePixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    cachedProfile = parseStreamClientProfile(readBrowserSearchParams(), { devicePixelRatio });
    return cachedProfile;
}

function readBrowserSearchParams(): URLSearchParams {
    if (typeof window === 'undefined') {
        return new URLSearchParams();
    }
    return new URLSearchParams(window.location.search);
}
