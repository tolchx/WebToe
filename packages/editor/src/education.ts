// Education panel
import type { EditorApp } from "./app";
import { allOps } from "@webtoe/core";
import type { OpSpec } from "@webtoe/core";
import { FAMILY_COLORS } from "./style";

export interface EducationOptions {
  width?: number;
}





interface ExerciseDef {
  id: string;
  title: string;
  description: string;
  family: string;
  difficulty: "facil" | "medio" | "dificil";
  hint: string;
}

const EXERCISES: ExerciseDef[] = [
  {id:"ex-noise-top",title:"Crear un Noise TOP",description:"Crea un operador noise TOP y ajusta parametros.",family:"TOP",difficulty:"facil",hint:"Usa Ctrl+K o el menu contextual para agregar un Noise TOP."},
  {id:"ex-chop-to-top",title:"Conectar CHOP a TOP",description:"Conecta un LFO CHOP al nivel de un TOP.",family:"CHOP",difficulty:"facil",hint:"Crea un LFO CHOP y conectalo al parametro Level de un Constant TOP."},
  {id:"ex-feedback-loop",title:"Bucle de Feedback",description:"Construye un bucle de feedback.",family:"TOP",difficulty:"medio",hint:"Usa un Feedback TOP con un Composite TOP."},
  {id:"ex-3d-box",title:"Caja 3D con Material",description:"Crea geometria SOP y aplica material.",family:"SOP",difficulty:"medio",hint:"Crea un Box SOP, conectalo a un Phong MAT."},
  {id:"ex-chop-math",title:"Operaciones CHOP Math",description:"Combina senales LFO con Math CHOP.",family:"CHOP",difficulty:"medio",hint:"Usa un Math CHOP para sumar dos LFOs."},
  {id:"ex-dat-table",title:"Tabla de Datos",description:"Crea un Table DAT con datos numericos.",family:"DAT",difficulty:"medio",hint:"Crea un Table DAT, escribe valores, exporta canales."},
  {id:"ex-glsl-shader",title:"Shader GLSL Personalizado",description:"Escribe un shader GLSL basico.",family:"TOP",difficulty:"dificil",hint:"Crea un GLSL TOP con fragment shader."},
  {id:"ex-instancing",title:"Instancing 3D",description:"Crea instancias de geometria.",family:"SOP",difficulty:"dificil",hint:"Usa un Instance SOP con posiciones XYZ."},
  {id:"ex-boids-simple",title:"Boids Simplificado",description:"Implementa flocking basico.",family:"SOP",difficulty:"dificil",hint:"Usa SOPs para separacion, alineacion y cohesion."},
];


const EDU_STORAGE_KEY = "webtoe_edu_progress";

function loadProgress(): Record<string, boolean> {
  try { const raw = localStorage.getItem(EDU_STORAGE_KEY); return raw ? JSON.parse(raw) : {}; }
  catch { return {}; }
}

function saveProgress(data: Record<string, boolean>): void {
  try { localStorage.setItem(EDU_STORAGE_KEY, JSON.stringify(data)); } catch {}
}

function toggleExercise(id: string): boolean {
  const data = loadProgress();
  const newVal = !data[id];
  data[id] = newVal;
  saveProgress(data);
  return newVal;
}interface TutorialDef {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: "basico" | "intermedio" | "avanzado";
  url: string;
}

