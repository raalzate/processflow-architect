import { describe, expect, it } from "vitest";
import { isLanPath } from "../network";
describe("selected network path", () => {
  const interfaces = [{ address: "192.168.16.13", netmask: "255.255.240.0" }];
  it("uses the actual interface mask rather than a fixed prefix", () => {
    expect(isLanPath("192.168.20.4:1234", interfaces)).toBe(true);
    expect(isLanPath("192.168.32.4:1234", interfaces)).toBe(false);
  });
  it("does not label a public selected route LAN because private addresses were advertised", () => {
    expect(isLanPath("8.8.8.8:1234", interfaces)).toBe(false);
    expect(isLanPath("127.0.0.1:1234", interfaces)).toBe(true);
  });
});
