import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import adminRouter from "./admin";
import auditRouter from "./audit";
import interactionsRouter from "./interactions";
import policiesRouter from "./policies";
import aiRouter from "./ai";
import demoRouter from "./demo";
import exportRouter from "./export";
import webhooksRouter from "./webhooks";
const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(auditRouter);
router.use(interactionsRouter);
router.use(policiesRouter);
router.use(aiRouter);
router.use(demoRouter);
router.use(exportRouter);
router.use(webhooksRouter);

export default router;
