// renderer.js
const {
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
} = window.gatewayProtocol;

function getUserPrefix() {
  const username = document.getElementById('username')
    ? document.getElementById('username').value
    : (localStorage.getItem("USERNAME") || "Configurator");
  const password = document.getElementById('password')
    ? document.getElementById('password').value
    : (localStorage.getItem("PASSWORD") || "mode-x");
  console.log("DEBUG: getUserPrefix returns:", `$User,${username},${password};`);
  return `$User,${username},${password};`;
}


// =============================================================================
// Global Variables for DALI Operations (unchanged)
// =============================================================================
let daliBroadcastInterval = null;
let daliBSTInterval = null;
let daliBSTState = true;
let daliFittingEMIdentifyInterval = null;
let flashDaliFittingInterval = null;
let flashDaliFittingState = true;

function stepFittingId(delta) {
  const select = document.getElementById('dali-fitting-id');
  if (!select || !select.options.length) return;
  const max = select.options.length - 1;
  let next = select.selectedIndex + delta;
  if (next < 0) next = max;
  if (next > max) next = 0;
  select.selectedIndex = next;
}

function incrementFittingId() {
  stepFittingId(1);
}

function decrementFittingId() {
  stepFittingId(-1);
}

// =============================================================================
// Area Section Functions
// =============================================================================
function loadAreaNames() {
  createAreaTiles([]);
  sendCommand('?areanames;');
}


window.areaUi = window.areaUi || {
  selectedNum: null,
  selectedName: null,
  byArea: {},
  areas: [],
  view: 'home'
};

function getAreaState(areaNum) {
  if (!window.areaUi.byArea[areaNum]) {
    window.areaUi.byArea[areaNum] = { on: false, sceneName: '', sceneNum: null };
  }
  return window.areaUi.byArea[areaNum];
}

function findArea(areaNum) {
  return (window.areaUi.areas || []).find(a => String(a.num) === String(areaNum));
}

function showControlHome() {
  window.areaUi.view = 'home';
  const home = document.getElementById('controlHome');
  const room = document.getElementById('controlRoom');
  if (home) home.hidden = false;
  if (room) room.hidden = true;
  clearControlSceneChannels();
  if (window.areaUi.areas && window.areaUi.areas.length) {
    createAreaTiles(window.areaUi.areas);
  }
}

function showControlRoom(area) {
  window.areaUi.view = 'room';
  const home = document.getElementById('controlHome');
  const room = document.getElementById('controlRoom');
  if (home) home.hidden = true;
  if (room) room.hidden = false;
  const nameEl = document.getElementById('controlRoomName');
  if (nameEl) nameEl.textContent = area.name;
  refreshRoomHeader(area.num);
}

function refreshRoomHeader(areaNum) {
  const state = getAreaState(areaNum);
  const sceneEl = document.getElementById('controlRoomScene');
  if (sceneEl) {
    sceneEl.textContent = state.on && state.sceneName ? state.sceneName : '';
  }
  const power = document.getElementById('controlRoomPower');
  if (power) {
    power.classList.toggle('on', state.on);
    power.setAttribute('aria-pressed', state.on ? 'true' : 'false');
  }
}

function selectArea(area) {
  window.areaUi.selectedNum = String(area.num);
  window.areaUi.selectedName = area.name;
  showControlRoom(area);
  const areaNumInt = parseInt(area.num, 10);
  const scenePanel = document.getElementById('scenePanel');
  if (scenePanel) {
    scenePanel.innerHTML = '<div class="area-empty">Loading scenes…</div>';
  }
  if (typeof sendCommand === 'function') {
    sendCommand(`?SCNNAMES,${areaNumInt};`);
  }
  if (typeof window.createDemoScenes === 'function') {
    window.createDemoScenes();
  }
}

function toggleAreaPower(area, event) {
  if (event) event.stopPropagation();
  const state = getAreaState(area.num);
  const sceneNum = state.sceneNum;
  if (state.on) {
    state.on = false;
    if (sceneNum && typeof sendCommand === 'function') {
      sendCommand(`$SCNOFF,${sceneNum};`);
    }
  } else {
    state.on = true;
    if (sceneNum && typeof sendCommand === 'function') {
      sendCommand(`$SCNRECALL,${sceneNum};`);
    }
  }
  refreshAreaTile(area.num);
  if (window.areaUi.selectedNum === String(area.num)) {
    refreshRoomHeader(area.num);
    document.querySelectorAll('.scene-button').forEach(btn => {
      btn.classList.toggle('active', state.on && btn.dataset.sceneNum === String(state.sceneNum));
    });
    if (state.on && state.sceneNum) {
      showControlSceneChannels({ num: state.sceneNum, name: state.sceneName || 'Scene' });
    } else {
      clearControlSceneChannels();
    }
  }
}

function refreshAreaTile(areaNum) {
  const tile = document.querySelector(`.area-tile[data-area-num="${areaNum}"]`);
  if (!tile) return;
  const state = getAreaState(areaNum);
  tile.classList.toggle('is-on', state.on);
  tile.classList.toggle('is-off', !state.on);
  const sceneEl = tile.querySelector('.area-tile-scene');
  if (sceneEl) {
    sceneEl.textContent = state.on && state.sceneName ? state.sceneName : '';
  }
  const power = tile.querySelector('.area-power');
  if (power) {
    power.classList.toggle('on', state.on);
    power.setAttribute('aria-pressed', state.on ? 'true' : 'false');
  }
}

function persistAreaOrder(areas) {
  try {
    localStorage.setItem('CONTROL_AREA_ORDER', areas.map(a => String(a.num)).join(','));
  } catch (err) {
    console.warn('Could not persist area order', err);
  }
}

function applySavedAreaOrder(areas) {
  let order = '';
  try {
    order = localStorage.getItem('CONTROL_AREA_ORDER') || '';
  } catch (err) {
    order = '';
  }
  return sortAreasByOrder(areas, order);
}

function createAreaTileEl(area) {
  const state = getAreaState(area.num);
  const tile = document.createElement('div');
  tile.className = 'area-tile' + (state.on ? ' is-on' : ' is-off');
  tile.setAttribute('role', 'button');
  tile.tabIndex = 0;
  tile.draggable = true;
  tile.dataset.areaNum = String(area.num);

  const copy = document.createElement('div');
  copy.className = 'area-tile-copy';
  const name = document.createElement('div');
  name.className = 'area-tile-name';
  name.textContent = area.name;
  const scene = document.createElement('div');
  scene.className = 'area-tile-scene';
  scene.textContent = state.on && state.sceneName ? state.sceneName : '';
  copy.appendChild(name);
  copy.appendChild(scene);

  const power = document.createElement('button');
  power.type = 'button';
  power.className = 'area-power' + (state.on ? ' on' : '');
  power.setAttribute('aria-label', 'Toggle ' + area.name);
  power.setAttribute('aria-pressed', state.on ? 'true' : 'false');
  power.addEventListener('click', (event) => toggleAreaPower(area, event));

  tile.appendChild(copy);
  tile.appendChild(power);
  tile.addEventListener('click', () => {
    console.log('Tile clicked:', area.name, 'with area number:', area.num);
    selectArea(area);
  });
  tile.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectArea(area);
    }
  });
  tile.addEventListener('dragstart', (event) => {
    event.dataTransfer.setData('text/plain', String(area.num));
    tile.classList.add('dragging');
  });
  tile.addEventListener('dragend', () => tile.classList.remove('dragging'));
  tile.addEventListener('dragover', (event) => {
    event.preventDefault();
    tile.classList.add('drag-over');
  });
  tile.addEventListener('dragleave', () => tile.classList.remove('drag-over'));
  tile.addEventListener('drop', (event) => {
    event.preventDefault();
    tile.classList.remove('drag-over');
    const fromId = event.dataTransfer.getData('text/plain');
    const toId = String(area.num);
    if (!fromId || fromId === toId) return;
    const list = window.areaUi.areas.slice();
    const fromIdx = list.findIndex(a => String(a.num) === fromId);
    const toIdx = list.findIndex(a => String(a.num) === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    window.areaUi.areas = list;
    persistAreaOrder(list);
    createAreaTiles(list);
  });
  return tile;
}

function createAreaTiles(areas) {
  const container = document.getElementById('tileContainer');
  if (!container) {
    console.error('Tile container not found!');
    return;
  }
  const ordered = applySavedAreaOrder(areas);
  window.areaUi.areas = ordered;
  container.innerHTML = '';
  if (!ordered.length) {
    const empty = document.createElement('div');
    empty.className = 'area-empty';
    empty.textContent = 'No areas yet. Connect the gateway and open Control to load names.';
    container.appendChild(empty);
    return;
  }

  const hasZones = ordered.some(a => a.zone);
  if (!hasZones) {
    container.className = 'control-grid';
    ordered.forEach(area => container.appendChild(createAreaTileEl(area)));
    return;
  }

  container.className = 'control-zones';
  const zones = [];
  ordered.forEach(area => {
    const zoneName = area.zone || 'Areas';
    let zone = zones.find(z => z.name === zoneName);
    if (!zone) {
      zone = { name: zoneName, areas: [] };
      zones.push(zone);
    }
    zone.areas.push(area);
  });
  zones.forEach(zone => {
    const block = document.createElement('section');
    block.className = 'control-zone';
    const heading = document.createElement('h3');
    heading.className = 'control-zone-title';
    heading.textContent = zone.name;
    const grid = document.createElement('div');
    grid.className = 'control-grid';
    zone.areas.forEach(area => grid.appendChild(createAreaTileEl(area)));
    block.appendChild(heading);
    block.appendChild(grid);
    container.appendChild(block);
  });
}


// Add these variables at the top of the file
let currentRGBChannel = null;
let currentColorPickerMode = 'rgb';
let currentHue = 0;
let currentSaturation = 100;
let currentLightness = 50;
let colorWheelContext = null;
let isDragging = false;

// Add these variables at the top with other color-related variables
let currentTemperature = 1800; // Start with warm white
let tunableWhiteContext = null;
let isDraggingTunableWhite = false;

// Add this at the top level of the file, after other global variables
let nudgeIncrement = 5; // Default to 5%

function toggleNudgeIncrement() {
  nudgeIncrement = nudgeIncrement === 5 ? 1 : 5;
  // Update all toggle buttons to show current state
  document.querySelectorAll('.nudge-toggle').forEach(toggle => {
    toggle.textContent = nudgeIncrement + '%';
    toggle.title = `Click to switch to ${nudgeIncrement === 5 ? '1' : '5'}% increments`;
  });
}

