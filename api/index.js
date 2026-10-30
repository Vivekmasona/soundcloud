const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// Aapka Default Poster URL
const DEFAULT_POSTER_URL = "https://i.ibb.co/nqFL3YnZ/1780943911545.png";

let CLIENT_ID = null;
let LAST_UPDATE = 0;

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
    CLIENT_ID = "2t9mqaC7aZrr6v6scvW6Y06Z7v0K8A1Z";
    LAST_UPDATE = Date.now();
    return CLIENT_ID;
}

async function getTrackIdByName(query) {
    const client_id = await getClientId();
    const res = await axios.get("https://api-v2.soundcloud.com/search/tracks", {
        params: { q: query, client_id, limit: 5 }
    });
    // Poster wale track ko preference denge
    const track = res.data.collection.find(t => t.artwork_url !== null) || res.data.collection[0];
    return track || null;
}

// --- Info Endpoint (Song details + stream link) ---
app.get("/info", async (req, res) => {
    const name = req.query.name;
    if (!name) return res.status(400).json({ error: "name required" });

    try {
        const track = await getTrackIdByName(name);
        if (!track) return res.status(404).json({ message: "Not found" });
        
        res.json({
            success: true,
            title: track.title,
            artist: track.user?.username || "Unknown",
            poster: track.artwork_url ? track.artwork_url.replace("large", "t500x500") : DEFAULT_POSTER_URL,
            stream: `/play?id=${track.id}`
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- Play / Stream Redirect Endpoint ---
app.get("/play", async (req, res) => {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "id required" });

    try {
        const client_id = await getClientId();
        const trackRes = await axios.get(`https://api-v2.soundcloud.com/tracks/${id}`, { params: { client_id } });
        const track = trackRes.data;

        if (!track) return res.status(404).json({ message: "Song not found" });

        const progressive = track.media?.transcodings?.find(x => x.format.protocol === "progressive");
        if (!progressive) return res.status(404).json({ message: "Stream not found" });

        const auth = await axios.get(progressive.url, { params: { client_id } });
        if (auth.data.url) return res.redirect(auth.data.url);
        
        res.status(404).json({ message: "No playable stream" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log("Server Running on port " + PORT));
}

module.exports = app;
