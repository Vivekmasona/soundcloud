const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Indian Music Search Endpoint
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  const limit = req.query.limit ? parseInt(req.query.limit) : 20;

  if (!query) {
    return res.status(400).json({
      success: false,
      error: "Query parameter 'q' is required (e.g. /api/search?q=kesariya)"
    });
  }

  try {
    // Primary open API endpoint for Indian tracks
    const response = await axios.get(`https://saavn.dev/api/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`);

    if (!response.data || !response.data.success || !response.data.data.results) {
      return res.json({ success: true, count: 0, tracks: [] });
    }

    const songs = response.data.data.results;

    const formattedTracks = songs.map(song => {
      // Best quality audio stream URL select karna
      const downloadUrlObj = song.downloadUrl ? (
        song.downloadUrl.find(u => u.quality === '320kbps') ||
        song.downloadUrl.find(u => u.quality === '160kbps') ||
        song.downloadUrl[song.downloadUrl.length - 1]
      ) : null;

      // Best quality image thumbnail
      const imageObj = song.image ? (
        song.image.find(i => i.quality === '500x500') ||
        song.image[song.image.length - 1]
      ) : null;

      return {
        id: song.id,
        title: song.name,
        artist: song.artists?.primary?.[0]?.name || song.album?.name || "Unknown Artist",
        duration: song.duration ? parseInt(song.duration) : 0, // Seconds mein
        thumbnail: imageObj ? imageObj.url : null,
        cdn_url: downloadUrlObj ? downloadUrlObj.url : null
      };
    });

    res.json({
      success: true,
      count: formattedTracks.length,
      tracks: formattedTracks
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch music data",
      details: err.message || "Internal Server Error"
    });
  }
});

app.get('/', (req, res) => {
  res.json({ status: "Indian Music Search API is running fine!" });
});

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.app = app;
module.exports = app;
