// De dónde vienen los datos: simulación, sensores por USB o un código de sala por internet.
// Regla: si no hay sensores se puede simular con un botón; si se conecta un sensor,
// sus datos pasan a mostrarse solos (la simulación se detiene).
import { Emisor } from './estado.js';
import { serialDisponible, PuertoBiblioAforo } from './serial.js';
import { Transmisor, Receptor, nuevoCodigo } from './remoto.js';

const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

export class Fuentes extends Emisor {
  constructor({ estado, director }) {
    super();
    this.estado = estado;
    this.director = director;
    this.modo = 'espera';
    this.puertos = [];
    this.transmisor = new Transmisor();
    this.receptor = new Receptor();
    this.compartiendo = null;     // código cuando esta PC comparte
    this.recibiendo = null;       // código cuando este equipo recibe
    this.remotoConectado = false;
    this.simForzada = false;
    this.tInstantanea = 0;
    estado.on('cambio', () => { this.tInstantanea = Math.min(this.tInstantanea, 0.25); });
    if (serialDisponible()) {
      navigator.serial.addEventListener('connect', (e) => this.#abrir(e.target || e.port, true));
    }
  }

  get usbDisponible() { return serialDisponible(); }
  get enVivo() { return this.modo === 'usb' || this.modo === 'remoto'; }

  // Al cargar: si el navegador ya tiene permiso para algún puerto, se abre solo.
  async iniciar({ simular = true, codigoRemoto = null } = {}) {
    if (codigoRemoto) { await this.recibir(codigoRemoto); return; }
    if (serialDisponible()) {
      try {
        const previos = await navigator.serial.getPorts();
        for (const p of previos) await this.#abrir(p, true);
      } catch { /* sin permiso */ }
    }
    if (!this.enVivo && simular) this.simular(true);
  }

  #fijarModo(m) {
    if (this.modo === m) return;
    this.modo = m;
    this.emit('modo', m);
    this.emit('cambio');
  }

  // ------------------------------------------------------------ simulación
  simular(activar = true) {
    if (activar) {
      this.simForzada = this.puertos.length > 0 || !!this.recibiendo;
      this.estado.reiniciar();
      this.#fijarModo('sim');          // primero el modo: así se registran las líneas de arranque
      this.director.iniciarSim();
    } else {
      this.simForzada = false;
      if (this.puertos.length) this.#aVivo('usb');
      else if (this.recibiendo) this.#aVivo('remoto');
      else { this.director.pausar(); this.estado.reiniciar(); this.#fijarModo('espera'); }
    }
  }

  // líneas que produce el firmware emulado
  lineaSimulada(canal, linea) {
    if (this.modo !== 'sim') return;
    this.estado.ingerir(linea, Date.now(), canal);
    this.transmisor.linea(canal, linea);
  }

  #aVivo(modo) {
    if (this.modo === modo) return;
    this.estado.reiniciar();
    this.#fijarModo(modo);
    this.director.iniciarVivo();
  }

  // ------------------------------------------------------------ USB
  async conectarUSB() {
    if (!serialDisponible()) throw new Error('sin-webserial');
    const p = await navigator.serial.requestPort({});
    await this.#abrir(p, false);
  }

