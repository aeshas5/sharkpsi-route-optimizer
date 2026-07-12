#!/bin/sh
curl -s -X POST http://localhost:3000/optimize-route \
  -H "Content-Type: application/json" \
  -d '{
    "depot": "1 Ferry Building, San Francisco, CA",
    "stops": [
      "1 Zoo Rd, San Francisco, CA",
      "1355 Market St, San Francisco, CA",
      "600 Montgomery St, San Francisco, CA",
      "Pier 39, San Francisco, CA",
      "2695 Frederick St, San Francisco, CA"
    ]
  }' | jq .
