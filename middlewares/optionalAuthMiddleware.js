import jwt from "jsonwebtoken";
import config from "../config/config.js";
import { getJwtVerifyOptions } from "../utils/jwtUtils.js";

export const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];

      const decoded = jwt.verify(token, config.jwt.publicKey, getJwtVerifyOptions());

      req.user = { id: decoded.id };
    }
  } catch (error) {
    req.user = null;
  }

  next();
};

