// Esqueleto: de los parámetros de una persona (dónde está, cuánto camina, si está sentada, qué
// hace con las manos, hacia dónde mira) a las 11 matrices de sus huesos, que van a una textura.
// Piernas y torso por cinemática directa (marcha con zancada, rodilla, cadera y contrabalanceo;
// sentarse ajustando el muslo a la altura de la silla). Brazos por cinemática inversa cuando la
// mano tiene que llegar a algo (teclado, cuaderno, celular, mentón, un estante).
import { PIVOTE } from './constantes.js';

const PI = Math.PI;
const mezclar = (a, b, t) => a + (b - a) * t;
const lim = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------ álgebra 3×3 (por filas)
function rx(a, o) { const c = Math.cos(a), s = Math.sin(a); o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0; o[4] = c; o[5] = -s; o[6] = 0; o[7] = s; o[8] = c; return o; }
function ry(a, o) { const c = Math.cos(a), s = Math.sin(a); o[0] = c; o[1] = 0; o[2] = s; o[3] = 0; o[4] = 1; o[5] = 0; o[6] = -s; o[7] = 0; o[8] = c; return o; }
function rz(a, o) { const c = Math.cos(a), s = Math.sin(a); o[0] = c; o[1] = -s; o[2] = 0; o[3] = s; o[4] = c; o[5] = 0; o[6] = 0; o[7] = 0; o[8] = 1; return o; }
const _m = new Float64Array(9);
function mul(a, b, o) {
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) _m[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  o.set(_m); return o;
}
function mulT(a, b, o) {   // o = a · bᵀ
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) _m[i * 3 + j] = a[i * 3] * b[j * 3] + a[i * 3 + 1] * b[j * 3 + 1] + a[i * 3 + 2] * b[j * 3 + 2];
  o.set(_m); return o;
}
// rotación alrededor de un eje (Rodrigues)
function ejeAngulo(x, y, z, a, o) {
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  o[0] = t * x * x + c; o[1] = t * x * y - s * z; o[2] = t * x * z + s * y;
  o[3] = t * x * y + s * z; o[4] = t * y * y + c; o[5] = t * y * z - s * x;
  o[6] = t * x * z - s * y; o[7] = t * y * z + s * x; o[8] = t * z * z + c;
  return o;
}
// marco con columnas (u, h ortogonalizado, u × h)
function marco(u, h, o) {
  const d = h[0] * u[0] + h[1] * u[1] + h[2] * u[2];
  let hx = h[0] - d * u[0], hy = h[1] - d * u[1], hz = h[2] - d * u[2];
  const l = Math.hypot(hx, hy, hz) || 1; hx /= l; hy /= l; hz /= l;
  const nx = u[1] * hz - u[2] * hy, ny = u[2] * hx - u[0] * hz, nz = u[0] * hy - u[1] * hx;
  o[0] = u[0]; o[1] = hx; o[2] = nx; o[3] = u[1]; o[4] = hy; o[5] = ny; o[6] = u[2]; o[7] = hz; o[8] = nz;
  return o;
}
// cuaterniones para mezclar dos rotaciones
function aQuat(m, q) {
  const m00 = m[0], m01 = m[1], m02 = m[2], m10 = m[3], m11 = m[4], m12 = m[5], m20 = m[6], m21 = m[7], m22 = m[8];
  const tr = m00 + m11 + m22;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); q[3] = 0.25 / s; q[0] = (m21 - m12) * s; q[1] = (m02 - m20) * s; q[2] = (m10 - m01) * s; }
  else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); q[3] = (m21 - m12) / s; q[0] = 0.25 * s; q[1] = (m01 + m10) / s; q[2] = (m02 + m20) / s; }
  else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); q[3] = (m02 - m20) / s; q[0] = (m01 + m10) / s; q[1] = 0.25 * s; q[2] = (m12 + m21) / s; }
  else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); q[3] = (m10 - m01) / s; q[0] = (m02 + m20) / s; q[1] = (m12 + m21) / s; q[2] = 0.25 * s; }
  return q;
}
function deQuat(q, m) {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y - z * w); m[2] = 2 * (x * z + y * w);
  m[3] = 2 * (x * y + z * w); m[4] = 1 - 2 * (x * x + z * z); m[5] = 2 * (y * z - x * w);
  m[6] = 2 * (x * z - y * w); m[7] = 2 * (y * z + x * w); m[8] = 1 - 2 * (x * x + y * y);
  return m;
}
const _qa = new Float64Array(4), _qb = new Float64Array(4);
function mezclarRot(a, b, t, o) {
  if (t <= 0) { o.set(a); return o; }
  if (t >= 1) { o.set(b); return o; }
  aQuat(a, _qa); aQuat(b, _qb);
  let c = _qa[0] * _qb[0] + _qa[1] * _qb[1] + _qa[2] * _qb[2] + _qa[3] * _qb[3];
  let s = 1;
  if (c < 0) { c = -c; s = -1; }
  let k0, k1;
  if (c > 0.9995) { k0 = 1 - t; k1 = t; }
  else { const th = Math.acos(c), sn = Math.sin(th); k0 = Math.sin((1 - t) * th) / sn; k1 = Math.sin(t * th) / sn; }
  for (let i = 0; i < 4; i++) _qa[i] = _qa[i] * k0 + _qb[i] * k1 * s;
  const l = Math.hypot(_qa[0], _qa[1], _qa[2], _qa[3]) || 1;
  for (let i = 0; i < 4; i++) _qa[i] /= l;
  return deQuat(_qa, o);
}
// v' = R (v − P) + Pm
function mover(R, P, Pm, v, o) {
  const x = v[0] - P[0], y = v[1] - P[1], z = v[2] - P[2];
  o[0] = R[0] * x + R[1] * y + R[2] * z + Pm[0];
  o[1] = R[3] * x + R[4] * y + R[5] * z + Pm[1];
  o[2] = R[6] * x + R[7] * y + R[8] * z + Pm[2];
  return o;
}

