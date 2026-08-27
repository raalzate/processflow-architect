import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the providers module so we control availability + execution.
vi.mock("@/lib/ai/providers", () => ({
  localAvailable: vi.fn(),
  remoteAvailable: vi.fn(),
  runLocal: vi.fn(),
  runRemoteFlow: vi.fn(),
  remoteGenerateText: vi.fn(),
}));

import { chooseProvider, route, type AiTask } from "@/lib/ai/router";
import {
  localAvailable,
  remoteAvailable,
  runLocal,
  runRemoteFlow,
  remoteGenerateText,
} from "@/lib/ai/providers";

const mLocalAvailable = vi.mocked(localAvailable);
const mRemoteAvailable = vi.mocked(remoteAvailable);
const mRunLocal = vi.mocked(runLocal);
const mRunRemoteFlow = vi.mocked(runRemoteFlow);
const mRemoteGenerateText = vi.mocked(remoteGenerateText);

/** Set both availability flags in one call. */
function setAvailability(local: boolean, remote: boolean) {
  mLocalAvailable.mockReturnValue(local);
  mRemoteAvailable.mockReturnValue(remote);
}

// --- Realistic task fixtures built from the exported AiTask type ---

const lightTask: AiTask = {
  id: "light-suggest",
  tier: "light",
  buildPrompt: (input: string) => ({ prompt: input, system: "sys" }),
  parse: (raw: string) => raw.toUpperCase(),
  remoteFlow: "lightFlow",
  buildRemoteInput: (input: string) => ({ text: input }),
};

const lightNoRemote: AiTask = {
  id: "light-local-only",
  tier: "light",
  buildPrompt: (input: string) => ({ prompt: input }),
};

const lightCapped: AiTask = {
  id: "light-capped",
  tier: "light",
  maxLocalChars: 10,
  buildPrompt: (input: string) => ({ prompt: input }),
  remoteFlow: "cappedFlow",
};

const lightCappedNoRemote: AiTask = {
  id: "light-capped-local-only",
  tier: "light",
  maxLocalChars: 10,
  buildPrompt: (input: string) => ({ prompt: input }),
};

const heavyTask: AiTask = {
  id: "heavy-architect",
  tier: "heavy",
  remoteFlow: "heavyFlow",
  buildRemoteInput: (input: any) => input,
};

const structuredLightTask: AiTask = {
  id: "structured-light",
  tier: "light",
  structured: true,
  buildPrompt: (input: string) => ({ prompt: input }),
  remoteFlow: "structuredFlow",
};

