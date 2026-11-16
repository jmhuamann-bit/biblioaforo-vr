// Experiencia principal: un estudiante entra a la biblioteca, ve la disponibilidad de los dos
// pisos, elige piso y asiento en el mapa, sigue la ruta (primera persona o vista aérea) y se sienta.
import * as THREE from 'three';
import { PLANO, PUNTOS, ruta as calcularRuta, yPiso, NOMBRE_ZONA, alturaSuelo } from '../biblioteca/plano.js';
import { recomendar, recomendarPiso } from '../biblioteca/recomendador.js';
import { Mapa } from './mapa.js';
import { escapar } from './hud.js';
import { FUENTE, rectRedondo } from '../motor/textos.js';

const ETAPA = { llegada: 1, pisos: 2, mapa: 3, asiento: 3, ruta: 4, sentado: 5 };
const NOMBRES_ETAPA = ['Entrar', 'Piso', 'Asiento', 'Ruta', 'Sentarse'];
const OJOS = 1.62, OJOS_SENTADO = 1.18;
const $ = (s) => document.querySelector(s);

export class Estudiante {
  constructor(app) {
    this.app = app;
    this.biblio = app.biblio;
    this.paso = 'llegada';
    this.piso = null;
    this.elegido = null;
    this.tuyo = null;
    this.esperandoCamara = null;
    this.pos = { ...PUNTOS.plaza };
    this.nivel = 1;
    this.entro = false;
    this.vistaRuta = 'primera';
    this.filtros = {};
    this.sugerencias = [];
    this.caminata = null;
    this.manual = false;
    this.rutaActual = null;
    this.activo = false;
    this.mapaVisible = false;
    this.verMapa3D = false;
    this.tSugerencias = 0;
    this.mapa = new Mapa($('#mapaLienzo'), { estado: this.biblio, alElegir: (id) => this.elegir(id) });
    this.#barraMapa();
    this.biblio.on('asiento', (e) => this.#alCambiarAsiento(e));
    this.#seleccionEn3D();
  }

  get escena() { return this.app.escenas.biblioteca; }
  get b3d() { return this.escena.b3d; }
  get control() { return this.app.control; }
  get enVR() { return !!this.app.vr?.presentando; }

  // ================================================================ entrar y salir del modo
  iniciar() {
    this.activo = true;
    this.#aplicarPaso(true);
  }
  detener() {
    this.activo = false;
    this.#mostrarMapa(false);
    this.#pararCaminata();
    this.b3d.ocultarRuta();
    this.b3d.marcarDestino(null);
    this.b3d.avatar.visible = false;
    this.escena.enfocarPiso(null);
    this.escena.restaurarVisibilidad();
  }

  // ================================================================ pasos
  irA(paso) {
    this.paso = paso;
    this.#aplicarPaso();
  }

  #aplicarPaso(inicial = false) {
    if (!this.activo) return;
    const esc = this.escena;
    const c = this.control;
    const v = esc.vistas();
    this.#pararCaminata();
    this.manual = false;
    this.b3d.avatar.visible = false;
    const paso = this.paso;
    if (paso !== 'mapa' && paso !== 'asiento') this.#mostrarMapa(false);
    if (paso === 'llegada') {
      esc.separarPisos(false); esc.enfocarPiso(null); esc.restaurarVisibilidad();
      this.b3d.ocultarRuta(); this.b3d.marcarDestino(null);
      if (!this.enVR) c.usarOrbita({ pos: v.fachada.pos, obj: v.fachada.obj, min: 3, max: 80, animar: !inicial, polarMax: Math.PI * 0.495 });
    } else if (paso === 'pisos') {
      esc.restaurarVisibilidad();
      // en el visor el usuario está dentro: no se separan los pisos a su alrededor
      esc.separarPisos(!this.enVR);
      esc.enfocarPiso(this.enVR ? null : this.piso);
      this.b3d.ocultarRuta();
      if (!this.enVR) c.usarOrbita({ pos: v.casa.pos, obj: v.casa.obj, min: 8, max: 120, polarMax: Math.PI * 0.47 });
    } else if (paso === 'mapa' || paso === 'asiento') {
      if (!this.piso) this.piso = recomendarPiso(this.biblio).piso || 1;
      esc.separarPisos(!this.verMapa3D && !this.enVR);
      esc.enfocarPiso(this.enVR ? null : this.piso);
      this.mapa.dibujar(this.piso);
      this.mapa.marcarPosicion(this.pos);
      this.mapa.marcarElegido(paso === 'asiento' ? this.elegido : null);
      this.mapa.fijarFiltros({ ...this.filtros });
      if (paso === 'asiento' && this.elegido) {
        this.rutaActual = this.#rutaHacia(this.biblio.get(this.elegido));
        this.mapa.mostrarRuta(this.rutaActual.pts);
        this.b3d.mostrarRuta(this.rutaActual.pts);
        this.b3d.marcarDestino(this.biblio.get(this.elegido));
      } else { this.mapa.mostrarRuta(null); this.b3d.ocultarRuta(); this.b3d.marcarDestino(null); }
      this.#actualizarSugerencias(true);
      if (!this.enVR) {
        if (this.verMapa3D) { esc.separarPisos(false); esc.verDesdeArriba(this.piso); c.usarOrbita({ pos: this.piso === 1 ? v.piso1.pos : [0, 38, 12], obj: this.piso === 1 ? v.piso1.obj : [0, 4.5, 0.5], min: 6, max: 90, polarMax: Math.PI * 0.45 }); }
        this.#mostrarMapa(!this.verMapa3D);
      }
    } else if (paso === 'ruta') {
      esc.separarPisos(false); esc.enfocarPiso(null); esc.restaurarVisibilidad();
      const a = this.biblio.get(this.elegido);
      this.rutaActual = this.#rutaHacia(a);
      this.b3d.mostrarRuta(this.rutaActual.pts);
      this.b3d.marcarDestino(a);
      this.indicacion = 0;
      if (!this.enVR) this.#caminar(this.rutaActual.pts, { alLlegar: () => this.#llegarAlAsiento() });
    } else if (paso === 'sentado') {
      esc.separarPisos(false); esc.enfocarPiso(null); esc.restaurarVisibilidad();
      this.b3d.ocultarRuta();
      this.b3d.marcarDestino(null);
      if (!this.enVR) this.#camaraSentado();
      else if (this.elegido) this.app.vr?.sentar(this.biblio.get(this.elegido));
    }
    this.escena.marcar({ tuyo: this.tuyo, elegido: paso === 'asiento' || paso === 'ruta' ? this.elegido : null });
    this.app.hud.refrescarPestana();
    this.app.actualizarPistas();
  }

