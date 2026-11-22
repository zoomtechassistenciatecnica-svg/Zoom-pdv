import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const genericError = () => new Response(
  JSON.stringify({ error: "Identificador ou senha incorretos." }),
  { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
);
const digitsOnly = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const normalizePhone = (value: unknown) => {
  let digits = digitsOnly(value);
  if (digits.startsWith("55") && digits.length >= 12) digits = digits.slice(2);
  return digits;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const { identifier, password } = await req.json();
    if (typeof identifier !== "string" || typeof password !== "string" || password.length < 1 || password.length > 256) return genericError();
    const raw = identifier.trim();
    const digits = digitsOnly(raw);
    const cpf = digits.length === 11;
    const phone = normalizePhone(raw);
    if (!cpf && (phone.length !== 10 && phone.length !== 11)) return genericError();

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const publicKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!url || !serviceKey || !publicKey) throw new Error("Missing server configuration");

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const ipDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(forwardedFor));
    const ipHash = Array.from(new Uint8Array(ipDigest), (b) => b.toString(16).padStart(2, "0")).join("");
    const { data: allowed, error: rateError } = await admin.rpc("consume_login_identifier_attempt", {
      p_key_hash: ipHash, p_max_attempts: 10, p_window_seconds: 60,
    });
    if (rateError) throw rateError;
    if (!allowed) return new Response(JSON.stringify({ error: "Muitas tentativas. Aguarde um minuto e tente novamente." }), {
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });

    const kind = cpf ? "cpf" : "phone";
    const lookupValue = cpf ? digits : phone;
    const { data: userId, error: lookupError } = await admin.rpc("resolve_login_user_id", {
      p_identifier: lookupValue, p_kind: kind,
    });
    if (lookupError) throw lookupError;
    if (!userId) return genericError();
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
    if (userError || !userData.user || (!userData.user.email && !userData.user.phone)) return genericError();
    const matchedUser = userData.user;

    const auth = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const credentials: { email: string; password: string } | { phone: string; password: string } = matchedUser.email
      ? { email: matchedUser.email, password }
      : { phone: matchedUser.phone!, password };
    const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword(credentials);
    if (signInError || !signedIn.session) return genericError();

    return new Response(JSON.stringify({ session: signedIn.session }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("login-by-identifier failed", error);
    return genericError();
  }
});
