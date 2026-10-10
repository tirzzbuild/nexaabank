
"use strict";

/* =========================================
   NEXABANK - MAIN SCRIPT
   Login, Register, CAPTCHA, Redeem,
   Transfer, Payment, History, Profile
========================================= */

const API_BASE = "http://localhost:3000";
const TOKEN_KEY = "nexabank_token";
const USER_KEY = "nexabank_user";

const state = {
  captchaVerified: false,
  captchaLoading: false,
  toastTimer: null,
  redeemBusy: false,
  transactionBusy: false,
  historyBusy: false
};

function el(id) {
  return document.getElementById(id);
}

function text(node, value) {
  if (node) node.textContent = value == null ? "" : String(value);
}

function visible(node, show) {
  if (!node) return;
  node.classList.toggle("hidden", !show);
  node.hidden = !show;
}

function rupiah(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) return "Belum tersedia";

  return "Rp" + new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0
  }).format(amount);
}

function storedUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

function saveSession(token, user) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/* =========================================
   API
========================================= */

async function apiRequest(endpoint, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = localStorage.getItem(TOKEN_KEY);

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = "Bearer " + token;
  }

  let response;

  try {
    response = await fetch(API_BASE + endpoint, {
      ...options,
      headers
    });
  } catch {
    throw new Error(
      "Server NexaBank tidak terhubung. Periksa localhost:3000."
    );
  }

  let result;

  try {
    result = await response.json();
  } catch {
    result = {};
  }

  if (!response.ok || result.success === false) {
    if (
      response.status === 401 &&
      endpoint === "/api/auth/me"
    ) {
      clearSession();
    }

    throw new Error(
      result.message || "Permintaan gagal. Silakan coba lagi."
    );
  }

  return result;
}

/* =========================================
   TOAST / MESSAGES
========================================= */

function toast(message, type = "info") {
  let node = el("toastMessage");

  if (!node) {
    node = document.createElement("div");
    node.id = "toastMessage";
    node.className = "toast-message";
    document.body.appendChild(node);
  }

  text(node, message);
  node.classList.remove("success", "error", "info");
  node.classList.add(type);
  visible(node, true);

  if (state.toastTimer) clearTimeout(state.toastTimer);

  state.toastTimer = setTimeout(() => {
    visible(node, false);
  }, 3500);
}

function formMessage(id, message, type = "error") {
  const node = el(id);

  if (!node) {
    toast(message, type);
    return;
  }

  text(node, message);
  node.classList.remove("success", "error", "info");
  node.classList.add(type);
  visible(node, true);
}

function clearMessages() {
  [
    "loginMessage",
    "registerMessage",
    "redeemMessage"
  ].forEach(id => {
    const node = el(id);
    if (!node) return;

    text(node, "");
    node.classList.remove("success", "error", "info");
    visible(node, false);
  });
}

function buttonLoading(button, loading, label = "Memproses...") {
  if (!button) return;

  if (loading) {
    if (!button.dataset.originalText) {
      button.dataset.originalText =
        button.tagName === "INPUT"
          ? button.value
          : button.textContent;
    }

    button.disabled = true;

    if (button.tagName === "INPUT") {
      button.value = label;
    } else {
      button.textContent = label;
    }
  } else {
    button.disabled = false;

    if (button.dataset.originalText) {
      if (button.tagName === "INPUT") {
        button.value = button.dataset.originalText;
      } else {
        button.textContent = button.dataset.originalText;
      }

      delete button.dataset.originalText;
    }
  }
}

/* =========================================
   PAGE NAVIGATION
========================================= */

