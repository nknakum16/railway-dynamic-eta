import { useEffect, useState, useMemo, useRef } from "react";
import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    Polyline,
    useMap
} from "react-leaflet";
import L from "leaflet";
import trainApi from "../services/api";

const trainIcon = L.divIcon({
    html: `
      <div style="
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        background: #174d91;
        border: 3px solid #ffffff;
        border-radius: 50%;
        box-shadow: 0 4px 14px rgba(0,0,0,0.45);
        font-size: 24px;
        line-height: 1;
        cursor: pointer;
      ">
        🚆
      </div>
    `,
    className: "train-map-icon",
    iconSize: [44, 44],
    iconAnchor: [22, 22],
});

const stationIcon = L.divIcon({
    html: '<div style="background:#2563eb;width:12px;height:12px;border-radius:50%;border:2px solid #ffffff;box-shadow:0 0 5px rgba(0,0,0,0.5)"></div>',
    className: "station-map-dot",
    iconSize: [12, 12],
    iconAnchor: [6, 6],
});

function MapUpdater({ center, bounds, trainId }) {
    const map = useMap();

    useEffect(() => {
        if (bounds && bounds.length > 1) {
            try {
                map.fitBounds(bounds, { padding: [40, 40] });
            } catch (e) {
                if (center && center[0] && center[1]) {
                    map.setView(center, 9);
                }
            }
        } else if (center && center[0] && center[1]) {
            map.setView(center, 9);
        }
    }, [trainId, map]);

    return null;
}

