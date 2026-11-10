/* Sandbox sample feed: a made-up Barclays current account and Barclaycard, in the same shape the
   live feed will use (see L.sandbox.FORMAT). Every merchant amount here is invented, and it lines up
   roughly with the demo household's budget so the comparison looks realistic.
   Covers the last three months plus this month so far. */
(function(){
  'use strict';
  const L = window.Ledger = window.Ledger || {};

  L.sandboxSampleFeed = function(today = new Date()){
    let seed = 2207;
    const rnd = () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const pick = list => list[Math.floor(rnd() * list.length)];
    const r2 = v => Math.round(v * 100) / 100;
    const pad = n => String(n).padStart(2, '0');
    const iso = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
    const todayIso = iso(today.getFullYear(), today.getMonth() + 1, today.getDate());

    const accounts = [
      { id: 'bc-current', name: 'Barclays current account', kind: 'current' },
      { id: 'bc-card', name: 'Barclaycard', kind: 'card' },
    ];
    const txns = [];
    let n = 0;
    const add = (accountId, y, m, d, amount, description) => {
      const last = new Date(y, m, 0).getDate(), date = iso(y, m, Math.min(d, last));
      if (date > todayIso) return null;
      const t = { id: 's' + (++n), accountId, date, amount: r2(amount), description, pending: date === todayIso };
      txns.push(t); return t;
    };

    for (let back = 3; back >= 0; back--){
      const dt = new Date(today.getFullYear(), today.getMonth() - back, 1), y = dt.getFullYear(), m = dt.getMonth() + 1;
      const tag = String(m).padStart(2, '0') + String(y).slice(2);
      // ---- current account: income, bills, transfers ----
      add('bc-current', y, m, 25, 3950, 'ACME ANALYTICS LTD SALARY BGC');
      add('bc-current', y, m, 28, 2780, 'NORTHWIND HEALTH SALARY BGC');
      add('bc-current', y, m, 3, 110, 'HMRC CHILD BENEFIT BGC');
      add('bc-current', y, m, 1, -1640, 'DD HALIFAX MORTGAGE 4471' + tag);
      if (m !== 2 && m !== 3) add('bc-current', y, m, 1, -181.67, 'DD CITY COUNCIL TAX REF 88210');
      add('bc-current', y, m, 4, -165, 'DD OCTOPUS ENERGY');
      add('bc-current', y, m, 6, -46, 'DD THAMES WATER UTILITIES');
      add('bc-current', y, m, 8, -38, 'DD BT GROUP PLC');
      add('bc-current', y, m, 8, -34, 'DD VODAFONE LTD');
      add('bc-current', y, m, 1, -14.54, 'DD TV LICENCE MBP');
      add('bc-current', y, m, 12, -38, 'DD AVIVA INSURANCE LTD');
      add('bc-current', y, m, 2, -960, 'DD LITTLE ACORNS NURSERY');
      add('bc-current', y, m, 15, -289, 'DD BLACK HORSE CAR FINANCE');
      add('bc-current', y, m, 1, -62, 'DD PUREGYM LTD');
      add('bc-current', y, m, 26, -300, 'TO A/C 40-11-22 31415926 EASY SAVER');
      add('bc-current', y, m, 26, -300, 'SO VANGUARD ISA');
      add('bc-current', y, m, 7, -20, 'SO CANCER RESEARCH UK');
      if (rnd() < 0.7) add('bc-current', y, m, 9 + Math.floor(rnd() * 15), -(40 + Math.round(rnd() * 3) * 20), 'LINK ATM ' + pick(['HIGH ST', 'STATION RD', 'MARKET SQ']));

      // ---- Barclaycard: day-to-day spending ----
      let cardSpend = 0;
      const card = (d, amount, desc) => { const t = add('bc-card', y, m, d, -amount, desc); if (t) cardSpend += amount; };
      const shops = ['TESCO STORES 3312', 'SAINSBURYS S/MKTS', 'ALDI 104 LONDON', 'OCADO RETAIL LTD', 'M&S SIMPLY FOOD'];
      for (let i = 0; i < 9; i++) card(2 + i * 3 + Math.floor(rnd() * 2), 55 + rnd() * 50, pick(shops));
      ['DELIVEROO', 'PRET A MANGER', 'NANDOS', 'COSTA COFFEE', 'WAGAMAMA'].forEach((s, i) => { if (rnd() < 0.85) card(4 + i * 5, 14 + rnd() * 45, s); });
      card(6, 52 + rnd() * 20, pick(['SHELL CANARY WHARF', 'BP CONNECT', 'ESSO TESCO EXPRESS']));
      card(20, 48 + rnd() * 20, pick(['SHELL CANARY WHARF', 'BP CONNECT']));
      card(11, 18 + rnd() * 25, 'TRAINLINE.COM');
      card(18, 9.4, 'TFL TRAVEL CH');
      card(3, 10.99, 'NETFLIX.COM');
      card(9, 11.99, 'SPOTIFY UK');
      card(14, 7.99, 'DISNEY PLUS');
      card(21, 2.99, 'APPLE.COM/BILL');
      card(10, 70, 'SWIM ACADEMY KIDS');
      if (rnd() < 0.6) card(13, 30 + rnd() * 90, pick(['NEXT RETAIL', 'UNIQLO', 'ZARA UK']));
      for (let i = 0; i < 3; i++) card(5 + i * 8, 8 + rnd() * 35, 'AMZNMKTPLACE AMAZON.CO.UK');
      if (back === 2) card(17, 241.6, 'B&Q 1182 CROYDON');
      if (back === 1) add('bc-card', y, m, 22, 15.99, 'AMAZON.CO.UK REFUND');
      if (m === 11 || m === 12) card(24, 85 + rnd() * 60, 'JOHN LEWIS');
      // ---- the card is paid off in full from the current account early next month ----
      const payDay = new Date(y, m, 5);
      const py = payDay.getFullYear(), pm = payDay.getMonth() + 1;
      add('bc-current', py, pm, 5, -cardSpend, 'BARCLAYCARD');
      add('bc-card', py, pm, 6, cardSpend, 'PAYMENT RECEIVED - THANK YOU');
    }
    txns.sort((a, b) => a.date < b.date ? 1 : -1);
    return { format: 'ledger-feed/1', source: 'sample', fetchedAt: new Date(today).toISOString(), accounts, transactions: txns };
  };
})();
