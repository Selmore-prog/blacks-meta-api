#!/usr/bin/env node
/* =========================================================================
 * EXPORTAR LOS BLOQUES AL THEME
 *
 * El CSS y el comportamiento de los bloques viven en src/homeBlocksAssets.js,
 * que es lo que usa la vista previa del panel. Este script los copia dentro de
 * los dos snippets del theme para que la tienda NO tenga que bajar nada de
 * Render: si el motor está dormido (plan gratis), el home tiene que pintar
 * igual. Por eso van embebidos y por eso los archivos del theme se generan y
 * no se editan a mano.
 *
 *   npm run export:theme            → escribe en ../tiendanube-tpl
 *   npm run export:theme -- <ruta>  → escribe en otra copia del theme
 * ========================================================================= */

const fs = require('fs');
const path = require('path');
const { CSS, JS } = require('../src/homeBlocksAssets');
const navAssets = require('../src/navAssets');

const destino = process.argv[2] || path.join(__dirname, '..', '..', 'tiendanube-tpl');
const carpeta = path.join(destino, 'snipplets', 'home');

if (!fs.existsSync(carpeta)) {
  console.error(`No encontré ${carpeta}. Pasá la ruta del theme como argumento.`);
  process.exit(1);
}

const CABECERA = (archivo) => `{# =========================================================================
   ARCHIVO GENERADO — NO EDITAR A MANO.

   Lo escribe blacks-content-engine con \`npm run export:theme\` desde
   src/homeBlocksAssets.js, que es la misma fuente que usa la vista previa del
   panel. Si editás esto acá, el próximo export te lo pisa y además la previa
   del panel deja de coincidir con lo que ve el cliente.

   Generado: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}
   ${archivo}
   ========================================================================= #}
`;

/* ------------------------------------------------------------------ HOST --
 * Se incluye una vez por cada sección block_1..block_6 que el dueño puso en el
 * orden de la página de inicio. Sólo deja el hueco: el contenido lo inyecta el
 * script de abajo con lo que devuelve el motor.                              */
const HOST = `${CABECERA('snipplets/home/home-content-blocks.tpl')}
{# Arranca oculto y sin alto: si el motor no contesta, no queda un hueco vacío
   en el medio del home. #}
<div class="hb-host" data-hb-host="{{ section_select }}" hidden></div>
`;

/* ---------------------------------------------------------------- ASSETS --
 * Se incluye UNA sola vez, después del bucle de secciones, y sólo si hay algún
 * bloque en el orden del home (ver templates/home.tpl). Va después de los
 * huecos a propósito: así, cuando el visitante ya estuvo en la tienda, el
 * script pinta desde la caché de la sesión en el mismo parseo y la página no
 * salta.                                                                     */
const ASSETS = `${CABECERA('snipplets/home/home-content-blocks-assets.tpl')}
<style>
/* Los bloques traen su propio espaciado: sin esto se suma al margen que el
   theme le pone a .home-section-wrapper y quedan 88 px de aire de más en
   celular. */
.home-section-wrapper[class*="section-block_"] { margin-bottom: 0; }

/* AOS deja todo [data-aos] en opacity:0 hasta que entra en pantalla, y si se
   scrollea rápido las secciones quedan invisibles. Los bloques ya tienen su
   propia entrada, así que acá se desactiva. */
.home-section-wrapper[class*="section-block_"][data-aos] {
  opacity: 1 !important; transform: none !important;
}

${CSS}
</style>

<script>
/* El comportamiento (videos, acordeón) va PRIMERO a propósito: el inyector de
   abajo puede pintar de forma sincrónica cuando la caché de la sesión está
   tibia, y ahí necesita que window.blacksBlocksInit ya exista. Al revés, los
   videos de esas visitas nunca se inicializaban. */
${JS}

(function () {
    'use strict';
    if (window.__blacksBlocksHost) return;
    window.__blacksBlocksHost = true;

    var ENGINE = 'https://blacks-meta-api.onrender.com/api/home/rails';
    var CACHE_KEY = 'blacks_rails_cache';
    // El motor vive en Render: si está dormido puede tardar. Pasado el tope los
    // huecos quedan como estaban (ocultos) en vez de esperar para siempre.
    var TIMEOUT_MS = 8000;

    function pintar(data) {
        var blocks = (data && data.blocks) || {};
        var hosts = document.querySelectorAll('.hb-host[data-hb-host]');
        if (!hosts.length) return;

        // Sin el CSS, los bloques saldrían como una lista de textos y fotos
        // sueltas: peor que no mostrarlos. El estilo lo trae este mismo
        // archivo, así que si falta es porque el include no llegó.
        var listo = getComputedStyle(hosts[0]).getPropertyValue('--hb-css').trim();
        if (listo !== '1') {
            if (window.console) console.warn('[bloques] No cargó el CSS (falta incluir snipplets/home/home-content-blocks-assets.tpl en templates/home.tpl). No se dibuja nada.');
            return;
        }

        for (var i = 0; i < hosts.length; i++) {
            var host = hosts[i];
            var b = blocks[host.getAttribute('data-hb-host')];
            if (!b || !b.html) continue;
            host.innerHTML = b.html;
            host.hidden = false;
        }
        // Videos y acordeones del HTML recién inyectado.
        if (window.blacksBlocksInit) window.blacksBlocksInit(document);
    }

    function deCache() {
        try {
            var box = JSON.parse(sessionStorage.getItem(CACHE_KEY));
            if (!box || !box.data) return null;
            var ttl = (box.data.ttl || 900) * 1000;
            if (Date.now() - box.t > ttl) return null;
            return box.data;
        } catch (e) { return null; }
    }

    // Ya lo trajeron los rieles o las ofertas flash: se reusa y no se pide nada.
    if (window.__blacksRailsData) { pintar(window.__blacksRailsData); return; }

    var cache = deCache();
    if (cache) { window.__blacksRailsData = cache; pintar(cache); return; }

    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);
    fetch(ENGINE, ctrl ? { signal: ctrl.signal } : undefined)
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (data) {
            window.__blacksRailsData = data;
            try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data: data })); } catch (e) {}
            pintar(data);
        })
        .catch(function (err) {
            // Sin bloques la página sigue andando: simplemente no se muestran.
            if (window.console) console.warn('[bloques] No se pudieron cargar:', err.message);
        })
        .finally(function () { clearTimeout(timer); });
}());
</script>
`;

