from dataclasses import dataclass
from typing import Optional, Dict, Any

@dataclass
class ExecutionRequest:
    """Dataclass representing incoming frontend execution request."""
    language: str
    source_code: str
    stdin: str = ""

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ExecutionRequest":
        """Construct ExecutionRequest from JSON dict safely."""
        if not isinstance(data, dict):
            raise ValueError("Request body must be a valid JSON object.")
        
        lang = data.get("language")
        source = data.get("sourceCode") or data.get("source_code")
        stdin = data.get("stdin", "")

        return cls(
            language=str(lang) if lang is not None else "",
            source_code=str(source) if source is not None else "",
            stdin=str(stdin) if stdin is not None else ""
        )

    def validate(self) -> tuple[bool, Optional[str]]:
        """Validate execution request data."""
        if not self.language or not self.language.strip():
            return False, "Language parameter is required."
        if not self.source_code or not self.source_code.strip():
            return False, "Please enter some code."
        return True, None


@dataclass
class ExecutionResponse:
    """Dataclass representing outgoing execution response to frontend."""
    status: str
    stdout: str = ""
    stderr: str = ""
    compile_output: str = ""
    message: str = ""
    execution_time: Optional[str] = None
    memory: Optional[int] = None
    exit_code: Optional[int] = None

    @classmethod
    def error(cls, status: str, message: str) -> "ExecutionResponse":
        """Factory method for creating clean error responses."""
        return cls(
            status=status,
            message=message,
            stderr=message
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert response object to dictionary matching frontend contract."""
        return {
            "status": self.status,
            "stdout": self.stdout or "",
            "stderr": self.stderr or "",
            "compileOutput": self.compile_output or "",
            "message": self.message or "",
            "executionTime": self.execution_time,
            "memory": self.memory,
            "exitCode": self.exit_code
        }
