// Fast broken-CSV reader: a drop-in for csv-reader 1.0.0's readCsv, byte-identical answers,
// built for CPU time. Same written policy as the reference; fields are cut out of the text
// with slice()/indexOf() scans instead of per-character string building.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** Count the line breaks (each LF, CRLF or lone CR counts 1) in s[0..end). */
function countLines(s, end) {
  let n = 0;
  let i = -1;
  while ((i = s.indexOf('\n', i + 1)) !== -1 && i < end) n++;
  i = -1;
  while ((i = s.indexOf('\r', i + 1)) !== -1 && i < end) {
    if (i + 1 >= end || s.charCodeAt(i + 1) !== 10) n++;
  }
  return n;
}

/** readCsv(input): {columns, rows, errors}, identical to csv-reader 1.0.0. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0;
  let line = 1;
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  let recordLine = 1;
  let recordRow = null;

  let fValue = '';
  let fEnded = END;
  let fAdded = 0;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads an unquoted field from `from`: ends at a comma, a line break or the end of the
  // text; a CR not followed by LF is dropped (stray_cr). `prefix` is prepended.
  function readUnquoted(prefix, from) {
    let end = n;
    let crAt = -1;
    // Find the first terminator among ',', LF, CR.
    let c1 = text.indexOf(',', from);
    if (c1 !== -1 && c1 < end) end = c1;
    let c2 = text.indexOf('\n', from);
    if (c2 !== -1 && c2 < end) end = c2;
    let c3 = text.indexOf('\r', from);
    if (c3 !== -1 && c3 < end) end = c3;
    let i = end;
    if (i < n) {
      const c = text.charCodeAt(i);
      if (c === 44) {
        // comma: no CR can precede it (a CR before a comma in the span would have been the
        // terminator if followed by LF, else it is stray — but a stray CR inside the span
        // must be dropped, so fall back to the careful loop when a CR is in the span).
        if (c3 !== -1 && c3 < i) {
          // careful path
          return readUnquotedSlow(prefix, from, COMMA);
        }
        fValue = prefix === '' && pos === from ? text.slice(from, i) : prefix + text.slice(from, i);
        fEnded = COMMA;
        fAdded = i - from;
        pos = i + 1;
        return;
      }
      if (c === 10) {
        if (c3 !== -1 && c3 < i) return readUnquotedSlow(prefix, from, LINE_BREAK);
        fValue = prefix === '' && pos === from ? text.slice(from, i) : prefix + text.slice(from, i);
        fEnded = LINE_BREAK;
        fAdded = i - from;
        pos = i + 1;
        line += 1;
        return;
      }
      // CR at i: CRLF ends the field, else stray.
      if (i + 1 < n && text.charCodeAt(i + 1) === 10) {
        if (c3 !== -1 && c3 < i) return readUnquotedSlow(prefix, from, LINE_BREAK);
        fValue = prefix === '' && pos === from ? text.slice(from, i) : prefix + text.slice(from, i);
        fEnded = LINE_BREAK;
        fAdded = i - from;
        pos = i + 2;
        line += 1;
        return;
      }
      // lone CR: stray — drop it and keep reading
      return readUnquotedSlow(prefix, from, END);
    }
    // end of text
    if (c3 !== -1 && c3 < i) return readUnquotedSlow(prefix, from, END);
    fValue = prefix === '' && pos === from ? text.slice(from, i) : prefix + text.slice(from, i);
    fEnded = END;
    fAdded = i - from;
    pos = i;
  }

  // The careful loop: reads from `from` handling stray CRs, until a comma, a line break or
  // the end of the text. `wantEnd` is unused; the ending kind is set by the loop.
  function readUnquotedSlow(prefix, from, unused) {
    void unused;
    let i = from;
    let crAt = -1;
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 44) {
        fValue = crAt === -1 ? (prefix === '' && pos === from ? text.slice(from, i) : prefix + text.slice(from, i)) : undefined;
        fEnded = COMMA;
        fAdded = i - from;
        pos = i + 1;
        if (crAt !== -1) finishStray(prefix, from, i);
        return;
      }
      if (c === 10) {
        fValue = crAt === -1 ? (prefix === '' && pos === from ? text.slice(from, i) : prefix + text.slice(from, i)) : undefined;
        fEnded = LINE_BREAK;
        fAdded = i - from;
        pos = i + 1;
        line += 1;
        if (crAt !== -1) finishStray(prefix, from, i);
        return;
      }
      if (c === 13) {
        if (i + 1 < n && text.charCodeAt(i + 1) === 10) {
          fValue = crAt === -1 ? (prefix === '' && pos === from ? text.slice(from, i) : prefix + text.slice(from, i)) : undefined;
          fEnded = LINE_BREAK;
          fAdded = i - from;
          pos = i + 2;
          line += 1;
          if (crAt !== -1) finishStray(prefix, from, i);
          return;
        }
        error('stray_cr');
        if (crAt === -1) crAt = i;
        i += 1;
        continue;
      }
      i += 1;
    }
    fValue = crAt === -1 ? (prefix === '' && pos === from ? text.slice(from, i) : prefix + text.slice(from, i)) : undefined;
    fEnded = END;
    fAdded = i - from;
    pos = i;
    if (crAt !== -1) finishStray(prefix, from, i);
  }

  // A stray CR was met: the value is every character but the stray CRs themselves.
  function finishStray(prefix, from, end) {
    let out = prefix;
    let seg = from;
    let i = from;
    let dropped = 0;
    while (i < end) {
      if (text.charCodeAt(i) === 13 && !(i + 1 < n && text.charCodeAt(i + 1) === 10)) {
        if (seg < i) out += text.slice(seg, i);
        dropped += 1;
        i += 1;
        seg = i;
      } else {
        i += 1;
      }
    }
    if (seg < end) out += text.slice(seg, end);
    fValue = out;
    fAdded -= dropped;
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let i = pos + 1;
    let closePos = -1;
    while (true) {
      const q = text.indexOf('"', i);
      if (q === -1) break; // unterminated
      if (q + 1 < n && text.charCodeAt(q + 1) === 34) {
        i = q + 2;
        continue;
      }
      closePos = q;
      break;
    }
    if (closePos === -1) {
      pos = open + 1;
      line = openLine;
      error('unterminated_quote');
      readUnquoted('"', open + 1);
      return;
    }
    const raw = text.slice(pos + 1, closePos);
    const hasCR = raw.indexOf('\r') !== -1;
    let value;
    if (hasCR) {
      value = raw.replace(/\r\n?/g, '\n');
      if (value.indexOf('""') !== -1) value = value.replaceAll('""', '"');
    } else if (raw.indexOf('""') !== -1) {
      value = raw.replaceAll('""', '"');
    } else {
      value = raw;
    }
    if (hasCR) {
      line += countLines(raw, raw.length);
    } else {
      let nl = 0;
      let j = -1;
      while ((j = raw.indexOf('\n', j + 1)) !== -1) nl++;
      line += nl;
    }
    pos = closePos + 1;
    if (pos >= n) {
      fValue = value;
      fEnded = END;
      fAdded = 0;
      return;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fValue = value;
      fEnded = COMMA;
      fAdded = 0;
      return;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fValue = value;
      fEnded = LINE_BREAK;
      fAdded = 0;
      return;
    }
    if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fValue = value;
      fEnded = LINE_BREAK;
      fAdded = 0;
      return;
    }
    readUnquoted(value, pos);
    if (fAdded > 0) error('quote_junk');
    return;
  }

  while (true) {
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) {
        readQuoted();
      } else {
        readUnquoted('', pos);
      }
      fields.push(fValue);
    } while (fEnded === COMMA);

    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
