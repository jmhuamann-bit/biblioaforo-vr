// BiblioAforo VR · aplicación principal
// Tres modos: Estudiante (principal), Administración y Cómo funciona (la maqueta).
import { Motor } from './motor/motor.js';
import { EstadoMaqueta } from './datos/estado.js';
import { Fuentes } from './datos/fuentes.js';
import { EscenaMaqueta } from './escenas/escenaMaqueta.js';
import { EscenaBiblioteca } from './escenas/escenaBiblioteca.js';
import { ControlEscritorio } from './control/escritorio.js';
import { HUD, escapar } from './ui/hud.js';
import { panelMaqueta } from './ui/panelMaqueta.js';
import { panelAdmin } from './ui/admin.js';
import { Estudiante } from './ui/estudiante.js';
import { EstadoBiblioteca } from './biblioteca/estado.js';
import { SimuladorBiblioteca } from './biblioteca/simulador.js';
import { enlazarPiloto } from './biblioteca/piloto.js';
import { MAQUETA as M } from './config.js';

const $ = (s) => document.querySelector(s);

class App {
  constructor() {
    this.motor = new Motor($('#vista3d'));
    this.estado = new EstadoMaqueta();
    this.hud = new HUD();
    this.biblio = new EstadoBiblioteca();
    this.simBiblio = new SimuladorBiblioteca(this.biblio);
    this.simBiblio.iniciarDia('punta14');
    this.escenas = {};
    this.escenas.maqueta = new EscenaMaqueta({
      motor: this.motor, estado: this.estado,
      alLinea: (canal, linea) => this.fuentes?.lineaSimulada(canal, linea),
      fuente: () => this.fuentes?.modo || 'espera',
    });
    this.fuentes = new Fuentes({ estado: this.estado, director: this.escenas.maqueta.director });
    enlazarPiloto({ estadoMaqueta: this.estado, estadoBiblio: this.biblio, fuentes: this.fuentes });
    this.escenas.biblioteca = new EscenaBiblioteca({ motor: this.motor, app: this });
    this.control = new ControlEscritorio(this.motor, this.motor.renderer.domElement);
    this.control.alCambiarModo = () => this.actualizarPistas();
    this.estudiante = new Estudiante(this);
    this.modo = null;
    this.escenaActual = null;
    this.pipVisible = false;
    this.caminando = false;
    this.escalaHumana = false;
    this.vr = null;
    this.recorrido = null;
    this.xr = { vr: false, ar: false };

    this.#conectarUI();
    this.#conectarTeclado();
    this.hud.alPlegar = (plegado) => { document.body.classList.toggle('panel-plegado', !!plegado); this.#ajustarEncuadre(); };
    window.addEventListener('resize', () => this.#ajustarEncuadre());
    this.motor.alPerderContexto = () => this.hud.aviso('La tarjeta de video se reinició. La vista vuelve sola; si no, recarga la página (F5).', 'aviso', 8000);
    this.motor.alRecuperarContexto = () => this.hud.aviso('Vista 3D recuperada.', 'ok');
    this.escenas.maqueta.camara.alDibujar = (lienzo) => this.hud.dibujarPip(lienzo);
    this.fuentes.on('modo', () => { this.#actualizarFuente(); if (this.modo === 'tecnico' && this.hud.pestana === 'simular') this.hud.refrescarPestana(); this.actualizarPistas(); });
    this.fuentes.on('cambio', () => this.#actualizarFuente());
    this.fuentes.on('aviso', (a) => this.hud.aviso(a.texto, a.tipo));
    this.estado.on('cambio', () => { this.cambioDispositivos = true; });

    let tDisp = 0;
    this.motor.tareas.add((dt, t, frame) => {
      this.control.update(dt);
      this.fuentes.update(dt);
      this.hud.update(dt);
      this.vr?.update(dt, frame);
      tDisp -= dt;
      if (tDisp <= 0 || this.cambioDispositivos) { tDisp = 1; this.cambioDispositivos = false; this.#actualizarDispositivos(); }
    });

    this.#comprobarXR();
    this.#ruta(true);
    window.addEventListener('hashchange', () => this.#ruta(false));
    import('./control/vr.js').then((m) => { this.vr = new m.ControlVR(this); this.#comprobarXR(); }).catch((e) => console.warn('Visor no disponible:', e));
    requestAnimationFrame(() => setTimeout(() => { $('#cargando').classList.add('fuera'); setTimeout(() => $('#cargando').remove(), 600); }, 250));
  }

  // ---------------------------------------------------------------- rutas: #/estudiante, #/admin, #/tecnico, #/tecnico/recorrido, #/visor, #/sala/1234
  async #ruta(inicial) {
    const [a, b] = location.hash.replace(/^#\/?/, '').split('/');
    if (inicial) {
      if (a === 'sala' && b) {
        try { await this.fuentes.recibir(b); this.hud.aviso(`Recibiendo la sala ${b} en vivo.`, 'ok'); } catch { this.hud.aviso('Código de sala no válido.', 'error'); }
      }
      if (!this.fuentes.recibiendo) await this.fuentes.iniciar();
    }
    if (a === 'admin') this.irModo('admin');
    else if (a === 'tecnico') { this.irModo('tecnico'); if (b === 'recorrido') this.abrirRecorrido(); }
    else this.irModo('estudiante');
    if (a === 'visor') { $('#btnVR').classList.add('primario'); this.hud.aviso('Pulsa "Entrar al visor 3D" con el visor puesto.', 'info', 6000); }
  }

  // ---------------------------------------------------------------- modos
  irModo(modo) {
    if (modo === this.modo) return;
    const anterior = this.modo;
    this.modo = modo;
    for (const b of document.querySelectorAll('[data-modo]')) b.classList.toggle('activo', b.dataset.modo === modo);
    if (anterior === 'estudiante') this.estudiante.detener();
    if (anterior === 'tecnico') { this.recorrido?.cerrar(); this.hud.mostrarPip(false); }
    this.caminando = false;
    this.escalaHumana = false;
    if (modo === 'tecnico') {
      this.escenaActual = 'maqueta';
      this.motor.usarEscena(this.escenas.maqueta);
      this.hud.usarProveedor(panelMaqueta(this));
      this.vistaMaqueta('general', !!anterior);
      this.fijarPip(this.pipVisible);
    } else {
      this.escenaActual = 'biblioteca';
      this.motor.usarEscena(this.escenas.biblioteca);
      if (modo === 'estudiante') {
        this.hud.usarProveedor(this.estudiante.proveedor());
        this.estudiante.iniciar();
      } else {
        this.hud.usarProveedor(panelAdmin(this));
        const esc = this.escenas.biblioteca;
        esc.restaurarVisibilidad(); esc.enfocarPiso(null); esc.separarPisos(true);
        esc.b3d.ocultarRuta(); esc.b3d.marcarDestino(null); esc.b3d.avatar.visible = false;
        this.control.usarOrbita({ pos: esc.vistas().casa.pos, obj: [0, 6, -1], min: 8, max: 140, polarMax: Math.PI * 0.47 });
      }
    }
    $('#btnMR').hidden = !(this.xr.ar && modo === 'tecnico');
    this.#ajustarEncuadre();
    this.actualizarPistas();
    this.vr?.alCambiarEscena(this.escenaActual);
    const nuevo = `#/${modo}`;
    if (!location.hash.startsWith('#/sala') && !location.hash.startsWith(nuevo)) history.replaceState(null, '', nuevo);
  }

  // compatibilidad con el visor y el recorrido (que piden escenas por nombre)
  usarEscena(id) { this.irModo(id === 'maqueta' ? 'tecnico' : this.modo === 'admin' ? 'admin' : 'estudiante'); }

  // ---------------------------------------------------------------- vista técnica (maqueta)
  vistaMaqueta(nombre, animar = true) {
    const vs = this.escenas.maqueta.vistas();
    this.escalaHumana = false;
    this.caminando = false;
    const v = vs[nombre] || vs.general;
    this.control.usarOrbita({ pos: v.pos, obj: v.obj, min: 0.06, max: 9, animar, polarMax: Math.PI * 0.495 });
    this.actualizarPistas();
  }

  alternarCaminar() {
    if (this.modo !== 'tecnico') return;
    if (this.caminando || this.escalaHumana) { this.vistaMaqueta('general'); return; }
    const esc = this.escenas.maqueta;
    this.caminando = true;
    this.control.usarPaseo({ pos: [0.2, 0, 1.6], rumbo: 0.1, ojos: 1.6, velocidad: 1.3, libre: (x, z) => esc.libreSala(x, z), near: 0.03 });
    this.hud.aviso('Modo caminar: W A S D para moverte; haz clic para mirar con el ratón (Esc lo suelta).', 'info', 5000);
    this.actualizarPistas();
  }

  alternarEscalaHumana() {
    if (this.modo !== 'tecnico') return;
    if (this.vr?.presentando) { this.vr.alternarEscala(); return; }
    if (this.escalaHumana) { this.vistaMaqueta('general'); return; }
    const esc = this.escenas.maqueta;
    const p = esc.inicioHumano();
    const k = M.escalaHumana;
    this.escalaHumana = true; this.caminando = false;
    this.control.usarPaseo({ pos: [p.x, p.y, p.z], rumbo: 0, ojos: 1.6 / k, velocidad: 1.2 / k, libre: (x, z) => esc.libreHumano(x, z), near: 0.0015 });
    this.hud.aviso('Estás dentro de la maqueta a escala 1:17 (mides lo mismo que una silueta). W A S D para caminar.', 'info', 5500);
    this.actualizarPistas();
  }

  fijarPip(v) {
    this.pipVisible = v;
    this.hud.mostrarPip(v && this.modo === 'tecnico');
  }

  accion(a) {
    const esc = this.escenas.maqueta;
    const d = esc.director;
    if (this.fuentes.modo !== 'sim' && ['entra', 'sale', 'pareja', 'mochila'].includes(a)) {
      this.hud.aviso('Estas pruebas funcionan con "Simulación" activada.', 'aviso');
      return;
    }
    switch (a) {
      case 'entra': d.entraPersona({ visitaCorta: false }); break;
      case 'sale': d.salePersona(); break;
      case 'pareja': d.parejaPegada(); this.hud.aviso('Dos siluetas cruzan pegadas: el haz no se libera entre ellas y el contador suma solo una.', 'info', 6000); break;
      case 'mochila': if (!d.dejarMochila()) this.hud.aviso('Primero tiene que haber alguien sentado.', 'aviso'); else this.hud.aviso('Una persona se va y deja su mochila: la cámara sigue viendo el asiento ocupado.', 'info', 6000); break;
      case 'luz': { const baja = esc.cambiarLuz(); this.hud.aviso(baja ? 'Luz más baja: el programa resta el cambio medio de brillo y los asientos no cambian.' : 'Luz normal.', 'info', 5500); break; }
      case 'moverCam': { const movida = esc.moverCamara(); this.hud.aviso(movida ? 'Se movió la cámara: la referencia ya no coincide (falsos ocupados). Recalibra con los asientos vacíos.' : 'Cámara de vuelta en su lugar.', movida ? 'aviso' : 'info', 6500); break; }
      case 'calibrar': {
        esc.camara.calibrar();
        if (this.fuentes.modo === 'sim' && esc.sil.agentes.some((x) => x.silla)) this.hud.aviso('Ojo: se calibró con asientos ocupados; esos asientos ahora parecen libres (igual que en la cámara real).', 'aviso', 6500);
        else this.hud.aviso('Cámara recalibrada con la imagen actual como referencia.', 'ok');
        break;
      }
      default: break;
    }
  }

  alternarSimulacion(forzar = null) {
    const activar = forzar ?? this.fuentes.modo !== 'sim';
    this.fuentes.simular(activar);
    if (!activar && !this.fuentes.enVivo) { this.dialogoConectar(); return; }
    this.hud.aviso(activar ? 'Simulación: la mesa piloto y toda la biblioteca son simuladas.' : 'Datos reales: la mesa piloto muestra la maqueta; el resto de la biblioteca sigue simulado.', 'info', 5000);
  }

  // ---------------------------------------------------------------- barra superior
  #actualizarFuente() {
    const m = this.fuentes.modo;
    const p = $('#insignia');
    p.className = `pill ${m === 'sim' ? 'sim' : m === 'espera' ? 'espera' : 'vivo'}`;
    p.querySelector('span').textContent = {
      sim: 'Simulación',
      usb: 'Datos reales · mesa piloto',
      remoto: `Datos reales · sala ${this.fuentes.recibiendo || ''}${this.fuentes.remotoConectado ? '' : ' (conectando…)'}`,
      espera: this.fuentes.puertos.length ? 'Sensores en pausa' : 'Esperando sensores',
    }[m];
    p.title = m === 'sim' ? 'Todo lo que se ve es simulado' : 'La mesa piloto viene de la maqueta; el resto de la biblioteca es simulado';
    for (const b of document.querySelectorAll('[data-fuente]')) b.setAttribute('aria-pressed', String(b.dataset.fuente === (m === 'sim' ? 'sim' : 'real')));
    this.#actualizarDispositivos();
  }

  #actualizarDispositivos() {
    const [c, k] = document.querySelectorAll('#dispositivos i');
    const vivo = this.fuentes.enVivo;
    const ahora = Date.now();
    const est = (conocido, ultima) => (!vivo ? '' : conocido && ahora - ultima < 10 * 60 * 1000 ? 'on' : 'espera');
    c.className = est(this.estado.contador.conocido, this.estado.contador.ultima);
    k.className = est(this.estado.camara.conocida, this.estado.camara.ultima);
    $('#dispositivos').title = vivo ? `ESP32: ${this.estado.contador.conocido ? 'datos recibidos' : 'esperando'} · ESP32-CAM: ${this.estado.camara.conocida ? 'datos recibidos' : 'esperando'}` : 'Sin sensores conectados (clic para conectar)';
  }

  actualizarPistas() {
    let l = [];
    if (this.modo === 'estudiante') l = this.estudiante.pistas();
    else if (this.modo === 'admin') l = [['Arrastrar', 'girar'], ['Rueda', 'acercar'], ['M', 'simulación'], ['U', 'conectar sensores'], ['H', 'ayuda']];
    else if (this.escalaHumana) l = [['W A S D', 'caminar'], ['Clic', 'mirar con el ratón'], ['Shift', 'correr'], ['E', 'salir de la maqueta']];
    else if (this.caminando) l = [['W A S D', 'caminar'], ['Clic', 'mirar con el ratón'], ['V', 'vista órbita'], ['E', 'entrar a la maqueta']];
    else {
      l = [['Arrastrar', 'girar'], ['Rueda', 'acercar'], ['V', 'caminar'], ['E', 'entrar a la maqueta'], ['C', 'cámara ESP32'], ['G', 'recorrido']];
      if (this.fuentes?.modo === 'sim') l.push(['I', 'entra'], ['O', 'sale']);
    }
    if (this.modo !== 'admin') l.push(['H', 'ayuda']);
    this.hud.pistas(l);
  }

  #ajustarEncuadre() {
    const ancho = window.innerWidth;
    const panel = this.hud.panelVisible ? (this.hud.panel.classList.contains('ancho') ? Math.min(560, ancho - 24) + 12 : 380) : 0;
    this.motor.fijarDesplazamiento(ancho > 860 ? panel : 0);
  }

  #conectarUI() {
    for (const b of document.querySelectorAll('[data-modo]')) b.addEventListener('click', () => this.irModo(b.dataset.modo));
    for (const b of document.querySelectorAll('[data-fuente]')) b.addEventListener('click', () => {
      const quiereSim = b.dataset.fuente === 'sim';
      if (quiereSim !== (this.fuentes.modo === 'sim')) this.alternarSimulacion(quiereSim);
      else if (!quiereSim && !this.fuentes.enVivo) this.dialogoConectar();
    });
    $('#dispositivos').addEventListener('click', () => this.dialogoConectar());
    $('#btnAyuda').addEventListener('click', () => this.dialogoAyuda());
    $('#btnVR').addEventListener('click', () => this.entrarVR());
    $('#btnMR').addEventListener('click', () => this.entrarVR('ar'));
    this.hud.alCerrarPip = () => { this.fijarPip(false); if (this.hud.pestana === 'vista') this.hud.refrescarPestana(); };
  }

  #conectarTeclado() {
    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (this.hud.dialogoAbierto) { if (e.code === 'Escape') this.hud.cerrarDialogo(); return; }
      if (this.recorrido?.abierto && this.recorrido.tecla(e.code)) { e.preventDefault(); return; }
      const acciones = {
        KeyH: () => this.dialogoAyuda(),
        F1: () => this.dialogoAyuda(),
        KeyM: () => this.alternarSimulacion(),
        KeyU: () => this.dialogoConectar(),
      };
      if (this.modo === 'tecnico') Object.assign(acciones, {
        KeyV: () => this.alternarCaminar(),
        KeyE: () => this.alternarEscalaHumana(),
        KeyC: () => { this.fijarPip(!this.pipVisible); if (this.hud.pestana === 'vista') this.hud.refrescarPestana(); },
        KeyG: () => this.abrirRecorrido(),
        KeyI: () => this.accion('entra'),
        KeyO: () => this.accion('sale'),
        KeyP: () => this.accion('pareja'),
        KeyK: () => this.accion('mochila'),
        KeyL: () => this.accion('luz'),
        KeyR: () => this.accion('calibrar'),
      });
      else if (this.modo === 'estudiante') {
        const t = this.estudiante.teclas();
        if (e.code === 'Tab' && !['mapa', 'asiento'].includes(this.estudiante.paso)) delete t.Tab;
        if (this.estudiante.manual && /^Key[WASD]$/.test(e.code)) return;   // ya camina con el control de escritorio
        Object.assign(acciones, t);
      } else if (this.modo === 'admin') Object.assign(acciones, { Space: () => { this.simBiblio.pausa = !this.simBiblio.pausa; } });
      const fn = acciones[e.code];
      if (fn) { e.preventDefault(); fn(); }
    });
  }

  // ---------------------------------------------------------------- visor
  async #comprobarXR() {
    const xr = navigator.xr;
    let vr = false, ar = false;
    if (xr && window.isSecureContext) {
      try { vr = await xr.isSessionSupported('immersive-vr'); } catch { vr = false; }
      try { ar = await xr.isSessionSupported('immersive-ar'); } catch { ar = false; }
      if (!this.xrOyente) { this.xrOyente = true; xr.addEventListener?.('devicechange', () => this.#comprobarXR()); }
    }
    this.xr = { vr, ar };
    const bVR = $('#btnVR');
    bVR.textContent = vr ? 'Entrar al visor 3D' : 'Conectar visor 3D';
    bVR.classList.toggle('primario', vr);
    $('#btnMR').hidden = !(ar && this.modo === 'tecnico');
  }

  async entrarVR(modo = 'vr') {
    if (!this.vr || !(modo === 'ar' ? this.xr.ar : this.xr.vr)) { this.dialogoVisor(); return; }
    try { await this.vr.entrar(modo); }
    catch (e) { console.error(e); this.hud.aviso(`No se pudo abrir el visor: ${e?.message || e}`, 'error', 7000); }
  }

  async abrirRecorrido() {
    if (!this.recorrido) {
      const m = await import('./ui/recorrido.js');
      this.recorrido = new m.Recorrido(this);
    }
    this.recorrido.abrir();
  }

  // ---------------------------------------------------------------- diálogos
  dialogoConectar() {
    const usb = this.fuentes.usbDisponible;
    const puertos = this.fuentes.puertos.map((p) => `<li>${escapar(p.nombre)} · ${p.lineas} líneas recibidas</li>`).join('');
    this.hud.dialogo(`
      <h2>Conectar los sensores de la maqueta</h2>
      <p>BiblioAforo VR solo <b>lee</b> lo que el ESP32 y la ESP32-CAM ya imprimen por el Monitor Serie: no cambia el programa ni el circuito. Con datos reales, la <b>mesa piloto 1-01</b> muestra la maqueta; el resto de la biblioteca sigue simulado.</p>
      <div class="opciones">
        <button id="dUSB" ${usb ? '' : 'disabled'}><b>Conectar por USB en esta computadora</b>
          <small>${usb ? 'Conecta el ESP32 DevKit (puertas) y la ESP32-CAM (asientos), cierra el Monitor Serie de Arduino y elige el puerto. Repite para el segundo.' : 'Este navegador no puede leer puertos USB. Abre esta página en Chrome o Edge en la laptop.'}</small></button>
        <button id="dCompartir"><b>Compartir con un visor (código de sala)</b><small>Para ver estos datos en un Meta Quest sin cable: el visor abre la página e ingresa el código.</small></button>
        <button id="dRecibir"><b>Recibir en vivo con un código</b><small>En el visor u otra computadora: muestra los datos que comparte la laptop conectada.</small></button>
        <button id="dSimular"><b>${this.fuentes.modo === 'sim' ? 'Seguir con la simulación' : 'Volver a la simulación'}</b><small>Sin sensores: todo se simula, incluida la mesa piloto.</small></button>
      </div>
      ${puertos ? `<h3>Puertos conectados</h3><ul>${puertos}</ul>` : ''}
      <p class="mini">Con el visor conectado a esta PC (Quest Link o Air Link) no hace falta el código: la misma página lee los sensores y los muestra en el visor.</p>`, (r) => {
      r.querySelector('#dUSB')?.addEventListener('click', async () => {
        try { await this.fuentes.conectarUSB(); this.hud.cerrarDialogo(); }
        catch (e) { if (e?.name !== 'NotFoundError') this.hud.aviso(`No se pudo conectar: ${e?.message || e}`, 'error', 7000); }
      });
      r.querySelector('#dCompartir').addEventListener('click', () => this.dialogoCompartir());
      r.querySelector('#dRecibir').addEventListener('click', () => this.dialogoRecibir());
      r.querySelector('#dSimular').addEventListener('click', () => { if (this.fuentes.modo !== 'sim') this.alternarSimulacion(true); this.hud.cerrarDialogo(); });
    });
  }

  async dialogoCompartir() {
    let codigo;
    try { codigo = await this.fuentes.compartir(); } catch (e) { this.hud.aviso(`No se pudo compartir: ${e?.message || e}`, 'error'); return; }
    const enlace = `${location.origin}${location.pathname}#/sala/${codigo}`;
    this.hud.dialogo(`
      <h2>Compartir en vivo</h2>
      <p>En el visor (o en otra computadora) abre BiblioAforo VR y usa <b>Recibir en vivo con un código</b>:</p>
      <div class="codigo">${codigo}</div>
      <p class="mini">Enlace directo: <a href="${escapar(enlace)}" style="color:#7dd3fc">${escapar(enlace)}</a></p>
      <p class="nota">Se envían solo los números del Monitor Serie (personas y asientos) por un servidor público gratuito; nunca imágenes. <span id="dEstadoComp"></span></p>
      <div class="fila" style="margin-top:12px"><button id="dCopiar">Copiar enlace</button><button id="dDejar">Dejar de compartir</button></div>`, (r) => {
      const act = () => { const s = r.querySelector('#dEstadoComp'); if (s) s.textContent = this.fuentes.servidoresCompartir ? `Conectado a ${this.fuentes.servidoresCompartir} servidor(es).` : 'Conectando…'; };
      act();
      const iv = setInterval(act, 800);
      this.hud.alCerrarDialogo = () => clearInterval(iv);
      r.querySelector('#dCopiar').addEventListener('click', async () => { try { await navigator.clipboard.writeText(enlace); this.hud.aviso('Enlace copiado.', 'ok'); } catch { this.hud.aviso(enlace, 'info', 9000); } });
      r.querySelector('#dDejar').addEventListener('click', () => { this.fuentes.dejarDeCompartir(); this.hud.cerrarDialogo(); this.hud.aviso('Se dejó de compartir.', 'info'); });
    });
  }

  dialogoRecibir() {
    let guardado = '';
    try { guardado = localStorage.getItem('ba-codigo-recibir') || ''; } catch { /* nada */ }
    this.hud.dialogo(`
      <h2>Recibir en vivo</h2>
      <p>Escribe el código de 4 dígitos que muestra la laptop conectada a los sensores (botón <b>Compartir en vivo</b>).</p>
      <p><input id="dCodigo" class="campo-codigo" inputmode="numeric" maxlength="6" value="${escapar(guardado)}" aria-label="Código de sala"></p>
      <div class="fila"><button id="dIr" class="primario">Recibir</button>${this.fuentes.recibiendo ? '<button id="dParar">Dejar de recibir</button>' : ''}</div>`, (r) => {
      const campo = r.querySelector('#dCodigo');
      campo.focus(); campo.select();
      const ir = async () => {
        try { await this.fuentes.recibir(campo.value); this.hud.cerrarDialogo(); this.hud.aviso(`Conectando con la sala ${this.fuentes.recibiendo}…`, 'ok'); }
        catch { this.hud.aviso('Escribe un código de 4 dígitos.', 'error'); }
      };
      r.querySelector('#dIr').addEventListener('click', ir);
      campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') ir(); });
      r.querySelector('#dParar')?.addEventListener('click', () => { this.fuentes.dejarDeRecibir(); this.hud.cerrarDialogo(); });
    });
  }

  dialogoVisor() {
    const seguro = window.isSecureContext;
    this.hud.dialogo(`
      <h2>Conectar el visor 3D</h2>
      ${!seguro ? '<p class="nota alerta">El visor necesita que la página se abra con https.</p>' : ''}
      <h3>Meta Quest sin cable</h3>
      <p>Abre esta misma página en el navegador del visor y pulsa <b>Entrar al visor 3D</b>. Para ver la mesa piloto en vivo, en la laptop conectada a los sensores pulsa <b>Compartir en vivo</b> y en el visor usa el código.</p>
      <h3>Visor conectado a la PC (Quest Link, Air Link o SteamVR)</h3>
      <p>Enciende el visor, deja abierta su aplicación en la PC y abre esta página en Chrome o Edge. Así la misma página lee los sensores por USB y los muestra en el visor.</p>
      <p class="mini">Estado: ${navigator.xr ? 'el navegador tiene WebXR, pero no encontró un visor.' : 'este navegador no tiene WebXR.'}</p>
      <div class="fila"><button id="dBuscar" class="primario">Volver a buscar</button></div>`, (r) => {
      r.querySelector('#dBuscar').addEventListener('click', async () => {
        await this.#comprobarXR();
        if (this.xr.vr) { this.hud.cerrarDialogo(); this.hud.aviso('Visor detectado. Pulsa "Entrar al visor 3D".', 'ok'); }
        else this.hud.aviso('Todavía no se detecta un visor.', 'aviso');
      });
    });
  }

  dialogoAyuda() {
    this.hud.dialogo(`
      <h2>Cómo se usa</h2>
      <p><b>Estudiante</b> es la experiencia principal: entras a la biblioteca, ves los asientos libres de cada piso, eliges uno en el mapa y la app te guía hasta él. <b>Administración</b> muestra aforo, asientos, dispositivos y escenarios de prueba. <b>Cómo funciona</b> es la maqueta con sus sensores.</p>
      <h3>Estudiante con teclado y ratón</h3>
      <dl class="teclas-ayuda">
        <dt><kbd>Enter</kbd></dt><dd>Acción del paso: entrar, ver el mapa, ir, sentarse, liberar, salir</dd>
        <dt><kbd>1</kbd> <kbd>2</kbd></dt><dd>Elegir piso</dd>
        <dt>Clic</dt><dd>Elegir un asiento verde en el mapa o en la vista 3D</dd>
        <dt><kbd>F</kbd> · <kbd>Tab</kbd></dt><dd>Asiento libre más cercano · mapa o piso en 3D</dd>
        <dt><kbd>G</kbd> · <kbd>Espacio</kbd> · <kbd>V</kbd></dt><dd>Guiarme o pausar · pausa · primera persona o vista aérea</dd>
        <dt><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dt><dd>Caminar tú mismo durante la ruta</dd>
        <dt><kbd>L</kbd> · <kbd>Esc</kbd></dt><dd>Liberar el asiento · volver un paso</dd>
      </dl>
      <h3>Meta Quest 3</h3>
      <dl class="teclas-ayuda">
        <dt>A</dt><dd>Acción del paso (entrar, más cercano, ir, siguiente tramo, sentarse, liberar)</dd>
        <dt>Gatillo</dt><dd>Elegir un asiento o un botón del tablero con el rayo</dd>
        <dt>B · X · Y</dt><dd>Mostrar el tablero · cambiar de piso · ayuda</dd>
        <dt>Sticks</dt><dd>Izquierdo: caminar · derecho: girar (← →) y teletransporte (↑ y soltar)</dd>
      </dl>
      <h3>Datos</h3>
      <p>Con <b>Simulación</b> todo es simulado. Con <b>Datos reales</b> (sensores por USB o un código de sala), la mesa piloto 1-01 muestra la maqueta y el resto sigue simulado. <b>Personas dentro</b> lo cuentan las puertas; <b>asientos ocupados</b>, las cámaras: son indicadores distintos. Colores: <span style="color:#22c55e">verde</span> libre, <span style="color:#ef4444">rojo</span> ocupado, <span style="color:#f59e0b">ámbar</span> apartado con un objeto, <span style="color:#38bdf8">azul</span> tu asiento.</p>
      <p class="mini">La distribución de las salas es referencial (24 mesas en la Sala 1 y 59 en la Sala 2, como en el informe); no es el plano oficial.</p>`);
  }
}

window.biblioaforo = new App();
