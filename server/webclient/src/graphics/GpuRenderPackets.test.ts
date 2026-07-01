/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';

import {
    gpuRenderPackets,
    recordModelLabelMapUpload,
    recordSceneInstance,
    shouldEmitSceneNativeDeform
} from './GpuRenderPackets.js';

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

    test('model label uploads carry vertex and face labels', () => {
        gpuRenderPackets.reset();
        gpuRenderPackets.setEnabled(true);

        recordModelLabelMapUpload(
            7,
            {
                numPoints: 3,
                numFaces: 2,
                labelVertices: [new Int32Array([0, 2]), new Int32Array([1])],
                labelFaces: [new Int32Array([1]), new Int32Array([0])]
            },
            true,
        );

        const snapshot = gpuRenderPackets.snapshot();
        expect(snapshot.packets).toHaveLength(1);
        expect(snapshot.packets[0]).toMatchObject({
            kind: 'modelLabelMapUpload',
            geomId: 7,
            labels: new Int32Array([0, 1, 0]),
            faceLabels: new Int32Array([1, 0]),
        });
    });
});
