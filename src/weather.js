/* Pronóstico de CABA para decisiones editoriales. Datos de MET Norway,
 * licencia CC BY 4.0; min/max diarios calculados desde su serie de intervalos. */
const URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=-34.6037&lon=-58.3816';
const USER_AGENT = 'BlacksContentEngine/1.0 https://blacksindumentaria.com.ar';
const MIN_TTL_MS = 3 * 60 * 60 * 1000;
const dayInCaba = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
});
let cached = null;
let expires = 0;
let lastModified = null;

function parseForecast(data) {
  const byDate = new Map();
  for (const point of data?.properties?.timeseries || []) {
    const time = new Date(point.time);
    if (Number.isNaN(time.getTime())) continue;
    const date = dayInCaba.format(time);
    const temperature = Number(point.data?.instant?.details?.air_temperature);
    if (!Number.isFinite(temperature)) continue;
    const rain = point.data?.next_6_hours?.details?.precipitation_amount;
    const old = byDate.get(date) || { date, max: -Infinity, min: Infinity, rainMm: null };
    old.max = Math.max(old.max, temperature);
    old.min = Math.min(old.min, temperature);
    if (rain != null && Number.isFinite(Number(rain))) old.rainMm = Math.max(old.rainMm || 0, Number(rain));
    byDate.set(date, old);
  }
  return [...byDate.values()].map((d) => ({
    date: d.date, max: Math.round(d.max * 10) / 10, min: Math.round(d.min * 10) / 10,
    rainMm: d.rainMm,
  }));
}

async function getForecast() {
  if (cached && Date.now() < expires) return cached;
  try {
    const headers = { 'User-Agent': USER_AGENT };
    if (lastModified) headers['If-Modified-Since'] = lastModified;
    const response = await fetch(URL, { headers, signal: AbortSignal.timeout(7000) });
    if (response.status === 304 && cached) {
      expires = Math.max(Date.now() + MIN_TTL_MS, Date.parse(response.headers.get('expires')) || 0);
      return cached;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const days = parseForecast(data);
    if (!days.length) throw new Error('sin datos de temperatura');
    cached = { place: 'CABA', source: 'MET Norway', days, fetchedAt: new Date().toISOString() };
    lastModified = response.headers.get('last-modified');
    expires = Math.max(Date.now() + MIN_TTL_MS, Date.parse(response.headers.get('expires')) || 0);
    return cached;
  } catch (err) {
    console.warn(`[weather] Pronóstico no disponible: ${err.message}`);
    // Un fallo externo no impide planificar. Una respuesta vieja no se hace pasar por actual.
    cached = { place: 'CABA', source: 'MET Norway', days: [], fetchedAt: null };
    expires = Date.now() + 15 * 60 * 1000;
    return cached;
  }
}

function weatherForDate(forecast, date) {
  return (forecast?.days || []).find((day) => day.date === String(date).slice(0, 10)) || null;
}

function weatherBand(day) {
  if (!day) return null;
  if (day.max >= 24) return 'calor';
  if (day.max <= 15) return 'frio';
  if (day.rainMm >= 2) return 'lluvia';
  return 'templado';
}

module.exports = { getForecast, weatherForDate, weatherBand, parseForecast };
