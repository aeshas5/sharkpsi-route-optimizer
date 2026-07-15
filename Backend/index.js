require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { geocodeAddress } = require('./geocode');
const { getOptimizedRoute } = require('./directions');
const { getAutocompleteSuggestions } = require('./places');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

app.use(express.json());

app.post('/optimize-route', async (req, res) => {
  const { depot, stops } = req.body || {};

  if (typeof depot !== 'string' || !depot.trim()) {
    return res.status(400).json({ error: 'depot must be a non-empty string' });
  }
  if (!Array.isArray(stops) || !stops.every((stop) => typeof stop === 'string' && stop.trim())) {
    return res.status(400).json({ error: 'stops must be an array of non-empty strings' });
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY is not set' });
  }

  try {
    const geocodedDepot = await geocodeAddress(depot, GOOGLE_MAPS_API_KEY);
    const geocodedStops = await Promise.all(
      stops.map((stop) => geocodeAddress(stop, GOOGLE_MAPS_API_KEY))
    );

    const route = await getOptimizedRoute(
      geocodedDepot,
      geocodedDepot,
      geocodedStops,
      GOOGLE_MAPS_API_KEY
    );

    res.json({
      optimizedStopOrder: route.waypointOrder.map((i) => stops[i]),
      totalDistance: route.totalDistance,
      totalEstimatedTime: route.totalDuration,
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
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
