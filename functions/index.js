const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { HttpsError, onCall, onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineString, defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

initializeApp();

const GMAIL_USER = defineString('GMAIL_USER', { default: '' });
const GMAIL_PASS = defineSecret('GMAIL_PASS');
const ADMIN_EMAIL = defineString('ADMIN_EMAIL', { default: '' });
const STRAVA_CLIENT_ID = defineString('STRAVA_CLIENT_ID', { default: '' });
const STRAVA_CLIENT_SECRET = defineSecret('STRAVA_CLIENT_SECRET');
const STRAVA_REDIRECT_URI = defineString('STRAVA_REDIRECT_URI', {
  default: 'https://us-central1-conquerrun-8d30e.cloudfunctions.net/stravaOAuthCallback',
});
const REQUIRE_APP_CHECK = defineString('REQUIRE_APP_CHECK', { default: 'false' });

function verificarAppCheckCallable(request, nombreFuncion) {
  if (request.app) return;

  const uid = request.auth?.uid ?? 'sin-auth';
  console.warn(`[AppCheck] ${nombreFuncion} sin token de App Check`, { uid });

  if (REQUIRE_APP_CHECK.value() === 'true') {
    throw new HttpsError('failed-precondition', 'La app no esta verificada.');
  }
}

exports.diagnosticarAppCheck = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const hasAppCheck = Boolean(request.app);
  const appId = request.app?.appId ?? null;
  const enforce = REQUIRE_APP_CHECK.value() === 'true';

  console.log('[AppCheckDiag]', { uid, hasAppCheck, appId, enforce });

  return {
    ok: true,
    hasAppCheck,
    appId,
    enforce,
  };
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

const NICKNAME_REGEX = /^[a-zA-Z0-9_áéíóúÁÉÍÓÚñÑüÜ]+$/;
const NICKNAME_KEY_REGEX = /^[a-z0-9_áéíóúñü]+$/;
const PALABRAS_PROHIBIDAS = [
  'puta',
  'puto',
  'mierda',
  'joder',
  'cabron',
  'maricon',
  'nazi',
  'porno',
  'xxx',
];

function normalizarTextoModeracion(texto = '') {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
    .replace(/4/g, 'a').replace(/5/g, 's').replace(/8/g, 'b')
    .replace(/[^a-z0-9\s]/g, '');
}

function contieneTextoProhibido(texto = '') {
  const normalizado = normalizarTextoModeracion(texto);
  return PALABRAS_PROHIBIDAS.some(palabra => normalizado.includes(palabra));
}

function validarNicknameInicial(raw) {
  const nickname = String(raw ?? '').trim();
  const nicknameKey = nickname.toLowerCase();
  if (nickname.length < 3 || nickname.length > 20 || !NICKNAME_REGEX.test(nickname)) {
    throw new HttpsError('invalid-argument', 'Nickname no valido.');
  }
  if (!NICKNAME_KEY_REGEX.test(nicknameKey)) {
    throw new HttpsError('invalid-argument', 'Nickname no valido.');
  }
  if (contieneTextoProhibido(nickname)) {
    throw new HttpsError('invalid-argument', 'Nickname no permitido.');
  }
  return { nickname, nicknameKey };
}

function validarPaisInicial(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpsError('invalid-argument', 'Nacionalidad no valida.');
  }
  const nombre = String(raw.nombre ?? '').trim();
  const bandera = raw.bandera == null ? null : String(raw.bandera).trim();
  const codigo = raw.codigo == null ? null : String(raw.codigo).trim().toUpperCase();
  if (nombre.length < 2 || nombre.length > 80) {
    throw new HttpsError('invalid-argument', 'Nacionalidad no valida.');
  }
  if (bandera != null && bandera.length > 16) {
    throw new HttpsError('invalid-argument', 'Nacionalidad no valida.');
  }
  if (codigo != null && !/^[A-Z]{2,3}$/.test(codigo)) {
    throw new HttpsError('invalid-argument', 'Nacionalidad no valida.');
  }
  return {
    nombre,
    ...(bandera ? { bandera } : {}),
    ...(codigo ? { codigo } : {}),
  };
}

function validarGeneroInicial(raw) {
  if (raw !== 'hombre' && raw !== 'mujer') {
    throw new HttpsError('invalid-argument', 'Genero no valido.');
  }
  return raw;
}

function validarFechaNacimientoInicial(raw) {
  const fechaNacimiento = String(raw ?? '').trim();
  const match = fechaNacimiento.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new HttpsError('invalid-argument', 'Fecha de nacimiento no valida.');

  const anio = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  const ahora = new Date();
  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia ||
    fecha > ahora ||
    anio < 1900
  ) {
    throw new HttpsError('invalid-argument', 'Fecha de nacimiento no valida.');
  }

  let edad = ahora.getUTCFullYear() - anio;
  const mesActual = ahora.getUTCMonth() + 1;
  const diaActual = ahora.getUTCDate();
  if (mesActual < mes || (mesActual === mes && diaActual < dia)) edad -= 1;
  if (edad < 13) {
    throw new HttpsError('failed-precondition', 'Debes tener al menos 13 anos.');
  }
  return fechaNacimiento;
}

async function commitEnChunks(ops, chunkSize = 450) {
  const db = getFirestore();
  for (let i = 0; i < ops.length; i += chunkSize) {
    const batch = db.batch();
    ops.slice(i, i + chunkSize).forEach((op) => {
      if (op.type === 'delete') batch.delete(op.ref);
      else if (op.type === 'update') batch.update(op.ref, op.data);
      else batch.set(op.ref, op.data, op.options ?? {});
    });
    await batch.commit();
  }
}

function top10Uids(top10 = []) {
  return [...new Set(
    top10
      .map(item => item?.uid)
      .filter(uid => typeof uid === 'string' && uid.length > 0)
  )];
}

function perfilPublico(uid, data, FieldValue) {
  return {
    uid,
    nickname: data.nickname ?? 'Corredor anónimo',
    fotoPerfil: data.fotoPerfil ?? null,
    fotoPerfilEstado: data.fotoPerfilEstado ?? null,
    pais: data.pais ?? null,
    genero: data.genero ?? null,
    ciudadActualId: data.ciudadActualId ?? null,
    ciudadActualNombre: data.ciudadActualNombre ?? null,
    paisCodigo: data.paisCodigo ?? null,
    segmentoEtiqueta: data.segmentoEtiqueta ?? null,
    topLogros: (data.logros ?? []).slice(0, 3),
    actualizadoEn: FieldValue.serverTimestamp(),
  };
}

function resumenTerritoriosConquistados(territorios = []) {
  return territorios.map(barrio => ({
    id: barrio.barrioId,
    territorioId: barrio.territorioId ?? barrio.barrioId,
    coleccion: barrio.coleccion ?? null,
    nombre: barrio.nombre ?? barrio.nombreVisible ?? barrio.barrioId,
    nombreVisible: barrio.nombreVisible ?? barrio.nombre ?? barrio.barrioId,
    distanciaMetros: barrio.distanciaMetros ?? 0,
    puntos: barrio.puntos ?? 0,
    puntosAcumuladosUsuario: barrio.puntosAcumuladosUsuario ?? barrio.puntos ?? 0,
  }));
}

async function contarBarriosUsuarioEnSegmento(db, uid, ciudadId, segmentoCompetitivo) {
  if (!uid || !ciudadId || !segmentoCompetitivo) return 0;

  try {
    const snap = await db.collectionGroup('segmentos')
      .where('ciudadId', '==', ciudadId)
      .where('segmentoCompetitivo', '==', segmentoCompetitivo)
      .where('dueno', '==', uid)
      .get();
    return snap.size;
  } catch (e) {
    console.warn('[contarBarriosUsuarioEnSegmento] Fallback por indice no disponible:', e.message);
  }

  const cargarTerritorios = async (coleccion) => {
    const snap = await db.collection(coleccion).where('ciudadId', '==', ciudadId).get();
    return snap.docs.map(docSnap => ({ id: docSnap.id, coleccion }));
  };
  const territorios = [
    ...(await cargarTerritorios('territorios')),
    ...(await cargarTerritorios('barrios')),
  ];
  const segmentos = await Promise.all(territorios.map(async (territorio) => {
    const snap = await db.collection(territorio.coleccion).doc(territorio.id)
      .collection('segmentos').doc(segmentoCompetitivo).get();
    return snap.exists ? snap.data() : null;
  }));
  return segmentos.filter(segmento => segmento?.dueno === uid).length;
}

async function descontarTerritorioPerdido(event) {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;

  const duenoAnterior = before.dueno ?? null;
  const duenoNuevo = after.dueno ?? null;
  if (!duenoAnterior || duenoAnterior === duenoNuevo) return;

  const ciudadId = after.ciudadId ?? before.ciudadId ?? null;
  const segmentoId = event.params.segmentoId ?? after.segmentoCompetitivo ?? before.segmentoCompetitivo ?? null;
  const db = getFirestore();
  const { FieldValue } = require('firebase-admin/firestore');
  const batch = db.batch();
  let hayCambios = false;

  const [usuarioSnap, rankingSnap] = await Promise.all([
    db.collection('usuarios').doc(duenoAnterior).get(),
    ciudadId ? db.collection('rankingsCiudad').doc(`${ciudadId}_${duenoAnterior}`).get() : Promise.resolve(null),
  ]);

  const usuario = usuarioSnap.data() ?? {};
  const ranking = rankingSnap?.data?.() ?? null;
  const territorioEnPerfilActivo = usuario.ciudadActualId === ciudadId;
  const territorioEnRankingSegmento = ranking &&
    (ranking.segmentoCompetitivo ?? segmentoId) === segmentoId;

  if (territorioEnPerfilActivo) {
    batch.set(db.collection('usuarios').doc(duenoAnterior), {
      barriosConquistadosTotal: FieldValue.increment(-1),
    }, { merge: true });
    hayCambios = true;
  }

  if (ciudadId && territorioEnRankingSegmento) {
    batch.set(db.collection('rankingsCiudad').doc(`${ciudadId}_${duenoAnterior}`), {
      barrios: FieldValue.increment(-1),
    }, { merge: true });
    hayCambios = true;
  }

  if (!hayCambios) return;
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

exports.sincronizarRankingPerfil = onDocumentWritten('usuarios/{uid}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  const uid = event.params.uid;
  const db = getFirestore();
  const { FieldValue } = require('firebase-admin/firestore');
  const perfilPublicoRef = db.collection('usuariosPublicos').doc(uid);

  if (!after) {
    await perfilPublicoRef.delete().catch(() => {});
    return;
  }

  const ciudadId = after.ciudadActualId ?? null;
  const ciudadAnteriorId = before?.ciudadActualId ?? null;
  const ciudadCambiada = ciudadAnteriorId !== ciudadId;
  const segmentoAnterior = before?.segmentoCompetitivo ?? null;
  const segmentoActual = after.segmentoCompetitivo ?? null;
  const segmentoCambiado = segmentoAnterior !== segmentoActual;
  const batch = db.batch();

  batch.set(perfilPublicoRef, perfilPublico(uid, after, FieldValue), { merge: true });

  if (!ciudadId) {
    await batch.commit();
    return;
  }

  const rankingRef = db.collection('rankingsCiudad').doc(`${ciudadId}_${uid}`);
  const payload = {
    uid,
    ciudadId,
    nickname: after.nickname ?? 'Corredor anónimo',
    fotoPerfil: after.fotoPerfil ?? null,
    fotoPerfilEstado: after.fotoPerfilEstado ?? null,
    pais: after.pais ?? null,
    genero: after.genero ?? null,
    grupoEdad: after.segmentoEdad ?? null,
    ritmo30d: after.ritmo30d ?? null,
    segmentoRitmo: after.segmentoRitmo ?? null,
    segmentoGenero: after.segmentoGenero ?? null,
    segmentoEdad: after.segmentoEdad ?? null,
    segmentoCompetitivo: after.segmentoCompetitivo ?? null,
    segmentoEtiqueta: after.segmentoEtiqueta ?? null,
    topLogros: (after.logros ?? []).slice(0, 3),
    actualizadoEn: FieldValue.serverTimestamp(),
  };

  if (!before || ciudadCambiada || segmentoCambiado) {
    const [rankingSnap, barriosActuales] = await Promise.all([
      rankingRef.get(),
      contarBarriosUsuarioEnSegmento(db, uid, ciudadId, segmentoActual),
    ]);
    const rankingActual = rankingSnap.exists ? rankingSnap.data() : {};

    payload.barrios = barriosActuales;

    if (ciudadCambiada || segmentoCambiado) {
      batch.set(db.collection('usuarios').doc(uid), {
        barriosConquistadosTotal: barriosActuales,
      }, { merge: true });
    }

    if (!before || ciudadCambiada) {
      Object.assign(payload, {
        puntos: rankingActual.puntos ?? 0,
        carreras: rankingActual.carreras ?? 0,
        totalMetros: rankingActual.totalMetros ?? 0,
        stravaVerificadas: rankingActual.stravaVerificadas ?? 0,
      });
    }
  }

  if (!before && payload.puntos == null) {
    Object.assign(payload, {
      puntos: 0,
      carreras: 0,
      totalMetros: 0,
      stravaVerificadas: 0,
    });
  }

  batch.set(rankingRef, payload, { merge: true });

  const nicknameCambiado = after.nickname && before?.nickname !== after.nickname;
  if (nicknameCambiado) {
    const gruposSnap = await db.collection('grupos').where('miembros', 'array-contains', uid).get();
    for (const grupoDoc of gruposSnap.docs) {
      batch.update(grupoDoc.ref, { [`nicknames.${uid}`]: after.nickname });
    }
  }

  await batch.commit();
});

