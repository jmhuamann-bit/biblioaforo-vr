// Vista aérea (tecla V) para las experiencias en primera persona: quita el techo (y el piso de
// arriba si estás abajo), muestra tu avatar y deja elegir con el ratón. V otra vez te devuelve
// a caminar donde estabas.
import { yPiso } from '../biblioteca/plano.js';
import * as H from './hudJuego.js';

export class VistaAerea {
  constructor(app) {
    this.app = app;
    this.activa = false;
    this.guardado = null;
  }

  get esc() { return this.app.escenas.biblioteca; }

  entrar({ texto = 'Haz clic en un asiento o en un objeto. V para volver a caminar.' } = {}) {
    if (this.activa) return;
    const j = this.app.jugador;
    const p = j.pos;
    this.guardado = { x: p.x, z: p.z, piso: p.piso, rumbo: j.rumbo, velocidad: this.app.control.paseo.velocidad };
    this.activa = true;
    j.detener();
    this.app.mapaJuego.cerrar();
    this.esc.verDesdeArriba(p.piso);
    const y = yPiso(p.piso);
    this.app.control.usarOrbita({ pos: [p.x + 3, y + 26, p.z + 14], obj: [p.x, y, p.z - 1], min: 5, max: 90, polarMax: Math.PI * 0.44, dur: 1.2 });
    const av = this.esc.b3d.avatar;
    av.position.set(p.x, y, p.z);
    av.rotation.y = this.guardado.rumbo;
    av.visible = true;
    H.banner('Vista aérea', 'info', texto, 2800);
  }

  salir() {
    if (!this.activa) return;
    this.activa = false;
    this.esc.restaurarVisibilidad();
    this.esc.b3d.avatar.visible = false;
    const g = this.guardado;
    this.app.jugador.iniciar({ x: g.x, z: g.z, piso: g.piso, rumbo: g.rumbo, velocidad: g.velocidad || 1.75, conservar: true });
  }

  alternar(opc) { if (this.activa) this.salir(); else this.entrar(opc); }

  // posición del jugador aunque esté en la vista aérea
  pos() { return this.activa ? this.guardado : this.app.jugador.pos; }
  rumbo() { return this.activa ? this.guardado.rumbo : this.app.jugador.rumbo; }
}
