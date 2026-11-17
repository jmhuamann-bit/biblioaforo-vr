// Material de las personas: el mismo material estándar de la escena (luces, reflejos, niebla) con
// tres agregados en el shader:
//  1) Esqueleto en la GPU: cada vértice se mueve con dos huesos cuyas matrices vienen de una
//     textura (11 huesos × persona). Así cientos de personas se animan con muy pocas llamadas.
//  2) Color por región (piel, prendas, zapatos, pelo, accesorios) con los colores de cada persona;
//     patrones (rayas, cuadros, casaca abierta), mezclilla, pliegues y arrugas con relieve.
//  3) Rostro: atlas de expresiones con parpadeo y boca que habla; cejas, labios y barba teñidos.
import * as THREE from 'three';

export const tiempoHumanos = { value: 0 };

const DECL_V = /* glsl */ `
uniform highp sampler2D uHuesos;
uniform float uTiempo;
attribute vec4 aHueso;
attribute vec4 aExtra;
attribute vec2 aUv;
attribute vec4 iA;
attribute vec4 iForma;
attribute vec4 iCol;
attribute vec4 iCol2;
attribute vec4 iRopa;
varying vec3 vBase;
varying vec3 vAux;
varying vec4 vInfo;
varying vec3 vObj;
varying vec2 vUvH;
vec3 hDesempacar(float c) {
  float r = floor(c / 65536.0);
  float g = floor((c - r * 65536.0) / 256.0);
  float b = c - r * 65536.0 - g * 256.0;
  vec3 s = vec3(r, g, b) / 255.0;
  return mix(s / 12.92, pow((s + 0.055) / 1.055, vec3(2.4)), step(0.04045, s));
}
mat4 hMatriz(int b, int slot) {
  vec4 r0 = texelFetch(uHuesos, ivec2(b * 3, slot), 0);
  vec4 r1 = texelFetch(uHuesos, ivec2(b * 3 + 1, slot), 0);
  vec4 r2 = texelFetch(uHuesos, ivec2(b * 3 + 2, slot), 0);
  return mat4(r0.x, r1.x, r2.x, 0.0, r0.y, r1.y, r2.y, 0.0, r0.z, r1.z, r2.z, 0.0, r0.w, r1.w, r2.w, 1.0);
}
`;

const NORMAL_V = /* glsl */ `
int hSlot = int(iA.x + 0.5);
mat4 hMA = hMatriz(int(aHueso.x + 0.5), hSlot);
mat4 hMB = hMatriz(int(aHueso.y + 0.5), hSlot);
float hW = aHueso.z;
vec3 objectNormal = normalize(mat3(hMA) * normal * (1.0 - hW) + mat3(hMB) * normal * hW);
#ifdef USE_TANGENT
  vec3 objectTangent = vec3(tangent.xyz);
#endif
`;

