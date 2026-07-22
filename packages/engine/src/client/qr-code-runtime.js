"use strict";

const VERSION = 5;
const SIZE = VERSION * 4 + 17;
const DATA_CODEWORDS = 108;
const ERROR_CODEWORDS = 26;
const MASK_PATTERN = 0;
const FORMAT_ERROR_CORRECTION_LOW = 1;
const FORMAT_MASK = 0x5412;
const FORMAT_GENERATOR = 0x537;
const FIELD_POLY = 0x11d;
const ALIGNMENT_CENTERS = [6, 30];

let fieldTables = null;
let errorGenerator = null;

function makeFieldTables() {
  const exp = new Array(512).fill(0);
  const log = new Array(256).fill(0);
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    exp[index] = value;
    log[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= FIELD_POLY;
  }
  for (let index = 255; index < exp.length; index += 1) exp[index] = exp[index - 255];
  return { exp, log };
}

function tables() {
  if (!fieldTables) fieldTables = makeFieldTables();
  return fieldTables;
}

function multiplyField(left, right) {
  if (!left || !right) return 0;
  const { exp, log } = tables();
  return exp[log[left] + log[right]];
}

function generatorPolynomial(degree) {
  let result = [1];
  for (let index = 0; index < degree; index += 1) {
    const next = new Array(result.length + 1).fill(0);
    const root = tables().exp[index];
    for (let term = 0; term < result.length; term += 1) {
      next[term] ^= result[term];
      next[term + 1] ^= multiplyField(result[term], root);
    }
    result = next;
  }
  return result;
}

function errorCorrectionGenerator() {
  if (!errorGenerator) errorGenerator = generatorPolynomial(ERROR_CODEWORDS);
  return errorGenerator;
}

function errorCorrectionCodewords(data) {
  const generator = errorCorrectionGenerator();
  const result = new Array(ERROR_CODEWORDS).fill(0);
  for (const codeword of data) {
    const factor = codeword ^ result.shift();
    result.push(0);
    for (let index = 0; index < ERROR_CODEWORDS; index += 1) {
      result[index] ^= multiplyField(generator[index + 1], factor);
    }
  }
  return result;
}

function appendBits(bits, value, length) {
  for (let shift = length - 1; shift >= 0; shift -= 1) bits.push(Boolean((value >>> shift) & 1));
}

function dataCodewordsForText(text) {
  const bytes = Array.from(new TextEncoder().encode(text));
  if (bytes.length > 106) throw new Error("QR code text is too long");
  const bits = [];
  appendBits(bits, 0x4, 4);
  appendBits(bits, bytes.length, 8);
  for (const byte of bytes) appendBits(bits, byte, 8);
  const maxBits = DATA_CODEWORDS * 8;
  appendBits(bits, 0, Math.min(4, maxBits - bits.length));
  while (bits.length % 8) bits.push(false);
  const codewords = [];
  for (let index = 0; index < bits.length; index += 8) {
    let codeword = 0;
    for (let offset = 0; offset < 8; offset += 1) {
      codeword = (codeword << 1) | (bits[index + offset] ? 1 : 0);
    }
    codewords.push(codeword);
  }
  const pads = [0xec, 0x11];
  while (codewords.length < DATA_CODEWORDS) codewords.push(pads[codewords.length % 2]);
  return codewords;
}

function makeMatrix() {
  return {
    modules: Array.from({ length: SIZE }, () => new Array(SIZE).fill(false)),
    reserved: Array.from({ length: SIZE }, () => new Array(SIZE).fill(false))
  };
}

function inBounds(row, column) {
  return row >= 0 && row < SIZE && column >= 0 && column < SIZE;
}

function setFunction(matrix, row, column, dark) {
  if (!inBounds(row, column)) return;
  matrix.modules[row][column] = Boolean(dark);
  matrix.reserved[row][column] = true;
}

function drawFinder(matrix, top, left) {
  for (let row = -1; row <= 7; row += 1) {
    for (let column = -1; column <= 7; column += 1) {
      const targetRow = top + row;
      const targetColumn = left + column;
      if (!inBounds(targetRow, targetColumn)) continue;
      const inPattern = row >= 0 && row <= 6 && column >= 0 && column <= 6;
      const dark = inPattern &&
        (row === 0 || row === 6 || column === 0 || column === 6 || (row >= 2 && row <= 4 && column >= 2 && column <= 4));
      setFunction(matrix, targetRow, targetColumn, dark);
    }
  }
}

