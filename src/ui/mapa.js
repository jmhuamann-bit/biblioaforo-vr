// Mapa interactivo (SVG en metros) de cada piso: mesas, asientos con su estado, zonas,
// escalera, puertas, "Estás aquí", ruta y destino. Se puede acercar y arrastrar.
import { PLANO, NOMBRE_ZONA } from '../biblioteca/plano.js';
import { cumpleFiltros, libresPorMesa } from '../biblioteca/recomendador.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, padre = null) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (padre) padre.appendChild(e);
  return e;
};

export class Mapa {
  constructor(contenedor, { estado, alElegir }) {
    this.cont = contenedor;
    this.estado = estado;
    this.alElegir = alElegir;
    this.piso = 2;
    this.filtros = {};
    this.elegido = null;
    this.tuyo = null;
    this.posicion = null;
    this.svg = el('svg', { class: 'mapa-svg', role: 'img', 'aria-label': 'Mapa del piso con asientos libres y ocupados' }, contenedor);
    this.capa = el('g', {}, this.svg);
    this.vb = null;
    this.#interaccion();
  }

  // ---------------------------------------------------------------- dibujo completo del piso
  dibujar(piso = this.piso) {
    this.piso = piso;
    const g = this.capa;
    g.innerHTML = '';
    this.circulos = new Map();
    const P = PLANO;
    const extraAbajo = piso === 1 ? 4 : 1;
    // sombra del edificio y planta
    el('rect', { x: P.x0, y: P.z0, width: P.x1 - P.x0, height: P.z1 - P.z0, rx: 0.4, class: 'm-planta' }, g);
    if (piso === 2) {
      el('rect', { x: -16.2, y: P.z0 + 0.3, width: 18.8, height: P.z1 - P.z0 - 0.6, class: 'm-zona-silencio' }, g);
      el('rect', { x: 2.6, y: P.z0 + 0.3, width: P.x1 - 2.6 - 0.3, height: P.z1 - P.z0 - 0.6, class: 'm-zona-grupo' }, g);
      this.#texto(g, -15.6, P.z0 + 1.2, 'ZONA DE SILENCIO', 'm-zona-etq silencio');
      this.#texto(g, 3.2, P.z0 + 1.2, 'TRABAJO EN GRUPO', 'm-zona-etq grupo');
    } else {
      el('rect', { x: P.x0, y: P.vestibuloZ, width: P.x1 - P.x0, height: P.z1 - P.vestibuloZ, class: 'm-vestibulo' }, g);
      this.#texto(g, P.x0 + 0.6, P.vestibuloZ + 1.0, 'VESTÍBULO', 'm-zona-etq vestibulo');
      // puertas y plaza
      for (const clave of ['entrada', 'salida']) {
        const pu = P.puertas[clave];
        el('rect', { x: pu.x0, y: P.z1 - 0.15, width: pu.x1 - pu.x0, height: 0.3, class: 'm-puerta' }, g);
        this.#texto(g, (pu.x0 + pu.x1) / 2, P.z1 + 1.1, clave === 'entrada' ? 'Entrada ↑' : 'Salida ↓', 'm-etq-centro');
      }
      const T = P.totem;
      el('rect', { x: T.x - 0.5, y: T.z - 0.15, width: 1.0, height: 0.3, rx: 0.08, class: 'm-totem' }, g);
      this.#texto(g, T.x, T.z - 0.5, 'Tótem', 'm-etq-centro peq');
      const Mo = P.mostrador;
      el('rect', { x: Mo.x0, y: Mo.z0, width: Mo.x1 - Mo.x0, height: Mo.z1 - Mo.z0, rx: 0.1, class: 'm-mueble' }, g);
      this.#texto(g, (Mo.x0 + Mo.x1) / 2, Mo.z0 - 0.35, 'Préstamos', 'm-etq-centro peq');
    }
    // muros con ventanas
    el('line', { x1: P.x1, y1: P.z0, x2: P.x1, y2: P.z1, class: 'm-ventana' }, g);
    el('line', { x1: P.x0, y1: P.z1, x2: P.x1, y2: P.z1, class: piso === 1 ? 'm-ventana' : 'm-ventana' }, g);
    // estantes
    for (const e of P.estantes) if (e.piso === piso) el('rect', { x: e.x0, y: e.z0, width: e.x1 - e.x0, height: e.z1 - e.z0, class: 'm-estante' }, g);
    // escalera
    const E = P.escalera;
    el('rect', { x: E.x0, y: E.z0, width: E.x1 - E.x0, height: E.z1 - E.z0, class: 'm-escalera' }, g);
    for (const t of [E.tramo1, E.tramo2]) {
      for (let k = 0; k <= 13; k++) {
        const z = Math.min(t.zAbajo, t.zArriba) + (k / 13) * Math.abs(t.zAbajo - t.zArriba);
        el('line', { x1: t.x0, y1: z, x2: t.x1, y2: z, class: 'm-peldano' }, g);
      }
    }
    this.#texto(g, (E.x0 + E.x1) / 2, E.z0 - 0.4, piso === 1 ? 'Escalera al piso 2' : 'Escalera', 'm-etq-centro peq');
    // mesas y asientos
    const porMesa = libresPorMesa(this.estado);
    for (const m of P.mesas) {
      if (m.piso !== piso) continue;
      const W = P.mesa.ancho, D = P.mesa.fondo;
      el('rect', { x: m.x - W / 2, y: m.z - D / 2, width: W, height: D, rx: 0.08, class: m.id === P.mesaPiloto.id ? 'm-mesa piloto' : 'm-mesa' }, g);
      this.#texto(g, m.x, m.z + 0.14, m.id, 'm-mesa-id');
      if (m.id === P.mesaPiloto.id) {
        el('rect', { x: m.x - W / 2 - 0.45, y: m.z - D / 2 - 1.55, width: W + 0.9, height: D + 3.1, rx: 0.35, class: 'm-piloto-aro' }, g);
        this.pilotoEtq = this.#texto(g, m.x, m.z + 2.3, '', 'm-piloto-etq');
      }
      for (const a of m.asientos) {
        const grupo = el('g', { class: 'm-asiento', 'data-id': a.id, tabindex: '-1' }, g);
        const c = el('circle', { cx: a.x, cy: a.z, r: 0.36 }, grupo);
        const x = el('path', { d: `M${a.x - 0.15} ${a.z - 0.15} L${a.x + 0.15} ${a.z + 0.15} M${a.x + 0.15} ${a.z - 0.15} L${a.x - 0.15} ${a.z + 0.15}`, class: 'm-x' }, grupo);
        const t = el('title', {}, grupo);
        this.circulos.set(a.id, { grupo, c, x, t, a });
      }
    }
    // capas superiores: ruta, destino y "estás aquí"
    this.capaRuta = el('g', {}, g);
    this.capaMarcas = el('g', {}, g);
    // encuadre
    const vb = { x: P.x0 - 1, y: P.z0 - 1, w: P.x1 - P.x0 + 2, h: P.z1 - P.z0 + 1 + extraAbajo };
    this.vbBase = vb;
    if (!this.vb || this.vbPiso !== piso) { this.vb = { ...vb }; this.vbPiso = piso; }
    this.#aplicarVB();
    this.actualizar(porMesa);
  }

