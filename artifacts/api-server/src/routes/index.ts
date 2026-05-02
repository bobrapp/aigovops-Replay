import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import interactionsRouter from "./interactions";
import policiesRouter from "./policies";
const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(interactionsRouter);
router.use(policiesRouter);

export default router;
