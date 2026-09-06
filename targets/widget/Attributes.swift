import ActivityKit
import Foundation

// Datos de la Live Activity de una carrera en curso.
// DUPLICADO en modules/activity-controller/ios/Attributes.swift — mantener idénticos.
public struct ConqueRunActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public var inicioTimer: Double   // epoch (s) del inicio efectivo, para el cronómetro nativo
    public var tiempoTexto: String   // tiempo estático (se usa cuando está pausada)
    public var distancia: String     // p.ej. "4,20 km"
    public var ritmo: String         // p.ej. "5:45 /km"
    public var pausada: Bool

    public init(inicioTimer: Double, tiempoTexto: String, distancia: String, ritmo: String, pausada: Bool) {
      self.inicioTimer = inicioTimer
      self.tiempoTexto = tiempoTexto
      self.distancia = distancia
      self.ritmo = ritmo
      self.pausada = pausada
    }
  }

  public var titulo: String
  public init(titulo: String) { self.titulo = titulo }
}
