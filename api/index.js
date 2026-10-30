const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

let CLIENT_ID = null;
let LAST_UPDATE = 0;

// --- Helper: Get Client ID ---
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
    // Reliable static fallback client_id
    CLIENT_ID = '2t9mqaC7aZrr6v6scvW6Y06Z7v0K8A1Z'; 
    LAST_UPDATE = Date.now();
    return CLIENT_ID;
}

// MAIN PLAY ROUTE: Fast and robust stream resolver with fallback loop
app.get('/play', async (req, res) => {
    const songQuery = req.query.query;
    const trackId = req.query.id;

    try {
        const dynamicId = await getFreshClientId();
        let tracksToTry = [];

        if (songQuery) {
            const searchResponse = await axios.get(`https://api-v2.soundcloud.com/search/tracks`, {
                params: { q: songQuery, client_id: dynamicId, limit: 10 }
            });
            const collection = searchResponse.data?.collection;
            if (collection && collection.length > 0) {
                tracksToTry = collection;
            }
        } else if (trackId) {
            const trackResponse = await axios.get(`https://api-v2.soundcloud.com/tracks/${trackId}`, {
                params: { client_id: dynamicId }
            });
            if (trackResponse.data) tracksToTry.push(trackResponse.data);
        } else {
            res.setHeader('Content-Type', 'application/json');
            return res.status(400).json({ error: "Please provide either a 'query' or an 'id' parameter." });
        }

        if (tracksToTry.length === 0) {
            res.setHeader('Content-Type', 'application/json');
            return res.status(404).json({ error: "No tracks found for this query." });
        }

        // Loop through tracks to find a working progressive audio stream
        for (let targetTrack of tracksToTry) {
            try {
                const progressiveTranscoding = targetTrack.media?.transcodings?.find(
                    t => t.format.protocol === 'progressive'
                );

                if (progressiveTranscoding && progressiveTranscoding.url) {
                    const streamAuthResponse = await axios.get(`${progressiveTranscoding.url}`, {
                        params: { client_id: dynamicId }
                    });
                    
                    if (streamAuthResponse.data && streamAuthResponse.data.url) {
                        return res.redirect(streamAuthResponse.data.url);
                    }
                }
            } catch (innerErr) {
                // Continue to the next track if one fails
                continue;
            }
        }

        res.setHeader('Content-Type', 'application/json');
        return res.status(404).json({ error: "No playable audio stream found." });

    } catch (error) {
        res.setHeader('Content-Type', 'application/json');
        return res.status(500).json({ error: "Playback failed", details: error.message });
    }
});

// Search route: Fast metadata listing without blocking stream checks
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

module.exports = app;
