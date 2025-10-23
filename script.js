(() => {
  const displayExpr = document.getElementById('displayExpr');
  const displayResult = document.getElementById('displayResult');
  const keys = document.getElementById('keys');
  const themeToggle = document.getElementById('themeToggle');

  // Theme
  const applyTheme = (t) => document.documentElement.setAttribute('data-theme', t);
  const savedTheme = localStorage.getItem('theme') || 'dark';
  applyTheme(savedTheme);
  updateThemeIcon(savedTheme);

  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
    scheduleFit();
  });

  function updateThemeIcon(mode) {
    const span = themeToggle.querySelector('.theme-toggle__icon');
    span.textContent = mode === 'dark' ? '🌙' : '☀️';
  }

  // Calculator state
  let expr = '';
  let justEvaluated = false;

  let fitRaf = null;

  function fitText(el, { min = 12, step = 1, padding = 0 } = {}) {
    const container = el.parentElement;
    if (!container) return;
    const available = Math.max(container.clientWidth - padding, 0);
    el.style.fontSize = '';
    let size = parseFloat(getComputedStyle(el).fontSize) || min;
    el.style.fontSize = `${size}px`;

    while (size > min && el.scrollWidth > available) {
      size -= step;
      el.style.fontSize = `${size}px`;
    }
  }

  function fitDisplays() {
    fitText(displayExpr, { min: 14, step: 1, padding: 24 });
    fitText(displayResult, { min: 18, step: 1, padding: 24 });
  }

  function scheduleFit() {
    if (fitRaf) cancelAnimationFrame(fitRaf);
    fitRaf = requestAnimationFrame(() => {
      fitDisplays();
      fitRaf = null;
    });
  }

  function prettyExpr(s) {
    return s
      .replace(/\*/g, '×')
      .replace(/\//g, '÷');
  }

  function setExpr(s) {
    expr = s;
    displayExpr.textContent = prettyExpr(expr);
    scheduleFit();
  }

  function setResult(val) {
    displayResult.textContent = val;
    scheduleFit();
  }

  function isOperator(ch) {
    return ['+', '-', '*', '/'].includes(ch);
  }

  function lastChar(s) { return s[s.length - 1]; }

  function clampLength(str, max = 64) {
    return str.length > max ? str.slice(0, max) : str;
  }

  // Tokenizer + Shunting-yard evaluator (no eval)
  function tokenize(s) {
    const tokens = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === ' ') { i++; continue; }
      if ('()+-*/'.includes(ch)) {
        // Handle unary minus
        if (ch === '-' && (tokens.length === 0 || (typeof tokens[tokens.length-1] === 'string' && tokens[tokens.length-1] !== ')'))) {
          // attach to number
          let j = i + 1;
          let num = '-';
          let hasDot = false;
          while (j < s.length) {
            const c2 = s[j];
            if (c2 === '.') {
              if (hasDot) break; hasDot = true; num += c2; j++;
            } else if (/[0-9]/.test(c2)) { num += c2; j++; }
            else break;
          }
          if (num === '-') { tokens.push('-'); i++; }
          else { tokens.push(parseFloat(num)); i = j; }
          continue;
        }
        tokens.push(ch);
        i++;
        continue;
      }
      if (/[0-9.]/.test(ch)) {
        let j = i;
        let num = '';
        let hasDot = false;
        while (j < s.length) {
          const c2 = s[j];
          if (c2 === '.') {
            if (hasDot) break; hasDot = true; num += c2; j++;
          } else if (/[0-9]/.test(c2)) { num += c2; j++; }
          else break;
        }
        tokens.push(parseFloat(num));
        i = j;
        continue;
      }
      // Unknown char -> stop
      throw new Error('Invalid character');
    }
    return tokens;
  }

  function toRPN(tokens) {
    const out = [];
    const ops = [];
    const prec = { '+':1, '-':1, '*':2, '/':2 };
    const leftAssoc = { '+':true, '-':true, '*':true, '/':true };
    for (const t of tokens) {
      if (typeof t === 'number') out.push(t);
      else if (t in prec) {
        while (ops.length) {
          const top = ops[ops.length-1];
          if ((top in prec) && ((leftAssoc[t] && prec[t] <= prec[top]) || (!leftAssoc[t] && prec[t] < prec[top]))) {
            out.push(ops.pop());
          } else break;
        }
        ops.push(t);
      } else if (t === '(') ops.push(t);
      else if (t === ')') {
        while (ops.length && ops[ops.length-1] !== '(') out.push(ops.pop());
        if (!ops.length) throw new Error('Mismatched parentheses');
        ops.pop(); // pop '('
      } else {
        throw new Error('Invalid token');
      }
    }
    while (ops.length) {
      const op = ops.pop();
      if (op === '(' || op === ')') throw new Error('Mismatched parentheses');
      out.push(op);
    }
    return out;
  }

  function evalRPN(rpn) {
    const st = [];
    for (const t of rpn) {
      if (typeof t === 'number') st.push(t);
      else if (['+','-','*','/'].includes(t)) {
        const b = st.pop();
        const a = st.pop();
        if (a === undefined || b === undefined) throw new Error('Malformed');
        switch (t) {
          case '+': st.push(a + b); break;
          case '-': st.push(a - b); break;
          case '*': st.push(a * b); break;
          case '/': st.push(b === 0 ? NaN : a / b); break;
        }
      } else throw new Error('Invalid RPN');
    }
    if (st.length !== 1) throw new Error('Malformed');
    return st[0];
  }

  function evaluate(s) {
    const tokens = tokenize(s);
    const rpn = toRPN(tokens);
    return evalRPN(rpn);
  }

  function formatNumber(n) {
    if (!isFinite(n)) return 'Error';
    const rounded = Math.round(n * 1e10) / 1e10;
    const s = rounded.toString();
    // Use locale formatting for readability
    const parts = s.split('.');
    const int = Number(parts[0]).toLocaleString(undefined);
    if (parts.length === 1) return int;
    const frac = parts[1].replace(/0+$/, '');
    return frac ? `${int}.${frac}` : int;
  }

  function handleInput(val) {
    if (justEvaluated && /[0-9.(]/.test(val)) {
      // start a fresh expression after equals if next is number or dot or (
      setExpr('');
      setResult('0');
    }
    justEvaluated = false;

    if (/[0-9]/.test(val)) {
      setExpr(clampLength(expr + val));
      return;
    }
    if (val === '.') {
      // Prevent multiple dots in the current number token
      const match = expr.match(/([0-9]*\.?[0-9]*)$/);
      const current = match ? match[0] : '';
      if (current.includes('.')) return;
      setExpr(clampLength(expr + (current === '' ? '0.' : '.')));
      return;
    }
    if (isOperator(val)) {
      if (expr === '' && val !== '-') return; // allow leading minus only
      const lc = lastChar(expr || '');
      if (isOperator(lc)) {
        // Replace last operator (but keep minus if switching sign)
        setExpr(expr.slice(0, -1) + val);
      } else {
        setExpr(clampLength(expr + val));
      }
      return;
    }
    if (val === '(' || val === ')') {
      setExpr(clampLength(expr + val));
      return;
    }
  }

  function doPercent() {
    // Turn the last number into percent (/100)
    const m = expr.match(/(\d*\.?\d+)(?!.*\d)/);
    if (!m) return;
    const start = m.index;
    const num = parseFloat(m[0]);
    const replaced = (num / 100).toString();
    setExpr(expr.slice(0, start) + replaced + expr.slice(start + m[0].length));
  }

  function doDelete() {
    if (!expr) return;
    setExpr(expr.slice(0, -1));
  }

  function doClear() {
    setExpr('');
    setResult('0');
    justEvaluated = false;
  }

  function doEquals() {
    if (!expr) return;
    try {
      const res = evaluate(expr);
      setResult(formatNumber(res));
      justEvaluated = true;
    } catch (e) {
      setResult('Error');
      justEvaluated = true;
    }
  }

  // Clicks
  keys.addEventListener('click', (e) => {
    const btn = e.target.closest('button.key');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (action === 'clear') return void doClear();
    if (action === 'delete') return void doDelete();
    if (action === 'equals') return void doEquals();
    const val = btn.getAttribute('data-value');
    if (val === '%') return void doPercent();
    handleInput(val);
  });

  // Keyboard
  window.addEventListener('keydown', (e) => {
    const k = e.key;
    if (/^[0-9]$/.test(k)) return void handleInput(k);
    if (k === '.') return void handleInput('.');
    if (k === '+' || k === '-' || k === '*' || k === '/') return void handleInput(k);
    if (k === '(' || k === ')') return void handleInput(k);
    if (k === 'Enter' || k === '=') { e.preventDefault(); return void doEquals(); }
    if (k === 'Backspace') { e.preventDefault(); return void doDelete(); }
    if (k === 'Escape') { e.preventDefault(); return void doClear(); }
    if (k === '%') { e.preventDefault(); return void doPercent(); }
  });

  window.addEventListener('resize', scheduleFit);
  scheduleFit();
})();
