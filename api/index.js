const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const DEFAULT_POSTER_URL = "https://i.ibb.co/nqFL3YnZ/1780943911545.png";
const CLIENT_ID = "2t9mqaC7aZrr6v6scvW6Y06Z7v0K8A1Z"; // Permanent valid SoundCloud Client ID

app.get("/info", async (req, res) => {
    const query = req.query.name || req.query.query;
    if (!query) {
        return res.status(400).json({ error: "Please provide a 'name' parameter (e.g., /info?name=kesariya)" });
    }

    try {
        const searchRes = await axios.get("https://api-v2.soundcloud.com/search/tracks", {
            params: { q: query, client_id: CLIENT_ID, limit: 5 }
        });

        const collection = searchRes.data?.collection;
        if (!collection || collection.length === 0) {
            return res.status(404).json({ success: false, message: "Song not found." });
        }

        let directStreamUrl = null;
        let validTrack = null;

        for (const track of collection) {
            const progressive = track.media?.transcodings?.find(x => x.format.protocol === "progressive");
            if (progressive && progressive.url) {
                try {
                    const auth = await axios.get(progressive.url, { params: { client_id: CLIENT_ID } });
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
            return res.status(404).json({ success: false, message: "No playable stream found." });
        }

        res.json({
            success: true,
            title: validTrack.title,
            album: validTrack.publisher_metadata?.album_title || "Single",
            artist: validTrack.user?.username || "Unknown Artist",
            poster: validTrack.artwork_url ? validTrack.artwork_url.replace("large", "t500x500") : DEFAULT_POSTER_URL,
            duration: validTrack.duration ? Math.floor(validTrack.duration / 1000) : 0,
            stream: directStreamUrl
        });

    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get("/play", async (req, res) => {
    const query = req.query.name || req.query.query;
    if (!query) return res.status(400).json({ error: "Please provide a 'name' parameter." });

    try {
        const searchRes = await axios.get("https://api-v2.soundcloud.com/search/tracks", {
            params: { q: query, client_id: CLIENT_ID, limit: 3 }
        });

        const collection = searchRes.data?.collection;
        if (!collection || collection.length === 0) return res.status(404).json({ error: "Song not found" });

        for (const track of collection) {
            const progressive = track.media?.transcodings?.find(x => x.format.protocol === "progressive");
            if (progressive && progressive.url) {
                try {
                    const auth = await axios.get(progressive.url, { params: { client_id: CLIENT_ID } });
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
