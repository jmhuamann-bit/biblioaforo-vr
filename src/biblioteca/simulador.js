// Simulador del día en la biblioteca: llegadas, salidas y asientos que se ocupan y liberan,
// con las dos horas punta del informe (14:00–15:30 y 17:00–18:30). Todo lo que produce
// es "simulado": la única fuente real posible es la mesa piloto (la maqueta).
import { PLANO } from './plano.js';

// fracción de asientos ocupados según la hora (perfil referencial)
const PERFIL = [
  [7.5, 0], [8, 0.08], [9, 0.27], [10, 0.5], [11, 0.66], [12, 0.62], [13, 0.57], [13.75, 0.74],
  [14.25, 0.93], [15.5, 0.9], [16.25, 0.73], [17, 0.86], [17.75, 0.95], [18.5, 0.9], [19.5, 0.65],
  [20.5, 0.41], [21.5, 0.16], [22, 0],
];
const interpolar = (h) => {
  if (h <= PERFIL[0][0]) return 0;
  for (let i = 1; i < PERFIL.length; i++) {
    const [h1, v1] = PERFIL[i];
    if (h <= h1) { const [h0, v0] = PERFIL[i - 1]; return v0 + (v1 - v0) * ((h - h0) / (h1 - h0)); }
  }
  return 0;
};
const enPunta = (h) => (h >= 14 && h <= 15.5) || (h >= 17 && h <= 18.5);

function poisson(l) {
  if (l <= 0) return 0;
  if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss()));
  const L = Math.exp(-l); let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}
function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

export const ESCENARIOS = {
  tranquila: { nombre: 'Mañana tranquila', hora: 9 + 40 / 60, factor: 1, objetos: 0.02 },
  punta14: { nombre: 'Hora punta 14:00', hora: 14 + 20 / 60, factor: 1, objetos: 0.03 },
  punta17: { nombre: 'Hora punta 17:30', hora: 17 + 40 / 60, factor: 1, objetos: 0.03 },
  examenes: { nombre: 'Semana de exámenes', hora: 15, factor: 1.1, objetos: 0.04 },
  mochilas: { nombre: 'Mochilas apartando sitios', hora: 14 + 20 / 60, factor: 1, objetos: 0.14 },
  cierre: { nombre: 'Cierre', hora: 21 + 35 / 60, factor: 1, objetos: 0.02 },
};

export class SimuladorBiblioteca {
  constructor(estado) {
    this.e = estado;
    this.velocidad = 1;          // minutos simulados por minuto real
    this.pausa = false;
    this.estancia = 95;          // minutos sentado, en promedio
    this.escenario = 'punta14';
    this.factor = 1;
    this.probObjeto = 0.03;
    this.tMuestra = 0;
  }

  // ------------------------------------------------------------ modelo
  objetivoSentados(h = this.e.minuto / 60) {
    return Math.min(0.99, interpolar(h) * this.factor) * this.dominio().length;
  }
  fraccionNoSentados(h) { return enPunta(h) ? 0.12 : 0.07; }
  // asientos que maneja el simulador (la mesa piloto sale cuando hay datos reales; el del estudiante no se toca)
  dominio() { return this.e.asientos.filter((a) => !(a.piloto && this.e.pilotoReal)); }
  disponiblesSim() { return this.dominio().filter((a) => !a.ocupado && !a.sinDato); }
  ocupadosSim() { return this.dominio().filter((a) => a.ocupado && !a.estudiante); }

