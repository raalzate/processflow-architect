/**
 * Banco de EVALUACIÓN del agente con y sin grafo (spec 027 · T28, SC-002; #765) — FUERA del gate.
 *
 *   npx tsx scripts/eval-ontology-agent.ts --endpoint http://localhost:1234/v1 --model gemma-4-e4b-it \
 *       --runs 5 --temperature 0.7 --out eval.json
 *   npx tsx scripts/eval-ontology-agent.ts --cmd "ollama run gemma3:4b"   # cualquier CLI stdin→stdout
 *   npx tsx scripts/eval-ontology-agent.ts --listar                        # sólo el banco y lo esperado
 *
 * 30 preguntas sobre el proyecto de referencia «Pedidos», en tres modos:
 * - `sin`: el contexto de antes de la 027, las vistas en TOON;
 * - `con`: lo mismo más el subgrafo del foco con lo deducido (lo que arma `buildContext`);
 * - `solo`: SÓLO el subgrafo del foco, con las vistas en TOON de respaldo si la
 *   pregunta no nombra nada del modelo. Mide si un contexto chico alcanza (menos
 *   tokens ⇒ más tareas caben en local).
 *
 * Reporta exactitud (media y rango entre corridas), respuestas con elementos
 * inexistentes, tokens y latencia, y McNemar exacto por pares entre modos sobre
 * el voto de mayoría de las corridas (criterio en `src/lib/ai/eval-ontology.ts`).
 * `--out` guarda prompts, respuestas y puntajes: una corrida que no se guarda no
 * se puede auditar (el falso positivo de la 17 en #697 quedó sin verificar).
 *
 * Lo ESPERADO no está escrito a mano: sale de la API pura del grafo, así el
 * banco no se desincroniza del fixture. Las preguntas sin respuesta en el
 * modelo esperan «desconocido».
 *
 * `--endpoint` es cualquier API compatible con OpenAI (LM Studio, Ollama): da
 * tokens reales. `--cmd` sigue sirviendo para un CLI; ahí los tokens se estiman
 * (caracteres / 4). Se mide con un modelo LOCAL, que es lo que importa (FR-035).
 * No va al gate porque necesita un modelo y su resultado varía por corrida.
 *
 * `--reasoning` (por defecto `none`): Gemma 4 en LM Studio piensa antes de
 * contestar y, con el tope de tokens, el pensamiento se comía la respuesta
 * entera (salía vacía). La app (LiteRT-LM) no le pide razonar, así que se mide
 * sin razonamiento salvo que se pida otra cosa.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { graphToToon } from "../src/lib/ai/graph-toon";
import {
  describirNumeros,
  mcnemarExacto,
  puntuar,
  resumirCorridas,
  vocabularioEvaluacion,
  type PuntajeRespuesta,
} from "../src/lib/ai/eval-ontology";
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
  // Sólo el paisaje (C4), como dice la pregunta: desde #742 «usa» también lee el
  // «invoca» del Event Storming (Cliente invoca Pagar), que no es lo preguntado.
  {
    pregunta: "¿Qué usa la Persona Cliente en el paisaje de sistemas?",
    esperado: () => nombres(consultarPorNombre(k, [["Cliente", "usa", "?x"]]).filas.map((f) => f.x).filter((x) => x.includes("/v-c4/"))),
  },
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
const ELEMENTOS = [...new Set(k.elementos.map((e) => e.nombre))];

const contextoBase = vistas.map((v) => `### Vista ${v.name} (${v.notation}, TOON)\n${graphToToon(v.graph)}`).join("\n\n");

type Modo = "sin" | "con" | "solo";
const MODOS: Modo[] = ["sin", "con", "solo"];

const INSTRUCCION = [
  "Contestá la pregunta SÓLO con lo que dice el modelo de abajo, en una o dos frases, nombrando los elementos tal como se llaman.",
  "Si el modelo no lo dice, contestá «desconocido en el modelo».",
].join("\n\n");

/** El prompt de cada modo y si `solo` tuvo que caer a las vistas por falta de foco. */
function prompt(pregunta: string, modo: Modo): { texto: string; respaldo: boolean } {
  const foco = modo === "sin" ? [] : focoDeTexto(k, pregunta);
  const grafo = foco.length ? `### Conocimiento alrededor de lo que se pregunta (grafo · TOON)\n${LEYENDA_CONOCIMIENTO}\n${contextoParaIA(k, foco)}` : "";
  const respaldo = modo === "solo" && !grafo;
  const contexto = modo === "solo" ? grafo || contextoBase : [contextoBase, grafo].filter(Boolean).join("\n\n");
  return { texto: [INSTRUCCION, contexto, `Pregunta: ${pregunta}`].join("\n\n"), respaldo };
}

