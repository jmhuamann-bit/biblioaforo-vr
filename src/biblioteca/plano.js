// Plano de la biblioteca (distribución referencial con las cifras del informe):
// Sala 1 (piso 1): 24 mesas · 96 asientos · vestíbulo con entrada, salida y tótem.
// Sala 2 (piso 2): 59 mesas · 236 asientos · zona de silencio y de trabajo en grupo.
// Unidades: metros. x a la derecha, z hacia la fachada (puertas en +z), y hacia arriba.
// No depende de three.js: lo usan el 3D, el mapa 2D, las rutas y las pruebas.

export const PLANO = {
  x0: -23, x1: 23, z0: -13.25, z1: 13.25,
  alturaPiso: 4.5,          // de piso a piso
  alturaSala: 3.9,          // altura libre de cada sala
  mesa: { ancho: 2.4, fondo: 1.0, alto: 0.75 },
  silla: { dx: 0.6, dz: 0.9 },
  aforo: 381,
  puertas: {
    entrada: { x0: -1.0, x1: 2.0, z: 13.25, nombre: 'ENTRADA', sensor: 'S1' },
    salida: { x0: 4.0, x1: 7.0, z: 13.25, nombre: 'SALIDA', sensor: 'S2' },
  },
  totem: { x: -3.2, z: 10.4 },
  vestibuloZ: 6.75,         // en el piso 1, z > 6.75 es vestíbulo
  // Escalera en U en la esquina frontal izquierda (dos tramos de 2.25 m de altura)
  escalera: {
    x0: -22.6, x1: -16.4, z0: 5.6, z1: 12.4,
    tramo1: { x0: -22.4, x1: -20.2, zAbajo: 12.4, zArriba: 8.2 },
    rellano: { x0: -22.4, x1: -16.6, z0: 5.8, z1: 8.2 },
    tramo2: { x0: -18.8, x1: -16.6, zAbajo: 8.2, zArriba: 12.4 },
    portal1: { x: -21.3, z: 12.85 },   // pie de la escalera (piso 1)
    portal2: { x: -17.7, z: 12.85 },   // llegada (piso 2)
  },
  estantes: [
    { piso: 1, x0: -22.7, x1: -21.9, z0: -12.6, z1: 4.6 },
    { piso: 2, x0: -22.7, x1: -21.9, z0: -12.6, z1: 4.6 },
    { piso: 1, x0: -6.0, x1: 18.0, z0: -12.95, z1: -12.25 },
  ],
  mostrador: { piso: 1, x0: 9.5, x1: 15.5, z0: 9.2, z1: 10.4 },
  ventanas: { derecha: true, frente: true },
  // Espacios de la UP (reglamento y guía de la Biblioteca): Sala 3 de materiales especiales (acceso
  // restringido), salas de estudio grupales (se reservan en línea; no tienen cámara ni cuentan entre
  // los 332 asientos), computadoras para bases de datos, hemeroteca y diarios en la entrada.
  sala3: { piso: 1, x0: 16.6, x1: 22.75, z0: 7.0, z1: 12.9 },
  salasEstudio: { piso: 1, x0: 18.6, x1: 22.75, z0: -12.9, z1: 3.4, n: 4 },
  computadoras: { piso: 1, x0: -17.6, x1: -15.4, z0: -9.0, z1: -2.5 },
  hemeroteca: { piso: 2, x0: -19.3, x1: -17.9, z0: -10.0, z1: 1.5 },
  diarios: { piso: 1, x0: 2.35, x1: 3.65, z0: 11.7, z1: 12.7 },
};

// Galería del Pabellón C (así se entra a la biblioteca de la UP): pasillo techado frente a la vitrina,
// con una fila de columnas redondas, el ala de enfrente (aula con vidrio) y dos pasajes al campus.
// Por aquí llegan y se van los estudiantes.
PLANO.galeria = {
  z0: PLANO.z1, z1: PLANO.z1 + 11,           // del vidrio de la biblioteca al ala de enfrente
  x0: -26, x1: 44,                            // muro con cajeros a la izquierda · abierta a la derecha
  zColumnas: PLANO.z1 + 3.2, radioColumna: 0.36,
  columnas: [-25, -18, -11, -4, 10, 17, 24, 31, 38],
  zEje: PLANO.z1 + 6,                         // eje por donde se camina
  pasajes: [{ x0: -20.5, x1: -16.5 }, { x0: 14.8, x1: 18.8 }],
  profundidadAla: 7,
  alturaMarquesina: 3.4, alturaTecho: 9.0,
  // maceteros junto al vidrio del ala de enfrente y objetos junto a las columnas (obstáculos al caminar)
  maceteros: [-14, -9.5, -5, 3, 7.5, 12, 25, 29.5, 34].map((x) => ({ x0: x - 0.5, x1: x + 0.5, z0: PLANO.z1 + 10.3, z1: PLANO.z1 + 10.8 })),
  objetos: [{ x: -3.05, z: PLANO.z1 + 2.55, r: 0.45 }, { x: -5.0, z: PLANO.z1 + 2.7, r: 0.25 }, { x: 9.0, z: PLANO.z1 + 2.6, r: 0.4 }, { x: 11.0, z: PLANO.z1 + 2.8, r: 0.25 }],
};

