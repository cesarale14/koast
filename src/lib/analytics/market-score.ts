// Market opportunity score — rates how good a market is for STR

export interface MarketScore {
  score: number;
  grade: string;
  summary: string;
  strengths: string[];
  risks: string[];
}

function getGrade(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 85) return "A";
  if (score >= 80) return "A-";
  if (score >= 75) return "B+";
  if (score >= 70) return "B";
  if (score >= 65) return "B-";
  if (score >= 60) return "C+";
  if (score >= 55) return "C";
  if (score >= 50) return "C-";
  if (score >= 45) return "D+";
  if (score >= 40) return "D";
  return "F";
}

export function calculateMarketScore(snapshot: {
  market_adr: number | null;
  market_occupancy: number | null;
  market_revpar: number | null;
  market_supply: number | null;
} | null, supplyTrend?: number | null): MarketScore {
  if (!snapshot) return { score: 0, grade: "N/A", summary: "No market data available.", strengths: [], risks: [] };

  const adr = snapshot.market_adr ?? 0;
  const occ = snapshot.market_occupancy ?? 0;
  const revpar = snapshot.market_revpar ?? 0;
  const supply = snapshot.market_supply ?? 0;
  const trend = supplyTrend ?? 0;

  let score = 0;
  const strengths: string[] = [];
  const risks: string[] = [];

  // ADR scoring
  if (adr > 200) { score += 15; strengths.push(`High ADR ($${Math.round(adr)})`); }
  else if (adr >= 150) { score += 10; strengths.push(`Solid ADR ($${Math.round(adr)})`); }
  else if (adr > 0) { score += 5; risks.push(`Low ADR ($${Math.round(adr)})`); }

  // Occupancy scoring
  if (occ > 65) { score += 20; strengths.push(`Strong occupancy (${Math.round(occ)}%)`); }
  else if (occ >= 50) { score += 15; }
  else if (occ > 0) { score += 5; risks.push(`Low occupancy (${Math.round(occ)}%)`); }

  // Supply scoring
  if (supply > 0 && supply < 500) { score += 15; strengths.push("Low competition (< 500 listings)"); }
  else if (supply <= 2000) { score += 10; }
  else { score += 5; risks.push(`${supply.toLocaleString()} active listings`); }

  // Supply trend scoring
  if (trend < -3) { score += 10; strengths.push("Supply decreasing"); }
  else if (trend <= 3) { score += 5; }
  else { risks.push("Supply increasing"); }

  // RevPAR scoring
  if (revpar > 130) { score += 20; strengths.push(`High RevPAR ($${Math.round(revpar)})`); }
  else if (revpar >= 80) { score += 15; }
  else if (revpar > 0) { score += 5; risks.push(`Low RevPAR ($${Math.round(revpar)})`); }

  score = Math.min(100, score);
  const grade = getGrade(score);

  const summary = score >= 70
    ? "Strong market with favorable conditions for STR investment."
    : score >= 50
      ? "Moderate market. Opportunities exist but requires smart pricing."
      : "Challenging market. Focus on differentiation and competitive pricing.";

  return { score, grade, summary, strengths, risks };
}
