'use strict';

const assert = require('assert');
const Calc = require('./calc.js');

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
}

const buy = (lots, price) => ({ side: 'buy', lots, price });
const sell = (lots, price) => ({ side: 'sell', lots, price });

// --- Contract conversion ---------------------------------------------------

check('1 standard lot equals 100 oz', () => {
  assert.strictEqual(Calc.oz(1), 100);
  assert.strictEqual(Calc.oz(0.01), 1);
  assert.strictEqual(Calc.oz(2.5), 250);
});

// --- Net position ---------------------------------------------------------

check('net position long when buys exceed sells', () => {
  const pos = Calc.netPosition([buy(1, 2000), sell(0.5, 2010)]);
  assert.strictEqual(pos.buyOz, 100);
  assert.strictEqual(pos.sellOz, 50);
  assert.strictEqual(pos.netOz, 50);
  assert.strictEqual(pos.direction, 'long');
});

check('net position short when sells exceed buys', () => {
  const pos = Calc.netPosition([sell(1, 2000), buy(0.25, 2010)]);
  assert.strictEqual(pos.netOz, -75);
  assert.strictEqual(pos.direction, 'short');
});

check('net position flat when buys equal sells', () => {
  const pos = Calc.netPosition([buy(1, 2000), sell(1, 2010)]);
  assert.strictEqual(pos.netOz, 0);
  assert.strictEqual(pos.direction, 'flat');
});

check('net position of no trades is flat with zero volume', () => {
  const pos = Calc.netPosition([]);
  assert.deepStrictEqual(pos, { buyOz: 0, sellOz: 0, netOz: 0, direction: 'flat' });
});

// --- Volume-weighted average price ----------------------------------------

check('average buy price is volume weighted', () => {
  // 1 lot @2000 + 3 lots @2100 -> (100*2000 + 300*2100)/400 = 2075
  assert.strictEqual(Calc.averagePrice([buy(1, 2000), buy(3, 2100)], 'buy'), 2075);
});

check('average sell price ignores buy fills', () => {
  assert.strictEqual(Calc.averagePrice([buy(1, 2000), sell(2, 1990)], 'sell'), 1990);
});

check('average price with no fills on that side is null', () => {
  assert.strictEqual(Calc.averagePrice([buy(1, 2000)], 'sell'), null);
  assert.strictEqual(Calc.averagePrice([], 'buy'), null);
});

// --- Realized P&L (FIFO matching) ------------------------------------------

check('realized pnl for one closed long', () => {
  // buy 1 lot @2000, sell 1 lot @2010 -> (2010-2000)*100 = +1000
  assert.strictEqual(Calc.realizedPnl([buy(1, 2000), sell(1, 2010)]), 1000);
});

check('realized pnl for one closed short', () => {
  // sell 1 @2010, buy 1 @2000 -> (2010-2000)*100 = +1000
  assert.strictEqual(Calc.realizedPnl([sell(1, 2010), buy(1, 2000)]), 1000);
});

check('realized pnl is negative on a losing close', () => {
  // buy 1 @2050, sell 1 @2030 -> (2030-2050)*100 = -2000
  assert.strictEqual(Calc.realizedPnl([buy(1, 2050), sell(1, 2030)]), -2000);
});

check('realized pnl matches FIFO across partial closes', () => {
  // buy 2 @2000 (400 oz), sell 0.5 @2010 (50 oz), sell 1 @2020 (100 oz)
  // = (2010-2000)*50 + (2020-2000)*100 = 500 + 2000 = 2500
  assert.strictEqual(
    Calc.realizedPnl([buy(2, 2000), sell(0.5, 2010), sell(1, 2020)]),
    2500
  );
});

check('realized pnl crosses sides FIFO, not netting', () => {
  // buy 1 @2000, buy 1 @2100, sell 1 @2150 -> FIFO closes the @2000 lot: 15000
  assert.strictEqual(
    Calc.realizedPnl([buy(1, 2000), buy(1, 2100), sell(1, 2150)]),
    15000
  );
});

check('realized pnl of only-buy trades is zero', () => {
  assert.strictEqual(Calc.realizedPnl([buy(1, 2000)]), 0);
  assert.strictEqual(Calc.realizedPnl([]), 0);
});

// --- Floating P&L ----------------------------------------------------------

check('floating pnl long uses average buy price', () => {
  // net 200 oz, avg buy 2000, current 2005 -> +1000
  const trades = [buy(1, 2000), buy(1, 2000)];
  assert.strictEqual(Calc.floatingPnl(trades, 2005), 1000);
});

check('floating pnl short uses average sell price', () => {
  // net short 100 oz, avg sell 2000, current 1995 -> +500
  const trades = [sell(1, 2000)];
  assert.strictEqual(Calc.floatingPnl(trades, 1995), 500);
});

check('floating pnl flat position is zero regardless of price', () => {
  assert.strictEqual(Calc.floatingPnl([buy(1, 2000), sell(1, 2010)], 1990), 0);
});

// --- Position sizing -------------------------------------------------------

check('position size from capital, risk pct and stop distance', () => {
  // risk 1% of 10000 = 100; stop 5.00 -> 100/(5*100) = 0.20 lots
  const size = Calc.positionSize({ capital: 10000, riskPct: 1, stopDistance: 5 });
  assert.strictEqual(size.riskAmount, 100);
  assert.strictEqual(size.lots, 0.2);
  assert.strictEqual(size.oz, 20);
});

check('position size rounds down to the lot step, never up', () => {
  // risk 100, stop 7 -> 100/700 = 0.1428... -> 0.14 lots
  const size = Calc.positionSize({ capital: 10000, riskPct: 1, stopDistance: 7 });
  assert.strictEqual(size.lots, 0.14);
  assert.strictEqual(size.oz, 14);
});

check('position size with tiny result still floors to minimum 0.01', () => {
  const size = Calc.positionSize({ capital: 10000, riskPct: 1, stopDistance: 500 });
  // 100/50000 = 0.002 -> floor at step 0.01
  assert.strictEqual(size.lots, 0.01);
});

check('position size rejects invalid inputs', () => {
  assert.strictEqual(Calc.positionSize({ capital: 0, riskPct: 1, stopDistance: 5 }), null);
  assert.strictEqual(Calc.positionSize({ capital: 1000, riskPct: -1, stopDistance: 5 }), null);
  assert.strictEqual(Calc.positionSize({ capital: 1000, riskPct: 1, stopDistance: 0 }), null);
});

console.log(`\n${passed} checks passed`);
