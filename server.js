const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "lanparty-admin";
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const DATA_PATH = path.join(DATA_DIR, "store.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

ensureDataFile();

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = requestUrl.pathname;

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

  if (req.method === "GET" && pathname === "/api/healthz") {
    return sendJson(res, 200, { ok: true });
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

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
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