const LETRAS = ['A', 'B', 'C', 'D'];
// posición de cada silla respecto al centro de la mesa (A y B detrás, C y D delante)
const OFFSET = { A: [-1, -1], B: [1, -1], C: [-1, 1], D: [1, 1] };

function crearSalas() {
  const mesas = [];
  const asientos = [];
  const agregar = (piso, n, f, c, x, z, extra) => {
    const id = `${piso}-${String(n).padStart(2, '0')}`;
    const mesa = { id, piso, f, c, x, z, ...extra, asientos: [] };
    for (const l of LETRAS) {
      const [sx, sz] = OFFSET[l];
      const a = {
        id: `${id}-${l}`, mesa: id, piso, letra: l, f, c,
        x: x + sx * PLANO.silla.dx, z: z + sz * PLANO.silla.dz,
        mira: sz < 0 ? 1 : -1,                     // +1 mira hacia +z (la mesa)
        zona: extra.zona, ventana: extra.ventana, enchufe: extra.enchufe, piloto: !!extra.piloto,
        camara: extra.piloto ? `A${LETRAS.indexOf(l) + 1}` : null,
      };
      mesa.asientos.push(a);
      asientos.push(a);
    }
    mesas.push(mesa);
  };
  // Sala 1: 6 columnas × 4 filas; la fila 0 es la más cercana al vestíbulo. 1-01 es la mesa piloto.
  let n = 0;
  for (let f = 0; f < 4; f++) for (let c = 0; c < 6; c++) {
    n++;
    agregar(1, n, f, c, -10 + c * 5, 2.75 - f * 4, {
      zona: n === 1 ? 'piloto' : 'general', ventana: c === 5, enchufe: c % 2 === 0, piloto: n === 1,
    });
  }
  // Sala 2: 10 columnas × 6 filas, sin la mesa junto a la llegada de la escalera
  n = 0;
  for (let f = 0; f < 6; f++) for (let c = 0; c < 10; c++) {
    if (f === 5 && c === 0) continue;
    n++;
    agregar(2, n, f, c, -14.25 + c * 3.75, -10.5 + f * 3.9, {
      zona: c < 5 ? 'silencio' : 'grupo', ventana: c === 9, enchufe: c % 2 === 1,
    });
  }
  return { mesas, asientos };
}

const SALAS = crearSalas();
PLANO.mesas = SALAS.mesas;
PLANO.asientos = SALAS.asientos;
PLANO.mesaPiloto = SALAS.mesas.find((m) => m.id === '1-01');
export const NOMBRE_ZONA = { general: 'Sala general', piloto: 'Mesa piloto', silencio: 'Zona de silencio', grupo: 'Trabajo en grupo' };
export const yPiso = (piso) => (piso - 1) * PLANO.alturaPiso;

// Punto de acceso a una silla (en el pasillo, frente al respaldo) y la silla misma
export function accesoAsiento(a) {
  return { x: a.x, z: a.z + (a.mira > 0 ? -0.75 : 0.75) };
}

// ---------------------------------------------------------------------
// Grilla de navegación por piso (celdas de 25 cm) con A* y campo de distancias
// ---------------------------------------------------------------------
const CELDA = 0.25;
const NX = Math.round((PLANO.x1 - PLANO.x0) / CELDA);
const NZ = Math.round((PLANO.z1 - PLANO.z0) / CELDA);

