/**
 * @fileOverview A qué diagrama se refiere una llamada MCP. PURO.
 *
 * `diagramId` era obligatorio en las 20 herramientas: el agente lo repetía en
 * cada llamada y, cuando se equivocaba de id, el error era «no existe» sin
 * decir cuáles había. Acá vive la única regla de resolución, con su precedencia
 * explícita, para que el servidor no la reinvente por herramienta.
 *
 * Precedencia (de más específico a más general):
 *  1. el `diagramId` que trae la llamada — mandar el id siempre gana;
 *  2. el fijado con `use_diagram` en ESTE workspace (sobrevive reinicios y el
 *     modo HTTP, que es stateless: un servidor por petición, sin memoria);
 *  3. el de la configuración del servidor (`PROCESSFLOW_DIAGRAM` / `--diagram`);
 *  4. si hay UN solo diagrama en el workspace, ese;
 *  5. error que dice qué hay y cómo fijarlo.
 */

export interface ResolucionDiagrama {
  /** Id del diagrama sobre el que actuar. */
  id: string;
  /** De dónde salió (para decirlo en la respuesta cuando no fue explícito). */
  origen: "parametro" | "fijado" | "configuracion" | "unico";
}

export interface EntradaResolucion {
  /** El que trae la llamada. */
  explicit?: string;
  /** El fijado con `use_diagram` (persistido en el workspace). */
  pinned?: string;
  /** El de la configuración del servidor (env o argumento). */
  configured?: string;
  /** Los que existen hoy en el workspace. */
  disponibles: string[];
}

/**
 * Resuelve el diagrama de una llamada. Lanza con un mensaje ACCIONABLE —qué hay
 * y cómo fijarlo— en vez de dejar que falle después al abrir el archivo.
 */
export function resolveDiagramId(entrada: EntradaResolucion): ResolucionDiagrama {
  const { disponibles } = entrada;
  const existe = (id: string | undefined): id is string => !!id && disponibles.includes(id);

  const explicito = entrada.explicit?.trim();
  if (explicito) {
    // Un id explícito que no existe NO cae al fijado: taparlo con otro diagrama
    // haría que el agente edite algo distinto de lo que pidió.
    if (!disponibles.includes(explicito)) throw new Error(noExiste(explicito, disponibles));
    return { id: explicito, origen: "parametro" };
  }
  if (existe(entrada.pinned)) return { id: entrada.pinned, origen: "fijado" };
  if (existe(entrada.configured)) return { id: entrada.configured, origen: "configuracion" };
  if (disponibles.length === 1) return { id: disponibles[0], origen: "unico" };

  throw new Error(sinDiagrama(entrada, disponibles));
}

function lista(disponibles: string[]): string {
  return disponibles.length ? disponibles.map((d) => `"${d}"`).join(", ") : "(ninguno)";
}

function noExiste(id: string, disponibles: string[]): string {
  return `No existe el diagrama "${id}". En el workspace hay: ${lista(
    disponibles
  )}. Usa create_diagram, import_diagram o list_diagrams.`;
}

function sinDiagrama(entrada: EntradaResolucion, disponibles: string[]): string {
  // Un fijado o configurado que ya no existe es una pista, no ruido: dice por
  // qué la llamada sin `diagramId` dejó de funcionar de un día para otro.
  const huerfano =
    entrada.pinned && !disponibles.includes(entrada.pinned)
      ? ` El diagrama fijado ("${entrada.pinned}") ya no está en el workspace.`
      : entrada.configured && !disponibles.includes(entrada.configured)
        ? ` El diagrama de la configuración ("${entrada.configured}") no está en el workspace.`
        : "";

  if (!disponibles.length) {
    return `No hay ningún diagrama en el workspace.${huerfano} Crea uno con create_diagram o trae uno con import_diagram.`;
  }
  return `Hay ${disponibles.length} diagramas y la llamada no dice cuál: ${lista(
    disponibles
  )}.${huerfano} Pasa \`diagramId\`, o fija uno con use_diagram para no repetirlo en cada llamada.`;
}
