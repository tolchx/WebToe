# WebToe

**Un motor de flujo de datos nativo para la web, basado en nodos y en tiempo real — conecta operadores en el navegador, al estilo TouchDesigner, e importa tus proyectos existentes de TouchDesigner.**

[![ci](https://github.com/frank890417/WebToe/actions/workflows/ci.yml/badge.svg)](https://github.com/frank890417/WebToe/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![live demo](https://img.shields.io/badge/live-frank890417.github.io%2FWebToe-7c6cff)](https://frank890417.github.io/WebToe/)

**▶ Pruébalo ahora: [frank890417.github.io/WebToe](https://frank890417.github.io/WebToe/)** — sin instalación, funciona completamente en tu navegador.

![WebToe editor ejecutando el ejemplo lfo-garden](docs/media/hero-lfo-garden.png)

WebToe es un motor y editor original construido desde cero para la web. No es un clon ni un puerto de TouchDesigner — implementa el flujo de trabajo (familias de operadores, redes cableadas, parámetros impulsados por expresiones, un bucle de cocina en vivo) de forma nativa sobre **WebGL2 y WebGPU**, con **cero dependencias en tiempo de ejecución** (toda la aplicación es ~90 KB de JS), y lee la estructura de proyectos reales de TouchDesigner a través de la expansión de texto producida por tu propia instalación de TD.

## Novedades

### 🧠 Asistente de IA integrado (Chat → parches)

WebToe ahora incluye un **panel de chat con IA** que convierte lenguaje natural en redes completas de operadores:

- **Ctrl+Shift+A** — abre el panel de chat IA
- Describe lo que quieres en **español o inglés**:
  ```
  "crea un feedback trail con noise y blur"
  "particle system with boids flocking and neighbor detection"
  "un render 3D con geometría instanciada y noise SOP"
  ```
- La IA genera automáticamente un `.webtoe.json` con nodos, conexiones y parámetros
- Un clic en "Create Network" carga la red directamente en el editor

### 🚀 Bridge MCP para Claude Code y herramientas externas

WebToe ahora se conecta con el ecosistema MCP (Model Context Protocol):

```bash
# Iniciar el bridge HTTP para el chat del navegador
node mcp/dist/webtoeBridgeServer.js
# → WebToe MCP Bridge corriendo en http://localhost:3001
```

**Endpoints REST:**
| Endpoint | Descripción |
|----------|-------------|
| `POST /chat` | Lenguaje natural → `.webtoe.json` |
| `POST /resolve` | Resolver nombres de operadores |
| `POST /generate-op` | Generar especificación de operador + shader |
| `GET /health` | Estado del servidor |

**Integración con Claude Code CLI:**
```bash
# El archivo .mcp.json ya está configurado con 3 servidores:
claude mcp add webtoe-mcp     → wt_generate_op, wt_build_network, wt_list_gaps
claude mcp add td-live-mcp    → 80+ herramientas TD en vivo
claude mcp add webtoe-bridge  → API REST para el chat del navegador
```

### 📊 Base de conocimiento TouchDesigner (625 operadores)

WebToe ahora incluye una base de conocimiento masiva extraída del análisis de **96 proyectos reales de TouchDesigner (31,610 operadores)**:

| Familia | Operadores | Estado en WebToe |
|---------|-----------|-------------------|
| **POP** | 102 specs | Listos para R5 (WebGPU compute) con shaders GLSL + parámetros reales |
| **TOP** | 15 nuevos con shaders | blurTOP, edgeTOP, chromaKeyTOP, levelTOP, addTOP, overTOP — GLSL + WGSL |
| **TOP existentes** | 24 | noise, constant, ramp, transform, level, blur, composite, feedback, etc. |
| **CHOP** | 13 | constant, lfo, noise, math, lag, merge, select, switch, speed, par, mouse |
| **SOP** | 19 (R3) | grid, sphere, box, tube, torus, noise, transform, merge, copy, skin, etc. |
| **MAT** | 5 (R3) | constant, lit, line, point sprite, wireframe |
| **COMP** | 5 | container, geometry, camera, light, ambient light |
| **DAT** | 7 | text, table, select, null, in, out |

### 🎯 Ejemplos incluidos (15 proyectos)

Además de los 10 proyectos originales, ahora se incluyen 5 ejemplos avanzados generados desde proyectos reales:

| # | Nombre | Descripción |
|---|--------|-------------|
| 11 | Particle Showcase | Sistema de partículas GPU con fuerzas noise y trails |
| 12 | GLSL Deformation | Shader compute GLSL POP con wave displacement |
| 13 | Feedback + LFO | Feedback trail generativo con LFO modulando transform |
| 14 | Boids Flocking | Algoritmo boids con detección de vecinos y compute shader |
| 15 | 3D Instanced | Pipeline 3D completo: SOP noise → copy instancing → render |

---

## Funciones principales

- **Parchea en vivo en el navegador** — editor de redes con diálogo de creación de operadores (Tab / doble clic: pestañas por familia, cuadrícula con búsqueda), arrastre de cables, jerarquía de contenedores con túneles de entrada/salida, **vistas previas en tiempo real en cada nodo** (un compositor GPU pinta el visor y todas las miniaturas visibles a velocidad de fotogramas completa — sin lecturas de retorno de CPU), y un panel de parámetros con controles deslizantes, menús y **expresiones** por parámetro (`op('lfo1')['chan1']`, `parent().par.speed`, `time.seconds * 0.2`, …).
- **Motor GPU en tiempo real** — bucle de cocina pull-based; los TOPs funcionan como pases GPU, los CHOPs impulsan parámetros; bucles de realimentación, desenfoque separable, composición con 6 modos, desplazamiento, detección de bordes, entrada de cámara web/video/imagen.
- **Dos backend GPU en paridad** — WebGL2 (predeterminado, universal) y WebGPU (`?backend=webgpu`), ambos hablando un contrato de pase agnóstico al backend; la ruta de cómputo de WebGPU está reservada para la futura familia de partículas.
- **Importación de TouchDesigner** — los operadores compatibles funcionan en vivo, todo lo demás se convierte en stubs fieles que preservan nombres, cables, diseño, parámetros y código Python, con un informe honesto. Verificado en proyectos de producción reales.
- **Formato propio versionado** — guardado/carga `.webtoe.json` sin pérdidas con ganchos de migración.

| Estelas de realimentación (impulsadas por ratón) | Ámbito y canales CHOP |
|-----|------|
| ![Ejemplo de estelas de realimentación](docs/media/feedback-trails.png) | ![Entorno CHOP con ámbito en vivo](docs/media/chop-scope.png) |

| Paleta de operadores | Backend WebGPU |
|-----|------|
| ![Paleta de operadores con búsqueda](docs/media/palette.png) | ![Mismo proyecto en el backend WebGPU](docs/media/webgpu.png) |

## Importar tus proyectos de TouchDesigner

![Informe de importación tras importar un proyecto de producción de 213 nodos](docs/media/import-report.png)

Cada instalación de TouchDesigner incluye `toeexpand`, el CLI oficial que convierte un `.toe` binario en texto legible. WebToe consume esa expansión — los archivos de tu proyecto nunca salen de tu máquina, y WebToe no incluye nada de Derivative.

**Suelta archivos en cualquier lugar de la página**: un `.webtoe.json` se carga, una carpeta `.toe.dir` se importa, y un `.toe` sin procesar abre una guía con el comando exacto de `toeexpand` para tu archivo (el contenedor binario es propietario, así que la expansión única se ejecuta con tu propia instalación de TD) más un selector de carpetas para el resultado.

```bash
# opción A — CLI de un paso (encuentra toeexpand en tu instalación local de TD):
node packages/cli/toe-convert.mjs myproject.toe        # → myproject.webtoe.json

# opción B — expande manualmente, luego suelta la carpeta .toe.dir en la página:
"/Applications/TouchDesigner.app/Contents/MacOS/toeexpand" myproject.toe
```

Lo que el importador recupera: tipos y jerarquía de nodos, cables (incluyendo cables a través de límites de COMP y túneles de entrada/salida), valores de parámetros, **expresiones Python en vivo** (traducidas a expresiones WebToe cuando es posible — `absTime.seconds*0.2` → `time.seconds*0.2` — y mantenidas inertes en caso contrario), texto DAT y código fuente Python, y diseño de red. El campo de modo de parámetro es un campo de bits descodificado de archivos de producción (bit 0 = expresión), así que los modos de expresión marcados también se importan.

### Probado, automáticamente

La lectura de `.toe` está cubierta por un conjunto automatizado de dos capas construido sobre un **fixture original confirmado** — un `.toe` binario real más su expansión canónica `toeexpand`, creado para este repositorio y verificado con las herramientas oficiales ([procedencia](tests/fixtures/README.md)):

1. una capa segura para CI afirma el grafo completo reconstruido — tipos, cables a través de COMP y túneles, modos de parámetros, expresiones traducidas evaluadas en el motor, stubs honestos, números del informe;
2. una capa de integración (auto-saltada donde TD no está instalado) expande el binario confirmado con el `toeexpand` real y ejecuta el CLI de principio a fin.

## Conjunto de operadores (v1 + MCP)

| Familia | Operadores |
|---------|-----------|
| **TOP** | constant, noise, ramp, rectangle, transform, level, monochrome, hsv adjust, blur, composite, math, switch, select, reorder, flip, displace, edge, feedback, **render**, **ndi in/out** (a través del bridge local), null, in, out, image in, video in, camera in |
| **CHOP** | constant, lfo, noise, math (pipeline TD completo), lag, merge, select, switch, speed, parameter, mouse in, in, out |
| **SOP** | line, circle, rectangle, grid, sphere, box, tube, torus, merge, transform, noise, copy, skin, add, point, facet, switch, null, in, out |
| **MAT** | constant, lit (phong/pbr), line, point sprite, wireframe, switch, null |
| **COMP** | container, **geometry** (redes SOP, materiales, instanciación SOP-point), **camera** (look-at), **light**, **ambient light** |
| **DAT** | text, table, select, null, in, out |
| **POP** (MCP — próximo R5) | 102 operadores con especificaciones completas, parámetros y shaders GLSL compute listos para WebGPU |

Además de operadores stub por familia utilizados por el importador. Las expresiones incluyen `time`, `me`, `op()` acceso a canales, y una biblioteca matemática (`sin`, `clamp`, `fract`, `lerp`, `rand(seed)`, …).

## Ejemplos

Diez proyectos incluidos se cargan desde la barra de herramientas y funcionan de inmediato. El buque insignia es **09 showcase** — 27 nodos que ejercitan cada familia a la vez: una capa de cámara web a través de detección de bordes, un COMP caleidoscopio con túneles de entrada/salida, un conmutador de fuente de posición del ratón, desplazamiento por ruido, estelas de realimentación con deriva de tono, y un rig CHOP completo (lag, integrador de velocidad, lector de parámetros, pipeline matemático completo) impulsándolo a través de ocho expresiones en vivo. El más nuevo: **10 3d lines** — el pipeline 3D completo: cintas de líneas skinneadas y esferas instanciadas dispersas por ruido dentro de COMPs de geometría, una cámara look-at en órbita, luces, un TOP de renderizado, y una cadena de post-procesamiento de glow. También: cinco parches 2D creados — **hello noise** (brillo impulsado por expresión), **feedback trails** (mueve tu ratón sobre el visor), **lfo garden** (cadenas de rampa aditivas con deriva de tono), **webcam displace** (permite acceso a cámara; degrada gracefulmente sin una), **chop playground** (selecciona `merge1` para ver el ámbito de canales originales vs. retardados) — y tres **bocetos diarios reales de TouchDesigner 2022 importados a través del pipeline `.toe`** (pseudo-voronoi, feedback fractal, y un estudio CHOP interactivo con el ratón; ligeramente adaptados para la web, por ejemplo, fuentes de película reemplazadas por ruido). Ahora se suman **5 ejemplos avanzados** generados desde proyectos reales con asistencia de IA.

## Inicio rápido (desarrollo)

```bash
npm install
npm run dev        # editor en http://localhost:8643/WebToe/
npm run check      # typecheck + 60 tests
npm run build      # build de producción (apps/web/dist)
```

### Iniciar el asistente IA

```bash
# Terminal 1: WebToe
npm run dev

# Terminal 2: Bridge MCP
node mcp/dist/webtoeBridgeServer.js
# → Abre http://localhost:8643/WebToe/ y presiona Ctrl+Shift+A
```

## Arquitectura

Espacios de trabajo npm con una regla estricta de dependencia descendente — `apps/web → editor → {ops, gpu, io} → core`, donde `core` no importa nada:

| Paquete | Rol |
|---------|-----|
| `@webtoe/core` | modelo de grafo, motor de cocina pull-based, sistema de expresiones, contrato de pase GPU agnóstico al backend, serialización versionada, API pública `registerOp` para plugins |
| `@webtoe/ops` | definiciones de operadores; kernels CHOP detrás de una interfaz preparada para WASM; shaders TOP creados por backend (GLSL **y** WGSL, escritos a mano) |
| `@webtoe/gpu` | backend WebGL2 + backend WebGPU (paridad), pools de texturas, ping-pong de realimentación, miniaturas de lectura asíncrona |
| `@webtoe/io` | importador `.webtoe.json` + salida de `toeexpand` detrás de un adaptador `ProjectLoader` (el formato JSON oficial anunciado por Derivative se inserta a su lado sin cambios en el motor) |
| `@webtoe/editor` | editor embebible, sin framework — `mountEditor(el, opts)` |
| `@webtoe/cli` | `toe-convert.mjs` |
| `@webtoe/webtoe-knowledge` | módulo de conocimiento autónomo con 200+ sinónimos, base de datos de topología, auto-wire — copia y pega directamente en WebToe |

Documentación técnica: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · contrato de ejecución e hitos: [docs/PLAN.md](docs/PLAN.md) · registro de construcción: [docs/WORKLOG.md](docs/WORKLOG.md) · fundamentos de investigación (hallazgos de formato de archivo, viabilidad, fuentes): [docs/RESEARCH.md](docs/RESEARCH.md)

## Hoja de ruta — medida contra trabajo real

Para definir "completo", analizamos **60 proyectos reales de TouchDesigner (28,698 nodos, 2022–2026)** de un portafolio de arte generativo de práctica diaria y rastreamos el **inventario oficial de operadores (~675 operadores en 7 familias)**. Dos documentos impulsan la evolución: **[docs/ROADMAP.md](docs/ROADMAP.md)** (plan por fases con resultados medidos — cobertura del corpus: 32.3% → 47.1% → **62.3%** en dos ciclos de evolución medidos, siendo el segundo el pipeline 3D completo) y **[docs/TD-PARITY.md](docs/TD-PARITY.md)** (la carta de paridad completa: niveles de operadores por familia, clasificación portátil vs. equivalente web vs. solo nativo, y las brechas de concepto del motor — time slicing, audio, 3D, GLSL, POPs, paneles — con el bucle medir→elegir→implementar→verificar).

La base de conocimiento del MCP ahora añade **625 operadores TD indexados** desde el análisis de **96 proyectos reales** (31,610 nodos), acelerando significativamente R4 (GLSL TOP), R5 (POPs) y la expansión general de cobertura de operadores.

## NDI Entrada/Salida

Los navegadores no pueden unirse a redes NDI directamente, así que WebToe empareja dos piezas: un pequeño bridge local (`packages/ndi-bridge`, WebSocket en localhost) que posee el lado NDI con **tu propio runtime NDI**, y los TOPs `ndi in`/`ndi out` que hacen el trabajo de píxeles en el navegador — la conversión UYVY⇄RGBA se ejecuta en un **kernel WASM de 1 KB** (código fuente AssemblyScript en `packages/wasm-kernels`, fallback JS siempre disponible). Pruébalo con cero dependencias NDI: `node packages/ndi-bridge/index.mjs --mock` transmite un patrón de prueba animado; para NDI real, instala el runtime NDI más `grandiose` en el paquete del bridge. NDI® es una marca registrada de Vizrt NDI AB — este repositorio no incluye bits del SDK NDI.

## Para colaboradores y futuros agentes

[docs/HANDOFF.md](docs/HANDOFF.md) es el registro completo del proyecto: cada experimento con su veredicto, las invariantes de la arquitectura, un catálogo de lecciones aprendidas con esfuerzo, la curva de evolución medida, y el orden vigente del trabajo próximo con adelantos de diseño.

## Aviso legal

WebToe es un proyecto independiente de código abierto, **no afiliado ni respaldado por Derivative Inc.** TouchDesigner es una marca registrada de Derivative Inc. WebToe no contiene código, binarios o activos de Derivative; lee la expansión de texto de archivos de proyecto que los usuarios generan localmente con su propia instalación licenciada de TouchDesigner, para interoperabilidad. Todo el código del motor, shaders y diseño de interfaz en este repositorio son trabajo original.

## Licencia

[MIT](LICENSE)
