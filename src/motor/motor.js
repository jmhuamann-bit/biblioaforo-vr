// Motor gráfico: renderizador, calidad automática, posproceso (solo en pantalla) y bucle.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { fijarAnisotropia } from './texturas.js';

// GTAO que ignora lo translúcido (haces, halos, etiquetas): no deben "ensuciar" la oclusión.
class GTAOSelectivo extends GTAOPass {
  overrideVisibility() {
    super.overrideVisibility();
    this.scene.traverse((o) => {
      if (!o.visible) return;
      const m = o.material;
      if (o.isSprite || o.userData.sinAO || (m && !Array.isArray(m) && m.transparent && !m.depthWrite)) o.visible = false;
    });
  }
}

export function detectarCalidad(renderer) {
  const ua = navigator.userAgent;
  if (/OculusBrowser|Quest|Pico|Wolvic/i.test(ua)) return 'baja';
  if (/Android|iPhone|iPad|Mobile/i.test(ua)) return 'baja';
  let gpu = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch { /* sin información */ }
  if (/NVIDIA|GeForce|RTX|GTX|Quadro|Radeon (RX|Pro)|Arc\b|Apple M[1-9] (Pro|Max|Ultra)/i.test(gpu)) return 'alta';
  if (/Intel|Iris|UHD|Radeon|Apple|Adreno|Mali/i.test(gpu)) return 'media';
  return 'media';
}

export class Motor {
  constructor(contenedor) {
    this.contenedor = contenedor;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.xr.enabled = true;
    renderer.setClearColor(0x000000, 1);
    contenedor.appendChild(renderer.domElement);
    renderer.domElement.id = 'lienzo3d';
    this.renderer = renderer;
    // Si el navegador reinicia la tarjeta de video, three.js recupera el contexto solo; se avisa al usuario.
    this.contextoPerdido = false;
    renderer.domElement.addEventListener('webglcontextlost', () => { this.contextoPerdido = true; this.alPerderContexto?.(); });
    renderer.domElement.addEventListener('webglcontextrestored', () => { this.contextoPerdido = false; this.alRecuperarContexto?.(); });
    fijarAnisotropia(Math.min(16, renderer.capabilities.getMaxAnisotropy()));

    const guardada = (() => { try { return localStorage.getItem('ba-calidad'); } catch { return null; } })();
    this.calidadAuto = detectarCalidad(renderer);
    this.calidad = guardada || this.calidadAuto;

    this.camara = new THREE.PerspectiveCamera(50, 1, 0.01, 400);
    this.rig = new THREE.Group();
    this.rig.name = 'rig';
    this.rig.add(this.camara);
    this.escena = null;
    this.reloj = new THREE.Clock();
    this.tareas = new Set();     // funciones (dt, t) que corren cada cuadro
    this.antesDeDibujar = new Set();
    this.fps = 60; this._fpsAcum = 0; this._fpsN = 0;

    this.#crearPosproceso();
    this.aplicarCalidad();
    window.addEventListener('resize', () => this.redimensionar());
    this.redimensionar();
    renderer.setAnimationLoop((t, frame) => this.#cuadro(t, frame));
  }

  #crearPosproceso() {
    const r = this.renderer;
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.pasoRender = new RenderPass(new THREE.Scene(), this.camara);
    this.composer.addPass(this.pasoRender);
    this.pasoAO = new GTAOSelectivo(new THREE.Scene(), this.camara, 2, 2);
    this.pasoAO.blendIntensity = 0.85;
    this.composer.addPass(this.pasoAO);
    // umbral alto: solo brillan las fuentes de luz (LED, pantallas, haces), no las superficies iluminadas
    this.pasoBloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.42, 0.5, 1.15);
    this.composer.addPass(this.pasoBloom);
    this.composer.addPass(new OutputPass());
  }

  aplicarCalidad(c = this.calidad) {
    this.calidad = c;
    const r = this.renderer;
    const dpr = window.devicePixelRatio || 1;
    r.setPixelRatio(Math.min(dpr, c === 'alta' ? 2 : c === 'media' ? 1.5 : 1.25));
    this.pasoAO.enabled = c === 'alta';
    this.pasoBloom.enabled = c !== 'baja';
    this.usarPosproceso = c !== 'baja';
    this.escena?.alCambiarCalidad?.(c);
    this.redimensionar();
  }

  fijarDesplazamiento(px) {
    if (this.desplazamiento === px) return;
    this.desplazamiento = px;
    this.redimensionar();
  }

  fijarCalidad(c) {
    try { localStorage.setItem('ba-calidad', c); } catch { /* sin almacenamiento */ }
    this.aplicarCalidad(c);
  }

  redimensionar() {
    const w = this.contenedor.clientWidth || window.innerWidth;
    const h = this.contenedor.clientHeight || window.innerHeight;
    if (this.renderer.xr.isPresenting) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    // el centro óptico se corre a la izquierda cuando el panel lateral tapa la derecha
    const d = Math.min(this.desplazamiento || 0, w * 0.4);
    if (d > 0) {
      this.camara.aspect = (w + d) / h;
      this.camara.setViewOffset(w + d, h, d, 0, w, h);
    } else {
      this.camara.aspect = w / h;
      this.camara.clearViewOffset();
    }
    this.camara.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    // AO a media resolución: casi igual de bonito, mucho más liviano
    this.pasoAO.setSize(Math.round(w * pr * 0.5), Math.round(h * pr * 0.5));
  }

  usarEscena(escena) {
    if (this.escena === escena) return;
    this.escena?.alSalir?.();
    this.escena = escena;
    escena.scene.add(this.rig);
    this.pasoRender.scene = escena.scene;
    this.pasoAO.scene = escena.scene;
    if (escena.ao) this.pasoAO.updateGtaoMaterial(escena.ao);
    escena.alEntrar?.();
    escena.alCambiarCalidad?.(this.calidad);
  }

  #cuadro(t, frame) {
    const dt = Math.min(0.1, this.reloj.getDelta());
    const ahora = performance.now();
    this._fpsAcum += dt; this._fpsN++;
    if (this._fpsAcum > 1) { this.fps = this._fpsN / this._fpsAcum; this._fpsAcum = 0; this._fpsN = 0; }
    for (const f of this.tareas) f(dt, ahora, frame);
    if (!this.escena) return;
    this.escena.update?.(dt, ahora, frame);
    for (const f of this.antesDeDibujar) f(dt, ahora, frame);
    const xr = this.renderer.xr.isPresenting;
    if (!xr && this.usarPosproceso) {
      this.composer.render(dt);
    } else {
      this.renderer.render(this.escena.scene, this.camara);
    }
  }
}
