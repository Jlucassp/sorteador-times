import { state } from "./state.js";
import { getRachas, setRachas } from "./storage.js";

export const RATING_CFG = {
  wG: 0.6,
  wA: 0.4,
  eps: 1e-6,
  alphaCore: 0.1,
  alphaForm: 0.6,
  capPerGame: 0.5,
  betaForm: 0.5,
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const round1 = (x) => Math.round(x * 10) / 10;
export const applyFormToEffectiveSkill = () => {
  state.players.forEach((p) => {
    if (typeof p.form !== "number") p.form = 0;
    p.effectiveSkill = clamp(
      (p.skill || 5) + RATING_CFG.betaForm * p.form,
      1,
      10
    );
  });
};

export function getPlayerStats(rachaId, playerId) {
  const all = getRachas();
  const r = all[rachaId] || { stats: {} };
  return r.stats[playerId] || { goals: 0, assists: 0 };
}

export function setPlayerStats(rachaId, playerId, stats) {
  const all = getRachas();
  if (!all[rachaId])
    all[rachaId] = { name: "Racha", createdAt: Date.now(), stats: {} };
  all[rachaId].stats[playerId] = stats;
  setRachas(all);
}

export function calcBenchmarksByPositionForRacha(racha) {
  const byPos = {};
  const posById = new Map(
    state.players.map((p) => [p.id, p.position || "MEI"])
  );
  for (const [pidStr, stat] of Object.entries(racha.stats || {})) {
    const pid = Number(pidStr);
    const pos = posById.get(pid) || "MEI";
    if (!byPos[pos]) byPos[pos] = { g: [], a: [] };
    byPos[pos].g.push(stat.goals || 0);
    byPos[pos].a.push(stat.assists || 0);
  }
  const bm = {};
  const mean = (arr) =>
    arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
  const std = (arr) => {
    if (arr.length < 2) return 1;
    const m = mean(arr),
      v = arr.reduce((s, x) => s + (x - m) * (x - m), 0) / arr.length;
    return Math.sqrt(v) || 1;
  };
  for (const pos of Object.keys(byPos)) {
    bm[pos] = {
      gMean: mean(byPos[pos].g),
      gStd: std(byPos[pos].g),
      aMean: mean(byPos[pos].a),
      aStd: std(byPos[pos].a),
    };
  }
  ["DEF", "MEI", "ATA"].forEach((p) => {
    if (!bm[p]) bm[p] = { gMean: 0, gStd: 1, aMean: 0, aStd: 1 };
  });
  return bm;
}

export function updateRatingsFromRachas(rachaIds = []) {
  const all = getRachas();
  const times = rachaIds.map((id) => all[id]?.createdAt || 0);
  const maxWhen = Math.max(...times);

  // rachas mais recentes pesam mais (mantido)
  const idToWeight = Object.fromEntries(
    rachaIds.map((id) => {
      const when = all[id]?.createdAt || 0;
      return [id, when === maxWhen ? 1.0 : 0.7];
    })
  );

  // pid -> { wSum, scoreSum, contrib }   (contrib = gols + assistências)
  const agg = new Map();

  rachaIds.forEach((id) => {
    const r = all[id];
    if (!r) return;
    const bm = calcBenchmarksByPositionForRacha(r);
    const w = idToWeight[id] ?? 1.0;

    for (const [pidStr, stat] of Object.entries(r.stats || {})) {
      const pid = Number(pidStr);
      const p = state.players.find((pp) => pp.id === pid);
      if (!p) continue;

      const pos = p.position || "MEI";
      const { gMean, gStd, aMean, aStd } = bm[pos];

      const g = Number(stat.goals || 0);
      const a = Number(stat.assists || 0);

      // z por posição (padrão atual)
      const zG = (g - gMean) / (gStd + RATING_CFG.eps);
      const zA = (a - aMean) / (aStd + RATING_CFG.eps);
      const s = RATING_CFG.wG * zG + RATING_CFG.wA * zA;

      if (!agg.has(pid)) agg.set(pid, { wSum: 0, scoreSum: 0, contrib: 0 });
      const row = agg.get(pid);
      row.wSum += w;
      row.scoreSum += w * s;
      row.contrib += (g + a);
    }
  });

  state.players.forEach((p) => {
    const base = typeof p.skill === "number" ? p.skill : 5;
    if (typeof p.form !== "number") p.form = 0;
    const row = agg.get(p.id);

    // sem dados deste(s) racha(s): forma esfria levemente
    if (!row || row.wSum === 0) {
      p.form = clamp(p.form * 0.9, -2, 2);
      return;
    }

    const score = row.scoreSum / row.wSum;    // média ponderada de z-scores
    const deltaForm = RATING_CFG.alphaForm * score;

    // Núcleo (nota) - baseia no mesmo score, com teto/piso por racha
    let deltaCore = clamp(
      RATING_CFG.alphaCore * score,
      -RATING_CFG.capPerGame,
      RATING_CFG.capPerGame
    );

    // === Regras de justiça ===
    const ca = row.contrib || 0; // G+A
    if (ca > 0) {
      // nunca punir quem contribuiu
      deltaCore = Math.max(deltaCore, 0.05);
      if (ca >= 4) {
        // contribuições altas garantem ao menos +0.10
        deltaCore = Math.max(deltaCore, 0.10);
      }
    } else {
      // zero cintrubuição: pode cair levemente (sem exagero)
      deltaCore = Math.min(deltaCore, 0.05);
    }

    p.form = clamp(p.form + deltaForm, -2, 2);
    p.skill = clamp(round1(base + deltaCore), 1, 10);
  });

  applyFormToEffectiveSkill();
}