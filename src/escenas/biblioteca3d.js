// Biblioteca en 3D, como la de la Universidad del Pacífico: el piso 1 (Sala 1) a nivel de la galería del
// Pabellón C y la Sala 2 en el sótano, con una escalera en U que baja; 83 mesas y 332 sillas.
// Encima del piso 1 siguen los pisos altos del Pabellón C (no son de la biblioteca: solo su volumen).
// Todo lo repetido se dibuja por instancias (pocas llamadas de dibujo: fluido en el Meta Quest).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLANO, yPiso, fraccionAlzada } from '../biblioteca/plano.js';
import * as TX from '../motor/texturas.js';
import { etiqueta, Pantalla, FUENTE, rectRedondo } from '../motor/textos.js';
import { COLORES } from '../config.js';
import { Gente } from './gente.js';
import { Galeria, cartel, texto, lienzoTex } from './galeria.js';
import { construirInteriorUP } from './interiorUP.js';

const H = PLANO.alturaPiso, HS = PLANO.alturaSala;
const ANCHO = PLANO.x1 - PLANO.x0, FONDO = PLANO.z1 - PLANO.z0;
const Y2 = yPiso(2);                       // piso del sótano (−4,5 m)
const cieloDe = (piso) => yPiso(piso) + H - 0.31;   // cielo raso de cada nivel (piso 1: 4,19 m · sótano: −0,31 m)
const ALZADO = 9.5;                        // casa de muñecas: cuánto se levanta el piso 1 para ver el sótano
const COL = {
  libre: new THREE.Color(COLORES.libre), ocupado: new THREE.Color(COLORES.ocupado),
  objeto: new THREE.Color(COLORES.objeto), sinDato: new THREE.Color(COLORES.sinDato),
  tuyo: new THREE.Color(0x38bdf8), base: new THREE.Color(0x5b6472),
};

function geoCaja(w, h, d, x = 0, y = 0, z = 0) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }
const geoCajaL = (x0, x1, y0, y1, z0, z1) => geoCaja(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

// Superficie horizontal que mira hacia arriba, de un polígono en (x, z), con huecos; uv normalizados al
// rectángulo r (así la textura repite igual que en un PlaneGeometry de ese tamaño)
function geoSuelo(puntos, r, huecos = []) {
  const forma = new THREE.Shape(puntos.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of huecos) forma.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ShapeGeometry(forma);
  g.rotateX(-Math.PI / 2);                 // (x, −z) → (x, 0, z), con la normal hacia +y
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - r.x0) / r.w, 1 - (p.getZ(i) - r.z0) / r.d);
  return g;
}
const rect = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

// Baldosas (piedra del vestíbulo, adoquines de la plaza)
function baldosas({ tam = 512, base = 0xd9d7d1, junta = 0xa8a59e, n = 4, variacion = 0.05, semilla = 2 } = {}) {
  const c = TX.lienzo(tam, tam), ctx = c.getContext('2d');
  const r = TX.azar(semilla);
  const col = new THREE.Color(base);
  const paso = tam / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const k = 1 + (r() - 0.5) * variacion * 2;
    ctx.fillStyle = `rgb(${col.r * 255 * k | 0},${col.g * 255 * k | 0},${col.b * 255 * k | 0})`;
    ctx.fillRect(i * paso, j * paso, paso, paso);
    for (let m = 0; m < 160; m++) {
      ctx.fillStyle = `rgba(0,0,0,${r() * 0.05})`;
      ctx.fillRect(i * paso + r() * paso, j * paso + r() * paso, 2 + r() * 3, 2 + r() * 3);
    }
  }
  ctx.strokeStyle = '#' + new THREE.Color(junta).getHexString(); ctx.lineWidth = Math.max(2, tam / 200);
  for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(i * paso, 0); ctx.lineTo(i * paso, tam); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * paso); ctx.lineTo(tam, i * paso); ctx.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// Silla de lectura (asiento, respaldo y patas en una sola geometría), mirando hacia +z
function geoSilla() {
  const partes = [
    geoCaja(0.46, 0.05, 0.44, 0, 0.45, 0),
    geoCaja(0.46, 0.42, 0.05, 0, 0.7, -0.2),
  ];
  for (const sx of [-0.2, 0.2]) for (const sz of [-0.18, 0.18]) partes.push(geoCaja(0.035, 0.45, 0.035, sx, 0.225, sz));
  return mergeGeometries(partes);
}
function geoCojin() { return geoCaja(0.42, 0.035, 0.38, 0, 0.49, 0.01); }

function visibleEnEscena(o) { for (; o; o = o.parent) if (!o.visible) return false; return true; }

export class Biblioteca3D {
  constructor() {
    this.grupo = new THREE.Group();
    this.grupo.name = 'biblioteca';
    this.pisos = { 1: new THREE.Group(), 2: new THREE.Group() };
    this.techo = new THREE.Group();
    this.exterior = new THREE.Group();
    this.pisos[2].position.y = 0;
    this.grupo.add(this.exterior, this.pisos[1], this.pisos[2], this.techo);
    this.materialesPiso = { 1: [], 2: [] };
    this.explosion = 0;
    this.#materiales();
    this.#exterior();
    this.galeria = new Galeria({ mat: this.mat });
    this.exterior.add(this.galeria.grupo);
    this.#estructura();
    this.#escalera();
    this.#mobiliario();
    this.#estantes();
    this.#vestibulo();
    this.#senales();
    this.#luminarias();
    this.#enchufes();
    construirInteriorUP(this);
    this.#separarMateriales();
    this.#ruta();
    this.#caminantes();
    this.#flotantes();
  }

