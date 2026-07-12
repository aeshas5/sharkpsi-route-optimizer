#!/bin/sh
curl -s -X POST http://localhost:3000/optimize-route \
  -H "Content-Type: application/json" \
  -d '{
    "depot": "233 S Wacker Dr, Chicago, IL",
    "stops": [
      "875 N Michigan Ave, Chicago, IL",
      "1060 W Addison St, Chicago, IL",
      "111 N State St, Chicago, IL",
      "1400 N Lake Shore Dr, Chicago, IL",
      "1200 S Lake Shore Dr, Chicago, IL"
    ]
  }' | jq .
