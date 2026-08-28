/**
 * Créditos de autoría y estado de la release. Vive en `lib/` (puro) porque lo
 * consumen la cabecera, el sidebar y las páginas de ayuda: un solo lugar donde
 * cambiar la versión, el canal (beta) y los enlaces evita que se desincronicen.
 *
 * `APP_VERSION` se duplica a mano desde `package.json` (el renderer se exporta
 * estático: no puede leer el manifiesto en runtime). El test de este módulo
 * falla si ambos números difieren, así que la duplicación no puede quedar vieja.
 */

export const APP_VERSION = "0.8.1";

/** La app aún no es estable: se anuncia como beta en la UI. */
export const RELEASE_CHANNEL = "beta" as const;

/** Etiqueta corta para el badge del header: «v0.3.0 · beta». */
export const versionLabel = () => `v${APP_VERSION} · ${RELEASE_CHANNEL}`;

/** Autoría individual: no hay logo ni organización detrás, sólo el autor. */
export const CREDIT_AUTHOR = "Raúl Andrés Alzate Gómez";
export const CREDIT_EMAIL = "alzategomez.raul@gmail.com";
/**
 * Línea del pie. Termina con la versión a propósito (#207): en un reporte de
 * usuario es el primer dato que hace falta y el que nunca viene, y acá está
 * siempre a la vista sin abrir Ajustes. Sale de `versionLabel()`, así que no hay
 * un segundo número que se pueda quedar viejo.
 */
export const CREDIT_LINE = `Desarrollado por ${CREDIT_AUTHOR} · ${versionLabel()}`;

export interface CreditLink {
  label: string;
  href: string;
  /** Título del enlace: lo que se lee al pasar el mouse. */
  title: string;
}

/**
 * Enlaces de crédito. Sólo `mailto:` y `https:`: son los schemes que el
 * `setWindowOpenHandler` de `main/window.ts` delega al sistema; cualquier otro
 * se niega y el clic no haría nada.
 */
export const CREDIT_LINKS: readonly CreditLink[] = [
  {
    label: CREDIT_EMAIL,
    href: `mailto:${CREDIT_EMAIL}`,
    title: `Escribir a ${CREDIT_AUTHOR}`,
  },
] as const;
