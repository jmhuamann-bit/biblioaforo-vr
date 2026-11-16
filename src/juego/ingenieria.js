// Experiencia INGENIERÍA: el prototipo por dentro. La maqueta con sus dos sensores infrarrojos,
// el ESP32 (contador, LCD y LED) y la ESP32-CAM (asientos A1–A4). Haces clic en una silla para que
// alguien entre y se siente, en un sensor para que alguien cruce, y ves cada lectura en el
// Monitor Serie, igual que en el Arduino IDE. Con sensores reales conectados, manda la maqueta física.
import { panelMaqueta } from '../ui/panelMaqueta.js';
import { escapar } from '../ui/hud.js';
import * as H from './hudJuego.js';

const $ = (s) => document.querySelector(s);

const EXPERIMENTOS = [
  { id: 'entra', texto: 'Haz que alguien cruce S1 (clic en el sensor o I): el LCD suma 1' },
  { id: 'sienta', texto: 'Sienta a alguien en A1–A4 (clic en una silla): la cámara lo confirma en 0,9 s' },
  { id: 'sale', texto: 'Haz que alguien salga por S2 (clic en el sensor o O): el LCD resta 1' },
  { id: 'pareja', texto: 'Dos personas pegadas por S1 (P): el sensor cuenta solo una' },
  { id: 'mochila', texto: 'Deja una mochila (K): la cámara la ve como ocupado' },
  { id: 'lleno', texto: 'Llena la sala (4 dentro): se enciende el LED rojo' },
  { id: 'calibrar', texto: 'Mueve la cámara y recalibra (pestaña Simular)' },
];

export class Ingenieria {
  constructor(app) {
    this.app = app;
    this.id = 'ingenieria';
    this.titulo = 'Ingeniería';
    this.escena = 'maqueta';
    this.panel = true;
    this.lineas = [];
    this.filtro = 'todo';
    this.oyentes = [];
    this.mapaObjetos = null;
  }
  get esc() { return this.app.escenas.maqueta; }
  get est() { return this.app.estado; }
  get son() { return this.app.sonido; }

  proveedor() { return panelMaqueta(this.app); }

