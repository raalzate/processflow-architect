/**
 * @fileOverview Resolución de un TIPO escrito a mano contra el registro (PURO).
 *
 * Nació dentro del constructor (`ai/builder-tools.ts`, #331): el modelo escribía
 * «limite de sistema» o «Container» y el arnés lo rechazaba sin más. Vive acá
 * porque ahora lo necesitan dos caminos —el veredicto de una llamada MCP y el
 * parser de Mermaid (#333)— y dos reglas para lo mismo es como nacen los
 * defectos. Sin alias `@/`: `mcp-server/` lo importa bajo tsx.
 *
 * Regla: mayúsculas y acentos se corrigen solos; un parecido CLARO se sugiere;
 * lo que no se parece a nada no se adivina.
 */

/** Sin acentos y en minúsculas: la forma en que se comparan dos tipos escritos por manos distintas. */
export const plano = (t: string) =>
  t
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Distancia de edición, acotada a lo que hace falta para decidir un parecido. */
function distancia(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = fila[j];
      fila[j] = Math.min(
        fila[j] + 1,
        fila[j - 1] + 1,
        anterior + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      anterior = tmp;
    }
  }
  return fila[b.length];
}

/**
 * El tipo válido MÁS PARECIDO al que escribió el modelo, si hay uno claro.
 *
 * El motor local mezcla idiomas: leyó «Contenedor» en la notación y pidió
 * «Container», y el rechazo a secas —«no es un tipo, usá uno de: …»— no le
 * alcanzó para mapearlo: tres turnos seguidos con la misma palabra hasta que la
 * corrida murió (#331). El registro tiene la respuesta; nombrarla cuesta nada.
 *
 * No se sustituye sola: sugerir es seguro, adivinar el tipo de una caja ajena no.
 */
export function tipoParecido(tipo: string, validos: string[]): string | undefined {
  const t = plano(tipo);
  if (!t) return undefined;
  let mejor: { tipo: string; d: number } | undefined;
  for (const v of validos) {
    const p = plano(v);
    const d = distancia(t, p);
    // Un parecido tiene que compartir el arranque y no diferir en más del 40%:
    // sin las dos condiciones «Sistema» sale como sugerencia de cualquier cosa.
    const prefijo = [...p].findIndex((c, i) => c !== t[i]);
    const arranca = prefijo === -1 || prefijo >= 4;
    if (!arranca || d > Math.ceil(Math.max(t.length, p.length) * 0.4)) continue;
    if (!mejor || d < mejor.d) mejor = { tipo: v, d };
  }
  return mejor?.tipo;
}

/**
 * El tipo tal como lo declara la notación. Mayúsculas y acentos los arregla el
 * arnés —«limite de sistema» es el mismo tipo que «Límite de Sistema»— y lo que
 * no se puede arreglar se rechaza con la sugerencia más cercana (#331).
 */
export function normalizarTipo(
  tipo: string,
  validos: string[]
): { tipo: string } | { error: "desconocido"; sugerido?: string } {
  if (validos.includes(tipo)) return { tipo };
  const equivalente = validos.find((v) => plano(v) === plano(tipo));
  if (equivalente) return { tipo: equivalente };
  return { error: "desconocido", sugerido: tipoParecido(tipo, validos) };
}
