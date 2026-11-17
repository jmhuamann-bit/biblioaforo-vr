// Las personas de la biblioteca: quienes caminan (agentes de la multitud) y quienes están sentados
// (asientos ocupados), cada una con su aspecto (persona.js), su animación (esqueleto.js), gestos,
// expresiones y mirada. Todo se dibuja con pocas mallas por instancias: cuerpo (2 niveles de
// detalle), 9 peinados × 2, lentes y mochilas, más sombras de contacto. No cambia la simulación:
// solo lee la multitud y el estado de los asientos.
import * as THREE from 'three';
import { PLANO, yPiso } from '../biblioteca/plano.js';
import { persona, PEINADOS } from './humanos/persona.js';
import { geometriaCuerpo, geometriaPelo, geometriaGafas, geometriaMochila, geometriaSeleccion, geometriaCelular, geometriaLibro, N_HUESOS } from './humanos/modelo.js';
import { texturasRostro, texturaTela, texturaPelo, EXPRESION } from './humanos/texturasHumanos.js';
import { materialHumanos, tiempoHumanos } from './humanos/material.js';
import { posar, nuevaPose } from './humanos/esqueleto.js';

const MAX = 512;              // personas a la vez (filas de la textura de huesos)
const MAX_CERCA = 96;         // instancias de las mallas detalladas
const MAX_CAMINANTES = 140;
const ATRIBUTOS = ['iA', 'iForma', 'iCol', 'iCol2', 'iRopa'];
const PI = Math.PI;
const lim = (v, a, b) => (v < a ? a : v > b ? b : v);
const mezclar = (a, b, t) => a + (b - a) * t;
const difAng = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const suave = (x) => { const t = lim(x, 0, 1); return t * t * (3 - 2 * t); };
const hashTexto = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const hashN = (n) => { let x = (n | 0) ^ 0x9e3779b9; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

// Una malla por instancias con los datos de cada persona que dibuja
class Lote {
  constructor(geo, material, capacidad, nombre) {
    const ig = new THREE.InstancedBufferGeometry();
    ig.index = geo.index;
    for (const k of Object.keys(geo.attributes)) ig.setAttribute(k, geo.attributes[k]);
    this.attr = ATRIBUTOS.map((k) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacidad * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      ig.setAttribute(k, a);
      return a;
    });
    ig.instanceCount = 0;
    this.geo = ig;
    this.malla = new THREE.Mesh(ig, material);
    this.malla.frustumCulled = false;
    this.malla.name = nombre;
    this.malla.visible = false;
    this.capacidad = capacidad;
    this.n = 0;
  }
  empezar() { this.n = 0; }
  agregar(plantilla, slot, expresion) {
    if (this.n >= this.capacidad) return;
    const o = this.n * 4;
    for (let k = 0; k < 5; k++) {
      const arr = this.attr[k].array;
      arr[o] = plantilla[k * 4]; arr[o + 1] = plantilla[k * 4 + 1]; arr[o + 2] = plantilla[k * 4 + 2]; arr[o + 3] = plantilla[k * 4 + 3];
    }
    this.attr[0].array[o] = slot;
    this.attr[0].array[o + 1] = expresion;
    this.n++;
  }
  terminar() {
    this.geo.instanceCount = this.n;
    this.malla.visible = this.n > 0;
    if (!this.n) return;
    for (const a of this.attr) { a.clearUpdateRanges(); a.addUpdateRange(0, this.n * 4); a.needsUpdate = true; }
  }
}

// Datos fijos de cada persona para el shader (20 números)
function plantillaDe(p) {
  if (p._plantilla) return p._plantilla;
  const t = new Float32Array(20);
  t.set([0, 0, (p.semilla % 997) / 997, p.telaInf], 0);
  t.set([p.fem, p.build, p.edad / 2, p.barba], 4);
  t.set([p.piel, p.pelo, p.sup, p.inf], 8);
  t.set([p.sup2, p.zapato, p.accesorio >= 0 ? p.accesorio : p.sup2, p.medias], 12);
  t.set([p.manga, p.piernaTipo, p.capucha, p.patron], 16);
  p._plantilla = t;
  return t;
}

