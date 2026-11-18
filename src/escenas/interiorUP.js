// Interior según la Biblioteca de la Universidad del Pacífico (reglamento 2021 y guía de la biblioteca):
//   · antenas de seguridad blancas en las dos puertas y cartel «BIBLIOTECA» colgado en la entrada
//   · panel «SERVICIOS» y exhibidor de diarios junto a la entrada (como en las fotos)
//   · Sala 3 de materiales especiales (tesis, papers…), de acceso restringido: se pide en el módulo de atención
//   · salas de estudio grupales (se reservan en línea): fuera del conteo de los 332 asientos
//   · computadoras para consultar bases de datos (máximo 1 hora)
//   · hemeroteca en la Sala 2 (en el sótano) y carritos para dejar los libros consultados
//   · aviso de normas: solo agua en envase cerrado, silencio y celular en silencio
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLANO, yPiso } from '../biblioteca/plano.js';
import * as TX from '../motor/texturas.js';
import { rectRedondo } from '../motor/textos.js';   // solo para dibujar en lienzos
import { caja, cajaL, fusionar, lienzoTex, cartel, texto } from './galeria.js';

const H = PLANO.alturaPiso;
const Y2 = yPiso(2);          // piso del sótano
const Z1 = PLANO.z1;
const AZUL = '#1f3a6d';

// Lomos de libros de colores (repisas de la Sala 3 y carritos)
function texLibros() {
  return lienzoTex(512, 256, (ctx, w, h) => {
    const r = TX.azar(44);
    const cols = ['#7c2d12', '#1e3a8a', '#166534', '#9a3412', '#374151', '#6b21a8', '#b45309', '#0f766e', '#991b1b', '#334155'];
    for (let fila = 0; fila < 2; fila++) {
      let x = 0;
      const y0 = fila * (h / 2);
      ctx.fillStyle = '#5b4632'; ctx.fillRect(0, y0, w, h / 2);
      while (x < w) {
        const a = 8 + r() * 16, alto = (h / 2) * (0.62 + r() * 0.3);
        ctx.fillStyle = cols[Math.floor(r() * cols.length)];
        ctx.fillRect(x, y0 + h / 2 - alto - 4, a - 1, alto);
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x + a * 0.3, y0 + h / 2 - alto * 0.7, a * 0.4, 3);
        x += a;
      }
      ctx.fillStyle = '#7a5f45'; ctx.fillRect(0, y0 + h / 2 - 4, w, 4);
    }
  }, true);
}

// Portadas de diarios y revistas (genéricas, sin marcas reales)
function texDiarios() {
  return lienzoTex(1024, 512, (ctx, w, h) => {
    const r = TX.azar(7);
    const nombres = ['EL DIARIO', 'NOTICIAS', 'LA GACETA', 'ECONOMÍA', 'EL PAÍS', 'CAMPUS', 'MERCADOS', 'CULTURA'];
    for (let i = 0; i < 8; i++) {
      const x = (i % 4) * (w / 4), y = Math.floor(i / 4) * (h / 2), cw = w / 4, ch = h / 2;
      ctx.fillStyle = '#f4f1e8'; ctx.fillRect(x + 4, y + 4, cw - 8, ch - 8);
      const revista = i >= 5;
      ctx.fillStyle = revista ? ['#b91c1c', '#1d4ed8', '#047857'][i - 5] : '#111827';
      ctx.fillRect(x + 4, y + 4, cw - 8, revista ? ch * 0.22 : ch * 0.13);
      texto(ctx, nombres[i], x + cw / 2, y + 4 + (revista ? ch * 0.11 : ch * 0.065), { tam: revista ? 30 : 26, peso: 900, color: revista ? '#fff' : '#f9fafb' });
      ctx.fillStyle = '#111827'; ctx.fillRect(x + 14, y + ch * 0.2, cw - 28, 14);
      ctx.fillStyle = `hsl(${Math.floor(r() * 360)},35%,55%)`; ctx.fillRect(x + 14, y + ch * 0.27, cw * 0.55, ch * 0.32);
      ctx.fillStyle = '#9ca3af';
      for (let k = 0; k < 9; k++) ctx.fillRect(x + (k < 5 ? cw * 0.62 : 14), y + ch * (0.28 + k * 0.065), k < 5 ? cw * 0.3 : cw - 28, 5);
    }
  });
}

