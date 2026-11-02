# Relay propio de conectividad

Utiliza el servidor abierto oficial [iroh-relay](https://github.com/n0-computer/iroh/tree/main/iroh-relay).
La versión 1.4.1 se verificó localmente con el binding nativo de esta rama.
Los binarios para Windows y Linux están en el [release oficial](https://github.com/n0-computer/iroh/releases/tag/v1.4.1).
No hace falta contratar un servicio ni instalar Rust para usar esos binarios.

Para una prueba en el mismo equipo:

```sh
iroh-relay --dev
```

En Windows el bind IPv6 predeterminado puede ser solo IPv6. La prueba utilizada es:

```sh
npx tsx scripts/collaboration-relay-smoke.ts http://[::1]:3340
```

Para usar una máquina propia por Internet, copia `relay-http.toml` y ejecuta:

```sh
iroh-relay --config-path relay-http.toml
```

Permite/dirige el puerto TCP 3340 de esa máquina según su red y configura en el
editor `http://IP_PUBLICA:3340`. Si está detrás de CGNAT, necesitarás una máquina
alcanzable de otro participante o una ruta entrante proporcionada por su red.
El relay necesita estar disponible para los equipos que dependan de él.

El contenido del proyecto y las credenciales de la sala viajan dentro de QUIC
cifrado entre las identidades de los dispositivos. El operador del relay no tiene
la llave del proyecto por recibir ese tráfico. HTTP deja visibles los metadatos
de la conexión y permite interferir con su disponibilidad. Para HTTPS y para el
descubrimiento de direcciones QUIC que mejora el establecimiento directo, usa la
[configuración oficial de TLS y relay](https://docs.iroh.computer/iroh-services/relays/self-hosted).
No se desactiva la validación de certificados de un relay HTTPS.

Este archivo básico permite cualquier identidad en el relay, mientras las salas
exigen sus invitaciones y permisos propios. Para limitar quién usa tu ancho de
banda, el servidor oficial admite una lista de identidades en `access.allowlist`.
Los identificadores están en `device.json`/tickets de cada equipo; protege la llave
privada y no publiques las invitaciones. No expongas el puerto local de métricas.

El relay transporta paquetes: no es un almacén de proyectos. Para recibir y guardar
trabajo de días distintos deja un anfitrión del proyecto encendido; se puede usar
el editor o el CLI descrito en [la guía](../../docs/collaboration.md).