  async #abrir(puerto, automatico) {
    if (!puerto || this.puertos.some((x) => x.puerto === puerto)) return;
    const pb = new PuertoBiblioAforo(puerto, {
      alLinea: (l) => this.#lineaUSB(l, pb),
      alCerrar: () => this.#cerrado(pb),
    });
    try {
      await pb.abrir();
    } catch (e) {
      this.emit('aviso', { tipo: 'error', texto: automatico ? null : `No se pudo abrir el puerto: ${e?.message || e}. Si el Monitor Serie de Arduino está abierto, ciérralo.` });
      return;
    }
    this.puertos.push(pb);
    this.emit('usb', this.puertos);
    this.emit('aviso', { tipo: 'ok', texto: `Sensor conectado por USB (${pb.nombre}). Mostrando datos reales.` });
    if (!this.simForzada) this.#aVivo('usb');
    this.emit('cambio');
  }

  #lineaUSB(linea, pb) {
    if (this.modo === 'sim' && !this.simForzada) this.#aVivo('usb');
    if (this.modo !== 'usb') return;
    this.estado.ingerir(linea, Date.now(), /CH340|CAM/.test(pb.nombre) ? 'camara' : null);
    this.transmisor.linea(null, linea);
  }

  #cerrado(pb) {
    this.puertos = this.puertos.filter((x) => x !== pb);
    this.emit('usb', this.puertos);
    this.emit('aviso', { tipo: 'aviso', texto: 'Se desconectó un sensor USB. Puedes volver a conectarlo o simular datos.' });
    if (!this.puertos.length && this.modo === 'usb') {
      // se mantiene el último estado a la vista, marcado "sin señal"
      this.director.pausar();
      this.#fijarModo('espera');
    }
    this.emit('cambio');
  }

  async desconectarUSB() {
    for (const p of [...this.puertos]) await p.cerrar();
    this.puertos = [];
    this.emit('usb', this.puertos);
  }

  // ------------------------------------------------------------ por internet
  async compartir() {
    const codigo = this.compartiendo || leer('ba-codigo-compartir') || nuevoCodigo();
    guardar('ba-codigo-compartir', codigo);
    await this.transmisor.iniciar(codigo, { alEstado: (n) => { this.servidoresCompartir = n; this.emit('cambio'); } });
    this.compartiendo = codigo;
    this.transmisor.instantanea(this.estado.instantanea());
    this.emit('cambio');
    return codigo;
  }

  dejarDeCompartir() {
    this.transmisor.detener();
    this.compartiendo = null;
    this.emit('cambio');
  }

  async recibir(codigo) {
    codigo = String(codigo).replace(/\D/g, '').slice(0, 6);
    if (codigo.length < 4) throw new Error('codigo');
    guardar('ba-codigo-recibir', codigo);
    this.recibiendo = codigo;
    this.simForzada = false;
    this.#aVivo('remoto');
    await this.receptor.iniciar(codigo, {
      alLinea: (l, canal) => { if (this.modo === 'remoto') this.estado.ingerir(l, Date.now(), canal); },
      alInstantanea: (s) => { if (this.modo === 'remoto') { if (!this.estado.contador.conocido && !this.estado.camara.conocida) this.estado.cargarInstantanea(s); else this.#corregir(s); } },
      alConexion: (c) => { this.remotoConectado = c.conectado; this.servidorRemoto = c.servidor; this.emit('cambio'); },
    });
    this.emit('cambio');
  }

  // Las instantáneas periódicas corrigen cualquier línea perdida en el camino
  #corregir(s) {
    const c = this.estado.contador, k = this.estado.camara;
    const difiere = s.contador.conocido !== c.conocido || s.contador.dentro !== c.dentro || s.contador.led !== c.led
      || s.camara.asientos.some((a, i) => a.ocupado !== k.asientos[i]?.ocupado);
    if (difiere) this.estado.cargarInstantanea(s);
  }

  dejarDeRecibir() {
    this.receptor.detener();
    this.recibiendo = null;
    this.remotoConectado = false;
    if (this.modo === 'remoto') { this.director.pausar(); this.#fijarModo('espera'); }
    this.emit('cambio');
  }

  get segundosSinRemoto() { return this.receptor.segundosSinDatos; }

  // ------------------------------------------------------------ cada cuadro
  update(dt) {
    if (!this.compartiendo) return;
    this.tInstantanea -= dt;
    if (this.tInstantanea <= 0) {
      this.tInstantanea = 2;
      this.transmisor.instantanea({ ...this.estado.instantanea(), origen: this.modo });
    }
  }
}