exports.completarPerfilInicial = onCall(async (request) => {
  verificarAppCheckCallable(request, 'completarPerfilInicial');

  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesion.');
  }

  const { nickname, nicknameKey } = validarNicknameInicial(request.data?.nickname);
  const pais = validarPaisInicial(request.data?.pais);
  const genero = validarGeneroInicial(request.data?.genero);
  const fechaNacimiento = validarFechaNacimientoInicial(request.data?.fechaNacimiento);
  const db = getFirestore();
  const { FieldValue } = require('firebase-admin/firestore');

  const usuarioRef = db.collection('usuarios').doc(uid);
  const nicknameRef = db.collection('nicknames').doc(nicknameKey);
  const privadoRef = usuarioRef.collection('privado').doc('datos');

  return db.runTransaction(async (tx) => {
    const [usuarioSnap, nicknameSnap, privadoSnap] = await Promise.all([
      tx.get(usuarioRef),
      tx.get(nicknameRef),
      tx.get(privadoRef),
    ]);

    const usuario = usuarioSnap.exists ? usuarioSnap.data() : {};
    const nicknameActual = typeof usuario.nickname === 'string' ? usuario.nickname : null;
    const perfilYaTieneNickname = Boolean(nicknameActual);

    if (nicknameSnap.exists && nicknameSnap.data()?.uid !== uid) {
      throw new HttpsError('already-exists', 'Ese nickname ya esta en uso.');
    }

    if (perfilYaTieneNickname && nicknameActual.toLowerCase() !== nicknameKey) {
      throw new HttpsError('failed-precondition', 'El perfil ya tiene nickname.');
    }

    if (!nicknameSnap.exists) {
      tx.set(nicknameRef, { uid });
    }

    if (perfilYaTieneNickname) {
      if (!privadoSnap.exists) {
        tx.set(privadoRef, {
          fechaNacimiento,
          fechaNacimientoGuardadaEn: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      return { ok: true, alreadyCompleted: true };
    }

    tx.set(usuarioRef, {
      nickname,
      pais,
      genero,
      onboardingPendiente: true,
      onboardingCompletado: false,
      actualizadoEn: FieldValue.serverTimestamp(),
    }, { merge: true });

    tx.set(privadoRef, {
      fechaNacimiento,
      fechaNacimientoGuardadaEn: FieldValue.serverTimestamp(),
    }, { merge: true });

    return { ok: true };
  });
});

exports.eliminarCuenta = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para eliminar la cuenta.');
  }
  verificarAppCheckCallable(request, 'eliminarCuenta');

  const db = getFirestore();
  const { FieldValue } = require('firebase-admin/firestore');
  const ops = [];

  const [
    usuarioSnap,
    territoriosSnap,
    barriosSnap,
    segmentosDuenoSnap,
    segmentosTop10Snap,
    gruposSnap,
    carrerasSnap,
    rankingSnap,
    aportacionesSnap,
    marcasSnap,
    historicoSnap,
    privadoSnap,
    reportesPorSnap,
    reportesRecursoSnap,
  ] = await Promise.all([
    db.collection('usuarios').doc(uid).get(),
    db.collection('territorios').where('dueno', '==', uid).get(),
    db.collection('barrios').where('dueno', '==', uid).get(),
    db.collectionGroup('segmentos').where('dueno', '==', uid).get(),
    db.collectionGroup('segmentos').where('top10Uids', 'array-contains', uid).get(),
    db.collection('grupos').where('miembros', 'array-contains', uid).get(),
    db.collection('carreras').where('uid', '==', uid).get(),
    db.collection('rankingsCiudad').where('uid', '==', uid).get(),
    db.collection('aportacionesGrupo').where('uid', '==', uid).get(),
    db.collection('usuarios').doc(uid).collection('marcasTerritoriales').get(),
    db.collection('usuarios').doc(uid).collection('ciudadesHistorico').get(),
    db.collection('usuarios').doc(uid).collection('privado').get(),
    db.collection('reportes').where('reportadoPor', '==', uid).get(),
    db.collection('reportes').where('recursoId', '==', uid).get(),
  ]);

  const gruposABorrar = gruposSnap.docs.filter((docSnap) => {
    const miembros = docSnap.data().miembros ?? [];
    return miembros.filter(miembroUid => miembroUid !== uid).length === 0;
  });
  const gruposABorrarIds = new Set(gruposABorrar.map(docSnap => docSnap.id));

  const segmentosPorRef = new Map();
  const addSegmentoSnap = (docSnap) => {
    if (docSnap?.exists) segmentosPorRef.set(docSnap.ref.path, docSnap);
  };
  segmentosDuenoSnap.docs.forEach(addSegmentoSnap);
  segmentosTop10Snap.docs.forEach(addSegmentoSnap);

  const segmentosDesdeMarcasRefs = marcasSnap.docs
    .map((docSnap) => {
      const marca = docSnap.data();
      if (!marca.coleccion || !marca.territorioId || !marca.segmentoCompetitivo) return null;
      return db.collection(marca.coleccion).doc(marca.territorioId)
        .collection('segmentos').doc(marca.segmentoCompetitivo);
    })
    .filter(Boolean);

  const [segmentosDesdeMarcasSnaps, grupoMarcasSnaps, segmentosGruposBorradosSnaps] = await Promise.all([
    Promise.all(segmentosDesdeMarcasRefs.map(ref => ref.get())),
    Promise.all(gruposABorrar.map(docSnap => db.collection('grupoMarcas').doc(docSnap.id).collection('marcasTerritoriales').get())),
    Promise.all([...gruposABorrarIds].map(grupoId => db.collectionGroup('segmentos').where('duenoGrupo', '==', grupoId).get())),
  ]);

  segmentosDesdeMarcasSnaps.forEach(addSegmentoSnap);
  segmentosGruposBorradosSnaps.forEach(snap => snap.docs.forEach(addSegmentoSnap));

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

  segmentosPorRef.forEach((docSnap) => {
    const data = docSnap.data();
    const update = {};
    if (data.dueno === uid) {
      Object.assign(update, {
        dueno: null,
        duenoPuntos: 0,
        conquistadoEn: FieldValue.delete(),
      });
    }
    const top10 = Array.isArray(data.top10) ? data.top10 : [];
    const nuevoTop10 = top10.filter(item => item?.uid !== uid);
    if (nuevoTop10.length !== top10.length) {
      update.top10 = nuevoTop10;
      update.top10Uids = top10Uids(nuevoTop10);
    }
    if (data.duenoGrupo && gruposABorrarIds.has(data.duenoGrupo)) {
      Object.assign(update, {
        duenoGrupo: null,
        duenoGrupoPuntos: 0,
        actualizadoGrupoEn: FieldValue.delete(),
      });
    }
    if (Object.keys(update).length > 0) {
      update.actualizadoEn = FieldValue.serverTimestamp();
      ops.push({ type: 'update', ref: docSnap.ref, data: update });
    }
  });

  // Calculado antes del commit: tras el commit el creador ya habrá cambiado
  const grupoIdsConFoto = new Set(
    gruposSnap.docs
      .filter(d => {
        const data = d.data();
        const miembrosRestantes = (data.miembros ?? []).filter(m => m !== uid);
        return miembrosRestantes.length > 0 && !!data.foto;
      })
      .map(d => d.id)
  );

  gruposSnap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    const miembrosRestantes = (data.miembros ?? []).filter(miembroUid => miembroUid !== uid);
    if (miembrosRestantes.length === 0) {
      ops.push({ type: 'delete', ref: docSnap.ref });
      ops.push({ type: 'delete', ref: db.collection('grupoMarcas').doc(docSnap.id) });
      return;
    }
    ops.push({
      type: 'update',
      ref: docSnap.ref,
      data: {
        miembros: FieldValue.arrayRemove(uid),
        [`nicknames.${uid}`]: FieldValue.delete(),
        ...(data.creador === uid ? { creador: miembrosRestantes[0] } : {}),
      },
    });
  });

  grupoMarcasSnaps.forEach(snap => snap.docs.forEach((docSnap) => {
    ops.push({ type: 'delete', ref: docSnap.ref });
  }));

  const refsAEliminar = new Map();
  [
    ...carrerasSnap.docs,
    ...rankingSnap.docs,
    ...aportacionesSnap.docs,
    ...marcasSnap.docs,
    ...historicoSnap.docs,
    ...privadoSnap.docs,
    ...reportesPorSnap.docs,
    ...reportesRecursoSnap.docs,
  ].forEach((docSnap) => {
    refsAEliminar.set(docSnap.ref.path, docSnap.ref);
  });
  refsAEliminar.forEach(ref => ops.push({ type: 'delete', ref }));

  ops.push({ type: 'delete', ref: db.collection('usuariosPublicos').doc(uid) });
  ops.push({ type: 'delete', ref: db.collection('usuarios').doc(uid) });

  const nicknameActual = usuarioSnap.exists ? usuarioSnap.data()?.nickname : null;
  if (nicknameActual) {
    ops.push({ type: 'delete', ref: db.collection('nicknames').doc(nicknameActual.toLowerCase()) });
  }

  await commitEnChunks(ops);

  const bucket = getStorage().bucket();
  const [archivosPendientes] = await bucket.getFiles({ prefix: `gruposPendientes/${uid}/` }).catch(() => [[]]);

  await Promise.all([
    bucket.file(`fotos/${uid}.jpg`).delete().catch(() => {}),
    ...archivosPendientes
      .filter(f => {
        const grupoId = f.name.split('/').pop().replace('.jpg', '');
        return !grupoIdsConFoto.has(grupoId);
      })
      .map(f => f.delete().catch(() => {})),
  ]);

  await getAuth().deleteUser(uid);

  return { ok: true };
});

exports.unirseAGrupoConCodigo = onCall(async (request) => {
  const uid = request.auth?.uid;
  const codigo = String(request.data?.codigo ?? '').trim().toUpperCase();
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para unirte a un grupo.');
  }
  verificarAppCheckCallable(request, 'unirseAGrupoConCodigo');
  if (!/^[A-Z0-9]{6}$/.test(codigo)) {
    throw new HttpsError('invalid-argument', 'Código de grupo no válido.');
  }

  const db = getFirestore();
  const { FieldValue } = require('firebase-admin/firestore');
  const [usuarioSnap, gruposSnap, gruposUsuarioSnap] = await Promise.all([
    db.collection('usuarios').doc(uid).get(),
    db.collection('grupos').where('codigo', '==', codigo).limit(1).get(),
    db.collection('grupos').where('miembros', 'array-contains', uid).limit(50).get(),
  ]);

  if (gruposSnap.empty) {
    throw new HttpsError('not-found', 'Código incorrecto.');
  }
  if (!usuarioSnap.exists) {
    throw new HttpsError('failed-precondition', 'Perfil de usuario no encontrado.');
  }
  if (gruposUsuarioSnap.size >= 50) {
    throw new HttpsError('failed-precondition', 'Has alcanzado el límite de 50 grupos.');
  }

  const usuario = usuarioSnap.data();
  const grupoDoc = gruposSnap.docs[0];
  const grupo = grupoDoc.data();
  if (!usuario.nickname) {
    throw new HttpsError('failed-precondition', 'Completa tu perfil antes de unirte a un grupo.');
  }
  if (!grupo.ciudadId || !usuario.ciudadActualId || usuario.ciudadActualId !== grupo.ciudadId) {
    throw new HttpsError('permission-denied', `Este grupo es de ${grupo.ciudadNombre}.`);
  }
  if ((grupo.miembros ?? []).includes(uid)) {
    throw new HttpsError('already-exists', 'Ya eres miembro de este grupo.');
  }

  await grupoDoc.ref.update({
    miembros: FieldValue.arrayUnion(uid),
    [`nicknames.${uid}`]: usuario.nickname,
  });

  return { grupoId: grupoDoc.id };
});

exports.unirseAGrupoPublico = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para unirte a un grupo.');
  }
  verificarAppCheckCallable(request, 'unirseAGrupoPublico');

  const grupoId = String(request.data?.grupoId ?? '').trim();
  if (!grupoId) {
    throw new HttpsError('invalid-argument', 'Falta el ID del grupo.');
  }

  const db = getFirestore();
  const { FieldValue } = require('firebase-admin/firestore');
  const [usuarioSnap, grupoSnap, gruposUsuarioSnap] = await Promise.all([
    db.collection('usuarios').doc(uid).get(),
    db.collection('grupos').doc(grupoId).get(),
    db.collection('grupos').where('miembros', 'array-contains', uid).limit(50).get(),
  ]);

  if (!usuarioSnap.exists) {
    throw new HttpsError('failed-precondition', 'Perfil de usuario no encontrado.');
  }
  if (!grupoSnap.exists) {
    throw new HttpsError('not-found', 'Grupo no encontrado.');
  }

  const usuario = usuarioSnap.data();
  const grupo = grupoSnap.data();

  if (grupo.esPublico !== true) {
    throw new HttpsError('permission-denied', 'Este grupo no es público.');
  }
  if (!usuario.nickname) {
    throw new HttpsError('failed-precondition', 'Completa tu perfil antes de unirte a un grupo.');
  }
  if (!grupo.ciudadId || !usuario.ciudadActualId || usuario.ciudadActualId !== grupo.ciudadId) {
    throw new HttpsError('permission-denied', `Este grupo es de ${grupo.ciudadNombre}.`);
  }
  if ((grupo.miembros ?? []).includes(uid)) {
    throw new HttpsError('already-exists', 'Ya eres miembro de este grupo.');
  }
  if (gruposUsuarioSnap.size >= 50) {
    throw new HttpsError('failed-precondition', 'Has alcanzado el límite de 50 grupos.');
  }

  await grupoSnap.ref.update({
    miembros: FieldValue.arrayUnion(uid),
    [`nicknames.${uid}`]: usuario.nickname,
  });

  return { grupoId };
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

const GPS_ACCURACY_MAX_METROS_SV = 50;
const GPS_VELOCIDAD_MAX_MS_SV = 7;

function puntoPrecisionAceptableSv(punto) {
  return punto?.accuracy == null || punto.accuracy <= GPS_ACCURACY_MAX_METROS_SV;
}

function distanciaTramoPuntuableSv(anterior, actual) {
  if (!anterior || !actual || actual.segmentStart || actual.gapStart) return null;
  if (!puntoPrecisionAceptableSv(anterior) || !puntoPrecisionAceptableSv(actual)) return null;

  const distancia = getDistanciaSv(anterior, actual);
  if (!distancia || !isFinite(distancia)) return null;

  const dt = actual.timestamp && anterior.timestamp
    ? (actual.timestamp - anterior.timestamp) / 1000
    : null;
  if (dt != null && dt > 0 && distancia / dt > GPS_VELOCIDAD_MAX_MS_SV) return null;

  return distancia;
}

