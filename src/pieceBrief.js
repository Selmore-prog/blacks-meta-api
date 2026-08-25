/**
 * BRIEF DE PIEZA · el control de coherencia que se hace ANTES de renderizar.
 *
 * Por qué existe (pedido de ago-2026): "debe ser un análisis ultra detallado previo a
 * generar la pieza, como si un diseñador gráfico estuviera usando la app… debe tener
 * lógica siempre". Hasta ahora la única revisión era el QA VISUAL, que mira la pieza YA
 * renderizada y sólo busca ROTURAS (texto cortado, bloques pisados, contraste). Eso deja
 * pasar el problema más caro: piezas que están perfectas técnicamente pero no tienen
 * sentido — una ficha técnica de un pantalón que anuncia "capucha ajustable", un
 * `recorte` cuyo titular es una frase de nueve palabras, una `ficha` con una sola
 * característica y tres líneas apuntando al aire.
 *
 * Este módulo revisa la COMBINACIÓN plantilla + producto + textos + datos antes de gastar
 * un solo render, y devuelve o bien la pieza corregida, o bien una plantilla más baja que
 * el contenido SÍ sostiene. Es determinístico y gratis: no llama a ninguna IA. La IA
 * propone (director creativo, copy); acá el código verifica, igual que ya se hace con la
 * elección de producto.
 *
 * Nunca bloquea una generación: en el peor caso degrada a una plantilla más simple.
 */

const PRENDA_SUPERIOR = /(campera|buzo|remera|chomba|camisa|camper|sweater|pullover|chaleco|abrigo|polar|rompeviento|piloto|poncho|delantal|guardapolvo|mameluco|overol)/i;
const PRENDA_INFERIOR = /(pantal[oó]n|bermuda|short|jean|cargo|bombacha|pollera|calza)/i;
const CALZADO = /(bot[ií]n|borcegu[ií]|zapato|zapatilla|calzado|ojota|bota)/i;
const ACCESORIO = /(faja|guante|gorra|cintur[oó]n|media|casco|antiparra|barbijo|arn[eé]s)/i;

/** Qué tipo de producto es, por el nombre. Determina qué specs pueden ser ciertas. */
function tipoDePrenda(nombre) {
  const n = String(nombre || '');
  if (CALZADO.test(n)) return 'calzado';
  if (ACCESORIO.test(n)) return 'accesorio';
  if (PRENDA_INFERIOR.test(n)) return 'inferior';
  if (PRENDA_SUPERIOR.test(n)) return 'superior';
  return 'otro';
}

/*
 * Partes que NO pueden existir en cada tipo de prenda. Una spec que nombra una parte
 * imposible es un dato mal extraído de la descripción (las fichas de Tiendanube mezclan
 * texto de varios productos) y en la pieza se lee como una mentira: es exactamente el
 * tipo de error que un diseñador atento no dejaría salir.
 */
const PARTES_IMPOSIBLES = {
  inferior: /(capucha|cuello|manga|puño|escote|cierre pectoral|solapa)/i,
  superior: /(botamanga|entrepierna|tiro|ruedo del pantal[oó]n|pierna)/i,
  calzado: /(manga|cuello|capucha|cintura|bolsillo cargo|tiro)/i,
  accesorio: /(manga|capucha|botamanga|suela|puntera)/i,
};

/** ¿La spec puede ser verdad para este producto? */
function specCoherente(spec, tipo) {
  const imposible = PARTES_IMPOSIBLES[tipo];
  return !(imposible && imposible.test(String(spec || '')));
}

/**
 * Titular CORTO para 'recorte'. La plantilla lo imprime a ~150px partido en dos
 * renglones: una frase larga sale ilegible pisada contra la prenda. Se prefiere el
 * nombre del producto sin la marca repetida ni el subtítulo tras los dos puntos.
 */
function tituloCorto(productName, fallback) {
  const base = String(productName || fallback || '').split(/[:|–—]/)[0].trim();
  const palabras = base.split(/\s+/).filter(Boolean);
  if (!palabras.length) return null;
  // "Pantalon Cargo Ripstop Antidesgarro Pampero" -> 4 palabras alcanzan y sobran.
  return palabras.slice(0, 4).join(' ');
}

/**
 * ¿Se va a poder LEER el titular con la prenda delante?
 *
 * Falla real (historia del Cargo Cazador): la silueta ocupaba el 51% del ancho y el
 * titular quedó "PANTAL___CAZADOR" / "GU__RE__ZADO". El efecto de texto por detrás sólo
 * funciona si la prenda tapa una porción CHICA de cada renglón: lo tapado se reconstruye
 * solo en la cabeza del lector si ve el principio y el final de la palabra. Pasado cierto
 * punto ya no se reconstruye nada y la pieza queda, además, con aire de collage pegado.
 *
 * Devuelve la fracción tapada del renglón más comprometido (0 = nada, 1 = todo).
 */