describe("chooseProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("heavy / structured tasks (rule 1: remote, no downgrade to local)", () => {
    it("routes heavy task to remote when remote is available", () => {
      setAvailability(true, true);
      const r = chooseProvider(heavyTask, 5);
      expect(r.provider).toBe("remote");
      expect(r.fellBack).toBe(false);
      expect(r.reason).toContain("compleja");
    });

    it("routes heavy task to remote even when local is available (no preference for local)", () => {
      setAvailability(true, true);
      expect(chooseProvider(heavyTask, 0).provider).toBe("remote");
    });

    it("returns null for heavy task when remote is NOT available (never downgrades to local)", () => {
      setAvailability(true, false); // local available, but heavy can't use it
      const r = chooseProvider(heavyTask, 5);
      expect(r.provider).toBeNull();
      expect(r.fellBack).toBe(false);
      expect(r.reason).toContain("API key");
    });

    it("treats a structured light task as heavy → remote", () => {
      setAvailability(true, true);
      const r = chooseProvider(structuredLightTask, 3);
      expect(r.provider).toBe("remote");
      expect(r.fellBack).toBe(false);
    });

    it("returns null for structured light task when remote unavailable (no local downgrade)", () => {
      setAvailability(true, false);
      const r = chooseProvider(structuredLightTask, 3);
      expect(r.provider).toBeNull();
    });
  });

  describe("light tasks (rule 2: local first)", () => {
    it("routes light task to local when local available and input within size", () => {
      setAvailability(true, true);
      const r = chooseProvider(lightTask, 100);
      expect(r.provider).toBe("local");
      expect(r.fellBack).toBe(false);
      expect(r.reason).toContain("ligera");
    });

    it("prefers local over remote for light tasks even when both available", () => {
      setAvailability(true, true);
      expect(chooseProvider(lightTask, 0).provider).toBe("local");
    });

    it("routes to local when no maxLocalChars cap is set, regardless of inputSize", () => {
      setAvailability(true, false);
      const r = chooseProvider(lightTask, 1_000_000);
      expect(r.provider).toBe("local");
      expect(r.fellBack).toBe(false);
    });
  });

  describe("size cap boundary (maxLocalChars)", () => {
    it("stays local when inputSize equals maxLocalChars (boundary, not exceeded)", () => {
      setAvailability(true, true);
      const r = chooseProvider(lightCapped, 10); // 10 > 10 is false
      expect(r.provider).toBe("local");
      expect(r.fellBack).toBe(false);
    });

    it("falls back to remote when inputSize exceeds maxLocalChars by one", () => {
      setAvailability(true, true);
      const r = chooseProvider(lightCapped, 11); // 11 > 10
      expect(r.provider).toBe("remote");
      expect(r.fellBack).toBe(true);
      expect(r.reason).toContain("entrada grande");
    });

    it("stays local when inputSize is below the cap", () => {
      setAvailability(true, true);
      expect(chooseProvider(lightCapped, 0).provider).toBe("local");
    });

    it("treats maxLocalChars of 0 as a real cap (any positive size is too big)", () => {
      const zeroCap: AiTask = {
        id: "zero-cap",
        tier: "light",
        maxLocalChars: 0,
        buildPrompt: (i: string) => ({ prompt: i }),
        remoteFlow: "zeroFlow",
      };
      setAvailability(true, true);
      // inputSize 0 is not > 0 → still local
      expect(chooseProvider(zeroCap, 0).provider).toBe("local");
      // inputSize 1 > 0 → remote
      expect(chooseProvider(zeroCap, 1).provider).toBe("remote");
    });
  });

  describe("fallbacks (rule 3)", () => {
    it("falls back to remote when local unavailable but remote + remoteFlow present", () => {
      setAvailability(false, true);
      const r = chooseProvider(lightTask, 5);
      expect(r.provider).toBe("remote");
      expect(r.fellBack).toBe(true);
      expect(r.reason).toContain("local no disponible");
    });

    it("uses 'entrada grande' reason when too big AND local unavailable", () => {
      setAvailability(false, true);
      const r = chooseProvider(lightCapped, 50);
      expect(r.provider).toBe("remote");
      expect(r.fellBack).toBe(true);
      expect(r.reason).toContain("entrada grande");
    });

    it("falls back to local when too big but no remote flow defined (fellBack=true)", () => {
      setAvailability(true, false);
      const r = chooseProvider(lightCappedNoRemote, 50); // too big, but no remoteFlow
      expect(r.provider).toBe("local");
      expect(r.fellBack).toBe(true); // fellBack reflects tooBig
      expect(r.reason).toContain("remoto no disponible");
    });

    it("falls back to local (fellBack=false) when local fine but remote unavailable and not too big", () => {
      // light task with remoteFlow, remote down, within size → local, not a real fallback
      setAvailability(true, false);
      const r = chooseProvider(lightTask, 5);
      // within size + local available → handled by rule 2, not rule 3
      expect(r.provider).toBe("local");
      expect(r.fellBack).toBe(false);
    });

    it("falls back to remote for a prompt task when local down (remote genera texto)", () => {
      setAvailability(false, true); // local down, remote up
      const r = chooseProvider(lightNoRemote, 5);
      // La nube puede generar texto desde buildPrompt → híbrido cae a remoto.
      expect(r.provider).toBe("remote");
      expect(r.fellBack).toBe(true);
    });

    it("returns null when nothing is available for a light task", () => {
      setAvailability(false, false);
      const r = chooseProvider(lightTask, 5);
      expect(r.provider).toBeNull();
      expect(r.fellBack).toBe(false);
      expect(r.reason).toContain("ninguna IA");
    });

    it("returns null when local down, too big, and no remote", () => {
      setAvailability(false, false);
      const r = chooseProvider(lightCapped, 999);
      expect(r.provider).toBeNull();
    });
  });
});

