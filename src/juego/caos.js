// Experiencia CAOS: tú controlas la biblioteca. Haces que lleguen o se vayan personas, ocupas o
// liberas asientos con un clic, dejas mochilas, tumbas cámaras, cortas la red de una sala o evacúas.
// Nada se "pinta" directamente: cada acción pasa por los sensores de las puertas y por las cámaras
// de las mesas, así que el tótem, los colores, los indicadores y el registro reaccionan como en el sistema.
import { PLANO, yPiso } from '../biblioteca/plano.js';
import { ESCENARIOS } from '../biblioteca/simulador.js';
import { NOMBRE_ENTORNO } from '../biblioteca/agentes.js';
import { grafico, dispositivos, descargarTodo } from '../ui/admin.js';
import { escapar } from '../ui/hud.js';
import { describirObjeto } from './jugador.js';
import * as H from './hudJuego.js';

const PINCELES = {
  persona: { nombre: 'Sentar / levantar', tecla: '1', ayuda: 'Asiento libre: alguien viene a sentarse. Ocupado: esa persona se levanta y se va por la salida.' },
  mochila: { nombre: 'Mochila', tecla: '2', ayuda: 'Pone o quita una mochila. La cámara no distingue: la ve como asiento ocupado.' },
  mesa: { nombre: 'Mesa entera', tecla: '3', ayuda: 'Llena una mesa con 4 personas o la vacía por completo.' },
  camara: { nombre: 'Cámara', tecla: '4', ayuda: 'Tumba o restablece la ESP32-CAM de esa mesa: sin cámara, sus 4 asientos quedan «sin dato».' },
};

const RETOS = [
  { id: 'alta', texto: 'Provoca «Alta demanda»: 85 % de asientos ocupados', ok: (app) => app.biblio.ocupados() / app.biblio.total() >= 0.85 },
  { id: 'piso1', texto: 'Deja la Sala 1 sin asientos libres', ok: (app) => app.biblio.libres(1) === 0 },
  { id: 'fila', texto: 'Llena el aforo (381) hasta que se forme una fila afuera', ok: (app) => app.multitud.cola.length >= 3 },
  { id: 'camara', texto: 'Tumba una cámara y luego restablécela', ok: (app, c) => c.camaraRestablecida },
  { id: 'vaciar', texto: 'Evacúa la biblioteca hasta que no quede nadie', ok: (app) => app.biblio.puertas.dentro <= (app.biblio.asientos.some((a) => a.estudiante) ? 1 : 0) },
];

const VELOCIDADES = [1, 5, 20, 60];

export class Caos {
  constructor(app) {
    this.app = app;
    this.id = 'caos';
    this.titulo = 'Caos';
    this.escena = 'biblioteca';
    this.panel = true;
    this.pincel = 'persona';
    this.oyentes = [];
  }
  get b() { return this.app.biblio; }
  get m() { return this.app.multitud; }
  get sim() { return this.app.simBiblio; }
  get esc() { return this.app.escenas.biblioteca; }
  get b3d() { return this.app.escenas.biblioteca.b3d; }
  get j() { return this.app.jugador; }
  get son() { return this.app.sonido; }

