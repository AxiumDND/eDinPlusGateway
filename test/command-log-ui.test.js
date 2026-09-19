const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

test('command log lives outside the overflow-clipped app-main', () => {
  const mainClose = html.lastIndexOf('</div><!-- .app-main -->');
  const logIndex = html.indexOf('id="logBar"');
  assert.ok(mainClose > 0, 'app-main close comment present');
  assert.ok(logIndex > mainClose, 'log bar must be after app-main so overflow:hidden cannot clip it');
});

test('Setup defaults to HTTP with TCP as fallback copy', () => {
  assert.match(html, /<option value="http" selected>/);
  assert.match(html, /HTTP \(default, TCP fallback\)/);
  assert.match(html, /TCP only \(port 26\)/);
  assert.match(html, /HTTP is the normal path/);
});

test('Show command log checkbox can reveal the log with CSS alone', () => {
  assert.match(html, /id="showLogBar"/);
  assert.match(css, /body:has\(#showLogBar:checked\)\s+#logBar/);
  assert.match(css, /position:\s*fixed/);
  assert.doesNotMatch(css, /#logBar:not\(\[hidden\]\)/);
});
