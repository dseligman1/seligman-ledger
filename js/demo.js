/* Demo data: a made-up household so the app can be shown to others without real figures.
   Every name and number here is invented. It's built for today's date (three years of monthly
   history up to this month, with this month's check-in part done) from a fixed random seed,
   so each reset gives the same household. Demo mode never reads or writes GitHub. */
(function(){
  'use strict';
  const L = window.Ledger;
  L.DEMO_VERSION = 1;

  L.demoState = function(){
    const M = L.model;
    let seed = 7316;
    const rnd = () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const noise = sd => (rnd() + rnd() + rnd() - 1.5) * 2 * sd; // roughly normal, standard deviation sd
    const r2 = v => Math.round(v * 100) / 100;
    const pad = n => String(n).padStart(2, '0');

    const now = M.thisMonth(), Y = M.yearOf(now), today = new Date().getDate();
    const years = [Y - 3, Y - 2, Y - 1, Y, Y + 1];
    const HIST = 36, start = M.addM(now, -HIST);

    // ---------------- budget ----------------
    // amt: this year's monthly figure. g: yearly growth, used to back-fill earlier years and project next year.
    // by: explicit amounts per year offset (-3..+1) where the story isn't a smooth trend.
    const groups = [
      { id: 'g-income', name: 'Income' }, { id: 'g-home', name: 'Home' }, { id: 'g-bills', name: 'Bills' },
      { id: 'g-kids', name: 'Children' }, { id: 'g-transport', name: 'Transport' }, { id: 'g-food', name: 'Food' },
      { id: 'g-life', name: 'Lifestyle' }, { id: 'g-saving', name: 'Saving' },
    ];
    const defs = [
      ['d01', 'g-income', 'Alex salary (take-home)', 'income', 3950, 0.035],
      ['d02', 'g-income', 'Sam salary (take-home)', 'income', 2780, 0.03],
      ['d03', 'g-income', 'Alex annual bonus (after tax)', 'bonus', 450, 0.04, null, [3], 'Paid in March'],
      ['d04', 'g-income', 'Child benefit', 'income', 110, 0.03],
      ['d05', 'g-income', 'Old flat rent', 'off', 0, 0, { '-3': 650 }, null, 'Flat sold'],
      ['d10', 'g-home', 'Mortgage', 'fixed', 1640, 0, { '-3': 1285, '-2': 1285 }, null, 'Remortgaged, fixed until 2029'],
      ['d11', 'g-home', 'Council tax', 'fixed', 181.67, 0.05, null, [1, 4, 5, 6, 7, 8, 9, 10, 11, 12], '10 instalments, April to January'],
      ['d12', 'g-home', 'Home insurance', 'fixed', 38, 0.06],
      ['d13', 'g-home', 'Repairs and upkeep', 'extra', 120, 0.04],
      ['d14', 'g-home', 'Old flat service charge', 'off', 0, 0, { '-3': 145 }],
      ['d20', 'g-bills', 'Gas and electricity', 'fixed', 165, 0, { '-3': 245, '-2': 205, '-1': 178, '1': 172 }],
      ['d21', 'g-bills', 'Water', 'fixed', 46, 0.05],
      ['d22', 'g-bills', 'Broadband', 'fixed', 38, 0.03],
      ['d23', 'g-bills', 'Mobile phones', 'fixed', 34, 0.02],
      ['d24', 'g-bills', 'TV licence', 'fixed', 14.54, 0.03],
      ['d25', 'g-bills', 'Streaming and apps', 'living', 42, 0.06],
      ['d30', 'g-kids', 'Nursery', 'fixed', 960, 0, { '-3': 1090, '-2': 1150, '-1': 1185, '1': 520 }, null, 'Funded hours from September; ends when she starts school'],
      ['d31', 'g-kids', 'Children\'s clothes and shoes', 'living', 85, 0.04],
      ['d32', 'g-kids', 'Swimming and clubs', 'living', 70, 0.04],
      ['d33', 'g-kids', 'Childminder', 'off', 0, 0, { '-3': 320 }],
      ['d34', 'g-kids', 'Junior ISA', 'fixed', 100, 0],
      ['d40', 'g-transport', 'Car finance', 'fixed', 289, 0, { '-3': 0 }],
      ['d41', 'g-transport', 'Fuel and charging', 'living', 145, 0.03],
      ['d42', 'g-transport', 'Car insurance', 'fixed', 60, 0.08, null, [6], 'Paid yearly in June'],
      ['d43', 'g-transport', 'Car tax and MOT', 'extra', 25, 0.03],
      ['d44', 'g-transport', 'Trains and parking', 'living', 60, 0.04],
      ['d45', 'g-transport', 'Season ticket', 'off', 0, 0, { '-3': 310, '-2': 310 }, null, 'Hybrid working now'],
      ['d50', 'g-food', 'Groceries', 'living', 740, 0.06],
      ['d51', 'g-food', 'Eating out and takeaways', 'living', 220, 0.05],
      ['d60', 'g-life', 'Gym and sport', 'fixed', 62, 0.03],
      ['d61', 'g-life', 'Clothes', 'living', 110, 0.03],
      ['d62', 'g-life', 'Alex personal spending', 'living', 150, 0],
      ['d63', 'g-life', 'Sam personal spending', 'living', 150, 0],
      ['d64', 'g-life', 'Holidays', 'extra', 300, 0.05],
      ['d65', 'g-life', 'Christmas', 'extra', 75, 0.03, null, [11, 12]],
      ['d66', 'g-life', 'Birthdays and gifts', 'extra', 40, 0.03],
      ['d67', 'g-life', 'Charity', 'fixed', 20, 0],
      ['d70', 'g-saving', 'Into stocks and shares ISA', 'saving', 300, 0],
      ['d71', 'g-saving', 'Into easy-access saver', 'saving', 300, 0],
    ];
    const lines = defs.map(([id, groupId, name, kind, amt, g, by, pm, note]) => {
      const amounts = {};
      years.forEach(y => { const o = y - Y; amounts[y] = r2(by && by[o] != null ? by[o] : amt * Math.pow(1 + g, o)); });
      const line = { id, groupId, name, kind, amounts, note: note || '' };
      if (pm) line.payMonths = Object.fromEntries(years.map(y => [y, pm.slice()]));
      return line;
    });
    const salaries = [
      { name: 'Alex', amounts: Object.fromEntries(years.map(y => [y, Math.round(68000 * Math.pow(1.035, y - Y) / 500) * 500])), note: 'Gross, before tax and pension' },
      { name: 'Sam', amounts: Object.fromEntries(years.map(y => [y, Math.round(44000 * Math.pow(1.03, y - Y) / 500) * 500])), note: 'Gross, before tax and pension' },
    ];
    const budget = { years, groups, lines, salaries };
    const planNet = ym => { const tmp = { budget, planHistory: {} }; M.invalidate(); const n = M.planMonth(tmp, ym).net; M.invalidate(); return n; };

    // ---------------- accounts ----------------
    const tags = [
      { id: 't-cash', name: 'Easy-access cash', color: 3 }, { id: 't-isa', name: 'ISAs', color: 7 },
      { id: 't-invest', name: 'Investments', color: 5 }, { id: 't-cards', name: 'Credit cards', color: 4 },
      { id: 't-joint', name: 'Joint', color: 6 },
    ];
    const acc = (id, name, bucket, tg, extra) => Object.assign({ id, name, bucket, tags: tg, note: '', archived: false }, extra || {});
    const accounts = [
      acc('x01', 'Nationwide Instant Saver', 'savings', ['t-cash', 't-joint'], { note: 'Emergency fund' }),
      acc('x02', 'Premium Bonds', 'savings', ['t-cash']),
      acc('x03', 'Coventry Cash ISA', 'savings', ['t-isa']),
      acc('x04', 'Vanguard Stocks and Shares ISA', 'savings', ['t-isa', 't-invest']),
      acc('x05', 'Trading 212 Invest', 'savings', ['t-invest']),
      acc('x06', 'Barclays Joint', 'current', ['t-cash', 't-joint'], { note: 'Bills and mortgage go from here' }),
      acc('x07', 'Starling (Alex)', 'current', ['t-cash']),
      acc('x08', 'First Direct (Sam)', 'current', ['t-cash']),
      acc('x09', 'Halifax credit card', 'current', ['t-cards'], { note: 'Paid in full each month' }),
      acc('x10', 'John Lewis credit card', 'current', ['t-cards']),
      acc('x20', 'Home equity', 'asset', [], { estimate: true, note: 'Estimated value less mortgage' }),
      acc('x21', 'Car', 'asset', [], { estimate: true }),
    ];

    // ---------------- one-offs (months from now) ----------------
    const oneOffs = [[-28, 'Car deposit', -3000], [-16, 'New boiler', -3450], [-9, 'Wedding abroad (flights and hotel)', -1850], [-5, 'Tax rebate', 1240], [-2, 'Garden fence replaced', -1600]];
    const events = oneOffs.map(([o, label, amount], i) => ({ id: 'de' + i, month: M.addM(now, o), label, amount }));
    const evAt = {}; events.forEach(e => { evAt[e.month] = (evAt[e.month] || 0) + e.amount; });
    const carFrom = M.addM(now, -28);

    // ---------------- month-by-month simulation ----------------
    // Market growth, interest and prizes add to liquid funds; the planned net (with some overspend and
    // seasonal bumps) plus one-offs drive the rest. The instant saver takes whatever is left over.
    const b = { x01: 12500, x02: 12000, x03: 8000, x04: 14500, x05: 3400, x06: 2300, x07: 640, x08: 910, x09: -1150, x10: -180 };
    let liquid = Object.values(b).reduce((t, v) => t + v, 0), home = 142000, car = 0;
    const snapshots = [];
    for (let i = 0; i <= HIST; i++){
      const m = M.addM(start, i), mon = M.monthNum(m);
      if (i > 0){
        let gain = 0;
        const rV = 0.006 + noise(0.028), rT = 0.007 + noise(0.042);
        gain += b.x04 * rV + b.x05 * rT;
        b.x04 = b.x04 * (1 + rV) + 300; b.x05 = b.x05 * (1 + rT) + 75;
        gain += b.x03 * 0.038 / 12; b.x03 *= 1 + 0.038 / 12;
        if (mon === 4) b.x03 += 2000; // new ISA year: move a lump from the saver
        const prize = rnd() < 0.3 ? (rnd() < 0.15 ? 100 : rnd() < 0.5 ? 50 : 25) : 0;
        b.x02 += prize; gain += prize;
        gain += b.x01 * 0.041 / 12;
        const seasonal = mon === 12 ? -950 : mon === 8 ? -1300 : mon === 1 ? -300 : 0;
        liquid += planNet(m) * 0.9 + noise(600) + seasonal + (evAt[m] || 0) + gain;
        b.x06 = Math.max(150, 2300 + noise(650)); b.x07 = Math.max(40, 620 + noise(260)); b.x08 = Math.max(60, 880 + noise(320));
        b.x09 = -Math.max(120, 1150 + noise(500)); b.x10 = -Math.max(0, 180 + noise(160));
        b.x01 = liquid - Object.entries(b).filter(([k]) => k !== 'x01').reduce((t, [, v]) => t + v, 0);
        home = home * (1 + 0.0022 + noise(0.003)) + 430;
        if (m === carFrom) car = 22500; else if (car) car *= 0.988;
      }
      const balances = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, r2(v)]));
      balances.x20 = Math.round(home / 100) * 100;
      if (car) balances.x21 = Math.round(car / 50) * 50;
      // check-ins spread over the first few days of each month
      const updated = {}, ids = accounts.filter(a => a.bucket !== 'asset').map(a => a.id);
      if (i < HIST) ids.forEach(id => { updated[id] = m + '-' + pad(1 + Math.floor(rnd() * 5)); });
      snapshots.push({ month: m, date: null, balances, totals: null, updated, note: '' });
    }
    // This month: part-way through the check-in, so the demo shows one in progress.
    const cur = snapshots[HIST], prev = snapshots[HIST - 1];
    const doneNow = ['x01', 'x02', 'x03', 'x06'];
    Object.keys(cur.balances).forEach(k => { if (!doneNow.includes(k)) cur.balances[k] = prev.balances[k]; });
    doneNow.forEach(id => { cur.updated[id] = now + '-' + pad(1 + Math.floor(rnd() * Math.max(1, today))); if (cur.updated[id] > M.today()) cur.updated[id] = M.today(); });
    snapshots.forEach(s => { s.date = Object.values(s.updated).sort().pop() || s.month + '-01'; });
    snapshots[HIST - 1].note = 'Moved spare cash into the saver.';
    const checklist = {};
    for (let i = 1; i <= 12; i++) checklist[M.addM(now, -i)] = { balances: true, change: true, oneoffs: true, budget: true };

    const ymd = (o, d) => M.addM(now, o) + '-' + pad(d);
    return {
      meta: { schemaVersion: 2, demo: true, demoVersion: L.DEMO_VERSION, demoBuiltFor: now, importedFrom: 'Demo data (made up)', updatedAt: null },
      settings: { planYear: Y },
      tags, accounts, snapshots, gaps: [], planHistory: {}, checklist, budget,
      coverage: {
        includeExtras: false, slowTagId: 't-invest', excludeSlow: false,
        fundAdjustments: [{ id: 'df1', label: 'Bonus still to come (after tax)', amount: 5400 }, { id: 'df2', label: 'Builder deposit still owed', amount: -2500 }],
        costAdjustments: [{ id: 'dc1', label: 'Allow for yearly bills (MOT, renewals)', amount: 120 }],
      },
      house: {
        summary: [
          { id: 'dh1', label: 'Saved for the loft', amount: 30000 }, { id: 'dh2', label: 'Building work', amount: 22350 },
          { id: 'dh3', label: 'Contingency (10%)', amount: 2200 }, { id: 'dh4', label: 'Furnishings', amount: 0, link: 'furnishings' },
        ],
        building: [['Builder: structure and roof', 12500], ['Windows and roof lights', 2100], ['Plumbing and heating', 2400], ['Electrics', 1850], ['Plastering', 1600], ['Staircase', 1400]]
          .map(([name, amount], i) => ({ id: 'dw' + i, name, amount })),
        buildingPaid: null,
        furnishings: [['Bed frame', 640, 'done'], ['Mattress', 520, 'done'], ['Fitted wardrobes', 1150, ''], ['Blinds', 380, ''], ['Desk', 240, 'done'], ['Desk chair', 180, 'done'], ['Rug', 160, ''],
          ['Lighting', 290, ''], ['Bedside tables', 210, ''], ['Curtains', 150, ''], ['Shelving', 120, ''], ['Paint and decorating', 340, ''], ['Chest of drawers', 260, ''], ['Mirror', 90, '']]
          .map(([name, amount, status], i) => ({ id: 'di' + i, name, amount, status })),
      },
      scenarios: [
        { id: 'ds1', name: 'Sam drops to 4 days a week', active: true, items: [{ id: 'dsi1', label: 'Lower take-home pay', amount: -520, type: 'monthly' }, { id: 'dsi2', label: 'One less nursery day', amount: 190, type: 'monthly' }] },
        { id: 'ds2', name: 'Loft conversion', active: false, items: [{ id: 'dsi3', label: 'Build cost', amount: -38000, type: 'oneoff' }, { id: 'dsi4', label: 'Fit-out and furniture', amount: -4500, type: 'oneoff' }, { id: 'dsi5', label: 'Higher council tax band', amount: -25, type: 'monthly' }] },
        { id: 'ds3', name: 'Swap to an electric car', active: false, items: [{ id: 'dsi6', label: 'Deposit', amount: -4000, type: 'oneoff' }, { id: 'dsi7', label: 'Cheaper charging than fuel', amount: 90, type: 'monthly' }, { id: 'dsi8', label: 'Higher finance payment', amount: -140, type: 'monthly' }] },
      ],
      events,
      upcoming: [
        { id: 'du1', date: ymd(1, 14), label: 'Car MOT and service', amount: -420 },
        { id: 'du2', date: ymd(2, 3), label: 'Nursery deposit back', amount: 350 },
        { id: 'du3', date: ymd(4, 20), label: 'Ski trip balance', amount: -1600 },
        { id: 'du4', date: ymd(7, 1), label: 'Loft builder: first stage', amount: -7500 },
      ],
      keyDates: [],
      notes: 'Demo household (all made up). Mortgage fixed until 2029. Goal: keep at least 6 months of cover while saving for the loft.',
      push: { subs: [] },
    };
  };
})();
