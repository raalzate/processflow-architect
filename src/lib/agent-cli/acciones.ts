/**
 * @fileOverview Acciones de ejemplo del chat de la ficha (PURO). #643.
 *
 * El chat arrancaba con un párrafo y dos sugerencias en cursiva: el humano no
 * sabía qué más podía pedir. Acá se arma la lista de pedidos concretos según lo
 * que la caja ES (un servicio pide repo y endpoint; una base de datos, motor y
 * esquema), lo que ya tiene (spec escrita o no) y lo que el motor PUEDE hacer
 * (el CLI escribe en la ficha; la IA de la app sólo propone).
 */

import { perfilDeTipo } from "../element-properties";

export interface AccionDeEjemplo {
  /** Rótulo corto del botón. */
  label: string;
  /** Lo que se escribe en el chat al elegirla (el humano lo puede retocar). */
  prompt: string;
}

export interface ContextoDeAcciones {
  tipo?: string;
  hasSpec: boolean;
  /** true → Claude Code / Codex: puede escribir en la ficha. */
  escribe: boolean;
  /** Hay carpetas de contexto adjuntas. */
  conCarpetas?: boolean;
}

export function accionesDeEjemplo(ctx: ContextoDeAcciones): AccionDeEjemplo[] {
  const { desplegable, almacen } = perfilDeTipo(ctx.tipo);
  if (!ctx.escribe) {
    return [
      { label: "¿Qué le falta?", prompt: "¿Qué le falta a esta caja para que alguien la pueda implementar?" },
      { label: "Criterios medibles", prompt: "Proponé criterios de éxito medibles para esta caja." },
      { label: "Casos límite", prompt: "¿Qué casos límite y fallos debería contemplar?" },
      { label: "Tecnologías", prompt: "¿Qué tecnologías y qué icono le corresponden a esta caja?" },
    ];
  }
  const acciones: AccionDeEjemplo[] = [
    {
      label: "Pulir la caja",
      prompt: "Pulí esta caja: descripción clara, tecnologías e icono. Mostrame la propuesta antes de escribir.",
    },
    ctx.hasSpec
      ? { label: "Completar la spec", prompt: "Completá la spec con criterios medibles y casos límite, sin pisar lo que ya está." }
      : { label: "Escribir la spec", prompt: "Escribí la spec: flujo con sus vecinos, requisitos y criterios medibles. Lo que no se sepa, marcalo para aclarar." },
  ];
  if (almacen) {
    acciones.push({
      label: "Propiedades de la base",
      prompt: "Completá las propiedades de esta base de datos: puerto, motor, esquema y respaldo. Lo que no se sepa, \"pendiente\".",
    });
  } else if (desplegable) {
    acciones.push({
      label: "Repo, puerto y endpoint",
      prompt: "Completá repo, puerto y endpoint de esta caja. Lo que no se sepa, \"pendiente\".",
    });
  }
  acciones.push({
    label: "Revisar relaciones",
    prompt: "Revisá sus relaciones con los vecinos: ¿falta alguna entrada o salida, o alguna etiqueta no explica qué viaja?",
  });
  if (ctx.conCarpetas) {
    acciones.push({
      label: "Buscar en el código",
      prompt: "Buscá en las carpetas adjuntas el código de esta caja y actualizá la ficha citando los archivos.",
    });
  }
  return acciones;
}
