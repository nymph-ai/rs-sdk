/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';

import { gpuRenderPackets, recordSceneInstance, shouldEmitSceneNativeDeform } from './GpuRenderPackets.js';

describe('GpuRenderPackets scene packets', () => {
    test('scene instances carry animFrameId in the packet payload', () => {
        gpuRenderPackets.reset();
        gpuRenderPackets.setEnabled(true);

        recordSceneInstance(42, 1, 2, 3, 4, 5, 256, 77);

        const snapshot = gpuRenderPackets.snapshot();
        expect(snapshot.packets).toHaveLength(1);
        expect(snapshot.packets[0]).toMatchObject({
            kind: 'sceneInstance',
            geomId: 42,
            sinYaw: 1,
            cosYaw: 2,
            relativeX: 3,
            relativeY: 4,
            relativeZ: 5,
            alpha: 256,
            flags: 1,
            animFrameId: 77,
        });
    });

    test('native deform is enabled for supported scene animations', () => {
        expect(shouldEmitSceneNativeDeform()).toBe(true);
    });
});
