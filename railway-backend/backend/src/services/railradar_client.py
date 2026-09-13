import datetime
from typing import Any, Dict, Optional
import httpx

from src.core.cache import cache
from src.core.config import settings
from src.core.logging import logger


class RailRadarClient:
    """Async HTTP client for interacting with the RailRadar Indian Railways API."""

    def __init__(self) -> None:
        self.base_url = settings.RAILRADAR_BASE_URL.rstrip("/")
        self.api_key = settings.RAILRADAR_API_KEY
        self.timeout = settings.RAILRADAR_TIMEOUT_SECONDS

    def _get_headers(self) -> Dict[str, str]:
        headers = {
            "Accept": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def get_live_status(
        self,
        train_number: str,
        date: Optional[str] = None,
        authoritative: bool = False,
        halts_only: bool = False,
    ) -> Dict[str, Any]:
        """Fetch live train running status & telemetry."""
        cache_key = f"live:{train_number}:{date or 'today'}:{halts_only}"

        if not authoritative:
            cached = await cache.get(cache_key)
            if cached is not None:
                logger.debug("Serving live status for %s from cache", train_number)
                return cached

        url = f"{self.base_url}/trains/{train_number}/live"
        params: Dict[str, Any] = {
            "authoritative": str(authoritative).lower(),
            "haltsOnly": str(halts_only).lower(),
        }
        if date:
            params["date"] = date

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.get(url, headers=self._get_headers(), params=params)

            if res.status_code == 200:
                body = res.json()
                data = body.get("data", body)
                await cache.set(cache_key, data, ttl_seconds=settings.CACHE_TTL_LIVE_SECONDS)
                return data

            logger.warning(
                "RailRadar live status returned status %d for train %s: %s",
                res.status_code,
                train_number,
                res.text,
            )
            if settings.ENABLE_MOCK_FALLBACK:
                return self._generate_mock_live_status(train_number, date)
            res.raise_for_status()

        except Exception as exc:
            logger.error("Failed to fetch live status for train %s: %s", train_number, exc)
            if settings.ENABLE_MOCK_FALLBACK:
                logger.info("Serving mock live status fallback for train %s", train_number)
                return self._generate_mock_live_status(train_number, date)
            raise

    async def get_schedule(
        self,
        train_number: str,
        halts_only: bool = True,
    ) -> Dict[str, Any]:
        """Fetch train schedule and timetable."""
        cache_key = f"schedule:{train_number}:{halts_only}"
        cached = await cache.get(cache_key)
        if cached is not None:
            return cached

        url = f"{self.base_url}/trains/{train_number}"
        params = {"haltsOnly": str(halts_only).lower()}

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.get(url, headers=self._get_headers(), params=params)

            if res.status_code == 200:
                body = res.json()
                data = body.get("data", body)
                await cache.set(cache_key, data, ttl_seconds=settings.CACHE_TTL_STATIC_SECONDS)
                return data

            logger.warning("RailRadar schedule returned %d for train %s", res.status_code, train_number)
            if settings.ENABLE_MOCK_FALLBACK:
                return self._generate_mock_schedule(train_number)
            res.raise_for_status()

        except Exception as exc:
            logger.error("Failed to fetch schedule for train %s: %s", train_number, exc)
            if settings.ENABLE_MOCK_FALLBACK:
                return self._generate_mock_schedule(train_number)
            raise

    async def get_route_geometry(
        self,
        train_number: str,
        format: str = "geojson",
        stops: bool = True,
    ) -> Dict[str, Any]:
        """Fetch train route track geometry (GIS)."""
        cache_key = f"route:{train_number}:{format}:{stops}"
        cached = await cache.get(cache_key)
        if cached is not None:
            return cached

        url = f"{self.base_url}/trains/{train_number}/route"
        params = {
            "format": format,
            "stops": str(stops).lower(),
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.get(url, headers=self._get_headers(), params=params)

            if res.status_code == 200:
                body = res.json()
                data = body.get("data", body)
                await cache.set(cache_key, data, ttl_seconds=settings.CACHE_TTL_STATIC_SECONDS)
                return data

            logger.warning("RailRadar route geometry returned %d for train %s", res.status_code, train_number)
            if settings.ENABLE_MOCK_FALLBACK:
                return self._generate_mock_route_geometry(train_number)
            res.raise_for_status()

        except Exception as exc:
            logger.error("Failed to fetch route geometry for train %s: %s", train_number, exc)
            if settings.ENABLE_MOCK_FALLBACK:
                return self._generate_mock_route_geometry(train_number)
            raise

    async def get_popular_trains(self) -> List[Dict[str, Any]]:
        """Fetch list of popular Indian Railways trains."""
        cache_key = "lookup:popular_trains"
        cached = await cache.get(cache_key)
        if cached is not None:
            return cached

        url = f"{self.base_url}/lookup/trains/compressed"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.get(url, headers=self._get_headers())

            if res.status_code == 200:
                raw_text = ""
                try:
                    payload = res.json()
                    if isinstance(payload, dict) and "data" in payload:
                        raw_text = payload.get("data", "")
                    elif isinstance(payload, str):
                        raw_text = payload
                except Exception:
                    raw_text = res.text

                if not raw_text:
                    raw_text = res.text

                trains = []
                lines = raw_text.splitlines()
                for line in lines:
                    line = line.strip()
                    if not line:
                        continue
                    parts = line.split("|")
                    if len(parts) >= 4:
                        train_num = parts[0].strip()
                        # Sanitize any accidental leftover JSON formatting or quotes
                        if "data" in train_num or "{" in train_num or '"' in train_num:
                            import re
                            match = re.search(r"\d{4,5}", train_num)
                            if match:
                                train_num = match.group(0)
                            else:
                                train_num = train_num.replace('{"success":true,"data":"', "").replace('"', "").strip()
                        trains.append({
                            "number": train_num,
                            "name": parts[1].strip(),
                            "source": parts[2].strip(),
                            "destination": parts[3].strip(),
                        })
                    if len(trains) >= 8:
                        break
                if trains:
                    await cache.set(cache_key, trains, ttl_seconds=settings.CACHE_TTL_STATIC_SECONDS)
                    return trains

            if settings.ENABLE_MOCK_FALLBACK:
                return self._generate_mock_popular_trains()
            res.raise_for_status()
        except Exception as exc:
            logger.error("Failed to fetch popular trains: %s", exc)
            if settings.ENABLE_MOCK_FALLBACK:
                return self._generate_mock_popular_trains()
            raise

    async def search_trains(self, query: str) -> List[Dict[str, Any]]:
        """Search trains by number or name."""
        cache_key = f"lookup:trains:{query.strip().lower()}"
        cached = await cache.get(cache_key)
        if cached is not None:
            return cached

        url = f"{self.base_url}/lookup/search/trains"
        params = {"q": query.strip(), "limit": 10}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.get(url, headers=self._get_headers(), params=params)

            if res.status_code == 200:
                data = res.json()
                items = data.get("data", data)
                train_list = items if isinstance(items, list) else items.get("trains", [])
                await cache.set(cache_key, train_list, ttl_seconds=settings.CACHE_TTL_STATIC_SECONDS)
                return train_list

            if settings.ENABLE_MOCK_FALLBACK:
                return self._generate_mock_search_trains(query)
            res.raise_for_status()
        except Exception as exc:
            logger.error("Failed to search trains for '%s': %s", query, exc)
            if settings.ENABLE_MOCK_FALLBACK:
                return self._generate_mock_search_trains(query)
            raise

    async def search_stations(self, query: str) -> List[Dict[str, Any]]:
        """Search stations by name or code."""
        cache_key = f"lookup:stations:{query.strip().lower()}"
        cached = await cache.get(cache_key)
        if cached is not None:
            return cached

        url = f"{self.base_url}/lookup/search/stations"
        params = {"q": query.strip(), "limit": 8}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.get(url, headers=self._get_headers(), params=params)

            if res.status_code == 200:
                data = res.json()
                items = data.get("data", data)
                station_list = items if isinstance(items, list) else items.get("stations", [])
                await cache.set(cache_key, station_list, ttl_seconds=settings.CACHE_TTL_STATIC_SECONDS)
                return station_list

            if settings.ENABLE_MOCK_FALLBACK:
                return self._generate_mock_search_stations(query)
            res.raise_for_status()
        except Exception as exc:
            logger.error("Failed to search stations for '%s': %s", query, exc)
            if settings.ENABLE_MOCK_FALLBACK:
                return self._generate_mock_search_stations(query)
            raise

    async def get_trains_between(
        self, from_code: str, to_code: str, date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Fetch trains running between two stations."""
        cache_key = f"between:{from_code.upper()}:{to_code.upper()}:{date or 'all'}"
        cached = await cache.get(cache_key)
        if cached is not None:
            return cached

        url = f"{self.base_url}/trains/between/{from_code}/{to_code}"
        params = {}
        if date:
            params["date"] = date

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.get(url, headers=self._get_headers(), params=params)

            if res.status_code == 200:
                body = res.json()
                data = body.get("data", body) if isinstance(body, dict) else body
                await cache.set(cache_key, data, ttl_seconds=settings.CACHE_TTL_STATIC_SECONDS)
                return data

            if settings.ENABLE_MOCK_FALLBACK:
                return self._generate_mock_trains_between(from_code, to_code, date)
            res.raise_for_status()
        except Exception as exc:
            logger.error("Failed to fetch trains between %s and %s: %s", from_code, to_code, exc)
            if settings.ENABLE_MOCK_FALLBACK:
                return self._generate_mock_trains_between(from_code, to_code, date)
            raise

    # --------------------------------------------------------------------------
    # Realistic Fallback Mock Data Generators (Ensures demo reliability)
    # --------------------------------------------------------------------------

    def _generate_mock_live_status(
        self, train_number: str, date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate realistic live status for testing and demo resilience."""
        today = date or datetime.date.today().isoformat()
        return {
            "trainNumber": str(train_number),
            "trainName": "Malwa SF Express" if train_number == "12919" else f"Express {train_number}",
            "startDate": today,
            "lastUpdatedAt": f"{today}T10:30:00+05:30",
            "status": "running",
            "delayMinutes": 18.0,
            "train": {
                "number": str(train_number),
                "name": "Malwa SF Express" if train_number == "12919" else f"Express {train_number}",
                "type": "Superfast Express",
                "category": "Superfast",
                "source": {"code": "INDB", "name": "Indore Junction"},
                "destination": {"code": "SVDK", "name": "Shri Mata Vaishno Devi Katra"},
                "runDays": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
                "distance": 1640.0,
                "duration": 1720,
                "avgSpeed": 57.2,
                "maxSpeed": 110.0,
                "totalHalts": 6,
            },
            "currentLocation": {
                "stationCode": "DWX",
                "sequence": 2,
                "status": "departed",
                "isHalt": True,
                "isDiverted": False,
                "isActualPosition": True,
                "segmentProgress": 0.65,
                "speedKmh": 78.0,
                "bearingDegrees": 45.0,
            },
            "previousHalt": {
                "stationCode": "DWX",
                "stationName": "Dewas Junction",
                "sequence": 2,
                "distance": 39.0,
            },
            "nextHalt": {
                "stationCode": "UJN",
                "stationName": "Ujjain Junction",
                "sequence": 3,
                "distance": 79.0,
            },
            "route": [
                {
                    "sequence": 1,
                    "stationCode": "INDB",
                    "stationName": "Indore Junction",
                    "isHalt": True,
                    "lat": 22.7196,
                    "lng": 75.8577,
                    "scheduledArrival": None,
                    "scheduledDeparture": f"{today}T08:00:00+05:30",
                    "actualArrival": None,
                    "actualDeparture": f"{today}T08:05:00+05:30",
                    "delayArrival": 0.0,
                    "delayDeparture": 5.0,
                    "status": "departed",
                    "distance": 0.0,
                    "platform": "1",
                },
                {
                    "sequence": 2,
                    "stationCode": "DWX",
                    "stationName": "Dewas Junction",
                    "isHalt": True,
                    "lat": 22.9676,
                    "lng": 76.0534,
                    "scheduledArrival": f"{today}T08:45:00+05:30",
                    "scheduledDeparture": f"{today}T08:47:00+05:30",
                    "actualArrival": f"{today}T08:58:00+05:30",
                    "actualDeparture": f"{today}T09:02:00+05:30",
                    "delayArrival": 13.0,
                    "delayDeparture": 15.0,
                    "status": "departed",
                    "distance": 39.0,
                    "platform": "2",
                },
                {
                    "sequence": 3,
                    "stationCode": "UJN",
                    "stationName": "Ujjain Junction",
                    "isHalt": True,
                    "lat": 23.1765,
                    "lng": 75.7885,
                    "scheduledArrival": f"{today}T09:40:00+05:30",
                    "scheduledDeparture": f"{today}T09:55:00+05:30",
                    "actualArrival": None,
                    "actualDeparture": None,
                    "delayArrival": None,
                    "delayDeparture": None,
                    "status": "upcoming",
                    "distance": 79.0,
                    "platform": "4",
                },
                {
                    "sequence": 4,
                    "stationCode": "BPL",
                    "stationName": "Bhopal Junction",
                    "isHalt": True,
                    "lat": 23.2599,
                    "lng": 77.4126,
                    "scheduledArrival": f"{today}T12:30:00+05:30",
                    "scheduledDeparture": f"{today}T12:40:00+05:30",
                    "actualArrival": None,
                    "actualDeparture": None,
                    "delayArrival": None,
                    "delayDeparture": None,
                    "status": "upcoming",
                    "distance": 262.0,
                    "platform": "3",
                },
                {
                    "sequence": 5,
                    "stationCode": "GWL",
                    "stationName": "Gwalior Junction",
                    "isHalt": True,
                    "lat": 26.2183,
                    "lng": 78.1828,
                    "scheduledArrival": f"{today}T18:05:00+05:30",
                    "scheduledDeparture": f"{today}T18:10:00+05:30",
                    "actualArrival": None,
                    "actualDeparture": None,
                    "delayArrival": None,
                    "delayDeparture": None,
                    "status": "upcoming",
                    "distance": 651.0,
                    "platform": "1",
                },
                {
                    "sequence": 6,
                    "stationCode": "NDLS",
                    "stationName": "New Delhi",
                    "isHalt": True,
                    "lat": 28.6424,
                    "lng": 77.2197,
                    "scheduledArrival": f"{today}T23:30:00+05:30",
                    "scheduledDeparture": None,
                    "actualArrival": None,
                    "actualDeparture": None,
                    "delayArrival": None,
                    "delayDeparture": None,
                    "status": "upcoming",
                    "distance": 964.0,
                    "platform": "5",
                },
            ],
        }

    def _generate_mock_schedule(self, train_number: str) -> Dict[str, Any]:
        mock_live = self._generate_mock_live_status(train_number)
        return {
            "train": mock_live["train"],
            "route": [
                {
                    "sequence": s["sequence"],
                    "station": {"code": s["stationCode"], "name": s["stationName"]},
                    "arrival": s["scheduledArrival"][11:16] if s["scheduledArrival"] else None,
                    "departure": s["scheduledDeparture"][11:16] if s["scheduledDeparture"] else None,
                    "arrivalDay": 1,
                    "departureDay": 1,
                    "distance": s["distance"],
                    "isHalt": True,
                    "platform": s.get("platform", "1"),
                }
                for s in mock_live["route"]
            ],
        }

    def _generate_mock_route_geometry(self, train_number: str) -> Dict[str, Any]:
        mock_live = self._generate_mock_live_status(train_number)
        coords = [[s["lng"], s["lat"]] for s in mock_live["route"] if s.get("lat") and s.get("lng")]
        stops = [
            {
                "sequence": s["sequence"],
                "code": s["stationCode"],
                "name": s["stationName"],
                "lat": s["lat"],
                "lng": s["lng"],
            }
            for s in mock_live["route"]
            if s.get("lat") and s.get("lng")
        ]
        return {
            "trainNumber": str(train_number),
            "format": "geojson",
            "geojson": {
                "type": "Feature",
                "properties": {"trainNumber": str(train_number)},
                "geometry": {
                    "type": "LineString",
                    "coordinates": coords,
                },
            },
            "stops": stops,
        }

    def _generate_mock_popular_trains(self) -> List[Dict[str, Any]]:
        return [
            {"number": "12951", "name": "Mumbai Rajdhani", "source": "Mumbai Central", "destination": "New Delhi"},
            {"number": "12919", "name": "Malwa SF Express", "source": "Indore Junction", "destination": "SVDK Katra"},
            {"number": "22222", "name": "CSMT Rajdhani", "source": "Mumbai CSMT", "destination": "Hazrat Nizamuddin"},
            {"number": "12002", "name": "Bhopal Shatabdi", "source": "New Delhi", "destination": "Rani Kamlapati"},
            {"number": "12301", "name": "Howrah Rajdhani", "source": "Howrah Junction", "destination": "New Delhi"},
            {"number": "20901", "name": "Vande Bharat Express", "source": "Mumbai Central", "destination": "Gandhinagar Cap"},
            {"number": "12431", "name": "Trivandrum Rajdhani", "source": "Thiruvananthapuram", "destination": "H Nizamuddin"},
            {"number": "12626", "name": "Kerala Express", "source": "New Delhi", "destination": "Thiruvananthapuram"},
        ]

    def _generate_mock_search_trains(self, query: str) -> List[Dict[str, Any]]:
        q = query.strip().lower()
        all_trains = [
            {"train_number": "12951", "train_name": "Mumbai Rajdhani Express", "source": "MMCT", "destination": "NDLS"},
            {"train_number": "12919", "train_name": "Malwa SF Express", "source": "INDB", "destination": "SVDK"},
            {"train_number": "22222", "train_name": "CSMT Rajdhani Express", "source": "CSMT", "destination": "NZM"},
            {"train_number": "12002", "train_name": "Bhopal Shatabdi Express", "source": "NDLS", "destination": "RKMP"},
            {"train_number": "12301", "train_name": "Howrah Rajdhani Express", "source": "HWH", "destination": "NDLS"},
            {"train_number": "20901", "train_name": "Vande Bharat Express", "source": "MMCT", "destination": "GNC"},
        ]
        matched = [t for t in all_trains if q in t["train_number"].lower() or q in t["train_name"].lower()]
        return matched if matched else [
            {"train_number": query, "train_name": f"Express {query}", "source": "INDB", "destination": "NDLS"}
        ]

    def _generate_mock_search_stations(self, query: str) -> List[Dict[str, Any]]:
        q = query.strip().lower()
        all_stations = [
            {"code": "NDLS", "name": "New Delhi", "city": "Delhi", "state": "Delhi", "lat": 28.6424, "lng": 77.2197},
            {"code": "BPL", "name": "Bhopal Junction", "city": "Bhopal", "state": "Madhya Pradesh", "lat": 23.2599, "lng": 77.4126},
            {"code": "INDB", "name": "Indore Junction", "city": "Indore", "state": "Madhya Pradesh", "lat": 22.7196, "lng": 75.8577},
            {"code": "MMCT", "name": "Mumbai Central", "city": "Mumbai", "state": "Maharashtra", "lat": 18.9696, "lng": 72.8193},
            {"code": "CSMT", "name": "Mumbai CSMT", "city": "Mumbai", "state": "Maharashtra", "lat": 18.9401, "lng": 72.8347},
            {"code": "ST", "name": "Surat", "city": "Surat", "state": "Gujarat", "lat": 21.2049, "lng": 72.8411},
            {"code": "BRC", "name": "Vadodara Junction", "city": "Vadodara", "state": "Gujarat", "lat": 22.3107, "lng": 73.1812},
            {"code": "RTM", "name": "Ratlam Junction", "city": "Ratlam", "state": "Madhya Pradesh", "lat": 23.3441, "lng": 75.0354},
            {"code": "KOTA", "name": "Kota Junction", "city": "Kota", "state": "Rajasthan", "lat": 25.2138, "lng": 75.8648},
            {"code": "UJN", "name": "Ujjain Junction", "city": "Ujjain", "state": "Madhya Pradesh", "lat": 23.1815, "lng": 75.7772},
            {"code": "GWL", "name": "Gwalior Junction", "city": "Gwalior", "state": "Madhya Pradesh", "lat": 26.2183, "lng": 78.1828},
            {"code": "HWH", "name": "Howrah Junction", "city": "Kolkata", "state": "West Bengal", "lat": 22.5840, "lng": 88.3426},
            {"code": "SVDK", "name": "Shri Mata Vaishno Devi Katra", "city": "Katra", "state": "Jammu and Kashmir", "lat": 32.9917, "lng": 74.9317},
        ]
        matched = [s for s in all_stations if q in s["code"].lower() or q in s["name"].lower() or q in s.get("city", "").lower()]
        return matched if matched else [
            {"code": query.upper()[:4], "name": f"{query.title()} Junction", "city": query.title(), "state": "India", "lat": 28.6139, "lng": 77.2090}
        ]

    def _generate_mock_trains_between(
        self, from_code: str, to_code: str, date: Optional[str] = None
    ) -> Dict[str, Any]:
        # Return plain data dict; the endpoint wraps it in ApiResponse(success=True, data=...)
        return {
            "from": from_code.upper(),
            "to": to_code.upper(),
            "date": date or datetime.date.today().isoformat(),
            "trains": [
                {
                    "train": {
                        "number": "12919",
                        "name": "Malwa SF Express",
                        "type": "Superfast",
                        "runDays": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
                    },
                    "from": {
                        "code": from_code.upper(),
                        "name": f"{from_code.upper()} Station",
                        "departure": "12:15",
                    },
                    "to": {
                        "code": to_code.upper(),
                        "name": f"{to_code.upper()} Station",
                        "arrival": "23:45",
                    },
                    "duration": 690,
                    "distance": 820,
                    "totalHaltsBetween": 14,
                },
                {
                    "train": {
                        "number": "12951",
                        "name": "Rajdhani Express",
                        "type": "Rajdhani",
                        "runDays": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
                    },
                    "from": {
                        "code": from_code.upper(),
                        "name": f"{from_code.upper()} Station",
                        "departure": "17:00",
                    },
                    "to": {
                        "code": to_code.upper(),
                        "name": f"{to_code.upper()} Station",
                        "arrival": "08:35",
                    },
                    "duration": 935,
                    "distance": 1385,
                    "totalHaltsBetween": 6,
                },
                ],
        }


railradar_client = RailRadarClient()
