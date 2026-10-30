const express = require("express");
const axios = require("axios");
const NodeID3 = require('node-id3');

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
// Agar poster-embedding timeout ho raha hai, toh ye simple download method use karein
app.get("/dl2", async (req, res) => {
    const name = req.query.name;
    const track = await getTrackIdByName(name);
    if (!track) return res.status(404).send("Song not found");

    const client_id = await getClientId();
    const progressive = track.media?.transcodings?.find(x => x.format.protocol === "progressive");
    const auth = await axios.get(progressive.url, { params: { client_id } });

    // Direct pipe, no heavy processing
    const response = await axios({ method: 'get', url: auth.data.url, responseType: 'stream' });
    res.setHeader('Content-Disposition', `attachment; filename="${track.title.replace(/[^a-z0-9]/gi, '_')}.mp3"`);
    response.data.pipe(res);
});

// Info Endpoint
app.get("/info", async (req, res) => {
    const name = req.query.name;
    const track = await getTrackIdByName(name);
    if (!track) return res.status(404).json({ message: "Not found" });
    
    res.json({
        title: track.title,
        artist: track.user?.username,
        poster: track.artwork_url ? track.artwork_url.replace("large", "t500x500") : DEFAULT_POSTER_URL,
        stream: `/play?id=${track.id}`
    });
});

// Download Endpoint with your Custom Poster
app.get("/dl", async (req, res) => {
    const name = req.query.name;
    try {
        const track = await getTrackIdByName(name);
        const client_id = await getClientId();
        const progressive = track.media?.transcodings?.find(x => x.format.protocol === "progressive");
        const auth = await axios.get(progressive.url, { params: { client_id } });
        
        const response = await axios({ method: 'get', url: auth.data.url, responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);

        // Aapki image download karna
        const imgRes = await axios.get(DEFAULT_POSTER_URL, { responseType: 'arraybuffer' });
        
        const tags = {
            title: track.title,
            artist: track.user?.username || "Vivek",
            image: { mime: "image/png", type: { id: 3, name: "front cover" }, imageBuffer: Buffer.from(imgRes.data) }
        };

        const taggedBuffer = NodeID3.update(tags, buffer);
        res.setHeader('Content-Disposition', `attachment; filename="${track.title.replace(/[^a-z0-9]/gi, '_')}.mp3"`);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.end(taggedBuffer);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(process.env.PORT || 3000, () => console.log("Server Running"));

