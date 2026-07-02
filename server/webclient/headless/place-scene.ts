// Place the headless rs-sdk client into a named NYM-220 drawset capture scene.
//
// This deliberately drives the same game protocol a real client uses. It does
// not write manifests or mutate corpus files; capture_corpus.sh starts the
// paired manifest emitter after this process has moved the account.

process.env.ENABLE_BOT_SDK = process.env.ENABLE_BOT_SDK ?? 'false';
process.env.LOGIN_RSAE = process.env.LOGIN_RSAE ?? '58778699976184461502525193738213253649000149147835990136706041084440742975821';
process.env.LOGIN_RSAN = process.env.LOGIN_RSAN ?? '7162900525229798032761816791230527296329313291232324290237849263501208207972894053929065636522363163621000728841182238772712427862772219676577293600221789';
process.env.SECURE_ORIGIN = process.env.SECURE_ORIGIN ?? 'false';

import { installDomStubs } from './dom-stubs.js';

installDomStubs();

type SceneCoord = {
    level: number;
    x: number;
    z: number;
};

type ScenePlacement = SceneCoord & {
    cheats?: string[];
    settleMs?: number;
};

const BOT = process.env.RS_BOT ?? 'headlessbot';
const PASS = process.env.RS_PASS ?? 'test';
const TIMEOUT_MS = Number(process.env.RS_TIMEOUT_MS ?? process.env.AURAI_DRAWSET_PLACE_TIMEOUT_MS ?? 90000);
const LOGOUT_SETTLE_MS = Number(process.env.AURAI_DRAWSET_PLACE_LOGOUT_SETTLE_MS ?? 1500);
const NEAR_PLANE_LOCADD = process.env.AURAI_NEAR_PLANE_LOCADD ?? 'locadd loc_1722';
const SCENE = process.argv[2] ?? process.env.SCENE ?? '';

const SCENES: Record<string, ScenePlacement> = {
    outdoor_terrain: { level: 0, x: 3221, z: 3219 },
    textured_interior: { level: 0, x: 3213, z: 3224 },
    player_present: { level: 0, x: 3221, z: 3219 },
    npc_present: { level: 0, x: 3221, z: 3219, cheats: ['npcadd man', 'tele 0,50,50,22,19'], settleMs: 1000 },
    obj_present: { level: 0, x: 3221, z: 3219, cheats: ['objadd bones 1'], settleMs: 1000 },
    near_plane: { level: 0, x: 3207, z: 3217, cheats: [NEAR_PLANE_LOCADD], settleMs: 1000 }
};

function log(...args: unknown[]): void {
    console.log('[place-scene]', ...args);
}

function fail(message: string): never {
    console.error(`[place-scene] ${message}`);
    process.exit(1);
}

function teleCommand(scene: SceneCoord): string {
    const mx = scene.x >> 6;
    const mz = scene.z >> 6;
    const lx = scene.x & 0x3f;
    const lz = scene.z & 0x3f;
    return `tele ${scene.level},${mx},${mz},${lx},${lz}`;
}

function sceneFromTeleCommand(command: string): SceneCoord | null {
    const parts = command.trim().replace(/^::/, '').split(/\s+/);
    if (parts[0] !== 'tele' || !parts[1]) {
        return null;
    }
    const coord = parts[1].split(',').map(part => Number.parseInt(part, 10));
    if (coord.length < 3 || coord.some(value => !Number.isFinite(value))) {
        return null;
    }
    return {
        level: coord[0],
        x: (coord[1] << 6) + (coord[3] ?? 32),
        z: (coord[2] << 6) + (coord[4] ?? 32)
    };
}

function playerPosition(client: any): { worldX: number; worldZ: number } | null {
    if (typeof client.getPlayerPosition !== 'function') {
        return null;
    }
    return client.getPlayerPosition();
}

async function waitFor(predicate: () => boolean, label: string, timeoutMs = TIMEOUT_MS): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
        if (Date.now() - start > timeoutMs) {
            fail(`TIMEOUT waiting for ${label}`);
        }
        await Bun.sleep(100);
    }
}

async function waitForPosition(client: any, scene: ScenePlacement): Promise<void> {
    const start = Date.now();
    let last: { worldX: number; worldZ: number } | null = null;

    while (Date.now() - start <= TIMEOUT_MS) {
        last = playerPosition(client);
        if (last && last.worldX === scene.x && last.worldZ === scene.z) {
            return;
        }
        await Bun.sleep(100);
    }

    const staff = client.staffmodlevel ?? client.staffModLevel ?? 'unknown';
    fail(
        `TIMEOUT waiting for target position ${scene.x},${scene.z}; last=${last?.worldX ?? 'unknown'},${last?.worldZ ?? 'unknown'} staffmodlevel=${staff}. ` +
        'The capture account must be staffmodlevel >=2 for ::tele and >=3 for npcadd.'
    );
}

async function main(): Promise<void> {
    const scene = SCENES[SCENE];
    if (!scene) {
        fail(`unknown scene "${SCENE}". Expected one of: ${Object.keys(SCENES).join(', ')}`);
    }

    log(`importing client modules for scene=${SCENE}`);
    const { Client } = await import('#/client/Client.js');

    const client: any = new Client(10, false, true);
    (globalThis as any).gameClient = client;

    await waitFor(() => (client.lastProgressPercent ?? 0) >= 100, 'client load');
    log('autoLogin as', BOT);
    await client.autoLogin(BOT, PASS);
    await waitFor(() => client.ingame === true, 'ingame');

    if (typeof client.isModalOpen === 'function' && client.isModalOpen() && typeof client.acceptCharacterDesign === 'function') {
        log('accepting open character design modal');
        client.acceptCharacterDesign();
        await Bun.sleep(500);
    }

    const tele = teleCommand(scene);
    log(`send ::${tele}`);
    if (!client.sendCheat(tele)) {
        fail('client refused to send tele command');
    }
    await waitForPosition(client, scene);

    for (const cheat of scene.cheats ?? []) {
        log(`send ::${cheat}`);
        if (!client.sendCheat(cheat)) {
            fail(`client refused to send ${cheat}`);
        }
        const target = sceneFromTeleCommand(cheat);
        if (target) {
            await waitForPosition(client, target);
        } else {
            await Bun.sleep(scene.settleMs ?? 500);
        }
    }

    const pos = playerPosition(client);
    log(`placed scene=${SCENE} at ${pos?.worldX ?? scene.x},${pos?.worldZ ?? scene.z}; settling logout`);
    client.stream?.close();
    await Bun.sleep(LOGOUT_SETTLE_MS);
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('[place-scene] FATAL', err);
        process.exit(1);
    });