  #texto(g, x, y, s, clase) {
    const t = el('text', { x, y, class: clase }, g);
    t.textContent = s;
    return t;
  }

  // ---------------------------------------------------------------- estados (sin redibujar todo)
  actualizar(porMesa = libresPorMesa(this.estado)) {
    if (!this.circulos) return;
    for (const { grupo, c, t, a } of this.circulos.values()) {
      const s = this.estado.get(a.id);
      let e = this.estado.estadoDe(s);
      const tuyo = a.id === this.tuyo;
      if (tuyo) e = 'tuyo';
      const ok = cumpleFiltros(a, this.filtros, porMesa.get(a.mesa) || 0);
      grupo.setAttribute('class', `m-asiento ${e}${a.id === this.elegido ? ' elegido' : ''}${ok ? '' : ' atenuado'}${a.piloto ? ' piloto' : ''}`);
      t.textContent = `${a.id} · ${tuyo ? 'tu asiento' : e === 'libre' ? 'libre' : e === 'ocupado' ? 'ocupado' : e === 'objeto' ? 'apartado con un objeto' : 'sin dato'}${a.piloto ? ' · mesa piloto' : ''} · ${NOMBRE_ZONA[a.zona]}`;
      c.setAttribute('r', a.id === this.elegido || tuyo ? 0.46 : 0.36);
    }
    if (this.pilotoEtq) this.pilotoEtq.textContent = this.estado.pilotoReal ? '● Mesa piloto en vivo (maqueta)' : 'Mesa piloto (maqueta, simulada)';
  }

  fijarFiltros(f) { this.filtros = { ...f }; this.actualizar(); }

  marcarPosicion(p) {
    this.posicion = p;
    this.#dibujarMarcas();
  }
  marcarElegido(id) { this.elegido = id; this.actualizar(); this.#dibujarMarcas(); }
  marcarTuyo(id) { this.tuyo = id; this.actualizar(); }

  #dibujarMarcas() {
    if (!this.capaMarcas) return;
    this.capaMarcas.innerHTML = '';
    if (this.posicion && this.posicion.piso === this.piso) {
      const p = this.posicion;
      el('circle', { cx: p.x, cy: p.z, r: 0.85, class: 'm-aqui-onda' }, this.capaMarcas);
      el('circle', { cx: p.x, cy: p.z, r: 0.42, class: 'm-aqui' }, this.capaMarcas);
      const t = el('text', { x: p.x + 0.9, y: p.z - 0.6, class: 'm-aqui-etq' }, this.capaMarcas);
      t.textContent = 'Estás aquí';
    } else if (this.posicion) {
      // en el otro piso: se marca por dónde llegarías (la escalera)
      const E = PLANO.escalera;
      const p = this.piso === 2 ? E.portal2 : E.portal1;
      el('circle', { cx: p.x, cy: p.z, r: 0.42, class: 'm-aqui', style: 'fill:none;stroke:#38bdf8;stroke-width:0.16' }, this.capaMarcas);
      const t = el('text', { x: p.x + 0.9, y: p.z - 0.6, class: 'm-aqui-etq' }, this.capaMarcas);
      t.textContent = this.piso === 2 ? 'Llegas por la escalera' : 'Bajas por la escalera';
    }
    const a = this.elegido && this.estado.get(this.elegido);
    if (a && a.piso === this.piso) {
      const pin = el('g', { class: 'm-pin', transform: `translate(${a.x} ${a.z - 0.55})` }, this.capaMarcas);
      el('path', { d: 'M0 0 L-0.55 -0.95 A0.65 0.65 0 1 1 0.55 -0.95 Z' }, pin);
      el('circle', { cx: 0, cy: -1.25, r: 0.24, class: 'm-pin-centro' }, pin);
    }
  }

  mostrarRuta(pts) {
    if (!this.capaRuta) return;
    this.capaRuta.innerHTML = '';
    if (!pts) return;
    // solo los tramos del piso que se ve (la escalera se dibuja hasta su borde)
    const y = (this.piso - 1) * PLANO.alturaPiso;
    const tramos = [];
    let actual = [];
    for (const p of pts) {
      const enPiso = Math.abs(p.y - y) < 0.6 || (this.piso === 1 ? p.y < 2.3 : p.y > 2.2);
      if (enPiso) actual.push(p); else if (actual.length) { tramos.push(actual); actual = []; }
    }
    if (actual.length) tramos.push(actual);
    for (const t of tramos) {
      if (t.length < 2) continue;
      const d = t.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.z.toFixed(2)}`).join(' ');
      el('path', { d, class: 'm-ruta-fondo' }, this.capaRuta);
      el('path', { d, class: 'm-ruta' }, this.capaRuta);
    }
  }

  // ---------------------------------------------------------------- acercar y arrastrar
  #aplicarVB() {
    const v = this.vb;
    this.svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  }
  encuadrar() { this.vb = { ...this.vbBase }; this.#aplicarVB(); }
  acercarA(x, z, ancho = 18) {
    const asp = this.vbBase.h / this.vbBase.w;
    this.vb = { x: x - ancho / 2, y: z - (ancho * asp) / 2, w: ancho, h: ancho * asp };
    this.#aplicarVB();
  }

  #interaccion() {
    const svg = this.svg;
    let arrastre = null, movio = false;
    const aMapa = (ev) => {
      const r = svg.getBoundingClientRect();
      const esc = Math.max(this.vb.w / r.width, this.vb.h / r.height);
      const ox = (r.width * esc - this.vb.w) / 2, oy = (r.height * esc - this.vb.h) / 2;
      return { x: this.vb.x - ox + (ev.clientX - r.left) * esc, y: this.vb.y - oy + (ev.clientY - r.top) * esc, esc };
    };
    svg.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const p = aMapa(ev);
      const f = Math.exp(ev.deltaY * 0.0012);
      const w = Math.min(this.vbBase.w * 1.2, Math.max(6, this.vb.w * f));
      const k = w / this.vb.w;
      this.vb = { x: p.x - (p.x - this.vb.x) * k, y: p.y - (p.y - this.vb.y) * k, w, h: this.vb.h * k };
      this.#aplicarVB();
    }, { passive: false });
    svg.addEventListener('pointerdown', (ev) => { arrastre = { x: ev.clientX, y: ev.clientY, vb: { ...this.vb } }; movio = false; svg.setPointerCapture(ev.pointerId); });
    svg.addEventListener('pointermove', (ev) => {
      if (!arrastre) return;
      const dx = ev.clientX - arrastre.x, dy = ev.clientY - arrastre.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) movio = true;
      if (!movio) return;
      const r = svg.getBoundingClientRect();
      const esc = Math.max(this.vb.w / r.width, this.vb.h / r.height);
      this.vb = { ...this.vb, x: arrastre.vb.x - dx * esc, y: arrastre.vb.y - dy * esc };
      this.#aplicarVB();
    });
    svg.addEventListener('pointerup', (ev) => {
      const fue = arrastre && !movio;
      arrastre = null;
      if (!fue) return;
      const objetivo = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.m-asiento');
      if (objetivo) { this.alElegir?.(objetivo.dataset.id); return; }
      // clic cerca de un asiento (más fácil en pantallas táctiles)
      const p = aMapa(ev);
      let mejor = null, dMin = 0.9;
      for (const { a } of this.circulos.values()) {
        const d = Math.hypot(a.x - p.x, a.z - p.y);
        if (d < dMin) { dMin = d; mejor = a.id; }
      }
      if (mejor) this.alElegir?.(mejor);
    });
  }
}
