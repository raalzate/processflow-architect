import {
  openSync,
  readFileSync,
  existsSync,
  writeSync,
  fsyncSync,
  closeSync,
  ftruncateSync,
  renameSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";

const MAX_UPDATE = 32 * 1024 ** 2;
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest();

/** Length + checksum + Yjs update. Acknowledgments follow fsync, never a timer. */
export class Journal {
  private fd: number;
  private size = 0;
  readonly updates: Uint8Array[] = [];
  constructor(file: string) {
    mkdirSync(dirname(file), { recursive: true });
    const bytes = existsSync(file) ? readFileSync(file) : Buffer.alloc(0);
    let offset = 0;
    while (offset + 36 <= bytes.length) {
      const size = bytes.readUInt32BE(offset);
      if (size > MAX_UPDATE) throw new Error("Registro colaborativo inválido: tamaño excesivo.");
      if (offset + 36 + size > bytes.length) break;
      const update = bytes.subarray(offset + 36, offset + 36 + size);
      if (!digest(update).equals(bytes.subarray(offset + 4, offset + 36)))
        throw new Error("El historial está dañado. Conserva la copia para recuperarlo.");
      this.updates.push(new Uint8Array(update));
      offset += 36 + size;
    }
    this.fd = openSync(file, existsSync(file) ? "r+" : "w+", 0o600);
    // Only a partial final append may be discarded after a power interruption.
    if (offset !== bytes.length) {
      ftruncateSync(this.fd, offset);
      fsyncSync(this.fd);
    }
    this.size = offset;
  }
  append(update: Uint8Array) {
    if (update.byteLength > MAX_UPDATE)
      throw new Error("El cambio supera 32 MiB; divídelo antes de compartir.");
    const frame = Buffer.allocUnsafe(36 + update.byteLength);
    frame.writeUInt32BE(update.byteLength);
    digest(update).copy(frame, 4);
    frame.set(update, 36);
    let offset = 0;
    while (offset < frame.length)
      offset += writeSync(this.fd, frame, offset, frame.length - offset, this.size + offset);
    fsyncSync(this.fd);
    this.size += frame.length;
  }
  /** Idempotente: un segundo close cerraría el fd que el sistema ya reasignó a otro archivo. */
  close() {
    if (this.fd < 0) return;
    closeSync(this.fd);
    this.fd = -1;
  }
}

export function writePrivateJson(file: string, value: unknown) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.next`;
  writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  const fd = openSync(temporary, "r+");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, file);
}
