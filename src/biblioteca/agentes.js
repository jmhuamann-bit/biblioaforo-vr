// Motor de la multitud: estudiantes virtuales que llegan, cruzan los sensores de las puertas,
// caminan a su asiento (subiendo la escalera si hace falta), se sientan, estudian y se van.
// Lo que hacen pasa por los mismos indicadores del sistema:
//   cruzar la puerta → sensor S1/S2 → personas dentro · sentarse → cámara de la mesa (0,9 s) → asiento ocupado
import { Emisor } from '../datos/estado.js';
import { PLANO, rutaLlegada, rutaSalida, rutaInterior, ESPERA, ESTANTES_FRENTE, puestoCola, yPiso, campoRuta, accesoAsiento, campoDistancias } from './plano.js';

const CONFIRMACION_S = 0.9;              // 3 lecturas × 300 ms de la ESP32-CAM
const MAX_CAMINANTES = 110;
const azarEntre = (a, b) => a + Math.random() * (b - a);
const poisson = (l) => { if (l <= 0) return 0; if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss())); const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; };
function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

let siguienteId = 1;

export class Multitud extends Emisor {
  constructor({ estado, sim }) {
    super();
    this.estado = estado;
    this.sim = sim;
    this.agentes = [];                    // los que caminan o esperan (los sentados son instancias del 3D)
    this.ocupantes = new Map();           // asiento → { hasta (min del día), objeto }
    this.reservas = new Map();            // asiento → agente que va hacia él
    this.verdad = new Map();              // ocupación real aunque la cámara esté caída
    this.camarasCaidas = new Set();       // mesas sin señal
    this.cola = [];
    this.llegadasPausadas = false;
    this.aleatorios = true;               // eventos al azar
    this.objetivoJugador = null;          // asiento elegido por el jugador (para los rivales)
    this.probRival = 0;                   // en hora punta, a veces alguien va a tu asiento
    this.rival = null;
    this.estadoEntorno = 'normal';
    this.tEvento = 40;
    this.pendientes = [];                 // llegadas escalonadas (llegada masiva, grupos)
    this.factorVel = 1;
    this.fallasAzar = true;               // entre los eventos al azar, fallas de cámara
  }

  get caminantes() { return this.agentes.filter((a) => a.visible); }

  // ------------------------------------------------------------ sincronizar con el estado inicial del día
  sincronizar() {
    this.agentes = []; this.ocupantes.clear(); this.reservas.clear(); this.cola = []; this.pendientes = [];
    this.rival = null;
    const min = this.estado.minuto;
    for (const a of this.estado.asientos) {
      this.verdad.set(a.id, { ocupado: a.ocupado, objeto: a.objeto });
      if (a.ocupado && !a.estudiante && !(a.piloto && this.estado.pilotoReal)) {
        this.ocupantes.set(a.id, { hasta: min + (a.objeto ? azarEntre(5, 30) : -Math.log(1 - Math.random()) * this.sim.estancia * 0.8 + 0.4), objeto: a.objeto });
      }
    }
    // precálculo de las rutas (evita un tirón con la primera llegada)
    for (const n of ['entrada', 'salida', 'escalera1', 'escalera2']) campoRuta(n);
    // los que están dentro pero no sentados (de pie, en los estantes): también son personas que
    // cruzaron la puerta, así que existen como figuras y se irán por la salida
    const deMas = Math.min(45, this.estado.puertas.dentro - this.estado.sentados());
    for (let i = 0; i < deMas; i++) {
      const estante = Math.random() < 0.7;
      const lista = estante ? ESTANTES_FRENTE : ESPERA;
      const p = lista[Math.floor(Math.random() * lista.length)];
      const y = yPiso(p.piso);
      const ag = this.#nuevo({ x: p.x + azarEntre(-0.6, 0.6), y, z: p.z + azarEntre(-0.4, 0.4), piso: p.piso, dentro: true, destino: estante ? 'estante' : 'espera', estado: 'caminando', t: -azarEntre(0, 40) });
      const r = estante ? (p.x < -20 ? -Math.PI / 2 : Math.PI) : Math.random() * Math.PI * 2;   // mirando el estante
      this.#seguir(ag, [{ x: ag.x, y, z: ag.z }, { x: ag.x + Math.sin(r) * 0.02, y, z: ag.z + Math.cos(r) * 0.02 }]);
      ag.rumbo = r;
    }
    this.#evaluarEntorno(true);
  }

