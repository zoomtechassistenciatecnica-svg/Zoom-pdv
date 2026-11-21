const testNames = {
  screen: "Tela / cores", touch: "Touchscreen", cameraFront: "Câmera frontal",
  cameraBack: "Câmera traseira", flash: "Flash", speaker: "Alto-falante",
  microphone: "Microfone", vibration: "Vibração", sensors: "Sensores", gps: "GPS"
};
const results = Object.fromEntries(Object.keys(testNames).map((key) => [key, { status: "pending", details: null, checked_at: null }]));
const dialog = document.getElementById("testDialog");
const content = document.getElementById("dialogContent");
const actions = document.getElementById("dialogActions");
let activeCleanup = null;

function setButtons(items) {
  actions.innerHTML = "";
  items.forEach((item) => {
    const button = document.createElement("button");
    button.className = `btn ${item.primary ? "btn-primary" : "btn-secondary"}`;
    button.textContent = item.label;
    button.onclick = item.onClick;
    actions.append(button);
  });
}
function openTest(title, html) {
  if (activeCleanup) { activeCleanup(); activeCleanup = null; }
  document.getElementById("dialogTitle").textContent = title;
  content.innerHTML = html;
  if (!dialog.open) dialog.showModal();
}
function setResult(key, status, details = null) {
  results[key] = { status, details, checked_at: new Date().toISOString() };
  updateUI();
}
function confirmResult(key, question) {
  content.insertAdjacentHTML("beforeend", `<p class="result-note">${question}</p>`);
  setButtons([
    { label: "Está funcionando", primary: true, onClick: () => { setResult(key, "approved"); dialog.close(); } },
    { label: "Apresentou falha", onClick: () => { setResult(key, "failed"); dialog.close(); } },
    { label: "Não consegui testar", onClick: () => { setResult(key, "unsupported"); dialog.close(); } }
  ]);
}
function updateUI() {
  const values = Object.values(results);
  const done = values.filter((item) => item.status !== "pending").length;
  const approved = values.filter((item) => item.status === "approved").length;
  const failed = values.filter((item) => item.status === "failed").length;
  document.getElementById("progressPercent").textContent = `${Math.round(done / values.length * 100)}%`;
  document.getElementById("progressCount").textContent = `${done} de ${values.length} testes`;
  document.getElementById("progressBar").style.width = `${done / values.length * 100}%`;
  document.getElementById("approvedCount").textContent = approved;
  document.getElementById("failedCount").textContent = failed;
  document.getElementById("pendingCount").textContent = values.length - done;
  document.querySelectorAll(".test-card").forEach((card) => {
    const result = results[card.dataset.test];
    const status = card.querySelector(".status");
    status.className = `status ${result.status}`;
    status.textContent = { pending: "Pendente", approved: "Aprovado", failed: "Reprovado", unsupported: "Não suportado" }[result.status];
  });
}