// =============================================================================
// Add these functions for the color picker modal
// =============================================================================
function showColorPicker(channelDiv) {
  console.log('DEBUG: Opening color picker for channel:', channelDiv);
  
  const colorPickerModal = document.getElementById('colorPickerModal');
  const colorPreview = channelDiv.querySelector('.color-preview');
  const brightnessSlider = channelDiv.querySelector('.rgb-brightness-slider');
  
  // Store original values from the channel list item
  const originalColor = colorPreview ? colorPreview.style.backgroundColor : '#FF0000';
  const originalBrightness = brightnessSlider ? brightnessSlider.value : '100';
  
  console.log('DEBUG: Original values from channel list:', { originalColor, originalBrightness });
  
  // Store original values and channel reference in the modal
  colorPickerModal.dataset.originalColor = originalColor;
  colorPickerModal.dataset.originalBrightness = originalBrightness;
  colorPickerModal.dataset.channelDiv = channelDiv.id || 'channel-' + Math.random().toString(36).substr(2, 9);
  if (!channelDiv.id) {
    channelDiv.id = colorPickerModal.dataset.channelDiv;
  }
  
  // Show modal
  colorPickerModal.style.display = 'block';
  
  // Initialize color wheel (or other pickers) with current/original values from the modal dataset
  // This part ensures the modal's internal state reflects the channel clicked
  const modalPreview = document.querySelector('#colorPickerModal .color-preview-container .color-preview');
  const modalValueDisplay = document.querySelector('#colorPickerModal .color-preview-container .color-value');
  const modalBrightnessControl = document.querySelector('#colorPickerModal .brightness-slider');

  if (modalPreview) {
    modalPreview.style.backgroundColor = originalColor;
  }
  if (modalValueDisplay) {
    modalValueDisplay.textContent = originalColor;
  }
  if (modalBrightnessControl) {
    modalBrightnessControl.value = originalBrightness;
  }

  // Determine current tab and initialize appropriate picker
  const activeTab = document.querySelector('.color-picker-tab.active');
  const tabType = activeTab ? activeTab.dataset.tab : 'rgb';

  if (tabType === 'rgb') {
    initColorWheel(); // This might need to parse originalColor to set hue/saturation
    // If originalColor is hex, convert to HSL and set currentHue, currentSaturation, currentLightness
    if (originalColor.startsWith('#')) {
        const rgb = hexToRgb(originalColor); // Assuming hexToRgb exists
        if (rgb) {
            const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b); // Assuming rgbToHsl exists
            currentHue = hsl.h;
            currentSaturation = hsl.s;
            // currentLightness is handled by the modal's brightness slider,
            // which is already set to originalBrightness.
            // updateColorPreview will use currentHue, currentSaturation, and the slider's value.
        }
    }
    updateColorPreview(); // Update thumb and modal preview based on HSL
  } else if (tabType === 'white') {
    initTunableWhiteWheel();
    // If originalColor is rgb(r,g,b), try to find a matching temperature or default
    // For simplicity, we'll let it default to currentTemperature or be set by user.
    updateTunableWhitePreview(); // Update based on currentTemperature
    updateTunableWhiteThumbPosition();
  } else if (tabType === 'advanced') {
    // If originalColor is rgb(r,g,b) or hex, parse and set sliders
    let r=0, g=0, b=0;
    if (originalColor.startsWith('#')) {
        const parsedRgb = hexToRgb(originalColor);
        if (parsedRgb) ({r,g,b} = parsedRgb);
    } else if (originalColor.startsWith('rgb')) {
        const match = originalColor.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
        if (match) {
            r = parseInt(match[1],10); g = parseInt(match[2],10); b = parseInt(match[3],10);
        }
    }
    document.getElementById('advanced-r-slider').value = r;
    document.getElementById('advanced-g-slider').value = g;
    document.getElementById('advanced-b-slider').value = b;
    updateAdvancedRGBPreview();
  }
}

function hideColorPicker() {
  const colorPickerModal = document.getElementById('colorPickerModal');
  if (colorPickerModal) {
    colorPickerModal.style.display = 'none';
    // Clear stored values
    delete colorPickerModal.dataset.originalColor;
    delete colorPickerModal.dataset.originalBrightness;
    delete colorPickerModal.dataset.channelDiv;
  }
}


// Helper to refresh channel states for the current scene
function refreshChannelStates() {
  if (window.currentEditingScene && window.currentEditingScene.num) {
    setTimeout(() => {
      sendCommand(`?SCNCHANSTATES,${window.currentEditingScene.num};`);
    }, 500); // Wait 500ms for the gateway to process the change
  }
}


function applyRGBColor(channelDiv, color, brightness) {
  console.log('DEBUG: [applyRGBColor] Called with:', { color, brightness, channelDiv, channelId: channelDiv ? channelDiv.id : 'No ID' });

  if (!channelDiv || !channelDiv.dataset) {
    console.error('DEBUG: [applyRGBColor] Invalid channelDiv or missing dataset.');
    return;
  }

  // Update the color preview box in the main channel list immediately
  const channelListPreview = channelDiv.querySelector('.color-preview');
  if (channelListPreview) {
    console.log('DEBUG: [applyRGBColor] Forcing .color-preview backgroundColor to:', color);
    channelListPreview.style.backgroundColor = color;
  }

  // Update the brightness slider in the main channel list immediately
  const channelListSlider = channelDiv.querySelector('.rgb-brightness-slider');
  if (channelListSlider) {
    console.log('DEBUG: [applyRGBColor] Setting .rgb-brightness-slider value to:', brightness);
    channelListSlider.value = brightness; // brightness is 0-100
  }

  let rgb;
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    rgb = { r, g, b };
  } else if (color.startsWith('rgb')) {
    const match = color.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (match) {
      rgb = { r: parseInt(match[1], 10), g: parseInt(match[2], 10), b: parseInt(match[3], 10) };
    }
  }

  if (rgb) {
    const levelForGateway = pad(Math.round(parseInt(brightness, 10) * 2.55), 3); // brightness (0-100) to level (0-255), padded
    const hexColorForGateway = rgbToHex(rgb.r, rgb.g, rgb.b); // Get hex from the parsed r,g,b components of the input color

    console.log('DEBUG: [applyRGBColor] Using LEVEL,HEX format. Level:', levelForGateway, 'Hex:', hexColorForGateway);

    const addr = channelDiv.dataset.addr;
    const devcode = channelDiv.dataset.devcode;
    const channelNum = channelDiv.dataset.channelNum;
    const channelType = channelDiv.dataset.type ? channelDiv.dataset.type.toUpperCase() : '';

    console.log('DEBUG: [applyRGBColor] Checking channelType for command decision:', {
        original: channelDiv.dataset.type,
        uppercased: channelType,
        addr,
        devcode,
        channelNum,
        inputColor: color,
        inputBrightness: brightness,
        parsedRgb: rgb
    });

    let colorCommand = null;
    let brightnessCommand = null; // For DMX channels, brightness will be a separate command

    if (addr && devcode && channelNum) {
        const hexColorFromPicker = rgbToHex(rgb.r, rgb.g, rgb.b); // Pure color from picker
        const fadeTime = 0; // Immediate change

        if (channelType.includes('DMX') && channelType.includes('RGB')) {
            colorCommand = `$DMXRGBCOLRFADE,${addr},${devcode},${channelNum},${hexColorFromPicker},${fadeTime};`;
            console.log('DEBUG: [applyRGBColor] DMX RGB: Prepared color cmd (DMXRGBCOLRFADE):', colorCommand);

            const dmxLevel = pad(Math.round(parseInt(brightness, 10) * 2.55), 3); // Brightness 0-100 to DMX level 0-255
            brightnessCommand = `$DMXFADE,${addr},${devcode},${channelNum},${dmxLevel},${fadeTime};`;
            console.log('DEBUG: [applyRGBColor] DMX RGB: Prepared brightness cmd (DMXFADE):', brightnessCommand);

        } else if (channelType.includes('CHAN') && channelType.includes('RGB')) {
            // For CHANRGBCOLRFADE, the hex color should incorporate brightness
            const brightnessFactor = parseInt(brightness, 10) / 100;
            const adjR = Math.round(rgb.r * brightnessFactor);
            const adjG = Math.round(rgb.g * brightnessFactor);
            const adjB = Math.round(rgb.b * brightnessFactor);
            const hexColorWithBrightness = rgbToHex(adjR, adjG, adjB);

            colorCommand = `$CHANRGBCOLRFADE,${addr},${devcode},${channelNum},${hexColorWithBrightness},${fadeTime};`;
            console.log('DEBUG: [applyRGBColor] CHAN RGB: Prepared color cmd (CHANRGBCOLRFADE with brightness):', colorCommand);
        } else {
            console.error('DEBUG: [applyRGBColor] Unknown or unsupported RGB channel type:', channelType, 'for channel:', channelDiv.dataset);
            hideColorPicker();
            return;
        }

        if (colorCommand) {
            console.log('DEBUG: Sending color command:', { command: colorCommand });
            sendCommand(colorCommand);
        }
        if (brightnessCommand) { // Only for DMX RGB
            console.log('DEBUG: Sending brightness command:', { command: brightnessCommand });
            sendCommand(brightnessCommand);
        }

        // Call refreshChannelStates after a short delay
        setTimeout(() => {
            if (window.currentEditingScene && window.currentEditingScene.num) {
                refreshChannelStates(window.currentEditingScene.num);
            } else {
                console.warn('[applyRGBColor] Cannot refresh states: currentEditingScene or scene number is not defined.');
            }
        }, 750); // Increased delay slightly to allow both commands to process if DMX

    } else {
        console.error('DEBUG: [applyRGBColor] Missing addr, devcode, or channelNum for channel:', channelDiv.dataset);
    }
  } else {
    console.error('DEBUG: [applyRGBColor] Invalid color format, could not parse to RGB:', color);
  }
  hideColorPicker(); // Always hide after attempting to apply
}

function updateColorPreview() {
  const preview = document.querySelector('.color-preview-container .color-preview');
  const valueDisplay = document.querySelector('.color-preview-container .color-value');
  const color = hslToHex(currentHue, currentSaturation, currentLightness);
  
  if (preview) {
    preview.style.backgroundColor = color;
  }
  
  if (valueDisplay) {
    valueDisplay.textContent = color;
  }
  
  // Update thumb position
  updateThumbPosition();
}

function updateBrightness(e) {
  currentLightness = e.target.value;
  updateColorPreview();
  
  // Also update the brightness slider in the channel list
  const colorPickerModal = document.getElementById('colorPickerModal');
  const channelDiv = colorPickerModal.dataset.channelDiv;
  if (channelDiv) {
    const brightnessSlider = channelDiv.querySelector('.rgb-brightness-slider');
    if (brightnessSlider) {
      brightnessSlider.value = currentLightness;
    }
  }
}

function syncSliderFill(slider) {
  if (!slider || slider.type !== 'range') return;
  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);
  const val = parseFloat(slider.value);
  const lo = Number.isFinite(min) ? min : 0;
  const hi = Number.isFinite(max) ? max : 100;
  const pct = hi === lo ? 0 : ((val - lo) / (hi - lo)) * 100;
  slider.style.setProperty('--fill', sliderFillPercent(lo, hi, val).toFixed(2) + '%');
}

function bindSliderFill(slider) {
  if (!slider) return;
  slider.classList.add('ds-slider');
  slider.addEventListener('input', () => syncSliderFill(slider));
  syncSliderFill(slider);
}

function createChannelFlashButton(channelDiv) {
  const flash = document.createElement('button');
  flash.type = 'button';
  flash.className = 'channel-flash-btn';
  flash.textContent = 'Flash';
  flash.addEventListener('click', () => {
    flash.classList.add('is-on');
    sendOneChannelLevel(channelDiv);
    setTimeout(() => flash.classList.remove('is-on'), 350);
  });
  return flash;
}

