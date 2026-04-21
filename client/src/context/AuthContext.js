import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';
import API_URL from '../config/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/auth/me`);
      setUser(response.data);
    } catch (error) {
      localStorage.removeItem('token');
      delete axios.defaults.headers.common['Authorization'];
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const response = await axios.post(`${API_URL}/api/auth/login`, { email, password });
    const { token, user, deactivated } = response.data;

    localStorage.setItem('token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    // If account is deactivated, don't set user yet - let Login page handle it
    if (deactivated) {
      const error = new Error('Account is deactivated');
      error.deactivated = true;
      error.token = token;
      error.user = user;
      throw error;
    }

    // Fetch full user data (login response only has basic fields, missing driverLicense etc.)
    const fullUser = await axios.get(`${API_URL}/api/auth/me`);
    setUser(fullUser.data);
    return fullUser.data;
  };

  const reactivateAndLogin = async (token) => {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    await axios.post(`${API_URL}/api/users/account/reactivate`);
    const response = await axios.get(`${API_URL}/api/auth/me`);
    setUser(response.data);
    return response.data;
  };

  const register = async (userData) => {
    const response = await axios.post(`${API_URL}/api/auth/register`, userData);
    const { token, user } = response.data;

    localStorage.setItem('token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    // Fetch full user data (register response only has basic fields, missing driverLicense etc.)
    const fullUser = await axios.get(`${API_URL}/api/auth/me`);
    setUser(fullUser.data);

    return fullUser.data;
  };

  // Sign in with a Google ID token (credential). If the account doesn't exist
  // yet, the server responds with { needsUserType: true } so the caller can
  // prompt for driver/host/both and call this again with userType supplied.
  const googleLogin = async (credential, userType) => {
    const response = await axios.post(`${API_URL}/api/auth/google`, { credential, userType });

    if (response.data.needsUserType) {
      return { needsUserType: true };
    }

    const { token, user, deactivated } = response.data;

    localStorage.setItem('token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    if (deactivated) {
      const error = new Error('Account is deactivated');
      error.deactivated = true;
      error.token = token;
      error.user = user;
      throw error;
    }

    const fullUser = await axios.get(`${API_URL}/api/auth/me`);
    setUser(fullUser.data);
    return fullUser.data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };

  const forgotPassword = async (email) => {
    const response = await axios.post(`${API_URL}/api/auth/forgot-password`, { email });
    return response.data;
  };

  const verifyResetToken = async (token) => {
    const response = await axios.get(`${API_URL}/api/auth/verify-reset-token/${token}`);
    return response.data;
  };

  const resetPassword = async (token, password) => {
    const response = await axios.post(`${API_URL}/api/auth/reset-password`, { token, password });
    return response.data;
  };

  const updateUserType = async (userType) => {
    const response = await axios.put(`${API_URL}/api/users/profile`, { userType });
    setUser(response.data);
    return response.data;
  };

  const refreshUser = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/auth/me`);
      setUser(response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  const value = {
    user,
    setUser,
    login,
    googleLogin,
    reactivateAndLogin,
    register,
    logout,
    forgotPassword,
    verifyResetToken,
    resetPassword,
    updateUserType,
    refreshUser,
    loading,
    isAuthenticated: !!user
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
