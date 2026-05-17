import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Real Firebase configuration provided by user
const firebaseConfig = {
  apiKey: "AIzaSyBerTLfdkR2Co7uFQ4uIgSSWiePszze6QM",
  authDomain: "streamvault-922af.firebaseapp.com",
  projectId: "streamvault-922af",
  storageBucket: "streamvault-922af.firebasestorage.app",
  messagingSenderId: "852106218258",
  appId: "1:852106218258:web:1fda3342901692a48441cb",
  measurementId: "G-EHPYC0S1T6"
};

let app: ReturnType<typeof initializeApp>;
let auth: ReturnType<typeof getAuth>;
let db: ReturnType<typeof getFirestore>;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.warn("Firebase initialization failed – running in demo mode", e);
}

export { auth, db };
export const isFirebaseAvailable = true;
