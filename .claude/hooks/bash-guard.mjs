#!/usr/bin/env node
/**
 * PreToolUse Bash — comandos irreversibles o que saltan la verificación.
 *
 * El incidente arquetípico de la guía (un `sed -i` amplio sobre el directorio fuente)
 * es una de las reglas de `.claude/harness.config.json` → `bash.deny`.
 */
import { execFileSync } from "node:child_process";
import { readInput, loadConfig, deny, allow, firstMatch, REPO_ROOT } from "./harness.mjs";
import { mensajeDePerdida, parseForcePush } from "./push-guard.mjs";

const input = await readInput();
const config = loadConfig();
if (!config) allow();

const command = input?.tool_input?.command ?? "";
if (!command) allow();

const hit = firstMatch(config.bash?.deny, command);
if (hit) {
  deny(
    `COMANDO BLOQUEADO: \`${command}\`\n` +
      `Motivo: ${hit.reason}\n` +
      `Reformulá el comando o pedí confirmación explícita al humano. No lo reintentes igual.`,
  );
}

// Force-push que se lleva commits del remoto. Va DESPUÉS de los patrones porque
// el `--force` sin lease ya lo frena la regla de arriba; esto cubre el caso que
// el lease deja pasar (ver `push-guard.mjs`).
const push = parseForcePush(command);
if (push) {
  const cwd = input?.cwd ?? REPO_ROOT;
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    const rama = push.rama || git("rev-parse", "--abbrev-ref", "HEAD");
    const remota = `${push.remoto || "origin"}/${rama}`;
    // Sin referencia de seguimiento no hay nada que medir: la rama es nueva en
    // el remoto y el push no puede pisar nada.
    git("rev-parse", "--verify", "--quiet", `refs/remotes/${remota}`);
    const sujetos = git("log", "--format=%h %s", `${rama}..${remota}`).split("\n").filter(Boolean);
    const mensaje = mensajeDePerdida(rama, remota, sujetos);
    if (mensaje) deny(mensaje);
  } catch (e) {
    // `deny` sale con exit 2: no es un error del chequeo, es el freno.
    if (e?.status === 2) throw e;
    // Cualquier otra cosa (no es un repo, la referencia no existe, git falta):
    // el freno no opina. Un guardián que bloquea cuando no puede medir se
    // desactiva a mano, y ahí se pierde entero.
  }
}

allow();