function showPage(page) {
  visible(el("loginSection"), page === "login");
  visible(el("registerSection"), page === "register");
  visible(el("dashboardSection"), page === "dashboard");

  if (page !== "dashboard") {
    visible(el("loginView"), page === "login");
    visible(el("registerView"), page === "register");
    visible(el("dashboardView"), false);
  }

  visible(el("headerLogout"), page === "dashboard");

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showLogin() {
  clearMessages();
  showPage("login");
}

function showRegister() {
  clearMessages();
  resetCaptcha();
  showPage("register");
}

/* =========================================
   PASSWORD BUTTONS
========================================= */

function initializePasswordButtons() {
  document.querySelectorAll(".password-toggle").forEach(button => {
    if (button.dataset.ready === "true") return;
    button.dataset.ready = "true";

    button.addEventListener("click", () => {
      const target = el(button.dataset.target);
      if (!target) return;

      const show = target.type === "password";
      target.type = show ? "text" : "password";
      button.textContent = show ? "Hide" : "Show";
    });
  });
}

/* =========================================
   CAPTCHA
========================================= */

function resetCaptcha() {
  state.captchaVerified = false;
  state.captchaLoading = false;

  const button = el("captchaCheckbox");

  if (button) {
    button.disabled = false;
    button.setAttribute("aria-pressed", "false");
  }

  if (el("captchaBox")) {
    el("captchaBox").classList.remove("verified", "loading");
  }

  visible(el("captchaCheck"), false);
  visible(el("captchaSpinner"), false);

  text(
    el("captchaStatus"),
    "Klik kotak untuk verifikasi visual"
  );
}

function initializeCaptcha() {
  const button = el("captchaCheckbox");

  if (!button || button.dataset.ready === "true") return;
  button.dataset.ready = "true";

  button.addEventListener("click", async () => {
    if (state.captchaVerified || state.captchaLoading) return;

    state.captchaLoading = true;
    button.disabled = true;

    visible(el("captchaSpinner"), true);
    text(el("captchaStatus"), "Memverifikasi...");

    if (el("captchaBox")) {
      el("captchaBox").classList.add("loading");
    }

    await new Promise(resolve => setTimeout(resolve, 700));

    state.captchaLoading = false;
    state.captchaVerified = true;

    button.disabled = false;
    button.setAttribute("aria-pressed", "true");

    visible(el("captchaSpinner"), false);
    visible(el("captchaCheck"), true);

    if (el("captchaBox")) {
      el("captchaBox").classList.remove("loading");
      el("captchaBox").classList.add("verified");
    }

    text(el("captchaStatus"), "Verifikasi berhasil.");
  });
}

/* =========================================
   ACCOUNT DISPLAY
========================================= */

function updateUser(user) {
  if (!user) return;

  const username = user.username || "Pengguna";

  const accountNumber =
    user.accountNumber ||
    user.account_number ||
    "Belum tersedia";

  [
    "headerUsername",
    "dashboardUsername",
    "accountUsername"
  ].forEach(id => {
    const node = el(id);
    if (!node) return;

    if (id === "accountUsername") {
      node.value = username;
    } else {
      text(node, username);
    }
  });

  if (el("accountNumber")) {
    el("accountNumber").value =
      accountNumber === "Belum tersedia" ? "" : accountNumber;
  }

  if (
    el("registerAccountNumber") &&
    accountNumber !== "Belum tersedia"
  ) {
    el("registerAccountNumber").value = accountNumber;
  }
}

function updateBalances(data) {
  if (!data) return false;

  const total =
    data.totalBalance ??
    data.total_balance ??
    data.total ??
    data.balance;

  const available =
    data.availableBalance ??
    data.available_balance ??
    data.available;

  const held =
    data.heldBalance ??
    data.held_balance ??
    data.held;

  let updated = false;

  if (total !== undefined && Number.isFinite(Number(total))) {
    text(el("totalBalance"), rupiah(total));
    updated = true;
  }

  if (
    available !== undefined &&
    Number.isFinite(Number(available))
  ) {
    text(el("availableBalance"), rupiah(available));
    updated = true;
  }

  if (held !== undefined && Number.isFinite(Number(held))) {
    text(el("heldBalance"), rupiah(held));
    updated = true;
  }

  return updated;
}

async function refreshUser() {
  const result = await apiRequest("/api/auth/me");
  const user = result.user || result.data || result;

  if (!user || !user.id) {
    throw new Error("Data akun tidak ditemukan dari server.");
  }

  saveSession(localStorage.getItem(TOKEN_KEY), user);

  return user;
}

async function refreshBalances(user) {
  const embedded =
    user?.balanceData ||
    user?.balances ||
    user?.balance_data;

  if (embedded && updateBalances(embedded)) {
    return true;
  }

  if (user && updateBalances(user)) {
    const hasTotal =
      user.totalBalance !== undefined ||
      user.total_balance !== undefined ||
      user.total !== undefined ||
      user.balance !== undefined;

    if (hasTotal) return true;
  }

  const endpoints = [
    "/api/balance/me",
    "/api/balances/me",
    "/api/account/balance",
    "/api/balance"
  ];

  for (const endpoint of endpoints) {
    try {
      const result = await apiRequest(endpoint);

      const data =
        result.balanceData ||
        result.balances ||
        result.balance ||
        result.data ||
        result;

      if (updateBalances(data)) return true;
    } catch (error) {
      console.debug("Endpoint saldo tidak tersedia:", endpoint);
    }
  }

  return false;
}

async function syncAccount() {
  const user = await refreshUser();

  updateUser(user);
  await refreshBalances(user);

  return user;
}

async function showDashboard(user) {
  showPage("dashboard");
  updateUser(user);

  try {
    const freshUser = await syncAccount();
    updateUser(freshUser);
  } catch (error) {
    console.warn("Pembaruan akun:", error.message);
  }

  await loadTransactionHistory();
}

/* =========================================
   LOGIN
========================================= */

async function handleLogin(event) {
  event.preventDefault();
  clearMessages();

  const username = (el("loginUsername")?.value || "").trim();
  const password = el("loginPassword")?.value || "";

  if (!username || !password) {
    formMessage("loginMessage", "Masukkan username dan password.");
    return;
  }

  const button = el("loginSubmit");
  buttonLoading(button, true, "Memeriksa akun...");

  try {
    const result = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

    if (!result.token || !result.user) {
      throw new Error("Sesi login yang valid tidak diterima.");
    }

    saveSession(result.token, result.user);

    await showDashboard(result.user);

    formMessage("loginMessage", "Login berhasil.", "success");
    toast("Login berhasil.", "success");
  } catch (error) {
    formMessage("loginMessage", error.message);
  } finally {
    buttonLoading(button, false);
  }
}

/* =========================================
   REGISTRATION
========================================= */

async function handleRegister(event) {
  event.preventDefault();
  clearMessages();

  const username = (el("registerUsername")?.value || "").trim();
  const email = (el("registerEmail")?.value || "").trim();
  const password = el("registerPassword")?.value || "";
  const confirmPassword =
    el("registerPasswordConfirm")?.value || "";

  if (username.length < 3) {
    formMessage("registerMessage", "Username minimal 3 karakter.");
    return;
  }

  if (!email) {
    formMessage("registerMessage", "Masukkan alamat email.");
    return;
  }

  if (password.length < 8) {
    formMessage("registerMessage", "Password minimal 8 karakter.");
    return;
  }

  if (password !== confirmPassword) {
    formMessage("registerMessage", "Konfirmasi password tidak cocok.");
    return;
  }

  if (!state.captchaVerified) {
    formMessage("registerMessage", "Selesaikan verifikasi terlebih dahulu.");
    return;
  }

  const button = el("registerSubmit");
  buttonLoading(button, true, "Membuat akun...");

  try {
    const result = await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password })
    });

    const accountNumber =
      result.user?.accountNumber ||
      result.user?.account_number ||
      "";

    if (el("registerAccountNumber")) {
      el("registerAccountNumber").value = accountNumber;
    }

    formMessage(
      "registerMessage",
      "Registrasi berhasil. Silakan login.",
      "success"
    );

    el("registerForm")?.reset();
    resetCaptcha();

    if (accountNumber && el("registerAccountNumber")) {
      el("registerAccountNumber").value = accountNumber;
    }

    toast("Registrasi berhasil.", "success");

    setTimeout(() => {
      showLogin();

      if (el("loginUsername")) {
        el("loginUsername").value = username;
      }
    }, 1200);
  } catch (error) {
    formMessage("registerMessage", error.message);
  } finally {
    buttonLoading(button, false);
  }
}

