export const getPlayers = () =>
  JSON.parse(localStorage.getItem("masterPlayers")) || [];
export const setPlayers = (players) =>
  localStorage.setItem("masterPlayers", JSON.stringify(players));

export const getSavedDraws = () =>
  JSON.parse(localStorage.getItem("savedDraws")) || {};
export const setSavedDraws = (obj) =>
  localStorage.setItem("savedDraws", JSON.stringify(obj));

export const getSavedSquads = () =>
  JSON.parse(localStorage.getItem("savedSquads")) || {};
export const setSavedSquads = (obj) =>
  localStorage.setItem("savedSquads", JSON.stringify(obj));

export const getRachas = () => JSON.parse(localStorage.getItem("rachas")) || {};
export const setRachas = (obj) =>
  localStorage.setItem("rachas", JSON.stringify(obj));

export const makeRachaId = (name) => {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safe =
    (name || "").trim() || `Racha ${new Date().toLocaleString("pt-BR")}`;
  return `${safe}__${ts}`;
};

// Racha ativo (id) - útil para reabrir após refresh
export const getActiveRachaId = () => localStorage.getItem('activeRachaId') || null;
export const setActiveRachaId = (id) => {
  if (id) localStorage.setItem('activeRachaId', id);
  else localStorage.removeItem('activeRachaId');
};

// CRUD de racha
export const getRacha = (id) => {
  const all = getRachas();
  return all[id] || null;
};

export const upsertRacha = (racha) => {
  const all = getRachas();
  all[racha.id] = racha;
  setRachas(all);
};

// snapshot de times e nomes congelados
export const snapshotTeams = (teams, players) => {
  const byId = new Map(players.map(p => [p.id, p.name]));
  return {
    teams: teams.map(t => ({ name: t.name, playerIds: t.players.map(p => p.id) })),
    playerNames: Object.fromEntries(players.map(p => [p.id, p.name || `Jogador ${p.id}`]))
  };
};