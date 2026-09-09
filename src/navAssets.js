/* =========================================================================
 * ESTILOS DEL MENÚ — fuente única del CSS y el comportamiento.
 *
 * POR QUÉ ESTO VIVE ACÁ Y NO EN EL THEME
 * Sebastián reportó que el menú de la tienda NO se veía igual que la vista
 * previa del panel — o sea, la previa mentía y no servía para probar nada.
 * Pasaba porque eran dos implementaciones: el theme aplicaba las reglas con el
 * JS de nav-estilos.tpl y el panel dibujaba un menú inventado, con su propio
 * HTML y su propio CSS.
 *
 * Ahora hay UNA sola fuente: este archivo. El theme lo recibe embebido
 * (npm run export:theme escribe snipplets/navigation/nav-estilos.tpl) y la
 * previa del panel carga exactamente el mismo CSS y el mismo JS sobre el HTML
 * REAL del menú de la tienda. Si la previa se ve mal, la tienda también — que
 * es justamente lo que se le pide a una previa.
 *
 * ⚠️ Va embebido en el theme y NO se baja de Render a propósito: el menú está
 * en todas las páginas y no puede depender de que el motor esté despierto.
 * ⚠️ Son template literals. El export escapa backslashes, backticks e
 * interpolaciones — y los backslashes PRIMERO, o las regex del JS se rompen.
 * ========================================================================= */

/* La documentación del snippet, que viaja al theme como comentario Twig. */
const DOC = `=========================================================================
   ESTILOS DEL MENÚ — la capa estética que se configura desde el motor.

   QUÉ RESUELVE
   Los ítems especiales del menú estaban escritos a mano acá al lado, en
   navigation-nav-list.tpl: un 'if' por "Looks", otro por "Combos", otro por el
   ítem de temporada. Poner una "SUPERLIQUIDACIÓN" era tocar Twig, y cambiarle
   la foto a un ítem era volver a subir el theme. Ahora las reglas se cargan
   desde el panel del motor (pestaña Menú) y esto las aplica.

   TAMBIÉN REEMPLAZA A LOS DOS SISTEMAS DE FOTOS DEL MENÚ:
   · 'mega_menu_cat_1..4' — la foto al costado del desplegable. Eran cuatro
     huecos, matcheados por nombre, con la foto como ARCHIVO DEL THEME.
   · 'subcat_visual_1..8' — la miniatura al lado de un subítem. Ocho huecos,
     mismo problema.
   Los dos siguen funcionando: si hay una regla acá para ese ítem, gana la
   regla; si no, queda lo viejo. La migración se hace de a un ítem por vez.

   TRES REGLAS DE ORO, porque el menú está en TODAS las páginas:
   1. SI EL MOTOR NO CONTESTA, EL MENÚ SE VE NORMAL. No hay un solo estilo que
      dependa de la respuesta para verse bien: esto sólo AGREGA cosas encima.
   2. UN PEDIDO POR SESIÓN, no por página. La respuesta se guarda en
      sessionStorage; en la segunda página ya está tibia y se pinta de forma
      sincrónica, sin parpadeo.
   3. SE MATCHEA POR URL. El sistema viejo comparaba el TEXTO del ítem, así que
      renombrar la categoría en el admin rompía el estilo en silencio.

   El nombre del ítem NUNCA se borra, ni cuando se reemplaza por una imagen: se
   esconde a la vista pero se lo sigue leyendo Google y los lectores de pantalla.
   =========================================================================`;

