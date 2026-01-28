"""
Tasks module
Contains scheduled tasks and background jobs
"""

from src.tasks.scheduled_tasks import init_scheduled_tasks

__all__ = ['init_scheduled_tasks']
