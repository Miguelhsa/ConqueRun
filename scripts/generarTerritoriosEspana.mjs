import { mkdir, writeFile } from 'node:fs/promises';

const PAIS = {
  paisCodigo: 'ES',
  paisNombre: 'España',
};

const CIUDADES_ESPANA_BASE = [
  { id: 'es-a-coruna', nombre: 'A Coruña', lat: 43.3623, lng: -8.4115, radioBusqueda: 18000 },
  { id: 'es-albacete', nombre: 'Albacete', lat: 38.9943, lng: -1.8585, radioBusqueda: 18000 },
  { id: 'es-alicante', nombre: 'Alicante', lat: 38.3452, lng: -0.4810, radioBusqueda: 22000 },
  { id: 'es-almeria', nombre: 'Almería', lat: 36.8340, lng: -2.4637, radioBusqueda: 18000 },
  { id: 'es-avila', nombre: 'Ávila', lat: 40.6565, lng: -4.6818, radioBusqueda: 14000 },
  { id: 'es-badajoz', nombre: 'Badajoz', lat: 38.8794, lng: -6.9707, radioBusqueda: 20000 },
  { id: 'es-barcelona', nombre: 'Barcelona', lat: 41.3874, lng: 2.1686, radioBusqueda: 35000 },
  { id: 'es-bilbao', nombre: 'Bilbao', lat: 43.2630, lng: -2.9350, radioBusqueda: 22000 },
  { id: 'es-burgos', nombre: 'Burgos', lat: 42.3439, lng: -3.6969, radioBusqueda: 18000 },
  { id: 'es-caceres', nombre: 'Cáceres', lat: 39.4753, lng: -6.3724, radioBusqueda: 16000 },
  { id: 'es-cadiz', nombre: 'Cádiz', lat: 36.5271, lng: -6.2886, radioBusqueda: 16000 },
  { id: 'es-castellon', nombre: 'Castellón de la Plana', lat: 39.9864, lng: -0.0513, radioBusqueda: 18000 },
  { id: 'es-ceuta', nombre: 'Ceuta', lat: 35.8894, lng: -5.3213, radioBusqueda: 12000 },
  { id: 'es-ciudad-real', nombre: 'Ciudad Real', lat: 38.9848, lng: -3.9274, radioBusqueda: 16000 },
  { id: 'es-cordoba', nombre: 'Córdoba', lat: 37.8882, lng: -4.7794, radioBusqueda: 22000 },
  { id: 'es-cuenca', nombre: 'Cuenca', lat: 40.0704, lng: -2.1374, radioBusqueda: 14000 },
  { id: 'es-donostia', nombre: 'Donostia / San Sebastián', lat: 43.3183, lng: -1.9812, radioBusqueda: 18000 },
  { id: 'es-girona', nombre: 'Girona', lat: 41.9794, lng: 2.8214, radioBusqueda: 16000 },
  { id: 'es-granada', nombre: 'Granada', lat: 37.1773, lng: -3.5986, radioBusqueda: 22000 },
  { id: 'es-guadalajara', nombre: 'Guadalajara', lat: 40.6337, lng: -3.1668, radioBusqueda: 16000 },
  { id: 'es-huelva', nombre: 'Huelva', lat: 37.2614, lng: -6.9447, radioBusqueda: 18000 },
  { id: 'es-huesca', nombre: 'Huesca', lat: 42.1401, lng: -0.4089, radioBusqueda: 14000 },
  { id: 'es-jaen', nombre: 'Jaén', lat: 37.7796, lng: -3.7849, radioBusqueda: 16000 },
  { id: 'es-las-palmas', nombre: 'Las Palmas de Gran Canaria', lat: 28.1235, lng: -15.4363, radioBusqueda: 22000 },
  { id: 'es-leon', nombre: 'León', lat: 42.5987, lng: -5.5671, radioBusqueda: 16000 },
  { id: 'es-lleida', nombre: 'Lleida', lat: 41.6176, lng: 0.6200, radioBusqueda: 16000 },
  { id: 'es-logrono', nombre: 'Logroño', lat: 42.4627, lng: -2.4449, radioBusqueda: 16000 },
  { id: 'es-lugo', nombre: 'Lugo', lat: 43.0097, lng: -7.5568, radioBusqueda: 14000 },
  { id: 'es-madrid', nombre: 'Madrid', lat: 40.4168, lng: -3.7038, radioBusqueda: 35000 },
  { id: 'es-malaga', nombre: 'Málaga', lat: 36.7213, lng: -4.4214, radioBusqueda: 26000 },
  { id: 'es-melilla', nombre: 'Melilla', lat: 35.2923, lng: -2.9381, radioBusqueda: 12000 },
  { id: 'es-murcia', nombre: 'Murcia', lat: 37.9922, lng: -1.1307, radioBusqueda: 26000 },
  { id: 'es-ourense', nombre: 'Ourense', lat: 42.3358, lng: -7.8639, radioBusqueda: 14000 },
  { id: 'es-oviedo', nombre: 'Oviedo', lat: 43.3619, lng: -5.8494, radioBusqueda: 18000 },
  { id: 'es-palencia', nombre: 'Palencia', lat: 42.0097, lng: -4.5288, radioBusqueda: 14000 },
  { id: 'es-palma', nombre: 'Palma', lat: 39.5696, lng: 2.6502, radioBusqueda: 24000 },
  { id: 'es-pamplona', nombre: 'Pamplona / Iruña', lat: 42.8125, lng: -1.6458, radioBusqueda: 18000 },
  { id: 'es-pontevedra', nombre: 'Pontevedra', lat: 42.4310, lng: -8.6444, radioBusqueda: 14000 },
  { id: 'es-salamanca', nombre: 'Salamanca', lat: 40.9701, lng: -5.6635, radioBusqueda: 16000 },
  { id: 'es-santa-cruz-tenerife', nombre: 'Santa Cruz de Tenerife', lat: 28.4636, lng: -16.2518, radioBusqueda: 22000 },
  { id: 'es-santander', nombre: 'Santander', lat: 43.4623, lng: -3.8099, radioBusqueda: 18000 },
  { id: 'es-segovia', nombre: 'Segovia', lat: 40.9429, lng: -4.1088, radioBusqueda: 14000 },
  { id: 'es-sevilla', nombre: 'Sevilla', lat: 37.3891, lng: -5.9845, radioBusqueda: 26000 },
  { id: 'es-soria', nombre: 'Soria', lat: 41.7666, lng: -2.4790, radioBusqueda: 12000 },
  { id: 'es-tarragona', nombre: 'Tarragona', lat: 41.1189, lng: 1.2445, radioBusqueda: 16000 },
  { id: 'es-teruel', nombre: 'Teruel', lat: 40.3456, lng: -1.1065, radioBusqueda: 12000 },
  { id: 'es-toledo', nombre: 'Toledo', lat: 39.8628, lng: -4.0273, radioBusqueda: 16000 },
  { id: 'es-valencia', nombre: 'Valencia', lat: 39.4699, lng: -0.3763, radioBusqueda: 28000 },
  { id: 'es-valladolid', nombre: 'Valladolid', lat: 41.6523, lng: -4.7245, radioBusqueda: 18000 },
  { id: 'es-vitoria', nombre: 'Vitoria-Gasteiz', lat: 42.8467, lng: -2.6727, radioBusqueda: 18000 },
  { id: 'es-zamora', nombre: 'Zamora', lat: 41.5035, lng: -5.7446, radioBusqueda: 14000 },
  { id: 'es-zaragoza', nombre: 'Zaragoza', lat: 41.6488, lng: -0.8891, radioBusqueda: 26000 },
];

