/**
 * @fileOverview Consultas del modo EDITOR del constructor. Feature 015, T6 (#342).
 *
 * Las primitivas viven en `mcp/graph-queries.ts` —las comparte `view-edit.ts`,
 * que aplica lo que estas consultas resuelven— y acá se re-exportan con el
 * nombre con el que las usa el agente: dos implementaciones de «buscá el
 * elemento que se llama así» es como nacen los desacuerdos entre lo que el
 * agente cree y lo que la app hace.
 */

export {
  elementoPorNombre,
  elementosPorTipo,
  relacionEntre,
  elementos,
  contenedores,
  relaciones,
  nombreDe,
  type Resultado,
  type ElementoRef,
  type RelacionRef,
} from "../mcp/graph-queries";
