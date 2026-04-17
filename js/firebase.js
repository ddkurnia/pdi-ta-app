const firebaseConfig = {
  apiKey: "AIzaSyB.....",
  authDomain: "pdi-ta-app.firebaseapp.com",
  projectId: "pdi-ta-app",
  storageBucket: "pdi-ta-app.firebasestorage.app",
  messagingSenderId: "477558489412",
  appId: "1:477558489412:web:..."
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
