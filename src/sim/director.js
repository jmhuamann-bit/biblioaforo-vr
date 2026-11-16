// Director de la maqueta.
//  · Modo "sim": siluetas virtuales entran, se sientan y salen; los haces virtuales y la
//    cámara virtual las detectan y el firmware emulado imprime las mismas líneas que el real.
//  · Modo "vivo": no inventa nada; mueve las siluetas para que coincidan con los datos
//    que llegan (personas dentro, asientos ocupados y cada cruce por las puertas).
import * as THREE from 'three';
import { MAQUETA as M } from '../config.js';
import { FirmwareContador, FirmwareCamara } from './firmware.js';

const normal = (m = 0, d = 1) => {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return m + d * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const entre = (a, b) => a + Math.random() * (b - a);

export class DirectorMaqueta {
  constructor({ maqueta, siluetas, estado, camara, alLinea }) {
    this.maq = maqueta; this.sil = siluetas; this.estado = estado; this.camara = camara;
    this.alLinea = alLinea;
    this.modo = 'pausa';
    this.t = 0;
    this.fwC = new FirmwareContador((l) => this.alLinea('contador', l));
    this.fwK = new FirmwareCamara((l) => this.alLinea('camara', l), M.sillas.length);
    this.reservas = new Map();    // índice de silla → agente
    this.mochilas = new Map();    // índice de silla → malla
    this.roles = new Map();       // agente → { rol, silla, desde }
    this.proximaLlegada = 3;
    this.ritmo = 1;
    this.maxPersonas = 5;
    this.autoLlegadas = true;
    this.bloqueoVisual = { S1: null, S2: null };
    this.tReconciliar = 0;
    const G = maqueta.G;
    this.G = G;
    this.xE = (M.puertas[0].x0 + M.puertas[0].x1) / 2;
    this.xS = (M.puertas[1].x0 + M.puertas[1].x1) / 2;
    this.puntosDePie = [[-0.19, -0.05], [-0.205, -0.125], [0.135, -0.035], [0.14, -0.095], [-0.15, -0.015], [0.2, -0.06]]
      .filter(([x, z]) => siluetas.nav.libre(x, z));
    camara.alAnalizar = (t, fr) => { if (this.modo === 'sim') this.fwK.analizar(this.t, fr); };
    camara.alCalibrar = () => { if (this.modo === 'sim') this.fwK.calibrar(); };
    estado.on('cruce', (e) => this.#alCruce(e));
    estado.on('asientos', () => { if (this.modo === 'vivo') this.tReconciliar = 0; });
    estado.on('contador', () => { if (this.modo === 'vivo') this.tReconciliar = Math.min(this.tReconciliar, 0.15); });
    this.mochilaGeo = this.#geoMochila();
  }

  // ------------------------------------------------------------ modos
  limpiar() {
    for (const ag of [...this.sil.agentes]) this.sil.quitar(ag);
    for (const m of this.mochilas.values()) m.parent?.remove(m);
    this.mochilas.clear(); this.reservas.clear(); this.roles.clear();
    this.bloqueoVisual = { S1: null, S2: null };
  }

  iniciarSim() {
    this.limpiar();
    this.modo = 'sim';
    this.t = 0;
    this.camara.analizar = true;
    this.camara.valoresExternos = null;
    this.camara.desvio.set(0, 0, 0);
    this.camara.actualizarPose();
    this.fwC.arrancar(0);
    this.camara.calibrar();
    this.proximaLlegada = 2.5;
  }

  iniciarVivo() {
    this.limpiar();
    this.modo = 'vivo';
    this.camara.analizar = false;
    this.camara.desvio.set(0, 0, 0);
    this.camara.actualizarPose();
    this.camara.valoresExternos = this.estado.camara.asientos;
    this.tReconciliar = 0;
  }

  pausar() { this.modo = 'pausa'; }

  // ------------------------------------------------------------ acciones manuales (simulación)
  entraPersona(opc = {}) { if (this.modo === 'sim') this.#llegaPersona(opc); }
  salePersona() {
    if (this.modo !== 'sim') return;
    const candidatos = this.sil.agentes.filter((a) => a.plan && !a.plan.saliendo);
    if (!candidatos.length) return;
    const ag = candidatos.find((a) => !a.silla) || candidatos[0];
    this.#salir(ag);
  }
  parejaPegada() {
    if (this.modo !== 'sim') return;
    const v = 0.04;
    const a = this.#llegaPersona({ velocidadCruce: v, desfase: 0 });
    const b = this.#llegaPersona({ velocidadCruce: v, desfase: 0.009, variante: 2 });
    return [a, b];
  }
  dejarMochila() {
    if (this.modo !== 'sim') return false;
    const sentado = this.sil.agentes.find((a) => a.silla && a.plan && !a.plan.saliendo);
    if (!sentado) return false;
    const idx = sentado.silla.indice;
    sentado.tareas.length = 0;
    this.sil.levantar(sentado, () => {
      this.#ponerMochila(idx, true);
      this.#salir(sentado, { liberarSilla: false });
      // el dueño vuelve por ella al rato
      setTimeout(() => { if (this.modo === 'sim') this.#quitarMochila(idx); }, 45000);
    });
    return true;
  }

  // Clic sobre una silla (simulación): si está libre, alguien entra por S1 y se sienta ahí; si hay
  // alguien, se levanta y sale por S2; si hay una mochila, se retira.
  alternarSilla(idx) {
    if (this.modo !== 'sim') return null;
    if (this.mochilas.has(idx)) { this.#quitarMochila(idx); return 'mochila'; }
    const ocupante = this.reservas.get(idx);
    if (ocupante) { if (!ocupante.plan?.saliendo) this.#salir(ocupante); return 'sale'; }
    const silla = this.maq.sillas[idx];
    const ag = this.#llegaPersona({ visitaCorta: false, silla });
    this.reservas.set(idx, ag);
    return 'entra';
  }

  #irYQuedarse(ag, silla) {
    if (this.modo !== 'sim') return;
    this.#irASentarse(ag, silla);
    this.sil.esperar(ag, entre(40, 70) / this.ritmo, () => this.#salir(ag));
  }

  // ------------------------------------------------------------ simulación
  #llegaPersona({ visitaCorta = Math.random() < 0.12, velocidadCruce = null, desfase = 0, variante = null, silla = null } = {}) {
    const G = this.G;
    const ag = this.sil.crear({ x: this.xE + entre(-0.004, 0.004), z: G.zF - 0.024 + desfase, rumbo: Math.PI, variante, bajando: true });
    ag.plan = { visitaCorta, saliendo: false };
    const vCruce = velocidadCruce ?? 0.042 * THREE.MathUtils.clamp(normal(1, 0.3), 0.55, 1.7);
    // en pareja ambos caminan a la misma velocidad para cruzar pegados
    this.sil.caminar(ag, [{ x: this.xE, z: G.zPared + 0.034 + desfase }], { velocidad: velocidadCruce });
    this.sil.caminar(ag, [{ x: this.xE, z: G.zPared - 0.024 + desfase * 0.3 }], { velocidad: vCruce });
    this.sil.hacer(ag, () => (silla ? this.#irYQuedarse(ag, silla) : this.#decidir(ag)));
    return ag;
  }

  #sillaLibre() {
    const libres = this.maq.sillas.filter((s) => !this.reservas.has(s.indice) && !this.mochilas.has(s.indice));
    if (!libres.length) return null;
    return libres[Math.floor(Math.random() * libres.length)];
  }

  #acceso(silla) {
    const T = M.mesa;
    if (silla.mira > 0) return { x: silla.cfg.x + Math.sign(silla.cfg.x - T.x || 1) * 0.034, z: silla.cfg.z };
    return { x: silla.cfg.x, z: silla.cfg.z + 0.034 };
  }

  #puntoDePie() {
    const ocupados = this.sil.agentes.filter((a) => !a.silla).map((a) => a.pos);
    const libres = this.puntosDePie.filter(([x, z]) => !ocupados.some((p) => Math.hypot(p.x - x, p.y - z) < 0.025));
    const lista = libres.length ? libres : this.puntosDePie;
    const [x, z] = lista[Math.floor(Math.random() * lista.length)];
    return { x: x + entre(-0.006, 0.006), z: z + entre(-0.006, 0.006) };
  }

  #irASentarse(ag, silla, { velocidad = null, alSentarse = null } = {}) {
    this.reservas.set(silla.indice, ag);
    const acc = this.#acceso(silla);
    this.sil.caminar(ag, this.sil.rutaA(ag, acc.x, acc.z), { velocidad });
    this.sil.caminar(ag, [{ x: silla.cfg.x, z: silla.cfg.z }], { velocidad: 0.03 });
    this.sil.sentar(ag, silla, alSentarse);
  }

  #decidir(ag) {
    if (this.modo !== 'sim') return;
    if (ag.plan.visitaCorta) {
      const p = this.#puntoDePie();
      this.sil.caminar(ag, this.sil.rutaA(ag, p.x, p.z));
      this.sil.esperar(ag, entre(4, 8), () => this.#salir(ag));
      return;
    }
    const silla = this.#sillaLibre();
    if (silla) {
      this.#irASentarse(ag, silla);
      this.sil.esperar(ag, entre(22, 55) / this.ritmo, () => this.#salir(ag));
    } else {
      const p = this.#puntoDePie();
      this.sil.caminar(ag, this.sil.rutaA(ag, p.x, p.z));
      this.sil.esperar(ag, entre(7, 13), () => {
        const s = this.#sillaLibre();
        if (s) { this.#irASentarse(ag, s); this.sil.esperar(ag, entre(18, 40) / this.ritmo, () => this.#salir(ag)); }
        else this.#salir(ag);
      });
    }
  }

  #salir(ag, { liberarSilla = true } = {}) {
    if (!ag.plan) ag.plan = {};
    ag.plan.saliendo = true;
    ag.tareas.length = 0;
    const G = this.G;
    const seguir = () => {
      if (ag.silla === null) {
        for (const [k, v] of this.reservas) if (v === ag && liberarSilla) this.reservas.delete(k);
      }
      const vCruce = 0.042 * THREE.MathUtils.clamp(normal(1, 0.3), 0.55, 1.7);
      this.sil.caminar(ag, this.sil.rutaA(ag, this.xS, G.zPared - 0.026));
      this.sil.caminar(ag, [{ x: this.xS, z: G.zPared + 0.036 }], { velocidad: vCruce });
      this.sil.caminar(ag, [{ x: this.xS + entre(-0.004, 0.004), z: G.zF - 0.024 }]);
      this.sil.retirar(ag);
    };
    if (ag.silla) {
      const silla = ag.silla;
      this.sil.levantar(ag, () => {
        if (liberarSilla) this.reservas.delete(silla.indice);
        else this.reservas.delete(silla.indice);
        const acc = this.#acceso(silla);
        this.sil.caminar(ag, [acc], { velocidad: 0.03 });
        this.sil.hacer(ag, seguir);
      });
    } else {
      for (const [k, v] of this.reservas) if (v === ag) this.reservas.delete(k);
      seguir();
    }
  }

  // ------------------------------------------------------------ mochilas (asiento "apartado")
  #geoMochila() {
    const g = new THREE.Group();
    const tela = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.85 });
    const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.02, 0.01), tela);
    cuerpo.position.y = 0.01;
    const bolsillo = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.008, 0.004), new THREE.MeshStandardMaterial({ color: 0x172554, roughness: 0.9 }));
    bolsillo.position.set(0, 0.007, 0.006);
    const asa = new THREE.Mesh(new THREE.TorusGeometry(0.003, 0.0007, 6, 12, Math.PI), tela);
    asa.position.y = 0.02;
    g.add(cuerpo, bolsillo, asa);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  #ponerMochila(idx, conAnimacion = false) {
    if (this.mochilas.has(idx)) return;
    const s = this.maq.sillas[idx];
    const m = this.mochilaGeo.clone();
    m.position.copy(s.asientoPos);
    m.position.z += s.mira * 0.002;
    m.rotation.y = s.mira > 0 ? 0 : Math.PI;
    if (conAnimacion) m.position.y += 0.002;
    this.maq.grupo.add(m);
    this.mochilas.set(idx, m);
  }

  #quitarMochila(idx) {
    const m = this.mochilas.get(idx);
    if (m) { m.parent?.remove(m); this.mochilas.delete(idx); }
  }

  // ------------------------------------------------------------ modo en vivo
  #alCruce(e) {
    if (this.modo !== 'vivo' || e.evento !== 'DETECTADO') return;
    const G = this.G;
    if (e.sensor === 'S1') {
      const ag = this.sil.crear({ x: this.xE, z: G.zPared + 0.03, rumbo: Math.PI, bajando: false });
      ag.opacidad = 0.15;
      this.roles.set(ag, { rol: 'entrando', silla: null, desde: performance.now() });
      this.sil.caminar(ag, [{ x: this.xE, z: G.zPared - 0.024 }], { velocidad: 0.06 });
      const p = this.#puntoDePie();
      this.sil.caminar(ag, this.sil.rutaA(ag, p.x, p.z, [], new THREE.Vector2(this.xE, G.zPared - 0.024)), { velocidad: 0.07 });
      this.sil.hacer(ag, () => { const r = this.roles.get(ag); if (r && r.rol === 'entrando') r.rol = 'pie'; });
      this.tReconciliar = Math.min(this.tReconciliar, 0.3);
    } else {
      const libres = [...this.roles.entries()].filter(([, r]) => r.rol === 'pie' || r.rol === 'entrando').sort((a, b) => a[1].desde - b[1].desde);
      if (libres.length) this.#salirVivo(libres[0][0]);
      else {
        // nadie de pie: se dibuja el paso por la puerta de salida
        const ag = this.sil.crear({ x: this.xS, z: G.zPared - 0.02, rumbo: 0, bajando: false });
        this.roles.set(ag, { rol: 'saliendo', silla: null, desde: performance.now() });
        this.sil.caminar(ag, [{ x: this.xS, z: G.zF - 0.024 }], { velocidad: 0.08 });
        this.sil.retirar(ag, () => this.roles.delete(ag));
      }
    }
  }

  #salirVivo(ag, rapido = true) {
    const r = this.roles.get(ag);
    if (r) r.rol = 'saliendo';
    ag.tareas.length = 0;
    const G = this.G;
    const v = rapido ? 0.09 : 0.06;
    const ir = () => {
      this.sil.caminar(ag, this.sil.rutaA(ag, this.xS, G.zPared - 0.026), { velocidad: v });
      this.sil.caminar(ag, [{ x: this.xS, z: G.zF - 0.024 }], { velocidad: v });
      this.sil.retirar(ag, () => this.roles.delete(ag));
    };
    if (ag.silla) { const s = ag.silla; this.sil.levantar(ag, () => { this.sil.caminar(ag, [this.#acceso(s)], { velocidad: 0.05 }); this.sil.hacer(ag, ir); }); }
    else ir();
  }

  #reconciliar() {
    const est = this.estado;
    const asientos = est.camara.asientos;
    const ocupadas = asientos.map((a, i) => (a.ocupado === true ? i : -1)).filter((i) => i >= 0);
    const personas = est.contador.conocido ? est.contador.dentro : ocupadas.length;
    const sentadasPermitidas = Math.min(ocupadas.length, personas);
    // agentes actuales por rol
    const sentados = new Map();
    for (const [ag, r] of this.roles) if (r.rol === 'sentado' || r.rol === 'yendo') sentados.set(r.silla, ag);
    // 1) asientos que quedaron libres: se levantan, se quitan mochilas
    asientos.forEach((a, i) => {
      if (a.ocupado !== true) {
        this.#quitarMochila(i);
        const ag = sentados.get(i);
        if (ag) {
          const r = this.roles.get(ag);
          sentados.delete(i);
          r.rol = 'pie'; r.silla = null; r.desde = performance.now();
          ag.tareas.length = 0;
          const s = this.maq.sillas[i];
          const parar = () => { const p = this.#puntoDePie(); this.sil.caminar(ag, [this.#acceso(s)], { velocidad: 0.05 }); this.sil.caminar(ag, this.sil.rutaA(ag, p.x, p.z, [], new THREE.Vector2(this.#acceso(s).x, this.#acceso(s).z)), { velocidad: 0.06 }); };
          if (ag.silla) this.sil.levantar(ag, parar); else parar();
        }
      }
    });
    // 2) asientos ocupados: persona sentada (si alcanza el conteo) o mochila
    let sentadas = 0;
    for (const i of ocupadas) {
      if (sentados.has(i)) { sentadas++; this.#quitarMochila(i); }
    }
    for (const i of ocupadas) {
      if (sentados.has(i)) continue;
      if (sentadas < sentadasPermitidas) {
        sentadas++;
        this.#quitarMochila(i);
        const silla = this.maq.sillas[i];
        const dePie = [...this.roles.entries()].filter(([, r]) => r.rol === 'pie' || r.rol === 'entrando').sort((a, b) => a[1].desde - b[1].desde);
        if (dePie.length) {
          const [ag, r] = dePie[0];
          r.rol = 'yendo'; r.silla = i;
          ag.tareas.length = 0;
          this.#irASentarse(ag, silla, { velocidad: 0.08, alSentarse: () => { const rr = this.roles.get(ag); if (rr) rr.rol = 'sentado'; } });
        } else {
          const ag = this.sil.crear({ x: silla.cfg.x, z: silla.cfg.z, bajando: true, sentadoEn: silla });
          ag.altura = 0.05;
          ag.estado = 'bajando';
          this.roles.set(ag, { rol: 'sentado', silla: i, desde: performance.now() });
        }
      } else {
        this.#ponerMochila(i);
      }
    }
    // si hay más sentados que personas contadas, el más reciente deja "su mochila" (objeto en el asiento)
    let exceso = [...this.roles.values()].filter((r) => r.rol === 'sentado' || r.rol === 'yendo').length - sentadasPermitidas;
    if (exceso > 0) {
      const lista = [...this.roles.entries()].filter(([, r]) => r.rol === 'sentado' || r.rol === 'yendo').sort((a, b) => b[1].desde - a[1].desde);
      for (const [ag, r] of lista) {
        if (exceso <= 0) break;
        const i = r.silla;
        this.roles.delete(ag);
        ag.tareas.length = 0;
        ag.estado = 'subiendo';
        if (asientos[i]?.ocupado === true) this.#ponerMochila(i);
        exceso--;
      }
    }
    // 3) personas de pie: tantas como (dentro − sentadas)
    const objetivoPie = Math.max(0, personas - sentadasPermitidas);
    const pie = [...this.roles.entries()].filter(([, r]) => r.rol === 'pie' || r.rol === 'entrando');
    if (pie.length < objetivoPie) {
      for (let k = pie.length; k < objetivoPie; k++) {
        const p = this.#puntoDePie();
        const ag = this.sil.crear({ x: p.x, z: p.z, rumbo: Math.random() * 6.28, bajando: true });
        this.roles.set(ag, { rol: 'pie', silla: null, desde: performance.now() });
      }
    } else if (pie.length > objetivoPie) {
      pie.sort((a, b) => a[1].desde - b[1].desde);
      for (let k = 0; k < pie.length - objetivoPie; k++) this.#salirVivo(pie[k][0], false);
    }
  }

  // ------------------------------------------------------------ ciclo
  update(dt) {
    if (this.modo === 'pausa') return;
    this.t += dt * 1000;
    if (this.modo === 'sim') {
      if (this.autoLlegadas) {
        this.proximaLlegada -= dt * this.ritmo;
        if (this.proximaLlegada <= 0) {
          const activos = this.sil.agentes.filter((a) => a.plan && !a.plan.saliendo).length;
          if (activos < this.maxPersonas) this.#llegaPersona();
          const dentro = this.estado.contador.dentro;
          const medio = dentro >= M.capacidad ? 16 : dentro >= 2 ? 9 : 6;
          this.proximaLlegada = -Math.log(1 - Math.random()) * medio;
        }
      }
      // haces virtuales → firmware emulado
      const bloqueos = [];
      for (const id of ['S1', 'S2']) {
        const s = this.maq.sensores[id];
        let d = null;
        for (const ag of this.sil.agentes) {
          const h = this.sil.bloqueaHaz(ag, s);
          if (h !== null && (d === null || h < d)) d = h;
        }
        this.bloqueoVisual[id] = d;
        bloqueos.push(d !== null);
      }
      this.fwC.muestrear(this.t, bloqueos);
    } else if (this.modo === 'vivo') {
      this.tReconciliar -= dt;
      if (this.tReconciliar <= 0) { this.tReconciliar = 0.8; this.#reconciliar(); }
      for (const id of ['S1', 'S2']) {
        const s = this.estado.sensores[id];
        const sensor = this.maq.sensores[id];
        const vence = Date.now() - s.desde > 2500;
        this.bloqueoVisual[id] = s.bloqueado && !vence ? Math.max(0, sensor.centroPuerta - 0.0185 - sensor.origen.x) : null;
      }
    }
  }
}
