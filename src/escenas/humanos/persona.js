// Aspecto de cada persona a partir de una semilla: edad, sexo, altura, complexión, tono de piel,
// peinado, ropa y accesorios. La misma semilla siempre da la misma persona (así quien se sienta y
// luego se levanta conserva su aspecto).

export const PEINADOS = ['corto', 'rapado', 'medio', 'largo', 'cola', 'mono', 'rizado', 'calvo', 'gorra'];

// Paletas (sRGB). Tonos de piel diversos, con más peso en los intermedios.
const PIEL = [[0xf1d3bc, 3], [0xe8bf9f, 6], [0xdcae8a, 10], [0xd09c78, 14], [0xc18a65, 16], [0xb07a56, 15], [0x9c6848, 12], [0x87573b, 9], [0x704630, 6], [0x5a3825, 4]];
const PELO = [[0x15110e, 44], [0x2a1c13, 30], [0x4a3020, 12], [0x6b4a2f, 5], [0x7c2b1c, 3], [0xb48f55, 2], [0x2f3f78, 1], [0x3a1f2e, 1]];
const PELO_MAYOR = [[0x8f8b86, 3], [0xb9b5ae, 3], [0x5d564f, 2], [0x1d1813, 1]];
const SUPERIOR = [0xe9e6df, 0xb9bcc0, 0x8d9196, 0x3c3f44, 0x1d1e21, 0x22304f, 0x2f4d8c, 0x7fa6c9, 0x5b6136, 0x2f4a37, 0x6e2430, 0xa3312f, 0xc99a2e, 0xc9b79a, 0xa8794b, 0xd27a62, 0x9a8cb8, 0x2f6f73, 0xd79aa8, 0x5c4033, 0xf2efe6, 0x44546a];
const INTERIOR = [0xf2f0ea, 0xe8e4da, 0x1f2124, 0x8d9196, 0xc9d6e3, 0xe9dfc9];
const VAQUERO = [0x27344f, 0x3f5a85, 0x7a93b8, 0x24262b, 0x34466b];
const PANTALON = [0xa89470, 0x1f2023, 0x5a5d63, 0x2b3550, 0x5b5b3d, 0x5b4636, 0x3a3d42];
const FALDA = [0x1f2023, 0x22304f, 0xc9b79a, 0x6e2430, 0x3f5a85, 0x5a5d63];
const ZAPATO = [[0xecebe7, 8], [0x1b1b1d, 6], [0x7c8086, 3], [0x5a3d27, 3], [0x253150, 2], [0xcbb89a, 2]];
const MOCHILA = [0x1b1c1f, 0x22304f, 0x55595f, 0x4b5232, 0x5c1f2a, 0x6e93b8, 0xb9a786, 0x9e2b25, 0x2f6f73];
const MEDIAS = [0x1b1b1d, 0x2b2b30, 0xd9b9a0];

