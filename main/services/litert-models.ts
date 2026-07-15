/**
 * @fileOverview Gestión de modelos LiteRT-LM (.litertlm) en el proceso main.
 *
 * Descarga (resumible) a userData/models/litert, estado, borrado y "mostrar en
 * Finder". El archivo se sirve al renderer (donde corre LiteRT-LM/WebGPU) vía el
 * protocolo `litert-model://` registrado en main.ts.
 */

import { app, shell } from 'electron';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { LITERT_MODELS, getLitertModelMeta, type LitertModelId } from '../../src/lib/litert-models';

function litertDir(): string {
  const dir = path.join(app.getPath('userData'), 'models', 'litert');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function modelPath(id: string): string {
  return path.join(litertDir(), getLitertModelMeta(id).file);
}

export interface LitertModelStatus extends Omit<(typeof LITERT_MODELS)[number], never> {
  downloaded: boolean;
  sizeBytes: number;
}

/** Lista de modelos con su estado de descarga. */
export function listLitertModels(): { totalRamGB: number; models: LitertModelStatus[] } {
  const gb = (b: number) => Math.round((b / 1024 ** 3) * 10) / 10;
  const models = LITERT_MODELS.map((m) => {
    let downloaded = false;
    let sizeBytes = 0;
    try {
      const p = modelPath(m.id);
      if (fs.existsSync(p)) {
        sizeBytes = fs.statSync(p).size;
        downloaded = sizeBytes > 0;
      }
    } catch {
      /* ignore */
    }
    return { ...m, downloaded, sizeBytes };
  });
  return { totalRamGB: gb(os.totalmem()), models };
}

export function isLitertModelDownloaded(id: string): boolean {
  try {
    return fs.existsSync(modelPath(id));
  } catch {
    return false;
  }
}

/** Descarga (o reanuda) el .litertlm reportando progreso 0..100. */
export async function downloadLitertModel(
  id: LitertModelId,
  onProgress?: (percent: number) => void
): Promise<{ ok: boolean; error?: string }> {
  const meta = getLitertModelMeta(id);
  const dest = modelPath(id);
  const tmp = dest + '.part';
  try {
    if (fs.existsSync(dest)) {
      onProgress?.(100);
      return { ok: true };
    }
    const from = fs.existsSync(tmp) ? fs.statSync(tmp).size : 0;
    const res = await fetch(meta.url, from ? { headers: { Range: `bytes=${from}-` } } : {});
    if (!res.ok && res.status !== 206) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const remaining = Number(res.headers.get('content-length') || 0);
    const total = from + remaining || Math.round(meta.approxGB * 1024 ** 3);
    const out = fs.createWriteStream(tmp, { flags: from ? 'a' : 'w' });
    let loaded = from;
    let lastPct = -1;
    const body = res.body as any;
    if (!body) return { ok: false, error: 'Respuesta sin cuerpo.' };
    for await (const chunk of body) {
      out.write(Buffer.from(chunk));
      loaded += chunk.length;
      const pct = Math.min(99, Math.round((loaded / total) * 100));
      if (pct !== lastPct) {
        lastPct = pct;
        onProgress?.(pct);
      }
    }
    await new Promise<void>((resolve, reject) => out.end((e: any) => (e ? reject(e) : resolve())));
    fs.renameSync(tmp, dest);
    onProgress?.(100);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ? String(err.message) : String(err) };
  }
}

export function deleteLitertModel(id: string): { ok: boolean; error?: string } {
  try {
    const dest = modelPath(id);
    for (const f of [dest, dest + '.part']) if (fs.existsSync(f)) fs.unlinkSync(f);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ? String(err.message) : String(err) };
  }
}

export function revealLitertModel(id: string): { ok: boolean; error?: string } {
  try {
    const dest = modelPath(id);
    shell.showItemInFolder(fs.existsSync(dest) ? dest : litertDir());
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ? String(err.message) : String(err) };
  }
}
