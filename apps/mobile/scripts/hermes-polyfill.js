// Minimal UTF-8 TextEncoder/TextDecoder for the standalone Hermes CLI (0.12), which predates
// their native implementation in React Native's Hermes. Only what the vector check needs.
/* eslint-disable */
(function (g) {
  if (typeof g.TextEncoder === 'undefined') {
    g.TextEncoder = function TextEncoder() {};
    g.TextEncoder.prototype.encode = function (str) {
      var out = [];
      for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
          var d = str.charCodeAt(i + 1);
          if (d >= 0xdc00 && d <= 0xdfff) {
            c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
            i++;
          }
        }
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
        else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        else
          out.push(
            0xf0 | (c >> 18),
            0x80 | ((c >> 12) & 63),
            0x80 | ((c >> 6) & 63),
            0x80 | (c & 63),
          );
      }
      return new Uint8Array(out);
    };
  }
  if (typeof g.TextDecoder === 'undefined') {
    g.TextDecoder = function TextDecoder() {};
    g.TextDecoder.prototype.decode = function (bytes) {
      var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      var s = '';
      for (var i = 0; i < b.length;) {
        var c = b[i++];
        if (c < 0x80) s += String.fromCharCode(c);
        else if (c < 0xe0) s += String.fromCharCode(((c & 31) << 6) | (b[i++] & 63));
        else if (c < 0xf0)
          s += String.fromCharCode(((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63));
        else {
          var cp = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
          cp -= 0x10000;
          s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
        }
      }
      return s;
    };
  }
  // React Native installs a WHATWG URL on its Hermes; the standalone CLI has none. Zod's url()
  // check only needs a constructor that throws on garbage and exposes protocol/hostname.
  if (typeof g.URL === 'undefined') {
    g.URL = function URL(input) {
      var m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#:]+)(:\d+)?([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(
        String(input),
      );
      if (!m) throw new TypeError('Invalid URL: ' + input);
      this.href = String(input);
      this.protocol = m[1].toLowerCase() + ':';
      this.hostname = m[2].toLowerCase();
      this.port = m[3] ? m[3].slice(1) : '';
      this.host = this.hostname + (m[3] || '');
      this.pathname = m[4] || '/';
      this.search = m[5] || '';
      this.hash = m[6] || '';
      this.origin = this.protocol + '//' + this.host;
    };
    g.URL.prototype.toString = function () {
      return this.href;
    };
  }
  if (typeof g.console === 'undefined')
    g.console = { log: print, error: print, warn: print, info: print };
})(typeof globalThis !== 'undefined' ? globalThis : this);
