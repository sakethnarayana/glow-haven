// middlewares/verifyAdmin.js

export const verifyAdmin = (req, res, next) => {
  try {
    // 1️⃣ Ensure req.user exists (set by your JWT verify middleware)
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User information missing",
      });
    }

    // 2️⃣ Ensure role is present and valid
    if (!req.user.role) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Role information missing",
      });
    }

    // 3️⃣ Check admin privileges
    if (req.user.role !== "admin") {
      // Optional: Log unauthorized attempts for security monitoring
      console.warn(
        `Unauthorized access attempt by user ${req.user._id || req.user.id || "unknown"}`
      );

      return res.status(403).json({
        success: false,
        message: "Access denied: Admins only",
      });
    }

    // 4️⃣ User is admin → proceed
    next();
  } catch (err) {
    console.error("Error in verifyAdmin middleware:", err.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error in verifyAdmin middleware",
    });
  }
};
