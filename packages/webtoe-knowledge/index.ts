/**
 * WebToe Knowledge Engine
 *
 * A self-contained module for WebToe that provides:
 *   1. Natural language → operator type resolution (200+ synonyms)
 *   2. Operator metadata (params, inputs, topology)
 *   3. Network building helpers
 *
 * Zero dependencies — copy-paste directly into WebToe's codebase.
 */

// ─── Operator Topology ──────────────────────────────────────────────────────

export interface OpTopology {
  type: string;       // WebToe type key (e.g. "pop:particle")
  family: string;
  label: string;
  inputCount: number;
  isMultiInput: boolean;
  connectsTo: string[];     // Common downstream operators
  paramNames: string[];     // Known parameter names
  description?: string;
  isExperimental?: boolean;
  warnings?: string[];      // TD-specific gotchas
}

// ─── Natural Language Synonyms (200+ entries) ──────────────────────────────

const TYPE_SYNONYMS: Record<string, { type: string; synonyms: string[] }> = {
  "top:noise": { type: "top:noise", synonyms: ["noise", "static", "grain", "fbm", "perlin", "simplex", "clouds", "ruido"] },
  "top:blur": { type: "top:blur", synonyms: ["blur", "smooth", "blurry", "soften", "gaussian", "desenfoque"] },
  "top:level": { type: "top:level", synonyms: ["level", "brightness", "contrast", "adjust", "color adjust"] },
  "top:composite": { type: "top:composite", synonyms: ["composite", "blend", "mix", "overlay", "merge layers", "combinar"] },
  "top:feedback": { type: "top:feedback", synonyms: ["feedback", "feedback loop", "echo", "trail", "estela"] },
  "top:transform": { type: "top:transform", synonyms: ["transform", "move", "rotate", "scale", "translate", "warp"] },
  "top:edge": { type: "top:edge", synonyms: ["edge", "outline", "border", "contour", "sobel", "bordes"] },
  "top:displace": { type: "top:displace", synonyms: ["displace", "displacement", "distort", "warp", "deform"] },
  "top:chromakey": { type: "top:chromakey", synonyms: ["chroma key", "greenscreen", "keying", "green screen"] },
  "top:constant": { type: "top:constant", synonyms: ["constant", "solid", "flat", "uniform"] },
  "top:ramp": { type: "top:ramp", synonyms: ["ramp", "gradient", "linear gradient", "degrade"] },
  "top:text": { type: "top:text", synonyms: ["text", "label", "title", "font", "texto"] },
  "top:switch": { type: "top:switch", synonyms: ["switch", "select", "toggle", "route", "multiplex"] },
  "top:over": { type: "top:over", synonyms: ["over", "alpha over", "composite over"] },
  "top:add": { type: "top:add", synonyms: ["add", "sum", "plus", "addition"] },
  "top:lookup": { type: "top:lookup", synonyms: ["lookup", "lut", "color lookup", "remap"] },
  "top:crop": { type: "top:crop", synonyms: ["crop", "trim", "cut", "region", "recortar"] },
  "top:tile": { type: "top:tile", synonyms: ["tile", "repeat", "grid", "pattern", "mosaic"] },
  "top:render": { type: "top:render", synonyms: ["render", "scene", "3d render", "final output"] },
  "top:out": { type: "top:out", synonyms: ["out", "output", "display", "null", "salida"] },
  "top:in": { type: "top:in", synonyms: ["in", "input", "entrada"] },
  "top:image": { type: "top:image", synonyms: ["image", "picture", "photo", "file in", "imagen"] },
  "top:video": { type: "top:video", synonyms: ["video", "movie", "clip", "film", "movie file"] },
  "top:camera": { type: "top:camera", synonyms: ["camera", "webcam", "video device", "live camera"] },
  "chop:audio": { type: "chop:audio", synonyms: ["audio", "sound", "music", "audio file", "sonido"] },
  "chop:spectrum": { type: "chop:spectrum", synonyms: ["spectrum", "fft", "frequency", "espectro", "audio analysis"] },
  "chop:lfo": { type: "chop:lfo", synonyms: ["lfo", "oscillator", "wave", "sine wave", "signal gen"] },
  "chop:math": { type: "chop:math", synonyms: ["math", "gain", "multiply", "range", "scale", "formula"] },
  "chop:constant": { type: "chop:constant", synonyms: ["constant channel", "value", "static value"] },
  "chop:noise": { type: "chop:noise", synonyms: ["noise chop", "random signal", "noise channel"] },
  "chop:lag": { type: "chop:lag", synonyms: ["lag", "smooth", "filter", "low pass", "suavizar"] },
  "chop:merge": { type: "chop:merge", synonyms: ["merge channels", "combine channels", "join chops"] },
  "chop:switch": { type: "chop:switch", synonyms: ["chop switch", "select channel", "route channel"] },
  "chop:speed": { type: "chop:speed", synonyms: ["speed", "velocity", "derivative", "rate"] },
  "chop:par": { type: "chop:par", synonyms: ["parameter", "parameter chop", "read param"] },
  "chop:mouse": { type: "chop:mouse", synonyms: ["mouse", "cursor", "pointer", "mouse position"] },
  "sop:grid": { type: "sop:grid", synonyms: ["grid", "mesh grid", "plane", "rejilla"] },
  "sop:sphere": { type: "sop:sphere", synonyms: ["sphere", "ball", "globe", "esfera"] },
  "sop:box": { type: "sop:box", synonyms: ["box", "cube", "cubo", "rectangular solid"] },
  "sop:circle": { type: "sop:circle", synonyms: ["circle", "disc", "ring", "circulo"] },
  "sop:line": { type: "sop:line", synonyms: ["line", "curve", "path", "linea"] },
  "sop:tube": { type: "sop:tube", synonyms: ["tube", "cylinder", "pipe", "tubo"] },
  "sop:torus": { type: "sop:torus", synonyms: ["torus", "donut", "ring 3d"] },
  "sop:noise": { type: "sop:noise", synonyms: ["noise sop", "displace geo", "morph terrain"] },
  "sop:transform": { type: "sop:transform", synonyms: ["transform sop", "move geo", "rotate geo"] },
  "sop:merge": { type: "sop:merge", synonyms: ["merge geo", "combine geometry", "join meshes"] },
  "sop:copy": { type: "sop:copy", synonyms: ["copy sop", "instance geo", "clone", "copiar"] },
  "pop:particle": { type: "pop:particle", synonyms: ["particle", "particles", "emitter", "particle system", "particulas", "sistema de particulas"] },
  "pop:noise": { type: "pop:noise", synonyms: ["noise force", "turbulence", "curl", "curl noise", "campo de ruido"] },
  "pop:force": { type: "pop:force", synonyms: ["force", "gravity", "attract", "pull", "wind", "gravedad"] },
  "pop:forceradial": { type: "pop:forceradial", synonyms: ["radial force", "vortex", "explosion", "implosion"] },
  "pop:trail": { type: "pop:trail", synonyms: ["trail", "trails", "estela", "motion trail", "rastro"] },
  "pop:render": { type: "pop:render", synonyms: ["render pop", "visualize pop", "display pop"] },
  "pop:glsl": { type: "pop:glsl", synonyms: ["glsl compute", "compute shader", "gpu compute pop"] },
  "pop:neighbor": { type: "pop:neighbor", synonyms: ["neighbor", "proximity", "nearby", "vecino"] },
  "pop:field": { type: "pop:field", synonyms: ["field", "force field", "3d field", "distance field", "campo"] },
  "pop:grid": { type: "pop:grid", synonyms: ["grid pop", "point grid", "rejilla de puntos"] },
  "pop:sphere": { type: "pop:sphere", synonyms: ["sphere pop", "source points", "point source"] },
  "pop:sprinkle": { type: "pop:sprinkle", synonyms: ["sprinkle", "scatter", "spread", "distribute"] },
  "pop:merge": { type: "pop:merge", synonyms: ["merge points", "combine pops", "unir puntos"] },
  "pop:null": { type: "pop:null", synonyms: ["null pop", "feedback target", "pop output"] },
  "pop:cache": { type: "pop:cache", synonyms: ["cache", "buffer", "store frames", "almacenar"] },
  "pop:sort": { type: "pop:sort", synonyms: ["sort points", "order", "ordenar"] },
  "pop:attribute": { type: "pop:attribute", synonyms: ["attribute", "point attribute", "custom attr"] },
  "pop:lookup": { type: "pop:lookup", synonyms: ["lookup pop", "attribute lookup", "texture lookup"] },
  "comp:container": { type: "comp:container", synonyms: ["container", "folder", "sub network", "base comp"] },
  "comp:geometry": { type: "comp:geometry", synonyms: ["geometry comp", "3d object", "geo comp"] },
  "comp:camera": { type: "comp:camera", synonyms: ["camera", "3d camera", "viewpoint"] },
  "comp:light": { type: "comp:light", synonyms: ["light", "3d light", "light source", "luz"] },
  "mat:constant": { type: "mat:constant", synonyms: ["constant mat", "flat color", "solid color"] },
  "mat:phong": { type: "mat:phong", synonyms: ["phong", "shiny", "reflective", "specular"] },
  "dat:text": { type: "dat:text", synonyms: ["text dat", "code", "script dat", "texto"] },
  "dat:table": { type: "dat:table", synonyms: ["table", "spreadsheet", "data", "csv", "tabla"] },
  "dat:select": { type: "dat:select", synonyms: ["select dat", "filter rows", "query data"] },
};

