const firebaseConfig = {
  apiKey: "AIzaSyBUcw8o7otTVB97wR0mMJIo2LNkS_oSB5Y",
  authDomain: "pdi-ta-app.firebaseapp.com",
  projectId: "pdi-ta-app",
  storageBucket: "pdi-ta-app.appspot.com",
  messagingSenderId: "477558489412",
  appId: "1:477558489412:web:b0898e239f2145a5299711"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
