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

// Add custom headers BEFORE helmet to override
app.use((req, res, next) => {
  // Allow all origins for development
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Prevent mixed content blocking - ALLOW HTTP
  res.setHeader('Content-Security-Policy', "default-src 'self' http:; style-src 'self' 'unsafe-inline';");
  
  // Remove problematic headers that force HTTPS
  res.removeHeader('Strict-Transport-Security');
  res.removeHeader('Cross-Origin-Opener-Policy');
  res.removeHeader('Cross-Origin-Embedder-Policy');
  
  next();
});

// Then use helmet (it adds security headers)
app.use(helmet({
  // Disable HSTS header that forces HTTPS
  hsts: false,
  // Disable contentSecurityPolicy as we set our own
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors());

/* =========================
   Passport Initialization
========================= */
app.use(passport.initialize());
require("./config/passport")(passport);

/* =========================
   Serve Static Assets
========================= */
// Serve React build files
app.use(express.static(path.join(__dirname, "build")));

// Serve assets directory separately
app.use('/assets', express.static(path.join(__dirname, "build", "assets")));

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