"""Demo session timeout management"""
from datetime import datetime, timedelta
from flask import request
from flask_login import current_user
import threading


class DemoTimeout:
    """
    Middleware to manage demo user session tracking and limits.
    Demo timeout enforcement for the React frontend is handled via JWT expiry.
    """
    _active_demo_sessions = {}
    _session_lock = threading.Lock()

    def __init__(self, app=None, timeout_minutes=10, demo_users=None, max_concurrent_sessions=5):
        self.timeout_minutes = timeout_minutes
        self.demo_users = demo_users or [
            'demo@example.com',
            'demo1@example.com',
            'demo2@example.com'
        ]
        self.max_concurrent_sessions = max_concurrent_sessions

        if app is not None:
            self.init_app(app)

    def init_app(self, app):
        """Initialize with Flask application"""
        app.config.setdefault('DEMO_TIMEOUT_MINUTES', self.timeout_minutes)
        app.config.setdefault('DEMO_USERS', self.demo_users)
        app.config.setdefault('MAX_CONCURRENT_DEMO_SESSIONS', self.max_concurrent_sessions)
        app.extensions['demo_timeout'] = self

    def register_demo_session(self, user_id):
        """Register a new demo session, return True if successful"""
        with self._session_lock:
            current_time = datetime.utcnow()

            # Remove expired sessions
            self._active_demo_sessions = {
                uid: session_data for uid, session_data in self._active_demo_sessions.items()
                if current_time < datetime.fromtimestamp(session_data['start_time']) + timedelta(minutes=self.timeout_minutes)
            }

            # Check current session count
            if len(self._active_demo_sessions) >= self.max_concurrent_sessions:
                return False

            # Register new session
            self._active_demo_sessions[user_id] = {
                'start_time': datetime.utcnow().timestamp(),
                'ip_address': request.remote_addr
            }
            return True

    def unregister_demo_session(self, user_id):
        """Unregister a demo session"""
        with self._session_lock:
            if user_id in self._active_demo_sessions:
                del self._active_demo_sessions[user_id]

    def get_active_demo_sessions(self):
        """Get the number of currently active demo sessions"""
        with self._session_lock:
            current_time = datetime.utcnow()
            self._active_demo_sessions = {
                uid: session_data for uid, session_data in self._active_demo_sessions.items()
                if current_time < datetime.fromtimestamp(session_data['start_time']) + timedelta(minutes=self.timeout_minutes)
            }
            return len(self._active_demo_sessions)

    def is_demo_user(self, user_id):
        """Check if the current user is a demo user"""
        if not user_id:
            return False

        return (user_id in self.demo_users or
                user_id in ['demo@example.com', 'demo1@example.com', 'demo2@example.com'] or
                user_id.endswith('@demo.com') or
                'demo' in user_id.lower())

    def get_remaining_time(self, start_timestamp):
        """Get the remaining time for a demo session in seconds"""
        if not start_timestamp:
            return self.timeout_minutes * 60

        start_time = datetime.fromtimestamp(start_timestamp)
        end_time = start_time + timedelta(minutes=self.timeout_minutes)
        remaining = (end_time - datetime.utcnow()).total_seconds()

        return max(0, int(remaining))
