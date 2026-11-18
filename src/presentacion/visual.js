// Ayudas visuales de la Simulación para presentación (escritorio y visor):
//   · marca del sensor S1 en la puerta de ENTRADA (color = estado de la conexión) y punto de partida a 2 m
//   · cartel junto a la puerta con la distancia en vivo ("Estás a 1,42 m de la entrada")
//   · lectura pequeña de la distancia pegada a la vista (solo en el visor, durante la aproximación)
//   · panel de guía (calibración) y panel de la mesa piloto con botones que se eligen con el rayo
//   · fundido a negro para los saltos (más cómodo que moverse con el stick)
import * as THREE from 'three';
import { Panel3D, dibujarGlifo } from '../control/panel3d.js';
import { FUENTE, rectRedondo } from '../motor/textos.js';
import { PLANO, yPiso } from '../biblioteca/plano.js';
import { SENSOR_VIRTUAL, DISTANCIA_INICIO, textoMetros } from './calibracion.js';

export const COLOR_CONEXION = { usb: '#22c55e', sala: '#22c55e', ensayo: '#c084fc', espera: '#f59e0b', ninguna: '#94a3b8' };

// Texto en varias líneas dentro de un ancho (devuelve la y siguiente)
function parrafo(ctx, texto, x, y, ancho, alto, max = 4) {
  const palabras = String(texto).split(' ');
  let l = '', n = 0;
  for (const p of palabras) {
    const prueba = l ? `${l} ${p}` : p;
    if (ctx.measureText(prueba).width > ancho && l) { ctx.fillText(l, x, y); y += alto; l = p; if (++n >= max - 1) break; }
    else l = prueba;
  }
  if (l) { ctx.fillText(l, x, y); y += alto; }
  return y;
}

export class AyudasPresentacion {
  constructor(app) {
    this.app = app;
    this.grupo = new THREE.Group();
    this.grupo.name = 'ayudasPresentacion';
    this.info = { distancia: null, titulo: '', texto: '', conexion: 'ninguna', textoConexion: '', fase: '', detectado: false };
    this.tiempo = 0;
    this.#sensor();
    this.#inicio();
    this.#paneles();
    this.#fundido();
  }

  get vr() { return this.app.vr; }

  montar(scene) {
    scene.add(this.grupo);
    this.app.motor.camara.add(this.velo, this.panelMini.malla);
    // los paneles con botones se registran en el visor para que el rayo los pueda pulsar
    const vr = this.vr;
    if (vr) for (const p of [this.panelGuia, this.panelMesa]) if (!vr.paneles.includes(p)) vr.paneles.push(p);
  }

  desmontar() {
    this.grupo.parent?.remove(this.grupo);
    this.velo.parent?.remove(this.velo);
    this.panelMini.malla.parent?.remove(this.panelMini.malla);
    const vr = this.vr;
    if (vr) vr.paneles = vr.paneles.filter((p) => p !== this.panelGuia && p !== this.panelMesa);
  }