function LiveTrainStatus({ initialTrainNumber = "12919", onSetAlarm }) {
    const [train, setTrain] = useState(null);
    const [geometry, setGeometry] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [searchTrain, setSearchTrain] = useState(initialTrainNumber);
    const [activeTrainNumber, setActiveTrainNumber] = useState(initialTrainNumber);
    const mapRef = useRef(null);

    const formatTime = (time) => {
        if (!time) return "--";
        if (typeof time === "string" && /^\d{1,2}:\d{2}$/.test(time)) return time;
        const date = new Date(time);
        if (Number.isNaN(date.getTime())) return time;
        return date.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
    };

    const fetchTrain = async (trainNumber = searchTrain) => {
        const trimmed = (trainNumber || "").toString().trim();
        if (!trimmed) {
            setError("Please enter a valid train number.");
            return;
        }

        try {
            setLoading(true);
            setError("");

            const [etaRes, geoRes] = await Promise.allSettled([
                trainApi.fetchDynamicETA(trimmed),
                trainApi.fetchRouteGeometry(trimmed),
            ]);

            if (etaRes.status === "fulfilled" && etaRes.value?.success && etaRes.value?.data) {
                setTrain(etaRes.value.data);
                setActiveTrainNumber(trimmed);
            } else {
                throw new Error(
                    etaRes.status === "rejected"
                        ? etaRes.reason?.message
                        : `Train data unavailable for train number ${trimmed}`
                );
            }

            if (geoRes.status === "fulfilled" && geoRes.value?.geojson) {
                setGeometry(geoRes.value);
            } else {
                setGeometry(null);
            }
        } catch (err) {
            console.error("Live train error:", err);
            setError(err.message || "Failed to load train details");
        } finally {
            setLoading(false);
        }
    };

    // Initial fetch on mount or initialTrainNumber change
    useEffect(() => {
        fetchTrain(initialTrainNumber);
    }, [initialTrainNumber]);

    // 30-second live polling for active train
    useEffect(() => {
        if (!activeTrainNumber) return;
        const interval = setInterval(() => fetchTrain(activeTrainNumber), 30000);
        return () => clearInterval(interval);
    }, [activeTrainNumber]);

    const route = train?.route || [];
    const location = train?.currentLocation || {};

    const currentStationIndex = route.findIndex(
        (station) => station.stationCode === location.stationCode || station.status === "current"
    );

    const currentStop = currentStationIndex >= 0 ? route[currentStationIndex] : route[0];
    const nextStop = currentStationIndex >= 0 && currentStationIndex + 1 < route.length
        ? route[currentStationIndex + 1]
        : null;

    const journeyProgress =
        route.length > 1 && currentStationIndex >= 0
            ? Math.min(100, Math.round((currentStationIndex / (route.length - 1)) * 100))
            : Math.round(location.segmentProgress ? location.segmentProgress * 100 : 0);

    const originStation = route[0]?.stationName || "Origin";
    const destinationStation = route[route.length - 1]?.stationName || "Destination";

    // Extract polyline track coordinates from GeoJSON [lng, lat] -> [lat, lng]
    const trackCoordinates = useMemo(() => {
        if (geometry?.geojson?.geometry?.coordinates) {
            return geometry.geojson.geometry.coordinates.map((c) => [c[1], c[0]]);
        }
        // Fallback: connect route stations that have lat/lng
        return route.filter((s) => s.lat && s.lng).map((s) => [s.lat, s.lng]);
    }, [geometry, route]);

    // Determine center coordinates for train with interpolation
    const trainCoords = useMemo(() => {
        if (location?.lat && location?.lng) {
            return [location.lat, location.lng];
        }
        if (currentStop?.lat && currentStop?.lng && nextStop?.lat && nextStop?.lng && location?.segmentProgress != null) {
            const lat = currentStop.lat + (nextStop.lat - currentStop.lat) * location.segmentProgress;
            const lng = currentStop.lng + (nextStop.lng - currentStop.lng) * location.segmentProgress;
            return [lat, lng];
        }
        if (currentStop?.lat && currentStop?.lng) {
            return [currentStop.lat, currentStop.lng];
        }
        const firstValid = route.find((s) => s.lat && s.lng);
        if (firstValid) return [firstValid.lat, firstValid.lng];
        return [22.7196, 75.8577]; // default central India
    }, [location, currentStop, nextStop, route]);

    const bounds = useMemo(() => {
        if (trackCoordinates.length > 1) return trackCoordinates;
        return route.filter((s) => s.lat && s.lng).map((s) => [s.lat, s.lng]);
    }, [trackCoordinates, route]);

    const handleCenterOnTrain = () => {
        if (mapRef.current && trainCoords && trainCoords[0] && trainCoords[1]) {
            mapRef.current.setView(trainCoords, 10, { animate: true });
        }
    };

    return (
        <section className="live-status-page">
            <div className="live-status-container">
                {/* Page Intro */}
                <div style={{ marginBottom: "20px" }}>
                    <h2 style={{ margin: "0 0 6px 0", color: "#174d91", fontSize: "26px", fontWeight: "700" }}>
                        ⚡ Live GPS Assistant & Train Tracker
                    </h2>
                    <p style={{ margin: 0, color: "#64748b", fontSize: "15px" }}>
                        Search any train number to view its real-time location and track on OpenStreetMap with dynamic ML ETA predictions.
                    </p>
                </div>

                {/* Train Search */}
                <div className="live-search-box">
                    <input
                        type="text"
                        placeholder="Enter Train Number (e.g. 12919, 12002, 12952)"
                        value={searchTrain}
                        onChange={(e) => setSearchTrain(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                fetchTrain(searchTrain);
                            }
                        }}
                    />

                    <button onClick={() => fetchTrain(searchTrain)} disabled={loading}>
                        🔍 Search
                    </button>

                    <button
                        className={`refresh-live-btn ${loading ? "refreshing" : ""}`}
                        onClick={() => fetchTrain(activeTrainNumber)}
                        disabled={loading}
                        title="Refresh Live Status"
                    >
                        <span className="refresh-icon">↻</span>
                        Refresh
                    </button>
                </div>

                {/* Quick Selection Chips */}
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px", alignItems: "center" }}>
                    <span style={{ fontSize: "13px", color: "#64748b", fontWeight: "600" }}>Quick Search:</span>
                    {["12919", "12002", "12952", "12004"].map((num) => (
                        <button
                            key={num}
                            onClick={() => {
                                setSearchTrain(num);
                                fetchTrain(num);
                            }}
                            style={{
                                background: activeTrainNumber === num ? "#174d91" : "#e2e8f0",
                                color: activeTrainNumber === num ? "#ffffff" : "#1e293b",
                                border: "none",
                                borderRadius: "20px",
                                padding: "4px 14px",
                                fontSize: "13px",
                                fontWeight: "600",
                                cursor: "pointer",
                                transition: "all 0.2s ease",
                            }}
                        >
                            Train {num}
                        </button>
                    ))}
                </div>

                {/* Loading Banner */}
                {loading && (
                    <div style={{
                        padding: "14px 18px",
                        marginBottom: "20px",
                        background: "#eff6ff",
                        border: "1px solid #bfdbfe",
                        borderRadius: "8px",
                        color: "#1d4ed8",
                        fontWeight: "600",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px"
                    }}>
                        <span>🔄</span>
                        Fetching live GPS telemetry & route track for Train {searchTrain}...
                    </div>
                )}

                {/* Error Banner */}
                {error && !loading && (
                    <div style={{
                        padding: "14px 18px",
                        marginBottom: "20px",
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        borderRadius: "8px",
                        color: "#b91c1c",
                        fontWeight: "500",
                    }}>
                        ⚠️ <strong>Search Result:</strong> {error}
                    </div>
                )}

                {train && (
                    <>

                {/* Header */}
                <div className="live-status-header">
                    <div className="live-header-main">
                        <div className="live-header-top">
                            <span className="live-label">
                                <span className="live-dot"></span>
                                LIVE TRAIN STATUS
                            </span>

                            {train.modelUsed && (
                                <span className="ml-badge" title="Dynamic ETA predicted by ML model">
                                    ⚡ ML Dynamic ETA: {train.modelUsed}
                                </span>
                            )}
                        </div>

                        <h1>
                            {train.trainNumber}
                            <span className="train-name-separator">—</span>
                            {train.trainName}
                        </h1>

                        <div className="train-route">
                            <span>{originStation}</span>
                            <span className="route-arrow">→</span>
                            <span>{destinationStation}</span>
                        </div>
                    </div>

                    <div className="running-badge">
                        <span className="running-dot"></span>
                        {train.status?.toUpperCase() || "RUNNING"}
                    </div>
                </div>

                {/* Main Information */}
                <div className="live-info-grid">
                    <div className="live-info-card">
                        <span>📍 CURRENT LOCATION</span>
                        <strong>
                            {currentStop?.stationName || location?.stationCode || "In Transit"}
                        </strong>
                        <small>{location?.status ? `Status: ${location.status}` : ""}</small>
                    </div>

                    <div className="live-info-card">
                        <span>➡️ NEXT HALT & DYNAMIC ETA</span>
                        <strong>
                            {nextStop?.stationName || "Terminating Station"}
                        </strong>
                        <small className="live-eta-highlight">
                            {nextStop
                                ? `Predicted ETA: ${formatTime(nextStop.predictedArrival || nextStop.scheduledArrival)}`
                                : "Journey complete"}
                        </small>
                    </div>

                    <div className="live-info-card">
                        <span>⏱️ DELAY & TREND</span>
                        <strong className="delay-text">
                            {Math.round(train.overallDelayMinutes || 0)} min late
                        </strong>
                        {nextStop?.delayTrend && (
                            <span className={`trend-badge trend-${nextStop.delayTrend}`}>
                                {nextStop.delayTrend === "improving" && "🟢 Delay Reducing"}
                                {nextStop.delayTrend === "increasing" && "🔴 Delay Increasing"}
                                {nextStop.delayTrend === "stable" && "🟡 Delay Stable"}
                            </span>
                        )}
                    </div>

                    <div className="live-info-card">
                        <span>🚀 CURRENT SPEED & MODEL</span>
                        <strong>
                            {location?.speedKmh ? `${Math.round(location.speedKmh)} km/h` : "--"}
                        </strong>
                        <small>{train.modelUsed || "LightGBM"}</small>
                    </div>
                </div>

                {/* Map */}
                <div className="live-map-card">
                    <div className="map-heading">
                        <div className="map-title">
                            <span className="map-icon">🗺️</span>
                            <div>
                                <h2>Live Train Location on OpenStreetMap</h2>
                                <p>Real-time railway track geometry, station halts, and live train position</p>
                            </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                            <button
                                className="btn-map-alarm"
                                onClick={() => onSetAlarm && onSetAlarm(train)}
                                style={{
                                    background: "#059669",
                                    color: "#ffffff",
                                    border: "none",
                                    borderRadius: "5px",
                                    padding: "8px 14px",
                                    fontSize: "13px",
                                    fontWeight: "600",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    boxShadow: "0 2px 6px rgba(5, 150, 105, 0.25)",
                                    transition: "background 0.2s ease"
                                }}
                                title="Set Destination Arrival Alarm"
                            >
                                ⏰ Set Alarm
                            </button>

                            <button
                                onClick={handleCenterOnTrain}
                                style={{
                                    background: "#174d91",
                                    color: "#ffffff",
                                    border: "none",
                                    borderRadius: "5px",
                                    padding: "8px 14px",
                                    fontSize: "13px",
                                    fontWeight: "600",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px"
                                }}
                                title="Center OpenStreetMap view on train"
                            >
                                🎯 Center on Train
                            </button>

                            <div className="map-live-badge">
                                <span className="map-live-dot"></span>
                                LIVE
                            </div>
                        </div>
                    </div>

                    <div className="real-map">
                        <MapContainer
                            center={trainCoords}
                            zoom={8}
                            style={{ height: "480px", width: "100%" }}
                            ref={mapRef}
                        >
                            <MapUpdater center={trainCoords} bounds={bounds} trainId={train.trainNumber} />

                            <TileLayer
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />

                            {/* Railway Track Polyline */}
                            {trackCoordinates.length > 1 && (
                                <Polyline
                                    positions={trackCoordinates}
                                    color="#2563eb"
                                    weight={5}
                                    opacity={0.85}
                                />
                            )}

                            {/* Station Halt Markers */}
                            {route.map(
                                (stop) =>
                                    stop.lat &&
                                    stop.lng && (
                                        <Marker
                                            key={`stop-${stop.sequence}-${stop.stationCode}`}
                                            position={[stop.lat, stop.lng]}
                                            icon={stationIcon}
                                        >
                                            <Popup>
                                                <div style={{ padding: "4px 2px", minWidth: "160px" }}>
                                                    <strong style={{ fontSize: "14px", color: "#174d91" }}>
                                                        {stop.stationName}
                                                    </strong>{" "}
                                                    ({stop.stationCode})
                                                    <br />
                                                    <span style={{ fontSize: "12px", color: "#64748b" }}>
                                                        Platform: {stop.platform || "--"}
                                                    </span>
                                                    <hr style={{ margin: "6px 0", border: "none", borderTop: "1px solid #e2e8f0" }} />
                                                    <div style={{ fontSize: "12px", lineHeight: "1.6" }}>
                                                        <div>
                                                            Scheduled: {formatTime(stop.scheduledArrival || stop.scheduledDeparture)}
                                                        </div>
                                                        <div>
                                                            Predicted:{" "}
                                                            <strong style={{ color: "#16a34a" }}>
                                                                {formatTime(stop.predictedArrival || stop.actualArrival || stop.scheduledArrival)}
                                                            </strong>
                                                        </div>
                                                        <div>
                                                            Delay:{" "}
                                                            <span style={{ color: (stop.predictedDelayMinutes || 0) > 0 ? "#dc2626" : "#16a34a" }}>
                                                                {Math.round(stop.predictedDelayMinutes || 0)} min
                                                            </span>
                                                        </div>
                                                        {stop.delayTrend && <div>Trend: {stop.delayTrend}</div>}
                                                    </div>
                                                </div>
                                            </Popup>
                                        </Marker>
                                    )
                            )}

                            {/* Live Train Marker with Train Icon */}
                            {trainCoords && trainCoords[0] && trainCoords[1] && (
                                <Marker position={trainCoords} icon={trainIcon}>
                                    <Popup>
                                        <div style={{ padding: "6px 4px", minWidth: "180px" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                                                <span style={{ fontSize: "24px" }}>🚆</span>
                                                <div>
                                                    <strong style={{ fontSize: "14px", color: "#174d91", display: "block" }}>
                                                        {train.trainNumber}
                                                    </strong>
                                                    <span style={{ fontSize: "12px", color: "#475569" }}>
                                                        {train.trainName}
                                                    </span>
                                                </div>
                                            </div>
                                            <hr style={{ margin: "6px 0", border: "none", borderTop: "1px solid #e2e8f0" }} />
                                            <div style={{ fontSize: "12px", lineHeight: "1.6" }}>
                                                <div>
                                                    <strong>Status:</strong>{" "}
                                                    <span style={{ color: "#16a34a", textTransform: "capitalize", fontWeight: "600" }}>
                                                        {train.status || "Running"}
                                                    </span>
                                                </div>
                                                <div>
                                                    <strong>Delay:</strong>{" "}
                                                    <span style={{ color: (train.overallDelayMinutes || 0) > 0 ? "#dc2626" : "#16a34a", fontWeight: "600" }}>
                                                        {Math.round(train.overallDelayMinutes || 0)} min late
                                                    </span>
                                                </div>
                                                <div>
                                                    <strong>Speed:</strong>{" "}
                                                    {location?.speedKmh ? `${Math.round(location.speedKmh)} km/h` : "In transit"}
                                                </div>
                                                <div>
                                                    <strong>Model:</strong> {train.modelUsed || "LightGBM ML"}
                                                </div>
                                            </div>
                                        </div>
                                    </Popup>
                                </Marker>
                            )}
                        </MapContainer>

                        {/* Overlay Card on top of Map */}
                        <div className="map-location-overlay">
                            <div className="overlay-top">
                                <span className="overlay-live-dot"></span>
                                <span className="overlay-label">CURRENT POSITION</span>
                                <span className="overlay-live-text">LIVE</span>
                            </div>

                            <div className="overlay-station">
                                <span className="overlay-location-icon">📍</span>
                                <div>
                                    <strong>
                                        {currentStop?.stationName || location?.stationCode || "In Transit"}
                                    </strong>
                                    {location?.stationCode && <small>{location.stationCode}</small>}
                                </div>
                            </div>

                            <div className="overlay-stats">
                                <div>
                                    <span>DELAY</span>
                                    <strong className="overlay-delay">
                                        {Math.round(train.overallDelayMinutes || 0)} min
                                    </strong>
                                </div>

                                <div>
                                    <span>NEXT STOP</span>
                                    <strong>
                                        {nextStop?.stationCode || "--"}
                                    </strong>
                                </div>
                            </div>

                            {/* Journey Progress */}
                            <div className="mini-journey-progress">
                                <div className="mini-progress-header">
                                    <span>JOURNEY PROGRESS</span>
                                    <strong>{journeyProgress}%</strong>
                                </div>

                                <div className="mini-progress-track">
                                    <div
                                        className="mini-progress-fill"
                                        style={{ width: `${journeyProgress}%` }}
                                    ></div>

                                    <span
                                        className="mini-progress-train"
                                        style={{ left: `${journeyProgress}%` }}
                                    >
                                        🚆
                                    </span>
                                </div>

                                <div className="mini-progress-route">
                                    <span>{originStation}</span>
                                    <span>{destinationStation}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Station Halts Timeline Table with on-hover scroll */}
                {route.length > 0 && (
                    <div className="route-stoppages-card">
                        <div className="route-stoppages-header">
                            <h3>
                                <span>📋</span> Route Stoppages & Dynamic Arrivals
                            </h3>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <span style={{ fontSize: "12px", background: "#eff6ff", border: "1px solid #bfdbfe", padding: "4px 10px", borderRadius: "12px", color: "#1d4ed8", fontWeight: "600" }}>
                                    ↕️ Hover to scroll ({route.length} stops)
                                </span>
                            </div>
                        </div>

                        <div className="route-stoppages-scroll-container">
                            <table className="route-stoppages-table">
                                <thead>
                                    <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                                        <th style={{ padding: "10px 12px", color: "#475569" }}>#</th>
                                        <th style={{ padding: "10px 12px", color: "#475569" }}>Station</th>
                                        <th style={{ padding: "10px 12px", color: "#475569" }}>Scheduled</th>
                                        <th style={{ padding: "10px 12px", color: "#475569" }}>ML Predicted ETA</th>
                                        <th style={{ padding: "10px 12px", color: "#475569" }}>Delay</th>
                                        <th style={{ padding: "10px 12px", color: "#475569" }}>Platform</th>
                                        <th style={{ padding: "10px 12px", color: "#475569" }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {route.map((st, idx) => {
                                        const isPassed = st.status === "departed" || (currentStationIndex >= 0 && idx < currentStationIndex);
                                        const isCurrent = idx === currentStationIndex || st.status === "current";
                                        return (
                                            <tr
                                                key={`row-${st.stationCode}-${idx}`}
                                                style={{
                                                    borderBottom: "1px solid #f1f5f9",
                                                    background: isCurrent ? "#eff6ff" : "transparent"
                                                }}
                                            >
                                                <td style={{ padding: "10px 12px", color: "#94a3b8" }}>{st.sequence || idx + 1}</td>
                                                <td style={{ padding: "10px 12px", fontWeight: isCurrent ? "700" : "500", color: isCurrent ? "#174d91" : "#1e293b" }}>
                                                    {st.stationName} <span style={{ color: "#64748b", fontSize: "12px" }}>({st.stationCode})</span>
                                                    {isCurrent && <span style={{ marginLeft: "8px", background: "#174d91", color: "#fff", padding: "2px 6px", borderRadius: "4px", fontSize: "11px" }}>Current</span>}
                                                </td>
                                                <td style={{ padding: "10px 12px", color: "#64748b" }}>
                                                    {formatTime(st.scheduledArrival || st.scheduledDeparture)}
                                                </td>
                                                <td style={{ padding: "10px 12px", fontWeight: "600", color: "#16a34a" }}>
                                                    {formatTime(st.predictedArrival || st.actualArrival || st.scheduledArrival)}
                                                </td>
                                                <td style={{ padding: "10px 12px", color: (st.predictedDelayMinutes || 0) > 0 ? "#dc2626" : "#16a34a", fontWeight: "500" }}>
                                                    {Math.round(st.predictedDelayMinutes || 0)} min
                                                </td>
                                                <td style={{ padding: "10px 12px", color: "#64748b" }}>{st.platform || "--"}</td>
                                                <td style={{ padding: "10px 12px" }}>
                                                    <span style={{
                                                        display: "inline-block",
                                                        padding: "3px 8px",
                                                        borderRadius: "4px",
                                                        fontSize: "12px",
                                                        fontWeight: "600",
                                                        background: isPassed ? "#f1f5f9" : isCurrent ? "#dbeafe" : "#f0fdf4",
                                                        color: isPassed ? "#64748b" : isCurrent ? "#1d4ed8" : "#15803d"
                                                    }}>
                                                        {isPassed ? "Passed" : isCurrent ? "At Station" : "Upcoming"}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                <p className="live-updated">
                    Last updated: {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                </p>
                </>
                )}
            </div>
        </section>
    );
}

export default LiveTrainStatus;