  iniciar() {
    const app = this.app;
    app.reiniciarMundo('tranquila', { velocidad: 5 });
    this.#ajustarPaso();
    app.precalentar(4);
    this.primera = true;
    this.cumplidos = new Set();
    this.camaraCaida = false;
    this.camaraRestablecida = false;
    this.tRetos = 0;
    this.tHud = 0;
    this.caminando = false;
    this.ultimoEntorno = this.m.estadoEntorno;
    this.#vistaCasa(false);
    H.mostrar({ objetivo: true, kpis: false, minimapa: false, barraAcciones: true });
    H.alAccionObjetivo(null);
    this.#acciones();
    this.oyentes = [
      this.m.on('entorno', (e) => this.#alEntorno(e)),
      this.m.on('alerta', (a) => this.#alAlerta(a)),
      this.m.on('camaraVuelve', () => { if (this.camaraCaida) this.camaraRestablecida = true; }),
    ];
    this.j.describir = (h) => this.describir(h);
    this.j.alInteractuar = (h) => this.alClic(h);
    this.#pintarRetos();
    H.banner('Modo Caos', 'info', 'Tú mandas: haz clic en la biblioteca o usa el panel. Todo pasa por los sensores y las cámaras.', 5200);
  }

  detener() {
    for (const off of this.oyentes) off();
    this.oyentes = [];
    this.j.detener();
    this.j.describir = null; this.j.alInteractuar = null;
    this.m.factorVel = 1;
    this.esc.separarPisos(false);
    this.esc.restaurarVisibilidad();
    this.app.cursorInfo(null);
    H.mostrar({});
  }

  // los estudiantes caminan a paso ágil (2,4 m/s) sin importar la velocidad del reloj
  #ajustarPaso() {
    const v = Math.min(Math.max(this.sim.velocidad, 1), 3);
    this.m.factorVel = 1.8 / v;
  }

  #vistaCasa(animar = true) {
    this.caminando = false;
    this.j.detener();
    this.esc.restaurarVisibilidad(); this.esc.enfocarPiso(null); this.esc.separarPisos(true);
    this.b3d.ocultarRuta(); this.b3d.marcarDestino(null); this.b3d.avatar.visible = false;
    const v = this.esc.vistas().casa;
    this.app.control.usarOrbita({ pos: [24, 30, 38], obj: [-0.5, 5.5, 1], min: 6, max: 140, polarMax: Math.PI * 0.47, animar });
    H.mostrar({ objetivo: true, kpis: false, minimapa: false, barraAcciones: true });
    void v;
  }

  alternarCaminar() {
    if (this.caminando) { this.#vistaCasa(); }
    else {
      this.caminando = true;
      this.esc.separarPisos(false);
      this.app.cursorInfo(null);
      this.j.iniciar({ x: 0.5, z: 9.6, piso: 1, rumbo: 0.15, velocidad: 1.9 });
      H.mostrar({ mira: true, objetivo: true, minimapa: true, barraAcciones: true });
      H.banner('Entre la gente', 'info', 'Camina con W A S D. Apunta a un asiento o a una mesa y pulsa E para usar el pincel. V para volver.', 4200);
    }
    this.clavesAcciones = null;
    this.#acciones();
    this.app.actualizarPistas();
  }

  pistas() {
    if (this.caminando) return [['W A S D', 'caminar'], ['Shift', 'correr'], ['Clic', 'mirar'], ['E', 'usar pincel'], ['1 2 3 4', 'pincel'], ['V', 'vista de la casa']];
    return [['Clic', 'usar pincel'], ['Arrastrar', 'girar'], ['Rueda', 'acercar'], ['1 2 3 4', 'pincel'], ['I · O', 'llegan 10 · se van 10'], ['Espacio', 'pausa'], ['V', 'caminar entre la gente']];
  }

  teclas() {
    return {
      Digit1: () => this.fijarPincel('persona'),
      Digit2: () => this.fijarPincel('mochila'),
      Digit3: () => this.fijarPincel('mesa'),
      Digit4: () => this.fijarPincel('camara'),
      KeyV: () => this.alternarCaminar(),
      KeyI: () => this.accion('entra10'),
      KeyO: () => this.accion('salen10'),
      Space: () => this.accion('pausa'),
      Equal: () => this.accion('masRapido'),
      NumpadAdd: () => this.accion('masRapido'),
      Minus: () => this.accion('masLento'),
      NumpadSubtract: () => this.accion('masLento'),
    };
  }

  fijarPincel(p) {
    this.pincel = p;
    this.son.clic();
    this.app.hud.refrescarPestana();
    H.banner(`Pincel: ${PINCELES[p].nombre}`, 'info', PINCELES[p].ayuda, 2600);
  }

  #acciones() {
    const l = [
      { texto: 'Llegan 10', tecla: 'I', fn: () => this.accion('entra10') },
      { texto: 'Llegada masiva', fn: () => this.accion('masiva') },
      { texto: 'Se van 10', tecla: 'O', fn: () => this.accion('salen10') },
      { texto: 'Evacuar', fn: () => this.accion('evacuar') },
      { texto: this.caminando ? 'Vista de la casa' : 'Caminar entre la gente', tecla: 'V', fn: () => this.alternarCaminar() },
    ];
    const clave = l.map((a) => a.texto).join('|');
    if (clave !== this.clavesAcciones) { this.clavesAcciones = clave; H.acciones(l); }
  }

