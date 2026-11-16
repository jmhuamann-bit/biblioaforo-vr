// Paneles 3D para el visor: un plano con canvas, con botones que se pulsan con el rayo del control.
import * as THREE from 'three';
import { lienzo } from '../motor/texturas.js';
import { FUENTE, rectRedondo, textura } from '../motor/textos.js';

export class Panel3D {
  constructor({ ancho = 1, alto = 0.6, px = 1600, nombre = 'panel', dibujar = null, opacidad = 1 } = {}) {
    this.ancho = ancho; this.alto = alto;
    this.c = lienzo(px, Math.round(px * alto / ancho));
    this.ctx = this.c.getContext('2d');
    this.tex = textura(this.c);
    this.material = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false, opacity: opacidad, depthWrite: true });
    this.malla = new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), this.material);
    this.malla.name = nombre;
    this.malla.userData.panel = this;
    this.malla.renderOrder = 20;
    this.botones = [];
    this.hover = null;
    this.presionado = null;
    this.dibujarContenido = dibujar;
    this.sucio = true;
  }

  // coordenadas del canvas (px)
  get w() { return this.c.width; }
  get h() { return this.c.height; }

  boton(id, x, y, w, h, texto, alPulsar, { activo = false, deshabilitado = false, subtitulo = null, acento = null, glifo = null, dibujar = null } = {}) {
    this.botones.push({ id, x, y, w, h, texto, alPulsar, activo, deshabilitado, subtitulo, acento, glifo, dibujar });
  }

  limpiarBotones() { this.botones = []; }

  marcar() { this.sucio = true; }

  dibujar() {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    this.dibujarContenido?.(ctx, this.w, this.h, this);
    for (const b of this.botones) this.#dibujarBoton(b);
    this.tex.needsUpdate = true;
    this.sucio = false;
  }

  #dibujarBoton(b) {
    const { ctx } = this;
    const hover = this.hover === b.id, pres = this.presionado === b.id;
    if (b.dibujar) { ctx.save(); b.dibujar(ctx, b, hover || pres); ctx.restore(); return; }
    ctx.save();
    const r = Math.min(b.h * 0.28, 26);
    ctx.fillStyle = b.deshabilitado ? 'rgba(148,163,184,0.08)' : b.activo ? 'rgba(56,189,248,0.32)' : hover ? 'rgba(148,163,184,0.3)' : 'rgba(148,163,184,0.14)';
    if (pres) ctx.fillStyle = 'rgba(56,189,248,0.5)';
    rectRedondo(ctx, b.x, b.y, b.w, b.h, r); ctx.fill();
    ctx.lineWidth = hover ? 5 : 3;
    ctx.strokeStyle = b.activo ? '#38bdf8' : hover ? 'rgba(226,232,240,0.85)' : 'rgba(148,163,184,0.35)';
    if (b.acento) ctx.strokeStyle = b.acento;
    ctx.stroke();
    ctx.fillStyle = b.deshabilitado ? '#64748b' : '#f1f5f9';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tam = Math.min(b.h * 0.34, 40);
    ctx.font = `700 ${tam}px ${FUENTE}`;
    const ty = b.subtitulo ? b.y + b.h * 0.4 : b.y + b.h / 2;
    let x = b.x + b.w / 2;
    if (b.glifo) {
      const gw = tam * 1.25;
      const tw = ctx.measureText(b.texto).width;
      const x0 = b.x + (b.w - (gw + 14 + tw)) / 2;
      dibujarGlifo(ctx, b.glifo, x0 + gw / 2, ty, gw);
      ctx.textAlign = 'left';
      x = x0 + gw + 14;
    }
    ctx.fillText(b.texto, x, ty);
    if (b.subtitulo) {
      ctx.textAlign = 'center';
      ctx.font = `500 ${tam * 0.62}px ${FUENTE}`; ctx.fillStyle = '#94a3b8';
      ctx.fillText(b.subtitulo, b.x + b.w / 2, b.y + b.h * 0.74);
    }
    ctx.restore();
  }

  // uv (0-1) → botón
  botonEn(uv) {
    const x = uv.x * this.w, y = (1 - uv.y) * this.h;
    // el último registrado queda encima (los asientos del mapa antes que las filas de acciones)
    for (let i = this.botones.length - 1; i >= 0; i--) {
      const b = this.botones[i];
      if (!b.deshabilitado && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  fijarHover(id) { if (this.hover !== id) { this.hover = id; this.sucio = true; } }

  pulsar(id) {
    const b = this.botones.find((x) => x.id === id);
    if (!b || b.deshabilitado) return false;
    this.presionado = id; this.sucio = true;
    setTimeout(() => { this.presionado = null; this.sucio = true; }, 160);
    b.alPulsar?.();
    return true;
  }

  update() { if (this.sucio) this.dibujar(); }
}

// Pequeños dibujos de los botones del Meta Quest (para las indicaciones)
export function dibujarGlifo(ctx, glifo, cx, cy, d) {
  ctx.save();
  const r = d / 2;
  if (['A', 'B', 'X', 'Y'].includes(glifo)) {
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f172a'; ctx.font = `800 ${d * 0.6}px ${FUENTE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(glifo, cx, cy + d * 0.03);
  } else if (glifo === 'gatillo') {
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath(); ctx.moveTo(cx - r * 0.5, cy - r); ctx.quadraticCurveTo(cx + r, cy - r * 0.6, cx + r * 0.4, cy + r); ctx.lineTo(cx - r * 0.5, cy + r * 0.6); ctx.closePath(); ctx.fill();
  } else if (glifo === 'agarre') {
    ctx.fillStyle = '#e2e8f0';
    rectRedondo(ctx, cx - r * 0.45, cy - r, r * 0.9, r * 2, r * 0.4); ctx.fill();
  } else if (glifo.startsWith('stick')) {
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = d * 0.12;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
