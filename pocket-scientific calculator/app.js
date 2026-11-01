/* Pocket Scientific — UI, token editor, persistence. */
(function () {
  'use strict';

  var E = window.CalcEngine;
  var $ = function (id) { return document.getElementById(id); };
  var OP_TEXT = { '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^', ncr: ' nCr ', npr: ' nPr ', mod: ' mod ', exp: '×10^' };
  var POST_TEXT = { '!': '!', '%': '%', sq: '²', cube: '³', inv: '⁻¹' };
  var FN_TEXT = {
    sin: 'sin(', cos: 'cos(', tan: 'tan(', asin: 'sin⁻¹(', acos: 'cos⁻¹(', atan: 'tan⁻¹(',
    ln: 'ln(', log: 'log(', sqrt: '√(', cbrt: '∛(', abs: 'abs(', exp: 'e^(', pow10: '10^('
  };
  var ANGLE_NAME = { deg: 'degrees', rad: 'radians', grad: 'gradians' };
  var SYSTEM_LIGHT = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

  /* ---------- state ---------- */
  var state = {
    tokens: [], caret: 0, entry: false, committed: null,
    angle: 'deg', ans: 0, memory: 0, theme: 'dark', second: false,
    history: [], error: null
  };
  var evalCache = { sig: null, result: null };
  var stored = {};

  function load(key, fallback) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* file:// may block */ }
  }
  function saveSettings() { save('calc.settings.v1', { theme: state.theme, angleMode: state.angle }); }

  function boot() {
    stored = load('calc.settings.v1', {}) || {};
    state.theme = stored.theme === 'light' || stored.theme === 'dark'
      ? stored.theme : (SYSTEM_LIGHT && SYSTEM_LIGHT.matches ? 'light' : 'dark');
    state.angle = stored.angleMode === 'rad' || stored.angleMode === 'grad' ? stored.angleMode : 'deg';
    state.memory = Number(load('calc.memory.v1', 0)) || 0;
    state.history = sanitize(load('calc.history.v1', []));
    applyTheme(state.theme);
    applySecond();
    renderHistory();
    render();
    if (SYSTEM_LIGHT && SYSTEM_LIGHT.addEventListener && !stored.theme) {
      SYSTEM_LIGHT.addEventListener('change', function (e) {
        if (!stored.theme) { state.theme = e.matches ? 'light' : 'dark'; applyTheme(state.theme); }
      });
    }
  }

  function sanitize(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter(function (e) {
      return e && typeof e.id === 'string' && Array.isArray(e.tokens) &&
        typeof e.text === 'string' && typeof e.result === 'string';
    }).slice(0, 50);
  }

  /* ---------- tokens ---------- */
  function tokenText(tk) {
    switch (tk.t) {
      case 'num': return tk.v;
      case 'op': return OP_TEXT[tk.v] || tk.v;
      case 'post': return POST_TEXT[tk.v] || tk.v;
      case 'fn': return FN_TEXT[tk.name] || (tk.name + '(');
      case 'const': return tk.name === 'pi' ? 'π' : tk.name;
      case 'ans': return 'Ans';
      case 'lparen': return '(';
      case 'rparen': return ')';
    }
    return '';
  }
  function tokenClass(tk) {
    if (tk.t === 'op') return 'op';
    if (tk.t === 'num') return 'num';
    if (tk.t === 'fn') return 'fn';
    if (tk.t === 'const') return 'const';
    if (tk.t === 'ans') return 'ans';
    return '';
  }
  function expressionText(tokens) {
    var out = '';
    for (var i = 0; i < tokens.length; i++) out += tokenText(tokens[i]);
    return out.replace(/\s+/g, ' ').trim();
  }
  function clone(tokens) { return tokens.map(function (t) { return Object.assign({}, t); }); }
  function openCount() {
    var n = 0;
    for (var i = 0; i < state.tokens.length; i++) {
      if (state.tokens[i].t === 'lparen' || state.tokens[i].t === 'fn') n++;
      else if (state.tokens[i].t === 'rparen') n--;
    }
    return n;
  }

  /* ---------- editor ---------- */
  function beginFresh() {
    if (state.entry) return;
    state.entry = true;
    state.tokens = [];
    state.caret = 0;
    state.committed = null;
    state.error = null;
    evalCache.sig = null;
  }
  function beginWithAns() {
    if (state.entry) return;
    beginFresh();
    state.tokens = [{ t: 'ans' }];
    state.caret = 1;
  }
  function insertToken(tk) {
    state.tokens.splice(state.caret, 0, tk);
    state.caret++;
  }
  function inputDigit(d) {
    beginFresh();
    var prev = state.tokens[state.caret - 1];
    if (prev && prev.t === 'num') {
      if (prev.v.indexOf('e') !== -1 || prev.v.replace(/[-.]/g, '').length >= 15) return;
      if (prev.v === '0') prev.v = d;
      else if (prev.v === '-0') prev.v = '-' + d;
      else prev.v += d;
      return;
    }
    insertToken({ t: 'num', v: d });
  }
  function inputDecimal() {
    beginFresh();
    var prev = state.tokens[state.caret - 1];
    if (prev && prev.t === 'num') {
      if (prev.v.indexOf('.') !== -1 || prev.v.indexOf('e') !== -1) return;
      prev.v += '.';
      return;
    }
    insertToken({ t: 'num', v: '0.' });
  }
  function inputOperator(op) {
    if (!state.entry) { if (state.committed) beginWithAns(); else beginFresh(); }
    var prev = state.tokens[state.caret - 1];
    if (!prev && op !== '-' && op !== '+') return;
    if (prev && prev.t === 'op') { prev.v = op; return; }
    insertToken({ t: 'op', v: op });
  }
  function endsValue() {
    var prev = state.tokens[state.caret - 1];
    return !!prev && (prev.t === 'num' || prev.t === 'const' || prev.t === 'ans' ||
      prev.t === 'rparen' || prev.t === 'post');
  }
  function inputPostfix(p) {
    if (!state.entry) { if (state.committed) beginWithAns(); else beginFresh(); }
    if (!endsValue()) return;
    insertToken({ t: 'post', v: p });
  }
  function inputFn(name) { beginFresh(); insertToken({ t: 'fn', name: name }); }
  function inputConst(name) { beginFresh(); insertToken({ t: 'const', name: name }); }
  function inputAns() { beginFresh(); insertToken({ t: 'ans' }); }
  function inputParen(p) {
    beginFresh();
    if (p === ')' && openCount() <= 0) return;
    insertToken({ t: p === '(' ? 'lparen' : 'rparen' });
  }
  function inputRoot() {
    beginFresh();
    insertToken({ t: 'op', v: '^' });
    insertToken({ t: 'lparen' });
    insertToken({ t: 'num', v: '1' });
    insertToken({ t: 'op', v: '/' });
  }
  function toggleSign() {
    if (!state.entry) { if (state.committed) beginWithAns(); else beginFresh(); }
    var prev = state.tokens[state.caret - 1];
    if (prev && prev.t === 'num') {
      prev.v = prev.v.charAt(0) === '-' ? prev.v.slice(1) : '-' + prev.v;
    } else insertToken({ t: 'op', v: '-' });
  }
  function backspace() {
    if (!state.entry) { if (state.committed) clearAll(); return; }
    if (state.caret > 0) { state.tokens.splice(state.caret - 1, 1); state.caret--; }
  }
  function clearAll() {
    state.tokens = [];
    state.caret = 0;
    state.entry = false;
    state.committed = null;
    state.error = null;
    evalCache.sig = null;
  }
  function isAC() { return !state.entry || state.tokens.length === 0; }
  function currentPreview() {
    if (!state.entry || !state.tokens.length) return null;
    var sig = JSON.stringify(state.tokens) + '|' + state.angle + '|' + state.ans;
    if (evalCache.sig !== sig) {
      evalCache = { sig: sig, result: E.evaluate(state.tokens, { angleMode: state.angle, ans: state.ans }) };
    }
    return evalCache.result;
  }
  function displayedValue() {
    if (state.entry) {
      var p = currentPreview();
      return p && p.ok ? p.value : 0;
    }
    return state.committed ? state.committed.value : 0;
  }

  /* ---------- commit / history ---------- */
  function commit() {
    if (!state.entry) return;
    if (!state.tokens.length) {
      state.entry = false;
      state.committed = { tokens: [], value: 0 };
      state.error = null;
      announce('0');
      render();
      return;
    }
    var p = currentPreview();
    if (!p || !p.ok) {
      state.error = p ? p.error : 'Syntax error';
      announce('Error: ' + state.error);
      render();
      return;
    }
    var closed = E.autoClose(state.tokens);
    var text = expressionText(closed);
    state.ans = p.value;
    state.committed = { tokens: closed, value: p.value };
    state.entry = false;
    state.tokens = [];
    state.caret = 0;
    state.error = null;
    evalCache.sig = null;
    addHistory(closed, text, p.value);
    announce(text + ' equals ' + E.format(p.value));
    render();
  }
  function addHistory(tokens, text, value) {
    state.history.unshift({
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      tokens: clone(tokens), text: text, result: E.format(value)
    });
    if (state.history.length > 50) state.history.length = 50;
    save('calc.history.v1', state.history);
    renderHistory();
  }
  function deleteHistory(id) {
    state.history = state.history.filter(function (e) { return e.id !== id; });
    save('calc.history.v1', state.history);
    renderHistory();
  }
  function loadHistory(entry) {
    state.tokens = clone(entry.tokens);
    state.caret = state.tokens.length;
    state.entry = true;
    state.committed = null;
    state.error = null;
    evalCache.sig = null;
    setHistoryOpen(false);
    render();
  }

  /* ---------- memory ---------- */
  function memoryAction(a) {
    if (a === 'recall') {
      beginFresh();
      insertToken({ t: 'num', v: String(state.memory) });
      return;
    }
    if (a === 'clear') { state.memory = 0; }
    else {
      var v = displayedValue();
      state.memory = a === 'add' ? state.memory + v : state.memory - v;
    }
    save('calc.memory.v1', state.memory);
    render();
  }

  /* ---------- rendering ---------- */
  function render() {
    renderExpression();
    renderResult();
    var clear = document.querySelector('[data-act="clear"]');
    var ac = isAC();
    clear.textContent = ac ? 'AC' : 'C';
    clear.setAttribute('aria-label', ac ? 'clear all' : 'clear entry');
    var chip = $('angleChip');
    chip.textContent = state.angle.toUpperCase();
    chip.setAttribute('aria-label', 'Angle mode: ' + ANGLE_NAME[state.angle] + '. Activate to change');
    $('memFlag').hidden = state.memory === 0;
    $('secondFlag').hidden = !state.second;
    $('secondKey').classList.toggle('is-on', state.second);
    $('secondKey').setAttribute('aria-pressed', String(state.second));
  }

  function renderExpression() {
    var el = $('expr');
    el.textContent = '';
    var tokens = state.entry ? state.tokens : (state.committed ? state.committed.tokens : []);
    var caret = state.entry ? state.caret : -1;
    tokens.forEach(function (tk, idx) {
      if (idx === caret) el.appendChild(caretEl());
      var span = document.createElement('span');
      span.className = 'tok ' + tokenClass(tk);
      span.dataset.index = String(idx);
      span.textContent = tokenText(tk);
      el.appendChild(span);
    });
    if (caret >= tokens.length) el.appendChild(caretEl());
    if (!state.entry && state.committed) {
      var eq = document.createElement('span');
      eq.className = 'tok op';
      eq.textContent = ' =';
      el.appendChild(eq);
    }
    var text = expressionText(tokens);
    el.setAttribute('aria-label', 'Expression: ' + (text || 'empty'));
    var c = el.querySelector('.caret');
    if (c) {
      var left = c.offsetLeft;
      if (left < el.scrollLeft) el.scrollLeft = Math.max(0, left - 10);
      else if (left + 4 > el.scrollLeft + el.clientWidth) el.scrollLeft = left + 4 - el.clientWidth + 10;
    } else el.scrollLeft = el.scrollWidth;
  }
  function caretEl() {
    var s = document.createElement('span');
    s.className = 'caret';
    s.setAttribute('aria-hidden', 'true');
    return s;
  }
  function setResultText(text) {
    var el = $('result');
    var m = /^(.+?)e([+-]?\d+)$/.exec(text);
    el.textContent = '';
    if (m) {
      el.appendChild(document.createTextNode(m[1]));
      var sup = document.createElement('sup');
      sup.textContent = m[2];
      el.appendChild(sup);
    } else el.textContent = text;
  }
  function sizeFor(n) { return n <= 9 ? 'lg' : n <= 12 ? 'md' : n <= 16 ? 'sm' : 'xs'; }
  function renderResult() {
    var el = $('result');
    var err = $('error');
    if (state.error) {
      el.className = 'result error';
      el.dataset.size = 'xs';
      el.textContent = 'Error';
      err.textContent = state.error;
      err.hidden = false;
      return;
    }
    err.hidden = true;
    var text, preview = false;
    if (state.entry) {
      var p = currentPreview();
      if (p && p.ok) { text = E.format(p.value); preview = true; }
      else text = '0';
    } else if (state.committed) text = E.format(state.committed.value);
    else { text = '0'; preview = true; }
    el.className = 'result' + (preview ? ' preview' : '');
    setResultText(text);
    el.dataset.size = sizeFor(text.length);
  }
  function resultText() {
    if (state.error) return '';
    if (state.entry) {
      var p = currentPreview();
      return p && p.ok ? E.format(p.value) : '';
    }
    return state.committed ? E.format(state.committed.value) : '0';
  }

  /* ---------- history panel ---------- */
  function renderHistory() {
    var list = $('historyList');
    list.textContent = '';
    $('historyEmpty').hidden = state.history.length > 0;
    $('clearHistory').disabled = state.history.length === 0;
    state.history.forEach(function (entry) {
      var row = document.createElement('div');
      row.className = 'hist-item';
      var main = document.createElement('button');
      main.type = 'button';
      main.className = 'hist-main';
      main.setAttribute('aria-label', 'Load calculation ' + entry.text + ' equals ' + entry.result);
      var ex = document.createElement('span');
      ex.className = 'hist-expr';
      ex.textContent = entry.text;
      var res = document.createElement('span');
      res.className = 'hist-res';
      res.textContent = entry.result;
      main.appendChild(ex);
      main.appendChild(res);
      main.addEventListener('click', function () { loadHistory(entry); });
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'hist-del';
      del.textContent = '×';
      del.setAttribute('aria-label', 'Delete calculation ' + entry.text);
      del.addEventListener('click', function () { deleteHistory(entry.id); });
      row.appendChild(main);
      row.appendChild(del);
      list.appendChild(row);
    });
  }
  function setHistoryOpen(open) {
    var panel = $('historyPanel');
    panel.classList.toggle('open', open);
    $('backdrop').hidden = !open;
    $('historyBtn').setAttribute('aria-expanded', String(open));
    if (window.innerWidth >= 900) return;
    if (open) $('closeHistory').focus();
    else $('historyBtn').focus();
  }

  /* ---------- theme / angle / second ---------- */
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === 'dark' ? '#0b0e14' : '#eef1f6';
    $('themeBtn').setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }
  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(state.theme);
    saveSettings();
  }
  function cycleAngle() {
    state.angle = state.angle === 'deg' ? 'rad' : state.angle === 'rad' ? 'grad' : 'deg';
    evalCache.sig = null;
    saveSettings();
    render();
  }
  var altKeys = [];
  function applySecond() {
    altKeys.forEach(function (k) {
      if (k.dataset.baseLabel === undefined) {
        k.dataset.baseLabel = k.textContent;
        k.dataset.baseAria = k.getAttribute('aria-label') || '';
      }
      k.textContent = state.second ? k.dataset.altLabel : k.dataset.baseLabel;
      k.setAttribute('aria-label', state.second ? (k.dataset.altAria || k.dataset.baseAria) : k.dataset.baseAria);
    });
  }
  function toggleSecond() {
    state.second = !state.second;
    applySecond();
    render();
  }
  function keyAction(btn) {
    if (state.second && btn.dataset.altAct) {
      return { act: btn.dataset.altAct, val: btn.dataset.altVal };
    }
    return { act: btn.dataset.act, val: btn.dataset.val };
  }

  /* ---------- feedback ---------- */
  var toastTimer;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1500);
  }
  function announce(msg) { $('live').textContent = msg; }
  function flash(act, val) {
    var sel = 'button[data-act="' + act + '"' + (val != null && val !== '' ? '][data-val="' + val + '"]' : ']');
    var btn = document.querySelector(sel);
    if (!btn) return;
    btn.classList.add('is-pressed');
    setTimeout(function () { btn.classList.remove('is-pressed'); }, 120);
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
  }
  function copyResult() {
    var text = resultText();
    if (!text) { toast('Nothing to copy'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('Copied ' + text); },
        function () { fallbackCopy(text); toast('Copied ' + text); });
    } else { fallbackCopy(text); toast('Copied ' + text); }
  }

  /* ---------- actions ---------- */
  function perform(act, val) {
    if (act !== 'second' && state.second) { state.second = false; applySecond(); }
    flash(act, val);
    if (act !== 'equals') state.error = null;
    switch (act) {
      case 'digit': inputDigit(val); break;
      case 'decimal': inputDecimal(); break;
      case 'op': inputOperator(val); break;
      case 'post': inputPostfix(val); break;
      case 'fn': inputFn(val); break;
      case 'const': inputConst(val); break;
      case 'ans': inputAns(); break;
      case 'paren': inputParen(val); break;
      case 'sign': toggleSign(); break;
      case 'backspace': backspace(); break;
      case 'clear': if (isAC()) clearAll(); else { state.tokens = []; state.caret = 0; } break;
      case 'equals': commit(); break;
      case 'memory': memoryAction(val); break;
      case 'root': inputRoot(); break;
      case 'second': toggleSecond(); break;
    }
    render();
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'second') { toggleSecond(); return; }
    var a = keyAction(btn);
    perform(a.act, a.val);
  });
  $('angleChip').addEventListener('click', cycleAngle);
  $('themeBtn').addEventListener('click', toggleTheme);
  $('copyBtn').addEventListener('click', copyResult);
  $('historyBtn').addEventListener('click', function () {
    setHistoryOpen(!$('historyPanel').classList.contains('open'));
  });
  $('closeHistory').addEventListener('click', function () { setHistoryOpen(false); });
  $('backdrop').addEventListener('click', function () { setHistoryOpen(false); });
  $('clearHistory').addEventListener('click', function () {
    state.history = [];
    save('calc.history.v1', state.history);
    renderHistory();
    toast('History cleared');
  });
  $('expr').addEventListener('click', function (e) {
    if (!state.entry) return;
    var span = e.target.closest('.tok');
    if (!span) { state.caret = state.tokens.length; render(); return; }
    var idx = Number(span.dataset.index);
    var rect = span.getBoundingClientRect();
    state.caret = e.clientX < rect.left + rect.width / 2 ? idx : idx + 1;
    render();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('historyPanel').classList.contains('open')) {
      setHistoryOpen(false);
      e.preventDefault();
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      var low = e.key.toLowerCase();
      if (low === 'c') { copyResult(); e.preventDefault(); }
      else if (low === 'a') { clearAll(); render(); e.preventDefault(); }
      return;
    }
    if (e.altKey) return;
    var k = e.key;
    if (e.target && e.target.tagName === 'INPUT') return;
    if (/^[0-9]$/.test(k)) perform('digit', k);
    else if (k === '.' || k === ',') perform('decimal');
    else if (k === '+' || k === '-' || k === '*' || k === '/' || k === '^') perform('op', k);
    else if (k === '(' || k === ')') perform('paren', k);
    else if (k === '!') perform('post', '!');
    else if (k === '%') perform('post', '%');
    else if (k === 'Enter' || k === '=') perform('equals');
    else if (k === 'Backspace') perform('backspace');
    else if (k === 'Escape' || k === 'Delete') perform('clear');
    else if (k === 'ArrowLeft') { moveCaret(-1); e.preventDefault(); }
    else if (k === 'ArrowRight') { moveCaret(1); e.preventDefault(); }
    else if (k === 'Home') { moveCaret(-Infinity); e.preventDefault(); }
    else if (k === 'End') { moveCaret(Infinity); e.preventDefault(); }
    else return;
    e.preventDefault();
  });
  function moveCaret(d) {
    if (!state.entry) return;
    state.caret = Math.max(0, Math.min(state.tokens.length, state.caret + d));
    render();
  }

  altKeys = Array.prototype.slice.call(document.querySelectorAll('[data-alt-label]'));
  boot();
})();
