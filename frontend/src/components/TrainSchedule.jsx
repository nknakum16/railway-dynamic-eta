import { useEffect, useState } from "react";
import trainApi from "../services/api";

function TrainSchedule({ onSelectTrain }) {
    const [fromText, setFromText] = useState("");
    const [toText, setToText] = useState("");

    const [fromStation, setFromStation] = useState(null);
    const [toStation, setToStation] = useState(null);

    const [fromSuggestions, setFromSuggestions] = useState([]);
    const [toSuggestions, setToSuggestions] = useState([]);

    const [date, setDate] = useState(
        new Date().toISOString().split("T")[0]
    );

    const [trains, setTrains] = useState([]);
    const [expandedTrain, setExpandedTrain] = useState(null);
    const [loading, setLoading] = useState(false);
    const [searchingStation, setSearchingStation] = useState(false);
    const [error, setError] = useState("");

    // ================= STATION SEARCH =================

    const searchStation = async (value, type) => {
        if (!value.trim()) {
            if (type === "from") setFromSuggestions([]);
            else setToSuggestions([]);
            return;
        }

        try {
            setSearchingStation(true);

            const result = await trainApi.searchStations(value.trim());

            const rawStations =
                result?.data?.stations ||
                result?.data ||
                result?.stations ||
                result;

            const stations = Array.isArray(rawStations)
                ? rawStations
                : [];

            if (type === "from") {
                setFromSuggestions(stations.slice(0, 8));
            } else {
                setToSuggestions(stations.slice(0, 8));
            }
        } catch (err) {
            console.error("Station search error:", err);

            if (type === "from") {
                setFromSuggestions([]);
            } else {
                setToSuggestions([]);
            }
        } finally {
            setSearchingStation(false);
        }
    };

    // ================= DEBOUNCE SEARCH =================

    useEffect(() => {
        const timer = setTimeout(() => {
            if (fromText && !fromStation) {
                searchStation(fromText, "from");
            }
        }, 350);

        return () => clearTimeout(timer);
    }, [fromText, fromStation]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (toText && !toStation) {
                searchStation(toText, "to");
            }
        }, 350);

        return () => clearTimeout(timer);
    }, [toText, toStation]);

    // ================= SELECT STATION =================

    const selectFromStation = (station) => {
        setFromStation(station);

        setFromText(
            station.name ||
            station.stationName ||
            station.title ||
            ""
        );

        setFromSuggestions([]);
    };

    const selectToStation = (station) => {
        setToStation(station);

        setToText(
            station.name ||
            station.stationName ||
            station.title ||
            ""
        );

        setToSuggestions([]);
    };

    // ================= SWAP =================

    const swapStations = () => {
        const oldFromText = fromText;
        const oldFromStation = fromStation;

        setFromText(toText);
        setFromStation(toStation);

        setToText(oldFromText);
        setToStation(oldFromStation);

        setFromSuggestions([]);
        setToSuggestions([]);
    };

    // ================= SEARCH TRAINS =================

    const executeSearch = async (src, dst, journeyDate) => {
        setError("");
        setTrains([]);

        if (!src || !dst) {
            setError("Please enter or select both source and destination stations.");
            return;
        }

        const fromCode =
            src.code ||
            src.stationCode ||
            src.station_code;

        const toCode =
            dst.code ||
            dst.stationCode ||
            dst.station_code;

        if (!fromCode || !toCode) {
            setError("Station code not available. Please select the station again.");
            return;
        }

        if (fromCode.toUpperCase() === toCode.toUpperCase()) {
            setError("Source and destination stations cannot be the same.");
            return;
        }

        try {
            setLoading(true);

            const result = await trainApi.fetchTrainsBetween(fromCode, toCode, journeyDate);

            const dataLayer = result?.data?.data || result?.data || result || {};
            const trainList =
                dataLayer?.trains ||
                result?.trains ||
                (Array.isArray(dataLayer) ? dataLayer : []);

            setTrains(Array.isArray(trainList) ? trainList : []);

            if (!trainList.length) {
                setError(
                    `No trains found from ${src.name || fromCode} to ${dst.name || toCode} for this date.`
                );
            }
        } catch (err) {
            console.error("Train search error:", err);
            setError(
                err.message ||
                "Unable to fetch trains. Please try again."
            );
        } finally {
            setLoading(false);
        }
    };

    const selectQuickRoute = (srcCode, srcName, dstCode, dstName) => {
        const src = { code: srcCode, name: srcName };
        const dst = { code: dstCode, name: dstName };
        setFromStation(src);
        setFromText(`${srcName} (${srcCode})`);
        setToStation(dst);
        setToText(`${dstName} (${dstCode})`);
        setFromSuggestions([]);
        setToSuggestions([]);
        executeSearch(src, dst, date);
    };

    // Auto-search popular route on initial mount if empty
    useEffect(() => {
        selectQuickRoute("INDB", "Indore Junction", "NDLS", "New Delhi");
    }, []);

    const handleSearch = async () => {
        let src = fromStation;
        let dst = toStation;

        // Auto-resolve source station if user typed but did not click dropdown
        if (!src && fromText.trim()) {
            try {
                const res = await trainApi.searchStations(fromText.trim());
                const rawStations = res?.data?.stations || res?.data || res || [];
                const list = Array.isArray(rawStations) ? rawStations : [];
                if (list.length > 0) {
                    src = list[0];
                    setFromStation(list[0]);
                } else {
                    src = { code: fromText.trim().toUpperCase(), name: fromText.trim() };
                }
            } catch {
                src = { code: fromText.trim().toUpperCase(), name: fromText.trim() };
            }
        }

        // Auto-resolve destination station if user typed but did not click dropdown
        if (!dst && toText.trim()) {
            try {
                const res = await trainApi.searchStations(toText.trim());
                const rawStations = res?.data?.stations || res?.data || res || [];
                const list = Array.isArray(rawStations) ? rawStations : [];
                if (list.length > 0) {
                    dst = list[0];
                    setToStation(list[0]);
                } else {
                    dst = { code: toText.trim().toUpperCase(), name: toText.trim() };
                }
            } catch {
                dst = { code: toText.trim().toUpperCase(), name: toText.trim() };
            }
        }

        executeSearch(src, dst, date);
    };

    // ================= FORMAT DURATION =================

    const formatDuration = (minutes) => {
        if (!minutes && minutes !== 0) return "--";

        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;

        if (hours === 0) return `${mins}m`;

        return `${hours}h ${mins}m`;
    };

    // ================= RENDER =================

    return (
        <main className="schedule-page">

            {/* PAGE HEADER */}

            <section className="schedule-hero">
                <div className="schedule-hero-content">
                    <span className="schedule-eyebrow">
                        INDIAN RAILWAYS
                    </span>

                    <h1>Train Schedule</h1>

                    <p>
                        Find trains running between your source and
                        destination stations.
                    </p>
                </div>
            </section>


            {/* SEARCH PANEL */}

            <section className="schedule-search-section">

                <div className="schedule-search-card">

                    <div className="schedule-search-title">
                        <div>
                            <h2>Find Trains Between Stations</h2>
                            <p>
                                Enter your journey details to view available trains.
                            </p>
                        </div>
                    </div>


                    <div className="schedule-form">

                        {/* FROM */}

                        <div className="station-field">
                            <label>FROM STATION</label>

                            <div className="station-input-wrapper">
                                <span className="station-icon">🚉</span>

                                <input
                                    type="text"
                                    placeholder="Enter source station"
                                    value={fromText}
                                    onChange={(e) => {
                                        setFromText(e.target.value);
                                        setFromStation(null);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSearch();
                                    }}
                                    onFocus={() => {
                                        if (fromText && !fromStation) {
                                            searchStation(fromText, "from");
                                        }
                                    }}
                                />

                                {searchingStation &&
                                    fromText &&
                                    !fromStation && (
                                        <span className="station-loading">
                                            ...
                                        </span>
                                    )}
                            </div>

                            {fromSuggestions.length > 0 && (
                                <div className="station-suggestions">
                                    {fromSuggestions.map((station, index) => (
                                        <button
                                            key={
                                                station.code ||
                                                station.stationCode ||
                                                index
                                            }
                                            onClick={() =>
                                                selectFromStation(station)
                                            }
                                        >
                                            <strong>
                                                {station.name ||
                                                    station.stationName ||
                                                    station.title}
                                            </strong>

                                            <span>
                                                {station.code ||
                                                    station.stationCode ||
                                                    station.station_code}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>


                        {/* SWAP */}

                        <button
                            className="schedule-swap-btn"
                            onClick={swapStations}
                            title="Swap stations"
                        >
                            ⇄
                        </button>


                        {/* TO */}

                        <div className="station-field">
                            <label>TO STATION</label>

                            <div className="station-input-wrapper">
                                <span className="station-icon">📍</span>

                                <input
                                    type="text"
                                    placeholder="Enter destination station"
                                    value={toText}
                                    onChange={(e) => {
                                        setToText(e.target.value);
                                        setToStation(null);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSearch();
                                    }}
                                    onFocus={() => {
                                        if (toText && !toStation) {
                                            searchStation(toText, "to");
                                        }
                                    }}
                                />
                            </div>

                            {toSuggestions.length > 0 && (
                                <div className="station-suggestions">
                                    {toSuggestions.map((station, index) => (
                                        <button
                                            key={
                                                station.code ||
                                                station.stationCode ||
                                                index
                                            }
                                            onClick={() =>
                                                selectToStation(station)
                                            }
                                        >
                                            <strong>
                                                {station.name ||
                                                    station.stationName ||
                                                    station.title}
                                            </strong>

                                            <span>
                                                {station.code ||
                                                    station.stationCode ||
                                                    station.station_code}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>


                        {/* DATE */}

                        <div className="date-field">
                            <label>JOURNEY DATE</label>

                            <input
                                type="date"
                                value={date}
                                min={new Date().toISOString().split("T")[0]}
                                onChange={(e) => setDate(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSearch();
                                }}
                            />
                        </div>


                        {/* SEARCH */}

                        <button
                            className="schedule-search-btn"
                            onClick={handleSearch}
                            disabled={loading}
                        >
                            {loading ? "Searching..." : "Search Trains"}
                        </button>

                    </div>

                    {/* Popular Routes Chips */}
                    <div style={{ marginTop: "18px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontSize: "13px", color: "#64748b", fontWeight: "600" }}>Popular Routes:</span>
                        {[
                            { fromCode: "INDB", fromName: "Indore Junction", toCode: "NDLS", toName: "New Delhi" },
                            { fromCode: "NDLS", fromName: "New Delhi", toCode: "MMCT", toName: "Mumbai Central" },
                            { fromCode: "HWH", fromName: "Howrah Junction", toCode: "NDLS", toName: "New Delhi" },
                            { fromCode: "MAS", fromName: "Chennai Central", toCode: "SBC", toName: "KSR Bengaluru" },
                        ].map((r, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => selectQuickRoute(r.fromCode, r.fromName, r.toCode, r.toName)}
                                style={{
                                    background: "#f1f5f9",
                                    border: "1px solid #cbd5e1",
                                    borderRadius: "16px",
                                    padding: "5px 12px",
                                    fontSize: "12px",
                                    fontWeight: "600",
                                    color: "#1e293b",
                                    cursor: "pointer",
                                    transition: "all 0.2s ease"
                                }}
                            >
                                {r.fromCode} → {r.toCode}
                            </button>
                        ))}
                    </div>

                    {/* ERROR */}

                    {error && (
                        <div className="schedule-error">
                            ⚠ {error}
                        </div>
                    )}

                </div>

            </section>


            {/* RESULTS */}

            {(loading || trains.length > 0) && (
                <section className="schedule-results">

                    <div className="results-header">
                        <div>
                            <span>AVAILABLE TRAINS</span>

                            <h2>
                                {fromText} → {toText}
                            </h2>
                        </div>

                        {!loading && (
                            <strong>
                                {trains.length} train
                                {trains.length !== 1 ? "s" : ""} found
                            </strong>
                        )}
                    </div>


                    {loading ? (
                        <div className="schedule-loading-box">
                            <div className="loading-spinner"></div>
                            <p>Finding trains...</p>
                        </div>
                    ) : (
                        <div className="train-results-list">

                            {trains.map((item, index) => {

                                const train = item.train || item;

                                const from = item.from || {};
                                const to = item.to || {};

                                return (
                                    <article
                                        className={`schedule-train-card ${expandedTrain ===
                                            (train.number || train.trainNumber || index)
                                            ? "train-card-expanded"
                                            : ""
                                            }`}
                                        key={
                                            train.number ||
                                            train.trainNumber ||
                                            index
                                        }
                                        onClick={() =>
                                            setExpandedTrain(
                                                expandedTrain ===
                                                    (train.number || train.trainNumber || index)
                                                    ? null
                                                    : train.number || train.trainNumber || index
                                            )
                                        }
                                    >

                                        <div className="train-card-top">

                                            <div className="train-identity">

                                                <span className="train-number">
                                                    {train.number ||
                                                        train.trainNumber ||
                                                        "--"}
                                                </span>

                                                <h3>
                                                    {train.name ||
                                                        train.trainName ||
                                                        "Train"}
                                                </h3>

                                                <span className="train-type">
                                                    {train.type || "Express"}
                                                </span>

                                            </div>

                                            {onSelectTrain && (
                                                <button
                                                    className="btn-track-live"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSelectTrain(train);
                                                    }}
                                                    style={{
                                                        background: "#174d91",
                                                        color: "#ffffff",
                                                        border: "none",
                                                        borderRadius: "5px",
                                                        padding: "6px 14px",
                                                        fontSize: "13px",
                                                        fontWeight: "600",
                                                        cursor: "pointer",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: "6px",
                                                        boxShadow: "0 2px 6px rgba(23, 77, 145, 0.25)",
                                                        transition: "all 0.2s ease"
                                                    }}
                                                    title="Track this train live on OpenStreetMap"
                                                >
                                                    ⚡ Track Live
                                                </button>
                                            )}

                                        </div>


                                        <div className="train-route-summary">

                                            <div className="schedule-time-block departure-time-block">
                                                <strong className="schedule-time-badge departure">
                                                    {from.departure || "--"}
                                                </strong>

                                                <span>
                                                    {from.name || from.stationName || fromText}
                                                </span>
                                            </div>


                                            <div className="route-middle">

                                                <span className="route-duration">
                                                    {formatDuration(item.duration)}
                                                </span>

                                                <div className="route-line-display">
                                                    <span></span>
                                                    <i>🚆</i>
                                                    <span></span>
                                                </div>

                                                <small>
                                                    {item.distance
                                                        ? `${item.distance} km`
                                                        : ""}
                                                </small>

                                            </div>


                                            <div className="schedule-time-block destination-time destination-time-block">
                                                <strong className="schedule-time-badge arrival">
                                                    {to.arrival || "--"}
                                                </strong>

                                                <span>
                                                    {to.name || to.stationName || toText}
                                                </span>
                                            </div>

                                        </div>


                                        <div className="train-card-bottom">

                                            <span>
                                                🛑 {item.totalHaltsBetween ?? "--"} halts
                                            </span>

                                            <span>
                                                📅{" "}
                                                {train.runDays?.length
                                                    ? train.runDays
                                                        .map(
                                                            (day) =>
                                                                day
                                                                    .slice(0, 1)
                                                                    .toUpperCase() +
                                                                day.slice(1, 3)
                                                        )
                                                        .join(" • ")
                                                    : "Schedule available"}
                                            </span>

                                        </div>
                                        {expandedTrain ===
                                            (train.number || train.trainNumber || index) && (
                                                <div className="expanded-train-details">

                                                    <div className="expanded-details-header">
                                                        <div>
                                                            <span>TRAIN INFORMATION</span>
                                                            <h4>Journey Details</h4>
                                                        </div>

                                                        <span className="collapse-label">
                                                            Click to collapse ↑
                                                        </span>
                                                    </div>


                                                    <div className="expanded-details-grid">

                                                        <div className="detail-item">
                                                            <span>Train Number</span>
                                                            <strong>
                                                                {train.number ||
                                                                    train.trainNumber ||
                                                                    "--"}
                                                            </strong>
                                                        </div>

                                                        <div className="detail-item">
                                                            <span>Train Type</span>
                                                            <strong>
                                                                {train.type || "Express"}
                                                            </strong>
                                                        </div>

                                                        <div className="detail-item">
                                                            <span>Total Distance</span>
                                                            <strong>
                                                                {item.distance
                                                                    ? `${item.distance} km`
                                                                    : "--"}
                                                            </strong>
                                                        </div>

                                                        <div className="detail-item">
                                                            <span>Journey Duration</span>
                                                            <strong>
                                                                {formatDuration(item.duration)}
                                                            </strong>
                                                        </div>

                                                        <div className="detail-item">
                                                            <span>Halts Between</span>
                                                            <strong>
                                                                {item.totalHaltsBetween ?? "--"}
                                                            </strong>
                                                        </div>

                                                        <div className="detail-item">
                                                            <span>Departure</span>
                                                            <strong>
                                                                {from.departure || "--"}
                                                            </strong>
                                                        </div>

                                                        <div className="detail-item">
                                                            <span>Arrival</span>
                                                            <strong>
                                                                {to.arrival || "--"}
                                                            </strong>
                                                        </div>

                                                        <div className="detail-item">
                                                            <span>Running Days</span>
                                                            <strong>
                                                                {train.runDays?.length
                                                                    ? `${train.runDays.length} days`
                                                                    : "--"}
                                                            </strong>
                                                        </div>

                                                    </div>


                                                    <div className="expanded-route">

                                                        <div className="expanded-route-point">

                                                            <div className="expanded-dot"></div>

                                                            <div>
                                                                <small>DEPARTURE</small>

                                                                <strong>
                                                                    {from.name ||
                                                                        from.stationName ||
                                                                        fromText}
                                                                </strong>

                                                                <span>
                                                                    {from.departure || "--"}
                                                                </span>
                                                            </div>

                                                        </div>


                                                        <div className="expanded-route-line">
                                                            <span>🚆</span>
                                                        </div>


                                                        <div className="expanded-route-point">

                                                            <div className="expanded-dot"></div>

                                                            <div>
                                                                <small>ARRIVAL</small>

                                                                <strong>
                                                                    {to.name ||
                                                                        to.stationName ||
                                                                        toText}
                                                                </strong>

                                                                <span>
                                                                    {to.arrival || "--"}
                                                                </span>
                                                            </div>

                                                        </div>

                                                    </div>

                                                </div>
                                            )}
                                    </article>
                                );
                            })}

                        </div>
                    )}

                </section>
            )}

        </main>
    );
}

export default TrainSchedule;