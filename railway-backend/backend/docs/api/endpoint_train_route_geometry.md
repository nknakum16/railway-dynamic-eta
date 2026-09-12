Train Route Geometry (GIS) API

Train route geometry (GIS)
https://api.railradar.in/v1/trains/{number}/route
Description

Returns the geographical track geometry for a train route.

Format options (`format` param):- geojson (default) — GeoJSON LineString feature ready for MapLibre, Mapbox, Leaflet, or QGIS.- polyline — Google encoded polyline string (precision 5). Smallest payload (~8KB avg).- coordinates — Raw [[lat, lng], ...] coordinate array.

Stops (`stops` param):- Pass stops=true to include all station stops (code, name, lat, lng, sequence) alongside the track geometry.

---
Parameters
Name	In	Type	Required	Description
number	path	string	Yes	5-digit train number (e.g. 12002, 12919, 12952)
format	query	geojson | polyline | coordinates	No	Response format for the geometry. Default: geojson(default: geojson)
stops	query	true | false	No	Include station stops alongside the track geometry. Default: false(default: false)
---

```python
import requests

response = requests.get(
    "https://api.railradar.in/v1/trains/12919/route?format=geojson&stops=true",
    headers={"Authorization": "Bearer rr_live_YOUR_API_KEY"},
)
print(response.json())
```

```json
{
  "success": true,
  "data": {
    "trainNumber": "12919",
    "format": "geojson",
    "geojson": {
      "type": "Feature",
      "properties": {
        "trainNumber": "12919"
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [
            75.86,
            22.72
          ],
          [
            75.78,
            23.17
          ],
          [
            76.71,
            23.18
          ]
        ]
      }
    },
    "stops": [
      {
        "sequence": 1,
        "code": "INDB",
        "name": "Indore Junction",
        "lat": 22.72,
        "lng": 75.86
      },
      {
        "sequence": 2,
        "code": "UJN",
        "name": "Ujjain Junction",
        "lat": 23.17,
        "lng": 75.78
      }
    ]
  },
  "meta": {
    "traceId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-06-22T12:30:00+05:30",
    "executionTime": 38,
    "source": "database"
  }
}
```