describe("route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes locally: builds prompt, runs local, applies parse", async () => {
    setAvailability(true, false);
    mRunLocal.mockResolvedValue("hello world");
    const r = await route(lightTask, "input text");
    expect(mRunLocal).toHaveBeenCalledWith("input text", "sys");
    expect(r.provider).toBe("local");
    expect(r.fellBack).toBe(false);
    expect(r.output).toBe("HELLO WORLD"); // parse uppercases
  });

  it("returns raw local output when task has no parse", async () => {
    const noParse: AiTask = {
      id: "no-parse",
      tier: "light",
      buildPrompt: (i: string) => ({ prompt: i }),
    };
    setAvailability(true, false);
    mRunLocal.mockResolvedValue("raw");
    const r = await route(noParse, "x");
    expect(r.output).toBe("raw");
  });

  it("executes remotely for heavy task: builds remote input, runs flow", async () => {
    setAvailability(true, true);
    mRunRemoteFlow.mockResolvedValue({ result: "ok" });
    const r = await route(heavyTask, { foo: "bar" });
    expect(mRunRemoteFlow).toHaveBeenCalledWith("heavyFlow", { foo: "bar" });
    expect(r.provider).toBe("remote");
    expect(r.output).toEqual({ result: "ok" });
    expect(mRunLocal).not.toHaveBeenCalled();
  });

  it("passes raw input to remote flow when no buildRemoteInput is defined", async () => {
    const heavyNoBuilder: AiTask = {
      id: "heavy-no-builder",
      tier: "heavy",
      remoteFlow: "flowX",
    };
    setAvailability(false, true);
    mRunRemoteFlow.mockResolvedValue("done");
    await route(heavyNoBuilder, { a: 1 });
    expect(mRunRemoteFlow).toHaveBeenCalledWith("flowX", { a: 1 });
  });

  it("computes inputSize from built prompt length to decide cap fallback to remote", async () => {
    setAvailability(true, true);
    mRunRemoteFlow.mockResolvedValue("remote-out");
    // prompt length 11 > maxLocalChars 10 → remote
    const r = await route(lightCapped, "12345678901");
    expect(r.provider).toBe("remote");
    expect(r.fellBack).toBe(true);
    expect(mRunRemoteFlow).toHaveBeenCalledWith("cappedFlow", "12345678901");
  });

  it("uses inputSize 0 when task has no buildPrompt (cap never triggers on size)", async () => {
    const heavyOnly: AiTask = {
      id: "heavy-only",
      tier: "heavy",
      remoteFlow: "hf",
    };
    setAvailability(false, true);
    mRunRemoteFlow.mockResolvedValue("z");
    const r = await route(heavyOnly, "anything");
    expect(r.provider).toBe("remote");
  });

  it("throws with the chooseProvider reason when no provider can serve", async () => {
    setAvailability(false, false);
    await expect(route(lightTask, "x")).rejects.toThrow("ninguna IA disponible");
  });

  it("throws clear error for heavy task when remote unavailable", async () => {
    setAvailability(true, false);
    await expect(route(heavyTask, {})).rejects.toThrow(/API key/);
  });

  it("throws when routed to local but task lacks buildPrompt", async () => {
    // A light task with no buildPrompt: inputSize falls to 0, routes to local,
    // then errors because there is no prompt builder.
    const localNoPrompt: AiTask = {
      id: "local-no-prompt",
      tier: "light",
    };
    setAvailability(true, false);
    await expect(route(localNoPrompt, "x")).rejects.toThrow(
      /no define prompt local/
    );
  });

  it("throws when routed to remote but task has neither remoteFlow nor buildPrompt", async () => {
    // Heavy task sin remoteFlow ni buildPrompt → chooseProvider devuelve 'remote',
    // y route lanza porque no hay forma de ejecutarlo remotamente.
    const heavyNoFlow: AiTask = {
      id: "heavy-no-flow",
      tier: "heavy",
    };
    setAvailability(false, true);
    await expect(route(heavyNoFlow, {})).rejects.toThrow(
      /no define ejecución remota/
    );
  });

  it("propagates rejection from runLocal", async () => {
    setAvailability(true, false);
    mRunLocal.mockRejectedValue(new Error("local boom"));
    await expect(route(lightTask, "x")).rejects.toThrow("local boom");
  });

  it("propagates rejection from runRemoteFlow", async () => {
    setAvailability(false, true);
    mRunRemoteFlow.mockRejectedValue(new Error("remote boom"));
    await expect(route(heavyTask, {})).rejects.toThrow("remote boom");
  });

  it("falls back to remote at runtime when local is down for a light task", async () => {
    setAvailability(false, true);
    mRunRemoteFlow.mockResolvedValue("fallback-out");
    const r = await route(lightTask, "hi");
    expect(r.provider).toBe("remote");
    expect(r.fellBack).toBe(true);
    expect(r.reason).toContain("local no disponible");
    expect(mRunRemoteFlow).toHaveBeenCalledWith("lightFlow", { text: "hi" });
  });
});

