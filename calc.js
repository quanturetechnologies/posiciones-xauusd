'use strict';

/**
 * Pure calculation core for an XAUUSD position tracker.
 *
 * Contract conventions used throughout:
 *   - 1 standard lot = 100 troy ounces.
 *   - Every $1.00 of price movement = $100 per standard lot.
 *   - Trades are fills: { side: 'buy' | 'sell', lots: number, price: number }.
 *   - All money results are in account-currency dollars.
 */

const OZ_PER_LOT = 100;
const LOT_STEP = 0.01;

function isValidTrade(t) {
  return (
    t &&
    (t.side === 'buy' || t.side === 'sell') &&
    typeof t.lots === 'number' &&
    isFinite(t.lots) &&
    t.lots > 0 &&
    typeof t.price === 'number' &&
    isFinite(t.price) &&
    t.price > 0
  );
}

function validTrades(trades) {
  return Array.isArray(trades) ? trades.filter(isValidTrade) : [];
}

/** Convert lots to troy ounces. */
function oz(lots) {
  return lots * OZ_PER_LOT;
}

/** Total buy/sell ounce exposure and resulting net direction. */
function netPosition(trades) {
  let buyOz = 0;
  let sellOz = 0;
  for (const t of validTrades(trades)) {
    const size = oz(t.lots);
    if (t.side === 'buy') buyOz += size;
    else sellOz += size;
  }
  const netOz = buyOz - sellOz;
  const direction = netOz > 0 ? 'long' : netOz < 0 ? 'short' : 'flat';
  return { buyOz, sellOz, netOz, direction };
}

/** Volume-weighted average price of one side's fills; null when none. */
function averagePrice(trades, side) {
  let volume = 0;
  let notional = 0;
  for (const t of validTrades(trades)) {
    if (t.side !== side) continue;
    volume += t.lots;
    notional += t.lots * t.price;
  }
  if (volume === 0) return null;
  return notional / volume;
}

/**
 * Realized P&L pairing fills FIFO against the opposite side.
 * A matched pair always yields (sellPrice - buyPrice) * oz.
 * Open longs sit in the queue as positive lots, open shorts as negative.
 */
function realizedPnl(trades) {
  const queue = []; // [{ price, lots }] where lots > 0 = open long, < 0 = open short
  let pnl = 0;

  for (const t of validTrades(trades)) {
    const closesLong = t.side === 'sell';
    let remaining = t.lots;

    // Close open positions of the opposite side FIFO.
    while (remaining > 1e-9 && queue.length > 0 &&
           Math.sign(queue[0].lots) === (closesLong ? 1 : -1)) {
      const head = queue[0];
      const matched = Math.min(remaining, Math.abs(head.lots));
      if (closesLong) {
        pnl += (t.price - head.price) * oz(matched);
      } else {
        pnl += (head.price - t.price) * oz(matched);
      }
      remaining -= matched;
      head.lots -= Math.sign(head.lots) * matched;
      if (Math.abs(head.lots) <= 1e-9) queue.shift();
    }
    if (remaining > 1e-9) {
      queue.push({ price: t.price, lots: closesLong ? -remaining : remaining });
    }
  }
  return pnl;
}

/**
 * Unrealized P&L of the open net position against the current market price.
 * Returns 0 for a flat position or an invalid price.
 */
function floatingPnl(trades, currentPrice) {
  if (typeof currentPrice !== 'number' || !isFinite(currentPrice) || currentPrice <= 0) {
    return 0;
  }
  const { netOz, direction } = netPosition(trades);
  if (direction === 'flat') return 0;
  const side = direction === 'long' ? 'buy' : 'sell';
  const avg = averagePrice(trades, side);
  if (avg === null) return 0;
  if (direction === 'long') return (currentPrice - avg) * netOz;
  return (avg - currentPrice) * Math.abs(netOz);
}

/**
 * Position size from account risk.
 *   riskAmount = capital * riskPct / 100
 *   lots       = riskAmount / (stopDistance * OZ_PER_LOT), floored to LOT_STEP
 * Returns null for non-positive capital, riskPct or stopDistance.
 */
function positionSize({ capital, riskPct, stopDistance }) {
  if (
    typeof capital !== 'number' || !isFinite(capital) || capital <= 0 ||
    typeof riskPct !== 'number' || !isFinite(riskPct) || riskPct <= 0 ||
    typeof stopDistance !== 'number' || !isFinite(stopDistance) || stopDistance <= 0
  ) {
    return null;
  }
  const riskAmount = (capital * riskPct) / 100;
  const rawLots = riskAmount / (stopDistance * OZ_PER_LOT);
  // Floor to the lot step in integer cents to avoid float drift; a result
  // below one step cannot express the risk: use the minimum step.
  const cents = Math.floor(rawLots * 100 + 1e-9);
  const lots = cents >= 1 ? cents / 100 : LOT_STEP;
  return { riskAmount, lots, oz: Number((lots * OZ_PER_LOT).toFixed(6)) };
}

const Calc = { OZ_PER_LOT, LOT_STEP, oz, netPosition, averagePrice, realizedPnl, floatingPnl, positionSize };

/* Node (tests) / browser (page) dual export. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Calc;
} else {
  window.Calc = Calc;
}
