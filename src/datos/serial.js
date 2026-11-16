// Lectura por USB (Web Serial) de lo que ya imprime BiblioAforo por el Monitor Serie.
// Solo LEE: nunca escribe en el puerto (no envía la 'r' que reinicia el conteo).
// Funciona en Chrome o Edge de escritorio. Es lo mismo que abrir el Monitor Serie.
import { CONTADOR } from '../config.js';

export const serialDisponible = () => typeof navigator !== 'undefined' && 'serial' in navigator && window.isSecureContext;

export class PuertoBiblioAforo {
  constructor(puerto, { alLinea, alCerrar }) {
    this.puerto = puerto;
    this.alLinea = alLinea;
    this.alCerrar = alCerrar;
    this.lector = null;
    this.abierto = false;
    const info = puerto.getInfo?.() || {};
    this.nombre = nombrePorChip(info.usbVendorId);
    this.lineas = 0;
  }

  async abrir() {
    await this.puerto.open({ baudRate: CONTADOR.baudios, bufferSize: 8192 });
    // Señales en reposo a la vez: evita que el circuito de auto-reset del ESP32 lo reinicie.
    try { await this.puerto.setSignals({ dataTerminalReady: false, requestToSend: false }); } catch { /* sin control de señales */ }
    this.abierto = true;
    this.#leer();
  }

  async #leer() {
    const decodificador = new TextDecoderStream();
    this.cerrado = this.puerto.readable.pipeTo(decodificador.writable).catch(() => {});
    this.lector = decodificador.readable.getReader();
    let resto = '';
    try {
      while (true) {
        const { value, done } = await this.lector.read();
        if (done) break;
        resto += value;
        let i;
        while ((i = resto.indexOf('\n')) >= 0) {
          const linea = resto.slice(0, i).replace(/\r$/, '');
          resto = resto.slice(i + 1);
          if (linea.trim()) { this.lineas++; this.alLinea(linea, this); }
        }
        if (resto.length > 4096) resto = resto.slice(-512);
      }
    } catch (e) {
      console.warn('Puerto serie cerrado:', e?.message || e);
    } finally {
      this.abierto = false;
      try { this.lector.releaseLock(); } catch { /* ya liberado */ }
      this.alCerrar?.(this);
    }
  }

  async cerrar() {
    try { await this.lector?.cancel(); } catch { /* nada */ }
    try { await this.cerrado; } catch { /* nada */ }
    try { await this.puerto.close(); } catch { /* nada */ }
    this.abierto = false;
  }
}

function nombrePorChip(vid) {
  if (vid === 0x10c4) return 'CP2102 (ESP32 DevKit)';
  if (vid === 0x1a86) return 'CH340 (ESP32-CAM-MB)';
  if (vid === 0x303a) return 'ESP32 (USB nativo)';
  if (vid === 0x0403) return 'FTDI';
  return 'Puerto USB';
}

// Filtros de chips USB-serie habituales en placas ESP32 (no son obligatorios)
export const FILTROS_USB = [{ usbVendorId: 0x10c4 }, { usbVendorId: 0x1a86 }, { usbVendorId: 0x303a }, { usbVendorId: 0x0403 }];
