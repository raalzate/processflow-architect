// =============================================================================
// IA remota (proceso main): almacén CIFRADO de llaves + llamada a los proveedores.
//
// Las llaves NUNCA llegan al renderer: se guardan cifradas con safeStorage (que
// usa el llavero del SO) en userData/ai-keys.json, y las peticiones HTTP a los
// proveedores se hacen aquí en el main. El renderer sólo pide "genera" y recibe
// texto, o consulta qué proveedores tienen llave (booleanos, no la llave).
// =============================================================================

import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';

export type RemoteProvider = 'gemini' | 'openai' | 'anthropic';
const PROVIDERS: RemoteProvider[] = ['gemini', 'openai', 'anthropic'];

function keysFile(): string {
  return path.join(app.getPath('userData'), 'ai-keys.json');
}

function readStore(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(keysFile(), 'utf-8')) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, string>): void {
  fs.writeFileSync(keysFile(), JSON.stringify(store), 'utf-8');
}

/** Guarda (cifrada) la llave de un proveedor. Llave vacía → la borra. */
export function setAiKey(provider: RemoteProvider, key: string): { ok: boolean; error?: string } {
  if (!PROVIDERS.includes(provider)) return { ok: false, error: 'proveedor inválido' };
  const store = readStore();
  const trimmed = (key || '').trim();
  if (!trimmed) {
    delete store[provider];
    writeStore(store);
    return { ok: true };
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, error: 'El cifrado del sistema no está disponible en esta máquina.' };
  }
  store[provider] = safeStorage.encryptString(trimmed).toString('base64');
  writeStore(store);
  return { ok: true };
}

export function deleteAiKey(provider: RemoteProvider): { ok: boolean } {
  const store = readStore();
  delete store[provider];
  writeStore(store);
  return { ok: true };
}

/** Estado (booleano) de configuración por proveedor — sin exponer la llave. */
export function aiKeyStatus(): Record<RemoteProvider, boolean> {
  const store = readStore();
  return {
    gemini: !!store.gemini,
    openai: !!store.openai,
    anthropic: !!store.anthropic,
  };
}

function decryptKey(provider: RemoteProvider): string | null {
  const store = readStore();
  const enc = store[provider];
  if (!enc) return null;
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'));
  } catch {
    return null;
  }
}

export interface RemoteGenerateArgs {
  provider: RemoteProvider;
  model: string;
  prompt: string;
  system?: string;
}

/** Genera texto con el proveedor remoto elegido. Lanza con mensaje claro. */
export async function remoteGenerate(args: RemoteGenerateArgs): Promise<string> {
  const { provider, model, prompt, system } = args;
  const key = decryptKey(provider);
  if (!key) throw new Error(`No hay llave configurada para ${provider}. Agrégala en Ajustes.`);

  if (provider === 'gemini') return callGemini(key, model, prompt, system);
  if (provider === 'openai') return callOpenAI(key, model, prompt, system);
  if (provider === 'anthropic') return callAnthropic(key, model, prompt, system);
  throw new Error('proveedor no soportado');
}

async function callGemini(key: string, model: string, prompt: string, system?: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(key)}`;
  const body: any = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  return (data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '').trim();
}

async function callOpenAI(key: string, model: string, prompt: string, system?: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  return (data?.choices?.[0]?.message?.content ?? '').trim();
}

async function callAnthropic(key: string, model: string, prompt: string, system?: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  return (data?.content?.map((c: any) => c.text ?? '').join('') ?? '').trim();
}