function drawAlignment(matrix, centerRow, centerColumn) {
  for (let row = -2; row <= 2; row += 1) {
    for (let column = -2; column <= 2; column += 1) {
      setFunction(matrix, centerRow + row, centerColumn + column, Math.max(Math.abs(row), Math.abs(column)) !== 1);
    }
  }
}

function formatBits() {
  const data = (FORMAT_ERROR_CORRECTION_LOW << 3) | MASK_PATTERN;
  let remainder = data << 10;
  for (let index = 14; index >= 10; index -= 1) {
    if ((remainder >>> index) & 1) remainder ^= FORMAT_GENERATOR << (index - 10);
  }
  return ((data << 10) | remainder) ^ FORMAT_MASK;
}

function bit(value, index) {
  return Boolean((value >>> index) & 1);
}

function drawFormatBits(matrix) {
  const bits = formatBits();
  for (let index = 0; index <= 5; index += 1) setFunction(matrix, index, 8, bit(bits, index));
  setFunction(matrix, 7, 8, bit(bits, 6));
  setFunction(matrix, 8, 8, bit(bits, 7));
  setFunction(matrix, 8, 7, bit(bits, 8));
  for (let index = 9; index < 15; index += 1) setFunction(matrix, 8, 14 - index, bit(bits, index));
  for (let index = 0; index < 8; index += 1) setFunction(matrix, 8, SIZE - 1 - index, bit(bits, index));
  for (let index = 8; index < 15; index += 1) setFunction(matrix, SIZE - 15 + index, 8, bit(bits, index));
}

function drawFunctionPatterns(matrix) {
  drawFinder(matrix, 0, 0);
  drawFinder(matrix, 0, SIZE - 7);
  drawFinder(matrix, SIZE - 7, 0);
  for (let index = 8; index < SIZE - 8; index += 1) {
    const dark = index % 2 === 0;
    setFunction(matrix, 6, index, dark);
    setFunction(matrix, index, 6, dark);
  }
  for (const row of ALIGNMENT_CENTERS) {
    for (const column of ALIGNMENT_CENTERS) {
      const overlapsFinder = (row === 6 && (column === 6 || column === SIZE - 7)) || (column === 6 && row === SIZE - 7);
      if (!overlapsFinder) drawAlignment(matrix, row, column);
    }
  }
  setFunction(matrix, SIZE - 8, 8, true);
  drawFormatBits(matrix);
}

function mask(row, column) {
  return (row + column) % 2 === 0;
}

function placeData(matrix, codewords) {
  const bits = [];
  for (const codeword of codewords) appendBits(bits, codeword, 8);
  let bitIndex = 0;
  let upward = true;
  for (let column = SIZE - 1; column > 0; column -= 2) {
    if (column === 6) column -= 1;
    for (let rowIndex = 0; rowIndex < SIZE; rowIndex += 1) {
      const row = upward ? SIZE - 1 - rowIndex : rowIndex;
      for (let offset = 0; offset < 2; offset += 1) {
        const currentColumn = column - offset;
        if (matrix.reserved[row][currentColumn]) continue;
        const rawBit = bitIndex < bits.length ? bits[bitIndex] : false;
        matrix.modules[row][currentColumn] = mask(row, currentColumn) ? !rawBit : rawBit;
        bitIndex += 1;
      }
    }
    upward = !upward;
  }
}

function matrixForText(text) {
  const data = dataCodewordsForText(String(text));
  const matrix = makeMatrix();
  drawFunctionPatterns(matrix);
  placeData(matrix, [...data, ...errorCorrectionCodewords(data)]);
  return matrix.modules;
}

function renderCanvas(canvas, text, options = {}) {
  const modules = matrixForText(text);
  const quietZone = Number(options.quietZone || 4);
  const moduleCount = modules.length + quietZone * 2;
  const pixelSize = Number(options.size || canvas.clientWidth || 220);
  const scale = Math.max(1, Math.floor(pixelSize / moduleCount));
  canvas.width = moduleCount * scale;
  canvas.height = moduleCount * scale;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = options.background || "#fff8d6";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = options.foreground || "#17131f";
  for (let row = 0; row < modules.length; row += 1) {
    for (let column = 0; column < modules.length; column += 1) {
      if (modules[row][column]) context.fillRect((column + quietZone) * scale, (row + quietZone) * scale, scale, scale);
    }
  }
  canvas.dataset.qrText = String(text);
}

const PartyGameQrCode = Object.freeze({ matrixForText, renderCanvas });

module.exports = Object.freeze({ PartyGameQrCode, matrixForText, renderCanvas });
