require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.post('/optimize-route', (req, res) => {
  const { depot, stops } = req.body;
  res.json({ depot, stops });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
