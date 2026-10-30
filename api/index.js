const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

let CLIENT_ID = null;
let LAST_UPDATE = 0;

// --- Helper: Get Live Client ID ---
async function getFreshClientId() {
    if (CLIENT_ID && (Date.now() - LAST_UPDATE) < 3600000) return CLIENT_ID;
    try {
        const homeResponse = await axios.get('https://soundcloud.com', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const html = homeResponse.data;
        const scriptRegex = /src="([^"]+\/assets\/[^"]+\.js)"/g;
        let match;
        const scripts = [];
        while ((match = scriptRegex.exec(html)) !== null) {
            scripts.push(match[1]);
        }

        for (let scriptUrl of scripts.reverse().slice(0, 3)) {
            const scriptResponse = await axios.get(scriptUrl);
            const idMatch = scriptResponse.data.match(/client_id\s*:\s*"([a-zA-Z0-9]{32})"/);
            if (idMatch && idMatch[1]) {
                CLIENT_ID = idMatch[1];
                LAST_UPDATE = Date.now();
                return CLIENT_ID;
            }
        }
    } catch (e) {
        console.error("ID extraction failed, using fallback");
    }
    CLIENT_ID = '2t9mqaC7aZrr6v6scvW6Y06Z7v0K8A1Z'; 
    LAST_UPDATE = Date.now();
    return CLIENT_ID;
}

// --- SEARCH ROUTE ---
app.get('/search', async (req, res) => {
    const songQuery = req.query.query;
    res.setHeader('Content-Type', 'application/json');
    
    if (!songQuery) {
        return res.status(400).json({ error: "Please provide a 'query' parameter (e.g., /search?query=kesariya)." });
    }
    
    try {
        const dynamicId = await getFreshClientId();
        const response = await axios.get(`https://api-v2.soundcloud.com/search/tracks`, { 
            params: { q: songQuery, client_id: dynamicId, limit: 15 } 
        });

        const collection = response.data?.collection;
        if (!collection || collection.length === 0) {
            return res.status(404).json({ success: false, message: "No songs found." });
        }

        const results = collection.map(track => ({
            id: track.id,
            title: track.title,
            album: track.publisher_metadata?.album_title || "Single",
            image: track.artwork_url 
                ? track.artwork_url.replace('large', 't500x500') 
                : (track.user?.avatar_url ? track.user.avatar_url.replace('large', 't500x500') : 'https://soundcloud.com/favicon.ico'),
            artist: track.user?.username || "Unknown Artist",
            stream_url: `https://${req.get('host')}/play?id=${track.id}`
        }));

        return res.status(200).json({ success: true, count: results.length, results });

    } catch (error) { 
        return res.status(500).json({ success: false, error: "Search failed", details: error.message }); 
    }
});

// --- PLAY ROUTE ---
app.get('/play', async (req, res) => {
    const trackId = req.query.id;
    const songQuery = req.query.query;

    try {
        const dynamicId = await getFreshClientId();
        let targetTrack = null;

        if (trackId) {
            const trackResponse = await axios.get(`https://api-v2.soundcloud.com/tracks/${trackId}`, {
                params: { client_id: dynamicId }
            });
            targetTrack = trackResponse.data;
        } else if (songQuery) {
            const searchResponse = await axios.get(`https://api-v2.soundcloud.com/search/tracks`, {
                params: { q: songQuery, client_id: dynamicId, limit: 1 }
            });
            targetTrack = searchResponse.data?.collection?.[0];
        } else {
            res.setHeader('Content-Type', 'application/json');
            return res.status(400).json({ error: "Please provide either an 'id' or a 'query' parameter." });
        }

        if (!targetTrack) {
            res.setHeader('Content-Type', 'application/json');
            return res.status(404).json({ error: "Song not found." });
        }

        // Progressive MP3 stream dhoondo
        const progressiveTranscoding = targetTrack.media?.transcodings?.find(
            t => t.format.protocol === 'progressive'
        );

        if (!progressiveTranscoding || !progressiveTranscoding.url) {
            res.setHeader('Content-Type', 'application/json');
            return res.status(404).json({ error: "No direct playable stream available for this track." });
        }

        // Stream auth token fetch karo
        const streamAuthResponse = await axios.get(`${progressiveTranscoding.url}`, {
            params: { client_id: dynamicId }
        });
        
        if (streamAuthResponse.data && streamAuthResponse.data.url) {
            // Seedha working audio link par redirect kar do
            return res.redirect(streamAuthResponse.data.url);
        }

        res.setHeader('Content-Type', 'application/json');
        return res.status(404).json({ error: "Failed to authorize audio stream." });

    } catch (error) {
        res.setHeader('Content-Type', 'application/json');
        return res.status(500).json({ error: "Playback failed", details: error.message });
    }
});

module.exports = app;

