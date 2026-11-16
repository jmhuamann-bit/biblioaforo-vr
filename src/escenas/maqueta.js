// Gemelo digital de la maqueta de BiblioAforo (Figura 2 del informe) y la sala donde se exhibe.
// Coordenadas locales de la maqueta: origen en el centro de la cara superior de la base,
// +x a la derecha, +z hacia el frente (pasillo), +y hacia arriba. Unidades: metros reales.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAQUETA as M, COLORES, CAMARA } from '../config.js';
import * as TX from '../motor/texturas.js';
import { etiqueta, LCD1602, Pantalla, FUENTE, rectRedondo } from '../motor/textos.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------
// Medidas derivadas de la configuración
// ---------------------------------------------------------------------
export function geometriaMaqueta() {
  const xL = -M.base.ancho / 2, xR = M.base.ancho / 2;
  const zB = -M.base.fondo / 2, zF = M.base.fondo / 2;
  const zPared = zF - M.pared.distanciaAlFrente;
  const zHaz = zPared + M.pared.grosor / 2 + M.sensor.separacionPared;
  const sensores = M.puertas.map((p) => ({
    id: p.sensor,
    puerta: p.id,
    // lente asomada 3 mm dentro del vano, sobre la jamba izquierda
    origen: V(p.x0 + 0.003, M.sensor.altura, zHaz),
    dir: V(1, 0, 0),
    alcance: M.sensor.alcance,
    semiApertura: THREE.MathUtils.degToRad(M.sensor.aperturaGrados / 2),
    centroPuerta: (p.x0 + p.x1) / 2,
  }));
  const caja = {
    x0: xR - M.caja.ancho, x1: xR, z0: zF - M.caja.fondo, z1: zF, alto: M.caja.alto,
  };
  return { xL, xR, zB, zF, zPared, zHaz, sensores, caja };
}

// ---------------------------------------------------------------------
// Materiales compartidos
// ---------------------------------------------------------------------
function materiales() {
  const mdf = TX.grano({ tam: 512, base: 0xe3cfa5, variacion: 0.05, motas: 0.4, escala: 10, semilla: 21, fuerzaNormal: 0.6, fibras: 0.04 });
  mdf.map.repeat.set(1.4, 1); mdf.normalMap.repeat.set(1.4, 1);
  const papel = TX.grano({ tam: 256, base: 0xf5f3ee, variacion: 0.025, motas: 0.1, escala: 16, semilla: 8, fuerzaNormal: 0.35 });
  const kraft = TX.grano({ tam: 256, base: 0xbd915e, variacion: 0.07, motas: 0.6, escala: 12, semilla: 44, fuerzaNormal: 0.5, fibras: 0.08 });
  const maderaMesa = TX.madera({ tam: 512, tablones: 1, claro: 0x9a6a3e, oscuro: 0x5d391c, semilla: 3, vetas: 14 });
  const maderaExpo = TX.madera({ tam: 1024, tablones: 5, claro: 0xd4ae7c, oscuro: 0xa47645, semilla: 12, vetas: 7 });
  return {
    texturas: { mdf, papel, kraft, maderaMesa, maderaExpo },
    base: new THREE.MeshStandardMaterial({ map: mdf.map, normalMap: mdf.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.82 }),
    canto: new THREE.MeshStandardMaterial({ color: 0xc7ad80, roughness: 0.9 }),
    pared: new THREE.MeshStandardMaterial({ map: papel.map, normalMap: papel.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.92 }),
    nucleoEspuma: new THREE.MeshStandardMaterial({ color: 0xfbfbf8, roughness: 1 }),
    mesa: new THREE.MeshStandardMaterial({ map: maderaMesa.map, normalMap: maderaMesa.normalMap, roughnessMap: maderaMesa.roughnessMap, roughness: 0.6 }),
    silla: new THREE.MeshStandardMaterial({ color: 0x8d98a6, roughness: 0.55, metalness: 0.05 }),
    patas: new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.4, metalness: 0.6 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xc4c8cf, roughness: 0.32, metalness: 1 }),
    aluminio: new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.42, metalness: 0.9 }),
    negro: new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.5 }),
    negroMate: new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.8 }),
    amarillo: new THREE.MeshStandardMaterial({ color: 0xe2b71c, roughness: 0.42 }),
    lente: new THREE.MeshPhysicalMaterial({ color: 0x2a0f3a, roughness: 0.08, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }),
    plasticoCaja: new THREE.MeshStandardMaterial({ color: 0xe9ebee, roughness: 0.5 }),
    acrilico: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: 0.0, transparent: true, opacity: 0.18, metalness: 0, clearcoat: 1, depthWrite: false }),
    verdeCartel: new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.6 }),
    kraft: new THREE.MeshStandardMaterial({ map: kraft.map, normalMap: kraft.normalMap, roughness: 0.95 }),
    maderaExpo: new THREE.MeshStandardMaterial({ map: maderaExpo.map, normalMap: maderaExpo.normalMap, roughnessMap: maderaExpo.roughnessMap, roughness: 0.55 }),
    cable: new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.6 }),
  };
}

// ---------------------------------------------------------------------
// Utilidades de geometría
// ---------------------------------------------------------------------
function caja(w, h, d, mat, x = 0, y = 0, z = 0, { sombra = true, recibe = true, radio = 0 } = {}) {
  const g = radio > 0 ? new RoundedBoxGeometry(w, h, d, 2, radio) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.castShadow = sombra; m.receiveShadow = recibe;
  return m;
}