function rectsObstaculos(piso, radio) {
  const r = [];
  const add = (x0, x1, z0, z1) => r.push({ x0: x0 - radio, x1: x1 + radio, z0: z0 - radio, z1: z1 + radio });
  for (const m of PLANO.mesas) if (m.piso === piso) {
    // mesa y sus sillas forman un bloque (respaldos a ±1.15 m)
    add(m.x - PLANO.mesa.ancho / 2 - 0.05, m.x + PLANO.mesa.ancho / 2 + 0.05, m.z - 1.15, m.z + 1.15);
  }
  for (const e of PLANO.estantes) if (e.piso === piso) add(e.x0, e.x1, e.z0, e.z1);
  const E = PLANO.escalera;
  // la escalera solo se cruza por sus portales (las rutas la recorren aparte)
  add(E.x0, E.x1, E.z0, E.z1);
  if (piso === 1) {
    const M = PLANO.mostrador; add(M.x0, M.x1, M.z0, M.z1);
    add(PLANO.totem.x - 0.4, PLANO.totem.x + 0.4, PLANO.totem.z - 0.3, PLANO.totem.z + 0.3);
  }
  // salas cerradas, computadoras, hemeroteca y diarios
  for (const k of ['sala3', 'salasEstudio', 'computadoras', 'hemeroteca', 'diarios']) {
    const o = PLANO[k];
    if (o.piso === piso) add(o.x0, o.x1, o.z0, o.z1);
  }
  return r;
}

class Grilla {
  constructor(piso, radio = 0.32) {
    this.piso = piso;
    this.b = new Uint8Array(NX * NZ);
    const rects = rectsObstaculos(piso, radio);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const x = PLANO.x0 + (i + 0.5) * CELDA, z = PLANO.z0 + (j + 0.5) * CELDA;
      let b = x < PLANO.x0 + radio || x > PLANO.x1 - radio || z < PLANO.z0 + radio || z > PLANO.z1 - radio;
      if (!b) for (const o of rects) if (x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1) { b = true; break; }
      this.b[j * NX + i] = b ? 1 : 0;
    }
    // holgura: distancia (en celdas) al obstáculo más cercano, para ir por el centro de los pasillos
    this.holgura = new Uint16Array(NX * NZ).fill(65535);
    const cola = new Int32Array(NX * NZ);
    let ini = 0, fin = 0;
    for (let c = 0; c < NX * NZ; c++) if (this.b[c]) { this.holgura[c] = 0; cola[fin++] = c; }
    while (ini < fin) {
      const c = cola[ini++];
      const ci = c % NX, cj = (c / NX) | 0, h = this.holgura[c] + 1;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
        const n = nj * NX + ni;
        if (this.holgura[n] > h) { this.holgura[n] = h; cola[fin++] = n; }
      }
    }
  }
  celda(x, z) {
    const i = Math.max(0, Math.min(NX - 1, Math.floor((x - PLANO.x0) / CELDA)));
    const j = Math.max(0, Math.min(NZ - 1, Math.floor((z - PLANO.z0) / CELDA)));
    return [i, j];
  }
  libre(x, z) {
    if (x <= PLANO.x0 || x >= PLANO.x1 || z <= PLANO.z0 || z >= PLANO.z1) return false;
    const [i, j] = this.celda(x, z);
    return !this.b[j * NX + i];
  }
  cercanaLibre(i, j) {
    if (!this.b[j * NX + i]) return [i, j];
    for (let r = 1; r < 40; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const a = i + di, b = j + dj;
      if (a >= 0 && b >= 0 && a < NX && b < NZ && !this.b[b * NX + a]) return [a, b];
    }
    return [i, j];
  }
  centro(c) { return { x: PLANO.x0 + ((c % NX) + 0.5) * CELDA, z: PLANO.z0 + (Math.floor(c / NX) + 0.5) * CELDA }; }
}

// cola de prioridad (montículo binario)
class Monticulo {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(v, k) {
    const K = this.k, Vv = this.v; let i = K.length; K.push(k); Vv.push(v);
    while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= K[i]) break; [K[p], K[i]] = [K[i], K[p]]; [Vv[p], Vv[i]] = [Vv[i], Vv[p]]; i = p; }
  }
  pop() {
    const K = this.k, Vv = this.v; const top = Vv[0];
    const lk = K.pop(), lv = Vv.pop();
    if (K.length) {
      K[0] = lk; Vv[0] = lv; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < K.length && K[l] < K[m]) m = l;
        if (r < K.length && K[r] < K[m]) m = r;
        if (m === i) break;
        [K[m], K[i]] = [K[i], K[m]]; [Vv[m], Vv[i]] = [Vv[i], Vv[m]]; i = m;
      }
    }
    return top;
  }
}

const VEC = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

const grillas = {};
export function grilla(piso) { return (grillas[piso] ||= new Grilla(piso)); }

