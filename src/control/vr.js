// Visor 3D (WebXR): Meta Quest 3, Quest con Link/Air Link, SteamVR. Realidad virtual y mixta.
//  · Stick izquierdo: caminar · Stick derecho: girar (← →) y teletransporte (↑ y soltar)
//  · Gatillo: pulsar botones y elegir asientos en el tablero · A: acción del paso
//  · B: tablero · X: cambiar de piso (biblioteca) / entra una persona (maqueta) · Y: ayuda
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { Panel3D, dibujarGlifo } from './panel3d.js';
import { dibujarTablero } from '../ui/tablero.js';
import { FUENTE, rectRedondo } from '../motor/textos.js';
import { MAQUETA as M } from '../config.js';
import { yPiso } from '../biblioteca/plano.js';

const ARRIBA = new THREE.Vector3(0, 1, 0);
const zonaMuerta = (v, z = 0.18) => (Math.abs(v) < z ? 0 : (v - Math.sign(v) * z) / (1 - z));

export class ControlVR {
  constructor(app) {
    this.app = app;
    this.motor = app.motor;
    this.renderer = app.motor.renderer;
    this.rig = app.motor.rig;
    this.camara = app.motor.camara;
    this.sesion = null;
    this.modo = null;
    this.escala = 'mesa';
    this.pendienteColocar = null;
    this.controles = [];
    this.paneles = [];
    this.raycaster = new THREE.Raycaster();
    this.tmpM = new THREE.Matrix4();
    this.tmpV = new THREE.Vector3();
    this.tmpV2 = new THREE.Vector3();
    this.tmpQ = new THREE.Quaternion();
    this.agarre = null;
    this.tGiro = 0;
    this.nivel = 1;
    this.mostrarPistas = true;
    this.#crearControles();
    this.#crearPaneles();
    this.#crearTeleport();
    this.renderer.xr.addEventListener('sessionend', () => this.#alTerminar());
  }

  get presentando() { return !!this.sesion; }
  get escenaActual() { return this.app.escenas[this.app.escenaActual]; }
  get escalaRig() { return this.rig.scale.x; }
  get enBiblioteca() { return this.app.escenaActual === 'biblioteca'; }

  // ================================================================ sesión
  async entrar(modo = 'vr') {
    if (this.sesion) return;
    const ar = modo === 'ar';
    if (ar && this.app.modo !== 'tecnico') this.app.irModo('tecnico');
    if (!ar && this.app.modo === 'admin') this.app.irModo('estudiante');
    const opciones = ar
      ? { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking', 'hit-test', 'layers'] }
      : { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'] };
    const sesion = await navigator.xr.requestSession(ar ? 'immersive-ar' : 'immersive-vr', opciones);
    this.autonomo = /OculusBrowser|Quest|Pico|Wolvic/i.test(navigator.userAgent);
    try { this.renderer.xr.setFramebufferScaleFactor(this.autonomo ? 1.0 : (this.motor.calidad === 'alta' ? 1.25 : 1.0)); } catch { /* ya en sesión */ }
    this.renderer.xr.setReferenceSpaceType('local-floor');
    this.sinPiso = false;
    try {
      await this.renderer.xr.setSession(sesion);
    } catch {
      this.renderer.xr.setReferenceSpaceType('local');
      this.sinPiso = true;
      await this.renderer.xr.setSession(sesion);
    }
    try { this.renderer.xr.setFoveation(this.autonomo ? 0.8 : 0.3); } catch { /* opcional */ }
    try { if (!this.autonomo && sesion.supportedFrameRates?.includes?.(90)) sesion.updateTargetFrameRate(90); } catch { /* opcional */ }
    this.sesion = sesion;
    this.modo = ar ? 'ar' : 'vr';
    this.inicioPendiente = true;
    this.app.control.activo = false;
    this.camara.clearViewOffset();
    this.camara.near = 0.02; this.camara.far = 300; this.camara.updateProjectionMatrix();
    if (ar) await this.#prepararAR(true);
    this.escala = 'mesa';
    // la cámara aún tiene la pose de escritorio: se borra para colocar al usuario con la primera pose real del visor
    this.camara.position.set(0, 0, 0);
    this.cuadrosSesion = 0;
    this.pendienteColocar = this.#posicionInicial();
    this.mostrarPistas = true;
    this.panelAyuda.malla.visible = true;
    this.panelTablero.malla.visible = false;
    this.escenaActual.scene.add(this.arco, this.anillo);
    if (this.enBiblioteca) { this.app.estudiante.detener(); this.app.estudiante.iniciar(); }
    this.#actualizarPaneles(true);
    this.app.hud.aviso(ar ? 'Realidad mixta activa: mira tu mesa y aprieta el gatillo para colocar la maqueta.' : 'Visor activo.', 'ok');
  }

  async salir() { try { await this.sesion?.end(); } catch { /* nada */ } }

  #alTerminar() {
    if (this.modo === 'ar') this.#prepararAR(false);
    this.sesion = null;
    this.modo = null;
    this.hitTest = null;
    this.rig.position.set(0, 0, 0);
    this.rig.rotation.set(0, 0, 0);
    this.rig.scale.setScalar(1);
    this.camara.position.set(0, 1.6, 3);
    this.camara.quaternion.identity();
    this.app.control.activo = true;
    this.escala = 'mesa';
    this.#soltar();
    this.arco.visible = false; this.anillo.visible = false;
    // los paneles del visor no deben quedar flotando en la vista de escritorio
    for (const p of this.paneles) p.malla.visible = false;
    this.motor.redimensionar();
    if (this.app.modo === 'tecnico') this.app.vistaMaqueta('general', false);
    else if (this.app.modo === 'estudiante') { this.app.estudiante.detener(); this.app.estudiante.iniciar(); }
  }

  alCambiarEscena() {
    if (!this.sesion) return;
    this.escala = 'mesa';
    this.#soltar();
    // el rig (con controles y paneles) ya viaja con la escena; el arco se agrega a la nueva
    this.escenaActual.scene.add(this.arco, this.anillo);
    this.pendienteColocar = this.#posicionInicial();
    this.#actualizarPaneles(true);
  }

  #posicionInicial() {
    const esc = this.escenaActual;
    if (this.modo === 'ar') return { ar: true };
    if (this.app.escenaActual === 'maqueta') return { ...esc.inicioMesa(), escala: 1 };
    const est = this.app.estudiante;
    if (est.entro) return { x: est.pos.x, y: yPiso(est.pos.piso || 1), z: est.pos.z, rumbo: 0, escala: 1 };
    return { ...esc.vrInicio(), escala: 1 };
  }

  // Coloca al usuario: sus pies en (x,y,z) mirando hacia "rumbo" (0 = hacia -z)
  colocar({ x, y = 0, z, rumbo = 0, escala = 1 }) {
    this.rig.scale.setScalar(escala);
    this.rig.rotation.set(0, rumbo, 0);
    const cab = this.camara.position;
    const off = this.tmpV.set(cab.x, 0, cab.z).multiplyScalar(escala).applyAxisAngle(ARRIBA, rumbo);
    // con espacio 'local' (sin piso) el origen está en la cabeza: se sube a 1.6 m
    const yRig = this.sinPiso ? y + (1.6 - cab.y) * escala : y;
    this.rig.position.set(x - off.x, yRig, z - off.z);
    this.rig.updateMatrixWorld(true);
    if (this.enBiblioteca) this.nivel = y > 3.4 ? 2 : 1;
  }

  posicionCabeza(v = new THREE.Vector3()) { return this.camara.getWorldPosition(v); }
  rumboCabeza() {
    const q = this.camara.getWorldQuaternion(this.tmpQ);
    const f = this.tmpV2.set(0, 0, -1).applyQuaternion(q);
    return Math.atan2(-f.x, -f.z);
  }

  refrescar() { this.tPaneles = 0; }

  // ================================================================ biblioteca: ruta por tramos y sentarse
  siguienteTramo() {
    const est = this.app.estudiante;
    const r = est.rutaActual;
    if (!r) return;
    const cab = this.posicionCabeza(new THREE.Vector3());
    // punto de la ruta más cercano a la cabeza y el siguiente a unos 6 m o el próximo giro
    let mejor = 0, dMin = Infinity;
    r.pts.forEach((p, i) => { const d = Math.hypot(p.x - cab.x, p.z - cab.z) + Math.abs(p.y - (this.rig.position.y)) * 2; if (d < dMin) { dMin = d; mejor = i; } });
    let i = Math.min(r.pts.length - 1, mejor + 1);
    while (i < r.pts.length - 1 && Math.hypot(r.pts[i].x - cab.x, r.pts[i].z - cab.z) < 1.2) i++;
    const p = r.pts[i];
    const q = r.pts[Math.min(r.pts.length - 1, i + 1)];
    const rumbo = i < r.pts.length - 1 ? Math.atan2(-(q.x - p.x), -(q.z - p.z)) : this.rig.rotation.y;
    this.#fundido();
    this.colocar({ x: p.x, y: p.y, z: p.z, rumbo, escala: 1 });
    est.pos = { x: p.x, z: p.z, piso: p.y > 3.4 ? 2 : 1 };
    this.#vibrar(0.5, 60, 'right');
    if (i >= r.pts.length - 1) est.sentarse();
  }

  sentar(a) {
    if (!a) return;
    // sentado: la vista baja ~0.42 m y mira hacia la mesa
    const rumbo = a.mira > 0 ? Math.PI : 0;
    this.colocar({ x: a.x, y: yPiso(a.piso) - 0.42, z: a.z - a.mira * 0.1, rumbo, escala: 1 });
    this.nivel = a.piso;
  }

  #fundido() { /* el salto es instantáneo; el anillo y la vibración marcan el destino */ }

  // ================================================================ escala 1:17 (maqueta)
  alternarEscala() {
    if (this.app.escenaActual !== 'maqueta' || this.modo === 'ar') return;
    const esc = this.escenaActual;
    const k = M.escalaHumana;
    this.#vibrar(0.6, 120);
    if (this.escala === 'mesa') {
      this.escala = 'humana';
      const p = esc.inicioHumano();
      const mundo = esc.maq.grupo.localToWorld(new THREE.Vector3(p.x, 0, p.z));
      this.colocar({ x: mundo.x, y: esc.maq.grupo.position.y, z: mundo.z, rumbo: esc.maq.grupo.rotation.y, escala: 1 / k });
      this.app.hud.aviso('Dentro de la maqueta (1:17).', 'info');
    } else {
      this.escala = 'mesa';
      this.colocar({ ...esc.inicioMesa(), escala: 1 });
    }
    this.#actualizarPaneles(true);
  }

  // ================================================================ realidad mixta (maqueta sobre la mesa real)
  async #prepararAR(activar) {
    const esc = this.app.escenas.maqueta;
    if (activar) {
      this.fondoPrevio = esc.scene.background;
      esc.scene.background = null;
      this.renderer.setClearAlpha(0);
      esc.sala.grupo.visible = false;
      esc.monitorCamGrupo.visible = false;
      if (!this.atrapaSombras) {
        this.atrapaSombras = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), new THREE.ShadowMaterial({ opacity: 0.35 }));
        this.atrapaSombras.rotation.x = -Math.PI / 2;
        this.atrapaSombras.position.y = -M.base.grosor - 0.0005;
        this.atrapaSombras.receiveShadow = true;
      }
      esc.maq.grupo.add(this.atrapaSombras);
      this.atrapaSombras.visible = true;
      try {
        const espacioVista = await this.sesion.requestReferenceSpace('viewer');
        this.hitTest = await this.sesion.requestHitTestSource?.({ space: espacioVista });
      } catch { this.hitTest = null; }
      if (!this.reticula) {
        this.reticula = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.075, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9, toneMapped: false }));
        this.reticula.matrixAutoUpdate = false;
      }
      esc.scene.add(this.reticula);
      this.reticula.visible = false;
    } else {
      esc.scene.background = this.fondoPrevio || esc.scene.background;
      this.renderer.setClearAlpha(1);
      esc.sala.grupo.visible = true;
      esc.monitorCamGrupo.visible = true;
      if (this.atrapaSombras) this.atrapaSombras.visible = false;
      if (this.reticula) this.reticula.visible = false;
      try { this.hitTest?.cancel?.(); } catch { /* nada */ }
      esc.maq.grupo.position.set(0, esc.alturaBase, 0);
      esc.maq.grupo.rotation.set(0, 0, 0);
    }
  }

  #colocarFrenteAR() {
    const cab = this.posicionCabeza(new THREE.Vector3());
    const r = this.rumboCabeza();
    const f = new THREE.Vector3(-Math.sin(r), 0, -Math.cos(r));
    const g = this.app.escenas.maqueta.maq.grupo;
    g.position.copy(cab).addScaledVector(f, 0.6);
    g.position.y = Math.max(0.45, cab.y - 0.62) + M.base.grosor;
    g.rotation.set(0, r, 0);
  }

  // ================================================================ controles
  #crearControles() {
    const fabrica = new XRControllerModelFactory();
    let fabricaManos = null;
    try { fabricaManos = new XRHandModelFactory(); } catch { /* sin manos */ }
    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      const grip = this.renderer.xr.getControllerGrip(i);
      grip.add(fabrica.createControllerModel(grip));
      const mano = this.renderer.xr.getHand(i);
      if (fabricaManos) { try { mano.add(fabricaManos.createHandModel(mano, 'mesh')); } catch { /* opcional */ } }
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
      const rayo = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.75, toneMapped: false }));
      rayo.scale.z = 1.5;
      rayo.visible = false;
      controller.add(rayo);
      const cursor = new THREE.Mesh(new THREE.SphereGeometry(0.008, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
      cursor.visible = false;
      controller.add(cursor);
      const c = { i, controller, grip, mano, rayo, cursor, fuente: null, lado: null, previos: [], hover: null, pistas: null };
      controller.addEventListener('connected', (e) => {
        c.fuente = e.data;
        c.lado = e.data.handedness;
        rayo.visible = e.data.targetRayMode === 'tracked-pointer';
        this.#crearPistasControl(c);
      });
      controller.addEventListener('disconnected', () => { c.fuente = null; rayo.visible = false; });
      controller.addEventListener('selectstart', () => this.#gatillo(c));
      this.rig.add(controller, grip, mano);
      this.controles.push(c);
    }
  }

  #vibrar(intensidad = 0.5, ms = 60, lado = null) {
    for (const c of this.controles) {
      if (lado && c.lado !== lado) continue;
      try { c.fuente?.gamepad?.hapticActuators?.[0]?.pulse?.(intensidad, ms); } catch { /* sin vibración */ }
    }
  }

  #gatillo(c) {
    if (c.hover) {
      const { panel, boton } = c.hover;
      if (panel.pulsar(boton)) { this.#vibrar(0.4, 40, c.lado); this.refrescar(); return; }
    }
    if (this.panelAyuda.malla.visible && this.inicioPendiente) {
      this.panelAyuda.malla.visible = false;
      this.panelTablero.malla.visible = true;
      this.mostrarPistas = true;
      this.inicioPendiente = false;
      this.#vibrar(0.5, 80);
      return;
    }
    if (this.modo === 'ar' && this.reticula?.visible) {
      const g = this.app.escenas.maqueta.maq.grupo;
      const p = new THREE.Vector3().setFromMatrixPosition(this.reticula.matrix);
      g.position.set(p.x, p.y + M.base.grosor, p.z);
      g.rotation.set(0, this.rumboCabeza(), 0);
      this.#vibrar(0.7, 120);
    }
  }

  // ================================================================ paneles
  #crearPaneles() {
    this.panelTablero = new Panel3D({ ancho: 1.12, alto: 0.84, px: 1600, nombre: 'tablero', dibujar: (ctx, w, h) => this.#dibujarTablero(ctx, w, h) });
    this.panelAyuda = new Panel3D({ ancho: 1.0, alto: 0.62, px: 1600, nombre: 'ayuda', dibujar: (ctx, w, h) => this.#dibujarAyuda(ctx, w, h) });
    this.panelCamara = new Panel3D({ ancho: 0.5, alto: 0.425, px: 800, nombre: 'camaraVR', dibujar: (ctx, w, h) => { ctx.drawImage(this.app.escenas.maqueta.camara.vista, 0, 0, w, h); } });
    this.panelRecorrido = new Panel3D({ ancho: 1.0, alto: 0.5, px: 1600, nombre: 'recorridoVR', dibujar: (ctx, w, h) => this.app.recorrido?.dibujarVR(ctx, w, h, this.panelRecorrido) });
    this.panelMuneca = new Panel3D({ ancho: 0.15, alto: 0.075, px: 600, nombre: 'muneca', dibujar: (ctx, w, h) => this.#dibujarMuneca(ctx, w, h) });
    this.paneles = [this.panelTablero, this.panelAyuda, this.panelCamara, this.panelRecorrido];
    for (const p of this.paneles) { p.malla.visible = false; this.rig.add(p.malla); }
    this.panelTablero.malla.position.set(-0.62, 1.3, -0.72);
    this.panelTablero.malla.rotation.y = 0.62;
    this.panelAyuda.malla.position.set(0, 1.45, -0.95);
    this.panelCamara.malla.position.set(0.62, 1.28, -0.72);
    this.panelCamara.malla.rotation.y = -0.62;
    this.panelRecorrido.malla.position.set(0, 0.98, -0.8);
    this.panelRecorrido.malla.rotation.x = -0.45;
    this.tPaneles = 0;
  }

  #actualizarPaneles(forzar = false) {
    const app = this.app;
    const enMaqueta = app.escenaActual === 'maqueta';
    const sim = app.fuentes.modo === 'sim';
    const p = this.panelTablero;
    p.limpiarBotones();
    const W = p.w, H = p.h;
    const fila = (y, items) => {
      const m = 28, gap = 16, n = items.length;
      const bw = (W - m * 2 - gap * (n - 1)) / n;
      items.forEach((it, k) => p.boton(it.id, m + k * (bw + gap), y, bw, 96, it.texto, it.fn, it));
    };
    if (enMaqueta) {
      fila(H - 240, [
        { id: 'biblioteca', texto: 'Biblioteca', fn: () => app.irModo('estudiante') },
        { id: 'sim', texto: sim ? 'Simulando ✓' : 'Simular datos', fn: () => app.alternarSimulacion(), activo: sim },
        { id: 'escala', texto: this.escala === 'humana' ? 'Volver a la mesa' : 'Entrar 1:17', fn: () => this.alternarEscala(), glifo: 'A', deshabilitado: this.modo === 'ar' },
        { id: 'recorrido', texto: 'Recorrido', fn: async () => { await app.abrirRecorrido(); this.panelRecorrido.malla.visible = true; this.refrescar(); }, activo: !!app.recorrido?.abierto },
        { id: 'cam', texto: 'Cámara ESP32', fn: () => { this.panelCamara.malla.visible = !this.panelCamara.malla.visible; this.refrescar(); }, activo: this.panelCamara.malla.visible },
        { id: 'salir', texto: 'Salir', fn: () => this.salir(), acento: '#f87171' },
      ]);
      fila(H - 128, [
        { id: 'entra', texto: 'Entra', fn: () => app.accion('entra'), deshabilitado: !sim, glifo: 'X' },
        { id: 'sale', texto: 'Sale', fn: () => app.accion('sale'), deshabilitado: !sim },
        { id: 'pareja', texto: 'Pareja pegada', fn: () => app.accion('pareja'), deshabilitado: !sim },
        { id: 'mochila', texto: 'Mochila', fn: () => app.accion('mochila'), deshabilitado: !sim },
        { id: 'luz', texto: 'Luz', fn: () => app.accion('luz') },
        { id: 'calibrar', texto: 'Recalibrar', fn: () => app.accion('calibrar') },
      ]);
    } else {
      // biblioteca: asientos del mapa (registrados al dibujar) y acciones del estudiante
      p.dibujarContenido = (ctx, w, h) => {
        this.#dibujarTablero(ctx, w, h);
        // los asientos se registran después de dibujar el mapa (necesitan su escala)
        const acciones = p.botones.filter((b) => !b.id.startsWith('asiento:'));
        p.botones = [];
        app.estudiante.botonesVR(p, W, H);
        p.botones.push(...acciones);
      };
      fila(H - 240, [
        { id: 'maqueta', texto: 'Cómo funciona', fn: () => app.irModo('tecnico') },
        { id: 'sim', texto: sim ? 'Simulando ✓' : 'Datos reales', fn: () => app.alternarSimulacion(), activo: sim },
        { id: 'salir', texto: 'Salir del visor', fn: () => this.salir(), acento: '#f87171' },
      ]);
      fila(H - 128, app.estudiante.botonesVR({ boton: () => {} }, W, H).map((b) => ({ ...b })));
    }
    if (enMaqueta) p.dibujarContenido = (ctx, w, h) => this.#dibujarTablero(ctx, w, h);
    p.marcar();
    if (forzar) { this.panelAyuda.marcar(); this.panelRecorrido.marcar(); }
  }

  #dibujarTablero(ctx, w, h) {
    ctx.fillStyle = '#0b1220';
    rectRedondo(ctx, 0, 0, w, h, 40); ctx.fill();
    const app = this.app;
    const altoTablero = h - 270;
    ctx.save();
    ctx.beginPath(); rectRedondo(ctx, 0, 0, w, altoTablero, 40); ctx.clip();
    if (app.escenaActual === 'maqueta') {
      dibujarTablero(ctx, w, altoTablero, { estado: app.estado, fuente: app.fuentes.modo, estadoAsiento: (i) => app.escenas.maqueta.estadoAsiento(i) });
    } else {
      app.estudiante.dibujarVR(ctx, w, altoTablero);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(56,189,248,0.35)'; ctx.lineWidth = 4;
    rectRedondo(ctx, 2, 2, w - 4, h - 4, 40); ctx.stroke();
  }

  #dibujarAyuda(ctx, w, h) {
    const lib = this.enBiblioteca;
    ctx.fillStyle = 'rgba(11,18,32,0.96)';
    rectRedondo(ctx, 0, 0, w, h, 44); ctx.fill();
    ctx.strokeStyle = 'rgba(56,189,248,0.5)'; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = '#f1f5f9'; ctx.font = `800 64px ${FUENTE}`; ctx.textAlign = 'center';
    ctx.fillText('Cómo se maneja', w / 2, 92);
    ctx.font = `500 34px ${FUENTE}`; ctx.fillStyle = '#94a3b8';
    ctx.fillText(this.modo === 'ar' ? 'Mira tu mesa y aprieta el gatillo para colocar la maqueta' : 'Aprieta el gatillo para empezar', w / 2, 142);
    const izq = [
      ['stick', 'Stick: caminar'],
      ['X', lib ? 'Cambiar de piso en el mapa' : 'Entra una persona (simulación)'],
      ['Y', 'Mostrar u ocultar esta ayuda'],
      ['agarre', lib ? 'Gatillo: elegir un asiento verde' : 'Agarre: tomar y girar la maqueta'],
      ['stick', 'Pulsar el stick: recentrar'],
    ];
    const der = [
      ['stick', 'Stick: ← → girar · ↑ teletransporte'],
      ['A', lib ? 'Acción del paso: entrar, ir, siguiente tramo…' : 'Entrar o salir de la maqueta (1:17)'],
      ['B', 'Mostrar u ocultar el tablero'],
      ['gatillo', 'Gatillo: pulsar botones del tablero'],
    ];
    const col = (x, titulo, items) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#38bdf8'; ctx.font = `800 40px ${FUENTE}`;
      ctx.fillText(titulo, x, 232);
      items.forEach(([g, t], k) => {
        const y = 300 + k * 84;
        dibujarGlifo(ctx, g, x + 30, y - 12, 54);
        ctx.fillStyle = '#e2e8f0'; ctx.font = `600 34px ${FUENTE}`;
        ctx.fillText(t, x + 78, y);
      });
    };
    col(60, 'Control izquierdo', izq);
    col(w / 2 + 30, 'Control derecho', der);
  }

  #dibujarMuneca(ctx, w, h) {
    const app = this.app;
    ctx.fillStyle = 'rgba(11,18,32,0.92)'; rectRedondo(ctx, 0, 0, w, h, 40); ctx.fill();
    ctx.strokeStyle = 'rgba(56,189,248,0.6)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillStyle = '#94a3b8'; ctx.font = `700 36px ${FUENTE}`;
    let l1, l2, col = '#22c55e';
    if (app.escenaActual === 'maqueta') {
      const c = app.estado.contador, lib = app.estado.libres;
      l1 = `Dentro ${c.conocido ? c.dentro : '–'}/${app.estado.capacidad}`;
      l2 = `Libres ${lib == null ? '–' : lib}/${app.estado.nAsientos}`;
      if (c.led) col = '#ef4444';
    } else {
      const b = app.biblio;
      l1 = `Dentro ${b.puertas.dentro}/${b.puertas.aforo}`;
      l2 = `Libres ${b.libres()}/332`;
    }
    const fuente = { sim: 'SIMULACIÓN', usb: 'DATOS REALES', remoto: 'DATOS REALES', espera: 'SIN DATOS' }[app.fuentes.modo];
    ctx.fillText(fuente, 30, 62);
    ctx.fillStyle = '#f1f5f9'; ctx.font = `800 60px ${FUENTE}`;
    ctx.fillText(l1, 30, 150);
    ctx.fillStyle = col; ctx.fillText(l2, 30, 235);
  }

  #crearPistasControl(c) {
    if (c.pistas) c.grip.remove(c.pistas.malla);
    const der = c.lado === 'right';
    const panel = new Panel3D({
      ancho: 0.17, alto: 0.11, px: 680, nombre: 'pistas-' + c.lado,
      dibujar: (ctx, w, h) => {
        const lib = this.enBiblioteca;
        ctx.fillStyle = 'rgba(11,18,32,0.82)'; rectRedondo(ctx, 0, 0, w, h, 30); ctx.fill();
        const items = der
          ? [['A', lib ? this.app.estudiante.textoAccion() : (this.escala === 'humana' ? 'Volver a la mesa' : 'Entrar 1:17')], ['B', 'Tablero'], ['stick', '←→ girar · ↑ saltar']]
          : [['X', lib ? 'Cambiar de piso' : 'Entra una persona'], ['Y', 'Ayuda'], ['stick', 'Caminar']];
        items.forEach(([g, t], k) => {
          const y = 70 + k * 120;
          dibujarGlifo(ctx, g, 60, y, 64);
          ctx.fillStyle = '#f1f5f9'; ctx.font = `700 44px ${FUENTE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(t, 110, y + 2);
        });
      },
    });
    panel.malla.position.set(der ? 0.1 : -0.1, 0.06, 0.02);
    panel.malla.rotation.set(-0.6, der ? -0.35 : 0.35, 0);
    panel.malla.renderOrder = 30;
    c.grip.add(panel.malla);
    c.pistas = panel;
    if (!der) {
      this.panelMuneca.malla.position.set(0, 0.035, 0.09);
      this.panelMuneca.malla.rotation.set(-1.2, 0, 0);
      c.grip.add(this.panelMuneca.malla);
    }
  }

  // ================================================================ teletransporte
  #crearTeleport() {
    const n = 40;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.arco = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9, toneMapped: false }));
    this.arco.frustumCulled = false;
    this.arco.visible = false;
    this.anillo = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.22, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }));
    this.anillo.visible = false;
    this.arcoN = n;
    this.destinoTeleport = null;
  }

  #sueloYLibre() {
    const esc = this.escenaActual;
    if (this.app.escenaActual === 'maqueta') {
      if (this.escala === 'humana') {
        const g = esc.maq.grupo;
        return {
          y: () => g.position.y,
          libre: (x, z) => { const l = g.worldToLocal(this.tmpV2.set(x, g.position.y, z)); return esc.libreHumano(l.x, l.z); },
        };
      }
      return { y: () => 0, libre: (x, z) => esc.libreSala(x, z) };
    }
    return { y: (x, z) => esc.alturaSuelo(x, z, this.nivel), libre: (x, z) => esc.transitable(x, z, this.nivel) };
  }

  #calcularArco(c) {
    const s = this.escalaRig;
    const origen = c.controller.getWorldPosition(new THREE.Vector3());
    const dir = this.tmpV.set(0, 0, -1).applyQuaternion(c.controller.getWorldQuaternion(this.tmpQ)).normalize();
    const v0 = 7 * s, g = -9.8 * s;
    const suelo = this.#sueloYLibre();
    const pts = this.arco.geometry.attributes.position;
    let destino = null, k = 0;
    const p = origen.clone();
    for (; k < this.arcoN; k++) {
      const t = k * 0.035;
      p.set(origen.x + dir.x * v0 * t, origen.y + dir.y * v0 * t + 0.5 * g * t * t, origen.z + dir.z * v0 * t);
      pts.setXYZ(k, p.x, p.y, p.z);
      const ys = suelo.y(p.x, p.z);
      if (p.y <= ys) { p.y = ys; pts.setXYZ(k, p.x, p.y, p.z); destino = p.clone(); k++; break; }
    }
    for (let j = k; j < this.arcoN; j++) pts.setXYZ(j, p.x, p.y, p.z);
    pts.needsUpdate = true;
    const valido = destino && suelo.libre(destino.x, destino.z);
    this.arco.material.color.set(valido ? 0x38bdf8 : 0xf87171);
    this.anillo.visible = !!destino;
    if (destino) {
      this.anillo.position.copy(destino).add(this.tmpV2.set(0, 0.004 * s, 0));
      this.anillo.scale.setScalar(s);
      this.anillo.material.color.set(valido ? 0x38bdf8 : 0xf87171);
    }
    this.destinoTeleport = valido ? destino : null;
  }

  // ================================================================ agarrar la maqueta
  #intentarAgarrar(c) {
    if (this.app.escenaActual !== 'maqueta' || this.escala === 'humana') return;
    const g = this.app.escenas.maqueta.maq.grupo;
    const pc = c.grip.getWorldPosition(new THREE.Vector3());
    if (pc.distanceTo(g.getWorldPosition(new THREE.Vector3())) > 0.75) return;
    this.agarre = { c, inicioCtrl: pc.clone(), inicioPos: g.position.clone(), inicioRot: g.rotation.y, inicioYaw: this.#yaw(c.grip) };
    this.#vibrar(0.5, 60, c.lado);
  }
  #yaw(obj) {
    const f = this.tmpV.set(0, 0, -1).applyQuaternion(obj.getWorldQuaternion(this.tmpQ));
    return Math.atan2(-f.x, -f.z);
  }
  #soltar() { this.agarre = null; }
  #moverAgarre() {
    const a = this.agarre;
    const g = this.app.escenas.maqueta.maq.grupo;
    const pc = a.c.grip.getWorldPosition(this.tmpV2);
    g.position.x = a.inicioPos.x + (pc.x - a.inicioCtrl.x);
    g.position.z = a.inicioPos.z + (pc.z - a.inicioCtrl.z);
    if (this.modo === 'ar') g.position.y = a.inicioPos.y + (pc.y - a.inicioCtrl.y);
    else {
      g.position.x = THREE.MathUtils.clamp(g.position.x, -0.5, 0.5);
      g.position.z = THREE.MathUtils.clamp(g.position.z, -0.2, 0.2);
    }
    g.rotation.y = a.inicioRot + (this.#yaw(a.c.grip) - a.inicioYaw);
  }

  // ================================================================ cada cuadro
  update(dt, frame) {
    if (!this.sesion) return;
    this.cuadrosSesion = (this.cuadrosSesion || 0) + 1;
    if (this.pendienteColocar && this.cuadrosSesion > 2 && this.camara.position.lengthSq() > 0) {
      const p = this.pendienteColocar;
      this.pendienteColocar = null;
      if (p.ar) this.#colocarFrenteAR(); else this.colocar(p);
    }
    if (this.modo === 'ar' && this.hitTest && frame) {
      const res = frame.getHitTestResults(this.hitTest);
      const ref = this.renderer.xr.getReferenceSpace();
      const pose = res.length && !this.agarre ? res[0].getPose(ref) : null;
      this.reticula.visible = !!pose;
      if (pose) this.reticula.matrix.fromArray(pose.transform.matrix);
    }
    const mover = new THREE.Vector2();
    let giro = 0, apuntar = null;
    for (const c of this.controles) {
      const gp = c.fuente?.gamepad;
      if (!gp) continue;
      const b = gp.buttons, ax = gp.axes;
      const presionado = (i) => !!b[i]?.pressed;
      const flanco = (i) => presionado(i) && !c.previos[i];
      const sx = zonaMuerta(ax[2] ?? ax[0] ?? 0), sy = zonaMuerta(ax[3] ?? ax[1] ?? 0);
      if (c.lado === 'left') {
        mover.set(sx, sy);
        if (flanco(4)) this.#botonX();
        if (flanco(5)) {
          const ver = !this.panelAyuda.malla.visible;
          this.panelAyuda.malla.visible = ver;
          this.mostrarPistas = ver || !this.inicioPendiente;
          this.inicioPendiente = false;
          this.panelAyuda.marcar();
        }
        if (flanco(3)) this.#recentrar();
      } else {
        if (flanco(4)) this.#botonA();
        if (flanco(5)) { this.panelTablero.malla.visible = !this.panelTablero.malla.visible; this.panelAyuda.malla.visible = false; this.inicioPendiente = false; }
        if (Math.abs(sx) > 0.7 && this.tGiro <= 0) { giro = -Math.sign(sx) * Math.PI / 6; this.tGiro = 0.35; }
        if (Math.abs(sx) < 0.3) this.tGiro = 0;
        if (sy < -0.6) apuntar = c;
        else if (this.apuntando === c && this.destinoTeleport) this.#teletransportar(this.destinoTeleport);
      }
      if (flanco(1)) this.#intentarAgarrar(c);
      if (!presionado(1) && this.agarre?.c === c) this.#soltar();
      c.previos = b.map((x) => x.pressed);
      if (c.pistas) c.pistas.malla.visible = this.mostrarPistas;
    }
    this.tGiro -= dt;
    this.apuntando = apuntar;
    this.arco.visible = !!apuntar;
    if (apuntar) this.#calcularArco(apuntar);
    else { this.anillo.visible = false; this.destinoTeleport = null; }
    if (giro) {
      const cab = this.posicionCabeza(new THREE.Vector3());
      this.rig.position.sub(cab).applyAxisAngle(ARRIBA, giro).add(cab);
      this.rig.rotation.y += giro;
    }
    if (mover.lengthSq() > 0 && this.modo !== 'ar') {
      const s = this.escalaRig;
      const rumbo = this.rumboCabeza();
      const vel = 1.6 * s * dt;
      const dx = (Math.cos(rumbo) * mover.x + Math.sin(rumbo) * mover.y) * vel;
      const dz = (-Math.sin(rumbo) * mover.x + Math.cos(rumbo) * mover.y) * vel;
      const cab = this.posicionCabeza(new THREE.Vector3());
      const suelo = this.#sueloYLibre();
      if (suelo.libre(cab.x + dx, cab.z + dz)) { this.rig.position.x += dx; this.rig.position.z += dz; }
      else if (suelo.libre(cab.x + dx, cab.z)) this.rig.position.x += dx;
      else if (suelo.libre(cab.x, cab.z + dz)) this.rig.position.z += dz;
      const yS = suelo.y(cab.x, cab.z);
      this.rig.position.y += (yS - this.rig.position.y) * Math.min(1, dt * 8);
      if (this.enBiblioteca) {
        if (yS > 3.4) this.nivel = 2; else if (yS < 1.1) this.nivel = 1;
        const est = this.app.estudiante;
        est.pos = { x: cab.x, z: cab.z, piso: this.nivel };
      }
    }
    if (this.agarre) this.#moverAgarre();
    this.#rayos();
    this.tPaneles -= dt;
    if (this.tPaneles <= 0) {
      this.tPaneles = 0.3;
      this.#actualizarPaneles();
      this.panelMuneca.marcar();
      if (this.panelCamara.malla.visible) this.panelCamara.marcar();
      this.panelRecorrido.malla.visible = !!this.app.recorrido?.abierto && this.app.modo === 'tecnico';
      if (this.panelRecorrido.malla.visible) this.panelRecorrido.marcar();
      for (const c of this.controles) c.pistas?.marcar();
    }
    for (const p of [...this.paneles, this.panelMuneca]) if (p.malla.visible) p.update();
    for (const c of this.controles) c.pistas?.update();
  }

  #rayos() {
    const visibles = this.paneles.filter((p) => p.malla.visible).map((p) => p.malla);
    for (const c of this.controles) {
      if (!c.fuente) continue;
      this.tmpM.identity().extractRotation(c.controller.matrixWorld);
      this.raycaster.ray.origin.setFromMatrixPosition(c.controller.matrixWorld);
      this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tmpM);
      const hit = visibles.length ? this.raycaster.intersectObjects(visibles, false)[0] : null;
      const anterior = c.hover;
      if (hit) {
        const panel = hit.object.userData.panel;
        const b = panel.botonEn(hit.uv);
        c.hover = b ? { panel, boton: b.id } : null;
        const d = hit.distance / this.escalaRig;
        c.rayo.scale.z = d;
        c.cursor.visible = true;
        c.cursor.position.set(0, 0, -d);
        if (b && (!anterior || anterior.boton !== b.id)) this.#vibrar(0.15, 15, c.lado);
      } else {
        c.hover = null;
        c.rayo.scale.z = 1.5;
        c.cursor.visible = false;
      }
    }
    for (const p of this.paneles) {
      const enEste = this.controles.find((c) => c.hover?.panel === p);
      p.fijarHover(enEste?.hover?.boton || null);
    }
  }

  #teletransportar(destino) {
    this.colocar({ x: destino.x, y: destino.y, z: destino.z, rumbo: this.rig.rotation.y, escala: this.escalaRig });
    if (this.enBiblioteca) this.app.estudiante.pos = { x: destino.x, z: destino.z, piso: this.nivel };
    this.destinoTeleport = null;
    this.#vibrar(0.6, 70, 'right');
  }

  #recentrar() {
    if (this.escala === 'humana') return;
    const p = this.#posicionInicial();
    if (p && !p.ar) this.colocar(p);
  }

  #botonA() {
    if (this.app.escenaActual === 'maqueta') this.alternarEscala();
    else this.app.estudiante.accionPrincipal();
    this.refrescar();
  }

  #botonX() {
    if (this.app.escenaActual === 'maqueta') {
      if (this.app.fuentes.modo === 'sim') { this.app.accion('entra'); this.#vibrar(0.3, 40, 'left'); }
    } else {
      const est = this.app.estudiante;
      if (est.entro) { est.elegirPiso(est.piso === 2 ? 1 : 2); if (!['mapa', 'asiento'].includes(est.paso) && est.paso === 'pisos') est.irA('mapa'); }
    }
    this.refrescar();
  }
}
