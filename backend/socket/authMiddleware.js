// socket/authMiddleware.js
// verifies the JWT token when a client tries to connect via socket.io
// the client sends it like: io("url", { auth: { token: "xxx" } })
// if the token is valid, we attach the user info to socket.user
// if not, the connection gets rejected

import jwt from "jsonwebtoken";
import User from "../models/User.js";

const socketAuthMiddleware = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("No token provided"));
    }

    // verify the JWT — same secret as the REST authMiddleware
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // grab the user from db so we have their username etc
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return next(new Error("User not found"));
    }

    // attach user info to the socket
    // now in any handler we can do socket.user.id, socket.user.username
    socket.user = {
      id: user._id.toString(),
      username: user.username,
    };

    next(); // all good, let them connect

  } catch (error) {
    console.error("[Socket Auth]", error.message);
    next(new Error("Invalid token"));
  }
};

export default socketAuthMiddleware;