// Campo de distancias (Dijkstra) desde un punto: distancia a pie a cada celda del piso
export function campoDistancias(piso, x, z) {
  const g = grilla(piso);
  const [si, sj] = g.cercanaLibre(...g.celda(x, z));
  const dist = new Float32Array(NX * NZ).fill(Infinity);
  const h = new Monticulo();
  const ini = sj * NX + si;
  dist[ini] = 0; h.push(ini, 0);
  while (h.size) {
    const c = h.pop();
    const d0 = dist[c];
    const ci = c % NX, cj = (c / NX) | 0;
    for (const [di, dj, w] of VEC) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
      const n = nj * NX + ni;
      if (g.b[n]) continue;
      if (di && dj && (g.b[cj * NX + ni] || g.b[nj * NX + ci])) continue;
      const nd = d0 + w * CELDA;
      if (nd < dist[n]) { dist[n] = nd; h.push(n, nd); }
    }
  }
  return {
    distancia(xx, zz) { const [i, j] = g.cercanaLibre(...g.celda(xx, zz)); return dist[j * NX + i]; },
  };
}

// A* ortogonal con castigo por giro y preferencia por el centro de los pasillos:
// produce rutas como las que daría una persona ("sigue el pasillo y gira a la derecha").
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const CASTIGO_GIRO = 2.2;   // metros equivalentes por cada giro
function aEstrella(piso, x0, z0, x1, z1) {
  const g = grilla(piso);
  const [si, sj] = g.cercanaLibre(...g.celda(x0, z0));
  const [gi, gj] = g.cercanaLibre(...g.celda(x1, z1));
  const N = NX * NZ * 5;                       // estado = celda × dirección de llegada (4 = inicio)
  const gC = new Float32Array(N).fill(Infinity);
  const padre = new Int32Array(N).fill(-1);
  const cerrado = new Uint8Array(N);
  const h = new Monticulo();
  const heur = (i, j) => (Math.abs(i - gi) + Math.abs(j - gj)) * CELDA;
  const inicio = (sj * NX + si) * 5 + 4;
  gC[inicio] = 0; h.push(inicio, heur(si, sj));
  let final = -1;
  while (h.size) {
    const s = h.pop();
    if (cerrado[s]) continue;
    cerrado[s] = 1;
    const c = (s / 5) | 0, dir = s % 5;
    const ci = c % NX, cj = (c / NX) | 0;
    if (ci === gi && cj === gj) { final = s; break; }
    for (let d = 0; d < 4; d++) {
      const ni = ci + DIRS[d][0], nj = cj + DIRS[d][1];
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
      const n = nj * NX + ni;
      if (g.b[n]) continue;
      const hol = g.holgura[n];
      let costo = CELDA * (1 + (hol < 4 ? (4 - hol) * 0.18 : 0));
      if (dir !== 4 && dir !== d) costo += CASTIGO_GIRO;
      const ns = n * 5 + d;
      if (cerrado[ns]) continue;
      const ng = gC[s] + costo;
      if (ng < gC[ns]) { gC[ns] = ng; padre[ns] = s; h.push(ns, ng + heur(ni, nj)); }
    }
  }
  if (final < 0) return [{ x: x0, z: z0 }, { x: x1, z: z1 }];
  const celdas = [];
  for (let s = final; s !== -1; s = padre[s]) celdas.push((s / 5) | 0);
  celdas.reverse();
  // solo los puntos donde cambia la dirección
  const esquinas = [g.centro(celdas[0])];
  for (let k = 1; k < celdas.length - 1; k++) {
    const a = celdas[k - 1], b = celdas[k], c = celdas[k + 1];
    if (b - a !== c - b) esquinas.push(g.centro(b));
  }
  esquinas.push(g.centro(celdas[celdas.length - 1]));
  const pts = [{ x: x0, z: z0 }, ...esquinas, { x: x1, z: z1 }];
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 0.2);
}

