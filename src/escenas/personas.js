// Siluetas de cartón ("personas" de la maqueta) y su navegación sobre la base.
import * as THREE from 'three';
import { MAQUETA as M } from '../config.js';
import * as TX from '../motor/texturas.js';

// ---------------------------------------------------------------------
// Navegación: grilla de 5 mm sobre la base con A* y suavizado por línea de vista.
// ---------------------------------------------------------------------
export class NavMaqueta {
  constructor(G, { celda = 0.005, radio = 0.012 } = {}) {
    this.G = G; this.celda = celda; this.radio = radio;
    this.nx = Math.ceil((G.xR - G.xL) / celda);
    this.nz = Math.ceil((G.zF - G.zB) / celda);
    this.obstaculos = this.#crearObstaculos();
    this.bloq = new Uint8Array(this.nx * this.nz);
    this.#rasterizar(this.bloq, radio, []);
  }

  #crearObstaculos() {
    const G = this.G, e = M.pared.grosor;
    const obs = [];
    const rect = (id, x0, x1, z0, z1) => obs.push({ id, x0, x1, z0, z1 });
    // pared (sin los vanos de las puertas)
    let x = G.xL;
    for (const p of M.puertas) { rect('pared', x, p.x0, G.zPared - e / 2, G.zPared + e / 2); x = p.x1; }
    rect('pared', x, G.xR, G.zPared - e / 2, G.zPared + e / 2);
    // sensores y caja de control
    for (const s of G.sensores) rect('sensor-' + s.id, s.origen.x - 0.05, s.origen.x, s.origen.z - 0.01, s.origen.z + 0.01);
    rect('caja', G.caja.x0, G.caja.x1, G.caja.z0, G.caja.z1);
    // mesa, sillas y poste
    const T = M.mesa;
    rect('mesa', T.x - T.ancho / 2, T.x + T.ancho / 2, T.z - T.fondo / 2, T.z + T.fondo / 2);
    M.sillas.forEach((s) => rect('silla-' + s.id, s.x - M.silla.ancho / 2, s.x + M.silla.ancho / 2, s.z - M.silla.ancho / 2, s.z + M.silla.ancho / 2));
    rect('poste', M.poste.x - 0.015, M.poste.x + 0.015, M.poste.z - 0.015, M.poste.z + 0.015);
    return obs;
  }

  #rasterizar(destino, radio, ignorar) {
    const { G, celda, nx, nz } = this;
    destino.fill(0);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = G.xL + (i + 0.5) * celda, z = G.zB + (j + 0.5) * celda;
        let b = x < G.xL + radio || x > G.xR - radio || z < G.zB + radio || z > G.zF - radio;
        if (!b) {
          for (const o of this.obstaculos) {
            if (ignorar.includes(o.id)) continue;
            if (x > o.x0 - radio && x < o.x1 + radio && z > o.z0 - radio && z < o.z1 + radio) { b = 1; break; }
          }
        }
        destino[j * nx + i] = b ? 1 : 0;
      }
    }
  }

  celdaDe(x, z) {
    const i = Math.min(this.nx - 1, Math.max(0, Math.floor((x - this.G.xL) / this.celda)));
    const j = Math.min(this.nz - 1, Math.max(0, Math.floor((z - this.G.zB) / this.celda)));
    return [i, j];
  }

  libre(x, z, grilla = this.bloq) {
    if (x < this.G.xL || x > this.G.xR || z < this.G.zB || z > this.G.zF) return false;
    const [i, j] = this.celdaDe(x, z);
    return !grilla[j * this.nx + i];
  }

  // A* de (x0,z0) a (x1,z1). ignorar: ids de obstáculos que no cuentan (la silla destino).
  ruta(x0, z0, x1, z1, ignorar = []) {
    let grilla = this.bloq;
    if (ignorar.length) { grilla = new Uint8Array(this.nx * this.nz); this.#rasterizar(grilla, this.radio, ignorar); }
    const { nx, nz } = this;
    const [si, sj] = this.#masCercanaLibre(...this.celdaDe(x0, z0), grilla);
    const [gi, gj] = this.#masCercanaLibre(...this.celdaDe(x1, z1), grilla);
    const N = nx * nz;
    const g = new Float32Array(N).fill(Infinity);
    const padre = new Int32Array(N).fill(-1);
    const cerrado = new Uint8Array(N);
    const abiertos = [];
    const h = (i, j) => Math.hypot(i - gi, j - gj);
    const ini = sj * nx + si, fin = gj * nx + gi;
    g[ini] = 0;
    abiertos.push([h(si, sj), ini]);
    const vec = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    while (abiertos.length) {
      let mejor = 0;
      for (let k = 1; k < abiertos.length; k++) if (abiertos[k][0] < abiertos[mejor][0]) mejor = k;
      const [, actual] = abiertos.splice(mejor, 1)[0];
      if (actual === fin) break;
      if (cerrado[actual]) continue;
      cerrado[actual] = 1;
      const ci = actual % nx, cj = (actual / nx) | 0;
      for (const [di, dj, costo] of vec) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
        const n = nj * nx + ni;
        if (grilla[n] || cerrado[n]) continue;
        if (di && dj && (grilla[cj * nx + ni] || grilla[nj * nx + ci])) continue;
        const ng = g[actual] + costo;
        if (ng < g[n]) { g[n] = ng; padre[n] = actual; abiertos.push([ng + h(ni, nj), n]); }
      }
    }
    if (padre[fin] === -1 && fin !== ini) return [new THREE.Vector2(x0, z0), new THREE.Vector2(x1, z1)];
    const celdas = [];
    for (let c = fin; c !== -1; c = padre[c]) celdas.push(c);
    celdas.reverse();
    const pts = celdas.map((c) => new THREE.Vector2(this.G.xL + ((c % nx) + 0.5) * this.celda, this.G.zB + (((c / nx) | 0) + 0.5) * this.celda));
    pts[0] = new THREE.Vector2(x0, z0);
    pts.push(new THREE.Vector2(x1, z1));
    return this.#suavizar(pts, grilla);
  }

  #masCercanaLibre(i, j, grilla) {
    if (!grilla[j * this.nx + i]) return [i, j];
    for (let r = 1; r < 30; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= this.nx || b >= this.nz) continue;
        if (!grilla[b * this.nx + a]) return [a, b];
      }
    }
    return [i, j];
  }

  #vista(a, b, grilla) {
    const pasos = Math.ceil(a.distanceTo(b) / (this.celda * 0.5));
    for (let k = 1; k < pasos; k++) {
      const t = k / pasos;
      if (!this.libre(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, grilla)) return false;
    }
    return true;
  }

  #suavizar(pts, grilla) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    let k = 0;
    while (k < pts.length - 1) {
      let lejos = k + 1;
      for (let m = pts.length - 1; m > k + 1; m--) if (this.#vista(pts[k], pts[m], grilla)) { lejos = m; break; }
      out.push(pts[lejos]);
      k = lejos;
    }
    return out;
  }
}

