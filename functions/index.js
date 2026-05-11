const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { HttpsError, onCall, onRequest } = require('firebase-functions/v2/https');
const { defineString } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const nodemailer = require('nodemailer');

initializeApp();

const GMAIL_USER = defineString('GMAIL_USER', { default: '' });
const GMAIL_PASS = defineString('GMAIL_PASS', { default: '' });
const ADMIN_EMAIL = defineString('ADMIN_EMAIL', { default: '' });
const STRAVA_CLIENT_ID = defineString('STRAVA_CLIENT_ID', { default: '' });
const STRAVA_CLIENT_SECRET = defineString('STRAVA_CLIENT_SECRET', { default: '' });
const STRAVA_REDIRECT_URI = defineString('STRAVA_REDIRECT_URI', {
  default: 'https://us-central1-conquerrun-8d30e.cloudfunctions.net/stravaOAuthCallback',
});

const TIPO_LABELS = {
  grupo: 'Grupo',
  usuario: 'Usuario',
  foto: 'Foto',
};

const MOTIVO_LABELS = {
  contenido_inapropiado: 'Contenido inapropiado',
  spam: 'Spam',
  acoso: 'Acoso o intimidación',
  otro: 'Otro',
};

async function commitEnChunks(ops, chunkSize = 450) {
  const db = getFirestore();
  for (let i = 0; i < ops.length; i += chunkSize) {
    const batch = db.batch();
    ops.slice(i, i + chunkSize).forEach((op) => {
      if (op.type === 'delete') batch.delete(op.ref);
      if (op.type === 'update') batch.update(op.ref, op.data);
      if (op.type === 'set') batch.set(op.ref, op.data, op.options ?? {});
    });
    await batch.commit();
  }
}

async function descontarTerritorioPerdido(event) {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;

  const duenoAnterior = before.dueno ?? null;
  const duenoNuevo = after.dueno ?? null;
  if (!duenoAnterior || duenoAnterior === duenoNuevo) return;

  const ciudadId = after.ciudadId ?? before.ciudadId ?? null;
  const db = getFirestore();
  const { FieldValue } = require('firebase-admin/firestore');
  const batch = db.batch();

  batch.set(db.collection('usuarios').doc(duenoAnterior), {
    barriosConquistadosTotal: FieldValue.increment(-1),
  }, { merge: true });

  if (ciudadId) {
    batch.set(db.collection('rankingsCiudad').doc(`${ciudadId}_${duenoAnterior}`), {
      barrios: FieldValue.increment(-1),
    }, { merge: true });
  }

  await batch.commit();
}

exports.descontarTerritorioSegmentadoPerdido = onDocumentWritten(
  'territorios/{territorioId}/segmentos/{segmentoId}',
  descontarTerritorioPerdido
);

exports.descontarBarrioSegmentadoPerdido = onDocumentWritten(
  'barrios/{territorioId}/segmentos/{segmentoId}',
  descontarTerritorioPerdido
);

exports.eliminarCuenta = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para eliminar la cuenta.');
  }

  const db = getFirestore();
  const { FieldValue } = require('firebase-admin/firestore');
  const ops = [];

  const [territoriosSnap, barriosSnap, gruposSnap, carrerasSnap, rankingSnap, aportacionesSnap, marcasSnap, historicoSnap, privadoSnap] = await Promise.all([
    db.collection('territorios').where('dueno', '==', uid).get(),
    db.collection('barrios').where('dueno', '==', uid).get(),
    db.collection('grupos').where('miembros', 'array-contains', uid).get(),
    db.collection('carreras').where('uid', '==', uid).get(),
    db.collection('rankingsCiudad').where('uid', '==', uid).get(),
    db.collection('aportacionesGrupo').where('uid', '==', uid).get(),
    db.collection('usuarios').doc(uid).collection('marcasTerritoriales').get(),
    db.collection('usuarios').doc(uid).collection('ciudadesHistorico').get(),
    db.collection('usuarios').doc(uid).collection('privado').get(),
  ]);

  [...territoriosSnap.docs, ...barriosSnap.docs].forEach((docSnap) => {
    ops.push({
      type: 'update',
      ref: docSnap.ref,
      data: {
        dueno: null,
        duenoPuntos: 0,
        conquistadoEn: FieldValue.delete(),
      },
    });
  });

  gruposSnap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    ops.push({
      type: 'update',
      ref: docSnap.ref,
      data: {
        miembros: FieldValue.arrayRemove(uid),
        [`nicknames.${uid}`]: FieldValue.delete(),
        ...(data.creador === uid ? { creador: null } : {}),
      },
    });
  });

  [...carrerasSnap.docs, ...rankingSnap.docs, ...aportacionesSnap.docs, ...marcasSnap.docs, ...historicoSnap.docs, ...privadoSnap.docs].forEach((docSnap) => {
    ops.push({ type: 'delete', ref: docSnap.ref });
  });

  ops.push({ type: 'delete', ref: db.collection('usuarios').doc(uid) });

  await commitEnChunks(ops);
  await getAuth().deleteUser(uid);

  return { ok: true };
});