function vista(g, a, b) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const pasos = Math.ceil(d / (CELDA * 0.5));
  for (let k = 1; k < pasos; k++) {
    const t = k / pasos;
    if (!g.libre(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}

function suavizar(pts, g) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  let k = 0;
  while (k < pts.length - 1) {
    let lejos = k + 1;
    for (let m = pts.length - 1; m > k + 1; m--) if (vista(g, pts[k], pts[m])) { lejos = m; break; }
    out.push(pts[lejos]);
    k = lejos;
  }
  return out;
}

// Recorrido por la escalera (de un piso a otro), con alturas
function tramoEscalera(subiendo) {
  const E = PLANO.escalera, h = PLANO.alturaPiso;
  const x1 = (E.tramo1.x0 + E.tramo1.x1) / 2, x2 = (E.tramo2.x0 + E.tramo2.x1) / 2;
  const zr = (E.rellano.z0 + E.rellano.z1) / 2;
  const pts = [
    { x: E.portal1.x, y: 0, z: E.portal1.z },
    { x: x1, y: 0, z: E.tramo1.zAbajo },
    { x: x1, y: h / 2, z: E.tramo1.zArriba },
    { x: x1, y: h / 2, z: zr },
    { x: x2, y: h / 2, z: zr },
    { x: x2, y: h / 2, z: E.tramo2.zAbajo },
    { x: x2, y: h, z: E.tramo2.zArriba },
    { x: E.portal2.x, y: h, z: E.portal2.z },
  ];
  return subiendo ? pts : pts.reverse();
}

// Altura del suelo en (x, z) para quien camina; nivel: 1 o 2 (el piso donde está)
export function alturaSuelo(x, z, nivel = 1) {
  const E = PLANO.escalera, h = PLANO.alturaPiso;
  const dentro = (r) => x >= r.x0 && x <= r.x1;
  if (z >= E.tramo1.zArriba && z <= E.tramo1.zAbajo && dentro(E.tramo1)) return ((E.tramo1.zAbajo - z) / (E.tramo1.zAbajo - E.tramo1.zArriba)) * h / 2;
  if (z >= E.rellano.z0 && z <= E.rellano.z1 && dentro(E.rellano)) return h / 2;
  if (z >= E.tramo2.zAbajo && z <= E.tramo2.zArriba && dentro(E.tramo2)) return h / 2 + ((z - E.tramo2.zAbajo) / (E.tramo2.zArriba - E.tramo2.zAbajo)) * h / 2;
  return nivel >= 2 ? h : 0;
}

// ¿Se puede pisar (x, z) estando en el nivel dado? (incluye la escalera)
export function transitable(x, z, nivel = 1) {
  const E = PLANO.escalera;
  const en = (r, z0, z1) => x >= r.x0 && x <= r.x1 && z >= z0 && z <= z1;
  if (en(E.tramo1, E.tramo1.zArriba, E.tramo1.zAbajo + 0.5) || en(E.rellano, E.rellano.z0, E.rellano.z1) || en(E.tramo2, E.tramo2.zAbajo, E.tramo2.zArriba + 0.5)) return true;
  return grilla(nivel).libre(x, z);
}

// Ruta entre dos puntos {x, z, piso}. Devuelve puntos 3D, metros e indicaciones.
export function ruta(desde, hasta, { asiento = null } = {}) {
  let pts = [];
  const conY = (lista, piso) => lista.map((p) => ({ x: p.x, y: yPiso(piso), z: p.z }));
  const destino = asiento ? accesoAsiento(asiento) : hasta;
  if (desde.piso === hasta.piso) {
    pts = conY(aEstrella(desde.piso, desde.x, desde.z, destino.x, destino.z), desde.piso);
  } else {
    const subir = hasta.piso > desde.piso;
    const pA = subir ? PLANO.escalera.portal1 : PLANO.escalera.portal2;
    const pB = subir ? PLANO.escalera.portal2 : PLANO.escalera.portal1;
    if (Math.hypot(desde.x - pA.x, desde.z - pA.z) < 1.2) {
      // ya está al pie de la escalera: sin volver atrás al portal
      pts = [{ x: desde.x, y: yPiso(desde.piso), z: desde.z }, ...tramoEscalera(subir).slice(1)];
    } else {
      pts = conY(aEstrella(desde.piso, desde.x, desde.z, pA.x, pA.z), desde.piso);
      pts.pop();
      pts.push(...tramoEscalera(subir));
    }
    const resto = conY(aEstrella(hasta.piso, pB.x, pB.z, destino.x, destino.z), hasta.piso);
    pts.push(...resto.slice(1));
  }
  if (asiento) pts.push({ x: asiento.x, y: yPiso(asiento.piso), z: asiento.z });
  // quita puntos repetidos
  pts = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z, p.y - pts[i - 1].y) > 0.05);
  let metros = 0;
  for (let i = 1; i < pts.length; i++) metros += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
  return { pts, metros, segundos: metros / 1.25, indicaciones: indicaciones(pts, desde, hasta, asiento) };
}

