const map = L.map('map').setView([39.8283, -98.5795], 4);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let markers = [];
let routeLines = [];
let depotMarker = null;

const VEHICLE_COLORS = ['#3b82f6', '#f97316', '#22c55e', '#8b5cf6', '#ec4899', '#06b6d4', '#eab308', '#f43f5e'];

function clearMap() {
  markers.forEach(marker => marker.remove());
  routeLines.forEach(line => line.remove());
  if (depotMarker) {
    depotMarker.remove();
  }
  markers = [];
  routeLines = [];
  depotMarker = null;
}

function createDepotMarker(lat, lng, address) {
  const icon = L.divIcon({
    className: 'depot-marker',
    html: 'D',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  const marker = L.marker([lat, lng], { icon }).addTo(map);
  marker.bindPopup(address);

  depotMarker = marker;
  return marker;
}

function createDeliveryMarker(lat, lng, address, number, color) {
  const icon = L.divIcon({
    className: 'delivery-marker',
    html: `${number}`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });

  const marker = L.marker([lat, lng], { icon }).addTo(map);
  marker.bindPopup(address);

  const el = marker.getElement();
  if (el && color) {
    el.style.backgroundColor = color;
  }

  markers.push(marker);
  return marker;
}

function drawStraightRoute(points) {
  const latLngs = points.map(point => [point.lat, point.lng]);

  const routeLine = L.polyline(latLngs, {
    color: '#3b82f6',
    weight: 4,
    opacity: 0.85
  }).addTo(map);
  routeLines.push(routeLine);

  const returnLine = L.polyline([latLngs[latLngs.length - 1], latLngs[0]], {
    color: '#3b82f6',
    weight: 2,
    opacity: 0.45,
    dashArray: '10, 10'
  }).addTo(map);
  routeLines.push(returnLine);
}

// Draws the actual road-following path from the Directions API, one leg at a time,
// in the given vehicle's color. legs.length === stops.length + 1: depot->stop1,
// stop1->stop2, ..., stopN->depot, so the last leg is styled as the dashed
// "return to depot" segment to match the existing visual language of drawStraightRoute.
function drawRoadRoute(legs, color) {
  legs.forEach((leg, index) => {
    if (!leg.path || leg.path.length === 0) {
      return;
    }
    const latLngs = leg.path.map(point => [point.lat, point.lng]);
    const isReturnLeg = index === legs.length - 1;

    const line = L.polyline(latLngs, isReturnLeg ? {
      color,
      weight: 2,
      opacity: 0.45,
      dashArray: '10, 10'
    } : {
      color,
      weight: 4,
      opacity: 0.85
    }).addTo(map);
    routeLines.push(line);
  });
}

function fitMapToMarkers() {
  const positions = [];

  if (depotMarker) {
    positions.push(depotMarker.getLatLng());
  }
  markers.forEach(marker => positions.push(marker.getLatLng()));

  const bounds = L.latLngBounds(positions);
  map.fitBounds(bounds, { padding: [50, 50] });
}

/* ---------- View tabs ---------- */
function setActiveView(view) {
  document.querySelectorAll('.view-tab').forEach(tab => {
    const isActive = tab.dataset.view === view;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  document.getElementById('map-panel').classList.toggle('is-hidden', view !== 'map');
  document.getElementById('results-section').classList.toggle('is-hidden', view !== 'list');

  if (view === 'map') {
    // Leaflet doesn't detect layout changes while its container is display:none,
    // so it renders blank/misaligned tiles until nudged after becoming visible again.
    // Re-fitting bounds here (rather than only right after Plan Route) also covers the
    // case where a route was planned while List View was active, since fitBounds()
    // computed against a hidden container can't be trusted.
    setTimeout(() => {
      map.invalidateSize();
      if (depotMarker || markers.length > 0) {
        fitMapToMarkers();
      }
    }, 0);
  }
}

function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* ---------- Form helpers ---------- */
function getDepotAddress() {
  return document.getElementById('depot-input').value.trim();
}

function getDeliveryAddresses() {
  const inputs = document.querySelectorAll('.delivery-input');
  return Array.from(inputs)
    .map(input => input.value.trim())
    .filter(value => value !== '');
}

function renumberDeliveryRows() {
  document.querySelectorAll('#delivery-list .delivery-row').forEach((row, index) => {
    row.querySelector('.delivery-number').textContent = index + 1;
  });
}

function updateDeliveryCount() {
  const count = document.querySelectorAll('#delivery-list .delivery-row').length;
  document.getElementById('delivery-count').textContent = `${count} stops`;
}

function updateRemoveButtonStates() {
  const rows = document.querySelectorAll('#delivery-list .delivery-row');
  const disableRemoval = rows.length <= 1;
  rows.forEach(row => {
    row.querySelector('.remove-btn').disabled = disableRemoval;
  });
}

function addDeliveryRow() {
  const list = document.getElementById('delivery-list');

  const row = document.createElement('div');
  row.className = 'delivery-row';

  const number = document.createElement('span');
  number.className = 'delivery-number';

  const wrapper = document.createElement('div');
  wrapper.className = 'autocomplete-wrapper';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'text-input delivery-input';
  input.placeholder = 'Enter delivery address';
  input.autocomplete = 'off';

  const suggestionList = document.createElement('div');
  suggestionList.className = 'autocomplete-list';

  wrapper.append(input, suggestionList);

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-btn';
  removeBtn.type = 'button';
  removeBtn.setAttribute('aria-label', 'Remove delivery');
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => removeDeliveryRow(removeBtn));

  row.append(number, wrapper, removeBtn);
  list.appendChild(row);

  attachAutocomplete(input);

  renumberDeliveryRows();
  updateDeliveryCount();
  updateRemoveButtonStates();
  setVehiclesError('');
}

function removeDeliveryRow(button) {
  const rows = document.querySelectorAll('#delivery-list .delivery-row');
  if (rows.length <= 1) {
    return;
  }

  const row = button.closest('.delivery-row');
  row.remove();
  renumberDeliveryRows();
  updateDeliveryCount();
  updateRemoveButtonStates();
  setVehiclesError('');
}

/* ---------- Distance unit toggle ---------- */
const KM_TO_MI = 0.621371;
let distanceUnit = 'km';
let totalDistanceKm = 0;

function convertKm(km, unit) {
  return unit === 'mi' ? km * KM_TO_MI : km;
}

function formatDistance(km, unit) {
  if (km === null || Number.isNaN(km)) {
    return '—';
  }
  return convertKm(km, unit).toFixed(1);
}

function renderDistanceStat() {
  document.getElementById('total-distance-display').textContent =
    convertKm(totalDistanceKm, distanceUnit).toFixed(1);
  document.getElementById('distance-unit-label').textContent =
    distanceUnit === 'mi' ? 'Miles' : 'Kilometers';
}

function renderRowDistances(row) {
  const legKm = row.dataset.legKm === '' || row.dataset.legKm === undefined
    ? null : parseFloat(row.dataset.legKm);
  const cumKm = row.dataset.cumKm === '' || row.dataset.cumKm === undefined
    ? null : parseFloat(row.dataset.cumKm);

  row.children[4].textContent = formatDistance(legKm, distanceUnit);
  row.children[5].textContent = formatDistance(cumKm, distanceUnit);
}

function setRowDistances(row, legKm, cumKm) {
  row.dataset.legKm = legKm === null || legKm === undefined ? '' : legKm;
  row.dataset.cumKm = cumKm === null || cumKm === undefined ? '' : cumKm;
  renderRowDistances(row);
}

function updateUnitHeaders() {
  const label = distanceUnit === 'mi' ? 'MI' : 'KM';
  document.getElementById('leg-header').textContent = `Leg ${label}`;
  document.getElementById('cum-header').textContent = `Cum ${label}`;
}

function updateUnitToggleUI() {
  document.querySelectorAll('.unit-toggle-btn').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.unit === distanceUnit);
  });
}