exports.unirseAGrupoConCodigo = onCall(async (request) => {
  const uid = request.auth?.uid;
  const codigo = String(request.data?.codigo ?? '').trim().toUpperCase();
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para unirte a un grupo.');
  }
  if (!/^[A-Z0-9]{6}$/.test(codigo)) {
    throw new HttpsError('invalid-argument', 'Código de grupo no válido.');
  }

  const db = getFirestore();
  const { FieldValue } = require('firebase-admin/firestore');
  const [usuarioSnap, gruposSnap] = await Promise.all([
    db.collection('usuarios').doc(uid).get(),
    db.collection('grupos').where('codigo', '==', codigo).limit(1).get(),
  ]);

  if (gruposSnap.empty) {
    throw new HttpsError('not-found', 'Código incorrecto.');
  }
  if (!usuarioSnap.exists) {
    throw new HttpsError('failed-precondition', 'Perfil de usuario no encontrado.');
  }

  const usuario = usuarioSnap.data();
  const grupoDoc = gruposSnap.docs[0];
  const grupo = grupoDoc.data();
  if (grupo.ciudadId && usuario.ciudadActualId && usuario.ciudadActualId !== grupo.ciudadId) {
    throw new HttpsError('permission-denied', `Este grupo es de ${grupo.ciudadNombre}.`);
  }

  await grupoDoc.ref.update({
    miembros: FieldValue.arrayUnion(uid),
    [`nicknames.${uid}`]: usuario.nickname ?? 'Corredor',
  });

  return { grupoId: grupoDoc.id };
});

// ─── Validación server-side de carreras (Críticos 1, 2, 4) ───────────────────

function haversineMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcularDistanciaRuta(ruta) {
  let total = 0;
  for (let i = 1; i < ruta.length; i++) {
    total += haversineMetros(
      ruta[i - 1].latitude, ruta[i - 1].longitude,
      ruta[i].latitude, ruta[i].longitude
    );
  }
  return total;
}

function calcularPuntosSv(distancia, ritmoMedio) {
  const km = distancia / 1000;
  const factorRitmo = ritmoMedio <= 300
    ? Math.min(5, Math.max(1, 5 - 4 * ((ritmoMedio - 170) / 130) ** 2))
    : Math.min(1, Math.max(0.5, 1 - 0.5 * (ritmoMedio - 300) / 300));
  return Math.round(km * factorRitmo);
}

const SEGMENTOS_RITMO_SV = [
  { id: 'elite', nombre: 'Leyenda', max: 255 },
  { id: 'oro', nombre: 'Señor del mapa', min: 255, max: 300 },
  { id: 'plata', nombre: 'Conquistador', min: 300, max: 345 },
  { id: 'bronce', nombre: 'Retador', min: 345, max: 390 },
  { id: 'popular', nombre: 'Marcador', min: 390, max: 480 },
  { id: 'iniciacion', nombre: 'Explorador', min: 480, max: 720 },
];

function calcularGrupoEdadSv(fechaNacimiento) {
  if (!fechaNacimiento) return 'sin_edad';
  const hoy = new Date();
  const nac = new Date(fechaNacimiento);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  if (edad < 18) return '13-17';
  if (edad < 30) return '18-30';
  if (edad < 45) return '30-45';
  if (edad < 60) return '45-60';
  return '60+';
}

function calcularSegmentoRitmoSv(ritmoSegundosKm) {
  if (!ritmoSegundosKm || !isFinite(ritmoSegundosKm)) return 'popular';
  const segmento = SEGMENTOS_RITMO_SV.find(s =>
    (s.min == null || ritmoSegundosKm >= s.min) &&
    (s.max == null || ritmoSegundosKm < s.max)
  );
  return segmento?.id ?? 'popular';
}

function normalizarGeneroSegmentoSv(genero) {
  return genero === 'hombre' || genero === 'mujer' ? genero : 'sin_genero';
}

function etiquetaSegmentoRitmoSv(segmentoRitmo) {
  return SEGMENTOS_RITMO_SV.find(s => s.id === segmentoRitmo)?.nombre ?? 'Marcador';
}

