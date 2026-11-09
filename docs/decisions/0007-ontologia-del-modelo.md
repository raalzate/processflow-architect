# ADR 0007 — Ontología del modelo: motor propio, reglamento por rol

Issues: #697 (feature 027) · tareas #698–#735

- **Fecha:** 2026-11-09
- **Estado:** aceptado. Entregado en F1–F5: PR #736, #737, #738, #739 y #740.
- **Contexto previo:** [ADR 0005](0005-edicion-web-empresarial.md) (el renderer no sabe en qué host corre) ·
  [catálogo de reuso](../architecture/reuse-patterns.md)

## Estado y mecanismo

Lo que hace cumplir cada decisión:

- **El reglamento sale del registro.** `tboxDe` (`src/lib/ontology/tbox.ts`) deriva clases y predicados de `src/lib/notations.ts`, y `checkTbox` lo verifica en las 6 notaciones (`tbox.test.ts`). La regla NOTACION del lint impide cablear tipos en `ontology/`.
- **Las formas reemplazan las reglas semánticas de calidad sin cambiar lo que dicen.** `quality-parity.test.ts` compara contra un golden congelado sobre 20 diagramas.
- **El RDF exportado es válido.** `export-rdf.test.ts` lo parsea con `n3` (devDependency sólo de pruebas, R-08).
- **Las tareas de IA son `AiTask`.** `tasks-registry.test.ts` barre `suggest-predicate`, `suggest-equivalences` y `propose-facts`.
- **Rendimiento:** el mecanismo se prueba en `performance.test.ts` y el tiempo se mide fuera del gate con `scripts/bench-ontology.ts` (regla RELOJ).
- **La IA consulta en vez de adivinar:** `scripts/eval-ontology-agent.ts`, fuera del gate. La corrida está en #697: con Gemma 4 E4B local, 67% de exactitud sin grafo y 80% con grafo.

## Contexto

El diagrama era dibujo: las flechas tenían una etiqueta libre y nadie podía preguntar «¿qué termina provocando *Pagar*?» sin leerlo a ojo. La feature 027 lo convierte en conocimiento:
- un reglamento por notación (TBox);
- los diagramas como hechos (ABox);
- un razonador;
- validación por formas;
- consultas, que usan el MCP y el agente local;
- vínculos entre vistas;
- export estándar;
- historial derivado.

## Decisión

1. **Motor propio, sin librería RDF/OWL en runtime** (R-01). Un `TripleStore` con índices SPO/POS/OSP y un razonador *semi-naive* con un perfil acotado: subclase, dominio, rango, inversa, transitiva, simétrica, subpropiedad y equivalencia.
   - Un razonador OWL completo pesa megas y no da explicaciones legibles.
   - El perfil alcanza para las 10 preguntas de competencia y cada deducción guarda su justificación («¿por qué?»).
   - `n3` entra sólo como devDependency, para validar el export.
2. **Predicados y formas se declaran por ROL en `notations.ts`** (R-02, R-05), junto a `ELEMENT_ROLES`, nunca por tipo. Una notación nueva hereda reglamento y validación sin tocar `ontology/` (P6).
3. **Mundo abierto para deducir, mundo cerrado para validar.**
   - Dominio y rango sólo clasifican cuando declaran una clase.
   - Las formas cuentan sobre lo explícito más lo deducido.
   - Una consulta sin filas responde «desconocido en el modelo», no «falso».
4. **Lo deducido no se dibuja ni se guarda** (FR-017). Se recalcula y se muestra en la ficha (pestaña «Conocimiento»).
5. **Un Agente y una Frontera no son el mismo elemento** (decisión Q8). Las clases generales son disjuntas. El Sistema *Pagos* **realiza** el Contexto *Pagos*: no «es el mismo que». Contexto ≡ Pool sí, porque ambos son Frontera. La consulta de impacto (PC-07) sigue «realiza».
6. **Los vínculos entre vistas y las propuestas de la IA pasan por el humano** (FR-036). Se sugieren en memoria; sólo lo aceptado se persiste, con su procedencia.
7. **Turtle sin grafos nombrados.** Lo deducido va en un segundo bloque declarado; en JSON-LD, en un grafo nombrado.
8. **El historial se deriva, no se guarda** (R-09). Se compara el proyecto con otra versión que el humano elige; el archivo no crece.

## Consecuencias

- `quality.ts` delega las reglas semánticas en `ontology/validate.ts`: una regla semántica nueva es una forma en el registro, no un `if` en `quality.ts`.
- El contexto de la IA local suma el subgrafo del foco (`contextoParaIA`, 1 500 caracteres): más exactitud en preguntas de varios saltos, a cambio de más ventana.
- Deuda: `n3` no tiene tile de Tessl (está declarada en `tiles.allow`).
- Pendiente: medir el agente en la app (Q14) y verificar sin red (T37), que son manuales.

## Alternativas descartadas

- **Librería RDF + razonador OWL en runtime:** peso, explicaciones opacas y una dependencia más para el bundle.
- **Copiar la clase en la equivalencia:** volvería disjunto todo vínculo entre notaciones.
- **Snapshots automáticos para el historial:** contradice «sin registro aparte».
