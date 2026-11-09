import type { BiStream } from "@number0/iroh";

const MAX_FRAME = 96 * 1024 ** 2;
export async function sendFrame(stream: BiStream, value: unknown): Promise<void> {
  const payload = Buffer.from(JSON.stringify(value));
  if (payload.length > MAX_FRAME) throw new Error("El proyecto supera el límite de transferencia de 96 MiB.");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length);
  await stream.send.writeAll([...header]);
  for (let offset = 0; offset < payload.length; offset += 64 * 1024)
    await stream.send.writeAll([...payload.subarray(offset, offset + 64 * 1024)]);
  await stream.send.finish();
}
export async function readFrame<T>(stream: BiStream, limit = MAX_FRAME): Promise<T> {
  const header = Buffer.from(await stream.recv.readExact(4));
  const size = header.readUInt32BE();
  if (size > limit) throw new Error("Transferencia rechazada: tamaño excesivo.");
  return JSON.parse(Buffer.from(await stream.recv.readExact(size)).toString("utf8")) as T;
}
export async function deadline<T>(promise: Promise<T>, milliseconds = 20_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Se agotó el tiempo de conexión. Se reintentará.")),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