const TUTORIALS: TutorialDef[] = [
  {id:"01-hello-noise",name:"Hello Noise",description:"Crea tu primer noise TOP.",category:"TOP",difficulty:"basico",url:"examples/01-hello-noise.webtoe.json"},
  {id:"02-feedback-trails",name:"Feedback Trails",description:"Construye bucles de feedback.",category:"TOP",difficulty:"basico",url:"examples/02-feedback-trails.webtoe.json"},
  {id:"03-lfo-garden",name:"LFO Garden",description:"Explora formas de onda LFO.",category:"CHOP",difficulty:"basico",url:"examples/03-lfo-garden.webtoe.json"},
  {id:"04-webcam-displace",name:"Webcam Displace",description:"Usa webcam para desplazar texturas.",category:"TOP",difficulty:"intermedio",url:"examples/04-webcam-displace.webtoe.json"},
  {id:"05-chop-playground",name:"CHOP Playground",description:"Laboratorio de operadores CHOP.",category:"CHOP",difficulty:"basico",url:"examples/05-chop-playground.webtoe.json"},
  {id:"06-sketch-voronoi",name:"Sketch Voronoi",description:"Renderiza diagramas de Voronoi.",category:"TOP",difficulty:"intermedio",url:"examples/06-sketch-voronoi.webtoe.json"},
  {id:"07-sketch-fractals",name:"Sketch Fractals",description:"Genera fractales iterativos.",category:"TOP",difficulty:"intermedio",url:"examples/07-sketch-fractals.webtoe.json"},
  {id:"09-showcase",name:"Showcase",description:"Demo completa del ecosistema.",category:"General",difficulty:"avanzado",url:"examples/09-showcase.webtoe.json"},
  {id:"10-3d-lines",name:"3D Lines",description:"Renderiza lineas 3D.",category:"SOP/3D",difficulty:"intermedio",url:"examples/10-3d-lines.webtoe.json"},
  {id:"12-glsl-deformation",name:"GLSL Deformation",description:"Shaders GLSL para deformar.",category:"TOP",difficulty:"avanzado",url:"examples/12-glsl-deformation.webtoe.json"},
  {id:"13-feedback-lfo",name:"Feedback + LFO",description:"Feedback loops con modulacion LFO.",category:"TOP/CHOP",difficulty:"intermedio",url:"examples/13-feedback-lfo.webtoe.json"},
  {id:"14-boids-flocking",name:"Boids Flocking",description:"Simula flocking con SOPs.",category:"SOP",difficulty:"avanzado",url:"examples/14-boids-flocking.webtoe.json"},
  {id:"15-3d-instanced",name:"3D Instanced",description:"Instancing 3D con CHOPs.",category:"SOP/3D",difficulty:"avanzado",url:"examples/15-3d-instanced.webtoe.json"},
];
export class EducationPanel {
  private container!: HTMLDivElement;
  private visible = false;
  private toggleBtn!: HTMLButtonElement;
  private editorApp: EditorApp;
  private opts: Required<EducationOptions>;
  private activeTab = "Glosario";

  constructor(editorApp: EditorApp, opts: EducationOptions = {}) {
    this.editorApp = editorApp;
    this.opts = { width: opts.width ?? 380 };
    this.createUI();
    this.bindKeyboard();
  }

  private createUI(): void {
    this.injectStyles();
    this.createToggleButton();
    this.createPanel();
  }

  private injectStyles(): void {
    const styleId = "wt-edu-styles";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = '.wt-edu-toggle { position: fixed; top: 50%; right: 0; transform: translateY(-50%); z-index: 10000; background: #1e1e28; border: 1px solid #333; border-right: none; border-radius: 8px 0 0 8px; color: #aaa; font-size: 18px; padding: 12px 6px; cursor: pointer; writing-mode: vertical-rl; text-orientation: mixed; transition: background 0.2s, color 0.2s; } .wt-edu-toggle:hover { background: #2a2a36; color: #fff; } .wt-edu-panel { position: fixed; top: 0; right: 0; height: 100%; background: #1e1e28; border-left: 1px solid #333; z-index: 9999; overflow-y: auto; font-family: system-ui, -apple-system, sans-serif; font-size: 13px; color: #ccc; } .wt-edu-panel.hidden { display: none; } .wt-edu-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #333; } .wt-edu-header h3 { margin: 0; font-size: 15px; color: #fff; } .wt-edu-close { background: none; border: none; color: #888; cursor: pointer; font-size: 18px; padding: 4px; line-height: 1; } .wt-edu-close:hover { color: #fff; } .wt-edu-tabs { display: flex; border-bottom: 1px solid #333; background: #16161e; } .wt-edu-tab { flex: 1; padding: 8px; text-align: center; cursor: pointer; font-size: 12px; color: #888; border: none; background: none; transition: color 0.2s, background 0.2s; } .wt-edu-tab:hover { color: #ccc; background: #1e1e28; } .wt-edu-tab.active { color: #fff; background: #1e1e28; } .wt-edu-body { padding: 12px 16px; } .wt-edu-section { margin-bottom: 16px; } .wt-edu-search { width: 100%; padding: 8px 10px; margin-bottom: 12px; background: #16161e; border: 1px solid #444; border-radius: 6px; color: #ccc; font-size: 13px; outline: none; box-sizing: border-box; } .wt-edu-search:focus { border-color: #5b9cf5; } .wt-edu-family { margin-bottom: 12px; } .wt-edu-family-header { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; padding: 4px 8px; border-radius: 4px; display: inline-block; } .wt-edu-opcard { display: flex; flex-direction: column; padding: 8px 10px; margin-bottom: 4px; background: #16161e; border-radius: 6px; cursor: pointer; transition: background 0.15s; } .wt-edu-opcard:hover { background: #2a2a36; } .wt-edu-opcard-header { display: flex; align-items: center; gap: 8px; } .wt-edu-opcard-label { font-weight: 600; color: #eee; font-size: 13px; } .wt-edu-opcard-type { font-size: 11px; color: #888; font-family: monospace; } .wt-edu-opcard-badge { font-size: 10px; padding: 1px 5px; border-radius: 3px; font-weight: 600; color: #fff; margin-left: auto; } .wt-edu-opcard-params { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; } .wt-edu-opparam { font-size: 10px; padding: 1px 5px; background: #1e1e28; border-radius: 3px; color: #999; font-family: monospace; } .wt-edu-null { text-align: center; color: #666; padding: 24px; font-size: 14px; }';    document.head.appendChild(style);
  }

