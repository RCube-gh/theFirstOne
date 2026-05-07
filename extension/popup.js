const ARCHIVE_IS_HOSTS = [
  "archive.is",
  "archive.today",
  "archive.ph",
  "archive.vn",
  "archive.fo",
  "archive.li",
  "archive.md"
];

const extApi = globalThis.browser ?? globalThis.chrome;

const services = [
  {
    id: "wayback",
    name: "Wayback Machine",
    description: "Checks the Internet Archive availability API.",
    enabled: true,
    check: checkWayback
  },
  {
    id: "archiveis",
    name: "archive.is family",
    description: "Checks archive.today-style snapshots through the newest endpoint.",
    enabled: true,
    check: checkArchiveIsFamily
  },
  {
    id: "permacc",
    name: "Perma.cc",
    description: "Checks public Perma.cc archives for a matching preserved URL.",
    enabled: true,
    check: checkPermaCc
  }
];

const serviceElements = new Map();

const urlInput = document.querySelector("#url-input");
const useCurrentButton = document.querySelector("#use-current-button");
const scanButton = document.querySelector("#scan-button");
const summaryElement = document.querySelector("#summary");
const scanStateElement = document.querySelector("#scan-state");
const serviceListElement = document.querySelector("#service-list");
const rowTemplate = document.querySelector("#service-row-template");
const defaultScanButtonLabel = scanButton.textContent;

init();

async function init() {
  renderServiceRows();
  await fillCurrentTabUrl();

  useCurrentButton.addEventListener("click", fillCurrentTabUrl);
  scanButton.addEventListener("click", onScanClick);
}

function renderServiceRows() {
  for (const service of services) {
    const fragment = rowTemplate.content.cloneNode(true);
    const row = fragment.querySelector(".service-row");
    const toggle = fragment.querySelector(".service-toggle");
    const name = fragment.querySelector(".service-name");
    const tooltip = fragment.querySelector(".service-tooltip");
    const info = fragment.querySelector(".service-info");
    const status = fragment.querySelector(".service-status");
    const link = fragment.querySelector(".service-link");

    toggle.checked = service.enabled;
    toggle.addEventListener("change", () => {
      service.enabled = toggle.checked;
      updateSummaryIdle();
    });

    name.textContent = service.name;
    tooltip.textContent = service.description;
    info.setAttribute("title", service.description);

    serviceElements.set(service.id, {row, toggle, status, link});
    setServiceStatus(service.id, {
      status: "idle",
      detail: "Ready"
    });

    serviceListElement.append(fragment);
  }
}

async function fillCurrentTabUrl() {
  const tab = await getActiveTab();
  if (tab?.url && isSupportedUrl(tab.url)) {
    urlInput.value = tab.url;
    updateSummaryIdle();
    return;
  }

  summaryElement.textContent = "Open a normal web page, then scan from here.";
}

async function getActiveTab() {
  if (!extApi?.tabs?.query) {
    return null;
  }

  const tabs = await extApi.tabs.query({active: true, currentWindow: true});
  return tabs?.[0] ?? null;
}

function updateSummaryIdle() {
  const enabledCount = services.filter(service => service.enabled).length;
  summaryElement.textContent =
    enabledCount > 0
      ? `${enabledCount} service${enabledCount === 1 ? "" : "s"} selected.`
      : "Select at least one archive service.";
}

async function onScanClick() {
  const targetUrl = normalizeInputUrl(urlInput.value);
  if (!targetUrl) {
    summaryElement.textContent = "Enter a valid http(s) URL first.";
    urlInput.focus();
    return;
  }

  const activeServices = services.filter(service => service.enabled);
  if (!activeServices.length) {
    summaryElement.textContent = "Select at least one archive service.";
    return;
  }

  summaryElement.textContent = "Scanning selected services...";
  scanStateElement.textContent = "Scanning";
  scanButton.disabled = true;
  scanButton.textContent = "Scanning...";

  for (const service of activeServices) {
    setServiceStatus(service.id, {
      status: "checking",
      detail: "Checking..."
    });
  }

  for (const service of services.filter(service => !service.enabled)) {
    setServiceStatus(service.id, {
      status: "idle",
      detail: "Skipped"
    });
  }

  const results = await Promise.all(
    activeServices.map(service => runServiceCheck(service, targetUrl))
  );

  let foundCount = 0;
  let missingCount = 0;
  let errorCount = 0;

  for (const result of results) {
    setServiceStatus(result.serviceId, result);

    if (result.status === "found") {
      foundCount += 1;
    } else if (result.status === "not_found") {
      missingCount += 1;
    } else if (result.status === "error") {
      errorCount += 1;
    }
  }

  if (foundCount > 0) {
    summaryElement.textContent = `${foundCount} archive service${foundCount === 1 ? "" : "s"} found a preserved copy.`;
  } else if (missingCount === activeServices.length) {
    summaryElement.textContent = "No archive found in the selected services. You may be The First One.";
  } else {
    summaryElement.textContent = `Scan finished with ${errorCount} error${errorCount === 1 ? "" : "s"}.`;
  }

  scanStateElement.textContent = "Done";
  scanButton.disabled = false;
  scanButton.textContent = defaultScanButtonLabel;
}

