const express = require('express');
const multer = require('multer');
const ftp = require('ftp');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const axios = require('axios');

dotenv.config(); // Load environment variables from .env file

const app = express();
const upload = multer({ dest: 'uploads/' });

const ftpCredentials = {
  host: process.env.FTP_HOST || 'storage.bunnycdn.com',
  port: process.env.FTP_PORT || 21,
  user: process.env.FTP_USER || 'popcinemas',
  password: process.env.FTP_PASSWORD || 'a8e22f1e-0b52-4cde-b5d1223dd21d-47d4-4820',
};

app.use(cors());
app.use(express.json());

// Helper function to connect FTP client
function connectFtpClient() {
  const client = new ftp();
  client.connect(ftpCredentials);
  return client;
}

// Function to list files from a specific folder
function listFilesFromFolder(folder, callback) {
  const client = connectFtpClient();

  client.on('ready', () => {
    client.list(folder, (err, list) => {
      if (err) {
        console.error(`FTP list error in folder ${folder}:`, err);
        client.end();
        return callback(err, null);
      }

      const filesWithUrls = list.map((file) => ({
        name: file.name,
        size: file.size,
        url: `https://popcinemas.b-cdn.net/${folder}/${file.name}`, // Replace with your CDN URL
        downloadLink: '', // Placeholder for the time-limited URL
        // Additional metadata
        created: file.time, // Example: include file creation time
        modified: file.date, // Example: include file modification time
        permissions: file.rights, // Example: include file permissions
        type: path.extname(file.name), // Example: include file type extension
      }));

      client.end();
      callback(null, filesWithUrls);
    });
  });

  client.on('error', (err) => {
    console.error('FTP connection error:', err);
  });
}

// Function to generate a time-limited URL using Bunny.net Access Tokens API
async function generateTimeLimitedUrl(path, expiryHours) {
  try {
    const response = await axios.post(
      'https://bunnycdn.com/api/accesskeys',
      {
        Name: `TempToken_${Date.now()}`,
        Expiration: new Date(Date.now() + expiryHours * 3600 * 1000).toISOString(), 
      },
      {
        headers: {
          'Content-Type': 'application/json',
          AccessKey: process.env.BUNNY_API_KEY || '3ba7efcc-399d-455c-bb94-3f2ce72df781c66610bd-1b17-4f8e-a8f0-1de0a7427032',
        },
      }
    );

    const token = response.data.AccessKey;
    return `https://popcinemas.b-cdn.net/${path}?token=${token}`;
  } catch (error) {
    console.error('Error generating time-limited URL:', error);
    return null;
  }
}

app.get('/api/files', async (req, res) => {
  const imagesFolder = 'Images';
  const moviesFolder = 'Movies';

  const promises = [
    new Promise((resolve, reject) => {
      listFilesFromFolder(imagesFolder, async (err, files) => {
        if (err) reject(err);
        else {
          for (const file of files) {
            file.downloadLink = await generateTimeLimitedUrl(`${imagesFolder}/${file.name}`, 5); // 5 hours expiration for images
          }
          resolve({ folder: imagesFolder, files });
        }
      });
    }),
    new Promise((resolve, reject) => {
      listFilesFromFolder(moviesFolder, async (err, files) => {
        if (err) reject(err);
        else {
          // Generate time-limited URLs for movies
          for (const file of files) {
            file.downloadLink = await generateTimeLimitedUrl(`${moviesFolder}/${file.name}`, 10); // 10 hours expiration for movies
          }
          resolve({ folder: moviesFolder, files });
        }
      });
    }),
  ];

  try {
    const results = await Promise.all(promises);
    const filesData = {
      images: results.find((result) => result.folder === imagesFolder)?.files || [],
      movies: results.find((result) => result.folder === moviesFolder)?.files || [],
    };
    res.json(filesData);
  } catch (error) {
    console.error('Failed to retrieve files:', error);
    res.status(500).send('Failed to retrieve files.');
  }
});

// Retrieve a specific file from a folder with comprehensive metadata
app.get('/api/files/:folder/:fileName', async (req, res) => {
  const { folder, fileName } = req.params;

  try {
    const downloadLink = await generateTimeLimitedUrl(`${folder}/${fileName}`, 8); // Example: 8 hours expiration for specific file
    if (downloadLink) {
      const fileDetails = {
        name: fileName,
        url: `https://popcinemas.b-cdn.net/${folder}/${fileName}`, // Replace with your CDN URL
        downloadLink: downloadLink,
        // Additional metadata
        // Include other metadata as needed
      };
      res.json(fileDetails);
    } else {
      res.status(500).send('Failed to generate time-limited URL.');
    }
  } catch (error) {
    console.error('Error retrieving file:', error);
    res.status(500).send('Failed to retrieve file details.');
  }
});

// Default route to handle root URL
app.get('/', (req, res) => {
  res.send('Welcome to the Popcinemas Backend API');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
