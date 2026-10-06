const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "lanparty-admin";
const SITE_PASSWORD = process.env.SITE_PASSWORD || "";
const SITE_ACCESS_COOKIE = "nolan_site_access";
const SITE_ACCESS_MAX_AGE = 60 * 60 * 24 * 7;
const SITE_ACCESS_TOKEN = SITE_PASSWORD ? createSiteAccessToken(SITE_PASSWORD) : "";
const ROOT_DIR = __dirname;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT_DIR, "data");
const DATA_PATH = path.join(DATA_DIR, "store.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

try {
  ensureDataFile();
} catch (error) {
  console.error(
    `Failed to initialize data store at "${DATA_PATH}". Ensure DATA_DIR points to a writable directory.`
  );
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = requestUrl.pathname;

    if (pathname === "/api/healthz") {
      return sendJson(res, 200, { ok: true });
    }

    if (SITE_PASSWORD) {
      if (req.method === "GET" && pathname === "/access") {
        return renderAccessPage(res, false);
      }
      if (req.method === "POST" && pathname === "/access") {
        return handleAccessLogin(req, res);
      }
      if (req.method === "POST" && pathname === "/logout") {
        return handleAccessLogout(res);
      }
      if (!hasSiteAccess(req)) {
        if (pathname.startsWith("/api/")) {
          return sendJson(res, 401, { error: "Site password required." });
        }
        return redirect(res, "/access");
      }
    }

    if (pathname.startsWith("/api/")) {
      return handleApi(req, res, pathname);
    }
    return handleStatic(res, pathname);
  } catch (error) {
    return sendJson(res, 500, { error: "Internal server error." });
  }
});

server.listen(PORT, () => {
  console.log(`LAN party site running on http://localhost:${PORT}`);
});

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/state") {
    return sendJson(res, 200, { state: loadStore() });
  }

  if (req.method === "POST" && pathname === "/api/register") {
    const body = await readJsonBody(req, res);
    if (!body) {
      return;
    }

    const name = String(body.name || "").trim();
    const contact = String(body.contact || "").trim();
    const seatType = String(body.seatType || "").trim();

    if (!name) {
      return sendJson(res, 400, { error: "Name is required." });
    }
    if (seatType !== "local" && seatType !== "remote") {
      return sendJson(res, 400, { error: "Seat type must be local or remote." });
    }

    const store = loadStore();
    if (!store.content.registrationOpen) {
      return sendJson(res, 409, { error: "Registration is currently closed." });
    }

    const usage = seatUsage(store);
    if (seatType === "local") {
      if (usage.localUsed >= usage.localCap) {
        return sendJson(res, 409, { error: "No local seats are available." });
      }
      if (usage.totalUsed >= usage.totalCap) {
        return sendJson(res, 409, { error: "No seats are available." });
      }
    }
    if (seatType === "remote" && usage.totalUsed >= usage.totalCap) {
      return sendJson(res, 409, { error: "No seats are available." });
    }

    store.registrations.push({
      id: randomUUID(),
      name,
      contact,
      seatType,
      createdAt: new Date().toISOString(),
    });
    saveStore(store);

    return sendJson(res, 201, { state: store, message: "Spot reserved." });
  }

  if (req.method === "POST" && pathname === "/api/admin/verify") {
    if (!isAdmin(req)) {
      return sendJson(res, 401, { error: "Invalid admin password." });
    }
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "PUT" && pathname === "/api/content") {
    if (!isAdmin(req)) {
      return sendJson(res, 401, { error: "Invalid admin password." });
    }

    const body = await readJsonBody(req, res);
    if (!body) {
      return;
    }

    const store = loadStore();
    const nextContent = sanitizeContentInput(body, store);
    if (nextContent.error) {
      return sendJson(res, 400, { error: nextContent.error });
    }

    store.content = nextContent.value;
    saveStore(store);
    return sendJson(res, 200, { state: store, message: "Content saved." });
  }

  if (req.method === "DELETE" && pathname === "/api/registrations") {
    if (!isAdmin(req)) {
      return sendJson(res, 401, { error: "Invalid admin password." });
    }
    const store = loadStore();
    store.registrations = [];
    saveStore(store);
    return sendJson(res, 200, { state: store, message: "All registrations cleared." });
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/registrations/")) {
    if (!isAdmin(req)) {
      return sendJson(res, 401, { error: "Invalid admin password." });
    }

    const id = pathname.split("/").pop();
    const store = loadStore();
    const before = store.registrations.length;
    store.registrations = store.registrations.filter((entry) => entry.id !== id);
    if (store.registrations.length === before) {
      return sendJson(res, 404, { error: "Registration not found." });
    }
    saveStore(store);
    return sendJson(res, 200, { state: store, message: "Registration removed." });
  }

  if (req.method === "PATCH" && pathname.startsWith("/api/registrations/")) {
    if (!isAdmin(req)) {
      return sendJson(res, 401, { error: "Invalid admin password." });
    }

    const body = await readJsonBody(req, res);
    if (!body) {
      return;
    }
    const seatType = String(body.seatType || "").trim();
    if (seatType !== "local" && seatType !== "remote") {
      return sendJson(res, 400, { error: "Seat type must be local or remote." });
    }

    const id = pathname.split("/").pop();
    const store = loadStore();
    const entry = store.registrations.find((item) => item.id === id);
    if (!entry) {
      return sendJson(res, 404, { error: "Registration not found." });
    }

    if (entry.seatType === seatType) {
      return sendJson(res, 200, { state: store, message: "Seat assignment already set." });
    }

    if (seatType === "local") {
      const usage = seatUsage(store);
      if (usage.localUsed >= usage.localCap) {
        return sendJson(res, 409, { error: "No local seats are available." });
      }
    }

    entry.seatType = seatType;
    saveStore(store);
    return sendJson(res, 200, { state: store, message: "Seat assignment updated." });
  }

  return sendJson(res, 404, { error: "Not found." });
}