function calcularSegmentosDesdePerfilYRitmoSv(perfil = {}, ritmo30d = null) {
  const segmentoRitmo = calcularSegmentoRitmoSv(ritmo30d);
  const segmentoGenero = normalizarGeneroSegmentoSv(perfil.genero);
  const segmentoEdad = calcularGrupoEdadSv(perfil.fechaNacimiento);
  const segmentoCompetitivo = `${segmentoRitmo}_${segmentoGenero}_${segmentoEdad}`;
  const generoLabel = segmentoGenero === 'hombre' ? 'Hombre' : segmentoGenero === 'mujer' ? 'Mujer' : 'General';
  return {
    ritmo30d: ritmo30d ?? null,
    segmentoRitmo,
    segmentoGenero,
    segmentoEdad,
    grupoEdad: segmentoEdad,
    segmentoCompetitivo,
    segmentoEtiqueta: `${etiquetaSegmentoRitmoSv(segmentoRitmo)} · ${generoLabel} · ${segmentoEdad}`,
  };
}

function calcularRitmo30dDesdeCarrerasSv(carreras = []) {
  const totales = carreras.reduce((acc, carrera) => {
    const distancia = carrera.distancia ?? carrera.totalMetros ?? 0;
    const duracion = carrera.duracion ?? 0;
    if (distancia <= 0 || duracion <= 0) return acc;
    return { distancia: acc.distancia + distancia, duracion: acc.duracion + duracion };
  }, { distancia: 0, duracion: 0 });

  if (totales.distancia < 1000 || totales.duracion <= 0) return null;
  return Math.round(totales.duracion / (totales.distancia / 1000));
}

function getDistanciaSv(a, b) {
  return haversineMetros(a.latitude, a.longitude, b.latitude, b.longitude);
}

function calcularBarrioSv(punto, barrios) {
  let mejor = null;
  let mejorDist = Infinity;
  for (const barrio of barrios) {
    const d = getDistanciaSv(punto, { latitude: barrio.lat, longitude: barrio.lng });
    if (d < mejorDist) {
      mejorDist = d;
      mejor = barrio;
    }
  }
  return mejor;
}

function puntoMedioSv(a, b) {
  return {
    latitude: (a.latitude + b.latitude) / 2,
    longitude: (a.longitude + b.longitude) / 2,
  };
}

function calcularResumenTerritorialSv(ruta, barrios, puntosPersonales, distanciaTotal) {
  if (!Array.isArray(ruta) || ruta.length < 2 || !Array.isArray(barrios) || barrios.length === 0) {
    return [];
  }

  const acumulado = new Map();
  for (let i = 1; i < ruta.length; i++) {
    const anterior = ruta[i - 1];
    const actual = ruta[i];
    const distanciaTramo = getDistanciaSv(anterior, actual);
    if (!distanciaTramo || !isFinite(distanciaTramo)) continue;

    const barrio = calcularBarrioSv(puntoMedioSv(anterior, actual), barrios)
      ?? calcularBarrioSv(actual, barrios)
      ?? calcularBarrioSv(anterior, barrios);
    if (!barrio) continue;

    const previo = acumulado.get(barrio.id) ?? {
      barrioId: barrio.id,
      territorioId: barrio.territorioId ?? barrio.id,
      coleccion: barrio.coleccion ?? 'barrios',
      nombre: barrio.nombre,
      nombreVisible: barrio.nombreVisible ?? barrio.nombre,
      tipo: barrio.tipo ?? 'barrio',
      ciudadId: barrio.ciudadId ?? null,
      dueno: barrio.dueno ?? null,
      duenoPuntos: barrio.duenoPuntos ?? 0,
      distanciaMetros: 0,
    };

    acumulado.set(barrio.id, {
      ...previo,
      distanciaMetros: previo.distanciaMetros + distanciaTramo,
    });
  }

  return [...acumulado.values()]
    .map(item => {
      const proporcion = distanciaTotal > 0 ? item.distanciaMetros / distanciaTotal : 0;
      return {
        ...item,
        distanciaMetros: Math.round(item.distanciaMetros),
        proporcion,
        puntos: Math.round(puntosPersonales * proporcion),
      };
    })
    .filter(item => item.distanciaMetros > 0 && item.puntos > 0)
    .sort((a, b) => b.distanciaMetros - a.distanciaMetros);
}

function normalizarTerritorioSv(id, data, coleccion) {
  return {
    ...data,
    id,
    barrioId: id,
    territorioId: id,
    coleccion,
    tipo: data.tipo ?? 'barrio',
    nombreVisible: data.nombreVisible ?? data.nombre,
    nombreBase: data.nombreBase ?? data.nombre,
    radio: data.radio ?? 800,
    dueno: data.dueno ?? null,
    duenoPuntos: data.duenoPuntos ?? 0,
  };
}

