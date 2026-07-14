const map = L.map('map').setView([39.8283, -98.5795], 4);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let markers = [];
let routeLines = [];
let depotMarker = null;

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
    html: '<div class="depot-marker">D</div>'
  });

  const marker = L.marker([lat, lng], { icon }).addTo(map);
  marker.bindPopup(address);

  depotMarker = marker;
  return marker;
}

function createDeliveryMarker(lat, lng, address, number) {
  const icon = L.divIcon({
    className: 'delivery-marker',
    html: `<div class="delivery-marker">${number}</div>`
  });

  const marker = L.marker([lat, lng], { icon }).addTo(map);
  marker.bindPopup(address);

  markers.push(marker);
  return marker;
}

function drawRoute(points) {
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

function fitMapToMarkers() {
  const positions = [];

  if (depotMarker) {
    positions.push(depotMarker.getLatLng());
  }
  markers.forEach(marker => positions.push(marker.getLatLng()));

  const bounds = L.latLngBounds(positions);
  map.fitBounds(bounds, { padding: [50, 50] });
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
}

function removeDeliveryRow(button) {
  const row = button.closest('.delivery-row');
  row.remove();
  renumberDeliveryRows();
  updateDeliveryCount();
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

function createResultRow(number, stop, legKm, cumKm, isDepot) {
  const row = document.createElement('tr');

  const handleCell = document.createElement('td');
  handleCell.className = 'drag-handle-cell';
  if (!isDepot) {
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

  const stopCell = document.createElement('td');
  stopCell.textContent = stop;

  const legCell = document.createElement('td');
  legCell.textContent = legKm;

  const cumCell = document.createElement('td');
  cumCell.textContent = cumKm;

  const statusCell = document.createElement('td');
  if (isDepot) {
    statusCell.textContent = '—';
  } else {
    statusCell.className = 'status-cell';
    statusCell.addEventListener('click', () => cycleStatus(statusCell));
    setStatusCell(statusCell, 'Pending');
  }

  row.append(handleCell, numCell, stopCell, legCell, cumCell, statusCell);
  return row;
}

function updateResultsTable(optimizedStops, depot) {
  const tbody = document.getElementById('results-body');
  tbody.innerHTML = '';

  tbody.appendChild(createResultRow('D', depot, '—', '—', true));

  optimizedStops.forEach((stop, index) => {
    tbody.appendChild(createResultRow(index + 1, stop, '—', '—', false));
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
    const legCell = row.children[3];
    const cumCell = row.children[4];

    const lat = parseFloat(row.dataset.lat);
    const lng = parseFloat(row.dataset.lng);
    const hasCoords = !Number.isNaN(lat) && !Number.isNaN(lng);

    if (index === 0) {
      numCell.textContent = 'D';
      legCell.textContent = '—';
      cumCell.textContent = '—';
    } else {
      numCell.textContent = stopNumber;
      stopNumber += 1;

      if (hasCoords && prevLat !== null && prevLng !== null) {
        const legKm = haversineDistanceKm(prevLat, prevLng, lat, lng);
        cumulativeKm += legKm;
        legCell.textContent = legKm.toFixed(1);
        cumCell.textContent = cumulativeKm.toFixed(1);
      } else {
        legCell.textContent = '—';
        cumCell.textContent = '—';
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

    const address = row.children[2].textContent;

    if (index === 0) {
      createDepotMarker(lat, lng, address);
    } else {
      createDeliveryMarker(lat, lng, address, stopNumber);
      stopNumber += 1;
    }

    routePoints.push({ lat, lng });
  });

  if (routePoints.length > 1) {
    drawRoute(routePoints);
  }

  fitMapToMarkers();
}

function handleRowReorder() {
  recalculateResultsTable();
  redrawRouteFromTable();
}

function updateStats(totalDistance, totalTime, numStops) {
  document.getElementById('total-distance-display').textContent = totalDistance.text;
  document.getElementById('total-time-display').textContent = totalTime.text;
  document.getElementById('stops-count').textContent = numStops;
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
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`,
      { headers: { 'User-Agent': 'RouteFlow/1.0' } }
    );

    if (!response.ok) {
      return [];
    }

    return await response.json();
  } catch (error) {
    return [];
  }
}

function renderSuggestions(listEl, input, results) {
  listEl.innerHTML = '';

  if (results.length === 0) {
    listEl.classList.remove('is-open');
    return;
  }

  results.forEach(result => {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    item.textContent = result.display_name;
    item.addEventListener('click', () => {
      input.value = result.display_name;
      listEl.innerHTML = '';
      listEl.classList.remove('is-open');
    });
    listEl.appendChild(item);
  });

  listEl.classList.add('is-open');
}

function attachAutocomplete(input) {
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
    renderSuggestions(listEl, input, results);
  }, 300);

  input.addEventListener('input', runSearch);
}

function initAutocompleteForAll() {
  document.querySelectorAll('#depot-input, .delivery-input').forEach(attachAutocomplete);
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
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function geocodeForMap(address) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'RouteFlow/1.0' } }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (!data || data.length === 0) {
      return null;
    }

    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (error) {
    return null;
  }
}

async function displayOnMap(depot, optimizedStops) {
  clearMap();

  const rows = document.querySelectorAll('#results-body tr');
  const points = [];

  await delay(1000);
  const depotCoords = await geocodeForMap(depot);
  if (depotCoords) {
    createDepotMarker(depotCoords.lat, depotCoords.lng, depot);
    points.push(depotCoords);
    if (rows[0]) {
      rows[0].dataset.lat = depotCoords.lat;
      rows[0].dataset.lng = depotCoords.lng;
    }
  }

  for (let i = 0; i < optimizedStops.length; i++) {
    await delay(1000);
    const coords = await geocodeForMap(optimizedStops[i]);
    if (coords) {
      createDeliveryMarker(coords.lat, coords.lng, optimizedStops[i], i + 1);
      points.push(coords);
      if (rows[i + 1]) {
        rows[i + 1].dataset.lat = coords.lat;
        rows[i + 1].dataset.lng = coords.lng;
      }
    }
  }

  if (points.length > 1) {
    drawRoute(points);
  }

  fitMapToMarkers();
}

/* ---------- Optimize flow ---------- */
async function handleOptimize() {
  const depot = getDepotAddress();
  const deliveryAddresses = getDeliveryAddresses();

  if (!depot) {
    alert('Please enter a depot address');
    return;
  }

  if (deliveryAddresses.length === 0) {
    alert('Please add at least one delivery');
    return;
  }

  const optimizeBtn = document.getElementById('optimize-btn');
  const originalContent = optimizeBtn.innerHTML;
  optimizeBtn.textContent = 'OPTIMIZING...';
  optimizeBtn.disabled = true;

  try {
    const response = await fetch('http://localhost:3000/optimize-route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depot, stops: deliveryAddresses })
    });

    if (!response.ok) {
      const errorData = await response.json();
      alert(errorData.error || 'Something went wrong while optimizing the route');
      return;
    }

    const data = await response.json();

    updateResultsTable(data.optimizedStopOrder, depot);
    updateStats(data.totalDistance, data.totalEstimatedTime, data.optimizedStopOrder.length);
    await displayOnMap(depot, data.optimizedStopOrder);
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

  const csvRows = [['#', 'Stop', 'Leg KM', 'Cum KM', 'Status']];

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

function refreshWeatherFromCurrentPosition() {
  if (!navigator.geolocation) {
    renderWeatherUnavailable();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      fetchAndRenderWeather(position.coords.latitude, position.coords.longitude);
    },
    () => {
      renderWeatherUnavailable();
    }
  );
}

function initWeatherWidget() {
  refreshWeatherFromCurrentPosition();
  setInterval(refreshWeatherFromCurrentPosition, 10 * 60 * 1000);
}

/* ---------- Wiring ---------- */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('optimize-btn').addEventListener('click', handleOptimize);
  document.getElementById('add-delivery-btn').addEventListener('click', addDeliveryRow);
  document.getElementById('export-btn').addEventListener('click', exportCSV);

  document.querySelectorAll('#delivery-list .remove-btn').forEach(button => {
    button.addEventListener('click', () => removeDeliveryRow(button));
  });

  document.getElementById('results-body').addEventListener('dragover', handleDragOver);

  initAutocompleteForAll();

  updateClock();
  setInterval(updateClock, 1000);
  initWeatherWidget();
});