const POS_V = /* glsl */ `
float hRegion = aHueso.w;
float hAncho = floor(aExtra.w) / 100.0;
float hPliegue = fract(aExtra.w);
vec3 hReposo = position + aExtra.xyz * iForma.x + normal * hAncho * (iForma.y - 0.4) * 0.05;
vec3 transformed = (hMA * vec4(hReposo, 1.0)).xyz * (1.0 - hW) + (hMB * vec4(hReposo, 1.0)).xyz * hW;
// prendas opcionales: falda (11) y capucha (12) solo si la persona las lleva
if ((hRegion > 10.5 && hRegion < 11.5 && iRopa.y < 1.5) || (hRegion > 11.5 && hRegion < 12.5 && iRopa.z < 0.5)) transformed = vec3(0.0, -60.0, 0.0);
vObj = position;
vUvH = aUv;
// solo se desempacan los dos colores que usa la región (piel y pelo por defecto)
int hR = int(hRegion + 0.5);
float hCB = iCol.x;
float hCA = iCol.y;
float hExtra = -1.0;
if (hR == 1 || hR == 12) { hCB = iCol.z; hCA = iCol2.x; hExtra = iRopa.w; }
else if (hR == 5) { if (iRopa.x > 0.5) { hCB = iCol.z; hCA = iCol2.x; hExtra = iRopa.w; } }
else if (hR == 2 || hR == 7) { hCB = iCol.w; hExtra = iA.w; }
else if (hR == 11) { hCB = iCol.w; hExtra = 20.0; }
else if (hR == 6) { if (iRopa.y < 0.5) { hCB = iCol.w; hExtra = iA.w; } else if (iRopa.y > 1.5) { hCB = iCol2.w; } }
else if (hR == 3) { hCB = iCol2.y; }
else if (hR == 4) { hExtra = iForma.w; }
else if (hR == 8) { hCB = iCol.y; }
else if (hR == 10 || hR == 13) { hCB = iCol2.z; hExtra = 30.0; }
vec3 hBase = hDesempacar(hCB);
vec3 hAux = hDesempacar(hCA);
if (hR == 9) hBase = mix(vec3(0.012), vec3(0.11, 0.06, 0.03), step(0.55, fract(iA.z * 7.0)));
// rostro: expresión, parpadeo cada pocos segundos y boca que se mueve al hablar
float hCelda = iA.y;
float hParpadeo = fract(uTiempo / (2.8 + iA.z * 2.6) + iA.z * 13.0);
if (hParpadeo < 0.04 && hCelda < 3.5) hCelda = 4.0;
if (hCelda > 4.5 && hCelda < 5.5) hCelda = fract(uTiempo * 3.2 + iA.z * 5.0) < 0.55 ? 5.0 : 0.0;
vBase = hBase;
vAux = hAux;
vInfo = vec4(hRegion, hCelda, hPliegue, hExtra);
`;

const DECL_F = /* glsl */ `
uniform sampler2D uRostro;
uniform sampler2D uRostroM;
uniform sampler2D uTela;
uniform sampler2D uPelo;
varying vec3 vBase;
varying vec3 vAux;
varying vec4 vInfo;
varying vec3 vObj;
varying vec2 vUvH;
float hRugosidad;
float hRelieve;
`;