// ------------------------------------------------------------------ datos de reposo
const PP = PIVOTE.pelvis, PC = PIVOTE.pecho, PH = PIVOTE.cabeza;
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const LADOS = [1, -1].map((s) => {
  const hom = [s * PIVOTE.hombro[0], PIVOTE.hombro[1], PIVOTE.hombro[2]];
  const codo = [s * PIVOTE.codo[0], PIVOTE.codo[1], PIVOTE.codo[2]];
  const palma = [s * PIVOTE.palma[0], PIVOTE.palma[1], PIVOTE.palma[2]];
  const cad = [s * PIVOTE.cadera[0], PIVOTE.cadera[1], PIVOTE.cadera[2]];
  const rod = [s * PIVOTE.rodilla[0], PIVOTE.rodilla[1], PIVOTE.rodilla[2]];
  const u0 = norm([codo[0] - hom[0], codo[1] - hom[1], codo[2] - hom[2]]);
  const f0 = norm([palma[0] - codo[0], palma[1] - codo[1], palma[2] - codo[2]]);
  const L1 = Math.hypot(codo[0] - hom[0], codo[1] - hom[1], codo[2] - hom[2]);
  const L2 = Math.hypot(palma[0] - codo[0], palma[1] - codo[1], palma[2] - codo[2]);
  const F0 = marco(u0, [-1, 0, 0], new Float64Array(9)), G0 = marco(f0, [-1, 0, 0], new Float64Array(9));
  return { s, hom, codo, palma, cad, rod, L1, L2, F0, G0 };
});
const LARGO_MUSLO = PIVOTE.cadera[1] - PIVOTE.rodilla[1];

