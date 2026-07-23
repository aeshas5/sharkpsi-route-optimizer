require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { geocodeAddress } = require('./geocode');
const { getOptimizedRoute } = require('./directions');
const { getAutocompleteSuggestions } = require('./places');
const { splitStopsAcrossVehicles, binPackByEstimatedTime } = require('./routeSplitting');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const VEHICLE_COLORS = ['#3b82f6', '#f97316', '#22c55e', '#8b5cf6', '#ec4899', '#06b6d4', '#eab308', '#f43f5e'];

app.use(express.json());

const routeCache = new Map();
const ROUTE_CACHE_TTL_MS = 5 * 60 * 1000;

function getCachedRoute(key) {
  const entry = routeCache.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.timestamp > ROUTE_CACHE_TTL_MS) {
    routeCache.delete(key);
    return null;
  }
  return entry.data;
}

// Routes a group of stops for one vehicle and enforces the hard max-time-per-route
// cap: if the real (Directions API) round-trip time exceeds it, repeatedly evicts
// whichever stop was last in the optimized visiting order and re-routes the smaller
// group, until what's left fits. Evicted stops are returned so the caller can assign
// them to another vehicle — this is what makes the cap a genuine hard limit rather
// than a best-effort estimate.
async function fitGroupUnderMaxTime(depot, group, maxTimeSeconds, apiKey) {
  let currentGroup = group;
  let route = await getOptimizedRoute(depot, depot, currentGroup.map((entry) => entry.stop), apiKey);
  const evicted = [];

  while (route.totalDuration.value > maxTimeSeconds) {
    if (currentGroup.length === 1) {
      const minutes = Math.round(maxTimeSeconds / 60);
      const err = new Error(
        `The stop "${currentGroup[0].stop.address || ''}" alone takes longer than the ` +
        `${minutes}-minute max time per route and cannot be served under this constraint.`
      );
      err.status = 400;
      throw err;
    }
    const evictLocalIndex = route.waypointOrder[route.waypointOrder.length - 1];
    evicted.push(currentGroup[evictLocalIndex]);
    currentGroup = currentGroup.filter((_, i) => i !== evictLocalIndex);
    route = await getOptimizedRoute(depot, depot, currentGroup.map((entry) => entry.stop), apiKey);
  }

  return { group: currentGroup, route, evicted };
}

// Routes every vehicle's initial (distance-balanced) stop group, then repeatedly packs
// any stops evicted for exceeding the time cap into additional vehicles, opening new
// ones as needed, until every stop is assigned to a route that fits under the cap.
async function planVehicleRoutes(depot, stopGroups, maxTimeSeconds, apiKey) {
  const finalGroups = [];
  let overflow = [];

  for (const initialGroup of stopGroups) {
    const { group, route, evicted } = await fitGroupUnderMaxTime(depot, initialGroup, maxTimeSeconds, apiKey);
    finalGroups.push({ group, route });
    overflow.push(...evicted);
  }

  while (overflow.length > 0) {
    const packedGroups = binPackByEstimatedTime(depot, overflow, 1, maxTimeSeconds);
    overflow = [];

    for (const packedGroup of packedGroups) {
      const { group, route, evicted } = await fitGroupUnderMaxTime(depot, packedGroup, maxTimeSeconds, apiKey);
      finalGroups.push({ group, route });
      overflow.push(...evicted);
    }
  }

  return finalGroups;
}

app.post('/optimize-route', async (req, res) => {
  const { depot, stops, vehicleCount: rawVehicleCount, maxTimeMinutes: rawMaxTimeMinutes } = req.body || {};

  if (typeof depot !== 'string' || !depot.trim()) {
    return res.status(400).json({ error: 'depot must be a non-empty string' });
  }
  if (!Array.isArray(stops) || !stops.every((stop) => typeof stop === 'string' && stop.trim())) {
    return res.status(400).json({ error: 'stops must be an array of non-empty strings' });
  }

  const vehicleCount = Number.isInteger(rawVehicleCount) && rawVehicleCount > 0 ? rawVehicleCount : 1;

  if (vehicleCount > stops.length) {
    return res.status(400).json({
      error: `Not enough delivery stops for ${vehicleCount} vehicles (at least ${vehicleCount} stops required)`,
    });
  }

  if (typeof rawMaxTimeMinutes !== 'number' || !Number.isFinite(rawMaxTimeMinutes) || rawMaxTimeMinutes <= 0) {
    return res.status(400).json({ error: 'maxTimeMinutes must be a positive number' });
  }
  const maxTimeSeconds = rawMaxTimeMinutes * 60;

  if (!GOOGLE_MAPS_API_KEY) {
    return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY is not set' });
  }

  const cacheKey = JSON.stringify({ depot, stops, vehicleCount, maxTimeMinutes: rawMaxTimeMinutes });
  const cached = getCachedRoute(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    const geocodedDepot = await geocodeAddress(depot, GOOGLE_MAPS_API_KEY);
    const geocodedStops = await Promise.all(
      stops.map((stop) => geocodeAddress(stop, GOOGLE_MAPS_API_KEY))
    );

    const stopGroups = splitStopsAcrossVehicles(geocodedDepot, geocodedStops, vehicleCount);
    const routedGroups = await planVehicleRoutes(geocodedDepot, stopGroups, maxTimeSeconds, GOOGLE_MAPS_API_KEY);

    const vehicles = routedGroups.map(({ group, route }, vehicleIndex) => ({
      vehicleNumber: vehicleIndex + 1,
      color: VEHICLE_COLORS[vehicleIndex % VEHICLE_COLORS.length],
      depot: { address: depot, lat: geocodedDepot.lat, lng: geocodedDepot.lng },
      optimizedStopOrder: route.waypointOrder.map((i) => stops[group[i].index]),
      stopCoordinates: route.waypointOrder.map((i) => ({
        lat: group[i].stop.lat,
        lng: group[i].stop.lng,
      })),
      legs: route.legs,
      totalDistance: route.totalDistance,
      totalEstimatedTime: route.totalDuration,
    }));

    const totalDistanceValue = vehicles.reduce((sum, v) => sum + v.totalDistance.value, 0);
    const totalDurationValue = vehicles.reduce((sum, v) => sum + v.totalEstimatedTime.value, 0);

    const responseBody = {
      vehicles,
      totalDistance: {
        value: totalDistanceValue,
        text: `${(totalDistanceValue / 1000).toFixed(1)} km`,
      },
      totalEstimatedTime: {
        value: totalDurationValue,
        text: `${Math.round(totalDurationValue / 60)} mins`,
      },
    };

    routeCache.set(cacheKey, { data: responseBody, timestamp: Date.now() });
    res.json(responseBody);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

app.get('/autocomplete', async (req, res) => {
  const input = (req.query.input || '').toString().trim();

  if (!GOOGLE_MAPS_API_KEY) {
    return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY is not set' });
  }
  if (!input) {
    return res.json({ suggestions: [] });
  }

  try {
    const suggestions = await getAutocompleteSuggestions(input, GOOGLE_MAPS_API_KEY);
    res.json({ suggestions });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/geocode', async (req, res) => {
  const address = (req.query.address || '').toString().trim();

  if (!GOOGLE_MAPS_API_KEY) {
    return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY is not set' });
  }
  if (!address) {
    return res.status(400).json({ error: 'address is required' });
  }

  try {
    const result = await geocodeAddress(address, GOOGLE_MAPS_API_KEY);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
