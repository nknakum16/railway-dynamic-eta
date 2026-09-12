Train Schedule & Timetable API

Train schedule & timetable
https://api.railradar.in/v1/trains/{number}
Description

Returns full train timetable and scheduled halting sequence with arrival/departure times, distance, speed, and platform information. Use haltsOnly=true to skip pass-through stops.

```python
import requests

response = requests.get(
    "https://api.railradar.in/v1/trains/12919?haltsOnly=true",
    headers={"Authorization": "Bearer rr_live_YOUR_API_KEY"},
)
print(response.json())
```

```json
{
  "success": true,
  "data": {
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
      "returnTrain": "12920",
      "coachPosition": "Engine-H1-A1-A2-B1-B2-B3-B4-PC-S1-S2-S3-S4-S5-S6-S7-S8-S9-S10-S11-S12-DL1"
    },
    "route": [
      {
        "sequence": 1,
        "station": {
          "code": "INDB",
          "name": "Indore Junction"
        },
        "arrival": null,
        "departure": "23:55",
        "arrivalDay": 1,
        "departureDay": 1,
        "distance": 0,
        "isHalt": true,
        "platform": "4",
        "speedToNextStationKmph": 55
      },
      {
        "sequence": 2,
        "station": {
          "code": "UJN",
          "name": "Ujjain Junction"
        },
        "arrival": "00:55",
        "departure": "01:00",
        "arrivalDay": 2,
        "departureDay": 2,
        "distance": 55,
        "isHalt": true,
        "platform": "1",
        "speedToNextStationKmph": 60
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

Error Reference
Status,	Meaning,            Description
400,    Bad Request,            Invalid parameter format, missing required field, or malformed request syntax.
401,    Unauthorized,           Missing, expired, or invalid API key in Authorization Bearer header.
404,    Not Found,              The requested train, station, or PNR record was not found.
429,    Rate Limited,           Request rate exceeded your plan quota (1,000 requests/month on free sandbox tier).
503,    Service Unavailable,	Upstream transit telemetry provider temporarily degraded.