let lastVehiclesData = [];

// Only shown when there's more than one vehicle — for the common single-vehicle case
// the combined totals above already say everything this breakdown would repeat.
function renderVehicleBreakdown() {
  const breakdown = document.getElementById('vehicle-breakdown');
  breakdown.innerHTML = '';

  if (lastVehiclesData.length <= 1) {
    return;
  }

  const unitLabel = distanceUnit === 'mi' ? 'mi' : 'km';

  lastVehiclesData.forEach((vehicle) => {
    const row = document.createElement('div');
    row.className = 'vehicle-stat-row';

    const dot = document.createElement('span');
    dot.className = 'vehicle-stat-dot';
    dot.style.background = vehicle.color;

    const label = document.createElement('span');
    label.className = 'vehicle-stat-label';
    label.textContent = `V${vehicle.vehicleNumber}`;

    const value = document.createElement('span');
    value.className = 'vehicle-stat-value';
    const distance = formatDistance(vehicle.totalDistance.value / 1000, distanceUnit);
    value.textContent =
      `${distance} ${unitLabel} · ${vehicle.optimizedStopOrder.length} stops · ${vehicle.totalEstimatedTime.text}`;

    row.append(dot, label, value);
    breakdown.appendChild(row);
  });
}

function renderAllDistances() {
  renderDistanceStat();
  document.querySelectorAll('#results-body tr').forEach(renderRowDistances);
  updateUnitHeaders();
  updateUnitToggleUI();
  renderVehicleBreakdown();
}

