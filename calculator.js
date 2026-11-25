const MAX_EXPRESSION_LENGTH = 1024;
const MAX_PARSE_DEPTH = 128;

class CalculationError extends Error {}

function finiteResult(value) {
  if (Number.isNaN(value)) {
    throw new CalculationError('The calculation is undefined for these values.');
  }
  if (!Number.isFinite(value)) {
    throw new CalculationError('The result is outside the supported numeric range.');
  }
  return value;
}

function tokenizeExpression(source) {
  if (typeof source !== 'string') {
    throw new CalculationError('Enter an expression as text.');
  }
  if (source.length > MAX_EXPRESSION_LENGTH) {
    throw new CalculationError('Expressions must be 1024 characters or fewer.');
  }

  const normalized = source.replace(/[×÷−π]/g, (symbol) => ({
    '×': '*', '÷': '/', '−': '-', 'π': 'pi',
  })[symbol]);
  const tokens = [];
  let position = 0;
  while (position < normalized.length) {
    const remaining = normalized.slice(position);
    const character = normalized[position];
    if (/\s/.test(character)) {
      position += 1;
    } else if (/[0-9.]/.test(character)) {
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(remaining);
      if (!match) {
        throw new CalculationError('Enter a valid decimal number.');
      }
      position += match[0].length;
      if (/[eE]/.test(normalized[position] || '')) {
        throw new CalculationError('Scientific notation needs a complete exponent.');
      }
      tokens.push({ type: 'number', value: finiteResult(Number(match[0])) });
    } else if (/[a-zA-Z]/.test(character)) {
      const name = /^[a-zA-Z]+/.exec(remaining)[0];
      tokens.push({ type: 'name', value: name });
      position += name.length;
    } else if ('+-*/^()!'.includes(character)) {
      tokens.push({ type: character });
      position += 1;
    } else {
      throw new CalculationError('The expression contains an unsupported character.');
    }
  }
  tokens.push({ type: 'end' });
  return tokens;
}

function evaluateExpression(source, angleMode = 'deg') {
  if (angleMode !== 'deg' && angleMode !== 'rad') {
    throw new CalculationError('Select a valid angle mode (DEG or RAD).');
  }

  const tokens = tokenizeExpression(source);
  let position = 0;
  let depth = 0;
  const current = () => tokens[position];
  const accept = (type) => {
    if (current().type !== type) return false;
    position += 1;
    return true;
  };
  const requireClosingParenthesis = () => {
    if (!accept(')')) {
      throw new CalculationError('Close each parenthesis.');
    }
  };

  function applyFunction(name, value) {
    const radians = angleMode === 'deg' ? (value % 360) / 180 * Math.PI : value;
    const fromRadians = (angle) => angleMode === 'deg' ? angle / Math.PI * 180 : angle;
    switch (name) {
      case 'sin': return finiteResult(Math.sin(radians));
      case 'cos': return finiteResult(Math.cos(radians));
      case 'tan':
        // Floating-point representations of odd multiples of pi/2 are not exact.
        if (Math.abs(Math.cos(radians)) <= 16 * Number.EPSILON) {
          throw new CalculationError('Tangent is undefined at this angle.');
        }
        return finiteResult(Math.tan(radians));
      case 'asin':
      case 'acos':
        if (value < -1 || value > 1) {
          throw new CalculationError('Inverse sine and cosine require a value from -1 to 1.');
        }
        return finiteResult(fromRadians(name === 'asin' ? Math.asin(value) : Math.acos(value)));
      case 'atan': return finiteResult(fromRadians(Math.atan(value)));
      case 'sqrt':
        if (value < 0) {
          throw new CalculationError('Square root requires a nonnegative value.');
        }
        return finiteResult(Math.sqrt(value));
      case 'ln':
      case 'log':
        if (value <= 0) {
          throw new CalculationError('Logarithms require a positive value.');
        }
        return finiteResult(name === 'ln' ? Math.log(value) : Math.log10(value));
      case 'abs': return Math.abs(value);
      case 'exp': return finiteResult(Math.exp(value));
      default: throw new CalculationError('Use a supported function or the constants pi and e.');
    }
  }

  function primary() {
    const token = current();
    if (accept('number')) return token.value;
    if (accept('(')) {
      const value = expression();
      requireClosingParenthesis();
      return value;
    }
    if (accept('name')) {
      if (token.value === 'pi') return Math.PI;
      if (token.value === 'e') return Math.E;
      if (!accept('(')) {
        throw new CalculationError('Functions need parentheses, for example sin(30).');
      }
      const value = expression();
      requireClosingParenthesis();
      return applyFunction(token.value, value);
    }
    throw new CalculationError('Enter a number, constant, or function where a value is expected.');
  }

  function postfix() {
    let value = primary();
    while (accept('!')) {
      if (!Number.isInteger(value) || value < 0 || value > 170) {
        throw new CalculationError('Factorial requires a whole number from 0 to 170.');
      }
      let factorial = 1;
      for (let factor = 2; factor <= value; factor += 1) {
        factorial = finiteResult(factorial * factor);
      }
      value = factorial;
    }
    return value;
  }

  function power() {
    const value = postfix();
    return accept('^') ? finiteResult(value ** unary()) : value;
  }

  function unary() {
    depth += 1;
    if (depth > MAX_PARSE_DEPTH) {
      throw new CalculationError('The expression is too deeply nested.');
    }
    try {
      if (accept('+')) return unary();
      if (accept('-')) return finiteResult(-unary());
      return power();
    } finally {
      depth -= 1;
    }
  }

  function term() {
    let value = unary();
    while (current().type === '*' || current().type === '/') {
      const operator = tokens[position++].type;
      const right = unary();
      if (operator === '/' && right === 0) {
        throw new CalculationError('Cannot divide by zero.');
      }
      value = finiteResult(operator === '*' ? value * right : value / right);
    }
    return value;
  }

  function expression() {
    let value = term();
    while (current().type === '+' || current().type === '-') {
      const operator = tokens[position++].type;
      const right = term();
      value = finiteResult(operator === '+' ? value + right : value - right);
    }
    return value;
  }

  if (current().type === 'end') {
    throw new CalculationError('Enter an expression.');
  }
  const value = expression();
  if (current().type !== 'end') {
    throw new CalculationError('Check the expression. Use an operator between values.');
  }
  return finiteResult(value);
}

