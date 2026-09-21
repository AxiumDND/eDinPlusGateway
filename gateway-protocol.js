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

function decodeGatewayText(text) {
  return String(text == null ? '' : text)
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function sceneNameKey(scene) {
  return decodeGatewayText(scene && scene.name || '').trim().toLowerCase();
}

function isFunctionScene(scene) {
  const name = sceneNameKey(scene);
  if (!name) return false;
  return /\b(enable|disable)\s+sensor\b/.test(name) || /\bpir\b/.test(name) || /\bsensor\b/.test(name);
}

function isOffScene(scene) {
  if (!scene) return true;
  if (isFunctionScene(scene)) return false;
  const name = sceneNameKey(scene);
  if (name === 'off' || name === 'all off' || /(^|\s)off$/.test(name)) return true;
  return (Number(scene.flags) & 1) === 1;
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
    if (areaName !== '') areas.push({ num: areaNum, name: decodeGatewayText(areaName) });
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
    const scnName = decodeGatewayText(parts.slice(4).join(',').trim());
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

  if (isFunctionScene(scene) && (ev.kind === 'state' || ev.kind === 'status')) {
    return { catalog, areas, changedAreas: [] };
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

function sceneRowsEqual(a, b) {
  return !!(a && b
    && a.on === b.on
    && normalizeSceneNum(a.sceneNum) === normalizeSceneNum(b.sceneNum)
    && String(a.sceneName || '') === String(b.sceneName || ''));
}

function reduceSceneStatusSnapshot(input) {
  const catalog = Object.assign({}, input.catalog || {});
  const areas = Object.assign({}, input.areas || {});
  const hold = input.hold || null;
  const events = (input.events || []).filter(ev => ev && ev.kind === 'status' && ev.num);

  events.forEach(ev => {
    const prev = catalog[ev.num] || { num: ev.num };
    catalog[ev.num] = {
      num: ev.num,
      name: ev.name || prev.name || '',
      area: ev.area || prev.area,
      flags: ev.flags != null ? ev.flags : prev.flags
    };
  });

  const rowsByArea = {};
  events.forEach(ev => {
    const scene = catalog[ev.num];
    const areaNum = scene && scene.area;
    if (!areaNum) return;
    if (!rowsByArea[areaNum]) rowsByArea[areaNum] = [];
    rowsByArea[areaNum].push({ ev: ev, scene: scene });
  });

  const changedAreas = [];
  Object.keys(rowsByArea).forEach(areaNum => {
    const rows = rowsByArea[areaNum];
    const current = Object.assign({ on: false, sceneNum: null, sceneName: '' }, areas[areaNum]);
    const holdHere = hold
      && Date.now() < Number(hold.until || 0)
      && normalizeSceneNum(hold.areaNum) === normalizeSceneNum(areaNum)
      ? hold
      : null;
    const lighting = rows.filter(row => row.ev.active && !isOffScene(row.scene) && !isFunctionScene(row.scene));
    const offActive = rows.filter(row => row.ev.active && isOffScene(row.scene));
    let next = current;

    if (holdHere && holdHere.sceneNum) {
      const held = catalog[normalizeSceneNum(holdHere.sceneNum)] || { num: holdHere.sceneNum };
      if (!isOffScene(held)) {
        next = { on: true, sceneNum: normalizeSceneNum(held.num), sceneName: held.name || current.sceneName || '' };
      } else {
        next = { on: false, sceneNum: normalizeSceneNum(held.num), sceneName: '' };
      }
    } else if (lighting.length) {
      const preferred = lighting.find(row => normalizeSceneNum(row.scene.num) === normalizeSceneNum(current.sceneNum))
        || lighting[lighting.length - 1];
      next = { on: true, sceneNum: preferred.scene.num, sceneName: preferred.scene.name || '' };
    } else if (offActive.length) {
      const offRow = offActive[offActive.length - 1];
      next = { on: false, sceneNum: offRow.scene.num, sceneName: '' };
    }

    if (!sceneRowsEqual(current, next)) {
      areas[areaNum] = next;
      changedAreas.push(areaNum);
    }
  });

  return { catalog, areas, changedAreas };
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

function splitInfoCsvLine(line) {
  return String(line == null ? '' : line).split(',');
}

function parseInfoCsvRows(text) {
  return String(text || '').split(/\r\n|\n|\r/).map(line => line.replace(/\s+$/, '')).filter(line => {
    if (!line) return false;
    if (line.charAt(0) === '!') return false;
    return true;
  });
}

function parseInfoNamesFile(text) {
  const raw = String(text || '');
  const headerOk = /^\s*!EDIN NAMES FILE/im.test(raw);
  const project = {};
  const areas = [];
  const plates = [];
  const modules = [];
  const channels = [];
  parseInfoCsvRows(raw).forEach(line => {
    const parts = splitInfoCsvLine(line);
    const token = String(parts[0] || '').toUpperCase();
    if (token === 'PROJECTNAME') project.name = parts.slice(1).join(',');
    else if (token === 'PROJECTVERSION') project.version = parts.slice(1).join(',');
    else if (token === 'PROJECTOWNER') project.owner = parts.slice(1).join(',');
    else if (token === 'AREA' && parts.length >= 3) {
      const num = normalizeSceneNum(parts[1]);
      const name = parts.slice(2).join(',');
      if (num && name) areas.push({ num, name });
    } else if (token === 'PLATE' && parts.length >= 5) {
      plates.push({
        addr: parts[1],
        devcode: parts[2],
        area: normalizeSceneNum(parts[3]),
        name: parts.slice(4).join(',')
      });
    } else if (token === 'MODULE' && parts.length >= 5) {
      modules.push({
        addr: parts[1],
        devcode: parts[2],
        area: normalizeSceneNum(parts[3]),
        name: parts.slice(4).join(',')
      });
    } else if (['CHAN', 'DALI', 'DMX', 'INPSTATE', 'INPPIR', 'INPLEVEL'].indexOf(token) !== -1 && parts.length >= 6) {
      channels.push({
        kind: token,
        type: infoKindToNameType(token),
        addr: parts[1],
        devcode: parts[2],
        chanNum: parts[3],
        area: normalizeSceneNum(parts[4]),
        name: parts.slice(5).join(',')
      });
    }
  });
  return { headerOk, project, areas, plates, modules, channels };
}

function infoKindToNameType(kind) {
  const token = String(kind || '').toUpperCase();
  if (token === 'DALI' || token === 'SCNDALILEVEL') return 'DALINAME';
  if (token === 'DMX' || token === 'SCNDMXLEVEL') return 'DMXNAME';
  if (token === 'SCNCHANRGBCOLR') return 'CHANRGBCOLRNAME';
  if (token === 'SCNDMXRGBCOLR') return 'DMXRGBCOLRNAME';
  if (token === 'SCNCHANRGBPLAY') return 'CHANRGBCOLRNAME';
  if (token === 'SCNDMXRGBPLAY') return 'DMXRGBCOLRNAME';
  if (token === 'SCNCHANTWCOLR') return 'CHANTWCOLRNAME';
  if (token === 'SCNDMXTWCOLR') return 'DMXTWCOLRNAME';
  return 'CHANNAME';
}

function channelKey(addr, devcode, chanNum) {
  return [addr, devcode, chanNum].map(part => String(part == null ? '' : part).trim()).join('|');
}

function parseInfoLevelsFile(text) {
  const raw = String(text || '');
  const headerOk = /^\s*!EDIN LEVELS FILE/im.test(raw);
  const areas = [];
  const scenes = {};
  function sceneOf(num) {
    const id = normalizeSceneNum(num);
    if (!id) return null;
    if (!scenes[id]) scenes[id] = { num: id, name: '', fadeMs: null, items: [] };
    return scenes[id];
  }
  parseInfoCsvRows(raw).forEach(line => {
    const parts = splitInfoCsvLine(line);
    const token = String(parts[0] || '').toUpperCase();
    if (token === 'AREA' && parts.length >= 3) {
      const num = normalizeSceneNum(parts[1]);
      const name = parts.slice(2).join(',');
      if (num && name) areas.push({ num, name });
    } else if (token === 'SCENE' && parts.length >= 3) {
      const scene = sceneOf(parts[1]);
      if (scene) scene.name = parts.slice(2).join(',');
    } else if (token === 'SCNFADE' && parts.length >= 3) {
      const scene = sceneOf(parts[1]);
      if (scene) scene.fadeMs = parseInt(parts[2], 10);
    } else if (token.indexOf('SCN') === 0 && parts.length >= 6) {
      const scene = sceneOf(parts[1]);
      if (!scene) return;
      scene.items.push({
        token,
        type: infoKindToNameType(token),
        addr: parts[2],
        devcode: parts[3],
        chanNum: parts[4],
        value: parts.slice(5).join(',')
      });
    }
  });
  return { headerOk, areas, scenes: Object.keys(scenes).map(key => scenes[key]) };
}

function buildInfoChannelIndex(namesFile) {
  const byKey = {};
  (namesFile && namesFile.channels || []).forEach(channel => {
    byKey[channelKey(channel.addr, channel.devcode, channel.chanNum)] = channel;
  });
  return byKey;
}

function sceneChannelsFromInfo(scene, nameIndex) {
  const channels = [];
  const states = [];
  (scene && scene.items || []).forEach(item => {
    const named = (nameIndex && nameIndex[channelKey(item.addr, item.devcode, item.chanNum)]) || {};
    const name = named.name || item.token.replace(/^SCN/, '');
    const type = item.token.indexOf('RGB') !== -1 || item.token.indexOf('TW') !== -1
      ? item.type
      : (named.type || item.type);
    channels.push({
      type,
      addr: item.addr,
      devcode: item.devcode,
      chanNum: item.chanNum,
      name,
      area: named.area
    });
    const value = item.value;
    const asLevel = parseInt(value, 10);
    if (item.token.indexOf('RGB') !== -1) {
      states.push({
        type: type.replace(/NAME$/, ''),
        addr: item.addr,
        devcode: item.devcode,
        chanNum: item.chanNum,
        current: value,
        level: Number.isFinite(asLevel) && value.indexOf('#') === -1 ? asLevel : 255
      });
    } else if (item.token.indexOf('TW') !== -1) {
      states.push({
        type: type.replace(/NAME$/, ''),
        addr: item.addr,
        devcode: item.devcode,
        chanNum: item.chanNum,
        current: value
      });
    } else {
      states.push({
        type: type.replace(/NAME$/, ''),
        addr: item.addr,
        devcode: item.devcode,
        chanNum: item.chanNum,
        current: Number.isFinite(asLevel) ? asLevel : 0
      });
    }
  });
  return { channels, states };
}

function inferSceneArea(scene, nameIndex) {
  const votes = {};
  (scene && scene.items || []).forEach(item => {
    const named = nameIndex && nameIndex[channelKey(item.addr, item.devcode, item.chanNum)];
    if (!named || !named.area) return;
    votes[named.area] = (votes[named.area] || 0) + 1;
  });
  let best = '';
  let bestCount = 0;
  Object.keys(votes).forEach(area => {
    if (votes[area] > bestCount) {
      best = area;
      bestCount = votes[area];
    }
  });
  return best;
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
  decodeGatewayText,
  isFunctionScene,
  isOffScene,
  parseAreaResponse,
  parseSceneResponse,
  parseSceneEvents,
  reduceSceneFeedback,
  reduceSceneStatusSnapshot,
  parseChannelNames,
  parseChannelStates,
  sortAreasByOrder,
  hexToRgb,
  rgbToHex,
  sliderFillPercent,
  parseInfoNamesFile,
  parseInfoLevelsFile,
  buildInfoChannelIndex,
  sceneChannelsFromInfo,
  inferSceneArea,
  channelKey
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = gatewayProtocol;
}
if (root) root.gatewayProtocol = gatewayProtocol;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
