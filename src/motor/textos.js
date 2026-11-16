// Textos en 3D: etiquetas nítidas, pantalla LCD 16×2 de matriz de puntos y pantallas genéricas.
import * as THREE from 'three';
import { lienzo } from './texturas.js';

export const FUENTE = '"Segoe UI", "Inter", Roboto, "Helvetica Neue", Arial, sans-serif';

export function textura(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export function rectRedondo(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Etiqueta: un plano con texto. alto = altura de la etiqueta en metros.
// mirar: 'camara' para que siempre mire al usuario (sprite).
export function etiqueta(texto, {
  alto = 0.02, color = '#ffffff', fondo = 'rgba(10,16,28,0.78)', borde = null, negrita = true,
  tamFuente = 64, relleno = 0.45, radio = 0.35, mirar = null, lineas = null, alinear = 'center',
  sobreTodo = false, opacidad = 1,
} = {}) {
  const ls = lineas || String(texto).split('\n');
  const c = lienzo(8, 8), ctx = c.getContext('2d');
  const fuente = `${negrita ? '700' : '500'} ${tamFuente}px ${FUENTE}`;
  ctx.font = fuente;
  const anchoTxt = Math.max(...ls.map((l) => ctx.measureText(l).width));
  const pad = tamFuente * relleno;
  const altoLinea = tamFuente * 1.22;
  c.width = Math.ceil(anchoTxt + pad * 2);
  c.height = Math.ceil(altoLinea * ls.length + pad * 1.2);
  const g = c.getContext('2d');
  if (fondo) {
    g.fillStyle = fondo;
    rectRedondo(g, 2, 2, c.width - 4, c.height - 4, Math.min(c.height, c.width) * radio * 0.5);
    g.fill();
    if (borde) { g.strokeStyle = borde; g.lineWidth = 4; g.stroke(); }
  }
  g.font = fuente;
  g.fillStyle = color;
  g.textBaseline = 'middle';
  g.textAlign = alinear;
  const x = alinear === 'center' ? c.width / 2 : pad;
  ls.forEach((l, i) => g.fillText(l, x, pad * 0.6 + altoLinea * (i + 0.5)));
  const tex = textura(c);
  const aspecto = c.width / c.height;
  // "alto" es la altura de una línea de texto; el fondo agrega su margen.
  const altoTotal = c.height * (alto / altoLinea);
  let obj;
  if (mirar === 'camara') {
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: !sobreTodo, opacity: opacidad, toneMapped: false });
    obj = new THREE.Sprite(mat);
    obj.scale.set(altoTotal * aspecto, altoTotal, 1);
  } else {
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: !sobreTodo, side: THREE.DoubleSide, opacity: opacidad, toneMapped: false });
    obj = new THREE.Mesh(new THREE.PlaneGeometry(altoTotal * aspecto, altoTotal), mat);
  }
  if (sobreTodo) obj.renderOrder = 10;
  obj.userData.ancho = altoTotal * aspecto;
  obj.userData.alto = altoTotal;
  return obj;
}

// ---------------------------------------------------------------------
// Pantalla LCD 16×2 (HD44780) con caracteres de 5×7 puntos, retroiluminación verde.
// ---------------------------------------------------------------------
const GLIFOS = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  'D': ['###..', '#..#.', '#...#', '#...#', '#...#', '#..#.', '###..'],
  'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  'G': ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'I': ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  'J': ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  'N': ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  'Y': ['#...#', '#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..'],
  'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '/': ['.....', '....#', '...#.', '..#..', '.#...', '#....', '.....'],
  '%': ['##...', '##..#', '...#.', '..#..', '.#...', '#..##', '...##'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

export class LCD1602 {
  constructor({ ancho = 0.064, alto = 0.016, fondo = 'verde' } = {}) {
    this.cols = 16; this.filas = 2;
    this.punto = 6; this.hueco = 1;
    const celdaW = 5 * (this.punto + this.hueco) + 4;
    const celdaH = 8 * (this.punto + this.hueco) + 6;
    this.celdaW = celdaW; this.celdaH = celdaH;
    this.margen = 18;
    this.c = lienzo(this.cols * celdaW + this.margen * 2, this.filas * celdaH + this.margen * 2);
    this.ctx = this.c.getContext('2d');
    this.textura = textura(this.c);
    this.paleta = fondo === 'azul'
      ? { luz: '#2f6bff', luz2: '#1a46c9', apagado: 'rgba(255,255,255,0.08)', encendido: '#eaf2ff' }
      : { luz: '#a8d43f', luz2: '#7fb02b', apagado: 'rgba(30,60,10,0.13)', encendido: '#1f330c' };
    this.material = new THREE.MeshStandardMaterial({
      map: this.textura, emissiveMap: this.textura, emissive: 0xffffff, emissiveIntensity: 0.55,
      roughness: 0.35, metalness: 0,
    });
    this.malla = new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), this.material);
    this.lineas = ['', ''];
    this.escribir('BIBLIOAFORO', 'INICIANDO...');
  }

  escribir(l1 = '', l2 = '') {
    l1 = String(l1).toUpperCase().padEnd(16).slice(0, 16);
    l2 = String(l2).toUpperCase().padEnd(16).slice(0, 16);
    if (l1 === this.lineas[0] && l2 === this.lineas[1]) return;
    this.lineas = [l1, l2];
    const { ctx, c } = this;
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, this.paleta.luz); g.addColorStop(1, this.paleta.luz2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    for (let f = 0; f < 2; f++) {
      const linea = this.lineas[f];
      for (let k = 0; k < 16; k++) {
        const glifo = GLIFOS[linea[k]] || GLIFOS[' '];
        const ox = this.margen + k * this.celdaW + 2;
        const oy = this.margen + f * this.celdaH + 3;
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 5; x++) {
            const on = y < 7 && glifo[y][x] === '#';
            ctx.fillStyle = on ? this.paleta.encendido : this.paleta.apagado;
            ctx.fillRect(ox + x * (this.punto + this.hueco), oy + y * (this.punto + this.hueco), this.punto, this.punto);
          }
        }
      }
    }
    this.textura.needsUpdate = true;
  }
}

// Pantalla genérica: un plano con un canvas que se redibuja con una función.
export class Pantalla {
  constructor({ ancho = 1, alto = 0.5, px = 1024, emisiva = true, brillo = 1 } = {}) {
    this.c = lienzo(px, Math.round(px * alto / ancho));
    this.ctx = this.c.getContext('2d');
    this.textura = textura(this.c);
    this.material = emisiva
      ? new THREE.MeshBasicMaterial({ map: this.textura, toneMapped: false, color: new THREE.Color(brillo, brillo, brillo) })
      : new THREE.MeshStandardMaterial({ map: this.textura, roughness: 0.4 });
    this.malla = new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), this.material);
  }
  dibujar(fn) {
    fn(this.ctx, this.c.width, this.c.height);
    this.textura.needsUpdate = true;
  }
}