function createChannelNudgeGroup(getSlider) {
  const group = document.createElement('div');
  group.className = 'channel-nudge-group';

  const nudgeDown = document.createElement('button');
  nudgeDown.type = 'button';
  nudgeDown.classList.add('nudge-button');
  nudgeDown.textContent = '−';
  nudgeDown.title = 'Decrease level';
  nudgeDown.addEventListener('click', () => {
    const slider = getSlider();
    nudgeSlider(slider, -1);
    const row = slider && slider.closest('.channel-item');
    if (row) sendOneChannelLevel(row);
  });

  const nudgeToggle = document.createElement('button');
  nudgeToggle.type = 'button';
  nudgeToggle.classList.add('nudge-toggle');
  nudgeToggle.textContent = nudgeIncrement + '%';
  nudgeToggle.title = `Click to switch to ${nudgeIncrement === 5 ? '1' : '5'}% increments`;
  nudgeToggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleNudgeIncrement();
  });

  const nudgeUp = document.createElement('button');
  nudgeUp.type = 'button';
  nudgeUp.classList.add('nudge-button');
  nudgeUp.textContent = '+';
  nudgeUp.title = 'Increase level';
  nudgeUp.addEventListener('click', () => {
    const slider = getSlider();
    nudgeSlider(slider, 1);
    const row = slider && slider.closest('.channel-item');
    if (row) sendOneChannelLevel(row);
  });

  group.appendChild(nudgeDown);
  group.appendChild(nudgeToggle);
  group.appendChild(nudgeUp);
  return group;
}

function populateChannelList(channels, targetId) {
  const channelList = document.getElementById(targetId || 'channelList');
  if (!channelList) return;
  channelList.innerHTML = '';
  
  channels.forEach(channel => {
    const channelDiv = document.createElement('div');
    channelDiv.classList.add('channel-item');
    
    channelDiv.dataset.channelNum = channel.chanNum;
    channelDiv.dataset.addr = channel.addr;
    channelDiv.dataset.devcode = channel.devcode;
    channelDiv.dataset.type = channel.type;
    channelDiv.dataset.category = getChannelCategory(channel.type);
    channelDiv.dataset.colortype = getColorType(channel.type);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'channel-view-name';
    nameSpan.textContent = channel.name;
    channelDiv.appendChild(nameSpan);

    const colorType = getColorType(channel.type);
    const sliderContainer = document.createElement('div');
    sliderContainer.classList.add('slider-container');

    if (colorType === 'RGB' || colorType === 'RGBW') {
      const colorPreview = document.createElement('div');
      colorPreview.classList.add('color-preview');
      colorPreview.onclick = () => showColorPicker(channelDiv);
      sliderContainer.appendChild(colorPreview);

      const brightnessSlider = document.createElement('input');
      brightnessSlider.type = 'range';
      brightnessSlider.min = '0';
      brightnessSlider.max = '100';
      brightnessSlider.value = '100';
      brightnessSlider.classList.add('rgb-brightness-slider');
      brightnessSlider.addEventListener('input', (e) => {
        const color = colorPreview.style.backgroundColor || '#FF0000';
        applyRGBColor(channelDiv, color, e.target.value);
      });
      brightnessSlider.addEventListener('change', () => sendOneChannelLevel(channelDiv));
      bindSliderFill(brightnessSlider);
      sliderContainer.appendChild(brightnessSlider);

      const percentSpan = document.createElement('span');
      percentSpan.classList.add('color-value', 'channel-percentage');
      percentSpan.textContent = '100%';
      brightnessSlider.addEventListener('input', () => {
        percentSpan.textContent = brightnessSlider.value + '%';
      });
      sliderContainer.appendChild(percentSpan);
      channelDiv.appendChild(sliderContainer);
      channelDiv.appendChild(createChannelFlashButton(channelDiv));
      channelDiv.appendChild(createChannelNudgeGroup(() => channelDiv.querySelector('.rgb-brightness-slider')));
    } else if (colorType === 'TW') {
      const tempSlider = document.createElement('input');
      tempSlider.type = 'range';
      tempSlider.min = '1800';
      tempSlider.max = '6500';
      tempSlider.step = '100';
      tempSlider.value = '3000';
      tempSlider.classList.add('temp-slider', 'channel-slider');
      const tempValue = document.createElement('span');
      tempValue.classList.add('temp-value', 'channel-percentage');
      tempValue.textContent = '3000K';
      tempSlider.addEventListener('input', () => {
        tempValue.textContent = tempSlider.value + 'K';
      });
      tempSlider.addEventListener('change', () => sendOneChannelLevel(channelDiv));
      bindSliderFill(tempSlider);
      sliderContainer.appendChild(tempSlider);
      sliderContainer.appendChild(tempValue);
      channelDiv.appendChild(sliderContainer);
      channelDiv.appendChild(createChannelFlashButton(channelDiv));
      channelDiv.appendChild(createChannelNudgeGroup(() => channelDiv.querySelector('.temp-slider')));
    } else {
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '255';
      slider.value = '0';
      slider.classList.add('channel-slider');

      const percentSpan = document.createElement('span');
      percentSpan.classList.add('channel-percentage');
      percentSpan.textContent = '0%';
      slider.addEventListener('input', () => {
        percentSpan.textContent = Math.round((parseInt(slider.value, 10) / 255) * 100) + '%';
      });
      slider.addEventListener('change', () => sendOneChannelLevel(channelDiv));
      bindSliderFill(slider);

      sliderContainer.appendChild(slider);
      sliderContainer.appendChild(percentSpan);
      channelDiv.appendChild(sliderContainer);
      channelDiv.appendChild(createChannelFlashButton(channelDiv));
      channelDiv.appendChild(createChannelNudgeGroup(() => channelDiv.querySelector('.channel-slider')));
    }
    
    channelList.appendChild(channelDiv);
  });
}

function nudgeSlider(slider, deltaSteps) {
  if (!slider) return;
  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);
  const current = parseFloat(slider.value) || 0;
  const lo = Number.isFinite(min) ? min : 0;
  const hi = Number.isFinite(max) ? max : 255;
  if (slider.classList.contains('temp-slider')) {
    const span = hi - lo;
    let next = current + (deltaSteps * nudgeIncrement / 100) * span;
    next = Math.round(next / 100) * 100;
    slider.value = Math.max(lo, Math.min(hi, next));
    slider.dispatchEvent(new Event('input'));
    return;
  }
  const currentPercent = Math.round(((current - lo) / (hi - lo)) * 100);
  let newPercent = currentPercent + (deltaSteps * nudgeIncrement);
  newPercent = Math.max(0, Math.min(100, newPercent));
  slider.value = Math.round(lo + (newPercent / 100) * (hi - lo));
  slider.dispatchEvent(new Event('input'));
  syncSliderFill(slider);
}

function updateChannelControls(states) {
  // New log: Check innerHTML of channelList before processing states
  const currentChannelListElement = document.getElementById('channelList');
  if (currentChannelListElement) {
    console.log('DEBUG: [updateChannelControls] Before processing states, #channelList.innerHTML:', currentChannelListElement.innerHTML);
    console.log('DEBUG: [updateChannelControls] Before processing states, #channelList.children.length:', currentChannelListElement.children.length);
     for (let i = 0; i < currentChannelListElement.children.length; i++) {
        const child = currentChannelListElement.children[i];
        console.log(`DEBUG: [updateChannelControls] Child ${i} in #channelList before loop: tagName=${child.tagName}, data-channum=${child.dataset ? child.dataset.channelNum : 'N/A'}, data-addr=${child.dataset ? child.dataset.addr : 'N/A'}, data-devcode=${child.dataset ? child.dataset.devcode : 'N/A'}`);
    }
  } else {
    console.warn('DEBUG: [updateChannelControls] #channelList element NOT FOUND before processing states.');
  }

  let firstStateProcessed = false; // Flag for one-time detailed logging

  states.forEach(state => {
    console.log(`DEBUG: [updateChannelControls] Processing state:`, JSON.parse(JSON.stringify(state))); // Log the current state
    
    // Construct a more specific selector using addr, devcode, and chanNum from the state
    const selector = `.channel-item[data-addr="${state.addr}"][data-devcode="${state.devcode}"][data-channel-num="${state.chanNum}"]`;
    
    if (!firstStateProcessed) {
        console.log(`INFO: [updateChannelControls] First state detailed check for selector: "${selector}"`);
        const listElem = document.getElementById('channelList');
        if (listElem) {
            const foundInList = listElem.querySelector(selector);
            console.log(`INFO: [updateChannelControls] Attempt via listElem.querySelector:`, foundInList);
            // Log all children of listElem for comparison
            console.log(`INFO: [updateChannelControls] Children of #channelList at this moment (${listElem.children.length} total):`);
            for (let i = 0; i < listElem.children.length; i++) {
                const child = listElem.children[i];
                console.log(`INFO: Child ${i}: data-addr="${child.dataset.addr}" data-devcode="${child.dataset.devcode}" data-channel-num="${child.dataset.channelNum}"`);
            }
        } else {
            console.warn('INFO: [updateChannelControls] #channelList not found for first state check.');
        }
        const foundInDocument = document.querySelector(selector);
        console.log(`INFO: [updateChannelControls] Attempt via document.querySelector:`, foundInDocument);
        firstStateProcessed = true;
    }
    
    const matches = document.querySelectorAll(selector);
    matches.forEach(channelDiv => updateOneChannelControl(channelDiv, state));
  });
}