interface Llamada {
  respuesta: string;
  tokensEntrada: number;
  tokensSalida: number;
  /** Tokens que el modelo gastó pensando (0 si no razona o no lo informa). */
  tokensRazonamiento: number;
  /** Los tokens del CLI se estiman: el JSON lo dice para no mezclarlos con los reales. */
  tokensEstimados: boolean;
  ms: number;
}

const estimar = (t: string) => Math.ceil(t.length / 4);

function porCli(cmd: string, texto: string): Llamada {
  const t0 = performance.now();
  const r = spawnSync(cmd, { input: texto, shell: true, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`«${cmd}» terminó con ${r.status}: ${r.stderr}`);
  const respuesta = r.stdout.trim();
  return { respuesta, tokensEntrada: estimar(texto), tokensSalida: estimar(respuesta), tokensRazonamiento: 0, tokensEstimados: true, ms: performance.now() - t0 };
}

async function porApi(endpoint: string, model: string, temperature: number, reasoning: string, texto: string): Promise<Llamada> {
  const t0 = performance.now();
  const res = await fetch(`${endpoint.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature, reasoning_effort: reasoning, max_tokens: 400, messages: [{ role: "user", content: texto }] }),
  });
  if (!res.ok) throw new Error(`${endpoint} respondió ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number; completion_tokens_details?: { reasoning_tokens?: number } } };
  const respuesta = (j.choices[0]?.message.content ?? "").trim();
  const u = j.usage;
  return {
    respuesta,
    tokensEntrada: u?.prompt_tokens ?? estimar(texto),
    tokensSalida: u?.completion_tokens ?? estimar(respuesta),
    tokensRazonamiento: u?.completion_tokens_details?.reasoning_tokens ?? 0,
    tokensEstimados: !u,
    ms: performance.now() - t0,
  };
}

const args = process.argv.slice(2);
const arg = (nombre: string) => {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : undefined;
};
if (BANCO.length !== 30) throw new Error(`El banco debe tener 30 preguntas (tiene ${BANCO.length}).`);

if (args.includes("--listar")) {
  BANCO.forEach((q, i) => {
    const e = q.esperado();
    console.log(`${String(i + 1).padStart(2)}. ${q.pregunta}\n    → ${e.length ? e.join(", ") : "desconocido"}`);
  });
  process.exit(0);
}

const cmd = arg("--cmd");
const endpoint = arg("--endpoint");
const model = arg("--model") ?? "";
const runs = Number(arg("--runs") ?? 1);
const temperature = Number(arg("--temperature") ?? 0);
const reasoning = arg("--reasoning") ?? "none";
const limite = Number(arg("--limite") ?? BANCO.length);
const out = arg("--out");
const modos = (arg("--modos")?.split(",") as Modo[] | undefined) ?? MODOS;
if (!cmd && !endpoint) {
  console.error("Falta --endpoint <url OpenAI-compatible> --model <id> o --cmd \"<CLI stdin→stdout>\". Usá --listar para ver el banco.");
  process.exit(2);
}
if (endpoint && !model) {
  console.error("Con --endpoint hace falta --model (p. ej. gemma-4-e4b-it).");
  process.exit(2);
}
if (modos.some((m) => !MODOS.includes(m))) {
  console.error(`--modos admite ${MODOS.join(",")}.`);
  process.exit(2);
}
const llamar = (texto: string) => (endpoint ? porApi(endpoint, model, temperature, reasoning, texto) : Promise.resolve(porCli(cmd!, texto)));

interface Registro extends Llamada {
  corrida: number;
  pregunta: number;
  modo: Modo;
  esperado: string[];
  respaldo: boolean;
  puntaje: PuntajeRespuesta;
  prompt: string;
}

