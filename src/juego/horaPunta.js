// Experiencia HORA PUNTA: llegas cuando la biblioteca se está llenando y tienes que conseguir asiento.
// Todo es consecuencia del sistema: al cruzar la puerta, el sensor S1 te cuenta; los demás estudiantes
// también buscan asiento; si alguien ocupa el tuyo antes de que llegues, la cámara de esa mesa lo
// detecta, el asiento se pone rojo y la app te lleva al libre más cercano.
import { PLANO, ruta, rutaLlegada, alturaSuelo, accesoAsiento, NOMBRE_ZONA, PUNTOS, yPiso } from '../biblioteca/plano.js';
import { camposDesde, distanciaAsiento } from '../biblioteca/recomendador.js';
import { describirObjeto } from './jugador.js';
import * as H from './hudJuego.js';

const INICIO = { x: 0.5, z: PLANO.z1 + 9.5, piso: 1, rumbo: 0 };
const ALCANCE = 1.7;                       // metros para poder sentarse
const XP = (PLANO.puertas.entrada.x0 + PLANO.puertas.entrada.x1) / 2;
const XS = (PLANO.puertas.salida.x0 + PLANO.puertas.salida.x1) / 2;

// Asientos libres más cercanos a pie desde un punto (solo distancia, sin preferencias)
export function masCercanos(app, origen, { k = 1, piso = null, excluir = null } = {}) {
  const fuera = origen.z > PLANO.z1 - 0.3;
  const o = fuera ? { x: XP, z: PLANO.z1 - 0.6, piso: 1 } : origen;
  const extra = fuera ? Math.hypot(origen.x - XP, origen.z - PLANO.z1) : 0;
  const campos = camposDesde(o);
  const lista = [];
  for (const a of app.biblio.asientos) {
    if (a.ocupado || a.sinDato || a.estudiante || a.id === excluir || (piso && a.piso !== piso)) continue;
    if (app.multitud.sentandoseEn(a.id)) continue;
    const m = distanciaAsiento(campos, a) + extra;
    if (Number.isFinite(m)) lista.push({ asiento: a, metros: m });
  }
  lista.sort((x, y) => x.metros - y.metros);
  return lista.slice(0, k);
}

const largo = (pts) => { let m = 0; for (let i = 1; i < pts.length; i++) m += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z); return m; };

export class HoraPunta {
  constructor(app) {
    this.app = app;
    this.id = 'horaPunta';
    this.titulo = 'Hora punta';
    this.escena = 'biblioteca';
    this.panel = false;
    this.oyentes = [];
  }
  get b() { return this.app.biblio; }
  get m() { return this.app.multitud; }
  get esc() { return this.app.escenas.biblioteca; }
  get b3d() { return this.app.escenas.biblioteca.b3d; }
  get j() { return this.app.jugador; }
  get son() { return this.app.sonido; }

