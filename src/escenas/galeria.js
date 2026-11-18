// Galería del Pabellón C de la Universidad del Pacífico: el pasillo techado por el que se llega a la
// Biblioteca «Jorge Basadre Grohmann» (primer piso del Pabellón C). Modelada a partir de fotos:
//   · piso de porcelanato blanco brillante (60 × 60 cm)
//   · fila de columnas redondas de concreto caravista, con los agujeros del encofrado
//   · marquesina gris sobre la entrada, con jardinera y arbustos encima (patio de luz arriba)
//   · techo alto con vigas y borde terracota; lámparas de campana colgando en fila
//   · ala de enfrente: aula con vidrio (franja esmerilada y repisa de madera), maceteros con
//     lengua de suegra, pisos altos con ventanas de franjas; dos pasajes al campus
//   · muro del fondo con cajeros automáticos (sin marcas), extintor, salida y tótem de autoservicio
//   · vitrina de la biblioteca: vidrio con franja esmerilada, muro gráfico «BIBLIOTECA · Jorge Basadre
//     Grohmann», pilar con «HORARIO DE ATENCIÓN» y «AFORO 381 PERSONAS», señal de accesibilidad,
//     banner enrollable de préstamo de vacaciones, tacho de reciclaje de papel y tachos de acero
// La vitrina es la fachada del piso 1 (this.frente): en la casa de muñecas se levanta con él para dejar ver el sótano.
// Todo lo repetido va por instancias o fusionado por material (fluido en el Meta Quest).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLANO } from '../biblioteca/plano.js';
import * as TX from '../motor/texturas.js';
import { FUENTE, rectRedondo } from '../motor/textos.js';

const G = PLANO.galeria;
const Z1 = PLANO.z1, ZC = G.zColumnas, ZA = G.z1, X0 = G.x0, X1 = G.x1;
const HT = G.alturaTecho, HM = G.alturaMarquesina, H = PLANO.alturaPiso;
const PROF = G.profundidadAla;
const XP = (PLANO.puertas.entrada.x0 + PLANO.puertas.entrada.x1) / 2;

export const caja = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
// caja por sus límites
export const cajaL = (x0, x1, y0, y1, z0, z1) => caja(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
export const fusionar = (lista, mat) => new THREE.Mesh(mergeGeometries(lista), mat);

export function lienzoTex(w, h, dibujar, repetir = false) {
  const c = TX.lienzo(w, h);
  dibujar(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repetir) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Cartel plano (ancho × alto en metros) dibujado en un lienzo; mira hacia +z
export function cartel(w, h, px, dibujar, { brillo = false, doble = false } = {}) {
  const t = lienzoTex(px, Math.round((px * h) / w), dibujar);
  const mat = brillo ? new THREE.MeshBasicMaterial({ map: t }) : new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 });
  if (doble) mat.side = THREE.DoubleSide;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

export const texto = (ctx, t, x, y, { tam = 40, peso = 700, color = '#fff', alinear = 'center', max = undefined } = {}) => {
  ctx.font = `${peso} ${tam}px ${FUENTE}`; ctx.fillStyle = color; ctx.textAlign = alinear; ctx.textBaseline = 'middle';
  ctx.fillText(t, x, y, max);
};

// ---------------------------------------------------------------- texturas
function texPorcelanato() {
  return lienzoTex(1024, 1024, (ctx, w) => {
    const n = 4, p = w / n, r = TX.azar(31);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const k = 237 + Math.round((r() - 0.5) * 7);
      ctx.fillStyle = `rgb(${k},${k - 1},${k - 4})`;
      ctx.fillRect(i * p, j * p, p, p);
      for (let m = 0; m < 10; m++) {
        ctx.strokeStyle = `rgba(140,140,138,${r() * 0.045})`; ctx.lineWidth = 1 + r() * 3;
        const y = j * p + r() * p;
        ctx.beginPath(); ctx.moveTo(i * p, y);
        ctx.bezierCurveTo(i * p + p * 0.3, y + (r() - 0.5) * 50, i * p + p * 0.7, y + (r() - 0.5) * 50, i * p + p, y + (r() - 0.5) * 30);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = '#c4c1ba'; ctx.lineWidth = 3;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo(i * p, 0); ctx.lineTo(i * p, w); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * p); ctx.lineTo(w, i * p); ctx.stroke();
    }
  }, true);
}

// Concreto caravista de las columnas: manchas suaves, juntas del encofrado y 4 hileras de agujeros
function texConcreto() {
  return lienzoTex(256, 1024, (ctx, w, h) => {
    const r = TX.azar(12);
    ctx.fillStyle = '#c3c2bd'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1100; i++) {
      const g = 168 + r() * 44;
      ctx.fillStyle = `rgba(${g | 0},${g | 0},${(g - 4) | 0},${0.06 + r() * 0.12})`;
      ctx.beginPath(); ctx.arc(r() * w, r() * h, 2 + r() * 12, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(110,110,106,0.16)'; ctx.lineWidth = 2;
    for (let k = 1; k < 6; k++) { ctx.beginPath(); ctx.moveTo(0, (k * h) / 6); ctx.lineTo(w, (k * h) / 6); ctx.stroke(); }
    ctx.fillStyle = '#3a3a38';
    for (let a = 0; a < 4; a++) for (let k = 0; k < 15; k++) { ctx.beginPath(); ctx.arc(((a + 0.5) * w) / 4, ((k + 0.5) * h) / 15, 3, 0, Math.PI * 2); ctx.fill(); }
  });
}

// Paneles grises con canales horizontales (muro del fondo, junto a los cajeros)
function texPanelGris() {
  return lienzoTex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#a7a9a8'; ctx.fillRect(0, 0, w, h);
    const r = TX.azar(5);
    for (let i = 0; i < 300; i++) { ctx.fillStyle = `rgba(255,255,255,${r() * 0.04})`; ctx.fillRect(r() * w, r() * h, 3 + r() * 8, 3 + r() * 8); }
    ctx.fillStyle = 'rgba(70,72,72,0.55)';
    for (let k = 0; k < 4; k++) ctx.fillRect(0, (k * h) / 4, w, 4);
  }, true);
}

// Ventanas de los pisos altos del ala de enfrente: vidrio con franjas esmeriladas horizontales
function texFranjas() {
  return lienzoTex(256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#93b0ac'); g.addColorStop(1, '#6f8c89');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 8; k++) { ctx.fillStyle = 'rgba(220,236,231,0.72)'; ctx.fillRect(0, (k * h) / 8 + 5, w, h / 8 - 13); }
  }, true);
}