// parámetros de la pose (un objeto reutilizable)
export function nuevaPose() {
  const brazo = () => ({ peso: 0, ancla: 0, obj: [0, 0, 0], polo: [0, -0.3, -0.2], pron: 0, arriba: 0 });
  return {
    x: 0, y: 0, z: 0, yaw: 0, esc: 1, t: 0, semilla: 0,
    andar: 0, fase: 0, amp: 1, prisa: 0,
    sentado: 0, alturaAsiento: 0.555, transicion: 0, piesP: 0, piesN: 0, abrirPiernas: 0.06,
    inclinar: 0, encorvado: 0, torsoYaw: 0,
    cabYaw: 0, cabPitch: 0, cabTilt: 0,
    brazos: [brazo(), brazo()],
  };
}

// temporales
const Rp = new Float64Array(9), Rc = new Float64Array(9), Rh = new Float64Array(9), Rt = new Float64Array(9), Rs = new Float64Array(9);
const Ru = new Float64Array(9), Rf = new Float64Array(9), Ru2 = new Float64Array(9), Rf2 = new Float64Array(9), A = new Float64Array(9), B = new Float64Array(9);
const Pp = [0, 0, 0], Pc = [0, 0, 0], Ph = [0, 0, 0], Pcad = [0, 0, 0], Prod = [0, 0, 0], S = [0, 0, 0], E = [0, 0, 0], T = [0, 0, 0];
const U1 = [0, 0, 0], F1 = [0, 0, 0], H1 = [0, 0, 0], Pd = [0, 0, 0];

// Escribe una matriz final (mundo) en la textura: A = esc·RY(yaw)·R ; b = pos + esc·RY(yaw)·(Pm − R·P)
function escribir(out, off, hueso, R, P, Pm, e) {
  const c = Math.cos(e.yaw), s = Math.sin(e.yaw), k = e.esc;
  const d0 = Pm[0] - (R[0] * P[0] + R[1] * P[1] + R[2] * P[2]);
  const d1 = Pm[1] - (R[3] * P[0] + R[4] * P[1] + R[5] * P[2]);
  const d2 = Pm[2] - (R[6] * P[0] + R[7] * P[1] + R[8] * P[2]);
  const o = off + hueso * 12;
  out[o] = k * (c * R[0] + s * R[6]); out[o + 1] = k * (c * R[1] + s * R[7]); out[o + 2] = k * (c * R[2] + s * R[8]); out[o + 3] = e.x + k * (c * d0 + s * d2);
  out[o + 4] = k * R[3]; out[o + 5] = k * R[4]; out[o + 6] = k * R[5]; out[o + 7] = e.y + k * d1;
  out[o + 8] = k * (-s * R[0] + c * R[6]); out[o + 9] = k * (-s * R[1] + c * R[7]); out[o + 10] = k * (-s * R[2] + c * R[8]); out[o + 11] = e.z + k * (-s * d0 + c * d2);
}

