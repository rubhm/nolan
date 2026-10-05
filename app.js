let adminUnlocked = false;
let adminPassword = "";
let state = null;

const el = {
  eventSummary: byId("event-summary"),
  registrationStatus: byId("registration-status"),
  registrationForm: byId("registration-form"),
  registrationMessage: byId("registration-message"),
  regName: byId("reg-name"),
  regContact: byId("reg-contact"),
  regSeatType: byId("reg-seat-type"),
  localSeats: byId("local-seats"),
  remoteSeats: byId("remote-seats"),
  scheduleList: byId("schedule-list"),
  updatesList: byId("updates-list"),
  attendeesList: byId("attendees-list"),
  faqList: byId("faq-list"),
  openAdminBtn: byId("open-admin-btn"),
  closeAdminBtn: byId("close-admin-btn"),
  adminOverlay: byId("admin-overlay"),
  adminPanel: byId("admin-panel"),
  adminLogin: byId("admin-login"),
  adminPassword: byId("admin-password"),
  adminLoginBtn: byId("admin-login-btn"),
  adminForm: byId("admin-form"),
  adminRegistrationOpen: byId("admin-registration-open"),
  adminLocalCapacity: byId("admin-local-capacity"),
  adminRemoteCapacity: byId("admin-remote-capacity"),
  adminSchedule: byId("admin-schedule"),
  adminUpdates: byId("admin-updates"),
  adminFaq: byId("admin-faq"),
  adminClearRegistrations: byId("admin-clear-registrations"),
  adminMessage: byId("admin-message"),
};

wireHandlers();
initialize();

async function initialize() {
  await refreshState();
}

function wireHandlers() {
  el.openAdminBtn.addEventListener("click", () => {
    openAdminPanel();
  });

  el.closeAdminBtn.addEventListener("click", () => {
    closeAdminPanel();
  });

  el.adminOverlay.addEventListener("click", () => {
    closeAdminPanel();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAdminPanel();
    }
  });

  el.registrationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFeedback(el.registrationMessage);

    const name = el.regName.value.trim();
    const contact = el.regContact.value.trim();
    const seatType = el.regSeatType.value;

    if (!name) {
      return setError(el.registrationMessage, "Please enter your name.");
    }
    if (!isSeatType(seatType)) {
      return setError(el.registrationMessage, "Invalid attendance type.");
    }

    try {
      const response = await api("/api/register", {
        method: "POST",
        body: { name, contact, seatType },
      });
      state = response.state;
      render();
      el.registrationForm.reset();
      setOk(el.registrationMessage, response.message || "Spot reserved.");
    } catch (error) {
      setError(el.registrationMessage, error.message);
    }
  });

  el.adminLoginBtn.addEventListener("click", async () => {
    clearFeedback(el.adminMessage);
    const password = el.adminPassword.value;
    if (!password) {
      return setError(el.adminMessage, "Please enter the admin password.");
    }
    try {
      await api("/api/admin/verify", {
        method: "POST",
        adminPassword: password,
      });
      adminPassword = password;
      adminUnlocked = true;
      el.adminLogin.classList.add("hidden");
      el.adminForm.classList.remove("hidden");
      fillAdminForm();
      setOk(el.adminMessage, "Admin mode unlocked.");
    } catch (error) {
      setError(el.adminMessage, error.message);
    }
  });

  el.adminForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFeedback(el.adminMessage);

    const payload = {
      registrationOpen: el.adminRegistrationOpen.checked,
      capacities: {
        local: toNonNegativeInt(el.adminLocalCapacity.value),
        remote: toNonNegativeInt(el.adminRemoteCapacity.value),
      },
      schedule: parseLines(el.adminSchedule.value),
      updates: parseLines(el.adminUpdates.value),
      faq: parseFaqLines(el.adminFaq.value),
    };

    try {
      const response = await api("/api/content", {
        method: "PUT",
        adminPassword,
        body: payload,
      });
      state = response.state;
      render();
      setOk(el.adminMessage, response.message || "Content saved.");
    } catch (error) {
      setError(el.adminMessage, error.message);
    }
  });

  el.adminClearRegistrations.addEventListener("click", async () => {
    clearFeedback(el.adminMessage);
    if (!confirm("Clear all registrations?")) {
      return;
    }
    try {
      const response = await api("/api/registrations", {
        method: "DELETE",
        adminPassword,
      });
      state = response.state;
      render();
      setOk(el.adminMessage, response.message || "All registrations cleared.");
    } catch (error) {
      setError(el.adminMessage, error.message);
    }
  });

  el.attendeesList.addEventListener("click", async (event) => {
    if (!adminUnlocked) {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    const id = target.dataset.id;
    if (!id) {
      return;
    }
    try {
      const response = await api(`/api/registrations/${encodeURIComponent(id)}`, {
        method: "DELETE",
        adminPassword,
      });
      state = response.state;
      render();
      setOk(el.adminMessage, response.message || "Registration removed.");
    } catch (error) {
      setError(el.adminMessage, error.message);
    }
  });
}

