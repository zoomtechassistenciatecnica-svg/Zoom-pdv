-- Execute no SQL Editor do Supabase se preferir aplicar somente esta alteração.
async function createHardwareDiagnosticLink(orderId) {
  const order = state.serviceOrders.find((item) => item.id === orderId);
  if (!order) throw new Error("Ordem de serviço não encontrada.");
  if (!supabaseClient) throw new Error("A plataforma não está conectada ao Supabase.");
  const { data, error } = await supabaseClient.functions.invoke("hardware-diagnostics", {
    body: { action: "create-session", order_id: order.id }
  });
  if (error) throw error;
  if (!data?.success || !data?.token) throw new Error(data?.error || "Não foi possível gerar a sessão.");
  const url = new URL("hardware-test.html", window.location.href);
  url.searchParams.set("test", data.token);
  document.getElementById("hardware-share-link").value = url.toString();
  document.getElementById("hardware-share-qr").src =
    `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(url.toString())}`;
  document.getElementById("hardware-share-modal").showModal();
  toast(`Link seguro criado para OS-${String(order.number).padStart(4, "0")}. Válido por 24 horas.`);
}
document.getElementById("create-hardware-diagnostic").addEventListener("click", async () => {
  const orderId = document.getElementById("create-hardware-diagnostic").dataset.orderId;
  const button = document.getElementById("create-hardware-diagnostic");
  button.disabled = true;
  try { await createHardwareDiagnosticLink(orderId); }
  catch (error) { console.error(error); toast(error.message || "Falha ao gerar link de diagnóstico.", "error"); }
  finally { button.disabled = false; }
});
document.getElementById("hardware-share").addEventListener("click", () => {
  toast("Para gerar um link seguro, abra uma ordem de serviço e use 'Gerar link de diagnóstico'.", "error");
});