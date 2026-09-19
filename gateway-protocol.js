// Shared gateway parsing and Control helpers. Safe to load in the browser or Node.
(function (root) {
function pad(num, size) {
  return num.toString().padStart(size, '0');
}

function getChannelCategory(channelType) {
  const t = String(channelType || '').toUpperCase();
  if (t.includes('RGB') || t.includes('TW') || t.includes('COLR')) return 'COLOR';
  return 'LEVEL';
}

function getColorType(channelType) {
  const t = String(channelType || '').toUpperCase();
  if (t.includes('TW')) return 'TW';
  if (t.includes('RGBW')) return 'RGBW';
  if (t.includes('RGB')) return 'RGB';
  return 'UNKNOWN';
}

function normalizeSceneNum(value) {
  const parsed = parseInt(String(value == null ? '' : value).trim(), 10);
  return Number.isFinite(parsed) ? String(parsed) : '';
}

function isOffScene(scene) {
  if (!scene) return true;
  if ((Number(scene.flags) & 1) === 1) return true;
  return String(scene.name || '').trim().toLowerCase() === 'off';
}

const SCENE_ACTION_ON = ['RECALL', 'RECALLX', 'FAST', 'BACKON'];
const SCENE_ACTION_OFF = ['OFF'];
const SCENE_EVENT_ACTIONS = [
  'SCNRECALLX', 'SCNRECALL', 'SCNOFF', 'SCNFAST', 'SCNBACKON',
  'SCNRAISE', 'SCNLOWER', 'SCNRAMP', 'SCNSTOP',
  'SCNNUDGEUP', 'SCNNUDGEDN', 'SCNONOFF', 'SCNTOGGLE', 'SCNSAVE'
];

function extractGatewayLines(responseText) {
  return String(responseText || '').split(/[\r\n]+/).map(line => {
    const idx = line.indexOf('!');
    return idx < 0 ? '' : line.slice(idx).trim();
  }).filter(Boolean);
}

function parseAreaResponse(responseText) {
  const areas = [];
  extractGatewayLines(responseText).forEach(line => {
    line = line.trim();
    if (!line.startsWith('!AREANAME,')) return;
    if (line.endsWith(';')) line = line.slice(0, -1);
    const parts = line.split(',');
    if (parts.length < 5) return;
    const areaNum = parts[1].trim();
    const areaName = parts[4].trim();
    if (areaName !== '') areas.push({ num: areaNum, name: areaName });
  });
  return areas;
}

function parseSceneResponse(responseText) {
  const scenes = [];
  extractGatewayLines(responseText).forEach(line => {
    line = line.trim();
    if (!line.startsWith('!SCNNAME,')) return;
    if (line.endsWith(';')) line = line.slice(0, -1);
    const parts = line.split(',');
    if (parts.length < 5) return;
    const scnNum = normalizeSceneNum(parts[1]);
    const area = normalizeSceneNum(parts[3]);
    const scnName = parts.slice(4).join(',').trim();
    if (scnName !== '') scenes.push({ num: scnNum, name: scnName, area: area || undefined, kind: 'name' });
  });
  return scenes;
}

function parseSceneEvents(responseText) {
  const events = [];
  extractGatewayLines(responseText).forEach(raw => {
    let line = raw.trim();
    if (!line.startsWith('!')) return;
    if (line.startsWith('!OK,')) return;
    if (line.endsWith(';')) line = line.slice(0, -1);
    if (line.startsWith('!SCNNAME,')) {
      events.push(...parseSceneResponse(line + ';'));
      return;
    }
    if (line.startsWith('!SCNSTATE,')) {
      const parts = line.split(',');
      if (parts.length < 4) return;
      events.push({
        kind: 'state',
        num: normalizeSceneNum(parts[1]),
        active: Number(parts[2]) !== 0,
        level: parseInt(parts[3], 10),
        fadeMs: parts[4] != null ? parseInt(parts[4], 10) : 0
      });
      return;
    }
    if (line.startsWith('!SCN,') && !line.startsWith('!SCNNAME') && !line.startsWith('!SCNSTATE')) {
      const parts = line.split(',');
      if (parts.length < 6) return;
      events.push({
        kind: 'status',
        num: normalizeSceneNum(parts[1]),
        mode: parseInt(parts[2], 10),
        flags: parseInt(parts[3], 10),
        active: Number(parts[4]) !== 0,
        level: parseInt(parts[5], 10)
      });
      return;
    }
    for (const token of SCENE_EVENT_ACTIONS) {
      if (line.startsWith('!' + token + ',')) {
        const parts = line.split(',');
        events.push({
          kind: 'action',
          action: token.replace(/^SCN/, ''),
          num: normalizeSceneNum(parts[1]),
          level: parts[2] != null ? parseInt(parts[2], 10) : undefined,
          fadeMs: parts[3] != null ? parseInt(parts[3], 10) : undefined
        });
        return;
      }
    }
  });
  return events;
}

function reduceSceneFeedback(input) {
  const catalog = Object.assign({}, input.catalog || {});
  const areas = Object.assign({}, input.areas || {});
  const ev = input.event;
  if (!ev || !ev.num) return { catalog, areas, changedAreas: [] };

  if (ev.kind === 'name') {
    const prev = catalog[ev.num] || { num: ev.num };
    catalog[ev.num] = {
      num: ev.num,
      name: ev.name || prev.name || '',
      area: ev.area || prev.area,
      flags: ev.flags != null ? ev.flags : prev.flags
    };
    return { catalog, areas, changedAreas: [] };
  }

  const prevScene = catalog[ev.num] || { num: ev.num };
  const scene = {
    num: ev.num,
    name: ev.name || prevScene.name || '',
    area: ev.area || prevScene.area,
    flags: ev.flags != null ? ev.flags : prevScene.flags
  };
  catalog[ev.num] = scene;
  const areaNum = scene.area;
  if (!areaNum) return { catalog, areas, changedAreas: [] };

  const current = Object.assign({ on: false, sceneNum: null, sceneName: '' }, areas[areaNum]);
  const off = isOffScene(scene);
  let next = current;
  let changed = false;

  function setScene(isOn) {
    next = {
      on: !!(isOn && !off),
      sceneNum: scene.num,
      sceneName: isOn && !off ? (scene.name || '') : ''
    };
    changed = true;
  }

  if (ev.kind === 'state' || ev.kind === 'status') {
    if (ev.active) setScene(true);
    else if (normalizeSceneNum(current.sceneNum) === scene.num) {
      next = { on: false, sceneNum: current.sceneNum, sceneName: current.sceneName };
      changed = true;
    }
  } else if (ev.kind === 'action') {
    if (SCENE_ACTION_OFF.indexOf(ev.action) !== -1) setScene(false);
    else if (SCENE_ACTION_ON.indexOf(ev.action) !== -1) setScene(true);
  }

  if (changed) areas[areaNum] = next;
  return { catalog, areas, changedAreas: changed ? [areaNum] : [] };
}

function parseChannelNames(responseText) {
  const channels = [];
  String(responseText || '').split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line) return;
    if (
      !line.startsWith('!CHANNAME,') &&
      !line.startsWith('!DMXNAME,') &&
      !line.startsWith('!DMXRGBCOLRNAME,') &&
      !line.startsWith('!CHANRGBCOLRNAME,') &&
      !line.startsWith('!DALINAME,') &&
      !line.startsWith('!CHANTWCOLRNAME,')
    ) return;
    if (line.endsWith(';')) line = line.slice(1, -1);
    else line = line.slice(1);
    const parts = line.split(',');
    if (parts.length < 7) return;
    channels.push({
      type: parts[0],
      addr: parts[1],
      devcode: parts[2],
      chanNum: parts[3],
      name: parts.slice(6).join(',')
    });
  });
  return channels;
}