  // ---------------------------------------------------------------- sensor S1 y punto de partida
  #sensor() {
    const V = SENSOR_VIRTUAL;
    const aro = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }));
    aro.position.set(V.x, 0.02, V.z + 0.05);
    const columna = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.2, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.03, toneMapped: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    columna.position.set(V.x, 1.1, V.z + 0.05);
    // haz infrarrojo dibujado de lado a lado de la puerta, a la altura del sensor de la maqueta
    const P = PLANO.puertas.entrada;
    const haz = new THREE.Mesh(new THREE.BoxGeometry(P.x1 - P.x0 - 0.2, 0.025, 0.025), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    haz.position.set(V.x, 1.0, V.z + 0.06);
    this.marca = { aro, columna, haz, destello: 0 };
    this.grupo.add(aro, columna, haz);
  }

  #inicio() {
    const V = SENSOR_VIRTUAL;
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 18;
    ctx.beginPath(); ctx.arc(256, 256, 220, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(56,189,248,0.18)'; ctx.fill();
    ctx.fillStyle = '#e0f2fe'; ctx.font = `800 92px ${FUENTE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('INICIO', 256, 210);
    ctx.font = `700 64px ${FUENTE}`; ctx.fillText(`${DISTANCIA_INICIO} m del sensor`, 256, 300);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const disco = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
    disco.position.set(V.x, 0.025, V.z + DISTANCIA_INICIO);
    // flechas en el piso hacia la puerta
    const flechas = new THREE.Group();
    const forma = new THREE.Shape();
    forma.moveTo(0, -0.16); forma.lineTo(0.16, 0.06); forma.lineTo(0.06, 0.06); forma.lineTo(0.06, 0.16); forma.lineTo(-0.06, 0.16); forma.lineTo(-0.06, 0.06); forma.lineTo(-0.16, 0.06); forma.closePath();
    const geo = new THREE.ShapeGeometry(forma).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false });
    for (let k = 0; k < 3; k++) { const f = new THREE.Mesh(geo, mat); f.position.set(V.x, 0.022, V.z + 0.55 + k * 0.45); flechas.add(f); }
    this.inicio = { disco, flechas, mat };
    this.grupo.add(disco, flechas);
  }

  // ---------------------------------------------------------------- paneles
  #paneles() {
    const V = SENSOR_VIRTUAL;
    // cartel en la mitad izquierda de la ENTRADA (fuera del camino, a la altura del pecho)
    this.panelPuerta = new Panel3D({ ancho: 0.8, alto: 0.47, px: 1100, nombre: 'presPuerta', dibujar: (ctx, w, h) => this.#dibujarPuerta(ctx, w, h) });
    this.panelPuerta.malla.position.set(V.x - 1.05, 1.5, V.z + 0.12);
    this.grupo.add(this.panelPuerta.malla);
    // lectura pequeña pegada a la vista (visor)
    this.panelMini = new Panel3D({ ancho: 0.4, alto: 0.08, px: 900, nombre: 'presMini', dibujar: (ctx, w, h) => this.#dibujarMini(ctx, w, h) });
    this.panelMini.malla.position.set(0, -0.3, -0.9);
    this.panelMini.malla.rotation.x = -0.25;
    this.panelMini.malla.renderOrder = 41;
    this.panelMini.material.depthTest = false;
    this.panelMini.malla.visible = false;
    // guía grande (calibración y pasos), se coloca frente al usuario
    this.panelGuia = new Panel3D({ ancho: 1.05, alto: 0.66, px: 1500, nombre: 'presGuia', dibujar: (ctx, w, h, panel) => this.#dibujarGuia(ctx, w, h, panel) });
    this.panelGuia.malla.visible = false;
    this.panelGuia.malla.renderOrder = 22;
    this.grupo.add(this.panelGuia.malla);
    // mesa piloto: qué asientos están libres, con botones
    const mp = PLANO.mesaPiloto;
    this.panelMesa = new Panel3D({ ancho: 1.0, alto: 0.36, px: 1300, nombre: 'presMesa', dibujar: (ctx, w, h) => this.#dibujarMesa(ctx, w, h) });
    this.panelMesa.malla.position.set(mp.x, 1.9, mp.z - 0.55);
    this.panelMesa.malla.visible = false;
    this.grupo.add(this.panelMesa.malla);
    this.guia = { titulo: '', lineas: [], pie: '' };
    this.mesa = { titulo: '', sub: '', asientos: [] };
  }

  #chipConexion(ctx, x, y, alto) {
    const i = this.info;
    const col = COLOR_CONEXION[i.conexion] || '#94a3b8';
    ctx.font = `700 ${alto * 0.62}px ${FUENTE}`;
    const t = i.textoConexion || '';
    const w = ctx.measureText(t).width + alto * 1.4;
    ctx.fillStyle = 'rgba(15,23,42,0.85)'; rectRedondo(ctx, x, y, w, alto, alto / 2); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + alto * 0.5, y + alto / 2, alto * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e2e8f0'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(t, x + alto * 0.9, y + alto / 2 + 1);
  }

  #dibujarPuerta(ctx, w, h) {
    const i = this.info;
    ctx.fillStyle = 'rgba(8,13,24,0.92)'; rectRedondo(ctx, 4, 4, w - 8, h - 8, 34); ctx.fill();
    ctx.strokeStyle = i.detectado ? '#22c55e' : 'rgba(56,189,248,0.75)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#7dd3fc'; ctx.font = `800 40px ${FUENTE}`;
    ctx.fillText('ENTRADA · SENSOR S1', 34, 66);
    if (i.detectado) {
      ctx.fillStyle = '#4ade80'; ctx.font = `900 120px ${FUENTE}`;
      ctx.fillText('INGRESO', 34, 220);
    } else {
      ctx.fillStyle = '#f8fafc'; ctx.font = `900 132px ${FUENTE}`;
      ctx.fillText(textoMetros(i.distancia), 34, 220);
    }
    ctx.fillStyle = '#cbd5e1'; ctx.font = `600 36px ${FUENTE}`;
    parrafo(ctx, i.texto || '', 34, 290, w - 68, 44, 3);
    this.#chipConexion(ctx, 34, h - 96, 62);
  }

  #dibujarMini(ctx, w, h) {
    const i = this.info;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(8,13,24,0.8)'; rectRedondo(ctx, 2, 2, w - 4, h - 4, h / 2 - 2); ctx.fill();
    ctx.strokeStyle = COLOR_CONEXION[i.conexion] || '#94a3b8'; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = '#f8fafc'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `800 ${h * 0.46}px ${FUENTE}`;
    ctx.fillText(i.detectado ? '¡INGRESO!' : `${textoMetros(i.distancia)} a la entrada`, w / 2, h / 2 + 2, w - h * 0.8);
  }

  #dibujarGuia(ctx, w, h, panel) {
    const g = this.guia;
    ctx.fillStyle = 'rgba(8,13,24,0.95)'; rectRedondo(ctx, 4, 4, w - 8, h - 8, 44); ctx.fill();
    ctx.strokeStyle = 'rgba(56,189,248,0.7)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#7dd3fc'; ctx.font = `800 36px ${FUENTE}`;
    ctx.fillText('SIMULACIÓN PARA PRESENTACIÓN', 44, 70);
    ctx.fillStyle = '#f8fafc'; ctx.font = `800 62px ${FUENTE}`;
    ctx.fillText(g.titulo, 44, 148, w - 88);
    let y = 214;
    ctx.font = `500 40px ${FUENTE}`; ctx.fillStyle = '#e2e8f0';
    for (const l of g.lineas) {
      if (l.glifo) { dibujarGlifo(ctx, l.glifo, 70, y - 14, 50); ctx.fillText(l.texto, 112, y, w - 160); y += 64; }
      else y = parrafo(ctx, l.texto ?? l, 44, y, w - 88, 50, 3) + 12;
    }
    if (g.pie) { ctx.fillStyle = '#94a3b8'; ctx.font = `500 30px ${FUENTE}`; parrafo(ctx, g.pie, 44, panel?.botones.length ? h - 196 : h - 70, w - 88, 38, 2); }
    this.#chipConexion(ctx, w - 560, 30, 58);
  }

  #dibujarMesa(ctx, w, h) {
    const m = this.mesa;
    ctx.fillStyle = 'rgba(8,13,24,0.93)'; rectRedondo(ctx, 4, 4, w - 8, h - 8, 38); ctx.fill();
    ctx.strokeStyle = 'rgba(253,230,138,0.8)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#fde68a'; ctx.font = `800 54px ${FUENTE}`; ctx.fillText(m.titulo, 36, 72, w - 72);
    ctx.fillStyle = '#cbd5e1'; ctx.font = `600 34px ${FUENTE}`; ctx.fillText(m.sub || '', 36, 118, w - 72);
    // las cuatro sillas (A–D = zonas A1–A4 de la ESP32-CAM)
    const COL = { libre: ['rgba(34,197,94,0.18)', '#22c55e', '#bbf7d0'], ocupada: ['rgba(239,68,68,0.16)', '#ef4444', '#fecaca'], tuya: ['rgba(56,189,248,0.24)', '#38bdf8', '#e0f2fe'], 'sin dato': ['rgba(148,163,184,0.12)', '#64748b', '#cbd5e1'] };
    const n = m.asientos.length || 1, gap = 18, x0 = 36, y = 146, alto = 150;
    const ancho = (w - x0 * 2 - gap * (n - 1)) / n;
    m.asientos.forEach((s, k) => {
      const x = x0 + k * (ancho + gap);
      const [fondo, borde, texto] = COL[s.estado] || COL['sin dato'];
      ctx.fillStyle = fondo; rectRedondo(ctx, x, y, ancho, alto, 24); ctx.fill();
      ctx.strokeStyle = borde; ctx.lineWidth = s.elegida ? 10 : 4; ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillStyle = texto;
      ctx.font = `900 66px ${FUENTE}`; ctx.fillText(s.letra, x + ancho / 2, y + 74);
      ctx.font = `600 30px ${FUENTE}`; ctx.fillText(`${s.zona} · ${s.estado}`, x + ancho / 2, y + 124, ancho - 16);
    });
  }

  // Coloca el panel de guía frente a la cabeza (a la altura de los ojos, 1,2 m adelante)
  colocarGuia(cabeza, rumbo, distancia = 1.25) {
    const p = this.panelGuia.malla;
    p.position.set(cabeza.x - Math.sin(rumbo) * distancia, Math.max(1.1, cabeza.y - 0.12), cabeza.z - Math.cos(rumbo) * distancia);
    p.rotation.set(0, rumbo, 0);
    p.visible = true;
  }

  // ---------------------------------------------------------------- fundido a negro
  #fundido() {
    this.velo = new THREE.Mesh(new THREE.SphereGeometry(0.25, 24, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, toneMapped: false }));
    this.velo.renderOrder = 100;
    this.velo.visible = false;
    this.fade = null;
  }

  // Funde a negro, ejecuta "medio" (el salto) y vuelve a aclarar. Si ya hay un fundido en curso,
  // el nuevo salto se encadena (sin volver a aclarar entre uno y otro).
  fundir(medio, { bajar = 0.18, subir = 0.26 } = {}) {
    const f = this.fade;
    if (f && !f.hecho) { const previo = f.medio; f.medio = () => { previo?.(); medio?.(); }; f.subir = Math.max(f.subir, subir); return; }
    if (f && f.hecho) { f.t = 0; f.subir = Math.max(f.subir, subir); try { medio?.(); } catch (e) { console.error(e); } return; }
    this.fade = { t: 0, bajar, subir, medio, hecho: false };
    this.velo.visible = true;
  }
  get fundiendo() { return !!this.fade; }

  // ---------------------------------------------------------------- cada cuadro
  update(dt, { mostrarInicio = true, mostrarPuerta = true, mostrarMini = false } = {}) {
    this.tiempo += dt;
    const col = new THREE.Color(COLOR_CONEXION[this.info.conexion] || '#94a3b8');
    const m = this.marca;
    m.destello = Math.max(0, m.destello - dt * 1.4);
    m.aro.material.color.copy(col);
    m.columna.material.color.copy(m.destello > 0 ? new THREE.Color('#4ade80') : col);
    m.columna.material.opacity = 0.015 + 0.02 * (0.5 + 0.5 * Math.sin(this.tiempo * 3)) + m.destello * 0.3;
    m.haz.material.opacity = m.destello > 0 ? 0.15 : 0.35 + 0.2 * Math.sin(this.tiempo * 6);
    m.aro.scale.setScalar(1 + 0.06 * Math.sin(this.tiempo * 3) + m.destello * 0.6);
    this.inicio.disco.visible = mostrarInicio;
    this.inicio.flechas.visible = mostrarInicio;
    this.inicio.flechas.children.forEach((f, k) => { f.material.opacity = 0.3 + 0.6 * Math.max(0, Math.sin(this.tiempo * 4 - k * 0.9)); });
    this.panelPuerta.malla.visible = mostrarPuerta;
    this.panelMini.malla.visible = mostrarMini && !!this.vr?.presentando;
    for (const p of [this.panelPuerta, this.panelMini, this.panelGuia, this.panelMesa]) if (p.malla.visible) p.update();
    // fundido
    const f = this.fade;
    if (f) {
      f.t += dt;
      let op;
      if (!f.hecho) {
        op = Math.min(1, f.t / f.bajar);
        if (f.t >= f.bajar) { f.hecho = true; f.t = 0; try { f.medio?.(); } catch (e) { console.error(e); } }
      } else {
        op = 1 - Math.min(1, f.t / f.subir);
        if (f.t >= f.subir) { this.fade = null; op = 0; }
      }
      this.velo.material.opacity = op;
      this.velo.visible = op > 0.001;
    }
  }

  // El rótulo "Sensor S1 · suma" de la escena mira hacia adentro (desde afuera se lee al revés y queda a la
  // altura del pecho): mientras dura la sección se gira hacia quien llega y se sube sobre la cabeza.
  girarRotuloSensor(b3d, activar) {
    const P = PLANO.puertas.entrada, cx = (P.x0 + P.x1) / 2;
    if (!this.rotuloSensor) {
      const o = b3d.pisos[1].children.find((x) => Math.abs(x.position.x - cx) < 0.01 && Math.abs(x.position.y - 1.45) < 0.01 && Math.abs(x.position.z - (P.z - 0.33)) < 0.01);
      if (!o) return;
      this.rotuloSensor = { o, y: o.position.y, giro: o.rotation.y };
    }
    const r = this.rotuloSensor;
    r.o.position.y = activar ? 2.32 : r.y;
    r.o.rotation.y = activar ? 0 : r.giro;
  }

  destellar() { this.marca.destello = 1; }
  marcarTodo() { for (const p of [this.panelPuerta, this.panelMini, this.panelGuia, this.panelMesa]) p.marcar(); }

  // Panel de la mesa piloto mirando hacia quien llega
  orientarMesa(cabeza) {
    const p = this.panelMesa.malla;
    p.rotation.set(0, Math.atan2(cabeza.x - p.position.x, cabeza.z - p.position.z), 0);
  }

  // altura del piso de un asiento (por si algún día la mesa elegida está en el sótano)
  static yAsiento(a) { return yPiso(a.piso); }
}