// ---------------------------------------------------------------------
// Forma de la silueta (vista frontal), de pie o sentada. Altura total ≈ 10 cm.
// ---------------------------------------------------------------------
function formaPersona(sentada = false) {
  const s = new THREE.Shape();
  const dy = sentada ? -0.018 : 0;           // al sentarse el torso baja 1.8 cm
  const yPie = 0;
  const yEntrepierna = sentada ? 0.024 : 0.040;
  const yCadera = sentada ? 0.028 : 0.046;
  const P = (x, y) => [x, y + dy];
  s.moveTo(...P(0.0034, 0.0785));
  s.lineTo(...P(0.0125, 0.0772));
  s.quadraticCurveTo(...P(0.0175, 0.0765), ...P(0.0178, 0.072));
  s.lineTo(...P(0.0185, 0.050));
  s.quadraticCurveTo(...P(0.0187, 0.0452), ...P(0.0157, 0.0458));
  s.lineTo(...P(0.0135, 0.067));
  s.lineTo(...P(0.0118, 0.066));
  s.lineTo(...P(0.0108, 0.052));
  if (sentada) {
    // muslos (escorzo) y piernas que bajan hasta el piso
    s.lineTo(0.0125, yCadera);
    s.lineTo(0.0112, 0.0035);
    s.lineTo(0.0116, yPie);
    s.lineTo(0.0030, yPie);
    s.lineTo(0.0024, yEntrepierna);
    s.lineTo(-0.0024, yEntrepierna);
    s.lineTo(-0.0030, yPie);
    s.lineTo(-0.0116, yPie);
    s.lineTo(-0.0112, 0.0035);
    s.lineTo(-0.0125, yCadera);
  } else {
    s.lineTo(0.0115, yCadera);
    s.lineTo(0.0098, 0.0035);
    s.lineTo(0.0102, yPie);
    s.lineTo(0.0022, yPie);
    s.lineTo(0.0018, yEntrepierna);
    s.lineTo(-0.0018, yEntrepierna);
    s.lineTo(-0.0022, yPie);
    s.lineTo(-0.0102, yPie);
    s.lineTo(-0.0098, 0.0035);
    s.lineTo(-0.0115, yCadera);
  }
  s.lineTo(...P(-0.0108, 0.052));
  s.lineTo(...P(-0.0118, 0.066));
  s.lineTo(...P(-0.0135, 0.067));
  s.lineTo(...P(-0.0157, 0.0458));
  s.quadraticCurveTo(...P(-0.0187, 0.0452), ...P(-0.0185, 0.050));
  s.lineTo(...P(-0.0178, 0.072));
  s.quadraticCurveTo(...P(-0.0175, 0.0765), ...P(-0.0125, 0.0772));
  s.lineTo(...P(-0.0034, 0.0785));
  s.lineTo(...P(-0.0034, 0.0819));
  const cy = 0.09 + dy, r = 0.0088;
  s.absarc(0, cy, r, Math.atan2(-0.00812, -0.0034) + Math.PI * 2, Math.atan2(-0.00812, 0.0034), true);
  s.lineTo(...P(0.0034, 0.0785));
  return s;
}

