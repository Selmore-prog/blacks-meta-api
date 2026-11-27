// Sonido del video (11 s): pulso a 120 BPM + efectos, todo sintetizado (sin música ni samples de terceros).
// Los cortes caen en el pulso: golpe de la unión 1,5 s · escena 2 2,5 s · marcas 5 s · cierre 8 s.
// node sonido.cjs → sonido.wav (48 kHz, estéreo, 24 bits)
const fs = require('fs'), path = require('path');
const SR = 48000, DUR = 11, N = SR * DUR;
const L = new Float32Array(N), R = new Float32Array(N);       // efectos (secos)
const RL = new Float32Array(N), RR = new Float32Array(N);     // envío a la reverb
const ML = new Float32Array(N), MR = new Float32Array(N);     // música (bajo, pad): se agacha con el bombo

// ---------- utilidades ----------
let seed = 20261021;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const db = d => Math.pow(10, d / 20);
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz
function put(i, v, pan, send, musica) { // pan -1..1 (potencia constante)
  if (i < 0 || i >= N) return;
  const a = (pan + 1) * Math.PI / 4, gl = Math.cos(a), gr = Math.sin(a);
  if (musica) { ML[i] += v * gl; MR[i] += v * gr; } else { L[i] += v * gl; R[i] += v * gr; }
  if (send) { RL[i] += v * gl * send; RR[i] += v * gr * send; }
}
function biquad() {
  let b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return {
    set(type, f, q) {
      f = Math.min(Math.max(f, 20), SR * .45);
      const w = 2 * Math.PI * f / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
      let B0, B1, B2;
      if (type === 'lp') { B0 = (1 - c) / 2; B1 = 1 - c; B2 = (1 - c) / 2; }
      else if (type === 'hp') { B0 = (1 + c) / 2; B1 = -(1 + c); B2 = (1 + c) / 2; }
      else { B0 = al; B1 = 0; B2 = -al; }
      const A0 = 1 + al, A1 = -2 * c, A2 = 1 - al;
      b0 = B0 / A0; b1 = B1 / A0; b2 = B2 / A0; a1 = A1 / A0; a2 = A2 / A0;
    },
    run(x) { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; }
  };
}

// ---------- batería ----------
const KICKS = [];
function kick(t, g = -9) {
  KICKS.push(t);
  const i0 = Math.round(t * SR), hp = biquad(); hp.set('hp', 3000, .7); let ph = 0;
  for (let k = 0; k < SR * .42; k++) {
    const s = k / SR, f = 46 + 110 * Math.exp(-s / .032);
    ph += 2 * Math.PI * f / SR;
    const env = Math.min(1, s / .0015) * Math.exp(-s / .2);
    const click = hp.run(rnd() * 2 - 1) * Math.exp(-s / .003) * .35;
    put(i0 + k, (Math.tanh(Math.sin(ph) * 1.6) * env + click) * db(g), 0, 0);
  }
}
function hat(t, g = -27, pan = .15, dec = .03) {
  const i0 = Math.round(t * SR), hp = biquad(), bp = biquad(); hp.set('hp', 7500, .7); bp.set('bp', 10000, .9);
  for (let k = 0; k < SR * dec * 5; k++) {
    const s = k / SR, n = rnd() * 2 - 1;
    put(i0 + k, (hp.run(n) * .7 + bp.run(n) * .6) * Math.exp(-s / dec) * Math.min(1, s / .0005) * db(g), pan, .05);
  }
}
function clap(t, g = -21) {
  const i0 = Math.round(t * SR), bp = biquad(); bp.set('bp', 1400, 1.1);
  for (let k = 0; k < SR * .3; k++) {
    const s = k / SR;
    let env = 0; for (const d of [0, .011, .022]) if (s >= d) env = Math.max(env, Math.exp(-(s - d) / (d === .022 ? .09 : .006)));
    put(i0 + k, bp.run(rnd() * 2 - 1) * env * 2.2 * db(g), (rnd() - .5) * .2, .35);
  }
}

