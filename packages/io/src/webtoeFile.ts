import { Graph, graphFromJSON, graphToJSON } from '@webtoe/core';

/** Serialize and trigger a browser download of the project. */
export function saveProjectFile(graph: Graph, name = 'project'): void {
  const json = graphToJSON(graph, { savedAt: new Date().toISOString() });
  const blob = new Blob([JSON.stringify(json, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name.replace(/[^\w-]+/g, '_') || 'project'}.webtoe.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function loadProjectFile(file: File): Promise<Graph> {
  const text = await file.text();
  return graphFromJSON(JSON.parse(text));
}

export async function loadProjectUrl(url: string): Promise<Graph> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${url}`);
  return graphFromJSON(await res.json());
}
