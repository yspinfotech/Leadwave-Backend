const express = require("express");
const passport = require("passport");
const dotenv = require("dotenv");
const helmet = require("helmet");
const cors = require("cors");

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
   Routes
========================= */
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/companies", require("./routes/companyRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/leads", require("./routes/leadRoutes"));
app.use("/api/calls", require("./routes/callRoutes"));

/* =========================
   Health Check
========================= */
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "LeadWave API is running 🚀",
  });
});

module.exports = app;