// Franja esmerilada del vidrio (con líneas más oscuras, como en el aula de enfrente)
function texEsmerilado() {
  return lienzoTex(64, 256, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(236,240,242,0.88)'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(120,130,138,0.55)';
    for (const y of [0.18, 0.5, 0.82]) ctx.fillRect(0, y * h, w, 7);
  }, true);
}

// ---------------------------------------------------------------- carteles
function dibujarHorario(ctx, w, h) {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1f3a6d'; ctx.fillRect(0, 0, w, h * 0.36);
  texto(ctx, 'HORARIO DE', w / 2, h * 0.11, { tam: w * 0.13, peso: 800 });
  texto(ctx, 'ATENCIÓN', w / 2, h * 0.25, { tam: w * 0.15, peso: 800 });
  const l = (t, y, peso = 600, col = '#1e293b') => texto(ctx, t, w / 2, y, { tam: w * 0.085, peso, color: col });
  l('Lunes a viernes', h * 0.47, 700);
  l('7:30 a 22:00', h * 0.58);
  l('Sábados', h * 0.72, 700);
  l('8:00 a 20:00', h * 0.83);
  ctx.strokeStyle = '#1f3a6d'; ctx.lineWidth = w * 0.02; ctx.strokeRect(0, 0, w, h);
}

function dibujarAforo(ctx, w, h) {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#111827'; ctx.lineWidth = w * 0.025; ctx.strokeRect(w * 0.03, h * 0.04, w * 0.94, h * 0.92);
  // icono de personas
  ctx.fillStyle = '#111827';
  for (const [x, s] of [[0.15, 1], [0.24, 0.85]]) {
    ctx.beginPath(); ctx.arc(w * x, h * 0.3, h * 0.07 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * x, h * 0.5, h * 0.09 * s, h * 0.13 * s, 0, Math.PI, 0); ctx.fill();
  }
  texto(ctx, 'AFORO', w * 0.62, h * 0.3, { tam: h * 0.24, peso: 900, color: '#111827' });
  texto(ctx, 'CAPACIDAD MÁXIMA', w * 0.62, h * 0.5, { tam: h * 0.08, peso: 700, color: '#374151' });
  ctx.fillStyle = '#111827'; ctx.fillRect(w * 0.08, h * 0.62, w * 0.3, h * 0.28);
  texto(ctx, '381', w * 0.23, h * 0.77, { tam: h * 0.24, peso: 900, color: '#ffffff' });
  texto(ctx, 'PERSONAS', w * 0.67, h * 0.77, { tam: h * 0.17, peso: 900, color: '#111827' });
}

