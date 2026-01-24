const passport = require("passport");

/**
 * JWT Authentication Middleware
 * Protects private routes
 */
module.exports = passport.authenticate("jwt", {
  session: false,
});
