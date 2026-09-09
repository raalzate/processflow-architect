/**
 * @fileOverview Freno del FORCE-PUSH que se lleva commits del remoto (PURO + git).
 *
 * Incidente (2026-09-09): el agente rebasaba una rama mientras el humano mergeaba
 * un PR DENTRO de esa misma rama. La versión reescrita no contenía ese merge, y el
 * push iba a borrarlo. Lo frenó `--force-with-lease` («stale info»), no el arnés.
 *
 * La regla de `bash.deny` que ya existía cubre `--force` sin lease. El hueco es el
 * otro caso: con la referencia de seguimiento FRESCA, el lease deja pasar —
 * porque el lease sólo pregunta «¿el remoto está donde yo creo?», no «¿estoy
 * tirando trabajo?»—. Acá se pregunta lo segundo: si `origin/<rama>` tiene commits
 * que la rama local no tiene, empujar los borra.
 *
 * Se mide contra la REFERENCIA DE SEGUIMIENTO, sin red: el hook corre en cada
 * comando y una llamada a la red por cada uno lo volvería insoportable. Los dos
 * frenos se complementan: referencia vieja → la frena el servidor con el lease;
 * referencia fresca → la frena esto, antes de tocar la red.
 *
 * Lo que decide vive acá (puro y con pruebas); `bash-guard.mjs` sólo lo llama.
 */

/**
 * Analiza un `git push`. Devuelve `null` si el comando no es un push (o no es
 * forzado): lo demás no es asunto de este freno.
 *
 * Reconoce las tres formas de forzar que git acepta —`--force`, `-f` y el `+`
 * delante del refspec— porque bloquear sólo la primera es dejar la puerta al
 * lado abierta.
 */
export function parseForcePush(command) {
  const texto = String(command ?? "").trim();
  // `git push` puede venir encadenado (`a && git push …`): se mira cada tramo.
  const tramos = texto.split(/&&|\|\||;/);
  for (const tramo of tramos) {
    const tokens = tramo.trim().split(/\s+/).filter(Boolean);
    const i = tokens.findIndex((t) => t === "git");
    if (i === -1 || tokens[i + 1] !== "push") continue;
    const args = tokens.slice(i + 2);
    const banderas = args.filter((a) => a.startsWith("-"));
    const libres = args.filter((a) => !a.startsWith("-"));
    const forzado =
      banderas.some(
        (b) => b === "--force" || b === "-f" || b === "--force-with-lease" || b.startsWith("--force-with-lease=")
      ) || libres.some((a) => a.startsWith("+"));
    if (!forzado) continue;
    // `git push [remoto] [refspec]`. Sin ellos manda la configuración de la rama;
    // el que llama resuelve la rama actual.
    const remoto = libres[0];
    const refspec = libres[1] ? libres[1].replace(/^\+/, "") : undefined;
    // `local:remota` → la que importa para medir qué se pisa es la REMOTA.
    const rama = refspec?.includes(":") ? refspec.split(":").pop() : refspec;
    return { remoto, rama };
  }
  return null;
}

/**
 * Mensaje del freno a partir de los commits que se perderían. `null` = no hay
 * nada que frenar (que es el caso normal de un force-push legítimo: reescribir
 * la propia historia sin tirar nada del remoto).
 */
export function mensajeDePerdida(rama, remota, sujetos) {
  if (!sujetos.length) return null;
  const lista = sujetos.slice(0, 5).map((s) => `  · ${s}`).join("\n");
  const resto = sujetos.length > 5 ? `\n  · … y ${sujetos.length - 5} más` : "";
  return (
    `FORCE-PUSH BLOQUEADO: \`${remota}\` tiene ${sujetos.length} commit(s) que \`${rama}\` no:\n` +
    `${lista}${resto}\n` +
    `Empujar así los BORRA. Casi siempre es trabajo que otro puso en la rama ` +
    `(un merge de un PR, un arreglo del humano) mientras vos reescribías historia.\n` +
    `Qué hacer: \`git fetch\` y después \`git merge ${remota}\` — si el humano tocó la rama, ` +
    `no se reescribe: se mergea. Si de verdad querés descartar esos commits, pedí ` +
    `confirmación explícita al humano y decilo en el mensaje.`
  );
}
