/**
 * Automated ".toe reading works" — CI-safe layer.
 * Reads the committed fixture (genuine toeexpand output of an original network,
 * see tests/fixtures/README.md) through the real importer and asserts the
 * resulting graph in detail. Runs everywhere, no TouchDesigner needed.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Engine, graphFromJSON, type Graph, type ChannelSet } from '@webtoe/core';
import { registerAllOps, sample } from '@webtoe/ops';
import { toedirLoader } from '@webtoe/io';
import { collectImportFiles } from './helpers';

beforeAll(() => registerAllOps());

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'tiny.expanded');

async function importFixture(): Promise<{ g: Graph; report: Awaited<ReturnType<typeof toedirLoader.load>>['report'] }> {
  const files = collectImportFiles(FIXTURE);
  const { json, report } = await toedirLoader.load(files);
  return { g: graphFromJSON(json), report };
}

describe('.toe pipeline (committed toeexpand fixture)', () => {
  it('is detected as a loadable expansion', () => {
    expect(toedirLoader.canLoad(collectImportFiles(FIXTURE))).toBe(true);
  });

  it('reconstructs every node with correct types', async () => {
    const { g, report } = await importFixture();
    const expectType = (path: string, type: string) =>
      expect(g.resolve(path, g.root)?.type, path).toBe(type);

    expectType('/project1', 'comp:container');
    expectType('/project1/noise1', 'top:noise');
    expectType('/project1/level1', 'top:level');
    expectType('/project1/comp1', 'top:composite');
    expectType('/project1/out1', 'top:out');
    expectType('/project1/lfo1', 'chop:lfo');
    expectType('/project1/movie1', 'top:imagein');
    expectType('/project1/notes1', 'dat:text');
    expectType('/project1/inner1', 'comp:container');
    expectType('/project1/inner1/in1', 'top:in');
    expectType('/project1/inner1/out1', 'top:out');

    // 3D pipeline branch (fixture v2)
    expectType('/project1/geo1', 'comp:geo');
    expectType('/project1/geo1/circle1', 'sop:circle');
    expectType('/project1/geo1/skin1', 'sop:skin');
    expectType('/project1/geo1/out2', 'sop:out');
    expectType('/project1/linemat1', 'mat:line');
    expectType('/project1/cam2', 'comp:cam');
    expectType('/project1/light2', 'comp:light');
    expectType('/project1/render1', 'top:render');
    const geo1 = g.resolve('/project1/geo1', g.root)!;
    expect(geo1.params.get('material')?.value).toBe('../linemat1');
    const cam2 = g.resolve('/project1/cam2', g.root)!;
    expect(cam2.params.get('fov')?.value).toBe(40);
    expect(cam2.params.get('tz')?.value).toBe(4);
    const circ = g.resolve('/project1/geo1/circle1', g.root)!;
    expect(circ.params.get('radius')?.value).toBe(0.4);
    expect(circ.params.get('divisions')?.value).toBe(24);
    const rend = g.resolve('/project1/render1', g.root)!;
    expect(rend.params.get('resw')?.value).toBe(640);

    // deliberate unmapped op → honest stub with original type label
    const stub = g.resolve('/project1/mirror1', g.root)!;
    expect(stub.type).toBe('top:stub');
    expect(stub.foreignType).toBe('TOP:mirror');

    expect(report.nodesTotal).toBe(23);
    expect(report.nodesStubbed).toBe(1);
    expect(report.nodesMapped).toBe(22);
  });

  it('restores wires including COMP-boundary and tunnel wiring', async () => {
    const { g } = await importFixture();
    const n = (p: string) => g.resolve(p, g.root)!;
    expect(n('/project1/level1').inputs[0]).toBe(n('/project1/noise1'));
    expect(n('/project1/mirror1').inputs[0]).toBe(n('/project1/level1'));
    expect(n('/project1/inner1').inputs[0]).toBe(n('/project1/mirror1')); // wire INTO the COMP
    expect(n('/project1/comp1').inputs[0]).toBe(n('/project1/inner1'));   // wire FROM the COMP
    expect(n('/project1/comp1').inputs[1]).toBe(n('/project1/noise1'));
    expect(n('/project1/out1').inputs[0]).toBe(n('/project1/comp1'));
    expect(n('/project1/inner1/level1').inputs[0]).toBe(n('/project1/inner1/in1'));
    expect(n('/project1/inner1/out1').inputs[0]).toBe(n('/project1/inner1/level1'));
  });

  it('translates parameters: consts, menus, expressions, strings, presets', async () => {
    const { g, report } = await importFixture();
    const n = (p: string) => g.resolve(p, g.root)!;

    expect(n('/project1/noise1').params.get('period')?.value).toBe(0.45);
    expect(n('/project1/noise1').params.get('harmonics')?.value).toBe(4);

    const b = n('/project1/level1').params.get('brightness')!;
    expect(b.mode).toBe('expr');
    expect(b.expr).toBe('sin(time.seconds)*0.5+1');
    expect(n('/project1/level1').params.get('opacity')?.value).toBe(0.9);

    expect(n('/project1/comp1').params.get('operation')?.value).toBe('add'); // operand const

    expect(n('/project1/lfo1').params.get('frequency')?.value).toBe(0.4);
    expect(n('/project1/lfo1').params.get('amplitude')?.value).toBe(0.5);

    expect(n('/project1/movie1').params.get('file')?.value).toBe('assets/original-test.png'); // mode 16

    expect(n('/project1/notes1').text).toContain('original webtoe fixture');
    expect(report.exprTranslated).toBeGreaterThanOrEqual(1);
  });

  it('imported expressions actually evaluate in the engine', async () => {
    const { g } = await importFixture();
    const e = new Engine();
    (e as { graph: Graph }).graph = g;
    const lfo = g.resolve('/project1/lfo1', g.root)!;
    e.liveRoots.add(lfo);
    e.frame(0);
    e.frame(0.5);
    const out = lfo.output as ChannelSet;
    expect(out.kind).toBe('chop');
    expect(Number.isFinite(sample(out, 'chan1'))).toBe(true);

    // the translated level brightness expression compiles and evaluates
    const level = g.resolve('/project1/level1', g.root)!;
    const v = e.param(level, 'brightness');
    expect(typeof v).toBe('number');
    expect(v).toBeGreaterThan(0.4); // sin(t)*0.5+1 ∈ [0.5, 1.5]
    expect(v).toBeLessThan(1.6);
  });
});
