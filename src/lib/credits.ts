/**
 * Créditos de autoría y estado de la release. Vive en `lib/` (puro) porque lo
 * consumen la cabecera, el sidebar y las páginas de ayuda: un solo lugar donde
 * cambiar la versión, el canal (beta) y los enlaces evita que se desincronicen.
 *
 * `APP_VERSION` se duplica a mano desde `package.json` (el renderer se exporta
 * estático: no puede leer el manifiesto en runtime). El test de este módulo
 * falla si ambos números difieren, así que la duplicación no puede quedar vieja.
 */

export const APP_VERSION = "0.4.0";

/** La app aún no es estable: se anuncia como beta en la UI. */
export const RELEASE_CHANNEL = "beta" as const;

/** Etiqueta corta para el badge del header: «v0.3.0 · beta». */
export const versionLabel = () => `v${APP_VERSION} · ${RELEASE_CHANNEL}`;

export const CREDIT_ORG = "Sofka Technologies";
export const CREDIT_LINE = `Desarrollado por ${CREDIT_ORG}`;
/** Ruta del logo dentro de `public/` (sirve en dev y bajo el scheme `app://`). */
export const CREDIT_LOGO = "/sofka.png";

export interface CreditLink {
  label: string;
  href: string;
  /** Título del enlace: lo que se lee al pasar el mouse. */
  title: string;
}

/** Enlaces de crédito. Sólo https: los abre el navegador del sistema. */
export const CREDIT_LINKS: readonly CreditLink[] = [
  {
    label: "sofka.com.co",
    href: "https://sofka.com.co",
    title: "Sitio web de Sofka Technologies",
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/sofka-technologies",
    title: "Sofka Technologies en LinkedIn",
  },
  {
    label: "Blog",
    href: "https://sofka.com.co/blog/",
    title: "Blog de Sofka Technologies",
  },
] as const;
