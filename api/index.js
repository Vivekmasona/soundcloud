const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// Function: Live client_id extract karne ke liye
async function getFreshClientId() {
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
                return idMatch[1];
            }
        }
    } catch (e) {
        console.error("ID extraction failed, using fallback");
    }
    return '2t9mqaC7aZrr6v6scvW6Y06Z7v0K8A1Z'; 
}

// MAIN PLAY ROUTE: Loop ke sath fix kiya gaya hai
app.get('/play', async (req, res) => {
    const songQuery = req.query.query;
    const trackId = req.query.id;

    try {
        const dynamicId = await getFreshClientId();
        let tracksToTry = [];

        // CASE 1: Agar query di gayi hai (jaise: /play?query=backbone)
        if (songQuery) {
            const searchResponse = await axios.get(`https://api-v2.soundcloud.com/search/tracks`, {
                params: { q: songQuery, client_id: dynamicId, limit: 10 }
            });

            const collection = searchResponse.data?.collection;
            if (collection && collection.length > 0) {
                // Pehle original (bina remix/slowed wale) tracks ko priority denge
                const originals = collection.filter(track => {
                    const title = track.title.toLowerCase();
                    return !title.includes('slowed') && !title.includes('reverb') && !title.includes('remix') && !title.includes('bootleg');
                });
                
                // Sabhi safe tracks aur bache hue tracks ko ek list me daal denge loop chalane ke liye
                tracksToTry = [...originals, ...collection.filter(t => !originals.includes(t))];
            }
        } 
        // CASE 2: Agar ID di gayi ho
        else if (trackId) {
            const trackResponse = await axios.get(`https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${dynamicId}`);
            if (trackResponse.data) tracksToTry.push(trackResponse.data);
        } 
        else {
            res.setHeader('Content-Type', 'application/json');
            return res.status(400).json({ error: "Please provide either a 'query' or an 'id' parameter." });
        }

        // LOOPING FALLBACK: Jab tak chalne layaq mp3 stream na mile, tab tak list ke gaane try karo
        for (let targetTrack of tracksToTry) {
            const progressiveTranscoding = targetTrack.media?.transcodings?.find(
                t => t.format.protocol === 'progressive'
            );

            if (progressiveTranscoding && progressiveTranscoding.url) {
                try {
                    const streamAuthResponse = await axios.get(`${progressiveTranscoding.url}?client_id=${dynamicId}`);
                    if (streamAuthResponse.data && streamAuthResponse.data.url) {
                        // Mil gaya working stream link! Direct play karo.
                        return res.redirect(streamAuthResponse.data.url);
                    }
                } catch (streamErr) {
                    // Agar ek track fail ho jaye, toh agle track par jao (crash mat karo)
                    console.log(`Failed stream for track ${targetTrack.id}, trying next...`);
                }
            }
        }

        res.setHeader('Content-Type', 'application/json');
        return res.status(404).json({ error: "No playable audio stream found for this query." });

    } catch (error) {
        res.setHeader('Content-Type', 'application/json');
        return res.status(500).json({ error: "Direct playback failed", details: error.message });
    }
});

// Search route for fallback/metadata
app.get('/search', async (req, res) => {
    const songQuery = req.query.query;
    res.setHeader('Content-Type', 'application/json');
    if (!songQuery) return res.status(400).json({ error: "Please provide a 'query' parameter." });
    try {
        const dynamicId = await getFreshClientId();
        const response = await axios.get(`https://api-v2.soundcloud.com/search/tracks`, { params: { q: songQuery, client_id: dynamicId, limit: 10 } });
        if (response.data?.collection?.length > 0) {
            const results = response.data.collection.map(track => ({
                id: track.id,
                title: track.title,
                album: track.publisher_metadata?.album_title || "Single",
                image: track.artwork_url ? track.artwork_url.replace('large', 't500x500') : 'https://soundcloud.com/favicon.ico',
                artist: track.user?.username || "Unknown Artist",
                stream_url: `https://${req.get('host')}/play?id=${track.id}`
            }));
            return res.status(200).json({ success: true, results });
        }
        return res.status(404).json({ success: false, message: "No songs found." });
    } catch (error) { return res.status(500).json({ error: "Search failed", details: error.message }); }
});

module.exports = app;
