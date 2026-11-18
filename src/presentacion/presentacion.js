// SIMULACIÓN PARA PRESENTACIÓN (sección extra).
// La biblioteca de Hora punta, con su gente y sus gráficos, pero llena en el piso 1 y el sótano: la única mesa
// con sitio es la mesa piloto 1-01, con 2 de sus 4 sillas libres. Con el Meta Quest 3 puesto, la
// persona camina de verdad hacia el sensor S1; cuando el sensor REAL la detecta, en el simulador
// también entra. Luego va a la mesa piloto, elige una silla libre, se sienta y se queda.
//
// Máquina de estados:
//   INICIALIZACIÓN → CALIBRACIÓN (solo visor) → USUARIO A 2 METROS → CAMINANDO HACIA LA ENTRADA →
//   SENSOR FÍSICO DETECTADO → INGRESO CONFIRMADO → RECORRIENDO LA BIBLIOTECA → MESA IDENTIFICADA →
//   SELECCIÓN DE ASIENTO → SENTADO
//
// Qué es real: los ingresos (S1) y salidas (S2) vienen solo del ESP32 (USB en esta PC o la sala en
// vivo); los cuatro asientos de la mesa piloto vienen de la ESP32-CAM cuando está conectada. El resto
// de la biblioteca es simulado. El modo ensayo (sin sensores) se rotula siempre como simulado.
// No cambia las otras experiencias: usa el mismo mundo y lo deja como estaba al salir.
import * as THREE from 'three';
import { PLANO, yPiso, ruta, accesoAsiento, rutaInterior, ESTANTES_FRENTE, nivelPorAltura } from '../biblioteca/plano.js';
import { describirObjeto } from '../juego/jugador.js';
import * as H from '../juego/hudJuego.js';
import { escapar } from '../ui/hud.js';
import { FUENTE } from '../motor/textos.js';
import { CONTADOR } from '../config.js';
import { SensoresPresentacion, BAUDIOS } from './sensores.js';
import {
  SENSOR_VIRTUAL, DISTANCIA_INICIO, calibrarRapida, calibrarDosPuntos, distanciaAlSensor, distanciaEscritorio,
  aplicarAlRig, rumboLocal, rumboDe, textoMetros,
} from './calibracion.js';
import { AyudasPresentacion } from './visual.js';

const XP = SENSOR_VIRTUAL.x, Z1 = SENSOR_VIRTUAL.z;
const XS = (PLANO.puertas.salida.x0 + PLANO.puertas.salida.x1) / 2;
const MESA = PLANO.mesaPiloto;
const PILOTO = MESA.asientos.map((a) => a.id);          // 1-01-A … D = zonas A1 … A4 de la ESP32-CAM
const RESERVA = Object.freeze({ id: 'presentacion', reserva: true });
const OJOS_SENTADO = 1.2;                               // altura de los ojos de alguien sentado (m)
const CERCA_MESA = 3.8;                                 // "mesa identificada" (m al centro de la mesa)
const ALCANCE = 2.6;                                    // para sentarse sin caminar más (m)

export const ESTADOS = [
  ['inicializacion', 'Inicialización'],
  ['calibracion', 'Calibración'],
  ['a2m', 'Usuario a 2 metros'],
  ['caminando', 'Caminando hacia la entrada'],
  ['sensor', 'Sensor físico detectado'],
  ['ingreso', 'Ingreso confirmado'],
  ['recorriendo', 'Recorriendo la biblioteca'],
  ['mesa', 'Mesa identificada'],
  ['seleccion', 'Selección de asiento'],
  ['sentado', 'Sentado'],
];
const NOMBRE = Object.fromEntries(ESTADOS);
const ORDEN = ESTADOS.map((e) => e[0]);