// ---------- música ----------
function bass(t, dur, f, g = -16, caida = 0) { // caida: la nota se apaga sola (s), en vez de sostenerse
  const i0 = Math.round(t * SR); let ph = 0;
  for (let k = 0; k < SR * (dur + .08); k++) {
    const s = k / SR, env = Math.min(1, s / .006) * (s < dur ? 1 : Math.max(0, 1 - (s - dur) / .08)) * (.75 + .25 * Math.exp(-s / .08)) * (caida ? Math.exp(-s / caida) : 1);
    ph += 2 * Math.PI * f / SR;
    const v = Math.tanh((Math.sin(ph) + .35 * Math.sin(2 * ph) + .12 * Math.sin(3 * ph)) * 1.3);
    put(i0 + k, v * env * db(g), 0, 0, true);
  }
}
function pad(t0, t1, notas, g = -31, ataque = .5, cola = .7) {
  const i0 = Math.round(t0 * SR), n = Math.round((t1 - t0 + cola) * SR);
  const voces = []; notas.forEach((m, j) => [-7, 0, 7].forEach(c => voces.push({ f: NOTE(m) * Math.pow(2, c / 1200), ph: rnd(), pan: ((j / Math.max(1, notas.length - 1)) - .5) * .8 + c / 40 })));
  const lpL = biquad(), lpR = biquad(); let fc = 0;
  for (let k = 0; k < n; k++) {
    const s = k / SR, len = t1 - t0;
    const env = Math.min(1, s / ataque) * (s < len ? 1 : Math.max(0, 1 - (s - len) / cola));
    if (k % 64 === 0) { fc = 700 + 900 * Math.min(1, s / 1.6); lpL.set('lp', fc, .6); lpR.set('lp', fc * 1.04, .6); }
    let vl = 0, vr = 0;
    for (const v of voces) { v.ph += v.f / SR; if (v.ph >= 1) v.ph -= 1; const saw = 2 * v.ph - 1, a = (v.pan + 1) * Math.PI / 4; vl += saw * Math.cos(a); vr += saw * Math.sin(a); }
    const i = i0 + k; if (i >= N) break;
    const gg = env * db(g) / Math.sqrt(voces.length);
    const l = lpL.run(vl) * gg, r = lpR.run(vr) * gg;
    ML[i] += l; MR[i] += r; RL[i] += l * .35; RR[i] += r * .35;
  }
}

