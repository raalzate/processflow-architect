/**
 * @fileOverview Caché del audio ya sintetizado (#637). PURO: sin AudioContext ni
 * worker; lo usa `src/hooks/useLeerEnVoz.ts`.
 *
 * Volver a escuchar una respuesta la sintetizaba de nuevo frase por frase, con la
 * misma espera y los mismos cortes de la primera vez. El audio de una frase sólo
 * depende de la voz, la velocidad y el texto, así que se guarda por esa clave.
 *
 * Vive en memoria mientras la app está abierta, con un TOPE de bytes: el audio
 * crudo pesa (24 kHz en Float32 ≈ 94 KB por segundo) y una sesión larga no puede
 * crecer sin límite. Al pasarse se descarta lo usado hace más tiempo.
 */

/** ~60 MB: unos diez minutos de voz. */
export const TOPE_CACHE_VOZ_BYTES = 60 * 1024 * 1024;

export interface AudioSintetizado {
  audio: Float32Array;
  sr: number;
}

/** Qué decide el audio de una frase: cambiar cualquiera de los tres cambia el sonido. */
export function claveDeAudio(voz: string, velocidad: number, texto: string): string {
  return `${voz}\u0000${velocidad}\u0000${texto}`;
}

export class CacheDeAudio {
  // Un Map recuerda el orden de inserción: re-insertar al leer lo deja último,
  // así el primero es siempre el usado hace más tiempo.
  private readonly entradas = new Map<string, AudioSintetizado>();
  private ocupados = 0;

  constructor(private readonly tope = TOPE_CACHE_VOZ_BYTES) {}

  get bytes(): number {
    return this.ocupados;
  }

  leer(clave: string): AudioSintetizado | undefined {
    const e = this.entradas.get(clave);
    if (!e) return undefined;
    this.entradas.delete(clave);
    this.entradas.set(clave, e);
    return e;
  }

  guardar(clave: string, audio: Float32Array, sr: number): void {
    const tam = audio.byteLength;
    const previo = this.entradas.get(clave);
    if (previo) {
      this.entradas.delete(clave);
      this.ocupados -= previo.audio.byteLength;
    }
    // Vacío no ahorra nada; más grande que el tope vaciaría la caché para nada.
    if (!tam || tam > this.tope) return;
    while (this.ocupados + tam > this.tope) {
      const [masVieja, e] = this.entradas.entries().next().value as [string, AudioSintetizado];
      this.entradas.delete(masVieja);
      this.ocupados -= e.audio.byteLength;
    }
    this.entradas.set(clave, { audio, sr });
    this.ocupados += tam;
  }
}
