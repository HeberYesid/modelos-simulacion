type ColorScheme = "light" | "dark";

const STORAGE_KEY = "boquitas-color-scheme";
const colorSchemeMeta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
const systemPreference = window.matchMedia("(prefers-color-scheme: dark)");

function isColorScheme(value: string | null): value is ColorScheme {
  return value === "light" || value === "dark";
}

function readPreference(): ColorScheme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isColorScheme(value) ? value : null;
  } catch {
    return null;
  }
}

let explicitPreference = readPreference();

function systemScheme(): ColorScheme {
  return systemPreference.matches ? "dark" : "light";
}

function renderedScheme(): ColorScheme {
  return explicitPreference ?? systemScheme();
}

function renderColorScheme(): void {
  const scheme = renderedScheme();
  if (colorSchemeMeta) colorSchemeMeta.content = explicitPreference ?? "light dark";
  themeColorMeta?.setAttribute("content", scheme === "dark" ? "#1d1724" : "#f6f5fa");
  document.querySelector<HTMLButtonElement>("[data-color-scheme-toggle]")
    ?.setAttribute("aria-pressed", String(scheme === "dark"));
}

function storePreference(preference: ColorScheme | null): void {
  try {
    if (preference) window.localStorage.setItem(STORAGE_KEY, preference);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The current page still follows the user's choice when storage is unavailable.
  }
}

function toggleColorScheme(): void {
  const next: ColorScheme = renderedScheme() === "dark" ? "light" : "dark";
  explicitPreference = next === systemScheme() ? null : next;
  storePreference(explicitPreference);
  renderColorScheme();
}

export function installColorSchemeToggle(): void {
  document.querySelector<HTMLButtonElement>("[data-color-scheme-toggle]")
    ?.addEventListener("click", toggleColorScheme);

  systemPreference.addEventListener("change", () => {
    if (explicitPreference === null) renderColorScheme();
  });

  window.addEventListener("storage", (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    explicitPreference = isColorScheme(event.newValue) ? event.newValue : null;
    renderColorScheme();
  });

  renderColorScheme();
}
