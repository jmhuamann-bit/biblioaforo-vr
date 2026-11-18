// Experiencia DETECTIVE: cada estudiante necesita algo distinto (silencio, enchufe, ventana, una
// mesa para su grupo…). Recorres la biblioteca, inspeccionas asientos, marcas candidatos, los
// comparas y decides. Mientras tanto la biblioteca sigue viva: un candidato puede ocuparse.
import { PLANO, NOMBRE_ZONA, yPiso, nivelDe } from '../biblioteca/plano.js';
import { camposDesde, distanciaAsiento, libresPorMesa } from '../biblioteca/recomendador.js';
import { describirObjeto } from './jugador.js';
import { VistaAerea } from './vistaAerea.js';
import * as H from './hudJuego.js';

const libre = (a, c) => c.b.estadoDe(a) === 'libre' && !c.m.sentandoseEn(a.id);

const MISIONES = [
  { id: 'silencio', icono: '🤫', cliente: 'Ana', texto: 'Ana tiene examen mañana: necesita estudiar en la <b>zona de silencio</b> y cargar su laptop (<b>enchufe</b>).',
    filtros: { zona: 'silencio', enchufe: true },
    condiciones: [['Zona de silencio', (a) => a.zona === 'silencio'], ['Con enchufe', (a) => a.enchufe], ['Libre ahora', libre]] },
  { id: 'grupo', icono: '👥', cliente: 'Diego y su grupo', texto: 'Diego y dos amigos preparan una exposición: necesitan <b>3 asientos libres en la misma mesa</b>. Mejor si es en la zona de trabajo en grupo.',
    filtros: { grupo: 3 },
    condiciones: [['3 libres en su mesa', (a, c) => (c.libresMesa.get(a.mesa) || 0) >= 3], ['Libre ahora', libre]],
    extra: ['Zona de trabajo en grupo', (a) => a.zona === 'grupo'] },
  { id: 'ventana', icono: '🪟', cliente: 'Lucía', texto: 'Lucía lee mejor con luz natural: quiere un asiento <b>junto a la ventana</b>. El sótano no tiene ventanas: búscalo en el <b>piso 1</b>.',
    filtros: { piso: 1, ventana: true },
    condiciones: [['Piso 1 (el sótano no tiene ventanas)', (a) => a.piso === 1], ['Junto a la ventana', (a) => a.ventana], ['Libre ahora', libre]] },
  { id: 'rapido', icono: '⏱️', cliente: 'Mateo', texto: 'Mateo tiene 10 minutos entre clases: necesita el asiento libre <b>más cercano a ti</b>. Cada metro cuenta.',
    filtros: {},
    condiciones: [['Libre ahora', libre], ['Casi el más cercano (±20 %)', (a, c) => c.metros(a) <= c.mejorMetros() * 1.2 + 2]] },
  { id: 'piloto', icono: '🛰️', cliente: 'Tú', texto: 'Quieres ver el sistema por dentro: siéntate en la <b>mesa piloto 1-01</b>, la que puede mostrar los datos reales de la maqueta.',
    filtros: {},
    condiciones: [['Mesa piloto 1-01', (a) => a.piloto], ['Libre ahora', libre]] },
];

export class Detective {
  constructor(app) {
    this.app = app;
    this.id = 'detective';
    this.titulo = 'Detective';
    this.escena = 'biblioteca';
    this.panel = false;
    this.aerea = new VistaAerea(app);
    this.oyentes = [];
  }
  get b() { return this.app.biblio; }
  get m() { return this.app.multitud; }
  get esc() { return this.app.escenas.biblioteca; }
  get b3d() { return this.app.escenas.biblioteca.b3d; }
  get j() { return this.app.jugador; }
  get son() { return this.app.sonido; }

