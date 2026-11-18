// Registration and login with Supabase Auth. Needs config.js + app.js.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UAE_PHONE_RE = /^(\+971|00971|0)?5\d{8}$/;

// show the error right under the field that is wrong, highlight it and focus it
function fieldError(id, text) {
  document.querySelectorAll(".field-error").forEach((n) => n.remove());
  document.querySelectorAll(".invalid").forEach((n) => n.classList.remove("invalid"));
  const f = document.getElementById(id);
  f.classList.add("invalid");
  const m = document.createElement("div");
  m.className = "field-error"; m.setAttribute("role", "alert"); m.textContent = text;
  f.insertAdjacentElement("afterend", m);
  f.focus();
}

async function handleRegister(e) {
  e.preventDefault();
  const msg = document.getElementById("form-msg");
  const full_name = document.getElementById("full_name").value.trim();
  const email = document.getElementById("email").value.trim();
  const phone = document.getElementById("phone").value.trim().replace(/[\s-]/g, "");
  const password = document.getElementById("password").value;
  const confirm = document.getElementById("confirm").value;

  // client-side validation (the database also enforces its own constraints)
  if (full_name.length < 2) return fieldError("full_name", "Please enter your full name.");
  if (!EMAIL_RE.test(email)) return fieldError("email", "Please enter a valid e-mail address.");
  if (phone && !UAE_PHONE_RE.test(phone)) return fieldError("phone", "Phone must be a UAE mobile number, e.g. 0501234567.");
  if (password.length < 8) return fieldError("password", "Password must be at least 8 characters.");
  if (password !== confirm) return fieldError("confirm", "The two passwords do not match.");

  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  // INSERT (Supabase Auth creates the user; a database trigger creates the customers row)
  const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { full_name, phone } } });
  btn.disabled = false;
  if (error) return showMsg(msg, error.message);
  if (data.session) {
    location.href = safeNext(new URLSearchParams(location.search).get("next"));
  } else {
    showMsg(msg, "Account created. Please check your e-mail and click the confirmation link, then log in.", "ok");
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const msg = document.getElementById("form-msg");
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!EMAIL_RE.test(email) || !password) return showMsg(msg, "Enter your e-mail and password.");
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  btn.disabled = false;
  if (error) return showMsg(msg, "Login failed: " + error.message);
  location.href = safeNext(new URLSearchParams(location.search).get("next"));
}

document.addEventListener("DOMContentLoaded", () => {
  const reg = document.getElementById("register-form");
  const log = document.getElementById("login-form");
  if (reg) reg.addEventListener("submit", handleRegister);
  if (log) log.addEventListener("submit", handleLogin);
  // keep the ?next= redirect when switching between the two pages
  const next = new URLSearchParams(location.search).get("next");
  if (next) document.querySelectorAll("a[data-keep-next]").forEach((a) => (a.href += "?next=" + encodeURIComponent(safeNext(next))));
});
