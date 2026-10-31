---
name: tutorial-video
description: Produce un video tutorial de Processflow Architect manejando la UI real — guion por bloques, voz (edge-tts gratis u OpenAI), grabación con Puppeteer al ritmo de la voz, zoom a lo importante, subtítulos, efectos y música — y entrega título y descripción para YouTube. Úsalo cuando el usuario pida "hacé un video tutorial", "grabá un demo de la app", "video para YouTube", "explicá esta función en video" o "rehacé el tutorial con la UI nueva".
---

# Video tutorial de Processflow Architect

Eres guionista y editor. El video lo GRABA la app real (`next dev` + Puppeteer) con
el proyecto de ejemplo de `scripts/demo-seed.ts`; vos escribís el guion, la escena y
verificás el resultado. No inventes funciones: sólo se narra lo que la escena muestra.

Arnés: `alcance → guion → voz → escena → ensayo → grabación → post → verificar → entregar`.

Herramientas (en `scripts/tutorial/`):

| Archivo | Qué hace |
|---|---|
| `voz.sh <guion.txt> <dir> [voz]` | un mp3 por párrafo en `<dir>/voz/bNN.mp3` (`TTS=edge` gratis por defecto · `TTS=openai`) |
| `kit.ts` | primitivas de la escena: `voz(i)`, `say`, `card`, `zoom/unzoom`, `click`, `clickText`, `type`, `dragTile`, `nodeBox`, `goto`, `callar`, `terminar` |
| `escenas/recorrido.ts` + `.guion.txt` | ejemplo completo (~4 min, toda la app). Copialo para una escena nueva |
| `post.py <dir>` | zoom + subtítulos ASS + voz/efectos/música → `<dir>/tutorial.mp4` |

Salidas en `tutorial-out/<slug>/` (gitignorado). Requisitos: `ffmpeg` con libass,
Chrome, `edge-tts` (`pip3 install -U edge-tts`), `numpy` y `scipy`.

## 0 · Alcance (preguntar UNA vez, con opciones)

- **Qué cubre:** recorrido completo (la escena de ejemplo) o una función puntual.
- **Duración:** ≤ 5 min un recorrido; 30–90 s una función.
- **Voz:** edge-tts gratis (Salomé ♀ / Gonzalo ♂, es-CO) — recomendado para uso
  interno — u OpenAI (uso comercial, ~US$0,015/min, usa `OPENAI_API_KEY`).
- **Extras:** subtítulos y música van por defecto; preguntá sólo si quieren quitarlos.

## 1 · Guion (`<slug>.guion.txt`)

- Un párrafo = un bloque = un `voz(i)` de la escena. Líneas con `#` son notas.
- **Cuenta una historia, no lista funciones:** problema → caso concreto (el
  marketplace de seguros del ejemplo) → qué hace la app → cierre con una idea.
- Frases cortas; 15–40 palabras por bloque (≈ 2,3 palabras/s). Tú, español neutro.
- Siglas que el TTS lee mal se escriben como se dicen: «M C P», «inteligencia artificial».
- Los subtítulos (`say`) NO repiten la voz: son la frase clave (≤ 7 palabras) + detalle opcional.
- Mostralo al humano y esperá aprobación antes de generar la voz.

## 2 · Voz

```bash
scripts/tutorial/voz.sh scripts/tutorial/escenas/<slug>.guion.txt tutorial-out/<slug>
```

Si edge-tts devuelve 403, está desactualizado: `pip3 install -U edge-tts` (avisá al humano).

## 3 · Escena (`scripts/tutorial/escenas/<slug>.ts`)

Partí de `recorrido.ts`. Reglas que costaron aprenderse:

- **La voz marca el ritmo:** `await t.voz(i)` al empezar cada bloque; antes de cambiar
  de pantalla, `await t.callar()` (si no, la frase se corta con el `goto`).
- **Zoom con intención:** `t.zoom(x, y, z)` cuando el ojo tiene que ir a algo chico
  (menú, ficha, paleta, texto que se escribe) y `t.unzoom()` al volver al panorama.
  z entre 1,5 y 1,9: más allá el texto se ve borroso (la grabación es 1440×900).
- **Doble clic:** sobre el TEXTO de un nodo edita en línea; en el borde de la caja abre
  la ficha (`nodeBox(...)`, clic en `y + h - 8`).
- **Paleta → lienzo:** `t.dragTile(tipo, x, y)` (el arrastre nativo cuelga en headless).
- **Selects de Radix:** clic real para abrir y typeahead (`t.type(...)` + Enter).
- **Lo que necesita IA real no se muestra funcionando** (no hay WebGPU en headless):
  se muestra el panel y se escribe el pedido, sin enviarlo.
- Selectores por `title`/`aria-label` o texto visible; nada de clases de Tailwind.

## 4 · Ensayo y grabación

```bash
npm run dev                                                   # otra terminal; esperar «Ready»
REC=0 npx tsx scripts/tutorial/escenas/<slug>.ts tutorial-out/<slug>   # ensayo: sin video
npx tsx scripts/tutorial/escenas/<slug>.ts tutorial-out/<slug>         # graba raw.webm + timeline
```

Si un paso falla en el ensayo, leé el error real (selector o texto que no apareció) y
corregí la escena; no subas los `wait` a ciegas. Compilá las rutas antes (abrí `/`,
`/settings`, etc. una vez): la primera compilación de `next dev` puede pasar el timeout.

## 5 · Posproducción

```bash
python3 scripts/tutorial/post.py tutorial-out/<slug>      # → tutorial-out/<slug>/tutorial.mp4
```

Opciones: `--sin-musica`, `--sin-subs`, `--fx-db 4` (efectos más presentes).

## 6 · Verificar ANTES de entregar

1. **Cuadros en cada zoom:** extraé un cuadro ~1,3 s después de cada foco
   (`timeline.json` → `zooms`) y miralos en un mosaico: ¿se ve lo que la voz nombra?
2. **Sincronía:** cada `vs[i]` (inicio de voz) cae junto al subtítulo de su bloque.
3. **Volumen:** `ffmpeg -i tutorial.mp4 -af ebur128 -f null -` → integrado ≈ -16 LUFS.
4. No escuchás el audio: decíselo al humano y pedile que lo revise.

## 7 · Entregar

- Ruta del `.mp4` (copiá a `~/Downloads/` si lo pide) y del guion.
- **Título para YouTube** (2–3 opciones, ≤ 70 caracteres) y **descripción**: gancho de
  una línea, qué se ve, capítulos con tiempos sacados de `timeline.json → vs`
  (redondeados), el link del repo y «Voz generada por IA».
- edge-tts no es oficial para uso comercial: si el video va a clientes, sugerí OpenAI.
