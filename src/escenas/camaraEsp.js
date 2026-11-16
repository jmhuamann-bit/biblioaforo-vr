// ESP32-CAM virtual: dibuja lo que vería la cámara del poste (320×240, escala de grises)
// y, en simulación, ejecuta el mismo algoritmo del Anexo B (sustracción de fondo con
// compensación de brillo, umbral de 30 niveles, 20 % de la zona y 3 lecturas seguidas).
import * as THREE from 'three';
import { CAMARA, MAQUETA as M } from '../config.js';
import { lienzo } from '../motor/texturas.js';
import { textura, FUENTE, rectRedondo } from '../motor/textos.js';

const W = CAMARA.ancho, H = CAMARA.alto;

// lineal (0-255) → sRGB (0-255)
const LUT = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  const x = i / 255;
  const s = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  LUT[i] = Math.max(0, Math.min(255, Math.round(s * 255)));
}

export class CamaraESP {
  constructor({ renderer, escena, grupoMaqueta, pose, ocultar = [] }) {
    this.renderer = renderer;
    this.escena = escena;
    this.grupoMaqueta = grupoMaqueta;
    this.ocultar = ocultar;
    const fovV = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(CAMARA.fovHorizontal) / 2) * (H / W));
    this.cam = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(fovV), W / H, 0.004, 3);
    this.poseLocal = pose;
    this.desvio = new THREE.Euler(0, 0, 0);   // para la demostración "se movió la cámara"
    this.rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true });
    this.rt.texture.generateMipmaps = false;
    this.pix = new Uint8Array(W * H * 4);
    this.gris = new Uint8Array(W * H);
    this.ref = new Uint8Array(W * H);
    this.mediaRef = 0;
    this.calibrada = false;
    this.calibrarPendiente = true;
    this.zonas = [];
    this.fracciones = new Array(M.sillas.length).fill(0);
    this.contadores = new Array(M.sillas.length).fill(0);
    this.ocupado = new Array(M.sillas.length).fill(false);
    this.acumulado = 0;
    this.leyendo = false;
    this.activa = true;           // captura periódica
    this.analizar = true;         // en vivo: false (los % vienen de la cámara real)
    this.alAnalizar = null;       // (t, fracciones) → firmware
    this.alCalibrar = null;
    this.valoresExternos = null;  // % reportados por la cámara real
    this.ruido = 1;
    // lienzo de presentación (pantalla del visor y recuadro en la PC)
    this.vista = lienzo(W * 2, H * 2 + 64);
    this.vctx = this.vista.getContext('2d');
    this.texturaVista = textura(this.vista);
    this.cuadros = 0;
    this.actualizarPose();
  }

  actualizarPose() {
    this.grupoMaqueta.updateMatrixWorld(true);
    const p = this.poseLocal.posicion.clone().applyMatrix4(this.grupoMaqueta.matrixWorld);
    const q = this.grupoMaqueta.getWorldQuaternion(new THREE.Quaternion()).multiply(this.poseLocal.quaternion).multiply(new THREE.Quaternion().setFromEuler(this.desvio));
    const s = this.grupoMaqueta.getWorldScale(new THREE.Vector3()).x;
    this.cam.position.copy(p);
    this.cam.quaternion.copy(q);
    this.cam.near = 0.004 * s; this.cam.far = 3 * s;
    this.cam.updateProjectionMatrix();
    this.cam.updateMatrixWorld(true);
    this.#calcularZonas();
  }

  // Zonas A1–A4: el volumen que ocupa una persona sentada en cada silla, proyectado a la imagen.
  #calcularZonas() {
    const v = new THREE.Vector3();
    this.zonas = M.sillas.map((s) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const dx of [-0.016, 0.016]) for (const dz of [-0.016, 0.016]) for (const y of [0.024, 0.07]) {
        v.set(s.x + dx, y, s.z + dz + s.mira * 0.004).applyMatrix4(this.grupoMaqueta.matrixWorld).project(this.cam);
        const px = (v.x + 1) / 2 * W, py = (1 - v.y) / 2 * H;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
      // se reduce un poco para que no se pisen (como las zonas dibujadas a mano del informe)
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, w = (x1 - x0) * 0.78, h = (y1 - y0) * 0.78;
      const z = {
        x: Math.max(0, Math.round(cx - w / 2)), y: Math.max(0, Math.round(cy - h / 2)),
        w: Math.round(w), h: Math.round(h),
      };
      z.w = Math.min(W - z.x, z.w); z.h = Math.min(H - z.y, z.h);
      return z;
    });
  }

  calibrar() { this.calibrarPendiente = true; }

  #capturar() {
    const r = this.renderer;
    const ocultos = [];
    for (const o of this.ocultar) if (o.visible) { o.visible = false; ocultos.push(o); }
    const xr = r.xr.enabled, sombras = r.shadowMap.autoUpdate, rtPrevio = r.getRenderTarget();
    r.xr.enabled = false;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(this.escena, this.cam);
    r.setRenderTarget(rtPrevio);
    r.xr.enabled = xr;
    r.shadowMap.autoUpdate = sombras;
    for (const o of ocultos) o.visible = true;
  }

  async #leer(t) {
    this.leyendo = true;
    try {
      await this.renderer.readRenderTargetPixelsAsync(this.rt, 0, 0, W, H, this.pix);
    } catch (e) {
      try { this.renderer.readRenderTargetPixels(this.rt, 0, 0, W, H, this.pix); } catch { this.leyendo = false; return; }
    }
    // a gris (luma), volteando filas (WebGL entrega de abajo hacia arriba) con algo de ruido de sensor
    const p = this.pix, g = this.gris;
    let semilla = (t * 9301 + 49297) % 233280;
    for (let y = 0; y < H; y++) {
      const fila = (H - 1 - y) * W;
      for (let x = 0; x < W; x++) {
        const i = (fila + x) * 4;
        const l = 0.299 * LUT[p[i]] + 0.587 * LUT[p[i + 1]] + 0.114 * LUT[p[i + 2]];
        semilla = (semilla * 9301 + 49297) % 233280;
        const n = (semilla / 233280 - 0.5) * 4 * this.ruido;
        g[y * W + x] = Math.max(0, Math.min(255, l + n));
      }
    }
    if (this.calibrarPendiente) {
      this.ref.set(g);
      this.mediaRef = this.#media(this.ref);
      this.calibrarPendiente = false;
      this.calibrada = true;
      this.contadores.fill(0); this.ocupado.fill(false); this.fracciones.fill(0);
      this.alCalibrar?.(t);
    } else if (this.analizar && this.calibrada) {
      this.#analizar();
      this.alAnalizar?.(t, this.fracciones.slice());
    }
    this.#dibujarVista();
    this.leyendo = false;
  }

  #media(img) {
    let s = 0;
    for (let i = 0; i < W * H; i += 4) s += img[i];
    return s / (W * H / 4);
  }

  // analizar() del Anexo B
  #analizar() {
    const dif = this.#media(this.gris) - this.mediaRef;
    this.zonas.forEach((q, z) => {
      let cambiados = 0, total = 0;
      for (let y = q.y; y < q.y + q.h; y += 2) {
        for (let x = q.x; x < q.x + q.w; x += 2) {
          const i = y * W + x;
          const d = this.gris[i] - this.ref[i] - dif;
          if (Math.abs(d) > CAMARA.umbralPixel) cambiados++;
          total++;
        }
      }
      this.fracciones[z] = total ? cambiados / total : 0;
      const lectura = this.fracciones[z] > CAMARA.umbralZona;
      if (lectura !== this.ocupado[z]) {
        if (++this.contadores[z] >= CAMARA.framesConfirma) { this.ocupado[z] = lectura; this.contadores[z] = 0; }
      } else this.contadores[z] = 0;
    });
  }

  #dibujarVista() {
    const ctx = this.vctx, c = this.vista;
    const img = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const v = this.gris[i];
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    if (!this._tmp) { this._tmp = lienzo(W, H); this._tctx = this._tmp.getContext('2d'); }
    this._tctx.putImageData(img, 0, 0);
    ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this._tmp, 0, 0, W * 2, H * 2);
    // zonas
    const externos = this.valoresExternos;
    this.zonas.forEach((q, z) => {
      const pct = externos ? (externos[z]?.pct ?? 0) / 100 : this.fracciones[z];
      const ocup = externos ? !!externos[z]?.ocupado : this.ocupado[z];
      const col = ocup ? '#ff3b3b' : '#2ee66b';
      ctx.lineWidth = 3; ctx.strokeStyle = col;
      ctx.strokeRect(q.x * 2, q.y * 2, q.w * 2, q.h * 2);
      ctx.font = `700 22px ${FUENTE}`;
      const txt = `${M.sillas[z].id} ${Math.round(pct * 100)}%`;
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(q.x * 2, q.y * 2 - 26, tw + 12, 26);
      ctx.fillStyle = col; ctx.fillText(txt, q.x * 2 + 6, q.y * 2 - 6);
      // barra de cambio con la marca del 20 %
      const bx = q.x * 2, by = (q.y + q.h) * 2 + 4, bw = q.w * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, bw, 7);
      ctx.fillStyle = col; ctx.fillRect(bx, by, Math.min(1, pct) * bw, 7);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(bx + CAMARA.umbralZona * bw - 1, by - 2, 2, 11);
      if (!externos) {
        for (let k = 0; k < CAMARA.framesConfirma; k++) {
          ctx.beginPath();
          ctx.arc(bx + bw - 8 - k * 12, q.y * 2 + 10, 4, 0, Math.PI * 2);
          ctx.fillStyle = k < this.contadores[z] ? '#facc15' : 'rgba(255,255,255,0.25)';
          ctx.fill();
        }
      }
    });
    // barra inferior
    const y0 = H * 2;
    ctx.fillStyle = '#0b1220'; ctx.fillRect(0, y0, c.width, 64);
    ctx.fillStyle = '#e2e8f0'; ctx.font = `700 22px ${FUENTE}`;
    ctx.fillText('ESP32-CAM · OV2640', 14, y0 + 27);
    ctx.font = `500 18px ${FUENTE}`; ctx.fillStyle = '#94a3b8';
    const libres = externos ? externos.filter((a) => a && !a.ocupado).length : this.ocupado.filter((o) => !o).length;
    ctx.fillText(externos ? 'Imagen reconstruida · % de la cámara real' : '320×240 · gris · cada 300 ms · umbral 30 · zona 20 %', 14, y0 + 52);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e2e8f0'; ctx.font = `700 26px ${FUENTE}`;
    ctx.fillText(`Libres ${libres}/${M.sillas.length}`, c.width - 14, y0 + 40);
    ctx.textAlign = 'left';
    // punto de grabación
    this.cuadros++;
    ctx.beginPath(); ctx.arc(c.width - 22, 22, 8, 0, Math.PI * 2);
    ctx.fillStyle = this.cuadros % 2 ? '#ef4444' : 'rgba(239,68,68,0.35)'; ctx.fill();
    this.texturaVista.needsUpdate = true;
    this.alDibujar?.(this.vista);
  }

  update(dt, t) {
    if (!this.activa || this.renderer.getContext().isContextLost()) return;
    this.acumulado += dt * 1000;
    if (this.acumulado >= CAMARA.periodoMs && !this.leyendo) {
      this.acumulado = 0;
      this.actualizarPose();
      this.#capturar();
      this.#leer(t);
    }
  }
}