function updateOneChannelControl(channelDiv, state) {
    console.log(`DEBUG: [updateChannelControls] For state (addr=${state.addr}, dev=${state.devcode}, chan=${state.chanNum}), found channelDiv:`, channelDiv);
    
    if (channelDiv && channelDiv.dataset) { // Log the dataset of the found div for verification
        console.log(`DEBUG: [updateChannelControls] Found channelDiv's dataset:`, JSON.parse(JSON.stringify(channelDiv.dataset)));
    }

    if (channelDiv) {
      const category = channelDiv.dataset.category;
      const colorType = channelDiv.dataset.colortype;
      
      if (category === "LEVEL") {
        const slider = channelDiv.querySelector('.channel-slider');
        const percent = Math.round((state.current / 255) * 100);
        if (slider) {
          slider.value = state.current;
          syncSliderFill(slider);
        }
        const percSpan = channelDiv.querySelector('.channel-percentage');
        if (percSpan) {
          percSpan.textContent = percent + "%";
        }
        const meterFill = channelDiv.querySelector('.channel-level-fill');
        if (meterFill) {
          meterFill.style.width = Math.max(0, Math.min(100, percent)) + "%";
        }
      }
      else if (category === "COLOR") {
        if (colorType === "RGB" || colorType === "RGBW") {
          const colorPreview = channelDiv.querySelector('.color-preview');
          const colorPickerInput = channelDiv.querySelector('.color-picker'); // Input type=color, if exists
          const colorValueSpan = channelDiv.querySelector('.color-value');   // Span for text, if exists

          if (colorPreview && state.current != null) { // Ensure state.current is not null or undefined
            let gatewayColorValue = String(state.current).trim(); // Ensure it's a string and trimmed
            let colorToDisplay = null;
            let whiteLevelForRGBW = 0; // For RGBW

            // Handle potential RGBW format like "#RRGGBB,W"
            if (colorType === "RGBW" && gatewayColorValue.includes(',')) {
              const parts = gatewayColorValue.split(',');
              gatewayColorValue = parts[0].trim(); // RGB part
              if (parts.length > 1) {
                whiteLevelForRGBW = parseInt(parts[1], 10);
                if (isNaN(whiteLevelForRGBW)) whiteLevelForRGBW = 0;
              }
              console.log(`DEBUG: [updateChannelControls] RGBW state parsed - RGB: ${gatewayColorValue}, W: ${whiteLevelForRGBW}`);
            }

            if (gatewayColorValue.startsWith('#') && gatewayColorValue.length === 7) {
              colorToDisplay = gatewayColorValue;
            } else if (gatewayColorValue === '000') {
              colorToDisplay = '#000000'; // Interpret '000' as black
              console.log(`DEBUG: [updateChannelControls] Gateway sent '000' for chanNum ${state.chanNum}, interpreting as black.`);
            } else {
              console.warn(`DEBUG: [updateChannelControls] Invalid or unexpected color value '${gatewayColorValue}' from gateway for chanNum ${state.chanNum}. Preview will not be updated with this value.`);
              // colorToDisplay remains null, so the preview won't be set from this invalid value.
              // It will retain its current background (or default CSS if never set).
            }

            if (colorToDisplay) {
              console.log(`INFO: [updateChannelControls] Attempting to set .color-preview for chanNum ${state.chanNum} (${channelDiv.dataset.type}) to ${colorToDisplay}`);
              console.log(`INFO: [updateChannelControls] colorPreview element:`, colorPreview);
              console.log(`INFO: [updateChannelControls] BEFORE setting, .color-preview for chanNum ${state.chanNum} has backgroundColor: '${colorPreview.style.backgroundColor}'`);
              colorPreview.style.backgroundColor = colorToDisplay;
              console.log(`INFO: [updateChannelControls] AFTER setting, .color-preview for chanNum ${state.chanNum} has backgroundColor: '${colorPreview.style.backgroundColor}'`);
              
              // Optionally update other related UI elements if they exist
              if (colorPickerInput) {
                colorPickerInput.value = colorToDisplay;
              }
              if (colorValueSpan) {
                colorValueSpan.textContent = colorToDisplay.toUpperCase();
              }
              // Note: RGB sliders are in the modal, not directly in the channel list item,
              // so no need to update them here. They are updated when the modal opens.
            } else {
                 console.warn(`WARN: [updateChannelControls] colorToDisplay is null for chanNum ${state.chanNum} with gatewayValue '${gatewayColorValue}'. Preview not updated.`);
            }
            // If RGBW, and there's a white level slider in the channel list (currently not the case), update it here.
            // Example: if (colorType === "RGBW") { const whiteSlider = channelDiv.querySelector('.white-slider'); if(whiteSlider) whiteSlider.value = whiteLevelForRGBW; }

          } else {
            if (!colorPreview) console.warn(`DEBUG: [updateChannelControls] .color-preview div not found for chanNum ${state.chanNum}`);
            if (state.current == null) console.warn(`DEBUG: [updateChannelControls] No state.current (color value) from gateway for chanNum ${state.chanNum}. Preview not updated.`);
          }
        }
        else if (colorType === "TW") {
          // Update the temperature slider
          const tempSlider = channelDiv.querySelector('.temp-slider');
          const tempValueSpan = channelDiv.querySelector('.temp-value');
          
          if (state.current) {
            // Extract the temperature value from the format "#1800K"
            let tempValue = String(state.current);
            const tempMatch = tempValue.match(/(\d+)K/);
            if (tempMatch && tempMatch[1]) {
              const temp = parseInt(tempMatch[1], 10);
              if (!isNaN(temp) && temp >= 1800 && temp <= 6500) {
                if (tempSlider) {
                  tempSlider.value = temp;
                  tempSlider.dispatchEvent(new Event('input'));
                  syncSliderFill(tempSlider);
                }
                if (tempValueSpan) {
                  tempValueSpan.textContent = `${temp}K`;
                }
              }
            }
          }
        }
        else {
          // For unknown color types, just show the raw value
          const valueSpan = channelDiv.querySelector('.channel-percentage');
          if (valueSpan) {
            valueSpan.textContent = state.current;
          }
        }
      }
    }
}

// =============================================================================
// Scene Buttons
// =============================================================================
function createSceneButtons(scenes) {
  const container = document.getElementById('scenePanel') || document.querySelector('.scene-grid');
  if (!container) {
    console.error('Scene container not found!');
    return;
  }
  container.innerHTML = '';

  if (!scenes.length) {
    const empty = document.createElement('div');
    empty.className = 'area-empty';
    empty.textContent = 'No named scenes in this area.';
    container.appendChild(empty);
    clearControlSceneChannels();
    return;
  }

  const areaNum = window.areaUi.selectedNum;
  const areaState = areaNum ? getAreaState(areaNum) : null;

  scenes.forEach(scene => {
    const sceneContainer = document.createElement('div');
    sceneContainer.classList.add('scene-item');

    const sceneBtn = document.createElement('button');
    sceneBtn.classList.add('scene-button');
    sceneBtn.dataset.sceneNum = String(scene.num);
    sceneBtn.textContent = scene.name;
    if (areaState && areaState.on && String(areaState.sceneNum) === String(scene.num)) {
      sceneBtn.classList.add('active');
    }
    sceneBtn.addEventListener('click', () => {
      console.log('Scene button clicked:', scene.name, 'with scene number:', scene.num);
      const isOff = isOffScene(scene);
      if (areaNum) {
        const state = getAreaState(areaNum);
        state.sceneNum = scene.num;
        if (isOff) {
          state.on = false;
          state.sceneName = '';
          if (typeof sendCommand === 'function') {
            sendCommand(`$SCNOFF,${scene.num};`);
          }
        } else {
          state.on = true;
          state.sceneName = scene.name;
          if (typeof sendCommand === 'function') {
            sendCommand(`$SCNRECALL,${scene.num};`);
          }
        }
        refreshAreaTile(areaNum);
        refreshRoomHeader(areaNum);
      }
      container.querySelectorAll('.scene-button').forEach(btn => btn.classList.remove('active'));
      if (!isOff) sceneBtn.classList.add('active');
      showControlSceneChannels(scene);
    });

    const editBtn = document.createElement('button');
    editBtn.classList.add('scene-edit-button');
    editBtn.setAttribute('aria-label', 'Adjust ' + scene.name);
    editBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17.2V20h2.8l8.2-8.2-2.8-2.8L4 17.2zm13.6-8.2c.3-.3.3-.8 0-1.1l-1.5-1.5c-.3-.3-.8-.3-1.1 0l-1.2 1.2 2.8 2.8 1-1.4z" fill="currentColor"/></svg>';
    editBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      console.log('Edit button clicked for scene:', scene);
      openSceneEditModal(scene);
    });

    sceneContainer.appendChild(sceneBtn);
    sceneContainer.appendChild(editBtn);
    container.appendChild(sceneContainer);
  });

  if (areaState && areaState.on && areaState.sceneNum) {
    const active = scenes.find(s => String(s.num) === String(areaState.sceneNum));
    if (active) showControlSceneChannels(active);
    else clearControlSceneChannels();
  } else {
    clearControlSceneChannels();
  }
}

function getDemoSceneChannels(scene) {
  const presets = {
    '11': { levels: [200, 90], tw: '#2200K', rgb: '#FF8A3D' },
    '12': { levels: [255, 210], tw: '#4000K', rgb: '#FFF4E0' },
    '21': { levels: [170, 50], tw: '#2000K', rgb: '#FF6A00' },
    '22': { levels: [230, 190], tw: '#4500K', rgb: '#FFE8B0' }
  };
  const preset = presets[String(scene && scene.num)] || { levels: [180, 120], tw: '#3000K', rgb: '#FFAA55' };
  return {
    channels: [
      { type: 'CHANNAME', addr: '001', devcode: '12', chanNum: '001', name: 'Downlights' },
      { type: 'CHANNAME', addr: '001', devcode: '12', chanNum: '002', name: 'Pendants' },
      { type: 'CHANTWCOLRNAME', addr: '001', devcode: '17', chanNum: '003', name: 'Cove TW' },
      { type: 'CHANRGBCOLRNAME', addr: '001', devcode: '17', chanNum: '004', name: 'Feature RGB' }
    ],
    states: [
      { addr: '001', devcode: '12', chanNum: '001', current: preset.levels[0] },
      { addr: '001', devcode: '12', chanNum: '002', current: preset.levels[1] },
      { addr: '001', devcode: '17', chanNum: '003', current: preset.tw },
      { addr: '001', devcode: '17', chanNum: '004', current: preset.rgb }
    ]
  };
}

function clearControlSceneChannels() {
  window.viewingScene = null;
  const section = document.getElementById('controlChannelSection');
  const list = document.getElementById('controlChannelList');
  if (section) section.hidden = true;
  if (list) list.innerHTML = '';
}

function showControlSceneChannels(scene) {
  const isOff = isOffScene(scene);
  if (isOff) {
    clearControlSceneChannels();
    return;
  }

  window.viewingScene = scene;
  const section = document.getElementById('controlChannelSection');
  if (section) section.hidden = false;

  const list = document.getElementById('controlChannelList');
  if (list && !list.querySelector('.channel-item')) {
    list.innerHTML = '<div class="area-empty">Loading channels…</div>';
  }

  if (typeof sendCommand === 'function') {
    sendCommand(`?SCNCHANNAMES,${scene.num};`);
  }

  if (typeof window.createDemoScenes === 'function') {
    const demo = getDemoSceneChannels(scene);
    populateChannelList(demo.channels, 'controlChannelList');
    updateChannelControls(demo.states);
  }
}

// =============================================================================
// Modal Functions
// =============================================================================
function openSceneEditModal(scene) {
  document.getElementById('modalSceneId').textContent = scene.num;
  document.getElementById('modalSceneName').textContent = scene.name;
  document.getElementById('channelList').innerHTML = "";
  document.getElementById('sceneEditModal').style.display = 'flex';
  
  // Ensure scrolling works properly
  document.body.style.overflow = 'hidden'; // Prevent body scrolling when modal is open
  
  window.currentEditingScene = scene;
  
  // 1) Trigger the scene with a fast fade.
  sendCommand(`$SCNRECALLX,${scene.num},255,1000;`);
  
  // 2) Wait 500ms, then request channel names.
  //    SCNCHANSTATES will be requested AFTER channel names are processed and list is populated.
  setTimeout(() => {
    sendCommand(`?SCNCHANNAMES,${scene.num};`);
  }, 500);
  
  if (typeof window.createDemoScenes === 'function') {
    const demo = getDemoSceneChannels(scene);
    populateChannelList(demo.channels, 'channelList');
    updateChannelControls(demo.states);
  }
}

function closeSceneEditModal() {
  document.getElementById('sceneEditModal').style.display = 'none';
  document.body.style.overflow = ''; // Restore body scrolling when modal is closed
}

// =============================================================================
// Save & Send Buttons
// =============================================================================

/**
 * Sends a SCNSAVE command for the current scene, waits 500ms, then closes modal.
 */
