// Efectos de sonido sintetizados (sin archivos): sensores, asientos, alertas, misiones y
// un murmullo ambiental que crece con la ocupación de la biblioteca.
export class Sonido {
  constructor() {
    this.ctx = null;
    this.activo = true;
    try { this.activo = localStorage.getItem('ba-sonido') !== 'no'; } catch { /* sin almacenamiento */ }
    this.volumen = 0.55;
    this.ultimo = {};
    // el navegador solo permite sonido después de un gesto del usuario
    const iniciar = () => { this.#asegurar(); window.removeEventListener('pointerdown', iniciar); window.removeEventListener('keydown', iniciar); };
    window.addEventListener('pointerdown', iniciar);
    window.addEventListener('keydown', iniciar);
  }

  #asegurar() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.maestro = this.ctx.createGain();
      this.maestro.gain.value = this.activo ? this.volumen : 0;
      this.maestro.connect(this.ctx.destination);
      this.#ambiente();
      return true;
    } catch { return false; }
  }

  fijarActivo(v) {
    this.activo = v;
    try { localStorage.setItem('ba-sonido', v ? 'si' : 'no'); } catch { /* nada */ }
    if (this.#asegurar()) this.maestro.gain.setTargetAtTime(v ? this.volumen : 0, this.ctx.currentTime, 0.05);
  }

  #limitar(clave, ms) {
    const ahora = performance.now();
    if (this.ultimo[clave] && ahora - this.ultimo[clave] < ms) return false;
    this.ultimo[clave] = ahora;
    return true;
  }

  #tono(freq, dur, { tipo = 'sine', vol = 0.25, en = 0, desliz = null } = {}) {
    if (!this.ctx || !this.activo) return;
    const t0 = this.ctx.currentTime + en;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(freq, t0);
    if (desliz) o.frequency.exponentialRampToValueAtTime(desliz, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.maestro);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  // Sensor de puerta: entrada aguda, salida grave
  sensor(tipo) {
    if (!this.#asegurar() || !this.#limitar('sensor' + tipo, 90)) return;
    if (tipo === 'entrada') { this.#tono(1320, 0.07, { tipo: 'square', vol: 0.05 }); this.#tono(1760, 0.08, { tipo: 'square', vol: 0.045, en: 0.08 }); }
    else { this.#tono(990, 0.07, { tipo: 'square', vol: 0.05 }); this.#tono(740, 0.09, { tipo: 'square', vol: 0.045, en: 0.08 }); }
  }
  asiento(ocupado) {
    if (!this.#asegurar() || !this.#limitar('asiento', 120)) return;
    if (ocupado) this.#tono(660, 0.18, { vol: 0.05, desliz: 520 });
    else this.#tono(520, 0.18, { vol: 0.05, desliz: 700 });
  }
  seleccion() { if (this.#asegurar()) { this.#tono(880, 0.06, { vol: 0.09 }); this.#tono(1175, 0.09, { vol: 0.08, en: 0.06 }); } }
  sentarse() { if (this.#asegurar()) [523, 659, 784].forEach((f, i) => this.#tono(f, 0.22, { vol: 0.1, en: i * 0.07 })); }
  alerta() { if (this.#asegurar() && this.#limitar('alerta', 600)) { this.#tono(740, 0.16, { tipo: 'triangle', vol: 0.16 }); this.#tono(554, 0.24, { tipo: 'triangle', vol: 0.16, en: 0.17 }); } }
  exito() { if (this.#asegurar()) [523, 659, 784, 1047].forEach((f, i) => this.#tono(f, 0.3, { tipo: 'triangle', vol: 0.12, en: i * 0.09 })); }
  error() { if (this.#asegurar()) this.#tono(220, 0.25, { tipo: 'sawtooth', vol: 0.06, desliz: 160 }); }
  clic() { if (this.#asegurar() && this.#limitar('clic', 40)) this.#tono(1400, 0.03, { tipo: 'square', vol: 0.03 }); }

  // Murmullo: ruido filtrado cuyo volumen sigue a la ocupación (0 a 1)
  #ambiente() {
    const c = this.ctx;
    const largo = c.sampleRate * 2;
    const buf = c.createBuffer(1, largo, c.sampleRate);
    const d = buf.getChannelData(0);
    let ultimo = 0;
    for (let i = 0; i < largo; i++) { const blanco = Math.random() * 2 - 1; ultimo = (ultimo + 0.02 * blanco) / 1.02; d[i] = ultimo * 3.2; }
    const fuente = c.createBufferSource();
    fuente.buffer = buf; fuente.loop = true;
    const filtro = c.createBiquadFilter();
    filtro.type = 'bandpass'; filtro.frequency.value = 420; filtro.Q.value = 0.7;
    this.gainAmbiente = c.createGain();
    this.gainAmbiente.gain.value = 0;
    fuente.connect(filtro); filtro.connect(this.gainAmbiente); this.gainAmbiente.connect(this.maestro);
    fuente.start();
  }
  ambiente(ocupacion) {
    if (!this.ctx || !this.gainAmbiente) return;
    this.gainAmbiente.gain.setTargetAtTime(0.02 + Math.max(0, Math.min(1, ocupacion)) * 0.09, this.ctx.currentTime, 0.8);
  }
}