/* =========================================
   MODALS
========================================= */

function openModal(id) {
  const modal = el(id);
  if (!modal) return;

  visible(modal, true);
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(id) {
  const modal = el(id);
  if (!modal) return;

  visible(modal, false);
  modal.setAttribute("aria-hidden", "true");
}

function initializeModalClosers() {
  [
    ["serviceModalClose", "serviceModal"],
    ["serviceModalOk", "serviceModal"],
    ["redeemModalClose", "redeemModal"]
  ].forEach(([buttonId, modalId]) => {
    const button = el(buttonId);

    if (!button || button.dataset.ready === "true") return;
    button.dataset.ready = "true";

    button.addEventListener("click", () => closeModal(modalId));
  });

  ["serviceModal", "redeemModal"].forEach(id => {
    const modal = el(id);

    if (!modal || modal.dataset.ready === "true") return;
    modal.dataset.ready = "true";

    modal.addEventListener("click", event => {
      if (event.target === modal) closeModal(id);
    });
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeModal("serviceModal");
      closeModal("redeemModal");
    }
  });
}

function showService(title, description) {
  text(el("serviceModalTitle"), title);
  text(el("serviceModalDescription"), description);
  openModal("serviceModal");
}

function getServiceBody() {
  let body = el("serviceModalBody");

  if (body) return body;

  body = document.createElement("div");
  body.id = "serviceModalBody";

  const description = el("serviceModalDescription");

  if (description?.parentElement) {
    description.insertAdjacentElement("afterend", body);
  } else {
    const modal = el("serviceModal");

    if (modal) modal.appendChild(body);
  }

  return body;
}

