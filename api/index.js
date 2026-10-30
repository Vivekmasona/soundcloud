const express = require('express');
const cors = require('cors');
const { Client } = require('soundcloud-scraper');

const app = express();
const sc = new Client();

app.use(cors());
app.use(express.json());

// Endpoint: Search by Song Name
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  const limit = req.query.limit ? parseInt(req.query.limit) : 20;

  if (!query) {
    return res.status(400).json({
      success: false,
      error: "Query parameter 'q' is required (e.g. /api/search?q=faded&limit=10)"
    });
  }

  try {
    const searchResults = await sc.search(query, "track");

    if (!searchResults || searchResults.length === 0) {
      return res.json({ success: true, count: 0, tracks: [] });
    }

    const targetResults = (limit <= 0) ? searchResults : searchResults.slice(0, limit);

    const formattedTracks = await Promise.all(
      targetResults.map(async (track) => {
        try {
          const songInfo = await sc.getSongInfo(track.url);
          const streamUrl = await songInfo.downloadProgressive();

          return {
            id: track.id || null,
            title: songInfo.title || track.title,
            duration: Math.floor(songInfo.duration / 1000), // Seconds
            thumbnail: songInfo.thumbnail ? songInfo.thumbnail.replace('-large', '-t500x500') : null,
            cdn_url: streamUrl || null,
            artist: songInfo.author ? songInfo.author.name : null
          };
        } catch (innerErr) {
          // Individual track fail hone par null return karein taaki poora request crash na ho
          return null;
        }
      })
    );

    const validTracks = formattedTracks.filter(t => t !== null);

    res.json({
      success: true,
      count: validTracks.length,
      tracks: validTracks
    });

  } catch (err) {
    // FIX: Circular structure avoid karne ke liye sirf error message string bhej rahe hain
    const errorMessage = typeof err === 'string' ? err : (err.message || "Unknown error occurred");

    res.status(500).json({
      success: false,
      error: "Failed to search SoundCloud",
      details: errorMessage
    });
  }
});

app.get('/', (req, res) => {
  res.json({ status: "SoundCloud Search API Active" });
});

// Local testing ke liye
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;

