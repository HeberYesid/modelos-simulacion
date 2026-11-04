export type ServiceStatus = "checking" | "ok" | "error";

export function isPublicDemo(): boolean {
  return import.meta.env.VITE_PUBLIC_DEMO === "true";
}

export function serviceName(): string {
  return isPublicDemo() ? "servicio de demostración pública" : "servicio local";
}

export function serviceReference(): string {
  return `el ${serviceName()}`;
}

export function serviceStatusMessage(status: ServiceStatus): string {
  const title = serviceName().replace(/^./, (letter) => letter.toUpperCase());
  if (status === "checking") return `Comprobando ${serviceName()}…`;
  if (status === "ok") return `${title} disponible`;
  return `${title} sin conexión`;
}

export function processingDisclosure(): string {
  if (isPublicDemo()) {
    return "Demostración pública · visitas medidas y escenarios exploratorios sin calibrar; las simulaciones y los archivos importados se procesan en el servidor.";
  }
  return "Procesamiento local · sin envío externo";
}
