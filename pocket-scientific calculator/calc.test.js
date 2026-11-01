/* Pocket Scientific — self tests. Runs only with ?test=1 */
(function () {
  'use strict';

  var CASES = [
    { expr: '0.1 + 0.2', out: '0.3' },
    { expr: '1 / 3', out: '0.333333333333' },
    { expr: '2 / 3', out: '0.666666666667' },
    { expr: '2 + 3 * 4', out: '14' },
    { expr: '(2 + 3) * 4', out: '20' },
    { expr: '4 - 2 - 1', out: '1' },
    { expr: '8 / 4 / 2', out: '1' },
    { expr: '2 ^ 3 ^ 2', out: '512' },
    { expr: '-2 ^ 2', out: '-4' },
    { expr: '(-2) ^ 2', out: '4' },
    { expr: '2 ^ -3', out: '0.125' },
    { expr: '5!', out: '120' },
    { expr: '0!', out: '1' },
    { expr: '-3!', out: '-6' },
    { expr: '2 ^ 3!', out: '64' },
    { expr: '5 nCr 2', out: '10' },
    { expr: '5 nPr 2', out: '20' },
    { expr: 'sqrt(2)', out: '1.41421356237' },
    { expr: 'cbrt(27)', out: '3' },
    { expr: '1 / 2π', out: '0.159154943092' },
    { expr: '8 / 2(2+2)', out: '1' },
    { expr: '6 / 2(1+2)', out: '1' },
    { expr: '2(3+4)', out: '14' },
    { expr: '(1+2)(3+4)', out: '21' },
    { expr: '3 * (4 + 5', out: '27' },
    { expr: '50%', out: '0.5' },
    { expr: '200 + 10%', out: '200.1' },
    { expr: 'sin(30)', out: '0.5', angleMode: 'deg' },
    { expr: 'cos(60)', out: '0.5', angleMode: 'deg' },
    { expr: 'tan(45)', out: '1', angleMode: 'deg' },
    { expr: 'sin(90)', out: '1', angleMode: 'deg' },
    { expr: 'sin(π/6)', out: '0.5' },
    { expr: 'asin(0.5)', out: '30', angleMode: 'deg' },
    { expr: 'ln(e)', out: '1' },
    { expr: 'log(1000)', out: '3' },
    { expr: '1 / 0', err: 'Cannot divide by zero' },
    { expr: 'sqrt(-1)', err: 'Domain error' },
    { expr: 'ln(0)', err: 'Domain error' },
    { expr: '(-3)!', err: 'Domain error' },
    { expr: '1e308 * 10', err: 'Overflow' },
    { expr: '1 / 3000000000', out: '3.33333333333e-10' },
    { expr: '1000000 * 1000000', out: '1,000,000,000,000' },
    { expr: '-0', out: '0' },
    { expr: '', out: '0' },
    { expr: 'ans * 4', out: '20', ans: 5 },
    { expr: 'tan(90)', err: 'Domain error', angleMode: 'deg' },
    { expr: 'sin(180)', out: '0', angleMode: 'deg' },
    { expr: '2 +', err: 'Syntax error' }
  ];

  function run() {
    var E = window.CalcEngine;
    return CASES.map(function (c) {
      var opts = { angleMode: c.angleMode || 'rad' };
      if (typeof c.ans === 'number') opts.ans = c.ans;
      var result = E.evaluate(E.tokenize(c.expr), opts);
      var got = result.ok ? E.format(result.value) : result.error;
      var want = c.err || c.out;
      return { expr: c.expr || '(empty)', want: want, got: got, pass: got === want };
    });
  }

  window.runCalcTests = run;

  function mount() {
    var results = run();
    var pass = results.filter(function (r) { return r.pass; }).length;
    var style = document.createElement('style');
    style.textContent = [
      '#testPanel{position:fixed;inset:10px;z-index:99;display:flex;flex-direction:column;gap:10px;',
      'padding:16px;background:#0f141d;color:#e7ecf5;border:1px solid #2a3342;border-radius:16px;',
      'font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;box-shadow:0 24px 70px rgba(0,0,0,.6);overflow:auto}',
      '#testPanel h2{margin:0;font:600 15px/1.2 ui-sans-serif,system-ui,sans-serif;display:flex;gap:10px;align-items:center}',
      '#testPanel .ok{color:#43d17c}#testPanel .bad{color:#ff7b72}',
      '#testPanel table{border-collapse:collapse;width:100%}',
      '#testPanel th,#testPanel td{padding:5px 8px;border-bottom:1px solid #212a38;text-align:left;vertical-align:top}',
      '#testPanel th{color:#8b95a8;font-weight:600;position:sticky;top:0;background:#0f141d}',
      '#testPanel td.e{color:#aeb8c9;white-space:pre-wrap;word-break:break-word}',
      '#testPanel .pill{display:inline-block;padding:1px 7px;border-radius:9px;font-size:11px}',
      '#testPanel .pill.ok{background:#123322;color:#43d17c}#testPanel .pill.bad{background:#3a1717;color:#ff7b72}',
      '#testPanel button{align-self:flex-start;margin-top:4px;padding:7px 14px;border:1px solid #2a3342;',
      'border-radius:8px;background:#1a2230;color:#e7ecf5;font:inherit;cursor:pointer}'
    ].join('');
    document.head.appendChild(style);

    var panel = document.createElement('section');
    panel.id = 'testPanel';
    panel.setAttribute('aria-label', 'Calculator self tests');
    var head = document.createElement('h2');
    head.innerHTML = 'Self tests <span class="' + (pass === results.length ? 'ok' : 'bad') + '">' +
      pass + ' / ' + results.length + ' passing</span>';
    panel.appendChild(head);

    var table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>Expression</th><th>Expected</th><th>Got</th><th>Status</th></tr></thead>';
    var body = document.createElement('tbody');
    results.forEach(function (r) {
      var tr = document.createElement('tr');
      [r.expr, r.want, r.got].forEach(function (text, idx) {
        var td = document.createElement('td');
        if (idx === 0) td.className = 'e';
        td.textContent = text;
        tr.appendChild(td);
      });
      var status = document.createElement('td');
      status.innerHTML = '<span class="pill ' + (r.pass ? 'ok' : 'bad') + '">' + (r.pass ? 'pass' : 'FAIL') + '</span>';
      tr.appendChild(status);
      body.appendChild(tr);
    });
    table.appendChild(body);
    panel.appendChild(table);

    var close = document.createElement('button');
    close.textContent = 'Close tests';
    close.addEventListener('click', function () { panel.remove(); });
    panel.appendChild(close);
    document.body.appendChild(panel);

    var rows = results.map(function (r) { return { expr: r.expr, expected: r.want, got: r.got, pass: r.pass }; });
    if (window.console) console.table(rows);
  }

  if (/[?&]test=1(?:&|$)/.test(window.location.search)) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
  }
})();