function clearServiceBody() {
  const body = getServiceBody();

  if (body) body.replaceChildren();

  return body;
}

function createField(labelText, name, options = {}) {
  const wrapper = document.createElement("label");
  wrapper.className = "nexa-form-field";

  const label = document.createElement("span");
  label.textContent = labelText;

  let input;

  if (options.select) {
    input = document.createElement("select");

    options.select.forEach(item => {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      input.appendChild(option);
    });
  } else {
    input = document.createElement("input");
    input.type = options.type || "text";

    if (options.min !== undefined) input.min = String(options.min);
    if (options.maxLength) input.maxLength = options.maxLength;
    if (options.placeholder) input.placeholder = options.placeholder;
    if (options.inputMode) input.inputMode = options.inputMode;
  }

  input.name = name;
  input.id = "nexaField_" + name;
  input.required = options.required !== false;

  if (options.autocomplete) {
    input.autocomplete = options.autocomplete;
  }

  wrapper.append(label, input);

  return { wrapper, input };
}


function createServiceForm(description, fields, submitLabel, handler) {
  const body = clearServiceBody();

  const form = document.createElement("form");
  form.className = "nexa-service-form";

  const message = document.createElement("div");
  message.className = "nexa-form-message";
  message.hidden = true;
  message.setAttribute("role", "status");

  const inputs = {};

  fields.forEach(field => {
    const created = createField(field.label, field.name, field.options);
    inputs[field.name] = created.input;
    form.appendChild(created.wrapper);
  });

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "nexa-service-submit";
  submit.textContent = submitLabel;

  form.append(message, submit);

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (state.transactionBusy) return;

    await handler({
      form,
      inputs,
      message,
      submit
    });
  });

  body.appendChild(form);

  return { form, inputs, message, submit };
}

function serviceMessage(node, message, type = "error") {
  text(node, message);
  node.classList.remove("success", "error", "info");
  node.classList.add(type);
  node.hidden = false;
}

function getPositiveAmount(input) {
  const value = Number(input?.value);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Nominal harus berupa angka bulat lebih dari nol.");
  }

  return value;
}

/* =========================================
   TRANSACTION RESULT / BALANCE SYNC
========================================= */

async function afterTransaction(data) {
  if (data && updateBalances(data)) {
    // Saldo langsung diperbarui dari respons transaksi.
  }

  try {
    const user = await syncAccount();
    updateUser(user);
  } catch (error) {
    console.warn("Saldo dari server belum dapat disegarkan:", error.message);
  }

  await loadTransactionHistory();
}