  iniciar() {
    const app = this.app;
    this.hechos ||= new Set();
    this.camaraMovida = false;
    app.vistaMaqueta('general', false);
    app.fijarPip(app.pipVisible);
    if (!this.mapaObjetos) this.#indexar();
    H.mostrar({ objetivo: true, monitorSerie: true });
    H.alAccionObjetivo((a) => { if (a === 'recorrido') app.abrirRecorrido(); if (a === 'ocultar') { this.ocultarExp = !this.ocultarExp; this.#pintar(); } });
    this.oyentes = [
      this.est.on('linea', (l) => this.#linea(l)),
      this.est.on('cruce', (e) => { if (e.evento === 'DETECTADO') { this.#hecho(e.sensor === 'S1' ? 'entra' : 'sale'); this.son.sensor(e.sensor === 'S1' ? 'entrada' : 'salida'); } }),
      this.est.on('asientos', () => { if (this.est.camara.asientos.some((a) => a.ocupado)) this.#hecho('sienta'); }),
      this.est.on('contador', () => { if (this.est.contador.led) this.#hecho('lleno'); }),
    ];
    const pre = $('#monitorSerie pre');
    pre.innerHTML = '';
    this.lineas = [...this.est.registro.contador.slice(-60).map((r) => ({ canal: 'contador', linea: r.linea, t: r.t })), ...this.est.registro.camara.slice(-60).map((r) => ({ canal: 'camara', linea: r.linea, t: r.t }))].sort((a, b) => a.t - b.t).slice(-120);
    this.sucio = true;
    $('#monitorSerie header').onclick = (e) => {
      const b = e.target.closest('[data-filtro]'); if (!b) return;
      this.filtro = b.dataset.filtro;
      $('#monitorSerie header').querySelectorAll('[data-filtro]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.filtro === this.filtro)));
      this.sucio = true;
    };
    this.#pintar();
    H.banner('Ingeniería: el prototipo', 'info', 'Haz clic en una silla, en un sensor de la puerta o en la caja. Mira el Monitor Serie abajo.', 5000);
  }

  detener() {
    for (const off of this.oyentes) off();
    this.oyentes = [];
    this.app.cursorInfo(null);
    H.alAccionObjetivo(null);
    H.mostrar({});
  }

  pistas() { return []; }   // la app pone las de la maqueta (dependen de si caminas o no)
  teclas() { return { KeyX: () => { this.ocultarExp = !this.ocultarExp; this.#pintar(); } }; }

  // ---------------------------------------------------------------- objetos de la maqueta bajo el ratón
  #indexar() {
    const maq = this.esc.maq;
    this.mapaObjetos = new Map();
    this.objetivos = [];
    const registrar = (raiz, info) => { raiz.traverse((o) => { if (o.isMesh) { this.mapaObjetos.set(o, info); this.objetivos.push(o); } }); };
    maq.sillas.forEach((s, i) => registrar(s.grupo, { tipo: 'silla', indice: i, id: s.id || `A${i + 1}` }));
    for (const id of Object.keys(maq.sensores)) {
      const s = maq.sensores[id];
      registrar(s.e18.grupo, { tipo: 'sensor', id });
      registrar(s.haz.grupo, { tipo: 'sensor', id });
    }
    const caja = maq.lcd.malla.parent;
    if (caja) registrar(caja, { tipo: 'caja' });
    registrar(maq.camGrupo, { tipo: 'camara' });
  }

  elegir(ray) {
    if (!this.objetivos) return null;
    const hits = ray.intersectObjects(this.objetivos, false);
    for (const h of hits) { const info = this.mapaObjetos.get(h.object); if (info && h.object.visible !== false) return info; }
    return null;
  }

  describir(h) {
    const sim = this.app.fuentes.modo === 'sim';
    const est = this.est;
    if (h.tipo === 'silla') {
      const e = this.esc.estadoAsiento(h.indice);
      const a = est.camara.asientos[h.indice];
      const txt = { libre: 'libre', ocupado: 'ocupado', objeto: 'apartado con una mochila', sinDato: 'sin dato de la cámara' }[e];
      return { titulo: `Asiento A${h.indice + 1} (= 1-01-${'ABCD'[h.indice]}) · ${txt}`, detalle: a?.pct != null ? `La cámara ve un cambio de ${Math.round(a.pct)} % (umbral 20 %)` : 'La ESP32-CAM compara esta zona con la foto de referencia', accion: sim ? (e === 'libre' ? 'Clic · alguien entra y se sienta aquí' : e === 'objeto' ? 'Clic · retirar la mochila' : 'Clic · se levanta y sale por S2') : 'Datos reales: se cambia en la maqueta física' };
    }
    if (h.tipo === 'sensor') {
      const s = est.sensores[h.id];
      return { titulo: `Sensor ${h.id} · ${h.id === 'S1' ? 'entrada (suma)' : 'salida (resta)'}`, detalle: `E18-D80NK infrarrojo · ${s?.bloqueado ? 'haz CORTADO ahora' : 'haz libre'} · el ESP32 imprime una línea por cada cambio`, accion: sim ? `Clic · que alguien ${h.id === 'S1' ? 'entre' : 'salga'}` : '' };
    }
    if (h.tipo === 'caja') {
      const c = est.contador;
      return { titulo: 'Caja de control · ESP32 DevKit + LCD 16×2 + LED', detalle: c.conocido ? `Dentro ${c.dentro}/${est.capacidad} · entradas ${c.entradas} · salidas ${c.salidas} · LED ${c.led ? 'encendido (lleno)' : 'apagado'}` : 'Esperando la primera lectura', accion: 'Clic · ver la caja de cerca' };
    }
    if (h.tipo === 'camara') return { titulo: 'ESP32-CAM en su poste de 27 cm', detalle: `Imagen de 320×240 en gris cada 300 ms · ${est.camara.calibrada ? 'calibrada' : 'sin calibrar'}`, accion: 'Clic · ver lo que ve la cámara' };
    return null;
  }

  alClic(h) {
    if (!h) return;
    const app = this.app;
    const sim = app.fuentes.modo === 'sim';
    if (h.tipo === 'silla') {
      if (!sim) { app.hud.aviso('Con datos reales, la silla se cambia en la maqueta física (sienta una silueta).', 'info', 4500); return; }
      const r = this.esc.director.alternarSilla(h.indice);
      this.son.clic();
      if (r === 'entra') H.banner(`Alguien va al asiento A${h.indice + 1}`, 'info', 'Mira: cruza S1 (el LCD suma) y al sentarse la cámara lo confirma en 3 lecturas.', 3600);
      else if (r === 'sale') H.banner(`Se levanta del asiento A${h.indice + 1}`, 'info', 'Al salir corta el haz de S2 y el LCD resta.', 3200);
      else if (r === 'mochila') H.banner('Mochila retirada', 'ok', `El asiento A${h.indice + 1} vuelve a verse libre.`, 2600);
    } else if (h.tipo === 'sensor') {
      if (!sim) { app.hud.aviso('Con datos reales, cruza la puerta de la maqueta con una silueta.', 'info', 4000); return; }
      app.accion(h.id === 'S1' ? 'entra' : 'sale');
      this.son.clic();
    } else if (h.tipo === 'caja') app.vistaMaqueta('caja');
    else if (h.tipo === 'camara') { app.fijarPip(true); app.vistaMaqueta('camara'); }
  }

  alAccionMaqueta(a) {
    if (a === 'pareja') this.#hecho('pareja');
    else if (a === 'mochila') this.#hecho('mochila');
    else if (a === 'moverCam') this.camaraMovida = true;
    else if (a === 'calibrar' && this.camaraMovida) this.#hecho('calibrar');
  }

  #hecho(id) {
    if (this.hechos.has(id)) return;
    this.hechos.add(id);
    const ex = EXPERIMENTOS.find((x) => x.id === id);
    this.son.exito();
    H.banner('Experimento logrado', 'ok', ex.texto + (this.hechos.size === EXPERIMENTOS.length ? ' · ¡Probaste todo el prototipo!' : ''), 3200);
    this.#pintar();
  }

  #pintar() {
    const fuente = this.app.fuentes.modo;
    const real = fuente === 'usb' || fuente === 'remoto';
    const items = EXPERIMENTOS.map((x) => `<li class="${this.hechos.has(x.id) ? 'ok' : ''}">${x.texto}</li>`).join('');
    H.objetivo(`<h2>Experimentos <small>${this.hechos.size} de ${EXPERIMENTOS.length}</small></h2>
      ${this.ocultarExp ? '' : `<p>${real ? '<b>Datos reales:</b> mueve las siluetas en la maqueta física y mira cómo responde todo.' : 'Provoca cada lectura del prototipo. Todo lo que imprimen el ESP32 y la ESP32-CAM aparece en el Monitor Serie.'}</p><ul class="condiciones">${items}</ul>`}
      <div class="fila"><button data-a="recorrido">Recorrido guiado (G)</button><button data-a="ocultar">${this.ocultarExp ? 'Mostrar' : 'Ocultar'} lista (X)</button></div>`);
  }

  // ---------------------------------------------------------------- Monitor Serie
  #linea({ canal, linea, t }) {
    this.lineas.push({ canal, linea: String(linea).replace(/\r/g, ''), t });
    if (this.lineas.length > 240) this.lineas.splice(0, 60);
    this.sucio = true;
  }

  #dibujarMonitor() {
    const pre = $('#monitorSerie pre');
    const f = this.filtro;
    const l = this.lineas.filter((x) => f === 'todo' || x.canal === f).slice(-140);
    const hora = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`; };
    const abajo = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 30;
    pre.innerHTML = l.length
      ? l.map((x) => `<span class="${x.canal === 'camara' ? 'cam' : ''}"><span class="info">${hora(x.t)} → </span>${escapar(x.linea)}</span>`).join('\n')
      : '<span class="info">Esperando líneas… (con «Simulación» el prototipo virtual imprime lo mismo que el real)</span>';
    if (abajo) pre.scrollTop = pre.scrollHeight;
  }

  update(dt) {
    this.tMon = (this.tMon || 0) - dt;
    if (this.sucio && this.tMon <= 0) { this.tMon = 0.2; this.sucio = false; this.#dibujarMonitor(); }
    const rec = this.app.recorrido?.abierto;
    if (rec !== this.recAbierto) { this.recAbierto = rec; H.mostrar({ objetivo: !rec, monitorSerie: !rec }); }
  }

  // ---------------------------------------------------------------- visor (usa la maqueta del visor)
  lineasVR() {
    const c = this.est.contador;
    return ['INGENIERÍA · el prototipo', `Dentro ${c.conocido ? c.dentro : '–'}/${this.est.capacidad} · experimentos ${this.hechos?.size || 0}/${EXPERIMENTOS.length}`];
  }
}
