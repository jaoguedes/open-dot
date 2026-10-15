/** O que fazer quando a primeira carga da API falha. */
export function apiFailureMode(hostname: string, hasData: boolean): "keep" | "unreachable" | "demo" {
  if (hasData) return "keep";
  if (hostname !== "localhost" && hostname !== "127.0.0.1") return "unreachable";
  return "demo";
}