// ─── Family Hints ──────────────────────────────────────────────────────────

const FAMILY_HINTS: Record<string, { words: string[]; score: number }> = {
  "TOP": { words: ["image", "texture", "top", "render", "video", "blur", "composite", "feedback", 
                    "noise", "level", "transform", "edge", "displace", "glsl", "shader"], score: 0 },
  "CHOP": { words: ["audio", "sound", "chop", "signal", "music", "fft", "spectrum", "lfo", 
                     "oscillator", "channel", "wave", "frequency"], score: 0 },
  "POP": { words: ["particle", "pop", "point", "gpu", "particula", "compute", "emitter", 
                    "particles", "force", "trail", "neighbor", "field", "sprinkle"], score: 0 },
  "SOP": { words: ["sop", "geometry", "mesh", "geo", "grid", "sphere", "box", "tube", "torus",
                    "surface", "3d", "model", "shape"], score: 0 },
  "DAT": { words: ["dat", "text", "table", "script", "data", "code", "spreadsheet", "python"], score: 0 },
  "MAT": { words: ["mat", "material", "shader", "phong", "pbr", "color mat", "surface"], score: 0 },
  "COMP": { words: ["comp", "container", "component", "base", "subnetwork", "folder", 
                     "geometry comp", "camera", "light", "panel"], score: 0 },
};

