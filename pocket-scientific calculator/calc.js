/* Pocket Scientific — pure math engine. No DOM access. */
(function (root) {
  'use strict';

  function CalcError(msg) { this.message = msg; }
  CalcError.prototype = Object.create(Error.prototype);
  function fail(msg) { throw new CalcError(msg); }

  var NUM_RE = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
  var WORDS = ['arcsin', 'arccos', 'arctan', 'asin', 'acos', 'atan', 'sin', 'cos',
    'tan', 'sqrt', 'cbrt', 'ln', 'log', 'abs', 'exp', 'pow10', 'mod', 'ncr',
    'npr', 'ans', 'rand', 'pi', 'e'];
  var WORD_RE = new RegExp('^(?:' + WORDS.join('|') + ')(?![A-Za-z])', 'i');
  var FN_NAMES = { sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1, ln: 1, log: 1, sqrt: 1, cbrt: 1, abs: 1, exp: 1, pow10: 1 };

  /* ---------- tokenizer ---------- */
  function tokenize(input) {
    var s = String(input == null ? '' : input);
    var out = [];
    var i = 0;
    while (i < s.length) {
      var ch = s.charAt(i);
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '−' || ch === '–' || ch === '—') { out.push({ t: 'op', v: '-' }); i++; continue; }
      if (ch === '×' || ch === '·') { out.push({ t: 'op', v: '*' }); i++; continue; }
      if (ch === '÷') { out.push({ t: 'op', v: '/' }); i++; continue; }
      if (ch === 'π') { out.push({ t: 'const', name: 'pi' }); i++; continue; }
      if (ch === '√') { out.push({ t: 'fn', name: 'sqrt' }); i++; continue; }
      if (ch === '∛') { out.push({ t: 'fn', name: 'cbrt' }); i++; continue; }
      if (ch === '²') { out.push({ t: 'post', v: 'sq' }); i++; continue; }
      if (ch === '³') { out.push({ t: 'post', v: 'cube' }); i++; continue; }
      if (ch === '⁻' && s.charAt(i + 1) === '¹') { out.push({ t: 'post', v: 'inv' }); i += 2; continue; }
      if (/\d/.test(ch) || (ch === '.' && /\d/.test(s.charAt(i + 1)))) {
        var nm = s.slice(i).match(NUM_RE);
        if (nm) { out.push({ t: 'num', v: nm[0] }); i += nm[0].length; continue; }
      }
      var wm = s.slice(i).match(WORD_RE);
      if (wm) {
        var w = wm[0].toLowerCase();
        i += wm[0].length;
        if (w === 'pi') out.push({ t: 'const', name: 'pi' });
        else if (w === 'e') out.push({ t: 'const', name: 'e' });
        else if (w === 'rand') out.push({ t: 'const', name: 'rand' });
        else if (w === 'ans') out.push({ t: 'ans' });
        else if (w === 'mod' || w === 'ncr' || w === 'npr') out.push({ t: 'op', v: w });
        else {
          if (w === 'arcsin') w = 'asin';
          if (w === 'arccos') w = 'acos';
          if (w === 'arctan') w = 'atan';
          if (!FN_NAMES[w]) out.push({ t: 'bad' });
          else {
            out.push({ t: 'fn', name: w });
            var j = i;
            while (j < s.length && /\s/.test(s.charAt(j))) j++;
            if (s.charAt(j) === '(') i = j + 1; /* fn tokens imply their '(' */
          }
        }
        continue;
      }
      if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^') out.push({ t: 'op', v: ch });
      else if (ch === '!') out.push({ t: 'post', v: '!' });
      else if (ch === '%') out.push({ t: 'post', v: '%' });
      else if (ch === '(') out.push({ t: 'lparen' });
      else if (ch === ')') out.push({ t: 'rparen' });
      else out.push({ t: 'bad' });
      i++;
    }
    return out;
  }

  /* ---------- helpers ---------- */
  function autoClose(tokens) {
    var out = (tokens || []).slice();
    var open = 0, close = 0, k;
    for (k = 0; k < out.length; k++) {
      if (out[k].t === 'lparen' || out[k].t === 'fn') open++;
      else if (out[k].t === 'rparen') close++;
    }
    for (k = 0; k < open - close; k++) out.push({ t: 'rparen' });
    return out;
  }

  function check(v) {
    if (Number.isNaN(v)) fail('Domain error');
    if (!isFinite(v)) fail('Overflow');
    return v;
  }

  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }

  function mulberry() { return Math.random(); }

  function factorial(x) {
    if (!isInt(x) || x < 0) fail('Domain error');
    if (x > 170) fail('Overflow');
    var r = 1, k;
    for (k = 2; k <= x; k++) { r *= k; if (!isFinite(r)) fail('Overflow'); }
    return r;
  }

  function applyPost(op, v) {
    if (op === '!') return factorial(v);
    if (op === '%') return check(v / 100);
    if (op === 'sq') return check(v * v);
    if (op === 'cube') return check(v * v * v);
    if (op === 'inv') { if (v === 0) fail('Cannot divide by zero'); return check(1 / v); }
    fail('Syntax error');
  }

  function binaryWord(op, a, b) {
    if (op === 'exp') return check(a * Math.pow(10, b));
    if (op === 'mod') {
      if (b === 0) fail('Cannot divide by zero');
      return check(a % b);
    }
    if (!isInt(a) || !isInt(b) || a < 0 || b < 0 || b > a) fail('Domain error');
    var out = 1, k;
    if (op === 'ncr') {
      var r = Math.min(b, a - b);
      for (k = 1; k <= r; k++) out = out * (a - r + k) / k;
      return check(Math.round(out));
    }
    for (k = 0; k < b; k++) out = out * (a - k);
    return check(out);
  }

  function toRad(x, mode) {
    if (mode === 'deg') return x * Math.PI / 180;
    if (mode === 'grad') return x * Math.PI / 200;
    return x;
  }
  function fromRad(x, mode) {
    if (mode === 'deg') return x * 180 / Math.PI;
    if (mode === 'grad') return x * 200 / Math.PI;
    return x;
  }

  function trig(name, x, mode) {
    if (mode === 'deg' || mode === 'grad') {
      var turn = mode === 'deg' ? 360 : 400;
      var q = turn / 4;
      var r = ((x % turn) + turn) % turn;
      var near = function (v) { return Math.abs(r - v) < 1e-9; };
      if (name === 'tan' && (near(q) || near(3 * q))) fail('Domain error');
      if (near(0) || near(turn)) return name === 'cos' ? 1 : 0;
      if (near(q)) return name === 'sin' ? 1 : 0;
      if (near(2 * q)) return name === 'cos' ? -1 : 0;
      if (near(3 * q)) return name === 'sin' ? -1 : 0;
    }
    var rad = toRad(x, mode);
    return check(name === 'sin' ? Math.sin(rad) : name === 'cos' ? Math.cos(rad) : Math.tan(rad));
  }

  function applyFn(name, x, mode) {
    switch (name) {
      case 'sqrt': if (x < 0) fail('Domain error'); return Math.sqrt(x);
      case 'cbrt': return Math.cbrt(x);
      case 'abs': return Math.abs(x);
      case 'ln': if (x <= 0) fail('Domain error'); return Math.log(x);
      case 'log': if (x <= 0) fail('Domain error'); return Math.log(x) / Math.LN10;
      case 'exp': return check(Math.exp(x));
      case 'pow10': return check(Math.pow(10, x));
      case 'sin': case 'cos': case 'tan': return trig(name, x, mode);
      case 'asin': if (x < -1 || x > 1) fail('Domain error'); return fromRad(Math.asin(x), mode);
      case 'acos': if (x < -1 || x > 1) fail('Domain error'); return fromRad(Math.acos(x), mode);
      case 'atan': return fromRad(Math.atan(x), mode);
    }
    fail('Syntax error');
  }

  /* ---------- formatter ---------- */
  function trimZeros(s) {
    return s.indexOf('.') === -1 ? s : s.replace(/0+$/, '').replace(/\.$/, '');
  }
  function zeros(n) { return new Array(n + 1).join('0'); }
  function expand(s) {
    var m = s.match(/^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i);
    if (!m) return s;
    var digits = m[2] + (m[3] || '');
    var point = m[2].length + parseInt(m[4], 10);
    var out;
    if (point <= 0) out = '0.' + zeros(-point) + digits;
    else if (point >= digits.length) out = digits + zeros(point - digits.length);
    else out = digits.slice(0, point) + '.' + digits.slice(point);
    return m[1] + out;
  }
  function group(s) {
    var neg = s.charAt(0) === '-';
    if (neg) s = s.slice(1);
    var dot = s.indexOf('.');
    var head = dot === -1 ? s : s.slice(0, dot);
    var tail = dot === -1 ? '' : s.slice(dot);
    head = head.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + head + tail;
  }
  function format(v) {
    if (typeof v !== 'number' || v !== v) return 'Error';
    if (!isFinite(v)) return 'Overflow';
    if (v === 0) return '0';
    var abs = Math.abs(v);
    if (abs >= 1e13 || abs < 1e-9) {
      var e = v.toExponential(11).split('e');
      return trimZeros(e[0]) + 'e' + String(parseInt(e[1], 10));
    }
    var s = String(Number(v.toPrecision(12)));
    if (/e/i.test(s)) s = expand(s);
    return group(s);
  }

  /* ---------- evaluator ---------- */
  function evaluate(tokens, options) {
    var opts = options || {};
    var mode = opts.angleMode === 'deg' || opts.angleMode === 'grad' ? opts.angleMode : 'rad';
    var ans = typeof opts.ans === 'number' && isFinite(opts.ans) ? opts.ans : 0;
    var rand = typeof opts.rand === 'function' ? opts.rand : mulberry;
    var list = autoClose(tokens || []);
    if (!list.length) return { ok: true, value: 0 };
    var i = 0;

    function peek() { return list[i]; }
    function expectClose() {
      var tk = peek();
      if (!tk || tk.t !== 'rparen') fail('Syntax error');
      i++;
    }
    function startsValue(tk) {
      return !!tk && (tk.t === 'num' || tk.t === 'const' || tk.t === 'ans' || tk.t === 'lparen' || tk.t === 'fn');
    }

    function parsePrimary() {
      var tk = peek();
      if (!tk) fail('Syntax error');
      if (tk.t === 'num') { i++; return parseFloat(tk.v); }
      if (tk.t === 'const') {
        i++;
        if (tk.name === 'pi') return Math.PI;
        if (tk.name === 'e') return Math.E;
        if (tk.name === 'rand') { var r = rand(); return (typeof r === 'number' && isFinite(r)) ? r : 0; }
        fail('Syntax error');
      }
      if (tk.t === 'ans') { i++; return ans; }
      if (tk.t === 'lparen') { i++; var v = parseExpression(); expectClose(); return v; }
      if (tk.t === 'fn') { i++; var arg = parseExpression(); expectClose(); return applyFn(tk.name, arg, mode); }
      fail('Syntax error');
    }

    function parsePostfix() {
      var v = parsePrimary();
      for (;;) {
        var tk = peek();
        if (!tk || tk.t !== 'post') break;
        i++;
        v = applyPost(tk.v, v);
      }
      return v;
    }

    function parsePower() {
      var base = parsePostfix();
      var tk = peek();
      if (tk && tk.t === 'op' && tk.v === '^') {
        i++;
        var exp = parseUnary();
        if (base === 0 && exp < 0) fail('Cannot divide by zero');
        base = check(Math.pow(base, exp));
      }
      return base;
    }

    function parseUnary() {
      var tk = peek();
      if (tk && tk.t === 'op' && (tk.v === '+' || tk.v === '-')) {
        i++;
        var v = parseUnary();
        return tk.v === '-' ? -v : v;
      }
      return parsePower();
    }

    function parseImplicit() {
      var v = parseUnary();
      for (;;) {
        var tk = peek();
        if (!tk) break;
        if (tk.t === 'op' && (tk.v === 'ncr' || tk.v === 'npr' || tk.v === 'mod' || tk.v === 'exp')) {
          i++;
          v = binaryWord(tk.v, v, parseUnary());
          continue;
        }
        if (startsValue(tk)) {
          v = check(v * parseUnary());
          continue;
        }
        break;
      }
      return v;
    }

    function parseMul() {
      var v = parseImplicit();
      for (;;) {
        var tk = peek();
        if (!tk || tk.t !== 'op' || (tk.v !== '*' && tk.v !== '/')) break;
        i++;
        var r = parseImplicit();
        if (tk.v === '/') {
          if (r === 0) fail('Cannot divide by zero');
          v = check(v / r);
        } else v = check(v * r);
      }
      return v;
    }

    function parseExpression() {
      var v = parseMul();
      for (;;) {
        var tk = peek();
        if (!tk || tk.t !== 'op' || (tk.v !== '+' && tk.v !== '-')) break;
        i++;
        var r = parseMul();
        v = check(tk.v === '+' ? v + r : v - r);
      }
      return v;
    }

    try {
      var value = parseExpression();
      if (i < list.length) fail('Syntax error');
      return { ok: true, value: check(value) };
    } catch (err) {
      return { ok: false, error: err instanceof CalcError ? err.message : 'Syntax error' };
    }
  }

  root.CalcEngine = {
    tokenize: tokenize,
    evaluate: evaluate,
    format: format,
    autoClose: autoClose
  };
})(typeof window !== 'undefined' ? window : globalThis);
