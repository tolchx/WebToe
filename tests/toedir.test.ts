import { beforeAll, describe, expect, it } from 'vitest';
import { graphFromJSON } from '@webtoe/core';
import { registerAllOps } from '@webtoe/ops';
import { toedirLoader, type ImportFile } from '@webtoe/io';

beforeAll(() => registerAllOps());

/** Synthetic fixture mimicking the observed toeexpand grammar (authored for
 *  this test — see docs/RESEARCH.md §2.1; no Derivative content). */
function fixture(): ImportFile[] {
  const files: Record<string, string> = {
    '.build': 'version 099\nbuild 2025.00000\n',
    'noise1.n': 'TOP:noise\ntile 100 400 130 90\nflags =  viewer 1\nend\n',
    'noise1.parm': '?\nperiod 0 0.5\nharmon 0 4\ntz 17 0 absTime.seconds*0.2\n?\n',
    'level1.n': 'TOP:level\ntile 300 400 130 90\ninputs\n{\n0 \tnoise1\n}\ncolor 0.5 0.5 0.5\nend\n',
    // brightness uses flagged expression mode 49 (=32|16|1), gamma plain 17 —
    // both must be treated as expressions (bit 0 of the mode bitfield)
    'level1.parm': '?\nbrightness1 49 1 math.sin(absTime.seconds)*0.5+1\ngamma1 17 1 absTime.seconds*0.1+1\nopacity 0 0.9\ninvert 0 1\n?\n',
    'glow1.n': 'TOP:bloom\ntile 500 400 130 90\ninputs\n{\n0 \tlevel1\n}\nend\n',
    'mover1.n': 'CHOP:pattern\ntile 100 200 130 60\nend\n',
    'scene1.n': 'COMP:container\ntile 700 400 160 120\nend\n',
    'scene1/inner1.n': 'TOP:constant\ntile 0 0 130 90\nend\n',
    'scene1/inner1.parm': '?\ncolorr 0 1\ncolorg 0 0.25\ncolorb 0 0\nalpha 0 1\n?\n',
    'scene1/code1.n': 'DAT:text\ntile 200 0 130 60\nend\n',
    'scene1/code1.text': "print('hello from td')\n",
    'cross1.n': 'TOP:level\ntile 900 400 130 90\ninputs\n{\n0 \tscene1/inner1\n}\nend\n',
    'switch1.n': 'TOP:switch\ntile 1100 400 130 90\ninputs\n{\n0 \tnoise1\n1 \tlevel1\n}\nend\n',
    'switch1.parm': '?\nindex 17 0 absTime.frame % 2\n?\n',
    'pick1.n': 'CHOP:select\ntile 1100 200 130 60\nend\n',
    'pick1.parm': '?\nchannames 0 "tx ty"\n?\n',
    'scene1/in2.n': 'TOP:in\ntile 0 200 130 90\nend\n',
    'data1.n': 'DAT:table\ntile 100 600 130 60\nend\n',
    'data1.table': 'name\tvalue\nspeed\t3\n',
  };
  return Object.entries(files).map(([path, content]) => ({ path, text: async () => content }));
}

describe('toedir importer', () => {
  it('detects expansions', () => {
    expect(toedirLoader.canLoad(fixture())).toBe(true);
    expect(toedirLoader.canLoad([{ path: 'x.json', text: async () => '' }])).toBe(false);
  });

  it('maps known ops, stubs unknown ones, preserves wires and hierarchy', async () => {
    const { json, report } = await toedirLoader.load(fixture());
    const g = graphFromJSON(json);

    expect(g.resolve('/noise1', g.root)?.type).toBe('top:noise');
    expect(g.resolve('/level1', g.root)?.type).toBe('top:level');
    const stub = g.resolve('/glow1', g.root)!;
    expect(stub.type).toBe('top:stub');
    expect(stub.foreignType).toBe('TOP:bloom');
    expect(g.resolve('/mover1', g.root)?.type).toBe('chop:stub');

    // wire noise1 → level1 survived; stub kept its wire too
    expect(g.resolve('/level1', g.root)!.inputs[0]).toBe(g.resolve('/noise1', g.root));
    expect(stub.inputs[0]).toBe(g.resolve('/level1', g.root));

    // hierarchy + color gather + DAT text
    const inner = g.resolve('/scene1/inner1', g.root)!;
    expect(inner.type).toBe('top:constant');
    expect(inner.params.get('color')?.value).toEqual([1, 0.25, 0, 1]);
    expect(g.resolve('/scene1/code1', g.root)?.text).toContain('hello from td');

    // R1 ops + DAT-lite + tunnel index from name digits
    const sw = g.resolve('/switch1', g.root)!;
    expect(sw.type).toBe('top:switch');
    expect(sw.params.get('index')?.mode).toBe('expr');
    expect(g.resolve('/data1', g.root)?.type).toBe('dat:table');
    expect(g.resolve('/data1', g.root)?.text).toContain('speed\t3');
    const in2 = g.resolve('/scene1/in2', g.root)!;
    expect(in2.type).toBe('top:in');
    expect(in2.params.get('index')?.value).toBe(1);
    // quoted string constants are unquoted
    expect(g.resolve('/pick1', g.root)?.params.get('channames')?.value).toBe('tx ty');

    expect(report.nodesTotal).toBe(12);
    expect(report.nodesMapped).toBe(10);
    expect(report.nodesStubbed).toBe(2);
  });

  it('translates supported TD expressions and keeps the rest inert', async () => {
    const { json, report } = await toedirLoader.load(fixture());
    const g = graphFromJSON(json);
    const level = g.resolve('/level1', g.root)!;
    const b = level.params.get('brightness')!;
    expect(b.mode).toBe('expr');
    expect(b.expr).toBe('sin(time.seconds)*0.5+1');
    const ga = level.params.get('gamma')!;
    expect(ga.mode).toBe('expr');
    expect(ga.expr).toBe('time.seconds*0.1+1');
    expect(report.exprTranslated).toBeGreaterThanOrEqual(1);
    // noise1 'tz' has an expression but no param mapping → ignored, not crashed
    expect(g.resolve('/noise1', g.root)!.params.get('period')?.value).toBe(0.5);
    expect(g.resolve('/noise1', g.root)!.params.get('harmonics')?.value).toBe(4);
  });

  it('maps simple const parms incl. menus and reports cross-network wires', async () => {
    const { json, report } = await toedirLoader.load(fixture());
    const g = graphFromJSON(json);
    const level = g.resolve('/level1', g.root)!;
    expect(level.params.get('opacity')?.value).toBe(0.9);
    expect(level.params.get('invert')?.value).toBe(1);
    expect(report.notes.join(' ')).toMatch(/cross-network/);
  });
});
