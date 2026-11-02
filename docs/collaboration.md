# Colaboración en un proyecto compartido

Esta rama conserva el monolito de escritorio por capas. Agrega colaboración al
proyecto completo: modelo, vistas, documentación de referencia, adjuntos incluidos
en los componentes, artefactos/versiones y resultados de análisis. El chat, llaves
de proveedores, carpetas locales, organización local, selección y zoom no forman
parte del documento compartido.

## Uso

1. Abre un proyecto y pulsa **Colaborar**. Elige el nombre que verán los demás.
2. Pulsa **Vincular este proyecto y ser anfitrión**. Para redes diferentes puedes
   configurar antes un relay propio o una dirección pública UDP conocida.
3. Genera una invitación con permiso de edición o lectura. Cada invitación se
   vincula al primer equipo que la usa; genera otra para la siguiente persona.
4. La otra persona pega la invitación en **Colaborar → Vincular una copia y unirme**.
   Se crea una copia local separada; no se sustituye su proyecto anterior.
5. El vínculo se recuerda al cerrar. Al abrir otro día se intercambian los cambios
   pendientes en ambos sentidos. El anfitrión debe tener su aplicación abierta.

Los punteros muestran nombre, color e identidad abreviada. También se muestran las
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

El servicio usa [Iroh](https://github.com/n0-computer/iroh) con el preset mínimo:
no configura relays públicos ni descubrimiento de proveedores. El binding
[iroh-js](https://github.com/n0-computer/iroh-ffi) funciona mediante N-API.

Orden de conexión:

1. Direcciones LAN, incluyendo descubrimiento multicast local del mismo
   identificador permanente del anfitrión.
2. Direcciones directas conocidas y los mecanismos de conexión de Iroh.
3. Los relays propios que configure el usuario, con cifrado QUIC de extremo a
   extremo entre los equipos. Iroh puede mejorar la ruta a directa cuando exista.

Una sala admite simultáneamente personas por LAN, conexión directa de Internet
y relay: la ruta se decide por conexión, no para toda la sala. Iroh intenta
mejorar las conexiones retransmitidas a directas en segundo plano. El servicio
observa sus cambios de ruta; no cierra una conexión útil para buscar otra ni
hace un sondeo intensivo desde la interfaz. La ruta LAN se reconoce con la
máscara real de la interfaz. Véase la [explicación de Iroh sobre las rutas](https://www.iroh.computer/blog/iroh-on-QUIC-multipath).

El descubrimiento LAN es opcional: algunas redes bloquean multicast o aíslan los
clientes Wi-Fi. Si cambia la dirección de Internet y no hay relay disponible, una
persona ya vinculada puede pegar una invitación nueva en **El anfitrión cambió de
red → Actualizar dirección**. Se exige el mismo proyecto y la misma identidad del
anfitrión; se conserva su permiso anterior y su trabajo pendiente.

No se puede garantizar conectividad en absolutamente todas las redes. Si una red
bloquea tanto las rutas directas como el relay configurado, deberá permitir una
ruta. CGNAT, aislamiento Wi-Fi, ancho de banda y cortafuegos son límites reales.

El software no exige una suscripción ni establece una cuota comercial de usuarios.
El equipo anfitrión, el relay si hace falta, electricidad y conexión son recursos
aportados por los participantes. Véase [relay propio](../deploy/collaboration/README.md).

## Capacidad y permisos

Al crear la sala se mide el tamaño real del documento y el tiempo de cargar y
proyectar una réplica, y se reserva un presupuesto de memoria y procesamiento.
La estimación incluye al anfitrión. La admisión reserva el cupo de forma síncrona;
una reconexión de la misma identidad no ocupa dos plazas. Las membresías se
recuerdan, mientras que los cupos corresponden a conexiones activas.

La capacidad se vuelve a evaluar durante la sesión. Una bajada detiene nuevas
admisiones, sin expulsar a quienes ya trabajan. La interfaz indica que la subida
no está medida: esta versión no convierte las características del hardware en una
garantía de rendimiento de la red. No hay una prueba de carga que certifique el
número estimado con cientos de participantes reales.

Las invitaciones son credenciales privadas. El anfitrión puede revocar equipos.
Los lectores reciben cambios y presencia, pero no pueden publicar ediciones; el
servidor comprueba el permiso, además de los controles de la interfaz. Solo se
admiten transferencias grandes después de una negociación autenticada pequeña.

## Cambios concurrentes y recuperación

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
La recuperación incluye el estado visible, las marcas de borrado, los valores
históricos y el documento CRDT. No existe todavía una interfaz para elegir y
restaurar automáticamente cada valor conflictivo del historial.

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

Límites verificados: pruebas locales de Windows, procesos separados y relay propio
local. La prueba del relay también comprueba rutas simultáneas distintas y mejora
a directa conservando la conexión. La prueba del editor utiliza ventanas nativas
y mide posiciones intermedias del puntero, arrastre y flecha en construcción.
Comprueba el puerto de origen con componentes sin dimensiones persistidas y que
un doble evento de soltar produzca una sola conexión. La conectividad entre
proveedores de Internet distintos y las salas grandes necesitan validación adicional en esos entornos.
Hay límites técnicos de 32 MiB por actualización del registro y 48 MiB por frame de
transporte; un exceso se informa como error, sin confirmación de guardado.