// Indicaciones legibles: solo giros claros (> 50°) entre tramos largos, la escalera y la llegada.
function indicaciones(pts, desde, hasta, asiento) {
  const out = [];
  const largo = [0];
  for (let i = 1; i < pts.length; i++) largo.push(largo[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z));
  const total = largo[largo.length - 1];
  let escalera = false;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (!escalera && Math.abs(b.y - a.y) > 0.5) {
      escalera = true;
      out.push({ texto: b.y > a.y ? 'Sube por la escalera al piso 2' : 'Baja por la escalera al piso 1', en: largo[i - 1], i: i - 1 });
    }
    if (i >= pts.length - 2) continue;
    const c = pts[i + 1];
    if (Math.abs(b.y - a.y) > 0.1 || Math.abs(c.y - b.y) > 0.1) continue;
    const seg1 = Math.hypot(b.x - a.x, b.z - a.z), seg2 = Math.hypot(c.x - b.x, c.z - b.z);
    if (seg1 < 1.5 || seg2 < 2.0) continue;
    const r1 = Math.atan2(b.x - a.x, b.z - a.z), r2 = Math.atan2(c.x - b.x, c.z - b.z);
    let d = r2 - r1; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) < 0.87) continue;
    const previo = out[out.length - 1];
    if (previo && largo[i] - previo.en < 3) continue;
    out.push({ texto: `Gira a la ${d > 0 ? 'izquierda' : 'derecha'}`, en: largo[i], i });
  }
  if (asiento) out.push({ texto: `Tu asiento es el ${asiento.letra} de la mesa ${asiento.mesa}`, en: total, i: pts.length - 1 });
  else if (hasta.nombre) out.push({ texto: hasta.nombre, en: total, i: pts.length - 1 });
  if (!out.length || out[0].en > 1) out.unshift({ texto: asiento ? 'Sigue las flechas del piso' : 'Camina hacia la salida', en: 0, i: 0 });
  return out;
}

// Puntos de referencia del recorrido
export const PUNTOS = {
  plaza: { x: 0.5, z: PLANO.galeria.zEje + 2, piso: 1 },          // en la galería, frente a la entrada
  entrada: { x: 0.5, z: 12.2, piso: 1 },
  vestibulo: { x: 0.5, z: 9.4, piso: 1 },
  salidaInterior: { x: 5.5, z: 12.4, piso: 1, nombre: 'Sal por la puerta de salida' },
  salidaExterior: { x: 5.5, z: PLANO.z1 + 4.5, piso: 1 },
  llegadaPiso2: { x: PLANO.escalera.portal2.x, z: PLANO.escalera.portal2.z, piso: 2 },
};

// ---------------------------------------------------------------------
// Galería: por dónde se camina afuera, de dónde llegan y por dónde se van los estudiantes
// ---------------------------------------------------------------------
// ¿Se puede pisar (x, z) en la galería (o en un pasaje al campus)? Las puertas las revisa quien llama.
export function transitableGaleria(x, z) {
  const G = PLANO.galeria;
  if (z >= G.z1 - 0.3) return z < G.z1 + G.profundidadAla + 4 && G.pasajes.some((p) => x > p.x0 + 0.35 && x < p.x1 - 0.35);
  if (x < G.x0 + 0.35 || x > G.x1 + 6) return false;
  for (const cx of G.columnas) if (Math.hypot(x - cx, z - G.zColumnas) < G.radioColumna + 0.28) return false;
  for (const o of G.objetos) if (Math.hypot(x - o.x, z - o.z) < o.r + 0.2) return false;
  for (const m of G.maceteros) if (x > m.x0 - 0.25 && x < m.x1 + 0.25 && z > m.z0 - 0.25) return false;
  return true;
}

// Punto del campus por donde aparece alguien que llega: uno de los dos pasajes o el extremo abierto
export function origenCampus(azar = Math.random) {
  const G = PLANO.galeria;
  const k = azar();
  if (k < 0.82) {
    const p = G.pasajes[k < 0.38 ? 0 : 1];
    return { x: (p.x0 + p.x1) / 2 + (azar() - 0.5) * 2, z: G.z1 + 1.6 + azar() * 2 };   // dentro del pasaje, casi sin verse
  }
  return { x: G.x1 + 2 + azar() * 4, z: G.zEje + (azar() - 0.5) * 2.4 };
}

