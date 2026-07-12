require('dotenv').config();
const express = require('express');
const { geocodeAddress } = require('./geocode');

const app = express();
const PORT = process.env.PORT || 3000;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

app.use(express.json());

app.post('/optimize-route', async (req, res) => {
  const { depot, stops } = req.body;

  if (!GOOGLE_MAPS_API_KEY) {
    return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY is not set' });
  }

  try {
    const geocodedDepot = await geocodeAddress(depot, GOOGLE_MAPS_API_KEY);
    const geocodedStops = await Promise.all(
      stops.map((stop) => geocodeAddress(stop, GOOGLE_MAPS_API_KEY))
    );

    res.json({ depot: geocodedDepot, stops: geocodedStops });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
