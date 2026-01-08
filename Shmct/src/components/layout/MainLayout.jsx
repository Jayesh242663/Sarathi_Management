import { useState } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import './MainLayout.css';

const MainLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="main-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} isCollapsed={sidebarCollapsed} />
      
      <div className="main-layout-content">
        <Navbar onMenuClick={() => setSidebarOpen(true)} onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)} sidebarCollapsed={sidebarCollapsed} />
        
        <main className="main-layout-main">
          {children}
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
