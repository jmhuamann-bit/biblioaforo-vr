// Emulación de los dos programas del informe (Anexos A y B). Producen exactamente
// las mismas líneas que el Monitor Serie del ESP32 DevKit y de la ESP32-CAM, así la
// simulación recorre el mismo camino que los datos reales: líneas → intérprete → estado.
import { CONTADOR, CAMARA, MAQUETA } from '../config.js';

const HIGH = 1, LOW = 0;

export class FirmwareContador {
  constructor(alLinea) {
    this.alLinea = alLinea;
    this.capacidad = MAQUETA.capacidad;
    this.reiniciar(0);
  }

  reiniciar(t) {
    this.entradas = 0; this.salidas = 0; this.dentro = 0; this.led = 0;
    this.sens = [
      { nombre: 'S1_entrada', estable: HIGH, ultima: HIGH, tCambio: t, tInicio: 0 },
      { nombre: 'S2_salida', estable: HIGH, ultima: HIGH, tCambio: t, tInicio: 0 },
    ];
  }

  // Lo que imprime setup() al arrancar
  arrancar(t) {
    this.reiniciar(t);
    this.alLinea('# Sin Wi-Fi: el conteo sigue funcionando por el Monitor Serie');
    this.alLinea('t_ms,sensor,evento,duracion_ms,entradas,salidas,dentro,led');
  }

  #registrar(t, nombre, evento, duracion) {
    const d = duracion >= 0 ? String(Math.round(duracion)) : '';
    this.alLinea(`${Math.round(t)},${nombre},${evento},${d},${this.entradas},${this.salidas},${this.dentro},${this.led}`);
  }

  // leerSensor(i) del Anexo A: bloqueado = LOW (persona detectada)
  muestrear(t, bloqueos) {
    for (let i = 0; i < 2; i++) {
      const s = this.sens[i];
      const lectura = bloqueos[i] ? LOW : HIGH;
      if (lectura !== s.ultima) { s.tCambio = t; s.ultima = lectura; }
      if (t - s.tCambio >= CONTADOR.filtroMs && lectura !== s.estable) {
        s.estable = lectura;
        if (s.estable === LOW) {
          s.tInicio = t;
          if (i === 0) { this.entradas++; this.dentro++; }
          else { this.salidas++; if (this.dentro > 0) this.dentro--; }
          this.led = this.dentro >= this.capacidad ? 1 : 0;
          this.#registrar(t, s.nombre, 'DETECTADO', -1);
        } else {
          this.#registrar(t, s.nombre, 'LIBRE', t - s.tInicio);
        }
      }
    }
  }
}

export class FirmwareCamara {
  constructor(alLinea, n = 4) {
    this.alLinea = alLinea;
    this.n = n;
    this.ocupado = new Array(n).fill(false);
    this.contador = new Array(n).fill(0);
    this.fraccion = new Array(n).fill(0);
    this.calibrado = false;
  }

  calibrar() {
    this.ocupado.fill(false); this.contador.fill(0); this.fraccion.fill(0);
    this.calibrado = true;
    this.alLinea('Calibrado: referencia tomada con asientos vacios.');
  }

  libres() { return this.ocupado.filter((o) => !o).length; }

  // Parte de analizar() del Anexo B que decide el estado (las fracciones ya vienen calculadas)
  analizar(t, fracciones) {
    if (!this.calibrado) return;
    let huboCambio = false;
    for (let z = 0; z < this.n; z++) {
      this.fraccion[z] = fracciones[z];
      const lectura = fracciones[z] > CAMARA.umbralZona;
      if (lectura !== this.ocupado[z]) {
        if (++this.contador[z] >= CAMARA.framesConfirma) {
          this.ocupado[z] = lectura; this.contador[z] = 0; huboCambio = true;
        }
      } else {
        this.contador[z] = 0;
      }
    }
    if (huboCambio) {
      let s = `${Math.round(t)} ms | Libres: ${this.libres()}/${this.n} |`;
      for (let z = 0; z < this.n; z++) s += ` A${z + 1}:${this.ocupado[z] ? 'OCUPADO' : 'libre'}(${Math.round(this.fraccion[z] * 100)}%)`;
      this.alLinea(s);
    }
  }
}
