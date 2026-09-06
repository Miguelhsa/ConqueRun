import ActivityKit
import WidgetKit
import SwiftUI

// Verde lima de marca ConqueRun (#C0E020) sobre negro.
private let marca = Color(red: 0.753, green: 0.878, blue: 0.125)

@available(iOS 16.2, *)
struct ConqueRunLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: ConqueRunActivityAttributes.self) { context in
      VStack(spacing: 12) {
        HStack(spacing: 6) {
          Image(systemName: "figure.run").foregroundColor(marca)
          Text(context.state.pausada ? "ConqueRun · Carrera pausada" : "ConqueRun · Carrera en curso")
            .font(.caption)
            .foregroundColor(.white.opacity(0.7))
          Spacer()
        }
        HStack(alignment: .top) {
          TiempoTile(state: context.state)
          Spacer()
          Metrica(etiqueta: "Distancia", valor: context.state.distancia)
          Spacer()
          Metrica(etiqueta: "Ritmo", valor: context.state.ritmo)
        }
      }
      .padding(16)
      .activityBackgroundTint(Color.black)
      .activitySystemActionForegroundColor(marca)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          TiempoTile(state: context.state)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Metrica(etiqueta: "Ritmo", valor: context.state.ritmo)
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack {
            Image(systemName: "figure.run").foregroundColor(marca)
            Text(context.state.distancia)
              .font(.system(size: 18, weight: .bold, design: .rounded))
              .foregroundColor(.white)
          }
        }
      } compactLeading: {
        Image(systemName: "figure.run").foregroundColor(marca)
      } compactTrailing: {
        Text(context.state.distancia).foregroundColor(marca)
      } minimal: {
        Image(systemName: "figure.run").foregroundColor(marca)
      }
      .keylineTint(marca)
    }
  }
}

// Tile del tiempo: cuando corre usa el cronómetro nativo de iOS (se actualiza solo,
// sin depender de que la app mande datos). Cuando está pausada muestra el texto fijo.
@available(iOS 16.2, *)
private struct TiempoTile: View {
  let state: ConqueRunActivityAttributes.ContentState
  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text("TIEMPO")
        .font(.system(size: 10, weight: .semibold))
        .foregroundColor(.white.opacity(0.5))
      if state.pausada {
        Text(state.tiempoTexto)
          .font(.system(size: 20, weight: .bold, design: .rounded))
          .monospacedDigit()
          .foregroundColor(.white)
      } else {
        Text(
          timerInterval: Date(timeIntervalSince1970: state.inicioTimer)...Date(timeIntervalSince1970: state.inicioTimer + 86400),
          countsDown: false
        )
        .font(.system(size: 20, weight: .bold, design: .rounded))
        .monospacedDigit()
        .foregroundColor(.white)
        .frame(maxWidth: 95, alignment: .leading)
      }
    }
  }
}

@available(iOS 16.2, *)
private struct Metrica: View {
  let etiqueta: String
  let valor: String
  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(etiqueta.uppercased())
        .font(.system(size: 10, weight: .semibold))
        .foregroundColor(.white.opacity(0.5))
      Text(valor)
        .font(.system(size: 20, weight: .bold, design: .rounded))
        .foregroundColor(.white)
    }
  }
}
