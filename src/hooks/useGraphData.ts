import { useCallback, useState } from "react";
import { processGraphData } from "@/lib/graph-processor";
import type { SavedFile, GraphData, GraphNode, GraphLink } from "@/lib/types";

export function useGraphData() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [allNodes, setAllNodes] = useState<GraphNode[]>([]);
  const [allLinks, setAllLinks] = useState<GraphLink[]>([]);
  const [aggregates, setAggregates] = useState<string[]>([]);
  const [technologies, setTechnologies] = useState<string[]>([]);
  const [nodeTypes, setNodeTypes] = useState<string[]>([]);
  const [sidebarNodeTree, setSidebarNodeTree] = useState<Record<string, any>>({});

  const loadFile = useCallback((file: SavedFile) => {
    try {
      const {
        nodes: processedNodes,
        links: processedLinks,
        aggregates: processedAggregates,
        nodeTree,
      } = processGraphData(file.content);

      const allTech = new Set<string>();
      processedNodes.forEach((node) => {
        if (node.tags_tecnologia) node.tags_tecnologia.forEach((t) => allTech.add(t));
      });

      const uniqueNodeTypes = Array.from(new Set(processedNodes.map((n) => n.tipo_elemento))).sort();

      setGraphData(file.content as GraphData);
      setAllNodes(processedNodes);
      setAllLinks(processedLinks);
      setAggregates(processedAggregates);
      setTechnologies(Array.from(allTech).sort());
      setNodeTypes(uniqueNodeTypes);
      setSidebarNodeTree(nodeTree);

      return {
        graphData: file.content as GraphData,
        nodes: processedNodes,
        links: processedLinks,
        aggregates: processedAggregates,
        nodeTree,
      };
    } catch (error) {
      console.error("Error processing graph data:", error);
      throw error;
    }
  }, []);

  return {
    graphData,
    allNodes,
    allLinks,
    aggregates,
    technologies,
    nodeTypes,
    sidebarNodeTree,
    loadFile,
  };
}