function geometriaSilueta(sentada) {
  const g = new THREE.ExtrudeGeometry(formaPersona(sentada), { depth: 0.003, bevelEnabled: false, curveSegments: 10 });
  g.translate(0, 0, -0.0015);
  // UV de los cantos: escala fina para las canaletas del cartón
  g.computeVertexNormals();
  return g;
}

const VARIANTES = [
  { cara: 0xc0965f, nombre: 'kraft' },
  { cara: 0xb48552, nombre: 'kraft oscuro' },
  { cara: 0xd9cdb7, nombre: 'cartón claro' },
  { cara: 0x9fa3a8, nombre: 'cartón gris' },
];

export class Siluetas {
  constructor(grupoMaqueta, nav) {
    this.grupo = new THREE.Group();
    this.grupo.name = 'siluetas';
    grupoMaqueta.add(this.grupo);
    this.nav = nav;
    this.geoPie = geometriaSilueta(false);
    this.geoSentada = geometriaSilueta(true);
    const kraft = TX.grano({ tam: 256, base: 0xffffff, variacion: 0.08, motas: 0.5, escala: 14, semilla: 77, fuerzaNormal: 0.6, fibras: 0.1 });
    this.texCara = kraft.map; this.normalCara = kraft.normalMap;
    this.texCanto = TX.canaletas();
    this.geoSoporte = new THREE.BoxGeometry(0.02, 0.0025, 0.012);
    this.agentes = [];
    this.siguienteId = 1;
  }

