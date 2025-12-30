import { useState } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import './MainLayout.css';

const MainLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="main-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="main-layout-content">
        <Navbar onMenuClick={() => setSidebarOpen(true)} />
        
        <main className="main-layout-main">
          {children}
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
