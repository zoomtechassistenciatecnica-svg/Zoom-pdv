"use strict";

const fs = require("node:fs");
const path = require("node:path");

const url = process.env.SUPABASE_URL;
const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !publicKey) {
  throw new Error("Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY (ou SUPABASE_ANON_KEY) nas variáveis de ambiente do Cloudflare Pages.");
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

if (publicKey.startsWith("sb_secret_")) {
  throw new Error("Use somente a chave pública Publishable ou anon. Nunca exponha uma chave secreta no navegador.");
}

const jwtPayload = publicKey.split(".")[1];
if (jwtPayload) {
  let claims;
  try {
    claims = JSON.parse(Buffer.from(jwtPayload, "base64url").toString("utf8"));
  } catch (error) {
    throw new Error("A chave anon informada não é válida.", { cause: error });
  }
  if (claims.role !== "anon") {
    throw new Error("A chave JWT precisa ter role anon; service_role não pode ser usada no navegador.");
  }
}

const config = JSON.stringify({ url: parsedUrl.origin, anonKey: publicKey });
const destination = path.join(__dirname, "..", "supabase-config.js");
fs.writeFileSync(destination, `globalThis.ZOOMTECH_SUPABASE_CONFIG = ${config};\\n`, "utf8");
console.log("Configuração pública do Supabase gerada para Cloudflare Pages.");
