// =====================================================================
// BiblioAforo VR · Parámetros del gemelo digital
// Todas las medidas están en metros y salen del Informe Final (Figura 2,
// secciones 3.2, 5.1 y Anexos A y B). Si la maqueta real tiene otras
// medidas, basta con cambiarlas aquí: el modelo 3D se rehace solo.
// =====================================================================

export const MAQUETA = {
  // Base de 50 × 35 cm (x = ancho, z = fondo; +z es el frente, donde está el pasillo)
  base: { ancho: 0.50, fondo: 0.35, grosor: 0.012 },

  // Pared de 16 cm que separa el pasillo (adelante) de la sala de estudio (atrás).
  // En la planta está a 15 cm del borde frontal.
  pared: { alto: 0.16, grosor: 0.006, distanciaAlFrente: 0.15 },

  // Dos puertas de 12 × 14 cm. x0 y x1 se miden desde el centro de la base.
  puertas: [
    { id: 'entrada', nombre: 'ENTRADA', sensor: 'S1', x0: -0.17, x1: -0.05, alto: 0.14 },
    { id: 'salida', nombre: 'SALIDA', sensor: 'S2', x0: 0.05, x1: 0.17, alto: 0.14 },
  ],

  // Sensores E18-D80NK en la jamba izquierda de cada puerta, a 7 cm de altura,
  // apuntando en horizontal. El potenciómetro deja el alcance en ≈10 cm (menos que la puerta).
  sensor: { altura: 0.07, alcance: 0.10, aperturaGrados: 15, separacionPared: 0.012 },

  // Caja de control en la esquina frontal derecha (ESP32, protoboard, LCD y LED).
  caja: { ancho: 0.08, fondo: 0.11, alto: 0.08 },

  // Mesa con cuatro sillas en la sala (planta de la Figura 2b).
  mesa: { x: 0.0, z: -0.096, ancho: 0.14, fondo: 0.06, alto: 0.044 },

  // Sillas y zonas de la ESP32-CAM. Si en tu maqueta la zona A1 corresponde
  // a otra silla, cambia aquí el orden (A1 arriba-izquierda en la imagen, etc.).
  sillas: [
    { id: 'A1', x: -0.040, z: -0.150, mira: 1 },   // fila del fondo, izquierda
    { id: 'A2', x: 0.040, z: -0.150, mira: 1 },    // fila del fondo, derecha
    { id: 'A3', x: -0.040, z: -0.045, mira: -1 },  // fila del frente, izquierda
    { id: 'A4', x: 0.040, z: -0.045, mira: -1 },   // fila del frente, derecha
  ],
  silla: { ancho: 0.03, alturaAsiento: 0.026, alturaRespaldo: 0.05 },

  // Poste de 27 cm con la ESP32-CAM, en la esquina del fondo a la derecha.
  poste: { x: 0.195, z: -0.150, alto: 0.27 },

  // Siluetas de cartón de unos 10 cm (una persona de 1.70 m a escala 1:17).
  silueta: { alto: 0.10 },

  capacidad: 4,          // aforo máximo de la maqueta (CAPACIDAD en el Anexo A)
  escalaHumana: 17,      // 10 cm de silueta → 1.70 m: así se "entra" a la maqueta
  mesaExpo: { ancho: 1.5, fondo: 0.9, alto: 0.76 }, // mesa virtual donde se apoya la maqueta
};

// Parámetros del programa de la ESP32-CAM (Anexo B)
export const CAMARA = {
  ancho: 320,
  alto: 240,
  periodoMs: 300,       // PERIODO_MS
  umbralPixel: 30,      // UMBRAL_PIXEL (0-255)
  umbralZona: 0.20,     // UMBRAL_ZONA
  framesConfirma: 3,    // FRAMES_CONFIRMA → respuesta teórica 3 × 300 ms = 0.9 s
  fovHorizontal: 50,    // ángulo de visión horizontal supuesto (OV2640 con lente estándar, encuadre de la mesa)
};

// Parámetros del programa del ESP32 DevKit (Anexo A)
export const CONTADOR = {
  muestreoMs: 5,        // T_MUESTREO (200 Hz)
  filtroMs: 50,         // T_FILTRO (antirrebote)
  baudios: 115200,
};

// Física del sensor (sección 4): haz de 940 nm y apertura ≤ 15°
export const FISICA = {
  lambdaNm: 940,
  energiaFotonEv: 1240 / 940,      // E = hc/λ ≈ 1.32 eV
  bandaProhibidaSiEv: 1.12,
  tbMedioMs: 425,                  // 29 cruces: t_b = 425 ± 170 ms
  tbDesvMs: 170,
  huecoMinimoM: 0.15,              // personas en fila con hueco < 0.15 m cuentan como una
};

// Biblioteca de la Universidad del Pacífico según el informe (sección 2)
export const BIBLIOTECA = {
  aforo: 381,
  salas: [
    { id: 'sala1', nombre: 'Sala 1', piso: 0, asientos: 96, mesas: 24 },
    { id: 'sala2', nombre: 'Sala 2', piso: 1, asientos: 236, mesas: 59 },
  ],
  asientosPorCamara: 4,           // 83 cámaras para 332 asientos (sección 6)
  costoCamara: 65,                // S/ por ESP32-CAM con base (Tabla 8)
  horasPunta: [[14, 15.5], [17, 18.5]],
  apertura: 8,                    // horario ilustrativo para la simulación
  cierre: 22,
  alturaPiso: 4.6,
};

export const COLORES = {
  libre: 0x22c55e,
  ocupado: 0xef4444,
  objeto: 0xf59e0b,     // la cámara ve el asiento ocupado pero no hay persona contada
  sinDato: 0x94a3b8,
  ir: 0xff3355,
  acento: 0x38bdf8,
  ledRojo: 0xff2020,
};

// Datos en vivo por internet (para el visor autónomo). Son servidores MQTT
// públicos y gratuitos: solo viajan números (personas y asientos), nunca imágenes.
export const REMOTO = {
  brokers: [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://test.mosquitto.org:8081/mqtt',
  ],
  prefijo: 'biblioaforo-vr/v1/',
  libreria: 'https://cdn.jsdelivr.net/npm/mqtt@5.10.3/dist/mqtt.esm.js',
};