  private createToggleButton(): void {
    this.toggleBtn = document.createElement("button");
    this.toggleBtn.className = "wt-edu-toggle";
    this.toggleBtn.textContent = "Edu";
    this.toggleBtn.addEventListener("click", () => this.toggle());
    document.body.appendChild(this.toggleBtn);
  }

  private createPanel(): void {
    this.container = document.createElement("div");
    this.container.style.width = this.opts.width + "px";
    this.container.className = "wt-edu-panel";
    const header = document.createElement("div");
    header.className = "wt-edu-header";
    const title = document.createElement("h2");
    title.textContent = "Education";
    const closeBtn = document.createElement("button");
    closeBtn.className = "wt-edu-close";
    closeBtn.textContent = "X";
    closeBtn.addEventListener("click", () => this.hide());
    header.appendChild(title);
    header.appendChild(closeBtn);
    this.container.appendChild(header);
    const tabs = document.createElement("div");
    tabs.className = "wt-edu-tabs";
    for (const tabName of ["Glosario", "Tutoriales", "Ejercicios", "Progreso"]) {
      const tab = document.createElement("button");
      tab.className = "wt-edu-tab" + (tabName === "Glosario" ? " active" : "");
      tab.textContent = tabName;
      tab.addEventListener("click", () => this.switchTab(tabName));
      tabs.appendChild(tab);
    }
    this.container.appendChild(tabs);
    const body = document.createElement("div");
    body.className = "wt-edu-body";
    body.innerHTML = [
      "<div class='wt-edu-section'><h3>Glosario de Operadores</h3><p>Proximamente: fichas auto-generadas.</p></div>",
      "<div class='wt-edu-section'><h3>Tutoriales</h3><p>Proximamente: lecciones interactivas.</p></div>",
      "<div class='wt-edu-section'><h3>Ejercicios</h3><p>Proximamente: ejercicios practicos.</p></div>",
      "<div class='wt-edu-section'><h3>Progreso</h3><p>Proximamente: skilltree y badges.</p></div>",
    ].join("");
    this.container.appendChild(body);
    document.body.appendChild(this.container);
  }

  private renderGlossary(): void {
    const body = document.getElementById('wt-edu-body');
    if (!body) return;
    const ops = allOps();
    const query = (document.getElementById('wt-edu-search') as HTMLInputElement)?.value?.toLowerCase() || '';
    const families = ['TOP', 'CHOP', 'SOP', 'MAT', 'COMP', 'DAT', 'POP'] as const;
    
    let html = '';
    for (const fam of families) {
      const famOps = ops.filter(o => o.family === fam && (!query || o.type.toLowerCase().includes(query) || (o.label || '').toLowerCase().includes(query)));
      if (famOps.length === 0) continue;
      const color = FAMILY_COLORS[fam] || '#888';
      html += '<div class="wt-edu-section">';
      html += '<h3 style="color:' + color + '">' + fam + ' (' + famOps.length + ')</h3>';
      html += '<div class="wt-edu-opgrid">';
      // Sort: prioritize label match, then type match
      famOps.sort((a, b) => (a.label || a.type).localeCompare(b.label || b.type));
      for (const op of famOps) {
        html += this.renderOpCard(op, color);
      }
      html += '</div></div>';
    }
    
    if (html === '') {
      html = '<div class="wt-edu-section" style="padding:24px;text-align:center;color:#666"><p>Sin resultados para: ' + query + '</p></div>';
    }
    body.innerHTML = html;
  }

