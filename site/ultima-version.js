/**
 * Enlaza la sección de descarga a la ÚLTIMA release publicada, sin tocar el HTML
 * en cada versión.
 *
 * El "why": los botones ya apuntan a /releases/latest, que siempre resuelve a la
 * última — eso funciona sin JavaScript y es el fallback. Esto sólo mejora lo que
 * ve quien tiene red: el número de versión, la fecha y el enlace DIRECTO al
 * instalador de su sistema, para que descargar sea un clic y no tres. Si la API
 * falla (sin red, límite de peticiones), no se toca nada: el HTML ya es correcto.
 */
(() => {
  const REPO = 'raalzate/processflow-architect';

  // Cada plataforma se reconoce por la extensión de su instalador, no por el
  // nombre del archivo: el nombre lleva la versión y cambia en cada release.
  // Se excluye .blockmap, que acompaña al .dmg y al .exe para el updater.
  const PLATAFORMAS = {
    mac: { sufijos: ['.dmg'], etiqueta: 'Descargar el .dmg' },
    win: { sufijos: ['.exe'], etiqueta: 'Descargar el .exe' },
    linux: { sufijos: ['.appimage'], etiqueta: 'Descargar el AppImage' },
  };

  const bytesLegibles = (n) =>
    n > 1024 * 1024 * 1024
      ? `${(n / 1024 ** 3).toFixed(1)} GB`
      : `${Math.round(n / 1024 ** 2)} MB`;

  const fechaLegible = (iso) =>
    new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });

  /** El sistema del visitante, para destacar su tarjeta. */
  function sistemaDelVisitante() {
    const p = `${navigator.userAgentData?.platform || ''} ${navigator.platform || ''} ${navigator.userAgent}`.toLowerCase();
    if (p.includes('mac')) return 'mac';
    if (p.includes('win')) return 'win';
    if (p.includes('linux') || p.includes('x11')) return 'linux';
    return null;
  }

  function assetPara(assets, sufijos) {
    return assets.find(
      (a) => !a.name.toLowerCase().endsWith('.blockmap') &&
        sufijos.some((s) => a.name.toLowerCase().endsWith(s)),
    );
  }

  async function pintar() {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!r.ok) return;
    const release = await r.json();
    const assets = release.assets || [];

    const sello = document.querySelector('[data-version-sello]');
    if (sello) sello.textContent = `${release.tag_name} · macOS, Windows y Linux`;

    const linea = document.querySelector('[data-version-linea]');
    if (linea) {
      linea.textContent = `Última versión: ${release.tag_name}, publicada el ${fechaLegible(release.published_at)}.`;
    }

    const mio = sistemaDelVisitante();

    for (const [so, { sufijos, etiqueta }] of Object.entries(PLATAFORMAS)) {
      const tarjeta = document.querySelector(`.plataforma[data-so="${so}"]`);
      if (!tarjeta) continue;

      const asset = assetPara(assets, sufijos);
      const boton = tarjeta.querySelector('a.boton');
      if (asset && boton) {
        boton.href = asset.browser_download_url;
        boton.textContent = etiqueta;
        const peso = document.createElement('span');
        peso.className = 'peso';
        peso.textContent = `${asset.name} · ${bytesLegibles(asset.size)}`;
        tarjeta.appendChild(peso);
      }
      if (so === mio) tarjeta.classList.add('tuya');
    }
  }

  pintar().catch(() => {
    /* Sin red o sin API: los enlaces a /releases/latest del HTML siguen siendo válidos. */
  });
})();
