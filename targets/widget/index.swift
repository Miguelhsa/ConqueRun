import SwiftUI
import WidgetKit

@main
struct ConqueRunWidgets: WidgetBundle {
  var body: some Widget {
    if #available(iOS 16.2, *) {
      ConqueRunLiveActivity()
    }
  }
}
