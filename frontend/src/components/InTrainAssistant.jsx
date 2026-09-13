import { useState, useEffect, useRef } from "react";
import { trainApi, journeyApi } from "../services/api";
import { alarmService } from "../services/alarmAudio";

// Haversine formula to compute great-circle distance between two GPS coordinates in km
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371; // Radius of Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export default function InTrainAssistant({
  isOpen,
  onClose,
  initialTrain = null,
  currentUser = null,
  onAlarmCreated = null,
}) {
  // Steps: 1 = "Are you in train?", 2 = "Ask Location", 3 = "Select Destination", 4 = "Active Journey Tracking"
  const [step, setStep] = useState(1);

  // Train search and identification
  const [trainQuery, setTrainQuery] = useState(initialTrain?.number || "");
  const [trainSuggestions, setTrainSuggestions] = useState([]);
  const [searchingTrains, setSearchingTrains] = useState(false);
  const [loadingTrainData, setLoadingTrainData] = useState(false);
  const [trainLoadError, setTrainLoadError] = useState(null);

  // Active loaded train details
  const [activeTrain, setActiveTrain] = useState(initialTrain || null);
  const [currentStationInfo, setCurrentStationInfo] = useState(null); // { name, code, delay }
  const [upcomingStations, setUpcomingStations] = useState([]); // ONLY stations after current station

  // Destination selection
  const [destinationStation, setDestinationStation] = useState("");
  const [destinationCode, setDestinationCode] = useState("");
  const [destinationCoords, setDestinationCoords] = useState(null); // { lat, lng }
  const [destFilterQuery, setDestFilterQuery] = useState("");

  // Alarm threshold in km
  const [alarmRadiusKm, setAlarmRadiusKm] = useState(5.0);

  // Geolocation state
  const [userLocation, setUserLocation] = useState(null); // { lat, lon, accuracy, speed }
  const [locationError, setLocationError] = useState(null);
  const [isWatchingLocation, setIsWatchingLocation] = useState(false);
  const watchIdRef = useRef(null);

  // Active alarm state
  const [activeAlarm, setActiveAlarm] = useState(null);
  const [distanceToDest, setDistanceToDest] = useState(null);
  const [isAlarmTriggered, setIsAlarmTriggered] = useState(false);
  const [savingAlarm, setSavingAlarm] = useState(false);

  // Initialize with initialTrain if passed
  useEffect(() => {
    if (initialTrain) {
      setTrainQuery(initialTrain.number || "");
      processTrainData(initialTrain);
    }
  }, [initialTrain]);

  // Process and filter train route: strictly extract only upcoming stations after current station
  const processTrainData = (trainData) => {
    setActiveTrain(trainData);
    setTrainLoadError(null);

    const route = trainData.route || [];
    if (route.length === 0) {
      setUpcomingStations([]);
      setCurrentStationInfo(null);
      return;
    }

    // Determine current station index
    const currentCode =
      trainData.currentLocation?.stationCode ||
      trainData.currentStationCode ||
      null;

    let currentIdx = -1;

    // 1. Try finding by matching stationCode
    if (currentCode) {
      currentIdx = route.findIndex(
        (s) =>
          (s.stationCode && s.stationCode.toUpperCase() === currentCode.toUpperCase()) ||
          (s.code && s.code.toUpperCase() === currentCode.toUpperCase())
      );
    }

    // 2. Try finding by explicit 'current' status
    if (currentIdx === -1) {
      currentIdx = route.findIndex((s) => s.status === "current");
    }

    // 3. Try finding by last departed/completed station
    if (currentIdx === -1) {
      for (let i = route.length - 1; i >= 0; i--) {
        if (route[i].status === "departed" || route[i].status === "completed" || route[i].status === "passed") {
          currentIdx = i;
          break;
        }
      }
    }

    // If current station found, set info
    if (currentIdx >= 0) {
      const curStop = route[currentIdx];
      setCurrentStationInfo({
        name: curStop.station || curStop.stationName || "Current Station",
        code: curStop.stationCode || curStop.code || "",
        status: curStop.status || "departed",
      });
      // STRICT FILTER: Only stations AFTER the current station
      const nextStops = route.slice(currentIdx + 1);
      setUpcomingStations(nextStops);
    } else {
      // If train has not started yet or current station is origin, show all stations after origin
      setCurrentStationInfo({
        name: route[0]?.station || route[0]?.stationName || "Origin",
        code: route[0]?.stationCode || route[0]?.code || "",
        status: "Origin",
      });
      setUpcomingStations(route.slice(1));
    }

    // Reset selected destination when train changes
    setDestinationStation("");
    setDestinationCode("");
    setDestinationCoords(null);
  };

  // Fetch train route & live status when user enters train number or name
  const handleLoadTrain = async (trainNumOrQuery) => {
    const q = (trainNumOrQuery || trainQuery).trim();
    if (!q) return;

    setLoadingTrainData(true);
    setTrainLoadError(null);
    setTrainSuggestions([]);

    try {
      let targetNumber = q;

      // If query is not purely digits, search for matching trains
      if (!/^\d{4,5}$/.test(q)) {
        const searchRes = await trainApi.searchTrains(q);
        const trains = searchRes?.data || [];
        if (trains.length === 0) {
          throw new Error(`No train found matching "${q}". Please check the train number or name.`);
        }
        targetNumber = trains[0].train_number || trains[0].number || trains[0].trainNumber;
      }

      // Fetch dynamic ETA and route telemetry
      const result = await trainApi.fetchDynamicETA(targetNumber);
      if (!result?.success || !result?.data) {
        throw new Error("Unable to retrieve route and live status for this train.");
      }

      const etaData = result.data;
      const formattedTrain = {
        number: etaData.trainNumber,
        name: etaData.trainName,
        currentLocation: etaData.currentLocation,
        route: (etaData.route || []).map((s) => ({
          station: s.stationName,
          stationCode: s.stationCode,
          lat: s.lat,
          lng: s.lng || s.lon,
          scheduledArrival: s.scheduledArrival,
          predictedArrival: s.predictedArrival,
          status: s.status,
          distance: s.distance,
        })),
      };

      setTrainQuery(`${etaData.trainNumber} - ${etaData.trainName}`);
      processTrainData(formattedTrain);
    } catch (err) {
      console.error("Failed to load train route:", err);
      setTrainLoadError(err.message || "Could not load train route. Please verify train number.");
      setUpcomingStations([]);
    } finally {
      setLoadingTrainData(false);
    }
  };

  // Debounced search suggestions for train name or number
  const handleTrainInputChange = async (val) => {
    setTrainQuery(val);
    if (!val || val.trim().length < 2) {
      setTrainSuggestions([]);
      return;
    }

    setSearchingTrains(true);
    try {
      const res = await trainApi.searchTrains(val.trim());
      setTrainSuggestions(res?.data?.slice(0, 5) || []);
    } catch {
      setTrainSuggestions([]);
    } finally {
      setSearchingTrains(false);
    }
  };

  // Select an upcoming station on the train's route
  const selectUpcomingStation = (stop) => {
    const name = stop.station || stop.stationName;
    const code = stop.stationCode || stop.code || "";
    setDestinationStation(name);
    setDestinationCode(code);

    if (stop.lat != null && (stop.lng != null || stop.lon != null)) {
      setDestinationCoords({
        lat: Number(stop.lat),
        lng: Number(stop.lng || stop.lon),
      });
    } else {
      // Fallback coordinates if route stop lacked GPS
      setDestinationCoords({ lat: 28.6139, lng: 77.2090 });
    }
    setDestFilterQuery("");
  };

  // Step 2: Request Location Permission
  const requestLocationPermission = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }

    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
          speed: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0, // km/h
        };
        setUserLocation(coords);
        startWatchingLocation();
        setStep(3); // Proceed to Destination Setup
      },
      (err) => {
        console.error("Location error:", err);
        setLocationError(
          "Location permission was denied. Please allow location access in your browser to enable proximity alarms."
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Continuous GPS tracking
  const startWatchingLocation = () => {
    if (!navigator.geolocation || watchIdRef.current !== null) return;
    setIsWatchingLocation(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
          speed: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0,
        };
        setUserLocation(coords);
      },
      (err) => {
        console.warn("Watch position update error:", err);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  };

  const stopWatchingLocation = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsWatchingLocation(false);
  };

  // Calculate distance on location or destination changes
  useEffect(() => {
    if (userLocation && destinationCoords) {
      const dist = calculateDistanceKm(
        userLocation.lat,
        userLocation.lon,
        destinationCoords.lat,
        destinationCoords.lng
      );
      setDistanceToDest(dist);

      if (
        dist !== null &&
        dist <= alarmRadiusKm &&
        activeAlarm &&
        activeAlarm.status === "active" &&
        !isAlarmTriggered
      ) {
        triggerArrivalAlarm();
      }
    }
  }, [userLocation, destinationCoords, alarmRadiusKm, activeAlarm, isAlarmTriggered]);

  // Step 3: Save Alarm to Database
  const handleSetAlarm = async () => {
    if (!destinationStation) {
      alert("Please select your upcoming destination station from the train route.");
      return;
    }

    setSavingAlarm(true);
    try {
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }

      const payload = {
        train_number: activeTrain?.number || trainQuery.split(" ")[0] || "TRACK-GPS",
        train_name: activeTrain?.name || "Express Train",
        origin_station: activeTrain?.route?.[0]?.station || null,
        destination_station: destinationStation,
        destination_code: destinationCode || null,
        destination_lat: destinationCoords?.lat || null,
        destination_lon: destinationCoords?.lng || null,
        alarm_distance_km: Number(alarmRadiusKm),
        is_in_train: true,
        initial_user_lat: userLocation?.lat || null,
        initial_user_lon: userLocation?.lon || null,
      };

      const result = await journeyApi.createAlarm(payload);
      if (result?.success && result?.data) {
        setActiveAlarm(result.data);
        if (onAlarmCreated) onAlarmCreated(result.data);
        setStep(4); // Move to active journey HUD
      } else {
        throw new Error(result?.message || "Failed to save alarm.");
      }
    } catch (err) {
      console.error("Save alarm error:", err);
      alert(err.message || "Failed to save alarm. Please try again.");
    } finally {
      setSavingAlarm(false);
    }
  };

  // Trigger continuous alarm
  const triggerArrivalAlarm = () => {
    setIsAlarmTriggered(true);
    alarmService.startContinuousAlarm();

    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("🚆 Station Arrival Alert!", {
          body: `You are approaching ${destinationStation}! Prepare to alight.`,
          icon: "/favicon.ico",
          tag: "station-alarm",
          requireInteraction: true,
        });
      } catch (e) {
        console.warn("Notification error:", e);
      }
    }

    if (activeAlarm?.id) {
      journeyApi.updateAlarmStatus(activeAlarm.id, "triggered").catch(console.error);
    }
  };

  const handleDismissAlarm = async () => {
    alarmService.stopAlarm();
    setIsAlarmTriggered(false);
    if (activeAlarm?.id) {
      await journeyApi.updateAlarmStatus(activeAlarm.id, "dismissed").catch(console.error);
    }
  };

  const handleCancelJourney = () => {
    alarmService.stopAlarm();
    stopWatchingLocation();
    if (activeAlarm?.id) {
      journeyApi.updateAlarmStatus(activeAlarm.id, "cancelled").catch(console.error);
    }
    setActiveAlarm(null);
    setStep(1);
    onClose();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopWatchingLocation();
    };
  }, []);

  if (!isOpen) return null;

  // Filter upcoming stations by search query if user types in station box
  const filteredUpcomingStations = upcomingStations.filter((s) => {
    if (!destFilterQuery.trim()) return true;
    const q = destFilterQuery.toLowerCase();
    const stName = (s.station || s.stationName || "").toLowerCase();
    const stCode = (s.stationCode || s.code || "").toLowerCase();
    return stName.includes(q) || stCode.includes(q);
  });

  return (
    <div className="modal-overlay">
      <div className="in-train-modal-content">
        {/* Modal Header */}
        <div className="in-train-header">
          <div className="header-left">
            <span className="train-pulse-icon">🚆</span>
            <div>
              <h3>In-Train Live Journey Assistant</h3>
              <p className="subtitle">Real-time GPS tracking & route-locked station alarms</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* ================= STEP 1: ARE YOU IN A TRAIN? ================= */}
        {step === 1 && (
          <div className="step-container text-center">
            <div className="step-icon-large">🚄</div>
            <h2>Are you currently traveling inside a train?</h2>
            <p className="step-description">
              Our In-Train Assistant tracks your live GPS movement, locks onto your train's upcoming route stops, and rings a wake-up alarm before you arrive at your destination.
            </p>

            <div className="step1-buttons">
              <button
                className="btn-primary-large"
                onClick={() => setStep(2)}
              >
                <span>🟢</span> Yes, I am inside a train
              </button>

              <button
                className="btn-secondary-large"
                onClick={onClose}
              >
                <span>⚪</span> No, I am just checking status
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 2: ASK LOCATION PERMISSION ================= */}
        {step === 2 && (
          <div className="step-container text-center">
            <div className="step-icon-large">📍</div>
            <h2>Enable Live GPS Location</h2>
            <p className="step-description">
              To alert you accurately as your train approaches your destination station, we need access to your device's live location.
            </p>

            <div className="location-benefits-card">
              <div className="benefit-item">
                <span>🎯</span>
                <div>
                  <strong>High Precision</strong>
                  <p>Continuous distance calculations from your coach to upcoming stations</p>
                </div>
              </div>
              <div className="benefit-item">
                <span>🔔</span>
                <div>
                  <strong>Audio Wake-Up Chime</strong>
                  <p>Guaranteed alarm even if your phone screen is off or you fall asleep</p>
                </div>
              </div>
              <div className="benefit-item">
                <span>🔒</span>
                <div>
                  <strong>Privacy First</strong>
                  <p>Location data is used solely for your proximity alarm</p>
                </div>
              </div>
            </div>

            {locationError && (
              <div className="auth-error-banner">
                <span>⚠️</span> {locationError}
              </div>
            )}

            <div className="step2-buttons">
              <button
                className="btn-primary-large"
                onClick={requestLocationPermission}
              >
                <span>📍</span> Allow & Use My Location
              </button>

              <button
                className="btn-secondary-inline"
                onClick={() => setStep(1)}
              >
                ← Back
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 3: TRAIN & ROUTE-LOCKED UPCOMING STATIONS ================= */}
        {step === 3 && (
          <div className="step-container">
            <div className="gps-live-badge">
              <span>● GPS Active</span>
              {userLocation && (
                <span className="gps-coords">
                  Accuracy: ±{userLocation.accuracy}m | Speed: {userLocation.speed} km/h
                </span>
              )}
            </div>

            <h2>Select Your Train & Destination</h2>
            <p className="step-subtext">
              Enter your train number or name. Only valid upcoming stops on this train's route will be shown.
            </p>

            {/* Train Search Input with Auto-Fetch */}
            <div className="form-group train-search-group">
              <label>1. Train Number or Train Name</label>
              <div className="train-input-action-row">
                <div className="train-input-wrapper">
                  <input
                    type="text"
                    placeholder="Enter Train No. (e.g. 12951) or Name (e.g. Rajdhani)"
                    value={trainQuery}
                    onChange={(e) => handleTrainInputChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleLoadTrain(trainQuery);
                    }}
                  />
                  {searchingTrains && <span className="input-spinner">⏳</span>}

                  {/* Autocomplete Suggestions */}
                  {trainSuggestions.length > 0 && (
                    <ul className="train-autocomplete-dropdown">
                      {trainSuggestions.map((t, idx) => (
                        <li
                          key={idx}
                          onClick={() => {
                            const num = t.train_number || t.number;
                            setTrainQuery(`${num} - ${t.train_name || t.name}`);
                            handleLoadTrain(num);
                          }}
                        >
                          <strong>{t.train_number || t.number}</strong> — {t.train_name || t.name}
                          {t.source && t.destination && (
                            <span className="train-route-sub"> ({t.source} → {t.destination})</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <button
                  type="button"
                  className="btn-fetch-route"
                  onClick={() => handleLoadTrain(trainQuery)}
                  disabled={loadingTrainData || !trainQuery.trim()}
                >
                  {loadingTrainData ? "Loading..." : "Load Route"}
                </button>
              </div>

              {trainLoadError && (
                <div className="auth-error-banner" style={{ marginTop: "8px" }}>
                  <span>⚠️</span> {trainLoadError}
                </div>
              )}
            </div>

            {/* Current Train & Station Context Banner */}
            {activeTrain && (
              <div className="train-context-box">
                <div className="train-info-header">
                  <span className="train-badge-live">🚆 {activeTrain.number}</span>
                  <strong>{activeTrain.name}</strong>
                </div>

                {currentStationInfo && (
                  <div className="current-station-indicator">
                    <span className="current-pin-icon">📍 Current Station:</span>
                    <span className="current-name">
                      {currentStationInfo.name} ({currentStationInfo.code})
                    </span>
                    <span className="departed-tag">Departed / Passed</span>
                  </div>
                )}
              </div>
            )}

            {/* Destination Station Selection: STRICTLY ONLY UPCOMING STATIONS */}
            <div className="form-group destination-section-group">
              <label>
                2. Select Destination Station (Upcoming Stops on this Train Only)
              </label>

              {!activeTrain || upcomingStations.length === 0 ? (
                <div className="no-train-selected-hint">
                  <span>ℹ️</span> Please enter a valid train number or name above to load its upcoming route stops.
                </div>
              ) : (
                <>
                  <div className="upcoming-stops-count-bar">
                    <span>
                      Showing {upcomingStations.length} upcoming station{upcomingStations.length !== 1 ? "s" : ""}{" "}
                      (stations before {currentStationInfo?.name || "current station"} are filtered out)
                    </span>
                  </div>

                  {/* Dropdown for quick selection */}
                  <div className="route-select-wrapper">
                    <select
                      className="station-select-dropdown"
                      value={destinationStation}
                      onChange={(e) => {
                        const selected = upcomingStations.find(
                          (s) => (s.station || s.stationName) === e.target.value
                        );
                        if (selected) {
                          selectUpcomingStation(selected);
                        }
                      }}
                    >
                      <option value="">-- Choose destination from upcoming stops --</option>
                      {upcomingStations.map((stop, idx) => (
                        <option key={idx} value={stop.station || stop.stationName}>
                          {idx + 1}. {stop.station || stop.stationName} ({stop.stationCode || stop.code || ""})
                          {stop.distance ? ` — ${stop.distance} km` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Search within route only */}
                  <div className="search-station-input-wrapper">
                    <input
                      type="text"
                      placeholder="Or type to search within this train's upcoming stops..."
                      value={destFilterQuery}
                      onChange={(e) => setDestFilterQuery(e.target.value)}
                    />
                  </div>

                  {/* Filtered Upcoming Stops List */}
                  {destFilterQuery.trim() && (
                    <div className="upcoming-stops-scroll-list">
                      {filteredUpcomingStations.length === 0 ? (
                        <div className="no-match-route">
                          No upcoming stop matching "{destFilterQuery}" on this train's route.
                        </div>
                      ) : (
                        filteredUpcomingStations.map((stop, idx) => (
                          <div
                            key={idx}
                            className={`upcoming-stop-row ${
                              destinationStation === (stop.station || stop.stationName) ? "selected" : ""
                            }`}
                            onClick={() => selectUpcomingStation(stop)}
                          >
                            <div className="stop-left">
                              <span className="stop-bullet">○</span>
                              <div>
                                <strong>{stop.station || stop.stationName}</strong>
                                <span className="station-code"> ({stop.stationCode || stop.code || ""})</span>
                              </div>
                            </div>
                            {stop.distance && (
                              <span className="stop-dist-badge">{stop.distance} km</span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {destinationStation && (
                    <div className="selected-dest-confirmation">
                      <span>✓ Selected Destination:</span>
                      <strong>
                        {destinationStation} ({destinationCode})
                      </strong>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Alarm Distance Threshold */}
            <div className="form-group">
              <label>3. Alarm Distance (Wake me up before station)</label>
              <div className="alarm-radius-selector">
                {[2.0, 5.0, 10.0, 15.0].map((radius) => (
                  <button
                    key={radius}
                    type="button"
                    className={`radius-chip ${alarmRadiusKm === radius ? "active" : ""}`}
                    onClick={() => setAlarmRadiusKm(radius)}
                  >
                    {radius} km
                    {radius === 5.0 && <span className="rec-badge">Best</span>}
                  </button>
                ))}
              </div>
              <p className="radius-hint">
                The alarm will sound when you are within {alarmRadiusKm} km of {destinationStation || "your destination"}.
              </p>
            </div>

            {/* Submit Actions */}
            <div className="step-actions">
              <button
                className="btn-primary-large"
                onClick={handleSetAlarm}
                disabled={savingAlarm || !destinationStation}
              >
                {savingAlarm ? "Saving Alarm..." : "🔔 Set Alarm & Start Tracking"}
              </button>
              <button
                className="btn-test-sound"
                type="button"
                onClick={() => alarmService.playIndianRailwaysChime()}
                title="Play sample railway chime"
              >
                🎵 Test Chime
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 4: ACTIVE JOURNEY HUD & PROXIMITY TRACKER ================= */}
        {step === 4 && activeAlarm && (
          <div className="step-container active-journey-hud">
            <div className="hud-top-card">
              <div className="hud-status-row">
                <span className="pulse-dot"></span>
                <span className="hud-tracking-title">JOURNEY IN PROGRESS</span>
                <span className="hud-save-badge">✓ Saved to Cloud</span>
              </div>

              <div className="hud-train-info">
                <h3>{activeAlarm.train_number} {activeAlarm.train_name}</h3>
                <p className="dest-target">
                  Destination: <strong>{activeAlarm.destination_station}</strong>
                </p>
              </div>

              {/* Countdown / Distance Remaining */}
              <div className="distance-counter-box">
                <div className="counter-main">
                  <span className="distance-val">
                    {distanceToDest !== null ? `${distanceToDest}` : "--"}
                  </span>
                  <span className="distance-unit">KM</span>
                </div>
                <p className="counter-label">Remaining to destination station</p>
                <div className="alarm-trigger-indicator">
                  Alarm will sound at <strong>{activeAlarm.alarm_distance_km} km</strong>
                </div>
              </div>

              {/* Live Telemetry Bar */}
              <div className="telemetry-bar">
                <div className="telem-item">
                  <span className="telem-label">Speed</span>
                  <span className="telem-val">{userLocation?.speed || 0} km/h</span>
                </div>
                <div className="telem-item">
                  <span className="telem-label">GPS Accuracy</span>
                  <span className="telem-val">±{userLocation?.accuracy || "--"}m</span>
                </div>
                <div className="telem-item">
                  <span className="telem-label">Status</span>
                  <span className="telem-val status-active">Active</span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="hud-controls">
              <button
                className="btn-test-sound"
                onClick={() => triggerArrivalAlarm()}
              >
                🚨 Simulate Station Arrival
              </button>

              <button
                className="btn-cancel-journey"
                onClick={handleCancelJourney}
              >
                Cancel Journey
              </button>
            </div>
          </div>
        )}

        {/* ================= FULL SCREEN ALARM TRIGGER OVERLAY ================= */}
        {isAlarmTriggered && (
          <div className="alarm-active-overlay">
            <div className="alarm-dialog-box animate-pulse">
              <div className="alarm-bell-icon">🔔</div>
              <h1>WAKE UP!</h1>
              <h2>Approaching {destinationStation || "Destination Station"}</h2>
              <p className="alarm-subtext">
                Your train is now within {alarmRadiusKm} km of your stop! Pack your luggage and prepare to alight.
              </p>

              <div className="alarm-action-buttons">
                <button
                  className="btn-dismiss-alarm"
                  onClick={handleDismissAlarm}
                >
                  🔕 Dismiss Alarm & I'm Awake
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
