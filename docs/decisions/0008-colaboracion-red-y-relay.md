# ADR 0008 — Colaboración: red P2P y relays públicos como respaldo

Issues: #749 · #746 (PR #743)

- **Fecha:** 2026-11-10
- **Estado:** aceptado. Entregado en 0.23.0 (PR #743); este ADR documenta la decisión del mantenedor.
- **Contexto previo:** [colaboración](../collaboration.md) · [relay propio](../../deploy/collaboration/README.md) ·
  [ADR 0005](0005-edicion-web-empresarial.md)

## Estado y mecanismo

Lo que hace cumplir cada decisión:

- **Sin servidor que guarde proyectos.** El proyecto vive en los equipos de los participantes; el anfitrión
  sirve las copias. El relay sólo transporta paquetes. No hay código de servidor propio en el repo:
  `deploy/collaboration/` usa el binario oficial `iroh-relay`.
- **Cifrado de extremo a extremo.** QUIC entre las identidades de los dispositivos (Iroh). El relay no tiene
  la llave del proyecto.
- **Entrada acotada antes de autenticar.** `main/services/collaboration/wire.ts` corta en 96 MiB por mensaje y
  en 4 KiB antes de autenticarse. `engine.ts` valida ids, invitaciones y proyectos (`assertEncodedProject`).
- **Las rutas no compiten.** `src/lib/collaboration/capacity.ts` (`Seats`) reserva cupos por ruta: un relay
  saturado no bloquea a quien entra por LAN o P2P directo. Lo prueba
  `main/services/collaboration/__tests__/self-hosted-and-conflicts.test.ts`.
- **El relay propio funciona.** El job `relay` de `.github/workflows/collaboration.yml` levanta
  `iroh-relay` 1.4.1 y prueba la carga sin UDP, con latencia simulada.

## Contexto

La feature de colaboración (#743) conecta a los participantes con [Iroh](https://github.com/n0-computer/iroh):

1. LAN, con descubrimiento multicast;
2. P2P directo por Internet, atravesando NAT;
3. relay, cuando no hay ruta directa.

Por defecto el motor usa el preset público de n0 (`RelayMode.defaultMode()` en `engine.ts`): relays gratuitos,
sin cuenta y operados por un tercero.

Eso choca con dos promesas del producto: «no hay backend propio» (`CLAUDE.md`) y «los proyectos viven en el
equipo del usuario» (`SECURITY.md`). Los relays públicos no guardan el proyecto ni lo pueden leer, pero sí ven
metadatos: que dos identidades se conectan, cuándo y cuánto tráfico pasa. Además no garantizan disponibilidad;
n0 los recomienda para desarrollo y pruebas.

## Decisión

1. **Relays públicos de n0 por defecto.** Compartir un proyecto funciona sin configurar nada, desde redes
   distintas. Es la experiencia que pide una app de escritorio sin infraestructura propia.
2. **Relay propio como opción.** Quien necesite control de los metadatos o disponibilidad garantizada despliega
   `iroh-relay` (`deploy/collaboration/`) y pasa su URL al crear la sala (`options.relayUrls`). Con una URL
   propia, el relay público deja de ser la única ruta de respaldo.
3. **La colaboración es opt-in.** Nada sale a la red hasta que el usuario vincula un proyecto. Sin vincular,
   la app sigue offline como antes (P4 y P7 no cambian).
4. **«Sin backend propio» sigue siendo cierto, con una aclaración.** El proyecto no tiene servidor que guarde
   datos. El único servicio de terceros que puede intervenir es un relay de transporte cifrado, y sólo cuando
   el usuario colabora.

## Consecuencias

- `CLAUDE.md` y `SECURITY.md` nombran la excepción: con la colaboración activa, el tráfico puede pasar por un
  relay de terceros, cifrado de extremo a extremo.
- La disponibilidad remota depende de un servicio sin SLA. Si los relays públicos caen, siguen funcionando LAN
  y P2P directo; quien dependa de colaborar a distancia debe tener su relay.
- El anfitrión debe estar encendido para que los demás sincronicen, porque el relay no almacena. Para un
  anfitrión permanente está `scripts/collaboration-host.ts`.
- Deuda: la URL del relay propio se configura al crear la sala. No hay un ajuste global en la interfaz.

## Alternativas descartadas

- **Relay propio obligatorio.** Daría control total, pero cada equipo tendría que operar un servidor antes de
  compartir el primer proyecto: contradice «se configura sola» y deja fuera a quien no tiene IP pública.
- **Preguntar al compartir.** Haría explícita la decisión, pero agrega un paso técnico (qué es un relay) en el
  momento de invitar, para una diferencia que la mayoría no puede evaluar. Queda como mejora posible si un
  cliente lo exige.
- **Backend propio con almacenamiento.** Resolvería la sincronización con todos apagados, pero rompe el
  principio de que los proyectos viven en el equipo del usuario y obliga a operar y asegurar un servicio.
