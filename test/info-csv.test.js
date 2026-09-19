const { test } = require('node:test');
const assert = require('node:assert/strict');
const protocol = require('../gateway-protocol.js');

const namesCsv = [
  '!EDIN NAMES FILE',
  '! comment',
  'PROJECTNAME,Demo House',
  'AREA,1,Kitchen',
  'AREA,2,Living Room',
  'CHAN,001,12,001,1,Downlights',
  'DALI,3,17,2,1,Main Downlights',
  'CHAN,002,12,001,2,Wall wash'
].join('\n');

const levelsCsv = [
  '!EDIN LEVELS FILE',
  'SCENE,11,Evening',
  'SCNFADE,11,1000',
  'SCNCHANLEVEL,11,001,12,001,200',
  'SCNCHANTWCOLR,11,001,17,003,#2200K',
  'SCNCHANRGBCOLR,11,001,17,004,#FF8A3D',
  'SCNDALILEVEL,11,3,17,2,180'
].join('\n');

test('parseInfoNamesFile reads areas and typed channels', () => {
  const names = protocol.parseInfoNamesFile(namesCsv);
  assert.equal(names.headerOk, true);
  assert.equal(names.project.name, 'Demo House');
  assert.deepEqual(names.areas.map(a => a.name), ['Kitchen', 'Living Room']);
  assert.equal(names.channels.length, 3);
  assert.equal(names.channels[0].type, 'CHANNAME');
  assert.equal(names.channels[1].type, 'DALINAME');
  assert.equal(names.channels[1].name, 'Main Downlights');
  assert.equal(names.channels[1].area, '1');
});

test('parseInfoLevelsFile and sceneChannelsFromInfo merge names + levels', () => {
  const names = protocol.parseInfoNamesFile(namesCsv);
  const levels = protocol.parseInfoLevelsFile(levelsCsv);
  assert.equal(levels.headerOk, true);
  assert.equal(levels.scenes.length, 1);
  assert.equal(levels.scenes[0].name, 'Evening');
  assert.equal(levels.scenes[0].fadeMs, 1000);
  const index = protocol.buildInfoChannelIndex(names);
  const pack = protocol.sceneChannelsFromInfo(levels.scenes[0], index);
  assert.equal(pack.channels.length, 4);
  assert.equal(pack.channels[0].name, 'Downlights');
  assert.equal(pack.states[0].current, 200);
  assert.equal(pack.channels[1].type, 'CHANTWCOLRNAME');
  assert.equal(pack.states[1].current, '#2200K');
  assert.equal(pack.channels[2].type, 'CHANRGBCOLRNAME');
  assert.equal(pack.channels[3].type, 'DALINAME');
  assert.equal(pack.channels[3].name, 'Main Downlights');
  assert.equal(protocol.inferSceneArea(levels.scenes[0], index), '1');
});