function setDistanceUnit(unit) {
  if (unit === distanceUnit) {
    return;
  }
  distanceUnit = unit;
  renderAllDistances();
}

/* ---------- Results table & stats ---------- */
const STATUS_CYCLE = ['Pending', 'Delivered ✓', 'Failed ✗'];
const STATUS_CLASS = {
  'Pending': 'status-pending',
  'Delivered ✓': 'status-delivered',
  'Failed ✗': 'status-failed'
};

function setStatusCell(cell, status) {
  cell.textContent = status;
  cell.dataset.status = status;
  cell.classList.remove('status-pending', 'status-delivered', 'status-failed');
  cell.classList.add(STATUS_CLASS[status]);
}

function cycleStatus(cell) {
  const currentIndex = STATUS_CYCLE.indexOf(cell.dataset.status);
  const nextStatus = STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length];
  setStatusCell(cell, nextStatus);
}

function createResultRow(number, stop, legKm, cumKm, isDepot, vehicleInfo, draggable) {
  const row = document.createElement('tr');

  const handleCell = document.createElement('td');
  handleCell.className = 'drag-handle-cell';
  if (!isDepot && draggable) {
    row.draggable = true;

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    handle.setAttribute('aria-label', 'Drag to reorder');
    handleCell.appendChild(handle);

    row.addEventListener('dragstart', (event) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', '');
      row.classList.add('dragging');
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      handleRowReorder();
    });
  }

  const numCell = document.createElement('td');
  numCell.textContent = number;
  if (isDepot) {
    numCell.style.color = '#3b82f6';
    numCell.style.fontWeight = '600';
  }

  const vehicleCell = document.createElement('td');
  if (vehicleInfo) {
    const badge = document.createElement('span');
    badge.className = 'vehicle-badge';
    badge.style.setProperty('--vehicle-color', vehicleInfo.color);
    badge.textContent = `V${vehicleInfo.number}`;
    vehicleCell.appendChild(badge);
  } else {
    vehicleCell.textContent = '—';
  }

  const stopCell = document.createElement('td');
  stopCell.textContent = stop;

  const legCell = document.createElement('td');
  const cumCell = document.createElement('td');

  const statusCell = document.createElement('td');
  if (isDepot) {
    statusCell.textContent = '—';
  } else {
    statusCell.className = 'status-cell';
    statusCell.addEventListener('click', () => cycleStatus(statusCell));
    setStatusCell(statusCell, 'Pending');
  }

  row.append(handleCell, numCell, vehicleCell, stopCell, legCell, cumCell, statusCell);
  setRowDistances(row, legKm, cumKm);
  return row;
}

// Renders one shared depot row followed by each vehicle's stops grouped together
// (stop numbering restarts at 1 per vehicle, matching that vehicle's map markers).
// Drag-to-reorder is only enabled when there's a single vehicle — with multiple
// vehicles, reordering would mean reassigning a stop to a different vehicle's route
// entirely, which needs a fresh optimize call rather than a client-side reshuffle,
// so it's out of scope here.
function updateResultsTable(vehicles) {
  const tbody = document.getElementById('results-body');
  tbody.innerHTML = '';

  const draggable = vehicles.length === 1;
  const multiVehicle = vehicles.length > 1;
  const depot = vehicles[0].depot;

  tbody.appendChild(createResultRow('D', depot.address, null, null, true, null, false));

  vehicles.forEach((vehicle) => {
    vehicle.optimizedStopOrder.forEach((stop, index) => {
      const row = createResultRow(
        index + 1,
        stop,
        null,
        null,
        false,
        { number: vehicle.vehicleNumber, color: vehicle.color },
        draggable
      );
      row.dataset.vehicle = vehicle.vehicleNumber;
      if (multiVehicle && index === 0) {
        row.classList.add('vehicle-group-start');
      }
      tbody.appendChild(row);
    });
  });
}

