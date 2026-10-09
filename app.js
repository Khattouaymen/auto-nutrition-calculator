"use strict";

const LS = { key: "nutri_apiKey", model: "nutri_model", goal: "nutri_goal", meals: "nutri_meals" };
const $ = (id) => document.getElementById(id);

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

let meals = JSON.parse(store.get(LS.meals, "[]"));
let currentDate = todayStr();
let pending = null; // analyse en attente de confirmation

function todayStr(d = new Date()) {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d - off).toISOString().slice(0, 10);
}
const getGoal = () => Number(store.get(LS.goal, 2000)) || 2000;
const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const saveMeals = () => store.set(LS.meals, JSON.stringify(meals));

// ---------- Gemini ----------
const SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          quantity: { type: "STRING" },
          kcal: { type: "NUMBER" },
          protein: { type: "NUMBER" },
          carbs: { type: "NUMBER" },
          fat: { type: "NUMBER" },
          fiber: { type: "NUMBER" },
        },
        required: ["name", "quantity", "kcal", "protein", "carbs", "fat", "fiber"],
      },
    },
  },
  required: ["items"],
};

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(",")[1]);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

async function analyze(text, photo) {
  const apiKey = store.get(LS.key, "");
  if (!apiKey) throw new Error("Ajoutez votre clé API Gemini dans les réglages.");
  const model = store.get(LS.model, "gemini-2.5-flash");

  const parts = [{
    text:
      "Tu es un nutritionniste. Décompose ce repas en aliments et estime pour chacun la quantité " +
      "(en g/ml/unités) et les valeurs nutritionnelles pour cette quantité : kcal, protéines (g), " +
      "glucides (g), lipides (g), fibres (g). Si aucune quantité n'est donnée, suppose une portion normale. " +
      "Réponds en français.\n\nRepas : " + (text || "(voir la photo)"),
  }];
  if (photo) parts.push({ inline_data: { mime_type: photo.type || "image/jpeg", data: await fileToBase64(photo) } });

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.2 },
      }),
    }
  );
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error?.message || `Erreur API (${resp.status})`);
  const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  const parsed = JSON.parse(raw);
  if (!parsed.items?.length) throw new Error("Aucun aliment détecté.");
  return parsed.items.map((i) => ({
    name: String(i.name), quantity: String(i.quantity),
    kcal: r1(i.kcal), protein: r1(i.protein), carbs: r1(i.carbs), fat: r1(i.fat), fiber: r1(i.fiber),
  }));
}

