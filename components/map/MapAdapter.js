import { Platform } from 'react-native';
import MapView, {
  Circle,
  Marker,
  Polygon,
  Polyline,
  PROVIDER_GOOGLE,
} from 'react-native-maps';

export const MAP_ENGINE = Platform.OS === 'ios'
  ? 'react-native-maps/google-ios'
  : 'react-native-maps';

const DEFAULT_PROVIDER = Platform.OS === 'ios' ? PROVIDER_GOOGLE : undefined;

export function TerritoryMap(props) {
  return <MapView {...props} provider={props.provider ?? DEFAULT_PROVIDER} />;
}

export function TerritoryPolygon(props) {
  return <Polygon {...props} />;
}

export function TerritoryMarker(props) {
  return <Marker {...props} />;
}

export function RouteLine(props) {
  return <Polyline {...props} />;
}

export function TerritoryCircle(props) {
  return <Circle {...props} />;
}
