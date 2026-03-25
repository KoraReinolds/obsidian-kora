/**
 * @module modules/runtime/routes/pipeline
 * @description HTTP endpoints minimal pipeline runtime для Telegram-архива.
 */

import type { Express, Request, Response } from 'express';
import {
	getPipelineRuntimeService,
	type PipelineSelection,
	type PipelineStepKey,
} from '../pipeline/index.js';

export function registerPipelineRoutes(app: Express): void {
	app.get('/pipeline/steps', (req: Request, res: Response) => {
		try {
			const service = getPipelineRuntimeService();
			res.json({ success: true, steps: service.listSteps() });
		} catch (error: any) {
			console.error('[/pipeline/steps] Error:', error);
			res.status(500).json({ success: false, error: error.message });
		}
	});

	app.get('/pipeline/runs', (req: Request, res: Response) => {
		try {
			const service = getPipelineRuntimeService();
			const { stepKey, status, chatId, limit } = req.query as {
				stepKey?: string;
				status?: string;
				chatId?: string;
				limit?: string;
			};

			const response = service.listRuns({
				stepKey: stepKey || undefined,
				status: status || undefined,
				chatId: chatId || undefined,
				limit: limit ? Number(limit) : undefined,
			});
			res.json(response);
		} catch (error: any) {
			console.error('[/pipeline/runs] Error:', error);
			res.status(500).json({ success: false, error: error.message });
		}
	});

	app.get('/pipeline/runs/:runId', (req: Request, res: Response) => {
		try {
			const service = getPipelineRuntimeService();
			const runId = Number(req.params.runId);
			if (!Number.isFinite(runId) || runId <= 0) {
				return res
					.status(400)
					.json({ success: false, error: 'runId is invalid' });
			}

			const run = service.getRun(runId);
			if (!run) {
				return res.status(404).json({ success: false, error: 'Run not found' });
			}

			res.json({ success: true, run });
		} catch (error: any) {
			console.error('[/pipeline/runs/:runId] Error:', error);
			res.status(500).json({ success: false, error: error.message });
		}
	});

	app.get('/pipeline/runs/:runId/artifacts', (req: Request, res: Response) => {
		try {
			const service = getPipelineRuntimeService();
			const runId = Number(req.params.runId);
			if (!Number.isFinite(runId) || runId <= 0) {
				return res
					.status(400)
					.json({ success: false, error: 'runId is invalid' });
			}

			const run = service.getRun(runId);
			if (!run) {
				return res.status(404).json({ success: false, error: 'Run not found' });
			}

			res.json({ success: true, run, artifacts: run.artifacts || [] });
		} catch (error: any) {
			console.error('[/pipeline/runs/:runId/artifacts] Error:', error);
			res.status(500).json({ success: false, error: error.message });
		}
	});

	app.get('/pipeline/artifacts/:artifactId', (req: Request, res: Response) => {
		try {
			const service = getPipelineRuntimeService();
			const artifactId = Number(req.params.artifactId);
			if (!Number.isFinite(artifactId) || artifactId <= 0) {
				return res
					.status(400)
					.json({ success: false, error: 'artifactId is invalid' });
			}

			const artifact = service.getArtifact(artifactId);
			if (!artifact) {
				return res
					.status(404)
					.json({ success: false, error: 'Artifact not found' });
			}

			res.json({ success: true, artifact });
		} catch (error: any) {
			console.error('[/pipeline/artifacts/:artifactId] Error:', error);
			res.status(500).json({ success: false, error: error.message });
		}
	});

	app.post('/pipeline/runs', async (req: Request, res: Response) => {
		try {
			const service = getPipelineRuntimeService();
			const { stepKey, selection, options } = req.body || {};

			if (!stepKey || typeof stepKey !== 'string') {
				return res
					.status(400)
					.json({ success: false, error: 'stepKey is required' });
			}
			if (!selection || typeof selection !== 'object') {
				return res
					.status(400)
					.json({ success: false, error: 'selection is required' });
			}

			const request = {
				stepKey: stepKey as PipelineStepKey,
				selection: selection as PipelineSelection,
				options: options && typeof options === 'object' ? options : undefined,
			};

			const response = await service.runStep(request);
			res.json(response);
		} catch (error: any) {
			console.error('[/pipeline/runs POST] Error:', error);
			res.status(500).json({ success: false, error: error.message });
		}
	});
}
