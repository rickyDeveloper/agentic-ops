"""Initial schema for ACIP Dashboard

Revision ID: 001
Revises: 
Create Date: 2024-01-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create case_status enum
    case_status = postgresql.ENUM(
        'pending', 'processing', 'ai_review', 'awaiting_human',
        'approved', 'rejected', 'escalated', 'docs_requested', 'verified',
        name='casestatus'
    )
    case_status.create(op.get_bind())
    
    # Create risk_level enum
    risk_level = postgresql.ENUM(
        'low', 'medium', 'high', 'unknown',
        name='risklevel'
    )
    risk_level.create(op.get_bind())
    
    # Create action_type enum
    action_type = postgresql.ENUM(
        'approve', 'reject', 'escalate', 'request_docs',
        'manual_override', 'add_note', 'assign', 'resume',
        name='actiontype'
    )
    action_type.create(op.get_bind())
    
    # Create acip_cases table
    op.create_table(
        'acip_cases',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('customer_name', sa.String(255), nullable=False),
        sa.Column('customer_email', sa.String(255), nullable=True),
        sa.Column('customer_phone', sa.String(50), nullable=True),
        sa.Column('document_path', sa.String(500), nullable=False),
        sa.Column('document_type', sa.String(100), nullable=True),
        sa.Column('status', sa.Enum('pending', 'processing', 'ai_review', 'awaiting_human',
                                    'approved', 'rejected', 'escalated', 'docs_requested', 'verified',
                                    name='casestatus'), 
                  nullable=False, default='pending'),
        sa.Column('risk_level', sa.Enum('low', 'medium', 'high', 'unknown', name='risklevel'),
                  nullable=False, default='unknown'),
        sa.Column('extracted_data', postgresql.JSON, nullable=True),
        sa.Column('verification_result', postgresql.JSON, nullable=True),
        sa.Column('ai_confidence_score', sa.String(10), nullable=True),
        sa.Column('assigned_to', sa.String(255), nullable=True),
        sa.Column('escalated_to', sa.String(255), nullable=True),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('rejection_reason', sa.Text, nullable=True),
        sa.Column('langgraph_thread_id', sa.String(100), nullable=True),
        sa.Column('langgraph_checkpoint_id', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=True, onupdate=sa.func.now()),
        sa.Column('deadline_at', sa.DateTime, nullable=True),
        sa.Column('completed_at', sa.DateTime, nullable=True),
    )
    op.create_index('ix_acip_cases_status', 'acip_cases', ['status'])
    op.create_index('ix_acip_cases_langgraph_thread_id', 'acip_cases', ['langgraph_thread_id'])
    
    # Create case_actions table
    op.create_table(
        'case_actions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('case_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('acip_cases.id', ondelete='CASCADE'), nullable=False),
        sa.Column('action_type', sa.Enum('approve', 'reject', 'escalate', 'request_docs',
                                         'manual_override', 'add_note', 'assign', 'resume',
                                         name='actiontype'), nullable=False),
        sa.Column('performed_by', sa.String(255), nullable=False),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('previous_status', sa.String(50), nullable=True),
        sa.Column('new_status', sa.String(50), nullable=True),
        sa.Column('escalated_to', sa.String(255), nullable=True),
        sa.Column('requested_documents', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_case_actions_case_id', 'case_actions', ['case_id'])
    
    # Create audit_logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('case_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('acip_cases.id', ondelete='CASCADE'), nullable=False),
        sa.Column('step_name', sa.String(255), nullable=False),
        sa.Column('step_number', sa.String(10), nullable=True),
        sa.Column('details', sa.Text, nullable=True),
        sa.Column('extracted_data', postgresql.JSON, nullable=True),
        sa.Column('verification_result', postgresql.JSON, nullable=True),
        sa.Column('langgraph_node', sa.String(100), nullable=True),
        sa.Column('langgraph_state', postgresql.JSON, nullable=True),
        sa.Column('screenshot_path', sa.String(500), nullable=True),
        sa.Column('document_path', sa.String(500), nullable=True),
        sa.Column('performed_by', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_audit_logs_case_id', 'audit_logs', ['case_id'])


def downgrade() -> None:
    op.drop_table('audit_logs')
    op.drop_table('case_actions')
    op.drop_table('acip_cases')
    
    op.execute('DROP TYPE actiontype')
    op.execute('DROP TYPE risklevel')
    op.execute('DROP TYPE casestatus')
