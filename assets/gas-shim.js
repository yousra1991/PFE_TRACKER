/*
 * Google Apps Script simulator.
 * Runs backend/Code.gs UNCHANGED, with an in-memory spreadsheet, so that:
 *   - the website can offer a demo that works without any server (data stays in the visitor's browser);
 *   - the backend can be tested automatically.
 * Each request runs in a fresh scope, like a real Apps Script execution.
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------ SHA-256 / HMAC (synchronous)
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
    0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
    0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];

  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(s));
    var out = [], str = unescape(encodeURIComponent(s));
    for (var i = 0; i < str.length; i++) out.push(str.charCodeAt(i));
    return out;
  }

  function sha256(bytes) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var l = bytes.length, msg = bytes.slice();
    msg.push(0x80);
    while (msg.length % 64 !== 56) msg.push(0);
    var bits = l * 8;
    for (var s = 7; s >= 0; s--) msg.push(s >= 4 ? 0 : (bits >>> (s * 8)) & 0xff);
    var w = new Array(64);
    for (var off = 0; off < msg.length; off += 64) {
      for (var i = 0; i < 16; i++) w[i] = (msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16) | (msg[off + i * 4 + 2] << 8) | msg[off + i * 4 + 3];
      for (i = 16; i < 64; i++) {
        var x = w[i - 15], y = w[i - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[i] + w[i]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var mj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + mj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = [];
    H.forEach(function (v) { out.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff); });
    return out;
  }

  function hmacSha256(keyBytes, msgBytes) {
    if (keyBytes.length > 64) keyBytes = sha256(keyBytes);
    var k = keyBytes.slice();
    while (k.length < 64) k.push(0);
    var ipad = k.map(function (b) { return b ^ 0x36; }), opad = k.map(function (b) { return b ^ 0x5c; });
    return sha256(opad.concat(sha256(ipad.concat(msgBytes))));
  }

  function signed(bytes) { return bytes.map(function (b) { return b > 127 ? b - 256 : b; }); }
  function toBytes(v) { return typeof v === 'string' ? utf8(v) : v.map(function (b) { return (b + 256) % 256; }); }

  function uuid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    var b = [];
    if (root.crypto && root.crypto.getRandomValues) b = Array.from(root.crypto.getRandomValues(new Uint8Array(16)));
    else for (var i = 0; i < 16; i++) b.push(Math.floor(Math.random() * 256));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = b.map(function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  // ------------------------------------------------------------ dates
  function formatDate(date, tz, pattern) {
    var parts = {};
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      second: '2-digit', hourCycle: 'h23'
    }).formatToParts(date).forEach(function (p) { parts[p.type] = p.value; });
    if (parts.hour === '24') parts.hour = '00';
    return pattern.replace('yyyy', parts.year).replace('MM', parts.month).replace('dd', parts.day)
      .replace('HH', parts.hour).replace('mm', parts.minute).replace('ss', parts.second);
  }

  function makeDate(nowFn) {
    var RealDate = Date;
    function FakeDate() {
      var a = Array.prototype.slice.call(arguments);
      if (!(this instanceof FakeDate)) return new RealDate(nowFn()).toString();
      if (!a.length) return new RealDate(nowFn());
      return new (Function.prototype.bind.apply(RealDate, [null].concat(a)))();
    }
    FakeDate.now = function () { return nowFn(); };
    FakeDate.UTC = RealDate.UTC;
    FakeDate.parse = RealDate.parse;
    FakeDate.prototype = RealDate.prototype;
    return FakeDate;
  }

  // ------------------------------------------------------------ spreadsheet
  function emptyStore() {
    return { id: 'sim-' + uuid().slice(0, 8), tz: 'Africa/Algiers', sheets: {}, order: [], props: {}, cache: {}, outbox: [] };
  }

  function createRuntime(code, opts) {
    opts = opts || {};
    var store = opts.store || emptyStore();
    if (!store.cache) store.cache = {};
    if (!store.outbox) store.outbox = [];
    var nowFn = opts.now || function () { return Date.now(); };
    var FakeDate = makeDate(nowFn);
    var stats = { reads: 0, writes: 0 };

    function sheetData(name) { return store.sheets[name]; }

    function Range(sheet, row, col, nr, nc) {
      var d = sheetData(sheet.name);
      if (typeof row !== 'number' || row < 1 || col < 1 || nr < 1 || nc < 1 || row % 1 || col % 1 || nr % 1 || nc % 1) {
        throw new Error('Invalid range ' + [row, col, nr, nc].join(',') + ' on ' + sheet.name);
      }
      if (row + nr - 1 > d.maxRows || col + nc - 1 > d.maxCols) {
        throw new Error('Range ' + [row, col, nr, nc].join(',') + ' is outside the sheet ' + sheet.name + ' (' + d.maxRows + 'x' + d.maxCols + ')');
      }
      this.s = sheet; this.r = row; this.c = col; this.nr = nr; this.nc = nc; this.text = false;
    }
    Range.prototype.getRow = function () { return this.r; };
    Range.prototype.getColumn = function () { return this.c; };
    Range.prototype.getNumRows = function () { return this.nr; };
    Range.prototype.getNumColumns = function () { return this.nc; };
    Range.prototype.getValues = function () {
      stats.reads++;
      var d = sheetData(this.s.name), out = [];
      for (var i = 0; i < this.nr; i++) {
        var src = d.rows[this.r - 1 + i] || [], row = [];
        for (var j = 0; j < this.nc; j++) {
          var v = src[this.c - 1 + j];
          if (v && typeof v === 'object' && v.formula) v = '#FORMULA:' + v.formula;
          else if (v && typeof v === 'object' && v.date) v = new Date(v.date);
          row.push(v === undefined || v === null ? '' : v);
        }
        out.push(row);
      }
      return out;
    };
    Range.prototype.getValue = function () { return this.getValues()[0][0]; };
    Range.prototype.setValues = function (vals) {
      stats.writes++;
      if (!Array.isArray(vals) || vals.length !== this.nr) throw new Error('The number of rows in the data (' + (vals && vals.length) + ') does not match the number of rows in the range (' + this.nr + ').');
      var d = sheetData(this.s.name), text = this.text;
      for (var i = 0; i < this.nr; i++) {
        if (!Array.isArray(vals[i]) || vals[i].length !== this.nc) throw new Error('The number of columns in the data (' + (vals[i] && vals[i].length) + ') does not match the number of columns in the range (' + this.nc + ').');
        var ri = this.r - 1 + i;
        while (d.rows.length <= ri) d.rows.push([]);
        for (var j = 0; j < this.nc; j++) d.rows[ri][this.c - 1 + j] = coerce(vals[i][j], text);
      }
      return this;
    };
    Range.prototype.setValue = function (v) { this.nr = 1; this.nc = 1; return this.setValues([[v]]); };
    // like a real sheet: '=' starts a formula; without the plain-text format, numbers, booleans and dates are converted
    function coerce(v, text) {
      if (v instanceof Date) return { date: v.getTime() };
      if (typeof v !== 'string') return v;
      if (v.charAt(0) === '=') return { formula: v.slice(1) };
      if (v.charAt(0) === "'") return v.slice(1);
      if (text) return v;
      if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
      if (/^(true|false)$/i.test(v)) return /^true$/i.test(v);
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return { date: Date.UTC(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)) };
      return v;
    }
    Range.prototype.setNumberFormat = function (f) { this.text = f === '@'; return this; };
    ['setFontWeight', 'setBackground', 'setFontColor', 'setWrap', 'setHorizontalAlignment', 'setVerticalAlignment', 'setFontSize']
      .forEach(function (m) { Range.prototype[m] = function () { return this; }; });
    Range.prototype.clearContent = function () {
      var d = sheetData(this.s.name);
      for (var i = 0; i < this.nr; i++) {
        var row = d.rows[this.r - 1 + i];
        if (!row) continue;
        for (var j = 0; j < this.nc; j++) row[this.c - 1 + j] = '';
      }
      return this;
    };
    Range.prototype.createTextFinder = function (text) {
      var rng = this, entire = false, mcase = false;
      var finder = {
        matchEntireCell: function (b) { entire = !!b; return finder; },
        matchCase: function (b) { mcase = !!b; return finder; },
        useRegularExpression: function () { return finder; },
        findAll: function () {
          var vals = rng.getValues(), out = [], q = mcase ? text : String(text).toLowerCase();
          for (var i = 0; i < vals.length; i++) for (var j = 0; j < vals[i].length; j++) {
            var v = vals[i][j] instanceof Date ? vals[i][j].toISOString() : String(vals[i][j]);
            if (!mcase) v = v.toLowerCase();
            if (entire ? v === q : v.indexOf(q) >= 0) out.push(new Range(rng.s, rng.r + i, rng.c + j, 1, 1));
          }
          return out;
        },
        findNext: function () { var a = finder.findAll(); return a.length ? a[0] : null; }
      };
      return finder;
    };

    function Sheet(name) { this.name = name; }
    Sheet.prototype.getName = function () { return this.name; };
    Sheet.prototype.getLastRow = function () {
      var rows = sheetData(this.name).rows;
      for (var i = rows.length - 1; i >= 0; i--) {
        var r = rows[i] || [];
        for (var j = 0; j < r.length; j++) if (r[j] !== '' && r[j] !== undefined && r[j] !== null) return i + 1;
      }
      return 0;
    };
    Sheet.prototype.getLastColumn = function () {
      var rows = sheetData(this.name).rows, m = 0;
      rows.forEach(function (r) { for (var j = (r || []).length - 1; j >= 0; j--) if (r[j] !== '' && r[j] !== undefined && r[j] !== null) { m = Math.max(m, j + 1); break; } });
      return m;
    };
    Sheet.prototype.getMaxRows = function () { return sheetData(this.name).maxRows; };
    Sheet.prototype.getMaxColumns = function () { return sheetData(this.name).maxCols; };
    Sheet.prototype.getRange = function (r, c, nr, nc) {
      if (typeof r === 'string') throw new Error('A1 notation is not supported by the simulator');
      return new Range(this, r, c, nr === undefined ? 1 : nr, nc === undefined ? 1 : nc);
    };
    Sheet.prototype.getDataRange = function () { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); };
    Sheet.prototype.deleteRow = function (r) {
      var d = sheetData(this.name);
      if (r < 1 || r > d.maxRows) throw new Error('deleteRow out of range');
      d.rows.splice(r - 1, 1); d.maxRows -= 1; stats.writes++;
    };
    Sheet.prototype.insertRowsAfter = function (after, n) {
      var d = sheetData(this.name);
      var blanks = []; for (var i = 0; i < n; i++) blanks.push([]);
      if (after < d.rows.length) Array.prototype.splice.apply(d.rows, [after, 0].concat(blanks));
      d.maxRows += n;
    };
    Sheet.prototype.insertColumnsAfter = function (after, n) { sheetData(this.name).maxCols += n; };
    Sheet.prototype.setFrozenRows = function (n) { sheetData(this.name).frozen = n; };
    Sheet.prototype.setColumnWidth = function () { return this; };
    Sheet.prototype.autoResizeColumns = function () { return this; };
    Sheet.prototype.setTabColor = function () { return this; };

    var spreadsheet = {
      getId: function () { return store.id; },
      getUrl: function () { return 'https://docs.google.com/spreadsheets/d/' + store.id; },
      getName: function () { return 'PFE Tracker (simulated)'; },
      getSpreadsheetTimeZone: function () { return store.tz; },
      getSheetByName: function (n) { return store.sheets[n] ? new Sheet(n) : null; },
      getSheets: function () { return store.order.map(function (n) { return new Sheet(n); }); },
      insertSheet: function (n) {
        if (store.sheets[n]) throw new Error('A sheet with the name "' + n + '" already exists.');
        store.sheets[n] = { rows: [], maxRows: 1000, maxCols: 26, frozen: 0 };
        store.order.push(n);
        return new Sheet(n);
      }
    };

    var globals = {
      SpreadsheetApp: {
        getActiveSpreadsheet: function () { return spreadsheet; },
        getActive: function () { return spreadsheet; },
        openById: function (id) { if (id !== store.id) throw new Error('Spreadsheet not found'); return spreadsheet; },
        flush: function () {},
        getUi: function () { throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); }
      },
      PropertiesService: {
        getScriptProperties: function () {
          return {
            getProperty: function (k) { return Object.prototype.hasOwnProperty.call(store.props, k) ? store.props[k] : null; },
            setProperty: function (k, v) { store.props[k] = String(v); return this; },
            deleteProperty: function (k) { delete store.props[k]; return this; },
            getProperties: function () { return Object.assign({}, store.props); }
          };
        }
      },
      CacheService: {
        getScriptCache: function () {
          return {
            get: function (k) { var e = store.cache[k]; if (!e) return null; if (e.exp < nowFn()) { delete store.cache[k]; return null; } return e.v; },
            put: function (k, v, ttl) { store.cache[k] = { v: String(v), exp: nowFn() + Math.min(21600, ttl || 600) * 1000 }; },
            remove: function (k) { delete store.cache[k]; }
          };
        }
      },
      LockService: {
        getScriptLock: function () {
          var held = false;
          return {
            tryLock: function () { held = true; return true; }, waitLock: function () { held = true; },
            releaseLock: function () { held = false; }, hasLock: function () { return held; }
          };
        }
      },
      Utilities: {
        DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
        getUuid: uuid,
        computeDigest: function (alg, value) { if (alg !== 'SHA_256') throw new Error('digest ' + alg); return signed(sha256(toBytes(value))); },
        computeHmacSha256Signature: function (value, key) { return signed(hmacSha256(toBytes(key), toBytes(value))); },
        formatDate: formatDate,
        sleep: function () {}
      },
      ContentService: {
        MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
        createTextOutput: function (s) {
          return { content: s, mime: 'text/plain', setMimeType: function (m) { this.mime = m; return this; }, getContent: function () { return this.content; } };
        }
      },
      MailApp: {
        sendEmail: function (a, b, c) {
          var m = typeof a === 'object' ? a : { to: a, subject: b, body: c };
          store.outbox.push({ to: m.to, subject: m.subject, body: m.body, at: new FakeDate().toISOString() });
          if (store.outbox.length > 200) store.outbox.shift();
        },
        getRemainingDailyQuota: function () { return opts.mailQuota === undefined ? 100 : opts.mailQuota; }
      },
      Session: {
        getEffectiveUser: function () { return { getEmail: function () { return opts.ownerEmail || 'teacher@example.com'; } }; },
        getScriptTimeZone: function () { return store.tz; }
      },
      Logger: { log: function () { if (opts.verbose) console.log.apply(console, arguments); } },
      console: opts.verbose ? console : { log: function () {}, warn: function () {}, error: function (e) { (opts.onError || function () {})(e); } },
      Date: FakeDate
    };

    var names = Object.keys(globals);
    var exported = ['doGet', 'doPost', 'install', 'setAdminPassword_', 'unlockTeacherLogin', 'getConfig_', 'readAll_'];
    var factory = new Function(names.join(','), code + '\n;return {' + exported.map(function (n) {
      return n + ': typeof ' + n + ' === "function" ? ' + n + ' : null';
    }).join(',') + '};');

    function fresh() { return factory.apply(null, names.map(function (n) { return globals[n]; })); }

    return {
      store: store,
      stats: stats,
      run: function (fn) { var args = Array.prototype.slice.call(arguments, 1); var x = fresh(); return x[fn].apply(null, args); },
      post: function (body) {
        var out = fresh().doPost({ postData: { contents: JSON.stringify(body), type: 'text/plain' }, parameter: {} });
        return JSON.parse(out.getContent());
      },
      get: function () { return JSON.parse(fresh().doGet({ parameter: {} }).getContent()); }
    };
  }

  var api = { createRuntime: createRuntime, emptyStore: emptyStore, sha256: sha256, utf8: utf8 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GasSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
