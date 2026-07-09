import React from 'react';
import { NavLink } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import PullToRefresh from '../../components/PullToRefresh';
import { useAuth } from '../../context/AuthContext';
import './Admin.css';

const AdminLayout = ({ title, subtitle, children, onRefresh }) => {
  const { user: me } = useAuth();
  return (
    <div className="admin-page">
      {onRefresh && <PullToRefresh onRefresh={onRefresh} />}
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
          {/* Commissions is visible to every admin, but the data is scoped: staff
              admins see only their OWN commission days, the owner sees everyone. */}
          <NavLink to="/admin/commissions">Commissions</NavLink>
          {/* Owner-only finance/reconciliation tools, hidden from regular admins. */}
          {me?.isSuperAdmin && <NavLink to="/admin/tax">Tax / 1099</NavLink>}
          {me?.isSuperAdmin && <NavLink to="/admin/insurance">Insurance</NavLink>}
          {me?.isSuperAdmin && <NavLink to="/admin/late-returns">Late Returns</NavLink>}
        </nav>
        {children}
      </div>
    </div>
  );
};

export default AdminLayout;