// ---------- Calculs ----------
function totals(items) {
  return items.reduce(
    (t, i) => ({ kcal: t.kcal + i.kcal, protein: t.protein + i.protein, carbs: t.carbs + i.carbs, fat: t.fat + i.fat, fiber: t.fiber + i.fiber }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );
}
const mealTotals = (m) => totals(m.items);
const dayMeals = (date) => meals.filter((m) => m.date === date);
function dayTotals(date) {
  return totals(dayMeals(date).flatMap((m) => m.items));
}

// ---------- Rendu ----------
function itemsTable(items) {
  const t = totals(items);
  const rows = items.map((i) =>
    `<tr><td>${esc(i.name)} <span class="muted">${esc(i.quantity)}</span></td><td>${i.kcal}</td><td>${i.protein}</td><td>${i.carbs}</td><td>${i.fat}</td><td>${i.fiber}</td></tr>`
  ).join("");
  return `<thead><tr><th>Aliment</th><th>kcal</th><th>P</th><th>G</th><th>L</th><th>Fib.</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td>Total</td><td>${r1(t.kcal)}</td><td>${r1(t.protein)}</td><td>${r1(t.carbs)}</td><td>${r1(t.fat)}</td><td>${r1(t.fiber)}</td></tr></tfoot>`;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function render() {
  $("dateInput").value = currentDate;
  const goal = getGoal();
  const t = dayTotals(currentDate);
  $("kcalTotal").textContent = Math.round(t.kcal);
  $("kcalGoalLabel").textContent = goal;
  const pct = Math.min(100, (t.kcal / goal) * 100);
  $("kcalBar").style.width = pct + "%";
  $("kcalBar").classList.toggle("over", t.kcal > goal);
  const rest = Math.round(goal - t.kcal);
  $("kcalRemaining").textContent = rest >= 0 ? `Il reste ${rest} kcal` : `Dépassement de ${-rest} kcal`;
  $("mProt").textContent = r1(t.protein);
  $("mCarb").textContent = r1(t.carbs);
  $("mFat").textContent = r1(t.fat);
  $("mFib").textContent = r1(t.fiber);

  const list = dayMeals(currentDate);
  $("mealList").innerHTML = list.length
    ? list.map((m) => {
        const mt = mealTotals(m);
        return `<div class="meal">
          <div class="meal-head"><strong>${esc(m.type)} — ${Math.round(mt.kcal)} kcal</strong>
          <button data-del="${m.id}" title="Supprimer">✕</button></div>
          ${m.text ? `<div class="muted">${esc(m.text)}</div>` : ""}
          <table>${itemsTable(m.items)}</table></div>`;
      }).join("")
    : `<p class="muted">Aucun repas enregistré pour ce jour.</p>`;

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(todayStr(d));
  }
  $("history").innerHTML = days.map((d) => {
    const dt = dayTotals(d);
    return `<div class="hist-row" data-date="${d}"><span>${d}</span><span>${Math.round(dt.kcal)} kcal · P ${r1(dt.protein)} · G ${r1(dt.carbs)} · L ${r1(dt.fat)}</span></div>`;
  }).join("");
}

// ---------- Événements ----------
$("analyzeBtn").onclick = async () => {
  const text = $("mealText").value.trim();
  const photo = $("mealPhoto").files[0];
  if (!text && !photo) { $("status").textContent = "Décrivez votre repas ou ajoutez une photo."; return; }
  $("analyzeBtn").disabled = true;
  $("status").className = "muted";
  $("status").textContent = "Analyse en cours…";
  try {
    const items = await analyze(text, photo);
    pending = { text, items };
    $("previewTable").innerHTML = itemsTable(items);
    $("preview").hidden = false;
    $("status").textContent = "Estimation générée par IA — vérifiez avant d'enregistrer.";
  } catch (e) {
    $("status").className = "err";
    $("status").textContent = e.message;
  } finally {
    $("analyzeBtn").disabled = false;
  }
};

function resetForm() {
  pending = null;
  $("preview").hidden = true;
  $("mealText").value = "";
  $("mealPhoto").value = "";
  $("photoName").textContent = "";
}
$("saveBtn").onclick = () => {
  if (!pending) return;
  meals.push({ id: Date.now().toString(36), date: currentDate, type: $("mealType").value, text: pending.text, items: pending.items });
  saveMeals();
  resetForm();
  $("status").textContent = "Repas enregistré ✔";
  render();
};
$("discardBtn").onclick = () => { resetForm(); $("status").textContent = ""; };
$("mealPhoto").onchange = (e) => { $("photoName").textContent = e.target.files[0]?.name || ""; };

$("mealList").onclick = (e) => {
  const id = e.target.dataset?.del;
  if (id && confirm("Supprimer ce repas ?")) {
    meals = meals.filter((m) => m.id !== id);
    saveMeals(); render();
  }
};
$("history").onclick = (e) => {
  const row = e.target.closest("[data-date]");
  if (row) { currentDate = row.dataset.date; render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
};
$("dateInput").onchange = (e) => { if (e.target.value) { currentDate = e.target.value; render(); } };
const shift = (n) => { const d = new Date(currentDate + "T12:00:00"); d.setDate(d.getDate() + n); currentDate = todayStr(d); render(); };
$("prevDay").onclick = () => shift(-1);
$("nextDay").onclick = () => shift(1);

$("exportBtn").onclick = () => {
  const blob = new Blob([JSON.stringify(meals, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "repas.json";
  a.click();
  URL.revokeObjectURL(a.href);
};

$("settingsBtn").onclick = () => {
  $("apiKey").value = store.get(LS.key, "");
  $("model").value = store.get(LS.model, "gemini-2.5-flash");
  $("goal").value = getGoal();
  $("settings").showModal();
};
$("saveSettings").onclick = () => {
  store.set(LS.key, $("apiKey").value.trim());
  store.set(LS.model, $("model").value.trim() || "gemini-2.5-flash");
  store.set(LS.goal, $("goal").value);
  render();
};

render();
if (!store.get(LS.key, "")) $("settings").showModal();