/* ---------- Drag-to-reorder ---------- */
function getDragAfterElement(container, y) {
  const draggableRows = [...container.querySelectorAll('tr[draggable="true"]:not(.dragging)')];

  return draggableRows.reduce((closest, row) => {
    const box = row.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: row };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

function handleDragOver(event) {
  event.preventDefault();

  const tbody = document.getElementById('results-body');
  const draggingRow = tbody.querySelector('.dragging');
  if (!draggingRow) {
    return;
  }

  const afterElement = getDragAfterElement(tbody, event.clientY);
  if (afterElement == null) {
    tbody.appendChild(draggingRow);
  } else {
    tbody.insertBefore(draggingRow, afterElement);
  }
}

function recalculateResultsTable() {
  const rows = Array.from(document.querySelectorAll('#results-body tr'));

  let cumulativeKm = 0;
  let prevLat = null;
  let prevLng = null;
  let stopNumber = 1;

  rows.forEach((row, index) => {
    const numCell = row.children[1];

    const lat = parseFloat(row.dataset.lat);
    const lng = parseFloat(row.dataset.lng);
    const hasCoords = !Number.isNaN(lat) && !Number.isNaN(lng);

    if (index === 0) {
      numCell.textContent = 'D';
      setRowDistances(row, null, null);
    } else {
      numCell.textContent = stopNumber;
      stopNumber += 1;

      if (hasCoords && prevLat !== null && prevLng !== null) {
        const legKm = haversineDistanceKm(prevLat, prevLng, lat, lng);
        cumulativeKm += legKm;
        setRowDistances(row, legKm, cumulativeKm);
      } else {
        setRowDistances(row, null, null);
      }
    }

    if (hasCoords) {
      prevLat = lat;
      prevLng = lng;
    }
  });
}

function redrawRouteFromTable() {
  const rows = Array.from(document.querySelectorAll('#results-body tr'));
  if (rows.length === 0) {
    return;
  }

  clearMap();

  const routePoints = [];
  let stopNumber = 1;

  rows.forEach((row, index) => {
    const lat = parseFloat(row.dataset.lat);
    const lng = parseFloat(row.dataset.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return;
    }

    const address = row.children[3].textContent;

    if (index === 0) {
      createDepotMarker(lat, lng, address);
    } else {
      createDeliveryMarker(lat, lng, address, stopNumber, VEHICLE_COLORS[0]);
      stopNumber += 1;
    }

    routePoints.push({ lat, lng });
  });

  if (routePoints.length > 1) {
    drawStraightRoute(routePoints);
  }

  fitMapToMarkers();
}

function handleRowReorder() {
  recalculateResultsTable();
  redrawRouteFromTable();
}

function updateStats(data) {
  totalDistanceKm = data.totalDistance.value / 1000;
  renderDistanceStat();
  document.getElementById('total-time-display').textContent = data.totalEstimatedTime.text;

  const totalStops = data.vehicles.reduce((sum, v) => sum + v.optimizedStopOrder.length, 0);
  document.getElementById('stops-count').textContent = totalStops;

  lastVehiclesData = data.vehicles;
  renderVehicleBreakdown();
}

/* ---------- Address autocomplete ---------- */
function debounce(fn, delayMs) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delayMs);
  };
}

async function fetchAddressSuggestions(query) {
  try {
    const response = await fetch(`http://localhost:3000/autocomplete?input=${encodeURIComponent(query)}`);

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.suggestions || [];
  } catch (error) {
    return [];
  }
}

function renderSuggestions(listEl, input, results, onSelect) {
  listEl.innerHTML = '';

  if (results.length === 0) {
    listEl.classList.remove('is-open');
    return;
  }

  results.forEach(result => {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    item.textContent = result.description;
    item.addEventListener('click', () => {
      input.value = result.description;
      listEl.innerHTML = '';
      listEl.classList.remove('is-open');
      if (onSelect) {
        onSelect(result);
      }
    });
    listEl.appendChild(item);
  });

  listEl.classList.add('is-open');
}

