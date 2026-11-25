const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, 'calculator.js'), 'utf8');
const evaluatorContext = vm.createContext({});
vm.runInContext(script, evaluatorContext, { filename: 'calculator.js' });
const evaluate = evaluatorContext.evaluateExpression;
const idleResult = 'Ready when you are';
const idleExpression = 'Your next calculation starts here';

function closeTo(actual, expected) {
  assert.ok(Math.abs(actual - expected) <= 1e-12 * Math.max(1, Math.abs(expected)),
    `${actual} should be close to ${expected}`);
}

for (const [source, expected] of [
  ['2+3*4', 14],
  ['(2+3)*4', 20],
  ['10-3-2', 5],
  ['24/3/2', 4],
  ['-2^2', -4],
  ['(-2)^2', 4],
  ['2^-2', 0.25],
  ['2^3^2', 512],
  ['2^-2^2', 0.0625],
  ['--2 + +-3', -1],
  ['  .5 + 2. + 1.25 ', 3.75],
  ['2e3+2E-3+1e+1', 2010.002],
  ['0!', 1],
  ['5!', 120],
  ['3!!', 720],
  ['-3!', -6],
  ['2^3!', 64],
  ['3!^2', 36],
  ['(2+3)!', 120],
  ['2 × (3 − 1) ÷ 4', 1],
  ['abs(-3)+sqrt(16)+log(100)+ln(exp(2))', 11],
]) {
  test(`evaluates ${source}`, () => assert.equal(evaluate(source), expected));
}

test('preserves ordinary floating-point values, signed zero, and small nonzero results', () => {
  assert.equal(evaluate('0.1+0.2'), 0.1 + 0.2);
  assert.ok(Object.is(evaluate('0/-2'), -0));
  assert.equal(evaluate('1e-300'), 1e-300);
  assert.notEqual(evaluate('sin(pi)', 'rad'), 0);
  assert.equal(evaluate('170!'), 7.257415615307994e306);
  assert.equal(evaluate('2*e'), 2 * Math.E);
  assert.equal(evaluate('π'), Math.PI);
});

for (const [source, mode, expected] of [
  ['sin(30)', 'deg', 0.5],
  ['cos(180)', 'deg', -1],
  ['tan(45)', 'deg', 1],
  ['sin(pi/2)', 'rad', 1],
  ['cos(pi)', 'rad', -1],
  ['tan(pi/4)', 'rad', 1],
  ['asin(0.5)', 'deg', 30],
  ['acos(-1)', 'deg', 180],
  ['atan(1)', 'deg', 45],
  ['asin(1)', 'rad', Math.PI / 2],
  ['acos(0)', 'rad', Math.PI / 2],
  ['atan(1)', 'rad', Math.PI / 4],
  ['sqrt(abs(-9))', 'deg', 3],
  ['ln(e)', 'deg', 1],
  ['log(1000)', 'deg', 3],
  ['exp(1)', 'deg', Math.E],
]) {
  test(`evaluates ${source} in ${mode}`, () => closeTo(evaluate(source, mode), expected));
}

test('defaults to degrees without silently accepting an invalid mode', () => {
  closeTo(evaluate('sin(30)'), 0.5);
  for (const mode of ['DEG', '', 'grads', null, 0]) {
    assert.throws(() => evaluate('1', mode), /Select a valid angle mode/);
  }
});

for (const source of [
  '', ' \t ', '.', '2+', '*2', '()', '(2', '2)', '2 3', '2pi', '2(3)',
  '(2)(3)', 'sin 30', 'sin()', 'sin(1,2)', 'sin(1)2', 'unknown(2)',
  'Infinity', 'NaN', '2e', '2e+', '2e-', '1e2e3', '2..3', '1.2.3',
  '0x10', '2**3', '2//3', '2^^3', 'pi(2)', 'Math.sin(2)', '<script>',
]) {
  test(`rejects malformed expression ${JSON.stringify(source)}`, () => {
    assert.throws(() => evaluate(source), { name: 'Error' });
  });
}

for (const source of ['1/0', '1/-0', '0/0', '1/(2-2)', '1/(0*-1)']) {
  test(`rejects exact zero divisor in ${source}`, () => {
    assert.throws(() => evaluate(source), /^Error: Cannot divide by zero\.$/);
  });
}

