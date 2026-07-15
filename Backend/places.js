async function getAutocompleteSuggestions(input, apiKey) {
  const params = new URLSearchParams({ input, key: apiKey });
  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    const detail = data.error_message ? ` (${data.error_message})` : '';
    throw new Error(`Autocomplete failed: ${data.status}${detail}`);
  }

  return (data.predictions || []).map((prediction) => ({
    description: prediction.description,
    placeId: prediction.place_id,
  }));
}

module.exports = { getAutocompleteSuggestions };