function generador(semilla) {
  let a = (semilla >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const elegir = (r, lista) => lista[Math.floor(r() * lista.length) % lista.length];
function ponderado(r, lista) {
  let total = 0;
  for (const [, p] of lista) total += p;
  let x = r() * total;
  for (const [v, p] of lista) { x -= p; if (x <= 0) return v; }
  return lista[lista.length - 1][0];
}
const normal = (r) => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
// un poco de variación en el color (para que dos prendas "iguales" no sean idénticas)
function variar(r, hex, k = 0.06) {
  const f = 1 + (r() - 0.5) * 2 * k;
  const c = (s) => limitar(Math.round(((hex >> s) & 255) * f), 0, 255);
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

const cache = new Map();

export function persona(semilla) {
  let p = cache.get(semilla);
  if (p) return p;
  const r = generador(semilla * 2654435761);
  const fem = r() < 0.52;
  const u = r();
  const edad = u < 0.8 ? 0 : u < 0.95 ? 1 : 2;            // 0 universitario · 1 adulto · 2 mayor
  const altura = limitar((fem ? 1.575 : 1.695) + normal(r) * (fem ? 0.055 : 0.065) - (edad === 2 ? 0.02 : 0), 1.46, 1.93);
  const build = limitar(0.38 + normal(r) * 0.16 + (edad > 0 ? 0.12 : 0), 0.05, 1);
  // peinado (cada uno con su probabilidad según sexo y edad)
  let peinado;
  const x = r();
  if (fem) peinado = x < 0.36 ? 'largo' : x < 0.58 ? 'cola' : x < 0.70 ? 'mono' : x < 0.82 ? 'medio' : x < 0.92 ? 'rizado' : x < 0.96 ? 'corto' : 'gorra';
  else if (edad === 2) peinado = x < 0.45 ? 'calvo' : x < 0.85 ? 'corto' : 'rapado';
  else peinado = x < 0.42 ? 'corto' : x < 0.62 ? 'rapado' : x < 0.76 ? 'medio' : x < 0.86 ? 'rizado' : x < 0.93 ? 'gorra' : x < 0.97 ? 'largo' : 'cola';
  // ropa: parte de arriba
  const t = r();
  const tipoSup = t < 0.34 ? 'polo' : t < 0.50 ? 'mangaLarga' : t < 0.68 ? 'polera' : t < 0.82 ? 'casaca' : 'camisa';
  const sup = variar(r, elegir(r, SUPERIOR));
  const manga = tipoSup === 'polo' ? 0 : 1;
  const capucha = tipoSup === 'polera' && r() < 0.8 ? 1 : 0;
  let patron = 0;
  if (tipoSup === 'camisa') patron = r() < 0.5 ? 2 : r() < 0.5 ? 1 : 0;   // cuadros, rayas o lisa
  else if (tipoSup === 'casaca') patron = 3;                              // abierta, con polo debajo
  else if (tipoSup === 'polo' && r() < 0.18) patron = 1;
  const sup2 = patron === 3 ? variar(r, elegir(r, INTERIOR)) : variar(r, elegir(r, SUPERIOR), 0.1);
  // parte de abajo
  const b = r();
  const piernaTipo = fem && b < 0.17 ? 2 : b > 0.94 ? 1 : 0;              // 0 pantalón · 1 short · 2 falda
  const denim = piernaTipo !== 2 && r() < 0.62;
  const inf = piernaTipo === 2 ? variar(r, elegir(r, FALDA)) : denim ? variar(r, elegir(r, VAQUERO), 0.05) : variar(r, elegir(r, PANTALON));
  const medias = piernaTipo === 2 && r() < 0.6 ? elegir(r, MEDIAS) : -1;
  const zapato = ponderado(r, ZAPATO);
  // piel, pelo y rostro
  const piel = variar(r, ponderado(r, PIEL), 0.04);
  const pelo = edad === 2 && r() < 0.8 ? ponderado(r, PELO_MAYOR) : edad === 1 && r() < 0.25 ? ponderado(r, PELO_MAYOR) : ponderado(r, PELO);
  const barba = fem ? 0 : r() < (edad > 0 ? 0.5 : 0.3) ? (r() < 0.4 ? 1 : 0.45) : 0;
  const gafas = r() < (edad === 2 ? 0.6 : edad === 1 ? 0.35 : 0.24);
  const gafasColor = elegir(r, [0x101114, 0x3b2516, 0x8a8f96, 0x1f2c4a]);
  const mochila = r() < 0.6 ? variar(r, elegir(r, MOCHILA)) : -1;
  const accesorio = peinado === 'gorra' ? variar(r, elegir(r, SUPERIOR)) : mochila;
  const expresionBase = r() < 0.45 ? 0 : r() < 0.55 ? 1 : 2;
  p = {
    semilla, fem: fem ? 0.8 + r() * 0.2 : r() * 0.12, edad, altura, escala: altura / 1.7, build,
    peinado, estilo: PEINADOS.indexOf(peinado), tipoSup, manga, capucha, patron, piernaTipo, telaInf: denim ? 1 : 0,
    piel, pelo, sup, sup2, inf, zapato, medias: medias < 0 ? piel : medias, mochila, gafas, gafasColor, accesorio, barba,
    expresionBase, amable: r() < 0.6,
    // forma de moverse
    cadencia: 0.92 + r() * 0.16 - (edad === 2 ? 0.08 : 0), encorvado: edad === 2 ? 0.12 : r() * 0.04,
    lleva: r() < 0.18 ? 'celular' : r() < 0.25 ? 'tirantes' : 'nada',
    pies: r(), zurdo: r() < 0.12,
  };
  cache.set(semilla, p);
  if (cache.size > 4000) cache.delete(cache.keys().next().value);
  return p;
}

// Color hex → número empaquetado para el shader (r·65536 + g·256 + b: exacto en float32)
export const empacar = (hex) => hex;
