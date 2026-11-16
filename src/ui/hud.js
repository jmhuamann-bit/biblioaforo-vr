// Interfaz en pantalla (HTML): panel con pestañas, avisos, diálogos, pistas de teclas y recuadro de la cámara.
const $ = (s, r = document) => r.querySelector(s);

export class HUD {
  constructor() {
    this.panel = $('#panel');
    this.contenido = $('#contenidoPanel');
    this.proveedor = null;
    this.pestana = 'datos';
    this.tActualizar = 0;
    this.pip = $('#pip');
    this.pipCtx = $('#pipLienzo').getContext('2d');
    $('#btnPlegar').addEventListener('click', () => this.plegar(true));
    $('#btnDesplegar').addEventListener('click', () => this.plegar(false));
    $('#dialogoCerrar').addEventListener('click', () => this.cerrarDialogo());
    $('#dialogo').addEventListener('click', (e) => { if (e.target.id === 'dialogo') this.cerrarDialogo(); });
    $('#pipCerrar').addEventListener('click', () => this.alCerrarPip?.());
    if (window.innerWidth < 860) this.plegar(true);
  }

  plegar(v) {
    this.panel.classList.toggle('plegado', v);
    $('#btnDesplegar').hidden = !v;
    this.alPlegar?.(v);
  }

  get panelVisible() { return !this.panel.classList.contains('plegado'); }

  usarProveedor(p) {
    this.proveedor = p;
    const visibles = Object.keys(p.pestanas);
    const cont = document.querySelector('.pestanas');
    // pestañas propias del proveedor (con una sola, se muestra solo su título)
    cont.querySelectorAll('[data-pestana]').forEach((b) => b.remove());
    const plegar = cont.querySelector('.plegar');
    for (const id of visibles) {
      const b = document.createElement('button');
      b.dataset.pestana = id;
      b.setAttribute('role', 'tab');
      b.textContent = p.pestanas[id].titulo;
      b.addEventListener('click', () => this.mostrarPestana(id));
      cont.insertBefore(b, plegar);
    }
    cont.classList.toggle('unica', visibles.length === 1);
    this.panel.classList.toggle('ancho', !!p.ancho);
    this.alPlegar?.(!this.panelVisible);
    this.mostrarPestana(visibles.includes(this.pestana) ? this.pestana : visibles[0]);
  }

  mostrarPestana(id) {
    this.pestana = id;
    for (const b of document.querySelectorAll('.pestanas [data-pestana]')) b.classList.toggle('activo', b.dataset.pestana === id);
    const p = this.proveedor?.pestanas[id];
    if (!p) return;
    // envoltura nueva en cada dibujo: así los oyentes de clic no se acumulan
    const scroll = this.mismaPestana === id ? this.contenido.scrollTop : 0;
    this.mismaPestana = id;
    const env = document.createElement('div');
    env.style.display = 'contents';
    env.innerHTML = p.html();
    this.contenido.replaceChildren(env);
    this.envoltura = env;
    p.montar?.(env);
    p.actualizar?.(env);
    this.contenido.scrollTop = scroll;
  }

  refrescarPestana() { this.mostrarPestana(this.pestana); }

  update(dt) {
    this.tActualizar -= dt;
    if (this.tActualizar > 0) return;
    this.tActualizar = 0.12;
    if (this.envoltura) this.proveedor?.pestanas[this.pestana]?.actualizar?.(this.envoltura);
  }

  // ---------------------------------------------------------------- avisos
  aviso(texto, tipo = 'info', ms = 4200) {
    if (!texto) return;
    const d = document.createElement('div');
    d.className = `aviso ${tipo}`;
    d.textContent = texto;
    $('#avisos').appendChild(d);
    setTimeout(() => { d.style.transition = 'opacity .4s'; d.style.opacity = '0'; setTimeout(() => d.remove(), 450); }, ms);
  }

  // ---------------------------------------------------------------- diálogos
  dialogo(html, montar) {
    $('#dialogoCuerpo').innerHTML = html;
    $('#dialogo').hidden = false;
    montar?.($('#dialogoCuerpo'));
    this.dialogoAbierto = true;
  }
  cerrarDialogo() { $('#dialogo').hidden = true; this.dialogoAbierto = false; this.alCerrarDialogo?.(); this.alCerrarDialogo = null; }

  // ---------------------------------------------------------------- pistas de teclas
  pistas(lista) {
    $('#pistas').innerHTML = lista.map(([teclas, texto]) => `<span>${teclas.split(' ').map((t) => `<kbd>${t}</kbd>`).join('')} ${texto}</span>`).join('');
  }

  // ---------------------------------------------------------------- vista de la ESP32-CAM
  mostrarPip(v) { this.pip.hidden = !v; }
  dibujarPip(lienzo) {
    if (this.pip.hidden) return;
    const c = this.pipCtx.canvas;
    if (c.width !== lienzo.width || c.height !== lienzo.height) { c.width = lienzo.width; c.height = lienzo.height; }
    this.pipCtx.drawImage(lienzo, 0, 0);
  }
}

export function hora(t) {
  const d = new Date(t);
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function escapar(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Gráfica de líneas en escalera para el panel
export function dibujarSerie(canvas, historial, { maximo, ventanaMs = 5 * 60 * 1000 } = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const ahora = Date.now();
  const m = { l: 34, r: 8, t: 10, b: 24 };
  const gw = w - m.l - m.r, gh = h - m.t - m.b;
  ctx.font = '600 20px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = '#64748b'; ctx.strokeStyle = 'rgba(148,163,184,0.16)'; ctx.lineWidth = 1.5;
  for (let k = 0; k <= maximo; k++) {
    const y = m.t + gh - (gh * k) / maximo;
    ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(w - m.r, y); ctx.stroke();
    ctx.fillText(String(k), 8, y + 7);
  }
  ctx.fillText('−5 min', m.l, h - 2);
  ctx.textAlign = 'right'; ctx.fillText('ahora', w - m.r, h - 2); ctx.textAlign = 'left';
  const serie = (campo, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.beginPath();
    let y0 = null;
    for (const p of historial) {
      if (p.t < ahora - ventanaMs || p[campo] == null) continue;
      const x = m.l + gw * (1 - (ahora - p.t) / ventanaMs);
      const y = m.t + gh - (gh * p[campo]) / maximo;
      if (y0 === null) ctx.moveTo(x, y); else { ctx.lineTo(x, y0); ctx.lineTo(x, y); }
      y0 = y;
    }
    if (y0 !== null) ctx.lineTo(w - m.r, y0);
    ctx.stroke();
  };
  serie('libres', '#22c55e');
  serie('dentro', '#38bdf8');
}

export function descargar(nombre, texto, tipo = 'text/plain;charset=utf-8') {
  const blob = new Blob([texto], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
