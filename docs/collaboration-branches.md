# Ramas y versiones desde la pantalla

Un proyecto individual conserva el flujo habitual. Al vincularlo como proyecto compartido
se guarda una versión inicial y se habilitan permanentemente las ramas. El anfitrión
puede consultarlas aunque sea la única persona conectada.

## Qué aparece en la pantalla

Al consultar una versión anterior, un aviso visible indica **Solo lectura** y permite
**Volver a mi rama actual**. El borrador se conserva. Las descripciones de rama y vista
muestran a los compañeros que trabajan allí, incluyendo varias ventanas de una misma persona.

En ramas de trabajo las ediciones simultáneas ya usan el resultado automático del CRDT.
**Revisar alternativas** permite recuperar el otro valor sin interrumpir la edición.
Principal mantiene la revisión explícita de alternativas.

El chat del proyecto usa `manage_collaboration` para consultar ramas, versiones,
solicitudes, participantes, alternativas y conexiones incompletas; también para cambiar
de rama, guardar versiones, comparar, traer cambios, enviar a revisión, integrar y restaurar.
Solo el anfitrión puede usar IA para modificar Principal, aunque otra persona tenga permisos
de edición humana. El chat limitado a una caja no puede cambiar ramas ni el historial.
La reparación de conexiones usa `command=repair-connection`, `viewId`, `edgeId` y los
identificadores `sourceId`/`targetId`. Omitir ambos extremos retira la conexión conservando
los campos para recuperación. Deben elegirse extremos existentes en esa vista.

Cuando hay ramas activas, aparece en la cabecera un botón compacto con el icono de fusión
y el nombre de la rama activa junto a **Proyecto vinculado**, sin ocupar espacio sobre el
lienzo. Al abrir esa ventana emergente (**Ramas y versiones**) se muestra el rol actual
(**Anfitrión**, **Huésped** o **Huésped · Lectura**), el selector de **Rama activa** y solo
las acciones para las que la persona tiene permiso:

- **Edición en rama permitida**: **Nueva**, **Guardar versión**, **Traer cambios** (salvo en
  Principal) y **Enviar al anfitrión para fusionar** (o **Fusionar rama en Principal** para
  el anfitrión).
- **Rama en solo lectura** (por ejemplo, un huésped consultando Principal sin permiso de
  edición directa, o un participante con rol de lectura): se ocultan los botones de edición
  y envío; solo quedan disponibles el cambio de rama y **Historial**.
- **Solicitudes**: visible únicamente para el anfitrión o para un huésped al que el anfitrión
  haya concedido permiso expreso para aprobar fusiones. Un huésped sin permiso de aprobación
  no ve la sección ni la pestaña de solicitudes.
- **Permisos**: visible únicamente para el anfitrión.

**Principal** contiene lo aprobado. **Trabajo compartido** continúa la edición en
vivo anterior para que activar el historial no cambie lo que las personas tienen
abierto. Una o varias personas pueden editar cada rama. Cada ventana elige su
rama y vista independientemente. Los punteros, selecciones, arrastres y flechas
temporales corresponden a la misma rama y vista.

## Guardar y proponer una versión

1. Trabaja normalmente: las modificaciones se guardan dentro de la rama.
2. Abre la ventana emergente de ramas y pulsa **Guardar versión**. Escribe un nombre corto
   (y, si hay varias vistas, ajusta cuáles incluir) y confirma. Eso crea un **commit**: un
   punto guardado inmutable. Lo que no selecciones continúa como borrador en la rama.
3. Pulsa **Enviar al anfitrión para fusionar** y **Enviar solicitud**. Esto pide revisar
   esa versión para incorporarla a Principal. También puedes elegir una versión anterior en
   **Historial** y pulsar **Enviar al anfitrión**.
4. Solo al **anfitrión** le aparece una alerta pequeña flotante en la esquina con la solicitud
   y el botón **Revisar y fusionar**. Puede cerrarla con **×** para que no estorbe y seguir
   viendo y abriendo las solicitudes pendientes desde su ventana emergente principal de ramas
   (además del contador en el botón de la cabecera). Quien tenga permiso expreso de fusión
   puede comparar las vistas, resolver conflictos, aprobar o rechazar. Los cambios
   posteriores al commit propuesto quedan fuera.
5. Si dos personas editan en vivo el mismo campo dentro de una misma rama, aparece
   un aviso en la rama para elegir entre **Mantener actual** o **Restaurar este valor**.

