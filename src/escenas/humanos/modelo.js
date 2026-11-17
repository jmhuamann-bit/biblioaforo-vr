// Modelos 3D de las personas, generados por código: anatomía con proporciones naturales (persona de
// 1,70 m mirando hacia +z), ropa, peinados y accesorios. Cada vértice lleva los dos huesos que lo
// mueven (con su peso), la región (piel, polo, pantalón, zapato, rostro…), cómo cambia con un
// cuerpo femenino, cuánto engorda con la complexión y si forma pliegues de tela.
// Dos niveles de detalle: el cercano (rostro con nariz y labios, manos con pulgar) y el lejano.
import * as THREE from 'three';

import { HUESO, N_HUESOS, PIVOTE, REGION } from './constantes.js';
export { HUESO, N_HUESOS, PIVOTE, REGION };

// ------------------------------------------------------------------ utilidades
const g = (v, c, s) => Math.exp(-((v - c) ** 2) / (2 * s * s));
const paso = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mezclar = (a, b, t) => a + (b - a) * t;
function interp(x, puntos) {
  if (x <= puntos[0][0]) return puntos[0][1];
  for (let i = 1; i < puntos.length; i++) if (x <= puntos[i][0]) { const [x0, y0] = puntos[i - 1], [x1, y1] = puntos[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  return puntos[puntos.length - 1][1];
}
const envolver = (t) => { let a = t % (Math.PI * 2); if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return a; };
// punto de una superelipse (θ = 0 hacia +z, θ = π/2 hacia +x)
function se(t, rx, rz, e = 2) {
  const s = Math.sin(t), c = Math.cos(t), k = 2 / e;
  return [rx * Math.sign(s) * Math.abs(s) ** k, rz * Math.sign(c) * Math.abs(c) ** k];
}
const uniforme = (n) => Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2);
// más columnas al frente (el rostro) que atrás
function densoAlFrente(nFrente, nAtras, abertura = 0.8) {
  const l = [];
  const d = abertura / nFrente;
  for (let i = 0; i <= nFrente; i++) l.push(i * d);
  for (let i = 1; i < nAtras; i++) l.push(abertura + ((Math.PI * 2 - 2 * abertura) * i) / nAtras);
  for (let i = nFrente; i >= 1; i--) l.push(Math.PI * 2 - i * d);
  return l;
}

class Malla {
  constructor() { this.p = []; this.uv = []; this.h = []; this.x = []; this.i = []; }
  get n() { return this.p.length / 3; }
  v(x, y, z, o = {}) {
    const h = o.hueso || [0, 0, 0];
    const f = o.fem || [0, 0, 0];
    const uv = o.uv || [-1, -1];
    const ancho = Math.max(0, Math.min(1.5, o.ancho || 0));
    const pl = Math.max(0, Math.min(0.99, o.pliegue || 0));
    this.p.push(x, y, z); this.uv.push(uv[0], uv[1]);
    this.h.push(h[0], h[1], h[2], o.region ?? 0);
    this.x.push(f[0], f[1], f[2], Math.floor(ancho * 100) + pl);
    return this.n - 1;
  }
  // agrega triángulos de una parte, orientados hacia afuera de su centro (o hacia adentro si invertir)
  parte(tris, invertir = false, centro = null) {
    if (!tris.length) return;
    let cx = 0, cy = 0, cz = 0, k = 0;
    if (centro) [cx, cy, cz] = centro;
    else {
      const usados = new Set(tris.flat());
      for (const v of usados) { cx += this.p[v * 3]; cy += this.p[v * 3 + 1]; cz += this.p[v * 3 + 2]; k++; }
      cx /= k; cy /= k; cz /= k;
    }
    let suma = 0;
    const P = (v) => [this.p[v * 3], this.p[v * 3 + 1], this.p[v * 3 + 2]];
    for (const [a, b, c] of tris) {
      const A = P(a), B = P(b), C = P(c);
      const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const m = [(A[0] + B[0] + C[0]) / 3 - cx, (A[1] + B[1] + C[1]) / 3 - cy, (A[2] + B[2] + C[2]) / 3 - cz];
      suma += n[0] * m[0] + n[1] * m[1] + n[2] * m[2];
    }
    const voltear = (suma < 0) !== invertir;
    for (const [a, b, c] of tris) { if (voltear) this.i.push(a, c, b); else this.i.push(a, b, c); }
  }
  geometria() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    geo.setAttribute('aUv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute('aHueso', new THREE.Float32BufferAttribute(this.h, 4));
    geo.setAttribute('aExtra', new THREE.Float32BufferAttribute(this.x, 4));
    geo.setIndex(this.i);
    geo.computeVertexNormals();
    return geo;
  }
}

// Superficie en filas × columnas (las columnas cierran en anillo). punto(fila, θ) → [x,y,z]
// e info(fila, θ, [x,y,z]) → atributos del vértice. tapas: centros opcionales al inicio y al final.
function tubo(m, { filas, thetas, punto, info, tapaInicio = null, tapaFin = null, invertir = false, centro = null }) {
  const grilla = filas.map((f) => thetas.map((t) => { const p = punto(f, t); return m.v(p[0], p[1], p[2], info(f, t, p)); }));
  const tris = [];
  const n = thetas.length;
  for (let i = 0; i < filas.length - 1; i++) {
    for (let j = 0; j < n; j++) {
      const a = grilla[i][j], b = grilla[i][(j + 1) % n], c = grilla[i + 1][(j + 1) % n], d = grilla[i + 1][j];
      tris.push([a, b, c], [a, c, d]);
    }
  }
  for (const [tapa, fila] of [[tapaInicio, 0], [tapaFin, filas.length - 1]]) {
    if (!tapa) continue;
    const c = m.v(tapa.p[0], tapa.p[1], tapa.p[2], tapa.info);
    for (let j = 0; j < n; j++) tris.push([c, grilla[fila][(j + 1) % n], grilla[fila][j]]);
  }
  m.parte(tris, invertir, centro);
  return grilla;
}

// Tubo a lo largo de un camino 3D con sección circular o elíptica (cola de caballo, tirantes, lentes)
function tuboCamino(m, { camino, radio, segs, info, normalRef = null, cerrar = true, ancho = null, anillo = false }) {
  const n = camino.length;
  const T = camino.map((p, i) => {
    const a = camino[Math.max(0, i - 1)], b = camino[Math.min(n - 1, i + 1)];
    const t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const l = Math.hypot(...t) || 1;
    return [t[0] / l, t[1] / l, t[2] / l];
  });
  const filas = [];
  for (let i = 0; i < n; i++) {
    const t = T[i];
    let r = normalRef ? normalRef(camino[i], i) : (Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
    // N ⟂ T
    const d = r[0] * t[0] + r[1] * t[1] + r[2] * t[2];
    let N = [r[0] - d * t[0], r[1] - d * t[1], r[2] - d * t[2]]; const ln = Math.hypot(...N) || 1; N = N.map((x) => x / ln);
    const B = [t[1] * N[2] - t[2] * N[1], t[2] * N[0] - t[0] * N[2], t[0] * N[1] - t[1] * N[0]];
    const rr = typeof radio === 'function' ? radio(i) : radio;
    const aa = ancho ? (typeof ancho === 'function' ? ancho(i) : ancho) : rr;
    const fila = [];
    for (let j = 0; j < segs; j++) {
      const f = (j / segs) * Math.PI * 2;
      const c = camino[i];
      const x = c[0] + B[0] * Math.cos(f) * aa + N[0] * Math.sin(f) * rr;
      const y = c[1] + B[1] * Math.cos(f) * aa + N[1] * Math.sin(f) * rr;
      const z = c[2] + B[2] * Math.cos(f) * aa + N[2] * Math.sin(f) * rr;
      fila.push(m.v(x, y, z, info(i, j)));
    }
    filas.push(fila);
  }
  const filasEf = anillo ? [...filas, filas[0]] : filas;
  const caminoEf = anillo ? [...camino, camino[0]] : camino;
  for (let i = 0; i < filasEf.length - 1; i++) {
    const a0 = caminoEf[i], a1 = caminoEf[i + 1];
    const ref = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2, (a0[2] + a1[2]) / 2];
    const tramo = [];
    for (let j = 0; j < segs; j++) {
      const a = filasEf[i][j], b = filasEf[i][(j + 1) % segs], c = filasEf[i + 1][(j + 1) % segs], d = filasEf[i + 1][j];
      tramo.push([a, b, c], [a, c, d]);
    }
    m.parte(tramo, false, ref);
  }
  if (cerrar && !anillo) {
    for (const [i, p, interior] of [[0, camino[0], camino[Math.min(1, n - 1)]], [n - 1, camino[n - 1], camino[Math.max(0, n - 2)]]]) {
      const c = m.v(p[0], p[1], p[2], info(i, 0));
      const tapa = [];
      for (let j = 0; j < segs; j++) tapa.push([c, filas[i][(j + 1) % segs], filas[i][j]]);
      m.parte(tapa, false, interior);
    }
  }
}

// Elipsoide (orejas, moño)
function elipsoide(m, { c, r, lat, lon, info, rot = 0 }) {
  const filas = [];
  for (let i = 1; i < lat; i++) filas.push(i / lat);
  tubo(m, {
    filas, thetas: uniforme(lon),
    punto: (f, t) => {
      const ph = f * Math.PI;
      let x = Math.sin(ph) * Math.sin(t) * r[0], y = Math.cos(ph) * r[1], z = Math.sin(ph) * Math.cos(t) * r[2];
      if (rot) { const cs = Math.cos(rot), sn = Math.sin(rot); const yy = y * cs - z * sn, zz = y * sn + z * cs; y = yy; z = zz; }
      return [c[0] + x, c[1] + y, c[2] + z];
    },
    info: () => info,
    tapaInicio: { p: rotarY(c, r, rot, 1), info }, tapaFin: { p: rotarY(c, r, rot, -1), info },
    centro: c,
  });
}
function rotarY(c, r, rot, signo) {
  let y = signo * r[1], z = 0;
  if (rot) { const cs = Math.cos(rot), sn = Math.sin(rot); const yy = y * cs - z * sn, zz = y * sn + z * cs; y = yy; z = zz; }
  return [c[0], c[1] + y, c[2] + z];
}

// ------------------------------------------------------------------ proporciones (1,70 m)
const TORSO = [ // y, rx, rz, cz, e
  [0.8, 0.112, 0.08, 0, 2.2], [0.835, 0.148, 0.097, -0.004, 2.4], [0.875, 0.165, 0.107, -0.008, 2.6], [0.92, 0.17, 0.11, -0.008, 2.6],
  [0.97, 0.161, 0.104, -0.004, 2.5], [1.02, 0.147, 0.098, 0, 2.3], [1.07, 0.145, 0.099, 0.002, 2.3], [1.125, 0.151, 0.104, 0.004, 2.4],
  [1.185, 0.161, 0.11, 0.006, 2.5], [1.245, 0.168, 0.114, 0.006, 2.6], [1.3, 0.177, 0.112, 0.002, 2.8], [1.345, 0.186, 0.104, -0.004, 2.9],
  [1.378, 0.18, 0.094, -0.008, 2.8], [1.4, 0.15, 0.082, -0.01, 2.4], [1.42, 0.105, 0.068, -0.011, 2.1], [1.44, 0.068, 0.058, -0.011, 2], [1.452, 0.056, 0.054, -0.01, 2],
];
const CUELLO = [[1.395, 0.055, 0.058, -0.016], [1.435, 0.051, 0.055, -0.014], [1.475, 0.049, 0.053, -0.01], [1.515, 0.049, 0.052, -0.006], [1.545, 0.046, 0.05, -0.004]];
export const CABEZA = [ // y, rx, rz, cz
  [1.484, 0.024, 0.022, 0.058], [1.494, 0.041, 0.042, 0.049], [1.506, 0.053, 0.06, 0.036], [1.521, 0.061, 0.074, 0.024],
  [1.538, 0.066, 0.083, 0.016], [1.556, 0.07, 0.089, 0.011], [1.575, 0.073, 0.093, 0.008], [1.595, 0.075, 0.096, 0.005],
  [1.615, 0.077, 0.098, 0.002], [1.635, 0.077, 0.099, -0.001], [1.655, 0.075, 0.098, -0.005], [1.675, 0.069, 0.093, -0.01],
  [1.69, 0.058, 0.08, -0.014], [1.699, 0.04, 0.058, -0.017],
];
export const ROSTRO = { y0: 1.48, alto: 0.2235, divU: 2.4 };      // uv del rostro: u = 0.5 + θ/2.4, v = (y − 1.48)/0.2235
const BRAZO = [ // y, rx, rz (brazo, antebrazo y mano en un solo tubo)
  [1.392, 0.026, 0.03], [1.375, 0.042, 0.047], [1.345, 0.049, 0.052], [1.31, 0.049, 0.051], [1.265, 0.046, 0.048], [1.215, 0.043, 0.046],
  [1.165, 0.041, 0.043], [1.12, 0.039, 0.04], [1.085, 0.037, 0.039], [1.055, 0.038, 0.041], [1.01, 0.04, 0.043], [0.96, 0.037, 0.04],
  [0.91, 0.032, 0.035], [0.865, 0.028, 0.03], [0.836, 0.025, 0.028], [0.818, 0.02, 0.033], [0.795, 0.016, 0.04], [0.765, 0.015, 0.043],
  [0.738, 0.014, 0.043], [0.712, 0.012, 0.039], [0.688, 0.011, 0.034], [0.668, 0.009, 0.024], [0.657, 0.006, 0.012],
];
const PIERNA = [ // y, rx, rz, cz
  [0.905, 0.074, 0.084, 0], [0.865, 0.08, 0.09, 0], [0.805, 0.075, 0.084, 0.002], [0.745, 0.069, 0.078, 0.003], [0.685, 0.063, 0.071, 0.004],
  [0.625, 0.058, 0.064, 0.005], [0.565, 0.053, 0.058, 0.006], [0.515, 0.05, 0.054, 0.007], [0.478, 0.049, 0.052, 0.008], [0.44, 0.048, 0.052, 0.002],
  [0.395, 0.05, 0.057, -0.01], [0.34, 0.048, 0.054, -0.012], [0.275, 0.041, 0.045, -0.01], [0.205, 0.035, 0.038, -0.009], [0.145, 0.031, 0.033, -0.009],
  [0.1, 0.029, 0.031, -0.01],
];
const ZAPATO = [ // z, medio ancho, alto
  [-0.06, 0.024, 0.064], [-0.048, 0.037, 0.086], [-0.02, 0.042, 0.092], [0.02, 0.045, 0.082], [0.065, 0.047, 0.066], [0.11, 0.046, 0.056],
  [0.15, 0.041, 0.048], [0.178, 0.03, 0.04], [0.192, 0.015, 0.03],
];
const FALDA = [[1.01, 0.152, 0.106], [0.96, 0.172, 0.118], [0.89, 0.188, 0.132], [0.8, 0.2, 0.146], [0.7, 0.21, 0.156], [0.6, 0.217, 0.163], [0.53, 0.22, 0.166]];

// nivel de detalle: 0 cerca · 1 media distancia · 2 lejos (menos filas y columnas)
const filasDe = (lista, lod) => (lod === 0 ? lista : lista.filter((_, i) => i % (lod === 1 ? 2 : 3) === 0 || i === lista.length - 1));

// ------------------------------------------------------------------ cabeza (también la usan los peinados)
export function filaCabeza(y) {
  if (y <= CABEZA[0][0]) return CABEZA[0].slice(1);
  for (let i = 1; i < CABEZA.length; i++) {
    if (y <= CABEZA[i][0]) { const a = CABEZA[i - 1], b = CABEZA[i], t = (y - a[0]) / (b[0] - a[0]); return [mezclar(a[1], b[1], t), mezclar(a[2], b[2], t), mezclar(a[3], b[3], t)]; }
  }
  return CABEZA[CABEZA.length - 1].slice(1);
}
export function superficieCabeza(t, y) { const [rx, rz, cz] = filaCabeza(y); const [x, z] = se(t, rx, rz); return [x, y, z + cz]; }

function relieveRostro(tn, y) {
  const a = Math.abs(tn);
  let d = 0;
  if (a < 0.22) {
    const perfil = interp(y, [[1.545, 0], [1.556, 0.8], [1.565, 1], [1.578, 0.78], [1.598, 0.52], [1.615, 0.33], [1.628, 0.1], [1.64, 0]]);
    d += 0.0175 * perfil * (1 - a / 0.22) ** 1.4;
  }
  if (a > 0.12 && a < 0.3) d += 0.0045 * g(y, 1.561, 0.006) * (1 - Math.abs(a - 0.21) / 0.09);
  if (a < 0.3) d += 0.0045 * g(y, 1.529, 0.008) * (1 - a / 0.3);
  if (a < 0.28) d += 0.003 * g(y, 1.492, 0.007) * (1 - a / 0.28);
  if (a < 0.62) d += 0.0042 * g(y, 1.624, 0.008) * Math.cos(a * 1.4);
  d -= 0.0048 * g(y, 1.598, 0.009) * g(a, 0.42, 0.12);
  d += 0.0032 * g(y, 1.574, 0.011) * g(a, 0.74, 0.16);
  return d;
}

function cabeza(m, lod) {
  const filas = filasDe(CABEZA, lod);
  const thetas = lod === 0 ? densoAlFrente(12, 14, 0.85) : uniforme(lod === 1 ? 10 : 7);
  const hueso = [HUESO.cabeza, HUESO.cabeza, 0];
  tubo(m, {
    filas, thetas,
    punto: (f, t) => {
      const [y, rx, rz, cz] = f;
      const tn = envolver(t);
      const [x, z] = se(t, rx, rz);
      const d = lod === 0 ? relieveRostro(tn, y) : relieveRostro(tn, y) * 0.5;
      return [x + Math.sin(t) * d, y, z + cz + Math.cos(t) * d];
    },
    info: (f, t, p) => {
      const tn = envolver(t), y = p[1];
      const uv = Math.abs(tn) < 1.15 ? [0.5 + tn / ROSTRO.divU, (y - ROSTRO.y0) / ROSTRO.alto] : [-1, -1];
      const fem = [-0.035 * p[0] - 0.004 * g(y, 1.51, 0.02) * Math.sin(t), 0, -0.03 * (p[2] + 0.006)];
      return { hueso, region: REGION.rostro, uv, fem, ancho: 0.18 * g(y, 1.53, 0.035) };
    },
    tapaInicio: { p: [0, 1.48, 0.056], info: { hueso, region: REGION.rostro, uv: [0.5, 0] } },
    tapaFin: { p: [0, 1.7035, -0.018], info: { hueso, region: REGION.rostro, uv: [-1, -1] } },
    centro: [0, 1.6, 0],
  });
  if (lod === 0) {
    for (const s of [1, -1]) elipsoide(m, { c: [s * 0.0755, 1.59, -0.012], r: [0.0105, 0.029, 0.019], lat: 5, lon: 8, rot: -0.12, info: { hueso, region: REGION.piel } });
  }
}

function cuello(m, lod) {
  tubo(m, {
    filas: lod === 2 ? [CUELLO[0], CUELLO[4]] : CUELLO, thetas: uniforme([12, 8, 5][lod]),
    punto: (f, t) => { const [y, rx, rz, cz] = f; const [x, z] = se(t, rx, rz); return [x, y, z + cz]; },
    info: (f, t) => ({ hueso: [HUESO.pecho, HUESO.cabeza, paso(1.43, 1.5, f[0])], region: REGION.piel, fem: [-0.006 * Math.sin(t), 0, -0.004 * Math.cos(t)], ancho: 0.35 }),
    centro: [0, 1.47, -0.01],
  });
}

function femTorso(t, y) {
  const s = Math.sin(t), c = Math.cos(t);
  let dx = 0, dz = 0;
  const cad = g(y, 0.915, 0.06);
  dx += 0.022 * cad * s; dz += 0.006 * cad * c;
  if (c < 0) dz += 0.013 * g(y, 0.89, 0.05) * c;
  const cin = g(y, 1.07, 0.04);
  dx -= 0.019 * cin * s; dz -= 0.006 * cin * c;
  if (c > 0) dz += 0.031 * g(y, 1.235, 0.042) * c ** 1.6 * (0.55 + 0.45 * g(Math.abs(s), 0.42, 0.25));
  dx -= 0.02 * g(y, 1.37, 0.035) * s;
  return [dx, 0, dz];
}

function torso(m, lod) {
  tubo(m, {
    filas: filasDe(TORSO, lod), thetas: uniforme([20, 10, 7][lod]),
    punto: (f, t) => { const [y, rx, rz, cz, e] = f; const [x, z] = se(t, rx, rz, e); return [x, y, z + cz]; },
    info: (f, t) => {
      const y = f[0], c = Math.cos(t), s = Math.sin(t);
      return {
        hueso: [HUESO.pelvis, HUESO.pecho, paso(1.0, 1.1, y)],
        region: y < 1.0 ? REGION.inferior : y < 1.43 ? REGION.superior : REGION.piel,
        fem: femTorso(t, y),
        ancho: 0.6 + 0.85 * g(y, 1.06, 0.07) * Math.max(0, c) + 0.25 * g(y, 0.92, 0.06),
        pliegue: 0.55 * g(y, 1.03, 0.022) * Math.max(0, c) + 0.6 * g(y, 0.83, 0.02) * Math.max(0, c) + 0.4 * g(y, 1.335, 0.03) * s * s,
      };
    },
    tapaInicio: { p: [0, 0.782, 0], info: { hueso: [HUESO.pelvis, HUESO.pelvis, 0], region: REGION.inferior } },
    centro: [0, 1.1, 0],
  });
}

function brazo(m, s, lod) {
  const filas = filasDe(BRAZO, lod);
  const arriba = s > 0 ? HUESO.brazoP : HUESO.brazoN, abajo = s > 0 ? HUESO.antebrazoP : HUESO.antebrazoN;
  const cx = (y) => s * interp(y, [[0.657, 0.223], [0.836, 0.218], [1.075, 0.205], [1.345, 0.168], [1.375, 0.158], [1.392, 0.15]]);
  const cz = (y) => interp(y, [[0.657, 0.014], [0.74, 0.006], [0.836, -0.006], [1.075, -0.022], [1.42, -0.012]]);
  tubo(m, {
    filas, thetas: uniforme([12, 6, 4][lod]),
    punto: (f, t) => { const [y, rx, rz] = f; const [x, z] = se(t, rx, rz); return [cx(y) + x, y, cz(y) + z]; },
    info: (f, t) => {
      const y = f[0], c = Math.cos(t);
      let hueso;
      if (y > 1.36) hueso = [HUESO.pecho, arriba, paso(1.43, 1.35, y)];
      else if (y > 1.11) hueso = [arriba, arriba, 0];
      else if (y > 1.035) hueso = [arriba, abajo, paso(1.11, 1.035, y)];
      else hueso = [abajo, abajo, 0];
      const region = y >= 1.235 ? REGION.superior : y >= 0.85 ? REGION.manga : REGION.piel;
      const k = y > 1.08 ? -0.004 : y > 0.84 ? -0.003 : -0.0015;
      return {
        hueso, region, fem: [k * Math.sin(t) - s * 0.012, 0, k * c],
        ancho: y > 1.08 ? 0.55 : y > 0.84 ? 0.3 : 0.05,
        pliegue: 0.75 * g(y, 1.07, 0.03) * (0.4 + 0.6 * Math.max(0, c)) + 0.3 * g(y, 1.35, 0.03) + 0.3 * g(y, 0.865, 0.012),
      };
    },
    tapaInicio: { p: [s * 0.148, 1.4, -0.012], info: { hueso: [HUESO.pecho, arriba, 0.5], region: REGION.superior } },
    tapaFin: { p: [s * 0.223, 0.651, 0.016], info: { hueso: [abajo, abajo, 0], region: REGION.piel } },
    centro: [s * 0.2, 1.05, -0.01],
  });
  if (lod === 0) {   // pulgar
    tuboCamino(m, {
      camino: [[s * 0.214, 0.806, 0.024], [s * 0.211, 0.785, 0.036], [s * 0.207, 0.762, 0.043], [s * 0.204, 0.744, 0.045]],
      radio: (i) => [0.0105, 0.0095, 0.0085, 0.006][i], segs: 6,
      info: () => ({ hueso: [abajo, abajo, 0], region: REGION.piel }),
    });
  }
}

function pierna(m, s, lod) {
  const filas = filasDe(PIERNA, lod);
  const arriba = s > 0 ? HUESO.musloP : HUESO.musloN, abajo = s > 0 ? HUESO.piernaP : HUESO.piernaN;
  const cx = (y) => s * interp(y, [[0.1, 0.092], [0.478, 0.088], [0.905, 0.09]]);
  tubo(m, {
    filas, thetas: uniforme([12, 6, 4][lod]),
    punto: (f, t) => { const [y, rx, rz, czz] = f; const [x, z] = se(t, rx, rz); return [cx(y) + x, y, z + czz]; },
    info: (f, t) => {
      const y = f[0], c = Math.cos(t), sn = Math.sin(t);
      let hueso;
      if (y > 0.84) hueso = [HUESO.pelvis, arriba, paso(0.93, 0.84, y)];
      else if (y > 0.52) hueso = [arriba, arriba, 0];
      else if (y > 0.44) hueso = [arriba, abajo, paso(0.52, 0.44, y)];
      else hueso = [abajo, abajo, 0];
      const interior = Math.max(0, -s * sn);
      return {
        hueso, region: y >= 0.665 ? REGION.muslo : REGION.piernaBaja,
        fem: [0.008 * sn * g(y, 0.82, 0.06) - 0.002 * sn * g(y, 0.36, 0.06), 0, -0.002 * c * g(y, 0.36, 0.06)],
        ancho: y > 0.5 ? 0.7 : 0.35,
        pliegue: 0.7 * g(y, 0.478, 0.028) * (0.3 + 0.7 * Math.max(0, -c)) + 0.45 * g(y, 0.13, 0.03) + 0.35 * g(y, 0.86, 0.025) * interior,
      };
    },
    tapaInicio: { p: [s * 0.09, 0.925, 0], info: { hueso: [HUESO.pelvis, arriba, 0.5], region: REGION.muslo } },
    centro: [s * 0.09, 0.5, 0],
  });
  // zapato (a lo largo de z)
  const filasZ = filasDe(ZAPATO, lod);
  tubo(m, {
    filas: filasZ, thetas: uniforme([10, 6, 4][lod]),
    punto: (f, t) => {
      const [z, hw, alto] = f;
      const [x, y] = se(t, hw, alto / 2, 3);
      return [s * (0.092 + 0.012 * Math.max(0, z) / 0.19) + x, alto / 2 + y, z - 0.008];
    },
    info: () => ({ hueso: [abajo, abajo, 0], region: REGION.zapato, ancho: 0.05 }),
    tapaInicio: { p: [s * 0.092, 0.035, -0.07], info: { hueso: [abajo, abajo, 0], region: REGION.zapato } },
    tapaFin: { p: [s * 0.104, 0.016, 0.192], info: { hueso: [abajo, abajo, 0], region: REGION.zapato } },
    centro: [s * 0.095, 0.045, 0.06],
  });
}

function falda(m, lod) {
  const thetas = uniforme([16, 8, 6][lod]);
  for (const interior of lod === 2 ? [false] : [false, true]) {
    tubo(m, {
      filas: lod === 0 ? FALDA : FALDA.filter((_, i) => i % (lod === 1 ? 2 : 3) === 0), thetas,
      punto: (f, t) => { const k = interior ? 0.975 : 1; const [y, rx, rz] = f; const [x, z] = se(t, rx * k, rz * k, 2.3); return [x, y, z - 0.004]; },
      info: (f, t) => {
        const y = f[0], s = Math.sin(t), c = Math.cos(t);
        let hueso;
        if (c > 0 && Math.abs(s) < 0.3) hueso = [HUESO.musloP, HUESO.musloN, 0.5];
        else if (c > 0) hueso = [HUESO.pelvis, s > 0 ? HUESO.musloP : HUESO.musloN, paso(0.98, 0.7, y) * Math.min(1, c * 1.6)];
        else hueso = [HUESO.pelvis, HUESO.pelvis, 0];
        return { hueso, region: REGION.falda, pliegue: 0.6 };
      },
      invertir: interior, centro: [0, 0.8, 0],
    });
  }
}

function capucha(m, lod) {
  const n = [9, 5, 4][lod];
  const camino = Array.from({ length: n }, (_, i) => { const t = -1 + (2 * i) / (n - 1); return [0.12 * t, 1.405 + 0.025 * (1 - t * t), -0.098 - 0.032 * (1 - t * t)]; });
  tuboCamino(m, {
    camino, radio: (i) => { const t = -1 + (2 * i) / (n - 1); return 0.034 * (1 - 0.45 * t * t); }, segs: [8, 5, 4][lod],
    info: () => ({ hueso: [HUESO.pecho, HUESO.pecho, 0], region: REGION.capucha, pliegue: 0.5 }),
  });
}

// ------------------------------------------------------------------ cuerpo completo
export function geometriaCuerpo(lod = 0) {
  const m = new Malla();
  torso(m, lod);
  cuello(m, lod);
  cabeza(m, lod);
  for (const s of [1, -1]) { brazo(m, s, lod); pierna(m, s, lod); }
  falda(m, lod);
  capucha(m, lod);
  return m.geometria();
}

// ------------------------------------------------------------------ peinados
// Normal hacia afuera del cráneo (elipsoide aproximado) para dar volumen al pelo
function normalCraneo(p) {
  const n = [p[0] / 0.078 ** 2, (p[1] - 1.6) / 0.104 ** 2, (p[2] + 0.006) / 0.1 ** 2];
  const l = Math.hypot(...n) || 1;
  return n.map((x) => x / l);
}
const NIVELES_PELO = [1.47, 1.5, 1.53, 1.56, 1.585, 1.61, 1.632, 1.652, 1.67, 1.684, 1.694, 1.7];

// Capa de pelo sobre el cráneo: borde inferior yMin(|θ|), superior yMax(|θ|) y grosor(θ, y)
function capa(m, { yMin, yMax = () => 2, grosor, region = REGION.pelo, lod, ruido = 0, hueso = null }) {
  const thetas = uniforme([20, 10, 7][lod]);
  const niveles = lod === 0 ? NIVELES_PELO : NIVELES_PELO.filter((_, i) => i % (lod === 1 ? 2 : 3) === 1 || i === NIVELES_PELO.length - 1);
  const h = hueso || [HUESO.cabeza, HUESO.cabeza, 0];
  tubo(m, {
    filas: niveles, thetas,
    punto: (y0, t) => {
      const a = Math.abs(envolver(t));
      const lo = yMin(a), hi = yMax(a);
      const y = Math.min(Math.max(y0, lo), hi);
      const p = superficieCabeza(t, y);
      const n = normalCraneo(p);
      let gr = grosor(a, y) * paso(lo, lo + 0.016, y) * (hi < 1.9 ? paso(hi, hi - 0.016, y) : 1);
      if (ruido) gr *= 1 + ruido * Math.sin(t * 9 + y * 80) * Math.sin(t * 5 - y * 61);
      return [p[0] + n[0] * gr, p[1] + n[1] * gr, p[2] + n[2] * gr];
    },
    info: () => ({ hueso: h, region }),
    tapaFin: yMax(0) > 1.9 ? { p: coronilla(thetas, niveles[niveles.length - 1], yMin, yMax, grosor, ruido), info: { hueso: h, region } } : null,
    centro: [0, 1.6, -0.006],
  });
}

function coronilla(thetas, y0, yMin, yMax, grosor, ruido) {
  let x = 0, y = 0, z = 0;
  for (const t of thetas) {
    const a = Math.abs(envolver(t));
    const yy = Math.min(Math.max(y0, yMin(a)), yMax(a));
    const p = superficieCabeza(t, yy);
    const n = normalCraneo(p);
    let gr = grosor(a, yy);
    if (ruido) gr *= 1 + ruido * Math.sin(t * 9 + yy * 80) * Math.sin(t * 5 - yy * 61);
    x += p[0] + n[0] * gr; y += p[1] + n[1] * gr; z += p[2] + n[2] * gr;
  }
  const k = thetas.length;
  return [x / k, y / k + 0.006, z / k];
}

// cortina de pelo largo (dos caras) desde el borde de la capa hacia los hombros
function cortina(m, { yMin, grosor, lod, largoAtras = 1.37, largoLados = 1.44 }) {
  const n = [16, 8, 5][lod];
  const thetas = Array.from({ length: n + 1 }, (_, i) => 0.95 + ((Math.PI * 2 - 1.9) * i) / n);
  const pasos = [[0, 0.25, 0.5, 0.75, 1], [0, 0.5, 1], [0, 1]][lod];
  for (const lado of [0, 1]) {
    const grilla = thetas.map((t) => {
      const a = Math.abs(envolver(t));
      const y0 = yMin(a);
      const p0 = superficieCabeza(t, y0);
      const n0 = normalCraneo(p0);
      const gr = grosor(a, y0) + (lado ? 0 : 0.004);
      const base = [p0[0] + n0[0] * gr, p0[1] + n0[1] * gr, p0[2] + n0[2] * gr];
      const yFin = interp(a, [[0.95, largoLados + 0.04], [1.9, largoLados], [Math.PI, largoAtras]]);
      return pasos.map((f) => {
        const y = mezclar(y0, yFin, f);
        const abre = 1 + 0.16 * f;
        const atras = a > 1.6 ? -0.026 * f * paso(1.6, 2.6, a) : 0;
        const x = base[0] * abre, z = (base[2] + 0.006) * abre - 0.006 + atras;
        const hueso = [HUESO.cabeza, HUESO.pecho, paso(1.5, 1.39, y) * 0.85];
        return m.v(x, y, z, { hueso, region: REGION.pelo });
      });
    });
    const tris = [];
    for (let i = 0; i < thetas.length - 1; i++) for (let k = 0; k < pasos.length - 1; k++) {
      const a = grilla[i][k], b = grilla[i + 1][k], c = grilla[i + 1][k + 1], d = grilla[i][k + 1];
      tris.push([a, b, c], [a, c, d]);
    }
    m.parte(tris, lado === 1, [0, 1.48, -0.01]);
  }
}

const LINEA_CORTO = [[0, 1.652], [0.45, 1.655], [0.75, 1.622], [0.95, 1.582], [1.15, 1.6], [1.45, 1.618], [1.9, 1.6], [2.5, 1.532], [Math.PI, 1.516]];
const LINEA_MEDIO = [[0, 1.648], [0.45, 1.652], [0.8, 1.6], [1.1, 1.56], [1.5, 1.552], [2.2, 1.5], [Math.PI, 1.486]];
const LINEA_RECOGIDO = [[0, 1.65], [0.45, 1.654], [0.8, 1.61], [1.1, 1.585], [1.5, 1.6], [2.2, 1.55], [Math.PI, 1.535]];

export function geometriaPelo(estilo, lod = 0) {
  const m = new Malla();
  const L = (puntos) => (a) => interp(a, puntos);
  switch (estilo) {
    case 'corto': capa(m, { yMin: L(LINEA_CORTO), grosor: (a, y) => 0.007 + 0.009 * paso(1.62, 1.7, y) * (a < 1.6 ? 1 : 0.6), lod }); break;
    case 'rapado': capa(m, { yMin: L(LINEA_CORTO), grosor: () => 0.0035, lod }); break;
    case 'medio': capa(m, { yMin: L(LINEA_MEDIO), grosor: (a, y) => 0.014 + 0.008 * paso(1.62, 1.7, y), lod }); break;
    case 'largo':
      capa(m, { yMin: L(LINEA_MEDIO), grosor: (a, y) => 0.012 + 0.006 * paso(1.62, 1.7, y), lod });
      cortina(m, { yMin: L(LINEA_MEDIO), grosor: (a, y) => 0.012 + 0.006 * paso(1.62, 1.7, y), lod });
      break;
    case 'cola':
      capa(m, { yMin: L(LINEA_RECOGIDO), grosor: () => 0.008, lod });
      tuboCamino(m, {
        camino: [[0, 1.66, -0.1], [0, 1.632, -0.121], [0, 1.585, -0.132], [0, 1.535, -0.13], [0, 1.49, -0.12], [0, 1.462, -0.112]],
        radio: (i) => [0.022, 0.026, 0.023, 0.018, 0.012, 0.004][i], segs: [8, 5, 4][lod],
        info: (i) => ({ hueso: [HUESO.cabeza, HUESO.pecho, i >= 3 ? 0.35 : 0], region: REGION.pelo }),
      });
      break;
    case 'mono':
      capa(m, { yMin: L(LINEA_RECOGIDO), grosor: () => 0.008, lod });
      elipsoide(m, { c: [0, 1.69, -0.084], r: [0.04, 0.034, 0.036], lat: [6, 4, 3][lod], lon: [10, 6, 5][lod], info: { hueso: [HUESO.cabeza, HUESO.cabeza, 0], region: REGION.pelo } });
      break;
    case 'rizado': capa(m, { yMin: L(LINEA_MEDIO), grosor: (a, y) => 0.024 + 0.012 * paso(1.6, 1.7, y), lod, ruido: 0.22 }); break;
    case 'calvo': capa(m, { yMin: L(LINEA_CORTO), yMax: (a) => (a < 2.3 ? 1.638 : 1.66), grosor: () => 0.005, lod }); break;
    case 'gorra':
      capa(m, { yMin: L([[0, 1.632], [1.2, 1.622], [Math.PI, 1.6]]), grosor: (a, y) => 0.011 + 0.006 * paso(1.66, 1.7, y), region: REGION.gorra, lod });
      // visera
      for (const cara of [0, 1]) {
        const n = [10, 6, 3][lod];
        const filas = [];
        for (let i = 0; i <= n; i++) {
          const t = -0.68 + (1.36 * i) / n;
          const p0 = superficieCabeza(t, 1.632);
          const nx = Math.sin(t), nz = Math.cos(t);
          filas.push([0, 0.35, 0.7, 1].map((f) => {
            const sale = 0.012 + 0.066 * f * Math.cos(t * 0.7);
            return m.v(p0[0] + nx * sale, 1.633 - 0.012 * f + (cara ? 0 : 0.004), p0[2] + nz * sale, { hueso: [HUESO.cabeza, HUESO.cabeza, 0], region: REGION.gorra });
          }));
        }
        const tris = [];
        for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
          const a = filas[i][k], b = filas[i + 1][k], c = filas[i + 1][k + 1], d = filas[i][k + 1];
          tris.push([a, b, c], [a, c, d]);
        }
        m.parte(tris, cara === 1, [0, 1.5, 0.05]);
      }
      // pelo corto que asoma por detrás
      capa(m, { yMin: L(LINEA_CORTO), yMax: (a) => (a > 1.2 ? 1.61 : 1.58), grosor: () => 0.006, lod });
      break;
    default: break;
  }
  return m.geometria();
}