function attachAutocomplete(input, onSelect) {
  if (input.dataset.autocompleteBound === 'true') {
    return;
  }
  input.dataset.autocompleteBound = 'true';

  const listEl = input.parentElement.querySelector('.autocomplete-list');
  if (!listEl) {
    return;
  }

  const runSearch = debounce(async () => {
    const query = input.value.trim();

    if (query.length < 3) {
      listEl.innerHTML = '';
      listEl.classList.remove('is-open');
      return;
    }

    const results = await fetchAddressSuggestions(query);
    renderSuggestions(listEl, input, results, onSelect);
  }, 300);

  input.addEventListener('input', runSearch);
}

function initAutocompleteForAll() {
  const depotInput = document.getElementById('depot-input');
  attachAutocomplete(depotInput, async (result) => {
    const coords = await geocodeForMap(result.description);
    if (coords) {
      updateWeatherFromCoords(coords);
    }
  });
  depotInput.addEventListener('input', () => {
    if (!getDepotAddress()) {
      clearDepotWeather();
    }
  });

  document.querySelectorAll('.delivery-input').forEach(input => attachAutocomplete(input));
}

document.addEventListener('click', (event) => {
  document.querySelectorAll('.autocomplete-list.is-open').forEach(listEl => {
    if (!listEl.parentElement.contains(event.target)) {
      listEl.innerHTML = '';
      listEl.classList.remove('is-open');
    }
  });
});

/* ---------- Geocoding & map display ---------- */
async function geocodeForMap(address) {
  try {
    const response = await fetch(`http://localhost:3000/geocode?address=${encodeURIComponent(address)}`);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (typeof data.lat !== 'number' || typeof data.lng !== 'number') {
      return null;
    }

    return { lat: data.lat, lng: data.lng };
  } catch (error) {
    return null;
  }
}

// Draws one shared depot marker plus every vehicle's stops and road path, each
// vehicle in its own assigned color, all visible on the map simultaneously.
function displayOnMap(data) {
  clearMap();

  const rows = document.querySelectorAll('#results-body tr');
  const depot = data.vehicles[0].depot;

  createDepotMarker(depot.lat, depot.lng, depot.address);
  updateWeatherFromCoords({ lat: depot.lat, lng: depot.lng });
  if (rows[0]) {
    rows[0].dataset.lat = depot.lat;
    rows[0].dataset.lng = depot.lng;
  }

  let rowIndex = 1;
  data.vehicles.forEach((vehicle) => {
    vehicle.stopCoordinates.forEach((coords, i) => {
      createDeliveryMarker(coords.lat, coords.lng, vehicle.optimizedStopOrder[i], i + 1, vehicle.color);
      if (rows[rowIndex]) {
        rows[rowIndex].dataset.lat = coords.lat;
        rows[rowIndex].dataset.lng = coords.lng;
      }
      rowIndex++;
    });

    if (vehicle.legs && vehicle.legs.length > 0) {
      drawRoadRoute(vehicle.legs, vehicle.color);
    }
  });

  fitMapToMarkers();
}

/* ---------- Optimize flow ---------- */
// For each vehicle, legs[0..stopCount-1] are its depot->stop1->stop2->...->stopN legs
// (real driving distance/duration from the Directions API); legs[stopCount] is that
// vehicle's return-to-depot leg, which isn't reflected in the table, matching how CUM
// has always represented "distance traveled so far to reach this stop" rather than the
// full round trip. Cumulative distance resets to 0 at the start of each vehicle's
// group, since CUM is relative to that vehicle's own route from the depot.
function populateAllRowDistances(vehicles) {
  const rows = document.querySelectorAll('#results-body tr');
  let rowIndex = 1;

  vehicles.forEach((vehicle) => {
    let cumulativeKm = 0;
    const stopCount = vehicle.optimizedStopOrder.length;

    for (let i = 0; i < stopCount; i++) {
      const legKm = vehicle.legs[i].distance.value / 1000;
      cumulativeKm += legKm;
      if (rows[rowIndex]) {
        setRowDistances(rows[rowIndex], legKm, cumulativeKm);
      }
      rowIndex++;
    }
  });
}

function getVehicleCount() {
  const raw = parseInt(document.getElementById('vehicles-input').value, 10);
  return Number.isInteger(raw) && raw > 0 ? raw : 1;
}

function setVehiclesError(message) {
  document.getElementById('vehicles-error').textContent = message || '';
}