  iniciar() {
    const app = this.app;
    app.reiniciarMundo('punta14', { velocidad: 2, fallas: false });
    this.m.factorVel = 0.5;
    app.precalentar(6);
    this.esc.restaurarVisibilidad(); this.esc.enfocarPiso(null); this.esc.separarPisos(false);
    this.b3d.ocultarRuta(); this.b3d.marcarDestino(null); this.b3d.avatar.visible = false;
    this.j.iniciar({ x: 0.5, z: 10.6, piso: 1, rumbo: 0.1, velocidad: 1.75 });
    this.j.describir = (h) => this.describir(h);
    this.j.alInteractuar = (h) => this.interactuar(h);
    this.i = 0;
    this.estrellas = [];
    this.tHud = 0;
    H.mostrar({ mira: true, objetivo: true, kpis: true, minimapa: true, barraAcciones: true });
    H.alAccionObjetivo((a) => this.#accion(a));
    H.acciones([
      { texto: 'Comparar candidatos', tecla: 'C', principal: true, fn: () => this.comparar() },
      { texto: 'Mapa', tecla: 'Tab', fn: () => this.abrirMapa(false) },
      { texto: 'Pista', tecla: 'P', fn: () => this.abrirMapa(true) },
      { texto: 'Vista aérea', tecla: 'V', fn: () => this.alternarVista() },
    ]);
    this.oyentes = [this.b.on('asiento', ({ a, ahora }) => {
      if (ahora !== 'libre' && this.candidatos?.some((c) => c.id === a.id) && !a.estudiante) {
        this.son.alerta();
        H.banner(`Tu candidato ${a.id} se ocupó`, 'alerta', 'La biblioteca sigue viva: alguien se sentó ahí. Busca otra opción.', 3600);
      }
    })];
    this.#empezarMision();
  }

  detener() {
    for (const off of this.oyentes) off();
    this.oyentes = [];
    if (this.aerea.activa) { this.aerea.activa = false; this.esc.restaurarVisibilidad(); this.b3d.avatar.visible = false; }
    if (this.sentado) { this.m.liberarPorJugador(this.sentado.id); this.sentado = null; }
    this.esc.marcar({ tuyo: null, elegido: null });
    this.j.detener();
    this.j.describir = null; this.j.alInteractuar = null;
    this.b3d.marcarDestino(null);
    H.alAccionObjetivo(null);
    H.cerrarResultado();
    H.mostrar({});
  }

  pistas() {
    if (this.aerea.activa) return [['Clic', 'marcar candidato'], ['Arrastrar', 'girar'], ['V', 'volver a caminar']];
    return [['W A S D', 'caminar'], ['Shift', 'correr'], ['Clic', 'mirar'], ['E', 'marcar candidato'], ['C', 'comparar'], ['Tab', 'mapa'], ['P', 'pista'], ['V', 'vista aérea']];
  }

  teclas() {
    return {
      KeyC: () => (this.sentado ? this.#siguiente() : this.comparar()),
      Tab: () => this.abrirMapa(false),
      KeyP: () => this.abrirMapa(true),
      KeyV: () => this.alternarVista(),
      Escape: () => { if (this.app.mapaJuego.abierto) this.app.mapaJuego.cerrar(); },
    };
  }

  get mision() { return MISIONES[this.i]; }

  // contexto para evaluar condiciones
  #ctx() {
    const ctx = { b: this.b, m: this.m, libresMesa: libresPorMesa(this.b) };
    ctx.metros = (a) => distanciaAsiento(this.campos, a);
    ctx.mejorMetros = () => {
      if (this.cacheMejor && this.cacheMejor.v === this.b.version) return this.cacheMejor.m;
      let best = Infinity;
      for (const a of this.b.asientos) if (libre(a, ctx)) best = Math.min(best, ctx.metros(a));
      this.cacheMejor = { v: this.b.version, m: best };
      return best;
    };
    return ctx;
  }

  #evaluar(a, ctx = this.#ctx()) {
    const mi = this.mision;
    const res = mi.condiciones.map(([t, f]) => ({ t, ok: !!f(a, ctx) }));
    const extra = mi.extra ? { t: mi.extra[0], ok: !!mi.extra[1](a, ctx) } : null;
    return { res, extra, cumple: res.every((r) => r.ok), metros: ctx.metros(a) };
  }

