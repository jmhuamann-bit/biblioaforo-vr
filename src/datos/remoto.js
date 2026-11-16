// Datos en vivo por internet, para el visor autónomo (Meta Quest sin cable).
// La PC conectada por USB "comparte" con un código de sala de 4 dígitos y el visor lo "recibe".
// Viaja solo texto del Monitor Serie (conteos y asientos). Nunca imágenes.
import { REMOTO } from '../config.js';

let libreria = null;
async function mqtt() {
  if (!libreria) {
    const mod = await import(REMOTO.libreria);
    const m = mod.default || mod;
    libreria = m.connect ? m : (m.default || m);
  }
  return libreria;
}

const tema = (codigo, sub) => `${REMOTO.prefijo}${codigo}/${sub}`;
const idCliente = () => 'ba-vr-' + Math.random().toString(36).slice(2, 10);

export function nuevoCodigo() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// Publica en todos los servidores a la vez: el visor se conecta al primero que responda.
export class Transmisor {
  constructor() { this.clientes = []; this.codigo = null; this.activo = false; this.conectados = 0; }

  async iniciar(codigo, { alEstado } = {}) {
    this.detener();
    this.codigo = codigo;
    this.activo = true;
    const lib = await mqtt();
    for (const url of REMOTO.brokers) {
      const c = lib.connect(url, { clientId: idCliente(), connectTimeout: 8000, reconnectPeriod: 4000, keepalive: 30, clean: true });
      c.on('connect', () => { this.conectados = this.clientes.filter((x) => x.connected).length; alEstado?.(this.conectados); this.ultimaInstantanea && this.#publicar(c, 'estado', this.ultimaInstantanea, true); });
      c.on('close', () => { this.conectados = this.clientes.filter((x) => x.connected).length; alEstado?.(this.conectados); });
      c.on('error', () => {});
      this.clientes.push(c);
    }
  }

  #publicar(c, sub, obj, retener = false) {
    if (!c.connected) return;
    try { c.publish(tema(this.codigo, sub), JSON.stringify(obj), { qos: 0, retain: retener }); } catch { /* sin conexión */ }
  }

  linea(canal, linea) {
    if (!this.activo) return;
    const m = { v: 1, t: Date.now(), canal, linea };
    for (const c of this.clientes) this.#publicar(c, 'linea', m);
  }

  instantanea(snap) {
    if (!this.activo) return;
    this.ultimaInstantanea = snap;
    for (const c of this.clientes) this.#publicar(c, 'estado', snap, true);
  }

  detener() {
    for (const c of this.clientes) {
      try { if (c.connected && this.codigo) c.publish(tema(this.codigo, 'estado'), '', { retain: true }); } catch { /* nada */ }
      try { c.end(true); } catch { /* nada */ }
    }
    this.clientes = []; this.activo = false; this.conectados = 0;
  }
}

export class Receptor {
  constructor() { this.cliente = null; this.codigo = null; this.indice = 0; this.ultimo = 0; this.vigilante = null; }

  async iniciar(codigo, { alLinea, alInstantanea, alConexion }) {
    this.detener();
    this.codigo = codigo;
    this.cb = { alLinea, alInstantanea, alConexion };
    this.indice = 0;
    await this.#conectar();
    // si en 7 s no llega nada por este servidor, prueba el siguiente
    this.vigilante = setInterval(() => {
      const quieto = Date.now() - this.ultimo > 7000;
      if (quieto && (!this.cliente?.connected || Date.now() - this.inicioConexion > 7000)) {
        this.indice = (this.indice + 1) % REMOTO.brokers.length;
        this.#conectar();
      }
    }, 3500);
  }

  async #conectar() {
    const lib = await mqtt();
    try { this.cliente?.end(true); } catch { /* nada */ }
    const url = REMOTO.brokers[this.indice];
    this.inicioConexion = Date.now();
    const c = lib.connect(url, { clientId: idCliente(), connectTimeout: 8000, reconnectPeriod: 3000, keepalive: 30, clean: true });
    this.cliente = c;
    c.on('connect', () => {
      c.subscribe([tema(this.codigo, 'estado'), tema(this.codigo, 'linea')], { qos: 0 });
      this.cb.alConexion?.({ conectado: true, servidor: new URL(url).hostname });
    });
    c.on('close', () => this.cb.alConexion?.({ conectado: false }));
    c.on('error', () => {});
    c.on('message', (t, buf) => {
      const txt = buf.toString();
      if (!txt) return;
      let m;
      try { m = JSON.parse(txt); } catch { return; }
      this.ultimo = Date.now();
      if (t.endsWith('/estado')) this.cb.alInstantanea?.(m);
      else if (m && typeof m.linea === 'string') this.cb.alLinea?.(m.linea, m.canal);
    });
  }

  get segundosSinDatos() { return this.ultimo ? (Date.now() - this.ultimo) / 1000 : Infinity; }

  detener() {
    clearInterval(this.vigilante);
    try { this.cliente?.end(true); } catch { /* nada */ }
    this.cliente = null;
  }
}