const TERRITORIOS_CURADOS = {
  'es-donostia': [
    ['Amara', 'Amara', 43.3066, -1.9782],
    ['Gros', 'Gros', 43.3241, -1.9724],
    ['Antiguo', 'Antiguo', 43.3090, -2.0060],
    ['Egia', 'Egia', 43.3194, -1.9677],
    ['Centro', 'Centro', 43.3183, -1.9812],
    ['Parte Vieja', 'Parte Vieja', 43.3248, -1.9851],
    ['Intxaurrondo', 'Intxaurrondo', 43.3155, -1.9430],
    ['Aiete', 'Aiete', 43.3004, -1.9916],
    ['Ibaeta', 'Ibaeta', 43.3070, -2.0183],
    ['Loiola', 'Loiola', 43.3079, -1.9607],
    ['Martutene', 'Martutene', 43.2965, -1.9500],
    ['Miramon', 'Miramon', 43.2887, -1.9891],
    ['Añorga', 'Añorga', 43.2924, -2.0272],
    ['Bidebieta', 'Bidebieta', 43.3199, -1.9285],
    ['Altza', 'Altza', 43.3190, -1.9120],
  ],
  'es-barcelona': [
    ['Gràcia', 'Gràcia', 41.4026, 2.1567],
    ['Eixample', 'Eixample', 41.3917, 2.1649],
    ['Sants', 'Sants-Montjuïc', 41.3753, 2.1376],
    ['Poblenou', 'Sant Martí', 41.4035, 2.2040],
    ['Les Corts', 'Les Corts', 41.3868, 2.1315],
    ['Sarrià', 'Sarrià-Sant Gervasi', 41.3994, 2.1209],
    ['El Raval', 'Ciutat Vella', 41.3797, 2.1682],
    ['Barceloneta', 'Ciutat Vella', 41.3809, 2.1890],
  ],
  'es-valencia': [
    ['Ciutat Vella', 'Ciutat Vella', 39.4745, -0.3774],
    ['Ruzafa', 'Eixample', 39.4626, -0.3732],
    ['El Carmen', 'Ciutat Vella', 39.4784, -0.3817],
    ['Benimaclet', 'Benimaclet', 39.4853, -0.3607],
    ['Cabanyal', 'Poblats Marítims', 39.4702, -0.3282],
    ['Algirós', 'Algirós', 39.4740, -0.3485],
  ],
  'es-bilbao': [
    ['Casco Viejo', 'Ibaiondo', 43.2569, -2.9236],
    ['Indautxu', 'Abando', 43.2603, -2.9450],
    ['Abando', 'Abando', 43.2632, -2.9328],
    ['Deusto', 'Deusto', 43.2714, -2.9516],
    ['Santutxu', 'Begoña', 43.2521, -2.9120],
    ['San Mamés', 'Basurto-Zorrotza', 43.2622, -2.9505],
  ],
  'es-sevilla': [
    ['Triana', 'Triana', 37.3826, -6.0038],
    ['Santa Cruz', 'Casco Antiguo', 37.3852, -5.9890],
    ['Macarena', 'Macarena', 37.4030, -5.9878],
    ['Nervión', 'Nervión', 37.3830, -5.9700],
    ['Los Remedios', 'Los Remedios', 37.3754, -6.0022],
  ],
  'es-malaga': [
    ['Centro Histórico', 'Centro', 36.7219, -4.4218],
    ['La Malagueta', 'Este', 36.7198, -4.4104],
    ['El Palo', 'Este', 36.7208, -4.3570],
    ['Pedregalejo', 'Este', 36.7203, -4.3788],
    ['Teatinos', 'Teatinos-Universidad', 36.7156, -4.4782],
  ],
};

