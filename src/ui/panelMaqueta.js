// Panel lateral de la escena "Maqueta": Datos · Simular · Vista
import { MAQUETA as M, FISICA } from '../config.js';
import { hora, escapar, dibujarSerie, descargar } from './hud.js';

const ETQ = { libre: 'Libre', ocupado: 'Ocupado', objeto: 'Objeto', sinDato: 'Sin dato' };
const NOMBRES_FUENTE = { sim: 'simulación', usb: 'sensores USB', remoto: 'en vivo por internet', espera: 'sin datos' };

export function panelMaqueta(app) {
  const est = app.estado;
  const esc = () => app.escenas.maqueta;
  const v = (raiz, k) => raiz.querySelector(`[data-v="${k}"]`);
  let ultimoEvento = -1;

  const datos = {
    titulo: 'Datos',
    html: () => `
      <div class="tarjeta">
        <h3>Aforo <small data-v="fuente"></small></h3>
        <div class="aforo">
          <div class="anillo">
            <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="none" stroke="rgba(148,163,184,.2)" stroke-width="11" stroke-linecap="round" stroke-dasharray="235.6 314.2"/>
            <circle data-v="arco" cx="60" cy="60" r="50" fill="none" stroke="#22c55e" stroke-width="11" stroke-linecap="round" stroke-dasharray="0 314.2"/></svg>
            <div class="num"><div><b data-v="dentro">–</b><small>de ${M.capacidad} personas</small></div></div>
          </div>
          <div class="cifras">
            <div class="cifra"><span>Entradas (S1)</span><b data-v="entradas">–</b></div>
            <div class="cifra"><span>Salidas (S2)</span><b data-v="salidas">–</b></div>
            <div class="cifra"><span>Asientos libres</span><b data-v="libres">–</b></div>
            <div class="cifra"><span>Último cruce</span><b data-v="tb">–</b></div>
          </div>
        </div>
        <div class="led" data-v="led"><i></i><span data-v="ledTxt">LED de sala llena</span></div>
        <p class="nota" data-v="notaTb"></p>
      </div>
      <div class="tarjeta">
        <h3>Asientos <small>ESP32-CAM · zonas A1–A4</small></h3>
        <div class="asientos" data-v="asientos">${M.sillas.map((s, i) => `
          <div class="asiento sinDato" data-asiento="${i}"><b>${s.id}</b><span class="est">Sin dato</span>
          <div class="barra"><i style="width:0%"></i><em title="umbral 20 %"></em></div><small>cambio –</small></div>`).join('')}
        </div>
        <p class="nota" data-v="notaAsientos"></p>
      </div>
      <div class="tarjeta">
        <h3>Telemetría <small>últimos 5 minutos</small></h3>
        <canvas class="grafico" data-v="grafico" width="680" height="230"></canvas>
        <div class="leyenda"><span><i style="background:#38bdf8"></i>Personas dentro</span><span><i style="background:#22c55e"></i>Asientos libres</span></div>
        <div class="fila" style="margin-top:10px"><button data-a="descargar">Descargar registro</button><button data-a="compartir">Compartir en vivo</button></div>
        <p class="mini" style="margin:8px 0 0">El registro guarda lo mismo que el Monitor Serie del ESP32 y de la ESP32-CAM: sirve para la Figura 7 y las Tablas 6 y 7 del informe.</p>
      </div>
      <div class="tarjeta"><h3>Eventos</h3><ul class="eventos" data-v="eventos"></ul></div>`,
    montar: (r) => {
      ultimoEvento = -1;
      r.querySelector('[data-a="descargar"]').addEventListener('click', () => descargarRegistro(app));
      r.querySelector('[data-a="compartir"]').addEventListener('click', () => app.dialogoCompartir());
    },
    actualizar: (r) => {
      const c = est.contador;
      v(r, 'fuente').textContent = NOMBRES_FUENTE[app.fuentes.modo] || '';
      v(r, 'dentro').textContent = c.conocido ? c.dentro : '–';
      v(r, 'entradas').textContent = c.conocido ? c.entradas : '–';
      v(r, 'salidas').textContent = c.conocido ? c.salidas : '–';
      const libres = est.libres;
      v(r, 'libres').textContent = libres == null ? '–' : `${libres}/${est.nAsientos}`;
      const ult = est.cruces[est.cruces.length - 1];
      v(r, 'tb').textContent = ult ? `${ult.duracion_ms} ms` : '–';
      const frac = c.conocido ? Math.min(1, c.dentro / est.capacidad) : 0;
      const arco = v(r, 'arco');
      arco.setAttribute('stroke-dasharray', `${(235.6 * frac).toFixed(1)} 314.2`);
      arco.setAttribute('stroke', c.led ? '#ef4444' : frac >= 0.75 ? '#f59e0b' : '#22c55e');
      v(r, 'led').classList.toggle('on', !!c.led);
      v(r, 'ledTxt').textContent = !c.conocido ? 'LED de sala llena: esperando datos' : c.led ? 'Sala llena: LED rojo encendido (D25)' : 'Hay espacio: LED apagado';
      const e = est.estadisticaCruces();
      v(r, 'notaTb').innerHTML = e
        ? `Duración del bloqueo en ${e.n} cruces: <b>${Math.round(e.media)} ± ${Math.round(e.desv)} ms</b> (informe: ${FISICA.tbMedioMs} ± ${FISICA.tbDesvMs} ms en 29 cruces).`
        : 'Cada cruce bloquea el haz unos cientos de milisegundos; aquí aparecerá el promedio para contrastarlo con el informe.';
      // asientos
      r.querySelectorAll('[data-asiento]').forEach((el) => {
        const i = Number(el.dataset.asiento);
        const a = est.camara.asientos[i];
        const e2 = esc().estadoAsiento(i);
        el.className = `asiento ${e2}`;
        el.querySelector('.est').textContent = ETQ[e2];
        const pct = a.ocupado == null ? 0 : a.pct;
        el.querySelector('.barra i').style.width = `${Math.min(100, pct)}%`;
        el.querySelector('small').textContent = a.ocupado == null ? 'cambio –' : `cambio ${Math.round(pct)} % · ${a.desde ? 'desde ' + hora(a.desde) : ''}`;
      });
      let nota = 'Las puertas responden <b>cuántas personas hay</b>; la cámara, <b>dónde sentarse</b>.';
      let alerta = false;
      if (est.sinPersona > 0) { nota = `La cámara ve <b>${est.sinPersona} asiento${est.sinPersona > 1 ? 's' : ''} ocupado${est.sinPersona > 1 ? 's' : ''}</b> que el conteo de las puertas no explica: probablemente un objeto (mochila) apartando el sitio.`; alerta = true; }
      else if (est.sinAsiento > 0 && est.libres === 0) { nota = `<b>${est.sinAsiento} persona${est.sinAsiento > 1 ? 's' : ''} sin asiento:</b> la sala está dentro del aforo, pero ya no hay sitios libres (el caso que motivó añadir la cámara).`; alerta = true; }
      else if (!est.camara.conocida) nota = 'Esperando a la ESP32-CAM. Al calibrarse (asientos vacíos) o al primer cambio, aparecerá el estado de cada asiento.';
      const n = v(r, 'notaAsientos'); n.innerHTML = nota; n.classList.toggle('alerta', alerta);
      dibujarSerie(v(r, 'grafico'), est.historial, { maximo: Math.max(est.capacidad, est.nAsientos) });
      // eventos (solo se agregan los nuevos)
      const lista = v(r, 'eventos');
      const evs = est.eventos;
      if (evs.length && evs[evs.length - 1].t !== ultimoEvento) {
        ultimoEvento = evs[evs.length - 1].t;
        lista.innerHTML = evs.slice(-60).reverse().map((ev) => `<li><time>${hora(ev.t)}</time><span>${escapar(ev.texto)}</span></li>`).join('');
      } else if (!evs.length) lista.innerHTML = '<li><time></time><span class="mini">Sin eventos todavía.</span></li>';
    },
  };

  const simular = {
    titulo: 'Simular',
    html: () => {
      if (app.fuentes.modo !== 'sim') {
        return `<div class="tarjeta"><h3>Datos reales</h3>
          <p class="nota">Ahora se muestran los datos de ${app.fuentes.modo === 'usb' ? 'los sensores conectados por USB' : app.fuentes.modo === 'remoto' ? 'la sala en vivo' : 'ninguna fuente'}. Para probar cada situación sin sensores, activa la simulación.</p>
          <div class="fila" style="margin-top:10px"><button data-a="activarSim">Simular datos <kbd>M</kbd></button></div></div>`;
      }
      return `
      <div class="tarjeta">
        <h3>Simulación <small>firmware del informe, emulado</small></h3>
        <p class="nota" style="margin:0 0 10px">Las siluetas virtuales cruzan los haces y la cámara virtual las ve. El conteo y la detección usan la misma lógica de los Anexos A y B (antirrebote de 50 ms, umbral de 30 niveles, 20 % de la zona y 3 lecturas).</p>
        <div class="acciones">
          <button data-a="entra">Entra una persona <kbd>I</kbd></button>
          <button data-a="sale">Sale una persona <kbd>O</kbd></button>
          <button data-a="pareja" class="ancho">Dos personas pegadas (hueco &lt; 15 cm) <kbd>P</kbd></button>
          <button data-a="mochila" class="ancho">Dejar una mochila en un asiento <kbd>K</kbd></button>
          <button data-a="luz">Cambiar la luz <kbd>L</kbd></button>
          <button data-a="moverCam">Mover la cámara</button>
          <button data-a="calibrar" class="ancho">Recalibrar la cámara <kbd>R</kbd></button>
        </div>
        <label class="interruptor" style="margin-top:8px">Llegadas automáticas <input type="checkbox" data-a="auto"></label>
        <label class="mini">Ritmo de llegadas <input type="range" min="0.3" max="3" step="0.1" data-a="ritmo"></label>
        <div class="fila" style="margin-top:6px"><button data-a="reiniciar">Reiniciar la simulación</button></div>
      </div>
      <div class="tarjeta">
        <h3>Qué enseña cada prueba</h3>
        <p class="nota"><b>Dos personas pegadas:</b> si el hueco entre ellas es menor que D + v·t<sub>f</sub> ≈ 0.15 m, el haz no se libera y cuentan como una (14 de 20 en el informe). Al salir por separado, el conteo queda corto.</p>
        <p class="nota"><b>Mochila:</b> la cámara ve el asiento ocupado aunque la persona salió. Combinar puertas y cámara permite detectar sitios "apartados".</p>
        <p class="nota"><b>Cambiar la luz:</b> el programa resta el cambio medio de brillo, así un cambio general de luz no ocupa asientos.</p>
        <p class="nota"><b>Mover la cámara:</b> la imagen de referencia deja de coincidir y aparecen falsos ocupados; se corrige recalibrando con los asientos vacíos.</p>
      </div>`;
    },
    montar: (r) => {
      const d = app.escenas.maqueta.director;
      const on = (a, fn) => r.querySelector(`[data-a="${a}"]`)?.addEventListener('click', fn);
      on('activarSim', () => app.alternarSimulacion(true));
      on('entra', () => app.accion('entra'));
      on('sale', () => app.accion('sale'));
      on('pareja', () => app.accion('pareja'));
      on('mochila', () => app.accion('mochila'));
      on('luz', () => app.accion('luz'));
      on('moverCam', () => app.accion('moverCam'));
      on('calibrar', () => app.accion('calibrar'));
      on('reiniciar', () => app.alternarSimulacion(true));
      const auto = r.querySelector('[data-a="auto"]');
      if (auto) { auto.checked = d.autoLlegadas; auto.addEventListener('change', () => { d.autoLlegadas = auto.checked; }); }
      const ritmo = r.querySelector('[data-a="ritmo"]');
      if (ritmo) { ritmo.value = d.ritmo; ritmo.addEventListener('input', () => { d.ritmo = Number(ritmo.value); }); }
    },
  };

  const vista = {
    titulo: 'Vista',
    html: () => `
      <div class="tarjeta">
        <h3>Para la sustentación</h3>
        <p class="nota" style="margin:0 0 8px">Esta mesa es la <b>Mesa piloto 1-01</b> de la Sala 1: con los sensores conectados, la biblioteca la muestra en vivo.</p>
        <div class="fila"><button data-a="recorrido">Recorrido guiado <kbd>G</kbd></button><button data-a="verPiloto">Ver la mesa piloto en la biblioteca</button></div>
      </div>
      <div class="tarjeta">
        <h3>Cámara</h3>
        <div class="fila">
          ${[['general', 'General'], ['frente', 'Frente'], ['sensores', 'Sensor S1'], ['caja', 'Caja de control'], ['camara', 'ESP32-CAM'], ['mesa', 'Mesa'], ['cenital', 'Desde arriba'], ['sala', 'Toda la sala']]
            .map(([k, t]) => `<button data-vista="${k}">${t}</button>`).join('')}
        </div>
        <div class="fila" style="margin-top:8px">
          <button data-a="caminar">Caminar por la sala <kbd>V</kbd></button>
          <button data-a="humano">Entrar a la maqueta (1:17) <kbd>E</kbd></button>
        </div>
      </div>
      <div class="tarjeta">
        <h3>Mostrar</h3>
        <label class="interruptor">Haces infrarrojos (invisibles en la realidad) <input type="checkbox" data-a="haces"></label>
        <label class="interruptor">Etiquetas de las piezas <input type="checkbox" data-a="rotulos"></label>
        <label class="interruptor">Pirámide de visión de la cámara <input type="checkbox" data-a="piramide"></label>
        <label class="interruptor">Vista de la ESP32-CAM <input type="checkbox" data-a="pip"></label>
      </div>
      <div class="tarjeta">
        <h3>Calidad gráfica <small data-v="fps"></small></h3>
        <select data-a="calidad"><option value="alta">Alta (tarjeta dedicada)</option><option value="media">Media</option><option value="baja">Baja (más fluida)</option></select>
        <p class="mini" style="margin:8px 0 0">Se elige sola según la tarjeta de video. En el visor se ajusta aparte.</p>
      </div>`,
    montar: (r) => {
      const e = esc();
      r.querySelector('[data-a="recorrido"]').addEventListener('click', () => app.abrirRecorrido());
      r.querySelector('[data-a="verPiloto"]').addEventListener('click', () => {
        app.irModo('libre', { ir: 'piloto' });
      });
      r.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => app.vistaMaqueta(b.dataset.vista)));
      r.querySelector('[data-a="caminar"]').addEventListener('click', () => app.alternarCaminar());
      r.querySelector('[data-a="humano"]').addEventListener('click', () => app.alternarEscalaHumana());
      const chk = (a, val, fn) => { const el = r.querySelector(`[data-a="${a}"]`); el.checked = val; el.addEventListener('change', () => fn(el.checked)); };
      chk('haces', e.mostrarHaces, (x) => e.fijarHaces(x));
      chk('rotulos', e.mostrarRotulos, (x) => e.fijarRotulos(x));
      chk('piramide', e.maq.piramide.visible, (x) => { e.maq.piramide.visible = x; });
      chk('pip', app.pipVisible, (x) => app.fijarPip(x));
      const sel = r.querySelector('[data-a="calidad"]');
      sel.value = app.motor.calidad;
      sel.addEventListener('change', () => app.motor.fijarCalidad(sel.value));
    },
    actualizar: (r) => { const f = v(r, 'fps'); if (f) f.textContent = `${Math.round(app.motor.fps)} cuadros/s`; },
  };

  return { pestanas: { vista, datos, simular } };
}

function descargarRegistro(app) {
  const est = app.estado;
  const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const contador = est.registro.contador.map((r) => r.linea).join('\n');
  const camara = est.registro.camara.map((r) => r.linea).join('\n');
  if (!contador && !camara) { app.hud.aviso('Todavía no hay líneas registradas.', 'aviso'); return; }
  if (contador) descargar(`BiblioAforo_ESP32_${sello}.txt`, contador + '\n');
  if (camara) setTimeout(() => descargar(`BiblioAforo_ESP32-CAM_${sello}.txt`, camara + '\n'), 350);
  const csv = ['hora_pc,personas_dentro,asientos_libres,led']
    .concat(est.historial.map((p) => `${new Date(p.t).toISOString()},${p.dentro ?? ''},${p.libres ?? ''},${p.led ?? ''}`)).join('\n');
  setTimeout(() => descargar(`BiblioAforo_telemetria_${sello}.csv`, csv + '\n', 'text/csv;charset=utf-8'), 700);
  app.hud.aviso('Registro descargado: líneas del ESP32, de la ESP32-CAM y la telemetría en CSV.', 'ok');
}
