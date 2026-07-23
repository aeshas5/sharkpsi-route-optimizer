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

// Assumed average driving speed used only to *estimate* travel time from straight-line
// distance, cheaply, with no routing API calls. Deliberately on the conservative side
// (city driving with stops/lights/turns) so the estimate tends to under-pack rather
// than over-pack — the real per-vehicle time from the Directions API is what actually
// gets checked against the hard cap afterward.
const ASSUMED_SPEED_METERS_PER_SECOND = 8.33; // ~30 km/h

function estimateSeconds(meters) {
  return meters / ASSUMED_SPEED_METERS_PER_SECOND;
}

// Greedy best-fit bin packing by estimated round-trip time: process stops farthest
// from the depot first, and add each one to whichever open bucket keeps it under
// maxTimeSeconds while resulting in the lowest estimated total time; if it doesn't fit
// in any open bucket, open a new one for it. Used to pack stops that got evicted from
// their original vehicle because the real (post-Directions-call) route time exceeded
// the hard cap — those stops need to land in a vehicle (new, if necessary) that the
// estimate says should fit, which then gets verified for real by the caller.
function binPackByEstimatedTime(depot, stops, targetBucketCount, maxTimeSeconds) {
  const sorted = [...stops].sort((a, b) =>
    haversineDistanceMeters(depot, b.stop) - haversineDistanceMeters(depot, a.stop)
  );

  const buckets = Array.from({ length: Math.max(targetBucketCount, 0) }, () => ({
    stops: [],
    lastPoint: depot,
    chainSeconds: 0,
  }));

  sorted.forEach((entry) => {
    let bestBucket = null;
    let bestTotal = Infinity;
    let bestLegSeconds = 0;

    buckets.forEach((bucket) => {
      const legSeconds = estimateSeconds(haversineDistanceMeters(bucket.lastPoint, entry.stop));
      const returnSeconds = estimateSeconds(haversineDistanceMeters(entry.stop, depot));
      const total = bucket.chainSeconds + legSeconds + returnSeconds;

      if (total <= maxTimeSeconds && total < bestTotal) {
        bestBucket = bucket;
        bestTotal = total;
        bestLegSeconds = legSeconds;
      }
    });

    if (!bestBucket) {
      bestBucket = { stops: [], lastPoint: depot, chainSeconds: 0 };
      bestLegSeconds = estimateSeconds(haversineDistanceMeters(depot, entry.stop));
      buckets.push(bestBucket);
    }

    bestBucket.stops.push(entry);
    bestBucket.chainSeconds += bestLegSeconds;
    bestBucket.lastPoint = entry.stop;
  });

  return buckets.map((bucket) => bucket.stops).filter((stops) => stops.length > 0);
}

module.exports = {
  haversineDistanceMeters,
  splitStopsAcrossVehicles,
  estimateSeconds,
  binPackByEstimatedTime,
};
