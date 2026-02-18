import User from '../models/User.js';
import RefreshToken from '../models/refreshTokens.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// ─── Helpers ────────────────────────────────────────────────────────────────

const generateAccessToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '15m',
  });
};

const generateRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '7d',
  });
};

const setRefreshTokenCookie = async (res, token, userId) => {
  await RefreshToken.create({
    token,
    userId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth',  
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};


// ─── Controllers ────────────────────────────────────────────────────────────

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Basic validation
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    // Check for duplicates
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      const field = existingUser.email === email ? 'Email' : 'Username';
      return res.status(409).json({ message: `${field} is already taken.` });
    }

    // Create user (password hashing handled in User model pre-save hook)
    const user = await User.create({ username, email, password });

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    await setRefreshTokenCookie(res, refreshToken, user._id);

    res.status(201).json({
      accessToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        stats: user.stats,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error during registration.' });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    await setRefreshTokenCookie(res, refreshToken, user._id);

    res.status(200).json({
      accessToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        stats: user.stats,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login.' });
  }
};

// @desc    Logout user (clear refresh token cookie)
// @route   POST /api/auth/logout
// @access  Private
const logout = async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (token) {
    await RefreshToken.deleteOne({ token });
  }

  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  res.status(200).json({ message: 'Logged out successfully.' });
};

// @desc    Refresh access token using refresh token cookie
// @route   POST /api/auth/refresh
// @access  Public (uses cookie)
const refreshToken = async (req, res) => {
  try {
  
    const token = req.cookies?.refreshToken;

    if (!token) {
      return res.status(401).json({ message: 'No refresh token provided.' });
    }
   
    let decoded;
    try{
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    }catch(error){
      console.log('JWT verification error at refresh:', error);
    }
    
    const existingToken = await RefreshToken.findOne({ token });

    if (!existingToken) {
      await RefreshToken.deleteMany({ userId: decoded.id });
      res.clearCookie('refreshToken');
      return res.status(403).json({
      message: "Refresh token reuse detected. Please login again.",
      });
    }

    await RefreshToken.deleteOne({ token });
    
    const newAccessToken = generateAccessToken(decoded.id);
    const newRefreshToken = generateRefreshToken(decoded.id);

    await setRefreshTokenCookie(res, newRefreshToken, decoded.id);

    res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    // JWT errors (expired, invalid) land here
    res.clearCookie('refreshToken');
    res.status(401).json({ message: 'Invalid or expired refresh token.' });
  }
};

// @desc    Get currently authenticated user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    // req.user is attached by authMiddleware
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.status(200).json({
      id: user._id,
      username: user.username,
      email: user.email,
      stats: user.stats,
    });
  } catch (error) {
    console.error('GetMe error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

export { register, login, logout, getMe, refreshToken };
