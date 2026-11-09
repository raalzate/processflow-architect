/**
 * Lo mínimo de `n3` que usan las pruebas del export RDF (spec 027 · R-08). La
 * librería no trae tipos y es sólo devDependency: valida el Turtle exportado
 * con un parser independiente, nunca viaja con la app.
 */
declare module "n3" {
  export interface Term {
    termType: "NamedNode" | "BlankNode" | "Literal" | "Variable" | "DefaultGraph";
    value: string;
  }
  export interface Quad {
    subject: Term;
    predicate: Term;
    object: Term;
    graph: Term;
  }
  export class Parser {
    constructor(opts?: { format?: string; baseIRI?: string });
    parse(input: string): Quad[];
  }
  export class Store {
    constructor(quads?: Quad[]);
    readonly size: number;
    getQuads(subject: Term | string | null, predicate: Term | string | null, object: Term | string | null, graph: Term | string | null): Quad[];
  }
}