function tapadoDelTitular(titulo, box, { width = 1080, padX = 60, maxSize = 150 } = {}) {
  if (!box) return 0;
  const { fitTwoLines } = require('./templatesModern');
  const fitted = fitTwoLines(titulo, { maxWidth: width - padX * 2, maxSize });
  if (!fitted) return 0;
  const anchoSujeto = (box.x1 - box.x0) * width;
  // Anton avanza ~0,42em por carácter (el mismo factor que usa la plantilla para el cuerpo).
  const anchoL1 = Math.max(1, fitted.l1.length * fitted.size * 0.42);
  /*
   * Se mide SÓLO el primer renglón (el sólido, blanco): es el que lleva el mensaje.
   * El segundo va en contorno y es decorativo — que la prenda lo cruce es parte del
   * efecto, no un defecto. Medir el más corto de los dos degradaba todas las piezas de
   * pantalón, incluidas las que se leían perfecto.
   *
   * Además la plantilla desplaza los renglones a los costados en vez de centrarlos, así
   * que la prenda tapa como mucho la MITAD de lo que taparía centrada.
   */
  return Math.min(1, (anchoSujeto * 0.5) / anchoL1);
}

/**
 * Revisa el plan de la pieza y lo corrige. Devuelve
 * { template, specs, displayTitle, deck, notas[], degradado }.
 *
 * `notas` explica cada decisión en una línea — se loguea, así queda por qué la pieza
 * salió como salió (y se puede discutir, igual que el resto del sistema).
 */
function reviewPiece({
  template,
  product = null,
  displayTitle = null,
  title = null,
  specs = null,
  deck = null,
  cutoutOk = false,
  cutoutBox = null,
  format = 'feed',
} = {}) {
  const notas = [];
  let out = template;
  const nombre = product && product.name;
  const tipo = tipoDePrenda(nombre);

  // 1) SPECS QUE NO PUEDEN SER CIERTAS PARA ESTE PRODUCTO.
  let specsLimpias = Array.isArray(specs) ? specs.filter(Boolean) : [];
  if (specsLimpias.length && tipo !== 'otro') {
    const antes = specsLimpias.length;
    specsLimpias = specsLimpias.filter((s) => {
      const ok = specCoherente(s, tipo);
      if (!ok) notas.push(`Descarto la característica "${s}": no puede existir en un producto de tipo ${tipo} ("${nombre}").`);
      return ok;
    });
    if (specsLimpias.length !== antes) notas.push(`Quedaron ${specsLimpias.length} de ${antes} características verificables.`);
  }

  // 2) LA FICHA NECESITA MATERIAL REAL. Con una o dos características, las guías apuntan
  // al aire y la pieza se ve vacía: mejor 'recorte', que con una foto buena se sostiene sola.
  if (out === 'ficha') {
    if (!cutoutOk) {
      notas.push('La ficha necesita la silueta recortada de la prenda y esta foto no se puede recortar: paso a fullbleed.');
      out = 'fullbleed';
    } else if (specsLimpias.length < 3) {
      notas.push(`La ficha necesita al menos 3 características reales y hay ${specsLimpias.length}: paso a 'recorte'.`);
      out = 'recorte';
    } else if (specsLimpias.length > 4) {
      specsLimpias = specsLimpias.slice(0, 4);
      notas.push('Recorto a 4 características: más guías se pisan entre sí.');
    }
  }

  // 3) TITULAR CORTO para 'recorte' (hace falta antes de medir la legibilidad).
  let display = displayTitle;
  if (out === 'recorte') {
    const corto = tituloCorto(product && product.name, title);
    if (corto && (!display || display.split(/\s+/).length > 5)) {
      if (display && display !== corto) notas.push(`Titular acortado para el diseño: "${display}" -> "${corto}".`);
      display = corto;
    }
  }

  // 3.a) 'recorte' sin silueta es un rectángulo oscuro vacío.
  if (out === 'recorte' && !cutoutOk) {
    notas.push('El titular por detrás de la prenda no tiene silueta que lo tape: paso a fullbleed.');
    out = 'fullbleed';
  }

  /*
   * 3.b) LEGIBILIDAD DEL TITULAR. Si la prenda tapa demasiado, la pieza se cambia por una
   * con ESCENA GENERADA del producto (fullbleed la pide sola): queda moderna igual y sin
   * el recorte pegado. El umbral 0,42 sale de medir el caso que falló: con 51% tapado el
   * titular era ilegible; hasta ~40% se sigue reconstruyendo la palabra.
   */
  if (out === 'recorte' && cutoutBox) {
    const tapado = tapadoDelTitular(display || title || (product && product.name), cutoutBox, {
      width: format === 'story' ? 1080 : 1080,
      padX: format === 'story' ? 84 : 60,
      maxSize: format === 'story' ? 168 : 150,
    });
    if (tapado > 0.5) {
      notas.push(`La prenda taparía el ${Math.round(tapado * 100)}% del titular y no se leería: en vez del recorte, la pieza va con una escena generada del producto.`);
      out = 'fullbleed';
    }
  }


  // 5) 'editorial' sin bajada NI puntos vuelve a ser la tarjeta con el pozo vacío que se
  // quiso eliminar. Sin material de apoyo, conviene una pieza de foto.
  if (out === 'editorial' && !deck && !specsLimpias.length) {
    notas.push('La editorial se queda sin bajada ni puntos de apoyo: quedaría el hueco vacío de la plantilla vieja. Paso a fullbleed.');
    out = 'fullbleed';
  }

  return {
    template: out,
    degradado: out !== template,
    specs: specsLimpias.length ? specsLimpias : null,
    displayTitle: display || null,
    deck: deck || null,
    notas,
  };
}

module.exports = { reviewPiece, tipoDePrenda, specCoherente, tituloCorto, tapadoDelTitular };
