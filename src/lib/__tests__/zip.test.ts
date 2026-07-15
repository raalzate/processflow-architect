import { describe, it, expect } from "vitest";
import { crc32, buildZip } from "../zip";

const enc = (s: string) => new TextEncoder().encode(s);

describe("crc32", () => {
  it("vectores conocidos del estándar", () => {
    expect(crc32(enc(""))).toBe(0);
    expect(crc32(enc("123456789"))).toBe(0xcbf43926); // vector clásico CRC-32
    expect(crc32(enc("hello"))).toBe(0x3610a686);
  });
});

describe("buildZip (STORE)", () => {
  const now = new Date(2026, 6, 3, 10, 30, 0); // determinista

  it("estructura: local headers, central directory y EOCD", () => {
    const zip = buildZip(
      [
        { name: "carpeta/a.md", content: "hola" },
        { name: "carpeta/b.md", content: "mundo!" },
      ],
      now
    );
    const dv = new DataView(zip.buffer);

    // Primer local file header al inicio.
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    // EOCD al final (22 bytes, sin comentario).
    const eocd = zip.length - 22;
    expect(dv.getUint32(eocd, true)).toBe(0x06054b50);
    expect(dv.getUint16(eocd + 10, true)).toBe(2); // entradas totales

    // El offset del central directory apunta a una firma central válida.
    const cdOffset = dv.getUint32(eocd + 16, true);
    expect(dv.getUint32(cdOffset, true)).toBe(0x02014b50);
  });

  it("roundtrip: nombres, tamaños y datos legibles desde las cabeceras", () => {
    const entries = [
      { name: "skill/SKILL.md", content: "# Guía\ncontenido" },
      { name: "skill/references/ejemplos.md", content: "# Ejemplos ✓" },
    ];
    const zip = buildZip(entries, now);
    const dv = new DataView(zip.buffer);
    const dec = new TextDecoder();

    let pos = 0;
    for (const e of entries) {
      expect(dv.getUint32(pos, true)).toBe(0x04034b50);
      const size = dv.getUint32(pos + 18, true);
      const nameLen = dv.getUint16(pos + 26, true);
      const name = dec.decode(zip.slice(pos + 30, pos + 30 + nameLen));
      const data = dec.decode(zip.slice(pos + 30 + nameLen, pos + 30 + nameLen + size));
      expect(name).toBe(e.name);
      expect(data).toBe(e.content);
      // CRC declarado = CRC real del contenido.
      expect(dv.getUint32(pos + 14, true)).toBe(crc32(enc(e.content)));
      pos += 30 + nameLen + size;
    }
  });

  it("zip vacío: EOCD válido con 0 entradas", () => {
    const zip = buildZip([], now);
    expect(zip.length).toBe(22);
    const dv = new DataView(zip.buffer);
    expect(dv.getUint32(0, true)).toBe(0x06054b50);
    expect(dv.getUint16(10, true)).toBe(0);
  });
});
