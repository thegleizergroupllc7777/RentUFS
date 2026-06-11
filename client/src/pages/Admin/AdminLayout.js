import React from 'react';
import { NavLink } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import './Admin.css';

const AdminLayout = ({ title, subtitle, children }) => {
  return (
    <div className="admin-page">
      <Navbar />
      <div className="container">
        <div className="admin-header">
          <div>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
        </div>
        <nav className="admin-subnav">
          <NavLink to="/admin" end>Dashboard</NavLink>
          <NavLink to="/admin/bookings">Bookings</NavLink>
          <NavLink to="/admin/users">Users</NavLink>
          <NavLink to="/admin/vehicles">Vehicles</NavLink>
          <NavLink to="/admin/broadcast">Broadcast</NavLink>
        </nav>
        {children}
      </div>
    </div>
  );
};

export default AdminLayout;
