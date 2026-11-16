// El jugador en primera persona: caminar por los dos pisos y la escalera, mirar con la mira
// y actuar sobre lo que tiene enfrente (asientos, mesas, estudiantes, tótem, puertas, cámaras).
import * as THREE from 'three';
import { alturaSuelo, yPiso } from '../biblioteca/plano.js';

const $ = (s) => document.querySelector(s);

export class Jugador {
  constructor(app) {
    this.app = app;
    this.activo = false;
    this.nivel = 1;
    this.metros = 0;
    this.hover = null;
    this.ray = new THREE.Raycaster();
    this.tPick = 0;
    this.describir = null;    // (hover) → { titulo, detalle, accion } del modo actual
    this.alInteractuar = null; // (hover) → acción del modo actual
    this.mira = $('#mira');
    this.texto = $('#miraTexto');
    const canvas = app.motor.renderer.domElement;
    window.addEventListener('keydown', (e) => {
      if (!this.activo || e.repeat || e.code !== 'KeyE') return;
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      this.interactuar();
    });
    canvas.addEventListener('mousedown', (e) => {
      if (this.activo && e.button === 0 && document.pointerLockElement === canvas) this.interactuar();
    });
  }

  get escena() { return this.app.escenas.biblioteca; }
  get camara() { return this.app.control.camara; }

  // conservar: sigue contando los metros (al volver de la vista aérea o al levantarse)
  iniciar({ x, z, piso = 1, rumbo = 0, velocidad = 1.7, conservar = false }) {
    this.activo = true;
    this.nivel = piso;
    if (!conservar) this.metros = 0;
    this.anterior = null;
    this.hover = null;
    this.inicio = { x, z, piso, rumbo };
    if (this.app.vr?.presentando) { this.app.vr.colocar({ x, y: alturaSuelo(x, z, piso), z, rumbo }); this.app.vr.nivel = piso; }
    const y = alturaSuelo(x, z, piso);
    this.app.control.usarPaseo({
      pos: [x, y, z], rumbo, ojos: 1.62, velocidad, near: 0.05,
      libre: (px, pz) => this.escena.transitable(px, pz, this.nivel),
      altura: (px, pz) => { const yy = alturaSuelo(px, pz, this.nivel); if (yy > 3.4) this.nivel = 2; else if (yy < 1.1) this.nivel = 1; return yy; },
    });
    this.mira.hidden = false;
  }

  detener() {
    this.activo = false;
    this.hover = null;
    this.mira.hidden = true;
    this.texto.hidden = true;
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  // Posición del jugador (en el visor, la de la cabeza)
  get pos() {
    const vr = this.app.vr;
    if (vr?.presentando) { const c = vr.posicionCabeza(new THREE.Vector3()); return { x: c.x, z: c.z, piso: vr.nivel || 1 }; }
    const c = this.camara.position;
    return { x: c.x, z: c.z, piso: this.nivel };
  }
  get rumbo() {
    if (this.app.vr?.presentando) return this.app.vr.rumboCabeza();
    return this.app.control.paseo.yaw;
  }

  // Coloca al jugador sentado en un asiento (vista a la altura de una persona sentada)
  sentarEn(a) {
    if (this.app.vr?.presentando) { this.app.vr.sentar(a); return; }
    const y = yPiso(a.piso);
    this.app.control.usarOrbita({ pos: [a.x, y + 1.18, a.z - a.mira * 0.15], obj: [a.x, y + 0.95, a.z + a.mira * 1.8], min: 0.01, max: 25, animar: true, dur: 1.1 });
    this.app.control.orbita.minDistance = 0.01;
    this.mira.hidden = true;
    this.texto.hidden = true;
  }

  interactuar() {
    if (!this.activo) return;
    if (!document.querySelector('#resultado').hidden || this.app.hud.dialogoAbierto) return;
    this.alInteractuar?.(this.hover);
  }

  update(dt) {
    if (!this.activo) return;
    const vr = this.app.vr?.presentando;
    const c = vr ? this.pos : this.camara.position;
    if (vr || this.app.control.modo === 'caminar') {
      if (this.anterior) { const d = Math.hypot(c.x - this.anterior.x, c.z - this.anterior.z); if (d < 2) this.metros += d; }
      this.anterior = { x: c.x, z: c.z };
    } else this.anterior = null;
    if (vr || this.app.control.modo !== 'caminar') return;
    this.tPick -= dt;
    if (this.tPick > 0) return;
    this.tPick = 0.08;
    this.ray.setFromCamera(new THREE.Vector2(0, 0), this.camara);
    this.ray.far = 40;
    this.hover = this.elegirEn(this.ray);
    this.#pintar();
  }

  // Lo que hay bajo un rayo: el estudiante más cercano o un objeto de la biblioteca
  elegirEn(ray) {
    const b3d = this.escena.b3d;
    const obj = b3d.objetoEn(ray);
    const ag = b3d.caminanteEn(ray, this.app.multitud.agentes);
    let hit = obj;
    if (ag) {
      const d = Math.hypot(ag.x - ray.ray.origin.x, ag.z - ray.ray.origin.z);
      if (!obj || d < obj.distancia) hit = { tipo: 'estudiante', ag, distancia: d };
    }
    return hit;
  }

  #pintar() {
    const info = this.hover && this.describir ? this.describir(this.hover) : null;
    this.mira.classList.toggle('activa', !!info?.accion);
    this.mira.classList.toggle('alerta', !!info?.alerta);
    if (!info) { this.texto.hidden = true; return; }
    const html = `<b>${info.titulo}</b>${info.detalle ? `<span class="detalle">${info.detalle}</span>` : ''}${info.accion ? `<span class="accion">${info.accion}</span>` : ''}`;
    if (this.texto.dataset.h !== html) { this.texto.innerHTML = html; this.texto.dataset.h = html; }
    this.texto.hidden = false;
  }
}

