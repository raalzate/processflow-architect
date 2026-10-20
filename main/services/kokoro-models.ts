/**
 * @fileOverview Archivos de Kokoro (voz local) en el proceso main (#605).
 *
 * Mismo esquema que los .litertlm: se bajan a userData/models/kokoro y el renderer
 * los lee por `litert-model://m/kokoro/<ruta>`. El renderer no puede bajarlos él:
 * su CSP no deja salir a Hugging Face, y así la voz funciona offline tras la
 * primera descarga.
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import {
  ARCHIVOS_KOKORO,
  KOKORO_BASE_URL,
  KOKORO_BYTES_TOTALES,
  rutaLocalSegura,
} from '../../src/lib/tts/kokoro-catalogo';

export function kokoroDir(): string {
  return path.join(app.getPath('userData'), 'models', 'kokoro');
}

/** Archivo local para lo que pide el scheme, o null si no es del catálogo. */
export function kokoroArchivoLocal(pedida: string): string | null {
  const ruta = rutaLocalSegura(pedida);
  return ruta ? path.join(kokoroDir(), ...ruta.split('/')) : null;
}

const destino = (ruta: string) => path.join(kokoroDir(), ...ruta.split('/'));

export function kokoroStatus(): { descargado: boolean; bytes: number; bytesTotales: number } {
  let bytes = 0;
  let completo = true;
  for (const a of ARCHIVOS_KOKORO) {
    try {
      bytes += fs.statSync(destino(a.ruta)).size;
    } catch {
      completo = false;
    }
  }
  return { descargado: completo, bytes, bytesTotales: KOKORO_BYTES_TOTALES };
}

/** Baja lo que falte, en orden, reportando el progreso total 0..100. */
export async function downloadKokoro(onProgress?: (percent: number) => void): Promise<{ ok: boolean; error?: string }> {
  let hechos = 0;
  const avisar = (extra: number) =>
    onProgress?.(Math.min(99, Math.round(((hechos + extra) / KOKORO_BYTES_TOTALES) * 100)));
  try {
    for (const a of ARCHIVOS_KOKORO) {
      const dest = destino(a.ruta);
      if (fs.existsSync(dest)) {
        hechos += a.bytes;
        avisar(0);
        continue;
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const res = await fetch(`${KOKORO_BASE_URL}/${a.ruta}`);
      if (!res.ok || !res.body) return { ok: false, error: `HTTP ${res.status} en ${a.ruta}` };
      const tmp = dest + '.part';
      const out = fs.createWriteStream(tmp);
      let bajado = 0;
      for await (const chunk of res.body as any) {
        out.write(Buffer.from(chunk));
        bajado += chunk.length;
        avisar(Math.min(bajado, a.bytes));
      }
      await new Promise<void>((resolve, reject) => out.end((e: any) => (e ? reject(e) : resolve())));
      fs.renameSync(tmp, dest);
      hechos += a.bytes;
    }
    onProgress?.(100);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ? String(err.message) : String(err) };
  }
}

export function deleteKokoro(): { ok: boolean; error?: string } {
  try {
    fs.rmSync(kokoroDir(), { recursive: true, force: true });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ? String(err.message) : String(err) };
  }
}
