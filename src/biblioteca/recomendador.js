// Recomendador: ordena los asientos libres por distancia a pie y preferencias.
// Usa campos de distancia (Dijkstra) por piso, así evalúa cientos de asientos al instante.
import { PLANO, campoDistancias, accesoAsiento, NOMBRE_ZONA } from './plano.js';

const ESCALERA_M = 12.5;   // largo aproximado de la escalera en U

export function camposDesde(origen) {
  const E = PLANO.escalera;
  const campos = {};
  campos[origen.piso] = { campo: campoDistancias(origen.piso, origen.x, origen.z), extra: 0 };
  const otro = origen.piso === 1 ? 2 : 1;
  const pA = origen.piso === 1 ? E.portal1 : E.portal2;
  const pB = origen.piso === 1 ? E.portal2 : E.portal1;
  const hastaPortal = campos[origen.piso].campo.distancia(pA.x, pA.z);
  campos[otro] = { campo: campoDistancias(otro, pB.x, pB.z), extra: hastaPortal + ESCALERA_M };
  return campos;
}

export function distanciaAsiento(campos, a) {
  const c = campos[a.piso];
  const acc = accesoAsiento(a);
  return c.campo.distancia(acc.x, acc.z) + c.extra + 0.8;
}

// ¿Cumple el asiento los filtros elegidos? (zona, ventana, enchufe, grupo de n en la misma mesa)
export function cumpleFiltros(a, filtros = {}, libresMesa = 4) {
  if (filtros.piso && a.piso !== filtros.piso) return false;
  if (filtros.zona && a.zona !== filtros.zona) return false;
  if (filtros.ventana && !a.ventana) return false;
  if (filtros.enchufe && !a.enchufe) return false;
  if (filtros.grupo > 1 && libresMesa < filtros.grupo) return false;
  return true;
}

export function libresPorMesa(estado) {
  const m = new Map();
  for (const a of estado.asientos) if (!a.ocupado && !a.sinDato) m.set(a.mesa, (m.get(a.mesa) || 0) + 1);
  return m;
}

// filtros: { piso, zona: 'silencio'|'grupo'|'general'|null, ventana, enchufe, grupo: n }
export function recomendar(estado, origen, { preferencias = {}, k = 5, campos = null } = {}) {
  campos ||= camposDesde(origen);
  const p = preferencias;
  const porMesa = libresPorMesa(estado);
  const candidatos = [];
  for (const a of estado.asientos) {
    if (a.ocupado || a.sinDato) continue;
    const libresMesa = porMesa.get(a.mesa) || 0;
    if (!cumpleFiltros(a, p, libresMesa)) continue;
    const metros = distanciaAsiento(campos, a);
    if (!Number.isFinite(metros)) continue;
    const razones = [];
    let costo = metros;
    if (a.zona === 'silencio' || a.zona === 'grupo') razones.push(NOMBRE_ZONA[a.zona]);
    if (a.piloto) razones.push('mesa piloto');
    if (a.ventana) { costo -= 2; razones.push('junto a la ventana'); }
    if (a.enchufe) razones.push('con enchufe');
    if (libresMesa === 4) { costo -= 1.5; razones.push('mesa vacía'); }
    else if (p.grupo > 1) razones.push(`${libresMesa} libres en la mesa`);
    candidatos.push({ asiento: a, metros, segundos: metros / 1.25, costo, razones });
  }
  candidatos.sort((x, y) => x.costo - y.costo);
  // como mucho dos asientos por mesa en la lista, para dar variedad
  const vistos = new Map();
  const out = [];
  for (const c of candidatos) {
    const n = vistos.get(c.asiento.mesa) || 0;
    if (n >= (p.grupo > 1 ? 1 : 2)) continue;
    vistos.set(c.asiento.mesa, n + 1);
    out.push(c);
    if (out.length >= k) break;
  }
  return out;
}

// Qué piso conviene: más asientos libres, con poca diferencia de caminata
export function recomendarPiso(estado) {
  const l1 = estado.libres(1), l2 = estado.libres(2);
  const t1 = estado.total(1), t2 = estado.total(2);
  if (l1 === 0 && l2 === 0) return { piso: null, texto: 'No hay asientos libres en este momento. Puedes esperar en el vestíbulo: el tótem avisa cuando se libere uno.' };
  if (l1 === 0) return { piso: 2, texto: `El piso 1 está lleno. En el sótano hay ${l2} asientos libres.` };
  if (l2 === 0) return { piso: 1, texto: `El sótano está lleno. En el piso 1 hay ${l1} asientos libres.` };
  const o1 = 1 - l1 / t1, o2 = 1 - l2 / t2;
  if (l2 >= l1 * 1.6 && o1 > 0.8) return { piso: 2, texto: `Sótano: tiene ${l2} asientos libres frente a ${l1} del piso 1 y una zona de silencio.` };
  if (l1 >= 3 && o1 <= o2) return { piso: 1, texto: `Piso 1: tiene ${l1} asientos libres y no necesitas bajar.` };
  return l2 > l1 ? { piso: 2, texto: `Sótano: tiene más asientos libres (${l2}).` } : { piso: 1, texto: `Piso 1: tiene ${l1} asientos libres cerca de la entrada.` };
}
