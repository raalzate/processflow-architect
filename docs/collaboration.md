# Colaboración en un proyecto compartido

Al incorporarse otra persona se habilitan [ramas, versiones e historial visual](collaboration-branches.md).
Principal conserva lo aprobado y Trabajo compartido continúa la edición en vivo.

Esta rama conserva el monolito de escritorio por capas. Agrega colaboración al
proyecto completo: modelo, vistas, documentación de referencia, adjuntos incluidos
en los componentes, artefactos/versiones y resultados de análisis. El chat, llaves
de proveedores, carpetas locales, organización local, selección y zoom no forman
parte del documento compartido.

## Uso

1. Abre un proyecto y pulsa **Colaborar**. Elige el nombre que verán los demás.
2. Pulsa **Vincular este proyecto y ser anfitrión**. La conexión se configura sola:
   no se introducen IP, puertos, servidores ni credenciales de un proveedor.
3. Genera una invitación con permiso de edición o lectura. Cada invitación se
   vincula al primer equipo que la usa; genera otra para la siguiente persona.
4. La otra persona pega la invitación en **Colaborar → Vincular una copia y unirme**.
   Se crea una copia local separada; no se sustituye su proyecto anterior.
5. El vínculo se recuerda al cerrar. Al abrir otro día se intercambian los cambios
   pendientes en ambos sentidos. El anfitrión debe tener su aplicación abierta.

Los punteros muestran sólo el nombre y color de cada persona. También se muestran las
selecciones, una vista previa del arrastre y la flecha que otra persona está
trazando para conectar componentes. El movimiento se interpola entre paquetes.
La flecha parte del puerto seleccionado, con la misma geometría que el componente
real, y se convierte en una sola arista persistente al completar la conexión.
Su guía temporal se oculta al recibir el enlace definitivo. Esta presencia es temporal: no se
escribe en el historial, se limita su frecuencia y caduca al desconectarse.

## Varias vistas y ventanas

Todas las personas se unen al mismo proyecto; no se crean grupos separados.
Cada una puede elegir una vista diferente sin mover la navegación de las demás.
**Abrir proyecto en otra ventana** permite trabajar en otra vista del mismo
proyecto desde otra ventana nativa. Las ventanas comparten documento y permisos,
conservan su navegación y tienen presencia temporal separada. Una ventana extra
de la misma instalación no reserva otra plaza de la sala.

## Continuar días después

Cada dispositivo guarda una identidad criptográfica y un registro del documento
en su directorio de datos. Los cambios se confirman después de escribir y ejecutar
`fsync`, y los vínculos y permisos se guardan aparte de la interfaz. No hace falta
volver a importar el proyecto ni intercambiar archivos cada día.

Si Ana trabaja un día y Luis abre dos días después, Luis recibe lo que ya esté en
el anfitrión y envía sus cambios locales. Si el único equipo que tiene un cambio
está apagado, ese cambio llegará cuando dicho equipo vuelva a conectar. Un relay
de conectividad no almacena el proyecto ni entrega cambios con todos apagados.

Para mantener un anfitrión encendido sin abrir el editor se puede ejecutar el
mismo servicio desde una máquina propia:

```sh
npx tsx scripts/collaboration-host.ts ./datos-equipo tablero.json
```

El primer arranque crea el proyecto y muestra una invitación privada para un
equipo. Para reanudar sin generar otra invitación:

```sh
npx tsx scripts/collaboration-host.ts ./datos-equipo
```

Conserva ese directorio y no ejecutes dos anfitriones sobre el mismo directorio.
Puedes pasar una URL de relay como cuarto argumento en el primer comando. Para
agregar varios participantes desde este modo, utiliza el editor de escritorio
como anfitrión y administra sus invitaciones allí; el CLI mínimo imprime una por
arranque con el tablero indicado. No sincroniza carpetas de datos por Dropbox/Git.

## Redes distintas

