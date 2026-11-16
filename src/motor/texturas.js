// Texturas procedurales (se dibujan en canvas al cargar: no hay imágenes que descargar).
import * as THREE from 'three';

let anisotropiaMax = 8;
export function fijarAnisotropia(n) { anisotropiaMax = n; }

export function lienzo(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// PRNG con semilla (mulberry32): las texturas salen iguales en cada carga.
export function azar(semilla = 1) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ruido de valor 2D periódico (se repite sin costuras) con fBm.
function crearRuido(semilla, periodo) {
  const r = azar(semilla);
  const n = periodo;
  const tabla = new Float32Array(n * n);
  for (let i = 0; i < tabla.length; i++) tabla[i] = r();
  const suave = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = suave(x - xi), yf = suave(y - yi);
    const x0 = ((xi % n) + n) % n, y0 = ((yi % n) + n) % n;
    const x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
    const a = tabla[y0 * n + x0], b = tabla[y0 * n + x1];
    const c = tabla[y1 * n + x0], d = tabla[y1 * n + x1];
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

function fbm(ruido, x, y, octavas = 4) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < octavas; o++) {
    s += ruido(x * f, y * f) * amp;
    norm += amp; amp *= 0.5; f *= 2;
  }
  return s / norm;
}

function aTextura(canvas, { repetir = [1, 1], srgb = true, aniso = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repetir[0], repetir[1]);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (aniso) t.anisotropy = anisotropiaMax;
  t.needsUpdate = true;
  return t;
}

