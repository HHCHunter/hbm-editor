import { describe, expect, it } from 'vitest';
import { LocDatabase, decodeText } from '../src';
import { makeLoc } from './fixtures/builders';

const db = new LocDatabase(
  makeLoc([
    {
      name: 'AllLevels',
      children: [
        {
          name: 'Actions',
          children: [
            { name: 'Pickup', text: 'Pick up', sound: 1234 },
            { name: 'ThrowIntoChute', text: 'Throw into chute', sound: 99 },
          ],
        },
      ],
    },
    { name: 'Menu', children: [{ name: 'Quit', text: 'Quit game', text2: 'Q' }] },
  ]),
);

const textAt = (path: string) => {
  const hit = db.lookup(path);
  return hit && db.record(hit.flagsOffset);
};

describe('LocDatabase.lookup', () => {
  it('resolves a path to its record', () => {
    const hit = db.lookup('AllLevels/Actions/Pickup');
    expect(hit?.shadowed).toBe(false);
    const record = db.record(hit!.flagsOffset);
    expect(decodeText(record.text!)).toBe('Pick up');
    expect(record.soundId).toBe(1234);
  });

  it('ignores case and repeated slashes, as the engine does', () => {
    expect(decodeText(textAt('/alllevels//ACTIONS/pickup')!.text!)).toBe('Pick up');
  });

  it('reads the second text string', () => {
    expect(decodeText(textAt('Menu/Quit')!.text2!)).toBe('Q');
  });

  it('returns null for paths that do not exist', () => {
    expect(db.lookup('AllLevels/Actions/Jump')).toBeNull();
    expect(db.lookup('Nope')).toBeNull();
    expect(db.lookup('Menu/Quit/Deeper')).toBeNull();
  });

  it('reproduces the prefix-shadow hazard', () => {
    const hit = db.lookup('AllLevels/Actions/Throw');
    expect(hit).not.toBeNull();
    expect(hit!.shadowed).toBe(true);
    // The engine's flags pointer is name + seglen + 1: the 'n' of "ThrowIntoChute".
    expect(db.record(hit!.flagsOffset).flags).toBe('n'.charCodeAt(0));
  });
});

describe('LocDatabase.walk', () => {
  it('visits every node of a well-formed database', () => {
    const paths: string[] = [];
    const result = db.walk((path) => paths.push(path.map(decodeText).join('/')));
    expect(result.problems).toEqual([]);
    expect(result.nodes).toBe(6);
    expect(paths).toContain('AllLevels/Actions/ThrowIntoChute');
  });

  it('reports children stored out of order', () => {
    const unsorted = new LocDatabase(makeLoc([{ name: 'b', text: 'x' }, { name: 'A', text: 'y' }]));
    expect(unsorted.walk().problems).toHaveLength(1);
  });

  it('reports a record with both a child table and text', () => {
    const mixed = new LocDatabase(makeLoc([{ name: 'a', text: 'x', children: [{ name: 'b', text: 'y' }] }]));
    expect(mixed.walk().problems[0]).toMatch(/both a child table/);
  });
});
