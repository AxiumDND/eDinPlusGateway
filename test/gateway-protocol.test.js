const { test } = require('node:test');
const assert = require('node:assert/strict');
const protocol = require('../gateway-protocol.js');

test('parseAreaResponse keeps named areas and drops blanks', () => {
  const text = [
    '!AREANAME,1,0,0,Kitchen;',
    '!AREANAME,2,0,0,;',
    '!AREANAME,3,0,0,Living Room;'
  ].join('\n');
  assert.deepEqual(protocol.parseAreaResponse(text), [
    { num: '1', name: 'Kitchen' },
    { num: '3', name: 'Living Room' }
  ]);
});

test('parseSceneResponse reads scene number, area, and name', () => {
  const text = '!SCNNAME,22,0,2,Day;\n!SCNNAME,23,0,2,Off;';
  assert.deepEqual(protocol.parseSceneResponse(text), [
    { num: '22', name: 'Day', area: '2', kind: 'name' },
    { num: '23', name: 'Off', area: '2', kind: 'name' }
  ]);
});

test('isOffScene treats Off case-insensitively and uses the off-scene flag', () => {
  assert.equal(protocol.isOffScene({ name: 'Off' }), true);
  assert.equal(protocol.isOffScene({ name: '  OFF  ' }), true);
  assert.equal(protocol.isOffScene({ name: 'Evening' }), false);
  assert.equal(protocol.isOffScene({ name: 'All out', flags: 1 }), true);
  assert.equal(protocol.isOffScene(null), true);
});

test('parseSceneEvents reads prefixed HTTP/TCP log lines', () => {
  const events = protocol.parseSceneEvents('TCP Response: !SCNSTATE,00011,1,255,1000;');
  assert.equal(events.length, 1);
  assert.equal(events[0].num, '11');
  assert.equal(events[0].active, true);
});

test('parseSceneEvents reads SCNSTATE, SCN status, and action events', () => {
  const text = [
    '!OK,SCNRECALL,8;',
    '!SCNSTATE,00008,1,255,00001000;',
    '!SCN,00009,1,1,1,255;',
    '!SCNRECALL,00011;',
    '!SCNOFF,00008;'
  ].join('\n');
  const events = protocol.parseSceneEvents(text);
  assert.deepEqual(events.map(e => e.kind), ['state', 'status', 'action', 'action']);
  assert.equal(events[0].num, '8');
  assert.equal(events[0].active, true);
  assert.equal(events[1].flags, 1);
  assert.equal(events[2].action, 'RECALL');
  assert.equal(events[3].action, 'OFF');
});

test('reduceSceneFeedback maps a live scene onto its area tile state', () => {
  const catalog = {
    '11': { num: '11', name: 'Evening', area: '1' },
    '13': { num: '13', name: 'Off', area: '1' }
  };
  const recalled = protocol.reduceSceneFeedback({
    catalog,
    areas: { '1': { on: false, sceneNum: null, sceneName: '' } },
    event: { kind: 'state', num: '11', active: true, level: 255 }
  });
  assert.deepEqual(recalled.areas['1'], { on: true, sceneNum: '11', sceneName: 'Evening' });

  const off = protocol.reduceSceneFeedback({
    catalog: recalled.catalog,
    areas: recalled.areas,
    event: { kind: 'action', action: 'OFF', num: '11' }
  });
  assert.equal(off.areas['1'].on, false);
  assert.equal(off.areas['1'].sceneNum, '11');

  const offScene = protocol.reduceSceneFeedback({
    catalog,
    areas: {},
    event: { kind: 'action', action: 'RECALL', num: '13' }
  });
  assert.equal(offScene.areas['1'].on, false);
  assert.equal(offScene.areas['1'].sceneName, '');
});

test('parseChannelNames supports CHAN, DALI, TW, and RGB types', () => {
  const text = [
    '!CHANNAME,001,12,001,0,0,Downlights;',
    '!DALINAME,002,16,010,0,0,Hall DALI;',
    '!CHANTWCOLRNAME,001,17,003,0,0,Cove TW;',
    '!CHANRGBCOLRNAME,001,17,004,0,0,Feature RGB;'
  ].join('\n');
  const channels = protocol.parseChannelNames(text);
  assert.equal(channels.length, 4);
  assert.deepEqual(channels[0], {
    type: 'CHANNAME', addr: '001', devcode: '12', chanNum: '001', name: 'Downlights'
  });
  assert.equal(channels[2].type, 'CHANTWCOLRNAME');
  assert.equal(channels[3].name, 'Feature RGB');
});

test('parseChannelStates uses the 0-255 field, not the percent field', () => {
  // Historic bug: parts[5] is percent (90); parts[4] is 0-255 (230).
  const text = '!CHANLEVEL,001,12,001,230,90,1000;';
  const [state] = protocol.parseChannelStates(text);
  assert.equal(state.current, 230);
  assert.equal(state.chanNum, '001');
});

test('parseChannelStates reads RGB color and TW kelvin', () => {
  const text = [
    '!CHANRGBCOLR,001,17,004,255,#FFE8B0;',
    '!CHANTWCOLR,001,17,003,#4500K;'
  ].join('\n');
  const states = protocol.parseChannelStates(text);
  assert.equal(states[0].current, '#FFE8B0');
  assert.equal(states[0].level, 255);
  assert.equal(states[1].current, '#4500K');
});

test('channel type helpers', () => {
  assert.equal(protocol.getChannelCategory('CHANNAME'), 'LEVEL');
  assert.equal(protocol.getChannelCategory('CHANRGBCOLRNAME'), 'COLOR');
  assert.equal(protocol.getColorType('CHANTWCOLRNAME'), 'TW');
  assert.equal(protocol.getColorType('CHANRGBCOLRNAME'), 'RGB');
  assert.equal(protocol.getColorType('DMXRGBWCOLRNAME'), 'RGBW');
});

test('sortAreasByOrder restores saved tile order', () => {
  const areas = [{ num: '1', name: 'Kitchen' }, { num: '2', name: 'Living' }, { num: '3', name: 'Hall' }];
  const sorted = protocol.sortAreasByOrder(areas, '3,1,2');
  assert.deepEqual(sorted.map(a => a.num), ['3', '1', '2']);
  assert.deepEqual(protocol.sortAreasByOrder(areas, ''), areas);
});

test('color helpers and slider fill', () => {
  assert.deepEqual(protocol.hexToRgb('#ff8800'), { r: 255, g: 136, b: 0 });
  assert.equal(protocol.rgbToHex(255, 136, 0), '#ff8800');
  assert.equal(protocol.sliderFillPercent(0, 255, 230).toFixed(0), '90');
  assert.equal(protocol.sliderFillPercent(1800, 6500, 1800), 0);
  assert.equal(protocol.sliderFillPercent(1800, 6500, 6500), 100);
  assert.equal(protocol.pad(7, 3), '007');
});