/* Red de contención: el theme se procesa con Twig, así que un {{, un {% o un
   {# sueltos dentro del CSS o del JS lo romperían en silencio en producción.
   Y un </script> adentro del JS cortaría el bloque antes de tiempo. */
function revisar(nombre, texto, permitidos) {
  const problemas = [];
  const cuenta = (aguja) => (texto.split(aguja).length - 1);
  if (cuenta('{{') > 0) problemas.push('tiene {{ (Twig lo tomaría como una variable)');
  if (cuenta('{%') > 0) problemas.push('tiene {% (Twig lo tomaría como una etiqueta)');
  if (cuenta('{#') !== permitidos.comentarios) problemas.push(`tiene ${cuenta('{#')} aperturas de comentario Twig y esperaba ${permitidos.comentarios}`);
  if (cuenta('{#') !== cuenta('#}')) problemas.push('tiene comentarios Twig desbalanceados');
  if (cuenta('</script>') !== permitidos.scripts) problemas.push(`tiene ${cuenta('</script>')} cierres de script y esperaba ${permitidos.scripts}`);
  if (cuenta('</style>') !== permitidos.estilos) problemas.push(`tiene ${cuenta('</style>')} cierres de estilo y esperaba ${permitidos.estilos}`);
  if (problemas.length) {
    console.error(`\nNo escribí nada: ${nombre} ${problemas.join('; ')}.`);
    console.error('Revisá src/homeBlocksAssets.js antes de volver a exportar.\n');
    process.exit(1);
  }
}

revisar('home-content-blocks.tpl', HOST.replace('{{ section_select }}', ''), { comentarios: 2, scripts: 0, estilos: 0 });
revisar('home-content-blocks-assets.tpl', ASSETS, { comentarios: 1, scripts: 1, estilos: 1 });

fs.writeFileSync(path.join(carpeta, 'home-content-blocks.tpl'), HOST);
fs.writeFileSync(path.join(carpeta, 'home-content-blocks-assets.tpl'), ASSETS);

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + ' KB';
console.log('Escritos en ' + carpeta + ':');
console.log('  home-content-blocks.tpl         ' + kb(HOST));
console.log('  home-content-blocks-assets.tpl  ' + kb(ASSETS));

/* ------------------------------------------------------------------ MENÚ --
 * Los estilos del menú (globitos, colores, íconos, placas del desplegable).
 * Misma lógica que los bloques: la fuente es src/navAssets.js y la previa del
 * panel usa EXACTAMENTE este CSS y este JS, así no puede mentir.             */
const carpetaNav = path.join(destino, 'snipplets', 'navigation');
if (fs.existsSync(carpetaNav)) {
  const navTpl = `{# =========================================================================
   ARCHIVO GENERADO — NO EDITAR A MANO.
   Fuente: blacks-content-engine/src/navAssets.js (npm run export:theme).
   Editarlo acá lo pisa el próximo export y además rompe la paridad con la
   vista previa del panel, que carga este mismo CSS y este mismo JS.

${navAssets.DOC}
   ========================================================================= #}

<style>${navAssets.CSS}</style>

<script>${navAssets.JS}</script>
`;
  const rutaNav = path.join(carpetaNav, 'nav-estilos.tpl');
  fs.writeFileSync(rutaNav, navTpl);
  console.log(`  nav-estilos.tpl                 ${(Buffer.byteLength(navTpl) / 1024).toFixed(1)} KB`);
}
