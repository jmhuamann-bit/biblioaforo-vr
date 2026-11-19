// Sensores reales para la Simulación para presentación.
// Escucha lo mismo que ya lee BiblioAforo (USB con Web Serial, o la sala en vivo que recibe el visor)
// y lo convierte en eventos claros: "entrada por S1", "salida por S2", "la ESP32-CAM cambió un asiento".
//  · Sin duplicados: un ingreso cuenta una sola vez aunque la línea llegue repetida (se compara el
//    contador de entradas del ESP32), y dos detecciones de S1 en menos de 1,2 s se marcan como rebote.
//  · Si el ESP32 se reinicia (su contador vuelve a 0), se detecta y se sigue contando bien.
//  · Traductor: si el programa de Arduino no imprime el CSV del informe, se reconocen textos comunes
//    ("Entrada detectada", "Personas: 5", lecturas 0/1 del sensor…) y se pueden enseñar líneas nuevas
//    con un clic. Lo traducido se reenvía con el formato del informe, así el visor lo entiende igual.
//  · Nunca inventa eventos: sin sensores no hay "entradas reales". El modo ensayo es aparte y
//    siempre se rotula como simulado.
//  · Prueba del sensor: guarda un espejo de lo que muestra el ESP32 (entradas, salidas, dentro y LED,
//    lo mismo que su LCD), los últimos cruces con su duración y un registro descargable en CSV.
import { Emisor } from '../datos/estado.js';
import { interpretarLinea } from '../datos/parser.js';
import { CONTADOR } from '../config.js';

const OFICIALES = new Set(['contador', 'cabecera', 'camara', 'calibrado']);
const sinTildes = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const CLAVE_PATRONES = 'ba-presentacion-patrones';
const CLAVE_BAUDIOS = 'ba-presentacion-baudios';
export const BAUDIOS = [115200, 9600, 57600, 38400, 19200, 74880, 250000];
// Nombre del puerto para mostrar: el chip CH340 lo usan la base ESP32-CAM-MB, muchos ESP32 DevKit y los
// Arduino Nano compatibles, así que no se presupone cuál es
export const nombrePuerto = (p) => String(p?.nombre || 'Puerto USB').replace(' (ESP32-CAM-MB)', ' · USB-serie');
const REBOTE_MS = 1200;
// "Reiniciar conteo" desde la página del ESP32 (o 'r' en su Monitor Serie): t,-,REINICIO,,0,0,0,0
const RE_REINICIO = /^\s*(\d+)\s*,\s*[^,]*,\s*REINICIO\s*,\s*-?\d*\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(-?\d+)\s*,\s*([01])\s*$/i;
const MAX_REGISTRO = 50000;
const dos = (n) => String(n).padStart(2, '0');
const horaCompleta = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;

