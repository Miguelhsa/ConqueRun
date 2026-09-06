import ActivityKit
import ExpoModulesCore

private struct EstadoCarreraDTO: Codable {
  let inicioTimer: Double
  let tiempoTexto: String
  let distancia: String
  let ritmo: String
  let pausada: Bool
}

@available(iOS 16.2, *)
private func estadoDesde(_ dto: EstadoCarreraDTO) -> ConqueRunActivityAttributes.ContentState {
  ConqueRunActivityAttributes.ContentState(
    inicioTimer: dto.inicioTimer,
    tiempoTexto: dto.tiempoTexto,
    distancia: dto.distancia,
    ritmo: dto.ritmo,
    pausada: dto.pausada)
}

public class ActivityControllerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ActivityController")

    Property("areLiveActivitiesEnabled") {
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    AsyncFunction("startLiveActivity") { (raw: String) async -> String? in
      guard #available(iOS 16.2, *) else { return nil }
      guard let data = raw.data(using: .utf8),
            let dto = try? JSONDecoder().decode(EstadoCarreraDTO.self, from: data) else {
        return nil
      }
      let contenido = ActivityContent(state: estadoDesde(dto), staleDate: nil)

      if let existente = Activity<ConqueRunActivityAttributes>.activities.first {
        await existente.update(contenido)
        return existente.id
      }
      do {
        let actividad = try Activity.request(
          attributes: ConqueRunActivityAttributes(titulo: "ConqueRun"),
          content: contenido,
          pushType: nil
        )
        return actividad.id
      } catch {
        return nil
      }
    }

    AsyncFunction("updateLiveActivity") { (raw: String) async in
      guard #available(iOS 16.2, *),
            let data = raw.data(using: .utf8),
            let dto = try? JSONDecoder().decode(EstadoCarreraDTO.self, from: data) else {
        return
      }
      let contenido = ActivityContent(state: estadoDesde(dto), staleDate: nil)
      for actividad in Activity<ConqueRunActivityAttributes>.activities {
        await actividad.update(contenido)
      }
    }

    AsyncFunction("endLiveActivity") { () async in
      guard #available(iOS 16.2, *) else { return }
      for actividad in Activity<ConqueRunActivityAttributes>.activities {
        await actividad.end(nil, dismissalPolicy: .immediate)
      }
    }
  }
}