function saveSceneAndClose() {
  if (!window.currentEditingScene) {
    console.warn("No currentEditingScene found. Aborting save.");
    closeSceneEditModal();
    return;
  }
  const sceneNum = window.currentEditingScene.num;
  // 1) Send $SCNSAVE,<scn-num>;
  sendCommand(`$SCNSAVE,${sceneNum};`);
  // 2) Wait 500ms, then close
  setTimeout(() => {
    closeSceneEditModal();
  }, 500);
}

/**
 * Sends channel commands for each channel in the modal.
 * Fade time is hard-coded to 1000ms for now (you can make it user-configurable).
 */
function flashControlSceneChannels() {
  sendSceneChannelLevels('#controlChannelList');
}

function sendSceneChannelLevels(listSelector) {
  const channelDivs = document.querySelectorAll((listSelector || '#channelList') + ' .channel-item');
  channelDivs.forEach(div => sendOneChannelLevel(div));
}

function sendOneChannelLevel(div) {
  if (!div) return;
  const fadeTime = 1000;
  {
    const category = div.dataset.category;      // "LEVEL" or "COLOR"
    const colorType = div.dataset.colortype;    // "RGB", "TW", or "UNKNOWN"
    const type = div.dataset.type.toUpperCase(); // e.g. "CHANNAME", "DMXNAME", "DALINAME", "DMXRGBCOLRNAME", "CHANRGBCOLRNAME"
    const addr = div.dataset.addr;
    const devcode = div.dataset.devcode;
    const chanNum = div.dataset.channelNum;
    
    let cmd = null;
    let brightnessCmd = null; // For DMX RGB
    
    if (category === "LEVEL") {
      // Retrieve the slider value for level-based channels
      const slider = div.querySelector('.channel-slider');
      if (!slider) return;
      const rawVal = parseInt(slider.value, 10) || 0;
      
      // Decide if we send CHANFADE, DMXFADE, or DALIFADE
      if (type.startsWith("CHANNAME")) {
        cmd = `$CHANFADE,${addr},${devcode},${chanNum},${rawVal},${fadeTime};`;
      } else if (type.startsWith("DMXNAME")) {
        cmd = `$DMXFADE,${addr},${devcode},${chanNum},${rawVal},${fadeTime};`;
      } else if (type.startsWith("DALINAME")) {
        cmd = `$DALIFADE,${addr},${devcode},${chanNum},${rawVal},${fadeTime};`;
      }
    }
    else if (category === "COLOR") {
      if (colorType === "RGB" || colorType === "RGBW") { // Includes RGBW as it's a subset of RGB behavior for now
        const colorPreviewElement = div.querySelector('.color-preview');
        const brightnessSliderElement = div.querySelector('.rgb-brightness-slider');

        if (!colorPreviewElement || !brightnessSliderElement) {
          console.warn("DEBUG: [sendSceneChannelLevels] Missing color preview or brightness slider for RGB channel:", div.dataset);
          return;
        }

        const colorString = colorPreviewElement.style.backgroundColor; // e.g., "rgb(255, 0, 0)" or "#ff0000"
        const brightnessPercent = parseInt(brightnessSliderElement.value, 10); // 0-100

        let r, g, b;
        if (colorString.startsWith('#')) {
          const result = hexToRgb(colorString);
          if (result) ({ r, g, b } = result);
        } else if (colorString.startsWith('rgb')) {
          const match = colorString.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
          if (match) {
            r = parseInt(match[1], 10);
            g = parseInt(match[2], 10);
            b = parseInt(match[3], 10);
          }
        }

        if (typeof r === 'undefined') {
          console.warn("DEBUG: [sendSceneChannelLevels] Could not parse color string:", colorString, "for channel:", div.dataset);
          return;
        }

        if (type.includes("DMX") && type.includes("RGB")) { // e.g., DMXRGBCOLRNAME
          const pureHexColor = rgbToHex(r, g, b);
          cmd = `$DMXRGBCOLRFADE,${addr},${devcode},${chanNum},${pureHexColor},${fadeTime};`;
          
          const dmxLevel = pad(Math.round(brightnessPercent * 2.55), 3); // 0-100 to 0-255
          brightnessCmd = `$DMXFADE,${addr},${devcode},${chanNum},${dmxLevel},${fadeTime};`;
          
          console.log(`DEBUG: [sendSceneChannelLevels] DMX RGB: ColorCmd=${cmd}, BrightnessCmd=${brightnessCmd}`);

        } else if (type.includes("CHAN") && type.includes("RGB")) { // e.g., CHANRGBCOLRNAME
          const brightnessFactor = brightnessPercent / 100.0;
          const adjR = Math.round(r * brightnessFactor);
          const adjG = Math.round(g * brightnessFactor);
          const adjB = Math.round(b * brightnessFactor);
          const hexColorWithBrightness = rgbToHex(adjR, adjG, adjB);
          
          cmd = `$CHANRGBCOLRFADE,${addr},${devcode},${chanNum},${hexColorWithBrightness},${fadeTime};`;
          console.log(`DEBUG: [sendSceneChannelLevels] CHAN RGB: Cmd=${cmd}`);
        } else {
          console.warn("DEBUG: [sendSceneChannelLevels] Unknown RGB channel type for 'Send' button:", type, div.dataset);
        }

      }
      else if (colorType === "TW") {
        // Get the temperature value from the slider
        const tempSlider = div.querySelector('.temp-slider'); // Assuming there's a temp-slider for TW channels
        if (!tempSlider) {
            console.warn("DEBUG: [sendSceneChannelLevels] TW channel missing temp-slider:", div.dataset);
            return;
        }
        const tempValue = tempSlider.value; // e.g., 1800
        
        // Send tunable white command
        if (type.startsWith("CHANTWCOLR")) { // e.g. CHANTWCOLRNAME
          cmd = `$CHANTWCOLR,${addr},${devcode},${chanNum},#${tempValue}K,${fadeTime};`;
          console.log(`DEBUG: [sendSceneChannelLevels] TW Cmd=${cmd}`);
        } else {
            console.warn("DEBUG: [sendSceneChannelLevels] Unknown TW channel type for 'Send' button:", type, div.dataset);
        }
      }
    }
    
    if (cmd) {
      console.log("Sending command:", cmd);
      sendCommand(cmd);
    }
    if (brightnessCmd) { // Only for DMX RGB
      console.log("Sending brightness command:", brightnessCmd);
      // Add a small delay if sending two commands for the same DMX channel to avoid overwhelming the gateway
      setTimeout(() => sendCommand(brightnessCmd), 50); 
    }
  }
}

// =============================================================================
// Settings Functions
// =============================================================================
function saveSettings() {
  const newSettings = {
    IP_ADDRESS: document.getElementById('ipAddress')
      ? document.getElementById('ipAddress').value
      : localStorage.getItem("IP_ADDRESS") || "192.168.1.100",
    USERNAME: document.getElementById('username')
      ? document.getElementById('username').value
      : localStorage.getItem("USERNAME") || "Configurator",
    PASSWORD: document.getElementById('password')
      ? document.getElementById('password').value
      : localStorage.getItem("PASSWORD") || "mode-x"
  };
  console.log("DEBUG: Saving Settings:", newSettings);
  window.electronAPI.updateSettings(newSettings);
  localStorage.setItem("IP_ADDRESS", newSettings.IP_ADDRESS);
  localStorage.setItem("USERNAME", newSettings.USERNAME);
  localStorage.setItem("PASSWORD", newSettings.PASSWORD);
}

function testConnection() {
  const prefix = getUserPrefix();
  const command = `${prefix}?VERSION;`;
  console.log("DEBUG: Sending Test Connection Command:", command);
  sendRawCommand(command);
}

function sendTestCommand() {
  const command = document.getElementById('testCommand').value;
  if (command) {
    sendCommand(command);
  }
}

function sendEventReportCommand(state) {
  const command = `$Events,${state};`;
  sendCommand(command);
  logMessage(`Sent Event Report ${state ? 'ON' : 'OFF'} command: ${command}`);
}

// =============================================================================
// Command Functions
// =============================================================================
function sendCommand(type) {
  try {
    const ip = localStorage.getItem("IP_ADDRESS") || "192.168.1.100";
    const connectionType = document.getElementById('connectionType')
      ? document.getElementById('connectionType').value
      : "http";
    const port = (connectionType === "tcp") ? 26 : 80;
    let url;
    if (connectionType === "tcp") {
      url = `${ip}:${port}`;
    } else {
      url = `http://${ip}:${port}/gateway?`;
    }
    const username = document.getElementById('username') ? document.getElementById('username').value : "";
    const password = document.getElementById('password') ? document.getElementById('password').value : "";
    let fullCommand = type;
    if (username && password) {
      fullCommand = `$User,${username},${password};` + type;
    }
    console.log("DEBUG: UI Sending Command:", fullCommand);
    console.log(`DEBUG: Connection Type: ${connectionType}, IP: ${ip}, Port: ${port}`);
    console.log(`DEBUG: URL: ${url}`);
    if (window.electronAPI) {
      window.electronAPI.sendCommand({ type: fullCommand, connection: connectionType, ip, port, url });
      console.log("DEBUG: Command sent via ipcRenderer.");
    } else {
      console.error("DEBUG: ipcRenderer (electronAPI) is NOT available! Check preload.js.");
    }
  } catch (error) {
    console.error("DEBUG: Error in sendCommand:", error);
  }
}

function sendKeypadCommand(buttonNumber) {
  const addr = document.getElementById('addr') ? document.getElementById('addr').value : "";
  const devcode = document.getElementById('devcode') ? document.getElementById('devcode').value : "";
  const state = document.getElementById('state') ? document.getElementById('state').value : "";
  const command = `$BTNSTATE,${addr},${devcode},${buttonNumber},${state};`;
  console.log("DEBUG: Sending Keypad Command:", command);
  sendCommand(command);
}

function sendChannelFadeCommand() {
  const addr = document.getElementById('channel-addr') ? document.getElementById('channel-addr').value : "";
  const devcode = document.getElementById('channel-devcode') ? document.getElementById('channel-devcode').value : "";
  const chanNum = document.getElementById('channel-num') ? document.getElementById('channel-num').value : "";
  const level = document.getElementById('channel-level') ? document.getElementById('channel-level').value : "";
  const fadetime = document.getElementById('channel-fadetime') ? document.getElementById('channel-fadetime').value : "";
  const command = `$CHANFADE,${addr},${devcode},${chanNum},${level},${fadetime};`;
  console.log("DEBUG: Sending Channel Fade Command:", command);
  sendCommand(command);
}

function sendRawCommand(message) {
  try {
    const ip = localStorage.getItem("IP_ADDRESS") || "192.168.1.100";
    const connectionType = document.getElementById('connectionType')
      ? document.getElementById('connectionType').value
      : "http";
    const port = (connectionType === "tcp") ? 26 : 80;
    let url;
    if (connectionType === "tcp") {
      url = `${ip}:${port}`;
    } else {
      url = `http://${ip}:${port}/gateway?`;
    }
    console.log("DEBUG: UI Sending Raw Command:", message);
    console.log(`DEBUG: URL for raw command: ${url}`);
    if (window.electronAPI) {
      window.electronAPI.sendCommand({ type: message, connection: connectionType, ip, port, url });
      console.log("DEBUG: Raw command sent via ipcRenderer.");
    } else {
      console.error("DEBUG: ipcRenderer (electronAPI) is NOT available! Check preload.js.");
    }
  } catch (error) {
    console.error("DEBUG: Error in sendRawCommand:", error);
  }
}

