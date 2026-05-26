import { Component } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { registrarError } from '../utils/monitoring';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false };
  }

  componentDidCatch(error, info) {
    registrarError(error, info.componentStack ?? '');
  }

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  render() {
    if (this.state.crashed) {
      return (
        <View style={styles.container}>
          <Text style={styles.titulo}>Algo ha ido mal</Text>
          <Text style={styles.texto}>El error ha sido registrado. Reinicia la app para continuar.</Text>
          <TouchableOpacity style={styles.boton} onPress={() => this.setState({ crashed: false })}>
            <Text style={styles.botonTexto}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080b14', justifyContent: 'center', alignItems: 'center', padding: 32 },
  titulo: { color: '#F2EFE8', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  texto: { color: '#555', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 32 },
  boton: { backgroundColor: '#C6F432', borderRadius: 10, paddingHorizontal: 28, paddingVertical: 12 },
  botonTexto: { color: '#080b14', fontWeight: '800', fontSize: 14 },
});