  // ---------------------------------------------------------------- misiones
  #empezarMision() {
    const mi = this.mision;
    this.candidatos = [];
    this.uso = { pista: false, intentos: 0 };
    const p = this.aerea.pos();
    this.origen = p.z > PLANO.z1 - 0.3 ? { x: 0.5, z: PLANO.z1 - 0.6, piso: 1 } : { x: p.x, z: p.z, piso: p.piso };
    this.campos = camposDesde(this.origen);
    this.cacheMejor = null;
    this.#asegurarSolucion();
    this.esc.marcar({ elegido: null });
    this.inspeccion = null;
    this.#pintar();
    H.banner(`Misión ${this.i + 1}: ${mi.cliente}`, 'info', mi.texto.replace(/<[^>]+>/g, ''), 5200);
  }

  // si en este momento ningún asiento cumple, alguien se levanta de uno que sí (la misión siempre tiene solución)
  #asegurarSolucion() {
    const mi = this.mision;
    let ctx = this.#ctx();
    if (this.b.asientos.some((a) => this.#evaluar(a, ctx).cumple)) return;
    const estaticas = mi.condiciones.filter(([t]) => t !== 'Libre ahora');
    if (mi.id === 'grupo') {
      const mesas = PLANO.mesas.filter((x) => !x.asientos[0].piloto).sort((x, y) => (y.asientos[0].zona === 'grupo') - (x.asientos[0].zona === 'grupo'));
      const mesa = mesas.find((x) => (ctx.libresMesa.get(x.id) || 0) >= 1) || mesas[0];
      let n = ctx.libresMesa.get(mesa.id) || 0;
      for (const a of mesa.asientos) if (n < 3 && this.b.get(a.id).ocupado && this.m.levantarDe(a.id, true)) n++;
      return;
    }
    const cand = this.b.asientos.filter((a) => a.ocupado && !a.estudiante && estaticas.every(([, f]) => f(a, ctx)));
    if (cand.length) this.m.levantarDe(cand[Math.floor(Math.random() * cand.length)].id, true);
  }

  #accion(a) {
    if (a === 'siguiente') this.#siguiente();
    else if (a === 'comparar') this.comparar();
    else if (a === 'mapa') this.abrirMapa(false);
    else if (a === 'pista') this.abrirMapa(true);
    else if (a?.startsWith('quitar:')) { this.candidatos = this.candidatos.filter((c) => c.id !== a.slice(7)); this.#pintar(); }
  }

  #alternarCandidato(a) {
    if (!a) return;
    const i = this.candidatos.findIndex((c) => c.id === a.id);
    if (i >= 0) { this.candidatos.splice(i, 1); this.son.clic(); }
    else {
      if (this.candidatos.length >= 3) { this.son.error(); H.banner('Ya tienes 3 candidatos', 'info', 'Compáralos (C) o quita uno desde la tarjeta.', 2600); return; }
      this.candidatos.push(a);
      this.son.seleccion();
      const ev = this.#evaluar(a);
      H.banner(`Candidato ${this.candidatos.length}: ${a.id}`, ev.cumple ? 'ok' : 'info', ev.res.map((r) => `${r.ok ? '✓' : '✕'} ${r.t}`).join(' · '), 2600);
    }
    this.esc.marcar({ elegido: this.candidatos[this.candidatos.length - 1]?.id || null });
    this.#pintar();
  }

  abrirMapa(conPista) {
    if (this.app.mapaJuego.abierto) { this.app.mapaJuego.cerrar(); return; }
    if (conPista && !this.uso.pista) { this.uso.pista = true; H.banner('Pista', 'info', 'El mapa atenúa los asientos que no cumplen. Esta misión vale como máximo 2 ★.', 3200); }
    const p = this.aerea.pos();
    this.app.mapaJuego.abrir({
      piso: this.mision.filtros.piso || (p.z > PLANO.z1 ? 1 : p.piso),
      titulo: conPista ? 'Pista: asientos que cumplen' : 'Mapa', ayuda: 'Clic: marcar candidato',
      pos: p.z > PLANO.z1 ? null : p, filtros: conPista ? this.mision.filtros : {},
      elegido: this.candidatos[this.candidatos.length - 1]?.id || null,
      alElegir: (id) => this.#alternarCandidato(this.b.get(id)),
    });
  }

  alternarVista() {
    this.aerea.alternar({ texto: 'Haz clic en un asiento para marcarlo como candidato. V para volver.' });
    H.mostrar({ mira: !this.aerea.activa, objetivo: true, kpis: true, minimapa: !this.aerea.activa, barraAcciones: true });
    this.app.actualizarPistas();
  }

  // ---------------------------------------------------------------- inspección
  describir(h) {
    const info = describirObjeto(this.app, h);
    if (!info) return null;
    if (h.tipo === 'asiento') {
      const ev = this.#evaluar(info.a);
      this.inspeccion = { a: info.a, ev };
      const marcado = this.candidatos.some((c) => c.id === info.a.id);
      info.detalle = ev.res.map((r) => `${r.ok ? '✓' : '✕'} ${r.t}`).join(' · ') + (ev.extra ? ` · ${ev.extra.ok ? '✓' : '○'} ${ev.extra.t}` : '') + ` · ${Math.round(ev.metros)} m`;
      info.accion = marcado ? 'E · Quitar de candidatos' : 'E · Marcar como candidato';
      info.alerta = !ev.cumple;
    } else if (h.tipo === 'mesa') {
      const l = this.b.asientos.filter((a) => a.mesa === h.id && this.b.estadoDe(a) === 'libre').length;
      info.detalle = `${l} libres · ${NOMBRE_ZONA[PLANO.mesas.find((x) => x.id === h.id).asientos[0].zona]}`;
    }
    return info;
  }

  interactuar(h) {
    if (this.sentado) return;
    if (h?.tipo === 'asiento') this.#alternarCandidato(this.b.get(h.id));
    else if (h?.tipo === 'mesa') {
      const libres = this.b.asientos.filter((a) => a.mesa === h.id && this.b.estadoDe(a) === 'libre');
      if (libres.length) this.#alternarCandidato(libres[0]);
    }
  }

  alClic(h) { if (h?.tipo === 'asiento') this.#alternarCandidato(this.b.get(h.id)); }

  // ---------------------------------------------------------------- comparar y decidir
  comparar() {
    if (!this.candidatos.length) { this.son.error(); H.banner('Sin candidatos', 'info', 'Mira un asiento y pulsa E para marcarlo (hasta 3).', 2600); return; }
    const mi = this.mision;
    const ctx = this.#ctx();
    const filas = this.candidatos.map((a) => ({ a, ev: this.#evaluar(a, ctx) }));
    const cols = mi.condiciones.map(([t]) => t).concat(mi.extra ? [mi.extra[0] + ' (extra)'] : []);
    H.resultado(`
      <h2>${mi.icono} Compara tus candidatos</h2>
      <p class="nota" style="margin:0">${mi.texto}</p>
      <table class="candidatos">
        <tr><th>Asiento</th>${cols.map((c) => `<th>${c}</th>`).join('')}<th>Distancia</th><th></th></tr>
        ${filas.map(({ a, ev }) => `<tr><td><b>${a.id}</b><br><small>${NOMBRE_ZONA[a.zona]} · ${nivelDe(a.piso)}</small></td>${ev.res.map((r) => `<td class="${r.ok ? 'ok' : 'no'}">${r.ok ? '✓' : '✕'}</td>`).join('')}${ev.extra ? `<td class="${ev.extra.ok ? 'ok' : ''}">${ev.extra.ok ? '✓' : '—'}</td>` : ''}<td>${Math.round(ev.metros)} m</td><td><button data-elegir="${a.id}" class="${ev.cumple ? 'primario' : ''}">Elegir</button></td></tr>`).join('')}
      </table>
      <div class="fila"><button data-r="seguir">Seguir investigando</button></div>`,
    (r) => r.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.elegir) this.#decidir(this.b.get(b.dataset.elegir));
      else if (b.dataset.r === 'seguir') H.cerrarResultado();
    }));
  }

  #decidir(a) {
    const mi = this.mision;
    const ctx = this.#ctx();
    const ev = this.#evaluar(a, ctx);
    this.uso.intentos++;
    if (!ev.cumple) {
      this.son.error();
      const falta = ev.res.filter((r) => !r.ok).map((r) => r.t.toLowerCase()).join(', ');
      H.banner(`${a.id} no sirve`, 'alerta', `No cumple: ${falta}.`, 3800);
      H.resultado(`<h2>Ese no sirve</h2><p class="nota">El asiento <b>${a.id}</b> no cumple: ${falta}. ${mi.cliente === 'Tú' ? '' : `${mi.cliente} no estaría conforme.`}</p><div class="fila"><button class="primario" data-r="seguir">Seguir investigando</button></div>`,
        (r) => r.addEventListener('click', (e) => { if (e.target.closest('[data-r]')) H.cerrarResultado(); }));
      return;
    }
    // la mejor opción posible en este momento (desde donde empezó la misión)
    let mejor = null;
    for (const s of this.b.asientos) {
      const e2 = this.#evaluar(s, ctx);
      if (!e2.cumple || (mi.extra && !e2.extra.ok && ev.extra?.ok)) continue;
      if (!mejor || e2.metros < mejor.metros) mejor = { a: s, metros: e2.metros };
    }
    const relacion = mejor ? ev.metros / Math.max(1, mejor.metros) : 1;
    let n = relacion <= 1.3 ? 3 : relacion <= 2 ? 2 : 1;
    if (mi.extra && !ev.extra.ok) n = Math.min(n, 2);
    if (this.uso.pista) n = Math.min(n, 2);
    if (this.uso.intentos > 1) n = Math.max(1, n - 1);
    this.estrellas[this.i] = n;
    this.son.exito();
    const cliente = mi.cliente !== 'Tú' ? this.#enviarCliente(a) : 0;
    H.banner(`¡Misión cumplida! ${'★'.repeat(n)}${'☆'.repeat(3 - n)}`, 'ok', `${a.id} a ${Math.round(ev.metros)} m${mejor && mejor.a.id !== a.id ? ` · la mejor era ${mejor.a.id} (${Math.round(mejor.metros)} m)` : ' · ¡la mejor opción!'}`, 5200);
    const ultima = this.i === MISIONES.length - 1;
    H.resultado(`
      <h2>${mi.icono} ¡Misión cumplida!</h2>
      ${H.estrellas(n)}
      <p style="margin:0">${mi.cliente === 'Tú' ? 'Elegiste' : `${mi.cliente} se sienta en`} <b>${a.id}</b> · ${NOMBRE_ZONA[a.zona]} · ${nivelDe(a.piso)} · ${Math.round(ev.metros)} m</p>
      ${cliente ? `<p class="nota" style="margin:0">${mi.cliente} ${cliente > 1 ? 'vienen' : 'viene'} desde la plaza: cruzará${cliente > 1 ? 'n' : ''} el sensor S1 y la cámara de la mesa ${a.mesa} confirmará el asiento.</p>` : ''}
      <p class="nota">${mejor && mejor.a.id !== a.id ? `La mejor opción en este momento era <b>${mejor.a.id}</b>, a ${Math.round(mejor.metros)} m.` : '¡Era la mejor opción posible en este momento!'} ${mi.extra && !ev.extra.ok ? `(Faltó el extra: ${mi.extra[0].toLowerCase()}.)` : ''} ${this.uso.pista ? 'Usaste la pista: máximo 2 ★.' : ''}</p>
      <p class="mini">3 ★: cumple todo y está a menos de 1,3 veces la distancia de la mejor opción. Cada intento fallido resta una estrella.</p>
      <div class="fila"><button class="primario" data-r="sig">${ultima ? 'Ver el resumen' : 'Siguiente misión'}</button>${mi.cliente === 'Tú' && this.m.puedeOcuparJugador(a.id) ? '<button data-r="sentar">Sentarme aquí y mirar</button>' : ''}</div>`,
    (r) => r.addEventListener('click', (e) => {
      const d = e.target.closest('[data-r]')?.dataset.r;
      if (d === 'sig') { H.cerrarResultado(); this.#siguiente(); }
      else if (d === 'sentar') { H.cerrarResultado(); this.#sentarYMirar(a); }
    }));
  }

  // el estudiante de la misión llega de verdad: entra por S1, camina y se sienta
  #enviarCliente(a) {
    if (this.mision.id === 'grupo') {
      const libres = this.b.asientos.filter((s) => s.mesa === a.mesa && this.b.estadoDe(s) === 'libre').slice(0, 3);
      libres.forEach((s, k) => this.m.pendientes.push({ en: k * 0.5, llegada: true, fn: () => this.m.llegar({ preferir: s.id, forzar: true }) }));
      return libres.length;
    }
    this.m.llegar({ preferir: a.id, forzar: true });
    return 1;
  }

  #sentarYMirar(a) {
    if (this.b.estadoDe(a) !== 'libre' || !this.m.puedeOcuparJugador(a.id)) return;
    this.sentado = a;
    this.m.ocuparPorJugador(a.id);
    this.esc.marcar({ tuyo: a.id, elegido: null });
    if (this.aerea.activa) { this.aerea.activa = false; this.esc.restaurarVisibilidad(); this.b3d.avatar.visible = false; }
    this.j.sentarEn(a);
    this.son.sentarse();
    H.banner(`Sentado en ${a.id}`, 'ok', 'Pulsa C o el botón para seguir con la siguiente misión.', 3600);
    this.#pintar();
  }

  #siguiente() {
    if (this.sentado) {
      const a = this.sentado;
      this.sentado = null;
      this.m.liberarPorJugador(a.id);
      this.esc.marcar({ tuyo: null });
      const x = a.x, z = a.z + (a.mira > 0 ? -0.75 : 0.75);
      this.j.iniciar({ x, z, piso: a.piso, rumbo: a.mira > 0 ? 0 : Math.PI, velocidad: 1.75, conservar: true });
    }
    if (this.i >= MISIONES.length - 1) {
      this.#resumen();
      const total = this.estrellas.reduce((s, x) => s + (x || 0), 0);
      H.banner('Caso cerrado', 'ok', `${total} de ${MISIONES.length * 3} estrellas en las 5 misiones.`, 6000);
      return;
    }
    this.i++;
    this.#empezarMision();
  }

  #resumen() {
    const total = this.estrellas.reduce((s, x) => s + (x || 0), 0);
    H.resultado(`
      <h2>🔎 Caso cerrado</h2>
      ${H.estrellas(Math.round(total / MISIONES.length))}
      <ul class="mision-lista">${MISIONES.map((mi, k) => `<li><span>${mi.icono} ${mi.cliente}</span><span class="est">${'★'.repeat(this.estrellas[k] || 0)}${'☆'.repeat(3 - (this.estrellas[k] || 0))}</span></li>`).join('')}</ul>
      <p class="nota">${total} de ${MISIONES.length * 3} estrellas. Lo que hiciste es lo que el sistema automatiza: saber qué asientos están libres, dónde están y cuáles cumplen lo que cada estudiante necesita.</p>
      <div class="fila"><button class="primario" data-r="otra">Jugar otra vez</button><button data-r="caos">Probar Caos</button><button data-r="menu">Otras experiencias</button></div>`,
    (r) => r.addEventListener('click', (e) => {
      const d = e.target.closest('[data-r]')?.dataset.r;
      if (d === 'otra') this.app.irModo('detective', { reiniciar: true });
      else if (d === 'caos') this.app.irModo('caos');
      else if (d === 'menu') this.app.irModo('menu');
    }));
  }

  // ---------------------------------------------------------------- tarjeta
  #pintar() {
    const mi = this.mision;
    if (this.sentado) {
      H.objetivo(`<h2>${mi.icono} Misión ${this.i + 1} cumplida</h2><p>Estás sentado en <b>${this.sentado.id}</b>: mira cómo la biblioteca sigue llenándose y vaciándose a tu alrededor.</p><div class="fila"><button data-a="siguiente" class="primario">${this.i >= MISIONES.length - 1 ? 'Ver el resumen' : 'Siguiente misión'} (C)</button></div>`);
      return;
    }
    const ctx = this.#ctx();
    const ins = this.inspeccion;
    const cond = (ins ? this.#evaluar(ins.a, ctx) : null);
    const lista = mi.condiciones.map(([t], k) => `<li class="${cond ? (cond.res[k].ok ? 'ok' : 'no') : ''}">${t}</li>`).join('') + (mi.extra ? `<li class="${cond?.extra?.ok ? 'ok' : ''}">${mi.extra[0]} <small>(extra)</small></li>` : '');
    const cands = this.candidatos.map((a) => { const ev = this.#evaluar(a, ctx); return `<span class="cand ${ev.cumple ? 'ok' : 'no'}">${a.id} · ${Math.round(ev.metros)} m <button data-a="quitar:${a.id}" title="Quitar">×</button></span>`; }).join('');
    const est = MISIONES.map((_, k) => (k < this.i ? '★'.repeat(this.estrellas[k] || 0).padEnd(3, '☆') : k === this.i ? '●' : '○')).join(' ');
    H.objetivo(`<h2>${mi.icono} Misión ${this.i + 1} de ${MISIONES.length} <small>${est}</small></h2>
      <p>${mi.texto}</p>
      <ul class="condiciones">${lista}</ul>
      ${ins ? `<p class="mini" style="margin:0">Mirando: <b>${ins.a.id}</b> · ${Math.round(cond.metros)} m</p>` : ''}
      <div class="candidatos-lista">${cands || '<span class="mini">Marca hasta 3 candidatos con <kbd>E</kbd>.</span>'}</div>
      <div class="fila"><button data-a="comparar" class="${this.candidatos.length ? 'primario' : ''}">Comparar (${this.candidatos.length})</button><button data-a="mapa">Mapa</button><button data-a="pista">Pista</button></div>`);
  }

  update(dt) {
    this.j.update(dt);
    if (!this.j.hover || this.j.hover.tipo !== 'asiento') this.inspeccion = null;
    const p = this.aerea.pos();
    this.app.minimapa.update(dt, { pos: p, rumbo: this.aerea.rumbo(), objetivo: this.candidatos?.[this.candidatos.length - 1] || null });
    this.app.mapaJuego.update(dt, { pos: p.z > PLANO.z1 ? null : p });
    this.tHud -= dt;
    if (this.tHud <= 0) { this.tHud = 0.3; H.kpis(this.app); this.#pintar(); }
  }

  // ---------------------------------------------------------------- visor
  asientoVR() { return this.sentado || null; }
  alSalirVR(pos) {
    if (this.sentado) this.j.sentarEn(this.sentado);
    else if (pos) this.j.iniciar({ ...pos, velocidad: 1.75, conservar: true });
  }
  textoA() { return this.sentado || this.estrellas[this.i] ? 'Siguiente misión' : 'Tablero'; }
  accionA() {
    if (this.sentado || this.estrellas[this.i]) { H.cerrarResultado(); this.#siguiente(); return; }
    if (this.app.vr?.presentando) this.app.vr.mostrarTablero(); else this.comparar();
  }
  botonesVR() {
    if (this.sentado || this.estrellas[this.i]) return [{ id: 'dt-sig', texto: this.i >= MISIONES.length - 1 ? 'Ver el resumen' : 'Siguiente misión', fn: () => { H.cerrarResultado(); this.#siguiente(); } }];
    const ctx = this.#ctx();
    return this.candidatos.map((a) => { const ev = this.#evaluar(a, ctx); return { id: 'dt-' + a.id, texto: `Elegir ${a.id} ${ev.res.map((r) => (r.ok ? '✓' : '✕')).join('')} · ${Math.round(ev.metros)} m`, fn: () => this.#decidir(a) }; })
      .concat([{ id: 'dt-limpiar', texto: 'Quitar candidatos', fn: () => { this.candidatos = []; this.#pintar(); }, deshabilitado: !this.candidatos.length }]);
  }
  lineasVR() {
    const mi = this.mision;
    return [`MISIÓN ${this.i + 1}/${MISIONES.length} · ${mi.cliente}`, mi.texto.replace(/<[^>]+>/g, '').slice(0, 70), `Candidatos: ${this.candidatos.map((a) => a.id).join(', ') || 'ninguno'} · gatillo: marcar`];
  }
  interactuarVR(h) { this.interactuar(h); }
  get yPisoActual() { return yPiso(this.j.nivel); }
}
