// Escena 1: la maqueta sobre una mesa de exposición, con la sala alrededor.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { crearMaqueta, crearSalaExpo } from './maqueta.js';
import { NavMaqueta, Siluetas } from './personas.js';
import { CamaraESP } from './camaraEsp.js';
import { DirectorMaqueta } from '../sim/director.js';
import { MAQUETA as M, COLORES } from '../config.js';
import { dibujarTablero } from '../ui/tablero.js';

const COL = {
  libre: new THREE.Color(COLORES.libre), ocupado: new THREE.Color(COLORES.ocupado),
  objeto: new THREE.Color(COLORES.objeto), sinDato: new THREE.Color(COLORES.sinDato),
};

export class EscenaMaqueta {
  constructor({ motor, estado, alLinea, fuente }) {
    this.id = 'maqueta';
    this.motor = motor;
    this.estado = estado;
    this.fuente = fuente;           // () => 'sim' | 'usb' | 'remoto' | 'espera'
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xd9dde2);
    this.ao = { radius: 0.05, distanceExponent: 1.6, thickness: 1.2, scale: 1, samples: 16, distanceFallOff: 1 };

    // modelo
    this.maq = crearMaqueta();
    this.sala = crearSalaExpo(this.maq.mat);
    this.scene.add(this.sala.grupo);
    this.alturaBase = this.sala.mesaAlto + M.base.grosor;
    this.maq.grupo.position.set(0, this.alturaBase, 0);
    this.scene.add(this.maq.grupo);
    this.maq.ayudas.traverse((o) => { o.userData.sinAO = true; });

    // luz ambiente basada en imagen (reflejos suaves)
    const pmrem = new THREE.PMREMGenerator(motor.renderer);
    this.entorno = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.entorno;
    this.scene.environmentIntensity = 0.3;
    pmrem.dispose();

    this.#luces();

    // personas, cámara virtual y director
    this.nav = new NavMaqueta(this.maq.G);
    this.navUsuario = new NavMaqueta(this.maq.G, { radio: 0.008, celda: 0.004 });
    this.sil = new Siluetas(this.maq.grupo, this.nav);
    this.camara = new CamaraESP({
      renderer: motor.renderer, escena: this.scene, grupoMaqueta: this.maq.grupo,
      pose: this.maq.camaraPose, ocultar: [this.maq.ayudas],
    });
    this.director = new DirectorMaqueta({ maqueta: this.maq, siluetas: this.sil, estado, camara: this.camara, alLinea });

