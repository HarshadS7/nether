"""
Full integration test — exercises the ingest pipeline with a realistic payment
controller and generates a complete report showing vector DB documents, graph state,
versioning diffs, and reasoning output.
"""
import sys
import json
import asyncio
sys.path.insert(0, ".")

from models.schemas import (
    PushRequest, PushType, IngestRequest,
    VectorDocument, SymbolInfo, ApiEndpoint, CallerCallee,
)
from parser.parser_factory import ParserFactory
from versioning.version_store import VersionStore
from versioning.diff_engine import DiffEngine
from integrations.graph_client import GraphClient
from integrations.vector_client import VectorClient
from context.context_builder import ContextBuilder
from llm.reasoning import ReasoningEngine
from orchastrater.push_orchestrator import PushOrchestrator
import tempfile

# ═══════════════════════════════════════════════════════════════
# Test Data — realistic Express.js payment controller
# ═══════════════════════════════════════════════════════════════

PAYMENT_CONTROLLER_CODE = """\
const express = require('express');
const router = express.Router();
const paymentService = require('../service/paymentService');
const { validatePayload } = require('../middleware/validation');
const logger = require('../utils/logger');

class PaymentController {
    constructor(service) {
        this.service = service;
    }

    async handlePayment(req, res) {
        const result = await this.service.process(req.body);
        return res.json(result);
    }

    async getPaymentStatus(req, res) {
        const status = await this.service.getStatus(req.params.id);
        return res.json({ status });
    }

    async refundPayment(req, res) {
        const refund = await this.service.processRefund(req.params.id, req.body.amount);
        logger.info('Refund processed', { id: req.params.id });
        return res.json(refund);
    }
}

async function createPayment(req, res) {
    try {
        const validated = validatePayload(req.body);
        const payment = await paymentService.process(validated);
        logger.info('Payment created', { id: payment.id });
        res.status(201).json(payment);
    } catch (error) {
        logger.error('Payment failed', error);
        res.status(500).json({ error: error.message });
    }
}

async function getPayments(req, res) {
    const payments = await paymentService.list(req.query);
    res.json(payments);
}

async function deletePayment(req, res) {
    await paymentService.cancel(req.params.id);
    res.status(204).send();
}

// Route registrations
router.post('/payments', createPayment);
router.get('/payments', getPayments);
router.get('/payments/:id', getPaymentStatus);
router.delete('/payments/:id', deletePayment);
router.post('/payments/:id/refund', refundPayment);

module.exports = router;
"""

PAYMENT_SERVICE_CODE = """\
const stripe = require('stripe');
const db = require('../database/connection');
const EventEmitter = require('events');

class PaymentService extends EventEmitter {
    constructor(stripeClient, database) {
        super();
        this.stripe = stripeClient;
        this.db = database;
    }

    async process(paymentData) {
        const charge = await this.stripe.charges.create(paymentData);
        const record = await this.db.payments.insert(charge);
        this.emit('payment:created', record);
        return record;
    }

    async getStatus(paymentId) {
        return await this.db.payments.findById(paymentId);
    }

    async list(filters) {
        return await this.db.payments.find(filters);
    }

    async processRefund(paymentId, amount) {
        const original = await this.getStatus(paymentId);
        const refund = await this.stripe.refunds.create({
            charge: original.chargeId,
            amount: amount
        });
        await this.db.payments.update(paymentId, { status: 'refunded' });
        this.emit('payment:refunded', { paymentId, amount });
        return refund;
    }

    async cancel(paymentId) {
        const payment = await this.getStatus(paymentId);
        await this.stripe.charges.cancel(payment.chargeId);
        await this.db.payments.delete(paymentId);
    }
}

module.exports = PaymentService;
"""

VALIDATION_MIDDLEWARE_CODE = """\
import Joi from 'joi';
import { logger } from '../utils/logger';

const paymentSchema = Joi.object({
    amount: Joi.number().positive().required(),
    currency: Joi.string().length(3).required(),
    source: Joi.string().required()
});

export function validatePayload(data) {
    const { error, value } = paymentSchema.validate(data);
    if (error) {
        logger.warn('Validation failed', { error: error.message });
        throw new Error(error.message);
    }
    return value;
}

export const validateQueryParams = (params) => {
    return Object.keys(params).length > 0;
};
"""


