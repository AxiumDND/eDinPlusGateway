// IEC 62386-202 emergency lighting via Volume 3 $XDALIAPP (device type 1).
(function (root) {
const EM_DEVICE_TYPE = 1;
const UBC_DEVCODE = 17;
const GROUP_A = 14;
const GROUP_B = 15;

const OPCODE = {
  REST: 224,
  START_FUNCTION_TEST: 227,
  START_DURATION_TEST: 228,
  STOP_TEST: 229,
  START_IDENTIFICATION: 240,
  QUERY_FAILURE_STATUS: 252,
  QUERY_EMERGENCY_STATUS: 253
};

const EMERGENCY_STATUS_BITS = [
  { bit: 0, key: 'inhibit', label: 'Inhibit mode' },
  { bit: 1, key: 'functionValid', label: 'Function test done and result valid' },
  { bit: 2, key: 'durationValid', label: 'Duration test done and result valid' },
  { bit: 3, key: 'batteryCharged', label: 'Battery fully charged' },
  { bit: 4, key: 'functionPending', label: 'Function test pending' },
  { bit: 5, key: 'durationPending', label: 'Duration test pending' },
  { bit: 6, key: 'identifyActive', label: 'Identification active' },
  { bit: 7, key: 'physicallySelected', label: 'Physically selected' }
];

const FAILURE_STATUS_BITS = [
  { bit: 0, key: 'circuit', label: 'Circuit failure' },
  { bit: 1, key: 'batteryDuration', label: 'Battery duration failure' },
  { bit: 2, key: 'battery', label: 'Battery failure' },
  { bit: 3, key: 'lamp', label: 'Emergency lamp failure' },
  { bit: 4, key: 'functionDelay', label: 'Function test max delay exceeded' },
  { bit: 5, key: 'functionFailed', label: 'Function test failed' },
  { bit: 6, key: 'durationDelay', label: 'Duration test max delay exceeded' },
  { bit: 7, key: 'durationFailed', label: 'Duration test failed' }
];

function pad(num, size) {
  return String(parseInt(num, 10) || 0).padStart(size, '0');
}

function formatShortAddr(shortAddr) {
  const n = parseInt(shortAddr, 10);
  if (!Number.isFinite(n) || n < 0) return '';
  return 'F' + pad(n, 2);
}

function parseShortAddr(token) {
  const raw = String(token || '').trim().toUpperCase();
  const m = raw.match(/^F(\d+)$/i);
  if (m) return parseInt(m[1], 10);
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function addToGroupOpcode(group) {
  return 96 + Number(group);
}

function groupsFromMask(mask) {
  const value = Number(mask) || 0;
  const groups = [];
  for (let i = 0; i < 16; i += 1) {
    if (value & (1 << i)) groups.push(i);
  }
  return groups;
}

function decodeBits(byte, table) {
  const value = Number(byte) || 0;
  const flags = {};
  table.forEach(item => {
    flags[item.key] = (value & (1 << item.bit)) !== 0;
  });
  return flags;
}

function parseEmergencyStatus(byte) {
  return decodeBits(byte, EMERGENCY_STATUS_BITS);
}

function parseFailureStatus(byte) {
  return decodeBits(byte, FAILURE_STATUS_BITS);
}

function fittingOutcome(emergency, failure) {
  const fail = parseFailureStatus(failure == null ? 0 : failure);
  const em = parseEmergencyStatus(emergency == null ? 0 : emergency);
  const failed = Object.keys(fail).some(key => fail[key]);
  const allGood = em.functionValid && em.durationValid && em.batteryCharged && !failed;
  return { emergency: em, failure: fail, failed, allGood };
}

function extractGatewayLines(text) {
  return String(text || '').split(/\r\n|\n|;/).map(s => s.trim()).filter(Boolean);
}

function gatewayBangLine(line, token) {
  const upper = String(line || '').toUpperCase();
  const needle = '!' + token;
  const at = upper.indexOf(needle);
  if (at === -1) return '';
  return String(line).slice(at);
}

function parseDaliFixLines(text) {
  return extractGatewayLines(text).map(line => {
    const raw = gatewayBangLine(line, 'DALIFIX,');
    if (!raw) return null;
    const parts = raw.replace(/;$/, '').split(',');
    if (parts.length < 8) return null;
    const short = parseShortAddr(parts[3]);
    if (short == null) return null;
    return {
      addr: pad(parts[1], 3),
      devcode: pad(parts[2], 3),
      shortAddr: short,
      longAddr: parts[4],
      groups: groupsFromMask(parts[5]),
      type: parseInt(parts[6], 10) || 0,
      fixtureStatus: parseInt(parts[7], 10) || 0
    };
  }).filter(Boolean);
}

function parseXdaliAppLines(text) {
  return extractGatewayLines(text).map(line => {
    const raw = gatewayBangLine(line, 'XDALIAPP');
    if (!raw) return null;
    const parts = raw.replace(/;$/, '').split(',');
    if (parts.length < 8) return null;
    return {
      addr: pad(parts[1], 3),
      devcode: pad(parts[2], 3),
      daliId: String(parts[3] || '').toUpperCase(),
      shortAddr: parseShortAddr(parts[3]),
      opcode: parseInt(parts[4], 10),
      deviceType: parseInt(parts[5], 10),
      data: parseInt(parts[6], 10),
      status: parseInt(parts[7], 10)
    };
  }).filter(Boolean);
}

function xdaliAppCommand(kind, addr, devcode, daliId, opcode) {
  const a = pad(addr, 3);
  const d = pad(devcode || UBC_DEVCODE, 3);
  const prefix = kind === 'query' ? '?' : '$';
  const name = kind === 'twice' ? 'XDALIAPPX2' : 'XDALIAPP';
  return prefix + name + ',' + a + ',' + d + ',' + daliId + ',' + opcode + ',' + EM_DEVICE_TYPE + ';';
}

function xdaliAddToGroup(addr, devcode, shortAddr, group) {
  return '$XDALIX2,' + pad(addr, 3) + ',' + pad(devcode || UBC_DEVCODE, 3) + ',' +
    formatShortAddr(shortAddr) + ',' + addToGroupOpcode(group) + ';';
}

function showDaliFixture(addr, devcode, shortAddr) {
  return '$SHOWDALI,' + pad(addr, 3) + ',' + pad(devcode || UBC_DEVCODE, 3) + ',' +
    formatShortAddr(shortAddr) + ';';
}

function showDaliOff(addr, devcode) {
  return '$SHOWOFF,' + pad(addr, 3) + ',' + pad(devcode || UBC_DEVCODE, 3) + ';';
}

const emDali = {
  EM_DEVICE_TYPE,
  UBC_DEVCODE,
  GROUP_A,
  GROUP_B,
  OPCODE,
  EMERGENCY_STATUS_BITS,
  FAILURE_STATUS_BITS,
  pad,
  formatShortAddr,
  parseShortAddr,
  addToGroupOpcode,
  groupsFromMask,
  parseEmergencyStatus,
  parseFailureStatus,
  fittingOutcome,
  parseDaliFixLines,
  parseXdaliAppLines,
  xdaliAppCommand,
  xdaliAddToGroup,
  showDaliFixture,
  showDaliOff
};

if (typeof module !== 'undefined' && module.exports) module.exports = emDali;
if (root) root.emDali = emDali;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