async function submitTransactionRequest({
  endpoint,
  payload,
  message,
  submit,
  successFallback
}) {
  state.transactionBusy = true;
  buttonLoading(submit, true, "Memproses transaksi...");

  try {
    const result = await apiRequest(endpoint, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const data = result.data || result;

    serviceMessage(
      message,
      result.message || successFallback,
      "success"
    );

    await afterTransaction(data);

    toast(result.message || successFallback, "success");

    if (data.reference) {
      const reference = document.createElement("div");
      reference.className = "nexa-reference";
      reference.textContent = "Referensi: " + data.reference;
      message.appendChild(reference);
    }

    return true;
  } catch (error) {
    serviceMessage(message, error.message, "error");
    return false;
  } finally {
    state.transactionBusy = false;
    buttonLoading(submit, false);
  }
}

/* =========================================
   TRANSFER
========================================= */

function openTransferForm() {
  showService("Transfer", "Transfer saldo virtual ke rekening NexaBank lain.");

  createServiceForm(
    "Pastikan nomor rekening tujuan benar sebelum mengirim.",
    [
      {
        label: "Nomor rekening tujuan",
        name: "accountNumber",
        options: {
          type: "text",
          inputMode: "numeric",
          placeholder: "Contoh: 8812345678",
          maxLength: 10
        }
      },
      {
        label: "Nominal transfer (Rp)",
        name: "amount",
        options: {
          type: "number",
          min: 1,
          placeholder: "Contoh: 10000",
          inputMode: "numeric"
        }
      },
      {
        label: "Catatan (opsional)",
        name: "note",
        options: {
          required: false,
          type: "text",
          maxLength: 120,
          placeholder: "Catatan transfer"
        }
      }
    ],
    "Kirim Transfer",
    async ({ inputs, message, submit }) => {
      const accountNumber = inputs.accountNumber.value.trim();
      const note = inputs.note.value.trim();

      if (!/^\d{10}$/.test(accountNumber)) {
        serviceMessage(message, "Nomor rekening harus terdiri dari 10 digit.");
        return;
      }

      let amount;

      try {
        amount = getPositiveAmount(inputs.amount);
      } catch (error) {
        serviceMessage(message, error.message);
        return;
      }

      if (!window.confirm(
        "Kirim " + rupiah(amount) + " ke rekening " + accountNumber + "?"
      )) {
        return;
      }

      await submitTransactionRequest({
        endpoint: "/api/transactions/transfer",
        payload: { accountNumber, amount, note },
        message,
        submit,
        successFallback: "Transfer virtual berhasil."
      });
    }
  );
}

/* =========================================
   VIRTUAL PAYMENT
========================================= */

function openPaymentForm() {
  showService(
    "Pembayaran Virtual",
    "Gunakan pembayaran simulasi NexaBank."
  );

  createServiceForm(
    "Pembayaran akan memotong saldo virtual jika server menyetujuinya.",
    [
      {
        label: "Jenis pembayaran",
        name: "service",
        options: {
          select: [
            { value: "Pulsa Virtual", label: "Pulsa Virtual" },
            { value: "Paket Data Virtual", label: "Paket Data Virtual" },
            { value: "Tagihan Virtual", label: "Tagihan Virtual" },
            { value: "Belanja Virtual", label: "Belanja Virtual" }
          ]
        }
      },
      {
        label: "Nominal pembayaran (Rp)",
        name: "amount",
        options: {
          type: "number",
          min: 1,
          placeholder: "Contoh: 15000",
          inputMode: "numeric"
        }
      }
    ],
    "Bayar Sekarang",
    async ({ inputs, message, submit }) => {
      let amount;

      try {
        amount = getPositiveAmount(inputs.amount);
      } catch (error) {
        serviceMessage(message, error.message);
        return;
      }

      const service = inputs.service.value;

      if (!window.confirm(
        "Proses " + service + " sebesar " + rupiah(amount) + "?"
      )) {
        return;
      }

      await submitTransactionRequest({
        endpoint: "/api/transactions/payment",
        payload: { service, amount },
        message,
        submit,
        successFallback: "Pembayaran virtual berhasil."
      });
    }
  );
}

/* =========================================
   QR PAY
========================================= */

function openQrPay() {
  showService(
    "QR Pay",
    "Pembayaran melalui rekening tujuan."
  );

  createServiceForm(
    "Masukkan nomor rekening tujuan secara manual. Fitur pemindaian QR memerlukan integrasi QR scanner.",
    [
      {
        label: "Nomor rekening penerima",
        name: "accountNumber",
        options: {
          type: "text",
          inputMode: "numeric",
          placeholder: "10 digit nomor rekening",
          maxLength: 10
        }
      },
      {
        label: "Nominal pembayaran (Rp)",
        name: "amount",
        options: {
          type: "number",
          min: 1,
          placeholder: "Contoh: 10000",
          inputMode: "numeric"
        }
      }
    ],
    "Bayar ke Rekening",
    async ({ inputs, message, submit }) => {
      const accountNumber = inputs.accountNumber.value.trim();

      if (!/^\d{10}$/.test(accountNumber)) {
        serviceMessage(message, "Nomor rekening harus terdiri dari 10 digit.");
        return;
      }

      let amount;

      try {
        amount = getPositiveAmount(inputs.amount);
      } catch (error) {
        serviceMessage(message, error.message);
        return;
      }

      if (!window.confirm(
        "Bayar " + rupiah(amount) + " ke rekening " + accountNumber + "?"
      )) {
        return;
      }

      await submitTransactionRequest({
        endpoint: "/api/transactions/transfer",
        payload: {
          accountNumber,
          amount,
          note: "Pembayaran QR Pay virtual"
        },
        message,
        submit,
        successFallback: "Pembayaran virtual berhasil."
      });
    }
  );
}

/* =========================================
   PROFILE
========================================= */

function openProfile() {
  const user = storedUser();

  showService(
    "Pengaturan Profil",
    "Informasi akun NexaBank kamu."
  );

  const body = clearServiceBody();

  const details = document.createElement("div");
  details.className = "nexa-profile-details";

  const rows = [
    ["Username", user?.username || "Tidak tersedia"],
    [
      "Nomor rekening",
      user?.accountNumber || user?.account_number || "Tidak tersedia"
    ],
    ["Status", user?.user_status || "Tidak tersedia"]
  ];

  rows.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "nexa-profile-row";

    const name = document.createElement("span");
    name.textContent = label;

    const content = document.createElement("strong");
    content.textContent = String(value);

    row.append(name, content);
    details.appendChild(row);
  });

  const note = document.createElement("p");
  note.className = "muted";
  note.textContent =
    "Pengubahan profil belum diaktifkan karena endpoint penyimpanan profil belum tersedia di backend.";

  body.append(details, note);
}

