Live Train Running Status API

Live train running status & delay tracking
https://api.railradar.in/v1/trains/{number}/live
---
Description

Real-time live train running status, current telemetry location, delay in minutes, next halting station, platform updates, and diversion / cancellation status.

    date is optional (defaults to today's journey date in Indian Standard Time).
    authoritative=true forces an upstream fetch bypassing local caches.
    currentLocation contains segmentProgress (0.0 to 1.0), speed (km/h), and bearing heading.
---
Parameters
Name	In	Type	Required	Description
number	path	string	Yes	5-digit train number (e.g. 12002, 12919, 12952)
date	query	string	No	Journey start date (YYYY-MM-DD). Omit to auto-detect current run.
authoritative	query	true | false	No	Bypass cache and force upstream live telemetry fetch. Default: false(default: false)
haltsOnly	query	true | false	No	Return only halting stops in the live route array. Default: false(default: false)
geometry	query	true | false	No	Include full route track geometry. Default: false(default: false)
format	query	polyline | geojson | coordinates	No	Geometry format when geometry=true. Default: polyline(default: polyline)
includeCoordinates	query	true | false	No	Include station GPS coordinates in route stops array. Default: false(default: false)Parameters
Name	In	Type	Required	Description
number	path	string	Yes	5-digit train number (e.g. 12002, 12919, 12952)
date	query	string	No	Journey start date (YYYY-MM-DD). Omit to auto-detect current run.
authoritative	query	true | false	No	Bypass cache and force upstream live telemetry fetch. Default: false(default: false)
haltsOnly	query	true | false	No	Return only halting stops in the live route array. Default: false(default: false)
geometry	query	true | false	No	Include full route track geometry. Default: false(default: false)
format	query	polyline | geojson | coordinates	No	Geometry format when geometry=true. Default: polyline(default: polyline)
includeCoordinates	query	true | false	No	Include station GPS coordinates in route stops array. Default: false(default: false)
---
```python
import requests

response = requests.get(
    "https://api.railradar.in/v1/trains/12919/live",
    headers={"Authorization": "Bearer rr_live_YOUR_API_KEY"},
)
print(response.json())
```

```json
{
  "success": true,
  "data": {
    "trainNumber": "12919",
    "trainName": "Malwa SF Express",
    "startDate": "2026-06-22",
    "lastUpdatedAt": "2026-06-22T07:14:00+05:30",
    "status": "running",
    "delayMinutes": 12,
    "train": {
      "number": "12919",
      "name": "Malwa SF Express",
      "type": "Superfast Express",
      "category": "Superfast",
      "source": {
        "code": "INDB",
        "name": "Indore Junction"
      },
      "destination": {
        "code": "SVDK",
        "name": "Shri Mata Vaishno Devi Katra"
      },
      "runDays": [
        "mon",
        "tue",
        "wed",
        "thu",
        "fri",
        "sat",
        "sun"
      ],
      "distance": 1640,
      "duration": 1720,
      "avgSpeed": 57.2,
      "maxSpeed": 110,
      "totalHalts": 45,
      "returnTrain": "12920"
    },
    "currentLocation": {
      "stationCode": "UJN",
      "sequence": 2,
      "status": "departed",
      "isHalt": true,
      "isDiverted": false,
      "isActualPosition": true,
      "segmentProgress": 0.45,
      "speedKmh": 65.5,
      "bearingDegrees": 180
    },
    "previousHalt": {
      "stationCode": "INDB",
      "stationName": "Indore Junction",
      "sequence": 1,
      "distance": 0
    },
    "nextHalt": {
      "stationCode": "UJN",
      "stationName": "Ujjain Junction",
      "sequence": 2,
      "distance": 55
    },
    "exceptions": [
      {
        "type": "DIVERTED",
        "message": "Train is diverted between UJN (Ujjain Junction) and MKSM (Maksi)",
        "diverted": {
          "from": {
            "code": "UJN",
            "name": "Ujjain Junction",
            "sequence": 2
          },
          "to": {
            "code": "MKSM",
            "name": "Maksi",
            "sequence": 3
          },
          "divertedStations": [
            {
              "order": 0,
              "sequence": 3,
              "stationCode": "PLW",
              "stationName": "Pingleshwar",
              "lat": 23.19,
              "lng": 75.95,
              "isHalt": false,
              "status": "departed",
              "scheduledArrival": "2026-06-23T01:15:00+05:30",
              "scheduledDeparture": "2026-06-23T01:15:00+05:30",
              "actualArrival": "2026-06-23T01:27:00+05:30",
              "actualDeparture": "2026-06-23T01:27:00+05:30",
              "delayArrival": 12,
              "delayDeparture": 12,
              "platform": null,
              "platformChanged": false,
              "distance": 68
            },
            {
              "order": 1,
              "sequence": 4,
              "stationCode": "TJP",
              "stationName": "Tajpur",
              "lat": 23.2,
              "lng": 76.08,
              "isHalt": true,
              "status": "upcoming",
              "scheduledArrival": "2026-06-23T01:45:00+05:30",
              "scheduledDeparture": "2026-06-23T01:50:00+05:30",
              "actualArrival": null,
              "actualDeparture": null,
              "delayArrival": null,
              "delayDeparture": null,
              "platform": "1",
              "platformChanged": false,
              "distance": 82
            }
          ],
          "skippedStations": [
            {
              "code": "MKSM",
              "name": "Maksi",
              "scheduledSequence": 3,
              "scheduledArrival": "2026-06-23T02:10:00+05:30",
              "scheduledDeparture": "2026-06-23T02:12:00+05:30"
            }
          ],
          "hasReversal": false,
          "geometry": "encoded_polyline_string",
          "distanceKm": 41
        },
        "partiallyCancelled": null,
        "rescheduled": null
      }
    ],
    "route": [
      {
        "sequence": 1,
        "stationCode": "INDB",
        "stationName": "Indore Junction",
        "isHalt": true,
        "lat": 22.72,
        "lng": 75.86,
        "scheduledArrival": null,
        "scheduledDeparture": "2026-06-22T23:55:00+05:30",
        "actualArrival": null,
        "actualDeparture": "2026-06-23T00:07:00+05:30",
        "delayArrival": null,
        "delayDeparture": 12,
        "status": "departed",
        "distance": 0,
        "speedToNextStationKmph": 55,
        "platform": "4"
      },
      {
        "sequence": 2,
        "stationCode": "UJN",
        "stationName": "Ujjain Junction",
        "isHalt": true,
        "lat": 23.17,
        "lng": 75.78,
        "scheduledArrival": "2026-06-23T00:55:00+05:30",
        "scheduledDeparture": "2026-06-23T01:00:00+05:30",
        "actualArrival": "2026-06-23T01:07:00+05:30",
        "actualDeparture": "2026-06-23T01:12:00+05:30",
        "delayArrival": 12,
        "delayDeparture": 12,
        "status": "departed",
        "distance": 55,
        "speedToNextStationKmph": 60,
        "platform": "1"
      },
      {
        "sequence": 3,
        "stationCode": "MKSM",
        "stationName": "Maksi",
        "isHalt": true,
        "lat": 23.21,
        "lng": 76.22,
        "scheduledArrival": "2026-06-23T02:10:00+05:30",
        "scheduledDeparture": "2026-06-23T02:12:00+05:30",
        "actualArrival": null,
        "actualDeparture": null,
        "delayArrival": null,
        "delayDeparture": null,
        "status": "upcoming",
        "distance": 96,
        "speedToNextStationKmph": 62,
        "platform": "3"
      }
    ],
    "isLive": true
  },
  "meta": {
    "traceId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-06-22T12:30:00+05:30",
    "executionTime": 38,
    "source": "database"
  }
}
```
