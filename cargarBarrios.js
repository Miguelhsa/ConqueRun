import { db } from './firebaseConfig';
import { doc, setDoc } from 'firebase/firestore';

const CIUDAD_MADRID = {
  id: 'es-madrid',
  nombre: 'Madrid',
  paisCodigo: 'ES',
  paisNombre: 'España',
  lat: 40.4168,
  lng: -3.7038,
  radioBusqueda: 35000,
  estadoCobertura: 'activa',
};

const barrios = [
  { nombre: 'Sol', distrito: 'Centro', lat: 40.4169, lng: -3.7035 },
  { nombre: 'Cortes', distrito: 'Centro', lat: 40.4140, lng: -3.6968 },
  { nombre: 'Embajadores', distrito: 'Centro', lat: 40.4084, lng: -3.7009 },
  { nombre: 'Lavapiés', distrito: 'Centro', lat: 40.4087, lng: -3.7033 },
  { nombre: 'La Latina', distrito: 'Centro', lat: 40.4126, lng: -3.7115 },
  { nombre: 'Malasaña', distrito: 'Centro', lat: 40.4258, lng: -3.7072 },
  { nombre: 'Chueca', distrito: 'Centro', lat: 40.4243, lng: -3.6965 },
  { nombre: 'Justicia', distrito: 'Centro', lat: 40.4240, lng: -3.6959 },
  { nombre: 'Palacio', distrito: 'Centro', lat: 40.4172, lng: -3.7133 },
  { nombre: 'Universidad', distrito: 'Centro', lat: 40.4260, lng: -3.7101 },

  { nombre: 'Recoletos', distrito: 'Salamanca', lat: 40.4238, lng: -3.6866 },
  { nombre: 'Goya', distrito: 'Salamanca', lat: 40.4244, lng: -3.6756 },
  { nombre: 'Fuente del Berro', distrito: 'Salamanca', lat: 40.4245, lng: -3.6648 },
  { nombre: 'Guindalera', distrito: 'Salamanca', lat: 40.4365, lng: -3.6685 },
  { nombre: 'Lista', distrito: 'Salamanca', lat: 40.4310, lng: -3.6759 },
  { nombre: 'Castellana', distrito: 'Salamanca', lat: 40.4341, lng: -3.6856 },

  { nombre: 'Jerónimos', distrito: 'Retiro', lat: 40.4148, lng: -3.6880 },
  { nombre: 'Ibiza', distrito: 'Retiro', lat: 40.4183, lng: -3.6765 },
  { nombre: 'Niño Jesús', distrito: 'Retiro', lat: 40.4112, lng: -3.6728 },
  { nombre: 'Pacífico', distrito: 'Retiro', lat: 40.4026, lng: -3.6753 },
  { nombre: 'Adelfas', distrito: 'Retiro', lat: 40.4002, lng: -3.6702 },
  { nombre: 'Estrella', distrito: 'Retiro', lat: 40.4131, lng: -3.6643 },

  { nombre: 'Imperial', distrito: 'Arganzuela', lat: 40.4078, lng: -3.7176 },
  { nombre: 'Acacias', distrito: 'Arganzuela', lat: 40.4038, lng: -3.7067 },
  { nombre: 'Chopera', distrito: 'Arganzuela', lat: 40.3937, lng: -3.6998 },
  { nombre: 'Legazpi', distrito: 'Arganzuela', lat: 40.3912, lng: -3.6942 },
  { nombre: 'Delicias', distrito: 'Arganzuela', lat: 40.3970, lng: -3.6894 },
  { nombre: 'Palos de Moguer', distrito: 'Arganzuela', lat: 40.4030, lng: -3.6946 },
  { nombre: 'Atocha', distrito: 'Arganzuela', lat: 40.4010, lng: -3.6836 },

  { nombre: 'Gaztambide', distrito: 'Chamberí', lat: 40.4345, lng: -3.7156 },
  { nombre: 'Arapiles', distrito: 'Chamberí', lat: 40.4345, lng: -3.7081 },
  { nombre: 'Trafalgar', distrito: 'Chamberí', lat: 40.4305, lng: -3.7018 },
  { nombre: 'Almagro', distrito: 'Chamberí', lat: 40.4329, lng: -3.6928 },
  { nombre: 'Ríos Rosas', distrito: 'Chamberí', lat: 40.4417, lng: -3.6985 },
  { nombre: 'Vallehermoso', distrito: 'Chamberí', lat: 40.4421, lng: -3.7090 },

  { nombre: 'Bellas Vistas', distrito: 'Tetuán', lat: 40.4541, lng: -3.7070 },
  { nombre: 'Cuatro Caminos', distrito: 'Tetuán', lat: 40.4472, lng: -3.7038 },
  { nombre: 'Castillejos', distrito: 'Tetuán', lat: 40.4602, lng: -3.6949 },
  { nombre: 'Almenara', distrito: 'Tetuán', lat: 40.4714, lng: -3.6947 },
  { nombre: 'Valdeacederas', distrito: 'Tetuán', lat: 40.4649, lng: -3.7058 },
  { nombre: 'Berruguete', distrito: 'Tetuán', lat: 40.4597, lng: -3.7048 },

  { nombre: 'Casa de Campo', distrito: 'Moncloa-Aravaca', lat: 40.4225, lng: -3.7506 },
  { nombre: 'Argüelles', distrito: 'Moncloa-Aravaca', lat: 40.4300, lng: -3.7189 },
  { nombre: 'Ciudad Universitaria', distrito: 'Moncloa-Aravaca', lat: 40.4451, lng: -3.7288 },
  { nombre: 'Valdezarza', distrito: 'Moncloa-Aravaca', lat: 40.4622, lng: -3.7157 },
  { nombre: 'Aravaca', distrito: 'Moncloa-Aravaca', lat: 40.4577, lng: -3.7836 },

  { nombre: 'Comillas', distrito: 'Carabanchel', lat: 40.3938, lng: -3.7109 },
  { nombre: 'Opañel', distrito: 'Carabanchel', lat: 40.3906, lng: -3.7222 },
  { nombre: 'San Isidro', distrito: 'Carabanchel', lat: 40.3974, lng: -3.7285 },
  { nombre: 'Vista Alegre', distrito: 'Carabanchel', lat: 40.3880, lng: -3.7396 },
  { nombre: 'Puerta Bonita', distrito: 'Carabanchel', lat: 40.3837, lng: -3.7399 },
  { nombre: 'Buenavista', distrito: 'Carabanchel', lat: 40.3668, lng: -3.7522 },
  { nombre: 'Abrantes', distrito: 'Carabanchel', lat: 40.3793, lng: -3.7270 },

  { nombre: 'Orcasitas', distrito: 'Usera', lat: 40.3697, lng: -3.7139 },
  { nombre: 'Orcasur', distrito: 'Usera', lat: 40.3679, lng: -3.7008 },
  { nombre: 'San Fermín', distrito: 'Usera', lat: 40.3739, lng: -3.6928 },
  { nombre: 'Almendrales', distrito: 'Usera', lat: 40.3845, lng: -3.6999 },
  { nombre: 'Moscardó', distrito: 'Usera', lat: 40.3889, lng: -3.7057 },
  { nombre: 'Zofío', distrito: 'Usera', lat: 40.3798, lng: -3.7152 },

  { nombre: 'Entrevías', distrito: 'Puente de Vallecas', lat: 40.3747, lng: -3.6686 },
  { nombre: 'San Diego', distrito: 'Puente de Vallecas', lat: 40.3908, lng: -3.6678 },
  { nombre: 'Palomeras Bajas', distrito: 'Puente de Vallecas', lat: 40.3837, lng: -3.6594 },
  { nombre: 'Palomeras Sureste', distrito: 'Puente de Vallecas', lat: 40.3864, lng: -3.6400 },
  { nombre: 'Numancia', distrito: 'Puente de Vallecas', lat: 40.3977, lng: -3.6609 },
  { nombre: 'Portazgo', distrito: 'Puente de Vallecas', lat: 40.3924, lng: -3.6484 },

  { nombre: 'Casco Histórico de Vallecas', distrito: 'Villa de Vallecas', lat: 40.3797, lng: -3.6218 },
  { nombre: 'Santa Eugenia', distrito: 'Villa de Vallecas', lat: 40.3838, lng: -3.6084 },
  { nombre: 'Ensanche de Vallecas', distrito: 'Villa de Vallecas', lat: 40.3651, lng: -3.5967 },

  { nombre: 'Pavones', distrito: 'Moratalaz', lat: 40.3980, lng: -3.6347 },
  { nombre: 'Horcajo', distrito: 'Moratalaz', lat: 40.4074, lng: -3.6269 },
  { nombre: 'Marroquina', distrito: 'Moratalaz', lat: 40.4102, lng: -3.6444 },
  { nombre: 'Media Legua', distrito: 'Moratalaz', lat: 40.4110, lng: -3.6557 },
  { nombre: 'Fontarrón', distrito: 'Moratalaz', lat: 40.3985, lng: -3.6488 },
  { nombre: 'Vinateros', distrito: 'Moratalaz', lat: 40.4054, lng: -3.6417 },

  { nombre: 'Ventas', distrito: 'Ciudad Lineal', lat: 40.4302, lng: -3.6570 },
  { nombre: 'Pueblo Nuevo', distrito: 'Ciudad Lineal', lat: 40.4356, lng: -3.6427 },
  { nombre: 'Quintana', distrito: 'Ciudad Lineal', lat: 40.4343, lng: -3.6475 },
  { nombre: 'Concepción', distrito: 'Ciudad Lineal', lat: 40.4394, lng: -3.6525 },
  { nombre: 'San Juan Bautista', distrito: 'Ciudad Lineal', lat: 40.4527, lng: -3.6567 },
  { nombre: 'Costillares', distrito: 'Ciudad Lineal', lat: 40.4798, lng: -3.6671 },

  { nombre: 'Prosperidad', distrito: 'Chamartín', lat: 40.4442, lng: -3.6745 },
  { nombre: 'El Viso', distrito: 'Chamartín', lat: 40.4436, lng: -3.6872 },
  { nombre: 'Ciudad Jardín', distrito: 'Chamartín', lat: 40.4495, lng: -3.6705 },
  { nombre: 'Hispanoamérica', distrito: 'Chamartín', lat: 40.4573, lng: -3.6780 },
  { nombre: 'Nueva España', distrito: 'Chamartín', lat: 40.4644, lng: -3.6808 },
  { nombre: 'Castilla', distrito: 'Chamartín', lat: 40.4725, lng: -3.6811 },

  { nombre: 'Palomas', distrito: 'Hortaleza', lat: 40.4548, lng: -3.6155 },
  { nombre: 'Piovera', distrito: 'Hortaleza', lat: 40.4569, lng: -3.6231 },
  { nombre: 'Canillas', distrito: 'Hortaleza', lat: 40.4640, lng: -3.6415 },
  { nombre: 'Pinar del Rey', distrito: 'Hortaleza', lat: 40.4687, lng: -3.6484 },
  { nombre: 'Apóstol Santiago', distrito: 'Hortaleza', lat: 40.4767, lng: -3.6608 },
  { nombre: 'Valdefuentes', distrito: 'Hortaleza', lat: 40.4947, lng: -3.6345 },

  { nombre: 'Casco Histórico de Barajas', distrito: 'Barajas', lat: 40.4737, lng: -3.5778 },
  { nombre: 'Timón', distrito: 'Barajas', lat: 40.4774, lng: -3.5928 },
  { nombre: 'Corralejos', distrito: 'Barajas', lat: 40.4645, lng: -3.5898 },
  { nombre: 'Alameda de Osuna', distrito: 'Barajas', lat: 40.4578, lng: -3.5872 },
  { nombre: 'Aeropuerto', distrito: 'Barajas', lat: 40.4918, lng: -3.5695 },
];