/* =========================================
   SERVICE BUTTONS
========================================= */


function initializeServiceButtons() {
  document.querySelectorAll("[data-service]").forEach(button => {
    if (button.dataset.ready === "true") return;
    button.dataset.ready = "true";

    button.addEventListener("click", async () => {
      const service = button.dataset.service;

      if (service === "redeem") {
        clearRedeemMessage();
        openModal("redeemModal");
        await loadRedeemHistory();
        return;
      }

      if (!localStorage.getItem(TOKEN_KEY)) {
        toast("Login terlebih dahulu.", "error");
        showLogin();
        return;
      }

      switch (service) {
        case "transfer":
          openTransferForm();
          break;

        case "history":
          showService(
            "Riwayat Transaksi",
            "Transaksi yang tersimpan pada server NexaBank."
          );

          clearServiceBody();

          await loadTransactionHistory();

          break;

        case "payment":
          openPaymentForm();
          break;

        case "qr":
          openQrPay();
          break;

        case "profile":
          openProfile();
          break;
      }
    });
  });
}


/* =========================================
   REDEEM
   DIPERTAHANKAN DARI SCRIPT LAMA
========================================= */

function clearRedeemMessage() {
  const node = el("redeemMessage");
  if (!node) return;

  text(node, "");
  node.classList.remove("success", "error", "info");
  visible(node, false);
}

function showRedeemMessage(message, type = "error") {
  formMessage("redeemMessage", message, type);
}

function renderRedeemHistory(items) {
  const list = el("redeemHistoryList");
  if (!list) return;

  list.replaceChildren();

  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Belum ada riwayat redeem.";
    list.appendChild(empty);
    return;
  }

  items.forEach(item => {
    const row = document.createElement("div");
    row.className = "transaction-item";

    const details = document.createElement("div");
    const heading = document.createElement("strong");
    const date = document.createElement("div");

    heading.textContent = item.code || "Redeem Code";
    date.className = "muted";
    date.textContent = item.created_at
      ? new Date(item.created_at).toLocaleString("id-ID")
      : "Tanggal tidak tersedia";

    details.append(heading, date);

    const amount = document.createElement("strong");
    amount.textContent = "+" + rupiah(item.amount || 0);

    row.append(details, amount);
    list.appendChild(row);
  });
}