const RADIO_MAX = 750;
const RADIO_MIN = 300;

const distanciaM = (a, b) => {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

// Para cada zona, radio = min(dist_al_vecino_más_cercano * 0.48, RADIO_MAX).
// El factor 0.48 (<0.5) deja un pequeño margen para que los círculos nunca se toquen.
const ajustarRadiosSinSolapamiento = (territorios) => {
  const porCiudad = new Map();
  for (const t of territorios) {
    if (!porCiudad.has(t.ciudadId)) porCiudad.set(t.ciudadId, []);
    porCiudad.get(t.ciudadId).push(t);
  }

  const resultado = [];
  for (const zonas of porCiudad.values()) {
    for (const zona of zonas) {
      let minDist = Infinity;
      for (const otra of zonas) {
        if (otra.id === zona.id) continue;
        const d = distanciaM(zona, otra);
        if (d < minDist) minDist = d;
      }
      const radio = Math.round(Math.min(minDist * 0.48, RADIO_MAX));
      if (radio >= RADIO_MIN) resultado.push({ ...zona, radio });
    }
  }
  return resultado;
};

const crearSlug = (valor) => valor
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const desplazar = (ciudad, nombre, distrito, metrosNorte, metrosEste, radio = 1400) => {
  const lat = ciudad.lat + (metrosNorte / 111_320);
  const lng = ciudad.lng + (metrosEste / (111_320 * Math.cos((ciudad.lat * Math.PI) / 180)));
  return [nombre, distrito, Number(lat.toFixed(6)), Number(lng.toFixed(6)), radio];
};

const territoriosFallbackCiudad = (ciudad) => [
  ['Centro', 'Centro', ciudad.lat, ciudad.lng, 1500],
  desplazar(ciudad, 'Norte', 'Zona Norte', 1800, 0),
  desplazar(ciudad, 'Sur', 'Zona Sur', -1800, 0),
  desplazar(ciudad, 'Este', 'Zona Este', 0, 1800),
  desplazar(ciudad, 'Oeste', 'Zona Oeste', 0, -1800),
];

const crearCiudad = (ciudad, totalZonas) => ({
  ...PAIS,
  ...ciudad,
  estadoCobertura: TERRITORIOS_CURADOS[ciudad.id] ? 'curada' : 'base_nacional',
  totalZonas,
});

const crearTerritorio = (ciudad, [nombre, distrito, lat, lng, radio = 1200]) => {
  const id = `${ciudad.id}-${crearSlug(nombre)}`;

  return {
    id,
    nombre,
    nombreBase: nombre,
    nombreVisible: nombre,
    tipo: distrito === 'Centro' || distrito.startsWith('Zona') ? 'zona' : 'barrio',
    distrito,
    capaIdentidad: TERRITORIOS_CURADOS[ciudad.id] ? 'zona_reconocible' : 'zona_base',
    fuenteNombre: TERRITORIOS_CURADOS[ciudad.id] ? 'seed_curado' : 'seed_base_espana',
    ciudadId: ciudad.id,
    ciudadNombre: ciudad.nombre,
    ...PAIS,
    lat,
    lng,
    radio,
    dueno: null,
    duenoPuntos: 0,
  };
};

const generar = () => {
  const territoriosBrutos = [];
  const ciudadesMap = new Map();

  for (const ciudad of CIUDADES_ESPANA_BASE) {
    const definiciones = TERRITORIOS_CURADOS[ciudad.id] ?? territoriosFallbackCiudad(ciudad);
    ciudadesMap.set(ciudad.id, ciudad);
    territoriosBrutos.push(...definiciones.map(def => crearTerritorio(ciudad, def)));
  }

  const territorios = ajustarRadiosSinSolapamiento(territoriosBrutos);

  const countPorCiudad = new Map();
  for (const t of territorios) countPorCiudad.set(t.ciudadId, (countPorCiudad.get(t.ciudadId) ?? 0) + 1);

  const ciudades = [...ciudadesMap.values()].map(ciudad =>
    crearCiudad(ciudad, countPorCiudad.get(ciudad.id) ?? 0)
  );

  return { ciudades, territorios };
};

const main = async () => {
  const salida = 'data/generated/territorios-espana.json';
  const data = generar();

  await mkdir('data/generated', { recursive: true });
  await writeFile(salida, `${JSON.stringify({
    generadoEn: new Date().toISOString(),
    cobertura: 'España base: capitales provinciales, Ceuta, Melilla y ciudades clave con territorios curados donde existen.',
    ...data,
  }, null, 2)}\n`);

  console.log(`Generadas ${data.ciudades.length} ciudades y ${data.territorios.length} territorios en ${salida}`);
  console.log('Nota: este fichero es semilla local. Para subirlo a Firestore usa una herramienta admin o Cloud Function.');
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