// ─── Operator Topology Database ────────────────────────────────────────────

const KNOWN_TOPOLOGIES: Record<string, OpTopology> = {
  "pop:particle": { type: "pop:particle", family: "POP", label: "Particle POP", inputCount: 1, isMultiInput: false,
    connectsTo: ["pop:noise", "pop:force", "pop:trail", "pop:render", "pop:null"],
    paramNames: ["birthrate", "life", "lifevariance", "maxparticles", "initvelocityx", "initvelocityy", "initvelocityz"],
    description: "GPU particle emitter and solver. Core of all POP systems.",
    warnings: ["Needs maxparticles set high enough for visible results"] },

  "pop:noise": { type: "pop:noise", family: "POP", label: "Noise POP", inputCount: 1, isMultiInput: false,
    connectsTo: ["pop:force", "pop:trail", "pop:render"],
    paramNames: ["period", "amp0", "combineop", "amp1", "amp2", "freq0", "freq1"],
    description: "Applies simplex/Perlin noise to point attributes." },

  "pop:trail": { type: "pop:trail", family: "POP", label: "Trail POP", inputCount: 1, isMultiInput: false,
    connectsTo: ["pop:render", "pop:null"],
    paramNames: ["length", "active", "inc", "surftype", "alwayscook"],
    description: "Creates trail/ribbon geometry from moving points." },

  "pop:forceradial": { type: "pop:forceradial", family: "POP", label: "Force Radial POP", inputCount: 1, isMultiInput: false,
    connectsTo: ["pop:noise", "pop:trail", "pop:null"],
    paramNames: ["radialstrength", "falloffradius", "falloff", "posx", "posy", "posz"],
    description: "Applies radial attraction/repulsion forces to points." },

  "pop:glsl": { type: "pop:glsl", family: "POP", label: "GLSL POP", inputCount: 1, isMultiInput: false,
    connectsTo: ["pop:noise", "pop:trail", "pop:render"],
    paramNames: ["computedat", "npasses", "outputattrs", "outputaccess"],
    description: "Custom GPU compute shader on POP data." },

  "pop:neighbor": { type: "pop:neighbor", family: "POP", label: "Neighbor POP", inputCount: 1, isMultiInput: false,
    connectsTo: ["pop:glsl", "pop:noise", "pop:sort"],
    paramNames: ["maxdistance", "maxneighbors", "nebrtype", "numhashbuckets"],
    description: "Finds nearby points for each point." },

  "top:feedback": { type: "top:feedback", family: "TOP", label: "Feedback TOP", inputCount: 1, isMultiInput: false,
    connectsTo: ["top:composite", "top:transform", "top:level"],
    paramNames: ["opacity", "composite", "top"],
    description: "Accumulates frames with decay for feedback effects.",
    warnings: ["Set the 'top' parameter to reference the downstream TOP"] },

  "top:composite": { type: "top:composite", family: "TOP", label: "Composite TOP", inputCount: 2, isMultiInput: true,
    connectsTo: ["top:blur", "top:level", "top:out"],
    paramNames: ["operand", "swaporder"],
    description: "Multi-input blend/composite with 20+ modes." },

  "top:level": { type: "top:level", family: "TOP", label: "Level TOP", inputCount: 1, isMultiInput: false,
    connectsTo: ["top:blur", "top:composite", "top:out"],
    paramNames: ["pre", "post", "gamma", "brightness", "contrast"],
    description: "Adjusts brightness, contrast, and gamma." },
};

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Resolve natural language to WebToe operator types.
 * Returns ranked matches with confidence scores.
 */