// =============================================================================
// Event Handlers
// =============================================================================
window.electronAPI.onLogMessage((message) => {
  console.log("DEBUG: UI Log Message Received:", message);
  
  // Handle button state messages
  if (message.startsWith('!BTNSTATE,')) {
    const parts = message.split(',');
    if (parts.length >= 2) {
      const plateAddress = parts[1];
      // Log the original message
      logMessage(message, "log-response");
      // Add the formatted plate message in green
      logMessage(`Plate ${plateAddress} Pressed`, "log-success");
    } else {
      logMessage(message, "log-response");
    }
  }
  // Handle input state messages
  else if (message.startsWith('!INPSTATE,')) {
    const parts = message.split(',');
    if (parts.length >= 4) {
      const address = parts[1];
      const input = parts[3];
      // Log the original message
      logMessage(message, "log-response");
      // Add the formatted input message in green
      logMessage(`INPUT ${address} Triggered ${input}`, "log-success");
    } else {
      logMessage(message, "log-response");
    }
  } 
  else {
    logMessage(message, "log-response");
  }
  
  if (message.includes("!AREANAME,")) {
    const areas = parseAreaResponse(message);
    createAreaTiles(areas);
  } 
  else if (message.includes("!SCNNAME,")) {
    const scenes = parseSceneResponse(message);
    createSceneButtons(scenes);
  }
  
  // If we got channel name data, build the channel list
  if (message.includes("SCNCHANNAMES") ||
      message.includes("!CHANNAME,") ||
      message.includes("!DMXNAME,") ||
      message.includes("!DMXRGBCOLRNAME,") ||
      message.includes("!CHANRGBCOLRNAME,") || // Added CHANRGBCOLRNAME
      message.includes("!DALINAME,") ||
      message.includes("!CHANTWCOLRNAME,")) {
    const channels = parseChannelNames(message);
    if(channels.length > 0) {
      const modal = document.getElementById('sceneEditModal');
      const modalOpen = modal && modal.style.display === 'flex';
      if (modalOpen) {
        populateChannelList(channels, 'channelList');
      }
      if (window.viewingScene && window.areaUi.view === 'room') {
        populateChannelList(channels, 'controlChannelList');
      }
      const sceneNum = (modalOpen && window.currentEditingScene && window.currentEditingScene.num)
        || (window.viewingScene && window.viewingScene.num);
      if (sceneNum) {
        console.log("DEBUG: [onLogMessage for SCNCHANNAMES] Channel list populated. Requesting SCNCHANSTATES for scene:", sceneNum);
        sendCommand(`?SCNCHANSTATES,${sceneNum};`);
      } else {
        console.warn("DEBUG: [onLogMessage for SCNCHANNAMES] Cannot request SCNCHANSTATES, no active scene.");
      }
    }
  }
  
  // If we got channel state data, update the channel controls
  if (message.includes("!CHANLEVEL,") ||
      message.includes("!DMXLEVEL,") ||
      message.includes("!DALILEVEL,") ||
      message.includes("!DMXRGBCOLR,") ||
      message.includes("!CHANRGBCOLR,") || // Added CHANRGBCOLR
      message.includes("!CHANTWCOLR,")) {
    const states = parseChannelStates(message);
    if(states.length > 0) {
      // updateChannelControls(states); // OLD WAY
      // NEW WAY: Delay updateChannelControls slightly to allow DOM to settle
      console.log("DEBUG: [onLogMessage for SCNCHANSTATES] States parsed. Delaying updateChannelControls slightly.");
      setTimeout(() => {
        console.log("DEBUG: [onLogMessage for SCNCHANSTATES] Executing delayed updateChannelControls.");
        updateChannelControls(states);
      }, 250); // Increased delay from 10ms to 250ms
    }
  }
  
  if (message.includes("!VERSION")) {
    logMessage("Connection Successful", "log-success");
  }
});

window.electronAPI.onLoadSettings((settings) => {
  console.log("DEBUG: Loaded settings:", settings);
  if (document.getElementById('ipAddress') && settings.IP_ADDRESS) {
    document.getElementById('ipAddress').value = settings.IP_ADDRESS;
  }
  if (document.getElementById('username') && settings.USERNAME) {
    document.getElementById('username').value = settings.USERNAME;
  }
  if (document.getElementById('password') && settings.PASSWORD) {
    document.getElementById('password').value = settings.PASSWORD;
  }
});

// =============================================================================
// Logging & Startup
// =============================================================================
function isLogBarVisible() {
  try {
    return localStorage.getItem('SHOW_LOG_BAR') === '1';
  } catch (err) {
    return false;
  }
}

function setLogBarVisible(visible) {
  try {
    localStorage.setItem('SHOW_LOG_BAR', visible ? '1' : '0');
  } catch (err) { /* ignore */ }
  applyLogBarVisibility(visible);
}

function applyLogBarVisibility(visible) {
  const show = typeof visible === 'boolean' ? visible : isLogBarVisible();
  document.body.classList.toggle('log-visible', show);
  const footer = document.getElementById('logBar');
  if (footer) footer.hidden = !show;
  const box = document.getElementById('showLogBar');
  if (box) box.checked = show;
}

function logMessage(message, type = "log-message") {
  const logElement = document.getElementById('log');
  if (!logElement) {
    console.error("DEBUG: Log container not found!");
    return;
  }
  const newMessage = document.createElement("div");
  newMessage.classList.add(type);
  newMessage.textContent = message;
  logElement.appendChild(newMessage);
  const logContainer = document.getElementById('log-container');
  if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
}

function clearLog() {
  console.log("DEBUG: Clearing Log...");
  if (document.getElementById('log')) {
    document.getElementById('log').textContent = "";
  }
}

// =============================================================================
// Global Channel Control Functions
// =============================================================================

/**
 * Sets all level-based channel sliders to a specific value (0-255)
 * For RGB channels, sets to either black (#000000) or white (#FFFFFF)
 * For TW channels, sets to either warm (1800K) or cool (6500K)
 * @param {number} value - The value to set (0-255)
 */
function setAllChannelsToValue(value) {
  // Set all level-based channel sliders
  const sliders = document.querySelectorAll('#channelList .channel-slider');
  sliders.forEach(slider => {
    slider.value = value;
    slider.dispatchEvent(new Event('input')); // Trigger the input event to update percentage display
  });
  
  // Set all RGB color pickers
  const colorPickers = document.querySelectorAll('#channelList .color-picker');
  colorPickers.forEach(picker => {
    // If value is 0, set to black, otherwise set to white
    picker.value = value === 0 ? '#000000' : '#FFFFFF';
    picker.dispatchEvent(new Event('input')); // Trigger the input event to update display
  });
  
  // Set all white sliders for RGBW channels
  const whiteSliders = document.querySelectorAll('#channelList .rgb-slider.white');
  whiteSliders.forEach(slider => {
    // If value is 0, set to 0, otherwise set to 255
    slider.value = value === 0 ? 0 : 255;
    slider.dispatchEvent(new Event('input')); // Trigger the input event to update display
    
    // Update the value display
    const valueSpan = slider.nextElementSibling;
    if (valueSpan) {
      valueSpan.textContent = slider.value;
    }
  });
  
  // Set all temperature sliders
  const tempSliders = document.querySelectorAll('#channelList .temp-slider');
  tempSliders.forEach(slider => {
    // If value is 0, set to warm (1800K), otherwise set to cool (6500K)
    slider.value = value === 0 ? 1800 : 6500;
    slider.dispatchEvent(new Event('input')); // Trigger the input event to update display
  });
}

/**
 * Nudges all level-based channel sliders by a specific percentage
 * @param {number} deltaPercent - The percentage to adjust by (positive or negative)
 */
function nudgeAllChannels(deltaPercent) {
  // Nudge all level-based channel sliders
  const sliders = document.querySelectorAll('#channelList .channel-slider');
  sliders.forEach(slider => {
    nudgeSlider(slider, deltaPercent);
  });
  
  // For temperature sliders, adjust by a proportional amount
  const tempSliders = document.querySelectorAll('#channelList .temp-slider');
  tempSliders.forEach(slider => {
    // Calculate the temperature range (6500 - 1800 = 4700)
    // and adjust by a proportional amount
    const tempRange = 4700;
    const tempDelta = Math.round((tempRange * deltaPercent) / 100);
    const currentTemp = parseInt(slider.value, 10);
    let newTemp = currentTemp + tempDelta;
    
    // Clamp to valid range
    if (newTemp < 1800) newTemp = 1800;
    if (newTemp > 6500) newTemp = 6500;
    
    slider.value = newTemp;
    slider.dispatchEvent(new Event('input')); // Trigger the input event to update display
  });
  
  // For white sliders in RGBW channels, nudge them like regular sliders
  const whiteSliders = document.querySelectorAll('#channelList .rgb-slider.white');
  whiteSliders.forEach(slider => {
    let currentValue = parseInt(slider.value, 10);
    let newValue = currentValue + Math.round((255 * deltaPercent) / 100);
    
    // Clamp to valid range
    if (newValue < 0) newValue = 0;
    if (newValue > 255) newValue = 255;
    
    slider.value = newValue;
    
    // Update the value display
    const valueSpan = slider.nextElementSibling;
    if (valueSpan) {
      valueSpan.textContent = slider.value;
    }
  });
  
  // For RGB color pickers, we don't nudge as it's not a linear scale
  // but we could implement brightness adjustment in the future if needed
}

// =============================================================================
// Color Wheel Functions
// =============================================================================
function initColorWheel() {
  const canvas = document.getElementById('colorWheel');
  if (!canvas) return;
  
  colorWheelContext = canvas.getContext('2d');
  drawColorWheel();
  
  // Add event listeners for the color wheel
  canvas.addEventListener('mousedown', startColorSelection);
  canvas.addEventListener('mousemove', updateColorSelection);
  document.addEventListener('mouseup', stopColorSelection);
  
  // Add event listener for brightness slider
  const brightnessSlider = document.querySelector('.brightness-slider');
  if (brightnessSlider) {
    brightnessSlider.addEventListener('input', updateBrightness);
  }
}

function drawColorWheel() {
  const canvas = document.getElementById('colorWheel');
  const ctx = colorWheelContext;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = canvas.width / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let angle = 0; angle < 360; angle++) {
    for (let saturation = 0; saturation < radius; saturation++) {
      const hue = angle;
      const lightness = 50;
      ctx.beginPath();
      ctx.arc(
        centerX + saturation * Math.cos(angle * Math.PI / 180),
        centerY + saturation * Math.sin(angle * Math.PI / 180),
        2,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = `hsl(${hue}, ${(saturation/radius)*100}%, ${lightness}%)`;
      ctx.fill();
    }
  }
}

function startColorSelection(e) {
  isDragging = true;
  updateColorFromPosition(e);
}

function updateColorSelection(e) {
  if (!isDragging) return;
  updateColorFromPosition(e);
}