  // ================================================================ acciones
  entrar() {
    if (this.paso !== 'llegada') return;
    const P = PUNTOS;
    const pts = [
      { x: this.enVR ? P.plaza.x : 3.0, y: 0, z: 21.5 }, { x: 0.5, y: 0, z: 15.5 },
      { x: 0.5, y: 0, z: P.entrada.z }, { x: 0.5, y: 0, z: P.vestibulo.z },
    ];
    const cruce = () => {
      this.b3d.pulsarPuerta('entrada');
      this.biblio.entrar(1, { estudiante: true });
      this.entro = true;
      this.app.hud.aviso(`Sensor de entrada (S1): +1 persona. Personas dentro: ${this.biblio.puertas.dentro}. Los asientos no cambian.`, 'ok', 5000);
    };
    const fin = () => {
      this.pos = { ...P.vestibulo };
      this.nivel = 1;
      const rec = recomendarPiso(this.biblio);
      this.piso = rec.piso || 1;
      this.irA('pisos');
    };
    if (this.enVR) { cruce(); this.app.vr.colocar({ x: P.vestibulo.x, y: 0, z: P.vestibulo.z, rumbo: 0, escala: 1 }); fin(); return; }
    this.#caminar(pts, { velocidad: 2.0, cruces: [{ z: PLANO.z1, hacer: cruce }], alLlegar: fin });
  }

  elegirPiso(n) {
    this.piso = n;
    if (this.paso === 'pisos') { this.escena.enfocarPiso(n); this.app.hud.refrescarPestana(); }
    else if (this.paso === 'mapa' || this.paso === 'asiento') { this.paso = 'mapa'; this.#aplicarPaso(); }
    this.app.vr?.refrescar?.();
  }

  abrirMapa() { if (!this.entro) return; this.irA('mapa'); }

  elegir(id) {
    if (!this.entro) { this.app.hud.aviso('Primero entra a la biblioteca.', 'aviso'); return; }
    if (['ruta', 'sentado'].includes(this.paso) && this.tuyo) return;
    const a = this.biblio.get(id);
    if (!a) return;
    const e = this.biblio.estadoDe(a);
    if (e !== 'libre') {
      this.app.hud.aviso(e === 'ocupado' ? `${id} está ocupado.` : e === 'objeto' ? `${id} está apartado con un objeto: la cámara lo ve ocupado.` : `${id} no tiene dato de la cámara.`, 'aviso');
      return;
    }
    this.elegido = id;
    this.piso = a.piso;
    this.ocupadoPorOtro = false;
    this.irA('asiento');
    this.app.vr?.refrescar?.();
  }

  masCercano() {
    if (!this.entro) return;
    // en el mapa se respeta el piso que se está mirando
    const piso = ['mapa', 'asiento'].includes(this.paso) ? this.piso : null;
    const r = recomendar(this.biblio, this.pos, { preferencias: { ...this.filtros, piso }, k: 1 })[0]
      || recomendar(this.biblio, this.pos, { preferencias: { ...this.filtros }, k: 1 })[0];
    if (!r) { this.app.hud.aviso('No hay asientos libres que cumplan los filtros en este momento.', 'aviso'); return; }
    this.elegir(r.asiento.id);
  }

  ir() { if (this.elegido) this.irA('ruta'); }

  cambiarVistaRuta(v = this.vistaRuta === 'primera' ? 'aerea' : 'primera') {
    this.vistaRuta = v;
    if (v === 'primera') this.escena.restaurarVisibilidad();
    this.app.hud.refrescarPestana();
  }

  pausar() { if (this.caminata) { this.caminata.pausa = !this.caminata.pausa; this.app.hud.refrescarPestana(); } }

  guiar() {
    if (this.paso !== 'ruta') return;
    if (this.manual || !this.caminata) {
      this.manual = false;
      const a = this.biblio.get(this.elegido);
      this.rutaActual = this.#rutaHacia(a);
      this.b3d.mostrarRuta(this.rutaActual.pts);
      this.#caminar(this.rutaActual.pts, { alLlegar: () => this.#llegarAlAsiento() });
    } else this.pausar();
    this.app.hud.refrescarPestana();
  }

  // caminar con W A S D (el recorrido automático se detiene)
  tomarControl() {
    if (this.manual || this.enVR) return;
    const cam = this.control.camara;
    const p = cam.position.clone();
    this.#pararCaminata();
    this.manual = true;
    const rumbo = Math.atan2(-this.#dirCamara().x, -this.#dirCamara().z);
    this.control.usarPaseo({
      pos: [p.x, alturaSuelo(p.x, p.z, this.nivel), p.z], rumbo, ojos: OJOS, velocidad: 1.6, near: 0.05,
      libre: (x, z) => this.escena.transitable(x, z, this.nivel),
      altura: (x, z) => { const y = alturaSuelo(x, z, this.nivel); if (y > 3.4) this.nivel = 2; else if (y < 1.1) this.nivel = 1; return y; },
    });
    this.app.hud.refrescarPestana();
    this.app.actualizarPistas();
  }

  sentarse() {
    const a = this.biblio.get(this.elegido);
    if (!a) return;
    if (this.biblio.estadoDe(a) !== 'libre' && !(a.piloto && this.biblio.pilotoReal)) {
      this.ocupadoPorOtro = true;
      this.app.hud.refrescarPestana();
      return;
    }
    this.libresAntes = this.biblio.libres(a.piso);
    this.dentroAntes = this.biblio.puertas.dentro;
    this.pos = { x: a.x, z: a.z, piso: a.piso };
    this.nivel = a.piso;
    if (a.piloto && this.biblio.pilotoReal) {
      // asiento con sensor real: lo confirma la ESP32-CAM de la maqueta
      this.esperandoCamara = a.id;
    } else {
      this.esperandoCamara = null;
      this.confirmando = true;
      setTimeout(() => {
        this.confirmando = false;
        if (this.paso !== 'sentado' || this.elegido !== a.id) return;
        this.biblio.fijar(a.id, true, { estudiante: true });
        this.tuyo = a.id;
        this.escena.marcar({ tuyo: this.tuyo, elegido: null });
        this.app.hud.aviso(`La cámara de la mesa ${a.mesa} confirmó tu asiento (3 lecturas de 300 ms). Asientos libres del piso ${a.piso}: ${this.libresAntes} → ${this.biblio.libres(a.piso)}.`, 'ok', 6000);
        this.app.hud.refrescarPestana();
        this.app.vr?.refrescar?.();
      }, 900);
    }
    this.irA('sentado');
  }

  liberar() {
    if (!this.tuyo && !this.esperandoCamara) return;
    const id = this.tuyo || this.esperandoCamara;
    const a = this.biblio.get(id);
    if (this.tuyo && !(a.piloto && this.biblio.pilotoReal)) this.biblio.fijar(id, false, { estudiante: true });
    this.tuyo = null;
    this.esperandoCamara = null;
    this.liberado = id;
    this.escena.marcar({ tuyo: null, elegido: null });
    this.app.hud.aviso(`Liberaste ${id}: vuelve a estar libre para todos.`, 'info');
    this.app.hud.refrescarPestana();
  }

  salirBiblioteca() {
    if (this.tuyo || this.esperandoCamara) this.liberar();
    const desde = { ...this.pos };
    const r = calcularRuta(desde, PUNTOS.salidaInterior);
    const pts = [...r.pts, { x: PUNTOS.salidaInterior.x, y: 0, z: 15.5 }, { x: 4.5, y: 0, z: 21 }];
    const cruce = () => {
      this.b3d.pulsarPuerta('salida');
      this.biblio.salir(1, { estudiante: true });
      this.app.hud.aviso(`Sensor de salida (S2): −1 persona. Personas dentro: ${this.biblio.puertas.dentro}.`, 'ok', 5000);
    };
    const fin = () => {
      this.entro = false; this.elegido = null; this.liberado = null;
      this.pos = { ...PUNTOS.plaza };
      this.irA('llegada');
    };
    this.paso = 'saliendo';
    this.b3d.mostrarRuta(r.pts);
    if (this.enVR) { cruce(); this.app.vr.colocar({ ...this.app.escenas.biblioteca.vrInicio(), escala: 1 }); this.b3d.ocultarRuta(); fin(); return; }
    this.#caminar(pts, { velocidad: 1.9, cruces: [{ z: PLANO.z1, hacer: cruce, sale: true }], alLlegar: fin });
    this.app.hud.refrescarPestana();
  }

  volver() {
    const atras = { pisos: 'llegada', mapa: 'pisos', asiento: 'mapa', ruta: 'asiento' };
    if (this.paso === 'pisos' && this.entro) return;   // ya entró: no se vuelve a la calle
    if (atras[this.paso]) this.irA(atras[this.paso]);
  }

  // Botón A del visor y Enter del teclado
  accionPrincipal() {
    switch (this.paso) {
      case 'llegada': return this.entrar();
      case 'pisos': return this.abrirMapa();
      case 'mapa': return this.masCercano();
      case 'asiento': return this.ir();
      case 'ruta': return this.enVR ? this.app.vr?.siguienteTramo?.() : this.guiar();
      case 'sentado': return this.tuyo || this.esperandoCamara ? this.liberar() : this.salirBiblioteca();
      default: return null;
    }
  }
  textoAccion() {
    return {
      llegada: 'Entrar', pisos: `Mapa del piso ${this.piso || 1}`, mapa: 'Asiento más cercano', asiento: 'Ir a este asiento',
      ruta: this.enVR ? 'Siguiente tramo' : (this.caminata?.pausa || this.manual ? 'Guiarme' : 'Pausar'),
      sentado: this.tuyo || this.esperandoCamara ? 'Liberar asiento' : 'Salir', saliendo: 'Saliendo…',
    }[this.paso] || '';
  }

  // ================================================================ rutas y cámara
  #rutaHacia(a) {
    const desde = { x: this.pos.x, z: this.pos.z, piso: this.pos.piso || 1 };
    return calcularRuta(desde, { x: a.x, z: a.z, piso: a.piso }, { asiento: a });
  }

  #dirCamara() { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.control.camara.quaternion); }

  #caminar(pts, { velocidad = 1.45, alLlegar = null, cruces = [] } = {}) {
    const largos = [0];
    for (let i = 1; i < pts.length; i++) largos.push(largos[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z));
    this.caminata = { pts, largos, total: largos[largos.length - 1], d: 0, velocidad, alLlegar, cruces: cruces.map((c) => ({ ...c, hecho: false })), pausa: false, q: null };
    this.control.activo = false;
    this.control.orbita.enabled = false;
    this.control.camara.near = 0.05; this.control.camara.updateProjectionMatrix();
  }