function dibujarAccesible(ctx, w, h) {
  ctx.fillStyle = '#1d4ed8'; rectRedondo(ctx, 0, 0, w, h, w * 0.08); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = w * 0.07; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(w * 0.47, h * 0.2, w * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(w * 0.45, h * 0.32); ctx.lineTo(w * 0.45, h * 0.58); ctx.lineTo(w * 0.68, h * 0.58); ctx.lineTo(w * 0.76, h * 0.8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w * 0.45, h * 0.44); ctx.lineTo(w * 0.64, h * 0.44); ctx.stroke();
  ctx.lineWidth = w * 0.06;
  ctx.beginPath(); ctx.arc(w * 0.44, h * 0.66, w * 0.2, -0.2 * Math.PI, 1.05 * Math.PI); ctx.stroke();
}

// Muro gráfico junto a la entrada: panel azul y pared blanca con el nombre de la biblioteca
function dibujarMuro(ctx, w, h) {
  const k = w / 5.2;                                       // píxeles por metro
  ctx.fillStyle = '#f4f5f4'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#23409a'; ctx.fillRect(0, 0, 1.7 * k, h);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; for (const x of [0.45, 0.95, 1.4]) ctx.fillRect(x * k, 0.4 * k, 4, h - 0.8 * k);
  ctx.fillStyle = '#e2e8f0'; ctx.fillRect(0.35 * k, h * 0.42, 0.55 * k, 0.16 * k);
  ctx.fillStyle = '#1f3a6d'; ctx.fillRect(2.35 * k, h * 0.2, 0.07 * k, 0.75 * k);
  texto(ctx, 'BIBLIOTECA', 2.55 * k, h * 0.26, { tam: 0.36 * k, peso: 900, color: '#1f3a6d', alinear: 'left' });
  ctx.fillStyle = '#9cc9e6'; ctx.fillRect(2.55 * k, h * 0.34, 2.05 * k, 0.26 * k);
  texto(ctx, 'Jorge Basadre', 2.65 * k, h * 0.34 + 0.13 * k, { tam: 0.19 * k, peso: 800, color: '#1f3a6d', alinear: 'left' });
  ctx.fillStyle = '#9cc9e6'; ctx.fillRect(2.55 * k, h * 0.34 + 0.3 * k, 1.45 * k, 0.26 * k);
  texto(ctx, 'Grohmann', 2.65 * k, h * 0.34 + 0.43 * k, { tam: 0.19 * k, peso: 800, color: '#1f3a6d', alinear: 'left' });
  ctx.fillStyle = '#23409a'; ctx.fillRect(2.4 * k, h * 0.74, 1.15 * k, 0.12 * k);
  texto(ctx, 'Primer piso · Pabellón C', 2.45 * k, h * 0.74 + 0.06 * k, { tam: 0.07 * k, peso: 600, color: '#e0e7ff', alinear: 'left' });
  // zócalo
  ctx.fillStyle = '#c9cbcb'; ctx.fillRect(1.7 * k, h - 0.12 * k, w, 0.12 * k);
}

// Banner enrollable de la biblioteca (préstamo de vacaciones)
function dibujarBanner(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.62);
  g.addColorStop(0, '#1a2b66'); g.addColorStop(1, '#22408f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h * 0.62);
  texto(ctx, 'UNIVERSIDAD DEL PACÍFICO', w / 2, h * 0.05, { tam: w * 0.055, peso: 700, color: '#c7d2fe' });
  texto(ctx, 'Llévate libros', w / 2, h * 0.15, { tam: w * 0.11, peso: 500, color: '#ffffff' });
  texto(ctx, 'en vacaciones', w / 2, h * 0.22, { tam: w * 0.13, peso: 800, color: '#ffffff' });
  const l = (t, y) => texto(ctx, t, w / 2, y, { tam: w * 0.062, peso: 600, color: '#e0e7ff', max: w * 0.86 });
  l('Hasta 3 libros de la', h * 0.32);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(w * 0.24, h * 0.355, w * 0.52, h * 0.04);
  texto(ctx, 'Biblioteca UP', w / 2, h * 0.375, { tam: w * 0.062, peso: 800, color: '#1a2b66' });
  l('durante las vacaciones;', h * 0.43);
  l('devuélvelos el próximo ciclo', h * 0.48);
  ctx.fillStyle = '#16245a'; ctx.fillRect(0, h * 0.55, w, h * 0.07);
  texto(ctx, 'Biblioteca UP · Pabellón C, 1.er piso', w / 2, h * 0.585, { tam: w * 0.05, peso: 600, color: '#c7d2fe' });
  // ilustración: cielo celeste, globo y libros
  const g2 = ctx.createLinearGradient(0, h * 0.62, 0, h);
  g2.addColorStop(0, '#9fd6ef'); g2.addColorStop(1, '#5ab7de');
  ctx.fillStyle = g2; ctx.fillRect(0, h * 0.62, w, h * 0.38);
  ctx.fillStyle = '#86c66c'; ctx.beginPath(); ctx.arc(w * 0.5, h * 0.74, w * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4aa3d8'; ctx.beginPath(); ctx.arc(w * 0.45, h * 0.72, w * 0.07, 0, Math.PI * 2); ctx.fill();
  const libros = [['#e4572e', 0.34], ['#f3a712', 0.4], ['#2e86ab', 0.46], ['#a23b72', 0.52]];
  libros.forEach(([c, y], i) => { ctx.fillStyle = c; ctx.fillRect(w * (0.26 + i * 0.015), h * (0.8 + i * 0.035), w * 0.42, h * 0.032); });
  ctx.fillStyle = '#ffffff'; ctx.fillRect(w * 0.08, h * 0.9, w * 0.84, h * 0.02);
}

function dibujarPapel(ctx, w, h) {
  ctx.fillStyle = '#fbfaf5'; ctx.fillRect(0, 0, w, h);
  texto(ctx, 'Recicla', w / 2, h * 0.12, { tam: w * 0.16, peso: 800, color: '#15803d' });
  texto(ctx, 'tu papel', w / 2, h * 0.26, { tam: w * 0.16, peso: 800, color: '#15803d' });
  ctx.fillStyle = '#dcfce7'; ctx.fillRect(w * 0.1, h * 0.36, w * 0.8, h * 0.36);
  for (let i = 0; i < 5; i++) { ctx.fillStyle = '#86efac'; ctx.fillRect(w * 0.16, h * (0.41 + i * 0.06), w * (0.5 + (i % 2) * 0.15), h * 0.025); }
  ctx.fillStyle = '#166534'; ctx.fillRect(0, h * 0.82, w, h * 0.18);
  texto(ctx, '♻ Papel', w / 2, h * 0.91, { tam: w * 0.14, peso: 800, color: '#ffffff' });
}

function dibujarAvisoVerde(ctx, w, h) {
  ctx.fillStyle = '#16a34a'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#dcfce7'; ctx.fillRect(w * 0.08, h * 0.1, w * 0.84, h * 0.5);
  texto(ctx, '¡Atención!', w / 2, h * 0.22, { tam: w * 0.13, peso: 800, color: '#14532d' });
  texto(ctx, 'Aquí no se deja', w / 2, h * 0.38, { tam: w * 0.1, peso: 700, color: '#14532d' });
  texto(ctx, 'basura', w / 2, h * 0.5, { tam: w * 0.1, peso: 700, color: '#14532d' });
  texto(ctx, 'Usa los tachos', w / 2, h * 0.74, { tam: w * 0.1, peso: 600, color: '#ffffff' });
  texto(ctx, 'de la galería', w / 2, h * 0.86, { tam: w * 0.1, peso: 600, color: '#ffffff' });
}

function dibujarCajero(color) {
  return (ctx, w, h) => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, h * 0.75, w, h * 0.25);
    texto(ctx, 'CAJERO', w / 2, h * 0.42, { tam: h * 0.32, peso: 900 });
    texto(ctx, 'automático', w / 2, h * 0.86, { tam: h * 0.16, peso: 600 });
  };
}

function dibujarSalida(ctx, w, h) {
  ctx.fillStyle = '#16a34a'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(w * 0.2, h * 0.28, h * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = h * 0.09; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(w * 0.19, h * 0.42); ctx.lineTo(w * 0.15, h * 0.62); ctx.lineTo(w * 0.08, h * 0.82); ctx.moveTo(w * 0.15, h * 0.62); ctx.lineTo(w * 0.26, h * 0.82); ctx.moveTo(w * 0.1, h * 0.48); ctx.lineTo(w * 0.28, h * 0.5); ctx.stroke();
  texto(ctx, 'SALIDA', w * 0.62, h * 0.52, { tam: h * 0.42, peso: 900 });
}

function dibujarTotem(ctx, w, h) {
  ctx.fillStyle = '#f8fafc'; rectRedondo(ctx, 0, 0, w, h, w * 0.18); ctx.fill();
  ctx.fillStyle = '#1e40af'; rectRedondo(ctx, w * 0.1, h * 0.1, w * 0.8, h * 0.5, w * 0.06); ctx.fill();
  texto(ctx, 'Autoservicio', w / 2, h * 0.24, { tam: w * 0.11, peso: 800 });
  texto(ctx, 'Trámites UP', w / 2, h * 0.34, { tam: w * 0.085, peso: 500, color: '#c7d2fe' });
  ctx.fillStyle = '#93c5fd'; rectRedondo(ctx, w * 0.2, h * 0.43, w * 0.6, h * 0.08, w * 0.03); ctx.fill();
  ctx.fillStyle = '#334155'; rectRedondo(ctx, w * 0.3, h * 0.7, w * 0.4, h * 0.06, w * 0.02); ctx.fill();
}

// ---------------------------------------------------------------- piezas
// Campana de lámpara (perfil de revolución), con el borde inferior luminoso
function geoCampana() {
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const r = 0.035 + Math.sin(t * Math.PI * 0.5) ** 0.85 * 0.21;
    pts.push(new THREE.Vector2(r, 0.3 - t * 0.3));
  }
  return new THREE.LatheGeometry(pts, 18);
}

