/**
 * Layout Component
 * Main layout wrapper with header, sidebar, and content
 */

import React, { useState } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background-darker via-background-dark to-background-darker">
      {/* Money symbol background pattern */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-5">
        <div className="absolute inset-0 grid grid-cols-12 gap-8 p-8 text-6xl text-green-500">
          {Array.from({ length: 144 }).map((_, i) => (
            <div key={i} className="flex items-center justify-center animate-pulse" style={{ animationDelay: `${i * 0.1}s` }}>
              $
            </div>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="relative flex h-screen overflow-hidden">
        <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Header onMenuToggle={toggleSidebar} isSidebarOpen={isSidebarOpen} />

          <main className="flex-1 overflow-y-auto">
            <div className="container mx-auto px-4 sm:px-6 py-8 max-w-7xl">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};
