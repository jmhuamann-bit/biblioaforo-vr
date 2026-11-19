// Visor 3D (WebXR): Meta Quest 3, Quest con Link/Air Link, SteamVR. Realidad virtual y mixta.
//  · Stick izquierdo: caminar · Stick derecho: girar (← →) y teletransporte (↑ y soltar)
//  · Gatillo: apuntar con el rayo a un asiento, una mesa, un sensor o un botón del tablero
//  · A: acción principal de la experiencia · B: tablero · X: piso del mapa / entra una persona (maqueta) · Y: ayuda
//  · Stick izquierdo hundido: volver al inicio (también en el tablero). El tablero y la ayuda aparecen frente a ti.
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { Panel3D, dibujarGlifo } from './panel3d.js';
import { dibujarTablero } from '../ui/tablero.js';
import { FUENTE, rectRedondo } from '../motor/textos.js';
import { MAQUETA as M } from '../config.js';
import { PLANO, yPiso, nivelPorAltura, nivelDe, NivelDe } from '../biblioteca/plano.js';
import { alBanner } from '../juego/hudJuego.js';
import { desvio } from './escritorio.js';

const POS_TABLERO = { dist: 0.95, lado: -0.05, alto: -0.25 };

const ARRIBA = new THREE.Vector3(0, 1, 0);
const zonaMuerta = (v, z = 0.18) => (Math.abs(v) < z ? 0 : (v - Math.sign(v) * z) / (1 - z));
const COLOR_ASIENTO = { libre: '#22c55e', ocupado: '#ef4444', objeto: '#f59e0b', sinDato: '#64748b', tuyo: '#38bdf8' };

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
    this.rayMundo = new THREE.Raycaster();
    this.tmpM = new THREE.Matrix4();
    this.tmpV = new THREE.Vector3();
    this.tmpV2 = new THREE.Vector3();
    this.tmpQ = new THREE.Quaternion();
    this.agarre = null;
    this.tGiro = 0;
    this.nivel = 1;
    this.pisoMapa = 1;
    this.mostrarPistas = true;
    this.ultimaPos = null;
    this.tMundo = 0;
    this.#crearControles();
    this.#crearPaneles();
    this.#crearTeleport();
    this.renderer.xr.addEventListener('sessionend', () => this.#alTerminar());
    alBanner((texto, tipo, sub, ms) => this.banner(texto, tipo, sub, ms));
  }

  get presentando() { return !!this.sesion; }
  get escenaActual() { return this.app.escenas[this.app.escenaActual]; }
  get escalaRig() { return this.rig.scale.x; }
  get enBiblioteca() { return this.app.escenaActual === 'biblioteca'; }

  // ================================================================ sesión
  async entrar(modo = 'vr') {
    if (this.sesion) return;
    const ar = modo === 'ar';
    if (ar && this.app.modo !== 'ingenieria') await this.app.irModo('ingenieria');
    // pose de escritorio: en el visor empiezas donde estabas caminando
    const ctl = this.app.control, cam = this.camara;
    this.previa = this.app.escenaActual === 'biblioteca' && ctl.modo === 'caminar' && this.app.jugador.activo
      ? { x: cam.position.x, z: cam.position.z, piso: this.app.jugador.nivel, rumbo: ctl.paseo.yaw } : null;
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
    this.pisoMapa = this.previa?.piso || 1;
    // la cámara aún tiene la pose de escritorio: se borra para colocar al usuario con la primera pose real del visor
    this.camara.position.set(0, 0, 0);
    this.cuadrosSesion = 0;
    this.pendienteColocar = this.#posicionInicial();
    this.mostrarPistas = true;
    this.panelAyuda.malla.visible = true;
    this.panelTablero.malla.visible = false;
    this.escenaActual.scene.add(this.arco, this.anillo);
    this.app.mapaJuego?.cerrar();
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.app.modoActual?.alEntrarVR?.();
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
    this.panelInfo.malla.visible = false;
    this.panelBanner.malla.visible = false;
    this.motor.redimensionar();
    const m = this.app.modoActual;
    if (this.app.escenaActual === 'maqueta') this.app.vistaMaqueta('general', false);
    else if (m?.alSalirVR) m.alSalirVR(this.ultimaPos);
    else if (this.app.jugador.activo && this.ultimaPos) this.app.jugador.iniciar({ ...this.ultimaPos, conservar: true });
    this.app.actualizarPistas();
  }

  alCambiarEscena() {
    if (!this.sesion) return;
    this.escala = 'mesa';
    this.#soltar();
    // el rig (con controles y paneles) ya viaja con la escena; el arco se agrega a la nueva
    this.escenaActual.scene.add(this.arco, this.anillo);
    this.app.modoActual?.alEntrarVR?.();
    this.pendienteColocar = this.#posicionInicial();
    this.#actualizarPaneles(true);
  }

  mostrarTablero() {
    if (!this.panelTablero.malla.visible) this.#alFrente(this.panelTablero, POS_TABLERO);
    this.panelTablero.malla.visible = true; this.panelAyuda.malla.visible = false; this.inicioPendiente = false; this.refrescar();
  }

  // B: muestra u oculta el tablero; aparece frente a ti, donde estés mirando (no en un punto fijo de la sala)
  #alternarTablero() {
    const ver = !this.panelTablero.malla.visible;
    if (ver) this.#alFrente(this.panelTablero, POS_TABLERO);
    this.panelTablero.malla.visible = ver;
    this.panelAyuda.malla.visible = false;
    this.inicioPendiente = false;
    if (ver) this.refrescar();
  }

  // Coloca un panel frente a la cabeza. Los paneles viven en el rig, y la cámara también: todo en el mismo espacio.
  // dist: metros al frente · lado: metros a la derecha (+) · alto: respecto de los ojos · giro: cuánto se voltea hacia ti
  #alFrente(panel, { dist = 0.9, lado = 0, alto = -0.2, giro = 0 } = {}) {
    const cam = this.camara;
    const f = this.tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const yaw = Math.atan2(-f.x, -f.z);
    const s = Math.sin(yaw), c = Math.cos(yaw);
    panel.malla.position.set(cam.position.x - s * dist + c * lado, Math.max(0.6, cam.position.y + alto), cam.position.z - c * dist - s * lado);
    panel.malla.rotation.set(0, yaw + giro, 0);
  }

  // Volver al inicio (stick izquierdo hundido o botón del tablero): cada experiencia decide qué es su inicio.
  // En la presentación, la demostración vuelve a empezar y se conserva la calibración del visor.
  volverAlInicio() {
    const m = this.app.modoActual;
    this.panelTablero.malla.visible = false;
    if (this.app.escenaActual !== 'maqueta' && m?.volverAlInicioVR) { m.volverAlInicioVR(); return; }
    this.#recentrar();
    this.#vibrar(0.4, 60);
    this.banner('De vuelta al inicio', 'info', this.app.escenaActual === 'maqueta' ? 'La maqueta queda frente a ti.' : 'Estás en el punto de partida de esta experiencia.', 2600);
  }

  #posicionInicial() {
    const esc = this.escenaActual;
    if (this.modo === 'ar') return { ar: true };
    if (this.app.escenaActual === 'maqueta') return { ...esc.inicioMesa(), escala: 1 };
    const m = this.app.modoActual, j = this.app.jugador;
    const sentado = m?.asientoVR?.();
    if (sentado) return { sentarEn: sentado };
    const p = this.previa || (j.activo && j.inicio) || m?.inicioVR?.() || esc.vrInicio();
    this.previa = null;
    return { x: p.x, y: yPiso(p.piso || 1), z: p.z, rumbo: p.rumbo || 0, escala: 1 };
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
    if (this.enBiblioteca) this.nivel = nivelPorAltura(y, this.nivel);
  }

  posicionCabeza(v = new THREE.Vector3()) { return this.camara.getWorldPosition(v); }
  rumboCabeza() {
    const q = this.camara.getWorldQuaternion(this.tmpQ);
    const f = this.tmpV2.set(0, 0, -1).applyQuaternion(q);
    return Math.atan2(-f.x, -f.z);
  }

  refrescar() { this.tPaneles = 0; }

  // ================================================================ biblioteca: sentarse
  sentar(a) {
    if (!a) return;
    // sentado: la vista baja ~0.42 m y mira hacia la mesa
    const rumbo = a.mira > 0 ? Math.PI : 0;
    this.colocar({ x: a.x, y: yPiso(a.piso) - 0.42, z: a.z - a.mira * 0.1, rumbo, escala: 1 });
    this.nivel = a.piso;
  }

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
      const c = { i, controller, grip, mano, rayo, cursor, fuente: null, lado: null, previos: [], hover: null, mundo: null, pistas: null };
      controller.addEventListener('connected', (e) => {
        c.fuente = e.data;
        c.lado = e.data.handedness;
        rayo.visible = e.data.targetRayMode === 'tracked-pointer';
        this.#crearPistasControl(c);
        if (c.lado === 'right') { controller.add(this.panelInfo.malla); this.panelInfo.malla.position.set(0, 0.075, -0.16); this.panelInfo.malla.rotation.set(-0.5, 0, 0); }
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
      this.#alFrente(this.panelTablero, POS_TABLERO);
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
      return;
    }
    if (c.mundo) this.#accionMundo(c.mundo, c);
  }

  // Lo que hay en el mundo bajo el rayo de un control (asiento, mesa, estudiante, sensor, silla de la maqueta…)
  #elegirMundo(ray) {
    const m = this.app.modoActual;
    if (this.app.escenaActual === 'maqueta') return this.escala === 'mesa' && m?.elegir ? m.elegir(ray) : null;
    if (!m?.describir) return null;
    ray.far = 30 * this.escalaRig;
    return this.app.jugador.elegirEn(ray);
  }

  #accionMundo(h, c) {
    const m = this.app.modoActual;
    if (!m) return;
    if (m.interactuarVR) m.interactuarVR(h);
    else if (this.app.escenaActual === 'maqueta' || this.app.modo === 'caos') m.alClic?.(h);
    else m.interactuar?.(h);
    this.#vibrar(0.35, 40, c?.lado);
    this.refrescar();
  }

  // ================================================================ avisos dentro del visor
  // Los carteles de la pantalla no se ven con el visor puesto: se repiten aquí
  banner(texto, tipo = 'info', sub = '', ms = 3200) {
    if (!this.sesion) return;
    this.textoBanner = { texto, tipo, sub };
    this.panelBanner.marcar();
    this.panelBanner.malla.visible = true;
    clearTimeout(this.tBanner);
    this.tBanner = setTimeout(() => { this.panelBanner.malla.visible = false; }, Math.max(2500, ms));
  }

  #dibujarBanner(ctx, w, h) {
    const b = this.textoBanner || { texto: '', tipo: 'info', sub: '' };
    const col = { alerta: ['rgba(127,29,29,0.94)', '#ef4444'], ok: ['rgba(20,83,45,0.94)', '#22c55e'], info: ['rgba(8,47,73,0.94)', '#38bdf8'] }[b.tipo] || ['rgba(8,47,73,0.94)', '#38bdf8'];
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = col[0]; rectRedondo(ctx, 4, 4, w - 8, h - 8, 36); ctx.fill();
    ctx.strokeStyle = col[1]; ctx.lineWidth = 6; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#f8fafc'; ctx.font = `800 56px ${FUENTE}`;
    ctx.fillText(b.texto, w / 2, b.sub ? 92 : h / 2 + 18, w - 60);
    if (b.sub) {
      ctx.font = `500 34px ${FUENTE}`; ctx.fillStyle = '#e2e8f0';
      const palabras = String(b.sub).split(' ');
      const lineas = []; let l = '';
      for (const p of palabras) { const prueba = l ? `${l} ${p}` : p; if (ctx.measureText(prueba).width > w - 90) { lineas.push(l); l = p; } else l = prueba; }
      if (l) lineas.push(l);
      lineas.slice(0, 3).forEach((x, k) => ctx.fillText(x, w / 2, 152 + k * 44));
    }
  }

  #dibujarInfo(ctx, w, h) {
    const i = this.infoActual;
    ctx.clearRect(0, 0, w, h);
    if (!i) return;
    ctx.fillStyle = 'rgba(11,18,32,0.92)'; rectRedondo(ctx, 0, 0, w, h, 30); ctx.fill();
    ctx.strokeStyle = i.alerta ? '#ef4444' : 'rgba(56,189,248,0.7)'; ctx.lineWidth = 5; ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#e0f2fe'; ctx.font = `800 40px ${FUENTE}`;
    ctx.fillText(i.titulo, 26, 58, w - 52);
    ctx.font = `500 28px ${FUENTE}`; ctx.fillStyle = '#94a3b8';
    if (i.detalle) ctx.fillText(String(i.detalle).replace(/<[^>]+>/g, ''), 26, 104, w - 52);
    if (i.accion) { ctx.fillStyle = '#7dd3fc'; ctx.font = `700 32px ${FUENTE}`; ctx.fillText(`Gatillo · ${i.accion.replace(/^(E|Clic) · /, '')}`, 26, 152, w - 52); }
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
    // aviso del juego (pegado a la vista) y ficha de lo que apunta el rayo (sobre el control derecho)
    this.panelBanner = new Panel3D({ ancho: 0.9, alto: 0.24, px: 1300, nombre: 'bannerVR', dibujar: (ctx, w, h) => this.#dibujarBanner(ctx, w, h) });
    this.panelBanner.malla.position.set(0, -0.2, -1.0);
    this.panelBanner.malla.renderOrder = 40;
    this.panelBanner.material.depthTest = false;
    this.panelBanner.malla.visible = false;
    this.camara.add(this.panelBanner.malla);
    this.panelInfo = new Panel3D({ ancho: 0.3, alto: 0.0975, px: 960, nombre: 'infoVR', dibujar: (ctx, w, h) => this.#dibujarInfo(ctx, w, h) });
    this.panelInfo.malla.visible = false;
    this.panelInfo.malla.renderOrder = 35;
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
        { id: 'menu', texto: 'Experiencias', fn: () => app.irModo('menu') },
        { id: 'sim', texto: sim ? 'Usar datos reales' : 'Simular datos', fn: () => app.alternarSimulacion() },
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
      p.dibujarContenido = (ctx, w, h) => this.#dibujarTablero(ctx, w, h);
    } else {
      const m = app.modoActual;
      p.dibujarContenido = (ctx, w, h) => this.#dibujarTablero(ctx, w, h);
      if (app.modo !== 'menu') this.#botonesMapa(p, W, H - 270);
      fila(H - 240, [
        { id: 'menu', texto: 'Experiencias', fn: () => app.irModo('menu'), activo: app.modo === 'menu' },
        { id: 'inicio', texto: 'Volver al inicio', fn: () => this.volverAlInicio(), glifo: 'stick' },
        { id: 'pisoMapa', texto: `Mapa: ${nivelDe(this.pisoMapa)}`, fn: () => { this.pisoMapa = this.pisoMapa === 1 ? 2 : 1; this.refrescar(); }, glifo: 'X', deshabilitado: app.modo === 'menu' },
        ...(m?.ocultarSimulacionVR ? [] : [{ id: 'sim', texto: sim ? 'Usar datos reales' : 'Simular datos', fn: () => app.alternarSimulacion() }]),
        { id: 'salir', texto: 'Salir del visor', fn: () => this.salir(), acento: '#f87171' },
      ]);
      const extra = [...(m?.botonesVR?.() || [])];
      if (m?.accionA && app.modo !== 'menu') extra.unshift({ id: 'accionA', texto: m.textoA?.() || 'Acción', fn: () => this.#botonA(), glifo: 'A' });
      if (extra.length) fila(H - 128, extra.slice(0, 6));
    }
    p.marcar();
    if (forzar) { this.panelAyuda.marcar(); this.panelRecorrido.marcar(); }
  }

  // Mapa del tablero: cada asiento es un botón (se elige con el gatillo)
  #transformarMapa(w, h) {
    const top = 178, m = 26;
    const esc = Math.min((w - m * 2) / (PLANO.x1 - PLANO.x0), (h - top - m) / (PLANO.z1 - PLANO.z0));
    const ox = (w - (PLANO.x1 - PLANO.x0) * esc) / 2;
    return { esc, X: (x) => ox + (x - PLANO.x0) * esc, Y: (z) => top + (z - PLANO.z0) * esc };
  }

  #botonesMapa(p, w, h) {
    const T = this.#transformarMapa(w, h);
    const s = Math.max(16, 0.8 * T.esc);
    for (const a of this.app.biblio.asientos) {
      if (a.piso !== this.pisoMapa) continue;
      p.boton(`asiento:${a.id}`, T.X(a.x) - s / 2, T.Y(a.z) - s / 2, s, s, '', () => this.#elegirAsientoTablero(a), {
        dibujar: (ctx, b, hover) => { if (!hover) return; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y + b.h / 2, b.w * 0.75, 0, Math.PI * 2); ctx.stroke(); },
      });
    }
  }

  #elegirAsientoTablero(a) {
    const m = this.app.modoActual;
    const h = { tipo: 'asiento', id: a.id, distancia: 0 };
    if (m?.alClic) m.alClic(h);
    else m?.interactuar?.(h);
  }

  #dibujarMapa(ctx, w, h) {
    const app = this.app, b = app.biblio, m = app.modoActual;
    ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, w, h);
    const lineas = m?.lineasVR?.() || ['BIBLIOAFORO VR'];
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#e0f2fe'; ctx.font = `800 50px ${FUENTE}`; ctx.fillText(lineas[0], 34, 66, w - 68);
    ctx.font = `600 32px ${FUENTE}`; ctx.fillStyle = '#cbd5e1';
    lineas.slice(1, 3).forEach((l, k) => ctx.fillText(l, 34, 112 + k * 40, w - 68));
    if (app.modo === 'menu') {
      ctx.fillStyle = '#94a3b8'; ctx.font = `500 34px ${FUENTE}`;
      ctx.fillText(`Ahora: ${b.hora()} · ${b.puertas.dentro} personas dentro · ${b.libres()} asientos libres`, 34, 230, w - 68);
      ctx.fillText('Elige una experiencia con el gatillo (abajo).', 34, 290, w - 68);
      return;
    }
    const piso = this.pisoMapa;
    const T = this.#transformarMapa(w, h);
    ctx.fillStyle = '#1b2740'; ctx.fillRect(T.X(PLANO.x0), T.Y(PLANO.z0), (PLANO.x1 - PLANO.x0) * T.esc, (PLANO.z1 - PLANO.z0) * T.esc);
    const E = PLANO.escalera;
    ctx.fillStyle = '#2b3a57'; ctx.fillRect(T.X(E.x0), T.Y(E.z0), (E.x1 - E.x0) * T.esc, (E.z1 - E.z0) * T.esc);
    for (const mesa of PLANO.mesas) if (mesa.piso === piso) { ctx.fillStyle = mesa.asientos[0].piloto ? '#a3863c' : '#6b5039'; ctx.fillRect(T.X(mesa.x - 1.2), T.Y(mesa.z - 0.5), 2.4 * T.esc, T.esc); }
    const elegido = this.app.escenas.biblioteca.elegido;
    for (const a of b.asientos) {
      if (a.piso !== piso) continue;
      const e = a.estudiante ? 'tuyo' : b.estadoDe(a);
      ctx.fillStyle = COLOR_ASIENTO[e];
      ctx.beginPath(); ctx.arc(T.X(a.x), T.Y(a.z), Math.max(5, T.esc * 0.32), 0, Math.PI * 2); ctx.fill();
      if (a.id === elegido) { ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(T.X(a.x), T.Y(a.z), T.esc * 0.62, 0, Math.PI * 2); ctx.stroke(); }
    }
    ctx.fillStyle = 'rgba(226,232,240,0.8)';
    for (const ag of app.multitud.agentes) if (ag.visible && ag.piso === piso && ag.z < PLANO.z1) { ctx.beginPath(); ctx.arc(T.X(ag.x), T.Y(ag.z), 4, 0, Math.PI * 2); ctx.fill(); }
    const r = app.multitud.rival;
    if (r && r.visible && r.piso === piso) { ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(T.X(r.x), T.Y(r.z), 9, 0, Math.PI * 2); ctx.fill(); }
    const cab = this.posicionCabeza(this.tmpV);
    if (this.nivel === piso && cab.z < PLANO.z1 + 0.5) {
      ctx.save(); ctx.translate(T.X(cab.x), T.Y(cab.z)); ctx.rotate(-this.rumboCabeza() + Math.PI);
      ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(11, 12); ctx.lineTo(0, 5); ctx.lineTo(-11, 12); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#4ade80'; ctx.font = `700 30px ${FUENTE}`; ctx.textAlign = 'right';
    ctx.fillText(`${NivelDe(piso)}: ${b.libres(piso)} libres · gatillo sobre un asiento`, w - 34, 160);
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
      this.#dibujarMapa(ctx, w, altoTablero);
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
      ['X', lib ? 'Nivel del mapa (piso 1 o sótano)' : 'Entra una persona (simulación)'],
      ['Y', 'Mostrar u ocultar esta ayuda'],
      lib ? ['stick', 'Hundir el stick: volver al inicio'] : ['agarre', 'Agarre: tomar y girar la maqueta'],
    ];
    const der = [
      ['stick', 'Stick: ← → girar · ↑ teletransporte'],
      ['A', lib ? 'Acción principal (sentarse, el más cercano…)' : 'Entrar o salir de la maqueta (1:17)'],
      ['B', 'Mostrar u ocultar el tablero'],
      ['gatillo', lib ? 'Gatillo: asientos, mesas y botones' : 'Gatillo: sillas, sensores y botones'],
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
      l2 = `Libres ${b.libres()}/${b.total()}`;
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
      ancho: 0.17, alto: 0.11, px: 680, nombre: `pistas-${c.lado}`,
      dibujar: (ctx, w, h) => {
        const lib = this.enBiblioteca;
        ctx.fillStyle = 'rgba(11,18,32,0.82)'; rectRedondo(ctx, 0, 0, w, h, 30); ctx.fill();
        const textoA = lib ? (this.app.modoActual?.textoA?.() || '—') : (this.escala === 'humana' ? 'Volver a la mesa' : 'Entrar 1:17');
        const items = der
          ? [['A', textoA], ['B', 'Tablero'], ['stick', '←→ girar · ↑ saltar']]
          : [['X', lib ? 'Piso 1 o sótano' : 'Entra una persona'], ['Y', 'Ayuda'], ['stick', lib ? 'Caminar · hundir: inicio' : 'Caminar']];
        items.forEach(([g, t], k) => {
          const y = 70 + k * 120;
          dibujarGlifo(ctx, g, 60, y, 64);
          ctx.fillStyle = '#f1f5f9'; ctx.font = `700 44px ${FUENTE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(t, 110, y + 2, w - 130);
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
      if (p.ar) this.#colocarFrenteAR();
      else if (p.sentarEn) this.sentar(p.sentarEn);
      else this.colocar(p);
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
          if (ver) this.#alFrente(this.panelAyuda, { dist: 1.0, alto: -0.05 });
          this.panelAyuda.malla.visible = ver;
          this.mostrarPistas = ver || !this.inicioPendiente;
          this.inicioPendiente = false;
          this.panelAyuda.marcar();
        }
        if (flanco(3)) this.volverAlInicio();
      } else {
        if (flanco(4)) this.#botonA();
        if (flanco(5)) this.#alternarTablero();
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
      else { const g = desvio(dx, dz, suelo.libre, cab.x, cab.z); if (g) { this.rig.position.x += g[0]; this.rig.position.z += g[1]; } }
      const yS = suelo.y(cab.x, cab.z);
      this.rig.position.y += (yS - this.rig.position.y) * Math.min(1, dt * 8);
      if (this.enBiblioteca) this.nivel = nivelPorAltura(yS, this.nivel);
    }
    if (this.enBiblioteca) {
      const cab = this.posicionCabeza(this.tmpV);
      this.ultimaPos = { x: cab.x, z: cab.z, piso: this.nivel, rumbo: this.rumboCabeza() };
      if (this.nivel !== this.nivelMapa) { this.nivelMapa = this.nivel; this.pisoMapa = this.nivel; this.refrescar(); }
    }
    if (this.agarre) this.#moverAgarre();
    this.#rayos(dt);
    this.tPaneles -= dt;
    if (this.tPaneles <= 0) {
      this.tPaneles = 0.3;
      this.#actualizarPaneles();
      this.panelMuneca.marcar();
      if (this.panelCamara.malla.visible) this.panelCamara.marcar();
      this.panelRecorrido.malla.visible = !!this.app.recorrido?.abierto && this.app.modo === 'ingenieria';
      if (this.panelRecorrido.malla.visible) this.panelRecorrido.marcar();
      for (const c of this.controles) c.pistas?.marcar();
    }
    for (const p of [...this.paneles, this.panelMuneca, this.panelBanner, this.panelInfo]) if (p.malla.visible) p.update();
    for (const c of this.controles) c.pistas?.update();
  }

  #rayos(dt) {
    const visibles = this.paneles.filter((p) => p.malla.visible).map((p) => p.malla);
    this.tMundo -= dt;
    const tocaMundo = this.tMundo <= 0;
    if (tocaMundo) this.tMundo = 0.1;
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
        c.mundo = null;
        const d = hit.distance / this.escalaRig;
        c.rayo.scale.z = d;
        c.cursor.visible = true;
        c.cursor.position.set(0, 0, -d);
        if (b && (!anterior || anterior.boton !== b.id)) this.#vibrar(0.15, 15, c.lado);
      } else {
        c.hover = null;
        // el rayo del control derecho también apunta al mundo (asientos, mesas, sensores…)
        if (c.lado === 'right' && tocaMundo && !this.apuntando) {
          this.rayMundo.ray.copy(this.raycaster.ray);
          c.mundo = this.#elegirMundo(this.rayMundo);
          c.distMundo = c.mundo ? this.rayMundo.ray.origin.distanceTo(this.#puntoMundo(c.mundo)) : 0;
        } else if (c.lado !== 'right') c.mundo = null;
        if (c.mundo && c.distMundo > 0) {
          const d = c.distMundo / this.escalaRig;
          c.rayo.scale.z = d; c.cursor.visible = true; c.cursor.position.set(0, 0, -d);
        } else { c.rayo.scale.z = 1.5; c.cursor.visible = false; }
      }
    }
    for (const p of this.paneles) {
      const enEste = this.controles.find((c) => c.hover?.panel === p);
      p.fijarHover(enEste?.hover?.boton || null);
    }
    // ficha sobre el control derecho con lo que apunta el rayo
    const der = this.controles.find((c) => c.lado === 'right');
    const info = der?.mundo ? this.app.modoActual?.describir?.(der.mundo) : null;
    const clave = info ? `${info.titulo}|${info.detalle}|${info.accion}` : '';
    if (clave !== this.claveInfo) {
      this.claveInfo = clave;
      this.infoActual = info;
      this.panelInfo.malla.visible = !!info;
      this.panelInfo.marcar();
      if (info && der) this.#vibrar(0.12, 12, 'right');
    }
  }

  // punto aproximado del objeto apuntado (para el largo del rayo)
  #puntoMundo(h) {
    if (h.ag) return this.tmpV2.set(h.ag.x, h.ag.y + 1.1, h.ag.z);
    if (h.tipo === 'asiento') { const a = this.app.biblio.get(h.id); if (a) return this.tmpV2.set(a.x, yPiso(a.piso) + 0.5, a.z); }
    const o = this.rayMundo.ray.origin;
    const dist = h.distancia ?? 2;
    return this.tmpV2.copy(this.rayMundo.ray.direction).multiplyScalar(dist).add(o);
  }

  #teletransportar(destino) {
    this.colocar({ x: destino.x, y: destino.y, z: destino.z, rumbo: this.rig.rotation.y, escala: this.escalaRig });
    this.destinoTeleport = null;
    this.#vibrar(0.6, 70, 'right');
  }

  #recentrar() {
    if (this.escala === 'humana') return;
    const p = this.#posicionInicial();
    if (p && p.sentarEn) this.sentar(p.sentarEn);
    else if (p && !p.ar) this.colocar(p);
  }

  #botonA() {
    if (this.app.escenaActual === 'maqueta') this.alternarEscala();
    else this.app.modoActual?.accionA?.();
    this.refrescar();
  }

  #botonX() {
    if (this.app.escenaActual === 'maqueta') {
      if (this.app.fuentes.modo === 'sim') { this.app.accion('entra'); this.#vibrar(0.3, 40, 'left'); }
    } else {
      this.pisoMapa = this.pisoMapa === 1 ? 2 : 1;
      if (!this.panelTablero.malla.visible) this.#alFrente(this.panelTablero, POS_TABLERO);
      this.panelTablero.malla.visible = true;
      this.panelAyuda.malla.visible = false;
      this.inicioPendiente = false;
    }
    this.refrescar();
  }
}
