// Texturas de las personas, dibujadas por código:
//  · rostro: 8 expresiones (neutral, sonrisa, concentrado, decidido, ojos cerrados, hablando,
//    sorpresa, cansado) en un atlas de 4×2. Una textura de color (ojos, boca) y otra de máscaras
//    (R sombreado de la piel, G cejas, B labios) que el shader tiñe con la piel y el pelo de cada uno.
//  · tela: R tejido fino, G sarga de mezclilla, B arrugas suaves.
//  · pelo: mechones.
import * as THREE from 'three';
import { filaCabeza, ROSTRO } from './modelo.js';

const C = 256;   // lado de cada celda del atlas

export const EXPRESION = { neutral: 0, sonrisa: 1, concentrado: 2, decidido: 3, cerrados: 4, hablando: 5, sorpresa: 6, cansado: 7 };
const EXPRESIONES = [
  { ojo: 1, cejaY: 0, cejaInt: 0, boca: 'cerrada', comisuras: 0 },
  { ojo: 0.8, cejaY: 0.0008, cejaInt: 0.0004, boca: 'sonrisa', comisuras: 0.0046, mejillas: true },
  { ojo: 0.86, cejaY: -0.0011, cejaInt: -0.0024, boca: 'apretada', comisuras: -0.0005 },
  { ojo: 0.92, cejaY: -0.0014, cejaInt: -0.0032, boca: 'firme', comisuras: -0.0012 },
  { ojo: 0, cejaY: 0, cejaInt: 0, boca: 'cerrada', comisuras: 0 },
  { ojo: 1, cejaY: 0.001, cejaInt: 0.0008, boca: 'abierta', comisuras: 0.001 },
  { ojo: 1.28, cejaY: 0.0036, cejaInt: 0.0022, boca: 'o', comisuras: 0 },
  { ojo: 0.5, cejaY: -0.0004, cejaInt: 0.0014, boca: 'cerrada', comisuras: -0.0026 },
];

function lienzo(w, h, fondo) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (fondo) { ctx.fillStyle = fondo; ctx.fillRect(0, 0, w, h); }
  return { c, ctx };
}

// (x, y) del rostro en metros → píxel de la celda (u = 0.5 + θ/2.4, v = (y − 1.48)/0.2235)
function mapeo(celda) {
  const ox = (celda % 4) * C, oy = Math.floor(celda / 4) * C;
  return (x, y) => {
    const rx = filaCabeza(y)[0];
    const t = Math.asin(Math.max(-1, Math.min(1, x / rx)));
    return [ox + (0.5 + t / ROSTRO.divU) * C, oy + (1 - (y - ROSTRO.y0) / ROSTRO.alto) * C];
  };
}
const escalaY = C / ROSTRO.alto;               // px por metro en vertical
const escalaX = C / (0.075 * ROSTRO.divU);     // px por metro en horizontal (cerca del centro)

