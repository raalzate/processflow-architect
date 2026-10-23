# Licencias de terceros

Material de terceros que viaja DENTRO del repo (no como dependencia de npm). Lo que entra por
`package.json` tiene su licencia en cada paquete.

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