for (const [source, message] of [
  ['sqrt(-1)', /Square root requires/],
  ['ln(0)', /Logarithms require/],
  ['ln(-1)', /Logarithms require/],
  ['log(0)', /Logarithms require/],
  ['log(-1)', /Logarithms require/],
  ['asin(1.01)', /Inverse sine and cosine require/],
  ['acos(-1.01)', /Inverse sine and cosine require/],
  ['(-1)!', /Factorial requires/],
  ['0.5!', /Factorial requires/],
  ['171!', /Factorial requires/],
  ['(-2)^0.5', /undefined/],
  ['0^-1', /outside the supported numeric range/],
  ['1e309', /outside the supported numeric range/],
  ['1e308+1e308', /outside the supported numeric range/],
  ['-1e308-1e308', /outside the supported numeric range/],
  ['1e308*2', /outside the supported numeric range/],
  ['1e308/1e-308', /outside the supported numeric range/],
  ['10^309', /outside the supported numeric range/],
  ['exp(1000)', /outside the supported numeric range/],
  ['(1e308*2)*0', /outside the supported numeric range/],
  ['1e309-1e309', /outside the supported numeric range/],
  ['1/(1e308*2)', /outside the supported numeric range/],
]) {
  test(`rejects domain or overflow in ${source}`, () => {
    assert.throws(() => evaluate(source), message);
  });
}

for (const [source, mode] of [
  ['tan(90)', 'deg'], ['tan(-90)', 'deg'], ['tan(270)', 'deg'],
  ['tan(450)', 'deg'], ['tan(pi/2)', 'rad'], ['tan(-pi/2)', 'rad'],
  ['tan(3*pi/2)', 'rad'],
]) {
  test(`rejects tangent pole ${source} in ${mode}`, () => {
    assert.throws(() => evaluate(source, mode), /Tangent is undefined/);
  });
}

test('allows finite values close to, but not at, a tangent pole', () => {
  assert.ok(Number.isFinite(evaluate('tan(89.999999)')));
  assert.ok(Number.isFinite(evaluate('tan(pi/2-1e-8)', 'rad')));
  assert.ok(Number.isFinite(evaluate('sin(1e308)')));
});

test('bounds source length and recursion without rejecting flat expressions', () => {
  assert.equal(evaluate('1' + ' '.repeat(1023)), 1);
  assert.throws(() => evaluate('1' + ' '.repeat(1024)), /1024 characters/);
  assert.throws(() => evaluate('('.repeat(160) + '1' + ')'.repeat(160)), /too deeply nested/);
  assert.throws(() => evaluate('-'.repeat(160) + '1'), /too deeply nested/);
  assert.throws(() => evaluate('1^'.repeat(160) + '1'), /too deeply nested/);
  assert.throws(() => evaluate('sin('.repeat(160) + '0' + ')'.repeat(160)), /too deeply nested/);
  assert.equal(evaluate('1+'.repeat(500) + '1'), 501);
  assert.equal(evaluate('('.repeat(20) + '1' + ')'.repeat(20)), 1);
});

