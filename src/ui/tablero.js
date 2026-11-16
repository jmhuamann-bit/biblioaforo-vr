// Tablero de BiblioAforo dibujado en canvas: lo usan la pantalla mural, la laptop
// virtual y los paneles del visor. Mismo diseño en todos lados.
import { FUENTE, rectRedondo } from '../motor/textos.js';
import { MAQUETA as M } from '../config.js';

export const PALETA = {
  fondo: '#0b1220', tarjeta: '#111a2e', borde: 'rgba(148,163,184,0.18)', texto: '#e2e8f0', suave: '#94a3b8',
  libre: '#22c55e', ocupado: '#ef4444', objeto: '#f59e0b', sinDato: '#64748b', acento: '#38bdf8', ir: '#ff3355',
};

const ETIQ_FUENTE = { sim: 'SIMULACIÓN', usb: 'EN VIVO · USB', remoto: 'EN VIVO · REMOTO', espera: 'SIN DATOS', pausa: 'PAUSA' };

export function colorAsiento(e) { return PALETA[e] || PALETA.sinDato; }

function tarjeta(ctx, x, y, w, h, titulo, s) {
  ctx.fillStyle = PALETA.tarjeta;
  rectRedondo(ctx, x, y, w, h, 18 * s); ctx.fill();
  ctx.strokeStyle = PALETA.borde; ctx.lineWidth = 2 * s; ctx.stroke();
  if (titulo) {
    ctx.fillStyle = PALETA.suave; ctx.font = `600 ${20 * s}px ${FUENTE}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(titulo.toUpperCase(), x + 20 * s, y + 36 * s);
  }
}

function anillo(ctx, cx, cy, r, frac, color, grosor) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(148,163,184,0.18)'; ctx.lineWidth = grosor;
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
  if (frac > 0) {
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * Math.min(1, frac)); ctx.stroke();
  }
}

// datos: { estado (EstadoMaqueta), fuente, estadoAsiento(i) → 'libre'|'ocupado'|'objeto'|'sinDato', titulo }
export function dibujarTablero(ctx, w, h, datos) {
  const { estado, fuente = 'sim' } = datos;
  const s = Math.min(w / 1600, h / 900);
  ctx.save();
  ctx.fillStyle = PALETA.fondo; ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w * 0.15, -h * 0.2, 0, w * 0.15, -h * 0.2, w);
  g.addColorStop(0, 'rgba(56,189,248,0.12)'); g.addColorStop(1, 'rgba(56,189,248,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const m = 36 * s;
  // cabecera
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillStyle = PALETA.texto; ctx.font = `800 ${46 * s}px ${FUENTE}`;
  ctx.fillText('BiblioAforo', m, m + 44 * s);
  const anchoTitulo = ctx.measureText('BiblioAforo').width;
  ctx.fillStyle = PALETA.acento; ctx.font = `700 ${26 * s}px ${FUENTE}`;
  ctx.fillText(datos.titulo || 'Maqueta · sala de estudio', m + anchoTitulo + 18 * s, m + 42 * s);
  // insignia de la fuente
  const etiq = ETIQ_FUENTE[fuente] || fuente;
  ctx.font = `800 ${22 * s}px ${FUENTE}`;
  const tw = ctx.measureText(etiq).width + 56 * s;
  const vivo = fuente === 'usb' || fuente === 'remoto';
  const colF = vivo ? PALETA.libre : fuente === 'sim' ? PALETA.acento : PALETA.sinDato;
  ctx.fillStyle = vivo ? 'rgba(34,197,94,0.15)' : 'rgba(56,189,248,0.14)';
  rectRedondo(ctx, w - m - tw, m + 6 * s, tw, 46 * s, 23 * s); ctx.fill();
  ctx.fillStyle = colF;
  ctx.beginPath(); ctx.arc(w - m - tw + 24 * s, m + 29 * s, 7 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillText(etiq, w - m - tw + 40 * s, m + 37 * s);

  const top = m + 80 * s;
  const altoUtil = h - top - m;
  const colW = (w - m * 4) / 3;
  // ---- Aforo
  const c = estado.contador;
  tarjeta(ctx, m, top, colW, altoUtil * 0.62, 'Personas dentro', s);
  const cx = m + colW / 2, cy = top + altoUtil * 0.36, r = Math.min(colW, altoUtil * 0.62) * 0.3;
  const frac = c.conocido ? c.dentro / estado.capacidad : 0;
  anillo(ctx, cx, cy, r, frac, c.led ? PALETA.ocupado : frac >= 0.75 ? PALETA.objeto : PALETA.libre, 26 * s);
  ctx.textAlign = 'center'; ctx.fillStyle = PALETA.texto;
  ctx.font = `800 ${110 * s}px ${FUENTE}`;
  ctx.fillText(c.conocido ? String(c.dentro) : '–', cx, cy + 34 * s);
  ctx.font = `600 ${26 * s}px ${FUENTE}`; ctx.fillStyle = PALETA.suave;
  ctx.fillText(`de ${estado.capacidad} (aforo)`, cx, cy + 76 * s);
  ctx.font = `700 ${24 * s}px ${FUENTE}`;
  ctx.fillStyle = c.led ? PALETA.ocupado : PALETA.suave;
  ctx.fillText(c.led ? '● SALA LLENA · LED encendido' : c.conocido ? '○ Hay espacio · LED apagado' : 'Esperando al contador', cx, top + altoUtil * 0.62 - 26 * s);

  // ---- Entradas / salidas / último cruce
  const y2 = top + altoUtil * 0.62 + m;
  const h2 = altoUtil - altoUtil * 0.62 - m;
  tarjeta(ctx, m, y2, colW, h2, null, s);
  const ult = estado.cruces[estado.cruces.length - 1];
  const celdas = [
    ['Entradas', c.conocido ? c.entradas : '–'],
    ['Salidas', c.conocido ? c.salidas : '–'],
    ['Último cruce', ult ? `${ult.duracion_ms} ms` : '–'],
  ];
  celdas.forEach(([k, v], i) => {
    const x = m + (colW / 3) * (i + 0.5);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETA.suave; ctx.font = `600 ${19 * s}px ${FUENTE}`;
    ctx.fillText(k, x, y2 + h2 * 0.38);
    ctx.fillStyle = PALETA.texto; ctx.font = `800 ${38 * s}px ${FUENTE}`;
    ctx.fillText(String(v), x, y2 + h2 * 0.78);
  });

  // ---- Asientos
  const x3 = m * 2 + colW;
  tarjeta(ctx, x3, top, colW, altoUtil, 'Asientos (ESP32-CAM)', s);
  const libres = estado.libres;
  ctx.textAlign = 'center'; ctx.fillStyle = PALETA.texto;
  ctx.font = `800 ${86 * s}px ${FUENTE}`;
  ctx.fillText(libres == null ? '–' : String(libres), x3 + colW / 2, top + 150 * s);
  ctx.font = `600 ${24 * s}px ${FUENTE}`; ctx.fillStyle = PALETA.suave;
  ctx.fillText(`asientos libres de ${estado.nAsientos}`, x3 + colW / 2, top + 190 * s);
  // plano de la mesa
  const px = x3 + colW * 0.12, pw = colW * 0.76, py = top + 230 * s, ph = altoUtil - 260 * s;
  const mesaW = pw * 0.56, mesaH = ph * 0.26;
  ctx.fillStyle = '#7c5a3a';
  rectRedondo(ctx, px + (pw - mesaW) / 2, py + (ph - mesaH) / 2, mesaW, mesaH, 10 * s); ctx.fill();
  const lado = Math.min(pw * 0.22, ph * 0.3);
  M.sillas.forEach((silla, i) => {
    const col = silla.x < 0 ? 0 : 1, fila = silla.mira > 0 ? 0 : 1;
    const sx = px + (pw - mesaW) / 2 + (col ? mesaW - lado * 1.15 : lado * 0.15);
    const sy = fila === 0 ? py + (ph - mesaH) / 2 - lado - 12 * s : py + (ph + mesaH) / 2 + 12 * s;
    const est = datos.estadoAsiento ? datos.estadoAsiento(i) : 'sinDato';
    const colr = colorAsiento(est);
    ctx.fillStyle = colr + '33'; ctx.strokeStyle = colr; ctx.lineWidth = 4 * s;
    rectRedondo(ctx, sx, sy, lado, lado, 14 * s); ctx.fill(); ctx.stroke();
    ctx.fillStyle = PALETA.texto; ctx.font = `800 ${30 * s}px ${FUENTE}`;
    ctx.fillText(silla.id, sx + lado / 2, sy + lado * 0.48);
    const a = estado.camara.asientos[i];
    ctx.font = `600 ${18 * s}px ${FUENTE}`; ctx.fillStyle = colr;
    const txt = est === 'libre' ? 'libre' : est === 'ocupado' ? 'ocupado' : est === 'objeto' ? 'objeto' : 'sin dato';
    ctx.fillText(txt, sx + lado / 2, sy + lado * 0.74);
    if (a && a.ocupado != null) { ctx.fillStyle = PALETA.suave; ctx.fillText(`${Math.round(a.pct)} %`, sx + lado / 2, sy + lado * 0.93); }
  });

  // ---- Gráfica de los últimos 5 minutos
  const x4 = m * 3 + colW * 2;
  tarjeta(ctx, x4, top, colW, altoUtil * 0.55, 'Últimos 5 minutos', s);
  const gx = x4 + 24 * s, gy = top + 60 * s, gw = colW - 48 * s, gh = altoUtil * 0.55 - 100 * s;
  const ahora = Date.now(), ventana = 5 * 60 * 1000;
  ctx.strokeStyle = 'rgba(148,163,184,0.15)'; ctx.lineWidth = 1.5 * s;
  for (let k = 0; k <= 4; k++) { const yy = gy + gh - (gh * k) / 4; ctx.beginPath(); ctx.moveTo(gx, yy); ctx.lineTo(gx + gw, yy); ctx.stroke(); }
  const serie = (campo, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = 4 * s; ctx.lineJoin = 'round';
    ctx.beginPath();
    let empezo = false, ultimoY = null;
    for (const p of estado.historial) {
      if (p.t < ahora - ventana || p[campo] == null) continue;
      const xx = gx + gw * (1 - (ahora - p.t) / ventana);
      const yy = gy + gh - (gh * p[campo]) / Math.max(estado.capacidad, estado.nAsientos);
      if (!empezo) { ctx.moveTo(xx, yy); empezo = true; } else { ctx.lineTo(xx, ultimoY); ctx.lineTo(xx, yy); }
      ultimoY = yy;
    }
    if (empezo) ctx.lineTo(gx + gw, ultimoY);
    ctx.stroke();
  };
  serie('dentro', PALETA.acento);
  serie('libres', PALETA.libre);
  ctx.font = `600 ${18 * s}px ${FUENTE}`; ctx.textAlign = 'left';
  ctx.fillStyle = PALETA.acento; ctx.fillText('— personas dentro', gx, gy + gh + 30 * s);
  ctx.fillStyle = PALETA.libre; ctx.fillText('— asientos libres', gx + gw * 0.52, gy + gh + 30 * s);

  // ---- Eventos recientes
  const y5 = top + altoUtil * 0.55 + m;
  const h5 = altoUtil - altoUtil * 0.55 - m;
  tarjeta(ctx, x4, y5, colW, h5, 'Eventos', s);
  const ev = estado.eventos.filter((e) => e.tipo !== 'info').slice(-5).reverse();
  ctx.textAlign = 'left';
  ev.forEach((e, i) => {
    const yy = y5 + 74 * s + i * 34 * s;
    if (yy > y5 + h5 - 10 * s) return;
    const col = e.tipo === 'entrada' ? PALETA.acento : e.tipo === 'salida' ? '#a78bfa' : e.tipo === 'ocupado' ? PALETA.ocupado : e.tipo === 'libre' ? PALETA.libre : e.tipo === 'lleno' ? PALETA.ocupado : PALETA.suave;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x4 + 30 * s, yy - 7 * s, 6 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PALETA.texto; ctx.font = `500 ${19 * s}px ${FUENTE}`;
    let txt = e.texto;
    while (ctx.measureText(txt).width > colW - 70 * s && txt.length > 4) txt = txt.slice(0, -2);
    if (txt !== e.texto) txt += '…';
    ctx.fillText(txt, x4 + 46 * s, yy);
  });
  ctx.restore();
}