const CSS = `
/* El globito de al lado del nombre. Los colores son los cuatro que ofrece el
   panel; el default naranja es el mismo --blacks-accent del sitio. */
.nav-fx-badge {
    display: inline-block;
    margin-left: 6px;
    padding: 2px 7px;
    border-radius: 999px;
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.03em;
    /* line-height 1.5 agrandaba la fila del menú: con 1.35 el globito entra
       dentro del alto del texto y el header no crece. */
    line-height: 1.35;
    vertical-align: middle;
    white-space: nowrap;
    background: #FF6B00;
    /* ⚠️ EL text-fill NO ES DECORATIVO — ES OBLIGATORIO.
       El chip de SALE INVIERNO (style-async.scss) pinta su texto con un
       degradado y para eso usa '-webkit-text-fill-color: transparent', con
       !important. Cualquier hijo lo HEREDA: el globito salía como un
       rectángulo naranja VACÍO. Le pasó al badge original del theme en su
       momento y volvió a pasar con este. Hay que fijar los dos. */
    color: #fff !important;
    -webkit-text-fill-color: #fff !important;
    /* Por el mismo motivo: el chip también fuerza mayúsculas y espaciado. */
    text-transform: none;
    transform: none;
}
.nav-fx-badge[data-fx="rojo"]  { background: #dc2626; }
.nav-fx-badge[data-fx="verde"] { background: #15803d; }
.nav-fx-badge[data-fx="negro"] { background: #111; }
.nav-fx-badge[data-fx="degradado"] { background: linear-gradient(100deg, #FF6B00, #E02B00); }
.nav-fx-badge[data-fx="contorno"] {
    background: transparent;
    border: 1px solid currentColor;
    color: #FF6B00 !important;
    -webkit-text-fill-color: #FF6B00 !important;
    font-weight: 700;
}
.nav-fx-badge[data-forma="recto"] { border-radius: 3px; }

/* --- ÍCONO. SVG de línea, nunca emoji: el emoji lo dibuja cada sistema a su
       manera y no toma el color del ítem. Hereda currentColor. --- */
.nav-fx-ico {
    width: 1em; height: 1em;
    margin-right: 6px;
    vertical-align: -0.12em;
    flex: none;
    stroke: currentColor;
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    /* Mismo motivo que el badge: dentro del chip de SALE INVIERNO el trazo
       heredaría el relleno transparente. */
    -webkit-text-fill-color: currentColor;
}

.nav-fx-mayus { text-transform: uppercase; letter-spacing: .04em; }

/* --- MOVIMIENTO. Los dos se apagan con prefers-reduced-motion (abajo). --- */
@keyframes nav-fx-pulso {
    0%, 100% { transform: scale(1); }
    50%      { transform: scale(1.06); }
}
.nav-fx-anim-pulso .nav-fx-badge { animation: nav-fx-pulso 2.4s ease-in-out infinite; }

/* El destello es una banda clara que cruza el globito cada tantos segundos.
   Va con overflow hidden y ::after para no tocar el texto. */
.nav-fx-anim-brillo .nav-fx-badge { position: relative; overflow: hidden; }
.nav-fx-anim-brillo .nav-fx-badge::after {
    content: "";
    position: absolute; top: 0; bottom: 0; left: -60%;
    width: 40%;
    background: linear-gradient(100deg, transparent, rgba(255,255,255,.55), transparent);
    animation: nav-fx-brillo 3.2s ease-in-out infinite;
}
@keyframes nav-fx-brillo {
    0%, 62% { left: -60%; }
    92%, 100% { left: 130%; }
}

/* Ítem con fondo propio: necesita aire y esquinas, si no el color queda pegado
   al texto de al lado y se lee como un error. */
.nav-fx-bg {
    padding: 4px 10px !important;
    border-radius: 4px;
}
/* En el menú de celular el link ocupa toda la fila, así que el fondo se pinta
   como una banda y conviene que respire distinto. */
.mobile-nav-row .nav-fx-bg { display: inline-block; margin: 2px 0; }

/* La palabra hecha imagen. El alto lo manda la regla (--nav-fx-h); el ancho es
   automático para no deformar el PNG ni el GIF. */
.nav-fx-img {
    height: var(--nav-fx-h, 22px);
    width: auto;
    display: inline-block;
    vertical-align: middle;
}
/* El texto sigue estando para Google y para los lectores de pantalla: se saca
   de la vista, no del documento. */
.nav-fx-oculto {
    position: absolute !important;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
}
.nav-fx-hide { display: none !important; }

@media (prefers-reduced-motion: reduce) {
    .nav-fx-anim-pulso .nav-fx-badge,
    .nav-fx-anim-brillo .nav-fx-badge::after { animation: none; }
}

/* --- MINIATURA DEL SUBÍTEM (reemplaza a subcat_visual_1..8) -------------
   El theme ya traía .nav-subitem-img para esto, pero la foto era un archivo
   suyo y sólo entraban ocho. Se reusa la clase para heredar el diseño y se
   agrega la propia, que es la que redondea y reserva el hueco. */
.nav-fx-thumb {
    width: 34px; height: 34px;
    object-fit: cover;
    border-radius: 8px;
    flex: none;
    background: #f1f0ee;
}
.nav-fx-conthumb {
    display: flex !important;
    align-items: center;
    gap: 10px;
}

/* --- PLACA DEL DESPLEGABLE (reemplaza a mega_menu_cat_1..4) -------------
   La vieja era un <img> suelto con un <p> debajo. Esta es una placa con la
   foto de fondo, el texto encima sobre un degradado y un botón, que es como
   se ven hoy los menús de las tiendas grandes. El degradado NO es decorativo:
   sin él el texto blanco depende de que la foto sea oscura justo abajo. */
.nav-fx-visual {
    flex: 0 0 300px;
    max-width: 300px;
    align-self: stretch;
}
.nav-fx-placa {
    position: relative;
    display: block;
    overflow: hidden;
    border-radius: 14px;
    aspect-ratio: 3 / 4;
    text-decoration: none;
    background: #eceae6;
    isolation: isolate;
}
.nav-fx-placa img {
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    object-fit: cover;
    transition: transform .55s cubic-bezier(.2,.6,.2,1);
}
.nav-fx-placa::after {
    content: "";
    position: absolute; inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,.82) 4%, rgba(0,0,0,.28) 46%, rgba(0,0,0,.02) 74%);
}
.nav-fx-placa:hover img { transform: scale(1.045); }
.nav-fx-placa-body {
    position: absolute; left: 0; right: 0; bottom: 0;
    z-index: 1;
    padding: 20px 20px 22px;
    color: #fff;
}
.nav-fx-placa-kicker {
    display: inline-block;
    font-size: .6rem; font-weight: 800; letter-spacing: .14em; text-transform: uppercase;
    background: #FF6B00; color: #fff;
    padding: 3px 7px; border-radius: 3px;
    margin: 0 0 9px;
}
.nav-fx-placa-title {
    margin: 0; color: #fff;
    font-size: 1.18rem; font-weight: 800; line-height: 1.15; letter-spacing: -.015em;
    text-wrap: balance;
}
.nav-fx-placa-text {
    margin: 7px 0 0; color: rgba(255,255,255,.86);
    font-size: .8rem; line-height: 1.45; font-weight: 400;
}
.nav-fx-placa-cta {
    display: inline-flex; align-items: center; gap: 6px;
    margin-top: 14px; padding: 9px 15px;
    background: #fff; color: #111;
    border-radius: 999px;
    font-size: .76rem; font-weight: 700;
    transition: gap .25s ease;
}
.nav-fx-placa:hover .nav-fx-placa-cta { gap: 11px; }
.nav-fx-placa-cta svg { width: 13px; height: 13px; }

@media (prefers-reduced-motion: reduce) {
    .nav-fx-placa img, .nav-fx-placa-cta { transition: none; }
    .nav-fx-placa:hover img { transform: none; }
}
/* Debajo del corte de escritorio el desplegable no existe: la placa no se
   dibuja, pero si algún theme la dejara en el DOM, que no ocupe lugar. */
@media (max-width: 991px) { .nav-fx-visual { display: none; } }
`;

