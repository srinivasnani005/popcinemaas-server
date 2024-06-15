// index.js

const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

// Define a simple route
app.get('/', (req, res) => {
  res.send('Hello from your Node.js server on Vercel!');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