// Macetero trapezoidal gris con lengua de suegra (hojas como láminas verticales)
function geoMacetero() {
  const g = new THREE.CylinderGeometry(0.62, 0.5, 0.42, 4, 1);
  g.rotateY(Math.PI / 4);
  g.scale(1, 1, 0.42);
  g.translate(0, 0.21, 0);
  const borde = caja(0.92, 0.04, 0.42, 0, 0.43, 0);
  const base = caja(0.8, 0.05, 0.32, 0, 0.025, 0);
  return mergeGeometries([g.toNonIndexed(), borde.toNonIndexed(), base.toNonIndexed()]);
}

function geoHojas(semilla) {
  const r = TX.azar(semilla);
  const hojas = [];
  for (let i = 0; i < 9; i++) {
    const h = 0.45 + r() * 0.4;
    const g = new THREE.PlaneGeometry(0.07, h, 1, 3);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const y = p.getY(k) + h / 2; p.setX(k, p.getX(k) * (1 - (y / h) ** 2 * 0.8)); }
    g.translate(0, h / 2, 0);
    g.rotateZ((r() - 0.5) * 0.35);
    g.rotateY(r() * Math.PI);
    g.translate((r() - 0.5) * 0.55, 0.42, (r() - 0.5) * 0.18);
    hojas.push(g);
  }
  return mergeGeometries(hojas);
}

export class Galeria {
  constructor({ mat }) {
    this.mat = mat;
    this.grupo = new THREE.Group();
    this.grupo.name = 'galeria';
    this.techo = new THREE.Group();          // se oculta en las vistas desde arriba (techo alto, lámparas, marquesina…)
    this.frente = new THREE.Group();         // vitrina de la biblioteca: sube con el piso 1 en la casa de muñecas
    this.grupo.add(this.techo, this.frente);
    this.#materiales();
    this.#piso();
    this.#marquesina();
    this.#columnas();
    this.#techoAlto();
    this.#lamparas();
    this.#alaEnfrente();
    this.#fondo();
    this.#vecinos();
    this.#vitrina();
    this.#objetos();
  }