// Rectángulo redondeado para formas de three.js (Shape/Path no tienen arcTo)
function formaRedonda(p, x, y, w, h, r) {
  p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r); p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y);
  return p;
}

// Antena de seguridad (arco blanco de plástico)
function geoAntena() {
  const ext = formaRedonda(new THREE.Shape(), -0.31, 0, 0.62, 1.62, 0.14);
  const hueco = formaRedonda(new THREE.Path(), -0.25, 0.08, 0.5, 1.46, 0.1);
  ext.holes.push(hueco);
  const g = new THREE.ExtrudeGeometry(ext, { depth: 0.05, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -0.025);
  g.rotateY(Math.PI / 2);            // el arco queda en el plano y-z (se pasa a su lado)
  return g;
}

// Exhibidor de diarios con ruedas (dos caras inclinadas)
function exhibidor(texDiario, mats) {
  const g = new THREE.Group();
  const tubos = [];
  for (const x of [-0.58, 0.58]) {
    tubos.push(new THREE.CylinderGeometry(0.015, 0.015, 1.45, 8).translate(x, 0.78, 0));
    tubos.push(cajaL(x - 0.015, x + 0.015, 0.06, 0.09, -0.32, 0.32));
  }
  const repisas = [], hojas = [];
  for (const lado of [-1, 1]) for (let k = 0; k < 3; k++) {
    const y = 0.42 + k * 0.42, z = lado * (0.18 - k * 0.04);
    const rep = cajaL(-0.56, 0.56, y - 0.01, y + 0.01, z - 0.12, z + 0.12); repisas.push(rep);
    for (let n = 0; n < 2; n++) {
      const p = new THREE.PlaneGeometry(0.42, 0.34);
      const i = (k * 2 + n + (lado > 0 ? 2 : 0)) % 8;
      const uv = p.attributes.uv;
      for (let j = 0; j < uv.count; j++) uv.setXY(j, ((i % 4) + uv.getX(j)) / 4, (1 - Math.floor(i / 4)) * 0.5 + uv.getY(j) * 0.5);
      p.rotateX(-0.42 * lado);
      if (lado < 0) p.rotateY(Math.PI);
      p.translate(-0.26 + n * 0.52, y + 0.17, z + lado * 0.03);
      hojas.push(p);
    }
  }
  const ruedas = [[-0.55, -0.28], [0.55, -0.28], [-0.55, 0.28], [0.55, 0.28]].map(([x, z]) => new THREE.SphereGeometry(0.035, 8, 6).translate(x, 0.035, z));
  g.add(fusionar([...tubos, ...repisas], mats.acero), fusionar(ruedas, mats.oscuro), new THREE.Mesh(mergeGeometries(hojas), new THREE.MeshStandardMaterial({ map: texDiario, roughness: 0.9, side: THREE.DoubleSide })));
  return g;
}

// Carrito para dejar los libros consultados
function carrito(texLib, mats) {
  const g = new THREE.Group();
  const marco = fusionar([cajaL(-0.42, 0.42, 0.12, 0.15, -0.2, 0.2), cajaL(-0.42, 0.42, 0.52, 0.55, -0.2, 0.2), cajaL(-0.44, -0.4, 0.12, 0.95, -0.2, 0.2), cajaL(0.4, 0.44, 0.12, 0.95, -0.2, 0.2), cajaL(-0.44, 0.44, 0.93, 0.96, 0.15, 0.2)], mats.acero);
  const libros = [];
  for (const y of [0.15, 0.55]) { const b = cajaL(-0.39, 0.39, y, y + 0.3, -0.16, 0.16); libros.push(b); }
  const lib = fusionar(libros, new THREE.MeshStandardMaterial({ map: texLib, roughness: 0.8 }));
  const ruedas = fusionar([[-0.36, -0.15], [0.36, -0.15], [-0.36, 0.15], [0.36, 0.15]].map(([x, z]) => new THREE.SphereGeometry(0.05, 8, 6).translate(x, 0.05, z)), mats.oscuro);
  g.add(marco, lib, ruedas);
  return g;
}

export function construirInteriorUP(b3d) {
  const p1 = b3d.pisos[1], p2 = b3d.pisos[2];
  const mats = {
    blanco: new THREE.MeshStandardMaterial({ color: 0xf1f1ee, roughness: 0.85 }),
    plastico: new THREE.MeshStandardMaterial({ color: 0xf4f5f6, roughness: 0.32 }),
    acero: new THREE.MeshStandardMaterial({ color: 0xbfc4c8, roughness: 0.3, metalness: 0.85 }),
    aluminio: new THREE.MeshStandardMaterial({ color: 0xc5c9ce, roughness: 0.35, metalness: 0.65 }),
    oscuro: new THREE.MeshStandardMaterial({ color: 0x1f2329, roughness: 0.5 }),
    madera: new THREE.MeshStandardMaterial({ color: 0xc2a079, roughness: 0.55 }),
    silla: new THREE.MeshStandardMaterial({ color: 0x3f4654, roughness: 0.7 }),
    pantalla: new THREE.MeshBasicMaterial({ color: 0x3b82c4 }),
  };
  const vidrio = b3d.mat.vidrio, franja = b3d.galeria.franjaMat;
  const texLib = texLibros();
  texLib.repeat.set(1, 1);
  const P = PLANO.puertas;

  // ---------------------------------------------------------------- antenas de seguridad en las dos puertas
  const ant = geoAntena();
  const antenas = [];
  for (const pu of [P.entrada, P.salida]) for (const x of [pu.x0 + 0.24, pu.x1 - 0.24]) antenas.push(ant.clone().translate(x, 0.02, Z1 - 0.95));
  const pies = [];
  for (const pu of [P.entrada, P.salida]) for (const x of [pu.x0 + 0.24, pu.x1 - 0.24]) pies.push(cajaL(x - 0.06, x + 0.06, 0, 0.03, Z1 - 1.3, Z1 - 0.6));
  p1.add(fusionar(antenas, mats.plastico), fusionar(pies, mats.aluminio));

  // ---------------------------------------------------------------- cartel colgante «BIBLIOTECA» y panel de servicios
  const xP = (P.entrada.x0 + P.entrada.x1) / 2;
  const colgante = cartel(1.5, 0.34, 600, (ctx, w, h) => {
    ctx.fillStyle = AZUL; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(h * 0.55, h / 2, h * 0.28, 0, Math.PI * 2); ctx.stroke();
    texto(ctx, 'UP', h * 0.55, h / 2 + 2, { tam: h * 0.26, peso: 900 });
    texto(ctx, 'BIBLIOTECA', w * 0.58, h / 2 + 2, { tam: h * 0.5, peso: 800 });
  });
  colgante.position.set(xP, 3.35, Z1 - 1.5);
  const reverso = cartel(1.5, 0.34, 400, (ctx, w, h) => { ctx.fillStyle = AZUL; ctx.fillRect(0, 0, w, h); texto(ctx, 'Gracias por tu visita', w / 2, h / 2, { tam: h * 0.36, peso: 600 }); });
  reverso.rotation.y = Math.PI; reverso.position.set(xP, 3.35, Z1 - 1.505);
  const cables = fusionar([-0.6, 0.6].map((dx) => new THREE.CylinderGeometry(0.004, 0.004, H - 0.31 - 3.52, 4).translate(xP + dx, 3.52 + (H - 0.31 - 3.52) / 2, Z1 - 1.5)), mats.oscuro);
  const servicios = cartel(0.95, 1.15, 500, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = AZUL; ctx.fillRect(0, 0, w * 0.17, h);
    ctx.save(); ctx.translate(w * 0.085, h / 2); ctx.rotate(-Math.PI / 2); texto(ctx, 'SERVICIOS', 0, 0, { tam: w * 0.1, peso: 800 }); ctx.restore();
    const l = ['Préstamo y devolución', 'Módulo de atención', 'Salas de estudio', '(reserva en línea)', 'Sala 3: materiales', 'especiales', 'Hemeroteca: Sala 2', 'Computadoras: 1 h'];
    l.forEach((t, i) => texto(ctx, t, w * 0.22, h * (0.1 + i * 0.105), { tam: w * 0.068, peso: t.startsWith('(') || t === 'especiales' ? 500 : 650, color: '#1e293b', alinear: 'left', max: w * 0.74 }));
  });
  servicios.position.set(8.4, 2.05, Z1 - 0.32);
  const servRev = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.15), mats.blanco); servRev.rotation.y = Math.PI; servRev.position.set(8.4, 2.05, Z1 - 0.33);
  const servPie = fusionar([cajaL(8.38, 8.42, 0, 1.48, Z1 - 0.34, Z1 - 0.3), cajaL(8.1, 8.7, 0, 0.03, Z1 - 0.5, Z1 - 0.15)], mats.aluminio);
  p1.add(colgante, reverso, cables, servicios, servRev, servPie);

  // ---------------------------------------------------------------- exhibidor de diarios junto a la entrada
  const D = PLANO.diarios;
  const exh = exhibidor(texDiarios(), mats);
  exh.position.set((D.x0 + D.x1) / 2, 0, (D.z0 + D.z1) / 2);
  p1.add(exh);

  // ---------------------------------------------------------------- aviso de normas (reglamento de la Biblioteca)
  const normas = cartel(0.62, 0.95, 400, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = AZUL; ctx.fillRect(0, 0, w, h * 0.16);
    texto(ctx, 'BIBLIOTECA UP', w / 2, h * 0.08, { tam: w * 0.09, peso: 800 });
    const l = [['•', 'Solo agua en envase'], ['', 'cerrado'], ['•', 'Mantén silencio'], ['•', 'Celular en silencio'], ['•', 'Pertenencias solas:'], ['', 'se retiran a los 20 min']];
    l.forEach(([ic, t], i) => { if (ic) texto(ctx, ic, w * 0.11, h * (0.26 + i * 0.12), { tam: w * 0.1, peso: 900, color: '#1f3a6d' }); texto(ctx, t, w * 0.2, h * (0.26 + i * 0.12), { tam: w * 0.072, peso: 650, color: '#1e293b', alinear: 'left', max: w * 0.78 }); });
  });
  normas.rotation.x = -0.12; normas.position.set(-2.35, 0.62, 12.05);
  const caballete = fusionar([cajaL(-2.68, -2.64, 0, 1.08, 11.98, 12.02), cajaL(-2.06, -2.02, 0, 1.08, 11.98, 12.02), cajaL(-2.68, -2.02, 0.12, 0.16, 11.93, 11.97)], mats.aluminio);
  p1.add(normas, caballete);

  // ---------------------------------------------------------------- Sala 3: materiales especiales (acceso restringido)
  const S = PLANO.sala3;
  const puertaZ = [11.05, 12.0];
  const vidrios3 = [], franjas3 = [], marcos3 = [];
  // frente hacia el vestíbulo (x = S.x0) con puerta, y lado hacia la sala (z = S.z0)
  for (const [a, b] of [[S.z0, puertaZ[0]], [puertaZ[1], S.z1]]) {
    const v = new THREE.PlaneGeometry(b - a, 2.7); v.rotateY(-Math.PI / 2); v.translate(S.x0, 1.35, (a + b) / 2); vidrios3.push(v);
    const f = new THREE.PlaneGeometry(b - a, 0.34); f.rotateY(-Math.PI / 2); f.translate(S.x0 - 0.01, 1.22, (a + b) / 2); franjas3.push(f);
  }
  const v2 = new THREE.PlaneGeometry(S.x1 - S.x0, 2.7); v2.translate((S.x0 + S.x1) / 2, 1.35, S.z0); vidrios3.push(v2);
  const f2 = new THREE.PlaneGeometry(S.x1 - S.x0, 0.34); f2.translate((S.x0 + S.x1) / 2, 1.22, S.z0 - 0.01); franjas3.push(f2);
  for (let z = S.z0; z <= S.z1 + 0.01; z += (S.z1 - S.z0) / 4) marcos3.push(cajaL(S.x0 - 0.04, S.x0 + 0.04, 0, 2.75, z - 0.04, z + 0.04));
  for (let x = S.x0; x <= S.x1 + 0.01; x += (S.x1 - S.x0) / 4) marcos3.push(cajaL(x - 0.04, x + 0.04, 0, 2.75, S.z0 - 0.04, S.z0 + 0.04));
  marcos3.push(cajaL(S.x0 - 0.05, S.x0 + 0.05, 2.7, 2.78, S.z0, S.z1), cajaL(S.x0, S.x1, 2.7, 2.78, S.z0 - 0.05, S.z0 + 0.05));
  // dintel blanco hasta el cielo raso y muro hacia la fachada
  const solidos3 = [cajaL(S.x0 - 0.06, S.x0 + 0.06, 2.78, H - 0.31, S.z0, S.z1), cajaL(S.x0, S.x1, 2.78, H - 0.31, S.z0 - 0.06, S.z0 + 0.06), cajaL(S.x0, S.x1, 0, H - 0.31, S.z1 - 0.12, S.z1)];
  // puerta (vidrio) y estanterías con libros dentro
  const puerta3 = new THREE.PlaneGeometry(puertaZ[1] - puertaZ[0] - 0.08, 2.6); puerta3.rotateY(-Math.PI / 2); puerta3.translate(S.x0 + 0.02, 1.3, (puertaZ[0] + puertaZ[1]) / 2);
  vidrios3.push(puerta3);
  const repisas3 = [];
  for (let k = 0; k < 4; k++) { const z = S.z0 + 0.8 + k * 1.3; repisas3.push(cajaL(S.x1 - 0.55, S.x1 - 0.1, 0, 2.2, z - 0.55, z + 0.55)); }
  const lomos3 = [];
  for (let k = 0; k < 4; k++) { const z = S.z0 + 0.8 + k * 1.3; const p = new THREE.PlaneGeometry(1.0, 2.0); p.rotateY(-Math.PI / 2); p.translate(S.x1 - 0.56, 1.1, z); lomos3.push(p); }
  const mesa3 = [cajaL(S.x0 + 1.2, S.x0 + 3.2, 0.72, 0.76, 8.6, 9.6), ...[[1.3, 8.7], [3.1, 8.7], [1.3, 9.5], [3.1, 9.5]].map(([dx, z]) => cajaL(S.x0 + dx - 0.03, S.x0 + dx + 0.03, 0, 0.72, z - 0.03, z + 0.03))];
  const sillas3 = [];
  for (const dx of [1.7, 2.7]) for (const [z, s] of [[8.25, -1], [9.95, 1]]) sillas3.push(cajaL(S.x0 + dx - 0.22, S.x0 + dx + 0.22, 0, 0.46, z - 0.22, z + 0.22), cajaL(S.x0 + dx - 0.22, S.x0 + dx + 0.22, 0.46, 0.9, z + s * 0.2 - 0.03, z + s * 0.2 + 0.03));
  const rotulo3 = cartel(1.9, 0.48, 700, (ctx, w, h) => {
    ctx.fillStyle = AZUL; ctx.fillRect(0, 0, w, h);
    texto(ctx, 'SALA 3 · Materiales especiales', w / 2, h * 0.34, { tam: h * 0.24, peso: 800 });
    texto(ctx, 'Acceso restringido: pide el material en el módulo de atención', w / 2, h * 0.72, { tam: h * 0.14, peso: 500, color: '#dbeafe', max: w * 0.94 });
  });
  rotulo3.rotation.y = -Math.PI / 2; rotulo3.position.set(S.x0 - 0.07, 3.3, (S.z0 + S.z1) / 2);
  p1.add(
    new THREE.Mesh(mergeGeometries(vidrios3), vidrio), new THREE.Mesh(mergeGeometries(franjas3), franja), fusionar(marcos3, mats.aluminio), fusionar(solidos3, mats.blanco),
    fusionar(repisas3, mats.madera), new THREE.Mesh(mergeGeometries(lomos3), new THREE.MeshStandardMaterial({ map: texLib, roughness: 0.85 })),
    fusionar(mesa3, mats.madera), fusionar(sillas3, mats.silla), rotulo3,
  );

  // ---------------------------------------------------------------- salas de estudio grupales (se reservan en línea)
  const E = PLANO.salasEstudio;
  const largo = (E.z1 - E.z0) / E.n;
  const vidriosE = [], franjasE = [], marcosE = [], muros = [], mesas = [], sillas = [], teles = [], pantallas = [];
  for (let i = 0; i < E.n; i++) {
    const za = E.z0 + i * largo, zb = za + largo;
    const pz = [zb - 1.25, zb - 0.3];                                         // puerta en el frente
    for (const [a, b] of [[za, pz[0]], [pz[1], zb]]) {
      const v = new THREE.PlaneGeometry(b - a, 2.6); v.rotateY(-Math.PI / 2); v.translate(E.x0, 1.3, (a + b) / 2); vidriosE.push(v);
      const f = new THREE.PlaneGeometry(b - a, 0.34); f.rotateY(-Math.PI / 2); f.translate(E.x0 - 0.01, 1.22, (a + b) / 2); franjasE.push(f);
    }
    const pv = new THREE.PlaneGeometry(pz[1] - pz[0] - 0.06, 2.5); pv.rotateY(-Math.PI / 2); pv.translate(E.x0 + 0.03, 1.25, (pz[0] + pz[1]) / 2); vidriosE.push(pv);
    marcosE.push(cajaL(E.x0 - 0.04, E.x0 + 0.04, 0, 2.65, za - 0.04, za + 0.04), cajaL(E.x0 - 0.04, E.x0 + 0.04, 0, 2.65, pz[0] - 0.03, pz[0] + 0.03), cajaL(E.x0 - 0.04, E.x0 + 0.04, 0, 2.65, pz[1] - 0.03, pz[1] + 0.03));
    if (i > 0) muros.push(cajaL(E.x0, E.x1, 0, H - 0.31, za - 0.05, za + 0.05));
    const zc = (za + zb) / 2 - 0.25, xc = (E.x0 + E.x1) / 2 + 0.2;
    mesas.push(cajaL(xc - 0.5, xc + 0.5, 0.72, 0.76, zc - 1.0, zc + 1.0));
    for (const dz of [-0.85, 0.85]) for (const dx of [-0.42, 0.42]) mesas.push(cajaL(xc + dx - 0.03, xc + dx + 0.03, 0, 0.72, zc + dz - 0.03, zc + dz + 0.03));
    for (const s of [-1, 1]) for (const dz of [-0.62, 0, 0.62]) sillas.push(cajaL(xc + s * 0.78 - 0.21, xc + s * 0.78 + 0.21, 0, 0.46, zc + dz - 0.21, zc + dz + 0.21), cajaL(xc + s * 0.98 - 0.03, xc + s * 0.98 + 0.03, 0.46, 0.9, zc + dz - 0.21, zc + dz + 0.21));
    teles.push(cajaL(xc - 0.62, xc + 0.62, 1.15, 1.85, za + 0.06, za + 0.1));
    const pt = new THREE.PlaneGeometry(1.16, 0.64); pt.translate(xc, 1.5, za + 0.105); pantallas.push(pt);
    const placa = cartel(0.8, 0.22, 360, (ctx, w, h) => {
      ctx.fillStyle = AZUL; rectRedondo(ctx, 0, 0, w, h, h * 0.2); ctx.fill();
      texto(ctx, `Sala de estudio ${i + 1}`, w / 2, h * 0.38, { tam: h * 0.32, peso: 800 });
      texto(ctx, 'Reserva en línea · uso grupal', w / 2, h * 0.76, { tam: h * 0.2, peso: 500, color: '#dbeafe' });
    });
    placa.rotation.y = -Math.PI / 2; placa.position.set(E.x0 - 0.05, 2.25, (pz[0] + pz[1]) / 2);
    p1.add(placa);
  }
  marcosE.push(cajaL(E.x0 - 0.04, E.x0 + 0.04, 0, 2.65, E.z1 - 0.04, E.z1 + 0.04), cajaL(E.x0 - 0.05, E.x0 + 0.05, 2.6, 2.68, E.z0, E.z1));
  muros.push(cajaL(E.x0 - 0.06, E.x0 + 0.06, 2.68, H - 0.31, E.z0, E.z1), cajaL(E.x0, E.x1, 0, H - 0.31, E.z0 - 0.05, E.z0 + 0.05), cajaL(E.x0, E.x1, 0, H - 0.31, E.z1 - 0.05, E.z1 + 0.05));
  p1.add(
    new THREE.Mesh(mergeGeometries(vidriosE), vidrio), new THREE.Mesh(mergeGeometries(franjasE), franja), fusionar(marcosE, mats.aluminio), fusionar(muros, mats.blanco),
    fusionar(mesas, mats.madera), fusionar(sillas, mats.silla), fusionar(teles, mats.oscuro), new THREE.Mesh(mergeGeometries(pantallas), mats.pantalla),
  );

  // ---------------------------------------------------------------- computadoras para bases de datos (piso 1)
  const C = PLANO.computadoras;
  const xm = (C.x0 + C.x1) / 2;
  const escritorio = [cajaL(xm - 0.5, xm + 0.5, 0.72, 0.76, C.z0 + 0.1, C.z1 - 0.1), cajaL(xm - 0.02, xm + 0.02, 0.76, 1.22, C.z0 + 0.1, C.z1 - 0.1)];
  for (const z of [C.z0 + 0.2, C.z1 - 0.2]) escritorio.push(cajaL(xm - 0.48, xm + 0.48, 0, 0.72, z - 0.03, z + 0.03));
  const monitores = [], brillos = [], sillasC = [];
  const n = 6, paso = (C.z1 - C.z0 - 0.6) / n;
  for (let k = 0; k < n; k++) {
    const z = C.z0 + 0.3 + paso * (k + 0.5);
    for (const s of [-1, 1]) {
      monitores.push(cajaL(xm + s * 0.12 - 0.02, xm + s * 0.12 + 0.02, 0.8, 1.15, z - 0.28, z + 0.28), cajaL(xm + s * 0.12 - 0.04, xm + s * 0.12 + 0.04, 0.76, 0.8, z - 0.08, z + 0.08));
      const p = new THREE.PlaneGeometry(0.52, 0.31); p.rotateY(s * Math.PI / 2); p.translate(xm + s * 0.145, 0.975, z); brillos.push(p);
      sillasC.push(cajaL(xm + s * 0.82 - 0.22, xm + s * 0.82 + 0.22, 0, 0.46, z - 0.22, z + 0.22), cajaL(xm + s * 1.02 - 0.03, xm + s * 1.02 + 0.03, 0.46, 0.92, z - 0.22, z + 0.22));
    }
  }
  const rotuloC = cartel(1.7, 0.36, 600, (ctx, w, h) => {
    ctx.fillStyle = AZUL; ctx.fillRect(0, 0, w, h);
    texto(ctx, 'Computadoras · bases de datos', w / 2, h * 0.38, { tam: h * 0.3, peso: 800 });
    texto(ctx, 'Uso académico · máximo 1 hora', w / 2, h * 0.76, { tam: h * 0.19, peso: 500, color: '#dbeafe' });
  }, { doble: true });
  rotuloC.position.set(xm, 2.9, C.z1 + 0.2);
  p1.add(fusionar(escritorio, mats.blanco), fusionar(monitores, mats.oscuro), new THREE.Mesh(mergeGeometries(brillos), mats.pantalla), fusionar(sillasC, mats.silla), rotuloC);

  // ---------------------------------------------------------------- hemeroteca (Sala 2, en el sótano): exhibidor de revistas de dos caras
  const R = PLANO.hemeroteca;
  const xr = (R.x0 + R.x1) / 2;
  const muebles = [cajaL(xr - 0.08, xr + 0.08, Y2, Y2 + 1.55, R.z0, R.z1), cajaL(R.x0, R.x1, Y2, Y2 + 0.12, R.z0, R.z1)];
  const revistas = [];
  const texRev = texDiarios();
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
    const y = Y2 + 0.35 + k * 0.42;
    muebles.push(cajaL(xr + s * 0.08, xr + s * 0.55, y - 0.012, y + 0.012, R.z0 + 0.05, R.z1 - 0.05));
    for (let z = R.z0 + 0.35; z < R.z1 - 0.2; z += 0.5) {
      const p = new THREE.PlaneGeometry(0.4, 0.34);
      const i = 5 + ((Math.round(z * 2) + k) % 3);
      const uv = p.attributes.uv;
      for (let j = 0; j < uv.count; j++) uv.setXY(j, ((i % 4) + uv.getX(j)) / 4, uv.getY(j) / 2);
      p.rotateX(-0.35);
      p.rotateY(s * Math.PI / 2);
      p.translate(xr + s * 0.3, y + 0.16, z);
      revistas.push(p);
    }
  }
  const rotuloR = cartel(1.9, 0.36, 600, (ctx, w, h) => {
    ctx.fillStyle = AZUL; ctx.fillRect(0, 0, w, h);
    texto(ctx, 'HEMEROTECA', w / 2, h * 0.36, { tam: h * 0.34, peso: 800 });
    texto(ctx, 'Revistas, diarios y boletines · estantería abierta', w / 2, h * 0.76, { tam: h * 0.17, peso: 500, color: '#dbeafe', max: w * 0.94 });
  }, { doble: true });
  rotuloR.rotation.y = Math.PI / 2; rotuloR.position.set(xr, Y2 + 2.55, (R.z0 + R.z1) / 2);
  p2.add(fusionar(muebles, mats.madera), new THREE.Mesh(mergeGeometries(revistas), new THREE.MeshStandardMaterial({ map: texRev, roughness: 0.85, side: THREE.DoubleSide })), rotuloR);

  // ---------------------------------------------------------------- carritos para dejar los libros consultados
  for (const [piso, x, z, giro] of [[1, -20.6, 5.05, 0], [1, -0.5, -11.55, 0], [1, 9.5, -11.55, 0], [2, -20.6, 5.05, 0], [2, 4.0, -12.5, 0]]) {
    const c = carrito(texLib, mats);
    c.position.set(x, yPiso(piso), z); c.rotation.y = giro;
    (piso === 2 ? p2 : p1).add(c);
  }
}
