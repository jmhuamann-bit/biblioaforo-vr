// Experiencia LIBRE: recorrer la biblioteca a tu ritmo. Doce puntos de interés explican cómo
// funciona cada pieza del sistema; puedes sentarte, pedir una ruta a cualquier asiento (mapa)
// o mirar desde arriba. La biblioteca sigue viva alrededor.
import * as THREE from 'three';
import { PLANO, ruta, rutaLlegada, yPiso, accesoAsiento, NOMBRE_ZONA, enEscalera } from '../biblioteca/plano.js';
import { describirObjeto } from './jugador.js';
import { VistaAerea } from './vistaAerea.js';
import * as H from './hudJuego.js';

const PUNTOS = [
  { id: 'entrada', piso: 1, x: 0.5, z: 11.6, titulo: 'Sensor S1 · puerta de entrada', texto: 'Un sensor infrarrojo cruza la puerta con un haz invisible. Cada vez que alguien lo corta, el ESP32 suma 1 a «personas dentro». No sabe en qué sentido pasas: solo cuenta cruces. Por eso la entrada y la salida son puertas distintas.' },
  { id: 'salida', piso: 1, x: 5.5, z: 11.6, titulo: 'Sensor S2 · puerta de salida', texto: 'El segundo sensor resta 1 con cada cruce: personas dentro = entradas − salidas. Si dos personas pasan pegadas, el haz no se libera entre ellas y cuenta solo una (un error real que se ve en la maqueta).' },
  { id: 'totem', piso: 1, x: -3.2, z: 9.3, titulo: 'Tótem de disponibilidad', texto: 'Resume lo que miden los sensores: personas dentro (puertas) y asientos libres por piso (cámaras). Así decides a qué piso subir sin recorrerlos.' },
  { id: 'piloto', piso: 1, x: -10, z: 4.7, titulo: 'Mesa piloto 1-01 = la maqueta', texto: 'Es la única mesa que existe de verdad: la maqueta 1:17 con su ESP32-CAM. Con «Datos reales», sus cuatro asientos (A1–A4) siguen a la cámara física. Todo lo demás es una proyección simulada del sistema completo.' },
  { id: 'camara', piso: 1, x: 2.5, z: 0.8, titulo: 'Una ESP32-CAM por mesa', texto: 'Mira el techo: cada mesa tendría su cámara. Compara cada asiento con una foto de la mesa vacía; si cambia más del 20 % durante 3 lecturas seguidas (0,9 s), el asiento pasa a ocupado. No reconoce caras: solo cambios de brillo, así que una mochila también «ocupa».' },
  { id: 'mostrador', piso: 1, x: 12.5, z: 8.2, titulo: 'Personas ≠ asientos', texto: 'Quien está en el mostrador, en los estantes o de paso cuenta como persona dentro, pero no ocupa asiento. Por eso hay dos indicadores distintos: el de las puertas (aforo 381) y el de las cámaras (332 asientos).' },
  { id: 'escalera', piso: 1, x: -15.2, z: 11.4, titulo: 'Escalera a la Sala 2', texto: 'Arriba están 236 de los 332 asientos (59 mesas). Subir cuesta un minuto: el tótem y el mapa te dicen antes si vale la pena.' },
  { id: 'silencio', piso: 2, x: -7, z: -1.6, titulo: 'Zona de silencio', texto: 'La mitad izquierda de la Sala 2 es para estudiar en silencio. No todos los asientos libres sirven para todos: el mapa puede filtrar por zona, enchufe o ventana.' },
  { id: 'grupo', piso: 2, x: 8.2, z: -1.6, titulo: 'Trabajo en grupo y enchufes', texto: 'Mesas para conversar. Las que tienen regleta (la franja clara sobre la mesa) permiten cargar la laptop: una de cada dos columnas. Un grupo necesita varios asientos libres en la misma mesa.' },
  { id: 'galeria', piso: 1, x: -1.8, z: 15.7, titulo: 'La entrada real de la UP', texto: 'Así se llega a la Biblioteca Jorge Basadre Grohmann: por la galería del Pabellón C, entre columnas redondas de concreto. Junto a la puerta, el cartel real dice AFORO 381 PERSONAS (el mismo límite de BiblioAforo) y el horario: de lunes a viernes, de 7:30 a 22:00.' },
  { id: 'espacios', piso: 1, x: 17.4, z: -1.5, titulo: 'Salas de estudio y Sala 3', texto: 'Las salas de estudio grupales se reservan en línea y no tienen cámara: no cuentan entre los 332 asientos. La Sala 3 guarda materiales especiales (tesis, papers) y es de acceso restringido: se piden en el módulo de atención.' },
  { id: 'ventana', piso: 2, x: 19.4, z: -4.5, titulo: 'Junto a la ventana', texto: 'La columna pegada al ventanal es la más pedida: los estudiantes virtuales la eligen 1,5 veces más que el resto. Por eso se llena primero.' },
];
const ALCANCE = 1.7;

