/**
 * Banco de EVALUACIÓN del agente con y sin grafo (spec 027 · T28, SC-002) — FUERA del gate.
 *
 *   npx tsx scripts/eval-ontology-agent.ts --cmd "ollama run gemma3:4b"
 *   npx tsx scripts/eval-ontology-agent.ts --listar        # sólo el banco y lo esperado
 *
 * 30 preguntas sobre el proyecto de referencia «Pedidos». Cada una se contesta
 * dos veces: SIN grafo (el contexto de hoy: las vistas en TOON) y CON grafo (el
 * mismo contexto más el subgrafo del foco con lo deducido, que es lo que arma
 * `buildContext` desde la spec 027). Reporta exactitud y respuestas con
 * elementos inexistentes en cada modo (criterio en `src/lib/ai/eval-ontology.ts`).
 *
 * Lo ESPERADO no está escrito a mano: sale de la API pura del grafo, así el
 * banco no se desincroniza del fixture. Las preguntas sin respuesta en el
 * modelo esperan «desconocido».
 *
 * `--cmd` es cualquier comando que lea el prompt por stdin y escriba la
 * respuesta en stdout: un modelo LOCAL, para medir lo que importa (FR-035). No
 * va al gate porque necesita un modelo y su resultado varía por corrida; el
 * número se documenta en un comentario de #697.
 */
import { spawnSync } from "node:child_process";
import { graphToToon } from "../src/lib/ai/graph-toon";
import { puntuar, resumir, vocabularioEvaluacion, type PuntajeRespuesta } from "../src/lib/ai/eval-ontology";
import { PREGUNTAS_COMPETENCIA } from "../src/lib/ontology/competency";
import { construirConocimiento } from "../src/lib/ontology/conocimiento";
import { LEYENDA_CONOCIMIENTO, contextoParaIA, focoDeTexto } from "../src/lib/ontology/context";
import { nombreDe } from "../src/lib/ontology/ficha";
import { camino, consultarPorNombre } from "../src/lib/ontology/query";
import { PROYECTO_PEDIDOS, vistasPedidos } from "../src/lib/ontology/__tests__/fixtures/pedidos";

const vistas = vistasPedidos();
const k = construirConocimiento({ proyecto: PROYECTO_PEDIDOS, vistas }, { tipo: "proyecto" });

const nombres = (ts: string[]) => [...new Set(ts.filter((t) => t.startsWith("kb:")).map((t) => nombreDe(k, t)))];
const consulta = (s: string, p: string, o = "?x") => () => nombres(consultarPorNombre(k, [[s, p, o]]).filas.map((f) => f.x));
const pc = (id: string, args: Record<string, string>, col: string) => () =>
  nombres(PREGUNTAS_COMPETENCIA.find((q) => q.id === id)!.ejecutar(k, args).filas.map((f) => f[col]));
const iriDe = (nombre: string) => k.elementos.find((e) => e.nombre === nombre)?.iri;
const tramo = (desde: string, hasta: string) => () => {
  const d = iriDe(desde);
  const h = iriDe(hasta);
  const c = d && h ? camino(k, d, { hasta: h }) : [];
  return c.length ? nombres(c[0].pasos.map((p) => p.o)) : [];
};
const nada = () => [] as string[];