// ------------------------------------------------------------------ accesorios
export function geometriaGafas() {
  const m = new Malla();
  const info = () => ({ hueso: [HUESO.cabeza, HUESO.cabeza, 0], region: REGION.gafas });
  for (const s of [1, -1]) {
    const c = [s * 0.031, 1.597, 0.106];
    const camino = [];
    for (let i = 0; i < 20; i++) {
      const f = (i / 20) * Math.PI * 2;
      const cs = Math.cos(f), sn = Math.sin(f);
      const kx = Math.sign(cs) * Math.abs(cs) ** 0.6, ky = Math.sign(sn) * Math.abs(sn) ** 0.6;
      camino.push([c[0] + kx * 0.022, c[1] + ky * 0.0155, c[2] - 0.004 * kx * kx * s * Math.sign(cs) * 0]);
    }
    tuboCamino(m, { camino, radio: 0.0019, segs: 4, info, anillo: true, normalRef: () => [0, 0, 1] });
    tuboCamino(m, { camino: [[s * 0.053, 1.601, 0.1], [s * 0.071, 1.6, 0.068], [s * 0.078, 1.598, 0.02], [s * 0.078, 1.594, -0.004], [s * 0.074, 1.584, -0.016]], radio: 0.0016, segs: 4, info });
  }
  tuboCamino(m, { camino: [[-0.0095, 1.6, 0.107], [0, 1.604, 0.111], [0.0095, 1.6, 0.107]], radio: 0.0017, segs: 4, info });
  return m.geometria();
}

