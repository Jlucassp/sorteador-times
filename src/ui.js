import { state, el } from "./state.js";
import {
  getPlayers,
  setPlayers,
  getSavedDraws,
  setSavedDraws,
  getSavedSquads,
  setSavedSquads,
  getRachas,
  setRachas,
  makeRachaId,
  getRacha,
  upsertRacha,
  snapshotTeams,
  getActiveRachaId,
  setActiveRachaId,
} from "./storage.js";
import {
  renderPlayerList,
  renderSelectedPlayers,
  renderTeams,
  showMessage,
  toggleLoading,
} from "./render.js";
import { runBalancingAlgorithm } from "./balance.js";
import {
  getPlayerStats,
  setPlayerStats,
  updateRatingsFromRachas,
  applyFormToEffectiveSkill,
} from "./rating.js";

export function initUI() {
  // estado inicial
  state.players = getPlayers();
  renderPlayerList();

  // Pesquisa
  const search = el("player-search");
  if (search) search.addEventListener("input", () => renderPlayerList());

  // Adicionar jogador
  const form = el("add-player-form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const sec = Array.from(el("player-position-sec").selectedOptions).map(
        (o) => o.value
      );
      const p = {
        id: Date.now(),
        name: el("player-name").value.trim(),
        skill: parseFloat(el("player-skill").value),
        position: el("player-position").value,
        secondaryPositions: sec,
      };
      state.players.push(p);
      setPlayers(state.players);
      form.reset();
      el("player-position-sec").selectedIndex = -1;
      renderPlayerList();
    });
  }

  // Listeners do elenco
  el("player-list").addEventListener("click", (e) => {
    const t = e.target;
    if (t.classList.contains("select-player")) {
      const id = parseInt(t.getAttribute("data-id"), 10);
      if (t.checked) state.selectedPlayerIds.add(id);
      else state.selectedPlayerIds.delete(id);
      renderSelectedPlayers();
    }
    if (t.classList.contains("remove-player")) {
      const id = parseInt(t.getAttribute("data-id"), 10);
      state.players = state.players.filter((p) => p.id !== id);
      state.selectedPlayerIds.delete(id);
      setPlayers(state.players);
      renderPlayerList();
    }
    if (t.classList.contains("edit-player")) {
      // abrir modal (reutilize seu modal existente)
      document.getElementById("edit-id").value = t.getAttribute("data-id");
      const p = state.players.find(
        (x) => x.id === parseInt(t.getAttribute("data-id"), 10)
      );
      if (!p) return;
      document.getElementById("edit-name").value = p.name;
      document.getElementById("edit-skill").value = p.skill;
      document.getElementById("edit-position").value = p.position;
      Array.from(document.getElementById("edit-position-sec").options).forEach(
        (o) => (o.selected = p.secondaryPositions?.includes(o.value))
      );
      document.getElementById("edit-modal").classList.remove("hidden");
      document.getElementById("edit-modal").classList.add("flex");
    }
  });

  // Modal: salvar edição
  const editForm = el("edit-player-form");
  if (editForm) {
    const close = () => {
      el("edit-modal").classList.add("hidden");
      el("edit-modal").classList.remove("flex");
      editForm.reset();
    };
    el("edit-cancel").addEventListener("click", close);
    el("edit-cancel-x").addEventListener("click", close);
    el("edit-modal").addEventListener("click", (e) => {
      if (e.target.id === "edit-modal") close();
    });

    editForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = parseInt(document.getElementById("edit-id").value, 10);
      const i = state.players.findIndex((p) => p.id === id);
      if (i === -1) return;
      state.players[i] = {
        ...state.players[i],
        name: document.getElementById("edit-name").value.trim(),
        skill: Math.max(
          1,
          Math.min(
            10,
            parseFloat(document.getElementById("edit-skill").value, 10)
          )
        ),
        position: document.getElementById("edit-position").value,
        secondaryPositions: Array.from(
          document.getElementById("edit-position-sec").selectedOptions
        ).map((o) => o.value),
      };
      setPlayers(state.players);
      renderPlayerList();
      renderSelectedPlayers();
      close();
      showMessage("Jogador atualizado com sucesso.");
    });
  }

  // Limpar elenco
  const clear = el("clear-roster");
  if (clear) {
    clear.addEventListener("click", () => {
      if (
        confirm(
          "Tem certeza de que deseja limpar todo o elenco principal? Esta ação não pode ser desfeita."
        )
      ) {
        state.players = [];
        state.selectedPlayerIds.clear();
        setPlayers(state.players);
        renderPlayerList();
      }
    });
  }

  // Mostrar notas (checkbox)
  const chk = el("show-ratings");
  if (chk) {
    state.showRatings = !!chk.checked;
    chk.addEventListener("change", () => {
      state.showRatings = chk.checked;
      if (state.teams.length) renderTeams();
    });
  }

  // Botão mobile
  const mob = el("generate-teams-mobile");
  if (mob) mob.addEventListener("click", () => el("generate-teams").click());

  // Sortear times
  el("generate-teams").addEventListener("click", () => {
    const playersForDraw = state.players.filter((p) =>
      state.selectedPlayerIds.has(p.id)
    );
    if (playersForDraw.length !== 24) {
      showMessage(
        `Selecione exatamente 24 jogadores (atual: ${playersForDraw.length}).`,
        "error"
      );
      return;
    }

    // cria SEMPRE um novo racha para este sorteio
    const name = (el("racha-name")?.value || "").trim();
    const id = makeRachaId(name);
    const all = getRachas();
    all[id] = {
      id,
      name: name || id.split("__")[0],
      createdAt: Date.now(),
      finalized: false,
      teams: [],          // vamos preencher após o algoritmo
      stats: {},
      playerNames: {},    // idem
    };
    setRachas(all);
    state.currentRachaId = id;
    setActiveRachaId(id);
    el("current-racha-label").textContent = `Racha: ${all[id].name}`;

    // atualiza dropdown imediatamente
    refreshRachasDropdown();

    // Seleciona o recém-criado no select (se existir na página)
    const sel = el("racha-select");
    if (sel) sel.value = id;

    toggleLoading(true);

    setTimeout(() => {
      try {
        runBalancingAlgorithm(playersForDraw);

        // snapshot definitivo (times + nomes congelados) após o sorteio
        const takeSnapshot = snapshotTeams(state.teams, state.players);
        const rAll = getRachas();
        rAll[state.currentRachaId].teams = takeSnapshot.teams;
        rAll[state.currentRachaId].playerNames = takeSnapshot.playerNames;
        setRachas(rAll);

        // mostrar a toolbar
        el("results-toolbar")?.classList.remove("hidden");
      } finally {
        toggleLoading(false);
      }
    }, 100);
  });

  // Delegação única: +G/+A (evita duplicar listeners)
  el("teams-container").addEventListener("click", (e) => {
    const g = e.target.closest(".btn-goal");
    const a = e.target.closest(".btn-assist");
    const gDec = e.target.closest(".btn-goal-dec");
    const aDec = e.target.closest(".btn-assist-dec");
    if (!g && !a && !gDec && !aDec) return;

    if (!state.currentRachaId) {
      showMessage("Nenhum racha ativo.", "error");
      return;
    }

    const r = getRacha(state.currentRachaId);
    if (!r) {
      showMessage("Racha não encontrado.", "error");
      return;
    }
    if (r.finalized) {
      showMessage("Racha finalizado. Não é possível alterar.", "error");
      return;
    }

    const pid = parseInt((g || a || gDec || aDec).dataset.pid, 10);
    const stats = r.stats[pid] || { goals: 0, assists: 0 };
    if (g)   stats.goals   = (stats.goals   || 0) + 1;
    if (a)   stats.assists = (stats.assists || 0) + 1;
    if (gDec) stats.goals   = Math.max(0, (stats.goals   || 0) - 1);
    if (aDec) stats.assists = Math.max(0, (stats.assists || 0) - 1);
    r.stats[pid] = stats;
    upsertRacha(r); // autosave

    // UI
    const gEl = document.getElementById(`g-${pid}`);
    const aEl = document.getElementById(`a-${pid}`);
    if (gEl) gEl.textContent = stats.goals || 0;
    if (aEl) aEl.textContent = stats.assists || 0;

    // Habilita feedback do botão "Salvar scouts"
    const saveBtn = el("save-racha-btn");
    saveBtn.classList.add("ring-2", "ring-offset-2", "ring-indigo-300");
    setTimeout(
      () =>
        saveBtn.classList.remove("ring-2", "ring-offset-2", "ring-indigo-300"),
      500
    );
  });

  // Atualizar notas usando o Racha ATIVO (confirmação antes de aplicar)
  const recalc = el("recalc-ratings");
  if (recalc) {
    recalc.addEventListener("click", () => {
      const id = state.currentRachaId || getActiveRachaId();
      if (!id) { showMessage("Nenhum racha ativo para atualizar notas.", "error"); return; }
      const r = getRacha(id);
      if (!r) { showMessage("Racha ativo não encontrado.", "error"); return; }

      // 1) Snapshot do estado atual (ANTES)
      const before = JSON.parse(JSON.stringify(state.players));

      // 2) Simula a atualização chamando seu algoritmo normalmente...
      //    ...e depois REVERTE o estado para não aplicar ainda.
      updateRatingsFromRachas([id]);
      const after = JSON.parse(JSON.stringify(state.players));
      state.players = before;

      // 3) Monta a lista de deltas
      const byIdBefore = new Map(before.map(p => [p.id, p]));
      const diffs = after
        .map(p2 => {
          const p1 = byIdBefore.get(p2.id);
          if (!p1) return null;
          const delta = Number((p2.skill - p1.skill).toFixed(1));
          if (delta === 0) return null;
          return {
            id: p2.id,
            name: p2.name,
            before: Number(p1.skill.toFixed(1)),
            after: Number(p2.skill.toFixed(1)),
            delta
          };
        })
        .filter(Boolean)
        // maiores mudanças primeiro
        .sort((a,b) => Math.abs(b.delta) - Math.abs(a.delta));

      if (!diffs.length) {
        showMessage(`Nenhuma mudança de nota encontrada no racha "${r.name}".`);
        return;
      }

      // 4) Preenche o modal de PRÉVIA
      const tbody = el("preview-tbody");
      tbody.innerHTML = "";;
      diffs.forEach(row => {
        const tr = document.createElement("tr");
        const color = row.delta > 0 ? "text-emerald-600" : "text-red-600";
        tr.innerHTML = `
          <td class="px-3 py-2">${row.name}</td>
          <td class="px-3 py-2 text-right">${row.before.toFixed(1)}</td>
          <td class="px-3 py-2 text-right">${row.after.toFixed(1)}</td>
          <td class="px-3 py-2 text-right font-medium ${color}">
            ${row.delta > 0 ? "+" : ""}${row.delta.toFixed(1)}
          </td>`;
        tbody.appendChild(tr);
      });
      el("preview-caption").textContent =
        `Racha: ${r.name} - jogadores com alteração de nota: ${diffs.length}`;

      // 5) Abre o modal
      const modal = el("preview-modal");
      modal.classList.remove("hidden");
      modal.classList.add("flex");

      // 6) Controles do modal
      const closePreview = () => {
        modal.classList.add("hidden");
        modal.classList.remove("flex");;
      };
      el("preview-close-x").onclick = closePreview;
      el("preview-cancel").onclick = closePreview;

      el("preview-apply").onclick = () => {
        // Aplica de verdade (agora sim)
        updateRatingsFromRachas([id]);
        setPlayers(state.players);
        renderPlayerList();
        if (state.teams.length) renderTeams();
        showMessage(`Notas atualizadas com base no racha "${r.name}".`);
        closePreview();
      };
    });
  }

  // Carregar/Salvar 24 convocados
  const savedSelect = el("saved-squads-select");
  function refreshSquadsDropdown() {
    const saved = getSavedSquads();
    const names = Object.keys(saved);
    savedSelect.innerHTML = "";
    if (!names.length) {
      savedSelect.innerHTML =
        "<option disabled selected>Nenhum convocado salvo</option>";
      el("load-squad-btn").disabled = true;
      el("delete-squad-btn").disabled = true;
      return;
    }
    names.forEach((n) => {
      const o = document.createElement("option");
      o.value = n;
      o.textContent = n;
      savedSelect.appendChild(o);
    });
    el("load-squad-btn").disabled = false;
    el("delete-squad-btn").disabled = false;
  }
  refreshSquadsDropdown();

  el("save-squad-btn").addEventListener("click", () => {
    const ids = [...state.selectedPlayerIds];
    if (ids.length !== 24) {
      showMessage(
        `Selecione exatamente 24 jogadores para salvar (atual: ${ids.length}).`,
        "error"
      );
      return;
    }
    const name = (el("squad-name")?.value || "").trim();
    if (!name) {
      showMessage("Dê um nome aos 24 convocados antes de salvar.", "error");
      return;
    }
    const saved = getSavedSquads();
    saved[name] = ids;
    setSavedSquads(saved);
    refreshSquadsDropdown();
    showMessage(`Convocados '${name}' salvos.`);
  });

  el("load-squad-btn").addEventListener("click", () => {
    const sel = savedSelect?.value;
    if (!sel) {
      showMessage("Escolha um grupo salvo para carregar.", "error");
      return;
    }
    const saved = getSavedSquads();
    state.selectedPlayerIds = new Set(saved[sel] || []);
    renderPlayerList();
    renderSelectedPlayers();
    showMessage(`Convocados '${sel}' carregados.`);
  });

  el("delete-squad-btn").addEventListener("click", () => {
    const sel = savedSelect?.value;
    if (!sel) return;
    const saved = getSavedSquads();
    if (confirm(`Apagar convocados salvos '${sel}'?`)) {
      delete saved[sel];
      setSavedSquads(saved);
      refreshSquadsDropdown();
      showMessage(`Convocados '${sel}' apagados.`, "error");
    }
  });

  // Abrir/Exportar/Apagar racha (dropdown)
  const rachaSelect = el("racha-select");
  function refreshRachasDropdown() {
    const all = getRachas();
    const ids = Object.keys(all);
    rachaSelect.innerHTML = "";
    if (!ids.length) {
      rachaSelect.innerHTML =
        "<option disabled selected>Nenhum racha salvo</option>";
      el("open-racha-btn").disabled = true;
      el("export-racha-btn").disabled = true;
      el("delete-racha-btn").disabled = true;
      return;
    }
    ids
      .sort((a, b) => (all[b].createdAt || 0) - (all[a].createdAt || 0))
      .forEach((id) => {
        const opt = document.createElement("option");
        const name = all[id].name || id.split("__")[0];
        const when = all[id].createdAt
          ? new Date(all[id].createdAt).toLocaleString("pt-BR")
          : "";
        opt.value = id;
        opt.textContent = when ? `${name} — ${when}` : name;
        rachaSelect.appendChild(opt);
      });
    el("open-racha-btn").disabled = false;
    el("export-racha-btn").disabled = false;
    el("delete-racha-btn").disabled = false;
  }
  refreshRachasDropdown();

  el("open-racha-btn").addEventListener("click", () => {
    const id = el("racha-select")?.value;
    const r = getRacha(id);
    if (!id || !r) {
      showMessage("Racha não encontrado.", "error");
      return;
    }

    state.currentRachaId = id;
    setActiveRachaId(id);

    // Reconstrói os teams a partir do snapshot
    const byId = new Map(state.players.map((p) => [p.id, p]));
    state.teams = r.teams.map((t, i) => ({
      name: t.name || `Time ${i + 1}`,
      players: t.playerIds.map((pid) => byId.get(pid)).filter(Boolean),
    }));

    // Renderiza e preenche contadores
    el("results-section").classList.remove("hidden");
    el("results-toolbar")?.classList.remove("hidden");
    renderTeams();

    // Injetar contadores (g/a) já salvos
    Object.entries(r.stats || {}).forEach(([pidStr, s]) => {
      const pid = Number(pidStr);
      const gEl = document.getElementById(`g-${pid}`);
      const aEl = document.getElementById(`a-${pid}`);
      if (gEl) gEl.textContent = s.goals || 0;
      if (aEl) aEl.textContent = s.assists || 0;
    });

    // Label
    const lbl = el("current-racha-label");
    if (lbl) lbl.textContent = `Racha: ${r.name}`;

    // Se racha finalizado, desabilita +G/+A
    const finalizeBtn = el("finalize-racha-btn");
    finalizeBtn.textContent = r.finalized
      ? "Racha finalizado"
      : "Finalizar racha";
    finalizeBtn.disabled = !!r.finalized;

    showMessage("Racha aberto.");
  });

  el("export-racha-btn").addEventListener("click", () => {
    if (!state.currentRachaId) {
      const id = rachaSelect?.value;
      if (id) state.currentRachaId = id;
    }
    const all = getRachas();
    const r = all[state.currentRachaId];
    if (!r) {
      showMessage("Nenhum racha ativo para exportar.", "error");
      return;
    }
    const byId = new Map(state.players.map((p) => [p.id, p.name]));
    const teamBy = new Map();
    state.teams.forEach((t, i) =>
      t.players.forEach((p) => teamBy.set(p.id, `Time ${i + 1}`))
    );
    const rows = [["Jogador", "Gols", "Assistências", "Total", "Time"]];
    const stats = r.stats || {};
    const ids = Object.keys(stats);
    const union = new Set(ids.map(Number));
    Object.keys(stats).forEach((k) => union.add(Number(k)));
    Array.from(union).forEach((pid) => {
      const s = stats[pid] || { goals: 0, assists: 0 };
      // Recupera snapshot congelado do racha atual
      const r = getRacha(state.currentRachaId);

      // Usa primeiro o nome congelado; se não tiver, pega do byId; se não, um fallback genérico
      const name = r?.playerNames?.[pid] || byId.get(pid) || `Jogador ${pid}`;
      const team = teamBy.get(pid) || "";
      rows.push([
        name,
        s.goals || 0,
        s.assists || 0,
        (s.goals || 0) + (s.assists || 0),
        team,
      ]);
    });
    const csv = rows
      .map((r) =>
        r
          .map((v) => {
            const str = String(v ?? "");
            return /[",;\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
          })
          .join(";")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(r.name || "racha").replace(/[\\/:*?"<>|]/g, "_")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  el("delete-racha-btn").addEventListener("click", () => {
    const id = rachaSelect?.value;
    if (!id) {
      showMessage("Escolha um racha para apagar.", "error");
      return;
    }
    const all = getRachas();
    if (!all[id]) return;
    if (
      confirm("Tem certeza que deseja apagar este racha (gols/assistências)?")
    ) {
      delete all[id];
      setRachas(all);
      if (state.currentRachaId === id) {
        state.currentRachaId = null;
        const lbl = el("current-racha-label");
        if (lbl) lbl.textContent = "";
        if (state.teams.length) renderTeams();
      }
      refreshRachasDropdown();
      showMessage("Racha apagado.", "error");
    }
  });

  el("save-racha-btn").addEventListener("click", () => {
    if (!state.currentRachaId) {
      showMessage("Nenhum racha ativo.", "error");
      return;
    }
    const r = getRacha(state.currentRachaId);
    if (!r) {
      showMessage("Racha não encontrado.", "error");
      return;
    }

    // re-salva snapshot de times atual (caso o usuário tenha arrastado jogadores)
    const snap = snapshotTeams(state.teams, state.players);
    r.teams = snap.teams;
    r.playerNames = snap.playerNames;
    upsertRacha(r);

    // mantenha dropdown sincronizado
    refreshRachasDropdown();

    showMessage("Scouts e times salvos.");
  });

  el("finalize-racha-btn").addEventListener("click", () => {
    if (!state.currentRachaId) return;
    const r = getRacha(state.currentRachaId);
    if (!r) return;
    if (r.finalized) return;

    if (
      !confirm("Finalizar racha? Não será possível alterar os scouts depois.")
    )
      return;

    r.finalized = true;
    upsertRacha(r);
    el("finalize-racha-btn").textContent = "Racha finalizado";
    el("finalize-racha-btn").disabled = true;
    showMessage("Racha finalizado.");
  });

  el("new-racha-btn").addEventListener("click", () => {
    setActiveRachaId(null);
    state.currentRachaId = null;
    state.teams = [];
    el("results-section").classList.add("hidden");
    el("results-toolbar")?.classList.add("hidden");
    el("current-racha-label").textContent = "";
    showMessage("Pronto para um novo sorteio.");
  });

  // Reabrir racha ativo (se existir) após refresh
  const lastId = getActiveRachaId();
  if (lastId) {
    const r = getRacha(lastId);
    if (r) {
      state.currentRachaId = lastId;
      const byId = new Map(state.players.map((p) => [p.id, p]));
      state.teams = r.teams.map((t, i) => ({
        name: t.name || `Time ${i + 1}`,
        players: t.playerIds.map((pid) => byId.get(pid)).filter(Boolean),
      }));
      el("results-section").classList.remove("hidden");
      el("results-toolbar")?.classList.remove("hidden");
      renderTeams();

      Object.entries(r.stats || {}).forEach(([pidStr, s]) => {
        const pid = Number(pidStr);
        const gEl = document.getElementById(`g-${pid}`);
        const aEl = document.getElementById(`a-${pid}`);
        if (gEl) gEl.textContent = s.goals || 0;
        if (aEl) aEl.textContent = s.assists || 0;
      });
      const lbl = el("current-racha-label");
      if (lbl) lbl.textContent = `Racha: ${r.name}`;
    }
  }
}
