const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// Main Search & Direct CDN Endpoint
app.get('/search', async (req, res) => {
    const songQuery = req.query.query;
    res.setHeader('Content-Type', 'application/json');
    
    if (!songQuery) {
        return res.status(400).json({ error: "Please provide a 'query' parameter (e.g., /search?query=kesariya)." });
    }
    
    try {
        // Direct public Indian & Global music index jisse permanent mp3 cdn url milta hai
        const response = await axios.get(`https://saavn.dev/api/search/songs`, { 
            params: { query: songQuery, limit: 15 },
            timeout: 8000
        });

        const resultsData = response.data?.data?.results;
        if (!resultsData || resultsData.length === 0) {
            return res.status(404).json({ success: false, message: "No songs found." });
        }

        const results = resultsData.map(song => {
            // Sabse best 320kbps ya 160kbps direct permanent mp3 cdn link dhoondo
            const downloadUrls = song.downloadUrl || [];
            const bestAudio = downloadUrls.find(u => u.quality === '320kbps') ||
                              downloadUrls.find(u => u.quality === '160kbps') ||
                              downloadUrls[downloadUrls.length - 1];

            // Artwork/Thumbnail
            const images = song.image || [];
            const bestImage = images.find(i => i.quality === '500x500') || images[images.length - 1];

            return {
                id: song.id,
                title: song.name,
                album: song.album?.name || "Single",
                image: bestImage ? bestImage.url : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500',
                artist: song.artists?.primary?.[0]?.name || "Unknown Artist",
                duration: song.duration ? parseInt(song.duration) : 0,
                cdn_url: bestAudio ? bestAudio.url : null // Yeh raha seedha direct permanent MP3 CDN link!
            };
        });

        // Sirf wahi gaane rakho jinka cdn_url available ho
        const validResults = results.filter(r => r.cdn_url !== null);

        return res.status(200).json({ 
            success: true, 
            count: validResults.length, 
            results: validResults 
        });

    } catch (error) { 
        return res.status(500).json({ success: false, error: "Search failed", details: error.message }); 
    }
});

// Play route jo seedha direct cdn url par redirect kar dega
app.get('/play', async (req, res) => {
    const songQuery = req.query.query;
    try {
        if (!songQuery) return res.status(400).json({ error: "Please provide a 'query' parameter." });
        
        const response = await axios.get(`https://saavn.dev/api/search/songs`, { 
            params: { query: songQuery, limit: 1 } 
        });
        
        const song = response.data?.data?.results?.[0];
        if (!song) return res.status(404).json({ error: "Song not found" });

        const downloadUrls = song.downloadUrl || [];
        const bestAudio = downloadUrls.find(u => u.quality === '320kbps') || downloadUrls[downloadUrls.length - 1];

        if (bestAudio && bestAudio.url) {
            return res.redirect(bestAudio.url); // Direct permanent mp3 link redirection
        }

        res.status(404).json({ error: "Direct CDN URL not available for this song." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = app;