// Descripción común de los objetos de la biblioteca (cada modo agrega su acción)
export function describirObjeto(app, hit) {
  const b = app.biblio;
  if (!hit) return null;
  const NZ = { general: 'Sala general', piloto: 'Mesa piloto', silencio: 'Zona de silencio', grupo: 'Trabajo en grupo' };
  if (hit.tipo === 'asiento') {
    const a = b.get(hit.id); if (!a) return null;
    const e = a.estudiante ? 'tuyo' : b.estadoDe(a);
    const est = { libre: 'libre', ocupado: 'ocupado', objeto: 'apartado con un objeto', sinDato: 'sin señal de la cámara', tuyo: 'tu asiento' }[e];
    const extras = [a.piloto ? null : NZ[a.zona], a.enchufe ? 'con enchufe' : null, a.ventana ? 'junto a la ventana' : null, a.piloto ? (b.pilotoReal ? 'dato REAL de la maqueta' : 'mesa piloto (simulada)') : null].filter(Boolean).join(' · ');
    return { titulo: `Asiento ${a.id} · ${est}`, detalle: `${extras} · ${hit.distancia.toFixed(0)} m`, estado: e, a };
  }
  if (hit.tipo === 'mesa') {
    const libres = b.asientos.filter((a) => a.mesa === hit.id && b.estadoDe(a) === 'libre').length;
    return { titulo: `Mesa ${hit.id}`, detalle: `${libres} de 4 asientos libres · una cámara ESP32-CAM la vigila` };
  }
  if (hit.tipo === 'estudiante') {
    const ag = hit.ag;
    const que = ag.estado === 'cola' ? 'espera afuera: aforo completo' : ag.destino === 'asiento' ? (ag.dentro ? 'va a su asiento' : 'llegando') : ag.destino === 'espera' ? 'busca asiento y espera' : ag.destino === 'estante' ? 'busca un libro' : 'se va';
    return { titulo: `Estudiante · ${que}`, detalle: ag.asiento && ag.destino === 'asiento' ? `Rumbo a ${ag.asiento}` : '', alerta: ag.rival };
  }
  if (hit.tipo === 'totem') return { titulo: 'Tótem de disponibilidad', detalle: `Piso 1: ${b.libres(1)} libres · Piso 2: ${b.libres(2)} libres · ${b.puertas.dentro}/${b.puertas.aforo} personas` };
  if (hit.tipo === 'puerta') return { titulo: hit.id === 'entrada' ? 'Puerta de entrada · sensor S1' : 'Puerta de salida · sensor S2', detalle: hit.id === 'entrada' ? 'Cada cruce suma una persona (aforo 381)' : 'Cada cruce resta una persona' };
  if (hit.tipo === 'camara') {
    const libres = b.asientos.filter((a) => a.mesa === hit.id && b.estadoDe(a) === 'libre').length;
    const caida = app.multitud.camarasCaidas.has(hit.id);
    return { titulo: `ESP32-CAM de la mesa ${hit.id}`, detalle: caida ? 'Sin señal: sus asientos se ven en gris' : `Ve 4 asientos: ${libres} libres · imagen de 320×240 cada 300 ms` };
  }
  return null;
}