async function main() {
  const registros: Registro[] = [];
  const banco = BANCO.slice(0, limite);
  for (let corrida = 1; corrida <= runs; corrida++) {
    for (const [n, q] of banco.entries()) {
      const esperado = q.esperado();
      for (const modo of modos) {
        const { texto, respaldo } = prompt(q.pregunta, modo);
        const ll = await llamar(texto);
        const puntaje = puntuar(ll.respuesta, esperado, VOCABULARIO, ELEMENTOS);
        registros.push({ ...ll, corrida, pregunta: n + 1, modo, esperado, respaldo, puntaje, prompt: texto });
        console.log(
          `r${corrida} ${String(n + 1).padStart(2)} ${modo.padEnd(4)} · ${puntaje.acierto ? "OK " : "MAL"} · ${ll.tokensEntrada}→${ll.tokensSalida} tok · ${(ll.ms / 1000).toFixed(1)} s` +
            (respaldo ? " · respaldo TOON" : "") +
            (!ll.respuesta ? " · RESPUESTA VACÍA" : "") +
            (puntaje.faltan.length ? ` · faltan: ${puntaje.faltan.join(", ")}` : "") +
            (puntaje.inexistentes.length ? ` · inexistentes: ${puntaje.inexistentes.join(", ")}` : "")
        );
      }
    }
  }

  const de = (m: Modo) => registros.filter((r) => r.modo === m);
  const resumen: Record<string, unknown> = {};
  console.log(`\n=== ${runs} corrida(s) · ${banco.length} preguntas · temperatura ${temperature} · razonamiento ${reasoning} · ${endpoint ? model : cmd} ===`);
  const vacias = registros.filter((r) => !r.respuesta).length;
  if (vacias) console.log(`⚠ ${vacias} respuesta(s) vacía(s): revisá --reasoning o el tope de tokens antes de leer los números.`);
  for (const m of modos) {
    const rs = de(m);
    const porCorrida = Array.from({ length: runs }, (_, i) => rs.filter((r) => r.corrida === i + 1).map((r) => r.puntaje));
    const c = resumirCorridas(porCorrida);
    const ent = describirNumeros(rs.map((r) => r.tokensEntrada));
    const lat = describirNumeros(rs.map((r) => r.ms));
    resumen[m] = { ...c, tokensEntrada: ent, latenciaMs: lat, respaldos: rs.filter((r) => r.respaldo).length, vacias: rs.filter((r) => !r.respuesta).length };
    console.log(
      `${m.toUpperCase().padEnd(4)} exactitud ${(c.exactitudMedia * 100).toFixed(1)}% [${(c.exactitudMin * 100).toFixed(0)}–${(c.exactitudMax * 100).toFixed(0)}] · ` +
        `inexistentes ${c.inexistentesMedia.toFixed(1)}/${banco.length} · tokens entrada media ${ent.media.toFixed(0)} · latencia p50 ${(lat.p50 / 1000).toFixed(1)} s p95 ${(lat.p95 / 1000).toFixed(1)} s`
    );
  }

  // Voto de mayoría por pregunta: con varias corridas, el par de McNemar es la pregunta, no la llamada.
  const mayoria = (m: Modo) =>
    banco.map((_, n) => {
      const v = de(m).filter((r) => r.pregunta === n + 1);
      return v.filter((r) => r.puntaje.acierto).length * 2 > v.length;
    });
  const pares: [Modo, Modo][] = [["sin", "con"], ["sin", "solo"], ["con", "solo"]];
  const mcnemar: Record<string, unknown> = {};
  for (const [a, b] of pares.filter(([a, b]) => modos.includes(a) && modos.includes(b))) {
    const t = mcnemarExacto(mayoria(a), mayoria(b));
    mcnemar[`${a}-vs-${b}`] = t;
    console.log(`McNemar ${a} vs ${b}: sólo ${a} acierta ${t.soloA} · sólo ${b} acierta ${t.soloB} · p = ${t.p.toFixed(3)}`);
  }

  if (out) {
    writeFileSync(out, JSON.stringify({ fecha: new Date().toISOString(), modelo: endpoint ? model : cmd, temperature, reasoning, runs, preguntas: banco.length, resumen, mcnemar, registros }, null, 2));
    console.log(`\nRespuestas y puntajes en ${out}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
