/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';

import {
    gpuRenderPackets,
    recordClear,
    recordFillRect,
    recordModelGeometryUpload,
    recordModelLabelMapUpload,
    recordSceneInstance,
    recordSurfaceTarget,
    shouldEmitSceneNativeDeform
} from './GpuRenderPackets.js';

describe('GpuRenderPackets retained surfaces', () => {
    test('first dynamic target selection replays the pre-presentation static base', () => {
        const pixels = new Int32Array(8 * 6);
        gpuRenderPackets.reset();
        gpuRenderPackets.setEnabled(true);
        gpuRenderPackets.markSurfaceRecordable(pixels, 8, 6);

        recordSurfaceTarget(pixels, 8, 6);
        recordClear();
        recordFillRect(0, 0, 8, 6, 0x5a3218);

        // Headless frames reset the emitted packet list while the PixMap and
        // its retained contents survive. The first update used to discard the
        // base here because no present had saved it yet.
        gpuRenderPackets.reset();
        recordSurfaceTarget(pixels, 8, 6);
        recordFillRect(2, 2, 4, 2, 0x00ff00);

        expect(gpuRenderPackets.snapshot().packets.map(packet => packet.kind)).toEqual([
            'surface',
            'clear',
            'fillRect',
            'fillRect',
        ]);
    });
});

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

    test('model geometry uploads retain raw relight metadata', () => {
        gpuRenderPackets.reset();
        gpuRenderPackets.setEnabled(true);

        recordModelGeometryUpload(
            9,
            {
                numPoints: 2,
                numFaces: 1,
                pointX: new Int32Array([10, 20]),
                pointY: new Int32Array([30, 40]),
                pointZ: new Int32Array([50, 60]),
                faceVertexA: new Int32Array([0]),
                faceVertexB: new Int32Array([1]),
                faceVertexC: new Int32Array([0]),
                faceColourA: new Int32Array([0x1111]),
                faceColourB: new Int32Array([0x2222]),
                faceColourC: new Int32Array([0x3333]),
                faceRenderType: new Int32Array([0]),
                faceAlpha: null,
                facePriority: null,
                priority: 0,
                sceneBaseFaceColour: new Int32Array([0x4444]),
                sceneFaceNormalX: new Int32Array([9]),
                sceneFaceNormalY: new Int32Array([10]),
                sceneFaceNormalZ: new Int32Array([11]),
                sceneVertexNormalX: new Int32Array([1, 5]),
                sceneVertexNormalY: new Int32Array([2, 6]),
                sceneVertexNormalZ: new Int32Array([3, 7]),
                sceneVertexNormalW: new Int32Array([4, 8]),
            },
            true,
        );

        const snapshot = gpuRenderPackets.snapshot();
        expect(snapshot.packets).toHaveLength(1);
        expect(snapshot.packets[0]).toMatchObject({
            kind: 'modelGeometryUpload',
            geomId: 9,
            faceBaseColour: new Int32Array([0x4444]),
            faceNormalX: new Int32Array([9]),
            faceNormalY: new Int32Array([10]),
            faceNormalZ: new Int32Array([11]),
            vertexNormalX: new Int32Array([1, 5]),
            vertexNormalY: new Int32Array([2, 6]),
            vertexNormalZ: new Int32Array([3, 7]),
            vertexNormalW: new Int32Array([4, 8]),
        });
    });
});
