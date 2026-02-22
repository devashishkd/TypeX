import User from '../models/User.js';
import bcrypt from 'bcryptjs';

// ─── Get My Profile ─────────────────────────────────────────────────────────
// basically just grabs the logged-in user's info from the db
// we already have req.user.id from the auth middleware so ez

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // send back only the stuff the frontend needs
    return res.status(200).json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        stats: user.stats,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('[getProfile]', error);
    res.status(500).json({ message: 'Server error while fetching profile.' });
  }
};

// ─── Update My Profile ─────────────────────────────────────────────────────
// lets the user change their username or email
// we gotta check if the new username/email is already taken tho

export const updateProfile = async (req, res) => {
  try {
    const { username, email } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // if they wanna change username, make sure nobody else has it
    if (username && username !== user.username) {
      const usernameExists = await User.findOne({ username });
      if (usernameExists) {
        return res.status(409).json({ message: 'Username is already taken.' });
      }
      user.username = username.trim();
    }

    // same thing for email
    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email: email.toLowerCase() });
      if (emailExists) {
        return res.status(409).json({ message: 'Email is already in use.' });
      }
      user.email = email.toLowerCase().trim();
    }

    await user.save();

    return res.status(200).json({
      message: 'Profile updated successfully.',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        stats: user.stats,
      },
    });
  } catch (error) {
    console.error('[updateProfile]', error);
    res.status(500).json({ message: 'Server error while updating profile.' });
  }
};

// ─── Change Password ────────────────────────────────────────────────────────
// user sends their old password + new password
// we check if old one matches, then update it
// the pre-save hook in User model auto-hashes it so we dont have to worry

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Both currentPassword and newPassword are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters.' });
    }

    // password has select: false in the model, so we need to explicitly ask for it
    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // compare old password with the hashed one in db
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }

    // just set it, the pre-save hook will hash it for us
    user.password = newPassword;
    await user.save();

    return res.status(200).json({ message: 'Password changed successfully.' });
  } catch (error) {
    console.error('[changePassword]', error);
    res.status(500).json({ message: 'Server error while changing password.' });
  }
};

// ─── Get Any User's Profile ─────────────────────────────────────────────────
// this is the public version — anyone can look up someone else's profile
// but we only send username + stats, not email or anything private

export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('username stats createdAt');

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(200).json({ user });
  } catch (error) {
    console.error('[getUserById]', error);
    res.status(500).json({ message: 'Server error while fetching user.' });
  }
};
