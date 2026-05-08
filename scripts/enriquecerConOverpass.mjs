/**
 * Enriquece territorios con distritos reales de OSM (admin_level=9).
 * Todos los territorios usan radio fijo de 3km y no se solapan entre sí.
 *
 * Uso:
 *   node scripts/enriquecerConOverpass.mjs
 *   CIUDAD_ID=es-madrid node scripts/enriquecerConOverpass.mjs
 *
 * Después:
 *   FORZAR=1 node scripts/subirTerritoriosFirestore.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUTA_DATOS = join(__dirname, '..', 'data', 'generated', 'territorios-espana.json');
const CIUDAD_ID_FILTRO = process.env.CIUDAD_ID ?? null;
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const MIN_TERRITORIOS = 3;
const PAUSA_MS = 2500;
const RADIO_MAX_VORONOI = 750;
const RADIO_MIN_VORONOI = 150;

const calcularRadio = (ciudad, distAlCentro) => {
  const rb = ciudad.radioBusqueda ?? 20000;
  const umbral = rb / 3;
  const esCentro = distAlCentro < umbral;
  const radio = esCentro
    ? Math.round(Math.max(1000, rb * 0.043))
    : Math.round(Math.max(1200, rb * 0.057));
  return radio;
};

const calcularMinDistancia = (radio1, radio2) => radio1 + radio2;

// ── Utilidades ───────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const slugify = (v) => v
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const distanciaM = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Más céntricos primero. Dos territorios solapan si la distancia < radio1 + radio2.
const dessolapar = (territorios, ciudad) => {
  const ordenados = [...territorios].sort((a, b) =>
    distanciaM(ciudad.lat, ciudad.lng, a.lat, a.lng) -
    distanciaM(ciudad.lat, ciudad.lng, b.lat, b.lng)
  );

  const resultado = [];
  for (const t of ordenados) {
    const solapa = resultado.some(r =>
      distanciaM(t.lat, t.lng, r.lat, r.lng) < calcularMinDistancia(t.radio, r.radio)
    );
    if (!solapa) resultado.push(t);
  }
  return resultado;
};

// ── Overpass ─────────────────────────────────────────────────────────────────

const consultarOverpass = async (ciudad) => {
  const margen = (ciudad.radioBusqueda ?? 20000) / 111320;
  const cos = Math.cos(ciudad.lat * Math.PI / 180);
  const bbox = [
    ciudad.lat - margen,
    ciudad.lng - margen * cos,
    ciudad.lat + margen,
    ciudad.lng + margen * cos,
  ].map(n => n.toFixed(6)).join(',');

  // Prioridad: admin_level=9 (distritos oficiales con geometría)
  // Fallback: place=suburb/neighbourhood (también pueden ser relations con bounds)
  const query = `[out:json][timeout:60];
(
  relation["boundary"="administrative"]["admin_level"="9"](${bbox});
  relation["boundary"="administrative"]["admin_level"="10"](${bbox});
  relation["place"~"^(suburb|neighbourhood)$"](${bbox});
  way["place"~"^(suburb|neighbourhood)$"](${bbox});
  node["place"~"^(suburb|neighbourhood)$"](${bbox});
);
out center;`;

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'User-Agent': 'ConqueRun/1.0 (territorio enrichment script)' },
    body: new URLSearchParams({ data: query }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.elements ?? [];
};

const elementoACoords = (el) => {
  if (el.type === 'node') return { lat: el.lat, lng: el.lon, tieneBounds: false };
  if (el.center) return { lat: el.center.lat, lng: el.center.lon, tieneBounds: !!el.bounds };
  return null;
};

const procesarElementos = (elementos, ciudad) => {
  const vistos = new Set();
  const candidatos = [];

  for (const el of elementos) {
    const nombre = el.tags?.['name:es'] ?? el.tags?.name;
    if (!nombre || nombre.length < 2) continue;

    const coords = elementoACoords(el);
    if (!coords) continue;

    // Solo dentro del área de búsqueda de la ciudad
    const dist = distanciaM(ciudad.lat, ciudad.lng, coords.lat, coords.lng);
    if (dist > (ciudad.radioBusqueda ?? 20000) * 1.1) continue;

    const clave = slugify(nombre);

    // Prioridad: relations con bounds > nodes (mismo nombre → quedamos con el de mayor calidad)
    if (vistos.has(clave)) {
      // Si el existente era un nodo y este tiene bounds, reemplaza
      const idx = candidatos.findIndex(c => slugify(c.nombre) === clave);
      if (idx >= 0 && coords.tieneBounds && !candidatos[idx]._tieneBounds) {
        candidatos[idx] = {
          ...candidatos[idx],
          lat: Number(coords.lat.toFixed(6)),
          lng: Number(coords.lng.toFixed(6)),
          _tieneBounds: true,
        };
      }
      continue;
    }

    vistos.add(clave);
    const radio = calcularRadio(ciudad, dist);
    candidatos.push({
      id: `${ciudad.id}-${clave}`,
      nombre,
      nombreBase: nombre,
      nombreVisible: nombre,
      tipo: 'distrito',
      distrito: nombre,
      capaIdentidad: 'zona_reconocible',
      fuenteNombre: coords.tieneBounds ? 'overpass_osm_admin' : 'overpass_osm_node',
      ciudadId: ciudad.id,
      ciudadNombre: ciudad.nombre,
      paisCodigo: ciudad.paisCodigo ?? 'ES',
      paisNombre: ciudad.paisNombre ?? 'España',
      lat: Number(coords.lat.toFixed(6)),
      lng: Number(coords.lng.toFixed(6)),
      radio,
      dueno: null,
      duenoPuntos: 0,
      _tieneBounds: coords.tieneBounds,
    });
  }

  // Limpiar campo interno antes de devolver.
  // No aplicamos dessolapar: con Voronoi las zonas nunca se solapan visualmente
  // independientemente de cuántos centros haya.
  return candidatos.map(({ _tieneBounds, ...t }) => t);
};

// ── Main ─────────────────────────────────────────────────────────────────────

const raw = await readFile(RUTA_DATOS, 'utf8');
const datos = JSON.parse(raw);

const ciudades = CIUDAD_ID_FILTRO
  ? datos.ciudades.filter(c => c.id === CIUDAD_ID_FILTRO)
  : datos.ciudades;

if (ciudades.length === 0) {
  console.error(`❌ Ciudad "${CIUDAD_ID_FILTRO}" no encontrada.`);
  process.exit(1);
}

console.log(`\n🌍 Enriqueciendo ${ciudades.length} ciudades | radio proporcional (centro ~1-1.5km · extrarradio ~1.2-2km) · sin solapamiento\n`);

const territoriosOtras = CIUDAD_ID_FILTRO
  ? datos.territorios.filter(t => t.ciudadId !== CIUDAD_ID_FILTRO)
  : [];

const territoriosNuevos = [...territoriosOtras];

let ciudadesOSM = 0;
let ciudadesFallback = 0;

for (let i = 0; i < ciudades.length; i++) {
  const ciudad = ciudades[i];
  process.stdout.write(`[${i + 1}/${ciudades.length}] ${ciudad.nombre.padEnd(32)} `);

  let elementos = [];
  let intentos = 0;

  while (intentos < 3) {
    try {
      elementos = await consultarOverpass(ciudad);
      break;
    } catch {
      intentos++;
      process.stdout.write('⟳ ');
      if (intentos < 3) await sleep(PAUSA_MS * 2);
    }
  }

  const territorios = procesarElementos(elementos, ciudad);

  if (territorios.length >= MIN_TERRITORIOS) {
    territoriosNuevos.push(...territorios);
    console.log(`✅ ${territorios.length} zonas (de ${elementos.length} candidatos OSM)`);
    ciudadesOSM++;
  } else {
    // Fallback: seed existente con radio proporcional a la ciudad
    const seed = datos.territorios
      .filter(t => t.ciudadId === ciudad.id)
      .map(t => ({
        ...t,
        radio: calcularRadio(ciudad, distanciaM(ciudad.lat, ciudad.lng, t.lat, t.lng)),
      }));
    territoriosNuevos.push(...seed);
    console.log(`⚠️  ${territorios.length} OSM → seed (${seed.length} zonas fallback)`);
    ciudadesFallback++;
  }

  // Actualizar ciudad
  const idxCiudad = datos.ciudades.findIndex(c => c.id === ciudad.id);
  if (idxCiudad >= 0) {
    datos.ciudades[idxCiudad].totalZonas = territoriosNuevos.filter(t => t.ciudadId === ciudad.id).length;
    datos.ciudades[idxCiudad].estadoCobertura = territorios.length >= MIN_TERRITORIOS ? 'osm' : datos.ciudades[idxCiudad].estadoCobertura;
  }

  if (i < ciudades.length - 1) await sleep(PAUSA_MS);
}

// Ajuste Voronoi: radio de cada zona = min(dist_al_vecino_más_cercano * 0.48, RADIO_MAX)
// Garantiza que ningún par de círculos de la misma ciudad se solape.
const porCiudad = new Map();
for (const t of territoriosNuevos) {
  if (!porCiudad.has(t.ciudadId)) porCiudad.set(t.ciudadId, []);
  porCiudad.get(t.ciudadId).push(t);
}
const territoriosFinales = [];
for (const zonas of porCiudad.values()) {
  for (const zona of zonas) {
    let minDist = Infinity;
    for (const otra of zonas) {
      if (otra.id === zona.id) continue;
      const d = distanciaM(zona.lat, zona.lng, otra.lat, otra.lng);
      if (d < minDist) minDist = d;
    }
    const radio = Math.round(Math.min(
      minDist === Infinity ? RADIO_MAX_VORONOI : minDist * 0.48,
      RADIO_MAX_VORONOI
    ));
    if (radio >= RADIO_MIN_VORONOI) territoriosFinales.push({ ...zona, radio });
  }
}

// Recalcular totalZonas tras el filtro Voronoi
for (const ciudad of datos.ciudades) {
  ciudad.totalZonas = territoriosFinales.filter(t => t.ciudadId === ciudad.id).length;
}

await writeFile(RUTA_DATOS, `${JSON.stringify({
  generadoEn: new Date().toISOString(),
  cobertura: 'España: distritos OSM (admin_level 9/10) con radio Voronoi ≤750m, sin solapamiento.',
  ciudades: datos.ciudades,
  territorios: territoriosFinales,
}, null, 2)}\n`);

console.log('\n─────────────────────────────────────────────────');
console.log(`✅ ${ciudadesOSM} ciudades con datos OSM reales`);
console.log(`⚠️  ${ciudadesFallback} ciudades con seed (radio actualizado a 3km)`);
console.log(`📦 Total territorios: ${territoriosNuevos.length}`);
console.log('\nPróximo paso:');
console.log('  FORZAR=1 node scripts/subirTerritoriosFirestore.mjs\n');
