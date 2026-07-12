function toLatLngParam(point) {
  return `${point.lat},${point.lng}`;
}

async function getOptimizedRoute(origin, destination, waypoints, apiKey) {
  const params = new URLSearchParams({
    origin: toLatLngParam(origin),
    destination: toLatLngParam(destination),
    key: apiKey,
  });

  if (waypoints.length) {
    const waypointsParam = 'optimize:true|' + waypoints.map(toLatLngParam).join('|');
    params.set('waypoints', waypointsParam);
  }

  const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== 'OK' || !data.routes.length) {
    const detail = data.error_message ? ` (${data.error_message})` : '';
    throw new Error(`Directions request failed: ${data.status}${detail}`);
  }

  const route = data.routes[0];
  const totalDistanceMeters = route.legs.reduce((sum, leg) => sum + leg.distance.value, 0);
  const totalDurationSeconds = route.legs.reduce((sum, leg) => sum + leg.duration.value, 0);

  return {
    waypointOrder: route.waypoint_order,
    totalDistance: {
      value: totalDistanceMeters,
      text: `${(totalDistanceMeters / 1000).toFixed(1)} km`,
    },
    totalDuration: {
      value: totalDurationSeconds,
      text: `${Math.round(totalDurationSeconds / 60)} mins`,
    },
  };
}

module.exports = { getOptimizedRoute };
