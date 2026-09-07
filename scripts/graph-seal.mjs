/**
 * @fileOverview La REGLA del sello del índice de graphify, en un solo lugar.
 *
 * Existía dos veces y las dos copias no decían lo mismo: `graph-check.mjs`
 * toleraba un sello viejo si entre él y HEAD no había cambiado nada indexable,
 * y el self-test exigía igualdad exacta de SHA. Como el sello lo escribe el
 * `post-commit` local, después de cada merge de PR —el flujo obligatorio del
 * repo— HEAD es un SHA que ningún post-commit vio, y el gate se ponía rojo sin
 * causa (#259). Encima el remedio que sugería el mensaje (`graph:update`) no
 * escribe el sello, así que no arreglaba nada.
 *
 * Con la regla acá, y con prueba, las dos señales no pueden volver a discrepar
 * —pero sólo si las DOS la llaman: tener la función y no usarla desde
 * `graph-check.mjs` dejaba la divergencia intacta con un comentario diciendo
 * que no existía.
 *
 * Lo que importa no es que el sello sea HEAD: es que el índice responda por el
 * árbol indexable de HEAD.
 */

/** Rutas cuyo cambio obliga a reindexar: lo que graphify sabe leer. */
export const RUTAS_INDEXABLES = ["*.ts", "*.tsx", "*.js", "*.mjs", "*.md"];

/**
 * ¿El índice sirve para HEAD?
 *
 * @param {object} e
 * @param {string} e.sello        SHA sellado (`""` si no hay sello).
 * @param {string} e.head         SHA de HEAD.
 * @param {string[]} e.pendientes Archivos indexables cambiados entre sello y HEAD.
 * @param {boolean} [e.frescoPorReloj] Sólo se mira SIN sello: si el grafo es más
 *   nuevo que el último commit indexable. Es el índice hecho a mano antes de que
 *   el sello existiera, y se acepta por compatibilidad.
 * @param {string} [e.updateCommand] Comando de reindexado, para el mensaje.
 * @returns {{ ok: boolean, motivo: "sellado"|"sin-diff"|"sin-sello-fresco"|"sin-sello"|"atrasado", mensaje: string }}
 */
export function sealVerdict({
  sello,
  head,
  pendientes,
  frescoPorReloj = false,
  updateCommand = "npm run graph:update",
}) {
  const s = (sello ?? "").trim();
  const h = (head ?? "").trim();
  const p = pendientes ?? [];

  if (s && h && s === h) {
    return {
      ok: true,
      motivo: "sellado",
      mensaje: "el índice está sellado para HEAD (frescura por contenido, no por reloj)",
    };
  }
  if (!s) {
    // Sin sello se cae al reloj: es el índice construido a mano antes de que el
    // sello existiera. Es la rama que `graph-check.mjs` ya toleraba, así que
    // exigir sello acá habría puesto las dos señales a discrepar de nuevo.
    return frescoPorReloj
      ? {
          ok: true,
          motivo: "sin-sello-fresco",
          mensaje: "el índice no tiene sello pero es más nuevo que el último commit indexable",
        }
      : {
          ok: false,
          motivo: "sin-sello",
          mensaje: `el índice no tiene sello y es más viejo que el último commit con archivos indexables: reconstruilo con \`${updateCommand}\` (el post-commit deja el sello)`,
        };
  }
  if (p.length === 0) {
    // Sello de otro commit pero árbol indexable idéntico: una consulta
    // contestaría exactamente lo mismo, así que el índice sirve.
    return {
      ok: true,
      motivo: "sin-diff",
      mensaje: "el sello es de otro commit pero no hay diff indexable (merge de PR)",
    };
  }
  return {
    ok: false,
    motivo: "atrasado",
    mensaje: `sello=${s.slice(0, 7)} HEAD=${h.slice(0, 7)} con ${p.length} archivo(s) indexables cambiados (${p.slice(0, 3).join(", ")}${p.length > 3 ? "…" : ""}): corré \`${updateCommand}\``,
  };
}
