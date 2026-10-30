/* Private monthly infographics. Canvas -> PNG + a one-page PDF, entirely on device. */
(function(){
  'use strict';
  const L = window.Ledger, M = L.model, RM = L.reportModel, esc = L.charts.esc;
  const R = L.reports = {}, W = 1080, H = 1740;
  const P = { paper:'#F6F3EB', ink:'#20251F', muted:'#647064', rule:'#D8DED2', dark:'#1B271F', yellow:'#E8B83A', blue:'#246DAC', red:'#B84736', green:'#286B4B', white:'#FFFFFF' };
  const gbp = n => n == null ? 'Not available' : (n < 0 ? '-' : '') + '£' + Math.abs(Math.round(n)).toLocaleString('en-GB');
  const signed = n => n == null ? 'Not available' : (Math.round(n) > 0 ? '+' : '') + gbp(n);
  const smallMoney = n => Math.abs(n) >= 1000000 ? (n < 0 ? '-' : '') + '£' + (Math.abs(n) / 1000000).toFixed(1) + 'm' : Math.abs(n) >= 1000 ? (n < 0 ? '-' : '') + '£' + (Math.abs(n) / 1000).toFixed(Math.abs(n) < 10000 ? 1 : 0) + 'k' : gbp(n);
  const cache = new Map();
  let pendingOpen = null, activeMonth = null;

  R.draw = report => {
    const canvas = document.createElement('canvas'); canvas.width = W * 2; canvas.height = H * 2;
    const c = canvas.getContext('2d'); if (!c) throw new Error('Image export is unavailable in this browser.');
    c.scale(2, 2); c.textBaseline = 'top';
    function rect(x, y, w, h, color, radius = 0){ c.fillStyle = color; c.beginPath(); if (radius && c.roundRect) c.roundRect(x, y, w, h, radius); else c.rect(x, y, w, h); c.fill(); }
    function text(t, x, y, size = 28, color = P.ink, weight = '400', align = 'left', serif = false){ c.font = `${weight} ${size}px ${serif ? 'Georgia, serif' : 'Arial, sans-serif'}`; c.fillStyle = color; c.textAlign = align; c.fillText(String(t), x, y); }
    function wrap(t, x, y, width, size = 28, color = P.ink, max = 2, weight = '400'){
      c.font = `${weight} ${size}px Arial, sans-serif`; const words = String(t).split(/\s+/), lines = []; let line = '';
      words.forEach(word => { const next = line ? line + ' ' + word : word; if (c.measureText(next).width > width && line){ lines.push(line); line = word; } else line = next; });
      if (line) lines.push(line);
      lines.slice(0, max).forEach((v, i) => { if (i === max - 1 && lines.length > max){ while (c.measureText(v + '…').width > width) v = v.slice(0, -1); v += '…'; } text(v, x, y + i * size * 1.32, size, color, weight); });
      return Math.min(lines.length, max) * size * 1.32;
    }
    function line(x1, y1, x2, y2, color = P.rule, width = 1){ c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
    function metric(label, value, detail, x, y, color){
      text(label.toUpperCase(), x, y, 21, P.muted, '700');
      let size = 45; c.font = `700 ${size}px Arial`; while (c.measureText(value).width > 440 && size > 28){ size -= 2; c.font = `700 ${size}px Arial`; }
      text(value, x, y + 31, size, color || P.ink, '700'); text(detail, x, y + 85, 22, P.muted);
    }
    rect(0, 0, W, H, P.paper);
    rect(64, 56, 48, 7, P.yellow); text('THE SELIGMAN LEDGER', 130, 48, 23, P.ink, '700');
    text(report.title, 64, 96, 64, P.ink, '400', 'left', true);
    text(`MONTHLY REVIEW  /  ${M.lbl(report.checkMonth, 'month').toUpperCase()} CHECK-IN`, 66, 174, 22, P.muted, '700');
    rect(64, 218, 952, 292, P.dark, 22);
    wrap(report.headline, 94, 247, 888, 36, P.white, 2, '700');
    let by = 309;
    report.bullets.forEach(b => { rect(95, by + 10, 7, 7, P.yellow, 3); by += wrap(b, 119, by, 856, 27, '#ECF0E9', 2) + 13; });
    metric('Liquid funds', gbp(report.liquid), 'Savings + current accounts', 64, 548);
    metric('Change since last check-in', signed(report.delta), report.gap == null ? 'Previous snapshot needed' : `${gbp(Math.abs(report.gap))} ${Math.round(report.gap) >= 0 ? 'ahead of' : 'behind'} plan`, 556, 548, report.delta == null ? P.muted : report.delta < 0 ? P.red : P.green);
    metric('Months of cover', report.cover == null ? 'Not available' : report.cover.toFixed(1) + ' months', `${report.coverYear} planned costs, with adjustments`, 64, 680);
    metric('Net worth', gbp(report.netWorth), report.hasAssets ? 'Includes last recorded asset estimates' : 'No other assets recorded', 556, 680);
    line(64, 805, 1016, 805);

    text('The balance over time', 64, 834, 34, P.ink, '700');
    text('Liquid funds at each check-in', 64, 879, 24, P.muted);
    const pts = report.trend, known = pts.map(p => p.liquid).filter(v => v != null);
    const x0 = 152, x1 = 980, y0 = 943, y1 = 1096;
    let min = known.length ? Math.min(...known) : 0, max = known.length ? Math.max(...known) : 1;
    const pad = Math.max((max - min) * .15, Math.abs(max) * .015, 100); min -= pad; max += pad;
    const xx = i => x0 + i * (x1 - x0) / 5, yy = v => y1 - (v - min) / (max - min) * (y1 - y0);
    [0, .5, 1].forEach(t => { const v = min + (max - min) * t, y = yy(v); line(x0, y, x1, y); text(smallMoney(v), 132, y - 11, 22, P.muted, '400', 'right'); });
    c.beginPath(); c.strokeStyle = P.blue; c.lineWidth = 5; let connected = false;
    pts.forEach((p, i) => { if (p.liquid == null){ connected = false; return; } if (connected) c.lineTo(xx(i), yy(p.liquid)); else c.moveTo(xx(i), yy(p.liquid)); connected = true; }); c.stroke();
    pts.forEach((p, i) => { if (p.liquid != null){ c.beginPath(); c.arc(xx(i), yy(p.liquid), 7, 0, Math.PI * 2); c.fillStyle = P.blue; c.fill(); } text(M.lbl(p.checkMonth), xx(i), 1116, 22, P.muted, '400', 'center'); });
    line(64, 1162, 1016, 1162);

    text('How we did against the plan', 64, 1191, 34, P.ink, '700');
    rect(65, 1240, 16, 16, P.blue); text('Balance change', 91, 1236, 23, P.muted);
    rect(327, 1240, 16, 16, '#A3AB9C'); text('Budget plan', 353, 1236, 23, P.muted);
    const values = pts.flatMap(p => [p.actual, p.plan]).filter(v => v != null);
    let lo = Math.min(0, ...values), hi = Math.max(0, ...values); if (hi - lo < 1){ hi = 1; lo = -1; }
    const padding = (hi - lo) * .12; if (lo < 0) lo -= padding; if (hi > 0) hi += padding;
    const cy0 = 1290, cy1 = 1437, cy = v => cy1 - (v - lo) / (hi - lo) * (cy1 - cy0), zero = cy(0);
    [lo, 0, hi].filter((v, i, a) => a.indexOf(v) === i).forEach(v => { const y = cy(v); line(x0, y, x1, y, v === 0 ? '#9BA593' : P.rule); text(smallMoney(v), 132, y - 11, 22, P.muted, '400', 'right'); });
    pts.forEach((p, i) => { const x = x0 + 52 + i * (x1 - x0 - 104) / 5;
      [[p.actual, x - 28, p.actual < 0 ? P.red : P.blue], [p.plan, x + 5, '#A3AB9C']].forEach(([v, bx, color]) => { if (v == null){ text('–', bx + 12, zero - 13, 23, P.muted, '400', 'center'); return; } rect(bx, Math.min(zero, cy(v)), 24, Math.max(2, Math.abs(cy(v) - zero)), color, 2); });
      text(M.lbl(p.month, 'mon'), x, 1457, 23, P.muted, '400', 'center');
    });
    text('Review months; negative bars mean funds fell. Gaps = no comparison.', 64, 1504, 22, P.muted);
    rect(64, 1549, 952, 73, '#E9EADF', 12);
    const next = report.upcoming.length ? `Next up: ${report.upcoming[0].label} (${signed(report.upcoming[0].amount)})${report.upcomingCount > 1 ? ` + ${report.upcomingCount - 1} more` : ''}` : `${M.lbl(report.checkMonth, 'month')} plan: ${signed(report.nextPlan)} change in liquid funds.`;
    wrap(next, 87, 1572, 902, 26, P.ink, 1, '700');
    const period = report.fromDate ? `${M.dateLbl(report.fromDate)} to ${M.dateLbl(report.balanceDate)}` : `Balance snapshot: ${M.dateLbl(report.balanceDate)}`;
    text(period + '  ·  Check-in snapshots, not calendar-month transactions.', 64, 1643, 20, P.muted);
    text('Balance changes include investment movements. Plan is not actual spending.', 64, 1674, 20, P.muted);
    text('PRIVATE FAMILY REVIEW', 64, 1707, 17, P.muted, '700');
    if (L.DEMO) text('DEMO · MADE-UP FIGURES', 1016, 1707, 17, P.muted, '700', 'right');
    return canvas;
  };

  // An image-only PDF keeps the downloaded PDF identical to the PNG, with no remote library.
  // Stream lengths and xref offsets are byte counts, including the binary JPEG payload.
  R.pdf = canvas => {
    const jpeg = Uint8Array.from(atob(canvas.toDataURL('image/jpeg', .94).split(',')[1]), ch => ch.charCodeAt(0));
    const enc = new TextEncoder(), chunks = [], offsets = [0]; let length = 0;
    const put = v => { const b = typeof v === 'string' ? enc.encode(v) : v; chunks.push(b); length += b.length; };
    const obj = (id, body) => { offsets[id] = length; put(`${id} 0 obj\n${body}\nendobj\n`); };
    const pw = 595.28, ph = +(pw * H / W).toFixed(2);
    put('%PDF-1.4\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
    offsets[4] = length; put(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`); put(jpeg); put('\nendstream\nendobj\n');
    const content = `q\n${pw} 0 0 ${ph} 0 0 cm\n/Im0 Do\nQ\n`;
    obj(5, `<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream`);
    const start = length; put('xref\n0 6\n0000000000 65535 f \n');
    offsets.slice(1).forEach(n => put(String(n).padStart(10, '0') + ' 00000 n \n'));
    put(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
    return new Blob(chunks, { type: 'application/pdf' });
  };
  R.prepare = report => {
    const key = JSON.stringify(report), previous = cache.get(report.checkMonth);
    if (previous && previous.key === key) return previous.promise;
    if (previous && previous.value) URL.revokeObjectURL(previous.value.url);
    const entry = { key };
    entry.promise = Promise.resolve().then(async () => {
      const canvas = R.draw(report);
      const png = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not create the image.')), 'image/png'));
      const pdf = R.pdf(canvas), name = `seligman-ledger-${report.month}`;
      const value = { png, pdf, imageFile: new File([png], name + '.png', { type:'image/png' }), pdfFile: new File([pdf], name + '.pdf', { type:'application/pdf' }), url: URL.createObjectURL(png), name };
      if (cache.get(report.checkMonth) !== entry){ URL.revokeObjectURL(value.url); throw new Error('The report changed. Open it again for the latest version.'); }
      entry.value = value; return value;
    }).catch(e => { if (cache.get(report.checkMonth) === entry) cache.delete(report.checkMonth); throw e; });
    cache.set(report.checkMonth, entry);
    // Keep at most two rendered images; the small report datasets remain in encrypted state.
    while (cache.size > 2){ const k = cache.keys().next().value, v = cache.get(k); if (v.value) URL.revokeObjectURL(v.value.url); cache.delete(k); }
    return entry.promise;
  };
  R.sync = (s, announce = false) => {
    const result = RM.sync(s);
    if (announce && result.created.includes(M.thisMonth())) pendingOpen = M.thisMonth();
    return result.changed.length > 0;
  };
  const months = () => Object.keys((L.S && L.S.monthlyReports) || {}).sort().reverse();
  R.afterRender = () => {
    const latest = months()[0];
    if (latest) R.prepare(L.S.monthlyReports[latest]).catch(() => {});
    if (pendingOpen && !L.modal.isOpen){ const m = pendingOpen; pendingOpen = null; setTimeout(() => { if (L.S && L.S.monthlyReports[m]) R.open(m); }, 0); }
  };
  R.card = () => {
    const cm = months()[0];
    if (!cm) return `<section class="card s12 report-ready"><div><div class="lbl">Monthly review</div><h2>Your month, ready to share</h2><div class="sub">Complete every account update and all check-in activities to generate the previous month's infographic automatically.</div></div></section>`;
    const r = L.S.monthlyReports[cm];
    return `<section class="card s12 report-ready"><div><div class="lbl">Monthly review · ready</div><h2>${esc(r.title)}</h2><div class="sub">${esc(r.headline)}. Image and PDF ready to share.</div></div><button class="btn primary" data-act="monthlyReport" data-m="${cm}">View & share review</button></section>`;
  };
  R.open = cm => {
    const list = months(); cm = cm || list[0];
    if (!cm || !L.S.monthlyReports[cm]){ L.toast('Finish the check-in to generate a monthly review.'); return; }
    activeMonth = cm;
    L.modal.open(() => {
      const r = L.S.monthlyReports[cm];
      if (!r) return { title:'Check-in reopened', body:'Complete all the check-in activities to generate this review again.' };
      return {
        title: `${r.title} review`,
        sub: `Based on the ${M.lbl(cm, 'month')} check-in. Choose WhatsApp from your phone's share menu.`,
        body: `<div class="report-toolbar"><label class="field">Review month<select class="input" id="report-month">${months().map(m => `<option value="${m}" ${m === cm ? 'selected' : ''}>${esc(L.S.monthlyReports[m].title)}</option>`).join('')}</select></label><div class="small muted" id="report-status" role="status">Preparing image and PDF…</div></div><div class="report-preview" id="report-preview"></div><details class="report-details"><summary>Read summary and figures</summary><p>${esc(r.headline)}</p><ul>${r.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul><p>Liquid funds: ${gbp(r.liquid)}. Net worth: ${gbp(r.netWorth)}. ${r.cover == null ? '' : 'Cover: ' + r.cover.toFixed(1) + ' months.'}</p><p>Monthly change uses dated check-in snapshots, so it is an approximation of the calendar month. It includes investment movements.</p></details>`,
        foot: `<div class="report-actions"><button class="btn primary" data-report-export="share" disabled>Share image…</button><button class="btn" data-report-export="copy" disabled>Copy image</button><button class="btn" data-report-export="png" disabled>Save image</button><button class="btn" data-report-export="pdf" disabled>Save PDF</button></div>`,
        onMount(body){
          body.querySelector('#report-month').addEventListener('change', e => R.open(e.target.value));
          const foot = document.getElementById('modal-foot');
          R.prepare(r).then(files => {
            if (!body.isConnected || activeMonth !== cm || !body.querySelector('#report-preview') || L.S.monthlyReports[cm] !== r) return;
            body.querySelector('#report-preview').innerHTML = `<img src="${files.url}" alt="${esc(r.summary)}" width="${W}" height="${H}">`;
            body.querySelector('#report-status').textContent = 'Ready · generated privately on this device';
            foot.querySelectorAll('[data-report-export]').forEach(button => {
              button.disabled = false;
              if (button.dataset.reportExport === 'share' && !(navigator.canShare && navigator.share && navigator.canShare({ files:[files.imageFile] }))) button.hidden = true;
              if (button.dataset.reportExport === 'copy' && !(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem)) button.hidden = true;
              button.onclick = () => R.export(button.dataset.reportExport, files, r);
            });
          }).catch(() => { if (activeMonth === cm && body.querySelector('#report-status')){ body.querySelector('#report-status').textContent = 'Could not prepare the export. Close and reopen this review to retry.'; } });
        },
      };
    });
  };
  function download(blob, name){ const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
  R.export = async (type, files, report) => {
    try {
      // Files are prepared beforehand: native share/clipboard must start directly from the tap.
      if (type === 'share') await navigator.share({ files:[files.imageFile], title:`${report.title} - The Seligman Ledger` });
      else if (type === 'copy'){ await navigator.clipboard.write([new ClipboardItem({ 'image/png':files.png })]); L.toast('Image copied. Paste it into WhatsApp.'); }
      else if (type === 'pdf') download(files.pdf, files.name + '.pdf');
      else download(files.png, files.name + '.png');
    } catch(e){ if (e.name !== 'AbortError') L.toast('Sharing is unavailable here. Use Save image or Save PDF instead.'); }
  };
  L.acts.monthlyReport = el => R.open(el && el.dataset.m);
})();