export function resolvePrompt(prompt: string, topN = 5): Array<{
  webtoeType: string;
  label: string;
  family: string;
  score: number;
  topology?: OpTopology;
}> {
  const lower = prompt.toLowerCase();
  const results: Array<{ webtoeType: string; label: string; family: string; score: number; topology?: OpTopology }> = [];

  for (const [, entry] of Object.entries(TYPE_SYNONYMS)) {
    let score = 0;
    for (const syn of entry.synonyms) {
      if (lower.includes(syn.toLowerCase())) {
        score += 1;
        // Multi-word synonyms get bonus
        if (syn.includes(" ") && lower.includes(syn)) score += 2;
      }
    }
    if (score > 0) {
      const family = entry.type.split(":")[0].toUpperCase();
      const topology = KNOWN_TOPOLOGIES[entry.type];
      results.push({ webtoeType: entry.type, label: entry.type, family, score, topology });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topN);
}

/**
 * Get the best family match for a prompt.
 */
export function resolveFamily(prompt: string): string {
  const lower = prompt.toLowerCase();
  let bestFamily = "TOP";
  let bestScore = 0;

  for (const [family, hint] of Object.entries(FAMILY_HINTS)) {
    const score = hint.words.reduce((s, w) => s + (lower.includes(w) ? 3 : 0), 0);
    if (score > bestScore) { bestScore = score; bestFamily = family; }
  }

  return bestFamily;
}

/**
 * Get topology data for a WebToe operator type.
 */
export function getTopology(webtoeType: string): OpTopology | undefined {
  return KNOWN_TOPOLOGIES[webtoeType];
}

/**
 * Get connection suggestions: given an operator type, what should come after it.
 */
export function suggestConnections(webtoeType: string): string[] {
  const topo = KNOWN_TOPOLOGIES[webtoeType];
  return topo?.connectsTo ?? [];
}

/**
 * Search operator names by keyword.
 */
export function searchOperators(query: string, limit = 10): Array<{ type: string; label: string; family: string }> {
  const lower = query.toLowerCase();
  const results: Array<{ type: string; label: string; family: string }> = [];

  for (const [, entry] of Object.entries(TYPE_SYNONYMS)) {
    const match = entry.synonyms.some(s => s.includes(lower) || lower.includes(s));
    if (match) {
      const family = entry.type.split(":")[0].toUpperCase();
      results.push({ type: entry.type, label: entry.type, family });
    }
  }

  return results.slice(0, limit);
}

/**
 * Auto-wire strategy: connects nodes in sequence, respecting multi-input.
 */
export function autoWire(nodes: Array<{ name: string; type: string }>):
  Array<{ from: string; to: string }> {
  const wires: Array<{ from: string; to: string }> = [];
  const inputCounts = new Map<string, number>();

  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i].name;
    const to = nodes[i + 1].name;
    const topo = KNOWN_TOPOLOGIES[nodes[i + 1].type];
    const maxInputs = (topo?.isMultiInput ? 8 : (topo?.inputCount ?? 1));
    const used = inputCounts.get(to) ?? 0;

    if (used < maxInputs) {
      wires.push({ from: `${from}:0`, to: `${to}:${used}` });
      inputCounts.set(to, used + 1);
    }
  }

  return wires;
}

/**
 * Generate a network description string for an AI prompt.
 */
export function describePrompt(prompt: string): {
  operators: Array<{ type: string; family: string }>;
  family: string;
  connections: string[];
  complexity: "basic" | "standard" | "pro";
} {
  const ops = resolvePrompt(prompt, 8);
  const family = resolveFamily(prompt);
  const connections = ops.slice(0, -1).map((o, i) => `${o.webtoeType} → ${ops[i + 1]?.webtoeType}`);

  const complexity = ops.length >= 5 ? "pro" : ops.length >= 3 ? "standard" : "basic";

  return {
    operators: ops.map(o => ({ type: o.webtoeType, family: o.family })),
    family,
    connections,
    complexity,
  };
}
