import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

const firebaseDefaults = {
  apiKey: 'AIzaSyBRrsegKXpz_7ZcKBQXhoxpOcx4HIzZ1fE',
  authDomain: 'arial-473c1.firebaseapp.com',
  projectId: 'arial-473c1',
  storageBucket: 'arial-473c1.firebasestorage.app',
  appId: '1:921907824188:web:652f54122a8d8a22742539',
  databaseURL: 'https://arial-473c1-default-rtdb.firebaseio.com'
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseDefaults.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseDefaults.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseDefaults.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseDefaults.storageBucket,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseDefaults.appId,
  databaseURL: import.meta.env.VITE_FIREBASE_DB_URL || firebaseDefaults.databaseURL
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);
