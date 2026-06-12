/**
 * WebToe Knowledge Module
 * ========================
 * Self-contained TypeScript module for operator resolution, keyword search,
 * and topology data. Zero dependencies on MCP/Hermes — can be copy-pasted
 * into any WebToe codebase.
 *
 * Three sections:
 *   1. OP_DB — operator database (WebToe + TD types with descriptions)
 *   2. OPSearch — keyword-indexed search (FTS5-like using trie)
 *   3. Topology — common network patterns for efficient building
 *
 * Usage:
 *   import { resolveOp, searchOps, getTopology } from './webtoe-knowledge';
 *   const op = resolveOp('noise');         // → { type:'top:noise', family:'TOP' }
 *   const results = searchOps('particle'); // → [{ type:'pop:particle', ... }]
 *   const net = getTopology('feedback');   // → topology blueprint
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface OpEntry {
  /** WebToe canonical type (e.g. 'top:noise') */
  type: string;
  /** Family group */
  family: 'TOP' | 'CHOP' | 'COMP' | 'DAT' | 'SOP' | 'POP' | 'MAT';
  /** Human-readable label */
  label: string;
  /** Short description */
  description: string;
  /** Aliases for natural-language resolution (TD names, common misspellings) */
  aliases: string[];
  /** Typical parameters (keys, defaults) */
  defaultParams: Record<string, unknown>;
  /** Input semantics */
  inputs?: { min: number; max: number };
  /** Tags for search indexing */
  tags: string[];
  /** Whether this can contain children */
  isContainer?: boolean;
}

export interface SearchResult {
  entry: OpEntry;
  score: number;
  /** Why this matched */
  matchField: 'type' | 'alias' | 'tag' | 'label' | 'description';
}

export interface TopologyNode {
  name: string;
  type: string;
  params?: Record<string, unknown>;
  pos?: [number, number];
}

export interface TopologyWire {
  from: string;
  to: string;
}

export interface TopologyBlueprint {
  id: string;
  name: string;
  description: string;
  nodes: TopologyNode[];
  wires: TopologyWire[];
  tags: string[];
}

// ─── Section 1: Operator Database ──────────────────────────────────────────

