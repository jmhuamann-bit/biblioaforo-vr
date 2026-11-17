// Escena 2: la biblioteca de dos pisos, viva (la usan Hora punta, Caos, Detective, Libre y el menú).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Biblioteca3D, dibujarTotem } from './biblioteca3d.js';
import { PLANO, yPiso, alturaSuelo, transitable } from '../biblioteca/plano.js';
import * as TX from '../motor/texturas.js';

export class EscenaBiblioteca {
  constructor({ motor, app }) {
    this.id = 'biblioteca';
    this.motor = motor;
    this.app = app;
    this.estado = app.biblio;
    this.scene = new THREE.Scene();
    const cielo = TX.cielo({ arriba: '#5f9bd6', horizonte: '#dbe9f5', abajo: '#9fb59a' });
    this.scene.background = cielo;
    this.scene.fog = new THREE.Fog(0xdde8f1, 70, 190);
    const pmrem = new THREE.PMREMGenerator(motor.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.38;
    pmrem.dispose();
    this.ao = { radius: 0.55, distanceExponent: 1.4, thickness: 1.6, scale: 1, samples: 16, distanceFallOff: 1 };

    // luz de día: cielo + sol cálido + relleno
    this.hemi = new THREE.HemisphereLight(0xeef6ff, 0x9b8569, 1.05);
    const sol = new THREE.DirectionalLight(0xfff1dc, 1.6);
    sol.position.set(30, 45, 40);
    const relleno = new THREE.DirectionalLight(0xdce8ff, 0.45);
    relleno.position.set(-30, 20, -20);
    this.scene.add(this.hemi, sol, relleno);

    this.b3d = new Biblioteca3D();
    this.scene.add(this.b3d.grupo);
    this.versionDibujada = -1;
    this.tTotem = 0;
    this.explosionObjetivo = 0;
    this.explosionActual = 0;
    this.tuyo = null;
    this.elegido = null;
    this.alto = { 1: true, 2: true };
  }

  // ---------------------------------------------------------------- vistas de cámara
  vistas() {
    const E = this.b3d.explosion;
    return {
      fachada: { pos: [5.5, 2.4, 37], obj: [-1.5, 4.0, 13] },
      casa: { pos: [27, 27, 33], obj: [-1, 5.5, -1] },
      piso1: { pos: [0, 34, 12], obj: [0, 0, 0.5] },
      piso2: { pos: [0, 38 + E, 12], obj: [0, 4.5 + E, 0.5] },
      vestibulo: { pos: [0.5, 1.65, 11.8], obj: [-3, 1.6, 4] },
    };
  }

  // casa de muñecas: separa los pisos y quita el techo
  separarPisos(v) { this.explosionObjetivo = v ? 1 : 0; }
  // muestra un solo piso (el otro se atenúa) o ambos
  enfocarPiso(piso) {
    this.pisoEnfocado = piso;
    for (const n of [1, 2]) {
      const g = this.b3d.pisos[n];
      const atenuar = piso && piso !== n;
      g.traverse((o) => {
        if (!o.material) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (m.userData.opacidadBase === undefined) { m.userData.opacidadBase = m.opacity; m.userData.transparenteBase = m.transparent; }
          m.transparent = atenuar ? true : m.userData.transparenteBase;
          m.opacity = atenuar ? m.userData.opacidadBase * 0.16 : m.userData.opacidadBase;
          m.needsUpdate = true;
        }
      });
    }
  }

  // ocultar techos para ver un piso desde arriba
  verDesdeArriba(piso) {
    this.b3d.techo.visible = false;
    this.b3d.pisos[2].visible = piso !== 1;
  }
  restaurarVisibilidad() {
    this.b3d.pisos[2].visible = true;
    this.b3d.techo.visible = this.b3d.explosion < 0.05;
  }

  // ---------------------------------------------------------------- caminar (escritorio y visor)
  alturaSuelo(x, z, nivel = 1) { return alturaSuelo(x, z, nivel) + (nivel === 2 || alturaSuelo(x, z, nivel) > 3.4 ? this.b3d.explosion : 0); }
  transitable(x, z, nivel = 1) {
    // fuera del edificio solo la plaza frente a las puertas
    if (z > PLANO.z1 - 0.2) {
      if (nivel !== 1) return false;
      const P = PLANO.puertas;
      const enPuerta = (x > P.entrada.x0 + 0.3 && x < P.entrada.x1 - 0.3) || (x > P.salida.x0 + 0.3 && x < P.salida.x1 - 0.3);
      if (z < PLANO.z1 + 0.4) return enPuerta;
      return x > -40 && x < 40 && z < PLANO.z1 + 30;
    }
    return transitable(x, z, nivel);
  }

  vrInicio() { return { x: 1.0, y: 0, z: 21, rumbo: 0 }; }
  libreVR(x, z) { return this.transitable(x, z, this.nivelVR || 1) || this.transitable(x, z, 2); }

  // ---------------------------------------------------------------- ciclo
  update(dt, t) {
    // el reloj del día y la multitud (los estudiantes son los que mueven puertas y asientos)
    this.app.simBiblio.avanzarReloj(dt);
    this.app.multitud.update(dt);
    this.explosionActual += (this.explosionObjetivo - this.explosionActual) * Math.min(1, dt * 3);
    if (Math.abs(this.explosionActual - this.explosionObjetivo) < 0.002) this.explosionActual = this.explosionObjetivo;
    this.b3d.fijarExplosion(this.explosionActual);
    if (this.estado.version !== this.versionDibujada || this.cambioMarcas) {
      this.versionDibujada = this.estado.version;
      this.cambioMarcas = false;
      this.b3d.actualizarAsientos(this.estado, { tuyo: this.tuyo, elegido: this.elegido, verdad: this.app.multitud.verdad });
    }
    this.b3d.fijarPiloto(this.estado.pilotoReal);
    this.tTotem -= dt;
    if (this.tTotem <= 0) {
      this.tTotem = 1;
      this.b3d.totem.dibujar((ctx, w, h) => dibujarTotem(ctx, w, h, { estado: this.estado, fuente: this.app.fuentes.modo, hora: this.estado.hora() }));
    }
    this.b3d.update(dt, t);
    this.b3d.actualizarGente({ multitud: this.app.multitud, estado: this.estado, camara: this.motor.camara, renderer: this.motor.renderer, t, dt, calidad: this.motor.calidad });
  }

  marcar({ tuyo = this.tuyo, elegido = this.elegido } = {}) {
    this.tuyo = tuyo; this.elegido = elegido;
    this.cambioMarcas = true;
  }

  alCambiarCalidad() { /* sin sombras dinámicas: la oclusión ambiental (calidad alta) da el contacto */ }
}
