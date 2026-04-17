async function register() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const res = await auth.createUserWithEmailAndPassword(email, password);

  await db.collection("users").doc(res.user.uid).set({
    email,
    nama: "",
    role: "ta",
    status: "pending",
    createdAt: new Date()
  });

  alert("Berhasil daftar, tunggu approval admin");
}

async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const res = await auth.signInWithEmailAndPassword(email, password);

  const doc = await db.collection("users").doc(res.user.uid).get();
  const user = doc.data();

  if (user.status !== "active") {
    alert("Akun belum di-approve admin");
    return;
  }

  if (user.role === "admin") {
    window.location.href = "admin.html";
  } else {
    window.location.href = "ta.html";
  }
}