function getMaxTimeMinutes() {
  const raw = parseFloat(document.getElementById('max-time-input').value);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

function setMaxTimeError(message) {
  document.getElementById('max-time-error').textContent = message || '';
}

// Shared by the "Plan Route" button and the live auto-replan triggered when the
// Vehicles field changes. `silent: true` (used by the live-update path) skips the
// depot/delivery nag alerts, since the user may simply not have finished filling in
// the form yet — auto-replanning shouldn't interrupt them with a popup for that.
// The vehicle-count/stop-count validation always shows its inline message either way.
async function runOptimize({ silent = false } = {}) {
  const depot = getDepotAddress();
  const deliveryAddresses = getDeliveryAddresses();
  const vehicleCount = getVehicleCount();
  const maxTimeMinutes = getMaxTimeMinutes();

  if (!depot || deliveryAddresses.length === 0) {
    if (!silent) {
      alert(!depot ? 'Please enter a depot address' : 'Please add at least one delivery');
    }
    return;
  }

  if (maxTimeMinutes === null) {
    if (!silent) {
      setMaxTimeError('Enter a max time per route to plan a route');
    }
    return;
  }
  setMaxTimeError('');

  if (vehicleCount > deliveryAddresses.length) {
    setVehiclesError(`Add more delivery stops to use ${vehicleCount} vehicles`);
    return;
  }
  setVehiclesError('');

  const optimizeBtn = document.getElementById('optimize-btn');
  const originalContent = optimizeBtn.innerHTML;
  optimizeBtn.textContent = 'OPTIMIZING...';
  optimizeBtn.disabled = true;

  try {
    const response = await fetch('http://localhost:3000/optimize-route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depot, stops: deliveryAddresses, vehicleCount, maxTimeMinutes })
    });

    if (!response.ok) {
      const errorData = await response.json();
      alert(errorData.error || 'Something went wrong while optimizing the route');
      return;
    }

    const data = await response.json();

    updateResultsTable(data.vehicles);
    populateAllRowDistances(data.vehicles);
    updateStats(data);
    displayOnMap(data);
  } catch (error) {
    alert('Failed to reach the route optimizer. Please try again.');
  } finally {
    optimizeBtn.innerHTML = originalContent;
    optimizeBtn.disabled = false;
  }
}

