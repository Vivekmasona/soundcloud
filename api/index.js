const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// Function: Jo SoundCloud ke live script se fresh client_id dhoondh ke nikalega
async function getFreshClientId() {
    try {
        // 1. SoundCloud ki home page se script links nikalna
        const homeResponse = await axios.get('https://soundcloud.com', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const html = homeResponse.data;
        
        // Scripts ko dhoondhne ke liye regex
        const scriptRegex = /src="([^"]+\/assets\/[^"]+\.js)"/g;
        let match;
        const scripts = [];
        while ((match = scriptRegex.exec(html)) !== null) {
            scripts.push(match[1]);
        }

        // 2. Last script ko check karna (aamtaur par isme client_id hoti hai)
        for (let scriptUrl of scripts.reverse().slice(0, 3)) {
            const scriptResponse = await axios.get(scriptUrl);
            const idMatch = scriptResponse.data.match(/client_id\s*:\s*"([a-zA-Z0-9]{32})"/);
            if (idMatch && idMatch[1]) {
                return idMatch[1]; // Mil gayi fresh ID!
            }
        }
    } catch (e) {
        console.error("ID extraction failed, using fallback");
    }
    // Fallback ID agar extraction fail ho jaye
    return '2t9mqaC7aZrr6v6scvW6Y06Z7v0K8A1Z'; 
}

// ROUTE 1: Search Route (With Dynamic Client ID)
app.get('/search', async (req, res) => {
    const songQuery = req.query.query;
    res.setHeader('Content-Type', 'application/json');

    if (!songQuery) {
        return res.status(400).json({ error: "Please provide a 'query' parameter." });
    }

    try {
        const dynamicId = await getFreshClientId();
        
        const response = await axios.get(`https://api-v2.soundcloud.com/search/tracks`, {
            params: {
                q: songQuery,
                client_id: dynamicId,
                limit: 10
            }
        });

        const data = response.data;

        if (data && data.collection && data.collection.length > 0) {
            const results = data.collection.map(track => {
                const playUrl = `https://${req.get('host')}/play?id=${track.id}`;
                return {
                    id: track.id,
                    title: track.title,
                    album: track.publisher_metadata?.album_title || "Single",
                    image: track.artwork_url ? track.artwork_url.replace('large', 't500x500') : 'https://soundcloud.com/favicon.ico',
                    artist: track.user?.username || "Unknown Artist",
                    stream_url: playUrl
                };
            });

            return res.status(200).json({ success: true, results });
        }

        return res.status(404).json({ success: false, message: "No songs found." });

    } catch (error) {
        return res.status(500).json({ error: "Dynamic SoundCloud Search failed", details: error.message });
    }
});

// ROUTE 2: Play Route (With Dynamic Client ID)
app.get('/play', async (req, res) => {
    const trackId = req.query.id;

    if (!trackId) {
        res.setHeader('Content-Type', 'application/json');
        return res.status(400).json({ error: "Please provide a track 'id' parameter." });
    }

    try {
        const dynamicId = await getFreshClientId();

        const trackResponse = await axios.get(`https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${dynamicId}`);
        const trackData = trackResponse.data;
        
        const progressiveTranscoding = trackData.media?.transcodings?.find(
            t => t.format.protocol === 'progressive'
        );

        if (progressiveTranscoding && progressiveTranscoding.url) {
            const streamAuthResponse = await axios.get(`${progressiveTranscoding.url}?client_id=${dynamicId}`);
            
            if (streamAuthResponse.data && streamAuthResponse.data.url) {
                return res.redirect(streamAuthResponse.data.url);
            }
        }

        res.setHeader('Content-Type', 'application/json');
        return res.status(404).json({ error: "Direct audio stream link not found." });

    } catch (error) {
        res.setHeader('Content-Type', 'application/json');
        return res.status(500).json({ error: "Playback failed", details: error.message });
    }
});

module.exports = app;
