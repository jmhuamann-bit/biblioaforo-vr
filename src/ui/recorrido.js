// Recorrido guiado de la vista técnica (para la sustentación): cómo funciona la maqueta.
import { FUENTE, rectRedondo } from '../motor/textos.js';
import { escapar } from './hud.js';

const PASOS = [
  { t: 'La maqueta', vista: 'general', texto: 'Base de 50 × 35 cm, pared de 16 cm con dos puertas de 12 × 14 cm y una mesa de cuatro asientos (aforo de 4). En la biblioteca virtual es la <b>Mesa piloto 1-01</b>: la única con sensores reales.' },
  { t: 'Sensor S1 de entrada', vista: 'sensores', demo: 'entra', texto: 'El E18-D80NK emite infrarrojo de 940 nm: cada fotón (1,32 eV) supera la banda prohibida del silicio (1,12 eV) y el fototransistor lo detecta. Con apertura ≤ 15°, el haz mide <span class="formula">D = 2·d·tan(θ/2)</span> ≈ 11 cm a 40 cm.' },
  { t: 'Antirrebote y conteo', vista: 'frente', demo: 'entra', texto: 'El ESP32 lee cada 5 ms (200 Hz) y acepta un cambio solo si dura 50 ms. S1 suma y S2 resta sin bajar de cero. Con 4 personas se enciende el LED rojo y el LCD marca «LLENO».' },
  { t: 'ESP32-CAM', vista: 'camara', pip: true, texto: 'Modelo estenopeico. Cada 300 ms toma una imagen de 320 × 240 en gris y la compara con la referencia vacía, restando el cambio medio de brillo. Un píxel cambia si difiere más de 30 niveles; un asiento se ocupa si cambia más del 20 % de su zona en 3 lecturas seguidas: <span class="formula">3 × 300 ms = 0,9 s</span>.' },
  { t: 'Aforo no es asientos', vista: 'mesa', demo: 'mochila', texto: 'Las puertas responden «cuántas personas hay»; la cámara, «dónde sentarse». Si alguien se va y deja su mochila, la cámara sigue viendo el asiento ocupado: combinar ambos datos permite detectar sitios apartados.' },
  { t: 'Limitaciones', vista: 'sensores', demo: 'pareja', texto: 'Si dos personas cruzan con un hueco menor que <span class="formula">D + v·t<sub>f</sub> ≈ 0,15 m</span>, el haz no se libera y cuentan como una (14 de 20 en el informe). La cámara falla si cambia mucho la luz o se mueve: se recalibra con los asientos vacíos.' },
  { t: 'De la maqueta a la biblioteca', vista: 'sala', irBiblioteca: true, texto: 'Con una cámara cada 4 asientos, los 332 asientos necesitan <b>83 cámaras</b> (S/ 5 395 en cámaras, sección 6). La app muestra esa proyección simulada y, con los sensores conectados, la mesa piloto en vivo.' },
];

export class Recorrido {
  constructor(app) {
    this.app = app;
    this.i = 0;
    this.abierto = false;
    this.el = document.querySelector('#recorrido');
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.paso) this.ir(Number(b.dataset.paso));
      else if (b.dataset.a === 'ant') this.ir(this.i - 1);
      else if (b.dataset.a === 'sig') this.ir(this.i + 1);
      else if (b.dataset.a === 'demo') this.demo();
      else if (b.dataset.a === 'bib') { this.cerrar(); this.app.irModo('libre', { ir: 'piloto' }); }
      else if (b.dataset.a === 'cerrar') this.cerrar();
    });
  }

  abrir() {
    if (this.app.modo !== 'ingenieria') this.app.irModo('ingenieria');
    this.abierto = true;
    this.el.hidden = false;
    this.ir(this.i);
  }
  cerrar() { this.abierto = false; this.el.hidden = true; }

  ir(i) {
    this.i = Math.max(0, Math.min(PASOS.length - 1, i));
    const p = PASOS[this.i];
    this.app.vistaMaqueta(p.vista);
    if (p.pip) this.app.fijarPip(true);
    this.#render();
  }

  demo() {
    const p = PASOS[this.i];
    if (!p.demo) return;
    if (this.app.fuentes.modo !== 'sim') { this.app.hud.aviso('Las demostraciones usan la simulación: activa "Simulación" arriba.', 'aviso'); return; }
    this.app.accion(p.demo);
  }

  #render() {
    const p = PASOS[this.i];
    this.el.innerHTML = `
      <h2><small>Paso ${this.i + 1} de ${PASOS.length}</small>${escapar(p.t)}</h2>
      <p>${p.texto}</p>
      <div class="pasos">
        ${PASOS.map((x, k) => `<button data-paso="${k}" class="${k === this.i ? 'activo' : ''}" title="${escapar(x.t)}">${k + 1}</button>`).join('')}
        <span class="nav">
          ${p.demo ? '<button data-a="demo" class="demo">Ver demostración</button>' : ''}
          ${p.irBiblioteca ? '<button data-a="bib" class="demo">Ver en la biblioteca</button>' : ''}
          <button data-a="ant" ${this.i === 0 ? 'disabled' : ''}>← Anterior</button>
          <button data-a="sig" ${this.i === PASOS.length - 1 ? 'disabled' : ''}>Siguiente →</button>
          <button data-a="cerrar">Cerrar</button>
        </span>
      </div>`;
    this.app.vr?.refrescar?.();
  }

  tecla(code) {
    if (code === 'ArrowRight') { this.ir(this.i + 1); return true; }
    if (code === 'ArrowLeft') { this.ir(this.i - 1); return true; }
    if (code === 'Escape') { this.cerrar(); return true; }
    return false;
  }

  update() {}

  // Panel del visor
  dibujarVR(ctx, w, h, panel) {
    const p = PASOS[this.i];
    ctx.fillStyle = 'rgba(11,18,32,0.96)'; rectRedondo(ctx, 0, 0, w, h, 40); ctx.fill();
    ctx.strokeStyle = 'rgba(56,189,248,0.5)'; ctx.lineWidth = 5; ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#38bdf8'; ctx.font = `700 34px ${FUENTE}`; ctx.fillText(`Paso ${this.i + 1} de ${PASOS.length}`, 50, 70);
    ctx.fillStyle = '#f1f5f9'; ctx.font = `800 56px ${FUENTE}`; ctx.fillText(p.t, 50, 140);
    ctx.fillStyle = '#cbd5e1'; ctx.font = `500 36px ${FUENTE}`;
    const texto = p.texto.replace(/<[^>]+>/g, '');
    const palabras = texto.split(/\s+/);
    let l = '', y = 205;
    for (const pal of palabras) {
      const prueba = l ? `${l} ${pal}` : pal;
      if (ctx.measureText(prueba).width > w - 100 && l) { ctx.fillText(l, 50, y); y += 48; l = pal; } else l = prueba;
    }
    if (l) ctx.fillText(l, 50, y);
    panel.limpiarBotones();
    const bw = 300, by = h - 130;
    panel.boton('ant', 50, by, bw, 90, '← Anterior', () => this.ir(this.i - 1), { deshabilitado: this.i === 0 });
    if (p.demo) panel.boton('demo', 70 + bw, by, bw + 60, 90, 'Ver demostración', () => this.demo());
    panel.boton('sig', w - 50 - bw * 2 - 20, by, bw, 90, 'Siguiente →', () => this.ir(this.i + 1), { deshabilitado: this.i === PASOS.length - 1 });
    panel.boton('cerrar', w - 50 - bw, by, bw, 90, 'Cerrar', () => this.cerrar());
  }
}