  private renderOpCard(op: OpSpec, color: string): string {
    const label = op.label || op.type.split(':')[1] || op.type;
    const paramLines = op.params.slice(0, 5).map(p => {
      let info = p.key;
      if (p.type) info += ': ' + p.type;
      if (p.default !== undefined) info += ' = ' + JSON.stringify(p.default);
      if (p.min !== undefined && p.max !== undefined && p.min !== p.max) info += ' [' + p.min + '..' + p.max + ']';
      return info;
    });
    const paramCount = op.params.length;
    const extra = paramCount > 5 ? '... +' + (paramCount - 5) + ' more' : '';
    
    return [
      '<div class="wt-edu-opcard" style="border-left: 3px solid ' + color + '">',
      '<div class="wt-edu-opname">' + label + '</div>',
      '<div class="wt-edu-optype">' + op.type + '</div>',
      '<div class="wt-edu-opparams">',
      paramLines.map(l => '<span class="wt-edu-opparam">' + l + '</span>').join(' '),
      extra ? '<span class="wt-edu-opparam wt-edu-opmore">' + extra + '</span>' : '',
      '</div>',
      '<div class="wt-edu-opinputs">' + (op.inputs.min === 0 && op.inputs.max === 0 ? '' : op.inputs.min + '-' + op.inputs.max + ' inputs') + '</div>',
      '</div>',
    ].join('\n');
  }

    renderTutorials(): void {
    const b = document.getElementById("wt-edu-content");
    if (!b) return;
    const g: Record<string, TutorialDef[]> = {};
    for (const t of TUTORIALS) { if (!g[t.category]) g[t.category] = []; g[t.category].push(t); }
    const dc: Record<string, string> = {basico:"#4caf50",intermedio:"#ff9800",avanzado:"#f44336"};
    const order = ["TOP","CHOP","SOP","TOP/CHOP","SOP/3D","General"];
    let h = "<div class='''wt-edu-section''>" + "<h3>Tutoriales</h3>";
    for (const cat of order) {
      const items = g[cat];
      if (!items || !items.length) continue;
      h += "<div class='''wt-edu-family''><div class='''wt-edu-family-header''>" + cat + "</div>";
      for (const t of items) {
        h += "<div class='''wt-edu-opcard'' data-url='" + t.url + "' data-name='" + t.name + "'><div class='''wt-edu-opcard-header''>"
          + "<span class='''wt-edu-opcard-label''>" + t.name + "</span>"
          + "<span class='''wt-edu-opcard-badge'' style='background:" + (dc[t.difficulty] || "#888") + "'>" + t.difficulty + "</span></div>"
          + "<div style='font-size:11px;color:#999;margin-top:4px;'>" + t.description + "</div></div>";
      }
      h += "</div>";
    }
    h += "</div>";
    b.innerHTML = h;
    for (const card of b.querySelectorAll("[data-url]")) {
      card.addEventListener("click", () => {
        const a = this.editorApp as any;
        if (a.loadExample) a.loadExample(card.getAttribute("data-url"), card.getAttribute("data-name"));
      });
    }
  }


