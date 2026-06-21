/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';

import {
    isStreamClientProfileRequested,
    parseStreamClientProfile,
    resolveAvatarSafeZone,
    resolveStreamUiSurfaceRect,
    shouldUseGpuPacketReplay,
    shouldUseWebGpuRenderer
} from './StreamClientProfile.js';

describe('StreamClientProfile', () => {
    test('keeps legacy mode disabled without stream parameters', () => {
        const profile = parseStreamClientProfile(new URLSearchParams());

        expect(profile.enabled).toBe(false);
        expect(profile.backingWidth).toBe(765);
        expect(profile.backingHeight).toBe(503);
        expect(profile.drawDistance).toBe(800);
    });

    test('uses stream-1080p defaults from the presentation spec', () => {
        const params = new URLSearchParams('streamProfile=stream-1080p');
        const profile = parseStreamClientProfile(params, { devicePixelRatio: 1 });

        expect(profile.enabled).toBe(true);
        expect(profile.logicalWidth).toBe(1920);
        expect(profile.logicalHeight).toBe(1080);
        expect(profile.backingWidth).toBe(1920);
        expect(profile.backingHeight).toBe(1080);
        expect(profile.ui.minimap).toMatchObject({ anchor: 'top-right', visible: true, width: 220, height: 250, margin: 16 });
        expect(profile.ui.inventory).toMatchObject({ anchor: 'bottom-right', visible: true, width: 200, height: 330, margin: 16 });
        expect(profile.ui.chat.visible).toBe(false);
        expect(profile.avatarSafeZone).toMatchObject({ anchor: 'bottom-left', widthRatio: 0.4, heightRatio: 0.65 });
    });

    test('applies renderSize, DPR, chat visibility, and draw distance launch parameters', () => {
        const params = new URLSearchParams('renderSize=2560x1440&dpr=2&chatVisible=true&drawDistance=1600');
        const profile = parseStreamClientProfile(params);

        expect(profile.enabled).toBe(true);
        expect(profile.logicalWidth).toBe(2560);
        expect(profile.logicalHeight).toBe(1440);
        expect(profile.backingWidth).toBe(5120);
        expect(profile.backingHeight).toBe(2880);
        expect(profile.ui.chat.visible).toBe(true);
        expect(profile.drawDistance).toBe(1600);
    });

    test('recognizes explicit stream request flags', () => {
        expect(isStreamClientProfileRequested(new URLSearchParams('streamClient=1'))).toBe(true);
        expect(isStreamClientProfileRequested(new URLSearchParams('stream=1'))).toBe(true);
        expect(isStreamClientProfileRequested(new URLSearchParams('streamClient=0&renderSize=1920x1080'))).toBe(false);
    });

    test('stream mode forces WebGPU even when canvas fallback is requested', () => {
        expect(shouldUseWebGpuRenderer('canvas', null, true)).toBe(true);
        expect(shouldUseWebGpuRenderer(null, 'canvas', true)).toBe(true);
        expect(shouldUseWebGpuRenderer('canvas', null, false)).toBe(false);
        expect(shouldUseGpuPacketReplay(true, false, true)).toBe(true);
        expect(shouldUseGpuPacketReplay(true, false, false)).toBe(false);
    });

    test('moves anchored UI away from the avatar safe zone', () => {
        const profile = parseStreamClientProfile(new URLSearchParams('streamProfile=stream-1080p&avatarAnchor=bottom-right'));
        const safeZone = resolveAvatarSafeZone(profile);
        const inventory = resolveStreamUiSurfaceRect(profile, 'inventory', 269, 343);

        expect(safeZone.x).toBe(1152);
        expect(safeZone.y).toBe(378);
        expect(inventory.x + inventory.width).toBeLessThanOrEqual(safeZone.x);
    });
});