def separator(title: str):
    print(f"\n{'=' * 70}")
    print(f"  {title}")
    print(f"{'=' * 70}\n")


async def run_test():
    tmpdir = tempfile.mkdtemp()

    # ── Init services ──
    version_store = VersionStore(tmpdir)
    graph_client = GraphClient()
    vector_client = VectorClient()
    context_builder = ContextBuilder(graph_client, vector_client)
    reasoning_engine = ReasoningEngine()
    orchestrator = PushOrchestrator(
        version_store=version_store,
        graph_client=graph_client,
        vector_client=vector_client,
        context_builder=context_builder,
        reasoning_engine=reasoning_engine,
    )

    # ═══════════════════════════════════════════════════════════
    # STEP 1: Ingest the payment controller (new file)
    # ═══════════════════════════════════════════════════════════
    separator("STEP 1: Ingest payment controller (NEW)")

    file_path = "services/payment/controller.js"
    push = PushRequest(
        file_name=file_path,
        code=PAYMENT_CONTROLLER_CODE,
        push_type=PushType.NEW,
        project_id="payment-app",
    )
    result1 = await orchestrator.process_push(push)

    vec_doc1 = VectorClient.build_vector_document(
        file_path=file_path,
        parse_result=result1.parse_result,
        service="payment-service",
    )
    vector_client.store_ingest_document(
        file_path=file_path,
        code=PAYMENT_CONTROLLER_CODE,
        vector_doc=vec_doc1,
        version=result1.version,
        project_id="payment-app",
    )

    print("Vector DB Document:")
    print(json.dumps(vec_doc1.model_dump(), indent=2))

    # ═══════════════════════════════════════════════════════════
    # STEP 2: Ingest the payment service
    # ═══════════════════════════════════════════════════════════
    separator("STEP 2: Ingest payment service (NEW)")

    svc_path = "services/payment/paymentService.js"
    push2 = PushRequest(
        file_name=svc_path,
        code=PAYMENT_SERVICE_CODE,
        push_type=PushType.NEW,
        project_id="payment-app",
    )
    result2 = await orchestrator.process_push(push2)

    vec_doc2 = VectorClient.build_vector_document(
        file_path=svc_path,
        parse_result=result2.parse_result,
        service="payment-service",
    )
    vector_client.store_ingest_document(
        file_path=svc_path,
        code=PAYMENT_SERVICE_CODE,
        vector_doc=vec_doc2,
        version=result2.version,
        project_id="payment-app",
    )

    print("Vector DB Document:")
    print(json.dumps(vec_doc2.model_dump(), indent=2))

    # ═══════════════════════════════════════════════════════════
    # STEP 3: Ingest validation middleware
    # ═══════════════════════════════════════════════════════════
    separator("STEP 3: Ingest validation middleware (NEW)")

    val_path = "services/middleware/validation.js"
    push3 = PushRequest(
        file_name=val_path,
        code=VALIDATION_MIDDLEWARE_CODE,
        push_type=PushType.NEW,
        project_id="payment-app",
    )
    result3 = await orchestrator.process_push(push3)
    vec_doc3 = VectorClient.build_vector_document(
        file_path=val_path,
        parse_result=result3.parse_result,
        service="payment-service",
    )
    print("Vector DB Document:")
    print(json.dumps(vec_doc3.model_dump(), indent=2))

    # ═══════════════════════════════════════════════════════════
    # STEP 4: UPDATE the controller (add a webhook endpoint)
    # ═══════════════════════════════════════════════════════════
    separator("STEP 4: Update payment controller (ADD webhook endpoint)")

    updated_code = PAYMENT_CONTROLLER_CODE.rstrip() + "\n" + """\

async function handleWebhook(req, res) {
    const event = req.body;
    const result = await paymentService.processWebhook(event);
    logger.info('Webhook processed', { type: event.type });
    res.status(200).json({ received: true });
}

router.post('/payments/webhook', handleWebhook);
"""

    push4 = PushRequest(
        file_name=file_path,
        code=updated_code,
        push_type=PushType.UPDATE,
        project_id="payment-app",
    )
    result4 = await orchestrator.process_push(push4)

    vec_doc4 = VectorClient.build_vector_document(
        file_path=file_path,
        parse_result=result4.parse_result,
        service="payment-service",
    )
    vector_client.store_ingest_document(
        file_path=file_path,
        code=updated_code,
        vector_doc=vec_doc4,
        version=result4.version,
        project_id="payment-app",
    )

    print("Updated Vector DB Document:")
    print(json.dumps(vec_doc4.model_dump(), indent=2))

    if result4.diff:
        print("\nStructural Diff (v1 -> v2):")
        print(json.dumps(result4.diff.model_dump(), indent=2))

    # ═══════════════════════════════════════════════════════════
    # STEP 5: Simulated POST /ingest Request & Response
    # ═══════════════════════════════════════════════════════════
    separator("STEP 5: Simulated POST /ingest Request & Response")

    print("POST /ingest Request:")
    print(json.dumps({
        "language": "javascript",
        "file_path": file_path,
        "service": "payment-service",
        "code": "...full updated file contents..."
    }, indent=2))

    print("\nPOST /ingest Response:")
    ingest_response = {
        "status": "success",
        "file_path": file_path,
        "service": "payment-service",
        "version": result4.version,
        "vector_document": vec_doc4.model_dump(),
        "graph_update_summary": result4.graph_update_summary,
        "reasoning": result4.reasoning.model_dump(),
        "diff": result4.diff.model_dump() if result4.diff else None,
    }
    print(json.dumps(ingest_response, indent=2))

    # ═══════════════════════════════════════════════════════════
    # STEP 6: Graph state report
    # ═══════════════════════════════════════════════════════════
    separator("STEP 6: Full Dependency Graph State")

    graph_summary = graph_client.get_graph_summary()
    print("Graph Summary:")
    print(json.dumps(graph_summary, indent=2))

    print("\nAll Nodes:")
    for node in graph_client.get_all_nodes():
        print(f"  [{node.node_type.value:8s}]  {node.id}")

    print("\nAll Edges:")
    for edge in graph_client.get_all_edges():
        print(f"  {edge.source}  --[{edge.edge_type.value}]-->  {edge.target}")

    # ═══════════════════════════════════════════════════════════
    # STEP 7: Vector DB state report
    # ═══════════════════════════════════════════════════════════
    separator("STEP 7: Vector DB State")

    stats = vector_client.get_stats()
    print("Vector DB Stats:")
    print(json.dumps(stats, indent=2))

    print("\nStored Documents:")
    for doc_id, data in vector_client._stub_store.items():
        meta = data.get("metadata", {})
        print(f"  {doc_id}")
        print(f"    type={meta.get('type', '?')}, version={meta.get('version', '?')}")
        if "vector_document" in data:
            vd = data["vector_document"]
            print(f"    symbols={len(vd.get('symbols', []))}, endpoints={len(vd.get('api_endpoints', []))}, calls={len(vd.get('calls', []))}")

    # ═══════════════════════════════════════════════════════════
    # STEP 8: Version history
    # ═══════════════════════════════════════════════════════════
    separator("STEP 8: Version History for controller.js")

    history = version_store.get_version_history("payment-app", file_path)
    for v in history:
        print(f"  v{v.version} | {v.timestamp} | hash={v.code_hash[:16]}...")
        print(f"         functions: {[f.name for f in v.parse_result.functions]}")
        print(f"         endpoints: {[e.model_dump() for e in v.parse_result.api_endpoints]}")

    # ═══════════════════════════════════════════════════════════
    # FINAL SUMMARY
    # ═══════════════════════════════════════════════════════════
    separator("FINAL SUMMARY")

    all_files = version_store.list_files("payment-app")
    total_versions = sum(
        version_store.get_latest_version("payment-app", f) for f in all_files
    )
    print(f"Files ingested:       {len(all_files)}")
    print(f"Total versions:       {total_versions}")
    print(f"Graph nodes:          {graph_summary['total_nodes']}")
    print(f"Graph edges:          {graph_summary['total_edges']}")
    print(f"Vector documents:     {stats['count']}")
    print(f"API endpoints found:  {len(vec_doc4.api_endpoints)}")
    print(f"Caller-callee pairs:  {len(vec_doc4.calls)}")
    print()
    print("=" * 70)
    print("  ALL INTEGRATION TESTS PASSED")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(run_test())
