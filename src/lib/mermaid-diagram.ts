import { BigPicture, GraphLink, GraphNode, ReadModel, TechnicalDiagram } from "./types";
import { separateCamelCase } from "./utils";
import { mermaidShapeDelims } from "./mcp/to-mermaid";


export const sanitizeId = (name: string): string => {
  if (!name) return 'invalid_id';
  return name.replace(/[^a-zA-Z0-9_]/g, '');
}

/**
 * Escapa comillas (con #quot;) y convierte saltos de línea a <br> para etiquetas de NODO.
 */
export const escapeNodeLabel = (text: string): string =>
  text.replace(/"/g, '#quot;')
    .replace(/\n/g, '<br>')
    .replace(/-/g, ' ')
    .replace(/\(/g, '- ')
    .replace(/\)/g, '');

/**
 * Escapa comillas (con #quot;) y reemplaza saltos de línea con espacios para etiquetas de ARISTA.
 */
export const escapeEdgeLabel = (text: string): string =>
  text.replace(/"/g, '#quot;').replace(/\n/g, ' ');


/**
 * Formatea los tags de tecnología como un estereotipo UML.
 */
export const getTechTag = (tags: string[] | null): string =>
  tags && tags.length > 0 ? `- ${tags.join(', ')}` : '';



/**
 * Vista de "contexto": el diagrama de caja negra del modelo.
 *
 * En Event Storming el contexto se obtiene ocultando el interior (eventos,
 * políticas) y dejando sólo la frontera; ese recorte SOLO tiene sentido en DDD,
 * así que en BPMN/C4/UML se muestran todos los nodos. Si el recorte deja el
 * diagrama vacío también se muestran todos: un ```mermaid``` sin nodos no dice nada.
 */
export function diagramContext(data: BigPicture, notation?: string): string {
  // 1. DEFINICIÓN DE TIPOS PERMITIDOS (Contexto General)
  const allowedTypes = new Set([
    'Actor', 
    'Vista', 
    'Comando', 
    'Read Model', 
    'Sistema Externo'
  ]);

  // 2. FILTRAR NODOS VISIBLES (sólo en DDD; ver doc de la función)
  const isDdd = !notation || notation === 'ddd';
  const filtered = isDdd ? data.nodos.filter(n => allowedTypes.has(n.tipo_elemento)) : data.nodos;
  const visibleNodes = filtered.length ? filtered : data.nodos;
  const visibleNodeIds = new Set(visibleNodes.map(n => n.id));

  // 3. LÓGICA DE CONEXIÓN TRANSITIVA (Bridging)
  // Construimos un mapa de adyacencia de TODO el grafo original
  const adjacency: Record<string, string[]> = {};
  data.aristas.forEach(a => {
    if (!adjacency[a.fuente]) adjacency[a.fuente] = [];
    adjacency[a.fuente].push(a.destino);
  });

  // Función para encontrar el siguiente nodo visible recorriendo los invisibles
  const findNextVisibleNeighbors = (startId: string): string[] => {
    const results: string[] = [];
    const visited = new Set<string>();
    const queue = [...(adjacency[startId] || [])];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      if (visibleNodeIds.has(currentId)) {
        // ¡Encontramos un nodo visible! Lo guardamos y paramos esta rama.
        results.push(currentId);
      } else {
        // Es un nodo invisible (Evento, Política, etc.), seguimos buscando en sus hijos
        if (adjacency[currentId]) {
          queue.push(...adjacency[currentId]);
        }
      }
    }
    return results;
  };

  // Generamos las nuevas aristas calculadas
  const computedEdges: string[] = [];
  visibleNodes.forEach(node => {
    const targets = findNextVisibleNeighbors(node.id);
    // Eliminamos duplicados por si hay múltiples caminos al mismo destino
    const uniqueTargets = [...new Set(targets)];
    
    uniqueTargets.forEach(targetId => {
      // Evitamos auto-ciclos triviales si existen
      if (node.id !== targetId) {
        computedEdges.push(`  ${node.id} --> ${targetId}`);
      }
    });
  });

  // 4. MAPA DE FORMAS Y ESTILOS
  const shapeMap: Record<string, [string, string]> = {
    Actor: ['([', '])'],             
    'Sistema Externo': ['[', ']'],   
    Comando: ['[/', '/]'],            
    Vista: ['[\\', '\\]'],           
    'Read Model': ['[(', ')]'],      
  };

  // 5. AGRUPACIÓN POR CONTEXTO (Igual que antes)
  const groups: Record<string, GraphNode[]> = {};
  visibleNodes.forEach(nodo => {
    const groupKey = (nodo as any).agregado || 'General'; 
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(nodo);
  });

  // 6. GENERACIÓN DEL DIAGRAMA
  const nodeDeclarations: string[] = [];
  let groupCounter = 0;

  Object.entries(groups).forEach(([groupName, groupNodes]) => {
    const isContext = groupName !== 'General';
    
    if (isContext) {
      const groupId = `sg_${groupCounter++}`; 
      nodeDeclarations.push(`  subgraph ${groupId} ["${groupName.toUpperCase()}"]`);
      nodeDeclarations.push(`    direction TB`);
    }

    groupNodes.forEach(nodo => {
      // Formas propias del Event Storming; para el resto de tipos manda la forma
      // que declara su notación (compuertas en rombo, bases de datos en cilindro…).
      const [open, close] = shapeMap[nodo.tipo_elemento] || mermaidShapeDelims(nodo.tipo_elemento);
      const label = nodo.nombre.replace(/"/g, "'").replace(/\n/g, " ");
      
      // Limpieza de clases CSS
      const estado = nodo.estado_comparativo || 'existente';
      // Quitamos espacios y paréntesis del tipo para la clase CSS
      const tipoSanitize = nodo.tipo_elemento.replace(/[^a-zA-Z0-9]/g, ''); 
      const cssClass = `:::${tipoSanitize}_${estado}`;

      nodeDeclarations.push(`    ${nodo.id}${open}"${label}"${close}${cssClass}`);
    });

    if (isContext) {
      nodeDeclarations.push(`  end`);
    }
  });

  // 7. DEFINICIÓN DE CLASES CSS
  const classDefs = `
    classDef cluster fill:#f8fafc,stroke:#cbd5e1,stroke-width:2px,color:#475569;
    
    %% Actores
    classDef Actor_existente fill:#fff,stroke:#333,stroke-width:2px;
    classDef Actor_nuevo fill:#dcfce7,stroke:#16a34a,stroke-width:2px;
    
    %% Comandos
    classDef Comando_existente fill:#dbeafe,stroke:#2563eb,color:#1e3a8a;
    classDef Comando_nuevo fill:#dbeafe,stroke:#2563eb,stroke-dasharray: 5 5;
    
    %% Vistas
    classDef Vista_existente fill:#fce7f3,stroke:#db2777,color:#831843;
    classDef Vista_modificado fill:#fdf4ff,stroke:#d946ef,stroke-width:2px;

    %% Read Models
    classDef ReadModel_existente fill:#ccfbf1,stroke:#0d9488,color:#115e59;
    classDef ReadModel_modificado fill:#e0f2fe,stroke:#0284c7,stroke-width:2px;

    %% Sistemas
    classDef SistemaExterno_existente fill:#e2e8f0,stroke:#64748b,color:#0f172a;
    classDef SistemaExterno_modificado fill:#f1f5f9,stroke:#94a3b8,stroke-dasharray: 5 5;

    classDef default fill:#fff,stroke:#333;
  `;

  return `flowchart LR
${nodeDeclarations.join('\n')}

${computedEdges.join('\n')}

${classDefs}
`;
}

export function diagramBigPicture(data: BigPicture): string {
  const { nodos, aristas } = data;

  /**
   * Mapeo de tipos a los delimitadores de forma de Mermaid.
   * [open, close]
   */
  // Delimitadores de FORMA (sin comillas ni icono): las comillas las añade el
  // render una sola vez, y el icono va DENTRO de la etiqueta entrecomillada.
  const shapeMap: Record<string, [string, string]> = {
    Actor: ['(', ')'],
    'Sistema Externo': ['[', ']'],
    Evento: ['((', '))'],
    Comando: ['{{', '}}'],
    Política: ['{', '}'],
    Hotspot: ['(', ')'],
    default: ['[', ']'],
  };
  // Prefijo FontAwesome por tipo (dentro de las comillas de la etiqueta).
  const iconMap: Record<string, string> = {
    Actor: 'fa:fa-user ',
    'Sistema Externo': 'fa:fa-server ',
    Comando: 'fa:fa-terminal ',
    'Política': 'fa:fa-flag ',
    Hotspot: 'fa:fa-exclamation ',
  };

  // --- Generar declaraciones de nodos ---
  const nodeDeclarations = nodos.map(nodo => {
    // 1. Forma + icono según el tipo.
    const [open, close] = shapeMap[nodo.tipo_elemento] || shapeMap.default;
    const icon = iconMap[nodo.tipo_elemento] || '';

    // 2. Construir la etiqueta HTML interna.
    const label = escapeNodeLabel(nodo.nombre);
    const desc = nodo.descripcion
      ? `<br><small><i>${escapeNodeLabel(nodo.descripcion)}</i></small>`
      : '';
    const nodeLabel = `<b>${label}</b>${desc}`;

    // 3. Estado (clase CSS).
    const estado = nodo.estado_comparativo || 'existente';

    // 4. Un único par de comillas envuelve icono + etiqueta, para cualquier forma.
    return `    ${nodo.id}${open}"${icon}${nodeLabel}"${close}:::${estado}`;
  }).join('\n');

  // --- Generar aristas (Sin cambios) ---
  const edgeDeclarations = aristas.map(arista => {
    const descripcion = arista.descripcion || '';
    const label = escapeEdgeLabel(descripcion);

    const arrow = descripcion.includes('habilita') || descripcion.includes('dispara') ? '-->' : '---';

    const edgeLabel = label ? `|"${label}"|` : '';

    return `    ${arista.fuente} ${arrow}${edgeLabel} ${arista.destino}`;
  }).join('\n');

  // --- Clases para estilos (Sin cambios) ---
  const classDefs = `
    classDef nuevo fill:#e6f9e6,stroke:#28a745,stroke-width:2px,color:#155724;
    classDef modificado fill:#fff3cd,stroke:#ffc107,stroke-width:2px,color:#856404;
    classDef existente fill:#f8f9fa,stroke:#6c757d,stroke-width:1px,color:#212529;
  `;

  // --- Diagrama completo ---
  return `flowchart LR
${nodeDeclarations}

${edgeDeclarations}

${classDefs}
`;
}




export function diagramReadModels(rm: ReadModel): string {

  // Nodos y aristas que irán DENTRO del pool de esta vista
  const internalNodes: string[] = [];
  const policyNodes: string[] = [];
  const proyectionNodes: string[] = [];
  const internalEdges: string[] = [];

  // Variables para el único subgraph
  const rmId = `rm_${sanitizeId(rm.nombre)}`;
  const rmLabel = escapeNodeLabel(rm.nombre);
  const rmDesc = escapeNodeLabel(rm.descripcion);
  const subgraphId = sanitizeId(rm.nombre);

  // --- NODO: VISTA (Read Model) ---
  const rmNode = `    ${rmId}["fa:fa-desktop <b>${rmLabel}</b><br><small><i>${rmDesc}</i></small>"]:::readmodel`;
  internalNodes.push(rmNode);

  // --- NODOS: POLÍTICAS UI (Únicos de esta vista) ---
  rm.ui_policies.forEach(policyName => {
    const policyId = `pol_${rmId}_${sanitizeId(policyName)}`;
    const policyLabel = escapeNodeLabel(policyName);
    const policyNode = `    ${policyId}>${policyLabel}]:::policy`;

    policyNodes.push(policyNode);
    internalEdges.push(`    ${rmId} -. "aplica" .-> ${policyId}`);
  });

  // --- NODOS: EVENTOS (Definidos localmente) ---
  rm.proyecta.forEach(eventName => {
    const eventId = `evt_${rmId}_${sanitizeId(eventName)}`; // ID único local
    const eventLabel = separateCamelCase(escapeNodeLabel(eventName).replace('Evento', ' '));
    const eventNode = `    ${eventId}{{ ${eventLabel} }}:::event`;

    proyectionNodes.push(eventNode);
    internalEdges.push(`    ${rmId} -. "consecuencia" .-> ${eventId}`);
  });

  // --- NODOS: TECNOLOGÍAS (Definidos localmente) ---
  rm.tecnologias.forEach(techName => {
    const techId = `tech_${rmId}_${sanitizeId(techName)}`; // ID único local
    const techLabel = escapeNodeLabel(techName);
    const techNode = `    ${techId}["${techLabel}"]:::tech`;

    internalNodes.push(techNode);
    internalEdges.push(`    ${rmId} -. "usa" .-> ${techId}`);
  });


  const subgraphBlock = `
${internalNodes.join('\n')}
subgraph Politicas["Políticas de UI"]
  ${policyNodes.join('\n')}
end
subgraph Proyecciones["Proyecciones"]
  ${proyectionNodes.join('\n')}
end
${internalNodes.join('\n')}
${internalEdges.join('\n')}
`;

  // --- 3. Definir Estilos ---
  const classDefs = `
    classDef event fill:#fff0f5,stroke:#c71585,stroke-width:2px,color:#333;
    classDef readmodel fill:#f0f8ff,stroke:#4682b4,stroke-width:2px,color:#333;
    classDef policy fill:#f8f9fa,stroke:#6c757d,stroke-width:1.5px,color:#333,stroke-dasharray: 4 2;
    classDef tech fill:#e6f9e6,stroke:#28a745,stroke-width:1.5px,color:#333;
  `;

  return `flowchart LR
${subgraphBlock}

${classDefs}
`;
}

export function diagramTechnicalElements(data: TechnicalDiagram): string {
  let mermaidString = 'graph TD;\n';
  data.nodes.forEach((node) => {
    mermaidString += `  ${node.id}[${escapeNodeLabel(node.label)}];\n`;
  });
  data.edges.forEach((edge) => {
    const label = edge.label ? `${escapeEdgeLabel(edge.label)}` : '';
    mermaidString += `  ${edge.from} -- ${label} --> ${edge.to};\n`;
  });
  return mermaidString;
}