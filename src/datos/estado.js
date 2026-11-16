// Estado de la maqueta: aforo (ESP32 DevKit) y asientos (ESP32-CAM), con historial y registro.
import { MAQUETA } from '../config.js';
import { interpretarLinea } from './parser.js';

export class Emisor {
  #oyentes = new Map();
  on(ev, fn) { if (!this.#oyentes.has(ev)) this.#oyentes.set(ev, new Set()); this.#oyentes.get(ev).add(fn); return () => this.off(ev, fn); }
  off(ev, fn) { this.#oyentes.get(ev)?.delete(fn); }
  emit(ev, ...args) { for (const fn of this.#oyentes.get(ev) || []) { try { fn(...args); } catch (e) { console.error(e); } } }
}

const MAX_LINEAS = 50000;

export class EstadoMaqueta extends Emisor {
  constructor() {
    super();
    this.capacidad = MAQUETA.capacidad;
    this.nAsientos = MAQUETA.sillas.length;
    this.reiniciar();
  }

  reiniciar() {
    this.contador = { conocido: false, entradas: 0, salidas: 0, dentro: 0, led: 0, t_ms: null, ultima: 0 };
    this.sensores = { S1: { bloqueado: false, desde: 0 }, S2: { bloqueado: false, desde: 0 } };
    this.camara = { conocida: false, calibrada: false, libres: null, ultima: 0, asientos: Array.from({ length: this.nAsientos }, () => ({ ocupado: null, pct: 0, desde: 0 })) };
    this.cruces = [];
    this.historial = [];
    this.eventos = [];
    this.registro = { contador: [], camara: [] };
    this.info = { ipContador: null, ipCamara: null };
    this.inicio = Date.now();
    this.emit('reinicio');
    this.emit('cambio');
  }

  get libres() {
    if (!this.camara.conocida) return null;
    return this.camara.asientos.filter((a) => a.ocupado === false).length;
  }
  get ocupados() {
    if (!this.camara.conocida) return null;
    return this.camara.asientos.filter((a) => a.ocupado === true).length;
  }
  // Asientos que la cámara ve ocupados pero que el conteo de puertas no explica
  get sinPersona() {
    if (!this.contador.conocido || !this.camara.conocida) return 0;
    return Math.max(0, this.ocupados - this.contador.dentro);
  }
  // Personas dentro que no tienen asiento (de pie o buscando)
  get sinAsiento() {
    if (!this.contador.conocido || !this.camara.conocida) return 0;
    return Math.max(0, this.contador.dentro - this.ocupados);
  }

  #log(tipo, texto, t = Date.now()) {
    this.eventos.push({ t, tipo, texto });
    if (this.eventos.length > 200) this.eventos.shift();
    this.emit('evento', { t, tipo, texto });
  }

  #muestra(t = Date.now()) {
    const ultima = this.historial[this.historial.length - 1];
    const m = { t, dentro: this.contador.conocido ? this.contador.dentro : null, libres: this.libres, led: this.contador.led };
    if (ultima && t - ultima.t < 50) this.historial[this.historial.length - 1] = m;
    else this.historial.push(m);
    if (this.historial.length > 4000) this.historial.splice(0, 1000);
  }

  // Muestra periódica para que la gráfica avance aunque no haya eventos
  latido(t = Date.now()) {
    const ultima = this.historial[this.historial.length - 1];
    if (!ultima || t - ultima.t > 2000) this.#muestra(t);
  }

  ingerir(linea, t = Date.now(), canalSugerido = null) {
    const r = interpretarLinea(linea);
    if (!r) return null;
    const canal = (r.tipo === 'contador' || r.tipo === 'cabecera') ? 'contador'
      : (r.tipo === 'camara' || r.tipo === 'calibrado') ? 'camara' : (canalSugerido || 'contador');
    const reg = this.registro[canal];
    reg.push({ t, linea: String(linea).replace(/\r/g, '') });
    if (reg.length > MAX_LINEAS) reg.splice(0, 5000);
    this.emit('linea', { canal, linea, t });

    if (r.tipo === 'contador') this.#aplicarContador(r, t);
    else if (r.tipo === 'cabecera') {
      // setup() imprime la cabecera al arrancar: los contadores están en cero
      Object.assign(this.contador, { conocido: true, entradas: 0, salidas: 0, dentro: 0, led: 0, ultima: t });
      this.#log('sistema', 'ESP32 DevKit en marcha: contadores en cero', t);
      this.#muestra(t);
      this.emit('contador', { tipoEvento: null });
      this.emit('cambio');
    } else if (r.tipo === 'camara') this.#aplicarCamara(r, t);
    else if (r.tipo === 'calibrado') {
      this.camara.calibrada = true; this.camara.conocida = true; this.camara.ultima = t;
      this.camara.asientos.forEach((a) => { a.ocupado = false; a.pct = 0; a.desde = t; });
      this.camara.libres = this.nAsientos;
      this.#log('camara', 'ESP32-CAM calibrada: referencia con los asientos vacíos', t);
      this.#muestra(t);
      this.emit('asientos', { cambios: this.camara.asientos.map((_, i) => i) });
      this.emit('cambio');
    } else if (r.tipo === 'info') {
      if (r.ip) {
        if (/cam/i.test(r.texto) || canalSugerido === 'camara') this.info.ipCamara = r.ip; else this.info.ipContador = r.ip;
      }
      this.#log('info', r.texto, t);
    }
    return r;
  }

  #aplicarContador(r, t) {
    const c = this.contador;
    const antes = { ...c };
    const s = this.sensores[r.sensor];
    if (r.evento === 'DETECTADO') { s.bloqueado = true; s.desde = t; }
    else { s.bloqueado = false; }
    Object.assign(c, { conocido: true, entradas: r.entradas, salidas: r.salidas, dentro: r.dentro, led: r.led, t_ms: r.t_ms, ultima: t });
    let tipoEvento = null;
    if (r.evento === 'DETECTADO') {
      if (r.sensor === 'S1') {
        tipoEvento = 'entrada';
        this.#log('entrada', `Entró una persona (S1) · dentro ${c.dentro}/${this.capacidad}`, t);
      } else {
        tipoEvento = 'salida';
        this.#log('salida', antes.conocido && antes.dentro === 0
          ? 'Salida registrada con la sala en cero (no baja de 0)'
          : `Salió una persona (S2) · dentro ${c.dentro}/${this.capacidad}`, t);
      }
      if (c.led && !antes.led) this.#log('lleno', 'Aforo completo: se encendió el LED rojo', t);
      if (!c.led && antes.led) this.#log('sistema', 'Hay espacio: se apagó el LED', t);
    } else if (r.duracion_ms != null) {
      const cruce = { t, sensor: r.sensor, duracion_ms: r.duracion_ms };
      this.cruces.push(cruce);
      if (this.cruces.length > 300) this.cruces.shift();
    }
    this.#muestra(t);
    this.emit('cruce', { sensor: r.sensor, evento: r.evento, duracion_ms: r.duracion_ms, t });
    this.emit('contador', { tipoEvento, antes });
    this.emit('cambio');
  }

  #aplicarCamara(r, t) {
    const cam = this.camara;
    const cambios = [];
    cam.conocida = true; cam.ultima = t;
    cam.libres = r.libres;
    if (r.asientos.length) {
      r.asientos.forEach((a, i) => {
        if (!a || i >= this.nAsientos) return;
        const previo = cam.asientos[i];
        if (previo.ocupado !== a.ocupado) {
          cambios.push(i);
          previo.desde = t;
          this.#log(a.ocupado ? 'ocupado' : 'libre', `${this.idAsiento(i)} ${a.ocupado ? 'ocupado' : 'libre'} (cambio ${Math.round(a.pct)} %)`, t);
        }
        previo.ocupado = a.ocupado; previo.pct = a.pct;
      });
    } else {
      // sin detalle por zona: se reparte el número de libres
      const ocupados = r.total - r.libres;
      cam.asientos.forEach((a, i) => { const o = i < ocupados; if (a.ocupado !== o) { cambios.push(i); a.desde = t; } a.ocupado = o; });
    }
    this.#muestra(t);
    this.emit('asientos', { cambios });
    this.emit('cambio');
  }