// Camino por la galería desde donde estés hasta frente a una puerta (sin atravesar columnas)
export function caminoGaleria(desde, xPuerta) {
  const G = PLANO.galeria;
  const pts = [{ x: desde.x, y: 0, z: desde.z }];
  if (desde.z > G.z1 - 0.3) pts.push({ x: desde.x, y: 0, z: G.zEje + (Math.random() - 0.5) * 1.2 });   // sale del pasaje
  if (Math.abs(desde.x - xPuerta) > 1.5) {
    const z = desde.z > G.zColumnas - 0.6 ? Math.min(Math.max(desde.z, G.zColumnas + 1.2), G.zEje + 1) : Math.max(PLANO.z1 + 1.2, Math.min(desde.z, G.zColumnas - 0.7));
    pts.push({ x: xPuerta + (Math.random() - 0.5) * 0.8, y: 0, z });
  }
  return pts;
}

// De la puerta de salida (afuera) a uno de los pasajes o al extremo abierto, por el eje de la galería
export function caminoAlCampus(desde) {
  const G = PLANO.galeria;
  const pts = [];
  if (desde.z < G.zEje - 1.5) pts.push({ x: desde.x + (Math.random() - 0.5) * 1.6, y: 0, z: G.zEje + (Math.random() - 0.5) * 1.2 });
  const k = Math.random();
  if (k < 0.82) {
    const p = G.pasajes[k < 0.41 ? 0 : 1];
    const x = (p.x0 + p.x1) / 2 + (Math.random() - 0.5) * 1.6;
    pts.push({ x, y: 0, z: G.zEje + (Math.random() - 0.5) * 1.2 }, { x, y: 0, z: G.z1 + 5 + Math.random() * 2 });
  } else pts.push({ x: G.x1 + 3 + Math.random() * 4, y: 0, z: G.zEje + (Math.random() - 0.5) * 2 });
  return pts;
}

// ---------------------------------------------------------------------
// Rutas rápidas para muchos estudiantes a la vez: campos de distancia (Dijkstra) con "padres"
// desde la entrada, la salida y los dos extremos de la escalera. Cada ruta sale en ~1 ms.
// ---------------------------------------------------------------------
class CampoRuta {
  constructor(piso, x, z) {
    const g = grilla(piso);
    this.g = g; this.piso = piso; this.origen = { x, z };
    const [si, sj] = g.cercanaLibre(...g.celda(x, z));
    const N = NX * NZ;
    this.dist = new Float32Array(N).fill(Infinity);
    this.padre = new Int32Array(N).fill(-1);
    const h = new Monticulo();
    const ini = sj * NX + si;
    this.dist[ini] = 0; h.push(ini, 0);
    while (h.size) {
      const c = h.pop();
      const d0 = this.dist[c];
      const ci = c % NX, cj = (c / NX) | 0;
      for (const [di, dj, w] of VEC) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
        const n = nj * NX + ni;
        if (g.b[n]) continue;
        if (di && dj && (g.b[cj * NX + ni] || g.b[nj * NX + ci])) continue;
        const nd = d0 + w * CELDA * (g.holgura[n] < 3 ? 1.25 : 1);
        if (nd < this.dist[n]) { this.dist[n] = nd; this.padre[n] = c; h.push(n, nd); }
      }
    }
  }
  // camino desde (x, z) hasta el origen del campo
  camino(x, z) {
    const g = this.g;
    const [i, j] = g.cercanaLibre(...g.celda(x, z));
    let c = j * NX + i;
    if (!Number.isFinite(this.dist[c])) return [{ x, z }, { ...this.origen }];
    const pts = [];
    let guardia = 0;
    while (c !== -1 && guardia++ < NX * NZ) { pts.push(g.centro(c)); c = this.padre[c]; }
    pts[0] = { x, z };
    pts.push({ ...this.origen });
    return suavizar(pts, g);
  }
}

const ORIGENES_CAMPO = {
  entrada: [1, 0.5, 12.55],
  salida: [1, 5.5, 12.55],
  escalera1: [1, PLANO.escalera.portal1.x, PLANO.escalera.portal1.z],
  escalera2: [2, PLANO.escalera.portal2.x, PLANO.escalera.portal2.z],
};
const camposRuta = {};
export function campoRuta(nombre) {
  if (!camposRuta[nombre]) { const [p, x, z] = ORIGENES_CAMPO[nombre]; camposRuta[nombre] = new CampoRuta(p, x, z); }
  return camposRuta[nombre];
}
const conAltura = (lista, piso) => lista.map((p) => ({ x: p.x, y: yPiso(piso), z: p.z }));

