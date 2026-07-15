/**
 * @fileOverview Empaquetador ZIP mínimo (método STORE, sin compresión) — PURO.
 *
 * Existe para descargar el skill (2 archivos Markdown) como UN solo .zip desde
 * la guía MCP sin añadir dependencias (JSZip pesa más que todo lo que empaqueta).
 * Implementa lo justo del formato ZIP (APPNOTE): local file header + central
 * directory + EOCD, con nombres UTF-8 (bit 11) y CRC-32. Sin ZIP64: suficiente
 * para archivos de texto pequeños (< 4 GB y < 65535 entradas).
 */

export interface ZipEntry {
  /** Ruta dentro del zip (usa `/` como separador, p. ej. "carpeta/archivo.md"). */
  name: string;
  content: string | Uint8Array;
}

// Tabla CRC-32 (polinomio reflejado 0xEDB88320), generada una sola vez.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 estándar (el que exige el formato ZIP). */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** Fecha/hora en el formato DOS que usan las cabeceras ZIP. */
function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * Construye un ZIP (STORE) con las entradas dadas. `now` es inyectable para
 * pruebas deterministas.
 */
export function buildZip(entries: ZipEntry[], now: Date = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(now);

  interface Prepared {
    nameBytes: Uint8Array;
    data: Uint8Array;
    crc: number;
    offset: number;
  }

  const locals: Uint8Array[] = [];
  const prepared: Prepared[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = encoder.encode(e.name);
    const data = typeof e.content === "string" ? encoder.encode(e.content) : e.content;
    const crc = crc32(data);

    // Local file header (30 bytes fijos + nombre) + datos.
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true); // firma
    header.setUint16(4, 20, true); // versión requerida (2.0)
    header.setUint16(6, 0x0800, true); // flags: nombres UTF-8
    header.setUint16(8, 0, true); // método: STORE
    header.setUint16(10, time, true);
    header.setUint16(12, date, true);
    header.setUint32(14, crc, true);
    header.setUint32(18, data.length, true); // comprimido = sin comprimir (STORE)
    header.setUint32(22, data.length, true);
    header.setUint16(26, nameBytes.length, true);
    header.setUint16(28, 0, true); // extra

    prepared.push({ nameBytes, data, crc, offset });
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    local.set(new Uint8Array(header.buffer), 0);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);
    offset += local.length;
  }

  // Central directory (46 bytes fijos + nombre por entrada).
  const centrals: Uint8Array[] = [];
  let centralSize = 0;
  for (const p of prepared) {
    const header = new DataView(new ArrayBuffer(46));
    header.setUint32(0, 0x02014b50, true); // firma
    header.setUint16(4, 20, true); // versión creadora
    header.setUint16(6, 20, true); // versión requerida
    header.setUint16(8, 0x0800, true); // flags UTF-8
    header.setUint16(10, 0, true); // STORE
    header.setUint16(12, time, true);
    header.setUint16(14, date, true);
    header.setUint32(16, p.crc, true);
    header.setUint32(20, p.data.length, true);
    header.setUint32(24, p.data.length, true);
    header.setUint16(28, p.nameBytes.length, true);
    // extra/comentario/disco/atributos internos e externos: 0
    header.setUint32(42, p.offset, true); // offset del local header

    const central = new Uint8Array(46 + p.nameBytes.length);
    central.set(new Uint8Array(header.buffer), 0);
    central.set(p.nameBytes, 46);
    centrals.push(central);
    centralSize += central.length;
  }

  // End of central directory (22 bytes, sin comentario).
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, entries.length, true); // entradas en este disco
  eocd.setUint16(10, entries.length, true); // entradas totales
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true); // offset del central directory

  const total = offset + centralSize + 22;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of [...locals, ...centrals, new Uint8Array(eocd.buffer)]) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}
