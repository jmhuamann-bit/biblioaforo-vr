// Esqueleto y regiones de las personas (sin dependencias: lo usan el modelo, el shader y la animación).
// Persona de referencia de 1,70 m mirando hacia +z; el lado −x es simétrico al +x.
export const HUESO = { pelvis: 0, pecho: 1, cabeza: 2, brazoP: 3, antebrazoP: 4, brazoN: 5, antebrazoN: 6, musloP: 7, piernaP: 8, musloN: 9, piernaN: 10 };
export const N_HUESOS = 11;
export const PIVOTE = {
  pelvis: [0, 0.9, 0], pecho: [0, 1.04, -0.01], cabeza: [0, 1.47, -0.008],
  hombro: [0.17, 1.385, -0.01], codo: [0.205, 1.075, -0.02], palma: [0.221, 0.745, 0.004],
  cadera: [0.09, 0.875, 0], rodilla: [0.088, 0.478, 0.006], tobillo: [0.092, 0.08, -0.01],
};
export const REGION = { piel: 0, superior: 1, inferior: 2, zapato: 3, rostro: 4, manga: 5, piernaBaja: 6, muslo: 7, pelo: 8, gafas: 9, mochila: 10, falda: 11, capucha: 12, gorra: 13 };