  #materiales() {
    const piso = texPorcelanato();
    piso.repeat.set((X1 + 10 - X0) / 2.4, (ZA - Z1) / 2.4);
    const conc = texConcreto();
    const panel = texPanelGris();
    const franjas = texFranjas();
    const esm = texEsmerilado();
    this.m = {
      porcelanato: new THREE.MeshStandardMaterial({ map: piso, color: 0xd4d4d0, roughness: 0.4, metalness: 0, envMapIntensity: 0.45 }),
      columna: new THREE.MeshStandardMaterial({ map: conc, roughness: 0.82 }),
      gris: new THREE.MeshStandardMaterial({ color: 0xb4b6b7, roughness: 0.9 }),
      grisClaro: new THREE.MeshStandardMaterial({ color: 0xd3d4d3, roughness: 0.92 }),
      blanco: new THREE.MeshStandardMaterial({ color: 0xeeeeeb, roughness: 0.9 }),
      terracota: new THREE.MeshStandardMaterial({ color: 0xa9512f, roughness: 0.85 }),
      panel: new THREE.MeshStandardMaterial({ map: panel, roughness: 0.85 }),
      franjas: new THREE.MeshStandardMaterial({ map: franjas, roughness: 0.25, metalness: 0.1, envMapIntensity: 1.2 }),
      esmerilado: new THREE.MeshStandardMaterial({ map: esm, transparent: true, roughness: 0.6, depthWrite: false, side: THREE.DoubleSide }),
      aluminio: new THREE.MeshStandardMaterial({ color: 0xc5c9ce, roughness: 0.35, metalness: 0.65 }),
      acero: new THREE.MeshStandardMaterial({ color: 0xbfc4c8, roughness: 0.3, metalness: 0.85 }),
      madera: new THREE.MeshStandardMaterial({ color: 0xb9946a, roughness: 0.55 }),
      macetero: new THREE.MeshStandardMaterial({ color: 0x9da2ab, roughness: 0.7 }),
      hoja: new THREE.MeshStandardMaterial({ color: 0x3d6b3a, roughness: 0.75, side: THREE.DoubleSide }),
      arbusto: new THREE.MeshStandardMaterial({ color: 0x4f7a3c, roughness: 0.95, flatShading: true }),
      tierra: new THREE.MeshStandardMaterial({ color: 0x4b3a2a, roughness: 1 }),
      tronco: new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 1 }),
      carton: new THREE.MeshStandardMaterial({ color: 0xb08a5b, roughness: 0.95 }),
      oscuro: new THREE.MeshStandardMaterial({ color: 0x1f2329, roughness: 0.5 }),
      luz: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.1, 2.05, 1.9) }),
      campana: new THREE.MeshStandardMaterial({ color: 0xf2eee6, roughness: 0.85, emissive: 0xfff1d6, emissiveIntensity: 0.32, side: THREE.DoubleSide }),
      foco: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.25, 1.9) }),
      cable: new THREE.MeshBasicMaterial({ color: 0x8c8f93 }),
    };
  }

  // ---------------------------------------------------------------- piso de porcelanato (y el de los pasajes)
  #piso() {
    const largo = X1 + 10 - X0, fondo = ZA - Z1;
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(largo, fondo), this.m.porcelanato);
    piso.rotation.x = -Math.PI / 2;
    piso.position.set(X0 + largo / 2, 0.004, Z1 + fondo / 2);
    piso.receiveShadow = true;
    const pasos = G.pasajes.map((p) => {
      const g = new THREE.PlaneGeometry(p.x1 - p.x0, PROF + 4);
      g.rotateX(-Math.PI / 2); g.translate((p.x0 + p.x1) / 2, 0.004, ZA + (PROF + 4) / 2);
      return g;
    });
    const pasajes = new THREE.Mesh(mergeGeometries(pasos), this.m.porcelanato);
    // vereda del campus fuera del extremo abierto
    this.grupo.add(piso, pasajes);
  }

  // ---------------------------------------------------------------- marquesina sobre la entrada, con jardinera
  #marquesina() {
    const z0 = Z1, z1 = ZC - 0.25, xm = PLANO.x1 + 0.35;
    const losa = cajaL(X0, xm, HM, HM + 0.22, z0, z1);
    const gris = fusionar([losa, cajaL(X0, xm, HM + 0.22, HM + 0.62, z1 - 0.55, z1), cajaL(xm - 0.3, xm, HM + 0.22, HM + 0.62, z0, z1)], this.m.gris);
    // cielo raso blanco y luminarias lineales debajo
    const cielo = new THREE.Mesh(new THREE.PlaneGeometry(xm - X0, z1 - z0), this.m.blanco);
    cielo.rotation.x = Math.PI / 2; cielo.position.set((X0 + xm) / 2, HM - 0.002, (z0 + z1) / 2);
    const luces = [];
    for (let x = X0 + 2; x < xm - 1; x += 4) luces.push(caja(1.25, 0.035, 0.1, x, HM - 0.03, Z1 + 1.55));
    const lineas = fusionar(luces, this.m.luz);
    // tierra y arbustos de la jardinera; algunos árboles pequeños en el patio de luz
    const tierra = new THREE.Mesh(cajaL(X0 + 0.1, xm - 0.35, HM + 0.6, HM + 0.62, z1 - 0.5, z1 - 0.05), this.m.tierra);
    const r = TX.azar(8);
    const arbustos = [];
    for (let x = X0 + 0.5; x < xm - 0.4; x += 0.45 + r() * 0.45) {
      const g = new THREE.IcosahedronGeometry(0.2 + r() * 0.14, 1);
      g.scale(1.2, 0.9 + r() * 0.5, 0.8);
      g.translate(x, HM + 0.85 + r() * 0.15, z1 - 0.28);
      arbustos.push(g);
    }
    const tallos = [], copas = [];
    for (const x of [-20.5, -14.2, -7.2, 13.4, 19.6]) {
      tallos.push(new THREE.CylinderGeometry(0.06, 0.09, 2.2, 6).translate(x, HM + 0.6 + 1.1, z1 - 0.28));
      const c = new THREE.IcosahedronGeometry(1.05, 1); c.scale(1, 1.25, 0.8); c.translate(x, HM + 2.9, z1 - 0.35);
      copas.push(c);
    }
    // (va con el techo: desde arriba no tapa a quienes llegan a las puertas)
    this.techo.add(gris, cielo, lineas, tierra, fusionar(arbustos, this.m.arbusto), fusionar(tallos, this.m.tronco), fusionar(copas, this.m.arbusto));
  }

  // ---------------------------------------------------------------- columnas redondas de concreto caravista
  #columnas() {
    const geo = new THREE.CylinderGeometry(G.radioColumna, G.radioColumna, HT, 32);
    const inst = new THREE.InstancedMesh(geo, this.m.columna, G.columnas.length);
    const m4 = new THREE.Matrix4();
    G.columnas.forEach((x, i) => { m4.makeRotationY(i * 1.3); m4.setPosition(x, HT / 2, ZC); inst.setMatrixAt(i, m4); });
    this.columnas = inst;
    this.grupo.add(inst);
  }

  // ---------------------------------------------------------------- techo alto: losa, vigas y borde terracota
  #techoAlto() {
    const xa = X0, xb = X1 + 4;
    const losa = cajaL(xa, xb, HT, HT + 0.4, ZC - 0.45, ZA + 0.3);
    const vigas = [];
    for (let x = xa + 1.75; x < xb; x += 3.5) vigas.push(cajaL(x - 0.17, x + 0.17, HT - 0.55, HT, ZC + 0.35, ZA));
    vigas.push(cajaL(xa, xb, HT - 0.55, HT, ZA - 0.4, ZA));             // viga sobre el ala de enfrente
    const cielo = new THREE.Mesh(new THREE.PlaneGeometry(xb - xa, ZA - ZC + 0.45), this.m.grisClaro);
    cielo.rotation.x = Math.PI / 2; cielo.position.set((xa + xb) / 2, HT - 0.002, (ZC - 0.45 + ZA) / 2);
    const borde = new THREE.Mesh(cajaL(xa, xb, HT - 0.7, HT + 0.42, ZC - 0.45, ZC + 0.35), this.m.terracota);
    this.techo.add(fusionar([losa, ...vigas], this.m.gris), cielo, borde);
  }

  // ---------------------------------------------------------------- lámparas de campana colgantes (en fila)
  #lamparas() {
    const pos = [];
    for (let x = X0 + 3.5; x < X1 + 2; x += 3.5) pos.push(x);
    const z = G.zEje + 0.4, yb = 3.95;
    const campana = new THREE.InstancedMesh(geoCampana(), this.m.campana, pos.length);
    const foco = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 10, 8), this.m.foco, pos.length);
    const cable = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 5), this.m.cable, pos.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const largo = HT - (yb + 0.3);
    pos.forEach((x, i) => {
      m4.makeTranslation(x, yb, z); campana.setMatrixAt(i, m4);
      m4.makeTranslation(x, yb + 0.06, z); foco.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(x, yb + 0.3 + largo / 2, z), q, s.set(1, largo, 1)); cable.setMatrixAt(i, m4);
    });
    this.techo.add(campana, foco, cable);
  }

  // ---------------------------------------------------------------- ala de enfrente: aula con vidrio, pisos altos y pasajes
  #alaEnfrente() {
    const g = this.grupo;
    const [pA, pB] = G.pasajes;
    const zf = ZA, zb = ZA + PROF;
    const aula = { x0: pA.x1 + 0.6, x1: pB.x0 - 1.0 };
    // tramos opacos de la planta baja (entre pasajes y extremos) y muros de los pasajes
    const opacos = [
      cajaL(X0, pA.x0, 0, HM + 0.2, zf, zf + 0.3), cajaL(pA.x1, aula.x0, 0, HM + 0.2, zf, zf + 0.3),
      cajaL(aula.x1, pB.x0, 0, HM + 0.2, zf, zf + 0.3), cajaL(pB.x1, X1, 0, HM + 0.2, zf, zf + 0.3),
    ];
    for (const p of G.pasajes) {
      opacos.push(cajaL(p.x0 - 0.2, p.x0, 0, HM + 0.2, zf, zb), cajaL(p.x1, p.x1 + 0.2, 0, HM + 0.2, zf, zb));
      opacos.push(cajaL(p.x0, p.x1, HM, HM + 0.2, zf, zb));
    }
    // pisos altos (fachada blanca con dos bandas de ventanas), cubierta y fondo del ala
    // (lo alto va en this.techo: desde arriba se ve la galería sin el ala tapándola)
    const blancosBajos = [
      cajaL(X0, pA.x0, 0, HM + 0.2, zb - 0.3, zb), cajaL(pA.x1, pB.x0, 0, HM + 0.2, zb - 0.3, zb), cajaL(pB.x1, X1, 0, HM + 0.2, zb - 0.3, zb),
      cajaL(X0 - 0.3, X0, 0, HM + 0.2, zf, zb), cajaL(X1, X1 + 0.3, 0, HM + 0.2, zf, zb),
      cajaL(X0 - 0.3, X1 + 0.3, HM + 0.2, HM + 0.32, zf, zb),
    ];
    const blancos = [
      cajaL(X0, X1, HM + 0.32, HM + 0.75, zf, zf + 0.3), cajaL(X0, X1, HM + 2.45, HM + 3.05, zf, zf + 0.3),
      cajaL(X0, X1, HM + 4.75, HT + 0.4, zf, zf + 0.3), cajaL(X0, X1, HM + 0.32, HT + 0.4, zb - 0.3, zb),
      cajaL(X0 - 0.3, X0, HM + 0.32, HT + 0.4, zf, zb), cajaL(X1, X1 + 0.3, HM + 0.32, HT + 0.4, zf, zb),
      cajaL(X0 - 0.3, X1 + 0.3, HT + 0.4, HT + 0.8, zf, zb),
    ];
    const fr = this.m.franjas.map;
    fr.repeat.set((X1 - X0) / 1.4, 1);
    const ventanas = [];
    for (const [y0, y1] of [[HM + 0.75, HM + 2.45], [HM + 3.05, HM + 4.75]]) {
      const v = new THREE.PlaneGeometry(X1 - X0, y1 - y0); v.rotateY(Math.PI); v.translate((X0 + X1) / 2, (y0 + y1) / 2, zf - 0.005);
      ventanas.push(v);
    }
    // montantes de aluminio de las ventanas altas (y luego los del aula)
    const montantesAltos = [];
    for (let x = X0 + 1.4; x < X1; x += 1.4) for (const [y0, y1] of [[HM + 0.75, HM + 2.45], [HM + 3.05, HM + 4.75]]) montantesAltos.push(cajaL(x - 0.03, x + 0.03, y0, y1, zf - 0.04, zf));
    const montantes = [];
    // aula de enfrente: vidrio, franja esmerilada, repisa de madera e interior iluminado
    const vidrio = new THREE.Mesh(new THREE.PlaneGeometry(aula.x1 - aula.x0, HM), this.mat.vidrio);
    vidrio.rotation.y = Math.PI; vidrio.position.set((aula.x0 + aula.x1) / 2, HM / 2, zf + 0.02);
    const esm = this.m.esmerilado.map; esm.repeat.set((aula.x1 - aula.x0) / 0.5, 1);
    const franja = new THREE.Mesh(new THREE.PlaneGeometry(aula.x1 - aula.x0, 0.85), this.m.esmerilado);
    franja.rotation.y = Math.PI; franja.position.set((aula.x0 + aula.x1) / 2, 0.52, zf + 0.01);
    for (let x = aula.x0; x <= aula.x1 + 0.01; x += (aula.x1 - aula.x0) / 20) montantes.push(cajaL(x - 0.03, x + 0.03, 0, HM, zf - 0.03, zf + 0.03));
    montantes.push(cajaL(aula.x0, aula.x1, 0.94, 0.98, zf - 0.03, zf + 0.03));
    const repisa = new THREE.Mesh(cajaL(aula.x0, aula.x1, 0.96, 1.0, zf - 0.16, zf), this.m.madera);
    // interior del aula
    const fondoAula = cajaL(aula.x0, aula.x1, 0, HM, zb - 0.6, zb - 0.3);
    const pisoAula = new THREE.PlaneGeometry(aula.x1 - aula.x0, PROF - 0.6); pisoAula.rotateX(-Math.PI / 2); pisoAula.translate((aula.x0 + aula.x1) / 2, 0.005, (zf + zb - 0.6) / 2);
    const techoAula = new THREE.PlaneGeometry(aula.x1 - aula.x0, PROF - 0.6); techoAula.rotateX(Math.PI / 2); techoAula.translate((aula.x0 + aula.x1) / 2, HM - 0.25, (zf + zb - 0.6) / 2);
    const panelesLuz = [];
    for (let x = aula.x0 + 1.6; x < aula.x1 - 1; x += 3.2) for (const z of [zf + 1.6, zf + 4.2]) panelesLuz.push(caja(1.1, 0.02, 0.5, x, HM - 0.26, z));
    const mesas = [], patas = [], sillas = [], conos = [];
    for (let x = aula.x0 + 2; x < aula.x1 - 1.5; x += 3.6) {
      for (const z of [zf + 1.8, zf + 4.3]) {
        mesas.push(caja(1.8, 0.04, 0.8, x, 0.74, z));
        for (const dx of [-0.8, 0.8]) for (const dz of [-0.32, 0.32]) patas.push(caja(0.04, 0.72, 0.04, x + dx, 0.36, z + dz));
        for (const dx of [-0.5, 0.5]) for (const dz of [-0.62, 0.62]) sillas.push(caja(0.42, 0.45, 0.42, x + dx, 0.225, z + dz), caja(0.42, 0.42, 0.05, x + dx, 0.66, z + dz + Math.sign(dz) * 0.19));
        const c = new THREE.ConeGeometry(0.12, 0.42, 16, 1, true); c.translate(x, HM - 0.95, z); conos.push(c);
      }
    }
    g.add(
      fusionar(opacos, this.m.gris), fusionar(blancosBajos, this.m.blanco), fusionar(montantes, this.m.aluminio),
      vidrio, franja, repisa,
      new THREE.Mesh(mergeGeometries([fondoAula, pisoAula, techoAula].map((x) => x.toNonIndexed ? x.toNonIndexed() : x)), this.m.blanco),
      fusionar(panelesLuz, this.m.luz), fusionar(mesas, this.m.madera), fusionar(patas, this.m.oscuro), fusionar(sillas, this.m.oscuro), fusionar(conos, this.m.campana),
    );
    this.techo.add(fusionar(blancos, this.m.blanco), fusionar(ventanas, this.m.franjas), fusionar(montantesAltos, this.m.aluminio));
    // maceteros con lengua de suegra junto al vidrio
    const geoM = geoMacetero();
    const mac = new THREE.InstancedMesh(geoM, this.m.macetero, G.maceteros.length);
    const tierra = new THREE.InstancedMesh(caja(0.84, 0.02, 0.32, 0, 0.42, 0), this.m.tierra, G.maceteros.length);
    const hojasGeo = [geoHojas(3), geoHojas(9), geoHojas(17)];
    const hojas = hojasGeo.map((hg) => new THREE.InstancedMesh(hg, this.m.hoja, G.maceteros.length));
    const m4 = new THREE.Matrix4(), cero = new THREE.Matrix4().makeScale(0, 0, 0);
    G.maceteros.forEach((mc, i) => {
      m4.makeTranslation((mc.x0 + mc.x1) / 2, 0, (mc.z0 + mc.z1) / 2);
      mac.setMatrixAt(i, m4); tierra.setMatrixAt(i, m4);
      hojas.forEach((h, k) => h.setMatrixAt(i, k === i % 3 ? m4 : cero));
    });
    g.add(mac, tierra, ...hojas);
  }

  // ---------------------------------------------------------------- edificios vecinos a los lados de la biblioteca
  #vecinos() {
    const zf = Z1, zt = Z1 - 6;
    const izq = { x0: X0, x1: PLANO.x0 - 0.35 }, der = { x0: PLANO.x1 + 3, x1: X1 };
    const muros = [
      cajaL(izq.x0, izq.x1, 0, HT + 0.4, Z1 - 12, zf),
      cajaL(der.x0, der.x1, HM + 0.2, HT + 0.4, zf - 0.3, zf), cajaL(der.x0, der.x1, 0, HT + 0.4, zt, zt + 0.3),
      cajaL(der.x0, der.x0 + 0.3, 0, HT + 0.4, zt, zf), cajaL(der.x1 - 0.3, der.x1, 0, HT + 0.4, zt, zf), cajaL(der.x0, der.x1, HT + 0.4, HT + 0.8, zt, zf),
    ];
    // planta baja del vecino de la derecha: vidrio con franja, puertas y montantes
    const vid = new THREE.PlaneGeometry(der.x1 - der.x0, HM + 0.2); vid.translate((der.x0 + der.x1) / 2, (HM + 0.2) / 2, zf - 0.15);
    const alu = [];
    for (let x = der.x0; x <= der.x1 + 0.01; x += (der.x1 - der.x0) / 12) alu.push(cajaL(x - 0.035, x + 0.035, 0, HM + 0.2, zf - 0.19, zf - 0.11));
    alu.push(cajaL(der.x0, der.x1, 2.5, 2.56, zf - 0.19, zf - 0.11));
    const franja = new THREE.PlaneGeometry(der.x1 - der.x0, 0.3); franja.translate((der.x0 + der.x1) / 2, 1.2, zf - 0.13);
    const interior = cajaL(der.x0, der.x1, 0, HM + 0.2, zt + 0.3, zt + 0.5);
    this.grupo.add(fusionar(muros, this.m.blanco), new THREE.Mesh(vid, this.mat.vidrio), fusionar(alu, this.m.aluminio), new THREE.Mesh(franja, this.m.esmerilado), new THREE.Mesh(interior, this.m.grisClaro));
  }

  // ---------------------------------------------------------------- fondo de la galería: cajeros, extintor, salida y tótem
  #fondo() {
    const g = this.grupo;
    const muro = new THREE.Mesh(cajaL(X0 - 0.3, X0, 0, HT + 0.4, Z1, ZA + 0.3), this.m.panel);
    this.m.panel.map.repeat.set((ZA - Z1) / 3, HT / 3);
    g.add(muro);
    // cajeros automáticos (genéricos, sin marcas)
    const cuerpos = [], pantallas = [], teclados = [];
    [[Z1 + 5.2, '#e8642a'], [Z1 + 6.9, '#c81e33']].forEach(([z, color]) => {
      cuerpos.push(cajaL(X0, X0 + 0.62, 0, 1.75, z - 0.42, z + 0.42));
      pantallas.push(cajaL(X0 + 0.62, X0 + 0.64, 1.18, 1.5, z - 0.22, z + 0.22));
      teclados.push(cajaL(X0 + 0.62, X0 + 0.78, 0.95, 1.0, z - 0.2, z + 0.2));
      const cab = cartel(0.84, 0.5, 400, dibujarCajero(color));
      cab.rotation.y = Math.PI / 2; cab.position.set(X0 + 0.01, 2.1, z);
      g.add(cab);
      const frente = cartel(0.84, 0.28, 300, (ctx, w, h) => { ctx.fillStyle = color; ctx.fillRect(0, 0, w, h); });
      frente.rotation.y = Math.PI / 2; frente.position.set(X0 + 0.625, 0.45, z);
      g.add(frente);
    });
    g.add(fusionar(cuerpos, this.m.grisClaro), fusionar(pantallas, this.m.oscuro), fusionar(teclados, this.m.acero));
    // gabinete contra incendios y tubería roja
    const rojo = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.5 });
    g.add(fusionar([cajaL(X0, X0 + 0.25, 1.0, 1.9, Z1 + 8.2, Z1 + 8.9), new THREE.CylinderGeometry(0.05, 0.05, HT - 1.9, 10).translate(X0 + 0.12, 1.9 + (HT - 1.9) / 2, Z1 + 8.55)], rojo));
    const salida = cartel(0.6, 0.22, 360, dibujarSalida, { brillo: true });
    salida.rotation.y = Math.PI / 2; salida.position.set(X0 + 0.02, 2.75, Z1 + 8.55);
    g.add(salida);
    // tótem de autoservicio
    const totem = new THREE.Group();
    const pantalla = cartel(0.6, 1.7, 360, dibujarTotem); pantalla.position.set(0, 0.85, 0);
    totem.add(new THREE.Mesh(cajaL(-0.3, 0.3, 0, 1.7, -0.17, -0.006), this.m.blanco), pantalla);
    totem.rotation.y = Math.PI / 2 + 0.5; totem.position.set(X0 + 1.5, 0, ZA - 1.6);
    g.add(totem);
    // cámara de seguridad
    const domo = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.m.oscuro);
    domo.rotation.z = -Math.PI / 2; domo.position.set(X0 + 0.01, 3.1, Z1 + 6.1);
    g.add(domo);
  }

  // ---------------------------------------------------------------- vitrina de la biblioteca (piso 1)
  #vitrina() {
    const g = this.frente;
    const P = PLANO.puertas;
    const xa = PLANO.x0, xb = PLANO.x1;
    const muro = { x0: -9.7, x1: -4.5 };
    // tramos de vidrio: sin el muro gráfico ni el pilar entre las puertas
    const tramos = [[xa, muro.x0], [muro.x1, P.entrada.x0], [P.salida.x1, xb]];
    const vid = [], esm = [], alu = [];
    for (const [a, b] of tramos) {
      const v = new THREE.PlaneGeometry(b - a, H); v.translate((a + b) / 2, H / 2, Z1); vid.push(v);
      const f = new THREE.PlaneGeometry(b - a, 0.34); f.translate((a + b) / 2, 1.22, Z1 + 0.012); esm.push(f);
      const n = Math.max(1, Math.round((b - a) / 1.6));
      for (let k = 0; k <= n; k++) { const x = a + ((b - a) * k) / n; alu.push(cajaL(x - 0.035, x + 0.035, 0, H, Z1 - 0.04, Z1 + 0.04)); }
      alu.push(cajaL(a, b, 0, 0.08, Z1 - 0.05, Z1 + 0.05), cajaL(a, b, 2.6, 2.66, Z1 - 0.04, Z1 + 0.04), cajaL(a, b, H - 0.08, H, Z1 - 0.05, Z1 + 0.05));
    }
    for (const pu of [P.entrada, P.salida]) {
      const v = new THREE.PlaneGeometry(pu.x1 - pu.x0, H - 2.66); v.translate((pu.x0 + pu.x1) / 2, 2.66 + (H - 2.66) / 2, Z1); vid.push(v);
    }
    const vidrio = new THREE.Mesh(mergeGeometries(vid), this.mat.vidrio);
    const franjaMat = new THREE.MeshStandardMaterial({ color: 0xf1f4f6, transparent: true, opacity: 0.62, roughness: 0.6, depthWrite: false, side: THREE.DoubleSide });
    const franjas = new THREE.Mesh(mergeGeometries(esm), franjaMat);
    g.add(vidrio, franjas, fusionar(alu, this.m.aluminio));
    this.franjaMat = franjaMat;
    // muro gráfico «BIBLIOTECA · Jorge Basadre Grohmann»
    const muroG = new THREE.Mesh(cajaL(muro.x0, muro.x1, 0, HM, Z1 - 0.16, Z1 + 0.02), this.m.blanco);
    const grafica = cartel(muro.x1 - muro.x0, HM, 1560, dibujarMuro);
    grafica.position.set((muro.x0 + muro.x1) / 2, HM / 2, Z1 + 0.025);
    g.add(muroG, grafica);
    // pilar entre la entrada y la salida, con el horario, el aforo y la señal de accesibilidad
    const pilar = new THREE.Mesh(cajaL(P.entrada.x1, P.salida.x0, 0, H, Z1 - 0.16, Z1 + 0.02), this.m.gris);
    const xc = (P.entrada.x1 + P.salida.x0) / 2;
    const horario = cartel(0.46, 0.62, 360, dibujarHorario); horario.position.set(xc, 2.0, Z1 + 0.025);
    const aforo = cartel(0.46, 0.3, 360, dibujarAforo); aforo.position.set(xc, 1.45, Z1 + 0.025);
    const acc = cartel(0.26, 0.26, 200, dibujarAccesible); acc.position.set(P.entrada.x1 - 0.3, 3.05, Z1 + 0.025);
    g.add(pilar, horario, aforo, acc);
    // franja esmerilada en las hojas de las puertas (las agrega la biblioteca, que las mueve)
  }

  // ---------------------------------------------------------------- objetos junto a las columnas
  #objetos() {
    const g = this.grupo;
    const [banner, tacho1, papel, tacho2] = G.objetos;
    // banner enrollable
    const base = new THREE.Mesh(cajaL(-0.42, 0.42, 0, 0.09, -0.13, 0.13), this.m.aluminio);
    const lona = cartel(0.8, 2.0, 560, dibujarBanner);
    lona.position.set(0, 1.08, 0.02);
    const poste = new THREE.Mesh(cajaL(-0.012, 0.012, 0.09, 2.1, -0.03, -0.01), this.m.aluminio);
    const b = new THREE.Group(); b.add(base, lona, poste);
    b.position.set(banner.x, 0, banner.z); b.rotation.y = 0.25;
    // tachos de acero
    const tachos = [tacho1, tacho2].map((t) => new THREE.CylinderGeometry(0.2, 0.18, 0.8, 18).translate(t.x, 0.4, t.z));
    const tapas = [tacho1, tacho2].map((t) => new THREE.CylinderGeometry(0.21, 0.21, 0.04, 18).translate(t.x, 0.82, t.z));
    // tacho de cartón para reciclar papel, con ruedas
    const caj = new THREE.Group();
    const cuerpo = new THREE.Mesh(cajaL(-0.3, 0.3, 0.1, 1.15, -0.24, 0.24), this.m.carton);
    const boca = new THREE.Mesh(new THREE.CircleGeometry(0.13, 18), this.m.oscuro); boca.position.set(0, 0.98, 0.245);
    const etiquetaP = cartel(0.46, 0.62, 300, dibujarPapel); etiquetaP.position.set(0, 0.5, 0.245);
    const ruedas = new THREE.Mesh(mergeGeometries([[-0.24, -0.18], [0.24, -0.18], [-0.24, 0.18], [0.24, 0.18]].map(([x, z]) => new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10).rotateZ(Math.PI / 2).translate(x, 0.05, z))), this.m.oscuro);
    caj.add(cuerpo, boca, etiquetaP, ruedas);
    caj.position.set(papel.x, 0, papel.z); caj.rotation.y = -0.3;
    // aviso verde pegado a la columna de la derecha de la salida
    const aviso = cartel(0.3, 0.42, 240, dibujarAvisoVerde);
    aviso.position.set(10, 1.65, ZC + G.radioColumna + 0.006);
    g.add(b, fusionar([...tachos, ...tapas], this.m.acero), caj, aviso);
  }

  // Desde arriba (vista aérea, casa de muñecas) se ve la galería sin su techo
  desdeArriba(v) { this.techo.visible = !v; }
}
