import { describe, it, expect } from "vitest";
import { EDGE_LABEL_MIN_HIT, edgeLabelBox, splitEdgeLabel } from "../edge-label";

describe("splitEdgeLabel", () => {
  it("parte `acción [nota]` en sus dos mitades", () => {
    expect(splitEdgeLabel("consume [HTTPS/JSON]")).toEqual({
      texto: "consume",
      nota: "HTTPS/JSON",
    });
  });

  it("sin corchete, todo es acción", () => {
    expect(splitEdgeLabel("usa")).toEqual({ texto: "usa" });
  });

  it("una etiqueta que es SÓLO la nota se muestra como nota", () => {
    expect(splitEdgeLabel("[JDBC]")).toEqual({ texto: "", nota: "JDBC" });
  });

  it("el corchete del medio es parte de la frase", () => {
    expect(splitEdgeLabel("lee [caché] antes de responder")).toEqual({
      texto: "lee [caché] antes de responder",
    });
  });

  it("corchete vacío o sin abrir no inventa nota", () => {
    expect(splitEdgeLabel("publica []")).toEqual({ texto: "publica" });
    expect(splitEdgeLabel("publica evento]")).toEqual({ texto: "publica evento]" });
  });

  it("tolera vacío, nulo y espacios", () => {
    expect(splitEdgeLabel(undefined)).toEqual({ texto: "" });
    expect(splitEdgeLabel(null)).toEqual({ texto: "" });
    expect(splitEdgeLabel("  cobra   [API]  ")).toEqual({ texto: "cobra", nota: "API" });
  });
});

describe("edgeLabelBox", () => {
  it("dimensiona el halo con el renglón más largo", () => {
    expect(edgeLabelBox("usa", "", 5)).toEqual({ width: 25, height: 20 });
    expect(edgeLabelBox("consume", "HTTPS/JSON", 5)).toEqual({ width: 60, height: 30 });
  });

  it("un enlace SIN etiqueta conserva un blanco donde hacer doble clic (#619)", () => {
    const box = edgeLabelBox("", "", 5);
    expect(box.width).toBe(EDGE_LABEL_MIN_HIT);
    expect(box.height).toBe(20);
  });
});
