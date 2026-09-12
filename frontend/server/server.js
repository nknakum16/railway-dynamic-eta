import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 5000;

app.get("/api/popular-trains", async (req, res) => {
    try {
        const response = await fetch(
            "https://api.railradar.in/v1/lookup/trains/compressed",
            {
                headers: {
                    Authorization: `Bearer ${process.env.RAILRADAR_API_KEY}`,
                },
            }
        );

        const rawData = await response.text();

        if (!response.ok) {
            console.log("Popular trains API error:", response.status, rawData);

            return res.status(response.status).json({
                success: false,
                message: "Unable to fetch trains",
            });
        }

        let compressedData = rawData;

        // RailRadar may return JSON containing the compressed data
        try {
            const parsed = JSON.parse(rawData);

            if (typeof parsed === "string") {
                compressedData = parsed;
            } else if (parsed?.data) {
                compressedData = parsed.data;
            }
        } catch {
            // Response is already plain text
        }

        const trains = String(compressedData)
            .split("\n")
            .filter(Boolean)
            .slice(0, 8)
            .map((line) => {
                const [number, name, source, destination] = line.split("|");
                let trainNum = number?.trim();
                if (trainNum && (trainNum.includes("data") || trainNum.includes("{") || trainNum.includes('"'))) {
                    const match = trainNum.match(/\d{4,5}/);
                    trainNum = match ? match[0] : trainNum.replace(/[^\d]/g, "");
                }

                return {
                    number: trainNum,
                    name: name?.trim(),
                    source: source?.trim(),
                    destination: destination?.trim(),
                };
            })
            .filter((train) => train.number);

        console.log("POPULAR TRAINS:", trains);

        res.json({
            success: true,
            data: trains,
        });
    } catch (error) {
        console.error("Popular trains error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to fetch trains",
        });
    }
});

app.get("/api/train/:trainNumber", async (req, res) => {
    try {
        const { trainNumber } = req.params;

        const response = await fetch(
            `https://api.railradar.in/v1/trains/${trainNumber}/live?authoritative=true`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.RAILRADAR_API_KEY}`,
                },
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.log("RailRadar API Error:", response.status, data);

            return res.status(response.status).json({
                success: false,
                message: "RailRadar API request failed",
                error: data
            });
        }

        res.json(data);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Unable to fetch live train data",
        });
    }
});

app.get("/api/search-train", async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || !q.trim()) {
            return res.status(400).json({
                success: false,
                message: "Search query is required",
            });
        }

        const response = await fetch(
            `https://api.railradar.in/v1/lookup/search/trains?q=${encodeURIComponent(
                q.trim()
            )}&limit=10`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.RAILRADAR_API_KEY}`,
                },
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.log("Train Search API Error:", response.status, data);

            return res.status(response.status).json({
                success: false,
                message: "Train search failed",
                error: data,
            });
        }

        res.json(data);
    } catch (error) {
        console.error("Train search error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to search trains",
        });
    }
});

app.get("/api/trains-between", async (req, res) => {
    try {
        const { from, to, date } = req.query;

        if (!from || !to) {
            return res.status(400).json({
                success: false,
                message: "From and To stations are required",
            });
        }

        const params = new URLSearchParams();

        if (date) {
            params.append("date", date);
        }

        const queryString = params.toString();

        const response = await fetch(
            `https://api.railradar.in/v1/trains/between/${encodeURIComponent(
                from
            )}/${encodeURIComponent(to)}${queryString ? `?${queryString}` : ""}`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.RAILRADAR_API_KEY}`,
                },
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.log(
                "Trains between stations API error:",
                response.status,
                data
            );

            return res.status(response.status).json({
                success: false,
                message: "Unable to find trains between stations",
                error: data,
            });
        }

        res.json(data);

    } catch (error) {
        console.error("Trains between stations error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to fetch trains between stations",
        });
    }
});

app.get("/api/search-station", async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || !q.trim()) {
            return res.status(400).json({
                success: false,
                message: "Station search query is required",
            });
        }

        const response = await fetch(
            `https://api.railradar.in/v1/lookup/search/stations?q=${encodeURIComponent(
                q.trim()
            )}&limit=8`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.RAILRADAR_API_KEY}`,
                },
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.log(
                "Station Search API Error:",
                response.status,
                data
            );

            return res.status(response.status).json({
                success: false,
                message: "Station search failed",
                error: data,
            });
        }

        res.json(data);

    } catch (error) {
        console.error("Station search error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to search stations",
        });
    }
});


app.listen(PORT, () => {
    console.log(`Railway backend running on http://localhost:${PORT}`);
});