async function loadRedeemHistory() {
  const list = el("redeemHistoryList");
  if (!list) return;

  list.replaceChildren();

  const loading = document.createElement("div");
  loading.className = "empty-state";
  loading.textContent = "Memuat riwayat redeem...";
  list.appendChild(loading);

  if (!localStorage.getItem(TOKEN_KEY)) {
    renderRedeemHistory([]);
    showRedeemMessage("Login terlebih dahulu untuk menggunakan redeem.");
    return;
  }

  try {
    const result = await apiRequest("/api/redeem/me");

    renderRedeemHistory(
      result.redemptions || result.history || result.data || []
    );
  } catch (error) {
    renderRedeemHistory([]);
    showRedeemMessage(
      "Riwayat redeem belum dapat dimuat: " + error.message
    );
  }
}

async function handleRedeem(event) {
  event.preventDefault();

  if (state.redeemBusy) return;

  clearRedeemMessage();

  const code = (el("redeemCodeInput")?.value || "").trim();

  if (!code) {
    showRedeemMessage("Masukkan kode redeem terlebih dahulu.");
    return;
  }

  if (!localStorage.getItem(TOKEN_KEY)) {
    showRedeemMessage("Login terlebih dahulu untuk menukarkan kode.");
    return;
  }

  state.redeemBusy = true;

  const button = el("redeemSubmit");
  buttonLoading(button, true, "Memproses redeem...");

  try {
    const result = await apiRequest("/api/redeem", {
      method: "POST",
      body: JSON.stringify({ code })
    });

    const data = result.data || {};

    showRedeemMessage(
      result.message || "Kode berhasil ditukarkan.",
      "success"
    );

    el("redeemForm")?.reset();

    const updated = updateBalances({
      totalBalance: data.totalBalance,
      heldBalance: data.heldBalance,
      availableBalance: data.availableBalance
    });

    if (!updated) {
      await refreshBalances(storedUser());
    }

    await loadRedeemHistory();

    toast(result.message || "Redeem berhasil.", "success");
  } catch (error) {
    showRedeemMessage(error.message);
  } finally {
    state.redeemBusy = false;
    buttonLoading(button, false);
  }
}

/* =========================================
   TRANSACTION HISTORY
========================================= */

function renderTransactionHistory(items) {
  const list = el("transactionList");
  if (!list) return;

  list.replaceChildren();

  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Belum ada transaksi.";
    list.appendChild(empty);
    return;
  }

  items.forEach(item => {
    const row = document.createElement("div");
    row.className = "transaction-item";

    const details = document.createElement("div");
    details.className = "transaction-details";

    const heading = document.createElement("strong");
    heading.textContent =
      item.description ||
      item.type ||
      "Transaksi NexaBank";

    const metadata = document.createElement("div");
    metadata.className = "muted";

    const dateValue = item.created_at || item.createdAt;
    let dateText = "Tanggal tidak tersedia";

    if (dateValue) {
      const parsed = new Date(dateValue);

      if (!Number.isNaN(parsed.getTime())) {
        dateText = parsed.toLocaleString("id-ID");
      }
    }

    const reference = item.reference
      ? " • " + item.reference
      : "";

    metadata.textContent = dateText + reference;

    const status = document.createElement("div");
    status.className = "muted";
    status.textContent = "Status: " + (item.status || "Tidak diketahui");

    details.append(heading, metadata, status);

    const amount = document.createElement("strong");
    const amountValue = Number(item.amount || 0);

    const direction = String(item.direction || "").toLowerCase();
    const type = String(item.type || "").toLowerCase();

    const incoming =
      direction === "incoming" ||
      direction === "in" ||
      direction === "credit" ||
      type === "redeem";

    amount.textContent =
      (incoming ? "+" : "-") + rupiah(Math.abs(amountValue));

    amount.className = incoming ? "transaction-incoming" : "transaction-outgoing";

    row.append(details, amount);
    list.appendChild(row);
  });
}

async function loadTransactionHistory() {
  const list = el("transactionList");
  if (!list) return;

  if (state.historyBusy) return;

  list.replaceChildren();

  if (!localStorage.getItem(TOKEN_KEY)) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Login untuk melihat riwayat transaksi.";
    list.appendChild(empty);
    return;
  }

  state.historyBusy = true;

  const loading = document.createElement("div");
  loading.className = "empty-state";
  loading.textContent = "Memuat riwayat transaksi...";
  list.appendChild(loading);

  try {
    const result = await apiRequest("/api/transactions/me");

    const items =
      result.transactions ||
      result.history ||
      result.data?.transactions ||
      result.data ||
      [];

    renderTransactionHistory(items);
  } catch (error) {
    list.replaceChildren();

    const errorBox = document.createElement("div");
    errorBox.className = "empty-state";
    errorBox.textContent =
      "Riwayat belum dapat dimuat: " + error.message;

    list.appendChild(errorBox);
    console.warn("Riwayat transaksi:", error.message);
  } finally {
    state.historyBusy = false;
  }
}

