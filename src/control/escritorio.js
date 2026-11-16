// Control con teclado y ratón: vista órbita (arrastrar) y modo caminar (WASD + ratón).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const suave = (t) => t * t * (3 - 2 * t);

export class ControlEscritorio {
  constructor(motor, dom) {
    this.motor = motor;
    this.camara = motor.camara;
    this.dom = dom;
    this.orbita = new OrbitControls(this.camara, dom);
    this.orbita.enableDamping = true;
    this.orbita.dampingFactor = 0.08;
    this.orbita.screenSpacePanning = true;
    this.orbita.zoomToCursor = true;
    this.modo = 'orbita';
    this.teclas = new Set();
    this.tween = null;
    this.paseo = { yaw: 0, pitch: 0, ojos: 1.6, velocidad: 1.4, libre: () => true, suelo: 0, escala: 1 };
    this.arrastrando = false;
    this.activo = true;
    this.alCambiarModo = null;
    this.mirar = new THREE.Euler(0, 0, 0, 'YXZ');

    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      this.teclas.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.teclas.delete(e.code));
    window.addEventListener('blur', () => this.teclas.clear());
    dom.addEventListener('click', () => {
      if (this.modo === 'caminar' && this.activo && document.pointerLockElement !== dom) {
        try { dom.requestPointerLock?.()?.catch?.(() => {}); } catch { /* sin bloqueo de puntero */ }
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (this.modo !== 'caminar' || !this.activo) return;
      const bloqueado = document.pointerLockElement === dom;
      if (!bloqueado && !this.arrastrando) return;
      this.paseo.yaw -= e.movementX * 0.0024;
      this.paseo.pitch -= e.movementY * 0.0024;
      this.paseo.pitch = Math.max(-1.35, Math.min(1.35, this.paseo.pitch));
    });
    dom.addEventListener('pointerdown', (e) => { if (this.modo === 'caminar') { this.arrastrando = true; dom.setPointerCapture?.(e.pointerId); } });
    window.addEventListener('pointerup', () => { this.arrastrando = false; });
    // táctil: un dedo mira en modo caminar
    let ultimoToque = null;
    dom.addEventListener('touchmove', (e) => {
      if (this.modo !== 'caminar' || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (ultimoToque) { this.paseo.yaw -= (t.clientX - ultimoToque.x) * 0.005; this.paseo.pitch -= (t.clientY - ultimoToque.y) * 0.005; }
      ultimoToque = { x: t.clientX, y: t.clientY };
    }, { passive: true });
    dom.addEventListener('touchend', () => { ultimoToque = null; });
  }

  // ---------------------------------------------------------------- órbita
  usarOrbita({ obj, pos, min = 0.05, max = 30, polarMax = Math.PI * 0.49, animar = true, dur = 1.3 } = {}) {
    this.#salirDePaseo();
    this.modo = 'orbita';
    this.orbita.enabled = true;
    this.orbita.minDistance = min;
    this.orbita.maxDistance = max;
    this.orbita.maxPolarAngle = polarMax;
    this.camara.near = Math.max(0.002, min * 0.1);
    this.camara.updateProjectionMatrix();
    if (obj && pos) this.irA(pos, obj, animar ? dur : 0);
    this.alCambiarModo?.('orbita');
  }

  irA(pos, obj, dur = 1.3) {
    const p1 = new THREE.Vector3(...pos), o1 = new THREE.Vector3(...obj);
    if (dur <= 0) {
      this.camara.position.copy(p1); this.orbita.target.copy(o1); this.orbita.update(); this.tween = null; return;
    }
    this.tween = { t: 0, dur, p0: this.camara.position.clone(), o0: this.orbita.target.clone(), p1, o1 };
  }

  // ---------------------------------------------------------------- caminar
  // opciones: pos [x,y_suelo,z], rumbo (rad), ojos (altura de ojos en metros del mundo), velocidad (m/s del mundo), libre(x,z)
  usarPaseo({ pos, rumbo = 0, ojos = 1.6, velocidad = 1.4, libre = () => true, near = 0.05, altura = null }) {
    this.tween = null;
    this.modo = 'caminar';
    this.orbita.enabled = false;
    this.activo = true;
    Object.assign(this.paseo, { yaw: rumbo, pitch: -0.08, ojos, velocidad, libre, suelo: pos[1], altura });
    this.camara.position.set(pos[0], pos[1] + ojos, pos[2]);
    this.camara.near = near;
    this.camara.updateProjectionMatrix();
    this.alCambiarModo?.('caminar');
  }

  #salirDePaseo() {
    if (document.pointerLockElement === this.dom) document.exitPointerLock?.();
  }

  // ---------------------------------------------------------------- cada cuadro
  update(dt) {
    if (!this.activo || this.motor.renderer.xr.isPresenting) return;
    if (this.tween) {
      const tw = this.tween;
      tw.t += dt / tw.dur;
      const k = suave(Math.min(1, tw.t));
      this.camara.position.lerpVectors(tw.p0, tw.p1, k);
      this.orbita.target.lerpVectors(tw.o0, tw.o1, k);
      if (tw.t >= 1) this.tween = null;
    }
    if (this.modo === 'orbita') {
      this.orbita.update();
      return;
    }
    const p = this.paseo;
    const T = this.teclas;
    if (T.has('ArrowLeft')) p.yaw += dt * 1.6;
    if (T.has('ArrowRight')) p.yaw -= dt * 1.6;
    let f = 0, s = 0;
    if (T.has('KeyW') || T.has('ArrowUp')) f += 1;
    if (T.has('KeyS') || T.has('ArrowDown')) f -= 1;
    if (T.has('KeyD')) s += 1;
    if (T.has('KeyA')) s -= 1;
    const corre = T.has('ShiftLeft') || T.has('ShiftRight');
    if (f || s) {
      const v = p.velocidad * (corre ? 2.2 : 1) * dt;
      const sinY = Math.sin(p.yaw), cosY = Math.cos(p.yaw);
      const dx = (-sinY * f + cosY * s) * v;
      const dz = (-cosY * f - sinY * s) * v;
      const c = this.camara.position;
      // se desliza por las paredes: prueba el movimiento completo y luego cada eje
      if (p.libre(c.x + dx, c.z + dz)) { c.x += dx; c.z += dz; }
      else if (p.libre(c.x + dx, c.z)) c.x += dx;
      else if (p.libre(c.x, c.z + dz)) c.z += dz;
      p.fase = (p.fase || 0) + v / (p.ojos * 0.45);
    }
    const balanceo = (f || s) ? Math.sin((p.fase || 0) * 2) * p.ojos * 0.006 : 0;
    // suelo variable (escalera): se suaviza para que subir no dé saltos
    if (p.altura) { const y = p.altura(this.camara.position.x, this.camara.position.z); p.suelo += (y - p.suelo) * Math.min(1, dt * 10); }
    this.camara.position.y = p.suelo + p.ojos + balanceo;
    this.mirar.set(p.pitch, p.yaw, 0, 'YXZ');
    this.camara.quaternion.setFromEuler(this.mirar);
  }
}
