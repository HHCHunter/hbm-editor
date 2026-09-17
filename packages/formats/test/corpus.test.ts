import { describe, expect, it } from 'vitest';
import { resolveGameDir } from '../scripts/nodeIo';
import { sweepCorpus } from '../scripts/sweepCorpus';

// Runs only when HBM_GAME_DIR points at an install.
const gameDir = resolveGameDir(process.env.HBM_GAME_DIR);

describe.skipIf(!gameDir)('game corpus', () => {
  it('reads every scene archive, PRP tree and localisation database', async () => {
    const report = await sweepCorpus(gameDir!);
    expect(report.failures).toEqual([]);
  }, 600_000);
});
