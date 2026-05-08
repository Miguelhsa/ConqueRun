const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineString } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const nodemailer = require('nodemailer');

initializeApp();

const GMAIL_USER = defineString('GMAIL_USER');
const GMAIL_PASS = defineString('GMAIL_PASS');
const ADMIN_EMAIL = defineString('ADMIN_EMAIL');

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

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER.value(),
      pass: GMAIL_PASS.value(),
    },
  });

  await transporter.sendMail({
    from: `"ConqueRun Admin" <${GMAIL_USER.value()}>`,
    to: ADMIN_EMAIL.value(),
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
