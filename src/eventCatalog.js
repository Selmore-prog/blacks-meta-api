/* =========================================================================
 * QUÉ SIGNIFICA CADA EVENTO QUE MIDE LA TIENDA
 *
 * Un informe con nombres como "view_b2b_landing" no se puede leer sin un
 * diccionario al lado. Acá vive ese diccionario, en un solo lugar, para que el
 * panel muestre siempre la misma explicación que usa el análisis.
 *
 * `propio: true`  → lo dispara nuestro código (snipplets/analytics-events.tpl).
 * `propio: false` → lo pone Google o Tiendanube solo; lo listamos igual porque
 *                   forma parte de la lectura del embudo.
 * ========================================================================= */

const EVENT_CATALOG = [
  {
    event: 'view_b2b_landing', propio: true, grupo: 'mayorista',
    label: 'Vieron la propuesta mayorista',
    significa: 'El bloque mayorista (descuentos, mínimo, personalización) entró en pantalla y estuvo visible.',
    donde: 'Sección /mayorista.',
    paraQue: 'Distingue a quien REALMENTE vio la oferta de quien abrió la página y se fue antes de llegar. Es el primer escalón del embudo.',
  },
  {
    event: 'b2b_info_open', propio: true, grupo: 'mayorista',
    label: 'Abrieron trabajos o preguntas frecuentes',
    significa: 'Tocaron uno de los dos botones de la landing: "Trabajos y números" o "Preguntas frecuentes".',
    donde: 'Sección /mayorista.',
    paraQue: 'Es interés real, no scroll de paso. Si mucha gente abre las preguntas frecuentes, algo no se está explicando bien antes.',
  },
  {
    event: 'scroll_to_products', propio: true, grupo: 'mayorista',
    label: 'Pasaron al catálogo mayorista',
    significa: 'Tocaron "Ver productos mayoristas" para saltar de la propuesta a la grilla.',
    donde: 'Sección /mayorista.',
    paraQue: 'Mide si la propuesta convence lo suficiente como para ir a mirar productos.',
  },
  {
    event: 'whatsapp_modal_open', propio: true, grupo: 'contacto',
    label: 'Abrieron el botón flotante de WhatsApp',
    significa: 'Tocaron el globo verde y se abrió el cartel que pregunta si es consulta minorista o mayorista.',
    donde: 'Todo el sitio.',
    paraQue: 'El paso previo a la consulta. Si muchos abren y pocos eligen, el problema es ese cartel y no el tráfico.',
  },
  {
    event: 'generate_lead', propio: true, grupo: 'contacto', destacado: true,
    label: 'Dejaron una consulta',
    significa: 'Tocaron un botón de WhatsApp o mandaron el formulario de contacto. Viene con el tipo (mayorista o minorista), de qué botón salió y en qué página estaban.',
    donde: 'Todo el sitio: botón flotante, landing mayorista, fichas de producto, menú y formulario.',
    paraQue: 'ES LA MÉTRICA DEL NEGOCIO. Todo lo demás existe para explicar por qué este número sube o baja.',
    ojo: 'Cuenta el clic, no la conversación: si abre WhatsApp y no escribe, igual suma.',
  },
  {
    event: 'click_cotizador', propio: true, grupo: 'contacto',
    label: 'Entraron al auto-cotizador',
    significa: 'Tocaron el link a la herramienta de cotización online.',
    donde: 'Landing mayorista y fichas de producto.',
    paraQue: 'Intención alta sin hablar con nadie. Antes era invisible: el cotizador vive en otro dominio y se perdía del informe.',
  },
  {
    event: 'phone_click', propio: true, grupo: 'contacto',
    label: 'Tocaron el teléfono',
    significa: 'Hicieron clic en un número de teléfono para llamar.',
    donde: 'Todo el sitio.',
    paraQue: 'Canal que no aparecía en ningún informe. En mobile, llamar es un camino real.',
  },
  {
    event: 'email_click', propio: true, grupo: 'contacto',
    label: 'Tocaron el mail',
    significa: 'Hicieron clic en una dirección de correo.',
    donde: 'Todo el sitio.',
    paraQue: 'Igual que el teléfono: existía y no se medía.',
  },
  {
    event: 'click', propio: false, grupo: 'contacto',
    label: 'Clic a un link externo (lo mide Google solo)',
    significa: 'Google anota cualquier clic que se va del sitio. Filtrando por el número de WhatsApp se puede separar mayorista de minorista.',
    donde: 'Todo el sitio.',
    paraQue: 'Es el método VIEJO, el que se usó para todo el análisis histórico. Se sigue usando para poder comparar contra meses anteriores a la medición nueva.',
  },
  {
    event: 'form_start', propio: false, grupo: 'contacto',
    label: 'Empezaron a completar un formulario',
    significa: 'Escribieron en el primer campo de un formulario.',
    donde: 'Página de contacto, principalmente.',
    paraQue: 'Comparado con form_submit muestra cuánta gente abandona. En julio: 3.395 lo empezaron y 164 lo mandaron.',
  },
  {
    event: 'form_submit', propio: false, grupo: 'contacto',
    label: 'Mandaron el formulario',
    significa: 'El formulario se envió.',
    donde: 'Página de contacto.',
    paraQue: 'El cierre del canal formulario.',
  },
  {
    event: 'view_item', propio: false, grupo: 'catálogo',
    label: 'Vieron una ficha de producto',
    significa: 'Lo manda Tiendanube al abrir un producto.',
    donde: 'Fichas de producto.',
    paraQue: 'Mide profundidad: cuántos pasan de la grilla a mirar un producto.',
  },
  {
    event: 'view_item_list', propio: false, grupo: 'catálogo',
    label: 'Vieron una grilla de productos',
    significa: 'Lo manda Tiendanube al mostrar un listado.',
    donde: 'Categorías y buscador.',
    paraQue: 'El paso anterior a mirar una ficha.',
  },
  {
    event: 'add_to_cart', propio: false, grupo: 'venta',
    label: 'Agregaron al carrito',
    significa: 'Evento de Tiendanube. Sólo aplica a productos minoristas (los mayoristas no tienen carrito).',
    donde: 'Grillas y fichas minoristas.',
    paraQue: 'Control: sirve para ver si una caída es sólo de mayorista o de toda la tienda.',
  },
  {
    event: 'purchase', propio: false, grupo: 'venta',
    label: 'Compraron',
    significa: 'Compra minorista terminada.',
    donde: 'Checkout.',
    paraQue: 'La otra mitad del negocio. Una caída mayorista con las ventas minoristas firmes apunta a un problema mayorista y no general.',
  },
];