function stopColorSelection() {
  isDragging = false;
}

function updateColorFromPosition(e) {
  const canvas = document.getElementById('colorWheel');
  const rect = canvas.getBoundingClientRect();
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  const x = e.clientX - rect.left - centerX;
  const y = e.clientY - rect.top - centerY;
  
  // Calculate hue and saturation from position
  const hue = ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  const saturation = Math.min(100, Math.sqrt(x*x + y*y) / (canvas.width/2) * 100);
  
  currentHue = hue;
  currentSaturation = saturation;
  
  updateColorPreview();
  updateThumbPosition();
}

function updateThumbPosition() {
  const canvas = document.getElementById('colorWheel');
  const thumb = document.querySelector('.color-wheel-thumb');
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = (canvas.width / 2) * (currentSaturation / 100);
  
  const angle = currentHue * Math.PI / 180;
  const x = centerX + radius * Math.cos(angle);
  const y = centerY + radius * Math.sin(angle);
  
  thumb.style.left = x + 'px';
  thumb.style.top = y + 'px';
}

function hslToHex(h, s, l) {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Add RGB to HSL conversion function
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return {
    h: h * 360,
    s: s * 100,
    l: l * 100
  };
}

// =============================================================================
// Window onload
// =============================================================================
window.onload = () => {
  console.log("DEBUG: UI Loaded - Fetching Settings...");
  window.electronAPI.requestSettings();
  
  // Initialize color picker buttons
  const initColorPickerButtons = () => {
    console.log('DEBUG: Initializing color picker buttons');
    const applyButton = document.getElementById('colorPickerApply');
    const cancelButton = document.getElementById('colorPickerCancel');
    
    if (applyButton && cancelButton) {
      console.log('DEBUG: Found color picker buttons');
      
      // Clone and replace to ensure fresh state for listeners
      const newApplyButton = applyButton.cloneNode(true);
      applyButton.parentNode.replaceChild(newApplyButton, applyButton);
      
      const newCancelButton = cancelButton.cloneNode(true);
      cancelButton.parentNode.replaceChild(newCancelButton, cancelButton);

      // Master Apply Handler
      newApplyButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const colorPickerModal = document.getElementById('colorPickerModal');
        if (!colorPickerModal || !colorPickerModal.dataset.channelDiv) {
            console.error("DEBUG: [Master Apply Handler] Modal or channelDiv ID is missing.");
            hideColorPicker();
            return;
        }
        const targetChannel = document.getElementById(colorPickerModal.dataset.channelDiv);

        if (!targetChannel) {
          console.error("DEBUG: [Master Apply Handler] Target channel not found for ID:", colorPickerModal.dataset.channelDiv);
          hideColorPicker();
          return;
        }
        
        console.log('DEBUG: [Master Apply Handler] Clicked. currentColorPickerMode:', currentColorPickerMode);

        let colorToApply;
        let brightnessToApply = 100; // Default brightness, especially for TW/Advanced

        if (currentColorPickerMode === 'advanced') {
          const r = parseInt(document.getElementById('advanced-r-slider').value, 10);
          const g = parseInt(document.getElementById('advanced-g-slider').value, 10);
          const b = parseInt(document.getElementById('advanced-b-slider').value, 10);
          colorToApply = `rgb(${r},${g},${b})`;
          console.log('DEBUG: [Master Apply Handler] Advanced mode values:', { r, g, b });
        } else if (currentColorPickerMode === 'white') {
          const preview = document.querySelector('#colorPickerModal .tunable-white-container .color-preview'); // specific selector
          if (preview) colorToApply = preview.style.backgroundColor;
          console.log('DEBUG: [Master Apply Handler] Tunable White mode preview color:', colorToApply);
        } else { // Default RGB mode ('rgb')
          const valueDisplay = document.querySelector('#colorPickerModal .color-wheel-container .color-preview-container .color-value');
          const brightnessSliderInModal = document.querySelector('#colorPickerModal .color-wheel-container .brightness-slider');

          if (valueDisplay) colorToApply = valueDisplay.textContent;
          if (brightnessSliderInModal) brightnessToApply = parseInt(brightnessSliderInModal.value, 10);
          console.log('DEBUG: [Master Apply Handler] RGB mode values:', { colorToApply, brightnessToApply });
        }

        if (colorToApply) {
          applyRGBColor(targetChannel, colorToApply, brightnessToApply);
        } else {
          console.warn("DEBUG: [Master Apply Handler] No color to apply for mode:", currentColorPickerMode);
        }
        
        hideColorPicker(); // Call hideColorPicker to clean up modal state
      });
      
      // Master Cancel Handler
      newCancelButton.addEventListener('click', (e) => {
        console.log('DEBUG: [Master Cancel Handler] Cancel button clicked');
        e.preventDefault();
        e.stopPropagation();
        
        const colorPickerModal = document.getElementById('colorPickerModal');
        const originalColor = colorPickerModal.dataset.originalColor;
        const originalBrightness = colorPickerModal.dataset.originalBrightness;
        
        console.log('DEBUG: [Master Cancel Handler] Restoring original values to modal:', {
          originalColor,
          originalBrightness
        });
        
        // Restore preview within the modal based on the active tab when cancelled
        const activeTabElement = document.querySelector('.color-picker-tab.active');
        const activeTabType = activeTabElement ? activeTabElement.dataset.tab : 'rgb';

        if (activeTabType === 'rgb') {
            const modalPreview = document.querySelector('#colorPickerModal .color-wheel-container .color-preview-container .color-preview');
            const modalValueDisplay = document.querySelector('#colorPickerModal .color-wheel-container .color-preview-container .color-value');
            const modalBrightnessControl = document.querySelector('#colorPickerModal .color-wheel-container .brightness-slider');
            if (modalPreview && originalColor) modalPreview.style.backgroundColor = originalColor;
            if (modalValueDisplay && originalColor) modalValueDisplay.textContent = originalColor;
            if (modalBrightnessControl && originalBrightness !== undefined) modalBrightnessControl.value = originalBrightness;
            // Also reset HSL values and update thumb for RGB wheel
            if (originalColor && originalColor.startsWith('#')) {
                const rgb = hexToRgb(originalColor);
                if (rgb) {
                    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
                    currentHue = hsl.h;
                    currentSaturation = hsl.s;
                    // currentLightness will be picked up from the slider by updateColorPreview
                }
            }
            updateColorPreview();

        } else if (activeTabType === 'white') {
            const modalPreview = document.querySelector('#colorPickerModal .tunable-white-container .color-preview');
            const modalValueDisplay = document.querySelector('#colorPickerModal .tunable-white-container .color-value');
            // Tunable white doesn't have a direct brightness slider in its section, color implies brightness
            // We might need to parse originalColor to find a temperature if possible, or reset to a default
            // For now, just reset to the color. The actual temperature state might be lost.
            if (modalPreview && originalColor) modalPreview.style.backgroundColor = originalColor;
            if (modalValueDisplay && originalColor) modalValueDisplay.textContent = originalColor; // Show the RGB value of originalColor
            // Reset currentTemperature to a default or try to derive from originalColor if desired
            // currentTemperature = 1800; // Example: reset to warmest
            // updateTunableWhitePreview();
            // updateTunableWhiteThumbPosition();

        } else if (activeTabType === 'advanced') {
            const modalPreview = document.querySelector('#colorPickerModal .advanced-rgb-container .color-preview');
            const modalValueDisplay = document.querySelector('#colorPickerModal .advanced-rgb-container .color-value');
            let r=0,g=0,b=0;
            if (originalColor) {
                if (originalColor.startsWith('#')) {
                    const parsedRgb = hexToRgb(originalColor);
                    if (parsedRgb) ({r,g,b} = parsedRgb);
                } else if (originalColor.startsWith('rgb')) {
                    const match = originalColor.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
                    if (match) {
                        r = parseInt(match[1],10); g = parseInt(match[2],10); b = parseInt(match[3],10);
                    }
                }
            }
            document.getElementById('advanced-r-slider').value = r;
            document.getElementById('advanced-g-slider').value = g;
            document.getElementById('advanced-b-slider').value = b;
            if (modalPreview) modalPreview.style.backgroundColor = `rgb(${r},${g},${b})`;
            if (modalValueDisplay) modalValueDisplay.textContent = `rgb(${r},${g},${b})`;
            updateAdvancedRGBPreview(); // Also updates slider value displays
        }
        hideColorPicker();
      });

    } else {
      console.warn('DEBUG: Color picker Apply or Cancel button not found in initColorPickerButtons');
    }
  };
  
  // Initialize color picker buttons after a short delay to ensure DOM is ready
  setTimeout(initColorPickerButtons, 200); // Increased delay slightly
  
  // "Save" button: send $SCNSAVE, then wait 500ms, then close
  const modalSaveButton = document.getElementById('modalSaveButton');
  if (modalSaveButton) {
    modalSaveButton.addEventListener('click', () => {
      saveSceneAndClose();
    });
  }
  
  // "Close" button: just close the modal
  const modalCloseButton = document.getElementById('modalCloseButton');
  if (modalCloseButton) {
    modalCloseButton.addEventListener('click', () => {
      closeSceneEditModal();
    });
  }

  // "Send" button: send fade commands for all channels
  const modalSendButton = document.getElementById('modalSendButton');
  if (modalSendButton) {
    modalSendButton.addEventListener('click', () => {
      sendSceneChannelLevels();
    });
  }
  
  // Global control buttons
  const allOffButton = document.getElementById('allOffButton');
  if (allOffButton) {
    allOffButton.addEventListener('click', () => {
      setAllChannelsToValue(0);
    });
  }
  
  const allOnButton = document.getElementById('allOnButton');
  if (allOnButton) {
    allOnButton.addEventListener('click', () => {
      setAllChannelsToValue(255);
    });
  }
  
  const nudgeAllDownButton = document.getElementById('nudgeAllDownButton');
  if (nudgeAllDownButton) {
    nudgeAllDownButton.addEventListener('click', () => {
      nudgeAllChannels(-5);
    });
  }
  
  const nudgeAllUpButton = document.getElementById('nudgeAllUpButton');
  if (nudgeAllUpButton) {
    nudgeAllUpButton.addEventListener('click', () => {
      nudgeAllChannels(5);
    });
  }
  
  // Demo for the channel fade slider in the Channel tab
  const channelLevel = document.getElementById('channel-level');
  const display = document.getElementById('channel-level-display');
  if (channelLevel && display) {
    bindSliderFill(channelLevel);
    channelLevel.addEventListener('input', function () {
      display.textContent = channelLevel.value;
    });
  }

  showSection('setup');
  
  // Populate Fitting ID dropdown (0 to 63)
  const fittingSelect = document.getElementById('dali-fitting-id');
  if (fittingSelect) {
    for (let i = 0; i < 64; i++) {
      const option = document.createElement('option');
      option.value = i;
      option.text = i;
      fittingSelect.appendChild(option);
    }
  }

  // Color picker tab switching
  const colorPickerTabs = document.querySelectorAll('.color-picker-tab');
  colorPickerTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabType = tab.dataset.tab;
      colorPickerTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const colorWheel = document.querySelector('.color-wheel-container');
      const tunableWhite = document.querySelector('.tunable-white-container');
      const advancedRGB = document.querySelector('.advanced-rgb-container');

      if (tabType === 'rgb') {
        colorWheel.style.display = 'block';
        tunableWhite.style.display = 'none';
        advancedRGB.style.display = 'none';
        currentColorPickerMode = 'rgb';
        initColorWheel();
      } else if (tabType === 'white') {
        colorWheel.style.display = 'none';
        tunableWhite.style.display = 'block';
        advancedRGB.style.display = 'none';
        currentColorPickerMode = 'white';
        setTimeout(() => { initTunableWhiteWheel(); updateTunableWhiteThumbPosition(); }, 0);
      } else if (tabType === 'advanced') {
        colorWheel.style.display = 'none';
        tunableWhite.style.display = 'none';
        advancedRGB.style.display = 'block';
        currentColorPickerMode = 'advanced';
        updateAdvancedRGBPreview();
      }
    });
  });

  // Initialize color wheel
  initColorWheel();

  // Initialize tunable white wheel
  initTunableWhiteWheel();
};

