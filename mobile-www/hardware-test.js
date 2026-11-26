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
let detectedDeviceInfo = null;

async function enterFullScreen() {
  const fullscreenElement = document.documentElement;
  if (!document.fullscreenElement && fullscreenElement.requestFullscreen) {
    try {
      await fullscreenElement.requestFullscreen();
    } catch (error) {
      console.warn("Não foi possível entrar em tela cheia:", error);
    }
  }
}
function exitFullScreen() {
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

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
  enterFullScreen();
  openTest(testNames[key], `<div class="fullscreen-screen-test" id="screenTestStage"><div id="colorStage" class="test-pattern" style="background:${colors[0]}"></div><div class="screen-test-overlay"><strong id="colorLabel">Branco (1/5)</strong><button id="nextColorButton" type="button">Próxima cor</button></div></div>`);
  dialog.classList.add("samsung-fullscreen-dialog");
  setButtons([{ label: "Próxima cor", primary: true, onClick: next }]);
  document.getElementById("nextColorButton").onclick = next;
  function next() {
    index += 1;
    if (index >= colors.length) {
      dialog.classList.remove("samsung-fullscreen-dialog");
      content.innerHTML = "<p>Você visualizou todas as cores. Encontrou algum defeito?</p>";
      setButtons([
        { label: "Aprovar: cores normais", primary: true, onClick: () => { setResult(key, "approved", { colors_tested: colors.length, method: "manual_visual_check" }); dialog.close(); } },
        { label: "Reprovar: encontrei defeito", onClick: () => { setResult(key, "failed", { colors_tested: colors.length, method: "manual_visual_check" }); dialog.close(); } }
      ]);
      return;
    }
    document.getElementById("colorStage").style.background = colors[index];
    document.getElementById("colorLabel").textContent = `${["Branco", "Preto", "Vermelho", "Verde", "Azul"][index]} (${index + 1}/5)`;
  }
}
function runTouch(key) {
  enterFullScreen();
  openTest(testNames[key], `<canvas class="samsung-touch-test" id="samsungTouchTest" aria-label="Teste de toque da tela"></canvas>`);
  dialog.classList.add("samsung-touch-dialog");
  setButtons([]);
  const board = document.getElementById("samsungTouchTest");
  const context = board.getContext("2d");
  const points = [];
  const strokes = [];
  let drawing = false;
  let activeStroke = null;
  let completedTimer = null;

  const resizeAndDraw = () => {
    const rect = board.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    board.width = Math.round(rect.width * ratio);
    board.height = Math.round(rect.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    points.length = 0;

    const width = rect.width;
    const height = rect.height;
    const unit = Math.max(7, Math.min(9, width / 28));
    const size = Math.max(12, Math.min(18, width / 14));
    const side = Math.max(10, unit * 1.15);
    const top = Math.max(7, unit * 0.85);
    const bottom = height - top;
    const left = side;
    const right = width - side;

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#b8bfc7";
    context.lineWidth = 1;

    const addPoint = (x, y) => {
      points.push({ x, y, touched: false, size });
    };

    for (let x = left + unit; x < right - unit / 2; x += unit) {
      addPoint(x, top);
      addPoint(x, bottom);
    }
    for (let y = top + unit; y < bottom - unit / 2; y += unit) {
      addPoint(left, y);
      addPoint(right, y);
    }

    for (let i = 0; i <= 38; i += 1) {
      const progress = i / 38;
      addPoint(left + (right - left) * progress, top + (bottom - top) * progress);
      addPoint(right - (right - left) * progress, top + (bottom - top) * progress);
    }

    drawBoard();
  };

  const drawBoard = () => {
    const rect = board.getBoundingClientRect();
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, rect.width, rect.height);


    context.strokeStyle = "#b8bfc7";
    context.lineWidth = 1;
    points.forEach((point) => {
      if (point.touched) {
        context.fillStyle = "#00FF00";
        context.fillRect(point.x - point.size / 2, point.y - point.size / 2, point.size, point.size);
        context.strokeStyle = "#00FF00";
        context.strokeRect(point.x - point.size / 2, point.y - point.size / 2, point.size, point.size);
      } else {
        context.strokeRect(point.x - point.size / 2, point.y - point.size / 2, point.size, point.size);
      }
      context.strokeStyle = "#b8bfc7";
    });

    strokes.forEach((stroke) => {
      if (stroke.points.length < 2) return;
      context.beginPath();
      context.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i += 1) context.lineTo(stroke.points[i].x, stroke.points[i].y);
      context.strokeStyle = stroke.color;
      context.lineWidth = Math.max(1.5, board.getBoundingClientRect().width / 170);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.stroke();
    });
  };

  const getCanvasPoint = (event) => {
    const rect = board.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const markTouchedPoints = (point) => {
    points.forEach((target) => {
      if (target.touched) return;
      const distance = Math.hypot(point.x - target.x, point.y - target.y);
      if (distance <= Math.max(10, target.size * 2.2)) target.touched = true;
    });
    drawBoard();

    const touched = points.filter((target) => target.touched).length;
    if (touched === points.length && !completedTimer) {
      completedTimer = window.setTimeout(() => {
        dialog.classList.remove("samsung-touch-dialog");
        setResult(key, "approved", { points_tested: points.length, points_touched: touched, method: "trace de toque da tela" });
        dialog.close();
      }, 350);
    }
  };

  board.addEventListener("pointerdown", (event) => {
    drawing = true;
    board.setPointerCapture?.(event.pointerId);
    activeStroke = { color: strokes.length === 0 ? "#ef2b32" : "#00FF00", points: [] };
    strokes.push(activeStroke);
    const point = getCanvasPoint(event);
    activeStroke.points.push(point);
    markTouchedPoints(point);
  });
  board.addEventListener("pointermove", (event) => {
    if (!drawing || !activeStroke) return;
    const point = getCanvasPoint(event);
    activeStroke.points.push(point);
    markTouchedPoints(point);
  });
  board.addEventListener("pointerup", () => {
    drawing = false;
    activeStroke = null;
  });
  board.addEventListener("pointercancel", () => {
    drawing = false;
    activeStroke = null;
  });
  board.addEventListener("contextmenu", (event) => event.preventDefault());

  const resizeObserver = new ResizeObserver(resizeAndDraw);
  resizeObserver.observe(board);
  resizeAndDraw();

  activeCleanup = () => {
    resizeObserver.disconnect();
    if (completedTimer) window.clearTimeout(completedTimer);
    completedTimer = null;
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  };
}
async function runCamera(key) {
  const front = key === "cameraFront";
  enterFullScreen();
  openTest(testNames[key], `<p>Confira a imagem e escolha uma opção abaixo.</p><video id="cameraVideo" autoplay playsinline muted></video><p id="cameraHint">Solicitando permissão...</p>`);
  dialog.classList.add("camera-fullscreen-dialog");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: front ? "user" : "environment" } } });
    document.getElementById("cameraVideo").srcObject = stream;
    document.getElementById("cameraHint").textContent = "Câmera ativa.";
    activeCleanup = () => stream.getTracks().forEach((track) => track.stop());
    const stopCamera = () => {
      if (activeCleanup) activeCleanup();
      activeCleanup = null;
    };
    setButtons([
      { label: "Aprovar: imagem normal", primary: true, onClick: () => { stopCamera(); setResult(key, "approved", { method: "manual_visual_check" }); dialog.close(); } },
      { label: "Reprovar: imagem com falha", onClick: () => { stopCamera(); setResult(key, "failed", { method: "manual_visual_check" }); dialog.close(); } },
      { label: "Não consegui testar", onClick: () => { stopCamera(); setResult(key, "unsupported", { method: "manual" }); dialog.close(); } }
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
  dialog.classList.remove("samsung-touch-dialog");
  dialog.classList.remove("samsung-fullscreen-dialog");
  dialog.classList.remove("camera-fullscreen-dialog");
  exitFullScreen();
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

function inferDeviceBrand(model) {
  const rules = [
    [/^(SM-|GT-|SCH-|SHV-|SAMSUNG)/i, "Samsung"],
    [/^(PIXEL|GOOGLE)/i, "Google"],
    [/^(REDMI|POCO|XIAOMI)/i, "Xiaomi"],
    [/^(MOTO|XT\d|MOTOROLA)/i, "Motorola"],
    [/^(HUAWEI|HONOR)/i, "Huawei"],
    [/^(OPPO|CPH\d)/i, "OPPO"],
    [/^(ONEPLUS|ONE PLUS)/i, "OnePlus"],
    [/^VIVO/i, "vivo"],
    [/^REALME/i, "realme"],
    [/^(ASUS|ZENFONE|ROG)/i, "ASUS"],
    [/^(SONY|XPERIA)/i, "Sony"],
    [/^(NOKIA|HMD)/i, "HMD Global"],
    [/^LG[-\s]/i, "LG"]
  ];
  return rules.find(([pattern]) => pattern.test(model))?.[1] || "";
}

function getBrowserName(brands, userAgent) {
  const knownBrand = brands?.find(({ brand }) => /Google Chrome|Microsoft Edge|Opera|Brave/i.test(brand));
  if (knownBrand) return knownBrand.brand;
  const chromium = brands?.find(({ brand }) => /Chromium/i.test(brand));
  if (chromium) return chromium.brand;
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) return "Safari";
  return "Não identificado";
}

function renderDeviceInfo(device) {
  const details = [
    `Marca: ${device.brand}`,
    `Modelo: ${device.model}`,
    `Sistema: ${device.system}${device.system_version ? ` ${device.system_version}` : ""}`,
    `Navegador: ${device.browser}`,
    `Tela: ${device.screen_width} × ${device.screen_height}`
  ];
  document.getElementById("deviceInfo").textContent = details.join(" • ");
}

async function deviceInfo() {
  const ua = navigator.userAgent;
  const userAgentData = navigator.userAgentData;
  let highEntropy = {};
  if (userAgentData?.getHighEntropyValues) {
    try {
      highEntropy = await userAgentData.getHighEntropyValues(["model", "platformVersion"]);
    } catch (error) {
      console.warn("Não foi possível obter dados detalhados do aparelho:", error);
    }
  }
  const androidMatch = ua.match(/;\s*([^;)]+)\s*Build\//i);
  const appleMatch = ua.match(/(iPhone|iPad)[^;)]*/i);
  const hintedModel = typeof highEntropy.model === "string" ? highEntropy.model.trim() : "";
  const system = /Android/i.test(ua) || /^Android$/i.test(userAgentData?.platform || "")
    ? "Android"
    : /iPhone|iPad/i.test(ua)
      ? "iOS"
      : "Outro sistema";
  const model = androidMatch?.[1]?.trim() || appleMatch?.[0]?.trim() || hintedModel || "Modelo não identificado";
  const inferredBrand = system === "iOS" ? "Apple" : inferDeviceBrand(model) || "Não identificada";
  const androidVersion = ua.match(/Android[\s/-]([\d.]+)/i)?.[1];
  const iosVersion = ua.match(/OS ([\d_]+) like Mac OS X/i)?.[1]?.replace(/_/g, ".");
  const systemVersion = system === "Android" || system === "iOS"
    ? (highEntropy.platformVersion || androidVersion || iosVersion || "").replace(/(\.0)+$/, "")
    : "";
  const platform = userAgentData?.platform || navigator.platform || "Não identificado";
  const browser = getBrowserName(userAgentData?.brands, ua);
  detectedDeviceInfo = {
    brand: inferredBrand,
    manufacturer: inferredBrand === "Não identificada" ? "" : inferredBrand,
    model,
    system,
    system_version: systemVersion,
    platform,
    browser,
    screen_width: screen.width,
    screen_height: screen.height,
    ...manualDeviceInfo
  };
  renderDeviceInfo(detectedDeviceInfo);
}
document.getElementById("refreshInfo").addEventListener("click", deviceInfo);
let manualDeviceInfo = {};
document.getElementById("editDeviceInfo").addEventListener("click", () => {
  const form = document.getElementById("deviceCorrectionForm");
  form.hidden = !form.hidden;
  if (!form.hidden) {
    document.getElementById("deviceBrandInput").value = detectedDeviceInfo?.brand === "Não identificada" ? "" : detectedDeviceInfo?.brand || "";
    document.getElementById("deviceModelInput").value = detectedDeviceInfo?.model === "Modelo não identificado" ? "" : detectedDeviceInfo?.model || "";
    document.getElementById("deviceSystemVersionInput").value = detectedDeviceInfo?.system_version || "";
  }
});
document.getElementById("deviceCorrectionForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const brandInput = document.getElementById("deviceBrandInput").value.trim();
  const modelInput = document.getElementById("deviceModelInput").value.trim();
  const brand = brandInput || inferDeviceBrand(modelInput) || "Não identificada";
  manualDeviceInfo = {
    brand,
    manufacturer: brand === "Não identificada" ? "" : brand,
    model: modelInput || "Modelo não identificado",
    system_version: document.getElementById("deviceSystemVersionInput").value.trim()
  };
  detectedDeviceInfo = { ...detectedDeviceInfo, ...manualDeviceInfo };
  renderDeviceInfo(detectedDeviceInfo);
  document.getElementById("deviceCorrectionForm").hidden = true;
});
document.getElementById("resetDeviceInfo").addEventListener("click", () => {
  manualDeviceInfo = {};
  deviceInfo();
  document.getElementById("deviceCorrectionForm").hidden = true;
});