// ---------- efectos ----------
function modal(t, modos, ruidoA, ruidoD, g, pan, send, largo = .05) {
  const i0 = Math.round(t * SR), hp = biquad(); hp.set('hp', 2500, .7);
  for (let k = 0; k < SR * largo; k++) {
    const s = k / SR, ataque = Math.min(1, s / .0003);
    let v = hp.run(rnd() * 2 - 1) * ruidoA * Math.exp(-s / ruidoD);
    for (const [f, d, a] of modos) v += Math.sin(2 * Math.PI * f * s) * a * Math.exp(-s / d);
    put(i0 + k, v * ataque * db(g), pan, send);
  }
}
// "clink" metálico corto (herramienta): parciales inarmónicos
function clink(t, f = 1750, g = -20, pan = 0, send = .25) {
  modal(t, [[f, .07, 1], [f * 2.76, .035, .55], [f * 5.4, .016, .3], [f * 1.51, .05, .35]], .6, .0015, g, pan, send, .35);
}
function pop(t, f, g = -15, pan = 0, send = .2) {
  const i0 = Math.round(t * SR); let ph = 0, ph2 = 0;
  for (let k = 0; k < SR * .22; k++) {
    const s = k / SR, fr = f * (.72 + .28 * Math.min(1, s / .028));
    ph += 2 * Math.PI * fr / SR; ph2 += 2 * Math.PI * fr * 2 / SR;
    put(i0 + k, (Math.sin(ph) + Math.sin(ph2) * .18) * Math.min(1, s / .002) * Math.exp(-s / .065) * db(g), pan, send);
  }
}
function tick(t, f, g = -20, pan = 0) {
  const i0 = Math.round(t * SR);
  for (let k = 0; k < SR * .09; k++) {
    const s = k / SR, env = Math.min(1, s / .0008) * Math.exp(-s / .018);
    put(i0 + k, (Math.sin(2 * Math.PI * f * s) + Math.sin(2 * Math.PI * f * 2.01 * s) * .25) * env * db(g), pan, .3);
  }
}
function bell(t, f, g = -14, dec = .9, pan = 0, send = .55) {
  const i0 = Math.round(t * SR);
  const P = [[1, 1, 1], [2, .42, .55], [3.01, .2, .38], [4.18, .11, .25], [5.43, .06, .18]];
  for (let k = 0; k < SR * dec * 4; k++) {
    const s = k / SR; let v = 0;
    for (const [m, a, d] of P) v += Math.sin(2 * Math.PI * f * m * s) * a * Math.exp(-s / (dec * d));
    put(i0 + k, v * Math.min(1, s / .003) * db(g) * .55, pan, send);
  }
}
function shimmer(t, dur, g = -24, f0 = 3000, f1 = 9000, pan0 = -.6, pan1 = .6) {
  const n = Math.round(dur * 70);
  for (let j = 0; j < n; j++) {
    const u = rnd(), tt = t + u * dur, f = f0 + rnd() * (f1 - f0), pan = pan0 + (pan1 - pan0) * u + (rnd() - .5) * .3;
    const i0 = Math.round(tt * SR), fade = Math.sin(u * Math.PI);
    for (let k = 0; k < SR * .05; k++) {
      const s = k / SR, env = Math.min(1, s / .002) * Math.exp(-s / .012);
      put(i0 + k, Math.sin(2 * Math.PI * f * s) * env * db(g) * (.3 + .7 * fade), pan, .7);
    }
  }
}
function whoosh(t, dur, g = -16, f0 = 400, f1 = 3000, pico = .55, pan0 = -.4, pan1 = .4, q = .9) {
  const i0 = Math.round(t * SR), n = Math.round(dur * SR), bp = biquad(), lp = biquad();
  let pink = 0;
  for (let k = 0; k < n; k++) {
    const p = k / n;
    if (k % 32 === 0) { const f = f0 * Math.pow(f1 / f0, p); bp.set('bp', f, q); lp.set('lp', f * 2.2, .7); }
    pink = pink * .86 + (rnd() * 2 - 1) * .14;
    const env = p < pico ? Math.pow(Math.sin(p / pico * Math.PI / 2), 2.2) : Math.pow(Math.cos((p - pico) / (1 - pico) * Math.PI / 2), 1.6);
    put(i0 + k, lp.run(bp.run(pink * 6)) * env * db(g), pan0 + (pan1 - pan0) * p, .4);
  }
}
// ruido que crece y se corta en seco justo en el golpe (platillo al revés)
function swell(tFin, dur, g = -20) {
  const i0 = Math.round((tFin - dur) * SR), n = Math.round(dur * SR), bp = biquad(), hp = biquad(); hp.set('hp', 900, .7);
  for (let k = 0; k < n; k++) {
    const p = k / n;
    if (k % 32 === 0) bp.set('bp', 1500 * Math.pow(6, p), .7);
    const v = hp.run(bp.run(rnd() * 2 - 1)) * Math.pow(p, 3.2) * (p > .985 ? (1 - p) / .015 : 1);
    put(i0 + k, v * 3 * db(g), (rnd() - .5) * .5, .3);
  }
}
function riser(t, dur, f0, f1, g = -30) {
  const i0 = Math.round(t * SR), n = Math.round(dur * SR); let ph = 0;
  for (let k = 0; k < n; k++) {
    const p = k / n, f = f0 * Math.pow(f1 / f0, p * p) * (1 + .006 * Math.sin(2 * Math.PI * 5.5 * k / SR));
    ph += 2 * Math.PI * f / SR;
    put(i0 + k, (Math.sin(ph) + .3 * Math.sin(2 * ph)) * Math.pow(p, 2) * (p > .98 ? (1 - p) / .02 : 1) * db(g), 0, .5);
  }
}
// golpe grande: sub que cae + ruido + campana metálica
function impacto(t, g = -8) {
  const i0 = Math.round(t * SR), lp = biquad(); lp.set('lp', 2200, .7); let ph = 0;
  for (let k = 0; k < SR * 1.6; k++) {
    const s = k / SR, f = 36 + 95 * Math.exp(-s / .07);
    ph += 2 * Math.PI * f / SR;
    const sub = Math.tanh(Math.sin(ph) * 1.8) * Math.min(1, s / .002) * Math.exp(-s / .5);
    const ruido = lp.run(rnd() * 2 - 1) * Math.exp(-s / .09) * .55;
    put(i0 + k, (sub + ruido) * db(g), 0, .25);
  }
  modal(t, [[523, .5, .6], [1290, .32, .45], [2205, .2, .35], [3470, .12, .25], [4630, .07, .15]], .3, .002, g - 15, 0, .7, 1.6);
}
function thump(t, g = -14) {
  const i0 = Math.round(t * SR); let ph = 0;
  for (let k = 0; k < SR * .35; k++) {
    const s = k / SR, f = 62 + 70 * Math.exp(-s / .03);
    ph += 2 * Math.PI * f / SR;
    put(i0 + k, (Math.sin(ph) + Math.sin(2 * ph) * .35) * Math.min(1, s / .004) * Math.exp(-s / .11) * db(g), 0, .15);
  }
}

