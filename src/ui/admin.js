// Vista de administración: aforo y asientos lado a lado, ocupación del día, dispositivos,
// escenarios de prueba y registro. Deja claro qué es real y qué es simulado.
import { ESCENARIOS } from '../biblioteca/simulador.js';
import { hora, escapar, descargar } from './hud.js';

const miles = (v) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export function panelAdmin(app) {
  const b = app.biblio;
  const sim = app.simBiblio;
  let ultimoEvento = -1;
  const v = (r, k) => r.querySelector(`[data-v="${k}"]`);

  const pagina = {
    titulo: 'Administración',
    html: () => `
      <div class="admin-panel">
        <div class="kpis">
          <div class="kpi puerta"><span>Personas dentro</span><b><span data-v="dentro">–</span><small> / ${b.puertas.aforo}</small></b><em data-v="dentroPct">sensores de las puertas</em></div>
          <div class="kpi camara"><span>Asientos ocupados</span><b><span data-v="ocupados">–</span><small> / 332</small></b><em data-v="libresTxt">cámaras por mesa</em></div>
          <div class="kpi"><span>Personas sin asiento</span><b data-v="sinAsiento">–</b><em>dentro − sentados: de pie, en estantes o de paso</em></div>
          <div class="kpi"><span>Entradas · salidas hoy</span><b data-v="es">–</b><em data-v="esTxt"></em></div>
        </div>
        <div class="tarjeta">
          <h3>Ocupación por piso <small data-v="hora"></small></h3>
          <div class="barras-piso">
            <div><span><b>Piso 1 · Sala 1</b><span data-v="p1"></span></span><div class="b"><i data-v="b1"></i></div></div>
            <div><span><b>Piso 2 · Sala 2</b><span data-v="p2"></span></span><div class="b"><i data-v="b2"></i></div></div>
          </div>
        </div>
        <div class="tarjeta">
          <h3>Hoy <small>personas dentro y asientos ocupados</small></h3>
          <svg class="grafico-dia" data-v="grafico" viewBox="0 0 640 260" role="img" aria-label="Gráfico del día"></svg>
          <div class="leyenda"><span><i style="background:#38bdf8"></i>Personas dentro (puertas)</span><span><i style="background:#ef4444"></i>Asientos ocupados (cámaras)</span></div>
        </div>
        <div class="tarjeta">
          <h3>Dispositivos</h3>
          <ul class="disp" data-v="disp"></ul>
          <div class="piloto-puerta" data-v="puertaPiloto"></div>
          <div class="fila" style="margin-top:8px"><button data-a="conectar">Conectar sensores</button><button data-a="descargar">Descargar registro</button></div>
        </div>
        <div class="tarjeta">
          <h3>Escenarios de prueba <small>todo lo que generan es simulado</small></h3>
          <div class="fila" data-v="escenarios">${Object.entries(ESCENARIOS).map(([k, e]) => `<button data-esc="${k}">${e.nombre}</button>`).join('')}</div>
          <div class="control-vel"><span>Velocidad del reloj</span><div class="fila" data-v="vel">${[1, 10, 60, 300].map((x) => `<button data-vel="${x}">× ${x}</button>`).join('')}<button data-a="pausa">Pausa</button></div></div>
          <div class="acciones">
            <button data-a="entran">Entran 10</button><button data-a="salen">Salen 10</button>
            <button data-a="ocupar">Ocupar 10 al azar</button><button data-a="liberarAz">Liberar 10 al azar</button>
            <button data-a="masiva" class="ancho">Llegada masiva (+60 personas)</button>
          </div>
        </div>
        <div class="tarjeta"><h3>Eventos</h3><ul class="eventos" data-v="eventos"></ul></div>
        <p class="mini">Solo la mesa piloto (1-01) y la puerta piloto pueden venir de sensores reales: son la maqueta. El aforo de 381 y los otros 328 asientos son una proyección simulada del sistema completo (83 cámaras).</p>
      </div>`,
    montar: (r) => {
      ultimoEvento = -1;
      r.addEventListener('click', (e) => {
        const t = e.target.closest('button'); if (!t) return;
        const d = t.dataset;
        if (d.esc) { sim.iniciarDia(d.esc); sim.pausa = false; app.hud.aviso(`Escenario: ${ESCENARIOS[d.esc].nombre}.`, 'info'); return; }
        if (d.vel) { sim.velocidad = Number(d.vel); sim.pausa = false; return; }
        switch (d.a) {
          case 'pausa': sim.pausa = !sim.pausa; break;
          case 'entran': sim.entran(10); break;
          case 'salen': sim.salen(10); break;
          case 'ocupar': sim.ocuparAzar(10); break;
          case 'liberarAz': sim.liberarAzar(10); break;
          case 'masiva': sim.llegadaMasiva(); break;
          case 'conectar': app.dialogoConectar(); break;
          case 'descargar': descargarTodo(app); break;
          default: break;
        }
      });
    },
    actualizar: (r) => {
      const d = b.puertas.dentro, oc = b.ocupados(), sentados = b.sentados(), libres = b.libres();
      v(r, 'dentro').textContent = d;
      v(r, 'dentroPct').textContent = `${Math.round(d / b.puertas.aforo * 100)} % del aforo · sensores de las puertas (simulado)`;
      v(r, 'ocupados').textContent = oc;
      v(r, 'libresTxt').textContent = `${libres} libres · ${b.pilotoReal ? '1 mesa real + 82 simuladas' : 'cámaras simuladas'}`;
      v(r, 'sinAsiento').textContent = Math.max(0, d - sentados);
      v(r, 'es').textContent = `${miles(b.puertas.entradas)} · ${miles(b.puertas.salidas)}`;
      v(r, 'esTxt').textContent = `${miles(b.puertas.entradas)} − ${miles(b.puertas.salidas)} = ${d} dentro`;
      v(r, 'hora').textContent = `hora simulada ${b.hora()}${sim.pausa ? ' · en pausa' : ` · × ${sim.velocidad}`}`;
      for (const n of [1, 2]) {
        const t = b.total(n), l = b.libres(n);
        v(r, `p${n}`).textContent = `${t - l} / ${t} · ${l} libres`;
        v(r, `b${n}`).style.width = `${Math.round((t - l) / t * 100)}%`;
      }
      r.querySelectorAll('[data-vel]').forEach((x) => x.setAttribute('aria-pressed', String(!sim.pausa && Number(x.dataset.vel) === sim.velocidad)));
      r.querySelector('[data-a="pausa"]').setAttribute('aria-pressed', String(sim.pausa));
      r.querySelectorAll('[data-esc]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.esc === sim.escenario)));
      grafico(v(r, 'grafico'), b);
      dispositivos(v(r, 'disp'), v(r, 'puertaPiloto'), app);
      const evs = b.eventos;
      if (evs.length && evs[evs.length - 1].t !== ultimoEvento) {
        ultimoEvento = evs[evs.length - 1].t;
        v(r, 'eventos').innerHTML = evs.slice(-60).reverse().map((ev) => `<li><time>${b.hora(ev.min)}</time><span>${escapar(ev.texto)}</span></li>`).join('');
      }
    },
  };
  return { ancho: true, pestanas: { admin: pagina } };
}

function grafico(svg, b) {
  const W = 640, H = 260, ml = 44, mr = 14, mt = 14, mb = 30;
  const x = (min) => ml + ((min / 60 - 8) / 14) * (W - ml - mr);
  const y = (v) => mt + (1 - v / 400) * (H - mt - mb);
  let g = '';
  for (const [a, c] of [[14, 15.5], [17, 18.5]]) g += `<rect x="${x(a * 60)}" y="${mt}" width="${x(c * 60) - x(a * 60)}" height="${H - mt - mb}" class="g-punta"/>`;
  g += `<text x="${x(14.75 * 60)}" y="${mt + 12}" class="g-punta-t">hora punta</text><text x="${x(17.75 * 60)}" y="${mt + 12}" class="g-punta-t">hora punta</text>`;
  for (const v of [0, 100, 200, 300, 400]) g += `<line x1="${ml}" y1="${y(v)}" x2="${W - mr}" y2="${y(v)}" class="g-grilla"/><text x="${ml - 8}" y="${y(v) + 4}" class="g-eje" text-anchor="end">${v}</text>`;
  for (const h of [8, 10, 12, 14, 16, 18, 20, 22]) g += `<text x="${x(h * 60)}" y="${H - 9}" class="g-eje" text-anchor="middle">${String(h).padStart(2, '0')}:00</text>`;
  g += `<line x1="${ml}" y1="${y(381)}" x2="${W - mr}" y2="${y(381)}" class="g-ref aforo"/><text x="${W - mr - 4}" y="${y(381) - 5}" class="g-ref-t aforo" text-anchor="end">aforo 381</text>`;
  g += `<line x1="${ml}" y1="${y(332)}" x2="${W - mr}" y2="${y(332)}" class="g-ref asientos"/><text x="${W - mr - 4}" y="${y(332) + 14}" class="g-ref-t asientos" text-anchor="end">asientos 332</text>`;
  const h = b.historial.filter((p) => p.min >= 8 * 60 && p.min <= 22 * 60);
  const linea = (campo, clase) => (h.length > 1 ? `<polyline class="${clase}" points="${h.map((p) => `${x(p.min).toFixed(1)},${y(p[campo]).toFixed(1)}`).join(' ')}"/>` : '');
  g += linea('dentro', 'g-dentro') + linea('ocupados', 'g-ocupados');
  const ahora = b.minuto;
  g += `<line x1="${x(ahora)}" y1="${mt}" x2="${x(ahora)}" y2="${H - mb}" class="g-ahora"/><text x="${x(ahora) + 5}" y="${H - mb - 6}" class="g-eje">${b.hora()}</text>`;
  g += `<circle cx="${x(ahora)}" cy="${y(b.puertas.dentro)}" r="4.5" class="p-dentro"/><circle cx="${x(ahora)}" cy="${y(b.ocupados())}" r="4.5" class="p-ocupados"/>`;
  svg.innerHTML = g;
}

function dispositivos(ul, caja, app) {
  const est = app.estado;
  const real = app.fuentes.enVivo;
  const hace = (t) => (t ? `última línea a las ${hora(t)}` : 'sin líneas todavía');
  const fila = (color, nombre, detalle, estado, clase) => `<li><i style="background:${color}"></i><div>${nombre}<small>${detalle}</small></div><span class="estado ${clase}">${estado}</span></li>`;
  const modo = app.fuentes.modo;
  let html = '';
  if (real) {
    const vc = est.contador.conocido, vk = est.camara.conocida;
    html += fila(vc ? '#22c55e' : '#f59e0b', 'Puerta piloto · ESP32 DevKit', `${modo === 'usb' ? 'USB' : 'por internet'} · ${hace(est.contador.ultima)}`, vc ? 'Conectado' : 'Esperando', vc ? 'e-ok' : 'e-off');
    html += fila(vk ? '#22c55e' : '#f59e0b', 'Mesa piloto · ESP32-CAM', `zonas A1–A4 = 1-01-A…D · ${hace(est.camara.ultima)}`, vk ? 'Conectado' : 'Esperando', vk ? 'e-ok' : 'e-off');
  } else {
    html += fila('#64748b', 'Puerta piloto · ESP32 DevKit', modo === 'espera' ? 'sin conectar' : 'sin conectar: la mesa piloto se simula', 'Sin conectar', 'e-off');
    html += fila('#64748b', 'Mesa piloto · ESP32-CAM', 'sin conectar', 'Sin conectar', 'e-off');
  }
  html += fila('#38bdf8', 'Puertas de la biblioteca', 'aforo 381 · proyección, sin sensores instalados', 'Simulado', 'e-sim');
  html += fila('#38bdf8', '82 cámaras de mesa', '328 asientos · proyección de la sección 6 del informe', 'Simulado', 'e-sim');
  if (ul.dataset.h !== html) { ul.innerHTML = html; ul.dataset.h = html; }
  const c = est.contador;
  const txt = real && c.conocido
    ? `<b>Puerta piloto (maqueta):</b> dentro ${c.dentro} de 4 · entradas ${c.entradas} · salidas ${c.salidas}${c.led ? ' · LED de sala llena encendido' : ''}. Se muestra aparte: no se suma al aforo de la biblioteca.`
    : '';
  if (caja.innerHTML !== txt) caja.innerHTML = txt;
}

function descargarTodo(app) {
  const b = app.biblio;
  const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const csv = ['hora_simulada,personas_dentro,asientos_ocupados,libres_piso1,libres_piso2']
    .concat(b.historial.map((p) => `${b.hora(p.min)},${p.dentro},${p.ocupados},${p.libres1 ?? ''},${p.libres2 ?? ''}`)).join('\n');
  descargar(`BiblioAforo_biblioteca_${sello}.csv`, csv + '\n', 'text/csv;charset=utf-8');
  const est = app.estado;
  const contador = est.registro.contador.map((r) => r.linea).join('\n');
  const camara = est.registro.camara.map((r) => r.linea).join('\n');
  if (contador) setTimeout(() => descargar(`BiblioAforo_ESP32_${sello}.txt`, contador + '\n'), 350);
  if (camara) setTimeout(() => descargar(`BiblioAforo_ESP32-CAM_${sello}.txt`, camara + '\n'), 700);
  app.hud.aviso('Registro descargado.', 'ok');
}
