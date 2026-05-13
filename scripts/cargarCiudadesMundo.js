#!/usr/bin/env node
/**
 * Carga barrios de ciudades del mundo en Firestore usando Overpass API.
 *
 * Requisitos:
 *   - serviceAccountKey.json en la raíz del proyecto (NO subir a git)
 *   - npm install firebase-admin   (solo en dev)
 *   - Node 18+  (fetch nativo)
 *
 * Uso:
 *   node scripts/cargarCiudadesMundo.js              # todas las ciudades
 *   node scripts/cargarCiudadesMundo.js es-barcelona  # solo una
 *   node scripts/cargarCiudadesMundo.js --lista       # ver ciudades disponibles
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const svcPath = join(__dirname, '../serviceAccountKey.json');
const serviceAccount = JSON.parse(readFileSync(svcPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const DELAY_MS = 2500;
const MIN_BARRIOS = 5;

// País → admin_levels a probar en orden (de más fino a más grueso)
const NIVELES = {
  ES: [10, 9], FR: [9, 8],  GB: [10, 9], DE: [10, 9], IT: [9, 8],
  PT: [9, 8],  NL: [10, 9], BE: [10, 9], AT: [10, 9], CH: [10, 9],
  PL: [9, 8],  CZ: [10, 9], HU: [9, 8],  RO: [9, 8],  BG: [9, 8],
  GR: [9, 8],  SE: [9, 8],  NO: [9, 8],  DK: [9, 8],  FI: [9, 8],
  RU: [9, 8],  UA: [9, 8],  TR: [9, 8],  RS: [9, 8],  HR: [9, 8],
  US: [8, 7],  CA: [9, 8],  MX: [9, 8],  BR: [8, 7],  AR: [8, 7],
  CO: [8, 7],  CL: [8, 7],  PE: [8, 7],  VE: [8, 7],  EC: [8, 7],
  JP: [9, 8],  CN: [8, 7],  KR: [9, 8],  IN: [8, 7],  TH: [9, 8],
  ID: [8, 7],  MY: [8, 7],  PH: [8, 7],  VN: [8, 7],  SG: [8, 7],
  TW: [9, 8],  BD: [8, 7],  PK: [8, 7],  IR: [8, 7],  SA: [8, 7],
  AE: [8, 7],  EG: [8, 7],  IL: [8, 7],  KW: [8, 7],  IQ: [8, 7],
};

const CIUDADES = [
  // ── ESPAÑA ──────────────────────────────────────────────────────────────
  { id: 'es-madrid',     nombre: 'Madrid',     paisCodigo: 'ES', paisNombre: 'España',      lat: 40.4168, lng:  -3.7038, radio: 20000 },
  { id: 'es-barcelona',  nombre: 'Barcelona',  paisCodigo: 'ES', paisNombre: 'España',      lat: 41.3851, lng:   2.1734, radio: 12000 },
  { id: 'es-valencia',   nombre: 'Valencia',   paisCodigo: 'ES', paisNombre: 'España',      lat: 39.4699, lng:  -0.3763, radio: 12000 },
  { id: 'es-sevilla',    nombre: 'Sevilla',    paisCodigo: 'ES', paisNombre: 'España',      lat: 37.3886, lng:  -5.9823, radio: 12000 },
  { id: 'es-zaragoza',   nombre: 'Zaragoza',   paisCodigo: 'ES', paisNombre: 'España',      lat: 41.6488, lng:  -0.8891, radio: 12000 },
  { id: 'es-malaga',     nombre: 'Málaga',     paisCodigo: 'ES', paisNombre: 'España',      lat: 36.7213, lng:  -4.4214, radio: 10000 },
  { id: 'es-bilbao',     nombre: 'Bilbao',     paisCodigo: 'ES', paisNombre: 'España',      lat: 43.2627, lng:  -2.9253, radio:  8000 },

  // ── EUROPA OCCIDENTAL ────────────────────────────────────────────────────
  { id: 'fr-paris',      nombre: 'París',      paisCodigo: 'FR', paisNombre: 'Francia',     lat: 48.8566, lng:   2.3522, radio: 12000 },
  { id: 'fr-lyon',       nombre: 'Lyon',       paisCodigo: 'FR', paisNombre: 'Francia',     lat: 45.7640, lng:   4.8357, radio: 10000 },
  { id: 'fr-marseille',  nombre: 'Marsella',   paisCodigo: 'FR', paisNombre: 'Francia',     lat: 43.2965, lng:   5.3698, radio: 10000 },
  { id: 'gb-london',     nombre: 'Londres',    paisCodigo: 'GB', paisNombre: 'Reino Unido', lat: 51.5074, lng:  -0.1278, radio: 20000 },
  { id: 'gb-manchester', nombre: 'Manchester', paisCodigo: 'GB', paisNombre: 'Reino Unido', lat: 53.4808, lng:  -2.2426, radio: 10000 },
  { id: 'de-berlin',     nombre: 'Berlín',     paisCodigo: 'DE', paisNombre: 'Alemania',    lat: 52.5200, lng:  13.4050, radio: 20000 },
  { id: 'de-hamburg',    nombre: 'Hamburgo',   paisCodigo: 'DE', paisNombre: 'Alemania',    lat: 53.5511, lng:   9.9937, radio: 15000 },
  { id: 'de-munich',     nombre: 'Múnich',     paisCodigo: 'DE', paisNombre: 'Alemania',    lat: 48.1351, lng:  11.5820, radio: 15000 },
  { id: 'it-rome',       nombre: 'Roma',       paisCodigo: 'IT', paisNombre: 'Italia',      lat: 41.9028, lng:  12.4964, radio: 20000 },
  { id: 'it-milan',      nombre: 'Milán',      paisCodigo: 'IT', paisNombre: 'Italia',      lat: 45.4654, lng:   9.1859, radio: 12000 },
  { id: 'it-naples',     nombre: 'Nápoles',    paisCodigo: 'IT', paisNombre: 'Italia',      lat: 40.8518, lng:  14.2681, radio: 10000 },
  { id: 'pt-lisbon',     nombre: 'Lisboa',     paisCodigo: 'PT', paisNombre: 'Portugal',    lat: 38.7169, lng:  -9.1395, radio: 10000 },
  { id: 'nl-amsterdam',  nombre: 'Ámsterdam',  paisCodigo: 'NL', paisNombre: 'P. Bajos',    lat: 52.3676, lng:   4.9041, radio: 10000 },
  { id: 'be-brussels',   nombre: 'Bruselas',   paisCodigo: 'BE', paisNombre: 'Bélgica',     lat: 50.8503, lng:   4.3517, radio: 10000 },
  { id: 'at-vienna',     nombre: 'Viena',      paisCodigo: 'AT', paisNombre: 'Austria',     lat: 48.2082, lng:  16.3738, radio: 15000 },
  { id: 'ch-zurich',     nombre: 'Zúrich',     paisCodigo: 'CH', paisNombre: 'Suiza',       lat: 47.3769, lng:   8.5417, radio:  8000 },

  // ── EUROPA NÓRDICA ───────────────────────────────────────────────────────
  { id: 'se-stockholm',  nombre: 'Estocolmo',  paisCodigo: 'SE', paisNombre: 'Suecia',      lat: 59.3293, lng:  18.0686, radio: 12000 },
  { id: 'no-oslo',       nombre: 'Oslo',       paisCodigo: 'NO', paisNombre: 'Noruega',     lat: 59.9139, lng:  10.7522, radio: 12000 },
  { id: 'dk-copenhagen', nombre: 'Copenhague', paisCodigo: 'DK', paisNombre: 'Dinamarca',   lat: 55.6761, lng:  12.5683, radio: 12000 },
  { id: 'fi-helsinki',   nombre: 'Helsinki',   paisCodigo: 'FI', paisNombre: 'Finlandia',   lat: 60.1699, lng:  24.9384, radio: 10000 },

  // ── EUROPA CENTRAL Y ORIENTAL ────────────────────────────────────────────
  { id: 'pl-warsaw',     nombre: 'Varsovia',   paisCodigo: 'PL', paisNombre: 'Polonia',     lat: 52.2297, lng:  21.0122, radio: 15000 },
  { id: 'cz-prague',     nombre: 'Praga',      paisCodigo: 'CZ', paisNombre: 'Rep. Checa',  lat: 50.0755, lng:  14.4378, radio: 12000 },
  { id: 'hu-budapest',   nombre: 'Budapest',   paisCodigo: 'HU', paisNombre: 'Hungría',     lat: 47.4979, lng:  19.0402, radio: 12000 },
  { id: 'ro-bucharest',  nombre: 'Bucarest',   paisCodigo: 'RO', paisNombre: 'Rumanía',     lat: 44.4268, lng:  26.1025, radio: 15000 },
  { id: 'gr-athens',     nombre: 'Atenas',     paisCodigo: 'GR', paisNombre: 'Grecia',      lat: 37.9838, lng:  23.7275, radio: 12000 },
  { id: 'ru-moscow',     nombre: 'Moscú',      paisCodigo: 'RU', paisNombre: 'Rusia',       lat: 55.7558, lng:  37.6173, radio: 25000 },
  { id: 'ru-stpete',     nombre: 'S. Petersburgo', paisCodigo: 'RU', paisNombre: 'Rusia',  lat: 59.9311, lng:  30.3609, radio: 20000 },
  { id: 'ua-kyiv',       nombre: 'Kiev',       paisCodigo: 'UA', paisNombre: 'Ucrania',     lat: 50.4501, lng:  30.5234, radio: 15000 },
  { id: 'tr-istanbul',   nombre: 'Estambul',   paisCodigo: 'TR', paisNombre: 'Turquía',     lat: 41.0082, lng:  28.9784, radio: 20000 },
  { id: 'tr-ankara',     nombre: 'Ankara',     paisCodigo: 'TR', paisNombre: 'Turquía',     lat: 39.9334, lng:  32.8597, radio: 15000 },

  // ── NORTEAMÉRICA ─────────────────────────────────────────────────────────
  { id: 'us-newyork',    nombre: 'Nueva York',   paisCodigo: 'US', paisNombre: 'EE. UU.',  lat: 40.7128, lng: -74.0060,  radio: 15000 },
  { id: 'us-losangeles', nombre: 'Los Ángeles',  paisCodigo: 'US', paisNombre: 'EE. UU.',  lat: 34.0522, lng: -118.2437, radio: 20000 },
  { id: 'us-chicago',    nombre: 'Chicago',      paisCodigo: 'US', paisNombre: 'EE. UU.',  lat: 41.8781, lng:  -87.6298, radio: 15000 },
  { id: 'us-houston',    nombre: 'Houston',      paisCodigo: 'US', paisNombre: 'EE. UU.',  lat: 29.7604, lng:  -95.3698, radio: 20000 },
  { id: 'us-phoenix',    nombre: 'Phoenix',      paisCodigo: 'US', paisNombre: 'EE. UU.',  lat: 33.4484, lng: -112.0740, radio: 20000 },
  { id: 'us-sanfrancisco', nombre: 'San Francisco', paisCodigo: 'US', paisNombre: 'EE. UU.', lat: 37.7749, lng: -122.4194, radio: 10000 },
  { id: 'us-seattle',    nombre: 'Seattle',      paisCodigo: 'US', paisNombre: 'EE. UU.',  lat: 47.6062, lng: -122.3321, radio: 12000 },
  { id: 'us-miami',      nombre: 'Miami',        paisCodigo: 'US', paisNombre: 'EE. UU.',  lat: 25.7617, lng:  -80.1918, radio: 10000 },
  { id: 'us-boston',     nombre: 'Boston',       paisCodigo: 'US', paisNombre: 'EE. UU.',  lat: 42.3601, lng:  -71.0589, radio: 10000 },
  { id: 'us-washington', nombre: 'Washington DC',paisCodigo: 'US', paisNombre: 'EE. UU.',  lat: 38.9072, lng:  -77.0369, radio: 10000 },
  { id: 'us-dallas',     nombre: 'Dallas',       paisCodigo: 'US', paisNombre: 'EE. UU.',  lat: 32.7767, lng:  -96.7970, radio: 15000 },
  { id: 'us-atlanta',    nombre: 'Atlanta',      paisCodigo: 'US', paisNombre: 'EE. UU.',  lat: 33.7490, lng:  -84.3880, radio: 12000 },
  { id: 'us-denver',     nombre: 'Denver',       paisCodigo: 'US', paisNombre: 'EE. UU.',  lat: 39.7392, lng: -104.9903, radio: 12000 },
  { id: 'ca-toronto',    nombre: 'Toronto',      paisCodigo: 'CA', paisNombre: 'Canadá',   lat: 43.6532, lng:  -79.3832, radio: 15000 },
  { id: 'ca-montreal',   nombre: 'Montreal',     paisCodigo: 'CA', paisNombre: 'Canadá',   lat: 45.5017, lng:  -73.5673, radio: 12000 },
  { id: 'ca-vancouver',  nombre: 'Vancouver',    paisCodigo: 'CA', paisNombre: 'Canadá',   lat: 49.2827, lng: -123.1207, radio: 10000 },

  // ── LATINOAMÉRICA ────────────────────────────────────────────────────────
  { id: 'mx-cdmx',       nombre: 'Ciudad de México', paisCodigo: 'MX', paisNombre: 'México',    lat: 19.4326, lng:  -99.1332, radio: 25000 },
  { id: 'mx-guadalajara',nombre: 'Guadalajara',  paisCodigo: 'MX', paisNombre: 'México',    lat: 20.6597, lng: -103.3496, radio: 15000 },
  { id: 'mx-monterrey',  nombre: 'Monterrey',    paisCodigo: 'MX', paisNombre: 'México',    lat: 25.6866, lng: -100.3161, radio: 15000 },
  { id: 'br-sao-paulo',  nombre: 'São Paulo',    paisCodigo: 'BR', paisNombre: 'Brasil',    lat: -23.5505, lng: -46.6333, radio: 25000 },
  { id: 'br-rio',        nombre: 'Río de Janeiro',paisCodigo: 'BR', paisNombre: 'Brasil',   lat: -22.9068, lng: -43.1729, radio: 15000 },
  { id: 'br-belo-horizonte', nombre: 'Belo Horizonte', paisCodigo: 'BR', paisNombre: 'Brasil', lat: -19.9191, lng: -43.9386, radio: 12000 },
  { id: 'br-brasilia',   nombre: 'Brasilia',     paisCodigo: 'BR', paisNombre: 'Brasil',    lat: -15.7801, lng: -47.9292, radio: 15000 },
  { id: 'ar-buenos-aires', nombre: 'Buenos Aires', paisCodigo: 'AR', paisNombre: 'Argentina', lat: -34.6037, lng: -58.3816, radio: 15000 },
  { id: 'co-bogota',     nombre: 'Bogotá',       paisCodigo: 'CO', paisNombre: 'Colombia',  lat:   4.7110, lng: -74.0721, radio: 20000 },
  { id: 'co-medellin',   nombre: 'Medellín',     paisCodigo: 'CO', paisNombre: 'Colombia',  lat:   6.2518, lng: -75.5636, radio: 12000 },
  { id: 'cl-santiago',   nombre: 'Santiago',     paisCodigo: 'CL', paisNombre: 'Chile',     lat: -33.4489, lng: -70.6693, radio: 20000 },
  { id: 'pe-lima',       nombre: 'Lima',         paisCodigo: 'PE', paisNombre: 'Perú',      lat: -12.0464, lng: -77.0428, radio: 20000 },

  // ── ASIA - ESTE ──────────────────────────────────────────────────────────
  { id: 'jp-tokyo',      nombre: 'Tokio',        paisCodigo: 'JP', paisNombre: 'Japón',     lat: 35.6762, lng: 139.6503, radio: 20000 },
  { id: 'jp-osaka',      nombre: 'Osaka',        paisCodigo: 'JP', paisNombre: 'Japón',     lat: 34.6937, lng: 135.5022, radio: 15000 },
  { id: 'jp-nagoya',     nombre: 'Nagoya',       paisCodigo: 'JP', paisNombre: 'Japón',     lat: 35.1815, lng: 136.9066, radio: 12000 },
  { id: 'jp-fukuoka',    nombre: 'Fukuoka',      paisCodigo: 'JP', paisNombre: 'Japón',     lat: 33.5904, lng: 130.4017, radio: 10000 },
  { id: 'cn-beijing',    nombre: 'Pekín',        paisCodigo: 'CN', paisNombre: 'China',     lat: 39.9042, lng: 116.4074, radio: 25000 },
  { id: 'cn-shanghai',   nombre: 'Shanghái',     paisCodigo: 'CN', paisNombre: 'China',     lat: 31.2304, lng: 121.4737, radio: 25000 },
  { id: 'cn-guangzhou',  nombre: 'Guangzhou',    paisCodigo: 'CN', paisNombre: 'China',     lat: 23.1291, lng: 113.2644, radio: 20000 },
  { id: 'cn-shenzhen',   nombre: 'Shenzhen',     paisCodigo: 'CN', paisNombre: 'China',     lat: 22.5431, lng: 114.0579, radio: 15000 },
  { id: 'cn-chengdu',    nombre: 'Chengdu',      paisCodigo: 'CN', paisNombre: 'China',     lat: 30.5728, lng: 104.0668, radio: 15000 },
  { id: 'cn-wuhan',      nombre: 'Wuhan',        paisCodigo: 'CN', paisNombre: 'China',     lat: 30.5928, lng: 114.3055, radio: 15000 },
  { id: 'kr-seoul',      nombre: 'Seúl',         paisCodigo: 'KR', paisNombre: 'Corea del Sur', lat: 37.5665, lng: 126.9780, radio: 20000 },
  { id: 'kr-busan',      nombre: 'Busan',        paisCodigo: 'KR', paisNombre: 'Corea del Sur', lat: 35.1796, lng: 129.0756, radio: 12000 },

  // ── ASIA - SUR ───────────────────────────────────────────────────────────
  { id: 'in-delhi',      nombre: 'Delhi',        paisCodigo: 'IN', paisNombre: 'India',     lat: 28.7041, lng:  77.1025, radio: 25000 },
  { id: 'in-mumbai',     nombre: 'Bombay',       paisCodigo: 'IN', paisNombre: 'India',     lat: 19.0760, lng:  72.8777, radio: 20000 },
  { id: 'in-bangalore',  nombre: 'Bangalore',    paisCodigo: 'IN', paisNombre: 'India',     lat: 12.9716, lng:  77.5946, radio: 15000 },
  { id: 'in-hyderabad',  nombre: 'Hyderabad',    paisCodigo: 'IN', paisNombre: 'India',     lat: 17.3850, lng:  78.4867, radio: 15000 },
  { id: 'in-kolkata',    nombre: 'Calcuta',      paisCodigo: 'IN', paisNombre: 'India',     lat: 22.5726, lng:  88.3639, radio: 15000 },
  { id: 'in-chennai',    nombre: 'Chennai',      paisCodigo: 'IN', paisNombre: 'India',     lat: 13.0827, lng:  80.2707, radio: 15000 },
  { id: 'pk-karachi',    nombre: 'Karachi',      paisCodigo: 'PK', paisNombre: 'Pakistán',  lat: 24.8607, lng:  67.0011, radio: 20000 },
  { id: 'pk-lahore',     nombre: 'Lahore',       paisCodigo: 'PK', paisNombre: 'Pakistán',  lat: 31.5204, lng:  74.3587, radio: 15000 },
  { id: 'bd-dhaka',      nombre: 'Daca',         paisCodigo: 'BD', paisNombre: 'Bangladés', lat: 23.8103, lng:  90.4125, radio: 15000 },

  // ── ASIA - SURESTE ───────────────────────────────────────────────────────
  { id: 'th-bangkok',    nombre: 'Bangkok',      paisCodigo: 'TH', paisNombre: 'Tailandia', lat: 13.7563, lng: 100.5018, radio: 20000 },
  { id: 'id-jakarta',    nombre: 'Yakarta',      paisCodigo: 'ID', paisNombre: 'Indonesia', lat: -6.2088, lng: 106.8456, radio: 20000 },
  { id: 'my-kualalumpur',nombre: 'Kuala Lumpur', paisCodigo: 'MY', paisNombre: 'Malasia',   lat:  3.1390, lng: 101.6869, radio: 12000 },
  { id: 'sg-singapore',  nombre: 'Singapur',     paisCodigo: 'SG', paisNombre: 'Singapur',  lat:  1.3521, lng: 103.8198, radio: 12000 },
  { id: 'ph-manila',     nombre: 'Manila',       paisCodigo: 'PH', paisNombre: 'Filipinas', lat: 14.5995, lng: 120.9842, radio: 10000 },
  { id: 'vn-hanoi',      nombre: 'Hanói',        paisCodigo: 'VN', paisNombre: 'Vietnam',   lat: 21.0285, lng: 105.8542, radio: 15000 },
  { id: 'vn-hcmc',       nombre: 'Ho Chi Minh',  paisCodigo: 'VN', paisNombre: 'Vietnam',   lat: 10.8231, lng: 106.6297, radio: 15000 },

  // ── ORIENTE MEDIO Y NORTE DE ÁFRICA ─────────────────────────────────────
  { id: 'ir-tehran',     nombre: 'Teherán',      paisCodigo: 'IR', paisNombre: 'Irán',      lat: 35.6892, lng:  51.3890, radio: 20000 },
  { id: 'sa-riyadh',     nombre: 'Riad',         paisCodigo: 'SA', paisNombre: 'Arabia Saudí', lat: 24.7136, lng: 46.6753, radio: 20000 },
  { id: 'ae-dubai',      nombre: 'Dubái',        paisCodigo: 'AE', paisNombre: 'EAU',       lat: 25.2048, lng:  55.2708, radio: 15000 },
  { id: 'eg-cairo',      nombre: 'El Cairo',     paisCodigo: 'EG', paisNombre: 'Egipto',    lat: 30.0444, lng:  31.2357, radio: 20000 },
  { id: 'il-telaviv',    nombre: 'Tel Aviv',     paisCodigo: 'IL', paisNombre: 'Israel',    lat: 32.0853, lng:  34.7818, radio: 10000 },
];

// ────────────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const bbox = (lat, lng, radioMetros) => {
  const dLat = radioMetros / 111000;
  const dLng = radioMetros / (111000 * Math.cos((lat * Math.PI) / 180));
  return { s: lat - dLat, n: lat + dLat, w: lng - dLng, e: lng + dLng };
};

const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const slugify = (s) =>
  s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const overpassPost = async (query) => {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  return res.json();
};

const queryAdmin = async ({ lat, lng, radio }, nivel) => {
  const { s, w, n, e } = bbox(lat, lng, radio);
  const q = `[out:json][timeout:60];
(relation["boundary"="administrative"]["admin_level"="${nivel}"](${s},${w},${n},${e}););
out center tags;`;
  const data = await overpassPost(q);
  return (data.elements || [])
    .filter((el) => el.tags?.name)
    .map((el) => ({
      nombre: el.tags.name,
      lat: el.center?.lat ?? el.lat,
      lng: el.center?.lon ?? el.lon,
      fuente: `admin${nivel}`,
    }))
    .filter((b) => b.lat != null);
};

const queryPlace = async ({ lat, lng, radio }) => {
  const { s, w, n, e } = bbox(lat, lng, radio);
  const q = `[out:json][timeout:60];
(node["place"~"neighbourhood|suburb|quarter"](${s},${w},${n},${e});
 way["place"~"neighbourhood|suburb|quarter"](${s},${w},${n},${e});
 relation["place"~"neighbourhood|suburb|quarter"](${s},${w},${n},${e}););
out center tags;`;
  const data = await overpassPost(q);
  return (data.elements || [])
    .filter((el) => el.tags?.name)
    .map((el) => ({
      nombre: el.tags.name,
      lat: el.center?.lat ?? el.lat,
      lng: el.center?.lon ?? el.lon,
      fuente: 'place',
    }))
    .filter((b) => b.lat != null);
};

const procesarCiudad = async (ciudad) => {
  const niveles = NIVELES[ciudad.paisCodigo] ?? [9, 8];
  let barrios = [];

  for (const nivel of niveles) {
    console.log(`    admin_level=${nivel}...`);
    await sleep(DELAY_MS);
    try {
      barrios = await queryAdmin(ciudad, nivel);
      if (barrios.length >= MIN_BARRIOS) break;
      console.log(`    solo ${barrios.length}, probando siguiente...`);
    } catch (e) {
      console.log(`    error: ${e.message}`);
    }
  }

  if (barrios.length < MIN_BARRIOS) {
    console.log(`    fallback place=neighbourhood...`);
    await sleep(DELAY_MS);
    try {
      const place = await queryPlace(ciudad);
      if (place.length > barrios.length) barrios = place;
    } catch (e) {
      console.log(`    error en fallback: ${e.message}`);
    }
  }

  // Filtrar por radio y deduplicar
  const radioKm = (ciudad.radio / 1000) * 1.2;
  barrios = barrios.filter(
    (b) => haversineKm(ciudad.lat, ciudad.lng, b.lat, b.lng) <= radioKm,
  );
  const vistos = new Set();
  barrios = barrios.filter((b) => {
    const k = slugify(b.nombre);
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });

  console.log(`    ${barrios.length} barrios`);

  if (barrios.length === 0) {
    console.warn(`  ⚠️  Sin barrios — saltando ${ciudad.nombre}`);
    return 0;
  }

  // Escribir ciudad
  await db.collection('ciudades').doc(ciudad.id).set(
    {
      id: ciudad.id,
      nombre: ciudad.nombre,
      paisCodigo: ciudad.paisCodigo,
      paisNombre: ciudad.paisNombre,
      lat: ciudad.lat,
      lng: ciudad.lng,
      radioBusqueda: ciudad.radio,
      estadoCobertura: 'activa',
      totalZonas: barrios.length,
    },
    { merge: true },
  );

  // Escribir territorios en lotes de 400
  for (let i = 0; i < barrios.length; i += 400) {
    const batch = db.batch();
    for (const b of barrios.slice(i, i + 400)) {
      const id = `${ciudad.id}-${slugify(b.nombre)}`;
      const data = {
        nombre: b.nombre,
        lat: b.lat,
        lng: b.lng,
        tipo: 'barrio',
        nombreBase: b.nombre,
        nombreVisible: b.nombre,
        capaIdentidad: 'barrio_reconocible',
        fuenteNombre: b.fuente,
        ciudadId: ciudad.id,
        ciudadNombre: ciudad.nombre,
        paisCodigo: ciudad.paisCodigo,
        paisNombre: ciudad.paisNombre,
        radio: 800,
        dueno: null,
        duenoPuntos: 0,
      };
      batch.set(db.collection('barrios').doc(id), data, { merge: true });
      batch.set(db.collection('territorios').doc(id), data, { merge: true });
    }
    await batch.commit();
  }

  return barrios.length;
};

const main = async () => {
  const arg = process.argv[2];

  if (arg === '--lista') {
    console.log('Ciudades disponibles:\n');
    for (const c of CIUDADES) {
      console.log(`  ${c.id.padEnd(22)} ${c.nombre} (${c.paisCodigo})`);
    }
    process.exit(0);
  }

  const ciudades = arg ? CIUDADES.filter((c) => c.id === arg) : CIUDADES;

  if (ciudades.length === 0) {
    console.error(`Ciudad no encontrada: ${arg}`);
    console.error('Usa --lista para ver las disponibles.');
    process.exit(1);
  }

  console.log(`Procesando ${ciudades.length} ciudad(es)...\n`);
  let ok = 0, err = 0;

  for (const ciudad of ciudades) {
    console.log(`[${ciudad.id}] ${ciudad.nombre}`);
    try {
      const n = await procesarCiudad(ciudad);
      if (n > 0) {
        console.log(`  ✅ ${n} territorios guardados\n`);
        ok++;
      } else {
        err++;
      }
    } catch (e) {
      console.error(`  ❌ ${e.message}\n`);
      err++;
    }
  }

  console.log(`\nCompletado: ${ok} OK, ${err} con problemas`);
  process.exit(err > 0 ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
