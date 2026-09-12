import { useState, useRef, useEffect } from "react";
import trainImage from "./assets/train.jpg";
import LiveTrainStatus from "./components/LiveTrainStatus";
import TrainSchedule from "./components/TrainSchedule";
import trainApi from "./services/api";
import "./App.css";

function App() {
  const [searchType, setSearchType] = useState("number");
  const [search, setSearch] = useState("");
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [language, setLanguage] = useState("English");
  const [activePage, setActivePage] = useState("home");
  const resultRef = useRef(null);
  const timelineRef = useRef(null);
  const currentStationRef = useRef(null);
  const routeSectionRef = useRef(null);
  const [darkMode, setDarkMode] = useState(false);
  const [popularTrains, setPopularTrains] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollToCurrentStation = () => {
    setTimeout(() => {
      // 1. Scroll window so the results card / route section is in view
      if (resultRef.current) {
        resultRef.current.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }

      // 2. Automatically scroll route timeline down to the current station
      if (currentStationRef.current && timelineRef.current) {
        const container = timelineRef.current;
        const currentEl = currentStationRef.current;
        const containerRect = container.getBoundingClientRect();
        const currentRect = currentEl.getBoundingClientRect();

        const targetScroll =
          container.scrollTop +
          (currentRect.top - containerRect.top) -
          container.clientHeight / 2 +
          currentRect.height / 2;

        container.scrollTo({
          top: Math.max(0, targetScroll),
          behavior: "smooth",
        });
      }
    }, 300);
  };

  useEffect(() => {
    if (selectedTrain) {
      scrollToCurrentStation();
    }
  }, [selectedTrain]);


  useEffect(() => {
    window.googleTranslateElementInit = () => {
      new window.google.translate.TranslateElement(
        {
          pageLanguage: "en",
          includedLanguages: "en,hi,gu",
          autoDisplay: false,
        },
        "google_translate_element"
      );
    };

    if (!document.getElementById("google-translate-script")) {
      const script = document.createElement("script");

      script.id = "google-translate-script";
      script.src =
        "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
      script.async = true;

      document.body.appendChild(script);
    }
  }, []);


  useEffect(() => {
    const fetchPopularTrains = async () => {
      try {
        const result = await trainApi.fetchPopularTrains();
        const rawList = result?.data || [];
        const cleaned = rawList.map((train) => {
          let num = String(train.number || "");
          if (num.includes("data") || num.includes("{") || num.includes('"')) {
            const match = num.match(/\d{4,5}/);
            num = match ? match[0] : num.replace(/[^\d]/g, "");
          }
          return { ...train, number: num };
        });
        setPopularTrains(cleaned);
      } catch (error) {
        console.error("Popular trains error:", error);
      }
    };

    fetchPopularTrains();
  }, []);

  // const trainData = {
  // "12951": {
  //     number: "12951",
  //     name: "Mumbai Rajdhani Express",
  //     from: "Mumbai Central",
  //     to: "New Delhi",
  //     currentStation: "Vadodara Junction",
  //     nextStation: "Ratlam Junction",
  //     delay: "12 min late",
  //     eta: "18:42",
  //     etd: "18:47",
  //     platform: "Platform 3",
  //     status: "Running",

  //     prediction: {
  //       scheduledArrival: "18:30",
  //       predictedArrival: "18:42",
  //       delayMinutes: 12,
  //       confidence: 92,
  //       reason: "Previous station delay + current route congestion"
  //     },

  //     route: [
  //       {
  //         station: "Mumbai Central",
  //         scheduled: "17:00",
  //         expected: "17:00",
  //         status: "completed"
  //       },
  //       {
  //         station: "Surat",
  //         scheduled: "19:10",
  //         expected: "19:15",
  //         status: "completed"
  //       },
  //       {
  //         station: "Vadodara Junction",
  //         scheduled: "20:35",
  //         expected: "20:47",
  //         status: "current"
  //       },
  //       {
  //         station: "Ratlam Junction",
  //         scheduled: "00:05",
  //         expected: "00:17",
  //         status: "upcoming"
  //       },
  //       {
  //         station: "Kota Junction",
  //         scheduled: "03:20",
  //         expected: "03:32",
  //         status: "upcoming"
  //       },
  //       {
  //         station: "New Delhi",
  //         scheduled: "08:30",
  //         expected: "08:42",
  //         status: "upcoming"
  //       }
  //     ]
  //   },

  //   "22222": {
  //     number: "22222",
  //     name: "CSMT Rajdhani Express",
  //     from: "Mumbai Central",
  //     to: "New Delhi",
  //     currentStation: "Surat",
  //     nextStation: "Vadodara Junction",
  //     delay: "8 min late",
  //     eta: "20:15",
  //     etd: "20:20",
  //     platform: "Platform 2",
  //     status: "Running"
  //   }
  // };

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

  const handleSearch = async (value) => {
    const query = typeof value === "string" ? value.trim() : search.trim();

    if (!query) {
      alert(
        searchType === "number"
          ? "Please enter a train number"
          : "Please enter a train name"
      );
      return;
    }

    try {
      let targetTrainNumber = query;

      // If searching by train name, resolve train number first
      if (searchType === "name") {
        const searchResult = await trainApi.searchTrains(query);
        const trains = searchResult?.data || searchResult || [];

        if (!Array.isArray(trains) || trains.length === 0) {
          alert(`No train found matching "${query}".`);
          return;
        }

        targetTrainNumber =
          trains[0].train_number ||
          trains[0].trainNumber ||
          trains[0].number;

        if (!targetTrainNumber) {
          alert("Train number could not be resolved.");
          return;
        }
      }

      // Fetch dynamic ETA with ML inference from FastAPI backend
      const result = await trainApi.fetchDynamicETA(targetTrainNumber);

      if (!result?.success || !result?.data) {
        throw new Error("Unable to retrieve dynamic ETA for this train.");
      }

      const etaData = result.data;
      const route = etaData.route || [];
      const currentCode = etaData.currentLocation?.stationCode;

      const currentRouteIndex = route.findIndex(
        (s) =>
          (currentCode && s.stationCode && s.stationCode.toUpperCase() === currentCode.toUpperCase()) ||
          s.status === "current"
      );

      const currentStation =
        currentRouteIndex >= 0
          ? route[currentRouteIndex]?.stationName
          : route[0]?.stationName || "In Transit";

      const nextRoute =
        currentRouteIndex >= 0 && currentRouteIndex + 1 < route.length
          ? route[currentRouteIndex + 1]
          : null;

      const nextStation = nextRoute?.stationName || "Terminating Station";
      const currentRoute = currentRouteIndex >= 0 ? route[currentRouteIndex] : null;

      const convertedTrain = {
        number: etaData.trainNumber,
        name: etaData.trainName,
        from: route[0]?.stationName || "Origin",
        to: route[route.length - 1]?.stationName || "Destination",
        currentStation,
        nextStation,
        delay:
          etaData.overallDelayMinutes > 0
            ? `${Math.round(etaData.overallDelayMinutes)} min late`
            : "On time",
        overallDelayMinutes: etaData.overallDelayMinutes,
        eta: formatTime(nextRoute?.predictedArrival || nextRoute?.scheduledArrival),
        etd: formatTime(currentRoute?.predictedDeparture || currentRoute?.scheduledDeparture),
        platform: currentRoute?.platform || nextRoute?.platform || "1",
        status:
          etaData.status === "running"
            ? "Running"
            : etaData.status || "Running",
        lastUpdated: new Date().toISOString(),
        modelUsed: etaData.modelUsed || "lightgbm_baseline",
        prediction: {
          scheduledArrival: formatTime(nextRoute?.scheduledArrival),
          predictedArrival: formatTime(nextRoute?.predictedArrival || nextRoute?.actualArrival),
          delayMinutes: Math.round(nextRoute?.predictedDelayMinutes ?? etaData.overallDelayMinutes),
          delayTrend: nextRoute?.delayTrend || "stable",
          modelUsed: etaData.modelUsed || "lightgbm_baseline",
          reason: "LightGBM ML inference with real-time telemetry",
        },
        route: route.map((station, index) => {
          let stopStatus = "upcoming";

          if (currentRouteIndex >= 0) {
            if (index < currentRouteIndex) {
              stopStatus = "completed";
            } else if (index === currentRouteIndex) {
              stopStatus = "current";
            } else {
              stopStatus = "upcoming";
            }
          } else {
            if (
              station.status === "departed" ||
              station.status === "completed" ||
              station.status === "passed"
            ) {
              stopStatus = "completed";
            } else if (station.status === "current") {
              stopStatus = "current";
            } else {
              stopStatus = "upcoming";
            }
          }

          return {
            station: station.stationName,
            stationCode: station.stationCode,
            scheduled:
              formatTime(station.scheduledArrival) !== "--"
                ? formatTime(station.scheduledArrival)
                : formatTime(station.scheduledDeparture),
            expected:
              formatTime(station.predictedArrival) !== "--"
                ? formatTime(station.predictedArrival)
                : formatTime(station.actualArrival) !== "--"
                ? formatTime(station.actualArrival)
                : formatTime(station.scheduledArrival),
            predictedDelay: station.predictedDelayMinutes,
            delayTrend: station.delayTrend,
            status: stopStatus,
            platform: station.platform,
            distance: station.distance,
          };
        }),
      };

      setSelectedTrain(convertedTrain);
      scrollToCurrentStation();
    } catch (error) {
      console.error("Search error:", error);
      alert(error.message || "Unable to find this train. Please verify the train number.");
    }
  };

  return (

    <div className={`website ${darkMode ? "dark-mode" : ""}`}>
      <div id="google_translate_element"></div>
      {/* ================= TOP HEADER ================= */}

      <header className="top-header">

        <div className="railway-ministry">
          <div className="emblem">
            <img
              src="/indian-emblem.png"
              alt="Government of India Emblem"
            />
          </div>

          <div>
            <h3>Ministry of Railways</h3>
            <p>Government of India</p>
          </div>
        </div>


        <div className="ntes-title">
          <h1>National Train Enquiry System</h1>
          <p>Indian Railways</p>
        </div>


        <div className="header-controls">

          <div className="g20">
            <img
              src="/g20-logo.png"
              alt="G20 India 2023"
            />
          </div>

          <select
            className="language"
            value={language}
            onChange={(e) => {
              const selectedLanguage = e.target.value;

              setLanguage(selectedLanguage);

              const languageCode = {
                English: "en",
                Hindi: "hi",
                Gujarati: "gu",
              }[selectedLanguage];

              const googleSelect = document.querySelector(".goog-te-combo");

              if (googleSelect) {
                googleSelect.value = languageCode;
                googleSelect.dispatchEvent(new Event("change"));
              }
            }}
          >
            <option value="English">English</option>
            <option value="Hindi">हिन्दी</option>
            <option value="Gujarati">ગુજરાતી</option>
          </select>

          <button
            className={`theme-toggle ${darkMode ? "dark" : ""}`}
            onClick={() => setDarkMode(!darkMode)}
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {darkMode ? "☀️" : "🌙"}
          </button>

        </div>

      </header>


      <nav className={`main-nav ${mobileMenuOpen ? "mobile-open" : ""}`}>

        {/* Mobile Hamburger */}
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Open navigation menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <div className="nav-links">

          <button
            className={activePage === "home" ? "nav-active" : ""}
            onClick={() => {
              setActivePage("home");
              setMobileMenuOpen(false);
            }}
          >
            Home
          </button>

          <button
            className={activePage === "live" ? "nav-active" : ""}
            onClick={() => {
              setActivePage("live");
              setMobileMenuOpen(false);
            }}
          >
            Live Train Status
          </button>

          <button
            className={activePage === "schedule" ? "nav-active" : ""}
            onClick={() => {
              setActivePage("schedule");
              setMobileMenuOpen(false);
            }}
          >
            Train Schedule
          </button>

          <button
            className={activePage === "between" ? "nav-active" : ""}
            onClick={() => {
              setActivePage("between");
              setMobileMenuOpen(false);
            }}
          >
            Trains between Stations
          </button>

          <button
            className={activePage === "more" ? "nav-active" : ""}
            onClick={() => {
              setActivePage("more");
              setMobileMenuOpen(false);
            }}
          >
            More
          </button>

        </div>
      </nav>

      {/* ================= PAGE CONTENT ================= */}

      {activePage === "live" ? (
        <LiveTrainStatus />
      ) : activePage === "schedule" || activePage === "between" ? (
        <TrainSchedule />
      ) : (
        <>


          {/* ================= HERO ================= */}

          <section className="hero">

            <div className="hero-text">

              <h2>Track Your Train</h2>

              <p>
                Get live status, expected time of arrival (ETA),
                delay, route and all stoppages.
              </p>

            </div>


            {/* SEARCH PANEL */}

            <div className="search-panel">
              <select
                className="mobile-search-type"
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
              >
                <option value="number">By Train No.</option>
                <option value="name">By Train Name</option>
              </select>
              <div className="search-tabs">

                <button
                  className={searchType === "number" ? "selected" : ""}
                  onClick={() => setSearchType("number")}
                >
                  By Train No.
                </button>

                <button
                  className={searchType === "name" ? "selected" : ""}
                  onClick={() => setSearchType("name")}
                >
                  By Train Name
                </button>

              </div>


              <div className="search-row">

                <div className="search-input">

                  <span>🚆</span>

                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                    placeholder={
                      searchType === "number"
                        ? "Enter Train Number (e.g. 12951)"
                        : "Enter Train Name"
                    }
                  />

                </div>


                <button
                  className="search-btn"
                  onClick={handleSearch}
                >
                  Search
                </button>

              </div>


              {/* POPULAR TRAINS */}

              <div className="popular-trains">

                <span>Popular Trains :</span>

                {popularTrains.map((train) => (
                  <button
                    key={train.number}
                    onClick={() => {
                      setSearchType("number");
                      setSearch(train.number);
                      handleSearch(train.number);
                    }}
                  >
                    {train.number}
                  </button>
                ))}

              </div>

            </div>


            {/* TRAIN IMAGE */}

            <div className="train-image">
              <img src={trainImage} alt="Indian Railways Train" />
            </div>

          </section>


          {/* ================= SERVICES ================= */}

          <section className="services">

            <div className="service-card">

              <div className="service-icon">
                🚆
              </div>

              <h3>Live Train Status</h3>

              <p>Real-time running status</p>

            </div>


            <div className="service-card">

              <div className="service-icon">
                📅
              </div>

              <h3>Train Schedule</h3>

              <p>Arrival & Departure time</p>

            </div>


            <div className="service-card">

              <div className="service-icon">
                🚌
              </div>

              <h3>Coach Position</h3>

              <p>Find your coach</p>

            </div>


            <div className="service-card">

              <div className="service-icon">
                🔀
              </div>

              <h3>Trains between Stations</h3>

              <p>Direct trains list</p>

            </div>


            <div className="service-card cancellation">

              <div className="service-icon">
                ❌
              </div>

              <h3>Cancellation / Reschedule</h3>

              <p>Stay updated</p>

            </div>

          </section>

          {/* ================= TRAIN STATUS ================= */}

          {selectedTrain && (
            <section ref={resultRef} className="train-status">

              <div className="status-header">

                <div className="train-heading">

                  <div className="status-top-row">
                    <span className="status-badge">
                      ● LIVE
                    </span>

                    <span className="running-text">
                      {selectedTrain.status}
                    </span>

                    {selectedTrain.modelUsed && (
                      <span className="ml-badge" title="Dynamic ETA computed by LightGBM model">
                        ⚡ ML Model: {selectedTrain.modelUsed}
                      </span>
                    )}
                  </div>

                  <h2>
                    {selectedTrain.number} — {selectedTrain.name}
                  </h2>

                  <p>
                    {selectedTrain.from} <span>→</span> {selectedTrain.to}
                  </p>

                </div>

                <div className="delay-highlight">
                  <span>Current Delay</span>
                  <strong>{selectedTrain.delay}</strong>
                </div>

                <button
                  className="close-status"
                  onClick={() => setSelectedTrain(null)}
                >
                  ✕
                </button>

              </div>

              <div className="status-grid">

                <div className="status-box current-box">
                  <span>📍 Current Station</span>
                  <strong>{selectedTrain.currentStation}</strong>
                </div>

                <div className="status-box next-box">
                  <span>🚉 Next Station</span>
                  <strong>{selectedTrain.nextStation}</strong>
                </div>

                <div className="status-box delay-box">
                  <span>⏱ Delay</span>
                  <strong className="delay">
                    {selectedTrain.delay}
                  </strong>
                </div>

                <div className="status-box platform-box">
                  <span>🛤 Platform</span>
                  <strong>{selectedTrain.platform}</strong>
                </div>

              </div>

              <div className="last-updated">
                Last updated:{" "}
                {selectedTrain.lastUpdated
                  ? new Date(selectedTrain.lastUpdated).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  })
                  : "Updating..."}
              </div>

              <div className="route-section" ref={routeSectionRef}>

                <div className="route-title">
                  <h3>Train Route</h3>
                  <span>Scheduled vs Dynamic ML ETA</span>
                </div>

                <div className="route-timeline" ref={timelineRef}>

                  {selectedTrain.route.map((stop, index) => (

                    <div
                      className={`route-stop ${stop.status}`}
                      key={`${stop.stationCode || stop.station}-${index}`}
                      ref={stop.status === "current" ? currentStationRef : null}
                    >

                      <div className={`route-marker ${stop.status}`}>
                        {stop.status === "current" ? (
                          "●"
                        ) : stop.status === "completed" || stop.status === "departed" || stop.status === "passed" ? (
                          "✓"
                        ) : (
                          "○"
                        )}

                        {stop.status === "current" && (
                          <span className="train-indicator">🚆</span>
                        )}
                      </div>

                      <div className="route-line"></div>

                      <div className="station-info">

                        <div className="station-name">
                          {stop.station}

                          {stop.status === "current" && (
                            <span className="current-label">
                              CURRENT
                            </span>
                          )}
                        </div>

                        <div className="station-times">

                          <span className="time-badge scheduled-badge">
                            <span className="time-label">Scheduled:</span>
                            <strong className="time-val">{stop.scheduled}</strong>
                          </span>

                          <span className="time-badge predicted-badge">
                            <span className="time-label">Predicted ETA:</span>
                            <strong className="time-val predicted-time">{stop.expected}</strong>
                          </span>

                          {stop.status === "upcoming" && stop.delayTrend && (
                            <span className={`trend-badge trend-${stop.delayTrend}`}>
                              {stop.delayTrend === "improving" && "🟢 Delay Reducing"}
                              {stop.delayTrend === "increasing" && "🔴 Delay Increasing"}
                              {stop.delayTrend === "stable" && "🟡 Delay Stable"}
                              {stop.predictedDelay > 0 ? ` (+${Math.round(stop.predictedDelay)}m)` : ""}
                            </span>
                          )}

                        </div>

                      </div>

                    </div>

                  ))}

                </div>

              </div>
            </section>
          )}
        </>
      )}

      {/* ================= FOOTER ================= */}
      <footer className="site-footer">
        <div className="footer-main">

          {/* Brand */}
          <div className="footer-brand">
            <h2>Indian Railways</h2>
            <h3>Railway Information System</h3>
            <p>
              A smart railway information platform for tracking trains,
              viewing schedules and accessing real-time journey information.
            </p>
          </div>

          {/* Quick Links */}
          <div className="footer-column">
            <h4>Quick Links</h4>
            <button onClick={() => setActivePage("home")}>Home</button>
            <button onClick={() => setActivePage("live")}>Live Train Status</button>
            <button>Train Schedule</button>
            <button>Trains Between Stations</button>
          </div>

          {/* Railway Services */}
          <div className="footer-column">
            <h4>Railway Services</h4>
            <button>Track Your Train</button>
            <button>Train Running Status</button>
            <button>Coach Position</button>
            <button>Journey Information</button>
          </div>

          {/* Information */}
          <div className="footer-column">
            <h4>Information</h4>
            <button>About the System</button>
            <button>Help & Support</button>
            <button>Accessibility</button>
            <button>Feedback</button>
          </div>

        </div>

        {/* Footer Bottom */}
        <div className="footer-bottom">
          <div>
            © 2026 Railway Information System
          </div>

          <div className="footer-bottom-links">
            <span>Privacy Policy</span>
            <span>Terms of Use</span>
            <span>Accessibility</span>
          </div>

          <div>
            SIH 2026 Prototype
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;