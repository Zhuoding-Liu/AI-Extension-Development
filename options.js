const STORAGE_KEY = "pageFlowAiConfig";
const DEFAULT_ENDPOINTS = {
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages"
};

const form = document.getElementById("aiForm");
const provider = document.getElementById("provider");
const endpoint = document.getElementById("endpoint");
const endpointHint = document.getElementById("endpointHint");
const model = document.getElementById("model");
const apiKey = document.getElementById("apiKey");
const status = document.getElementById("status");

function selectedProvider() {
  return provider.value === "anthropic" ? "anthropic" : "openai";
}

function updateProviderUi(resetEndpoint = false) {
  const value = selectedProvider();
  if (resetEndpoint) endpoint.value = DEFAULT_ENDPOINTS[value];

  if (value === "anthropic") {
    endpoint.placeholder = DEFAULT_ENDPOINTS.anthropic;
    endpointHint.textContent = "The official Claude Messages API endpoint is filled automatically.";
    model.placeholder = "Use a model ID available in Anthropic Console";
    apiKey.placeholder = "Anthropic API key";
  } else {
    endpoint.placeholder = DEFAULT_ENDPOINTS.openai;
    endpointHint.textContent = "You may also enter your own OpenAI-compatible proxy endpoint.";
    model.placeholder = "Use a Chat Completions-compatible model";
    apiKey.placeholder = "OpenAI or proxy API key";
  }
}

async function load() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const config = stored[STORAGE_KEY] || {};
  const usesAnthropic = config.provider === "anthropic" || (!config.provider && String(config.endpoint || "").includes("api.anthropic.com"));
  provider.value = usesAnthropic ? "anthropic" : "openai";
  endpoint.value = config.endpoint || DEFAULT_ENDPOINTS[selectedProvider()];
  model.value = config.model || "";
  apiKey.value = config.apiKey || "";
  updateProviderUi();
}

provider.addEventListener("change", () => {
  updateProviderUi(true);
  status.textContent = "";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = endpoint.value.trim();
  const providerValue = selectedProvider();

  if (url && providerValue === "anthropic" && !model.value.trim()) {
    status.textContent = "Enter a Claude model ID from Anthropic Console.";
    status.style.color = "#c34e4e";
    return;
  }

  if (url) {
    let originPattern;
    try {
      const parsed = new URL(url);
      const isLocalDevelopment = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
      if (parsed.protocol !== "https:" && !isLocalDevelopment) throw new Error("HTTPS is required");
      originPattern = `${parsed.origin}/*`;
    } catch {
      status.textContent = "Enter an HTTPS endpoint. HTTP is allowed only for localhost development.";
      status.style.color = "#c34e4e";
      return;
    }

    const granted = await chrome.permissions.request({ origins: [originPattern] });
    if (!granted) {
      status.textContent = "Permission for this API domain is required to send requests.";
      status.style.color = "#c34e4e";
      return;
    }
  }

  const previous = await chrome.storage.local.get(STORAGE_KEY);
  const previousEndpoint = previous[STORAGE_KEY]?.endpoint;
  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      provider: providerValue,
      endpoint: url,
      model: model.value.trim(),
      apiKey: apiKey.value.trim()
    }
  });
  if (previousEndpoint && previousEndpoint !== url) {
    try {
      await chrome.permissions.remove({ origins: [`${new URL(previousEndpoint).origin}/*`] });
    } catch {
      // Ignore stale or invalid legacy endpoint permissions.
    }
  }

  const providerName = providerValue === "anthropic" ? "Anthropic Claude" : "OpenAI-compatible";
  status.textContent = url
    ? `${providerName} configuration saved. AI is ready to use.`
    : "Saved. Local rules will remain active.";
  status.style.color = "#3f8a63";
});

document.getElementById("clear").addEventListener("click", async () => {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const previousEndpoint = stored[STORAGE_KEY]?.endpoint;
  provider.value = "openai";
  endpoint.value = "";
  model.value = "";
  apiKey.value = "";
  updateProviderUi();
  await chrome.storage.local.set({
    [STORAGE_KEY]: { provider: "openai", endpoint: "", model: "", apiKey: "" }
  });
  if (previousEndpoint) {
    try {
      await chrome.permissions.remove({ origins: [`${new URL(previousEndpoint).origin}/*`] });
    } catch {
      // Ignore stale or invalid legacy endpoint permissions.
    }
  }
  status.textContent = "AI configuration cleared.";
  status.style.color = "#3f8a63";
});

load();
