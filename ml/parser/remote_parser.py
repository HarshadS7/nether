import httpx
import logging
from models.schemas import ParseResult, FunctionInfo, ClassInfo, ApiEndpoint, CallerCallee
from .base_parser import BaseParser
import hashlib

logger = logging.getLogger(__name__)

class RemoteBackendParser(BaseParser):
    """
    Parser that delegates AST parsing to the Node.js backend to ensure 100% accuracy 
    and avoid split-brain parsing problems.
    """
    
    def __init__(self, backend_url: str = "http://localhost:3000"):
        self.backend_url = backend_url

    def parse(self, file_name: str, code: str) -> ParseResult:
        language = self._detect_language(file_name)
        
        try:
            # Make HTTP request to the Node.js backend
            with httpx.Client(timeout=10.0) as client:
                response = client.post(
                    f"{self.backend_url}/parse",
                    json={
                        "code": code,
                        "language": language,
                        "file_name": file_name
                    }
                )
                response.raise_for_status()
                data = response.json()
                
                if not data.get("success"):
                    logger.error(f"Backend parsing failed: {data.get('error')}")
                    return self._fallback_parse(file_name, language)
                    
                result = data["parse_result"]
                return self._map_to_schema(file_name, language, code, result)
                
        except Exception as e:
            logger.error(f"Failed to reach backend parser: {e}")
            return self._fallback_parse(file_name, language)

    def _map_to_schema(self, file_name: str, language: str, code: str, result: dict) -> ParseResult:
        """Map the backend JSON object to our Python Pydantic models."""
        
        # 1. Map Functions
        functions = []
        for f in result.get("functions", []):
            if not f.get("name"):
                continue
            
            # Simple hash for body changes detection (fallback since backend doesn't return body)
            fake_body = f"{f['name']}:{f.get('line')}:{f.get('endLine')}"
            body_hash = hashlib.md5(fake_body.encode()).hexdigest()
            
            functions.append(FunctionInfo(
                name=f["name"],
                parameters=f.get("params", []),
                return_type=f.get("returnType", "unknown"),
                start_line=f.get("line") or 0,
                end_line=f.get("endLine") or 0,
                body_hash=body_hash
            ))
            
        # 2. Map Classes
        classes = []
        for c in result.get("classes", []):
            if not c.get("name"):
                continue
            methods = [m["name"] for m in c.get("methods", []) if m.get("name")]
            bases = [c["superClass"]] if c.get("superClass") else []
            classes.append(ClassInfo(
                name=c["name"],
                methods=methods,
                bases=bases,
                start_line=c.get("line") or 0,
                end_line=c.get("endLine") or 0
            ))
            
        # 3. Map Imports
        imports = []
        for i in result.get("imports", []):
            if i.get("source"):
                imports.append(i["source"])
                
        # 4. Map Calls (Backend returns objects {name, line}, Python expects list of names)
        calls = list({c["name"] for c in result.get("calls", []) if c.get("name")})
        
        # 5. Map API Endpoints
        endpoints = []
        for e in result.get("endpoints", []):
            if e.get("method") and e.get("path"):
                endpoints.append(ApiEndpoint(
                    method=e["method"],
                    path=e["path"],
                    handler=e.get("handler", f"{e['method']}_{e['path'].replace('/','_')}")
                ))
                
        # 6. Caller-Callee Pairs (Backend doesn't natively do this well yet, so we rough it out)
        # For now, we leave it empty or map it if the backend grows that feature
        caller_callee = []
        for pair in result.get("caller_callee_pairs", []):
             caller_callee.append(CallerCallee(
                 caller=pair["caller"],
                 callee=pair["callee"]
             ))

        return ParseResult(
            file_name=file_name,
            language=language,
            functions=functions,
            classes=classes,
            calls=calls,
            imports=imports,
            api_endpoints=endpoints,
            caller_callee_pairs=caller_callee
        )
        
    def _fallback_parse(self, file_name: str, language: str) -> ParseResult:
        return ParseResult(file_name=file_name, language=language)
