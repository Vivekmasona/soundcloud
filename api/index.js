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
    CLIENT_ID = '2t9mqaC7aZrr6v6scvW6Y06Z7v0K8A1Z'; 
    LAST_UPDATE = Date.now();
    return CLIENT_ID;
}

// --- Helper: Extract direct audio stream URL from track object ---
async function getDirectAudioUrl(track, client_id) {
    try {
        const progressiveTranscoding = track.media?.transcodings?.find(
            t => t.format.protocol === 'progressive'
        );

        if (progressiveTranscoding && progressiveTranscoding.url) {
            const streamAuthResponse = await axios.get(`${progressiveTranscoding.url}?client_id=${client_id}`);
            if (streamAuthResponse.data && streamAuthResponse.data.url) {
                return streamAuthResponse.data.url;
            }
        }
    } catch (e) {
        // Stream fetch fail
    }
    return null;
}

// MAIN PLAY ROUTE: Guaranteed working audio stream redirect
app.get('/play', async (req, res) => {
    const songQuery = req.query.query;
    const trackId = req.query.id;

    try {
        const dynamicId = await getFreshClientId();
        let tracksToTry = [];

        if (songQuery) {
            const searchResponse = await axios.get(`https://api-v2.soundcloud.com/search/tracks`, {
                params: { q: songQuery, client_id: dynamicId, limit: 15 }
            });

            const collection = searchResponse.data?.collection;
            if (collection && collection.length > 0) {
                const originals = collection.filter(track => {
                    const title = track.title.toLowerCase();
                    return !title.includes('slowed') && !title.includes('reverb') && !title.includes('remix');
                });
                tracksToTry = [...originals, ...collection.filter(t => !originals.includes(t))];
            }
        } else if (trackId) {
            const trackResponse = await axios.get(`https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${dynamicId}`);
            if (trackResponse.data) tracksToTry.push(trackResponse.data);
        } else {
            res.setHeader('Content-Type', 'application/json');
            return res.status(400).json({ error: "Please provide either a 'query' or an 'id' parameter." });
        }

        // Loop karke check karo ki kis track ka direct audio link mil raha hai
        for (let targetTrack of tracksToTry) {
            const audioUrl = await getDirectAudioUrl(targetTrack, dynamicId);
            if (audioUrl) {
                return res.redirect(audioUrl);
            }
        }

        res.setHeader('Content-Type', 'application/json');
        return res.status(404).json({ error: "No playable audio stream found for this query." });

    } catch (error) {
        res.setHeader('Content-Type', 'application/json');
        return res.status(500).json({ error: "Direct playback failed", details: error.message });
    }
});

// Search route: Sirf wahi gaane dikhayega jinka audio stream available hoga
app.get('/search', async (req, res) => {
    const songQuery = req.query.query;
    res.setHeader('Content-Type', 'application/json');
    if (!songQuery) return res.status(400).json({ error: "Please provide a 'query' parameter." });
    
    try {
        const dynamicId = await getFreshClientId();
        const response = await axios.get(`https://api-v2.soundcloud.com/search/tracks`, { 
            params: { q: songQuery, client_id: dynamicId, limit: 15 } 
        });

        const collection = response.data?.collection;
        if (!collection || collection.length === 0) {
            return res.status(404).json({ success: false, message: "No songs found." });
        }

        const validResults = [];
        for (const track of collection) {
            // Check karo ki audio stream mil sakta hai ya nahi
            const audioUrl = await getDirectAudioUrl(track, dynamicId);
            if (audioUrl) {
                validResults.push({
                    id: track.id,
                    title: track.title,
                    album: track.publisher_metadata?.album_title || "Single",
                    image: track.artwork_url 
                        ? track.artwork_url.replace('large', 't500x500') 
                        : (track.user?.avatar_url ? track.user.avatar_url.replace('large', 't500x500') : 'https://soundcloud.com/favicon.ico'),
                    artist: track.user?.username || "Unknown Artist",
                    stream_url: `https://${req.get('host')}/play?id=${track.id}`
                });
            }
            // Agar 5 valid gaane mil gaye toh loop rok do taaki fast response mile
            if (validResults.length >= 8) break;
        }

        if (validResults.length === 0) {
            return res.status(404).json({ success: false, message: "No playable audio streams found." });
        }

        return res.status(200).json({ success: true, count: validResults.length, results: validResults });

    } catch (error) { 
        return res.status(500).json({ error: "Search failed", details: error.message }); 
    }
});

module.exports = app;

