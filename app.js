const map = L.map('map').setView([39.8283, -98.5795], 4);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
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
    color: '#4ecca3',
    weight: 3,
    opacity: 0.8
  }).addTo(map);
  routeLines.push(routeLine);

  const returnLine = L.polyline([latLngs[latLngs.length - 1], latLngs[0]], {
    color: '#4ecca3',
    weight: 2,
    opacity: 0.4,
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
function createResultRow(number, stop, legKm, cumKm, isDepot) {
  const row = document.createElement('tr');

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

  row.append(numCell, stopCell, legCell, cumCell);
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

  const points = [];

  await delay(1000);
  const depotCoords = await geocodeForMap(depot);
  if (depotCoords) {
    createDepotMarker(depotCoords.lat, depotCoords.lng, depot);
    points.push(depotCoords);
  }

  for (let i = 0; i < optimizedStops.length; i++) {
    await delay(1000);
    const coords = await geocodeForMap(optimizedStops[i]);
    if (coords) {
      createDeliveryMarker(coords.lat, coords.lng, optimizedStops[i], i + 1);
      points.push(coords);
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

  const csvRows = [['#', 'Stop', 'Leg KM', 'Cum KM']];

  rows.forEach(row => {
    const cells = Array.from(row.querySelectorAll('td')).map(
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

/* ---------- Wiring ---------- */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('optimize-btn').addEventListener('click', handleOptimize);
  document.getElementById('add-delivery-btn').addEventListener('click', addDeliveryRow);
  document.getElementById('export-btn').addEventListener('click', exportCSV);

  document.querySelectorAll('#delivery-list .remove-btn').forEach(button => {
    button.addEventListener('click', () => removeDeliveryRow(button));
  });

  initAutocompleteForAll();
});
