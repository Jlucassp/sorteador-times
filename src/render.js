import { state, el } from "./state.js";
import { getPlayerStats } from "./rating.js";
import { getRacha } from "./storage.js";
import {
  formations,
  getTeamStats,
  calculateOverallBalance,
} from "./balance.js";

export function showMessage(text, type = "success") {
  let box = el("message-box");
  if (!box) {
    // cria um container flutuante se não existir no DOM
    box = document.createElement("div");
    box.id = "message-box";
    box.className = "hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-50";
    document.body.appendChild(box);
  }
  box.textContent = text;
  box.className = `p-3 rounded-md text-center text-sm shadow ${
    type === "error" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
  }`;
  box.classList.remove("hidden");
  setTimeout(() => box.classList.add("hidden"), 3000);
}

export function toggleLoading(isLoading) {
  el("generate-btn-text").classList.toggle("hidden", isLoading);
  el("loading-spinner").classList.toggle("hidden", !isLoading);
  el("generate-teams").disabled = isLoading;
}

export function renderPlayerList() {
  const listEl = el("player-list");
  const cntEl = el("player-count");
  const search = el("player-search");
  const normalize = (s) =>
    (s || "")
      .toString()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();

  listEl.innerHTML = "";
  const term = search ? normalize(search.value) : "";
  const base = [...state.players].sort((a, b) => a.name.localeCompare(b.name));
  const list = term
    ? base.filter((p) => normalize(p.name).includes(term))
    : base;

  list.forEach((p) => {
    const row = document.createElement("div");
    row.className =
      "flex justify-between items-center bg-gray-50 p-2 rounded-md";
    row.innerHTML = `
      <div class="flex items-center">
        <input type="checkbox" data-id="${
          p.id
        }" class="select-player h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 mr-3" ${
      state.selectedPlayerIds.has(p.id) ? "checked" : ""
    } />
        <div>
          <p class="font-semibold">${p.name}</p>
          <p class="text-xs text-gray-500">Habil.: ${p.skill} | Posição: ${
      p.position
    }${
      p.secondaryPositions?.length
        ? ` | Sec.: ${p.secondaryPositions.join(", ")}`
        : ""
    }</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button data-id="${
          p.id
        }" class="edit-player text-xs md:text-xs text-blue-600 hover:text-blue-800 px-2 py-1 -mx-2 -my-1 rounded">Editar</button>
        <button data-id="${
          p.id
        }" class="remove-player text-red-500 hover:text-red-700 font-bold text-lg px-2 py-1 -mx-2 -my-1 rounded">&times;</button>
      </div>`;
    listEl.appendChild(row);
  });
  cntEl.textContent = state.players.length;
  renderSelectedPlayers();
}

export function renderSelectedPlayers() {
  const wrap = el("selected-player-list");
  const cnt = el("selected-player-count");
  wrap.className =
    "flex flex-wrap gap-2 mt-2 max-h-40 overflow-y-auto pr-2 bg-indigo-50 p-2 rounded-md";
  wrap.innerHTML = "";
  if (!state.selectedPlayerIds.size) {
    wrap.innerHTML =
      '<p class="text-xs text-gray-500">Nenhum jogador convocado.</p>';
  } else {
    [...state.players]
      .filter((p) => state.selectedPlayerIds.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((p) => {
        const chip = document.createElement("span");
        chip.className =
          "inline-flex items-center gap-1 text-xs text-gray-700 bg-white border border-gray-200 px-2 py-1 rounded-full shadow-sm";
        chip.textContent = p.name;
        wrap.appendChild(chip);
      });
  }
  cnt.textContent = state.selectedPlayerIds.size;
}

export function updateBalanceChart() {
  const labels = state.teams.map((t) => t.name);
  const avgs = state.teams.map((t) => getTeamStats(t.players).avgSkill);

  if (state.balanceChart) {
    state.balanceChart.data.labels = labels;
    state.balanceChart.data.datasets[0].data = avgs;
    state.balanceChart.update();
    return;
  }
  const ctx = el("balance-chart").getContext("2d");
  state.balanceChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Média de Habilidade",
          data: avgs,
          backgroundColor: "rgba(74,85,104,0.6)",
          borderColor: "rgba(74,85,104,1)",
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, grid: { color: "#e2e8f0" } },
        x: { grid: { display: false } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (c) => `Média: ${c.parsed.y.toFixed(2)}` },
        },
      },
    },
  });
}

export function renderBalanceMetrics() {
  const { stdDev, range, fillRate, minAvg, maxAvg } = calculateOverallBalance();
  el("balance-metrics").innerHTML = `
    <div class="p-2"><p class="text-sm text-gray-500">Desvio Padrão Habil.</p><p class="text-2xl font-bold text-gray-800">${stdDev.toFixed(
      2
    )}</p></div>
    <div class="p-2"><p class="text-sm text-gray-500">Amplitude Habil. (Max-Min)</p><p class="text-2xl font-bold text-gray-800">${range.toFixed(
      2
    )}</p></div>
    <div class="p-2"><p class="text-sm text-gray-500">Média Habil. (Min/Max)</p><p class="text-2xl font-bold text-gray-800">${minAvg.toFixed(
      2
    )} / ${maxAvg.toFixed(2)}</p></div>
    <div class="p-2"><p class="text-sm text-gray-500">Encaixe Posicional</p><p class="text-2xl font-bold text-gray-800">${fillRate.toFixed(
      0
    )}%</p></div>`;
  updateBalanceChart();
}

