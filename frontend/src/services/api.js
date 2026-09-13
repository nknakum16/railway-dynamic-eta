/**
 * Unified API Client for Indian Railways Dynamic ETA, Auth & Journey Alarms.
 * Connects directly to the FastAPI service (default: http://localhost:8000/api/v1).
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

const TOKEN_STORAGE_KEY = "railway_auth_token";
const USER_STORAGE_KEY = "railway_auth_user";
const SESSION_STORAGE_KEY = "railway_session_id";

export function getSessionId() {
  let sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!sessionId) {
    sessionId = "sess_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }
  return sessionId;
}

/**
 * Generic request helper with JSON parsing, auth header injection, and standardized error reporting.
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${BASE_URL.replace(/\/$/, "")}${endpoint}`;
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);

  const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
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

export const authApi = {
  getToken() {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  },

  getUser() {
    try {
      const stored = localStorage.getItem(USER_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  },

  setSession(token, user) {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    if (user) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  },

  logout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  },

  async signup(fullName, email, password) {
    const result = await apiRequest("/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        full_name: fullName,
        email,
        password,
      }),
    });
    if (result?.data?.access_token) {
      this.setSession(result.data.access_token, result.data.user);
    }
    return result;
  },

  async login(email, password) {
    const result = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (result?.data?.access_token) {
      this.setSession(result.data.access_token, result.data.user);
    }
    return result;
  },

  async getProfile() {
    return apiRequest("/auth/me");
  },
};

export const journeyApi = {
  async createAlarm(payload) {
    return apiRequest("/journey/alarm", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async getAlarms(statusFilter = null) {
    const qs = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : "";
    return apiRequest(`/journey/alarms${qs}`);
  },

  async updateAlarmStatus(alarmId, status) {
    return apiRequest(`/journey/alarm/${alarmId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
  },

  async deleteAlarm(alarmId) {
    return apiRequest(`/journey/alarm/${alarmId}`, {
      method: "DELETE",
    });
  },
};

export const trainApi = {
  /**
   * Fetch ML Dynamic ETA Prediction for a train.
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

export const notificationApi = {
  getSessionId,

  /**
   * Watch a train journey with passenger preferences.
   */
  async watchJourney(payload) {
    const sessionId = getSessionId();
    return apiRequest("/notifications/watch", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        session_id: sessionId,
      }),
    });
  },

  /**
   * Fetch passenger's active watched journeys.
   */
  async getWatchedJourneys() {
    const sessionId = getSessionId();
    return apiRequest(`/notifications/watched?session_id=${encodeURIComponent(sessionId)}`);
  },

  /**
   * Unwatch a train journey.
   */
  async unwatchJourney(watchedId) {
    const sessionId = getSessionId();
    return apiRequest(`/notifications/watched/${watchedId}?session_id=${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    });
  },

  /**
   * Retrieve notification history and unread badge count.
   */
  async getNotifications(limit = 50) {
    const sessionId = getSessionId();
    return apiRequest(`/notifications?session_id=${encodeURIComponent(sessionId)}&limit=${limit}`);
  },

  /**
   * Mark a single notification as read.
   */
  async markAsRead(notificationId) {
    const sessionId = getSessionId();
    return apiRequest(`/notifications/${notificationId}/read?session_id=${encodeURIComponent(sessionId)}`, {
      method: "PUT",
    });
  },

  /**
   * Mark all notifications as read.
   */
  async markAllAsRead() {
    const sessionId = getSessionId();
    return apiRequest(`/notifications/read-all?session_id=${encodeURIComponent(sessionId)}`, {
      method: "PUT",
    });
  },

  /**
   * Run server-side journey evaluation and receive newly triggered alerts.
   */
  async evaluateNotifications(userCoords = null) {
    const sessionId = getSessionId();
    const payload = { session_id: sessionId };
    if (userCoords && userCoords.latitude && userCoords.longitude) {
      payload.user_lat = userCoords.latitude;
      payload.user_lng = userCoords.longitude;
    }
    return apiRequest("/notifications/evaluate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};

export default trainApi;
