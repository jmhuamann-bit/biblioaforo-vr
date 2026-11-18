// Escena 2: la biblioteca viva, con el piso 1 y la Sala 2 en el sótano (la usan Hora punta, Caos, Detective, Libre y el menú).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Biblioteca3D, dibujarTotem } from './biblioteca3d.js';
import { PLANO, yPiso, alturaSuelo, transitable, transitableGaleria, fraccionAlzada } from '../biblioteca/plano.js';
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
      fachada: { pos: [15, 1.7, PLANO.z1 + 8.5], obj: [0.5, 2.2, PLANO.z1] },
      casa: { pos: [28, 27, 40], obj: [-1, 1, 0] },
      piso1: { pos: [0, 34 + E, 12], obj: [0, E, 0.5] },
      piso2: { pos: [0, 30, 12], obj: [0, yPiso(2), 0.5] },
      vestibulo: { pos: [0.5, 1.65, 11.8], obj: [-3, 1.6, 4] },
    };
  }

  // casa de muñecas: levanta el piso 1 (se ve el sótano debajo) y quita los pisos altos
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

  // ocultar techos para ver un piso desde arriba (para el sótano también se quita el piso 1)
  verDesdeArriba(piso) {
    this.b3d.sinTecho = true;
    this.b3d.techo.visible = false;
    this.b3d.verPiso1(piso !== 2);
    this.b3d.verGaleriaDesdeArriba(true);
  }
  restaurarVisibilidad() {
    this.b3d.sinTecho = false;
    this.b3d.verPiso1(true);
    this.b3d.techo.visible = this.b3d.explosion < 0.05;
    this.b3d.verGaleriaDesdeArriba(false);
  }

  // ---------------------------------------------------------------- caminar (escritorio y visor)
  alturaSuelo(x, z, nivel = 1) { const s = alturaSuelo(x, z, nivel); return s + this.b3d.explosion * fraccionAlzada(x, s, z); }
  transitable(x, z, nivel = 1) {
    const P = PLANO.puertas;
    const enPuerta = (x > P.entrada.x0 + 0.3 && x < P.entrada.x1 - 0.3) || (x > P.salida.x0 + 0.3 && x < P.salida.x1 - 0.3);
    // fuera del edificio: la galería del Pabellón C (columnas, maceteros y pasajes al campus)
    if (z > PLANO.z1 - 0.2) {
      if (nivel !== 1) return false;
      if (z < PLANO.z1 + 0.4) return enPuerta;
      return transitableGaleria(x, z);
    }
    // umbral de las puertas: la grilla deja libres 32 cm junto al vidrio; en la puerta se pasa de largo
    if (nivel === 1 && enPuerta && z > PLANO.z1 - 0.5) return true;
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