// ---------- partitura (mismos tiempos que comp.html) ----------
const E1 = NOTE(40), B1 = NOTE(47), A1 = NOTE(45), CS2 = NOTE(49), E2 = NOTE(52);
const E5 = NOTE(76), GS5 = NOTE(80), B5 = NOTE(83), CS6 = NOTE(85), E6 = NOTE(88), GS6 = NOTE(92), B6 = NOTE(95);

// Escena 1: la unión
riser(.0, 1.5, 180, 720, -33);
whoosh(.08, .95, -30, 500, 2200, .6, -.5, -.2, .7);      // trazo de arriba de la B
whoosh(.22, .9, -31, 380, 1700, .6, -.7, -.3, .7);        // trazo de abajo
whoosh(.30, .55, -19, 2800, 520, .35, .8, .1, .9);        // entra el iso de Lüsqtoff desde la derecha
clink(.56, 1760, -24, .2);                                // se planta
pop(.18, E5, -22);                                        // pastilla NUEVA MARCA
tick(.72, B6, -23, -.05); tick(.82, NOTE(97), -24, .05);  // la ×
swell(1.5, .55, -17);                                     // se separan y se tiran uno contra otro
impacto(1.5, -7);
bell(1.5, E5, -27, .9, 0, .7);

// Pulso: bombo en cada tiempo, palmas en 2 y 4, bajo a contratiempo
for (let k = 0; k <= 12; k++) kick(1.5 + k * .5, k === 0 ? -10 : -13);      // 1,5 → 7,5
for (let k = 0; k < 12; k++) hat(1.75 + k * .5, k < 2 ? -32 : -28, .2);
for (let k = 0; k < 12; k++) if (k >= 4) hat(1.5 + k * .5 + .375, -35, -.25, .02); // fantasmas
for (let k = 0; k < 6; k++) clap(2.0 + k * 1.0, -24);
const acorde = t => t < 3.5 ? E2 : t < 5.5 ? CS2 : t < 7.5 ? A1 * 2 : B1 * 2;
for (let k = 0; k < 12; k++) { const t = 1.75 + k * .5; bass(t, .18, acorde(t), -19); bass(t, .18, acorde(t) / 2, -23); }
pad(1.55, 3.5, [64, 68, 71, 75, 78], -36, .9);   // E maj9
pad(3.5, 5.5, [61, 64, 68, 71], -36, .25);       // C#m7
pad(5.5, 7.5, [57, 61, 64, 68, 71], -36, .25);   // A maj9
pad(7.5, 8.0, [59, 63, 66, 69], -35, .1, .15);   // B7, tensión antes del cierre

// Escena 2: Bienvenida
whoosh(2.24, .8, -20, 2400, 380, .45, .5, -.5, .8);       // el iso viaja a la izquierda
whoosh(2.6, .55, -29, 700, 3200, .5, -.3, .3);            // sube "Bienvenida"
[E5, GS5, B5, CS6, E6, GS6, B6, NOTE(97)].forEach((f, i) => tick(2.74 + i * .04 + .02, f, -27 + i * .3, -.4 + i * .1)); // letras
shimmer(3.12, .6, -31, 2500, 8000, -.5, .5);              // subrayado naranja

// Escena 3: marcas
whoosh(4.66, .7, -22, 3000, 420, .3, -.2, .2, .8);        // se van los textos, el logo viaja a la tarjeta
thump(5.0, -20);
shimmer(5.12, .6, -32, 3000, 9000, -.6, .6);              // se dibuja el borde naranja
[E5, GS5, B5, E6].forEach((f, i) => pop(5.375 + i * .125 + .03, f, -21, (i % 2 ? .35 : -.35))); // tarjetas
pop(5.97, B5 * 2, -17); bell(5.98, E6, -28, .5, .2, .5); // NUEVA
shimmer(6.3, .8, -29, 4000, 11000, -.8, .8);              // brillo que cruza

// Escena 4: cierre
whoosh(7.62, .45, -24, 600, 4200, .85, -.3, .3);          // corte
riser(7.5, .5, 300, 900, -32);
impacto(8.0, -12);
kick(8.0, -11); kick(9.0, -17); kick(10.0, -19);
hat(8.5, -32); hat(9.5, -33);
pad(8.0, 10.6, [52, 64, 68, 71, 75, 78], -34, .05, .4); // E maj9 abierto
bass(8.0, 2.6, E1, -18, .8); bass(8.0, 2.6, E2, -24, .8);
whoosh(7.86, .65, -24, 2000, 500, .5, -.1, .2);           // el logo baja al pie
pop(8.66, E5, -15); tick(8.75, E6, -22, .15);             // botón de WhatsApp
thump(8.6, -22);                                          // pie
tick(8.7, B6, -27, -.1); tick(8.8, NOTE(97), -28, .1);    // ×
bell(8.7, E5, -26, .7, -.1, .5); bell(8.72, B5, -27, .7, .1, .5); bell(8.74, GS5, -28, .7, 0, .5);
pop(9.36, B5, -30, 0, .4); pop(10.26, B5, -31, 0, .4);   // pulsos del botón