const JS = `
(function () {
    'use strict';

    var ENGINE = 'https://blacks-meta-api.onrender.com/api/nav/style';
    var CACHE_KEY = 'blacksNavFx';
    var TTL_MS = 30 * 60 * 1000;
    var TIMEOUT_MS = 6000;

    /* ---------------------------------------------------------- utilidades */

    // Mismo criterio que normalizarUrl() en el motor (src/navMenu.js): sin
    // dominio, sin querystring, sin barras en los bordes, en minúsculas. Si los
    // dos lados no normalizan igual, no matchea nada.
    function normUrl(u) {
        var s = String(u || '').trim().toLowerCase();
        if (!s) return '';
        s = s.split('?')[0].split('#')[0];
        s = s.replace(/^https?:\\/\\/[^/]+/, '');
        return s.replace(/^\\/+|\\/+$/g, '');
    }

    /**
     * Es la URL del itiem esta regla?
     *
     * NO alcanza con comparar por igual, y esto costo encontrarlo: el motor
     * arma la URL de cada categoria como "/" + handle (storeCategories.js), o
     * sea SIN la rama del padre, pero Tiendanube sirve las subcategorias con la
     * ruta entera. Una regla para "SALE INVIERNO > Pantalones" quedaba guardada
     * como "pantalones2" y el link del menu es "/otono-invierno/pantalones2/":
     * no matcheaban nunca. Resultado: TODA regla sobre una subcategoria no
     * hacia nada y solo andaban las de primer nivel.
     *
     * Se acepta que una sea el final de la otra, por segmento completo, para
     * que "pantalones2" no matchee "otros-pantalones2".
     */
    function mismaUrl(url, match) {
        if (url === match) return true;
        if (!url || !match) return false;
        return url.slice(-(match.length + 1)) === '/' + match
            || match.slice(-(url.length + 1)) === '/' + url;
    }

    function normTexto(t) {
        return String(t || '').trim().toLowerCase().replace(/\\s+/g, ' ');
    }

    function esMobile() { return window.matchMedia('(max-width: 991px)').matches; }

    /**
     * La URL de un ítem del menú — y NO siempre es su href.
     *
     * ⚠️ En el menú de celular, los ítems QUE TIENEN SUBCATEGORÍAS no son un
     * <a>: son un <span class="nav-list-link mobile-link"> sin href, porque el
     * clic abre el acordeón en vez de navegar (ver navigation-nav-list.tpl).
     * Buscando sólo el href, las categorías MADRE nunca matcheaban y en el
     * celular los formatos aparecían únicamente en las hojas — que es
     * exactamente lo que se reportó.
     *
     * La URL de esa categoría sí está a mano: es la del "Ver todo en X" que
     * encabeza su propio desplegable.
     */
    function urlDe(link) {
        var href = link.getAttribute('href');
        if (href && href !== '#') return href;

        var fila = link.closest('.mobile-nav-row');
        var lista = fila && fila.nextElementSibling;
        if (lista && lista.classList && lista.classList.contains('mobile-dropdown-list')) {
            var verTodo = lista.querySelector('.view-all-link');
            if (verTodo) return verTodo.getAttribute('href');
        }
        // En escritorio pasa lo mismo con los megamenús: el <a> puede ir a "#".
        var li = link.closest('li');
        var propio = li && li.querySelector('a.nav-list-link[href]:not([href="#"])');
        return propio ? propio.getAttribute('href') : '';
    }

    /* ------------------------------------------------------------ fuentes */

    // Se bajan SÓLO las que alguna regla usa, y una sola vez.
    var fuentesPedidas = {};
    function pedirFuente(nombre) {
        if (!nombre || fuentesPedidas[nombre]) return;
        fuentesPedidas[nombre] = true;
        var l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family='
            + encodeURIComponent(nombre).replace(/%20/g, '+') + '&display=swap';
        document.head.appendChild(l);
    }

    /* ------------------------------------------------------------ aplicar */

    function aplicarA(link, r) {
        // Una regla se aplica UNA vez por link: el menú se recorre de nuevo al
        // abrir el hamburguesa y sin esto se apilarían globitos.
        if (link.getAttribute('data-nav-fx') === '1') return;
        link.setAttribute('data-nav-fx', '1');

        var fila = link.closest('.mobile-nav-row') || link.parentElement;

        if (r.hide) {
            (link.closest('li') || fila || link).classList.add('nav-fx-hide');
            return;
        }

        if (r.color) {
            link.style.setProperty('color', r.color, 'important');
            // El chip de SALE INVIERNO fuerza -webkit-text-fill-color, así que
            // con 'color' solo el texto seguiría transparente.
            link.style.setProperty('-webkit-text-fill-color', r.color, 'important');
        }
        if (r.bg) {
            link.classList.add('nav-fx-bg');
            // Dos colores = degradado; uno solo = plano.
            const fondo = r.bg2
                ? 'linear-gradient(' + (r.bg_ang || '100') + 'deg, ' + r.bg + ', ' + r.bg2 + ')'
                : r.bg;
            link.style.setProperty('background', fondo, 'important');
            // Sin color propio sobre un fondo lleno el texto queda ilegible la
            // mitad de las veces: se elige blanco o negro según qué tan oscuro
            // sea el fondo, en vez de dejarlo librado al CSS del theme.
            if (!r.color) {
                const tinta = contraste(r.bg);
                link.style.setProperty('color', tinta, 'important');
                link.style.setProperty('-webkit-text-fill-color', tinta, 'important');
            }
        }
        if (r.mayus) link.classList.add('nav-fx-mayus');
        if (r.animacion) link.classList.add('nav-fx-anim-' + r.animacion);
        if (r.font) {
            pedirFuente(r.font);
            link.style.setProperty('font-family', '"' + r.font + '", Inter, sans-serif');
            link.style.setProperty('letter-spacing', '.02em');
        }

        if (r.image) {
            // El texto se esconde pero NO se borra: es lo que lee Google.
            var textoOriginal = link.textContent.trim();
            var img = document.createElement('img');
            img.className = 'nav-fx-img';
            img.src = r.image;
            img.alt = '';
            img.setAttribute('aria-hidden', 'true');
            img.style.setProperty('--nav-fx-h', (r.image_h || 22) + 'px');
            var oculto = document.createElement('span');
            oculto.className = 'nav-fx-oculto';
            oculto.textContent = textoOriginal;
            link.textContent = '';
            link.appendChild(img);
            link.appendChild(oculto);
        }

        // Miniatura al lado del nombre. Sólo si NO se reemplazó la palabra por
        // una imagen: las dos cosas juntas serían dos fotos en el mismo ítem.
        if (r.thumb && !r.image) aplicarThumb(link, r);

        // Ícono antes del nombre. El path viene resuelto desde el motor, así
        // el theme no necesita su propia copia de la librería.
        if (r.icono_d) {
            var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('class', 'nav-fx-ico');
            svg.setAttribute('aria-hidden', 'true');
            var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', r.icono_d);
            svg.appendChild(path);
            link.insertBefore(svg, link.firstChild);
        }

        if (r.badge_text) {
            var b = document.createElement('span');
            b.className = 'nav-fx-badge';
            b.setAttribute('data-fx', r.badge_style || 'sale');
            if (r.badge_forma) b.setAttribute('data-forma', r.badge_forma);
            // Colores propios: pisan la paleta fija de data-fx.
            if (r.badge_c1) {
                b.style.setProperty('background',
                    r.badge_c2 ? 'linear-gradient(100deg, ' + r.badge_c1 + ', ' + r.badge_c2 + ')' : r.badge_c1,
                    'important');
                var tinta = r.badge_tinta || contraste(r.badge_c1);
                b.style.setProperty('color', tinta, 'important');
                b.style.setProperty('-webkit-text-fill-color', tinta, 'important');
                b.style.setProperty('border-color', 'transparent', 'important');
            }
            b.textContent = r.badge_text;
            link.appendChild(b);
        }

        // La placa del desplegable es del ítem de nivel 1, no del link: se
        // dibuja al costado de la lista de subcategorías.
        if (r.mega_image && !esMobile()) aplicarMega(link, r);
    }

    /* --------------------------------------------- miniatura del subítem */

    function aplicarThumb(link, r) {
        var texto = link.textContent.trim();
        var img = document.createElement('img');
        // Se reusa .nav-subitem-img (la clase del theme) para heredar su
        // diseño, y .nav-fx-thumb pone lo nuestro: tamaño y esquinas.
        img.className = 'nav-subitem-img nav-fx-thumb';
        img.src = r.thumb;
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        img.loading = 'lazy';
        var span = document.createElement('span');
        span.className = 'nav-subitem-text';
        span.textContent = texto;
        link.textContent = '';
        link.classList.add('nav-mega-link-with-img', 'nav-fx-conthumb');
        link.appendChild(img);
        link.appendChild(span);
    }

    /* --------------------------------------------- placa del desplegable */

    function aplicarMega(link, r) {
        var li = link.closest('li');
        if (!li) return;
        var cont = li.querySelector('.nav-mega-container');
        if (!cont) return;   // este ítem no tiene desplegable: no hay dónde ponerla

        // El sistema viejo (mega_menu_cat_1..4, configurado en el panel de
        // diseño de Tiendanube) dibuja su propia .nav-mega-visual. Si hay regla
        // acá, MANDA la regla: se saca la vieja y se pone esta. Así la migración
        // es de a un ítem por vez y lo que todavía no se migró sigue andando.
        var vieja = cont.querySelector('.nav-mega-visual, .nav-fx-visual');
        if (vieja) vieja.remove();

        // Esa clase centra la lista cuando NO hay foto. Con foto, estorba.
        var links = cont.querySelector('.nav-mega-links');
        if (links) links.classList.remove('nav-mega-links-centered');

        var caja = document.createElement('div');
        caja.className = 'nav-fx-visual';

        var url = r.mega_url || link.getAttribute('href') || '#';
        var partes = '';
        if (r.mega_kicker) partes += '<span class="nav-fx-placa-kicker"></span>';
        partes += '<p class="nav-fx-placa-title"></p>';
        if (r.mega_text) partes += '<p class="nav-fx-placa-text"></p>';
        if (r.mega_cta) {
            partes += '<span class="nav-fx-placa-cta"><span></span>'
                + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"'
                + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
                + '<path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg></span>';
        }

        caja.innerHTML = '<a class="nav-fx-placa"><img alt="" loading="lazy">'
            + '<span class="nav-fx-placa-body">' + partes + '</span></a>';

        // El texto se escribe con textContent y NUNCA concatenado en el HTML:
        // sale de un formulario y un apóstrofo o un < lo romperían.
        var a = caja.querySelector('.nav-fx-placa');
        a.href = url;
        var im = caja.querySelector('img');
        im.src = r.mega_image;
        im.alt = r.mega_title || '';
        if (r.mega_kicker) caja.querySelector('.nav-fx-placa-kicker').textContent = r.mega_kicker;
        caja.querySelector('.nav-fx-placa-title').textContent = r.mega_title || link.textContent.trim();
        if (r.mega_text) caja.querySelector('.nav-fx-placa-text').textContent = r.mega_text;
        if (r.mega_cta) caja.querySelector('.nav-fx-placa-cta span').textContent = r.mega_cta;

        cont.appendChild(caja);
    }

    // Blanco o negro según la luminancia del fondo. Es la cuenta estándar
    // (coeficientes de luma), no un umbral inventado.
    function contraste(hex) {
        var h = hex.replace('#', '');
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        var n = parseInt(h, 16);
        var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#111' : '#fff';
    }

    function aplicar(style) {
        if (!style || !style.reglas || !style.reglas.length) return;
        var mobile = esMobile();
        var links = document.querySelectorAll('.nav-list-link');
        if (!links.length) return;

        for (var i = 0; i < links.length; i++) {
            var link = links[i];
            var url = normUrl(urlDe(link));
            var texto = normTexto(link.textContent);

            // El "Ver todo en X" apunta a la MISMA url que su categoría madre. Sin
            // esta guarda recibía el mismo globito y el mismo fondo, y el
            // desplegable quedaba con el cartel repetido dos veces.
            if (link.classList.contains('view-all-link')) continue;

            for (var j = 0; j < style.reglas.length; j++) {
                var r = style.reglas[j];
                if (r.device === 'mobile' && !mobile) continue;
                if (r.device === 'desktop' && mobile) continue;
                // La URL manda; el texto es el respaldo para los ítems que no
                // son categorías (una página, un link suelto).
                var pega = (r.match && url && mismaUrl(url, r.match))
                    || (!r.match && r.match_text && texto === r.match_text);
                if (pega) { aplicarA(link, r); break; }
            }
        }
    }

    /* -------------------------------------------------------------- cargar */

    function deCache() {
        try {
            var box = JSON.parse(sessionStorage.getItem(CACHE_KEY));
            if (!box || !box.d || Date.now() - box.t > TTL_MS) return null;
            return box.d;
        } catch (e) { return null; }
    }

    function guardar(d) {
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {}
    }

    function cuandoHayaMenu(fn) {
        if (document.querySelector('.nav-list-link')) { fn(); return; }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn, { once: true });
        } else {
            fn();
        }
    }

    var estilo = deCache();
    if (estilo) {
        // Caché tibia: se pinta sin esperar a nadie, así no hay parpadeo del
        // menú sin estilo en la segunda página que visita alguien.
        cuandoHayaMenu(function () { aplicar(estilo); });
    }

    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);

    fetch(ENGINE, ctrl ? { signal: ctrl.signal } : undefined)
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (d) {
            guardar(d);
            // Se vuelve a aplicar aunque ya se haya pintado de la caché:
            // aplicarA() marca cada link y no repite lo ya hecho.
            estilo = d;
            cuandoHayaMenu(function () { aplicar(d); });
        })
        .catch(function (err) {
            // El menú se ve normal. No es un caso de error, es el plan B.
            if (window.console && window.console.debug) {
                window.console.debug('[menú] sin estilos del motor:', err.message);
            }
        })
        .finally(function () { clearTimeout(timer); });

    /* El menú de celular puede dibujarse recién al abrirlo, y al reordenarse
       pierde lo aplicado. Se reaplica al tocar el hamburguesa — un listener
       delegado sale mucho más barato que dejar un MutationObserver vivo. */
    document.addEventListener('click', function (ev) {
        if (!ev.target.closest) return;
        if (!ev.target.closest('.js-modal-open, .js-toggle-menu, [data-toggle="menu"], .nav-hamburger')) return;
        setTimeout(function () { if (estilo) aplicar(estilo); }, 120);
    }, true);

    window.addEventListener('resize', function () {
        // Al cruzar el corte de celular/computadora cambian las reglas que
        // aplican; las ya puestas quedan, pero las nuevas hay que ponerlas.
        if (estilo) aplicar(estilo);
    });
})();
`;

module.exports = { CSS, JS, DOC };
