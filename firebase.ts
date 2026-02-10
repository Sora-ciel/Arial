import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBRrsegKXpz_7ZcKBQXhoxpOcx4HIzZ1fE",
  authDomain: "arial-473c1.firebaseapp.com",
  projectId: "arial-473c1",
  storageBucket: "arial-473c1.firebasestorage.app",
  appId: "1:921907824188:web:652f54122a8d8a22742539",
  databaseURL: "https://arial-473c1-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);
