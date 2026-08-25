
import type { GraphData, GraphNode, GraphLink } from "./types";
import { looseGroupLabel } from "./notations";

/**
 * Árbol del modelo para el panel lateral. El nombre y la descripción del
 * contenedor viajan como CAMPOS: la clave concatenaba `nombre - descripción` y
 * el panel la volvía a partir por " - ", así que un contenedor llamado
 * "Middleware BUPA - API Manager" mostraba "API Manager" como si fuera su
 * descripción y la real se perdía.
 */
type NodeTree = {
  [aggregate: string]: {
    nombre: string;
    descripcion: string;
    tipos: {
      [type: string]: GraphNode[];
    };
  };
};

export function processGraphData(jsonData: GraphData): {
  nodes: GraphNode[];
  links: GraphLink[];
  aggregates: string[];
  nodeTree: NodeTree;
  /**
   * Lo que el filtro de "sólo nodos conectados" dejó afuera. Descartar en
   * silencio es lo que hacía invisible la pérdida: el panel mostraba menos
   * elementos que el lienzo y nada lo contaba. Quien renderiza decide si lo
   * muestra; la suite lo usa para el invariante de conservación.
   */
  descartados: GraphNode[];
} {
  // Gracefully handle cases where the JSON is malformed
  if (!jsonData) {
    throw new Error("El archivo JSON está vacío o es inválido.");
  }

  // `big_picture.nodos` NO es una red de emergencia: son los elementos SIN
  // CONTENEDOR (así los manda el MCP, así los dibuja el lienzo). Tratarlos como
  // fallback —sólo si ningún agregado tenía nodos— los borraba del panel en
  // cuanto había una banda poblada, que en un C4 es siempre: el lienzo mostraba
  // 16 elementos y el panel 13. Entran SIEMPRE, en su propio grupo, y con sus
  // aristas (que por el mismo camino también se perdían).
  let agregados = Array.isArray(jsonData.agregados) ? jsonData.agregados : [];
  const bp: any = (jsonData as any).big_picture;
  if (bp && (bp.nodos?.length ?? 0) > 0) {
    agregados = [
      {
        // El rótulo sale del registro de notaciones (P6): en C4 los actores
        // sueltos están fuera de un Límite de Sistema, no de un Agregado.
        nombre_agregado: looseGroupLabel((jsonData as any).notation),
        descripcion: "Elementos sin contenedor",
        nodos: bp.nodos || [],
        aristas: bp.aristas || [],
      } as any,
      ...agregados,
    ];
  }

  const allNodes: GraphNode[] = [];
  const allLinks: GraphLink[] = [];
  const descartados: GraphNode[] = [];
  const nodeIds = new Set<string>();
  const nodeTree: NodeTree = {};

  // Helper to get nodes that are part of any link
  const nodesWithLinks = new Set<string>();
  agregados.forEach((agregado) => {
    if (agregado.aristas) {
      agregado.aristas.forEach((link) => {
        nodesWithLinks.add(link.fuente);
        nodesWithLinks.add(link.destino);
      });
    }
  });
  if (jsonData.politicas_inter_agregados) {
    jsonData.politicas_inter_agregados.forEach((link) => {
      nodesWithLinks.add(link.fuente);
      nodesWithLinks.add(link.destino);
    });
  }


  // Process nodes and internal links from each aggregate
  agregados.forEach((agregado) => {
    const aggregateDescription = agregado.descripcion;
    const aggregateName = agregado.nombre_agregado + (aggregateDescription ? ` - ${aggregateDescription}` : "");

    if (!nodeTree[aggregateName]) {
      nodeTree[aggregateName] = {
        nombre: agregado.nombre_agregado,
        descripcion: aggregateDescription || "",
        tipos: {},
      };
    }

    if (agregado.nodos) {
      agregado.nodos.forEach((node) => {
        // Un nodo sin ninguna relación no se dibuja, pero se CUENTA: la pérdida
        // silenciosa es la que nadie ve hasta que falta un elemento en el panel.
        if (!nodesWithLinks.has(node.id)) {
          descartados.push({ ...node, agregado: aggregateName } as GraphNode);
          return;
        }
        if (!nodeIds.has(node.id)) {
          const fullNode = {
            ...node,
            agregado: aggregateName,
          };
          allNodes.push(fullNode);
          nodeIds.add(node.id);

          const nodeType = node.tipo_elemento;
          const tipos = nodeTree[aggregateName].tipos;
          if (!tipos[nodeType]) tipos[nodeType] = [];
          tipos[nodeType].push(fullNode);
          tipos[nodeType].sort((a, b) => a.nombre.localeCompare(b.nombre));
        }
      });
    }

    if (agregado.aristas) {
      agregado.aristas.forEach((link) => {
        allLinks.push({
          ...link,
          source: link.fuente,
          target: link.destino,
          tipo: "interno",
        });
      });
    }
  });

  // Red de seguridad: si el filtro de "sólo nodos conectados" dejó el lienzo vacío
  // (nodos sin aristas, o aristas con ids que no casan), incluimos TODOS los nodos
  // para que el grafo nunca se cargue en blanco.
  if (allNodes.length === 0) {
    // Se recuperan TODOS: lo descartado deja de estarlo.
    descartados.length = 0;
    agregados.forEach((agregado) => {
      const aggregateDescription = agregado.descripcion;
      const aggregateName = agregado.nombre_agregado + (aggregateDescription ? ` - ${aggregateDescription}` : "");
      if (!nodeTree[aggregateName])
        nodeTree[aggregateName] = {
          nombre: agregado.nombre_agregado,
          descripcion: aggregateDescription || "",
          tipos: {},
        };
      (agregado.nodos || []).forEach((node) => {
        if (nodeIds.has(node.id)) return;
        const fullNode = { ...node, agregado: aggregateName };
        allNodes.push(fullNode);
        nodeIds.add(node.id);
        const nodeType = node.tipo_elemento;
        const tipos = nodeTree[aggregateName].tipos;
        if (!tipos[nodeType]) tipos[nodeType] = [];
        tipos[nodeType].push(fullNode);
        tipos[nodeType].sort((a, b) => a.nombre.localeCompare(b.nombre));
      });
    });
  }

  // Process inter-aggregate policy links
  if (jsonData.politicas_inter_agregados) {
    jsonData.politicas_inter_agregados.forEach((link) => {
      allLinks.push({
        ...link,
        source: link.fuente,
        target: link.destino,
        tipo: "politica",
      });
    });
  }

  const aggregates = Array.from(
    new Set(allNodes.map((d) => d.agregado).filter((a): a is string => Boolean(a)))
  ).sort();
  
  const sortedNodeTree: NodeTree = {};
  aggregates.forEach(agg => {
    sortedNodeTree[agg] = nodeTree[agg];
  });


  return { nodes: allNodes, links: allLinks, aggregates, nodeTree: sortedNodeTree, descartados };
}


    
