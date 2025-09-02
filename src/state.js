export const state = {
  players: [],
  selectedPlayerIds: new Set(),
  teams: [],
  balanceChart: null,
  currentRachaId: null,
  showRatings: false,
};

// util: Evita espalhar getElementById por todo o app
export const el = (id) => document.getElementById(id);