function sanitizeContentInput(input, store) {
  const base = store.content;
  const registrationOpen = Boolean(input.registrationOpen);
  const local = toNonNegativeInt(input.capacities?.local);
  const remote = toNonNegativeInt(input.capacities?.remote);

  const localUsed = store.registrations.filter((entry) => entry.seatType === "local").length;
  const totalUsed = store.registrations.length;

  if (local < localUsed) {
    return {
      error: `Local capacity can't be less than current local registrations (${localUsed}).`,
    };
  }
  if (local + remote < totalUsed) {
    return {
      error: `Total capacity can't be less than current registrations (${totalUsed}).`,
    };
  }

  const schedule = sanitizeStringArray(input.schedule);
  const updates = sanitizeStringArray(input.updates);
  const faq = sanitizeFaqArray(input.faq);
  if (!faq.ok) {
    return { error: faq.error };
  }

  return {
    value: {
      ...base,
      registrationOpen,
      capacities: { local, remote },
      schedule,
      updates,
      faq: faq.value,
    },
  };
}

function sanitizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function sanitizeFaqArray(value) {
  if (!Array.isArray(value)) {
    return { ok: true, value: [] };
  }
  const out = [];
  for (const item of value) {
    const question = String(item?.question || "").trim();
    const answer = String(item?.answer || "").trim();
    if (!question || !answer) {
      return { ok: false, error: "Each FAQ entry needs both question and answer." };
    }
    out.push({ question, answer });
  }
  return { ok: true, value: out };
}

function seatUsage(store) {
  const localCap = store.content.capacities.local;
  const remoteCap = store.content.capacities.remote;
  const totalCap = localCap + remoteCap;
  const localUsed = store.registrations.filter((entry) => entry.seatType === "local").length;
  const totalUsed = store.registrations.length;
  return { localCap, remoteCap, totalCap, localUsed, totalUsed };
}

function isAdmin(req) {
  return req.headers["x-admin-password"] === ADMIN_PASSWORD;
}

function handleStatic(res, pathname) {
  let filePath = pathname;
  if (filePath === "/") {
    filePath = "/index.html";
  }

  const fullPath = path.join(ROOT_DIR, filePath);
  if (!fullPath.startsWith(ROOT_DIR)) {
    return sendJson(res, 403, { error: "Forbidden." });
  }

  fs.readFile(fullPath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        return sendJson(res, 404, { error: "Not found." });
      }
      return sendJson(res, 500, { error: "Failed to read file." });
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(content);
  });
}

function readJsonBody(req, res) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        sendJson(res, 413, { error: "Payload too large." });
        req.destroy();
        resolve(null);
      }
    });
    req.on("end", () => {
      if (!raw) {
        return resolve({});
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body." });
        resolve(null);
      }
    });
    req.on("error", () => {
      sendJson(res, 400, { error: "Failed to read request body." });
      resolve(null);
    });
  });
}

function readUrlEncodedBody(req, res) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 100_000) {
        sendJson(res, 413, { error: "Payload too large." });
        req.destroy();
        resolve(null);
      }
    });
    req.on("end", () => {
      resolve(new URLSearchParams(raw));
    });
    req.on("error", () => {
      sendJson(res, 400, { error: "Failed to read request body." });
      resolve(null);
    });
  });
}

async function handleAccessLogin(req, res) {
  const body = await readUrlEncodedBody(req, res);
  if (!body) {
    return;
  }
  const password = String(body.get("password") || "");
  if (password !== SITE_PASSWORD) {
    return renderAccessPage(res, true);
  }
  res.writeHead(302, {
    Location: "/",
    "Set-Cookie": `${SITE_ACCESS_COOKIE}=${SITE_ACCESS_TOKEN}; Max-Age=${SITE_ACCESS_MAX_AGE}; Path=/; HttpOnly; SameSite=Lax`,
  });
  res.end();
}

function handleAccessLogout(res) {
  res.writeHead(302, {
    Location: "/access",
    "Set-Cookie": `${SITE_ACCESS_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`,
  });
  res.end();
}