// Patrón aprendido a partir de una línea: los números pasan a ser comodines
export function patronDeLinea(linea) {
  const esc = sinTildes(String(linea).trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `^${esc.replace(/\d+(?:[.,]\d+)?/g, '\\d+(?:[.,]\\d+)?')}$`;
}

// ¿La línea parece basura? (velocidad del puerto equivocada)
export function pareceBasura(linea) {
  const s = String(linea);
  if (s.length < 4) return false;
  let raros = 0;
  for (const ch of s) { const c = ch.codePointAt(0); if (c === 0xfffd || (c < 32 && c !== 9) || (c > 126 && c < 160)) raros++; }
  return raros / s.length > 0.25;
}

// ----------------------------------------------------------------------------- traductor (sin estado del navegador)
// Recibe una línea que NO es del formato del informe y devuelve lo que significa.
// memoria: { contador, entradas, salidas, digital: {S1, S2} } (se actualiza) · patrones: [{patron, tipo}]
export function traducirLinea(linea, memoria, patrones = [], { oficialReciente = false } = {}) {
  const s = sinTildes(linea).trim();
  if (!s || s.startsWith('#') || s.startsWith('//')) return null;
  // 1) lo que se enseñó a mano
  for (const p of patrones) {
    try { if (new RegExp(p.patron).test(s)) return p.tipo === 'ignorar' ? { tipo: 'ignorar' } : { tipo: p.tipo, n: 1, por: 'aprendida' }; } catch { /* patrón inválido */ }
  }
  // 2) asientos: "A1: ocupado", "asiento 2 libre", "silla 3 = 1"
  const asientos = [...s.matchAll(/(?:\ba|asiento|silla|zona)\s*([1-4])\s*[:=-]?\s*(ocupad[oa]|libre|1|0|true|false)\b/g)];
  if (asientos.length) return { tipo: 'asiento', asientos: asientos.map((m) => ({ i: Number(m[1]) - 1, ocupado: /ocupad|^1$|true/.test(m[2]) })) };
  // si el ESP32 ya imprime el CSV del informe, los textos sueltos no cuentan (evita contar dos veces)
  if (oficialReciente) return null;
  const palabraEntrada = /\b(s1|entrada|entro|ingreso|ingresa|ingresando|entra|entrando)\b/.test(s);
  const palabraSalida = /\b(s2|salida|salio|sale|saliendo)\b/.test(s);
  const negado = /\b(no|sin|libre|despejad[oa]|nadie|ningun[oa]?|vacio)\b/.test(s);
  // 3) contadores absolutos: "Entradas: 3 | Salidas: 1"
  const mE = s.match(/entradas?\D{0,6}(\d+)/), mS = s.match(/salidas?\D{0,6}(\d+)/);
  if (mE || mS) {
    const r = { tipo: 'contadores', entradas: 0, salidas: 0 };
    if (mE) { const n = Number(mE[1]); if (memoria.entradas != null && n > memoria.entradas) r.entradas = Math.min(5, n - memoria.entradas); memoria.entradas = n; }
    if (mS) { const n = Number(mS[1]); if (memoria.salidas != null && n > memoria.salidas) r.salidas = Math.min(5, n - memoria.salidas); memoria.salidas = n; }
    return r.entradas || r.salidas ? r : { tipo: 'base' };
  }
  // 4) personas dentro: "Personas: 5", "dentro = 3", "Aforo 4/20", "contador 7"
  const m = s.match(/(?:personas|dentro|aforo|contador|count|total|ocupacion|cantidad)\D{0,8}(\d+)/);
  if (m) {
    const n = Number(m[1]);
    const prev = memoria.contador;
    memoria.contador = n;
    if (prev != null && n > prev) return { tipo: 'entrada', n: Math.min(5, n - prev), por: 'contador' };
    if (prev != null && n < prev) return { tipo: 'salida', n: Math.min(5, prev - n), por: 'contador' };
    if (prev == null && palabraEntrada && !negado) return { tipo: 'entrada', n: 1, por: 'texto' };
    return { tipo: 'base' };
  }
  // 5) sensor de distancia (p. ej. ultrasónico): "Distancia: 23 cm" → alguien pasa cuando baja del umbral
  const md = s.match(/\b(?:distancia|distance|dist)\b\D{0,6}(\d+(?:[.,]\d+)?)\s*(cm|mm|m)?\b/);
  if (md) {
    let cm = Number(md[1].replace(',', '.'));
    if (md[2] === 'mm') cm /= 10; else if (md[2] === 'm') cm *= 100;
    const sensor = /\b(s2|sensor\s*2|salida)\b/.test(s) ? 'S2' : 'S1';
    memoria.cerca ||= { S1: null, S2: null };
    const umbral = memoria.umbralCm || 60;
    if (cm <= 1) return { tipo: 'base' };                               // 0 = sin eco (lectura inválida)
    const antes = memoria.cerca[sensor];
    if (cm < umbral) memoria.cerca[sensor] = true;
    else if (cm > umbral + 15) memoria.cerca[sensor] = false;
    if (memoria.cerca[sensor] && antes === false) return { tipo: sensor === 'S1' ? 'entrada' : 'salida', n: 1, por: 'distancia' };
    return { tipo: 'base' };
  }
  // 6) lectura digital del sensor: "0", "S1: 0", "sensor = LOW", "Estado del sensor: 1" (E18-D80NK: LOW = detecta)
  const d = s.match(/^(?:([a-z_ ]*?)\s*([12])?\s*[:=]?\s*)?(0|1|low|high)$/);
  if (d) {
    const etiqueta = `${d[1] || ''}${d[2] || ''}`;
    const sensor = /2|salida/.test(etiqueta) ? 'S2' : 'S1';
    const activo = d[3] === '0' || d[3] === 'low';
    const antes = memoria.digital[sensor];
    memoria.digital[sensor] = activo;
    if (activo && antes === false) return { tipo: sensor === 'S1' ? 'entrada' : 'salida', n: 1, por: 'digital' };
    return { tipo: 'base' };
  }
  // 7) palabras: "Entrada detectada", "Persona ingresó", "Salió una persona", "Objeto detectado"
  if (negado) return null;
  if (palabraSalida) return { tipo: 'salida', n: 1, por: 'texto' };
  if (palabraEntrada || /detect|objeto|obstacul|presencia|persona|bloquead/.test(s)) return { tipo: 'entrada', n: 1, por: 'texto' };
  return null;
}

export class SensoresPresentacion extends Emisor {
  constructor(app) {
    super();
    this.app = app;
    this.base = null;              // último contador del ESP32 visto { e, s } (para no duplicar)
    this.ultimoS1 = -Infinity; this.ultimoS2 = -Infinity;
    this.ensayo = false;
    this.lineas = [];              // últimas líneas crudas (monitor)
    this.ultimaLinea = 0;
    this.memoria = { contador: null, entradas: null, salidas: null, digital: { S1: null, S2: null } };
    this.traducidos = { entradas: 0, salidas: 0 };
    this.inyectadas = new Set();
    this.tOficial = 0;
    this.basura = 0;
    this.patrones = this.#leer(CLAVE_PATRONES, []);
    this.oyentes = [];
    // prueba del sensor
    this.espejo = null;            // { entradas, salidas, dentro, led, t }: lo mismo que muestra el LCD del ESP32
    this.cruces = [];              // últimos eventos del ESP32 (DETECTADO, LIBRE, REINICIO)
    this.prueba = { s1: 0, s2: 0, desde: new Date() };
    this.registroCSV = [];         // [hora de la PC, línea CSV, origen] para descargar
    this.ipESP32 = null;           // la página web del ESP32 (si su arranque llegó por el cable)
    this.tCruce = -Infinity;       // último DETECTADO (para encender el recorrido de los datos)
  }

  get est() { return this.app.estado; }
  get fuentes() { return this.app.fuentes; }
  // ¿los datos vienen de sensores reales? (USB en esta PC o la sala en vivo)
  get enVivo() { return this.fuentes.enVivo; }

  iniciar() {
    this.detener();
    const c = this.est.contador;
    this.base = c.conocido ? { e: c.entradas, s: c.salidas } : null;
    this.oyentes = [
      this.est.on('cruce', (e) => this.#alCruce(e)),
      this.est.on('contador', (e) => this.#alContador(e)),
      this.est.on('linea', (l) => this.#alLinea(l)),
      this.est.on('asientos', (e) => this.emit('camara', e)),
      this.est.on('reinicio', () => { this.base = null; }),
      this.fuentes.on('modo', () => { this.base = null; this.emit('conexion', this.estadoConexion()); }),
      this.fuentes.on('cambio', () => this.emit('conexion', this.estadoConexion())),
    ];
  }

  detener() { for (const off of this.oyentes) off(); this.oyentes = []; }

  // ------------------------------------------------------------ eventos del formato del informe
  #alCruce(e) {
    if (!this.enVivo || e.evento !== 'DETECTADO') return;
    const c = this.est.contador;
    if (e.sensor === 'S1') this.#entrada('real', c.entradas);
    else this.#salida('real', c.salidas);
  }

  // Las instantáneas de la sala corrigen líneas perdidas: si el contador subió sin línea, también cuenta
  #alContador({ tipoEvento, antes }) {
    if (!this.enVivo || tipoEvento) return;
    const c = this.est.contador;
    if (!c.conocido) return;
    if (this.base && antes?.conocido) {
      if (c.entradas < this.base.e) this.#reinicio(c);
      else {
        if (c.entradas > this.base.e) this.#entrada('real', c.entradas, 'instantánea');
        if (c.salidas > this.base.s) this.#salida('real', c.salidas, 'instantánea');
      }
    }
    if (!this.base) this.base = { e: c.entradas, s: c.salidas };
  }

  #reinicio(c) {
    this.emit('reinicio', { antes: this.base?.e ?? null, ahora: c.entradas });
    this.base = { e: c.entradas, s: c.salidas };
  }

  #entrada(origen, contador, via = 'línea') {
    const ahora = performance.now();
    if (contador != null) {
      if (this.base && contador < this.base.e) {
        // el contador volvió a empezar: el ESP32 se reinició (la detección actual sí es nueva)
        this.emit('reinicio', { antes: this.base.e, ahora: contador });
        this.base = { e: contador, s: this.est.contador.salidas };
      } else if (this.base && contador <= this.base.e) { this.emit('duplicado', { sensor: 'S1', contador }); return; }
      else if (!this.base) this.base = { e: contador, s: this.est.contador.salidas };
      else this.base.e = contador;
    }
    const rebote = ahora - this.ultimoS1 < REBOTE_MS;
    this.ultimoS1 = ahora;
    this.emit('entrada', { origen, contador, via, rebote, real: origen === 'real' });
  }

  #salida(origen, contador, via = 'línea') {
    const ahora = performance.now();
    if (contador != null) {
      if (this.base && contador < this.base.s) this.base.s = contador;
      else if (this.base && contador <= this.base.s) { this.emit('duplicado', { sensor: 'S2', contador }); return; }
      else if (!this.base) this.base = { e: this.est.contador.entradas, s: contador };
      else this.base.s = contador;
    }
    const rebote = ahora - this.ultimoS2 < REBOTE_MS;
    this.ultimoS2 = ahora;
    this.emit('salida', { origen, contador, via, rebote, real: origen === 'real' });
  }

  // ------------------------------------------------------------ líneas crudas y traductor
  #alLinea({ canal, linea, t }) {
    const texto = String(linea).replace(/\r/g, '');
    const r = interpretarLinea(texto);
    const oficial = !!r && OFICIALES.has(r.tipo);
    this.ultimaLinea = t || Date.now();
    let tipo = oficial ? 'oficial' : 'texto';
    if (this.inyectadas.has(texto)) { this.inyectadas.delete(texto); tipo = 'traducida'; }
    else if (oficial && r.tipo === 'contador') this.tOficial = Date.now();
    // solo traduce la PC conectada por USB (al visor ya le llega traducido)
    if (!oficial && this.fuentes.modo === 'usb') {
      if (pareceBasura(texto)) {
        this.basura++;
        tipo = 'ilegible';
        if (this.basura === 4) this.emit('basura', { baudios: CONTADOR.baudios });
      } else {
        this.basura = 0;
        const ev = traducirLinea(texto, this.memoria, this.patrones, { oficialReciente: Date.now() - this.tOficial < 120000 });
        if (ev) tipo = this.#aplicarTraduccion(ev, texto) || tipo;
      }
    }
    this.#prueba(texto, r, tipo);
    const item = { t: this.ultimaLinea, canal, linea: texto, tipo };
    this.lineas.push(item);
    if (this.lineas.length > 60) this.lineas.shift();
    this.emit('linea', item);
  }

  // ------------------------------------------------------------ prueba del sensor
  // Cada línea del ESP32 (o traducida al mismo formato) actualiza el espejo de su LCD y la lista de cruces
  #prueba(texto, r, tipo) {
    if (r?.tipo === 'info' && r.ip && /pagina|biblioaforo|http/i.test(sinTildes(r.texto))) this.ipESP32 = r.ip;
    let ev = null;
    if (r?.tipo === 'contador') ev = { evento: r.evento, sensor: r.sensor, duracion: r.duracion_ms, entradas: r.entradas, salidas: r.salidas, dentro: r.dentro, led: r.led, t_ms: r.t_ms };
    else {
      const m = RE_REINICIO.exec(texto);
      if (m) ev = { evento: 'REINICIO', sensor: null, duracion: null, entradas: Number(m[2]), salidas: Number(m[3]), dentro: Number(m[4]), led: Number(m[5]), t_ms: Number(m[1]) };
    }
    if (!ev) return;
    const ahora = new Date();
    const origen = tipo === 'traducida' ? 'traducida' : 'real';
    this.espejo = { entradas: ev.entradas, salidas: ev.salidas, dentro: ev.dentro, led: ev.led, t: ahora };
    if (ev.evento === 'DETECTADO') {
      if (ev.sensor === 'S2') this.prueba.s2++; else this.prueba.s1++;
      this.tCruce = performance.now();
    }
    this.cruces.push({ t: ahora, origen, linea: texto.trim(), ...ev });
    if (this.cruces.length > 200) this.cruces.shift();
    this.registroCSV.push([ahora, texto.trim(), origen]);
    if (this.registroCSV.length > MAX_REGISTRO) this.registroCSV.shift();
    this.emit('cruceCrudo', ev);
  }

  // Registro de la sesión en CSV: la hora de la PC más las columnas que imprime el ESP32
  exportarCSV() {
    const filas = ['hora_pc,t_ms,sensor,evento,duracion_ms,entradas,salidas,dentro,led,origen'];
    for (const [t, linea, origen] of this.registroCSV) filas.push(`${horaCompleta(t)},${linea},${origen}`);
    return `${filas.join('\r\n')}\r\n`;
  }

  // Pone en cero los contadores de la prueba (no toca el ESP32: la app nunca le escribe)
  limpiarPrueba() {
    this.prueba = { s1: 0, s2: 0, desde: new Date() };
    this.cruces = [];
  }

  #aplicarTraduccion(ev, original) {
    if (ev.tipo === 'ignorar') return 'ignorada';
    if (ev.tipo === 'base') return 'texto';
    if (ev.tipo === 'asiento') { this.#asientos(ev.asientos); return 'traducida: asiento'; }
    let e = 0, s = 0;
    if (ev.tipo === 'contadores') { e = ev.entradas; s = ev.salidas; }
    else if (ev.tipo === 'entrada') e = ev.n || 1;
    else if (ev.tipo === 'salida') s = ev.n || 1;
    for (let i = 0; i < e; i++) this.#evento('entrada', original);
    for (let i = 0; i < s; i++) this.#evento('salida', original);
    return e && s ? 'traducida: entrada y salida' : e ? 'traducida: entrada' : s ? 'traducida: salida' : 'texto';
  }

  // Evento traducido → líneas con el formato del informe (para esta PC y, si se comparte, para el visor)
  #evento(tipo, original) {
    const T = this.traducidos;
    if (tipo === 'entrada') T.entradas++; else T.salidas++;
    const dentro = Math.max(0, T.entradas - T.salidas);
    const ms = Math.round(performance.now());
    const sensor = tipo === 'entrada' ? 'S1_entrada' : 'S2_salida';
    this.#inyectar(`${ms},${sensor},DETECTADO,,${T.entradas},${T.salidas},${dentro},0`, 'contador');
    this.#inyectar(`${ms + 1},${sensor},LIBRE,350,${T.entradas},${T.salidas},${dentro},0`, 'contador');
    this.emit('traduccion', { tipo, original });
  }

  #asientos(lista) {
    const est = this.est.camara.asientos.map((a) => a.ocupado === true);
    for (const a of lista) if (a.i >= 0 && a.i < est.length) est[a.i] = a.ocupado;
    const libres = est.filter((o) => !o).length;
    const ms = Math.round(performance.now());
    this.#inyectar(`${ms} ms | Libres: ${libres}/${est.length} | ${est.map((o, i) => `A${i + 1}:${o ? 'OCUPADO(60%)' : 'libre(2%)'}`).join(' ')}`, 'camara');
  }

  // Se procesa en esta PC como si viniera del sensor y, si se comparte, se envía al visor
  #inyectar(linea, canal) {
    this.inyectadas.add(linea);
    queueMicrotask(() => {
      this.est.ingerir(linea, Date.now(), canal);
      if (this.fuentes.compartiendo) this.fuentes.transmisor.linea(canal, linea);
    });
  }

  // ------------------------------------------------------------ enseñar líneas desconocidas
  ensenar(linea, tipo) {
    const patron = patronDeLinea(linea);
    this.patrones = this.patrones.filter((p) => p.patron !== patron);
    if (tipo !== 'olvidar') this.patrones.push({ patron, tipo, ejemplo: String(linea).slice(0, 80) });
    this.#guardar(CLAVE_PATRONES, this.patrones);
    this.emit('patrones', this.patrones);
  }
  olvidar(i) { this.patrones.splice(i, 1); this.#guardar(CLAVE_PATRONES, this.patrones); this.emit('patrones', this.patrones); }

  #leer(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } }
  #guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } }

  // ------------------------------------------------------------ USB y velocidad del puerto
  get baudios() { return CONTADOR.baudios; }
  baudiosGuardados() { const b = Number(this.#leer(CLAVE_BAUDIOS, 0)); return BAUDIOS.includes(b) ? b : null; }

  // Abre un puerto nuevo a la velocidad elegida (el informe usa 115200; muchos programas de Arduino, 9600)
  async conectarUSB(baudios = CONTADOR.baudios) {
    CONTADOR.baudios = baudios;
    this.#guardar(CLAVE_BAUDIOS, baudios);
    this.basura = 0;
    await this.fuentes.conectarUSB();
  }

  // Cierra los puertos abiertos y los vuelve a abrir a otra velocidad (sin pedir permiso de nuevo)
  async reconectar(baudios) {
    CONTADOR.baudios = baudios;
    this.#guardar(CLAVE_BAUDIOS, baudios);
    this.basura = 0;
    this.memoria = { contador: null, entradas: null, salidas: null, digital: { S1: null, S2: null } };
    await this.fuentes.desconectarUSB();
    await this.fuentes.iniciar({ simular: false });
  }

  // ------------------------------------------------------------ ensayo (sin sensores): siempre simulado
  entradaEnsayo(via = 'botón de ensayo') { if (this.ensayo) this.#entrada('ensayo', null, via); }
  salidaEnsayo() { if (this.ensayo) this.#salida('ensayo', null, 'botón de ensayo'); }

  // ------------------------------------------------------------ estado de la conexión
  estadoConexion() {
    const f = this.fuentes, c = this.est.contador, k = this.est.camara;
    const ahora = Date.now();
    const hace = (t) => (t ? Math.max(0, Math.round((ahora - t) / 1000)) : null);
    let via = 'ninguna', detalle = 'Sin sensores conectados';
    if (f.modo === 'usb') { via = 'usb'; detalle = `USB · ${f.puertos.map(nombrePuerto).join(' + ')} · ${CONTADOR.baudios} baudios`; }
    else if (f.modo === 'remoto') { via = 'sala'; detalle = f.remotoConectado ? `Sala ${f.recibiendo} en vivo` : `Sala ${f.recibiendo}: conectando…`; }
    else if (f.modo === 'espera') { via = 'espera'; detalle = f.puertos.length ? 'Sensores en pausa' : 'Esperando sensores'; }
    else if (f.modo === 'sim') detalle = 'Simulación (sin sensores reales)';
    const silencio = f.modo === 'remoto' ? f.segundosSinRemoto : null;
    return {
      via, detalle, real: this.enVivo, ensayo: this.ensayo,
      salaCaida: f.modo === 'remoto' && (!f.remotoConectado || (silencio != null && silencio > 12)),
      compartiendo: f.compartiendo, servidores: f.servidoresCompartir || 0,
      contador: { conocido: c.conocido, entradas: c.entradas, salidas: c.salidas, dentro: c.dentro, hace: hace(c.ultima) },
      camara: { conocida: k.conocida, hace: hace(k.ultima), desactualizada: k.conocida && ahora - k.ultima > 15000 },
      ultimaLinea: hace(this.ultimaLinea),
    };
  }
}
