// Piezas de interfaz de las experiencias: objetivo, indicadores, minimapa, acciones,
// carteles y tarjeta de resultados. Las usan todos los modos.
import { PLANO } from '../biblioteca/plano.js';
import { NOMBRE_ENTORNO } from '../biblioteca/agentes.js';

const $ = (s) => document.querySelector(s);

export function mostrar(partes = {}) {
  for (const id of ['mira', 'objetivo', 'kpis', 'minimapa', 'barraAcciones', 'monitorSerie']) {
    const el = $('#' + id);
    if (el) el.hidden = !partes[id];
  }
  if (!partes.mira) $('#miraTexto').hidden = true;
}

// Tarjeta del objetivo (solo se redibuja si cambia). Sus botones llevan data-a="…" y avisan a alAccionObjetivo.
export function objetivo(html) {
  const el = $('#objetivo');
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
  return el;
}
let accionObjetivo = null;
export function alAccionObjetivo(fn) { accionObjetivo = fn; }
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('#objetivo [data-a]');
  if (b) accionObjetivo?.(b.dataset.a, b);
});

export function kpis(app) {
  const b = app.biblio, m = app.multitud;
  const r = m.resumen();
  const html = `<div>Personas dentro<b>${b.puertas.dentro}<small style="font-size:12px;color:#94a3b8"> / ${b.puertas.aforo}</small></b></div>
    <div>Hora<b>${b.hora()}</b></div>
    <div>Libres piso 1<b class="verde">${b.libres(1)}</b></div>
    <div>Libres sótano<b class="verde">${b.libres(2)}</b></div>
    <span class="entorno ${r.entorno}">${NOMBRE_ENTORNO[r.entorno]}${r.cola ? ` · ${r.cola} en la fila` : ''}</span>`;
  const el = $('#kpis');
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
}

export function acciones(lista) {
  const el = $('#barraAcciones');
  el.innerHTML = lista.map((a, i) => `<button data-i="${i}" class="${a.principal ? 'principal' : ''}" ${a.titulo ? `title="${a.titulo}"` : ''}>${a.tecla ? `<kbd>${a.tecla}</kbd>` : ''}${a.texto}</button>`).join('');
  el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => lista[Number(b.dataset.i)].fn?.()));
}

let tBanner = null;
let oyenteBanner = null;
export function alBanner(fn) { oyenteBanner = fn; }
export function banner(texto, tipo = 'info', sub = '', ms = 3200) {
  oyenteBanner?.(texto, tipo, sub, ms);
  const el = $('#banner');
  el.className = tipo;
  el.innerHTML = `${texto}${sub ? `<small>${sub}</small>` : ''}`;
  el.hidden = false;
  clearTimeout(tBanner);
  tBanner = setTimeout(() => { el.hidden = true; }, ms);
}

export function resultado(html, montar) {
  const sec = $('#resultado');
  // caja nueva en cada tarjeta: así los oyentes de clic de la anterior no se acumulan
  const vieja = sec.querySelector('.caja-resultado');
  const caja = vieja.cloneNode(false);
  caja.innerHTML = html;
  vieja.replaceWith(caja);
  sec.hidden = false;
  montar?.(caja);
  document.exitPointerLock?.();
}
export function cerrarResultado() { $('#resultado').hidden = true; }

export function estrellas(n) { return `<div class="estrellas">${[1, 2, 3].map((k) => `<span class="${k <= n ? '' : 'apagada'}">★</span>`).join('')}</div>`; }

export function formatoTiempo(s) { const m = Math.floor(s / 60), r = Math.round(s % 60); return `${m}:${String(r).padStart(2, '0')}`; }

