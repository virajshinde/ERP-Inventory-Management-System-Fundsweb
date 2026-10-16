
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Factory, LogOut } from 'lucide-react';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <Factory size={28} />
          <div>
            <h2>Manufacturing ERP</h2>
            <p>Operations workspace</p>
          </div>
        </div>

        <button className="logout-button" onClick={handleLogout}>
          <LogOut size={17} />
          Logout
        </button>
      </header>

      <main className="dashboard-content">
        <p className="eyebrow">OVERVIEW</p>
        <h1>Welcome, {user?.name || 'User'}</h1>
        <p className="dashboard-description">
          Your manufacturing operations workspace is ready.
        </p>

        <section className="welcome-panel">
          <div className="welcome-icon">
            <Factory size={28} />
          </div>
          <h2>You're signed in</h2>
          <p>
            Your authentication is connected to the Manufacturing ERP backend.
            We'll add live customer, enquiry, quotation, order, inventory, and
            dispatch data next.
          </p>

          <div className="user-details">
            <div>
              <span>Name</span>
              <strong>{user?.name}</strong>
            </div>
            <div>
              <span>Email</span>
              <strong>{user?.email}</strong>
            </div>
            <div>
              <span>Role</span>
              <strong>{user?.role}</strong>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
