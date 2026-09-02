(() => {
  "use strict";

  /* ---------------------------------------------------------------------
   * Constants
   * ------------------------------------------------------------------- */

  const STORAGE_KEY = "expense-tracker:v1";
  const THEME_KEY = "expense-tracker:theme";

  const CATEGORIES = [
    { id: "food", label: "Food & Dining", color: "#f5a524", icon: "🍔" },
    { id: "transport", label: "Transport", color: "#3b82f6", icon: "🚗" },
    { id: "housing", label: "Housing", color: "#8b5cf6", icon: "🏠" },
    { id: "utilities", label: "Utilities", color: "#06b6d4", icon: "💡" },
    { id: "shopping", label: "Shopping", color: "#ec4899", icon: "🛍️" },
    { id: "health", label: "Health", color: "#ef4444", icon: "💊" },
    { id: "entertainment", label: "Entertainment", color: "#a855f7", icon: "🎬" },
    { id: "travel", label: "Travel", color: "#14b8a6", icon: "✈️" },
    { id: "education", label: "Education", color: "#6366f1", icon: "📚" },
    { id: "other", label: "Other", color: "#6b7280", icon: "🧾" },
  ];

  const CATEGORY_MAP = new Map(CATEGORIES.map((c) => [c.id, c]));
  const categoryOf = (id) => CATEGORY_MAP.get(id) || CATEGORY_MAP.get("other");

  const money = (n) =>
    (n < 0 ? "-$" : "$") +
    Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  // Format a Date as a local "YYYY-MM-DD" string. Deliberately NOT using
  // toISOString() here, since that converts to UTC first and can shift the
  // date by a day in timezones behind UTC.
  const toDateStr = (dt) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const todayStr = () => toDateStr(new Date());

  /* ---------------------------------------------------------------------
   * Seed data (only used the very first time, so the app isn't empty)
   * ------------------------------------------------------------------- */

  function seedData() {
    const d = (offset) => {
      const dt = new Date();
      dt.setDate(dt.getDate() - offset);
      return toDateStr(dt);
    };
    return [
      { id: uid(), desc: "Grocery run", category: "food", amount: 64.32, date: d(1) },
      { id: uid(), desc: "Uber to airport", category: "transport", amount: 28.5, date: d(2) },
      { id: uid(), desc: "Monthly rent", category: "housing", amount: 1450, date: d(3) },
      { id: uid(), desc: "Electricity bill", category: "utilities", amount: 76.4, date: d(5) },
      { id: uid(), desc: "New headphones", category: "shopping", amount: 129.99, date: d(6) },
      { id: uid(), desc: "Pharmacy", category: "health", amount: 18.75, date: d(8) },
      { id: uid(), desc: "Movie night", category: "entertainment", amount: 32, date: d(9) },
      { id: uid(), desc: "Coffee with client", category: "food", amount: 9.4, date: d(11) },
      { id: uid(), desc: "Online course", category: "education", amount: 49, date: d(14) },
      { id: uid(), desc: "Weekend trip", category: "travel", amount: 210, date: d(18) },
    ];
  }

  /* ---------------------------------------------------------------------
   * State + persistence
   * ------------------------------------------------------------------- */

  const state = {
    expenses: [],
    editingId: null,
    filters: { search: "", category: "all", from: "", to: "", preset: "all" },
    sort: "date-desc",
    highlightCategory: null,
  };

  function loadExpenses() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn("Could not read saved expenses, starting fresh.", e);
    }
    const seeded = seedData();
    persist(seeded);
    return seeded;
  }

  function persist(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn("Could not save expenses.", e);
    }
  }

  function save() {
    persist(state.expenses);
  }

  /* ---------------------------------------------------------------------
   * DOM refs
   * ------------------------------------------------------------------- */

  const $ = (sel) => document.querySelector(sel);

  const el = {
    stats: $("#stats"),
    form: $("#expenseForm"),
    formTitle: $("#formTitle"),
    formError: $("#formError"),
    desc: $("#desc"),
    amount: $("#amount"),
    date: $("#date"),
    category: $("#category"),
    submitBtn: $("#submitBtn"),
    cancelEdit: $("#cancelEdit"),
    filterSearch: $("#filterSearch"),
    filterCategory: $("#filterCategory"),
    filterFrom: $("#filterFrom"),
    filterTo: $("#filterTo"),
    presets: $("#presets"),
    resetFilters: $("#resetFilters"),
    periodPill: $("#periodPill"),
    chart: $("#chart"),
    chartLabel: $("#chartLabel"),
    chartValue: $("#chartValue"),
    legend: $("#legend"),
    listCount: $("#listCount"),
    sortBy: $("#sortBy"),
    expenseList: $("#expenseList"),
    themeBtn: $("#themeBtn"),
    exportBtn: $("#exportBtn"),
    toast: $("#toast"),
    toastMsg: $("#toastMsg"),
    toastAction: $("#toastAction"),
  };

  /* ---------------------------------------------------------------------
   * Category <select> population
   * ------------------------------------------------------------------- */

  function populateCategorySelects() {
    el.category.innerHTML = CATEGORIES.map(
      (c) => `<option value="${c.id}">${c.icon} ${c.label}</option>`
    ).join("");

    el.filterCategory.innerHTML =
      `<option value="all">All categories</option>` +
      CATEGORIES.map((c) => `<option value="${c.id}">${c.icon} ${c.label}</option>`).join("");
  }

  /* ---------------------------------------------------------------------
   * Filtering / sorting helpers
   * ------------------------------------------------------------------- */

  function parseDateLocal(str) {
    // "YYYY-MM-DD" -> local Date at midnight (avoids TZ off-by-one)
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function getFiltered() {
    const { search, category, from, to } = state.filters;
    const term = search.trim().toLowerCase();
    const fromDate = from ? parseDateLocal(from) : null;
    const toDate = to ? parseDateLocal(to) : null;

    return state.expenses.filter((e) => {
      if (category !== "all" && e.category !== category) return false;
      if (term && !e.desc.toLowerCase().includes(term) && !categoryOf(e.category).label.toLowerCase().includes(term))
        return false;
      const ed = parseDateLocal(e.date);
      if (fromDate && ed < fromDate) return false;
      if (toDate && ed > toDate) return false;
      return true;
    });
  }

  function getSorted(list) {
    const sorted = [...list];
    switch (state.sort) {
      case "date-asc":
        sorted.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
        break;
      case "amount-desc":
        sorted.sort((a, b) => b.amount - a.amount);
        break;
      case "amount-asc":
        sorted.sort((a, b) => a.amount - b.amount);
        break;
      case "date-desc":
      default:
        sorted.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
        break;
    }
    return sorted;
  }

  /* ---------------------------------------------------------------------
   * Rendering: summary stats
   * ------------------------------------------------------------------- */

  function renderStats(filtered) {
    const total = filtered.reduce((s, e) => s + e.amount, 0);
    const count = filtered.length;
    const avg = count ? total / count : 0;

    const byCat = new Map();
    for (const e of filtered) byCat.set(e.category, (byCat.get(e.category) || 0) + e.amount);
    let topCat = null;
    for (const [id, amt] of byCat) {
      if (!topCat || amt > topCat.amt) topCat = { id, amt };
    }

    // This-month total (independent of filters, always useful context)
    const now = new Date();
    const monthTotal = state.expenses
      .filter((e) => {
        const d = parseDateLocal(e.date);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((s, e) => s + e.amount, 0);

    const cards = [
      {
        label: "Total spending",
        value: money(total),
        sub: `${count} expense${count === 1 ? "" : "s"} in view`,
      },
      {
        label: "This month",
        value: money(monthTotal),
        sub: now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      },
      {
        label: "Average expense",
        value: money(avg),
        sub: count ? "per transaction shown" : "no expenses shown",
      },
      {
        label: "Top category",
        value: topCat ? categoryOf(topCat.id).label : "—",
        sub: topCat
          ? `<span class="dot-inline" style="background:${categoryOf(topCat.id).color}"></span>${money(topCat.amt)}`
          : "no data",
        subHtml: true,
      },
    ];

    el.stats.innerHTML = cards
      .map(
        (c) => `
        <div class="stat">
          <span class="stat-label">${c.label}</span>
          <span class="stat-value">${c.value}</span>
          <span class="stat-sub">${c.subHtml ? c.sub : escapeHtml(c.sub)}</span>
        </div>`
      )
      .join("");
  }

  /* ---------------------------------------------------------------------
   * Rendering: pie chart + legend
   * ------------------------------------------------------------------- */

  function renderChart(filtered) {
    const total = filtered.reduce((s, e) => s + e.amount, 0);
    el.chartValue.textContent = money(total);
    el.chartLabel.textContent = state.highlightCategory
      ? categoryOf(state.highlightCategory).label
      : "Total";

    const byCat = new Map();
    for (const e of filtered) byCat.set(e.category, (byCat.get(e.category) || 0) + e.amount);

    const rows = CATEGORIES.map((c) => ({ ...c, amount: byCat.get(c.id) || 0 })).filter(
      (r) => r.amount > 0
    );
    rows.sort((a, b) => b.amount - a.amount);

    if (!rows.length || total <= 0) {
      el.chart.innerHTML = `
        <circle cx="100" cy="100" r="82" fill="none" stroke="var(--border)" stroke-width="24"></circle>`;
      el.legend.innerHTML = `
        <li class="empty" style="padding:8px 0;">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9"/><path d="M9 12h6"/>
            </svg>
          </div>
          <h3>No spending yet</h3>
          <p>Add an expense or adjust your filters to see the breakdown.</p>
        </li>`;
      return;
    }

    const r = 82;
    const c = 100;
    const circumference = 2 * Math.PI * r;
    let offset = 0;

    const segs = rows.map((row) => {
      const frac = row.amount / total;
      const len = frac * circumference;
      const dasharray = `${len} ${circumference - len}`;
      const dashoffset = -offset;
      offset += len;
      return `<circle class="seg" data-cat="${row.id}" cx="${c}" cy="${c}" r="${r}" fill="none"
        stroke="${row.color}" stroke-width="24" stroke-dasharray="${dasharray}"
        stroke-dashoffset="${dashoffset}" transform="rotate(-90 ${c} ${c})">
        <title>${escapeHtml(row.label)}: ${money(row.amount)}</title>
      </circle>`;
    });

    el.chart.innerHTML = segs.join("");

    el.legend.innerHTML = rows
      .map((row) => {
        const pct = ((row.amount / total) * 100).toFixed(1);
        return `
        <li class="legend-item" data-cat="${row.id}">
          <span class="legend-swatch" style="background:${row.color}"></span>
          <span class="legend-body">
            <span class="legend-name"><span>${row.icon} ${escapeHtml(row.label)}</span><b>${money(row.amount)}</b></span>
            <span class="legend-bar"><i style="width:${pct}%;background:${row.color}"></i></span>
          </span>
          <span class="legend-pct">${pct}%</span>
        </li>`;
      })
      .join("");

    applyHighlight();
  }

  function applyHighlight() {
    const active = state.highlightCategory;
    el.chart.querySelectorAll(".seg").forEach((seg) => {
      seg.classList.toggle("is-dim", !!active && seg.dataset.cat !== active);
      seg.setAttribute("stroke-width", !!active && seg.dataset.cat === active ? "26" : "24");
    });
    el.legend.querySelectorAll(".legend-item").forEach((item) => {
      item.classList.toggle("is-dim", !!active && item.dataset.cat !== active);
    });
  }

  function setupChartInteraction() {
    const toggle = (catId) => {
      state.highlightCategory = state.highlightCategory === catId ? null : catId;
      applyHighlight();
      el.chartLabel.textContent = state.highlightCategory
        ? categoryOf(state.highlightCategory).label
        : "Total";
      const filtered = getFiltered();
      if (state.highlightCategory) {
        const sum = filtered
          .filter((e) => e.category === state.highlightCategory)
          .reduce((s, e) => s + e.amount, 0);
        el.chartValue.textContent = money(sum);
      } else {
        el.chartValue.textContent = money(filtered.reduce((s, e) => s + e.amount, 0));
      }
    };

    el.chart.addEventListener("click", (ev) => {
      const seg = ev.target.closest(".seg");
      if (seg) toggle(seg.dataset.cat);
    });
    el.legend.addEventListener("click", (ev) => {
      const item = ev.target.closest(".legend-item");
      if (item) toggle(item.dataset.cat);
    });
  }

  /* ---------------------------------------------------------------------
   * Rendering: expense list (grouped by day)
   * ------------------------------------------------------------------- */

  function formatDayHeading(dateStr) {
    const d = parseDateLocal(dateStr);
    const today = parseDateLocal(todayStr());
    const diffDays = Math.round((today - d) / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
  }

  function renderList(filtered) {
    const sorted = getSorted(filtered);
    el.listCount.textContent = String(sorted.length);

    if (!sorted.length) {
      el.expenseList.innerHTML = `
        <li class="empty">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 6h16M4 12h16M4 18h7"/>
            </svg>
          </div>
          <h3>No expenses match</h3>
          <p>Try widening your filters, or add a new expense from the panel on the left.</p>
          <button type="button" class="link-btn" id="emptyResetBtn">Reset filters</button>
        </li>`;
      const btn = document.getElementById("emptyResetBtn");
      if (btn) btn.addEventListener("click", resetFilters);
      return;
    }

    const isDateSort = state.sort.startsWith("date");
    let html = "";
    let lastDay = null;

    for (const e of sorted) {
      const cat = categoryOf(e.category);
      if (isDateSort && e.date !== lastDay) {
        lastDay = e.date;
        const dayTotal = sorted.filter((x) => x.date === e.date).reduce((s, x) => s + x.amount, 0);
        html += `<li class="day-head"><span>${formatDayHeading(e.date)}</span><span>${money(dayTotal)}</span></li>`;
      }
      const dateLabel = parseDateLocal(e.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      html += `
        <li class="expense" data-id="${e.id}" style="--c:${cat.color}">
          <span class="expense-icon">${cat.icon}</span>
          <span class="expense-main">
            <span class="expense-desc">${escapeHtml(e.desc || cat.label)}</span>
            <span class="expense-meta"><span class="cat-tag">${escapeHtml(cat.label)}</span> · ${isDateSort ? "" : dateLabel}</span>
          </span>
          <span class="expense-amount">${money(e.amount)}</span>
          <span class="expense-actions">
            <button type="button" class="row-btn" data-action="edit" title="Edit" aria-label="Edit expense">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
            <button type="button" class="row-btn danger" data-action="delete" title="Delete" aria-label="Delete expense">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
            </button>
          </span>
        </li>`;
    }
    el.expenseList.innerHTML = html;
  }

  /* ---------------------------------------------------------------------
   * escape helper
   * ------------------------------------------------------------------- */

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[m]));
  }

  /* ---------------------------------------------------------------------
   * Master render
   * ------------------------------------------------------------------- */

  function render() {
    const filtered = getFiltered();
    renderStats(filtered);
    renderChart(filtered);
    renderList(filtered);
    renderPeriodPill();
  }

  function renderPeriodPill() {
    const { preset, from, to } = state.filters;
    let text = "All time";
    if (preset === "month") text = "This month";
    else if (preset === "30") text = "Last 30 days";
    else if (preset === "year") text = "This year";
    else if (from || to) text = `${from || "…"} → ${to || "…"}`;
    el.periodPill.textContent = text;
  }

  /* ---------------------------------------------------------------------
   * Form: add / edit expense
   * ------------------------------------------------------------------- */

  function resetForm() {
    state.editingId = null;
    el.form.reset();
    el.date.value = todayStr();
    el.category.value = "food";
    el.formTitle.textContent = "Add expense";
    el.submitBtn.textContent = "Add expense";
    el.cancelEdit.hidden = true;
    hideFormError();
  }

  function showFormError(msg) {
    el.formError.textContent = msg;
    el.formError.hidden = false;
  }

  function hideFormError() {
    el.formError.hidden = true;
    el.formError.textContent = "";
  }

  function beginEdit(id) {
    const e = state.expenses.find((x) => x.id === id);
    if (!e) return;
    state.editingId = id;
    el.desc.value = e.desc;
    el.amount.value = e.amount;
    el.date.value = e.date;
    el.category.value = e.category;
    el.formTitle.textContent = "Edit expense";
    el.submitBtn.textContent = "Save changes";
    el.cancelEdit.hidden = false;
    hideFormError();
    document.querySelectorAll(".expense").forEach((li) => li.classList.toggle("is-editing", li.dataset.id === id));
    el.desc.focus();
    el.form.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    hideFormError();

    const desc = el.desc.value.trim();
    const amount = parseFloat(el.amount.value);
    const date = el.date.value;
    const category = el.category.value;

    if (!amount || isNaN(amount) || amount <= 0) {
      showFormError("Enter an amount greater than $0.");
      el.amount.focus();
      return;
    }
    if (!date) {
      showFormError("Pick a date for this expense.");
      el.date.focus();
      return;
    }

    if (state.editingId) {
      const e = state.expenses.find((x) => x.id === state.editingId);
      if (e) {
        e.desc = desc;
        e.amount = Math.round(amount * 100) / 100;
        e.date = date;
        e.category = category;
      }
      showToast("Expense updated.");
    } else {
      state.expenses.push({
        id: uid(),
        desc,
        amount: Math.round(amount * 100) / 100,
        date,
        category,
      });
      showToast("Expense added.");
    }

    save();
    resetForm();
    render();
  }

  let lastDeleted = null;
  let lastDeletedIndex = -1;

  function deleteExpense(id) {
    const idx = state.expenses.findIndex((x) => x.id === id);
    if (idx === -1) return;
    lastDeleted = state.expenses[idx];
    lastDeletedIndex = idx;
    state.expenses.splice(idx, 1);
    if (state.editingId === id) resetForm();
    save();
    render();
    showToast("Expense deleted.", true);
  }

  function undoDelete() {
    if (!lastDeleted) return;
    const idx = Math.min(lastDeletedIndex, state.expenses.length);
    state.expenses.splice(idx, 0, lastDeleted);
    lastDeleted = null;
    save();
    render();
    hideToast();
  }

  /* ---------------------------------------------------------------------
   * Toast
   * ------------------------------------------------------------------- */

  let toastTimer = null;

  function showToast(msg, withUndo = false) {
    el.toastMsg.textContent = msg;
    el.toastAction.hidden = !withUndo;
    el.toast.hidden = false;
    requestAnimationFrame(() => el.toast.classList.add("is-visible"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 4500);
  }

  function hideToast() {
    el.toast.classList.remove("is-visible");
    clearTimeout(toastTimer);
    setTimeout(() => {
      if (!el.toast.classList.contains("is-visible")) el.toast.hidden = true;
    }, 200);
  }

  /* ---------------------------------------------------------------------
   * Filters
   * ------------------------------------------------------------------- */

  function resetFilters() {
    state.filters = { search: "", category: "all", from: "", to: "", preset: "all" };
    el.filterSearch.value = "";
    el.filterCategory.value = "all";
    el.filterFrom.value = "";
    el.filterTo.value = "";
    setActivePreset("all");
    render();
  }

  function setActivePreset(preset) {
    el.presets.querySelectorAll(".chip").forEach((chip) => {
      chip.classList.toggle("is-active", chip.dataset.preset === preset);
    });
  }

  function applyPreset(preset) {
    const now = new Date();
    let from = "";
    let to = "";

    if (preset === "month") {
      from = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
      to = todayStr();
    } else if (preset === "30") {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      from = toDateStr(d);
      to = todayStr();
    } else if (preset === "year") {
      from = toDateStr(new Date(now.getFullYear(), 0, 1));
      to = todayStr();
    }

    state.filters.preset = preset;
    state.filters.from = from;
    state.filters.to = to;
    el.filterFrom.value = from;
    el.filterTo.value = to;
    setActivePreset(preset);
    render();
  }

  /* ---------------------------------------------------------------------
   * Export CSV
   * ------------------------------------------------------------------- */

  function exportCsv() {
    const rows = getSorted(getFiltered());
    if (!rows.length) {
      showToast("Nothing to export with current filters.");
      return;
    }
    const header = ["Date", "Description", "Category", "Amount"];
    const lines = [header.join(",")];
    for (const e of rows) {
      const fields = [e.date, e.desc || "", categoryOf(e.category).label, e.amount.toFixed(2)];
      lines.push(
        fields
          .map((f) => (/[",\n]/.test(f) ? `"${String(f).replace(/"/g, '""')}"` : f))
          .join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses-${todayStr()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* ---------------------------------------------------------------------
   * Theme
   * ------------------------------------------------------------------- */

  function initTheme() {
    let theme = localStorage.getItem(THEME_KEY);
    if (!theme) {
      theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    applyTheme(theme);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    applyTheme(current === "dark" ? "light" : "dark");
  }

  /* ---------------------------------------------------------------------
   * Event wiring
   * ------------------------------------------------------------------- */

  function wireEvents() {
    el.form.addEventListener("submit", handleSubmit);
    el.cancelEdit.addEventListener("click", resetForm);

    el.expenseList.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".row-btn");
      if (!btn) return;
      const li = ev.target.closest(".expense");
      if (!li) return;
      const id = li.dataset.id;
      if (btn.dataset.action === "edit") beginEdit(id);
      else if (btn.dataset.action === "delete") deleteExpense(id);
    });

    el.filterSearch.addEventListener("input", () => {
      state.filters.search = el.filterSearch.value;
      render();
    });

    el.filterCategory.addEventListener("change", () => {
      state.filters.category = el.filterCategory.value;
      render();
    });

    el.filterFrom.addEventListener("change", () => {
      state.filters.from = el.filterFrom.value;
      state.filters.preset = "custom";
      setActivePreset("custom");
      render();
    });

    el.filterTo.addEventListener("change", () => {
      state.filters.to = el.filterTo.value;
      state.filters.preset = "custom";
      setActivePreset("custom");
      render();
    });

    el.presets.addEventListener("click", (ev) => {
      const chip = ev.target.closest(".chip");
      if (!chip) return;
      applyPreset(chip.dataset.preset);
    });

    el.resetFilters.addEventListener("click", resetFilters);

    el.sortBy.addEventListener("change", () => {
      state.sort = el.sortBy.value;
      render();
    });

    el.themeBtn.addEventListener("click", toggleTheme);
    el.exportBtn.addEventListener("click", exportCsv);
    el.toastAction.addEventListener("click", undoDelete);

    setupChartInteraction();
  }

  /* ---------------------------------------------------------------------
   * Init
   * ------------------------------------------------------------------- */

  function init() {
    initTheme();
    populateCategorySelects();
    state.expenses = loadExpenses();
    wireEvents();
    resetForm();
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
