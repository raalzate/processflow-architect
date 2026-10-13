import { protocol } from 'electron';

// Registro ÚNICO de schemes privilegiados (gana la ÚLTIMA llamada a
// registerSchemesAsPrivileged). electron-serve (main/config.ts) hace su propia
// llamada registrando solo 'app' al importarse, así que esta función DEBE
// invocarse DESPUÉS de esa cadena de imports (main.ts la llama en su body, que
// corre tras todos los require) y ANTES de app.ready. Declara TODOS los schemes:
//  - 'app': el scheme con que electron-serve sirve el renderer en producción.
//    DEBE ser `secure` o WebGPU (que exige secure context) no se expone y
//    LiteRT-LM no arranca en el binario (en dev funciona porque carga de localhost).
//    Incluye la unión de privilegios que electron-serve pediría en su llamada.
//  - 'litert-model': sirve los .litertlm locales (userData) con soporte de Range.
//    `supportFetchAPI` + `corsEnabled` son imprescindibles: desde Electron ~39.3
//    el fetch cross-origin del renderer (localhost:3000 en dev, app:// en prod)
//    a un scheme custom sin CORS habilitado muere con "Failed to fetch".
//
// Por qué en un microtask (#529): electron-serve 3.0.1 dejó de registrar al
// importarse y lo hace en un `queueMicrotask`, que corre DESPUÉS del body de
// main.ts. Su llamada (sólo 'app') quedaba última y borraba 'litert-model': la IA
// local moría con «URL scheme "litert-model" is not supported». Los microtasks
// corren en orden de llegada y el suyo se encola al importar config.ts, antes que
// éste: así la nuestra vuelve a ser la última, registre electron-serve cuando
// registre. Sigue corriendo antes de app.ready.
export function registerPrivilegedSchemes(): void {
  queueMicrotask(registrar);
}

function registrar(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        allowServiceWorkers: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        codeCache: true,
      },
    },
    {
      scheme: 'litert-model',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        bypassCSP: true,
      },
    },
  ]);
}