const crearIdBarrio = (nombre) => {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
};

const crearTerritorio = (barrio) => ({
  ...barrio,
  tipo: 'barrio',
  nombreBase: barrio.nombre,
  nombreVisible: barrio.distrito && barrio.distrito !== barrio.nombre
    ? `${barrio.nombre}`
    : barrio.nombre,
  capaIdentidad: 'barrio_reconocible',
  fuenteNombre: 'seed_manual_madrid',
  ciudadId: CIUDAD_MADRID.id,
  ciudadNombre: CIUDAD_MADRID.nombre,
  paisCodigo: CIUDAD_MADRID.paisCodigo,
  paisNombre: CIUDAD_MADRID.paisNombre,
  radio: barrio.radio ?? 800,
  dueno: null,
  duenoPuntos: 0,
});

export const cargarBarrios = async () => {
  await setDoc(doc(db, 'ciudades', CIUDAD_MADRID.id), {
    ...CIUDAD_MADRID,
    totalZonas: barrios.length,
  }, { merge: true });

  for (const barrio of barrios) {
    const id = `${CIUDAD_MADRID.id}-${crearIdBarrio(barrio.nombre)}`;
    const territorio = crearTerritorio(barrio);
    await setDoc(doc(db, 'barrios', `${CIUDAD_MADRID.id}-${crearIdBarrio(barrio.nombre)}`), {
      ...territorio,
    }, { merge: true });
    await setDoc(doc(db, 'territorios', id), territorio, { merge: true });
  }
  console.log(`${barrios.length} territorios cargados`);
};
