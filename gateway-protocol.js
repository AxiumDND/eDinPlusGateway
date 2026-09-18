// Shared gateway parsing and Control helpers. Safe to load in the browser or Node.

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

function isOffScene(scene) {
  return !scene || String(scene.name || '').trim().toLowerCase() === 'off';
}

function parseAreaResponse(responseText) {
  const areas = [];
  String(responseText || '').split(/[\r\n]+/).forEach(line => {
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
  String(responseText || '').split(/[\r\n]+/).forEach(line => {
    line = line.trim();
    if (!line.startsWith('!SCNNAME,')) return;
    if (line.endsWith(';')) line = line.slice(0, -1);
    const parts = line.split(',');
    if (parts.length < 5) return;
    const scnNum = parts[1].trim();
    const scnName = parts[4].trim();
    if (scnName !== '') scenes.push({ num: scnNum, name: scnName });
  });
  return scenes;
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
  isOffScene,
  parseAreaResponse,
  parseSceneResponse,
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
if (typeof window !== 'undefined') {
  window.gatewayProtocol = gatewayProtocol;
}
