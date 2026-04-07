"""
Push orchestrator — controls the full workflow for every code push.

This is the conductor. It does NOT contain parsing logic, LLM logic,
or database logic. It coordinates modules in the correct order.

Flow:
  1. Validate push
  2. Fetch previous version (if exists)
  3. Parse code (deterministic)
  4. Extract dependencies
  5. Compute diff (for updates)
  6. Sync graph (remove old edges, insert new)
  7. Store embeddings (vector DB)
  8. Build structured LLM context
  9. Run reasoning modules (LLM)
  10. Store new version
  11. Return structured output
"""

import logging
from typing import Optional

from models.schemas import (
    PushRequest,
    PushResponse,
    PushType,
    ParseResult,
    DiffResult,
    ReasoningOutput,
)
from parser import ParserFactory
from versioning.version_store import VersionStore
from versioning.diff_engine import DiffEngine
from integrations.graph_client import GraphClient
from integrations.vector_client import VectorClient
from context.context_builder import ContextBuilder
from llm.reasoning import ReasoningEngine

logger = logging.getLogger(__name__)


class PushOrchestrator:
    """
    Orchestrates the complete push processing pipeline.

    Stateless per request — all state is in the injected services.
    """

    def __init__(
        self,
        version_store: VersionStore,
        graph_client: GraphClient,
        vector_client: VectorClient,
        context_builder: ContextBuilder,
        reasoning_engine: ReasoningEngine,
    ):
        self.version_store = version_store
        self.graph = graph_client
        self.vector = vector_client
        self.context = context_builder
        self.reasoning = reasoning_engine

    async def process_push(self, push: PushRequest) -> PushResponse:
        """
        Process a single code push end-to-end.

        This is the main entry point called by the API layer.
        """
        logger.info(f"Processing push: {push.file_name} ({push.push_type.value})")

        try:
            # ── Step 1: Validate ──
            self._validate(push)

            # ── Step 2: Fetch previous version (if update) ──
            previous = None
            if push.push_type == PushType.UPDATE:
                previous = self.version_store.get_latest(push.project_id, push.file_name)
                if previous is None:
                    logger.warning(
                        f"Push type is 'update' but no previous version found for "
                        f"{push.file_name}. Treating as 'new'."
                    )
                    push.push_type = PushType.NEW

            # ── Step 3: Parse code (deterministic) ──
            parse_result = ParserFactory.parse(push.file_name, push.code)
            logger.info(
                f"Parsed {push.file_name}: "
                f"{len(parse_result.functions)} functions, "
                f"{len(parse_result.classes)} classes, "
                f"{len(parse_result.imports)} imports, "
                f"{len(parse_result.calls)} calls"
            )

            # ── Step 4: Compute diff ──
            diff: Optional[DiffResult] = None
            if push.push_type == PushType.UPDATE and previous is not None:
                diff = DiffEngine.compute_diff(
                    old_parse=previous.parse_result,
                    new_parse=parse_result,
                    old_version=previous.version,
                    new_version=previous.version + 1,
                )
                logger.info(
                    f"Diff: +{len(diff.added_functions)} / "
                    f"-{len(diff.removed_functions)} / "
                    f"~{len(diff.modified_functions)} functions"
                )
            else:
                diff = DiffEngine.empty_diff(push.file_name, 1)

            # ── Step 5: Sync graph (full recompute for file) ──
            graph_update = self.graph.sync_file(push.file_name, parse_result)

            # ── Step 6: Store embeddings ──
            current_version = self.version_store.get_latest_version(
                push.project_id, push.file_name
            )
            new_version = current_version + 1

            self.vector.store_code_embedding(
                file_name=push.file_name,
                code=push.code,
                version=new_version,
                project_id=push.project_id,
            )

            # ── Step 7: Build structured context ──
            structured_ctx = self.context.build(
                file_name=push.file_name,
                code=push.code,
                push_type=push.push_type,
                parse_result=parse_result,
                diff=diff if diff and diff.has_changes else None,
                project_id=push.project_id,
            )

            # ── Step 8: Format prompt ──
            prompt = self.context.format_prompt(structured_ctx)

            # ── Step 9: Run reasoning (LLM call) ──
            reasoning_output = self.reasoning.reason(
                context=structured_ctx,
                formatted_prompt=prompt,
            )

            # ── Step 10: Store new version ──
            version_meta = self.version_store.store_version(
                project_id=push.project_id,
                file_name=push.file_name,
                code=push.code,
                parse_result=parse_result,
            )

            # ── Step 11: Store documentation embedding ──
            if reasoning_output.documentation:
                self.vector.store_doc_embedding(
                    file_name=push.file_name,
                    documentation=reasoning_output.documentation,
                    version=version_meta.version,
                    project_id=push.project_id,
                )

            # ── Build response ──
            graph_summary = {
                "nodes_added": len(graph_update.nodes_to_add),
                "edges_added": len(graph_update.edges_to_add),
                "nodes_removed": len(graph_update.nodes_to_remove),
            }

            response = PushResponse(
                file_name=push.file_name,
                push_type=push.push_type,
                version=version_meta.version,
                parse_result=parse_result,
                diff=diff if diff and diff.has_changes else None,
                reasoning=reasoning_output,
                graph_update_summary=graph_summary,
                status="success",
            )

            logger.info(
                f"Push processed successfully: {push.file_name} "
                f"v{version_meta.version} ({push.push_type.value})"
            )

            return response

        except Exception as e:
            logger.error(f"Push processing failed for {push.file_name}: {e}", exc_info=True)
            return PushResponse(
                file_name=push.file_name,
                push_type=push.push_type,
                version=0,
                parse_result=ParseResult(file_name=push.file_name, language="unknown"),
                reasoning=ReasoningOutput(
                    documentation="Processing failed.",
                    suggestions=["Check server logs for error details."],
                ),
                status="error",
                error=str(e),
            )

    def _validate(self, push: PushRequest) -> None:
        """Basic validation of the push request."""
        if not push.file_name:
            raise ValueError("file_name is required")
        if not push.code or not push.code.strip():
            raise ValueError("code cannot be empty")
        if push.push_type not in (PushType.NEW, PushType.UPDATE):
            raise ValueError(f"Invalid push_type: {push.push_type}")