// El avatar del jugador (vista aérea): siempre la misma persona, con casaca celeste
const AVATAR = (() => {
  const base = persona(424242);
  return { ...base, sup: 0x0ea5e9, sup2: 0xf1f5f9, patron: 3, manga: 1, capucha: 0, mochila: 0x1e3a8a, accesorio: 0x1e3a8a, piernaTipo: 0, inf: 0x27344f, telaInf: 1, peinado: base.peinado === 'gorra' ? 'corto' : base.peinado, estilo: PEINADOS.indexOf(base.peinado === 'gorra' ? 'corto' : base.peinado), _plantilla: null };
})();

// ------------------------------------------------------------------ gestos
// Cada gesto dice dónde van las manos (ancla 0: mesa, en metros desde el asiento · 1: pecho ·
// 2: cabeza), hacia dónde mirar, cuánto inclinarse y qué cara poner.
const SENTADO_CON_LAPTOP = [['teclear', 52], ['pensar', 11], ['celular', 9], ['leer', 7], ['descansar', 14], ['estirarse', 4]];
const SENTADO_SIN_LAPTOP = [['escribir', 40], ['leer', 22], ['pensar', 12], ['celular', 12], ['descansar', 10], ['estirarse', 3]];
const SENTADO_GRUPO = [['conversar', 34], ['teclear', 22], ['escribir', 14], ['celular', 10], ['descansar', 12], ['pensar', 8]];
function elegirPonderado(lista, r) {
  let total = 0; for (const [, p] of lista) total += p;
  let x = r * total;
  for (const [g, p] of lista) { x -= p; if (x <= 0) return g; }
  return lista[0][0];
}

