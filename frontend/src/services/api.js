/**
 * Unified API Client for Indian Railways Dynamic ETA & Telemetry Backend.
 * Connects directly to the FastAPI service (default: http://localhost:8000/api/v1).
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

/**
 * Generic request helper with JSON parsing and standardized error reporting.
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${BASE_URL.replace(/\/$/, "")}${endpoint}`;
  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg =
        data?.error ||
        data?.detail ||
        data?.message ||
        `Request failed with status ${response.status}`;
      throw new Error(errorMsg);
    }

    return data;
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error);
    throw error;
  }
}

export const trainApi = {
  /**
   * Fetch ML Dynamic ETA Prediction for a train.
   * Produces dynamic predicted arrival/departure times, predicted delays,
   * delay trends (improving/stable/increasing), and active model information.
   */
  async fetchDynamicETA(trainNumber, date = null, authoritative = false) {
    const params = new URLSearchParams();
    if (date) params.append("date", date);
    if (authoritative) params.append("authoritative", "true");
    const qs = params.toString() ? `?${params.toString()}` : "";
    return apiRequest(`/trains/${encodeURIComponent(trainNumber)}/eta${qs}`);
  },

  /**
   * Fetch raw live telemetry and train location.
   */
  async fetchLiveStatus(trainNumber, date = null, authoritative = false) {
    const params = new URLSearchParams();
    if (date) params.append("date", date);
    if (authoritative) params.append("authoritative", "true");
    const qs = params.toString() ? `?${params.toString()}` : "";
    return apiRequest(`/trains/${encodeURIComponent(trainNumber)}/live${qs}`);
  },

  /**
   * Fetch GIS track geometry (GeoJSON coordinates) for map polyline rendering.
   */
  async fetchRouteGeometry(trainNumber, format = "geojson", stops = true) {
    return apiRequest(
      `/trains/${encodeURIComponent(trainNumber)}/route?format=${format}&stops=${stops}`
    );
  },

  /**
   * Fetch train schedule and full timetable.
   */
  async fetchTrainSchedule(trainNumber, haltsOnly = true) {
    return apiRequest(
      `/trains/${encodeURIComponent(trainNumber)}/schedule?haltsOnly=${haltsOnly}`
    );
  },

  /**
   * Fetch list of popular trains.
   */
  async fetchPopularTrains() {
    return apiRequest("/lookup/trains/popular");
  },

  /**
   * Search trains by train number or name.
   */
  async searchTrains(query) {
    if (!query || !query.trim()) return { success: true, data: [] };
    return apiRequest(`/lookup/search/trains?q=${encodeURIComponent(query.trim())}`);
  },

  /**
   * Search stations by name or code for autocomplete.
   */
  async searchStations(query) {
    if (!query || !query.trim()) return { success: true, data: [] };
    return apiRequest(`/lookup/search/stations?q=${encodeURIComponent(query.trim())}`);
  },

  /**
   * Find trains running between two stations.
   */
  async fetchTrainsBetween(fromCode, toCode, date = null) {
    const params = new URLSearchParams({ from: fromCode, to: toCode });
    if (date) params.append("date", date);
    return apiRequest(`/trains/between?${params.toString()}`);
  },

  /**
   * Check backend health, model load state, and cache statistics.
   */
  async fetchHealth() {
    return apiRequest("/health");
  },
};

export default trainApi;
