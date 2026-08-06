import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import AdminPanel from './pages/AdminPanel';
import BillingPanel from './pages/BillingPanel';
import { useAuthStore } from './store/authStore';

const App = () => {
  const { isAuthenticated, user } = useAuthStore();

  return (
    <Router>
      <Routes>
        <Route path="/" element={!isAuthenticated ? <Login /> : <Navigate to={user?.role === 'admin' ? '/admin' : '/billing'} />} />
        
        <Route 
          path="/admin" 
          element={isAuthenticated && user?.role === 'admin' ? <AdminPanel /> : <Navigate to="/" />} 
        />
        
        <Route 
          path="/billing" 
          element={isAuthenticated ? <BillingPanel /> : <Navigate to="/" />} 
        />
        
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
};

export default App;