function texturaPunto(descubierto) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const col = descubierto ? '34,197,94' : '56,189,248';
  const g = x.createRadialGradient(64, 64, 18, 64, 64, 62);
  g.addColorStop(0, `rgba(${col},0.55)`); g.addColorStop(1, `rgba(${col},0)`);
  x.fillStyle = g; x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fill();
  x.fillStyle = descubierto ? '#16a34a' : '#0284c7'; x.beginPath(); x.arc(64, 64, 34, 0, Math.PI * 2); x.fill();
  x.lineWidth = 6; x.strokeStyle = '#ffffff'; x.stroke();
  x.fillStyle = '#fff'; x.font = '800 42px "Segoe UI", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(descubierto ? '✓' : 'i', 64, 67);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Libre {
  constructor(app) {
    this.app = app;
    this.id = 'libre';
    this.titulo = 'Libre';
    this.escena = 'biblioteca';
    this.panel = false;
    this.aerea = new VistaAerea(app);
    this.oyentes = [];
    this.marcas = null;
  }
  get b() { return this.app.biblio; }
  get m() { return this.app.multitud; }
  get esc() { return this.app.escenas.biblioteca; }
  get b3d() { return this.app.escenas.biblioteca.b3d; }
  get j() { return this.app.jugador; }
  get son() { return this.app.sonido; }

  #crearMarcas() {
    this.texNo = texturaPunto(false);
    this.texSi = texturaPunto(true);
    this.marcas = PUNTOS.map((p) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texNo, transparent: true, depthWrite: false, toneMapped: false }));
      s.scale.set(0.75, 0.75, 1);
      s.position.set(p.x, yPiso(p.piso) + 2.35, p.z);
      s.renderOrder = 8;
      s.userData.punto = p;
      this.b3d.pisos[p.piso].add(s);
      return s;
    });
  }

  iniciar(opc = {}) {
    const app = this.app;
    app.reiniciarMundo('punta14', { velocidad: 2 });
    this.m.factorVel = 0.5;
    app.precalentar(6);
    if (!this.marcas) this.#crearMarcas();
    for (const s of this.marcas) s.visible = true;
    this.descubiertos ||= new Set();
    this.tuyo = null; this.destino = null; this.rutaPts = null; this.tRuta = 0; this.tCerca = 0; this.tHud = 0; this.actual = null; this.tActual = 0;
    this.esc.restaurarVisibilidad(); this.esc.enfocarPiso(null); this.esc.separarPisos(false);
    this.b3d.ocultarRuta(); this.b3d.marcarDestino(null); this.b3d.avatar.visible = false;
    if (opc.ir === 'piloto') this.j.iniciar({ x: -10, z: 5.3, piso: 1, rumbo: 0, velocidad: 1.75 });
    else this.j.iniciar({ x: 0.5, z: PLANO.z1 + 5.5, piso: 1, rumbo: 0, velocidad: 1.75 });
    this.j.describir = (h) => this.describir(h);
    this.j.alInteractuar = (h) => this.interactuar(h);
    H.mostrar({ mira: true, objetivo: true, kpis: true, minimapa: true, barraAcciones: true });
    H.alAccionObjetivo((a) => { if (a === 'mapa') this.abrirMapa(); if (a === 'cerrar') { this.actual = null; this.#pintar(); } });
    H.acciones([
      { texto: 'Mapa y rutas', tecla: 'Tab', fn: () => this.abrirMapa() },
      { texto: 'Vista aérea', tecla: 'V', fn: () => this.alternarVista() },
      { texto: 'Hora punta', fn: () => app.irModo('horaPunta') },
    ]);
    this.oyentes = [this.b.on('asiento', ({ a, ahora }) => {
      if (this.destino && a.id === this.destino.id && ahora !== 'libre' && !a.estudiante) {
        H.banner(`El asiento ${a.id} se ocupó`, 'alerta', 'Alguien llegó antes. Elige otro en el mapa (Tab).', 3600);
        this.son.alerta();
        this.#quitarDestino();
      }
    })];
    this.#pintar();
    H.banner('Modo libre', 'info', 'Recorre los dos pisos a tu ritmo. Acércate a los círculos azules (i) para descubrir cómo funciona el sistema.', 5000);
  }

  detener() {
    for (const off of this.oyentes) off();
    this.oyentes = [];
    if (this.aerea.activa) { this.aerea.activa = false; this.esc.restaurarVisibilidad(); this.b3d.avatar.visible = false; }
    if (this.tuyo) { this.m.liberarPorJugador(this.tuyo.id); this.tuyo = null; }
    this.esc.marcar({ tuyo: null, elegido: null });
    for (const s of this.marcas || []) s.visible = false;
    this.j.detener();
    this.j.describir = null; this.j.alInteractuar = null;
    this.b3d.ocultarRuta(); this.b3d.marcarDestino(null);
    H.alAccionObjetivo(null);
    H.mostrar({});
  }

  pistas() {
    if (this.aerea.activa) return [['Clic', 'pedir ruta a un asiento'], ['Arrastrar', 'girar'], ['V', 'volver a caminar']];
    if (this.tuyo) return [['E', 'levantarte'], ['Arrastrar', 'mirar alrededor'], ['V', 'vista aérea']];
    return [['W A S D', 'caminar'], ['Shift', 'correr'], ['Clic', 'mirar'], ['E', 'usar · sentarte'], ['Tab', 'mapa y rutas'], ['V', 'vista aérea']];
  }

  teclas() {
    return {
      Tab: () => this.abrirMapa(),
      KeyV: () => this.alternarVista(),
      KeyQ: () => this.#quitarDestino(),
      Escape: () => { if (this.app.mapaJuego.abierto) this.app.mapaJuego.cerrar(); },
    };
  }

  alternarVista() {
    if (this.tuyo) this.#levantarse();
    this.aerea.alternar({ texto: 'Haz clic en un asiento para pedir una ruta. V para volver a caminar.' });
    H.mostrar({ mira: !this.aerea.activa, objetivo: true, kpis: true, minimapa: !this.aerea.activa, barraAcciones: true });
    this.app.actualizarPistas();
  }

  abrirMapa() {
    if (this.app.mapaJuego.abierto) { this.app.mapaJuego.cerrar(); return; }
    const p = this.aerea.pos();
    const fuera = p.z > PLANO.z1;
    this.app.mapaJuego.abrir({
      piso: fuera ? 1 : p.piso, titulo: 'Mapa: elige un asiento y te llevo', ayuda: 'Clic en un asiento libre',
      pos: fuera ? null : p, elegido: this.destino?.id || null, tuyo: this.tuyo?.id || null, ruta: this.rutaPts,
      alElegir: (id) => { if (this.#ponerDestino(this.b.get(id))) this.app.mapaJuego.cerrar(); },
    });
  }

  // ---------------------------------------------------------------- mira, clic y sentarse
  describir(h) {
    const info = describirObjeto(this.app, h);
    if (!info) return null;
    if (h.tipo === 'asiento') {
      if (info.estado === 'libre' && this.#cerca(info.a)) info.accion = 'E · Sentarte';
      else if (info.estado === 'libre') info.accion = 'E · Llévame a este asiento';
      else if (info.estado === 'tuyo') info.accion = 'E · Levantarte';
    } else if (h.tipo === 'totem') info.accion = 'E · Abrir el mapa';
    else if (h.tipo === 'camara' || h.tipo === 'puerta') info.accion = 'E · Saber más';
    return info;
  }

  interactuar(h) {
    if (this.tuyo) { this.#levantarse(); return; }
    if (!h) return;
    if (h.tipo === 'asiento') {
      const a = this.b.get(h.id);
      if (this.b.estadoDe(a) !== 'libre') { this.son.error(); return; }
      if (this.#cerca(a)) this.#sentarse(a); else this.#ponerDestino(a);
    } else if (h.tipo === 'totem') this.abrirMapa();
    else if (h.tipo === 'puerta') this.#mostrarPunto(PUNTOS.find((p) => p.id === h.id));
    else if (h.tipo === 'camara') this.#mostrarPunto(PUNTOS.find((p) => p.id === 'camara'));
    else if (h.tipo === 'mesa' && h.id === '1-01') this.#mostrarPunto(PUNTOS.find((p) => p.id === 'piloto'));
  }

  alClic(h) {
    if (!h) return;
    if (h.tipo === 'asiento') this.#ponerDestino(this.b.get(h.id));
    else { const i = describirObjeto(this.app, h); if (i) H.banner(i.titulo, 'info', i.detalle || '', 2800); }
  }

  #cerca(a) { const p = this.j.pos; return p.piso === a.piso && Math.hypot(p.x - a.x, p.z - a.z) < ALCANCE; }

  #sentarse(a) {
    if (this.m.sentandoseEn(a.id)) { this.son.error(); return; }
    if (!this.m.puedeOcuparJugador(a.id)) { this.son.error(); H.banner('Mesa piloto con datos reales', 'info', 'Este asiento es el de la maqueta: se ocupa sentando una silueta en la maqueta física.', 3600); return; }
    const antes = this.b.libres(a.piso);
    this.tuyo = a;
    this.#quitarDestino();
    this.m.ocuparPorJugador(a.id);
    this.esc.marcar({ tuyo: a.id });
    this.j.sentarEn(a);
    this.son.sentarse();
    H.banner(`Te sentaste en ${a.id}`, 'ok', `La cámara de la mesa ${a.mesa} te detectó: libres en el piso ${a.piso}: ${antes} → ${this.b.libres(a.piso)}. Pulsa E para levantarte.`, 4200);
    this.app.actualizarPistas();
  }

  #levantarse() {
    const a = this.tuyo;
    if (!a) return;
    this.tuyo = null;
    this.m.liberarPorJugador(a.id);
    this.esc.marcar({ tuyo: null });
    const acc = accesoAsiento(a);
    this.j.iniciar({ x: acc.x, z: acc.z, piso: a.piso, rumbo: a.mira > 0 ? 0 : Math.PI, velocidad: 1.75, conservar: true });
    H.banner(`El asiento ${a.id} quedó libre`, 'info', 'La cámara lo vio vacío en 0,9 s.', 2600);
    this.app.actualizarPistas();
  }

  // ---------------------------------------------------------------- ruta a un asiento
  #ponerDestino(a) {
    if (!a || this.b.estadoDe(a) !== 'libre') { this.son.error(); return false; }
    this.destino = a;
    this.esc.marcar({ elegido: a.id });
    this.b3d.marcarDestino(a);
    this.son.seleccion();
    this.#calcularRuta();
    H.banner(`Ruta al asiento ${a.id}`, 'info', `${NOMBRE_ZONA[a.zona]} · piso ${a.piso} · sigue la cinta del suelo`, 2600);
    return true;
  }

  #quitarDestino() {
    this.destino = null; this.rutaPts = null;
    this.b3d.ocultarRuta(); this.b3d.marcarDestino(null);
    this.esc.marcar({ elegido: null });
  }

  #calcularRuta() {
    const a = this.destino; if (!a) return;
    const p = this.aerea.pos();
    if (this.rutaPts && !this.aerea.activa && enEscalera(p.x, p.z, this.j.nivel)) return;
    const pts = p.z > PLANO.z1 - 0.3 ? [{ x: p.x, y: 0, z: p.z }, ...rutaLlegada(null, a)] : ruta(p, a, { asiento: a }).pts;
    this.rutaPts = pts;
    this.b3d.mostrarRuta(pts);
    this.ultimaPos = { x: p.x, z: p.z };
  }

  // ---------------------------------------------------------------- puntos de interés
  #mostrarPunto(p) {
    if (!p) return;
    const nuevo = !this.descubiertos.has(p.id);
    this.descubiertos.add(p.id);
    this.actual = p;
    this.tActual = 16;
    const s = this.marcas.find((m) => m.userData.punto === p);
    if (s) s.material.map = this.texSi;
    if (nuevo) {
      this.son.seleccion();
      const n = this.descubiertos.size;
      if (n === PUNTOS.length) { this.son.exito(); H.banner(`¡Descubriste los ${PUNTOS.length} puntos!`, 'ok', 'Ya sabes cómo funciona BiblioAforo por dentro. Prueba Hora punta o Caos.', 6000); }
      else H.banner(`Punto ${n} de ${PUNTOS.length}: ${p.titulo}`, 'ok', '', 2400);
    }
    this.#pintar();
  }

  #pintar() {
    const n = this.descubiertos?.size || 0;
    const p = this.actual;
    const cuerpo = p
      ? `<p><b>${p.titulo}</b></p><p>${p.texto}</p><div class="fila"><button data-a="cerrar">Entendido</button></div>`
      : `<p>Camina hacia los círculos <b>(i)</b>: cada uno explica una pieza del sistema. ${this.destino ? `Vas al asiento <b>${this.destino.id}</b>: sigue la cinta.` : 'Con <kbd>Tab</kbd> eliges cualquier asiento en el mapa y te llevo.'}</p><div class="fila"><button data-a="mapa">Mapa y rutas</button></div>`;
    H.objetivo(`<h2>Explora <small>${n} de ${PUNTOS.length} descubiertos</small></h2>${cuerpo}`);
  }

  // ---------------------------------------------------------------- cada cuadro
  update(dt, t) {
    this.j.update(dt);
    for (const s of this.marcas || []) s.position.y = yPiso(s.userData.punto.piso) + 2.35 + Math.sin(t / 400 + s.position.x) * 0.08;
    const p = this.aerea.pos();
    if (!this.aerea.activa && !this.tuyo) {
      this.tCerca -= dt;
      if (this.tCerca <= 0) {
        this.tCerca = 0.2;
        const cerca = PUNTOS.find((q) => q.piso === p.piso && Math.hypot(q.x - p.x, q.z - p.z) < 3.2);
        if (cerca && cerca !== this.actual) this.#mostrarPunto(cerca);
      }
    }
    if (this.actual) { this.tActual -= dt; if (this.tActual <= 0) { this.actual = null; this.#pintar(); } }
    if (this.destino && !this.aerea.activa) {
      this.tRuta -= dt;
      if (this.tRuta <= 0) {
        this.tRuta = 0.5;
        if (!this.ultimaPos || Math.hypot(p.x - this.ultimaPos.x, p.z - this.ultimaPos.z) > 0.4) this.#calcularRuta();
        if (this.#cerca(this.destino)) { H.banner(`Llegaste a ${this.destino.id}`, 'ok', 'Pulsa E para sentarte.', 2200); this.b3d.ocultarRuta(); this.rutaPts = null; }
      }
    }
    this.app.minimapa.update(dt, { pos: p, rumbo: this.aerea.rumbo(), objetivo: this.destino, ruta: this.rutaPts });
    this.app.mapaJuego.update(dt, { pos: p.z > PLANO.z1 ? null : p });
    this.tHud -= dt;
    if (this.tHud <= 0) { this.tHud = 0.4; H.kpis(this.app); if (!this.actual) this.#pintar(); }
  }

  // ---------------------------------------------------------------- visor
  asientoVR() { return this.tuyo || null; }
  alSalirVR(pos) {
    if (this.tuyo) this.j.sentarEn(this.tuyo);
    else if (pos) this.j.iniciar({ ...pos, velocidad: 1.75, conservar: true });
  }
  textoA() {
    if (this.tuyo) return 'Levantarme';
    return this.destino && this.#cerca(this.destino) ? 'Sentarme' : 'Tablero y mapa';
  }
  accionA() {
    if (this.tuyo) { this.#levantarse(); return; }
    if (this.destino && this.#cerca(this.destino) && this.b.estadoDe(this.destino) === 'libre') { this.#sentarse(this.destino); return; }
    if (this.app.vr?.presentando) this.app.vr.mostrarTablero(); else this.abrirMapa();
  }
  botonesVR() { return [{ id: 'lb-hp', texto: 'Probar Hora punta', fn: () => this.app.irModo('horaPunta') }]; }
  lineasVR() {
    const p = this.actual;
    return p ? [p.titulo, ...p.texto.match(/.{1,60}(\s|$)/g).slice(0, 3).map((s) => s.trim())] : ['EXPLORA', `${this.descubiertos?.size || 0} de ${PUNTOS.length} puntos descubiertos`, 'Acércate a los círculos azules (i)'];
  }
}
