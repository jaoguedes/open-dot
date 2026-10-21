// SPDX-License-Identifier: AGPL-3.0-only
// Gera uma chave de cifra para TOKEN_KEYS. Ela vai direto para o cofre de segredos,
// nunca para o Git, chat ou print.
//   npm run secrets:keygen            → imprime "v1:<base64>"
//   npm run secrets:keygen -- v2      → para rotação (coloque a nova primeiro: "v2:...,v1:...")
import { randomBytes } from "node:crypto";
const ver = process.argv[2] ?? "v1";
if (!/^v\d+$/.test(ver)) throw new Error("versão deve ser v1, v2…");
process.stdout.write(`${ver}:${randomBytes(32).toString("base64")}\n`);