/** 30 preguntas: relaciones directas, varios saltos, competencia y huecos del modelo. */
const BANCO: { pregunta: string; esperado: () => string[] }[] = [
  { pregunta: "¿Qué eventos termina provocando el comando Pagar, directa o indirectamente?", esperado: pc("PC-01", { comando: "Pagar" }, "evento") },
  { pregunta: "¿Qué eventos provoca FacturarPedido?", esperado: pc("PC-01", { comando: "FacturarPedido" }, "evento") },
  { pregunta: "¿Qué eventos provoca el comando Cancelar?", esperado: pc("PC-01", { comando: "Cancelar" }, "evento") },
  { pregunta: "¿Qué evento dispara Pagar?", esperado: consulta("Pagar", "dispara") },
  { pregunta: "¿Qué política activa PagoRealizado?", esperado: consulta("PagoRealizado", "activa") },
  { pregunta: "¿A qué evento reacciona la política Facturar?", esperado: consulta("Facturar", "reacciona a") },
  { pregunta: "¿Qué comando emite la política Facturar?", esperado: consulta("Facturar", "emite") },
  { pregunta: "¿Quién invoca el comando Pagar?", esperado: consulta("?x", "invoca", "Pagar") },
  { pregunta: "¿Qué termina provocando el Cliente en el Event Storming?", esperado: consulta("Cliente", "provoca") },
  { pregunta: "¿Cómo se llega de Pagar a FacturaEmitida? Nombrá cada paso.", esperado: tramo("Pagar", "FacturaEmitida") },
  // No «cómo se llega de Cobrar al fin»: hay dos ramas igual de válidas y lo esperado no puede depender de cuál elige el BFS.
  { pregunta: "¿Por qué compuerta pasa el cobro justo después de la tarea Cobrar?", esperado: consulta("Cobrar", "fluye a") },
  { pregunta: "¿Qué tareas siguen a la compuerta ¿Aprobado??", esperado: consulta("¿Aprobado?", "fluye a") },
  { pregunta: "¿Qué ocurre después de Pedido recibido, en cualquier número de pasos?", esperado: consulta("Pedido recibido", "precede") },
  { pregunta: "¿Qué precede a Pago procesado?", esperado: consulta("?x", "precede", "Pago procesado") },
  { pregunta: "¿De qué depende el sistema Pagos?", esperado: consulta("Pagos", "depende de") },
  { pregunta: "¿Qué se vería afectado si cae la Pasarela?", esperado: pc("PC-07", { sistema: "Pasarela" }, "elemento") },
  { pregunta: "¿Qué sistemas escriben en PagosDB?", esperado: pc("PC-04", { almacen: "PagosDB" }, "elemento") },
  { pregunta: "¿Qué sistemas leen de PagosDB?", esperado: consulta("?x", "lee de", "PagosDB") },
  { pregunta: "¿Qué usa la Persona Cliente en el paisaje de sistemas?", esperado: consulta("Cliente", "usa") },
  { pregunta: "¿Qué actor inicia el flujo de pago y en qué contexto cae?", esperado: () => nombres(PREGUNTAS_COMPETENCIA[1].ejecutar(k).filas.flatMap((f) => Object.values(f))) },
  { pregunta: "¿Qué políticas cruzan de un contexto delimitado a otro?", esperado: pc("PC-05", {}, "politica") },
  { pregunta: "¿Qué elementos desplegables no declaran repositorio o responsable?", esperado: pc("PC-06", {}, "elemento") },
  { pregunta: "¿Qué entidades de datos no están respaldadas por un agregado o almacén?", esperado: pc("PC-08", {}, "entidad") },
  { pregunta: "¿Qué elementos del contexto Pagos son comandos?", esperado: () => nombres(consultarPorNombre(k, [["?x", "pertenece a", "Pagos"], ["?x", "es", "Intención"]]).filas.map((f) => f.x)) },
  { pregunta: "¿Qué hay dentro del Pool Pagos del proceso de cobro?", esperado: () => nombres(consultarPorNombre(k, [["?x", "pertenece a", "?p"], ["?p", "es", "Participante"]]).filas.map((f) => f.x)) },
  { pregunta: "¿A qué sistema externo llama el comando Cancelar?", esperado: nada },
  { pregunta: "¿Qué evento dispara el comando Reembolsar?", esperado: nada },
  { pregunta: "¿Qué política reacciona a FacturaEmitida?", esperado: consulta("?x", "reacciona a", "FacturaEmitida") },
  { pregunta: "¿Qué base de datos usa la Pasarela?", esperado: consulta("Pasarela", "escribe en") },
  { pregunta: "¿Quién es responsable del sistema Pagos?", esperado: nada },
];

// Nombres de elementos más lo que una respuesta correcta puede citar: predicados, tipos, etiquetas (#742).
const VOCABULARIO = vocabularioEvaluacion(k);

const contextoBase = vistas.map((v) => `### Vista ${v.name} (${v.notation}, TOON)\n${graphToToon(v.graph)}`).join("\n\n");

function prompt(pregunta: string, conGrafo: boolean): string {
  const foco = conGrafo ? focoDeTexto(k, pregunta) : [];
  const grafo = foco.length ? `\n\n### Conocimiento alrededor de lo que se pregunta (grafo · TOON)\n${LEYENDA_CONOCIMIENTO}\n${contextoParaIA(k, foco)}` : "";
  return [
    "Contestá la pregunta SÓLO con lo que dice el modelo de abajo, en una o dos frases, nombrando los elementos tal como se llaman.",
    "Si el modelo no lo dice, contestá «desconocido en el modelo».",
    contextoBase + grafo,
    `Pregunta: ${pregunta}`,
  ].join("\n\n");
}

function preguntar(cmd: string, texto: string): string {
  const r = spawnSync(cmd, { input: texto, shell: true, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`«${cmd}» terminó con ${r.status}: ${r.stderr}`);
  return r.stdout.trim();
}

const args = process.argv.slice(2);
if (BANCO.length !== 30) throw new Error(`El banco debe tener 30 preguntas (tiene ${BANCO.length}).`);

if (args.includes("--listar")) {
  BANCO.forEach((q, i) => {
    const e = q.esperado();
    console.log(`${String(i + 1).padStart(2)}. ${q.pregunta}\n    → ${e.length ? e.join(", ") : "desconocido"}`);
  });
  process.exit(0);
}

const i = args.indexOf("--cmd");
const cmd = i >= 0 ? args[i + 1] : undefined;
if (!cmd) {
  console.error('Falta --cmd "<comando que lee el prompt por stdin>" (un modelo local, p. ej. `ollama run gemma3:4b`). Usá --listar para ver el banco.');
  process.exit(2);
}

const puntajes: Record<"sin" | "con", PuntajeRespuesta[]> = { sin: [], con: [] };
BANCO.forEach((q, n) => {
  const esperado = q.esperado();
  for (const modo of ["sin", "con"] as const) {
    const respuesta = preguntar(cmd, prompt(q.pregunta, modo === "con"));
    const p = puntuar(respuesta, esperado, VOCABULARIO);
    puntajes[modo].push(p);
    console.log(
      `${String(n + 1).padStart(2)} ${modo} grafo · ${p.acierto ? "OK " : "MAL"}` +
        (p.faltan.length ? ` · faltan: ${p.faltan.join(", ")}` : "") +
        (p.inexistentes.length ? ` · inexistentes: ${p.inexistentes.join(", ")}` : "")
    );
  }
});

for (const modo of ["sin", "con"] as const) {
  const r = resumir(puntajes[modo]);
  console.log(`\n${modo.toUpperCase()} grafo: exactitud ${(r.exactitud * 100).toFixed(0)}% · ${r.conInexistentes}/${r.preguntas} respuestas con elementos inexistentes`);
}