  // ---------------------------------------------------------------- textos que flotan y se desvanecen (+1 en la puerta…)
  #flotantes() {
    this.poolFlot = [];
    for (let i = 0; i < 16; i++) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 128;
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, sizeAttenuation: false }));
      sp.visible = false; sp.renderOrder = 12;
      sp.userData = { c, tex, vida: 0, vidaMax: 1, y0: 0 };
      this.grupo.add(sp); this.poolFlot.push(sp);
    }
  }

  flotante(texto, x, y, z, color = '#4ade80', { escala = 1, vida = 1.8 } = {}) {
    const sp = this.poolFlot.find((s) => !s.visible) || this.poolFlot.reduce((a, b) => (a.userData.vida < b.userData.vida ? a : b));
    const { c, tex } = sp.userData;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.font = '800 72px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(6,10,20,0.88)'; ctx.strokeText(texto, 256, 66, 490);
    ctx.fillStyle = color; ctx.fillText(texto, 256, 66, 490);
    tex.needsUpdate = true;
    const k = 0.075 * escala;          // fracción de la altura de la pantalla (no se achica con la distancia)
    sp.scale.set(k * 4, k, 1);
    sp.position.set(x, y, z);
    Object.assign(sp.userData, { vida, vidaMax: vida, y0: y });
    sp.material.opacity = 1;
    sp.visible = true;
  }

  // ---------------------------------------------------------------- tomacorrientes sobre las mesas que los tienen
  #enchufes() {
    for (const piso of [1, 2]) {
      const mesas = PLANO.mesas.filter((m) => m.piso === piso && m.asientos[0].enchufe);
      const geo = mergeGeometries([geoCaja(0.34, 0.035, 0.09, 0, PLANO.mesa.alto + 0.0175, 0), geoCaja(0.05, 0.012, 0.03, -0.09, PLANO.mesa.alto + 0.04, 0), geoCaja(0.05, 0.012, 0.03, 0.09, PLANO.mesa.alto + 0.04, 0)]);
      const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4, emissive: 0xf59e0b, emissiveIntensity: 0.12 }), mesas.length);
      const m4 = new THREE.Matrix4();
      mesas.forEach((m, i) => { m4.makeTranslation(m.x, yPiso(piso), m.z); inst.setMatrixAt(i, m4); });
      this.pisos[piso].add(inst);
    }
  }

  // ---------------------------------------------------------------- personas (caminando y sentadas) y marca del rival
  #caminantes() {
    this.gente = new Gente({ texturaSombra: this.texturaSombra });
    this.grupo.add(this.gente.grupo);
    // marca del rival: flecha roja que flota sobre quien va a tu asiento
    this.marcaRival = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.32, 16).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xef4444, toneMapped: false }));
    this.marcaRival.visible = false;
    this.grupo.add(this.marcaRival);
  }

  // Personas: quienes caminan (la multitud) y quienes están sentados (asientos ocupados)
  actualizarGente({ multitud, estado, camara, renderer, t, dt, calidad }) {
    this.gente.actualizar({
      multitud, estado, explosion: this.explosion, pisoVisible: (p) => this.pisos[p].visible,
      camara, renderer, t, dt, calidad, avatar: this.avatar,
    });
    const rival = multitud.rival;
    if (rival && rival.visible) {
      this.marcaRival.visible = true;
      this.marcaRival.position.set(rival.x, rival.y + this.explosion * fraccionAlzada(rival.x, rival.y, rival.z) + 2.15 + Math.sin(t / 180) * 0.08, rival.z);
    } else this.marcaRival.visible = false;
  }

  // Estudiante que camina bajo un rayo (para inspeccionarlo)
  caminanteEn(raycaster) { return this.gente.caminanteEn(raycaster); }

  // Cada piso con sus propios materiales: así se puede atenuar uno sin tocar el otro
  #separarMateriales() {
    for (const piso of [1, 2]) {
      const cache = new Map();
      const copia = (m) => { if (!cache.has(m)) cache.set(m, m.clone()); return cache.get(m); };
      this.pisos[piso].traverse((o) => {
        if (!o.material) return;
        o.material = Array.isArray(o.material) ? o.material.map(copia) : copia(o.material);
      });
    }
  }

  // ---------------------------------------------------------------- materiales
  #materiales() {
    const parquet = TX.madera({ tam: 1024, tablones: 16, claro: 0xcaa47b, oscuro: 0x9b7552, semilla: 41, vetas: 6 });
    for (const t of [parquet.map, parquet.normalMap, parquet.roughnessMap]) t.repeat.set(ANCHO / 4, FONDO / 4);
    const yeso = TX.grano({ tam: 256, base: 0xf1efea, variacion: 0.025, escala: 6, semilla: 9, fuerzaNormal: 0.3 });
    yeso.map.repeat.set(10, 2); yeso.normalMap.repeat.set(10, 2);
    const piedra = baldosas({ base: 0xdedbd3, junta: 0xb5b1a7, n: 4, semilla: 5 });
    piedra.repeat.set(ANCHO / 2.4, 6.5 / 2.4);
    const madera = TX.madera({ tam: 512, tablones: 1, claro: 0xd9b88f, oscuro: 0xb08a60, semilla: 17, vetas: 18 });
    this.mat = {
      parquet: new THREE.MeshStandardMaterial({ map: parquet.map, normalMap: parquet.normalMap, roughnessMap: parquet.roughnessMap, roughness: 0.62, envMapIntensity: 0.55 }),
      piedra: new THREE.MeshStandardMaterial({ map: piedra, roughness: 0.38, envMapIntensity: 0.7 }),
      yeso: new THREE.MeshStandardMaterial({ map: yeso.map, normalMap: yeso.normalMap, roughness: 0.95 }),
      techo: new THREE.MeshStandardMaterial({ color: 0xf4f3ef, roughness: 1 }),
      losa: new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.9 }),
      concreto: new THREE.MeshStandardMaterial({ color: 0xc8c6c0, roughness: 0.85 }),
      marco: new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.38, metalness: 0.75 }),
      vidrio: new THREE.MeshStandardMaterial({ color: 0xbfdcef, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.22, envMapIntensity: 1.4, depthWrite: false, side: THREE.DoubleSide }),
      mesa: new THREE.MeshStandardMaterial({ map: madera.map, normalMap: madera.normalMap, roughness: 0.48 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.35, metalness: 0.8 }),
      silla: new THREE.MeshStandardMaterial({ color: 0x4a5160, roughness: 0.7 }),
      cojin: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, emissive: 0xffffff, emissiveIntensity: 0.0 }),
      verde: new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.6 }),
    };
    this.texturaSombra = TX.sombraSuave();
    this.texturaHalo = TX.halo();
  }

  // ---------------------------------------------------------------- exterior: césped y árboles del campus (adelante está la galería)
  #exterior() {
    const g = this.exterior;
    const G = PLANO.galeria;
    const pasto = TX.grano({ tam: 256, base: 0x5f8f4a, variacion: 0.12, escala: 18, semilla: 4, fuerzaNormal: 0.6 });
    pasto.map.repeat.set(30, 30); pasto.normalMap.repeat.set(30, 30);
    // (con el hueco del sótano: se ve cuando el piso 1 se levanta en la casa de muñecas)
    const e = 0.35;
    const cesped = new THREE.Mesh(geoSuelo(rect(-120, 120, -120, 120), { x0: -120, z0: -120, w: 240, d: 240 }, [rect(PLANO.x0 - e, PLANO.x1 + e, PLANO.z0 - e, PLANO.z1 + e)]),
      new THREE.MeshStandardMaterial({ map: pasto.map, normalMap: pasto.normalMap, roughness: 1 }));
    cesped.position.y = -0.05;
    g.add(cesped);
    // árboles (instancias)
    const r = TX.azar(77);
    const pos = [];
    for (let i = 0; i < 14; i++) pos.push([-36 + i * 7 + (r() - 0.5) * 2, G.z1 + G.profundidadAla + 5 + (r() - 0.5) * 3]);   // detrás del ala de enfrente
    for (let i = 0; i < 6; i++) pos.push([G.x1 + 7 + r() * 8, PLANO.z1 - 6 + i * 5.5]);                               // más allá del extremo abierto
    for (let i = 0; i < 6; i++) pos.push([PLANO.x0 - 9 - r() * 8, -12 + i * 4.6]);
    for (let i = 0; i < 5; i++) pos.push([PLANO.x1 + 8 + r() * 6, -14 + i * 3.4]);
    for (let i = 0; i < 8; i++) pos.push([-26 + i * 7 + (r() - 0.5) * 2, PLANO.z0 - 7 - r() * 3]);
    const tronco = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.24, 3, 7), new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 1 }), pos.length);
    const copa = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.2, 1), new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.95, flatShading: true }), pos.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    pos.forEach(([x, z], i) => {
      const k = 0.8 + r() * 0.5;
      m.compose(new THREE.Vector3(x, 1.5 * k, z), q, s.set(k, k, k)); tronco.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(x, 3.6 * k, z), q.setFromEuler(new THREE.Euler(r(), r(), r())), s.set(k, k * 1.1, k)); copa.setMatrixAt(i, m);
      q.identity();
    });
    g.add(tronco, copa);
  }

  // ---------------------------------------------------------------- estructura: losas, muros, vidrio, techos
  // piso 1 (this.pisos[1]): losa con el hueco de la escalera, sala, vestíbulo, muros y vidrio; bajo la losa, el
  //   cielo raso del sótano · sótano (this.pisos[2]): piso, muros de contención y acabados · encima (this.techo):
  //   cielo raso del piso 1 y los pisos altos del Pabellón C, que se ocultan en las vistas desde arriba
  #estructura() {
    const E = PLANO.escalera, zv = PLANO.vestibuloZ;
    const { x0, x1, z0, z1 } = PLANO;
    const hueco = rect(E.x0, E.x1, E.z0, E.z1);

    // --- piso 1: parquet en la sala y piedra en el vestíbulo, con el hueco de la escalera que baja
    const sala1 = new THREE.Mesh(geoSuelo([[x0, z0], [x1, z0], [x1, zv], [E.x1, zv], [E.x1, E.z0], [E.x0, E.z0], [E.x0, zv], [x0, zv]], { x0, z0, w: ANCHO, d: FONDO }), this.mat.parquet);
    sala1.position.y = 0.002;
    const vest = new THREE.Mesh(geoSuelo([[x0, zv], [E.x0, zv], [E.x0, E.z1], [E.x1, E.z1], [E.x1, zv], [x1, zv], [x1, z1], [x0, z1]], { x0, z0: zv, w: ANCHO, d: z1 - zv }), this.mat.piedra);
    vest.position.y = 0.003;
    // losa (solo los cantos: arriba va el piso y abajo el cielo raso del sótano)
    const forma = new THREE.Shape(rect(x0, x1, z0, z1).map(([x, z]) => new THREE.Vector2(x, z)));
    forma.holes.push(new THREE.Path(hueco.map(([x, z]) => new THREE.Vector2(x, z))));
    const losaGeo = new THREE.ExtrudeGeometry(forma, { depth: 0.3, bevelEnabled: false });
    losaGeo.rotateX(Math.PI / 2);           // el plano xy pasa a xz; la extrusión baja en −y
    losaGeo.groups = losaGeo.groups.filter((g) => g.materialIndex === 1);
    const losa = new THREE.Mesh(losaGeo, [this.mat.losa, this.mat.losa]);
    const cieloS = new THREE.Mesh(new THREE.ShapeGeometry(forma), this.mat.techo);
    cieloS.rotation.x = Math.PI / 2; cieloS.position.y = cieloDe(2);
    for (const o of [sala1, vest]) o.receiveShadow = true;
    this.pisos[1].add(losa, sala1, vest, cieloS);

    // --- muros del piso 1: fondo e izquierda (con franja de ventanas altas al fondo) y muro cortina a la derecha
    const fondo = new THREE.Mesh(geoCaja(ANCHO + 0.6, H * 0.62, 0.3, 0, H * 0.31, z0 - 0.15), this.mat.yeso);
    const fondoAlto = new THREE.Mesh(geoCaja(ANCHO + 0.6, H * 0.12, 0.3, 0, H * 0.94, z0 - 0.15), this.mat.yeso);
    const izq = new THREE.Mesh(geoCaja(0.3, H, FONDO, x0 - 0.15, H / 2, 0), this.mat.yeso);
    const franja = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO, H * 0.26), this.mat.vidrio);
    franja.position.set(0, H * 0.75, z0 - 0.05);
    const vid1 = new THREE.Mesh(new THREE.PlaneGeometry(FONDO, H), this.mat.vidrio);
    vid1.position.set(x1, H / 2, 0); vid1.rotation.y = Math.PI / 2;
    this.pisos[1].add(fondo, fondoAlto, izq, franja, vid1);
    const montantes1 = [], montantesA = [];
    for (let z = z0; z <= z1 + 0.01; z += FONDO / 10) montantes1.push([x1, H / 2, z, 0.12, H, 0.12]);
    montantes1.push([x1, 0.06, 0, 0.14, 0.12, FONDO], [x1, H - 0.06, 0, 0.14, 0.12, FONDO], [x1, 1.1, 0, 0.1, 0.06, FONDO]);

    // --- sótano: parquet, muros de contención (concreto) con acabado de yeso, contrazócalo de madera y rejillas
    const salaS = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO, FONDO), this.mat.parquet);
    salaS.rotation.x = -Math.PI / 2; salaS.position.y = Y2 + 0.002;
    salaS.receiveShadow = true;
    const e = 0.35, yb = Y2 - 0.3, yt = -0.012;
    const contencion = new THREE.Mesh(mergeGeometries([
      geoCajaL(x0 - e, x1 + e, yb, yt, z0 - e, z0), geoCajaL(x0 - e, x1 + e, yb, yt, z1, z1 + e),
      geoCajaL(x0 - e, x0, yb, yt, z0, z1), geoCajaL(x1, x1 + e, yb, yt, z0, z1),
    ]), this.mat.concreto);
    const hS = cieloDe(2) - Y2, yM = (Y2 + cieloDe(2)) / 2;
    const caras = [
      new THREE.PlaneGeometry(ANCHO, hS).translate(0, yM, z0 + 0.005),
      new THREE.PlaneGeometry(ANCHO, hS).rotateY(Math.PI).translate(0, yM, z1 - 0.005),
      new THREE.PlaneGeometry(FONDO, hS).rotateY(Math.PI / 2).translate(x0 + 0.005, yM, 0),
      new THREE.PlaneGeometry(FONDO, hS).rotateY(-Math.PI / 2).translate(x1 - 0.005, yM, 0),
    ];
    const acabado = new THREE.Mesh(mergeGeometries(caras), this.mat.yeso);
    // contrazócalo de madera (1 m) con remate de aluminio, alrededor de la sala
    const zoc = [], remate = [];
    const t = 0.03, hz = 1.0;
    zoc.push(geoCajaL(x0, x1, Y2, Y2 + hz, z0, z0 + t), geoCajaL(x0, x1, Y2, Y2 + hz, z1 - t, z1), geoCajaL(x0, x0 + t, Y2, Y2 + hz, z0, z1), geoCajaL(x1 - t, x1, Y2, Y2 + hz, z0, z1));
    remate.push(geoCajaL(x0, x1, Y2 + hz, Y2 + hz + 0.03, z0, z0 + t + 0.01), geoCajaL(x0, x1, Y2 + hz, Y2 + hz + 0.03, z1 - t - 0.01, z1),
      geoCajaL(x0, x0 + t + 0.01, Y2 + hz, Y2 + hz + 0.03, z0, z1), geoCajaL(x1 - t - 0.01, x1, Y2 + hz, Y2 + hz + 0.03, z0, z1));
    const madera = new THREE.MeshStandardMaterial({ color: 0xa57c55, roughness: 0.58 });
    // rejillas de ventilación arriba (un sótano se ventila con extracción mecánica)
    const rej = [];
    const yr = cieloDe(2) - 0.35;
    for (let x = x0 + 3; x < x1 - 2; x += 6) { rej.push(geoCajaL(x - 0.45, x + 0.45, yr - 0.14, yr + 0.14, z0, z0 + 0.03)); }
    for (let z = z0 + 3; z < z1 - 2; z += 6) { rej.push(geoCajaL(x1 - 0.03, x1, yr - 0.14, yr + 0.14, z - 0.45, z + 0.45)); }
    const rejTex = lienzoTex(64, 64, (ctx, w, h) => { ctx.fillStyle = '#b9bec3'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#4a4f55'; for (let k = 0; k < 6; k++) ctx.fillRect(4, 5 + k * 9.6, w - 8, 4.6); });
    const rejMat = new THREE.MeshStandardMaterial({ map: rejTex, roughness: 0.5, metalness: 0.3 });
    // extintores (rojos, con su cartel) en las esquinas
    const rojo = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.45 });
    const ext = [[x1 - 0.2, 11.5, -Math.PI / 2], [x0 + 0.2, -12.0, Math.PI / 2]].map(([x, z]) => new THREE.CylinderGeometry(0.09, 0.09, 0.55, 14).translate(x, Y2 + 0.85, z));
    this.pisos[2].add(salaS, contencion, acabado, new THREE.Mesh(mergeGeometries(zoc), madera), new THREE.Mesh(mergeGeometries(remate), this.mat.metal),
      new THREE.Mesh(mergeGeometries(rej), rejMat), new THREE.Mesh(mergeGeometries(ext), rojo));
    // muro gráfico del fondo: SALA 2 · SÓTANO (sin ventanas, la sala se orienta con él)
    const grafica = cartel(10, 1.25, 1600, (ctx, w, h) => {
      ctx.fillStyle = '#1f3a6d'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, h * 0.86, w, h * 0.04);
      texto(ctx, 'SALA 2 · SÓTANO', w * 0.5, h * 0.36, { tam: h * 0.38, peso: 800 });
      texto(ctx, 'Colección 600–999 · Hemeroteca · Zona de silencio y trabajo en grupo', w * 0.5, h * 0.72, { tam: h * 0.15, peso: 500, color: '#dbeafe', max: w * 0.94 });
    });
    grafica.position.set(1.5, Y2 + 3.05, z0 + 0.02);
    this.pisos[2].add(grafica);

    // --- encima del piso 1: su cielo raso (losa) y los pisos altos del Pabellón C, con ventanas de franjas
    const losaA = new THREE.Mesh(geoCaja(ANCHO, 0.3, FONDO, 0, H - 0.15, 0), this.mat.techo);
    const yA = H, altoA = HS + 0.45;
    const murosA = [
      geoCaja(ANCHO + 0.6, altoA, 0.3, 0, yA + altoA / 2, z0 - 0.15),
      geoCaja(0.3, altoA, FONDO, x0 - 0.15, yA + altoA / 2, 0),
    ];
    for (let z = z0; z <= z1 + 0.01; z += FONDO / 10) montantesA.push([x1, yA + altoA / 2, z, 0.12, altoA, 0.12]);
    montantesA.push([x1, yA + 0.06, 0, 0.14, 0.12, FONDO], [x1, yA + altoA - 0.06, 0, 0.14, 0.12, FONDO], [x1, yA + 1.1, 0, 0.1, 0.06, FONDO]);
    const vidA = [new THREE.PlaneGeometry(FONDO, altoA).rotateY(Math.PI / 2).translate(x1, yA + altoA / 2, 0)];
    // fachada hacia la galería: franja de ventanas entre muros grises
    const v0 = yA + 1.7, v1 = yA + 3.4;
    for (let x = x0; x <= x1 + 0.01; x += ANCHO / 14) montantesA.push([x, (v0 + v1) / 2, z1, 0.1, v1 - v0, 0.1]);
    montantesA.push([0, v0, z1, ANCHO, 0.08, 0.12], [0, v1, z1, ANCHO, 0.08, 0.12]);
    vidA.push(new THREE.PlaneGeometry(ANCHO, v1 - v0).translate(0, (v0 + v1) / 2, z1));
    const muroG = new THREE.MeshStandardMaterial({ color: 0xb3b5b6, roughness: 0.9 });
    // borde de la losa visible en la fachada y a la derecha
    montantesA.push([0, H - 0.15, z1 + 0.05, ANCHO + 0.6, 0.6, 0.3], [x1 + 0.05, H - 0.15, 0, 0.3, 0.6, FONDO + 0.6]);
    const cubierta = new THREE.Mesh(geoCaja(ANCHO + 0.6, 0.45, FONDO + 0.6, 0, H + HS + 0.225, 0), this.mat.concreto);
    this.techo.add(losaA, new THREE.Mesh(mergeGeometries(murosA), this.mat.yeso), cubierta,
      new THREE.Mesh(mergeGeometries([geoCaja(ANCHO + 0.6, v0 - yA, 0.3, 0, (yA + v0) / 2, z1 + 0.15), geoCaja(ANCHO + 0.6, yA + altoA - v1, 0.3, 0, (v1 + yA + altoA) / 2, z1 + 0.15)]), muroG),
      new THREE.Mesh(mergeGeometries(vidA), this.galeria.m.franjas));
    const geoM = new THREE.BoxGeometry(1, 1, 1);
    const instancias = (lista) => {
      const inst = new THREE.InstancedMesh(geoM, this.mat.marco, lista.length);
      const mm = new THREE.Matrix4();
      lista.forEach(([x, y, z, w, h, d], i) => { mm.makeScale(w, h, d); mm.setPosition(x, y, z); inst.setMatrixAt(i, mm); });
      return inst;
    };
    this.pisos[1].add(instancias(montantes1));
    this.techo.add(instancias(montantesA));
    // pilares en las esquinas y a la derecha (adelante están las columnas redondas de la galería)
    const pilares = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, H + HS + 0.45, 0.5), this.mat.concreto, 6);
    const mm = new THREE.Matrix4();
    [[x0, z1], [x1, z1], [x1, z0], [x0, z0], [x1, 0], [x0, 0]].forEach(([x, z], i) => {
      mm.makeTranslation(x, (H + HS + 0.45) / 2, z); pilares.setMatrixAt(i, mm);
    });
    this.techo.add(pilares);
  }

  // ---------------------------------------------------------------- escalera en U que baja al sótano
  // Tramo 1: del piso 1 (z 12,4) al descanso (−2,25 m) · tramo 2: del descanso al sótano (−4,5 m, z 12,4)
  #escalera() {
    const E = PLANO.escalera, t1 = E.tramo1, t2 = E.tramo2, R = E.rellano;
    const baja = -Y2 / 2;                    // cada tramo baja 2,25 m
    const pasos = 13;
    const partes = [];
    // peldaños de zAbajo (lado del piso 1) a zArriba (lado del sótano): la huella k a la altura del recorrido
    const narices = [];                      // banda antideslizante oscura en el borde de cada peldaño
    const tramo = (t, yIni, base) => {
      const largo = Math.abs(t.zAbajo - t.zArriba), dir = Math.sign(t.zArriba - t.zAbajo);
      const huella = largo / pasos, contra = baja / pasos;
      for (let k = 0; k < pasos; k++) {
        const zc = t.zAbajo + dir * (k + 0.5) * huella, yH = yIni - (k + 0.5) * contra;
        partes.push(geoCajaL(t.x0, t.x1, base, yH, zc - huella / 2, zc + huella / 2));
        const zb = zc + dir * huella / 2;    // borde hacia el peldaño de abajo
        narices.push(geoCajaL(t.x0 + 0.06, t.x1 - 0.06, yH - 0.004, yH + 0.006, Math.min(zb, zb - dir * 0.07), Math.max(zb, zb - dir * 0.07)));
      }
    };
    tramo(t1, 0, -baja - 0.25);              // el tramo de arriba vuela sobre el sótano (bajo él hay 2 m libres)
    tramo(t2, -baja, Y2);                    // el de abajo apoya en el piso del sótano
    partes.push(geoCajaL(R.x0, R.x1, -baja - 0.25, -baja, R.z0, R.z1));
    // columnas bajo el descanso
    partes.push(geoCajaL(R.x0 + 0.15, R.x0 + 0.45, Y2, -baja - 0.25, R.z0 + 0.15, R.z0 + 0.45), geoCajaL(R.x1 - 0.45, R.x1 - 0.15, Y2, -baja - 0.25, R.z0 + 0.15, R.z0 + 0.45));
    const escalera = new THREE.Mesh(mergeGeometries(partes), new THREE.MeshStandardMaterial({ color: 0xd6d2c8, roughness: 0.7 }));
    escalera.receiveShadow = true; escalera.castShadow = true;
    this.pisos[2].add(escalera, new THREE.Mesh(mergeGeometries(narices), new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.6 })));
    // barandas de vidrio: a los lados de los tramos (siguiendo la pendiente) y en los bordes del descanso
    const vidrioBaranda = new THREE.MeshStandardMaterial({ color: 0xcfe8f5, transparent: true, opacity: 0.28, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide });
    const run1 = Math.abs(t1.zAbajo - t1.zArriba), run2 = Math.abs(t2.zArriba - t2.zAbajo);
    const p1 = -Math.atan2(baja, run1), p2 = Math.atan2(baja, run2);   // el tramo 1 baja hacia −z; el 2, hacia +z
    const inclinadas = [
      { x: t1.x1 + 0.03, z: (t1.zAbajo + t1.zArriba) / 2, y: -baja / 2 + 0.5, w: Math.hypot(run1, baja), pend: p1 },
      { x: t2.x0 - 0.03, z: (t2.zAbajo + t2.zArriba) / 2, y: -baja * 1.5 + 0.5, w: Math.hypot(run2, baja), pend: p2 },
      { x: t2.x1 + 0.03, z: (t2.zAbajo + t2.zArriba) / 2, y: -baja * 1.5 + 0.5, w: Math.hypot(run2, baja), pend: p2 },
    ];
    for (const b of inclinadas) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(b.w, 1.0), vidrioBaranda);
      p.position.set(b.x, b.y, b.z); p.rotation.set(0, Math.PI / 2, b.pend, 'YXZ');
      this.pisos[2].add(p);
    }
    const yD = -baja + 0.5;
    const dFondo = new THREE.Mesh(new THREE.PlaneGeometry(R.x1 - R.x0, 1.0), vidrioBaranda);
    dFondo.position.set((R.x0 + R.x1) / 2, yD, R.z0);
    const dDer = new THREE.Mesh(new THREE.PlaneGeometry(R.z1 - R.z0, 1.0), vidrioBaranda);
    dDer.position.set(R.x1 + 0.03, yD, (R.z0 + R.z1) / 2); dDer.rotation.y = Math.PI / 2;
    const dOjo = new THREE.Mesh(new THREE.PlaneGeometry(t2.x0 - t1.x1, 1.0), vidrioBaranda);
    dOjo.position.set((t1.x1 + t2.x0) / 2, yD, R.z1);
    const pasD = new THREE.Mesh(mergeGeometries([
      geoCaja(R.x1 - R.x0, 0.05, 0.06, (R.x0 + R.x1) / 2, -baja + 1.02, R.z0),
      geoCaja(0.06, 0.05, R.z1 - R.z0, R.x1 + 0.03, -baja + 1.02, (R.z0 + R.z1) / 2),
      geoCaja(t2.x0 - t1.x1, 0.05, 0.06, (t1.x1 + t2.x0) / 2, -baja + 1.02, R.z1),
    ]), this.mat.metal);
    this.pisos[2].add(dFondo, dDer, dOjo, pasD);
    // hueco en el piso 1: baranda al fondo, a la derecha y al frente (salvo la boca del tramo 1)
    const yH = 0.5;
    const hFondo = new THREE.Mesh(new THREE.PlaneGeometry(E.x1 - E.x0, 1.0), vidrioBaranda);
    hFondo.position.set((E.x0 + E.x1) / 2, yH, E.z0);
    const hDer = new THREE.Mesh(new THREE.PlaneGeometry(E.z1 - E.z0, 1.0), vidrioBaranda);
    hDer.position.set(E.x1, yH, (E.z0 + E.z1) / 2); hDer.rotation.y = Math.PI / 2;
    const hFrente = new THREE.Mesh(new THREE.PlaneGeometry(E.x1 - t1.x1, 1.0), vidrioBaranda);
    hFrente.position.set((t1.x1 + E.x1) / 2, yH, E.z1);
    const pasamanos = new THREE.Mesh(mergeGeometries([
      geoCaja(E.x1 - E.x0, 0.05, 0.06, (E.x0 + E.x1) / 2, 1.02, E.z0),
      geoCaja(0.06, 0.05, E.z1 - E.z0, E.x1, 1.02, (E.z0 + E.z1) / 2),
      geoCaja(E.x1 - t1.x1, 0.05, 0.06, (t1.x1 + E.x1) / 2, 1.02, E.z1),
    ]), this.mat.metal);
    this.pisos[1].add(hFondo, hDer, hFrente, pasamanos);
    // carteles orientados hacia las salas (+x): en el piso 1 baja al sótano; en el sótano sube a la salida
    const cartelP1 = etiqueta('↓ Escalera · Sótano · Sala 2', { alto: 0.26, color: '#f8fafc', fondo: 'rgba(15,23,42,0.85)', tamFuente: 60 });
    cartelP1.position.set(-16.15, 2.5, 10.6); cartelP1.rotation.y = Math.PI / 2;
    const cartelP1b = cartelP1.clone(); cartelP1b.rotation.y = -Math.PI / 2; cartelP1b.position.x -= 0.02;
    this.pisos[1].add(cartelP1, cartelP1b);
    const cartelS = etiqueta('↑ Escalera · Piso 1 · Salida', { alto: 0.26, color: '#f8fafc', fondo: 'rgba(15,23,42,0.85)', tamFuente: 60 });
    cartelS.position.set(-16.15, Y2 + 2.9, 10.6); cartelS.rotation.y = Math.PI / 2;
    const cartelSb = cartelS.clone(); cartelSb.rotation.y = -Math.PI / 2; cartelSb.position.x -= 0.02;
    this.pisos[2].add(cartelS, cartelSb);
  }

  // ---------------------------------------------------------------- mesas, sillas, personas, cojines y halos
  #mobiliario() {
    this.asientos = PLANO.asientos;
    const nA = this.asientos.length;
    this.indicePorId = new Map(this.asientos.map((a, i) => [a.id, i]));
    for (const piso of [1, 2]) {
      const mesas = PLANO.mesas.filter((m) => m.piso === piso);
      const asientos = this.asientos.filter((a) => a.piso === piso);
      const y0 = yPiso(piso);
      const M = PLANO.mesa;
      // tablero y patas
      const tablero = new THREE.InstancedMesh(geoCaja(M.ancho, 0.045, M.fondo, 0, M.alto - 0.0225, 0), this.mat.mesa, mesas.length);
      const patasGeo = mergeGeometries([
        geoCaja(0.06, M.alto - 0.045, 0.06, -M.ancho / 2 + 0.12, (M.alto - 0.045) / 2, -M.fondo / 2 + 0.1),
        geoCaja(0.06, M.alto - 0.045, 0.06, M.ancho / 2 - 0.12, (M.alto - 0.045) / 2, -M.fondo / 2 + 0.1),
        geoCaja(0.06, M.alto - 0.045, 0.06, -M.ancho / 2 + 0.12, (M.alto - 0.045) / 2, M.fondo / 2 - 0.1),
        geoCaja(0.06, M.alto - 0.045, 0.06, M.ancho / 2 - 0.12, (M.alto - 0.045) / 2, M.fondo / 2 - 0.1),
        geoCaja(0.02, 0.16, M.fondo * 0.7, 0, M.alto - 0.13, 0),    // separador central bajo
        geoCaja(M.ancho * 0.9, 0.22, 0.012, 0, M.alto + 0.11, 0),     // panel divisor sobre la mesa
      ]);
      const patas = new THREE.InstancedMesh(patasGeo, this.mat.metal, mesas.length);
      const sombras = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.texturaSombra, transparent: true, depthWrite: false, opacity: 0.55 }), mesas.length);
      const m4 = new THREE.Matrix4();
      mesas.forEach((m, i) => {
        m4.makeTranslation(m.x, y0, m.z); tablero.setMatrixAt(i, m4); patas.setMatrixAt(i, m4);
        m4.makeScale(M.ancho * 1.6, 1, 3.1); m4.setPosition(m.x, y0 + 0.006, m.z); sombras.setMatrixAt(i, m4);
      });
      tablero.castShadow = true; tablero.receiveShadow = true; patas.castShadow = true;
      sombras.renderOrder = 1;
      this.pisos[piso].add(tablero, patas, sombras);
      this[`mesas${piso}`] = { tablero, mesas };
      // sillas, cojines (color del estado), halos, personas, mochilas y laptops
      const sillas = new THREE.InstancedMesh(geoSilla(), this.mat.silla, asientos.length);
      const cojines = new THREE.InstancedMesh(geoCojin(), this.mat.cojin.clone(), asientos.length);
      // aro de color bajo cada silla: se lee desde lejos y desde arriba (verde libre, rojo ocupado…)
      const halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.15, 1.15).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.texturaHalo, transparent: true, depthWrite: false, toneMapped: false, opacity: 1 }), asientos.length);
      const mochilas = new THREE.InstancedMesh(geoCaja(0.32, 0.4, 0.2, 0, 0.72, -0.02), new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.85 }), asientos.length);
      // laptop sobre la mesa, frente a la silla (la silla está a ~0.98 m del centro de la mesa)
      const laptops = new THREE.InstancedMesh(mergeGeometries([geoCaja(0.32, 0.015, 0.22, 0, M.alto + 0.008, 0.62), (() => { const g = geoCaja(0.32, 0.21, 0.012, 0, 0, 0); g.rotateX(-0.25); g.translate(0, M.alto + 0.11, 0.74); return g; })()]), new THREE.MeshStandardMaterial({ color: 0x9aa1aa, roughness: 0.35, metalness: 0.7 }), asientos.length);
      const r = TX.azar(piso * 31);
      const q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
      asientos.forEach((a, i) => {
        const giro = a.mira > 0 ? 0 : Math.PI;
        q.setFromEuler(e.set(0, giro + (r() - 0.5) * 0.12, 0));
        // la silla un poco retirada de la mesa
        p.set(a.x, y0, a.z - a.mira * 0.08);
        m4.compose(p, q, s); sillas.setMatrixAt(i, m4); cojines.setMatrixAt(i, m4); mochilas.setMatrixAt(i, m4);
        // la laptop va sobre la mesa frente a la silla
        q.setFromEuler(e.set(0, giro, 0));
        m4.compose(p.set(a.x, y0, a.z - a.mira * 0.08), q, s); laptops.setMatrixAt(i, m4);
        m4.makeTranslation(a.x, y0 + 0.012, a.z); halos.setMatrixAt(i, m4);
      });
      for (const im of [sillas, cojines, mochilas, laptops]) { im.castShadow = true; im.receiveShadow = true; }
      halos.renderOrder = 2;
      this.pisos[piso].add(sillas, cojines, halos, mochilas, laptops);
      this[`inst${piso}`] = { asientos, sillas, cojines, halos, mochilas, laptops, indice: new Map(asientos.map((a, i) => [a.id, i])) };
    }
    // marca de la mesa piloto (aro dorado en el piso, cámara sobre la mesa y rótulo)
    const mp = PLANO.mesaPiloto;
    const aro = new THREE.Mesh(new THREE.RingGeometry(1.95, 2.1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }));
    aro.scale.set(1, 1, 0.78); aro.position.set(mp.x, 0.015, mp.z);
    this.pisos[1].add(aro);
    this.aroPiloto = aro;
    this.rotuloPiloto = etiqueta('Mesa piloto · maqueta (simulada)', { alto: 0.2, color: '#fde68a', fondo: 'rgba(11,18,32,0.85)', borde: 'rgba(253,230,138,0.7)', tamFuente: 56, mirar: 'camara' });
    this.rotuloPiloto.position.set(mp.x, 2.3, mp.z);
    this.pisos[1].add(this.rotuloPiloto);
    // cámaras ESP32 en el techo (una por mesa: 83)
    const camGeo = mergeGeometries([geoCaja(0.12, 0.06, 0.16, 0, 0, 0), geoCaja(0.02, 0.25, 0.02, 0, 0.15, 0)]);
    for (const piso of [1, 2]) {
      const mesas = PLANO.mesas.filter((m) => m.piso === piso);
      const cams = new THREE.InstancedMesh(camGeo, new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.5 }), mesas.length);
      const yTecho = cieloDe(piso) - 0.31;
      const m4 = new THREE.Matrix4();
      mesas.forEach((m, i) => { m4.makeTranslation(m.x, yTecho, m.z); cams.setMatrixAt(i, m4); });
      cams.userData.esCamaras = true;
      this[`camaras${piso}`] = cams;
      (piso === 1 ? this.techo : this.pisos[1]).add(cams);
    }
  }

  // ---------------------------------------------------------------- estantes con libros (todo por instancias)
  #estantes() {
    for (const piso of [1, 2]) this.#estantesPiso(piso);
  }

  #estantesPiso(piso) {
    const tablas = [], libros = [];
    const r = TX.azar(91 + piso);
    for (const e of PLANO.estantes.filter((x) => x.piso === piso)) {
      const y0 = yPiso(e.piso);
      const alto = 2.1, baldas = 6;
      const largoX = e.x1 - e.x0 > e.z1 - e.z0;
      const largo = largoX ? e.x1 - e.x0 : e.z1 - e.z0;
      const prof = largoX ? e.z1 - e.z0 : e.x1 - e.x0;
      const cx = (e.x0 + e.x1) / 2, cz = (e.z0 + e.z1) / 2;
      const giro = largoX ? 0 : Math.PI / 2;
      const frente = largoX ? 1 : 1;
      const T = (lx, ly, lz, w, h, d) => {
        const v = new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), giro);
        tablas.push({ x: cx + v.x, y: y0 + ly, z: cz + v.z, w, h, d, giro });
      };
      T(0, alto / 2, -prof / 2 + 0.02, largo, alto, 0.03);
      for (let b = 0; b <= baldas; b++) T(0, 0.06 + b * ((alto - 0.1) / baldas), 0, largo, 0.025, prof);
      const modulos = Math.round(largo / 0.95);
      for (let k = 0; k <= modulos; k++) T(-largo / 2 + k * (largo / modulos), alto / 2, 0, 0.025, alto, prof);
      for (let b = 0; b < baldas; b++) {
        const yb = 0.06 + b * ((alto - 0.1) / baldas) + 0.0125;
        let u = -largo / 2 + 0.03;
        while (u < largo / 2 - 0.04) {
          const grosor = 0.02 + r() * 0.035, altoL = 0.2 + r() * 0.1;
          if (r() < 0.05) { u += 0.06 + r() * 0.1; continue; }
          const v = new THREE.Vector3(u + grosor / 2, 0, (prof / 2 - 0.12) * frente * 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), giro);
          libros.push({ x: cx + v.x, y: y0 + yb + altoL / 2, z: cz + v.z, w: grosor, h: altoL, d: prof * 0.75, giro, inc: r() < 0.04 ? (r() - 0.5) * 0.3 : 0, c: r() });
          u += grosor + 0.0015;
        }
      }
    }
    const madera = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.7 });
    const instT = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), madera, tablas.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), eul = new THREE.Euler();
    tablas.forEach((t, i) => { q.setFromEuler(eul.set(0, t.giro, 0)); m4.compose(p.set(t.x, t.y, t.z), q, s.set(t.w, t.h, t.d)); instT.setMatrixAt(i, m4); });
    const tex = TX.lomos();
    const instL = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }), libros.length);
    const paleta = [0x7f1d1d, 0x1e3a8a, 0x14532d, 0x78350f, 0x312e81, 0x3f3f46, 0x9a3412, 0x115e59, 0x581c87, 0xa16207, 0x334155, 0x991b1b, 0xe7e5e4, 0x0c4a6e];
    const col = new THREE.Color();
    libros.forEach((l, i) => {
      q.setFromEuler(eul.set(0, l.giro, l.inc));
      m4.compose(p.set(l.x, l.y, l.z), q, s.set(l.w, l.h, l.d)); instL.setMatrixAt(i, m4);
      instL.setColorAt(i, col.setHex(paleta[Math.floor(l.c * paleta.length)]).multiplyScalar(0.75 + (l.c * 7 % 1) * 0.4));
    });
    // separados por piso para la vista "casa de muñecas"
    this.pisos[piso].add(instT, instL);
  }

  // ---------------------------------------------------------------- vestíbulo: puertas con sensores, tótem y mostrador
  #vestibulo() {
    const g = this.pisos[1];
    this.puertasVis = {};
    for (const clave of ['entrada', 'salida']) {
      const p = PLANO.puertas[clave];
      const ancho = p.x1 - p.x0, cx = (p.x0 + p.x1) / 2;
      const marco = new THREE.Mesh(mergeGeometries([
        geoCaja(0.12, 2.6, 0.2, p.x0, 1.3, p.z), geoCaja(0.12, 2.6, 0.2, p.x1, 1.3, p.z), geoCaja(ancho + 0.12, 0.14, 0.22, cx, 2.6, p.z),
      ]), this.mat.marco);
      // hojas de vidrio (se abren al pasar)
      const hojaIzq = new THREE.Mesh(new THREE.PlaneGeometry(ancho / 2, 2.5), this.mat.vidrio);
      const hojaDer = hojaIzq.clone();
      hojaIzq.position.set(cx - ancho / 4, 1.25, p.z - 0.05); hojaDer.position.set(cx + ancho / 4, 1.25, p.z - 0.05);
      for (const hoja of [hojaIzq, hojaDer]) {
        const franja = new THREE.Mesh(new THREE.PlaneGeometry(ancho / 2 - 0.04, 0.34), this.galeria.franjaMat);
        franja.position.set(0, 1.22 - 1.25, 0.01);
        hoja.add(franja);
      }
      // cartel verde
      const cartel = etiqueta(p.nombre, { alto: 0.22, color: '#ffffff', fondo: '#15803d', tamFuente: 72, relleno: 0.3, radio: 0.12 });
      cartel.position.set(cx, 2.95, p.z + 0.13);
      const cartelIn = cartel.clone(); cartelIn.position.z = p.z - 0.13; cartelIn.rotation.y = Math.PI;
      // sensores IR en las jambas (como en la maqueta) y su haz
      const sensorGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.16, 16).rotateZ(Math.PI / 2);
      const sensorMat = new THREE.MeshStandardMaterial({ color: 0xe2b71c, roughness: 0.4 });
      const s1 = new THREE.Mesh(sensorGeo, sensorMat); s1.position.set(p.x0 + 0.14, 1.2, p.z - 0.32);
      const s2 = new THREE.Mesh(sensorGeo, sensorMat); s2.position.set(p.x1 - 0.14, 1.2, p.z - 0.32);
      const hazMat = new THREE.MeshBasicMaterial({ color: COLORES.ir, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const haz = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, ancho - 0.3, 10, 1, true).rotateZ(Math.PI / 2), hazMat);
      haz.position.set(cx, 1.2, p.z - 0.32);
      const rot = etiqueta(clave === 'entrada' ? 'Sensor S1 · suma' : 'Sensor S2 · resta', { alto: 0.09, color: '#fecaca', fondo: 'rgba(11,18,32,0.75)', tamFuente: 48 });
      rot.position.set(cx, 1.45, p.z - 0.33); rot.rotation.y = Math.PI;
      g.add(marco, hojaIzq, hojaDer, cartel, cartelIn, s1, s2, haz, rot);
      this.puertasVis[clave] = { hojaIzq, hojaDer, hazMat, apertura: 0, abrir: 0, cx, ancho, destello: 0 };
    }
    // tótem de disponibilidad
    const T = PLANO.totem;
    const cuerpo = new THREE.Mesh(geoCaja(1.0, 2.1, 0.18, 0, 1.05, 0), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.35, metalness: 0.4 }));
    const pie = new THREE.Mesh(geoCaja(0.7, 0.06, 0.5, 0, 0.03, 0), this.mat.metal);
    this.totem = new Pantalla({ ancho: 0.9, alto: 1.6, px: 900, brillo: 1 });
    this.totem.malla.position.set(0, 1.2, 0.095);
    const totem = new THREE.Group();
    totem.add(cuerpo, pie, this.totem.malla);
    totem.position.set(T.x, 0, T.z);
    totem.rotation.y = 0.35;
    g.add(totem);
    // mostrador de préstamos
    const Mo = PLANO.mostrador;
    const mostrador = new THREE.Mesh(mergeGeometries([
      geoCaja(Mo.x1 - Mo.x0, 1.05, Mo.z1 - Mo.z0, (Mo.x0 + Mo.x1) / 2, 0.525, (Mo.z0 + Mo.z1) / 2),
    ]), this.mat.mesa);
    const cubierta = new THREE.Mesh(geoCaja(Mo.x1 - Mo.x0 + 0.1, 0.05, Mo.z1 - Mo.z0 + 0.1, (Mo.x0 + Mo.x1) / 2, 1.075, (Mo.z0 + Mo.z1) / 2), new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.3 }));
    const rotM = etiqueta('Módulo de atención · préstamo y devolución', { alto: 0.11, color: '#0f172a', fondo: null, tamFuente: 64 });
    rotM.position.set((Mo.x0 + Mo.x1) / 2, 0.7, Mo.z1 + 0.01);
    mostrador.castShadow = true;
    g.add(mostrador, cubierta, rotM);
    // plantas del vestíbulo
    const maceta = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.24, 0.55, 20), new THREE.MeshStandardMaterial({ color: 0xd9d3c7, roughness: 0.8 }), 4);
    const hojas = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.8, flatShading: true }), 4);
    const m4 = new THREE.Matrix4();
    [[-14, 11.8], [16.05, 12.6], [-8, 7.6], [16.05, 6.35]].forEach(([x, z], i) => {
      m4.makeTranslation(x, 0.275, z); maceta.setMatrixAt(i, m4);
      m4.makeScale(1, 1.4, 1); m4.setPosition(x, 1.05, z); hojas.setMatrixAt(i, m4);
    });
    g.add(maceta, hojas);
  }

  // ---------------------------------------------------------------- señalética de zonas
  #senales() {
    const y2 = cieloDe(2) - 0.55;
    const z1 = etiqueta('ZONA DE SILENCIO', { alto: 0.34, color: '#ccfbf1', fondo: 'rgba(15,60,58,0.9)', tamFuente: 72 });
    z1.position.set(-6.5, y2, 11.4);
    const z2 = etiqueta('TRABAJO EN GRUPO', { alto: 0.34, color: '#fef3c7', fondo: 'rgba(80,55,10,0.9)', tamFuente: 72 });
    z2.position.set(12.5, y2, 11.4);
    for (const z of [z1, z2]) { const b = z.clone(); b.rotation.y = Math.PI; b.position.z -= 0.02; this.pisos[2].add(z, b); }
    // franjas de color en el piso para las zonas
    const zona = (x0, x1, color) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 23.2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.06, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, Y2 + 0.004, -1.0);
      this.pisos[2].add(m);
    };
    zona(-16.2, 2.6, 0x14b8a6);
    zona(2.6, 22.5, 0xf59e0b);
    // carteles colgantes de las salas
    const s1 = etiqueta('SALA 1 · 96 asientos · colección 000–599', { alto: 0.26, color: '#f8fafc', fondo: 'rgba(31,58,109,0.92)', tamFuente: 72 });
    s1.position.set(4, H - 0.85, 6.5);
    const s1b = s1.clone(); s1b.rotation.y = Math.PI; s1b.position.z -= 0.02;
    this.pisos[1].add(s1, s1b);
    const s2 = etiqueta('SALA 2 · sótano · 236 asientos · colección 600–999 · hemeroteca', { alto: 0.24, color: '#f8fafc', fondo: 'rgba(31,58,109,0.92)', tamFuente: 72 });
    s2.position.set(-11.5, cieloDe(2) - 0.7, 11.6);
    const s2b = s2.clone(); s2b.rotation.y = Math.PI; s2b.position.z -= 0.02;
    this.pisos[2].add(s2, s2b);
  }

  // ---------------------------------------------------------------- luminarias del techo (emisivas)
  #luminarias() {
    const geo = new THREE.BoxGeometry(1.4, 0.04, 0.28);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.3, 2.25, 2.1), toneMapped: true });
    for (const piso of [1, 2]) {
      const pos = [];
      for (let x = -19; x <= 19; x += 4.75) for (let z = -11; z <= (piso === 1 ? 12 : 11); z += 3.6) {
        const E = PLANO.escalera;
        if (x > E.x0 - 0.5 && x < E.x1 + 0.5 && z > E.z0 - 0.5 && z < E.z1 + 0.5) continue;
        pos.push([x, z]);
      }
      const inst = new THREE.InstancedMesh(geo, mat, pos.length);
      const yT = cieloDe(piso) - 0.02;
      const m4 = new THREE.Matrix4();
      pos.forEach(([x, z], i) => { m4.makeTranslation(x, yT, z); inst.setMatrixAt(i, m4); });
      (piso === 1 ? this.techo : this.pisos[1]).add(inst);
    }
  }

  // ---------------------------------------------------------------- ruta guiada, destino y avatar
  #ruta() {
    this.rutaUniforms = { uTiempo: { value: 0 }, uColor: { value: new THREE.Color(0x5eead4) }, uLargo: { value: 1 } };
    this.rutaMat = new THREE.ShaderMaterial({
      uniforms: this.rutaUniforms, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
      vertexShader: 'attribute float aDist; varying float vDist; varying vec2 vUv; void main(){ vDist = aDist; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      // (smoothstep siempre con borde0 < borde1: invertido no está definido en todas las GPU)
      fragmentShader: `uniform float uTiempo; uniform vec3 uColor; varying float vDist; varying vec2 vUv;
        void main(){
          float borde = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.82, 1.0, vUv.y));
          float f = fract(vDist * 0.55 - uTiempo * 0.9);
          float lado = abs(vUv.y - 0.5) * 2.0;
          float chevron = 1.0 - smoothstep(0.0, 0.08, abs(f - 0.5 + lado * 0.28) - 0.06);
          float a = borde * (0.42 + chevron * 0.58);
          gl_FragColor = vec4(uColor * (0.85 + chevron * 0.9), a);
        }`,
    });
    this.rutaMalla = new THREE.Mesh(new THREE.BufferGeometry(), this.rutaMat);
    this.rutaMalla.visible = false;
    this.rutaMalla.renderOrder = 6;
    this.rutaMalla.frustumCulled = false;
    this.grupo.add(this.rutaMalla);
    // baliza del destino: columna de luz y aro
    const baliza = new THREE.Group();
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 3.2, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    col.position.y = 1.6;
    const aro = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }));
    aro.position.y = 0.02;
    const pin = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 20).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0x38bdf8, toneMapped: false }));
    pin.position.y = 1.9;
    baliza.add(col, aro, pin);
    baliza.visible = false;
    this.baliza = baliza;
    this.balizaPin = pin;
    this.grupo.add(baliza);
    // avatar del estudiante (para la vista aérea)
    const avatar = new THREE.Group();
    const cuerpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.9, 4, 12), new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.5 }));
    cuerpo.position.y = 0.75;
    const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.6 }));
    cabeza.position.y = 1.55;
    const mochila = new THREE.Mesh(geoCaja(0.32, 0.4, 0.16, 0, 1.0, -0.24), new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.8 }));
    const aroA = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.46, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false }));
    aroA.position.y = 0.02;
    void cuerpo; void cabeza; void mochila;
    avatar.add(aroA);
    avatar.visible = false;
    this.avatar = avatar;
    this.grupo.add(avatar);
  }

  // Dibuja la cinta de la ruta (sobre el piso) siguiendo los puntos 3D
  mostrarRuta(pts) {
    if (!pts || pts.length < 2) { this.rutaMalla.visible = false; return; }
    // densifica y suaviza esquinas
    const den = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      const n = Math.max(1, Math.ceil(d / 0.4));
      for (let k = 0; k < n; k++) den.push(new THREE.Vector3(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n, a.z + (b.z - a.z) * k / n));
    }
    den.push(new THREE.Vector3(pts[pts.length - 1].x, pts[pts.length - 1].y, pts[pts.length - 1].z));
    const ancho = 0.55;
    const pos = [], uv = [], dist = [], idx = [];
    let acum = 0;
    for (let i = 0; i < den.length; i++) {
      const p = den[i];
      const ant = den[Math.max(0, i - 1)], sig = den[Math.min(den.length - 1, i + 1)];
      const dx = sig.x - ant.x, dz = sig.z - ant.z;
      const l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l;
      if (i > 0) acum += p.distanceTo(den[i - 1]);
      const y = p.y + 0.03;
      pos.push(p.x + nx * ancho / 2, y, p.z + nz * ancho / 2, p.x - nx * ancho / 2, y, p.z - nz * ancho / 2);
      uv.push(acum, 0, acum, 1);
      dist.push(acum, acum);
      if (i > 0) { const b = (i - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
    g.setIndex(idx);
    this.rutaMalla.geometry.dispose();
    this.rutaMalla.geometry = g;
    this.rutaMalla.visible = true;
  }
  ocultarRuta() { this.rutaMalla.visible = false; }

  marcarDestino(a) {
    if (!a) { this.baliza.visible = false; return; }
    this.baliza.visible = true;
    this.baliza.position.set(a.x, yPiso(a.piso) + this.alzado(a.piso), a.z);
  }

  // ---------------------------------------------------------------- estado de los asientos
  // estado: EstadoBiblioteca · tuyo: id del asiento del estudiante · elegido: id seleccionado
  actualizarAsientos(estado, { tuyo = null, elegido = null, verdad = null } = {}) {
    const m4 = new THREE.Matrix4(), cero = new THREE.Matrix4().makeScale(0, 0, 0);
    const color = new THREE.Color();
    for (const piso of [1, 2]) {
      const I = this[`inst${piso}`];
      I.asientos.forEach((base, i) => {
        const a = estado.get(base.id);
        const e = estado.estadoDe(a);
        const esTuyo = a.id === tuyo;
        color.copy(esTuyo ? COL.tuyo : COL[e]);
        I.cojines.setColorAt(i, color);
        I.halos.setColorAt(i, a.id === elegido ? COL.tuyo : color);
        const v = e === 'sinDato' && verdad ? verdad.get(a.id) : null;
        const conPersona = (e === 'ocupado' || (v && v.ocupado && !v.objeto)) && !esTuyo;
        I.sillas.getMatrixAt(i, m4);
        I.laptops.setMatrixAt(i, conPersona && (i * 7) % 3 !== 0 ? m4 : cero);
        I.mochilas.setMatrixAt(i, e === 'objeto' ? m4 : cero);
      });
      for (const k of ['cojines', 'halos']) I[k].instanceColor.needsUpdate = true;
      for (const k of ['laptops', 'mochilas']) I[k].instanceMatrix.needsUpdate = true;
    }
  }

  // Rótulo de la mesa piloto según el origen de los datos
  fijarPiloto(real) {
    if (this.pilotoReal === real) return;
    this.pilotoReal = real;
    const nuevo = etiqueta(real ? '● Mesa piloto · EN VIVO (maqueta)' : 'Mesa piloto · maqueta (simulada)', { alto: 0.2, color: real ? '#bbf7d0' : '#fde68a', fondo: 'rgba(11,18,32,0.85)', borde: real ? 'rgba(34,197,94,0.8)' : 'rgba(253,230,138,0.7)', tamFuente: 56, mirar: 'camara' });
    nuevo.position.copy(this.rotuloPiloto.position);
    this.rotuloPiloto.parent.add(nuevo);
    this.rotuloPiloto.parent.remove(this.rotuloPiloto);
    this.rotuloPiloto = nuevo;
    this.aroPiloto.material.color.set(real ? 0x22c55e : 0xfde68a);
  }

  // Asiento bajo un rayo (para elegir con el ratón o con el rayo del visor)
  asientoEn(raycaster) {
    const objetivos = [];
    for (const piso of [1, 2]) if (this.pisos[piso].visible) objetivos.push(this[`inst${piso}`].sillas, this[`inst${piso}`].cojines);
    const hit = raycaster.intersectObjects(objetivos, false)[0];
    if (!hit) return null;
    const piso = hit.object === this.inst1.sillas || hit.object === this.inst1.cojines ? 1 : 2;
    return this[`inst${piso}`].asientos[hit.instanceId]?.id || null;
  }

  // Lo que hay bajo un rayo: asiento, mesa, cámara del techo, tótem o puerta
  objetoEn(raycaster) {
    const objetivos = [this.totem.malla];
    for (const piso of [1, 2]) {
      if (!this.pisos[piso].visible) continue;
      const I = this[`inst${piso}`];
      objetivos.push(I.sillas, I.cojines, this[`mesas${piso}`].tablero);
      if (visibleEnEscena(this[`camaras${piso}`])) objetivos.push(this[`camaras${piso}`]);
    }
    for (const clave of ['entrada', 'salida']) objetivos.push(this.puertasVis[clave].hojaIzq, this.puertasVis[clave].hojaDer);
    const hit = raycaster.intersectObjects(objetivos, false)[0];
    if (!hit) return null;
    const o = hit.object;
    if (o === this.totem.malla) return { tipo: 'totem', distancia: hit.distance };
    for (const clave of ['entrada', 'salida']) if (o === this.puertasVis[clave].hojaIzq || o === this.puertasVis[clave].hojaDer) return { tipo: 'puerta', id: clave, distancia: hit.distance };
    for (const piso of [1, 2]) {
      const I = this[`inst${piso}`];
      if (o === I.sillas || o === I.cojines) return { tipo: 'asiento', id: I.asientos[hit.instanceId]?.id, distancia: hit.distance };
      if (o === this[`mesas${piso}`].tablero) return { tipo: 'mesa', id: this[`mesas${piso}`].mesas[hit.instanceId]?.id, distancia: hit.distance };
      if (o === this[`camaras${piso}`]) return { tipo: 'camara', id: PLANO.mesas.filter((m) => m.piso === piso)[hit.instanceId]?.id, distancia: hit.distance };
    }
    return null;
  }

  // Vista "casa de muñecas": el piso 1 (con su vitrina) se levanta, se quitan los pisos altos y se ve el sótano
  fijarExplosion(t) {
    this.explosion = t * ALZADO;
    this.pisos[1].position.y = this.explosion;
    this.galeria.frente.position.y = this.explosion;
    this.techo.visible = t < 0.02 && !this.sinTecho;     // (la vista aérea lo quita aunque no haya casa de muñecas)
    this.galeria.desdeArriba(t >= 0.02 || !!this.galeriaArriba);
  }
  // cuánto está levantado cada nivel (el piso 1 en la casa de muñecas; el sótano nunca)
  alzado(piso) { return piso === 1 ? this.explosion : 0; }
  // mostrar u ocultar el piso 1 con su vitrina (para ver el sótano desde arriba)
  verPiso1(v) { this.pisos[1].visible = v; this.galeria.frente.visible = v; }

  // vista aérea: sin el techo alto de la galería (para ver a quienes llegan)
  verGaleriaDesdeArriba(v) { this.galeriaArriba = v; this.galeria.desdeArriba(v || this.explosion > 0.15); }

  pulsarPuerta(clave) {
    const p = this.puertasVis[clave];
    if (!p) return;
    p.abrir = 2.2;
    p.destello = 1;
  }

  update(dt, t) {
    this.rutaUniforms.uTiempo.value = t / 1000;
    for (const sp of this.poolFlot) {
      if (!sp.visible) continue;
      const u = sp.userData;
      u.vida -= dt;
      sp.position.y = u.y0 + (1 - u.vida / u.vidaMax) * 1.1;
      sp.material.opacity = Math.min(1, u.vida * 2.2);
      if (u.vida <= 0) sp.visible = false;
    }
    if (this.baliza.visible) {
      this.balizaPin.position.y = 1.9 + Math.sin(t / 300) * 0.12;
      this.balizaPin.rotation.y += dt * 2;
    }
    for (const clave of ['entrada', 'salida']) {
      const p = this.puertasVis[clave];
      p.abrir = Math.max(0, p.abrir - dt);
      const objetivo = p.abrir > 0 ? 1 : 0;
      p.apertura += (objetivo - p.apertura) * Math.min(1, dt * 4);
      const corre = p.apertura * p.ancho * 0.24;
      p.hojaIzq.position.x = p.cx - p.ancho / 4 - corre;
      p.hojaDer.position.x = p.cx + p.ancho / 4 + corre;
      p.destello = Math.max(0, p.destello - dt * 1.2);
      p.hazMat.opacity = 0.16 + p.destello * 0.7;
    }
  }
}

// Tótem de la entrada: personas dentro y asientos libres en el piso 1 y en el sótano
export function dibujarTotem(ctx, w, h, { estado, fuente, hora }) {
  ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.3);
  g.addColorStop(0, 'rgba(56,189,248,0.25)'); g.addColorStop(1, 'rgba(56,189,248,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h * 0.3);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#38bdf8'; ctx.font = `800 ${w * 0.085}px ${FUENTE}`;
  ctx.fillText('BiblioAforo', w / 2, h * 0.08);
  ctx.fillStyle = '#94a3b8'; ctx.font = `600 ${w * 0.045}px ${FUENTE}`;
  ctx.fillText(`Asientos libres · ${hora}`, w / 2, h * 0.125);
  const piso = (n, y) => {
    const libres = estado.libres(n), total = estado.total(n);
    ctx.fillStyle = 'rgba(148,163,184,0.12)';
    rectRedondo(ctx, w * 0.07, y, w * 0.86, h * 0.22, w * 0.04); ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e2e8f0'; ctx.font = `700 ${w * 0.06}px ${FUENTE}`;
    ctx.fillText(n === 1 ? 'Piso 1 · Sala 1' : 'Sótano · Sala 2', w * 0.12, y + h * 0.06);
    ctx.fillStyle = libres > 0 ? '#22c55e' : '#ef4444'; ctx.font = `800 ${w * 0.16}px ${FUENTE}`;
    ctx.fillText(String(libres), w * 0.12, y + h * 0.165);
    ctx.fillStyle = '#94a3b8'; ctx.font = `600 ${w * 0.05}px ${FUENTE}`;
    ctx.fillText(`libres de ${total}`, w * 0.12 + ctx.measureText('0').width * 0 + w * 0.3, y + h * 0.165);
    const fr = (total - libres) / total;
    ctx.fillStyle = 'rgba(148,163,184,0.25)'; rectRedondo(ctx, w * 0.12, y + h * 0.19, w * 0.76, h * 0.014, h * 0.007); ctx.fill();
    ctx.fillStyle = fr > 0.9 ? '#ef4444' : fr > 0.75 ? '#f59e0b' : '#22c55e';
    rectRedondo(ctx, w * 0.12, y + h * 0.19, w * 0.76 * fr, h * 0.014, h * 0.007); ctx.fill();
  };
  piso(1, h * 0.17);
  piso(2, h * 0.42);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#94a3b8'; ctx.font = `600 ${w * 0.045}px ${FUENTE}`;
  ctx.fillText('Personas dentro', w / 2, h * 0.72);
  ctx.fillStyle = '#e2e8f0'; ctx.font = `800 ${w * 0.12}px ${FUENTE}`;
  ctx.fillText(`${estado.puertas.dentro} / ${estado.puertas.aforo}`, w / 2, h * 0.81);
  ctx.fillStyle = '#64748b'; ctx.font = `500 ${w * 0.036}px ${FUENTE}`;
  ctx.fillText('Puertas: sensores de entrada y salida', w / 2, h * 0.86);
  ctx.fillStyle = fuente === 'sim' ? '#7dd3fc' : '#86efac'; ctx.font = `700 ${w * 0.04}px ${FUENTE}`;
  ctx.fillText(fuente === 'sim' ? 'Datos simulados' : 'Mesa piloto en vivo · resto simulado', w / 2, h * 0.94);
}