  #pararCaminata() {
    if (!this.caminata) return;
    this.caminata = null;
    this.control.activo = true;
    this.control.orbita.enabled = true;
  }

  #puntoEn(d) {
    const c = this.caminata;
    const dd = Math.max(0, Math.min(c.total, d));
    let i = 1;
    while (i < c.largos.length - 1 && c.largos[i] < dd) i++;
    const a = c.pts[i - 1], b = c.pts[i];
    const seg = c.largos[i] - c.largos[i - 1] || 1;
    const t = (dd - c.largos[i - 1]) / seg;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, i };
  }

  #camaraSentado() {
    const a = this.biblio.get(this.elegido);
    if (!a) return;
    const y = yPiso(a.piso);
    const cam = this.control.camara;
    cam.near = 0.05; cam.updateProjectionMatrix();
    // sentado frente a la mesa: ojos a 1.18 m, mirando hacia el otro lado de la mesa
    this.control.usarOrbita({ pos: [a.x, y + OJOS_SENTADO, a.z - a.mira * 0.15], obj: [a.x, y + 0.95, a.z + a.mira * 1.8], min: 0.05, max: 25, animar: true, dur: 1.2 });
    this.control.orbita.minDistance = 0.01;
  }

  // ================================================================ cambios de los asientos
  #alCambiarAsiento({ a, ahora }) {
    if (!this.activo) return;
    if (a.id === this.elegido && ['asiento', 'ruta'].includes(this.paso) && ahora !== 'libre' && !a.estudiante) {
      this.ocupadoPorOtro = true;
      const alt = recomendar(this.biblio, this.pos, { preferencias: { ...this.filtros }, k: 1 })[0];
      this.alternativa = alt?.asiento.id || null;
      this.app.hud.aviso(`Alguien ocupó ${a.id} antes de que llegaras.${alt ? ` El libre más cercano es ${alt.asiento.id}, a ${Math.round(alt.metros)} m.` : ''}`, 'aviso', 7000);
      this.app.hud.refrescarPestana();
    }
    if (this.esperandoCamara === a.id && ahora === 'ocupado') {
      this.tuyo = a.id; this.esperandoCamara = null;
      this.app.hud.aviso(`La ESP32-CAM de la maqueta confirmó ${a.id} (zona ${a.camara}). Se actualizó para todos.`, 'ok', 6500);
      this.app.hud.refrescarPestana();
    }
    if (this.mapaVisible) this.tMapa = 0;
  }

  // ================================================================ mapa
  #mostrarMapa(v) {
    this.mapaVisible = v;
    $('#mapa').hidden = !v;
    if (v) this.#actualizarBarraMapa();
  }

  #barraMapa() {
    const barra = $('#mapaBarra');
    barra.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const d = b.dataset;
      if (d.piso) this.elegirPiso(Number(d.piso));
      else if (d.filtro) {
        const [k, v] = d.filtro.split(':');
        const val = v === 'true' ? true : Number.isNaN(Number(v)) ? v : Number(v);
        this.filtros[k] = this.filtros[k] === val ? null : val;
        if (k === 'zona' && val === 'silencio' && this.filtros.zona) this.elegirPiso(2);
        this.mapa.fijarFiltros({ ...this.filtros });
        this.#actualizarBarraMapa();
        this.#actualizarSugerencias(true);
        this.app.hud.refrescarPestana();
      } else if (d.accion === 'encuadrar') this.mapa.encuadrar();
      else if (d.accion === 'ver3d') { this.verMapa3D = true; this.#aplicarPaso(); }
    });
  }

  #actualizarBarraMapa() {
    const f = this.filtros;
    const chip = (filtro, texto, activo) => `<button data-filtro="${filtro}" aria-pressed="${!!activo}">${texto}</button>`;
    $('#mapaBarra').innerHTML = `
      <div class="grupo-botones"><button data-piso="1" aria-pressed="${this.piso === 1}">Piso 1 · ${this.biblio.libres(1)} libres</button><button data-piso="2" aria-pressed="${this.piso === 2}">Piso 2 · ${this.biblio.libres(2)} libres</button></div>
      <div class="filtros">${chip('zona:silencio', 'Silencio', f.zona === 'silencio')}${chip('zona:grupo', 'Trabajo en grupo', f.zona === 'grupo')}${chip('ventana:true', 'Ventana', f.ventana)}${chip('enchufe:true', 'Enchufe', f.enchufe)}${chip('grupo:3', 'Para 3 juntos', f.grupo === 3)}</div>
      <div class="leyenda-mapa"><span class="l libre">Libre</span><span class="l ocupado">Ocupado</span><span class="l objeto">Apartado</span><span class="l tuyo">Tu asiento</span><span class="l piloto">Mesa piloto</span></div>
      <div class="grupo-botones"><button data-accion="encuadrar" title="Ver todo el piso">Encuadrar</button><button data-accion="ver3d">Ver en 3D</button></div>`;
  }

  #actualizarSugerencias(forzar = false) {
    if (!this.entro) { this.sugerencias = []; return; }
    if (!forzar && this.tSugerencias > 0) return;
    this.tSugerencias = 1.2;
    this.sugerencias = recomendar(this.biblio, this.pos, { preferencias: { ...this.filtros, piso: this.paso === 'mapa' || this.paso === 'asiento' ? this.piso : null }, k: 5 });
  }

  #seleccionEn3D() {
    const dom = this.app.motor.renderer.domElement;
    let abajo = null;
    dom.addEventListener('pointerdown', (e) => { abajo = { x: e.clientX, y: e.clientY }; });
    dom.addEventListener('pointerup', (e) => {
      if (!this.activo || this.app.modo !== 'estudiante' || !abajo) return;
      const movio = Math.hypot(e.clientX - abajo.x, e.clientY - abajo.y) > 5;
      abajo = null;
      if (movio || !['pisos', 'mapa', 'asiento'].includes(this.paso) || !this.entro) return;
      const r = dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, this.control.camara);
      const id = this.b3d.asientoEn(ray);
      if (id) this.elegir(id);
    });
  }

  // ================================================================ ciclo
  update(dt) {
    if (!this.activo) return;
    this.tSugerencias -= dt;
    // mapa: refresca estados a 3 Hz
    this.tMapa = (this.tMapa ?? 0) - dt;
    if (this.mapaVisible && this.tMapa <= 0) { this.tMapa = 0.33; this.mapa.actualizar(); this.#actualizarBarraMapaLibres(); }
    // caminata automática
    const c = this.caminata;
    if (c && !c.pausa && !this.enVR) {
      c.d = Math.min(c.total, c.d + c.velocidad * dt);
      const p = this.#puntoEn(c.d);
      const ade = this.#puntoEn(c.d + 2.4);
      for (const cr of c.cruces) if (!cr.hecho && (cr.sale ? p.z > cr.z : p.z < cr.z)) { cr.hecho = true; cr.hacer(); }
      const cam = this.control.camara;
      const rumbo = Math.atan2(ade.x - p.x, ade.z - p.z);
      if (this.vistaRuta === 'aerea' && this.paso === 'ruta') {
        const atras = new THREE.Vector3(-Math.sin(rumbo) * 6.5, 8.5, -Math.cos(rumbo) * 6.5);
        const destino = new THREE.Vector3(p.x, p.y, p.z).add(atras);
        cam.position.lerp(destino, Math.min(1, dt * 2.5));
        cam.lookAt(p.x, p.y + 0.9, p.z);
        this.b3d.avatar.visible = true;
        this.b3d.avatar.position.set(p.x, p.y + (p.y > 3.4 ? this.b3d.explosion : 0), p.z);
        this.b3d.avatar.rotation.y = rumbo;
        this.escena.verDesdeArriba(p.y > 3.4 ? 2 : 1);
      } else {
        this.b3d.avatar.visible = false;
        cam.position.set(p.x, p.y + OJOS, p.z);
        const objetivo = new THREE.Vector3(ade.x, ade.y + OJOS - 0.25, ade.z);
        const m = new THREE.Matrix4().lookAt(cam.position, objetivo, new THREE.Vector3(0, 1, 0));
        const q = new THREE.Quaternion().setFromRotationMatrix(m);
        if (!c.q) c.q = q.clone(); else c.q.slerp(q, Math.min(1, dt * 3.5));
        cam.quaternion.copy(c.q);
      }
      this.pos = { x: p.x, z: p.z, piso: p.y > 3.4 ? 2 : 1 };
      this.nivel = this.pos.piso;
      // indicación vigente
      if (this.rutaActual && this.paso === 'ruta') {
        const ind = this.rutaActual.indicaciones;
        let k = 0;
        for (let i = 0; i < ind.length; i++) if (ind[i].en <= c.d + 3) k = i;
        if (k !== this.indicacion) { this.indicacion = k; this.app.hud.refrescarPestana(); }
        this.restante = c.total - c.d;
      }
      if (c.d >= c.total) { const fin = c.alLlegar; this.#pararCaminata(); fin?.(); }
    } else if (this.manual && this.paso === 'ruta') {
      const cam = this.control.camara.position;
      this.pos = { x: cam.x, z: cam.z, piso: this.nivel };
      const a = this.biblio.get(this.elegido);
      if (a && a.piso === this.nivel && Math.hypot(cam.x - a.x, cam.z - a.z) < 1.4 && !this.avisoLlegada) {
        this.avisoLlegada = true;
        this.app.hud.aviso('Llegaste a tu asiento. Pulsa Enter para sentarte.', 'ok');
        this.app.hud.refrescarPestana();
      }
    }
  }

  #actualizarBarraMapaLibres() {
    const b1 = document.querySelector('#mapaBarra [data-piso="1"]'), b2 = document.querySelector('#mapaBarra [data-piso="2"]');
    if (b1) b1.textContent = `Piso 1 · ${this.biblio.libres(1)} libres`;
    if (b2) b2.textContent = `Piso 2 · ${this.biblio.libres(2)} libres`;
  }

  #llegarAlAsiento() {
    this.app.hud.aviso('Llegaste a tu asiento.', 'ok', 2500);
    this.sentarse();
  }

  // ================================================================ panel lateral (HTML)
  proveedor() {
    return {
      pestanas: {
        estudiante: {
          titulo: 'Estudiante',
          html: () => this.#htmlPanel(),
          montar: (r) => this.#montarPanel(r),
          actualizar: (r) => this.#actualizarPanel(r),
        },
      },
    };
  }

  #chips() {
    const b = this.biblio;
    return `<div class="chips">
      <div class="chip-dato"><span>Personas dentro</span><b data-v="dentro">${b.puertas.dentro}</b><small> / ${b.puertas.aforo}</small><em>Sensores de las puertas</em></div>
      <div class="chip-dato"><span>Asientos libres</span><b class="verde" data-v="libres">${b.libres()}</b><small> / 332</small><em>Cámaras por mesa</em></div>
    </div>`;
  }

  #stepper() {
    const k = ETAPA[this.paso] || 1;
    return `<ol class="stepper">${NOMBRES_ETAPA.map((n, i) => `<li class="${i + 1 < k ? 'hecho' : i + 1 === k ? 'actual' : ''}">${n}</li>`).join('')}</ol>`;
  }

  #origen(a) {
    if (a.piloto && this.biblio.pilotoReal) return '<span class="origen real">● Sensor real (maqueta)</span>';
    if (a.piloto) return '<span class="origen piloto">Mesa piloto · simulada</span>';
    return '<span class="origen sim">Simulado (proyección)</span>';
  }

  #htmlPanel() {
    const b = this.biblio;
    const paso = this.paso;
    const tecla = (k) => `<kbd>${k}</kbd>`;
    let cuerpo = '';
    if (paso === 'llegada') {
      cuerpo = `<h2 class="panel-titulo">Bienvenido a la biblioteca</h2>
        <p class="panel-sub">Antes de entrar ya sabes si hay sitio y en qué piso. Hora simulada: <b data-v="hora">${b.hora()}</b>.</p>
        ${this.#chips()}
        <div class="pisos-mini"><div><span>Piso 1 · Sala 1</span><b data-v="l1">${b.libres(1)}</b><small> libres de 96</small></div><div><span>Piso 2 · Sala 2</span><b data-v="l2">${b.libres(2)}</b><small> libres de 236</small></div></div>
        <button class="boton-app" data-a="entrar">Entrar a la biblioteca ${tecla('Enter')}</button>
        <button class="boton-app sec" data-a="visor">Entrar con el visor 3D</button>
        <p class="nota-app">Al cruzar la puerta, el sensor de entrada suma una persona. Los asientos no cambian hasta que alguien se sienta.</p>`;
    } else if (paso === 'pisos') {
      const rec = recomendarPiso(b);
      const card = (n) => {
        const libres = b.libres(n), total = b.total(n), oc = total - libres;
        return `<button class="piso-card ${this.piso === n ? 'on' : ''}" data-piso="${n}">
          <h4>Piso ${n} · Sala ${n} <small data-v="lp${n}">${libres} libres</small></h4>
          <div class="barra"><i style="width:${Math.round(oc / total * 100)}%"></i></div>
          <p>${oc} de ${total} ocupados · ${Math.round(oc / total * 100)} % · ${n === 1 ? 'vestíbulo y mesa piloto' : 'silencio y trabajo en grupo'} ${tecla(n)}</p></button>`;
      };
      cuerpo = `<h2 class="panel-titulo">Elige un piso</h2><p class="panel-sub">Disponibilidad en este momento (${b.hora()}).</p>
        ${card(1)}${card(2)}
        <div class="reco">${escapar(rec.texto)}</div>
        <button class="boton-app" data-a="mapa">Ver el mapa del piso ${this.piso || rec.piso || 1} ${tecla('Enter')}</button>
        <p class="nota-app">También puedes hacer clic en una silla verde directamente en la vista 3D.</p>`;
    } else if (paso === 'mapa') {
      cuerpo = `<h2 class="panel-titulo">Mapa del piso ${this.piso}</h2><p class="panel-sub">Toca un asiento verde o elige una sugerencia.</p>
        ${this.#chips()}
        <p class="panel-sub">Más cercanos a ti</p>
        <ul class="sug" data-v="sug">${this.#htmlSugerencias()}</ul>
        <div class="fila-botones"><button class="boton-app" data-a="cercano">Elegir el más cercano ${tecla('F')}</button></div>
        <div class="fila-botones"><button class="boton-app sec" data-a="${this.verMapa3D ? 'mapa2d' : 'ver3d'}">${this.verMapa3D ? 'Ver el mapa 2D' : 'Ver el piso en 3D'} ${tecla('Tab')}</button></div>`;
    } else if (paso === 'asiento') {
      const a = b.get(this.elegido);
      const r = this.rutaActual;
      const mesa = PLANO.mesas.find((m) => m.id === a.mesa);
      const libresMesa = mesa.asientos.filter((x) => b.estadoDe(b.get(x.id)) === 'libre').length;
      cuerpo = `<div class="ficha"><span class="panel-sub">Asiento elegido</span><h3 class="mono">${a.id}</h3>${this.#origen(a)}
          <dl><dt>Piso</dt><dd>${a.piso} · Sala ${a.piso}</dd><dt>Zona</dt><dd>${NOMBRE_ZONA[a.zona]}${a.ventana ? ' · junto a la ventana' : ''}${a.enchufe ? ' · con enchufe' : ''}</dd>
          <dt>Distancia</dt><dd>${Math.round(r.metros)} m · unos ${Math.max(1, Math.round(r.segundos / 60 * 10) / 10)} min a pie</dd><dt>Mesa</dt><dd>${a.mesa}: ${libresMesa} de 4 libres</dd>${a.piloto ? `<dt>Cámara</dt><dd>Zona ${a.camara} de la ESP32-CAM</dd>` : ''}</dl></div>
        ${this.ocupadoPorOtro ? this.#htmlOcupado() : ''}
        <div class="fila-botones"><button class="boton-app" data-a="ir" ${this.ocupadoPorOtro ? 'disabled' : ''}>Ir a este asiento ${tecla('Enter')}</button><button class="boton-app sec" data-a="volver">Elegir otro ${tecla('Esc')}</button></div>
        <p class="nota-app">Elegir no reserva. Si alguien lo ocupa antes de que llegues, te propongo el libre más cercano.</p>`;
    } else if (paso === 'ruta') {
      const a = b.get(this.elegido);
      const r = this.rutaActual;
      const ind = r ? r.indicaciones : [];
      const estadoCam = this.manual ? 'Caminas tú (W A S D y ratón)' : this.caminata?.pausa ? 'En pausa' : 'Guiándote';
      cuerpo = `<h2 class="panel-titulo">Camino a ${a.id}</h2><p class="panel-sub"><span data-v="restante">${Math.round(this.restante ?? r?.metros ?? 0)}</span> m restantes · ${estadoCam}</p>
        ${this.ocupadoPorOtro ? this.#htmlOcupado() : ''}
        <div class="toggle-vista" role="group" aria-label="Tipo de vista"><button data-vista="primera" aria-pressed="${this.vistaRuta === 'primera'}">Primera persona</button><button data-vista="aerea" aria-pressed="${this.vistaRuta === 'aerea'}">Vista aérea ${tecla('V')}</button></div>
        <ol class="indicaciones">${ind.map((x, i) => `<li class="${i === this.indicacion ? 'actual' : i < this.indicacion ? 'hecha' : ''}">${escapar(x.texto)} <small>${Math.round(x.en)} m</small></li>`).join('')}</ol>
        <div class="fila-botones"><button class="boton-app" data-a="guiar">${this.manual || this.caminata?.pausa ? 'Guiarme' : 'Pausar'} ${tecla('G')}</button><button class="boton-app sec" data-a="llegue">Llegué: sentarme</button></div>
        <p class="nota-app">Con W A S D caminas tú; la ruta sigue marcada en el piso. El asiento elegido brilla en azul.</p>`;
    } else if (paso === 'sentado') {
      const a = b.get(this.elegido);
      const n = a ? a.piso : 1;
      if (this.esperandoCamara) {
        cuerpo = `<h2 class="panel-titulo">Este asiento tiene sensor real</h2><p class="panel-sub">La app no puede ocuparlo por ti: lo decide la cámara.</p>
          <div class="ficha"><span class="origen real">● Mesa piloto en vivo</span><p>Pon una silueta en la silla <b>${a.camara}</b> de la maqueta. La ESP32-CAM lo confirmará en unos 0,9 s y aquí <b>${a.id}</b> pasará a rojo para todos.</p></div>
          <div class="fila-botones"><button class="boton-app sec" data-a="liberar">Cancelar</button><button class="boton-app sec" data-a="salir">Salir de la biblioteca</button></div>`;
      } else if (this.tuyo) {
        cuerpo = `<h2 class="panel-titulo">Te sentaste en ${this.tuyo}</h2><p class="panel-sub">La cámara de la mesa lo confirmó con 3 lecturas de 300 ms.</p>
          <div class="cambio"><span>Asientos libres · Piso ${n}</span><b class="sube">${this.libresAntes} → ${b.libres(n)}</b>
          <span>Personas dentro</span><b class="igual">${b.puertas.dentro} (sin cambio)</b></div>
          <div class="fila-botones"><button class="boton-app sec" data-a="liberar">Liberar asiento ${tecla('L')}</button><button class="boton-app sec" data-a="salir">Salir de la biblioteca</button></div>
          <p class="nota-app">Sentarse cambia los asientos; entrar o salir cambia las personas. Son dos números distintos.</p>`;
      } else if (this.confirmando) {
        cuerpo = `<h2 class="panel-titulo">Sentándote en ${a.id}…</h2><p class="panel-sub">La cámara de la mesa está confirmando (3 lecturas de 300 ms).</p>`;
      } else {
        cuerpo = `<h2 class="panel-titulo">${this.liberado ? `Liberaste ${this.liberado}` : 'Listo'}</h2><p class="panel-sub">El asiento vuelve a estar libre para todos.</p>
          ${this.#chips()}
          <div class="fila-botones"><button class="boton-app" data-a="salir">Salir de la biblioteca ${tecla('Enter')}</button><button class="boton-app sec" data-a="mapa">Buscar otro asiento</button></div>`;
      }
    } else if (paso === 'saliendo') {
      cuerpo = '<h2 class="panel-titulo">Saliendo…</h2><p class="panel-sub">Camino a la puerta de salida: el sensor S2 restará una persona.</p>';
    }
    return `<div class="estudiante">${this.#stepper()}${cuerpo}</div>`;
  }

  #htmlOcupado() {
    return `<div class="reco alerta">Alguien ocupó este asiento antes de que llegaras.${this.alternativa ? ` <button class="boton-app" data-a="alternativa">Ir a ${this.alternativa}</button>` : ''}</div>`;
  }

  #htmlSugerencias() {
    if (!this.sugerencias.length) return '<li class="vacio">No hay asientos libres que cumplan los filtros en este piso.</li>';
    return this.sugerencias.map((s) => `<li><button data-elegir="${s.asiento.id}"><span class="mono">${s.asiento.id}</span><small>${Math.round(s.metros)} m${s.razones.length ? ' · ' + escapar(s.razones.slice(0, 2).join(', ')) : ''}</small></button></li>`).join('');
  }

  #montarPanel(r) {
    r.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return;
      const d = t.dataset;
      if (d.piso) return this.elegirPiso(Number(d.piso));
      if (d.elegir) return this.elegir(d.elegir);
      if (d.vista) return this.cambiarVistaRuta(d.vista);
      switch (d.a) {
        case 'entrar': return this.entrar();
        case 'visor': return this.app.entrarVR();
        case 'mapa': this.verMapa3D = false; return this.abrirMapa();
        case 'cercano': return this.masCercano();
        case 'ver3d': this.verMapa3D = true; return this.#aplicarPaso();
        case 'mapa2d': this.verMapa3D = false; this.escena.restaurarVisibilidad(); return this.#aplicarPaso();
        case 'ir': return this.ir();
        case 'volver': return this.volver();
        case 'guiar': return this.guiar();
        case 'llegue': this.#pararCaminata(); return this.sentarse();
        case 'liberar': return this.liberar();
        case 'salir': return this.salirBiblioteca();
        case 'alternativa': return this.alternativa && this.elegir(this.alternativa);
        default: return null;
      }
    });
  }

  #actualizarPanel(r) {
    const b = this.biblio;
    const set = (k, v) => { const el = r.querySelector(`[data-v="${k}"]`); if (el && el.textContent !== String(v)) el.textContent = v; };
    set('dentro', b.puertas.dentro);
    set('libres', b.libres());
    set('hora', b.hora());
    set('l1', b.libres(1)); set('l2', b.libres(2));
    set('lp1', `${b.libres(1)} libres`); set('lp2', `${b.libres(2)} libres`);
    if (this.restante != null) set('restante', Math.round(this.restante));
    if (this.paso === 'mapa') {
      this.#actualizarSugerencias();
      const ul = r.querySelector('[data-v="sug"]');
      if (ul) { const html = this.#htmlSugerencias(); if (ul.dataset.h !== html) { ul.innerHTML = html; ul.dataset.h = html; } }
    }
  }

  // ================================================================ teclado
  teclas() {
    return {
      Enter: () => this.accionPrincipal(),
      NumpadEnter: () => this.accionPrincipal(),
      Digit1: () => this.entro && this.elegirPiso(1),
      Digit2: () => this.entro && this.elegirPiso(2),
      Numpad1: () => this.entro && this.elegirPiso(1),
      Numpad2: () => this.entro && this.elegirPiso(2),
      KeyF: () => this.masCercano(),
      Tab: () => { if (this.paso === 'mapa' || this.paso === 'asiento') { this.verMapa3D = !this.verMapa3D; if (!this.verMapa3D) this.escena.restaurarVisibilidad(); this.#aplicarPaso(); } },
      KeyV: () => this.paso === 'ruta' && this.cambiarVistaRuta(),
      KeyG: () => this.guiar(),
      Space: () => this.paso === 'ruta' && this.pausar(),
      KeyL: () => this.liberar(),
      Escape: () => this.volver(),
      KeyW: () => this.paso === 'ruta' && this.tomarControl(),
      KeyA: () => this.paso === 'ruta' && this.tomarControl(),
      KeyS: () => this.paso === 'ruta' && this.tomarControl(),
      KeyD: () => this.paso === 'ruta' && this.tomarControl(),
    };
  }

  pistas() {
    const p = this.paso;
    if (p === 'llegada') return [['Enter', 'entrar'], ['Arrastrar', 'mirar la fachada'], ['H', 'ayuda']];
    if (p === 'pisos') return [['1 2', 'elegir piso'], ['Enter', 'ver el mapa'], ['Clic', 'en una silla verde'], ['Arrastrar', 'girar']];
    if (p === 'mapa' || p === 'asiento') return [['Clic', 'elegir asiento'], ['Rueda', 'acercar'], ['F', 'el más cercano'], ['Tab', 'mapa o 3D'], ['Enter', p === 'asiento' ? 'ir' : 'el más cercano'], ['Esc', 'volver']];
    if (p === 'ruta') return [['G', 'guiar o pausar'], ['V', 'primera persona o aérea'], ['W A S D', 'caminar tú'], ['Esc', 'volver']];
    if (p === 'sentado') return [['L', 'liberar'], ['Enter', this.tuyo ? 'liberar' : 'salir'], ['Arrastrar', 'mirar alrededor']];
    return [];
  }

  // ================================================================ visor: tablero con el mapa
  dibujarVR(ctx, w, h) {
    const b = this.biblio;
    ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#e2e8f0'; ctx.font = `800 52px ${FUENTE}`;
    ctx.fillText('BiblioAforo', 40, 72);
    ctx.fillStyle = '#38bdf8'; ctx.font = `700 30px ${FUENTE}`;
    ctx.fillText(`Estudiante · ${b.hora()}`, 360, 70);
    const real = this.app.fuentes.enVivo;
    ctx.textAlign = 'right'; ctx.fillStyle = real ? '#86efac' : '#7dd3fc'; ctx.font = `800 28px ${FUENTE}`;
    ctx.fillText(real ? '● DATOS REALES · MESA PILOTO' : '● SIMULACIÓN', w - 40, 68);
    // columna izquierda: indicadores y paso actual
    ctx.textAlign = 'left';
    const tarjeta = (x, y, ww, hh) => { ctx.fillStyle = '#111a2e'; rectRedondo(ctx, x, y, ww, hh, 22); ctx.fill(); };
    tarjeta(30, 100, 480, 150);
    ctx.fillStyle = '#94a3b8'; ctx.font = `600 26px ${FUENTE}`; ctx.fillText('Personas dentro (puertas)', 54, 140);
    ctx.fillStyle = '#e2e8f0'; ctx.font = `800 64px ${FUENTE}`; ctx.fillText(`${b.puertas.dentro}`, 54, 214);
    ctx.fillStyle = '#94a3b8'; ctx.font = `600 30px ${FUENTE}`; ctx.fillText(`/ ${b.puertas.aforo}`, 54 + ctx.measureText(`${b.puertas.dentro}`).width * 2.2, 214);
    for (const [n, y] of [[1, 270], [2, 400]]) {
      tarjeta(30, y, 480, 110);
      ctx.fillStyle = this.piso === n ? '#38bdf8' : '#94a3b8'; ctx.font = `700 28px ${FUENTE}`; ctx.fillText(`Piso ${n} · Sala ${n}`, 54, y + 42);
      ctx.fillStyle = '#22c55e'; ctx.font = `800 50px ${FUENTE}`; ctx.fillText(`${b.libres(n)}`, 54, y + 94);
      ctx.fillStyle = '#94a3b8'; ctx.font = `600 26px ${FUENTE}`; ctx.fillText(`libres de ${b.total(n)}`, 150, y + 92);
    }
    tarjeta(30, 530, 480, 360);
    ctx.fillStyle = '#38bdf8'; ctx.font = `800 30px ${FUENTE}`;
    ctx.fillText(`Paso: ${NOMBRES_ETAPA[(ETAPA[this.paso] || 1) - 1]}`, 54, 574);
    ctx.fillStyle = '#e2e8f0'; ctx.font = `600 28px ${FUENTE}`;
    const texto = this.#textoVR();
    let y = 620;
    for (const linea of envolver(ctx, texto, 430)) { ctx.fillText(linea, 54, y); y += 38; if (y > 870) break; }
    // mapa del piso
    this.#dibujarMapaVR(ctx, 540, 100, w - 570, 790);
  }

  #textoVR() {
    const b = this.biblio;
    const a = this.elegido && b.get(this.elegido);
    switch (this.paso) {
      case 'llegada': return 'Estás frente a la biblioteca. Botón A: entrar (el sensor de la puerta suma una persona).';
      case 'pisos': return `Elige un piso en el mapa (X cambia de piso). ${recomendarPiso(b).texto} Apunta a una silla verde y aprieta el gatillo.`;
      case 'mapa': return 'Apunta a una silla verde del mapa y aprieta el gatillo. Botón A: el asiento libre más cercano.';
      case 'asiento': return `${a.id} · ${NOMBRE_ZONA[a.zona]} · ${Math.round(this.rutaActual?.metros || 0)} m. Botón A: ir. Sigue las flechas del piso.`;
      case 'ruta': return `${this.rutaActual?.indicaciones[this.indicacion || 0]?.texto || 'Sigue las flechas'}. Botón A: saltar al siguiente tramo, o camina con el stick izquierdo.`;
      case 'sentado': return this.esperandoCamara ? `Pon una silueta en la silla ${a?.camara} de la maqueta: la cámara lo confirmará.` : this.tuyo ? `Estás sentado en ${this.tuyo}. Botón A: liberar el asiento.` : 'Botón A: salir por la puerta de salida.';
      default: return '';
    }
  }

  #dibujarMapaVR(ctx, x0, y0, w, h) {
    const b = this.biblio;
    const piso = this.piso || 1;
    ctx.fillStyle = '#111a2e'; rectRedondo(ctx, x0, y0, w, h, 22); ctx.fill();
    const P = PLANO;
    const esc = Math.min((w - 40) / (P.x1 - P.x0), (h - 40) / (P.z1 - P.z0 + 1.5));
    const ox = x0 + (w - (P.x1 - P.x0) * esc) / 2, oy = y0 + 20;
    const X = (x) => ox + (x - P.x0) * esc, Y = (z) => oy + (z - P.z0) * esc;
    this.mapaVR = { X, Y, esc, piso };
    ctx.fillStyle = '#1b2740'; ctx.fillRect(X(P.x0), Y(P.z0), (P.x1 - P.x0) * esc, (P.z1 - P.z0) * esc);
    const E = P.escalera;
    ctx.fillStyle = '#2b3a57'; ctx.fillRect(X(E.x0), Y(E.z0), (E.x1 - E.x0) * esc, (E.z1 - E.z0) * esc);
    ctx.fillStyle = '#94a3b8'; ctx.font = `600 ${esc * 0.9}px ${FUENTE}`; ctx.textAlign = 'center';
    ctx.fillText('Escalera', X((E.x0 + E.x1) / 2), Y(E.z0) - 6);
    for (const m of P.mesas) if (m.piso === piso) {
      ctx.fillStyle = m.id === P.mesaPiloto.id ? '#a3863c' : '#8a6a4a';
      ctx.fillRect(X(m.x - 1.2), Y(m.z - 0.5), 2.4 * esc, 1.0 * esc);
    }
    if (this.rutaActual && ['asiento', 'ruta'].includes(this.paso)) {
      ctx.strokeStyle = '#5eead4'; ctx.lineWidth = esc * 0.3; ctx.lineJoin = 'round'; ctx.beginPath();
      let primero = true;
      for (const p of this.rutaActual.pts) {
        const enPiso = piso === 1 ? p.y < 2.3 : p.y > 2.2;
        if (!enPiso) { primero = true; continue; }
        if (primero) { ctx.moveTo(X(p.x), Y(p.z)); primero = false; } else ctx.lineTo(X(p.x), Y(p.z));
      }
      ctx.stroke();
    }
    if (this.pos?.piso === piso) {
      ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.arc(X(this.pos.x), Y(this.pos.z), esc * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e2e8f0'; ctx.font = `700 30px ${FUENTE}`;
    ctx.fillText(`Mapa del piso ${piso}`, x0 + 24, y0 + h - 18);
  }

  // registra los botones del tablero del visor (asientos del mapa y acciones)
  botonesVR(panel, W, H) {
    const b = this.biblio;
    const m = this.mapaVR;
    if (m && this.entro) {
      for (const a of PLANO.asientos) {
        if (a.piso !== m.piso) continue;
        const s = b.get(a.id);
        const e = a.id === this.tuyo ? 'tuyo' : b.estadoDe(s);
        const r = Math.max(7, m.esc * 0.42);
        panel.boton(`asiento:${a.id}`, m.X(a.x) - r, m.Y(a.z) - r, r * 2, r * 2, '', () => this.elegir(a.id), {
          deshabilitado: e !== 'libre',
          dibujar: (ctx, bt, hover) => {
            ctx.beginPath(); ctx.arc(bt.x + bt.w / 2, bt.y + bt.h / 2, hover ? r * 1.25 : r * 0.95, 0, Math.PI * 2);
            ctx.fillStyle = { libre: '#22c55e', ocupado: '#ef4444', objeto: '#f59e0b', sinDato: '#64748b', tuyo: '#38bdf8' }[e];
            ctx.fill();
            if (a.id === this.elegido) { ctx.lineWidth = 4; ctx.strokeStyle = '#38bdf8'; ctx.stroke(); }
          },
        });
      }
    }
    return [
      { id: 'piso1', texto: 'Piso 1', fn: () => this.elegirPiso(1), activo: this.piso === 1, deshabilitado: !this.entro },
      { id: 'piso2', texto: 'Piso 2', fn: () => this.elegirPiso(2), activo: this.piso === 2, deshabilitado: !this.entro },
      { id: 'cercano', texto: 'Más cercano', fn: () => this.masCercano(), deshabilitado: !this.entro },
      { id: 'accion', texto: this.textoAccion(), fn: () => this.accionPrincipal(), glifo: 'A' },
      { id: 'liberar', texto: 'Liberar', fn: () => this.liberar(), deshabilitado: !(this.tuyo || this.esperandoCamara) },
      { id: 'salirB', texto: 'Salir de la biblioteca', fn: () => this.salirBiblioteca(), deshabilitado: !this.entro },
    ];
  }
}

function envolver(ctx, texto, ancho) {
  const palabras = String(texto).split(/\s+/);
  const lineas = [];
  let l = '';
  for (const p of palabras) {
    const prueba = l ? `${l} ${p}` : p;
    if (ctx.measureText(prueba).width > ancho && l) { lineas.push(l); l = p; } else l = prueba;
  }
  if (l) lineas.push(l);
  return lineas;
}