export function geometriaMochila(lod = 0) {
  const m = new Malla();
  const h = [HUESO.pecho, HUESO.pecho, 0];
  const info = () => ({ hueso: h, region: REGION.mochila, pliegue: 0.25 });
  const filas = [[0.975, 0.115, 0.055], [0.99, 0.14, 0.068], [1.06, 0.15, 0.075], [1.2, 0.152, 0.078], [1.32, 0.145, 0.074], [1.365, 0.125, 0.064], [1.38, 0.095, 0.048]];
  tubo(m, {
    filas: lod === 0 ? filas : filas.filter((_, i) => i % 2 === 0), thetas: uniforme(lod === 0 ? 12 : 8),
    punto: (f, t) => { const [y, hw, hd] = f; const [x, z] = se(t, hw, hd, 4); return [x, y, z - 0.19]; },
    info, tapaInicio: { p: [0, 0.972, -0.19], info: info() }, tapaFin: { p: [0, 1.384, -0.19], info: info() }, centro: [0, 1.18, -0.19],
  });
  if (lod === 0) {
    tubo(m, {
      filas: [[1.0, 0.085, 0.018], [1.02, 0.1, 0.026], [1.15, 0.1, 0.026], [1.17, 0.085, 0.018]], thetas: uniforme(10),
      punto: (f, t) => { const [y, hw, hd] = f; const [x, z] = se(t, hw, hd, 4); return [x, y, z - 0.262]; },
      info, centro: [0, 1.085, -0.262],
    });
    for (const s of [1, -1]) {
      tuboCamino(m, {
        camino: [[s * 0.085, 1.395, -0.075], [s * 0.103, 1.428, -0.005], [s * 0.11, 1.362, 0.096], [s * 0.115, 1.24, 0.12], [s * 0.125, 1.12, 0.11], [s * 0.142, 1.03, 0.06], [s * 0.142, 0.995, -0.06], [s * 0.115, 0.99, -0.12]],
        radio: 0.0045, ancho: 0.021, segs: 6, info,
        normalRef: (p) => { const l = Math.hypot(p[0], p[2] + 0.01) || 1; return [p[0] / l, 0, (p[2] + 0.01) / l]; },
      });
    }
  }
  return m.geometria();
}