/* =========================================
   LOGOUT / COPY
========================================= */

function logout() {
  clearSession();
  clearMessages();

  el("loginForm")?.reset();
  el("registerForm")?.reset();
  el("redeemForm")?.reset();

  closeModal("redeemModal");
  closeModal("serviceModal");
  resetCaptcha();
  showLogin();

  toast("Berhasil logout. Akun tetap tersimpan.", "success");
}

function initializeLogout() {
  [
    "headerLogout",
    "dashboardLogout",
    "logoutButton",
    "logoutBtn",
    "btnLogout"
  ].forEach(id => {
    const button = el(id);

    if (!button || button.dataset.ready === "true") return;
    button.dataset.ready = "true";

    button.addEventListener("click", logout);
  });
}

async function copyAccountNumber() {
  const user = storedUser();

  const accountNumber =
    user?.accountNumber ||
    user?.account_number ||
    el("accountNumber")?.value;

  if (!accountNumber) {
    toast("Nomor rekening belum tersedia.", "error");
    return;
  }

  try {
    await navigator.clipboard.writeText(String(accountNumber));
    toast("Nomor rekening berhasil disalin.", "success");
  } catch {
    toast("Gagal menyalin nomor rekening.", "error");
  }
}

function initializeCopy() {
  const button = el("copyAccountNumber");

  if (!button || button.dataset.ready === "true") return;
  button.dataset.ready = "true";

  button.addEventListener("click", copyAccountNumber);
}

/* =========================================
   NAVIGATION
========================================= */

function initializeNavigation() {
  [
    ["showLogin", showLogin],
    ["showRegister", showRegister]
  ].forEach(([id, handler]) => {
    const button = el(id);

    if (!button || button.dataset.ready === "true") return;
    button.dataset.ready = "true";

    button.addEventListener("click", handler);
  });

  const brand = el("brandHome");

  if (brand && brand.dataset.ready !== "true") {
    brand.dataset.ready = "true";

    brand.addEventListener("click", event => {
      event.preventDefault();

      if (localStorage.getItem(TOKEN_KEY)) {
        showDashboard(storedUser());
      } else {
        showLogin();
      }
    });
  }
}

/* =========================================
   SERVER / SESSION
========================================= */

async function checkServerStatus() {
  try {
    await apiRequest("/api/status");
    console.info("NexaBank API terhubung.");
  } catch (error) {
    console.warn("NexaBank API:", error.message);
  }
}

async function restoreSession() {
  const token = localStorage.getItem(TOKEN_KEY);
  const user = storedUser();

  if (!token || !user) {
    showLogin();
    return;
  }

  try {
    const freshUser = await refreshUser();
    await showDashboard(freshUser);
  } catch (error) {
    clearSession();
    showLogin();
    console.warn("Sesi tidak dapat dipulihkan:", error.message);
  }
}

/* =========================================
   INITIALIZATION
========================================= */

function initializeNexaBank() {
  if (el("currentYear")) {
    text(el("currentYear"), new Date().getFullYear());
  }

  initializePasswordButtons();
  initializeCaptcha();
  initializeNavigation();
  initializeLogout();
  initializeCopy();
  initializeModalClosers();
  initializeServiceButtons();

  const loginForm = el("loginForm");

  if (loginForm && loginForm.dataset.ready !== "true") {
    loginForm.dataset.ready = "true";
    loginForm.addEventListener("submit", handleLogin);
  }

  const registerForm = el("registerForm");

  if (registerForm && registerForm.dataset.ready !== "true") {
    registerForm.dataset.ready = "true";
    registerForm.addEventListener("submit", handleRegister);
  }

  const redeemForm = el("redeemForm");

  if (redeemForm && redeemForm.dataset.ready !== "true") {
    redeemForm.dataset.ready = "true";
    redeemForm.addEventListener("submit", handleRedeem);
  }

  checkServerStatus();
  restoreSession();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeNexaBank);
} else {
  initializeNexaBank();
}