  // ---------------------------------------------------------------- inicio y fin
  iniciar() {
    const app = this.app;
    app.reiniciarMundo('horaPunta', { velocidad: 5, fallas: false });
    this.m.factorVel = 1 / 3;                // con el reloj ×5 los estudiantes caminan a paso real
    app.precalentar(8);
    Object.assign(this, {
      fase: 'jugando', dentro: false, objetivo: null, tuyo: null, rutaPts: null, rutaMetros: 0, destinoSalida: null,
      tRuta: 0, ultimaPos: null, t: 0, tEntrada: null, metrosEntrada: 0, perdidos: 0, cambios: 0, rivales: 0, ganados: 0,
      tRival: null, mejorAlEntrar: null, vistaAerea: false, guardado: null, tHud: 0, tResultado: null, ladoFuera: true,
      sinAsientos: false, aviso: null, tAviso: 0, libresAlSentarte: null,
    });
    this.esc.restaurarVisibilidad(); this.esc.enfocarPiso(null); this.esc.separarPisos(false);
    this.b3d.ocultarRuta(); this.b3d.marcarDestino(null); this.b3d.avatar.visible = false;
    this.esc.marcar({ tuyo: null, elegido: null });
    this.j.iniciar({ ...INICIO, velocidad: 1.75 });
    this.j.describir = (h) => this.describir(h);
    this.j.alInteractuar = (h) => this.interactuar(h);
    this.m.entran(9, { escalonado: 0.6 });   // llegas junto con otros estudiantes
    H.mostrar({ mira: true, objetivo: true, kpis: true, minimapa: true, barraAcciones: true });
    H.alAccionObjetivo((a) => this.#accionObjetivo(a));
    this.#acciones();
    this.oyentes = [
      this.b.on('asiento', (e) => this.#alCambiarAsiento(e)),
      this.m.on('rival', (ag) => this.#alRival(ag)),
      this.m.on('rivalPerdio', () => this.#alRivalPerdio()),
    ];
    this.#pintarObjetivo();
    H.banner('Hora punta · ' + this.b.hora(), 'info', 'La biblioteca se está llenando. Entra y consigue un asiento antes que los demás.', 5200);
  }

  detener() {
    for (const off of this.oyentes) off();
    this.oyentes = [];
    this.j.detener();
    this.j.describir = null; this.j.alInteractuar = null;
    this.m.objetivoJugador = null;
    this.m.olvidarRival();
    this.m.factorVel = 1;
    this.b3d.ocultarRuta(); this.b3d.marcarDestino(null); this.b3d.avatar.visible = false;
    this.esc.restaurarVisibilidad();
    this.app.mapaJuego.cerrar();
    H.alAccionObjetivo(null);
    H.cerrarResultado();
    H.mostrar({});
  }

  pistas() {
    if (this.fase === 'sentado') return [['E', 'levantarme e irme'], ['V', 'vista aérea'], ['R', 'jugar otra vez'], ['Arrastrar', 'mirar alrededor']];
    if (this.vistaAerea) return [['Clic', 'elegir asiento'], ['Arrastrar', 'girar'], ['Rueda', 'acercar'], ['V', 'volver a caminar']];
    return [['W A S D', 'caminar'], ['Shift', 'correr'], ['Clic', 'mirar con el ratón'], ['E', 'elegir · sentarte'], ['F', 'más cercano'], ['Tab', 'mapa'], ['V', 'vista aérea'], ['Q', 'cancelar']];
  }

  teclas() {
    return {
      KeyF: () => this.masCercano(),
      Tab: () => this.alternarMapa(),
      KeyV: () => this.alternarVista(),
      KeyQ: () => this.#cancelar(),
      KeyR: () => { if (this.fase !== 'jugando') this.app.irModo('horaPunta', { reiniciar: true }); },
      Escape: () => { if (this.app.mapaJuego.abierto) this.app.mapaJuego.cerrar(); },
    };
  }

  #acciones() {
    const l = [];
    if (this.fase === 'jugando') {
      if (this.objetivo && this.#cerca(this.objetivo) && this.dentro) l.push({ texto: 'Sentarme', tecla: 'E', principal: true, fn: () => this.#sentarse(this.objetivo) });
      l.push({ texto: 'Más cercano', tecla: 'F', fn: () => this.masCercano(), principal: !this.objetivo && this.dentro });
      l.push({ texto: 'Mapa', tecla: 'Tab', fn: () => this.alternarMapa() });
    } else if (this.fase === 'sentado') {
      l.push({ texto: 'Levantarme e irme', tecla: 'E', principal: true, fn: () => this.#levantarse() });
      l.push({ texto: 'Jugar otra vez', tecla: 'R', fn: () => this.app.irModo('horaPunta', { reiniciar: true }) });
    } else if (this.fase === 'saliendo') {
      l.push({ texto: 'Jugar otra vez', tecla: 'R', fn: () => this.app.irModo('horaPunta', { reiniciar: true }) });
    }
    l.push({ texto: this.vistaAerea ? 'Caminar' : 'Vista aérea', tecla: 'V', fn: () => this.alternarVista() });
    const clave = l.map((a) => a.texto).join('|');
    if (clave !== this.clavesAcciones) { this.clavesAcciones = clave; H.acciones(l); }
  }

  // ---------------------------------------------------------------- lo que hay bajo la mira
  describir(h) {
    const info = describirObjeto(this.app, h);
    if (!info) return null;
    if (this.fase !== 'jugando') return info;
    if (h.tipo === 'asiento') {
      const a = info.a;
      if (info.estado === 'libre') {
        if (this.m.sentandoseEn(a.id)) { info.titulo = `Asiento ${a.id} · alguien se está sentando`; info.alerta = true; }
        else if (this.dentro && this.#cerca(a)) info.accion = 'E · Sentarte aquí';
        else info.accion = this.objetivo?.id === a.id ? 'Tu destino' : 'E · Ir a este asiento';
      } else if (info.estado === 'objeto') info.detalle = 'Una mochila lo aparta: la cámara lo ve ocupado';
    } else if (h.tipo === 'mesa') {
      const libres = this.b.asientos.filter((a) => a.mesa === h.id && this.b.estadoDe(a) === 'libre').length;
      if (libres) info.accion = 'E · Ir a un asiento libre de esta mesa';
    } else if (h.tipo === 'totem') info.accion = 'E · Abrir el mapa';
    else if (h.tipo === 'estudiante' && h.ag.rival) { info.titulo = '⚠ Va a TU asiento'; info.alerta = true; }
    return info;
  }

  interactuar(h) {
    if (this.fase === 'sentado') { if (document.querySelector('#resultado').hidden) this.#levantarse(); return; }
    if (this.fase !== 'jugando') return;
    // cerca de tu asiento: E te sienta aunque mires a otro lado
    if (this.objetivo && this.dentro && this.#cerca(this.objetivo) && (!h || h.tipo !== 'asiento' || h.id === this.objetivo.id)) { this.#sentarse(this.objetivo); return; }
    if (!h) return;
    if (h.tipo === 'asiento') {
      const a = this.b.get(h.id);
      if (this.b.estadoDe(a) === 'libre' && this.dentro && this.#cerca(a) && !this.m.sentandoseEn(a.id)) { this.#sentarse(a); return; }
      this.elegir(a);
    } else if (h.tipo === 'mesa') {
      const p = this.j.pos;
      const libres = this.b.asientos.filter((a) => a.mesa === h.id && this.b.estadoDe(a) === 'libre' && !this.m.sentandoseEn(a.id));
      if (!libres.length) { this.son.error(); H.banner(`La mesa ${h.id} está llena`, 'alerta', 'Busca otra mesa con asientos verdes.', 2200); return; }
      libres.sort((x, y) => Math.hypot(x.x - p.x, x.z - p.z) - Math.hypot(y.x - p.x, y.z - p.z));
      this.elegir(libres[0]);
    } else if (h.tipo === 'totem') this.abrirMapa();
  }

  // Clic con el ratón en la vista aérea
  alClic(h) {
    if (!h || this.fase !== 'jugando') return;
    if (h.tipo === 'asiento') this.elegir(this.b.get(h.id));
    else if (h.tipo === 'mesa') this.interactuar(h);
  }

  // ---------------------------------------------------------------- elegir asiento
  elegir(a, { automatico = false } = {}) {
    if (!a || this.fase !== 'jugando') return false;
    const e = this.b.estadoDe(a);
    if (e !== 'libre' || this.m.sentandoseEn(a.id)) {
      this.son.error();
      const txt = { ocupado: 'Está ocupado: la cámara de su mesa ve a alguien sentado.', objeto: 'Tiene una mochila: la cámara lo ve ocupado.', sinDato: 'Su cámara no envía datos: no se sabe si está libre.', libre: 'Alguien se está sentando ahí.' }[e];
      H.banner(`Asiento ${a.id} no disponible`, 'alerta', txt, 2600);
      return false;
    }
    if (this.objetivo?.id === a.id) return true;
    if (this.objetivo && !automatico) this.cambios++;
    this.objetivo = a;
    this.m.olvidarRival();
    this.m.objetivoJugador = a.id;
    this.esc.marcar({ elegido: a.id });
    this.b3d.marcarDestino(a);
    if (!automatico) this.son.seleccion();
    this.#calcularRuta();
    this.#programarRival();
    this.sinAsientos = false;
    if (!automatico) H.banner(`Vas al asiento ${a.id}`, 'info', `${NOMBRE_ZONA[a.zona]} · piso ${a.piso}${a.enchufe ? ' · con enchufe' : ''}${a.ventana ? ' · junto a la ventana' : ''} · ${Math.round(this.rutaMetros)} m`, 2400);
    this.app.mapaJuego.marcar({ elegido: a.id, ruta: this.rutaPts });
    this.#pintarObjetivo(true);
    return true;
  }

  masCercano() {
    if (this.fase !== 'jugando') return;
    const p = this.j.pos;
    const [c] = masCercanos(this.app, p, { k: 1 });
    if (!c) { this.son.error(); H.banner('No quedan asientos libres', 'alerta', 'Espera en el vestíbulo: cuando alguien se vaya, te avisaremos.', 3200); this.sinAsientos = true; return; }
    this.elegir(c.asiento);
  }

  #cancelar() {
    if (this.fase !== 'jugando' || !this.objetivo) return;
    this.objetivo = null;
    this.m.objetivoJugador = null;
    this.m.olvidarRival();
    this.tRival = null;
    this.rutaPts = null;
    this.b3d.ocultarRuta(); this.b3d.marcarDestino(null);
    this.esc.marcar({ elegido: null });
    this.app.mapaJuego.marcar({ elegido: null, ruta: null });
    this.#pintarObjetivo(true);
  }

  abrirMapa() {
    const p = this.j.pos;
    const fuera = p.z > PLANO.z1;
    this.app.mapaJuego.abrir({
      piso: this.objetivo?.piso || (fuera ? 1 : p.piso),
      titulo: this.fase === 'jugando' ? 'Elige un asiento libre' : 'Mapa',
      ayuda: this.fase === 'jugando' ? 'Clic en un asiento verde' : '',
      pos: fuera ? null : p, elegido: this.objetivo?.id || null, tuyo: this.tuyo?.id || null, ruta: this.rutaPts,
      alElegir: (id) => { if (this.elegir(this.b.get(id))) this.app.mapaJuego.cerrar(); },
    });
  }
  alternarMapa() { if (this.app.mapaJuego.abierto) this.app.mapaJuego.cerrar(); else this.abrirMapa(); }

  // ---------------------------------------------------------------- ruta (se recalcula al moverte o al cambiar el destino)
  #destino() {
    if (this.fase === 'saliendo') return this.destinoSalida;
    return this.objetivo;
  }

  #calcularRuta() {
    const a = this.#destino();
    if (!a) { this.rutaPts = null; this.b3d.ocultarRuta(); return; }
    const p = this.j.pos;
    const E = PLANO.escalera;
    const yS = alturaSuelo(p.x, p.z, this.j.nivel);
    const enEscalera = p.x > E.x0 && p.x < E.x1 && p.z > E.z0 && p.z < E.z1 && yS > 0.15 && yS < PLANO.alturaPiso - 0.15;
    if (enEscalera && this.rutaPts) return;                      // en la escalera se mantiene la ruta
    let pts;
    if (this.fase === 'saliendo') {
      if (p.z > PLANO.z1 - 0.3) pts = [{ x: p.x, y: 0, z: p.z }, { x: XS, y: 0, z: PLANO.z1 + 3 }];
      else pts = [...ruta(p, PUNTOS.salidaInterior).pts, { x: XS, y: 0, z: PLANO.z1 + 1.2 }, { x: XS, y: 0, z: PLANO.z1 + 3 }];
    } else if (p.z > PLANO.z1 - 0.3) {
      pts = [{ x: p.x, y: 0, z: p.z }, ...rutaLlegada(null, a)];
    } else {
      pts = ruta(p, a, { asiento: a }).pts;
    }
    this.rutaPts = pts;
    this.rutaMetros = largo(pts);
    this.b3d.mostrarRuta(pts);
    this.ultimaPos = { x: p.x, z: p.z };
    this.tRuta = 0.5;
    this.app.mapaJuego.marcar({ ruta: pts });
  }

  // ---------------------------------------------------------------- rivales y asientos que se ocupan
  #programarRival() {
    const p = [0.85, 0.5, 0.3][this.rivales] ?? 0.2;
    this.tRival = Math.random() < p ? 1.8 + Math.random() * 2.5 : null;
  }

  #restanteRival(r) {
    if (r.pts && r.estado === 'caminando') return Math.max(0, r.total - r.d);
    const a = this.objetivo;
    return a ? Math.hypot(r.x - a.x, r.z - a.z) * 1.3 : 0;
  }

  #alRival(ag) {
    if (this.fase !== 'jugando') return;
    this.son.alerta();
    const d = Math.round(this.#restanteRival(ag));
    const quien = ag.estado === 'levantandose' ? 'Alguien que estaba sentado cerca se levanta para ir a tu asiento' : 'Un estudiante cambió de rumbo hacia tu asiento';
    H.banner('¡Alguien va a tu asiento!', 'alerta', `${quien}: está a ${d} m y tú a ${Math.round(this.rutaMetros)} m. Lleva una flecha roja encima. Corre con Shift.`, 4600);
  }

  #alRivalPerdio() {
    if (this.fase === 'sentado' || this.fase === 'saliendo') {
      this.ganados++;
      H.banner('¡Le ganaste el asiento!', 'ok', 'El otro estudiante vio que ya estaba ocupado y fue a buscar otro.', 3500);
    }
  }

  #alCambiarAsiento({ a, ahora }) {
    if (this.fase !== 'jugando') return;
    // se liberó un asiento cuando ya no quedaba ninguno
    if (ahora === 'libre' && this.sinAsientos && !this.objetivo) {
      this.sinAsientos = false;
      this.son.seleccion();
      H.banner(`¡Se liberó el asiento ${a.id}!`, 'ok', `Piso ${a.piso} · pulsa F para ir al más cercano.`, 3800);
      return;
    }
    if (!this.objetivo || a.id !== this.objetivo.id || ahora === 'libre' || a.estudiante) return;
    // te ganaron el asiento: la cámara de esa mesa vio a otra persona
    this.perdidos++;
    this.son.alerta();
    const quien = ahora === 'objeto' ? 'Alguien dejó su mochila en él' : ahora === 'sinDato' ? 'Su cámara dejó de enviar datos' : 'Otro estudiante se sentó primero';
    const perdido = this.objetivo;
    this.objetivo = null;
    const [alt] = masCercanos(this.app, this.j.pos, { k: 1, excluir: perdido.id });
    if (alt) {
      this.elegir(alt.asiento, { automatico: true });
      H.banner(`¡Te ganaron el asiento ${perdido.id}!`, 'alerta', `${quien}: la cámara de la mesa ${perdido.mesa} lo detectó. Nueva ruta al libre más cercano: ${alt.asiento.id} (${Math.round(alt.metros)} m).`, 5200);
      this.aviso = { texto: `Perdiste ${perdido.id}: ${quien.toLowerCase()}. La app recalculó tu ruta.`, hasta: this.t + 9 };
    } else {
      this.#cancelar();
      this.sinAsientos = true;
      H.banner(`¡Te ganaron el asiento ${perdido.id}!`, 'alerta', 'Ya no quedan asientos libres. Espera: cuando alguien se vaya, te avisaremos.', 5200);
    }
  }

  // ---------------------------------------------------------------- puertas (los sensores te cuentan a ti también)
  #puertas() {
    const p = this.j.pos;
    const fuera = p.z > PLANO.z1;
    if (fuera === this.ladoFuera) return;
    this.ladoFuera = fuera;
    const P = PLANO.puertas;
    const puerta = p.x > P.entrada.x0 - 0.6 && p.x < P.entrada.x1 + 0.6 ? 'entrada' : 'salida';
    const xc = puerta === 'entrada' ? XP : XS;
    this.b3d.pulsarPuerta(puerta);
    this.son.sensor(puerta === 'entrada' ? 'entrada' : 'salida');
    const antes = this.b.puertas.dentro;
    if (!fuera) {
      this.dentro = true;
      if (puerta === 'entrada') {
        this.b.entrar(1, { estudiante: true });
        this.b3d.flotante('+1', xc, 3.1, PLANO.z1, '#4ade80');
        if (this.tEntrada == null) {
          this.tEntrada = this.t; this.metrosEntrada = this.j.metros;
          const [m] = masCercanos(this.app, { x: XP, z: PLANO.z1 - 0.6, piso: 1 }, { k: 1 });
          this.mejorAlEntrar = m || null;
        }
        H.banner('Sensor S1: +1 persona', 'ok', `Personas dentro: ${antes} → ${this.b.puertas.dentro} de ${PLANO.aforo} · libres: piso 1 = ${this.b.libres(1)}, piso 2 = ${this.b.libres(2)}`, 4200);
      } else {
        // por la salida: el sensor S2 solo cuenta salidas
        this.b.salir(1);
        this.b.log('aviso', 'Alguien entró por la puerta de salida: el sensor S2 lo contó como una salida');
        this.b3d.flotante('−1 ?', xc, 3.1, PLANO.z1, '#fca5a5');
        H.banner('Entraste por la SALIDA', 'alerta', `El sensor S2 solo sabe contar salidas: te restó 1 (dentro ${antes} → ${this.b.puertas.dentro}). Así se descuadra el aforo.`, 5200);
        if (this.tEntrada == null) { this.tEntrada = this.t; this.metrosEntrada = this.j.metros; }
      }
    } else {
      this.dentro = false;
      if (puerta === 'salida') {
        this.b.salir(1, { estudiante: true });
        this.b3d.flotante('−1', xc, 3.1, PLANO.z1, '#7dd3fc');
        if (this.fase === 'saliendo') { this.#terminar(antes); return; }
        H.banner('Sensor S2: −1 persona', 'info', `Saliste: personas dentro ${antes} → ${this.b.puertas.dentro}.`, 3000);
      } else {
        this.b.entrar(1);
        this.b.log('aviso', 'Alguien salió por la puerta de entrada: el sensor S1 lo contó como una entrada');
        this.b3d.flotante('+1 ?', xc, 3.1, PLANO.z1, '#fca5a5');
        H.banner('Saliste por la ENTRADA', 'alerta', `El sensor S1 solo cuenta entradas: te sumó 1 (dentro ${antes} → ${this.b.puertas.dentro}) aunque saliste.`, 5200);
        if (this.fase === 'saliendo') this.#terminar(antes, true);
      }
    }
  }

  // ---------------------------------------------------------------- sentarse, resultados, salir
  #cerca(a) {
    const p = this.j.pos;
    return p.piso === a.piso && Math.hypot(p.x - a.x, p.z - a.z) < ALCANCE;
  }

  #sentarse(a) {
    if (!this.dentro) { this.son.error(); H.banner('Primero entra a la biblioteca', 'info', 'Por la puerta de ENTRADA: el sensor S1 te cuenta.', 2600); return; }
    if (this.b.estadoDe(a) !== 'libre' || this.m.sentandoseEn(a.id)) { this.son.error(); H.banner(`El asiento ${a.id} ya no está libre`, 'alerta', '', 2200); return; }
    const libresAntes = this.b.libres(a.piso);
    const dentro = this.b.puertas.dentro;
    this.fase = 'sentado';
    this.tSentado = this.t;
    this.tuyo = a;
    this.objetivo = null;
    this.m.objetivoJugador = null;
    this.tRival = null;
    this.m.ocuparPorJugador(a.id);
    this.esc.marcar({ tuyo: a.id, elegido: null });
    this.b3d.ocultarRuta(); this.b3d.marcarDestino(null);
    this.rutaPts = null;
    this.app.mapaJuego.cerrar();
    if (this.vistaAerea) { this.vistaAerea = false; this.esc.restaurarVisibilidad(); this.b3d.avatar.visible = false; }
    this.j.sentarEn(a);
    this.son.sentarse();
    this.b3d.flotante('ocupado', a.x, yPiso(a.piso) + 1.7, a.z, '#38bdf8', { escala: 0.8 });
    this.libresAlSentarte = { antes: libresAntes, despues: this.b.libres(a.piso), dentro };
    H.banner(`¡El asiento ${a.id} es tuyo!`, 'ok', `La cámara de la mesa ${a.mesa} te detectó (3 lecturas en 0,9 s). Libres en el piso ${a.piso}: ${libresAntes} → ${this.b.libres(a.piso)}.`, 4500);
    this.tResultado = 1.8;
    this.app.actualizarPistas();
  }

  #estrellas(tDentro) {
    let n = 1;
    if (this.perdidos === 0 && tDentro <= 75) n = 3;
    else if (this.perdidos <= 1 && tDentro <= 150) n = 2;
    if (n < 3 && this.ganados > 0) n++;
    return n;
  }

