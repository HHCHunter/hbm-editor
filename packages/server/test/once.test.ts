import { mkdtemp, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigStore } from '../src/config/configStore';
import { GameService } from '../src/game/GameService';
import { Once } from '../src/util/Once';
import { makeFakeGame } from './fakeGame';

describe('Once', () => {
  it('shares a successful load', async () => {
    const once = new Once<number>();
    let calls = 0;
    const load = async () => ++calls;
    expect(await once.get(load)).toBe(1);
    expect(await once.get(load)).toBe(1);
  });

  it('tries again after a failed load', async () => {
    const once = new Once<number>();
    await expect(once.get(() => Promise.reject(new Error('locked')))).rejects.toThrow('locked');
    expect(await once.get(async () => 2)).toBe(2);
  });
});

describe('game service', () => {
  it('lists scenes once a missing Scenes folder comes back', async () => {
    const temp = await mkdtemp(path.join(tmpdir(), 'hbm-once-test-'));
    try {
      const fake = await makeFakeGame(path.join(temp, 'Hitman Blood Money'));
      const service = await GameService.create(new ConfigStore(path.join(temp, 'data')));
      await service.setGame(fake.root);

      const scenes = path.join(fake.root, 'Scenes');
      await rename(scenes, `${scenes}.away`);
      await expect(service.scenes()).rejects.toThrow();
      await rename(`${scenes}.away`, scenes);
      expect([...(await service.scenes()).keys()]).toEqual([fake.scene]);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});
