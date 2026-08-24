
import type { GraphData, GraphNode, GraphLink } from "./types";

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
} {
  // Gracefully handle cases where the JSON is malformed
  if (!jsonData) {
    throw new Error("El archivo JSON está vacío o es inválido.");
  }

  // Fallback: si el modelo no produjo contenedores (o vienen vacíos) pero SÍ hay
  // nodos sueltos en `big_picture`, los exponemos en un grupo "Visión General"
  // para que el lienzo NUNCA quede vacío. El nombre es neutral a propósito: este
  // grupo aparece igual en modelos BPMN/C4/UML, no solo en Event Storming.
  let agregados = Array.isArray(jsonData.agregados) ? jsonData.agregados : [];
  const aggHasNodes = agregados.some((a: any) => (a?.nodos?.length ?? 0) > 0);
  const bp: any = (jsonData as any).big_picture;
  if (!aggHasNodes && bp && (bp.nodos?.length ?? 0) > 0) {
    agregados = [
      {
        nombre_agregado: "Visión General",
        descripcion: bp.descripcion || "Elementos sin contenedor",
        nodos: bp.nodos || [],
        aristas: bp.aristas || [],
      } as any,
      ...agregados,
    ];
  }

  const allNodes: GraphNode[] = [];
  const allLinks: GraphLink[] = [];
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
        // Exclude any node that is not connected to anything
        if (!nodesWithLinks.has(node.id)) {
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


  return { nodes: allNodes, links: allLinks, aggregates, nodeTree: sortedNodeTree };
}


    
