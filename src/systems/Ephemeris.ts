/**
 * Distancia Tierra–Marte y retraso de la luz calculados en el navegador con los
 * elementos orbitales keplerianos aproximados que publica JPL
 * (E. M. Standish, "Keplerian Elements for Approximate Positions of the Major Planets",
 * tabla 1, válida de 1800 a 2050). Error típico: menos de 1 % en la distancia.
 * https://ssd.jpl.nasa.gov/planets/approx_pos.html
 */

type ElementPair = [number, number];
interface Elements {
  a: ElementPair;
  e: ElementPair;
  I: ElementPair;
  L: ElementPair;
  peri: ElementPair;
  node: ElementPair;
}

const EARTH: Elements = {
  a: [1.00000261, 0.00000562],
  e: [0.01671123, -0.00004392],
  I: [-0.00001531, -0.01294668],
  L: [100.46457166, 35999.37244981],
  peri: [102.93768193, 0.32327364],
  node: [0.0, 0.0],
};

const MARS: Elements = {
  a: [1.52371034, 0.00001847],
  e: [0.0933941, 0.00007882],
  I: [1.84969142, -0.00813131],
  L: [-4.55343205, 19140.30268499],
  peri: [-23.94362959, 0.44441088],
  node: [49.55953891, -0.29257343],
};

const AU_KM = 149597870.7;
const LIGHT_KM_S = 299792.458;
const DEG = Math.PI / 180;

function heliocentric(el: Elements, T: number): [number, number, number] {
  const v = (p: ElementPair): number => p[0] + p[1] * T;
  const a = v(el.a);
  const e = v(el.e);
  const I = v(el.I) * DEG;
  const L = v(el.L);
  const peri = v(el.peri);
  const node = v(el.node);

  let M = (L - peri) % 360;
  if (M > 180) M -= 360;
  if (M < -180) M += 360;
  const Mr = M * DEG;
  let E = Mr + e * Math.sin(Mr);
  for (let i = 0; i < 12; i++) {
    E -= (E - e * Math.sin(E) - Mr) / (1 - e * Math.cos(E));
  }
  const x = a * (Math.cos(E) - e);
  const y = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const w = (peri - node) * DEG;
  const O = node * DEG;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const cO = Math.cos(O);
  const sO = Math.sin(O);
  const cI = Math.cos(I);
  const sI = Math.sin(I);
  return [
    (cw * cO - sw * sO * cI) * x + (-sw * cO - cw * sO * cI) * y,
    (cw * sO + sw * cO * cI) * x + (-sw * sO + cw * cO * cI) * y,
    sw * sI * x + cw * sI * y,
  ];
}

export class Ephemeris {
  /** Distancia Tierra–Marte en unidades astronómicas para una fecha. */
  static earthMarsDistanceAU(date: Date): number {
    const jd = date.getTime() / 86400000 + 2440587.5;
    const T = (jd - 2451545.0) / 36525;
    const e = heliocentric(EARTH, T);
    const m = heliocentric(MARS, T);
    return Math.hypot(e[0] - m[0], e[1] - m[1], e[2] - m[2]);
  }

  /** Minutos que tarda la luz (y una señal de radio) en ir de la Tierra a Marte. */
  static lightDelayMinutes(date: Date): number {
    return (Ephemeris.earthMarsDistanceAU(date) * AU_KM) / LIGHT_KM_S / 60;
  }

  static distanceMillionKm(date: Date): number {
    return (Ephemeris.earthMarsDistanceAU(date) * AU_KM) / 1e6;
  }
}
