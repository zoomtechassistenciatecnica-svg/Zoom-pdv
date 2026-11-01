"use strict";

const DATABASE_ROW_ID = "main-store";
const PAYMENT_METHODS = ["Pix", "Cartão de crédito", "Cartão de débito", "Dinheiro", "Boleto"];
const COLORS = ["#087eff", "#18b8ff", "#67d8ff", "#41e984", "#0758d1"];
const PRODUCT_EMOJIS = ["📱", "🔋", "🔌", "🛠️", "🛡️", "📦", "⚡", "🔧"];
const SERVICE_ORDER_STATUSES = ["Recebida", "Em análise", "Em diagnóstico", "Aguardando aprovação", "Aprovada", "Aguardando peça", "Em reparo", "Pronta", "Concluída", "Entregue", "Cancelada"];
const FILM_COMPATIBILITY_ROWS = globalThis.FILM_COMPATIBILITY_DATA;
if (!Array.isArray(FILM_COMPATIBILITY_ROWS) || FILM_COMPATIBILITY_ROWS.some((row) => !row || typeof row.brand !== "string" || !Array.isArray(row.models) || !row.models.length)) {
  throw new Error("A tabela de compatibilidade de películas não foi carregada corretamente.");
}
const today = new Date();
const dateKey = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const dateTimeLocalValue = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const isValidCpf = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const calculateDigit = (length) => {
    const sum = Array.from(digits.slice(0, length), (digit, index) => Number(digit) * (length + 1 - index)).reduce((total, value) => total + value, 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return calculateDigit(9) === Number(digits[9]) && calculateDigit(10) === Number(digits[10]);
};
const normalizeSearchText = (value) => String(value ?? "").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const formatCpf = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d{1,2})$/, "$1.$2.$3-$4");
};
const initials = (name) => String(name || "CF").trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
const formatDate = (date) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`)).replace(".", "");
const seedData = () => {
  return { products: [], customers: [], sales: [], serviceOrders: [], nextSaleNumber: 1, nextServiceOrderNumber: 1 };
};
let state = seedData();
let supabaseClient = null;
let saveTimer = null;
let saveQueue = Promise.resolve();
let databaseVersion = null;
let databaseWriteBlocked = false;
let cart = [];
let currentPage = "dashboard";
let selectedProductId = null;
let selectedQuantity = 1;
let receivedAmount = null;
let toastTimer;
let productImagePromise = Promise.resolve();
let serviceOrderPattern = [];
let customerCepRequestId = 0;

function queueStateSave(snapshot) {
  if (databaseWriteBlocked) return;
  saveQueue = saveQueue
    .then(async () => {
      if (databaseWriteBlocked) return;
      const { data, error } = await supabaseClient
        .from("pdv_data")
        .update({ data: snapshot, version: databaseVersion + 1 })
        .eq("id", DATABASE_ROW_ID)
        .eq("version", databaseVersion)
        .select("version")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        databaseWriteBlocked = true;
        toast("Os dados mudaram em outra sessão. Recarregue a página antes de continuar.", "error");
        return;
      }
      databaseVersion = data.version;
    })
    .catch((error) => {
      console.error("Não foi possível salvar os dados no banco:", error);
      databaseWriteBlocked = true;
      toast("Não foi possível sincronizar. Recarregue a página para evitar sobrescrever dados.", "error");
    });
}
function saveState() {
  if (!supabaseClient || !document.body.classList.contains("is-authenticated")) return;
  const snapshot = JSON.parse(JSON.stringify(state));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => queueStateSave(snapshot), 400);
}
function flushStateSave() {
  clearTimeout(saveTimer);
  if (supabaseClient && document.body.classList.contains("is-authenticated")) {
    queueStateSave(JSON.parse(JSON.stringify(state)));
  }
  return saveQueue;
}
function toast(message, type = "success") {
  const region = document.getElementById("toast-region");
  const item = document.createElement("div");
  item.className = `toast${type === "error" ? " error" : ""}`;
  item.textContent = message;
  region.append(item);
  setTimeout(() => item.remove(), 3400);
}
function setPage(name) {
  const page = document.getElementById(`page-${name}`);
  if (!page) return;
  currentPage = name;
  document.querySelector(".app-shell").classList.toggle("sales-mode", name === "sales");
  document.querySelectorAll(".page").forEach((item) => item.classList.toggle("active", item === page));
  document.querySelectorAll(".nav-link").forEach((item) => item.classList.toggle("active", item.dataset.page === name));
  document.getElementById("breadcrumb-current").textContent = { dashboard: "Visão geral", sales: "Vendas", "service-orders": "Ordens de serviço", products: "Estoque", "film-compatibility": "Compatibilidade de películas", customers: "Clientes", reports: "Relatórios" }[name];
  document.getElementById("sidebar").classList.remove("open");
  if (name === "dashboard") renderDashboard();
  if (name === "sales") renderSales();
  if (name === "service-orders") renderServiceOrders();
  if (name === "products") renderProducts();
  if (name === "film-compatibility") renderFilmCompatibility();
  if (name === "customers") renderCustomers();
  if (name === "reports") renderReports();
}
function renderSalesHeader() {
  const now = new Date();
  document.getElementById("sales-datetime").textContent = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(now);
  document.getElementById("sales-clock").textContent = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now);
}
function saleDate(sale) {
  return new Date(sale.date);
}
function salesInRange(sales, days) {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days + 1);
  return sales.filter((sale) => saleDate(sale) >= start && saleDate(sale) <= new Date(today.getTime() + 86400000));
}
function setTodayLabel() {
  document.getElementById("today-label").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(today).replace(".", "");
  const date = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(today);
  document.querySelector("#page-dashboard .eyebrow").textContent = date.toLocaleUpperCase("pt-BR");
}
function renderDashboard() {
  const todaySales = state.sales.filter((sale) => dateKey(saleDate(sale)) === dateKey(today));
  const total = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  const lowStock = state.products.filter((product) => product.kind !== "service" && product.stock <= 5);
  document.getElementById("today-sales").textContent = money(total);
  document.getElementById("today-orders").textContent = String(todaySales.length);
  document.getElementById("average-ticket").textContent = money(todaySales.length ? total / todaySales.length : 0);
  document.getElementById("stock-count").textContent = String(state.products.filter((product) => product.kind !== "service").reduce((sum, product) => sum + product.stock, 0));
  document.getElementById("low-stock-count").textContent = `${lowStock.length} ${lowStock.length === 1 ? "item" : "itens"}`;
  const previous = state.sales.filter((sale) => dateKey(saleDate(sale)) === dateKey(new Date(today.getTime() - 86400000))).reduce((sum, sale) => sum + sale.total, 0);
  const change = previous ? ((total - previous) / previous) * 100 : 0;
  document.getElementById("sales-change").textContent = `${change >= 0 ? "↑" : "↓"} ${Math.abs(change).toFixed(0)}%`;
  document.getElementById("sales-change").className = `trend ${change >= 0 ? "positive" : "warning"}`;
  document.getElementById("orders-foot").textContent = todaySales.length === 1 ? "Venda registrada hoje" : "Vendas registradas hoje";
  renderRecentSales();
  renderLowStock(lowStock);
  renderChart();
  renderPayments();
}
function customerCell(name, email = "") {
  return `<div class="customer-cell"><span class="customer-avatar">${escapeHTML(initials(name))}</span><span><strong class="customer-name">${escapeHTML(name)}</strong>${email ? `<small class="customer-email">${escapeHTML(email)}</small>` : ""}</span></div>`;
}
function renderRecentSales() {
  const recent = [...state.sales].sort((a, b) => saleDate(b) - saleDate(a)).slice(0, 5);
  document.getElementById("recent-sales-body").innerHTML = recent.length ? recent.map((sale) => `<tr><td>${customerCell(sale.customerName)}</td><td>${escapeHTML(formatDate(dateKey(saleDate(sale))))}</td><td>${escapeHTML(sale.payment)}</td><td><strong>${money(sale.total)}</strong></td><td><span class="status-pill status-success">Concluída</span></td></tr>`).join("") : `<tr><td colspan="5"><div class="empty-state">Nenhuma venda registrada.</div></td></tr>`;
}
function renderLowStock(products = state.products.filter((product) => product.kind !== "service" && product.stock <= 5)) {
  const list = [...products].sort((a, b) => a.stock - b.stock).slice(0, 4);
  document.getElementById("low-stock-list").innerHTML = list.length ? list.map((product) => `<div class="low-stock-item"><span class="product-thumb">${escapeHTML(product.emoji || "📦")}</span><span class="low-stock-info"><strong>${escapeHTML(product.name)}</strong><small>${escapeHTML(product.category)}</small></span><span class="stock-qty">${product.stock} un.</span></div>`).join("") : `<div class="empty-state"><strong>Estoque em dia!</strong>Nenhum produto com estoque baixo.</div>`;
}
function renderChart() {
  const days = Number(document.getElementById("chart-period").value) || 7;
  const grouped = new Map();
  for (const sale of state.sales) {
    const key = dateKey(saleDate(sale));
    grouped.set(key, (grouped.get(key) || 0) + sale.total);
  }
  const values = Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (days - index - 1));
    return { date, amount: grouped.get(dateKey(date)) || 0 };
  });
  const max = Math.max(...values.map((entry) => entry.amount), 1) * 1.12;
  const points = values.map((entry, index) => `${days === 1 ? 350 : index * 700 / (days - 1)},${176 - (entry.amount / max) * 160}`);
  const path = points.map((point, index) => `${index ? "L" : "M"}${point}`).join(" ");
  document.getElementById("chart-line").setAttribute("d", path);
  document.getElementById("chart-area").setAttribute("d", `${path} L700,190 L0,190 Z`);
  document.getElementById("chart-total").textContent = money(values.reduce((sum, entry) => sum + entry.amount, 0));
  const labels = days === 7 ? values : values.filter((_, index) => index % Math.ceil(days / 7) === 0 || index === days - 1);
  document.getElementById("chart-labels").innerHTML = labels.map(({ date }) => `<span>${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date).replace(".", "")}</span>`).join("");
}
function renderPayments() {
  const sales = salesInRange(state.sales, 30);
  const totals = PAYMENT_METHODS.map((method) => sales.filter((sale) => sale.payment === method).reduce((sum, sale) => sum + sale.total, 0));
  const grand = totals.reduce((sum, amount) => sum + amount, 0);
  let start = 0;
  const segments = totals.map((amount, index) => {
    const begin = start;
    start += grand ? amount / grand * 100 : 0;
    return `${COLORS[index]} ${begin}% ${start}%`;
  });
  document.getElementById("payment-donut").style.background = grand ? `conic-gradient(${segments.join(",")})` : "#12375e";
  document.getElementById("payment-total").textContent = String(sales.length);
  document.getElementById("payment-legend").innerHTML = PAYMENT_METHODS.filter((_, index) => totals[index] > 0).map((method) => {
    const index = PAYMENT_METHODS.indexOf(method);
    return `<div><i style="background:${COLORS[index]}"></i>${escapeHTML(method)}<strong>${grand ? Math.round(totals[index] / grand * 100) : 0}%</strong></div>`;
  }).join("") || `<div style="grid-column:1/-1;color:#a7bfdd;text-align:center">Sem vendas no período</div>`;
}
function renderSales() {
  const search = document.getElementById("product-search").value.trim().toLocaleLowerCase("pt-BR");
  const filtered = state.products.filter((product) => !search || `${product.name} ${product.sku} ${product.category}`.toLocaleLowerCase("pt-BR").includes(search));
  if (!state.products.some((product) => product.id === selectedProductId)) selectedProductId = null;
  const suggestions = document.getElementById("product-suggestions");
  if (search && document.activeElement === document.getElementById("product-search")) {
    suggestions.innerHTML = filtered.length ? filtered.slice(0, 7).map((product) => `<button type="button" role="option" data-select-product="${escapeHTML(product.id)}"><span>${escapeHTML(product.emoji || "📦")}</span><span><strong>${escapeHTML(product.name)}</strong><small>${escapeHTML(product.sku || product.category)} · ${product.kind === "service" ? "Serviço técnico" : `${product.stock} un. em estoque`}</small></span><b>${money(product.price)}</b></button>`).join("") : `<div class="suggestion-empty">Nenhuma peça, acessório ou serviço encontrado.</div>`;
    suggestions.hidden = false;
  } else {
    suggestions.hidden = true;
  }
  renderSelectedProduct();
  const customerSelect = document.getElementById("sale-customer");
  const selectedCustomer = customerSelect.value;
  customerSelect.innerHTML = `<option value="">Consumidor final</option>${state.customers.map((customer) => `<option value="${escapeHTML(customer.id)}">${escapeHTML(customer.name)}</option>`).join("")}`;
  customerSelect.value = state.customers.some((customer) => customer.id === selectedCustomer) ? selectedCustomer : "";
  document.getElementById("selected-customer-name").textContent = customerSelect.value ? state.customers.find((customer) => customer.id === customerSelect.value).name : "CONSUMIDOR FINAL";
  renderCart();
}
function renderSelectedProduct() {
  const product = state.products.find((item) => item.id === selectedProductId);
  const container = document.getElementById("selected-product");
  if (!product) {
    container.innerHTML = "";
    return;
  }
  const isService = product.kind === "service";
  selectedQuantity = isService ? Math.max(1, selectedQuantity) : Math.min(Math.max(1, selectedQuantity), Math.max(product.stock, 1));
  const availability = isService ? "Serviço técnico" : product.stock ? `Estoque: ${product.stock} un.` : "Sem estoque";
  const image = product.image
    ? `<img src="${escapeHTML(product.image)}" alt="Foto de ${escapeHTML(product.name)}">`
    : escapeHTML(product.emoji || "📦");
  container.innerHTML = `<div class="selected-product-details"><div class="selected-product-image"${product.image ? "" : ' aria-hidden="true"'}>${image}</div><div class="selected-product-copy"><strong>${escapeHTML(product.name.toLocaleUpperCase("pt-BR"))}</strong><span>${escapeHTML(product.category)}</span><small>Código: ${escapeHTML(product.sku || "—")}</small><small>${availability}</small><span class="product-stock-pill ${!isService && !product.stock ? "out-of-stock" : ""}">${isService ? "Serviço disponível" : product.stock ? "Peça em estoque" : "Sem estoque"}</span></div><div class="selected-price"><small>${isService ? "Valor do serviço" : "Valor unitário"}</small><strong>${money(product.price)}</strong></div></div><div class="selected-product-controls"><span>Qtd.</span><div class="selected-quantity"><button type="button" data-selected-qty="-1" aria-label="Diminuir quantidade">−</button><strong>${selectedQuantity}</strong><button type="button" data-selected-qty="1" aria-label="Aumentar quantidade">＋</button></div><button type="button" class="add-selected-product" data-add-product="${escapeHTML(product.id)}" ${!isService && product.stock <= 0 ? "disabled" : ""}>🛒 <span>Adicionar</span></button></div>`;
}
function addToCart(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product || (product.kind !== "service" && product.stock <= 0)) return toast("Esta peça está sem estoque.", "error");
  const existing = cart.find((item) => item.productId === id);
  const quantity = id === selectedProductId ? selectedQuantity : 1;
  if (product.kind !== "service" && (existing?.quantity || 0) + quantity > product.stock) return toast(`Estoque disponível: ${product.stock} unidade(s).`, "error");
  if (existing) existing.quantity += quantity;
  else cart.push({ productId: product.id, quantity });
  selectedQuantity = 1;
  renderSelectedProduct();
  renderCart();
}
function renderCart() {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.getElementById("cart-count").textContent = String(count);
  const items = cart.map((item) => ({ ...item, product: state.products.find((product) => product.id === item.productId) })).filter((item) => item.product);
  const saleInProgress = items.length > 0;
  document.getElementById("sale-register-status").textContent = saleInProgress ? "Caixa em uso" : "Caixa livre";
  document.getElementById("sale-register-indicator").classList.toggle("is-busy", saleInProgress);
  document.getElementById("cart-item-label").textContent = `${count} ${count === 1 ? "item" : "itens"}`;
  document.getElementById("sale-table-empty").hidden = items.length > 0;
  document.getElementById("cart-items").innerHTML = items.map(({ product, quantity }, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHTML(product.name)}</strong><small>${escapeHTML(product.sku || product.category)}</small></td><td><span class="table-quantity"><button type="button" data-quantity="-1" data-id="${escapeHTML(product.id)}" aria-label="Diminuir quantidade">−</button>${quantity}<button type="button" data-quantity="1" data-id="${escapeHTML(product.id)}" aria-label="Aumentar quantidade">＋</button></span></td><td>${money(product.price)}</td><td>${money(product.price * quantity)}</td><td><button type="button" class="remove-sale-item" data-remove-item="${escapeHTML(product.id)}" aria-label="Remover ${escapeHTML(product.name)}">▤</button></td></tr>`).join("");
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const rawDiscount = Number(document.getElementById("discount-input").value);
  const discount = Number.isFinite(rawDiscount) ? Math.min(Math.max(0, rawDiscount), subtotal) : 0;
  const total = Math.max(0, subtotal - discount);
  const paymentMethod = document.getElementById("payment-method").value;
  const paid = receivedAmount ?? total;
  document.getElementById("cart-subtotal").textContent = money(subtotal);
  document.getElementById("cart-discount").textContent = `− ${money(discount)}`;
  document.getElementById("cart-total").textContent = money(total);
  document.getElementById("payment-change").textContent = money(Math.max(0, paid - total));
  const paidInput = document.getElementById("payment-received");
  if (document.activeElement !== paidInput) paidInput.value = paid.toFixed(2);
  paidInput.disabled = paymentMethod !== "Dinheiro";
  document.getElementById("checkout-button").disabled = items.length === 0 || (paymentMethod === "Dinheiro" && paid < total);
  document.getElementById("checkout-button").title = items.length && paymentMethod === "Dinheiro" && paid < total ? "O valor recebido precisa cobrir o total da venda." : "";
}
function updateQuantity(id, amount) {
  const item = cart.find((entry) => entry.productId === id);
  const product = state.products.find((entry) => entry.id === id);
  if (!item || !product) return;
  const next = item.quantity + amount;
  if (product.kind !== "service" && next > product.stock) return toast(`Estoque disponível: ${product.stock} unidade(s).`, "error");
  if (next <= 0) cart = cart.filter((entry) => entry.productId !== id);
  else item.quantity = next;
  renderCart();
}
function finishSale() {
  const items = cart.map((item) => ({ ...item, product: state.products.find((product) => product.id === item.productId) }));
  if (!items.length || items.some((item) => !item.product || (item.product.kind !== "service" && item.quantity > item.product.stock))) return toast("Confira os itens e o estoque antes de finalizar.", "error");
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const discount = Math.min(Math.max(0, Number(document.getElementById("discount-input").value) || 0), subtotal);
  const total = subtotal - discount;
  if (document.getElementById("payment-method").value === "Dinheiro" && (receivedAmount ?? total) < total) return toast("O valor recebido é menor que o total da venda.", "error");
  const customer = state.customers.find((item) => item.id === document.getElementById("sale-customer").value);
  const sale = {
    id: makeId(),
    number: state.nextSaleNumber++,
    customerId: customer?.id || null,
    customerName: customer?.name || "Consumidor final",
    date: new Date().toISOString(),
    payment: document.getElementById("payment-method").value,
    subtotal,
    discount,
    total,
    items: items.map(({ product, quantity }) => ({ productId: product.id, name: product.name, quantity, price: product.price })),
  };
  for (const item of items) if (item.product.kind !== "service") item.product.stock -= item.quantity;
  state.sales.unshift(sale);
  saveState();
  cart = [];
  receivedAmount = null;
  document.getElementById("discount-input").value = "0";
  document.getElementById("sale-customer").value = "";
  document.getElementById("sale-confirmation-text").textContent = `Pedido #${sale.number} registrado em ${money(sale.total)}.`;
  document.getElementById("sale-receipt").textContent = `${sale.items.reduce((sum, item) => sum + item.quantity, 0)} itens · ${sale.payment} · ${sale.customerName}`;
  renderSales();
  document.getElementById("sale-modal").showModal();
}
function renderProducts() {
  const search = document.getElementById("inventory-search").value.trim().toLocaleLowerCase("pt-BR");
  const filter = document.getElementById("inventory-filter").value;
  const products = state.products.filter((product) => (!search || `${product.name} ${product.category} ${product.sku}`.toLocaleLowerCase("pt-BR").includes(search)) && (filter === "all" || (filter === "low" && product.kind !== "service" && product.stock > 0 && product.stock <= 5) || (filter === "out" && product.kind !== "service" && product.stock === 0)));
  document.getElementById("product-total").textContent = String(state.products.length);
  document.getElementById("inventory-value").textContent = money(state.products.reduce((sum, product) => sum + product.cost * product.stock, 0));
  document.getElementById("product-low-total").textContent = String(state.products.filter((product) => product.kind !== "service" && product.stock <= 5).length);
  document.getElementById("inventory-body").innerHTML = products.length ? products.map((product) => {
    const isService = product.kind === "service";
    const status = isService ? ["status-neutral", "Serviço"] : product.stock === 0 ? ["status-danger", "Sem estoque"] : product.stock <= 5 ? ["status-warning", "Estoque baixo"] : ["status-success", "Disponível"];
    const thumbnail = product.image ? `<img class="product-thumb-image" src="${escapeHTML(product.image)}" alt="">` : escapeHTML(product.emoji || "📦");
    return `<tr><td><div class="inventory-product"><span class="product-thumb">${thumbnail}</span><strong>${escapeHTML(product.name)}</strong></div></td><td>${escapeHTML(product.category)}</td><td>${escapeHTML(product.sku || "—")}</td><td><strong>${money(product.price)}</strong></td><td>${isService ? "—" : `${product.stock} un.`}</td><td><span class="status-pill ${status[0]}">${status[1]}</span></td><td><button class="table-action" data-edit-product="${escapeHTML(product.id)}" aria-label="Editar ${escapeHTML(product.name)}">✎</button><button class="table-action delete" data-delete-product="${escapeHTML(product.id)}" aria-label="Excluir ${escapeHTML(product.name)}">×</button></td></tr>`;
  }).join("") : `<tr><td colspan="7"><div class="empty-state"><strong>Nenhuma peça, acessório ou serviço encontrado</strong>Experimente ajustar os filtros.</div></td></tr>`;
  document.getElementById("inventory-footer").textContent = `Exibindo ${products.length} de ${state.products.length} produtos`;
}
function renderFilmCompatibility() {
  const searchInput = document.getElementById("film-compatibility-search");
  const query = normalizeSearchText(searchInput.value);
  const manufacturer = document.getElementById("film-compatibility-brand").value;
  const results = document.getElementById("film-compatibility-results");
  const manufacturerNames = { samsung: "Samsung", motorola: "Motorola", moto: "Motorola", xiaomi: "Xiaomi", apple: "Apple", iphone: "Apple", lg: "LG", asus: "Asus", oppo: "Oppo" };
  const normalizedManufacturer = manufacturerNames[query.match(/^[a-z]+/)?.[0]] || "";
  const searchTerm = normalizedManufacturer ? query.replace(/^[a-z]+\s*/, "") : query;
  if (!query && manufacturer === "all") {
    results.innerHTML = `<div class="empty-state"><strong>${FILM_COMPATIBILITY_ROWS.length} grupos de compatibilidade cadastrados</strong>Digite um modelo para pesquisar ou selecione um fabricante para consultar a tabela completa.</div>`;
    return;
  }
  const matchingRows = FILM_COMPATIBILITY_ROWS.filter((row) => {
    const selectedManufacturer = manufacturer === "all" ? normalizedManufacturer : manufacturer;
    if (selectedManufacturer && row.brand !== selectedManufacturer && !(query && searchTerm && manufacturer === "all")) return false;
    if (!query) return true;
    if (!searchTerm) return true;
    return row.models.some((model) => {
      const normalizedModel = normalizeSearchText(model);
      return normalizedModel.includes(query) || normalizedModel.includes(searchTerm) || searchTerm.includes(normalizedModel);
    });
  });
  const exactRows = query && searchTerm
    ? matchingRows.filter((row) => row.models.some((model) => {
      const normalizedModel = normalizeSearchText(model);
      return normalizedModel === query || normalizedModel === searchTerm || normalizedModel.endsWith(` ${searchTerm}`);
    }))
    : [];
  const filteredRows = exactRows.length ? exactRows : matchingRows;
  if (!filteredRows.length) {
    results.innerHTML = `<div class="empty-state"><strong>Nenhuma compatibilidade encontrada</strong>Confira o modelo ou o fabricante informado.</div>`;
    return;
  }
  const groupedRows = new Map();
  for (const row of filteredRows) {
    if (!groupedRows.has(row.brand)) groupedRows.set(row.brand, []);
    groupedRows.get(row.brand).push(row);
  }
  const output = [...groupedRows].map(([brand, rows]) => `<section class="film-compatibility-group"><h2>Películas para ${escapeHTML(brand)}</h2><div class="film-compatibility-table-wrap"><table class="film-compatibility-table"><thead><tr><th scope="col">Modelo</th><th scope="col">Modelos compatíveis</th></tr></thead><tbody>${rows.map((row) => `<tr><th scope="row">${escapeHTML(row.models[0])}</th><td>${escapeHTML(row.models.slice(1).join(" · ") || "Sem outro modelo listado")}</td></tr>`).join("")}</tbody></table></div></section>`).join("");
  results.innerHTML = `<p class="film-compatibility-count">${filteredRows.length} ${filteredRows.length === 1 ? "compatibilidade encontrada" : "compatibilidades encontradas"}${query ? ` para “${escapeHTML(searchInput.value.trim())}”` : ""}.</p>${output}`;
}
function initializeFilmCompatibilitySearch() {
  const suggestions = new Set();
  const manufacturerPrefixes = { Samsung: "Samsung", Motorola: "Moto", Xiaomi: "Xiaomi", Apple: "iPhone", LG: "LG", Asus: "Asus", Oppo: "Oppo" };
  for (const row of FILM_COMPATIBILITY_ROWS) {
    for (const model of row.models) {
      suggestions.add(model);
      const prefix = manufacturerPrefixes[row.brand];
      if (prefix && !normalizeSearchText(model).startsWith(normalizeSearchText(prefix))) suggestions.add(`${prefix} ${model}`);
    }
  }
  document.getElementById("film-compatibility-models").innerHTML = [...suggestions].map((model) => `<option value="${escapeHTML(model)}"></option>`).join("");
}
function openProductModal(id = "") {
  const product = state.products.find((item) => item.id === id);
  document.getElementById("product-form").reset();
  document.getElementById("product-id").value = product?.id || "";
  document.getElementById("product-modal-title").textContent = product ? "Editar item" : "Nova peça ou serviço";
  document.getElementById("product-kind").value = product?.kind || "product";
  document.getElementById("product-name").value = product?.name || "";
  document.getElementById("product-category").value = product?.category || "";
  document.getElementById("product-sku").value = product?.sku || "";
  document.getElementById("product-price").value = product?.price ?? "";
  document.getElementById("product-cost").value = product?.cost ?? 0;
  document.getElementById("product-stock").value = product?.stock ?? 0;
  document.getElementById("product-image-file").value = "";
  document.getElementById("product-image-data").value = product?.image || "";
  productImagePromise = Promise.resolve();
  updateProductPhotoPreview();
  updateProductKindFields();
  document.getElementById("product-modal").showModal();
}
function updateProductPhotoPreview() {
  const image = document.getElementById("product-image-data").value;
  const preview = document.getElementById("product-photo-preview");
  preview.src = image;
  document.getElementById("product-photo-preview-wrap").hidden = !image;
}
function resizeProductImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo de imagem."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("O arquivo selecionado não é uma imagem válida."));
      image.onload = () => {
        const maxDimension = 800;
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) return reject(new Error("Não foi possível preparar a imagem."));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error("Não foi possível processar a imagem."));
          const output = new FileReader();
          output.onerror = () => reject(new Error("Não foi possível preparar a imagem para salvar."));
          output.onload = () => resolve(output.result);
          output.readAsDataURL(blob);
        }, "image/jpeg", 0.75);
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function updateProductKindFields() {
  const isService = document.getElementById("product-kind").value === "service";
  const stockField = document.getElementById("product-stock");
  document.getElementById("product-stock-field").hidden = isService;
  document.getElementById("product-cost-field").hidden = isService;
  stockField.required = !isService;
  stockField.disabled = isService;
  if (isService) stockField.value = "0";
}
async function saveProduct(event) {
  event.preventDefault();
  const imageFile = document.getElementById("product-image-file").files[0];
  if (imageFile) {
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(imageFile.type)) return toast("Selecione uma imagem JPG, PNG, WebP ou GIF.", "error");
    if (imageFile.size > 5 * 1024 * 1024) return toast("A foto deve ter no máximo 5 MB.", "error");
  }
  const id = document.getElementById("product-id").value;
  const sku = document.getElementById("product-sku").value.trim();
  const kind = document.getElementById("product-kind").value;
  const price = Number(document.getElementById("product-price").value);
  const stock = kind === "service" ? 0 : Number(document.getElementById("product-stock").value);
  if (!Number.isFinite(price) || price <= 0 || (kind !== "service" && (!Number.isInteger(stock) || stock < 0))) return toast("Informe um preço e um estoque válidos.", "error");
  if (sku && state.products.some((product) => String(product.sku || "").toLocaleLowerCase("pt-BR") === sku.toLocaleLowerCase("pt-BR") && product.id !== id)) return toast("Já existe um item com este código.", "error");
  const existing = state.products.find((product) => product.id === id);
  await productImagePromise;
  const image = document.getElementById("product-image-data").value;
  const item = { id: id || makeId(), name: document.getElementById("product-name").value.trim(), category: document.getElementById("product-category").value.trim(), sku, price, cost: kind === "service" ? 0 : Number(document.getElementById("product-cost").value) || 0, stock, emoji: existing?.emoji || PRODUCT_EMOJIS[state.products.length % PRODUCT_EMOJIS.length], image, kind };
  if (existing) Object.assign(existing, item);
  else state.products.unshift(item);
  saveState();
  document.getElementById("product-modal").close();
  renderProducts();
  renderFilmCompatibility();
  renderLowStock();
  toast(existing ? "Produto atualizado com sucesso." : "Produto cadastrado com sucesso.");
}
function renderCustomers() {
  const search = document.getElementById("customer-search").value.trim().toLocaleLowerCase("pt-BR");
  const orders = new Map();
  for (const sale of state.sales) {
    if (!sale.customerId) continue;
    const current = orders.get(sale.customerId) || { count: 0, total: 0 };
    current.count += 1;
    current.total += sale.total;
    orders.set(sale.customerId, current);
  }
  const customers = state.customers.filter((customer) => `${customer.name} ${customer.email} ${customer.phone} ${customer.address || ""} ${customer.document}`.toLocaleLowerCase("pt-BR").includes(search));
  document.getElementById("customer-total").textContent = String(state.customers.length);
  document.getElementById("returning-customers").textContent = String([...orders.values()].filter((item) => item.count > 1).length);
  document.getElementById("customer-revenue").textContent = money([...orders.values()].reduce((sum, item) => sum + item.total, 0));
  document.getElementById("customer-count").textContent = `${customers.length} ${customers.length === 1 ? "cliente" : "clientes"}`;
  document.getElementById("customers-body").innerHTML = customers.length ? customers.map((customer) => {
    const activity = orders.get(customer.id) || { count: 0, total: 0 };
    const contact = [customer.email, customer.phone].filter(Boolean).map(escapeHTML).join("<br>") || "—";
    return `<tr><td>${customerCell(customer.name)}</td><td>${contact}</td><td>${escapeHTML(formatDate(customer.createdAt))}</td><td>${activity.count}</td><td><strong>${money(activity.total)}</strong></td><td><button class="table-action" data-edit-customer="${escapeHTML(customer.id)}" aria-label="Editar ${escapeHTML(customer.name)}">✎</button><button class="table-action delete" data-delete-customer="${escapeHTML(customer.id)}" aria-label="Excluir ${escapeHTML(customer.name)}">×</button></td></tr>`;
  }).join("") : `<tr><td colspan="6"><div class="empty-state"><strong>Nenhum cliente encontrado</strong>Cadastre seus clientes para acompanhar as compras.</div></td></tr>`;
}
function renderServiceOrders() {
  const search = document.getElementById("service-order-search").value.trim().toLocaleLowerCase("pt-BR");
  const filter = document.getElementById("service-order-filter").value;
  const orders = state.serviceOrders.filter((order) => {
    const matchesSearch = !search || `os-${String(order.number).padStart(4, "0")} ${order.customerName} ${order.device} ${order.issue} ${order.serial || ""}`.toLocaleLowerCase("pt-BR").includes(search);
    const matchesFilter = filter === "all" || (filter === "open" && !["Concluída", "Entregue", "Cancelada"].includes(order.status)) || order.status === filter;
    return matchesSearch && matchesFilter;
  });
  const openOrders = state.serviceOrders.filter((order) => !["Concluída", "Entregue", "Cancelada"].includes(order.status));
  document.getElementById("service-orders-open").textContent = String(openOrders.length);
  document.getElementById("service-orders-waiting").textContent = String(state.serviceOrders.filter((order) => ["Recebida", "Em análise", "Em diagnóstico", "Aguardando aprovação", "Aguardando peça"].includes(order.status)).length);
  document.getElementById("service-orders-ready").textContent = String(state.serviceOrders.filter((order) => ["Pronta", "Concluída"].includes(order.status)).length);
  document.getElementById("service-order-count").textContent = `${orders.length} ${orders.length === 1 ? "ordem" : "ordens"}`;
  document.getElementById("service-orders-body").innerHTML = orders.length ? orders.map((order) => {
    const statusClass = order.status === "Pronta" || order.status === "Concluída" || order.status === "Entregue" ? "status-success" : order.status === "Cancelada" ? "status-danger" : order.status === "Em reparo" ? "status-warning" : "status-neutral";
    return `<tr><td><button type="button" class="service-order-open-button" data-view-service-order="${escapeHTML(order.id)}" aria-label="Abrir ordem OS-${String(order.number).padStart(4, "0")}">OS-${String(order.number).padStart(4, "0")}</button></td><td>${escapeHTML(order.customerName)}</td><td>${escapeHTML(order.device)}</td><td class="service-order-issue">${escapeHTML(order.issue)}</td><td><strong>${money(order.estimate)}</strong></td><td>${escapeHTML(formatDate(order.createdAt))}</td><td><select class="service-order-status ${statusClass}" data-service-order-status="${escapeHTML(order.id)}" aria-label="Status da ordem OS-${String(order.number).padStart(4, "0")}">${SERVICE_ORDER_STATUSES.map((status) => `<option value="${status}"${status === order.status ? " selected" : ""}>${status}</option>`).join("")}</select></td><td><button class="table-action" data-view-service-order="${escapeHTML(order.id)}" aria-label="Ver detalhes da ordem OS-${String(order.number).padStart(4, "0")}">⌕</button><button class="table-action" data-share-service-order="${escapeHTML(order.id)}" aria-label="Compartilhar ordem OS-${String(order.number).padStart(4, "0")}" title="Compartilhar ordem">↗</button></td></tr>`;
  }).join("") : `<tr><td colspan="8"><div class="empty-state"><strong>${state.serviceOrders.length ? "Nenhuma ordem encontrada" : "Nenhuma ordem de serviço cadastrada"}</strong>${state.serviceOrders.length ? "Experimente ajustar a busca ou os filtros." : "Crie uma ordem para começar a acompanhar os reparos."}</div></td></tr>`;
}
function updateServiceOrderPasswordFields() {
  const isPattern = document.getElementById("service-order-password-type").value === "pattern";
  document.getElementById("service-order-password-text-field").hidden = isPattern;
  document.getElementById("service-order-password-pattern-field").hidden = !isPattern;
  const passwordInput = document.getElementById("service-order-password");
  passwordInput.inputMode = isPattern ? "text" : document.getElementById("service-order-password-type").value === "numeric" ? "numeric" : "text";
  passwordInput.placeholder = document.getElementById("service-order-password-type").value === "numeric"
    ? "Digite somente números"
    : "Digite a palavra-passe";
}
function clearServiceOrderPattern() {
  serviceOrderPattern = [];
  document.querySelectorAll("[data-service-order-pattern-dot]").forEach((button) => {
    button.classList.remove("selected");
    button.setAttribute("aria-pressed", "false");
    button.disabled = false;
  });
  document.getElementById("service-order-pattern-status").textContent = "Toque nos pontos na ordem desejada.";
}
function serviceOrderPasswordDetails(order) {
  const label = order.passwordType === "numeric"
    ? "Senha numérica"
    : order.passwordType === "passphrase"
      ? "Palavra-passe"
      : order.passwordType === "pattern"
        ? "Padrão de desbloqueio"
        : "Senha / padrão de desbloqueio";
  const value = order.passwordType === "pattern" && order.password
    ? order.password.split("-").join(" → ")
    : order.password;
  return [label, value];
}
function fillServiceOrderCustomer(customer) {
  const address = customer?.address || [
    [customer?.street, customer?.addressNumber].filter(Boolean).join(", "),
    customer?.complement,
    customer?.neighborhood,
    [customer?.city, customer?.state].filter(Boolean).join(" - "),
    customer?.zipCode ? `CEP ${customer.zipCode}` : "",
  ].filter(Boolean).join(", ");
  document.getElementById("service-order-customer").value = customer?.id || "";
  document.getElementById("service-order-customer-name").value = customer?.name || "";
  document.getElementById("service-order-document").value = customer?.document || "";
  document.getElementById("service-order-phone").value = customer?.phone || "";
  document.getElementById("service-order-secondary-phone").value = customer?.secondaryPhone || "";
  document.getElementById("service-order-email").value = customer?.email || "";
  document.getElementById("service-order-address").value = address;
}
function openServiceOrderModal() {
  const select = document.getElementById("service-order-customer");
  select.innerHTML = `<option value="">Consumidor final</option>${state.customers.map((customer) => `<option value="${escapeHTML(customer.id)}">${escapeHTML(customer.name)}</option>`).join("")}`;
  document.getElementById("service-order-customer-options").innerHTML = state.customers.map((customer) => `<option value="${escapeHTML(customer.name)}"></option>`).join("");
  document.getElementById("service-order-form").reset();
  clearServiceOrderPattern();
  updateServiceOrderPasswordFields();
  const now = new Date();
  const deliveryDate = new Date(now);
  deliveryDate.setDate(deliveryDate.getDate() + 7);
  document.getElementById("service-order-opened-at").value = dateTimeLocalValue(now);
  document.getElementById("service-order-due-date").value = dateKey(deliveryDate);
  document.getElementById("service-order-status-input").value = "Recebida";
  document.getElementById("service-order-warranty").value = "90";
  document.getElementById("service-order-number-preview").textContent = `OS-${String(state.nextServiceOrderNumber).padStart(4, "0")}`;
  updateServiceOrderTotal();
  document.getElementById("service-order-modal").showModal();
}
function updateServiceOrderTotal() {
  const labor = Number(document.getElementById("service-order-labor").value) || 0;
  const parts = Number(document.getElementById("service-order-parts-total").value) || 0;
  document.getElementById("service-order-estimate").value = (labor + parts).toFixed(2);
}
function saveServiceOrder(event) {
  event.preventDefault();
  const labor = Number(document.getElementById("service-order-labor").value);
  const partsTotal = Number(document.getElementById("service-order-parts-total").value);
  const estimate = labor + partsTotal;
  if (!Number.isFinite(labor) || labor < 0 || !Number.isFinite(partsTotal) || partsTotal < 0 || !Number.isFinite(estimate)) return toast("Informe valores válidos para mão de obra e peças.", "error");
  const customerId = document.getElementById("service-order-customer").value;
  const customer = state.customers.find((item) => item.id === customerId);
  const openedAtInput = document.getElementById("service-order-opened-at").value;
  const openedAt = new Date(openedAtInput);
  if (!openedAtInput || Number.isNaN(openedAt.getTime())) return toast("Informe uma data e hora de abertura válidas.", "error");
  if (document.getElementById("service-order-due-date").value < dateKey(openedAt)) return toast("A previsão de entrega não pode ser anterior à abertura.", "error");
  const deviceType = document.getElementById("service-order-device-type").value;
  const deviceBrand = document.getElementById("service-order-device-brand").value.trim();
  const deviceModel = document.getElementById("service-order-device-model").value.trim();
  const passwordType = document.getElementById("service-order-password-type").value;
  const password = passwordType === "pattern"
    ? serviceOrderPattern.join("-")
    : document.getElementById("service-order-password").value.trim();
  if (passwordType === "numeric" && password && !/^\d+$/.test(password)) return toast("A senha numérica deve conter somente números.", "error");
  const warrantyDays = Number(document.getElementById("service-order-warranty").value);
  if (!Number.isInteger(warrantyDays) || warrantyDays < 0) return toast("Informe um prazo de garantia válido.", "error");
  const order = {
    id: makeId(),
    number: state.nextServiceOrderNumber++,
    customerId: customer?.id || null,
    customerName: document.getElementById("service-order-customer-name").value.trim(),
    customerDocument: document.getElementById("service-order-document").value.trim(),
    customerPhone: document.getElementById("service-order-phone").value.trim(),
    customerSecondaryPhone: document.getElementById("service-order-secondary-phone").value.trim(),
    customerEmail: document.getElementById("service-order-email").value.trim(),
    customerAddress: document.getElementById("service-order-address").value.trim(),
    deviceType,
    deviceBrand,
    deviceModel,
    device: `${deviceType} ${deviceBrand} ${deviceModel}`,
    serial: document.getElementById("service-order-serial").value.trim(),
    passwordType,
    password,
    condition: document.getElementById("service-order-condition").value.trim(),
    accessories: document.getElementById("service-order-accessories").value.trim(),
    issue: document.getElementById("service-order-issue").value.trim(),
    diagnosis: document.getElementById("service-order-diagnosis").value.trim(),
    labor,
    parts: document.getElementById("service-order-parts").value.trim(),
    partsTotal,
    estimate,
    payment: document.getElementById("service-order-payment").value,
    warrantyDays,
    dueDate: document.getElementById("service-order-due-date").value,
    status: document.getElementById("service-order-status-input").value,
    openedAt: openedAt.toISOString(),
    authorized: document.getElementById("service-order-authorized").checked,
    abandonedTermsAccepted: document.getElementById("service-order-abandoned-accepted").checked,
    dataTermsAccepted: document.getElementById("service-order-data-accepted").checked,
    customerSignature: document.getElementById("service-order-signature-customer").value.trim(),
    technicianSignature: document.getElementById("service-order-signature-technician").value.trim(),
    createdAt: dateKey(openedAt),
  };
  state.serviceOrders.unshift(order);
  saveState();
  document.getElementById("service-order-modal").close();
  renderServiceOrders();
  toast(`Ordem OS-${String(order.number).padStart(4, "0")} criada com sucesso.`);
}
function openServiceOrderDetails(id) {
  const order = state.serviceOrders.find((item) => item.id === id);
  if (!order) return toast("Não foi possível localizar esta ordem de serviço.", "error");
  const value = (text) => escapeHTML(text || "—");
  const row = (label, text) => `<div class="service-order-detail"><span>${escapeHTML(label)}</span><strong>${value(String(text ?? ""))}</strong></div>`;
  const section = (title, rows) => `<section class="service-order-detail-section"><h3>${escapeHTML(title)}</h3>${rows.join("")}</section>`;
  const openedAt = order.openedAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(order.openedAt)) : formatDate(order.createdAt);
  document.getElementById("service-order-details-title").textContent = `OS-${String(order.number).padStart(4, "0")} · ${order.status}`;
  document.getElementById("service-order-details-content").innerHTML = [
    section("Cabeçalho e identificação", [row("Abertura", openedAt), row("Previsão de entrega", order.dueDate ? formatDate(order.dueDate) : "—"), row("Status", order.status)]),
    section("Cliente", [row("Nome / razão social", order.customerName), row("CPF / CNPJ", order.customerDocument), row("Telefone principal", order.customerPhone), row("Telefone para recado / WhatsApp", order.customerSecondaryPhone), row("E-mail", order.customerEmail), row("Endereço", order.customerAddress)]),
    section("Equipamento", [row("Tipo", order.deviceType), row("Marca", order.deviceBrand), row("Modelo", order.deviceModel || order.device), row("Número de série / IMEI", order.serial), row(...serviceOrderPasswordDetails(order)), row("Estado de conservação", order.condition), row("Acessórios inclusos", order.accessories)]),
    section("Diagnóstico", [row("Defeito relatado", order.issue), row("Laudo técnico", order.diagnosis)]),
    section("Valores e execução", [row("Mão de obra", money(order.labor || 0)), row("Peças / componentes", order.parts), row("Total de peças", money(order.partsTotal || 0)), row("Total do orçamento", money(order.estimate || 0)), row("Pagamento combinado", order.payment), row("Garantia", `${Number(order.warrantyDays) || 0} dias`)]),
    section("Termos e assinaturas", [row("Autorização de diagnóstico", order.authorized ? "Aceita" : "Não registrada"), row("Termo de equipamento abandonado (90 dias)", order.abandonedTermsAccepted ? "Aceito" : "Não registrado"), row("Responsabilidade sobre dados / backup", order.dataTermsAccepted ? "Aceito" : "Não registrado"), row("Assinatura do cliente", order.customerSignature), row("Assinatura do técnico", order.technicianSignature)]),
  ].join("");
  document.getElementById("download-service-order-details").dataset.downloadServiceOrder = order.id;
  document.getElementById("print-service-order-details").dataset.printServiceOrder = order.id;
  document.getElementById("share-service-order-details").dataset.shareServiceOrder = order.id;
  document.getElementById("service-order-details-modal").showModal();
}
function serviceOrderDocument(order) {
  const number = `OS-${String(order.number).padStart(4, "0")}`;
  const value = (text) => escapeHTML(String(text || "—")).replace(/\r?\n/g, "<br>");
  const row = (label, text) => `<div class="row"><span>${escapeHTML(label)}</span><strong>${value(text)}</strong></div>`;
  const section = (title, rows) => `<section><h2>${escapeHTML(title)}</h2>${rows.join("")}</section>`;
  const openedAt = order.openedAt
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(order.openedAt))
    : formatDate(order.createdAt);
  const sections = [
    section("Identificação", [row("Abertura", openedAt), row("Previsão de entrega", order.dueDate ? formatDate(order.dueDate) : "—"), row("Status", order.status)]),
    section("Cliente", [row("Nome / razão social", order.customerName), row("CPF / CNPJ", order.customerDocument), row("Telefone principal", order.customerPhone), row("Telefone para recado / WhatsApp", order.customerSecondaryPhone), row("E-mail", order.customerEmail), row("Endereço", order.customerAddress)]),
    section("Equipamento", [row("Tipo", order.deviceType), row("Marca", order.deviceBrand), row("Modelo", order.deviceModel || order.device), row("Número de série / IMEI", order.serial), row(...serviceOrderPasswordDetails(order)), row("Estado de conservação", order.condition), row("Acessórios inclusos", order.accessories)]),
    section("Diagnóstico", [row("Defeito relatado", order.issue), row("Laudo técnico", order.diagnosis)]),
    section("Valores e execução", [row("Mão de obra", money(order.labor || 0)), row("Peças / componentes", order.parts), row("Total de peças", money(order.partsTotal || 0)), row("Total do orçamento", money(order.estimate || 0)), row("Pagamento combinado", order.payment), row("Garantia", `${Number(order.warrantyDays) || 0} dias`)]),
    section("Termos e assinaturas", [
      row("Autorização de diagnóstico", order.authorized ? "Aceita" : "Não registrada"),
      row("Termo de equipamento abandonado (90 dias)", order.abandonedTermsAccepted ? "Aceito" : "Não registrado"),
      row("Responsabilidade sobre dados / backup", order.dataTermsAccepted ? "Aceita" : "Não registrada"),
      row("Assinatura do cliente", order.customerSignature),
      row("Assinatura do técnico", order.technicianSignature),
    ]),
  ];
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${number} - Ordem de serviço</title><style>
    @page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0;color:#172033;font:12px Arial,sans-serif;line-height:1.5}header{padding-bottom:14px;border-bottom:2px solid #087eff}header h1{margin:0;color:#0758d1;font-size:22px}header p{margin:4px 0 0;color:#526174}section{margin-top:16px;break-inside:avoid}section h2{margin:0 0 7px;padding-bottom:5px;border-bottom:1px solid #cbd5e1;color:#0758d1;font-size:14px}.row{display:grid;grid-template-columns:190px 1fr;gap:12px;padding:4px 0;border-bottom:1px solid #edf0f4}.row span{color:#526174}.row strong{font-weight:600;overflow-wrap:anywhere}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    </style></head><body><header><h1>Ordem de serviço ${number}</h1><p>${value(order.status || "Status não informado")} · Zoom tech - Assistência técnica</p></header>${sections.join("")}</body></html>`;
}
function serviceOrderPdfText(value) {
  const winAnsiSpecials = {
    "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86,
    "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c,
    "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95,
    "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b,
    "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
  };
  return Array.from(String(value ?? ""), (character) => {
    const code = winAnsiSpecials[character] ?? character.codePointAt(0);
    return (code > 0xff ? 0x3f : code).toString(16).padStart(2, "0");
  }).join("").toUpperCase();
}
function serviceOrderPdf(order) {
  const number = `OS-${String(order.number).padStart(4, "0")}`;
  const openedAt = order.openedAt
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(order.openedAt))
    : formatDate(order.createdAt);
  const sections = [
    ["Identificação", [["Abertura", openedAt], ["Previsão de entrega", order.dueDate ? formatDate(order.dueDate) : "—"], ["Status", order.status]]],
    ["Cliente", [["Nome / razão social", order.customerName], ["CPF / CNPJ", order.customerDocument], ["Telefone principal", order.customerPhone], ["Telefone para recado / WhatsApp", order.customerSecondaryPhone], ["E-mail", order.customerEmail], ["Endereço", order.customerAddress]]],
    ["Equipamento", [["Tipo", order.deviceType], ["Marca", order.deviceBrand], ["Modelo", order.deviceModel || order.device], ["Número de série / IMEI", order.serial], serviceOrderPasswordDetails(order), ["Estado de conservação", order.condition], ["Acessórios inclusos", order.accessories]]],
    ["Diagnóstico", [["Defeito relatado", order.issue], ["Laudo técnico", order.diagnosis]]],
    ["Valores e execução", [["Mão de obra", money(order.labor || 0)], ["Peças / componentes", order.parts], ["Total de peças", money(order.partsTotal || 0)], ["Total do orçamento", money(order.estimate || 0)], ["Pagamento combinado", order.payment], ["Garantia", `${Number(order.warrantyDays) || 0} dias`]]],
    ["Termos e assinaturas", [
      ["Autorização de diagnóstico", order.authorized ? "Aceita" : "Não registrada"],
      ["Termo de equipamento abandonado (90 dias)", order.abandonedTermsAccepted ? "Aceito" : "Não registrado"],
      ["Responsabilidade sobre dados / backup", order.dataTermsAccepted ? "Aceita" : "Não registrada"],
      ["Assinatura do cliente", order.customerSignature],
      ["Assinatura do técnico", order.technicianSignature],
    ]],
  ];
  const pages = [];
  let commands;
  let y;
  const drawText = (text, x, baseline, font, size, color) => {
    commands.push(`${color} rg BT /${font} ${size} Tf 1 0 0 1 ${x} ${baseline} Tm <${serviceOrderPdfText(text)}> Tj ET`);
  };
  const beginPage = (continued) => {
    commands = [];
    pages.push(commands);
    drawText(continued ? `Ordem de serviço ${number} (continuação)` : `Ordem de serviço ${number}`, 48, 790, "F2", 18, "0.02 0.22 0.42");
    drawText(`${order.status || "Status não informado"} - Zoom tech - Assistência técnica`, 48, 772, "F1", 9, "0.30 0.38 0.48");
    commands.push("0.03 0.50 0.90 RG 1.5 w 48 758 m 547 758 l S");
    y = 740;
  };
  const ensureSpace = (height) => {
    if (y - height < 55) beginPage(true);
  };
  const wrap = (text, limit) => {
    const lines = [];
    for (const paragraph of String(text || "—").split(/\r?\n/)) {
      const words = paragraph.split(/\s+/);
      let line = "";
      for (const word of words) {
        if (word.length > limit) {
          if (line) lines.push(line);
          line = "";
          for (let index = 0; index < word.length; index += limit) lines.push(word.slice(index, index + limit));
          continue;
        }
        if (line && `${line} ${word}`.length > limit) {
          lines.push(line);
          line = word;
        } else {
          line = line ? `${line} ${word}` : word;
        }
      }
      if (line) lines.push(line);
    }
    return lines.length ? lines : ["—"];
  };
  beginPage(false);
  for (const [title, rows] of sections) {
    ensureSpace(28);
    drawText(title, 48, y, "F2", 11, "0.02 0.35 0.68");
    y -= 18;
    for (const [label, rawValue] of rows) {
      const labelLines = wrap(label, 27);
      const valueLines = wrap(rawValue, 64);
      const lineCount = Math.max(labelLines.length, valueLines.length);
      const rowHeight = lineCount * 12 + 5;
      ensureSpace(rowHeight);
      labelLines.forEach((line, index) => drawText(line, 50, y - index * 12, "F1", 8, "0.30 0.38 0.48"));
      valueLines.forEach((line, index) => drawText(line, 205, y - index * 12, "F1", 9, "0.09 0.13 0.20"));
      y -= rowHeight;
    }
    y -= 5;
  }
  pages.forEach((page, index) => {
    page.push(`0.30 0.38 0.48 rg BT /F1 8 Tf 1 0 0 1 485 30 Tm <${serviceOrderPdfText(`Página ${index + 1} de ${pages.length}`)}> Tj ET`);
  });
  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, index) => `${5 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  pages.forEach((page, index) => {
    const pageObject = 5 + index * 2;
    const streamObject = pageObject + 1;
    const stream = page.join("\n");
    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamObject} 0 R >>`;
    objects[streamObject] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets.push(pdf.length);
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const crossReferenceOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${crossReferenceOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}
function downloadServiceOrder(id, showSuccess = true) {
  const order = state.serviceOrders.find((item) => item.id === id);
  if (!order) return toast("Não foi possível localizar esta ordem de serviço.", "error");
  try {
    const blob = serviceOrderPdf(order);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ordem-de-servico-${String(order.number).padStart(4, "0")}.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (showSuccess) toast("PDF da ordem de serviço baixado.");
  } catch (error) {
    console.error("Não foi possível baixar a ordem de serviço:", error);
    toast("Não foi possível baixar a ordem de serviço.", "error");
  }
}
function printServiceOrder(id) {
  const order = state.serviceOrders.find((item) => item.id === id);
  if (!order) return toast("Não foi possível localizar esta ordem de serviço.", "error");
  const printWindow = window.open("", "_blank");
  if (!printWindow) return toast("O navegador bloqueou a janela de impressão. Permita pop-ups e tente novamente.", "error");
  try {
    printWindow.document.open();
    printWindow.document.write(serviceOrderDocument(order));
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 300);
  } catch (error) {
    printWindow.close();
    console.error("Não foi possível preparar a impressão da ordem de serviço:", error);
    toast("Não foi possível preparar a impressão da ordem de serviço.", "error");
  }
}
async function shareServiceOrder(id) {
  const order = state.serviceOrders.find((item) => item.id === id);
  if (!order) return toast("Não foi possível localizar esta ordem de serviço.", "error");
  const number = `OS-${String(order.number).padStart(4, "0")}`;
  let pdf;
  try {
    pdf = serviceOrderPdf(order);
  } catch (error) {
    console.error("Não foi possível gerar o PDF da ordem de serviço:", error);
    return toast("Não foi possível gerar o PDF da ordem de serviço.", "error");
  }
  const filename = `ordem-de-servico-${String(order.number).padStart(4, "0")}.pdf`;
  const device = [order.deviceType, order.deviceBrand, order.deviceModel || order.device].filter(Boolean).join(" ");
  const lines = [
    `Ordem de serviço ${number}`,
    `Cliente: ${order.customerName || "—"}`,
    `Status: ${order.status || "—"}`,
    `Aparelho: ${device || "—"}`,
    `Defeito relatado: ${order.issue || "—"}`,
    order.diagnosis ? `Diagnóstico: ${order.diagnosis}` : "",
    `Orçamento: ${money(order.estimate || 0)}`,
    order.dueDate ? `Previsão de entrega: ${formatDate(order.dueDate)}` : "",
  ].filter(Boolean);
  const text = lines.join("\n");
  if (typeof navigator.share === "function" && typeof File === "function") {
    const file = new File([pdf], filename, { type: "application/pdf" });
    if (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ title: `Ordem de serviço ${number}`, text, files: [file] });
        return;
      } catch (error) {
        if (error && typeof error === "object" && "name" in error && error.name === "AbortError") return;
        console.error("Não foi possível compartilhar o PDF da ordem de serviço:", error);
        toast("Não foi possível compartilhar o PDF. O arquivo será baixado para você anexá-lo manualmente.", "error");
        downloadServiceOrder(id, false);
        return;
      }
    }
  }
  downloadServiceOrder(id, false);
  const link = document.createElement("a");
  link.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.append(link);
  link.click();
  link.remove();
  toast("PDF baixado. Anexe o arquivo ao compartilhar a mensagem.", "success");
}
function openCustomerModal(id = "") {
  const customer = state.customers.find((item) => item.id === id);
  customerCepRequestId += 1;
  document.getElementById("customer-form").reset();
  document.getElementById("customer-id").value = customer?.id || "";
  document.getElementById("customer-modal-title").textContent = customer ? "Editar cliente" : "Novo cliente";
  document.getElementById("customer-name").value = customer?.name || "";
  document.getElementById("customer-email").value = customer?.email || "";
  document.getElementById("customer-phone").value = customer?.phone || "";
  document.getElementById("customer-zip-code").value = customer?.zipCode || "";
  document.getElementById("customer-street").value = customer?.street || customer?.address || "";
  document.getElementById("customer-address-number").value = customer?.addressNumber || "";
  document.getElementById("customer-complement").value = customer?.complement || "";
  document.getElementById("customer-neighborhood").value = customer?.neighborhood || "";
  document.getElementById("customer-city").value = customer?.city || "";
  document.getElementById("customer-state").value = customer?.state || "";
  document.getElementById("customer-cep-status").textContent = "";
  const cpfInput = document.getElementById("customer-document");
  cpfInput.value = formatCpf(customer?.document || "");
  validateCustomerCpf(cpfInput);
  document.getElementById("customer-modal").showModal();
}
function validateCustomerCpf(input) {
  const digits = input.value.replace(/\D/g, "");
  const message = !digits
    ? ""
    : isValidCpf(digits)
      ? ""
      : digits.length === 11
        ? "Informe um CPF válido."
        : "O CPF deve conter 11 números.";
  input.setCustomValidity(message);
  return !message;
}
async function lookupCustomerCep(value) {
  const requestId = ++customerCepRequestId;
  const digits = value.replace(/\D/g, "");
  const status = document.getElementById("customer-cep-status");
  if (digits.length !== 8) {
    status.textContent = "";
    return;
  }
  status.textContent = "Consultando CEP...";
  try {
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!response.ok) throw new Error(`Consulta de CEP retornou HTTP ${response.status}.`);
    const address = await response.json();
    if (requestId !== customerCepRequestId) return;
    if (address.erro) {
      status.textContent = "CEP não encontrado. Confira os números e tente novamente.";
      return;
    }
    document.getElementById("customer-zip-code").value = `${digits.slice(0, 5)}-${digits.slice(5)}`;
    document.getElementById("customer-street").value = address.logradouro || "";
    document.getElementById("customer-neighborhood").value = address.bairro || "";
    document.getElementById("customer-city").value = address.localidade || "";
    document.getElementById("customer-state").value = address.uf || "";
    status.textContent = "Endereço localizado. Preencha o número do imóvel.";
  } catch (error) {
    if (requestId !== customerCepRequestId) return;
    console.error("Não foi possível consultar o CEP:", error);
    status.textContent = "Não foi possível consultar o CEP. Verifique sua conexão ou preencha o endereço manualmente.";
  }
}
function saveCustomer(event) {
  event.preventDefault();
  const cpfInput = document.getElementById("customer-document");
  if (!validateCustomerCpf(cpfInput)) {
    cpfInput.reportValidity();
    return;
  }
  const id = document.getElementById("customer-id").value;
  const email = document.getElementById("customer-email").value.trim();
  if (email && state.customers.some((customer) => customer.email.toLocaleLowerCase("pt-BR") === email.toLocaleLowerCase("pt-BR") && customer.id !== id)) return toast("Já existe um cliente com este e-mail.", "error");
  const existing = state.customers.find((customer) => customer.id === id);
  const zipCode = document.getElementById("customer-zip-code").value.trim();
  const street = document.getElementById("customer-street").value.trim();
  const addressNumber = document.getElementById("customer-address-number").value.trim();
  const complement = document.getElementById("customer-complement").value.trim();
  const neighborhood = document.getElementById("customer-neighborhood").value.trim();
  const city = document.getElementById("customer-city").value.trim();
  const addressState = document.getElementById("customer-state").value.trim().toUpperCase();
  const address = [
    [street, addressNumber].filter(Boolean).join(", "),
    complement,
    neighborhood,
    [city, addressState].filter(Boolean).join(" - "),
    zipCode ? `CEP ${zipCode}` : "",
  ].filter(Boolean).join(", ");
  const item = { id: id || makeId(), name: document.getElementById("customer-name").value.trim(), email, phone: document.getElementById("customer-phone").value.trim(), address, zipCode, street, addressNumber, complement, neighborhood, city, state: addressState, document: document.getElementById("customer-document").value.trim(), createdAt: existing?.createdAt || dateKey(today) };
  if (existing) Object.assign(existing, item);
  else state.customers.unshift(item);
  saveState();
  document.getElementById("customer-modal").close();
  renderCustomers();
  toast(existing ? "Cliente atualizado com sucesso." : "Cliente cadastrado com sucesso.");
}
function selectedReportSales() {
  const period = document.getElementById("report-period").value;
  return period === "all" ? [...state.sales] : salesInRange(state.sales, period === "today" ? 1 : Number(period));
}
function renderReports() {
  const sales = selectedReportSales().sort((a, b) => saleDate(b) - saleDate(a));
  const total = sales.reduce((sum, sale) => sum + sale.total, 0);
  const itemTotals = new Map();
  for (const sale of sales) for (const item of sale.items) {
    const current = itemTotals.get(item.productId) || { name: item.name, quantity: 0, total: 0 };
    current.quantity += item.quantity;
    current.total += item.price * item.quantity;
    itemTotals.set(item.productId, current);
  }
  const rangeLabel = { today: "Hoje", "7": "Últimos 7 dias", "30": "Últimos 30 dias", all: "Todo o período" }[document.getElementById("report-period").value];
  document.getElementById("report-period-note").textContent = `${rangeLabel} · ${sales.length} ${sales.length === 1 ? "venda" : "vendas"}`;
  document.getElementById("report-revenue").textContent = money(total);
  document.getElementById("report-orders").textContent = String(sales.length);
  document.getElementById("report-average").textContent = money(sales.length ? total / sales.length : 0);
  document.getElementById("report-sales-count").textContent = `${sales.length} pedidos`;
  document.getElementById("report-sales-caption").textContent = `Vendas concluídas · ${rangeLabel.toLocaleLowerCase("pt-BR")}`;
  document.getElementById("report-sales-body").innerHTML = sales.length ? sales.map((sale) => `<tr><td><strong>#${sale.number}</strong></td><td>${escapeHTML(sale.customerName)}</td><td>${escapeHTML(formatDate(dateKey(saleDate(sale))))}</td><td>${sale.items.reduce((sum, item) => sum + item.quantity, 0)}</td><td>${escapeHTML(sale.payment)}</td><td><strong>${money(sale.total)}</strong></td></tr>`).join("") : `<tr><td colspan="6"><div class="empty-state"><strong>Nenhuma venda neste período</strong>As vendas concluídas aparecerão aqui.</div></td></tr>`;
  document.getElementById("report-payments").innerHTML = PAYMENT_METHODS.map((method, index) => {
    const amount = sales.filter((sale) => sale.payment === method).reduce((sum, sale) => sum + sale.total, 0);
    return amount ? `<div class="report-payment-row"><i class="payment-dot" style="background:${COLORS[index]}"></i><span>${escapeHTML(method)}</span><strong>${money(amount)}</strong><small>${total ? Math.round(amount / total * 100) : 0}%</small></div>` : "";
  }).join("") || `<div class="empty-state">Sem dados de pagamento neste período.</div>`;
  const top = [...itemTotals.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  document.getElementById("top-products").innerHTML = top.length ? top.map((item, index) => `<div class="top-product-row"><span class="top-product-rank">${String(index + 1).padStart(2, "0")}</span><span class="top-product-name"><strong>${escapeHTML(item.name)}</strong><small>${item.quantity} ${item.quantity === 1 ? "unidade vendida" : "unidades vendidas"}</small></span><span class="top-product-amount">${money(item.total)}</span></div>`).join("") : `<div class="empty-state">Sem produtos vendidos neste período.</div>`;
}
function exportReport() {
  const sales = selectedReportSales().sort((a, b) => saleDate(a) - saleDate(b));
  if (!sales.length) return toast("Não há vendas neste período para exportar.", "error");
  const headers = ["Venda", "Data", "Cliente", "Pagamento", "Itens", "Subtotal", "Desconto", "Total"];
  const rows = sales.map((sale) => [sale.number, saleDate(sale).toLocaleString("pt-BR"), sale.customerName, sale.payment, sale.items.map((item) => `${item.quantity}x ${item.name}`).join(" | "), sale.subtotal.toFixed(2), sale.discount.toFixed(2), sale.total.toFixed(2)]);
  const csv = [headers, ...rows].map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  link.download = `relatorio-pdv-${dateKey(today)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
function clearCurrentSale(resetCustomer = false) {
  cart = [];
  receivedAmount = null;
  document.getElementById("discount-input").value = "0";
  if (resetCustomer) document.getElementById("sale-customer").value = "";
  document.getElementById("payment-method").value = "Dinheiro";
  document.querySelectorAll("[data-sale-payment]").forEach((button) => button.classList.toggle("active", button.dataset.salePayment === "Dinheiro"));
  renderSales();
}
document.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) {
    if (!event.target.closest(".sales-searchbar")) document.getElementById("product-suggestions").hidden = true;
    return;
  }
  if (target.dataset.page) setPage(target.dataset.page);
  if (target.dataset.go) setPage(target.dataset.go);
  if (target.dataset.selectProduct) {
    selectedProductId = target.dataset.selectProduct;
    selectedQuantity = 1;
    document.getElementById("product-search").value = "";
    document.getElementById("product-suggestions").hidden = true;
    renderSales();
  }
  if (target.dataset.addProduct) addToCart(target.dataset.addProduct);
  if (target.dataset.selectedQty) {
    const product = state.products.find((item) => item.id === selectedProductId);
    if (product) selectedQuantity = product.kind === "service" ? Math.max(1, selectedQuantity + Number(target.dataset.selectedQty)) : Math.min(product.stock, Math.max(1, selectedQuantity + Number(target.dataset.selectedQty)));
    renderSelectedProduct();
  }
  if (target.dataset.quantity) updateQuantity(target.dataset.id, Number(target.dataset.quantity));
  if (target.dataset.removeItem) { cart = cart.filter((item) => item.productId !== target.dataset.removeItem); renderCart(); }
  if (target.dataset.salePayment) {
    document.getElementById("payment-method").value = target.dataset.salePayment;
    receivedAmount = null;
    document.querySelectorAll("[data-sale-payment]").forEach((button) => button.classList.toggle("active", button === target));
    renderCart();
  }
  if (target.id === "search-product-button") {
    const query = document.getElementById("product-search").value.trim().toLocaleLowerCase("pt-BR");
    if (!query) {
      selectedProductId = null;
      renderSales();
      return;
    }
    const match = state.products.find((product) => !query || `${product.name} ${product.sku} ${product.category}`.toLocaleLowerCase("pt-BR").includes(query));
    if (match) {
      selectedProductId = match.id;
      selectedQuantity = 1;
      document.getElementById("product-search").value = "";
      renderSales();
    } else toast("Nenhum produto encontrado.", "error");
  }
  if (target.id === "add-customer-shortcut") openCustomerModal();
  if (target.id === "new-sale-button-inline") clearCurrentSale(true);
  if (target.id === "cancel-sale-button") {
    if (!cart.length || confirm("Cancelar esta venda e limpar os itens selecionados?")) {
      clearCurrentSale(true);
      toast("Venda cancelada.");
    }
  }
  if (target.dataset.editProduct) openProductModal(target.dataset.editProduct);
  if (target.dataset.deleteProduct) {
    const product = state.products.find((item) => item.id === target.dataset.deleteProduct);
    if (product && confirm(`Excluir "${product.name}" do estoque? O histórico de vendas será preservado.`)) {
      state.products = state.products.filter((item) => item.id !== product.id);
      cart = cart.filter((item) => item.productId !== product.id);
      saveState(); renderProducts(); renderCart(); toast("Produto excluído.");
    }
  }
  if (target.dataset.editCustomer) openCustomerModal(target.dataset.editCustomer);
  if (target.dataset.deleteCustomer) {
    const customer = state.customers.find((item) => item.id === target.dataset.deleteCustomer);
    if (customer && confirm(`Excluir o cadastro de "${customer.name}"? O histórico das vendas será preservado.`)) {
      state.customers = state.customers.filter((item) => item.id !== customer.id);
      saveState(); renderCustomers(); toast("Cliente excluído.");
    }
  }
  if (target.id === "add-service-order-button") openServiceOrderModal();
  if (target.dataset.viewServiceOrder) openServiceOrderDetails(target.dataset.viewServiceOrder);
  if (target.dataset.downloadServiceOrder) downloadServiceOrder(target.dataset.downloadServiceOrder);
  if (target.dataset.printServiceOrder) printServiceOrder(target.dataset.printServiceOrder);
  if (target.dataset.shareServiceOrder) void shareServiceOrder(target.dataset.shareServiceOrder);
  if (target.dataset.close) document.getElementById(target.dataset.close).close();
});
document.getElementById("product-search").addEventListener("input", () => {
  const query = document.getElementById("product-search").value.trim().toLocaleLowerCase("pt-BR");
  const match = state.products.find((product) => `${product.name} ${product.sku} ${product.category}`.toLocaleLowerCase("pt-BR").includes(query));
  if (query && match) {
    selectedProductId = match.id;
    selectedQuantity = 1;
  } else if (!query || !match) {
    selectedProductId = null;
    selectedQuantity = 1;
  }
  renderSales();
});
document.getElementById("product-search").addEventListener("focus", renderSales);
document.getElementById("product-search").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    const first = document.querySelector("[data-select-product]");
    if (first) first.click();
    else document.getElementById("search-product-button").click();
  }
  if (event.key === "Escape") document.getElementById("product-suggestions").hidden = true;
});
document.getElementById("inventory-search").addEventListener("input", renderProducts);
document.getElementById("inventory-filter").addEventListener("change", renderProducts);
initializeFilmCompatibilitySearch();
document.getElementById("film-compatibility-search").addEventListener("input", renderFilmCompatibility);
document.getElementById("film-compatibility-brand").addEventListener("change", renderFilmCompatibility);
document.getElementById("customer-search").addEventListener("input", renderCustomers);
document.getElementById("customer-document").addEventListener("input", (event) => {
  event.target.value = formatCpf(event.target.value);
  validateCustomerCpf(event.target);
});
document.getElementById("customer-zip-code").addEventListener("input", (event) => {
  const digits = event.target.value.replace(/\D/g, "").slice(0, 8);
  event.target.value = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
  if (digits.length === 8) {
    void lookupCustomerCep(event.target.value);
  } else {
    customerCepRequestId += 1;
    document.getElementById("customer-cep-status").textContent = digits ? "Digite os 8 números do CEP." : "";
  }
});
document.getElementById("service-order-search").addEventListener("input", renderServiceOrders);
document.getElementById("service-order-filter").addEventListener("change", renderServiceOrders);
document.getElementById("service-order-customer").addEventListener("change", (event) => {
  const customer = state.customers.find((item) => item.id === event.target.value);
  fillServiceOrderCustomer(customer);
});
document.getElementById("service-order-customer-name").addEventListener("input", (event) => {
  const typedName = event.target.value;
  const name = typedName.trim().toLocaleLowerCase("pt-BR");
  const customer = state.customers.find((item) => item.name.trim().toLocaleLowerCase("pt-BR") === name);
  if (customer) {
    fillServiceOrderCustomer(customer);
  } else if (document.getElementById("service-order-customer").value) {
    fillServiceOrderCustomer(null);
    event.target.value = typedName;
  }
});
document.querySelectorAll(".service-order-amount").forEach((input) => input.addEventListener("input", updateServiceOrderTotal));
document.getElementById("service-orders-body").addEventListener("change", (event) => {
  const select = event.target.closest("[data-service-order-status]");
  if (!select) return;
  const order = state.serviceOrders.find((item) => item.id === select.dataset.serviceOrderStatus);
  if (!order || !SERVICE_ORDER_STATUSES.includes(select.value)) return toast("Não foi possível atualizar o status desta ordem.", "error");
  order.status = select.value;
  saveState();
  renderServiceOrders();
  toast("Status da ordem atualizado.");
});
document.getElementById("chart-period").addEventListener("change", renderChart);
document.getElementById("report-period").addEventListener("change", renderReports);
document.getElementById("discount-input").addEventListener("input", renderCart);
document.getElementById("payment-received").addEventListener("input", (event) => {
  receivedAmount = Math.max(0, Number(event.target.value) || 0);
  renderCart();
});
document.getElementById("sale-customer").addEventListener("change", (event) => {
  const customer = state.customers.find((item) => item.id === event.target.value);
  document.getElementById("selected-customer-name").textContent = customer?.name || "CONSUMIDOR FINAL";
});
document.getElementById("checkout-button").addEventListener("click", finishSale);
document.getElementById("clear-cart").addEventListener("click", () => { cart = []; receivedAmount = null; renderCart(); });
document.getElementById("new-sale-button").addEventListener("click", () => { document.getElementById("sale-modal").close(); setPage("sales"); });
document.getElementById("add-product-button").addEventListener("click", () => openProductModal());
document.getElementById("add-customer-button").addEventListener("click", () => openCustomerModal());
document.getElementById("sidebar-toggle").addEventListener("click", (event) => {
  const collapsed = document.querySelector(".app-shell").classList.toggle("sidebar-collapsed");
  event.currentTarget.setAttribute("aria-expanded", String(!collapsed));
  event.currentTarget.setAttribute("aria-label", collapsed ? "Expandir menu lateral" : "Recolher menu lateral");
  event.currentTarget.title = collapsed ? "Expandir menu lateral" : "Recolher menu lateral";
});
document.getElementById("product-form").addEventListener("submit", saveProduct);
document.getElementById("product-kind").addEventListener("change", updateProductKindFields);
document.getElementById("product-image-file").addEventListener("change", (event) => {
  const input = event.currentTarget;
  const file = input.files[0];
  if (!file) {
    productImagePromise = Promise.resolve();
    return;
  }
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
    input.value = "";
    productImagePromise = Promise.resolve();
    return toast("Selecione uma imagem JPG, PNG, WebP ou GIF.", "error");
  }
  if (file.size > 5 * 1024 * 1024) {
    input.value = "";
    productImagePromise = Promise.resolve();
    return toast("A foto deve ter no máximo 5 MB.", "error");
  }
  productImagePromise = resizeProductImage(file).then((image) => {
    if (input.files[0] !== file) return;
    document.getElementById("product-image-data").value = image;
    updateProductPhotoPreview();
  }).catch((error) => {
    console.error("Não foi possível processar a foto do produto:", error);
    if (input.files[0] === file) {
      input.value = "";
      toast(error.message || "Não foi possível processar a foto do produto.", "error");
    }
  });
});
document.getElementById("remove-product-photo").addEventListener("click", () => {
  document.getElementById("product-image-file").value = "";
  document.getElementById("product-image-data").value = "";
  productImagePromise = Promise.resolve();
  updateProductPhotoPreview();
});
document.getElementById("customer-form").addEventListener("submit", saveCustomer);
document.getElementById("service-order-form").addEventListener("submit", saveServiceOrder);
document.getElementById("service-order-password-type").addEventListener("change", () => {
  document.getElementById("service-order-password").value = "";
  clearServiceOrderPattern();
  updateServiceOrderPasswordFields();
});
document.getElementById("service-order-password").addEventListener("input", (event) => {
  if (document.getElementById("service-order-password-type").value === "numeric") {
    event.target.value = event.target.value.replace(/\D/g, "");
  }
});
document.getElementById("service-order-pattern-grid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-service-order-pattern-dot]");
  if (!button || button.disabled) return;
  const point = button.dataset.serviceOrderPatternDot;
  serviceOrderPattern.push(point);
  button.classList.add("selected");
  button.setAttribute("aria-pressed", "true");
  button.disabled = true;
  document.getElementById("service-order-pattern-status").textContent = `Padrão: ${serviceOrderPattern.join(" → ")}`;
});
document.getElementById("service-order-pattern-clear").addEventListener("click", clearServiceOrderPattern);
document.getElementById("export-report").addEventListener("click", exportReport);
document.getElementById("mobile-menu").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));
document.querySelectorAll(".notification-button").forEach((button) => button.addEventListener("click", () => toast("Nenhuma notificação nova.")));
document.querySelectorAll(".modal").forEach((dialog) => dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
}));
async function loadWorkspace() {
  const { data: row, error } = await supabaseClient
    .from("pdv_data")
    .select("data,version")
    .eq("id", DATABASE_ROW_ID)
    .maybeSingle();
  if (error) throw error;

  if (row) {
    if (!row.data || !Array.isArray(row.data.products) || !Array.isArray(row.data.customers) || !Array.isArray(row.data.sales)) {
      throw new Error("Os dados salvos no banco estão incompletos.");
    }
    state = row.data;
    if (!Array.isArray(state.serviceOrders)) state.serviceOrders = [];
    state.nextServiceOrderNumber = Number(state.nextServiceOrderNumber) || Math.max(0, ...state.serviceOrders.map((order) => Number(order.number) || 0)) + 1;
    state.nextSaleNumber = Number(state.nextSaleNumber) || Math.max(1042, ...state.sales.map((sale) => Number(sale.number) || 0)) + 1;
    databaseVersion = row.version;
  } else {
    const { error: insertError } = await supabaseClient
      .from("pdv_data")
      .upsert({ id: DATABASE_ROW_ID, data: seedData(), version: 1 }, { onConflict: "id", ignoreDuplicates: true });
    if (insertError) throw insertError;
    const { data: createdRow, error: reloadError } = await supabaseClient
      .from("pdv_data")
      .select("data,version")
      .eq("id", DATABASE_ROW_ID)
      .single();
    if (reloadError) throw reloadError;
    if (!createdRow.data || !Array.isArray(createdRow.data.products) || !Array.isArray(createdRow.data.customers) || !Array.isArray(createdRow.data.sales)) {
      throw new Error("Os dados iniciais do banco estão incompletos.");
    }
    state = createdRow.data;
    if (!Array.isArray(state.serviceOrders)) state.serviceOrders = [];
    state.nextServiceOrderNumber = Number(state.nextServiceOrderNumber) || 1;
    state.nextSaleNumber = Number(state.nextSaleNumber) || 1;
    databaseVersion = createdRow.version;
  }

  databaseWriteBlocked = false;
  document.querySelector(".app-shell").hidden = false;
  document.body.classList.add("is-authenticated");
  renderDashboard();
}

function showLoginError(message) {
  const error = document.getElementById("login-error");
  error.textContent = message;
  error.hidden = false;
}

async function initializeAuthentication() {
  const config = globalThis.ZOOMTECH_SUPABASE_CONFIG;
  if (!config?.url || !config?.anonKey || !globalThis.supabase?.createClient) {
    document.getElementById("login-submit").disabled = true;
    document.getElementById("login-error").textContent = "Configure as variáveis do Supabase seguindo o guia de instalação antes de entrar.";
    document.getElementById("login-error").hidden = false;
    return;
  }

  try {
    const url = new URL(config.url);
    if (url.protocol !== "https:") throw new Error("A URL do Supabase deve usar HTTPS.");
    supabaseClient = globalThis.supabase.createClient(url.origin, config.anonKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
    });
  } catch (error) {
    console.error("Configuração do Supabase inválida:", error);
    document.getElementById("login-submit").disabled = true;
    showLoginError("A configuração do banco é inválida. Confira o guia de instalação.");
    return;
  }
  supabaseClient.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      clearTimeout(saveTimer);
      document.querySelector(".app-shell").hidden = true;
      document.body.classList.remove("is-authenticated");
      state = seedData();
      databaseVersion = null;
      databaseWriteBlocked = false;
    }
  });

  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (data.session) await loadWorkspace();
  } catch (error) {
    console.error("Não foi possível restaurar a sessão ou carregar os dados:", error);
    showLoginError("Não foi possível conectar ao banco. Confira a configuração e tente novamente.");
  }
}

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabaseClient) return;

  const button = document.getElementById("login-submit");
  button.disabled = true;
  document.getElementById("login-error").hidden = true;
  try {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: document.getElementById("login-email").value.trim(),
      password: document.getElementById("login-password").value,
    });
    if (error) throw error;
    await loadWorkspace();
    document.getElementById("login-password").value = "";
  } catch (error) {
    console.error("Falha na autenticação ou no carregamento do banco:", error);
    showLoginError(error.message === "Invalid login credentials"
      ? "E-mail ou senha incorretos."
      : "Não foi possível entrar ou carregar os dados. Confira a conexão e tente novamente.");
    const { error: signOutError } = await supabaseClient.auth.signOut();
    if (signOutError) console.error("Não foi possível encerrar a sessão após a falha:", signOutError);
  } finally {
    button.disabled = false;
  }
});
document.getElementById("password-toggle").addEventListener("click", (event) => {
  const password = document.getElementById("login-password");
  const button = event.currentTarget;
  const isVisible = password.type === "text";
  password.type = isVisible ? "password" : "text";
  button.setAttribute("aria-pressed", String(!isVisible));
  button.setAttribute("aria-label", isVisible ? "Mostrar senha" : "Ocultar senha");
});
document.getElementById("logout-button").addEventListener("click", async () => {
  await flushStateSave();
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    window.location.reload();
  } catch (error) {
    console.error("Não foi possível encerrar a sessão:", error);
    toast("Não foi possível sair. Tente novamente.", "error");
  }
});
setTodayLabel();
renderSalesHeader();
setInterval(renderSalesHeader, 1000);
renderDashboard();
initializeAuthentication();
