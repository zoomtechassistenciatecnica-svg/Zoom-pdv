"use strict";

const fs = require("node:fs");
const path = require("node:path");

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !anonKey) {
  throw new Error("Configure SUPABASE_URL e SUPABASE_ANON_KEY (ou SUPABASE_PUBLISHABLE_KEY) nas variáveis de ambiente do Netlify.");
}

let parsedUrl;
try {
  parsedUrl = new URL(url);
} catch {
  throw new Error("SUPABASE_URL não contém uma URL válida.");
}

if (parsedUrl.protocol !== "https:") {
  throw new Error("SUPABASE_URL deve usar HTTPS.");
}

if (anonKey.startsWith("sb_secret_")) {
  throw new Error("Use uma chave pública Publishable ou anon; chaves secret não podem ser enviadas ao navegador.");
}

const jwtPayload = anonKey.split(".")[1];
if (jwtPayload) {
  let claims;
  try {
    claims = JSON.parse(Buffer.from(jwtPayload, "base64url").toString("utf8"));
  } catch (error) {
    throw new Error("SUPABASE_ANON_KEY não contém uma chave pública válida.", { cause: error });
  }
  if (claims.role !== "anon") {
    throw new Error("A chave JWT deve ser a chave pública anon; chaves service_role não podem ser enviadas ao navegador.");
  }
}

const config = JSON.stringify({ url: parsedUrl.origin, anonKey });
const destination = path.join(__dirname, "..", "supabase-config.js");
fs.writeFileSync(destination, `globalThis.ZOOMTECH_SUPABASE_CONFIG = ${config};\n`, "utf8");
console.log("Configuração pública do Supabase gerada para o deploy.");