function curva(ctx, P, puntos, continuar = false) {
  // puntos: [[x,y], ...] por los que pasa la curva (Catmull-Rom → Bézier); continuar: sigue el trazo
  const q = puntos.map(([x, y]) => P(x, y));
  if (continuar) ctx.lineTo(q[0][0], q[0][1]); else ctx.moveTo(q[0][0], q[0][1]);
  for (let i = 0; i < q.length - 1; i++) {
    const p0 = q[Math.max(0, i - 1)], p1 = q[i], p2 = q[i + 1], p3 = q[Math.min(q.length - 1, i + 2)];
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
}
function mancha(ctx, x, y, rx, ry, valor, alfa = 1, color = null) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(rx, ry);
  const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  const c = color || `rgba(${valor},${valor},${valor},`;
  gr.addColorStop(0, `${c}${alfa})`); gr.addColorStop(1, `${c}0)`);
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function dibujarCara(L, celda) {
  const ex = EXPRESIONES[celda];
  const P = mapeo(celda);
  const { color, sombra, cejas, labios } = L;
  // ---------- sombreado de la piel (R)
  const s = sombra;
  s.save();
  s.globalCompositeOperation = 'multiply';
  for (const lado of [1, -1]) {
    const [ex0, ey0] = P(lado * 0.031, 1.6005);
    mancha(s, ex0, ey0, 0.024 * escalaX, 0.016 * escalaY, 150, 0.55);                // cuenca del ojo
    const [cx, cy] = P(lado * 0.031, 1.6062);
    mancha(s, cx, cy, 0.016 * escalaX, 0.0026 * escalaY, 120, 0.5);                  // pliegue del párpado
    const [nx, ny] = P(lado * 0.0094, 1.588);
    mancha(s, nx, ny, 0.004 * escalaX, 0.03 * escalaY, 170, 0.45);                   // lados de la nariz
    const [ax, ay] = P(lado * 0.0128, 1.5625);
    mancha(s, ax, ay, 0.0058 * escalaX, 0.0058 * escalaY, 130, 0.55);                // aletas
    const [fx, fy] = P(lado * 0.0073, 1.559);
    mancha(s, fx, fy, 0.0034 * escalaX, 0.0019 * escalaY, 40, 0.9);                  // fosas nasales
    const [mx, my] = P(lado * 0.056, 1.548);
    mancha(s, mx, my, 0.02 * escalaX, 0.05 * escalaY, 180, 0.5);                     // contorno de las mejillas
    if (ex.mejillas) {                                                                 // surcos de la sonrisa
      s.strokeStyle = 'rgba(150,150,150,0.55)'; s.lineWidth = 2.2; s.beginPath();
      curva(s, P, [[lado * 0.0165, 1.556], [lado * 0.0235, 1.543], [lado * 0.0285, 1.53]]); s.stroke();
    }
  }
  const [bx, by] = P(0, 1.5525); mancha(s, bx, by, 0.009 * escalaX, 0.004 * escalaY, 150, 0.6);   // bajo la nariz
  const [lx, ly] = P(0, 1.5165); mancha(s, lx, ly, 0.016 * escalaX, 0.0045 * escalaY, 140, 0.55); // bajo el labio
  const [jx, jy] = P(0, 1.489); mancha(s, jx, jy, 0.03 * escalaX, 0.008 * escalaY, 175, 0.4);     // mentón
  s.restore();
  // ---------- cejas (G)
  const ce = cejas;
  ce.fillStyle = '#fff';
  for (const lado of [1, -1]) {
    const yI = 1.6115 + ex.cejaY + ex.cejaInt, yM = 1.6182 + ex.cejaY + ex.cejaInt * 0.4, yE = 1.6128 + ex.cejaY;
    ce.beginPath();
    curva(ce, P, [[lado * 0.0125, yI + 0.0026], [lado * 0.022, yM + 0.0012], [lado * 0.034, yM + 0.0006], [lado * 0.0505, yE - 0.0004]]);
    curva(ce, P, [[lado * 0.0505, yE - 0.0004], [lado * 0.034, yM - 0.0016], [lado * 0.022, yM - 0.0026], [lado * 0.0125, yI - 0.0016]], true);
    ce.closePath(); ce.fill();
  }
  // ---------- boca: labios (B) y lo oscuro de la boca abierta (color)
  const la = labios;
  la.fillStyle = '#fff';
  const k = ex.comisuras;
  const yC = 1.529 + k;
  if (ex.boca === 'abierta' || ex.boca === 'o') {
    const ancho = ex.boca === 'o' ? 0.0105 : 0.019;
    la.beginPath();
    curva(la, P, [[-ancho - 0.003, yC], [-0.006, 1.5372], [0, 1.536], [0.006, 1.5372], [ancho + 0.003, yC]]);
    curva(la, P, [[ancho + 0.003, yC], [0, 1.5155], [-ancho - 0.003, yC]], true);
    la.closePath(); la.fill();
    // interior y dientes
    color.fillStyle = '#3a1414';
    color.beginPath();
    curva(color, P, [[-ancho, yC], [0, 1.5335], [ancho, yC]]);
    curva(color, P, [[ancho, yC], [0, 1.5205], [-ancho, yC]], true);
    color.closePath(); color.fill();
    if (ex.boca === 'abierta') {
      color.fillStyle = 'rgba(236,232,224,0.95)';
      color.beginPath();
      curva(color, P, [[-ancho * 0.8, 1.5318], [0, 1.5328], [ancho * 0.8, 1.5318]]);
      curva(color, P, [[ancho * 0.8, 1.5318], [0, 1.5298], [-ancho * 0.8, 1.5318]], true);
      color.closePath(); color.fill();
    }
  } else {
    const fino = ex.boca === 'apretada' ? 0.55 : ex.boca === 'firme' ? 0.7 : 1;
    const anchoB = ex.boca === 'sonrisa' ? 0.0255 : 0.0235;
    la.beginPath();
    curva(la, P, [[-anchoB, yC], [-0.012, 1.5318], [-0.0062, 1.5288 + 0.0058 * fino], [0, 1.5288 + 0.0045 * fino], [0.0062, 1.5288 + 0.0058 * fino], [0.012, 1.5318], [anchoB, yC]]);
    curva(la, P, [[anchoB, yC], [0.012, 1.5262 + 0.001 * (1 - fino)], [0, 1.5288 - 0.0082 * fino], [-0.012, 1.5262 + 0.001 * (1 - fino)], [-anchoB, yC]], true);
    la.closePath(); la.fill();
    // línea entre los labios
    color.strokeStyle = 'rgba(70,24,24,0.7)'; color.lineWidth = 1.6;
    color.beginPath();
    curva(color, P, [[-anchoB + 0.001, yC], [-0.01, 1.5288 + k * 0.35], [0, 1.5288 + k * 0.1 - (ex.boca === 'sonrisa' ? 0.0008 : 0)], [0.01, 1.5288 + k * 0.35], [anchoB - 0.001, yC]]);
    color.stroke();
  }
  // ---------- ojos (color)
  for (const lado of [1, -1]) {
    const ab = ex.ojo;
    const yI = 1.5966, yE = 1.5986, xI = lado * 0.0175, xE = lado * 0.0455;
    if (ab < 0.05) {
      color.strokeStyle = 'rgba(28,16,10,0.95)'; color.lineWidth = 2.4;
      color.beginPath(); curva(color, P, [[xI, yI], [lado * 0.031, 1.5948], [xE, yE]]); color.stroke();
      continue;
    }
    const sup = [[xI, yI], [lado * 0.024, 1.5966 + 0.0044 * ab], [lado * 0.0325, 1.5968 + 0.0052 * ab], [lado * 0.041, 1.5978 + 0.0036 * ab], [xE, yE]];
    const inf = [[xE, yE], [lado * 0.038, 1.5937 - 0.0012 * Math.max(0, ab - 1)], [lado * 0.029, 1.5929 - 0.0012 * Math.max(0, ab - 1) + (ex.mejillas ? 0.0012 : 0)], [xI, yI]];
    color.save();
    color.beginPath(); curva(color, P, sup); curva(color, P, inf, true); color.closePath();
    color.fillStyle = '#ece6dc'; color.fill();
    color.clip();
    // iris y pupila
    const [ix, iy] = P(lado * 0.0312, 1.5968);
    const rI = 0.0051 * escalaY;
    const gi = color.createRadialGradient(ix, iy, rI * 0.2, ix, iy, rI);
    gi.addColorStop(0, '#5a381f'); gi.addColorStop(0.7, '#3a2312'); gi.addColorStop(1, '#170d06');
    color.fillStyle = gi; color.beginPath(); color.ellipse(ix, iy, rI * 1.15, rI, 0, 0, Math.PI * 2); color.fill();
    color.fillStyle = '#060504'; color.beginPath(); color.ellipse(ix, iy, rI * 0.46, rI * 0.42, 0, 0, Math.PI * 2); color.fill();
    color.fillStyle = 'rgba(255,255,255,0.9)'; color.beginPath(); color.arc(ix - rI * 0.35, iy - rI * 0.4, rI * 0.22, 0, Math.PI * 2); color.fill();
    // sombra del párpado sobre el ojo
    const gs = color.createLinearGradient(0, iy - rI * 1.6, 0, iy);
    gs.addColorStop(0, 'rgba(40,24,16,0.45)'); gs.addColorStop(1, 'rgba(40,24,16,0)');
    color.fillStyle = gs; color.fillRect(ix - rI * 3, iy - rI * 2, rI * 6, rI * 2);
    color.restore();
    // pestañas y párpado inferior
    color.strokeStyle = 'rgba(24,14,9,0.95)'; color.lineWidth = 2.6; color.lineCap = 'round';
    color.beginPath(); curva(color, P, sup); color.stroke();
    color.lineWidth = 1.2;
    const [ox, oy] = P(xE, yE);
    color.beginPath(); color.moveTo(ox, oy); color.lineTo(ox + lado * 3, oy - 2.5); color.stroke();
    color.strokeStyle = 'rgba(80,45,30,0.4)'; color.lineWidth = 1;
    color.beginPath(); curva(color, P, inf); color.stroke();
  }
}

export function texturasRostro() {
  const W = C * 4, H = C * 2;
  const color = lienzo(W, H), sombra = lienzo(W, H, '#fff'), cejas = lienzo(W, H, '#000'), labios = lienzo(W, H, '#000');
  for (let i = 0; i < 8; i++) dibujarCara({ color: color.ctx, sombra: sombra.ctx, cejas: cejas.ctx, labios: labios.ctx }, i);
  // máscaras: R sombreado, G cejas, B labios
  const m = lienzo(W, H);
  const dS = sombra.ctx.getImageData(0, 0, W, H).data, dC = cejas.ctx.getImageData(0, 0, W, H).data, dL = labios.ctx.getImageData(0, 0, W, H).data;
  const img = m.ctx.createImageData(W, H);
  for (let i = 0; i < img.data.length; i += 4) { img.data[i] = dS[i]; img.data[i + 1] = dC[i]; img.data[i + 2] = dL[i]; img.data[i + 3] = 255; }
  m.ctx.putImageData(img, 0, 0);
  const tColor = new THREE.CanvasTexture(color.c);
  tColor.colorSpace = THREE.SRGBColorSpace;
  const tMasc = new THREE.CanvasTexture(m.c);
  tMasc.colorSpace = THREE.NoColorSpace;
  for (const t of [tColor, tMasc]) { t.anisotropy = 8; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; }
  return { color: tColor, mascara: tMasc };
}

function azar(semilla) { let a = semilla >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ruido suave que se repite (para arrugas)
function ruidoSuave(N, r, octavas) {
  const v = new Float32Array(N * N);
  for (const [frec, amp] of octavas) {
    const ondas = Array.from({ length: 4 }, () => [Math.floor(r() * frec) + 1, Math.floor(r() * frec) + 1, r() * 6.28, r() * 6.28]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let s = 0;
      for (const [fx, fy, px, py] of ondas) s += Math.sin((x / N) * fx * 6.2832 + px) * Math.sin((y / N) * fy * 6.2832 + py) + Math.sin(((x + y) / N) * fx * 6.2832 + py) * 0.5;
      v[y * N + x] += s * amp;
    }
  }
  let mn = Infinity, mx = -Infinity; for (const x of v) { mn = Math.min(mn, x); mx = Math.max(mx, x); }
  for (let i = 0; i < v.length; i++) v[i] = (v[i] - mn) / (mx - mn || 1);
  return v;
}

export function texturaTela() {
  const N = 256, r = azar(77);
  const { c, ctx } = lienzo(N, N);
  const img = ctx.createImageData(N, N);
  const arrugas = ruidoSuave(N, r, [[2, 1], [5, 0.5], [9, 0.25]]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    const hilo = 0.82 + 0.1 * Math.sin(x * 1.57) * Math.sin(y * 1.57) + (r() - 0.5) * 0.16;
    const sarga = 0.62 + 0.3 * ((((x + y) % 6) < 3) ? 1 : 0) + (r() - 0.5) * 0.18 + 0.08 * Math.sin(y * 0.4 + r());
    img.data[i] = Math.max(0, Math.min(255, hilo * 255));
    img.data[i + 1] = Math.max(0, Math.min(255, sarga * 255));
    img.data[i + 2] = arrugas[y * N + x] * 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

export function texturaPelo() {
  const N = 256, r = azar(41);
  const { c, ctx } = lienzo(N, N);
  const img = ctx.createImageData(N, N);
  const columnas = Float32Array.from({ length: N }, () => r());
  // mechones: columnas suavizadas con algo de variación a lo largo
  const suav = new Float32Array(N);
  for (let x = 0; x < N; x++) { let s = 0, k = 0; for (let d = -2; d <= 2; d++) { s += columnas[(x + d + N) % N] * (3 - Math.abs(d)); k += 3 - Math.abs(d); } suav[x] = s / k; }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    const xx = (x + Math.round(3 * Math.sin((y / N) * 6.2832 * 2 + x * 0.05))) % N;
    const v = 0.55 * suav[(xx + N) % N] + 0.45 * columnas[(xx + N) % N] * (0.7 + 0.3 * Math.sin(y * 0.08 + x));
    img.data[i] = Math.max(0, Math.min(255, v * 255));
    img.data[i + 1] = Math.max(0, Math.min(255, suav[x] * 255));
    img.data[i + 2] = 128; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