// ---------- sidechain: la música se agacha con cada bombo ----------
for (let n = 0; n < N; n++) {
  const t = n / SR; let duck = 1;
  for (const tk of KICKS) { const d = t - tk; if (d >= 0 && d < .4) duck = Math.min(duck, 1 - .55 * Math.exp(-d / .09)); }
  L[n] += ML[n] * duck; R[n] += MR[n] * duck;
}

// ---------- reverb (Freeverb simplificada) ----------
function reverb(inp, spread) {
  const k = SR / 44100, out = new Float32Array(N);
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map(d => ({ b: new Float32Array(Math.round((d + spread) * k)), i: 0, f: 0 }));
  const alls = [556, 441, 341, 225].map(d => ({ b: new Float32Array(Math.round((d + spread) * k)), i: 0 }));
  const fb = .78, damp = .35;
  for (let n = 0; n < N; n++) {
    const x = inp[n] * .03; let y = 0;
    for (const c of combs) { const o = c.b[c.i]; c.f = o * (1 - damp) + c.f * damp; c.b[c.i] = x + c.f * fb; if (++c.i >= c.b.length) c.i = 0; y += o; }
    for (const a of alls) { const o = a.b[a.i]; const v = -y + o; a.b[a.i] = y + o * .5; if (++a.i >= a.b.length) a.i = 0; y = v; }
    out[n] = y;
  }
  return out;
}
const wl = reverb(RL, 0), wr = reverb(RR, 23);
const WET = 2.2;
const hpL = biquad(), hpR = biquad(); hpL.set('hp', 30, .7); hpR.set('hp', 30, .7);
const XL = new Float32Array(N), XR = new Float32Array(N);
for (let n = 0; n < N; n++) { XL[n] = hpL.run(L[n] + wl[n] * WET); XR[n] = hpR.run(R[n] + wr[n] * WET); }
// ganancia fija + limitador con anticipación de 1,5 ms
const gan = db(Number(process.env.GAN || 6)), techo = db(-1.2);
const look = Math.round(.0015 * SR), rel = Math.exp(-1 / (.08 * SR));
const gl = new Float32Array(N);
{
  const need = new Float32Array(N);
  for (let n = 0; n < N; n++) { const p = Math.max(Math.abs(XL[n]), Math.abs(XR[n])) * gan; need[n] = p > techo ? techo / p : 1; }
  let g = 1;
  for (let n = 0; n < N; n++) {
    let m = 1; for (let k = 0; k < look && n + k < N; k++) m = Math.min(m, need[n + k]);
    g = m < g ? m : m + (g - m) * rel; gl[n] = g;
  }
}
// los últimos 120 ms bajan a cero: el video vuelve a empezar sin un clic
const colaN = Math.round(.12 * SR);
const buf = Buffer.alloc(44 + N * 6);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 6, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 6, 28); buf.writeUInt16LE(6, 32); buf.writeUInt16LE(24, 34); buf.write('data', 36); buf.writeUInt32LE(N * 6, 40);
let o = 44;
for (let n = 0; n < N; n++) {
  const f = n > N - colaN ? (N - n) / colaN : 1;
  for (const ch of [XL, XR]) {
    const v = Math.max(-1, Math.min(1, ch[n] * gan * gl[n])) * f;
    buf.writeIntLE(Math.max(-8388608, Math.min(8388607, Math.round(v * 8388607))), o, 3); o += 3;
  }
}
const out = path.join(__dirname, 'sonido.wav');
fs.writeFileSync(out, buf);
let red = 1; for (let n = 0; n < N; n++) red = Math.min(red, gl[n]);
console.log('sonido.wav listo · limitador máx', (20 * Math.log10(red)).toFixed(1), 'dB');
{ const zonas = {}; for (let n = 0; n < N; n++) if (gl[n] < db(-1.5)) { const k = (n / SR).toFixed(1); zonas[k] = Math.min(zonas[k] || 0, 20 * Math.log10(gl[n])); }
  console.log('limitador > 1,5 dB en:', Object.entries(zonas).map(([k, v]) => k + 's ' + v.toFixed(1)).join(' · ') || 'ningún lado'); }
