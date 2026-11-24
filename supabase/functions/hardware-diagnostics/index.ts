import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
const randomToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return hex(bytes);
};
const validStatuses = new Set(["pending", "approved", "failed", "unsupported"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!url || !serviceKey || !anonKey) throw new Error("Configuração do Supabase incompleta.");
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json();
    if (body?.action === "create-session") {
      const bearer = req.headers.get("Authorization") ?? "";
      const jwt = bearer.replace(/^Bearer\s+/i, "");
      if (!jwt) return json({ error: "Autenticação necessária." }, 401);
      const { data: authData, error: authError } = await admin.auth.getUser(jwt);
      if (authError || !authData.user) return json({ error: "Sessão de técnico inválida." }, 401);
      let claims: Record<string, unknown> = {};
      try { claims = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch { return json({ error: "Token de autenticação inválido." }, 401); }
      if (claims.sub !== authData.user.id || claims.aal !== "aal2") return json({ error: "É necessário concluir a verificação MFA da plataforma antes de gerar o link." }, 403);
      const { data: access } = await admin.from("pdv_user_access").select("user_id").eq("user_id", authData.user.id).maybeSingle();
      if (!access) return json({ error: "Usuário sem autorização para acessar a plataforma." }, 403);
      const orderId = String(body.order_id ?? "").trim();
      if (!orderId || orderId.length > 128) return json({ error: "Ordem de serviço inválida." }, 400);
      const { data: store, error: storeError } = await admin.from("pdv_data").select("data").eq("id", "main-store").single();
      if (storeError) throw storeError;
      const orders = Array.isArray(store.data?.serviceOrders) ? store.data.serviceOrders : [];
      const order = orders.find((item: Record<string, unknown>) => String(item.id) === orderId);
      if (!order) return json({ error: "A ordem informada não existe na plataforma." }, 404);
      const token = randomToken();
      const { error: insertError } = await admin.from("hardware_diagnostic_sessions").insert({
        token_hash: await sha256(token), order_id: orderId,
        order_number: Number(order.number) || null, technician_id: authData.user.id,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      if (insertError) throw insertError;
      return json({ success: true, token, order_number: Number(order.number) || null, expires_in_hours: 24 });
    }
    if (body?.action === "submit") {
      const token = String(body.token ?? "");
      const report = body.report;
      if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: "Link de diagnóstico inválido." }, 400);
      if (!report || typeof report !== "object" || !report.results || !report.device || !report.summary) return json({ error: "Relatório incompleto." }, 400);
      const serialized = JSON.stringify(report);
      if (serialized.length > 250_000) return json({ error: "Relatório excede o tamanho permitido." }, 413);
      const resultEntries = Object.entries(report.results as Record<string, { status?: string }>);
      if (resultEntries.length > 60 || resultEntries.some(([, item]) => !item || !validStatuses.has(String(item.status)))) {
        return json({ error: "Resultados do diagnóstico inválidos." }, 400);
      }
      const hash = await sha256(token);
      const { data: session, error: sessionError } = await admin.from("hardware_diagnostic_sessions")
        .select("id,order_id,order_number,technician_id,expires_at,used_at")
        .eq("token_hash", hash).maybeSingle();
      if (sessionError) throw sessionError;
      if (!session || session.used_at || new Date(session.expires_at).getTime() <= Date.now()) {
        return json({ error: "Este link expirou ou já foi utilizado. Solicite um novo link ao técnico." }, 410);
      }
      const { data: claimed, error: claimError } = await admin.from("hardware_diagnostic_sessions")
        .update({ used_at: new Date().toISOString() }).eq("id", session.id).is("used_at", null)
        .gt("expires_at", new Date().toISOString()).select("id").maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) return json({ error: "Este link já foi utilizado ou expirou." }, 410);
      const { data: saved, error: saveError } = await admin.from("hardware_diagnostics").insert({
        order_id: session.order_id, order_number: session.order_number,
        technician_id: session.technician_id, results: report.results,
        device: report.device, summary: report.summary,
      }).select("id,created_at").single();
      if (saveError) throw saveError;
      return json({ success: true, diagnostic_id: saved.id, order_number: session.order_number });
    }
    return json({ error: "Ação não reconhecida." }, 400);
  } catch (error) {
    console.error("hardware-diagnostics:", error);
    return json({ error: error instanceof Error ? error.message : "Erro interno." }, 500);
  }
});
