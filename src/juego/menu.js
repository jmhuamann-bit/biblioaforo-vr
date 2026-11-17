// Menú de experiencias: la biblioteca viva gira de fondo (casa de muñecas con los dos pisos)
// mientras se elige cómo vivirla.
import { NOMBRE_ENTORNO } from '../biblioteca/agentes.js';

const $ = (s) => document.querySelector(s);

export const EXPERIENCIAS = [
  { id: 'horaPunta', icono: '⏱️', nombre: 'Hora punta', tecla: '1', destacada: true, etiqueta: 'Empieza aquí',
    texto: 'Son las 13:55 y la biblioteca se llena. Entra, elige un asiento y llega antes que los demás.',
    puntos: ['Primera persona en los dos pisos', 'Rivales que van a tu asiento', 'Rutas que cambian solas'] },
  { id: 'caos', icono: '🌪️', nombre: 'Caos', tecla: '2',
    texto: 'Tú mandas: llegadas masivas, mochilas que apartan sitios, cámaras caídas, evacuación.',
    puntos: ['Clic sobre asientos, mesas y puertas', 'Fila afuera cuando se llena el aforo', '5 retos para llevarla al límite'] },
  { id: 'detective', icono: '🔎', nombre: 'Detective', tecla: '3',
    texto: 'Cada estudiante necesita algo distinto. Encuentra el asiento perfecto para cada uno.',
    puntos: ['Silencio, enchufe, ventana, grupo', 'Inspecciona y compara candidatos', 'Estrellas por misión'] },
  { id: 'ingenieria', icono: '🛠️', nombre: 'Ingeniería', tecla: '4',
    texto: 'Entra al prototipo: sensores infrarrojos, ESP32 y ESP32-CAM. Provoca cada lectura.',
    puntos: ['Cruza las puertas y sienta siluetas', 'Monitor Serie en vivo', 'Luz, cámara movida y calibración'] },
  { id: 'libre', icono: '🧭', nombre: 'Libre', tecla: '5',
    texto: 'Recorre la biblioteca a tu ritmo y descubre cómo funciona cada pieza del sistema.',
    puntos: ['10 puntos de interés', 'Vista aérea cuando quieras', 'Sin reloj ni prisa'] },
];

export class Menu {
  constructor(app) {
    this.app = app;
    this.id = 'menu';
    this.titulo = 'Experiencias';
    this.escena = 'biblioteca';
    this.panel = false;
    this.el = $('#menu');
    this.ang = 0.6;
  }

  iniciar() {
    const app = this.app;
    if (!app.mundoListo) { app.reiniciarMundo('punta14', { velocidad: 3, fallas: false }); app.precalentar(14); }
    app.multitud.factorVel = 0.75;
    const esc = app.escenas.biblioteca;
    esc.restaurarVisibilidad(); esc.enfocarPiso(null); esc.separarPisos(true);
    esc.b3d.ocultarRuta(); esc.b3d.marcarDestino(null); esc.b3d.avatar.visible = false;
    esc.marcar({ tuyo: null, elegido: null });
    app.control.usarOrbita({ pos: this.#pos(), obj: [0, 4.5, 0], min: 10, max: 160, animar: false });
    app.control.orbita.enabled = false;
    this.el.innerHTML = this.#html();
    this.el.hidden = false;
    this.el.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => app.irModo(b.dataset.modo)));
    this.tVivo = 0;
  }

  detener() {
    this.el.hidden = true;
    this.app.control.orbita.enabled = true;
    this.app.multitud.factorVel = 1;
  }