export function renderTeams() {
  const container = el("teams-container");
  container.innerHTML = "";
  // Jogadores presentes em QUALQUER time atualmente (pós-drag)
  const globalPresent = new Set(
    state.teams.flatMap((t) => t.players.map((p) => p.id))
  );

  state.teams.forEach((team, index) => {
    const st = getTeamStats(team.players);
    let posCounts = "";
    const key = el("formation").value;
    const counts = st.positions || {};
    if (key !== "auto") {
      const f = formations[key];
      posCounts = Object.keys(f)
        .filter((k) => k !== "total")
        .map((pos) => {
          const have = counts[pos] || 0;
          const need = f[pos];
          const ok = have === need;
          return `<span class="text-xs px-2 py-1 rounded-full ${
            ok ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
          }">${pos}: ${have}/${need}</span>`;
        })
        .join(" ");
    } else {
      // formação automática: exibe só o total por posição
      ["DEF", "MEI", "ATA"].forEach((pos) => {
        const have = counts[pos] || 0;
        posCounts += `<span class="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">${pos}: ${have}</span> `;
      });
    }

    const card = document.createElement("div");
    card.className = "card p-4 space-y-3";
    card.innerHTML = `
      <div class="flex justify-between items-start">
        <h3 id="team-name-${index}" class="text-xl font-bold text-gray-800">${
      team.name
    }</h3>
        <span class="font-semibold text-gray-700 whitespace-nowrap">Média: ${st.avgSkill.toFixed(
          2
        )}</span>
      </div>
      <div class="flex flex-wrap gap-1">${posCounts}</div>
      <div id="team-list-${index}" data-team-id="${index}" class="team-list min-h-[100px] bg-gray-50 rounded-md p-2 space-y-2"></div>
      <button class="generate-ai-name-btn w-full btn-ai font-bold py-2 px-4 rounded-md text-sm mt-2" data-team-index="${index}">
        <span>Gerar Nome com IA ✨</span>
        <div class="ai-loading-spinner hidden"></div>
      </button>`;
    container.appendChild(card);

    const listEl = document.getElementById(`team-list-${index}`);

    // Placeholders SOMENTE para rachas finalizados e apenas se o jogador
    // não estiver em NENHUM time atual (sumiu do elenco)
    const r = getRacha(state.currentRachaId);
    if (r && r.finalized && Array.isArray(r.teams?.[index]?.playerIds)) {
      r.teams[index].playerIds.forEach((pid) => {
        if (!globalPresent.has(pid)) {
          team.players.push({
            id: pid,
            name: (r.playerNames?.[pid] || `Jogador ${pid}`) + " (indisp.)",
            skill: 0,
            position: "MEI",
          });
        }
      });
    }

    team.players
      .sort((a, b) => {
        const order = { DEF: 0, MEI: 1, ATA: 2 };
        return order[a.position] - order[b.position] || b.skill - a.skill;
      })
      .forEach((p) => {
        const stats = state.currentRachaId
          ? getPlayerStats(state.currentRachaId, p.id)
          : { goals: 0, assists: 0 };
        const row = document.createElement("div");
        row.className =
          "player-item bg-white border border-gray-200 p-2 md:p-2.5 rounded-md flex justify-between items-center hover:border-gray-300";
        row.dataset.playerId = p.id;
        row.innerHTML = `
        <span class="truncate max-w-[55%] md:max-w-[60%]">${p.name}</span>
        <div class="flex items-center gap-1">
          <button class="stat-btn btn-goal-dec text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200" data-pid="${p.id}">−G</button>
          <button class="stat-btn btn-goal text-xs px-2 py-1 rounded bg-emerald-600 text-white" data-pid="${p.id}">+G</button>
          <span class="text-[11px] min-w-[20px] text-center" id="g-${p.id}">${stats.goals}</span>
          <button class="stat-btn btn-assist-dec text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200" data-pid="${p.id}">−A</button>
          <button class="stat-btn btn-assist text-xs px-2 py-1 rounded bg-blue-600 text-white" data-pid="${p.id}">+A</button>
          <span class="text-[11px] min-w-[20px] text-center" id="a-${p.id}">${stats.assists}</span>
          <span class="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200 ml-1">
+            ${state.showRatings ? `${p.skill.toFixed(1)} • ${p.position}` : `${p.position}`}
+          </span>
        </div>`;
        listEl.appendChild(row);
      });
  });

  /* === Drag & Drop entre times (Sortable) === */
  // destrói instâncias antigas para não acumular listeners a cada render
  if (!state.sortables) state.sortables = [];
  state.sortables.forEach((s) => s && s.destroy());
  state.sortables = [];

  document.querySelectorAll(".team-list").forEach((list) => {
    const s = new Sortable(list, {
      group: { name: "teams", pull: true, put: true },
      animation: 150,
      draggable: ".player-item",
      ghostClass: "sortable-ghost",
      filter: ".stat-btn",
      preventOnFilter: true,
      forceFallback: true,
      fallbackTolerance: 3,
      onEnd: (evt) => {
        const playerId = parseInt(evt.item.dataset.playerId, 10);
        const fromTeamId = parseInt(evt.from.dataset.teamId, 10);
        const toTeamId = parseInt(evt.to.dataset.teamId, 10);
        if ([playerId, fromTeamId, toTeamId].some(Number.isNaN)) return;
        if (fromTeamId === toTeamId) return;

        // move no estado global
        let moved;
        state.teams[fromTeamId].players = state.teams[
          fromTeamId
        ].players.filter((p) => {
          if (p.id === playerId) {
            moved = p;
            return false;
          }
          return true;
        });
        if (moved) state.teams[toTeamId].players.push(moved);

        // re-render para recalcular médias/badges e reativar DnD
        renderTeams();
      },
    });
    state.sortables.push(s);
  });

  renderBalanceMetrics();
}
