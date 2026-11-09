/**
 * @fileOverview Fachada de la ontología del modelo (spec 027) — PURO.
 *
 * El diagrama deja de ser dibujo y pasa a ser conocimiento: un REGLAMENTO por
 * notación (TBox, derivado de `notations.ts`), los diagramas como HECHOS (ABox)
 * y el significado canónico de cada flecha. Las fases siguientes agregan acá el
 * razonador, las formas y las consultas.
 *
 * Importar siempre desde los módulos concretos con ruta relativa en el proceso
 * main: la fachada es para la UI y las pruebas.
 */

export type { Hallazgo, Hecho, Justificacion, Origen, Procedencia, ReglaId, Termino, Tripleta } from "./types";
export {
  ELEMENTO,
  KB,
  PF,
  RDF_TYPE,
  RDFS_LABEL,
  esLiteral,
  expandir,
  idDePredicado,
  iriElemento,
  iriGeneral,
  iriPredicado,
  iriRol,
  iriTipo,
  literal,
  slugTipo,
  valorLiteral,
} from "./iri";
export { crearStore, type TripleStore } from "./store";
export {
  admite,
  arbolDeClases,
  checkTbox,
  claseDeTipo,
  construirTbox,
  describirTerminos,
  predicadoDe,
  propiedadesDe,
  superclases,
  tboxDe,
  tboxMarkdown,
  type Clase,
  type NodoArbol,
  type Tbox,
} from "./tbox";
export {
  GENERICO,
  normalizarEtiqueta,
  predicadosCompatibles,
  sugerirPredicado,
  validarPredicado,
  type Confianza,
  type Sugerencia,
} from "./predicate-guess";
export {
  hechosDeGraphData,
  hechosDeModelo,
  hechosDeVistas,
  unirAbox,
  type AristaAbox,
  type ContextoAbox,
  type ElementoAbox,
  type ResultadoAbox,
  type VistaAbox,
} from "./abox";
export { plana, validar, type OpcionesValidar } from "./validate";
export { deducidosDe, explicacionLegible, textoDeHecho, type FilaDeducida, type LineaExplicacion } from "./ficha";
export { MAX_HECHOS, MAX_RONDAS, razonar, type OpcionesRazonador, type ResultadoRazonador } from "./reasoner";
export { explicar, hojasDe, type Explicacion } from "./query";
export {
  PROYECTO_SUELTO,
  VISTA_SUELTA,
  conocimientoDeModelo,
  construirConocimiento,
  type Alcance,
  type Conocimiento,
  type EntradaConocimiento,
  type OrganizacionEntrada,
  type ProyectoEntrada,
} from "./conocimiento";
