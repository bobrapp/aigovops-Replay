import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import adminRouter from "./admin";
import interactionsRouter from "./interactions";
import policiesRouter from "./policies";
import aiRouter from "./ai";
const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(interactionsRouter);
router.use(policiesRouter);
router.use(aiRouter);

export default router;
