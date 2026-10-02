import requests
from typing import Dict, Any

from config import Config
from models.execution import ExecutionRequest, ExecutionResponse


class JDoodleService:
    """Service handling interactions with the JDoodle Compiler API."""

    @staticmethod
    def execute_code(request: ExecutionRequest) -> ExecutionResponse:
        """
        Submits source code and stdin input to JDoodle API,
        processes execution results, and returns a normalized ExecutionResponse.
        """
        # 1. Validate & Map Language
        try:
            lang_config = Config.get_language_config(request.language)
        except ValueError as ve:
            return ExecutionResponse.error("Invalid Request", str(ve))

        # 2. Check Credentials (NEVER print or expose Client Secret)
        client_id = Config.JDOODLE_CLIENT_ID
        client_secret = Config.JDOODLE_CLIENT_SECRET

        if not client_id or not client_secret:
            return ExecutionResponse.error(
                "Server Error",
                "JDoodle API credentials are not configured. Please set JDOODLE_CLIENT_ID and JDOODLE_CLIENT_SECRET in backend/.env file."
            )

        # 3. Construct Request Payload
        payload = {
            "clientId": client_id,
            "clientSecret": client_secret,
            "script": request.source_code,
            "stdin": request.stdin or "",
            "language": lang_config["language"],
            "versionIndex": lang_config["versionIndex"]
        }

        headers = {
            "Content-Type": "application/json"
        }

        # 4. Send POST Request to JDoodle Execute API Endpoint
        try:
            response = requests.post(Config.JDOODLE_API_URL, json=payload, headers=headers, timeout=15)

            if response.status_code in (401, 403):
                return ExecutionResponse.error(
                    "Server Error",
                    "JDoodle API Authentication failed (401/403). Please verify JDOODLE_CLIENT_ID and JDOODLE_CLIENT_SECRET."
                )

            if response.status_code == 429:
                return ExecutionResponse.error(
                    "Server Error",
                    "JDoodle API daily execution limit reached."
                )

            if response.status_code != 200:
                return ExecutionResponse.error(
                    "Server Error",
                    f"JDoodle API HTTP Error ({response.status_code})."
                )

            data = response.json()
            return JDoodleService._map_jdoodle_response(data)

        except requests.exceptions.Timeout:
            return ExecutionResponse.error("Time Limit Exceeded", "Request to JDoodle execution service timed out.")
        except requests.exceptions.RequestException as re:
            return ExecutionResponse.error("Server Error", "Failed to connect to JDoodle execution service.")
        except Exception as e:
            return ExecutionResponse.error("Server Error", "An unexpected error occurred during execution.")

    @staticmethod
    def _map_jdoodle_response(data: Dict[str, Any]) -> ExecutionResponse:
        """Convert JDoodle response payload into normalized ExecutionResponse format."""
        status_code = data.get("statusCode")
        output = data.get("output") or ""
        error_msg = data.get("error")
        cpu_time = data.get("cpuTime")
        memory_used = data.get("memory")

        # Handle unauthorized status returned inside JSON payload
        if status_code in (401, 403) or error_msg == "Unauthorized":
            return ExecutionResponse.error(
                "Server Error",
                "JDoodle API Authentication failed. Please verify JDOODLE_CLIENT_ID and JDOODLE_CLIENT_SECRET in backend/.env."
            )

        if status_code == 429:
            return ExecutionResponse.error(
                "Server Error",
                "JDoodle API daily limit reached."
            )

        # Parse memory and time metrics safely
        execution_time = str(cpu_time) if cpu_time is not None else None
        memory = None
        if memory_used is not None:
            try:
                memory = int(memory_used)
            except (ValueError, TypeError):
                memory = None

        # Analyze output content to map status & error logs
        output_lower = output.lower()

        # Compilation Errors (C/C++/Java compiler error output)
        is_compile_error = any(kw in output_lower for kw in [
            "error: ", "compilation error", "cannot find symbol", "expected ';'", "fatal error:"
        ]) and not ("traceback" in output_lower or "exception" in output_lower)

        # Runtime Errors (Python traceback, Java exceptions, etc.)
        is_runtime_error = any(kw in output_lower for kw in [
            "traceback (most recent call last):", "exception in thread", "segmentation fault",
            "zerodivisionerror:", "indexerror:", "keyerror:", "nullpointerexception"
        ])

        if is_compile_error:
            return ExecutionResponse(
                status="Compilation Error",
                stdout="",
                stderr="",
                compile_output=output,
                message="Code failed to compile.",
                execution_time=execution_time,
                memory=memory,
                exit_code=1
            )
        elif is_runtime_error:
            return ExecutionResponse(
                status="Runtime Error",
                stdout="",
                stderr=output,
                compile_output="",
                message="Program encountered a runtime error.",
                execution_time=execution_time,
                memory=memory,
                exit_code=1
            )
        else:
            return ExecutionResponse(
                status="Accepted",
                stdout=output,
                stderr=error_msg or "",
                compile_output="",
                message="Code executed successfully.",
                execution_time=execution_time,
                memory=memory,
                exit_code=0
            )
