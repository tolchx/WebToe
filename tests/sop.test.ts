import { beforeAll, describe, expect, it } from 'vitest';
import { Engine, mat4, type SopOut, type ObjOut } from '@webtoe/core';
import { registerAllOps, geoKernels as G, matchTdPattern } from '@webtoe/ops';

beforeAll(() => registerAllOps());

describe('mat4', () => {
  it('compose translates/rotates/scales correctly', () => {
    const m = mat4.compose([1, 2, 3], [0, 0, 90], [2, 2, 2]);
    const p = mat4.transformPoint(m, [1, 0, 0]);
    expect(p[0]).toBeCloseTo(1, 5);  // (1,0,0)*2 rotZ90 → (0,2,0) +t
    expect(p[1]).toBeCloseTo(4, 5);
    expect(p[2]).toBeCloseTo(3, 5);
  });

  it('lookAt + invertRigid invariants', () => {
    const v = mat4.lookAt([0, 0, 5], [0, 0, 0]);
    const p = mat4.transformPoint(v, [0, 0, 0]);
    expect(p[2]).toBeCloseTo(-5, 5); // origin lands 5 in front of camera
    const m = mat4.compose([3, 1, -2], [10, 20, 30], [1, 1, 1]);
    const round = mat4.multiply(mat4.invertRigid(m), m);
    expect(round[0]).toBeCloseTo(1, 4);
    expect(round[12]).toBeCloseTo(0, 4);
  });
});

describe('SOP kernels', () => {
  it('builders produce expected counts', () => {
    expect(G.line([0, 0, 0], [0, 1, 0], 10).P.length / 3).toBe(10);
    expect(G.circle(0.5, 32, true, 'xy').lineStrips![0].length).toBe(33); // closed repeats first
    expect(G.grid(4, 5, 1, 1).triangles!.length).toBe(3 * 2 * 3 * 4);
    expect(G.sphere(0.5, 8, 12).P.length / 3).toBe(96);
    expect(G.box(1, 1, 1).triangles!.length).toBe(36);
  });

  it('merge concatenates with index offsets', () => {
    const m = G.mergeGeos([G.circle(1, 8, false, 'xy'), G.circle(1, 8, false, 'xy')]);
    expect(m.P.length / 3).toBe(16);
    expect(m.lineStrips!.length).toBe(2);
    expect(m.lineStrips![1][0]).toBe(8);
  });

  it('skin lofts equal-count strips into triangles with normals', () => {
    const merged = G.mergeGeos([G.circle(0.5, 12, false, 'zx'), G.transformGeo(G.circle(0.8, 12, false, 'zx'), mat4.compose([0, 1, 0], [0, 0, 0], [1, 1, 1]))]);
    const skinned = G.skinStrips(merged);
    expect(skinned.triangles!.length).toBe(11 * 6);
    expect(skinned.N!.length).toBe(skinned.P.length);
    const l = Math.hypot(skinned.N![0], skinned.N![1], skinned.N![2]);
    expect(l).toBeCloseTo(1, 4);
  });

  it('copy stamps source onto template points and inherits template color', () => {
    const tmpl = G.setColor(G.line([0, 0, 0], [3, 0, 0], 4), [1, 0, 0, 1]);
    const out = G.copyToPoints(G.box(0.1, 0.1, 0.1), tmpl);
    expect(out.P.length / 3).toBe(24 * 4);
    expect(out.Cd![0]).toBe(1);
  });

  it('noise displaces points deterministically', () => {
    const a = G.noiseDisplace(G.grid(5, 5, 1, 1), 0.5, 1, 0, 1, [0, 0, 1]);
    const b = G.noiseDisplace(G.grid(5, 5, 1, 1), 0.5, 1, 0, 1, [0, 0, 1]);
    expect(a.P[2]).toBeCloseTo(b.P[2], 6);
    expect(Math.abs(a.P[2])).toBeGreaterThan(0);
  });
});

describe('scene assembly (no GL)', () => {
  it('geo COMP cooks its SOP child with material + instances', () => {
    const e = new Engine();
    const g = e.graph;
    const geo = g.create('comp:geo', undefined, 'geo1');
    const circ = g.create('sop:circle', geo);
    circ.flags.display = true; // TD-style: the display SOP is what the COMP renders
    const mat = g.create('mat:line', undefined, 'linemat');
    geo.params.get('material')!.value = 'linemat'; // sibling, TD-style
    const tmpl = g.create('sop:grid', geo, 'tmpl');
    void tmpl;
    geo.params.get('instancing')!.value = true;
    geo.params.get('instanceop')!.value = './tmpl'; // inside the COMP

    e.liveRoots.add(geo);
    e.frame(0);
    const out = geo.output as ObjOut;
    expect(out.kind).toBe('obj');
    expect(out.obj.role).toBe('geo');
    expect(out.obj.material?.shading).toBe('line');
    expect(out.obj.instances?.count).toBe(100);
    expect(out.obj.geo?.lineStrips?.length).toBe(1);
    void mat;
  });

  it('camera lookat produces a view facing the target', () => {
    const e = new Engine();
    const cam = e.graph.create('comp:cam', undefined, 'cam1');
    cam.params.get('tz')!.value = 5;
    const geo = e.graph.create('comp:geo', undefined, 'subject');
    e.graph.create('sop:box', geo);
    cam.params.get('lookat')!.value = 'subject';
    e.liveRoots.add(cam);
    e.frame(0);
    const out = cam.output as ObjOut;
    const v = out.obj.camera!.view;
    const p = mat4.transformPoint(v, [0, 0, 0]);
    expect(p[2]).toBeCloseTo(-5, 4);
  });

  it('TD render patterns include and exclude', () => {
    expect(matchTdPattern('geo1', '*')).toBe(true);
    expect(matchTdPattern('geo7', 'geo* ^geo7')).toBe(false);
    expect(matchTdPattern('geo2', 'geo* ^geo7')).toBe(true);
    expect(matchTdPattern('cam1', 'geo*')).toBe(false);
  });

  it('sop ops cook through the engine including tunnels', () => {
    const e = new Engine();
    const g = e.graph;
    const c1 = g.create('sop:circle');
    const c2 = g.create('sop:circle');
    c2.params.get('radius')!.value = 0.8;
    const t = g.create('sop:transform');
    t.params.get('ty')!.value = 1;
    g.connect(c2, t, 0);
    const skin = g.create('sop:skin');
    g.connect(c1, skin, 0);
    g.connect(t, skin, 1);
    e.liveRoots.add(skin);
    e.frame(0);
    const out = skin.output as SopOut;
    expect(out.kind).toBe('sop');
    expect(out.geo.triangles!.length).toBeGreaterThan(0);
  });
});