function createCalculator() {
  const document = { activeElement: null };
  const elements = {};

  function element(id, value = '') {
    const listeners = new Map();
    const attributes = new Map();
    const node = {
      value,
      textContent: '',
      dataset: {},
      selectionStart: 0,
      selectionEnd: 0,
      addEventListener(type, listener) {
        const registered = listeners.get(type) || [];
        registered.push(listener);
        listeners.set(type, registered);
      },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      removeAttribute(name) { attributes.delete(name); },
      getAttribute(name) { return attributes.get(name) ?? null; },
      focus() { document.activeElement = node; },
      setSelectionRange(start, end) {
        node.selectionStart = start;
        node.selectionEnd = end;
      },
      dispatch(type, event = {}) {
        event.target = node;
        event.currentTarget = node;
        for (const listener of listeners.get(type) || []) listener.call(node, event);
      },
    };
    elements[id] = node;
    return node;
  }

  const form = element('calculator');
  element('expression-input');
  element('angle-mode', 'deg');
  element('result');
  element('expression');
  element('clear');
  element('delete');
  const keys = ['sin(', 'pi', '*', '^2', '!', '7', ')'].map((token, index) => {
    const key = element(`key-${index}`);
    key.dataset.insert = token;
    return key;
  });
  form.querySelectorAll = (selector) => {
    assert.equal(selector, '[data-insert]');
    return keys;
  };
  document.getElementById = (id) => elements[id] ?? null;

  const context = vm.createContext({ document });
  vm.runInContext(script, context, { filename: 'calculator.js' });

  return {
    elements,
    document,
    context,
    input: elements['expression-input'],
    mode: elements['angle-mode'],
    calculate(source, mode = 'deg') {
      elements['expression-input'].value = source;
      elements['angle-mode'].value = mode;
      context.calculate();
    },
    insert(token) {
      const key = keys.find((candidate) => candidate.dataset.insert === token);
      assert.ok(key, `Missing test key ${token}`);
      // Text selections remain available after a native button takes focus.
      key.focus();
      key.dispatch('click');
    },
  };
}

function assertState(app, state, message) {
  assert.equal(app.elements.result.textContent, message);
  assert.equal(app.elements.result.dataset.state, state);
  assert.equal(app.elements.calculator.dataset.state, state);
}

test('initializes the idle view and exposes a normal-script calculate entry point', () => {
  const app = createCalculator();
  assert.equal(typeof app.context.evaluateExpression, 'function');
  assert.equal(typeof app.context.calculate, 'function');
  assertState(app, 'idle', idleResult);
  assert.equal(app.elements.expression.textContent, idleExpression);
  assert.equal(app.input.getAttribute('aria-invalid'), null);
});

test('submitting prevents navigation and shows the original expression with units', () => {
  const app = createCalculator();
  app.input.value = '  sin(30) * 2 ';
  let prevented = false;
  app.elements.calculator.dispatch('submit', { preventDefault() { prevented = true; } });
  assert.ok(prevented);
  assertState(app, 'success', 'Result: 0.9999999999999999');
  assert.equal(app.elements.expression.textContent,
    '  sin(30) * 2  = 0.9999999999999999 (DEG)');
  app.calculate('cos(pi)', 'rad');
  assertState(app, 'success', 'Result: -1');
  assert.equal(app.elements.expression.textContent, 'cos(pi) = -1 (RAD)');
});

test('shows exact division errors and clears validation on a later successful calculation', () => {
  const app = createCalculator();
  app.calculate('1/-0');
  assertState(app, 'error', 'Error: Cannot divide by zero.');
  assert.equal(app.input.getAttribute('aria-invalid'), 'true');
  assert.equal(app.elements.expression.textContent, idleExpression);
  app.calculate('6*7');
  assertState(app, 'success', 'Result: 42');
  assert.equal(app.input.getAttribute('aria-invalid'), null);
});

test('rejects invalid modes rather than falling back to degrees', () => {
  const app = createCalculator();
  app.calculate('sin(30)', 'invalid');
  assertState(app, 'error', 'Error: Select a valid angle mode (DEG or RAD).');
  assert.equal(app.mode.getAttribute('aria-invalid'), 'true');
  assert.equal(app.input.getAttribute('aria-invalid'), 'true');
  app.mode.value = 'rad';
  app.mode.dispatch('change');
  assert.equal(app.mode.getAttribute('aria-invalid'), null);
  assert.equal(app.input.getAttribute('aria-invalid'), null);
  assertState(app, 'idle', idleResult);
});

for (const source of ['1/0', '6*7']) {
  test(`clearing ${source} preserves the angle mode and restores focus and caret`, () => {
    const app = createCalculator();
    app.calculate(source, 'rad');
    app.elements.clear.dispatch('click');
    assert.equal(app.input.value, '');
    assert.equal(app.mode.value, 'rad');
    assertState(app, 'idle', idleResult);
    assert.equal(app.elements.expression.textContent, idleExpression);
    assert.equal(app.input.getAttribute('aria-invalid'), null);
    assert.equal(app.document.activeElement, app.input);
    assert.equal(app.input.selectionStart, 0);
    assert.equal(app.input.selectionEnd, 0);
  });
}

