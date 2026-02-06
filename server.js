const express = require("express");
const passport = require("passport");
const dotenv = require("dotenv");
const helmet = require("helmet");
const cors = require("cors");
const path = require('path');

const connectDB = require("./config/db");

// Load environment variables
dotenv.config();

// Connect Database
connectDB();

const app = express();

/* =========================
   Global Middlewares
========================= */
app.use(express.json());
app.use(helmet());
app.use(cors());

/* =========================
   Passport Initialization
========================= */
app.use(passport.initialize());
require("./config/passport")(passport);

/* =========================
   API Routes
========================= */
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/companies", require("./routes/companyRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/leads", require("./routes/leadRoutes"));
app.use("/api/calls", require("./routes/callRoutes"));

/* =========================
   Health Check
========================= */
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "LeadWave API is running 🚀",
  });
});

const PORT = process.env.PORT || 5000;

/* =========================
   Serve React Build (Static Files)
========================= */
app.use(express.static(path.join(__dirname, "build")));

/* =========================
   Catch-all for React SPA - SIMPLEST SOLUTION
========================= */
// Option 1: Single regex route (Recommended)
app.get(/^(?!\/api).*/, (req, res) => {
  console.log(`📦 Serving React for: ${req.path}`);
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

app.listen(PORT, () => {
  console.log(`🚀 LeadWave server running on port ${PORT}`);
  console.log(`📁 Serving static files from: ${path.join(__dirname, "build")}`);
});