const letra = (a) => a.letra || a.id.slice(-1);
const zona = (a) => a.camara || `A${PILOTO.indexOf(a.id) + 1}`;
const recortar = (s, n = 60) => { s = String(s); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const dos = (n) => String(n).padStart(2, '0');
const hora = (d) => `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;

function largos(pts) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return L;
}
function puntoEn(pts, L, d) {
  let i = 1;
  while (i < L.length - 1 && L[i] < d) i++;
  const a = pts[i - 1], b = pts[i] || a;
  const seg = L[i] - L[i - 1] || 1;
  const t = Math.max(0, Math.min(1, (d - L[i - 1]) / seg));
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, rumbo: rumboDe(b.x - a.x, b.z - a.z) };
}
// misma forma en que la multitud hace caminar a sus estudiantes
function seguir(ag, pts) {
  ag.pts = pts;
  ag.largos = [0];
  for (let i = 1; i < pts.length; i++) ag.largos.push(ag.largos[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z));
  ag.total = ag.largos[ag.largos.length - 1];
  ag.d = 0;
}

export class Presentacion {
  constructor(app) {
    this.app = app;
    this.id = 'presentacion';
    this.titulo = 'Simulación para presentación';
    this.escena = 'biblioteca';
    this.sensores = new SensoresPresentacion(app);
    this.ayudas = null;
    this.oyentes = [];
    this.registro = [];
    this.vRegistro = 0;
    this.fase = 'inicializacion';
    this.tmp = new THREE.Vector3();
  }

  get b() { return this.app.biblio; }
  get m() { return this.app.multitud; }
  get esc() { return this.app.escenas.biblioteca; }
  get b3d() { return this.app.escenas.biblioteca.b3d; }
  get j() { return this.app.jugador; }
  get son() { return this.app.sonido; }
  get vr() { return this.app.vr; }
  get enVR() { return !!this.app.vr?.presentando; }

  // ================================================================ inicio y fin
  iniciar() {
    const app = this.app;
    estilos();
    this.#fuenteInicial();
    this.#parchear();
    this.#parchearTotem();
    this.ayudas ||= new AyudasPresentacion(app);
    this.ayudas.montar(this.esc.scene);
    this.ayudas.girarRotuloSensor(this.b3d, true);
    Object.assign(this, {
      fase: 'inicializacion', tEstado: 0, entro: false, tIngreso: null, ingreso: null, liberado: false, tuyo: null, seleccion: null,
      cal: null, calPaso: null, sensorTocado: null, dist: null, cruzoSinSensor: false, auto: null, saltos: null, sentarAlLlegar: false,
      rutaPts: null, rutaMetros: 0, ultimaPosRuta: null, tRuta: 0, tHud: 0, tVida: 2, tPaneles: 0, confirmado: null, ajusteSentado: null,
      gatilloPrevio: false, panelPendiente: false, clavesAcciones: null, avisoBasura: false, clavePuerta: '', claveMesa: '',
    });
    this.registro = []; this.vRegistro++;
    this.#prepararMundo();
    this.esc.restaurarVisibilidad(); this.esc.enfocarPiso(null); this.esc.separarPisos(false);
    this.b3d.ocultarRuta(); this.b3d.marcarDestino(null); this.b3d.avatar.visible = false;
    this.esc.marcar({ tuyo: null, elegido: null });
    this.#caminarDesde({ x: XP, z: Z1 + DISTANCIA_INICIO, rumbo: 0 });
    H.mostrar({ mira: true, objetivo: true, kpis: true, minimapa: true, barraAcciones: true });
    H.alAccionObjetivo((a) => this.#accion(a));
    this.sensores.iniciar();
    const s = this.sensores;
    this.oyentes = [
      s.on('entrada', (e) => this.#alEntrada(e)),
      s.on('salida', (e) => this.#alSalida(e)),
      s.on('duplicado', (e) => this.#log('aviso', `Línea repetida de ${e.sensor} ignorada (el contador sigue en ${e.contador})`)),
      s.on('reinicio', (e) => this.#alReinicioESP(e)),
      s.on('traduccion', (e) => this.#log('traducida', `Arduino: “${recortar(e.original, 48)}” → ${e.tipo}`)),
      s.on('basura', (e) => this.#alBasura(e)),
      app.fuentes.on('modo', () => this.#alCambiarFuente()),
      app.estado.on('asientos', () => this.#alCamara()),
      app.estado.on('reinicio', () => this.#aplicarPiloto()),
      this.b.on('asiento', ({ a }) => { if (a.piloto) this.#alAsientoPiloto(a); }),
    ];
    this.#log('sistema', `Biblioteca llena: ${this.b.libres()} asientos libres en total, todos en la mesa piloto ${MESA.id}`);
    this.#log('sistema', `Datos: ${this.sensores.estadoConexion().detalle}`);
    this.#irA(this.enVR ? 'calibracion' : 'a2m');
    H.banner('Simulación para presentación', 'info', this.enVR
      ? 'Párate a 2 m del sensor S1 real, míralo y pulsa A para calibrar.'
      : 'El piso 1 y el sótano están llenos: solo la mesa piloto tiene 2 sillas libres. Pasa frente al sensor S1 real para entrar.', 5600);
  }

  detener() {
    for (const off of this.oyentes) off();
    this.oyentes = [];
    this.sensores.detener();
    this.j.detener();
    this.j.describir = null; this.j.alInteractuar = null;
    this.auto = null; this.saltos = null;
    this.ayudas?.desmontar();
    this.ayudas?.girarRotuloSensor(this.b3d, false);
    this.refXR?.removeEventListener?.('reset', this.alResetXR);
    this.refXR = null;
    this.b3d.ocultarRuta(); this.b3d.marcarDestino(null); this.b3d.avatar.visible = false;
    this.esc.marcar({ tuyo: null, elegido: null });
    this.#quitarParches();
    this.#restaurarPiloto();
    for (const id of PILOTO) if (this.m.reservas.get(id) === RESERVA) this.m.reservas.delete(id);
    Object.assign(this.m, { llegadasPausadas: false, factorVel: 1 });
    this.app.mapaJuego.cerrar();
    H.alAccionObjetivo(null);
    H.cerrarResultado();
    H.mostrar({});
  }

  reiniciar() { this.app.irModo('presentacion', { reiniciar: true }); }

  // En esta sección no se simula la maqueta: se esperan los sensores reales (o el código de sala)
  #fuenteInicial() {
    const f = this.app.fuentes;
    const cod = location.hash.match(/^#\/presentacion\/(\d{4,6})/)?.[1];
    if (cod) {
      if (f.recibiendo !== cod) {
        f.recibir(cod)
          .then(() => this.#log('sistema', `Recibiendo la sala ${cod}: los datos vienen de la laptop con los sensores`))
          .catch(() => H.banner('Código de sala no válido', 'alerta', '', 3000));
      }
    } else if (f.modo === 'sim') f.simular(false);
    const bg = this.sensores.baudiosGuardados();
    if (bg && bg !== CONTADOR.baudios) {
      if (f.puertos.length) {
        this.sensores.reconectar(bg)
          .then(() => this.app.hud.aviso(`Puerto reabierto a ${bg} baudios (la velocidad que elegiste para este programa).`, 'info', 5000))
          .catch(() => {});
      } else CONTADOR.baudios = bg;
    }
  }

  // ================================================================ el mundo: piso 1 y sótano llenos, y la mesa piloto
  #prepararMundo() {
    const app = this.app, b = this.b, m = this.m;
    app.silencio = true;
    try {
      app.reiniciarMundo('horaPunta', { velocidad: 1, aleatorios: false, fallas: false });
      app.simBiblio.fijarHora(14 * 60 + 35);
      // todos los asientos con una persona sentada (sin mochilas), salvo la mesa piloto
      for (const a of b.asientos) if (!a.piloto && (!a.ocupado || a.objeto)) b.fijar(a.id, true, { silencioso: true });
      this.#aplicarPiloto();
      // personas dentro coherentes: los sentados más unos pocos de pie (estantes y vestíbulo)
      const dentro = Math.min(PLANO.aforo - 4, b.sentados() + 24);
      b.puertas = { dentro, entradas: dentro + b.puertas.salidas, salidas: b.puertas.salidas, aforo: PLANO.aforo };
      m.sincronizar();
      for (const o of m.ocupantes.values()) o.hasta = Infinity;          // nadie se levanta: la biblioteca sigue llena
      for (const ag of m.agentes) ag.t = -1e9;                            // los de pie no se van (no hay salidas simuladas)
      Object.assign(m, { llegadasPausadas: true, aleatorios: false, fallasAzar: false, probRival: 0, objetivoJugador: null, factorVel: 1, rival: null });
      this.#reservarPiloto();
      b.version++;
    } finally { app.silencio = false; }
  }

  // ¿La ESP32-CAM está mandando datos? (solo entonces la mesa piloto es "real")
  #camaraViva() {
    const f = this.app.fuentes;
    return (f.enVivo || f.modo === 'espera') && !!this.app.estado.camara.conocida;
  }

  // Sin ESP32-CAM, la mesa piloto se simula (A y B ocupadas, C y D libres) y se rotula como simulada.
  // Para eso, mientras dura la sección: "pilotoReal" solo es verdadero con la cámara enviando datos, y
  // la mesa piloto no pasa a gris por falta de cámara. Se deshace al salir.
  #parchear() {
    if (this.parches) return;
    const b = this.b, yo = this;
    const pilotos = new Set(PILOTO);
    let crudo = b.pilotoReal;
    Object.defineProperty(b, 'pilotoReal', { configurable: true, enumerable: true, get: () => yo.#camaraViva(), set: (v) => { crudo = v; } });
    b.marcarSinDato = function marcarSinDato(id) {
      if (pilotos.has(id) && !yo.#camaraViva()) return;
      return Object.getPrototypeOf(b).marcarSinDato.call(this, id);
    };
    this.parches = { crudo: () => crudo };
  }

  #quitarParches() {
    if (!this.parches) return;
    const b = this.b;
    const v = this.parches.crudo();
    delete b.marcarSinDato;
    delete b.pilotoReal;
    b.pilotoReal = v;
    this.parches = null;
    delete this.b3d.totem.dibujar;
  }

  // El pie del tótem dice qué es real en esta presentación (puertas con sensor real; mesa piloto real
  // solo con la ESP32-CAM). Se dibuja encima del pie normal mientras dura la sección.
  #parchearTotem() {
    const t = this.b3d.totem, yo = this;
    const original = Object.getPrototypeOf(t).dibujar;
    t.dibujar = function dibujar(fn) {
      return original.call(this, (ctx, w, h) => {
        fn(ctx, w, h);
        ctx.fillStyle = '#0b1220'; ctx.fillRect(0, h * 0.895, w, h * 0.105);
        const vivo = yo.sensores.enVivo;
        ctx.textAlign = 'center';
        ctx.fillStyle = vivo ? '#86efac' : yo.sensores.ensayo ? '#e9d5ff' : '#fde68a';
        ctx.font = `700 ${w * 0.038}px ${FUENTE}`;
        ctx.fillText(vivo ? 'Puertas: sensor real' : yo.sensores.ensayo ? 'Ensayo: puertas simuladas' : 'Esperando sensores', w / 2, h * 0.93);
        ctx.fillStyle = '#94a3b8'; ctx.font = `600 ${w * 0.033}px ${FUENTE}`;
        ctx.fillText(yo.#camaraViva() ? 'Mesa piloto: ESP32-CAM en vivo' : 'Mesa piloto y resto: simulados', w / 2, h * 0.968);
      });
    };
  }

  // Al salir, la mesa piloto vuelve a lo que diría la conexión (como en el resto de la app)
  #restaurarPiloto() {
    const f = this.app.fuentes, b = this.b, cam = this.app.estado.camara;
    const real = f.enVivo || f.modo === 'espera';
    PILOTO.forEach((id, i) => {
      b.get(id).estudiante = false;
      if (!real) return;
      const z = cam.asientos[i];
      if (!cam.conocida || !z || z.ocupado === null) b.marcarSinDato(id);
      else b.fijar(id, z.ocupado, { origen: 'real' });
    });
  }

  #aplicarPiloto() {
    if (!this.parches) return;
    if (this.#camaraViva()) { this.#marcarTuyo(); return; }     // la ESP32-CAM manda
    const b = this.b;
    PILOTO.forEach((id, k) => {
      const a = b.get(id);
      if (this.tuyo?.id === id && this.fase === 'sentado') {
        if (!a.ocupado || !a.estudiante) b.fijar(id, true, { estudiante: true, origen: 'sim', silencioso: true });
        return;
      }
      const ocupado = k < 2;                                   // A y B ocupadas · C y D libres
      if (a.ocupado !== ocupado || a.sinDato || a.objeto || a.estudiante) b.fijar(id, ocupado, { origen: 'sim', silencioso: true });
    });
    this.#reservarPiloto();
  }

  // Ningún estudiante simulado toma las sillas libres de la mesa piloto
  #reservarPiloto() { const r = this.m.reservas; for (const id of PILOTO) if (!r.has(id)) r.set(id, RESERVA); }

  // Con la cámara, tu asiento no debe dibujar a otra persona encima de ti
  #marcarTuyo() {
    if (this.fase !== 'sentado' || !this.tuyo) return;
    const a = this.b.get(this.tuyo.id);
    if (a.ocupado && !a.estudiante) a.estudiante = true;
  }

  // La gente de pie camina entre los estantes (sin cruzar puertas ni ocupar sillas)
  #vida(dt) {
    this.tVida -= dt;
    if (this.tVida > 0) return;
    this.tVida = 3.5 + Math.random() * 3;
    const m = this.m;
    for (const ag of m.agentes) if (ag.dentro && ag.t > -1e8 && (ag.destino === 'estante' || ag.destino === 'espera')) ag.t = -1e9;
    const quietos = m.agentes.filter((ag) => ag.visible && ag.dentro && !ag.caminando && ag.estado === 'caminando'
      && (ag.destino === 'estante' || ag.destino === 'espera') && Math.abs(ag.y - yPiso(ag.piso)) < 0.1);
    if (!quietos.length) return;
    const ag = quietos[Math.floor(Math.random() * quietos.length)];
    const opciones = ESTANTES_FRENTE.filter((p) => p.piso === ag.piso);
    const p = opciones[Math.floor(Math.random() * opciones.length)];
    if (!p) return;
    let pts;
    try { pts = rutaInterior({ x: ag.x, z: ag.z, piso: ag.piso }, { x: p.x + (Math.random() - 0.5) * 1.2, z: p.z + (Math.random() - 0.5) * 0.8, piso: p.piso }); } catch { return; }
    if (!pts || pts.length < 2) return;
    seguir(ag, pts);
    Object.assign(ag, { destino: 'estante', estado: 'caminando', t: -1e9 });
  }

  // ================================================================ estados
  #irA(fase) {
    if (this.fase === fase) return;
    const antes = this.fase;
    this.fase = fase;
    this.tEstado = 0;
    this.#log('estado', NOMBRE[fase]);
    this.clavesAcciones = null;
    this.ayudas?.marcarTodo();
    this.vr?.refrescar();
    this.app.actualizarPistas();
    if (fase === 'calibracion') this.#pintarGuia();
    if (fase === 'a2m' || fase === 'caminando') {
      if (this.enVR) this.ayudas.panelGuia.malla.visible = false;
      this.b3d.mostrarRuta([{ x: XP, y: 0, z: Z1 + DISTANCIA_INICIO + 0.4 }, { x: XP, y: 0, z: Z1 - 0.9 }]);
      this.b3d.marcarDestino(null);
    }
    if (fase === 'recorriendo') {
      this.liberado = true;
      this.#calcularRuta();
      if (antes === 'ingreso') H.banner('Ve a la mesa piloto 1-01', 'info', `Es la única con sillas libres (aro dorado). ${this.enVR ? 'Pulsa A para avanzar por la ruta.' : 'Pulsa Enter para ir solo, o camina con W A S D.'}`, 5000);
    }
    if (fase === 'mesa') {
      this.b3d.ocultarRuta();
      this.b3d.marcarDestino(null);
      const libres = this.#libresPiloto();
      this.son.seleccion();
      H.banner(`Mesa piloto ${MESA.id} identificada`, 'ok', libres.length
        ? `Sillas libres: ${libres.map(letra).join(' y ')} (verdes). ${this.enVR ? 'Apunta a una con el gatillo o pulsa A.' : 'Mírala y pulsa E, o usa las teclas 1–4.'}`
        : 'No quedan sillas libres en esta mesa.', 5000);
    }
    if (fase === 'seleccion') { this.b3d.ocultarRuta(); this.b3d.marcarDestino(this.seleccion); }
    if (fase === 'sentado') { this.b3d.ocultarRuta(); this.b3d.marcarDestino(null); }
  }

  // ================================================================ sensores reales
  #alEntrada(ev) {
    const ensayo = ev.origen === 'ensayo';
    if (!ev.real && !ensayo) return;
    if (ev.rebote) {
      this.#log('aviso', `S1: otra detección en menos de 1,2 s → se toma como la misma persona (rebote)${ev.contador != null ? `; el ESP32 marca entradas = ${ev.contador}` : ''}`);
      return;
    }
    const esperandome = !this.entro && (this.fase === 'a2m' || this.fase === 'caminando');
    if (esperandome) this.#ingresar(ev);
    else {
      this.#otraEntrada(ev);
      if (!this.entro && this.fase === 'calibracion') H.banner('El sensor S1 detectó a alguien', 'info', 'Todavía no calibras: ese paso no se tomó como tu ingreso. Calibra con A y luego camina hacia el sensor.', 4600);
    }
  }

  #ingresar(ev) {
    const ensayo = ev.origen === 'ensayo';
    this.entro = true;
    this.tIngreso = performance.now();
    this.ingreso = { ensayo, via: ev.via, contador: ev.contador, conexion: ensayo ? 'Ensayo' : this.#textoVia(), t: new Date() };
    const antes = this.b.puertas.dentro;
    this.b.entrar(1, { estudiante: true });
    this.b3d.pulsarPuerta('entrada');
    this.ayudas.destellar();
    this.b3d.flotante(ensayo ? '+1 ensayo' : '+1 · tú', XP, 3.1, Z1, ensayo ? '#c084fc' : '#4ade80');
    this.son.sensor('entrada');
    this.#vibrar(0.8, 180);
    this.#irA('sensor');
    H.banner(ensayo ? 'Ensayo: ingreso simulado' : '¡El sensor S1 real te detectó!', ensayo ? 'info' : 'ok',
      `${ensayo ? `Ensayo, no es el sensor (${ev.via})` : this.#textoVia()} · personas dentro ${antes} → ${this.b.puertas.dentro}`, 4800);
    this.#log(ensayo ? 'ensayo' : 'real', `Tu ingreso por S1${ev.contador != null ? ` · ESP32: entradas = ${ev.contador}` : ''} · ${ev.via}`);
    if (!this.enVR) this.#cruzarPuerta();
  }

  #otraEntrada(ev) {
    const ensayo = ev.origen === 'ensayo';
    const antes = this.b.puertas.dentro;
    this.b.entrar(1);
    this.b3d.pulsarPuerta('entrada');
    this.ayudas.destellar();
    this.b3d.flotante(ensayo ? '+1 ensayo' : '+1', XP, 3.1, Z1, ensayo ? '#c084fc' : '#4ade80');
    this.son.sensor('entrada');
    this.#log(ensayo ? 'ensayo' : 'real', `S1: entró otra persona · dentro ${antes} → ${this.b.puertas.dentro}`);
    if (this.entro) H.banner('Sensor S1: entró otra persona', 'info', `${ensayo ? 'Ensayo (simulado)' : 'Dato real del ESP32'} · personas dentro ${antes} → ${this.b.puertas.dentro}`, 3200);
  }

  #alSalida(ev) {
    const ensayo = ev.origen === 'ensayo';
    if (!ev.real && !ensayo) return;
    if (ev.rebote) { this.#log('aviso', 'S2: otra detección en menos de 1,2 s (rebote): no se descuenta otra vez'); return; }
    const antes = this.b.puertas.dentro;
    this.b.salir(1);
    this.b3d.pulsarPuerta('salida');
    this.b3d.flotante(ensayo ? '−1 ensayo' : '−1', XS, 3.1, Z1, ensayo ? '#c084fc' : '#7dd3fc');
    this.son.sensor('salida');
    this.#log(ensayo ? 'ensayo' : 'real', `S2: salió una persona · dentro ${antes} → ${this.b.puertas.dentro}`);
    if (!this.entro && (this.fase === 'a2m' || this.fase === 'caminando')) H.banner('Ese fue el sensor S2 (SALIDA)', 'alerta', 'Para entrar, pasa frente al sensor S1 de la ENTRADA.', 4200);
    else H.banner('Sensor S2: salió una persona', 'info', `${ensayo ? 'Ensayo (simulado)' : 'Dato real del ESP32'} · personas dentro ${antes} → ${this.b.puertas.dentro}`, 3200);
  }

  #alReinicioESP(e) {
    this.#log('aviso', `El ESP32 se reinició: su contador de entradas pasó de ${e.antes ?? '?'} a ${e.ahora}`);
    H.banner('El ESP32 se reinició', 'alerta', 'Su contador volvió a empezar. La presentación lo detectó y sigue contando sin duplicar.', 4600);
  }

  #alBasura(e) {
    this.#log('aviso', `Llegan caracteres ilegibles a ${e.baudios} baudios: el programa usa otra velocidad`);
    if (this.avisoBasura) return;
    this.avisoBasura = true;
    H.banner('El puerto muestra caracteres raros', 'alerta', `Ese programa no usa ${e.baudios} baudios. En la pestaña Conexión elige 9600 (o la del Serial.begin) y pulsa «Reabrir».`, 7000);
  }

  #alCambiarFuente() {
    // si al cambiar de fuente la simulación soltó la mesa piloto, esas figuras no se van por la puerta
    this.m.agentes = this.m.agentes.filter((ag) => !(ag.estado === 'levantandose' && PILOTO.includes(ag.asientoDejado)));
    this.#aplicarPiloto();
    this.#log('sistema', `Fuente de datos: ${this.sensores.estadoConexion().detalle}`);
    this.clavesAcciones = null;
  }

  #alCamara() {
    if (!this.parches) return;
    if (!this.#camaraViva()) { this.#aplicarPiloto(); return; }
    this.#marcarTuyo();
    this.#revisarAsientos();
  }

  #alAsientoPiloto() {
    this.#marcarTuyo();
    this.claveMesa = '';
    this.#revisarAsientos();
  }

  // ¿Se ocupó la silla elegida? ¿La ESP32-CAM confirmó la tuya?
  #revisarAsientos() {
    const cam = this.app.estado.camara;
    if (this.seleccion && this.fase !== 'sentado' && !this.#libre(this.seleccion)) {
      const a = this.seleccion;
      this.seleccion = null;
      this.sentarAlLlegar = false;
      this.esc.marcar({ elegido: null });
      this.b3d.marcarDestino(null);
      this.son.alerta();
      H.banner(`La silla ${letra(a)} se ocupó`, 'alerta', `${this.#camaraViva() ? `La ESP32-CAM real ve ocupada la zona ${zona(a)}` : 'Alguien se sentó'}: elige otra silla libre.`, 4600);
      this.#log('camara', `${a.id} se ocupó antes de que te sentaras`);
      if (this.fase === 'seleccion') this.#irA('mesa');
    }
    if (this.fase === 'sentado' && this.tuyo && this.#camaraViva()) {
      const z = cam.asientos[PILOTO.indexOf(this.tuyo.id)];
      const ok = z?.ocupado === true;
      if (ok && !this.confirmado) {
        this.confirmado = { t: new Date(), pct: z.pct };
        this.son.exito();
        H.banner('¡La ESP32-CAM confirmó tu asiento!', 'ok', `Zona ${zona(this.tuyo)} ocupada (cambio ${Math.round(z.pct)} %): el asiento físico coincide con el del simulador.`, 5600);
        this.#log('real', `ESP32-CAM: ${zona(this.tuyo)} ocupada → asiento ${this.tuyo.id} confirmado`);
      } else if (!ok && this.confirmado) {
        this.confirmado = null;
        H.banner('La ESP32-CAM ya no ve ocupado tu asiento', 'alerta', `La zona ${zona(this.tuyo)} aparece libre en la cámara real.`, 4600);
        this.#log('camara', `ESP32-CAM: ${zona(this.tuyo)} libre`);
      }
    }
  }

  // ================================================================ calibración (visor)
  #calibrarRapida() {
    if (!this.enVR) { H.banner('La calibración es para el visor', 'info', 'En la computadora la entrada ya está a 2 m.', 2800); return; }
    if (this.entro) return;
    const cam = this.vr.camara;
    const cal = calibrarRapida({ x: cam.position.x, z: cam.position.z }, rumboLocal(cam.quaternion));
    this.#usarCalibracion(cal, cam.position.y);
  }

  #iniciarPrecisa() {
    if (!this.enVR || this.entro) return;
    this.calPaso = 'sensor';
    this.sensorTocado = null;
    this.cal = null;
    if (this.fase !== 'calibracion') this.#irA('calibracion');
    const c = this.vr.posicionCabeza(this.tmp);
    this.ayudas.colocarGuia(c, this.vr.rumboCabeza());
    this.#pintarGuia();
  }

  #cancelarPrecisa() { this.calPaso = null; this.sensorTocado = null; this.#pintarGuia(); }

  // Paso 1 de la precisa: la punta del control derecho toca el sensor y se aprieta el gatillo
  #gatilloCalibracion() {
    const der = this.vr.controles.find((c) => c.lado === 'right');
    const pres = !!der?.fuente?.gamepad?.buttons?.[0]?.pressed;
    const flanco = pres && !this.gatilloPrevio;
    this.gatilloPrevio = pres;
    if (!flanco || this.calPaso !== 'sensor') return;
    const p = der.controller.position;              // espacio del visor (el control es hijo del rig)
    this.sensorTocado = { x: p.x, z: p.z };
    this.calPaso = 'inicio';
    this.#vibrar(0.7, 120, 'right');
    this.son.seleccion();
    this.#log('calibracion', 'Sensor S1 tocado con el control: posición registrada');
    this.#pintarGuia();
  }

  #fijarInicioPrecisa() {
    const cam = this.vr.camara;
    try { this.#usarCalibracion(calibrarDosPuntos({ x: cam.position.x, z: cam.position.z }, this.sensorTocado), cam.position.y); }
    catch (e) { this.son.error(); H.banner('No se pudo calibrar', 'alerta', e.message, 4600); }
  }

  #usarCalibracion(cal, cabY) {
    const vr = this.vr;
    cal.y = vr.sinPiso ? 1.6 - cabY : 0;
    this.cal = cal;
    this.calPaso = null; this.sensorTocado = null; this.liberado = false;
    aplicarAlRig(vr.rig, cal);
    vr.nivel = 1;
    this.ayudas.panelGuia.malla.visible = false;
    this.son.seleccion();
    this.#vibrar(0.6, 140);
    this.#log('calibracion', `Visor calibrado (${cal.metodo === 'precisa' ? 'precisa: sensor tocado' : 'rápida: sensor 2 m al frente'}) · distancia al sensor ${textoMetros(cal.distancia)}`);
    H.banner('Visor calibrado', 'ok', `El sensor S1 virtual quedó sobre el real, a ${textoMetros(cal.distancia)}. Camina hacia él: el stick queda bloqueado hasta que el sensor te detecte.`, 5600);
    this.#irA(cal.distancia >= 1.7 ? 'a2m' : 'caminando');
    this.vr.refrescar();
  }

  #alResetXR() {
    if (this.entro || !this.cal) return;
    this.cal = null;
    this.calPaso = null;
    this.#irA('calibracion');
    this.panelPendiente = true;
    H.banner('El visor se recentró', 'alerta', 'La calibración se perdió: vuelve a pararte a 2 m del sensor y pulsa A.', 5200);
  }

  // Coloca la cabeza en (x, z) mirando hacia "rumbo" (compensa hacia dónde mira la persona en la sala real)
  #colocarVR(x, z, rumbo, y = 0) {
    const vr = this.vr;
    vr.colocar({ x, y, z, rumbo: rumbo - rumboLocal(vr.camara.quaternion), escala: 1 });
    vr.nivel = nivelPorAltura(y, vr.nivel);
  }

  #vibrar(intensidad = 0.5, ms = 80, lado = null) {
    for (const c of this.vr?.controles || []) {
      if (lado && c.lado !== lado) continue;
      try { c.fuente?.gamepad?.hapticActuators?.[0]?.pulse?.(intensidad, ms); } catch { /* sin vibración */ }
    }
  }

  // ================================================================ moverse
  // Escritorio: primera persona; la puerta no deja pasar hasta que el sensor real detecte el ingreso
  #caminarDesde({ x, z, rumbo = 0, piso = 1 }) {
    this.j.iniciar({ x, z, piso, rumbo, velocidad: 1.45, conservar: true });
    const base = this.app.control.paseo.libre;
    const P = PLANO.puertas.entrada;
    // el vano de la ENTRADA se puede cruzar sin trabarse en el borde de la fachada (si ya se abrió)
    const enVano = (px, pz) => px > P.x0 + 0.3 && px < P.x1 - 0.3 && pz > Z1 - 0.45 && pz < Z1 + 0.45;
    this.app.control.paseo.libre = (px, pz) => {
      if (this.auto) return false;
      const abierta = this.entro || this.sensores.ensayo;
      if (abierta && enVano(px, pz)) return true;
      return base(px, pz) && (abierta || pz > Z1 + 0.45);
    };
    this.j.describir = (h) => this.describir(h);
    this.j.alInteractuar = (h) => this.interactuar(h);
  }

  // Escritorio: la vista cruza la puerta sola cuando el sensor S1 real detecta el ingreso
  #cruzarPuerta() {
    const c = this.app.control.camara.position;
    const rumboMesa = rumboDe(MESA.x - XP, MESA.z - (Z1 - 1.8));
    const pts = c.z > Z1 + 0.3 ? [{ x: XP, z: Z1 + 0.3 }, { x: XP, z: Z1 - 1.8 }] : [{ x: c.x, z: Math.min(c.z - 0.05, Z1 - 1.8) }];
    this.#autoCaminar(pts, { vel: 1.5, rumboFinal: rumboMesa });
  }

  #autoCaminar(pts, { vel = 1.45, rumboFinal = null, alFinal = null } = {}) {
    const c = this.app.control.camara.position;
    const P = [{ x: c.x, z: c.z }, ...pts.map((p) => ({ x: p.x, z: p.z }))];
    const L = largos(P);
    this.auto = { P, L, total: L[L.length - 1], d: 0, vel, rumboFinal, alFinal, extra: 0 };
  }

  #avanzarAuto(dt) {
    const a = this.auto;
    if (!a) return;
    if (this.enVR || this.app.control.modo !== 'caminar') { this.auto = null; return; }
    const cam = this.app.control.camara.position, paseo = this.app.control.paseo;
    a.d = Math.min(a.total, a.d + a.vel * dt);
    const q = puntoEn(a.P, a.L, a.d);
    cam.x = q.x; cam.z = q.z;
    const final = a.d >= a.total - 0.02;
    const objetivo = final && a.rumboFinal != null ? a.rumboFinal : q.rumbo;
    let dr = objetivo - paseo.yaw;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    paseo.yaw += dr * Math.min(1, dt * 4.5);
    paseo.pitch += (-0.1 - paseo.pitch) * Math.min(1, dt * 3);
    if (final) a.extra += dt;
    if (final && (Math.abs(dr) < 0.04 || a.extra > 1.4)) { this.auto = null; a.alFinal?.(); }
  }

  // Visor: saltos cortos con fundido a negro a lo largo de la ruta (cómodo y sin mareo)
  #saltar(pts, rumboFinal) {
    const L = largos(pts), total = L[L.length - 1];
    const paradas = [];
    for (let d = 2.6; d < total - 0.8; d += 2.6) paradas.push(puntoEn(pts, L, d));
    paradas.push({ ...puntoEn(pts, L, total), final: true });
    this.saltos = { paradas, i: 0, t: 0.05, rumboFinal };
  }

  #avanzarSaltos(dt) {
    const s = this.saltos;
    if (!s || this.ayudas.fundiendo) return;
    if (!this.enVR) { this.saltos = null; return; }
    s.t -= dt;
    if (s.t > 0) return;
    const p = s.paradas[s.i];
    const sig = s.paradas[s.i + 1];
    const rumbo = p.final ? s.rumboFinal : sig ? rumboDe(sig.x - p.x, sig.z - p.z) : p.rumbo;
    const final = !!p.final;
    this.ayudas.fundir(() => {
      this.#colocarVR(p.x, p.z, rumbo, 0);
      if (final) this.#llegoAMesa();
    });
    s.i++;
    s.t = 0.7;
    if (s.i >= s.paradas.length) this.saltos = null;
  }

  #pausarSaltos() { this.saltos = null; this.auto = null; }

  // ================================================================ la mesa piloto
  #libre(a) { return !!a && this.b.estadoDe(a) === 'libre' && !this.m.sentandoseEn(a.id) && !(this.tuyo?.id === a.id); }
  #libresPiloto() {
    const p = this.j.pos;
    return PILOTO.map((id) => this.b.get(id)).filter((a) => this.#libre(a))
      .sort((x, y) => Math.hypot(x.x - p.x, x.z - p.z) - Math.hypot(y.x - p.x, y.z - p.z));
  }
  #objetivoMesa() { return this.seleccion || this.#libresPiloto()[0] || null; }
  #cerca(a, d) { const p = this.j.pos; return p.piso === a.piso && Math.hypot(p.x - a.x, p.z - a.z) < d; }
  #distMesa() { const p = this.j.pos; return p.piso === 1 ? Math.hypot(p.x - MESA.x, p.z - MESA.z) : Infinity; }

  #calcularRuta() {
    const a = this.#objetivoMesa();
    const p = this.j.pos;
    const acc = a ? accesoAsiento(a) : { x: MESA.x, z: MESA.z + 1.7 };
    let pts;
    try {
      if (p.z > Z1 - 0.3) pts = [{ x: p.x, y: 0, z: p.z }, { x: XP, y: 0, z: Z1 - 0.8 }, ...ruta({ x: XP, z: Z1 - 0.8, piso: 1 }, { x: acc.x, z: acc.z, piso: 1 }).pts.slice(1)];
      else pts = ruta({ x: p.x, z: p.z, piso: p.piso }, { x: acc.x, z: acc.z, piso: 1 }).pts;
    } catch { pts = [{ x: p.x, y: 0, z: p.z }, { x: acc.x, y: 0, z: acc.z }]; }
    if (pts.length < 2) pts = [{ x: p.x, y: 0, z: p.z }, { x: acc.x, y: 0, z: acc.z }];
    this.rutaPts = pts;
    this.rutaMetros = largos(pts).at(-1);
    this.b3d.mostrarRuta(pts);
    this.b3d.marcarDestino(a || { x: MESA.x, z: MESA.z, piso: 1 });
    this.ultimaPosRuta = { x: p.x, z: p.z };
    this.tRuta = 0.5;
  }

  #irALaMesa() {
    if (!this.entro || this.fase === 'sentado') return;
    if (this.saltos || this.auto) { this.#pausarSaltos(); return; }
    const a = this.#objetivoMesa();
    if (!a) { this.son.error(); H.banner('La mesa piloto no tiene sillas libres', 'alerta', this.#camaraViva() ? 'La ESP32-CAM real ve ocupadas las cuatro zonas.' : '', 3800); return; }
    this.#calcularRuta();
    const rumboFinal = a.mira > 0 ? Math.PI : 0;
    if (this.enVR) this.#saltar(this.rutaPts, rumboFinal);
    else this.#autoCaminar(this.rutaPts.slice(1), { rumboFinal, alFinal: () => this.#llegoAMesa() });
  }

  #llegoAMesa() {
    if (this.fase === 'recorriendo' || this.fase === 'ingreso') this.#irA(this.seleccion ? 'seleccion' : 'mesa');
    if (this.sentarAlLlegar && this.seleccion) { this.sentarAlLlegar = false; this.#sentarse(this.seleccion); }
  }

  #elegir(a, { silencio = false } = {}) {
    if (!a) return false;
    if (!this.entro) { this.son.error(); H.banner('Primero entra a la biblioteca', 'info', 'Pasa frente al sensor S1 real: el simulador te deja entrar cuando el sensor te detecta.', 3600); return false; }
    if (this.fase === 'sentado') return false;
    if (!a.piloto) { this.son.error(); H.banner(`Asiento ${a.id} ocupado`, 'alerta', 'El piso 1 y el sótano están llenos: la única mesa con sillas libres es la mesa piloto 1-01 (aro dorado).', 3800); return false; }
    if (!this.#libre(a)) { this.son.error(); H.banner(`Silla ${letra(a)} ocupada`, 'alerta', this.#camaraViva() ? `La ESP32-CAM real ve ocupada la zona ${zona(a)}.` : 'En la simulación ya hay alguien sentado ahí.', 3400); return false; }
    this.seleccion = a;
    this.esc.marcar({ elegido: a.id });
    this.b3d.marcarDestino(a);
    if (!silencio) this.son.seleccion();
    this.#log('seleccion', `Elegiste ${a.id} (zona ${zona(a)} de la ESP32-CAM) · selección virtual`);
    H.banner(`Elegiste la silla ${letra(a)} · ${a.id}`, 'info', `Selección virtual. ${this.#camaraViva() ? `La ESP32-CAM confirmará cuando vea ocupada la zona ${zona(a)}.` : 'Sin ESP32-CAM conectada: no habrá confirmación física.'} ${this.enVR ? 'A: sentarme.' : 'Enter: sentarme.'}`, 4200);
    if (this.#distMesa() < CERCA_MESA) this.#irA('seleccion');
    else if (this.fase === 'recorriendo') this.#calcularRuta();
    this.claveMesa = '';
    this.clavesAcciones = null;
    return true;
  }

  #elegirCercano() {
    const [a] = this.#libresPiloto();
    if (!a) { this.son.error(); H.banner('No quedan sillas libres en la mesa piloto', 'alerta', '', 3000); return; }
    this.#elegir(a);
  }

  #elegirOSentarse(id) {
    const a = this.b.get(id);
    if (this.seleccion?.id === id) this.#sentarse(a);
    else this.#elegir(a);
  }

  #sentarse(a = this.seleccion) {
    if (!this.entro || this.fase === 'sentado') return;
    if (!a) { this.#elegirCercano(); return; }
    if (!this.#libre(a)) { this.#elegir(a); return; }
    if (!this.#cerca(a, ALCANCE)) {
      // lejos de la silla: primero se llega (y al llegar se sienta)
      this.seleccion = a;
      this.esc.marcar({ elegido: a.id });
      this.sentarAlLlegar = true;
      this.saltos = null; this.auto = null;
      this.#irALaMesa();
      return;
    }
    this.saltos = null; this.auto = null;
    this.tuyo = a;
    this.seleccion = null;
    this.sentarAlLlegar = false;
    this.confirmado = null;
    const virtual = !this.#camaraViva();
    if (virtual) this.b.fijar(a.id, true, { estudiante: true, origen: 'sim' });
    this.esc.marcar({ tuyo: a.id, elegido: null });
    this.rutaPts = null;
    if (this.enVR) this.ayudas.fundir(() => this.#sentarVR(a), { bajar: 0.3, subir: 0.45 });
    else this.j.sentarEn(a);
    this.son.sentarse();
    this.b3d.flotante('tu asiento', a.x, yPiso(a.piso) + 1.6, a.z, '#38bdf8', { escala: 0.8 });
    this.#irA('sentado');
    H.banner(`Te sentaste en la silla ${letra(a)} · ${a.id}`, 'ok', virtual
      ? 'Asiento virtual (sin ESP32-CAM): no hay confirmación física.'
      : `Esperando que la ESP32-CAM vea ocupada la zona ${zona(a)}…`, 5600);
    this.#log('seleccion', `Sentado en ${a.id} (${virtual ? 'virtual, sin confirmación física' : 'esperando a la ESP32-CAM'})`);
    this.#marcarTuyo();
    this.#revisarAsientos();
  }

  // En el visor: los ojos a la altura de alguien sentado. Si la persona se sienta de verdad en una
  // silla, la vista se ajusta sola (y si se pone de pie, también).
  #sentarVR(a) {
    const vr = this.vr;
    const objetivo = yPiso(a.piso) + OJOS_SENTADO;
    const y = objetivo - (vr.sinPiso ? 1.6 : vr.camara.position.y);
    this.#colocarVR(a.x, a.z - a.mira * 0.12, a.mira > 0 ? Math.PI : 0, y);
    vr.nivel = a.piso;
    this.ajusteSentado = { objetivo, tFuera: 0 };
  }

  #sentadoVR(dt) {
    const s = this.ajusteSentado;
    if (!s || !this.enVR || this.fase !== 'sentado' || this.ayudas.fundiendo) return;
    const vr = this.vr;
    const ojos = vr.rig.position.y + vr.camara.position.y;
    if (Math.abs(ojos - s.objetivo) > 0.25) s.tFuera += dt; else s.tFuera = 0;
    if (s.tFuera > 0.9) {
      s.tFuera = 0;
      this.ayudas.fundir(() => { vr.rig.position.y += s.objetivo - (vr.rig.position.y + vr.camara.position.y); vr.rig.updateMatrixWorld(true); });
    }
  }

  #levantarse() {
    if (this.fase !== 'sentado' || !this.tuyo) return;
    const a = this.tuyo;
    if (!this.#camaraViva()) this.b.fijar(a.id, false, { estudiante: true, origen: 'sim' });
    else this.b.get(a.id).estudiante = false;
    this.tuyo = null; this.confirmado = null; this.ajusteSentado = null;
    this.esc.marcar({ tuyo: null, elegido: null });
    const acc = accesoAsiento(a);
    const rumbo = a.mira > 0 ? Math.PI : 0;
    if (this.enVR) this.ayudas.fundir(() => this.#colocarVR(acc.x, acc.z, rumbo, 0));
    else this.#caminarDesde({ x: acc.x, z: acc.z, rumbo });
    this.#irA('mesa');
    this.#log('seleccion', `Te levantaste de ${a.id}`);
  }

  // ================================================================ ensayo (sin sensores)
  #alternarEnsayo() {
    const s = this.sensores;
    s.ensayo = !s.ensayo;
    this.#log('ensayo', s.ensayo ? 'Modo ensayo activado: lo que se pulse se marca como SIMULADO' : 'Modo ensayo desactivado');
    H.banner(s.ensayo ? 'Modo ensayo' : 'Ensayo desactivado', 'info', s.ensayo ? `Simula el paso por S1 con ${this.enVR ? 'el tablero (B)' : 'la tecla I'}. Todo queda marcado como simulado.` : 'Solo cuentan los sensores reales.', 3800);
    this.clavesAcciones = null;
    this.vr?.refrescar();
    if (this.app.hud.proveedor === this.proveedorActual) this.app.hud.refrescarPestana();
  }

  #sugerirEnsayo() {
    H.banner('Esa tecla es del modo ensayo', 'info', 'Actívalo en la pestaña Presentación (o con T) para simular el paso por S1 sin sensores.', 3600);
  }

  // ================================================================ lo que se apunta y se usa
  describir(h) {
    const info = describirObjeto(this.app, h);
    if (!info) return null;
    if (h.tipo === 'asiento') {
      const a = info.a;
      if (a.piloto) {
        const libre = this.#libre(a);
        const origen = this.#camaraViva() ? `ESP32-CAM real · zona ${zona(a)}` : 'simulada (sin ESP32-CAM)';
        info.detalle = `Mesa piloto · ${origen} · ${h.distancia.toFixed(0)} m`;
        if (this.tuyo?.id === a.id) { info.titulo = `Silla ${letra(a)} · tu asiento`; info.detalle = this.confirmado ? 'Confirmado por la ESP32-CAM' : this.#camaraViva() ? `Esperando a la cámara (zona ${zona(a)})` : 'Selección virtual'; }
        else if (libre && this.entro && this.fase !== 'sentado') info.accion = this.seleccion?.id === a.id ? 'E · Sentarme aquí' : 'E · Elegir esta silla';
      } else info.detalle = 'Biblioteca llena: solo la mesa piloto tiene sillas libres';
    } else if (h.tipo === 'mesa' && h.id === MESA.id) {
      info.titulo = 'Mesa piloto 1-01 · la maqueta';
      const libres = this.#libresPiloto().length;
      info.detalle = `${libres} de 4 sillas libres · ${this.#camaraViva() ? 'ESP32-CAM en vivo' : 'simulada (sin ESP32-CAM)'}`;
      if (libres && this.entro && this.fase !== 'sentado') info.accion = 'E · Elegir la silla libre más cercana';
    } else if (h.tipo === 'puerta' && h.id === 'entrada') {
      info.detalle = this.entro ? 'Ya entraste: el sensor S1 real te contó' : 'Se abre cuando el sensor S1 REAL detecta a alguien';
    }
    return info;
  }

  interactuar(h) {
    if (h?.tipo === 'asiento') {
      const a = this.b.get(h.id);
      if (this.fase === 'sentado') { if (a.id === this.tuyo?.id) this.#estadoSentado(); return; }
      if (this.seleccion?.id === a.id && this.#cerca(a, ALCANCE)) { this.#sentarse(a); return; }
      this.#elegir(a);
      return;
    }
    if (h?.tipo === 'mesa' && h.id === MESA.id && this.entro && this.fase !== 'sentado') { this.#elegirCercano(); return; }
    if (h?.tipo === 'totem') { H.banner('Tótem de disponibilidad', 'info', `Piso 1: ${this.b.libres(1)} libres · Sótano: ${this.b.libres(2)} libres · ${this.b.puertas.dentro}/${this.b.puertas.aforo} personas`, 3600); return; }
    this.accionA();
  }

  // En el visor el gatillo solo actúa sobre sillas, la mesa piloto y el tótem (la acción principal es A)
  interactuarVR(h) {
    if (h?.tipo === 'asiento' || h?.tipo === 'totem' || (h?.tipo === 'mesa' && h.id === MESA.id)) this.interactuar(h);
  }

  #estadoSentado() {
    if (!this.tuyo) return;
    const z = this.app.estado.camara.asientos[PILOTO.indexOf(this.tuyo.id)];
    if (this.confirmado) H.banner(`Silla ${letra(this.tuyo)} confirmada`, 'ok', `La ESP32-CAM ve ocupada la zona ${zona(this.tuyo)} (cambio ${Math.round(z?.pct || 0)} %).`, 3600);
    else if (this.#camaraViva()) H.banner(`Silla ${letra(this.tuyo)} · selección virtual`, 'info', `La ESP32-CAM aún ve libre la zona ${zona(this.tuyo)}: para confirmarlo, ocupa esa silla de la maqueta.`, 4200);
    else H.banner(`Silla ${letra(this.tuyo)} · selección virtual`, 'info', 'Sin ESP32-CAM conectada: no hay confirmación física del asiento.', 3600);
  }

  // Acción principal (A en el visor, Enter en el teclado)
  textoA() {
    switch (this.fase) {
      case 'calibracion': return this.calPaso === 'sensor' ? 'Cancelar' : this.calPaso === 'inicio' ? 'Fijar inicio' : 'Calibrar aquí';
      case 'a2m': return this.enVR ? 'Recalibrar' : (this.sensores.ensayo ? 'Ensayo: S1' : 'Esperando S1');
      case 'caminando': return this.sensores.ensayo && !this.enVR ? 'Ensayo: S1' : 'Pasa el sensor';
      case 'sensor': case 'ingreso': return '¡Detectado!';
      case 'recorriendo': return this.saltos || this.auto ? 'Pausar' : 'Ir a la mesa';
      case 'mesa': return 'Elegir silla';
      case 'seleccion': return 'Sentarme';
      case 'sentado': return 'Mi asiento';
      default: return '—';
    }
  }

  accionA() {
    switch (this.fase) {
      case 'calibracion':
        if (this.calPaso === 'sensor') this.#cancelarPrecisa();
        else if (this.calPaso === 'inicio') this.#fijarInicioPrecisa();
        else this.#calibrarRapida();
        break;
      case 'a2m':
        if (this.enVR) this.#calibrarRapida();
        else if (this.sensores.ensayo) this.sensores.entradaEnsayo();
        else H.banner('Esperando al sensor S1 real', 'info', 'Pasa frente al sensor de la ENTRADA. Sin sensores, activa el modo ensayo (T).', 3400);
        break;
      case 'caminando':
        if (!this.enVR && this.sensores.ensayo) this.sensores.entradaEnsayo();
        break;
      case 'recorriendo': this.#irALaMesa(); break;
      case 'mesa': this.#elegirCercano(); break;
      case 'seleccion': this.#sentarse(this.seleccion); break;
      case 'sentado': this.#estadoSentado(); break;
      default: break;
    }
    this.clavesAcciones = null;
  }

  // ================================================================ visor (Meta Quest 3)
  inicioVR() { return { x: XP, z: Z1 + DISTANCIA_INICIO, piso: 1, rumbo: 0 }; }
  asientoVR() { return this.fase === 'sentado' ? this.tuyo : null; }

  alEntrarVR() {
    const vr = this.vr;
    if (!vr) return;
    this.ayudas.montar(this.esc.scene);
    this.esc.separarPisos(false);
    // la guía de calibración reemplaza a la ayuda inicial (Y la vuelve a mostrar, B abre el tablero)
    vr.panelAyuda.malla.visible = false;
    vr.inicioPendiente = false;
    vr.panelTablero.malla.visible = false;
    this.panelPendiente = true;
    if (!this.entro) {
      this.cal = null; this.liberado = false; this.calPaso = null;
      if (this.fase !== 'calibracion') this.#irA('calibracion'); else this.#pintarGuia();
    }
    try {
      const ref = this.app.motor.renderer.xr.getReferenceSpace();
      if (ref && ref !== this.refXR) {
        this.refXR?.removeEventListener?.('reset', this.alResetXR);
        this.alResetXR ||= () => this.#alResetXR();
        ref.addEventListener?.('reset', this.alResetXR);
        this.refXR = ref;
      }
    } catch { /* sin aviso de recentrado */ }
  }

  alSalirVR(pos) {
    this.refXR?.removeEventListener?.('reset', this.alResetXR);
    this.refXR = null;
    this.ayudas.panelGuia.malla.visible = false;
    this.saltos = null;
    this.ajusteSentado = null;
    if (this.fase === 'sentado' && this.tuyo) { this.j.sentarEn(this.tuyo); return; }
    if (!this.entro) {
      this.cal = null; this.calPaso = null;
      this.#caminarDesde({ x: XP, z: Z1 + DISTANCIA_INICIO, rumbo: 0 });
      if (this.fase === 'calibracion') this.#irA('a2m');
      return;
    }
    this.#caminarDesde(pos || { x: XP, z: Z1 - 1.8, rumbo: 0 });
  }

  botonesVR() {
    const s = this.sensores;
    const l = [];
    if (!this.entro) {
      l.push({ id: 'p-cal', texto: this.cal ? 'Recalibrar (2 m)' : 'Calibrar (2 m)', fn: () => { this.calPaso = null; this.#calibrarRapida(); } });
      if (!s.ensayo) l.push({ id: 'p-precisa', texto: 'Calibración precisa', fn: () => this.#iniciarPrecisa() });
    } else if (this.fase !== 'sentado') l.push({ id: 'p-cercano', texto: 'Silla más cercana', fn: () => this.#elegirCercano() });
    else l.push({ id: 'p-levantar', texto: 'Levantarme', fn: () => this.#levantarse() });
    if (s.ensayo) l.push({ id: 'p-s1', texto: 'Ensayo: S1', fn: () => s.entradaEnsayo(), acento: '#c084fc' }, { id: 'p-s2', texto: 'Ensayo: S2', fn: () => s.salidaEnsayo(), acento: '#c084fc' });
    l.push({ id: 'p-ensayo', texto: s.ensayo ? 'Ensayo ✓' : 'Modo ensayo', fn: () => this.#alternarEnsayo(), activo: s.ensayo });
    l.push({ id: 'p-reiniciar', texto: 'Reiniciar', fn: () => this.reiniciar() });
    return l.slice(0, 5);
  }

  lineasVR() {
    const con = this.sensores.estadoConexion();
    const l = [`PRESENTACIÓN · ${NOMBRE[this.fase].toUpperCase()}`, this.#instruccion(true)];
    l.push(`${this.sensores.ensayo ? 'ENSAYO (simulado)' : con.detalle} · dentro ${this.b.puertas.dentro}/${this.b.puertas.aforo} · libres ${this.b.libres()}`);
    return l;
  }

  // ================================================================ cada cuadro
  update(dt) {
    this.tEstado += dt;
    this.j.update(dt);
    const vr = this.enVR;
    // visor calibrado: el mundo queda fijo a la sala real mientras dura la aproximación
    if (vr && this.cal && !this.liberado) { aplicarAlRig(this.vr.rig, this.cal); this.vr.nivel = 1; }
    if (vr) this.#gatilloCalibracion();
    if (vr && this.panelPendiente && this.vr.cuadrosSesion > 4 && !this.vr.pendienteColocar) {
      this.panelPendiente = false;
      if (this.fase === 'calibracion') this.ayudas.colocarGuia(this.vr.posicionCabeza(this.tmp), this.vr.rumboCabeza());
    }
    // aproximación: distancia al sensor y estados
    this.dist = this.entro ? null : this.#medir();
    if (!this.entro) this.#aproximacion();
    if (this.fase === 'sensor' && this.tEstado > 0.9) this.#irA('ingreso');
    else if (this.fase === 'ingreso' && this.tEstado > 2.6 && !this.auto) this.#irA('recorriendo');
    if (this.fase === 'recorriendo' || this.fase === 'mesa' || this.fase === 'seleccion') this.#recorrido(dt);
    this.#avanzarAuto(dt);
    this.#avanzarSaltos(dt);
    this.#sentadoVR(dt);
    this.#vida(dt);
    this.#marcarTuyo();
    this.#actualizarAyudas(dt);
    const p = this.j.pos;
    const objetivo = this.seleccion || this.tuyo || (this.entro ? { x: MESA.x, z: MESA.z, piso: 1 } : { x: XP, z: Z1, piso: 1 });
    this.app.minimapa.update(dt, { pos: p, rumbo: this.j.rumbo, objetivo, ruta: this.rutaPts });
    this.tHud -= dt;
    if (this.tHud <= 0) {
      this.tHud = 0.25;
      H.kpis(this.app);
      this.#pintarObjetivo();
      this.#acciones();
    }
  }

  #medir() {
    if (this.enVR) return this.cal ? distanciaAlSensor(this.cal, this.vr.camara.position) : null;
    return distanciaEscritorio(this.app.control.camara.position);
  }

  #aproximacion() {
    const d = this.dist;
    if (this.fase === 'calibracion' || d == null) return;
    if (this.fase === 'a2m' && d < 1.7) this.#irA('caminando');
    else if (this.fase === 'caminando' && d > 1.88) this.#irA('a2m');
    // ¿cruzó la puerta virtual sin que el sensor real lo detecte? (solo pasa con el visor)
    const z = this.enVR ? this.vr.posicionCabeza(this.tmp).z : this.app.control.camara.position.z;
    // en ensayo (sin sensores), cruzar la puerta virtual hace de sensor (y queda marcado como simulado)
    if (z < Z1 && this.sensores.ensayo) { this.sensores.entradaEnsayo('cruzó la puerta virtual'); return; }
    const cruzo = z < Z1 - 0.25;
    if (cruzo !== this.cruzoSinSensor) {
      this.cruzoSinSensor = cruzo;
      if (cruzo) {
        this.#log('aviso', 'Cruzaste la puerta virtual sin detección del sensor S1');
        H.banner('Cruzaste la puerta virtual', 'alerta', 'Pero el sensor S1 real todavía no te detecta: pasa frente a él (el haz infrarrojo debe cortarse).', 4600);
      }
    }
  }

  #recorrido(dt) {
    const dMesa = this.#distMesa();
    if (this.fase === 'recorriendo' && dMesa < CERCA_MESA) this.#llegoAMesa();
    else if ((this.fase === 'mesa' || this.fase === 'seleccion') && dMesa > CERCA_MESA + 2.5 && !this.saltos && !this.auto) this.#irA('recorriendo');
    if (this.fase === 'mesa' && this.seleccion) this.#irA('seleccion');
    if (this.fase === 'seleccion' && !this.seleccion) this.#irA('mesa');
    if (this.fase === 'recorriendo' && !this.saltos && !this.auto) {
      this.tRuta -= dt;
      if (this.tRuta <= 0) {
        this.tRuta = 0.5;
        const p = this.j.pos;
        if (!this.ultimaPosRuta || Math.hypot(p.x - this.ultimaPosRuta.x, p.z - this.ultimaPosRuta.z) > 0.4) this.#calcularRuta();
      }
    }
  }

  // ================================================================ textos y paneles
  #textoVia() {
    const f = this.app.fuentes;
    if (f.modo === 'usb') return `Sensor real por USB (${f.puertos.map((p) => p.nombre).join(' + ')})`;
    if (f.modo === 'remoto') return `Sensor real vía la sala ${f.recibiendo}`;
    return 'Sensor real';
  }

  #conexionCorta() {
    const c = this.sensores.estadoConexion();
    if (this.sensores.ensayo) return { clase: 'ensayo', via: 'ensayo', texto: 'ENSAYO · simulado' };
    if (c.via === 'usb') return { clase: 'ok', via: 'usb', texto: `USB · ${CONTADOR.baudios} baudios` };
    if (c.via === 'sala') return c.salaCaida ? { clase: 'espera', via: 'espera', texto: `Sala ${this.app.fuentes.recibiendo}: sin datos` } : { clase: 'ok', via: 'sala', texto: `Sala ${this.app.fuentes.recibiendo} en vivo` };
    if (c.via === 'espera') return { clase: 'espera', via: 'espera', texto: 'Esperando sensores' };
    return { clase: 'error', via: 'ninguna', texto: 'Sin sensores' };
  }

  #instruccion(corta = false) {
    const sinConexion = !this.sensores.enVivo && !this.sensores.ensayo;
    switch (this.fase) {
      case 'calibracion':
        if (this.calPaso === 'sensor') return 'Toca el sensor S1 con la punta del control derecho y aprieta el gatillo';
        if (this.calPaso === 'inicio') return 'Vuelve al punto de partida (unos 2 m), mira al sensor y pulsa A';
        return 'Párate a 2 m del sensor S1 real, míralo y pulsa A';
      case 'a2m':
      case 'caminando':
        if (sinConexion) return corta ? 'Sin conexión con el sensor: conéctalo o usa el ensayo' : 'Sin conexión con el sensor real: tu ingreso no se puede confirmar. Conéctalo (pestaña Conexión) o activa el modo ensayo.';
        if (this.cruzoSinSensor) return 'Cruzaste la puerta virtual: pasa frente al sensor real para que te detecte';
        return this.fase === 'a2m' ? 'Camina hacia el sensor S1 real: la puerta se abre cuando te detecte' : 'Sigue: pasa frente al sensor y corta el haz infrarrojo';
      case 'sensor': return '¡Detectado! Entrando a la biblioteca…';
      case 'ingreso': return 'Ingreso confirmado: la mesa piloto te espera';
      case 'recorriendo': return this.enVR ? 'Sigue la ruta a la mesa piloto (A: avanzar)' : 'Sigue la ruta a la mesa piloto (Enter: ir solo)';
      case 'mesa': return this.#libresPiloto().length ? `Elige una silla libre: ${this.#libresPiloto().map(letra).join(' o ')}` : 'No quedan sillas libres en la mesa piloto';
      case 'seleccion': return this.seleccion ? `Silla ${letra(this.seleccion)} elegida: ${this.enVR ? 'siéntate en tu silla real, mira al frente y pulsa A' : 'pulsa Enter para sentarte'}` : 'Elige una silla libre';
      case 'sentado': return this.confirmado ? 'Sentado · confirmado por la ESP32-CAM' : this.#camaraViva() ? 'Sentado · esperando a la ESP32-CAM' : 'Sentado · asiento virtual';
      default: return '';
    }
  }

  #actualizarAyudas(dt) {
    const ay = this.ayudas;
    const con = this.#conexionCorta();
    const i = ay.info;
    i.distancia = this.dist;
    i.conexion = con.via;
    i.textoConexion = con.texto;
    i.detectado = this.entro;
    i.texto = this.#instruccion(true);
    this.tPaneles -= dt;
    if (this.tPaneles <= 0) {
      this.tPaneles = 0.1;
      const clave = `${this.dist == null ? '-' : this.dist.toFixed(2)}|${i.texto}|${con.texto}|${this.entro}`;
      if (clave !== this.clavePuerta) { this.clavePuerta = clave; ay.panelPuerta.marcar(); ay.panelMini.marcar(); ay.panelGuia.marcar(); }
      this.#pintarMesa();
    }
    const aproximando = !this.entro && (this.fase === 'a2m' || this.fase === 'caminando');
    const recien = (this.fase === 'sensor' || this.fase === 'ingreso');
    ay.update(dt, {
      mostrarInicio: !this.entro,
      mostrarPuerta: !this.entro || recien,
      mostrarMini: (aproximando && !!this.cal) || (recien && this.tEstado < 2),
    });
  }

  #pintarGuia() {
    const ay = this.ayudas;
    if (!ay) return;
    const g = ay.guia, p = ay.panelGuia;
    p.limpiarBotones();
    const W = p.w, Hh = p.h;
    const fila = (items) => {
      const m = 44, gap = 22, n = items.length;
      const bw = (W - m * 2 - gap * (n - 1)) / n;
      items.forEach((it, k) => p.boton(it.id, m + k * (bw + gap), Hh - 150, bw, 108, it.texto, it.fn, it));
    };
    if (this.calPaso === 'sensor') {
      g.titulo = 'Calibración precisa · paso 1 de 2';
      g.lineas = [{ texto: 'Acércate al sensor S1 real.' }, { glifo: 'gatillo', texto: 'Toca el sensor con la punta del control derecho' }, { texto: 'y aprieta el gatillo.' }, { glifo: 'A', texto: 'Cancelar' }];
      g.pie = 'No hay botones en este paso para que el gatillo solo registre el sensor.';
    } else if (this.calPaso === 'inicio') {
      g.titulo = 'Calibración precisa · paso 2 de 2';
      g.lineas = [{ texto: 'Sensor registrado ✓' }, { texto: 'Vuelve al punto de partida (unos 2 m) y mira al sensor.' }, { glifo: 'A', texto: 'Fijar el punto de partida' }];
      g.pie = 'La distancia que verás es la medida real entre tu cabeza y el sensor.';
      fila([{ id: 'g-fijar', texto: 'Fijar inicio', glifo: 'A', fn: () => this.#fijarInicioPrecisa() }, { id: 'g-cancelar', texto: 'Cancelar', fn: () => this.#cancelarPrecisa() }]);
    } else {
      g.titulo = 'Calibración frente al sensor S1';
      g.lineas = [
        { texto: 'Párate a 2 metros del sensor S1 real, mirándolo de frente.' },
        { glifo: 'A', texto: 'Calibrar aquí: la entrada queda 2 m delante de ti' },
        { glifo: 'gatillo', texto: 'Precisa: tocar el sensor con el control derecho' },
      ];
      g.pie = 'Al acercarte el stick queda bloqueado: camina de verdad. La distancia la mide el visor (el sensor solo detecta de 3 a 80 cm).';
      fila([
        { id: 'g-rapida', texto: 'Calibrar aquí', glifo: 'A', fn: () => this.#calibrarRapida() },
        { id: 'g-precisa', texto: 'Precisa', fn: () => this.#iniciarPrecisa() },
        { id: 'g-ensayo', texto: this.sensores.ensayo ? 'Ensayo ✓' : 'Ensayo', fn: () => { this.#alternarEnsayo(); this.#pintarGuia(); }, activo: this.sensores.ensayo },
      ]);
    }
    p.marcar();
    if (this.enVR && this.fase === 'calibracion' && !this.panelPendiente && !p.malla.visible) {
      this.ayudas.colocarGuia(this.vr.posicionCabeza(this.tmp), this.vr.rumboCabeza());
    }
  }

  #pintarMesa() {
    const ay = this.ayudas, p = ay.panelMesa;
    const visible = this.entro && ['recorriendo', 'mesa', 'seleccion'].includes(this.fase) && this.#distMesa() < 9;
    p.malla.visible = visible;
    if (!visible) return;
    const cab = this.enVR ? this.vr.posicionCabeza(this.tmp) : this.app.control.camara.position;
    ay.orientarMesa(cab);
    const real = this.#camaraViva();
    const sillas = PILOTO.map((id) => this.b.get(id));
    const estado = (a) => (this.tuyo?.id === a.id ? 'tuya' : this.#libre(a) ? 'libre' : a.sinDato ? 'sin dato' : 'ocupada');
    const clave = `${this.fase}|${real}|${sillas.map(estado).join(',')}|${this.seleccion?.id}|${!!this.confirmado}`;
    if (clave === this.claveMesa) return;
    this.claveMesa = clave;
    const m = ay.mesa;
    m.titulo = `Mesa piloto ${MESA.id} · ${real ? 'ESP32-CAM en vivo' : 'simulada (sin ESP32-CAM)'}`;
    m.sub = this.seleccion ? `Elegiste ${letra(this.seleccion)}: ${this.enVR ? 'siéntate en tu silla real y pulsa A' : 'Enter para sentarte'}` : 'Apunta a una silla verde con el gatillo o usa los botones';
    m.asientos = sillas.map((a) => ({ letra: letra(a), zona: zona(a), estado: estado(a), elegida: this.seleccion?.id === a.id }));
    p.limpiarBotones();
    const libres = sillas.filter((a) => this.#libre(a));
    const W = p.w, Hh = p.h, mg = 36, gap = 18, n = Math.max(1, libres.length);
    const bw = (W - mg * 2 - gap * (n - 1)) / n;
    libres.forEach((a, k) => p.boton(`m-${a.id}`, mg + k * (bw + gap), Hh - 132, bw, 104,
      this.seleccion?.id === a.id ? `Sentarme en ${letra(a)}` : `Elegir silla ${letra(a)}`, () => this.#elegirOSentarse(a.id), { activo: this.seleccion?.id === a.id }));
    p.marcar();
  }

  // Tarjeta del objetivo (escritorio)
  #pintarObjetivo() {
    const con = this.#conexionCorta();
    let cuerpo = '';
    if (!this.entro && this.fase !== 'calibracion') {
      cuerpo += `<div class="pres-dist"><b>${textoMetros(this.dist)}</b><span>a la entrada · sensor S1</span></div>`;
    }
    cuerpo += `<p>${escapar(this.#instruccion())}</p>`;
    if (this.sensores.ensayo) cuerpo += '<div class="pres-ensayo-aviso">Modo ensayo: los pasos por S1/S2 que simules se marcan como SIMULADOS.</div>';
    const botones = [];
    if (!this.entro && this.sensores.ensayo) botones.push('<button data-a="s1" class="primario">Ensayo: pasar por S1 (I)</button>');
    if (this.fase === 'recorriendo') botones.push(`<button data-a="mesa" class="primario">${this.auto ? 'Pausar' : 'Ir a la mesa piloto'}</button>`);
    if (this.fase === 'mesa' || this.fase === 'seleccion') for (const a of this.#libresPiloto()) botones.push(`<button data-a="silla:${a.id}" class="${this.seleccion?.id === a.id ? 'primario' : ''}">${this.seleccion?.id === a.id ? 'Sentarme en' : 'Silla'} ${letra(a)}</button>`);
    if (this.fase === 'sentado') botones.push('<button data-a="levantarme">Levantarme</button>');
    if (botones.length) cuerpo += `<div class="fila">${botones.join('')}</div>`;
    cuerpo += `<div class="pres-con ${con.clase}"><i></i>${escapar(con.texto)}${this.app.fuentes.compartiendo ? ` · compartiendo sala ${this.app.fuentes.compartiendo}` : ''}</div>`;
    H.objetivo(`<h2>Presentación <small>${escapar(NOMBRE[this.fase])}</small></h2>${cuerpo}`);
  }

  #acciones() {
    const l = [];
    const s = this.sensores;
    if (!this.entro) {
      if (s.ensayo) l.push({ texto: 'Ensayo: S1', tecla: 'I', principal: true, fn: () => s.entradaEnsayo() });
      l.push({ texto: s.ensayo ? 'Salir del ensayo' : 'Modo ensayo', tecla: 'T', fn: () => this.#alternarEnsayo() });
    } else if (this.fase === 'recorriendo') {
      l.push({ texto: this.auto ? 'Pausar' : 'Ir a la mesa', tecla: 'Enter', principal: true, fn: () => this.#irALaMesa() });
      l.push({ texto: 'Silla libre', tecla: 'F', fn: () => this.#elegirCercano() });
    } else if (this.fase === 'mesa') {
      l.push({ texto: 'Silla más cercana', tecla: 'F', principal: true, fn: () => this.#elegirCercano() });
    } else if (this.fase === 'seleccion') {
      l.push({ texto: 'Sentarme', tecla: 'Enter', principal: true, fn: () => this.#sentarse(this.seleccion) });
      l.push({ texto: 'Otra silla', tecla: 'F', fn: () => this.#elegirCercano() });
    } else if (this.fase === 'sentado') {
      l.push({ texto: 'Mi asiento', tecla: 'Enter', fn: () => this.#estadoSentado() });
      l.push({ texto: 'Levantarme', fn: () => this.#levantarse() });
    }
    if (this.entro && s.ensayo) l.push({ texto: 'Ensayo: S2', tecla: 'O', fn: () => s.salidaEnsayo() });
    l.push({ texto: 'Reiniciar', tecla: 'R', fn: () => this.reiniciar() });
    const clave = `${this.fase}|${s.ensayo}|${!!this.auto}|` + l.map((a) => a.texto).join('|');
    if (clave !== this.clavesAcciones) { this.clavesAcciones = clave; H.acciones(l); }
  }

  pistas() {
    if (this.fase === 'sentado') return [['Enter', 'mi asiento'], ['Arrastrar', 'mirar alrededor'], ['R', 'reiniciar']];
    const l = [['W A S D', 'caminar'], ['Clic', 'mirar con el ratón']];
    if (!this.entro) l.push(['T', 'modo ensayo'], ['I', 'ensayo: S1']);
    else l.push(['Enter', 'ir a la mesa · sentarme'], ['E', 'elegir silla'], ['F', 'silla libre'], ['1–4', 'silla A–D']);
    l.push(['R', 'reiniciar'], ['U', 'conectar sensores']);
    return l;
  }

  teclas() {
    const t = {
      Enter: () => this.accionA(),
      NumpadEnter: () => this.accionA(),
      KeyF: () => { if (this.entro && this.fase !== 'sentado') this.#elegirCercano(); },
      KeyI: () => (this.sensores.ensayo ? this.sensores.entradaEnsayo() : this.#sugerirEnsayo()),
      KeyO: () => { if (this.sensores.ensayo) this.sensores.salidaEnsayo(); },
      KeyT: () => this.#alternarEnsayo(),
      KeyR: () => this.reiniciar(),
    };
    PILOTO.forEach((id, k) => { t[`Digit${k + 1}`] = () => { if (this.entro && this.fase !== 'sentado') this.#elegirOSentarse(id); }; });
    return t;
  }

  // ================================================================ registro
  #log(tipo, texto) {
    this.registro.push({ t: new Date(), tipo, texto });
    if (this.registro.length > 120) this.registro.shift();
    this.vRegistro++;
  }

  // ================================================================ panel lateral: Presentación y Conexión
  proveedor() {
    const prov = {
      pestanas: {
        presentacion: { titulo: 'Presentación', html: () => this.#htmlPresentacion(), montar: (r) => this.#montarPanel(r), actualizar: (r) => this.#actualizarPresentacion(r) },
        conexion: { titulo: 'Conexión', html: () => this.#htmlConexion(), montar: (r) => this.#montarPanel(r), actualizar: (r) => this.#actualizarConexion(r) },
      },
    };
    this.proveedorActual = prov;
    return prov;
  }

  #montarPanel(r) {
    // la pestaña se dibuja de nuevo: todo lo que se dibuja "solo si cambió" se vuelve a dibujar
    this.clavePasos = ''; this.vRegistroDibujado = -1; this.claveMonitor = ''; this.clavePatrones = null;
    r.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a],[data-ensenar],[data-olvidar]');
      if (!b) return;
      if (b.dataset.ensenar) {
        const item = this.lineasMonitor?.[Number(b.dataset.i)];
        if (item) {
          this.sensores.ensenar(item.linea, b.dataset.ensenar);
          this.#log('traducida', `Aprendido: “${recortar(item.linea, 40)}” = ${b.dataset.ensenar}`);
          this.app.hud.aviso(b.dataset.ensenar === 'ignorar' ? 'Esa línea se ignorará.' : `Desde ahora, esa línea cuenta como ${b.dataset.ensenar}.`, 'ok');
        }
        this.claveMonitor = '';
        return;
      }
      if (b.dataset.olvidar != null) { this.sensores.olvidar(Number(b.dataset.olvidar)); this.clavePatrones = ''; return; }
      this.#accion(b.dataset.a, b);
    });
  }

  async #accion(a, boton = null) {
    if (!a) return;
    const f = this.app.fuentes;
    if (a.startsWith('silla:')) { this.#elegirOSentarse(a.slice(6)); return; }
    switch (a) {
      case 's1': if (!this.sensores.ensayo) this.#alternarEnsayo(); this.sensores.entradaEnsayo(); break;
      case 's2': if (!this.sensores.ensayo) this.#alternarEnsayo(); this.sensores.salidaEnsayo(); break;
      case 'ensayo': this.#alternarEnsayo(); break;
      case 'reiniciar': this.reiniciar(); break;
      case 'mesa': this.#irALaMesa(); break;
      case 'levantarme': this.#levantarse(); break;
      case 'usb': await this.#conectarUSB(); break;
      case 'reabrir': {
        const b = this.#baudiosElegidos();
        try { await this.sensores.reconectar(b); this.#log('sistema', `Puerto reabierto a ${b} baudios`); this.avisoBasura = false; }
        catch (e) { this.app.hud.aviso(`No se pudo reabrir: ${e?.message || e}`, 'error'); }
        this.app.hud.refrescarPestana();
        break;
      }
      case 'desconectar': await f.desconectarUSB(); this.app.hud.refrescarPestana(); break;
      case 'compartir':
        try { const cod = await f.compartir(); this.#log('sistema', `Compartiendo con el visor: sala ${cod}`); }
        catch (e) { this.app.hud.aviso(`No se pudo compartir: ${e?.message || e}`, 'error'); }
        this.app.hud.refrescarPestana();
        break;
      case 'dejarCompartir': f.dejarDeCompartir(); this.app.hud.refrescarPestana(); break;
      case 'copiar': {
        const enlace = this.#enlaceVisor();
        try { await navigator.clipboard.writeText(enlace); this.app.hud.aviso('Enlace para el visor copiado.', 'ok'); } catch { this.app.hud.aviso(enlace, 'info', 9000); }
        break;
      }
      case 'recibir': {
        const campo = boton?.closest('.tarjeta')?.querySelector('input[data-v="codigo"]');
        try { await f.recibir(campo?.value || ''); this.app.hud.aviso(`Conectando con la sala ${f.recibiendo}…`, 'ok'); }
        catch { this.app.hud.aviso('Escribe el código de 4 dígitos que muestra la laptop.', 'error'); }
        this.app.hud.refrescarPestana();
        break;
      }
      case 'dejarRecibir': f.dejarDeRecibir(); this.app.hud.refrescarPestana(); break;
      case 'conexion': this.app.hud.plegar(false); this.app.hud.mostrarPestana('conexion'); break;
      default: break;
    }
    this.clavesAcciones = null;
  }

  #baudiosElegidos() {
    const sel = document.querySelector('#contenidoPanel select[data-v="baudios"]');
    return Number(sel?.value) || CONTADOR.baudios;
  }

  async #conectarUSB() {
    const b = this.#baudiosElegidos();
    try { await this.sensores.conectarUSB(b); this.#log('sistema', `Puerto USB abierto a ${b} baudios`); this.avisoBasura = false; }
    catch (e) {
      if (e?.message === 'sin-webserial') this.app.hud.aviso('Este navegador no puede leer USB. Abre la página en Chrome o Edge en la laptop (en el visor, usa el código de sala).', 'error', 8000);
      else if (e?.name !== 'NotFoundError') this.app.hud.aviso(`No se pudo conectar: ${e?.message || e}. Cierra el Monitor Serie de Arduino y vuelve a intentar.`, 'error', 8000);
    }
    this.app.hud.refrescarPestana();
  }

  #enlaceVisor() {
    const cod = this.app.fuentes.compartiendo;
    return `${location.origin}${location.pathname}#/presentacion${cod ? `/${cod}` : ''}`;
  }

  #htmlPresentacion() {
    return `<div class="pres">
      <div class="tarjeta">
        <h3>Ahora <span class="pres-estado" data-v="estado"></span></h3>
        <div class="pres-dist" data-v="distCaja"><b data-v="dist">–</b><span>a la entrada · sensor S1</span></div>
        <p class="nota" data-v="instruccion" style="margin-top:6px"></p>
        <div class="pres-con" data-v="con"><i></i><span></span></div>
        <div class="acciones" style="margin-top:10px">
          <button data-a="ensayo" data-v="bEnsayo"><span>Modo ensayo (sin sensores)</span><kbd>T</kbd></button>
          <button data-a="s1"><span>Ensayo: pasar por S1</span><kbd>I</kbd></button>
          <button data-a="s2"><span>Ensayo: pasar por S2</span><kbd>O</kbd></button>
          <button data-a="reiniciar"><span>Reiniciar la presentación</span><kbd>R</kbd></button>
        </div>
      </div>
      <div class="tarjeta">
        <h3>Recorrido <small>máquina de estados</small></h3>
        <ol class="pres-pasos" data-v="pasos"></ol>
      </div>
      <div class="tarjeta">
        <h3>Sensores reales <small data-v="via"></small></h3>
        <div class="fila-datos" data-v="contador" style="margin-top:0"></div>
        <p class="mini" style="margin:8px 0 6px">Mesa piloto 1-01 (zonas A1–A4 de la ESP32-CAM)</p>
        <div class="pres-sillas" data-v="sillas"></div>
        <p class="mini" data-v="camaraNota" style="margin:6px 0 0"></p>
      </div>
      <div class="tarjeta">
        <h3>Registro <small>lo real se marca en verde</small></h3>
        <ul class="pres-log" data-v="log"></ul>
      </div>
      <div class="tarjeta">
        <h3>Qué es real y qué es simulado</h3>
        <ul class="pres-lista">
          <li><b>Real:</b> los ingresos por S1 y las salidas por S2 (ESP32 por USB o por la sala en vivo) y, con la ESP32-CAM conectada, las cuatro sillas de la mesa piloto.</li>
          <li><b>Medido por el visor:</b> la distancia al sensor (seguimiento del Quest calibrado). El sensor E18-D80NK solo dice «alguien pasó».</li>
          <li><b>Simulado:</b> el resto de la biblioteca (330 asientos llenos y la gente de pie). Sin ESP32-CAM, también la mesa piloto (A y B ocupadas, C y D libres).</li>
          <li><b>Ensayo:</b> lo que se pulse en modo ensayo nunca cuenta como dato real.</li>
        </ul>
      </div>
    </div>`;
  }

  #actualizarPresentacion(r) {
    const v = (k) => r.querySelector(`[data-v="${k}"]`);
    const con = this.#conexionCorta();
    v('estado').textContent = NOMBRE[this.fase];
    v('distCaja').hidden = this.entro || this.fase === 'calibracion';
    v('dist').textContent = textoMetros(this.dist);
    v('instruccion').textContent = this.#instruccion();
    const c = v('con'); c.className = `pres-con ${con.clase}`; c.querySelector('span').textContent = con.texto;
    v('bEnsayo').setAttribute('aria-pressed', String(this.sensores.ensayo));
    // pasos
    const iActual = ORDEN.indexOf(this.fase);
    const clavePasos = `${this.fase}|${this.enVR}|${!!this.cal}`;
    if (this.clavePasos !== clavePasos || !v('pasos').children.length) {
      this.clavePasos = clavePasos;
      v('pasos').innerHTML = ESTADOS.map(([id, nombre], i) => {
        const omitido = id === 'calibracion' && !this.enVR && !this.cal;
        const cls = omitido ? 'omitido' : i < iActual ? 'hecho' : i === iActual ? 'actual' : '';
        return `<li class="${cls}">${nombre}${omitido ? ' <small>(solo con visor)</small>' : ''}</li>`;
      }).join('');
    }
    // sensores
    const e = this.sensores.estadoConexion();
    v('via').textContent = e.detalle;
    const k = e.contador;
    v('contador').innerHTML = k.conocido
      ? `<span>ESP32 · entradas <b>${k.entradas}</b></span><span>salidas <b>${k.salidas}</b></span><span>dentro <b>${k.dentro}</b></span><span>último dato <b>${k.hace ?? '–'} s</b></span>`
      : `<span>ESP32: ${e.real ? 'esperando el primer cruce' : 'sin conexión'}</span>`;
    const cam = this.app.estado.camara;
    const real = this.#camaraViva();
    v('sillas').innerHTML = PILOTO.map((id, i) => {
      const a = this.b.get(id);
      const z = cam.asientos[i];
      const tuya = this.tuyo?.id === id;
      const est = tuya ? 'tuyo' : this.b.estadoDe(a);
      const txt = tuya ? (this.confirmado ? 'tuya ✓' : 'tuya') : { libre: 'libre', ocupado: 'ocupada', objeto: 'objeto', sinDato: 'sin dato' }[this.b.estadoDe(a)];
      return `<div class="${est}"><b>${letra(a)}</b>${zona(a)} · ${txt}${real && z?.ocupado != null ? `<small>${Math.round(z.pct)} %</small>` : ''}</div>`;
    }).join('');
    v('camaraNota').textContent = real
      ? `ESP32-CAM en vivo${e.camara.desactualizada ? ` · ojo: último dato hace ${e.camara.hace} s` : ''}. Es la fuente de verdad de estas cuatro sillas.`
      : 'Sin ESP32-CAM: la mesa piloto es simulada (A y B ocupadas, C y D libres) y tu asiento será una selección virtual.';
    // registro
    if (this.vRegistroDibujado !== this.vRegistro) {
      this.vRegistroDibujado = this.vRegistro;
      const ul = v('log');
      ul.innerHTML = this.registro.slice(-40).reverse().map((x) => `<li><time>${hora(x.t)}</time><span class="pres-tag ${x.tipo}">${x.tipo}</span><span>${escapar(x.texto)}</span></li>`).join('');
    }
  }

  #htmlConexion() {
    const f = this.app.fuentes;
    const usb = f.usbDisponible;
    const opciones = BAUDIOS.map((b) => `<option value="${b}" ${b === CONTADOR.baudios ? 'selected' : ''}>${b.toLocaleString('es-PE')} baudios${b === 115200 ? ' · informe' : b === 9600 ? ' · Arduino común' : ''}</option>`).join('');
    const cod = f.compartiendo;
    return `<div class="pres">
      <div class="tarjeta">
        <h3>Estado <small data-v="servidores"></small></h3>
        <div class="pres-con" data-v="con"><i></i><span></span></div>
        <p class="nota" data-v="detalle"></p>
      </div>
      <div class="tarjeta">
        <h3>Sensor por USB <small>en la laptop</small></h3>
        <p class="nota" style="margin-top:0">Conecta el ESP32 o el Arduino que lee el sensor. Solo se <b>lee</b> lo que imprime (como el Monitor Serie): no se cambia el programa. Cierra antes el Monitor Serie de Arduino.</p>
        <label class="pres-campo">Velocidad (la del <code>Serial.begin</code>) <select data-v="baudios">${opciones}</select></label>
        <div class="acciones" style="margin-top:8px">
          <button data-a="usb" class="ancho" ${usb ? '' : 'disabled'}><span>Conectar sensor por USB</span></button>
          <button data-a="reabrir" ${f.puertos.length ? '' : 'disabled'}><span>Reabrir a esta velocidad</span></button>
          <button data-a="desconectar" ${f.puertos.length ? '' : 'disabled'}><span>Desconectar</span></button>
        </div>
        ${usb ? '' : '<p class="nota alerta">Este navegador no puede leer USB: usa Chrome o Edge en la laptop. En el visor, usa el código de sala.</p>'}
      </div>
      <div class="tarjeta">
        <h3>Meta Quest 3 <small>sin cable</small></h3>
        ${cod
          ? `<p class="nota" style="margin-top:0">En el navegador del visor abre este enlace (o «Recibir» con el código):</p>
             <div class="pres-codigo">${cod}</div>
             <p class="mini" style="word-break:break-all">${escapar(this.#enlaceVisor())}</p>
             <div class="acciones"><button data-a="copiar"><span>Copiar enlace</span></button><button data-a="dejarCompartir"><span>Dejar de compartir</span></button></div>`
          : `<p class="nota" style="margin-top:0">La laptop con el sensor comparte los números (nunca imágenes) por un servidor público; el visor los recibe con un código de 4 dígitos.</p>
             <div class="acciones"><button data-a="compartir" class="ancho primario"><span>Compartir con el visor</span></button></div>`}
        <div class="fila" style="margin-top:8px;align-items:center">
          <input data-v="codigo" class="campo-codigo pres-codigo-campo" inputmode="numeric" maxlength="6" placeholder="Código" aria-label="Código de sala" value="${escapar(f.recibiendo || '')}">
          <button data-a="${f.recibiendo ? 'dejarRecibir' : 'recibir'}">${f.recibiendo ? 'Dejar de recibir' : 'Recibir (en el visor)'}</button>
        </div>
        <p class="mini">Con Quest Link o Air Link no hace falta código: esta misma página lee el USB y se ve en el visor.</p>
      </div>
      <div class="tarjeta">
        <h3>Monitor del puerto <small data-v="lineasCuenta"></small></h3>
        <div class="pres-monitor" data-v="monitor"><span class="mini">Todavía no llegan líneas.</span></div>
        <p class="mini" style="margin:6px 0 0">Se entiende solo el formato del informe (<code>t_ms,sensor,evento,…</code>) y textos comunes: «Entrada detectada», «Personas: 5», «Entradas: 3 | Salidas: 1», lecturas 0/1 del sensor (LOW = detecta) y «Distancia: 35 cm» (cruce por debajo de 60 cm). Si una línea no se reconoce, enséñala con un clic.</p>
        <div data-v="patrones"></div>
      </div>
    </div>`;
  }

  #actualizarConexion(r) {
    const v = (k) => r.querySelector(`[data-v="${k}"]`);
    const con = this.#conexionCorta();
    const e = this.sensores.estadoConexion();
    const c = v('con'); c.className = `pres-con ${con.clase}`; c.querySelector('span').textContent = e.detalle;
    v('servidores').textContent = this.app.fuentes.compartiendo ? `compartiendo · ${e.servidores} servidor(es)` : '';
    v('detalle').textContent = e.real
      ? `Último dato del ESP32: ${e.contador.hace != null ? `hace ${e.contador.hace} s` : 'todavía ninguno'} · ESP32-CAM: ${e.camara.conocida ? `hace ${e.camara.hace} s` : 'sin datos'}${e.salaCaida ? ' · la sala no recibe datos: revisa que la laptop esté compartiendo' : ''}.`
      : 'Sin sensores reales: el ingreso no se puede confirmar. Conecta el USB aquí o recibe la sala de la laptop.';
    const L = this.sensores.lineas;
    const clave = `${L.length}|${L.at(-1)?.t}|${L.at(-1)?.tipo}|${this.sensores.patrones.length}`;
    if (clave !== this.claveMonitor) {
      this.claveMonitor = clave;
      this.lineasMonitor = L.slice(-16);
      const usb = this.app.fuentes.modo === 'usb';
      v('lineasCuenta').textContent = `${L.length ? `${L.length} líneas recientes` : ''}`;
      v('monitor').innerHTML = this.lineasMonitor.length ? this.lineasMonitor.map((x, i) => {
        const tag = x.tipo.startsWith('traducida') ? 'traducida' : x.tipo === 'oficial' ? 'real' : x.tipo === 'ilegible' ? 'aviso' : '';
        const ensenar = usb && x.tipo === 'texto'
          ? `<button data-ensenar="entrada" data-i="${i}">= entrada</button><button data-ensenar="salida" data-i="${i}">= salida</button><button data-ensenar="ignorar" data-i="${i}">ignorar</button>` : '';
        return `<div><span class="pres-tag ${tag}">${escapar(x.tipo)}</span><code>${escapar(recortar(x.linea, 110))}</code>${ensenar}</div>`;
      }).join('') : '<span class="mini">Todavía no llegan líneas.</span>';
      const m = v('monitor'); m.scrollTop = m.scrollHeight;
    }
    const claveP = this.sensores.patrones.map((p) => p.patron + p.tipo).join('|');
    if (claveP !== this.clavePatrones) {
      this.clavePatrones = claveP;
      const P = this.sensores.patrones;
      v('patrones').innerHTML = P.length
        ? `<p class="mini" style="margin:8px 0 4px">Líneas aprendidas (se guardan en este navegador):</p><ul class="pres-lista">${P.map((p, i) => `<li><code>${escapar(recortar(p.ejemplo, 50))}</code> → <b>${p.tipo}</b> <button data-olvidar="${i}" class="pres-mini-boton">olvidar</button></li>`).join('')}</ul>`
        : '';
    }
  }
}

// ---------------------------------------------------------------- estilos propios de la sección
function estilos() {
  if (document.getElementById('estilos-presentacion')) return;
  const s = document.createElement('style');
  s.id = 'estilos-presentacion';
  s.textContent = `
.pres { display: grid; gap: 10px; }
.pres-estado { text-transform: none; letter-spacing: 0; font-size: 11.5px; font-weight: 800; color: #e0f2fe; background: rgba(56,189,248,.16); border: 1px solid rgba(56,189,248,.45); border-radius: 999px; padding: 2px 9px; }
.pres-dist { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.pres-dist b { font-size: 38px; line-height: 1.05; font-variant-numeric: tabular-nums; color: #f8fafc; }
.pres-dist span { color: var(--suave); font-size: 12.5px; }
#objetivo .pres-dist b { font-size: 32px; }
.pres-pasos { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; counter-reset: paso; font-size: 12.5px; }
.pres-pasos li { counter-increment: paso; display: flex; gap: 8px; align-items: center; color: var(--tenue); }
.pres-pasos li::before { content: counter(paso); width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 700; border: 1px solid var(--borde); flex: none; }
.pres-pasos li.hecho { color: #86efac; }
.pres-pasos li.hecho::before { content: "✓"; background: rgba(34,197,94,.18); border-color: rgba(34,197,94,.6); color: #86efac; }
.pres-pasos li.actual { color: #f8fafc; font-weight: 700; }
.pres-pasos li.actual::before { background: #38bdf8; color: #04121f; border-color: #38bdf8; }
.pres-pasos li.omitido { opacity: .55; }
.pres-pasos small { color: var(--tenue); font-weight: 500; }
.pres-con { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--suave); margin-top: 4px; }
.pres-con i { width: 9px; height: 9px; border-radius: 50%; background: #94a3b8; flex: none; }
.pres-con.ok i { background: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,.22); }
.pres-con.espera i { background: #f59e0b; }
.pres-con.ensayo i { background: #c084fc; }
.pres-con.error i { background: #ef4444; }
.pres-sillas { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.pres-sillas div { border-radius: 10px; padding: 6px 4px; text-align: center; font-size: 11.5px; border: 1px solid var(--borde); background: rgba(148,163,184,.08); color: var(--suave); }
.pres-sillas div b { display: block; font-size: 17px; color: var(--texto); }
.pres-sillas div small { display: block; color: var(--tenue); }
.pres-sillas .libre { border-color: rgba(34,197,94,.65); color: #86efac; }
.pres-sillas .ocupado, .pres-sillas .objeto { border-color: rgba(239,68,68,.6); color: #fca5a5; }
.pres-sillas .tuyo { border-color: #38bdf8; color: #bae6fd; background: rgba(56,189,248,.12); }
.pres-sillas .sinDato { opacity: .6; }
.pres-log { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; max-height: 230px; overflow: auto; font-size: 12px; }
.pres-log li { display: grid; grid-template-columns: auto auto 1fr; gap: 6px; align-items: baseline; color: #cbd5e1; }
.pres-log time { color: var(--tenue); font-variant-numeric: tabular-nums; }
.pres-tag { font-size: 9.5px; font-weight: 800; letter-spacing: .05em; padding: 1px 6px; border-radius: 6px; text-transform: uppercase; background: rgba(148,163,184,.16); color: var(--suave); white-space: nowrap; }
.pres-tag.real { background: rgba(34,197,94,.2); color: #86efac; }
.pres-tag.ensayo { background: rgba(192,132,252,.22); color: #e9d5ff; }
.pres-tag.traducida, .pres-tag.calibracion { background: rgba(56,189,248,.18); color: #bae6fd; }
.pres-tag.aviso, .pres-tag.camara { background: rgba(245,158,11,.2); color: #fde68a; }
.pres-tag.seleccion { background: rgba(56,189,248,.12); color: #e0f2fe; }
.pres-monitor { font-family: ui-monospace, Consolas, "Cascadia Mono", monospace; font-size: 11.5px; background: #050a14; border: 1px solid var(--borde); border-radius: 10px; padding: 8px; max-height: 260px; overflow: auto; display: grid; gap: 4px; }
.pres-monitor div { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
.pres-monitor code { color: #e2e8f0; white-space: pre-wrap; word-break: break-all; flex: 1 1 160px; }
.pres-monitor button, .pres-mini-boton { font-size: 10.5px; padding: 1px 7px; border-radius: 6px; border: 1px solid var(--borde); background: rgba(148,163,184,.12); }
.pres-monitor button:hover, .pres-mini-boton:hover { background: rgba(148,163,184,.25); }
.pres-codigo { font-size: 34px; font-weight: 800; letter-spacing: .22em; color: #f8fafc; font-variant-numeric: tabular-nums; margin: 4px 0; }
.pres-codigo-campo { width: 110px; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--borde); background: #0f172a; color: var(--texto); font: inherit; letter-spacing: .15em; }
.pres-campo { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12.5px; color: var(--suave); flex-wrap: wrap; }
.pres-lista { margin: 0; padding-left: 18px; display: grid; gap: 5px; font-size: 12.5px; color: #cbd5e1; line-height: 1.45; }
.pres-ensayo-aviso { border-radius: 10px; padding: 6px 10px; background: rgba(192,132,252,.14); border: 1px solid rgba(192,132,252,.5); color: #e9d5ff; font-size: 12.5px; }
`;
  document.head.append(s);
}
