/**
 * Sidebar Component
 * Collapsible sidebar with navigation
 */

import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Target,
  Settings,
  TrendingUp,
  Users,
  LineChart,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
}

interface NavItem {
  name: string;
  path: string;
  icon: React.ReactNode;
}

const baseNavItems: NavItem[] = [
  {
    name: 'Dashboard',
    path: '/dashboard',
    icon: <LayoutDashboard className="h-5 w-5" />,
  },
  {
    name: 'Transactions',
    path: '/transactions',
    icon: <ArrowLeftRight className="h-5 w-5" />,
  },
  {
    name: 'Accounts',
    path: '/accounts',
    icon: <Wallet className="h-5 w-5" />,
  },
  {
    name: 'Budgets',
    path: '/budgets',
    icon: <Target className="h-5 w-5" />,
  },
  {
    name: 'Groups',
    path: '/groups',
    icon: <Users className="h-5 w-5" />,
  },
  {
    name: 'Analytics',
    path: '/analytics',
    icon: <TrendingUp className="h-5 w-5" />,
  },
  {
    name: 'Investments',
    path: '/investments',
    icon: <LineChart className="h-5 w-5" />,
  },
  {
    name: 'Settings',
    path: '/settings',
    icon: <Settings className="h-5 w-5" />,
  },
];

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onClose}
        ></div>
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky top-0 left-0 z-40
          h-screen w-64
          bg-background-dark/80 backdrop-blur-lg
          border-r border-gray-800
          transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex flex-col h-full pt-20 lg:pt-4">
          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
            {baseNavItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => onClose?.()}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-primary to-primary-dark text-white shadow-lg'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`
                }
              >
                {item.icon}
                <span className="font-medium">{item.name}</span>
              </NavLink>
            ))}
          </nav>

          {/* Footer - Branding */}
          <div className="p-4 border-t border-gray-800">
            <div className="flex flex-col items-center gap-2 py-3">
              <img
                src="/palStack.png"
                alt="palStack"
                className="h-6 w-auto opacity-70"
              />
              <p className="text-xs text-gray-500 text-center">
                Part of the palStack ecosystem
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
