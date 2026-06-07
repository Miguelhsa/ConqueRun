import { readFile } from 'node:fs/promises';

const ENV_PATH = 'functions/.env.conquerrun-8d30e';
const CONFIRM_ENV = 'APP_CHECK_ENFORCE_CONFIRMED';

function parseRequireAppCheck(content) {
  const line = content
    .split(/\r?\n/)
    .map(l => l.trim())
    .find(l => l && !l.startsWith('#') && l.startsWith('REQUIRE_APP_CHECK='));

  if (!line) return false;
  return line.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '') === 'true';
}

const content = await readFile(ENV_PATH, 'utf8').catch(() => '');
const enforceEnabled = parseRequireAppCheck(content);

if (enforceEnabled && process.env[CONFIRM_ENV] !== 'true') {
  console.error(`
[App Check Guard] Bloqueado deploy de Functions.

${ENV_PATH} tiene REQUIRE_APP_CHECK=true. Antes de desplegar así:

1. Instala un build real de iOS/TestFlight y Android/Play.
2. Abre la app con un usuario autenticado.
3. Confirma en Firebase Console o Cloud Logs que aparece [AppCheckDiag] con hasAppCheck: true para ambas plataformas.
4. Despliega explícitamente con:

   ${CONFIRM_ENV}=true firebase deploy --only functions

Esto evita activar enforcement por accidente y dejar sin servicio registro, carreras, grupos y Strava.
`);
  process.exit(1);
}

console.log(`[App Check Guard] OK. Enforcement ${enforceEnabled ? 'confirmado' : 'desactivado'}.`);
