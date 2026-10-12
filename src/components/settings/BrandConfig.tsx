"use client";

/**
 * Ajustes → Marca (spec 023): un perfil de marca por organización (o el por
 * defecto). Se edita a mano con el contraste medido delante, o se PROPONE desde
 * el sitio del cliente: el main trae la página, las heurísticas extraen la
 * paleta, la IA mejora el mapeo si hay motor, y el recibo cuenta de dónde salió
 * cada valor. Guardar exige que todo cumpla el contraste.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Palette, Globe, Save, Trash2, Wand2, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAi } from "@/hooks/useAi";
import { useBrandProfiles } from "@/hooks/use-brand-profiles";
import { capacidadesHost, hostBridge } from "@/lib/host-bridge";
import { EDITORIAL_TOKENS } from "@/lib/skin";
import { brandFromSiteTask } from "@/lib/ai/tasks";
import { extraerMarca } from "@/lib/brand/extract";
import { reciboDe } from "@/lib/brand/receipt";
import {
  PERFIL_POR_DEFECTO_ID,
  TOKENS_POR_DEFECTO,
  completarTokens,
  normalizarColor,
  temaDePapel,
  validarPerfil,
  type PerfilDeMarca,
  type TokenDeMarca,
  type Triplete,
} from "@/lib/brand/profile";
import { cn } from "@/lib/utils";

const ETIQUETA: Record<TokenDeMarca, string> = {
  paper: "Papel (fondo)",
  "paper-2": "Papel 2 (contenedores)",
  ink: "Tinta (texto)",
  muted: "Atenuado",
  soft: "Suave",
  "rule-solid": "Regla fuerte",
  accent: "Acento (1–2 focos)",
  link: "Enlace",
};

type Tokens = Partial<Record<TokenDeMarca, Triplete>>;

interface Propuesta {
  tokens: Tokens;
  fuente?: string;
  recibo: string[];
}

const hoy = () => new Date().toISOString().slice(0, 10);

export function BrandConfig() {
  const { toast } = useToast();
  const { perfiles, guardar, borrar } = useBrandProfiles();
  const { run: runAi, busy: iaOcupada } = useAi();
  const puedeLeerSitio = capacidadesHost().marcaDesdeSitio;

  const [orgs, setOrgs] = useState<{ slug: string; nombre: string }[]>([]);
  const [destino, setDestino] = useState<string>(PERFIL_POR_DEFECTO_ID);
  const [tokens, setTokens] = useState<Tokens>({});
  const [textos, setTextos] = useState<Partial<Record<TokenDeMarca, string>>>({});
  const [fuente, setFuente] = useState("");
  const [recibo, setRecibo] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);

  useEffect(() => {
    const api = hostBridge();
    if (!api?.mcpOrgsStatus) return;
    api
      .mcpOrgsStatus()
      .then((s) => setOrgs(s.orgs))
      .catch(() => setOrgs([]));
  }, []);

  const orgId = destino === PERFIL_POR_DEFECTO_ID ? null : destino;
  const perfilGuardado = useMemo(() => perfiles.find((p) => p.orgId === orgId) ?? null, [perfiles, orgId]);
  // Clave ESTABLE de lo guardado: un refresco del hook que no cambió nada no
  // debe pisar lo que se está editando.
  const claveGuardado = perfilGuardado ? JSON.stringify(perfilGuardado) : `vacio:${destino}`;

  // Al cambiar de destino (o cuando lo guardado cambia de verdad), el editor
  // muestra lo guardado (o vacío).
  useEffect(() => {
    setTokens(perfilGuardado?.tokens ?? {});
    setTextos(Object.fromEntries(Object.entries(perfilGuardado?.tokens ?? {})) as Partial<Record<TokenDeMarca, string>>);
    setFuente(perfilGuardado?.fuente ?? "");
    setRecibo(perfilGuardado?.recibo ?? []);
    setPropuesta(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveGuardado]);

  const medidas = useMemo(() => validarPerfil(tokens), [tokens]);
  const todoCumple = medidas.every((m) => m.ok);
  const papel = tokens.paper ?? TOKENS_POR_DEFECTO.light.paper;

  const cambiarToken = (t: TokenDeMarca, texto: string) => {
    setTextos((x) => ({ ...x, [t]: texto }));
    const n = normalizarColor(texto);
    setTokens((x) => {
      const copia = { ...x };
      if (n) copia[t] = n;
      else delete copia[t];
      return copia;
    });
  };

  const ajustar = (t: TokenDeMarca, valor: Triplete) => {
    setTokens((x) => ({ ...x, [t]: valor }));
    setTextos((x) => ({ ...x, [t]: valor }));
  };

  const proponer = useCallback(async () => {
    const api = hostBridge();
    if (!api?.brandFetchSite) return;
    setLeyendo(true);
    setPropuesta(null);
    try {
      const r = await api.brandFetchSite(url);
      if (!r.ok) {
        toast({ variant: "destructive", title: "No se pudo leer el sitio", description: `${r.error} Cargá los valores a mano.` });
        return;
      }
      const extraccion = extraerMarca({ url: r.sitio.url, urlFinal: r.sitio.urlFinal, html: r.sitio.html, css: r.sitio.css });
      // La IA mejora el mapeo sólo entre los candidatos de la página; si no
      // hay motor (modo local sin salida estructurada), queda la heurística.
      let conIa = false;
      let motivoIa: string | undefined;
      let tokensIa: Tokens = {};
      let fuenteIa: string | undefined;
      if (extraccion.candidatos.length) {
        const familias = extraccion.fuente ? [extraccion.fuente] : [];
        const ia = await runAi(brandFromSiteTask, { url: r.sitio.urlFinal, candidatos: extraccion.candidatos, familias });
        if (ia) {
          conIa = true;
          tokensIa = { paper: ia.paper, ink: ia.ink, muted: ia.muted, accent: ia.accent, link: ia.link };
          fuenteIa = ia.fuente;
        } else motivoIa = "sin motor con salida estructurada";
      }
      const mezclados: Tokens = { ...extraccion.tokens };
      for (const [k, v] of Object.entries(tokensIa)) if (v) mezclados[k as TokenDeMarca] = v;
      const completos = completarTokens(mezclados);
      // Ajustes por contraste, aplicados: la propuesta ya cumple.
      const medidasProp = validarPerfil(completos);
      for (const m of medidasProp) if (!m.ok && m.propuesta) completos[m.token] = m.propuesta;
      const lineas = reciboDe({
        url: r.sitio.url,
        urlFinal: r.sitio.urlFinal,
        fecha: hoy(),
        extraccion,
        tokens: completos,
        medidas: medidasProp,
        conIa,
        motivoIa,
      });
      if (r.sitio.omitidas.length) lineas.push(`Hojas no leídas: ${r.sitio.omitidas.join(" · ")}`);
      setPropuesta({ tokens: completos, fuente: fuenteIa ?? extraccion.fuente, recibo: lineas });
    } finally {
      setLeyendo(false);
    }
  }, [runAi, toast, url]);

  const aplicarPropuesta = () => {
    if (!propuesta) return;
    setTokens(propuesta.tokens);
    setTextos(propuesta.tokens as Partial<Record<TokenDeMarca, string>>);
    setFuente(propuesta.fuente ?? "");
    setRecibo(propuesta.recibo);
    setPropuesta(null);
  };

  const onGuardar = () => {
    if (!todoCumple) return;
    const nombre = orgId ? (orgs.find((o) => o.slug === orgId)?.nombre ?? orgId) : "Por defecto";
    // Se guarda COMPLETO (papel explícito y derivados): un perfil con tinta y
    // sin papel se mediría contra un papel claro y se dibujaría sobre el papel
    // oscuro del tema; con todos los tokens, lo medido es lo que se ve.
    const perfil: PerfilDeMarca = {
      id: orgId ? `org-${orgId}` : PERFIL_POR_DEFECTO_ID,
      orgId,
      nombre,
      tokens: completarTokens(tokens),
      ...(fuente.trim() ? { fuente: fuente.trim() } : {}),
      recibo,
      fecha: hoy(),
    };
    guardar(perfil);
    toast({ title: `Marca guardada: ${nombre}`, description: "Los proyectos de esta organización la usan en la skin editorial." });
  };

  const onBorrar = () => {
    if (!perfilGuardado) return;
    borrar(perfilGuardado.id);
    toast({ title: "Marca borrada", description: "Sus proyectos vuelven a los tokens de la skin." });
  };

  const swatch = (t?: Triplete) => (t ? { backgroundColor: `hsl(${t})` } : undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          Marca
        </CardTitle>
        <CardDescription className="mt-1.5">
          Colores y tipografía con que la <b>skin editorial</b> viste los proyectos de cada
          organización. La canónica no cambia. Se guarda en esta máquina.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-[200px_1fr] sm:items-center">
          <Label htmlFor="brand-destino">Organización</Label>
          <select
            id="brand-destino"
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value={PERFIL_POR_DEFECTO_ID}>Por defecto (proyectos sin organización)</option>
            {orgs.map((o) => (
              <option key={o.slug} value={o.slug}>
                {o.nombre}
                {perfiles.some((p) => p.orgId === o.slug) ? " · con marca" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Proponer desde el sitio */}
        <div className="rounded-md border p-3 space-y-2">
          <Label htmlFor="brand-url" className="flex items-center gap-2">
            <Globe className="h-4 w-4" /> Proponer desde el sitio del cliente
          </Label>
          <div className="flex gap-2">
            <Input id="brand-url" placeholder="https://cliente.example" value={url} onChange={(e) => setUrl(e.target.value)} disabled={!puedeLeerSitio} />
            <Button type="button" onClick={proponer} disabled={!puedeLeerSitio || !url.trim() || leyendo || iaOcupada}>
              {leyendo || iaOcupada ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              Proponer
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {puedeLeerSitio
              ? "La página se lee desde la app (https, una redirección, 1 MB). Nada se guarda hasta que apliques."
              : "Este host no puede leer sitios: cargá los valores a mano."}
          </p>
          {propuesta && (
            <div className="space-y-2 border-t pt-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="font-medium">Actual</div>
                <div className="font-medium">Propuesta</div>
                {EDITORIAL_TOKENS.map((t) => (
                  <React.Fragment key={t}>
                    <div className="flex items-center gap-2">
                      <span className="h-4 w-4 rounded border" style={swatch(tokens[t])} /> {ETIQUETA[t]}: {tokens[t] ?? "—"}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-4 w-4 rounded border" style={swatch(propuesta.tokens[t])} /> {propuesta.tokens[t] ?? "—"}
                    </div>
                  </React.Fragment>
                ))}
                <div>Fuente: {fuente || "—"}</div>
                <div>{propuesta.fuente ?? "—"}</div>
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer">Recibo de fidelidad ({propuesta.recibo.length} líneas)</summary>
                <ul className="mt-1 list-disc pl-4 font-mono">
                  {propuesta.recibo.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </details>
              <Button type="button" size="sm" onClick={aplicarPropuesta}>
                Aplicar propuesta al editor
              </Button>
            </div>
          )}
        </div>

        {/* Editor de tokens con contraste medido */}
        <div className="space-y-2">
          {EDITORIAL_TOKENS.map((t) => {
            const m = medidas.find((x) => x.token === t);
            return (
              <div key={t} className="grid gap-2 sm:grid-cols-[200px_1fr_auto] sm:items-center">
                <Label htmlFor={`brand-${t}`} className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded border" style={swatch(tokens[t])} />
                  {ETIQUETA[t]}
                </Label>
                <Input
                  id={`brand-${t}`}
                  placeholder={`#hex, rgb() o hsl() · por defecto ${TOKENS_POR_DEFECTO[temaDePapel(papel)][t]}`}
                  value={textos[t] ?? ""}
                  onChange={(e) => cambiarToken(t, e.target.value)}
                  className={cn(textos[t] && !tokens[t] && "border-destructive")}
                />
                <div className="text-xs min-w-[180px]">
                  {m ? (
                    m.ok ? (
                      <span className="text-success">{m.ratio?.toFixed(2)}:1 ≥ {m.umbral}:1</span>
                    ) : (
                      <span className="flex items-center gap-2 text-destructive">
                        {m.ratio?.toFixed(2) ?? "?"}:1 &lt; {m.umbral}:1
                        {m.propuesta && (
                          <Button type="button" size="sm" variant="outline" onClick={() => ajustar(t, m.propuesta!)}>
                            Ajustar a {m.ratioPropuesta?.toFixed(2)}:1
                          </Button>
                        )}
                      </span>
                    )
                  ) : textos[t] && !tokens[t] ? (
                    <span className="text-destructive">no es un color medible</span>
                  ) : null}
                </div>
              </div>
            );
          })}
          <div className="grid gap-2 sm:grid-cols-[200px_1fr] sm:items-center">
            <Label htmlFor="brand-fuente">Familia tipográfica</Label>
            <Input id="brand-fuente" placeholder="Inter, Georgia… (se usa si está instalada)" value={fuente} onChange={(e) => setFuente(e.target.value)} />
          </div>
        </div>

        {recibo.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer">Recibo del perfil ({recibo.length} líneas)</summary>
            <ul className="mt-1 list-disc pl-4 font-mono">
              {recibo.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </details>
        )}

        <div className="flex items-center gap-2">
          <Button type="button" onClick={onGuardar} disabled={!todoCumple || !Object.keys(tokens).length}>
            <Save className="mr-2 h-4 w-4" /> Guardar marca
          </Button>
          {perfilGuardado && (
            <Button type="button" variant="outline" onClick={onBorrar}>
              <Trash2 className="mr-2 h-4 w-4" /> Borrar
            </Button>
          )}
          {!todoCumple && <span className="text-xs text-destructive">Hay colores que no cumplen el contraste: ajustalos antes de guardar.</span>}
        </div>
      </CardContent>
    </Card>
  );
}
