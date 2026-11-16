// Mesa piloto 1-01 ↔ maqueta física. Con datos reales (USB o código de sala), sus cuatro
// asientos muestran lo que reporta la ESP32-CAM (zonas A1–A4). En simulación, la mesa la
// maneja el simulador como a las demás. Nunca se mezcla: cada asiento dice su origen.
import { PLANO } from './plano.js';

export function enlazarPiloto({ estadoMaqueta, estadoBiblio, fuentes }) {
  const asientos = PLANO.mesaPiloto.asientos;
  const aplicar = () => {
    const real = fuentes.enVivo || fuentes.modo === 'espera';
    estadoBiblio.pilotoReal = real;
    if (!real) {
      for (const a of asientos) {
        const s = estadoBiblio.get(a.id);
        if (s.sinDato) estadoBiblio.fijar(a.id, false, { silencioso: true });
        s.origen = 'sim';
      }
      return;
    }
    const cam = estadoMaqueta.camara;
    asientos.forEach((a, i) => {
      const z = cam.asientos[i];
      if (!cam.conocida || !z || z.ocupado === null) estadoBiblio.marcarSinDato(a.id);
      else estadoBiblio.fijar(a.id, z.ocupado, { origen: 'real' });
    });
  };
  estadoMaqueta.on('asientos', aplicar);
  estadoMaqueta.on('reinicio', aplicar);
  fuentes.on('modo', aplicar);
  aplicar();
  return aplicar;
}
