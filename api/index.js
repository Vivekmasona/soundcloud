const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const DEFAULT_POSTER_URL = "https://i.ibb.co/nqFL3YnZ/1780943911545.png";

let CLIENT_ID = null;
let LAST_UPDATE = 0;

// Dynamic Client ID fetcher jo kabhi expire nahi hone deta
async function getClientId() {
    if (CLIENT_ID && (Date.now() - LAST_UPDATE) < 3600000) return CLIENT_ID;
    try {
        const home = await axios.get("https://soundcloud.com", { headers: { "User-Agent": "Mozilla/5.0" } });
        const html = home.data;
        const files = [...html.matchAll(/src="([^"]+\/assets\/[^"]+\.js)"/g)].map(v => v[1]);
        for (const file of files.reverse().slice(0, 5)) {
            const js = await axios.get(file);
            const match = js.data.match(/client_id\s*:\s*"([a-zA-Z0-9]{32})"/);
            if (match) {
                CLIENT_ID = match[1];
                LAST_UPDATE = Date.now();
                return CLIENT_ID;
            }
        }
    } catch (e) {}
    // Fallback static client_id agar script scraping fail ho jaye
    CLIENT_ID = "2t9mqaC7aZrr6v6scvW6Y06Z7v0K8A1Z";
    LAST_UPDATE = Date.now();
    return CLIENT_ID;
}

// --- Info Endpoint: Sabhi gaano ke liye direct full-length stream URL ---
app.get("/info", async (req, res) => {
    const query = req.query.name || req.query.query;
    if (!query) {
        return res.status(400).json({ error: "Please provide a 'name' parameter (e.g., /info?name=kesariya)" });
    }

    try {
        const client_id = await getClientId();
        const searchRes = await axios.get("https://api-v2.soundcloud.com/search/tracks", {
            params: { q: query, client_id, limit: 10 }
        });

        const collection = searchRes.data?.collection;
        if (!collection || collection.length === 0) {
            return res.status(404).json({ success: false, message: "Song not found on SoundCloud." });
        }

        let validTrack = null;
        let directStreamUrl = null;

        // Loop chalakar check karenge ki kiska working progressive MP3 stream available hai
        for (const track of collection) {
            const progressive = track.media?.transcodings?.find(x => x.format.protocol === "progressive");
            if (progressive && progressive.url) {
                try {
                    const auth = await axios.get(progressive.url, { params: { client_id } });
                    if (auth.data?.url) {
                        validTrack = track;
                        directStreamUrl = auth.data.url;
                        break;
                    }
                } catch (err) {
                    continue;
                }
            }
        }

        if (!validTrack || !directStreamUrl) {
            return res.status(404).json({ success: false, message: "No playable stream found for this song." });
        }

        res.json({
            success: true,
            title: validTrack.title,
            album: validTrack.publisher_metadata?.album_title || "Single",
            artist: validTrack.user?.username || "Unknown Artist",
            poster: validTrack.artwork_url ? validTrack.artwork_url.replace("large", "t500x500") : DEFAULT_POSTER_URL,
            duration: validTrack.duration ? Math.floor(validTrack.duration / 1000) : 0,
            stream: directStreamUrl // Yeh raha 100% full-length direct MP3 CDN link!
        });

    } catch (e) {
        res.status(500).json({ success: false, error: "Fetch failed", details: e.message });
    }
});

// --- Direct Play Redirect Route ---
app.get("/play", async (req, res) => {
    const query = req.query.name || req.query.query;
    if (!query) return res.status(400).json({ error: "Please provide a 'name' parameter." });

    try {
        const client_id = await getClientId();
        const searchRes = await axios.get("https://api-v2.soundcloud.com/search/tracks", {
            params: { q: query, client_id, limit: 5 }
        });

        const collection = searchRes.data?.collection;
        if (!collection || collection.length === 0) return res.status(404).json({ error: "Song not found" });

        for (const track of collection) {
            const progressive = track.media?.transcodings?.find(x => x.format.protocol === "progressive");
            if (progressive && progressive.url) {
                try {
                    const auth = await axios.get(progressive.url, { params: { client_id } });
                    if (auth.data?.url) {
                        return res.redirect(auth.data.url);
                    }
                } catch (err) {
                    continue;
                }
            }
        }

        res.status(404).json({ error: "Stream link not available" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log("Server Running on port " + PORT));
}

module.exports = app;
