import { state } from "./state.js";

export const formations = {
  auto: {},
  "2-2-2": { DEF: 2, MEI: 2, ATA: 2, total: 6 },
  "2-3-1": { DEF: 2, MEI: 3, ATA: 1, total: 6 },
  "3-2-1": { DEF: 3, MEI: 2, ATA: 1, total: 6 },
  "1-3-2": { DEF: 1, MEI: 3, ATA: 2, total: 6 },
};

export function getTeamStats(team) {
  if (!team.length) return { totalSkill: 0, avgSkill: 0, positions: {} };
  const totalSkill = team.reduce((s, p) => s + p.skill, 0);
  const avgSkill = totalSkill / team.length;
  const positions = team.reduce(
    (acc, p) => ((acc[p.position] = (acc[p.position] || 0) + 1), acc),
    {}
  );
  return { totalSkill, avgSkill, positions };
}

export function calculateOverallBalance() {
  if (!state.teams.length || state.teams.every((t) => !t.players.length))
    return { stdDev: 0, range: 0, fillRate: 0, minAvg: 0, maxAvg: 0 };

  const avgs = state.teams.map((t) => getTeamStats(t.players).avgSkill);
  const mean = avgs.reduce((s, x) => s + x, 0) / avgs.length;
  const std = Math.sqrt(
    avgs.map((a) => (a - mean) ** 2).reduce((s, x) => s + x, 0) / avgs.length
  );
  const max = Math.max(...avgs),
    min = Math.min(...avgs);

  let filled = 0,
    total = 0;
  const key = document.getElementById("formation").value;
  if (key !== "auto") {
    const f = formations[key];
    state.teams.forEach((team) => {
      const st = getTeamStats(team.players);
      Object.keys(f).forEach((pos) => {
        if (pos !== "total") {
          total += f[pos];
          filled += Math.min(st.positions[pos] || 0, f[pos]);
        }
      });
    });
  }
  const fillRate = total > 0 ? (filled / total) * 100 : 100;
  return { stdDev: std, range: max - min, minAvg: min, maxAvg: max, fillRate };
}

export function bestPickFromTier(tier, need) {
  let best = 0,
    bestScore = -Infinity;
  const norm = (s) => (Math.max(1, Math.min(10, s)) - 1) / 9;
  for (let i = 0; i < tier.length; i++) {
    const p = tier[i];
    const s = norm(p.skill);
    let fit = 0;
    if (need[p.position] > 0) fit = 1.0;
    else if (Array.isArray(p.secondaryPositions)) {
      for (const sec of p.secondaryPositions) {
        if (need[sec] > 0) {
          fit = Math.max(fit, 0.7);
        }
      }
    }
    const score = 0.65 * fit + 0.35 * s;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

function avgSkill(arr) {
  return arr.length ? arr.reduce((s, p) => s + p.skill, 0) / arr.length : 0;
}

export function snakeDistributeRemaining(teams, pool, teamSize = 6) {
  let direction = 1;
  while (pool.length) {
    const pending = teams
      .map((t, i) => ({ i, size: t.players.length, avg: avgSkill(t.players) }))
      .filter((t) => t.size < teamSize);
    if (!pending.length) break;
    const order = pending
      .sort((a, b) => a.avg - b.avg || a.size - b.size)
      .map((o) => o.i);
    const seq = direction === 1 ? order : order.slice().reverse();

    for (const ti of seq) {
      if (!pool.length) break;
      if (teams[ti].players.length < teamSize)
        teams[ti].players.push(pool.shift());
    }
    direction *= -1;
  }
}

export function runBalancingAlgorithm(playersToDraw) {
  const numTeams = 4;
  const teamSize = 6;
  const formKey = document.getElementById("formation").value;
  const f = formations[formKey] || { DEF: 2, MEI: 2, ATA: 2, total: 6 };

  state.teams = Array.from({ length: numTeams }, (_, i) => ({
    name: `Time ${i + 1}`,
    players: [],
  }));
  const needs = Array.from({ length: numTeams }, () => ({
    DEF: f.DEF || 0,
    MEI: f.MEI || 0,
    ATA: f.ATA || 0,
  }));

  const pool = [...playersToDraw].sort((a, b) => b.skill - a.skill);
  const tiers = [];
  for (let i = 0; i < pool.length; i += numTeams)
    tiers.push(pool.slice(i, i + numTeams));

  let forward = true;
  tiers.forEach((tier) => {
    const order = forward
      ? [...Array(numTeams).keys()]
      : [...Array(numTeams).keys()].reverse();
    order.forEach((ti) => {
      if (!tier.length) return;
      const pickIdx = bestPickFromTier(tier, needs[ti]);
      const picked = tier.splice(pickIdx, 1)[0];
      state.teams[ti].players.push(picked);
      if (needs[ti][picked.position] > 0) needs[ti][picked.position]--;
      else if (Array.isArray(picked.secondaryPositions)) {
        for (const sec of picked.secondaryPositions) {
          if (needs[ti][sec] > 0) {
            needs[ti][sec]--;
            break;
          }
        }
      }
    });
    forward = !forward;
  });

  const leftovers = [];
  state.teams.forEach(
    (t) =>
      t.players.length > teamSize &&
      leftovers.push(...t.players.splice(teamSize))
  );
  const allAssigned = state.teams.reduce((acc, t) => acc + t.players.length, 0);
  if (allAssigned < numTeams * teamSize) {
    const remaining = pool.filter(
      (p) => !state.teams.some((t) => t.players.includes(p))
    );
    snakeDistributeRemaining(state.teams, remaining, teamSize);
  }
}