for (const event of ['input', 'change']) {
  for (const source of ['1/0', '6*7']) {
    test(`${event} invalidates the stale view for ${source}`, () => {
      const app = createCalculator();
      app.calculate(source);
      if (event === 'input') {
        app.input.value = '2+2';
        app.input.dispatch(event);
      } else {
        app.mode.value = 'rad';
        app.mode.dispatch(event);
      }
      assertState(app, 'idle', idleResult);
      assert.equal(app.elements.expression.textContent, idleExpression);
      assert.equal(app.input.getAttribute('aria-invalid'), null);
    });
  }
}

test('keypad inserts and replaces at the selection after button focus', () => {
  const app = createCalculator();
  app.calculate('12+34');
  app.input.setSelectionRange(3, 5);
  app.insert('sin(');
  assert.equal(app.input.value, '12+sin(');
  assert.equal(app.input.selectionStart, 7);
  assert.equal(app.input.selectionEnd, 7);
  assert.equal(app.document.activeElement, app.input);
  assertState(app, 'idle', idleResult);
  app.input.setSelectionRange(0, 0);
  app.insert('pi');
  assert.equal(app.input.value, 'pi12+sin(');
  assert.equal(app.input.selectionStart, 2);
  app.input.setSelectionRange(2, 2);
  app.insert('*');
  assert.equal(app.input.value, 'pi*12+sin(');
  app.input.value = '3';
  app.input.setSelectionRange(1, 1);
  app.insert('^2');
  app.insert('!');
  app.context.calculate();
  assertState(app, 'success', 'Result: 9');
});

test('keypad insertion clears existing validation errors', () => {
  const app = createCalculator();
  app.calculate('1/0');
  app.input.setSelectionRange(2, 3);
  app.insert('7');
  assert.equal(app.input.value, '1/7');
  assert.equal(app.input.getAttribute('aria-invalid'), null);
  assertState(app, 'idle', idleResult);
});

test('keypad length failures are explicit and preserve the original value and selection', () => {
  const app = createCalculator();
  const source = '1'.repeat(1023);
  app.input.value = source;
  app.input.setSelectionRange(20, 20);
  app.insert('sin(');
  assert.equal(app.input.value, source);
  assertState(app, 'error', 'Error: Expressions must be 1024 characters or fewer.');
  assert.equal(app.input.getAttribute('aria-invalid'), 'true');
  assert.equal(app.input.selectionStart, 20);
  assert.equal(app.input.selectionEnd, 20);
  assert.equal(app.document.activeElement, app.input);
  app.input.setSelectionRange(0, 4);
  app.insert('sin(');
  assert.equal(app.input.value.length, 1023);
  assertState(app, 'idle', idleResult);
  app.input.setSelectionRange(1023, 1023);
  app.insert(')');
  assert.equal(app.input.value.length, 1024);
  app.insert('!');
  assert.equal(app.input.value.length, 1024);
  assertState(app, 'error', 'Error: Expressions must be 1024 characters or fewer.');
});

for (const [start, end, expected, caret] of [
  [2, 4, '12', 2],
  [3, 3, '124', 2],
  [0, 0, '1234', 0],
  [0, 4, '', 0],
]) {
  test(`delete handles selection ${start}..${end}`, () => {
    const app = createCalculator();
    app.calculate('1/0', 'rad');
    app.input.value = '1234';
    app.input.setSelectionRange(start, end);
    app.elements.delete.dispatch('click');
    assert.equal(app.input.value, expected);
    assert.equal(app.input.selectionStart, caret);
    assert.equal(app.input.selectionEnd, caret);
    assert.equal(app.document.activeElement, app.input);
    assert.equal(app.mode.value, 'rad');
    assert.equal(app.input.getAttribute('aria-invalid'), null);
    assertState(app, 'idle', idleResult);
  });
}

test('only expected calculation errors are converted to friendly UI messages', () => {
  const app = createCalculator();
  vm.runInContext('evaluateExpression = () => { throw new TypeError("programming fault"); };',
    app.context);
  assert.throws(() => app.calculate('2+2'), /programming fault/);
  assertState(app, 'idle', idleResult);
});
