// Intérprete de las líneas que ya imprime BiblioAforo por el Monitor Serie.
// No requiere cambiar ningún programa: lee el CSV del ESP32 DevKit (Anexo A)
// y los mensajes de la ESP32-CAM (Anexo B).
//
//   ESP32 DevKit:  t_ms,sensor,evento,duracion_ms,entradas,salidas,dentro,led
//                  12034,S1_entrada,DETECTADO,,3,1,2,0
//                  12455,S1_entrada,LIBRE,421,3,1,2,0
//   ESP32-CAM:     51234 ms | Libres: 2/4 | A1:OCUPADO(46%) A2:libre(3%) A3:OCUPADO(38%) A4:libre(1%)
//                  Calibrado: referencia tomada con asientos vacios.

const RE_CSV = /^\s*(\d+)\s*,\s*([^,]*?)\s*,\s*(DETECTADO|LIBRE)\s*,\s*(-?\d*)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(-?\d+)\s*,\s*([01])\s*$/i;
const RE_CABECERA = /^\s*t_ms\s*,\s*sensor\s*,\s*evento/i;
const RE_LIBRES = /Libres:\s*(\d+)\s*\/\s*(\d+)/i;
const RE_ZONA = /A(\d+)\s*:\s*(OCUPADO|libre)\s*\(\s*(\d+(?:[.,]\d+)?)\s*%\s*\)/gi;
const RE_TIEMPO = /^\s*(\d+)\s*ms/i;
const RE_CALIBRADO = /calibrad/i;
const RE_IP = /https?:\/\/(\d{1,3}(?:\.\d{1,3}){3})/;

export function interpretarLinea(linea) {
  const l = String(linea ?? '').replace(/\r/g, '').trim();
  if (!l) return null;
  let m = RE_CSV.exec(l);
  if (m) {
    const nombre = m[2];
    return {
      tipo: 'contador',
      t_ms: Number(m[1]),
      sensor: /2|salida/i.test(nombre) ? 'S2' : 'S1',
      nombre,
      evento: m[3].toUpperCase(),
      duracion_ms: m[4] === '' ? null : Number(m[4]),
      entradas: Number(m[5]),
      salidas: Number(m[6]),
      dentro: Number(m[7]),
      led: Number(m[8]),
    };
  }
  if (RE_CABECERA.test(l)) return { tipo: 'cabecera' };
  m = RE_LIBRES.exec(l);
  if (m) {
    const asientos = [];
    for (const z of l.matchAll(RE_ZONA)) {
      asientos[Number(z[1]) - 1] = { ocupado: z[2].toUpperCase() === 'OCUPADO', pct: parseFloat(z[3].replace(',', '.')) };
    }
    const t = RE_TIEMPO.exec(l);
    return { tipo: 'camara', libres: Number(m[1]), total: Number(m[2]), asientos, t_ms: t ? Number(t[1]) : null };
  }
  if (RE_CALIBRADO.test(l)) return { tipo: 'calibrado' };
  const ip = RE_IP.exec(l);
  return { tipo: 'info', texto: l, ip: ip ? ip[1] : null };
}