// Los que dispara nuestro código: son los que tienen que empezar a aparecer
// después de publicar el tema con la medición nueva.
const OWN_EVENTS = EVENT_CATALOG.filter((e) => e.propio).map((e) => e.event);

// Parámetros que viajan dentro de generate_lead / b2b_info_open. Para poder
// filtrar por ellos en los informes hay que declararlos a mano en GA4
// (Administrar > Definiciones personalizadas), con ámbito EVENTO.
const CUSTOM_DIMENSIONS = [
  { param: 'lead_type', label: 'Tipo de consulta', valores: 'mayorista · minorista' },
  { param: 'contact_channel', label: 'De qué botón salió', valores: 'whatsapp_flotante · whatsapp_mayorista_landing · whatsapp_producto · whatsapp_menu · whatsapp_footer · formulario · telefono · email' },
  { param: 'page_type', label: 'Tipo de página', valores: 'mayorista · producto · categoria · home · contacto' },
  { param: 'info_type', label: 'Qué info abrieron', valores: 'trabajos_realizados · preguntas_frecuentes' },
];

function catalogFor(eventName) {
  return EVENT_CATALOG.find((e) => e.event === eventName) || null;
}

module.exports = { EVENT_CATALOG, OWN_EVENTS, CUSTOM_DIMENSIONS, catalogFor };