  #peso(a) {
    let w = 1;
    if (a.ventana) w *= 1.45;
    if (a.zona === 'silencio') w *= 1.2;
    if (a.enchufe) w *= 1.15;
    const vecinos = this.e.asientos.filter((x) => x.mesa === a.mesa && x.ocupado).length;
    w *= [1.35, 1.0, 0.9, 0.75][vecinos] ?? 0.7;
    return w;
  }
  #elegirLibre() {
    const libres = this.disponiblesSim();
    if (!libres.length) return null;
    let total = 0;
    const pesos = libres.map((a) => { const w = this.#peso(a); total += w; return w; });
    let r = Math.random() * total;
    for (let i = 0; i < libres.length; i++) { r -= pesos[i]; if (r <= 0) return libres[i]; }
    return libres[libres.length - 1];
  }

  // ------------------------------------------------------------ escenarios
  iniciarDia(clave = this.escenario) {
    const esc = ESCENARIOS[clave] || ESCENARIOS.punta14;
    this.escenario = clave;
    this.factor = esc.factor;
    this.probObjeto = esc.objetos;
    const e = this.e;
    e.minuto = Math.round(esc.hora * 60);
    for (const a of this.dominio()) if (!a.estudiante) e.fijar(a.id, false, { silencioso: true });
    const h = esc.hora;
    const objetivo = Math.round(this.objetivoSentados(h));
    for (let k = 0; k < objetivo; k++) {
      const a = this.#elegirLibre(); if (!a) break;
      e.fijar(a.id, true, { objeto: Math.random() < this.probObjeto * 0.6, silencioso: true });
    }
    // puertas coherentes: dentro = entradas − salidas
    const sentados = e.sentados();
    const dentro = Math.min(PLANO.aforo, Math.round(sentados * (1 + this.fraccionNoSentados(h))));
    let salidas = 0;
    for (let t = 8; t < h; t += 1 / 6) salidas += (this.objetivoSentados(t) / this.estancia) * 10 * 1.1;
    salidas = Math.round(salidas);
    e.puertas = { dentro, entradas: dentro + salidas, salidas, aforo: PLANO.aforo };
    // historial del día hasta ahora (cada 10 min)
    e.historial = [];
    for (let t = 8; t <= h + 1e-6; t += 1 / 6) {
      const s = Math.round(this.objetivoSentados(t) * (1 + gauss() * 0.015));
      e.historial.push({ min: Math.round(t * 60), dentro: Math.round(s * (1 + this.fraccionNoSentados(t))), ocupados: s, libres1: null, libres2: null });
    }
    e.muestra();
    e.version++;
    e.log('escenario', `Escenario: ${esc.nombre} (${e.hora()})`);
    e.emit('reinicio');
  }

  // ------------------------------------------------------------ acciones manuales (administración)
  entran(n = 10) {
    const e = this.e;
    const cupo = Math.max(0, PLANO.aforo - e.puertas.dentro);
    const k = Math.min(n, cupo);
    if (k <= 0) { e.log('aforo', 'Aforo completo: no entra nadie más'); return 0; }
    e.entrar(k);
    let sentados = 0;
    for (let i = 0; i < k; i++) if (Math.random() < 0.8) { const a = this.#elegirLibre(); if (a) { e.fijar(a.id, true); sentados++; } }
    e.log('entrada', `Entraron ${k} personas (${sentados} encontraron asiento)`);
    return k;
  }
  salen(n = 10) {
    const e = this.e;
    const k = Math.min(n, e.puertas.dentro);
    const ocupados = this.ocupadosSim().filter((a) => !a.objeto);
    const deAsiento = Math.min(Math.round(k * 0.6), ocupados.length, k);
    for (let i = 0; i < deAsiento; i++) {
      const j = Math.floor(Math.random() * ocupados.length);
      e.fijar(ocupados.splice(j, 1)[0].id, false);
    }
    e.salir(k);
    e.log('salida', `Salieron ${k} personas (${deAsiento} dejaron su asiento)`);
  }
  ocuparAzar(n = 10) {
    const e = this.e;
    let k = 0;
    for (let i = 0; i < n; i++) { const a = this.#elegirLibre(); if (!a) break; e.fijar(a.id, true); k++; }
    const noSentados = e.puertas.dentro - e.sentados();
    if (noSentados < 0) e.entrar(-noSentados);
    e.log('ocupado', `${k} asientos ocupados al azar`);
  }
  liberarAzar(n = 10) {
    const e = this.e;
    const ocupados = this.ocupadosSim();
    let k = 0;
    for (let i = 0; i < n && ocupados.length; i++) { const j = Math.floor(Math.random() * ocupados.length); e.fijar(ocupados.splice(j, 1)[0].id, false); k++; }
    e.log('libre', `${k} asientos liberados al azar`);
  }
  llegadaMasiva() { this.entran(60); }

  // ------------------------------------------------------------ ciclo
  update(dtReal) {
    if (this.pausa) return;
    const e = this.e;
    const dt = (dtReal * this.velocidad) / 60;      // minutos simulados
    e.minuto += dt;
    if (e.minuto >= 22 * 60) { e.minuto = 22 * 60; this.pausa = true; e.log('escenario', 'La biblioteca cerró (22:00)'); }
    const h = e.minuto / 60;
    // objetos que vuelven a su dueño
    for (const a of e.asientos) if (a.objeto && a.objetoHasta && e.minuto > a.objetoHasta && !(a.piloto && e.pilotoReal)) { a.objetoHasta = 0; e.fijar(a.id, false); }
    // salidas de asientos
    const ocupados = this.ocupadosSim().filter((a) => !a.objeto);
    const S = ocupados.length;
    const objetivo = this.objetivoSentados(h);
    const d = poisson((S * dt) / this.estancia);
    let salidas = 0;
    for (let i = 0; i < d && ocupados.length; i++) {
      const a = ocupados.splice(Math.floor(Math.random() * ocupados.length), 1)[0];
      if (Math.random() < this.probObjeto) { e.fijar(a.id, true, { objeto: true }); a.objetoHasta = e.minuto + 15 + Math.random() * 30; }
      else e.fijar(a.id, false);
      salidas++;
    }
    // llegadas que buscan asiento (tienden al objetivo de la hora)
    const llegadasEsperadas = Math.max(0, (S * dt) / this.estancia + ((objetivo - S) * dt) / 5);
    let llegadas = poisson(llegadasEsperadas);
    const cupo = Math.max(0, PLANO.aforo - e.puertas.dentro + salidas);
    llegadas = Math.min(llegadas, cupo);
    for (let i = 0; i < llegadas; i++) { const a = this.#elegirLibre(); if (a) e.fijar(a.id, true); }
    // personas que no se sientan (buscan libros, hacen fila, están de paso)
    const P = e.puertas.dentro + llegadas - salidas;
    const noSentados = P - e.sentados();
    const objetivoNS = objetivo * this.fraccionNoSentados(h);
    const extraEntran = poisson(Math.max(0, objetivoNS - noSentados) * dt / 4 + dt * 0.15);
    const extraSalen = poisson(Math.max(0, noSentados - objetivoNS) * dt / 4 + dt * 0.15);
    const entran = Math.min(llegadas + extraEntran, Math.max(0, PLANO.aforo - e.puertas.dentro));
    const salen = Math.min(salidas + Math.min(extraSalen, Math.max(0, noSentados)), e.puertas.dentro + entran);
    if (entran) e.entrar(entran);
    if (salen) e.salir(salen);
    // nunca menos personas que asientos ocupados por personas
    const faltan = e.sentados() - e.puertas.dentro;
    if (faltan > 0) e.entrar(faltan);
    this.tMuestra += dt;
    if (this.tMuestra >= 1) { this.tMuestra = 0; e.muestra(); }
  }
}

export { interpolar as perfilOcupacion, enPunta };