Guardar automáticamente, guardar un commit y fusionarlo son acciones distintas.
Un commit en una rama compartida contiene las contribuciones visibles de esa rama
para las vistas seleccionadas; para revisiones individuales se pueden usar ramas
separadas. Los autores se vinculan a la identidad autenticada del dispositivo.

## Traer Principal sin perder el borrador

**Traer cambios** selecciona por defecto todas las vistas de la última versión
guardada en Principal. La comparación combina la base común, el borrador actual
de destino y la versión recibida. Conserva modificaciones compatibles, incluyendo
trabajo sin commit. Un mismo campo modificado de dos formas requiere una elección.
Eliminar un componente frente a crear una conexión también necesita resolución.

La revisión no modifica la rama y se puede cancelar. Antes de aplicar se comprueba
que el destino no haya cambiado y se guarda un punto de recuperación. Si cambió,
hay que revisar de nuevo. Una fusión parcial conserva cuáles vistas fueron
incorporadas para no dar por aprobadas las restantes. Las dependencias entre
vistas, como un nodo que abre un subdiagrama, deben quedar incluidas o corregidas;
el sistema no añade vistas silenciosamente.

## Historial, árbol y restauración

**Historial** muestra una lista y un árbol de versiones con ramas, autor y fecha.
Al hacer clic se consulta esa versión en el lienzo con **solo lectura**. La fecha
selecciona la última versión guardada hasta ese momento, no cada movimiento del ratón.
**Volver al trabajo actual** regresa al borrador sin reemplazarlo.

Se puede comparar antes/después, crear una rama desde la versión elegida o restaurar
todas/algunas vistas de la rama actual. Restaurar muestra una comparación y crea
una nueva versión, además de un punto de recuperación anterior; no borra los
commits posteriores. También se puede restaurar Principal con el permiso adecuado.

## Permisos

Solo el anfitrión administra accesos. Los permisos especiales son independientes:
aprobar fusiones hacia Principal, editarla directamente y restaurarla. Se puede
indicar vencimiento y limitar la aprobación a una solicitud concreta. Tener permiso
para fusionar no concede los otros permisos ni permite delegarlos.

En las otras ramas, el anfitrión puede permitir todos los editores o asignar personas.
Los lectores siguen sin publicar cambios. La validación se aplica en el servicio
nativo y en cada recepción autenticada, además de los controles de pantalla.

## Desconexiones y recuperación

Las ramas, borradores y versiones quedan en el dispositivo. Crear ramas y guardar
commits sin red conserva una cola durable que se publica en orden causal y por lotes
al volver. Las fusiones y cambios de permisos necesitan al anfitrión conectado.
Traer cambios o restaurar desde una copia invitada solicita ejecución al anfitrión;
si no hay conexión, queda pendiente y se revalida antes de aplicarse.

Una revocación o un destino que cambió impide publicar la operación y conserva una
copia para recuperación. La interfaz ofrece **Descargar copia conservada**, importable
como proyecto independiente. **Descargar recuperación** del proyecto también incluye
el catálogo de ramas, sus CRDT y commits para recuperación completa; no contiene
invitaciones, llaves ni presencia. Importar el tablero visible no vuelve a vincularlo
ni reconstruye automáticamente la sala desde esos datos adicionales.

La capacidad incorpora el tamaño de las ramas e historial cargados. El historial
crece al guardar versiones y no se elimina automáticamente. Siguen vigentes los
límites de tamaño de mensajes y disponibilidad de conexión descritos en
[colaboración](collaboration.md). Las dos partes deben usar esta versión para editar
una sala con ramas; un cliente antiguo no puede escribir el documento protegido.

## Verificación

La lógica pura vive en `src/lib/collaboration/history.ts` y
`src/lib/collaboration/history-validation.ts`; la persistencia y sincronización,
en `main/services/collaboration/branches.ts`, dentro del motor existente. La interfaz
se integra con los contextos actuales y `BranchControl`, manteniendo el monolito por capas.

```sh
npx vitest run src/lib/collaboration/__tests__ main/services/collaboration/__tests__
node --import tsx scripts/collaboration-branches-smoke.ts
npm run gate
```

`scripts/collaboration-history-ui-smoke.ts` verifica el flujo por pantalla en dos
perfiles Electron aislados con puertos de prueba 9271/9272. Esos puertos se abren
solo en la ejecución de pruebas, no en la aplicación instalada.
