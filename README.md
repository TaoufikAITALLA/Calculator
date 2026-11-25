# Scientific Calculator

Demo app for the *AI Agents in Action* webinar (GitHub Copilot demo).

Open `calculator.html` in a browser, keeping `calculator.css` and `calculator.js` in the same folder. No installation, build step, or internet connection is required.

Type an expression or use the scientific keypad, then click Calculate or press Enter. The responsive interface includes labeled controls, keyboard focus indicators, and screen-reader announcements for results.

Supported operations include `+`, `-`, `*`, `/`, powers (`^`), factorial (`!`), parentheses, and the constants `pi` and `e`. Functions include `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sqrt`, `ln`, `log` (base 10), `abs`, and `exp`. Select degrees (default) or radians for trigonometry; inverse trigonometric results use the same unit.

| Expression | Result |
| --- | --- |
| `2 + 3 * 4` | `14` |
| `(2 + 3) * 4` | `20` |
| `sqrt(81) + log(100)` | `11` |
| `cos(60)` in degrees | Approximately `0.5` |
| `sin(pi / 2)` in radians | `1` |
| `5!` | `120` |
| `2^3^2` | `512` |
| `-2^2` | `-4` |

Use explicit multiplication (`2*pi`, not `2pi`) and close function parentheses. Scientific notation such as `1e3` is supported. Factorials require integers from 0 to 170. Calculations use standard JavaScript floating-point precision, so decimal results may include rounding artifacts.

Clear resets the expression and returns focus to it without changing the angle unit. Delete removes the selected text or the character before the cursor. Editing an expression or changing the angle unit clears the previous result.

Missing or malformed expressions, division by zero, invalid function domains, and numbers outside the supported finite range display clear error messages. Expressions are limited to 1,024 characters and bounded nesting.

Run the regression tests with Node.js:

```shell
node --test calculator.test.cjs
```
