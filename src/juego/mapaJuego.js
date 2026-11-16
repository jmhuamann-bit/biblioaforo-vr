// Mapa completo de un piso (tecla Tab) para elegir asiento en las experiencias.
// Reusa el mapa SVG del sistema: asientos con su estado, tu posición, la ruta y el destino.
import { Mapa } from '../ui/mapa.js';

const $ = (s) => document.querySelector(s);

export class MapaJuego {
  constructor(app) {
    this.app = app;
    this.mapa = new Mapa($('#mapaLienzo'), { estado: app.biblio, alElegir: (id) => this.alElegir?.(id) });
    this.abierto = false;
    this.t = 0;
    this.opc = {};
  }

  // opc: { piso, titulo, alElegir(id), pos, elegido, tuyo, ruta, filtros, ayuda }
  abrir(opc = {}) {
    this.opc = { piso: 1, titulo: 'Elige un asiento libre', filtros: {}, ...opc };
    this.alElegir = opc.alElegir || null;
    this.abierto = true;
    $('#mapa').hidden = false;
    document.body.classList.add('mapa-abierto');
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.verPiso(this.opc.piso, true);
  }

  cerrar() {
    if (!this.abierto) return;
    this.abierto = false;
    $('#mapa').hidden = true;
    document.body.classList.remove('mapa-abierto');
    this.alCerrar?.();
  }

  alternar(opc) { if (this.abierto) this.cerrar(); else this.abrir(opc); }

  verPiso(p, encuadrar = false) {
    const o = this.opc;
    o.piso = p;
    this.mapa.dibujar(p);
    this.mapa.fijarFiltros(o.filtros || {});
    this.mapa.marcarTuyo(o.tuyo || null);
    this.mapa.marcarElegido(o.elegido || null);
    this.mapa.marcarPosicion(o.pos || null);
    this.mapa.mostrarRuta(o.ruta || null);
    if (encuadrar) this.mapa.encuadrar();
    this.#barra();
  }

  // Cambia marcas sin redibujar todo
  marcar({ elegido, tuyo, ruta, pos } = {}) {
    if (elegido !== undefined) { this.opc.elegido = elegido; this.mapa.marcarElegido(elegido); }
    if (tuyo !== undefined) { this.opc.tuyo = tuyo; this.mapa.marcarTuyo(tuyo); }
    if (ruta !== undefined) { this.opc.ruta = ruta; this.mapa.mostrarRuta(ruta); }
    if (pos !== undefined) { this.opc.pos = pos; this.mapa.marcarPosicion(pos); }
  }

  #barra() {
    const b = this.app.biblio;
    const o = this.opc;
    $('#mapaBarra').innerHTML = `
      <b class="titulo-mapa">${o.titulo}</b>
      <div class="grupo-botones">${[1, 2].map((p) => `<button data-piso="${p}" aria-pressed="${p === o.piso}">Piso ${p} · <span>${b.libres(p)}</span> libres</button>`).join('')}</div>
      ${o.ayuda ? `<span class="ayuda-mapa">${o.ayuda}</span>` : ''}
      <div class="leyenda-mapa"><span class="l libre">Libre</span><span class="l ocupado">Ocupado</span><span class="l objeto">Apartado</span><span class="l tuyo">Tuyo / elegido</span><span class="l piloto">Mesa piloto</span></div>
      <button data-cerrar>Cerrar <kbd>Tab</kbd></button>`;
    $('#mapaBarra').querySelectorAll('[data-piso]').forEach((x) => x.addEventListener('click', () => this.verPiso(Number(x.dataset.piso), true)));
    $('#mapaBarra [data-cerrar]').addEventListener('click', () => this.cerrar());
  }

  update(dt, { pos } = {}) {
    if (!this.abierto) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.35;
    this.mapa.actualizar();
    for (const p of [1, 2]) { const s = document.querySelector(`#mapaBarra [data-piso="${p}"] span`); if (s) s.textContent = this.app.biblio.libres(p); }
    if (pos) { this.opc.pos = pos; this.mapa.marcarPosicion(pos); }
  }
}
