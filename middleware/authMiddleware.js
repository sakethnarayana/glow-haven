
import jwt from 'jsonwebtoken';

export const verifyToken = (req, res, next) => {
  try {
    // Get token from Authorization header
    const token = req.headers.authorization?.split(' ')[1]; // "Bearer <token>"

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key-change-in-production'
    );

    // Attach user info to request
    req.user = {
      _id: decoded.id,
      id: decoded.id,
      phone: decoded.phone,
      role: decoded.role,
    };

    next();
  } catch (error) {
    console.error('❌ Token Verification Error:', error.message);
    
    // Check if token expired
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token has expired. Please login again' 
      });
    }

    res.status(401).json({ 
      success: false, 
      message: 'Invalid or malformed token' 
    });
  }
};

export default verifyToken;