  // ------------------------------------------------------------ elegir asiento (como lo haría un estudiante)
  #asientoDisponible(a) {
    if (a.ocupado || a.sinDato || this.reservas.has(a.id)) return false;
    if (a.piloto && this.estado.pilotoReal) return false;
    return true;
  }

  elegirAsiento({ grupo = 0, preferir = null } = {}) {
    if (preferir) { const p = this.estado.get(preferir); if (p && this.#asientoDisponible(p)) return p; }
    const libres = this.estado.asientos.filter((a) => this.#asientoDisponible(a));
    if (!libres.length) return null;
    let total = 0;
    const pesos = libres.map((a) => {
      let w = 1;
      if (a.ventana) w *= 1.5;
      if (a.zona === 'silencio') w *= 1.25;
      if (a.enchufe) w *= 1.2;
      const vecinos = this.estado.asientos.filter((x) => x.mesa === a.mesa && x.ocupado).length;
      w *= [1.4, 1, 0.85, 0.7][vecinos] ?? 0.6;
      if (a.piso === 1) w *= 1.25;                       // muchos se quedan en el primer piso
      total += w;
      return w;
    });
    let r = Math.random() * total;
    for (let i = 0; i < libres.length; i++) { r -= pesos[i]; if (r <= 0) return libres[i]; }
    return libres[libres.length - 1];
  }

  // Mesa con n asientos libres juntos (para un grupo)
  #mesaParaGrupo(n) {
    const porMesa = new Map();
    for (const a of this.estado.asientos) if (this.#asientoDisponible(a)) { if (!porMesa.has(a.mesa)) porMesa.set(a.mesa, []); porMesa.get(a.mesa).push(a); }
    const opciones = [...porMesa.values()].filter((l) => l.length >= n);
    return opciones.length ? opciones[Math.floor(Math.random() * opciones.length)] : null;
  }

  // ------------------------------------------------------------ crear estudiantes
  #nuevo(extra = {}) {
    const ag = {
      id: siguienteId++, estado: 'afuera', visible: true, pts: null, largos: null, d: 0, total: 0,
      vel: 1.35 * azarEntre(0.85, 1.15), x: 0, y: 0, z: 0, rumbo: Math.PI, fase: Math.random() * 6, t: 0,
      asiento: null, destino: null, color: Math.floor(Math.random() * 10), piso: 1, dentro: false, ...extra,
    };
    this.agentes.push(ag);
    return ag;
  }

  #seguir(ag, pts) {
    ag.pts = pts;
    ag.largos = [0];
    for (let i = 1; i < pts.length; i++) ag.largos.push(ag.largos[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z));
    ag.total = ag.largos[ag.largos.length - 1];
    ag.d = 0;
  }

  // Llega un estudiante desde la plaza
  // forzar: va sí o sí al asiento preferido (acciones del usuario)
  llegar({ preferir = null, grupoAsiento = null, retraso = 0, rival = false, forzar = false } = {}) {
    const visibles = this.agentes.filter((a) => a.visible).length;
    // sin espacio para más figuras: entra "directo" (cuenta y se sienta), sin animación
    if (visibles >= MAX_CAMINANTES && !rival && !forzar) return this.#llegadaDirecta();
    const xP = (PLANO.puertas.entrada.x0 + PLANO.puertas.entrada.x1) / 2;
    const ag = this.#nuevo({ x: xP + azarEntre(-5, 5), z: PLANO.z1 + azarEntre(14, 22), retraso });
    ag.y = 0;
    if (this.#aforoLleno()) { this.#aCola(ag); return ag; }
    this.#asignarDestino(ag, { preferir, grupoAsiento, rival, forzar });
    return ag;
  }

  #asignarDestino(ag, { preferir = null, grupoAsiento = null, rival = false, forzar = false } = {}) {
    let asiento = grupoAsiento || this.elegirAsiento({ preferir });
    ag.rival = rival && asiento && asiento.id === this.objetivoJugador;
    if (asiento && (forzar || grupoAsiento || Math.random() > 0.08)) {
      ag.asiento = asiento.id; ag.destino = 'asiento';
      this.reservas.set(asiento.id, ag);
      this.#seguir(ag, [{ x: ag.x, y: 0, z: ag.z }, ...rutaLlegada(null, asiento)]);
    } else if (!asiento && Math.random() < 0.85) {
      // no hay asiento: espera de pie en el vestíbulo y vuelve a intentar
      const p = ESPERA[Math.floor(Math.random() * ESPERA.length)];
      ag.destino = 'espera';
      this.#seguir(ag, [{ x: ag.x, y: 0, z: ag.z }, ...rutaLlegada({ x: p.x + azarEntre(-0.8, 0.8), z: p.z + azarEntre(-0.6, 0.6), piso: 1 })]);
    } else {
      // viene a buscar libros
      const p = ESTANTES_FRENTE[Math.floor(Math.random() * ESTANTES_FRENTE.length)];
      ag.destino = 'estante';
      this.#seguir(ag, [{ x: ag.x, y: 0, z: ag.z }, ...rutaLlegada({ ...p })]);
    }
    ag.estado = 'caminando';
    if (ag.rival) { this.rival = ag; this.emit('rival', ag); }
  }

  #llegadaDirecta() {
    if (this.#aforoLleno()) return null;
    const a = this.elegirAsiento();
    if (a) this.#sentarSinAnimacion(a.id, true);     // sin asiento libre no entra (si no, quedaría "dentro" sin figura)
    return null;
  }

  #aforoLleno() { return this.estado.puertas.dentro >= PLANO.aforo; }

  #aCola(ag) {
    ag.estado = 'cola';
    ag.destino = 'cola';
    this.cola.push(ag);
    const p = puestoCola(this.cola.length - 1);
    this.#seguir(ag, [{ x: ag.x, y: 0, z: ag.z }, p]);
    if (this.cola.length === 1) this.emit('alerta', { tipo: 'aforo', texto: 'Aforo completo: la entrada se bloquea y se forma una fila afuera.' });
  }

  // ------------------------------------------------------------ acciones del usuario y eventos
  entran(n = 10, { escalonado = 0.35 } = {}) {
    this.llegadasPausadas = false;
    for (let i = 0; i < n; i++) this.pendientes.push({ en: i * escalonado, llegada: true, fn: () => this.llegar() });
    this.estado.log('entrada', `Llegan ${n} personas`);
  }
  llegadaMasiva(n = 50) {
    this.llegadasPausadas = false;
    for (let i = 0; i < n; i++) this.pendientes.push({ en: i * 0.12 + Math.random() * 0.3, llegada: true, fn: () => this.llegar() });
    this.estado.log('entrada', `Llegada masiva: ${n} personas a la vez`);
    this.emit('alerta', { tipo: 'masiva', texto: `Llegada masiva: ${n} personas en la puerta.` });
  }
  grupo(n = 6) {
    this.llegadasPausadas = false;
    const mesa = this.#mesaParaGrupo(Math.min(4, n));
    for (let i = 0; i < n; i++) {
      const asiento = mesa && i < mesa.length ? mesa[i] : null;
      this.pendientes.push({ en: i * 0.4, llegada: true, fn: () => this.llegar({ grupoAsiento: asiento }) });
    }
    this.estado.log('entrada', mesa ? `Llega un grupo de ${n}: van a la mesa ${mesa[0].mesa}` : `Llega un grupo de ${n}: no hay una mesa con ${Math.min(4, n)} libres`);
  }
  salen(n = 10) {
    const sentados = [...this.ocupantes.keys()].filter((id) => !this.ocupantes.get(id).objeto);
    let k = 0;
    for (let i = 0; i < n && sentados.length; i++) {
      const id = sentados.splice(Math.floor(Math.random() * sentados.length), 1)[0];
      this.pendientes.push({ en: k * 0.3, fn: () => this.levantarDe(id) });
      k++;
    }
    const dePie = this.agentes.filter((a) => a.dentro && (a.destino === 'espera' || a.destino === 'estante') && a.estado !== 'saliendo');
    for (let i = k; i < n && dePie.length; i++) this.#salir(dePie.shift());
    this.estado.log('salida', `Se van ${n} personas`);
  }
  evacuar() {
    this.llegadasPausadas = true;
    this.pendientes = this.pendientes.filter((p) => !p.llegada);
    for (const id of [...this.ocupantes.keys()]) this.pendientes.push({ en: Math.random() * 4, fn: () => this.levantarDe(id, true) });
    for (const ag of [...this.agentes]) {
      if (ag.dentro && ag.estado !== 'saliendo' && ag.estado !== 'levantandose') this.#salir(ag);
      else if (!ag.dentro && ag.estado === 'caminando') this.#volverAPlaza(ag);     // los que venían se dan la vuelta
    }
    for (const ag of this.cola) this.#volverAPlaza(ag);
    this.cola = [];
    this.estado.log('salida', 'Evacuación: todos salen por la puerta de salida');
    this.emit('alerta', { tipo: 'evacuacion', texto: 'Evacuación: todos se dirigen a la salida.' });
  }
  reanudar() { this.llegadasPausadas = false; }

  #volverAPlaza(ag) {
    if (ag.asiento && this.reservas.get(ag.asiento) === ag) this.reservas.delete(ag.asiento);
    ag.estado = 'saliendo'; ag.destino = 'salida'; ag.asiento = null; ag.visible = true;
    if (this.rival === ag) this.rival = null;
    this.#seguir(ag, [{ x: ag.x, y: 0, z: ag.z }, { x: ag.x + azarEntre(-4, 4), y: 0, z: PLANO.z1 + azarEntre(16, 24) }]);
  }

  // Quien está sentado en ese asiento se levanta (0,9 s) y se va por la salida
  levantarDe(id, todo = false) {
    const o = this.ocupantes.get(id);
    if (o) { if (o.objeto && !todo) return false; this.#levantar(id, o, { sinObjeto: todo }); return true; }
    const a = this.estado.get(id);
    if (a?.ocupado && !a.estudiante && !(a.piloto && this.estado.pilotoReal)) { this.#fijar(id, false); return true; }
    return false;
  }

  // Alguien va a sentarse en ese asiento: primero quien ya espera adentro; si no, uno que llega
  enviarA(id) {
    const s = this.estado.get(id);
    if (!s || !this.#asientoDisponible(s)) return null;
    let mejor = null, dMin = Infinity;
    for (const ag of this.agentes) {
      if (!ag.visible || !ag.dentro || ag.estado === 'saliendo' || !['espera', 'estante'].includes(ag.destino)) continue;
      if (Math.abs(ag.y - yPiso(ag.piso)) > 0.2) continue;
      const d = Math.hypot(ag.x - s.x, ag.z - s.z) + (ag.piso !== s.piso ? 25 : 0);
      if (d < dMin) { dMin = d; mejor = ag; }
    }
    if (mejor && dMin < 40) {
      mejor.asiento = s.id; mejor.destino = 'asiento'; mejor.estado = 'caminando'; mejor.t = 0;
      this.reservas.set(s.id, mejor);
      this.#seguir(mejor, rutaInterior({ x: mejor.x, z: mejor.z, piso: mejor.piso }, { x: s.x, z: s.z, piso: s.piso }, s));
      return mejor;
    }
    return this.llegar({ preferir: id, forzar: true });
  }

  // Clic sobre un asiento (modo caos): ocupar con alguien, o liberar
  alternarAsiento(id) {
    const a = this.estado.get(id);
    if (!a) return null;
    if (a.piloto && this.estado.pilotoReal) { this.emit('alerta', { tipo: 'real', texto: 'La mesa piloto muestra datos reales: se cambia en la maqueta física.' }); return null; }
    if (a.ocupado) return this.levantarDe(id, true) ? 'libera' : null;
    if (this.reservas.has(id)) return 'yaViene';
    return this.enviarA(id) ? 'ocupa' : null;
  }
  ocuparMesa(mesaId) {
    const mesa = PLANO.mesas.find((m) => m.id === mesaId);
    let n = 0;
    for (const a of mesa?.asientos || []) if (this.#asientoDisponible(this.estado.get(a.id)) && this.enviarA(a.id)) n++;
    return n;
  }
  liberarMesa(mesaId) {
    const mesa = PLANO.mesas.find((m) => m.id === mesaId);
    let n = 0;
    for (const a of mesa?.asientos || []) if (this.estado.get(a.id).ocupado && this.levantarDe(a.id, true)) n++;
    return n;
  }
  ponerObjeto(id) {
    const a = this.estado.get(id);
    if (!a || !this.#asientoDisponible(a)) return false;
    this.#fijar(id, true, { objeto: true });
    this.ocupantes.set(id, { hasta: this.estado.minuto + azarEntre(12, 35), objeto: true });
    return true;
  }
  quitarObjeto(id) {
    const o = this.ocupantes.get(id);
    if (!o?.objeto) return false;
    this.ocupantes.delete(id);
    this.#fijar(id, false);
    return true;
  }
  quitarObjetos() { let n = 0; for (const [id, o] of [...this.ocupantes]) if (o.objeto && this.quitarObjeto(id)) n++; return n; }
  ocuparAzar(n = 10) { for (let i = 0; i < n; i++) { const a = this.elegirAsiento(); if (a) this.#sentarSinAnimacion(a.id, true); } }
  liberarAzar(n = 10) { this.salen(n); }
  mochilas(n = 8) {
    const libres = this.estado.asientos.filter((a) => this.#asientoDisponible(a));
    for (let i = 0; i < n && libres.length; i++) {
      const a = libres.splice(Math.floor(Math.random() * libres.length), 1)[0];
      this.#fijar(a.id, true, { objeto: true });
      this.ocupantes.set(a.id, { hasta: this.estado.minuto + azarEntre(12, 35), objeto: true });
    }
    this.estado.log('objeto', `${n} asientos apartados con mochilas: la cámara los ve ocupados`);
  }
  fallarCamara(mesaId = null) {
    const mesas = PLANO.mesas.filter((m) => !m.asientos[0].piloto && !this.camarasCaidas.has(m.id));
    const m = mesaId ? PLANO.mesas.find((x) => x.id === mesaId) : mesas[Math.floor(Math.random() * mesas.length)];
    if (!m || this.camarasCaidas.has(m.id)) return null;
    if (m.asientos[0].piloto && this.estado.pilotoReal) { this.emit('alerta', { tipo: 'real', texto: 'La mesa piloto usa la ESP32-CAM real: para ver una falla, desconéctala.' }); return null; }
    this.camarasCaidas.add(m.id);
    for (const a of m.asientos) this.estado.marcarSinDato(a.id);
    this.estado.log('camara', `Cámara de la mesa ${m.id} sin señal: sus asientos pasan a "sin dato"`);
    this.emit('alerta', { tipo: 'camara', texto: `Cámara de la mesa ${m.id} sin señal.` });
    this.#evaluarEntorno();
    return m.id;
  }
  cortarSala(piso = 2) {
    for (const m of PLANO.mesas) if (m.piso === piso && !m.asientos[0].piloto) { this.camarasCaidas.add(m.id); for (const a of m.asientos) this.estado.marcarSinDato(a.id); }
    this.estado.log('camara', `Corte de red en la Sala ${piso}: ${PLANO.mesas.filter((m) => m.piso === piso).length} cámaras sin señal`);
    this.emit('alerta', { tipo: 'camara', texto: `Corte en la Sala ${piso}: sus cámaras no envían datos.` });
    this.#evaluarEntorno();
  }
  restablecerCamara(mesaId) {
    if (!this.camarasCaidas.delete(mesaId)) return false;
    const m = PLANO.mesas.find((x) => x.id === mesaId);
    for (const a of m.asientos) { const v = this.verdad.get(a.id) || { ocupado: false }; this.estado.fijar(a.id, v.ocupado, { objeto: v.objeto }); }
    this.estado.log('camara', `Cámara de la mesa ${mesaId} restablecida: sus asientos vuelven a tener datos`);
    this.emit('camaraVuelve', mesaId);
    this.#evaluarEntorno();
    return true;
  }
  restablecerCamaras() {
    if (this.camarasCaidas.size) this.emit('camaraVuelve', null);
    for (const id of this.camarasCaidas) {
      const m = PLANO.mesas.find((x) => x.id === id);
      for (const a of m.asientos) { const v = this.verdad.get(a.id) || { ocupado: false }; this.estado.fijar(a.id, v.ocupado, { objeto: v.objeto }); }
    }
    this.camarasCaidas.clear();
    this.estado.log('camara', 'Cámaras restablecidas: vuelven los datos de todos los asientos');
    this.#evaluarEntorno();
  }

  // ------------------------------------------------------------ cambios de asiento (pasan por la "cámara")
  #fijar(id, ocupado, opc = {}) {
    this.verdad.set(id, { ocupado, objeto: !!opc.objeto });
    const a = this.estado.get(id);
    if (this.camarasCaidas.has(a.mesa)) return;     // sin cámara: el sistema no se entera
    this.estado.fijar(id, ocupado, opc);
  }
  #sentarSinAnimacion(id, contar = false) {
    if (contar) this.estado.entrar(1);
    this.#fijar(id, true);
    this.ocupantes.set(id, { hasta: this.estado.minuto + -Math.log(1 - Math.random()) * this.sim.estancia + 5, objeto: false });
  }

  // El jugador se sienta / se levanta
  ocuparPorJugador(id) { this.#fijar(id, true, { estudiante: true }); }
  liberarPorJugador(id) { this.#fijar(id, false, { estudiante: true }); }

  // ¿Alguien se está sentando justo ahora en ese asiento? (la cámara aún no lo confirma)
  sentandoseEn(id) { return this.agentes.some((ag) => ag.asiento === id && ag.estado === 'sentandose'); }

  // ------------------------------------------------------------ rival (hora punta)
  // Un estudiante va al asiento que eligió el jugador. Se busca una carrera pareja: alguien que
  // ya camina por la biblioteca a ~65 % de la distancia del jugador (caminando pierdes, corriendo
  // ganas). Si no hay nadie así, entra uno nuevo por la puerta.
  enviarRival(asientoId, metrosJugador) {
    const s = this.estado.get(asientoId);
    if (!s || s.ocupado || s.sinDato) return null;
    const ya = this.reservas.get(asientoId);
    if (ya) { this.#hacerRival(ya, s, false); return ya; }      // alguien ya iba hacia ese asiento
    const acc = accesoAsiento(s);
    const E = PLANO.escalera;
    const campo = campoDistancias(s.piso, acc.x, acc.z);
    const otroPiso = s.piso === 1 ? 2 : 1;
    const portalAqui = s.piso === 1 ? E.portal1 : E.portal2;
    const portalAlla = s.piso === 1 ? E.portal2 : E.portal1;
    let campoAlla = null;
    const distancia = (ag) => {
      if (ag.piso === s.piso) return campo.distancia(ag.x, ag.z);
      campoAlla ||= campoDistancias(otroPiso, portalAlla.x, portalAlla.z);
      return campoAlla.distancia(ag.x, ag.z) + 12.5 + campo.distancia(portalAqui.x, portalAqui.z);
    };
    const ideal = metrosJugador * 0.65;
    let mejor = null, dMejor = Infinity;
    for (const ag of this.agentes) {
      if (!ag.visible || !ag.dentro || ag.estado !== 'caminando' || ag.retraso > 0) continue;
      if (!['asiento', 'espera', 'estante'].includes(ag.destino)) continue;
      if (Math.abs(ag.y - yPiso(ag.piso)) > 0.2) continue;             // en la escalera
      const d = distancia(ag);
      if (!Number.isFinite(d) || d < metrosJugador * 0.4 || d > metrosJugador * 0.95) continue;
      if (Math.abs(d - ideal) < dMejor) { dMejor = Math.abs(d - ideal); mejor = ag; }
    }
    if (mejor) { this.#hacerRival(mejor, s, true); return mejor; }
    // alguien sentado cerca se levanta y se cambia a "tu" asiento (mejor ubicado para él)
    let sentado = null; dMejor = Infinity;
    for (const [id, o] of this.ocupantes) {
      if (o.objeto) continue;
      const a = this.estado.get(id);
      if (a.piso !== s.piso || a.mesa === s.mesa || a.estudiante || (a.piloto && this.estado.pilotoReal)) continue;
      const ac = accesoAsiento(a);
      const d = campo.distancia(ac.x, ac.z) + 1;
      if (!Number.isFinite(d) || d < metrosJugador * 0.3 || d > metrosJugador * 0.9) continue;
      if (Math.abs(d - ideal) < dMejor) { dMejor = Math.abs(d - ideal); sentado = id; }
    }
    if (sentado) {
      const a = this.estado.get(sentado);
      this.ocupantes.delete(sentado);
      const ag = this.#nuevo({ x: a.x, y: yPiso(a.piso), z: a.z, piso: a.piso, dentro: true, estado: 'levantandose', t: CONFIRMACION_S });
      ag.asientoDejado = sentado;
      ag.cambiaA = s.id;
      ag.asiento = s.id; ag.destino = 'asiento';
      this.reservas.set(s.id, ag);
      this.#hacerRival(ag, s, false);
      return ag;
    }
    // nadie adentro: uno nuevo que entra ahora mismo por la puerta
    const xP = (PLANO.puertas.entrada.x0 + PLANO.puertas.entrada.x1) / 2;
    // (al piso 2: del vestíbulo, que es abierto, a la escalera casi en línea recta)
    const dPuerta = 3 + (s.piso === 1
      ? campo.distancia(xP, PLANO.z1 - 0.8)
      : Math.hypot(xP - E.portal1.x, PLANO.z1 - E.portal1.z) * 1.1 + 12.5 + campo.distancia(portalAqui.x, portalAqui.z));
    if (dPuerta > metrosJugador * 1.05 || this.#aforoLleno()) return null;
    const ag = this.#nuevo({ x: xP + azarEntre(-0.6, 0.6), z: PLANO.z1 + 2.4 });
    ag.y = 0;
    ag.asiento = s.id; ag.destino = 'asiento'; ag.estado = 'caminando';
    this.reservas.set(s.id, ag);
    this.#seguir(ag, [{ x: ag.x, y: 0, z: ag.z }, ...rutaLlegada(null, s)]);
    this.#hacerRival(ag, s, false);
    return ag;
  }

  #hacerRival(ag, s, redirigir) {
    if (redirigir) {
      if (ag.asiento && this.reservas.get(ag.asiento) === ag) this.reservas.delete(ag.asiento);
      ag.asiento = s.id; ag.destino = 'asiento'; ag.estado = 'caminando'; ag.t = 0;
      this.reservas.set(s.id, ag);
      this.#seguir(ag, rutaInterior({ x: ag.x, z: ag.z, piso: ag.piso }, { x: s.x, z: s.z, piso: s.piso }, s));
    }
    ag.rival = true;
    ag.vel = Math.max(ag.vel, 1.5);           // va con prisa
    this.rival = ag;
    this.emit('rival', ag);
  }

  // El jugador cambió de asiento: el rival deja de serlo (sigue a ese asiento por su cuenta)
  olvidarRival() { if (this.rival) { this.rival.rival = false; this.rival = null; } }

  // ------------------------------------------------------------ salir
  #salir(ag) {
    if (ag.asiento && this.reservas.get(ag.asiento) === ag) this.reservas.delete(ag.asiento);
    ag.estado = 'saliendo';
    ag.destino = 'salida';
    ag.visible = true;
    this.#seguir(ag, rutaSalida({ x: ag.x, z: ag.z, piso: ag.piso }));
  }
  #retirar(ag) { this.agentes = this.agentes.filter((x) => x !== ag); if (this.rival === ag) this.rival = null; }

  // Alguien que estaba sentado se levanta y se va
  #levantar(id, o, { sinObjeto = false } = {}) {
    const a = this.estado.get(id);
    this.ocupantes.delete(id);
    const ag = this.#nuevo({ x: a.x, y: yPiso(a.piso), z: a.z, piso: a.piso, dentro: true, estado: 'levantandose', t: CONFIRMACION_S });
    ag.asientoDejado = id;
    ag.dejaObjeto = !sinObjeto && !o.objeto && Math.random() < this.sim.probObjeto;
    if (o.objeto) { ag.visible = false; this.#retirar(ag); this.#fijar(id, false); }
  }

  // ------------------------------------------------------------ ciclo
  update(dtReal) {
    const sim = this.sim;
    const pausa = sim.pausa;
    const dtMin = pausa ? 0 : (dtReal * sim.velocidad) / 60;
    const velPaso = Math.min(Math.max(sim.velocidad, 1), 3) * this.factorVel;
    // llegadas escalonadas pendientes
    if (this.pendientes.length) {
      for (const p of this.pendientes) p.en -= dtReal;
      const listos = this.pendientes.filter((p) => p.en <= 0);
      this.pendientes = this.pendientes.filter((p) => p.en > 0);
      for (const p of listos) p.fn();
    }
    // llegadas según la hora del día
    if (!pausa && !this.llegadasPausadas) {
      const h = this.estado.minuto / 60;
      const S = this.estado.sentados();
      const objetivo = sim.objetivoSentados(h);
      const tasa = Math.max(0, S / sim.estancia + (objetivo - S) / 5);          // personas por minuto
      const n = poisson(tasa * dtMin * 1.08);
      for (let i = 0; i < n; i++) {
        const rival = this.objetivoJugador && !this.rival && Math.random() < this.probRival;
        this.llegar({ preferir: rival ? this.objetivoJugador : null, rival });
      }
    }
    // los que terminaron de estudiar se van
    if (!pausa) for (const [id, o] of [...this.ocupantes]) if (this.estado.minuto >= o.hasta) this.#levantar(id, o);
    // eventos al azar
    if (this.aleatorios && !pausa && !this.llegadasPausadas) {
      this.tEvento -= dtReal * Math.min(sim.velocidad, 4);
      if (this.tEvento <= 0) { this.tEvento = azarEntre(45, 90); this.#eventoAzar(); }
    }
    // avance de cada estudiante
    for (const ag of [...this.agentes]) this.#mover(ag, dtReal, velPaso);
    // la fila avanza cuando hay aforo
    if (this.cola.length && !this.#aforoLleno()) {
      const ag = this.cola.shift();
      this.#asignarDestino(ag, {});
      this.cola.forEach((c, k) => this.#seguir(c, [{ x: c.x, y: 0, z: c.z }, puestoCola(k)]));
    }
    this.#evaluarEntorno();
  }

  #eventoAzar() {
    const r = Math.random();
    if (r < 0.4) this.grupo(3 + Math.floor(Math.random() * 3));
    else if (r < 0.6) this.mochilas(2 + Math.floor(Math.random() * 3));
    else if (r < 0.72 && !this.camarasCaidas.size && this.fallasAzar) { const m = this.fallarCamara(); if (m) this.pendientes.push({ en: 25, fn: () => this.restablecerCamara(m) }); }
    else this.entran(4 + Math.floor(Math.random() * 5));
  }

  #mover(ag, dt, velPaso) {
    if (ag.retraso > 0) { ag.retraso -= dt; return; }
    if (ag.estado === 'levantandose' || ag.estado === 'sentandose') {
      ag.t -= dt;
      if (ag.t > 0) return;
      if (ag.estado === 'levantandose' && ag.cambiaA) {
        // se cambia de asiento: deja el suyo libre y camina al nuevo
        this.#fijar(ag.asientoDejado, false);
        const s = this.estado.get(ag.cambiaA);
        ag.cambiaA = null; ag.estado = 'caminando';
        if (s.ocupado || s.sinDato) { this.#reubicar(ag); return; }
        this.#seguir(ag, rutaInterior({ x: ag.x, z: ag.z, piso: ag.piso }, { x: s.x, z: s.z, piso: s.piso }, s));
        return;
      }
      if (ag.estado === 'levantandose') {
        if (ag.dejaObjeto) { this.#fijar(ag.asientoDejado, true, { objeto: true }); this.ocupantes.set(ag.asientoDejado, { hasta: this.estado.minuto + azarEntre(15, 40), objeto: true }); }
        else this.#fijar(ag.asientoDejado, false);
        this.emit('agente', { tipo: 'seVa', ag });
        this.#salir(ag);
      } else {
        // la cámara confirmó: el asiento pasa a ocupado y la persona queda como instancia sentada
        const id = ag.asiento;
        if (this.estado.get(id).ocupado) { ag.estado = 'caminando'; this.#reubicar(ag); return; }   // alguien se sentó primero
        this.reservas.delete(id);
        this.#fijar(id, true);
        this.ocupantes.set(id, { hasta: this.estado.minuto + -Math.log(1 - Math.random()) * this.sim.estancia + 5, objeto: false });
        this.emit('agente', { tipo: 'seSento', ag, asiento: id });
        if (this.rival === ag) { this.rival = null; this.emit('rivalGano', { ag, asiento: id }); }
        this.#retirar(ag);
      }
      return;
    }
    if (!ag.pts) return;
    const zAntes = ag.z;
    ag.d = Math.min(ag.total, ag.d + ag.vel * velPaso * dt);
    let i = 1;
    while (i < ag.largos.length - 1 && ag.largos[i] < ag.d) i++;
    const a = ag.pts[i - 1], b = ag.pts[i];
    const seg = ag.largos[i] - ag.largos[i - 1] || 1;
    const t = (ag.d - ag.largos[i - 1]) / seg;
    ag.x = a.x + (b.x - a.x) * t; ag.y = a.y + (b.y - a.y) * t; ag.z = a.z + (b.z - a.z) * t;
    if (Math.hypot(b.x - a.x, b.z - a.z) > 0.01) {
      const r = Math.atan2(b.x - a.x, b.z - a.z);
      let dr = r - ag.rumbo; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      ag.rumbo += dr * Math.min(1, dt * 8);
    }
    ag.piso = ag.y > 3.4 ? 2 : 1;
    ag.caminando = ag.d < ag.total;
    if (ag.caminando) ag.fase += dt * ag.vel * velPaso * 5.2;
    // sensores de las puertas
    const P = PLANO.puertas;
    // aforo completo: quien todavía no cruzó la puerta se pone en la fila
    if (!ag.dentro && ag.estado === 'caminando' && ag.destino !== 'salida' && ag.z < PLANO.z1 + 2.6 && this.#aforoLleno()) {
      if (ag.asiento && this.reservas.get(ag.asiento) === ag) this.reservas.delete(ag.asiento);
      if (this.rival === ag) this.rival = null;
      ag.asiento = null; ag.rival = false;
      this.#aCola(ag);
      return;
    }
    if (!ag.dentro && zAntes >= PLANO.z1 && ag.z < PLANO.z1 && ag.x > P.entrada.x0 - 0.5 && ag.x < P.entrada.x1 + 0.5) {
      ag.dentro = true;
      this.estado.entrar(1);
      this.emit('puerta', { tipo: 'entrada', ag });
    }
    if (ag.dentro && ag.estado === 'saliendo' && zAntes < PLANO.z1 && ag.z >= PLANO.z1) {
      ag.dentro = false;
      this.estado.salir(1);
      this.emit('puerta', { tipo: 'salida', ag });
    }
    if (ag.caminando) {
      // si su asiento se ocupó antes de llegar, busca otro
      if (ag.destino === 'asiento' && ag.dentro) {
        const s = this.estado.get(ag.asiento);
        if (s.ocupado && this.reservas.get(ag.asiento) === ag) this.#reubicar(ag);
      }
      return;
    }
    // llegó al final de su ruta
    if (ag.destino === 'asiento') {
      const s = this.estado.get(ag.asiento);
      if (s.ocupado || s.sinDato) { this.#reubicar(ag); return; }
      ag.estado = 'sentandose'; ag.t = CONFIRMACION_S;   // de pie junto a la silla hasta que la cámara lo confirme
    } else if (ag.destino === 'espera') {
      ag.t = (ag.t || 0) + dt;
      if (ag.t > 3 && Math.random() < dt * 0.4) {
        const a2 = this.elegirAsiento();
        if (a2) { this.reservas.set(a2.id, ag); ag.asiento = a2.id; ag.destino = 'asiento'; this.#seguir(ag, rutaInterior({ x: ag.x, z: ag.z, piso: ag.piso }, { x: a2.x, z: a2.z, piso: a2.piso }, a2)); ag.t = 0; }
        else if (ag.t > 40) this.#salir(ag);
      }
    } else if (ag.destino === 'estante') {
      ag.t = (ag.t || 0) + dt;
      if (ag.t > azarEntre(8, 25)) this.#salir(ag);
    } else if (ag.destino === 'salida') {
      this.#retirar(ag);
    }
  }

  #reubicar(ag) {
    if (this.reservas.get(ag.asiento) === ag) this.reservas.delete(ag.asiento);
    if (this.rival === ag) { this.rival = null; this.emit('rivalPerdio', ag); }
    ag.rival = false;
    const otro = this.elegirAsiento();
    if (otro) {
      ag.asiento = otro.id; this.reservas.set(otro.id, ag);
      this.#seguir(ag, rutaInterior({ x: ag.x, z: ag.z, piso: ag.piso }, { x: otro.x, z: otro.z, piso: otro.piso }, otro));
    } else {
      ag.destino = 'espera'; ag.asiento = null;
      const p = ESPERA[Math.floor(Math.random() * ESPERA.length)];
      this.#seguir(ag, rutaInterior({ x: ag.x, z: ag.z, piso: ag.piso }, { ...p }));
    }
    ag.estado = 'caminando';
  }

  // ------------------------------------------------------------ estado del entorno
  #evaluarEntorno(forzar = false) {
    const e = this.estado;
    const ocup = e.ocupados() / e.total();
    let nuevo = 'normal';
    if (this.camarasCaidas.size) nuevo = 'incidente';
    if (ocup >= 0.85) nuevo = this.camarasCaidas.size ? 'incidente' : 'altaDemanda';
    if (e.libres() === 0) nuevo = 'sinAsientos';
    if (e.puertas.dentro >= PLANO.aforo || this.cola.length) nuevo = 'aforoCompleto';
    if (nuevo !== this.estadoEntorno || forzar) {
      const antes = this.estadoEntorno;
      this.estadoEntorno = nuevo;
      if (!forzar) this.emit('entorno', { estado: nuevo, antes });
    }
  }

  resumen() {
    return {
      caminando: this.agentes.filter((a) => a.visible && a.estado !== 'cola').length,
      cola: this.cola.length,
      esperando: this.agentes.filter((a) => a.destino === 'espera' && !a.caminando).length,
      camarasCaidas: this.camarasCaidas.size,
      entorno: this.estadoEntorno,
    };
  }
}

export const NOMBRE_ENTORNO = {
  normal: 'Normal', altaDemanda: 'Alta demanda', sinAsientos: 'Sin asientos libres', aforoCompleto: 'Aforo completo', incidente: 'Incidente: cámaras sin señal',
};