El servicio usa [Iroh](https://github.com/n0-computer/iroh) con el preset público n0:
descubrimiento por identidad y respaldo de relays gratuitos ya configurados. El binding
[iroh-js](https://github.com/n0-computer/iroh-ffi) funciona mediante N-API.

Orden de conexión:

1. Direcciones LAN, incluyendo descubrimiento multicast local del mismo
   identificador permanente del anfitrión.
2. Direcciones directas conocidas y los mecanismos de conexión de Iroh.
3. Los relays públicos gratuitos de Iroh, con cifrado QUIC de extremo a extremo.
   Iroh puede mejorar la ruta a directa cuando exista. Las configuraciones antiguas
   de relay propio se conservan como rutas adicionales, sin exigirlas al usuario.

Una sala admite simultáneamente personas por LAN, conexión directa de Internet
y relay: la ruta se decide por conexión, no para toda la sala. Iroh intenta
mejorar las conexiones retransmitidas a directas en segundo plano. El servicio
observa sus cambios de ruta; no cierra una conexión útil para buscar otra ni
hace un sondeo intensivo desde la interfaz. La ruta LAN se reconoce con la
máscara real de la interfaz. Véase la [explicación de Iroh sobre las rutas](https://www.iroh.computer/blog/iroh-on-QUIC-multipath).

El descubrimiento LAN es opcional: algunas redes bloquean multicast o aíslan los
clientes Wi-Fi. Iroh mantiene el descubrimiento por identidad y puede recuperar la
dirección tras un cambio de red sin pedir una IP al usuario. Las copias vinculadas
reintentan automáticamente y conservan sus cambios mientras no exista una ruta.

No se puede garantizar conectividad en absolutamente todas las redes. Si una red
bloquea tanto las rutas directas como el respaldo público, deberá permitir una
ruta. CGNAT, aislamiento Wi-Fi, ancho de banda y cortafuegos son límites reales.

El software no exige una suscripción ni establece una cuota comercial de usuarios.
Los [relays públicos](https://www.iroh.computer/services/hosting) no requieren cuenta
ni pago, pero tienen tráfico variable, no garantizan disponibilidad y se recomiendan
para desarrollo y pruebas. No son un servicio ilimitado ni alojan los documentos.
El equipo anfitrión y su conexión los aportan los participantes.

## Capacidad y permisos

Al crear la sala se mide el tamaño real del documento y el tiempo de cargar y
proyectar una réplica, y se reserva un presupuesto de memoria y procesamiento.
El presupuesto de CPU distingue la carga inicial del trabajo recurrente y se ajusta
con el tiempo observado de servicio de las sincronizaciones siguientes.
La estimación incluye al anfitrión. La admisión reserva el cupo de forma síncrona;
una reconexión de la misma identidad no ocupa dos plazas. Las membresías se
recuerdan, mientras que los cupos corresponden a conexiones activas.

La capacidad se vuelve a evaluar durante la sesión y antes de admitir una nueva
identidad. Una bajada detiene nuevas admisiones en la ruta saturada, sin expulsar a
quienes ya trabajan. Se observa la ventana de envío y RTT de las rutas seleccionadas,
junto con los bytes de ediciones y presencia de los últimos cinco segundos, separando
los presupuestos de red local (LAN), P2P directo e intermediario (relay): un límite en
relay nunca bloquea ni reduce el cupo disponible para quienes entran por LAN o por P2P
directo, y cuando una conexión por relay mejora a P2P directo en segundo plano libera
automáticamente su plaza de relay. La ventana inicial de QUIC no se usa como límite de
subida: mientras las rutas no acumulen tráfico suficiente se muestra una estimación en
calibración. Tras calibrar, se reserva margen de red por ruta y se respeta el tope de
memoria y procesamiento del anfitrión. El anfitrión cuenta una sola vez, fuera de las
plazas que consumen subida. No se ejecuta un test de velocidad ni se garantiza un máximo
exacto, y no hay una prueba de carga con cientos de participantes reales.

Las invitaciones son credenciales privadas. El anfitrión puede revocar equipos.
Los lectores reciben cambios y presencia, pero no pueden publicar ediciones; el
servidor comprueba el permiso, además de los controles de la interfaz. Solo se
admiten transferencias grandes después de una negociación autenticada pequeña.

## Cambios concurrentes y recuperación

El anfitrión avisa por el canal cifrado después de guardar un cambio. Los demás
programan una sincronización agrupada a 40 ms; si el aviso se pierde, la consulta
periódica sigue recuperando los cambios. Un aviso durante una sincronización deja
trabajo pendiente, sin lanzar conexiones paralelas. Las actualizaciones vacías
no clonan todo el documento y la validación reutiliza una réplica candidata;
una actualización inválida descarta esa candidata sin alterar el estado válido.

El documento usa [Yjs](https://github.com/yjs/yjs). Contenedores, componentes,
relaciones y colecciones con identificadores se representan por identidad estable;
se combinan campos diferentes, no se sustituye el JSON completo recibido por red.

Ejemplo probado: ambos conocen A y B; uno se desconecta y crea A → B, mientras el
otro renombra y mueve B. Al conectar y aun después de reiniciar ambos procesos,
se conserva la relación y se reflejan los cambios de B en ambos equipos.

Una relación cuyos extremos aún no llegaron queda pendiente. No se inventan
conexiones por semejanza de nombres. Un borrado observado se representa con una
marca y no revive por una edición vieja. Una restauración explícita puede volver
a mostrar el componente. El historial local del lienzo incorpora los cambios
remotos para que deshacer un paso propio conserve el trabajo de otra persona.

Si dos personas cambian exactamente el mismo campo, Yjs elige un valor convergente;
ambas ediciones quedan en el historial de recuperación. Los textos y el código
Mermaid se combinan como campos completos, no como un editor de texto por carácter.
Cuando ocurre una edición simultánea sobre el mismo campo, la interfaz muestra un
aviso para comparar el valor actual en pantalla con la otra edición simultánea y
elegir entre **Mantener actual** o **Restaurar este valor**, sincronizando la
resolución con los demás participantes. La exportación de recuperación también
incluye el estado visible, las marcas de borrado, los valores históricos y el
documento CRDT.

**Descargar JSON** conserva los datos compartidos adicionales. El archivo de
**Descargar recuperación** también abre como una copia independiente con la
importación normal; no contiene invitaciones, llaves privadas, chat ni presencia.
Los datos del historial de recuperación se conservan como material adicional para
inspección. Importar una copia no la vuelve miembro de la sala automáticamente.

El registro detecta corrupción y repara solamente un último frame incompleto.
Las actualizaciones remotas se validan en una réplica candidata antes de modificar
el documento vivo o escribir el registro. Una sala con un historial anterior
inválido queda en cuarentena y no impide abrir las demás. Si no puede proyectarse,
su recuperación contiene el CRDT o registro crudo, para reparación posterior;
ese formato crudo no se importa como un tablero visible automáticamente.
Tras un fallo de escritura no se confirma más trabajo ni se vuelve a marcar como
guardado una réplica que contiene cambios sin persistir. La aplicación ofrece la
recuperación y conserva las copias de los demás participantes.

La validación del grafo deriva de sus tipos persistentes, incluidos campos
opcionales y datos ocultos por borrados. Si esos tipos cambian, ejecutar
`npm run collaboration:schema`; una prueba detecta un esquema desactualizado.

## Implementación y validación

El destino de escritorio es Windows, macOS y Linux. La matriz de integración
incluye Windows x64, Linux x64, Mac con Apple Silicon y Mac Intel. Los instaladores
incluyen el binding nativo: quien usa la aplicación no necesita Rust ni Node.

Para desarrollar o empaquetar en Mac Intel, la versión 1.2.0 de Iroh no publica
un binario x64. `npm run collaboration:prepare-native` compila el mismo binding
desde una revisión oficial fijada e instala su archivo generado en el paquete.
También se ejecuta antes de `npm run build` y `npm run electron-dev`. Se requieren
Git, Rust >=1.91, CMake y las herramientas de línea de comandos de Xcode sólo en
la máquina que compila esa variante. El script conserva la fuente y el caché
fuera del repositorio y rechaza revisiones o fuentes locales modificadas.
En las otras plataformas se utilizan los paquetes nativos publicados.
El empaquetado manual permite elegir `macos-latest` (Apple Silicon) o
`macos-15-intel`. Cada ejecución genera una variante de Mac, evitando colisiones
de instaladores o de sus metadatos de actualización.

El [kit SDD local](harness/sdd.md) está incluido en el clon y no requiere el kit
privado Sofka. Sus comprobaciones se ejecutan también en la matriz de CI.

- `src/lib/collaboration`: identidad, proyección del grafo, combinación CRDT,
  políticas de capacidad, rutas, presencia y cola de proyecciones.
- `main/services/collaboration`: persistencia y transporte nativo, descubrimiento
  LAN, autenticación, permisos y admisión. El CLI reutiliza este servicio.
- `preload.ts` e IPC: puente tipado; no se expone Node ni el registro a la página.
- `CollaborationProvider`: coordina los contextos existentes y mantiene privados
  los datos que pertenecen al dispositivo.
- `ComponentDesigner`: aplica diferencias remotas conservando viewport, selección,
  borradores y posición del historial. La presencia se dibuja en otra capa SVG.

Comandos de verificación:

```sh
npm run typecheck
npm test
npm run test:collaboration
npm run gate
# Internet real, fuera del gate de pruebas offline:
npx tsx scripts/collaboration-internet-smoke.ts
# Carga local P2P: varios perfiles nativos y 100 componentes, sin red pública:
npx tsx scripts/collaboration-load.ts ../p2p-load.json 40
# Con un relay propio local ya ejecutándose:
npx tsx scripts/collaboration-relay-smoke.ts http://[::1]:3340
```

`scripts/collaboration-ui-smoke.ts` prueba dos perfiles Electron a través de sus
puertos de depuración locales 9227/9228 (configurables con
`PROCESSFLOW_TEST_HOST_PORT` y `PROCESSFLOW_TEST_GUEST_PORT`). Usa perfiles
aislados y eventos DOM para evitar diferencias
de foco/oclusión de Windows; el preload, IPC, guardado y conexión son reales.
Esos puertos se habilitan solo al lanzar las instancias de prueba, no en la app
normal. `PROCESSFLOW_COLLAB_DATA` permite aislar los perfiles de prueba. La preview
tiene además nombre, appId, carpeta de datos y destino de actualizaciones propios.

Límites verificados: pruebas locales de Windows, procesos separados, relay propio
local y conexión autenticada por un relay público sin direcciones directas ni
descubrimiento en el cliente de prueba. La prueba de Internet combina un participante
inicialmente por relay y otros por LAN, hasta seis participantes contando el anfitrión.
El job `relay` de CI ejecuta además carga sostenida con UDP bloqueado para un usuario
de prueba, relay propio y demora de red controlada en el loopback del runner efímero;
exige que todas las rutas sigan siendo relay y publica los resultados en `relay-load`.
La prueba del relay propio también comprueba rutas simultáneas distintas y mejora
a directa conservando la conexión. La prueba del editor utiliza ventanas nativas
y mide posiciones intermedias del puntero, arrastre y flecha en construcción.
Comprueba el puerto de origen con componentes sin dimensiones persistidas y que
un doble evento de soltar produzca una sola conexión. La conectividad entre
proveedores de Internet distintos y las salas grandes necesitan validación adicional en esos entornos.
Hay límites técnicos de 32 MiB por actualización del registro y 48 MiB por frame de
transporte; un exceso se informa como error, sin confirmación de guardado.
