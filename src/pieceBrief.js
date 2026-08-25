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

  // 3) 'recorte' sin silueta es un rectángulo oscuro vacío.
  if (out === 'recorte' && !cutoutOk) {
    notas.push('El titular por detrás de la prenda no tiene silueta que lo tape: paso a fullbleed.');
    out = 'fullbleed';
  }

  // 4) TITULAR CORTO para 'recorte'.
  let display = displayTitle;
  if (out === 'recorte') {
    const corto = tituloCorto(product && product.name, title);
    if (corto && (!display || display.split(/\s+/).length > 5)) {
      if (display && display !== corto) notas.push(`Titular acortado para el diseño: "${display}" -> "${corto}".`);
      display = corto;
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

module.exports = { reviewPiece, tipoDePrenda, specCoherente, tituloCorto };
