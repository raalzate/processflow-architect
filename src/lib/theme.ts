/**
 * @fileOverview Preferencia de tema y tema efectivo (PURO).
 *
 * La app se mostró siempre en oscuro porque el layout cableaba la clase `dark`.
 * Funciona para trabajar, pero el diagrama también se **muestra**: proyectado en
 * una sala con luz o impreso, el lienzo oscuro no se lee. De ahí la preferencia.
 *
 * Dos cosas que no son obvias:
 *
 *  - **Preferencia y tema efectivo no son lo mismo.** El usuario elige entre
 *    tres cosas (`light`, `dark`, `system`), pero pintar sólo admite dos. El
 *    tercero no es un tema: es «preguntale al sistema», y por eso `resolverTema`
 *    necesita saber qué dice el sistema.
 *  - **El default es `dark` y se defiende acá.** Quien actualice la app no tiene
 *    que verla cambiar de color: sin preferencia guardada, o con una guardada
 *    ilegible, se pinta lo de siempre.
 *
 * Este módulo no toca el DOM ni `localStorage`: recibe lo que haya y devuelve
 * qué pintar. Lo que lo aplica es `src/hooks/use-theme.ts`.
 */

/** Lo que el usuario elige en Ajustes. */
export type ThemePreference = "light" | "dark" | "system";

/** Lo que se pinta. `system` ya está resuelto. */
export type EffectiveTheme = "light" | "dark";

/**
 * Clave en `localStorage`. Vive acá y no en el hook porque el script anti-destello
 * del layout la necesita antes de que cargue ningún módulo de React.
 */
export const THEME_STORAGE_KEY = "theme_preference";

/**
 * El tema de quien nunca eligió: el de hoy. Cambiarlo es cambiarle la app a
 * todo el mundo en una actualización, y eso se pide, no se decide.
 */
export const THEME_DEFAULT: ThemePreference = "dark";

const PREFERENCIAS: readonly ThemePreference[] = ["light", "dark", "system"];

/** Las tres opciones, con su rótulo y el porqué, para la pantalla de Ajustes. */
export const THEME_OPTIONS: readonly {
  id: ThemePreference;
  label: string;
  detalle: string;
}[] = [
  { id: "dark", label: "Oscuro", detalle: "La superficie de trabajo: menos cansa la vista en sesiones largas." },
  { id: "light", label: "Claro", detalle: "Para presentar, proyectar o imprimir el diagrama." },
  { id: "system", label: "Seguir al sistema", detalle: "Acompaña el tema del sistema operativo." },
] as const;

/**
 * La preferencia que representa lo guardado. Cualquier cosa que no sea una de
 * las tres —`null`, `"Dark"`, restos de una versión anterior— cae al default en
 * vez de romper el arranque.
 */
export function leerPreferencia(valor: unknown): ThemePreference {
  return PREFERENCIAS.find((p) => p === valor) ?? THEME_DEFAULT;
}

/**
 * Qué se pinta. `system` mira lo que dice el sistema; los otros dos se pintan
 * como dicen, aunque el sistema opine otra cosa.
 */
export function resolverTema(
  preferencia: ThemePreference,
  sistemaPrefiereOscuro: boolean
): EffectiveTheme {
  if (preferencia === "system") return sistemaPrefiereOscuro ? "dark" : "light";
  return preferencia;
}

/**
 * La clase que va en el `<html>`. Tailwind está en `darkMode: ['class']`, así
 * que el tema claro es la AUSENCIA de clase: devolver `"light"` no pintaría
 * nada, y ése fue el primer intento equivocado.
 */
export function claseDelTema(tema: EffectiveTheme): "dark" | "" {
  return tema === "dark" ? "dark" : "";
}

/**
 * El script que corre en el `<head>`, antes del primer pintado, para que nadie
 * vea el tema contrario durante un fotograma. Va como TEXTO porque es lo único
 * que se puede inyectar antes de que exista React, y vive acá —y no suelto en
 * el layout— para que la clave y el default sean los mismos que usa el hook.
 *
 * Es defensivo a propósito: en un navegador con el almacenamiento bloqueado
 * `localStorage` lanza al leerse, y un error acá deja la página en blanco.
 */
export function scriptAntiDestello(): string {
  return `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
    `if(p!=="light"&&p!=="dark"&&p!=="system")p=${JSON.stringify(THEME_DEFAULT)};` +
    `var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);` +
    `document.documentElement.classList.toggle("dark",d);}catch(e){` +
    `document.documentElement.classList.toggle("dark",${JSON.stringify(THEME_DEFAULT === "dark")});}})();`;
}