describe("manual remote mode (conmutador global)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("chooseProvider forces remote when mode='remote' and remote is available", () => {
    setAvailability(true, true);
    const r = chooseProvider(lightNoRemote, 5, { mode: "remote" });
    expect(r.provider).toBe("remote");
    expect(r.fellBack).toBe(false);
    expect(r.reason).toContain("manual");
  });

  it("keeps local rule when remote is unavailable even in remote mode", () => {
    setAvailability(true, false);
    const r = chooseProvider(lightNoRemote, 5, { mode: "remote" });
    expect(r.provider).toBe("local");
  });

  it("route generates via remoteGenerateText for a prompt task in remote mode", async () => {
    setAvailability(true, true);
    mRemoteGenerateText.mockResolvedValue("hola");
    const res = await route(lightNoRemote, "x", { mode: "remote", provider: "openai", model: "gpt-4o" });
    expect(res.provider).toBe("remote");
    expect(mRemoteGenerateText).toHaveBeenCalledWith("openai", "gpt-4o", "x", undefined);
    expect(res.output).toBe("hola");
  });
});

describe("hybrid mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps light suggestions local when they fit", () => {
    setAvailability(true, true);
    const r = chooseProvider(lightNoRemote, 5, { mode: "hybrid" });
    expect(r.provider).toBe("local");
  });

  it("routes a heavy task to remote", () => {
    setAvailability(true, true);
    const r = chooseProvider(heavyTask, 5, { mode: "hybrid" });
    expect(r.provider).toBe("remote");
  });

  it("routes an oversized light task to remote", () => {
    setAvailability(true, true);
    const r = chooseProvider(lightCapped, 999, { mode: "hybrid" });
    expect(r.provider).toBe("remote");
    expect(r.fellBack).toBe(true);
  });
});

describe("local mode never uses remote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps light tasks local even when oversized", () => {
    setAvailability(true, true);
    const r = chooseProvider(lightCapped, 999, { mode: "local" });
    expect(r.provider).toBe("local");
  });

  it("returns null for a heavy task (no local engine)", () => {
    setAvailability(true, true);
    const r = chooseProvider(heavyTask, 5, { mode: "local" });
    expect(r.provider).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// El equipo sin motor local (#202): la nube tiene que bastar
// -----------------------------------------------------------------------------

describe("un equipo sin WebGPU con la nube configurada", () => {
  beforeEach(() => setAvailability(false, true));

  it("modo remoto: todo lo atiende la nube, sin degradar", () => {
    for (const t of [lightTask, heavyTask]) {
      const { provider, fellBack } = chooseProvider(t, 10, { mode: "remote" });
      expect(provider).toBe("remote");
      expect(fellBack).toBe(false);
    }
  });

  it("modo híbrido: la tarea LIGERA también sube a la nube (marcando el respaldo)", () => {
    const { provider, fellBack, reason } = chooseProvider(lightTask, 10, { mode: "hybrid" });
    expect(provider).toBe("remote");
    expect(fellBack).toBe(true);
    expect(reason).toMatch(/local no disponible/i);
  });

  it("modo híbrido: la tarea compleja va a la nube como siempre", () => {
    expect(chooseProvider(heavyTask, 10, { mode: "hybrid" }).provider).toBe("remote");
  });

  it("y ejecuta de verdad por la nube: la GPU no interviene", async () => {
    mRemoteGenerateText.mockResolvedValue("respuesta de la nube");
    const res = await route(lightTask, "hola", { mode: "remote", provider: "gemini" });
    expect(res.provider).toBe("remote");
    expect(mRunLocal).not.toHaveBeenCalled();
  });

  it("modo local, en cambio, se queda sin motor y lo dice", () => {
    const { provider, reason } = chooseProvider(lightTask, 10, { mode: "local" });
    expect(provider).toBeNull();
    expect(reason).toMatch(/no hay motor local/i);
  });
});