async function obtenerTerritoriosSegmentadosSv(ciudadId, segmentoCompetitivo) {
  const db = getFirestore();
  const cargar = async (coleccion) => {
    const snap = await db.collection(coleccion).where('ciudadId', '==', ciudadId).get();
    return snap.docs
      .map(d => normalizarTerritorioSv(d.id, d.data(), coleccion))
      .filter(t => typeof t.lat === 'number' && typeof t.lng === 'number' && isFinite(t.lat) && isFinite(t.lng));
  };

  let territorios = await cargar('territorios');
  if (territorios.length === 0) territorios = await cargar('barrios');
  if (!segmentoCompetitivo || territorios.length === 0) return territorios;

  const segmentados = await Promise.all(territorios.map(async (territorio) => {
    const snap = await db.collection(territorio.coleccion).doc(territorio.id)
      .collection('segmentos').doc(segmentoCompetitivo).get();
    return snap.exists ? { ...territorio, ...snap.data() } : territorio;
  }));
  return segmentados;
}

async function stravaFetch(path, accessToken, options = {}) {
  const res = await fetch(`https://www.strava.com/api/v3${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(options.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new HttpsError('internal', 'Error consultando Strava.', { status: res.status, data });
  }
  return data;
}

async function obtenerTokenStrava(uid, code = null) {
  const db = getFirestore();
  const { FieldValue } = require('firebase-admin/firestore');
  const ref = db.collection('usuarios').doc(uid).collection('privado').doc('strava');
  const clientId = STRAVA_CLIENT_ID.value();
  const clientSecret = STRAVA_CLIENT_SECRET.value();
  if (!clientId || !clientSecret) {
    throw new HttpsError('failed-precondition', 'Strava no está configurado en backend.');
  }

  if (code) {
    const res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: STRAVA_REDIRECT_URI.value(),
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new HttpsError('invalid-argument', 'No se pudo conectar Strava con ese código.', data);
    }

    await ref.set({
      athleteId: data.athlete?.id ?? null,
      athleteUsername: data.athlete?.username ?? null,
      athleteFirstname: data.athlete?.firstname ?? null,
      refreshToken: data.refresh_token,
      accessToken: data.access_token,
      expiresAt: data.expires_at,
      scope: data.scope ?? null,
      conectadoEn: FieldValue.serverTimestamp(),
      actualizadoEn: FieldValue.serverTimestamp(),
    }, { merge: true });
    await db.collection('usuarios').doc(uid).set({
      stravaConectado: true,
      stravaAthleteId: data.athlete?.id ?? null,
      stravaConectadoEn: FieldValue.serverTimestamp(),
      actualizadoEn: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { accessToken: data.access_token, ref, primeraConexion: true };
  }

  const snap = await ref.get();
  if (!snap.exists || !snap.data().refreshToken) {
    throw new HttpsError('failed-precondition', 'Necesitas conectar Strava antes de importar.');
  }
  const strava = snap.data();
  const ahora = Math.floor(Date.now() / 1000);
  if (strava.accessToken && strava.expiresAt && strava.expiresAt > ahora + 120) {
    return { accessToken: strava.accessToken, ref, primeraConexion: false };
  }

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: strava.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new HttpsError('internal', 'No se pudo refrescar la conexión con Strava.', data);
  }

  await ref.set({
    refreshToken: data.refresh_token,
    accessToken: data.access_token,
    expiresAt: data.expires_at,
    actualizadoEn: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { accessToken: data.access_token, ref, primeraConexion: false };
}

function motivoIgnorarActividad(activity) {
  const tipo = activity.sport_type ?? activity.type;
  if (!['Run', 'TrailRun'].includes(tipo)) return 'no_running';
  if (activity.manual) return 'manual';
  if (activity.trainer) return 'indoor_trainer';
  if (activity.flagged) return 'flagged';
  if ((activity.distance ?? 0) < 200) return 'distancia_minima';
  if ((activity.moving_time ?? 0) < 60) return 'duracion_minima';
  const ritmo = activity.distance > 0 ? activity.moving_time / (activity.distance / 1000) : 0;
  if (!ritmo || !isFinite(ritmo)) return 'ritmo_invalido';
  if (ritmo < 150) return 'ritmo_demasiado_rapido';
  if (ritmo > 1200) return 'ritmo_demasiado_lento';
  return null;
}

exports.stravaOAuthCallback = onRequest((req, res) => {
  const code = String(req.query.code ?? '').trim();
  const error = String(req.query.error ?? '').trim();
  const scope = String(req.query.scope ?? '').trim();
  const state = String(req.query.state ?? '').trim();
  const params = new URLSearchParams();
  if (code) params.set('code', code);
  if (error) params.set('error', error);
  if (scope) params.set('scope', scope);
  const query = params.toString() ? `?${params.toString()}` : '';
  let stateDeepLink = null;
  try {
    const stateData = state ? JSON.parse(state) : {};
    const returnUrl = String(stateData.returnUrl ?? '').trim();
    const parsed = new URL(returnUrl);
    if (['conquerun:', 'exp:', 'exps:', 'exp+conqurun:'].includes(parsed.protocol)) {
      stateDeepLink = `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}${params.toString()}`;
    }
  } catch (e) {
    stateDeepLink = null;
  }
  const deepLink = `conquerun://strava${query}`;
  const expoDeepLink = `exp+conqurun://strava${query}`;
  const primaryDeepLink = stateDeepLink ?? deepLink;

  res.status(200).send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Volviendo a ConqueRun</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#080b14;color:#f7f1df;margin:0;display:grid;min-height:100vh;place-items:center;padding:24px}
    main{max-width:420px;text-align:center}
    h1{font-size:24px;margin:0 0 12px}
    p{color:#aeb6c8;line-height:1.45}
    a{display:block;margin-top:14px;background:#fc4c02;color:white;text-decoration:none;font-weight:800;padding:14px 18px;border-radius:10px}
    a.secondary{background:#1d2638}
  </style>
  <script>
    const appLink = ${JSON.stringify(primaryDeepLink)};
    const devLink = ${JSON.stringify(expoDeepLink)};
    window.location.href = appLink;
    setTimeout(() => { window.location.href = devLink; }, 900);
  </script>
</head>
<body>
  <main>
    <h1>Volviendo a ConqueRun</h1>
    <p>Si la app no se abre automaticamente, toca una de estas opciones.</p>
    <a href="${primaryDeepLink}">Abrir ConqueRun</a>
    <a class="secondary" href="${expoDeepLink}">Abrir version de desarrollo</a>
  </main>
</body>
</html>`);
});

exports.importarConquistasStrava = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para importar desde Strava.');
  }

  const db = getFirestore();
  const { FieldValue, Timestamp } = require('firebase-admin/firestore');
  const code = String(request.data?.code ?? '').trim() || null;
  const { accessToken, ref: stravaRef, primeraConexion } = await obtenerTokenStrava(uid, code);

  const usuarioSnap = await db.collection('usuarios').doc(uid).get();
  if (!usuarioSnap.exists) {
    throw new HttpsError('failed-precondition', 'Perfil de usuario no encontrado.');
  }
  const perfil = usuarioSnap.data();
  const ciudadId = perfil.ciudadActualId ?? 'es-madrid';
  const ciudadNombre = perfil.ciudadActualNombre ?? 'Madrid';
  const paisCodigo = perfil.paisCodigo ?? 'ES';

  const stravaSnap = await stravaRef.get();
  const stravaData = stravaSnap.data() ?? {};
  const ultimaImportacionMs = stravaData.ultimaImportacionEn?.toMillis?.() ?? null;
  const afterMs = ultimaImportacionMs ?? (Date.now() - 30 * 24 * 60 * 60 * 1000);
  const after = Math.floor(afterMs / 1000);
  const activities = await stravaFetch(`/athlete/activities?per_page=30&after=${after}`, accessToken);
  const candidatas = activities
    .filter(activity => ['Run', 'TrailRun'].includes(activity.sport_type ?? activity.type))
    .slice(0, primeraConexion ? 10 : 30)
    .reverse();

  const desde30d = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const carreras30dSnap = await db.collection('carreras')
    .where('uid', '==', uid)
    .where('fecha', '>=', desde30d)
    .get();
  const carreras30dBase = carreras30dSnap.docs.map(d => d.data());
  const resultados = [];
  let ultimasCarrerasBase = perfil.ultimasCarreras ?? [];
  let importadas = 0;
  let conquistadasTotal = 0;

  for (const activity of candidatas) {
    const carreraId = `${uid}_strava_${activity.id}`;
    const carreraRef = db.collection('carreras').doc(carreraId);
    const existente = await carreraRef.get();
    if (existente.exists) {
      resultados.push({ id: activity.id, nombre: activity.name, estado: 'ignorada', motivo: 'duplicada' });
      continue;
    }

    const motivoBase = motivoIgnorarActividad(activity);
    if (motivoBase) {
      resultados.push({ id: activity.id, nombre: activity.name, estado: 'ignorada', motivo: motivoBase });
      continue;
    }

    const streams = await stravaFetch(
      `/activities/${activity.id}/streams?keys=latlng,time,distance,moving&key_by_type=true`,
      accessToken
    );
    const latlng = streams?.latlng?.data ?? [];
    if (!Array.isArray(latlng) || latlng.length < 2) {
      resultados.push({ id: activity.id, nombre: activity.name, estado: 'ignorada', motivo: 'sin_latlng' });
      continue;
    }

    const startMs = new Date(activity.start_date).getTime();
    const tiempos = streams?.time?.data ?? [];
    const ruta = latlng.map(([latitude, longitude], index) => ({
      latitude,
      longitude,
      timestamp: startMs + ((tiempos[index] ?? 0) * 1000),
      segmentStart: index === 0,
    }));
    const distancia = Math.round(activity.distance ?? (streams?.distance?.data?.at?.(-1) ?? calcularDistanciaRuta(ruta)));
    const duracion = Math.round(activity.moving_time ?? activity.elapsed_time ?? 0);
    const ritmoMedio = distancia > 0 ? Math.round(duracion / (distancia / 1000)) : 0;
    const puntos = calcularPuntosSv(distancia, ritmoMedio);
    const ritmo30d = calcularRitmo30dDesdeCarrerasSv([
      ...carreras30dBase,
      ...resultados.filter(r => r.carreraResumen).map(r => r.carreraResumen),
      { distancia, duracion },
    ]);
    const segmentos = calcularSegmentosDesdePerfilYRitmoSv(perfil, ritmo30d);
    const territorios = await obtenerTerritoriosSegmentadosSv(ciudadId, segmentos.segmentoCompetitivo);
    const territorioCarrera = calcularResumenTerritorialSv(ruta, territorios, puntos, distancia);
    if (territorioCarrera.length === 0) {
      resultados.push({ id: activity.id, nombre: activity.name, estado: 'ignorada', motivo: 'sin_territorio' });
      continue;
    }

    const conquistados = territorioCarrera.filter(b => b.duenoPuntos < b.puntos);
    const nuevosTerritorios = conquistados.filter(b => b.dueno !== uid);
    const fechaCarrera = Timestamp.fromDate(new Date(activity.start_date));
    const carreraResumen = {
      id: carreraId,
      fecha: new Date(activity.start_date).getTime(),
      distancia,
      duracion,
      ritmoMedio,
      puntos,
      puntosPersonales: puntos,
      source: 'strava',
      externalProvider: 'strava',
      externalActivityId: String(activity.id),
      verificationStatus: 'strava_verified',
      stravaActivityUrl: `https://www.strava.com/activities/${activity.id}`,
    };
    const ultimasCarreras = [carreraResumen, ...ultimasCarrerasBase]
      .sort((a, b) => (b.fecha ?? 0) - (a.fecha ?? 0))
      .slice(0, 3);

    const batch = db.batch();
    batch.set(carreraRef, {
      uid,
      ruta,
      distancia,
      duracion,
      ritmoMedio,
      puntos,
      puntosPersonales: puntos,
      aportacionesGrupo: [],
      grupoActivoId: null,
      grupoActivoNombre: null,
      gruposAportados: [],
      territorioCarrera,
      ciudadId,
      ciudadNombre,
      paisCodigo,
      ...segmentos,
      fecha: fechaCarrera,
      source: 'strava',
      externalProvider: 'strava',
      externalActivityId: String(activity.id),
      verificationStatus: 'strava_verified',
      importedAt: FieldValue.serverTimestamp(),
      stravaActivityUrl: `https://www.strava.com/activities/${activity.id}`,
      stravaSportType: activity.sport_type ?? activity.type ?? null,
      stravaRawVisibility: activity.visibility ?? null,
    });

    for (const barrio of territorioCarrera) {
      batch.set(
        db.collection('usuarios').doc(uid).collection('marcasTerritoriales').doc(`${barrio.barrioId}_${segmentos.segmentoCompetitivo}`),
        {
          territorioId: barrio.barrioId,
          puntos: FieldValue.increment(barrio.puntos),
          coleccion: barrio.coleccion,
          ciudadId,
          segmentoCompetitivo: segmentos.segmentoCompetitivo,
          actualizadoEn: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    batch.set(db.collection('usuarios').doc(uid), {
      puntosTotales: FieldValue.increment(puntos),
      distanciaTotal: FieldValue.increment(distancia),
      duracionTotal: FieldValue.increment(duracion),
      carrerasTotal: FieldValue.increment(1),
      ...(nuevosTerritorios.length > 0 && { barriosConquistadosTotal: FieldValue.increment(nuevosTerritorios.length) }),
      ciudadActualId: ciudadId,
      ciudadActualNombre: ciudadNombre,
      paisCodigo,
      ...segmentos,
      ultimasCarreras,
      actualizadoEn: FieldValue.serverTimestamp(),
    }, { merge: true });

    for (const barrio of conquistados) {
      batch.set(
        db.collection(barrio.coleccion).doc(barrio.barrioId).collection('segmentos').doc(segmentos.segmentoCompetitivo),
        {
          territorioId: barrio.barrioId,
          ciudadId,
          ciudadNombre,
          paisCodigo,
          segmentoRitmo: segmentos.segmentoRitmo,
          segmentoGenero: segmentos.segmentoGenero,
          segmentoEdad: segmentos.segmentoEdad,
          segmentoCompetitivo: segmentos.segmentoCompetitivo,
          segmentoEtiqueta: segmentos.segmentoEtiqueta,
          dueno: uid,
          duenoPuntos: barrio.puntos,
          conquistadoEn: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    batch.set(db.collection('rankingsCiudad').doc(`${ciudadId}_${uid}`), {
      ciudadId,
      uid,
      puntos: FieldValue.increment(puntos),
      carreras: FieldValue.increment(1),
      totalMetros: FieldValue.increment(distancia),
      stravaVerificadas: FieldValue.increment(1),
      nickname: perfil.nickname ?? 'Corredor anónimo',
      fotoPerfil: perfil.fotoPerfil ?? null,
      fotoPerfilEstado: perfil.fotoPerfilEstado ?? null,
      pais: perfil.pais ?? null,
      genero: perfil.genero ?? null,
      grupoEdad: segmentos.segmentoEdad,
      ritmo30d: segmentos.ritmo30d,
      segmentoRitmo: segmentos.segmentoRitmo,
      segmentoGenero: segmentos.segmentoGenero,
      segmentoEdad: segmentos.segmentoEdad,
      segmentoCompetitivo: segmentos.segmentoCompetitivo,
      segmentoEtiqueta: segmentos.segmentoEtiqueta,
      topLogros: (perfil.logros ?? []).slice(0, 3),
      barrios: FieldValue.increment(nuevosTerritorios.length),
      actualizadoEn: FieldValue.serverTimestamp(),
    }, { merge: true });

    await batch.commit();

    for (const barrio of territorioCarrera) {
      const barrioSegmentoRef = db.collection(barrio.coleccion).doc(barrio.barrioId)
        .collection('segmentos').doc(segmentos.segmentoCompetitivo);
      const [marcaSnap, barrioSnap] = await Promise.all([
        db.collection('usuarios').doc(uid).collection('marcasTerritoriales')
          .doc(`${barrio.barrioId}_${segmentos.segmentoCompetitivo}`).get(),
        barrioSegmentoRef.get(),
      ]);
      const totalPuntosUsuario = marcaSnap.exists ? (marcaSnap.data().puntos ?? 0) : barrio.puntos;
      const currentTop10 = barrioSnap.data()?.top10 ?? [];
      const newTop10 = [...currentTop10.filter(e => e.uid !== uid), { uid, puntos: totalPuntosUsuario }]
        .sort((a, b) => b.puntos - a.puntos)
        .slice(0, 10);
      await barrioSegmentoRef.set({
        top10: newTop10,
        segmentoCompetitivo: segmentos.segmentoCompetitivo,
        territorioId: barrio.barrioId,
        ciudadId,
        ciudadNombre,
        paisCodigo,
        actualizadoEn: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    importadas += 1;
    conquistadasTotal += nuevosTerritorios.length;
    ultimasCarrerasBase = ultimasCarreras;
    resultados.push({
      id: activity.id,
      nombre: activity.name,
      estado: 'importada',
      puntos,
      distancia,
      territorios: territorioCarrera.length,
      conquistas: nuevosTerritorios.length,
      carreraResumen,
    });
  }

  await stravaRef.set({
    ultimaImportacionEn: FieldValue.serverTimestamp(),
    actualizadoEn: FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    ok: true,
    primeraConexion,
    revisadas: candidatas.length,
    importadas,
    conquistadas: conquistadasTotal,
    resultados: resultados.map(({ carreraResumen, ...rest }) => rest),
  };
});

exports.validarCarrera = onDocumentCreated('carreras/{carreraId}', async (event) => {
  const data = event.data.data();
  const carreraId = event.params.carreraId;
  const { uid, ruta = [], distancia, duracion, puntos, ritmoMedio } = data;

  const db = getFirestore();
  const { FieldValue } = require('firebase-admin/firestore');

  const motivos = [];

  // 1. Validar que el ritmo declarado es consistente con distancia y duración
  if (distancia > 0) {
    const ritmoCalculado = duracion / (distancia / 1000);
    if (Math.abs(ritmoCalculado - ritmoMedio) > 15) {
      motivos.push('ritmo_inconsistente');
    }
  }

  // 2. Validar que los puntos declarados coinciden con la fórmula server-side
  const puntosEsperados = calcularPuntosSv(distancia, ritmoMedio);
  if (Math.abs(puntosEsperados - puntos) > 1) {
    motivos.push('puntos_incorrectos');
  }

  // 3. Validar que la distancia GPS declarada es consistente con la ruta
  if (ruta.length >= 2) {
    const distanciaGps = calcularDistanciaRuta(ruta);
    const desviacion = Math.abs(distanciaGps - distancia) / Math.max(distancia, 1);
    if (desviacion > 0.20) { // tolerancia 20% por filtrado GPS del cliente
      motivos.push('distancia_gps_inconsistente');
    }
  }

  if (motivos.length > 0) {
    // Marcar carrera como fraudulenta y revertir puntos del usuario
    const batch = db.batch();
    batch.update(event.data.ref, {
      fraudulenta: true,
      motivosFraude: motivos,
      verificadoEn: FieldValue.serverTimestamp(),
    });
    batch.update(db.collection('usuarios').doc(uid), {
      puntosTotales: FieldValue.increment(-puntos),
      carrerasTotal: FieldValue.increment(-1),
      distanciaTotal: FieldValue.increment(-Math.round(distancia)),
      duracionTotal: FieldValue.increment(-duracion),
    });
    await batch.commit();
    console.warn(`Carrera fraudulenta detectada: ${carreraId} | uid: ${uid} | motivos: ${motivos.join(', ')}`);
  } else {
    await event.data.ref.update({
      verificado: true,
      verificadoEn: FieldValue.serverTimestamp(),
    });
  }
});

// ─── Notificaciones de reportes ──────────────────────────────────────────────

exports.notificarReporte = onDocumentCreated('reportes/{reportId}', async (event) => {
  const reporte = event.data.data();
  const { tipo, recursoId, motivo, reportadoPor } = reporte;

  const db = getFirestore();

  // Obtener nombre del reportador
  let nombreReportador = reportadoPor;
  try {
    const userSnap = await db.doc(`usuarios/${reportadoPor}`).get();
    if (userSnap.exists) {
      nombreReportador = userSnap.data().nickname ?? reportadoPor;
    }
  } catch {}

  // Obtener nombre del recurso reportado
  let nombreRecurso = recursoId;
  try {
    if (tipo === 'grupo') {
      const grupoSnap = await db.doc(`grupos/${recursoId}`).get();
      if (grupoSnap.exists) nombreRecurso = grupoSnap.data().nombre ?? recursoId;
    } else if (tipo === 'usuario') {
      const usuarioSnap = await db.doc(`usuarios/${recursoId}`).get();
      if (usuarioSnap.exists) nombreRecurso = usuarioSnap.data().nickname ?? recursoId;
    }
  } catch {}

  const tipoLabel = TIPO_LABELS[tipo] ?? tipo;
  const motivoLabel = MOTIVO_LABELS[motivo] ?? motivo;
  const fechaStr = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
  const urlAdmin = `https://console.firebase.google.com/project/conquerrun-8d30e/firestore/data/reportes`;
  const gmailUser = GMAIL_USER.value();
  const gmailPass = GMAIL_PASS.value();
  const adminEmail = ADMIN_EMAIL.value();

  if (
    !gmailUser || !gmailPass || !adminEmail ||
    gmailUser === 'disabled' || gmailPass === 'disabled' || adminEmail === 'disabled'
  ) {
    console.warn('Reporte recibido, pero faltan GMAIL_USER, GMAIL_PASS o ADMIN_EMAIL para enviar email.');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  });

  await transporter.sendMail({
    from: `"ConqueRun Admin" <${gmailUser}>`,
    to: adminEmail,
    subject: `[ConqueRun] Nuevo reporte: ${tipoLabel} – ${nombreRecurso}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#080b14;color:#f8fafc;padding:32px;border-radius:12px;">
        <h2 style="color:#d6aa4c;margin:0 0 24px;">⚑ Nuevo reporte en ConqueRun</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="color:#64748b;padding:8px 0;width:140px;">Tipo</td>
            <td style="color:#f8fafc;font-weight:600;">${tipoLabel}</td>
          </tr>
          <tr>
            <td style="color:#64748b;padding:8px 0;">Recurso</td>
            <td style="color:#f8fafc;font-weight:600;">${nombreRecurso}</td>
          </tr>
          <tr>
            <td style="color:#64748b;padding:8px 0;">ID recurso</td>
            <td style="color:#94a3b8;font-size:13px;">${recursoId}</td>
          </tr>
          <tr>
            <td style="color:#64748b;padding:8px 0;">Motivo</td>
            <td style="color:#f8fafc;">${motivoLabel}</td>
          </tr>
          <tr>
            <td style="color:#64748b;padding:8px 0;">Reportado por</td>
            <td style="color:#f8fafc;">${nombreReportador}</td>
          </tr>
          <tr>
            <td style="color:#64748b;padding:8px 0;">Fecha</td>
            <td style="color:#f8fafc;">${fechaStr}</td>
          </tr>
        </table>
        <div style="margin-top:28px;">
          <a href="${urlAdmin}" style="background:#d6aa4c;color:#080b14;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">
            Ver en Firestore →
          </a>
        </div>
        <p style="color:#334155;font-size:12px;margin-top:32px;">
          ID del reporte: ${event.params.reportId}
        </p>
      </div>
    `,
  });
});
