const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const em = require('../em-dali.js');

test('IEC 62386-202 group and short-address helpers', () => {
  assert.equal(em.formatShortAddr(4), 'F04');
  assert.equal(em.parseShortAddr('F44'), 44);
  assert.equal(em.addToGroupOpcode(14), 110);
  assert.equal(em.addToGroupOpcode(15), 111);
  assert.deepEqual(em.groupsFromMask((1 << 14) | (1 << 15)), [14, 15]);
});

test('emergency and failure status bits match the eTEST app lists', () => {
  const emFlags = em.parseEmergencyStatus((1 << 1) | (1 << 2) | (1 << 3));
  assert.equal(emFlags.functionValid, true);
  assert.equal(emFlags.durationValid, true);
  assert.equal(emFlags.batteryCharged, true);
  assert.equal(emFlags.inhibit, false);
  const fail = em.parseFailureStatus(1 << 2);
  assert.equal(fail.battery, true);
  assert.equal(fail.lamp, false);
  const good = em.fittingOutcome((1 << 1) | (1 << 2) | (1 << 3), 0);
  assert.equal(good.allGood, true);
  const bad = em.fittingOutcome((1 << 1) | (1 << 2) | (1 << 3), 1 << 3);
  assert.equal(bad.failed, true);
  assert.equal(bad.allGood, false);
});

test('parses DALIFIX and XDALIAPP query replies', () => {
  const fixtures = em.parseDaliFixLines('!DALIFIX,001,017,F04,8284864,16384,1,0;');
  assert.equal(fixtures.length, 1);
  assert.equal(fixtures[0].shortAddr, 4);
  assert.deepEqual(fixtures[0].groups, [14]);
  const replies = em.parseXdaliAppLines('HTTP Response: !XDALIAPP,001,017,F04,253,1,14,0;');
  assert.equal(replies[0].opcode, 253);
  assert.equal(replies[0].data, 14);
  assert.equal(replies[0].shortAddr, 4);
});

test('builds XDALIAPP identify / test / query commands', () => {
  assert.equal(
    em.xdaliAppCommand('once', 1, 17, 'BST', em.OPCODE.START_IDENTIFICATION),
    '$XDALIAPP,001,017,BST,240,1;'
  );
  assert.equal(
    em.xdaliAppCommand('twice', 1, 17, 'F04', em.OPCODE.START_FUNCTION_TEST),
    '$XDALIAPPX2,001,017,F04,227,1;'
  );
  assert.equal(
    em.xdaliAppCommand('query', 1, 17, 'F04', em.OPCODE.QUERY_EMERGENCY_STATUS),
    '?XDALIAPP,001,017,F04,253,1;'
  );
  assert.equal(em.xdaliAddToGroup(1, 17, 4, 14), '$XDALIX2,001,017,F04,110;');
});

test('EM Dali section is in the sidebar and follows the eTEST flow', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="emdali-btn"/);
  assert.match(html, />EM Dali</);
  assert.match(html, /id="emdali"/);
  assert.match(html, /Group A \(14\)/);
  assert.match(html, /Group B \(15\)/);
  assert.match(html, /Start Function Test/);
  assert.match(html, /Start Duration Test/);
  assert.match(html, /Refresh test results/);
  assert.match(html, /Advanced DALI scan/);
});
