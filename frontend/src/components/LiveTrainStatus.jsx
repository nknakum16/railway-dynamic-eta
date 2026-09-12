import { useEffect, useState, useMemo } from "react";
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
    html: '<div style="font-size:28px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4))">🚆</div>',
    className: "train-map-icon",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
});

const stationIcon = L.divIcon({
    html: '<div style="background:#2563eb;width:12px;height:12px;border-radius:50%;border:2px solid #ffffff;box-shadow:0 0 5px rgba(0,0,0,0.5)"></div>',
    className: "station-map-dot",
    iconSize: [12, 12],
    iconAnchor: [6, 6],
});

function MapUpdater({ center, bounds }) {
    const map = useMap();

    useEffect(() => {
        if (bounds && bounds.length > 1) {
            map.fitBounds(bounds, { padding: [30, 30] });
        } else if (center && center[0] && center[1]) {
            map.setView(center, 9);
        }
    }, [center, bounds, map]);

    return null;
}

function LiveTrainStatus() {
    const [train, setTrain] = useState(null);
    const [geometry, setGeometry] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchTrain, setSearchTrain] = useState("12919");

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
        try {
            setLoading(true);
            setError("");

            const [etaRes, geoRes] = await Promise.allSettled([
                trainApi.fetchDynamicETA(trainNumber),
                trainApi.fetchRouteGeometry(trainNumber),
            ]);

            if (etaRes.status === "fulfilled" && etaRes.value?.success && etaRes.value?.data) {
                setTrain(etaRes.value.data);
            } else {
                throw new Error(
                    etaRes.status === "rejected"
                        ? etaRes.reason?.message
                        : "Train data unavailable"
                );
            }

            if (geoRes.status === "fulfilled" && geoRes.value?.geojson) {
                setGeometry(geoRes.value);
            }
        } catch (err) {
            console.error("Live train error:", err);
            setError(err.message || "Failed to load train details");
        } finally {
            setLoading(false);
        }
    };

    // Initial fetch on mount
    useEffect(() => {
        fetchTrain();
    }, []);

    // Re-start 30-second live polling whenever the active train changes
    useEffect(() => {
        const interval = setInterval(() => fetchTrain(searchTrain), 30000);
        return () => clearInterval(interval);
    }, [searchTrain]);

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

    // Determine center coordinates for train
    const trainCoords = useMemo(() => {
        if (currentStop?.lat && currentStop?.lng) {
            return [currentStop.lat, currentStop.lng];
        }
        const firstValid = route.find((s) => s.lat && s.lng);
        if (firstValid) return [firstValid.lat, firstValid.lng];
        return [22.7196, 75.8577]; // default central India
    }, [currentStop, route]);

    const bounds = useMemo(() => {
        if (trackCoordinates.length > 1) return trackCoordinates;
        return route.filter((s) => s.lat && s.lng).map((s) => [s.lat, s.lng]);
    }, [trackCoordinates, route]);

    if (loading && !train) {
        return (
            <section className="live-status-page">
                <div className="live-loading">
                    🚆 Loading live train telemetry & ML predictions...
                </div>
            </section>
        );
    }

    if (!train) {
        return (
            <section className="live-status-page">
                <div className="live-error">
                    {error || "Unable to display train status. Please check the train number."}
                </div>
            </section>
        );
    }

    return (
        <section className="live-status-page">
            <div className="live-status-container">
                {/* Train Search */}
                <div className="live-search-box">
                    <input
                        type="text"
                        placeholder="Enter Train Number (e.g. 12919)"
                        value={searchTrain}
                        onChange={(e) => setSearchTrain(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                fetchTrain(searchTrain);
                            }
                        }}
                    />

                    <button onClick={() => fetchTrain(searchTrain)}>
                        Search
                    </button>

                    <button
                        className={`refresh-live-btn ${loading ? "refreshing" : ""}`}
                        onClick={() => fetchTrain(searchTrain)}
                        disabled={loading}
                    >
                        <span className="refresh-icon">↻</span>
                        Refresh
                    </button>
                </div>

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
                                <h2>Live Train Location & Railway Track</h2>
                                <p>Real-time GIS track geometry with ML dynamic station arrivals</p>
                            </div>
                        </div>

                        <div className="map-live-badge">
                            <span className="map-live-dot"></span>
                            LIVE
                        </div>
                    </div>

                    <div className="real-map">
                        <MapContainer
                            center={trainCoords}
                            zoom={8}
                            style={{ height: "460px", width: "100%" }}
                        >
                            <MapUpdater center={trainCoords} bounds={bounds} />

                            <TileLayer
                                attribution="&copy; OpenStreetMap contributors"
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />

                            {/* Railway Track Polyline */}
                            {trackCoordinates.length > 1 && (
                                <Polyline
                                    positions={trackCoordinates}
                                    color="#2563eb"
                                    weight={5}
                                    opacity={0.8}
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
                                                <strong>{stop.stationName}</strong> ({stop.stationCode})
                                                <br />
                                                Scheduled: {formatTime(stop.scheduledArrival || stop.scheduledDeparture)}
                                                <br />
                                                Predicted:{" "}
                                                <strong className="predicted-time">
                                                    {formatTime(stop.predictedArrival || stop.actualArrival || stop.scheduledArrival)}
                                                </strong>
                                                <br />
                                                Delay: {Math.round(stop.predictedDelayMinutes || 0)} min
                                                {stop.delayTrend && (
                                                    <div>Trend: {stop.delayTrend}</div>
                                                )}
                                            </Popup>
                                        </Marker>
                                    )
                            )}

                            {/* Live Train Marker */}
                            {trainCoords && trainCoords[0] && trainCoords[1] && (
                                <Marker position={trainCoords} icon={trainIcon}>
                                    <Popup>
                                        <strong>{train.trainNumber} — {train.trainName}</strong>
                                        <br />
                                        Current Delay: {Math.round(train.overallDelayMinutes || 0)} min
                                        <br />
                                        Speed: {location?.speedKmh ? `${Math.round(location.speedKmh)} km/h` : "In transit"}
                                        <br />
                                        Active Model: {train.modelUsed}
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

                <p className="live-updated">
                    Last updated: {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                </p>
            </div>
        </section>
    );
}

export default LiveTrainStatus;