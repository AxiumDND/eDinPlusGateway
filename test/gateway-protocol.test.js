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
  assert.equal(protocol.isOffScene({ name: 'ALL OFF' }), true);
  assert.equal(protocol.isOffScene({ name: 'Colour off' }), true);
  assert.equal(protocol.isOffScene(null), true);
});

test('sensor and PIR scenes are functions, not Off', () => {
  assert.equal(protocol.isFunctionScene({ name: 'Disable Sensor', flags: 3 }), true);
  assert.equal(protocol.isFunctionScene({ name: 'Enable Sensor', flags: 2 }), true);
  assert.equal(protocol.isFunctionScene({ name: 'PIR Off', flags: 3 }), true);
  assert.equal(protocol.isOffScene({ name: 'Disable Sensor', flags: 3 }), false);
  assert.equal(protocol.isOffScene({ name: 'PIR Off', flags: 3 }), false);
  assert.equal(protocol.isOffScene({ name: '1 Main spots & Kitchen', flags: 2 }), false);
});

test('parseSceneResponse decodes HTML entities in scene names', () => {
  const scenes = protocol.parseSceneResponse('!SCNNAME,00135,07,00001,2 Island spot &amp; Z2 White;');
  assert.equal(scenes[0].name, '2 Island spot & Z2 White');
  assert.equal(protocol.decodeGatewayText('1 Main spots &amp; Kitchen'), '1 Main spots & Kitchen');
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

const KITCHEN_CATALOG = {
  '130': { num: '130', name: '1 Main spots & Kitchen', area: '1', flags: 2 },
  '97': { num: '97', name: 'Kitchen Red', area: '1', flags: 2 },
  '81': { num: '81', name: 'Disable Sensor', area: '1', flags: 3 },
  '80': { num: '80', name: 'Enable Sensor', area: '1', flags: 2 },
  '131': { num: '131', name: 'ALL OFF', area: '1', flags: 3 }
};

const KITCHEN_SCNS = [
  '!SCN,00130,01,02,1,255;',
  '!SCN,00097,01,02,0,000;',
  '!SCN,00081,01,03,1,255;',
  '!SCN,00080,01,02,0,000;',
  '!SCN,00131,01,03,0,000;'
].join('\n');

test('a live Disable Sensor row does not switch Kitchen off after lighting recall', () => {
  const afterLights = protocol.reduceSceneFeedback({
    catalog: KITCHEN_CATALOG,
    areas: { '1': { on: true, sceneNum: '130', sceneName: '1 Main spots & Kitchen' } },
    event: { kind: 'status', num: '81', flags: 3, active: true, level: 255 }
  });
  assert.equal(afterLights.areas['1'].on, true);
  assert.equal(afterLights.areas['1'].sceneNum, '130');
});

test('Kitchen ?SCNS snapshot keeps lighting when Disable Sensor is also active', () => {
  const snapshot = protocol.reduceSceneStatusSnapshot({
    catalog: KITCHEN_CATALOG,
    areas: { '1': { on: true, sceneNum: '130', sceneName: '1 Main spots & Kitchen' } },
    events: protocol.parseSceneEvents(KITCHEN_SCNS)
  });
  assert.equal(snapshot.areas['1'].on, true);
  assert.equal(snapshot.areas['1'].sceneNum, '130');
  assert.equal(snapshot.areas['1'].sceneName, '1 Main spots & Kitchen');
});

test('Kitchen ?SCNS snapshot still reports Off when ALL OFF is the active lighting row', () => {
  const text = [
    '!SCN,00130,01,02,0,000;',
    '!SCN,00081,01,03,1,255;',
    '!SCN,00131,01,03,1,255;'
  ].join('\n');
  const snapshot = protocol.reduceSceneStatusSnapshot({
    catalog: KITCHEN_CATALOG,
    areas: { '1': { on: true, sceneNum: '130', sceneName: '1 Main spots & Kitchen' } },
    events: protocol.parseSceneEvents(text)
  });
  assert.equal(snapshot.areas['1'].on, false);
  assert.equal(snapshot.areas['1'].sceneNum, '131');
});

test('scene hold keeps the recalled Kitchen scene while ?SCNS still lists another lighting row', () => {
  const snapshot = protocol.reduceSceneStatusSnapshot({
    catalog: KITCHEN_CATALOG,
    areas: { '1': { on: true, sceneNum: '97', sceneName: 'Kitchen Red' } },
    events: protocol.parseSceneEvents(KITCHEN_SCNS),
    hold: { areaNum: '1', sceneNum: '97', until: Date.now() + 10000 }
  });
  assert.equal(snapshot.areas['1'].on, true);
  assert.equal(snapshot.areas['1'].sceneNum, '97');
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
