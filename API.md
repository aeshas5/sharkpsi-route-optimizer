# API

## POST /optimize-route

Send a depot address and a list of stop addresses. The server geocodes them with the Google Maps Geocoding API, then calls the Directions API (depot as origin/destination, stops as optimized waypoints) and returns the optimized stop order, total distance, and total estimated time.

### Request

```json
{
  "depot": "233 S Wacker Dr, Chicago, IL",
  "stops": [
    "875 N Michigan Ave, Chicago, IL",
    "1060 W Addison St, Chicago, IL",
    "111 N State St, Chicago, IL",
    "1400 N Lake Shore Dr, Chicago, IL",
    "1200 S Lake Shore Dr, Chicago, IL"
  ]
}
```

### Response

```json
{
  "optimizedStopOrder": [
    "111 N State St, Chicago, IL",
    "875 N Michigan Ave, Chicago, IL",
    "1400 N Lake Shore Dr, Chicago, IL",
    "1060 W Addison St, Chicago, IL",
    "1200 S Lake Shore Dr, Chicago, IL"
  ],
  "totalDistance": {
    "value": 29888,
    "text": "29.9 km"
  },
  "totalEstimatedTime": {
    "value": 4063,
    "text": "68 mins"
  }
}
```

`totalDistance.value` is meters, `totalEstimatedTime.value` is seconds; `text` is the human-readable form. On bad input or an upstream geocoding/directions failure, the response is `{ "error": "<message>" }` with a `400`, `500`, or `502` status instead.