  renderExercises(): void {
    const b = document.getElementById("wt-edu-content");
    if (!b) return;
    const prog = loadProgress();
    const dc = {facil:"#4caf50",medio:"#ff9800",dificil:"#f44336"};
    const groups: Record<string, ExerciseDef[]> = {};
    for (const ex of EXERCISES) { if (!groups[ex.family]) groups[ex.family] = []; groups[ex.family].push(ex); }
    const famOrder = ["TOP","CHOP","SOP","DAT","COMP"];
    let h = "<div class='wt-edu-section'><h3>Ejercicios</h3><p style='color:#888;font-size:12px;margin-bottom:12px;'>Completa ejercicios y marcalos como realizados.</p>";
    for (const fam of famOrder) {
      const items = groups[fam];
      if (!items || !items.length) continue;
      h += "<div class='wt-edu-family'><div class='wt-edu-family-header'>" + fam + "</div>";
      for (const ex of items) {
        const done = prog[ex.id] || false;
        h += "<div class='wt-edu-opcard' data-id='" + ex.id + "'>" +
          "<div class='wt-edu-opcard-header'>" +
          "<span class='wt-edu-opcard-label'>" + (done ? String.fromCharCode(10003) + " " : "") + ex.title + "</span>" +
          "<span class='wt-edu-opcard-badge' style='background:" + (dc[ex.difficulty] || "#888") + "'>" + ex.difficulty + "</span>" +
          "</div>" +
          "<div style='font-size:11px;color:#999;margin-top:4px;'>" + ex.description + "</div>" +
          "<div style='font-size:10px;color:#555;margin-top:6px;'>" +
          "<span class='ex-toggle' style='cursor:pointer;color:" + (done ? "#4caf50" : "#5b9cf5") + "' data-id='" + ex.id + "'>" + (done ? "Completado" : "Marcar completado") + "</span>" +
          "<span class='ex-hint' style='cursor:pointer;color:#888;margin-left:12px;' data-id='" + ex.id + "'>Pista</span>" +
          "</div>" +
          "<div class='ex-hint-text' style='font-size:10px;color:#555;margin-top:2px;display:none;' data-id='" + ex.id + "'>" + ex.hint + "</div>" +
        "</div>";
      }
      h += "</div>";
    }
    h += "</div>";
    b.innerHTML = h;
    // Event delegation
    b.onclick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("ex-toggle")) {
        const id = target.getAttribute("data-id") || "";
        const done = toggleExercise(id);
        target.textContent = done ? "✓ Completado" : "Marcar completado";
        target.style.color = done ? "#4caf50" : "#5b9cf5";
      } else if (target.classList.contains("ex-hint")) {
        const id = target.getAttribute("data-id") || "";
        const hint = b.querySelector('.ex-hint-text[data-id="' + id + '"]') as HTMLElement;
        if (hint) hint.style.display = hint.style.display === "none" ? "block" : "none";
      }
    };  }

  renderProgress(): void {
    const b = document.getElementById("wt-edu-content");
    if (!b) return;
    const prog = loadProgress();
    const done = Object.values(prog).filter(Boolean).length;
    const total = EXERCISES.length;
    const pct = total > 0 ? Math.round(done / total * 100) : 0;
    const opsCount = allOps().length;
    let h = "<div class='wt-edu-section'><h3>Progreso</h3>";
    h += "<div style='display:flex;flex-wrap:wrap;gap:8px;margin:16px 0'>";
    h += "<div style='flex:1;min-width:100px;background:#16161e;border-radius:6px;padding:12px;text-align:center'><div style='font-size:24px;font-weight:700;color:#5b9cf5'>" + opsCount + "</div><div style='font-size:11px;color:#888'>Operadores</div></div>";
    h += "<div style='flex:1;min-width:100px;background:#16161e;border-radius:6px;padding:12px;text-align:center'><div style='font-size:24px;font-weight:700;color:#ff9800'>" + TUTORIALS.length + "</div><div style='font-size:11px;color:#888'>Tutoriales</div></div>";
    h += "<div style='flex:1;min-width:100px;background:#16161e;border-radius:6px;padding:12px;text-align:center'><div style='font-size:24px;font-weight:700;color:#4caf50'>" + done + "/" + total + "</div><div style='font-size:11px;color:#888'>Ejercicios</div></div>";
    h += "</div>";
    h += "<div style='margin-bottom:16px'><div style='display:flex;justify-content:space-between;font-size:11px;color:#888;margin-bottom:4px'><span>Progreso general</span><span>" + pct + "%</span></div>";
    h += "<div style='height:6px;background:#16161e;border-radius:3px;overflow:hidden'><div style='height:100%;width:" + pct + "%;background:linear-gradient(90deg,#5b9cf5,#4caf50);border-radius:3px;transition:width 0.3s'~</div></div></div>";
    h += "<h4 style='color:#ccc;font-size:13px;margin-bottom:8px;margin-top:16px'>Ejercicios completados</h4>";
    const completed = EXERCISES.filter(e => prog[e.id]);
    if (!completed.length) { h += "<p style='color:#666;font-size:12px'>Ve a la pestana Ejercicios para empezar.</p>"; }
    else { for (const ex of completed) { h += "<div style='font-size:12px;color:#4caf50;padding:4px 0'>" + String.fromCharCode(10003) + " " + ex.title + "</div>"; } }
    h += "</div>";
    b.innerHTML = h;
  }
bindKeyboard(): void {
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === "E") {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  private switchTab(tabName: string): void {
    const tabs = this.container.querySelector(".wt-edu-tabs");
    if (!tabs) return;
    for (const tab of tabs.children) {
      (tab as HTMLElement).classList.toggle("active", tab.textContent === tabName);
    }
    this.activeTab = tabName;
    const body = document.getElementById("wt-edu-content");
    if (!body) return;
    switch (tabName) {
      case "Glosario": this.renderGlossary(); break;
      case "Tutoriales": this.renderTutorials(); break;
      case "Ejercicios": this.renderExercises(); break;
      case "Progreso": this.renderProgress(); break;
    }
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  show(): void {
    this.visible = true;
    this.container.classList.add("open");
    this.toggleBtn.style.display = "none";
  }

  hide(): void {
    this.visible = false;
    this.container.classList.remove("open");
    this.toggleBtn.style.display = "";
  }
}
