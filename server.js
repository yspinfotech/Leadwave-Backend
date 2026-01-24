const app = require("./app.js");

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 LeadWave server running on port ${PORT}`);
});
