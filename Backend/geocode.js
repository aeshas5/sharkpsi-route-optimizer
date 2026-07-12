async function geocodeAddress(address, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== 'OK' || !data.results.length) {
    throw new Error(`Geocoding failed for "${address}": ${data.status}`);
  }

  const { lat, lng } = data.results[0].geometry.location;
  return { address, lat, lng };
}

module.exports = { geocodeAddress };