// Mapa normal a partir de un mapa de alturas (Sobel), con bordes periódicos.
function normalDesdeAltura(alturas, w, h, fuerza = 2) {
  const c = lienzo(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const H = (x, y) => alturas[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
      let nx = -dx * fuerza, ny = -dy * fuerza, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (-ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const mezcla = (a, b, t) => a + (b - a) * t;
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

// Madera: tablones con vetas. Devuelve { map, normalMap, roughnessMap }.
export function madera({ tam = 1024, tablones = 6, claro = 0xc79a63, oscuro = 0x8a5a33, semilla = 7, vetas = 9, tablonesVert = true } = {}) {
  const w = tam, h = tam;
  const r = azar(semilla);
  const ruido = crearRuido(semilla, 64);
  const ruido2 = crearRuido(semilla + 11, 32);
  const c1 = hex(claro), c2 = hex(oscuro);
  const col = lienzo(w, h), ctx = col.getContext('2d');
  const img = ctx.createImageData(w, h);
  const alt = new Float32Array(w * h);
  const rug = lienzo(w, h), rctx = rug.getContext('2d');
  const rimg = rctx.createImageData(w, h);
  const tonos = Array.from({ length: tablones }, () => 0.82 + r() * 0.3);
  const desfases = Array.from({ length: tablones }, () => r() * 100);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = tablonesVert ? x / w : y / h;
      const v = tablonesVert ? y / h : x / w;
      const k = Math.floor(u * tablones);
      const lu = u * tablones - k;
      const d = fbm(ruido, lu * 4 + desfases[k], v * 3, 4);
      const anillo = Math.sin((lu * vetas + d * 6 + desfases[k]) * Math.PI * 2) * 0.5 + 0.5;
      const fibra = fbm(ruido2, lu * 40, v * 2 + desfases[k], 3);
      let t = Math.pow(anillo, 2.2) * 0.6 + fibra * 0.4;
      t = Math.min(1, Math.max(0, t));
      const tono = tonos[k];
      const borde = Math.min(lu, 1 - lu) < 0.006 ? 0.55 : 1; // junta entre tablones
      const i = (y * w + x) * 4;
      img.data[i] = mezcla(c1[0], c2[0], t) * tono * borde;
      img.data[i + 1] = mezcla(c1[1], c2[1], t) * tono * borde;
      img.data[i + 2] = mezcla(c1[2], c2[2], t) * tono * borde;
      img.data[i + 3] = 255;
      alt[y * w + x] = (1 - t) * 0.25 + (borde < 1 ? -0.6 : 0) + fibra * 0.15;
      const ro = 150 + t * 50 + (borde < 1 ? 60 : 0);
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = ro; rimg.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  return {
    map: aTextura(col),
    normalMap: aTextura(normalDesdeAltura(alt, w, h, 2.2), { srgb: false }),
    roughnessMap: aTextura(rug, { srgb: false }),
  };
}

// Superficie fina con grano (MDF, papel, cartón pluma, yeso, concreto...).
export function grano({ tam = 512, base = 0xe9dcc0, variacion = 0.06, motas = 0.04, semilla = 3, escala = 8, fuerzaNormal = 0.8, fibras = 0 } = {}) {
  const w = tam, h = tam;
  const ruido = crearRuido(semilla, 64);
  const ruidoF = crearRuido(semilla + 5, 128);
  const r = azar(semilla + 99);
  const c = hex(base);
  const col = lienzo(w, h), ctx = col.getContext('2d');
  const img = ctx.createImageData(w, h);
  const alt = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm(ruido, (x / w) * escala, (y / h) * escala, 5);
      let f = 0;
      if (fibras) f = (fbm(ruidoF, (x / w) * 64, (y / h) * 6, 2) - 0.5) * fibras;
      let m = 1 + (n - 0.5) * variacion * 2 + f;
      if (r() < motas * 0.02) m *= 0.75 + r() * 0.15;
      const i = (y * w + x) * 4;
      img.data[i] = Math.min(255, c[0] * m);
      img.data[i + 1] = Math.min(255, c[1] * m);
      img.data[i + 2] = Math.min(255, c[2] * m);
      img.data[i + 3] = 255;
      alt[y * w + x] = n + f * 2;
    }
  }
  ctx.putImageData(img, 0, 0);
  return {
    map: aTextura(col),
    normalMap: aTextura(normalDesdeAltura(alt, w, h, fuerzaNormal), { srgb: false }),
  };
}

// Canto de cartón corrugado (las ondas que se ven en el borde de una silueta).
export function canaletas({ tam = 256 } = {}) {
  const c = lienzo(tam, tam), ctx = c.getContext('2d');
  ctx.fillStyle = '#b98b55'; ctx.fillRect(0, 0, tam, tam);
  ctx.strokeStyle = '#7d5630'; ctx.lineWidth = tam / 40;
  for (let k = 0; k < 2; k++) {
    ctx.beginPath();
    for (let x = 0; x <= tam; x += 2) {
      const y = tam * (0.3 + k * 0.4) + Math.sin((x / tam) * Math.PI * 16) * tam * 0.12;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(70,45,20,0.35)';
  ctx.fillRect(0, 0, tam, tam * 0.08); ctx.fillRect(0, tam * 0.92, tam, tam * 0.08);
  return aTextura(c, { repetir: [8, 1] });
}

// Placas de circuito: fondo de color, pistas, pads y serigrafía.
export function pcb({ ancho = 512, alto = 256, color = '#14171c', pista = '#232a33', seda = '#e8e8e8', textos = [], pads = 'filas', semilla = 5 } = {}) {
  const c = lienzo(ancho, alto), ctx = c.getContext('2d');
  const r = azar(semilla);
  const g = ctx.createLinearGradient(0, 0, ancho, alto);
  g.addColorStop(0, color); g.addColorStop(1, shade(color, -12));
  ctx.fillStyle = g; ctx.fillRect(0, 0, ancho, alto);
  // pistas
  ctx.strokeStyle = pista; ctx.lineCap = 'round';
  for (let i = 0; i < 40; i++) {
    ctx.lineWidth = 1.5 + r() * 2.5;
    ctx.beginPath();
    let x = r() * ancho, y = r() * alto;
    ctx.moveTo(x, y);
    for (let s = 0; s < 3; s++) {
      if (r() < 0.5) x += (r() - 0.5) * ancho * 0.5; else y += (r() - 0.5) * alto * 0.5;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // vías
  ctx.fillStyle = '#c9a54a';
  for (let i = 0; i < 60; i++) {
    ctx.beginPath(); ctx.arc(r() * ancho, r() * alto, 1.6, 0, Math.PI * 2); ctx.fill();
  }
  // filas de pads de pines
  if (pads === 'filas') {
    const n = 15, paso = ancho / (n + 1);
    for (const yy of [alto * 0.07, alto * 0.93]) {
      for (let i = 1; i <= n; i++) {
        ctx.fillStyle = '#d6b25a';
        ctx.beginPath(); ctx.arc(i * paso, yy, alto * 0.035, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath(); ctx.arc(i * paso, yy, alto * 0.015, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.fillStyle = seda;
  for (const t of textos) {
    ctx.font = `${t.negrita ? '700 ' : ''}${t.tam || 14}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = t.alinear || 'left';
    ctx.save();
    ctx.translate(t.x * ancho, t.y * alto);
    if (t.rot) ctx.rotate(t.rot);
    ctx.fillText(t.texto, 0, 0);
    ctx.restore();
  }
  return aTextura(c, { aniso: true });
}

function shade(hexStr, d) {
  const n = parseInt(hexStr.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, v + d));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// Protoboard de 400 puntos: blanca, con agujeros y rieles rojo/azul.
export function protoboard() {
  const w = 512, h = 340;
  const c = lienzo(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = '#f1f1ec'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#d9d9d2'; ctx.fillRect(0, h * 0.47, w, h * 0.06);
  const hoyo = (x, y) => { ctx.fillStyle = '#3a3a3a'; ctx.fillRect(x - 3, y - 3, 6, 6); };
  for (let i = 0; i < 30; i++) {
    const x = 20 + i * ((w - 40) / 29);
    for (let j = 0; j < 5; j++) { hoyo(x, h * 0.18 + j * 18); hoyo(x, h * 0.58 + j * 18); }
  }
  for (const [y, col] of [[h * 0.04, '#d33'], [h * 0.11, '#33d'], [h * 0.89, '#d33'], [h * 0.96, '#33d']]) {
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(10, y + (y < h / 2 ? -8 : 8)); ctx.lineTo(w - 10, y + (y < h / 2 ? -8 : 8)); ctx.stroke();
    for (let i = 0; i < 25; i++) hoyo(24 + i * ((w - 48) / 24), y);
  }
  return aTextura(c);
}

// Lomos de libros en escala de grises (se tiñen con el color de cada libro).
export function lomos() {
  const w = 64, h = 256;
  const c = lienzo(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = '#d8d8d8'; ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(0.18, 'rgba(255,255,255,0.12)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.18)'); g.addColorStop(0.85, 'rgba(0,0,0,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,240,200,0.75)';
  ctx.fillRect(0, h * 0.1, w, 6); ctx.fillRect(0, h * 0.84, w, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 4; i++) ctx.fillRect(w * 0.3, h * (0.3 + i * 0.06), w * 0.4, 5);
  return aTextura(c, { repetir: [1, 1] });
}

// Cielo degradado para el fondo de la biblioteca (equirectangular sencillo).
export function cielo({ arriba = '#7fb3e6', horizonte = '#dcebf7', abajo = '#c8d3c0' } = {}) {
  const c = lienzo(16, 512), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, arriba); g.addColorStop(0.48, horizonte); g.addColorStop(0.52, horizonte); g.addColorStop(1, abajo);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

// Sombra suave redonda (para apoyar objetos sin sombras en tiempo real).
export function sombraSuave() {
  const s = 128;
  const c = lienzo(s, s), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.5, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Halo de estado (anillo luminoso alrededor de una silla).
export function halo() {
  const s = 256;
  const c = lienzo(s, s), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.18, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Destello suave (LED, puntos de luz)
export function destello() {
  const s = 128;
  const c = lienzo(s, s), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