async function saveReport() {
  const message = document.getElementById("saveMessage");
  const report = {
    results: JSON.parse(JSON.stringify(results)),
    device: {
      ...detectedDeviceInfo,
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
  const testToken = new URLSearchParams(window.location.search).get("test");
  if (!testToken) {
    message.textContent = "Este diagnóstico não está vinculado a uma ordem de serviço. Solicite um novo link ao técnico.";
    return;
  }
  if (!config?.url || !config?.anonKey || !globalThis.supabase?.createClient) {
    message.textContent = "O serviço de diagnóstico ainda não está configurado.";
    return;
  }
  try {
    const client = globalThis.supabase.createClient(config.url, config.anonKey);
    message.textContent = "Enviando relatório seguro para a ordem de serviço...";
    const { data, error } = await client.functions.invoke("hardware-diagnostics", {
      body: { action: "submit", token: testToken, report }
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || "O servidor não confirmou o recebimento.");
    message.textContent = `Relatório enviado e vinculado à OS-${String(data.order_number).padStart(4, "0")}.`;
    document.getElementById("finishBtn").disabled = true;
  } catch (error) {
    console.error("Não foi possível salvar o diagnóstico:", error);
    message.textContent = `Não foi possível enviar: ${error.message || "erro de comunicação"}`;
  }
}
document.getElementById("finishBtn").addEventListener("click", saveReport);

const tokenFromUrl = new URLSearchParams(location.search).get("test");
const tokenEntry = document.getElementById("tokenEntry");
if (!tokenFromUrl) {
  tokenEntry.hidden = false;
  ["progressPercent", "progressCount", "progressBar", "approvedCount", "failedCount", "pendingCount"].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.closest(".summary")?.setAttribute("hidden", "");
  });
  document.querySelectorAll(".device, .mode-picker, .actions").forEach((element) => element.hidden = true);
  document.getElementById("activateDiagnosticToken").addEventListener("click", () => {
    const token = document.getElementById("diagnosticTokenInput").value.trim().toLowerCase();
    const message = document.getElementById("tokenEntryMessage");
    if (!/^[a-f0-9]{64}$/.test(token)) { message.textContent = "Código inválido. Confira o link enviado pelo técnico."; return; }
    location.search = `?test=${encodeURIComponent(token)}`;
  });
} else if (tokenEntry) {
  tokenEntry.hidden = true;
}
const orderContext = document.getElementById("orderContext");
if (orderContext) orderContext.textContent = tokenFromUrl ? "Sessão vinculada à ordem de serviço · envio único · validade de 24 horas" : "Aguardando código da ordem de serviço";
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch((error) => console.warn("PWA indisponível:", error)));
}
deviceInfo();
updateUI();
