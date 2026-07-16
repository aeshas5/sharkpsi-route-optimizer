function haversineDistanceMeters(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Greedy longest-processing-time-first bin packing: process stops farthest from the
// depot first, always assigning the next stop to whichever vehicle currently has the
// lowest estimated workload. Workload is tracked as a simulated nearest-neighbor tour
// cost (distance from that vehicle's most recently assigned point, starting at the
// depot) using straight-line distance — cheap, no routing API calls. This is a fast
// approximation, not a globally optimal partition (which would require evaluating
// combinatorially many candidate splits via real routing calls); real per-vehicle
// distance/time comes from the actual Directions API call made afterward for each
// vehicle's final assigned group.
function splitStopsAcrossVehicles(depot, stops, vehicleCount) {
  const remaining = stops
    .map((stop, index) => ({ index, stop }))
    .sort((a, b) => haversineDistanceMeters(depot, b.stop) - haversineDistanceMeters(depot, a.stop));

  const buckets = Array.from({ length: vehicleCount }, () => ({
    stops: [],
    lastPoint: depot,
    workload: 0,
  }));

  remaining.forEach(({ index, stop }) => {
    const target = buckets.reduce((least, bucket) => (bucket.workload < least.workload ? bucket : least));
    target.workload += haversineDistanceMeters(target.lastPoint, stop);
    target.lastPoint = stop;
    target.stops.push({ index, stop });
  });

  return buckets.map((bucket) => bucket.stops);
}

module.exports = { haversineDistanceMeters, splitStopsAcrossVehicles };
