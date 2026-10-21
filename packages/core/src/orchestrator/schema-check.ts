// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Validador do subconjunto de JSON Schema usado pelos agentes (type, enum, required,
 * additionalProperties, properties, items, min/maxItems, maxLength, pattern). Recusa o que não entende:
 * um esquema com palavra-chave desconhecida falha fechado em vez de aceitar qualquer saída.
 */
type Schema = Record<string, unknown>;
const KNOWN = new Set(["type", "enum", "required", "additionalProperties", "properties", "items", "minItems", "maxItems", "maxLength", "minLength", "pattern"]);

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (Number.isInteger(v)) return "integer";
  return typeof v;
}

export function checkSchema(value: unknown, schema: Schema, path = "$", errors: string[] = []): string[] {
  if (errors.length >= 20) return errors;
  for (const k of Object.keys(schema)) if (!KNOWN.has(k)) return [...errors, `${path}: palavra-chave de esquema não suportada (${k})`];
  const t = schema.type;
  if (t !== undefined) {
    const types = Array.isArray(t) ? t : [t];
    const actual = typeOf(value);
    if (!types.some((x) => x === actual || (x === "number" && actual === "integer"))) {
      errors.push(`${path}: esperado ${types.join("|")}, veio ${actual}`);
      return errors;
    }
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value as never)) errors.push(`${path}: valor fora da lista`);
  if (typeof value === "string") {
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) errors.push(`${path}: texto acima de ${schema.maxLength}`);
    if (typeof schema.minLength === "number" && value.length < schema.minLength) errors.push(`${path}: texto abaixo de ${schema.minLength}`);
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: formato inválido`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) errors.push(`${path}: mais de ${schema.maxItems} itens`);
    if (typeof schema.minItems === "number" && value.length < schema.minItems) errors.push(`${path}: menos de ${schema.minItems} itens`);
    if (schema.items && typeof schema.items === "object") value.forEach((v, i) => checkSchema(v, schema.items as Schema, `${path}[${i}]`, errors));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const props = (schema.properties ?? {}) as Record<string, Schema>;
    for (const r of (schema.required as string[] | undefined) ?? []) if (!(r in obj)) errors.push(`${path}.${r}: obrigatório`);
    for (const [k, v] of Object.entries(obj)) {
      if (props[k]) checkSchema(v, props[k], `${path}.${k}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${path}.${k}: campo não permitido`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") checkSchema(v, schema.additionalProperties as Schema, `${path}.${k}`, errors);
    }
  }
  return errors;
}
