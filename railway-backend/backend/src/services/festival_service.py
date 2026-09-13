import datetime
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import httpx

from src.core.config import settings
from src.core.logging import logger

# Curated list of major high-traffic Indian festivals that trigger peak railway travel rush
MAJOR_INDIAN_FESTIVALS = {
    "diwali",
    "deepavali",
    "holi",
    "chhath puja",
    "eid",
    "eid ul-fitr",
    "eid al-fitr",
    "eid al-adha",
    "eid ul-adha",
    "bakrid",
    "dussehra",
    "vijayadashami",
    "durga puja",
    "ganesh chaturthi",
    "raksha bandhan",
    "karva chauth",
    "maha shivaratri",
    "shivaratri",
    "janmashtami",
    "krishna janmashtami",
    "pongal",
    "makar sankranti",
    "navratri",
    "republic day",
    "independence day",
    "gandhi jayanti",
    "christmas",
}


class FestivalService:
    """Service to fetch, cache, and compute Calendarific festival factor features for railway delay modeling."""

    def __init__(self) -> None:
        self._memory_cache: Dict[int, List[Dict[str, Any]]] = {}
        self.cache_dir = Path(settings.CALENDARIFIC_CACHE_DIR)
        self.timeout_seconds = 5.0

    def _ensure_cache_dir(self) -> None:
        """Create cache directory if it does not exist."""
        try:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            logger.warning("Could not create festival cache directory: %s", exc)

    def get_holidays_for_year(self, year: int) -> List[Dict[str, Any]]:
        """Retrieve holiday list for an Indian calendar year using two-tier memory & disk caching.

        Never makes redundant API calls; fetches once per year.
        """
        # Tier 1: In-Memory Cache
        if year in self._memory_cache:
            return self._memory_cache[year]

        # Tier 2: Persistent Local JSON Disk Cache
        self._ensure_cache_dir()
        disk_file = self.cache_dir / f"{year}.json"

        if disk_file.is_file():
            try:
                with open(disk_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list) and len(data) > 0:
                        self._memory_cache[year] = data
                        logger.info("Loaded %d Indian festivals for year %d from disk cache", len(data), year)
                        return data
            except Exception as exc:
                logger.warning("Failed to read disk cache for festival year %d: %s", year, exc)

        # Tier 3: Fetch from Calendarific API
        holidays = self._fetch_from_api(year)
        if holidays:
            self._memory_cache[year] = holidays
            try:
                with open(disk_file, "w", encoding="utf-8") as f:
                    json.dump(holidays, f, indent=2)
                logger.info("Cached %d Indian festivals for %d to %s", len(holidays), year, disk_file)
            except Exception as exc:
                logger.warning("Failed writing festival cache file: %s", exc)
            return holidays

        # Fallback if API unavailable and no cache exists
        logger.warning("Using offline fallback festival catalog for year %d", year)
        fallback = self._get_offline_fallback(year)
        self._memory_cache[year] = fallback
        return fallback

    def _fetch_from_api(self, year: int) -> List[Dict[str, Any]]:
        """Call Calendarific API to fetch national/religious/restricted holidays for India."""
        api_key = settings.CALENDARIFIC_API_KEY
        if not api_key:
            logger.warning("CALENDARIFIC_API_KEY is not set. Using offline fallback.")
            return []

        url = f"{settings.CALENDARIFIC_BASE_URL.rstrip('/')}/holidays"
        params = {
            "api_key": api_key,
            "country": settings.CALENDARIFIC_COUNTRY,
            "year": year,
        }

        try:
            logger.info("Fetching holiday schedule from Calendarific for country=%s, year=%d...", settings.CALENDARIFIC_COUNTRY, year)
            with httpx.Client(timeout=self.timeout_seconds) as client:
                res = client.get(url, params=params)

            if res.status_code == 200:
                body = res.json()
                items = body.get("response", {}).get("holidays", [])
                logger.info("Calendarific returned %d holidays for year %d", len(items), year)
                return items

            logger.error("Calendarific API returned HTTP %d: %s", res.status_code, res.text[:200])
        except Exception as exc:
            logger.error("Failed to connect to Calendarific API for year %d: %s", year, exc)

        return []

    def get_features_for_date(self, journey_date_input: Any) -> Dict[str, Any]:
        """Compute numerical festival features for a given train journey date.

        Returns a dictionary with:
          - is_festival (int: 0 or 1)
          - festival_name (str)
          - festival_importance (float: 0.0 to 3.0)
          - days_to_festival (float)
          - days_from_festival (float)
          - festival_factor (float: 0.0 to 3.0)
          - historical_festival_delay (float: extra expected delay buffer)
        """
        journey_date = self._parse_date(journey_date_input)
        if not journey_date:
            journey_date = datetime.date.today()

        year = journey_date.year
        holidays = self.get_holidays_for_year(year)

        # Include edge years if near year boundary
        if journey_date.month == 1 and journey_date.day <= 7:
            holidays = holidays + self.get_holidays_for_year(year - 1)
        elif journey_date.month == 12 and journey_date.day >= 25:
            holidays = holidays + self.get_holidays_for_year(year + 1)

        window = settings.FESTIVAL_WINDOW_DAYS
        closest_holiday = None
        min_abs_diff = float("inf")
        min_days_to = 99.0
        min_days_from = 99.0

        for h in holidays:
            h_date = self._extract_holiday_date(h)
            if not h_date:
                continue

            diff = (journey_date - h_date).days
            abs_diff = abs(diff)

            if abs_diff < min_abs_diff:
                min_abs_diff = abs_diff
                closest_holiday = h

            # If holiday is in the future
            if diff <= 0 and abs(diff) < min_days_to:
                min_days_to = float(abs(diff))

            # If holiday is in the past
            if diff >= 0 and diff < min_days_from:
                min_days_from = float(diff)

        # Evaluate proximity
        is_fest = 1 if min_abs_diff <= window and closest_holiday is not None else 0
        fest_name = closest_holiday["name"] if (is_fest and closest_holiday) else "None"

        # Calculate importance
        importance = 0.0
        if is_fest and closest_holiday:
            name_lower = closest_holiday.get("name", "").lower()
            ptype = str(closest_holiday.get("primary_type", "")).lower()

            # Major rush festivals
            if any(m in name_lower for m in MAJOR_INDIAN_FESTIVALS):
                importance = 3.0
            elif "gazetted" in ptype or "national" in ptype:
                importance = 2.0
            else:
                importance = 1.0

        # Continuous smooth festival factor: peaks on festival day, decays over window
        # e.g., if window=3: day 0 -> 1.0 * importance, day 1 -> 0.75 * importance, day 3 -> 0.25 * importance
        if is_fest and min_abs_diff <= window:
            decay = (window + 1 - min_abs_diff) / (window + 1)
            festival_factor = round(importance * decay, 2)
        else:
            festival_factor = 0.0

        # Non-leaking historical festival delay buffer:
        # Standard peak festival delay inflation in Indian Railways (scaled by festival factor)
        hist_delay = round(15.0 * (festival_factor / 3.0), 2) if is_fest else 0.0

        return {
            "is_festival": is_fest,
            "festival_name": fest_name,
            "festival_importance": importance,
            "days_to_festival": min_days_to,
            "days_from_festival": min_days_from,
            "festival_factor": festival_factor,
            "historical_festival_delay": hist_delay,
        }

    def _extract_holiday_date(self, holiday: Dict[str, Any]) -> Optional[datetime.date]:
        """Extract a datetime.date from Calendarific holiday structure."""
        try:
            date_dict = holiday.get("date", {})
            iso_str = date_dict.get("iso")
            if iso_str:
                return datetime.datetime.strptime(iso_str[:10], "%Y-%m-%d").date()

            dt = date_dict.get("datetime", {})
            if "year" in dt and "month" in dt and "day" in dt:
                return datetime.date(int(dt["year"]), int(dt["month"]), int(dt["day"]))
        except Exception:
            pass
        return None

    def _parse_date(self, date_input: Any) -> Optional[datetime.date]:
        """Convert various date input types to datetime.date."""
        if isinstance(date_input, datetime.date):
            return date_input
        if isinstance(date_input, datetime.datetime):
            return date_input.date()
        if isinstance(date_input, str) and len(date_input) >= 10:
            try:
                return datetime.datetime.strptime(date_input[:10], "%Y-%m-%d").date()
            except Exception:
                pass
        return None

    def _get_offline_fallback(self, year: int) -> List[Dict[str, Any]]:
        """Static catalog of prominent recurring Indian holidays for offline fallback."""
        return [
            {"name": "Republic Day", "date": {"iso": f"{year}-01-26"}, "primary_type": "Gazetted Holiday"},
            {"name": "Maha Shivaratri", "date": {"iso": f"{year}-02-18"}, "primary_type": "Restricted Holiday"},
            {"name": "Holi", "date": {"iso": f"{year}-03-14"}, "primary_type": "Gazetted Holiday"},
            {"name": "Eid ul-Fitr", "date": {"iso": f"{year}-03-31"}, "primary_type": "Gazetted Holiday"},
            {"name": "Independence Day", "date": {"iso": f"{year}-08-15"}, "primary_type": "Gazetted Holiday"},
            {"name": "Ganesh Chaturthi", "date": {"iso": f"{year}-09-15"}, "primary_type": "Restricted Holiday"},
            {"name": "Gandhi Jayanti", "date": {"iso": f"{year}-10-02"}, "primary_type": "Gazetted Holiday"},
            {"name": "Dussehra", "date": {"iso": f"{year}-10-20"}, "primary_type": "Gazetted Holiday"},
            {"name": "Diwali", "date": {"iso": f"{year}-11-08"}, "primary_type": "Gazetted Holiday"},
            {"name": "Chhath Puja", "date": {"iso": f"{year}-11-14"}, "primary_type": "Restricted Holiday"},
            {"name": "Christmas", "date": {"iso": f"{year}-12-25"}, "primary_type": "Gazetted Holiday"},
        ]


festival_service = FestivalService()
