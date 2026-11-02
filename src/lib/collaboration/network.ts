function ipv4(value: string): number | undefined {
  const parts = value.split("."); if (parts.length !== 4 || parts.some(p => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return undefined;
  return parts.reduce((result, p) => (result << 8) | Number(p), 0) >>> 0;
}
/** Classify the selected transport address, never other advertised candidates. */
export function isLanPath(remote: string, interfaces: { address: string; netmask: string }[]): boolean {
  if (remote.startsWith("127.") || remote.startsWith("[::1]") || remote.startsWith("[fe80:")) return true;
  const ip = ipv4(remote.split(":")[0]); if (ip === undefined) return false;
  return interfaces.some(iface => {
    const local = ipv4(iface.address), mask = ipv4(iface.netmask);
    return local !== undefined && mask !== undefined && (ip & mask) === (local & mask);
  });
}