function initTunableWhiteWheel() {
  console.log('[DEBUG] initTunableWhiteWheel called');
  const twCanvas = document.getElementById('tunableWhiteCanvas');
  if (!twCanvas) {
    console.warn('[DEBUG] tunableWhiteCanvas not found');
    return;
  }

  tunableWhiteContext = twCanvas.getContext('2d');
  twCanvas.width = 200;
  twCanvas.height = 200;

  // Ensure the color pickers div exists
  let colorPickersDiv = document.getElementById('tunableWhiteColorPickers');
  if (!colorPickersDiv) {
    console.warn('[DEBUG] tunableWhiteColorPickers div not found, creating it');
    const container = twCanvas.closest('.tunable-white-container');
    colorPickersDiv = document.createElement('div');
    colorPickersDiv.id = 'tunableWhiteColorPickers';
    container.insertBefore(colorPickersDiv, container.firstChild);
  }
  colorPickersDiv.innerHTML = '';

  // Add color picker controls
  const colorControls = document.createElement('div');
  colorControls.classList.add('tunable-white-controls');

  // Cool color picker
  const coolControl = createColorPickerControl('Cool', tunableWhiteColors.cool, (color) => {
    tunableWhiteColors.cool = color;
    drawTunableWhiteWheel();
    updateTunableWhiteThumbPosition();
  });

  // Neutral color picker
  const neutralControl = createColorPickerControl('Neutral', tunableWhiteColors.neutral, (color) => {
    tunableWhiteColors.neutral = color;
    drawTunableWhiteWheel();
    updateTunableWhiteThumbPosition();
  });

  // Warm color picker
  const warmControl = createColorPickerControl('Warm', tunableWhiteColors.warm, (color) => {
    tunableWhiteColors.warm = color;
    drawTunableWhiteWheel();
    updateTunableWhiteThumbPosition();
  });

  colorControls.appendChild(coolControl);
  colorControls.appendChild(neutralControl);
  colorControls.appendChild(warmControl);

  colorPickersDiv.appendChild(colorControls);

  drawTunableWhiteWheel();
  updateTunableWhiteThumbPosition();

  // Attach mouse event handlers
  if (twCanvas) {
    twCanvas.onmousedown = startTunableWhiteSelection;
    twCanvas.onmousemove = updateTunableWhiteSelection;
    document.onmouseup = stopTunableWhiteSelection;
  }
  console.log('[DEBUG] Tunable white color pickers and wheel initialized');
}

function createColorPickerControl(label, initialColor, onChange) {
  const control = document.createElement('div');
  control.classList.add('tunable-white-color-control');
  
  const labelSpan = document.createElement('span');
  labelSpan.textContent = label;
  
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = initialColor;
  colorInput.addEventListener('input', (e) => {
    onChange(e.target.value);
  });
  
  control.appendChild(labelSpan);
  control.appendChild(colorInput);
  return control;
}

function drawTunableWhiteWheel() {
  if (!tunableWhiteContext) return;

  const twCanvas = tunableWhiteContext.canvas;
  const centerX = twCanvas.width / 2;
  const centerY = twCanvas.height / 2;
  const radius = Math.min(centerX, centerY) - 10;

  // Clear the canvas
  tunableWhiteContext.clearRect(0, 0, twCanvas.width, twCanvas.height);

  // Create a vertical linear gradient using the three user-selected colors
  const gradient = tunableWhiteContext.createLinearGradient(centerX, centerY - radius, centerX, centerY + radius);
  gradient.addColorStop(0, tunableWhiteColors.cool);    // Top
  gradient.addColorStop(0.5, tunableWhiteColors.neutral); // Middle
  gradient.addColorStop(1, tunableWhiteColors.warm);    // Bottom

  // Draw the gradient-filled circle
  tunableWhiteContext.fillStyle = gradient;
  tunableWhiteContext.beginPath();
  tunableWhiteContext.arc(centerX, centerY, radius, 0, Math.PI * 2);
  tunableWhiteContext.fill();

  // Draw border
  tunableWhiteContext.strokeStyle = '#666';
  tunableWhiteContext.lineWidth = 2;
  tunableWhiteContext.beginPath();
  tunableWhiteContext.arc(centerX, centerY, radius, 0, Math.PI * 2);
  tunableWhiteContext.stroke();
}

function temperatureToRGB(temp) {
  // Convert temperature to RGB using a more accurate approximation
  // This creates a proper warm-to-cool white gradient with orange and blue tints
  
  // Normalize temperature to 0-1 range
  const tempNorm = (temp - 1800) / (6500 - 1800);
  
  // Warm white (1800K) to cool white (6500K)
  // At 1800K: More orange/red tint
  // At 6500K: More blue tint
  
  // Red component: Decreases as temperature increases
  const r = Math.round(255 * (1 - tempNorm * 0.3));
  
  // Green component: Stays relatively constant
  const g = Math.round(255 * (0.9 - tempNorm * 0.1));
  
  // Blue component: Increases with temperature
  const b = Math.round(255 * (0.7 + tempNorm * 0.3));
  
  return { r, g, b };
}

function startTunableWhiteSelection(e) {
  isDraggingTunableWhite = true;
  updateTunableWhiteFromPosition(e);
}

function updateTunableWhiteSelection(e) {
  if (!isDraggingTunableWhite) return;
  updateTunableWhiteFromPosition(e);
}

function stopTunableWhiteSelection() {
  isDraggingTunableWhite = false;
}

function updateTunableWhiteFromPosition(e) {
  const twCanvas = document.getElementById('tunableWhiteCanvas');
  const rect = twCanvas.getBoundingClientRect();
  const centerX = twCanvas.width / 2;
  const centerY = twCanvas.height / 2;
  const radius = twCanvas.width / 2 - 10;
  const x = e.clientX - rect.left - centerX;
  const y = e.clientY - rect.top - centerY;
  // Only use vertical position for temperature
  let relY = y + radius;
  relY = Math.max(0, Math.min(2 * radius, relY));
  const tempNorm = 1 - (relY / (2 * radius));
  currentTemperature = Math.round(1800 + tempNorm * (6500 - 1800));
  console.log('[TW DEBUG] Mouse event:', {clientX: e.clientX, clientY: e.clientY, x, y, relY, tempNorm, currentTemperature});
  updateTunableWhitePreview();
  updateTunableWhiteThumbPosition();
}

function updateTunableWhitePreview() {
  const preview = document.querySelector('.tunable-white-container .color-preview');
  const valueDisplay = document.querySelector('.tunable-white-container .color-value');
  const twCanvas = document.getElementById('tunableWhiteCanvas');
  if (!twCanvas || !tunableWhiteContext) return;

  // Calculate thumb position
  const centerX = twCanvas.width / 2;
  const centerY = twCanvas.height / 2;
  const radius = twCanvas.width / 2 - 10;
  const tempNorm = (currentTemperature - 1800) / (6500 - 1800);
  const y = Math.round(centerY - radius + (1 - tempNorm) * (2 * radius));
  const x = Math.round(centerX);

  // Sample the color under the thumb
  let rgb = { r: 255, g: 255, b: 255 };
  try {
    const pixel = tunableWhiteContext.getImageData(x, y, 1, 1).data;
    rgb = { r: pixel[0], g: pixel[1], b: pixel[2] };
  } catch (e) {
    console.warn('Could not sample color from canvas:', e);
  }

  if (preview) {
    preview.style.backgroundColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  }
  if (valueDisplay) {
    valueDisplay.textContent = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  }
  window.currentTunableWhiteRGB = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
  console.log('[TW DEBUG] Preview RGB:', {currentTemperature, rgb});
}

function updateTunableWhiteThumbPosition() {
  const twCanvas = document.getElementById('tunableWhiteCanvas');
  const thumb = document.querySelector('.tunable-white-thumb');
  if (!twCanvas || !thumb) return;
  const centerX = twCanvas.width / 2;
  const centerY = twCanvas.height / 2;
  const radius = twCanvas.width / 2 - 10;
  // The thumb's center should match the wheel's center and radius
  const tempNorm = (currentTemperature - 1800) / (6500 - 1800);
  const y = centerY - radius + (1 - tempNorm) * (2 * radius);
  const x = centerX;
  // No need to clamp if the calculation is correct, but keep for safety
  const minY = centerY - radius;
  const maxY = centerY + radius;
  const clampedY = Math.max(minY, Math.min(maxY, y));
  thumb.style.left = `${x}px`;
  thumb.style.top = `${clampedY}px`;
  thumb.style.display = 'block';
  // Debug: log the wheel and thumb positions
  console.log('[TW DEBUG] Wheel center:', {centerX, centerY, radius});
  console.log('[TW DEBUG] Thumb position:', {x, y, clampedY, tempNorm, currentTemperature});
}

// Advanced RGB slider logic
function updateAdvancedRGBPreview() {
  const r = parseInt(document.getElementById('advanced-r-slider').value, 10);
  const g = parseInt(document.getElementById('advanced-g-slider').value, 10);
  const b = parseInt(document.getElementById('advanced-b-slider').value, 10);
  const preview = document.querySelector('.advanced-rgb-container .color-preview');
  const valueDisplay = document.querySelector('.advanced-rgb-container .color-value');
  if (preview) preview.style.backgroundColor = `rgb(${r},${g},${b})`;
  if (valueDisplay) valueDisplay.textContent = `rgb(${r},${g},${b})`;
  document.getElementById('advanced-r-value').textContent = r;
  document.getElementById('advanced-g-value').textContent = g;
  document.getElementById('advanced-b-value').textContent = b;
}

// Ensure Advanced RGB sliders update their value displays correctly and the preview
document.getElementById('advanced-r-slider').addEventListener('input', updateAdvancedRGBPreview);
document.getElementById('advanced-g-slider').addEventListener('input', updateAdvancedRGBPreview);
document.getElementById('advanced-b-slider').addEventListener('input', updateAdvancedRGBPreview);

let tunableWhiteColors = {
  cool: '#7575FF',    // rgb(117,117,255)
  neutral: '#FFFFFF', // White (middle)
  warm: '#FEB833'     // rgb(254,184,51)
};

function toggleSelectedRoomPower(event) {
  const area = findArea(window.areaUi.selectedNum);
  if (area) toggleAreaPower(area, event);
}