  crear({ x, z, rumbo = 0, variante = null, bajando = true, sentadoEn = null } = {}) {
    const v = VARIANTES[variante ?? Math.floor(Math.random() * VARIANTES.length)];
    const matCara = new THREE.MeshStandardMaterial({ color: v.cara, map: this.texCara, normalMap: this.normalCara, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.92, transparent: true, opacity: 1 });
    const matCanto = new THREE.MeshStandardMaterial({ color: 0xffffff, map: this.texCanto, roughness: 0.95, transparent: true, opacity: 1 });
    const nodo = new THREE.Group();
    const pie = new THREE.Mesh(this.geoPie, [matCara, matCanto]);
    const sentada = new THREE.Mesh(this.geoSentada, [matCara, matCanto]);
    sentada.visible = false;
    const soporte = new THREE.Mesh(this.geoSoporte, matCanto);
    soporte.position.set(0, 0.00125, 0);
    for (const m of [pie, sentada, soporte]) { m.castShadow = true; m.receiveShadow = true; }
    nodo.add(pie, sentada, soporte);
    this.grupo.add(nodo);
    const ag = {
      id: this.siguienteId++, nodo, pie, sentada, soporte, mats: [matCara, matCanto],
      pos: new THREE.Vector2(x, z), rumbo, rumboObjetivo: rumbo, altura: bajando ? 0.06 : 0,
      opacidad: bajando ? 0 : 1, estado: bajando ? 'bajando' : 'quieto',
      ruta: [], velocidad: 0.045 * (0.85 + Math.random() * 0.3), fase: Math.random() * 10,
      silla: null, tareas: [], alTerminar: null, etiqueta: v.nombre, tiempo: 0,
    };
    if (sentadoEn) this.#ponerSentado(ag, sentadoEn);
    this.agentes.push(ag);
    this.#aplicar(ag);
    return ag;
  }

  // Encola una ruta: lista de puntos {x,z} o Vector2; vel opcional.
  caminar(ag, puntos, { velocidad = null, alLlegar = null } = {}) {
    ag.tareas.push({ tipo: 'ruta', puntos: puntos.map((p) => new THREE.Vector2(p.x, p.y ?? p.z)), velocidad, alLlegar });
  }
  esperar(ag, segundos, alTerminar = null) { ag.tareas.push({ tipo: 'esperar', t: segundos, alTerminar }); }
  sentar(ag, silla, alTerminar = null) { ag.tareas.push({ tipo: 'sentar', silla, alTerminar }); }
  levantar(ag, alTerminar = null) { ag.tareas.push({ tipo: 'levantar', alTerminar }); }
  retirar(ag, alTerminar = null) { ag.tareas.push({ tipo: 'retirar', alTerminar }); }
  hacer(ag, fn) { ag.tareas.push({ tipo: 'fn', fn }); }

  // Ruta calculada por A* desde la posición actual (o desde 'desde')
  rutaA(ag, x, z, ignorar = [], desde = null) {
    const p = desde || ag.pos;
    return this.nav.ruta(p.x, p.y, x, z, ignorar).slice(1).map((v) => ({ x: v.x, z: v.y }));
  }

  quitar(ag) {
    this.grupo.remove(ag.nodo);
    ag.mats.forEach((m) => m.dispose());
    this.agentes = this.agentes.filter((a) => a !== ag);
  }

