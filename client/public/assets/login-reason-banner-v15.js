(function () {
  "use strict";
  // Userscript login guard DISABLED (temporary).
  // Re-enable by restoring login-reason-banner-v14.js logic + kick flags.
  try {
    sessionStorage.removeItem("bm_logout_reason");
    sessionStorage.removeItem("bm_logout_message");
  } catch (e) {}
})();
