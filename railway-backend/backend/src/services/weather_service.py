import datetime
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import httpx

from src.core.logging import logger

# Open-Meteo Public Endpoints (No API key required)
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"


class WeatherService:
    """Service to fetch, cache, and compute Open-Meteo weather factor features for railway delay modeling.

    Features:
    - Zero API key requirement (standard Open-Meteo endpoints)
    - Two-tier caching (In-Memory + Local JSON Disk Cache)
    - Smart routing between historical archive endpoint and forecast endpoint
    - Location-specific coordinate matching (train stations)
    - Prediction-time hour alignment (no future data leakage)
    - Safe offline fallbacks when network is unavailable
    """

    def __init__(self, cache_dir: str = "data/weather") -> None:
        self._memory_cache: Dict[str, Dict[str, Any]] = {}
        self.cache_dir = Path(cache_dir)
        self.timeout_seconds = 6.0
        self._ensure_cache_dir()

    def _ensure_cache_dir(self) -> None:
        try:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            logger.warning("Could not create weather cache directory: %s", exc)

    def _get_cache_key(self, lat: float, lng: float, date_str: str) -> str:
        # Round coordinates to 2 decimal places (~1.1 km precision) to maximize cache hits
        return f"{lat:.2f}_{lng:.2f}_{date_str[:10]}"

    def get_weather_for_location_and_time(
        self,
        lat: Optional[float],
        lng: Optional[float],
        dt: Optional[datetime.datetime] = None,
    ) -> Dict[str, Any]:
        """Retrieve weather observations/forecasts for given coordinates and datetime.

        Returns structured dictionary of weather variables and derived risk factors.
        """
        if lat is None or lng is None:
            return self._get_default_weather()

        if dt is None:
            dt = datetime.datetime.now()

        date_str = dt.strftime("%Y-%m-%d")
        hour = dt.hour
        cache_key = self._get_cache_key(lat, lng, date_str)

        # 1. Check Memory Cache
        if cache_key in self._memory_cache:
            day_data = self._memory_cache[cache_key]
            return self._extract_hourly_features(day_data, hour)

        # 2. Check Local Disk Cache
        disk_file = self.cache_dir / f"{cache_key}.json"
        if disk_file.is_file():
            try:
                with open(disk_file, "r", encoding="utf-8") as f:
                    day_data = json.load(f)
                    if isinstance(day_data, dict) and "hourly" in day_data:
                        self._memory_cache[cache_key] = day_data
                        return self._extract_hourly_features(day_data, hour)
            except Exception as exc:
                logger.warning("Failed to read disk cache for %s: %s", cache_key, exc)

        # 3. Fetch from Open-Meteo
        day_data = self._fetch_open_meteo(lat, lng, date_str)
        if day_data:
            self._memory_cache[cache_key] = day_data
            try:
                with open(disk_file, "w", encoding="utf-8") as f:
                    json.dump(day_data, f, indent=2)
            except Exception as exc:
                logger.warning("Failed to write disk cache for %s: %s", cache_key, exc)
            return self._extract_hourly_features(day_data, hour)

        # 4. Safe fallback if network/API failed
        return self._get_default_weather()

    def _fetch_open_meteo(self, lat: float, lng: float, date_str: str) -> Optional[Dict[str, Any]]:
        """Query either Open-Meteo forecast or historical archive based on date."""
        target_date = datetime.date.fromisoformat(date_str)
        today = datetime.date.today()
        diff_days = (today - target_date).days

        hourly_vars = (
            "temperature_2m,precipitation,rain,wind_speed_10m,visibility,weather_code"
        )

        # Dates older than 5 days require historical archive API
        if diff_days > 5:
            endpoint = OPEN_METEO_ARCHIVE_URL
            params = {
                "latitude": round(lat, 4),
                "longitude": round(lng, 4),
                "start_date": date_str,
                "end_date": date_str,
                "hourly": hourly_vars,
                "timezone": "Asia/Kolkata",
            }
        else:
            endpoint = OPEN_METEO_FORECAST_URL
            params = {
                "latitude": round(lat, 4),
                "longitude": round(lng, 4),
                "start_date": date_str,
                "end_date": date_str,
                "hourly": hourly_vars,
                "timezone": "Asia/Kolkata",
            }

        try:
            with httpx.Client(timeout=self.timeout_seconds) as client:
                res = client.get(endpoint, params=params)
                if res.status_code == 200:
                    return res.json()
                logger.warning(
                    "Open-Meteo returned status %d for (%f, %f) on %s: %s",
                    res.status_code,
                    lat,
                    lng,
                    date_str,
                    res.text[:120],
                )
        except Exception as exc:
            logger.warning("Open-Meteo request error for (%f, %f): %s", lat, lng, exc)

        return None

    def _extract_hourly_features(self, day_data: Dict[str, Any], hour: int) -> Dict[str, Any]:
        """Extract observation for the specific hour and compute derived features."""
        hourly = day_data.get("hourly", {})
        times = hourly.get("time", [])

        idx = min(hour, len(times) - 1) if times else -1

        def get_val(key: str, default: float = 0.0) -> float:
            arr = hourly.get(key, [])
            if 0 <= idx < len(arr) and arr[idx] is not None:
                return float(arr[idx])
            return default

        temp = get_val("temperature_2m", 25.0)
        precip = get_val("precipitation", 0.0)
        rain = get_val("rain", precip)
        wind = get_val("wind_speed_10m", 10.0)
        vis = get_val("visibility", 10000.0)
        code = int(get_val("weather_code", 0))

        # Derived indicators based on meteorological & railway standards
        is_raining = 1 if (rain >= 1.0 or precip >= 1.0) else 0
        is_heavy_rain = 1 if (rain >= 15.0 or precip >= 15.0) else 0
        is_strong_wind = 1 if wind >= 40.0 else 0
        is_low_visibility = 1 if vis < 1000.0 else 0
        # Thunderstorm WMO codes: 95, 96, 99
        is_storm = 1 if code in (95, 96, 99) or (is_heavy_rain and is_strong_wind) else 0

        # Severity Score:
        # 0 = Normal
        # 1 = Mild (light rain or moderate wind)
        # 2 = Moderate (rain >= 8mm, or wind >= 30km/h, or vis < 2500m)
        # 3 = Severe (heavy rain >= 15mm, storm, low vis < 1000m, or wind >= 50km/h)
        if is_storm or is_heavy_rain or is_low_visibility or wind >= 50.0:
            severity = 3
        elif rain >= 8.0 or wind >= 30.0 or vis < 2500.0:
            severity = 2
        elif is_raining or wind >= 22.0 or vis < 5000.0:
            severity = 1
        else:
            severity = 0

        condition_desc = self._wmo_code_to_description(code, rain, wind, vis)

        return {
            "weather_severity": severity,
            "rain_mm": round(rain, 1),
            "precipitation_mm": round(precip, 1),
            "temperature_c": round(temp, 1),
            "wind_speed_kmh": round(wind, 1),
            "visibility_m": round(vis, 0),
            "weather_code": code,
            "is_raining": is_raining,
            "is_heavy_rain": is_heavy_rain,
            "is_storm": is_storm,
            "is_low_visibility": is_low_visibility,
            "is_strong_wind": is_strong_wind,
            "condition_description": condition_desc,
        }

    def _wmo_code_to_description(self, code: int, rain: float, wind: float, vis: float) -> str:
        """Convert WMO code and conditions to clear passenger-facing description."""
        if code in (95, 96, 99):
            return "Thunderstorm & High Wind"
        if rain >= 15.0:
            return "Heavy Rainfall"
        if vis < 1000.0:
            return "Dense Fog & Low Visibility"
        if vis < 3000.0:
            return "Moderate Fog"
        if rain >= 5.0:
            return "Moderate Rain"
        if rain >= 1.0:
            return "Light Rain / Drizzle"
        if wind >= 40.0:
            return "Strong Gusty Winds"
        if code in (1, 2, 3):
            return "Partly Cloudy"
        if code == 0:
            return "Clear Weather"
        return "Normal Track Conditions"

    def _get_default_weather(self) -> Dict[str, Any]:
        """Safe zero-leakage neutral baseline when coordinates or API are unavailable."""
        return {
            "weather_severity": 0,
            "rain_mm": 0.0,
            "precipitation_mm": 0.0,
            "temperature_c": 26.0,
            "wind_speed_kmh": 12.0,
            "visibility_m": 10000.0,
            "weather_code": 0,
            "is_raining": 0,
            "is_heavy_rain": 0,
            "is_storm": 0,
            "is_low_visibility": 0,
            "is_strong_wind": 0,
            "condition_description": "Normal Track Conditions",
        }


weather_service = WeatherService()
