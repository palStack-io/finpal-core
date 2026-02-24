import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, Shield, Zap, PieChart, CreditCard, Users, CheckCircle, ArrowRight, TrendingDown, Wallet } from 'lucide-react';

export const Landing = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const features = [
    {
      icon: <Shield size={32} />,
      title: 'Complete Data Control',
      description: 'Self-hosted solution means your financial data stays on your server. No third-party access, ever.'
    },
    {
      icon: <Users size={32} />,
      title: 'Flexible Expense Splitting',
      description: 'Split bills with friends, family, or roommates with powerful collaborative expense management.'
    },
    {
      icon: <CreditCard size={32} />,
      title: 'SimpleFin Integration',
      description: 'Auto-sync your accounts and transactions with SimpleFin for seamless tracking.'
    },
    {
      icon: <PieChart size={32} />,
      title: 'Track Portfolios & Investments',
      description: 'Monitor your investments with automatic stock price updates and portfolio tracking.'
    },
    {
      icon: <TrendingUp size={32} />,
      title: 'Smart Budgets',
      description: 'Set budgets for different categories and get notifications when you\'re approaching limits.'
    },
    {
      icon: <Zap size={32} />,
      title: 'Easy Unraid Deployment',
      description: 'Seamless integration with Unraid for simple installation and management via Unraid templates.'
    },
    {
      icon: <Wallet size={32} />,
      title: 'Dynamic Branding by Currency',
      description: 'finPal adapts to your currency: DollarPal, PoundPal, EuroPal, RupeePal, and more!'
    }
  ];

  return (
    <div style={{ background: 'linear-gradient(to bottom, #0f172a, #1e293b)', color: 'white', minHeight: '100vh' }}>
      {/* Navigation */}
      <nav style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: scrolled ? 'rgba(15, 23, 42, 0.95)' : 'transparent',
        backdropFilter: scrolled ? 'blur(10px)' : 'none',
        transition: 'all 0.3s ease',
        borderBottom: scrolled ? '1px solid rgba(255, 255, 255, 0.1)' : 'none'
      }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
            <img src="/finPal.png" alt="finPal" style={{ height: '40px', width: 'auto' }} />
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <Link to="/login" style={{ textDecoration: 'none' }}>
              <button
                style={{ padding: '8px 20px', background: 'transparent', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '8px', color: 'white', cursor: 'pointer', transition: 'all 0.3s' }}
                onMouseEnter={(e) => (e.target as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.1)'}
                onMouseLeave={(e) => (e.target as HTMLButtonElement).style.background = 'transparent'}
              >
                Sign In
              </button>
            </Link>
            <Link to="/register" style={{ textDecoration: 'none' }}>
              <button
                style={{ padding: '8px 20px', background: '#15803d', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: '600', transition: 'all 0.3s' }}
                onMouseEnter={(e) => (e.target as HTMLButtonElement).style.background = '#166534'}
                onMouseLeave={(e) => (e.target as HTMLButtonElement).style.background = '#15803d'}
              >
                Get Started
              </button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{ paddingTop: '120px', paddingBottom: '80px', position: 'relative', overflow: 'hidden' }}>
        {/* Money Grid Background */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(10, 1fr)',
          gap: '24px',
          opacity: 0.05,
          fontSize: '32px',
          pointerEvents: 'none'
        }}>
          {Array.from({ length: 100 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>💲</div>
          ))}
        </div>

        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'inline-block', padding: '8px 16px', background: 'rgba(21, 128, 61, 0.2)', border: '1px solid rgba(21, 128, 61, 0.3)', borderRadius: '20px', marginBottom: '24px' }}>
              <span style={{ color: '#86efac', fontSize: '14px', fontWeight: '600' }}>🤝 Part of the palStack Ecosystem</span>
            </div>

            <h1 style={{ fontSize: '56px', fontWeight: 'bold', lineHeight: 1.1, marginBottom: '24px', background: 'linear-gradient(to right, #86efac, #fbbf24, #86efac)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
              Your Money, Your Rules
            </h1>

            <p style={{ fontSize: '20px', color: '#94a3b8', lineHeight: 1.6, marginBottom: '40px' }}>
              Self-hosted financial tracking that gives you complete control. Because that's what pals do – they show up and help with the everyday stuff.
            </p>

            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => window.open('https://github.com/palStack-io/finpal-core', '_blank')}
                style={{ padding: '16px 32px', background: '#15803d', border: 'none', borderRadius: '12px', color: 'white', fontSize: '18px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.3s' }}
                onMouseEnter={(e) => {
                  (e.target as HTMLButtonElement).style.background = '#166534';
                  (e.target as HTMLButtonElement).style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLButtonElement).style.background = '#15803d';
                  (e.target as HTMLButtonElement).style.transform = 'translateY(0)';
                }}
              >
                View on GitHub <ArrowRight size={20} />
              </button>
              <Link to="/login" style={{ textDecoration: 'none' }}>
                <button
                  style={{ padding: '16px 32px', background: 'transparent', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '12px', color: 'white', fontSize: '18px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.3s' }}
                  onMouseEnter={(e) => (e.target as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.1)'}
                  onMouseLeave={(e) => (e.target as HTMLButtonElement).style.background = 'transparent'}
                >
                  View Demo
                </button>
              </Link>
            </div>

            <p style={{ marginTop: '24px', color: '#64748b', fontSize: '14px' }}>
              Open source • Self-hosted • <span style={{ color: '#fbbf24' }}>Hosted version coming soon</span> • Your data stays yours
            </p>
          </div>

          {/* Hero Image/Dashboard Preview */}
          <div style={{ marginTop: '80px', position: 'relative' }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(21, 128, 61, 0.1), rgba(59, 130, 246, 0.1))',
              borderRadius: '24px',
              padding: '8px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)'
            }}>
              <div style={{ background: 'rgba(17, 24, 39, 0.9)', borderRadius: '16px', padding: '20px', overflow: 'hidden' }}>
                {/* Mini Dashboard Preview */}
                <div style={{ background: 'linear-gradient(to bottom, #0f172a, #1e293b)', borderRadius: '12px', padding: '24px' }}>
                  {/* Top Stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                    <div style={{ background: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                        <div>
                          <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px', margin: 0 }}>Net Worth</p>
                          <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: 'white', margin: 0 }}>$15,850</h3>
                        </div>
                        <Wallet size={20} color="#22c55e" />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <TrendingUp size={12} color="#22c55e" />
                        <span style={{ color: '#22c55e', fontSize: '11px' }}>+5.2%</span>
                      </div>
                    </div>

                    <div style={{ background: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                        <div>
                          <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px', margin: 0 }}>This Month</p>
                          <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: 'white', margin: 0 }}>$3,920</h3>
                        </div>
                        <TrendingDown size={20} color="#ef4444" />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <TrendingDown size={12} color="#ef4444" />
                        <span style={{ color: '#ef4444', fontSize: '11px' }}>+12%</span>
                      </div>
                    </div>

                    <div style={{ background: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                        <div>
                          <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px', margin: 0 }}>Savings Rate</p>
                          <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: 'white', margin: 0 }}>24.6%</h3>
                        </div>
                        <PieChart size={20} color="#fbbf24" />
                      </div>
                      <span style={{ color: '#94a3b8', fontSize: '11px' }}>Great job!</span>
                    </div>
                  </div>

                  {/* Budget Progress */}
                  <div style={{ background: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '16px' }}>
                    <h4 style={{ color: 'white', fontSize: '14px', marginBottom: '16px', margin: 0 }}>Budget Progress</h4>
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ color: '#cbd5e1', fontSize: '12px' }}>Food</span>
                        <span style={{ color: '#94a3b8', fontSize: '12px' }}>$550 / $700</span>
                      </div>
                      <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: '78%', height: '100%', background: '#10b981', borderRadius: '3px' }}></div>
                      </div>
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ color: '#cbd5e1', fontSize: '12px' }}>Shopping</span>
                        <span style={{ color: '#94a3b8', fontSize: '12px' }}>$540 / $400</span>
                      </div>
                      <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: '100%', height: '100%', background: '#ef4444', borderRadius: '3px' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" style={{ padding: '100px 24px', background: 'rgba(17, 24, 39, 0.5)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '64px' }}>
            <h2 style={{ fontSize: '42px', fontWeight: 'bold', marginBottom: '16px', background: 'linear-gradient(to right, #86efac, #fbbf24)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
              Why finPal?
            </h2>
            <p style={{ fontSize: '18px', color: '#94a3b8', maxWidth: '700px', margin: '0 auto' }}>
              Born from a desire to move beyond restrictive financial tracking platforms. We give you the tools to manage your money, your way.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px' }}>
            {features.map((feature, idx) => (
              <div
                key={idx}
                style={{
                  background: 'rgba(17, 24, 39, 0.8)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '16px',
                  padding: '32px',
                  transition: 'all 0.3s',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-8px)';
                  e.currentTarget.style.borderColor = 'rgba(21, 128, 61, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                }}
              >
                <div style={{ width: '64px', height: '64px', background: 'rgba(21, 128, 61, 0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', color: '#22c55e' }}>
                  {feature.icon}
                </div>
                <h3 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '12px', color: 'white' }}>{feature.title}</h3>
                <p style={{ color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ padding: '100px 24px', background: 'rgba(17, 24, 39, 0.5)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '64px' }}>
            <h2 style={{ fontSize: '42px', fontWeight: 'bold', marginBottom: '16px', background: 'linear-gradient(to right, #86efac, #fbbf24)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
              Get Started Today
            </h2>
            <p style={{ fontSize: '18px', color: '#94a3b8' }}>
              Free and open source. Deploy on your own infrastructure.
            </p>
          </div>

          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(21, 128, 61, 0.2), rgba(17, 24, 39, 0.9))',
                backdropFilter: 'blur(8px)',
                border: '2px solid #15803d',
                borderRadius: '16px',
                padding: '40px',
                position: 'relative'
              }}
            >
              <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: '#15803d', color: 'white', padding: '4px 16px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>
                SELF-HOSTED
              </div>

              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <h3 style={{ fontSize: '32px', fontWeight: '600', marginBottom: '8px', color: 'white' }}>Open Source</h3>
                <div style={{ marginBottom: '16px' }}>
                  <span style={{ fontSize: '48px', fontWeight: 'bold', color: 'white' }}>Free</span>
                  <span style={{ color: '#94a3b8', fontSize: '16px' }}> forever</span>
                </div>
                <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>
                  Host it yourself and keep full control of your data
                </p>
              </div>

              <ul style={{ listStyle: 'none', padding: 0, marginBottom: '32px', margin: 0 }}>
                {[
                  'Unlimited accounts & transactions',
                  'Complete data ownership',
                  'SimpleFin integration',
                  'Portfolio & investment tracking',
                  'Budget tracking with notifications',
                  'Collaborative expense splitting',
                  'Unraid template support',
                  'Community support & updates'
                ].map((item, idx) => (
                  <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', color: '#cbd5e1' }}>
                    <CheckCircle size={20} color="#22c55e" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => window.open('https://github.com/palStack-io/finpal-core', '_blank')}
                style={{
                  width: '100%',
                  padding: '16px',
                  background: '#15803d',
                  border: 'none',
                  borderRadius: '12px',
                  color: 'white',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.3s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLButtonElement).style.background = '#166534';
                  (e.target as HTMLButtonElement).style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLButtonElement).style.background = '#15803d';
                  (e.target as HTMLButtonElement).style.transform = 'translateY(0)';
                }}
              >
                Get Started on GitHub <ArrowRight size={20} />
              </button>

              <p style={{ textAlign: 'center', marginTop: '16px', color: '#64748b', fontSize: '13px', margin: '16px 0 0 0' }}>
                Hosted version coming soon for those who prefer managed hosting
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section style={{ padding: '100px 24px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center', background: 'rgba(21, 128, 61, 0.1)', border: '1px solid rgba(21, 128, 61, 0.3)', borderRadius: '24px', padding: '64px 32px' }}>
          <h2 style={{ fontSize: '42px', fontWeight: 'bold', marginBottom: '16px', background: 'linear-gradient(to right, #86efac, #fbbf24)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
            Part of the palStack Ecosystem
          </h2>
          <p style={{ fontSize: '18px', color: '#94a3b8', marginBottom: '32px' }}>
            "That's what pals do – they show up and help with the everyday stuff."
          </p>
          <button
            onClick={() => window.open('https://github.com/palStack-io/finpal-core', '_blank')}
            style={{ padding: '16px 48px', background: '#15803d', border: 'none', borderRadius: '12px', color: 'white', fontSize: '18px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', transition: 'all 0.3s' }}
            onMouseEnter={(e) => {
              (e.target as HTMLButtonElement).style.background = '#166534';
              (e.target as HTMLButtonElement).style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLButtonElement).style.background = '#15803d';
              (e.target as HTMLButtonElement).style.transform = 'translateY(0)';
            }}
          >
            Star on GitHub <ArrowRight size={20} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', padding: '48px 24px', background: 'rgba(17, 24, 39, 0.8)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '24px' }}>
            <img src="/finPal.png" alt="finPal" style={{ height: '48px', width: 'auto' }} />
          </div>
          <p style={{ color: '#64748b', marginBottom: '24px', margin: '0 0 24px 0' }}>
            Open source • Self-hosted • Part of the palStack ecosystem
          </p>
          <div style={{ display: 'flex', gap: '24px', justifyContent: 'center', flexWrap: 'wrap', color: '#94a3b8', fontSize: '14px' }}>
            <a href="https://github.com/palStack-io/finpal-core" target="_blank" rel="noopener noreferrer" style={{ color: '#94a3b8', textDecoration: 'none' }}>GitHub</a>
            <a href="#" style={{ color: '#94a3b8', textDecoration: 'none' }}>Documentation</a>
            <a href="#" style={{ color: '#94a3b8', textDecoration: 'none' }}>Community</a>
            <a href="#" style={{ color: '#94a3b8', textDecoration: 'none' }}>Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
};
