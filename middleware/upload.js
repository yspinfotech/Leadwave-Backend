const multer = require("multer");
const path = require("path");
const fs = require("fs");

/* =====================
   Ensure uploads folder
===================== */
const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

/* =====================
   Storage config
===================== */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueName + path.extname(file.originalname));
  },
});

/* =====================
   File filter
===================== */
const fileFilter = (req, file, cb) => {
  const allowedTypes = [".csv", ".xlsx", ".xls"];
  const ext = path.extname(file.originalname).toLowerCase();

  if (!allowedTypes.includes(ext)) {
    cb(new Error("Only CSV and XLSX files are allowed"), false);
  } else {
    cb(null, true);
  }
};

/* =====================
   Multer instance
===================== */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
});

module.exports = upload;
