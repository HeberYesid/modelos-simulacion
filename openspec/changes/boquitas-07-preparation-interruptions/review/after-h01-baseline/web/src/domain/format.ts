import {
  MAX_OBSERVATION_BYTES,
  MAX_SAVED_RESULT_BYTES,
  OBSERVATION_TOO_LARGE_MESSAGE,
  SAVED_FILE_TOO_LARGE_MESSAGE,
} from "./file-limits";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "No disponible";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: digits }).format(value);
}

function formatMillisecondRemainder(milliseconds: number): string {
  return milliseconds === 0 ? "" : `.${String(milliseconds).padStart(3, "0").replace(/0+$/, "")}`;
}

export function formatSeconds(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "No disponible";
  const safeValue = Math.max(0, value);
  const totalMilliseconds = Math.round(safeValue * 1_000);
  const wholeSeconds = Math.floor(totalMilliseconds / 1_000);
  const milliseconds = totalMilliseconds % 1_000;
  const hours = Math.floor(wholeSeconds / 3_600);
  const minutes = Math.floor((wholeSeconds % 3_600) / 60);
  const seconds = wholeSeconds % 60;
  const secondText = `${String(seconds).padStart(2, "0")}${formatMillisecondRemainder(milliseconds)}`;
  const clock = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${secondText}`;
  return hours >= 24 ? `${clock} (+${Math.floor(hours / 24)} día${hours >= 48 ? "s" : ""})` : clock;
}

export function formatClockFromOpening(openingTime: string, offsetSeconds: number): string {
  const [hours = 0, minutes = 0, seconds = 0] = openingTime.split(":").map(Number);
  const totalMilliseconds = Math.round((hours * 3_600 + minutes * 60 + seconds + Math.max(0, offsetSeconds)) * 1_000);
  const day = Math.floor(totalMilliseconds / 86_400_000);
  const withinDayMilliseconds = totalMilliseconds % 86_400_000;
  const wholeSeconds = Math.floor(withinDayMilliseconds / 1_000);
  const h = Math.floor(wholeSeconds / 3_600);
  const m = Math.floor((wholeSeconds % 3_600) / 60);
  const s = wholeSeconds % 60;
  const milliseconds = withinDayMilliseconds % 1_000;
  const secondText = `${String(s).padStart(2, "0")}${formatMillisecondRemainder(milliseconds)}`;
  const clock = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${secondText}`;
  return day === 0 ? clock : `${clock} (+${day} día${day === 1 ? "" : "s"})`;
}

export function safeFileName(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || "boquitas";
}

export function downloadText(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadBytes(filename: string, content: ArrayBuffer, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function readFileText(file: File, maximumBytes = MAX_OBSERVATION_BYTES): Promise<string> {
  if (file.size > maximumBytes) {
    return Promise.reject(new Error(OBSERVATION_TOO_LARGE_MESSAGE));
  }
  return file.text();
}

export async function readExactJsonFile(file: File, maximumBytes = MAX_SAVED_RESULT_BYTES): Promise<{
  bytes: ArrayBuffer;
  text: string;
}> {
  if (file.size > maximumBytes) throw new Error(SAVED_FILE_TOO_LARGE_MESSAGE);
  const bytes = await file.arrayBuffer();
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("El archivo JSON no está codificado en UTF-8. El resultado anterior se conserva; guarda una copia compatible para continuar.");
  }
  assertSafeJsonIntegerTokens(text);
  return { bytes, text };
}

export function assertSafeJsonIntegerTokens(text: string): void {
  for (let index = 0; index < text.length;) {
    if (text[index] === '"') {
      index += 1;
      while (index < text.length) {
        if (text[index] === "\\") {
          index += 2;
          continue;
        }
        if (text[index] === '"') {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }
    if (text[index] !== "-" && !/[0-9]/.test(text[index] ?? "")) {
      index += 1;
      continue;
    }

    const start = index;
    if (text[index] === "-") index += 1;
    if (text[index] === "0") {
      index += 1;
    } else {
      while (/[0-9]/.test(text[index] ?? "")) index += 1;
    }
    let isPlainInteger = true;
    if (text[index] === ".") {
      isPlainInteger = false;
      index += 1;
      while (/[0-9]/.test(text[index] ?? "")) index += 1;
    }
    if (text[index] === "e" || text[index] === "E") {
      isPlainInteger = false;
      index += 1;
      if (text[index] === "+" || text[index] === "-") index += 1;
      while (/[0-9]/.test(text[index] ?? "")) index += 1;
    }
    const token = text.slice(start, index);
    if (isPlainInteger && !Number.isSafeInteger(Number(token))) {
      throw new Error("El archivo contiene un número entero que esta interfaz no puede conservar con exactitud. Revisa el JSON sin abrirlo aquí; se conservarán los resultados que ya estaban cargados.");
    }
    if (index === start) index += 1;
  }
}