function aplicarGesto(g, e, p, t, esc, peso, st) {
  const b0 = e.brazos[0], b1 = e.brazos[1];
  const sem = p.semilla % 1000;
  const mano = p.zurdo ? 0 : 1;            // mano hábil: derecha = lado −x
  const otra = 1 - mano;
  const fijar = (b, ancla, x, y, z, polo, pron, pesoB = 1) => { b.peso = peso * pesoB; b.ancla = ancla; b.obj[0] = x; b.obj[1] = y; b.obj[2] = z; b.polo[0] = polo[0]; b.polo[1] = polo[1]; b.polo[2] = polo[2]; b.pron = pron; };
  const k = 1 / esc;
  switch (g) {
    case 'teclear': {
      const tecla = (i) => 0.006 * Math.abs(Math.sin(t * (11 + i * 1.7) + sem + i * 2));
      fijar(b0, 0, 0.11 * k, (0.772 + tecla(0)) * k, 0.47 * k, [0.32, -0.42, -0.08], 1.3);
      fijar(b1, 0, -0.11 * k, (0.772 + tecla(1)) * k, 0.47 * k, [0.32, -0.42, -0.08], 1.3);
      e.inclinar += 0.16 * peso; e.cabPitch += 0.42 * peso;
      break;
    }
    case 'escribir': {
      const s = mano === 0 ? 1 : -1;
      fijar(e.brazos[mano], 0, (s * 0.06 + 0.012 * Math.sin(t * 4.3 + sem)) * k, 0.776 * k, (0.42 + 0.006 * Math.sin(t * 8.7)) * k, [0.3, -0.4, -0.1], 1.15);
      fijar(e.brazos[otra], 0, -s * 0.15 * k, 0.772 * k, 0.4 * k, [0.3, -0.4, -0.1], 1.3);
      e.inclinar += 0.2 * peso; e.cabPitch += 0.62 * peso; e.cabTilt += s * 0.06 * peso;
      break;
    }
    case 'leer':
      fijar(b0, 1, 0.075, 1.15, 0.31, [0.3, -0.3, -0.25], 0.35);
      fijar(b1, 1, -0.075, 1.15, 0.31, [0.3, -0.3, -0.25], 0.35);
      e.cabPitch += 0.55 * peso; e.inclinar += 0.04 * peso;
      break;
    case 'celular':
    case 'celularPie':
      fijar(b0, 1, 0.028, 1.13, 0.29, [0.25, -0.3, -0.25], 0.95);
      fijar(b1, 1, -0.028, 1.13, 0.29, [0.25, -0.3, -0.25], 0.95);
      e.cabPitch += 0.62 * peso;
      break;
    case 'pensar': {
      const s = mano === 0 ? 1 : -1;
      fijar(e.brazos[mano], 2, s * 0.012, 1.468, 0.07, [0.15, -0.45, 0.1], 0.2);
      fijar(e.brazos[otra], 0, -s * 0.13 * k, 0.772 * k, 0.38 * k, [0.3, -0.4, -0.1], 1.3);
      e.inclinar += 0.16 * peso; e.cabPitch += 0.12 * peso; e.cabTilt += s * 0.12 * peso; e.cabYaw += s * 0.15 * peso;
      break;
    }
    case 'conversar': {
      const habla = Math.sin(t * 1.9 + sem) > -0.2;
      fijar(b0, 1, 0.1 + 0.03 * Math.sin(t * 2.3 + sem), 1.06 + 0.04 * Math.sin(t * 3.1), 0.27, [0.3, -0.35, -0.2], 0.6, habla ? 1 : 0.4);
      fijar(b1, 1, -0.1 + 0.03 * Math.sin(t * 2.7 + sem * 2), 1.06 + 0.04 * Math.sin(t * 2.6 + 1), 0.27, [0.3, -0.35, -0.2], 0.6, habla ? 0.7 : 0.3);
      e.cabYaw += st.lado * 0.75 * peso * (Math.sin(t * 0.21 + sem) > -0.6 ? 1 : 0.2);
      e.torsoYaw += st.lado * 0.15 * peso;
      break;
    }
    case 'estirarse':
      b0.arriba = peso; b1.arriba = peso;
      e.cabPitch -= 0.25 * peso; e.inclinar -= 0.14 * peso;
      break;
    case 'tirantes':
      fijar(b0, 1, 0.105, 1.27, 0.13, [0.25, -0.2, -0.2], 0.3);
      fijar(b1, 1, -0.105, 1.27, 0.13, [0.25, -0.2, -0.2], 0.3);
      break;
    case 'libro':
      fijar(b0, 1, 0.08, 1.12, 0.3, [0.3, -0.3, -0.25], 0.4);
      fijar(b1, 1, -0.08, 1.12, 0.3, [0.3, -0.3, -0.25], 0.4);
      e.cabPitch += 0.5 * peso;
      break;
    case 'alcanzar': {
      const s = mano === 0 ? 1 : -1;
      fijar(e.brazos[mano], 1, s * 0.1, 1.95, 0.4, [0.3, -0.1, -0.3], 0.2);
      e.cabPitch -= 0.4 * peso;
      break;
    }
    default: break;
  }
}

const EXPRESION_GESTO = { teclear: EXPRESION.concentrado, escribir: EXPRESION.concentrado, leer: EXPRESION.concentrado, pensar: EXPRESION.concentrado, conversar: EXPRESION.hablando };