function calcularDistanciaRuta(ruta) {
  let total = 0;
  for (let i = 1; i < ruta.length; i++) {
    const distanciaTramo = distanciaTramoPuntuableSv(ruta[i - 1], ruta[i]);
    if (distanciaTramo) total += distanciaTramo;
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

const LOGROS_SV = [
  { id: 'km_10', tipo: 'km', umbral: 10000, bonus: 10 },
  { id: 'km_50', tipo: 'km', umbral: 50000, bonus: 50 },
  { id: 'km_100', tipo: 'km', umbral: 100000, bonus: 100 },
  { id: 'km_500', tipo: 'km', umbral: 500000, bonus: 500 },
  { id: 'km_1000', tipo: 'km', umbral: 1000000, bonus: 1000 },
  { id: 'b_1', tipo: 'barrios', umbral: 1, bonus: 5 },
  { id: 'b_5', tipo: 'barrios', umbral: 5, bonus: 25 },
  { id: 'b_10', tipo: 'barrios', umbral: 10, bonus: 50 },
  { id: 'b_20', tipo: 'barrios', umbral: 20, bonus: 100 },
  { id: 'racha_3', tipo: 'racha', umbral: 3, bonus: 10 },
  { id: 'racha_7', tipo: 'racha', umbral: 7, bonus: 30 },
  { id: 'racha_30', tipo: 'racha', umbral: 30, bonus: 150 },
];

function calcularRachaIncrementalSv(ultimasCarrerasPrevias = [], rachaActual = 0, ahoraMs = Date.now()) {
  if (!ultimasCarrerasPrevias.length) return 1;
  const fechaUltimaMs = ultimasCarrerasPrevias[0]?.fecha;
  if (!fechaUltimaMs) return 1;
  const hoyMs = new Date(ahoraMs).setHours(0, 0, 0, 0);
  const ultDiaMs = new Date(fechaUltimaMs).setHours(0, 0, 0, 0);
  const diffDias = Math.round((hoyMs - ultDiaMs) / 86400000);
  if (diffDias === 0) return rachaActual;
  if (diffDias === 1) return rachaActual + 1;
  return 1;
}

function calcularLogrosDesbloqueadosSv(totalMetros, totalBarrios, racha) {
  return LOGROS_SV.filter((logro) => {
    if (logro.tipo === 'km') return totalMetros >= logro.umbral;
    if (logro.tipo === 'barrios') return totalBarrios >= logro.umbral;
    if (logro.tipo === 'racha') return racha >= logro.umbral;
    return false;
  });
}

function normalizarRutaEntradaSv(ruta) {
  if (!Array.isArray(ruta) || ruta.length < 2 || ruta.length > 20000) {
    throw new HttpsError('invalid-argument', 'La ruta no tiene suficientes puntos válidos.');
  }

  return ruta.map((punto) => {
    const latitude = Number(punto?.latitude);
    const longitude = Number(punto?.longitude);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new HttpsError('invalid-argument', 'La ruta contiene coordenadas inválidas.');
    }
    return {
      latitude,
      longitude,
      ...(Number.isFinite(Number(punto?.timestamp)) ? { timestamp: Number(punto.timestamp) } : {}),
      ...(punto?.segmentStart ? { segmentStart: true } : {}),
      ...(punto?.gapStart ? { gapStart: true } : {}),
      ...(Number.isFinite(Number(punto?.accuracy)) ? { accuracy: Number(punto.accuracy) } : {}),
      ...(Number.isFinite(Number(punto?.speed)) ? { speed: Number(punto.speed) } : {}),
    };
  });
}

function simplificarRutaSv(ruta = [], maxPuntos = 1000) {
  if (!Array.isArray(ruta) || ruta.length <= maxPuntos) return ruta;
  if (maxPuntos <= 2) return [ruta[0], ruta[ruta.length - 1]];
  const reducida = [];
  for (let i = 0; i < maxPuntos; i++) {
    const index = Math.round((i * (ruta.length - 1)) / (maxPuntos - 1));
    if (reducida[reducida.length - 1] !== ruta[index]) reducida.push(ruta[index]);
  }
  return reducida;
}

async function resolverCiudadSv(db, ciudadIdSolicitada, perfil = {}) {
  const ciudadId = ciudadIdSolicitada || perfil.ciudadActualId || 'es-madrid';
  let ciudad = null;
  if (ciudadId) {
    const snap = await db.collection('ciudades').doc(ciudadId).get();
    if (snap.exists) ciudad = { id: snap.id, ...snap.data() };
  }
  return {
    id: ciudad?.id ?? ciudadId,
    nombre: ciudad?.nombre ?? perfil.ciudadActualNombre ?? 'Madrid',
    paisCodigo: ciudad?.paisCodigo ?? perfil.paisCodigo ?? 'ES',
  };
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
  if (!mejor) return null;
  // Rechaza el territorio si el punto GPS está fuera de su radio + 500m de margen.
  // Impide que una ruta en otra ciudad puntúe asignando el territorio "más cercano" aunque esté a cientos de km.
  const maxDist = (mejor.radio ?? 800) + 500;
  return mejorDist <= maxDist ? mejor : null;
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
    const distanciaTramo = distanciaTramoPuntuableSv(anterior, actual);
    if (!distanciaTramo) continue;

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
      duenoNombre: barrio.duenoNombre ?? null,
      duenoPuntos: barrio.duenoPuntos ?? 0,
      distanciaMetros: 0,
    };

    acumulado.set(barrio.id, {
      ...previo,
      distanciaMetros: previo.distanciaMetros + distanciaTramo,
    });
  }

  const distanciaDistribuida = [...acumulado.values()].reduce((s, i) => s + i.distanciaMetros, 0);
  const distanciaBase = distanciaTotal > 0 ? distanciaTotal : distanciaDistribuida;
  return [...acumulado.values()]
    .map(item => {
      const proporcion = distanciaBase > 0 ? item.distanciaMetros / distanciaBase : 0;
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
    const baseSegmento = {
      ...territorio,
      segmentoCompetitivo,
      dueno: null,
      duenoNombre: null,
      duenoPuntos: 0,
      duenoGrupo: null,
      duenoGrupoPuntos: 0,
      top10: [],
      top10Uids: [],
    };
    if (!snap.exists) return baseSegmento;
    return {
      ...baseSegmento,
      ...snap.data(),
      id: territorio.id,
      barrioId: territorio.barrioId,
      territorioId: territorio.territorioId,
      coleccion: territorio.coleccion,
      segmentoCompetitivo,
    };
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
  const clientId = STRAVA_CLIENT_ID.value().trim();
  const clientSecret = STRAVA_CLIENT_SECRET.value().trim();
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
  if (ritmo < 180) return 'ritmo_demasiado_rapido';
  if (ritmo > 720) return 'ritmo_demasiado_lento';
  return null;
}

function validarInputCarrera(data) {
  const ruta = normalizarRutaEntradaSv(data?.ruta ?? []);
  const distancia = Math.round(Number(data?.distancia ?? 0));
  const duracion = Math.round(Number(data?.duracion ?? 0));
  if (!Number.isFinite(distancia) || distancia < 200 || distancia > 100000)
    throw new HttpsError('invalid-argument', 'Distancia de carrera no válida.');
  if (!Number.isFinite(duracion) || duracion < 60 || duracion > 86400)
    throw new HttpsError('invalid-argument', 'Duración de carrera no válida.');
  const ritmoMedio = Math.round(duracion / (distancia / 1000));
  if (!ritmoMedio || ritmoMedio < 180 || ritmoMedio > 720)
    throw new HttpsError('failed-precondition', 'El ritmo no cumple las condiciones para puntuar.');
  const distanciaGps = calcularDistanciaRuta(ruta);
  if (distanciaGps <= 0)
    throw new HttpsError('failed-precondition', 'La ruta GPS no tiene distancia válida.');
  if (Math.abs(distanciaGps - distancia) / Math.max(distancia, 1) > 0.35)
    throw new HttpsError('failed-precondition', 'La distancia no coincide con la ruta GPS.');
  return { ruta, distancia, duracion, ritmoMedio };
}

async function procesarConquistaGrupo(db, aportacionesGrupo, territorioCarreraConMarcas, segmentos, uid, ahoraMs, FieldValue) {
  const grupoActivoAportacion = aportacionesGrupo.length > 0 ? aportacionesGrupo[0] : null;
  if (!grupoActivoAportacion) return;

  let barriosGanadosGrupo = 0;
  const nombresGanadosGrupo = [];
  const barriosPerdidosPorGrupo = new Map();

  await Promise.all(territorioCarreraConMarcas.map(async (barrio) => {
    const marcaGrupoRef = db.collection('grupoMarcas').doc(grupoActivoAportacion.grupoId)
      .collection('marcasTerritoriales').doc(barrio.barrioId);
    const segmentoRef = db.collection(barrio.coleccion).doc(barrio.barrioId)
      .collection('segmentos').doc(segmentos.segmentoCompetitivo);

    let conquistoGrupo = false;
    let anteriorGrupoId = null;

    await db.runTransaction(async (tx) => {
      const [marcaGrupoSnap, segSnap] = await Promise.all([tx.get(marcaGrupoRef), tx.get(segmentoRef)]);
      const totalGrupo = marcaGrupoSnap.data()?.puntos ?? 0;
      const segData = segSnap.data() ?? {};
      anteriorGrupoId = segData.duenoGrupo ?? null;
      if (totalGrupo > (segData.duenoGrupoPuntos ?? 0)) {
        tx.set(segmentoRef, {
          duenoGrupo: grupoActivoAportacion.grupoId,
          duenoGrupoPuntos: totalGrupo,
          actualizadoGrupoEn: FieldValue.serverTimestamp(),
        }, { merge: true });
        conquistoGrupo = true;
      }
    });

    if (conquistoGrupo) {
      const cambioDedueno = anteriorGrupoId !== grupoActivoAportacion.grupoId;
      if (cambioDedueno) {
        barriosGanadosGrupo++;
        nombresGanadosGrupo.push(barrio.nombre ?? barrio.barrioId);
      }
      if (anteriorGrupoId && anteriorGrupoId !== grupoActivoAportacion.grupoId) {
        const prev = barriosPerdidosPorGrupo.get(anteriorGrupoId) ?? { count: 0, nombres: [] };
        prev.count++;
        prev.nombres.push(barrio.nombre ?? barrio.barrioId);
        barriosPerdidosPorGrupo.set(anteriorGrupoId, prev);
      }
    }
  }));

  if (barriosGanadosGrupo > 0 || barriosPerdidosPorGrupo.size > 0) {
    const grupoGanadorSnap = await db.collection('grupos').doc(grupoActivoAportacion.grupoId).get();
    const miembrosGanadores = grupoGanadorSnap.data()?.miembros ?? [];
    const grupoGanadorNombre = grupoGanadorSnap.data()?.nombre ?? 'tu equipo';

    // Aggregate notifications per user: avoids multiple writes to same doc in batch
    // (Admin SDK only applies the last write per doc per batch; arrayUnion would be lost)
    const notifPorUsuario = new Map(); // uid → entrada[]
    const addNotif = (miembroUid, entrada) => {
      if (!notifPorUsuario.has(miembroUid)) notifPorUsuario.set(miembroUid, []);
      notifPorUsuario.get(miembroUid).push(entrada);
    };

    const grupoOps = [];

    if (barriosGanadosGrupo > 0) {
      grupoOps.push({
        ref: db.collection('grupos').doc(grupoActivoAportacion.grupoId),
        data: { barriosConquistados: FieldValue.increment(barriosGanadosGrupo), actualizadoEn: FieldValue.serverTimestamp() },
        options: { merge: true },
      });
      for (const miembroUid of miembrosGanadores) {
        if (miembroUid === uid) continue;
        for (const nombre of nombresGanadosGrupo) {
          addNotif(miembroUid, { tipo: 'territorio_ganado_grupo', nombre, grupoNombre: grupoGanadorNombre, fecha: ahoraMs });
        }
      }
    }

    for (const [grupoId, { count, nombres }] of barriosPerdidosPorGrupo.entries()) {
      grupoOps.push({
        ref: db.collection('grupos').doc(grupoId),
        data: { barriosConquistados: FieldValue.increment(-count), actualizadoEn: FieldValue.serverTimestamp() },
        options: { merge: true },
      });
      const grupoPerdedorSnap = await db.collection('grupos').doc(grupoId).get();
      const miembrosPerdedores = grupoPerdedorSnap.data()?.miembros ?? [];
      const grupoPerdedorNombre = grupoPerdedorSnap.data()?.nombre ?? 'tu equipo';
      for (const miembroUid of miembrosPerdedores) {
        if (miembroUid === uid) continue;
        for (const nombre of nombres) {
          addNotif(miembroUid, { tipo: 'territorio_perdido_grupo', nombre, grupoNombre: grupoPerdedorNombre, grupoGanadorNombre, fecha: ahoraMs });
        }
      }
    }

    // One write per user (arrayUnion with all their entries at once)
    const notifOps = [...notifPorUsuario.entries()].map(([miembroUid, entradas]) => ({
      ref: db.collection('usuarios').doc(miembroUid).collection('privado').doc('notificaciones'),
      data: { notificacionesPendientes: FieldValue.arrayUnion(...entradas) },
      options: { merge: true },
    }));

    await commitEnChunks([...grupoOps, ...notifOps]);
  }
}

async function actualizarTop10Territorios(db, territorioCarreraConMarcas, usuarioRef, segmentos, uid, FieldValue) {
  await Promise.all(territorioCarreraConMarcas
    .filter(barrio => barrio.coleccion && barrio.barrioId && segmentos.segmentoCompetitivo)
    .map(async (barrio) => {
    const barrioSegmentoRef = db.collection(barrio.coleccion).doc(barrio.barrioId)
      .collection('segmentos').doc(segmentos.segmentoCompetitivo);
    const marcaRef = usuarioRef.collection('marcasTerritoriales')
      .doc(`${barrio.barrioId}_${segmentos.segmentoCompetitivo}`);
    await db.runTransaction(async (tx) => {
      const [marcaSnap, segmentoSnap] = await Promise.all([tx.get(marcaRef), tx.get(barrioSegmentoRef)]);
      const totalPuntosUsuario = marcaSnap.exists ? (marcaSnap.data().puntos ?? 0) : barrio.puntosAcumuladosUsuario;
      const currentTop10 = segmentoSnap.data()?.top10 ?? [];
      const newTop10 = [...currentTop10.filter(e => e.uid !== uid), { uid, puntos: totalPuntosUsuario }]
        .sort((a, b) => b.puntos - a.puntos)
        .slice(0, 10);
      tx.set(barrioSegmentoRef, {
        territorioId: barrio.barrioId,
        ciudadId: barrio.ciudadId ?? null,
        segmentoCompetitivo: segmentos.segmentoCompetitivo,
        segmentoRitmo: segmentos.segmentoRitmo ?? null,
        segmentoGenero: segmentos.segmentoGenero ?? null,
        segmentoEdad: segmentos.segmentoEdad ?? null,
        segmentoEtiqueta: segmentos.segmentoEtiqueta ?? null,
        top10: newTop10,
        top10Uids: top10Uids(newTop10),
        actualizadoEn: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  }));
}

exports.registrarCarreraConqurun = onCall(
  async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para guardar una carrera.');
  }
  verificarAppCheckCallable(request, 'registrarCarreraConqurun');

  const db = getFirestore();
  const { FieldValue, Timestamp } = require('firebase-admin/firestore');

  // Idempotency: if the client sends a carreraId and it already exists, return the
  // saved data without writing anything — covers the case where the CF succeeded but
  // the network response was lost and the client retries from carrerasPendientes.
  const carreraIdCliente = String(request.data?.carreraId ?? '').trim();
  const carreraIdValido = /^[a-zA-Z0-9_]{20,100}$/.test(carreraIdCliente) ? carreraIdCliente : null;
  if (carreraIdValido) {
    const existente = await db.collection('carreras').doc(carreraIdValido).get();
    if (existente.exists && existente.data()?.uid !== uid) {
      throw new HttpsError('already-exists', 'El identificador de carrera ya existe.');
    }
    if (existente.exists) {
      const d = existente.data();

      if (d.secondaryStatus === 'pending') {
        const usuarioIdempSnap = await db.collection('usuarios').doc(uid).get();
        const segComp = d.segmentoCompetitivo ?? null;
        const ciudadIdStored = d.ciudadId ?? null;
        const territorioStored = d.territorioCarrera ?? [];
        const aportacionesStored = d.aportacionesGrupo ?? [];
        const usuarioRefRetry = db.collection('usuarios').doc(uid);
        const nicknameRetry = usuarioIdempSnap.data()?.nickname ?? 'Corredor anónimo';
        const ahoraRetry = d.fecha?.toMillis?.() ?? Date.now();

        const marcaRefsConBarrio = territorioStored
          .filter(b => segComp)
          .map(b => ({
            barrio: b,
            ref: usuarioRefRetry.collection('marcasTerritoriales').doc(`${b.barrioId}_${segComp}`),
          }));

        const grupoIds = [...new Set(aportacionesStored.map(a => a.grupoId))];
        const grupoMarcaEntries = aportacionesStored.flatMap(aportacion =>
          territorioStored.map(barrio => ({
            aportacion, barrio,
            ref: db.collection('grupoMarcas').doc(aportacion.grupoId)
              .collection('marcasTerritoriales').doc(barrio.barrioId),
          }))
        );

        // Lecturas paralelas: marcas usuario, aportacionesGrupo, grupos (ledger) y grupoMarcas
        const [marcaSnaps, aportSnaps, grupoSnaps, grupoMarcaSnaps] = await Promise.all([
          Promise.all(marcaRefsConBarrio.map(({ ref }) => ref.get())),
          Promise.all(aportacionesStored.map(a => db.collection('aportacionesGrupo').doc(a.id).get())),
          Promise.all(grupoIds.map(id => db.collection('grupos').doc(id).get())),
          grupoMarcaEntries.length > 0
            ? Promise.all(grupoMarcaEntries.map(e => e.ref.get()))
            : Promise.resolve([]),
        ]);

        const grupoCarrerasMap = new Map(
          grupoIds.map((id, i) => [id, grupoSnaps[i].data()?.carrerasAplicadas ?? []])
        );

        const retryOps = [];

        // 1. marcasTerritoriales — ledger bloquea doble increment
        for (let i = 0; i < marcaRefsConBarrio.length; i++) {
          const { barrio, ref } = marcaRefsConBarrio[i];
          if ((marcaSnaps[i].data()?.carrerasAplicadas ?? []).includes(carreraIdValido)) continue;
          const incr = (barrio.puntos ?? 0) + (barrio.puntosBonusLogros ?? 0);
          if (incr <= 0) continue;
          retryOps.push({
            ref,
            data: { territorioId: barrio.barrioId, puntos: FieldValue.increment(incr),
              carreras: FieldValue.increment(1),
              coleccion: barrio.coleccion, ciudadId: ciudadIdStored,
              segmentoCompetitivo: segComp,
              carrerasAplicadas: FieldValue.arrayUnion(carreraIdValido),
              actualizadoEn: FieldValue.serverTimestamp() },
            options: { merge: true },
          });
        }

        // 2. segmentPayloads — set con merge es idempotente
        for (const barrio of territorioStored) {
          if (!barrio.coleccion || !segComp) continue;
          if (barrio.puntosAcumuladosUsuario > (barrio.duenoPuntos ?? 0)) {
            retryOps.push({
              ref: db.collection(barrio.coleccion).doc(barrio.barrioId)
                .collection('segmentos').doc(segComp),
              data: {
                dueno: uid,
                duenoNombre: nicknameRetry,
                duenoPuntos: barrio.puntosAcumuladosUsuario,
                conquistadoEn: FieldValue.serverTimestamp(),
                territorioId: barrio.barrioId,
                ciudadId: ciudadIdStored,
                ciudadNombre: d.ciudadNombre ?? null,
                paisCodigo: d.paisCodigo ?? null,
                segmentoCompetitivo: segComp,
                segmentoRitmo: d.segmentoRitmo ?? null,
                segmentoGenero: d.segmentoGenero ?? null,
                segmentoEdad: d.segmentoEdad ?? null,
                segmentoEtiqueta: d.segmentoEtiqueta ?? null,
              },
              options: { merge: true },
            });
          }
        }

        // 3. Notificaciones desplazados — arrayUnion idempotente; fecha fija del doc para no duplicar
        for (const barrio of territorioStored) {
          if (barrio.dueno && barrio.dueno !== uid &&
              barrio.puntosAcumuladosUsuario > (barrio.duenoPuntos ?? 0)) {
            retryOps.push({
              ref: db.collection('usuarios').doc(barrio.dueno)
                .collection('privado').doc('notificaciones'),
              data: { notificacionesPendientes: FieldValue.arrayUnion({
                tipo: 'territorio_perdido', nombre: barrio.nombre, fecha: ahoraRetry,
              }) },
              options: { merge: true },
            });
          }
        }

        // 4. Grupos — guardas independientes por tipo de operación
        for (let ai = 0; ai < aportacionesStored.length; ai++) {
          const aportacion = aportacionesStored[ai];

          // Aportación: guard por existencia del documento
          if (!aportSnaps[ai].exists) {
            retryOps.push({
              ref: db.collection('aportacionesGrupo').doc(aportacion.id),
              data: { ...aportacion, distancia: d.distancia, fecha: FieldValue.serverTimestamp() },
            });
          }

          // grupoMarcas: guard por carrerasAplicadas en cada marca (independiente de aportación)
          for (let bi = 0; bi < territorioStored.length; bi++) {
            const entryIdx = ai * territorioStored.length + bi;
            if ((grupoMarcaSnaps[entryIdx]?.data()?.carrerasAplicadas ?? []).includes(carreraIdValido)) continue;
            retryOps.push({
              ref: grupoMarcaEntries[entryIdx].ref,
              data: { puntos: FieldValue.increment(territorioStored[bi].puntos ?? 0),
                carreras: FieldValue.increment(1),
                ciudadId: ciudadIdStored,
                carrerasAplicadas: FieldValue.arrayUnion(carreraIdValido),
                actualizadoEn: FieldValue.serverTimestamp() },
              options: { merge: true },
            });
          }

          // Grupo: guard por carrerasAplicadas en el doc de grupo (independiente de aportación y grupoMarcas)
          if (!(grupoCarrerasMap.get(aportacion.grupoId) ?? []).includes(carreraIdValido)) {
            retryOps.push({
              ref: db.collection('grupos').doc(aportacion.grupoId),
              data: { puntosTotales: FieldValue.increment(aportacion.puntosGrupo),
                carrerasTotales: FieldValue.increment(1),
                distanciaTotal: FieldValue.increment(d.distancia ?? 0),
                duracionTotal: FieldValue.increment(d.duracion ?? 0),
                carrerasAplicadas: FieldValue.arrayUnion(carreraIdValido),
                actualizadoEn: FieldValue.serverTimestamp() },
              options: { merge: true },
            });
          }
        }

        if (retryOps.length > 0) await commitEnChunks(retryOps);

        const segmentosRetry = {
          segmentoCompetitivo: d.segmentoCompetitivo ?? null,
          segmentoRitmo: d.segmentoRitmo ?? null,
          segmentoGenero: d.segmentoGenero ?? null,
          segmentoEdad: d.segmentoEdad ?? null,
          segmentoEtiqueta: d.segmentoEtiqueta ?? null,
          ritmo30d: d.ritmo30d ?? null,
        };
        await procesarConquistaGrupo(db, aportacionesStored, territorioStored, segmentosRetry, uid, ahoraRetry, FieldValue);
        await actualizarTop10Territorios(db, territorioStored, usuarioRefRetry, segmentosRetry, uid, FieldValue);
        await db.collection('carreras').doc(carreraIdValido).update({ secondaryStatus: 'complete' });
      }

      return {
        ok: true,
        carreraId: carreraIdValido,
        puntos: d.puntosPersonales ?? d.puntos ?? 0,
        bonusLogros: d.bonusLogros ?? 0,
        distancia: d.distancia ?? 0,
        duracion: d.duracion ?? 0,
        ritmoMedio: d.ritmoMedio ?? 0,
        conquistas: d.conquistasCarrera ?? [],
        territorioCarrera: d.territorioCarrera ?? [],
        aportacionesGrupo: d.aportacionesGrupo ?? [],
        nuevosLogros: d.nuevosLogros ?? [],
        segmentos: {
          segmentoCompetitivo: d.segmentoCompetitivo ?? null,
          segmentoRitmo: d.segmentoRitmo ?? null,
          segmentoGenero: d.segmentoGenero ?? null,
          segmentoEdad: d.segmentoEdad ?? null,
          segmentoEtiqueta: d.segmentoEtiqueta ?? null,
          ritmo30d: d.ritmo30d ?? null,
        },
        ciudad: { id: d.ciudadId ?? null, nombre: d.ciudadNombre ?? null, paisCodigo: d.paisCodigo ?? null },
        carreraResumen: {
          id: carreraIdValido,
          fecha: typeof d.fecha?.toMillis === 'function' ? d.fecha.toMillis() : (d.fecha ?? Date.now()),
          distancia: d.distancia ?? 0,
          duracion: d.duracion ?? 0,
          ritmoMedio: d.ritmoMedio ?? 0,
          puntos: d.puntosPersonales ?? d.puntos ?? 0,
          puntosPersonales: d.puntosPersonales ?? d.puntos ?? 0,
          bonusLogros: d.bonusLogros ?? 0,
          source: d.source ?? 'conqurun',
          verificationStatus: d.verificationStatus ?? 'self_recorded',
        },
      };
    }
  }

  const { ruta, distancia, duracion, ritmoMedio } = validarInputCarrera(request.data);

  const usuarioRef = db.collection('usuarios').doc(uid);
  const [usuarioSnap, privadoDatosSnap] = await Promise.all([
    usuarioRef.get(),
    db.collection('usuarios').doc(uid).collection('privado').doc('datos').get(),
  ]);
  if (!usuarioSnap.exists) {
    throw new HttpsError('failed-precondition', 'Perfil de usuario no encontrado.');
  }
  const perfil = {
    ...usuarioSnap.data(),
    ...(privadoDatosSnap.exists ? { fechaNacimiento: privadoDatosSnap.data().fechaNacimiento } : {}),
  };
  const ultimaCarreraFecha = perfil.ultimasCarreras?.[0]?.fecha ?? 0;
  if (typeof ultimaCarreraFecha === 'number' && Date.now() - ultimaCarreraFecha < 30_000) {
    throw new HttpsError('resource-exhausted', 'Espera unos segundos antes de registrar otra carrera.');
  }
  const ciudad = await resolverCiudadSv(
    db,
    String(request.data?.ciudadId ?? '').trim() || null,
    perfil
  );
  const puntos = calcularPuntosSv(distancia, ritmoMedio);

  const desde30d = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const carreras30dSnap = await db.collection('carreras')
    .where('uid', '==', uid)
    .where('fecha', '>=', desde30d)
    .get();
  const ritmo30d = calcularRitmo30dDesdeCarrerasSv([
    ...carreras30dSnap.docs.map(d => d.data()),
    { distancia, duracion },
  ]);
  const segmentos = calcularSegmentosDesdePerfilYRitmoSv(perfil, ritmo30d);
  const territorios = await obtenerTerritoriosSegmentadosSv(ciudad.id, segmentos.segmentoCompetitivo);
  const territorioCarrera = calcularResumenTerritorialSv(ruta, territorios, puntos, distancia);
  if (territorioCarrera.length === 0) {
    throw new HttpsError('failed-precondition', 'La carrera no atraviesa territorios activos.');
  }

  const marcasPrevias = await Promise.all(territorioCarrera.map(async (barrio) => {
    const marcaSnap = await usuarioRef.collection('marcasTerritoriales')
      .doc(`${barrio.barrioId}_${segmentos.segmentoCompetitivo}`)
      .get();
    return marcaSnap.exists ? (marcaSnap.data().puntos ?? 0) : 0;
  }));
  const territorioCarreraConMarcas = territorioCarrera.map((barrio, index) => {
    const puntosPreviosUsuario = marcasPrevias[index] ?? 0;
    const puntosAcumuladosUsuario = puntosPreviosUsuario + barrio.puntos;
    return {
      ...barrio,
      puntosPreviosUsuario,
      puntosAcumuladosUsuario,
    };
  });

  const territorioKey = (barrio) => `${barrio.coleccion}/${barrio.barrioId}`;
  const segmentPayloads = new Map();
  const mezclarSegmentPayload = (barrio, payload) => {
    const key = territorioKey(barrio);
    segmentPayloads.set(key, {
      ref: db.collection(barrio.coleccion).doc(barrio.barrioId)
        .collection('segmentos').doc(segmentos.segmentoCompetitivo),
      data: {
        ...(segmentPayloads.get(key)?.data ?? {}),
        territorioId: barrio.barrioId,
        ciudadId: ciudad.id,
        ciudadNombre: ciudad.nombre,
        paisCodigo: ciudad.paisCodigo,
        segmentoRitmo: segmentos.segmentoRitmo,
        segmentoGenero: segmentos.segmentoGenero,
        segmentoEdad: segmentos.segmentoEdad,
        segmentoCompetitivo: segmentos.segmentoCompetitivo,
        segmentoEtiqueta: segmentos.segmentoEtiqueta,
        ...payload,
      },
    });
  };

  const conquistadosBase = territorioCarreraConMarcas.filter(
    b => b.dueno !== uid && b.puntosAcumuladosUsuario > (b.duenoPuntos ?? 0)
  );
  const nuevosTerritoriosPorKey = new Map(conquistadosBase.map(b => [territorioKey(b), b]));
  conquistadosBase.forEach(barrio => mezclarSegmentPayload(barrio, {
    dueno: uid,
    duenoNombre: perfil.nickname ?? 'Corredor anónimo',
    duenoPuntos: barrio.puntosAcumuladosUsuario,
    conquistadoEn: FieldValue.serverTimestamp(),
  }));
  territorioCarreraConMarcas
    .filter(b => b.dueno === uid && b.puntosAcumuladosUsuario > (b.duenoPuntos ?? 0))
    .forEach(barrio => mezclarSegmentPayload(barrio, {
      dueno: uid,
      duenoNombre: perfil.nickname ?? 'Corredor anónimo',
      duenoPuntos: barrio.puntosAcumuladosUsuario,
      conquistadoEn: FieldValue.serverTimestamp(),
    }));

  const ahoraMs = Date.now();
  const carreraId = carreraIdValido ?? `${uid}_${ahoraMs}_${crypto.randomBytes(6).toString('hex')}`;
  const nuevaRacha = calcularRachaIncrementalSv(perfil.ultimasCarreras ?? [], perfil.racha ?? 0, ahoraMs);
  const totalMetrosDespues = (perfil.distanciaTotal ?? 0) + distancia;
  const historicoBarriosPrevio = Math.max(
    perfil.barriosConquistadosHistorico ?? 0,
    perfil.barriosConquistadosTotal ?? 0
  );
  const totalBarriosBase = historicoBarriosPrevio + nuevosTerritoriosPorKey.size;
  const desbloqueados = calcularLogrosDesbloqueadosSv(totalMetrosDespues, totalBarriosBase, nuevaRacha);
  const logrosPrevios = new Set(perfil.logros ?? []);
  const nuevosLogros = desbloqueados.filter(logro => !logrosPrevios.has(logro.id));
  const bonusLogros = nuevosLogros.reduce((sum, logro) => sum + (logro.bonus ?? 0), 0);

  if (bonusLogros > 0) {
    let topIndex = 0;
    for (let i = 1; i < territorioCarreraConMarcas.length; i++) {
      if ((territorioCarreraConMarcas[i].puntos ?? 0) > (territorioCarreraConMarcas[topIndex].puntos ?? 0)) {
        topIndex = i;
      }
    }
    const topBarrio = territorioCarreraConMarcas[topIndex];
    topBarrio.puntosBonusLogros = bonusLogros;
    topBarrio.puntosAcumuladosUsuario += bonusLogros;
    const conquistaConBonus = topBarrio.dueno !== uid &&
      topBarrio.puntosAcumuladosUsuario > (topBarrio.duenoPuntos ?? 0);
    if (conquistaConBonus) nuevosTerritoriosPorKey.set(territorioKey(topBarrio), topBarrio);
    if (topBarrio.dueno === uid || conquistaConBonus || segmentPayloads.has(territorioKey(topBarrio))) {
      mezclarSegmentPayload(topBarrio, {
        dueno: uid,
        duenoNombre: perfil.nickname ?? 'Corredor anónimo',
        duenoPuntos: topBarrio.puntosAcumuladosUsuario,
        conquistadoEn: FieldValue.serverTimestamp(),
      });
    }
  }

  const nuevosTerritorios = [...nuevosTerritoriosPorKey.values()];
  const conquistasCarrera = resumenTerritoriosConquistados(nuevosTerritorios);
  const puntosTotalesCarrera = puntos + bonusLogros;
  const carreraResumen = {
    id: carreraId,
    fecha: ahoraMs,
    distancia,
    duracion,
    ritmoMedio,
    puntos,
    puntosPersonales: puntos,
    bonusLogros,
    source: 'conqurun',
    verificationStatus: 'self_recorded',
  };
  const ultimasCarreras = [carreraResumen, ...(perfil.ultimasCarreras ?? [])].slice(0, 3);

  const grupoActivoId = String(request.data?.grupoActivoId ?? '').trim() || null;
  let grupoActivo = null;
  let aportacionesGrupo = [];
  if (grupoActivoId) {
    const grupoSnap = await db.collection('grupos').doc(grupoActivoId).get();
    if (grupoSnap.exists) {
      const grupoData = grupoSnap.data();
      if (Array.isArray(grupoData.miembros) && grupoData.miembros.includes(uid)) {
        grupoActivo = { id: grupoSnap.id, ...grupoData };
        aportacionesGrupo = [{
          id: `${carreraId}_${grupoSnap.id}`,
          carreraId,
          grupoId: grupoSnap.id,
          grupoNombre: grupoData.nombre ?? 'Equipo',
          uid,
          puntosBase: puntos,
          multiplicadorGrupo: 1,
          puntosGrupo: puntos,
          miembrosGrupoEnEseMomento: grupoData.miembros.length,
        }];
      }
    }
  }

  const topLogros = desbloqueados
    .slice()
    .sort((a, b) => b.bonus - a.bonus)
    .slice(0, 3)
    .map(l => l.id);
  const nuevoTotalBarrios = (perfil.barriosConquistadosTotal ?? 0) + nuevosTerritorios.length;
  const nuevoMax = Math.max(nuevoTotalBarrios, perfil.maxBarriosSimultaneos ?? 0);
  const historicoBarriosInicial = perfil.barriosConquistadosHistorico == null;
  const nuevoHistoricoBarrios = historicoBarriosPrevio + nuevosTerritorios.length;
  const actualizacionHistoricoBarrios = historicoBarriosInicial
    ? nuevoHistoricoBarrios
    : FieldValue.increment(nuevosTerritorios.length);

  // ─── Fase 1: transacción atómica e idempotente ──────────────────────────
  // Escribe carrera doc con secondaryStatus=pending + perfil + ranking en una
  // sola transacción. Si carreraRef ya existe, no toca contadores. Los retries
  // posteriores entran por el cortocircuito superior y, si Fase 2 quedó
  // pendiente, reconstruyen solo las operaciones secundarias que falten.
  // ─────────────────────────────────────────────────────────────────────────
  const carreraRef = db.collection('carreras').doc(carreraId);
  const rankingRef = db.collection('rankingsCiudad').doc(`${ciudad.id}_${uid}`);
  let yaRegistrada = false;

  await db.runTransaction(async (tx) => {
    const [carreraSnap, usuarioTxSnap] = await Promise.all([
      tx.get(carreraRef),
      tx.get(usuarioRef),
    ]);
    if (carreraSnap.exists) { yaRegistrada = true; return; }

    // Límite 30 s dentro de la transacción: bloquea dos carreras concurrentes
    // con IDs distintos que pasen el check pre-transacción simultáneamente
    const ultimaFechaTx = usuarioTxSnap.data()?.ultimasCarreras?.[0]?.fecha ?? 0;
    if (typeof ultimaFechaTx === 'number' && Date.now() - ultimaFechaTx < 30_000) {
      throw new HttpsError('resource-exhausted', 'Espera unos segundos antes de registrar otra carrera.');
    }

    tx.set(carreraRef, {
      uid,
      ruta: simplificarRutaSv(ruta),
      distancia,
      duracion,
      ritmoMedio,
      puntos,
      puntosPersonales: puntos,
      bonusLogros,
      puntosTotales: puntosTotalesCarrera,
      nuevosLogros: nuevosLogros.map(l => l.id),
      aportacionesGrupo,
      grupoActivoId: grupoActivo?.id ?? null,
      grupoActivoNombre: grupoActivo?.nombre ?? null,
      gruposAportados: aportacionesGrupo.map(a => a.grupoId),
      territorioCarrera: territorioCarreraConMarcas,
      barriosConquistados: nuevosTerritorios.length,
      conquistasCarrera,
      ciudadId: ciudad.id,
      ciudadNombre: ciudad.nombre,
      paisCodigo: ciudad.paisCodigo,
      ...segmentos,
      fecha: FieldValue.serverTimestamp(),
      source: 'conqurun',
      externalProvider: null,
      externalActivityId: null,
      verificationStatus: 'self_recorded',
      importedAt: null,
      stravaActivityUrl: null,
      secondaryStatus: 'pending',
    });

    tx.set(usuarioRef, {
      puntosTotales: FieldValue.increment(puntosTotalesCarrera),
      distanciaTotal: FieldValue.increment(distancia),
      duracionTotal: FieldValue.increment(duracion),
      carrerasTotal: FieldValue.increment(1),
      ...(nuevosTerritorios.length > 0 && { barriosConquistadosTotal: FieldValue.increment(nuevosTerritorios.length) }),
      ...((historicoBarriosInicial || nuevosTerritorios.length > 0) && {
        barriosConquistadosHistorico: actualizacionHistoricoBarrios,
      }),
      ...(nuevoMax > (perfil.maxBarriosSimultaneos ?? 0) && { maxBarriosSimultaneos: nuevoMax }),
      ...(nuevosLogros.length > 0 && { logros: desbloqueados.map(l => l.id) }),
      racha: nuevaRacha,
      ciudadActualId: ciudad.id,
      ciudadActualNombre: ciudad.nombre,
      paisCodigo: ciudad.paisCodigo,
      ...segmentos,
      ultimasCarreras,
      ultimaCarreraId: carreraId,
      actualizadoEn: FieldValue.serverTimestamp(),
    }, { merge: true });

    tx.set(rankingRef, {
      ciudadId: ciudad.id,
      uid,
      puntos: FieldValue.increment(puntosTotalesCarrera),
      carreras: FieldValue.increment(1),
      totalMetros: FieldValue.increment(distancia),
      stravaVerificadas: FieldValue.increment(0),
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
      topLogros,
      barrios: FieldValue.increment(nuevosTerritorios.length),
      actualizadoEn: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  if (yaRegistrada) {
    // carreraRef ya existía pero el cortocircuito de arriba no lo capturó
    // (p.ej. ultimaCarreraId aún no sincronizado). Devolvemos éxito sin
    // reescribir nada para evitar duplicar contadores.
    console.warn('[registrarCarrera] transacción abortó: carrera ya registrada', { carreraId, uid });
    return { ok: true, carreraId, carreraResumen, puntos, bonusLogros, distancia, duracion, ritmoMedio,
      conquistas: conquistasCarrera, territorioCarrera: territorioCarreraConMarcas,
      aportacionesGrupo, nuevosLogros: nuevosLogros.map(l => l.id), segmentos, ciudad };
  }

  // ─── Fase 2: operaciones secundarias con ledger ──────────────────────────
  // Escribe marcas, grupos, segmentos y notificaciones. Si un chunk falla,
  // secondaryStatus permanece en pending y el siguiente retry usa
  // carrerasAplicadas/existencia de docs para aplicar únicamente lo pendiente.
  // secondaryStatus pasa a complete solo después de territorio, grupo y top10.
  // ─────────────────────────────────────────────────────────────────────────
  const secondaryOps = [];

  for (const barrio of territorioCarreraConMarcas) {
    const incrementoMarca = barrio.puntos + (barrio.puntosBonusLogros ?? 0);
    secondaryOps.push({
      ref: usuarioRef.collection('marcasTerritoriales').doc(`${barrio.barrioId}_${segmentos.segmentoCompetitivo}`),
      data: {
        territorioId: barrio.barrioId,
        puntos: FieldValue.increment(incrementoMarca),
        carreras: FieldValue.increment(1),
        coleccion: barrio.coleccion,
        ciudadId: ciudad.id,
        segmentoCompetitivo: segmentos.segmentoCompetitivo,
        carrerasAplicadas: FieldValue.arrayUnion(carreraId),
        actualizadoEn: FieldValue.serverTimestamp(),
      },
      options: { merge: true },
    });
  }

  for (const barrio of nuevosTerritorios) {
    if (barrio.dueno && barrio.dueno !== uid) {
      secondaryOps.push({
        ref: db.collection('usuarios').doc(barrio.dueno).collection('privado').doc('notificaciones'),
        data: {
          notificacionesPendientes: FieldValue.arrayUnion({
            tipo: 'territorio_perdido',
            nombre: barrio.nombre,
            fecha: ahoraMs,
          }),
        },
        options: { merge: true },
      });
    }
  }

  for (const aportacion of aportacionesGrupo) {
    secondaryOps.push({
      ref: db.collection('aportacionesGrupo').doc(aportacion.id),
      data: { ...aportacion, distancia, fecha: FieldValue.serverTimestamp() },
    });
    const grupoUpdate = {
      puntosTotales: FieldValue.increment(aportacion.puntosGrupo),
      carrerasTotales: FieldValue.increment(1),
      distanciaTotal: FieldValue.increment(distancia),
      duracionTotal: FieldValue.increment(duracion),
      carrerasAplicadas: FieldValue.arrayUnion(carreraId),
      actualizadoEn: FieldValue.serverTimestamp(),
    };
    for (const barrio of territorioCarreraConMarcas) {
      secondaryOps.push({
        ref: db.collection('grupoMarcas').doc(aportacion.grupoId)
          .collection('marcasTerritoriales').doc(barrio.barrioId),
        data: { puntos: FieldValue.increment(barrio.puntos), carreras: FieldValue.increment(1), ciudadId: ciudad.id, carrerasAplicadas: FieldValue.arrayUnion(carreraId), actualizadoEn: FieldValue.serverTimestamp() },
        options: { merge: true },
      });
    }
    secondaryOps.push({
      ref: db.collection('grupos').doc(aportacion.grupoId),
      data: grupoUpdate,
      options: { merge: true },
    });
  }

  for (const { ref, data } of segmentPayloads.values()) {
    secondaryOps.push({ ref, data, options: { merge: true } });
  }

  await commitEnChunks(secondaryOps);

  await procesarConquistaGrupo(db, aportacionesGrupo, territorioCarreraConMarcas, segmentos, uid, ahoraMs, FieldValue);
  await actualizarTop10Territorios(db, territorioCarreraConMarcas, usuarioRef, segmentos, uid, FieldValue);

  await carreraRef.update({ secondaryStatus: 'complete' });

  return {
    ok: true,
    carreraId,
    carreraResumen,
    puntos,
    bonusLogros,
    distancia,
    duracion,
    ritmoMedio,
    segmentos,
    ciudad,
    territorioCarrera: territorioCarreraConMarcas,
    aportacionesGrupo,
    conquistas: conquistasCarrera,
    nuevosLogros: nuevosLogros.map(l => l.id),
  };
});

exports.repararConsistenciaUsuario = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para reparar consistencia.');
  }
  verificarAppCheckCallable(request, 'repararConsistenciaUsuario');

  const db = getFirestore();
  const { FieldValue } = require('firebase-admin/firestore');
  const userRef = db.collection('usuarios').doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new HttpsError('failed-precondition', 'Perfil de usuario no encontrado.');
  }
  const userData = userSnap.data();
  const ultimaReparacionMs = userData.ultimaReparacionEn?.toMillis?.() ?? 0;
  if (ultimaReparacionMs && Date.now() - ultimaReparacionMs < 5 * 60 * 1000) {
    throw new HttpsError('resource-exhausted', 'Espera 5 minutos antes de volver a reparar.');
  }
  const ciudadId = userData.ciudadActualId ?? null;
  const segmentoCompetitivo = userData.segmentoCompetitivo ?? null;
  if (!ciudadId || !segmentoCompetitivo) {
    return { ok: true, reparado: false, motivo: 'sin_ciudad_o_segmento' };
  }

  const rankingRef = db.collection('rankingsCiudad').doc(`${ciudadId}_${uid}`);
  const [barrios, rankingSnap] = await Promise.all([
    contarBarriosUsuarioEnSegmento(db, uid, ciudadId, segmentoCompetitivo),
    rankingRef.get(),
  ]);
  const rankingActual = rankingSnap.exists ? rankingSnap.data() : {};
  const maxBarriosSimultaneos = Math.max(userData.maxBarriosSimultaneos ?? 0, barrios);
  const barriosConquistadosHistorico = Math.max(
    userData.barriosConquistadosHistorico ?? 0,
    barrios
  );
  const rankingStats = {
    puntos: rankingActual.puntos ?? 0,
    carreras: rankingActual.carreras ?? 0,
    totalMetros: rankingActual.totalMetros ?? 0,
    stravaVerificadas: rankingActual.stravaVerificadas ?? 0,
  };

  const payloadRanking = {
    uid,
    ciudadId,
    ...rankingStats,
    barrios,
    nickname: userData.nickname ?? 'Corredor anónimo',
    fotoPerfil: userData.fotoPerfil ?? null,
    fotoPerfilEstado: userData.fotoPerfilEstado ?? null,
    pais: userData.pais ?? null,
    genero: userData.genero ?? null,
    grupoEdad: userData.segmentoEdad ?? null,
    ritmo30d: userData.ritmo30d ?? null,
    segmentoRitmo: userData.segmentoRitmo ?? null,
    segmentoGenero: userData.segmentoGenero ?? null,
    segmentoEdad: userData.segmentoEdad ?? null,
    segmentoCompetitivo,
    segmentoEtiqueta: userData.segmentoEtiqueta ?? null,
    topLogros: (userData.logros ?? []).slice(0, 3),
    actualizadoEn: FieldValue.serverTimestamp(),
  };

  const batch = db.batch();
  batch.set(userRef, {
    barriosConquistadosTotal: barrios,
    barriosConquistadosHistorico,
    maxBarriosSimultaneos,
    ultimaReparacionEn: FieldValue.serverTimestamp(),
    actualizadoEn: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.set(rankingRef, payloadRanking, { merge: true });
  await batch.commit();

  return {
    ok: true,
    reparado: true,
    barrios,
    barriosConquistadosHistorico,
    maxBarriosSimultaneos,
    ranking: {
      ...rankingStats,
      uid,
      ciudadId,
      barrios,
      segmentoCompetitivo,
    },
  };
});

exports.marcarNotificacionesPendientesLeidas = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para marcar notificaciones.');
  }
  verificarAppCheckCallable(request, 'marcarNotificacionesPendientesLeidas');

  const db = getFirestore();
  const { FieldValue } = require('firebase-admin/firestore');
  const ref = db.collection('usuarios').doc(uid).collection('privado').doc('notificaciones');
  const snap = await ref.get();
  if (!snap.exists) return { ok: true, limpiadas: 0 };

  const pendientes = snap.data().notificacionesPendientes ?? [];
  await ref.set({
    notificacionesPendientes: [],
    notificacionesLeidasEn: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true, limpiadas: Array.isArray(pendientes) ? pendientes.length : 0 };
});

exports.generarNonceStrava = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  verificarAppCheckCallable(request, 'generarNonceStrava');

  const db = getFirestore();
  const nonce = require('crypto').randomBytes(24).toString('hex');
  const expiraEn = Date.now() + 10 * 60 * 1000;
  await db.collection('stravaOAuthNonces').doc(nonce).set({ uid, expiraEn });
  return { nonce };
});

exports.stravaOAuthCallback = onRequest({ secrets: [STRAVA_CLIENT_SECRET] }, async (req, res) => {
  const code = String(req.query.code ?? '').trim();
  let error = String(req.query.error ?? '').trim();
  const state = String(req.query.state ?? '').trim();

  let returnUrl = null;
  let uid = null;
  try {
    const stateData = state ? JSON.parse(state) : {};
    returnUrl = String(stateData.returnUrl ?? '').trim() || null;
    const nonce = String(stateData.nonce ?? '').trim() || null;
    if (nonce) {
      const db = getFirestore();
      const nonceRef = db.collection('stravaOAuthNonces').doc(nonce);
      const nonceSnap = await nonceRef.get();
      if (nonceSnap.exists && nonceSnap.data().expiraEn > Date.now()) {
        uid = nonceSnap.data().uid ?? null;
      } else {
        error = error || 'invalid_state';
      }
      await nonceRef.delete();
    }
  } catch (e) {}

  // Intercambiar el código server-side para que el token quede guardado
  // aunque el deep link no abra la app automáticamente.
  console.log('[stravaOAuthCallback] recibido', { hasCode: Boolean(code), hasUid: Boolean(uid), hasError: Boolean(error) });
  if (code && uid) {
    try {
      const db = getFirestore();
      const { FieldValue } = require('firebase-admin/firestore');
      const clientId = STRAVA_CLIENT_ID.value().trim();
      const clientSecret = STRAVA_CLIENT_SECRET.value().trim();
      const redirectUri = STRAVA_REDIRECT_URI.value().trim();
      console.log('[stravaOAuthCallback] intercambiando código con redirect_uri:', redirectUri, 'secretLen:', clientSecret.length);
      const exchangeRes = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      });
      const data = await exchangeRes.json().catch(() => null);
      console.log('[stravaOAuthCallback] respuesta Strava', { ok: exchangeRes.ok, status: exchangeRes.status, hasAccessToken: Boolean(data?.access_token), error: data?.message });
      if (exchangeRes.ok && data?.access_token) {
        const stravaRef = db.collection('usuarios').doc(uid).collection('privado').doc('strava');
        await stravaRef.set({
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
        console.log('[stravaOAuthCallback] token guardado en Firestore para uid:', uid);
      } else {
        console.error('[stravaOAuthCallback] Strava rechazó el intercambio', { status: exchangeRes.status, data });
        error = 'exchange_failed';
      }
    } catch (e) {
      console.error('[stravaOAuthCallback] Error al intercambiar código:', e);
      error = 'exchange_failed';
    }
  } else {
    console.log('[stravaOAuthCallback] sin code o uid, no se intercambia', { hasCode: Boolean(code), hasUid: Boolean(uid) });
  }

  // Deep link (el token ya está guardado en Firestore, o hay error)
  const deepLinkBase = 'conquerun://strava';
  const expoDeepLink = 'exp+conqurun://strava';
  let primaryDeepLink = deepLinkBase;
  if (returnUrl) {
    try {
      const parsed = new URL(returnUrl);
      if (['conquerun:', 'exp:', 'exps:', 'exp+conqurun:'].includes(parsed.protocol)) {
        primaryDeepLink = returnUrl.split('?')[0];
      }
    } catch (e) {}
  }
  if (error) primaryDeepLink += `?error=${encodeURIComponent(error)}`;

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
    a.secondary{background:#1d2638;margin-top:10px}
  </style>
  <script>
    window.location.href = ${JSON.stringify(primaryDeepLink)};
    setTimeout(() => { window.location.href = ${JSON.stringify(expoDeepLink)}; }, 900);
  </script>
</head>
<body>
  <main>
    <h1>Strava conectado ✓</h1>
    <p>Volviendo a ConqueRun para importar tus carreras...</p>
    <a href="${primaryDeepLink}">Abrir ConqueRun</a>
    <a class="secondary" href="${expoDeepLink}">Abrir versión de desarrollo</a>
  </main>
</body>
</html>`);
});

exports.importarConquistasStrava = onCall({ secrets: [STRAVA_CLIENT_SECRET] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para importar desde Strava.');
  }
  verificarAppCheckCallable(request, 'importarConquistasStrava');

  const db = getFirestore();
  const { FieldValue, Timestamp } = require('firebase-admin/firestore');
  const code = String(request.data?.code ?? '').trim() || null;
  const stravaRef = db.collection('usuarios').doc(uid).collection('privado').doc('strava');

  const [usuarioSnap, privadoDatosSnap] = await Promise.all([
    db.collection('usuarios').doc(uid).get(),
    db.collection('usuarios').doc(uid).collection('privado').doc('datos').get(),
  ]);
  if (!usuarioSnap.exists) {
    throw new HttpsError('failed-precondition', 'Perfil de usuario no encontrado.');
  }
  const perfil = {
    ...usuarioSnap.data(),
    ...(privadoDatosSnap.exists ? { fechaNacimiento: privadoDatosSnap.data().fechaNacimiento } : {}),
  };
  const usuarioRef = db.collection('usuarios').doc(uid);
  const ciudadId = perfil.ciudadActualId ?? 'es-madrid';
  const ciudadNombre = perfil.ciudadActualNombre ?? 'Madrid';
  const paisCodigo = perfil.paisCodigo ?? 'ES';

  let stravaData = {};
  let lockImportacionAdquirido = false;
  let importacionCompletada = false;
  const ahoraImportacionMs = Date.now();
  const LOCK_IMPORTACION_MS = 15 * 60 * 1000;

  await db.runTransaction(async (tx) => {
    const stravaSnap = await tx.get(stravaRef);
    stravaData = stravaSnap.data() ?? {};
    const lockHastaMs = stravaData.importacionEnCursoHasta?.toMillis?.() ?? 0;
    if (lockHastaMs > ahoraImportacionMs) {
      throw new HttpsError('aborted', 'Ya hay una importación de Strava en curso. Espera unos minutos.');
    }
    const ultimaImportacionMs = stravaData.ultimaImportacionEn?.toMillis?.() ?? null;
    if (ultimaImportacionMs && ahoraImportacionMs - ultimaImportacionMs < 10 * 60 * 1000) {
      throw new HttpsError('resource-exhausted', 'Espera 10 minutos entre importaciones de Strava.');
    }
    tx.set(stravaRef, {
      importacionEnCursoHasta: Timestamp.fromMillis(ahoraImportacionMs + LOCK_IMPORTACION_MS),
      importacionIniciadaEn: FieldValue.serverTimestamp(),
      actualizadoEn: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  lockImportacionAdquirido = true;

  try {
  const { accessToken, primeraConexion } = await obtenerTokenStrava(uid, code);
  const ultimaImportacionMs = stravaData.ultimaImportacionEn?.toMillis?.() ?? null;
  const afterMs = ultimaImportacionMs ?? (ahoraImportacionMs - 30 * 24 * 60 * 60 * 1000);
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
  let barriosActualesBase = perfil.barriosConquistadosTotal ?? 0;
  let historicoBarriosInicializado = perfil.barriosConquistadosHistorico != null;
  let historicoBarriosBase = Math.max(
    perfil.barriosConquistadosHistorico ?? 0,
    barriosActualesBase
  );
  let importadas = 0;
  let conquistadasTotal = 0;

  const completarSecundariasStrava = async ({
    carreraId,
    carreraRef,
    territorioCarreraConMarcas,
    segmentos,
    ciudadId,
    ciudadNombre,
    paisCodigo,
    nickname,
  }) => {
    const segComp = segmentos.segmentoCompetitivo ?? null;
    const territorioNormalizado = (Array.isArray(territorioCarreraConMarcas) ? territorioCarreraConMarcas : [])
      .map(barrio => ({
        ...barrio,
        ciudadId: barrio.ciudadId ?? ciudadId ?? null,
      }));

    const marcaRefsConBarrio = territorioNormalizado
      .filter(barrio => barrio.barrioId && segComp)
      .map(barrio => ({
        barrio,
        ref: usuarioRef.collection('marcasTerritoriales').doc(`${barrio.barrioId}_${segComp}`),
      }));
    const segmentoRefsConBarrio = territorioNormalizado
      .filter(barrio =>
        barrio.coleccion &&
        barrio.barrioId &&
        segComp &&
        barrio.puntosAcumuladosUsuario > (barrio.duenoPuntos ?? 0)
      )
      .map(barrio => ({
        barrio,
        ref: db.collection(barrio.coleccion).doc(barrio.barrioId).collection('segmentos').doc(segComp),
      }));
    const [marcaSnaps, segmentoSnaps] = await Promise.all([
      Promise.all(marcaRefsConBarrio.map(({ ref }) => ref.get())),
      Promise.all(segmentoRefsConBarrio.map(({ ref }) => ref.get())),
    ]);
    const secondaryOps = [];

    for (let i = 0; i < marcaRefsConBarrio.length; i++) {
      const { barrio, ref } = marcaRefsConBarrio[i];
      if ((marcaSnaps[i].data()?.carrerasAplicadas ?? []).includes(carreraId)) continue;
      const incr = (barrio.puntos ?? 0) + (barrio.puntosBonusLogros ?? 0);
      if (incr <= 0) continue;
      secondaryOps.push({
        ref,
        data: {
          territorioId: barrio.barrioId,
          puntos: FieldValue.increment(incr),
          carreras: FieldValue.increment(1),
          coleccion: barrio.coleccion,
          ciudadId,
          segmentoCompetitivo: segComp,
          carrerasAplicadas: FieldValue.arrayUnion(carreraId),
          actualizadoEn: FieldValue.serverTimestamp(),
        },
        options: { merge: true },
      });
    }

    for (let i = 0; i < segmentoRefsConBarrio.length; i++) {
      const { barrio, ref } = segmentoRefsConBarrio[i];
      const segmentoActual = segmentoSnaps[i].data() ?? {};
      if ((segmentoActual.duenoPuntos ?? 0) >= barrio.puntosAcumuladosUsuario) continue;
      secondaryOps.push({
        ref,
        data: {
          territorioId: barrio.barrioId,
          ciudadId,
          ciudadNombre,
          paisCodigo,
          segmentoRitmo: segmentos.segmentoRitmo,
          segmentoGenero: segmentos.segmentoGenero,
          segmentoEdad: segmentos.segmentoEdad,
          segmentoCompetitivo: segComp,
          segmentoEtiqueta: segmentos.segmentoEtiqueta,
          dueno: uid,
          duenoNombre: nickname,
          duenoPuntos: barrio.puntosAcumuladosUsuario,
          conquistadoEn: FieldValue.serverTimestamp(),
        },
        options: { merge: true },
      });
    }

    if (secondaryOps.length > 0) await commitEnChunks(secondaryOps);
    await actualizarTop10Territorios(db, territorioNormalizado, usuarioRef, segmentos, uid, FieldValue);
    await carreraRef.update({
      secondaryStatus: 'complete',
      actualizadoEn: FieldValue.serverTimestamp(),
    });
  };

  for (const activity of candidatas) {
    const carreraId = `${uid}_strava_${activity.id}`;
    const carreraRef = db.collection('carreras').doc(carreraId);
    const existente = await carreraRef.get();
    if (existente.exists) {
      const existenteData = existente.data() ?? {};
      if (existenteData.secondaryStatus === 'pending') {
        const segmentosExistente = {
          ritmo30d: existenteData.ritmo30d ?? null,
          segmentoRitmo: existenteData.segmentoRitmo ?? null,
          segmentoGenero: existenteData.segmentoGenero ?? null,
          segmentoEdad: existenteData.segmentoEdad ?? null,
          segmentoCompetitivo: existenteData.segmentoCompetitivo ?? null,
          segmentoEtiqueta: existenteData.segmentoEtiqueta ?? null,
        };
        const territorioExistente = Array.isArray(existenteData.territorioCarrera)
          ? existenteData.territorioCarrera
          : [];
        if (segmentosExistente.segmentoCompetitivo && territorioExistente.length > 0) {
          await completarSecundariasStrava({
            carreraId,
            carreraRef,
            territorioCarreraConMarcas: territorioExistente,
            segmentos: segmentosExistente,
            ciudadId: existenteData.ciudadId ?? ciudadId,
            ciudadNombre: existenteData.ciudadNombre ?? ciudadNombre,
            paisCodigo: existenteData.paisCodigo ?? paisCodigo,
            nickname: perfil.nickname ?? 'Corredor anónimo',
          });
        } else {
          await carreraRef.update({
            secondaryStatus: 'complete',
            actualizadoEn: FieldValue.serverTimestamp(),
          });
        }
        resultados.push({ id: activity.id, nombre: activity.name, estado: 'reparada', motivo: 'secondary_pending' });
      } else {
        resultados.push({ id: activity.id, nombre: activity.name, estado: 'ignorada', motivo: 'duplicada' });
      }
      continue;
    }

    const motivoBase = motivoIgnorarActividad(activity);
    if (motivoBase) {
      resultados.push({ id: activity.id, nombre: activity.name, estado: 'ignorada', motivo: motivoBase });
      continue;
    }

    // Evitar doble conteo si el usuario grabó la misma carrera en ConqueRun y Strava a la vez.
    // Compara ventana temporal con carreras nativas ya cargadas (sin lecturas extra a Firestore).
    const stravaInicioMs = new Date(activity.start_date).getTime();
    const stravaFinMs = stravaInicioMs + (activity.elapsed_time ?? activity.moving_time ?? 0) * 1000;
    const TOLERANCIA_MS = 5 * 60 * 1000; // 5 minutos de margen para relojes desincronizados
    const carreraParalela = carreras30dBase.find(c => {
      if (c.source === 'strava') return false;
      const cInicioMs = c.fecha?.toMillis?.() ?? (typeof c.fecha === 'number' ? c.fecha : 0);
      const cFinMs = cInicioMs + (c.duracion ?? 0) * 1000;
      return cInicioMs < stravaFinMs + TOLERANCIA_MS && cFinMs > stravaInicioMs - TOLERANCIA_MS;
    });
    if (carreraParalela) {
      resultados.push({ id: activity.id, nombre: activity.name, estado: 'ignorada', motivo: 'grabada_en_conquerun' });
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
    const distanciaRaw = activity.distance ?? streams?.distance?.data?.at(-1) ?? calcularDistanciaRuta(ruta);
    const distancia = Number.isFinite(distanciaRaw) ? Math.round(distanciaRaw) : 0;
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

    const marcasPrevias = await Promise.all(territorioCarrera.map(async (barrio) => {
      const marcaSnap = await db.collection('usuarios').doc(uid).collection('marcasTerritoriales')
        .doc(`${barrio.barrioId}_${segmentos.segmentoCompetitivo}`)
        .get();
      return marcaSnap.exists ? (marcaSnap.data().puntos ?? 0) : 0;
    }));
    const territorioCarreraConMarcas = territorioCarrera.map((barrio, index) => {
      const puntosPreviosUsuario = marcasPrevias[index] ?? 0;
      const puntosAcumuladosUsuario = puntosPreviosUsuario + barrio.puntos;
      return {
        ...barrio,
        puntosPreviosUsuario,
        puntosAcumuladosUsuario,
      };
    });
    const conquistados = territorioCarreraConMarcas.filter(
      b => b.dueno !== uid && b.puntosAcumuladosUsuario > (b.duenoPuntos ?? 0)
    );
    const nuevosTerritorios = conquistados;
    const conquistasCarrera = resumenTerritoriosConquistados(nuevosTerritorios);
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

    const nuevoTotalBarriosStrava = barriosActualesBase + nuevosTerritorios.length;
    const nuevoMaxStrava = Math.max(nuevoTotalBarriosStrava, perfil.maxBarriosSimultaneos ?? 0);
    const nuevoHistoricoBarriosStrava = historicoBarriosBase + nuevosTerritorios.length;
    const actualizacionHistoricoBarriosStrava = historicoBarriosInicializado
      ? FieldValue.increment(nuevosTerritorios.length)
      : nuevoHistoricoBarriosStrava;

    const carreraPayload = {
      uid,
      ruta: simplificarRutaSv(ruta),
      distancia,
      duracion,
      ritmoMedio,
      puntos,
      puntosPersonales: puntos,
      barriosConquistados: nuevosTerritorios.length,
      conquistasCarrera,
      aportacionesGrupo: [],
      grupoActivoId: null,
      grupoActivoNombre: null,
      gruposAportados: [],
      territorioCarrera: territorioCarreraConMarcas,
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
      secondaryStatus: 'pending',
    };

    const usuarioUpdate = {
      puntosTotales: FieldValue.increment(puntos),
      distanciaTotal: FieldValue.increment(distancia),
      duracionTotal: FieldValue.increment(duracion),
      carrerasTotal: FieldValue.increment(1),
      ...(nuevosTerritorios.length > 0 && { barriosConquistadosTotal: FieldValue.increment(nuevosTerritorios.length) }),
      ...((!historicoBarriosInicializado || nuevosTerritorios.length > 0) && {
        barriosConquistadosHistorico: actualizacionHistoricoBarriosStrava,
      }),
      ...(nuevoMaxStrava > (perfil.maxBarriosSimultaneos ?? 0) && { maxBarriosSimultaneos: nuevoMaxStrava }),
      ciudadActualId: ciudadId,
      ciudadActualNombre: ciudadNombre,
      paisCodigo,
      ...segmentos,
      ultimasCarreras,
      actualizadoEn: FieldValue.serverTimestamp(),
    };

    const rankingUpdate = {
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
    };

    let yaRegistradaEnTransaccion = false;
    await db.runTransaction(async (tx) => {
      const carreraTxSnap = await tx.get(carreraRef);
      if (carreraTxSnap.exists) {
        yaRegistradaEnTransaccion = true;
        return;
      }
      tx.set(carreraRef, carreraPayload);
      tx.set(usuarioRef, usuarioUpdate, { merge: true });
      tx.set(db.collection('rankingsCiudad').doc(`${ciudadId}_${uid}`), rankingUpdate, { merge: true });
    });
    if (yaRegistradaEnTransaccion) {
      const carreraTxData = (await carreraRef.get()).data() ?? {};
      if (carreraTxData.secondaryStatus === 'pending') {
        const segmentosTx = {
          ritmo30d: carreraTxData.ritmo30d ?? null,
          segmentoRitmo: carreraTxData.segmentoRitmo ?? null,
          segmentoGenero: carreraTxData.segmentoGenero ?? null,
          segmentoEdad: carreraTxData.segmentoEdad ?? null,
          segmentoCompetitivo: carreraTxData.segmentoCompetitivo ?? null,
          segmentoEtiqueta: carreraTxData.segmentoEtiqueta ?? null,
        };
        await completarSecundariasStrava({
          carreraId,
          carreraRef,
          territorioCarreraConMarcas: carreraTxData.territorioCarrera ?? [],
          segmentos: segmentosTx,
          ciudadId: carreraTxData.ciudadId ?? ciudadId,
          ciudadNombre: carreraTxData.ciudadNombre ?? ciudadNombre,
          paisCodigo: carreraTxData.paisCodigo ?? paisCodigo,
          nickname: perfil.nickname ?? 'Corredor anónimo',
        });
        resultados.push({ id: activity.id, nombre: activity.name, estado: 'reparada', motivo: 'secondary_pending' });
      } else {
        resultados.push({ id: activity.id, nombre: activity.name, estado: 'ignorada', motivo: 'duplicada' });
      }
      continue;
    }

    await completarSecundariasStrava({
      carreraId,
      carreraRef,
      territorioCarreraConMarcas,
      segmentos,
      ciudadId,
      ciudadNombre,
      paisCodigo,
      nickname: perfil.nickname ?? 'Corredor anónimo',
    });

    importadas += 1;
    conquistadasTotal += nuevosTerritorios.length;
    barriosActualesBase = nuevoTotalBarriosStrava;
    historicoBarriosBase = nuevoHistoricoBarriosStrava;
    historicoBarriosInicializado = true;
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
    importacionEnCursoHasta: FieldValue.delete(),
    importacionIniciadaEn: FieldValue.delete(),
    actualizadoEn: FieldValue.serverTimestamp(),
  }, { merge: true });
  importacionCompletada = true;

  return {
    ok: true,
    primeraConexion,
    revisadas: candidatas.length,
    importadas,
    conquistadas: conquistadasTotal,
    resultados: resultados.map(({ carreraResumen, ...rest }) => rest),
  };
  } finally {
    if (lockImportacionAdquirido && !importacionCompletada) {
      await stravaRef.set({
        importacionEnCursoHasta: FieldValue.delete(),
        importacionIniciadaEn: FieldValue.delete(),
        actualizadoEn: FieldValue.serverTimestamp(),
      }, { merge: true }).catch(() => {});
    }
  }
});

exports.desconectarStrava = onCall(async (request) => {
  verificarAppCheckCallable(request, 'desconectarStrava');
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

  const db = getFirestore();
  const { FieldValue } = require('firebase-admin/firestore');
  const stravaRef = db.collection('usuarios').doc(uid).collection('privado').doc('strava');
  const snap = await stravaRef.get();

  if (snap.exists) {
    const { accessToken } = snap.data() ?? {};
    if (accessToken) {
      fetch('https://www.strava.com/oauth/deauthorize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => {});
    }
    await stravaRef.delete();
  }

  await db.collection('usuarios').doc(uid).update({
    stravaConectado: FieldValue.delete(),
    stravaAthleteId: FieldValue.delete(),
    stravaConectadoEn: FieldValue.delete(),
  });

  return { ok: true };
});

exports.validarCarrera = onDocumentWritten('carreras/{carreraId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();

  // Solo disparar cuando secondaryStatus transiciona a 'complete';
  // así el trigger ve las marcas de territorio y grupo ya escritas (Fase 2 completa)
  if (before?.secondaryStatus === after?.secondaryStatus) return;
  if (after?.secondaryStatus !== 'complete') return;
  if (after?.fraudulenta === true) return; // ya procesada

  const data = after;
  const carreraId = event.params.carreraId;
  const {
    uid, ruta = [], distancia, duracion, puntos, ritmoMedio, source,
    territorioCarrera = [], ciudadId, segmentoCompetitivo,
  } = data;
  const barriosConquistadosCarrera = Math.max(0, data.barriosConquistados ?? 0);

  // Importaciones de Strava ya se validan en importarConquistasStrava
  if (source !== 'conqurun') return;

  const db = getFirestore();
  const { FieldValue } = require('firebase-admin/firestore');
  const motivos = [];

  // 1. Ritmo declarado consistente con distancia y duración
  if (distancia > 0) {
    const ritmoCalculado = duracion / (distancia / 1000);
    if (Math.abs(ritmoCalculado - ritmoMedio) > 15) motivos.push('ritmo_inconsistente');
  }

  // 2. Puntos coinciden con fórmula server-side
  const puntosEsperados = calcularPuntosSv(distancia, ritmoMedio);
  if (Math.abs(puntosEsperados - puntos) > 1) motivos.push('puntos_incorrectos');

  // 3. Distancia GPS consistente con la ruta (tolerancia 35%, igual que el callable)
  if (ruta.length >= 2) {
    const distanciaGps = calcularDistanciaRuta(ruta);
    if (Math.abs(distanciaGps - distancia) / Math.max(distancia, 1) > 0.35) {
      motivos.push('distancia_gps_inconsistente');
    }
  }

  // 4. C5: Verificar que los territorios declarados coinciden con la ruta GPS
  let territoriosFraudulentos = [];
  if (ciudadId && ruta.length >= 2 && territorioCarrera.length > 0) {
    try {
      const territoriosSv = await obtenerTerritoriosSegmentadosSv(ciudadId, null);
      const territorioCalculado = calcularResumenTerritorialSv(ruta, territoriosSv, puntos, distancia);
      const idsCalculados = new Set(territorioCalculado.map(t => t.barrioId));
      territoriosFraudulentos = territorioCarrera.filter(t => !idsCalculados.has(t.barrioId));
      if (territoriosFraudulentos.length > 0) motivos.push('territorios_no_alcanzados');
    } catch (e) {
      console.warn('[validarCarrera] No se pudieron verificar territorios:', e);
    }
  }

  if (motivos.length > 0) {
    const aportacionesGrupo = Array.isArray(data.aportacionesGrupo) ? data.aportacionesGrupo : [];
    const puntosRevertir = data.puntosTotales ?? ((data.puntosPersonales ?? data.puntos ?? 0) + (data.bonusLogros ?? 0));
    const nuevosLogrosCarrera = Array.isArray(data.nuevosLogros)
      ? data.nuevosLogros.filter(id => typeof id === 'string' && id.length > 0)
      : [];

    // Si el fraude afecta al run completo (ritmo/puntos/GPS), revertir TODOS los territorios.
    // Si solo hay territorios_no_alcanzados, revertir únicamente los que no coinciden con el GPS.
    const fraudeGlobal = motivos.some(m => m !== 'territorios_no_alcanzados');
    const territoriesToRevertConquest = fraudeGlobal ? territorioCarrera : territoriosFraudulentos;

    // Leer user doc + snapshots de segmentos de territorio en paralelo
    const territoriosConSegmento = territoriesToRevertConquest
      .filter(t => segmentoCompetitivo && t.coleccion && t.barrioId);
    const segmentoRefs = territoriosConSegmento
      .map(t => db.collection(t.coleccion).doc(t.barrioId).collection('segmentos').doc(segmentoCompetitivo));

    const [userSnap, ...segmentoSnaps] = await Promise.all([
      db.collection('usuarios').doc(uid).get(),
      ...segmentoRefs.map(r => r.get()),
    ]);

    const ultimasCarrerasSinFraude = (userSnap.data()?.ultimasCarreras ?? []).filter(c => c.id !== carreraId);

    const carreraFraudUpdate = {
      fraudulenta: true,
      motivosFraude: motivos,
      verificadoEn: FieldValue.serverTimestamp(),
    };

    const fraudOps = [];

    // Revertir usuario
    fraudOps.push({ type: 'update', ref: db.collection('usuarios').doc(uid), data: {
      puntosTotales: FieldValue.increment(-puntosRevertir),
      carrerasTotal: FieldValue.increment(-1),
      distanciaTotal: FieldValue.increment(-Math.round(distancia)),
      duracionTotal: FieldValue.increment(-duracion),
      ...(barriosConquistadosCarrera > 0 && {
        barriosConquistadosHistorico: FieldValue.increment(-barriosConquistadosCarrera),
      }),
      ...(nuevosLogrosCarrera.length > 0 && {
        logros: FieldValue.arrayRemove(...nuevosLogrosCarrera),
      }),
      ultimasCarreras: ultimasCarrerasSinFraude,
    }});

    // Revertir ranking de ciudad
    if (ciudadId) {
      fraudOps.push({ ref: db.collection('rankingsCiudad').doc(`${ciudadId}_${uid}`), data: {
        puntos: FieldValue.increment(-puntosRevertir),
        carreras: FieldValue.increment(-1),
        totalMetros: FieldValue.increment(-Math.round(distancia)),
      }, options: { merge: true }});
    }

    // Revertir conquistas. Si la carrera fraudulenta quitó un territorio a otro usuario,
    // restauramos ese dueño anterior desde el snapshot guardado en territorioCarrera.
    const restauracionesDuenoAnterior = new Map();
    for (let i = 0; i < segmentoRefs.length; i++) {
      if (segmentoSnaps[i].exists && segmentoSnaps[i].data().dueno === uid) {
        const territorio = territoriosConSegmento[i] ?? {};
        const duenoAnterior = territorio.dueno ?? null;
        if (duenoAnterior === uid) {
          const restauracionPropia = {
            dueno: uid,
            duenoPuntos: Math.max(0, territorio.duenoPuntos ?? 0),
          };
          if (territorio.duenoNombre) restauracionPropia.duenoNombre = territorio.duenoNombre;
          fraudOps.push({ type: 'update', ref: segmentoRefs[i], data: restauracionPropia });
        } else if (duenoAnterior) {
          const segmentoData = segmentoSnaps[i].data() ?? {};
          const ciudadRestaurada = territorio.ciudadId ?? segmentoData.ciudadId ?? ciudadId ?? null;
          const restauracion = {
            dueno: duenoAnterior,
            duenoPuntos: Math.max(0, territorio.duenoPuntos ?? 0),
            conquistadoEn: FieldValue.delete(),
          };
          restauracion.duenoNombre = territorio.duenoNombre ?? FieldValue.delete();
          fraudOps.push({ type: 'update', ref: segmentoRefs[i], data: restauracion });

          const key = `${duenoAnterior}|${ciudadRestaurada ?? ''}|${segmentoCompetitivo ?? ''}`;
          const prev = restauracionesDuenoAnterior.get(key) ?? {
            uid: duenoAnterior,
            ciudadId: ciudadRestaurada,
            segmentoCompetitivo,
            count: 0,
          };
          prev.count += 1;
          restauracionesDuenoAnterior.set(key, prev);
        } else {
          fraudOps.push({ type: 'update', ref: segmentoRefs[i], data: { dueno: null, duenoNombre: FieldValue.delete(), duenoPuntos: 0 } });
        }
      }
    }

    if (restauracionesDuenoAnterior.size > 0) {
      const restauraciones = [...restauracionesDuenoAnterior.values()];
      const estadosRestauracion = await Promise.all(restauraciones.map(async (restauracion) => {
        const [usuarioAnteriorSnap, rankingAnteriorSnap] = await Promise.all([
          db.collection('usuarios').doc(restauracion.uid).get(),
          restauracion.ciudadId
            ? db.collection('rankingsCiudad').doc(`${restauracion.ciudadId}_${restauracion.uid}`).get()
            : Promise.resolve(null),
        ]);
        return { ...restauracion, usuarioAnteriorSnap, rankingAnteriorSnap };
      }));

      for (const restauracion of estadosRestauracion) {
        const usuarioAnterior = restauracion.usuarioAnteriorSnap.data() ?? {};
        if (restauracion.ciudadId && usuarioAnterior.ciudadActualId === restauracion.ciudadId) {
          fraudOps.push({
            ref: db.collection('usuarios').doc(restauracion.uid),
            data: { barriosConquistadosTotal: FieldValue.increment(restauracion.count) },
            options: { merge: true },
          });
        }

        const rankingAnterior = restauracion.rankingAnteriorSnap?.data?.() ?? null;
        if (
          restauracion.ciudadId &&
          rankingAnterior &&
          (rankingAnterior.segmentoCompetitivo ?? restauracion.segmentoCompetitivo) === restauracion.segmentoCompetitivo
        ) {
          fraudOps.push({
            ref: db.collection('rankingsCiudad').doc(`${restauracion.ciudadId}_${restauracion.uid}`),
            data: { barrios: FieldValue.increment(restauracion.count) },
            options: { merge: true },
          });
        }
      }
    }

    // Revertir marcasTerritoriales del usuario (secondaryStatus: complete garantiza que se aplicaron)
    for (const barrio of territorioCarrera) {
      if (!segmentoCompetitivo || !barrio.barrioId) continue;
      const incr = (barrio.puntos ?? 0) + (barrio.puntosBonusLogros ?? 0);
      if (incr <= 0) continue;
      fraudOps.push({ type: 'update',
        ref: db.collection('usuarios').doc(uid)
          .collection('marcasTerritoriales').doc(`${barrio.barrioId}_${segmentoCompetitivo}`),
        data: {
          puntos: FieldValue.increment(-incr),
          carreras: FieldValue.increment(-1),
          carrerasAplicadas: FieldValue.arrayRemove(carreraId),
        },
      });
    }

    // Revertir aportaciones de grupo, stats del grupo y grupoMarcas
    for (const aportacion of aportacionesGrupo) {
      if (!aportacion.grupoId || !aportacion.id) continue;

      fraudOps.push({ type: 'delete', ref: db.collection('aportacionesGrupo').doc(aportacion.id) });

      fraudOps.push({ type: 'update', ref: db.collection('grupos').doc(aportacion.grupoId), data: {
        puntosTotales: FieldValue.increment(-(aportacion.puntosGrupo ?? 0)),
        carrerasTotales: FieldValue.increment(-1),
        distanciaTotal: FieldValue.increment(-Math.round(distancia)),
        duracionTotal: FieldValue.increment(-(duracion ?? 0)),
        carrerasAplicadas: FieldValue.arrayRemove(carreraId),
      }});

      for (const barrio of territorioCarrera) {
        if (!barrio.barrioId || (barrio.puntos ?? 0) <= 0) continue;
        fraudOps.push({ type: 'update',
          ref: db.collection('grupoMarcas').doc(aportacion.grupoId)
            .collection('marcasTerritoriales').doc(barrio.barrioId),
          data: {
            puntos: FieldValue.increment(-(barrio.puntos ?? 0)),
            carreras: FieldValue.increment(-1),
            carrerasAplicadas: FieldValue.arrayRemove(carreraId),
          },
        });
      }
    }

    await commitEnChunks(fraudOps);

    // La Fase 2 ya pudo haber actualizado el top10 antes de que el trigger detectase fraude.
    // Recalcular solo la entrada de este usuario mantiene el mapa coherente sin reordenar todo el territorio.
    await Promise.all(territorioCarrera.map(async (barrio) => {
      if (!segmentoCompetitivo || !barrio.coleccion || !barrio.barrioId) return;
      const barrioSegmentoRef = db.collection(barrio.coleccion).doc(barrio.barrioId)
        .collection('segmentos').doc(segmentoCompetitivo);
      const marcaRef = db.collection('usuarios').doc(uid)
        .collection('marcasTerritoriales').doc(`${barrio.barrioId}_${segmentoCompetitivo}`);

      await db.runTransaction(async (tx) => {
        const [marcaSnap, segmentoSnap] = await Promise.all([tx.get(marcaRef), tx.get(barrioSegmentoRef)]);
        const puntosActuales = marcaSnap.exists ? (marcaSnap.data().puntos ?? 0) : 0;
        const currentTop10 = segmentoSnap.data()?.top10 ?? [];
        const sinUsuario = currentTop10.filter(e => e.uid !== uid);
        const newTop10 = (puntosActuales > 0 ? [...sinUsuario, { uid, puntos: puntosActuales }] : sinUsuario)
          .sort((a, b) => b.puntos - a.puntos)
          .slice(0, 10);
        tx.set(barrioSegmentoRef, {
          top10: newTop10,
          top10Uids: top10Uids(newTop10),
          actualizadoEn: FieldValue.serverTimestamp(),
        }, { merge: true });
      }).catch(err => console.error('[validarCarrera] Error recalculando top10 tras fraude:', barrio.barrioId, err?.message));
    }));

    await event.data.ref.update(carreraFraudUpdate);
    console.warn(`[validarCarrera] Fraude: ${carreraId} uid:${uid} motivos:${motivos.join(',')}`);

    try {
      const notifSnap = await db.collection('usuarios').doc(uid).collection('privado').doc('notificaciones').get();
      const pushToken = notifSnap.exists ? notifSnap.data().pushToken : null;
      if (pushToken && pushToken.startsWith('ExponentPushToken')) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            to: pushToken,
            title: 'Carrera no validada',
            body: 'Tu última carrera no ha podido validarse y los puntos han sido revertidos. Asegúrate de correr con GPS activo y buena señal.',
            sound: 'default',
          }),
        });
      }
    } catch (e) {
      console.error('[validarCarrera] Error enviando notificación de fraude:', e.message);
    }

    return;
  }

  // C3: Top10 por territorio con transacción atómica (evita race condition entre carreras simultáneas)
  for (const barrio of territorioCarrera) {
    if (!segmentoCompetitivo || !barrio.coleccion || !barrio.barrioId) continue;
    const barrioSegmentoRef = db.collection(barrio.coleccion).doc(barrio.barrioId)
      .collection('segmentos').doc(segmentoCompetitivo);
    const marcaRef = db.collection('usuarios').doc(uid)
      .collection('marcasTerritoriales').doc(`${barrio.barrioId}_${segmentoCompetitivo}`);

    await db.runTransaction(async (tx) => {
      const [marcaSnap, segmentoSnap] = await Promise.all([tx.get(marcaRef), tx.get(barrioSegmentoRef)]);
      const totalPuntosUsuario = marcaSnap.exists ? (marcaSnap.data().puntos ?? 0) : barrio.puntos;
      const currentTop10 = segmentoSnap.data()?.top10 ?? [];
      const newTop10 = [...currentTop10.filter(e => e.uid !== uid), { uid, puntos: totalPuntosUsuario }]
        .sort((a, b) => b.puntos - a.puntos).slice(0, 10);
      tx.set(barrioSegmentoRef, {
        top10: newTop10,
        top10Uids: top10Uids(newTop10),
        actualizadoEn: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  }

  await event.data.ref.update({
    verificado: true,
    verificadoEn: FieldValue.serverTimestamp(),
  });
});

// ─── Notificaciones de reportes ──────────────────────────────────────────────

exports.notificarReporte = onDocumentCreated({ document: 'reportes/{reportId}', secrets: [GMAIL_PASS] }, async (event) => {
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
        <h2 style="color:#C6F432;margin:0 0 24px;">⚑ Nuevo reporte en ConqueRun</h2>
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
          <a href="${urlAdmin}" style="background:#C6F432;color:#080b14;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">
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

// ─── Push: territorio perdido (individual y grupo) ───────────────────────────

exports.enviarNotificacionTerritorios = onDocumentWritten(
  { document: 'usuarios/{uid}/privado/notificaciones' },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const data = after.data();
    const pendientes = data.notificacionesPendientes ?? [];
    const pushToken = data.pushToken;

    if (pendientes.length === 0 || !pushToken || !pushToken.startsWith('ExponentPushToken')) return;

    const individuales = pendientes.filter(n => n.tipo === 'territorio_perdido');
    const grupoPerdidos = pendientes.filter(n => n.tipo === 'territorio_perdido_grupo');
    const grupoGanados = pendientes.filter(n => n.tipo === 'territorio_ganado_grupo');
    const mensajes = [];

    if (individuales.length === 1) {
      mensajes.push({ to: pushToken, title: '🏴 Territorio perdido', body: `${individuales[0].nombre} ya no es tuyo`, sound: 'default' });
    } else if (individuales.length > 1) {
      mensajes.push({ to: pushToken, title: '🏴 Territorios perdidos', body: `${individuales.length} de tus barrios han caído`, sound: 'default' });
    }

    if (grupoPerdidos.length === 1) {
      const n = grupoPerdidos[0];
      const porQuien = n.grupoGanadorNombre ? ` por ${n.grupoGanadorNombre}` : '';
      mensajes.push({ to: pushToken, title: `🏴 ${n.grupoNombre ?? 'Tu equipo'} perdió territorio`, body: `${n.nombre} fue conquistado${porQuien}`, sound: 'default' });
    } else if (grupoPerdidos.length > 1) {
      const grupoNombre = grupoPerdidos[0].grupoNombre ?? 'Tu equipo';
      mensajes.push({ to: pushToken, title: `🏴 ${grupoNombre} perdió territorios`, body: `${grupoPerdidos.length} barrios han caído`, sound: 'default' });
    }

    if (grupoGanados.length === 1) {
      const n = grupoGanados[0];
      mensajes.push({ to: pushToken, title: `🏁 ${n.grupoNombre ?? 'Tu equipo'} conquistó territorio`, body: `${n.nombre} es vuestro`, sound: 'default' });
    } else if (grupoGanados.length > 1) {
      const grupoNombre = grupoGanados[0].grupoNombre ?? 'Tu equipo';
      mensajes.push({ to: pushToken, title: `🏁 ${grupoNombre} conquistó territorios`, body: `${grupoGanados.length} barrios nuevos`, sound: 'default' });
    }

    if (mensajes.length === 0) return;

    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(mensajes.length === 1 ? mensajes[0] : mensajes),
      });
    } catch (e) {
      console.error('[push] Error enviando notificación de territorio:', e.message);
    }

    await after.ref.update({ notificacionesPendientes: [] });
  }
);

const DECAY_RATE = 0.10;
const DECAY_PUNTOS_MINIMO = 50;

exports.aplicarDecayTerritorial = onSchedule({ schedule: 'every monday 03:00', timeoutSeconds: 1800 }, async () => {
  const db = getFirestore();
  const { FieldValue } = require('firebase-admin/firestore');

  const aplicarDecay = (puntos) => {
    const valor = Number(puntos) || 0;
    if (valor <= 0) return { changed: false };
    const nuevos = Math.floor(valor * (1 - DECAY_RATE));
    if (nuevos <= DECAY_PUNTOS_MINIMO) return { changed: true, liberar: true };
    if (nuevos === valor) return { changed: false };
    return { changed: true, puntos: nuevos };
  };

  const calcularOpsDesdeSnap = (snap, modo) => {
    const ops = [];
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const update = {};

      if (modo === 'usuario') {
        const decayUsuario = aplicarDecay(data.duenoPuntos);
        if (decayUsuario.liberar) {
          update.dueno = null;
          update.duenoNombre = FieldValue.delete();
          update.duenoPuntos = 0;
          update.conquistadoEn = FieldValue.delete();
        } else if (decayUsuario.changed) {
          update.duenoPuntos = decayUsuario.puntos;
        }
      }

      if (modo === 'grupo') {
        const decayGrupo = aplicarDecay(data.duenoGrupoPuntos);
        if (decayGrupo.liberar) {
          const grupoId = data.duenoGrupo ?? null;
          update.duenoGrupo = null;
          update.duenoGrupoPuntos = 0;
          if (grupoId && docSnap.ref.path.includes('/segmentos/')) {
            ops.push({
              ref: db.collection('grupos').doc(grupoId),
              data: {
                barriosConquistados: FieldValue.increment(-1),
                actualizadoEn: FieldValue.serverTimestamp(),
              },
              options: { merge: true },
            });
          }
        } else if (decayGrupo.changed) {
          update.duenoGrupoPuntos = decayGrupo.puntos;
        }
      }

      if (Object.keys(update).length > 0) {
        update.decayEn = FieldValue.serverTimestamp();
        ops.push({ type: 'update', ref: docSnap.ref, data: update });
      }
    }
    return ops;
  };

  const procesarEnPaginas = async (baseQuery, orderField, modo) => {
    let lastDoc = null;
    let totalOps = 0;
    while (true) {
      let q = baseQuery.orderBy(orderField).limit(500);
      if (lastDoc) q = q.startAfter(lastDoc);
      const snap = await q.get();
      if (snap.empty) break;
      const ops = calcularOpsDesdeSnap(snap, modo);
      if (ops.length > 0) {
        await commitEnChunks(ops);
        totalOps += ops.length;
      }
      if (snap.docs.length < 500) break;
      lastDoc = snap.docs[snap.docs.length - 1];
    }
    return totalOps;
  };

  let total = 0;
  for (const coleccion of ['territorios', 'barrios']) {
    total += await procesarEnPaginas(db.collection(coleccion).where('dueno', '!=', null), 'dueno', 'usuario');
    total += await procesarEnPaginas(db.collection(coleccion).where('duenoGrupo', '!=', null), 'duenoGrupo', 'grupo');
  }

  try {
    total += await procesarEnPaginas(db.collectionGroup('segmentos').where('dueno', '!=', null), 'dueno', 'usuario');
    total += await procesarEnPaginas(db.collectionGroup('segmentos').where('duenoGrupo', '!=', null), 'duenoGrupo', 'grupo');
  } catch (e) {
    console.warn('[decay] No se pudo aplicar decay a segmentos (puede faltar índice):', e.message);
  }

  console.log(`[decay] Actualizaciones aplicadas: ${total}`);
});
