/* =========================================================================
 * GENERAR EL REFRESH TOKEN DE GOOGLE ADS (se corre UNA sola vez)
 *
 * Google Ads no acepta cuentas de servicio como las de Analytics: hay que
 * autorizar con un usuario que tenga acceso a la cuenta de anuncios. Este
 * script hace ese trámite una vez y deja las líneas listas para pegar en .env.
 *
 * POR QUÉ CAMBIÓ (ago-2026): la versión anterior usaba el flujo "OOB"
 * (redirect_uri = urn:ietf:wg:oauth:2.0:oob), donde Google mostraba el código
 * en pantalla para copiarlo a mano. Google DESACTIVÓ ese flujo: está bloqueado
 * para todo cliente OAuth creado después de febrero de 2022 — o sea, para el
 * que vas a crear ahora. Ahora se usa el flujo de loopback, que es el que
 * Google documenta para aplicaciones de escritorio: el script levanta un
 * servidor local un ratito, Google te redirige ahí con el código y lo toma
 * solo. No tenés que copiar nada.
 *
 * ANTES DE CORRERLO, en https://console.cloud.google.com:
 *   1. APIs y servicios > Biblioteca: buscá "Google Ads API" y habilitala.
 *   2. APIs y servicios > Pantalla de consentimiento OAuth: tipo "Externo",
 *      agregá tu mail como usuario de prueba y agregá el permiso
 *      https://www.googleapis.com/auth/adwords
 *   3. APIs y servicios > Credenciales > Crear credenciales > ID de cliente
 *      de OAuth > tipo "Aplicación de escritorio". Copiá el ID y el secreto.
 *      (El tipo "Aplicación de escritorio" es el que permite el loopback; si
 *      elegís "Aplicación web" vas a tener que registrar la URL a mano.)
 *
 * USO:
 *   node scripts/google-ads-token.js
 *
 * El token que sale es una credencial: va en .env y en las variables de
 * Render. No lo pegues en un chat ni lo subas al repositorio.
 * ========================================================================= */
const readline = require('readline');
const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');

const SCOPE = 'https://www.googleapis.com/auth/adwords';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));

/** Abre el navegador solo. Si no puede, el link igual queda impreso. */
function abrirNavegador(url) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start ""' : 'xdg-open';
  exec(`${cmd} "${url}"`, () => {});
}

(async () => {
  console.log('\n=== Refresh token de Google Ads ===\n');
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID || await ask('Client ID (…apps.googleusercontent.com): ');
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET || await ask('Client secret: ');
  if (!clientId || !clientSecret) { console.error('Faltan datos.'); process.exit(1); }

  const state = crypto.randomBytes(16).toString('hex');

  // Se levanta el servidor ANTES de armar la URL, porque el puerto entra en el
  // redirect_uri y tiene que ser exactamente el mismo en los dos pasos.
  const server = http.createServer();
  await new Promise((res, rej) => {
    server.on('error', rej);
    server.listen(0, '127.0.0.1', res);
  });
  const port = server.address().port;
  const redirectUri = `http://127.0.0.1:${port}`;

  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent', // fuerza el refresh_token aunque ya hayas autorizado antes
    state,
  });

  const code = await new Promise((resolve, reject) => {
    server.on('request', (req, res) => {
      const url = new URL(req.url, redirectUri);
      if (url.pathname !== '/') { res.writeHead(404); res.end(); return; }
      const err = url.searchParams.get('error');
      const got = url.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8">
        <body style="font-family:system-ui;padding:40px;background:#111;color:#eee">
        <h2>${err ? 'No se pudo autorizar' : '✔ Listo'}</h2>
        <p>${err ? `Google devolvió: ${err}` : 'Ya podés cerrar esta pestaña y volver a la terminal.'}</p>`);
      server.close();
      if (err) return reject(new Error(`Google devolvió "${err}".`));
      if (url.searchParams.get('state') !== state) return reject(new Error('El "state" no coincide: repetí el proceso.'));
      if (!got) return reject(new Error('Google no mandó ningún código.'));
      resolve(got);
    });

    console.log('\nAbriendo el navegador para que autorices con la cuenta que administra Google Ads.');
    console.log('Si no se abre solo, entrá vos a este link:\n');
    console.log(authUrl + '\n');
    console.log('Esperando la autorización...');
    abrirNavegador(authUrl);
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.refresh_token) {
    console.error('\nNo salió:', JSON.stringify(data, null, 2));
    console.error('\nSi dice invalid_grant, el código ya se usó o venció: volvé a correr el script.');
    console.error('Si dice redirect_uri_mismatch, el cliente OAuth no es de tipo "Aplicación de escritorio".');
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
})().catch((e) => { console.error('\n' + e.message); process.exit(1); });