// ---------------------------------------------------------------- minimapa del piso donde estás
export class Minimapa {
  constructor(app) {
    this.app = app;
    this.c = $('#minimapa');
    this.ctx = this.c.getContext('2d');
    this.t = 0;
  }
  update(dt, { pos, rumbo, objetivo = null, ruta = null, rival = null }) {
    if (this.c.hidden) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.2;
    const { ctx, c } = this;
    const b = this.app.biblio;
    const piso = pos?.piso || 1;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    // el edificio y la galería de la entrada caben completos
    const zMax = PLANO.galeria.z1 + 1;
    const esc = Math.min((W - 12) / (PLANO.x1 - PLANO.x0 + 2), (H - 30) / (zMax - PLANO.z0 + 1));
    const ox = (W - (PLANO.x1 - PLANO.x0) * esc) / 2, oy = 26;
    const X = (x) => ox + (x - PLANO.x0) * esc, Y = (z) => oy + (z - PLANO.z0) * esc;
    ctx.fillStyle = '#e2e8f0'; ctx.font = '700 13px "Segoe UI", sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(piso === 1 ? 'Piso 1 · Sala 1' : 'Sótano · Sala 2', 10, 16);
    ctx.textAlign = 'right'; ctx.fillStyle = '#4ade80';
    ctx.fillText(`${b.libres(piso)} libres`, W - 10, 16);
    if (piso === 1) {
      const G = PLANO.galeria;
      ctx.fillStyle = '#18233a'; ctx.fillRect(X(PLANO.x0), Y(PLANO.z1), (PLANO.x1 - PLANO.x0) * esc, (G.z1 - PLANO.z1) * esc);
      ctx.fillStyle = '#475569'; for (const cx of G.columnas) if (cx > PLANO.x0 && cx < PLANO.x1) { ctx.beginPath(); ctx.arc(X(cx), Y(G.zColumnas), 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#64748b'; ctx.font = '600 11px "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('galería · Pabellón C', X(0.5), Y(G.z1) - 4);
    }
    ctx.fillStyle = '#1b2740'; ctx.fillRect(X(PLANO.x0), Y(PLANO.z0), (PLANO.x1 - PLANO.x0) * esc, (PLANO.z1 - PLANO.z0) * esc);
    const E = PLANO.escalera;
    ctx.fillStyle = '#2b3a57'; ctx.fillRect(X(E.x0), Y(E.z0), (E.x1 - E.x0) * esc, (E.z1 - E.z0) * esc);
    // salas de la UP (sin asientos monitoreados)
    ctx.fillStyle = '#334155';
    for (const k of ['sala3', 'salasEstudio', 'computadoras', 'hemeroteca', 'diarios']) { const o = PLANO[k]; if (o.piso === piso) ctx.fillRect(X(o.x0), Y(o.z0), (o.x1 - o.x0) * esc, (o.z1 - o.z0) * esc); }
    for (const m of PLANO.mesas) if (m.piso === piso) { ctx.fillStyle = m.asientos[0].piloto ? '#a3863c' : '#6b5039'; ctx.fillRect(X(m.x - 1.2), Y(m.z - 0.5), 2.4 * esc, esc); }
    for (const a of b.asientos) {
      if (a.piso !== piso) continue;
      const e = b.estadoDe(a);
      ctx.fillStyle = a.estudiante ? '#38bdf8' : { libre: '#22c55e', ocupado: '#ef4444', objeto: '#f59e0b', sinDato: '#64748b' }[e];
      ctx.fillRect(X(a.x) - 1.6, Y(a.z) - 1.6, 3.2, 3.2);
    }
    if (piso === 1) { ctx.fillStyle = '#15803d'; for (const p of [PLANO.puertas.entrada, PLANO.puertas.salida]) ctx.fillRect(X(p.x0), Y(PLANO.z1) - 2, (p.x1 - p.x0) * esc, 4); }
    // estudiantes que caminan en este piso
    ctx.fillStyle = 'rgba(226,232,240,0.75)';
    for (const ag of this.app.multitud.agentes) if (ag.visible && ag.piso === piso && ag.z < zMax && !(ag.retraso > 0)) { ctx.beginPath(); ctx.arc(X(ag.x), Y(ag.z), 1.8, 0, Math.PI * 2); ctx.fill(); }
    if (ruta) {
      ctx.strokeStyle = '#5eead4'; ctx.lineWidth = 2.5; ctx.beginPath();
      let primero = true;
      for (const p of ruta) { const enPiso = piso === 1 ? p.y > -2.3 : p.y < -2.2; /* el sótano está abajo */ if (!enPiso) { primero = true; continue; } if (primero) { ctx.moveTo(X(p.x), Y(p.z)); primero = false; } else ctx.lineTo(X(p.x), Y(p.z)); }
      ctx.stroke();
    }
    if (objetivo && objetivo.piso === piso) { ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(X(objetivo.x), Y(objetivo.z), 5.5, 0, Math.PI * 2); ctx.stroke(); }
    if (rival && rival.visible && rival.piso === piso) { ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(X(rival.x), Y(rival.z), 3.6, 0, Math.PI * 2); ctx.fill(); }
    if (pos) {
      ctx.save(); ctx.translate(X(pos.x), Y(pos.z)); ctx.rotate(-rumbo + Math.PI);
      ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
}
