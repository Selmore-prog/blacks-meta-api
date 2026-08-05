/* =========================================================================
 * GENERAR EL REFRESH TOKEN DE GOOGLE ADS (se corre UNA sola vez)
 *
 * Google Ads no acepta cuentas de servicio como las de Analytics: hay que
 * autorizar con un usuario que tenga acceso a la cuenta de anuncios. Este script
 * hace ese trámite una vez y te deja la línea lista para pegar en .env.
 *
 * ANTES DE CORRERLO, en https://console.cloud.google.com (proyecto durable-pipe-396712):
 *   1. APIs y servicios > Pantalla de consentimiento OAuth: tipo "Externo",
 *      agregá tu mail como usuario de prueba y agregá el permiso
 *      https://www.googleapis.com/auth/adwords
 *   2. APIs y servicios > Credenciales > Crear credenciales > ID de cliente
 *      de OAuth > tipo "Aplicación de escritorio". Copiá el ID y el secreto.
 *
 * USO:
 *   node scripts/google-ads-token.js
 *   (te pide el client id y el secret, abrís el link, autorizás y pegás el código)
 *
 * El token que sale es una credencial: va en .env y en las variables de Render.
 * No lo pegues en un chat ni lo subas al repositorio.
 * ========================================================================= */
const readline = require('readline');

const REDIRECT = 'urn:ietf:wg:oauth:2.0:oob'; // flujo manual: Google muestra el código en pantalla
const SCOPE = 'https://www.googleapis.com/auth/adwords';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));

(async () => {
  console.log('\n=== Refresh token de Google Ads ===\n');
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID || await ask('Client ID (…apps.googleusercontent.com): ');
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET || await ask('Client secret: ');
  if (!clientId || !clientSecret) { console.error('Faltan datos.'); process.exit(1); }

  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent', // fuerza que Google devuelva refresh_token aunque ya hayas autorizado antes
  });

  console.log('\n1) Abrí este link en el navegador, con la cuenta que administra Google Ads:\n');
  console.log(authUrl);
  console.log('\n2) Autorizá y copiá el código que te muestra.\n');
  const code = await ask('Pegá el código acá: ');
  if (!code) { console.error('Sin código no puedo seguir.'); process.exit(1); }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: REDIRECT, grant_type: 'authorization_code',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.refresh_token) {
    console.error('\nNo salió:', JSON.stringify(data, null, 2));
    console.error('\nSi dice invalid_grant, el código ya se usó o venció: repetí desde el paso 1.');
    process.exit(1);
  }

  console.log('\n✔ Listo. Agregá estas líneas a .env (y a las variables de entorno de Render):\n');
  console.log(`GOOGLE_ADS_CLIENT_ID=${clientId}`);
  console.log('GOOGLE_ADS_CLIENT_SECRET=(el secret que usaste recién)');
  console.log(`GOOGLE_ADS_REFRESH_TOKEN=${data.refresh_token}`);
  console.log('GOOGLE_ADS_DEVELOPER_TOKEN=(el del API Center de la cuenta administradora)');
  console.log('GOOGLE_ADS_CUSTOMER_ID=(los 10 dígitos de la cuenta, sin guiones)');
  console.log('GOOGLE_ADS_LOGIN_CUSTOMER_ID=(sólo si la manejás desde una cuenta administradora)\n');
  rl.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
