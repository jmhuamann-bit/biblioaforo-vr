// Estado de la biblioteca: 332 asientos (cada uno con su origen) y las puertas (aforo 381).
// Dos indicadores independientes:
//   · personas dentro → solo cambia cuando alguien cruza una puerta
//   · asientos ocupados → solo cambia cuando una cámara confirma un asiento
import { Emisor } from '../datos/estado.js';
import { PLANO } from './plano.js';

export const ESTADOS = ['libre', 'ocupado', 'objeto', 'sinDato'];

export class EstadoBiblioteca extends Emisor {
  constructor() {
    super();
    this.asientos = PLANO.asientos.map((a) => ({
      ...a, ocupado: false, objeto: false, sinDato: false, origen: 'sim', desde: 0, estudiante: false, objetoHasta: 0,
    }));
    this.porId = new Map(this.asientos.map((a) => [a.id, a]));
    this.puertas = { dentro: 0, entradas: 0, salidas: 0, aforo: PLANO.aforo };
    this.minuto = 14 * 60 + 20;      // hora simulada del día (minutos desde las 0:00)
    this.historial = [];             // { min, dentro, ocupados, libres1, libres2 }
    this.eventos = [];
    this.version = 0;                // cambia con cada modificación (para redibujar)
    this.pilotoReal = false;         // la mesa piloto viene de la maqueta
  }

  get(id) { return this.porId.get(id); }

  // Estado visible de un asiento
  estadoDe(a) {
    if (a.sinDato) return 'sinDato';
    if (!a.ocupado) return 'libre';
    return a.objeto ? 'objeto' : 'ocupado';
  }

  libres(piso = null) { return this.asientos.filter((a) => (piso == null || a.piso === piso) && !a.ocupado && !a.sinDato).length; }
  ocupados(piso = null) { return this.asientos.filter((a) => (piso == null || a.piso === piso) && a.ocupado).length; }
  total(piso = null) { return piso == null ? this.asientos.length : this.asientos.filter((a) => a.piso === piso).length; }
  sentados() { return this.asientos.filter((a) => a.ocupado && !a.objeto).length; }

  log(tipo, texto) {
    this.eventos.push({ t: Date.now(), min: this.minuto, tipo, texto });
    if (this.eventos.length > 300) this.eventos.shift();
    this.emit('evento', this.eventos[this.eventos.length - 1]);
  }

  // Cambia un asiento. origen: 'sim' | 'real'
  fijar(id, ocupado, { objeto = false, origen = 'sim', estudiante = false, silencioso = false } = {}) {
    const a = this.porId.get(id);
    if (!a) return;
    const antes = this.estadoDe(a);
    a.ocupado = !!ocupado;
    a.objeto = !!ocupado && objeto;
    a.sinDato = false;
    a.origen = origen;
    a.estudiante = !!ocupado && estudiante;
    if (antes !== this.estadoDe(a)) {
      a.desde = Date.now();
      this.version++;
      this.emit('asiento', { a, antes, ahora: this.estadoDe(a) });
      if (!silencioso && (origen === 'real' || estudiante)) this.log(ocupado ? 'ocupado' : 'libre', `${id} ${ocupado ? (objeto ? 'apartado con un objeto' : 'ocupado') : 'libre'}${origen === 'real' ? ' (cámara real)' : ''}`);
    }
  }

  marcarSinDato(id) {
    const a = this.porId.get(id);
    if (!a || a.sinDato) return;
    a.sinDato = true; a.ocupado = false; a.objeto = false; a.origen = 'real';
    this.version++;
    this.emit('asiento', { a, antes: null, ahora: 'sinDato' });
  }

  entrar(n = 1, { estudiante = false } = {}) {
    if (n <= 0) return;
    this.puertas.entradas += n;
    this.puertas.dentro += n;
    this.version++;
    this.emit('puertas', { tipo: 'entrada', n, estudiante });
    if (estudiante) this.log('entrada', `Entraste: personas dentro ${this.puertas.dentro} (sensor de entrada)`);
  }

  salir(n = 1, { estudiante = false } = {}) {
    if (n <= 0) return;
    const reales = Math.min(n, this.puertas.dentro);
    this.puertas.salidas += n;
    this.puertas.dentro -= reales;
    this.version++;
    this.emit('puertas', { tipo: 'salida', n, estudiante });
    if (estudiante) this.log('salida', `Saliste: personas dentro ${this.puertas.dentro} (sensor de salida)`);
  }

  muestra() {
    const m = { min: this.minuto, dentro: this.puertas.dentro, ocupados: this.ocupados(), libres1: this.libres(1), libres2: this.libres(2) };
    const u = this.historial[this.historial.length - 1];
    if (u && m.min - u.min < 1) this.historial[this.historial.length - 1] = m; else this.historial.push(m);
    if (this.historial.length > 2000) this.historial.splice(0, 200);
  }

  hora(min = this.minuto) {
    const h = Math.floor(min / 60) % 24, m = Math.floor(min % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