function parseChannelStates(responseText) {
  const states = [];
  String(responseText || '').split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line) return;
    if (
      line.startsWith('!CHANLEVEL,') ||
      line.startsWith('!DMXLEVEL,') ||
      line.startsWith('!DALILEVEL,')
    ) {
      if (line.endsWith(';')) line = line.slice(1, -1);
      else line = line.slice(1);
      const parts = line.split(',');
      if (parts.length < 6) return;
      let current = parseInt(parts[4], 10);
      if (isNaN(current)) current = 0;
      if (current > 255) current = 255;
      states.push({
        type: parts[0],
        addr: parts[1],
        devcode: parts[2],
        chanNum: parts[3],
        current
      });
      return;
    }
    if (
      line.startsWith('!DMXRGBCOLR,') ||
      line.startsWith('!CHANRGBCOLR,') ||
      line.startsWith('!CHANTWCOLR,')
    ) {
      if (line.endsWith(';')) line = line.slice(1, -1);
      else line = line.slice(1);
      const parts = line.split(',');
      if (parts[0] === 'CHANRGBCOLR' || parts[0] === 'DMXRGBCOLR') {
        if (parts.length < 6) return;
        const state = {
          type: parts[0],
          addr: parts[1],
          devcode: parts[2],
          chanNum: parts[3],
          current: parts[5],
          level: parseInt(parts[4], 10)
        };
        if (isNaN(state.level) || state.level < 0 || state.level > 255) state.level = 0;
        states.push(state);
      } else if (parts[0] === 'CHANTWCOLR' && parts.length >= 5) {
        states.push({
          type: parts[0],
          addr: parts[1],
          devcode: parts[2],
          chanNum: parts[3],
          current: parts[4]
        });
      }
    }
  });
  return states;
}

function sortAreasByOrder(areas, orderCsv) {
  const order = String(orderCsv || '').split(',').filter(Boolean);
  if (!order.length) return areas;
  const rank = new Map(order.map((id, i) => [id, i]));
  return areas.slice().sort((a, b) => {
    const ia = rank.has(String(a.num)) ? rank.get(String(a.num)) : 1000;
    const ib = rank.has(String(b.num)) ? rank.get(String(b.num)) : 1000;
    return ia - ib;
  });
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function rgbToHex(r, g, b) {
  const componentToHex = (c) => {
    const value = parseInt(c, 10);
    if (isNaN(value) || value < 0 || value > 255) return '00';
    const hex = value.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

function sliderFillPercent(min, max, value) {
  const lo = Number.isFinite(min) ? min : 0;
  const hi = Number.isFinite(max) ? max : 100;
  const val = Number.isFinite(value) ? value : lo;
  if (hi === lo) return 0;
  return Math.max(0, Math.min(100, ((val - lo) / (hi - lo)) * 100));
}

const gatewayProtocol = {
  pad,
  getChannelCategory,
  getColorType,
  normalizeSceneNum,
  isOffScene,
  parseAreaResponse,
  parseSceneResponse,
  parseSceneEvents,
  reduceSceneFeedback,
  parseChannelNames,
  parseChannelStates,
  sortAreasByOrder,
  hexToRgb,
  rgbToHex,
  sliderFillPercent
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = gatewayProtocol;
}
if (root) root.gatewayProtocol = gatewayProtocol;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
