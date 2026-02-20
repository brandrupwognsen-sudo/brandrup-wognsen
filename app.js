// 1) Paste your published CSV URL here
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRLd0UC6DIttAL_BpaUuZ-gPD3hyX2JkIP01Rp5ctv61X3Nlf9JvAXZfDm5ZiHG9Pv8M7Zf27unc2K6/pub?gid=0&single=true&output=csv";

// 2) Column names as they appear in your sheet header row
// Adjust only if your header text differs.
const COLS = {
  producer: "Producent",
  whisky: "Whisky",
  name: "Producent & Whisky",
  country: "Land",
  avg: "Betyg Genomsnitt",
  johan: "Betyg Johan",
  erik: "Betyg Erik",
  age: "Ålder",
  abv: "Alk%"
};

const el = (id) => document.getElementById(id);

let RAW = [];
let MODE = "avg";
let chart = null;

function setStatus(msg, isError = false) {
  el("status").innerHTML = isError ? `<span class="error">${msg}</span>` : msg;
}

function parseNumber(s) {
  if (s == null) return null;
  const t = String(s).trim();
  if (!t) return null;
  // Swedish decimals often use comma:
  const normalized = t.replace(/\s+/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function csvToRows(csvText) {
  // Simple CSV parser (handles quoted fields)
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const c = csvText[i];
    const next = csvText[i + 1];

    if (c === '"' && inQuotes && next === '"') { cur += '"'; i++; continue; }
    if (c === '"') { inQuotes = !inQuotes; continue; }

    if (!inQuotes && c === ",") { row.push(cur); cur = ""; continue; }
    if (!inQuotes && (c === "\n" || c === "\r")) {
      if (c === "\r" && next === "\n") i++;
      row.push(cur);
      // ignore empty last line
      if (row.some(cell => String(cell).trim() !== "")) rows.push(row);
      row = [];
      cur = "";
      continue;
    }
    cur += c;
  }
  row.push(cur);
  if (row.some(cell => String(cell).trim() !== "")) rows.push(row);
  return rows;
}

function normalizeData(objects) {
  return objects.map(o => {
    const name = (o[COLS.name] || `${o[COLS.producer] || ""} ${o[COLS.whisky] || ""}`).trim();
    return {
      producer: (o[COLS.producer] || "").trim(),
      whisky: (o[COLS.whisky] || "").trim(),
      name,
      country: (o[COLS.country] || "").trim(),
      avg: parseNumber(o[COLS.avg]),
      johan: parseNumber(o[COLS.johan]),
      erik: parseNumber(o[COLS.erik]),
      age: parseNumber(o[COLS.age]),
      abv: parseNumber(o[COLS.abv])
    };
  }).filter(r => r.name); // drop blank rows
}

function buildObjectsFromCsv(csvText) {
  const rows = csvToRows(csvText);
  if (rows.length < 2) return [];
  const header = rows[0].map(h => h.trim());
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const obj = {};
    for (let j = 0; j < header.length; j++) {
      obj[header[j]] = rows[i][j] ?? "";
    }
    out.push(obj);
  }
  return out;
}

function fillCountries(data) {
  const countries = [...new Set(data.map(d => d.country).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const sel = el("country");
  sel.innerHTML = `<option value="">All</option>` + countries.map(c => `<option value="${c}">${c}</option>`).join("");
}

function filterAndSort(data) {
  const q = el("q").value.trim().toLowerCase();
  const country = el("country").value;

  let out = data.filter(d => {
    if (country && d.country !== country) return false;
    if (!q) return true;
    return (
      d.name.toLowerCase().includes(q) ||
      d.producer.toLowerCase().includes(q) ||
      d.whisky.toLowerCase().includes(q) ||
      d.country.toLowerCase().includes(q)
    );
  });

  const sort = el("sort").value;
  const byName = (a,b) => a.name.localeCompare(b.name);
  if (sort === "name_asc") out.sort(byName);
  if (sort === "name_desc") out.sort((a,b)=>byName(b,a));
  if (sort === "avg_desc") out.sort((a,b)=>(b.avg ?? -Infinity) - (a.avg ?? -Infinity));
  if (sort === "avg_asc") out.sort((a,b)=>(a.avg ?? Infinity) - (b.avg ?? Infinity));

  return out;
}

function renderTable(data) {
  const tbody = el("tbody");
  tbody.innerHTML = data.map(d => `
    <tr>
      <td>${escapeHtml(d.producer)}</td>
      <td>${escapeHtml(d.whisky)}</td>
      <td>${escapeHtml(d.country)}</td>
      <td>${fmt(d.avg)}</td>
      <td>${fmt(d.johan)}</td>
      <td>${fmt(d.erik)}</td>
      <td>${fmtInt(d.age)}</td>
      <td>${fmtInt(d.abv)}</td>
    </tr>
  `).join("");
}

function renderCards(data) {
  const cards = el("cards");
  cards.innerHTML = data.map(d => `
    <div class="card">
      <h3>${escapeHtml(d.name)}</h3>
      <div class="meta">
        <span class="pill">${escapeHtml(d.country || "—")}</span>
        <span class="pill">Avg: <span class="score">${fmt(d.avg)}</span></span>
        <span class="pill">Johan: <span class="score">${fmt(d.johan)}</span></span>
        <span class="pill">Erik: <span class="score">${fmt(d.erik)}</span></span>
        ${d.age != null ? `<span class="pill">Age: ${fmtInt(d.age)}</span>` : ""}
        ${d.abv != null ? `<span class="pill">ABV: ${fmtInt(d.abv)}%</span>` : ""}
      </div>
    </div>
  `).join("");
}

function top10(data) {
  const key = MODE === "avg" ? "avg" : (MODE === "johan" ? "johan" : "erik");
  return [...data]
    .filter(d => d[key] != null)
    .sort((a,b)=>b[key]-a[key])
    .slice(0, 10);
}

function renderChart(data) {
  const items = top10(data);
  const key = MODE === "avg" ? "avg" : (MODE === "johan" ? "johan" : "erik");
  const labels = items.map(i => i.name);
  const values = items.map(i => i[key]);

  const ctx = el("chart").getContext("2d");
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: MODE === "avg" ? "Avg" : (MODE === "johan" ? "Johan" : "Erik"), data: values }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          beginAtZero: false,
          grace: '5%'
          }
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${c.raw}` } }
      }
    }
  });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function fmt(n) { return n == null ? "—" : n.toFixed(1).replace(".", ","); }
function fmtInt(n) { return n == null ? "—" : String(Math.round(n)); }

function rerender() {
  const view = filterAndSort(RAW);
  setStatus(`${view.length} whiskies shown`);
  renderChart(view);
  renderTable(view);
  renderCards(view);
}

function setupTabs() {
  el("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    MODE = btn.dataset.mode;
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    rerender();
  });
}

async function init() {
  setStatus("Loading data…");
  setupTabs();

  ["q", "country", "sort"].forEach(id => el(id).addEventListener("input", rerender));
  el("country").addEventListener("change", rerender);
  el("sort").addEventListener("change", rerender);

  try {
    const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv = await res.text();

    const objs = buildObjectsFromCsv(csv);
    const data = normalizeData(objs);

    const missing = Object.values(COLS).filter(h => !(h in (objs[0] || {})));
    if (missing.length) {
      setStatus(`Missing columns in CSV: ${missing.join(", ")}. Check header names in the sheet.`, true);
    }

    RAW = data;
    fillCountries(RAW);
    rerender();
  } catch (err) {
    setStatus(`Could not load data. Check your published CSV URL. (${err.message})`, true);
  }
}

init();
