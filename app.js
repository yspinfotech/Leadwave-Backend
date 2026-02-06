const express = require("express");
const passport = require("passport");
const dotenv = require("dotenv");
const helmet = require("helmet");
const cors = require("cors");
const path=require("path");
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


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: [ 'http://localhost:5173',
              'http://ec2-13-232-135-239.ap-south-1.compute.amazonaws.com',
            //   'https://ec2-13-232-135-239.ap-south-1.compute.amazonaws.com'
            ],
    credentials: true
  })
);


// Angular build file added here and  setup ther=ir routing here.
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  console.log(">>>> ",express.static(path.join(__dirname, 'public')))
  console.log("TEST baseURL 1",req.baseUrl);
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
})
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