  #pos() {
    const r = 50;
    return [Math.sin(this.ang) * r, 30, Math.cos(this.ang) * r * 0.9 + 2];
  }

  #html() {
    return `<div class="menu-caja">
      <div class="menu-cabeza">
        <p class="sobre">Simulación interactiva · teclado, ratón o visor 3D</p>
        <h1>BiblioAforo <span>VR</span></h1>
        <p class="lema">Una biblioteca viva: los estudiantes llegan, cruzan los sensores de la puerta, buscan asiento, se sientan y se van. Cada cosa que haces cambia lo que mide el sistema. Elige cómo vivirla.</p>
        <div class="menu-vivo" data-v="vivo"></div>
      </div>
      <div class="tarjetas-modo">
        ${EXPERIENCIAS.map((x) => `
          <button class="tarjeta-modo${x.destacada ? ' destacada' : ''}" data-modo="${x.id}">
            ${x.etiqueta ? `<span class="etiqueta-modo">${x.etiqueta}</span>` : ''}
            <span class="icono-modo" aria-hidden="true">${x.icono}</span>
            <h2>${x.nombre} <kbd>${x.tecla}</kbd></h2>
            <p>${x.texto}</p>
            <ul>${x.puntos.map((p) => `<li>${p}</li>`).join('')}</ul>
            <span class="jugar">Jugar ▸</span>
          </button>`).join('')}
      </div>
      <button class="tarjeta-extra" data-modo="presentacion">
        <span class="icono-modo" aria-hidden="true">🎤</span>
        <span class="texto-extra">
          <span class="etiqueta-extra">Sección extra</span>
          <b>Simulación para presentación <kbd>6</kbd></b>
          <small>Los dos pisos llenos: solo la mesa piloto tiene 2 sillas libres. Con el Meta Quest 3 caminas hacia el sensor S1 real; cuando te detecta, en el simulador también entras. Luego vas a la mesa y te sientas.</small>
        </span>
        <span class="jugar">Abrir ▸</span>
      </button>
      <p class="menu-pie">Con un visor Meta Quest 3, pulsa <b>Entrar al visor 3D</b> en la barra de arriba. Los datos son simulados salvo la mesa piloto 1-01, que puede mostrar los sensores reales de la maqueta («Datos reales»). Ayuda: <kbd>H</kbd></p>
    </div>`;
  }

  pistas() { return [['1 … 5', 'elegir experiencia'], ['6', 'presentación'], ['Enter', 'hora punta'], ['H', 'ayuda'], ['M', 'simulación o datos reales']]; }

  teclas() {
    const t = { Enter: () => this.app.irModo('horaPunta') };
    EXPERIENCIAS.forEach((x, i) => { t[`Digit${i + 1}`] = () => this.app.irModo(x.id); t[`Numpad${i + 1}`] = () => this.app.irModo(x.id); });
    t.Digit6 = () => this.app.irModo('presentacion');
    t.Numpad6 = t.Digit6;
    return t;
  }

  alEntrarVR() { this.app.escenas.biblioteca.separarPisos(false); }
  alSalirVR() { this.app.escenas.biblioteca.separarPisos(true); this.app.control.usarOrbita({ pos: this.#pos(), obj: [0, 4.5, 0], min: 10, max: 160, animar: false }); this.app.control.orbita.enabled = false; }

  update(dt) {
    this.ang += dt * 0.045;
    if (!this.app.vr?.presentando) this.app.control.irA(this.#pos(), [0, 4.5, 0], 0);
    this.tVivo -= dt;
    if (this.tVivo <= 0) {
      this.tVivo = 0.5;
      const b = this.app.biblio, m = this.app.multitud;
      const real = this.app.fuentes.enVivo;
      const el = this.el.querySelector('[data-v="vivo"]');
      if (el) el.innerHTML = `<span><i class="punto-vivo"></i>Ahora en la simulación</span><span>Hora <b>${b.hora()}</b></span><span>Personas dentro <b>${b.puertas.dentro}</b> / ${b.puertas.aforo}</span><span>Asientos libres <b>${b.libres()}</b> de ${b.total()}</span><span>Caminando <b>${m.resumen().caminando}</b></span><span>${NOMBRE_ENTORNO[m.estadoEntorno]}</span>${real ? '<span style="color:#86efac">● Mesa piloto con datos reales</span>' : ''}`;
    }
  }

  // visor: elegir con el tablero
  lineasVR() { return ['BIBLIOAFORO VR', 'Elige una experiencia en el tablero']; }
  botonesVR() { return EXPERIENCIAS.filter((x) => x.id !== 'caos').map((x) => ({ id: 'm-' + x.id, texto: x.nombre, fn: () => this.app.irModo(x.id) })).concat([{ id: 'm-caos', texto: 'Caos', fn: () => this.app.irModo('caos') }, { id: 'm-presentacion', texto: 'Presentación', fn: () => this.app.irModo('presentacion') }]); }
  textoA() { return 'Hora punta'; }
  accionA() { this.app.irModo('horaPunta'); }
}
