
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app  = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = '../html/login.html'; return; }
  const snap = await getDoc(doc(db,'users',user.uid));
  const data = snap.exists() ? snap.data() : {};
  if (data.role !== 'student') { window.location.href = '../html/login.html'; return; }
  const name = data.name || user.email.split('@')[0];
  document.getElementById('navUserName').textContent = name;
  document.getElementById('heroName').textContent    = `أهلاً بكِ، ${name}`;
  document.getElementById('authGate').style.display    = 'none';
  document.getElementById('mainContent').style.display = 'flex';
});

window.doLogout = () => signOut(auth).then(() => window.location.href = '../html/login.html');