function tubo(puntos, radio, mat, segmentos = 64) {
  const curva = new THREE.CatmullRomCurve3(puntos, false, 'centripetal');
  const m = new THREE.Mesh(new THREE.TubeGeometry(curva, segmentos, radio, 8, false), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Cuerpo roscado del E18-D80NK (M18) con LatheGeometry: rosca real en relieve.
function cuerpoRoscado(largo, radio, paso) {
  const pts = [];
  const n = Math.floor(largo / paso);
  pts.push(new THREE.Vector2(0.0001, 0));
  for (let i = 0; i <= n; i++) {
    const y = i * paso;
    pts.push(new THREE.Vector2(radio, y));
    if (i < n) pts.push(new THREE.Vector2(radio * 0.94, y + paso / 2));
  }
  pts.push(new THREE.Vector2(0.0001, n * paso));
  const g = new THREE.LatheGeometry(pts, 28);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------
// Haz infrarrojo: cono aditivo con pulsos (θ = 15°). Se recorta donde lo bloquea una silueta.
// ---------------------------------------------------------------------
function crearHaz(sensor) {
  const largo = sensor.alcance;
  const radio = Math.tan(sensor.semiApertura) * largo;
  const geo = new THREE.ConeGeometry(radio, largo, 40, 12, true);
  geo.rotateZ(Math.PI / 2);
  geo.translate(largo / 2, 0, 0);
  const uniforms = {
    uTiempo: { value: 0 },
    uLargo: { value: largo },
    uAlcance: { value: largo },
    uIntensidad: { value: 1 },
    uBloqueado: { value: 0 },
    uColor: { value: new THREE.Color(COLORES.ir) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    vertexShader: /* glsl */`
      varying vec3 vPos; varying vec3 vNormalV; varying vec3 vVista;
      void main() {
        vPos = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormalV = normalize(normalMatrix * normal);
        vVista = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTiempo, uLargo, uAlcance, uIntensidad, uBloqueado; uniform vec3 uColor;
      varying vec3 vPos; varying vec3 vNormalV; varying vec3 vVista;
      void main() {
        if (vPos.x > uLargo) discard;
        float t = clamp(vPos.x / uAlcance, 0.0, 1.0);
        float frente = abs(dot(normalize(vNormalV), normalize(vVista)));
        float volumen = pow(frente, 1.6) * 0.75 + 0.12;
        float pulsos = 0.55 + 0.45 * sin(t * 46.0 - uTiempo * 16.0);
        float caida = (1.0 - t * 0.75);
        float fin = smoothstep(0.0, 0.08, uLargo - vPos.x) ;
        float a = volumen * caida * pulsos * uIntensidad * (0.55 + uBloqueado * 0.9) * mix(1.0, fin, uBloqueado);
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
  const cono = new THREE.Mesh(geo, mat);
  cono.renderOrder = 5;
  cono.frustumCulled = false;

  // línea central discontinua (como en la Figura 2)
  const lineaGeo = new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(largo, 0, 0)]);
  const lineaMat = new THREE.LineDashedMaterial({ color: COLORES.ir, dashSize: 0.004, gapSize: 0.003, transparent: true, opacity: 0.9, toneMapped: false });
  const linea = new THREE.Line(lineaGeo, lineaMat);
  linea.computeLineDistances();

  // destello en el punto de impacto
  const destello = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.destello(), color: COLORES.ir, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  destello.scale.setScalar(0.022);
  destello.visible = false;

  const grupo = new THREE.Group();
  grupo.add(cono, linea, destello);
  grupo.position.copy(sensor.origen);
  return { grupo, uniforms, linea, destello };
}

// ---------------------------------------------------------------------
// Sensor E18-D80NK con soporte en L
// ---------------------------------------------------------------------
function crearSensorE18(mat) {
  const g = new THREE.Group();
  const largo = 0.045, r = 0.009;
  // cuerpo roscado amarillo, eje a lo largo de +x (la lente queda en x = 0)
  const cuerpo = new THREE.Mesh(cuerpoRoscado(largo - 0.008, r, 0.0015), mat.amarillo);
  cuerpo.rotation.z = Math.PI / 2;           // eje y → eje -x
  cuerpo.position.x = -0.006;
  cuerpo.castShadow = true;
  g.add(cuerpo);
  // frente negro con lente violeta oscura
  const frente = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.98, r * 0.98, 0.006, 32), mat.negro);
  frente.rotation.z = Math.PI / 2; frente.position.x = -0.003; frente.castShadow = true;
  const lente = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.72, 0.0012, 32), mat.lente);
  lente.rotation.z = Math.PI / 2; lente.position.x = 0.0001;
  g.add(frente, lente);
  // tuercas hexagonales
  for (const x of [-0.016, -0.03]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.42, r * 1.42, 0.004, 6), mat.metal);
    t.rotation.z = Math.PI / 2; t.position.x = x; t.castShadow = true;
    g.add(t);
  }
  // tapa trasera con LED indicador (se enciende al detectar, como el sensor real)
  const tapa = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.75, 0.007, 24), mat.negro);
  tapa.rotation.z = Math.PI / 2; tapa.position.x = -largo + 0.0005;
  g.add(tapa);
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1a1a, emissiveIntensity: 0, roughness: 0.3 });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.0016, 12, 8), ledMat);
  led.position.set(-largo - 0.003, 0.004, 0);
  g.add(led);
  // soporte en L de chapa
  const placaA = caja(0.03, 0.022, 0.0012, mat.metal, -0.024, -0.0005, -r - 0.0006);
  const placaB = caja(0.03, 0.0012, 0.012, mat.metal, -0.024, -r - 0.0006, -r + 0.004);
  g.add(placaA, placaB);
  return { grupo: g, ledMat, largo };
}

// ---------------------------------------------------------------------
// Placas: ESP32 DevKit V1, ESP32-CAM AI Thinker con base MB, conversor de nivel
// ---------------------------------------------------------------------
function crearDevKit(mat) {
  const g = new THREE.Group();
  const tex = TX.pcb({ ancho: 512, alto: 280, color: '#121418', textos: [
    { texto: 'ESP32 DEVKIT V1', x: 0.56, y: 0.55, tam: 22, negrita: true },
    { texto: 'D25  D26  D27', x: 0.56, y: 0.75, tam: 16 },
    { texto: 'EN', x: 0.07, y: 0.3, tam: 14 }, { texto: 'BOOT', x: 0.07, y: 0.78, tam: 14 },
  ] });
  const pcbMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
  g.add(caja(0.051, 0.0016, 0.028, [mat.negro, mat.negro, pcbMat, mat.negro, mat.negro, mat.negro], 0, 0, 0));
  // módulo WROOM con blindaje metálico y antena
  const lata = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 1, roughness: 0.28, map: TX.pcb({ ancho: 256, alto: 192, color: '#c4c7cc', pista: '#c4c7cc', seda: '#3a3d42', pads: 'ninguno', textos: [
    { texto: 'ESP32-WROOM-32', x: 0.5, y: 0.35, tam: 22, alinear: 'center', negrita: true },
    { texto: 'Wi-Fi + BT', x: 0.5, y: 0.6, tam: 18, alinear: 'center' },
  ] }) });
  g.add(caja(0.018, 0.0028, 0.0155, mat.negro, 0.012, 0.0022, 0));
  g.add(caja(0.0176, 0.0012, 0.0151, lata, 0.0116, 0.0043, 0));
  // micro-USB, botones y chip USB-serie
  g.add(caja(0.006, 0.003, 0.008, mat.metal, -0.024, 0.0023, 0));
  g.add(caja(0.004, 0.0018, 0.003, mat.negro, -0.017, 0.0017, -0.0095));
  g.add(caja(0.004, 0.0018, 0.003, mat.negro, -0.017, 0.0017, 0.0095));
  g.add(caja(0.005, 0.0012, 0.005, mat.negroMate, -0.008, 0.0014, 0));
  // pines (dos filas de 15)
  const pin = new THREE.BoxGeometry(0.0008, 0.008, 0.0008);
  const pines = new THREE.InstancedMesh(pin, mat.metal, 30);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 15; i++) {
    m4.makeTranslation(-0.0225 + i * 0.00254, -0.004, -0.0115); pines.setMatrixAt(i, m4);
    m4.makeTranslation(-0.0225 + i * 0.00254, -0.004, 0.0115); pines.setMatrixAt(15 + i, m4);
  }
  g.add(pines);
  // LED de encendido rojo
  const pwr = new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.0008, 0.0008), new THREE.MeshBasicMaterial({ color: 0xff3030, toneMapped: false }));
  pwr.position.set(-0.014, 0.0013, 0.006);
  g.add(pwr);
  return g;
}

function crearEsp32Cam(mat) {
  const g = new THREE.Group();
  // Eje óptico a lo largo de -z local (convención de cámara). La placa queda en el plano xy.
  const texCam = TX.pcb({ ancho: 256, alto: 384, color: '#141519', textos: [
    { texto: 'ESP32-CAM', x: 0.5, y: 0.82, tam: 26, alinear: 'center', negrita: true },
    { texto: 'AI-Thinker', x: 0.5, y: 0.9, tam: 18, alinear: 'center' },
  ] });
  const texMb = TX.pcb({ ancho: 256, alto: 384, color: '#101114', textos: [
    { texto: 'ESP32-CAM-MB', x: 0.5, y: 0.5, tam: 24, alinear: 'center', negrita: true, rot: 0 },
  ] });
  const pcbCam = new THREE.MeshStandardMaterial({ map: texCam, roughness: 0.5 });
  const pcbMb = new THREE.MeshStandardMaterial({ map: texMb, roughness: 0.5 });
  // placa principal (27 × 40 mm), cara frontal hacia -z
  const placa = caja(0.027, 0.04, 0.0016, [mat.negro, mat.negro, mat.negro, mat.negro, mat.negro, pcbCam], 0, 0, 0);
  g.add(placa);
  // base MB detrás (+z)
  g.add(caja(0.027, 0.04, 0.0016, [mat.negro, mat.negro, mat.negro, mat.negro, pcbMb, mat.negro], 0, 0, 0.0095));
  // conectores hembra entre ambas placas
  for (const x of [-0.0115, 0.0115]) g.add(caja(0.0025, 0.02, 0.008, mat.negroMate, x, -0.004, 0.005));
  g.add(caja(0.0075, 0.0035, 0.0055, mat.metal, 0, -0.0215, 0.0125)); // micro-USB de la MB
  // módulo OV2640: cuadrito con lente
  g.add(caja(0.0085, 0.0085, 0.0018, mat.negroMate, 0, 0.0075, -0.0017));
  const barril = new THREE.Mesh(new THREE.CylinderGeometry(0.0034, 0.0038, 0.0045, 24), mat.negro);
  barril.rotation.x = Math.PI / 2; barril.position.set(0, 0.0075, -0.0045);
  const vidrio = new THREE.Mesh(new THREE.CircleGeometry(0.0025, 24), new THREE.MeshPhysicalMaterial({ color: 0x0a1630, roughness: 0.02, metalness: 0.3, clearcoat: 1 }));
  vidrio.position.set(0, 0.0075, -0.0068); vidrio.rotation.y = Math.PI;
  g.add(barril, vidrio);
  // LED de flash (apagado) y ranura microSD
  g.add(caja(0.004, 0.004, 0.0012, new THREE.MeshStandardMaterial({ color: 0xf2f2e6, roughness: 0.3 }), 0.0075, -0.006, -0.0014));
  g.add(caja(0.014, 0.012, 0.0016, mat.metal, -0.002, -0.012, -0.0016));
  // antena impresa
  g.add(caja(0.006, 0.004, 0.0006, new THREE.MeshStandardMaterial({ color: 0xc89b3c, metalness: 0.8, roughness: 0.3 }), -0.009, 0.017, -0.0009));
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}

// ---------------------------------------------------------------------
// Construcción completa
// ---------------------------------------------------------------------
export function crearMaqueta() {
  const mat = materiales();
  const G = geometriaMaqueta();
  const grupo = new THREE.Group();
  grupo.name = 'maqueta';
  const ayudas = new THREE.Group();   // solo para el usuario: la ESP32-CAM virtual no las ve
  ayudas.name = 'ayudas';
  grupo.add(ayudas);
  const noVisiblesCamara = [ayudas];

  // --- Base 50 × 35 cm
  const base = caja(M.base.ancho, M.base.grosor, M.base.fondo, [mat.canto, mat.canto, mat.base, mat.canto, mat.canto, mat.canto], 0, -M.base.grosor / 2, 0, { sombra: true });
  grupo.add(base);
  // Líneas de pasillo pintadas (flechas verdes de la Figura 2)
  const flechaMat = new THREE.MeshBasicMaterial({ color: 0x1f9d4d, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false });
  const crearFlecha = (x, z0, z1) => {
    const largo = Math.abs(z1 - z0);
    const s = new THREE.Shape();
    const w = 0.0016, cabeza = 0.008;
    s.moveTo(-w, 0); s.lineTo(w, 0); s.lineTo(w, largo - cabeza); s.lineTo(cabeza * 0.6, largo - cabeza);
    s.lineTo(0, largo); s.lineTo(-cabeza * 0.6, largo - cabeza); s.lineTo(-w, largo - cabeza); s.closePath();
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s), flechaMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.0004, z0);
    if (z1 < z0) m.rotation.z = 0; else m.rotation.z = Math.PI;
    m.renderOrder = 1;
    return m;
  };
  const pE = M.puertas[0], pS = M.puertas[1];
  const xE = (pE.x0 + pE.x1) / 2, xS = (pS.x0 + pS.x1) / 2;
  grupo.add(crearFlecha(xE, G.zF - 0.025, G.zPared - 0.06));
  grupo.add(crearFlecha(xS, G.zPared - 0.06, G.zF - 0.025));

  // --- Pared con dos puertas (cartón pluma blanco)
  const H = M.pared.alto, e = M.pared.grosor;
  const tramos = [[G.xL, pE.x0], [pE.x1, pS.x0], [pS.x1, G.xR]];
  for (const [a, b] of tramos) grupo.add(caja(b - a, H, e, mat.pared, (a + b) / 2, H / 2, G.zPared));
  for (const p of M.puertas) {
    const w = p.x1 - p.x0;
    grupo.add(caja(w, H - p.alto, e, mat.pared, (p.x0 + p.x1) / 2, p.alto + (H - p.alto) / 2, G.zPared));
    // cartel verde sobre la puerta
    const cartel = etiqueta(p.nombre, { alto: 0.0085, color: '#ffffff', fondo: '#15803d', tamFuente: 72, relleno: 0.35, radio: 0.15 });
    cartel.material.depthTest = true; cartel.material.depthWrite = true; cartel.material.transparent = false;
    cartel.material.alphaTest = 0.5;
    cartel.position.set((p.x0 + p.x1) / 2, p.alto + (H - p.alto) / 2, G.zPared + e / 2 + 0.0004);
    grupo.add(cartel);
  }
  // Rótulo BIBLIOTECA en la pared
  const rotulo = etiqueta('BIBLIOTECA', { alto: 0.009, color: '#1e293b', fondo: null, tamFuente: 80, relleno: 0.2 });
  rotulo.material.transparent = true;
  rotulo.position.set(0, 0.142, G.zPared + e / 2 + 0.0004);
  grupo.add(rotulo);

  // --- Sensores E18-D80NK y haces
  const sensores = {};
  for (const s of G.sensores) {
    const e18 = crearSensorE18(mat);
    e18.grupo.position.copy(s.origen);
    grupo.add(e18.grupo);
    const haz = crearHaz(s);
    ayudas.add(haz.grupo);
    sensores[s.id] = { ...s, e18, haz, bloqueo: null, detectando: false, brillo: 0 };
    // cable del sensor: baja pegado a la pared y corre por el piso hasta la caja de control
    const x0 = s.origen.x - e18.largo - 0.004;
    const zCable = G.zPared + M.pared.grosor / 2 + 0.0035;
    const pts = [
      V(x0, s.origen.y, s.origen.z),
      V(x0 - 0.007, s.origen.y - 0.006, (s.origen.z + zCable) / 2),
      V(x0 - 0.009, 0.03, zCable),
      V(x0 - 0.007, 0.0028, zCable + 0.001),
      V(x0 + 0.02, 0.0016, zCable + 0.002),
      V(G.caja.x0 - 0.03, 0.0016, zCable + 0.003),
      V(G.caja.x0 - 0.008, 0.0016, G.caja.z0 + 0.012),
      V(G.caja.x0 + 0.004, 0.006, G.caja.z0 + 0.02),
    ];
    const cable = tubo(pts, 0.0011, mat.cable, 120);
    cable.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.2), 160, 0.0011, 8, false);
    grupo.add(cable);
  }

  // --- Caja de control: ESP32, protoboard, conversor, LCD 16×2 y LED
  const C = G.caja;
  const cajaGrupo = new THREE.Group();
  cajaGrupo.position.set((C.x0 + C.x1) / 2, 0, (C.z0 + C.z1) / 2);
  grupo.add(cajaGrupo);
  const cw = C.x1 - C.x0, cd = C.z1 - C.z0, ch = C.alto, pared = 0.003;
  cajaGrupo.add(caja(cw, pared, cd, mat.plasticoCaja, 0, pared / 2, 0));
  cajaGrupo.add(caja(pared, ch, cd, mat.plasticoCaja, -cw / 2 + pared / 2, ch / 2, 0));
  cajaGrupo.add(caja(pared, ch, cd, mat.plasticoCaja, cw / 2 - pared / 2, ch / 2, 0));
  cajaGrupo.add(caja(cw, ch, pared, mat.plasticoCaja, 0, ch / 2, -cd / 2 + pared / 2));
  cajaGrupo.add(caja(cw, ch, pared, mat.plasticoCaja, 0, ch / 2, cd / 2 - pared / 2));
  const tapaAcrilico = caja(cw, 0.002, cd, mat.acrilico, 0, ch + 0.001, 0, { sombra: false, recibe: false });
  tapaAcrilico.renderOrder = 3;
  cajaGrupo.add(tapaAcrilico);
  // tornillos de la tapa
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.001, 12), mat.metal);
    t.position.set(sx * (cw / 2 - 0.005), ch + 0.0025, sz * (cd / 2 - 0.005));
    cajaGrupo.add(t);
  }
  // protoboard + ESP32 DevKit + conversor de nivel (visibles a través del acrílico)
  const proto = new THREE.MeshStandardMaterial({ map: TX.protoboard(), roughness: 0.6 });
  const pb = caja(cw - 0.012, 0.009, 0.082 * 0.66, [mat.plasticoCaja, mat.plasticoCaja, proto, mat.plasticoCaja, mat.plasticoCaja, mat.plasticoCaja], 0, pared + 0.0045, -0.012);
  pb.rotation.y = Math.PI / 2;
  pb.scale.set(1, 1, 1);
  cajaGrupo.add(pb);
  const devkit = crearDevKit(mat);
  devkit.rotation.y = Math.PI / 2;
  devkit.position.set(0, pared + 0.009 + 0.006, -0.012);
  cajaGrupo.add(devkit);
  const conversor = caja(0.016, 0.0016, 0.013, new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.5 }), 0.012, pared + 0.016, 0.03);
  cajaGrupo.add(conversor);
  // cables jumper de colores (I2C al LCD, señales de los sensores)
  const colores = [0xef4444, 0x111827, 0xf59e0b, 0x22c55e, 0x3b82f6, 0xa855f7];
  colores.forEach((c, i) => {
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 });
    const x0 = -0.015 + i * 0.006;
    cajaGrupo.add(tubo([V(x0, pared + 0.016, -0.02 + i * 0.004), V(x0 + 0.004, ch * 0.75, 0.0), V(x0 * 0.6, ch * 0.62, cd / 2 - 0.012), V(x0 * 0.5, ch * 0.62, cd / 2 - pared - 0.002)], 0.0007, m, 24));
  });
  // LCD 16×2 en la cara frontal
  const lcd = new LCD1602({ ancho: 0.058, alto: 0.0165 });
  const marco = caja(0.072, 0.03, 0.006, mat.negro, 0, ch * 0.66, cd / 2 + 0.003, { radio: 0.0015 });
  const pcbLcd = caja(0.076, 0.034, 0.0016, new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.5 }), 0, ch * 0.66, cd / 2 + 0.0002);
  cajaGrupo.add(pcbLcd, marco);
  lcd.malla.position.set(0, ch * 0.66, cd / 2 + 0.0062);
  cajaGrupo.add(lcd.malla);
  // LED rojo de sala llena (D25) con su destello
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x5a0a0a, emissive: COLORES.ledRojo, emissiveIntensity: 0, roughness: 0.2, transparent: true, opacity: 0.95 });
  const led = new THREE.Mesh(new THREE.CapsuleGeometry(0.0025, 0.003, 6, 16), ledMat);
  led.rotation.x = Math.PI / 2;
  led.position.set(-0.018, ch * 0.24, cd / 2 + 0.003);
  const aro = new THREE.Mesh(new THREE.TorusGeometry(0.003, 0.0008, 8, 24), mat.metal);
  aro.position.set(-0.018, ch * 0.24, cd / 2 + 0.0005);
  const ledHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.destello(), color: COLORES.ledRojo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 }));
  ledHalo.scale.setScalar(0.03);
  ledHalo.position.copy(led.position).add(V(0, 0, 0.004));
  cajaGrupo.add(led, aro, ledHalo);
  const ledEtq = etiqueta('SALA LLENA', { alto: 0.0035, color: '#334155', fondo: null, tamFuente: 48, relleno: 0.1 });
  ledEtq.position.set(0.008, ch * 0.24, cd / 2 + 0.0004);
  cajaGrupo.add(ledEtq);
  // cable USB hacia la laptop
  grupo.add(tubo([V(C.x1 - 0.02, 0.01, C.z0 + 0.005), V(C.x1 - 0.02, 0.004, C.z0 - 0.01), V(C.x1 + 0.03, 0.0, C.z0 - 0.01), V(C.x1 + 0.12, -0.012, C.z0 + 0.02), V(C.x1 + 0.2, -0.012, 0.06)], 0.0018, mat.cable, 60));

  // --- Mesa de la sala y cuatro sillas
  const T = M.mesa;
  const mesaGrupo = new THREE.Group();
  mesaGrupo.position.set(T.x, 0, T.z);
  grupo.add(mesaGrupo);
  mesaGrupo.add(caja(T.ancho, 0.004, T.fondo, mat.mesa, 0, T.alto - 0.002, 0, { radio: 0.0008 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    mesaGrupo.add(caja(0.004, T.alto - 0.004, 0.004, mat.mesa, sx * (T.ancho / 2 - 0.005), (T.alto - 0.004) / 2, sz * (T.fondo / 2 - 0.005)));
  }
  const S = M.silla;
  const haloTex = TX.halo();
  const sillas = M.sillas.map((cfg, i) => {
    const sg = new THREE.Group();
    sg.position.set(cfg.x, 0, cfg.z);
    if (cfg.mira < 0) sg.rotation.y = Math.PI; // la silla mira hacia la mesa
    grupo.add(sg);
    const cojinMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.6, emissive: 0x000000, emissiveIntensity: 0.6 });
    const asiento = caja(S.ancho, 0.0035, S.ancho, cojinMat, 0, S.alturaAsiento, 0, { radio: 0.001 });
    sg.add(asiento);
    const respaldo = caja(S.ancho, S.alturaRespaldo - S.alturaAsiento, 0.003, mat.silla, 0, (S.alturaRespaldo + S.alturaAsiento) / 2 + 0.001, -S.ancho / 2 + 0.0015, { radio: 0.001 });
    sg.add(respaldo);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      sg.add(caja(0.0025, S.alturaAsiento, 0.0025, mat.patas, sx * (S.ancho / 2 - 0.002), S.alturaAsiento / 2, sz * (S.ancho / 2 - 0.002)));
    }
    // halo de estado en el suelo
    const haloMat = new THREE.MeshBasicMaterial({ map: haloTex, color: COLORES.sinDato, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.9 });
    const haloM = new THREE.Mesh(new THREE.PlaneGeometry(S.ancho * 2.1, S.ancho * 2.1), haloMat);
    haloM.rotation.x = -Math.PI / 2;
    haloM.position.set(cfg.x, 0.0007, cfg.z);
    haloM.renderOrder = 2;
    ayudas.add(haloM);
    // marcador flotante con el nombre de la zona
    const marcador = etiqueta(cfg.id, { alto: 0.0055, color: '#ffffff', fondo: 'rgba(15,23,42,0.85)', tamFuente: 56, mirar: 'camara', relleno: 0.4 });
    marcador.position.set(cfg.x, S.alturaRespaldo + 0.02, cfg.z);
    ayudas.add(marcador);
    return {
      id: cfg.id, indice: i, grupo: sg, cojinMat, haloMat, halo: haloM, marcador, cfg,
      // punto donde se sienta una silueta (centro del asiento) y hacia dónde mira
      asientoPos: V(cfg.x, S.alturaAsiento + 0.002, cfg.z),
      mira: cfg.mira,
      estado: 'sinDato', pulso: 0,
    };
  });

  // --- Poste de 27 cm con la ESP32-CAM
  const P = M.poste;
  const poste = caja(0.009, P.alto, 0.009, mat.aluminio, P.x, P.alto / 2, P.z);
  const pie = caja(0.03, 0.003, 0.03, mat.aluminio, P.x, 0.0015, P.z, { radio: 0.001 });
  grupo.add(poste, pie);
  const camGrupo = crearEsp32Cam(mat);
  const objetivo = V(M.mesa.x, 0.028, (M.sillas[0].z + M.sillas[2].z) / 2);
  const posCam = V(P.x - 0.006, P.alto + 0.006, P.z + 0.006);
  camGrupo.position.copy(posCam);
  camGrupo.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(posCam, objetivo, V(0, 1, 0)));
  grupo.add(camGrupo);
  // brazo que une la cámara al poste
  grupo.add(tubo([V(P.x, P.alto, P.z), V(P.x - 0.003, P.alto + 0.004, P.z + 0.003), posCam.clone()], 0.0022, mat.aluminio, 12));
  // cable USB de la base MB bajando por el poste
  grupo.add(tubo([posCam.clone().add(V(0.004, -0.004, 0.012)), V(P.x + 0.007, P.alto - 0.02, P.z + 0.002), V(P.x + 0.007, 0.02, P.z + 0.002), V(P.x + 0.015, 0.002, P.z + 0.02), V(G.xR - 0.002, 0.002, P.z + 0.04), V(G.xR + 0.06, -0.012, P.z + 0.08), V(G.xR + 0.22, -0.012, 0.0)], 0.0016, mat.cable, 90));
  // pose óptica de la cámara (la lente mira hacia -z local del grupo)
  const lenteLocal = V(0, 0.0075, -0.007);
  const camaraPose = {
    posicion: lenteLocal.clone().applyQuaternion(camGrupo.quaternion).add(posCam),
    quaternion: camGrupo.quaternion.clone(),
    objetivo,
  };

  // Pirámide de visión de la cámara (ayuda visual)
  const piramide = crearPiramideVision(camaraPose);
  ayudas.add(piramide);

  // Etiquetas explicativas (se pueden ocultar)
  const rotulos = new THREE.Group();
  ayudas.add(rotulos);
  const agregarRotulo = (texto, pos) => {
    const r = etiqueta(texto, { alto: 0.0085, color: '#f1f5f9', fondo: 'rgba(15,23,42,0.88)', borde: 'rgba(56,189,248,0.7)', tamFuente: 56, mirar: 'camara' });
    r.position.copy(pos);
    rotulos.add(r);
    return r;
  };
  agregarRotulo('S1 · entrada (suma)', V(G.sensores[0].origen.x - 0.024, 0.112, G.zHaz + 0.012));
  agregarRotulo('S2 · salida (resta)', V(G.sensores[1].origen.x - 0.024, 0.112, G.zHaz + 0.012));
  agregarRotulo('Caja de control · ESP32 + LCD + LED', V((C.x0 + C.x1) / 2 - 0.02, C.alto + 0.035, (C.z0 + C.z1) / 2));
  agregarRotulo('ESP32-CAM (poste de 27 cm)', V(P.x - 0.02, P.alto + 0.045, P.z));

  return {
    grupo, ayudas, rotulos, noVisiblesCamara, mat, G,
    sensores, sillas, lcd, led: { mat: ledMat, halo: ledHalo, encendido: false },
    camaraPose, piramide, camGrupo,
    dims: { ancho: M.base.ancho, fondo: M.base.fondo },
  };
}

function crearPiramideVision(pose) {
  const g = new THREE.Group();
  const fovH = THREE.MathUtils.degToRad(CAMARA.fovHorizontal);
  const asp = CAMARA.ancho / CAMARA.alto;
  const d = 0.33;
  const w = Math.tan(fovH / 2) * d, h = w / asp;
  const esquinas = [V(-w, h, -d), V(w, h, -d), V(w, -h, -d), V(-w, -h, -d)];
  const pts = [];
  for (const c of esquinas) pts.push(V(0, 0, 0), c);
  for (let i = 0; i < 4; i++) pts.push(esquinas[i], esquinas[(i + 1) % 4]);
  const lineas = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: COLORES.acento, transparent: true, opacity: 0.55, toneMapped: false }));
  g.add(lineas);
  g.position.copy(pose.posicion);
  g.quaternion.copy(pose.quaternion);
  return g;
}

// ---------------------------------------------------------------------
// Sala de exposición: piso de madera, mesa, laptop, estantes y pantalla mural.
// ---------------------------------------------------------------------
export function crearSalaExpo(mat) {
  const g = new THREE.Group();
  g.name = 'salaExpo';
  const ancho = 12, fondo = 10, alto = 3.4;
  // piso
  const piso = TX.madera({ tam: 1024, tablones: 8, claro: 0xcfb08a, oscuro: 0x9f7a52, semilla: 31, vetas: 5 });
  for (const t of [piso.map, piso.normalMap, piso.roughnessMap]) t.repeat.set(4, 4);
  const pisoM = new THREE.Mesh(new THREE.PlaneGeometry(ancho, fondo), new THREE.MeshStandardMaterial({ map: piso.map, normalMap: piso.normalMap, roughnessMap: piso.roughnessMap, roughness: 0.6, envMapIntensity: 0.6 }));
  pisoM.rotation.x = -Math.PI / 2;
  pisoM.receiveShadow = true;
  g.add(pisoM);
  // paredes y techo
  const yeso = TX.grano({ tam: 256, base: 0xeceae4, variacion: 0.03, escala: 6, semilla: 5, fuerzaNormal: 0.4 });
  yeso.map.repeat.set(6, 2); yeso.normalMap.repeat.set(6, 2);
  const paredMat = new THREE.MeshStandardMaterial({ map: yeso.map, normalMap: yeso.normalMap, roughness: 0.95 });
  const paredFondo = new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), paredMat);
  paredFondo.position.set(0, alto / 2, -fondo / 2);
  const paredIzq = new THREE.Mesh(new THREE.PlaneGeometry(fondo, alto), paredMat);
  paredIzq.position.set(-ancho / 2, alto / 2, 0); paredIzq.rotation.y = Math.PI / 2;
  const paredFrente = new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), paredMat);
  paredFrente.position.set(0, alto / 2, fondo / 2); paredFrente.rotation.y = Math.PI;
  const techo = new THREE.Mesh(new THREE.PlaneGeometry(ancho, fondo), new THREE.MeshStandardMaterial({ color: 0xf3f2ee, roughness: 1 }));
  techo.position.y = alto; techo.rotation.x = Math.PI / 2;
  g.add(paredFondo, paredIzq, paredFrente, techo);
  // zócalo
  const zocaloMat = new THREE.MeshStandardMaterial({ color: 0x8f8b84, roughness: 0.7 });
  g.add(caja(ancho, 0.1, 0.02, zocaloMat, 0, 0.05, -fondo / 2 + 0.01, { sombra: false }));
  g.add(caja(0.02, 0.1, fondo, zocaloMat, -ancho / 2 + 0.01, 0.05, 0, { sombra: false }));
  // ventanal a la derecha: luz de día
  const ventanal = new THREE.Group();
  const vidrioLuz = new THREE.Mesh(new THREE.PlaneGeometry(fondo, alto), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.68, 1.75), toneMapped: true }));
  vidrioLuz.position.set(ancho / 2 + 0.05, alto / 2, 0); vidrioLuz.rotation.y = -Math.PI / 2;
  ventanal.add(vidrioLuz);
  const marcoMat = new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.4, metalness: 0.6 });
  for (let i = 0; i <= 6; i++) ventanal.add(caja(0.08, alto, 0.08, marcoMat, ancho / 2, alto / 2, -fondo / 2 + i * (fondo / 6), { sombra: false }));
  ventanal.add(caja(0.1, 0.12, fondo, marcoMat, ancho / 2, 0.06, 0, { sombra: false }));
  ventanal.add(caja(0.1, 0.1, fondo, marcoMat, ancho / 2, 2.3, 0, { sombra: false }));
  g.add(ventanal);
  // luminarias empotradas
  const luzMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.1, 1.95), toneMapped: true });
  for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) {
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.14, 32), luzMat);
    l.rotation.x = Math.PI / 2; l.position.set(i * 2.2, alto - 0.005, j * 2.6);
    g.add(l);
  }
  // estanterías de biblioteca en la pared izquierda
  g.add(crearEstanteria(-ancho / 2 + 0.2, -2.4, Math.PI / 2, 4.6, 33));
  g.add(crearEstanteria(-ancho / 2 + 0.2, 2.4, Math.PI / 2, 4.6, 34));

  // mesa de exposición (tablero de madera, patas de acero)
  const ME = { ancho: 1.5, fondo: 0.9, alto: 0.76 };
  const mesa = new THREE.Group();
  mesa.add(caja(ME.ancho, 0.035, ME.fondo, mat.maderaExpo, 0, ME.alto - 0.0175, 0, { radio: 0.006 }));
  const acero = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.35, metalness: 0.8 });
  for (const sx of [-1, 1]) {
    mesa.add(caja(0.05, ME.alto - 0.035, 0.05, acero, sx * (ME.ancho / 2 - 0.08), (ME.alto - 0.035) / 2, ME.fondo / 2 - 0.08));
    mesa.add(caja(0.05, ME.alto - 0.035, 0.05, acero, sx * (ME.ancho / 2 - 0.08), (ME.alto - 0.035) / 2, -ME.fondo / 2 + 0.08));
  }
  mesa.add(caja(ME.ancho - 0.2, 0.04, 0.03, acero, 0, 0.12, 0));
  g.add(mesa);
  // sombra suave bajo la mesa
  const sombra = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.7), new THREE.MeshBasicMaterial({ map: TX.sombraSuave(), transparent: true, depthWrite: false, opacity: 0.7 }));
  sombra.rotation.x = -Math.PI / 2; sombra.position.y = 0.002;
  g.add(sombra);

  // laptop junto a la maqueta (su pantalla muestra el tablero de BiblioAforo)
  const laptop = new THREE.Group();
  const aluminio = new THREE.MeshStandardMaterial({ color: 0x9ea4ad, roughness: 0.35, metalness: 0.85 });
  laptop.add(caja(0.33, 0.012, 0.225, aluminio, 0, 0.006, 0, { radio: 0.004 }));
  const teclado = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.1), new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.8 }));
  teclado.rotation.x = -Math.PI / 2; teclado.position.set(0, 0.0125, -0.03);
  laptop.add(teclado);
  const bisagra = new THREE.Group();
  bisagra.position.set(0, 0.012, -0.1125);
  bisagra.rotation.x = -0.32;
  bisagra.add(caja(0.33, 0.215, 0.007, aluminio, 0, 0.1075, -0.0035, { radio: 0.004 }));
  const pantallaLaptop = new Pantalla({ ancho: 0.305, alto: 0.19, px: 1024 });
  pantallaLaptop.malla.position.set(0, 0.1075, 0.0002);
  bisagra.add(pantallaLaptop.malla);
  laptop.add(bisagra);
  laptop.position.set(0.5, ME.alto, 0.12);
  laptop.rotation.y = -0.45;
  g.add(laptop);

  // pantalla mural con el tablero en vivo
  const mural = new THREE.Group();
  const pantallaMural = new Pantalla({ ancho: 3.2, alto: 1.8, px: 2048, brillo: 0.95 });
  mural.add(caja(3.3, 1.9, 0.05, new THREE.MeshStandardMaterial({ color: 0x0f1115, roughness: 0.4, metalness: 0.3 }), 0, 0, -0.03, { sombra: false }));
  pantallaMural.malla.position.z = 0.0;
  mural.add(pantallaMural.malla);
  mural.position.set(0, 1.85, -fondo / 2 + 0.06);
  g.add(mural);

  // planta decorativa
  g.add(crearPlanta(-4.6, 3.8));
  g.add(crearPlanta(4.9, -4.2));

  return {
    grupo: g, mesaAlto: ME.alto, pantallaLaptop, pantallaMural,
    limites: { x0: -ancho / 2 + 0.4, x1: ancho / 2 - 0.4, z0: -fondo / 2 + 0.4, z1: fondo / 2 - 0.4 },
    obstaculos: [{ x0: -ME.ancho / 2 - 0.1, x1: ME.ancho / 2 + 0.1, z0: -ME.fondo / 2 - 0.1, z1: ME.fondo / 2 + 0.1 }],
  };
}

// Estantería con libros (instancias): sirve aquí y en la biblioteca.
export function crearEstanteria(x, z, rotY, largo = 4, semilla = 1, alto = 2.2, baldas = 6) {
  const g = new THREE.Group();
  const r = TX.azar(semilla);
  const madera = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.7 });
  const fondoMat = new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.85 });
  const prof = 0.32;
  g.add(caja(largo, alto, 0.02, fondoMat, 0, alto / 2, -prof / 2, { sombra: false }));
  for (let i = 0; i <= baldas; i++) g.add(caja(largo, 0.025, prof, madera, 0, 0.06 + i * ((alto - 0.1) / baldas), 0, { sombra: false }));
  const modulos = Math.round(largo / 0.9);
  for (let i = 0; i <= modulos; i++) g.add(caja(0.025, alto, prof, madera, -largo / 2 + i * (largo / modulos), alto / 2, 0, { sombra: false }));
  // libros
  const libros = [];
  for (let b = 0; b < baldas; b++) {
    const y0 = 0.06 + b * ((alto - 0.1) / baldas) + 0.0125;
    let xx = -largo / 2 + 0.03;
    while (xx < largo / 2 - 0.05) {
      const grosor = 0.018 + r() * 0.035;
      const altoL = 0.2 + r() * 0.12;
      if (r() < 0.06) { xx += 0.05 + r() * 0.1; continue; }
      libros.push({ x: xx + grosor / 2, y: y0 + altoL / 2, w: grosor, h: altoL, d: 0.17 + r() * 0.07, inc: r() < 0.05 ? (r() - 0.5) * 0.3 : 0 });
      xx += grosor + 0.001;
    }
  }
  const tex = TX.lomos();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }), libros.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const paleta = [0x7f1d1d, 0x1e3a8a, 0x14532d, 0x78350f, 0x312e81, 0x3f3f46, 0x9a3412, 0x115e59, 0x581c87, 0xa16207, 0x334155, 0x991b1b, 0xe7e5e4, 0x0c4a6e];
  const col = new THREE.Color();
  libros.forEach((l, i) => {
    e.set(0, 0, l.inc); q.setFromEuler(e);
    p.set(l.x, l.y, -prof / 2 + 0.01 + l.d / 2); s.set(l.w, l.h, l.d);
    m4.compose(p, q, s); inst.setMatrixAt(i, m4);
    col.setHex(paleta[Math.floor(r() * paleta.length)]).multiplyScalar(0.75 + r() * 0.4);
    inst.setColorAt(i, col);
  });
  inst.instanceMatrix.needsUpdate = true;
  g.add(inst);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

function crearPlanta(x, z) {
  const g = new THREE.Group();
  const maceta = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.42, 32), new THREE.MeshStandardMaterial({ color: 0xd9d3c7, roughness: 0.8 }));
  maceta.position.y = 0.21; maceta.castShadow = true;
  g.add(maceta);
  const hojaMat = new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.6, side: THREE.DoubleSide });
  const r = TX.azar(Math.round(x * 100 + z));
  for (let i = 0; i < 26; i++) {
    const hoja = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 6), hojaMat);
    hoja.scale.set(0.35, 1, 0.08 + r() * 0.05);
    const a = r() * Math.PI * 2, rad = 0.05 + r() * 0.12;
    hoja.position.set(Math.cos(a) * rad, 0.55 + r() * 0.6, Math.sin(a) * rad);
    hoja.rotation.set((r() - 0.5) * 1.2, a, (r() - 0.5) * 0.9);
    hoja.castShadow = true;
    g.add(hoja);
  }
  g.position.set(x, 0, z);
  return g;
}