// De la puerta de entrada (por fuera) a un asiento o a un punto {x, z, piso}
export function rutaLlegada(destino, asiento = null) {
  const acc = asiento ? accesoAsiento(asiento) : destino;
  const piso = asiento ? asiento.piso : destino.piso;
  const xP = (PLANO.puertas.entrada.x0 + PLANO.puertas.entrada.x1) / 2;
  let pts = [{ x: xP, y: 0, z: PLANO.z1 + 1.2 }];
  if (piso === 1) {
    pts.push(...conAltura(campoRuta('entrada').camino(acc.x, acc.z).reverse(), 1));
  } else {
    const E = PLANO.escalera;
    pts.push(...conAltura(campoRuta('entrada').camino(E.portal1.x, E.portal1.z).reverse(), 1));
    pts.pop();
    pts.push(...tramoEscalera(true));
    pts.push(...conAltura(campoRuta('escalera2').camino(acc.x, acc.z).reverse(), 2).slice(1));
  }
  if (asiento) pts.push({ x: asiento.x, y: yPiso(piso), z: asiento.z });
  return limpiar(pts);
}

// De cualquier punto {x, z, piso} al campus, saliendo por la puerta de salida y por la galería
export function rutaSalida(desde) {
  const xS = (PLANO.puertas.salida.x0 + PLANO.puertas.salida.x1) / 2;
  let pts = [];
  if (desde.piso === 2) {
    const E = PLANO.escalera;
    pts.push(...conAltura(campoRuta('escalera2').camino(desde.x, desde.z), 2));
    pts.pop();
    pts.push(...tramoEscalera(false));
    pts.push(...conAltura(campoRuta('salida').camino(E.portal1.x, E.portal1.z), 1).slice(1));
  } else {
    pts.push(...conAltura(campoRuta('salida').camino(desde.x, desde.z), 1));
  }
  pts.push({ x: xS, y: 0, z: PLANO.z1 + 1.2 }, ...caminoAlCampus({ x: xS, z: PLANO.z1 + 1.2 }));
  return limpiar(pts);
}

// Entre dos puntos interiores del mismo o distinto piso (para reubicar a alguien)
export function rutaInterior(desde, hasta, asiento = null) {
  return ruta(desde, hasta, { asiento }).pts;
}

function limpiar(pts) {
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y, p.z - pts[i - 1].z) > 0.05);
}

// Lugares para esperar de pie (vestíbulo) y para mirar libros (frente a los estantes)
export const ESPERA = [[-6, 8.6], [-2, 7.7], [3.5, 8.2], [8, 7.9], [12.5, 8.4], [-9.5, 11.6], [15.6, 11.9], [-13, 8.2]]
  .map(([x, z]) => ({ x, z, piso: 1 }));
export const ESTANTES_FRENTE = [
  ...[-10, -7, -4, -1, 2].map((z) => ({ x: -21.1, z, piso: 1 })),
  ...[-3, 2, 7, 12, 16].map((x) => ({ x, z: -11.75, piso: 1 })),
  ...[-10, -6, -2, 2].map((z) => ({ x: -21.1, z, piso: 2 })),
];
// Fila afuera de la entrada cuando el aforo está completo: frente a la puerta y luego a lo largo
// de la galería (hacia los cajeros); si llega al muro, vuelve en una segunda hilera.
export function puestoCola(k) {
  const G = PLANO.galeria;
  if (k < 5) return { x: 0.5 + (k % 2 ? 0.35 : -0.35), y: 0, z: PLANO.z1 + 1.6 + k * 0.72 };
  const j = k - 5;
  const largo = Math.floor((0.5 - 1.3 - (G.x0 + 1.5)) / 0.72);
  const ida = j < largo;
  const i = ida ? j : Math.min(j - largo, largo * 2);
  const x = ida ? 0.5 - 1.3 - i * 0.72 : G.x0 + 1.5 + i * 0.72;
  return { x, y: 0, z: G.zEje + (ida ? -0.3 : 1.3) + (j % 2 ? 0.25 : -0.25) };
}

// ¿Está (x, z) sobre la escalera, entre dos pisos? (ahí las rutas no se recalculan)
export function enEscalera(x, z, nivel = 1) {
  const E = PLANO.escalera;
  const y = alturaSuelo(x, z, nivel);
  return x > E.x0 && x < E.x1 && z > E.z0 && z < E.z1 && y > 0.15 && y < PLANO.alturaPiso - 0.15;
}