async function runServiceCheck(service, targetUrl) {
  try {
    return await service.check(targetUrl);
  } catch (error) {
    return {
      serviceId: service.id,
      status: "error",
      detail: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

function setServiceStatus(serviceId, result) {
  const elements = serviceElements.get(serviceId);
  if (!elements) {
    return;
  }

  const {status, link} = elements;
  const textMap = {
    idle: result.detail ?? "Ready",
    checking: result.detail ?? "Checking...",
    found: result.detail ?? "Found",
    not_found: result.detail ?? "Not found",
    error: result.detail ?? "Error"
  };

  status.className = "service-status";
  status.classList.add(`status-${result.status}`);
  status.textContent = "";
  status.setAttribute("title", textMap[result.status] ?? result.status);
  status.setAttribute("aria-label", textMap[result.status] ?? result.status);

  if (result.archiveUrl) {
    link.href = result.archiveUrl;
    link.style.display = "inline";
  } else {
    link.removeAttribute("href");
    link.style.display = "none";
  }
}

function normalizeInputUrl(value) {
  const trimmed = value.trim();
  if (!isSupportedUrl(trimmed)) {
    return null;
  }

  const url = new URL(trimmed);
  url.hash = "";
  return url.toString();
}

function isSupportedUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function checkWayback(targetUrl) {
  const endpoint = `https://archive.org/wayback/available?url=${encodeURIComponent(targetUrl)}`;
  const response = await fetch(endpoint, {
    method: "GET"
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  const closest = data?.archived_snapshots?.closest;

  if (closest?.available && closest.url) {
    return {
      serviceId: "wayback",
      status: "found",
      archiveUrl: closest.url,
      detail: "Found"
    };
  }

  return {
    serviceId: "wayback",
    status: "not_found",
    detail: "Not found"
  };
}

async function checkPermaCc(targetUrl) {
  const endpoint =
    `https://api.perma.cc/v1/public/archives/?format=json&limit=1&url=${encodeURIComponent(targetUrl)}`;
  const response = await fetch(endpoint, {
    method: "GET"
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  const match = data?.objects?.[0];

  if (match?.guid) {
    return {
      serviceId: "permacc",
      status: "found",
      archiveUrl: `https://perma.cc/${match.guid}`,
      detail: "Found"
    };
  }

  return {
    serviceId: "permacc",
    status: "not_found",
    detail: "Not found"
  };
}

async function checkArchiveIsFamily(targetUrl) {
  for (const host of ARCHIVE_IS_HOSTS) {
    const endpoint = `https://${host}/newest/${targetUrl}`;
    const response = await fetch(endpoint, {
      method: "GET",
      redirect: "follow"
    });

    if (!response.ok) {
      continue;
    }

    if (looksLikeArchiveIsSnapshot(response.url)) {
      return {
        serviceId: "archiveis",
        status: "found",
        archiveUrl: response.url,
        detail: `Found on ${host}`
      };
    }
  }

  return {
    serviceId: "archiveis",
    status: "not_found",
    detail: "Not found"
  };
}

function looksLikeArchiveIsSnapshot(url) {
  try {
    const parsed = new URL(url);
    return (
      ARCHIVE_IS_HOSTS.includes(parsed.hostname) &&
      parsed.pathname.startsWith("/newest/") === false &&
      parsed.pathname !== "/"
    );
  } catch {
    return false;
  }
}
