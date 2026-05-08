import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyAKnMDOgPNDfH3Ai0RMBTKXAAHvh0LCDQ4",
  authDomain: "conquerrun-8d30e.firebaseapp.com",
  projectId: "conquerrun-8d30e",
  storageBucket: "conquerrun-8d30e.firebasestorage.app",
  messagingSenderId: "743879769903",
  appId: "1:743879769903:web:136b6f6224212ab89c6bda"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
export const storage = getStorage(app);