// Cinemática inversa de dos tramos: hombro S, objetivo T, polo (hacia dónde va el codo)
function ik(Sx, T0, polo, L1, L2) {
  let dx = T0[0] - Sx[0], dy = T0[1] - Sx[1], dz = T0[2] - Sx[2];
  const D = Math.hypot(dx, dy, dz) || 1e-6;
  dx /= D; dy /= D; dz /= D;
  const Dc = lim(D, Math.abs(L1 - L2) + 1e-4, L1 + L2 - 1e-4);
  let px = polo[0] - Sx[0], py = polo[1] - Sx[1], pz = polo[2] - Sx[2];
  const dp = px * dx + py * dy + pz * dz;
  px -= dp * dx; py -= dp * dy; pz -= dp * dz;
  let pl = Math.hypot(px, py, pz);
  if (pl < 1e-6) { px = 0; py = -1; pz = 0; pl = 1; }
  px /= pl; py /= pl; pz /= pl;
  const cosA = lim((L1 * L1 + Dc * Dc - L2 * L2) / (2 * L1 * Dc), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  U1[0] = dx * cosA + px * sinA; U1[1] = dy * cosA + py * sinA; U1[2] = dz * cosA + pz * sinA;
  E[0] = Sx[0] + L1 * U1[0]; E[1] = Sx[1] + L1 * U1[1]; E[2] = Sx[2] + L1 * U1[2];
  let fx = Sx[0] + dx * Dc - E[0], fy = Sx[1] + dy * Dc - E[1], fz = Sx[2] + dz * Dc - E[2];
  const fl = Math.hypot(fx, fy, fz) || 1; F1[0] = fx / fl; F1[1] = fy / fl; F1[2] = fz / fl;
  // eje de la flexión del codo (mismo sentido que en reposo)
  let hx = U1[1] * F1[2] - U1[2] * F1[1], hy = U1[2] * F1[0] - U1[0] * F1[2], hz = U1[0] * F1[1] - U1[1] * F1[0];
  let hl = Math.hypot(hx, hy, hz);
  if (hl < 1e-3) { hx = -(U1[1] * pz - U1[2] * py); hy = -(U1[2] * px - U1[0] * pz); hz = -(U1[0] * py - U1[1] * px); hl = Math.hypot(hx, hy, hz) || 1; }
  H1[0] = hx / hl; H1[1] = hy / hl; H1[2] = hz / hl;
  Pd[0] = px; Pd[1] = py; Pd[2] = pz;
}

// ------------------------------------------------------------------ pose completa
export function posar(e, out, off) {
  const w = e.andar, ph = e.fase, s1 = Math.sin(ph), c1 = Math.cos(ph), amp = e.amp, sit = e.sentado, t = e.t, sem = e.semilla;
  const quieto = (1 - w) * (1 - sit);
  const apoyo = Math.sin(t * 0.55 + sem * 6.283);
  // ---- piernas al caminar
  const zancada = 0.42 * amp * w;
  let mP = -zancada * s1, mN = zancada * s1;
  let rP = w * (0.06 + 0.95 * amp * Math.max(0, Math.cos(ph + 0.35)) ** 2) + quieto * 0.05 * Math.max(0, apoyo);
  let rN = w * (0.06 + 0.95 * amp * Math.max(0, Math.cos(ph + PI + 0.35)) ** 2) + quieto * 0.05 * Math.max(0, -apoyo);
  let abr = 0.025;
  // ---- pelvis
  let dx = -0.016 * w * c1 + quieto * 0.012 * apoyo, dy = w * 0.018 * Math.cos(2 * ph) - quieto * 0.005 * Math.abs(apoyo), dz = 0;
  let giroP = -0.1 * amp * w * s1, rolP = 0.035 * w * c1 + quieto * 0.022 * apoyo, incP = 0;
  // ---- sentarse: muslos casi horizontales, tibias verticales y pies en el piso
  if (sit > 0) {
    const yCad = e.alturaAsiento / e.esc;
    const caida = PIVOTE.cadera[1] - yCad;
    const baja = Math.asin(lim((yCad - PIVOTE.rodilla[1]) / LARGO_MUSLO, -0.6, 0.95));
    const incS = -0.12;
    const mSit = -(PI / 2 - baja) - incS;
    const rSit = PI / 2 - baja;
    mP = mezclar(mP, mSit, sit); mN = mezclar(mN, mSit, sit);
    rP = mezclar(rP, rSit + e.piesP, sit); rN = mezclar(rN, rSit + e.piesN, sit);
    abr = mezclar(abr, e.abrirPiernas, sit);
    dy = mezclar(dy, -caida, sit); dz = mezclar(dz, -0.015, sit); dx *= 1 - sit;
    incP = mezclar(incP, incS, sit); giroP *= 1 - sit; rolP *= 1 - sit;
  }
  // ---- torso y cabeza
  let incC = 0.035 + 0.05 * w + e.prisa * 0.13 + e.encorvado + e.inclinar + 0.012 * Math.sin(t * 1.6 + sem * 9);
  incC += 0.55 * Math.sin(PI * lim(sit, 0, 1)) * e.transicion;
  const giroC = 0.14 * amp * w * s1 + e.torsoYaw;
  const rolC = -rolP * 0.6;
  const cabPitch = e.cabPitch - 0.02 * w * Math.cos(2 * ph) - (incC + incP) * 0.62;
  ry(giroP, A); rz(rolP, B); mul(A, B, Rp); rx(incP, B); mul(Rp, B, Rp);
  Pp[0] = PP[0] + dx; Pp[1] = PP[1] + dy; Pp[2] = PP[2] + dz;
  ry(giroC, A); mul(Rp, A, Rc); rx(incC, A); mul(Rc, A, Rc); rz(rolC, A); mul(Rc, A, Rc);
  mover(Rp, PP, Pp, PC, Pc);
  ry(e.cabYaw, A); mul(Rc, A, Rh); rx(cabPitch, A); mul(Rh, A, Rh); rz(e.cabTilt, A); mul(Rh, A, Rh);
  mover(Rc, PC, Pc, PH, Ph);
  escribir(out, off, 0, Rp, PP, Pp, e);
  escribir(out, off, 1, Rc, PC, Pc, e);
  escribir(out, off, 2, Rh, PH, Ph, e);
  // ---- piernas
  for (let i = 0; i < 2; i++) {
    const L = LADOS[i];
    rz(L.s * abr, A); mul(Rp, A, Rt); rx(i === 0 ? mP : mN, A); mul(Rt, A, Rt);
    mover(Rp, PP, Pp, L.cad, Pcad);
    rx(i === 0 ? rP : rN, A); mul(Rt, A, Rs);
    mover(Rt, L.cad, Pcad, L.rod, Prod);
    escribir(out, off, i === 0 ? 7 : 9, Rt, L.cad, Pcad, e);
    escribir(out, off, i === 0 ? 8 : 10, Rs, L.rod, Prod, e);
  }
  // ---- brazos
  for (let i = 0; i < 2; i++) {
    const L = LADOS[i], b = e.brazos[i];
    mover(Rc, PC, Pc, L.hom, S);
    // balanceo al caminar; de pie, relajados; sentado, sobre los muslos
    let sw = (i === 0 ? 1 : -1) * 0.33 * amp * w * s1;
    let fl = 0.2 + 0.28 * w * Math.max(0, (i === 0 ? -1 : 1) * s1) + quieto * 0.04 * (1 + Math.sin(t * 0.9 + sem * 4 + i));
    let ab = 0.075;
    sw = mezclar(sw, -0.3, sit); fl = mezclar(fl, 1.05, sit); ab = mezclar(ab, 0.17, sit);
    rz(L.s * ab, A); mul(Rc, A, Ru); rx(sw, A); mul(Ru, A, Ru);
    rx(-fl, A); mul(Ru, A, Rf);
    if (b.arriba > 0) {                // estirarse: brazos arriba
      rz(L.s * 0.3, A); mul(Rc, A, Ru2); rx(-2.75, A); mul(Ru2, A, Ru2); rx(-0.5, A); mul(Ru2, A, Rf2);
      mezclarRot(Ru, Ru2, b.arriba, Ru); mezclarRot(Rf, Rf2, b.arriba, Rf);
    }
    if (b.peso > 0) {
      if (b.ancla === 1) mover(Rc, PC, Pc, b.obj, T);
      else if (b.ancla === 2) mover(Rh, PH, Ph, b.obj, T);
      else { T[0] = b.obj[0]; T[1] = b.obj[1]; T[2] = b.obj[2]; }
      const polo = [S[0] + b.polo[0] * L.s, S[1] + b.polo[1], S[2] + b.polo[2]];
      ik(S, T, polo, L.L1, L.L2);
      marco(U1, H1, A); mulT(A, L.F0, Ru2);
      marco(F1, H1, A); mulT(A, L.G0, Rf2);
      if (b.pron) { ejeAngulo(F1[0], F1[1], F1[2], L.s * b.pron, A); mul(A, Rf2, Rf2); }
      mezclarRot(Ru, Ru2, b.peso, Ru); mezclarRot(Rf, Rf2, b.peso, Rf);
    }
    mover(Ru, L.hom, S, L.codo, E);
    escribir(out, off, i === 0 ? 3 : 5, Ru, L.hom, S, e);
    escribir(out, off, i === 0 ? 4 : 6, Rf, L.codo, E, e);
  }
}