  // ---------------------------------------------------------------- acciones del panel y del teclado
  accion(a) {
    const m = this.m, sim = this.sim, b3d = this.b3d;
    const xP = (PLANO.puertas.entrada.x0 + PLANO.puertas.entrada.x1) / 2;
    this.son.clic();
    switch (a) {
      case 'entra1': m.entran(1); break;
      case 'entra10': m.entran(10, { escalonado: 0.3 }); b3d.flotante('+10 en camino', xP, 3.6, PLANO.z1 + 6, '#7dd3fc', { escala: 0.85, vida: 2.4 }); break;
      case 'grupo': m.grupo(6); break;
      case 'masiva': m.llegadaMasiva(60); break;
      case 'salen10': m.salen(10); break;
      case 'evacuar': m.evacuar(); this.son.alerta(); break;
      case 'reanudar': m.reanudar(); H.banner('Llegadas reanudadas', 'ok', 'Vuelven a llegar estudiantes según la hora del día.', 2600); break;
      case 'ocupar30': m.ocuparAzar(30); H.banner('30 asientos ocupados de golpe', 'info', 'Entran 30 personas (sensor S1) y se sientan: la cámara de cada mesa lo confirma.', 3200); break;
      case 'liberar30': m.salen(30); break;
      case 'mochilas': m.mochilas(8); H.banner('8 mochilas apartando sitios', 'alerta', 'Nadie está sentado, pero la cámara ve esos asientos ocupados (ámbar).', 3800); break;
      case 'quitarMochilas': { const n = m.quitarObjetos(); H.banner(`${n} mochilas retiradas`, 'ok', 'Esos asientos vuelven a estar libres.', 2600); break; }
      case 'falla': { const id = m.fallarCamara(); if (id) { this.camaraCaida = true; this.#enfocarMesa(id); } break; }
      case 'corte2': m.cortarSala(2); this.camaraCaida = true; break;
      case 'corte1': m.cortarSala(1); this.camaraCaida = true; break;
      case 'restablecer': if (m.camarasCaidas.size) { m.restablecerCamaras(); H.banner('Cámaras restablecidas', 'ok', 'Los asientos vuelven a mostrar su estado real.', 2800); } break;
      case 'pausa': sim.pausa = !sim.pausa; H.banner(sim.pausa ? 'Reloj en pausa' : 'Reloj en marcha', 'info', sim.pausa ? 'Las personas terminan lo que estaban haciendo, pero no llega nadie nuevo.' : '', 2000); break;
      case 'masRapido': case 'masLento': {
        const i = VELOCIDADES.indexOf(sim.velocidad);
        const j = Math.max(0, Math.min(VELOCIDADES.length - 1, (i < 0 ? 1 : i) + (a === 'masRapido' ? 1 : -1)));
        sim.velocidad = VELOCIDADES[j]; sim.pausa = false; this.#ajustarPaso();
        H.banner(`Reloj × ${sim.velocidad}`, 'info', '', 1400);
        break;
      }
      case 'azar': m.aleatorios = !m.aleatorios; break;
      default: break;
    }
    this.app.hud.refrescarPestana();
  }

  #enfocarMesa(id) {
    const mesa = PLANO.mesas.find((x) => x.id === id);
    if (!mesa || this.caminando) return;
    const y = yPiso(mesa.piso) + (mesa.piso === 2 ? this.b3d.explosion : 0);
    this.app.control.irA([mesa.x + 6, y + 9, mesa.z + 9], [mesa.x, y, mesa.z], 1.2);
  }

  // ---------------------------------------------------------------- clic sobre la biblioteca
  describir(h) {
    const info = describirObjeto(this.app, h);
    if (!info) return null;
    const p = this.pincel;
    if (h.tipo === 'asiento') {
      const a = info.a;
      if (a.piloto && this.b.pilotoReal) { info.accion = 'Dato real: se cambia en la maqueta'; return info; }
      const e = info.estado;
      if (p === 'persona') info.accion = e === 'libre' ? (this.m.reservas.has(a.id) ? 'Ya viene alguien' : 'Clic · que alguien se siente') : e === 'ocupado' ? 'Clic · que se levante y se vaya' : e === 'objeto' ? 'Clic · quitar la mochila' : e === 'tuyo' ? '' : 'Sin cámara: usa el pincel Cámara';
      else if (p === 'mochila') info.accion = e === 'libre' ? 'Clic · dejar una mochila' : e === 'objeto' ? 'Clic · quitar la mochila' : '';
      else if (p === 'mesa') info.accion = `Clic · ${this.#libresMesa(a.mesa) ? 'llenar' : 'vaciar'} la mesa ${a.mesa}`;
      else if (p === 'camara') info.accion = `Clic · ${this.m.camarasCaidas.has(a.mesa) ? 'restablecer' : 'tumbar'} la cámara de la mesa ${a.mesa}`;
      if (this.caminando && info.accion?.startsWith('Clic')) info.accion = info.accion.replace('Clic', 'E');
    } else if (h.tipo === 'mesa' || h.tipo === 'camara') {
      info.accion = p === 'camara' || h.tipo === 'camara' ? `${this.caminando ? 'E' : 'Clic'} · ${this.m.camarasCaidas.has(h.id) ? 'restablecer' : 'tumbar'} su cámara` : `${this.caminando ? 'E' : 'Clic'} · ${this.#libresMesa(h.id) ? 'llenar' : 'vaciar'} la mesa`;
    } else if (h.tipo === 'puerta') info.accion = h.id === 'entrada' ? `${this.caminando ? 'E' : 'Clic'} · que lleguen 5 personas` : `${this.caminando ? 'E' : 'Clic'} · que se vayan 5`;
    return info;
  }

  #libresMesa(mesaId) { return this.b.asientos.filter((a) => a.mesa === mesaId && this.b.estadoDe(a) === 'libre').length; }

  alClic(h) {
    if (!h) return;
    const m = this.m, b = this.b, b3d = this.b3d;
    const flot = (txt, a, color) => b3d.flotante(txt, a.x, yPiso(a.piso) + (a.piso === 2 ? b3d.explosion : 0) + 1.6, a.z, color, { escala: 0.75 });
    if (h.tipo === 'puerta') {
      if (h.id === 'entrada') { m.entran(5, { escalonado: 0.35 }); H.banner('Llegan 5 personas', 'info', 'Míralas cruzar la puerta: el sensor S1 suma una por una.', 2400); }
      else { m.salen(5); H.banner('Se van 5 personas', 'info', 'Al cruzar la salida, el sensor S2 resta una por una.', 2400); }
      this.son.clic();
      return;
    }
    if (h.tipo === 'estudiante' || h.tipo === 'totem') { const i = describirObjeto(this.app, h); H.banner(i.titulo, 'info', i.detalle || '', 2800); return; }
    const mesaId = h.tipo === 'asiento' ? b.get(h.id).mesa : h.id;
    if (h.tipo === 'camara' || this.pincel === 'camara') { this.#alternarCamara(mesaId); return; }
    if (h.tipo === 'mesa' || this.pincel === 'mesa') {
      const mesa = PLANO.mesas.find((x) => x.id === mesaId);
      if (mesa.asientos[0].piloto && b.pilotoReal) { this.#avisoReal(); return; }
      if (this.#libresMesa(mesaId)) { const n = m.ocuparMesa(mesaId); flot(n ? `+${n} vienen` : 'mesa reservada', mesa, '#fca5a5'); }
      else { const n = m.liberarMesa(mesaId); flot(n ? `−${n} se van` : 'nada que vaciar', mesa, '#86efac'); }
      this.son.clic();
      return;
    }
    // un asiento
    const a = b.get(h.id);
    if (a.piloto && b.pilotoReal) { this.#avisoReal(); return; }
    if (a.estudiante) return;
    const e = b.estadoDe(a);
    if (this.pincel === 'mochila') {
      if (e === 'libre' && m.ponerObjeto(a.id)) { flot('mochila', a, '#fcd34d'); this.son.asiento(true); }
      else if (e === 'objeto' && m.quitarObjeto(a.id)) { flot('libre', a, '#86efac'); this.son.asiento(false); }
      else this.son.error();
      return;
    }
    if (e === 'sinDato') { H.banner(`Asiento ${a.id} sin dato`, 'alerta', `La cámara de la mesa ${a.mesa} no envía señal. Usa el pincel Cámara (tecla 4) para restablecerla.`, 3200); this.son.error(); return; }
    if (e === 'objeto') { m.quitarObjeto(a.id); flot('libre', a, '#86efac'); this.son.asiento(false); return; }
    const r = m.alternarAsiento(a.id);
    if (r === 'ocupa') { flot('alguien viene', a, '#fca5a5'); this.son.seleccion(); }
    else if (r === 'libera') { flot('se levanta', a, '#86efac'); this.son.clic(); }
    else if (r === 'yaViene') H.banner(`Ya viene alguien al asiento ${a.id}`, 'info', '', 1800);
    else this.son.error();
  }

  #alternarCamara(mesaId) {
    const mesa = PLANO.mesas.find((x) => x.id === mesaId);
    if (mesa.asientos[0].piloto && this.b.pilotoReal) { this.#avisoReal(); return; }
    if (this.m.camarasCaidas.has(mesaId)) { this.m.restablecerCamara(mesaId); this.son.exito(); H.banner(`Cámara de la mesa ${mesaId} restablecida`, 'ok', 'Sus 4 asientos vuelven a mostrar si están libres u ocupados.', 2800); }
    else if (this.m.fallarCamara(mesaId)) this.camaraCaida = true;
  }

  #avisoReal() { this.son.error(); H.banner('Mesa piloto con datos reales', 'alerta', 'Sus asientos vienen de la maqueta: se cambian sentando siluetas en la maqueta física.', 3600); }

  // ---------------------------------------------------------------- reacciones del sistema
  #alEntorno({ estado }) {
    const T = {
      altaDemanda: ['ALTA DEMANDA', 'alerta', '85 % de los asientos ocupados: el tótem lo anuncia y encontrar sitio se vuelve difícil.'],
      sinAsientos: ['SIN ASIENTOS LIBRES', 'alerta', 'Todavía hay aforo, pero los que entran esperan de pie en el vestíbulo: el problema que resuelve la cámara.'],
      aforoCompleto: ['AFORO COMPLETO · 381 personas', 'alerta', 'La entrada se bloquea: los que llegan hacen fila afuera hasta que alguien salga.'],
      incidente: ['INCIDENTE: cámara sin señal', 'alerta', 'Sus asientos pasan a gris «sin dato»: el sistema no sabe si están libres.'],
      normal: ['Situación normal', 'ok', 'Hay asientos libres y aforo disponible.'],
    }[estado];
    if (!T) return;
    if (estado !== 'normal') this.son.alerta(); else this.son.seleccion();
    H.banner(T[0], T[1], T[2], 4600);
    this.ultimoEntorno = estado;
  }

  #alAlerta(a) {
    if (a.tipo === 'real') { H.banner('Mesa piloto con datos reales', 'alerta', a.texto, 3600); this.son.error(); }
    else if (a.tipo === 'masiva') H.banner('¡Llegada masiva!', 'alerta', a.texto + ' Míralas entrar: el contador sube con cada una.', 3600);
    else if (a.tipo === 'evacuacion') H.banner('EVACUACIÓN', 'alerta', 'Todos se levantan y salen por la puerta de salida: el sensor S2 los va descontando.', 4800);
    else if (a.tipo === 'camara' && this.m.estadoEntorno === 'incidente' && this.ultimoEntorno === 'incidente') H.banner('Otra cámara sin señal', 'alerta', a.texto, 2800);
  }

  // ---------------------------------------------------------------- retos
  #pintarRetos() {
    const hechos = this.cumplidos.size;
    const items = RETOS.map((r) => `<li class="${this.cumplidos.has(r.id) ? 'ok' : ''}">${r.texto}</li>`).join('');
    const e = this.m.estadoEntorno;
    H.objetivo(`<h2>Modo Caos <small>${hechos} de ${RETOS.length} retos</small></h2>
      <p>Lleva la biblioteca al límite y mira cómo reacciona el sistema.</p>
      <ul class="condiciones">${items}</ul>
      <div class="metricas"><span>Estado <b class="entorno-txt ${e}">${NOMBRE_ENTORNO[e]}</b></span></div>`);
  }

  #revisarRetos() {
    for (const r of RETOS) {
      if (this.cumplidos.has(r.id)) continue;
      if (r.ok(this.app, this)) {
        this.cumplidos.add(r.id);
        this.son.exito();
        H.banner('¡Reto cumplido!', 'ok', r.texto + (this.cumplidos.size === RETOS.length ? ' · ¡Completaste todos los retos del Caos!' : ''), 4200);
      }
    }
    this.#pintarRetos();
  }

  // ---------------------------------------------------------------- cada cuadro
  update(dt) {
    if (this.caminando) {
      this.j.update(dt);
      this.app.minimapa.update(dt, { pos: this.j.pos, rumbo: this.j.rumbo });
    }
    this.tRetos -= dt;
    if (this.tRetos <= 0) { this.tRetos = 0.5; this.#revisarRetos(); }
    this.tHud -= dt;
    if (this.tHud <= 0) { this.tHud = 0.3; this.#acciones(); }
  }

  // ---------------------------------------------------------------- panel de control
  proveedor() {
    const app = this.app, b = this.b, m = this.m, sim = this.sim;
    let ultimoEvento = -1, tGrafico = 0;
    const v = (r, k) => r.querySelector(`[data-v="${k}"]`);
    return {
      ancho: true,
      pestanas: {
        control: {
          titulo: 'Panel de control',
          html: () => `
            <div class="control-caos">
              <div class="tarjeta">
                <h3>La biblioteca ahora <small data-v="hora"></small></h3>
                <div class="kpis-caos">
                  <div><span>Personas dentro <em>sensores de las puertas</em></span><b><span data-v="dentro"></span><small> / ${PLANO.aforo}</small></b><div class="barra-caos"><i data-v="bDentro"></i></div></div>
                  <div><span>Asientos ocupados <em>cámaras de las mesas</em></span><b><span data-v="ocupados"></span><small> / ${b.total()}</small></b><div class="barra-caos rojo"><i data-v="bOcup"></i></div></div>
                </div>
                <div class="fila-datos"><span>Libres piso 1 <b data-v="l1"></b></span><span>Libres piso 2 <b data-v="l2"></b></span><span>Caminando <b data-v="cam"></b></span><span>En la fila <b data-v="cola"></b></span><span>Cámaras caídas <b data-v="caidas"></b></span></div>
                <div class="entorno-chip" data-v="entorno"></div>
              </div>
              <div class="tarjeta">
                <h3>Personas <small>entran por S1 y salen por S2</small></h3>
                <div class="acciones">
                  <button data-a="entra1"><span>🚶 Llega 1</span></button>
                  <button data-a="entra10"><span>👥 Llegan 10</span><kbd>I</kbd></button>
                  <button data-a="grupo"><span>🧑‍🤝‍🧑 Grupo de 6</span></button>
                  <button data-a="masiva"><span>🌊 Llegada masiva (60)</span></button>
                  <button data-a="salen10"><span>🚪 Se van 10</span><kbd>O</kbd></button>
                  <button data-a="evacuar"><span>🚨 Evacuar</span></button>
                  <button data-a="reanudar" class="ancho" data-v="reanudar"><span>▶ Reanudar las llegadas</span></button>
                </div>
              </div>
              <div class="tarjeta">
                <h3>Asientos <small>haz clic sobre la biblioteca</small></h3>
                <div class="pincel">${Object.entries(PINCELES).map(([k, p]) => `<button data-pincel="${k}" aria-pressed="${k === this.pincel}">${p.nombre} <kbd>${p.tecla}</kbd></button>`).join('')}</div>
                <p class="mini" style="margin:6px 0 8px">${PINCELES[this.pincel].ayuda}</p>
                <div class="acciones">
                  <button data-a="ocupar30"><span>Ocupar 30 de golpe</span></button>
                  <button data-a="liberar30"><span>Que se vayan 30</span></button>
                  <button data-a="mochilas"><span>🎒 Mochilas × 8</span></button>
                  <button data-a="quitarMochilas"><span>Quitar mochilas</span></button>
                </div>
              </div>
              <div class="tarjeta">
                <h3>Cámaras y red</h3>
                <div class="acciones">
                  <button data-a="falla"><span>📷 Falla una cámara</span></button>
                  <button data-a="corte2"><span>✂ Corte de red · Sala 2</span></button>
                  <button data-a="corte1"><span>✂ Corte de red · Sala 1</span></button>
                  <button data-a="restablecer"><span>🔧 Restablecer todas</span></button>
                </div>
              </div>
              <div class="tarjeta">
                <h3>Reloj y escenario</h3>
                <div class="reloj-caos"><b data-v="reloj"></b><div class="fila">${VELOCIDADES.map((x) => `<button data-vel="${x}">× ${x}</button>`).join('')}<button data-a="pausa">Pausa <kbd>Espacio</kbd></button></div></div>
                <div class="fila" style="margin-top:8px">${Object.entries(ESCENARIOS).map(([k, e]) => `<button data-esc="${k}">${e.nombre}</button>`).join('')}</div>
                <label class="interruptor" style="margin-top:6px">Eventos al azar (grupos, mochilas, fallas) <input type="checkbox" data-v="azar" ${m.aleatorios ? 'checked' : ''}></label>
              </div>
              <div class="tarjeta">
                <h3>Hoy <small>las puertas y las cámaras miden cosas distintas</small></h3>
                <svg class="grafico-dia" data-v="grafico" viewBox="0 0 640 260" role="img" aria-label="Gráfico del día"></svg>
                <div class="leyenda"><span><i style="background:#38bdf8"></i>Personas dentro (puertas)</span><span><i style="background:#ef4444"></i>Asientos ocupados (cámaras)</span></div>
              </div>
              <div class="tarjeta">
                <h3>Dispositivos <small>qué es real y qué es simulado</small></h3>
                <ul class="disp" data-v="disp"></ul>
                <div class="piloto-puerta" data-v="puertaPiloto"></div>
                <div class="fila" style="margin-top:8px"><button data-a="conectar">Conectar sensores</button><button data-a="descargar">Descargar registro</button></div>
              </div>
              <div class="tarjeta"><h3>Registro del sistema</h3><ul class="eventos" data-v="eventos"></ul></div>
              <p class="mini">Todo lo de este modo es simulado. Con datos reales conectados, la mesa piloto 1-01 sigue a la maqueta y no se puede cambiar desde aquí.</p>
            </div>`,
          montar: (r) => {
            ultimoEvento = -1; tGrafico = 0;
            r.addEventListener('click', (e) => {
              const t = e.target.closest('button'); if (!t) return;
              const d = t.dataset;
              if (d.pincel) { this.fijarPincel(d.pincel); return; }
              if (d.vel) { sim.velocidad = Number(d.vel); sim.pausa = false; this.#ajustarPaso(); this.son.clic(); app.hud.refrescarPestana(); return; }
              if (d.esc) {
                app.reiniciarMundo(d.esc, { velocidad: sim.velocidad, aleatorios: m.aleatorios });
                this.#ajustarPaso();
                app.precalentar(3);
                H.banner(`Escenario: ${ESCENARIOS[d.esc].nombre}`, 'info', `${b.hora()} · ${b.puertas.dentro} personas dentro · ${b.libres()} asientos libres`, 3200);
                app.hud.refrescarPestana();
                return;
              }
              if (d.a === 'conectar') { app.dialogoConectar(); return; }
              if (d.a === 'descargar') { descargarTodo(app); return; }
              if (d.a) this.accion(d.a);
            });
            v(r, 'azar').addEventListener('change', (e) => { m.aleatorios = e.target.checked; });
          },
          actualizar: (r) => {
            const d = b.puertas.dentro, oc = b.ocupados();
            const rs = m.resumen();
            v(r, 'dentro').textContent = d;
            v(r, 'ocupados').textContent = oc;
            v(r, 'bDentro').style.width = `${Math.min(100, d / PLANO.aforo * 100)}%`;
            v(r, 'bOcup').style.width = `${oc / b.total() * 100}%`;
            v(r, 'l1').textContent = b.libres(1);
            v(r, 'l2').textContent = b.libres(2);
            v(r, 'cam').textContent = rs.caminando;
            v(r, 'cola').textContent = rs.cola;
            v(r, 'caidas').textContent = rs.camarasCaidas;
            const chip = v(r, 'entorno');
            const txt = NOMBRE_ENTORNO[rs.entorno];
            if (chip.textContent !== txt) { chip.textContent = txt; chip.className = `entorno-chip ${rs.entorno}`; }
            v(r, 'hora').textContent = `${b.hora()}${sim.pausa ? ' · en pausa' : ` · reloj × ${sim.velocidad}`}`;
            v(r, 'reloj').textContent = b.hora();
            v(r, 'reanudar').hidden = !m.llegadasPausadas;
            r.querySelectorAll('[data-vel]').forEach((x) => x.setAttribute('aria-pressed', String(!sim.pausa && Number(x.dataset.vel) === sim.velocidad)));
            r.querySelector('[data-a="pausa"]').setAttribute('aria-pressed', String(sim.pausa));
            r.querySelectorAll('[data-esc]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.esc === sim.escenario)));
            tGrafico -= 0.12;
            if (tGrafico <= 0) { tGrafico = 1; grafico(v(r, 'grafico'), b); dispositivos(v(r, 'disp'), v(r, 'puertaPiloto'), app); }
            const evs = b.eventos;
            if (evs.length && evs[evs.length - 1].t !== ultimoEvento) {
              ultimoEvento = evs[evs.length - 1].t;
              v(r, 'eventos').innerHTML = evs.slice(-60).reverse().map((ev) => `<li><time>${b.hora(ev.min)}</time><span>${escapar(ev.texto)}</span></li>`).join('');
            }
          },
        },
      },
    };
  }

  // ---------------------------------------------------------------- visor
  alEntrarVR() { this.esc.separarPisos(false); this.app.cursorInfo(null); }
  inicioVR() { return { x: 0.5, z: 9.6, piso: 1, rumbo: 0 }; }
  alSalirVR(pos) {
    if (this.caminando && pos) this.j.iniciar({ ...pos, velocidad: 1.9, conservar: true });
    else this.#vistaCasa(false);
  }
  textoA() { return 'Llegan 10'; }
  accionA() { this.accion('entra10'); }
  lineasVR() {
    const b = this.b;
    return [`CAOS · ${b.hora()} · ${NOMBRE_ENTORNO[this.m.estadoEntorno]}`, `Dentro ${b.puertas.dentro}/${PLANO.aforo} · ocupados ${b.ocupados()}/${b.total()}`, `Pincel: ${PINCELES[this.pincel].nombre} · gatillo sobre un asiento`];
  }
  botonesVR() {
    return [
      { id: 'c-masiva', texto: 'Masiva', fn: () => this.accion('masiva') },
      { id: 'c-salen', texto: 'Se van 10', fn: () => this.accion('salen10') },
      { id: 'c-evac', texto: 'Evacuar', fn: () => this.accion('evacuar') },
      { id: 'c-pincel', texto: `Pincel: ${PINCELES[this.pincel].nombre}`, fn: () => { const k = Object.keys(PINCELES); this.fijarPincel(k[(k.indexOf(this.pincel) + 1) % k.length]); } },
    ];
  }
}
