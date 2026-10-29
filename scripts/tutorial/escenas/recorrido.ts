/**
 * @fileOverview Escena «recorrido»: la app de punta a punta en ~4 min (#664).
 *
 *   npx tsx scripts/tutorial/escenas/recorrido.ts <dir>     # <dir>/voz/bNN.mp3 ya generados
 *
 * Cada `voz(i)` corresponde al párrafo i de `recorrido.guion.txt`. Si cambiás el
 * guion, regenerá la voz: la escena sigue sola, porque espera a cada frase.
 * Las coordenadas fijas (x, y) suponen la ventana de 1440×900 del kit.
 */

import { iniciar, wait } from "../kit";

const dir = process.argv[2];
if (!dir) throw new Error("uso: recorrido.ts <dir-de-salida>");

(async () => {
  const t = await iniciar(dir, { grabar: process.env.REC !== "0" });
  const { page: p } = t;
  const fuera = (x = 1240, y = 700) => t.moveTo(x, y, 500);

  // 0 · Portada
  await t.card("Processflow Architect", "Tutorial rápido · Event Storming con IA local", 4500, 0);

  // 1 · Galería de la organización
  await t.voz(1);
  await t.say("Tus proyectos viven en organizaciones", "", 2500);
  await t.click('button[title^="Filtro de organización"]');
  await wait(700);
  await t.clickText("Aseguradora Andina");
  await wait(800);
  await t.say("Cada tarjeta resume un proyecto", "notación · elementos · relaciones · hotspots", 2500);
  for (const x of [330, 745, 1160]) {
    await t.moveTo(x, 330, 800);
    await wait(1200);
  }
  await t.voz(2);
  await t.say("DDD, C4 y BPMN conviven en la misma organización", "", 3000);
  await t.say("Abramos el Event Storming");
  await t.clickText("Volver al proyecto abierto");
  await wait(1500);

  // 2 · Lienzo
  await t.click('button[title="Ajustar a contenido"]');
  await fuera();
  await t.voz(3);
  await t.say("El lienzo: tu Big Picture", "Cotización → Póliza → Cobro", 3500);
  await t.say("Contenedores agrupan por agregado", "borde discontinuo = agregado", 1000);
  for (const y of [300, 420, 545]) {
    await t.moveTo(640, y, 800);
    await wait(900);
  }
  await t.voz(4);
  await t.say("Comandos disparan eventos; políticas reaccionan", "", 1000);
  {
    const f = await t.nodeBox("Prima cobrada");
    t.zoom(f.x + f.w / 2, f.y + f.h / 2 + 30, 1.7);
    await wait(700);
    for (const n of ["Cobrar prima", "Prima cobrada", "Al cobrar, activar póliza"]) {
      const b = await t.nodeBox(n);
      await t.moveTo(b.x + b.w / 2, b.y + b.h / 2, 700);
      await wait(1400);
    }
  }
  t.unzoom();
  await fuera();

  // 3 · Paleta
  await t.voz(5);
  await t.say("La paleta cambia según la notación", "aquí: DDD / Event Storming", 300);
  t.zoom(165, 420, 1.8);
  await wait(700);
  await t.moveTo(110, 230, 900); await wait(1200);
  await t.moveTo(110, 470, 800); await wait(800);
  await t.moveTo(222, 520, 500); await wait(1500);
  t.unzoom();

  // 4 · Arrastrar y renombrar
  await t.voz(6);
  await t.say("Arrastra un elemento al lienzo");
  await t.dragTile("Evento", 1120, 470);
  await wait(600);
  t.zoom(1050, 470, 1.8);
  await wait(900);
  await t.say("Doble clic en el texto para renombrar");
  {
    const nb = await t.nodeBox("Evento");
    await t.moveTo(nb.tx, nb.ty, 600); await wait(300);
    await p.mouse.click(nb.tx, nb.ty, { count: 2 }); await wait(500);
    await p.keyboard.down("Meta"); await p.keyboard.press("a"); await p.keyboard.up("Meta");
    await t.type("Póliza renovada");
    await wait(400);
    await p.keyboard.press("Enter");
  }
  await fuera(1150, 650);
  await wait(1500);

  // 5 · Conectar
  {
    const a = await t.nodeBox("Póliza activada");
    t.zoom(a.x + a.w / 2 + 200, a.y + a.h / 2, 1.6);
    await t.voz(7);
    await t.say("Pasa el ratón: aparecen 4 puertos");
    await t.moveTo(a.x + a.w / 2, a.y + a.h / 2, 700); await wait(1500);
    await t.say("Arrastra de un puerto a otro elemento", "así se crea la relación");
    await t.moveTo(a.x + a.w, a.y + a.h / 2, 500); await wait(400);
    await p.mouse.down();
    const b = await t.nodeBox("Póliza renovada");
    await t.moveTo(b.x + b.w / 2, b.y + b.h / 2, 1300);
    await wait(300);
    await p.mouse.up();
  }
  await fuera(1150, 650);
  await wait(1500);
  t.unzoom();
  await wait(500);

  // 6 · Ficha
  await t.voz(8);
  await t.say("Doble clic en la caja abre su ficha");
  {
    // Doble clic FUERA del texto: sobre el texto edita en línea (#643).
    const nb = await t.nodeBox("Prima cobrada");
    const x = nb.x + nb.w / 2, y = nb.y + nb.h - 8;
    await t.moveTo(x, y, 700); await wait(300);
    await p.mouse.click(x, y, { count: 2 });
  }
  await wait(900);
  t.zoom(1210, 430, 1.5);
  await wait(300);
  await t.say("Nombre, descripción, fuente, ícono y tipo", "se guarda solo, sin botón «Guardar»", 1000);
  await t.moveTo(1210, 300, 700); await wait(1500);
  await t.moveTo(1210, 410, 600); await wait(1500);
  await t.say("Pestaña Spec: criterios listos para un agente de código");
  await t.clickText("Spec");
  await wait(3500);
  t.unzoom();
  await t.clickText("Cerrar");
  await fuera();
  await wait(800);

  // 7 · Organizar + deshacer
  await t.voz(9);
  await t.say("Organizar reacomoda el diagrama", "por flujo, tiempo, capas, árbol, mosaico…");
  await t.click('button[title="Organizar el diagrama"]');
  await wait(400);
  t.zoom(330, 400, 1.5);
  await wait(1600);
  await t.clickText("Por capas (roles)");
  t.unzoom();
  await wait(2500);
  await t.say("¿No te gusta? Deshacer");
  await wait(800);
  await t.click('button[aria-label^="Deshacer"]');
  await wait(2500);

  // 8 · Opciones
  await t.voz(10);
  await t.say("Opciones: relaciones, exportar, contexto y metadatos");
  await t.click('button[title^="Relaciones, contexto"]');
  await wait(1000);
  await t.clickText("Exportar");
  t.zoom(600, 330, 1.5);
  await wait(2500);
  t.unzoom();
  await p.keyboard.press("Escape");
  await p.keyboard.press("Escape");
  await fuera();
  await wait(600);

  // 9 · Vistas y notaciones
  await t.voz(11);
  await t.say("Vistas: pestañas abajo, hasta 50 por proyecto");
  t.zoom(260, 720, 1.7);
  await t.moveTo(110, 880, 800); await wait(1200);
  await t.click('button[aria-label="Agregar vista"]');
  await wait(1000);
  await t.say("Seis notaciones", "DDD · BPMN · C4 · UML · MER · General", 3000);
  await t.clickText("BPMN (Procesos)");
  t.unzoom();
  await wait(2000);
  await t.say("Nueva vista BPMN con su propia paleta", "", 3500);
  await t.say("Vuelve al modelo con un clic");
  await t.click('button[title="Modelo"]');
  await wait(2000);

  // 10 · Búsqueda
  await t.voz(12);
  await t.say("Busca cualquier elemento del proyecto");
  await t.click('input[placeholder="Buscar elementos..."]');
  t.zoom(800, 200, 1.6);
  await t.type("prima");
  await wait(1800);
  await t.clickText("Prima rechazada");
  t.unzoom();
  await wait(2500);
  await p.keyboard.press("Escape");
  await fuera();

  // 11 · Agente de IA
  await t.voz(13);
  await t.say("Agente de IA: local por defecto", "Gemma sobre WebGPU · sin internet");
  await t.clickText("Mostrar el agente de IA");
  await wait(600);
  t.zoom(180, 330, 1.6);
  await wait(1900);
  await t.say("Pídele drivers, riesgos, ADRs o diagramas", "los artefactos llegan al lienzo");
  await t.moveTo(130, 370, 800); await wait(1500);
  await t.click("textarea");
  await t.type("Identifica riesgos del flujo de cobro");
  await wait(1500);
  await t.say("Con @ incluyes vistas en la conversación", "", 3000);
  t.unzoom();
  // Sin motor de IA en headless: el mensaje no se envía; se limpia y se cierra el panel.
  await p.evaluate(() => {
    const ta = document.querySelector("textarea");
    if (!ta) return;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(ta, "");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  });
  {
    const h = (await p.evaluateHandle(() =>
      [...document.querySelectorAll("button")].find((b) => /agente de IA/i.test((b.textContent ?? "") + b.title)) ?? null
    )).asElement();
    const bb = h && (await h.boundingBox());
    if (bb) await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  }
  await wait(1000);

  // 12 · Proyecto
  await t.voz(14);
  await t.say("Proyecto: nuevo, importar diagrama o Mermaid, descargar JSON");
  await t.click('button[title="Acciones de proyecto"]');
  await wait(300);
  t.zoom(1260, 230, 1.7);
  await wait(3200);
  t.unzoom();
  await p.keyboard.press("Escape");
  await fuera();
  await wait(500);

  // 13 · Ajustes
  await t.callar();
  await t.goto("/settings");
  await t.voz(15);
  await t.say("Ajustes · Motor de IA");
  await t.clickText("Motor de IA").catch(() => {});
  await wait(800);
  try {
    const h = await t.boxOfText("Híbrido");
    t.zoom(h.x + 120, h.y + 40, 1.6);
  } catch { /* sin la tarjeta a la vista no hay foco */ }
  await wait(1200);
  await t.say("Local por defecto; la nube es opcional", "Local · Híbrido · Remoto · Arnés");
  await t.clickText("Híbrido").catch(() => {});
  await wait(2500);
  await t.say("Híbrido: lo ligero local, lo pesado a la nube", "");
  await wait(2500);
  await t.say("Tus llaves van cifradas en tu equipo", "nunca salen del proceso principal", 3000);
  await t.clickText("Local").catch(() => {});
  await wait(1500);
  t.unzoom();

  // 14 · MCP
  await t.callar();
  await t.goto("/mcp");
  await t.voz(16);
  await t.say("Servidor MCP", "Claude Code o Codex diseñan por ti", 3000);
  await t.say("Los diagramas llegan directo al lienzo", "", 1000);
  await t.wheel(900, 500, 300, 4);
  await wait(2500);

  // 15 · Agrupador
  await t.callar();
  await t.goto("/merger");
  await t.voz(17);
  t.zoom(250, 110, 1.9);
  await t.say("Agrupador de nodos: fusiona duplicados", "mismo concepto, distinto nombre", 2800);
  t.unzoom();
  {
    // Radix Select responde a eventos reales: se abre con clic y se elige por typeahead.
    const elegir = async (i: number, texto: string) => {
      const vis = [];
      for (const c of await p.$$('button[role="combobox"]')) if (await c.boundingBox()) vis.push(c);
      const bb = (await vis[i].boundingBox())!;
      await t.moveTo(bb.x + bb.width / 2, bb.y + bb.height / 2, 700);
      await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await wait(600);
      await t.type(texto);
      await wait(400);
      await p.keyboard.press("Enter");
      await wait(1000);
    };
    await t.say("Elige tipo y el que se queda");
    await elegir(0, "Evento");
    await elegir(1, "Prima cobrada");
    await p.keyboard.press("Escape");
    await t.say("Marca los duplicados", "", 1000);
    await t.wheel(900, 600, 300, 3);
    await wait(2500);
  }

  // 16 · Documentación
  await t.callar();
  await t.goto("/docs");
  await t.voz(18);
  await t.say("Documentación integrada", "cada notación y cada componente, explicados", 3500);
  await t.wheel(700, 600, 250, 4);
  await wait(1500);

  // 17 · Cierre
  await t.callar();
  await t.goto("/");
  await t.card("Processflow Architect", "Entiende tu negocio · dibújalo con tu equipo", 5000, 19);

  await t.terminar();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
