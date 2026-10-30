const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Public High-Speed Music Index Endpoint
const API_BASE_URL = 'https://saavn.dev/api/search/songs';

app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  const limit = req.query.limit ? parseInt(req.query.limit) : 20;

  if (!query) {
    return res.status(400).json({
      success: false,
      error: "Query parameter 'q' is required (e.g. /api/search?q=pawan singh bhojpuri)"
    });
  }

  try {
    // Direct API call to fetch full regional Indian index
    const response = await axios.get(API_BASE_URL, {
      params: {
        query: query,
        limit: limit
      },
      timeout: 8000
    });

    if (!response.data || !response.data.success || !response.data.data.results) {
      return res.json({ success: true, count: 0, tracks: [] });
    }

    const results = response.data.data.results;

    const formattedTracks = results.map(song => {
      // 1. Direct CDN MP3 Stream URL selection (Preferring 320kbps / 160kbps)
      const downloadUrls = song.downloadUrl || [];
      const bestAudio = downloadUrls.find(u => u.quality === '320kbps') ||
                        downloadUrls.find(u => u.quality === '160kbps') ||
                        downloadUrls[downloadUrls.length - 1];

      // 2. High Quality Artwork/Thumbnail selection
      const images = song.image || [];
      const bestImage = images.find(i => i.quality === '500x500') ||
                        images[images.length - 1];

      return {
        id: song.id,
        title: song.name,
        artist: song.artists?.primary?.[0]?.name || song.album?.name || "Unknown Artist",
        duration: song.duration ? parseInt(song.duration) : 0, // Duration in seconds
        thumbnail: bestImage ? bestImage.url : null,
        cdn_url: bestAudio ? bestAudio.url : null
      };
    });

    const validTracks = formattedTracks.filter(t => t.cdn_url !== null);

    res.json({
      success: true,
      count: validTracks.length,
      tracks: validTracks
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch music tracks",
      details: err.message
    });
  }
});

app.get('/', (req, res) => {
  res.json({ status: "Regional Music API Service is running perfectly!" });
});

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