  idAsiento(i) { return MAQUETA.sillas[i]?.id || `A${i + 1}`; }

  // Estado completo para enviar por internet (los visores que se unen tarde)
  instantanea() {
    return {
      v: 1, t: Date.now(),
      contador: { ...this.contador },
      camara: { conocida: this.camara.conocida, calibrada: this.camara.calibrada, libres: this.camara.libres, asientos: this.camara.asientos.map((a) => ({ ocupado: a.ocupado, pct: a.pct })) },
      cruces: this.cruces.slice(-20),
    };
  }

  cargarInstantanea(s) {
    if (!s || s.v !== 1) return;
    const t = Date.now();
    const antes = { ...this.contador };
    Object.assign(this.contador, s.contador, { ultima: t });
    this.camara.conocida = !!s.camara.conocida;
    this.camara.calibrada = !!s.camara.calibrada;
    this.camara.libres = s.camara.libres;
    const cambios = [];
    s.camara.asientos.forEach((a, i) => {
      const p = this.camara.asientos[i]; if (!p) return;
      if (p.ocupado !== a.ocupado) { cambios.push(i); p.desde = t; }
      p.ocupado = a.ocupado; p.pct = a.pct;
    });
    if (Array.isArray(s.cruces) && !this.cruces.length) this.cruces = s.cruces;
    this.#muestra(t);
    this.emit('contador', { tipoEvento: null, antes });
    this.emit('asientos', { cambios });
    this.emit('cambio');
  }

  // Estadística de los cruces (para contrastar con t_b = 425 ± 170 ms del informe)
  estadisticaCruces() {
    const d = this.cruces.map((c) => c.duracion_ms).filter((x) => Number.isFinite(x));
    if (!d.length) return null;
    const media = d.reduce((a, b) => a + b, 0) / d.length;
    const desv = Math.sqrt(d.reduce((a, b) => a + (b - media) ** 2, 0) / Math.max(1, d.length - 1));
    return { n: d.length, media, desv };
  }
}
