function finiteNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function tokenizeExpression(expression: string): { values: number[]; operators: string[] } | null {
  const source = expression.replace(/\s+/g, "");
  if (!source) return null;
  const values: number[] = [];
  const operators: string[] = [];
  let index = 0;
  const readNumber = (allowSign: boolean): number | null => {
    const match = source.slice(index).match(allowSign ? /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)/ : /^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (!match) return null;
    index += match[0].length;
    return finiteNumber(match[0]);
  };
  const first = readNumber(true);
  if (first === null) return null;
  values.push(first);
  while (index < source.length) {
    const operator = source[index];
    if (!["+", "-", "*", "/"].includes(operator)) return null;
    index += 1;
    const value = readNumber(operator === "*" || operator === "/");
    if (value === null) return null;
    operators.push(operator);
    values.push(value);
  }
  return { values, operators };
}

function evaluateTokens(values: number[], operators: string[]): number | null {
  const reducedValues = [values[0]];
  const reducedOperators: string[] = [];
  for (let index = 0; index < operators.length; index += 1) {
    const operator = operators[index];
    const value = values[index + 1];
    if (operator === "*" || operator === "/") {
      if (operator === "/" && value === 0) return null;
      const previous = reducedValues.pop() ?? 0;
      reducedValues.push(operator === "*" ? previous * value : previous / value);
    } else {
      reducedOperators.push(operator);
      reducedValues.push(value);
    }
  }
  let result = reducedValues[0];
  for (let index = 0; index < reducedOperators.length; index += 1) {
    result = reducedOperators[index] === "+" ? result + reducedValues[index + 1] : result - reducedValues[index + 1];
  }
  return Number.isFinite(result) ? result : null;
}

export function artInspectorNumberExpressionValue(raw: string, currentValue: unknown): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const currentNumber = finiteNumber(currentValue);
  const expression = /^[+*/]/.test(trimmed)
    ? currentNumber === null
      ? ""
      : `${currentNumber}${trimmed}`
    : trimmed;
  const tokens = tokenizeExpression(expression);
  return tokens ? evaluateTokens(tokens.values, tokens.operators) : null;
}