async function launch(key) {
  if (key === "screen") return runScreen(key);
  if (key === "touch") return runTouch(key);
  if (key === "cameraFront" || key === "cameraBack") return runCamera(key);
  if (key === "flash") return runFlash(key);
  if (key === "speaker") return runSpeaker(key);
  if (key === "microphone") return runMicrophone(key);
  if (key === "vibration") return runVibration(key);
  if (key === "sensors") return runSensors(key);
  if (key === "gps") return runGps(key);
}
function runScreen(key) {
  const colors = ["#ffffff", "#000000", "#ff0000", "#00c853", "#0066ff"];
  let index = 0;
  openTest(testNames[key], `<p>Observe a tela em brilho confortável e procure manchas ou pixels defeituosos.</p><div id="colorStage" class="test-pattern" style="background:${colors[0]}"></div><p id="colorLabel">Branco (1/5)</p>`);
  setButtons([{ label: "Próxima cor", primary: true, onClick: next }]);
  function next() {
    index += 1;
    if (index >= colors.length) {
      content.innerHTML = "<p>Você visualizou todas as cores. Encontrou algum defeito?</p>";
      setButtons([
        { label: "Tela normal", primary: true, onClick: () => { setResult(key, "approved", { colors_tested: colors.length }); dialog.close(); } },
        { label: "Encontrei defeito", onClick: () => { setResult(key, "failed", { colors_tested: colors.length }); dialog.close(); } }
      ]);
      return;
    }
    document.getElementById("colorStage").style.background = colors[index];
    document.getElementById("colorLabel").textContent = `${["Branco", "Preto", "Vermelho", "Verde", "Azul"][index]} (${index + 1}/5)`;
  }
}
function runTouch(key) {
  openTest(testNames[key], `<p>Toque em todas as áreas. Elas ficarão verdes quando detectadas.</p><div class="touch-board" id="touchBoard"></div><p id="touchCount">0 de 24 áreas testadas</p>`);
  const board = document.getElementById("touchBoard");
  for (let i = 0; i < 24; i += 1) {
    const cell = document.createElement("button");
    cell.className = "touch-cell";
    cell.onclick = () => { cell.classList.add("hit"); document.getElementById("touchCount").textContent = `${board.querySelectorAll(".hit").length} de 24 áreas testadas`; };
    board.append(cell);
  }
  setButtons([{ label: "Concluir teste", primary: true, onClick: () => { const hit = board.querySelectorAll(".hit").length; setResult(key, hit === 24 ? "approved" : "failed", { areas_touched: hit, total_areas: 24 }); dialog.close(); } }]);
}
async function runCamera(key) {
  const front = key === "cameraFront";
  openTest(testNames[key], `<p>Autorize o acesso à câmera e confira a imagem.</p><video id="cameraVideo" autoplay playsinline muted></video><p id="cameraHint">Solicitando permissão...</p>`);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: front ? "user" : "environment" } } });
    document.getElementById("cameraVideo").srcObject = stream;
    document.getElementById("cameraHint").textContent = "Câmera ativa.";
    activeCleanup = () => stream.getTracks().forEach((track) => track.stop());
    setButtons([
      { label: "Imagem normal", primary: true, onClick: () => { activeCleanup(); activeCleanup = null; setResult(key, "approved"); dialog.close(); } },
      { label: "Imagem com falha", onClick: () => { activeCleanup(); activeCleanup = null; setResult(key, "failed"); dialog.close(); } }
    ]);
  } catch (error) { setResult(key, "unsupported", { error: error.message }); document.getElementById("cameraHint").textContent = `Câmera indisponível: ${error.message}`; confirmResult(key, "O teste pôde ser marcado manualmente."); }
}
async function runFlash(key) {
  openTest(testNames[key], `<p>Verificando o controle de lanterna...</p><p id="flashState"></p>`);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
    const track = stream.getVideoTracks()[0];
    if (!("torch" in (track.getCapabilities?.() || {}))) throw new Error("Controle torch não disponível");
    await track.applyConstraints({ advanced: [{ torch: true }] });
    document.getElementById("flashState").textContent = "Flash ligado. Verifique a luz.";
    setButtons([
      { label: "Flash acendeu", primary: true, onClick: async () => { try { await track.applyConstraints({ advanced: [{ torch: false }] }); } catch {} stream.getTracks().forEach((item) => item.stop()); setResult(key, "approved"); dialog.close(); } },
      { label: "Não acendeu", onClick: () => { stream.getTracks().forEach((item) => item.stop()); setResult(key, "failed"); dialog.close(); } }
    ]);
  } catch (error) { setResult(key, "unsupported", { error: error.message }); document.getElementById("flashState").textContent = `Flash indisponível: ${error.message}`; setButtons([{ label: "Fechar", primary: true, onClick: () => dialog.close() }]); }
}
function runSpeaker(key) {
  openTest(testNames[key], `<p>Reproduza o som e aumente o volume.</p><button id="playTone" class="btn btn-primary">▶ Reproduzir som</button><p class="result-note">A qualidade física é confirmada pelo cliente.</p>`);
  let context;
  document.getElementById("playTone").onclick = async () => {
    context ||= new (window.AudioContext || window.webkitAudioContext)();
    await context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 700;
    gain.gain.value = 0.18;
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(); oscillator.stop(context.currentTime + 1.2);
  };
  setButtons([
    { label: "Ouvi normalmente", primary: true, onClick: () => { context?.close(); setResult(key, "approved"); dialog.close(); } },
    { label: "Não ouvi / falhou", onClick: () => { context?.close(); setResult(key, "failed"); dialog.close(); } }
  ]);
}
async function runMicrophone(key) {
  openTest(testNames[key], `<p>Autorize o microfone, grave uma frase e reproduza.</p><button id="recordMic" class="btn btn-primary">● Iniciar gravação</button><p id="micState">Aguardando permissão...</p><audio id="micPlayback" controls style="width:100%"></audio>`);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    let chunks = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => { document.getElementById("micPlayback").src = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType })); document.getElementById("micState").textContent = "Gravação concluída."; };
    document.getElementById("micState").textContent = "Microfone autorizado.";
    document.getElementById("recordMic").onclick = () => {
      if (recorder.state === "recording") { recorder.stop(); document.getElementById("recordMic").textContent = "● Gravar novamente"; }
      else { chunks = []; recorder.start(); document.getElementById("micState").textContent = "Gravando..."; document.getElementById("recordMic").textContent = "■ Parar gravação"; }
    };
    activeCleanup = () => { stream.getTracks().forEach((track) => track.stop()); if (recorder.state === "recording") recorder.stop(); };
    setButtons([
      { label: "Gravação está boa", primary: true, onClick: () => { activeCleanup(); activeCleanup = null; setResult(key, "approved"); dialog.close(); } },
      { label: "Gravação ruim", onClick: () => { activeCleanup(); activeCleanup = null; setResult(key, "failed"); dialog.close(); } }
    ]);
  } catch (error) { setResult(key, "unsupported", { error: error.message }); document.getElementById("micState").textContent = `Microfone indisponível: ${error.message}`; setButtons([{ label: "Fechar", primary: true, onClick: () => dialog.close() }]); }
}
function runVibration(key) {
  openTest(testNames[key], `<p>Envie o comando de vibração e confirme o funcionamento.</p><button id="vibrateNow" class="btn btn-primary">Vibrar agora</button><p id="vibrationState"></p>`);
  if (!navigator.vibrate) { setResult(key, "unsupported", { reason: "navigator.vibrate indisponível" }); document.getElementById("vibrationState").textContent = "Vibração não disponível neste navegador."; setButtons([{ label: "Fechar", primary: true, onClick: () => dialog.close() }]); return; }
  document.getElementById("vibrateNow").onclick = () => { navigator.vibrate([250, 100, 250]); document.getElementById("vibrationState").textContent = "Comando enviado."; };
  setButtons([
    { label: "Senti a vibração", primary: true, onClick: () => { navigator.vibrate(0); setResult(key, "approved"); dialog.close(); } },
    { label: "Não vibrou", onClick: () => { navigator.vibrate(0); setResult(key, "failed"); dialog.close(); } }
  ]);
}
function runSensors(key) {
  openTest(testNames[key], `<p>Mova e incline o aparelho.</p><p id="sensorValues">Aguardando dados...</p>`);
  let received = false;
  const motion = (event) => { received = true; const acceleration = event.accelerationIncludingGravity || {}; document.getElementById("sensorValues").textContent = `Aceleração X ${acceleration.x?.toFixed?.(2) ?? "—"} / Y ${acceleration.y?.toFixed?.(2) ?? "—"} / Z ${acceleration.z?.toFixed?.(2) ?? "—"}`; };
  const orientation = (event) => { received = true; document.getElementById("sensorValues").textContent = `Orientação α ${event.alpha?.toFixed?.(1) ?? "—"}° / β ${event.beta?.toFixed?.(1) ?? "—"}° / γ ${event.gamma?.toFixed?.(1) ?? "—"}°`; };
  window.addEventListener("devicemotion", motion); window.addEventListener("deviceorientation", orientation);
  activeCleanup = () => { window.removeEventListener("devicemotion", motion); window.removeEventListener("deviceorientation", orientation); };
  setButtons([
    { label: "Recebi dados", primary: true, onClick: () => { activeCleanup(); activeCleanup = null; setResult(key, received ? "approved" : "unsupported", { events_received: received }); dialog.close(); } },
    { label: "Não recebi dados", onClick: () => { activeCleanup(); activeCleanup = null; setResult(key, "unsupported", { reason: "Eventos não disponibilizados" }); dialog.close(); } }
  ]);
}
function runGps(key) {
  openTest(testNames[key], `<p>Permita o acesso à localização.</p><p id="gpsState">Solicitando localização...</p>`);
  if (!navigator.geolocation) { setResult(key, "unsupported"); document.getElementById("gpsState").textContent = "Geolocalização indisponível."; setButtons([{ label: "Fechar", primary: true, onClick: () => dialog.close() }]); return; }
  navigator.geolocation.getCurrentPosition((position) => {
    document.getElementById("gpsState").textContent = `Localização recebida. Precisão aproximada: ${Math.round(position.coords.accuracy)} metros.`;
    setButtons([
      { label: "Confirmar teste", primary: true, onClick: () => { setResult(key, "approved", { accuracy_m: Math.round(position.coords.accuracy) }); dialog.close(); } },
      { label: "Não funcionou", onClick: () => { setResult(key, "failed"); dialog.close(); } }
    ]);
  }, (error) => { setResult(key, "unsupported", { code: error.code, message: error.message }); document.getElementById("gpsState").textContent = `Não foi possível obter localização: ${error.message}`; setButtons([{ label: "Fechar", primary: true, onClick: () => dialog.close() }]); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
}

const individualArea = document.getElementById("individualArea");
const modePicker = document.getElementById("modePicker");
const autoOrder = Object.keys(testNames);
let automaticRunning = false;

document.getElementById("individualModeBtn").addEventListener("click", () => {
  modePicker.hidden = true;
  individualArea.hidden = false;
});
document.getElementById("backToModes").addEventListener("click", () => {
  individualArea.hidden = true;
  modePicker.hidden = false;
});
document.querySelectorAll(".test-card").forEach((card) => card.addEventListener("click", () => launch(card.dataset.test)));
document.getElementById("closeDialog").addEventListener("click", () => {
  if (activeCleanup) { activeCleanup(); activeCleanup = null; }
  dialog.close();
});
dialog.addEventListener("close", () => {
  if (activeCleanup) { activeCleanup(); activeCleanup = null; }
});
document.getElementById("resetBtn").addEventListener("click", () => {
  if (!confirm("Deseja apagar os resultados deste diagnóstico?")) return;
  Object.keys(results).forEach((key) => { results[key] = { status: "pending", details: null, checked_at: null }; });
  updateUI();
  document.getElementById("saveMessage").textContent = "";
});

function waitForDialogClose() {
  if (!dialog.open) return Promise.resolve();
  return new Promise((resolve) => dialog.addEventListener("close", resolve, { once: true }));
}
document.getElementById("autoModeBtn").addEventListener("click", async () => {
  if (automaticRunning) return;
  automaticRunning = true;
  modePicker.hidden = true;
  for (const key of autoOrder) {
    if (results[key].status !== "pending") continue;
    await launch(key);
    await waitForDialogClose();
  }
  automaticRunning = false;
  openTest("Diagnóstico concluído", "<p>Todos os testes disponíveis foram processados. Você pode revisar cada item ou enviar o relatório.</p>");
  setButtons([{ label: "Enviar diagnóstico", primary: true, onClick: () => { dialog.close(); saveReport(); } }, { label: "Revisar testes", onClick: () => { dialog.close(); individualArea.hidden = false; } }]);
});

async function deviceInfo() {
  const platform = navigator.userAgentData?.platform || navigator.platform || "Não identificado";
  const model = navigator.userAgentData?.model || "Modelo não disponibilizado pelo navegador";
  const system = navigator.userAgent.includes("Android") ? "Android" : navigator.userAgent.includes("iPhone") || navigator.userAgent.includes("iPad") ? "iOS" : "Outro sistema";
  document.getElementById("deviceInfo").textContent = `${platform} • ${model} • ${system}`;
}
document.getElementById("refreshInfo").addEventListener("click", deviceInfo);

async function saveReport() {
  const message = document.getElementById("saveMessage");
  const report = {
    results,
    device: {
      user_agent: navigator.userAgent,
      platform: navigator.userAgentData?.platform || navigator.platform || null,
      language: navigator.language,
      screen_width: screen.width,
      screen_height: screen.height
    },
    summary: {
      approved: Object.values(results).filter((item) => item.status === "approved").length,
      failed: Object.values(results).filter((item) => item.status === "failed").length,
      unsupported: Object.values(results).filter((item) => item.status === "unsupported").length,
      pending: Object.values(results).filter((item) => item.status === "pending").length
    }
  };
  const config = globalThis.ZOOMTECH_SUPABASE_CONFIG;
  if (!config?.url || !config?.anonKey || !globalThis.supabase?.createClient) {
    message.textContent = "O Supabase ainda não está configurado.";
    console.log("Relatório de diagnóstico:", report);
    return;
  }
  try {
    const url = new URL(config.url);
    const client = globalThis.supabase.createClient(url.origin, config.anonKey);
    message.textContent = "Enviando relatório...";
    const testToken = new URLSearchParams(window.location.search).get("test");
    const { error } = await client.from("hardware_diagnostics").insert({
      test_token: testToken,
      results: report.results,
      device: report.device,
      summary: report.summary
    });
    if (error) throw error;
    message.textContent = "Relatório enviado ao Supabase com sucesso.";
  } catch (error) {
    console.error("Não foi possível salvar o diagnóstico:", error);
    message.textContent = `Não foi possível salvar: ${error.message}`;
  }
}
document.getElementById("finishBtn").addEventListener("click", saveReport);

deviceInfo();
updateUI();