const COLOR_F = /* glsl */ `
int hRg = int(vInfo.x + 0.5);
vec3 hCol = vBase;
hRugosidad = 0.84;
hRelieve = 0.0;
float hAng = atan(vObj.x, vObj.z + 0.004);
if (hRg == 4) {
  hRugosidad = 0.56;
  if (vUvH.x >= 0.0) {
    float celda = vInfo.y;
    vec2 cc = vec2(mod(celda, 4.0), 1.0 - floor(celda / 4.0));
    vec2 auv = (cc + clamp(vUvH, 0.002, 0.998)) / vec2(4.0, 2.0);
    vec3 m = texture2D(uRostroM, auv).rgb;
    vec4 f = texture2D(uRostro, auv);
    hCol *= mix(0.58, 1.0, m.r);
    float barba = vInfo.w;
    if (barba > 0.01) {
      float zona = smoothstep(0.37, 0.24, vUvH.y) * smoothstep(0.47, 0.34, abs(vUvH.x - 0.5));
      zona = max(zona, smoothstep(0.305, 0.285, vUvH.y) * smoothstep(0.255, 0.27, vUvH.y) * smoothstep(0.2, 0.14, abs(vUvH.x - 0.5)));
      hCol = mix(hCol, vAux * 0.5, zona * barba * 0.8 * (1.0 - m.b));
    }
    hCol = mix(hCol, vAux * 0.42 + 0.015, m.g * 0.9);
    hCol = mix(hCol, vBase * vec3(0.8, 0.48, 0.46), m.b * 0.75);
    hCol = mix(hCol, f.rgb, f.a);
  }
} else if (hRg == 0) {
  hRugosidad = 0.6;
} else if (hRg == 8) {
  vec2 puv = vec2(hAng / 6.2832 * 7.0, vObj.y * 7.0);
  vec4 pm = texture2D(uPelo, puv);
  hCol = vBase * (0.62 + 0.62 * pm.r) * (0.9 + 0.2 * pm.g);
  hRelieve = (pm.r - 0.5) * 0.35;
  hRugosidad = 0.64;
} else if (hRg == 3) {
  if (vObj.y < 0.024) hCol = dot(vBase, vec3(0.333)) > 0.35 ? vec3(0.82) : vec3(0.025);
  else if (vObj.y < 0.03) hCol *= 0.7;
  hRugosidad = 0.5;
} else if (hRg == 9) {
  hRugosidad = 0.28;
} else if (vInfo.w >= 0.0) {
  // tela
  vec2 tuv = vec2(hAng / 6.2832 * 4.0, vObj.y * 3.0);
  vec4 t = texture2D(uTela, tuv);
  vec4 t2 = texture2D(uTela, tuv * 0.37 + 0.31);
  bool arriba = (hRg == 1 || hRg == 5 || hRg == 12);
  if (arriba) {
    float patron = vInfo.w;
    if (patron > 0.5 && patron < 1.5) hCol = mix(hCol, vAux, step(0.55, fract(vObj.y * 26.0)) * 0.9);
    else if (patron > 1.5 && patron < 2.5) {
      float a1 = smoothstep(0.42, 0.5, fract(vObj.y * 13.0)) * smoothstep(0.98, 0.9, fract(vObj.y * 13.0));
      float a2 = smoothstep(0.42, 0.5, fract(hAng * 4.5)) * smoothstep(0.98, 0.9, fract(hAng * 4.5));
      hCol = mix(hCol, vAux, clamp(0.5 * a1 + 0.5 * a2, 0.0, 0.85));
      hCol *= 1.0 - 0.15 * step(0.92, fract(vObj.y * 52.0));
    } else if (patron > 2.5 && hRg == 1 && vObj.z > 0.02 && abs(vObj.x) < 0.048 + (vObj.y - 1.0) * 0.06 && vObj.y > 1.0) {
      hCol = vAux;
    }
    hCol *= 0.9 + 0.2 * t.r;
  } else if (vInfo.w > 25.0) {
    hCol *= 0.86 + 0.28 * t.r;
  } else {
    float denim = mod(vInfo.w, 10.0);
    if (denim > 0.5 && vInfo.w < 15.0) hCol *= 0.8 + 0.4 * t.g;
    else hCol *= 0.9 + 0.2 * t.r;
  }
  float pl = vInfo.z;
  float ondas = sin(vObj.y * 155.0 + t2.b * 9.0 + hAng * 2.0);
  if (hRg == 11) ondas = sin(hAng * 22.0 + t2.b * 4.0);
  hCol *= 1.0 - 0.17 * pl * max(0.0, ondas) - 0.07 * (t2.b - 0.5);
  hRelieve = (t.r - 0.5) * 0.08 + pl * ondas * 0.9 + (t2.b - 0.5) * 0.6;
  hRugosidad = 0.9;
}
diffuseColor.rgb = hCol;
`;

const RELIEVE_F = /* glsl */ `
{
  vec3 hPos = -vViewPosition;
  vec3 dpx = dFdx(hPos), dpy = dFdy(hPos);
  float dhx = dFdx(hRelieve), dhy = dFdy(hRelieve);
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  normal = normalize(abs(det) * normal - grad * 0.004);
}
`;

export function materialHumanos({ huesos, rostro, rostroMascara, tela, pelo }) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84, metalness: 0, envMapIntensity: 0.6 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHuesos = { value: huesos };
    sh.uniforms.uTiempo = tiempoHumanos;
    sh.uniforms.uRostro = { value: rostro };
    sh.uniforms.uRostroM = { value: rostroMascara };
    sh.uniforms.uTela = { value: tela };
    sh.uniforms.uPelo = { value: pelo };
    sh.vertexShader = DECL_V + sh.vertexShader
      .replace('#include <beginnormal_vertex>', NORMAL_V)
      .replace('#include <begin_vertex>', POS_V);
    sh.fragmentShader = DECL_F + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>\n${COLOR_F}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = hRugosidad;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${RELIEVE_F}`);
  };
  mat.customProgramCacheKey = () => 'biblioaforo-humanos-1';
  return mat;
}