export class Gente {
  constructor({ texturaSombra }) {
    this.grupo = new THREE.Group();
    this.grupo.name = 'gente';
    this.datos = new Float32Array(N_HUESOS * 12 * MAX);
    this.huesos = new THREE.DataTexture(this.datos, N_HUESOS * 3, MAX, THREE.RGBAFormat, THREE.FloatType);
    this.huesos.magFilter = THREE.NearestFilter; this.huesos.minFilter = THREE.NearestFilter;
    this.huesos.generateMipmaps = false; this.huesos.needsUpdate = true;
    const rostro = texturasRostro();
    this.material = materialHumanos({ huesos: this.huesos, rostro: rostro.color, rostroMascara: rostro.mascara, tela: texturaTela(), pelo: texturaPelo() });
    // tres niveles de detalle: cerca (rostro y manos detallados), media distancia y lejos
    this.cuerpo = [0, 1, 2].map((lod) => new Lote(geometriaCuerpo(lod), this.material, lod ? MAX : MAX_CERCA, `personas-${lod}`));
    this.pelo = PEINADOS.map((p) => [0, 1, 2].map((lod) => new Lote(geometriaPelo(p, lod), this.material, lod ? MAX : MAX_CERCA, `pelo-${p}-${lod}`)));
    this.gafas = new Lote(geometriaGafas(), this.material, MAX_CERCA, 'lentes');
    this.mochila = [new Lote(geometriaMochila(0), this.material, MAX_CERCA, 'mochilas-cerca'), new Lote(geometriaMochila(1), this.material, MAX_CAMINANTES, 'mochilas-lejos')];
    this.celular = new Lote(geometriaCelular(), this.material, MAX_CERCA, 'celulares');
    this.libro = new Lote(geometriaLibro(), this.material, MAX_CERCA, 'libros');
    this.lotes = [...this.cuerpo, ...this.pelo.flat(), this.gafas, ...this.mochila, this.celular, this.libro];
    for (const l of this.lotes) this.grupo.add(l.malla);
    // sombras de contacto de quienes caminan
    this.sombras = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.78, 0.78).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ map: texturaSombra, transparent: true, depthWrite: false, opacity: 0.42 }), MAX_CAMINANTES + 2);
    this.sombras.count = 0; this.sombras.frustumCulled = false; this.sombras.renderOrder = 1;
    this.grupo.add(this.sombras);
    // cápsulas invisibles para elegir a quien camina con el rayo (no se dibujan)
    this.seleccion = new THREE.InstancedMesh(geometriaSeleccion(), new THREE.MeshBasicMaterial(), MAX_CAMINANTES);
    this.seleccion.count = 0;
    this.seleccion.updateMatrixWorld(true);
    this.elegibles = [];
    // estado por persona
    this.estados = new Map();
    this.slots = new Map();
    this.libres = Array.from({ length: MAX }, (_, i) => MAX - 1 - i);
    this.cuadro = 0;
    this.pose = nuevaPose();
    this.lista = [];
    this.frustum = new THREE.Frustum();
    this.pm = new THREE.Matrix4();
    this.cam = new THREE.Vector3();
    this.esfera = new THREE.Sphere();
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._e = new THREE.Euler();
    this.indicePiso = new Map();
    for (const piso of [1, 2]) PLANO.asientos.filter((a) => a.piso === piso).forEach((a, i) => this.indicePiso.set(a.id, i));
  }

  #slot(clave) {
    let s = this.slots.get(clave);
    if (s === undefined) { s = this.libres.pop(); if (s === undefined) return -1; this.slots.set(clave, s); }
    return s;
  }

  #estado(clave, semilla) {
    let st = this.estados.get(clave);
    if (!st || st.semilla !== semilla) {
      st = { semilla, nuevo: true, fase: hashN(semilla) * 6.28, andar: 0, amp: 1, yaw: 0, giro: 0, px: null, pz: null, gesto: 'nada', previo: 'nada', tGesto: 9, k: -1, mirarPeso: 0, cabYaw: 0, cabPitch: 0, tCola: 0, lado: 1 };
      this.estados.set(clave, st);
    }
    return st;
  }

  // ------------------------------------------------------------------ cada cuadro
  actualizar({ multitud, estado, explosion = 0, pisoVisible = () => true, camara, renderer, t, dt, calidad = 'media', avatar = null }) {
    const seg = t / 1000;
    tiempoHumanos.value = seg;
    this.estadoRef = estado;
    this.cuadro++;
    const enVR = !!renderer?.xr?.isPresenting;
    const cam = enVR ? renderer.xr.getCamera() : camara;
    cam.getWorldPosition(this.cam);
    this.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pm);
    const verFrustum = !enVR || this.cuadro > 2;
    // quiénes hay: los que caminan, los sentados y el avatar
    const lista = this.lista; lista.length = 0;
    const transicion = new Map();
    for (const ag of multitud.agentes) {
      if (ag.estado === 'sentandose' && ag.asiento) transicion.set(ag.asiento, ag);
      if (ag.estado === 'levantandose' && ag.asientoDejado) transicion.set(ag.asientoDejado, ag);
    }
    for (const ag of multitud.agentes) {
      if (!ag.visible || ag.retraso > 0) continue;
      const piso = ag.y > PLANO.alturaPiso * 0.5 ? 2 : 1;
      if (!pisoVisible(piso) && !pisoVisible(ag.piso)) continue;
      lista.push({ clave: ag.id, tipo: 0, ag, semilla: ag.semilla ?? ag.id * 7919, x: ag.x, y: ag.y + explosion * lim(ag.y / PLANO.alturaPiso, 0, 1), z: ag.z, piso: ag.piso, asiento: null });
    }
    const verdad = multitud.verdad;
    for (const a of estado.asientos) {
      if (a.estudiante || transicion.has(a.id)) continue;
      const e = estado.estadoDe(a);
      let hay = e === 'ocupado';
      if (e === 'sinDato') { const v = verdad.get(a.id); hay = !!(v && v.ocupado && !v.objeto); }
      if (!hay || !pisoVisible(a.piso)) continue;
      const o = multitud.ocupantes.get(a.id);
      lista.push({ clave: `s${a.id}`, tipo: 1, ag: null, semilla: o?.semilla ?? hashTexto(a.id), x: a.x, y: yPiso(a.piso) + (a.piso === 2 ? explosion : 0), z: a.z, piso: a.piso, asiento: a });
    }
    if (avatar?.visible) lista.push({ clave: 'jugador', tipo: 2, ag: null, semilla: 424242, x: avatar.position.x, y: avatar.position.y, z: avatar.position.z, piso: 1, asiento: null, yaw: avatar.rotation.y });
    // vivos: liberar a quienes ya no están
    const vivos = new Set(lista.map((l) => l.clave));
    for (const [clave, s] of this.slots) if (!vivos.has(clave)) { this.slots.delete(clave); this.estados.delete(clave); this.libres.push(s); }
    // a la vista y distancia
    const visibles = [];
    for (const l of lista) {
      l.dist = Math.hypot(l.x - this.cam.x, l.y + 0.9 - this.cam.y, l.z - this.cam.z);
      this.esfera.center.set(l.x, l.y + 0.9, l.z); this.esfera.radius = 1.15;
      if (verFrustum && !this.frustum.intersectsSphere(this.esfera)) { l.visible = false; continue; }
      l.visible = true;
      visibles.push(l);
    }
    // nivel de detalle: los más cercanos con la malla detallada
    const maxCerca = enVR ? 20 : calidad === 'alta' ? 48 : calidad === 'media' ? 32 : 20;
    const dCerca = enVR ? 8 : calidad === 'alta' ? 16 : 12;
    const dMedia = enVR ? 14 : calidad === 'alta' ? 26 : 20;
    visibles.sort((a, b) => a.dist - b.dist);
    for (let i = 0; i < visibles.length; i++) { const d = visibles[i].dist; visibles[i].lod = i < maxCerca && d < dCerca ? 0 : d < dMedia ? 1 : 2; }
    // animación (los que caminan se actualizan siempre, aunque no se vean, para que el paso siga)
    for (const l of lista) if (l.tipo === 0) this.#avanzarCaminante(l, dt);
    for (const l of this.lotes) l.empezar();
    let nSombras = 0;
    this.elegibles.length = 0;
    const m = this._m, q = this._q, p3 = this._p, s3 = this._s, eu = this._e;
    for (const l of visibles) {
      const slot = this.#slot(l.clave);
      if (slot < 0) continue;
      const p = l.tipo === 2 ? AVATAR : persona(l.semilla);
      const st = this.#estado(l.clave, l.semilla);
      // ¿le toca recalcular la pose? (cerca: siempre · lejos: cada 2 o 4 cuadros)
      const cada = l.lod === 0 ? 1 : l.lod === 1 ? 2 : 4;
      let expr = st.expr ?? p.expresionBase;
      if (st.nuevo || cada === 1 || (this.cuadro + slot) % cada === 0) {
        expr = this.#posar(l, p, st, seg, dt * cada, slot);
        st.expr = expr;
        st.nuevo = false;
      }
      const plantilla = plantillaDe(p);
      this.cuerpo[l.lod].agregar(plantilla, slot, expr);
      this.pelo[p.estilo]?.[l.lod]?.agregar(plantilla, slot, expr);
      if (p.gafas && l.lod === 0) this.gafas.agregar(plantilla, slot, expr);
      if ((l.tipo === 0 || l.tipo === 2) && p.mochila >= 0) this.mochila[Math.min(1, l.lod)].agregar(plantilla, slot, expr);
      // lo que tiene en las manos (cerca se ve; lejos no hace falta)
      if (l.lod === 0 && st.enMano === 'celular') this.celular.agregar(plantilla, slot, expr);
      if (l.lod === 0 && st.enMano === 'libro') this.libro.agregar(plantilla, slot, expr);
      if (l.tipo !== 1 && nSombras < MAX_CAMINANTES) {
        m.makeTranslation(l.vx ?? l.x, l.y + 0.012, l.vz ?? l.z);
        this.sombras.setMatrixAt(nSombras++, m);
      }
      if (l.tipo === 0 && this.elegibles.length < MAX_CAMINANTES) {
        q.setFromEuler(eu.set(0, st.yaw, 0));
        m.compose(p3.set(l.vx ?? l.x, l.y, l.vz ?? l.z), q, s3.set(p.escala, p.escala, p.escala));
        this.seleccion.setMatrixAt(this.elegibles.length, m);
        this.elegibles.push(l.ag);
      }
    }
    for (const l of this.lotes) l.terminar();
    this.huesos.needsUpdate = true;
    this.sombras.count = nSombras;
    this.sombras.instanceMatrix.needsUpdate = true;
    this.seleccion.count = this.elegibles.length;
    this.seleccion.instanceMatrix.needsUpdate = true;
    this.seleccion.boundingSphere = null;
  }

  // paso y giro de quien camina, sacados de cómo se movió (sin pies que patinan)
  #avanzarCaminante(l, dt) {
    const ag = l.ag;
    const st = this.#estado(l.clave, l.semilla);
    const p = persona(l.semilla);
    if (st.px === null) { st.px = ag.x; st.pz = ag.z; st.yaw = ag.rumbo; }
    const d = Math.hypot(ag.x - st.px, ag.z - st.pz);
    st.px = ag.x; st.pz = ag.z;
    const v = d / Math.max(dt, 1e-3);
    if (d < 1.5) st.fase += (d * 2 * PI) / (1.3 * p.escala);
    const anda = v > 0.12 && ag.estado !== 'sentandose' && ag.estado !== 'levantandose' ? 1 : 0;
    st.andar += (anda - st.andar) * Math.min(1, dt * 6);
    st.amp += (lim(v / 1.3, 0.55, 1.3) - st.amp) * Math.min(1, dt * 3);
    const dy = difAng(ag.rumbo, st.yaw);
    st.giro += (dy / Math.max(dt, 1e-3) - st.giro) * Math.min(1, dt * 5);
    st.yaw = ag.rumbo;
    if (st.andar < 0.3 && Math.abs(st.giro) > 0.6) { st.fase += Math.abs(st.giro) * dt * 1.4; st.andar = Math.max(st.andar, 0.3); }
    if (ag.estado === 'cola') st.tCola += dt; else st.tCola = 0;
  }

  // calcula los parámetros de la pose y escribe los huesos; devuelve la expresión del rostro
  #posar(l, p, st, t, dt, slot) {
    const e = this.pose;
    e.t = t; e.semilla = (p.semilla % 1000) / 1000; e.esc = p.escala;
    e.x = l.x; e.y = l.y; e.z = l.z;
    e.andar = 0; e.fase = st.fase; e.amp = 1; e.prisa = 0;
    e.sentado = 0; e.transicion = 0; e.alturaAsiento = 0.555;
    e.piesP = (p.pies - 0.5) * 0.4; e.piesN = (hashN(p.semilla + 3) - 0.5) * 0.4; e.abrirPiernas = 0.05 + p.pies * 0.08;
    e.inclinar = 0; e.encorvado = p.encorvado; e.torsoYaw = 0;
    e.cabYaw = 0; e.cabPitch = 0; e.cabTilt = 0;
    for (const b of e.brazos) { b.peso = 0; b.arriba = 0; }
    let gesto = 'nada', pesoGesto = 1, expr = p.expresionBase;
    const sem = p.semilla % 1000;
    if (l.tipo === 1) {
      // sentado en su asiento, mirando a la mesa
      const a = l.asiento;
      e.yaw = a.mira > 0 ? 0 : PI;
      e.sentado = 1;
      st.lado = (a.letra === 'A' || a.letra === 'D') ? 1 : -1;
      // gesto: cambia cada 14–30 s (con transición)
      const ciclo = 14 + (sem % 17);
      const k = Math.floor((t + sem * 3.1) / ciclo);
      if (k !== st.k) {
        const laptop = (this.indicePiso.get(a.id) * 7) % 3 !== 0;
        const lista = a.zona === 'grupo' ? SENTADO_GRUPO : laptop ? SENTADO_CON_LAPTOP : SENTADO_SIN_LAPTOP;
        st.previo = st.k < 0 ? 'nada' : st.gesto;
        st.gesto = elegirPonderado(laptop ? lista : lista.map(([g, w]) => [g === 'teclear' ? 'escribir' : g, w]), hashN(p.semilla * 31 + k));
        st.tGesto = st.k < 0 ? 9 : 0;
        st.k = k;
      }
      st.tGesto += dt;
      const f = lim(st.tGesto / 0.9, 0, 1);
      gesto = f < 0.5 ? st.previo : st.gesto;
      pesoGesto = f < 0.5 ? 1 - suave(f * 2) : suave(f * 2 - 1);
      e.cabYaw = 0.07 * Math.sin(t * 0.37 + sem) ; e.cabPitch = 0.04 * Math.sin(t * 0.53 + sem * 2);
    } else if (l.tipo === 2) {
      e.yaw = l.yaw;
      e.cabYaw = 0.35 * Math.sin(t * 0.4);
    } else {
      const ag = l.ag;
      e.yaw = st.yaw;
      e.andar = st.andar; e.amp = st.amp;
      // sentarse y levantarse (0,9 s, lo que tarda la cámara en confirmar)
      if (ag.estado === 'sentandose' || ag.estado === 'levantandose') {
        const a = multitudAsiento(ag, this.estadoRef);
        const s = ag.estado === 'sentandose' ? 1 - ag.t / 0.9 : ag.t / 0.9;
        e.sentado = suave(s); e.transicion = 1;
        if (a) { const yawSilla = a.mira > 0 ? 0 : PI; e.yaw = st.yaw + difAng(yawSilla, st.yaw) * suave(s * 1.4); }
      }
      e.prisa = ag.rival ? 1 : 0;
      if (ag.rival) { e.amp *= 1.1; expr = EXPRESION.decidido; }
      // qué hace con las manos
      const quieto = st.andar < 0.25;
      if (ag.estado === 'cola') gesto = (sem % 2) ? 'celularPie' : 'nada';
      else if (quieto && ag.destino === 'estante') gesto = Math.sin(t * 0.31 + sem) > 0.75 ? 'alcanzar' : (sem % 3 === 0 ? 'nada' : 'libro');
      else if (quieto && ag.destino === 'espera') gesto = (sem % 3 === 0) ? 'celularPie' : 'nada';
      else if (!quieto && p.lleva === 'celular') gesto = 'celularPie';
      else if (!quieto && p.lleva === 'tirantes' && p.mochila >= 0) gesto = 'tirantes';
      pesoGesto = gesto === 'celularPie' && !quieto ? 0.85 : 1;
      // mira hacia donde gira; quieta, mira alrededor
      e.cabYaw = lim(st.giro * 0.28, -0.7, 0.7) + (quieto && gesto === 'nada' ? 0.65 * Math.sin(t * 0.23 + sem) * Math.sin(t * 0.11 + sem * 2) : 0.08 * Math.sin(t * 0.5 + sem));
      if (ag.estado === 'cola' && st.tCola > 15) expr = EXPRESION.cansado;
    }
    // gesto (brazos, inclinación, cabeza)
    if (gesto !== 'nada') aplicarGesto(gesto, e, p, t, p.escala, pesoGesto, st);
    st.enMano = pesoGesto > 0.6 ? (gesto === 'celular' || gesto === 'celularPie' ? 'celular' : gesto === 'leer' || gesto === 'libro' ? 'libro' : null) : null;
    if (EXPRESION_GESTO[gesto] !== undefined && pesoGesto > 0.5) expr = EXPRESION_GESTO[gesto];
    if (gesto === 'estirarse' && pesoGesto > 0.5) expr = p.amable ? EXPRESION.sonrisa : EXPRESION.cansado;
    // mirar a quien se acerca (el jugador): gira la cabeza y, si es amable, sonríe
    const yCab = e.y + (e.sentado > 0.5 ? 1.17 : 1.6) * p.escala;
    const dx = this.cam.x - e.x, dyc = this.cam.y - yCab, dz = this.cam.z - e.z;
    const dist = Math.hypot(dx, dz);
    const c = Math.cos(-e.yaw), s = Math.sin(-e.yaw);
    const lx = c * dx + s * dz, lz = -s * dx + c * dz;
    const ang = Math.atan2(lx, lz);
    const ocupado = (gesto === 'teclear' || gesto === 'escribir') && dist > 1.8;
    const quiere = l.tipo !== 2 && dist < 3.6 && dist > 0.35 && Math.abs(ang) < 1.75 && !ocupado ? 1 : 0;
    st.mirarPeso += (quiere - st.mirarPeso) * Math.min(1, dt * 3);
    if (st.mirarPeso > 0.01) {
      const w = st.mirarPeso;
      e.cabYaw = mezclar(e.cabYaw, lim(ang, -1.15, 1.15), w);
      e.cabPitch = mezclar(e.cabPitch, lim(-Math.atan2(dyc, Math.max(0.3, dist)), -0.5, 0.6), w);
      e.torsoYaw += lim(ang, -1.6, 1.6) * 0.18 * w;
      if (w > 0.5) expr = p.amable ? EXPRESION.sonrisa : EXPRESION.neutral;
    }
    // suavizado de la cabeza (sin saltos entre gestos)
    st.cabYaw += (e.cabYaw - st.cabYaw) * Math.min(1, dt * 5);
    st.cabPitch += (e.cabPitch - st.cabPitch) * Math.min(1, dt * 5);
    e.cabYaw = st.cabYaw; e.cabPitch = st.cabPitch;
    posar(e, this.datos, slot * N_HUESOS * 12);
    l.vx = e.x; l.vz = e.z;
    return expr;
  }

  // Estudiante que camina bajo un rayo
  caminanteEn(raycaster) {
    if (!this.seleccion.count) return null;
    const hit = raycaster.intersectObject(this.seleccion, false)[0];
    if (!hit) return null;
    return this.elegibles[hit.instanceId] || null;
  }
}

// el asiento al que va o del que se levanta un agente (Gente lo recibe en estadoRef)
function multitudAsiento(ag, estado) {
  if (!estado) return null;
  return estado.get(ag.estado === 'sentandose' ? ag.asiento : ag.asientoDejado) || null;
}