  #ponerSentado(ag, silla) {
    ag.silla = silla;
    ag.estado = 'sentado';
    const haciaMesa = silla.mira; // +1 mira a +z
    ag.pos.set(silla.asientoPos.x, silla.asientoPos.z + haciaMesa * 0.007);
    ag.rumbo = ag.rumboObjetivo = haciaMesa > 0 ? 0 : Math.PI;
    ag.pie.visible = false; ag.soporte.visible = false; ag.sentada.visible = true;
  }

  update(dt) {
    for (const ag of [...this.agentes]) {
      ag.tiempo += dt;
      this.#avanzar(ag, dt);
      this.#aplicar(ag);
    }
  }

  #avanzar(ag, dt) {
    // descenso / retiro "a mano" (la silueta se mueve con la mano, como en la maqueta real)
    if (ag.estado === 'bajando') {
      ag.altura = Math.max(0, ag.altura - dt * 0.09);
      ag.opacidad = Math.min(1, ag.opacidad + dt * 2.2);
      if (ag.altura === 0) ag.estado = ag.silla ? 'sentado' : 'quieto';
      return;
    }
    if (ag.estado === 'subiendo') {
      ag.altura += dt * 0.08;
      ag.opacidad = Math.max(0, ag.opacidad - dt * 1.6);
      if (ag.opacidad <= 0) { this.quitar(ag); ag.alTerminar?.(); }
      return;
    }
    const tarea = ag.tareas[0];
    if (!tarea) { if (ag.estado === 'caminando') ag.estado = 'quieto'; return; }
    if (tarea.tipo === 'fn') { ag.tareas.shift(); tarea.fn(ag); return; }
    if (tarea.tipo === 'esperar') {
      tarea.t -= dt;
      if (ag.estado !== 'sentado') ag.estado = 'quieto';
      if (tarea.t <= 0) { ag.tareas.shift(); tarea.alTerminar?.(ag); }
      return;
    }
    if (tarea.tipo === 'sentar') {
      ag.tareas.shift();
      this.#ponerSentado(ag, tarea.silla);
      tarea.alTerminar?.(ag);
      return;
    }
    if (tarea.tipo === 'levantar') {
      ag.tareas.shift();
      if (ag.silla) {
        const s = ag.silla;
        ag.pos.set(s.asientoPos.x, s.asientoPos.z);
        ag.silla = null;
      }
      ag.estado = 'quieto';
      ag.pie.visible = true; ag.soporte.visible = true; ag.sentada.visible = false;
      tarea.alTerminar?.(ag);
      return;
    }
    if (tarea.tipo === 'retirar') {
      ag.tareas.shift();
      ag.estado = 'subiendo';
      ag.alTerminar = tarea.alTerminar;
      return;
    }
    if (tarea.tipo === 'ruta') {
      ag.estado = 'caminando';
      const v = tarea.velocidad ?? ag.velocidad;
      let paso = v * dt;
      while (paso > 0 && tarea.puntos.length) {
        const obj = tarea.puntos[0];
        const dx = obj.x - ag.pos.x, dz = obj.y - ag.pos.y;
        const d = Math.hypot(dx, dz);
        if (d > 1e-5) ag.rumboObjetivo = Math.atan2(dx, dz);
        if (d <= paso) { ag.pos.copy(obj); tarea.puntos.shift(); paso -= d; }
        else { ag.pos.x += (dx / d) * paso; ag.pos.y += (dz / d) * paso; paso = 0; }
      }
      ag.fase += dt * v * 160;
      if (!tarea.puntos.length) { ag.tareas.shift(); ag.estado = 'quieto'; tarea.alLlegar?.(ag); }
    }
  }

  #aplicar(ag) {
    // giro suave hacia el rumbo deseado
    let d = ag.rumboObjetivo - ag.rumbo;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    ag.rumbo += d * Math.min(1, 0.18);
    const caminando = ag.estado === 'caminando';
    const bamboleo = caminando ? Math.sin(ag.fase) : 0;
    const y = (ag.estado === 'sentado' ? 0.0 : 0) + ag.altura + (caminando ? Math.abs(bamboleo) * 0.0012 : 0);
    ag.nodo.position.set(ag.pos.x, y, ag.pos.y);
    ag.nodo.rotation.set(0, ag.rumbo, caminando ? bamboleo * 0.045 : 0);
    if (ag.mats[0].opacity !== ag.opacidad) {
      for (const m of ag.mats) { m.opacity = ag.opacidad; m.transparent = ag.opacidad < 0.999; m.depthWrite = ag.opacidad > 0.5; }
    }
  }

  // Caja que ocupa la silueta a la altura del pecho (para los haces virtuales)
  bloqueaHaz(ag, sensor) {
    if (ag.estado === 'sentado' || ag.altura > 0.02 || ag.opacidad < 0.5) return null;
    const hw = 0.0185, ht = 0.0015;
    const c = Math.abs(Math.cos(ag.rumbo)), s = Math.abs(Math.sin(ag.rumbo));
    const extZ = hw * s + ht * c;
    const extX = hw * c + ht * s;
    const xIni = ag.pos.x - extX;
    const d = Math.max(0, xIni - sensor.origen.x);
    if (ag.pos.x + extX < sensor.origen.x || xIni > sensor.origen.x + sensor.alcance) return null;
    const radioHaz = Math.tan(sensor.semiApertura) * Math.max(d, 0.002);
    if (Math.abs(ag.pos.y - sensor.origen.z) > extZ + radioHaz) return null;
    return d;
  }
}
