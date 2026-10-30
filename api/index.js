const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

let CLIENT_ID = null;
let LAST_UPDATE = 0;

// --- Helper: Get Client ID ---
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

// --- Helper: Get ID by Name ---
async function getTrackIdByName(query) {
    const client_id = await getClientId();
    const res = await axios.get("https://api-v2.soundcloud.com/search/tracks", {
        params: { q: query, client_id, limit: 1 }
    });
    return res.data.collection[0] ? res.data.collection[0] : null;
}




// --- Naya Endpoint: Info (Poster + Title + Stream) ---
app.get("/info", async (req, res) => {
    const name = req.query.name;
    if (!name) return res.status(400).json({ error: "name required" });

    try {
        // 1. Gaana search karo
        const track = await getTrackIdByName(name);
        if (!track) return res.status(404).json({ message: "Song not found" });

        // 2. Poster URL prepare karo
        const poster = track.artwork_url ? track.artwork_url.replace("large", "t500x500") : null;

        // 3. Stream URL nikalo
        const client_id = await getClientId();
        const progressive = track.media?.transcodings?.find(x => x.format.protocol === "progressive");
        
        if (!progressive) return res.status(404).json({ message: "Stream not found" });

        const auth = await axios.get(progressive.url, { params: { client_id } });

        // 4. Sab kuch JSON mein return karo
        res.json({
            success: true,
            title: track.title,
            artist: track.user?.username || "Unknown",
            poster: poster,
            stream: auth.data.url,
            download: `/dl?name=${encodeURIComponent(name)}`
        });

    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});



// --- Play Endpoint: play?name=SongName ---
app.get("/play", async (req, res) => {
    const name = req.query.name;
    const id = req.query.id;

    try {
        let track;
        if (name) {
            track = await getTrackIdByName(name);
        } else if (id) {
            const client_id = await getClientId();
            const resData = await axios.get(`https://api-v2.soundcloud.com/tracks/${id}`, { params: { client_id } });
            track = resData.data;
        } else {
            return res.status(400).json({ error: "name or id required" });
        }

        if (!track) return res.status(404).json({ message: "Song not found" });

        const client_id = await getClientId();
        const progressive = track.media?.transcodings?.find(x => x.format.protocol === "progressive");
        if (!progressive) return res.status(404).json({ message: "Stream not found" });

        const auth = await axios.get(progressive.url, { params: { client_id } });
        if (auth.data.url) return res.redirect(auth.data.url);
        
        res.status(404).json({ message: "No playable stream" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Download Endpoint: dl?name=SongName ---
app.get("/dl", async (req, res) => {
    const name = req.query.name;
    if (!name) return res.status(400).json({ error: "name required" });

    try {
        const track = await getTrackIdByName(name);
        if (!track) return res.status(404).json({ message: "Song not found" });

        const client_id = await getClientId();
        const progressive = track.media?.transcodings?.find(x => x.format.protocol === "progressive");
        if (!progressive) return res.status(404).json({ message: "Stream not found" });

        const auth = await axios.get(progressive.url, { params: { client_id } });
        
        const response = await axios({ method: 'get', url: auth.data.url, responseType: 'stream' });
        
        const safeName = track.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}.mp3"`);
        res.setHeader('Content-Type', 'audio/mpeg');
        
        response.data.pipe(res);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
