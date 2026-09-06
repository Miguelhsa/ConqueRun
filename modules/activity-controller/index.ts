import { requireNativeModule } from 'expo';

// Módulo nativo iOS que controla la Live Activity de la carrera.
// Solo existe en iOS; en Android requireNativeModule lanzará y el wrapper
// (utils/liveActivityCarrera.js) captura el error.
const ActivityController = requireNativeModule('ActivityController');

export type EstadoCarrera = {
  inicioTimer: number;
  tiempoTexto: string;
  distancia: string;
  ritmo: string;
  pausada: boolean;
};

export function areLiveActivitiesEnabled(): boolean {
  return ActivityController.areLiveActivitiesEnabled;
}

export function startLiveActivity(estado: EstadoCarrera): string | null {
  return ActivityController.startLiveActivity(JSON.stringify(estado));
}

export function updateLiveActivity(estado: EstadoCarrera): void {
  ActivityController.updateLiveActivity(JSON.stringify(estado));
}

export function endLiveActivity(): void {
  ActivityController.endLiveActivity();
}