/* ---------- CSV export ---------- */
function exportCSV() {
  const rows = document.querySelectorAll('#results-body tr');
  if (rows.length === 0) {
    alert('No results to export yet');
    return;
  }

  const unitLabel = distanceUnit === 'mi' ? 'MI' : 'KM';
  const csvRows = [['#', 'Vehicle', 'Stop', `Leg ${unitLabel}`, `Cum ${unitLabel}`, 'Status']];

  rows.forEach(row => {
    const cells = Array.from(row.querySelectorAll('td:not(.drag-handle-cell)')).map(
      cell => `"${cell.textContent.replace(/"/g, '""')}"`
    );
    csvRows.push(cells);
  });

  const csvContent = csvRows.map(row => row.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = 'route-export.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ---------- Live clock ---------- */
function updateClock() {
  const now = new Date();

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const tzFormatter = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' });

  document.getElementById('clock-time').textContent = timeFormatter.format(now);
  document.getElementById('clock-date').textContent = dateFormatter.format(now);

  const tzPart = tzFormatter.formatToParts(now).find(part => part.type === 'timeZoneName');
  document.getElementById('clock-tz').textContent = tzPart ? tzPart.value : '';
}

/* ---------- Weather widget ---------- */
const WEATHER_CODE_MAP = {
  0: { label: 'Clear', emoji: '☀️' },
  1: { label: 'Mostly Clear', emoji: '🌤️' },
  2: { label: 'Partly Cloudy', emoji: '⛅' },
  3: { label: 'Cloudy', emoji: '☁️' },
  45: { label: 'Fog', emoji: '🌫️' },
  48: { label: 'Fog', emoji: '🌫️' },
  51: { label: 'Light Drizzle', emoji: '🌦️' },
  53: { label: 'Drizzle', emoji: '🌦️' },
  55: { label: 'Heavy Drizzle', emoji: '🌦️' },
  56: { label: 'Freezing Drizzle', emoji: '🌦️' },
  57: { label: 'Freezing Drizzle', emoji: '🌦️' },
  61: { label: 'Light Rain', emoji: '🌧️' },
  63: { label: 'Rain', emoji: '🌧️' },
  65: { label: 'Heavy Rain', emoji: '🌧️' },
  66: { label: 'Freezing Rain', emoji: '🌧️' },
  67: { label: 'Freezing Rain', emoji: '🌧️' },
  71: { label: 'Light Snow', emoji: '🌨️' },
  73: { label: 'Snow', emoji: '🌨️' },
  75: { label: 'Heavy Snow', emoji: '❄️' },
  77: { label: 'Snow Grains', emoji: '❄️' },
  80: { label: 'Rain Showers', emoji: '🌦️' },
  81: { label: 'Rain Showers', emoji: '🌦️' },
  82: { label: 'Heavy Showers', emoji: '⛈️' },
  85: { label: 'Snow Showers', emoji: '🌨️' },
  86: { label: 'Snow Showers', emoji: '🌨️' },
  95: { label: 'Thunderstorm', emoji: '⛈️' },
  96: { label: 'Thunderstorm', emoji: '⛈️' },
  99: { label: 'Thunderstorm', emoji: '⛈️' }
};

function getWeatherInfo(code) {
  return WEATHER_CODE_MAP[code] || { label: 'Unknown', emoji: '🌡️' };
}

function renderWeatherUnavailable() {
  document.getElementById('weather-section').innerHTML =
    '<div class="weather-unavailable">Weather unavailable</div>';
}

function renderWeatherPrompt() {
  document.getElementById('weather-section').innerHTML =
    '<div class="weather-note">Enter a depot address to see weather</div>';
}

function renderWeatherLoading() {
  document.getElementById('weather-section').innerHTML =
    '<div class="weather-loading">Loading weather…</div>';
}

async function fetchAndRenderWeather(lat, lng) {
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&temperature_unit=fahrenheit`
    );

    if (!response.ok) {
      renderWeatherUnavailable();
      return;
    }

    const data = await response.json();
    const current = data.current_weather;
    if (!current) {
      renderWeatherUnavailable();
      return;
    }

    const info = getWeatherInfo(current.weathercode);
    const section = document.getElementById('weather-section');
    section.innerHTML = '';

    const row = document.createElement('div');
    row.className = 'weather-row';

    const emoji = document.createElement('span');
    emoji.className = 'weather-emoji';
    emoji.textContent = info.emoji;

    const temp = document.createElement('span');
    temp.className = 'weather-temp';
    temp.textContent = `${Math.round(current.temperature)}°F`;

    row.append(emoji, temp);

    const desc = document.createElement('div');
    desc.className = 'weather-desc';
    desc.textContent = info.label;

    section.append(row, desc);
  } catch (error) {
    renderWeatherUnavailable();
  }
}

let depotWeatherCoords = null;

function updateWeatherFromCoords(coords) {
  depotWeatherCoords = coords;
  fetchAndRenderWeather(coords.lat, coords.lng);
}

function clearDepotWeather() {
  depotWeatherCoords = null;
  renderWeatherPrompt();
}

function refreshDepotWeather() {
  if (!depotWeatherCoords) {
    return;
  }
  fetchAndRenderWeather(depotWeatherCoords.lat, depotWeatherCoords.lng);
}

function initWeatherWidget() {
  renderWeatherPrompt();
  setInterval(refreshDepotWeather, 10 * 60 * 1000);
}

/* ---------- Wiring ---------- */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('optimize-btn').addEventListener('click', () => runOptimize());
  document.getElementById('add-delivery-btn').addEventListener('click', addDeliveryRow);
  document.getElementById('export-btn').addEventListener('click', exportCSV);

  document.querySelectorAll('#delivery-list .remove-btn').forEach(button => {
    button.addEventListener('click', () => removeDeliveryRow(button));
  });
  updateRemoveButtonStates();

  document.getElementById('vehicles-input').addEventListener(
    'input',
    debounce(() => runOptimize({ silent: true }), 500)
  );

  document.getElementById('results-body').addEventListener('dragover', handleDragOver);

  document.querySelectorAll('.unit-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => setDistanceUnit(btn.dataset.unit));
  });

  document.querySelectorAll('.view-tab').forEach(tab => {
    tab.addEventListener('click', () => setActiveView(tab.dataset.view));
  });

  initAutocompleteForAll();

  updateClock();
  setInterval(updateClock, 1000);
  initWeatherWidget();
});