let calculatorController = null;

function calculate() {
  if (calculatorController) calculatorController.calculate();
}

function initializeCalculator() {
  const form = document.getElementById('calculator');
  const input = document.getElementById('expression-input');
  const angleMode = document.getElementById('angle-mode');
  const result = document.getElementById('result');
  const summary = document.getElementById('expression');

  function setState(state) {
    form.dataset.state = state;
    result.dataset.state = state;
  }

  function clearValidation() {
    input.removeAttribute('aria-invalid');
    angleMode.removeAttribute('aria-invalid');
  }

  function resetResult() {
    clearValidation();
    result.textContent = 'Ready when you are';
    summary.textContent = 'Your next calculation starts here';
    setState('idle');
  }

  function showError(error) {
    result.textContent = 'Error: ' + error.message;
    summary.textContent = 'Your next calculation starts here';
    input.setAttribute('aria-invalid', 'true');
    setState('error');
  }

  function focusAt(start, end = start) {
    input.focus();
    input.setSelectionRange(start, end);
  }

  function insertAtSelection(text) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const updated = input.value.slice(0, start) + text + input.value.slice(end);
    if (updated.length > MAX_EXPRESSION_LENGTH) {
      showError(new CalculationError('Expressions must be 1024 characters or fewer.'));
      focusAt(start, end);
      return;
    }
    input.value = updated;
    resetResult();
    focusAt(start + text.length);
  }

  calculatorController = {
    calculate() {
      clearValidation();
      try {
        const value = evaluateExpression(input.value, angleMode.value);
        result.textContent = 'Result: ' + value;
        summary.textContent = input.value + ' = ' + value + ' (' + angleMode.value.toUpperCase() + ')';
        setState('success');
      } catch (error) {
        if (!(error instanceof CalculationError)) throw error;
        if (angleMode.value !== 'deg' && angleMode.value !== 'rad') {
          angleMode.setAttribute('aria-invalid', 'true');
        }
        showError(error);
      }
    },
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    calculate();
  });
  for (const key of form.querySelectorAll('[data-insert]')) {
    key.addEventListener('click', () => insertAtSelection(key.dataset.insert));
  }
  document.getElementById('delete').addEventListener('click', () => {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const deleteFrom = start === end ? Math.max(0, start - 1) : start;
    input.value = input.value.slice(0, deleteFrom) + input.value.slice(end);
    resetResult();
    focusAt(deleteFrom);
  });
  document.getElementById('clear').addEventListener('click', () => {
    input.value = '';
    resetResult();
    focusAt(0);
  });
  input.addEventListener('input', resetResult);
  angleMode.addEventListener('change', resetResult);
  resetResult();
}

if (typeof document !== 'undefined') initializeCalculator();
