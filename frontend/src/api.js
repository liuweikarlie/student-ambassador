// frontend/src/api.js
// Replaces all window.storage calls with fetch() to Azure Functions
// ─────────────────────────────────────────────────────────────────
// Azure Static Web Apps automatically routes /api/* to your Functions,
// so no need to hardcode a base URL — just use relative paths.

const BASE = "/api";

// ── Token helpers ──────────────────────────────────────────────
export function getToken() {
  return sessionStorage.getItem("amb_token");
}
export function setToken(token) {
  sessionStorage.setItem("amb_token", token);
}
export function clearToken() {
  sessionStorage.removeItem("amb_token");
}

function authHeaders() {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handle(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

// ── Auth ───────────────────────────────────────────────────────
export async function login(email, password, role) {
  const body = await handle(
    await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role }),
    })
  );
  setToken(body.token);
  return body.user;
}

// ── Ambassadors ────────────────────────────────────────────────
export async function getAmbassadors() {
  return handle(await fetch(`${BASE}/ambassadors`, { headers: authHeaders() }));
}

export async function createAmbassador(data) {
  return handle(
    await fetch(`${BASE}/ambassadors`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(data),
    })
  );
}

// ── Events ─────────────────────────────────────────────────────
export async function getEvents() {
  return handle(await fetch(`${BASE}/events`, { headers: authHeaders() }));
}

export async function createEvent(data) {
  return handle(
    await fetch(`${BASE}/events`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(data),
    })
  );
}

// ── Submissions ────────────────────────────────────────────────
export async function getSubmissions(eventId) {
  const qs = eventId ? `?eventId=${eventId}` : "";
  return handle(await fetch(`${BASE}/submissions${qs}`, { headers: authHeaders() }));
}

// Public — no auth needed (called from audience QR page)
export async function createSubmission(data) {
  return handle(
    await fetch(`${BASE}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
  );
}

// ── File Upload ────────────────────────────────────────────────
// Uploads screenshot to PRIVATE Blob Storage via Azure Function
// Returns { sasUrl, blobPath, fileName }
// - sasUrl:   short-lived URL for immediate display after upload
// - blobPath: permanent blob identifier — this is what gets saved to Cosmos DB
export async function uploadScreenshot(file) {
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  return handle(
    await fetch(`${BASE}/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        fileData: base64,
        mimeType: file.type,
      }),
    })
  );
}

// ── View Screenshot (SAS on demand) ───────────────────────────
// Generates a fresh 30-min signed URL for a private blob
// Called when admin/ambassador clicks "View" on a submission
// Requires auth — anonymous users cannot generate view URLs
export async function getScreenshotUrl(blobPath) {
  const body = await handle(
    await fetch(`${BASE}/view-screenshot?blobPath=${encodeURIComponent(blobPath)}`, {
      headers: authHeaders(),
    })
  );
  return body.sasUrl;
}

// ── Load all app data at once (replaces initData) ──────────────
export async function loadAllData() {
  const [ambassadors, events, submissions] = await Promise.all([
    getAmbassadors().catch(() => []),
    getEvents().catch(() => []),
    getSubmissions().catch(() => []),
  ]);
  return { ambassadors, events, submissions };
}
