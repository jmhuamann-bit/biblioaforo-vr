// Calibración del Meta Quest 3 con el sensor S1 real.
//
// El visor conoce la posición de la cabeza y de los controles en su propio espacio (metros reales,
// con el piso en y = 0). El sensor E18-D80NK solo dice "alguien pasó" (detecta de ~3 a 80 cm), así
// que la DISTANCIA al sensor sale del seguimiento 6DoF del visor, no del sensor.
//
// Calibrar es encontrar el giro θ y el desplazamiento del "rig" (el grupo que lleva la cámara y los
// controles) para que el punto del sensor real caiga exactamente en el sensor S1 virtual y que
// caminar hacia el sensor real sea caminar hacia la puerta de ENTRADA de la biblioteca virtual:
//
//   mundo = rig.position + R_y(θ) · local        con  R_y(θ)·(x, z) = (x cosθ + z sinθ, −x sinθ + z cosθ)
//   rig.position = V_s − R_y(θ) · P_s           (P_s: sensor en el espacio del visor · V_s: sensor virtual)
//
// Dos maneras:
//   · Rápida (1 punto): de pie en el punto de partida, mirando al sensor que está a 2 m → A.
//   · Precisa (2 puntos): tocar el sensor con la punta del control derecho (gatillo) y volver al punto
//     de partida (A). La distancia que se muestra es la medida de verdad.
import { PLANO } from '../biblioteca/plano.js';

const E = PLANO.puertas.entrada;
// Sensor S1 virtual: centro de la puerta de ENTRADA, sobre la línea de la fachada
export const SENSOR_VIRTUAL = { x: (E.x0 + E.x1) / 2, z: E.z };
// Entrar a la biblioteca es caminar hacia −z (rumbo 0 en la convención de la app)
const RUMBO_ENTRAR = 0;
export const DISTANCIA_INICIO = 2;

// Rumbo de un vector horizontal (0 = hacia −z, positivo = girando a la izquierda)
export const rumboDe = (dx, dz) => Math.atan2(-dx, -dz);
const normalizar = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Rumbo de la cabeza en el espacio del visor a partir del cuaternión local de la cámara
export function rumboLocal(q) {
  // vector (0,0,-1) girado por q, solo x y z
  const x = -2 * (q.x * q.z + q.w * q.y);
  const z = -(1 - 2 * (q.x * q.x + q.y * q.y));
  return rumboDe(x, z);
}

function desdeSensor(Ps, theta, V, extra) {
  const c = Math.cos(theta), s = Math.sin(theta);
  const rx = Ps.x * c + Ps.z * s;
  const rz = -Ps.x * s + Ps.z * c;
  return { theta: normalizar(theta), x: V.x - rx, z: V.z - rz, sensorLocal: { x: Ps.x, z: Ps.z }, ...extra, t: Date.now() };
}

// Rápida: P0 = cabeza en el espacio del visor, r = rumbo de la cabeza (mirando al sensor)
export function calibrarRapida(P0, r, distancia = DISTANCIA_INICIO, V = SENSOR_VIRTUAL) {
  const Ps = { x: P0.x - Math.sin(r) * distancia, z: P0.z - Math.cos(r) * distancia };
  return desdeSensor(Ps, RUMBO_ENTRAR - r, V, { metodo: 'rapida', distancia, inicioLocal: { x: P0.x, z: P0.z } });
}

// Precisa: Ps = punta del control tocando el sensor, P0 = cabeza en el punto de partida
export function calibrarDosPuntos(P0, Ps, V = SENSOR_VIRTUAL) {
  const dx = Ps.x - P0.x, dz = Ps.z - P0.z;
  const distancia = Math.hypot(dx, dz);
  if (distancia < 0.6) { const e = new Error('Muy cerca del sensor: retrocede al menos 1 m y vuelve a pulsar A.'); e.codigo = 'cerca'; throw e; }
  if (distancia > 8) { const e = new Error('El punto de partida está a más de 8 m del sensor: revisa el área de juego.'); e.codigo = 'lejos'; throw e; }
  return desdeSensor(Ps, RUMBO_ENTRAR - rumboDe(dx, dz), V, { metodo: 'precisa', distancia, inicioLocal: { x: P0.x, z: P0.z } });
}

// Espacio del visor → mundo de la biblioteca
export function aMundo(cal, p) {
  const c = Math.cos(cal.theta), s = Math.sin(cal.theta);
  return { x: cal.x + p.x * c + p.z * s, z: cal.z - p.x * s + p.z * c };
}

// Distancia horizontal real de la cabeza al sensor (metros)
export function distanciaAlSensor(cal, cabezaLocal) {
  return Math.hypot(cabezaLocal.x - cal.sensorLocal.x, cabezaLocal.z - cal.sensorLocal.z);
}

// Distancia en el escritorio (sin visor): de la cámara al sensor virtual
export function distanciaEscritorio(pos, V = SENSOR_VIRTUAL) {
  return Math.hypot(pos.x - V.x, pos.z - V.z);
}

// ¿La cabeza ya cruzó la línea de la puerta en el mundo virtual?
export function cruzoLinea(puntoMundo, V = SENSOR_VIRTUAL) { return puntoMundo.z < V.z; }

// Aplica la calibración al rig (se llama cada cuadro mientras dura la aproximación: así el stick,
// el giro y el teletransporte no la desarman)
export function aplicarAlRig(rig, cal) {
  rig.scale.setScalar(1);
  rig.rotation.set(0, cal.theta, 0);
  rig.position.set(cal.x, cal.y || 0, cal.z);
  rig.updateMatrixWorld(true);
}

export function textoMetros(d) {
  if (d == null || !Number.isFinite(d)) return '–';
  return `${d.toFixed(2).replace('.', ',')} m`;
}
