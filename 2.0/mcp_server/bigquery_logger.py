#!/usr/bin/env python
import os
import json
import logging
import datetime
import uuid
from typing import Dict, Any, Optional, List, Union

from google.cloud import bigquery
from google.api_core.exceptions import GoogleAPIError, Forbidden, NotFound

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s [%(name)s] - %(message)s",
)

logger = logging.getLogger(__name__)

class BigQueryLogger:
    """Handles logging data to BigQuery using Application Default Credentials."""
    
    def __init__(self, project_id: str, dataset_id: str, create_dataset: bool = False):
        """Initialize the BigQuery Logger with ADC.
        
        Args:
            project_id: Google Cloud project ID
            dataset_id: BigQuery dataset ID
            create_dataset: Whether to attempt creating the dataset if it doesn't exist
        """
        self.project_id = project_id
        self.dataset_id = dataset_id
        self.client = None
        self.initialized = False
        self.read_only = False
        
        # Table names
        self.system_logs_table = "system_logs"
        self.user_logs_table = "users"
        self.conversation_logs_table = "conversations"
        self.message_logs_table = "messages"
        self.tool_logs_table = "tool_executions"
        
        # Initialize BigQuery client using Application Default Credentials
        try:
            # Use ADC - no explicit service account needed
            self.client = bigquery.Client(project=project_id)
            logger.info(f"Connected to BigQuery project: {project_id}")
                
            # Check if dataset exists
            dataset_exists = self._check_dataset_exists()
            
            if not dataset_exists and create_dataset:
                # Try to create dataset
                try:
                    self._create_dataset()
                except Forbidden as e:
                    logger.warning(f"No permission to create dataset: {e}")
                    self.read_only = True
            
            if dataset_exists or create_dataset:
                # Try to ensure tables exist
                try:
                    self._ensure_tables_exist()
                except Forbidden as e:
                    logger.warning(f"No permission to create tables: {e}")
                    self.read_only = True
            
            self.initialized = True
            if self.read_only:
                logger.info(f"BigQuery Logger initialized in READ-ONLY mode for project {project_id}, dataset {dataset_id}")
            else:
                logger.info(f"BigQuery Logger initialized for project {project_id}, dataset {dataset_id}")
            
        except Exception as e:
            logger.error(f"Failed to initialize BigQuery Logger: {e}")
            self.client = None
    
    def _check_dataset_exists(self) -> bool:
        """Check if dataset exists.
        
        Returns:
            True if dataset exists, False otherwise
        """
        try:
            dataset_ref = self.client.dataset(self.dataset_id)
            self.client.get_dataset(dataset_ref)
            logger.info(f"Dataset {self.dataset_id} exists")
            return True
        except NotFound:
            logger.info(f"Dataset {self.dataset_id} does not exist")
            return False
        except Exception as e:
            logger.error(f"Error checking if dataset exists: {e}")
            return False
    
    def _create_dataset(self) -> None:
        """Create dataset if it doesn't exist."""
        try:
            dataset_ref = self.client.dataset(self.dataset_id)
            dataset = bigquery.Dataset(dataset_ref)
            dataset.location = "US"  # Specify location
            dataset = self.client.create_dataset(dataset)
            logger.info(f"Created dataset {self.dataset_id}")
        except Exception as e:
            logger.error(f"Error creating dataset: {e}")
            raise
    
    def _ensure_tables_exist(self) -> None:
        """Ensure all required tables exist, create if not."""
        try:
            # System logs table
            system_logs_schema = [
                bigquery.SchemaField("timestamp", "TIMESTAMP", mode="REQUIRED"),
                bigquery.SchemaField("level", "STRING", mode="REQUIRED"),
                bigquery.SchemaField("component", "STRING", mode="REQUIRED"),
                bigquery.SchemaField("message", "STRING", mode="REQUIRED"),
                bigquery.SchemaField("session_id", "STRING", mode="NULLABLE"),
                bigquery.SchemaField("details", "JSON", mode="NULLABLE"),
            ]
            self._ensure_table_exists(self.system_logs_table, system_logs_schema)
            
            # Users table
            users_schema = [
                bigquery.SchemaField("user_id", "STRING", mode="REQUIRED"),
                bigquery.SchemaField("username", "STRING", mode="REQUIRED"),
                bigquery.SchemaField("email", "STRING", mode="NULLABLE"),
                bigquery.SchemaField("first_login", "TIMESTAMP", mode="REQUIRED"),
                bigquery.SchemaField("last_login", "TIMESTAMP", mode="REQUIRED"),
                bigquery.SchemaField("session_count", "INTEGER", mode="REQUIRED"),
                bigquery.SchemaField("user_agent", "STRING", mode="NULLABLE"),
                bigquery.SchemaField("ip_address", "STRING", mode="NULLABLE"),
                bigquery.SchemaField("metadata", "JSON", mode="NULLABLE"),
            ]
            self._ensure_table_exists(self.user_logs_table, users_schema)
            
            # Conversations table
            conversations_schema = [
                bigquery.SchemaField("conversation_id", "STRING", mode="REQUIRED"),
                bigquery.SchemaField("user_id", "STRING", mode="REQUIRED"),
                bigquery.SchemaField("title", "STRING", mode="NULLABLE"),
                bigquery.SchemaField("created_at", "TIMESTAMP", mode="REQUIRED"),
                bigquery.SchemaField("updated_at", "TIMESTAMP", mode="REQUIRED"),
                bigquery.SchemaField("message_count", "INTEGER", mode="REQUIRED"),
                bigquery.SchemaField("status", "STRING", mode="NULLABLE"),
                bigquery.SchemaField("metadata", "JSON", mode="NULLABLE"),
            ]
            self._ensure_table_exists(self.conversation_logs_table, conversations_schema)
            
            # Messages table
            messages_schema = [
                bigquery.SchemaField("message_id", "STRING", mode="REQUIRED"),
                bigquery.SchemaField("conversation_id", "STRING", mode="REQUIRED"),
                bigquery.SchemaField("timestamp", "TIMESTAMP", mode="REQUIRED"),
                bigquery.SchemaField("role", "STRING", mode="REQUIRED"),
                bigquery.SchemaField("content_text", "STRING", mode="NULLABLE"),
                bigquery.SchemaField("content_json", "JSON", mode="NULLABLE"),
                bigquery.SchemaField("token_count", "INTEGER", mode="NULLABLE"),
                bigquery.SchemaField("duration_ms", "INTEGER", mode="NULLABLE"),
                bigquery.SchemaField("metadata", "JSON", mode="NULLABLE"),
            ]
            self._ensure_table_exists(self.message_logs_table, messages_schema)
            
            # Tool executions table
            tool_schema = [
                bigquery.SchemaField("tool_id", "STRING", mode="REQUIRED"),
                bigquery.SchemaField("session_id", "STRING", mode="REQUIRED"),
                bigquery.SchemaField("conversation_id", "STRING", mode="NULLABLE"),
                bigquery.SchemaField("timestamp", "TIMESTAMP", mode="REQUIRED"),
                bigquery.SchemaField("tool_name", "STRING", mode="REQUIRED"),
                bigquery.SchemaField("arguments", "JSON", mode="NULLABLE"),
                bigquery.SchemaField("execution_time_ms", "INTEGER", mode="NULLABLE"),
                bigquery.SchemaField("success", "BOOLEAN", mode="REQUIRED"),
                bigquery.SchemaField("error_message", "STRING", mode="NULLABLE"),
                bigquery.SchemaField("result", "JSON", mode="NULLABLE"),
            ]
            self._ensure_table_exists(self.tool_logs_table, tool_schema)
            
        except Exception as e:
            logger.error(f"Error ensuring tables exist: {e}")
            raise
    
    def _ensure_table_exists(self, table_name: str, schema: List[bigquery.SchemaField]) -> None:
        """Ensure a specific table exists, create if not.
        
        Args:
            table_name: Name of the table
            schema: Schema definition for the table
        """
        try:
            table_ref = self.client.dataset(self.dataset_id).table(table_name)
            try:
                self.client.get_table(table_ref)
                logger.debug(f"Table {table_name} already exists")
            except NotFound:
                # Table doesn't exist, create it
                table = bigquery.Table(table_ref, schema=schema)
                self.client.create_table(table)
                logger.info(f"Created table {table_name}")
        except Exception as e:
            logger.error(f"Error ensuring table {table_name} exists: {e}")
            raise
    
    def log_system_event(
        self, 
        level: str, 
        component: str, 
        message: str, 
        session_id: Optional[str] = None, 
        details: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Log a system event to BigQuery.
        
        Args:
            level: Log level (INFO, WARNING, ERROR, etc.)
            component: Component name
            message: Log message
            session_id: Optional session ID
            details: Optional additional details as dict
            
        Returns:
            True if successful, False otherwise
        """
        if not self.initialized or not self.client or self.read_only:
            logger.debug(f"BigQuery Logger not writing - initialized={self.initialized}, read_only={self.read_only}")
            return False
        
        try:
            # Convert details to JSON string if provided
            details_json = None
            if details:
                details_json = json.dumps(details)
            
            # Prepare row data
            row = {
                "timestamp": datetime.datetime.now().isoformat(),
                "level": level,
                "component": component,
                "message": message,
                "session_id": session_id,
                "details": details_json
            }
            
            # Insert row
            table_ref = self.client.dataset(self.dataset_id).table(self.system_logs_table)
            errors = self.client.insert_rows_json(table_ref, [row])
            
            if errors:
                logger.error(f"Errors inserting system log: {errors}")
                return False
                
            return True
            
        except Exception as e:
            logger.error(f"Error logging system event: {e}")
            return False
    
    def log_user_activity(
        self,
        user_id: str,
        username: str,
        is_new_user: bool = False,
        email: Optional[str] = None,
        user_agent: Optional[str] = None,
        ip_address: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Log user login or activity to BigQuery.
        
        Args:
            user_id: User ID
            username: Username
            is_new_user: Whether this is a new user
            email: Optional email
            user_agent: Optional user agent string
            ip_address: Optional IP address
            metadata: Optional additional metadata
            
        Returns:
            True if successful, False otherwise
        """
        if not self.initialized or not self.client:
            logger.warning("BigQuery Logger not initialized, skipping user log")
            return False
        
        try:
            current_time = datetime.datetime.now().isoformat()
            
            # Convert metadata to JSON string if provided
            metadata_json = None
            if metadata:
                metadata_json = json.dumps(metadata)
            
            # Check if user already exists
            query = f"""
            SELECT user_id, session_count, first_login
            FROM `{self.project_id}.{self.dataset_id}.{self.user_logs_table}`
            WHERE user_id = @user_id
            """
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("user_id", "STRING", user_id)
                ]
            )
            
            query_job = self.client.query(query, job_config=job_config)
            results = list(query_job.result())
            
            if results:
                # User exists, update record
                existing_user = results[0]
                session_count = existing_user.session_count + 1
                
                update_query = f"""
                UPDATE `{self.project_id}.{self.dataset_id}.{self.user_logs_table}`
                SET 
                    username = @username,
                    last_login = @last_login,
                    session_count = @session_count
                """
                
                # Add optional fields if provided
                if email:
                    update_query += ", email = @email"
                if user_agent:
                    update_query += ", user_agent = @user_agent"
                if ip_address:
                    update_query += ", ip_address = @ip_address"
                if metadata:
                    update_query += ", metadata = @metadata"
                
                update_query += " WHERE user_id = @user_id"
                
                params = [
                    bigquery.ScalarQueryParameter("username", "STRING", username),
                    bigquery.ScalarQueryParameter("last_login", "TIMESTAMP", current_time),
                    bigquery.ScalarQueryParameter("session_count", "INTEGER", session_count),
                    bigquery.ScalarQueryParameter("user_id", "STRING", user_id)
                ]
                
                if email:
                    params.append(bigquery.ScalarQueryParameter("email", "STRING", email))
                if user_agent:
                    params.append(bigquery.ScalarQueryParameter("user_agent", "STRING", user_agent))
                if ip_address:
                    params.append(bigquery.ScalarQueryParameter("ip_address", "STRING", ip_address))
                if metadata:
                    params.append(bigquery.ScalarQueryParameter("metadata", "JSON", metadata_json))
                
                job_config = bigquery.QueryJobConfig(query_parameters=params)
                update_job = self.client.query(update_query, job_config=job_config)
                update_job.result()
                
            else:
                # New user, insert record
                row = {
                    "user_id": user_id,
                    "username": username,
                    "first_login": current_time,
                    "last_login": current_time,
                    "session_count": 1
                }
                
                # Add optional fields if provided
                if email:
                    row["email"] = email
                if user_agent:
                    row["user_agent"] = user_agent
                if ip_address:
                    row["ip_address"] = ip_address
                if metadata:
                    row["metadata"] = metadata_json
                
                # Insert row
                table_ref = self.client.dataset(self.dataset_id).table(self.user_logs_table)
                errors = self.client.insert_rows_json(table_ref, [row])
                
                if errors:
                    logger.error(f"Errors inserting user log: {errors}")
                    return False
            
            # Log the system event
            event_type = "new_user_created" if is_new_user else "user_login"
            self.log_system_event(
                level="INFO",
                component="user_service",
                message=f"User {event_type}: {username}",
                details={"user_id": user_id, "event_type": event_type}
            )
                
            return True
            
        except Exception as e:
            logger.error(f"Error logging user activity: {e}")
            return False
    
    def log_conversation(
        self,
        conversation_id: str,
        user_id: str,
        title: Optional[str] = None,
        status: str = "active",
        message_count: int = 0,
        metadata: Optional[Dict[str, Any]] = None,
        is_new: bool = True
    ) -> bool:
        """Log a conversation to BigQuery.
        
        Args:
            conversation_id: Conversation ID
            user_id: User ID
            title: Optional conversation title
            status: Conversation status
            message_count: Number of messages
            metadata: Optional additional metadata
            is_new: Whether this is a new conversation
            
        Returns:
            True if successful, False otherwise
        """
        if not self.initialized or not self.client:
            logger.warning("BigQuery Logger not initialized, skipping conversation log")
            return False
        
        try:
            current_time = datetime.datetime.now().isoformat()
            
            # Convert metadata to JSON string if provided
            metadata_json = None
            if metadata:
                metadata_json = json.dumps(metadata)
            
            if is_new:
                # New conversation, insert record
                row = {
                    "conversation_id": conversation_id,
                    "user_id": user_id,
                    "created_at": current_time,
                    "updated_at": current_time,
                    "message_count": message_count,
                    "status": status
                }
                
                # Add optional fields if provided
                if title:
                    row["title"] = title
                if metadata:
                    row["metadata"] = metadata_json
                
                # Insert row
                table_ref = self.client.dataset(self.dataset_id).table(self.conversation_logs_table)
                errors = self.client.insert_rows_json(table_ref, [row])
                
                if errors:
                    logger.error(f"Errors inserting conversation log: {errors}")
                    return False
            else:
                # Update existing conversation
                update_query = f"""
                UPDATE `{self.project_id}.{self.dataset_id}.{self.conversation_logs_table}`
                SET 
                    updated_at = @updated_at,
                    message_count = @message_count,
                    status = @status
                """
                
                # Add optional fields if provided
                if title:
                    update_query += ", title = @title"
                if metadata:
                    update_query += ", metadata = @metadata"
                
                update_query += " WHERE conversation_id = @conversation_id"
                
                params = [
                    bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", current_time),
                    bigquery.ScalarQueryParameter("message_count", "INTEGER", message_count),
                    bigquery.ScalarQueryParameter("status", "STRING", status),
                    bigquery.ScalarQueryParameter("conversation_id", "STRING", conversation_id)
                ]
                
                if title:
                    params.append(bigquery.ScalarQueryParameter("title", "STRING", title))
                if metadata:
                    params.append(bigquery.ScalarQueryParameter("metadata", "JSON", metadata_json))
                
                job_config = bigquery.QueryJobConfig(query_parameters=params)
                update_job = self.client.query(update_query, job_config=job_config)
                update_job.result()
            
            # Log the system event
            event_type = "conversation_created" if is_new else "conversation_updated"
            self.log_system_event(
                level="INFO",
                component="conversation_service",
                message=f"Conversation {event_type}: {conversation_id}",
                details={"conversation_id": conversation_id, "user_id": user_id, "event_type": event_type}
            )
                
            return True
            
        except Exception as e:
            logger.error(f"Error logging conversation: {e}")
            return False
    
    def log_message(
        self,
        message_id: str,
        conversation_id: str,
        role: str,
        content: Union[str, Dict[str, Any], List[Dict[str, Any]]],
        token_count: Optional[int] = None,
        duration_ms: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Log a message to BigQuery.
        
        Args:
            message_id: Message ID
            conversation_id: Conversation ID
            role: Message role (user, assistant, system)
            content: Message content (string or structured content)
            token_count: Optional token count
            duration_ms: Optional processing duration in milliseconds
            metadata: Optional additional metadata
            
        Returns:
            True if successful, False otherwise
        """
        if not self.initialized or not self.client:
            logger.warning("BigQuery Logger not initialized, skipping message log")
            return False
        
        try:
            current_time = datetime.datetime.now().isoformat()
            
            # Prepare content based on type
            content_text = None
            content_json = None
            
            if isinstance(content, str):
                content_text = content
            else:
                content_json = json.dumps(content)
            
            # Convert metadata to JSON string if provided
            metadata_json = None
            if metadata:
                metadata_json = json.dumps(metadata)
            
            # Prepare row data
            row = {
                "message_id": message_id,
                "conversation_id": conversation_id,
                "timestamp": current_time,
                "role": role
            }
            
            # Add optional fields if provided
            if content_text:
                row["content_text"] = content_text
            if content_json:
                row["content_json"] = content_json
            if token_count is not None:
                row["token_count"] = token_count
            if duration_ms is not None:
                row["duration_ms"] = duration_ms
            if metadata:
                row["metadata"] = metadata_json
            
            # Insert row
            table_ref = self.client.dataset(self.dataset_id).table(self.message_logs_table)
            errors = self.client.insert_rows_json(table_ref, [row])
            
            if errors:
                logger.error(f"Errors inserting message log: {errors}")
                return False
            
            # Update conversation message count and updated_at
            update_query = f"""
            UPDATE `{self.project_id}.{self.dataset_id}.{self.conversation_logs_table}`
            SET 
                updated_at = @updated_at,
                message_count = message_count + 1
            WHERE conversation_id = @conversation_id
            """
            
            params = [
                bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", current_time),
                bigquery.ScalarQueryParameter("conversation_id", "STRING", conversation_id)
            ]
            
            job_config = bigquery.QueryJobConfig(query_parameters=params)
            update_job = self.client.query(update_query, job_config=job_config)
            update_job.result()
                
            return True
            
        except Exception as e:
            logger.error(f"Error logging message: {e}")
            return False
    
    def log_tool_execution(
        self,
        tool_id: str,
        session_id: str,
        tool_name: str,
        arguments: Dict[str, Any],
        success: bool,
        execution_time_ms: Optional[int] = None,
        error_message: Optional[str] = None,
        result: Optional[Dict[str, Any]] = None,
        conversation_id: Optional[str] = None
    ) -> bool:
        """Log a tool execution to BigQuery.
        
        Args:
            tool_id: Tool execution ID
            session_id: Session ID
            tool_name: Tool name
            arguments: Tool arguments
            success: Whether the execution was successful
            execution_time_ms: Optional execution time in milliseconds
            error_message: Optional error message if execution failed
            result: Optional result data
            conversation_id: Optional conversation ID
            
        Returns:
            True if successful, False otherwise
        """
        if not self.initialized or not self.client:
            logger.warning("BigQuery Logger not initialized, skipping tool execution log")
            return False
        
        try:
            current_time = datetime.datetime.now().isoformat()
            
            # Convert arguments and result to JSON strings
            arguments_json = json.dumps(arguments)
            result_json = None
            if result:
                result_json = json.dumps(result)
            
            # Prepare row data
            row = {
                "tool_id": tool_id,
                "session_id": session_id,
                "timestamp": current_time,
                "tool_name": tool_name,
                "arguments": arguments_json,
                "success": success
            }
            
            # Add optional fields if provided
            if conversation_id:
                row["conversation_id"] = conversation_id
            if execution_time_ms is not None:
                row["execution_time_ms"] = execution_time_ms
            if error_message:
                row["error_message"] = error_message
            if result:
                row["result"] = result_json
            
            # Insert row
            table_ref = self.client.dataset(self.dataset_id).table(self.tool_logs_table)
            errors = self.client.insert_rows_json(table_ref, [row])
            
            if errors:
                logger.error(f"Errors inserting tool execution log: {errors}")
                return False
            
            # Log the system event
            level = "INFO" if success else "ERROR"
            message = f"Tool execution: {tool_name}"
            if not success and error_message:
                message += f" - Error: {error_message}"
                
            self.log_system_event(
                level=level,
                component="tool_service",
                message=message,
                session_id=session_id,
                details={
                    "tool_id": tool_id,
                    "tool_name": tool_name,
                    "success": success,
                    "conversation_id": conversation_id
                }
            )
                
            return True
            
        except Exception as e:
            logger.error(f"Error logging tool execution: {e}")
            return False