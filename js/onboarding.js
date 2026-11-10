/* First-run guide, adapted from the Family Finances Tracker. */
(function(){
  'use strict';
  const L = window.Ledger, UI = L.ui, esc = L.charts.esc, $ = id => document.getElementById(id);
  const TOUR = [
    { tab: 'overview', icon: 'overview', title: L.DEMO ? 'Welcome to the demo' : 'Welcome, ' + L.household.name, body: L.DEMO ? 'Explore every page with made-up data. No sign-in is needed and changes stay in this browser.' : L.householdId === 'sal' ? 'Your own ledger is ready with example figures. This short guide shows you how to replace them and keep track of your finances together.' : 'Your household money in one place: what you have, what you plan to spend, and where it is heading. This takes about a minute.', tip: 'Six pages: Overview, Accounts, Budget, Trends, Planner and Life admin. Use the menu or the bar at the bottom.' },
    { tab: 'overview', icon: 'checkin', title: 'The monthly check-in', body: 'Once a month, type in each account\'s balance. Everything else (change, trends, cover) is worked out from those numbers.', tip: 'Overview → Start check-in. The dot on Overview shows how many accounts are still to update.' },
    { tab: 'accounts', icon: 'accounts', title: 'Accounts', body: 'Every account you hold, as savings, current, or other assets like a house or car (shown in net worth, not counted as spendable).', tip: !L.LOCAL && L.householdId === 'dan' ? 'Tap an account to rename it, see its history or tag it. Tags group accounts your way.' : 'Start by renaming the example accounts to match yours. Add or remove accounts, then enter your actual balances in the monthly check-in.' },
    { tab: 'budget', icon: 'budget', title: 'Budget', body: 'What you expect to come in and go out each month, year by year: income, fixed costs, living costs and extras.', tip: 'Tap a line name. Choose Monthly average or Annual total for each year, enter the amount, then choose Every month or Specific months. Annual bills need no dividing by 12.' },
    { tab: 'trends', icon: 'trends', title: 'Trends', body: 'How you\'re really doing: balances over time, the change each month, actual against plan, year on year and net worth.', tip: 'Tap the ⤢ button on any chart for a bigger view and the numbers as a table. Tick boxes show or hide each line.' },
    { tab: 'planner', icon: 'planner', title: 'Planner', body: 'Months of cover shows how long your money would last with no income. Model what-ifs (a new car?), and add costs you know are coming.', tip: 'Log big one-offs here too, so Trends can strip them out of your normal monthly change.' },
    { tab: 'admin', icon: 'admin', title: 'Life admin', body: 'Pensions, bills, subscriptions and insurance in one list: who each is with, what it costs and when it ends. Pensions are kept apart from your savings and net worth.', tip: 'Update pension values once a quarter. Add an end date to any bill or policy and it shows under Coming up, with a nudge on Overview 30 days before.' },
    { tab: 'overview', icon: 'bell', title: 'Your monthly routine', body: 'Update your balances, review what changed, check one-offs and confirm your budget. Complete all four activities to create a monthly review you can save or share.', tip: 'Settings → Calendar reminder adds a monthly nudge. You can reopen completed summaries from Monthly reviews in the menu.' },
    { tab: 'overview', icon: 'lock', title: L.DEMO ? 'Ready to explore' : 'Your own private ledger', body: L.DEMO ? 'Try editing the example figures or exploring the charts. Reset demo data restores the examples. Exit demo takes you back to household sign-in.' : 'Each household has its own encrypted data and PIN. On a new device, connect it once using the token from Dan, then unlock with your household PIN. Wait for Synced before closing.', tip: L.DEMO ? 'You can replay this guide from Settings at any time.' : 'Settings → Change PIN updates it for both of you. Keep it somewhere safe. Replay this guide from Settings whenever you need it.' },
  ];
  let tourAt = -1;
  const tourHl = tab => document.querySelectorAll('#bottomnav [data-tab], #side-nav [data-tab]').forEach(b => b.classList.toggle('tour-hl', b.dataset.tab === tab));
  function tourShow(i){
    tourAt = i; L.tourActive = true; const st = TOUR[i], last = i === TOUR.length - 1;
    if (UI.tab !== st.tab){ UI.tab = st.tab; L.saveUI(); L.render(); window.scrollTo({ top: 0 }); }
    tourHl(st.tab);
    $('tour').innerHTML = `<div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div class="tour-top"><span class="tour-ic">${L.icons[st.icon]}</span><span class="tour-step">${i + 1} of ${TOUR.length}</span><button class="tour-skip" data-act="tourEnd">${last ? 'Close' : 'Skip'}</button></div>
      <h2 id="tour-title">${esc(st.title)}</h2><p>${esc(st.body)}</p><div class="tour-tip">${esc(st.tip)}</div>
      <div class="tour-foot"><div class="tour-dots" aria-hidden="true">${TOUR.map((_, k) => `<i class="${k === i ? 'on' : k < i ? 'done' : ''}"></i>`).join('')}</div>
        ${i ? '<button class="btn" data-act="tourBack">Back</button>' : ''}<button class="btn primary" data-act="${last ? 'tourEnd' : 'tourNext'}">${last ? 'Get started' : i ? 'Next' : 'Show me'}</button></div></div>`;
    $('tour').classList.add('on'); document.body.classList.add('touring');
    const b = $('tour').querySelector('.btn.primary'); if (b) b.focus({ preventScroll: true });
  }
  L.tour = () => { if (L.modal.isOpen) L.modal.close(); L.closeMenu(); $('app').inert = true; tourShow(0); };
  L.tourHighlight = () => { if (tourAt >= 0) tourHl(TOUR[tourAt].tab); };
  L.maybeTour = () => { if (!L.safeLS.get(L.CFG.tourKey)) L.tour(); };
  L.acts.tour = () => L.tour();
  L.acts.tourNext = () => tourShow(Math.min(tourAt + 1, TOUR.length - 1));
  L.acts.tourBack = () => tourShow(Math.max(tourAt - 1, 0));
  L.acts.tourEnd = () => { tourAt = -1; L.tourActive = false; $('app').inert = false; L.safeLS.set(L.CFG.tourKey, '1'); $('tour').classList.remove('on'); document.body.classList.remove('touring'); tourHl(null); $('tour').innerHTML = ''; $('settings-btn').focus({preventScroll:true}); if (L.reports) L.reports.afterRender(); };
  document.addEventListener('keydown', ev => {
    if (tourAt < 0) return;
    if (ev.key === 'Tab'){
      const items = [...$('tour').querySelectorAll('button')], at = items.indexOf(document.activeElement);
      if ((ev.shiftKey && at <= 0) || (!ev.shiftKey && at === items.length - 1)){ ev.preventDefault(); items[ev.shiftKey ? items.length - 1 : 0].focus(); }
    }
    if (ev.key === 'Escape'){ ev.stopImmediatePropagation(); L.acts.tourEnd(); }
    else if (ev.key === 'ArrowRight' && tourAt < TOUR.length - 1) L.acts.tourNext();
    else if (ev.key === 'ArrowLeft' && tourAt > 0) L.acts.tourBack();
  }, true);

})();