function renderAccessPage(res, showError) {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Nolan LAN Party Access</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: radial-gradient(circle at 20% -10%, #223a8f, transparent 45%), #070b1d;
        color: #e8f5ff;
        font-family: "Trebuchet MS", Arial, sans-serif;
      }
      .card {
        width: min(420px, 92vw);
        background: rgba(12, 19, 48, 0.92);
        border: 1px solid rgba(110, 176, 255, 0.5);
        border-radius: 14px;
        padding: 1rem;
      }
      h1 {
        margin: 0 0 0.4rem;
        font-size: 1.2rem;
      }
      p {
        color: #b7c9ff;
      }
      input, button {
        width: 100%;
        box-sizing: border-box;
        margin-top: 0.55rem;
        padding: 0.6rem 0.7rem;
        border-radius: 10px;
        border: 1px solid rgba(127, 183, 255, 0.5);
        font: inherit;
      }
      input {
        color: #e8f5ff;
        background: #0d1435;
      }
      button {
        background: #58f3ff;
        color: #0b1227;
        border: 0;
        font-weight: 700;
        cursor: pointer;
      }
      .error {
        color: #ff8aa5;
        min-height: 1.2em;
      }
    </style>
  </head>
  <body>
    <form class="card" method="post" action="/access">
      <h1>LAN Party Access</h1>
      <p>Enter the shared site password to continue.</p>
      <input type="password" name="password" placeholder="Site password" required />
      <button type="submit">Enter site</button>
      <p class="error">${showError ? "Wrong password. Try again." : ""}</p>
    </form>
  </body>
</html>`;
  res.writeHead(showError ? 401 : 200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function hasSiteAccess(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  return cookies[SITE_ACCESS_COOKIE] === SITE_ACCESS_TOKEN;
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) {
    return {};
  }
  return cookieHeader.split(";").reduce((acc, part) => {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) {
      return acc;
    }
    acc[rawName] = rawValue.join("=");
    return acc;
  }, {});
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function createSiteAccessToken(password) {
  return createHash("sha256").update(password).digest("hex").slice(0, 32);
}

function toNonNegativeInt(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isNaN(n) || n < 0 ? 0 : n;
}

function loadStore() {
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeStore(parsed);
  } catch {
    const store = defaultStore();
    saveStore(store);
    return store;
  }
}

function saveStore(store) {
  fs.writeFileSync(DATA_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function ensureDataFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_PATH)) {
    saveStore(defaultStore());
  }
}

function normalizeStore(store) {
  const fallback = defaultStore();
  const normalized = {
    content: {
      ...fallback.content,
      ...(store?.content || {}),
      capacities: {
        ...fallback.content.capacities,
        ...(store?.content?.capacities || {}),
      },
      schedule: Array.isArray(store?.content?.schedule)
        ? store.content.schedule.map((item) => String(item))
        : fallback.content.schedule,
      updates: Array.isArray(store?.content?.updates)
        ? store.content.updates.map((item) => String(item))
        : fallback.content.updates,
      faq: Array.isArray(store?.content?.faq)
        ? store.content.faq
            .map((item) => ({
              question: String(item?.question || "").trim(),
              answer: String(item?.answer || "").trim(),
            }))
            .filter((item) => item.question && item.answer)
        : fallback.content.faq,
    },
    registrations: Array.isArray(store?.registrations)
      ? store.registrations
          .filter(
            (entry) =>
              entry &&
              typeof entry.id === "string" &&
              typeof entry.name === "string" &&
              typeof entry.contact === "string" &&
              (entry.seatType === "local" || entry.seatType === "remote")
          )
          .map((entry) => ({
            id: entry.id,
            name: entry.name.trim(),
            contact: entry.contact.trim(),
            seatType: entry.seatType,
            createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString(),
          }))
      : [],
  };
  return normalized;
}

function defaultStore() {
  return {
    content: {
      eventName: "Nolan LAN Party",
      eventDate: "7 November 2026",
      locationModel: "My house OR remote",
      expectedAttendees: "8-10",
      registrationOpen: true,
      capacities: { local: 7, remote: 3 },
      schedule: [
        "10:00 - Arrivals + Setup",
        "12:00 - CSS: Random Map Rotation (Zombie/Warcraft/Surf/Defuse/Hostage/...)",
        "14:00 - CSS: MR12 Matches (de_train, de_nuke, de_dust2)",
        "16:00 - Among Us",
        "18:00 - WC3: Custom Game (TBD)",
        "19:00 - WC3: LegionTD (version TBD)",
        "20:00 - WC3: The Crucible or Dustwallow Keys",
        "22:00 - Free Play",
        "00:00 - The End",
      ],
      updates: ["Welcome! Registrations are open."],
      faq: [
        {
          question: "Can I join remotely?",
          answer: "Yes. Remote registrations can use remote seats and any unused local seats.",
        },
        {
          question: "How many local seats are there?",
          answer: "7 local seats. Hard limit.",
        },
      ],
    },
    registrations: [],
  };
}