async function refreshState() {
  try {
    const response = await api("/api/state");
    state = response.state;
    render();
  } catch (error) {
    setError(el.registrationMessage, `Failed to load data: ${error.message}`);
  }
}

function render() {
  if (!state) {
    return;
  }
  renderSummary();
  renderRegistrationStatus();
  renderAvailability();
  renderList(el.scheduleList, state.content.schedule);
  renderList(el.updatesList, state.content.updates);
  renderFaq();
  renderAttendees();
  if (adminUnlocked) {
    fillAdminForm();
  }
}

function renderSummary() {
  const content = state.content;
  const total = content.capacities.local + content.capacities.remote;
  el.eventSummary.textContent = `${content.eventDate} • ${content.locationModel} • ${content.expectedAttendees} expected • ${total} seats (${content.capacities.local} local / ${content.capacities.remote} remote)`;
}

function renderRegistrationStatus() {
  if (!state.content.registrationOpen) {
    el.registrationStatus.textContent = "Registration is currently closed.";
    return;
  }
  el.registrationStatus.textContent = `Open now — Local left: ${remainingSeats("local")}, Remote-capable left: ${remainingSeats("remote")}.`;
}

function renderAvailability() {
  const caps = state.content.capacities;
  const totalCap = caps.local + caps.remote;
  el.localSeats.textContent = `${remainingSeats("local")} left / ${caps.local}`;
  el.remoteSeats.textContent = `${remainingSeats("remote")} left / ${totalCap}`;
}

function renderList(listEl, items) {
  listEl.textContent = "";
  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No entries yet.";
    listEl.appendChild(empty);
    return;
  }
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = String(item);
    listEl.appendChild(li);
  });
}

function renderFaq() {
  el.faqList.textContent = "";
  const faq = state.content.faq;
  if (!Array.isArray(faq) || faq.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No FAQ entries yet.";
    el.faqList.appendChild(empty);
    return;
  }
  faq.forEach((item) => {
    const block = document.createElement("div");
    const q = document.createElement("strong");
    q.textContent = item.question;
    const a = document.createElement("p");
    a.textContent = item.answer;
    a.className = "muted";
    block.appendChild(q);
    block.appendChild(a);
    el.faqList.appendChild(block);
  });
}

function renderAttendees() {
  el.attendeesList.textContent = "";
  const registrations = state.registrations;
  if (!Array.isArray(registrations) || registrations.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No registrations yet.";
    el.attendeesList.appendChild(empty);
    return;
  }
  registrations.forEach((entry) => {
    const li = document.createElement("li");
    const contact = entry.contact ? ` (${entry.contact})` : "";
    li.textContent = `${entry.name}${contact} — ${entry.seatType}`;
    if (adminUnlocked) {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "ghost";
      removeButton.dataset.id = entry.id;
      removeButton.textContent = "Remove";
      li.appendChild(document.createTextNode(" "));
      li.appendChild(removeButton);
    }
    el.attendeesList.appendChild(li);
  });
}

function fillAdminForm() {
  const content = state.content;
  el.adminRegistrationOpen.checked = content.registrationOpen;
  el.adminLocalCapacity.value = String(content.capacities.local);
  el.adminRemoteCapacity.value = String(content.capacities.remote);
  el.adminSchedule.value = content.schedule.join("\n");
  el.adminUpdates.value = content.updates.join("\n");
  el.adminFaq.value = content.faq
    .map((item) => `${item.question} | ${item.answer}`)
    .join("\n");
}

function remainingSeats(seatType) {
  const caps = state.content.capacities;
  const localUsed = state.registrations.filter((entry) => entry.seatType === "local").length;
  const totalUsed = state.registrations.length;
  if (seatType === "local") {
    return Math.max(0, caps.local - localUsed);
  }
  if (seatType === "remote") {
    return Math.max(0, caps.local + caps.remote - totalUsed);
  }
  return 0;
}

function parseLines(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseFaqLines(value) {
  return parseLines(value).map((line) => {
    const [questionPart, ...answerParts] = line.split("|");
    return {
      question: (questionPart || "").trim(),
      answer: answerParts.join("|").trim(),
    };
  });
}

function toNonNegativeInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) || n < 0 ? 0 : n;
}

function isSeatType(value) {
  return value === "local" || value === "remote";
}

async function api(path, options = {}) {
  const headers = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.adminPassword) {
    headers["x-admin-password"] = options.adminPassword;
  }

  const response = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Server returned a non-JSON response.");
  }

  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }
  return payload;
}

function byId(id) {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing element #${id}`);
  }
  return node;
}

function setOk(node, message) {
  node.textContent = message;
  node.className = "feedback ok";
}

function setError(node, message) {
  node.textContent = message;
  node.className = "feedback error";
}

function clearFeedback(node) {
  node.textContent = "";
  node.className = "feedback";
}

function openAdminPanel() {
  el.adminOverlay.classList.remove("hidden");
  el.adminPanel.classList.remove("hidden");
}

function closeAdminPanel() {
  el.adminOverlay.classList.add("hidden");
  el.adminPanel.classList.add("hidden");
}
