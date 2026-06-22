// Headless bun entry: load + run the rs-sdk web client with NO browser/DOM,
// connect to the running LostCity game server, reach in-game, and dump the
// GpuRenderPackets snapshot.
//
// Run: cd server/webclient && bun run headless/core.ts
// Env: RS_HOST (default localhost:8899), RS_BOT (default headlessbot),
//      RS_PASS (default test), RS_TIMEOUT_MS (default 90000)

import { installDomStubs } from './dom-stubs.js';

// Must install BEFORE importing any client module.
installDomStubs();

process.env.ENABLE_BOT_SDK = process.env.ENABLE_BOT_SDK ?? 'true';
// The browser build inlines these via bundle.ts `define`. Running from source,
// they must be present as real env vars or login's RSA enc throws on BigInt(undefined).
// Defaults mirror server/webclient/bundle.ts.
process.env.LOGIN_RSAE = process.env.LOGIN_RSAE ?? '58778699976184461502525193738213253649000149147835990136706041084440742975821';
process.env.LOGIN_RSAN = process.env.LOGIN_RSAN ?? '7162900525229798032761816791230527296329313291232324290237849263501208207972894053929065636522363163621000728841182238772712427862772219676577293600221789';
process.env.SECURE_ORIGIN = process.env.SECURE_ORIGIN ?? 'false';

const BOT = process.env.RS_BOT ?? 'headlessbot';
const PASS = process.env.RS_PASS ?? 'test';
const TIMEOUT_MS = Number(process.env.RS_TIMEOUT_MS ?? 90000);
const OUT = process.env.RS_OUT ?? '/tmp/bun_core_snapshot.json';

function log(...a: unknown[]) {
    console.log('[headless]', ...a);
}

async function main() {
    log('importing client modules…');
    const { Client } = await import('#/client/Client.js');
    const { gpuRenderPackets } = await import('#/graphics/GpuRenderPackets.js');

    log('gpuRenderPackets.enabled =', gpuRenderPackets.enabled);
    gpuRenderPackets.setEnabled(true);
    // We want packet capture without the CPU raster cost; surfaces are still
    // marked recordable by PixMap.markCpuRasterWritesSkippable() in resize().
    gpuRenderPackets.setSkipCpuRasterWrites(true);

    log('constructing Client (auto-runs loop)…');
    const client: any = new Client(10, false, true);
    (globalThis as any).gameClient = client;

    // Wait for asset load to reach 100%.
    const t0 = Date.now();
    let lastPct = -1;
    while ((client.lastProgressPercent ?? 0) < 100) {
        if (Date.now() - t0 > TIMEOUT_MS) {
            log('TIMEOUT waiting for load to reach 100%; lastProgressPercent =', client.lastProgressPercent, 'msg =', client.lastProgressMessage);
            break;
        }
        if (client.lastProgressPercent !== lastPct) {
            lastPct = client.lastProgressPercent;
            log('load progress', lastPct, client.lastProgressMessage ?? '');
        }
        await Bun.sleep(150);
    }
    log('load done. lastProgressPercent =', client.lastProgressPercent, 'packetsSoFar =', gpuRenderPackets.packets.length);

    if (typeof client.autoLogin === 'function') {
        log('autoLogin as', BOT, '…');
        try {
            await client.autoLogin(BOT, PASS);
        } catch (e) {
            log('autoLogin threw:', (e as Error)?.message ?? e);
        }
    }

    // Wait for ingame.
    const tLogin = Date.now();
    while (!client.ingame) {
        if (Date.now() - tLogin > TIMEOUT_MS) {
            log('TIMEOUT waiting for ingame. ingame =', client.ingame, 'loginMes:', client.loginMes1, client.loginMes2);
            break;
        }
        await Bun.sleep(150);
    }
    log('ingame =', client.ingame);

    // Tick a bit longer so the world/UI render path emits packets.
    log('ticking to accumulate render packets…');
    for (let i = 0; i < 60 && client.ingame; i++) {
        await Bun.sleep(100);
    }

    const snap = gpuRenderPackets.snapshot();
    const histogram: Record<string, number> = {};
    for (const p of snap.packets) histogram[p.kind] = (histogram[p.kind] ?? 0) + 1;

    const summary = {
        ingame: client.ingame,
        enabled: snap.enabled,
        packetCount: snap.packetCount,
        dropped: snap.dropped,
        cpuRasterWriteBypasses: snap.cpuRasterWriteBypasses,
        surfaces: snap.surfaces.length,
        recordableSurfaces: snap.recordableSurfaces,
        spriteResources: snap.spriteResources.length,
        glyphResources: snap.glyphResources.length,
        indexedSpriteResources: snap.indexedSpriteResources.length,
        textureResources: snap.textureResources.length,
        colourTable: snap.colourTableResource ? 1 : 0,
        histogram
    };

    log('=== SNAPSHOT SUMMARY ===');
    log(JSON.stringify(summary, null, 2));

    // Serialize (replace typed arrays with lengths to keep file sane).
    const serializable = {
        ...summary,
        packets: snap.packets.slice(0, 2000),
        surfacesDetail: snap.surfaces,
    };
    await Bun.write(OUT, JSON.stringify(serializable, (_k, v) => (v instanceof Uint8Array ? `<Uint8Array len=${v.length}>` : v), 2));
    log('wrote', OUT);

    process.exit(0);
}

main().catch(e => {
    console.error('[headless] FATAL', e);
    process.exit(1);
});