// Cápsula simple para elegir con el rayo (no se dibuja)
export function geometriaSeleccion() {
  const g2 = new THREE.CapsuleGeometry(0.21, 1.22, 2, 6);
  g2.translate(0, 0.86, 0);
  return g2;
}

// Celular en la mano derecha (sigue al antebrazo −x) y libro entre las manos (sigue al pecho)
export function geometriaCelular() {
  const m = new Malla();
  const h = [HUESO.antebrazoN, HUESO.antebrazoN, 0];
  tubo(m, {
    filas: [-0.072, -0.068, 0.068, 0.072], thetas: [0.4, 1.17, 1.97, 2.74, 3.54, 4.31, 5.11, 5.88],
    punto: (f, t) => { const k = Math.abs(f) > 0.07 ? 0.85 : 1; return [-0.204 + Math.cos(t) * 0.0048 * k, 0.738 + f, 0.012 + Math.sin(t) * 0.036 * k]; },
    info: () => ({ hueso: h, region: REGION.gafas }), centro: [-0.204, 0.738, 0.012],
    tapaInicio: { p: [-0.204, 0.666, 0.012], info: { hueso: h, region: REGION.gafas } }, tapaFin: { p: [-0.204, 0.81, 0.012], info: { hueso: h, region: REGION.gafas } },
  });
  return m.geometria();
}

