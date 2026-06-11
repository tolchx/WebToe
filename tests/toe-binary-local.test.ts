/**
 * Automated ".toe reading works" — real-binary integration layer.
 * Starts from the committed BINARY fixture (tests/fixtures/tiny.toe), expands
 * it with the genuine `toeexpand` from a local TouchDesigner install, imports
 * the fresh expansion, and exercises the toe-convert CLI end-to-end.
 *
 * Auto-skips when no TouchDesigner installation is present (e.g. CI), so
 * `npm run check` is green everywhere and exhaustive on dev machines.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, globSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { graphFromJSON, type NodeJSON } from '@webtoe/core';
import { registerAllOps } from '@webtoe/ops';
import { toedirLoader } from '@webtoe/io';
import { collectImportFiles } from './helpers';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOE = join(HERE, 'fixtures', 'tiny.toe');
const CLI = join(HERE, '..', 'packages', 'cli', 'toe-convert.mjs');

function findToeexpand(): string | null {
  const candidates = [
    ...globSync('/Applications/TouchDesigner*.app/Contents/MacOS/toeexpand').sort().reverse(),
    ...globSync('C:/Program Files/Derivative/TouchDesigner*/bin/toeexpand.exe').sort().reverse(),
  ];
  return candidates.find((c) => existsSync(c)) ?? null;
}

const toeexpand = findToeexpand();

beforeAll(() => registerAllOps());

describe.skipIf(!toeexpand)('.toe binary integration (requires local TouchDesigner)', () => {
  it('expands the committed binary .toe and imports it identically to the committed expansion', async () => {
    const work = mkdtempSync(join(tmpdir(), 'webtoe-toe-test-'));
    try {
      const copy = join(work, 'tiny.toe');
      cpSync(TOE, copy);
      try {
        execFileSync(toeexpand!, [copy], { cwd: work, stdio: 'pipe' });
      } catch {
        // toeexpand exits nonzero even on success
      }
      const dir = `${copy}.dir`;
      expect(existsSync(dir), 'toeexpand should produce a .dir').toBe(true);

      const freshFiles = collectImportFiles(dir);
      const committedFiles = collectImportFiles(join(HERE, 'fixtures', 'tiny.expanded'));
      expect(new Set(freshFiles.map((f) => f.path))).toEqual(new Set(committedFiles.map((f) => f.path)));

      const fresh = await toedirLoader.load(freshFiles);
      const committed = await toedirLoader.load(committedFiles);
      expect(fresh.report).toEqual(committed.report);
      expect(fresh.json).toEqual(committed.json);

      // and the graph builds + tunnels resolve
      const g = graphFromJSON(fresh.json);
      expect(g.resolve('/project1/inner1/in1', g.root)?.type).toBe('top:in');
      expect(g.resolve('/project1/comp1', g.root)?.inputs[0]?.name).toBe('inner1');
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('toe-convert CLI converts the binary .toe end-to-end', () => {
    const work = mkdtempSync(join(tmpdir(), 'webtoe-cli-test-'));
    try {
      const out = join(work, 'tiny.webtoe.json');
      execFileSync(process.execPath, [CLI, TOE, '-o', out], { stdio: 'pipe' });
      const json = JSON.parse(readFileSync(out, 'utf8'));
      expect(json.app).toBe('webtoe');
      const count = (ns: NodeJSON[]): number => ns.reduce((a, n) => a + 1 + (n.children ? count(n.children) : 0), 0);
      expect(count(json.root.nodes)).toBe(13);
      const project1 = json.root.nodes.find((n: NodeJSON) => n.name === 'project1');
      expect(project1.children.some((n: NodeJSON) => n.name === 'mirror1' && n.type === 'top:stub')).toBe(true);
      // CLI output loads into the engine graph
      const g = graphFromJSON(json);
      expect(g.resolve('/project1/noise1', g.root)?.type).toBe('top:noise');
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});

describe('toeexpand discovery', () => {
  it('reports the local TouchDesigner status (informational)', () => {
    // not an assertion failure either way — records which layer ran
    console.log(toeexpand
      ? `toeexpand found: ${toeexpand} — full binary integration ran`
      : 'no local TouchDesigner — binary layer skipped (fixture layer still covers the format)');
    expect(true).toBe(true);
  });
});