const OP_DB: OpEntry[] = [
  // ═══ TOP ══════════════════════════════════════════════════════════════════
  {
    type: 'top:noise', family: 'TOP', label: 'Noise',
    description: 'Generates Perlin/Simplex noise texture. Supports monochrome, multi-harmonic fBm, animated over time.',
    aliases: ['noiseTOP', 'noise', 'fBm', 'perlin', 'simplex'],
    defaultParams: { period: 0.35, speed: 0.25, harmonics: 3, mono: true },
    tags: ['noise', 'texture', 'generator', 'procedural', 'fbm', 'perlin'],
  },
  {
    type: 'top:constant', family: 'TOP', label: 'Constant',
    description: 'Solid color texture at a chosen resolution.',
    aliases: ['constantTOP', 'constant', 'solid', 'flat'],
    defaultParams: { color: [1, 1, 1, 1], resw: 1280, resh: 720 },
    tags: ['color', 'solid', 'background', 'fill'],
  },
  {
    type: 'top:ramp', family: 'TOP', label: 'Ramp',
    description: 'Generates linear, radial or circular color ramps.',
    aliases: ['rampTOP', 'ramp', 'gradient'],
    defaultParams: { type: 'linear', phase: 0, colora: [0, 0, 0, 1], colorb: [1, 1, 1, 1] },
    tags: ['ramp', 'gradient', 'color', 'fill', 'procedural'],
  },
  {
    type: 'top:rectangle', family: 'TOP', label: 'Rectangle',
    description: 'Draws a filled rectangle with soft edges.',
    aliases: ['rectangleTOP', 'rectangle', 'rect'],
    defaultParams: { sizex: 0.4, sizey: 0.4, centerx: 0.5, centery: 0.5, color: [1, 1, 1, 1], softness: 0.002 },
    tags: ['rectangle', 'shape', '2d', 'geometry'],
  },
  {
    type: 'top:circle', family: 'TOP', label: 'Circle',
    description: 'Draws a filled or outlined circle.',
    aliases: ['circleTOP', 'circle'],
    defaultParams: { radius: 0.3, centerx: 0.5, centery: 0.5, color: [1, 1, 1, 1] },
    tags: ['circle', 'shape', '2d', 'geometry', 'radial'],
  },
  {
    type: 'top:level', family: 'TOP', label: 'Level',
    description: 'Adjusts brightness, contrast, opacity, gamma, and saturation.',
    aliases: ['levelTOP', 'level', 'brightness', 'contrast', 'opacity'],
    defaultParams: { brightness: 1, contrast: 1, opacity: 1, gamma: 1, saturation: 1 },
    tags: ['level', 'brightness', 'contrast', 'color', 'adjust', 'opacity'],
  },
  {
    type: 'top:transform', family: 'TOP', label: 'Transform',
    description: '2D transforms: translate, rotate, scale, pivot.',
    aliases: ['transformTOP', 'transform'],
    defaultParams: { tx: 0, ty: 0, rotate: 0, sx: 1, sy: 1, pivotx: 0.5, pivoty: 0.5, extend: 'hold' },
    tags: ['transform', 'translate', 'rotate', 'scale', '2d', 'move'],
  },
  {
    type: 'top:composite', family: 'TOP', label: 'Composite',
    description: 'Blends two textures using over, add, multiply, difference, etc.',
    aliases: ['compositeTOP', 'composite', 'blend', 'mix', 'over', 'add', 'multiply', 'difference'],
    defaultParams: { operation: 'over', opacity: 1 },
    tags: ['composite', 'blend', 'mix', 'over', 'alpha', 'combine'],
  },
  {
    type: 'top:displace', family: 'TOP', label: 'Displace',
    description: 'Displaces texture using a map for x/y offset (warp/distort).',
    aliases: ['displaceTOP', 'displace', 'warp', 'distort'],
    defaultParams: { weight: 0.05 },
    tags: ['displace', 'warp', 'distort', 'effect'],
  },
  {
    type: 'top:feedback', family: 'TOP', label: 'Feedback',
    description: 'Recirculates previous frame output for trails, motion blur, echo effects.',
    aliases: ['feedbackTOP', 'feedback', 'trail', 'echo'],
    defaultParams: {},
    tags: ['feedback', 'trail', 'echo', 'recursive', 'motion'],
    inputs: { min: 1, max: 1 },
  },
  {
    type: 'top:hsvadjust', family: 'TOP', label: 'HSV Adjust',
    description: 'Adjusts hue, saturation and value of the input texture.',
    aliases: ['hsvadjustTOP', 'hsvadjust', 'hsv', 'hue', 'saturation'],
    defaultParams: { hueoffset: 0, satmult: 1, valmult: 1 },
    tags: ['hsv', 'hue', 'saturation', 'color', 'adjust'],
  },
  {
    type: 'top:reorder', family: 'TOP', label: 'Reorder',
    description: 'Swizzles/maps RGBA channels from one or two inputs.',
    aliases: ['reorderTOP', 'reorder', 'swizzle', 'channel', 'rgba'],
    defaultParams: { outr: 'r', outg: 'g', outb: 'b', outa: 'a' },
    tags: ['channel', 'swizzle', 'reorder', 'rgba'],
  },
  {
    type: 'top:switch', family: 'TOP', label: 'Switch',
    description: 'Selects one of several input textures by index.',
    aliases: ['switchTOP', 'switch', 'selector', 'mixer'],
    defaultParams: { index: 0 },
    tags: ['switch', 'selector', 'mix'],
    inputs: { min: 1, max: 8 },
  },
  {
    type: 'top:blur', family: 'TOP', label: 'Blur',
    description: 'Applies gaussian blur to the input texture.',
    aliases: ['blurTOP', 'blur', 'gaussian', 'smooth'],
    defaultParams: { radius: 3, iterations: 1 },
    tags: ['blur', 'gaussian', 'smooth', 'filter'],
  },
  {
    type: 'top:edge', family: 'TOP', label: 'Edge',
    description: 'Edge detection (Sobel/Prewitt) filter.',
    aliases: ['edgeTOP', 'edge', 'sobel', 'outline', 'detect'],
    defaultParams: { strength: 1, edgecolor: [1, 1, 1, 1] },
    tags: ['edge', 'outline', 'sobel', 'detect', 'filter'],
  },
  {
    type: 'top:flip', family: 'TOP', label: 'Flip',
    description: 'Flips texture horizontally, vertically, or both.',
    aliases: ['flipTOP', 'flip', 'mirror'],
    defaultParams: { flipx: false, flipy: false },
    tags: ['flip', 'mirror', 'transform'],
  },
  {
    type: 'top:math', family: 'TOP', label: 'Math (TOP)',
    description: 'Per-pixel math operations on one or two inputs: add, multiply, abs, invert, etc.',
    aliases: ['mathTOP', 'topmath', 'invert'],
    defaultParams: { operation: 'multiply', gain: 1, postadd: 0 },
    tags: ['math', 'color', 'operation', 'pixel'],
  },
  {
    type: 'top:out', family: 'TOP', label: 'Output',
    description: 'Display output — marks the active texture for viewer display.',
    aliases: ['outTOP', 'output', 'display'],
    defaultParams: {},
    tags: ['output', 'display', 'viewer'],
  },
  {
    type: 'top:in', family: 'TOP', label: 'In',
    description: 'Input node — receives texture from outside the container.',
    aliases: ['inTOP', 'input'],
    defaultParams: {},
    tags: ['input', 'inlet', 'container'],
  },
  {
    type: 'top:camerain', family: 'TOP', label: 'Camera In',
    description: 'Webcam/microphone input via getUserMedia.',
    aliases: ['camerainTOP', 'camerain', 'webcam', 'video'],
    defaultParams: {},
    tags: ['camera', 'webcam', 'video', 'input'],
  },
  {
    type: 'top:moviein', family: 'TOP', label: 'Movie In',
    description: 'Playback of a movie file or image sequence.',
    aliases: ['movieinTOP', 'moviein', 'movie', 'video', 'playback'],
    defaultParams: {},
    tags: ['movie', 'video', 'playback', 'file'],
  },

  // ═══ CHOP ═════════════════════════════════════════════════════════════════
  {
    type: 'chop:lfo', family: 'CHOP', label: 'LFO',
    description: 'Low-frequency oscillator: sin, tri, square, saw, pulse waves.',
    aliases: ['lfoCHOP', 'lfo', 'oscillator', 'wave'],
    defaultParams: { wave: 'sin', frequency: 1, amplitude: 1, offset: 0, phase: 0 },
    tags: ['lfo', 'oscillator', 'wave', 'modulation'],
  },
  {
    type: 'chop:noise', family: 'CHOP', label: 'Noise (CHOP)',
    description: '1D Perlin noise channel with multi-harmonic fBm.',
    aliases: ['noiseCHOP', 'noisechop', 'perlinchop'],
    defaultParams: { period: 1, harmonics: 3, amplitude: 1, offset: 0, seed: 1 },
    tags: ['noise', 'random', 'channel'],
  },
  {
    type: 'chop:constant', family: 'CHOP', label: 'Constant',
    description: 'Generates constant-value channels.',
    aliases: ['constantCHOP', 'constantchop'],
    defaultParams: { name0: 'chan1', value0: 0 },
    tags: ['constant', 'value', 'channel'],
  },
  {
    type: 'chop:math', family: 'CHOP', label: 'Math (CHOP)',
    description: 'Mathematical operations on channels: add, multiply, range, etc.',
    aliases: ['mathCHOP', 'mathchop', 'expr'],
    defaultParams: { chanop: 'off', combine: 'add', gain: 1, postadd: 0 },
    tags: ['math', 'channel', 'operation'],
  },
  {
    type: 'chop:select', family: 'CHOP', label: 'Select',
    description: 'Selects specific channels by name from the input.',
    aliases: ['selectCHOP', 'selectchop'],
    defaultParams: { channames: 'chan1' },
    tags: ['select', 'channel', 'filter'],
    inputs: { min: 1, max: 1 },
  },
  {
    type: 'chop:merge', family: 'CHOP', label: 'Merge',
    description: 'Combines multiple CHOP inputs into one multi-channel output.',
    aliases: ['mergeCHOP', 'mergechop', 'combine'],
    defaultParams: {},
    tags: ['merge', 'combine', 'multichannel'],
    inputs: { min: 1, max: 8 },
  },
  {
    type: 'chop:lag', family: 'CHOP', label: 'Lag',
    description: 'Smooths/jitter-reduces a signal with exponential lag filter.',
    aliases: ['lagCHOP', 'lagchop', 'smooth', 'filter'],
    defaultParams: { lagup: 0.1, lagdown: 0.1 },
    tags: ['lag', 'smooth', 'filter', 'jitter'],
    inputs: { min: 1, max: 1 },
  },
  {
    type: 'chop:speed', family: 'CHOP', label: 'Speed',
    description: 'Measures rate of change (derivative) of input channels.',
    aliases: ['speedCHOP', 'speedchop', 'derivative', 'rate'],
    defaultParams: { rate: 60 },
    tags: ['speed', 'derivative', 'rate'],
    inputs: { min: 1, max: 1 },
  },
  {
    type: 'chop:par', family: 'CHOP', label: 'Parameter',
    description: 'Reads parameters from another operator as channels.',
    aliases: ['parCHOP', 'patchop'],
    defaultParams: { oppath: '', parnames: '' },
    tags: ['parameter', 'par', 'read'],
  },
  {
    type: 'chop:audioin', family: 'CHOP', label: 'Audio In',
    description: 'Captures live microphone audio input.',
    aliases: ['audioinCHOP', 'audioin', 'mic', 'microphone'],
    defaultParams: {},
    tags: ['audio', 'microphone', 'input', 'sound'],
  },
  {
    type: 'chop:mousein', family: 'CHOP', label: 'Mouse In',
    description: 'Mouse position and button state as channels (tx, ty, down).',
    aliases: ['mouseinCHOP', 'mousein', 'mouse'],
    defaultParams: {},
    tags: ['mouse', 'input', 'interaction'],
  },
  {
    type: 'chop:waveform', family: 'CHOP', label: 'Waveform',
    description: 'Audio waveform display data (for visualization).',
    aliases: ['waveformCHOP', 'waveform'],
    defaultParams: {},
    tags: ['waveform', 'audio', 'visualization'],
  },

  // ═══ SOP ══════════════════════════════════════════════════════════════════
  {
    type: 'sop:line', family: 'SOP', label: 'Line',
    description: 'Creates a 3D line between two points.',
    aliases: ['lineSOP', 'line'],
    defaultParams: { p1x: 0, p1y: -0.5, p1z: 0, p2x: 0, p2y: 0.5, p2z: 0, points: 20 },
    tags: ['line', '3d', 'geometry', 'primitive'],
  },
  {
    type: 'sop:circle', family: 'SOP', label: 'Circle',
    description: 'Generates a 3D circle (line strip).',
    aliases: ['circleSOP', 'circle3d'],
    defaultParams: { radius: 0.5, divisions: 48 },
    tags: ['circle', '3d', 'geometry', 'primitive'],
  },
  {
    type: 'sop:box', family: 'SOP', label: 'Box',
    description: 'Generates a 3D box/cube geometry.',
    aliases: ['boxSOP', 'box', 'cube'],
    defaultParams: { sx: 1, sy: 1, sz: 1 },
    tags: ['box', 'cube', '3d', 'geometry', 'primitive'],
  },
  {
    type: 'sop:sphere', family: 'SOP', label: 'Sphere',
    description: 'Generates a 3D sphere geometry.',
    aliases: ['sphereSOP', 'sphere'],
    defaultParams: { radius: 0.5, rows: 24, cols: 24 },
    tags: ['sphere', '3d', 'geometry', 'primitive'],
  },
  {
    type: 'sop:torus', family: 'SOP', label: 'Torus',
    description: 'Generates a 3D torus geometry.',
    aliases: ['torusSOP', 'torus', 'donut'],
    defaultParams: { radius: 0.5, tube: 0.15, rows: 24, cols: 24 },
    tags: ['torus', 'donut', '3d', 'geometry', 'primitive'],
  },
  {
    type: 'sop:plane', family: 'SOP', label: 'Plane',
    description: 'Generates a 3D grid/plane geometry.',
    aliases: ['planeSOP', 'plane', 'grid'],
    defaultParams: { sx: 1, sy: 1, rows: 10, cols: 10 },
    tags: ['plane', 'grid', '3d', 'geometry'],
  },
  {
    type: 'sop:transform', family: 'SOP', label: 'Transform (SOP)',
    description: '3D translate, rotate, scale of input geometry.',
    aliases: ['transformSOP', 'transform3d'],
    defaultParams: { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
    tags: ['transform', '3d', 'translate', 'rotate', 'scale'],
    inputs: { min: 0, max: 1 },
  },
  {
    type: 'sop:merge', family: 'SOP', label: 'Merge (SOP)',
    description: 'Combines multiple geometry inputs into one SOP output.',
    aliases: ['mergeSOP', 'mergesop'],
    defaultParams: {},
    tags: ['merge', 'combine', '3d'],
    inputs: { min: 1, max: 8 },
  },
  {
    type: 'sop:null', family: 'SOP', label: 'Null',
    description: 'Pass-through node for organizing geometry networks.',
    aliases: ['nullSOP', 'null'],
    defaultParams: {},
    tags: ['null', 'pass-through', 'organize'],
    inputs: { min: 0, max: 1 },
  },
  {
    type: 'sop:copy', family: 'SOP', label: 'Copy',
    description: 'Creates instances of input geometry.',
    aliases: ['copySOP', 'copysop', 'instance'],
    defaultParams: { n: 10, tx: 0.3, ty: 0, tz: 0 },
    tags: ['copy', 'instance', 'array'],
    inputs: { min: 1, max: 2 },
  },
  {
    type: 'sop:noise', family: 'SOP', label: 'Noise (SOP)',
    description: 'Displaces geometry points using Perlin noise.',
    aliases: ['noiseSOP', 'noisesop'],
    defaultParams: { amplitude: 0.1, frequency: 1, offset: 0 },
    tags: ['noise', 'displace', '3d', 'deform'],
    inputs: { min: 0, max: 1 },
  },

  // ═══ COMP ═════════════════════════════════════════════════════════════════
  {
    type: 'comp:container', family: 'COMP', label: 'Container',
    description: 'A container that groups nodes into a named sub-network. Can tunnel connections.',
    aliases: ['container', 'comp', 'base', 'containerCOMP', 'baseCOMP'],
    defaultParams: {},
    tags: ['container', 'group', 'network', 'organize'],
    isContainer: true,
  },
  {
    type: 'comp:panel', family: 'COMP', label: 'Panel',
    description: 'A panel component for building UIs (sliders, buttons, etc).',
    aliases: ['panelCOMP', 'panel', 'containerpan'],
    defaultParams: {},
    tags: ['panel', 'ui', 'control'],
    isContainer: true,
  },
  {
    type: 'comp:replicator', family: 'COMP', label: 'Replicator',
    description: 'Creates multiple copies of a sub-network driven by a table.',
    aliases: ['replicatorCOMP', 'replicator', 'replicatorcomp'],
    defaultParams: { template: '', master: '' },
    tags: ['replicator', 'clone', 'template', 'batch'],
    isContainer: true,
  },

  // ═══ DAT ══════════════════════════════════════════════════════════════════
  {
    type: 'dat:text', family: 'DAT', label: 'Text',
    description: 'Stores and displays a text/DAT string. Used for scripts, notes, data.',
    aliases: ['textDAT', 'text', 'note', 'label'],
    defaultParams: { text: '' },
    tags: ['text', 'dat', 'script', 'code', 'note'],
  },
  {
    type: 'dat:table', family: 'DAT', label: 'Table',
    description: 'A 2D grid/table of cells for data storage.',
    aliases: ['tableDAT', 'table', 'spreadsheet'],
    defaultParams: { rows: 10, cols: 4 },
    tags: ['table', 'data', 'grid', 'spreadsheet'],
  },
  {
    type: 'dat:execute', family: 'DAT', label: 'Execute',
    description: 'Executes python/script on cook events.',
    aliases: ['executeDAT', 'execute', 'script', 'python'],
    defaultParams: {},
    tags: ['execute', 'script', 'python', 'code'],
  },
  {
    type: 'dat:null', family: 'DAT', label: 'Null (DAT)',
    description: 'Pass-through node for organizing DAT networks.',
    aliases: ['nullDAT', 'nulldat'],
    defaultParams: {},
    tags: ['null', 'pass-through', 'dat'],
    inputs: { min: 0, max: 1 },
  },

  // ═══ POP ══════════════════════════════════════════════════════════════════
  {
    type: 'pop:particle', family: 'POP', label: 'Particle',
    description: 'Creates and manages particle systems — spawn, physics, rendering.',
    aliases: ['particlePOP', 'particle', 'particles', 'sprite'],
    defaultParams: { rate: 100, life: 3, inherit: 0.5 },
    tags: ['particle', 'pop', 'system', 'effect'],
    isContainer: true,
  },
  {
    type: 'pop:null', family: 'POP', label: 'Null (POP)',
    description: 'Pass-through node for organizing particle networks.',
    aliases: ['nullPOP', 'nullpop'],
    defaultParams: {},
    tags: ['null', 'pass-through', 'pop'],
    inputs: { min: 0, max: 1 },
  },
  {
    type: 'pop:point', family: 'POP', label: 'Point Generator',
    description: 'Generates particle points from geometry or random distribution.',
    aliases: ['pointPOP', 'point', 'generator', 'emit'],
    defaultParams: { type: 'random', count: 1000 },
    tags: ['point', 'generate', 'spawn', 'particle'],
  },
  {
    type: 'pop:force', family: 'POP', label: 'Force',
    description: 'Applies forces (gravity, wind, vortex) to particles.',
    aliases: ['forcePOP', 'force', 'gravity', 'wind'],
    defaultParams: { type: 'gravity', strength: -9.8 },
    tags: ['force', 'physics', 'particle', 'gravity'],
    inputs: { min: 0, max: 1 },
  },
  {
    type: 'pop:color', family: 'POP', label: 'Color',
    description: 'Sets particle color and alpha attributes.',
    aliases: ['colorPOP', 'colorpop'],
    defaultParams: { color: [1, 1, 1, 1] },
    tags: ['color', 'particle', 'attribute'],
    inputs: { min: 0, max: 1 },
  },
  {
    type: 'pop:limit', family: 'POP', label: 'Limit',
    description: 'Limits the maximum number of particles.',
    aliases: ['limitPOP', 'limitpop'],
    defaultParams: { max: 10000 },
    tags: ['limit', 'cap', 'max'],
    inputs: { min: 0, max: 1 },
  },
  {
    type: 'pop:trail', family: 'POP', label: 'Trail',
    description: 'Creates trails behind moving particles as line geometry.',
    aliases: ['trailPOP', 'trail', 'trailpop'],
    defaultParams: { length: 20, step: 0.05 },
    tags: ['trail', 'particle', 'effect', 'line'],
    inputs: { min: 0, max: 1 },
  },
  {
    type: 'pop:noise', family: 'POP', label: 'Noise (POP)',
    description: 'Applies noise-based movement to particles.',
    aliases: ['noisePOP', 'noisepop'],
    defaultParams: { amplitude: 1, frequency: 1 },
    tags: ['noise', 'particle', 'movement', 'random'],
    inputs: { min: 0, max: 1 },
  },
  {
    type: 'pop:collision', family: 'POP', label: 'Collision',
    description: 'Collision detection and response with geometry.',
    aliases: ['collisionPOP', 'collision', 'collide'],
    defaultParams: { bounce: 0.5, friction: 0.1 },
    tags: ['collision', 'physics', 'bounce', 'particle'],
    inputs: { min: 0, max: 2 },
  },

  // ═══ MAT ══════════════════════════════════════════════════════════════════
  {
    type: 'mat:standard', family: 'MAT', label: 'Standard Material',
    description: 'PBR material with color, metallic, roughness, emissive, and texture map.',
    aliases: ['standardMAT', 'standard', 'pbr', 'material'],
    defaultParams: { color: [1, 1, 1, 1], metallic: 0, roughness: 0.5 },
    tags: ['material', 'pbr', 'shading', 'render'],
  },
  {
    type: 'mat:line', family: 'MAT', label: 'Line Material',
    description: 'Material for rendering line geometry with width and color.',
    aliases: ['lineMAT', 'linemat'],
    defaultParams: { color: [1, 1, 1, 1], width: 1 },
    tags: ['line', 'material', 'wireframe'],
  },
  {
    type: 'mat:points', family: 'MAT', label: 'Points Material',
    description: 'Material for rendering point sprites with size and color.',
    aliases: ['pointsMAT', 'pointmat', 'sprite'],
    defaultParams: { color: [1, 1, 1, 1], size: 5 },
    tags: ['points', 'sprite', 'material'],
  },

  // ═══ PANEL (as COMP) ══════════════════════════════════════════════════════
  {
    type: 'panel:slider', family: 'COMP', label: 'Slider',
    description: 'A slider control for adjusting float parameters.',
    aliases: ['slider', 'sliderCOMP'],
    defaultParams: { min: 0, max: 1, value: 0.5 },
    tags: ['slider', 'control', 'ui', 'param'],
  },
  {
    type: 'panel:button', family: 'COMP', label: 'Button',
    description: 'A momentary or toggle button.',
    aliases: ['button', 'buttonCOMP'],
    defaultParams: { label: 'Button', moment: true },
    tags: ['button', 'control', 'ui', 'trigger'],
  },
  {
    type: 'panel:value', family: 'COMP', label: 'Value',
    description: 'A numeric value display/label.',
    aliases: ['value', 'valueCOMP', 'label'],
    defaultParams: { label: 'Value', value: 0 },
    tags: ['value', 'label', 'display', 'monitor'],
  },
];

// ─── Section 2: Keyword Search ─────────────────────────────────────────────

/**
 * Simple keyword-indexed search engine.
 * Builds an inverted index from op entries and supports prefix/partial matching.
 */
export class OPSearch {
  private index = new Map<string, Set<OpEntry>>();
  private wordIndex = new Map<string, Set<OpEntry>>();
  private entries = new Map<string, OpEntry>();

  constructor(ops: OpEntry[]) {
    for (const op of ops) {
      this.entries.set(op.type, op);
      this.indexOp(op);
    }
  }

  private indexOp(op: OpEntry): void {
    const terms = new Set<string>();

    // Index aliases (full and lowercased)
    for (const a of [op.type, op.label, ...op.aliases]) {
      const clean = a.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (clean) {
        terms.add(clean);
        // Also index substrings (2+ chars) for partial match
        for (let i = 0; i < clean.length - 1; i++) {
          for (let j = i + 2; j <= clean.length; j++) {
            const sub = clean.slice(i, j);
            if (!this.index.has(sub)) this.index.set(sub, new Set());
            this.index.get(sub)!.add(op);
          }
        }
      }
    }

    // Index tags
    for (const tag of op.tags) {
      const clean = tag.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (clean) {
        if (!this.wordIndex.has(clean)) this.wordIndex.set(clean, new Set());
        this.wordIndex.get(clean)!.add(op);
        terms.add(clean);
      }
    }

    // Index description words
    const descWords = op.description.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2);
    for (const w of descWords) {
      if (!this.wordIndex.has(w)) this.wordIndex.set(w, new Set());
      this.wordIndex.get(w)!.add(op);
    }
  }

  /**
   * Search operators by query string.
   * Returns results sorted by relevance (exact > prefix > partial).
   */
  search(query: string, maxResults: number = 10): SearchResult[] {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const results = new Map<OpEntry, { score: number; field: 'type' | 'alias' | 'tag' | 'label' | 'description' }>();

    const clean = q.replace(/[^a-z0-9]/g, '');

    // 1. Exact type match (highest score)
    const exactMatch = this.entries.get(q);
    if (exactMatch) {
      results.set(exactMatch, { score: 100, field: 'type' });
    }

    // 2. Exact alias/label match
    for (const op of this.entries.values()) {
      for (const alias of [op.label.toLowerCase(), ...op.aliases.map(a => a.toLowerCase().replace(/[^a-z0-9]/g, ''))]) {
        if (alias === clean) {
          if (!results.has(op) || results.get(op)!.score < 80) {
            results.set(op, { score: 80, field: 'alias' });
          }
        }
      }
    }

    // 3. Tag match
    const tagMatches = this.wordIndex.get(clean);
    if (tagMatches) {
      for (const op of tagMatches) {
        if (!results.has(op) || results.get(op)!.score < 60) {
          results.set(op, { score: 60, field: 'tag' });
        }
      }
    }

    // 4. Partial/substring index match
    const partialMatches = this.index.get(clean);
    if (partialMatches) {
      for (const op of partialMatches) {
        if (!results.has(op)) {
          results.set(op, { score: 30, field: 'description' });
        }
      }
    }

    // 5. Word-by-word AND search
    const words = q.split(/\s+/).filter(w => w.length > 1);
    if (words.length > 1) {
      let candidates: OpEntry[] | null = null;
      for (const word of words) {
        const matches = this.wordIndex.get(word) || this.index.get(word);
        if (!matches) { candidates = null; break; }
        if (candidates === null) candidates = [...matches];
        else candidates = candidates.filter(c => matches.has(c));
      }
      if (candidates) {
        for (const op of candidates) {
          if (!results.has(op)) {
            results.set(op, { score: 40, field: 'tag' });
          }
        }
      }
    }

    return [...results.entries()]
      .map(([entry, { score, field }]) => ({ entry, score, matchField: field }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  /** Get all operators. */
  all(): OpEntry[] {
    return [...this.entries.values()];
  }

  /** Get operator by type. */
  byType(type: string): OpEntry | undefined {
    return this.entries.get(type);
  }
}

// Default singleton
export const defaultSearch = new OPSearch(OP_DB);

// ─── Section 3: Topology Blueprints ────────────────────────────────────────

/**
 * Pre-built network topology patterns for common use cases.
 * These represent the STRUCTURE of a network — node names are placeholders
 * that can be remapped.
 */
const TOPOLOGIES: TopologyBlueprint[] = [
  {
    id: 'hello-noise',
    name: 'Hello Noise',
    description: 'Classic starter: noise texture + level + output, with an LFO driving brightness via expression.',
    tags: ['starter', 'basic', 'noise', 'hello'],
    nodes: [
      { name: 'noise1', type: 'top:noise', params: { period: 0.45, speed: 0.3 }, pos: [40, 40] },
      { name: 'level1', type: 'top:level', params: {}, pos: [240, 40] },
      { name: 'out1', type: 'top:out', params: { display: true }, pos: [440, 40] },
      { name: 'lfo1', type: 'chop:lfo', params: { frequency: 0.4, amplitude: 0.5, offset: 0.9 }, pos: [40, 210] },
    ],
    wires: [
      { from: 'noise1:0', to: 'level1:0' },
      { from: 'level1:0', to: 'out1:0' },
    ],
  },
  {
    id: 'feedback-trails',
    name: 'Feedback Trails',
    description: 'Feedback loop with hue drift and fade: noise → hue shift → composite over feedback → fade → display.',
    tags: ['feedback', 'trail', 'glow', 'effect'],
    nodes: [
      { name: 'noise1', type: 'top:noise', params: { period: 0.5, speed: 0.2 }, pos: [40, 40] },
      { name: 'hue1', type: 'top:hsvadjust', params: { hueoffset: 0.01 }, pos: [200, 40] },
      { name: 'comp1', type: 'top:composite', params: { operation: 'over' }, pos: [400, 40] },
      { name: 'feedback1', type: 'top:feedback', params: {}, pos: [400, 180] },
      { name: 'fade1', type: 'top:level', params: { brightness: 0.97, opacity: 0.95 }, pos: [560, 180] },
      { name: 'out1', type: 'top:out', params: { display: true }, pos: [600, 40] },
    ],
    wires: [
      { from: 'noise1:0', to: 'hue1:0' },
      { from: 'hue1:0', to: 'comp1:0' },
      { from: 'feedback1:0', to: 'fade1:0' },
      { from: 'fade1:0', to: 'comp1:1' },
      { from: 'comp1:0', to: 'out1:0' },
      { from: 'comp1:0', to: 'feedback1:0' },
    ],
  },
  {
    id: 'lfo-garden',
    name: 'LFO Garden',
    description: 'Multiple LFOs combined with CHOP math to drive multiple TOP parameters.',
    tags: ['lfo', 'modulation', 'animation', 'chop'],
    nodes: [
      { name: 'lfo1', type: 'chop:lfo', params: { wave: 'sin', frequency: 0.3, amplitude: 0.8 }, pos: [40, 40] },
      { name: 'lfo2', type: 'chop:lfo', params: { wave: 'tri', frequency: 0.7, amplitude: 0.4 }, pos: [40, 160] },
      { name: 'math1', type: 'chop:math', params: { combine: 'add', gain: 0.5 }, pos: [220, 100] },
      { name: 'noise1', type: 'top:noise', params: { period: 0.3 }, pos: [40, 320] },
      { name: 'level1', type: 'top:level', params: {}, pos: [240, 320] },
      { name: 'out1', type: 'top:out', params: { display: true }, pos: [440, 320] },
    ],
    wires: [
      { from: 'lfo1:0', to: 'math1:0' },
      { from: 'lfo2:0', to: 'math1:1' },
      { from: 'noise1:0', to: 'level1:0' },
      { from: 'level1:0', to: 'out1:0' },
    ],
  },
  {
    id: 'displace-warp',
    name: 'Displace Warp',
    description: 'Texture displacement using noise as a map: noise → reorder (as RGB→displace) → warp source.',
    tags: ['displace', 'warp', 'distort', 'effect'],
    nodes: [
      { name: 'source1', type: 'top:noise', params: { period: 0.8, speed: 0.1, mono: false }, pos: [40, 40] },
      { name: 'map1', type: 'top:noise', params: { period: 0.3, mono: true }, pos: [40, 200] },
      { name: 'reorder1', type: 'top:reorder', params: { outr: 'r', outg: 'r' }, pos: [200, 200] },
      { name: 'warp1', type: 'top:displace', params: { weight: 0.08 }, pos: [200, 40] },
      { name: 'level1', type: 'top:level', params: {}, pos: [400, 40] },
      { name: 'out1', type: 'top:out', params: { display: true }, pos: [560, 40] },
    ],
    wires: [
      { from: 'source1:0', to: 'warp1:0' },
      { from: 'map1:0', to: 'reorder1:0' },
      { from: 'reorder1:0', to: 'warp1:1' },
      { from: 'warp1:0', to: 'level1:0' },
      { from: 'level1:0', to: 'out1:0' },
    ],
  },
  {
    id: 'particle-basic',
    name: 'Particle System (Basic)',
    description: 'Minimal particle system: point → force → trail → render with null routing.',
    tags: ['particle', 'pop', 'system', 'effect'],
    nodes: [
      { name: 'point1', type: 'pop:point', params: { count: 5000, type: 'random' }, pos: [40, 40] },
      { name: 'force1', type: 'pop:force', params: { type: 'gravity', strength: -5 }, pos: [240, 40] },
      { name: 'color1', type: 'pop:color', params: { color: [0.8, 0.2, 0.5, 1] }, pos: [240, 180] },
      { name: 'null1', type: 'pop:null', params: {}, pos: [440, 100] },
    ],
    wires: [
      { from: 'point1:0', to: 'force1:0' },
      { from: 'force1:0', to: 'null1:0' },
      { from: 'color1:0', to: 'null1:1' },
    ],
  },
  {
    id: 'camera-kaleido',
    name: 'Webcam Kaleidoscope',
    description: 'Webcam input with kaleidoscope-like mirroring using transform and composite.',
    tags: ['camera', 'kaleido', 'mirror', 'webcam'],
    nodes: [
      { name: 'cam1', type: 'top:camerain', params: {}, pos: [40, 40] },
      { name: 'spin_a', type: 'top:transform', params: { rotate: 0, extend: 'mirror', sx: 1.6, sy: 1.6 }, pos: [220, 40] },
      { name: 'spin_b', type: 'top:transform', params: { rotate: 0, extend: 'mirror', sx: 2.4, sy: 2.4 }, pos: [220, 160] },
      { name: 'mix1', type: 'top:composite', params: { operation: 'difference' }, pos: [440, 100] },
      { name: 'out1', type: 'top:out', params: { display: true }, pos: [620, 100] },
    ],
    wires: [
      { from: 'cam1:0', to: 'spin_a:0' },
      { from: 'cam1:0', to: 'spin_b:0' },
      { from: 'spin_a:0', to: 'mix1:0' },
      { from: 'spin_b:0', to: 'mix1:1' },
      { from: 'mix1:0', to: 'out1:0' },
    ],
  },
  {
    id: '3d-scene',
    name: '3D Scene',
    description: 'Minimal 3D scene: SOP geometry → object transform → render + material.',
    tags: ['3d', 'scene', 'sop', 'geometry', 'render'],
    nodes: [
      { name: 'box1', type: 'sop:box', params: { sx: 1, sy: 1, sz: 1 }, pos: [40, 40] },
      { name: 'sphere1', type: 'sop:sphere', params: { radius: 0.4 }, pos: [40, 180] },
      { name: 'tor1', type: 'sop:torus', params: { radius: 0.4, tube: 0.12 }, pos: [40, 320] },
      { name: 'merge1', type: 'sop:merge', params: {}, pos: [220, 160] },
      { name: 'xfm1', type: 'sop:transform', params: { ty: 0.5 }, pos: [400, 160] },
      { name: 'mat1', type: 'mat:standard', params: { color: [0.9, 0.3, 0.1, 1] }, pos: [400, 300] },
    ],
    wires: [
      { from: 'box1:0', to: 'merge1:0' },
      { from: 'sphere1:0', to: 'merge1:1' },
      { from: 'tor1:0', to: 'merge1:2' },
      { from: 'merge1:0', to: 'xfm1:0' },
    ],
  },
  {
    id: 'chop-playground',
    name: 'CHOP Playground',
    description: 'LFO → math → lag → select chain demonstrating CHOP signal processing.',
    tags: ['chop', 'signal', 'modulation', 'playground'],
    nodes: [
      { name: 'lfo1', type: 'chop:lfo', params: { wave: 'sin', frequency: 1, amplitude: 1 }, pos: [40, 40] },
      { name: 'lfo2', type: 'chop:lfo', params: { wave: 'square', frequency: 0.3, amplitude: 0.5 }, pos: [40, 160] },
      { name: 'noise1', type: 'chop:noise', params: { period: 2, amplitude: 0.2 }, pos: [40, 280] },
      { name: 'merge1', type: 'chop:merge', params: {}, pos: [220, 140] },
      { name: 'math1', type: 'chop:math', params: { combine: 'add', gain: 0.8 }, pos: [400, 140] },
      { name: 'lag1', type: 'chop:lag', params: { lagup: 0.1, lagdown: 0.3 }, pos: [560, 140] },
    ],
    wires: [
      { from: 'lfo1:0', to: 'merge1:0' },
      { from: 'lfo2:0', to: 'merge1:1' },
      { from: 'noise1:0', to: 'merge1:2' },
      { from: 'merge1:0', to: 'math1:0' },
      { from: 'math1:0', to: 'lag1:0' },
    ],
  },
  {
    id: 'mouse-interactive',
    name: 'Mouse-Interactive',
    description: 'Mouse input drives multiple effects: position controls displacement, click triggers color shift.',
    tags: ['interactive', 'mouse', 'input', 'reactive'],
    nodes: [
      { name: 'mouse1', type: 'chop:mousein', params: {}, pos: [40, 40] },
      { name: 'smooth1', type: 'chop:lag', params: { lagup: 0.3, lagdown: 0.3 }, pos: [200, 40] },
      { name: 'noise1', type: 'top:noise', params: { period: 0.4, speed: 0.2 }, pos: [40, 220] },
      { name: 'hue1', type: 'top:hsvadjust', params: {}, pos: [240, 220] },
      { name: 'level1', type: 'top:level', params: {}, pos: [420, 220] },
      { name: 'out1', type: 'top:out', params: { display: true }, pos: [600, 220] },
    ],
    wires: [
      { from: 'mouse1:0', to: 'smooth1:0' },
      { from: 'noise1:0', to: 'hue1:0' },
      { from: 'hue1:0', to: 'level1:0' },
      { from: 'level1:0', to: 'out1:0' },
    ],
  },
  {
    id: 'video-mix',
    name: 'Video Mixer',
    description: 'Two sources (noise + camera) blended via switch + composite with LFO crossfade.',
    tags: ['video', 'mix', 'blend', 'crossfade', 'switch'],
    nodes: [
      { name: 'src1', type: 'top:noise', params: { period: 0.3, mono: false }, pos: [40, 40] },
      { name: 'cam1', type: 'top:camerain', params: {}, pos: [40, 180] },
      { name: 'switch1', type: 'top:switch', params: {}, pos: [220, 100] },
      { name: 'level1', type: 'top:level', params: {}, pos: [400, 100] },
      { name: 'out1', type: 'top:out', params: { display: true }, pos: [560, 100] },
      { name: 'lfo1', type: 'chop:lfo', params: { wave: 'sin', frequency: 0.2, amplitude: 0.5, offset: 0.5 }, pos: [40, 340] },
    ],
    wires: [
      { from: 'src1:0', to: 'switch1:0' },
      { from: 'cam1:0', to: 'switch1:1' },
      { from: 'switch1:0', to: 'level1:0' },
      { from: 'level1:0', to: 'out1:0' },
    ],
  },
];

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Resolve a natural-language operator name to its WebToe type.
 * Handles TD-style names ('noiseTOP'), WebToe types ('top:noise'),
 * abbreviations ('lfo'), and fuzzy aliases.
 */
export function resolveOp(input: string): OpEntry | null {
  const q = input.trim();
  if (!q) return null;

  const search = defaultSearch;
  const results = search.search(q, 3);

  if (results.length === 0) return null;
  if (results[0].score >= 80) return results[0].entry;

  // If top result is low confidence, return null
  if (results[0].score < 30) return null;
  return results[0].entry;
}

/**
 * Full-text search across all operators.
 */
export function searchOps(query: string, maxResults: number = 10): SearchResult[] {
  return defaultSearch.search(query, maxResults);
}

/**
 * Get a topology blueprint by ID.
 */
export function getTopology(id: string): TopologyBlueprint | null {
  return TOPOLOGIES.find(t => t.id === id) ?? null;
}

/**
 * List all topology blueprints.
 */
export function listTopologies(): TopologyBlueprint[] {
  return [...TOPOLOGIES];
}

/**
 * Find topologies matching tags or description.
 */
export function searchTopologies(query: string): TopologyBlueprint[] {
  const q = query.toLowerCase();
  return TOPOLOGIES.filter(t =>
    t.name.toLowerCase().includes(q) ||
    t.description.toLowerCase().includes(q) ||
    t.tags.some(tag => tag.toLowerCase().includes(q)) ||
    t.nodes.some(n => n.type.includes(q))
  );
}

/**
 * Get all available operators (for populating a palette/browser).
 */
export function getAllOps(): OpEntry[] {
  return [...OP_DB];
}

/**
 * Get operator counts by family.
 */
export function getFamilyStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const op of OP_DB) {
    stats[op.family] = (stats[op.family] || 0) + 1;
  }
  return stats;
}

/**
 * Get topology data including connectedness analysis.
 */
export function getTopologyGraph(id: string): {
  blueprint: TopologyBlueprint | null;
  adjacency: Record<string, string[]>;
  inDegree: Record<string, number>;
  outDegree: Record<string, number>;
  topologicalOrder: string[];
} | null {
  const bp = getTopology(id);
  if (!bp) return null;

  const adjacency: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};
  const outDegree: Record<string, number> = {};

  // Initialize all nodes
  for (const n of bp.nodes) {
    adjacency[n.name] = [];
    inDegree[n.name] = 0;
    outDegree[n.name] = 0;
  }

  // Build adjacency and degree counts
  for (const w of bp.wires) {
    const fromName = w.from.split(':')[0];
    const toName = w.to.split(':')[0];
    adjacency[fromName].push(toName);
    outDegree[fromName] = (outDegree[fromName] || 0) + 1;
    inDegree[toName] = (inDegree[toName] || 0) + 1;
  }

  // Compute topological order (Kahn's algorithm)
  const indeg = { ...inDegree };
  const queue = bp.nodes.filter(n => (indeg[n.name] || 0) === 0).map(n => n.name);
  const topologicalOrder: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    topologicalOrder.push(node);
    for (const neighbor of adjacency[node] || []) {
      indeg[neighbor]--;
      if (indeg[neighbor] === 0) queue.push(neighbor);
    }
  }

  return { blueprint: bp, adjacency, inDegree, outDegree, topologicalOrder };
}

export {
  OP_DB,
  TOPOLOGIES,
  OPSearch as OPSearchEngine,
};