    // monitor 3D con la vista de la ESP32-CAM (lo usan el visor y la vista de la PC)
    const asp = this.camara.vista.width / this.camara.vista.height;
    this.monitorCam = new THREE.Mesh(new THREE.PlaneGeometry(0.36 * asp, 0.36), new THREE.MeshBasicMaterial({ map: this.camara.texturaVista, toneMapped: false }));
    const marco = new THREE.Mesh(new THREE.BoxGeometry(0.36 * asp + 0.03, 0.39, 0.02), new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.4, metalness: 0.4 }));
    marco.position.z = -0.012;
    this.monitorCamGrupo = new THREE.Group();
    this.monitorCamGrupo.add(marco, this.monitorCam);
    this.monitorCamGrupo.position.set(-1.05, 1.18, -0.25);
    this.monitorCamGrupo.rotation.y = 0.55;
    const soporte = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 16), new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.7, roughness: 0.35 }));
    soporte.position.set(0, -0.4, -0.03);
    const pieMon = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.015, 32), soporte.material);
    pieMon.position.set(0, -0.61, -0.03);
    this.monitorCamGrupo.add(soporte, pieMon);
    this.monitorCamGrupo.position.y = 0.76 + 0.62;
    this.monitorCamGrupo.position.set(-0.62, 0.76 + 0.62, -0.22);
    this.scene.add(this.monitorCamGrupo);

    this.escalaHumana = false;
    this.tPantallas = 0;
    this.estadosPrevios = M.sillas.map(() => null);
    this.luzBaja = false;
    this.mostrarHaces = true;
    this.mostrarRotulos = true;
  }

  #luces() {
    const centro = new THREE.Vector3(0, this.alturaBase, 0);
    this.hemi = new THREE.HemisphereLight(0xfff7ee, 0x8b7258, 0.32);
    this.scene.add(this.hemi);
    const sol = new THREE.DirectionalLight(0xfff0dc, 1.9);
    sol.position.copy(centro).add(new THREE.Vector3(0.55, 1.3, 0.8));
    sol.target.position.copy(centro);
    sol.castShadow = true;
    const sc = sol.shadow.camera;
    sc.left = -0.38; sc.right = 0.38; sc.top = 0.38; sc.bottom = -0.38; sc.near = 0.4; sc.far = 3.2;
    sol.shadow.mapSize.set(2048, 2048);
    sol.shadow.bias = -0.00008;
    sol.shadow.normalBias = 0.0006;
    sol.shadow.radius = 3;
    this.scene.add(sol, sol.target);
    this.sol = sol;
    this.solBase = 1.9;
    const relleno = new THREE.DirectionalLight(0xdbe6ff, 0.35);
    relleno.position.copy(centro).add(new THREE.Vector3(-1.2, 0.9, -0.6));
    relleno.target.position.copy(centro);
    this.scene.add(relleno, relleno.target);
    // luz de día que entra por el ventanal
    const ventana = new THREE.DirectionalLight(0xe8f1ff, 0.55);
    ventana.position.set(6, 2.6, 0.5);
    this.scene.add(ventana);
    // foco cálido sobre la mesa
    const foco = new THREE.SpotLight(0xffe2b8, 3.2, 4, 0.55, 0.85, 1.6);
    foco.position.set(0.1, 3.2, 0.25);
    foco.target.position.copy(centro);
    this.scene.add(foco, foco.target);
  }

  alCambiarCalidad(c) {
    const tam = c === 'alta' ? 2048 : 1024;
    if (this.sol.shadow.mapSize.x !== tam) {
      this.sol.shadow.mapSize.set(tam, tam);
      this.sol.shadow.map?.dispose(); this.sol.shadow.map = null;
    }
  }

  // ---------------------------------------------------------------- estado visual de cada asiento
  estadoAsiento(i) {
    const a = this.estado.camara.asientos[i];
    if (!this.estado.camara.conocida || a.ocupado === null) return 'sinDato';
    if (!a.ocupado) return 'libre';
    if (this.director.mochilas.has(i)) return 'objeto';
    return 'ocupado';
  }

  cambiarLuz() {
    this.luzBaja = !this.luzBaja;
    this.sol.intensity = this.solBase * (this.luzBaja ? 0.55 : 1);
    this.sol.color.set(this.luzBaja ? 0xffd9b0 : 0xfff0dc);
    this.hemi.intensity = this.luzBaja ? 0.2 : 0.32;
    return this.luzBaja;
  }

  moverCamara() {
    const movida = this.camara.desvio.y !== 0;
    this.camara.desvio.set(0, movida ? 0 : 0.045, movida ? 0 : 0.02);
    this.camara.actualizarPose();
    return !movida;
  }

  fijarHaces(v) { this.mostrarHaces = v; for (const id in this.maq.sensores) this.maq.sensores[id].haz.grupo.visible = v; }
  fijarRotulos(v) { this.mostrarRotulos = v; this.maq.rotulos.visible = v; }

  // ---------------------------------------------------------------- vistas de cámara (pantalla)
  vistas() {
    const y = this.alturaBase;
    return {
      general: { pos: [0.44, y + 0.43, 0.62], obj: [0, y + 0.03, -0.01] },
      frente: { pos: [0, y + 0.24, 0.6], obj: [0, y + 0.05, 0] },
      sensores: { pos: [-0.2, y + 0.13, 0.27], obj: [-0.11, y + 0.07, 0.035] },
      caja: { pos: [0.33, y + 0.16, 0.42], obj: [0.21, y + 0.05, 0.12] },
      camara: { pos: [0.36, y + 0.36, 0.0], obj: [0.17, y + 0.25, -0.14] },
      mesa: { pos: [-0.15, y + 0.24, 0.16], obj: [0, y + 0.02, -0.1] },
      cenital: { pos: [0.0, y + 0.7, 0.02], obj: [0, y, 0] },
      sala: { pos: [2.7, 2.3, 3.5], obj: [0, 0.95, 0] },
    };
  }

  // Punto de inicio y suelo cuando el usuario "entra" a la maqueta (escala 1:17)
  inicioHumano() {
    const xE = (M.puertas[0].x0 + M.puertas[0].x1) / 2;
    return { x: xE, y: this.alturaBase, z: this.maq.G.zF - 0.03, rumbo: 0 };
  }
  libreHumano(x, z) { return this.navUsuario.libre(x, z); }
  inicioMesa() { return { x: 0, y: 0, z: 1.05, rumbo: 0 }; }
  libreSala(x, z) {
    const L = this.sala.limites;
    if (x < L.x0 || x > L.x1 || z < L.z0 || z > L.z1) return false;
    return !this.sala.obstaculos.some((o) => x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1);
  }

  // ---------------------------------------------------------------- cada cuadro
  update(dt, t) {
    this.director.update(dt);
    this.sil.update(dt);
    this.camara.update(dt, t);
    const est = this.estado;

    // haces y LED indicadores de los sensores
    for (const id of ['S1', 'S2']) {
      const s = this.maq.sensores[id];
      const d = this.director.bloqueoVisual[id];
      const u = s.haz.uniforms;
      u.uTiempo.value = t / 1000;
      const objetivo = d != null ? 1 : 0;
      u.uBloqueado.value += (objetivo - u.uBloqueado.value) * Math.min(1, dt * 14);
      u.uLargo.value = d != null ? Math.max(0.004, d) : s.alcance;
      s.haz.destello.visible = d != null;
      if (d != null) { s.haz.destello.position.set(d, 0, 0); s.haz.destello.material.opacity = 0.7 + Math.sin(t / 40) * 0.3; }
      s.haz.linea.scale.x = d != null ? Math.max(0.04, d / s.alcance) : 1;
      const det = est.sensores[id].bloqueado;
      s.e18.ledMat.emissiveIntensity += ((det ? 5 : 0) - s.e18.ledMat.emissiveIntensity) * Math.min(1, dt * 20);
    }

    // LCD y LED de sala llena
    const c = est.contador;
    if (!c.conocido) this.maq.lcd.escribir('BIBLIOAFORO', this.fuente() === 'espera' ? 'SIN DATOS' : 'ESPERANDO DATOS');
    else this.maq.lcd.escribir('BIBLIOAFORO', `OCUP: ${c.dentro}/${est.capacidad}${c.led ? ' LLENO' : ''}`);
    const led = this.maq.led;
    const objetivoLed = c.led ? 4.5 : 0;
    led.mat.emissiveIntensity += (objetivoLed - led.mat.emissiveIntensity) * Math.min(1, dt * 18);
    led.halo.material.opacity = Math.min(1, led.mat.emissiveIntensity / 4.5) * 0.85;

    // asientos: halo y cojín con el color del estado
    this.maq.sillas.forEach((s, i) => {
      const e = this.estadoAsiento(i);
      if (e !== this.estadosPrevios[i]) { this.estadosPrevios[i] = e; s.pulso = 1; }
      s.pulso = Math.max(0, s.pulso - dt * 1.4);
      const col = COL[e];
      s.haloMat.color.copy(col);
      s.haloMat.opacity = 0.75 + s.pulso * 0.25 + (e === 'objeto' ? Math.sin(t / 220) * 0.15 : 0);
      s.halo.scale.setScalar(1 + s.pulso * 0.6);
      s.cojinMat.emissive.copy(col);
      s.cojinMat.emissiveIntensity = e === 'sinDato' ? 0 : 0.42 + s.pulso * 0.5;
      s.cojinMat.color.copy(col).lerp(new THREE.Color(0x9aa3ad), 0.55);
    });

    // pantallas (mural y laptop) a 2 Hz
    this.tPantallas -= dt;
    if (this.tPantallas <= 0) {
      this.tPantallas = 0.5;
      const datos = { estado: est, fuente: this.fuente(), estadoAsiento: (i) => this.estadoAsiento(i) };
      this.sala.pantallaMural.dibujar((ctx, w, h) => dibujarTablero(ctx, w, h, datos));
      this.sala.pantallaLaptop.dibujar((ctx, w, h) => dibujarTablero(ctx, w, h, datos));
      est.latido();
    }
  }
}