export function geometriaLibro() {
  const m = new Malla();
  const h = [HUESO.pecho, HUESO.pecho, 0];
  // caja inclinada hacia la cara: 17 × 23 × 2,4 cm, en el lugar donde quedan las manos al leer
  const c = [0, 1.16, 0.315], ang = 0.95;
  const rot = (x, y, z) => { const cs = Math.cos(ang), sn = Math.sin(ang); return [c[0] + x, c[1] + y * cs - z * sn, c[2] + y * sn + z * cs]; };
  const filas = [-0.115, -0.11, 0.11, 0.115];
  tubo(m, {
    filas, thetas: [0.5, 1.07, 2.07, 2.64, 3.64, 4.21, 5.21, 5.78],
    punto: (f, t) => { const k = Math.abs(f) > 0.112 ? 0.9 : 1; const x = Math.sign(Math.cos(t)) * Math.min(1, Math.abs(Math.cos(t)) * 1.6) * 0.085 * k; const z = Math.sign(Math.sin(t)) * Math.min(1, Math.abs(Math.sin(t)) * 1.6) * 0.012 * k; return rot(x, f, z); },
    info: () => ({ hueso: h, region: REGION.gorra, pliegue: 0.1 }), centro: c,
    tapaInicio: { p: rot(0, -0.116, 0), info: { hueso: h, region: REGION.gorra } }, tapaFin: { p: rot(0, 0.116, 0), info: { hueso: h, region: REGION.gorra } },
  });
  return m.geometria();
}