  #mostrarResultado() {
    const a = this.tuyo;
    const tDentro = this.t - (this.tEntrada ?? 0);
    const metros = Math.round(this.j.metros);
    const metrosDentro = Math.round(this.j.metros - this.metrosEntrada);
    const n = this.#estrellas(tDentro);
    const s = this.libresAlSentarte;
    const mejor = this.mejorAlEntrar;
    const titulo = n === 3 ? '¡Asiento conseguido como un experto!' : n === 2 ? '¡Conseguiste asiento!' : 'Lo lograste… por poco';
    H.resultado(`
      <h2>${titulo}</h2>
      ${H.estrellas(n)}
      <p style="margin:0">Asiento <b>${a.id}</b> · piso ${a.piso} · ${NOMBRE_ZONA[a.zona]}${a.enchufe ? ' · con enchufe' : ''}${a.ventana ? ' · junto a la ventana' : ''}</p>
      <div class="cifras-resultado">
        <div><span>Tiempo desde que entraste</span><b>${H.formatoTiempo(tDentro)}</b></div>
        <div><span>Caminaste</span><b>${metros} m</b></div>
        <div><span>Asientos que te ganaron</span><b>${this.perdidos}</b></div>
      </div>
      <p class="nota">${mejor ? `Cuando entraste, el libre más cercano era <b>${mejor.asiento.id}</b>, a ${Math.round(mejor.metros)} m; adentro caminaste ${metrosDentro} m. ` : ''}${this.perdidos ? `Te ganaron ${this.perdidos === 1 ? 'un asiento' : `${this.perdidos} asientos`}: cada vez, la cámara de esa mesa lo detectó y la app te llevó al libre más cercano. ` : ''}${this.ganados ? '¡Y le ganaste el sitio a otro estudiante! ' : ''}</p>
      <p class="nota"><b>Qué cambió en el sistema:</b> asientos libres del piso ${a.piso}: ${s.antes} → ${s.despues} (lo detectó la cámara de tu mesa). <b>Personas dentro: ${s.dentro}</b>, no cambió al sentarte: ese número solo lo mueven los sensores de las puertas.</p>
      <p class="mini">3 ★: no perder ningún asiento y sentarte en menos de 1:15 desde que entras. Ganarle el sitio a un rival suma una estrella.</p>
      <div class="fila"><button class="primario" data-r="otra">Jugar otra vez</button><button data-r="salir">Levantarme e irme</button><button data-r="quedarme">Quedarme sentado</button><button data-r="menu">Otras experiencias</button></div>`,
    (r) => r.addEventListener('click', (e) => {
      const d = e.target.closest('[data-r]')?.dataset.r;
      if (d === 'otra') this.app.irModo('horaPunta', { reiniciar: true });
      else if (d === 'salir') this.#levantarse();
      else if (d === 'quedarme') H.cerrarResultado();
      else if (d === 'menu') this.app.irModo('menu');
    }));
    this.son.exito();
  }

  #levantarse() {
    const a = this.tuyo;
    if (!a || this.fase !== 'sentado') return;
    H.cerrarResultado();
    const libres = this.b.libres(a.piso);
    this.m.liberarPorJugador(a.id);
    this.esc.marcar({ tuyo: null, elegido: null });
    this.b3d.flotante('libre', a.x, yPiso(a.piso) + 1.7, a.z, '#4ade80', { escala: 0.8 });
    if (this.vistaAerea) { this.vistaAerea = false; this.esc.restaurarVisibilidad(); this.b3d.avatar.visible = false; }
    const acc = accesoAsiento(a);
    this.fase = 'saliendo';
    this.destinoSalida = { x: XS, z: PLANO.z1 + 1.5, piso: 1 };
    this.j.iniciar({ x: acc.x, z: acc.z, piso: a.piso, rumbo: a.mira > 0 ? 0 : Math.PI, velocidad: 1.75, conservar: true });
    this.b3d.marcarDestino(this.destinoSalida);
    this.#calcularRuta();
    H.banner('Tu asiento quedó libre', 'info', `La cámara lo vio vacío en 0,9 s: libres en el piso ${a.piso}: ${libres} → ${this.b.libres(a.piso)}. Sal por la puerta de SALIDA (sensor S2).`, 5000);
    this.app.actualizarPistas();
  }

  #terminar(antes, porEntrada = false) {
    this.fase = 'fin';
    this.b3d.ocultarRuta(); this.b3d.marcarDestino(null);
    this.rutaPts = null;
    H.resultado(`
      <h2>${porEntrada ? 'Saliste… por la entrada' : '¡Hasta la próxima!'}</h2>
      <p class="nota">${porEntrada
        ? `El sensor S1 te contó como una <b>entrada</b>: personas dentro ${antes} → ${this.b.puertas.dentro}, aunque te fuiste. Los sensores infrarrojos cuentan cruces, no saben en qué sentido vas: por eso la entrada y la salida van por puertas distintas.`
        : `El sensor S2 te contó al salir: personas dentro <b>${antes} → ${this.b.puertas.dentro}</b>. Tu asiento ya lo puede usar otro estudiante.`}</p>
      <div class="fila"><button class="primario" data-r="otra">Jugar otra vez</button><button data-r="caos">Probar el modo Caos</button><button data-r="menu">Otras experiencias</button></div>`,
    (r) => r.addEventListener('click', (e) => {
      const d = e.target.closest('[data-r]')?.dataset.r;
      if (d === 'otra') this.app.irModo('horaPunta', { reiniciar: true });
      else if (d === 'caos') this.app.irModo('caos');
      else if (d === 'menu') this.app.irModo('menu');
    }));
    this.son.exito();
  }

  // ---------------------------------------------------------------- vista aérea (V)
  alternarVista() {
    if (this.fase === 'fin') return;
    const b3d = this.b3d;
    if (!this.vistaAerea) {
      const sentado = this.fase === 'sentado';
      const p = sentado ? { x: this.tuyo.x, z: this.tuyo.z, piso: this.tuyo.piso } : this.j.pos;
      this.guardado = { x: p.x, z: p.z, piso: p.piso, rumbo: this.j.rumbo };
      this.vistaAerea = true;
      if (!sentado) this.j.detener();
      this.app.mapaJuego.cerrar();
      this.esc.verDesdeArriba(p.piso);
      const y = yPiso(p.piso);
      this.app.control.usarOrbita({ pos: [p.x + 3, y + 26, p.z + 14], obj: [p.x, y, p.z - 1], min: 5, max: 90, polarMax: Math.PI * 0.44, dur: 1.2 });
      b3d.avatar.position.set(p.x, y, p.z);
      b3d.avatar.rotation.y = this.guardado.rumbo;
      b3d.avatar.visible = !sentado;
      H.mostrar({ objetivo: true, kpis: true, minimapa: false, barraAcciones: true });
      if (this.fase === 'jugando') H.banner('Vista aérea', 'info', 'Haz clic en un asiento verde para elegirlo. V para volver a caminar.', 2800);
    } else {
      this.vistaAerea = false;
      this.esc.restaurarVisibilidad();
      b3d.avatar.visible = false;
      H.mostrar({ mira: this.fase !== 'sentado', objetivo: true, kpis: true, minimapa: true, barraAcciones: true });
      if (this.fase === 'sentado') this.j.sentarEn(this.tuyo);
      else this.j.iniciar({ ...this.guardado, velocidad: 1.75, conservar: true });
    }
    this.clavesAcciones = null;
    this.#acciones();
    this.app.actualizarPistas();
  }

  // ---------------------------------------------------------------- tarjeta del objetivo
  #accionObjetivo(a) {
    if (a === 'cercano') this.masCercano();
    else if (a === 'mapa') this.abrirMapa();
    else if (a === 'sentarme' && this.objetivo) this.#sentarse(this.objetivo);
  }

  #pintarObjetivo() {
    const b = this.b;
    const hora = `${b.hora()} · reloj ×${this.app.simBiblio.velocidad}`;
    let cuerpo = '';
    if (this.fase === 'jugando') {
      if (!this.dentro && !this.objetivo) cuerpo = `<p>Entra por la puerta de <b>ENTRADA</b> (la de la izquierda): su sensor S1 te contará. Luego consigue un asiento libre antes que los demás.</p>`;
      else if (!this.objetivo) cuerpo = this.sinAsientos
        ? '<div class="aviso-objetivo">No quedan asientos libres. Espera en el vestíbulo: cuando alguien se vaya, la cámara de su mesa lo detectará y te avisaremos.</div>'
        : '<p>Elige un asiento libre (verde): <b>míralo y pulsa E</b>, pulsa <kbd>F</kbd> para el más cercano o <kbd>Tab</kbd> para el mapa.</p><div class="fila"><button data-a="cercano">El más cercano</button><button data-a="mapa">Ver el mapa</button></div>';
      else {
        const a = this.objetivo;
        const cerca = this.dentro && this.#cerca(a);
        cuerpo = cerca
          ? `<p><b>Pulsa E para sentarte</b> en ${a.id}.</p><div class="fila"><button data-a="sentarme" class="primario">Sentarme</button></div>`
          : `<p>Ve a tu asiento <b>${a.id}</b> · piso ${a.piso}${a.piso === 2 ? ' (sube por la escalera del fondo a la izquierda)' : ''} · <b>${Math.round(this.rutaMetros)} m</b></p>`;
        const r = this.m.rival;
        if (r && r.asiento === a.id) cuerpo += `<div class="aviso-objetivo">⚠ <b>Un estudiante va a tu asiento.</b> Está a ${Math.round(this.#restanteRival(r))} m; tú, a ${Math.round(this.rutaMetros)} m. Corre con Shift o elige otro (F).</div>`;
      }
      if (this.aviso && this.t < this.aviso.hasta) cuerpo += `<p class="nota alerta" style="margin:0">${this.aviso.texto}</p>`;
    } else if (this.fase === 'sentado') cuerpo = `<p>Estás sentado en <b>${this.tuyo.id}</b>. Mira cómo se sigue llenando la biblioteca. <kbd>E</kbd> para levantarte e irte.</p>`;
    else if (this.fase === 'saliendo') cuerpo = '<p>Sal por la puerta de <b>SALIDA</b> (la de la derecha): su sensor S2 te descontará.</p>';
    else cuerpo = '<p>Fin de la partida.</p>';
    const metricas = this.fase === 'jugando' || this.fase === 'saliendo'
      ? `<div class="metricas"><span>Tiempo <b>${H.formatoTiempo(this.t)}</b></span><span>Caminado <b>${Math.round(this.j.metros)} m</b></span><span>Perdidos <b>${this.perdidos}</b></span></div>` : '';
    H.objetivo(`<h2>Hora punta <small>${hora}</small></h2>${cuerpo}${metricas}`);
  }

  // ---------------------------------------------------------------- cada cuadro
  update(dt) {
    if (this.fase === 'jugando' || this.fase === 'saliendo') this.t += dt;
    this.j.update(dt);
    if (!this.vistaAerea && this.fase !== 'sentado' && this.fase !== 'fin') this.#puertas();
    // rival programado
    if (this.tRival != null && this.objetivo && this.fase === 'jugando') {
      this.tRival -= dt;
      if (this.tRival <= 0) {
        this.tRival = null;
        if (this.rutaMetros > 7 && !this.m.rival) {
          const ag = this.m.enviarRival(this.objetivo.id, this.rutaMetros);
          if (ag) this.rivales++;
        }
      }
    }
    // ruta: se recalcula si te moviste
    if (this.#destino() && (this.fase === 'jugando' || this.fase === 'saliendo') && !this.vistaAerea) {
      this.tRuta -= dt;
      if (this.tRuta <= 0) {
        const p = this.j.pos;
        if (!this.ultimaPos || Math.hypot(p.x - this.ultimaPos.x, p.z - this.ultimaPos.z) > 0.35) this.#calcularRuta();
        else this.tRuta = 0.25;
      }
    }
    if (this.tResultado != null) { this.tResultado -= dt; if (this.tResultado <= 0) { this.tResultado = null; if (this.fase === 'sentado') this.#mostrarResultado(); } }
    const p = this.vistaAerea && this.guardado ? this.guardado : this.j.pos;
    this.app.minimapa.update(dt, { pos: p, rumbo: this.vistaAerea ? this.guardado.rumbo : this.j.rumbo, objetivo: this.#destino(), ruta: this.rutaPts, rival: this.m.rival });
    this.app.mapaJuego.update(dt, { pos: p.z > PLANO.z1 ? null : p });
    this.tHud -= dt;
    if (this.tHud <= 0) {
      this.tHud = 0.25;
      H.kpis(this.app);
      this.#pintarObjetivo();
      this.#acciones();
    }
  }

  // ---------------------------------------------------------------- visor (Meta Quest)
  asientoVR() { return this.fase === 'sentado' ? this.tuyo : null; }
  alSalirVR(pos) {
    if (this.fase === 'sentado' && this.tuyo) this.j.sentarEn(this.tuyo);
    else if (pos) this.j.iniciar({ ...pos, velocidad: 1.75, conservar: true });
  }
  botonesVR() {
    return [
      { id: 'hp-otra', texto: 'Jugar otra vez', fn: () => this.app.irModo('horaPunta', { reiniciar: true }) },
    ];
  }
  textoA() {
    if (this.fase === 'sentado') return 'Levantarme';
    if (this.fase === 'fin') return 'Jugar otra vez';
    if (this.fase === 'saliendo') return 'Jugar otra vez';
    if (this.objetivo && this.dentro && this.#cerca(this.objetivo)) return 'Sentarme';
    return 'Más cercano';
  }
  accionA() {
    if (this.fase === 'sentado') { this.#levantarse(); return; }
    if (this.fase === 'fin' || this.fase === 'saliendo') { this.app.irModo('horaPunta', { reiniciar: true }); return; }
    if (this.objetivo && this.dentro && this.#cerca(this.objetivo)) { this.#sentarse(this.objetivo); return; }
    this.masCercano();
  }
  lineasVR() {
    const b = this.b;
    const l = [`HORA PUNTA · ${b.hora()}`];
    if (this.fase === 'jugando') {
      if (!this.dentro && !this.objetivo) l.push('Entra por la puerta de ENTRADA (sensor S1)');
      else if (!this.objetivo) l.push(this.sinAsientos ? 'No quedan asientos: espera' : 'Apunta a un asiento verde y aprieta el gatillo');
      else l.push(`Ve a ${this.objetivo.id} · ${Math.round(this.rutaMetros)} m${this.m.rival?.asiento === this.objetivo.id ? ' · ¡RIVAL!' : ''}`);
    } else if (this.fase === 'sentado') l.push(`Sentado en ${this.tuyo.id} · A para levantarte`);
    else if (this.fase === 'saliendo') l.push('Sal por la puerta de SALIDA (sensor S2)');
    l.push(`Libres: piso 1 = ${b.libres(1)} · piso 2 = ${b.libres(2)} · dentro ${b.puertas.dentro}/${b.puertas.aforo}`);
    return l;
  }
}
