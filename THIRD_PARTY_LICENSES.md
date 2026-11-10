# Licencias de terceros

Qué material de terceros usa la app y bajo qué licencia. El proyecto se distribuye bajo
[Apache 2.0](LICENSE); los avisos de atribución están en [`NOTICE`](NOTICE).

## Dependencias de npm (dentro de los instaladores)

Cada paquete trae su licencia. El build genera **`THIRD_PARTY_NOTICES.txt`**
(`npm run licenses:notices`, `scripts/third-party-notices.mjs`) con el nombre, la versión, la
licencia y el texto de licencia de **cada dependencia de producción**. Ese archivo viaja dentro de
cada instalador (`extraResources`), como piden MIT, BSD e ISC (conservar el aviso de copyright) y
Apache 2.0 (propagar `NOTICE`).

La regla **LICENCIAS** de `scripts/repo-lint.mjs` hace fallar el gate si entra una dependencia de
producción con licencia copyleft fuerte (GPL, AGPL o SSPL) o sin licencia declarada, salvo las
excepciones revisadas de `licenses.allow` en `.claude/harness.config.json`. Hoy son:

| Paquete | Licencia | Por qué se admite |
|---|---|---|
| `@img/sharp-libvips-*` (libvips) | LGPL-3.0-or-later | Llega con `sharp` y se enlaza como biblioteca dinámica separada, que es el uso que permite la LGPL. Su licencia va en `THIRD_PARTY_NOTICES.txt` |
| `khroma` (dependencia de `mermaid`) | MIT | El `package.json` del paquete no declara el campo `license`, pero el paquete trae su archivo `license` MIT |

## Modelos que la app descarga (no viajan en el instalador)

Se bajan de Hugging Face sólo cuando el usuario pulsa «Descargar» en Ajustes. Las licencias se
verificaron en la ficha de cada repositorio el 2026-11-10.

| Modelo | Repositorio | Licencia | Uso |
|---|---|---|---|
| Gemma 4 E2B (it, LiteRT-LM) | `litert-community/gemma-4-E2B-it-litert-lm` | Apache-2.0 | IA local liviana |
| Gemma 4 E4B (it, LiteRT-LM) | `litert-community/gemma-4-E4B-it-litert-lm` | Apache-2.0 | IA local completa |
| Kokoro 82M v1.0 (ONNX) | `onnx-community/Kokoro-82M-v1.0-ONNX` | Apache-2.0 | voz (lectura en voz alta) |

Si un modelo nuevo trae otra licencia (por ejemplo, términos de uso con usos prohibidos), hay que
mostrarla en Ajustes antes de la descarga y agregarla a esta tabla.

## Bibliotecas que la app carga desde el CDN (jsDelivr)

| Biblioteca | Licencia | Uso |
|---|---|---|
| `@litert-lm/core` | Apache-2.0 | motor de IA local (WebGPU) |
| `@huggingface/transformers` | Apache-2.0 | voz (Kokoro) |
| `pdfjs-dist` (PDF.js) | Apache-2.0 | leer PDF adjuntos |
| `tesseract.js` y sus datos de idioma | Apache-2.0 | leer texto de imágenes (OCR) |

## Catálogo de iconos de tecnología (`src/lib/icons/catalog.generated.ts`)

Generado por `scripts/build-icon-catalog.ts` desde `scripts/icon-catalog.manifest.json`
(spec 025). Cada icono declara su fuente y licencia en el propio catálogo.

| Fuente | Licencia | Uso |
|---|---|---|
| [Simple Icons](https://simpleicons.org) | CC0 1.0 | logos de marcas (SVG de un trazo, color de marca) |
| [Devicon](https://devicon.dev) | MIT | logos que Simple Icons ya no distribuye (AWS, Azure, Slack, Oracle, SQL Server, Java, C#, Salesforce, Twilio, Heroku, gRPC, Cassandra, React Native) |
| [Lobe Icons](https://github.com/lobehub/lobe-icons) (`@lobehub/icons-static-svg`) | MIT | logos de IA y nube que ni Simple Icons ni Devicon distribuyen (OpenAI, Amazon Bedrock, Groq, Azure AI, Vertex AI, Cohere…) |
| [lucide](https://lucide.dev) | ISC | iconos genéricos (nube, servidor, base de datos, cola…), ya dependencia de la app |

Los logos son marcas registradas de sus dueños y se usan únicamente para **identificar** la
tecnología que representa una caja del diagrama, no como respaldo ni afiliación. Si el dueño de
una marca pide retirarla, se quita del manifiesto y se regenera el catálogo.

Texto de la licencia MIT de Devicon:

```
Copyright (c) 2015 konpa

Permission is hereby granted, free of charge, to any person obtaining a copy of this software
and associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

Lobe Icons se distribuye bajo la misma licencia MIT (texto de arriba), con
`Copyright (c) 2023 LobeHub`.
# Dependencias de la preview colaborativa

- Yjs 13.6.33 — MIT — https://github.com/yjs/yjs
- @number0/iroh 1.2.0 — MIT OR Apache-2.0 — https://github.com/n0-computer/iroh-ffi

Se conservan los avisos originales de estas dependencias en sus paquetes. El relay
oficial se ejecuta por separado; no se incorpora su binario a este repositorio.
